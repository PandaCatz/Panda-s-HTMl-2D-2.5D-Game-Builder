import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { createTemplate } from "../lib/looplab-agent-core.mjs";
import { getLooplabCommandContracts } from "../lib/looplab-agent-contracts.mjs";

import {
  LOOPLAB_PROVIDER_FAILOVER_POLICY,
  LOOPLAB_PROVIDER_PATHS,
  createProviderFailoverReceipt,
  findRunningProviderConnection,
  isRetryableProviderPathFailure,
  providerFamilyPaths,
  providerFallbackOrder,
  resolveProviderRoute,
} from "../lib/looplab-provider-routing.mjs";

const execFileAsync = promisify(execFile);

const scan = (ready = []) => ({
  providers: Object.fromEntries(["codex", "openai", "claude", "anthropic"].map((provider) => [provider, {
    ready: ready.includes(provider),
    state: ready.includes(provider) ? "ready" : "blocked",
    summary: `${provider} ${ready.includes(provider) ? "ready" : "blocked"}`,
  }])),
});

test("provider fallback prefers the same vendor alternate transport before crossing vendors", () => {
  assert.deepEqual(providerFallbackOrder("codex"), ["codex", "openai", "claude", "anthropic"]);
  assert.deepEqual(providerFallbackOrder("openai"), ["openai", "codex", "anthropic", "claude"]);
  assert.deepEqual(providerFallbackOrder("claude"), ["claude", "anthropic", "codex", "openai"]);
  assert.deepEqual(providerFallbackOrder("anthropic"), ["anthropic", "claude", "openai", "codex"]);
});

test("every API and CLI path remains usable when any other requested path is unavailable", () => {
  for (const requestedProvider of LOOPLAB_PROVIDER_PATHS) {
    for (const readyProvider of LOOPLAB_PROVIDER_PATHS) {
      const route = resolveProviderRoute(scan([readyProvider]), { requestedProvider });
      assert.equal(route.selectedProvider, readyProvider, `${requestedProvider} should route to the independently ready ${readyProvider} path`);
      assert.equal(route.fallbackUsed, requestedProvider !== readyProvider);
      assert.deepEqual(route.readyProviders, [readyProvider]);
    }
  }
});

test("a runtime-failed API or CLI path can fall through to every other ready path", () => {
  for (const requestedProvider of LOOPLAB_PROVIDER_PATHS) {
    for (const fallbackProvider of LOOPLAB_PROVIDER_PATHS.filter((provider) => provider !== requestedProvider)) {
      const route = resolveProviderRoute(scan([requestedProvider, fallbackProvider]), {
        requestedProvider,
        attemptedProviders: [requestedProvider],
      });
      assert.equal(route.selectedProvider, fallbackProvider, `${requestedProvider} failure should not disable ${fallbackProvider}`);
      assert.equal(route.fallbackUsed, true);
      assert.equal(route.candidates.find((candidate) => candidate.provider === requestedProvider)?.alreadyAttempted, true);
    }
  }
});

test("a broken Claude path automatically selects a ready Anthropic API or Codex path", () => {
  const sameVendor = resolveProviderRoute(scan(["anthropic", "codex"]), { requestedProvider: "claude" });
  assert.equal(sameVendor.selectedProvider, "anthropic");
  assert.equal(sameVendor.fallbackUsed, true);
  const crossVendor = resolveProviderRoute(scan(["codex"]), { requestedProvider: "claude" });
  assert.equal(crossVendor.selectedProvider, "codex");
  assert.match(crossVendor.selectionReason, /next verified ready path/);
});

test("a broken Codex path automatically selects OpenAI API or a ready Claude path", () => {
  assert.equal(resolveProviderRoute(scan(["openai", "claude"]), { requestedProvider: "codex" }).selectedProvider, "openai");
  assert.equal(resolveProviderRoute(scan(["claude"]), { requestedProvider: "codex" }).selectedProvider, "claude");
});

test("strict routing never changes the requested provider", () => {
  const route = resolveProviderRoute(scan(["claude"]), { requestedProvider: "codex", mode: "strict" });
  assert.equal(route.selectedProvider, null);
  assert.equal(route.allUnavailable, true);
  assert.match(route.selectionReason, /strict mode forbids fallback/);
});

test("image-consented routing remains inside the requested provider family", () => {
  assert.deepEqual(providerFamilyPaths("codex"), ["codex", "openai"]);
  assert.deepEqual(providerFamilyPaths("claude"), ["claude", "anthropic"]);
  const anthropicFallback = resolveProviderRoute(scan(["anthropic", "codex"]), {
    requestedProvider: "claude",
    eligibleProviders: providerFamilyPaths("claude"),
  });
  assert.equal(anthropicFallback.selectedProvider, "anthropic");
  const consentBlockedCrossVendor = resolveProviderRoute(scan(["codex"]), {
    requestedProvider: "claude",
    eligibleProviders: providerFamilyPaths("claude"),
  });
  assert.equal(consentBlockedCrossVendor.selectedProvider, null);
});

test("provider connection locks are scoped to one path", () => {
  const connections = new Map([
    ["claude-login", { id: "claude-login", provider: "claude", status: "running" }],
    ["codex-old", { id: "codex-old", provider: "codex", status: "completed" }],
  ]);
  assert.equal(findRunningProviderConnection(connections, "claude")?.id, "claude-login");
  assert.equal(findRunningProviderConnection(connections, "codex"), null);
  connections.set("codex-login", { id: "codex-login", provider: "codex", status: "running" });
  assert.equal(findRunningProviderConnection(connections, "codex")?.id, "codex-login");
  assert.equal(findRunningProviderConnection(connections, "claude")?.id, "claude-login");
});

test("the Connection Center monitors provider sign-ins independently", async () => {
  const pageSource = await readFile(resolve("app/page.tsx"), "utf8");
  assert.match(pageSource, /useState<AgentProvider\[\]>\(\[\]\)/);
  assert.match(pageSource, /useRef<Map<AgentProvider, CompanionEventStream>>\(new Map\(\)\)/);
  assert.match(pageSource, /providerEventSourcesRef\.current\.set\(provider\.id, source\)/);
  assert.match(pageSource, /providerEventSourcesRef\.current\.get\(connection\.provider\)\?\.close\(\)/);
  assert.doesNotMatch(pageSource, /providerEventSourceRef\.current\?\.close\(\)/, "starting one provider must not close another provider's sign-in stream");
});

test("every headless provider-backed text operation exposes fallback and strict routing", async () => {
  const contracts = getLooplabCommandContracts();
  for (const op of ["retry_prompt", "start_ai_build", "start_research", "start_visual_critique"]) {
    const contract = contracts.find((candidate) => candidate.op === op);
    assert.ok(contract, `${op} command contract is present`);
    assert.deepEqual(contract.inputSchema.properties.providerMode.enum, ["fallback", "strict"], `${op} route mode`);
  }
  const pageSource = await readFile(resolve("app/page.tsx"), "utf8");
  assert.match(pageSource, /request\.providerMode \?\? "fallback"/);
  assert.match(pageSource, /overrides\.providerMode \?\? "fallback"/);
  assert.match(pageSource, /runResearch\([^;]+providerMode: requestedProviderMode/);
  assert.match(pageSource, /startVisualCritique\(\{[\s\S]+?providerMode:/);
});

test("failed paths are skipped without changing independent readiness", () => {
  const route = resolveProviderRoute(scan(["codex", "openai", "claude"]), { requestedProvider: "codex", attemptedProviders: ["codex", "openai"] });
  assert.equal(route.selectedProvider, "claude");
  assert.deepEqual(route.readyProviders, ["codex", "openai", "claude"]);
  assert.equal(route.candidates.find((candidate) => candidate.provider === "codex").alreadyAttempted, true);
});

test("provider-path failures are distinguished from creative rejections", () => {
  for (const message of ["spawn ENOENT", "HTTP 429 rate limit", "Codex returned invalid JSON", "Anthropic API key was rejected", "provider request timed out"]) {
    assert.equal(isRetryableProviderPathFailure(message), true, message);
  }
  assert.equal(isRetryableProviderPathFailure("Proposal made no authored game changes."), false);
  assert.equal(isRetryableProviderPathFailure("Specialist review blocked the proposal: level-designer"), false);
});

test("failover receipts preserve requested and actual paths without claiming silent equivalence", () => {
  const receipt = createProviderFailoverReceipt({
    requestedProvider: "claude",
    selectedProvider: "codex",
    attempts: [
      { provider: "claude", status: "failed", reason: "CLI unavailable" },
      { provider: "codex", status: "completed" },
    ],
  });
  assert.equal(receipt.fallbackUsed, true);
  assert.equal(receipt.attemptCount, 2);
  assert.match(receipt.policy, /requested path, actual path/i);
  assert.equal(LOOPLAB_PROVIDER_FAILOVER_POLICY.isolation.includes("independent"), true);
});

test("a durable loop retries an unchanged failed Claude proposal through Codex and preserves attribution", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-runtime-failover-"));
  const fakeClaudePath = join(directory, "fake-claude-failure.mjs");
  const fakeCodexPath = join(directory, "fake-codex-success.mjs");
  const runDirectory = join(directory, "run");
  const projectPath = join(runDirectory, "project.loop.json");
  const versionsDirectory = join(runDirectory, "versions");
  const proposal = {
    summary: "Apply a provider-neutral visible metadata change.",
    hypothesis: "Fallback preserves the same project, context, and acceptance contract.",
    agentReviews: [],
    commands: [{ op: "set_project", changes: { background: "#303030" } }],
    scores: { playability: 8, clarity: 8, variety: 7, visual_cohesion: 8 },
  };
  try {
    await mkdir(runDirectory, { recursive: true });
    await writeFile(projectPath, JSON.stringify(createTemplate("platformer")), "utf8");
    await writeFile(fakeClaudePath, "process.stderr.write('provider request timed out'); process.exit(7);\n", "utf8");
    await writeFile(fakeCodexPath, [
      "import { writeFileSync } from 'node:fs';",
      "const args = process.argv.slice(2);",
      "const output = args[args.indexOf('-o') + 1];",
      `writeFileSync(output, ${JSON.stringify(JSON.stringify(proposal))}, 'utf8');`,
      "process.stdout.write(JSON.stringify({type:'turn.completed',model:'fallback-model',usage:{input_tokens:10,output_tokens:5,total_tokens:15}})+'\\n');",
    ].join("\n"), "utf8");
    const execution = await execFileAsync(process.execPath, [
      resolve("scripts/looplab-loop.mjs"),
      "--provider", "claude",
      "--requested-provider", "claude",
      "--provider-mode", "fallback",
      "--provider-fallbacks", "claude|codex",
      "--project", projectPath,
      "--versions-dir", versionsDirectory,
      "--iterations", "1",
      "--goal", "Make one provider-neutral visual metadata improvement.",
      "--evaluation-profile", "general",
      "--stop-score", "101",
      "--min-delta", "-100",
    ], {
      cwd: resolve("."),
      env: {
        ...process.env,
        LOOPLAB_CLAUDE_CLI_ENTRY: fakeClaudePath,
        LOOPLAB_CODEX_CLI_ENTRY: fakeCodexPath,
        LOOPLAB_PROVIDER_AUTH_METHOD_CLAUDE: "Claude account",
        LOOPLAB_PROVIDER_AUTH_METHOD_CODEX: "ChatGPT",
      },
    });
    const events = execution.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const project = JSON.parse(await readFile(projectPath, "utf8"));
    const history = JSON.parse(await readFile(join(versionsDirectory, "history.json"), "utf8"));
    const attempt = history.attempts[0];
    const completed = events.find((event) => event.type === "loop.completed");
    assert.ok(events.some((event) => event.type === "provider.failover.started" && event.failedProvider === "claude" && event.provider === "codex"));
    assert.ok(events.some((event) => event.type === "iteration.accepted"));
    assert.equal(project.background, "#303030");
    assert.equal(attempt.requestedProvider, "claude");
    assert.equal(attempt.provider, "codex");
    assert.equal(attempt.providerFailover.fallbackUsed, true);
    assert.deepEqual(attempt.providerFailover.attempts.map(({ provider, status }) => ({ provider, status })), [
      { provider: "claude", status: "failed" },
      { provider: "codex", status: "completed" },
    ]);
    assert.equal(completed.requestedProvider, "claude");
    assert.equal(completed.provider, "codex");
    assert.equal(completed.providerFailover.fallbackUsed, true);
    assert.equal(completed.usage.totalTokens, 15);
    assert.equal(completed.usage.runCount, 2, "failed and successful provider attempts both remain in usage accounting");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a failed provider path is disabled for the rest of a bounded loop instead of wasting later calls", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-provider-exhaustion-"));
  const fakeCodexPath = join(directory, "fake-codex-failure.mjs");
  const invocationPath = join(directory, "invocations.txt");
  const projectPath = join(directory, "project.loop.json");
  const versionsDirectory = join(directory, "versions");
  try {
    await writeFile(projectPath, JSON.stringify(createTemplate("platformer")), "utf8");
    await writeFile(fakeCodexPath, [
      "import { appendFileSync } from 'node:fs';",
      "appendFileSync(process.env.LOOPLAB_FAKE_INVOCATIONS, 'codex\\n');",
      "process.stderr.write('provider request timed out');",
      "process.exit(7);",
    ].join("\n"), "utf8");
    const execution = await execFileAsync(process.execPath, [
      resolve("scripts/looplab-loop.mjs"),
      "--provider", "codex",
      "--requested-provider", "codex",
      "--provider-mode", "strict",
      "--provider-fallbacks", "codex",
      "--project", projectPath,
      "--versions-dir", versionsDirectory,
      "--iterations", "3",
      "--goal", "Exercise provider-path exhaustion without mutating the project.",
      "--evaluation-profile", "general",
      "--stop-score", "101",
    ], {
      cwd: resolve("."),
      env: {
        ...process.env,
        LOOPLAB_CODEX_CLI_ENTRY: fakeCodexPath,
        LOOPLAB_FAKE_INVOCATIONS: invocationPath,
        LOOPLAB_PROVIDER_AUTH_METHOD_CODEX: "ChatGPT",
      },
    });
    const events = execution.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const invocations = (await readFile(invocationPath, "utf8")).trim().split(/\r?\n/).filter(Boolean);
    const history = JSON.parse(await readFile(join(versionsDirectory, "history.json"), "utf8"));
    assert.deepEqual(invocations, ["codex"]);
    assert.equal(history.attempts.length, 1);
    assert.ok(events.some((event) => event.type === "loop.stopped" && event.reason === "provider-paths-exhausted"));
    assert.ok(events.some((event) => event.type === "loop.completed" && event.changed === false));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
