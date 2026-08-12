import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { codexActivityFromJsonLine, providerLivenessSnapshot, providerProgressMessage } from "../lib/looplab-provider-activity.mjs";
import { companionLifecycleDecision } from "../lib/looplab-companion-lifecycle.mjs";
import { inspectProviders, loadProviderEnvironment, providerStatusDigest, resolveProviderInvocation, verifyProviderCredentialCandidate } from "../lib/looplab-provider-status.mjs";

const ok = (stdout = "") => ({ ok: true, exitCode: 0, stdout, stderr: "", errorCode: "", timedOut: false });
const fail = ({ stderr = "", errorCode = "", exitCode = 1, timedOut = false } = {}) => ({ ok: false, exitCode, stdout: "", stderr, errorCode, timedOut });

test("candidate API keys verify without mutating the existing provider environment", async () => {
  const baseEnv = { OPENAI_API_KEY: "existing-secret-that-must-remain" };
  let candidateEnvironment = null;
  const verified = await verifyProviderCredentialCandidate("openai", "candidate-secret-that-is-long-enough", {
    baseEnv,
    inspector: async ({ env }) => {
      candidateEnvironment = env;
      return { providers: { openai: { ready: true, label: "OpenAI API", summary: "Ready" } } };
    },
  });
  assert.equal(verified.status.ready, true);
  assert.equal(baseEnv.OPENAI_API_KEY, "existing-secret-that-must-remain");
  assert.equal(candidateEnvironment.OPENAI_API_KEY, "candidate-secret-that-is-long-enough");

  await assert.rejects(
    verifyProviderCredentialCandidate("openai", "rejected-candidate-secret-long-enough", {
      baseEnv,
      inspector: async () => ({ providers: { openai: { ready: false, label: "OpenAI API", summary: "Authentication failed" } } }),
    }),
    /existing saved key was not changed/,
  );
  assert.equal(baseEnv.OPENAI_API_KEY, "existing-secret-that-must-remain");
});

test("prefers the project-local Codex package over an inaccessible Windows app alias", () => {
  const local = resolveProviderInvocation("codex", ["login", "status"], { platform: "win32", fileExists: () => true });
  assert.equal(local.command, process.execPath);
  assert.match(local.args[0], /node_modules[\\/]@openai[\\/]codex[\\/]bin[\\/]codex\.js$/);
  assert.deepEqual(local.args.slice(1), ["login", "status"]);
  assert.equal(local.shell, false);
  assert.equal(local.source, "project-local-codex");

  const fallback = resolveProviderInvocation("codex", ["--version"], { platform: "win32", fileExists: () => false });
  assert.equal(fallback.command, "codex");
  assert.deepEqual(fallback.args, ["--version"]);
  assert.equal(fallback.shell, false);
  assert.equal(fallback.source, "path");
});

test("resolves standalone global Codex package entries without executing Windows command shims", () => {
  const nodeGlobal = resolveProviderInvocation("codex", ["--version"], {
    platform: "win32",
    appData: "C:\\Users\\tester\\AppData\\Roaming",
    fileExists: (path) => path.replaceAll("\\", "/").endsWith("node_modules/@openai/codex/bin/codex.js") && path.startsWith(resolve(process.execPath, "..")),
  });
  assert.equal(nodeGlobal.command, process.execPath);
  assert.match(nodeGlobal.args[0], /node_modules[\\/]@openai[\\/]codex[\\/]bin[\\/]codex\.js$/);
  assert.deepEqual(nodeGlobal.args.slice(1), ["--version"]);
  assert.equal(nodeGlobal.shell, false);
  assert.equal(nodeGlobal.source, "node-global-codex");

  const userGlobal = resolveProviderInvocation("codex", ["login", "status"], {
    platform: "win32",
    appData: "C:\\Users\\tester\\AppData\\Roaming",
    fileExists: (path) => path.replaceAll("\\", "/").startsWith("C:/Users/tester/AppData/Roaming/npm/node_modules/@openai/codex/"),
  });
  assert.equal(userGlobal.command, process.execPath);
  assert.deepEqual(userGlobal.args.slice(1), ["login", "status"]);
  assert.equal(userGlobal.shell, false);
  assert.equal(userGlobal.source, "user-global-codex");
});

test("Windows provider fallback never exposes prompts or schemas to cmd.exe parsing", () => {
  const claudeJs = resolveProviderInvocation("claude", ["--tools", "", "--json-schema", '{"type":"object"}'], {
    platform: "win32",
    appData: "C:\\Users\\tester\\AppData\\Roaming",
    fileExists: (path) => path.replaceAll("\\", "/").endsWith("claude-code/cli.js"),
  });
  assert.equal(claudeJs.command, process.execPath);
  assert.match(claudeJs.args[0], /claude-code[\\/]cli\.js$/);
  assert.deepEqual(claudeJs.args.slice(1), ["--tools", "", "--json-schema", '{"type":"object"}']);
  assert.equal(claudeJs.shell, false);

  const pathFallback = resolveProviderInvocation("claude", ["--version"], { platform: "win32", fileExists: () => false, appData: "" });
  assert.equal(pathFallback.shell, false);
});

test("explicit CLI entries support deterministic headless and CI provider fixtures", () => {
  const entry = join(tmpdir(), "looplab-fake-claude.mjs");
  const invocation = resolveProviderInvocation("claude", ["--version"], {
    env: { LOOPLAB_CLAUDE_CLI_ENTRY: entry },
    fileExists: () => false,
  });
  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.args, [resolve(entry), "--version"]);
  assert.equal(invocation.shell, false);
  assert.equal(invocation.source, "configured-claude-entry");
});

test("every Codex creative path shares the safe local invocation resolver", () => {
  for (const file of ["scripts/looplab-prompt.mjs", "scripts/looplab-loop.mjs", "scripts/looplab-research.mjs"]) {
    const source = readFileSync(resolve(file), "utf8");
    assert.match(source, /runProviderProcess/, `${file} must use the shared provider process adapter`);
  }
  const processAdapter = readFileSync(resolve("lib/looplab-provider-process.mjs"), "utf8");
  assert.match(processAdapter, /resolveProviderInvocation/, "the shared process adapter must use the safe Codex resolver");
  const companionSource = readFileSync(resolve("scripts/looplab-companion.mjs"), "utf8");
  assert.match(companionSource, /resolveProviderInvocation/, "the companion must use the safe Codex resolver");
  for (const file of ["scripts/looplab-prompt.mjs", "scripts/looplab-loop.mjs", "scripts/looplab-research.mjs"]) {
    const source = readFileSync(resolve(file), "utf8");
    assert.match(source, /"exec", "--json", "--skip-git-repo-check"/, `${file} must emit machine-readable usage and allow its isolated temporary job directory`);
  }
});

test("complex build loops use monitored non-expiring provider runs and tree-safe cancellation", () => {
  const loopSource = readFileSync(resolve("scripts/looplab-loop.mjs"), "utf8");
  const processAdapter = readFileSync(resolve("lib/looplab-provider-process.mjs"), "utf8");
  const companionSource = readFileSync(resolve("scripts/looplab-companion.mjs"), "utf8");
  const pageSource = readFileSync(resolve("app/page.tsx"), "utf8");
  const generationJobSource = companionSource.match(/async function startJob\(payload\) \{[\s\S]*?(?=async function startResearchJob)/)?.[0] ?? "";

  assert.match(loopSource, /runProviderProcess/);
  assert.match(processAdapter, /providerTimeoutMs/);
  assert.match(processAdapter, /Number\.isFinite\(timeoutMs\) && timeoutMs > 0/);
  assert.match(loopSource, /LOOPLAB_PROVIDER_PROGRESS_INTERVAL_MS \?\? 30_000/);
  assert.match(loopSource, /emit\("provider\.progress"/);
  assert.match(loopSource, /emit\("provider\.activity"/);
  assert.match(loopSource, /codexActivityFromJsonLine/);
  assert.match(loopSource, /providerLivenessSnapshot/);
  assert.match(loopSource, /providerProgressMessage/);
  assert.doesNotMatch(loopSource, /is still working on iteration/);
  assert.match(loopSource, /clearInterval\(providerProgressTimer\)/);
  assert.ok(generationJobSource);
  assert.doesNotMatch(generationJobSource, /setTimeout\(/, "companion-owned generation jobs must not gain an implicit wall-clock timeout");
  assert.match(companionSource, /statusUrl: `\/jobs\/\$\{job\.id\}\/status`/);
  assert.match(companionSource, /events\|status\|result\|cancel/);
  assert.match(companionSource, /recentEvents: job\.events\.slice\(-12\)/);
  assert.match(companionSource, /protocolVersion: LOOPLAB_PROTOCOL_VERSION/);
  assert.match(companionSource, /cancelUrl: `\/jobs\/\$\{job\.id\}\/cancel`/);
  assert.match(companionSource, /job\.status = "cancelled";\s*await terminateProcessTree\(job\.child\)/);
  assert.match(pageSource, /cancelUrl: created\.cancelUrl \?\? `\/jobs\/\$\{created\.jobId\}\/cancel`/);
});

test("managed launchers reuse only protocol-current companions and never interrupt active stale work", () => {
  assert.deepEqual(companionLifecycleDecision(null, "1.38.0"), { action: "start", reason: "No companion responded." });
  assert.equal(companionLifecycleDecision({ name: "Looplab AI Companion", protocolVersion: "1.38.0" }, "1.38.0").action, "reuse");
  assert.equal(companionLifecycleDecision({ name: "Looplab AI Companion", protocolVersion: "1.37.0", activeJobs: 0 }, "1.38.0").action, "replace");
  assert.equal(companionLifecycleDecision({ name: "Looplab AI Companion", protocolVersion: "1.37.0", activeJobs: 1 }, "1.38.0").action, "block");
  assert.equal(companionLifecycleDecision({ name: "Looplab AI Companion", protocolVersion: "1.37.0", activeAssetJobs: 1 }, "1.38.0").action, "block");
  assert.equal(companionLifecycleDecision({ name: "Looplab AI Companion", protocolVersion: "1.37.0", activeReleaseVerificationJobs: 1 }, "1.38.0").action, "block");
  assert.equal(companionLifecycleDecision({ name: "Another local service", protocolVersion: "1.38.0" }, "1.38.0").action, "block");
  const launcherSource = readFileSync(resolve("scripts/looplab-launch.mjs"), "utf8");
  const companionSource = readFileSync(resolve("scripts/looplab-companion.mjs"), "utf8");
  assert.match(companionSource, /import \{ LOOPLAB_COMPANION_VERSION, LOOPLAB_PROTOCOL_VERSION \} from "\.\.\/lib\/looplab-versions\.mjs"/);
  assert.match(companionSource, /version: LOOPLAB_COMPANION_VERSION, protocolVersion: LOOPLAB_PROTOCOL_VERSION/);
  assert.doesNotMatch(companionSource, /version: "\d+\.\d+\.\d+", protocolVersion:/);
  assert.match(launcherSource, /companionLifecycleDecision/);
  assert.match(launcherSource, /\/lifecycle\/shutdown/);
  assert.match(launcherSource, /const lifecycleDecision = companionLifecycleDecision\(existingHealth, LOOPLAB_PROTOCOL_VERSION\)/);
  assert.doesNotMatch(launcherSource, /if \(await companionIsReady\(\)\) \{\s*writeStatus\("companion\.reused"/);
  assert.match(launcherSource, /node_modules", "vinext", "dist", "cli\.js"/, "the launcher must own the real vinext process rather than an npm wrapper");
  assert.match(launcherSource, /taskkill\.exe.*"\/T".*"\/F"/s, "Windows shutdown must terminate the complete managed process tree");
  assert.match(launcherSource, /await Promise\.all\(\[stopChild\(web\), stopChild\(companion\)\]\)/, "launcher shutdown must wait for both managed children");
  assert.doesNotMatch(launcherSource, /setTimeout\(\(\) => process\.exit\(exitCode\), 80\)/, "launcher shutdown must not rely on a fixed 80 ms exit race");
  assert.match(companionSource, /request\.headers\.origin/);
  assert.match(companionSource, /cannot be replaced while an operation is active/);
});

test("Codex activity reporting proves real JSONL activity without exposing provider content", () => {
  const secret = "never-leak-this-prompt-or-response";
  const activity = codexActivityFromJsonLine(JSON.stringify({
    type: "item.completed",
    item: {
      type: "agent_message",
      text: secret,
      arguments: { command: secret },
      reasoning: secret,
    },
  }));
  assert.deepEqual(activity, { provider: "codex", eventType: "item.completed", itemType: "agent_message" });
  assert.doesNotMatch(JSON.stringify(activity), new RegExp(secret));
  assert.equal(codexActivityFromJsonLine("not json"), null);
  const unknownActivity = codexActivityFromJsonLine(JSON.stringify({ type: secret, item: { type: secret } }));
  assert.deepEqual(unknownActivity, { provider: "codex", eventType: "unknown", itemType: "unknown" });
  assert.doesNotMatch(JSON.stringify(unknownActivity), new RegExp(secret));

  assert.deepEqual(providerLivenessSnapshot(null, 25_000), {
    liveness: "process-only",
    lastProviderEventType: null,
    lastProviderItemType: null,
    providerActivityAgeSeconds: null,
  });
  assert.deepEqual(providerLivenessSnapshot({ ...activity, observedAt: 10_000 }, 25_000), {
    liveness: "provider-activity-observed",
    lastProviderEventType: "item.completed",
    lastProviderItemType: "agent_message",
    providerActivityAgeSeconds: 15,
  });
  assert.equal(
    providerProgressMessage({ provider: "codex", iteration: 2, elapsedSeconds: 30, liveness: providerLivenessSnapshot(null, 30_000) }),
    "codex iteration 2 request is still pending; no provider activity event has been observed yet · 30s elapsed",
  );
  assert.equal(
    providerProgressMessage({ provider: "codex", iteration: 2, elapsedSeconds: 30, liveness: providerLivenessSnapshot({ ...activity, observedAt: 15_000 }, 30_000) }),
    "codex iteration 2 activity observed: item.completed / agent_message · 15s ago · 30s elapsed",
  );
});

test("reports API configuration and CLI authentication without returning secrets", async () => {
  const runner = async (command, args) => {
    if (command === "codex" && args[0] === "--version") return ok("codex-cli 1.2.3");
    if (command === "codex") return ok("Logged in using ChatGPT");
    return fail({ errorCode: "ENOENT", exitCode: null });
  };
  const scan = await inspectProviders({
    env: { OPENAI_API_KEY: "sk-test-secret-value", LOOPLAB_OPENAI_MODEL: "test-model" },
    runner,
    fetcher: async () => ({ ok: true, status: 200 }),
  });

  assert.equal(scan.providers.codex.state, "ready");
  assert.equal(scan.providers.codex.authMethod, "ChatGPT");
  assert.equal(scan.providers.claude.state, "not-installed");
  assert.equal(scan.providers.openai.state, "ready");
  assert.equal(scan.providers.openai.model, "test-model");
  assert.equal(scan.providers.anthropic.state, "needs-key");
  assert.equal(scan.readyCount, 2);
  assert.doesNotMatch(JSON.stringify(scan), /sk-test-secret-value/);
});

test("distinguishes a blocked CLI from an installed CLI that needs login", async () => {
  const runner = async (command, args) => {
    if (command === "codex") return fail({ errorCode: "EACCES", exitCode: null });
    if (args[0] === "--version") return ok("2.0.0 (Claude Code)");
    return fail({ stderr: "Not logged in" });
  };
  const scan = await inspectProviders({ env: {}, runner, fetcher: async () => { throw new Error("should not be called"); } });

  assert.equal(scan.providers.codex.state, "blocked");
  assert.equal(scan.providers.codex.installed, true);
  assert.equal(scan.providers.codex.runnable, false);
  assert.equal(scan.providers.claude.state, "needs-login");
  assert.equal(scan.providers.claude.action.kind, "login");
  assert.equal(providerStatusDigest(scan), "codex:blocked|claude:needs-login|openai:needs-key|anthropic:needs-key");
});

test("Codex/OpenAI and Claude/Anthropic paths remain independently usable", async () => {
  const claudeAndOpenAi = await inspectProviders({
    env: { OPENAI_API_KEY: "openai-secret-that-must-not-leak" },
    runner: async (command, args) => {
      if (command === "codex") return fail({ errorCode: "EACCES", exitCode: null });
      if (command === "claude" && args[0] === "--version") return ok("2.1.224 (Claude Code)");
      if (command === "claude") return ok("Authenticated through Claude account");
      return fail({ errorCode: "ENOENT", exitCode: null });
    },
    fetcher: async (url) => ({ ok: String(url).includes("api.openai.com"), status: String(url).includes("api.openai.com") ? 200 : 401 }),
  });
  assert.equal(claudeAndOpenAi.providers.codex.ready, false);
  assert.equal(claudeAndOpenAi.providers.claude.ready, true);
  assert.equal(claudeAndOpenAi.providers.openai.ready, true);
  assert.equal(claudeAndOpenAi.providers.anthropic.ready, false);
  assert.deepEqual(claudeAndOpenAi.readyProviders, ["claude", "openai"]);
  assert.equal(claudeAndOpenAi.routes.codex.selectedProvider, "openai", "Codex failure routes through its ready API transport before crossing vendors");
  assert.equal(claudeAndOpenAi.routes.anthropic.selectedProvider, "claude", "Anthropic API failure routes through the ready Claude transport");

  const codexAndAnthropic = await inspectProviders({
    env: { ANTHROPIC_API_KEY: "anthropic-secret-that-must-not-leak" },
    runner: async (command, args) => {
      if (command === "codex" && args[0] === "--version") return ok("codex-cli 0.147.0");
      if (command === "codex") return ok("Logged in using ChatGPT");
      if (command === "claude") return fail({ errorCode: "EACCES", exitCode: null });
      return fail({ errorCode: "ENOENT", exitCode: null });
    },
    fetcher: async (url) => ({ ok: String(url).includes("api.anthropic.com"), status: String(url).includes("api.anthropic.com") ? 200 : 401 }),
  });
  assert.equal(codexAndAnthropic.providers.codex.ready, true);
  assert.equal(codexAndAnthropic.providers.claude.ready, false);
  assert.equal(codexAndAnthropic.providers.openai.ready, false);
  assert.equal(codexAndAnthropic.providers.anthropic.ready, true);
  assert.deepEqual(codexAndAnthropic.readyProviders, ["codex", "anthropic"]);
  assert.match(codexAndAnthropic.independencePolicy.failureIsolation, /never blocks/i);
  assert.equal(codexAndAnthropic.routes.claude.selectedProvider, "anthropic");
  assert.equal(codexAndAnthropic.routes.openai.selectedProvider, "codex");
  assert.equal(codexAndAnthropic.failoverPolicy.defaultMode, "fallback");
});

test("an unexpected CLI inspection exception blocks only that path", async () => {
  const scanWithBrokenCodexProbe = await inspectProviders({
    env: { OPENAI_API_KEY: "openai-secret-that-must-not-leak" },
    runner: async (command, args) => {
      if (command === "codex") throw new Error("synthetic Codex inspection failure");
      if (command === "claude" && args[0] === "--version") return ok("2.1.224 (Claude Code)");
      if (command === "claude") return ok("Authenticated through Claude account");
      return fail({ errorCode: "ENOENT", exitCode: null });
    },
    fetcher: async (url) => ({ ok: String(url).includes("api.openai.com"), status: String(url).includes("api.openai.com") ? 200 : 401 }),
  });
  assert.equal(scanWithBrokenCodexProbe.providers.codex.state, "blocked");
  assert.equal(scanWithBrokenCodexProbe.providers.claude.ready, true);
  assert.equal(scanWithBrokenCodexProbe.providers.openai.ready, true);
  assert.equal(scanWithBrokenCodexProbe.routes.codex.selectedProvider, "openai");
  assert.match(scanWithBrokenCodexProbe.providers.codex.detail, /every other CLI and API path independently/);

  const scanWithBrokenClaudeProbe = await inspectProviders({
    env: { ANTHROPIC_API_KEY: "anthropic-secret-that-must-not-leak" },
    runner: async (command, args) => {
      if (command === "claude") throw new Error("synthetic Claude inspection failure");
      if (command === "codex" && args[0] === "--version") return ok("codex-cli 0.147.0");
      if (command === "codex") return ok("Logged in using ChatGPT");
      return fail({ errorCode: "ENOENT", exitCode: null });
    },
    fetcher: async (url) => ({ ok: String(url).includes("api.anthropic.com"), status: String(url).includes("api.anthropic.com") ? 200 : 401 }),
  });
  assert.equal(scanWithBrokenClaudeProbe.providers.claude.state, "blocked");
  assert.equal(scanWithBrokenClaudeProbe.providers.codex.ready, true);
  assert.equal(scanWithBrokenClaudeProbe.providers.anthropic.ready, true);
  assert.equal(scanWithBrokenClaudeProbe.routes.claude.selectedProvider, "anthropic");
  assert.doesNotMatch(JSON.stringify(scanWithBrokenClaudeProbe), /anthropic-secret-that-must-not-leak/);
});

test("does not mark a configured API key ready when the provider rejects it", async () => {
  const runner = async () => fail({ errorCode: "ENOENT", exitCode: null });
  const scan = await inspectProviders({
    env: { ANTHROPIC_API_KEY: "secret-that-must-not-leak" },
    runner,
    fetcher: async () => ({ ok: false, status: 401 }),
  });

  assert.equal(scan.providers.anthropic.state, "blocked");
  assert.equal(scan.providers.anthropic.ready, false);
  assert.match(scan.providers.anthropic.detail, /HTTP 401/);
  assert.doesNotMatch(JSON.stringify(scan), /secret-that-must-not-leak/);
});

test("discovers a Windows user-vault key without exposing it in provider status", async () => {
  const secret = "sk-test-windows-vault-secret";
  const resolved = await loadProviderEnvironment({
    baseEnv: {},
    platform: "win32",
    runner: async (command, args, options) => {
      assert.equal(command, "powershell.exe");
      assert.equal(options.shell, false);
      const script = args.at(-1);
      return script.includes("openai-api-key.dpapi") ? ok(secret) : ok("");
    },
  });
  const scan = await inspectProviders({
    env: resolved,
    runner: async () => fail({ errorCode: "ENOENT", exitCode: null }),
    fetcher: async () => ({ ok: true, status: 200 }),
  });

  assert.equal(resolved.OPENAI_API_KEY, secret, "the server-only runtime environment receives the credential");
  assert.equal(scan.providers.openai.state, "ready");
  assert.doesNotMatch(JSON.stringify(scan), /sk-test-windows-vault-secret/);
});

test("offers native key setup and the official key page when no API credential is configured", async () => {
  const scan = await inspectProviders({
    env: {},
    runner: async () => fail({ errorCode: "ENOENT", exitCode: null }),
    fetcher: async () => { throw new Error("should not be called"); },
  });

  assert.equal(scan.providers.openai.action.kind, "native-key");
  assert.equal(scan.providers.openai.action.label, "Paste API key securely");
  assert.equal(scan.providers.openai.keyUrl, "https://platform.openai.com/api-keys");
});

test("health polling preserves the last verified provider state until an explicit refresh", () => {
  const companionSource = readFileSync(resolve("scripts/looplab-companion.mjs"), "utf8");
  assert.match(companionSource, /getProviderScan\(\{ force = false, allowStale = false \} = \{\}\)/);
  assert.match(companionSource, /allowStale \|\| Date\.now\(\) - providerScanTime < 30_000/);
  assert.match(companionSource, /pathname === "\/health"[\s\S]*?getProviderScan\(\{ allowStale: true \}\)/);
  assert.match(companionSource, /pathname === "\/health"[\s\S]*?getLocalCopilotScan\(\{ allowStale: true \}\)/);
  assert.match(companionSource, /pathname === "\/providers"[\s\S]*?const force = url\.searchParams\.get\("refresh"\) === "1";[\s\S]*?getProviderScan\(\{ force \}\)/);
  assert.match(companionSource, /pathname === "\/providers"[\s\S]*?getLocalCopilotScan\(\{ force \}\)/);
});

test("the stdin key path encrypts without requiring a WinForms textbox", { skip: process.platform !== "win32" }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "looplab-key-test-"));
  const vaultDirectory = join(directory, "vault");
  const resultPath = join(directory, "result.json");
  const dummyKey = "sk-looplab-test-not-a-real-key-1234567890";
  try {
    const child = spawnSync("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-File", resolve("scripts/looplab-set-api-key.ps1"),
      "-Provider", "openai",
      "-ResultPath", resultPath,
      "-ReadFromStdin",
      "-VaultDirectoryOverride", vaultDirectory,
    ], { input: dummyKey, encoding: "utf8", windowsHide: true });
    const result = JSON.parse(readFileSync(resultPath, "utf8").replace(/^\uFEFF/, ""));
    assert.equal(child.status, 0, child.stderr || JSON.stringify(result));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.storage, "windows-dpapi-current-user");
    const encrypted = readFileSync(join(vaultDirectory, "openai-api-key.dpapi"), "utf8");
    assert.match(encrypted, /^looplab-dpapi-v1:/);
    assert.ok(encrypted.length > 20);
    assert.doesNotMatch(encrypted, /sk-looplab-test-not-a-real-key/);
    const resolvedEnvironment = await loadProviderEnvironment({ baseEnv: {}, platform: "win32", vaultDirectory });
    assert.equal(resolvedEnvironment.OPENAI_API_KEY, dummyKey);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
