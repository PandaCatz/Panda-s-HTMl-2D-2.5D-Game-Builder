import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { getLooplabCommandContracts } from "../lib/looplab-agent-contracts.mjs";
import { applyAgentCommand, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import {
  LOOPLAB_BUILDER_BENCHMARK_COMPARISON_SCHEMA,
  LOOPLAB_BUILDER_BENCHMARK_RUN_SCHEMA,
  LOOPLAB_BUILDER_BENCHMARK_SUITE_SCHEMA,
  compareBuilderBenchmarkRuns,
  getBuilderBenchmarkSuite,
  listBuilderBenchmarks,
  validateBuilderBenchmarkReceipt,
  validateBuilderBenchmarkSuite,
} from "../lib/looplab-builder-benchmark.mjs";
import { LOOPLAB_BROWSER_SESSION_COMMANDS, LOOPLAB_CORE_COMMANDS } from "../lib/looplab-command-surfaces.mjs";

const execFileAsync = promisify(execFile);

const CALIBRATION = [
  ["platformer", "platformer-completion-route", 92, ["visual-proxy"]],
  ["topdown", "topdown-collect-unlock", 93, ["visual-proxy"]],
  ["kinetic", "two-map-round-trip-journey", 75, ["two-joins", "round-trip", "replay"]],
  ["systems", "systems-choice-economy", 100, []],
];

function providerReceipt(trialSetId, trialIndex, totalTokens, contextBudgetTokens = 32_000) {
  return applyAgentCommand(createTemplate("systems"), {
    op: "evaluate_builder_benchmark",
    benchmarkId: "systems-choice-economy",
    run: {
      provider: "openai",
      model: "fixture-model",
      scaffold: "systems",
      strategy: "ordinary-director",
      contextBudgetTokens,
      trialSetId,
      trialIndex,
      trialCount: 3,
      usage: { inputTokens: totalTokens - 100, outputTokens: 100, totalTokens, rateEquivalentUsd: totalTokens / 1_000_000 },
      toolCalls: 4,
      retries: 0,
      wallTimeMs: 1_000,
    },
  }).result;
}

test("builder benchmark registry exposes four visible genre-diverse tasks with exact digests", () => {
  const suite = getBuilderBenchmarkSuite();
  const validation = validateBuilderBenchmarkSuite(suite.tasks);
  const listed = listBuilderBenchmarks({ limit: 24 });

  assert.equal(suite.schemaVersion, LOOPLAB_BUILDER_BENCHMARK_SUITE_SCHEMA);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.equal(suite.taskCount, 4);
  assert.deepEqual(new Set(suite.tasks.map((task) => task.category)), new Set(["platformer", "top-down", "connected-world", "systems"]));
  assert.equal(listed.suiteDigest, suite.suiteDigest);
  assert.match(listed.suiteDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(listed.providerExecution, /ordinary Director/i);
  assert.match(listed.notTasteEvidence, /does not prove fun/i);
  for (const task of suite.tasks) {
    assert.match(task.taskDigest, /^sha256:[a-f0-9]{64}$/);
    assert.ok(task.prompt.length > 120);
    assert.ok(task.ordinaryDirectorConstraints.length >= 2);
    assert.ok(task.expectations.every((expectation) => expectation.statement && expectation.grader?.type));
    assert.equal(task.benchmarkPolicy.privilegedGenerationPath, false);
  }
});

test("benchmark commands have core, browser, contract, and manifest parity", () => {
  const operations = ["list_builder_benchmarks", "evaluate_builder_benchmark", "compare_builder_benchmark_runs"];
  const contracts = getLooplabCommandContracts();
  const manifest = getAgentManifest();

  for (const operation of operations) {
    assert.ok(LOOPLAB_CORE_COMMANDS.includes(operation));
    assert.ok(LOOPLAB_BROWSER_SESSION_COMMANDS.includes(operation));
    assert.ok(contracts.some((contract) => contract.op === operation));
    assert.ok(manifest.builderBenchmark.commands.includes(operation));
  }
  assert.equal(LOOPLAB_CORE_COMMANDS.length, 203);
  assert.equal(LOOPLAB_BROWSER_SESSION_COMMANDS.length, 285);
  assert.equal(manifest.builderBenchmark.providerFreeEvaluation, true);
  assert.match(manifest.builderBenchmark.evidenceBoundary, /never claims taste/i);
});

test("built-in templates produce deterministic, source-bound calibration receipts", () => {
  for (const [template, benchmarkId, score, blockerIds] of CALIBRATION) {
    const project = createTemplate(template);
    const first = applyAgentCommand(project, { op: "evaluate_builder_benchmark", benchmarkId }).result;
    const second = applyAgentCommand(project, { op: "evaluate_builder_benchmark", benchmarkId }).result;

    assert.equal(first.schemaVersion, LOOPLAB_BUILDER_BENCHMARK_RUN_SCHEMA);
    assert.equal(first.technicalFitness.requiredScore, score);
    assert.deepEqual(first.blockers.map((blocker) => blocker.id), blockerIds);
    assert.equal(first.passed, blockerIds.length === 0);
    assert.equal(first.run.provider, "none");
    assert.equal(first.run.usage.totalTokens, 0);
    assert.equal(first.run.usage.rateEquivalentUsd, 0);
    assert.deepEqual(second, first);
    assert.equal(validateBuilderBenchmarkReceipt(first).valid, true);
    assert.equal(first.evidence.doctor.current.sourceDigest, first.sourceDigest);
    assert.equal(first.evidence.doctor.release.sourceDigest, first.sourceDigest);
    assert.equal(first.evidence.standaloneAudit.valid, true);
  }
});

test("receipt validation detects exact-content tampering", () => {
  const receipt = applyAgentCommand(createTemplate("systems"), { op: "evaluate_builder_benchmark", benchmarkId: "systems-choice-economy" }).result;
  const tampered = structuredClone(receipt);
  tampered.technicalFitness.requiredScore = 1;

  const validation = validateBuilderBenchmarkReceipt(tampered);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /receiptDigest does not match/i);
});

test("deterministic comparison preserves raw deltas without a stochastic claim", () => {
  const receipt = applyAgentCommand(createTemplate("systems"), { op: "evaluate_builder_benchmark", benchmarkId: "systems-choice-economy" }).result;
  const comparison = compareBuilderBenchmarkRuns([receipt], [receipt]);

  assert.equal(comparison.schemaVersion, LOOPLAB_BUILDER_BENCHMARK_COMPARISON_SCHEMA);
  assert.equal(comparison.conclusion, "deterministic-delta");
  assert.equal(comparison.claimStrength, "one-exact-candidate-delta");
  assert.equal(comparison.deltas.requiredScore, 0);
  assert.equal(comparison.efficiency.eligible, false);
  assert.match(comparison.comparisonDigest, /^sha256:[a-f0-9]{64}$/);
});

test("provider comparison requires complete comparable trial sets and reports gate-equivalent efficiency", () => {
  const baseline = [1, 2, 3].map((index) => providerReceipt("baseline", index, 1_000));
  const candidate = [1, 2, 3].map((index) => providerReceipt("candidate", index, 700));
  const comparison = compareBuilderBenchmarkRuns(baseline, candidate);

  assert.equal(comparison.claimStrength, "provisional-repeated-trials");
  assert.equal(comparison.trials.baseline.trialCount, 3);
  assert.equal(comparison.trials.candidate.trialCount, 3);
  assert.equal(comparison.efficiency.eligible, true);
  assert.equal(comparison.deltas.totalTokens, -300);
  assert.ok(comparison.reasons.includes("gate-equivalent-token-use-decreased"));

  assert.throws(() => compareBuilderBenchmarkRuns(baseline.slice(0, 2), candidate), /incomplete|cherry-picked/i);
  const confounded = [1, 2, 3].map((index) => providerReceipt("confounded", index, 700, 64_000));
  assert.throws(() => compareBuilderBenchmarkRuns(baseline, confounded), /confounded/i);
});

test("CLI lists, evaluates, persists, and compares benchmark receipts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-builder-benchmark-"));
  const projectPath = join(directory, "systems.loop.json");
  const receiptPath = join(directory, "receipt.json");
  const comparisonPath = join(directory, "comparison.json");
  try {
    await writeFile(projectPath, JSON.stringify(createTemplate("systems")), "utf8");
    const listed = await execFileAsync(process.execPath, [resolve("scripts/looplab-agent.mjs"), "benchmarks", "systems"], { cwd: resolve(".") });
    const listEnvelope = JSON.parse(listed.stdout.trim());
    assert.equal(listEnvelope.ok, true);
    assert.deepEqual(listEnvelope.registry.tasks.map((task) => task.id), ["systems-choice-economy"]);

    const evaluated = await execFileAsync(process.execPath, [resolve("scripts/looplab-agent.mjs"), "benchmark-evaluate", projectPath, "systems-choice-economy", `--output=${receiptPath}`], { cwd: resolve(".") });
    const evaluationEnvelope = JSON.parse(evaluated.stdout.trim());
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    assert.equal(evaluationEnvelope.ok, true);
    assert.equal(receipt.passed, true);
    assert.equal(receipt.run.provider, "none");

    const compared = await execFileAsync(process.execPath, [resolve("scripts/looplab-agent.mjs"), "benchmark-compare", receiptPath, receiptPath, `--output=${comparisonPath}`], { cwd: resolve(".") });
    const comparisonEnvelope = JSON.parse(compared.stdout.trim());
    const comparison = JSON.parse(await readFile(comparisonPath, "utf8"));
    assert.equal(comparisonEnvelope.ok, true);
    assert.equal(comparison.conclusion, "deterministic-delta");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
