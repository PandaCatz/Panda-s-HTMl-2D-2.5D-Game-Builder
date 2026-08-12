import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  buildClaudeCliArgs,
  claudeHeadlessCapabilities,
  inspectClaudeCliOutput,
  requireClaudeCliStructuredResult,
} from "../lib/looplab-claude-cli.mjs";
import { anthropicStructuredSchema, anthropicStructuredThinking, buildAnthropicMessagesRequest, requireAnthropicStructuredResult } from "../lib/looplab-anthropic-api.mjs";
import { claudeActivityFromJsonLine, providerLivenessSnapshot } from "../lib/looplab-provider-activity.mjs";
import {
  createProviderParityReceipt,
  getProviderParityContract,
  LOOPLAB_PROVIDER_PARITY_SHARED_DIGEST,
} from "../lib/looplab-provider-parity.mjs";
import { applyAgentCommand, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { inspectProviders, resolveProviderInvocation } from "../lib/looplab-provider-status.mjs";

const ok = (stdout = "") => ({ ok: true, exitCode: 0, stdout, stderr: "", errorCode: "", timedOut: false });
const fail = ({ stderr = "", errorCode = "ENOENT", exitCode = null } = {}) => ({ ok: false, exitCode, stdout: "", stderr, errorCode, timedOut: false });
const execFileAsync = promisify(execFile);

test("Claude readiness requires the reliable structured-headless version", () => {
  assert.equal(claudeHeadlessCapabilities("2.1.204 (Claude Code)").parityReady, false);
  const current = claudeHeadlessCapabilities("2.1.224 (Claude Code)");
  assert.equal(current.parityReady, true);
  assert.equal(current.contract, "looplab-claude-headless/v1");
  assert.equal(current.minimumVersion, "2.1.205");
});

test("Claude uses schema-bound stream JSON with noninteractive least privilege", () => {
  const schema = { type: "object", required: ["answer"], properties: { answer: { type: "string" } } };
  const args = buildClaudeCliArgs({ prompt: "Return the answer", schema, maxTurns: 4, tools: [] });
  const valueAfter = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(valueAfter("--output-format"), "stream-json");
  assert.deepEqual(JSON.parse(valueAfter("--json-schema")), schema);
  assert.equal(valueAfter("--permission-mode"), "dontAsk");
  assert.equal(valueAfter("--tools"), "");
  assert.equal(valueAfter("--max-turns"), "4");
  assert.ok(args.includes("--no-session-persistence"));
  assert.ok(args.includes("--safe-mode"));
  assert.ok(args.includes("--no-chrome"));
  assert.ok(args.includes("--strict-mcp-config"));
  assert.equal(args.includes("--allowedTools"), false);

  const researchArgs = buildClaudeCliArgs({ prompt: "Research", schema, tools: ["WebSearch", "WebFetch"] });
  assert.equal(researchArgs[researchArgs.indexOf("--tools") + 1], "WebSearch,WebFetch");
  assert.equal(researchArgs[researchArgs.indexOf("--allowedTools") + 1], "WebSearch,WebFetch");
});
test("Claude receives a self-contained schema without a remote meta-schema dependency", () => {
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: { answer: { type: "string", minLength: 2, maxLength: 12 } },
    required: ["answer"],
    additionalProperties: false,
  };
  const args = buildClaudeCliArgs({ prompt: "Return the answer", schema });
  const transmitted = JSON.parse(args[args.indexOf("--json-schema") + 1]);
  assert.equal(transmitted.$schema, undefined);
  assert.equal(transmitted.properties.answer.maxLength, 12);
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema", "the canonical cross-provider schema is not mutated");
});


test("Claude structured results preserve output and measured telemetry", () => {
  const stdout = [
    JSON.stringify({ type: "system", subtype: "init", model: "claude-sonnet-5" }),
    JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "provider-private-text" } } }),
    JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      structured_output: { answer: "verified" },
      usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 20 },
      total_cost_usd: 0.0042,
      modelUsage: { "claude-sonnet-5": { inputTokens: 120, outputTokens: 30, costUSD: 0.0042 } },
      session_id: "private-session-id",
    }),
  ].join("\n");
  const inspected = inspectClaudeCliOutput(stdout);
  assert.deepEqual(inspected.structuredOutput, { answer: "verified" });
  assert.equal(inspected.model, "claude-sonnet-5");
  assert.equal(inspected.usage.input_tokens, 120);
  assert.equal(inspected.providerReportedUsd, 0.0042);
  assert.equal(inspected.result.sessionIdPresent, true);
  assert.doesNotMatch(JSON.stringify(inspected.result), /private-session-id|provider-private-text/);
  assert.deepEqual(requireClaudeCliStructuredResult(stdout).structuredOutput, { answer: "verified" });
});

test("Claude model-usage fallback includes separately reported cache tokens", () => {
  const inspected = inspectClaudeCliOutput(JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    structured_output: { answer: "verified" },
    modelUsage: {
      "claude-sonnet-5": {
        inputTokens: 100,
        cacheReadInputTokens: 40,
        cacheCreationInputTokens: 10,
        outputTokens: 25,
      },
    },
  }));
  assert.equal(inspected.usage.total_tokens, 175);
  assert.equal(inspected.usage.cache_read_input_tokens, 40);
  assert.equal(inspected.usage.cache_creation_input_tokens, 10);
});

test("Claude success without structured output and structured errors are rejected", () => {
  assert.throws(
    () => requireClaudeCliStructuredResult(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "free form" })),
    /without a schema-validated structured_output/,
  );
  assert.throws(
    () => requireClaudeCliStructuredResult(JSON.stringify({ type: "result", subtype: "error_max_structured_output_retries", is_error: true, errors: ["invalid"] })),
    /error_max_structured_output_retries/,
  );
});

test("Claude liveness events cannot leak response or tool content", () => {
  const secret = "never-copy-provider-content";
  const activity = claudeActivityFromJsonLine(JSON.stringify({
    type: "stream_event",
    event: { type: "content_block_start", content_block: { type: "tool_use", name: "Bash", input: { command: secret } } },
    message: { content: [{ type: "text", text: secret }] },
  }));
  assert.deepEqual(activity, { provider: "claude", eventType: "stream_event", itemType: "content_block_start" });
  assert.doesNotMatch(JSON.stringify(activity), new RegExp(secret));
  assert.deepEqual(providerLivenessSnapshot({ ...activity, observedAt: 1_000 }, 4_000), {
    liveness: "provider-activity-observed",
    lastProviderEventType: "stream_event",
    lastProviderItemType: "content_block_start",
    providerActivityAgeSeconds: 3,
  });
});

test("Windows Claude invocations prefer the native binary over a shell shim", () => {
  const invocation = resolveProviderInvocation("claude", ["--version"], {
    platform: "win32",
    fileExists: (path) => path.endsWith("claude.exe"),
  });
  assert.match(invocation.command, /@anthropic-ai[\\/]claude-code[\\/]bin[\\/]claude\.exe$/);
  assert.deepEqual(invocation.args, ["--version"]);
  assert.equal(invocation.shell, false);
  assert.match(invocation.source, /claude/);
});

test("provider scan blocks an authenticated old Claude and accepts the current CLI", async () => {
  const scanFor = (version) => inspectProviders({
    env: {},
    runner: async (command, args) => {
      if (command === "claude" && args[0] === "--version") return ok(`${version} (Claude Code)`);
      if (command === "claude") return ok(JSON.stringify({ loggedIn: true, subscriptionType: "max" }));
      return fail();
    },
    fetcher: async () => { throw new Error("API provider must not be called without a key"); },
  });
  const oldScan = await scanFor("2.1.204");
  assert.equal(oldScan.providers.claude.state, "blocked");
  assert.equal(oldScan.providers.claude.authenticated, true);
  assert.equal(oldScan.providers.claude.ready, false);
  const currentScan = await scanFor("2.1.224");
  assert.equal(currentScan.providers.claude.state, "ready");
  assert.equal(currentScan.providers.claude.capabilities.parityReady, true);
});

test("every Claude creative path uses the same structured adapter and no implicit timeout", () => {
  for (const file of ["scripts/looplab-prompt.mjs", "scripts/looplab-loop.mjs", "scripts/looplab-research.mjs"]) {
    const source = readFileSync(resolve(file), "utf8");
    assert.match(source, /buildClaudeCliArgs/);
    assert.match(source, /requireClaudeCliStructuredResult/);
    assert.doesNotMatch(source, /"--output-format", "text"/);
  }
  for (const file of ["scripts/looplab-prompt.mjs", "scripts/looplab-loop.mjs", "scripts/looplab-research.mjs"]) {
    const source = readFileSync(resolve(file), "utf8");
    assert.match(source, /runProviderProcess/);
  }
  const processAdapter = readFileSync(resolve("lib/looplab-provider-process.mjs"), "utf8");
  assert.match(processAdapter, /providerTimeoutMs/);
  assert.match(processAdapter, /Number\.isFinite\(timeoutMs\) && timeoutMs > 0/);
  const companion = readFileSync(resolve("scripts/looplab-companion.mjs"), "utf8");
  assert.match(companion, /LOOPLAB_PROVIDER_TIMEOUT_MS \?\? 0/);
  assert.doesNotMatch(companion, /900_000/);
});

test("manifest and Claude memories expose one canonical parity contract", () => {
  const manifest = getAgentManifest();
  assert.equal(manifest.providerParity.schemaVersion, "looplab-provider-parity/v2");
  assert.deepEqual(manifest.providerParity.providers, ["codex", "claude"]);
  assert.equal(manifest.providerParity.sharedContractDigest, LOOPLAB_PROVIDER_PARITY_SHARED_DIGEST);
  assert.equal(manifest.providerParity.providerTransports.claude.minimumVersion, "2.1.205");
  assert.equal(manifest.providerParity.operations["game-loop"].tools, "none");
  assert.equal(manifest.providerParity.operations.research.tools, "read-only web research");
  assert.equal(manifest.claudeIntegration.modelPolicy.smokeDefault, "haiku");
  assert.equal(manifest.claudeIntegration.modelPolicy.smokePurpose, "operability-only");
  assert.equal(manifest.claudeIntegration.modelPolicy.smokeUsedForGameCreation, false);
  assert.match(manifest.claudeIntegration.modelPolicy.creativeCliSelection, /Claude Code's current default/);
  assert.match(manifest.claudeIntegration.smokeBoundary, /not selected for game creation/i);
  assert.equal(manifest.iterationLedger.candidateDecisionSchema, "looplab-candidate-decision/v1");
  assert.match(manifest.iterationLedger.selectionPolicy, /Codex, and Claude/);
  assert.match(manifest.iterationLedger.selectionPolicy, /without naming an automatic creative winner/);
  const projectMemory = readFileSync(resolve("CLAUDE.md"), "utf8");
  const projectSkill = readFileSync(resolve(".claude/skills/looplab-game-builder/SKILL.md"), "utf8");
  assert.match(projectMemory, /schema-bound stream JSON/);
  assert.match(projectMemory, /npm run claude:status/);
  assert.match(projectSkill, /Permanent capability harvesting/);
  for (const requiredOperation of ["get_agent_changes", "get_agent_brief", "get_work_ledger", "get_project_context", "draft_agent_plan", "preview_batch", "apply_previewed_batch", "run_acceptance_suite", "run_replay_suite", "get_runtime_join_plan", "compare_iterations"]) {
    assert.match(projectSkill, new RegExp(requiredOperation), `Claude skill must teach ${requiredOperation}`);
  }
  assert.match(projectSkill, /verbArchitecture\.version:2/);
  assert.match(projectSkill, /one deep verb is valid/i);
  assert.match(projectSkill, /provider\.parity\.locked/);
  assert.match(projectSkill, /closest visible builder benchmark/i);
  assert.match(projectSkill, /0 provider tokens \/ \$0\.00/);
  for (const sharedOperation of ["list_shared_projects", "mount_shared_project", "save_shared_project", "preview_shared_project_rebase"]) {
    assert.match(projectSkill, new RegExp(sharedOperation), `Claude skill must teach ${sharedOperation}`);
  }
  assert.match(projectSkill, /revisionDigest/);
  assert.match(projectSkill, /browser storage is only a cache/i);
  assert.match(projectSkill, /automatic creative winner|No automatic winner/i);
});

test("Codex and Claude loop receipts lock identical semantic authority", () => {
  const evaluationProfile = { id: "systems", digest: `sha256:${"a".repeat(64)}` };
  const common = {
    operation: "game-loop",
    sourceDigest: `source-${"b".repeat(64)}`,
    evaluationProfile,
    passPlanId: `plan-${"c".repeat(12)}`,
  };
  const codex = createProviderParityReceipt({ ...common, provider: "codex" });
  const claude = createProviderParityReceipt({ ...common, provider: "claude" });
  assert.equal(codex.sharedContractDigest, claude.sharedContractDigest);
  assert.equal(codex.sharedContractDigest, LOOPLAB_PROVIDER_PARITY_SHARED_DIGEST);
  assert.deepEqual(codex.guarantees, claude.guarantees);
  assert.deepEqual(codex.operationSemantics, claude.operationSemantics);
  assert.deepEqual(codex.evaluationProfile, claude.evaluationProfile);
  assert.equal(codex.semanticParity, true);
  assert.equal(claude.semanticParity, true);
  assert.equal(codex.outputIdentityClaimed, false);
  assert.equal(claude.outputIdentityClaimed, false);
  assert.notEqual(codex.receiptDigest, claude.receiptDigest, "transport-specific receipts remain attributable to the provider that ran");
});

test("the shared parity contract covers the complete improvement loop without claiming identical creativity", () => {
  const contract = getProviderParityContract();
  for (const guarantee of ["projectSelection", "durableJob", "context", "structuredOutput", "authoringAuthority", "evaluation", "acceptance", "preservation", "receipts", "usage", "headlessSurface"]) {
    assert.equal(typeof contract.semantics[guarantee], "string", `${guarantee} must be a named shared guarantee`);
  }
  assert.deepEqual(Object.keys(contract.operations), ["prompt-draft", "research", "game-loop"]);
  assert.match(contract.parityBoundary, /Model creativity.*not claimed to be identical/);
  assert.equal(createProviderParityReceipt({ provider: "openai" }), null);
});

test("accepted and rejected iteration records preserve provider parity evidence", () => {
  const project = createTemplate("systems");
  const providerParity = createProviderParityReceipt({
    provider: "claude",
    operation: "game-loop",
    sourceDigest: `source-${"d".repeat(64)}`,
    evaluationProfile: { id: "systems", digest: `sha256:${"e".repeat(64)}` },
    passPlanId: "plan-systems-parity",
  });
  const first = applyAgentCommand(project, {
    op: "record_iteration_attempt",
    id: "attempt-claude-parity",
    accepted: false,
    provider: "claude",
    summary: "Rejected fixture",
    providerParity,
  });
  assert.deepEqual(first.result.entry.providerParity, providerParity);
  const second = applyAgentCommand(first.project, {
    op: "record_iteration_attempt",
    id: "attempt-claude-parity",
    accepted: false,
    provider: "claude",
    summary: "Updated without replacing parity evidence",
  });
  assert.deepEqual(second.result.entry.providerParity, providerParity);
});

test("fake Codex and Claude CLIs traverse the same loop semantics end to end", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-provider-parity-"));
  const fakeCodexPath = join(directory, "fake-codex.mjs");
  const fakeClaudePath = join(directory, "fake-claude.mjs");
  const proposal = {
    summary: "Apply the same neutral presentation change.",
    hypothesis: "Both providers should reach the same candidate and evaluator.",
    agentReviews: [],
    commands: [{ op: "set_project", changes: { background: "#242424" } }],
    scores: { playability: 8, clarity: 8, variety: 7, visual_cohesion: 8 },
  };
  try {
    await writeFile(fakeCodexPath, [
      "import { writeFileSync } from 'node:fs';",
      "const args = process.argv.slice(2);",
      "const output = args[args.indexOf('-o') + 1];",
      `writeFileSync(output, ${JSON.stringify(JSON.stringify(proposal))}, 'utf8');`,
      "process.stdout.write(JSON.stringify({type:'turn.completed',model:'parity-model',usage:{input_tokens:10,output_tokens:5,total_tokens:15}})+'\\n');",
    ].join("\n"), "utf8");
    await writeFile(fakeClaudePath, [
      `const proposal = ${JSON.stringify(proposal)};`,
      "process.stdout.write(JSON.stringify({type:'system',subtype:'init',model:'parity-model'})+'\\n');",
      "process.stdout.write(JSON.stringify({type:'result',subtype:'success',is_error:false,structured_output:proposal,usage:{input_tokens:10,output_tokens:5,total_tokens:15},total_cost_usd:0.001})+'\\n');",
    ].join("\n"), "utf8");

    const run = async (provider) => {
      const runDirectory = join(directory, provider);
      const projectPath = join(runDirectory, "project.loop.json");
      const versionsDirectory = join(runDirectory, "versions");
      await import("node:fs/promises").then(({ mkdir }) => mkdir(runDirectory, { recursive: true }));
      await writeFile(projectPath, JSON.stringify(createTemplate("platformer")), "utf8");
      const env = {
        ...process.env,
        LOOPLAB_CODEX_CLI_ENTRY: fakeCodexPath,
        LOOPLAB_CLAUDE_CLI_ENTRY: fakeClaudePath,
        LOOPLAB_PROVIDER_AUTH_METHOD: provider === "codex" ? "ChatGPT" : "Claude account",
      };
      const execution = await execFileAsync(process.execPath, [
        resolve("scripts/looplab-loop.mjs"),
        "--provider", provider,
        "--project", projectPath,
        "--versions-dir", versionsDirectory,
        "--iterations", "1",
        "--goal", "Make one provider-neutral visual metadata improvement.",
        "--evaluation-profile", "general",
        "--stop-score", "101",
        "--min-delta", "-100",
      ], { cwd: resolve("."), env });
      return {
        events: execution.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)),
        project: JSON.parse(await readFile(projectPath, "utf8")),
        history: JSON.parse(await readFile(join(versionsDirectory, "history.json"), "utf8")),
      };
    };

    const [codex, claude] = await Promise.all([run("codex"), run("claude")]);
    const codexParity = codex.events.find((event) => event.type === "provider.parity.locked")?.receipt;
    const claudeParity = claude.events.find((event) => event.type === "provider.parity.locked")?.receipt;
    assert.ok(codex.events.some((event) => event.type === "iteration.accepted"));
    assert.ok(claude.events.some((event) => event.type === "iteration.accepted"));
    assert.equal(codex.project.background, "#242424");
    assert.equal(claude.project.background, "#242424");
    assert.equal(codexParity.sharedContractDigest, claudeParity.sharedContractDigest);
    assert.deepEqual(codexParity.evaluationProfile, claudeParity.evaluationProfile);
    assert.equal(codexParity.passPlanId, claudeParity.passPlanId);
    assert.deepEqual(codex.history.attempts[0].commands, claude.history.attempts[0].commands);
    assert.deepEqual(codex.history.attempts[0].evaluation, claude.history.attempts[0].evaluation);
    assert.deepEqual(codex.history.attempts[0].comparison, claude.history.attempts[0].comparison);
    assert.equal(codex.history.attempts[0].providerParity.sharedContractDigest, claude.history.attempts[0].providerParity.sharedContractDigest);
    assert.equal(codex.history.runs.at(-1).providerParity.sharedContractDigest, claude.history.runs.at(-1).providerParity.sharedContractDigest);
    assert.equal(codex.history.runs.at(-1).usage.totalTokens, 15);
    assert.equal(claude.history.runs.at(-1).usage.totalTokens, 15);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Anthropic API prompt and loop requests use current schema-constrained output", () => {
  const original = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    required: ["answer"],
    properties: { answer: { type: "string", minLength: 2, maxLength: 12 } },
  };
  const schema = anthropicStructuredSchema(original);
  assert.equal(schema.$schema, undefined);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.answer.minLength, undefined);
  assert.match(schema.properties.answer.description, /minLength=2/);
  const request = buildAnthropicMessagesRequest({ model: "claude-sonnet-5", maxTokens: 1000, system: "system", userInput: "input", schema: original });
  assert.deepEqual(request.thinking, { type: "disabled" });
  assert.deepEqual(anthropicStructuredThinking("claude-fable-5"), { type: "adaptive" });
  assert.equal(request.output_config.format.type, "json_schema");
  assert.equal(request.output_config.format.schema.additionalProperties, false);
  assert.deepEqual(requireAnthropicStructuredResult({ stop_reason: "end_turn", content: [{ type: "text", text: '{"answer":"ok"}' }] }), { answer: "ok" });
  assert.throws(() => requireAnthropicStructuredResult({ stop_reason: "max_tokens", content: [] }), /truncated/);
  assert.throws(() => requireAnthropicStructuredResult({ stop_reason: "refusal", content: [] }), /refused/);
  assert.throws(() => requireAnthropicStructuredResult({ stop_reason: "model_context_window_exceeded", content: [] }), /exhausted the model context/);
});

test("no Anthropic creative path silently accepts free-form JSON", () => {
  for (const file of ["scripts/looplab-prompt.mjs", "scripts/looplab-loop.mjs"]) {
    const source = readFileSync(resolve(file), "utf8");
    assert.match(source, /buildAnthropicMessagesRequest/);
    assert.match(source, /requireAnthropicStructuredResult/);
    assert.match(source, /anthropic-messages-api-structured/);
  }
  const research = readFileSync(resolve("scripts/looplab-research.mjs"), "utf8");
  assert.match(research, /Anthropic API research is disabled/);
  assert.match(research, /Select Claude Code CLI/);
  assert.doesNotMatch(research, /web_search_20250305/);
});
