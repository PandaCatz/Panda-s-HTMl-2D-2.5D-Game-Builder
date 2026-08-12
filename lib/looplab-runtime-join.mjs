export const LOOPLAB_RUNTIME_JOIN_SCHEMA_VERSION = "looplab-runtime-join/v1";

const VALID_EDGES = new Set(["left", "right", "top", "bottom"]);
const VALID_MODES = new Set(["portal", "continuous"]);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value)));

function routeMaps(project) {
  if (Array.isArray(project?.maps) && project.maps.length) return project.maps;
  return [{
    id: project?.activeMapId ?? project?.startMapId ?? "map-main",
    name: project?.name ?? "Main map",
    width: Number(project?.width ?? 960),
    height: Number(project?.height ?? 540),
    objects: Array.isArray(project?.objects) ? project.objects : [],
  }];
}

export function nearestRuntimeJoinEdge(object, map) {
  const centerX = Number(object?.x ?? 0) + Number(object?.width ?? 0) / 2;
  const centerY = Number(object?.y ?? 0) + Number(object?.height ?? 0) / 2;
  const distances = [
    ["left", Math.abs(centerX)],
    ["right", Math.abs(Number(map?.width ?? 0) - centerX)],
    ["top", Math.abs(centerY)],
    ["bottom", Math.abs(Number(map?.height ?? 0) - centerY)],
  ];
  distances.sort((first, second) => first[1] - second[1] || first[0].localeCompare(second[0]));
  return distances[0][0];
}

export function createRuntimeJoinContract({ sourceMap, targetMap, portal, targetSpawn, overrides = {} } = {}) {
  const requested = overrides && typeof overrides === "object" && !Array.isArray(overrides) ? overrides : {};
  const mode = VALID_MODES.has(requested.mode) ? requested.mode : "portal";
  return {
    version: 1,
    enabled: requested.enabled !== false,
    mode,
    sourceEdge: VALID_EDGES.has(requested.sourceEdge) ? requested.sourceEdge : portal && sourceMap ? nearestRuntimeJoinEdge(portal, sourceMap) : "right",
    targetEdge: VALID_EDGES.has(requested.targetEdge) ? requested.targetEdge : targetSpawn && targetMap ? nearestRuntimeJoinEdge(targetSpawn, targetMap) : "left",
    overlapPixels: Math.max(0, Math.trunc(Number(requested.overlapPixels ?? 0))),
    sampleDepth: Math.max(1, Math.trunc(Number(requested.sampleDepth ?? 8))),
    minimumUniquePixelRatio: clamp(requested.minimumUniquePixelRatio ?? 0.01, 0, 1),
    maximumBoundaryColorDelta: clamp(requested.maximumBoundaryColorDelta ?? (mode === "continuous" ? 0.35 : 1), 0, 1),
    requireExactSpawn: requested.requireExactSpawn !== false,
    requireClearLanding: requested.requireClearLanding !== false,
  };
}

export function buildRuntimeJoinPlan(project) {
  const maps = routeMaps(project);
  const mapById = new Map(maps.map((map) => [map.id, map]));
  const joins = [];
  const issues = [];
  for (const sourceMap of maps) {
    for (const portal of (sourceMap.objects ?? []).filter((object) => object?.kind === "portal" && object?.runtimeJoin?.enabled === true)) {
      const context = { mapId: sourceMap.id, objectId: portal.id, targetMapId: portal.targetMapId, targetSpawnId: portal.targetSpawnId };
      const targetMap = mapById.get(portal.targetMapId);
      if (!targetMap) {
        issues.push({ severity: "error", code: "runtime-join-target-map", message: `${portal.name ?? portal.id} cannot validate a missing destination map.`, ...context });
        continue;
      }
      const targetSpawn = (targetMap.objects ?? []).find((object) => object.kind === "spawn" && object.id === portal.targetSpawnId);
      if (!targetSpawn) {
        issues.push({ severity: "error", code: "runtime-join-target-spawn", message: `${portal.name ?? portal.id} cannot validate a missing exact destination spawn.`, ...context });
        continue;
      }
      const raw = portal.runtimeJoin;
      if (raw.version !== undefined && Number(raw.version) !== 1) issues.push({ severity: "error", code: "runtime-join-version", message: `${portal.name ?? portal.id} uses an unsupported runtime-join contract version.`, ...context });
      if (raw.mode !== undefined && !VALID_MODES.has(raw.mode)) issues.push({ severity: "error", code: "runtime-join-mode", message: `${portal.name ?? portal.id} uses an unsupported runtime-join mode.`, ...context });
      if (raw.sourceEdge !== undefined && !VALID_EDGES.has(raw.sourceEdge)) issues.push({ severity: "error", code: "runtime-join-source-edge", message: `${portal.name ?? portal.id} has an invalid source edge.`, ...context });
      if (raw.targetEdge !== undefined && !VALID_EDGES.has(raw.targetEdge)) issues.push({ severity: "error", code: "runtime-join-target-edge", message: `${portal.name ?? portal.id} has an invalid target edge.`, ...context });
      for (const field of ["overlapPixels", "sampleDepth", "minimumUniquePixelRatio", "maximumBoundaryColorDelta"]) {
        if (raw[field] !== undefined && !Number.isFinite(Number(raw[field]))) issues.push({ severity: "error", code: `runtime-join-${field}`, message: `${portal.name ?? portal.id} has a non-finite ${field} value.`, ...context });
      }
      const contract = createRuntimeJoinContract({ sourceMap, targetMap, portal, targetSpawn, overrides: raw });
      joins.push({
        id: `join:${sourceMap.id}:${portal.id}`,
        portalId: portal.id,
        portalName: portal.name ?? portal.id,
        sourceMapId: sourceMap.id,
        sourceMapName: sourceMap.name ?? sourceMap.id,
        targetMapId: targetMap.id,
        targetMapName: targetMap.name ?? targetMap.id,
        targetSpawnId: targetSpawn.id,
        transition: portal.transition ?? "fade",
        contract,
      });
    }
  }
  return {
    schemaVersion: "looplab-runtime-join-plan/v1",
    status: issues.some((issue) => issue.severity === "error") ? "invalid" : joins.length ? "ready" : "not-configured",
    joinCount: joins.length,
    joins,
    issues,
  };
}

function validateFrame(frame, label) {
  const width = Math.trunc(Number(frame?.width));
  const height = Math.trunc(Number(frame?.height));
  const pixels = frame?.pixels ?? frame?.data;
  if (width <= 0 || height <= 0 || !(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * 4) {
    throw new Error(`${label} must contain width × height RGBA pixels.`);
  }
  return { width, height, pixels };
}

function pixelDifferenceRatio(first, second, threshold = 12) {
  const pixelCount = Math.min(first.length, second.length) / 4;
  let changed = 0;
  for (let offset = 0; offset < pixelCount * 4; offset += 4) {
    const difference = Math.abs(first[offset] - second[offset]) + Math.abs(first[offset + 1] - second[offset + 1]) + Math.abs(first[offset + 2] - second[offset + 2]) + Math.abs(first[offset + 3] - second[offset + 3]);
    if (difference > threshold) changed += 1;
  }
  return pixelCount ? changed / pixelCount : 0;
}

function bandPixels(frame, edge, offset, depth) {
  const inward = Math.max(0, Math.trunc(offset));
  const thickness = Math.max(1, Math.trunc(depth));
  const values = [];
  if (edge === "left" || edge === "right") {
    const startX = edge === "left" ? Math.min(frame.width - 1, inward) : Math.max(0, frame.width - inward - thickness);
    const endX = Math.min(frame.width, startX + thickness);
    for (let y = 0; y < frame.height; y += 1) for (let x = startX; x < endX; x += 1) {
      const index = (y * frame.width + x) * 4;
      values.push(frame.pixels[index], frame.pixels[index + 1], frame.pixels[index + 2], frame.pixels[index + 3]);
    }
  } else {
    const startY = edge === "top" ? Math.min(frame.height - 1, inward) : Math.max(0, frame.height - inward - thickness);
    const endY = Math.min(frame.height, startY + thickness);
    for (let y = startY; y < endY; y += 1) for (let x = 0; x < frame.width; x += 1) {
      const index = (y * frame.width + x) * 4;
      values.push(frame.pixels[index], frame.pixels[index + 1], frame.pixels[index + 2], frame.pixels[index + 3]);
    }
  }
  return Uint8ClampedArray.from(values);
}

function averageColor(pixels) {
  const result = [0, 0, 0, 0];
  const pixelCount = pixels.length / 4;
  for (let offset = 0; offset < pixels.length; offset += 4) for (let channel = 0; channel < 4; channel += 1) result[channel] += pixels[offset + channel];
  return result.map((value) => pixelCount ? value / pixelCount : 0);
}

function normalizedColorDelta(first, second) {
  const firstColor = averageColor(first);
  const secondColor = averageColor(second);
  const squared = [0, 1, 2].reduce((total, channel) => total + (firstColor[channel] - secondColor[channel]) ** 2, 0);
  return Math.sqrt(squared) / (Math.sqrt(3) * 255);
}

/**
 * @typedef {{ width: number, height: number, pixels?: Uint8Array | Uint8ClampedArray, data?: Uint8Array | Uint8ClampedArray }} RuntimeJoinPixelFrame
 */

/**
 * @param {{ sourceFrame?: RuntimeJoinPixelFrame, targetFrame?: RuntimeJoinPixelFrame, contract?: Record<string, unknown> }} [input]
 */
export function analyzeRuntimeJoinPixels({ sourceFrame, targetFrame, contract: requestedContract = {} } = {}) {
  const source = validateFrame(sourceFrame, "sourceFrame");
  const target = validateFrame(targetFrame, "targetFrame");
  if (source.width !== target.width || source.height !== target.height) throw new Error("Runtime-join frames must use the same capture dimensions.");
  const contract = createRuntimeJoinContract({ overrides: requestedContract });
  const sourceTail = bandPixels(source, contract.sourceEdge, 0, contract.sampleDepth);
  const targetEntry = bandPixels(target, contract.targetEdge, 0, contract.sampleDepth);
  const targetExtent = contract.targetEdge === "left" || contract.targetEdge === "right" ? target.width : target.height;
  const maximumOffset = Math.max(0, targetExtent - contract.sampleDepth);
  const uniqueOffset = Math.min(maximumOffset, contract.overlapPixels + contract.sampleDepth);
  const targetUniqueStart = bandPixels(target, contract.targetEdge, uniqueOffset, contract.sampleDepth);
  const changedPixelRatio = pixelDifferenceRatio(source.pixels, target.pixels);
  const targetUniquePixelRatio = contract.mode === "portal" && contract.overlapPixels === 0
    ? changedPixelRatio
    : pixelDifferenceRatio(targetEntry, targetUniqueStart);
  const boundaryColorDelta = normalizedColorDelta(sourceTail, targetEntry);
  const checks = [
    { id: "visible-runtime-change", passed: changedPixelRatio >= contract.minimumUniquePixelRatio, detail: `${(changedPixelRatio * 100).toFixed(2)}% of environment pixels changed across the actual runtime join.` },
    { id: "next-unique-content", passed: targetUniquePixelRatio >= contract.minimumUniquePixelRatio, detail: contract.mode === "portal" && contract.overlapPixels === 0 ? `${(targetUniquePixelRatio * 100).toFixed(2)}% unique environment pixels were measured after the zero-overlap portal transition.` : `${(targetUniquePixelRatio * 100).toFixed(2)}% unique pixels were measured beyond the declared ${contract.overlapPixels}px overlap and incoming edge sample.` },
    { id: "boundary-color-continuity", passed: boundaryColorDelta <= contract.maximumBoundaryColorDelta, detail: `Boundary color delta ${boundaryColorDelta.toFixed(4)}; maximum ${contract.maximumBoundaryColorDelta.toFixed(4)}.` },
  ];
  return {
    schemaVersion: LOOPLAB_RUNTIME_JOIN_SCHEMA_VERSION,
    status: checks.every((check) => check.passed) ? "passed" : "failed",
    passed: checks.every((check) => check.passed),
    capture: { width: source.width, height: source.height },
    contract,
    metrics: { changedPixelRatio, targetUniquePixelRatio, boundaryColorDelta },
    checks,
  };
}
