import { canonicalSha256 } from "./looplab-canonical-digest.mjs";
import { runReplayCase } from "./looplab-replay.mjs";
import {
  LOOPLAB_RUN_VARIATION_PROGRAM_SCHEMA,
  LOOPLAB_RUN_VARIATION_SELECTION_ALGORITHM,
  LOOPLAB_RUN_VARIATION_STATE_SCHEMA,
  normalizeRunVariationProgram,
  resolveRunVariation,
  runVariationProgramDigest,
  runVariationSelectionProgramDigest,
  validUtcRunDay,
} from "./looplab-run-variation-runtime.mjs";

export { LOOPLAB_RUN_VARIATION_PROGRAM_SCHEMA, LOOPLAB_RUN_VARIATION_SELECTION_ALGORITHM, LOOPLAB_RUN_VARIATION_STATE_SCHEMA, normalizeRunVariationProgram, resolveRunVariation, runVariationProgramDigest, runVariationSelectionProgramDigest, validUtcRunDay };

export const LOOPLAB_RUN_VARIATION_REPORT_SCHEMA = "looplab-run-variation-report/v1";
export const LOOPLAB_REPLAY_GHOST_SCHEMA = "looplab-replay-ghost/v1";
export const LOOPLAB_RUN_CODE_SCHEMA = "looplab-run-code/v1";
export const LOOPLAB_RUN_VARIATION_LIMITS = Object.freeze({
  maximumSeedLength: 128,
  maximumNamespaceLength: 96,
  maximumPools: 32,
  maximumVariantsPerPool: 32,
  maximumAssignmentsPerVariant: 64,
  maximumGhosts: 8,
  maximumGhostFrames: 4096,
  maximumAcceptanceTestIds: 64,
  maximumWeight: 1_000_000,
  maximumRunCodeCharacters: 4096,
  maximumRunCodePayloadBytes: 2048,
});

export const LOOPLAB_RUN_VARIATION_POLICY = Object.freeze({
  schemas: Object.freeze({ program: LOOPLAB_RUN_VARIATION_PROGRAM_SCHEMA, report: LOOPLAB_RUN_VARIATION_REPORT_SCHEMA, state: LOOPLAB_RUN_VARIATION_STATE_SCHEMA, ghost: LOOPLAB_REPLAY_GHOST_SCHEMA, runCode: LOOPLAB_RUN_CODE_SCHEMA }),
  selectionAlgorithm: LOOPLAB_RUN_VARIATION_SELECTION_ALGORITHM,
  seedAuthority: "Simulation resolves authored pools from one explicit seed at run start. Stable-ID order and canonical SHA-256 own selection; Math.random, renderer order, and wall-clock reads never do.",
  dailyAuthority: "The shell or agent supplies one validated UTC YYYY-MM-DD input. The deterministic simulation never reads local time or Date.now().",
  variableAuthority: "Variation assignments may target only declared typed gameplay variables. Omitted resetPolicy means run; session variables survive startRun but not full reset.",
  ghostAuthority: "Ghost trajectories are source-bound replay-derived presentation data. They never become objects, collision, overlap, gameplay, completion, save, or replay-hash truth.",
  codeAuthority: "LR1 shares a source-bound tick-zero run identity; LL1 remains the full mid-run resume code. Checksums detect corruption but do not authenticate player state or scores.",
  proofBoundary: "Structural determinism and evidence coverage do not prove that variation is balanced, fair, fun, or visually effective.",
});

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const stableId = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
const scalar = (value) => typeof value === "number" && Number.isFinite(value) || typeof value === "boolean" || typeof value === "string";
const colorPattern = /^#[0-9a-f]{6}$/;

function issue(severity, code, message, path, context = {}) {
  return { severity, code, message, path, ...context };
}

export function replayGhostSourceDigest(replayCase = {}) {
  return canonicalSha256({ schemaVersion: "looplab-replay-ghost-source/v1", replayCase: clone(replayCase) });
}

export function replayGhostTrajectoryDigest(frames = []) {
  return canonicalSha256({ schemaVersion: "looplab-replay-ghost-trajectory/v1", frames: clone(frames) });
}

export function inspectRunVariationProgram(project = {}, input = project?.runVariationProgram, options = {}) {
  const sourceDigest = typeof options.sourceDigest === "string" ? options.sourceDigest : null;
  if (input == null) return {
    schemaVersion: LOOPLAB_RUN_VARIATION_REPORT_SCHEMA,
    sourceDigest,
    present: false,
    valid: true,
    shipReady: true,
    status: "absent",
    program: null,
    programDigest: null,
    issues: [],
    errors: [],
    warnings: [],
    metrics: { poolCount: 0, variantCount: 0, assignmentCount: 0, ghostCount: 0, ghostFrameCount: 0, acceptanceTestCount: 0, coveredSeedCount: 0 },
    limits: clone(LOOPLAB_RUN_VARIATION_LIMITS),
    proofBoundary: LOOPLAB_RUN_VARIATION_POLICY.proofBoundary,
  };
  const program = normalizeRunVariationProgram(input);
  const issues = [];
  const add = (severity, code, message, path, context) => issues.push(issue(severity, code, message, path, context));
  if (!input || typeof input !== "object" || Array.isArray(input)) add("error", "run-variation-type", "runVariationProgram must be one object.", "runVariationProgram");
  if (input?.schemaVersion !== LOOPLAB_RUN_VARIATION_PROGRAM_SCHEMA) add("error", "run-variation-schema", `runVariationProgram.schemaVersion must be ${LOOPLAB_RUN_VARIATION_PROGRAM_SCHEMA}.`, "runVariationProgram.schemaVersion");
  if (input?.version !== 1) add("error", "run-variation-version", "runVariationProgram.version must be 1.", "runVariationProgram.version");
  if (typeof input?.enabled !== "boolean") add("error", "run-variation-enabled", "runVariationProgram.enabled must be boolean.", "runVariationProgram.enabled");
  if (!program.seedNamespace || program.seedNamespace.length > LOOPLAB_RUN_VARIATION_LIMITS.maximumNamespaceLength) add("error", "run-variation-namespace", `seedNamespace must contain 1 through ${LOOPLAB_RUN_VARIATION_LIMITS.maximumNamespaceLength} characters.`, "runVariationProgram.seedNamespace");
  if (!program.defaultSeed || program.defaultSeed.length > LOOPLAB_RUN_VARIATION_LIMITS.maximumSeedLength) add("error", "run-variation-default-seed", `defaultSeed must contain 1 through ${LOOPLAB_RUN_VARIATION_LIMITS.maximumSeedLength} characters.`, "runVariationProgram.defaultSeed");
  if (!program.dailyChallenge.namespace || program.dailyChallenge.namespace.length > LOOPLAB_RUN_VARIATION_LIMITS.maximumNamespaceLength) add("error", "run-variation-daily-namespace", `dailyChallenge.namespace must contain 1 through ${LOOPLAB_RUN_VARIATION_LIMITS.maximumNamespaceLength} characters.`, "runVariationProgram.dailyChallenge.namespace");
  if (program.pools.length > LOOPLAB_RUN_VARIATION_LIMITS.maximumPools) add("error", "run-variation-pool-budget", `At most ${LOOPLAB_RUN_VARIATION_LIMITS.maximumPools} variation pools are allowed.`, "runVariationProgram.pools");
  const variableDefinitions = new Map((project?.gameplayProgram?.variables ?? []).filter((variable) => stableId(variable?.id)).map((variable) => [variable.id, variable]));
  const variablePoolOwners = new Map();
  const crossPoolConflicts = new Set();
  const poolIds = new Set();
  let variantCount = 0;
  let assignmentCount = 0;
  for (const [poolIndex, pool] of program.pools.entries()) {
    const poolPath = `runVariationProgram.pools[${poolIndex}]`;
    if (!stableId(pool.id)) add("error", "run-variation-pool-id", `${poolPath}.id must be a stable ID.`, `${poolPath}.id`);
    else if (poolIds.has(pool.id)) add("error", "run-variation-pool-duplicate", `${poolPath}.id duplicates ${pool.id}.`, `${poolPath}.id`, { poolId: pool.id });
    poolIds.add(pool.id);
    if (!pool.label) add("warning", "run-variation-pool-label", `${poolPath} has no player-facing label.`, `${poolPath}.label`, { poolId: pool.id });
    if (pool.variants.length < 2 && program.enabled) add("warning", "run-variation-pool-trivial", `${poolPath} needs at least two variants to create meaningful run variation.`, `${poolPath}.variants`, { poolId: pool.id });
    if (pool.variants.length > LOOPLAB_RUN_VARIATION_LIMITS.maximumVariantsPerPool) add("error", "run-variation-variant-budget", `${poolPath} exceeds ${LOOPLAB_RUN_VARIATION_LIMITS.maximumVariantsPerPool} variants.`, `${poolPath}.variants`, { poolId: pool.id });
    const variantIds = new Set();
    for (const [variantIndex, variant] of pool.variants.entries()) {
      variantCount += 1;
      const variantPath = `${poolPath}.variants[${variantIndex}]`;
      if (!stableId(variant.id)) add("error", "run-variation-variant-id", `${variantPath}.id must be a stable ID.`, `${variantPath}.id`, { poolId: pool.id });
      else if (variantIds.has(variant.id)) add("error", "run-variation-variant-duplicate", `${variantPath}.id duplicates ${variant.id}.`, `${variantPath}.id`, { poolId: pool.id, variantId: variant.id });
      variantIds.add(variant.id);
      if (!Number.isSafeInteger(variant.weight) || variant.weight < 1 || variant.weight > LOOPLAB_RUN_VARIATION_LIMITS.maximumWeight) add("error", "run-variation-weight", `${variantPath}.weight must be an integer from 1 through ${LOOPLAB_RUN_VARIATION_LIMITS.maximumWeight}.`, `${variantPath}.weight`, { poolId: pool.id, variantId: variant.id });
      if (variant.assignments.length > LOOPLAB_RUN_VARIATION_LIMITS.maximumAssignmentsPerVariant) add("error", "run-variation-assignment-budget", `${variantPath} exceeds ${LOOPLAB_RUN_VARIATION_LIMITS.maximumAssignmentsPerVariant} assignments.`, `${variantPath}.assignments`, { poolId: pool.id, variantId: variant.id });
      const assignedIds = new Set();
      for (const [assignmentIndex, assignment] of variant.assignments.entries()) {
        assignmentCount += 1;
        const assignmentPath = `${variantPath}.assignments[${assignmentIndex}]`;
        const definition = variableDefinitions.get(assignment.variableId);
        if (!definition) add("error", "run-variation-variable-reference", `${assignmentPath}.variableId references missing gameplay variable ${assignment.variableId || "(empty)"}.`, `${assignmentPath}.variableId`, { poolId: pool.id, variantId: variant.id, variableId: assignment.variableId });
        if (stableId(assignment.variableId)) {
          const ownerPoolId = variablePoolOwners.get(assignment.variableId);
          if (ownerPoolId && ownerPoolId !== pool.id) {
            const conflictId = `${assignment.variableId}:${ownerPoolId}:${pool.id}`;
            if (!crossPoolConflicts.has(conflictId)) add("error", "run-variation-variable-pool-conflict", `${assignment.variableId} is assigned by both ${ownerPoolId} and ${pool.id}; one gameplay variable must have exactly one variation-pool owner.`, `${assignmentPath}.variableId`, { poolId: pool.id, ownerPoolId, variableId: assignment.variableId });
            crossPoolConflicts.add(conflictId);
          } else if (!ownerPoolId) variablePoolOwners.set(assignment.variableId, pool.id);
        }
        if (assignedIds.has(assignment.variableId)) add("error", "run-variation-variable-duplicate", `${variantPath} assigns ${assignment.variableId} more than once.`, `${assignmentPath}.variableId`, { poolId: pool.id, variantId: variant.id, variableId: assignment.variableId });
        assignedIds.add(assignment.variableId);
        if (!scalar(assignment.value)) add("error", "run-variation-value", `${assignmentPath}.value must be a finite JSON scalar.`, `${assignmentPath}.value`);
        else if (definition) {
          const typeMatches = definition.type === "number" ? typeof assignment.value === "number" && Number.isFinite(assignment.value) : typeof assignment.value === definition.type;
          if (!typeMatches) add("error", "run-variation-value-type", `${assignmentPath}.value must match ${assignment.variableId}'s ${definition.type} type.`, `${assignmentPath}.value`, { poolId: pool.id, variantId: variant.id, variableId: assignment.variableId });
          if (definition.type === "number" && (Number.isFinite(Number(definition.min)) && assignment.value < Number(definition.min) || Number.isFinite(Number(definition.max)) && assignment.value > Number(definition.max))) add("error", "run-variation-value-range", `${assignmentPath}.value is outside ${assignment.variableId}'s authored range.`, `${assignmentPath}.value`, { poolId: pool.id, variantId: variant.id, variableId: assignment.variableId });
        }
      }
    }
  }
  const resetPolicies = new Set(["run", "session"]);
  for (const [index, variable] of (project?.gameplayProgram?.variables ?? []).entries()) if (variable?.resetPolicy !== undefined && !resetPolicies.has(variable.resetPolicy)) add("error", "run-variation-reset-policy", `gameplayProgram.variables[${index}].resetPolicy must be run or session.`, `gameplayProgram.variables[${index}].resetPolicy`, { variableId: variable?.id });
  if (program.ghosts.length > LOOPLAB_RUN_VARIATION_LIMITS.maximumGhosts) add("error", "run-variation-ghost-budget", `At most ${LOOPLAB_RUN_VARIATION_LIMITS.maximumGhosts} replay ghosts are allowed.`, "runVariationProgram.ghosts");
  const replayCases = new Map((project?.replay?.cases ?? []).map((replayCase) => [replayCase?.id, replayCase]));
  const mapIds = new Set((project?.maps?.length ? project.maps : [{ id: project?.activeMapId ?? "map-main" }]).map((map) => map.id));
  const ghostIds = new Set();
  let ghostFrameCount = 0;
  for (const [ghostIndex, ghost] of program.ghosts.entries()) {
    const ghostPath = `runVariationProgram.ghosts[${ghostIndex}]`;
    if (!stableId(ghost.id)) add("error", "run-variation-ghost-id", `${ghostPath}.id must be a stable ID.`, `${ghostPath}.id`);
    else if (ghostIds.has(ghost.id)) add("error", "run-variation-ghost-duplicate", `${ghostPath}.id duplicates ${ghost.id}.`, `${ghostPath}.id`, { ghostId: ghost.id });
    ghostIds.add(ghost.id);
    const replayCase = replayCases.get(ghost.replayCaseId);
    if (!replayCase) add("error", "run-variation-ghost-replay", `${ghostPath}.replayCaseId references missing replay ${ghost.replayCaseId || "(empty)"}.`, `${ghostPath}.replayCaseId`, { ghostId: ghost.id });
    else if (ghost.replayDigest !== replayGhostSourceDigest(replayCase)) add("error", "run-variation-ghost-stale", `${ghostPath}.replayDigest is stale for replay ${ghost.replayCaseId}.`, `${ghostPath}.replayDigest`, { ghostId: ghost.id, replayCaseId: ghost.replayCaseId });
    if (!Number.isSafeInteger(ghost.sampleEveryTicks) || ghost.sampleEveryTicks < 1 || ghost.sampleEveryTicks > 60) add("error", "run-variation-ghost-sampling", `${ghostPath}.sampleEveryTicks must be an integer from 1 through 60.`, `${ghostPath}.sampleEveryTicks`, { ghostId: ghost.id });
    if (!colorPattern.test(ghost.color)) add("error", "run-variation-ghost-color", `${ghostPath}.color must be an opaque six-digit hex color.`, `${ghostPath}.color`, { ghostId: ghost.id });
    if (!Number.isFinite(ghost.opacity) || ghost.opacity < 0.1 || ghost.opacity > 0.9) add("error", "run-variation-ghost-opacity", `${ghostPath}.opacity must be from 0.1 through 0.9.`, `${ghostPath}.opacity`, { ghostId: ghost.id });
    if (!ghost.frames.length || ghost.frames.length > LOOPLAB_RUN_VARIATION_LIMITS.maximumGhostFrames) add("error", "run-variation-ghost-frames", `${ghostPath}.frames must contain 1 through ${LOOPLAB_RUN_VARIATION_LIMITS.maximumGhostFrames} bounded frames.`, `${ghostPath}.frames`, { ghostId: ghost.id });
    ghostFrameCount += ghost.frames.length;
    let priorTick = -1;
    for (const [frameIndex, frame] of ghost.frames.entries()) {
      const framePath = `${ghostPath}.frames[${frameIndex}]`;
      if (!Number.isSafeInteger(frame.tick) || frame.tick < 0 || frame.tick <= priorTick) add("error", "run-variation-ghost-frame-tick", `${framePath}.tick must be a strictly increasing non-negative integer.`, `${framePath}.tick`, { ghostId: ghost.id });
      priorTick = frame.tick;
      if (!mapIds.has(frame.mapId)) add("error", "run-variation-ghost-frame-map", `${framePath}.mapId references missing map ${frame.mapId || "(empty)"}.`, `${framePath}.mapId`, { ghostId: ghost.id });
      for (const field of ["x", "y", "z", "facingX"]) if (!Number.isFinite(frame[field])) add("error", "run-variation-ghost-frame-value", `${framePath}.${field} must be finite.`, `${framePath}.${field}`, { ghostId: ghost.id });
    }
    if (ghost.trajectoryDigest !== replayGhostTrajectoryDigest(ghost.frames)) add("error", "run-variation-ghost-trajectory-digest", `${ghostPath}.trajectoryDigest does not match its exact frames.`, `${ghostPath}.trajectoryDigest`, { ghostId: ghost.id });
  }
  const acceptanceIds = new Set([...(project?.acceptanceTests ?? []), ...(project?.replay?.cases ?? [])].map((entry) => entry?.id).filter(stableId));
  const seenEvidence = new Set();
  for (const [index, id] of program.acceptanceTestIds.entries()) {
    if (!stableId(id) || !acceptanceIds.has(id)) add("error", "run-variation-evidence-reference", `runVariationProgram.acceptanceTestIds[${index}] references missing acceptance or replay evidence ${id || "(empty)"}.`, `runVariationProgram.acceptanceTestIds[${index}]`, { testId: id });
    if (seenEvidence.has(id)) add("error", "run-variation-evidence-duplicate", `runVariationProgram.acceptanceTestIds duplicates ${id}.`, `runVariationProgram.acceptanceTestIds[${index}]`, { testId: id });
    seenEvidence.add(id);
  }
  if (program.acceptanceTestIds.length > LOOPLAB_RUN_VARIATION_LIMITS.maximumAcceptanceTestIds) add("error", "run-variation-evidence-budget", `At most ${LOOPLAB_RUN_VARIATION_LIMITS.maximumAcceptanceTestIds} acceptance/replay IDs are allowed.`, "runVariationProgram.acceptanceTestIds");
  const coveredSeeds = new Set((project?.replay?.cases ?? [])
    .filter((entry) => program.acceptanceTestIds.includes(entry.id))
    .map((entry) => typeof entry.runSeed === "string" && entry.runSeed.trim() ? `seed:${entry.runSeed}` : typeof entry.utcDay === "string" && entry.utcDay.trim() ? `daily:${entry.utcDay}` : null)
    .filter(Boolean)).size;
  if (program.enabled && program.pools.length && coveredSeeds < 2) add(options.strict ? "error" : "warning", "run-variation-seed-evidence", "Enabled gameplay variation needs replay coverage for at least two explicit runSeed or utcDay identities; the replay RNG seed is unrelated and does not count.", "runVariationProgram.acceptanceTestIds");
  const errors = issues.filter((entry) => entry.severity === "error").map((entry) => entry.message);
  const warnings = issues.filter((entry) => entry.severity === "warning").map((entry) => entry.message);
  let defaultState = null;
  if (!errors.length) {
    try { defaultState = resolveRunVariation(program, { seed: program.defaultSeed }); }
    catch (error) { add("error", "run-variation-resolution", error instanceof Error ? error.message : String(error), "runVariationProgram"); }
  }
  const finalErrors = issues.filter((entry) => entry.severity === "error").map((entry) => entry.message);
  return {
    schemaVersion: LOOPLAB_RUN_VARIATION_REPORT_SCHEMA,
    sourceDigest,
    present: true,
    valid: finalErrors.length === 0,
    shipReady: finalErrors.length === 0 && (program.enabled === false || !program.pools.length || coveredSeeds >= 2),
    status: finalErrors.length ? "invalid" : program.enabled && program.pools.length && coveredSeeds < 2 ? "evidence-needed" : program.enabled ? "ready" : "disabled",
    program,
    programDigest: runVariationProgramDigest(program),
    defaultState,
    issues,
    errors: finalErrors,
    warnings,
    metrics: { poolCount: program.pools.length, variantCount, assignmentCount, ghostCount: program.ghosts.length, ghostFrameCount, acceptanceTestCount: program.acceptanceTestIds.length, coveredSeedCount: coveredSeeds },
    limits: clone(LOOPLAB_RUN_VARIATION_LIMITS),
    proofBoundary: LOOPLAB_RUN_VARIATION_POLICY.proofBoundary,
  };
}

export function suggestRunVariationProgram(project = {}, options = {}) {
  const variables = (project?.gameplayProgram?.variables ?? []).filter((variable) => stableId(variable?.id)).slice(0, 3);
  const assignmentsFor = (mode) => variables.map((variable) => {
    if (variable.type === "boolean") return { variableId: variable.id, value: mode === "alternate" ? !variable.initial : Boolean(variable.initial) };
    if (variable.type === "string") return { variableId: variable.id, value: String(variable.initial ?? "") };
    const initial = Number(variable.initial ?? 0);
    const alternate = Number.isFinite(Number(variable.max)) && Number(variable.max) !== initial ? Number(variable.max) : Number.isFinite(Number(variable.min)) && Number(variable.min) !== initial ? Number(variable.min) : initial + 1;
    return { variableId: variable.id, value: mode === "alternate" ? alternate : initial };
  });
  const program = normalizeRunVariationProgram({
    schemaVersion: LOOPLAB_RUN_VARIATION_PROGRAM_SCHEMA,
    version: 1,
    enabled: variables.length > 0,
    seedNamespace: String(options.seedNamespace ?? (String(project?.name ?? "looplab-game").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "looplab-game")),
    defaultSeed: String(options.defaultSeed ?? "standard"),
    dailyChallenge: { enabled: options.dailyEnabled !== false, namespace: "daily" },
    pools: variables.length ? [{ id: "primary-variation", label: "Primary variation", variants: [
      { id: "baseline", label: "Baseline", weight: 1, assignments: assignmentsFor("baseline") },
      { id: "alternate", label: "Alternate", weight: 1, assignments: assignmentsFor("alternate") },
    ] }] : [],
    ghosts: [],
    acceptanceTestIds: [],
  });
  return { schemaVersion: "looplab-run-variation-suggestion/v1", program, warning: variables.length ? "Provider-free starter only; calibrate variants and add two explicit seed fixtures before production." : "Declare gameplay variables before authoring variation pools.", proofBoundary: LOOPLAB_RUN_VARIATION_POLICY.proofBoundary };
}

export function buildReplayGhost(project, replayCaseId, options = {}) {
  const replayCase = (project?.replay?.cases ?? []).find((entry) => entry?.id === replayCaseId);
  if (!replayCase) throw new Error(`Replay case was not found: ${replayCaseId}`);
  const sampleEveryTicks = Number(options.sampleEveryTicks ?? 2);
  if (!Number.isSafeInteger(sampleEveryTicks) || sampleEveryTicks < 1 || sampleEveryTicks > 60) throw new Error("sampleEveryTicks must be an integer from 1 through 60.");
  const result = runReplayCase(project, replayCase, { capturePlayerEveryTicks: sampleEveryTicks });
  if (result.status !== "passed") throw new Error(`Replay ${replayCaseId} must pass before it can become a ghost.`);
  const frames = clone(result.playerTrajectory ?? []);
  if (!frames.length || frames.length > LOOPLAB_RUN_VARIATION_LIMITS.maximumGhostFrames) throw new Error(`Replay ghost requires 1 through ${LOOPLAB_RUN_VARIATION_LIMITS.maximumGhostFrames} sampled frames; increase sampleEveryTicks for a long run.`);
  const ghost = normalizeRunVariationProgram({ ghosts: [{
    id: String(options.id ?? `ghost-${replayCaseId}`).trim(),
    label: String(options.label ?? replayCase.name ?? replayCaseId).trim(),
    replayCaseId,
    replayDigest: replayGhostSourceDigest(replayCase),
    trajectoryDigest: replayGhostTrajectoryDigest(frames),
    sampleEveryTicks,
    color: String(options.color ?? "#c4ccd4"),
    opacity: Number(options.opacity ?? 0.5),
    frames,
  }] }).ghosts[0];
  return { schemaVersion: "looplab-replay-ghost-preview/v1", ghost, replayResult: { caseId: result.caseId, finalHash: result.finalHash, hashVersion: result.hashVersion, tickCount: result.tickCount }, proofBoundary: LOOPLAB_RUN_VARIATION_POLICY.ghostAuthority };
}

export function createRunCodeRuntime(engine, options = {}) {
  const schemaVersion = "looplab-run-code/v1";
  const sourceDigest = String(options.sourceDigest || "");
  const programDigest = String(options.programDigest || "");
  const maximumCodeCharacters = 4096;
  const maximumPayloadBytes = 2048;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const utf8Encode = (value) => new TextEncoder().encode(String(value));
  const utf8Decode = (bytes) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  function base64UrlEncode(text) {
    const bytes = utf8Encode(text); let output = "";
    for (let index = 0; index < bytes.length; index += 3) {
      const first = bytes[index]; const second = index + 1 < bytes.length ? bytes[index + 1] : null; const third = index + 2 < bytes.length ? bytes[index + 2] : null;
      const value = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
      output += alphabet[(value >>> 18) & 63] + alphabet[(value >>> 12) & 63];
      if (second !== null) output += alphabet[(value >>> 6) & 63];
      if (third !== null) output += alphabet[value & 63];
    }
    return output;
  }
  function base64UrlDecode(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error("Run payload is not canonical base64url.");
    const bytes = [];
    for (let index = 0; index < value.length; index += 4) {
      const count = Math.min(4, value.length - index); const indexes = [0, 1, 2, 3].map((offset) => offset < count ? alphabet.indexOf(value[index + offset]) : 0);
      if (indexes.slice(0, count).some((entry) => entry < 0)) throw new Error("Run payload contains an invalid base64url character.");
      const combined = (indexes[0] << 18) | (indexes[1] << 12) | (indexes[2] << 6) | indexes[3];
      bytes.push((combined >>> 16) & 255); if (count >= 3) bytes.push((combined >>> 8) & 255); if (count >= 4) bytes.push(combined & 255);
    }
    return utf8Decode(new Uint8Array(bytes));
  }
  function checksum(text) { let hash = 2166136261; for (const byte of utf8Encode(text)) { hash ^= byte; hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, "0"); }
  function exportCode() {
    const state = engine.getRunVariationState();
    const payload = { schemaVersion, sourceDigest, programDigest, mode: state.mode, seed: state.seed, utcDay: state.utcDay, selectionDigest: state.selectionDigest };
    const json = JSON.stringify(payload);
    if (utf8Encode(json).byteLength > maximumPayloadBytes) throw new Error(`Run payload exceeds ${maximumPayloadBytes} bytes.`);
    const code = `LR1.${base64UrlEncode(json)}.${checksum(json)}`;
    if (code.length > maximumCodeCharacters) throw new Error(`Run code exceeds ${maximumCodeCharacters} characters.`);
    return code;
  }
  function inspectCode(code) {
    const errors = []; let payload = null; let resolved = null; const value = typeof code === "string" ? code.trim() : "";
    if (!value || value.length > maximumCodeCharacters) errors.push(`Run code must contain 1 through ${maximumCodeCharacters} characters.`);
    const match = /^LR1\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(value); if (!match) errors.push("Run code must use the canonical LR1 base64url format.");
    if (!errors.length) try {
      const json = base64UrlDecode(match[1]);
      if (utf8Encode(json).byteLength > maximumPayloadBytes) throw new Error(`Run payload exceeds ${maximumPayloadBytes} bytes.`);
      if (checksum(json) !== match[2]) throw new Error("Run checksum does not match; the code may be damaged.");
      payload = JSON.parse(json);
      const keys = Object.keys(payload || {}).sort(); const expected = ["mode", "programDigest", "schemaVersion", "seed", "selectionDigest", "sourceDigest", "utcDay"];
      if (JSON.stringify(keys) !== JSON.stringify(expected)) throw new Error("Run payload contains unknown or missing fields.");
      if (payload.schemaVersion !== schemaVersion) throw new Error(`Run payload must use ${schemaVersion}.`);
      if (payload.sourceDigest !== sourceDigest) throw new Error("Run code belongs to a different exported game revision.");
      if (payload.programDigest !== programDigest) throw new Error("Run code belongs to a different run-variation program.");
      if (!["standard", "daily"].includes(payload.mode)) throw new Error("Run payload mode is invalid.");
      resolved = engine.previewRunVariation(payload.mode === "daily" ? { mode: "daily", utcDay: payload.utcDay } : { mode: "standard", seed: payload.seed });
      if (resolved.seed !== payload.seed || resolved.selectionDigest !== payload.selectionDigest) throw new Error("Run payload selection does not match current deterministic source.");
    } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    return { schemaVersion, valid: errors.length === 0, sourceDigest: payload?.sourceDigest ?? null, programDigest: payload?.programDigest ?? null, mode: payload?.mode ?? null, seed: payload?.seed ?? null, utcDay: payload?.utcDay ?? null, selectionDigest: payload?.selectionDigest ?? null, errors, integrity: errors.length ? "invalid" : "checksum-valid-not-authenticated" };
  }
  function importCode(code) {
    const inspection = inspectCode(code); if (!inspection.valid) return { ok: false, error: inspection.errors[0], inspection };
    const state = inspection.mode === "daily" ? engine.startDailyChallenge({ utcDay: inspection.utcDay }) : engine.startRun({ seed: inspection.seed });
    return { ok: true, state, inspection };
  }
  return { exportCode, inspectCode, importCode, getStatus: () => ({ schemaVersion, enabled: Boolean(programDigest), sourceDigest, programDigest, limits: { maximumCodeCharacters, maximumPayloadBytes }, integrityBoundary: "Checksum-valid means not accidentally corrupted; it is not authentication or trusted-score evidence." }) };
}
