import {
  LOOPLAB_AGENT_COMMANDS,
  LOOPLAB_BROWSER_ONLY_COMMANDS,
  LOOPLAB_CORE_COMMANDS,
} from "./looplab-command-surfaces.mjs";
import { LOOPLAB_GAME_DIRECTOR } from "./looplab-game-director.mjs";
import { LOOPLAB_OBJECT_UPDATE_FIELDS } from "./looplab-object-fields.mjs";
import { LOOPLAB_CANONICAL_PRESENTATION_EVENTS } from "./looplab-presentation.mjs";

export const LOOPLAB_COMMAND_CONTRACT_SCHEMA = "looplab-command-contracts/v1";
export const LOOPLAB_MCP_SERVER_VERSION = "1.3.0";

const JSON_SCHEMA = "https://json-schema.org/draft/2020-12/schema";
const string = (description, options = {}) => ({ type: "string", ...(description ? { description } : {}), ...options });
const number = (description, options = {}) => ({ type: "number", ...(description ? { description } : {}), ...options });
const integer = (description, options = {}) => ({ type: "integer", ...(description ? { description } : {}), ...options });
const boolean = (description) => ({ type: "boolean", ...(description ? { description } : {}) });
const object = (description) => ({ type: "object", ...(description ? { description } : {}), additionalProperties: true });
const array = (items, description, options = {}) => ({ type: "array", items, ...(description ? { description } : {}), ...options });
const enumeration = (values, description) => ({ type: "string", enum: values, ...(description ? { description } : {}) });

const commonProperties = Object.freeze({
  expectedSourceDigest: string("Project Doctor sourceDigest inspected immediately before this command.", { minLength: 1 }),
  expectedLedgerDigest: string("Shared work-ledger digest inspected immediately before this coordination mutation.", { pattern: "^sha256:[a-f0-9]{64}$" }),
  compact: boolean("Return a compact result without repeating the complete embedded project when the transport supports it."),
});

function schema(properties = {}, required = [], { additionalProperties = false, anyOf } = {}) {
  return {
    $schema: JSON_SCHEMA,
    type: "object",
    properties: { ...commonProperties, ...properties },
    ...(required.length ? { required } : {}),
    ...(anyOf ? { anyOf } : {}),
    additionalProperties,
  };
}

const noArgs = () => schema();
const idOnly = (label = "stable authored ID") => schema({ id: string(label, { minLength: 1 }) }, ["id"]);
const idOrName = (label = "authored object") => schema(
  { id: string(`${label} ID`, { minLength: 1 }), name: string(`${label} name`, { minLength: 1 }) },
  [],
  { anyOf: [{ required: ["id"] }, { required: ["name"] }] },
);
const idAndChanges = (label) => schema({ id: string(`${label} ID`, { minLength: 1 }), changes: object(`Allowed ${label} fields to update.`) }, ["id", "changes"]);
const objectUpdateProperties = Object.fromEntries(LOOPLAB_OBJECT_UPDATE_FIELDS.map((field) => [field, {}]));
Object.assign(objectUpdateProperties, {
  name: string("Object name.", { minLength: 1 }),
  x: number("Authored world x."), y: number("Authored world y."), z: number("Authored world z."), supportZ: number("Authored support elevation."),
  width: number("Visible width.", { exclusiveMinimum: 0 }), height: number("Visible height.", { exclusiveMinimum: 0 }),
  color: string("Six-digit display color.", { pattern: "^#[0-9a-fA-F]{6}$" }),
  opacity: number("Display opacity.", { minimum: 0, maximum: 1 }),
  solid: boolean("Authored solidity."), hidden: boolean("Authored visibility."),
  assetId: string("Referenced project asset ID.", { minLength: 1 }), assetFrame: integer("Non-negative atlas frame.", { minimum: 0 }),
  anchorMode: enumeration(["ground", "center", "top-left"], "Visual placement anchor."),
  collisionOwner: { const: "authored-map", description: "Collision remains owned by authored map data." },
  collider: object("Complete authored collider."), runtimeJoin: object("Complete portal runtime-join contract."),
  targetMapId: string("Portal target map ID.", { minLength: 1 }), targetSpawnId: string("Portal target spawn ID.", { minLength: 1 }),
  transition: string("Portal transition ID.", { minLength: 1 }), requiresSupport: boolean("Require verified floor or surface support."),
  groundAnchor: object("Visible ground-contact anchor."), supportFootprint: object("Gameplay support footprint."), supportContact: object("Resolved support contract."),
  depthSlices: array(object("Authored visual depth slice."), "Depth slices."), interactionSockets: array(object("Explicit interaction socket."), "Interaction sockets."),
});
const objectUpdateChanges = {
  type: "object",
  description: "Only declared authored object fields may change. ID, kind, motionBody, and arbitrary extension keys are rejected; use dedicated commands.",
  properties: objectUpdateProperties,
  minProperties: 1,
  additionalProperties: false,
};
const workItemKind = enumeration(["bug", "feature", "research", "documentation", "coordination"], "Strict shared-work classification.");
const workItemPriority = enumeration(["critical", "high", "medium", "low"], "Shared-work priority.");
const workItemStatus = enumeration(["open", "in-progress", "blocked", "landed", "rejected"], "Shared-work lifecycle state.");
const loopEvaluationProfile = enumeration(["auto", "general", "platformer", "top-down", "connected-world", "systems"], "Frozen cross-genre loop evaluation profile. Auto selects once from the starting authored project.");
const runtimePreference = enumeration(["auto", "canvas", "phaser", "pixi", "melon"], "2D runtime routing preference. Auto uses LoopLab's deterministic quality-fit policy; an explicit value overrides it.");
const motionBodyInput = {
  type: "object",
  description: "Strict deterministic non-player motion body bound to authored path/collision/support truth. Legacy v1 input is migrated to canonical v2; v2 makes player carry and crush response explicit.",
  properties: {
    schemaVersion: enumeration(["looplab-motion-body/v1", "looplab-motion-body/v2"], "Legacy blocking semantics or canonical explicit rider semantics."),
    enabled: boolean("Whether authored body motion executes."),
    driver: enumeration(["input", "automatic"], "Held semantic input or autonomous fixed-tick motion."),
    pathId: string("Same-map authored traversal path ID.", { minLength: 1 }),
    actionId: string("Declared semantic input action for input-driven motion.", { minLength: 1 }),
    initialDirection: enumeration(["forward", "reverse"], "Initial signed path direction."),
    endBehavior: enumeration(["stop", "loop", "ping-pong"], "Deterministic authored-path endpoint behavior."),
    maxSpeed: number("Maximum authored-path speed per second.", { exclusiveMinimum: 0, maximum: 4096 }),
    acceleration: number("Acceleration while the driver is active.", { minimum: 0, maximum: 100000 }),
    deceleration: number("Deceleration after held input is released or a stop is required.", { minimum: 0, maximum: 100000 }),
    collisionResponse: { const: "stop", description: "Axis-separated authored-collision response." },
    snapTolerance: number("Maximum authored start-pose distance from the path.", { minimum: 0, maximum: 128 }),
    riderMode: enumeration(["block", "carry-player"], "Keep the player as an ordinary blocker or transfer the exact accepted platform delta to a qualified platformer rider."),
    carryTolerance: number("Maximum ground-contact tolerance for a qualified player rider.", { minimum: 0, maximum: 32 }),
    crushResponse: enumeration(["stop", "respawn"], "Rollback and hold the platform, or use the canonical player respawn path when carried movement is blocked."),
    acceptanceTestId: string("Executable acceptance test covering movement/release/stop behavior.", { minLength: 1 }),
  },
  required: ["schemaVersion", "enabled", "driver", "pathId", "initialDirection", "endBehavior", "maxSpeed", "acceleration", "deceleration", "collisionResponse", "snapTolerance"],
  additionalProperties: false,
};
const combatStableId = string("Stable authored ID.", { pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$" });
const combatProgramInput = {
  type: "object",
  description: "Strict bounded deterministic projectiles, health, hits, teams, and targeting program.",
  properties: {
    schemaVersion: { const: "looplab-combat-program/v1" },
    enabled: boolean("Whether the deterministic combat program executes."),
    maxProjectiles: integer("Hard global logical projectile ceiling.", { minimum: 1, maximum: 512 }),
    teams: array({
      type: "object",
      properties: {
        id: combatStableId,
        targetTeamIds: array(combatStableId, "Explicit teams that this team may hit.", { maxItems: 32, uniqueItems: true }),
      },
      required: ["id", "targetTeamIds"],
      additionalProperties: false,
    }, "Combat teams.", { maxItems: 32 }),
    actors: array({
      type: "object",
      properties: {
        id: combatStableId, mapId: combatStableId, objectId: combatStableId, teamId: combatStableId,
        maxHp: integer("Maximum integer hit points.", { minimum: 1, maximum: 1000000 }),
        initialHp: integer("Initial integer hit points.", { minimum: 0, maximum: 1000000 }),
        invulnerabilityTicks: integer("Fixed ticks of post-hit immunity.", { minimum: 0, maximum: 1200 }),
        deathBehavior: enumeration(["event-only", "hide", "respawn"], "Deterministic depleted-health behavior."),
      },
      required: ["id", "mapId", "objectId", "teamId", "maxHp", "initialHp", "invulnerabilityTicks", "deathBehavior"],
      additionalProperties: false,
    }, "Health-bearing authored objects.", { maxItems: 128 }),
    emitters: array({
      type: "object",
      properties: {
        id: combatStableId, mapId: combatStableId, ownerObjectId: combatStableId, teamId: combatStableId,
        trigger: enumeration(["pressed", "held", "automatic"], "Fixed-tick firing trigger."),
        actionId: combatStableId,
        cooldownTicks: integer("Fixed ticks between shots.", { minimum: 1, maximum: 3600 }),
        poolSize: integer("Hard logical projectile slots for this emitter.", { minimum: 1, maximum: 128 }),
        muzzle: {
          type: "object",
          properties: { offsetX: number("World x muzzle offset.", { minimum: -256, maximum: 256 }), offsetY: number("World y muzzle offset.", { minimum: -256, maximum: 256 }), distance: number("Forward muzzle distance.", { minimum: 0, maximum: 256 }) },
          required: ["offsetX", "offsetY", "distance"],
          additionalProperties: false,
        },
        aim: {
          type: "object",
          properties: { mode: enumeration(["fixed", "movement", "nearest"], "Deterministic aim policy."), x: number("Fallback direction x.", { minimum: -1, maximum: 1 }), y: number("Fallback direction y.", { minimum: -1, maximum: 1 }), range: number("Nearest-target range.", { minimum: 1, maximum: 16384 }) },
          required: ["mode", "x", "y", "range"],
          additionalProperties: false,
        },
        projectile: {
          type: "object",
          properties: {
            speed: number("World units per second.", { exclusiveMinimum: 0, maximum: 8192 }), width: number("Authored hit width.", { exclusiveMinimum: 0, maximum: 256 }), height: number("Authored hit height.", { exclusiveMinimum: 0, maximum: 256 }), zHeight: number("Authored collision height.", { exclusiveMinimum: 0, maximum: 256 }),
            lifetimeTicks: integer("Fixed projectile lifetime.", { minimum: 1, maximum: 7200 }), damage: integer("Integer damage per accepted hit.", { minimum: 1, maximum: 1000000 }), pierce: integer("Additional actor hits before retirement.", { minimum: 0, maximum: 64 }),
            worldCollision: boolean("Whether authored solid colliders retire the projectile."), color: string("Renderer hint color.", { minLength: 1 }), opacity: number("Renderer hint opacity.", { minimum: 0, maximum: 1 }),
          },
          required: ["speed", "width", "height", "zHeight", "lifetimeTicks", "damage", "pierce", "worldCollision", "color", "opacity"],
          additionalProperties: false,
        },
      },
      required: ["id", "mapId", "ownerObjectId", "teamId", "trigger", "cooldownTicks", "poolSize", "muzzle", "aim", "projectile"],
      additionalProperties: false,
    }, "Bounded projectile emitters.", { maxItems: 64 }),
    acceptanceTestIds: array(combatStableId, "Executable combat evidence IDs.", { maxItems: 64, uniqueItems: true }),
  },
  required: ["schemaVersion", "enabled", "maxProjectiles", "teams", "actors", "emitters", "acceptanceTestIds"],
  additionalProperties: false,
};
const actorProgramInput = {
  type: "object",
  description: "Strict deterministic NPC/actor routes, perception, chase/flee/return transitions, and cutscene override program.",
  properties: {
    schemaVersion: { const: "looplab-actor-program/v1" },
    enabled: boolean("Whether the deterministic actor program executes."),
    actors: array({
      type: "object",
      properties: {
        id: combatStableId, mapId: combatStableId, objectId: combatStableId,
        baseMode: enumeration(["hold", "patrol"], "Authored behavior when no higher-priority response is active."),
        detectionMode: enumeration(["none", "chase", "flee"], "Response to visible or remembered targets."),
        target: {
          oneOf: [
            { type: "null" },
            { type: "object", properties: { kind: enumeration(["player", "actor", "object"], "Authored target kind."), id: combatStableId }, required: ["kind"], additionalProperties: false },
          ],
        },
        speed: number("World units per second.", { exclusiveMinimum: 0, maximum: 4096 }),
        arrivalRadius: number("Overshoot-safe route arrival radius.", { minimum: 0, maximum: 16384 }),
        stopDistance: number("Chase stopping distance.", { minimum: 0, maximum: 16384 }),
        safeDistance: number("Flee completion distance.", { minimum: 0, maximum: 16384 }),
        detectionRadius: number("Maximum perception range.", { minimum: 0, maximum: 16384 }),
        fieldOfViewDegrees: number("Horizontal field of view; 360 is omnidirectional.", { minimum: 0, maximum: 360 }),
        memoryTicks: integer("Fixed ticks to retain the last visible target point.", { minimum: 0, maximum: 7200 }),
        repathTicks: integer("Bounded fixed-tick path recomputation cadence.", { minimum: 1, maximum: 600 }),
        routeBehavior: enumeration(["loop", "ping-pong", "stop"], "Patrol endpoint behavior."),
        patrolNodeIds: array(combatStableId, "Ordered authored patrol navigation nodes.", { maxItems: 256, uniqueItems: true }),
        homeNodeId: combatStableId,
        initialFacing: { type: "object", properties: { x: number("Normalized facing x.", { minimum: -1, maximum: 1 }), y: number("Normalized facing y.", { minimum: -1, maximum: 1 }) }, required: ["x", "y"], additionalProperties: false },
        cutscene: {
          oneOf: [
            { type: "null" },
            { type: "object", properties: { variableId: combatStableId, operator: enumeration(["eq", "ne", "gt", "gte", "lt", "lte", "truthy", "falsy"], "Gameplay-variable gate operator."), value: {}, nodeIds: array(combatStableId, "Ordered authored cutscene navigation nodes.", { minItems: 2, maxItems: 256, uniqueItems: true }), routeBehavior: enumeration(["loop", "ping-pong", "stop"], "Cutscene route endpoint behavior.") }, required: ["variableId", "operator", "value", "nodeIds", "routeBehavior"], additionalProperties: false },
          ],
        },
      },
      required: ["id", "mapId", "objectId", "baseMode", "detectionMode", "target", "speed", "arrivalRadius", "stopDistance", "safeDistance", "detectionRadius", "fieldOfViewDegrees", "memoryTicks", "repathTicks", "routeBehavior", "patrolNodeIds", "homeNodeId", "initialFacing", "cutscene"],
      additionalProperties: false,
    }, "Deterministic actors.", { maxItems: 128 }),
    acceptanceTestIds: array(combatStableId, "Executable actor evidence IDs.", { maxItems: 64, uniqueItems: true }),
  },
  required: ["schemaVersion", "enabled", "actors", "acceptanceTestIds"],
  additionalProperties: false,
};
const collisionGeometryTuningInput = {
  type: "object",
  description: "Bounded deterministic slope and segment response tuning.",
  properties: {
    minimumFloorNormalY: number("Minimum upward normal magnitude used to classify a floor.", { minimum: 0, maximum: 1 }),
    floorSnapDistance: number("Maximum downward grounded snap while not moving upward.", { minimum: 0, maximum: 64 }),
    maximumStepUp: number("Maximum deterministic vertical step-up while following an ascending floor.", { minimum: 0, maximum: 64 }),
    stopOnSlope: boolean("Prevent resting downhill drift on supported slopes."),
    slopeSlideAcceleration: number("Downhill acceleration on surfaces too steep to classify as floor.", { minimum: 0, maximum: 4096 }),
    maximumSlideSpeed: number("Maximum deterministic downhill slide speed.", { exclusiveMinimum: 0, maximum: 4096 }),
    contactEpsilon: number("Bounded contact comparison epsilon.", { exclusiveMinimum: 0, maximum: 1 }),
  },
  required: ["minimumFloorNormalY", "floorSnapDistance", "maximumStepUp", "stopOnSlope", "slopeSlideAcceleration", "maximumSlideSpeed", "contactEpsilon"],
  additionalProperties: false,
};
const collisionGeometryInput = {
  type: "object",
  description: "Strict authored polyline collision geometry. Point order owns the canonical right-hand normal; generated art never owns collision.",
  properties: {
    schemaVersion: { const: "looplab-collision-geometry/v1" },
    collisionOwner: { const: "authored-map" },
    tuning: collisionGeometryTuningInput,
    chains: array({
      type: "object",
      properties: {
        id: combatStableId,
        name: string("Human-readable collision chain name.", { minLength: 1 }),
        enabled: boolean("Whether the chain participates in deterministic collision."),
        role: enumeration(["auto", "floor", "boundary"], "Explicit surface classification or normal-derived auto classification."),
        oneWay: boolean("Allow response only from the authored front face."),
        frontFace: { const: "right", description: "Canonical right-hand normal in y-down world coordinates." },
        zMin: number("Minimum independent world elevation.", { minimum: -1024, maximum: 1024 }),
        zMax: number("Exclusive maximum independent world elevation.", { minimum: -1024, maximum: 1024 }),
        sourceObjectId: combatStableId,
        points: array({
          type: "object",
          properties: {
            id: combatStableId,
            x: number("Authored world x.", { minimum: -65536, maximum: 65536 }),
            y: number("Authored world y.", { minimum: -65536, maximum: 65536 }),
          },
          required: ["id", "x", "y"],
          additionalProperties: false,
        }, "Ordered authored collision points.", { minItems: 2, maxItems: 256 }),
      },
      required: ["id", "name", "enabled", "role", "oneWay", "frontFace", "zMin", "zMax", "points"],
      additionalProperties: false,
    }, "Stable collision chains.", { maxItems: 128 }),
  },
  required: ["schemaVersion", "collisionOwner", "tuning", "chains"],
  additionalProperties: false,
};
const elevationTransitionsInput = {
  type: "object",
  description: "Strict authored world-space support-height transitions. Art and projection never imply elevation, collision, or navigation.",
  properties: {
    schemaVersion: { const: "looplab-elevation-transitions/v1" },
    supportOwner: { const: "authored-map" },
    transitions: array({
      type: "object",
      properties: {
        id: combatStableId,
        name: string("Human-readable ramp or stair name.", { minLength: 1 }),
        enabled: boolean("Whether the transition participates in deterministic support interpolation."),
        kind: enumeration(["ramp", "stairs"], "Authored presentation/inspection kind; both use continuous support interpolation."),
        width: number("World-space walkable corridor width.", { exclusiveMinimum: 0, maximum: 4096 }),
        entryRadius: number("Endpoint-only planar entry radius.", { exclusiveMinimum: 0, maximum: 4096 }),
        entryZTolerance: number("Maximum support-height difference allowed when entering.", { minimum: 0, maximum: 64 }),
        oneWay: boolean("Permit entry only at the first point and travel toward the final point."),
        fromLayerId: combatStableId,
        toLayerId: combatStableId,
        navigationLinkId: combatStableId,
        collisionChainId: combatStableId,
        points: array({
          type: "object",
          properties: {
            id: combatStableId,
            x: number("Authored world x.", { minimum: -65536, maximum: 65536 }),
            y: number("Authored world y.", { minimum: -65536, maximum: 65536 }),
            z: number("Authored support Z.", { minimum: -1024, maximum: 1024 }),
          },
          required: ["id", "x", "y", "z"],
          additionalProperties: false,
        }, "Ordered world-space transition points.", { minItems: 2, maxItems: 64 }),
      },
      required: ["id", "name", "enabled", "kind", "width", "entryRadius", "entryZTolerance", "oneWay", "points"],
      additionalProperties: false,
    }, "Stable authored elevation transitions.", { maxItems: 128 }),
  },
  required: ["schemaVersion", "supportOwner", "transitions"],
  additionalProperties: false,
};
const tileChunkInput = {
  type: "object",
  description: "One sparse fixed-grid tile chunk. Internal chunks are 16x16; boundary chunks may be clipped by the map edge.",
  properties: {
    x: integer("Chunk origin column.", { minimum: 0, maximum: 8191 }),
    y: integer("Chunk origin row.", { minimum: 0, maximum: 8191 }),
    width: integer("Stored chunk width.", { minimum: 1, maximum: 16 }),
    height: integer("Stored chunk height.", { minimum: 1, maximum: 16 }),
    cells: array(integer("Unsigned tile, terrain, or collision palette word.", { minimum: 0, maximum: 4294967295 }), "Row-major chunk cells.", { minItems: 1, maxItems: 256 }),
  },
  required: ["x", "y", "width", "height", "cells"],
  additionalProperties: false,
};
const tileTransformInput = {
  type: "object",
  properties: {
    horizontal: boolean("Permit horizontal flip."),
    vertical: boolean("Permit vertical flip."),
    diagonal: boolean("Permit diagonal flip."),
  },
  required: ["horizontal", "vertical", "diagonal"],
  additionalProperties: false,
};
const tileProgramInput = {
  type: "object",
  description: "Strict map-owned sparse tile source. Visual cells and collision cells remain independent authored data.",
  properties: {
    schemaVersion: { const: "looplab-tile-program/v1" },
    collisionOwner: { const: "authored-map" },
    cellWidth: integer("Logical cell width.", { minimum: 1, maximum: 512 }),
    cellHeight: integer("Logical cell height.", { minimum: 1, maximum: 512 }),
    columns: integer("Logical map columns.", { minimum: 1, maximum: 8192 }),
    rows: integer("Logical map rows.", { minimum: 1, maximum: 8192 }),
    chunkSize: { const: 16 },
    variationSeed: integer("Stable deterministic variant seed.", { minimum: 0, maximum: 2147483647 }),
    palette: array({
      type: "object",
      properties: {
        id: combatStableId,
        name: string("Palette-entry name.", { minLength: 1 }),
        assetId: combatStableId,
        frame: integer("Authored atlas frame.", { minimum: 0 }),
        drawOffsetX: integer("Visual x offset.", { minimum: -8192, maximum: 8192 }),
        drawOffsetY: integer("Visual y offset.", { minimum: -8192, maximum: 8192 }),
        anchor: enumeration(["top-left", "bottom-left", "bottom-center", "center"], "Visual anchor."),
        probability: number("Deterministic equivalent-variant weight.", { minimum: 0, maximum: 1000000 }),
        transforms: tileTransformInput,
      },
      required: ["id", "name", "assetId", "frame", "drawOffsetX", "drawOffsetY", "anchor", "probability", "transforms"],
      additionalProperties: false,
    }, "Stable visual tile palette.", { maxItems: 4096 }),
    terrainSets: array({
      type: "object",
      properties: {
        id: combatStableId,
        name: string("Terrain-set name.", { minLength: 1 }),
        kind: enumeration(["corner", "edge", "mixed"], "Exact authored signature family."),
        terrainIds: array(combatStableId, "Terrain IDs.", { minItems: 1, maxItems: 254, uniqueItems: true }),
        variants: array({
          type: "object",
          properties: {
            id: combatStableId,
            tileId: combatStableId,
            centerTerrainId: combatStableId,
            signature: array({ oneOf: [{ type: "null" }, combatStableId, { const: "*" }] }, "N, NE, E, SE, S, SW, W, NW signature.", { minItems: 8, maxItems: 8 }),
            probability: number("Deterministic variant weight.", { minimum: 0, maximum: 1000000 }),
          },
          required: ["id", "tileId", "centerTerrainId", "signature", "probability"],
          additionalProperties: false,
        }, "Exact terrain variants.", { maxItems: 4096 }),
      },
      required: ["id", "name", "kind", "terrainIds", "variants"],
      additionalProperties: false,
    }, "Authored exact-signature terrain sets.", { maxItems: 64 }),
    collisionProfiles: array({
      type: "object",
      properties: { id: combatStableId, name: string("Collision-profile name.", { minLength: 1 }), shape: enumeration(["solid-full", "one-way-top"], "Authored tile collision shape.") },
      required: ["id", "name", "shape"],
      additionalProperties: false,
    }, "Independent tile collision profiles.", { maxItems: 256 }),
    layers: array({
      type: "object",
      properties: {
        id: combatStableId,
        name: string("Tile-layer name.", { minLength: 1 }),
        role: enumeration(["ground-static", "interleaved", "foreground"], "Renderer-neutral depth role."),
        visible: boolean("Layer visibility."),
        locked: boolean("Layer editing lock."),
        opacity: number("Layer opacity.", { minimum: 0, maximum: 1 }),
        blendMode: enumeration(["normal", "multiply", "screen", "overlay", "darken", "lighten"], "Canvas-compatible blend mode."),
        parallaxX: number("Horizontal parallax.", { minimum: 0, maximum: 8 }),
        parallaxY: number("Vertical parallax.", { minimum: 0, maximum: 8 }),
        supportZ: number("Independent support elevation.", { minimum: -1024, maximum: 1024 }),
        navigationLayerId: combatStableId,
        terrainSetId: combatStableId,
        chunks: array(tileChunkInput, "Sparse direct visual chunks.", { maxItems: 4096 }),
        terrainChunks: array(tileChunkInput, "Sparse logical terrain chunks.", { maxItems: 4096 }),
      },
      required: ["id", "name", "role", "visible", "locked", "opacity", "blendMode", "parallaxX", "parallaxY", "supportZ", "chunks", "terrainChunks"],
      additionalProperties: false,
    }, "Visual tile layers.", { maxItems: 64 }),
    collisionLayers: array({
      type: "object",
      properties: {
        id: combatStableId,
        name: string("Tile collision-layer name.", { minLength: 1 }),
        visible: boolean("Collision-overlay visibility."),
        locked: boolean("Collision-layer editing lock."),
        zMin: number("Minimum independent world elevation.", { minimum: -1024, maximum: 1024 }),
        zMax: number("Exclusive maximum independent world elevation.", { minimum: -1024, maximum: 1024 }),
        navigationLayerId: combatStableId,
        chunks: array(tileChunkInput, "Sparse collision-profile chunks.", { maxItems: 4096 }),
      },
      required: ["id", "name", "visible", "locked", "zMin", "zMax", "chunks"],
      additionalProperties: false,
    }, "Independent authored collision layers.", { maxItems: 64 }),
  },
  required: ["schemaVersion", "collisionOwner", "cellWidth", "cellHeight", "columns", "rows", "chunkSize", "variationSeed", "palette", "terrainSets", "collisionProfiles", "layers", "collisionLayers"],
  additionalProperties: false,
};
const tilePatchOperationInput = {
  oneOf: [
    {
      type: "object",
      properties: { kind: { const: "paint-tile" }, layerId: combatStableId, x: integer("Cell column.", { minimum: 0, maximum: 8191 }), y: integer("Cell row.", { minimum: 0, maximum: 8191 }), tileId: combatStableId, flipH: boolean("Horizontal flip."), flipV: boolean("Vertical flip."), flipD: boolean("Diagonal flip.") },
      required: ["kind", "layerId", "x", "y", "tileId"],
      additionalProperties: false,
    },
    ...["erase-tile", "erase-terrain", "erase-collision"].map((kind) => ({
      type: "object",
      properties: { kind: { const: kind }, layerId: combatStableId, x: integer("Cell column.", { minimum: 0, maximum: 8191 }), y: integer("Cell row.", { minimum: 0, maximum: 8191 }) },
      required: ["kind", "layerId", "x", "y"],
      additionalProperties: false,
    })),
    {
      type: "object",
      properties: { kind: { const: "paint-terrain" }, layerId: combatStableId, x: integer("Cell column.", { minimum: 0, maximum: 8191 }), y: integer("Cell row.", { minimum: 0, maximum: 8191 }), terrainId: combatStableId },
      required: ["kind", "layerId", "x", "y", "terrainId"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { kind: { const: "paint-collision" }, layerId: combatStableId, x: integer("Cell column.", { minimum: 0, maximum: 8191 }), y: integer("Cell row.", { minimum: 0, maximum: 8191 }), profileId: combatStableId },
      required: ["kind", "layerId", "x", "y", "profileId"],
      additionalProperties: false,
    },
  ],
};
const tilePatchInput = {
  type: "object",
  description: "Bounded canonical tile edit batch for one exact map.",
  properties: {
    schemaVersion: { const: "looplab-tile-patch/v1" },
    mapId: combatStableId,
    operations: array(tilePatchOperationInput, "Ordered tile operations.", { minItems: 1, maxItems: 4096 }),
  },
  required: ["schemaVersion", "mapId", "operations"],
  additionalProperties: false,
};
const primaryProvider = enumeration(["openai", "anthropic", "codex", "claude"], "Explicit ready provider for this headless operation.");
const providerRouteMode = enumeration(["fallback", "strict"], "Fallback tries other ready provider paths with recorded provenance; strict locks the exact requested path.");
const directorSelection = (group, description) => enumeration(LOOPLAB_GAME_DIRECTOR[group].map((option) => option.value), `${description} This field accepts a canonical selection ID; put arbitrary detail in userPrompt instead of an invented ID.`);

const narrativeMode = enumeration(["auto", "include", "exclude"], "Narrative specialist routing. Auto uses authored story signals; include forces the role; exclude keeps the pass mechanics-first.");
const preferenceDimension = enumeration(["visual-composition", "player-clarity", "game-feel", "pacing-flow", "readability-accessibility", "art-direction", "overall-fit"], "Explicit user preference dimension.");
const preferenceDimensions = array(preferenceDimension, "One or more explicit preference dimensions.", { minItems: 1, maxItems: 7, uniqueItems: true });
const preferenceEntryId = string("Stable lowercase hyphenated preference entry ID.", { pattern: "^[a-z0-9][a-z0-9-]{5,95}$", maxLength: 96 });
const preferenceContextKeys = ["genres", "coreLoops", "movementTemplates", "formats", "progressionModes", "campaignScopes", "tags"];
const preferenceContextProperties = Object.fromEntries(preferenceContextKeys.map((key) => [key, array(string(`${key} context value.`, { minLength: 1, maxLength: 80 }), `Explicit ${key} context values.`, { maxItems: 12, uniqueItems: true })]));
const preferenceContextInput = {
  type: "object",
  description: "Explicit optional game-context selectors. Unknown fields and lossy normalization are rejected.",
  properties: preferenceContextProperties,
  additionalProperties: false,
};
const completePreferenceContextInput = { ...preferenceContextInput, required: preferenceContextKeys };
const preferenceEntryCommon = {
  id: preferenceEntryId,
  source: { const: "user-explicit" },
  enabled: boolean("Whether this explicit entry may be applied."),
  dimensions: preferenceDimensions,
  context: completePreferenceContextInput,
  createdAt: string("ISO-compatible creation time.", { minLength: 1, maxLength: 40 }),
  updatedAt: string("ISO-compatible update time.", { minLength: 1, maxLength: 40 }),
};
const statementPreferenceEntry = {
  type: "object",
  properties: { ...preferenceEntryCommon, kind: { const: "statement" }, statement: string("Exact user-authored preference statement.", { minLength: 1, maxLength: 600 }) },
  required: [...Object.keys(preferenceEntryCommon), "kind", "statement"],
  additionalProperties: false,
};
const pairwisePreferenceEntry = {
  type: "object",
  properties: {
    ...preferenceEntryCommon,
    kind: { const: "pairwise" },
    preferredCandidateId: string("Preferred iteration ID.", { minLength: 1, maxLength: 200 }),
    otherCandidateId: string("Compared iteration ID.", { minLength: 1, maxLength: 200 }),
    preferredSourceDigest: string("Exact preferred-candidate source digest.", { minLength: 1, maxLength: 200 }),
    otherSourceDigest: string("Exact compared-candidate source digest.", { minLength: 1, maxLength: 200 }),
    comparisonDigest: string("Exact source-bound comparison digest.", { minLength: 1, maxLength: 200 }),
    rationale: string("Explicit user reason for the choice.", { minLength: 1, maxLength: 600 }),
  },
  required: [...Object.keys(preferenceEntryCommon), "kind", "preferredCandidateId", "otherCandidateId", "preferredSourceDigest", "otherSourceDigest", "comparisonDigest", "rationale"],
  additionalProperties: false,
};
const preferenceMemoryInput = {
  type: "object",
  description: "Complete strict browser-local explicit preference memory.",
  properties: {
    schemaVersion: { const: "looplab-preference-memory/v1" },
    enabled: boolean("Global preference-memory state."),
    revision: integer("Monotonic builder-local revision.", { minimum: 0 }),
    updatedAt: { anyOf: [{ type: "null" }, string("ISO-compatible update time.", { minLength: 1, maxLength: 40 })] },
    entries: array({ oneOf: [statementPreferenceEntry, pairwisePreferenceEntry] }, "Explicit preference entries.", { maxItems: 100 }),
  },
  required: ["schemaVersion", "enabled", "revision", "updatedAt", "entries"],
  additionalProperties: false,
};
const playtestRating = enumeration(["up", "neutral", "down", "unrated"], "Deliberate player rating; unrated records no inferred preference.");
const playtestOutcome = enumeration(["completed", "quit", "stopped", "timeout", "left-preview"], "Observed session stop reason.");
const playtestFeedbackInput = {
  type: "object",
  properties: {
    source: enumeration(["unrated", "user-explicit"], "Feedback provenance."),
    rating: playtestRating,
    tags: array(string("Deliberate bounded feedback tag.", { minLength: 1, maxLength: 48 }), "Explicit tags.", { maxItems: 8, uniqueItems: true }),
    note: string("Optional deliberate player note.", { maxLength: 600 }),
  },
  required: ["source", "rating", "tags", "note"],
  additionalProperties: false,
};
const playtestBoundedTime = integer("Active session time.", { minimum: 0, maximum: 900000 });
const playtestMapBound = {
  type: "object",
  properties: {
    mapId: string("Map ID.", { minLength: 1, maxLength: 120 }),
    width: number("World width.", { minimum: 1, maximum: 100000 }),
    height: number("World height.", { minimum: 1, maximum: 100000 }),
  },
  required: ["mapId", "width", "height"],
  additionalProperties: false,
};
const playtestInputTransitionV1 = {
  type: "object",
  properties: {
    atMs: playtestBoundedTime,
    action: string("Resolved semantic gameplay action.", { pattern: "^[a-z][a-z0-9-]{0,79}$", maxLength: 80 }),
    pressed: boolean("True for press and false for release."),
    source: enumeration(["keyboard", "touch", "gamepad", "headless", "lifecycle"], "Resolved input source class."),
  },
  required: ["atMs", "action", "pressed", "source"],
  additionalProperties: false,
};
const playtestInputTransitionV2 = {
  type: "object",
  properties: {
    tick: integer("Exact zero-based simulation boundary at which this semantic transition was applied.", { minimum: 0, maximum: 36000 }),
    atMs: playtestBoundedTime,
    action: string("Resolved semantic gameplay action.", { pattern: "^[a-z][a-z0-9-]{0,79}$", maxLength: 80 }),
    pressed: boolean("True for press and false for release."),
    source: enumeration(["keyboard", "touch", "gamepad", "headless", "lifecycle"], "Resolved input source class."),
  },
  required: ["tick", "atMs", "action", "pressed", "source"],
  additionalProperties: false,
};
const playtestWorldPosition = {
  type: "object",
  properties: {
    x: number("Authored world x."),
    y: number("Authored world y."),
    z: number("Authored world elevation."),
  },
  required: ["x", "y", "z"],
  additionalProperties: false,
};
const playtestSample = {
  type: "object",
  properties: {
    atMs: playtestBoundedTime,
    mapId: string("Source-bound map ID.", { minLength: 1, maxLength: 120 }),
    x: number("Authored world x."),
    y: number("Authored world y."),
    z: number("Authored world elevation."),
    cellX: integer("Derived heatmap column.", { minimum: 0, maximum: 15 }),
    cellY: integer("Derived heatmap row.", { minimum: 0, maximum: 11 }),
  },
  required: ["atMs", "mapId", "x", "y", "z", "cellX", "cellY"],
  additionalProperties: false,
};
const playtestEventTextProperties = Object.fromEntries([
  "mapName", "transition", "objectId", "ruleId", "sourceMapId", "targetMapId", "actionId",
  "pathId", "choiceId", "pageId", "clockId", "variableId", "cause", "spawnId",
  "blockerId", "playerId", "actorId", "targetActorId", "projectileId", "emitterId", "teamId",
  "direction", "driver", "endBehavior", "response", "mode", "previousMode", "nodeId", "targetNodeId",
].map((key) => [key, string("Bounded canonical runtime-event field.", { minLength: 1, maxLength: 160 })]));
const playtestEventNumberProperties = Object.fromEntries(
  ["count", "value", "steps", "fromX", "fromY", "fromZ", "toX", "toY", "toZ", "progress", "speed", "remaining", "damage", "health", "maximumHealth"]
    .map((key) => [key, number("Finite canonical runtime-event value.")]),
);
const playtestRuntimeEvent = {
  type: "object",
  properties: {
    atMs: playtestBoundedTime,
    type: enumeration([...LOOPLAB_CANONICAL_PRESENTATION_EVENTS, "gameplay.rule-guard", "motion-body.guard", "preview.reset"], "Allowlisted canonical runtime event."),
    mapId: string("Source-bound map ID.", { minLength: 1, maxLength: 120 }),
    position: playtestWorldPosition,
    ...playtestEventTextProperties,
    ...playtestEventNumberProperties,
  },
  required: ["atMs", "type"],
  additionalProperties: false,
};
const playtestIdleSpan = {
  type: "object",
  properties: {
    startMs: playtestBoundedTime,
    endMs: playtestBoundedTime,
    durationMs: playtestBoundedTime,
    mapId: string("Source-bound map ID.", { minLength: 1, maxLength: 120 }),
  },
  required: ["startMs", "endMs", "durationMs", "mapId"],
  additionalProperties: false,
};
const playtestSuspensions = {
  type: "object",
  properties: {
    count: integer("Total explicit recorder suspensions.", { minimum: 0 }),
    reasons: {
      type: "object",
      propertyNames: { pattern: "^[a-z][a-z0-9-]{0,47}$" },
      additionalProperties: { type: "integer", minimum: 1 },
    },
  },
  required: ["count", "reasons"],
  additionalProperties: false,
};
const playtestDropped = {
  type: "object",
  properties: Object.fromEntries(
    ["inputTransitions", "samples", "events", "clockGaps"].map((key) => [key, integer("Bounded recorder drop counter.", { minimum: 0 })]),
  ),
  required: ["inputTransitions", "samples", "events", "clockGaps"],
  additionalProperties: false,
};
const playtestHeatmapCell = {
  type: "object",
  properties: {
    x: integer("Heatmap column.", { minimum: 0, maximum: 15 }),
    y: integer("Heatmap row.", { minimum: 0, maximum: 11 }),
    samples: integer("Samples in this cell.", { minimum: 0 }),
    respawns: integer("Respawns in this cell.", { minimum: 0 }),
  },
  required: ["x", "y", "samples", "respawns"],
  additionalProperties: false,
};
const playtestHeatmap = {
  type: "object",
  properties: {
    mapId: string("Source-bound map ID.", { minLength: 1, maxLength: 120 }),
    columns: { const: 16 },
    rows: { const: 12 },
    cells: array(playtestHeatmapCell, "Non-empty observed heatmap cells.", { maxItems: 192 }),
  },
  required: ["mapId", "columns", "rows", "cells"],
  additionalProperties: false,
};
const playtestMapStat = {
  type: "object",
  properties: {
    mapId: string("Source-bound map ID.", { minLength: 1, maxLength: 120 }),
    activeDurationMs: playtestBoundedTime,
    visits: integer("Observed visits.", { minimum: 0 }),
    sampleCount: integer("World samples.", { minimum: 0 }),
    actionCount: integer("Pressed semantic actions.", { minimum: 0 }),
    collections: integer("Collection events.", { minimum: 0 }),
    respawns: integer("Respawn events.", { minimum: 0 }),
    resets: integer("Preview reset events.", { minimum: 0 }),
    portals: integer("Portal-entry events.", { minimum: 0 }),
  },
  required: ["mapId", "activeDurationMs", "visits", "sampleCount", "actionCount", "collections", "respawns", "resets", "portals"],
  additionalProperties: false,
};
const playtestSummaryCounts = {
  type: "object",
  properties: Object.fromEntries(
    ["inputTransitions", "actions", "collections", "respawns", "resets", "portals", "mapChanges", "idleSpans"]
      .map((key) => [key, integer("Canonical derived observation count.", { minimum: 0 })]),
  ),
  required: ["inputTransitions", "actions", "collections", "respawns", "resets", "portals", "mapChanges", "idleSpans"],
  additionalProperties: false,
};
const playtestSummary = {
  type: "object",
  properties: {
    activeDurationMs: playtestBoundedTime,
    outcome: playtestOutcome,
    completed: boolean("Observed completion fact, not verification evidence."),
    counts: playtestSummaryCounts,
    mapStats: array(playtestMapStat, "Canonical source-bound per-map summaries.", { maxItems: 64 }),
    heatmaps: array(playtestHeatmap, "Canonical source-bound spatial summaries.", { maxItems: 64 }),
  },
  required: ["activeDurationMs", "outcome", "completed", "counts", "mapStats", "heatmaps"],
  additionalProperties: false,
};
const playtestObservationPolicyInput = {
  type: "object",
  properties: {
    storage: { const: "browser-local-builder-only" },
    optInRequired: { const: true },
    purpose: { const: "Improve the selected 2D game through a local, consented human playtest observation." },
    networkTelemetry: { const: false },
    projectSource: { const: false },
    providerContext: { const: false },
    exportedHtml: { const: false },
    verificationEvidence: { const: false },
    replayFixture: { const: false },
    automaticPreference: { const: false },
    behavioralTasteInference: { const: false },
    screenshots: { const: false },
    deviceIdentity: { const: false },
    arbitraryKeys: { const: false },
  },
  required: ["storage", "optInRequired", "purpose", "networkTelemetry", "projectSource", "providerContext", "exportedHtml", "verificationEvidence", "replayFixture", "automaticPreference", "behavioralTasteInference", "screenshots", "deviceIdentity", "arbitraryKeys"],
  additionalProperties: false,
};
const playtestSessionImport = {
  type: "object",
  description: "Complete digest-bound local observational session. Canonical import performs deeper strict nested validation.",
  properties: {
    schemaVersion: enumeration(["looplab-playtest-session/v1", "looplab-playtest-session/v2"], "Legacy wall-clock observation or current exact-tick observation."),
    id: string("Stable session ID.", { pattern: "^[a-z0-9][a-z0-9-]{5,95}$", maxLength: 96 }),
    status: { const: "completed" },
    source: {
      type: "object",
      properties: {
        projectId: string("Selected project-library ID.", { minLength: 1, maxLength: 160 }),
        projectName: string("Selected project name.", { minLength: 1, maxLength: 200 }),
        iterationId: { anyOf: [{ type: "null" }, string("Iteration ID.", { minLength: 1, maxLength: 160 })] },
        sourceDigest: string("Exact Project Doctor source digest.", { pattern: "^(sha256:|source-)[a-f0-9]{64}$" }),
        startMapId: string("Initial map ID.", { minLength: 1, maxLength: 120 }),
        startSpawnId: { anyOf: [{ type: "null" }, string("Initial spawn ID.", { minLength: 1, maxLength: 120 })] },
        mapBounds: array(playtestMapBound, "Source-bound map dimensions.", { minItems: 1, maxItems: 64 }),
      },
      required: ["projectId", "projectName", "iterationId", "sourceDigest", "startMapId", "startSpawnId", "mapBounds"],
      additionalProperties: false,
    },
    consent: {
      type: "object",
      properties: { granted: { const: true }, purpose: { const: "Improve the selected 2D game through a local, consented human playtest observation." }, grantedAt: string("ISO-compatible consent time.", { minLength: 1, maxLength: 40 }) },
      required: ["granted", "purpose", "grantedAt"],
      additionalProperties: false,
    },
    startedAt: string("ISO-compatible start time.", { minLength: 1, maxLength: 40 }),
    endedAt: string("ISO-compatible end time.", { minLength: 1, maxLength: 40 }),
    activeDurationMs: integer("Visible, unpaused active time.", { minimum: 0, maximum: 900000 }),
    outcome: playtestOutcome,
    inputTape: {
      oneOf: [
        {
          type: "object",
          properties: {
            semantics: { const: "observational-action-transitions" },
            replayFixture: { const: false },
            transitions: array(playtestInputTransitionV1, "Legacy wall-clock semantic transitions.", { maxItems: 4000 }),
          },
          required: ["semantics", "replayFixture", "transitions"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            semantics: { const: "simulation-tick-action-transitions" },
            replayFixture: { const: false },
            tickRate: integer("Exact fixed simulation rate.", { minimum: 20, maximum: 240 }),
            startTick: { const: 0 },
            startMode: enumeration(["authored-reset", "current-preview"], "Whether recording began from authored reset truth."),
            tickCount: integer("Completed fixed simulation ticks.", { minimum: 0, maximum: 36000 }),
            transitions: array(playtestInputTransitionV2, "Exact tick-indexed semantic transitions.", { maxItems: 4000 }),
          },
          required: ["semantics", "replayFixture", "tickRate", "startTick", "startMode", "tickCount", "transitions"],
          additionalProperties: false,
        },
      ],
    },
    samples: array(playtestSample, "World-coordinate samples.", { maxItems: 3600 }),
    events: array(playtestRuntimeEvent, "Observed runtime events.", { maxItems: 2000 }),
    idleSpans: array(playtestIdleSpan, "Idle spans.", { maxItems: 200 }),
    suspensions: playtestSuspensions,
    dropped: playtestDropped,
    feedback: playtestFeedbackInput,
    summary: playtestSummary,
    policy: playtestObservationPolicyInput,
    digest: string("Canonical session SHA-256.", { pattern: "^sha256:[a-f0-9]{64}$" }),
  },
  required: ["schemaVersion", "id", "status", "source", "consent", "startedAt", "endedAt", "activeDurationMs", "outcome", "inputTape", "samples", "events", "idleSpans", "suspensions", "dropped", "feedback", "summary", "policy", "digest"],
  additionalProperties: false,
};
const playtestLedgerInput = {
  type: "object",
  description: "Complete strict browser-local playtest observation ledger.",
  properties: {
    schemaVersion: { const: "looplab-playtest-ledger/v1" },
    revision: integer("Monotonic builder-local revision.", { minimum: 0 }),
    updatedAt: { anyOf: [{ type: "null" }, string("ISO-compatible update time.", { minLength: 1, maxLength: 40 })] },
    sessions: array(playtestSessionImport, "Completed local observation sessions.", { maxItems: 20 }),
  },
  required: ["schemaVersion", "revision", "updatedAt", "sessions"],
  additionalProperties: false,
};
const appliedProvenanceCommon = {
  source: { const: "user-explicit" },
  createdAt: string("ISO-compatible source creation time.", { minLength: 1, maxLength: 40 }),
  updatedAt: string("ISO-compatible source update time.", { minLength: 1, maxLength: 40 }),
};
const appliedStatementEntry = {
  type: "object",
  properties: {
    id: preferenceEntryId,
    kind: { const: "statement" },
    dimensions: preferenceDimensions,
    guidance: string("Bounded explicit guidance.", { minLength: 1, maxLength: 800 }),
    context: completePreferenceContextInput,
    relevance: { type: "object", properties: { reasons: array(string("Exact context-match reason.", { minLength: 1, maxLength: 160 }), "Context-match reasons.", { maxItems: 12, uniqueItems: true }) }, required: ["reasons"], additionalProperties: false },
    provenance: { type: "object", properties: appliedProvenanceCommon, required: Object.keys(appliedProvenanceCommon), additionalProperties: false },
  },
  required: ["id", "kind", "dimensions", "guidance", "context", "relevance", "provenance"],
  additionalProperties: false,
};
const appliedPairwiseEntry = {
  ...appliedStatementEntry,
  properties: {
    ...appliedStatementEntry.properties,
    kind: { const: "pairwise" },
    provenance: {
      type: "object",
      properties: {
        ...appliedProvenanceCommon,
        comparisonDigest: string("Exact comparison digest.", { minLength: 1, maxLength: 200 }),
        preferredSourceDigest: string("Exact preferred-candidate source digest.", { minLength: 1, maxLength: 200 }),
        otherSourceDigest: string("Exact compared-candidate source digest.", { minLength: 1, maxLength: 200 }),
      },
      required: [...Object.keys(appliedProvenanceCommon), "comparisonDigest", "preferredSourceDigest", "otherSourceDigest"],
      additionalProperties: false,
    },
  },
};
const preferencePolicyInput = {
  type: "object",
  properties: {
    storage: { const: "browser-local-builder-only" }, explicitSignalsOnly: { const: true }, inferredSignals: { const: false }, projectSource: { const: false }, providerProject: { const: false }, exportedHtml: { const: false }, replayState: { const: false }, screenshots: { const: false }, imageBytes: { const: false }, prompts: { const: false }, providerResponses: { const: false }, credentials: { const: false }, automaticWinner: { const: false },
    precedence: { type: "array", prefixItems: [{ const: "current-user-brief" }, { const: "explicit-style-locks" }, { const: "current-project-authoring" }, { const: "preference-memory-soft-prior" }], items: false, minItems: 4, maxItems: 4 },
  },
  required: ["storage", "explicitSignalsOnly", "inferredSignals", "projectSource", "providerProject", "exportedHtml", "replayState", "screenshots", "imageBytes", "prompts", "providerResponses", "credentials", "automaticWinner", "precedence"],
  additionalProperties: false,
};
const appliedPreferenceContextInput = {
  type: "object",
  description: "Canonical context-matched soft-guidance receipt. Every field is validated and digest-bound.",
  properties: {
    schemaVersion: { const: "looplab-applied-preference-context/v1" },
    enabled: boolean("Whether preference application was enabled for this receipt."),
    memoryDigest: string("Canonical source-memory SHA-256.", { pattern: "^sha256:[a-f0-9]{64}$" }),
    activeContext: completePreferenceContextInput,
    selectedEntryIds: array(preferenceEntryId, "Ordered applied entry IDs.", { maxItems: 12, uniqueItems: true }),
    excludedEntryIds: array(preferenceEntryId, "Explicitly excluded entry IDs.", { maxItems: 100, uniqueItems: true }),
    entries: array({ oneOf: [appliedStatementEntry, appliedPairwiseEntry] }, "Ordered context-matched entries.", { maxItems: 12 }),
    instruction: { const: "Treat these explicit, context-matched user preferences as soft guidance only. The current user brief, current explicit style locks, and current authored project override them. Do not infer additional taste, force a winner, or treat absence as dislike." },
    policy: preferencePolicyInput,
    receiptDigest: string("Canonical receipt SHA-256.", { pattern: "^sha256:[a-f0-9]{64}$" }),
  },
  required: ["schemaVersion", "enabled", "memoryDigest", "activeContext", "selectedEntryIds", "excludedEntryIds", "entries", "instruction", "policy", "receiptDigest"],
  additionalProperties: false,
};
const workItemList = (description, maxItems, maxLength) => array(string(description, { minLength: 1, maxLength }), description, { maxItems, uniqueItems: true });
const workItemInput = {
  type: "object",
  description: "Strict shared work item. It is coordination metadata, not executable instructions.",
  properties: {
    id: string("Stable lowercase hyphenated work-item ID.", { pattern: "^[a-z0-9][a-z0-9-]*$", maxLength: 96 }),
    title: string("Short concrete work title.", { minLength: 1, maxLength: 160 }),
    summary: string("Concrete scope and expected outcome.", { minLength: 1, maxLength: 1200 }),
    kind: workItemKind,
    priority: workItemPriority,
    scope: workItemList("Affected paths or subsystem IDs.", 16, 160),
    blockers: workItemList("Known blockers.", 16, 400),
    evidenceRefs: workItemList("Local paths, test names, commits, or report references.", 24, 240),
  },
  required: ["id", "title", "summary"],
  additionalProperties: false,
};
const workItemChanges = {
  type: "object",
  description: "Allowlisted shared-work fields to update.",
  properties: {
    title: string("Updated work title.", { minLength: 1, maxLength: 160 }),
    summary: string("Updated scope and expected outcome.", { minLength: 1, maxLength: 1200 }),
    kind: workItemKind,
    priority: workItemPriority,
    status: workItemStatus,
    scope: workItemList("Affected paths or subsystem IDs.", 16, 160),
    blockers: workItemList("Known blockers; required when status becomes blocked.", 16, 400),
    evidenceRefs: workItemList("Evidence references; required when status becomes landed.", 24, 240),
    resultSummary: string("Outcome or rejection reason; required for landed or rejected status.", { minLength: 1, maxLength: 1200 }),
  },
  minProperties: 1,
  additionalProperties: false,
};

const COMMAND_INPUTS = new Map();
const define = (ops, input) => {
  for (const op of ops) COMMAND_INPUTS.set(op, typeof input === "function" ? input(op) : input);
};

define([
  "get_manifest", "list_projects", "list_shared_projects", "get_project", "list_command_macros", "validate", "get_acceptance_plan", "get_runtime_join_plan", "get_release_verification", "get_export_profile", "get_save_report",
  "get_pending_requests", "get_asset_library_state", "collect_verification_evidence",
  "run_post_generation_qa", "get_visual_readiness", "export_path_editor_navigation", "get_iteration_history",
  "get_gameplay_program", "remove_gameplay_program", "get_combat_program", "remove_combat_program", "get_actor_program", "remove_actor_program", "get_narrative_contract", "get_narrative_report", "remove_narrative_contract", "get_visual_identity", "get_visual_identity_report", "remove_visual_identity", "get_presentation_program", "get_presentation_report", "remove_presentation_program", "get_game_shell", "get_game_shell_report", "remove_game_shell", "get_feel_report", "get_tuning_contract", "remove_tuning_contract", "get_structural_scaffold_contract", "remove_structural_scaffold_contract", "get_spatial_layout_contract", "remove_spatial_layout_contract", "get_verb_architecture", "remove_verb_architecture",
  "get_director_state", "get_prompt_draft", "get_preview_state", "preview_pause", "preview_resume", "preview_reset",
  "list_game_foundations",
], noArgs());

define(["list_agent_recipes"], schema({
  query: string("Bounded text filter matched deterministically against recipe IDs, titles, summaries, tags, signals, and symptoms.", { maxLength: 240 }),
  tag: string("Exact stable lowercase recipe tag.", { pattern: "^[a-z0-9][a-z0-9-]*$" }),
  issueCode: string("Exact Project Doctor or transport issue code.", { maxLength: 120 }),
  status: enumeration(["active", "deprecated", "all"], "Recipe lifecycle filter; defaults to active."),
  limit: integer("Maximum compact recipe summaries.", { minimum: 1, maximum: 50 }),
}));
define(["get_agent_recipe"], schema({ recipeId: string("Stable agent recipe ID.", { minLength: 1, maxLength: 120 }) }, ["recipeId"]));

const benchmarkUsageInput = {
  type: "object",
  description: "Measured provider usage. Provider-none deterministic evaluation must remain zero.",
  properties: {
    inputTokens: integer("Measured input tokens.", { minimum: 0 }),
    cachedInputTokens: integer("Measured cached input tokens included in inputTokens.", { minimum: 0 }),
    outputTokens: integer("Measured output tokens.", { minimum: 0 }),
    reasoningTokens: integer("Measured reasoning tokens when reported separately.", { minimum: 0 }),
    totalTokens: integer("Measured total tokens.", { minimum: 0 }),
    rateEquivalentUsd: number("Measured API-rate equivalent dollars; subscription-backed CLI use is not an additional charge.", { minimum: 0 }),
  },
  additionalProperties: false,
};
const benchmarkRunInput = {
  type: "object",
  description: "Exact run identity and measured efficiency. Provider-backed runs require a complete numbered trial set.",
  properties: {
    provider: enumeration(["none", "openai", "anthropic", "codex", "claude", "file"], "Provider identity; none is deterministic re-grading without generation."),
    model: string("Exact provider model identity.", { maxLength: 160 }),
    scaffold: string("Starting template or scaffold identity.", { minLength: 1, maxLength: 160 }),
    strategy: string("Ordinary build/loop strategy identity.", { minLength: 1, maxLength: 160 }),
    contextBudgetTokens: integer("Configured provider context budget.", { minimum: 0 }),
    trialSetId: string("Stable complete trial-set identity.", { minLength: 1, maxLength: 120 }),
    trialIndex: integer("One-based trial index.", { minimum: 1, maximum: 50 }),
    trialCount: integer("Declared complete trial count.", { minimum: 1, maximum: 50 }),
    usage: benchmarkUsageInput,
    toolCalls: integer("Measured tool calls.", { minimum: 0 }),
    retries: integer("Measured retries.", { minimum: 0 }),
    wallTimeMs: integer("Measured wall time in milliseconds.", { minimum: 0 }),
  },
  additionalProperties: false,
};
define(["list_builder_benchmarks"], schema({
  query: string("Bounded text filter over benchmark IDs, titles, categories, prompts, and visible constraints.", { maxLength: 240 }),
  category: enumeration(["all", "platformer", "top-down", "connected-world", "systems"], "Exact benchmark category filter."),
  limit: integer("Maximum returned visible benchmark definitions.", { minimum: 1, maximum: 24 }),
}));
define(["evaluate_builder_benchmark"], schema({
  benchmarkId: string("Stable golden-brief benchmark ID.", { minLength: 1, maxLength: 120 }),
  run: benchmarkRunInput,
}, ["benchmarkId"]));
define(["compare_builder_benchmark_runs"], schema({
  baselineRuns: array(object("Exact looplab-builder-benchmark-run/v1 receipt."), "Complete baseline receipt set.", { minItems: 1, maxItems: 50 }),
  candidateRuns: array(object("Exact looplab-builder-benchmark-run/v1 receipt."), "Complete candidate receipt set.", { minItems: 1, maxItems: 50 }),
}, ["baselineRuns", "candidateRuns"]));

define(["suggest_presentation_program"], schema({
  status: enumeration(["draft", "approved"], "Lifecycle status for the suggested provider-free starter; defaults to draft."),
}));
define(["set_presentation_program"], schema({
  program: object("Versioned renderer-neutral event-to-audio-and-motion presentation program."),
}, ["program"]));

define(["suggest_game_shell"], schema({
  status: enumeration(["draft", "approved"], "Lifecycle status for the provider-free standard shell suggestion; defaults to draft."),
}));
define(["set_game_shell"], schema({
  shell: object("Strict looplab-game-shell/v1 title, pause, settings, restart, and terminal-surface contract."),
}, ["shell"]));

define(["set_visual_identity"], schema({
  identity: object("Strict looplab-visual-identity/v1 project contract with authored directives, asset references, and exclusions."),
}, ["identity"]));

define(["suggest_tuning_contract"], schema({
  maxCandidates: integer("Maximum deterministic candidates in the suggested bounded search.", { minimum: 2, maximum: 24 }),
}));
define(["set_tuning_contract"], schema({
  contract: object("Versioned bounded Tuning Contract with allowlisted numeric targets, measured objectives, optional constraints, and a finite candidate budget."),
}, ["contract"]));
define(["run_tuning_search"], schema({
  contract: object("Optional one-run Tuning Contract. When omitted, the authored project tuningContract is used."),
}, ["expectedSourceDigest"]));

define(["suggest_game_foundations"], schema({
  maxCandidates: integer("Maximum technically distinct foundation candidates returned for explicit review.", { minimum: 2, maximum: 5 }),
  allowReplacement: boolean("Explicitly authorize preparing replacement of the loaded protected variation; suggestion remains read-only."),
  allowUnproven: boolean("Allow a validated starter with an incomplete proof ledger to become materializable after its gaps are reviewed."),
}));
define(["materialize_game_foundation"], schema({
  foundationId: enumeration(["platformer", "topdown", "systems", "dimetric", "kinetic"], "Exact program-owned foundation ID returned by suggest_game_foundations."),
  expectedCandidateDigest: string("Exact SHA-256 candidate digest returned by the source-bound suggestion.", { pattern: "^sha256:[a-f0-9]{64}$" }),
  allowReplacement: boolean("Must be true to replace the loaded protected variation through a later preview/apply workflow."),
  allowUnproven: boolean("Must match the reviewed suggestion authority when materializing an incomplete validated starter."),
}, ["expectedSourceDigest", "foundationId", "expectedCandidateDigest", "allowReplacement"]));

const structuralScaffoldContractInput = {
  type: "object",
  description: "Strict bounded renderer-neutral structural scaffold contract.",
  properties: {
    schemaVersion: { type: "string", const: "looplab-structural-scaffold-contract/v1" },
    status: enumeration(["draft", "approved"], "Authored contract lifecycle."),
    intent: string("Bounded structural design intent.", { minLength: 1, maxLength: 600 }),
    families: array(enumeration(["quest-network", "economy-loop", "encounter-progression"], "Supported renderer-neutral scaffold family."), "Families to explore.", { minItems: 1, maxItems: 3, uniqueItems: true }),
    constraints: {
      type: "object",
      properties: {
        minimumDecisionDepth: integer("Minimum choices on a shortest path to a terminal outcome.", { minimum: 1, maximum: 8 }),
        maximumDecisionDepth: integer("Maximum choices on a shortest path to a terminal outcome.", { minimum: 1, maximum: 8 }),
        minimumBranchPages: integer("Minimum reachable branching pages.", { minimum: 0, maximum: 6 }),
        maximumBranchPages: integer("Maximum reachable branching pages.", { minimum: 0, maximum: 6 }),
        cyclePolicy: enumeration(["allow", "forbid", "required"], "Whether directed gameplay cycles are allowed, forbidden, or required."),
        maximumChoicesPerPage: integer("Maximum semantic choices on one page.", { minimum: 1, maximum: 4 }),
        replacementPolicy: enumeration(["empty-only", "replace-explicit"], "Protect an existing gameplay program unless replacement is explicit on a variation."),
      },
      required: ["minimumDecisionDepth", "maximumDecisionDepth", "minimumBranchPages", "maximumBranchPages", "cyclePolicy", "maximumChoicesPerPage", "replacementPolicy"],
      additionalProperties: false,
    },
    search: {
      type: "object",
      properties: { maxCandidates: integer("Maximum descriptor-distinct candidates.", { minimum: 2, maximum: 9 }) },
      required: ["maxCandidates"],
      additionalProperties: false,
    },
  },
  required: ["schemaVersion", "status", "intent", "families", "constraints", "search"],
  additionalProperties: false,
};

define(["suggest_structural_scaffold_contract"], schema({
  families: array(enumeration(["quest-network", "economy-loop", "encounter-progression"], "Supported scaffold family."), "Optional exact family subset.", { minItems: 1, maxItems: 3, uniqueItems: true }),
  maxCandidates: integer("Maximum descriptor-distinct candidates in the suggested bounded search.", { minimum: 2, maximum: 9 }),
  allowReplacement: boolean("Explicitly prepare a replace-explicit contract; use only on a protected variation."),
}));
define(["set_structural_scaffold_contract"], schema({ contract: structuralScaffoldContractInput }, ["contract"]));
define(["run_structural_scaffold_search"], schema({ contract: structuralScaffoldContractInput }, ["expectedSourceDigest"]));
define(["materialize_structural_scaffold"], schema({
  contract: structuralScaffoldContractInput,
  candidateId: string("Exact candidate ID returned by the source-bound search.", { minLength: 1, maxLength: 120, pattern: "^[a-z0-9][a-z0-9-]*$" }),
  expectedCandidateDigest: string("Exact SHA-256 candidate digest returned by the source-bound search.", { pattern: "^sha256:[a-f0-9]{64}$" }),
  slotValues: object("Exact non-empty content strings keyed by every selected candidate content-slot ID; unknown or missing slots fail closed."),
}, ["expectedSourceDigest", "candidateId", "expectedCandidateDigest", "slotValues"]));

const spatialLayoutContractInput = {
  type: "object",
  description: "Strict bounded map-scoped 2D/2.5D spatial layout contract.",
  properties: {
    schemaVersion: { type: "string", const: "looplab-spatial-layout-contract/v1" },
    status: enumeration(["draft", "approved"], "Authored contract lifecycle."),
    intent: string("Bounded spatial design intent.", { minLength: 1, maxLength: 600 }),
    mapId: string("Exact authored target map ID.", { pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$", maxLength: 160 }),
    families: array(enumeration(["sideview-route", "topdown-route", "dimetric-layered-route"], "Projection-compatible spatial family."), "Exactly one target-map-compatible family.", { minItems: 1, maxItems: 1, uniqueItems: true }),
    pinnedObjectIds: array(string("Stable authored object ID preserved exactly in every candidate.", { pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$", maxLength: 160 }), "Exact pinned landmark, portal, or locked object IDs.", { maxItems: 64, uniqueItems: true }),
    constraints: {
      type: "object",
      properties: {
        minimumRouteBeats: integer("Minimum primary-route control points.", { minimum: 2, maximum: 12 }),
        maximumRouteBeats: integer("Maximum primary-route control points.", { minimum: 2, maximum: 12 }),
        minimumBranches: integer("Minimum authored route branches.", { minimum: 0, maximum: 4 }),
        maximumBranches: integer("Maximum authored route branches.", { minimum: 0, maximum: 4 }),
        cyclePolicy: enumeration(["allow", "forbid", "required"], "Whether a route cycle is allowed, forbidden, or required."),
        elevationPolicy: enumeration(["ground-only", "allow", "required"], "Whether explicit world-z route layers are forbidden, allowed, or required."),
        minimumClearance: integer("Minimum authored route clearance in world units.", { minimum: 16, maximum: 128 }),
        replacementPolicy: enumeration(["preserve-existing", "replace-explicit"], "Protect existing map geometry unless replacement is explicit on a variation."),
      },
      required: ["minimumRouteBeats", "maximumRouteBeats", "minimumBranches", "maximumBranches", "cyclePolicy", "elevationPolicy", "minimumClearance", "replacementPolicy"],
      additionalProperties: false,
    },
    search: {
      type: "object",
      properties: {
        maxCandidates: integer("Maximum descriptor-distinct candidates.", { minimum: 2, maximum: 6 }),
        descriptorAxes: array(enumeration(["topology", "route-beats", "branches", "elevation-layers", "density"], "Deterministic descriptor axis."), "Two through four axes defining the bounded quality-diversity archive.", { minItems: 2, maxItems: 4, uniqueItems: true }),
      },
      required: ["maxCandidates", "descriptorAxes"],
      additionalProperties: false,
    },
  },
  required: ["schemaVersion", "status", "intent", "mapId", "families", "pinnedObjectIds", "constraints", "search"],
  additionalProperties: false,
};

define(["suggest_spatial_layout_contract"], schema({
  mapId: string("Exact target map ID. Defaults to the active map.", { pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$", maxLength: 160 }),
  maxCandidates: integer("Maximum descriptor-distinct candidates in the suggested bounded search.", { minimum: 2, maximum: 6 }),
  allowReplacement: boolean("Explicitly prepare replace-explicit geometry; use only on a protected variation."),
}));
define(["set_spatial_layout_contract"], schema({ contract: spatialLayoutContractInput }, ["contract"]));
define(["run_spatial_layout_search"], schema({ contract: spatialLayoutContractInput }, ["expectedSourceDigest"]));
define(["materialize_spatial_layout"], schema({
  contract: spatialLayoutContractInput,
  candidateId: string("Exact candidate ID returned by the source-bound search.", { minLength: 1, maxLength: 120, pattern: "^[a-z0-9][a-z0-9-]*$" }),
  expectedCandidateDigest: string("Exact SHA-256 candidate digest returned by the source-bound search.", { pattern: "^sha256:[a-f0-9]{64}$" }),
}, ["expectedSourceDigest", "candidateId", "expectedCandidateDigest"]));

define(["get_work_ledger"], schema({
  query: string("Bounded text filter across work-item identity, summary, scope, and blockers.", { maxLength: 240 }),
  status: enumeration(["open", "in-progress", "blocked", "landed", "rejected", "all"], "Exact work-item lifecycle filter."),
  kind: enumeration(["bug", "feature", "research", "documentation", "coordination", "all"], "Exact work-item kind filter."),
  owner: string("Exact current claim holder.", { maxLength: 64 }),
  limit: integer("Maximum compact work items.", { minimum: 1, maximum: 100 }),
  includeEvents: boolean("Include the bounded recent event timeline."),
  eventLimit: integer("Maximum recent events.", { minimum: 0, maximum: 50 }),
}));
define(["get_agent_presence"], schema({
  projectId: string("Optional stable project-library ID filter.", { minLength: 1, maxLength: 160, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$" }),
}));
define(["register_agent_presence"], schema({
  presenceId: string("Stable presence ID to renew across heartbeats.", { minLength: 1, maxLength: 96, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$" }),
  leaseToken: string("Opaque token returned by the prior registration for this presence ID.", { minLength: 1, maxLength: 200 }),
  clientKind: enumeration(["codex", "claude", "human", "automation", "other"], "Visible caller kind."),
  displayName: string("Short visible caller label.", { minLength: 1, maxLength: 64 }),
  status: enumeration(["active", "idle", "reviewing", "blocked"], "Current bounded liveness state."),
  projectId: string("Optional stable project-library ID.", { minLength: 1, maxLength: 160, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$" }),
  sourceDigest: string("Optional exact source digest being inspected.", { pattern: "^(?:sha256:|source-)[a-f0-9]{32,128}$" }),
  operation: string("Short current operation; never include prompts, paths, or secrets.", { maxLength: 200 }),
  workItemIds: array(string("Shared work-item ID.", { minLength: 1, maxLength: 96, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$" }), "Bounded shared work-item IDs currently being handled.", { maxItems: 12, uniqueItems: true }),
  ttlSeconds: integer("Requested server-bounded heartbeat lease in seconds.", { minimum: 15, maximum: 120 }),
}, ["clientKind", "displayName"]));
define(["leave_agent_presence"], schema({
  presenceId: string("Exact presence ID to release.", { minLength: 1, maxLength: 96, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$" }),
  leaseToken: string("Opaque token returned by registration; the live bridge may supply its cached token.", { minLength: 1, maxLength: 200 }),
}, ["presenceId"]));
define(["get_agent_changes"], schema({
  cursor: string("Opaque bookmark returned by an earlier get_agent_changes response. Do not parse or modify it.", { minLength: 1, maxLength: 160 }),
  limit: integer("Maximum compact semantic events returned in this page.", { minimum: 1, maximum: 64 }),
}));
define(["add_work_item"], schema({
  actor: string("Stable human or agent identity creating the work item.", { minLength: 1, maxLength: 64 }),
  item: workItemInput,
}, ["actor", "item", "expectedLedgerDigest"]));
define(["claim_work_item"], schema({
  id: string("Stable work-item ID.", { minLength: 1, maxLength: 96 }),
  actor: string("Stable claiming agent or human identity.", { minLength: 1, maxLength: 64 }),
  leaseSeconds: integer("Renewable claim duration in seconds.", { minimum: 300, maximum: 86400 }),
  takeover: boolean("Explicitly take over another actor's still-active claim."),
  takeoverReason: string("Required explanation for an active claim takeover.", { maxLength: 400 }),
}, ["id", "actor", "expectedLedgerDigest"]));
define(["update_work_item"], schema({
  id: string("Stable work-item ID.", { minLength: 1, maxLength: 96 }),
  actor: string("Stable agent or human identity performing the update.", { minLength: 1, maxLength: 64 }),
  changes: workItemChanges,
  overrideReason: string("Required explanation when updating work actively claimed by another actor.", { maxLength: 400 }),
}, ["id", "actor", "changes", "expectedLedgerDigest"]));
define(["release_work_item"], schema({
  id: string("Stable work-item ID.", { minLength: 1, maxLength: 96 }),
  actor: string("Stable releasing agent or human identity.", { minLength: 1, maxLength: 64 }),
  overrideReason: string("Required explanation when releasing another actor's active claim.", { maxLength: 400 }),
}, ["id", "actor", "expectedLedgerDigest"]));

define(["preview_command_macro"], schema({
  macroId: string("Built-in command macro ID.", { minLength: 1 }),
  parameters: object("Strict parameters validated against the selected macro's published schema."),
  invocationId: string("Optional caller correlation ID.", { minLength: 1, maxLength: 128 }),
  detail: enumeration(["summary", "full"], "Operation-result detail. Summary is the compact default; full retains raw canonical command results."),
}, ["macroId", "parameters"]));
define(["apply_command_macro"], schema({
  macroId: string("Built-in command macro ID.", { minLength: 1 }),
  parameters: object("The same parameters used for preview_command_macro."),
  expectedExpansionDigest: string("Exact SHA-256 expansion digest returned by preview_command_macro.", { pattern: "^sha256:[a-fA-F0-9]{64}$" }),
  invocationId: string("Optional caller correlation ID.", { minLength: 1, maxLength: 128 }),
  detail: enumeration(["summary", "full"], "Operation-result detail. Summary is the compact default; full retains raw canonical command results."),
}, ["macroId", "parameters", "expectedSourceDigest", "expectedExpansionDigest"]));

const batchCommand = {
  type: "object",
  description: "One canonical core project mutation without transport-envelope fields.",
  properties: { op: string("Canonical LoopLab core mutation operation.", { minLength: 1 }) },
  required: ["op"],
  additionalProperties: true,
};
define(["preview_batch"], schema({
  commands: array(batchCommand, "Exact ordered project-mutation batch to execute against a clone.", { minItems: 1, maxItems: 64 }),
  summary: string("Short coherent-pass summary included in the review digest.", { minLength: 1, maxLength: 1200 }),
  profile: enumeration(["prototype", "production"], "Active Project Doctor profile for the preview; production is always evaluated too."),
  detail: enumeration(["summary", "full"], "Per-command result detail. Summary is the compact default."),
}, ["commands", "summary", "expectedSourceDigest"]));
define(["apply_previewed_batch"], schema({
  commands: array(batchCommand, "The exact ordered commands reviewed by preview_batch.", { minItems: 1, maxItems: 64 }),
  summary: string("The exact coherent-pass summary reviewed by preview_batch.", { minLength: 1, maxLength: 1200 }),
  profile: enumeration(["prototype", "production"], "The exact Project Doctor profile used by preview_batch."),
  detail: enumeration(["summary", "full"], "Per-command result detail. Summary is the compact default."),
  expectedPreviewDigest: string("Exact SHA-256 preview digest returned by preview_batch.", { pattern: "^sha256:[a-fA-F0-9]{64}$" }),
}, ["commands", "summary", "expectedSourceDigest", "expectedPreviewDigest"]));

const mechanicalRepairProperties = {
  apply: boolean("Commit the exact dry-run plan. Defaults to false; true requires the matching plan digest."),
  profile: enumeration(["prototype", "production"], "Active Project Doctor profile; production is always evaluated too."),
  findingCodes: array(string("Exact Project Doctor finding code.", { minLength: 1, maxLength: 120 }), "Optional allowlist of finding codes eligible for this run.", { maxItems: 32, uniqueItems: true }),
  maxRepairs: integer("Maximum deterministic target repairs per pass.", { minimum: 1, maximum: 24 }),
};
define(["auto_repair"], schema({
  ...mechanicalRepairProperties,
  expectedRepairDigest: string("Exact SHA-256 repair digest returned by the dry-run preview; required only when apply is true.", { pattern: "^sha256:[a-fA-F0-9]{64}$" }),
}, ["expectedSourceDigest"]));
define(["converge"], schema({
  ...mechanicalRepairProperties,
  maxPasses: integer("Maximum analyze/repair/validate passes.", { minimum: 1, maximum: 6 }),
  expectedConvergenceDigest: string("Exact SHA-256 convergence digest returned by the dry-run preview; required only when apply is true.", { pattern: "^sha256:[a-fA-F0-9]{64}$" }),
}, ["expectedSourceDigest"]));

define(["doctor", "get_doctor", "get_completion_report"], schema({ profile: enumeration(["prototype", "production"], "Project Doctor profile.") }));
define(["run_bot_cohorts"], schema({
  tickRate: integer("Canonical fixed simulation tick rate; only 60 is accepted.", { minimum: 60, maximum: 60 }),
  ticksPerRun: integer("Maximum ticks for each ordinary cohort run.", { minimum: 60, maximum: 3600 }),
  idleTicks: integer("Ticks used for each idle observation.", { minimum: 30, maximum: 3600 }),
  actionHoldTicks: integer("Ticks used for continuous actions in a sweep.", { minimum: 1, maximum: 600 }),
  decisionTicks: integer("Ticks between deterministic explorer decisions.", { minimum: 5, maximum: 300 }),
  spatialCellSize: integer("World-unit cell size for descriptive route coverage.", { minimum: 8, maximum: 256 }),
  maxRuns: integer("Hard cohort-run ceiling.", { minimum: 4, maximum: 32 }),
  seeds: array(integer("Unsigned deterministic explorer seed.", { minimum: 0, maximum: 4294967295 }), "Explicit deterministic explorer seeds.", { maxItems: 8, uniqueItems: true }),
  mapIds: array(string("Authored map ID.", { minLength: 1 }), "Maps eligible for isolated probes; natural-route coverage always starts from the authored start map.", { maxItems: 6, uniqueItems: true }),
  includeCompletionWitness: boolean("Include a bounded known completion witness when one is available."),
}, ["expectedSourceDigest"]));
define(["get_privacy_report"], schema({ profile: enumeration(["prototype", "production"], "Project Doctor profile used to describe whether review findings block this workflow.") }));
define(["run_acceptance_suite"], schema({ testId: string("Acceptance test ID."), id: string("Alias for testId.") }));
define(["run_replay_suite"], schema({ caseId: string("Replay fixture ID.") }));
const simulationInputTransition = {
  type: "object",
  description: "One zero-based deterministic semantic input transition.",
  properties: {
    tick: integer("Zero-based tick before which the transition is applied.", { minimum: 0, maximum: 35_999 }),
    pressed: boolean("True presses or holds the semantic action; false releases it."),
    action: string("Semantic action ID or canonical movement alias.", { minLength: 1, maxLength: 120 }),
    actionId: string("Alias for action.", { minLength: 1, maxLength: 120 }),
    code: string("Explicit runtime input code.", { minLength: 1, maxLength: 120 }),
  },
  required: ["tick", "pressed"],
  anyOf: [{ required: ["action"] }, { required: ["actionId"] }, { required: ["code"] }],
  additionalProperties: false,
};
define(["simulate"], schema({
  tickCount: integer("Bounded number of deterministic simulation ticks.", { minimum: 1, maximum: 36_000 }),
  tickRate: integer("Fixed simulation tick rate; defaults to 60.", { minimum: 20, maximum: 240 }),
  startMapId: string("Optional exact starting map ID.", { minLength: 1, maxLength: 240 }),
  startSpawnId: string("Optional exact starting spawn ID; requires startMapId.", { minLength: 1, maxLength: 240 }),
  inputs: array(simulationInputTransition, "Ordered input tape with at most 4,096 transitions.", { maxItems: 4_096 }),
  emit: array(enumeration(["state", "events", "positions"], "Requested bounded output channel."), "Selective output channels; defaults to final state only.", { minItems: 1, maxItems: 3, uniqueItems: true }),
  sampleEvery: integer("Requested position-sampling stride. LoopLab raises it when needed to honor maximumPositionSamples.", { minimum: 1, maximum: 36_000 }),
  maximumPositionSamples: integer("Hard response budget for player-position samples.", { minimum: 2, maximum: 256 }),
  includeFixtureCandidate: boolean("Include an ordinary replay-case candidate. It remains non-evidence until explicitly recorded and rerun."),
}, ["tickCount"]));
define(["remove_replay_case"], schema({ id: string("Replay fixture ID."), caseId: string("Alias for the replay fixture ID."), changeReason: string("Explicit reason for removing a pinned regression fixture.", { minLength: 1, maxLength: 1200 }) }, ["changeReason"], { anyOf: [{ required: ["id"] }, { required: ["caseId"] }] }));
define(["record_replay_case"], schema({
  id: string("Stable replay fixture ID.", { minLength: 1 }),
  name: string("Human-readable replay name."),
  tickRate: integer("Fixed simulation tick rate.", { minimum: 1, maximum: 240 }),
  tickCount: integer("Bounded number of simulation ticks.", { minimum: 1 }),
  seed: integer("Deterministic seed."),
  inputs: array(object("Semantic input transition."), "Tick-indexed semantic input transitions."),
  checkpointInterval: integer("Checkpoint spacing in ticks.", { minimum: 1 }),
  revision: integer("Monotonically increasing fixture revision.", { minimum: 1 }),
  changeReason: string("Required reason when replacing an existing fixture."),
  startMapId: string("Optional exact starting map ID."),
  startSpawnId: string("Optional exact starting spawn ID."),
}, ["id", "tickCount"], { additionalProperties: true }));

define(["set_feature_contracts"], schema({ contracts: array(object("Feature contract."), "Complete replacement feature-contract collection."), featureContracts: array(object("Feature contract."), "Alias for contracts.") }, [], { anyOf: [{ required: ["contracts"] }, { required: ["featureContracts"] }] }));
define(["upsert_feature_contract"], schema({ contract: object("Feature contract with stable ID.") }, ["contract"]));
define(["remove_feature_contract"], idOnly("feature contract ID"));
define(["set_acceptance_tests"], schema({ tests: array(object("Acceptance test."), "Complete replacement acceptance-test collection."), acceptanceTests: array(object("Acceptance test."), "Alias for tests.") }, [], { anyOf: [{ required: ["tests"] }, { required: ["acceptanceTests"] }] }));
define(["upsert_acceptance_test"], schema({ test: object("Executable or specified acceptance test."), acceptanceTest: object("Alias for test.") }, [], { anyOf: [{ required: ["test"] }, { required: ["acceptanceTest"] }] }));
define(["remove_acceptance_test"], idOnly("acceptance test ID"));
define(["set_project"], schema({ changes: object("Allowlisted project fields to update atomically.") }, ["changes"]));
define(["set_runtime_profile"], schema({
  framework: enumeration(["canvas", "phaser", "pixi", "melon"], "The single primary 2D runtime adapter. Any selected engine is pinned, embedded, and remains presentation-only."),
  reason: string("Concise evidence-backed reason for the runtime decision."),
}, ["framework"]));
define(["set_export_profile"], schema({
  profile: enumeration(["strict", "hosted"], "Strict forbids persistent storage. Hosted permits one exact audited wrapper while retaining portable save codes."),
  portableSaves: boolean("Enable player-controlled portable save codes. Hosted always enables this fallback."),
  autoSave: boolean("For hosted exports, persist the portable code after canonical progress events."),
  restoreOnBoot: boolean("For hosted exports, attempt to restore the same portable code at startup."),
}, ["profile", "expectedSourceDigest"]));
define(["replace_project"], schema({ project: object("Complete valid LoopLab project.") }, ["project"]));

define(["add_object"], schema({ kind: string("LoopLab object kind."), object: object("Authored object properties with a stable ID.") }, [], { additionalProperties: false, anyOf: [{ required: ["kind"] }, { required: ["object"] }] }));
define(["get_motion_body_report"], schema({ profile: enumeration(["prototype", "production"], "Evidence severity profile.") }));
define(["suggest_motion_body"], schema({
  id: string("Exact object ID."),
  name: string("Exact object name selector."),
  mapId: string("Same-map authored map ID."),
  pathId: string("Optional exact authored traversal path ID."),
  driver: enumeration(["input", "automatic"], "Held semantic input or autonomous fixed-tick motion."),
  actionId: string("Replay-enabled semantic action for input-driven motion."),
  initialDirection: enumeration(["forward", "reverse"], "Initial signed path direction."),
  endBehavior: enumeration(["stop", "loop", "ping-pong"], "Authored endpoint behavior."),
  maxSpeed: number("Maximum authored-path speed per second.", { exclusiveMinimum: 0, maximum: 4096 }),
  acceleration: number("Acceleration while active.", { minimum: 0, maximum: 100000 }),
  deceleration: number("Deceleration while stopping.", { minimum: 0, maximum: 100000 }),
  riderMode: enumeration(["block", "carry-player"], "Explicit player rider policy."),
  carryTolerance: number("Ground-contact tolerance for a player rider.", { minimum: 0, maximum: 32 }),
  crushResponse: enumeration(["stop", "respawn"], "Blocked-carry response."),
  acceptanceTestId: string("Linked executable acceptance test ID."),
}, [], { anyOf: [{ required: ["id"] }, { required: ["name"] }] }));
define(["set_motion_body"], schema({
  id: string("Object ID."), name: string("Object name selector."), body: motionBodyInput, motionBody: motionBodyInput,
}, [], { anyOf: [{ required: ["id", "body"] }, { required: ["name", "body"] }, { required: ["id", "motionBody"] }, { required: ["name", "motionBody"] }] }));
define(["remove_motion_body"], schema({
  id: string("Object ID."), name: string("Object name selector."),
}, [], { anyOf: [{ required: ["id"] }, { required: ["name"] }] }));
define(["update_object"], schema({ id: string("Object ID."), name: string("Object name selector."), changes: objectUpdateChanges }, ["changes"], { anyOf: [{ required: ["id"] }, { required: ["name"] }] }));
define(["inspect_supports", "remove_object"], () => idOrName("object"));
define(["attach_to_support"], schema({
  id: string("Object ID."), name: string("Object name selector."), mode: enumeration(["auto", "floor", "surface", "free"], "Support attachment mode."),
  surfaceId: string("Explicit support surface ID."), offset: number("Vertical support offset."), tolerance: number("Snap tolerance.", { minimum: 0 }),
}, [], { anyOf: [{ required: ["id"] }, { required: ["name"] }] }));
define(["duplicate_object"], schema({ id: string("Object ID."), name: string("Object name selector."), newId: string("Stable ID for the copy."), newName: string("Name for the copy."), offsetX: number("Horizontal offset."), offsetY: number("Vertical offset.") }, [], { anyOf: [{ required: ["id"] }, { required: ["name"] }] }));
define(["clear_objects"], schema({ kind: string("Optional object kind; omit to clear every object.") }));
define(["reorder_object"], schema({ id: string("Object ID."), name: string("Object name selector."), position: enumeration(["front", "back"], "New render-list position.") }, ["position"], { anyOf: [{ required: ["id"] }, { required: ["name"] }] }));

define(["set_map_projection"], schema({ projection: object("Projection settings."), type: enumeration(["orthographic", "dimetric-2:1"], "Projection type."), preserveControlMode: boolean("Do not switch dimetric maps to top-down control automatically.") }));
define(["add_navigation_layer"], schema({ layer: object("Navigation layer."), id: string("Layer ID."), name: string("Layer name."), color: string("Editor color."), zMin: number("Minimum world z."), zMax: number("Maximum world z.") }, [], { additionalProperties: true }));
define(["update_navigation_layer"], idAndChanges("navigation layer"));
define(["remove_navigation_layer"], schema({ id: string("Navigation layer ID.", { minLength: 1 }), reassignTo: string("Another layer ID for dependent authored data.") }, ["id"]));
define(["add_navigation_node"], schema({ node: object("Navigation node."), id: string("Node ID."), x: number("World x."), y: number("World y."), z: number("World z."), layerId: string("Navigation layer ID."), destinationId: string("Optional stable destination ID."), tags: array(string(), "Node tags.") }, [], { additionalProperties: true }));
define(["update_navigation_node"], idAndChanges("navigation node"));
define(["remove_navigation_node"], idOnly("navigation node ID"));
define(["connect_navigation_nodes"], schema({ a: string("First node ID.", { minLength: 1 }), b: string("Second node ID.", { minLength: 1 }), link: object("Navigation link overrides."), id: string("Stable link ID."), layerId: string("Layer ID."), cost: number("Traversal cost multiplier.", { exclusiveMinimum: 0 }), oneWay: boolean("Restrict traversal to a→b.") }, ["a", "b"], { additionalProperties: true }));
define(["update_navigation_link"], idAndChanges("navigation link"));
define(["remove_navigation_link"], idOnly("navigation link ID"));
define(["add_navigation_area"], schema({ area: object("Walkable or blocked polygon area."), id: string("Area ID."), kind: enumeration(["walkable", "blocked"], "Area kind."), layerId: string("Layer ID."), points: array(object("World point."), "Polygon points.", { minItems: 3 }) }, [], { additionalProperties: true }));
define(["update_navigation_area"], idAndChanges("navigation area"));
define(["remove_navigation_area"], idOnly("navigation area ID"));
define(["test_navigation_route"], schema({ startId: string("Start node ID."), goalId: string("Goal node ID."), start: object("Ad-hoc world start point."), goal: object("Ad-hoc world goal point."), layerId: string("Optional navigation layer ID.") }, [], { additionalProperties: true }));
define(["import_path_editor_navigation"], schema({ data: object("Path Editor v2 document with optional LoopLab rich-route extension.") }, ["data"]));

define(["get_authored_route_document", "export_authored_route_document", "remove_authored_route_document"], schema({ id: string("Authored route document ID.") }));
define(["set_authored_route_document"], schema({ data: object("Lossless authored route document."), document: object("Alias for data.") }, [], { anyOf: [{ required: ["data"] }, { required: ["document"] }] }));
define(["update_authored_route_actor"], schema({ actorId: string("Actor ID.", { minLength: 1 }), changes: object("Actor fields to update.") }, ["actorId", "changes"]));
define(["update_authored_route_step"], schema({ actorId: string("Actor ID.", { minLength: 1 }), stepIndex: integer("Zero-based route step index.", { minimum: 0 }), changes: object("Route step fields to update.") }, ["actorId", "stepIndex", "changes"]));
define(["update_authored_route_meeting"], schema({ meetingId: string("Meeting ID.", { minLength: 1 }), changes: object("Meeting fields to update.") }, ["meetingId", "changes"]));
define(["verify_authored_route_document"], schema({ currentDigest: string("Exact current canonical route digest.", { minLength: 1 }), kind: string("Evidence kind."), hashes: object("Measured evidence hashes."), simVersion: string("Simulation version when evidence changes."), versionLog: array(object("Version-log entry."), "Evidence version log.") }, ["currentDigest", "kind", "hashes"], { additionalProperties: true }));

define(["add_traversal_path"], schema({ path: object("Authored traversal path."), id: string("Path ID."), name: string("Path name."), kind: string("Traversal kind."), points: array(object("World control point."), "Control points.", { minItems: 2 }) }, [], { additionalProperties: true }));
define(["update_traversal_path"], idAndChanges("traversal path"));
define(["remove_traversal_path"], idOnly("traversal path ID"));
define(["add_asset"], schema({ asset: object("Embedded visual/audio asset metadata and data URL.") }, ["asset"]));
define(["update_asset"], idAndChanges("asset"));
define(["remove_asset"], idOnly("asset ID"));

define(["add_map"], schema({ id: string("Map ID."), name: string("Map name."), map: object("Optional complete map record."), activate: boolean("Make the new map active.") }, [], { additionalProperties: true }));
define(["add_dimetric_map"], schema({ id: string("Map ID."), name: string("Map name."), map: object("Optional complete map record."), activate: boolean("Make the new map active.") }, [], { additionalProperties: true }));
define(["set_start_map", "switch_map", "remove_map"], idOnly("map ID"));
define(["reorder_map"], schema({ id: string("Map ID.", { minLength: 1 }), direction: enumeration(["up", "down", "first", "last"], "Map-order movement.") }, ["id", "direction"]));
define(["connect_maps"], schema({ sourceMapId: string("Source map ID.", { minLength: 1 }), targetMapId: string("Target map ID.", { minLength: 1 }), targetSpawnId: string("Exact destination spawn ID."), portalId: string("Stable source portal ID."), transition: string("Transition presentation."), connectionRole: string("Route role."), reuseForwardExit: boolean("Reuse a compatible forward exit."), runtimeJoin: object("Runtime join evidence contract.") }, ["sourceMapId", "targetMapId"], { additionalProperties: true }));
define(["update_map"], idAndChanges("map"));

define(["add_reference", "find_reference"], schema({ id: string("Reference ID."), label: string("Human-readable label."), signature: object("Visual/spatial reference signature."), image: string("Optional image data URL or source."), x: number("World x."), y: number("World y."), width: number("Reference width."), height: number("Reference height.") }, [], { additionalProperties: true }));
define(["remove_reference"], idOnly("reference ID"));

define(["begin_iteration", "create_variation"], schema({ id: string("Stable iteration ID."), name: string("Variation name."), parentId: string("Parent iteration ID."), objective: string("Candidate objective."), track: string("Workstream track."), condition: string("Loop condition."), buildId: string("Build ID.") }, [], { additionalProperties: true }));
define(["verify_iteration"], noArgs());
define(["promote_iteration"], noArgs());
define(["checkpoint_iteration", "record_iteration_attempt"], schema({ id: string("Iteration ID."), score: number("Measured score."), scoreKind: string("Score provenance."), summary: string("Outcome summary."), status: string("Attempt status."), sourceDigest: string("Source digest."), qualityDelta: number("Measured quality delta."), evaluation: object("Compact profile, dimension vector, hard-gate, and judgment-boundary receipt."), comparison: object("Compact before/after dimension and hard-gate comparison receipt."), providerParity: object("Digest-bound proof that Codex and Claude used the same canonical loop semantics."), usage: object("Provider usage receipt."), evidenceRefs: array(object("Verification evidence."), "Evidence references.") }, [], { additionalProperties: true }));
define(["compare_iterations"], schema({ ids: array(string("Iteration ID."), "Exactly two iteration IDs.", { minItems: 2, maxItems: 2 }), maximumStructuralChanges: integer("Maximum stable-ID structural change details returned; aggregate counts remain complete.", { minimum: 32, maximum: 4096 }) }, ["ids"]));
define(["restore_iteration"], schema({ id: string("Historical iteration ID.", { minLength: 1 }), restoreAsId: string("Stable ID for the editable restored child.") }, ["id"]));

define(["set_gameplay_program"], schema({ program: object("Deterministic gameplay program.") }, ["program"]));
define(["get_combat_report"], schema({ profile: enumeration(["prototype", "production"], "Evidence severity profile.") }));
define(["suggest_combat_program"], schema({ mapId: combatStableId, actionId: combatStableId, maxTargets: integer("Maximum target-like authored objects included in the starter.", { minimum: 0, maximum: 127 }) }));
define(["set_combat_program"], schema({ program: combatProgramInput, profile: enumeration(["prototype", "production"], "Evidence severity profile.") }, ["program"]));
define(["get_actor_report"], schema({ profile: enumeration(["prototype", "production"], "Evidence severity profile.") }));
define(["suggest_actor_program"], schema({ mapId: combatStableId, objectIds: array(combatStableId, "Explicit authored objects to consider.", { maxItems: 128, uniqueItems: true }), maxActors: integer("Maximum actor starters.", { minimum: 0, maximum: 128 }) }));
define(["set_actor_program"], schema({ program: actorProgramInput, profile: enumeration(["prototype", "production"], "Evidence severity profile.") }, ["program"]));
define(["get_collision_geometry", "remove_collision_geometry"], schema({ mapId: combatStableId }));
define(["get_collision_geometry_report"], schema({ mapId: combatStableId, profile: enumeration(["prototype", "production"], "Evidence severity profile.") }));
define(["suggest_collision_geometry"], schema({ mapId: combatStableId, objectIds: array(combatStableId, "Explicit authored one-way collider objects to consider.", { maxItems: 128, uniqueItems: true }), tuning: collisionGeometryTuningInput }));
define(["set_collision_geometry"], schema({ mapId: combatStableId, geometry: collisionGeometryInput, profile: enumeration(["prototype", "production"], "Evidence severity profile.") }, ["geometry"]));
define(["get_elevation_transitions", "remove_elevation_transitions"], schema({ mapId: combatStableId }));
define(["get_elevation_transition_report"], schema({ mapId: combatStableId, profile: enumeration(["prototype", "production"], "Evidence severity profile.") }));
define(["suggest_elevation_transitions"], schema({
  mapId: combatStableId,
  navigationLinkId: combatStableId,
  collisionChainId: combatStableId,
  id: combatStableId,
  name: string("Transition name.", { minLength: 1 }),
  kind: enumeration(["ramp", "stairs"], "Suggested transition kind."),
  width: number("Walkable corridor width.", { exclusiveMinimum: 0, maximum: 4096 }),
  entryRadius: number("Endpoint entry radius.", { exclusiveMinimum: 0, maximum: 4096 }),
  entryZTolerance: number("Endpoint height tolerance.", { minimum: 0, maximum: 64 }),
}));
define(["set_elevation_transitions"], schema({ mapId: combatStableId, program: elevationTransitionsInput, profile: enumeration(["prototype", "production"], "Evidence severity profile.") }, ["program"]));
define(["get_tile_program", "get_tile_program_report", "remove_tile_program"], schema({ mapId: combatStableId }));
define(["get_tile_region"], schema({
  mapId: combatStableId,
  layerId: combatStableId,
  collisionLayerId: combatStableId,
  x: integer("Region origin column.", { minimum: 0, maximum: 8191 }),
  y: integer("Region origin row.", { minimum: 0, maximum: 8191 }),
  width: integer("Region width.", { minimum: 1, maximum: 4096 }),
  height: integer("Region height.", { minimum: 1, maximum: 4096 }),
}, ["layerId", "x", "y", "width", "height"]));
define(["suggest_tile_program"], schema({ mapId: combatStableId, assetIds: array(combatStableId, "Explicit authored tileset assets to include.", { maxItems: 64, uniqueItems: true }), variationSeed: integer("Stable deterministic variation seed.", { minimum: 0, maximum: 2147483647 }) }));
define(["set_tile_program"], schema({ mapId: combatStableId, program: tileProgramInput }, ["program"]));
define(["preview_tile_patch"], schema({ patch: tilePatchInput, profile: enumeration(["prototype", "production"], "Doctor profile used for the preview delta.") }, ["patch"]));
define(["apply_tile_patch"], schema({
  patch: tilePatchInput,
  tileProgramDigest: string("Exact current tile-program digest returned by preview_tile_patch.", { pattern: "^sha256:[a-f0-9]{64}$" }),
  patchDigest: string("Exact canonical patch digest returned by preview_tile_patch.", { pattern: "^sha256:[a-f0-9]{64}$" }),
}, ["patch", "tileProgramDigest", "patchDigest"]));
define(["get_narrative_report"], schema({ profile: enumeration(["prototype", "production"], "Doctor severity profile used for the evidence-bound report.") }));
define(["set_narrative_contract"], schema({ contract: object("Source Narrative Contract with stable runtime, beat, line, and ending IDs.") }, ["contract"]));
define(["set_verb_architecture"], schema({ architecture: object("Verb-system v2 graph with purpose-earned actions, relationships, recurring applications, loop/resource structure, runtime IDs, and executable evidence. Version 1 remains readable for existing projects.") }, ["architecture"]));
define(["queue_agent_request"], schema({ prompt: string("Complete provider prompt.", { minLength: 1 }), provider: string("Selected provider."), track: string("Workstream track."), designBrief: object("Directed game brief."), loop: object("Loop strategy and conditions.") }, ["prompt"], { additionalProperties: true }));
define(["set_game_brief", "configure_director"], schema({ userPrompt: string("User's exact free-form game vision and custom constraints."), genre: directorSelection("genres", "Genre selection."), coreLoop: directorSelection("coreLoops", "Core-loop selection."), movementTemplate: directorSelection("movementTemplates", "Movement/system selection."), format: directorSelection("formats", "Camera/map-format selection."), progression: directorSelection("progressions", "Progression selection."), campaignScope: directorSelection("campaignScopes", "Structured map-count selection."), framework: runtimePreference, runtimePreference, artDirectionMode: enumeration(["explore", "preserve", "locked"], "Art-direction constraint mode."), styleLocks: array(string(), "Explicit user-authored style locks.") }, [], { additionalProperties: true }));
define(["retry_prompt"], schema({ draft: object("Provider-generated replacement prompt with provenance."), provider: string("Requested ready provider path."), providerMode: providerRouteMode, attempt: integer("Retry attempt.", { minimum: 1 }), requiredConstraints: array(string(), "Constraints the new prompt must preserve.") }, [], { additionalProperties: true }));
define(["complete_agent_request"], schema({ id: string("Agent request ID.", { minLength: 1 }), status: string("Completion status."), summary: string("Honest outcome summary.") }, ["id"]));

define(["get_preference_memory"], schema({ enabled: boolean("Apply enabled entries when preparing the included context preview."), excludeEntryIds: array(string("Preference entry ID."), "Entries excluded from this preview.", { maxItems: 100, uniqueItems: true }), limit: integer("Maximum context-matched entries in the applied preview.", { minimum: 1, maximum: 12 }) }));
define(["get_applied_preferences"], schema({ context: preferenceContextInput, enabled: boolean("Apply memory for this receipt."), excludeEntryIds: array(preferenceEntryId, "Entries excluded from this run.", { maxItems: 100, uniqueItems: true }), limit: integer("Maximum applied entries.", { minimum: 1, maximum: 12 }) }));
define(["set_preference_memory_enabled"], schema({ enabled: boolean("Global builder-local preference-memory state.") }, ["enabled"]));
define(["add_preference_statement"], schema({ statement: string("Exact user-authored preference statement.", { minLength: 1, maxLength: 600 }), dimensions: preferenceDimensions, context: preferenceContextInput, enabled: boolean("Initial entry state.") }, ["statement", "dimensions"]));
define(["record_candidate_preference"], schema({ preferredCandidateId: string("Preferred iteration ID.", { minLength: 1, maxLength: 200 }), otherCandidateId: string("Compared iteration ID.", { minLength: 1, maxLength: 200 }), rationale: string("Explicit user reason for the choice.", { minLength: 1, maxLength: 600 }), dimensions: preferenceDimensions, context: preferenceContextInput, enabled: boolean("Initial entry state.") }, ["preferredCandidateId", "otherCandidateId", "rationale", "dimensions"]));
define(["update_preference_entry"], schema({ id: preferenceEntryId, changes: { type: "object", description: "Allowlisted preference fields to update.", properties: { statement: string("Updated explicit statement.", { minLength: 1, maxLength: 600 }), rationale: string("Updated explicit comparison rationale.", { minLength: 1, maxLength: 600 }), dimensions: preferenceDimensions, context: preferenceContextInput, enabled: boolean("Updated entry state.") }, minProperties: 1, additionalProperties: false } }, ["id", "changes"]));
define(["remove_preference_entry"], idOnly("preference entry ID"));
define(["clear_preference_memory"], noArgs());
define(["import_preference_memory"], schema({ memory: preferenceMemoryInput }, ["memory"]));

define(["get_playtest_sessions"], schema({ id: string("Exact completed session ID.", { pattern: "^[a-z0-9][a-z0-9-]{5,95}$", maxLength: 96 }), includeDetail: boolean("Return the complete bounded session rather than compact summaries.") }));
define(["get_active_playtest_session", "discard_playtest_session", "clear_playtest_sessions"], noArgs());
define(["start_playtest_session"], schema({ consent: boolean("Explicit confirmation that the player consented to this local observation."), reset: boolean("Reset the preview to its authored start before recording; defaults true.") }, ["consent"]));
define(["finish_playtest_session"], schema({
  outcome: playtestOutcome,
  rating: playtestRating,
  tags: array(string("Deliberate feedback tag.", { minLength: 1, maxLength: 48 }), "Explicit feedback tags.", { maxItems: 8, uniqueItems: true }),
  note: string("Optional deliberate player note.", { maxLength: 600 }),
}));
define(["update_playtest_feedback"], schema({
  id: string("Exact completed session ID.", { pattern: "^[a-z0-9][a-z0-9-]{5,95}$", maxLength: 96 }),
  rating: playtestRating,
  tags: array(string("Deliberate feedback tag.", { minLength: 1, maxLength: 48 }), "Explicit feedback tags.", { maxItems: 8, uniqueItems: true }),
  note: string("Optional deliberate player note.", { maxLength: 600 }),
}, ["id"]));
define(["remove_playtest_session"], idOnly("playtest session ID"));
define(["import_playtest_sessions"], schema({ ledger: playtestLedgerInput }, ["ledger"]));
const playtestReplayCommandProperties = {
  session: playtestSessionImport,
  sessionId: string("Browser-local saved session ID. The browser bridge resolves it to the exact digest-validated session before invoking core.", { pattern: "^[a-z0-9][a-z0-9-]{5,95}$", maxLength: 96 }),
  id: string("Stable replay fixture ID; defaults to a session-derived human-run ID.", { minLength: 1, maxLength: 120 }),
  name: string("Human-readable replay name.", { minLength: 1, maxLength: 240 }),
  revision: integer("Explicit higher revision when replacing an existing replay fixture.", { minimum: 1 }),
  changeReason: string("Explicit reason when replacing an existing regression bar.", { minLength: 1, maxLength: 1200 }),
  checkpointInterval: integer("Checkpoint spacing for the promoted fixture.", { minimum: 1, maximum: 36000 }),
};
define(["preview_playtest_replay"], schema(playtestReplayCommandProperties, [], { anyOf: [{ required: ["session"] }, { required: ["sessionId"] }] }));
define(["promote_playtest_replay"], schema({
  ...playtestReplayCommandProperties,
  expectedSessionDigest: string("Exact digest of the reviewed saved playtest session.", { pattern: "^sha256:[a-f0-9]{64}$" }),
  expectedPromotionDigest: string("Exact digest returned by preview_playtest_replay.", { pattern: "^sha256:[a-f0-9]{64}$" }),
}, ["expectedSourceDigest", "expectedSessionDigest", "expectedPromotionDigest"], { anyOf: [{ required: ["session"] }, { required: ["sessionId"] }] }));

define(["load_template"], schema({ template: enumeration(["blank", "platformer", "topdown", "dimetric", "kinetic", "systems"], "Starter template.") }, ["template"]));
define(["select_project"], schema({ id: string("Project-library ID.", { minLength: 1 }) }, ["id"]));
define(["mount_shared_project"], schema({
  id: string("Stable companion-owned shared project ID.", { pattern: "^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$", maxLength: 64 }),
}, ["id"]));
const sharedProjectIdInput = string("Stable companion-owned shared project ID.", { pattern: "^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$", maxLength: 64 });
const sharedProjectRevisionInput = (description) => string(description, { pattern: "^revision-[a-f0-9]{64}$" });
define(["preview_shared_project_rebase"], schema({
  id: sharedProjectIdInput,
  expectedBaseRevisionDigest: sharedProjectRevisionInput("Exact revision mounted as the browser's common ancestor."),
  expectedRemoteRevisionDigest: sharedProjectRevisionInput("Exact current companion revision returned by list_shared_projects."),
}, ["id", "expectedBaseRevisionDigest", "expectedRemoteRevisionDigest"]));
define(["apply_shared_project_rebase"], schema({
  id: sharedProjectIdInput,
  expectedBaseRevisionDigest: sharedProjectRevisionInput("Exact mounted common-ancestor revision used by the preview."),
  expectedLocalRevisionDigest: sharedProjectRevisionInput("Exact local draft revision returned by the preview."),
  expectedRemoteRevisionDigest: sharedProjectRevisionInput("Exact companion revision used by the preview."),
  expectedRebaseDigest: string("Exact source-bound rebase receipt returned by preview_shared_project_rebase.", { pattern: "^sha256:[a-f0-9]{64}$" }),
}, ["id", "expectedBaseRevisionDigest", "expectedLocalRevisionDigest", "expectedRemoteRevisionDigest", "expectedRebaseDigest"]));
define(["save_shared_project"], schema({
  id: string("Stable companion-owned shared project ID.", { pattern: "^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$", maxLength: 64 }),
  expectedRevisionDigest: sharedProjectRevisionInput("Exact current full-document revision returned by list_shared_projects or mount_shared_project."),
  createOnly: boolean("Require this ID to be absent; maps to If-None-Match: *."),
  metadata: {
    type: "object",
    description: "Companion-owned library metadata. It never enters gameplay source, Doctor evidence, provider context, or export.",
    properties: {
      origin: enumeration(["starter", "folder", "file", "variation", "local", "shared"], "Project-library origin."),
      sourceLabel: string("Human-readable source label.", { maxLength: 512 }),
      folderName: { anyOf: [string("Optional imported folder name.", { maxLength: 160 }), { type: "null" }] },
      parentLibraryId: { anyOf: [string("Optional parent shared project ID.", { pattern: "^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$", maxLength: 64 }), { type: "null" }] },
    },
    additionalProperties: false,
  },
}, ["id"], {
  anyOf: [
    { type: "object", required: ["expectedRevisionDigest"] },
    {
      type: "object",
      properties: { createOnly: { type: "boolean", enum: [true] } },
      required: ["createOnly"],
    },
  ],
}));
define(["route_work"], schema({ prompt: string("Work objective.", { minLength: 1 }), goal: string("Alias for prompt."), track: string("Requested workstream."), projectType: string("Project classification."), framework: runtimePreference, runtimePreference, narrativeMode }, [], { additionalProperties: true }));
define(["list_asset_packs"], schema({ category: string("Asset category filter."), query: string("Text search.") }));
define(["select_asset_pack"], schema({ id: string("Installed pack ID.", { minLength: 1 }) }, ["id"]));
define(["list_pack_assets"], schema({ packId: string("Installed pack ID.", { minLength: 1 }), query: string("Text search."), kind: string("Asset-kind filter."), archiveId: string("Archive filter."), limit: integer("Maximum returned assets.", { minimum: 1 }), offset: integer("Result offset.", { minimum: 0 }), includeArchiveOnly: boolean("Include archive-only entries.") }, ["packId"]));
define(["preview_pack_asset"], schema({ packId: string("Installed pack ID.", { minLength: 1 }), assetId: string("Pack asset ID.", { minLength: 1 }) }, ["packId", "assetId"]));
define(["select_pack_assets", "import_pack_assets"], schema({ packId: string("Installed pack ID.", { minLength: 1 }), assetIds: array(string("Pack asset ID."), "Selected asset IDs.", { minItems: 1 }), options: object("Import/frame/placement options.") }, ["packId", "assetIds"], { additionalProperties: true }));
define(["capture_visual_review"], noArgs());
define(["get_visual_review"], schema({
  includeThumbnails: boolean("Include clean PNG data URLs. False by default."),
  includeAnnotatedImages: boolean("Include numbered annotated PNG data URLs. False by default."),
  includeCrops: boolean("Include focused annotation crop data URLs. False by default."),
}));
define(["select_visual_review_capture"], schema({
  id: string("Visual capture ID.", { minLength: 1 }),
  captureId: string("Alias for the visual capture ID.", { minLength: 1 }),
  includeThumbnail: boolean("Include the clean PNG data URL. True by default for backward compatibility."),
  includeAnnotatedImage: boolean("Include the numbered annotated PNG data URL."),
  includeCrops: boolean("Include focused annotation crop data URLs."),
}, [], { anyOf: [{ required: ["id"] }, { required: ["captureId"] }] }));
define(["start_visual_critique"], schema({
  provider: enumeration(["openai", "anthropic", "codex", "claude"], "Ready provider that will receive the exact consented captures."),
  providerMode: providerRouteMode,
  consent: boolean("Explicit confirmation for this one image submission."),
  captureIds: array(string("Exact current visual-review capture ID.", { minLength: 1, maxLength: 200 }), "Optional capture subset; defaults to up to eight current captures.", { minItems: 1, maxItems: 8, uniqueItems: true }),
  captureFirst: boolean("Capture the current map/profile matrix locally before submission when no current review exists."),
}, ["provider", "consent"]));
define(["get_visual_critique_job"], schema({ jobId: string("Durable visual-critique job ID.", { minLength: 1 }), includeResult: boolean("Fetch the completed grounded critique when available.") }, ["jobId"]));
define(["cancel_visual_critique_job"], schema({ jobId: string("Durable visual-critique job ID.", { minLength: 1 }) }, ["jobId"]));
define(["get_visual_critique"], noArgs());
define(["apply_batch"], schema({ commands: array(object("LoopLab agent command without a transport envelope."), "Atomic command batch.", { minItems: 1 }), summary: string("Coherent pass summary."), requestId: string("Pending agent request completed by this batch."), allowNewBlockers: boolean("Must remain false; Project Doctor cannot be bypassed.") }, ["commands", "expectedSourceDigest"]));
define(["start_ai_build"], schema({ provider: primaryProvider, providerMode: providerRouteMode, goal: string("Build goal."), iterations: integer("Bounded iteration count.", { minimum: 1 }), strategy: enumeration(["improve", "explore", "cycle"], "Loop strategy."), conditions: array(string(), "Acceptance conditions."), contextBudgetTokens: integer("Provider-context budget.", { minimum: 8000, maximum: 200000 }), evaluationProfile: loopEvaluationProfile, framework: runtimePreference, runtimePreference, narrativeMode, usePreferenceMemory: boolean("Use context-matched builder-local preferences for this run."), excludePreferenceIds: array(preferenceEntryId, "Explicit per-run exclusions.", { maxItems: 100, uniqueItems: true }), preferenceContext: appliedPreferenceContextInput }, [], { additionalProperties: true }));
define(["start_research"], schema({ provider: primaryProvider, providerMode: providerRouteMode, goal: string("Research goal."), query: string("Research query."), depth: string("Research depth."), preset: string("Research preset."), contextBudgetTokens: integer("Provider-context budget.", { minimum: 8000, maximum: 200000 }) }, [], { additionalProperties: true }));
define(["get_local_copilot_status"], schema({ refresh: boolean("Run a fresh passive loopback model scan instead of using the bounded status cache.") }));
define(["start_local_copilot"], schema({
  task: string("Bounded advisory task for the optional local model.", { minLength: 1, maxLength: 4000 }),
  mode: enumeration(["summarize-context", "critique-plan", "identify-risks", "suggest-next-actions"], "Strict advisory mode."),
  sourceDigest: string("Exact selected-project source digest to bind into the advisory receipt.", { minLength: 1, maxLength: 160 }),
  model: string("Optional exact model ID already reported by local-copilot status.", { minLength: 1, maxLength: 240 }),
  context: object("Optional bounded context adjacent to LoopLab's source-derived project summary. Embedded assets, images, secrets, and exported HTML are rejected or omitted."),
}, ["task"]));
define(["get_local_copilot_job"], schema({ jobId: string("Durable local-copilot job ID.", { minLength: 1 }), includeResult: boolean("Fetch the strict completed advisory result when available.") }, ["jobId"]));
define(["cancel_local_copilot_job"], schema({ jobId: string("Durable local-copilot job ID.", { minLength: 1 }) }, ["jobId"]));
define(["find_visual_reference"], schema({ imageDataUrl: string("Reference screenshot/image data URL."), signature: object("Precomputed reference signature."), label: string("Reference label."), threshold: number("Match threshold.", { minimum: 0, maximum: 1 }) }, [], { additionalProperties: true }));
define(["generate_tiles", "generate_sprite"], schema({ prompt: string("Asset art direction."), kind: string("Asset role/kind."), theme: string("Deterministic tileset theme."), palette: string("Palette name."), size: integer("Frame/tile size.", { minimum: 1 }), seed: integer("Deterministic seed."), x: number("Placement x."), y: number("Placement y."), scale: number("Placement scale.", { exclusiveMinimum: 0 }) }, [], { additionalProperties: true }));
define(["generate_ai_asset"], schema({
  prompt: string("Provider art direction for one complete ordered sheet.", { minLength: 1, maxLength: 12000 }),
  jobId: string("Existing durable provider job ID to resume without resubmission.", { minLength: 1 }),
  wait: boolean("Wait for this exact job; false returns a resumable descriptor."),
  attach: boolean("Attach only locally measured and accepted art to the project."),
  place: boolean("Place one authored object using accepted art; generated pixels never define collision."),
  id: string("Optional stable asset ID after acceptance.", { minLength: 1, maxLength: 160 }),
  name: string("Optional asset display name after acceptance.", { minLength: 1, maxLength: 240 }),
  role: enumeration(["hero", "character", "enemy", "pickup", "prop", "effect", "ui", "tileset", "environment"], "Game-art role used for sheet layout and project visual-identity filtering."),
  kind: enumeration(["hero", "character", "enemy", "pickup", "prop", "effect", "ui", "tileset", "environment"], "Alias for role."),
  identity: string("Stable subject identity hint for frame consistency.", { maxLength: 240 }),
  actions: array(string("Ordered action or tile label.", { minLength: 1, maxLength: 80 }), "Exact row-major sheet actions.", { minItems: 1, maxItems: 8, uniqueItems: true }),
  targetFrameSize: enumeration([16, 32, 48, 64], "Local normalized frame or tile size."),
  quality: enumeration(["low", "medium", "high"], "OpenAI image quality."),
  background: enumeration(["transparent", "light-neutral-gray"], "Transparent source or light-grey review matte."),
  projection: enumeration(["orthographic", "dimetric-2:1"], "Fixed projection for every occupied cell."),
  palette: array(string("Exact six-digit color.", { pattern: "^#[0-9A-Fa-f]{6}$" }), "Optional shared final palette.", { maxItems: 16, uniqueItems: true }),
  model: string("GPT Image model selected for this job.", { pattern: "^gpt-image-[A-Za-z0-9.-]+$", maxLength: 120 }),
  useVisualIdentity: boolean("Inherit the selected project's authored visual identity. True by default; false is an explicit one-job bypass."),
  referenceConsent: boolean("Fresh consent for this one job to upload applicable delivery=image project PNG references. Stored reference selection never grants consent."),
  x: number("Optional authored placement x."), y: number("Optional authored placement y."), scale: number("Optional authored placement scale.", { exclusiveMinimum: 0 }),
}, [], { anyOf: [{ required: ["prompt"] }, { required: ["jobId"] }], additionalProperties: false }));
define(["get_ai_asset_job"], schema({ jobId: string("Durable asset job ID.", { minLength: 1 }), includeResult: boolean("Fetch the completed result."), attach: boolean("Resume with attachment."), place: boolean("Resume with placement.") }, ["jobId"]));
define(["cancel_ai_asset_job"], schema({ jobId: string("Durable asset job ID.", { minLength: 1 }) }, ["jobId"]));
define(["verify_release"], schema({ jobId: string("Existing durable release-verification job ID to resume.", { minLength: 1 }), wait: boolean("Wait for this exact job and apply its source-bound attestation when it passes."), filename: string("Exact HTML subject filename.", { maxLength: 240 }) }, [], { additionalProperties: false }));
define(["get_release_verification_job"], schema({ jobId: string("Durable release-verification job ID.", { minLength: 1 }), includeResult: boolean("Fetch the completed exact-artifact result.") }, ["jobId"]));
define(["cancel_release_verification_job"], schema({ jobId: string("Durable release-verification job ID.", { minLength: 1 }) }, ["jobId"]));
define(["import_html"], schema({ html: string("Complete LoopLab-exported HTML containing embedded project metadata.", { minLength: 1 }) }, ["html"]));
define(["prepare_export", "export_html"], schema({ profile: enumeration(["prototype", "production"], "Export Doctor profile."), fileName: string("Suggested output filename."), includeProject: boolean("Include editable project metadata.") }, [], { additionalProperties: true }));
define(["set_mode"], schema({ mode: enumeration(["edit", "play"], "Editor mode."), focus: boolean("Focus the play surface and hide authoring panels.") }, ["mode"]));
define(["preview_input"], schema({ action: string("Semantic action ID or authored binding.", { minLength: 1 }), pressed: boolean("Pressed/held state.") }, ["action", "pressed"]));
define(["preview_step"], schema({ deltaMs: number("Deterministic elapsed milliseconds.", { exclusiveMinimum: 0, maximum: 1000 }) }));
define(["preview_load_map"], schema({ mapId: string("Map ID.", { minLength: 1 }), spawnId: string("Optional exact spawn ID.") }, ["mapId"]));
define(["select_object"], () => idOrName("object"));
define(["get_project"], schema({
  compact: boolean("Replace embedded payloads and historical/provider bodies with omission receipts."),
  sinceDigest: string("Archived Project Doctor source digest. When present, return a source-projection patch instead of a full project.", { pattern: "^source-[0-9a-f]{64}$" }),
}));
define(["query_project"], schema({
  select: string("Strict selector such as maps[0].objects[kind=portal].", { minLength: 1, maxLength: 512 }),
  pointers: array(string("RFC 6901 JSON Pointer.", { pattern: "^/", maxLength: 512 }), "Exact JSON Pointer reads.", { maxItems: 32, uniqueItems: true }),
  compact: boolean("Defaults true. Set false only when the exact embedded payload is required."),
}));
define(["describe_frame"], schema({
  mapId: string("Optional exact map ID; otherwise the authored active map is described.", { minLength: 1, maxLength: 240 }),
  objectIds: array(string("Optional exact object ID focus.", { minLength: 1, maxLength: 240 }), "Return only matching rendered objects while reporting missing IDs.", { maxItems: 64, uniqueItems: true }),
  maximumEntries: integer("Maximum depth-sorted render entries.", { minimum: 1, maximum: 512 }),
  maximumOverlaps: integer("Maximum screen-bounds overlap receipts.", { minimum: 1, maximum: 256 }),
  maximumHudIntrusions: integer("Maximum HUD safe-area intrusion receipts.", { minimum: 1, maximum: 256 }),
  includeCollision: boolean("Project authored collision footprints into logical screen coordinates alongside visual bounds."),
}));

define(["get_agent_brief"], schema({ profile: enumeration(["prototype", "production"], "Active authoring Doctor profile. The response always includes a separate production release assessment on the same source."), sinceDigest: string("Previously observed Project Doctor source digest."), sinceTimestamp: string("ISO timestamp for bounded iteration-history changes."), maxFindings: integer("Maximum current-profile and release-delta findings in the brief.", { minimum: 1, maximum: 20 }), maxNextActions: integer("Maximum suggested next actions.", { minimum: 1, maximum: 10 }), playbookQuery: string("Optional bounded intent text for deterministic recipe matching.", { maxLength: 240 }), maxRecipes: integer("Maximum relevant recipe references in the brief.", { minimum: 1, maximum: 5 }) }));
define(["draft_agent_plan"], schema({
  intent: string("Short bounded authoring intent to convert into a source-bound, non-executing plan.", { minLength: 1, maxLength: 600 }),
  mapIds: array(string("Exact map ID in the selected project.", { minLength: 1, maxLength: 128 }), "Optional exact map scope.", { maxItems: 8, uniqueItems: true }),
  macroId: string("Optional exact proven-command macro ID.", { pattern: "^[a-z0-9][a-z0-9-]*$", maxLength: 120 }),
  recipeId: string("Optional exact operating-playbook recipe ID.", { pattern: "^[a-z0-9][a-z0-9-]*$", maxLength: 120 }),
  parameters: object("Partial or complete parameters for the selected proven macro. Unknown fields are rejected by that macro's strict schema."),
  profile: enumeration(["prototype", "production"], "Current authoring Doctor profile used to describe readiness."),
  maxMatches: integer("Maximum deterministic recipe candidates considered before selecting a query match.", { minimum: 1, maximum: 5 }),
}, ["intent"]));
define(["get_project_context"], schema({
  view: enumeration(["campaign", "map"], "Strict named context view. campaign is the default; map requires stable mapIds."),
  mapIds: array(string("Stable authored map ID.", { minLength: 1 }), "Exact maps whose sanitized authoring documents should be returned for view=map.", { maxItems: 8, uniqueItems: true }),
  mapLimit: integer("Maximum campaign map-index entries returned.", { minimum: 1, maximum: 64 }),
  profile: enumeration(["prototype", "production"], "Active authoring Doctor profile used for the context summary. Production release readiness is always included separately on the same source."),
}));

const CORE_MUTATING = new Set([
  "add_work_item", "claim_work_item", "update_work_item", "release_work_item",
  "apply_command_macro", "apply_previewed_batch", "auto_repair", "converge",
  "promote_playtest_replay", "record_replay_case", "remove_replay_case", "set_feature_contracts", "upsert_feature_contract", "remove_feature_contract",
  "set_acceptance_tests", "upsert_acceptance_test", "remove_acceptance_test", "set_project", "set_runtime_profile", "set_export_profile", "add_object", "update_object",
  "set_motion_body", "remove_motion_body", "attach_to_support", "remove_object", "duplicate_object", "clear_objects", "reorder_object", "set_map_projection",
  "add_navigation_layer", "update_navigation_layer", "remove_navigation_layer", "add_navigation_node", "update_navigation_node",
  "remove_navigation_node", "connect_navigation_nodes", "update_navigation_link", "remove_navigation_link", "add_navigation_area",
  "update_navigation_area", "remove_navigation_area", "import_path_editor_navigation", "set_authored_route_document",
  "update_authored_route_actor", "update_authored_route_step", "update_authored_route_meeting", "verify_authored_route_document",
  "remove_authored_route_document", "add_traversal_path", "update_traversal_path", "remove_traversal_path", "add_asset",
  "update_asset", "remove_asset", "add_map", "add_dimetric_map", "set_start_map", "reorder_map", "connect_maps", "update_map",
  "switch_map", "remove_map", "add_reference", "find_reference", "remove_reference", "begin_iteration", "create_variation",
  "verify_iteration", "promote_iteration", "checkpoint_iteration", "record_iteration_attempt", "restore_iteration",
  "set_gameplay_program", "remove_gameplay_program", "set_combat_program", "remove_combat_program", "set_actor_program", "remove_actor_program", "set_collision_geometry", "remove_collision_geometry", "set_tile_program", "remove_tile_program", "apply_tile_patch", "set_narrative_contract", "remove_narrative_contract", "set_visual_identity", "remove_visual_identity", "set_presentation_program", "remove_presentation_program", "set_game_shell", "remove_game_shell", "set_tuning_contract", "remove_tuning_contract", "set_structural_scaffold_contract", "remove_structural_scaffold_contract", "set_spatial_layout_contract", "remove_spatial_layout_contract", "set_verb_architecture", "remove_verb_architecture", "queue_agent_request",
  "set_game_brief", "retry_prompt", "complete_agent_request", "replace_project",
]);

const LEDGER_MUTATING = new Set(["add_work_item", "claim_work_item", "update_work_item", "release_work_item"]);

const BROWSER_MUTATING = new Set([
  ...CORE_MUTATING,
  "load_template", "select_project", "mount_shared_project", "apply_shared_project_rebase", "save_shared_project", "select_asset_pack", "select_pack_assets", "import_pack_assets", "capture_visual_review",
  "select_visual_review_capture", "start_visual_critique", "cancel_visual_critique_job", "apply_batch", "configure_director", "start_ai_build", "start_research", "generate_tiles",
  "register_agent_presence", "leave_agent_presence",
  "set_preference_memory_enabled", "add_preference_statement", "record_candidate_preference", "update_preference_entry", "remove_preference_entry", "clear_preference_memory", "import_preference_memory",
  "generate_sprite", "generate_ai_asset", "cancel_ai_asset_job", "import_html", "set_mode", "preview_input", "preview_pause",
  "verify_release", "cancel_release_verification_job", "start_playtest_session", "finish_playtest_session", "discard_playtest_session", "update_playtest_feedback", "remove_playtest_session", "clear_playtest_sessions", "import_playtest_sessions", "start_local_copilot", "cancel_local_copilot_job",
  "preview_resume", "preview_step", "preview_reset", "preview_load_map", "select_object",
]);

const BUILDER_STATE_MUTATING = new Set([
  "set_preference_memory_enabled", "add_preference_statement", "record_candidate_preference", "update_preference_entry",
  "remove_preference_entry", "clear_preference_memory", "import_preference_memory",
  "start_playtest_session", "finish_playtest_session", "discard_playtest_session", "update_playtest_feedback", "remove_playtest_session", "clear_playtest_sessions", "import_playtest_sessions",
  "start_local_copilot", "cancel_local_copilot_job", "start_visual_critique", "cancel_visual_critique_job",
  "register_agent_presence", "leave_agent_presence", "mount_shared_project",
]);

const DESTRUCTIVE = /^(?:remove|clear|replace|import)/;
const OPEN_WORLD = new Set(["start_ai_build", "start_research", "start_visual_critique", "get_visual_critique_job", "cancel_visual_critique_job", "find_visual_reference", "generate_ai_asset", "get_ai_asset_job", "cancel_ai_asset_job"]);

const SPECIAL_DESCRIPTIONS = Object.freeze({
  get_manifest: "Bootstrap the live browser-session contract. The command defaults to a bounded, parseable command index; use /agent-manifest.json or looplab://manifest for complete JSON Schemas, or explicitly request compact=false only on a transport that can safely carry the full document.",
  list_shared_projects: "List compact companion-owned project summaries with separate Doctor source digests and exact strong full-document revision digests, without loading complete project bytes.",
  mount_shared_project: "Read, validate, cache, and select the exact companion-owned shared project while recording its full-document revision as a three-way rebase base.",
  preview_shared_project_rebase: "Read-only three-way preview against exact base, local, and remote revisions. Stable-ID arrays merge independent edits; ordinary arrays are atomic; same-field and delete-versus-edit conflicts never choose a winner.",
  apply_shared_project_rebase: "Apply only an exact conflict-free digest-bound rebase receipt to the browser draft. It never saves automatically; run gates, then save explicitly against the returned remote revision.",
  save_shared_project: "Conditionally persist the exact selected project to the companion-owned store. Updates require the latest strong full-document revision digest; creates use createOnly, and stale writers receive 412 without overwriting bytes.",
  get_agent_brief: "Return a bounded warm-start brief with project summary, current-authoring and production-release Doctor assessments on one source digest, profile-labelled findings, changes since a prior digest/time, pending work, and likely next actions.",
  get_agent_changes: "Resume from an opaque project change bookmark. Returns compact authored, coordination, lifecycle, and metadata receipts, or an explicit resync requirement when the cursor is expired or foreign.",
  draft_agent_plan: "Convert a bounded intent into a deterministic, source-bound, non-executing plan. Multiple independent requirements become explicit coverage plus ordered resumable phases composed from proven macros, operating recipes, and guarded canonical workflows; no requirement may disappear behind the first phrase match. It reports exact contracts, retry/resume boundaries, missing inputs, and reviewable commands without calling a provider or mutating the project.",
  get_project_context: "Return a source-bound, omission-explicit campaign or selected-map context pack with current-authoring and production-release readiness, but without embedded assets, provider prompt bodies, secrets, snapshots, or exported HTML. It is orientation only, never mutation input or verification evidence.",
  get_work_ledger: "Read the compact project-scoped Codex/Claude coordination ledger, its independent SHA-256 digest, expiring claims, lifecycle counts, and attributable recent events. Browser transport omits the complete embedded project by default.",
  get_agent_presence: "Read the companion's ephemeral live Codex/Claude directory. Presence is server-timestamped liveness only, never durable work ownership, project source, provider context, or verification evidence.",
  register_agent_presence: "Register or renew one expiring companion-memory heartbeat with an opaque lease token. Identity conflicts return a structured 409 instead of silently stealing presence.",
  leave_agent_presence: "Explicitly release one live heartbeat using its opaque lease token; expiry remains the crash-safe fallback.",
  add_work_item: "Add one strict shared coordination item without changing gameplay source truth or release evidence.",
  claim_work_item: "Claim or renew one work item with an expiring lease; active takeovers require an explicit reason.",
  update_work_item: "Update structured work-item fields or lifecycle state against the exact current ledger digest.",
  release_work_item: "Release a work-item claim; clearing another actor's active claim requires an explicit reason.",
  list_agent_recipes: "Search LoopLab's immutable, versioned, evidence-backed operating playbook. Recipes are read-only context and never execute commands.",
  get_agent_recipe: "Read one exact operating recipe, its canonical command references, evidence requirements, stop conditions, revision, and SHA-256 digest.",
  list_command_macros: "List LoopLab's immutable, versioned proven-command registry with strict parameter schemas and exact canonical operation sequences.",
  preview_command_macro: "Expand and execute one proven macro against a clone, returning the exact SHA-256 plan, projected validation, and Doctor delta without persistence.",
  apply_command_macro: "Re-expand and atomically apply a previously previewed macro only when both its source digest and exact expansion digest still match and it introduces no Doctor blocker.",
  preview_batch: "Execute an arbitrary coherent canonical mutation batch against a clone, returning strict per-command errors, projected validation, current/release Doctor deltas, and an exact source-bound SHA-256 review receipt without persistence.",
  apply_previewed_batch: "Rebuild and atomically persist only the exact batch reviewed by preview_batch when both its current source digest and preview digest still match and neither Doctor profile gains a blocker.",
  auto_repair: "Dry-run by default: plan only deterministic, local, idempotent Project Doctor repairs through canonical commands. Exact source and repair digests are required before atomic apply; ambiguous design findings remain explicit residue.",
  converge: "Run a bounded provider-free analyze/repair/validate loop with cycle detection. Each pass uses canonical commands and both Doctor profiles; exact source and convergence digests are required before atomic apply.",
  list_builder_benchmarks: "List the complete visible, versioned golden-brief contracts used to evaluate whether LoopLab helps agents build different kinds of 2D games.",
  evaluate_builder_benchmark: "Re-grade the exact selected project deterministically against one visible golden brief using validation, both Doctor profiles, runtime evidence, and the exact generated one-file artifact.",
  compare_builder_benchmark_runs: "Compare exact digest-bound benchmark receipts only when task and provider/model/scaffold/strategy/context identities match; incomplete stochastic trials cannot claim a trend.",
  get_feel_report: "Measure deterministic movement response, acceleration, stopping, jump rise, apex, airtime, horizontal travel, coyote time, and jump buffering without claiming that the measured feel is fun.",
  get_presentation_program: "Inspect the authored renderer-neutral presentation program, exact event mappings, bounded audio and motion limits, source binding, and accessibility policy.",
  get_visual_identity: "Inspect the canonical project visual identity, exact digest, reference evidence, consent boundary, and judgment limits.",
  get_visual_identity_report: "Run strict source-bound visual-identity analysis without claiming aesthetic quality, originality, legal clearance, or provider adherence.",
  set_visual_identity: "Store one strict renderer-neutral project visual identity. Only explicit user-authored directives may be locks; generated pixels never own gameplay geometry.",
  remove_visual_identity: "Remove inherited art guidance without changing assets, gameplay geometry, replay, or exported runtime behavior.",
  get_tile_program: "Inspect one map's canonical sparse tile source, exact tile-program digest, independent collision ownership, and validation report.",
  get_tile_program_report: "Run strict map-scoped tile validation for palette references, exact terrain signatures, sparse chunks, projection, navigation, collision profiles, and deterministic budgets.",
  get_tile_region: "Read one bounded rectangular region with manual cells, logical terrain, deterministic resolved tiles, resolution reasons, and optional independent collision profiles.",
  suggest_tile_program: "Prepare a provider-free editable starter from authored tileset frames and the selected map projection. It never infers terrain signatures or collision from pixels.",
  set_tile_program: "Store one strict map-owned sparse tile program; visual cells and collision cells remain independent authored truth.",
  remove_tile_program: "Remove one map's tile program without changing objects, navigation, authored polyline collision, or other maps.",
  preview_tile_patch: "Apply one bounded canonical tile patch to a clone and return exact visual/collision diffs, dirty chunks, both Doctor profiles, and source/program/patch digests without persistence.",
  apply_tile_patch: "Apply only the exact previously previewed tile patch when source, tile-program, and patch digests still match and the projection remains valid and blocker-free.",
  get_presentation_report: "Run the source-bound presentation analysis used by Project Doctor without claiming aesthetic quality.",
  suggest_presentation_program: "Prepare a provider-free event-driven starter from current game structure. The suggestion is editable and never an automatic creative winner.",
  set_presentation_program: "Store one strict bounded event-to-audio-and-motion presentation program; it cannot own simulation, collision, completion, or replay state.",
  remove_presentation_program: "Remove authored sound and motion mappings without changing gameplay or replay state.",
  get_game_shell: "Inspect the authored renderer-neutral title, play, pause, terminal, restart, settings, lifecycle, and accessibility shell contract.",
  get_game_shell_report: "Run the source-bound standard-shell analysis used by Project Doctor without claiming visual quality or writing quality.",
  suggest_game_shell: "Prepare a provider-free shell from current project, presentation, and deterministic terminal truth. The suggestion remains editable and is never a creative winner.",
  set_game_shell: "Store one strict standard shell outside simulation and replay state; loss and completion surfaces must bind to authored deterministic runtime truth.",
  remove_game_shell: "Remove the authored standard shell. Production Doctor will then require a replacement or an explicit disabled-shell waiver.",
  get_tuning_contract: "Inspect the authored bounded Tuning Contract, its allowlisted targets, measured objectives, constraints, source binding, and explicit judgment limitations.",
  suggest_tuning_contract: "Prepare a provider-free editable starter contract around current measured behavior. The suggestion is a nearby exploration envelope, never a genre-optimal or fun claim.",
  set_tuning_contract: "Store one validated bounded Tuning Contract as authored project data; arbitrary object paths, executable expressions, and unbounded search spaces are rejected.",
  remove_tuning_contract: "Remove the authored Tuning Contract without changing gameplay parameter values.",
  run_tuning_search: "Run a provider-free, read-only, source-bound grid or deterministic stratified search under both Doctor profiles. Return hard-gated Pareto candidates and ordinary preview_batch commands, never an automatic creative winner.",
  list_game_foundations: "Inspect LoopLab's real platformer, top-down, systems, dimetric 2.5D, and kinetic reference sources and report their validation, gameplay roles, state change, acceptance, replay, completion, and honest creative gap ledgers.",
  suggest_game_foundations: "Route the current directed brief across several source-bound playable-foundation candidates, preserve explicit compatibility and proof gaps, and never choose or apply a winner automatically.",
  materialize_game_foundation: "Rebuild one exact digest-matching foundation candidate and return a protected ordinary replace_project preview batch; never mutate, promote, or claim creative quality automatically.",
  get_structural_scaffold_contract: "Inspect the authored structural scaffold contract, exact source binding, hard constraints, replacement protection, and judgment limitations.",
  suggest_structural_scaffold_contract: "Prepare a provider-free renderer-neutral starter contract for quest, economy, and encounter structures without silently authorizing replacement of an existing gameplay program.",
  set_structural_scaffold_contract: "Store one strict bounded structural scaffold contract as authored project data; unknown fields, unsupported families, and unbounded search are rejected.",
  remove_structural_scaffold_contract: "Remove the authored structural scaffold contract without changing the executable gameplay program.",
  run_structural_scaffold_search: "Generate and independently validate a bounded descriptor archive of structurally different quest, economy, and encounter candidates under both Doctor profiles; never choose or apply one automatically.",
  materialize_structural_scaffold: "Rebuild one exact source-bound safe candidate, require every content slot, and return an ordinary preview_batch command without mutating the project.",
  get_spatial_layout_contract: "Inspect the authored map-scoped spatial layout contract, exact source binding, pins, projection compatibility, replacement protection, and judgment limitations.",
  suggest_spatial_layout_contract: "Prepare a provider-free side-view, top-down, or dimetric 2.5D starter contract for the selected map without authorizing replacement by default.",
  set_spatial_layout_contract: "Store one strict bounded spatial layout contract; unknown fields, incompatible projection families, missing pins, and unbounded search are rejected.",
  remove_spatial_layout_contract: "Remove the authored spatial layout contract without changing map geometry, routes, collision, or evidence.",
  run_spatial_layout_search: "Generate and independently validate a bounded descriptor archive of projection-correct authored map layouts under both Doctor profiles; never choose or apply one automatically.",
  materialize_spatial_layout: "Rebuild one exact source-bound safe layout candidate and return one ordinary update_map preview batch without mutating the project or rerecording evidence.",
  get_doctor: "Run Project Doctor against the exact current project and return source-bound blockers, warnings, evidence state, and next actions.",
  get_privacy_report: "Return the source-bound local project privacy preflight used before provider handoff, publication, verification, and export. Every creative provider path repeats it against exact outbound text before inference. Reports contain only finding codes, sanitized structural paths, coverage counts, and repair actions; matched values are never returned.",
  route_work: "Return LoopLab's program-owned 2D production plan, Canvas/Phaser/PixiJS/melonJS decision knowledge, deterministic release-ready runtime selection, specialist route, UI/asset boundaries, and independent Project Doctor/Playwright gates.",
  set_runtime_profile: "Atomically select one release-ready primary 2D runtime adapter and its exact offline delivery metadata. Canvas, pinned Phaser, pinned PixiJS, and pinned tree-shaken melonJS adapters are available; exactly one owns presentation while LoopLab retains simulation and authored collision truth.",
  get_export_profile: "Inspect the exact strict or hosted one-file release profile, portable-save configuration, storage boundary, source binding, and policy without mutating the project.",
  get_save_report: "Run the strict source-bound save-program analysis used by validation and Project Doctor.",
  set_export_profile: "Atomically select strict storage-free export or hosted one-file persistence. Hosted storage is permitted only through one exact audited wrapper and always retains portable save-code fallback.",
  apply_batch: "Apply one coherent optimistic-concurrency batch and reject it atomically if it is stale, invalid, or introduces new Project Doctor blockers.",
  get_project: "Read the current authoring project with optional provider-safe compaction, or return an RFC 6902-style authored-source patch from an archived Project Doctor sinceDigest.",
  query_project: "Return only a strict selector result or exact RFC 6901 JSON Pointer values. Compaction is on by default so embedded assets cannot consume the agent context accidentally.",
  describe_frame: "Return a bounded depth-sorted semantic scene graph for one deterministic initial map frame, including exact logical screen geometry, overlap review targets, visibility, HUD-safe-area intrusion, and optional authored collision projection. Pixel, responsive-layout, and event-driven presentation claims remain explicitly unavailable without browser evidence.",
  simulate: "Run one bounded deterministic input tape on a cloned runtime and selectively return final state, capped events, or sampled player positions. It never mutates source or counts as evidence; an opt-in fixture candidate must be recorded and rerun separately.",
  get_completion_report: "Return deterministic completion/softlock evidence. Bounded search exhaustion is inconclusive, never proof that a game is unwinnable.",
  run_bot_cohorts: "Run bounded deterministic behavior cohorts over the exact source to expose dead mechanics, unvisited routes, unexercised combinations, stalled input, event density, and possible trivial strategies. The read-only report never treats synthetic policies as humans or claims fun, taste, preference, fairness, accessibility, or unreachability.",
  get_preference_memory: "Inspect the complete explicit browser-local studio preference memory, its policy, digest, and a context-matched applied preview. It is never game source or export data.",
  get_applied_preferences: "Build a deterministic receipt listing exactly which explicit preferences match a supplied or current game context and why; current instructions always override this soft guidance.",
  set_preference_memory_enabled: "Enable or disable explicit studio preference memory globally without deleting any entry or changing a game project.",
  add_preference_statement: "Store one deliberate user statement with named dimensions and optional game-context scope; no click, hover, playtime, Doctor, or provider output is inferred.",
  record_candidate_preference: "Bind a deliberate user choice between two existing iteration candidates to their exact source and comparison digests plus a required rationale.",
  update_preference_entry: "Edit only the allowlisted text, dimensions, context, or enabled state of one explicit builder-local preference.",
  remove_preference_entry: "Remove one explicit builder-local preference without changing any project or iteration candidate.",
  clear_preference_memory: "Clear all explicit browser-local studio preferences without changing projects, replay state, or exported HTML.",
  import_preference_memory: "Replace browser-local studio preference memory with one strict validated v1 document; prompts, images, responses, credentials, and tokens are rejected.",
  get_playtest_sessions: "Inspect compact source-bound local playtest summaries, or request one exact complete session. Observations are never replay, verification, provider, or preference evidence.",
  get_active_playtest_session: "Inspect the visible opt-in recorder state, source binding, active time, current map, and bounded counts without scraping UI.",
  start_playtest_session: "Start one explicit-consent local observation against the exact selected project source. Recording remains visible and stores semantic actions, bounded world samples, and canonical runtime events only.",
  finish_playtest_session: "Stop the active observation, derive per-map timing and heatmaps, and store only deliberate rating text. Behavior never becomes inferred taste.",
  discard_playtest_session: "Stop and erase the active uncommitted observation without changing project source or completed sessions.",
  update_playtest_feedback: "Replace the explicit rating, tags, and note on one completed local session; behavioral metrics remain descriptive and do not select a candidate.",
  remove_playtest_session: "Delete one completed browser-local observation without changing the game, replay fixtures, or verification evidence.",
  clear_playtest_sessions: "Delete every completed browser-local observation without changing the game or preference memory.",
  import_playtest_sessions: "Replace local observation history with one strict bounded digest-validated ledger; telemetry, device identity, screenshots, raw keys, and unknown fields are rejected.",
  preview_playtest_replay: "Dry-run one exact-tick saved playtest through the ordinary deterministic replay recorder. It compares canonical event counts and returns source, session, and promotion digests without mutating the project.",
  promote_playtest_replay: "Promote only the exact reviewed playtest preview into an ordinary versioned replay fixture after matching current source, saved-session, and promotion digests, then immediately rerun its pinned hashes.",
  get_release_verification: "Inspect the current structured release attestation, exact HTML subject SHA-256, policy, source binding, and validation errors. A legacy offline Boolean never counts as evidence.",
  start_ai_build: "Submit a real provider-backed one-pass build or bounded loop through the durable local companion; retain and monitor its job ID.",
  get_local_copilot_status: "Passively inspect supported loopback local-model servers and available model IDs without loading or invoking a model.",
  start_local_copilot: "Submit one bounded, stateless, schema-constrained local advisory job. It cannot run tools, mutate the selected project, or create validation evidence; retain its job ID and monitor rather than resubmitting.",
  get_local_copilot_job: "Inspect or retrieve one durable local advisory job. Treat its result as adjacent context for Codex or Claude, never as source truth or passing evidence.",
  cancel_local_copilot_job: "Cancel one durable local advisory job without changing the selected project or any verification evidence.",
  generate_ai_asset: "Submit or resume one durable OpenAI provider-art job. The project visual identity is inherited by default, a one-job bypass must be explicit, and delivery=image references require fresh referenceConsent=true before upload. Generated pixels remain visual source art and never own collision.",
  verify_release: "Submit or resume one durable local hostile-browser verification of the exact generated HTML, then record its source- and artifact-bound attestation only after every policy check passes.",
  get_release_verification_job: "Inspect one durable exact-artifact verification job without resubmitting the browser run.",
  cancel_release_verification_job: "Cancel or detach from one durable exact-artifact verification job without claiming it passed.",
  export_html: "Build the current project as one self-contained offline HTML artifact and return its source-bound export receipt.",
  capture_visual_review: "Capture every map/profile in clean play mode and add advisory, source-bound review regions. This visual inspection may run before Project Doctor is release-eligible and never counts as promotion evidence by itself.",
  get_visual_review: "Read the compact visual-review matrix and pre-annotation metadata. Clean images, annotated images, and crops are separate opt-in payloads.",
  select_visual_review_capture: "Select one visual-review capture in the editor and optionally return its clean image, annotated image, or focused crops.",
  start_visual_critique: "With explicit consent, submit up to eight exact current visual-review captures through the requested provider family's ready CLI/API route. The result is advisory, source/capture-bound, non-mutating, and never verification evidence or an automatic winner.",
  get_visual_critique_job: "Inspect or retrieve one durable visual-critique job without resubmitting image bytes. Status and results contain capture hashes and critique only, never image data URLs.",
  cancel_visual_critique_job: "Cancel one durable visual-critique job. Temporary capture files are deleted and the selected project remains unchanged.",
  get_visual_critique: "Read the current source-bound advisory critique retained in this browser session. A source or capture-set change makes it stale rather than silently reusing it.",
  collect_verification_evidence: "Collect strict source-bound promotion evidence. Unlike capture_visual_review, Project Doctor blockers stop this command.",
});

function titleFor(op) {
  return op.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function descriptionFor(op) {
  return SPECIAL_DESCRIPTIONS[op] ?? `${titleFor(op)} through LoopLab's canonical validated agent command surface.`;
}

export function getLooplabCommandContracts() {
  return LOOPLAB_AGENT_COMMANDS.map((op) => {
    const core = LOOPLAB_CORE_COMMANDS.includes(op);
    const mutatesBuilderState = BUILDER_STATE_MUTATING.has(op);
    const mutatesProject = core ? CORE_MUTATING.has(op) : BROWSER_MUTATING.has(op) && !mutatesBuilderState;
    const mutatesState = mutatesProject || mutatesBuilderState;
    const inputSchema = COMMAND_INPUTS.get(op) ?? schema({}, [], { additionalProperties: true });
    return {
      op,
      title: titleFor(op),
      description: descriptionFor(op),
      surfaces: core ? ["core", "browser-session"] : ["browser-session"],
      mutatesProject,
      mutatesBuilderState,
      requiresSourceDigestInMcp: core && mutatesProject && !LEDGER_MUTATING.has(op),
      coordinationOnly: op === "get_work_ledger" || op.endsWith("_agent_presence") || LEDGER_MUTATING.has(op),
      schemaPrecision: COMMAND_INPUTS.has(op) ? "declared" : "extensible",
      inputSchema,
      annotations: {
        readOnlyHint: !mutatesState,
        destructiveHint: mutatesState && !LEDGER_MUTATING.has(op) && (DESTRUCTIVE.test(op) || op.startsWith("update_") || op.startsWith("set_") || op === "promote_iteration" || op === "apply_previewed_batch" || op === "auto_repair" || op === "converge"),
        idempotentHint: !mutatesState,
        openWorldHint: OPEN_WORLD.has(op),
      },
    };
  });
}

export function getLooplabCommandContract(op) {
  return getLooplabCommandContracts().find((contract) => contract.op === op) ?? null;
}

function validateSchemaValue(value, inputSchema, path, errors) {
  if (!inputSchema || typeof inputSchema !== "object" || Array.isArray(inputSchema)) return;
  if (Array.isArray(inputSchema.enum) && !inputSchema.enum.some((candidate) => Object.is(candidate, value))) {
    errors.push(`${path} must be one of: ${inputSchema.enum.join(", ")}.`);
    return;
  }
  if (Array.isArray(inputSchema.anyOf)) {
    const matched = inputSchema.anyOf.some((candidate) => {
      const branchErrors = [];
      validateSchemaValue(value, candidate, path, branchErrors);
      return branchErrors.length === 0;
    });
    if (!matched) errors.push(`${path} does not satisfy any allowed field combination.`);
  }
  if (Array.isArray(inputSchema.required) && inputSchema.type !== "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) errors.push(`${path} must be an object.`);
    else for (const required of inputSchema.required) if (!Object.prototype.hasOwnProperty.call(value, required)) errors.push(`${path}.${required} is required.`);
  }
  if (inputSchema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${path} must be an object.`);
      return;
    }
    for (const required of inputSchema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, required)) errors.push(`${path}.${required} is required.`);
    }
    if (Number.isInteger(inputSchema.minProperties) && Object.keys(value).length < inputSchema.minProperties) errors.push(`${path} must contain at least ${inputSchema.minProperties} properties.`);
    const properties = inputSchema.properties ?? {};
    if (inputSchema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!Object.prototype.hasOwnProperty.call(properties, key)) errors.push(`${path}.${key} is an unsupported additional property.`);
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) validateSchemaValue(value[key], childSchema, `${path}.${key}`, errors);
    }
    return;
  }
  if (inputSchema.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array.`);
      return;
    }
    if (Number.isInteger(inputSchema.minItems) && value.length < inputSchema.minItems) errors.push(`${path} must contain at least ${inputSchema.minItems} item(s).`);
    if (Number.isInteger(inputSchema.maxItems) && value.length > inputSchema.maxItems) errors.push(`${path} must contain at most ${inputSchema.maxItems} item(s).`);
    if (inputSchema.uniqueItems === true && new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length) errors.push(`${path} must contain unique items.`);
    value.forEach((entry, index) => validateSchemaValue(entry, inputSchema.items, `${path}[${index}]`, errors));
    return;
  }
  if (inputSchema.type === "string") {
    if (typeof value !== "string") {
      errors.push(`${path} must be a string.`);
      return;
    }
    if (Number.isInteger(inputSchema.minLength) && value.length < inputSchema.minLength) errors.push(`${path} must contain at least ${inputSchema.minLength} character(s).`);
    if (Number.isInteger(inputSchema.maxLength) && value.length > inputSchema.maxLength) errors.push(`${path} must contain at most ${inputSchema.maxLength} character(s).`);
    if (typeof inputSchema.pattern === "string" && !(new RegExp(inputSchema.pattern).test(value))) errors.push(`${path} does not match ${inputSchema.pattern}.`);
    return;
  }
  if (inputSchema.type === "boolean") {
    if (typeof value !== "boolean") errors.push(`${path} must be a boolean.`);
    return;
  }
  if (inputSchema.type === "integer" || inputSchema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) || (inputSchema.type === "integer" && !Number.isInteger(value))) {
      errors.push(`${path} must be ${inputSchema.type === "integer" ? "an integer" : "a finite number"}.`);
      return;
    }
    if (typeof inputSchema.minimum === "number" && value < inputSchema.minimum) errors.push(`${path} must be at least ${inputSchema.minimum}.`);
    if (typeof inputSchema.maximum === "number" && value > inputSchema.maximum) errors.push(`${path} must be at most ${inputSchema.maximum}.`);
    if (typeof inputSchema.exclusiveMinimum === "number" && value <= inputSchema.exclusiveMinimum) errors.push(`${path} must be greater than ${inputSchema.exclusiveMinimum}.`);
  }
}

export function validateLooplabCommandInput(command, { rejectTransportEnvelope = false } = {}) {
  if (!command || typeof command !== "object" || Array.isArray(command)) return { valid: false, errors: ["command must be one object."], contract: null };
  const op = typeof command.op === "string" ? command.op : "";
  const contract = getLooplabCommandContract(op);
  if (!contract) return { valid: false, errors: [`command.op is unknown: ${op || "(missing)"}.`], contract: null };
  const payload = { ...command };
  delete payload.op;
  const errors = [];
  if (rejectTransportEnvelope) {
    for (const key of ["expectedSourceDigest", "expectedLedgerDigest", "expectedPreviewDigest", "compact", "allowNewBlockers"]) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) errors.push(`command.${key} belongs on the batch envelope, not a nested command.`);
    }
  }
  validateSchemaValue(payload, contract.inputSchema, "command", errors);
  return { valid: errors.length === 0, errors, contract };
}

export function validateLooplabCommandContracts() {
  const contracts = getLooplabCommandContracts();
  const errors = [];
  const seen = new Set();
  for (const contract of contracts) {
    if (seen.has(contract.op)) errors.push(`Duplicate command contract: ${contract.op}`);
    seen.add(contract.op);
    if (!contract.description) errors.push(`Missing description: ${contract.op}`);
    if (contract.inputSchema?.type !== "object") errors.push(`Command input schema must be an object: ${contract.op}`);
    if (!contract.surfaces.length) errors.push(`Missing command surface: ${contract.op}`);
  }
  for (const op of LOOPLAB_AGENT_COMMANDS) if (!seen.has(op)) errors.push(`Missing command contract: ${op}`);
  for (const op of seen) if (!LOOPLAB_AGENT_COMMANDS.includes(op)) errors.push(`Unknown command contract: ${op}`);
  for (const op of LOOPLAB_BROWSER_ONLY_COMMANDS) {
    const contract = contracts.find((candidate) => candidate.op === op);
    if (contract?.surfaces.includes("core")) errors.push(`Browser-only command is incorrectly exposed as core: ${op}`);
  }
  return { valid: errors.length === 0, errors, commandCount: contracts.length };
}
