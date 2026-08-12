import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAgentCommand,
  buildStandaloneHtml,
  createTemplate,
  validateProject,
} from "../lib/looplab-agent-core.mjs";
import { compactQualityReport } from "../lib/looplab-provider-context.mjs";
import {
  LOOPLAB_LOOP_COMPARISON_SCHEMA,
  LOOPLAB_LOOP_EVALUATION_PROFILE_SCHEMA,
  LOOPLAB_LOOP_EVALUATION_SCHEMA,
  compactLoopComparison,
  compactLoopEvaluation,
  compareProjects,
  evaluateProject,
  selectLoopEvaluationProfile,
} from "../lib/looplab-quality.mjs";

test("auto loop profiles derive once from authored project truth across supported game shapes", () => {
  const cases = [
    ["blank", "platformer"],
    ["platformer", "platformer"],
    ["topdown", "top-down"],
    ["kinetic", "connected-world"],
    ["systems", "systems"],
  ];
  for (const [template, expected] of cases) {
    const profile = selectLoopEvaluationProfile(createTemplate(template));
    assert.equal(profile.schemaVersion, LOOPLAB_LOOP_EVALUATION_PROFILE_SCHEMA);
    assert.equal(profile.id, expected);
    assert.equal(profile.frozenFromStartingProject, true);
    assert.match(profile.digest, /^sha256:[a-f0-9]{64}$/);
  }
});

test("an explicit or auto-selected starting profile stays frozen while evaluating candidates", () => {
  const before = createTemplate("platformer");
  const profile = selectLoopEvaluationProfile(before, { requestedProfile: "auto" });
  const after = { ...before, controlMode: "topdown", designBrief: { ...(before.designBrief ?? {}), campaignScope: "two-connected-maps" } };
  const evaluation = evaluateProject(after, { profile });
  const comparison = compareProjects(before, after, { profile });
  assert.equal(profile.id, "platformer");
  assert.equal(evaluation.profile.digest, profile.digest);
  assert.equal(comparison.profile.digest, profile.digest);
  assert.equal(comparison.before.profile.id, "platformer");
  assert.equal(comparison.after.profile.id, "platformer");
});

test("systems improvements are measured as systems instead of requiring coins, hazards, or platformer solids", () => {
  const complete = createTemplate("systems");
  const before = {
    ...complete,
    gameplayProgram: {
      ...complete.gameplayProgram,
      variables: complete.gameplayProgram.variables.map((variable) => ({ ...variable, visible: false })),
      hudBindings: [],
    },
  };
  const comparison = compareProjects(before, complete, { profile: "systems" });
  assert.equal(validateProject(before).valid, true);
  assert.equal(comparison.profile.id, "systems");
  assert.ok(comparison.dimensionComparisons.find((entry) => entry.id === "systems").delta > 0);
  assert.ok(comparison.dimensionComparisons.find((entry) => entry.id === "playability").delta > 0);
  assert.equal(comparison.dimensionRegressions.length, 0);
  assert.equal(comparison.regressionFree, true);
  assert.ok(comparison.delta > 0);
});

test("connected-world join breakage is rejected even when the candidate adds objects", () => {
  const before = createTemplate("kinetic");
  const after = structuredClone(before);
  const plaza = after.maps.find((map) => map.id === "map-plaza");
  const portal = plaza.objects.find((object) => object.id === "plaza-to-river");
  portal.targetSpawnId = "missing-spawn";
  for (let index = 0; index < 6; index += 1) {
    plaza.objects.push({ id: `extra-decor-${index}`, name: `Extra decor ${index}`, kind: "decor", x: 80 + index * 24, y: 80, width: 16, height: 16, solid: false, color: "#55565c" });
  }
  const comparison = compareProjects(before, after, { profile: "connected-world" });
  assert.ok(comparison.objectDelta > 0);
  assert.equal(comparison.regressionFree, false);
  assert.ok(comparison.failedHardGates.some((entry) => entry.id === "schema-valid" || entry.id === "doctor-errors" || entry.id === "runtime-joins"));
});

test("evaluation receipts expose measurable dimensions without claiming visual taste or fun", () => {
  const evaluation = evaluateProject(createTemplate("kinetic"));
  assert.equal(evaluation.schemaVersion, LOOPLAB_LOOP_EVALUATION_SCHEMA);
  assert.equal(evaluation.profile.id, "connected-world");
  assert.deepEqual(evaluation.dimensions.filter((entry) => entry.applicable).map((entry) => entry.id), ["integrity", "playability", "evidence", "world", "campaign", "presentation"]);
  assert.equal(evaluation.judgmentResidue.aestheticApproval, "not-claimed");
  assert.equal(evaluation.judgmentResidue.funApproval, "not-claimed");
  assert.match(evaluation.dimensions.find((entry) => entry.id === "presentation").limitation, /does not judge taste/i);
  const compact = compactQualityReport(evaluation);
  assert.equal(compact.profile.id, "connected-world");
  assert.equal(compact.dimensions.length, 7);
  assert.equal(compact.judgmentResidue.aestheticApproval, "not-claimed");
});

test("iteration ledger retains compact profile comparisons while standalone HTML excludes authoring receipts", () => {
  const project = createTemplate("platformer");
  const comparison = compareProjects(project, project, { profile: "platformer" });
  assert.equal(comparison.schemaVersion, LOOPLAB_LOOP_COMPARISON_SCHEMA);
  const evaluation = compactLoopEvaluation(comparison.after);
  const comparisonReceipt = compactLoopComparison(comparison);
  const checkpoint = applyAgentCommand(project, {
    op: "checkpoint_iteration",
    id: "profile-evidence-pass",
    score: comparison.after.score,
    scoreKind: "quality",
    qualityDelta: comparison.delta,
    evaluation,
    comparison: comparisonReceipt,
  }).project;
  const entry = checkpoint.iterationHistory.find((candidate) => candidate.id === "profile-evidence-pass");
  assert.equal(entry.evaluation.profile.id, "platformer");
  assert.equal(entry.comparison.schemaVersion, LOOPLAB_LOOP_COMPARISON_SCHEMA);
  assert.match(entry.evaluation.digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(validateProject(checkpoint).valid, true);
  const html = buildStandaloneHtml(checkpoint);
  assert.doesNotMatch(html, /profile-evidence-pass/);
  assert.doesNotMatch(html, /looplab-loop-evaluation\/v2/);
});
