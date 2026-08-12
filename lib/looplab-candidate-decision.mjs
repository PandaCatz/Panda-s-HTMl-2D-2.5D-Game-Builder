import { canonicalSha256 } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_CANDIDATE_DECISION_SCHEMA = "looplab-candidate-decision/v1";
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;

const HARD_GATE_RULES = Object.freeze([
  Object.freeze({ id: "schemaValid", label: "Schema valid", passes: (value) => value === true }),
  Object.freeze({ id: "doctorErrors", label: "Project Doctor blockers", passes: (value) => Number(value) === 0 }),
  Object.freeze({ id: "spatialErrors", label: "Spatial blockers", passes: (value) => Number(value) === 0 }),
  Object.freeze({ id: "acceptanceFailures", label: "Acceptance failures", passes: (value) => Number(value) === 0 }),
  Object.freeze({ id: "replayFailures", label: "Replay failures", passes: (value) => Number(value) === 0 }),
  Object.freeze({ id: "completionPassed", label: "Completion witness", passes: (value) => value !== false }),
  Object.freeze({ id: "deadInputActions", label: "Dead semantic actions", passes: (value) => Number(value) === 0 }),
  Object.freeze({ id: "runtimeJoinErrors", label: "Runtime-join blockers", passes: (value) => Number(value) === 0 }),
  Object.freeze({ id: "gameplayProgramErrors", label: "Gameplay-program errors", passes: (value) => Number(value) === 0 }),
]);

export const LOOPLAB_CANDIDATE_JUDGMENT_PROMPTS = Object.freeze([
  Object.freeze({ id: "play-feel", label: "Play feel", question: "After playing both, which candidate feels more responsive, legible, and satisfying moment to moment?" }),
  Object.freeze({ id: "pacing-flow", label: "Pacing & flow", question: "Which candidate creates the stronger rhythm of challenge, recovery, decisions, and forward momentum?" }),
  Object.freeze({ id: "visual-composition", label: "Visual composition", question: "Which candidate has clearer hierarchy, stronger composition, and more coherent art in motion?" }),
  Object.freeze({ id: "player-clarity", label: "Player clarity", question: "Which candidate makes goals, hazards, affordances, and state changes easier to understand without explanation?" }),
  Object.freeze({ id: "overall-preference", label: "Overall preference", question: "Considering the user's stated vision, which candidate should become the next editable parent, and why?" }),
]);

function comparableDimensions(evaluation) {
  if (!Array.isArray(evaluation?.dimensions)) return [];
  return evaluation.dimensions
    .filter((dimension) => dimension?.applicable !== false && typeof dimension?.id === "string" && Number.isFinite(Number(dimension?.score)))
    .map((dimension) => ({
      id: dimension.id,
      label: String(dimension.label ?? dimension.id),
      score: Number(dimension.score),
      maximum: Number.isFinite(Number(dimension.maximum)) ? Number(dimension.maximum) : 100,
      weight: Number.isFinite(Number(dimension.weight)) ? Number(dimension.weight) : null,
    }));
}

function candidateEvidence(entry, authoritativeSourceDigest) {
  const evaluation = entry?.evaluation && typeof entry.evaluation === "object" ? entry.evaluation : null;
  const missing = [];
  const addMissing = (item) => {
    if (!missing.includes(item)) missing.push(item);
  };
  if (!evaluation) missing.push("loop evaluation receipt");
  if (evaluation && evaluation.schemaVersion !== "looplab-loop-evaluation/v2") addMissing("current loop evaluation schema");
  if (evaluation && !SHA256_DIGEST.test(evaluation.digest ?? "")) addMissing("valid evaluation digest");
  const profileId = typeof evaluation?.profile?.id === "string" ? evaluation.profile.id : null;
  const profileDigest = typeof evaluation?.profile?.digest === "string" ? evaluation.profile.digest : null;
  const profileWeights = evaluation?.profile?.weights && typeof evaluation.profile.weights === "object" && !Array.isArray(evaluation.profile.weights) ? evaluation.profile.weights : null;
  if (evaluation && !profileId) addMissing("evaluation profile id");
  if (evaluation && !SHA256_DIGEST.test(profileDigest ?? "")) addMissing("valid frozen evaluation profile digest");
  if (evaluation && !profileWeights) addMissing("frozen evaluation profile weights");
  const entrySourceDigest = typeof entry?.sourceDigest === "string" ? entry.sourceDigest : null;
  const restoredSourceDigest = typeof authoritativeSourceDigest === "string" ? authoritativeSourceDigest : null;
  const ledgerSourceBound = Boolean(entrySourceDigest && restoredSourceDigest && entrySourceDigest === restoredSourceDigest);
  if (!restoredSourceDigest) addMissing("authoritative restored source digest");
  else if (!ledgerSourceBound) addMissing("ledger source digest matching restored authored source");
  const evaluationSourceDigest = typeof evaluation?.doctor?.sourceDigest === "string" ? evaluation.doctor.sourceDigest : null;
  const sourceBound = Boolean(evaluationSourceDigest && restoredSourceDigest && ledgerSourceBound && evaluationSourceDigest === restoredSourceDigest);
  if (evaluation && !evaluationSourceDigest) addMissing("evaluation source digest");
  else if (evaluation && !sourceBound) addMissing("fresh source-bound evaluation");

  const dimensions = comparableDimensions(evaluation);
  if (evaluation && dimensions.length === 0) addMissing("applicable evaluation dimensions");
  if (evaluation && profileWeights) {
    const expected = new Map(Object.entries(profileWeights).filter(([, weight]) => Number(weight) > 0).map(([id, weight]) => [id, Number(weight)]));
    const seen = new Set();
    for (const dimension of dimensions) {
      if (seen.has(dimension.id)) addMissing(`unique applicable evaluation dimension ${dimension.id}`);
      seen.add(dimension.id);
      if (!expected.has(dimension.id)) addMissing(`profile-applicable evaluation dimension ${dimension.id}`);
      else if (dimension.weight !== expected.get(dimension.id)) addMissing(`profile-bound weight for evaluation dimension ${dimension.id}`);
    }
    for (const id of expected.keys()) {
      if (!seen.has(id)) addMissing(`applicable evaluation dimension ${id}`);
    }
  }
  const hardGateValues = evaluation?.hardGates && typeof evaluation.hardGates === "object" ? evaluation.hardGates : null;
  if (evaluation && !hardGateValues) addMissing("hard-gate snapshot");
  const gateResults = HARD_GATE_RULES.map((rule) => {
    const available = Boolean(hardGateValues && Object.hasOwn(hardGateValues, rule.id));
    const value = available ? hardGateValues[rule.id] : undefined;
    return { id: rule.id, label: rule.label, available, value: available ? value : null, passed: available && rule.passes(value) };
  });
  const unavailableGates = gateResults.filter((gate) => !gate.available);
  if (evaluation && hardGateValues && unavailableGates.length > 0) addMissing(`${unavailableGates.length} hard-gate value(s)`);
  const failedGates = gateResults.filter((gate) => gate.available && !gate.passed);
  const complete = Boolean(evaluation) && missing.length === 0;
  return {
    iterationId: entry?.id ?? null,
    sourceDigest: entrySourceDigest,
    authoritativeSourceDigest: restoredSourceDigest,
    ledgerSourceBound,
    evaluationSchemaVersion: evaluation?.schemaVersion ?? null,
    evaluationDigest: evaluation?.digest ?? null,
    evaluationSourceDigest,
    sourceBound,
    profile: profileId ? { id: profileId, label: evaluation?.profile?.label ?? profileId, digest: profileDigest } : null,
    dimensions,
    hardGates: gateResults,
    failedGates,
    complete,
    feasible: complete && failedGates.length === 0,
    missing,
  };
}

function profileComparison(firstEvidence, secondEvidence) {
  const first = firstEvidence.profile;
  const second = secondEvidence.profile;
  const compatible = Boolean(first?.id && first?.digest && second?.id && second?.digest && first.id === second.id && first.digest === second.digest);
  if (compatible) return { compatible: true, id: first.id, digest: first.digest, reason: `Both candidates use the same frozen ${first.label ?? first.id} profile.` };
  if (!first || !second) return { compatible: false, id: null, digest: null, reason: "One or both candidates are missing a frozen evaluation profile." };
  return { compatible: false, id: null, digest: null, reason: `Candidate profiles differ (${first.id} / ${second.id}) or are not bound to the same frozen profile digest.` };
}

function compareDimensions(firstEvidence, secondEvidence, compatible) {
  if (!compatible) return [];
  const secondById = new Map(secondEvidence.dimensions.map((dimension) => [dimension.id, dimension]));
  return firstEvidence.dimensions.flatMap((first) => {
    const second = secondById.get(first.id);
    if (!second) return [];
    const delta = Math.round((second.score - first.score) * 10) / 10;
    return [{
      id: first.id,
      label: first.label,
      first: first.score,
      second: second.score,
      delta,
      relation: delta > 0 ? "second-better" : delta < 0 ? "first-better" : "equal",
      weight: first.weight,
      maximum: first.maximum,
    }];
  });
}

function technicalRelation({ changed, firstEvidence, secondEvidence, dimensions, profilesCompatible }) {
  if (!changed) return { relation: "equivalent", basis: "source-identity" };
  if (!firstEvidence.complete || !secondEvidence.complete || !profilesCompatible || dimensions.length === 0) {
    return { relation: "insufficient-evidence", basis: "missing-or-incompatible-evidence" };
  }
  if (firstEvidence.feasible !== secondEvidence.feasible) {
    return { relation: firstEvidence.feasible ? "first-dominates" : "second-dominates", basis: "constraint-feasibility" };
  }
  if (!firstEvidence.feasible && !secondEvidence.feasible) return { relation: "insufficient-evidence", basis: "both-candidates-fail-hard-gates" };
  const firstWins = dimensions.some((dimension) => dimension.relation === "first-better");
  const secondWins = dimensions.some((dimension) => dimension.relation === "second-better");
  if (firstWins && !secondWins) return { relation: "first-dominates", basis: "pareto-dominance" };
  if (secondWins && !firstWins) return { relation: "second-dominates", basis: "pareto-dominance" };
  if (!firstWins && !secondWins) return { relation: "equivalent", basis: "equal-dimension-vector" };
  return { relation: "tradeoff", basis: "cross-dimension-tradeoff" };
}

function continuationAction(entry, position) {
  const current = entry?.current === true;
  const available = current || entry?.restorable === true;
  return {
    candidate: position,
    iterationId: entry?.id ?? null,
    available,
    action: !available ? "unavailable" : current ? "continue-current" : "restore-as-child",
    label: !available ? `${position === "first" ? "First" : "Second"} candidate is not restorable` : current ? `Keep ${position} candidate in the current workspace` : `Continue from ${position} candidate as a new child`,
    command: available && !current ? { op: "restore_iteration", id: entry.id } : null,
  };
}

export function buildCandidateDecisionPacket({ first, second, changed, delta, doctor, counts }) {
  const firstEvidence = candidateEvidence(first, doctor?.first?.sourceDigest);
  const secondEvidence = candidateEvidence(second, doctor?.second?.sourceDigest);
  const profile = profileComparison(firstEvidence, secondEvidence);
  const dimensionComparisons = compareDimensions(firstEvidence, secondEvidence, profile.compatible);
  const relation = technicalRelation({ changed, firstEvidence, secondEvidence, dimensions: dimensionComparisons, profilesCompatible: profile.compatible });
  const missing = [
    ...firstEvidence.missing.map((item) => `First candidate: ${item}`),
    ...secondEvidence.missing.map((item) => `Second candidate: ${item}`),
    ...(!profile.compatible ? [profile.reason] : []),
  ];
  const packet = {
    schemaVersion: LOOPLAB_CANDIDATE_DECISION_SCHEMA,
    first,
    second,
    changed,
    technicalRelation: relation.relation,
    relationBasis: relation.basis,
    automaticWinner: null,
    humanDecisionRequired: changed === true,
    recommendedNextStep: !changed ? "no-selection-needed" : relation.relation === "insufficient-evidence" ? "collect-comparable-evidence" : "preview-play-and-decide",
    profileComparison: profile,
    evidence: {
      complete: !changed || (firstEvidence.complete && secondEvidence.complete && profile.compatible && dimensionComparisons.length > 0),
      missing,
      first: firstEvidence,
      second: secondEvidence,
    },
    hardGates: {
      first: { passed: firstEvidence.feasible, failures: firstEvidence.failedGates },
      second: { passed: secondEvidence.feasible, failures: secondEvidence.failedGates },
    },
    dimensionComparisons,
    judgmentPrompts: LOOPLAB_CANDIDATE_JUDGMENT_PROMPTS.map((prompt) => ({ ...prompt })),
    nextActions: [continuationAction(first, "first"), continuationAction(second, "second")],
    decisionBoundary: "Technical gates and Pareto relations are evidence, not a creative winner. LoopLab never automatically chooses between changed candidates; preview and play both, apply the user's stated vision, then continue explicitly from one source-bound snapshot.",
    delta,
    doctor,
    counts,
  };
  return {
    ...packet,
    digest: canonicalSha256({
      schemaVersion: packet.schemaVersion,
      first: { id: first?.id ?? null, sourceDigest: first?.sourceDigest ?? null, evaluationDigest: firstEvidence.evaluationDigest },
      second: { id: second?.id ?? null, sourceDigest: second?.sourceDigest ?? null, evaluationDigest: secondEvidence.evaluationDigest },
      changed,
      technicalRelation: packet.technicalRelation,
      relationBasis: packet.relationBasis,
      profileComparison: packet.profileComparison,
      dimensionComparisons,
      hardGates: packet.hardGates,
      decisionBoundary: packet.decisionBoundary,
    }),
  };
}
