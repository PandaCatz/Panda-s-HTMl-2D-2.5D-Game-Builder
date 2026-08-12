import assert from "node:assert/strict";
import test from "node:test";

import { boundedProviderDiagnostic, parseProviderJson, runProviderProcess } from "../lib/looplab-provider-process.mjs";
import { terminateProcessTree } from "../lib/looplab-process-tree.mjs";

test("shared provider JSON parsing handles direct, wrapped, fenced, and bounded objects", () => {
  assert.deepEqual(parseProviderJson('{"answer":"direct"}'), { answer: "direct" });
  assert.deepEqual(parseProviderJson('{"result":"{\\"answer\\":\\"wrapped\\"}"}'), { answer: "wrapped" });
  assert.deepEqual(parseProviderJson('```json\n{"answer":"fenced"}\n```'), { answer: "fenced" });
  assert.deepEqual(parseProviderJson('prefix {"answer":"bounded"} suffix'), { answer: "bounded" });
  assert.throws(() => parseProviderJson(""), /no output/);
  assert.throws(() => parseProviderJson("nothing useful"), /valid JSON/);
});

test("shared provider diagnostics retain only the bounded tail", () => {
  assert.equal(boundedProviderDiagnostic("short", "ignored", 20), "short");
  const bounded = boundedProviderDiagnostic("prefix-0123456789", "", 8);
  assert.match(bounded, /truncated to final 8 characters/);
  assert.match(bounded, /23456789$/);
});

test("shared provider process runner preserves stdin, lines, diagnostics, and shell-free invocation", async () => {
  const lines = [];
  const result = await runProviderProcess({
    command: process.execPath,
    args: ["-e", "process.stdin.setEncoding('utf8');let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{console.log('first');console.log(s)})"],
    input: "second",
    cwd: process.cwd(),
    onStdoutLine: (line) => lines.push(line),
  });
  assert.deepEqual(lines, ["first", "second"]);
  assert.equal(result.invocation.shell, false);
  assert.match(result.stdout, /first\r?\nsecond/);

  await assert.rejects(
    runProviderProcess({ command: process.execPath, args: ["-e", "process.stderr.write('bounded failure');process.exit(7)"], cwd: process.cwd() }),
    (error) => error.processResult?.stderr === "bounded failure" && /exited with code 7/.test(error.message),
  );
});

test("Windows process-tree termination uses taskkill with descendant and force flags", async () => {
  const calls = [];
  const fakeTerminator = {
    once(event, handler) {
      if (event === "close") queueMicrotask(() => handler(0));
      return this;
    },
  };
  const child = { pid: 4317, exitCode: null, kill: () => { throw new Error("fallback should not run"); } };
  const result = await terminateProcessTree(child, {
    platform: "win32",
    spawnProcess: (...args) => { calls.push(args); return fakeTerminator; },
  });
  assert.equal(calls[0][0], "taskkill.exe");
  assert.deepEqual(calls[0][1], ["/PID", "4317", "/T", "/F"]);
  assert.equal(result.method, "windows-tree");
  assert.equal(result.terminated, true);
});
