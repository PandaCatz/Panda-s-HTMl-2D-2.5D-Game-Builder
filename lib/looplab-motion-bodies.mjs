export const LOOPLAB_MOTION_BODY_LEGACY_SCHEMA = "looplab-motion-body/v1";
export const LOOPLAB_MOTION_BODY_SCHEMA = "looplab-motion-body/v2";
export const LOOPLAB_MOTION_BODY_STATE_SCHEMA = "looplab-motion-body-state/v1";
export const LOOPLAB_MOTION_BODY_RUNTIME_STATE_SCHEMA = "looplab-motion-body-runtime-state/v2";
export const LOOPLAB_MOTION_BODY_SUPPORTED_SCHEMAS = Object.freeze([
  LOOPLAB_MOTION_BODY_LEGACY_SCHEMA,
  LOOPLAB_MOTION_BODY_SCHEMA,
]);

export const LOOPLAB_MOTION_BODY_LIMITS = Object.freeze({
  maximumBodies: 128,
  maximumSpeed: 4_096,
  maximumAcceleration: 100_000,
  maximumSnapTolerance: 128,
  maximumCarryTolerance: 32,
});

export const LOOPLAB_MOTION_BODY_POLICY = Object.freeze({
  sourceField: "object.motionBody",
  authoredPathField: "pathId",
  drivers: ["input", "automatic"],
  inputPhase: "held",
  directions: ["forward", "reverse"],
  endBehaviors: ["stop", "loop", "ping-pong"],
  collisionResponses: ["stop"],
  riderModes: ["block", "carry-player"],
  crushResponses: ["stop", "respawn"],
  riderScope: "Version 2 may carry only the player and only in platformer control mode. General stacks and 2.5D elevators require a separate authored support contract.",
  authority: "Authored map paths, colliders, anchors, and support z remain the sole geometry authority. Artwork never creates a motion path or collider.",
  simulation: "Enabled bodies advance in stable object-ID order on the fixed simulation tick. Movement is substepped and resolved one axis at a time. Version 2 may transfer the exact accepted platform delta to a qualified player rider before player control.",
  crush: "A carried player that cannot accept the platform delta either stops and rolls back that substep or respawns through the canonical spawn path. The authored crushResponse chooses; renderer overlap never does.",
  replay: "Current motion poses and every latent state that can affect a later tick are included only in the newest replay hash projection; legacy fixtures keep their original projection.",
  rendering: "Canvas and Phaser render the same runtime object poses and deterministic depth keys. Motion bodies never live inside renderer objects.",
});

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const BODY_FIELDS_V1 = new Set([
  "schemaVersion",
  "enabled",
  "driver",
  "pathId",
  "actionId",
  "initialDirection",
  "endBehavior",
  "maxSpeed",
  "acceleration",
  "deceleration",
  "collisionResponse",
  "snapTolerance",
  "acceptanceTestId",
]);
const BODY_FIELDS = new Set([
  ...BODY_FIELDS_V1,
  "riderMode",
  "carryTolerance",
  "crushResponse",
]);
const DRIVERS = new Set(LOOPLAB_MOTION_BODY_POLICY.drivers);
const DIRECTIONS = new Set(LOOPLAB_MOTION_BODY_POLICY.directions);
const END_BEHAVIORS = new Set(LOOPLAB_MOTION_BODY_POLICY.endBehaviors);
const COLLISION_RESPONSES = new Set(LOOPLAB_MOTION_BODY_POLICY.collisionResponses);
const RIDER_MODES = new Set(LOOPLAB_MOTION_BODY_POLICY.riderModes);
const CRUSH_RESPONSES = new Set(LOOPLAB_MOTION_BODY_POLICY.crushResponses);
const SUPPORTED_SCHEMAS = new Set(LOOPLAB_MOTION_BODY_SUPPORTED_SCHEMAS);

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const stableId = (value) => typeof value === "string" && STABLE_ID.test(value);
const compareIds = (first, second) => String(first) < String(second) ? -1 : String(first) > String(second) ? 1 : 0;

export function normalizeMotionBody(input = {}) {
  const driver = DRIVERS.has(input.driver) ? input.driver : "input";
  return {
    schemaVersion: LOOPLAB_MOTION_BODY_SCHEMA,
    enabled: input.enabled !== false,
    driver,
    pathId: String(input.pathId ?? "").trim(),
    ...(driver === "input" ? { actionId: String(input.actionId ?? "").trim() } : {}),
    initialDirection: DIRECTIONS.has(input.initialDirection) ? input.initialDirection : "forward",
    endBehavior: END_BEHAVIORS.has(input.endBehavior) ? input.endBehavior : "stop",
    maxSpeed: finite(input.maxSpeed) ? input.maxSpeed : 120,
    acceleration: finite(input.acceleration) ? input.acceleration : 720,
    deceleration: finite(input.deceleration) ? input.deceleration : 960,
    collisionResponse: COLLISION_RESPONSES.has(input.collisionResponse) ? input.collisionResponse : "stop",
    snapTolerance: finite(input.snapTolerance) ? input.snapTolerance : 8,
    riderMode: RIDER_MODES.has(input.riderMode) ? input.riderMode : "block",
    carryTolerance: finite(input.carryTolerance) ? input.carryTolerance : 2,
    crushResponse: CRUSH_RESPONSES.has(input.crushResponse) ? input.crushResponse : "stop",
    ...(typeof input.acceptanceTestId === "string" && input.acceptanceTestId.trim() ? { acceptanceTestId: input.acceptanceTestId.trim() } : {}),
  };
}

function pathGeometry(path) {
  const points = Array.isArray(path?.points) ? path.points : [];
  const segments = [];
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const dx = Number(to?.x) - Number(from?.x);
    const dy = Number(to?.y) - Number(from?.y);
    const length = Math.hypot(dx, dy);
    if (!Number.isFinite(length) || length <= 0.000001) continue;
    segments.push({ from, to, dx, dy, length, start: total });
    total += length;
  }
  return { segments, total };
}

function closestPathPose(path, x, y, z) {
  const geometry = pathGeometry(path);
  let best = null;
  for (const segment of geometry.segments) {
    const amount = Math.max(0, Math.min(1, ((x - Number(segment.from.x)) * segment.dx + (y - Number(segment.from.y)) * segment.dy) / (segment.length * segment.length)));
    const sampleX = Number(segment.from.x) + segment.dx * amount;
    const sampleY = Number(segment.from.y) + segment.dy * amount;
    const sampleZ = Number(segment.from.z || 0) + (Number(segment.to.z || 0) - Number(segment.from.z || 0)) * amount;
    const distance = Math.hypot(x - sampleX, y - sampleY);
    const zDistance = Math.abs(Number(z || 0) - sampleZ);
    if (!best || distance < best.distance) best = { distance, zDistance, sampleX, sampleY, sampleZ };
  }
  return best;
}

function groundAnchor(object) {
  return {
    x: Number(object?.x || 0) + Number(object?.groundAnchor?.offsetX ?? Number(object?.width || 0) / 2),
    y: Number(object?.y || 0) + Number(object?.groundAnchor?.offsetY ?? object?.height ?? 0),
    z: Number(object?.z || 0),
  };
}

function pathPoseBounds(path, object) {
  const anchorX = Number(object?.groundAnchor?.offsetX ?? Number(object?.width || 0) / 2);
  const anchorY = Number(object?.groundAnchor?.offsetY ?? object?.height ?? 0);
  return (path?.points ?? []).map((point) => ({
    x: Number(point.x) - anchorX,
    y: Number(point.y) - anchorY,
    right: Number(point.x) - anchorX + Number(object.width || 0),
    bottom: Number(point.y) - anchorY + Number(object.height || 0),
  }));
}

export function suggestMotionBody(project, options = {}) {
  const maps = Array.isArray(project?.maps) && project.maps.length
    ? project.maps
    : [{ id: project?.activeMapId ?? "map-main", width: project?.width, height: project?.height, controlMode: project?.controlMode, objects: project?.objects ?? [], traversalPaths: project?.traversalPaths ?? [] }];
  const map = maps.find((candidate) => candidate.id === options.mapId)
    ?? maps.find((candidate) => candidate.id === project?.activeMapId)
    ?? maps[0];
  const object = (map?.objects ?? []).find((candidate) => candidate.id === options.id || (options.name && candidate.name === options.name));
  const base = {
    schemaVersion: "looplab-motion-body-suggestion/v1",
    mapId: map?.id ?? null,
    objectId: object?.id ?? null,
  };
  if (!map) return { ...base, available: false, reasons: ["The project has no authored map."], warnings: [] };
  if (!object) return { ...base, available: false, reasons: ["Select an exact authored object by stable id or name."], warnings: [] };
  if (["player", "spawn", "portal"].includes(object.kind)) return { ...base, available: false, reasons: [`${object.kind} objects cannot own motion bodies.`], warnings: [] };

  const anchor = groundAnchor(object);
  const candidates = (map.traversalPaths ?? [])
    .filter((path) => path?.enabled !== false && pathGeometry(path).total > 0)
    .map((path) => ({ path, pose: closestPathPose(path, anchor.x, anchor.y, anchor.z) }))
    .filter((entry) => entry.pose)
    .sort((first, second) => {
      const firstScore = first.pose.distance + first.pose.zDistance;
      const secondScore = second.pose.distance + second.pose.zDistance;
      return firstScore - secondScore || compareIds(first.path.id, second.path.id);
    });
  const selected = options.pathId
    ? candidates.find((entry) => entry.path.id === options.pathId)
    : candidates[0];
  if (!selected) return { ...base, available: false, reasons: [options.pathId ? `Authored path ${options.pathId} is missing or has no measurable segments.` : "Author a measurable traversal path on the same map first."], warnings: [] };

  const fixedZ = (selected.path.points ?? []).every((point) => Math.abs(Number(point?.z || 0) - Number(selected.path.points?.[0]?.z || 0)) <= 0.000001);
  const carryEligible = object.kind === "platform"
    && object.solid === true
    && (map.controlMode ?? project?.controlMode) === "platformer"
    && fixedZ;
  const requestedRiderMode = RIDER_MODES.has(options.riderMode) ? options.riderMode : null;
  const riderMode = requestedRiderMode ?? (carryEligible ? "carry-player" : "block");
  const reasons = [
    `Uses authored path ${selected.path.id}; artwork remains presentation-only.`,
    riderMode === "carry-player"
      ? "Transfers only the exact accepted fixed-tick platform delta to a qualified player rider."
      : "Keeps the player as an ordinary authored collision blocker.",
  ];
  const warnings = [];
  if (riderMode === "carry-player" && !carryEligible) warnings.push("carry-player requires a solid platform in platformer mode on a fixed-z path; Project Doctor will reject this draft until those authored contracts agree.");
  if (selected.pose.distance > LOOPLAB_MOTION_BODY_LIMITS.maximumSnapTolerance || selected.pose.zDistance > LOOPLAB_MOTION_BODY_LIMITS.maximumSnapTolerance) warnings.push("The object's ground anchor is too far from this path for a safe motion-body start; move the object or edit the path before applying.");
  const driver = DRIVERS.has(options.driver) ? options.driver : "automatic";
  const replayActions = (project?.inputActions ?? []).filter((action) => action?.replayEvent !== false && stableId(action?.id));
  const actionId = driver === "input"
    ? String(options.actionId ?? replayActions.find((action) => action.id === "interact")?.id ?? replayActions[0]?.id ?? "").trim()
    : undefined;
  if (driver === "input" && !actionId) warnings.push("Input-driven motion requires a declared replay-enabled semantic action.");
  const snapTolerance = Math.min(
    LOOPLAB_MOTION_BODY_LIMITS.maximumSnapTolerance,
    Math.max(8, Math.ceil(Math.max(selected.pose.distance, selected.pose.zDistance))),
  );
  const body = normalizeMotionBody({
    enabled: true,
    driver,
    pathId: selected.path.id,
    actionId,
    initialDirection: DIRECTIONS.has(options.initialDirection) ? options.initialDirection : "forward",
    endBehavior: END_BEHAVIORS.has(options.endBehavior) ? options.endBehavior : "ping-pong",
    maxSpeed: finite(options.maxSpeed) ? options.maxSpeed : Math.min(120, Number(selected.path.maximumSpeed || 120)),
    acceleration: finite(options.acceleration) ? options.acceleration : 720,
    deceleration: finite(options.deceleration) ? options.deceleration : 960,
    collisionResponse: "stop",
    snapTolerance,
    riderMode,
    carryTolerance: finite(options.carryTolerance) ? options.carryTolerance : 2,
    crushResponse: CRUSH_RESPONSES.has(options.crushResponse) ? options.crushResponse : "stop",
    acceptanceTestId: options.acceptanceTestId,
  });
  return {
    ...base,
    available: warnings.length === 0,
    pathId: selected.path.id,
    body,
    reasons,
    warnings,
    evidenceRequired: riderMode === "carry-player"
      ? ["movement", "rider carry", "blocked carry", `crush ${body.crushResponse}`, "replay v10", "standalone export"]
      : ["movement", "release", "collision stop", "replay", "standalone export"],
  };
}

export function inspectMotionBodies(project, options = {}) {
  const strict = options.strict === true;
  const maps = Array.isArray(project?.maps) && project.maps.length
    ? project.maps
    : [{ id: project?.activeMapId ?? "map-main", width: project?.width, height: project?.height, controlMode: project?.controlMode, objects: project?.objects ?? [], traversalPaths: project?.traversalPaths ?? [] }];
  const actionIds = new Set((project?.inputActions ?? []).map((action) => action?.id).filter(stableId));
  const replayActionIds = new Set((project?.inputActions ?? []).filter((action) => action?.replayEvent !== false).map((action) => action?.id).filter(stableId));
  const acceptanceIds = new Set((project?.acceptanceTests ?? []).map((test) => test?.id).filter(stableId));
  const issues = [];
  const bodies = [];
  const add = (severity, code, message, context = {}) => issues.push({ severity, code, message, ...context });

  for (const map of maps) {
    const paths = new Map((map?.traversalPaths ?? []).map((path) => [path?.id, path]));
    for (const object of map?.objects ?? []) {
      if (object?.motionBody === undefined) continue;
      const context = { mapId: map.id, objectId: object?.id, pathId: object?.motionBody?.pathId };
      if (!object.motionBody || typeof object.motionBody !== "object" || Array.isArray(object.motionBody)) {
        add("error", "motion-body-invalid", `${object?.name ?? object?.id ?? "Object"} motionBody must be an object.`, context);
        continue;
      }
      const sourceSchemaVersion = object.motionBody.schemaVersion;
      const allowedFields = sourceSchemaVersion === LOOPLAB_MOTION_BODY_LEGACY_SCHEMA ? BODY_FIELDS_V1 : BODY_FIELDS;
      const unknownFields = Object.keys(object.motionBody).filter((key) => !allowedFields.has(key));
      if (unknownFields.length) add("error", "motion-body-unknown-field", `${object.name ?? object.id} motionBody contains unsupported fields: ${unknownFields.join(", ")}.`, context);
      const body = normalizeMotionBody(object.motionBody);
      bodies.push({ mapId: map.id, objectId: object.id, sourceSchemaVersion, body: clone(body) });
      if (!SUPPORTED_SCHEMAS.has(sourceSchemaVersion)) add("error", "motion-body-schema", `${object.name ?? object.id} motionBody must use ${LOOPLAB_MOTION_BODY_LEGACY_SCHEMA} or ${LOOPLAB_MOTION_BODY_SCHEMA}.`, context);
      else if (sourceSchemaVersion === LOOPLAB_MOTION_BODY_LEGACY_SCHEMA) add("info", "motion-body-legacy-rider-policy", `${object.name ?? object.id} uses legacy player-blocking motion semantics. Save it through set_motion_body to adopt explicit v2 rider and crush policy.`, context);
      if (object.kind === "player" || object.kind === "spawn" || object.kind === "portal") add("error", "motion-body-kind", `${object.name ?? object.id} uses a motion body on a reserved ${object.kind} object.`, context);
      if (object.motionBody.enabled !== undefined && typeof object.motionBody.enabled !== "boolean") add("error", "motion-body-enabled", `${object.name ?? object.id} motionBody.enabled must be boolean.`, context);
      if (!DRIVERS.has(object.motionBody.driver)) add("error", "motion-body-driver", `${object.name ?? object.id} motionBody.driver must be input or automatic.`, context);
      if (!stableId(body.pathId)) add("error", "motion-body-path-id", `${object.name ?? object.id} motionBody.pathId must be a stable authored path ID.`, context);
      const path = paths.get(body.pathId);
      if (!path) add("error", "motion-body-path-missing", `${object.name ?? object.id} references missing motion path ${body.pathId || "(empty)"} on ${map.id}.`, context);
      else {
        const geometry = pathGeometry(path);
        if (!geometry.segments.length || geometry.total <= 0) add("error", "motion-body-path-empty", `${object.name ?? object.id} references a path without measurable motion length.`, context);
        if (body.endBehavior === "loop" && geometry.segments.length) {
          const first = geometry.segments[0].from;
          const last = geometry.segments.at(-1).to;
          const closureGap = Math.hypot(Number(last.x) - Number(first.x), Number(last.y) - Number(first.y), Number(last.z || 0) - Number(first.z || 0));
          if (closureGap > body.snapTolerance) add("error", "motion-body-loop-open", (object.name ?? object.id) + " uses loop behavior on an open path; close the authored endpoints to avoid teleporting collision.", { ...context, closureGap });
        }
        if (path.collisionOwner !== "authored-map") add("error", "motion-body-path-authority", `${object.name ?? object.id} motion path must remain authored-map geometry.`, context);
        if (path.enabled === false && body.enabled) add("error", "motion-body-path-disabled", `${object.name ?? object.id} is enabled but its motion path ${path.id} is disabled.`, context);
        if (body.riderMode === "carry-player") {
          const zValues = (path.points ?? []).map((point) => Number(point?.z || 0)).filter(Number.isFinite);
          const zRange = zValues.length ? Math.max(...zValues) - Math.min(...zValues) : 0;
          if (zRange > 0.000001) add("error", "motion-body-rider-z-path", `${object.name ?? object.id} carry-player path ${path.id} changes z. Version 2 carries riders only on fixed-z platform paths; authored 2.5D elevators require a separate support-volume contract.`, { ...context, zRange });
        }
        const anchor = groundAnchor(object);
        const closest = closestPathPose(path, anchor.x, anchor.y, anchor.z);
        if (closest && closest.distance > body.snapTolerance) add("error", "motion-body-start-gap", `${object.name ?? object.id} starts ${closest.distance.toFixed(2)} units away from authored path ${path.id}; place its ground anchor on the path.`, { ...context, distance: closest.distance });
        if (closest && closest.zDistance > body.snapTolerance) add("error", "motion-body-start-height", `${object.name ?? object.id} starts ${closest.zDistance.toFixed(2)} z units away from authored path ${path.id}.`, { ...context, zDistance: closest.zDistance });
        const escaped = pathPoseBounds(path, object).some((pose) => pose.x < 0 || pose.y < 0 || pose.right > Number(map.width) || pose.bottom > Number(map.height));
        if (escaped) add("error", "motion-body-path-bounds", `${object.name ?? object.id} would leave ${map.id}'s authored bounds while following ${path.id}.`, context);
      }
      if (body.driver === "input") {
        if (!stableId(body.actionId) || !actionIds.has(body.actionId)) add("error", "motion-body-action-missing", `${object.name ?? object.id} input-driven motionBody.actionId must reference a declared semantic input action.`, context);
        else if (!replayActionIds.has(body.actionId)) add("error", "motion-body-action-replay", `${object.name ?? object.id} action ${body.actionId} is excluded from replay input.`, { ...context, actionId: body.actionId });
      } else if (object.motionBody.actionId !== undefined) add("error", "motion-body-automatic-action", `${object.name ?? object.id} automatic motion body must not declare actionId.`, context);
      if (!DIRECTIONS.has(object.motionBody.initialDirection)) add("error", "motion-body-direction", `${object.name ?? object.id} initialDirection must be forward or reverse.`, context);
      if (!END_BEHAVIORS.has(object.motionBody.endBehavior)) add("error", "motion-body-end-behavior", `${object.name ?? object.id} endBehavior must be stop, loop, or ping-pong.`, context);
      if (!COLLISION_RESPONSES.has(object.motionBody.collisionResponse)) add("error", "motion-body-collision-response", `${object.name ?? object.id} collisionResponse must be stop.`, context);
      const rawMaxSpeed = object.motionBody.maxSpeed;
      if (!finite(rawMaxSpeed) || rawMaxSpeed <= 0 || rawMaxSpeed > LOOPLAB_MOTION_BODY_LIMITS.maximumSpeed) add("error", "motion-body-speed", (object.name ?? object.id) + " maxSpeed must be a finite number greater than zero and at most " + String(LOOPLAB_MOTION_BODY_LIMITS.maximumSpeed) + ".", context);
      for (const field of ["acceleration", "deceleration"]) {
        const value = object.motionBody[field];
        if (!finite(value) || value < 0 || value > LOOPLAB_MOTION_BODY_LIMITS.maximumAcceleration) add("error", "motion-body-" + field, (object.name ?? object.id) + " " + field + " must be a finite number from 0 through " + String(LOOPLAB_MOTION_BODY_LIMITS.maximumAcceleration) + ".", context);
      }
      const rawSnapTolerance = object.motionBody.snapTolerance;
      if (!finite(rawSnapTolerance) || rawSnapTolerance < 0 || rawSnapTolerance > LOOPLAB_MOTION_BODY_LIMITS.maximumSnapTolerance) add("error", "motion-body-snap-tolerance", (object.name ?? object.id) + " snapTolerance must be a finite number from 0 through " + String(LOOPLAB_MOTION_BODY_LIMITS.maximumSnapTolerance) + ".", context);
      if (sourceSchemaVersion === LOOPLAB_MOTION_BODY_SCHEMA) {
        if (!RIDER_MODES.has(object.motionBody.riderMode)) add("error", "motion-body-rider-mode", `${object.name ?? object.id} riderMode must be block or carry-player.`, context);
        if (!finite(object.motionBody.carryTolerance) || object.motionBody.carryTolerance < 0 || object.motionBody.carryTolerance > LOOPLAB_MOTION_BODY_LIMITS.maximumCarryTolerance) add("error", "motion-body-carry-tolerance", `${object.name ?? object.id} carryTolerance must be a finite number from 0 through ${LOOPLAB_MOTION_BODY_LIMITS.maximumCarryTolerance}.`, context);
        if (!CRUSH_RESPONSES.has(object.motionBody.crushResponse)) add("error", "motion-body-crush-response", `${object.name ?? object.id} crushResponse must be stop or respawn.`, context);
      }
      if (body.riderMode === "carry-player") {
        if (object.kind !== "platform") add("error", "motion-body-rider-kind", `${object.name ?? object.id} may carry the player only when authored as a platform.`, context);
        if ((map.controlMode ?? project?.controlMode) !== "platformer") add("error", "motion-body-rider-control-mode", `${object.name ?? object.id} carry-player requires platformer control mode; top-down and 2.5D elevators need explicit support/z authoring.`, context);
        if (object.solid !== true) add("error", "motion-body-rider-solid", `${object.name ?? object.id} must be an authored solid to carry the player.`, context);
      }
      if (object.collisionOwner !== "authored-map") add("error", "motion-body-collision-authority", `${object.name ?? object.id} motion collision must remain authored-map data.`, context);
      if (!object.collider || object.collider.enabled === false) add("error", "motion-body-collider-missing", `${object.name ?? object.id} needs an enabled authored collider so motion can stop deterministically.`, context);
      if (object.anchorMode !== "ground") add("error", "motion-body-ground-anchor", `${object.name ?? object.id} must use a ground-contact anchor while following an authored path.`, context);
      if (!body.acceptanceTestId) add(strict ? "warning" : "info", "motion-body-evidence-missing", `${object.name ?? object.id} has no linked executable acceptance test for movement, release, collision-stop${body.riderMode === "carry-player" ? ", carry, and crush response" : ""} behavior.`, context);
      else if (!acceptanceIds.has(body.acceptanceTestId)) add("error", "motion-body-evidence-invalid", `${object.name ?? object.id} references missing acceptance test ${body.acceptanceTestId}.`, { ...context, testId: body.acceptanceTestId });
    }
  }

  if (bodies.length > LOOPLAB_MOTION_BODY_LIMITS.maximumBodies) add("error", "motion-body-count", `The project declares ${bodies.length} motion bodies; the deterministic limit is ${LOOPLAB_MOTION_BODY_LIMITS.maximumBodies}.`);
  issues.sort((first, second) => compareIds(`${first.mapId ?? ""}:${first.objectId ?? ""}:${first.code}`, `${second.mapId ?? ""}:${second.objectId ?? ""}:${second.code}`));
  return {
    schemaVersion: "looplab-motion-body-report/v1",
    present: bodies.length > 0,
    bodyCount: bodies.length,
    enabledBodyCount: bodies.filter((entry) => entry.body.enabled).length,
    valid: !issues.some((issue) => issue.severity === "error"),
    errors: issues.filter((issue) => issue.severity === "error").map((issue) => issue.message),
    warnings: issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message),
    issues,
    bodies,
  };
}
