import { createNavigationModel } from "./looplab-navigation.mjs";

export const LOOPLAB_ELEVATION_TRANSITIONS_SCHEMA = "looplab-elevation-transitions/v1";
export const LOOPLAB_ELEVATION_TRANSITIONS_REPORT_SCHEMA = "looplab-elevation-transitions-report/v1";

export const LOOPLAB_ELEVATION_TRANSITIONS_LIMITS = Object.freeze({
  maximumTransitions: 128,
  maximumPointsPerTransition: 64,
  maximumSegments: 2_048,
  maximumCoordinateMagnitude: 65_536,
  maximumElevationMagnitude: 1_024,
  maximumWidth: 4_096,
  maximumEntryRadius: 4_096,
  maximumEntryZTolerance: 64,
});

export const LOOPLAB_ELEVATION_TRANSITIONS_POLICY = Object.freeze({
  sourceField: "map.elevationTransitions",
  supportAuthority: "Only authored elevation-transition points own interpolated support Z. Generated art, sprite pixels, screen projection, and draw order never create a walkable height change.",
  collisionAuthority: "A bound collision chain remains the authority for platformer contact shape. The transition contributes support Z but never replaces or derives the chain from artwork.",
  navigationAuthority: "A bound navigation link remains the authority for route connectivity, direction, and cost. The transition proves that the link has an authored physical route between height layers.",
  interpolation: "Ramps and stairs both use deterministic piecewise-linear support-Z interpolation. Stair art may remain discrete without turning visible risers into implicit colliders.",
  entry: "Top-down and dimetric movement may enter only through a height-compatible endpoint. Mid-corridor screen overlap cannot lift an underpass actor onto a raised route.",
  replay: "Active transition ID, segment ID, normalized progress, and support Z are deterministic state and belong in the next replay projection without changing older projections.",
  judgmentBoundary: "Project Doctor can prove source ownership, bounds, monotonic height, and collision/navigation agreement. It cannot prove that a ramp width, grade, or placement feels good without playtest evidence.",
});

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const PROGRAM_FIELDS = new Set(["schemaVersion", "supportOwner", "transitions"]);
const TRANSITION_FIELDS = new Set([
  "id", "name", "enabled", "kind", "width", "entryRadius", "entryZTolerance", "oneWay",
  "fromLayerId", "toLayerId", "navigationLinkId", "collisionChainId", "points",
]);
const POINT_FIELDS = new Set(["id", "x", "y", "z"]);
const TRANSITION_KINDS = new Set(["ramp", "stairs"]);

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
        controlMode: project?.controlMode,
        projection: project?.projection,
        objects: project?.objects ?? [],
        navigation: project?.navigation,
        collisionGeometry: project?.collisionGeometry,
        elevationTransitions: project?.elevationTransitions,
      }];
}

function mapForInspection(project, mapId) {
  const maps = mapsForProject(project);
  return maps.find((map) => map?.id === mapId)
    ?? maps.find((map) => map?.id === project?.activeMapId)
    ?? maps[0]
    ?? null;
}

function normalizePoint(point = {}, index = 0) {
  return {
    id: String(point.id ?? `point-${String(index + 1).padStart(2, "0")}`).trim(),
    x: finite(point.x) ? point.x : 0,
    y: finite(point.y) ? point.y : 0,
    z: finite(point.z) ? point.z : 0,
  };
}

function normalizeTransition(transition = {}) {
  const width = bounded(transition.width, 48, 0.001, LOOPLAB_ELEVATION_TRANSITIONS_LIMITS.maximumWidth);
  return {
    id: String(transition.id ?? "").trim(),
    name: String(transition.name ?? transition.id ?? "Elevation transition").trim(),
    enabled: transition.enabled !== false,
    kind: TRANSITION_KINDS.has(transition.kind) ? transition.kind : "ramp",
    width,
    entryRadius: bounded(transition.entryRadius, Math.max(width, 16), 0.001, LOOPLAB_ELEVATION_TRANSITIONS_LIMITS.maximumEntryRadius),
    entryZTolerance: bounded(transition.entryZTolerance, 0.5, 0, LOOPLAB_ELEVATION_TRANSITIONS_LIMITS.maximumEntryZTolerance),
    oneWay: transition.oneWay === true,
    ...(typeof transition.fromLayerId === "string" && transition.fromLayerId.trim() ? { fromLayerId: transition.fromLayerId.trim() } : {}),
    ...(typeof transition.toLayerId === "string" && transition.toLayerId.trim() ? { toLayerId: transition.toLayerId.trim() } : {}),
    ...(typeof transition.navigationLinkId === "string" && transition.navigationLinkId.trim() ? { navigationLinkId: transition.navigationLinkId.trim() } : {}),
    ...(typeof transition.collisionChainId === "string" && transition.collisionChainId.trim() ? { collisionChainId: transition.collisionChainId.trim() } : {}),
    points: (Array.isArray(transition.points) ? transition.points : []).map(normalizePoint),
  };
}

export function normalizeElevationTransitions(input = {}) {
  return {
    schemaVersion: LOOPLAB_ELEVATION_TRANSITIONS_SCHEMA,
    supportOwner: "authored-map",
    transitions: (Array.isArray(input.transitions) ? input.transitions : [])
      .map(normalizeTransition)
      .sort((first, second) => compareIds(first.id, second.id)),
  };
}

export function elevationSegmentsForProgram(input = {}) {
  const program = normalizeElevationTransitions(input);
  const segments = [];
  for (const transition of program.transitions) {
    if (transition.enabled === false) continue;
    const raw = [];
    let totalLength = 0;
    for (let index = 0; index < transition.points.length - 1; index += 1) {
      const a = transition.points[index];
      const b = transition.points[index + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (!(length > 0.000001)) continue;
      raw.push({ index, a, b, dx, dy, dz: b.z - a.z, length, startDistance: totalLength });
      totalLength += length;
    }
    for (const segment of raw) {
      segments.push({
        id: `${transition.id}:${String(segment.index).padStart(4, "0")}`,
        transitionId: transition.id,
        transitionName: transition.name,
        kind: transition.kind,
        segmentIndex: segment.index,
        pointAId: segment.a.id,
        pointBId: segment.b.id,
        ax: segment.a.x,
        ay: segment.a.y,
        az: segment.a.z,
        bx: segment.b.x,
        by: segment.b.y,
        bz: segment.b.z,
        dx: segment.dx,
        dy: segment.dy,
        dz: segment.dz,
        length: segment.length,
        startDistance: segment.startDistance,
        totalLength,
        width: transition.width,
        entryRadius: transition.entryRadius,
        entryZTolerance: transition.entryZTolerance,
        oneWay: transition.oneWay,
        ...(transition.fromLayerId ? { fromLayerId: transition.fromLayerId } : {}),
        ...(transition.toLayerId ? { toLayerId: transition.toLayerId } : {}),
        ...(transition.navigationLinkId ? { navigationLinkId: transition.navigationLinkId } : {}),
        ...(transition.collisionChainId ? { collisionChainId: transition.collisionChainId } : {}),
      });
    }
  }
  return segments.sort((first, second) => compareIds(first.transitionId, second.transitionId) || first.segmentIndex - second.segmentIndex);
}

export function sampleElevationTransition(input, point, options = {}) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const transitionId = options.transitionId ? String(options.transitionId) : null;
  const segments = elevationSegmentsForProgram(input);
  let best = null;
  for (const segment of segments) {
    if (transitionId && segment.transitionId !== transitionId) continue;
    const denominator = segment.length * segment.length;
    const parameter = Math.max(0, Math.min(1, ((x - segment.ax) * segment.dx + (y - segment.ay) * segment.dy) / denominator));
    const sampleX = segment.ax + segment.dx * parameter;
    const sampleY = segment.ay + segment.dy * parameter;
    const distance = Math.hypot(x - sampleX, y - sampleY);
    if (distance > segment.width / 2 + 0.000001) continue;
    const progress = segment.totalLength > 0 ? (segment.startDistance + segment.length * parameter) / segment.totalLength : 0;
    const candidate = {
      transitionId: segment.transitionId,
      transitionName: segment.transitionName,
      kind: segment.kind,
      segmentId: segment.id,
      segmentIndex: segment.segmentIndex,
      parameter,
      progress,
      x: sampleX,
      y: sampleY,
      z: segment.az + segment.dz * parameter,
      distance,
      width: segment.width,
      entryRadius: segment.entryRadius,
      entryZTolerance: segment.entryZTolerance,
      oneWay: segment.oneWay,
      start: { x: segments.find((entry) => entry.transitionId === segment.transitionId)?.ax ?? segment.ax, y: segments.find((entry) => entry.transitionId === segment.transitionId)?.ay ?? segment.ay, z: segments.find((entry) => entry.transitionId === segment.transitionId)?.az ?? segment.az },
      end: (() => {
        const entries = segments.filter((entry) => entry.transitionId === segment.transitionId);
        const final = entries[entries.length - 1] ?? segment;
        return { x: final.bx, y: final.by, z: final.bz };
      })(),
    };
    if (!best || distance < best.distance - 0.000001 || (Math.abs(distance - best.distance) <= 0.000001 && (compareIds(candidate.transitionId, best.transitionId) < 0 || (candidate.transitionId === best.transitionId && candidate.segmentIndex < best.segmentIndex)))) best = candidate;
  }
  return best;
}

function pointsMatch(first, second, tolerance = 0.001) {
  return Math.abs(Number(first?.x) - Number(second?.x)) <= tolerance
    && Math.abs(Number(first?.y) - Number(second?.y)) <= tolerance;
}

function pointsMatch3d(first, second, tolerance = 0.001) {
  return pointsMatch(first, second, tolerance) && Math.abs(Number(first?.z) - Number(second?.z)) <= tolerance;
}

export function inspectElevationTransitions(project, input, options = {}) {
  const map = mapForInspection(project, options.mapId);
  const value = input === undefined ? map?.elevationTransitions : input;
  const present = value !== undefined && value !== null;
  const issues = [];
  const add = (severity, code, message, detail = {}) => issues.push({ severity, code, message, ...detail });
  const report = {
    schemaVersion: LOOPLAB_ELEVATION_TRANSITIONS_REPORT_SCHEMA,
    present,
    valid: true,
    mapId: map?.id ?? options.mapId ?? null,
    transitionCount: 0,
    rampCount: 0,
    stairCount: 0,
    pointCount: 0,
    segmentCount: 0,
    navigationBoundCount: 0,
    collisionBoundCount: 0,
    issues,
    errors: [],
    warnings: [],
    policy: LOOPLAB_ELEVATION_TRANSITIONS_POLICY,
  };
  if (!present) return report;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    add("error", "elevation-transitions-invalid", "elevationTransitions must be an object.", { path: "elevationTransitions" });
  } else {
    const unknown = unknownFields(value, PROGRAM_FIELDS);
    if (unknown.length) add("error", "elevation-transitions-unknown-field", `elevationTransitions contains unsupported fields: ${unknown.join(", ")}.`, { path: "elevationTransitions" });
    if (value.schemaVersion !== LOOPLAB_ELEVATION_TRANSITIONS_SCHEMA) add("error", "elevation-transitions-schema", `elevationTransitions.schemaVersion must be ${LOOPLAB_ELEVATION_TRANSITIONS_SCHEMA}.`, { path: "elevationTransitions.schemaVersion" });
    if (value.supportOwner !== "authored-map") add("error", "elevation-transitions-owner", "elevationTransitions.supportOwner must be authored-map.", { path: "elevationTransitions.supportOwner" });
    if (!Array.isArray(value.transitions)) add("error", "elevation-transitions-array", "elevationTransitions.transitions must be an array.", { path: "elevationTransitions.transitions" });
    else {
      report.transitionCount = value.transitions.length;
      if (value.transitions.length > LOOPLAB_ELEVATION_TRANSITIONS_LIMITS.maximumTransitions) add("error", "elevation-transition-limit", `elevationTransitions cannot exceed ${LOOPLAB_ELEVATION_TRANSITIONS_LIMITS.maximumTransitions} transitions.`, { path: "elevationTransitions.transitions" });
      const ids = new Set();
      const navigation = createNavigationModel(map?.navigation);
      const layersById = new Map(navigation.layers.map((layer) => [layer.id, layer]));
      const nodesById = new Map(navigation.nodes.map((node) => [node.id, node]));
      const linksById = new Map(navigation.links.map((link) => [link.id, link]));
      const chainsById = new Map((map?.collisionGeometry?.chains ?? []).map((chain) => [chain.id, chain]));
      const strictLayerBinding = options.strict === true && (navigation.layers.length > 1 || map?.projection?.type === "dimetric-2:1");
      let segmentCount = 0;
      for (const [transitionIndex, transition] of value.transitions.entries()) {
        const path = `elevationTransitions.transitions[${transitionIndex}]`;
        if (!transition || typeof transition !== "object" || Array.isArray(transition)) {
          add("error", "elevation-transition-invalid", `${path} must be an object.`, { path });
          continue;
        }
        const unknownTransition = unknownFields(transition, TRANSITION_FIELDS);
        if (unknownTransition.length) add("error", "elevation-transition-unknown-field", `${path} contains unsupported fields: ${unknownTransition.join(", ")}.`, { path, transitionId: transition.id });
        if (!stableId(transition.id)) add("error", "elevation-transition-id", `${path}.id must be a stable ID.`, { path: `${path}.id` });
        else if (ids.has(transition.id)) add("error", "elevation-transition-duplicate", `${path}.id duplicates ${transition.id}.`, { path: `${path}.id`, transitionId: transition.id });
        else ids.add(transition.id);
        if (typeof transition.name !== "string" || !transition.name.trim()) add("error", "elevation-transition-name", `${path}.name must be a non-empty string.`, { path: `${path}.name`, transitionId: transition.id });
        if (typeof transition.enabled !== "boolean") add("error", "elevation-transition-enabled", `${path}.enabled must be boolean.`, { path: `${path}.enabled`, transitionId: transition.id });
        if (!TRANSITION_KINDS.has(transition.kind)) add("error", "elevation-transition-kind", `${path}.kind must be ramp or stairs.`, { path: `${path}.kind`, transitionId: transition.id });
        else if (transition.kind === "stairs") report.stairCount += 1;
        else report.rampCount += 1;
        const numericRules = [
          ["width", 0, LOOPLAB_ELEVATION_TRANSITIONS_LIMITS.maximumWidth, true],
          ["entryRadius", 0, LOOPLAB_ELEVATION_TRANSITIONS_LIMITS.maximumEntryRadius, true],
          ["entryZTolerance", 0, LOOPLAB_ELEVATION_TRANSITIONS_LIMITS.maximumEntryZTolerance, false],
        ];
        for (const [field, minimum, maximum, exclusive] of numericRules) {
          const number = transition[field];
          if (!finite(number) || (exclusive ? number <= minimum : number < minimum) || number > maximum) add("error", "elevation-transition-number", `${path}.${field} must be finite and within its deterministic bound.`, { path: `${path}.${field}`, transitionId: transition.id });
        }
        if (typeof transition.oneWay !== "boolean") add("error", "elevation-transition-one-way", `${path}.oneWay must be boolean.`, { path: `${path}.oneWay`, transitionId: transition.id });
        if (!Array.isArray(transition.points) || transition.points.length < 2) {
          add("error", "elevation-transition-points", `${path}.points must contain at least two authored points.`, { path: `${path}.points`, transitionId: transition.id });
          continue;
        }
        if (transition.points.length > LOOPLAB_ELEVATION_TRANSITIONS_LIMITS.maximumPointsPerTransition) add("error", "elevation-transition-point-limit", `${path}.points cannot exceed ${LOOPLAB_ELEVATION_TRANSITIONS_LIMITS.maximumPointsPerTransition} points.`, { path: `${path}.points`, transitionId: transition.id });
        report.pointCount += transition.points.length;
        segmentCount += transition.points.length - 1;
        const pointIds = new Set();
        const start = transition.points[0];
        const end = transition.points[transition.points.length - 1];
        const totalDeltaZ = finite(start?.z) && finite(end?.z) ? end.z - start.z : 0;
        const direction = Math.sign(totalDeltaZ);
        if (Math.abs(totalDeltaZ) <= 0.000001) add("error", "elevation-transition-flat", `${path} must change support Z between its first and final point. Use ordinary walkable ground for a flat route.`, { path: `${path}.points`, transitionId: transition.id });
        for (const [pointIndex, point] of transition.points.entries()) {
          const pointPath = `${path}.points[${pointIndex}]`;
          if (!point || typeof point !== "object" || Array.isArray(point)) {
            add("error", "elevation-transition-point-invalid", `${pointPath} must be an object.`, { path: pointPath, transitionId: transition.id });
            continue;
          }
          const pointUnknown = unknownFields(point, POINT_FIELDS);
          if (pointUnknown.length) add("error", "elevation-transition-point-unknown-field", `${pointPath} contains unsupported fields: ${pointUnknown.join(", ")}.`, { path: pointPath, transitionId: transition.id });
          if (!stableId(point.id)) add("error", "elevation-transition-point-id", `${pointPath}.id must be a stable ID.`, { path: `${pointPath}.id`, transitionId: transition.id });
          else if (pointIds.has(point.id)) add("error", "elevation-transition-point-duplicate", `${pointPath}.id duplicates ${point.id} within ${transition.id}.`, { path: `${pointPath}.id`, transitionId: transition.id, pointId: point.id });
          else pointIds.add(point.id);
          for (const coordinate of ["x", "y"]) {
            if (!finite(point[coordinate]) || Math.abs(point[coordinate]) > LOOPLAB_ELEVATION_TRANSITIONS_LIMITS.maximumCoordinateMagnitude) add("error", "elevation-transition-coordinate", `${pointPath}.${coordinate} must be finite and within the authored-world bound.`, { path: `${pointPath}.${coordinate}`, transitionId: transition.id, pointId: point.id });
          }
          if (!finite(point.z) || Math.abs(point.z) > LOOPLAB_ELEVATION_TRANSITIONS_LIMITS.maximumElevationMagnitude) add("error", "elevation-transition-z", `${pointPath}.z must be a finite bounded support elevation.`, { path: `${pointPath}.z`, transitionId: transition.id, pointId: point.id });
          if (finite(map?.width) && finite(point.x) && (point.x < 0 || point.x > map.width) || finite(map?.height) && finite(point.y) && (point.y < 0 || point.y > map.height)) add("error", "elevation-transition-boundary", `${pointPath} is outside the authored map boundary.`, { path: pointPath, transitionId: transition.id, pointId: point.id });
          if (pointIndex > 0) {
            const previous = transition.points[pointIndex - 1];
            if ([previous?.x, previous?.y, previous?.z, point.x, point.y, point.z].every(finite)) {
              const length = Math.hypot(point.x - previous.x, point.y - previous.y);
              if (length <= 0.000001) add("error", "elevation-transition-zero-length", `${path} has a zero-length planar segment between points ${pointIndex - 1} and ${pointIndex}.`, { path: `${path}.points`, transitionId: transition.id, segmentIndex: pointIndex - 1 });
              const deltaZ = point.z - previous.z;
              if (direction !== 0 && Math.sign(deltaZ) !== 0 && Math.sign(deltaZ) !== direction) add("error", "elevation-transition-nonmonotonic", `${path} reverses support-Z direction at segment ${pointIndex - 1}. Split switchbacks into separate authored transitions.`, { path: `${path}.points`, transitionId: transition.id, segmentIndex: pointIndex - 1 });
            }
          }
        }

        for (const field of ["fromLayerId", "toLayerId", "navigationLinkId", "collisionChainId"]) {
          if (transition[field] !== undefined && !stableId(transition[field])) add("error", "elevation-transition-reference", `${path}.${field} must be a stable ID when present.`, { path: `${path}.${field}`, transitionId: transition.id });
        }
        if (transition.fromLayerId && !layersById.has(transition.fromLayerId)) add("error", "elevation-transition-layer", `${path}.fromLayerId references missing navigation layer ${transition.fromLayerId}.`, { path: `${path}.fromLayerId`, transitionId: transition.id });
        if (transition.toLayerId && !layersById.has(transition.toLayerId)) add("error", "elevation-transition-layer", `${path}.toLayerId references missing navigation layer ${transition.toLayerId}.`, { path: `${path}.toLayerId`, transitionId: transition.id });
        if (transition.fromLayerId && transition.toLayerId && transition.fromLayerId === transition.toLayerId) add("error", "elevation-transition-same-layer", `${path} must bridge two distinct navigation layers.`, { path, transitionId: transition.id });

        if (transition.navigationLinkId) {
          report.navigationBoundCount += 1;
          const link = linksById.get(transition.navigationLinkId);
          if (!link) add("error", "elevation-transition-navigation-link", `${path}.navigationLinkId references missing link ${transition.navigationLinkId}.`, { path: `${path}.navigationLinkId`, transitionId: transition.id });
          else {
            const first = nodesById.get(link.a);
            const last = nodesById.get(link.b);
            if (!first || !last) add("error", "elevation-transition-navigation-endpoint", `${path} is bound to a navigation link with missing endpoint nodes.`, { path: `${path}.navigationLinkId`, transitionId: transition.id, linkId: link.id });
            else {
              if (!pointsMatch3d(start, first) || !pointsMatch3d(end, last)) add("error", "elevation-transition-navigation-endpoint", `${path} first/final points must exactly match navigation link ${link.id} endpoint x/y/z.`, { path: `${path}.points`, transitionId: transition.id, linkId: link.id });
              if (transition.fromLayerId && first.layerId !== transition.fromLayerId) add("error", "elevation-transition-navigation-layer", `${path}.fromLayerId must match navigation node ${first.id}.`, { path: `${path}.fromLayerId`, transitionId: transition.id, nodeId: first.id });
              if (transition.toLayerId && last.layerId !== transition.toLayerId) add("error", "elevation-transition-navigation-layer", `${path}.toLayerId must match navigation node ${last.id}.`, { path: `${path}.toLayerId`, transitionId: transition.id, nodeId: last.id });
            }
            if (link.oneWay !== transition.oneWay) add("error", "elevation-transition-navigation-direction", `${path}.oneWay must match navigation link ${link.id}.`, { path: `${path}.oneWay`, transitionId: transition.id, linkId: link.id });
          }
        } else if (strictLayerBinding) add("error", "elevation-transition-navigation-required", `${path} needs an explicit navigationLinkId in a production layered 2.5D map.`, { path: `${path}.navigationLinkId`, transitionId: transition.id });
        else if (navigation.layers.length > 1) add("warning", "elevation-transition-navigation-missing", `${path} changes height without an explicit navigation link binding.`, { path: `${path}.navigationLinkId`, transitionId: transition.id });
        if (strictLayerBinding && (!transition.fromLayerId || !transition.toLayerId)) add("error", "elevation-transition-layers-required", `${path} needs explicit fromLayerId and toLayerId in a production layered 2.5D map.`, { path, transitionId: transition.id });

        if (transition.collisionChainId) {
          report.collisionBoundCount += 1;
          const chain = chainsById.get(transition.collisionChainId);
          if (!chain) add("error", "elevation-transition-collision-chain", `${path}.collisionChainId references missing chain ${transition.collisionChainId}.`, { path: `${path}.collisionChainId`, transitionId: transition.id });
          else {
            if (!Array.isArray(chain.points) || chain.points.length !== transition.points.length || chain.points.some((point, index) => !pointsMatch(point, transition.points[index]))) add("error", "elevation-transition-collision-shape", `${path} x/y points must exactly match bound collision chain ${chain.id}.`, { path: `${path}.points`, transitionId: transition.id, chainId: chain.id });
            if (!new Set(["floor", "auto"]).has(chain.role)) add("error", "elevation-transition-collision-role", `${path} must bind a floor/auto collision chain, not ${chain.role}.`, { path: `${path}.collisionChainId`, transitionId: transition.id, chainId: chain.id });
            const minimumZ = Math.min(...transition.points.map((point) => Number(point.z)));
            const maximumZ = Math.max(...transition.points.map((point) => Number(point.z)));
            if (!finite(chain.zMin) || !finite(chain.zMax) || chain.zMin > minimumZ + 0.001 || chain.zMax <= maximumZ) add("error", "elevation-transition-collision-window", `${path} requires collision chain ${chain.id} zMin/zMax to span every interpolated support height.`, { path: `${path}.collisionChainId`, transitionId: transition.id, chainId: chain.id });
          }
        } else if ((map?.controlMode ?? project?.controlMode) === "platformer" && options.strict === true) add("error", "elevation-transition-collision-required", `${path} needs collisionChainId for production platformer floor contact.`, { path: `${path}.collisionChainId`, transitionId: transition.id });
      }
      report.segmentCount = segmentCount;
      if (segmentCount > LOOPLAB_ELEVATION_TRANSITIONS_LIMITS.maximumSegments) add("error", "elevation-transition-segment-limit", `elevationTransitions cannot exceed ${LOOPLAB_ELEVATION_TRANSITIONS_LIMITS.maximumSegments} segments.`, { path: "elevationTransitions.transitions" });
    }
  }
  report.errors = issues.filter((issue) => issue.severity === "error").map((issue) => issue.message);
  report.warnings = issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message);
  report.valid = report.errors.length === 0;
  return report;
}

export function suggestElevationTransitions(project = {}, options = {}) {
  const map = mapForInspection(project, options.mapId);
  if (!map) return {
    schemaVersion: "looplab-elevation-transitions-suggestion/v1",
    provider: "none",
    available: false,
    mapId: options.mapId ?? null,
    program: null,
    report: null,
    reasons: ["No authored map is available."],
    decisionBoundary: LOOPLAB_ELEVATION_TRANSITIONS_POLICY.judgmentBoundary,
  };
  const navigation = createNavigationModel(map.navigation);
  const nodesById = new Map(navigation.nodes.map((node) => [node.id, node]));
  const candidates = navigation.links
    .map((link) => ({ link, a: nodesById.get(link.a), b: nodesById.get(link.b) }))
    .filter(({ a, b }) => a && b && Math.abs(a.z - b.z) > 0.000001)
    .filter(({ link }) => !options.navigationLinkId || link.id === options.navigationLinkId)
    .sort((first, second) => compareIds(first.link.id, second.link.id));
  const candidate = candidates[0];
  if (!candidate) return {
    schemaVersion: "looplab-elevation-transitions-suggestion/v1",
    provider: "none",
    available: false,
    mapId: map.id,
    program: null,
    report: null,
    reasons: ["No authored navigation link connects nodes at different support heights."],
    decisionBoundary: LOOPLAB_ELEVATION_TRANSITIONS_POLICY.judgmentBoundary,
  };
  const width = bounded(Number(options.width), Math.max(16, Number(map.grid ?? project.grid ?? 32) * 1.5), 0.001, LOOPLAB_ELEVATION_TRANSITIONS_LIMITS.maximumWidth);
  const transition = normalizeTransition({
    id: String(options.id || `elevation-${candidate.link.id}`),
    name: String(options.name || `${candidate.link.id} ${options.kind === "stairs" ? "stairs" : "ramp"}`),
    kind: options.kind === "stairs" ? "stairs" : "ramp",
    width,
    entryRadius: bounded(Number(options.entryRadius), width, 0.001, LOOPLAB_ELEVATION_TRANSITIONS_LIMITS.maximumEntryRadius),
    entryZTolerance: bounded(Number(options.entryZTolerance), 0.5, 0, LOOPLAB_ELEVATION_TRANSITIONS_LIMITS.maximumEntryZTolerance),
    oneWay: candidate.link.oneWay,
    fromLayerId: candidate.a.layerId,
    toLayerId: candidate.b.layerId,
    navigationLinkId: candidate.link.id,
    ...(options.collisionChainId ? { collisionChainId: String(options.collisionChainId) } : {}),
    points: [
      { id: "start", x: candidate.a.x, y: candidate.a.y, z: candidate.a.z },
      { id: "end", x: candidate.b.x, y: candidate.b.y, z: candidate.b.z },
    ],
  });
  const program = normalizeElevationTransitions({ transitions: [transition] });
  return {
    schemaVersion: "looplab-elevation-transitions-suggestion/v1",
    provider: "none",
    available: true,
    mapId: map.id,
    navigationLinkId: candidate.link.id,
    program,
    report: inspectElevationTransitions(project, program, { mapId: map.id }),
    instructions: "Review corridor width, endpoint clearance, and physical art before saving. The authored transition never derives support or collision from pixels.",
    decisionBoundary: LOOPLAB_ELEVATION_TRANSITIONS_POLICY.judgmentBoundary,
  };
}
