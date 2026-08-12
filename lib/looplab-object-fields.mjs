export const LOOPLAB_OBJECT_UPDATE_FIELDS = Object.freeze([
  "name",
  "x", "y", "z", "supportZ", "width", "height",
  "color", "opacity", "solid", "hidden",
  "assetId", "assetFrame",
  "anchorMode", "collisionOwner", "collider", "collisionHeight",
  "requiresSupport", "groundAnchor", "supportFootprint", "supportContact",
  "runtimeJoin", "targetMapId", "targetSpawnId", "transition",
  "role", "blocksMovement", "allowHudOverlap",
  "depthLayer", "depthBias", "depthSlices", "cullingPadding", "visualBounds",
  "interactionSockets", "modularPathId", "pinned", "density", "worldX", "worldY",
  "vx", "vy", "grounded", "collected", "runtimeState",
  "active", "conducted", "cooldownTicks", "durationTicks", "elapsedTicks", "enabled",
  "energy", "health", "hp", "locked", "maxHp", "mode", "motionX", "motionY", "muted",
  "open", "ownerId", "pathId", "pathProgressVariableId", "phase", "pinTicks", "progress",
  "resonantTicks", "rootStage", "staggerTicks", "state", "supportId", "targetId", "threaded", "value",
]);

const OBJECT_UPDATE_FIELD_SET = new Set(LOOPLAB_OBJECT_UPDATE_FIELDS);

export function unsupportedObjectUpdateFields(changes) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return [];
  return Object.keys(changes).filter((key) => !OBJECT_UPDATE_FIELD_SET.has(key)).sort();
}

export const LOOPLAB_OBJECT_UPDATE_POLICY = Object.freeze({
  schemaVersion: "looplab-object-update-policy/v1",
  allowedFields: LOOPLAB_OBJECT_UPDATE_FIELDS,
  protectedFields: ["id", "kind", "motionBody"],
  dedicatedCommands: { motionBody: "set_motion_body", identityOrKind: "remove_object + add_object" },
  collisionOwner: "authored-map",
});