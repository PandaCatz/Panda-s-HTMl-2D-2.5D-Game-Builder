import assert from "node:assert/strict";
import test from "node:test";

import { buildCandidateDecisionPacket, LOOPLAB_CANDIDATE_DECISION_SCHEMA } from "../lib/looplab-candidate-decision.mjs";

const PROFILE = { id: "systems", label: "Systems & choice", digest: `sha256:${"a".repeat(64)}`, weights: { playability: 50, presentation: 50 } };
const PASSING_GATES = {
  schemaValid: true,
  doctorErrors: 0,
  spatialErrors: 0,
  acceptanceFailures: 0,
  replayFailures: 0,
  completionPassed: null,
  deadInputActions: 0,
  runtimeJoinErrors: 0,
  gameplayProgramErrors: 0,
};

function evaluation(sourceDigest, dimensions, hardGates = PASSING_GATES, profile = PROFILE) {
  return {
    schemaVersion: "looplab-loop-evaluation/v2",
    digest: `sha256:${sourceDigest.replace(/[^a-f0-9]/g, "").padEnd(64, "b").slice(0, 64)}`,
    profile,
    dimensions: dimensions.map(([id, score]) => ({ id, label: id, score, maximum: 100, weight: 50, applicable: true })),
    hardGates: { ...hardGates },
    doctor: { sourceDigest },
  };
}

function entry(id, sourceDigest, dimensions, options = {}) {
  return {
    id,
    sourceDigest,
    current: options.current === true,
    restorable: options.current !== true,
    evaluation: evaluation(sourceDigest, dimensions, options.hardGates, options.profile),
  };
}

function packet(first, second, changed = true, authoritative = {}) {
  return buildCandidateDecisionPacket({
    first,
    second,
    changed,
    delta: { doctorScore: 0, errors: 0, warnings: 0, maps: 0, objects: 0, assets: 0 },
    doctor: {
      first: { score: 100, sourceDigest: authoritative.first ?? first.sourceDigest },
      second: { score: 100, sourceDigest: authoritative.second ?? second.sourceDigest },
    },
    counts: { first: { maps: 1, objects: 3, assets: 2 }, second: { maps: 1, objects: 3, assets: 2 } },
  });
}

test("candidate decisions use Pareto relations without inventing a creative winner", () => {
  const first = entry("first", `source-${"1".repeat(64)}`, [["playability", 70], ["presentation", 70]]);
  const dominantSecond = entry("second", `source-${"2".repeat(64)}`, [["playability", 80], ["presentation", 70]], { current: true });
  const dominance = packet(first, dominantSecond);

  assert.equal(dominance.schemaVersion, LOOPLAB_CANDIDATE_DECISION_SCHEMA);
  assert.equal(dominance.technicalRelation, "second-dominates");
  assert.equal(dominance.relationBasis, "pareto-dominance");
  assert.equal(dominance.automaticWinner, null);
  assert.equal(dominance.humanDecisionRequired, true);
  assert.equal(dominance.recommendedNextStep, "preview-play-and-decide");
  assert.equal(dominance.dimensionComparisons.find((dimension) => dimension.id === "playability")?.relation, "second-better");
  assert.match(dominance.decisionBoundary, /never automatically chooses/i);
  assert.equal(dominance.nextActions.find((action) => action.candidate === "first")?.action, "restore-as-child");
  assert.equal(dominance.nextActions.find((action) => action.candidate === "second")?.action, "continue-current");
  assert.match(dominance.digest, /^sha256:[a-f0-9]{64}$/);

  const tradeoffSecond = entry("second", `source-${"2".repeat(64)}`, [["playability", 80], ["presentation", 60]], { current: true });
  const tradeoff = packet(first, tradeoffSecond);
  assert.equal(tradeoff.technicalRelation, "tradeoff");
  assert.equal(tradeoff.relationBasis, "cross-dimension-tradeoff");
  assert.equal(tradeoff.automaticWinner, null);
});

test("hard-gate feasibility constrains technical dominance but still does not choose creatively", () => {
  const first = entry("first", `source-${"3".repeat(64)}`, [["playability", 50], ["presentation", 50]]);
  const second = entry("second", `source-${"4".repeat(64)}`, [["playability", 90], ["presentation", 90]], {
    current: true,
    hardGates: { ...PASSING_GATES, replayFailures: 1 },
  });
  const decision = packet(first, second);

  assert.equal(decision.technicalRelation, "first-dominates");
  assert.equal(decision.relationBasis, "constraint-feasibility");
  assert.equal(decision.hardGates.first.passed, true);
  assert.equal(decision.hardGates.second.passed, false);
  assert.deepEqual(decision.hardGates.second.failures.map((gate) => gate.id), ["replayFailures"]);
  assert.equal(decision.automaticWinner, null);
});

test("missing, stale, or mismatched evaluation evidence is reported instead of guessed", () => {
  const first = entry("first", `source-${"5".repeat(64)}`, [["playability", 70], ["presentation", 70]]);
  const missing = { id: "second", sourceDigest: `source-${"6".repeat(64)}`, current: true, restorable: false };
  const missingDecision = packet(first, missing);
  assert.equal(missingDecision.technicalRelation, "insufficient-evidence");
  assert.equal(missingDecision.recommendedNextStep, "collect-comparable-evidence");
  assert.ok(missingDecision.evidence.missing.some((item) => /Second candidate: loop evaluation receipt/.test(item)));

  const stale = entry("second", `source-${"7".repeat(64)}`, [["playability", 80], ["presentation", 70]], { current: true });
  stale.evaluation.doctor.sourceDigest = `source-${"8".repeat(64)}`;
  const staleDecision = packet(first, stale);
  assert.equal(staleDecision.technicalRelation, "insufficient-evidence");
  assert.ok(staleDecision.evidence.missing.some((item) => /fresh source-bound evaluation/.test(item)));

  const mismatched = entry("second", `source-${"9".repeat(64)}`, [["playability", 80], ["presentation", 70]], { current: true, profile: { id: "platformer", label: "Platformer", digest: `sha256:${"c".repeat(64)}`, weights: { playability: 50, presentation: 50 } } });
  const mismatchedDecision = packet(first, mismatched);
  assert.equal(mismatchedDecision.profileComparison.compatible, false);
  assert.equal(mismatchedDecision.technicalRelation, "insufficient-evidence");
});

test("stored source claims and partial dimension vectors cannot masquerade as comparable evidence", () => {
  const first = entry("first", `source-${"a".repeat(64)}`, [["playability", 70], ["presentation", 70]]);
  const forged = entry("second", `source-${"b".repeat(64)}`, [["playability", 80], ["presentation", 80]], { current: true });
  const sourceMismatch = packet(first, forged, true, { second: `source-${"c".repeat(64)}` });
  assert.equal(sourceMismatch.technicalRelation, "insufficient-evidence");
  assert.equal(sourceMismatch.evidence.second.ledgerSourceBound, false);
  assert.ok(sourceMismatch.evidence.missing.some((item) => /ledger source digest matching restored authored source/.test(item)));

  const partial = entry("second", `source-${"d".repeat(64)}`, [["playability", 80]], { current: true });
  const partialDecision = packet(first, partial);
  assert.equal(partialDecision.technicalRelation, "insufficient-evidence");
  assert.ok(partialDecision.evidence.missing.some((item) => /applicable evaluation dimension presentation/.test(item)));
});

test("source-identical iterations are equivalent even when older receipts lack evaluations", () => {
  const sourceDigest = `source-${"d".repeat(64)}`;
  const decision = packet({ id: "first", sourceDigest, restorable: true }, { id: "second", sourceDigest, current: true }, false);
  assert.equal(decision.technicalRelation, "equivalent");
  assert.equal(decision.relationBasis, "source-identity");
  assert.equal(decision.humanDecisionRequired, false);
  assert.equal(decision.recommendedNextStep, "no-selection-needed");
  assert.equal(decision.automaticWinner, null);
});
