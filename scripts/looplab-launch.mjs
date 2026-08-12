#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOOPLAB_PROTOCOL_VERSION } from "../lib/looplab-agent-core.mjs";
import { companionLifecycleDecision } from "../lib/looplab-companion-lifecycle.mjs";
import {
  DEFAULT_LOOPLAB_WEB_URL,
  loopLabWebServerArguments,
  normalizeLoopLabWebUrl,
  openLoopLabWeb,
  waitForLoopLabWeb,
} from "../lib/looplab-local-launch.mjs";
import {
  companionSessionHeaders,
  createCompanionSession,
  defaultCompanionSessionFile,
  readCompanionSession,
  writeCompanionSession,
} from "../lib/looplab-companion-session.mjs";

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const companionScript = join(projectDirectory, "scripts", "looplab-companion.mjs");
const vinextCli = join(projectDirectory, "node_modules", "vinext", "dist", "cli.js");
const companionUrl = `http://127.0.0.1:${Number(process.env.LOOPLAB_COMPANION_PORT ?? 4317)}`;
const companionSessionFile = process.env.LOOPLAB_COMPANION_SESSION_FILE ?? defaultCompanionSessionFile(projectDirectory);
const mode = process.argv[2] === "start" ? "start" : "dev";
const webUrl = normalizeLoopLabWebUrl(process.env.LOOPLAB_WEB_URL ?? DEFAULT_LOOPLAB_WEB_URL);
const openWhenReady = process.argv.includes("--open") && process.env.LOOPLAB_NO_OPEN !== "1" && !process.env.CI;

let companion = null;
let web = null;
let stopping = false;

function writeStatus(type, message, detail) {
  process.stdout.write(`${JSON.stringify({ type, message, ...(detail ? { detail } : {}) })}\n`);
}

async function companionHealth() {
  try {
    const response = await fetch(`${companionUrl}/health`, { signal: AbortSignal.timeout(900) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function companionIsReady() {
  return companionLifecycleDecision(await companionHealth(), LOOPLAB_PROTOCOL_VERSION).action === "reuse";
}

async function retireStaleCompanion(health, session = null) {
  const response = await fetch(`${companionUrl}/lifecycle/shutdown`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...companionSessionHeaders(session) },
    body: JSON.stringify({ expectedProtocolVersion: LOOPLAB_PROTOCOL_VERSION }),
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) {
    throw new Error(`Looplab found ${health.name} protocol ${health.protocolVersion ?? "unknown"} at ${companionUrl}, but it cannot retire itself safely. Stop that idle companion once, then restart Looplab.`);
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (!await companionHealth()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`The stale idle companion did not release ${companionUrl}.`);
}

async function waitForCompanion(child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`The managed companion exited during startup with code ${child.exitCode}.`);
    if (await companionIsReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`The managed companion did not become ready at ${companionUrl}.`);
}

function waitForExit(child, timeoutMs = 4_000) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolveExit) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", finish);
      resolveExit();
    };
    const timer = setTimeout(finish, timeoutMs);
    timer.unref?.();
    child.once("exit", finish);
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32" && Number.isInteger(child.pid)) {
    await new Promise((resolveTree) => {
      const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        shell: false,
        stdio: "ignore",
      });
      killer.once("error", () => resolveTree());
      killer.once("exit", () => resolveTree());
    });
  } else {
    child.kill("SIGTERM");
  }
  await waitForExit(child);
}

async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  await Promise.all([stopChild(web), stopChild(companion)]);
  process.exit(exitCode);
}

process.once("SIGINT", () => { void stop(0); });
process.once("SIGTERM", () => { void stop(0); });

const existingHealth = await companionHealth();
let companionSession = await readCompanionSession(companionSessionFile);
if (existingHealth?.sessionId && companionSession?.sessionId !== existingHealth.sessionId) companionSession = null;
const lifecycleDecision = companionLifecycleDecision(existingHealth, LOOPLAB_PROTOCOL_VERSION);
if (lifecycleDecision.action === "block") throw new Error(lifecycleDecision.reason);
if (lifecycleDecision.action === "replace") {
  writeStatus("companion.stale", "Looplab found an idle stale companion and will replace it", lifecycleDecision.reason);
  await retireStaleCompanion(existingHealth, companionSession);
}

if (lifecycleDecision.action === "reuse") {
  if (!companionSession || companionSession.sessionId !== existingHealth.sessionId) {
    throw new Error("Looplab found a current companion but its session credential is unavailable. Stop that companion once, then restart Looplab so the launcher can create a fresh authenticated session.");
  }
  writeStatus("companion.reused", "Looplab AI companion is already online", companionUrl);
} else {
  companionSession = createCompanionSession({ url: companionUrl });
  await writeCompanionSession(companionSessionFile, companionSession);
  const managedEnvironment = {
    ...process.env,
    LOOPLAB_COMPANION_SESSION_FILE: companionSessionFile,
    LOOPLAB_COMPANION_SESSION_ID: companionSession.sessionId,
    LOOPLAB_COMPANION_TOKEN: companionSession.token,
  };
  companion = spawn(process.execPath, [companionScript], {
    cwd: projectDirectory,
    env: managedEnvironment,
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  companion.stdout.pipe(process.stdout);
  companion.stderr.pipe(process.stderr);
  companion.once("error", (error) => {
    writeStatus("companion.failed", "Looplab AI companion could not start", error.message);
    void stop(1);
  });
  await waitForCompanion(companion);
  writeStatus("companion.managed", "Looplab is managing the AI companion", companionUrl);
}

if (openWhenReady && !companion) {
  let existingWebIsReady = false;
  try {
    await waitForLoopLabWeb({
      url: webUrl,
      protocolVersion: LOOPLAB_PROTOCOL_VERSION,
      attempts: 1,
      intervalMs: 0,
    });
    existingWebIsReady = true;
  } catch {
    // No current editor is serving this companion session; start one below.
  }
  if (existingWebIsReady) {
    try {
      await openLoopLabWeb(webUrl);
      writeStatus("web.reused", "LoopLab was already running and has been opened", webUrl);
      process.exit(0);
    } catch (error) {
      writeStatus("web.open.failed", "LoopLab is already running, but the default browser could not be opened", error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}

const webEnvironment = {
  ...process.env,
  LOOPLAB_COMPANION_URL: companionUrl,
  NEXT_PUBLIC_LOOPLAB_COMPANION_URL: companionUrl,
  LOOPLAB_COMPANION_SESSION_FILE: companionSessionFile,
  LOOPLAB_COMPANION_SESSION_ID: companionSession.sessionId,
  LOOPLAB_COMPANION_TOKEN: companionSession.token,
};
web = spawn(process.execPath, [vinextCli, ...loopLabWebServerArguments(mode, webUrl)], {
  cwd: projectDirectory,
  env: webEnvironment,
  windowsHide: true,
  shell: false,
  stdio: "inherit",
});

web.once("error", (error) => {
  writeStatus("web.failed", "Looplab web process could not start", error.message);
  void stop(1);
});

web.once("exit", (code, signal) => {
  if (stopping) return;
  writeStatus("web.stopped", "Looplab web process stopped", signal ?? String(code ?? 0));
  void stop(code ?? (signal ? 1 : 0));
});

if (companion) {
  companion.once("exit", (code, signal) => {
    if (stopping) return;
    writeStatus("companion.stopped", "Managed AI companion stopped unexpectedly", signal ?? String(code ?? 0));
    void stop(code ?? 1);
  });
}

if (openWhenReady) {
  try {
    await waitForLoopLabWeb({
      url: webUrl,
      protocolVersion: LOOPLAB_PROTOCOL_VERSION,
      stopped: () => stopping || web?.exitCode !== null,
    });
    await openLoopLabWeb(webUrl);
    writeStatus("web.opened", "LoopLab opened in the default browser", webUrl);
  } catch (error) {
    writeStatus("web.open.failed", "LoopLab could not open the default browser automatically", error instanceof Error ? error.message : String(error));
  }
}
