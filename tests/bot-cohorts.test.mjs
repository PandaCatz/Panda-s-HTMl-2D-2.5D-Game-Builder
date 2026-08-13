import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { applyAgentCommand, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { getLooplabCommandContract, validateLooplabCommandInput } from "../lib/looplab-agent-contracts.mjs";
import {
  LOOPLAB_BOT_COHORT_LIMITS,
  LOOPLAB_BOT_COHORT_REPORT_SCHEMA,
  runBotCohorts,
} from "../lib/looplab-bot-cohorts.mjs";
import { LOOPLAB_BROWSER_SESSION_COMMANDS, LOOPLAB_CORE_COMMANDS } from "../lib/looplab-command-surfaces.mjs";
import { doctorSourceDigest } from "../lib/looplab-doctor.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = join(projectRoot, "scripts", "looplab-agent.mjs");

function options(project) {
  return {
    sourceDigest: doctorSourceDigest(project),
    ticksPerRun: 120,
    idleTicks: 60,
    actionHoldTicks: 30,
    decisionTicks: 15,
    maxRuns: 6,
    seeds: [7],
    includeCompletionWitness: false,
  };
}

test("bot cohorts are deterministic, bounded, source-descriptive, read-only, and honest about design judgment", () => {
  const project = createTemplate("systems");
  const before = JSON.stringify(project);
  const first = runBotCohorts(project, options(project));
  const second = runBotCohorts(project, options(project));

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(project), before);
  assert.equal(first.schemaVersion, LOOPLAB_BOT_COHORT_REPORT_SCHEMA);
  assert.equal(first.readOnly, true);
  assert.equal(first.deterministic, true);
  assert.equal(first.providerFree, true);
  assert.equal(first.providerUsage.totalTokens, 0);
  assert.equal(first.providerUsage.rateEquivalentUsd, 0);
  assert.equal(first.config.tickRate, 60);
  assert.ok(first.summary.runCount >= 4 && first.summary.runCount <= 6);
  assert.ok(first.summary.executedTicks <= LOOPLAB_BOT_COHORT_LIMITS.maximumTotalTicks);
  assert.ok(first.runs.every((run) => /^replay-sha256-[a-f0-9]{64}$/.test(run.finalStateDigest)));
  assert.match(first.reportDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(first.proofBoundary.statement, /not human personas/i);
  assert.ok(first.proofBoundary.doesNotProve.includes("fun"));
  assert.ok(first.designQuestions.some((question) => /recurring decisions/i.test(question)));
  assert.ok(first.findings.every((finding) => finding.severity === "advisory"));
});

test("run_bot_cohorts is one strict source-bound core contract shared by Codex, Claude, MCP, browser, and CLI", async () => {
  const project = createTemplate("topdown");
  const sourceDigest = doctorSourceDigest(project);
  const before = JSON.stringify(project);
  const outcome = applyAgentCommand(project, {
    op: "run_bot_cohorts",
    expectedSourceDigest: sourceDigest,
    ticksPerRun: 60,
    idleTicks: 30,
    maxRuns: 4,
    seeds: [1],
    includeCompletionWitness: false,
  });

  assert.equal(outcome.changed, false);
  assert.equal(JSON.stringify(outcome.project), before);
  assert.equal(outcome.result.sourceDigest, sourceDigest);
  assert.equal(outcome.result.summary.runCount, 4);
  assert.throws(() => applyAgentCommand(project, { op: "run_bot_cohorts", expectedSourceDigest: "source-stale" }), /stale-source/);

  const contract = getLooplabCommandContract("run_bot_cohorts");
  assert.equal(contract.schemaPrecision, "declared");
  assert.equal(contract.annotations.readOnlyHint, true);
  assert.equal(contract.annotations.destructiveHint, false);
  assert.equal(validateLooplabCommandInput({ op: "run_bot_cohorts", expectedSourceDigest: sourceDigest, ticksPerRun: 60, maxRuns: 4 }).valid, true);
  assert.equal(validateLooplabCommandInput({ op: "run_bot_cohorts", ticksPerRun: 60, maxRuns: 4 }).valid, false);
  assert.equal(validateLooplabCommandInput({ op: "run_bot_cohorts", expectedSourceDigest: sourceDigest, tickRate: 30 }).valid, false);
  assert.equal(LOOPLAB_CORE_COMMANDS.includes("run_bot_cohorts"), true);
  assert.equal(LOOPLAB_BROWSER_SESSION_COMMANDS.includes("run_bot_cohorts"), true);

  const manifest = getAgentManifest();
  assert.equal(manifest.botCohorts.command, "run_bot_cohorts");
  assert.equal(manifest.botCohorts.limits.maximumRuns, LOOPLAB_BOT_COHORT_LIMITS.maximumRuns);
  assert.match(manifest.botCohorts.honestyPolicy, /not human personas/i);
  assert.ok(manifest.requiredWorkflow.includes("run_bot_cohorts"));
  assert.equal(manifest.designQualityProgram.stages.length, 7);
  assert.equal(manifest.designQualityProgram.stages.find((stage) => stage.id === "deterministic-bot-diagnostics")?.status, "implemented");
  assert.equal(manifest.designQualityProgram.stages.find((stage) => stage.id === "polished-cross-genre-reference-games")?.status, "open");
  assert.equal(manifest.designQualityProgram.stages.find((stage) => stage.id === "blinded-human-preference")?.status, "open");
  assert.match(manifest.designQualityProgram.claimBoundary, /matched trials and blinded human preference/i);

  const directory = await mkdtemp(join(tmpdir(), "looplab-bot-cohorts-"));
  try {
    const projectPath = join(directory, "cohorts.loop.json");
    await writeFile(projectPath, JSON.stringify(project), "utf8");
    const { stdout } = await execFileAsync(process.execPath, [
      cli,
      "bot-cohorts",
      projectPath,
      `--source-digest=${sourceDigest}`,
      "--ticks-per-run=60",
      "--idle-ticks=30",
      "--max-runs=4",
      "--seeds=1",
      "--no-completion-witness",
    ], { cwd: projectRoot, windowsHide: true });
    const parsed = JSON.parse(stdout.trim());
    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.sourceDigest, sourceDigest);
    assert.equal(parsed.report.summary.runCount, 4);
    assert.equal(parsed.report.providerUsage.totalTokens, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
