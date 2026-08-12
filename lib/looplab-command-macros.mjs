import { authoredColliderForPlacement, visualBoundsForAsset } from "./looplab-authored-collision.mjs";
import { canonicalSha256 } from "./looplab-canonical-digest.mjs";
import { runCompletionHarness } from "./looplab-completion-harness.mjs";

export const LOOPLAB_COMMAND_MACRO_REGISTRY_SCHEMA = "looplab-command-macro-registry/v1";
export const LOOPLAB_COMMAND_MACRO_PLAN_SCHEMA = "looplab-command-macro-plan/v1";

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function objectValue(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
  return value;
}

function rejectUnknown(parameters, allowed, label) {
  const unknown = Object.keys(parameters).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} does not accept parameter${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`);
}

function requiredString(value, label, maximum = 128) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${label} must be a non-empty string.`);
  if (normalized.length > maximum) throw new Error(`${label} must be at most ${maximum} characters.`);
  if ([...normalized].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error(`${label} cannot contain control characters.`);
  return normalized;
}

function optionalString(value, label, maximum = 256) {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredString(value, label, maximum);
}

function finiteNumber(value, label, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`);
  if (options.minimum !== undefined && number < options.minimum) throw new Error(`${label} must be at least ${options.minimum}.`);
  if (options.maximum !== undefined && number > options.maximum) throw new Error(`${label} must be at most ${options.maximum}.`);
  if (options.exclusiveMinimum !== undefined && number <= options.exclusiveMinimum) throw new Error(`${label} must be greater than ${options.exclusiveMinimum}.`);
  return number;
}

function optionalFiniteNumber(value, label, options = {}) {
  return value === undefined || value === null || value === "" ? undefined : finiteNumber(value, label, options);
}

function booleanValue(value, fallback, label) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}

function optionalInteger(value, label, options = {}) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = finiteNumber(value, label, options);
  if (!Number.isInteger(number)) throw new Error(`${label} must be an integer.`);
  return number;
}

function normalizedAnchor(value, frameSize, renderedSize, fallbackRatio) {
  if (!Number.isFinite(Number(value))) return renderedSize * fallbackRatio;
  const anchor = Number(value);
  if (anchor >= 0 && anchor <= 1) return anchor * renderedSize;
  return frameSize > 0 ? (anchor / frameSize) * renderedSize : renderedSize * fallbackRatio;
}

function normalizeRect(value, label, { requireSize = true, collisionHeight = false } = {}) {
  const rect = objectValue(value, label);
  rejectUnknown(rect, new Set(["offsetX", "offsetY", "width", "height", ...(collisionHeight ? ["collisionHeight"] : [])]), label);
  return {
    offsetX: optionalFiniteNumber(rect.offsetX, `${label}.offsetX`) ?? 0,
    offsetY: optionalFiniteNumber(rect.offsetY, `${label}.offsetY`) ?? 0,
    ...(requireSize ? {
      width: finiteNumber(rect.width, `${label}.width`, { exclusiveMinimum: 0 }),
      height: finiteNumber(rect.height, `${label}.height`, { exclusiveMinimum: 0 }),
    } : {}),
    ...(collisionHeight && owns(rect, "collisionHeight") ? { collisionHeight: finiteNumber(rect.collisionHeight, `${label}.collisionHeight`, { exclusiveMinimum: 0 }) } : {}),
  };
}

function mapById(project, id, label) {
  const map = (project?.maps ?? []).find((candidate) => candidate.id === id);
  if (!map) throw new Error(`${label} was not found: ${id}.`);
  return map;
}

const rectangleSchema = (description, { collisionHeight = false } = {}) => ({
  type: "object",
  description,
  properties: {
    offsetX: { type: "number" },
    offsetY: { type: "number" },
    width: { type: "number", exclusiveMinimum: 0 },
    height: { type: "number", exclusiveMinimum: 0 },
    ...(collisionHeight ? { collisionHeight: { type: "number", exclusiveMinimum: 0 } } : {}),
  },
  required: ["width", "height"],
  additionalProperties: false,
});

const PLACE_SUPPORTED_PROP_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    mapId: { type: "string", minLength: 1, maxLength: 128, description: "Exact active map that receives the prop." },
    objectId: { type: "string", minLength: 1, maxLength: 128, description: "Stable object ID shared by both expanded commands." },
    name: { type: "string", minLength: 1, maxLength: 256 },
    x: { type: "number" },
    y: { type: "number" },
    z: { type: "number" },
    width: { type: "number", exclusiveMinimum: 0 },
    height: { type: "number", exclusiveMinimum: 0 },
    assetId: { type: "string", minLength: 1, maxLength: 128 },
    assetFrame: { type: "integer", minimum: 0 },
    scale: { type: "number", minimum: 0.125, maximum: 16 },
    solid: { type: "boolean", default: true },
    footprint: rectangleSchema("Explicit authored gameplay/support footprint. Required when solid is not false.", { collisionHeight: true }),
    visualBounds: rectangleSchema("Optional visible pixel bounds, independent of the gameplay footprint."),
    groundAnchor: {
      type: "object",
      properties: { offsetX: { type: "number" }, offsetY: { type: "number" } },
      required: ["offsetX", "offsetY"],
      additionalProperties: false,
    },
    supportMode: { enum: ["auto", "floor", "surface"], default: "auto" },
    surfaceId: { type: "string", minLength: 1, maxLength: 128 },
    supportOffset: { type: "number" },
    supportTolerance: { type: "number", minimum: 0, maximum: 64, default: 2 },
    cullingPadding: { type: "number", minimum: 0, maximum: 2048 },
    allowHudOverlap: { type: "boolean" },
  },
  required: ["mapId", "objectId", "x", "y"],
  additionalProperties: false,
};

const CONNECT_MAPS_ROUND_TRIP_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    sourceMapId: { type: "string", minLength: 1, maxLength: 128 },
    targetMapId: { type: "string", minLength: 1, maxLength: 128 },
    forwardPortalId: { type: "string", minLength: 1, maxLength: 128 },
    returnPortalId: { type: "string", minLength: 1, maxLength: 128 },
    forwardTargetSpawnId: { type: "string", minLength: 1, maxLength: 128 },
    returnTargetSpawnId: { type: "string", minLength: 1, maxLength: 128 },
    forwardPortalName: { type: "string", minLength: 1, maxLength: 256 },
    returnPortalName: { type: "string", minLength: 1, maxLength: 256 },
    forwardPortalX: { type: "number" },
    forwardPortalY: { type: "number" },
    returnPortalX: { type: "number" },
    returnPortalY: { type: "number" },
    forwardSpawnX: { type: "number" },
    forwardSpawnY: { type: "number" },
    returnSpawnX: { type: "number" },
    returnSpawnY: { type: "number" },
    transition: { enum: ["fade", "cut"], default: "fade" },
    runtimeJoin: { type: "boolean", default: true },
  },
  required: ["sourceMapId", "targetMapId", "forwardPortalId", "returnPortalId", "forwardTargetSpawnId", "returnTargetSpawnId"],
  additionalProperties: false,
};

const PROTECT_COMPLETION_WITNESS_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    caseId: { type: "string", minLength: 1, maxLength: 128, description: "Optional stable replay fixture ID. Defaults from the exact completion witness ID." },
    name: { type: "string", minLength: 1, maxLength: 256, description: "Optional human-readable replay name." },
    checkpointInterval: { type: "integer", minimum: 1, maximum: 36_000, default: 1, description: "Checkpoint spacing in deterministic simulation ticks." },
  },
  additionalProperties: false,
};

function normalizeSupportedProp(project, input) {
  const parameters = objectValue(input ?? {}, "place-supported-prop parameters");
  rejectUnknown(parameters, new Set(Object.keys(PLACE_SUPPORTED_PROP_SCHEMA.properties)), "place-supported-prop");
  const mapId = requiredString(parameters.mapId, "mapId");
  mapById(project, mapId, "mapId");
  if (mapId !== project.activeMapId) throw new Error(`place-supported-prop targets the active map only. Switch to ${mapId} before previewing this macro.`);
  const objectId = requiredString(parameters.objectId, "objectId");
  const assetId = optionalString(parameters.assetId, "assetId", 128);
  const asset = assetId ? (project.assets ?? []).find((candidate) => candidate.id === assetId) : null;
  if (assetId && !asset) throw new Error(`assetId was not found: ${assetId}.`);
  const scale = optionalFiniteNumber(parameters.scale, "scale", { minimum: 0.125, maximum: 16 }) ?? 1;
  const width = optionalFiniteNumber(parameters.width, "width", { exclusiveMinimum: 0 })
    ?? (asset ? finiteNumber(asset.frameWidth, "asset.frameWidth", { exclusiveMinimum: 0 }) * scale : undefined);
  const height = optionalFiniteNumber(parameters.height, "height", { exclusiveMinimum: 0 })
    ?? (asset ? finiteNumber(asset.frameHeight, "asset.frameHeight", { exclusiveMinimum: 0 }) * scale : undefined);
  if (!width || !height) throw new Error("place-supported-prop requires width and height when assetId is not provided.");
  const solid = booleanValue(parameters.solid, true, "solid");
  if (solid && !parameters.footprint) throw new Error("place-supported-prop requires an explicit footprint when solid is not false; generated art never defines gameplay collision.");
  const footprint = parameters.footprint ? normalizeRect(parameters.footprint, "footprint", { collisionHeight: true }) : null;
  const supportMode = parameters.supportMode ?? "auto";
  if (!["auto", "floor", "surface"].includes(supportMode)) throw new Error("supportMode must be auto, floor, or surface.");
  const surfaceId = optionalString(parameters.surfaceId, "surfaceId", 128);
  if (supportMode === "surface" && !surfaceId) throw new Error("surfaceId is required when supportMode is surface.");
  let groundAnchor;
  if (parameters.groundAnchor) {
    const value = objectValue(parameters.groundAnchor, "groundAnchor");
    rejectUnknown(value, new Set(["offsetX", "offsetY"]), "groundAnchor");
    groundAnchor = { offsetX: finiteNumber(value.offsetX, "groundAnchor.offsetX"), offsetY: finiteNumber(value.offsetY, "groundAnchor.offsetY") };
  } else {
    groundAnchor = {
      offsetX: normalizedAnchor(asset?.anchorX, Number(asset?.frameWidth ?? width), width, 0.5),
      offsetY: normalizedAnchor(asset?.anchorY, Number(asset?.frameHeight ?? height), height, 1),
    };
  }
  const visualBounds = parameters.visualBounds
    ? normalizeRect(parameters.visualBounds, "visualBounds")
    : asset ? visualBoundsForAsset(asset, width, height) : { offsetX: 0, offsetY: 0, width, height };
  return {
    mapId,
    objectId,
    name: optionalString(parameters.name, "name") ?? "Supported prop",
    x: finiteNumber(parameters.x, "x"),
    y: finiteNumber(parameters.y, "y"),
    z: optionalFiniteNumber(parameters.z, "z") ?? 0,
    width,
    height,
    ...(assetId ? { assetId, assetFrame: optionalInteger(parameters.assetFrame, "assetFrame", { minimum: 0 }) ?? 0, scale } : {}),
    solid,
    ...(footprint ? { footprint } : {}),
    visualBounds,
    groundAnchor,
    supportMode,
    ...(surfaceId ? { surfaceId } : {}),
    supportOffset: optionalFiniteNumber(parameters.supportOffset, "supportOffset") ?? 0,
    supportTolerance: optionalFiniteNumber(parameters.supportTolerance, "supportTolerance", { minimum: 0, maximum: 64 }) ?? 2,
    ...(owns(parameters, "cullingPadding") ? { cullingPadding: finiteNumber(parameters.cullingPadding, "cullingPadding", { minimum: 0, maximum: 2048 }) } : {}),
    ...(owns(parameters, "allowHudOverlap") ? { allowHudOverlap: booleanValue(parameters.allowHudOverlap, false, "allowHudOverlap") } : {}),
  };
}

function expandSupportedProp(_project, parameters) {
  const footprint = parameters.footprint;
  const fallbackCollider = authoredColliderForPlacement({ kind: "decor", role: "prop", width: parameters.width, height: parameters.height, z: parameters.z });
  const collider = parameters.solid && footprint ? {
    ...fallbackCollider,
    enabled: true,
    offsetX: footprint.offsetX,
    offsetY: footprint.offsetY,
    width: footprint.width,
    height: footprint.height,
    zMin: parameters.z,
    zMax: parameters.z + (footprint.collisionHeight ?? 1),
  } : { ...fallbackCollider, enabled: false };
  return [
    {
      op: "add_object",
      kind: "decor",
      object: {
        id: parameters.objectId,
        name: parameters.name,
        x: parameters.x,
        y: parameters.y,
        z: parameters.z,
        supportZ: parameters.z,
        width: parameters.width,
        height: parameters.height,
        ...(parameters.assetId ? { assetId: parameters.assetId, assetFrame: parameters.assetFrame } : {}),
        role: "prop",
        solid: parameters.solid,
        requiresSupport: true,
        anchorMode: "ground",
        groundAnchor: parameters.groundAnchor,
        supportFootprint: footprint ? { offsetX: footprint.offsetX, offsetY: footprint.offsetY, width: footprint.width, height: footprint.height } : undefined,
        visualBounds: parameters.visualBounds,
        collider,
        collisionOwner: "authored-map",
        ...(parameters.cullingPadding !== undefined ? { cullingPadding: parameters.cullingPadding } : {}),
        ...(parameters.allowHudOverlap !== undefined ? { allowHudOverlap: parameters.allowHudOverlap } : {}),
      },
    },
    {
      op: "attach_to_support",
      id: parameters.objectId,
      mode: parameters.supportMode,
      ...(parameters.surfaceId ? { surfaceId: parameters.surfaceId } : {}),
      offset: parameters.supportOffset,
      tolerance: parameters.supportTolerance,
    },
  ];
}

function normalizeRoundTrip(project, input) {
  const parameters = objectValue(input ?? {}, "connect-maps-round-trip parameters");
  rejectUnknown(parameters, new Set(Object.keys(CONNECT_MAPS_ROUND_TRIP_SCHEMA.properties)), "connect-maps-round-trip");
  const sourceMapId = requiredString(parameters.sourceMapId, "sourceMapId");
  const targetMapId = requiredString(parameters.targetMapId, "targetMapId");
  if (sourceMapId === targetMapId) throw new Error("sourceMapId and targetMapId must identify different maps.");
  mapById(project, sourceMapId, "sourceMapId");
  mapById(project, targetMapId, "targetMapId");
  const forwardPortalId = requiredString(parameters.forwardPortalId, "forwardPortalId");
  const returnPortalId = requiredString(parameters.returnPortalId, "returnPortalId");
  if (forwardPortalId === returnPortalId) throw new Error("forwardPortalId and returnPortalId must be different stable IDs.");
  const transition = parameters.transition ?? "fade";
  if (!["fade", "cut"].includes(transition)) throw new Error("transition must be fade or cut.");
  const normalized = {
    sourceMapId,
    targetMapId,
    forwardPortalId,
    returnPortalId,
    forwardTargetSpawnId: requiredString(parameters.forwardTargetSpawnId, "forwardTargetSpawnId"),
    returnTargetSpawnId: requiredString(parameters.returnTargetSpawnId, "returnTargetSpawnId"),
    forwardPortalName: optionalString(parameters.forwardPortalName, "forwardPortalName"),
    returnPortalName: optionalString(parameters.returnPortalName, "returnPortalName"),
    transition,
    runtimeJoin: booleanValue(parameters.runtimeJoin, true, "runtimeJoin"),
  };
  for (const key of ["forwardPortalX", "forwardPortalY", "returnPortalX", "returnPortalY", "forwardSpawnX", "forwardSpawnY", "returnSpawnX", "returnSpawnY"]) {
    if (owns(parameters, key)) normalized[key] = finiteNumber(parameters[key], key);
  }
  return normalized;
}

function definedEntries(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function expandRoundTrip(_project, parameters) {
  return [
    definedEntries({
      op: "connect_maps",
      sourceMapId: parameters.sourceMapId,
      targetMapId: parameters.targetMapId,
      portalId: parameters.forwardPortalId,
      portalName: parameters.forwardPortalName,
      targetSpawnId: parameters.forwardTargetSpawnId,
      portalX: parameters.forwardPortalX,
      portalY: parameters.forwardPortalY,
      spawnX: parameters.forwardSpawnX,
      spawnY: parameters.forwardSpawnY,
      connectionRole: "route-exit",
      reuseForwardExit: false,
      transition: parameters.transition,
      runtimeJoin: parameters.runtimeJoin,
    }),
    definedEntries({
      op: "connect_maps",
      sourceMapId: parameters.targetMapId,
      targetMapId: parameters.sourceMapId,
      portalId: parameters.returnPortalId,
      portalName: parameters.returnPortalName,
      targetSpawnId: parameters.returnTargetSpawnId,
      portalX: parameters.returnPortalX,
      portalY: parameters.returnPortalY,
      spawnX: parameters.returnSpawnX,
      spawnY: parameters.returnSpawnY,
      connectionRole: "route-return",
      reuseForwardExit: false,
      transition: parameters.transition,
      runtimeJoin: parameters.runtimeJoin,
    }),
  ];
}

function completionWitness(project) {
  const report = runCompletionHarness(project, { cache: false });
  if (report.status !== "passed" || report.passed !== true || !report.reproTape) {
    throw new Error(`protect-completion-witness requires a passed deterministic completion report with a repro tape; current status is ${report.status ?? "unknown"}.`);
  }
  const tape = report.reproTape;
  if (!Number.isInteger(tape.tickCount) || tape.tickCount < 1 || !Array.isArray(tape.inputs)) {
    throw new Error("protect-completion-witness received an invalid completion repro tape.");
  }
  return { report, tape };
}

function stableCompletionReplayId(witnessId) {
  const slug = String(witnessId ?? "witness").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 108) || "witness";
  return `completion-${slug}`;
}

function normalizeCompletionWitness(project, input) {
  const parameters = objectValue(input ?? {}, "protect-completion-witness parameters");
  rejectUnknown(parameters, new Set(Object.keys(PROTECT_COMPLETION_WITNESS_SCHEMA.properties)), "protect-completion-witness");
  const { report } = completionWitness(project);
  const caseId = optionalString(parameters.caseId, "caseId", 128) ?? stableCompletionReplayId(report.witnessId);
  if ((project.replay?.cases ?? []).some((replayCase) => replayCase.id === caseId)) {
    throw new Error(`Replay fixture already exists: ${caseId}. Use record_replay_case with a higher revision and non-empty changeReason for an intentional baseline replacement.`);
  }
  return {
    caseId,
    name: optionalString(parameters.name, "name") ?? `Completion regression: ${String(report.witnessId ?? "terminal witness")}`,
    checkpointInterval: optionalInteger(parameters.checkpointInterval, "checkpointInterval", { minimum: 1, maximum: 36_000 }) ?? 1,
  };
}

function expandCompletionWitness(project, parameters) {
  const { report, tape } = completionWitness(project);
  return [definedEntries({
    op: "record_replay_case",
    id: parameters.caseId,
    name: parameters.name,
    revision: 1,
    changeReason: `Promoted from deterministic completion witness ${String(report.witnessId ?? "unknown")}`,
    tickRate: tape.tickRate,
    tickCount: tape.tickCount,
    startMapId: tape.startMapId,
    startSpawnId: tape.startSpawnId,
    inputs: clone(tape.inputs),
    checkpointInterval: parameters.checkpointInterval,
  })];
}

const DEFINITIONS = Object.freeze([
  {
    id: "place-supported-prop",
    version: 1,
    title: "Place supported prop",
    description: "Place one floor-standing prop with an explicit ground anchor, authored gameplay footprint, collider, and verified support attachment.",
    safetyClass: "atomic-authored-mutation",
    operations: ["add_object", "attach_to_support"],
    parameterSchema: PLACE_SUPPORTED_PROP_SCHEMA,
    normalize: normalizeSupportedProp,
    expand: expandSupportedProp,
  },
  {
    id: "connect-maps-round-trip",
    version: 1,
    title: "Connect maps round trip",
    description: "Create explicit forward and return portals with stable IDs, exact target spawns, and runtime-join contracts.",
    safetyClass: "atomic-authored-mutation",
    operations: ["connect_maps", "connect_maps"],
    parameterSchema: CONNECT_MAPS_ROUND_TRIP_SCHEMA,
    normalize: normalizeRoundTrip,
    expand: expandRoundTrip,
  },
  {
    id: "protect-completion-witness",
    version: 1,
    title: "Protect completion witness",
    description: "Promote the exact current deterministic completion tape into a new versioned replay fixture without provider rewriting or silent baseline replacement.",
    safetyClass: "source-bound-regression-authoring",
    operations: ["record_replay_case"],
    parameterSchema: PROTECT_COMPLETION_WITNESS_SCHEMA,
    normalize: normalizeCompletionWitness,
    expand: expandCompletionWitness,
  },
]);

function publicDefinition(definition) {
  return {
    id: definition.id,
    version: definition.version,
    title: definition.title,
    description: definition.description,
    safetyClass: definition.safetyClass,
    operationCount: definition.operations.length,
    operations: [...definition.operations],
    parameterSchema: clone(definition.parameterSchema),
  };
}

export function listCommandMacros() {
  return {
    schemaVersion: LOOPLAB_COMMAND_MACRO_REGISTRY_SCHEMA,
    count: DEFINITIONS.length,
    macros: DEFINITIONS.map(publicDefinition),
    policy: {
      builtInOnly: true,
      nestedMacros: false,
      sideEffects: "Canonical project mutations only; no provider, network, file, export, browser-input, or capture operations.",
      collisionAuthority: "authored-map",
    },
  };
}

export function expandCommandMacro(project, macroId, parameters = {}) {
  const id = requiredString(macroId, "macroId");
  const definition = DEFINITIONS.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Unknown command macro: ${id}. Run list_command_macros to inspect the available registry.`);
  const normalizedParameters = definition.normalize(project, parameters);
  const commands = definition.expand(project, normalizedParameters).map((command) => clone(command));
  const expansionDigest = canonicalSha256({
    schemaVersion: LOOPLAB_COMMAND_MACRO_PLAN_SCHEMA,
    macro: { id: definition.id, version: definition.version },
    parameters: normalizedParameters,
    commands,
  });
  return {
    schemaVersion: LOOPLAB_COMMAND_MACRO_PLAN_SCHEMA,
    macro: publicDefinition(definition),
    parameters: clone(normalizedParameters),
    commands,
    expansionDigest,
  };
}
