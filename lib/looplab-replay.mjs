import { sha256Hex } from "./looplab-canonical-digest.mjs";
import { createRuntimeModel } from "./looplab-runtime-instance.mjs";
import { LOOPLAB_RUNTIME_OBJECT_STATE_KEYS } from "./looplab-gameplay-rules.mjs";

const DEFAULT_MAX_TICKS = 60 * 60 * 10;
export const LOOPLAB_REPLAY_LEGACY_HASH_VERSION = 1;
export const LOOPLAB_REPLAY_PREVIOUS_HASH_VERSION = 2;
export const LOOPLAB_REPLAY_GAMEPLAY_HASH_VERSION = 3;
export const LOOPLAB_REPLAY_CHOICE_HASH_VERSION = 4;
export const LOOPLAB_REPLAY_MOTION_HASH_VERSION = 5;
export const LOOPLAB_REPLAY_SHA256_HASH_VERSION = 6;
export const LOOPLAB_REPLAY_COMBAT_HASH_VERSION = 7;
export const LOOPLAB_REPLAY_ACTOR_HASH_VERSION = 8;
export const LOOPLAB_REPLAY_COLLISION_HASH_VERSION = 9;
export const LOOPLAB_REPLAY_MOTION_CARRY_HASH_VERSION = 10;
export const LOOPLAB_REPLAY_ELEVATION_HASH_VERSION = 11;
export const LOOPLAB_REPLAY_WORLD_STREAM_HASH_VERSION = 12;
export const LOOPLAB_REPLAY_INTERACTABLE_HASH_VERSION = 13;
export const LOOPLAB_REPLAY_HASH_VERSION = LOOPLAB_REPLAY_INTERACTABLE_HASH_VERSION;
export const LOOPLAB_MIN_TICK_RATE = 20;
const SUPPORTED_REPLAY_HASH_VERSIONS = new Set([
  LOOPLAB_REPLAY_LEGACY_HASH_VERSION,
  LOOPLAB_REPLAY_PREVIOUS_HASH_VERSION,
  LOOPLAB_REPLAY_GAMEPLAY_HASH_VERSION,
  LOOPLAB_REPLAY_CHOICE_HASH_VERSION,
  LOOPLAB_REPLAY_MOTION_HASH_VERSION,
  LOOPLAB_REPLAY_SHA256_HASH_VERSION,
  LOOPLAB_REPLAY_COMBAT_HASH_VERSION,
  LOOPLAB_REPLAY_ACTOR_HASH_VERSION,
  LOOPLAB_REPLAY_COLLISION_HASH_VERSION,
  LOOPLAB_REPLAY_MOTION_CARRY_HASH_VERSION,
  LOOPLAB_REPLAY_ELEVATION_HASH_VERSION,
  LOOPLAB_REPLAY_WORLD_STREAM_HASH_VERSION,
  LOOPLAB_REPLAY_INTERACTABLE_HASH_VERSION,
]);
const ACTION_CODES = Object.freeze({
  "move-left": "left",
  left: "left",
  "move-right": "right",
  right: "right",
  "move-up": "up",
  up: "up",
  "move-down": "down",
  down: "down",
  jump: "jump",
  interact: "interact",
  lock: "interact",
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function canonicalReplaySerialize(value) {
  return JSON.stringify(canonicalize(value));
}

export function replayStateDigest(value, options = {}) {
  const hashVersion = replayHashVersion(options.hashVersion, LOOPLAB_REPLAY_HASH_VERSION);
  const text = canonicalReplaySerialize(value);
  if (hashVersion >= LOOPLAB_REPLAY_SHA256_HASH_VERSION) return `replay-sha256-${sha256Hex(text)}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `replay-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function compareReplayIds(first, second) {
  const firstId = String(first);
  const secondId = String(second);
  return firstId < secondId ? -1 : firstId > secondId ? 1 : 0;
}

function replayHashVersion(value, fallback = LOOPLAB_REPLAY_LEGACY_HASH_VERSION) {
  const version = Number(value ?? fallback);
  if (!Number.isInteger(version) || !SUPPORTED_REPLAY_HASH_VERSIONS.has(version)) {
    throw new Error(`Replay hashVersion must be one of ${[...SUPPORTED_REPLAY_HASH_VERSIONS].join(", ")}.`);
  }
  return version;
}

function replayDigestPattern(hashVersion) {
  return hashVersion >= LOOPLAB_REPLAY_SHA256_HASH_VERSION ? /^replay-sha256-[0-9a-f]{64}$/ : /^replay-[0-9a-f]{8}$/;
}

function replayDigestDescription(hashVersion) {
  return hashVersion >= LOOPLAB_REPLAY_SHA256_HASH_VERSION ? "a replay-sha256 digest with 64 lowercase hex characters" : "a legacy replay digest with 8 lowercase hex characters";
}

function legacySnapshotObject(object) {
  return {
    id: String(object.id ?? ""),
    kind: String(object.kind ?? ""),
    x: Number(object.x ?? 0),
    y: Number(object.y ?? 0),
    z: Number(object.z ?? 0),
    vx: Number(object.vx ?? 0),
    vy: Number(object.vy ?? 0),
    grounded: Boolean(object.grounded),
    collected: Boolean(object.collected),
  };
}

function snapshotObject(object) {
  const runtimeObjectState = Object.fromEntries(
    LOOPLAB_RUNTIME_OBJECT_STATE_KEYS
      .filter((key) => Object.prototype.hasOwnProperty.call(object, key))
      .map((key) => [key, clone(object[key])]),
  );
  return {
    id: String(object.id ?? ""),
    kind: String(object.kind ?? ""),
    x: Number(object.x ?? 0),
    y: Number(object.y ?? 0),
    z: Number(object.z ?? 0),
    vx: Number(object.vx ?? 0),
    vy: Number(object.vy ?? 0),
    grounded: Boolean(object.grounded),
    collected: Boolean(object.collected),
    hidden: Boolean(object.hidden),
    solid: Boolean(object.solid),
    colliderEnabled: object.collider?.enabled !== false,
    runtimeState: String(object.runtimeState ?? ""),
    ...(Object.keys(runtimeObjectState).length ? { runtimeObjectState } : {}),
  };
}

function legacyMotionBodySnapshot(state) {
  return {
    schemaVersion: "looplab-motion-body-state/v1",
    mapId: state.mapId,
    objectId: state.objectId,
    pathId: state.pathId,
    progress: Number(state.progress || 0),
    speed: Number(state.speed || 0),
    direction: state.direction,
    engaged: Boolean(state.engaged),
    blocked: Boolean(state.blocked),
    blockerId: state.blockerId ?? null,
    blockerProgress: state.blockerProgress == null ? null : Number(state.blockerProgress),
    completed: Boolean(state.completed),
    x: Number(state.x || 0),
    y: Number(state.y || 0),
    z: Number(state.z || 0),
  };
}

function worldStreamReplaySnapshot(state) {
  if (!state?.present) return { schemaVersion: "looplab-world-stream-runtime/v1", present: false, hostMapId: state?.hostMapId ?? null };
  return {
    schemaVersion: "looplab-world-stream-runtime/v1",
    present: true,
    enabled: state.enabled !== false,
    hostMapId: state.hostMapId,
    mode: state.mode,
    axis: state.axis,
    seed: state.seed,
    horizon: Number(state.horizon || 0),
    routeDigest: state.routeDigest,
    currentOrdinal: Number(state.currentOrdinal || 0),
    currentInstanceId: state.currentInstanceId ?? null,
    currentTemplateId: state.currentTemplateId ?? null,
    currentSourceMapId: state.currentSourceMapId ?? null,
    generatedInstanceCount: Number(state.generatedInstanceCount || 0),
    residentInstanceIds: clone(state.residentInstanceIds ?? []),
    residentRange: clone(state.residentRange ?? { start: 0, end: -1 }),
    worldBounds: clone(state.worldBounds ?? null),
    activationSequence: Number(state.activationSequence || 0),
    budget: clone(state.budget ?? null),
    budgetPassed: Boolean(state.budgetPassed),
    contradiction: clone(state.contradiction ?? null),
    choices: clone(state.choices ?? []),
  };
}

export function captureReplayState(runtime, options = {}) {
  const state = runtime.getState();
  const hashVersion = replayHashVersion(options.hashVersion, LOOPLAB_REPLAY_HASH_VERSION);
  const common = {
    activeMapId: state.activeMapId,
    collectedCount: Number(state.collectedCount ?? 0),
    activeTraversalPathId: state.activeTraversalPathId ?? null,
    player: state.player ? {
      id: state.player.id,
      x: Number(state.player.x ?? 0),
      y: Number(state.player.y ?? 0),
      z: Number(state.player.z ?? 0),
      vx: Number(state.player.vx ?? 0),
      vy: Number(state.player.vy ?? 0),
      grounded: Boolean(state.player.grounded),
    } : null,
    won: Boolean(state.won),
  };
  if (hashVersion >= LOOPLAB_REPLAY_COLLISION_HASH_VERSION && common.player) {
    common.player = {
      ...common.player,
      groundChainId: state.player.groundChainId ?? null,
      groundSegmentId: state.player.groundSegmentId ?? null,
      groundNormalX: Number(state.player.groundNormalX ?? 0),
      groundNormalY: Number(state.player.groundNormalY ?? -1),
      slopeSliding: Boolean(state.player.slopeSliding),
    };
  }
  if (hashVersion >= LOOPLAB_REPLAY_ELEVATION_HASH_VERSION && common.player) {
    common.player = {
      ...common.player,
      elevationTransitionId: state.player.elevationTransitionId ?? null,
      elevationSegmentId: state.player.elevationSegmentId ?? null,
      elevationProgress: Number(state.player.elevationProgress ?? 0),
      elevationSupportZ: Number(state.player.elevationSupportZ ?? state.player.z ?? 0),
    };
  }
  if (hashVersion >= LOOPLAB_REPLAY_INTERACTABLE_HASH_VERSION && common.player) {
    common.player = {
      ...common.player,
      groundObjectId: state.player.groundObjectId ?? null,
      interactableMode: state.player.interactableMode ?? "default",
      interactableTargetId: state.player.interactableTargetId ?? null,
      conveyorObjectId: state.player.conveyorObjectId ?? null,
    };
  }
  if (hashVersion === LOOPLAB_REPLAY_LEGACY_HASH_VERSION) {
    return {
      ...common,
      objects: runtime.getObjects().map(legacySnapshotObject).sort((first, second) => compareReplayIds(first.id, second.id)),
    };
  }
  const deterministicState = hashVersion <= LOOPLAB_REPLAY_GAMEPLAY_HASH_VERSION
    ? {
        activeInputCodes: clone(state.deterministicState?.activeInputCodes ?? []),
        activeActionIds: clone(state.deterministicState?.activeActionIds ?? []),
        overlapContactIds: clone(state.deterministicState?.overlapContactIds ?? []),
      }
    : clone(state.deterministicState ?? { activeInputCodes: [], activeActionIds: [], overlapContactIds: [], activeChoicePageId: null, pendingChoiceId: null });
  return {
    ...common,
    variables: clone(state.variables ?? {}),
    completedRuleIds: clone(state.completedRuleIds ?? []),
    deterministicState,
    objects: runtime.getObjects().map(snapshotObject).sort((first, second) => compareReplayIds(first.id, second.id)),
    paths: runtime.getTraversalPaths().map((path) => ({ id: String(path.id ?? ""), enabled: path.enabled !== false })).sort((first, second) => compareReplayIds(first.id, second.id)),
    ...(hashVersion >= LOOPLAB_REPLAY_MOTION_HASH_VERSION ? {
      motionBodies: clone((runtime.getMotionBodyStates?.() ?? []).map((state) => hashVersion >= LOOPLAB_REPLAY_MOTION_CARRY_HASH_VERSION ? state : legacyMotionBodySnapshot(state))),
    } : {}),
    ...(hashVersion >= LOOPLAB_REPLAY_COMBAT_HASH_VERSION ? { combat: clone(runtime.getCombatState?.() ?? null) } : {}),
    ...(hashVersion >= LOOPLAB_REPLAY_ACTOR_HASH_VERSION ? { actors: clone(runtime.getActorStates?.() ?? []) } : {}),
    ...(hashVersion >= LOOPLAB_REPLAY_WORLD_STREAM_HASH_VERSION ? { worldStream: worldStreamReplaySnapshot(runtime.getWorldStreamState?.() ?? state.worldStream) } : {}),
  };
}

export function resolveReplayActionCode(project, input) {
  const requested = String(input.action ?? input.actionId ?? input.code ?? "").trim();
  if (!requested) return "";
  if (ACTION_CODES[requested]) return ACTION_CODES[requested];
  const action = (project.inputActions ?? []).find((candidate) => candidate.id === requested);
  if (!action) return requested;
  if (ACTION_CODES[action.id]) return ACTION_CODES[action.id];
  const binding = (action.bindings ?? []).find((candidate) => typeof candidate === "string" && candidate.trim());
  return binding ?? requested;
}

export function validateReplayCase(replayCase, options = {}) {
  const errors = [];
  const prefix = options.prefix ?? "replay case";
  if (!replayCase || typeof replayCase !== "object" || Array.isArray(replayCase)) return [`${prefix} must be an object.`];
  if (typeof replayCase.id !== "string" || !replayCase.id.trim()) errors.push(`${prefix}.id must be a non-empty string.`);
  const legacyMetadataOnly = options.allowLegacy === true && replayCase.tickCount === undefined && replayCase.inputs === undefined;
  if (legacyMetadataOnly) return errors;
  if (!Number.isInteger(replayCase.tickCount) || replayCase.tickCount < 1 || replayCase.tickCount > (options.maximumTicks ?? DEFAULT_MAX_TICKS)) {
    errors.push(`${prefix}.tickCount must be an integer from 1 through ${options.maximumTicks ?? DEFAULT_MAX_TICKS}.`);
  }
  if (replayCase.revision !== undefined && (!Number.isInteger(replayCase.revision) || replayCase.revision < 1)) errors.push(`${prefix}.revision must be a positive integer.`);
  const declaredHashVersion = replayCase.hashVersion ?? LOOPLAB_REPLAY_LEGACY_HASH_VERSION;
  const validHashVersion = Number.isInteger(declaredHashVersion) && SUPPORTED_REPLAY_HASH_VERSIONS.has(declaredHashVersion);
  if (!validHashVersion) errors.push(`${prefix}.hashVersion must be one of ${[...SUPPORTED_REPLAY_HASH_VERSIONS].join(", ")}.`);
  const digestHashVersion = validHashVersion ? declaredHashVersion : LOOPLAB_REPLAY_LEGACY_HASH_VERSION;
  const digestPattern = replayDigestPattern(digestHashVersion);
  const digestDescription = replayDigestDescription(digestHashVersion);
  const tickRate = Number(replayCase.tickRate ?? 60);
  if (!finite(tickRate) || tickRate < LOOPLAB_MIN_TICK_RATE || tickRate > 240) errors.push(`${prefix}.tickRate must be from ${LOOPLAB_MIN_TICK_RATE} through 240.`);
  if (replayCase.startMapId !== undefined && (typeof replayCase.startMapId !== "string" || !replayCase.startMapId)) errors.push(`${prefix}.startMapId must be a non-empty string when provided.`);
  if (replayCase.startSpawnId !== undefined && (typeof replayCase.startSpawnId !== "string" || !replayCase.startSpawnId)) errors.push(`${prefix}.startSpawnId must be a non-empty string when provided.`);
  if (!Array.isArray(replayCase.inputs)) errors.push(`${prefix}.inputs must be an array.`);
  else for (const [index, input] of replayCase.inputs.entries()) {
    const inputPrefix = `${prefix}.inputs[${index}]`;
    if (!input || typeof input !== "object" || Array.isArray(input)) { errors.push(`${inputPrefix} must be an object.`); continue; }
    if (!Number.isInteger(input.tick) || input.tick < 0 || (Number.isInteger(replayCase.tickCount) && input.tick >= replayCase.tickCount)) errors.push(`${inputPrefix}.tick must address a simulation tick inside the case.`);
    if (typeof input.pressed !== "boolean") errors.push(`${inputPrefix}.pressed must be boolean.`);
    if (![input.action, input.actionId, input.code].some((value) => typeof value === "string" && value.trim())) errors.push(`${inputPrefix} requires action, actionId, or code.`);
  }
  if (replayCase.checkpoints !== undefined && !Array.isArray(replayCase.checkpoints)) errors.push(`${prefix}.checkpoints must be an array when provided.`);
  else for (const [index, checkpoint] of (replayCase.checkpoints ?? []).entries()) {
    const checkpointPrefix = `${prefix}.checkpoints[${index}]`;
    if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint)) { errors.push(`${checkpointPrefix} must be an object.`); continue; }
    if (!Number.isInteger(checkpoint.tick) || checkpoint.tick < 1 || (Number.isInteger(replayCase.tickCount) && checkpoint.tick > replayCase.tickCount)) errors.push(`${checkpointPrefix}.tick must address the state after a simulation tick inside the case.`);
    if (typeof checkpoint.hash !== "string" || !digestPattern.test(checkpoint.hash)) errors.push(`${checkpointPrefix}.hash must be ${digestDescription}.`);
  }
  if (replayCase.expectedHash !== undefined && (typeof replayCase.expectedHash !== "string" || !digestPattern.test(replayCase.expectedHash))) errors.push(`${prefix}.expectedHash must be ${digestDescription} when provided.`);
  return errors;
}

function caseTickRate(project, replayCase) {
  const tickRate = Number(replayCase.tickRate ?? project.replay?.tickRate ?? 60);
  if (!finite(tickRate) || tickRate < LOOPLAB_MIN_TICK_RATE || tickRate > 240) throw new Error(`Replay tickRate must be a finite number from ${LOOPLAB_MIN_TICK_RATE} through 240.`);
  return tickRate;
}

export function runReplayCase(project, replayCase, options = {}) {
  const errors = validateReplayCase(replayCase, { maximumTicks: options.maximumTicks });
  if (errors.length) throw new Error(errors.join(" "));
  const runtime = createRuntimeModel(clone(project));
  if (replayCase.startMapId) {
    const loaded = runtime.loadMap(replayCase.startMapId, replayCase.startSpawnId ?? null);
    if (!loaded) throw new Error(`Replay ${replayCase.id} references missing start map ${replayCase.startMapId}.`);
  }
  runtime.drainEvents();
  const tickRate = caseTickRate(project, replayCase);
  const hashVersion = replayHashVersion(replayCase.hashVersion);
  const inputsByTick = new Map();
  for (const input of replayCase.inputs ?? []) {
    const list = inputsByTick.get(input.tick) ?? [];
    list.push(input);
    inputsByTick.set(input.tick, list);
  }
  const expectedByTick = new Map((replayCase.checkpoints ?? []).map((checkpoint) => [checkpoint.tick, checkpoint.hash]));
  const actualCheckpoints = [];
  const mismatches = [];
  const emittedEventCounts = {};
  const captureEvery = options.captureEveryTick === true ? Math.max(1, Number(options.checkpointInterval ?? 1)) : null;
  let finalHash = "";

  for (let tickIndex = 0; tickIndex < replayCase.tickCount; tickIndex += 1) {
    for (const input of inputsByTick.get(tickIndex) ?? []) {
      const code = resolveReplayActionCode(project, input);
      if (!code) throw new Error(`Replay ${replayCase.id} has an unresolved input at tick ${tickIndex}.`);
      runtime.setInput(code, input.pressed);
    }
    const events = runtime.update(1 / tickRate);
    for (const event of events) emittedEventCounts[event.type] = (emittedEventCounts[event.type] ?? 0) + 1;
    const tick = tickIndex + 1;
    const hash = replayStateDigest(captureReplayState(runtime, { hashVersion }), { hashVersion });
    finalHash = hash;
    const expectedHash = expectedByTick.get(tick);
    if (expectedHash && expectedHash !== hash) mismatches.push({ tick, expectedHash, actualHash: hash });
    if ((captureEvery && (tick % captureEvery === 0 || tick === replayCase.tickCount)) || expectedHash) actualCheckpoints.push({ tick, hash, expectedHash: expectedHash ?? null, passed: expectedHash ? expectedHash === hash : null });
  }

  const expectedHash = replayCase.expectedHash ?? expectedByTick.get(replayCase.tickCount) ?? null;
  if (expectedHash && expectedHash !== finalHash && !mismatches.some((entry) => entry.tick === replayCase.tickCount)) {
    mismatches.push({ tick: replayCase.tickCount, expectedHash, actualHash: finalHash });
  }
  mismatches.sort((first, second) => first.tick - second.tick);
  const hasExpectations = Boolean(expectedHash || expectedByTick.size);
  const passed = hasExpectations && mismatches.length === 0;
  return {
    caseId: replayCase.id,
    revision: Number(replayCase.revision ?? 1),
    hashVersion,
    tickRate,
    tickCount: replayCase.tickCount,
    seed: Number(replayCase.seed ?? project.replay?.seed ?? 1),
    status: !hasExpectations ? "recordable" : passed ? "passed" : "failed",
    passed,
    expectedHash,
    finalHash,
    firstMismatchTick: mismatches[0]?.tick ?? null,
    mismatches,
    checkpoints: actualCheckpoints,
    emittedEventCounts,
  };
}

export function runReplaySuite(project, options = {}) {
  const allCases = project.replay?.cases ?? [];
  const selected = options.caseId ? allCases.filter((replayCase) => replayCase.id === options.caseId) : allCases;
  if (options.caseId && selected.length === 0) throw new Error(`Replay case was not found: ${options.caseId}`);
  const cases = selected.map((replayCase) => runReplayCase(project, replayCase, options));
  const failedCount = cases.filter((result) => result.status === "failed").length;
  const recordableCount = cases.filter((result) => result.status === "recordable").length;
  const passedCount = cases.filter((result) => result.status === "passed").length;
  const status = cases.length === 0 ? "no-fixtures" : failedCount ? "failed" : recordableCount ? "recordable" : "passed";
  const firstDivergence = cases
    .filter((result) => result.firstMismatchTick != null)
    .sort((first, second) => first.firstMismatchTick - second.firstMismatchTick)[0];
  return {
    schemaVersion: "looplab-replay-result/v1",
    status,
    passed: status === "passed",
    caseCount: cases.length,
    passedCount,
    failedCount,
    recordableCount,
    firstDivergence: firstDivergence ? { caseId: firstDivergence.caseId, tick: firstDivergence.firstMismatchTick } : null,
    cases,
  };
}

export function recordReplayCase(project, specification) {
  const id = String(specification?.id ?? "").trim();
  if (!id) throw new Error("record_replay_case requires a non-empty id.");
  const existing = (project.replay?.cases ?? []).find((replayCase) => replayCase.id === id);
  const removedHistory = (project.replay?.changeLog ?? []).filter((entry) => entry?.action === "removed" && entry.caseId === id);
  const previousRevision = Math.max(Number(existing?.revision ?? 0), ...removedHistory.map((entry) => Number(entry.revision ?? 0)));
  const revision = Number(specification.revision ?? previousRevision + 1);
  if (!Number.isInteger(revision) || revision < 1) throw new Error("record_replay_case revision must be a positive integer.");
  if (previousRevision > 0 && revision <= previousRevision) throw new Error(`Rerecording ${id} requires a revision greater than ${previousRevision}.`);
  const changeReason = String(specification.changeReason ?? "").trim();
  if (previousRevision > 0 && !changeReason) throw new Error(`Rerecording ${id} requires changeReason so a changed quality bar is explicit.`);
  const draft = {
    id,
    name: String(specification.name ?? existing?.name ?? id),
    revision,
    hashVersion: replayHashVersion(specification.hashVersion, LOOPLAB_REPLAY_HASH_VERSION),
    changeReason: changeReason || "Initial deterministic fixture",
    tickRate: Number(specification.tickRate ?? project.replay?.tickRate ?? 60),
    seed: Number(specification.seed ?? project.replay?.seed ?? 1),
    tickCount: Number(specification.tickCount),
    startMapId: specification.startMapId,
    startSpawnId: specification.startSpawnId,
    inputs: clone(specification.inputs ?? []),
  };
  const validationErrors = validateReplayCase(draft);
  if (validationErrors.length) throw new Error(validationErrors.join(" "));
  const checkpointInterval = Number(specification.checkpointInterval ?? 1);
  if (!Number.isInteger(checkpointInterval) || checkpointInterval < 1) throw new Error("record_replay_case checkpointInterval must be a positive integer.");
  const recorded = runReplayCase(project, draft, { captureEveryTick: true, checkpointInterval });
  const replayCase = {
    ...draft,
    expectedHash: recorded.finalHash,
    checkpoints: recorded.checkpoints.map(({ tick, hash }) => ({ tick, hash })),
  };
  return { replayCase, result: runReplayCase(project, replayCase) };
}
