import { createNavigationModel, findNavigationPath } from "./looplab-navigation.mjs";

export const LOOPLAB_ACTOR_PROGRAM_SCHEMA = "looplab-actor-program/v1";
export const LOOPLAB_ACTOR_STATE_SCHEMA = "looplab-actor-state/v1";

export const LOOPLAB_ACTOR_LIMITS = Object.freeze({
  maximumActors: 128,
  maximumRouteNodes: 256,
  maximumSpeed: 4_096,
  maximumDistance: 16_384,
  maximumMemoryTicks: 7_200,
  maximumRepathTicks: 600,
});

export const LOOPLAB_ACTOR_POLICY = Object.freeze({
  sourceField: "project.actorProgram",
  geometryAuthority: "Authored map colliders, support elevation, and navigation nodes remain the sole spatial authority. Actor behavior and generated art never invent collision geometry.",
  simulation: "Actor perception, transitions, path progress, and movement advance only on the deterministic fixed simulation tick in stable actor-ID order.",
  transitionPriority: "Cutscene override, visible-target response, remembered-target response, return, then authored base behavior. One transition is selected per actor per tick.",
  perception: "Line of sight uses every intersecting authored solid collider, selects the nearest hit fraction, and resolves equal hits by stable object ID.",
  navigation: "Patrol and cutscene routes name authored navigation nodes. Chase, flee, and return use deterministic A* with bounded repath cadence and stable tie breaks.",
  avoidance: "Version 1 intentionally omits reciprocal local avoidance. Deterministic authored routes and collision stops are preferable to opaque crowd steering.",
  rendering: "Canvas, Phaser, Pixi, and melonJS render canonical actor-bound objects but never own or advance actor state.",
  judgmentBoundary: "Project Doctor verifies references, bounds, deterministic policies, and executable evidence. It cannot certify believability, pacing, difficulty, or fun without playtest evidence.",
});

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const PROGRAM_FIELDS = new Set(["schemaVersion", "enabled", "actors", "acceptanceTestIds"]);
const ACTOR_FIELDS = new Set([
  "id", "mapId", "objectId", "baseMode", "detectionMode", "target", "speed", "arrivalRadius",
  "stopDistance", "safeDistance", "detectionRadius", "fieldOfViewDegrees", "memoryTicks", "repathTicks",
  "routeBehavior", "patrolNodeIds", "homeNodeId", "initialFacing", "cutscene",
]);
const TARGET_FIELDS = new Set(["kind", "id"]);
const FACING_FIELDS = new Set(["x", "y"]);
const CUTSCENE_FIELDS = new Set(["variableId", "operator", "value", "nodeIds", "routeBehavior"]);
const BASE_MODES = new Set(["hold", "patrol"]);
const DETECTION_MODES = new Set(["none", "chase", "flee"]);
const TARGET_KINDS = new Set(["player", "actor", "object"]);
const ROUTE_BEHAVIORS = new Set(["loop", "ping-pong", "stop"]);
const OPERATORS = new Set(["eq", "ne", "gt", "gte", "lt", "lte", "truthy", "falsy"]);
const SUGGESTED_KINDS = new Set(["enemy", "boss", "hazard", "target", "npc", "character", "companion"]);

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const stableId = (value) => typeof value === "string" && STABLE_ID.test(value);
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const integer = (value) => Number.isInteger(value);
const compareIds = (first, second) => String(first) < String(second) ? -1 : String(first) > String(second) ? 1 : 0;

function boundedNumber(value, fallback, minimum, maximum) {
  return finite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function boundedInteger(value, fallback, minimum, maximum) {
  return integer(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry ?? "").trim()).filter(Boolean))];
}

function normalizeFacing(value = {}) {
  const x = boundedNumber(value.x, 1, -1, 1);
  const y = boundedNumber(value.y, 0, -1, 1);
  const magnitude = Math.hypot(x, y);
  return magnitude > 0.000001 ? { x: x / magnitude, y: y / magnitude } : { x: 1, y: 0 };
}

function normalizeTarget(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const kind = TARGET_KINDS.has(value.kind) ? value.kind : "player";
  return {
    kind,
    ...(kind === "player" ? {} : { id: String(value.id ?? "").trim() }),
  };
}

function normalizeCutscene(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    variableId: String(value.variableId ?? "").trim(),
    operator: OPERATORS.has(value.operator) ? value.operator : "eq",
    value: clone(value.value),
    nodeIds: normalizeIdList(value.nodeIds),
    routeBehavior: ROUTE_BEHAVIORS.has(value.routeBehavior) ? value.routeBehavior : "stop",
  };
}

function normalizeActor(actor = {}) {
  const baseMode = BASE_MODES.has(actor.baseMode) ? actor.baseMode : "hold";
  const detectionMode = DETECTION_MODES.has(actor.detectionMode) ? actor.detectionMode : "none";
  return {
    id: String(actor.id ?? "").trim(),
    mapId: String(actor.mapId ?? "").trim(),
    objectId: String(actor.objectId ?? "").trim(),
    baseMode,
    detectionMode,
    target: detectionMode === "none" ? null : normalizeTarget(actor.target),
    speed: boundedNumber(actor.speed, 96, 0.001, LOOPLAB_ACTOR_LIMITS.maximumSpeed),
    arrivalRadius: boundedNumber(actor.arrivalRadius, 4, 0, LOOPLAB_ACTOR_LIMITS.maximumDistance),
    stopDistance: boundedNumber(actor.stopDistance, 24, 0, LOOPLAB_ACTOR_LIMITS.maximumDistance),
    safeDistance: boundedNumber(actor.safeDistance, 192, 0, LOOPLAB_ACTOR_LIMITS.maximumDistance),
    detectionRadius: boundedNumber(actor.detectionRadius, 256, 0, LOOPLAB_ACTOR_LIMITS.maximumDistance),
    fieldOfViewDegrees: boundedNumber(actor.fieldOfViewDegrees, 360, 0, 360),
    memoryTicks: boundedInteger(actor.memoryTicks, 90, 0, LOOPLAB_ACTOR_LIMITS.maximumMemoryTicks),
    repathTicks: boundedInteger(actor.repathTicks, 12, 1, LOOPLAB_ACTOR_LIMITS.maximumRepathTicks),
    routeBehavior: ROUTE_BEHAVIORS.has(actor.routeBehavior) ? actor.routeBehavior : "loop",
    patrolNodeIds: normalizeIdList(actor.patrolNodeIds),
    homeNodeId: String(actor.homeNodeId ?? "").trim(),
    initialFacing: normalizeFacing(actor.initialFacing),
    cutscene: normalizeCutscene(actor.cutscene),
  };
}

export function normalizeActorProgram(input = {}) {
  return {
    schemaVersion: LOOPLAB_ACTOR_PROGRAM_SCHEMA,
    enabled: input.enabled !== false,
    actors: (Array.isArray(input.actors) ? input.actors : []).map(normalizeActor).sort((first, second) => compareIds(first.id, second.id)),
    acceptanceTestIds: [...new Set(normalizeIdList(input.acceptanceTestIds))].sort(compareIds),
  };
}

function unknownFields(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function mapsForProject(project) {
  return Array.isArray(project?.maps) && project.maps.length
    ? project.maps
    : [{ id: project?.activeMapId ?? "map-main", width: project?.width, height: project?.height, objects: project?.objects ?? [], navigation: project?.navigation }];
}

function variableMatchesPrimitive(value) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

export function inspectActorProgram(project, input = project?.actorProgram, options = {}) {
  const strict = options.strict === true;
  const issues = [];
  const add = (severity, code, message, context = {}) => issues.push({ severity, code, message, ...context });
  const empty = (present, enabled = false, program = null) => ({
    schemaVersion: "looplab-actor-report/v1", present, enabled, valid: !issues.some((issue) => issue.severity === "error"),
    actorCount: 0, patrolCount: 0, perceptionCount: 0, cutsceneCount: 0,
    errors: issues.filter((issue) => issue.severity === "error").map((issue) => issue.message),
    warnings: issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message), issues, program,
  });
  if (input === undefined) return empty(false);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    add("error", "actor-program-invalid", "actorProgram must be an object.", { path: "actorProgram" });
    return empty(true);
  }

  const program = normalizeActorProgram(input);
  const maps = mapsForProject(project);
  const mapsById = new Map(maps.map((map) => [map?.id, map]));
  const actorIds = new Set();
  const actorMapIds = new Map();
  const actorObjectKeys = new Set();
  const acceptanceIds = new Set((project?.acceptanceTests ?? []).map((test) => test?.id).filter(stableId));
  const variableIds = new Set((project?.gameplayProgram?.variables ?? []).map((variable) => variable?.id).filter(stableId));

  const programUnknown = unknownFields(input, PROGRAM_FIELDS);
  if (programUnknown.length) add("error", "actor-program-unknown-field", `actorProgram contains unsupported fields: ${programUnknown.join(", ")}.`, { path: "actorProgram" });
  if (input.schemaVersion !== LOOPLAB_ACTOR_PROGRAM_SCHEMA) add("error", "actor-program-schema", `actorProgram.schemaVersion must be ${LOOPLAB_ACTOR_PROGRAM_SCHEMA}.`, { path: "actorProgram.schemaVersion" });
  if (typeof input.enabled !== "boolean") add("error", "actor-program-enabled", "actorProgram.enabled must be boolean.", { path: "actorProgram.enabled" });
  if (!Array.isArray(input.actors)) add("error", "actor-program-actors", "actorProgram.actors must be an array.", { path: "actorProgram.actors" });
  if (!Array.isArray(input.acceptanceTestIds)) add("error", "actor-program-evidence", "actorProgram.acceptanceTestIds must be an array.", { path: "actorProgram.acceptanceTestIds" });
  if ((input.actors?.length ?? 0) > LOOPLAB_ACTOR_LIMITS.maximumActors) add("error", "actor-count", `actorProgram declares more than ${LOOPLAB_ACTOR_LIMITS.maximumActors} actors.`, { path: "actorProgram.actors" });

  for (const [index, raw] of (input.actors ?? []).entries()) {
    const path = `actorProgram.actors[${index}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { add("error", "actor-invalid", `${path} must be an object.`, { path }); continue; }
    const unknown = unknownFields(raw, ACTOR_FIELDS);
    if (unknown.length) add("error", "actor-unknown-field", `${path} contains unsupported fields: ${unknown.join(", ")}.`, { path, actorId: raw.id });
    if (!stableId(raw.id)) add("error", "actor-id", `${path}.id must be a stable ID.`, { path: `${path}.id` });
    else if (actorIds.has(raw.id)) add("error", "actor-duplicate", `${path}.id duplicates ${raw.id}.`, { path: `${path}.id`, actorId: raw.id });
    else {
      actorIds.add(raw.id);
      actorMapIds.set(raw.id, raw.mapId);
    }
    if (!stableId(raw.mapId) || !mapsById.has(raw.mapId)) add("error", "actor-map", `${path}.mapId must reference an authored map.`, { path: `${path}.mapId`, actorId: raw.id, mapId: raw.mapId });
    const map = mapsById.get(raw.mapId);
    const object = map?.objects?.find((candidate) => candidate?.id === raw.objectId);
    const objectKey = `${raw.mapId}:${raw.objectId}`;
    if (!stableId(raw.objectId) || !object) add("error", "actor-object", `${path}.objectId must reference an object on its map.`, { path: `${path}.objectId`, actorId: raw.id, objectId: raw.objectId });
    else {
      if (object.kind === "player") add("error", "actor-player-owner", `Actor ${raw.id} cannot own the player object; target it with target.kind player instead.`, { actorId: raw.id, objectId: raw.objectId });
      if (!object.collider || object.collider.enabled === false) add("error", "actor-collider", `Actor ${raw.id} requires an enabled authored collider on ${raw.objectId}.`, { actorId: raw.id, objectId: raw.objectId });
      if (object.collisionOwner !== "authored-map") add("error", "actor-authority", `Actor ${raw.id} must keep authored-map collision ownership.`, { actorId: raw.id, objectId: raw.objectId });
      if (object.motionBody) add("error", "actor-motion-conflict", `Actor ${raw.id} cannot share ${raw.objectId} with a motionBody; one deterministic system must own movement.`, { actorId: raw.id, objectId: raw.objectId });
      if (actorObjectKeys.has(objectKey)) add("error", "actor-object-duplicate", `More than one actor owns ${objectKey}.`, { actorId: raw.id, objectId: raw.objectId });
      actorObjectKeys.add(objectKey);
    }
    if (!BASE_MODES.has(raw.baseMode)) add("error", "actor-base-mode", `${path}.baseMode must be hold or patrol.`, { path: `${path}.baseMode`, actorId: raw.id });
    if (!DETECTION_MODES.has(raw.detectionMode)) add("error", "actor-detection-mode", `${path}.detectionMode must be none, chase, or flee.`, { path: `${path}.detectionMode`, actorId: raw.id });
    const numericRules = [
      ["speed", 0, LOOPLAB_ACTOR_LIMITS.maximumSpeed, true], ["arrivalRadius", 0, LOOPLAB_ACTOR_LIMITS.maximumDistance, false],
      ["stopDistance", 0, LOOPLAB_ACTOR_LIMITS.maximumDistance, false], ["safeDistance", 0, LOOPLAB_ACTOR_LIMITS.maximumDistance, false],
      ["detectionRadius", 0, LOOPLAB_ACTOR_LIMITS.maximumDistance, false], ["fieldOfViewDegrees", 0, 360, false],
    ];
    for (const [field, minimum, maximum, exclusive] of numericRules) if (!finite(raw[field]) || (exclusive ? raw[field] <= minimum : raw[field] < minimum) || raw[field] > maximum) add("error", "actor-number", `${path}.${field} must be finite and within its deterministic bound.`, { path: `${path}.${field}`, actorId: raw.id });
    if (!integer(raw.memoryTicks) || raw.memoryTicks < 0 || raw.memoryTicks > LOOPLAB_ACTOR_LIMITS.maximumMemoryTicks) add("error", "actor-memory", `${path}.memoryTicks must be a bounded non-negative integer.`, { path: `${path}.memoryTicks`, actorId: raw.id });
    if (!integer(raw.repathTicks) || raw.repathTicks < 1 || raw.repathTicks > LOOPLAB_ACTOR_LIMITS.maximumRepathTicks) add("error", "actor-repath", `${path}.repathTicks must be a bounded positive integer.`, { path: `${path}.repathTicks`, actorId: raw.id });
    if (!ROUTE_BEHAVIORS.has(raw.routeBehavior)) add("error", "actor-route-behavior", `${path}.routeBehavior must be loop, ping-pong, or stop.`, { path: `${path}.routeBehavior`, actorId: raw.id });
    if (!raw.initialFacing || typeof raw.initialFacing !== "object" || Array.isArray(raw.initialFacing)) add("error", "actor-facing", `${path}.initialFacing must be a finite non-zero vector.`, { path: `${path}.initialFacing`, actorId: raw.id });
    else {
      const facingUnknown = unknownFields(raw.initialFacing, FACING_FIELDS);
      if (facingUnknown.length) add("error", "actor-facing-field", `${path}.initialFacing contains unsupported fields: ${facingUnknown.join(", ")}.`, { path: `${path}.initialFacing`, actorId: raw.id });
      if (!finite(raw.initialFacing.x) || !finite(raw.initialFacing.y) || Math.hypot(raw.initialFacing.x, raw.initialFacing.y) <= 0.000001) add("error", "actor-facing-vector", `${path}.initialFacing must be a finite non-zero vector.`, { path: `${path}.initialFacing`, actorId: raw.id });
    }

    const navigation = createNavigationModel(map?.navigation ?? {});
    const nodesById = new Map(navigation.nodes.map((node) => [node.id, node]));
    const directedLinks = new Set();
    for (const link of navigation.links) {
      directedLinks.add(`${link.a}\u0000${link.b}`);
      if (!link.oneWay) directedLinks.add(`${link.b}\u0000${link.a}`);
    }
    const validateNodeList = (nodeIds, field, minimum = 0) => {
      if (!Array.isArray(nodeIds) || nodeIds.length < minimum || nodeIds.length > LOOPLAB_ACTOR_LIMITS.maximumRouteNodes || nodeIds.some((id) => !stableId(id)) || new Set(nodeIds).size !== nodeIds.length) {
        add("error", "actor-route-nodes", `${path}.${field} must be a unique bounded array of stable navigation-node IDs.`, { path: `${path}.${field}`, actorId: raw.id });
        return false;
      }
      let valid = true;
      for (const nodeId of nodeIds) if (!nodesById.has(nodeId)) {
        valid = false;
        add("error", "actor-route-node-missing", `${path}.${field} references missing navigation node ${nodeId}.`, { path: `${path}.${field}`, actorId: raw.id, nodeId });
      }
      return valid;
    };
    const validateRouteConnectivity = (nodeIds, field, behavior) => {
      if (!Array.isArray(nodeIds) || nodeIds.length < 2 || nodeIds.some((nodeId) => !nodesById.has(nodeId))) return;
      const steps = nodeIds.slice(0, -1).map((nodeId, routeIndex) => [nodeId, nodeIds[routeIndex + 1]]);
      if (behavior === "loop") steps.push([nodeIds.at(-1), nodeIds[0]]);
      if (behavior === "ping-pong") {
        for (let routeIndex = nodeIds.length - 1; routeIndex > 0; routeIndex -= 1) steps.push([nodeIds[routeIndex], nodeIds[routeIndex - 1]]);
      }
      for (const [fromNodeId, toNodeId] of steps) if (!directedLinks.has(`${fromNodeId}\u0000${toNodeId}`)) {
        add("error", "actor-route-link-missing", `${path}.${field} requires an authored navigation link from ${fromNodeId} to ${toNodeId}.`, { path: `${path}.${field}`, actorId: raw.id, fromNodeId, toNodeId });
      }
    };
    if (validateNodeList(raw.patrolNodeIds, "patrolNodeIds", raw.baseMode === "patrol" ? 2 : 0)) validateRouteConnectivity(raw.patrolNodeIds, "patrolNodeIds", raw.routeBehavior);
    if (!stableId(raw.homeNodeId) || !nodesById.has(raw.homeNodeId)) add("error", "actor-home-node", `${path}.homeNodeId must reference an authored navigation node.`, { path: `${path}.homeNodeId`, actorId: raw.id, nodeId: raw.homeNodeId });

    if (raw.detectionMode === "none") {
      if (raw.target !== null) add("error", "actor-target-unneeded", `${path}.target must be null when detectionMode is none.`, { path: `${path}.target`, actorId: raw.id });
    } else if (!raw.target || typeof raw.target !== "object" || Array.isArray(raw.target)) add("error", "actor-target", `${path}.target is required for chase or flee.`, { path: `${path}.target`, actorId: raw.id });
    else {
      const targetUnknown = unknownFields(raw.target, TARGET_FIELDS);
      if (targetUnknown.length) add("error", "actor-target-field", `${path}.target contains unsupported fields: ${targetUnknown.join(", ")}.`, { path: `${path}.target`, actorId: raw.id });
      if (!TARGET_KINDS.has(raw.target.kind)) add("error", "actor-target-kind", `${path}.target.kind must be player, actor, or object.`, { path: `${path}.target.kind`, actorId: raw.id });
      if (raw.target.kind === "player") {
        if (raw.target.id !== undefined) add("error", "actor-player-target-id", `${path}.target must omit id for the player target.`, { path: `${path}.target.id`, actorId: raw.id });
        if (!map?.objects?.some((candidate) => candidate?.kind === "player")) add("error", "actor-player-target-missing", `Actor ${raw.id} targets a player, but ${raw.mapId} has none.`, { actorId: raw.id, mapId: raw.mapId });
      } else if (!stableId(raw.target.id)) add("error", "actor-target-id", `${path}.target.id must be a stable ID.`, { path: `${path}.target.id`, actorId: raw.id });
      else if (raw.target.kind === "object" && !map?.objects?.some((candidate) => candidate?.id === raw.target.id)) add("error", "actor-target-object-missing", `Actor ${raw.id} targets missing object ${raw.target.id}.`, { actorId: raw.id, objectId: raw.target.id });
    }

    if (raw.cutscene !== null) {
      if (!raw.cutscene || typeof raw.cutscene !== "object" || Array.isArray(raw.cutscene)) add("error", "actor-cutscene", `${path}.cutscene must be null or an object.`, { path: `${path}.cutscene`, actorId: raw.id });
      else {
        const cutsceneUnknown = unknownFields(raw.cutscene, CUTSCENE_FIELDS);
        if (cutsceneUnknown.length) add("error", "actor-cutscene-field", `${path}.cutscene contains unsupported fields: ${cutsceneUnknown.join(", ")}.`, { path: `${path}.cutscene`, actorId: raw.id });
        if (!stableId(raw.cutscene.variableId) || !variableIds.has(raw.cutscene.variableId)) add("error", "actor-cutscene-variable", `${path}.cutscene.variableId must reference a gameplay variable.`, { path: `${path}.cutscene.variableId`, actorId: raw.id });
        if (!OPERATORS.has(raw.cutscene.operator)) add("error", "actor-cutscene-operator", `${path}.cutscene.operator is unsupported.`, { path: `${path}.cutscene.operator`, actorId: raw.id });
        if (!variableMatchesPrimitive(raw.cutscene.value)) add("error", "actor-cutscene-value", `${path}.cutscene.value must be null, boolean, number, or string.`, { path: `${path}.cutscene.value`, actorId: raw.id });
        if (validateNodeList(raw.cutscene.nodeIds, "cutscene.nodeIds", 2)) validateRouteConnectivity(raw.cutscene.nodeIds, "cutscene.nodeIds", raw.cutscene.routeBehavior);
        if (!ROUTE_BEHAVIORS.has(raw.cutscene.routeBehavior)) add("error", "actor-cutscene-route", `${path}.cutscene.routeBehavior must be loop, ping-pong, or stop.`, { path: `${path}.cutscene.routeBehavior`, actorId: raw.id });
      }
    }
  }

  for (const [index, raw] of (input.actors ?? []).entries()) {
    if (raw?.target?.kind !== "actor" || !stableId(raw.target.id)) continue;
    if (!actorIds.has(raw.target.id)) add("error", "actor-target-actor-missing", `actorProgram.actors[${index}] targets missing actor ${raw.target.id}.`, { path: `actorProgram.actors[${index}].target.id`, actorId: raw.id });
    else if (raw.target.id === raw.id) add("error", "actor-target-self", `Actor ${raw.id} cannot target itself.`, { path: `actorProgram.actors[${index}].target.id`, actorId: raw.id });
    else if (actorMapIds.get(raw.target.id) !== raw.mapId) add("error", "actor-target-map", `Actor ${raw.id} cannot target actor ${raw.target.id} on another map.`, { path: `actorProgram.actors[${index}].target.id`, actorId: raw.id, targetActorId: raw.target.id });
  }
  for (const testId of program.acceptanceTestIds) if (!stableId(testId) || !acceptanceIds.has(testId)) add("error", "actor-evidence-invalid", `actorProgram references missing acceptance test ${testId || "(empty)"}.`, { testId });
  if (program.enabled && program.actors.length && program.acceptanceTestIds.length === 0) add(strict ? "warning" : "info", "actor-evidence-missing", "The enabled actor program has no linked executable acceptance test for routes, perception, transitions, collision stops, and replay state.");

  issues.sort((first, second) => compareIds(`${first.path ?? ""}:${first.actorId ?? ""}:${first.code}`, `${second.path ?? ""}:${second.actorId ?? ""}:${second.code}`));
  return {
    schemaVersion: "looplab-actor-report/v1",
    present: true,
    enabled: program.enabled,
    valid: !issues.some((issue) => issue.severity === "error"),
    actorCount: program.actors.length,
    patrolCount: program.actors.filter((actor) => actor.baseMode === "patrol").length,
    perceptionCount: program.actors.filter((actor) => actor.detectionMode !== "none").length,
    cutsceneCount: program.actors.filter((actor) => actor.cutscene).length,
    errors: issues.filter((issue) => issue.severity === "error").map((issue) => issue.message),
    warnings: issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message),
    issues,
    program: clone(program),
  };
}

function objectCenter(object) {
  const collider = object?.collider ?? {};
  return {
    x: Number(object?.x || 0) + Number(collider.offsetX || 0) + Number(collider.width ?? object?.width ?? 0) / 2,
    y: Number(object?.y || 0) + Number(collider.offsetY || 0) + Number(collider.height ?? object?.height ?? 0) / 2,
    z: Number.isFinite(collider.zMin) ? Number(collider.zMin) : Number(object?.z || 0),
  };
}

export function suggestActorProgram(project = {}, options = {}) {
  const maps = mapsForProject(project);
  const requestedMapId = typeof options.mapId === "string" ? options.mapId.trim() : "";
  const map = maps.find((candidate) => candidate?.id === requestedMapId)
    ?? maps.find((candidate) => candidate?.id === project?.activeMapId)
    ?? maps[0];
  const navigation = createNavigationModel(map?.navigation ?? {});
  const objects = Array.isArray(map?.objects) ? map.objects : [];
  const player = objects.find((object) => object?.kind === "player") ?? null;
  const explicitIds = Array.isArray(options.objectIds) ? new Set(options.objectIds.map(String)) : null;
  const maximum = Math.max(0, Math.min(LOOPLAB_ACTOR_LIMITS.maximumActors, integer(options.maxActors) ? options.maxActors : 8));
  const candidates = objects
    .filter((object) => object?.kind !== "player" && object?.collider?.enabled !== false && object?.collisionOwner === "authored-map" && !object?.motionBody)
    .filter((object) => explicitIds ? explicitIds.has(object.id) : SUGGESTED_KINDS.has(object.kind) || /(?:actor|boss|citizen|companion|creature|drone|enemy|guard|npc)/i.test(String(object.name ?? object.id)))
    .sort((first, second) => compareIds(first.id, second.id))
    .slice(0, maximum);
  if (!map || navigation.nodes.length < 2 || candidates.length === 0) {
    return {
      schemaVersion: "looplab-actor-suggestion/v1", provider: "none", available: false, mapId: map?.id ?? null,
      program: null, report: null,
      reasons: [
        ...(!map ? ["No authored map is available."] : []),
        ...(map && navigation.nodes.length < 2 ? ["The selected map needs at least two authored navigation nodes."] : []),
        ...(map && candidates.length === 0 ? ["No explicit or safely inferred actor-like objects with authored colliders are available."] : []),
      ],
      decisionBoundary: LOOPLAB_ACTOR_POLICY.judgmentBoundary,
    };
  }

  const nodes = [...navigation.nodes].sort((first, second) => compareIds(first.id, second.id));
  const actors = candidates.map((object, index) => {
    const center = objectCenter(object);
    const nearest = [...nodes].sort((first, second) => {
      const firstDistance = Math.hypot(first.x - center.x, first.y - center.y, (first.z - center.z) * 32);
      const secondDistance = Math.hypot(second.x - center.x, second.y - center.y, (second.z - center.z) * 32);
      return firstDistance - secondDistance || compareIds(first.id, second.id);
    })[0];
    let longest = { ok: true, nodeIds: [nearest.id], cost: 0 };
    for (const node of nodes) {
      const route = findNavigationPath(navigation, nearest.id, node.id);
      if (route.ok && (route.cost > longest.cost || (route.cost === longest.cost && compareIds(route.nodeIds.at(-1), longest.nodeIds.at(-1)) < 0))) longest = route;
    }
    const patrolNodeIds = longest.nodeIds.length >= 2 ? longest.nodeIds : [nearest.id, nodes.find((node) => node.id !== nearest.id).id];
    const hostile = ["enemy", "boss", "hazard", "target"].includes(object.kind);
    return normalizeActor({
      id: `actor-${String(index + 1).padStart(2, "0")}-${object.id}`,
      mapId: map.id,
      objectId: object.id,
      baseMode: "patrol",
      detectionMode: hostile && player ? "chase" : "none",
      target: hostile && player ? { kind: "player" } : null,
      speed: hostile ? 112 : 72,
      arrivalRadius: 4,
      stopDistance: 28,
      safeDistance: 224,
      detectionRadius: hostile ? 320 : 0,
      fieldOfViewDegrees: hostile ? 140 : 360,
      memoryTicks: hostile ? 90 : 0,
      repathTicks: 12,
      routeBehavior: "ping-pong",
      patrolNodeIds,
      homeNodeId: nearest.id,
      initialFacing: { x: 1, y: 0 },
      cutscene: null,
    });
  });
  const program = normalizeActorProgram({ schemaVersion: LOOPLAB_ACTOR_PROGRAM_SCHEMA, enabled: true, actors, acceptanceTestIds: [] });
  const projected = { ...project, actorProgram: program };
  return {
    schemaVersion: "looplab-actor-suggestion/v1", provider: "none", available: true, mapId: map.id,
    actorObjectIds: candidates.map((object) => object.id), program, report: inspectActorProgram(projected, program),
    instructions: "Review routes, sight distances, transition behavior, and executable acceptance evidence before saving. Authored navigation and colliders remain authoritative.",
    decisionBoundary: LOOPLAB_ACTOR_POLICY.judgmentBoundary,
  };
}
