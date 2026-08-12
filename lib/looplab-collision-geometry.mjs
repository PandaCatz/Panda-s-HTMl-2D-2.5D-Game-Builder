export const LOOPLAB_COLLISION_GEOMETRY_SCHEMA = "looplab-collision-geometry/v1";
export const LOOPLAB_COLLISION_GEOMETRY_REPORT_SCHEMA = "looplab-collision-geometry-report/v1";

export const LOOPLAB_COLLISION_GEOMETRY_LIMITS = Object.freeze({
  maximumChains: 128,
  maximumPointsPerChain: 256,
  maximumSegments: 4_096,
  maximumCoordinateMagnitude: 65_536,
  maximumElevationMagnitude: 1_024,
});

export const LOOPLAB_COLLISION_GEOMETRY_DEFAULT_TUNING = Object.freeze({
  minimumFloorNormalY: 0.707107,
  floorSnapDistance: 8,
  maximumStepUp: 12,
  stopOnSlope: true,
  slopeSlideAcceleration: 900,
  maximumSlideSpeed: 360,
  contactEpsilon: 0.001,
});

export const LOOPLAB_COLLISION_GEOMETRY_POLICY = Object.freeze({
  sourceField: "map.collisionGeometry",
  geometryAuthority: "Only authored map collision geometry owns segment and slope response. Generated art, sprite pixels, and renderer bounds never create collision implicitly.",
  orientation: "Every segment is authored from its first point to its second. In the browser's y-down world, the canonical right-hand normal is (dy / length, -dx / length); a left-to-right floor therefore faces upward.",
  endpointOwnership: "Segments own their start endpoint and exclude their end endpoint, except the final segment of an open chain. Equal-time contacts resolve by stable chain ID and segment index.",
  response: "Platformer motion uses deterministic bounded sweeps, X before Y, foot-center floor sampling, grounded snap only while not moving upward, bounded step-up, and steep-surface wall or slide classification. Top-down chains are planar authored boundaries.",
  elevation: "zMin and zMax independently gate collision for overlapping 2.5D routes. Screen projection and draw order never decide collision elevation.",
  replay: "Every contact field that can alter a later fixed tick belongs in a new replay projection. Existing replay versions remain byte-compatible.",
  judgmentBoundary: "Project Doctor validates geometry, orientation, bounds, references, and deterministic policy. It cannot decide whether a slope, route, or difficulty choice feels good without playtest evidence.",
});

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const GEOMETRY_FIELDS = new Set(["schemaVersion", "collisionOwner", "tuning", "chains"]);
const TUNING_FIELDS = new Set(Object.keys(LOOPLAB_COLLISION_GEOMETRY_DEFAULT_TUNING));
const CHAIN_FIELDS = new Set(["id", "name", "enabled", "role", "oneWay", "frontFace", "zMin", "zMax", "sourceObjectId", "points"]);
const POINT_FIELDS = new Set(["id", "x", "y"]);
const CHAIN_ROLES = new Set(["auto", "floor", "boundary"]);

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const stableId = (value) => typeof value === "string" && STABLE_ID.test(value);
const compareIds = (first, second) => String(first) < String(second) ? -1 : String(first) > String(second) ? 1 : 0;

function bounded(value, fallback, minimum, maximum) {
  return finite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function unknownFields(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function mapsForProject(project) {
  return Array.isArray(project?.maps) && project.maps.length
    ? project.maps
    : [{
        id: project?.activeMapId ?? "map-main",
        width: project?.width,
        height: project?.height,
        objects: project?.objects ?? [],
        collisionGeometry: project?.collisionGeometry,
      }];
}

function mapForInspection(project, mapId) {
  const maps = mapsForProject(project);
  return maps.find((map) => map?.id === mapId)
    ?? maps.find((map) => map?.id === project?.activeMapId)
    ?? maps[0]
    ?? null;
}

function normalizeTuning(value = {}) {
  return {
    minimumFloorNormalY: bounded(value.minimumFloorNormalY, LOOPLAB_COLLISION_GEOMETRY_DEFAULT_TUNING.minimumFloorNormalY, 0, 1),
    floorSnapDistance: bounded(value.floorSnapDistance, LOOPLAB_COLLISION_GEOMETRY_DEFAULT_TUNING.floorSnapDistance, 0, 64),
    maximumStepUp: bounded(value.maximumStepUp, LOOPLAB_COLLISION_GEOMETRY_DEFAULT_TUNING.maximumStepUp, 0, 64),
    stopOnSlope: value.stopOnSlope !== false,
    slopeSlideAcceleration: bounded(value.slopeSlideAcceleration, LOOPLAB_COLLISION_GEOMETRY_DEFAULT_TUNING.slopeSlideAcceleration, 0, 4_096),
    maximumSlideSpeed: bounded(value.maximumSlideSpeed, LOOPLAB_COLLISION_GEOMETRY_DEFAULT_TUNING.maximumSlideSpeed, 0.001, 4_096),
    contactEpsilon: bounded(value.contactEpsilon, LOOPLAB_COLLISION_GEOMETRY_DEFAULT_TUNING.contactEpsilon, 0.000001, 1),
  };
}

function normalizePoint(point = {}, index = 0) {
  return {
    id: String(point.id ?? `point-${String(index + 1).padStart(2, "0")}`).trim(),
    x: finite(point.x) ? point.x : 0,
    y: finite(point.y) ? point.y : 0,
  };
}

function normalizeChain(chain = {}) {
  return {
    id: String(chain.id ?? "").trim(),
    name: String(chain.name ?? chain.id ?? "Collision chain").trim(),
    enabled: chain.enabled !== false,
    role: CHAIN_ROLES.has(chain.role) ? chain.role : "auto",
    oneWay: chain.oneWay === true,
    frontFace: "right",
    zMin: finite(chain.zMin) ? chain.zMin : 0,
    zMax: finite(chain.zMax) ? chain.zMax : (finite(chain.zMin) ? chain.zMin + 1 : 1),
    ...(typeof chain.sourceObjectId === "string" && chain.sourceObjectId.trim() ? { sourceObjectId: chain.sourceObjectId.trim() } : {}),
    points: (Array.isArray(chain.points) ? chain.points : []).map(normalizePoint),
  };
}

export function normalizeCollisionGeometry(input = {}) {
  return {
    schemaVersion: LOOPLAB_COLLISION_GEOMETRY_SCHEMA,
    collisionOwner: "authored-map",
    tuning: normalizeTuning(input.tuning),
    chains: (Array.isArray(input.chains) ? input.chains : [])
      .map(normalizeChain)
      .sort((first, second) => compareIds(first.id, second.id)),
  };
}

export function collisionSegmentsForGeometry(input = {}) {
  const geometry = normalizeCollisionGeometry(input);
  const segments = [];
  for (const chain of geometry.chains) {
    if (chain.enabled === false) continue;
    for (let index = 0; index < chain.points.length - 1; index += 1) {
      const a = chain.points[index];
      const b = chain.points[index + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (!(length > 0)) continue;
      segments.push({
        id: `${chain.id}:${String(index).padStart(4, "0")}`,
        chainId: chain.id,
        chainName: chain.name,
        segmentIndex: index,
        pointAId: a.id,
        pointBId: b.id,
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        dx,
        dy,
        length,
        tangentX: dx / length,
        tangentY: dy / length,
        normalX: dy / length,
        normalY: -dx / length,
        minimumX: Math.min(a.x, b.x),
        maximumX: Math.max(a.x, b.x),
        minimumY: Math.min(a.y, b.y),
        maximumY: Math.max(a.y, b.y),
        ownsStart: true,
        ownsEnd: index === chain.points.length - 2,
        role: chain.role,
        oneWay: chain.oneWay,
        frontFace: chain.frontFace,
        zMin: chain.zMin,
        zMax: chain.zMax,
        ...(chain.sourceObjectId ? { sourceObjectId: chain.sourceObjectId } : {}),
      });
    }
  }
  return segments.sort((first, second) => compareIds(first.chainId, second.chainId) || first.segmentIndex - second.segmentIndex);
}

export function inspectCollisionGeometry(project, input, options = {}) {
  const map = mapForInspection(project, options.mapId);
  const value = input === undefined ? map?.collisionGeometry : input;
  const present = value !== undefined && value !== null;
  const issues = [];
  const add = (severity, code, message, detail = {}) => issues.push({ severity, code, message, ...detail });
  const report = {
    schemaVersion: LOOPLAB_COLLISION_GEOMETRY_REPORT_SCHEMA,
    present,
    valid: true,
    mapId: map?.id ?? options.mapId ?? null,
    chainCount: 0,
    pointCount: 0,
    segmentCount: 0,
    floorSegmentCount: 0,
    oneWaySegmentCount: 0,
    issues,
    errors: [],
    warnings: [],
    policy: LOOPLAB_COLLISION_GEOMETRY_POLICY,
  };
  if (!present) return report;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    add("error", "collision-geometry-invalid", "collisionGeometry must be an object.", { path: "collisionGeometry" });
  } else {
    const unknown = unknownFields(value, GEOMETRY_FIELDS);
    if (unknown.length) add("error", "collision-geometry-unknown-field", `collisionGeometry contains unsupported fields: ${unknown.join(", ")}.`, { path: "collisionGeometry" });
    if (value.schemaVersion !== LOOPLAB_COLLISION_GEOMETRY_SCHEMA) add("error", "collision-geometry-schema", `collisionGeometry.schemaVersion must be ${LOOPLAB_COLLISION_GEOMETRY_SCHEMA}.`, { path: "collisionGeometry.schemaVersion" });
    if (value.collisionOwner !== "authored-map") add("error", "collision-geometry-owner", "collisionGeometry.collisionOwner must be authored-map.", { path: "collisionGeometry.collisionOwner" });

    if (!value.tuning || typeof value.tuning !== "object" || Array.isArray(value.tuning)) add("error", "collision-tuning-invalid", "collisionGeometry.tuning must be an object.", { path: "collisionGeometry.tuning" });
    else {
      const tuningUnknown = unknownFields(value.tuning, TUNING_FIELDS);
      if (tuningUnknown.length) add("error", "collision-tuning-unknown-field", `collisionGeometry.tuning contains unsupported fields: ${tuningUnknown.join(", ")}.`, { path: "collisionGeometry.tuning" });
      const numericRules = [
        ["minimumFloorNormalY", 0, 1, false],
        ["floorSnapDistance", 0, 64, false],
        ["maximumStepUp", 0, 64, false],
        ["slopeSlideAcceleration", 0, 4_096, false],
        ["maximumSlideSpeed", 0, 4_096, true],
        ["contactEpsilon", 0, 1, true],
      ];
      for (const [field, minimum, maximum, exclusive] of numericRules) {
        const number = value.tuning[field];
        if (!finite(number) || (exclusive ? number <= minimum : number < minimum) || number > maximum) add("error", "collision-tuning-number", `collisionGeometry.tuning.${field} must be finite and within its deterministic bound.`, { path: `collisionGeometry.tuning.${field}` });
      }
      if (typeof value.tuning.stopOnSlope !== "boolean") add("error", "collision-tuning-stop", "collisionGeometry.tuning.stopOnSlope must be boolean.", { path: "collisionGeometry.tuning.stopOnSlope" });
    }

    if (!Array.isArray(value.chains)) add("error", "collision-chains-invalid", "collisionGeometry.chains must be an array.", { path: "collisionGeometry.chains" });
    else {
      report.chainCount = value.chains.length;
      if (value.chains.length > LOOPLAB_COLLISION_GEOMETRY_LIMITS.maximumChains) add("error", "collision-chain-limit", `collisionGeometry cannot exceed ${LOOPLAB_COLLISION_GEOMETRY_LIMITS.maximumChains} chains.`, { path: "collisionGeometry.chains" });
      const chainIds = new Set();
      const objectIds = new Set((map?.objects ?? []).map((object) => object?.id).filter(Boolean));
      let segments = 0;
      for (const [chainIndex, chain] of value.chains.entries()) {
        const path = `collisionGeometry.chains[${chainIndex}]`;
        if (!chain || typeof chain !== "object" || Array.isArray(chain)) {
          add("error", "collision-chain-invalid", `${path} must be an object.`, { path });
          continue;
        }
        const chainUnknown = unknownFields(chain, CHAIN_FIELDS);
        if (chainUnknown.length) add("error", "collision-chain-unknown-field", `${path} contains unsupported fields: ${chainUnknown.join(", ")}.`, { path, chainId: chain.id });
        if (!stableId(chain.id)) add("error", "collision-chain-id", `${path}.id must be a stable ID.`, { path: `${path}.id` });
        else if (chainIds.has(chain.id)) add("error", "collision-chain-duplicate", `${path}.id duplicates ${chain.id}.`, { path: `${path}.id`, chainId: chain.id });
        else chainIds.add(chain.id);
        if (typeof chain.name !== "string" || !chain.name.trim()) add("error", "collision-chain-name", `${path}.name must be a non-empty string.`, { path: `${path}.name`, chainId: chain.id });
        if (typeof chain.enabled !== "boolean") add("error", "collision-chain-enabled", `${path}.enabled must be boolean.`, { path: `${path}.enabled`, chainId: chain.id });
        if (!CHAIN_ROLES.has(chain.role)) add("error", "collision-chain-role", `${path}.role must be auto, floor, or boundary.`, { path: `${path}.role`, chainId: chain.id });
        if (typeof chain.oneWay !== "boolean") add("error", "collision-chain-one-way", `${path}.oneWay must be boolean.`, { path: `${path}.oneWay`, chainId: chain.id });
        if (chain.frontFace !== "right") add("error", "collision-chain-front-face", `${path}.frontFace must be right. Reverse point order to reverse the authored collision normal.`, { path: `${path}.frontFace`, chainId: chain.id });
        if (!finite(chain.zMin) || Math.abs(chain.zMin) > LOOPLAB_COLLISION_GEOMETRY_LIMITS.maximumElevationMagnitude) add("error", "collision-chain-z", `${path}.zMin must be a finite bounded elevation.`, { path: `${path}.zMin`, chainId: chain.id });
        if (!finite(chain.zMax) || Math.abs(chain.zMax) > LOOPLAB_COLLISION_GEOMETRY_LIMITS.maximumElevationMagnitude || (finite(chain.zMin) && chain.zMax <= chain.zMin)) add("error", "collision-chain-z", `${path}.zMax must be finite, bounded, and greater than zMin.`, { path: `${path}.zMax`, chainId: chain.id });
        if (chain.sourceObjectId !== undefined && (!stableId(chain.sourceObjectId) || !objectIds.has(chain.sourceObjectId))) add("error", "collision-chain-source-object", `${path}.sourceObjectId must reference an authored object on ${map?.id ?? "the selected map"}.`, { path: `${path}.sourceObjectId`, chainId: chain.id, objectId: chain.sourceObjectId });
        if (!Array.isArray(chain.points) || chain.points.length < 2) {
          add("error", "collision-chain-points", `${path}.points must contain at least two authored points.`, { path: `${path}.points`, chainId: chain.id });
          continue;
        }
        if (chain.points.length > LOOPLAB_COLLISION_GEOMETRY_LIMITS.maximumPointsPerChain) add("error", "collision-point-limit", `${path}.points cannot exceed ${LOOPLAB_COLLISION_GEOMETRY_LIMITS.maximumPointsPerChain} points.`, { path: `${path}.points`, chainId: chain.id });
        report.pointCount += chain.points.length;
        segments += chain.points.length - 1;
        const pointIds = new Set();
        for (const [pointIndex, point] of chain.points.entries()) {
          const pointPath = `${path}.points[${pointIndex}]`;
          if (!point || typeof point !== "object" || Array.isArray(point)) {
            add("error", "collision-point-invalid", `${pointPath} must be an object.`, { path: pointPath, chainId: chain.id });
            continue;
          }
          const pointUnknown = unknownFields(point, POINT_FIELDS);
          if (pointUnknown.length) add("error", "collision-point-unknown-field", `${pointPath} contains unsupported fields: ${pointUnknown.join(", ")}.`, { path: pointPath, chainId: chain.id });
          if (!stableId(point.id)) add("error", "collision-point-id", `${pointPath}.id must be a stable ID.`, { path: `${pointPath}.id`, chainId: chain.id });
          else if (pointIds.has(point.id)) add("error", "collision-point-duplicate", `${pointPath}.id duplicates ${point.id} within ${chain.id}.`, { path: `${pointPath}.id`, chainId: chain.id, pointId: point.id });
          else pointIds.add(point.id);
          for (const coordinate of ["x", "y"]) if (!finite(point[coordinate]) || Math.abs(point[coordinate]) > LOOPLAB_COLLISION_GEOMETRY_LIMITS.maximumCoordinateMagnitude) add("error", "collision-point-coordinate", `${pointPath}.${coordinate} must be finite and within the authored-world bound.`, { path: `${pointPath}.${coordinate}`, chainId: chain.id, pointId: point.id });
          if (pointIndex > 0) {
            const previous = chain.points[pointIndex - 1];
            if (finite(previous?.x) && finite(previous?.y) && finite(point.x) && finite(point.y)) {
              const dx = point.x - previous.x;
              const dy = point.y - previous.y;
              const length = Math.hypot(dx, dy);
              if (length <= 0.000001) add("error", "collision-segment-zero-length", `${path} has a zero-length segment between points ${pointIndex - 1} and ${pointIndex}.`, { path: `${path}.points`, chainId: chain.id, segmentIndex: pointIndex - 1 });
              else if (chain.role === "floor") {
                const normalY = -dx / length;
                const threshold = finite(value.tuning?.minimumFloorNormalY) ? value.tuning.minimumFloorNormalY : LOOPLAB_COLLISION_GEOMETRY_DEFAULT_TUNING.minimumFloorNormalY;
                if (-normalY + 0.000001 < threshold) add("error", "collision-floor-winding", `${path} floor segment ${pointIndex - 1} does not face upward strongly enough. Reverse its points or use role boundary/auto.`, { path: `${path}.points`, chainId: chain.id, segmentIndex: pointIndex - 1, normalY });
              }
            }
          }
        }
      }
      report.segmentCount = segments;
      if (segments > LOOPLAB_COLLISION_GEOMETRY_LIMITS.maximumSegments) add("error", "collision-segment-limit", `collisionGeometry cannot exceed ${LOOPLAB_COLLISION_GEOMETRY_LIMITS.maximumSegments} segments.`, { path: "collisionGeometry.chains" });
      const derived = collisionSegmentsForGeometry(value);
      report.floorSegmentCount = derived.filter((segment) => segment.role === "floor" || (segment.role === "auto" && -segment.normalY >= (value.tuning?.minimumFloorNormalY ?? LOOPLAB_COLLISION_GEOMETRY_DEFAULT_TUNING.minimumFloorNormalY))).length;
      report.oneWaySegmentCount = derived.filter((segment) => segment.oneWay).length;
    }
  }
  report.errors = issues.filter((issue) => issue.severity === "error").map((issue) => issue.message);
  report.warnings = issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message);
  report.valid = report.errors.length === 0;
  return report;
}

export function suggestCollisionGeometry(project = {}, options = {}) {
  const map = mapForInspection(project, options.mapId);
  if (!map) return {
    schemaVersion: "looplab-collision-geometry-suggestion/v1",
    provider: "none",
    available: false,
    mapId: options.mapId ?? null,
    geometry: null,
    report: null,
    reasons: ["No authored map is available."],
    decisionBoundary: LOOPLAB_COLLISION_GEOMETRY_POLICY.judgmentBoundary,
  };
  const requestedIds = Array.isArray(options.objectIds) ? new Set(options.objectIds.map(String)) : null;
  const candidates = (map.objects ?? [])
    .filter((object) => object?.collisionOwner === "authored-map" && object?.collider?.enabled !== false && object?.collider?.trigger !== true && object?.collider?.oneWay === true)
    .filter((object) => !requestedIds || requestedIds.has(object.id))
    .sort((first, second) => compareIds(first.id, second.id))
    .slice(0, LOOPLAB_COLLISION_GEOMETRY_LIMITS.maximumChains);
  if (candidates.length === 0) return {
    schemaVersion: "looplab-collision-geometry-suggestion/v1",
    provider: "none",
    available: false,
    mapId: map.id,
    geometry: null,
    report: null,
    reasons: ["No selected one-way authored colliders are available. Draw a chain explicitly for ramps or boundaries; sprite pixels are never sampled as collision."],
    decisionBoundary: LOOPLAB_COLLISION_GEOMETRY_POLICY.judgmentBoundary,
  };
  const chains = candidates.map((object) => {
    const collider = object.collider ?? {};
    const left = Number(object.x ?? 0) + Number(collider.offsetX ?? 0);
    const top = Number(object.y ?? 0) + Number(collider.offsetY ?? 0);
    const right = left + Number(collider.width ?? object.width ?? 0);
    const zMin = finite(collider.zMin) ? collider.zMin : Number(object.z ?? 0);
    const zMax = finite(collider.zMax) ? collider.zMax : zMin + Number(object.collisionHeight ?? 1);
    return normalizeChain({
      id: `surface-${object.id}`,
      name: `${object.name ?? object.id} collision surface`,
      enabled: true,
      role: "floor",
      oneWay: true,
      frontFace: "right",
      zMin,
      zMax,
      sourceObjectId: object.id,
      points: [
        { id: "start", x: left, y: top },
        { id: "end", x: right, y: top },
      ],
    });
  });
  const geometry = normalizeCollisionGeometry({ chains, tuning: options.tuning });
  return {
    schemaVersion: "looplab-collision-geometry-suggestion/v1",
    provider: "none",
    available: true,
    mapId: map.id,
    sourceObjectIds: candidates.map((object) => object.id),
    geometry,
    report: inspectCollisionGeometry(project, geometry, { mapId: map.id }),
    instructions: "This starter uses only explicit authored collider top edges. Review, reshape, or replace the chains before saving; generated art remains non-authoritative.",
    decisionBoundary: LOOPLAB_COLLISION_GEOMETRY_POLICY.judgmentBoundary,
  };
}
