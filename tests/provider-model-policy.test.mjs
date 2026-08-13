import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildClaudeCliInvocation } from "../lib/looplab-claude-cli.mjs";
import {
  LOOPLAB_PROVIDER_MODEL_POLICY,
  LOOPLAB_PROVIDER_PURPOSES,
  LOOPLAB_VISUAL_MODEL_BENCHMARK_PROFILE_DIGEST,
  buildCodexCliInvocation,
  createProviderModelSelectionReceipt,
  createVisualModelBenchmarkReceipt,
  resolveAnthropicVisualModelPolicy,
  resolveClaudeCliModelPolicy,
  validateVisualModelBenchmarkReceipt,
} from "../lib/looplab-provider-model-policy.mjs";
import { createUsageReceipt } from "../lib/looplab-provider-usage.mjs";

const schema = { type: "object", additionalProperties: false, properties: { answer: { type: "string" } }, required: ["answer"] };

function valueAfter(args, flag) {
  return args[args.indexOf(flag) + 1];
}

function qualifyingSonnetBenchmark(candidateModel = "claude-sonnet-5") {
  return createVisualModelBenchmarkReceipt({
    candidateModel,
    evaluator: { kind: "human-blinded", rubricDigest: `sha256:${"d".repeat(64)}` },
    conclusion: "sonnet-better",
    trials: [0, 1, 2].map((index) => ({
      id: `matched-${index + 1}`,
      inputDigest: `sha256:${String(index + 1).repeat(64)}`,
      evaluationDigest: `sha256:${String(index + 4).repeat(64)}`,
      opus: { model: "claude-opus-5", score: 84 + index, hardFailure: false },
      sonnet: { model: candidateModel, score: 88 + index, hardFailure: false },
      preference: index < 2 ? "sonnet" : "tie",
    })),
  });
}

test("every Claude CLI purpose pins Claude Opus 5 at max effort", () => {
  for (const purpose of LOOPLAB_PROVIDER_PURPOSES) {
    const invocation = buildClaudeCliInvocation({ prompt: "Return one answer.", schema, purpose, env: {} });
    assert.equal(valueAfter(invocation.args, "--model"), "claude-opus-5", purpose);
    assert.equal(valueAfter(invocation.args, "--effort"), "max", purpose);
    assert.equal(invocation.modelPolicy.modelSource, "policy-default", purpose);
    assert.equal(invocation.modelPolicy.silentModelFallbackAllowed, false, purpose);
  }
  assert.equal(LOOPLAB_PROVIDER_MODEL_POLICY.claudeCli.defaultModel, "claude-opus-5");
  assert.equal(LOOPLAB_PROVIDER_MODEL_POLICY.claudeCli.defaultEffort, "max");
});

test("every Codex CLI purpose pins GPT-5.6 Sol and max reasoning in the spawned args", () => {
  for (const purpose of LOOPLAB_PROVIDER_PURPOSES) {
    const baseArgs = purpose === "research" ? ["--search", "exec", "--json", "prompt"] : ["exec", "--json", "prompt"];
    const invocation = buildCodexCliInvocation(baseArgs, { purpose, env: {} });
    const execIndex = invocation.args.indexOf("exec");
    assert.deepEqual(invocation.args.slice(execIndex + 1, execIndex + 5), [
      "--model",
      "gpt-5.6-sol",
      "--config",
      'model_reasoning_effort="max"',
    ], purpose);
    assert.equal(invocation.modelPolicy.silentModelFallbackAllowed, false, purpose);
  }
});

test("visual critique defaults to Opus 5 and accepts Sonnet only after a verified matched benchmark win", () => {
  assert.throws(
    () => resolveClaudeCliModelPolicy({ purpose: "visual-critique", env: { LOOPLAB_CLAUDE_VISION_MODEL: "sonnet" } }),
    /matched benchmark receipt/i,
  );
  assert.throws(
    () => resolveAnthropicVisualModelPolicy({ env: { LOOPLAB_ANTHROPIC_VISION_MODEL: "claude-sonnet-5" } }),
    /matched benchmark receipt/i,
  );

  assert.throws(
    () => resolveClaudeCliModelPolicy({
      purpose: "visual-critique",
      env: { LOOPLAB_CLAUDE_VISION_MODEL: "claude-sonnet-5", LOOPLAB_CLAUDE_VISION_SONNET_EVIDENCE: `sha256:${"a".repeat(64)}` },
    }),
    /No qualifying receipt|benchmark receipt/i,
    "a digest-shaped environment string is not benchmark evidence",
  );

  const benchmark = qualifyingSonnetBenchmark();
  const validation = validateVisualModelBenchmarkReceipt(benchmark, { requestedModel: "claude-sonnet-5" });
  assert.equal(validation.eligible, true, validation.errors.join("\n"));
  assert.equal(validation.metrics.trialCount, 3);
  assert.equal(validation.metrics.sonnetWins, 2);
  assert.equal(benchmark.profileDigest, LOOPLAB_VISUAL_MODEL_BENCHMARK_PROFILE_DIGEST);
  const claude = resolveClaudeCliModelPolicy({
    purpose: "visual-critique",
    env: { LOOPLAB_CLAUDE_VISION_MODEL: "claude-sonnet-5" },
    sonnetEvidenceReceipt: benchmark,
  });
  assert.equal(claude.model, "claude-sonnet-5");
  assert.equal(claude.evidenceDigest, benchmark.receiptDigest);
  assert.match(claude.selectionReason, /proved that exact model beat Claude Opus 5/);

  const tampered = { ...benchmark, conclusion: "opus-better" };
  const tamperedValidation = validateVisualModelBenchmarkReceipt(tampered, { requestedModel: "claude-sonnet-5" });
  assert.equal(tamperedValidation.eligible, false);
  assert.match(tamperedValidation.errors.join("\n"), /conclusion|receiptDigest/);

  const anthropicDefault = resolveAnthropicVisualModelPolicy({ env: {} });
  assert.equal(anthropicDefault.model, "claude-opus-5");
  assert.equal(anthropicDefault.silentModelFallbackAllowed, false);
});

test("usage receipts distinguish explicit launch policy from provider-reported model identity", () => {
  const invocation = buildCodexCliInvocation(["exec", "prompt"], { purpose: "game-iteration", env: {} });
  const selection = createProviderModelSelectionReceipt(invocation.modelPolicy, { providerReportedModel: "gpt-5.6-sol-2026-08-01" });
  const receipt = createUsageReceipt({
    provider: "codex",
    model: "gpt-5.6-sol-2026-08-01",
    usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
    modelSelection: selection,
  });
  assert.equal(receipt.modelSelection.requestedModel, "gpt-5.6-sol");
  assert.equal(receipt.modelSelection.launchEffort, "max");
  assert.equal(receipt.modelSelection.providerReportedModel, "gpt-5.6-sol-2026-08-01");
  assert.equal(receipt.modelSelection.providerReportedEffort, null, "the receipt must not invent telemetry the CLI did not report");
  assert.equal(receipt.modelSelection.effortEvidence, "explicit-launch-argument");
});

test("every real creative launch path consumes the centralized policy instead of inherited defaults", async () => {
  for (const file of [
    "scripts/looplab-prompt.mjs",
    "scripts/looplab-loop.mjs",
    "scripts/looplab-research.mjs",
    "scripts/looplab-visual-critique.mjs",
  ]) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /buildCodexCliInvocation/, `${file} Codex policy`);
    assert.match(source, /buildClaudeCliInvocation/, `${file} Claude policy`);
    assert.doesNotMatch(source, /\?\?\s*"haiku"/, `${file} must not retain a Haiku fallback`);
  }
  const appSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(appSource, /useState<AgentProvider>\("claude"\)/, "mouse UI must default visual critique to Claude");
  assert.match(appSource, /Claude Code CLI · Opus 5/, "mouse UI must state its exact visual default");
  const visualRunner = await readFile(new URL("../scripts/looplab-visual-critique.mjs", import.meta.url), "utf8");
  assert.match(visualRunner, /LOOPLAB_VISUAL_CRITIQUE_MODEL_BENCHMARK/);
  assert.match(visualRunner, /sonnetEvidenceReceipt: modelBenchmarkReceipt/);
});
