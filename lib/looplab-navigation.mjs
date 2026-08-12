import { canonicalSha256 } from "./looplab-canonical-digest.mjs";

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const cloneJson = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function collectHashRecords(value, path = "", output = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectHashRecords(entry, `${path}[${index}]`, output));
    return output;
  }
  if (!isRecord(value)) return output;
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (typeof entry === "string" && /(sha256|hash|digest)$/i.test(key)) output.push({ path: nextPath, value: entry });
    else collectHashRecords(entry, nextPath, output);
  }
  return output;
}

function detectAuthoredRouteFormat(data) {
  if (Array.isArray(data?.actors) && isRecord(data?.animations) && Number.isFinite(Number(data?.loopMs))) return "city-activity-v1";
  if (Number(data?.version) === 2 && (Array.isArray(data?.nodes) || Array.isArray(data?.characters))) return "path-editor-v2";
  return "looplab-authored-route-v1";
}

function detectCoordinateSpace(data, sourceFormat) {
  if (typeof data?.coordinateSpace === "string") return data.coordinateSpace;
  if (sourceFormat === "city-activity-v1" || isRecord(data?.canvas)) return "source-pixels";
  if (sourceFormat === "path-editor-v2") return "percent";
  return "world";
}

export function authoredRouteDocumentDigest(data) {
  return canonicalSha256(data ?? null);
}

export function normalizeAuthoredRouteDocument(input, options = {}) {
  if (!isRecord(input)) return null;
  const envelope = isRecord(input.data) && typeof input.sourceFormat === "string" ? input : { data: input };
  const data = cloneJson(envelope.data);
  const sourceFormat = String(options.sourceFormat ?? envelope.sourceFormat ?? detectAuthoredRouteFormat(data));
  const coordinateSpace = String(options.coordinateSpace ?? envelope.coordinateSpace ?? detectCoordinateSpace(data, sourceFormat));
  const computedDigest = authoredRouteDocumentDigest(data);
  const priorIntegrity = isRecord(envelope.integrity) ? cloneJson(envelope.integrity) : {};
  const legacyDigests = [...new Set([
    ...(Array.isArray(priorIntegrity.legacyDigests) ? priorIntegrity.legacyDigests.map(String) : []),
    priorIntegrity.sourceDigest,
    priorIntegrity.currentDigest,
    priorIntegrity.verifiedDigest,
  ].filter((digest) => /^route-[a-f0-9]{8}$/i.test(String(digest))))];
  const sourceDigest = /^route-[a-f0-9]{8}$/i.test(String(priorIntegrity.sourceDigest ?? "")) ? computedDigest : String(priorIntegrity.sourceDigest || computedDigest);
  const currentDigest = /^route-[a-f0-9]{8}$/i.test(String(priorIntegrity.currentDigest ?? "")) ? computedDigest : String(priorIntegrity.currentDigest || computedDigest);
  const hashes = Array.isArray(priorIntegrity.hashes) ? priorIntegrity.hashes.map((entry) => cloneJson(entry)) : collectHashRecords(data);
  let hashStatus = ["unverified", "preserved", "verified", "stale"].includes(priorIntegrity.hashStatus)
    ? priorIntegrity.hashStatus
    : hashes.length ? "preserved" : "unverified";
  if (legacyDigests.length && hashStatus === "verified") hashStatus = "preserved";
  return {
    version: 1,
    sourceFormat,
    coordinateSpace,
    data,
    integrity: {
      revision: Math.max(0, Math.floor(finite(priorIntegrity.revision))),
      digestAlgorithm: "sha256-jcs-v1",
      sourceDigest,
      currentDigest,
      hashStatus,
      hashes,
      ...(priorIntegrity.verifiedDigest && !/^route-[a-f0-9]{8}$/i.test(String(priorIntegrity.verifiedDigest)) ? { verifiedDigest: String(priorIntegrity.verifiedDigest) } : {}),
      ...(priorIntegrity.verifiedAt && !legacyDigests.length ? { verifiedAt: String(priorIntegrity.verifiedAt) } : {}),
      ...(!legacyDigests.length && ["deterministic-replay", "render-capture", "runtime-probe", "combined"].includes(priorIntegrity.verificationKind) ? { verificationKind: priorIntegrity.verificationKind } : {}),
      ...(priorIntegrity.simVersion ? { simVersion: String(priorIntegrity.simVersion) } : {}),
      ...(Array.isArray(priorIntegrity.staleReasons) && priorIntegrity.staleReasons.length ? { staleReasons: priorIntegrity.staleReasons.map(String) } : {}),
      ...(Array.isArray(priorIntegrity.versionLog) && priorIntegrity.versionLog.length ? { versionLog: cloneJson(priorIntegrity.versionLog) } : {}),
      ...(legacyDigests.length ? { legacyDigests } : {}),
    },
  };
}

export function markAuthoredRouteDocumentEdited(input, data, reason = "Authored route data changed") {
  const current = normalizeAuthoredRouteDocument(input);
  if (!current) throw new Error("No authored route document is attached to this map.");
  const next = normalizeAuthoredRouteDocument({
    ...current,
    data,
    integrity: {
      ...current.integrity,
      revision: current.integrity.revision + 1,
      currentDigest: authoredRouteDocumentDigest(data),
      hashStatus: "stale",
      staleReasons: [...new Set([...(current.integrity.staleReasons ?? []), String(reason)])],
      verifiedDigest: undefined,
      verifiedAt: undefined,
      verificationKind: undefined,
    },
  });
  return next;
}

export function summarizeAuthoredRouteDocument(input) {
  const route = normalizeAuthoredRouteDocument(input);
  if (!route) return null;
  const data = route.data;
  const actors = Array.isArray(data.actors) ? data.actors : Array.isArray(data.characters) ? data.characters : [];
  const meetings = Array.isArray(data.meetings) ? data.meetings : [];
  const animationCount = isRecord(data.animations) ? Object.keys(data.animations).length : actors.filter((actor) => isRecord(actor.sprite)).length;
  const scheduleSteps = actors.reduce((count, actor) => count + (Array.isArray(actor.schedule) ? actor.schedule.length : Array.isArray(actor.route) ? actor.route.length : 0), 0);
  const eventCount = actors.reduce((count, actor) => count + (Array.isArray(actor.schedule) ? actor.schedule.filter((step) => step?.event).length : 0), 0);
  return {
    sourceFormat: route.sourceFormat,
    coordinateSpace: route.coordinateSpace,
    actorCount: actors.length,
    scheduleSteps,
    meetingCount: meetings.length,
    animationCount,
    eventCount,
    durationMs: Number.isFinite(Number(data.loopMs)) ? Number(data.loopMs) : null,
    hashCount: route.integrity.hashes.length,
    hashStatus: route.integrity.hashStatus,
    digestAlgorithm: route.integrity.digestAlgorithm,
    revision: route.integrity.revision,
    sourceDigest: route.integrity.sourceDigest,
    currentDigest: route.integrity.currentDigest,
  };
}

const rawRoutePoint = (value, fallbackZ = 0) => Array.isArray(value)
  ? { x: finite(value[0]), y: finite(value[1]), z: finite(value[2], fallbackZ) }
  : { x: finite(value?.x), y: finite(value?.y), z: finite(value?.z, fallbackZ) };

const isFiniteRouteCoordinate = (value) => (
  (typeof value === "number" || (typeof value === "string" && value.trim() !== ""))
  && Number.isFinite(Number(value))
);

function isFiniteRoutePoint(value) {
  if (Array.isArray(value)) {
    return isFiniteRouteCoordinate(value[0])
      && isFiniteRouteCoordinate(value[1])
      && (value.length < 3 || value[2] === undefined || isFiniteRouteCoordinate(value[2]));
  }
  if (!isRecord(value)) return false;
  return isFiniteRouteCoordinate(value.x)
    && isFiniteRouteCoordinate(value.y)
    && (value.z === undefined || isFiniteRouteCoordinate(value.z));
}

export function authoredRoutePreview(input, map = {}) {
  const route = normalizeAuthoredRouteDocument(input);
  if (!route) return [];
  const data = route.data;
  const actors = Array.isArray(data.actors) ? data.actors : Array.isArray(data.characters) ? data.characters : [];
  const sourceWidth = Math.max(1, finite(data.canvas?.width, finite(data.image?.w, finite(map.width, 100))));
  const sourceHeight = Math.max(1, finite(data.canvas?.height, finite(data.image?.h, finite(map.height, 100))));
  const mapWidth = Math.max(1, finite(map.width, sourceWidth));
  const mapHeight = Math.max(1, finite(map.height, sourceHeight));
  const convert = (point) => {
    if (route.coordinateSpace === "percent") return { x: point.x / 100 * mapWidth, y: point.y / 100 * mapHeight, z: point.z };
    if (route.coordinateSpace === "source-pixels") return { x: point.x / sourceWidth * mapWidth, y: point.y / sourceHeight * mapHeight, z: point.z };
    return point;
  };
  return actors.map((actor, actorIndex) => {
    const schedule = Array.isArray(actor.schedule) ? actor.schedule : [];
    const points = [];
    const pushPoint = (value, step) => {
      if (!value) return;
      const point = convert(rawRoutePoint(value, finite(step?.z, finite(actor.z))));
      const previous = points[points.length - 1];
      if (!previous || previous.x !== point.x || previous.y !== point.y || previous.z !== point.z) points.push(point);
    };
    if (schedule.length) {
      for (const step of schedule) {
        if (step.kind === "move") { pushPoint(step.from, step); pushPoint(step.to, step); }
        else pushPoint(step.at, step);
      }
    } else {
      pushPoint(actor, actor);
    }
    return {
      id: String(actor.id || `actor-${actorIndex + 1}`),
      name: String(actor.name || actor.id || `Actor ${actorIndex + 1}`),
      actorType: String(actor.actorType || "character"),
      points,
      schedule: cloneJson(schedule),
      depthBias: finite(actor.depthBias),
      sourceScreenSpace: route.coordinateSpace === "source-pixels",
    };
  });
}

export function setAuthoredRouteDocument(input, data, options = {}) {
  const navigation = createNavigationModel(input);
  const authoredRoute = normalizeAuthoredRouteDocument(data, options);
  if (!authoredRoute) throw new Error("Authored route data must be a JSON object.");
  navigation.authoredRoute = authoredRoute;
  return navigation;
}

export function verifyAuthoredRouteDocument(input, evidence = {}) {
  const navigation = createNavigationModel(input);
  const route = normalizeAuthoredRouteDocument(navigation.authoredRoute);
  if (!route) throw new Error("No authored route document is attached to this map.");
  const computedDigest = authoredRouteDocumentDigest(route.data);
  if (String(evidence.currentDigest || "") !== computedDigest) throw new Error("Route verification must name the current authored-route digest.");
  const evidenceKind = String(evidence.kind ?? evidence.source ?? "");
  if (!["deterministic-replay", "render-capture", "runtime-probe", "combined"].includes(evidenceKind)) {
    throw new Error("Route verification requires measured evidence kind deterministic-replay, render-capture, runtime-probe, or combined.");
  }
  const hashes = Array.isArray(evidence.hashes) ? evidence.hashes.map((entry) => ({ ...cloneJson(entry), source: String(entry?.source || evidenceKind) })) : [];
  if (!hashes.length || hashes.some((entry) => !isRecord(entry) || typeof entry.path !== "string" || !entry.path.trim() || typeof entry.value !== "string" || !entry.value.trim())) {
    throw new Error("Route verification requires at least one measured hash receipt with a stable path and value.");
  }
  const priorHashes = new Map(route.integrity.hashes.map((entry) => [String(entry.path), String(entry.value)]));
  const rerecorded = hashes.some((entry) => priorHashes.has(entry.path) && priorHashes.get(entry.path) !== entry.value);
  const versionLog = Array.isArray(evidence.versionLog) ? cloneJson(evidence.versionLog) : [];
  if (rerecorded && (!String(evidence.simVersion || "").trim() || !versionLog.length || versionLog.some((entry) => !isRecord(entry) || !String(entry.reason || "").trim()))) {
    throw new Error("Changed route hashes require an explicit simVersion and a versionLog reason; never rerecord merely to make a failing route green.");
  }
  route.integrity = {
    ...route.integrity,
    currentDigest: computedDigest,
    verifiedDigest: computedDigest,
    verifiedAt: String(evidence.verifiedAt || new Date().toISOString()),
    hashStatus: "verified",
    hashes,
    staleReasons: [],
    verificationKind: evidenceKind,
    ...(evidence.simVersion ? { simVersion: String(evidence.simVersion) } : {}),
    ...(versionLog.length ? { versionLog } : {}),
  };
  navigation.authoredRoute = route;
  return navigation;
}

const clonePoint = (point = {}) => ({
  x: finite(point.x),
  y: finite(point.y),
  z: finite(point.z),
});

export function createNavigationModel(input = {}) {
  const model = {
    version: 1,
    activeLayerId: typeof input.activeLayerId === "string" ? input.activeLayerId : "",
    layers: Array.isArray(input.layers) ? input.layers.map((layer, index) => ({
      id: String(layer.id || `layer-${index + 1}`),
      name: String(layer.name || `Route layer ${index + 1}`),
      color: /^#[0-9a-f]{6}$/i.test(String(layer.color || "")) ? String(layer.color) : "#5b5cf0",
      visible: layer.visible !== false,
      locked: layer.locked === true,
      zMin: finite(layer.zMin),
      zMax: finite(layer.zMax, finite(layer.zMin) + 1),
    })) : [],
    nodes: Array.isArray(input.nodes) ? input.nodes.map((node, index) => ({
      id: String(node.id || `node-${index + 1}`),
      x: finite(node.x),
      y: finite(node.y),
      z: finite(node.z),
      ...(node.layerId ? { layerId: String(node.layerId) } : {}),
      ...(node.destinationId ? { destinationId: String(node.destinationId) } : {}),
      ...(Array.isArray(node.tags) && node.tags.length ? { tags: node.tags.map(String) } : {}),
    })) : [],
    links: Array.isArray(input.links) ? input.links.map((link, index) => ({
      id: String(link.id || `link-${index + 1}`),
      a: String(link.a || ""),
      b: String(link.b || ""),
      ...(link.layerId ? { layerId: String(link.layerId) } : {}),
      cost: Math.max(0.01, finite(link.cost, 1)),
      oneWay: link.oneWay === true,
    })) : [],
    areas: Array.isArray(input.areas) ? input.areas.map((area, index) => ({
      id: String(area.id || `area-${index + 1}`),
      name: String(area.name || `${area.kind === "blocked" ? "Blocked" : "Walkable"} area ${index + 1}`),
      kind: area.kind === "blocked" ? "blocked" : "walkable",
      points: Array.isArray(area.points) ? area.points.map((point) => Array.isArray(point)
        ? { x: finite(point[0]), y: finite(point[1]), z: finite(point[2]) }
        : clonePoint(point)) : [],
      ...(area.layerId ? { layerId: String(area.layerId) } : {}),
      zMin: finite(area.zMin),
      zMax: finite(area.zMax, finite(area.zMin) + 1),
    })) : [],
    ...(input.testRoute ? {
      testRoute: {
        ...(input.testRoute.from ? { from: clonePoint(input.testRoute.from) } : {}),
        ...(input.testRoute.to ? { to: clonePoint(input.testRoute.to) } : {}),
        ...(Array.isArray(input.testRoute.layerIds) ? { layerIds: input.testRoute.layerIds.map(String) } : {}),
      },
    } : {}),
  };
  const authoredRoute = normalizeAuthoredRouteDocument(input.authoredRoute);
  if (authoredRoute) model.authoredRoute = authoredRoute;
  return model;
}

export function pointInNavigationPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const first = polygon[index];
    const second = polygon[previous];
    const crosses = (first.y > point.y) !== (second.y > point.y)
      && point.x < ((second.x - first.x) * (point.y - first.y)) / ((second.y - first.y) || Number.EPSILON) + first.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

const zInside = (z, item) => z >= finite(item.zMin) && z < finite(item.zMax, finite(item.zMin) + 1);

export function navigationPointWalkable(input, point) {
  const navigation = createNavigationModel(input);
  const blocked = navigation.areas.filter((area) => area.kind === "blocked" && area.points.length >= 3 && zInside(finite(point.z), area));
  if (blocked.some((area) => pointInNavigationPolygon(point, area.points))) return false;
  const walkable = navigation.areas.filter((area) => area.kind === "walkable" && area.points.length >= 3 && zInside(finite(point.z), area));
  return walkable.length === 0 || walkable.some((area) => pointInNavigationPolygon(point, area.points));
}

const nodeDistance = (first, second, elevationScale = 32) => Math.hypot(
  finite(first.x) - finite(second.x),
  finite(first.y) - finite(second.y),
  (finite(first.z) - finite(second.z)) * elevationScale,
);

function nearestNode(navigation, point, allowedLayers, elevationScale) {
  let best = null;
  for (const node of navigation.nodes) {
    if (allowedLayers && node.layerId && !allowedLayers.has(node.layerId)) continue;
    const distance = nodeDistance(point, node, elevationScale);
    if (!best || distance < best.distance || (distance === best.distance && String(node.id).localeCompare(String(best.node.id)) < 0)) best = { node, distance };
  }
  return best;
}

export function findNavigationPath(input, from, to, options = {}) {
  const navigation = createNavigationModel(input);
  const elevationScale = Math.max(1, finite(options.elevationScale, 32));
  const allowedLayers = Array.isArray(options.layerIds) && options.layerIds.length ? new Set(options.layerIds.map(String)) : null;
  const byId = new Map(navigation.nodes.map((node) => [node.id, node]));
  const start = typeof from === "string" ? byId.get(from) : nearestNode(navigation, clonePoint(from), allowedLayers, elevationScale)?.node;
  const goal = typeof to === "string" ? byId.get(to) : nearestNode(navigation, clonePoint(to), allowedLayers, elevationScale)?.node;
  if (!start || !goal) return { ok: false, points: [], nodeIds: [], cost: Infinity, reason: "missing-endpoint" };

  const adjacency = new Map(navigation.nodes.map((node) => [node.id, []]));
  let minimumCost = 1;
  for (const link of navigation.links) {
    const a = byId.get(link.a);
    const b = byId.get(link.b);
    if (!a || !b) continue;
    if (allowedLayers && link.layerId && !allowedLayers.has(link.layerId)) continue;
    const cost = Math.max(0.01, finite(link.cost, 1));
    minimumCost = Math.min(minimumCost, cost);
    const weight = nodeDistance(a, b, elevationScale) * cost;
    adjacency.get(a.id).push({ id: b.id, weight });
    if (!link.oneWay) adjacency.get(b.id).push({ id: a.id, weight });
  }

  const open = new Set([start.id]);
  const cameFrom = new Map();
  const scores = new Map(navigation.nodes.map((node) => [node.id, Infinity]));
  const estimates = new Map(navigation.nodes.map((node) => [node.id, Infinity]));
  scores.set(start.id, 0);
  estimates.set(start.id, nodeDistance(start, goal, elevationScale) * minimumCost);

  while (open.size) {
    let current = null;
    for (const id of open) {
      if (current === null || estimates.get(id) < estimates.get(current) || (estimates.get(id) === estimates.get(current) && id.localeCompare(current) < 0)) current = id;
    }
    if (current === goal.id) {
      const nodeIds = [current];
      while (cameFrom.has(current)) {
        current = cameFrom.get(current);
        nodeIds.push(current);
      }
      nodeIds.reverse();
      const points = nodeIds.map((id) => clonePoint(byId.get(id)));
      return { ok: true, points, nodeIds, cost: scores.get(goal.id), reason: null };
    }
    open.delete(current);
    for (const edge of adjacency.get(current) ?? []) {
      const nextScore = scores.get(current) + edge.weight;
      if (nextScore >= scores.get(edge.id)) continue;
      cameFrom.set(edge.id, current);
      scores.set(edge.id, nextScore);
      estimates.set(edge.id, nextScore + nodeDistance(byId.get(edge.id), goal, elevationScale) * minimumCost);
      open.add(edge.id);
    }
  }
  return { ok: false, points: [], nodeIds: [], cost: Infinity, reason: "disconnected" };
}

function navigationComponents(navigation, layerId) {
  const nodes = layerId === undefined
    ? navigation.nodes
    : navigation.nodes.filter((node) => (node.layerId ?? "") === layerId);
  const byId = new Set(nodes.map((node) => node.id));
  const adjacency = new Map(nodes.map((node) => [node.id, new Set()]));
  for (const link of navigation.links) {
    if (!byId.has(link.a) || !byId.has(link.b)) continue;
    if (layerId !== undefined && link.layerId && link.layerId !== layerId) continue;
    adjacency.get(link.a).add(link.b);
    adjacency.get(link.b).add(link.a);
  }
  const remaining = new Set(nodes.map((node) => node.id));
  const components = [];
  while (remaining.size) {
    const start = remaining.values().next().value;
    const pending = [start];
    const component = [];
    remaining.delete(start);
    while (pending.length) {
      const id = pending.pop();
      component.push(id);
      for (const next of adjacency.get(id) ?? []) if (remaining.delete(next)) pending.push(next);
    }
    components.push(component);
  }
  return components;
}

const orientation = (a, b, c) => (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x);

const pointOnSegment = (point, first, second) =>
  point.x >= Math.min(first.x, second.x) - 1e-9
  && point.x <= Math.max(first.x, second.x) + 1e-9
  && point.y >= Math.min(first.y, second.y) - 1e-9
  && point.y <= Math.max(first.y, second.y) + 1e-9;

function segmentsIntersect(first, second, third, fourth) {
  const firstSide = orientation(first, second, third);
  const secondSide = orientation(first, second, fourth);
  const thirdSide = orientation(third, fourth, first);
  const fourthSide = orientation(third, fourth, second);
  if ((firstSide > 0) !== (secondSide > 0) && (thirdSide > 0) !== (fourthSide > 0)) return true;
  if (Math.abs(firstSide) <= 1e-9 && pointOnSegment(third, first, second)) return true;
  if (Math.abs(secondSide) <= 1e-9 && pointOnSegment(fourth, first, second)) return true;
  if (Math.abs(thirdSide) <= 1e-9 && pointOnSegment(first, third, fourth)) return true;
  return Math.abs(fourthSide) <= 1e-9 && pointOnSegment(second, third, fourth);
}

function clipSegmentToAreaHeight(first, second, area) {
  const zMin = finite(area.zMin);
  const zMax = finite(area.zMax, zMin + 1);
  const firstZ = finite(first.z);
  const secondZ = finite(second.z);
  const delta = secondZ - firstZ;
  if (Math.abs(delta) < 1e-9) return firstZ >= zMin && firstZ < zMax ? [first, second] : null;
  const firstAmount = (zMin - firstZ) / delta;
  const secondAmount = (zMax - firstZ) / delta;
  const low = Math.max(0, Math.min(firstAmount, secondAmount));
  const high = Math.min(1, Math.max(firstAmount, secondAmount));
  if (high <= low) return null;
  const inset = Math.min(1e-7, (high - low) / 4);
  const at = (amount) => ({
    x: first.x + (second.x - first.x) * amount,
    y: first.y + (second.y - first.y) * amount,
    z: firstZ + delta * amount,
  });
  return [at(low + inset), at(high - inset)];
}

function segmentTouchesBlockedArea(first, second, area) {
  if (area.points.length < 3) return false;
  const clipped = clipSegmentToAreaHeight(first, second, area);
  if (!clipped) return false;
  const [start, end] = clipped;
  if (pointInNavigationPolygon(start, area.points) || pointInNavigationPolygon(end, area.points)) return true;
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  if (pointInNavigationPolygon(middle, area.points)) return true;
  for (let index = 0, previous = area.points.length - 1; index < area.points.length; previous = index++) {
    if (segmentsIntersect(start, end, area.points[previous], area.points[index])) return true;
  }
  return false;
}

export function analyzeNavigationMap(map) {
  const navigation = createNavigationModel(map?.navigation);
  const issues = [];
  const add = (severity, code, message, context = {}) => issues.push({ severity, code, message, mapId: map?.id, ...context });
  const layerIds = new Set();
  for (const layer of navigation.layers) {
    if (layerIds.has(layer.id)) add("error", "navigation-layer-id", `Navigation layer ${layer.id} is duplicated.`, { layerId: layer.id });
    layerIds.add(layer.id);
    if (!(layer.zMax > layer.zMin)) add("error", "navigation-layer-height", `${layer.name} must have zMax greater than zMin.`, { layerId: layer.id });
  }

  const nodeIds = new Set();
  const destinationIds = new Set();
  for (const node of navigation.nodes) {
    if (nodeIds.has(node.id)) add("error", "navigation-node-id", `Navigation node ${node.id} is duplicated.`, { nodeId: node.id });
    nodeIds.add(node.id);
    if (node.layerId && !layerIds.has(node.layerId)) add("error", "navigation-node-layer", `Navigation node ${node.id} references missing layer ${node.layerId}.`, { nodeId: node.id });
    if (node.x < 0 || node.y < 0 || node.x > finite(map?.width) || node.y > finite(map?.height)) add("error", "navigation-node-boundary", `Navigation node ${node.id} is outside the map boundary.`, { nodeId: node.id });
    if (node.destinationId) {
      if (destinationIds.has(node.destinationId)) add("error", "navigation-destination-id", `Destination ${node.destinationId} is duplicated.`, { nodeId: node.id });
      destinationIds.add(node.destinationId);
    }
  }

  const linkIds = new Set();
  const incoming = new Map(navigation.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(navigation.nodes.map((node) => [node.id, 0]));
  const byId = new Map(navigation.nodes.map((node) => [node.id, node]));
  const blockedAreas = navigation.areas.filter((area) => area.kind === "blocked");
  for (const link of navigation.links) {
    if (linkIds.has(link.id)) add("error", "navigation-link-id", `Navigation link ${link.id} is duplicated.`, { linkId: link.id });
    linkIds.add(link.id);
    if (!nodeIds.has(link.a) || !nodeIds.has(link.b)) {
      add("error", "navigation-link-endpoint", `Navigation link ${link.id} references a missing endpoint.`, { linkId: link.id });
      continue;
    }
    if (link.a === link.b) add("warning", "navigation-self-link", `Navigation link ${link.id} loops back to the same node.`, { linkId: link.id });
    if (link.layerId && !layerIds.has(link.layerId)) add("error", "navigation-link-layer", `Navigation link ${link.id} references missing layer ${link.layerId}.`, { linkId: link.id });
    outgoing.set(link.a, outgoing.get(link.a) + 1);
    incoming.set(link.b, incoming.get(link.b) + 1);
    if (!link.oneWay) {
      outgoing.set(link.b, outgoing.get(link.b) + 1);
      incoming.set(link.a, incoming.get(link.a) + 1);
    }
    if (blockedAreas.some((area) => (!area.layerId || !link.layerId || area.layerId === link.layerId) && segmentTouchesBlockedArea(byId.get(link.a), byId.get(link.b), area))) {
      add("error", "navigation-blocked-link", `Navigation link ${link.id} crosses authored blocked ground.`, { linkId: link.id });
    }
  }

  for (const node of navigation.nodes) {
    if ((incoming.get(node.id) + outgoing.get(node.id)) === 0) add("warning", "navigation-island", `Navigation node ${node.id} is disconnected.`, { nodeId: node.id });
    else if (incoming.get(node.id) > 0 && outgoing.get(node.id) === 0 && !node.destinationId) add("warning", "navigation-one-way-dead-end", `Navigation node ${node.id} can be entered but not left and is not marked as a stable destination.`, { nodeId: node.id });
  }
  const layerKeys = new Set(navigation.nodes.map((node) => node.layerId ?? ""));
  for (const layerId of layerKeys) {
    const connected = navigationComponents(navigation, layerId).filter((component) => component.some((id) => (incoming.get(id) + outgoing.get(id)) > 0));
    if (connected.length <= 1) continue;
    const layerName = navigation.layers.find((layer) => layer.id === layerId)?.name ?? (layerId || "unlayered routes");
    add("warning", "navigation-components", `${layerName} contains ${connected.length} disconnected route islands.`, { layerId: layerId || undefined });
  }

  const areaIds = new Set();
  for (const area of navigation.areas) {
    if (areaIds.has(area.id)) add("error", "navigation-area-id", `Navigation area ${area.id} is duplicated.`, { areaId: area.id });
    areaIds.add(area.id);
    if (area.points.length < 3) add("error", "navigation-area-points", `${area.name} needs at least three polygon points.`, { areaId: area.id });
    if (!(area.zMax > area.zMin)) add("error", "navigation-area-height", `${area.name} must have zMax greater than zMin.`, { areaId: area.id });
    if (area.layerId && !layerIds.has(area.layerId)) add("error", "navigation-area-layer", `${area.name} references missing layer ${area.layerId}.`, { areaId: area.id });
  }

  for (let firstIndex = 0; firstIndex < navigation.nodes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < navigation.nodes.length; secondIndex += 1) {
      const first = navigation.nodes[firstIndex];
      const second = navigation.nodes[secondIndex];
      if (Math.hypot(first.x - second.x, first.y - second.y) > 1 || Math.abs(first.z - second.z) < 0.001) continue;
      if (!first.layerId || !second.layerId || first.layerId === second.layerId) add("warning", "navigation-height-ambiguity", `${first.id} and ${second.id} occupy the same ground position at different heights without distinct route layers.`, { nodeId: second.id });
    }
  }

  if (navigation.authoredRoute) {
    const route = navigation.authoredRoute;
    const data = route.data;
    const actors = Array.isArray(data.actors) ? data.actors : Array.isArray(data.characters) ? data.characters : [];
    const meetings = Array.isArray(data.meetings) ? data.meetings : [];
    const animations = isRecord(data.animations) ? data.animations : {};
    const actorIds = new Set();
    const loopMs = Number.isFinite(Number(data.loopMs)) ? Number(data.loopMs) : null;
    for (const [actorIndex, actor] of actors.entries()) {
      const actorId = String(actor?.id || `actor-${actorIndex + 1}`);
      if (actorIds.has(actorId)) add("error", "route-actor-id", `Authored route actor ${actorId} is duplicated.`, { actorId });
      actorIds.add(actorId);
      const schedule = Array.isArray(actor?.schedule) ? actor.schedule : [];
      let previousEnd = -Infinity;
      for (const [stepIndex, step] of schedule.entries()) {
        const fromMs = Number(step?.fromMs);
        const toMs = Number(step?.toMs);
        if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) add("error", "route-step-timing", `${actorId} schedule step ${stepIndex + 1} needs finite, increasing fromMs/toMs values.`, { actorId, stepIndex });
        if (Number.isFinite(fromMs) && fromMs < previousEnd) add("error", "route-step-overlap", `${actorId} schedule step ${stepIndex + 1} overlaps the prior step.`, { actorId, stepIndex });
        if (Number.isFinite(toMs)) previousEnd = Math.max(previousEnd, toMs);
        if (loopMs !== null && Number.isFinite(toMs) && toMs > loopMs) add("error", "route-step-loop-boundary", `${actorId} schedule step ${stepIndex + 1} extends beyond loopMs.`, { actorId, stepIndex });
        if (step?.kind === "move" && (!step.from || !step.to)) add("error", "route-step-points", `${actorId} move step ${stepIndex + 1} needs exact from and to points.`, { actorId, stepIndex });
        if (step?.kind === "wait" && !step.at) add("error", "route-step-wait-point", `${actorId} wait step ${stepIndex + 1} needs an exact at point.`, { actorId, stepIndex });
        if (step?.animation && Object.keys(animations).length && !animations[step.animation]) add("error", "route-step-animation", `${actorId} schedule step ${stepIndex + 1} references missing animation ${step.animation}.`, { actorId, stepIndex });
        for (const point of [step?.from, step?.to, step?.at].filter(Boolean)) {
          if (!isFiniteRoutePoint(point)) add("error", "route-step-coordinate", `${actorId} schedule step ${stepIndex + 1} contains a non-finite route coordinate.`, { actorId, stepIndex });
        }
      }
    }
    for (const [meetingIndex, meeting] of meetings.entries()) {
      const id = String(meeting?.id || `meeting-${meetingIndex + 1}`);
      const participantIds = Array.isArray(meeting?.actorIds) ? meeting.actorIds.map(String) : [];
      if (participantIds.length < 2 || participantIds.some((actorId) => !actorIds.has(actorId))) add("error", "route-meeting-actors", `${id} must reference at least two existing route actors.`, { meetingId: id });
      if (!Number.isFinite(Number(meeting?.fromMs)) || !Number.isFinite(Number(meeting?.toMs)) || Number(meeting.toMs) <= Number(meeting.fromMs)) add("error", "route-meeting-timing", `${id} needs a finite meeting interval.`, { meetingId: id });
      if (!meeting?.at) add("error", "route-meeting-point", `${id} needs an exact meeting point.`, { meetingId: id });
    }
    const computedDigest = authoredRouteDocumentDigest(data);
    if (route.integrity.currentDigest !== computedDigest) add("error", "route-document-digest", "Authored route data changed without going through a versioned route edit.");
    if (route.integrity.hashStatus === "stale") add("warning", "route-hashes-stale", "Authored route timing changed; preserved deterministic hashes are stale until the route is replayed and explicitly verified.");
  }

  if (navigation.testRoute?.from && navigation.testRoute?.to && navigation.nodes.length) {
    const result = findNavigationPath(navigation, navigation.testRoute.from, navigation.testRoute.to, { layerIds: navigation.testRoute.layerIds });
    if (!result.ok) add("error", "navigation-test-route", "The saved navigation test route cannot reach its destination.");
  }

  return {
    issues,
    errorCount: issues.filter((issue) => issue.severity === "error").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
    summary: {
      layerCount: navigation.layers.length,
      nodeCount: navigation.nodes.length,
      linkCount: navigation.links.length,
      areaCount: navigation.areas.length,
      authoredRoute: summarizeAuthoredRouteDocument(navigation.authoredRoute),
    },
  };
}

export function importPathEditorNavigation(data, map) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Path Editor data must be an object.");
  const width = Math.max(1, finite(map?.width, finite(data.image?.w, 100)));
  const height = Math.max(1, finite(map?.height, finite(data.image?.h, 100)));
  const extension = data.looplab && typeof data.looplab === "object" && !Array.isArray(data.looplab) ? data.looplab : {};
  const layerHeights = extension.layerHeights && typeof extension.layerHeights === "object" ? extension.layerHeights : {};
  const nodeHeights = extension.nodeHeights && typeof extension.nodeHeights === "object" ? extension.nodeHeights : {};
  const areaHeights = extension.areaHeights && typeof extension.areaHeights === "object" ? extension.areaHeights : {};
  const fromPercent = (point, fallbackZ = 0) => ({
    x: finite(Array.isArray(point) ? point[0] : point.x) / 100 * width,
    y: finite(Array.isArray(point) ? point[1] : point.y) / 100 * height,
    z: finite(Array.isArray(point) ? point[2] : point.z, fallbackZ),
  });
  const layers = (data.layers ?? []).map((layer, index) => {
    const id = String(layer.id || `layer-${index + 1}`);
    const heightContract = layerHeights[id] ?? {};
    const zMin = finite(layer.zMin, finite(heightContract.zMin));
    return {
      id,
      name: String(layer.name || `Route layer ${index + 1}`),
      color: layer.color,
      visible: layer.visible !== false,
      locked: layer.locked === true,
      zMin,
      zMax: finite(layer.zMax, finite(heightContract.zMax, zMin + 1)),
    };
  });
  const nodes = (data.nodes ?? []).map((node, index) => ({
    id: String(node.id || `node-${index + 1}`),
    ...fromPercent(node, finite(nodeHeights[String(node.id || `node-${index + 1}`)])),
    ...(node.dest ? { destinationId: String(node.dest) } : {}),
    ...(Array.isArray(node.tags) ? { tags: node.tags.map(String) } : {}),
    ...(node.layer ? { layerId: String(node.layer) } : {}),
  }));
  const links = (data.edges ?? []).map((edge, index) => ({
    id: String(edge.id || `link-${index + 1}`),
    a: String(edge.a || ""),
    b: String(edge.b || ""),
    ...(edge.layer ? { layerId: String(edge.layer) } : {}),
    cost: Math.max(0.01, finite(edge.cost, 1)),
    oneWay: edge.oneWay === true,
  }));
  const areas = (data.areas ?? []).map((area, index) => {
    const id = String(area.id || `area-${index + 1}`);
    const heightContract = areaHeights[id] ?? {};
    const zMin = finite(area.zMin, finite(heightContract.zMin));
    return {
      id,
      name: String(area.name || `${area.kind === "blocked" ? "Blocked" : "Walkable"} area ${index + 1}`),
      kind: area.kind === "blocked" ? "blocked" : "walkable",
      points: (area.points ?? []).map((point) => fromPercent(point, zMin)),
      ...(area.layer ? { layerId: String(area.layer) } : {}),
      zMin,
      zMax: finite(area.zMax, finite(heightContract.zMax, zMin + 1)),
    };
  });
  const hasRichRouteData = Array.isArray(data.actors)
    || (Array.isArray(data.characters) && data.characters.length > 0)
    || (Array.isArray(data.locations) && data.locations.length > 0)
    || (Array.isArray(data.meetings) && data.meetings.length > 0)
    || (isRecord(data.animations) && Object.keys(data.animations).length > 0)
    || (Array.isArray(data.globalRoute) && data.globalRoute.length > 0);
  const authoredRoute = extension.authoredRoute ?? (hasRichRouteData ? data : null);
  return createNavigationModel({ version: 1, layers, nodes, links, areas, ...(authoredRoute ? { authoredRoute } : {}) });
}

const roundedPercent = (value, extent) => Math.round((finite(value) / Math.max(1, extent)) * 1000) / 10;

/**
 * Export the active Looplab graph in Path Editor v2 shape. Path Editor owns
 * percentage x/y; the `looplab` extension carries authored z, exact 2:1
 * projection, rich schedules, events, and integrity receipts so a Looplab ->
 * Path Editor -> Looplab handoff can be audited for information loss instead
 * of silently flattening or simplifying authored routes.
 */
export function exportPathEditorNavigation(input, map = {}) {
  const navigation = createNavigationModel(input);
  const width = Math.max(1, finite(map.width, 100));
  const height = Math.max(1, finite(map.height, 100));
  const layerHeights = Object.fromEntries(navigation.layers.map((layer) => [layer.id, { zMin: layer.zMin, zMax: layer.zMax }]));
  const nodeHeights = Object.fromEntries(navigation.nodes.map((node) => [node.id, node.z]));
  const areaHeights = Object.fromEntries(navigation.areas.map((area) => [area.id, { zMin: area.zMin, zMax: area.zMax }]));
  const authoredRoute = normalizeAuthoredRouteDocument(navigation.authoredRoute);
  const routeData = authoredRoute?.data ?? {};
  return {
    version: 2,
    id: String(map.id || "map-main"),
    image: { name: String(map.image?.name || `${map.id || "map-main"}.png`), w: width, h: height },
    layers: navigation.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      color: layer.color,
      visible: layer.visible !== false,
      zMin: layer.zMin,
      zMax: layer.zMax,
    })),
    nodes: navigation.nodes.map((node) => ({
      id: node.id,
      x: roundedPercent(node.x, width),
      y: roundedPercent(node.y, height),
      z: node.z,
      ...(node.layerId ? { layer: node.layerId } : {}),
      ...(node.destinationId ? { dest: node.destinationId } : {}),
      ...(node.tags?.length ? { tags: [...node.tags] } : {}),
    })),
    edges: navigation.links.map((link) => ({
      id: link.id,
      a: link.a,
      b: link.b,
      ...(link.layerId ? { layer: link.layerId } : {}),
      cost: link.cost,
      oneWay: link.oneWay === true,
    })),
    areas: navigation.areas.map((area) => ({
      id: area.id,
      name: area.name,
      kind: area.kind,
      ...(area.layerId ? { layer: area.layerId } : {}),
      zMin: area.zMin,
      zMax: area.zMax,
      points: area.points.map((point) => [roundedPercent(point.x, width), roundedPercent(point.y, height), finite(point.z, area.zMin)]),
    })),
    locations: Array.isArray(routeData.locations) ? cloneJson(routeData.locations) : [],
    characters: Array.isArray(routeData.characters) ? cloneJson(routeData.characters) : [],
    globalRoute: Array.isArray(routeData.globalRoute) ? cloneJson(routeData.globalRoute) : [],
    looplab: {
      version: 2,
      coordinatePolicy: "path-editor-percent-xy+looplab-world-z",
      projection: map.projection ?? { type: "orthographic", tileWidth: map.grid ?? 20, tileHeight: map.grid ?? 20 },
      layerHeights,
      nodeHeights,
      areaHeights,
      ...(authoredRoute ? {
        authoredRoute,
        authoredRoutePolicy: "lossless-source-document; material route edits stale hashes until measured replay or render evidence verifies the exact current digest",
      } : {}),
    },
  };
}
