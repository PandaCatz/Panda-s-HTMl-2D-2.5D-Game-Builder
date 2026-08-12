import { validateProject } from "./looplab-agent-core.mjs";
import { canonicalSha256 } from "./looplab-canonical-digest.mjs";
import { analyzeProject } from "./looplab-doctor.mjs";
import { campaignScopeRequirement } from "./looplab-game-director.mjs";

export const LOOPLAB_LOOP_EVALUATION_PROFILE_SCHEMA = "looplab-loop-evaluation-profile/v1";
export const LOOPLAB_LOOP_EVALUATION_SCHEMA = "looplab-loop-evaluation/v2";
export const LOOPLAB_LOOP_COMPARISON_SCHEMA = "looplab-loop-comparison/v2";
export const LOOPLAB_LOOP_EVALUATION_PROFILE_IDS = Object.freeze([
  "auto",
  "general",
  "platformer",
  "top-down",
  "connected-world",
  "systems",
]);

const PROFILE_DEFINITIONS = Object.freeze({
  general: Object.freeze({
    label: "General 2D",
    description: "Genre-neutral authored play, evidence, world integrity, and measurable presentation readiness.",
    weights: Object.freeze({ integrity: 25, playability: 25, evidence: 15, world: 20, campaign: 0, systems: 0, presentation: 15 }),
  }),
  platformer: Object.freeze({
    label: "Platformer",
    description: "Live platform movement, safe starts, authored support geometry, completion evidence, and measurable presentation readiness.",
    weights: Object.freeze({ integrity: 20, playability: 25, evidence: 20, world: 25, campaign: 0, systems: 0, presentation: 10 }),
  }),
  "top-down": Object.freeze({
    label: "Top-down",
    description: "Live four-direction movement, safe placement, authored walkable space, progression evidence, and measurable presentation readiness.",
    weights: Object.freeze({ integrity: 20, playability: 25, evidence: 20, world: 25, campaign: 0, systems: 0, presentation: 10 }),
  }),
  "connected-world": Object.freeze({
    label: "Connected world",
    description: "Playable authored maps, valid runtime joins, ordered campaign reachability, evidence, and measurable presentation readiness.",
    weights: Object.freeze({ integrity: 15, playability: 20, evidence: 15, world: 15, campaign: 25, systems: 0, presentation: 10 }),
  }),
  systems: Object.freeze({
    label: "Systems & choice",
    description: "Live semantic actions, executable state changes, observable systems, evidence, and measurable presentation readiness.",
    weights: Object.freeze({ integrity: 15, playability: 20, evidence: 20, world: 10, campaign: 0, systems: 25, presentation: 10 }),
  }),
});

const round = (value, places = 1) => {
  const scale = 10 ** places;
  return Math.round(Number(value || 0) * scale) / scale;
};
const clamp = (value, minimum = 0, maximum = 100) => Math.max(minimum, Math.min(maximum, Number(value || 0)));
const ratio = (numerator, denominator, empty = 0) => denominator > 0 ? clamp((Number(numerator || 0) / denominator) * 100) : empty;
const projectMaps = (project) => project.maps?.length ? project.maps : [{ ...project, id: project.activeMapId ?? "map-main" }];
const projectObjects = (project) => projectMaps(project).flatMap((map) => map.objects ?? []);
const issueCount = (issues = [], severity = "error") => issues.filter((issue) => issue?.severity === severity).length;

const overlaps = (a, b) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

function profileSelection(project, requestedProfile) {
  if (requestedProfile && requestedProfile !== "auto") {
    if (!PROFILE_DEFINITIONS[requestedProfile]) throw new Error(`Unknown loop evaluation profile: ${requestedProfile}`);
    return { id: requestedProfile, source: "explicit", reason: `The run explicitly selected the ${requestedProfile} profile.` };
  }
  const maps = projectMaps(project);
  const campaign = campaignScopeRequirement(project?.designBrief?.campaignScope);
  if (maps.length > 1 || campaign?.requiresConnected) {
    return { id: "connected-world", source: "authored-project", reason: maps.length > 1 ? `The starting project authors ${maps.length} maps.` : `The starting brief requires ${campaign.label}.` };
  }
  const gameplayProgramPresent = Boolean(project?.gameplayProgram) || project?.qualityContracts?.gameplayProgramRequired === true;
  const authoredPlayerPresent = maps.some((map) => (map?.objects ?? []).some((object) => object?.kind === "player"));
  if (authoredPlayerPresent && project?.controlMode === "topdown") return { id: "top-down", source: "authored-project", reason: "The starting project authors a player-controlled top-down world; its gameplay program supplements that movement contract." };
  if (authoredPlayerPresent && project?.controlMode === "platformer") return { id: "platformer", source: "authored-project", reason: "The starting project authors a player-controlled platformer world; its gameplay program supplements that movement contract." };
  if (gameplayProgramPresent) return { id: "systems", source: "authored-project", reason: "The starting project authors or requires a deterministic gameplay program as its primary interaction contract." };
  if (project?.controlMode === "topdown") return { id: "top-down", source: "authored-project", reason: "The starting project uses top-down control." };
  if (project?.controlMode === "platformer") return { id: "platformer", source: "authored-project", reason: "The starting project uses platformer control." };
  return { id: "general", source: "fallback", reason: "No more specific authored project contract applies." };
}

export function selectLoopEvaluationProfile(project, options = {}) {
  const requestedProfile = typeof options === "string" ? options : options.requestedProfile ?? options.profile ?? "auto";
  if (!LOOPLAB_LOOP_EVALUATION_PROFILE_IDS.includes(requestedProfile)) throw new Error(`Unknown loop evaluation profile: ${requestedProfile}`);
  const selection = profileSelection(project, requestedProfile);
  const definition = PROFILE_DEFINITIONS[selection.id];
  const profile = {
    schemaVersion: LOOPLAB_LOOP_EVALUATION_PROFILE_SCHEMA,
    id: selection.id,
    label: definition.label,
    description: definition.description,
    source: selection.source,
    requestedProfile,
    reason: selection.reason,
    weights: { ...definition.weights },
    frozenFromStartingProject: true,
  };
  return Object.freeze({ ...profile, weights: Object.freeze(profile.weights), digest: canonicalSha256(profile) });
}

function resolveProfile(project, profile) {
  if (profile?.schemaVersion === LOOPLAB_LOOP_EVALUATION_PROFILE_SCHEMA && PROFILE_DEFINITIONS[profile.id]) return profile;
  if (typeof profile === "string") return selectLoopEvaluationProfile(project, { requestedProfile: profile });
  return selectLoopEvaluationProfile(project, { requestedProfile: "auto" });
}

function dimension(id, label, score, weight, detail, metrics = {}, limitation = null) {
  return {
    id,
    label,
    score: round(clamp(score)),
    maximum: 100,
    weight,
    applicable: weight > 0,
    detail,
    metrics,
    ...(limitation ? { limitation } : {}),
  };
}

function evidenceScore(doctor) {
  const components = [];
  const completion = doctor.completionReport ?? {};
  if (completion.status && completion.status !== "not-applicable") {
    components.push({ id: "completion", configured: true, passed: completion.passed === true, score: completion.passed === true ? 100 : 0, status: completion.status });
  }
  const acceptance = doctor.acceptanceResults ?? {};
  if (Number(acceptance.testCount || 0) > 0) {
    components.push({
      id: "acceptance",
      configured: true,
      passed: acceptance.passed === true,
      score: Number(acceptance.executableCount || 0) > 0 ? ratio(acceptance.passedCount, acceptance.executableCount) : 0,
      status: acceptance.status,
    });
  }
  const replay = doctor.replayResults ?? {};
  if (Number(replay.caseCount || 0) > 0) {
    components.push({ id: "replay", configured: true, passed: replay.passed === true, score: ratio(replay.passedCount, replay.caseCount), status: replay.status });
  }
  if (!components.length) return { score: 0, components, coverage: 0 };
  const correctness = components.reduce((total, component) => total + component.score, 0) / components.length;
  const coverage = ratio(components.length, 3);
  return { score: correctness * 0.6 + coverage * 0.4, components, coverage: round(coverage) };
}

function presentationScore(project, doctor, objects) {
  const visual = doctor.visualReadiness ?? {};
  if (visual.requested) {
    return {
      score: Number.isFinite(Number(visual.score)) ? Number(visual.score) : 0,
      metrics: { requested: true, status: visual.status, readinessScore: visual.score, ...(visual.metrics ?? {}) },
      detail: `${visual.passedCount ?? 0}/${visual.checkCount ?? 0} measurable visual-readiness checks pass.`,
    };
  }
  const primary = objects.filter((object) => ["player", "platform", "hazard", "goal"].includes(object.kind));
  const coveredPrimary = primary.filter((object) => object.assetId);
  const named = objects.filter((object) => typeof object.name === "string" && object.name.trim());
  const assetCoverage = primary.length ? ratio(coveredPrimary.length, primary.length) : ratio(objects.filter((object) => object.assetId).length, objects.length);
  const labelCoverage = ratio(new Set(named.map((object) => object.name.trim())).size, objects.length);
  return {
    score: assetCoverage * 0.7 + labelCoverage * 0.3,
    metrics: { requested: false, primaryObjectCount: primary.length, coveredPrimaryCount: coveredPrimary.length, assetCoverage: round(assetCoverage), distinctLabelCoverage: round(labelCoverage) },
    detail: `${coveredPrimary.length}/${primary.length} primary objects use assets; ${new Set(named.map((object) => object.name.trim())).size}/${objects.length} object labels are distinct.`,
  };
}

function hardGateSnapshot(validation, doctor) {
  return {
    schemaValid: validation.valid,
    doctorErrors: doctor.errorCount,
    spatialErrors: doctor.spatial?.errorCount ?? issueCount(doctor.spatial?.issues),
    acceptanceFailures: doctor.acceptanceResults?.failedCount ?? 0,
    replayFailures: doctor.replayResults?.failedCount ?? 0,
    completionPassed: doctor.completionReport?.status === "not-applicable" ? null : doctor.completionReport?.passed === true,
    deadInputActions: doctor.inputActionLiveness?.deadCount ?? 0,
    runtimeJoinErrors: issueCount(doctor.runtimeJoinPlan?.issues),
    gameplayProgramErrors: doctor.gameplayProgram?.errors?.length ?? 0,
    narrativeContractErrors: doctor.narrativeReport?.errors?.length ?? 0,
  };
}

export const doctorIssueIdentity = (issue) => [
  issue.category ?? "uncategorized",
  issue.code ?? "unknown",
  issue.mapId ?? "",
  issue.objectId ?? "",
  issue.assetId ?? "",
  issue.featureId ?? "",
  issue.beatId ?? "",
  issue.endingId ?? "",
  issue.pageId ?? "",
  issue.choiceId ?? "",
].join(":");

export function introducedDoctorErrors(beforeIssues = [], afterIssues = []) {
  const before = new Set(beforeIssues.filter((issue) => issue.severity === "error").map(doctorIssueIdentity));
  return afterIssues.filter((issue) => issue.severity === "error" && !before.has(doctorIssueIdentity(issue)));
}

export function evaluateProject(project, options = {}) {
  const profile = resolveProfile(project, options.profile ?? options.evaluationProfile ?? options);
  const validation = validateProject(project);
  const doctor = analyzeProject(project);
  const maps = projectMaps(project);
  const objects = projectObjects(project);
  const startMapId = project.startMapId ?? maps[0]?.id;
  const startMap = maps.find((map) => map.id === startMapId) ?? maps[0];
  const startObjects = startMap?.objects ?? [];
  const players = objects.filter((object) => object.kind === "player");
  const startPlayers = startObjects.filter((object) => object.kind === "player");
  const spawns = objects.filter((object) => object.kind === "spawn");
  const hazards = objects.filter((object) => object.kind === "hazard");
  const solids = objects.filter((object) => object.solid && object.kind !== "hazard");
  const dangerousStarts = [...players, ...spawns].filter((entry) => hazards.some((hazard) => overlaps(entry, hazard)));
  const outOfBounds = maps.flatMap((map) => (map.objects ?? []).filter((object) =>
    object.x < 0 || object.y < -80 || object.x + object.width > Number(map.width ?? project.width) || object.y + object.height > Number(map.height ?? project.height),
  ));
  const validMapDimensions = maps.filter((map) => Number(map.width ?? project.width) > 0 && Number(map.height ?? project.height) > 0).length;
  const input = doctor.inputActionLiveness ?? {};
  const inputScore = input.actionCount > 0 ? ratio(input.liveCount, input.actionCount) : 0;
  const gameplay = doctor.gameplayProgram ?? { present: false, errors: [], metrics: {} };
  const gameplayMetrics = gameplay.metrics ?? {};
  const behaviorCount = Number(gameplayMetrics.executableRuleCount || 0) + Number(gameplayMetrics.choiceCount || 0);
  const visibleVariableCount = (project.gameplayProgram?.variables ?? []).filter((variable) => variable.visible === true).length;
  const observableSystemCount = Number(gameplayMetrics.hudBindingCount || 0) + visibleVariableCount;

  let playability;
  if (profile.id === "systems") {
    playability = inputScore * 0.45 + (gameplay.present ? 15 : 0) + (behaviorCount > 0 ? 30 : 0) + (observableSystemCount > 0 ? 10 : 0);
  } else {
    playability = inputScore * 0.45 + (startPlayers.length === 1 ? 25 : startPlayers.length > 0 ? 12.5 : 0) + (spawns.length > 0 ? 15 : 0) + (dangerousStarts.length === 0 ? 15 : 0);
  }

  const requiredSolids = profile.id === "top-down" ? 4 : profile.id === "platformer" ? 2 : 1;
  const mapPlayerCoverage = ratio(maps.filter((map) => (map.objects ?? []).some((object) => object.kind === "player")).length, maps.length);
  const boundsScore = ratio(objects.length - outOfBounds.length, objects.length, 100);
  const namedObjects = objects.filter((object) => typeof object.name === "string" && object.name.trim());
  const labelScore = ratio(new Set(namedObjects.map((object) => object.name.trim())).size, objects.length);
  let structureScore;
  if (profile.id === "systems") structureScore = objects.length > 0 ? 100 : 0;
  else if (profile.id === "connected-world") structureScore = mapPlayerCoverage;
  else structureScore = ratio(Math.min(solids.length, requiredSolids), requiredSolids);
  const worldScore = ratio(validMapDimensions, maps.length) * 0.2 + boundsScore * 0.4 + structureScore * 0.25 + labelScore * 0.15;

  const joinPlan = doctor.runtimeJoinPlan ?? {};
  const campaignRequirement = campaignScopeRequirement(project?.designBrief?.campaignScope);
  const minMaps = campaignRequirement?.minMaps ?? 2;
  const mapCountScore = ratio(Math.min(maps.length, minMaps), minMaps);
  const joinReady = maps.length <= 1 ? 0 : joinPlan.status === "ready" ? 100 : 0;
  const joinIssueScore = issueCount(joinPlan.issues) === 0 ? 100 : Math.max(0, 100 - issueCount(joinPlan.issues) * 25);
  const campaignScore = mapCountScore * 0.35 + joinReady * 0.45 + joinIssueScore * 0.2;

  const systemsScore = (gameplay.present ? 20 : 0)
    + (gameplay.present && (gameplay.errors?.length ?? 0) === 0 ? 20 : 0)
    + (Number(gameplayMetrics.variableCount || 0) > 0 ? 15 : 0)
    + (behaviorCount > 0 ? 25 : 0)
    + (observableSystemCount > 0 ? 10 : 0)
    + (Number(gameplayMetrics.clockCount || 0) > 0 ? 10 : 0);
  const evidence = evidenceScore(doctor);
  const presentation = presentationScore(project, doctor, objects);
  const weights = profile.weights;
  const dimensions = [
    dimension("integrity", "Integrity", (validation.valid ? 50 : 0) + doctor.score * 0.5, weights.integrity, `${validation.errors.length} schema error(s), ${doctor.errorCount} Doctor blocker(s), ${doctor.warningCount} warning(s).`, { validationErrorCount: validation.errors.length, doctorScore: doctor.score, doctorErrors: doctor.errorCount, doctorWarnings: doctor.warningCount }),
    dimension("playability", "Playability", playability, weights.playability, profile.id === "systems" ? `${input.liveCount ?? 0}/${input.actionCount ?? 0} actions are live; ${behaviorCount} executable system behavior(s).` : `${input.liveCount ?? 0}/${input.actionCount ?? 0} actions are live; ${startPlayers.length} start-map player(s), ${spawns.length} spawn(s), ${dangerousStarts.length} dangerous start placement(s).`, { liveInputActions: input.liveCount ?? 0, inputActionCount: input.actionCount ?? 0, startPlayerCount: startPlayers.length, spawnCount: spawns.length, dangerousStartCount: dangerousStarts.length, executableBehaviorCount: behaviorCount }),
    dimension("evidence", "Executable evidence", evidence.score, weights.evidence, `${evidence.components.length}/3 evidence families are configured.`, { coverage: evidence.coverage, components: evidence.components }),
    dimension("world", "World authoring", worldScore, weights.world, `${maps.length} map(s), ${objects.length} authored object(s), ${outOfBounds.length} out of bounds.`, { mapCount: maps.length, objectCount: objects.length, solidCount: solids.length, outOfBoundsCount: outOfBounds.length, mapPlayerCoverage: round(mapPlayerCoverage), labelCoverage: round(labelScore) }),
    dimension("campaign", "Campaign continuity", campaignScore, weights.campaign, `${maps.length}/${minMaps} required map(s); runtime joins are ${joinPlan.status ?? "not-configured"}.`, { mapCount: maps.length, requiredMinMaps: minMaps, runtimeJoinStatus: joinPlan.status ?? "not-configured", runtimeJoinIssueCount: issueCount(joinPlan.issues) }),
    dimension("systems", "Systems & choice", systemsScore, weights.systems, `${gameplayMetrics.variableCount ?? 0} variable(s), ${behaviorCount} executable behavior(s), ${observableSystemCount} observable binding(s).`, { present: gameplay.present === true, errorCount: gameplay.errors?.length ?? 0, ...gameplayMetrics, observableSystemCount }),
    dimension("presentation", "Presentation readiness proxy", presentation.score, weights.presentation, presentation.detail, presentation.metrics, "This measures authored asset coverage, distinct labels, and declared sprite/style pipeline evidence. It does not judge taste, composition, originality, or whether the game looks good."),
  ];
  const applicable = dimensions.filter((entry) => entry.applicable);
  const score = round(applicable.reduce((total, entry) => total + entry.score * entry.weight, 0) / applicable.reduce((total, entry) => total + entry.weight, 0), 0);
  const checks = dimensions.map((entry) => ({ id: entry.id, label: entry.label, points: round(entry.score * entry.weight / 100), maximum: entry.weight, detail: entry.detail, applicable: entry.applicable }));
  const evaluation = {
    schemaVersion: LOOPLAB_LOOP_EVALUATION_SCHEMA,
    profile,
    score,
    maximum: 100,
    grade: score >= 90 ? "excellent" : score >= 75 ? "strong" : score >= 55 ? "playable" : score >= 35 ? "prototype" : "incomplete",
    valid: validation.valid,
    validation,
    gameplayScore: score,
    doctor,
    dimensions,
    checks,
    hardGates: hardGateSnapshot(validation, doctor),
    judgmentResidue: {
      aestheticApproval: "not-claimed",
      funApproval: "not-claimed",
      requiresHumanOrVisualReview: true,
      limitation: "The loop evaluator measures authored structure and executable evidence. It does not prove fun, originality, visual taste, composition, or emotional effect.",
    },
  };
  return { ...evaluation, digest: canonicalSha256({ ...evaluation, doctor: { profile: doctor.profile, digest: doctor.digest, sourceDigest: doctor.sourceDigest }, validation }) };
}

function gate(id, label, before, after, passed, detail) {
  return { id, label, before, after, passed, detail };
}

export function compareProjects(before, after, options = {}) {
  const profile = resolveProfile(before, options.profile ?? options.evaluationProfile ?? options);
  const beforeEvaluation = evaluateProject(before, { profile });
  const afterEvaluation = evaluateProject(after, { profile });
  const beforeIds = new Set(projectObjects(before).map((object) => object.id));
  const afterIds = new Set(projectObjects(after).map((object) => object.id));
  const newDoctorErrors = introducedDoctorErrors(beforeEvaluation.doctor.issues, afterEvaluation.doctor.issues);
  const beforeGates = beforeEvaluation.hardGates;
  const afterGates = afterEvaluation.hardGates;
  const hardGates = [
    gate("schema-valid", "Project schema remains valid", beforeGates.schemaValid, afterGates.schemaValid, afterGates.schemaValid === true, afterGates.schemaValid ? "Candidate schema is valid." : "Candidate schema is invalid."),
    gate("doctor-errors", "Project Doctor blockers do not increase", beforeGates.doctorErrors, afterGates.doctorErrors, newDoctorErrors.length === 0 && afterGates.doctorErrors <= beforeGates.doctorErrors, `${newDoctorErrors.length} new Doctor blocker(s).`),
    gate("spatial-errors", "Spatial blockers do not increase", beforeGates.spatialErrors, afterGates.spatialErrors, afterGates.spatialErrors <= beforeGates.spatialErrors, `${beforeGates.spatialErrors} → ${afterGates.spatialErrors} spatial blocker(s).`),
    gate("acceptance-failures", "Acceptance failures do not increase", beforeGates.acceptanceFailures, afterGates.acceptanceFailures, afterGates.acceptanceFailures <= beforeGates.acceptanceFailures, `${beforeGates.acceptanceFailures} → ${afterGates.acceptanceFailures} failed acceptance test(s).`),
    gate("replay-failures", "Replay failures do not increase", beforeGates.replayFailures, afterGates.replayFailures, afterGates.replayFailures <= beforeGates.replayFailures, `${beforeGates.replayFailures} → ${afterGates.replayFailures} failed replay case(s).`),
    gate("completion-witness", "A passing completion witness is not lost", beforeGates.completionPassed, afterGates.completionPassed, beforeGates.completionPassed !== true || afterGates.completionPassed === true, `Completion witness ${String(beforeGates.completionPassed)} → ${String(afterGates.completionPassed)}.`),
    gate("input-liveness", "Dead semantic actions do not increase", beforeGates.deadInputActions, afterGates.deadInputActions, afterGates.deadInputActions <= beforeGates.deadInputActions, `${beforeGates.deadInputActions} → ${afterGates.deadInputActions} dead action(s).`),
    gate("runtime-joins", "Runtime-join blockers do not increase", beforeGates.runtimeJoinErrors, afterGates.runtimeJoinErrors, afterGates.runtimeJoinErrors <= beforeGates.runtimeJoinErrors, `${beforeGates.runtimeJoinErrors} → ${afterGates.runtimeJoinErrors} runtime-join blocker(s).`),
    gate("gameplay-program", "Gameplay-program errors do not increase", beforeGates.gameplayProgramErrors, afterGates.gameplayProgramErrors, afterGates.gameplayProgramErrors <= beforeGates.gameplayProgramErrors, `${beforeGates.gameplayProgramErrors} → ${afterGates.gameplayProgramErrors} gameplay-program error(s).`),
    gate("narrative-contract", "Narrative-contract errors do not increase", beforeGates.narrativeContractErrors, afterGates.narrativeContractErrors, afterGates.narrativeContractErrors <= beforeGates.narrativeContractErrors, `${beforeGates.narrativeContractErrors} → ${afterGates.narrativeContractErrors} narrative-contract error(s).`),
  ];
  const dimensionComparisons = beforeEvaluation.dimensions.map((beforeDimension) => {
    const afterDimension = afterEvaluation.dimensions.find((entry) => entry.id === beforeDimension.id);
    const delta = round((afterDimension?.score ?? 0) - beforeDimension.score);
    return {
      id: beforeDimension.id,
      label: beforeDimension.label,
      applicable: beforeDimension.applicable,
      weight: beforeDimension.weight,
      before: beforeDimension.score,
      after: afterDimension?.score ?? 0,
      delta,
      regressed: beforeDimension.applicable && delta < 0,
    };
  });
  const dimensionRegressions = dimensionComparisons.filter((entry) => entry.regressed);
  const failedHardGates = hardGates.filter((entry) => !entry.passed);
  const comparison = {
    schemaVersion: LOOPLAB_LOOP_COMPARISON_SCHEMA,
    profile,
    before: beforeEvaluation,
    after: afterEvaluation,
    delta: afterEvaluation.score - beforeEvaluation.score,
    dimensionComparisons,
    dimensionRegressions,
    hardGates,
    failedHardGates,
    hardGatesPassed: failedHardGates.length === 0,
    objectDelta: projectObjects(after).length - projectObjects(before).length,
    addedObjectIds: [...afterIds].filter((id) => !beforeIds.has(id)),
    removedObjectIds: [...beforeIds].filter((id) => !afterIds.has(id)),
    changed: JSON.stringify(before) !== JSON.stringify(after),
    regressionFree: failedHardGates.length === 0 && dimensionRegressions.length === 0,
    doctorDelta: afterEvaluation.doctor.score - beforeEvaluation.doctor.score,
    newDoctorErrors,
    judgmentResidue: afterEvaluation.judgmentResidue,
  };
  return { ...comparison, digest: canonicalSha256({ ...comparison, before: beforeEvaluation.digest, after: afterEvaluation.digest, newDoctorErrors: newDoctorErrors.map(doctorIssueIdentity) }) };
}

export function compactLoopEvaluation(evaluation) {
  if (!evaluation || typeof evaluation !== "object") return evaluation ?? null;
  return {
    schemaVersion: evaluation.schemaVersion,
    digest: evaluation.digest,
    profile: evaluation.profile ? {
      schemaVersion: evaluation.profile.schemaVersion,
      id: evaluation.profile.id,
      label: evaluation.profile.label,
      source: evaluation.profile.source,
      reason: evaluation.profile.reason,
      digest: evaluation.profile.digest,
      weights: { ...(evaluation.profile.weights ?? {}) },
      frozenFromStartingProject: evaluation.profile.frozenFromStartingProject === true,
    } : null,
    score: evaluation.score,
    maximum: evaluation.maximum,
    grade: evaluation.grade,
    valid: evaluation.valid,
    dimensions: (evaluation.dimensions ?? []).map((entry) => ({
      id: entry.id,
      label: entry.label,
      score: entry.score,
      maximum: entry.maximum,
      weight: entry.weight,
      applicable: entry.applicable,
      detail: entry.detail,
      limitation: entry.limitation,
    })),
    hardGates: { ...(evaluation.hardGates ?? {}) },
    judgmentResidue: { ...(evaluation.judgmentResidue ?? {}) },
    doctor: {
      profile: evaluation.doctor?.profile,
      digest: evaluation.doctor?.digest,
      sourceDigest: evaluation.doctor?.sourceDigest,
      score: evaluation.doctor?.score,
      errorCount: evaluation.doctor?.errorCount,
      warningCount: evaluation.doctor?.warningCount,
    },
  };
}

export function compactLoopComparison(comparison) {
  if (!comparison || typeof comparison !== "object") return comparison ?? null;
  return {
    schemaVersion: comparison.schemaVersion,
    digest: comparison.digest,
    profile: compactLoopEvaluation(comparison.after)?.profile ?? null,
    beforeScore: comparison.before?.score,
    afterScore: comparison.after?.score,
    delta: comparison.delta,
    regressionFree: comparison.regressionFree,
    hardGatesPassed: comparison.hardGatesPassed,
    dimensionComparisons: (comparison.dimensionComparisons ?? []).map((entry) => ({ ...entry })),
    dimensionRegressions: (comparison.dimensionRegressions ?? []).map((entry) => ({ ...entry })),
    hardGates: (comparison.hardGates ?? []).map((entry) => ({ ...entry })),
    failedHardGates: (comparison.failedHardGates ?? []).map((entry) => ({ ...entry })),
    doctorDelta: comparison.doctorDelta,
    newDoctorErrorCodes: (comparison.newDoctorErrors ?? []).map((issue) => issue.code),
    judgmentResidue: { ...(comparison.judgmentResidue ?? {}) },
  };
}
