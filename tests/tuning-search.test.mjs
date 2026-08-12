import assert from "node:assert/strict";
import test from "node:test";

import { applyAgentCommand, createTemplate, validateProject } from "../lib/looplab-agent-core.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import {
  LOOPLAB_FEEL_REPORT_SCHEMA,
  LOOPLAB_TUNING_CONTRACT_SCHEMA,
  LOOPLAB_TUNING_SEARCH_SCHEMA,
  inspectTuningContract,
  measureGameFeel,
  suggestTuningContract,
} from "../lib/looplab-tuning-search.mjs";

function searchablePlatformer() {
  const project = structuredClone(createTemplate("platformer"));
  project.doctorProfile = "prototype";
  if (project.replay) project.replay.cases = [];
  project.acceptanceTests = [];
  project.featureContracts = [];
  return project;
}

test("feel reports measure the real platformer envelope without claiming fun", () => {
  const project = searchablePlatformer();
  const first = measureGameFeel(project, { sourceDigest: "source-test" });
  const second = measureGameFeel(project, { sourceDigest: "source-test" });

  assert.equal(first.schemaVersion, LOOPLAB_FEEL_REPORT_SCHEMA);
  assert.equal(first.status, "measured");
  assert.ok(first.metrics.timeToMaxSpeedMs > 0);
  assert.ok(first.metrics.maxJumpRisePx > 0);
  assert.ok(first.metrics.airTimeMs > first.metrics.timeToApexMs);
  assert.equal(first.digest, second.digest);
  assert.match(first.limitations.join(" "), /not a claim.*fun/i);
});

test("tuning contracts reject arbitrary paths and prepare an editable bounded suggestion", () => {
  const project = searchablePlatformer();
  const suggestion = suggestTuningContract(project, { maxCandidates: 4 });

  assert.equal(suggestion.available, true);
  assert.equal(suggestion.contract.schemaVersion, LOOPLAB_TUNING_CONTRACT_SCHEMA);
  assert.equal(suggestion.contract.search.maxCandidates, 4);
  assert.ok(suggestion.contract.parameters.every((parameter) => parameter.target.startsWith("movementTuning.")));
  assert.equal(inspectTuningContract(project, suggestion.contract).errors.length, 0);

  const invalid = structuredClone(suggestion.contract);
  invalid.parameters[0].target = "maps.0.objects.0.x";
  const inspection = inspectTuningContract(project, invalid);
  assert.ok(inspection.errors.some((message) => /unsupported/.test(message)));
});

test("tuning search is source-bound, read-only, hard-gated, capped, and Pareto-only", () => {
  const base = searchablePlatformer();
  const suggestion = applyAgentCommand(base, { op: "suggest_tuning_contract", maxCandidates: 4 }).result;
  const stored = applyAgentCommand(base, { op: "set_tuning_contract", contract: suggestion.contract });
  const sourceDigest = analyzeProject(stored.project).sourceDigest;
  const before = JSON.stringify(stored.project);
  const outcome = applyAgentCommand(stored.project, { op: "run_tuning_search", expectedSourceDigest: sourceDigest });
  const search = outcome.result;

  assert.equal(search.schemaVersion, LOOPLAB_TUNING_SEARCH_SCHEMA);
  assert.equal(search.sourceDigest, sourceDigest);
  assert.equal(search.automaticWinner, null);
  assert.equal(search.providerUsage.totalTokens, 0);
  assert.equal(search.providerUsage.rateEquivalentUsd, 0);
  assert.ok(search.evaluatedCandidateCount >= 2 && search.evaluatedCandidateCount <= 4);
  assert.equal(search.candidates[0].id, "tune-baseline");
  assert.equal(search.candidates[0].baseline, true);
  assert.ok(search.candidates.every((candidate) => Array.isArray(candidate.gates) && candidate.objectives.length > 0));
  assert.ok(search.paretoCandidateIds.every((id) => search.safeCandidateIds.includes(id)));
  assert.ok(search.candidates.filter((candidate) => candidate.previewCommand).every((candidate) => candidate.safe && candidate.previewCommand.op === "preview_batch"));
  assert.match(search.decisionBoundary, /do not prove fun|does not prove fun|do not.*fun/i);
  assert.equal(outcome.changed, false);
  assert.equal(JSON.stringify(outcome.project), before);
  assert.equal(validateProject(outcome.project).valid, true);
  assert.match(search.searchDigest, /^sha256:[a-f0-9]{64}$/);

  assert.throws(
    () => applyAgentCommand(stored.project, { op: "run_tuning_search", expectedSourceDigest: "source-stale" }),
    /stale-source/,
  );
});

test("changed tuning candidates keep replay regressions visible instead of rerecording fixtures", () => {
  const project = structuredClone(createTemplate("platformer"));
  const suggestion = suggestTuningContract(project, { maxCandidates: 3 });
  const stored = applyAgentCommand(project, { op: "set_tuning_contract", contract: suggestion.contract }).project;
  const sourceDigest = analyzeProject(stored).sourceDigest;
  const search = applyAgentCommand(stored, { op: "run_tuning_search", expectedSourceDigest: sourceDigest }).result;
  const changed = search.candidates.filter((candidate) => candidate.changed);

  assert.ok(changed.length > 0);
  assert.ok(changed.some((candidate) => candidate.gates.some((gate) => gate.id.includes("replay-non-regression") && gate.passed === false)));
  assert.ok(changed.filter((candidate) => !candidate.safe).every((candidate) => candidate.previewCommand === null));
});
