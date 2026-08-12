import { spawn } from "node:child_process";

import { providerTimeoutMs } from "./looplab-provider-http.mjs";
import { resolveProviderInvocation } from "./looplab-provider-status.mjs";
import { terminateProcessTree } from "./looplab-process-tree.mjs";

function boundedText(value, maximum) {
  const text = String(value ?? "");
  return text.length <= maximum ? text : text.slice(-maximum);
}

export function boundedProviderDiagnostic(stderr, stdout, maximum = 12_000) {
  const detail = String(stderr ?? "").trim() || String(stdout ?? "").trim() || "No diagnostic output";
  return detail.length <= maximum ? detail : `[diagnostic truncated to final ${maximum} characters]\n${detail.slice(-maximum)}`;
}

export function parseProviderJson(value, {
  emptyMessage = "The AI provider returned no output.",
  invalidMessage = "The AI provider did not return valid JSON.",
} = {}) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(emptyMessage);
  const candidates = [text];
  try {
    const wrapper = JSON.parse(text);
    if (typeof wrapper?.result === "string") candidates.unshift(wrapper.result);
    else if (wrapper?.result && typeof wrapper.result === "object") return wrapper.result;
    else if (wrapper && typeof wrapper === "object" && !Array.isArray(wrapper)) return wrapper;
  } catch {
    // Fenced and bounded extraction below handles provider wrappers and commentary.
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) candidates.push(fenced);
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(text.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error(invalidMessage);
}

export function runProviderProcess({
  command,
  args = [],
  input = "",
  cwd,
  timeoutMs = providerTimeoutMs(),
  timeoutLabel = "provider request",
  onStdoutLine = null,
  stdoutLimit = 2_000_000,
  stderrLimit = 200_000,
  env = process.env,
}) {
  return new Promise((resolveProcess, rejectProcess) => {
    const invocation = resolveProviderInvocation(command, args, { env });
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      env,
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let stdoutLineBuffer = "";
    let settled = false;
    let timer = null;
    let timeoutError = null;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) rejectProcess(error);
      else resolveProcess(result);
    };
    const processError = (message) => {
      const error = new Error(message);
      error.processResult = { stdout, stderr };
      return error;
    };
    const flushStdoutLines = (flushRemainder = false) => {
      if (typeof onStdoutLine !== "function") return;
      let newlineIndex = stdoutLineBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = stdoutLineBuffer.slice(0, newlineIndex).replace(/\r$/, "");
        stdoutLineBuffer = stdoutLineBuffer.slice(newlineIndex + 1);
        try { onStdoutLine(line); } catch { /* Activity reporting must not affect provider execution. */ }
        newlineIndex = stdoutLineBuffer.indexOf("\n");
      }
      if (flushRemainder && stdoutLineBuffer) {
        try { onStdoutLine(stdoutLineBuffer.replace(/\r$/, "")); } catch { /* Activity reporting must not affect provider execution. */ }
        stdoutLineBuffer = "";
      }
    };
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      const boundedTimeoutMs = Math.max(30_000, timeoutMs);
      timer = setTimeout(() => {
        timeoutError = processError(`${command} ${timeoutLabel} timed out after ${Math.round(boundedTimeoutMs / 1_000)} seconds.`);
        void terminateProcessTree(child).then(
          () => finish(timeoutError),
          () => finish(timeoutError),
        );
      }, boundedTimeoutMs);
      timer.unref?.();
    }
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = boundedText(`${stdout}${chunk}`, stdoutLimit);
      if (typeof onStdoutLine === "function") {
        stdoutLineBuffer = boundedText(`${stdoutLineBuffer}${chunk}`, stdoutLimit);
        flushStdoutLines();
      }
    });
    child.stderr.on("data", (chunk) => { stderr = boundedText(`${stderr}${chunk}`, stderrLimit); });
    child.on("error", (error) => finish(processError(error.message)));
    child.on("close", (code) => {
      flushStdoutLines(true);
      if (timeoutError) return;
      if (code === 0) finish(null, { stdout, stderr, invocation: { source: invocation.source, shell: false } });
      else finish(processError(`${command} exited with code ${code}: ${boundedProviderDiagnostic(stderr, stdout)}`));
    });
    child.stdin.end(input, "utf8");
  });
}
