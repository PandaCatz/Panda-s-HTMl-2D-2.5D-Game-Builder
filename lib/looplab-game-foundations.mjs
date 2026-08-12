import { canonicalSha256 } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_GAME_FOUNDATION_REGISTRY_SCHEMA = "looplab-game-foundation-registry/v1";
export const LOOPLAB_GAME_FOUNDATION_SEARCH_SCHEMA = "looplab-game-foundation-search/v1";
export const LOOPLAB_GAME_FOUNDATION_MATERIALIZATION_SCHEMA = "looplab-game-foundation-materialization/v1";
export const LOOPLAB_GAME_FOUNDATION_IDS = Object.freeze(["platformer", "topdown", "systems", "dimetric", "kinetic"]);
export const LOOPLAB_GAME_FOUNDATION_LIMITS = Object.freeze({ maximumCandidates: 5, defaultCandidates: 5 });

const DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "platformer",
    title: "Pocket Platformer",
    family: "side-view-action",
    summary: "A compact authored side-view route with precise movement, collectibles, a hazard, a goal, deterministic acceptance, and replay proof.",
    formats: ["side-scroll", "single-screen", "connected-rooms"],
    movementTemplates: ["traditional-platformer"],
    genres: ["platformer", "metroidvania", "action-adventure", "cozy", "racing"],
    coreLoops: ["explore-collect-unlock", "practice-race-improve", "solve-open-advance"],
    descriptors: { camera: "side-view", interaction: "continuous-movement", topology: "authored-route" },
    requiredRoles: ["player", "spawn", "goal"],
  }),
  Object.freeze({
    id: "topdown",
    title: "Agent Quest",
    family: "top-down-action",
    summary: "A bounded top-down route whose relic collection unlocks the exit through deterministic gameplay state.",
    formats: ["top-down", "single-screen", "connected-rooms"],
    movementTemplates: ["top-down-action-rpg", "exploration-narrative", "twin-stick-shooter"],
    genres: ["action-adventure", "metroidvania", "puzzle", "roguelite", "survival", "stealth", "cozy"],
    coreLoops: ["explore-collect-unlock", "observe-sneak-escape", "fight-loot-upgrade", "solve-open-advance"],
    descriptors: { camera: "top-down", interaction: "continuous-movement", topology: "bounded-room" },
    requiredRoles: ["player", "spawn", "goal"],
  }),
  Object.freeze({
    id: "systems",
    title: "Lantern Market Ledger",
    family: "systems-and-choice",
    summary: "A genre-neutral deterministic choice, resource, clock, HUD, acceptance, and replay foundation for systems-led games.",
    formats: ["single-screen", "top-down"],
    movementTemplates: ["tactics-grid", "deck-combat-encounter", "exploration-narrative"],
    genres: ["puzzle", "roguelite", "survival", "tower-defense", "cozy"],
    coreLoops: ["create-test-optimize", "solve-open-advance", "gather-build-survive", "defend-upgrade-waves", "fight-loot-upgrade"],
    descriptors: { camera: "interface-led", interaction: "semantic-choice", topology: "state-graph" },
    requiredRoles: [],
  }),
  Object.freeze({
    id: "dimetric",
    title: "Dimetric World Workshop",
    family: "dimetric-exploration",
    summary: "An exact 2:1 2.5D map with grounded supports, independent height routes, navigation layers, and deterministic depth slices.",
    formats: ["dimetric", "connected-rooms"],
    movementTemplates: ["top-down-action-rpg", "exploration-narrative"],
    genres: ["action-adventure", "metroidvania", "puzzle", "stealth", "cozy"],
    coreLoops: ["explore-collect-unlock", "observe-sneak-escape", "solve-open-advance"],
    descriptors: { camera: "dimetric-2:1", interaction: "continuous-movement", topology: "layered-height-route" },
    requiredRoles: ["player", "spawn", "goal"],
  }),
  Object.freeze({
    id: "kinetic",
    title: "Kinetic City: Night Route",
    family: "momentum-route",
    summary: "A two-map momentum and traversal reference with authored rails, map joins, scoring tokens, and an executable finish witness.",
    formats: ["side-scroll", "connected-rooms"],
    movementTemplates: ["kinetic-runner"],
    genres: ["skating-tricks", "racing", "platformer", "action-adventure"],
    coreLoops: ["traverse-chain-score", "practice-race-improve", "explore-collect-unlock"],
    descriptors: { camera: "side-view", interaction: "momentum-traversal", topology: "connected-authored-routes" },
    requiredRoles: ["player", "spawn", "goal-or-portal"],
  }),
]);

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const zeroUsage = () => ({ provider: "none", measured: true, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, rateEquivalentUsd: 0 });

function stableFoundationSource(project) {
  const stable = clone(project);
  for (const key of ["iteration", "iterations", "build", "agentChangeFeed", "agentWorkLedger", "verificationEvidence", "releaseVerification", "visualReview"]) delete stable[key];
  return stable;
}

function hasStateChangingEffect(project) {
  const program = project?.gameplayProgram;
  const effectChangesState = (effect) => effect && [
    "set-variable", "add-variable", "set-variable-expression", "toggle-variable", "set-object", "set-path", "load-map",
    "respawn", "win", "impulse-player", "collect-object", "open-choice-page", "close-choice-page", "advance-clock",
  ].includes(effect.type);
  if ((program?.rules ?? []).some((rule) => (rule.effects ?? []).some(effectChangesState))) return true;
  if ((program?.choicePages ?? []).some((page) => (page.choices ?? []).some((choice) => (choice.effects ?? []).some(effectChangesState)))) return true;
  const kinds = new Set((project?.maps ?? []).flatMap((map) => map.objects ?? []).map((object) => object.kind));
  return kinds.has("coin") && (kinds.has("goal") || kinds.has("portal"));
}

function inspectFoundation(definition, project, evaluation) {
  const objects = (project?.maps ?? []).flatMap((map) => map.objects ?? []);
  const roles = new Set(objects.map((object) => object.kind));
  const acceptance = evaluation.prototypeDoctor?.acceptanceResults ?? {};
  const replay = evaluation.prototypeDoctor?.replayResults ?? {};
  const completion = evaluation.prototypeDoctor?.completionReport ?? {};
  const acceptancePassed = Number(acceptance.passedCount ?? 0) > 0 && Number(acceptance.failedCount ?? 0) === 0 && Number(acceptance.invalidCount ?? 0) === 0;
  const replayPassed = replay.passed === true;
  const completionPassed = completion.status === "passed" || completion.status === "not-applicable";
  const roleChecks = definition.requiredRoles.map((role) => ({
    role,
    passed: role === "goal-or-portal" ? roles.has("goal") || roles.has("portal") : roles.has(role),
  }));
  const stateChange = hasStateChangingEffect(project);
  const validationPassed = evaluation.validation?.valid === true;
  const prototypeBlockerFree = Number(evaluation.prototypeDoctor?.errorCount ?? 1) === 0;
  const proofComplete = validationPassed && prototypeBlockerFree && roleChecks.every((check) => check.passed) && stateChange && acceptancePassed && replayPassed && completionPassed;
  const readiness = proofComplete ? "proven-playable" : validationPassed && prototypeBlockerFree ? "validated-starter" : "blocked";
  const gaps = [];
  if (!validationPassed) gaps.push({ id: "prepared-validation-failed", area: "validation", message: `Prepared foundation validation has ${evaluation.validation?.errors?.length ?? 1} error(s).` });
  if (!prototypeBlockerFree) gaps.push({ id: "prepared-doctor-blocked", area: "doctor", message: `Prepared foundation Project Doctor has ${evaluation.prototypeDoctor?.errorCount ?? 1} prototype blocker(s).` });
  for (const check of roleChecks.filter((entry) => !entry.passed)) gaps.push({ id: `missing-role-${check.role}`, area: "gameplay", message: `Missing required authored role: ${check.role}.` });
  if (!stateChange) gaps.push({ id: "missing-state-change", area: "gameplay", message: "No proven state-changing core loop is authored." });
  if (!acceptancePassed) gaps.push({ id: "acceptance-not-proven", area: "evidence", message: "No passing executable acceptance witness proves the foundation's intended loop." });
  if (!replayPassed) gaps.push({ id: "replay-not-proven", area: "evidence", message: "No passing deterministic replay fixture protects the foundation." });
  if (!completionPassed) gaps.push({ id: "completion-not-proven", area: "evidence", message: `Completion status is ${completion.status ?? "missing"}.` });
  if (!(project?.assets ?? []).length) gaps.push({ id: "art-not-authored", area: "art", message: "No selected game-ready art assets are attached; primitive visuals are not a polish claim." });
  if (evaluation.prototypeDoctor?.narrativeReport?.present !== true) gaps.push({ id: "narrative-not-authored", area: "narrative", message: "No authored narrative contract is present; add one only when the game concept needs it." });
  if (evaluation.prototypeDoctor?.visualReadiness?.status !== "measurably-ready") gaps.push({ id: "visual-review-not-proven", area: "art", message: "Visual readiness has not been proven with source-bound captures." });
  return {
    id: definition.id,
    title: definition.title,
    family: definition.family,
    summary: definition.summary,
    formats: [...definition.formats],
    movementTemplates: [...definition.movementTemplates],
    genres: [...definition.genres],
    coreLoops: [...definition.coreLoops],
    descriptors: clone(definition.descriptors),
    readiness,
    proofComplete,
    validation: { valid: validationPassed, errorCount: evaluation.validation?.errors?.length ?? 0 },
    doctor: {
      prototype: { score: evaluation.prototypeDoctor?.score ?? 0, errorCount: evaluation.prototypeDoctor?.errorCount ?? 0, warningCount: evaluation.prototypeDoctor?.warningCount ?? 0 },
      production: { score: evaluation.productionDoctor?.score ?? 0, errorCount: evaluation.productionDoctor?.errorCount ?? 0, warningCount: evaluation.productionDoctor?.warningCount ?? 0 },
    },
    evidence: {
      acceptance: { passed: acceptancePassed, passedCount: acceptance.passedCount ?? 0, status: acceptance.status ?? "missing" },
      replay: { passed: replayPassed, passedCount: replay.passedCount ?? 0, status: replay.status ?? "missing" },
      completion: { passed: completionPassed, status: completion.status ?? "missing", proof: completion.proof ?? null },
      stateChange,
    },
    mapCount: project?.maps?.length ?? 0,
    projectionTypes: [...new Set((project?.maps ?? []).map((map) => map.projection?.type ?? project?.projection?.type ?? "orthographic"))],
    gapLedger: gaps,
    foundationDigest: canonicalSha256(stableFoundationSource(project)),
  };
}

function requireCallbacks(options) {
  if (typeof options.loadFoundation !== "function") throw new Error("Game foundation commands require the canonical foundation loader.");
  if (typeof options.evaluateFoundation !== "function") throw new Error("Game foundation commands require the canonical foundation evaluator.");
}

export function listGameFoundations(options = {}) {
  requireCallbacks(options);
  const foundations = DEFINITIONS.map((definition) => {
    const project = options.loadFoundation(definition.id);
    return inspectFoundation(definition, project, options.evaluateFoundation(project));
  });
  const registryIdentity = foundations.map((entry) => [entry.id, entry.foundationDigest, entry.readiness, entry.proofComplete]);
  return {
    schemaVersion: LOOPLAB_GAME_FOUNDATION_REGISTRY_SCHEMA,
    foundations,
    provenPlayableIds: foundations.filter((entry) => entry.proofComplete).map((entry) => entry.id),
    validatedStarterIds: foundations.filter((entry) => entry.readiness === "validated-starter").map((entry) => entry.id),
    registryDigest: canonicalSha256({ schemaVersion: LOOPLAB_GAME_FOUNDATION_REGISTRY_SCHEMA, registryIdentity }),
    providerUsage: zeroUsage(),
    policy: "A foundation is inspected from real source and evidence. Proven-playable means validation, required roles, state change, acceptance, replay, and completion all pass; it does not mean polished art, story, audio, balance, or fun.",
  };
}

function briefValue(brief, key) {
  const value = typeof brief?.[key] === "string" ? brief[key].trim() : "";
  return value && value !== "auto" ? value : null;
}

function scoreFoundation(foundation, brief) {
  let score = 0;
  const reasons = [];
  const conflicts = [];
  const tradeoffs = [];
  const match = (key, values, weight, label, hard = false) => {
    const requested = briefValue(brief, key);
    if (!requested) return;
    if (values.includes(requested)) {
      score += weight;
      reasons.push(`${label} matches ${requested}.`);
    } else if (hard) conflicts.push(`${label} ${requested} is incompatible with this foundation.`);
    else tradeoffs.push(`${label} ${requested} is not native to this foundation and needs adaptation.`);
  };
  match("format", foundation.formats, 50, "Format", true);
  match("movementTemplate", foundation.movementTemplates, 45, "Movement template", true);
  match("genre", foundation.genres, 30, "Genre");
  match("coreLoop", foundation.coreLoops, 25, "Core loop");
  const scope = briefValue(brief, "campaignScope");
  const expectedMaps = { "single-map": [1, 1], "two-connected-maps": [2, 2], "three-connected-regions": [3, 3], "four-to-six-map-campaign": [4, 6] }[scope];
  if (expectedMaps) {
    if (foundation.mapCount >= expectedMaps[0] && foundation.mapCount <= expectedMaps[1]) {
      score += 15;
      reasons.push(`Map count matches ${scope}.`);
    } else tradeoffs.push(`${scope} needs ${expectedMaps[0]}${expectedMaps[1] === expectedMaps[0] ? "" : `–${expectedMaps[1]}`} maps; this foundation begins with ${foundation.mapCount}.`);
  }
  if (foundation.proofComplete) score += 20;
  else tradeoffs.push("The technical proof ledger is incomplete; inspect the reported evidence gaps before using it.");
  return { score, reasons, conflicts, tradeoffs, compatible: conflicts.length === 0 };
}

function prepareFoundationProject(sourceProject, foundationProject) {
  const prepared = clone(foundationProject);
  for (const key of ["name", "designBrief", "doctorProfile", "packageBudgetBytes", "iteration", "build", "workstreams", "runtimeProfile", "release", "saveProgram"]) {
    if (sourceProject?.[key] !== undefined) prepared[key] = clone(sourceProject[key]);
  }
  return prepared;
}

export function suggestGameFoundations(sourceProject, options = {}) {
  requireCallbacks(options);
  const sourceDigest = options.sourceDigest ?? null;
  const registry = listGameFoundations(options);
  const allowReplacement = options.allowReplacement === true;
  const allowUnproven = options.allowUnproven === true;
  const maxCandidates = Math.max(2, Math.min(LOOPLAB_GAME_FOUNDATION_LIMITS.maximumCandidates, Number.isInteger(options.maxCandidates) ? options.maxCandidates : LOOPLAB_GAME_FOUNDATION_LIMITS.defaultCandidates));
  const candidates = registry.foundations.map((foundation) => {
    const fit = scoreFoundation(foundation, sourceProject?.designBrief);
    const foundationProject = options.loadFoundation(foundation.id);
    const preparedProject = prepareFoundationProject(sourceProject, foundationProject);
    const preparedEvaluation = options.evaluateFoundation(preparedProject);
    const preparedInspection = inspectFoundation(DEFINITIONS.find((entry) => entry.id === foundation.id), preparedProject, preparedEvaluation);
    const safe = fit.compatible && preparedInspection.validation.valid && preparedInspection.doctor.prototype.errorCount === 0;
    const replacementBlocked = !allowReplacement;
    const proofBlocked = !preparedInspection.proofComplete && !allowUnproven;
    const identity = {
      sourceDigest,
      registryDigest: registry.registryDigest,
      foundationId: foundation.id,
      foundationDigest: foundation.foundationDigest,
      preparedFoundationDigest: preparedInspection.foundationDigest,
      preparedProofComplete: preparedInspection.proofComplete,
      preparedReadiness: preparedInspection.readiness,
      preparedValidation: preparedInspection.validation,
      preparedDoctor: preparedInspection.doctor,
      fit: { score: fit.score, compatible: fit.compatible, conflicts: fit.conflicts },
      authority: { allowReplacement, allowUnproven },
    };
    const candidateDigest = canonicalSha256(identity);
    const materializable = safe && !replacementBlocked && !proofBlocked;
    return {
      ...foundation,
      fit,
      preparedReadiness: preparedInspection.readiness,
      preparedProofComplete: preparedInspection.proofComplete,
      preparedValidation: preparedInspection.validation,
      preparedDoctor: preparedInspection.doctor,
      preparedGapLedger: preparedInspection.gapLedger,
      safe,
      materializable,
      replacementBlocked,
      proofBlocked,
      candidateDigest,
      materializationRequest: materializable ? {
        op: "materialize_game_foundation",
        foundationId: foundation.id,
        expectedCandidateDigest: candidateDigest,
        expectedSourceDigest: sourceDigest,
        allowReplacement: true,
        allowUnproven,
      } : null,
    };
  }).sort((left, right) => Number(right.fit.compatible) - Number(left.fit.compatible) || right.fit.score - left.fit.score || left.id.localeCompare(right.id)).slice(0, maxCandidates);
  const report = {
    schemaVersion: LOOPLAB_GAME_FOUNDATION_SEARCH_SCHEMA,
    status: candidates.some((candidate) => candidate.materializable) ? "completed" : candidates.some((candidate) => candidate.safe) ? "review-required" : "infeasible",
    sourceDigest,
    registryDigest: registry.registryDigest,
    designBrief: clone(sourceProject?.designBrief ?? null),
    authority: { allowReplacement, allowUnproven },
    automaticWinner: null,
    agentDecisionRequired: candidates.length > 0,
    candidates,
    materializableCandidateIds: candidates.filter((candidate) => candidate.materializable).map((candidate) => candidate.id),
    providerUsage: zeroUsage(),
    decisionBoundary: "Compatibility and proof gates measure technical fit only. Art direction, fun, balance, story quality, originality, and player preference remain explicit agent or human judgments.",
    applicationPolicy: "Choose one exact candidate, materialize it into a source-bound ordinary preview batch, inspect the projected Doctor and game, then explicitly apply only on the unchanged protected variation.",
  };
  return { ...report, searchDigest: canonicalSha256({ schemaVersion: report.schemaVersion, sourceDigest, registryDigest: registry.registryDigest, candidates: candidates.map((candidate) => [candidate.id, candidate.candidateDigest, candidate.materializable]) }) };
}

export function materializeGameFoundation(sourceProject, options = {}) {
  const search = suggestGameFoundations(sourceProject, options);
  const candidate = search.candidates.find((entry) => entry.id === options.foundationId);
  if (!candidate) throw new Error(`Unknown or excluded game foundation: ${options.foundationId ?? "(missing)"}.`);
  if (candidate.candidateDigest !== options.expectedCandidateDigest) throw new Error("Game foundation candidate digest is stale or does not match the selected candidate.");
  if (!candidate.fit.compatible) throw new Error(`Game foundation ${candidate.id} conflicts with the authored directed brief.`);
  if (candidate.replacementBlocked) throw new Error("The loaded project is protected. Create or select a variation and pass allowReplacement: true before materializing a foundation.");
  if (candidate.proofBlocked) throw new Error("This foundation is not yet proven playable. Pass allowUnproven: true only after reviewing its exact gap ledger.");
  if (!candidate.safe) throw new Error(`Game foundation ${candidate.id} failed validation or Project Doctor hard gates.`);
  const foundationProject = options.loadFoundation(candidate.id);
  const preparedProject = prepareFoundationProject(sourceProject, foundationProject);
  const commands = [{ op: "replace_project", project: preparedProject }];
  const previewCommand = {
    op: "preview_batch",
    commands,
    summary: `Replace the protected variation with reviewed game foundation ${candidate.id} from ${search.registryDigest}.`,
    expectedSourceDigest: search.sourceDigest,
  };
  const receipt = {
    schemaVersion: LOOPLAB_GAME_FOUNDATION_MATERIALIZATION_SCHEMA,
    sourceDigest: search.sourceDigest,
    registryDigest: search.registryDigest,
    searchDigest: search.searchDigest,
    foundationId: candidate.id,
    candidateDigest: candidate.candidateDigest,
    preparedFoundationDigest: canonicalSha256(stableFoundationSource(preparedProject)),
    commandBatchDigest: canonicalSha256(commands),
    previewCommand,
    mutatesProject: false,
    explicitPreviewAndApplyRequired: true,
    automaticWinner: null,
    gapLedger: candidate.preparedGapLedger,
    providerUsage: zeroUsage(),
  };
  return { ...receipt, materializationDigest: canonicalSha256(receipt) };
}
