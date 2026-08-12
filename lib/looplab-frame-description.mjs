import { normalizeProjection, projectWorldRect, worldToScreen } from "./looplab-spatial.mjs";
import { createRuntimeModel } from "./looplab-runtime-instance.mjs";

export const LOOPLAB_FRAME_DESCRIPTION_SCHEMA = "looplab-frame-description/v1";
export const LOOPLAB_FRAME_DESCRIPTION_LIMITS = Object.freeze({
  maximumEntries: 512,
  maximumFocusIds: 64,
  maximumOverlaps: 256,
  maximumHudIntrusions: 256,
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rounded(value) {
  return Number(finite(value).toFixed(3));
}

function rect(x, y, width, height) {
  return { x: rounded(x), y: rounded(y), width: rounded(Math.max(0, width)), height: rounded(Math.max(0, height)) };
}

function rectPolygon(bounds) {
  return [
    { x: bounds.x, y: bounds.y },
    { x: rounded(bounds.x + bounds.width), y: bounds.y },
    { x: rounded(bounds.x + bounds.width), y: rounded(bounds.y + bounds.height) },
    { x: bounds.x, y: rounded(bounds.y + bounds.height) },
  ];
}

function polygonBounds(points) {
  const xs = points.map((point) => finite(point.x));
  const ys = points.map((point) => finite(point.y));
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return rect(left, top, Math.max(...xs) - left, Math.max(...ys) - top);
}

function intersection(first, second) {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  if (right <= left || bottom <= top) return null;
  return rect(left, top, right - left, bottom - top);
}

function area(bounds) {
  return Math.max(0, finite(bounds?.width) * finite(bounds?.height));
}

function visibility(bounds, canvas) {
  const visible = intersection(bounds, canvas);
  const totalArea = area(bounds);
  const visibleArea = area(visible);
  const status = visibleArea <= 0 ? "offscreen" : visibleArea + 0.001 < totalArea ? "clipped" : "onscreen";
  return {
    status,
    visibleBounds: visible,
    visibleAreaRatio: totalArea > 0 ? rounded(visibleArea / totalArea) : 0,
  };
}

function objectPlacement(object, projection) {
  if (projection.type !== "dimetric-2:1") return { x: finite(object.x), y: finite(object.y) };
  const anchorX = finite(object.groundAnchor?.offsetX, finite(object.width) / 2);
  const anchorY = finite(object.groundAnchor?.offsetY, finite(object.height));
  const screen = worldToScreen({
    x: finite(object.x) + anchorX,
    y: finite(object.y) + anchorY,
    z: finite(object.z),
  }, projection);
  return { x: screen.x - anchorX, y: screen.y - anchorY };
}

function objectScreenGeometry(object, slice, asset, projection) {
  if (!asset && projection.type === "dimetric-2:1" && object.kind === "platform") {
    const points = projectWorldRect({
      x: finite(object.x),
      y: finite(object.y),
      width: finite(object.width),
      height: finite(object.height),
    }, projection, finite(object.z));
    const drop = finite(object.collisionHeight) > 0
      ? Math.max(5, finite(projection.elevationStep, 32) * Math.min(1, finite(object.collisionHeight, 1)))
      : 0;
    const polygon = points.map((point) => ({ x: rounded(point.x), y: rounded(point.y) }));
    if (drop > 0) {
      polygon.push(
        { x: rounded(points[3].x), y: rounded(points[3].y + drop) },
        { x: rounded(points[2].x), y: rounded(points[2].y + drop) },
      );
    }
    return { primitive: "dimetric-platform", bounds: polygonBounds(polygon), polygon };
  }

  const placement = objectPlacement(object, projection);
  const sourceTotal = Math.max(1, finite(asset?.frameHeight, finite(object.height, 1)));
  const sourceY = slice ? Math.max(0, Math.min(sourceTotal, finite(slice.sourceY))) : 0;
  const sourceHeight = slice
    ? Math.max(0, Math.min(sourceTotal - sourceY, finite(slice.height, sourceTotal)))
    : sourceTotal;
  const destinationOffsetY = slice ? sourceY / sourceTotal * finite(object.height) : 0;
  const destinationHeight = slice ? sourceHeight / sourceTotal * finite(object.height) : finite(object.height);
  const bounds = rect(placement.x, placement.y + destinationOffsetY, finite(object.width), destinationHeight);
  return { primitive: asset ? "asset-frame" : "canvas-primitive", bounds, polygon: rectPolygon(bounds) };
}

function collisionGeometry(object, projection) {
  if (object.collider?.enabled === false) return { enabled: false, bounds: null, polygon: null };
  const collider = object.collider ?? {};
  const world = {
    x: finite(object.x) + finite(collider.offsetX),
    y: finite(object.y) + finite(collider.offsetY),
    width: finite(collider.width, finite(object.width)),
    height: finite(collider.height, finite(object.height)),
  };
  if (projection.type !== "dimetric-2:1") {
    const bounds = rect(world.x, world.y, world.width, world.height);
    return {
      enabled: true,
      owner: object.collisionOwner ?? "authored-map",
      worldBounds: rect(world.x, world.y, world.width, world.height),
      zMin: finite(collider.zMin, finite(object.z)),
      zMax: finite(collider.zMax, finite(object.z) + finite(object.collisionHeight, 1)),
      bounds,
      polygon: rectPolygon(bounds),
    };
  }
  const zMin = finite(collider.zMin, finite(object.z));
  const polygon = projectWorldRect(world, projection, zMin).map((point) => ({ x: rounded(point.x), y: rounded(point.y) }));
  return {
    enabled: true,
    owner: object.collisionOwner ?? "authored-map",
    worldBounds: rect(world.x, world.y, world.width, world.height),
    zMin,
    zMax: finite(collider.zMax, zMin + finite(object.collisionHeight, 1)),
    bounds: polygonBounds(polygon),
    polygon,
  };
}

function focusSet(value) {
  const values = value === undefined ? [] : value;
  if (!Array.isArray(values) || values.length > LOOPLAB_FRAME_DESCRIPTION_LIMITS.maximumFocusIds) {
    throw new Error(`objectIds must contain at most ${LOOPLAB_FRAME_DESCRIPTION_LIMITS.maximumFocusIds} IDs.`);
  }
  const normalized = values.map((entry) => String(entry ?? "").trim());
  if (normalized.some((entry) => !entry || entry.length > 240)) throw new Error("objectIds must contain bounded non-empty IDs.");
  if (new Set(normalized).size !== normalized.length) throw new Error("objectIds must not contain duplicates.");
  return new Set(normalized);
}

function boundedLimit(value, label, maximum) {
  const resolved = value === undefined ? maximum : Number(value);
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > maximum) throw new Error(`${label} must be an integer from 1 through ${maximum}.`);
  return resolved;
}

export function describeSemanticFrame(project, options = {}) {
  const runtime = createRuntimeModel(clone(project));
  if (options.mapId !== undefined) {
    const mapId = String(options.mapId ?? "").trim();
    if (!mapId) throw new Error("mapId must be a non-empty string when provided.");
    if (!runtime.loadMap(mapId, null)) throw new Error(`Frame map could not load: ${mapId}.`);
  }
  runtime.drainEvents();
  const state = runtime.getState();
  const projection = normalizeProjection(state.projection, state);
  const canvas = rect(0, 0, state.width, state.height);
  const selectedMap = (project.maps?.length ? project.maps : [project]).find((map) => map.id === state.activeMapId) ?? project;
  const assets = new Map((project.assets ?? []).map((asset) => [asset.id, asset]));
  const requestedIds = focusSet(options.objectIds);
  const maximumEntries = boundedLimit(options.maximumEntries, "maximumEntries", LOOPLAB_FRAME_DESCRIPTION_LIMITS.maximumEntries);
  const maximumOverlaps = boundedLimit(options.maximumOverlaps, "maximumOverlaps", LOOPLAB_FRAME_DESCRIPTION_LIMITS.maximumOverlaps);
  const maximumHudIntrusions = boundedLimit(options.maximumHudIntrusions, "maximumHudIntrusions", LOOPLAB_FRAME_DESCRIPTION_LIMITS.maximumHudIntrusions);
  const includeCollision = options.includeCollision === true;
  const rendered = runtime.renderEntries();
  const filtered = requestedIds.size ? rendered.filter((entry) => requestedIds.has(String(entry.object.id))) : rendered;
  const selectedEntries = filtered.slice(0, maximumEntries);

  const entries = selectedEntries.map((entry, drawIndex) => {
    const object = entry.object;
    const asset = object.assetId ? assets.get(object.assetId) : null;
    const geometry = objectScreenGeometry(object, entry.slice, asset, projection);
    const anchorX = finite(object.groundAnchor?.offsetX, finite(object.width) / 2);
    const anchorY = finite(object.groundAnchor?.offsetY, finite(object.height));
    const screenAnchor = projection.type === "dimetric-2:1"
      ? worldToScreen({ x: finite(object.x) + anchorX, y: finite(object.y) + anchorY, z: finite(object.z) }, projection)
      : { x: finite(object.x) + anchorX, y: finite(object.y) + anchorY };
    return {
      drawIndex,
      objectId: String(object.id),
      sliceId: entry.slice?.id ? String(entry.slice.id) : null,
      name: String(object.name ?? object.id),
      kind: String(object.kind ?? "unknown"),
      role: object.role ? String(object.role) : null,
      assetId: object.assetId ? String(object.assetId) : null,
      depth: rounded(entry.depth),
      world: {
        x: rounded(object.x),
        y: rounded(object.y),
        z: rounded(object.z),
        width: rounded(object.width),
        height: rounded(object.height),
      },
      anchor: {
        mode: object.anchorMode ?? "center",
        world: { x: rounded(finite(object.x) + anchorX), y: rounded(finite(object.y) + anchorY), z: rounded(object.z) },
        screen: { x: rounded(screenAnchor.x), y: rounded(screenAnchor.y) },
      },
      primitive: geometry.primitive,
      screenBounds: geometry.bounds,
      screenPolygon: geometry.polygon,
      visibility: visibility(geometry.bounds, canvas),
      opacity: rounded(object.opacity ?? 1),
      ...(includeCollision ? { collision: collisionGeometry(object, projection) } : {}),
    };
  });

  const overlaps = [];
  let totalOverlapCount = 0;
  for (let firstIndex = 0; firstIndex < entries.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < entries.length; secondIndex += 1) {
      const first = entries[firstIndex];
      const second = entries[secondIndex];
      if (first.objectId === second.objectId) continue;
      const overlap = intersection(first.screenBounds, second.screenBounds);
      if (!overlap) continue;
      totalOverlapCount += 1;
      if (overlaps.length >= maximumOverlaps) continue;
      overlaps.push({
        behindObjectId: first.objectId,
        behindSliceId: first.sliceId,
        frontObjectId: second.objectId,
        frontSliceId: second.sliceId,
        bounds: overlap,
        area: rounded(area(overlap)),
        smallerEntryCoverage: rounded(area(overlap) / Math.max(1, Math.min(area(first.screenBounds), area(second.screenBounds)))),
        claim: "screen-bounds-overlap-only",
      });
    }
  }

  const hudSafeAreas = (selectedMap.hudSafeAreas ?? project.hudSafeAreas ?? []).map((safeArea) => ({
    id: String(safeArea.id ?? "hud-safe-area"),
    name: String(safeArea.name ?? safeArea.id ?? "HUD safe area"),
    bounds: rect(safeArea.x, safeArea.y, safeArea.width, safeArea.height),
  }));
  const hudIntrusions = [];
  let totalHudIntrusionCount = 0;
  for (const entry of entries) {
    const object = runtime.getObjects().find((candidate) => String(candidate.id) === entry.objectId);
    if (!object || object.allowHudOverlap === true || object.kind === "decor") continue;
    for (const safeArea of hudSafeAreas) {
      const overlap = intersection(entry.screenBounds, safeArea.bounds);
      if (!overlap) continue;
      totalHudIntrusionCount += 1;
      if (hudIntrusions.length >= maximumHudIntrusions) continue;
      hudIntrusions.push({
        objectId: entry.objectId,
        sliceId: entry.sliceId,
        safeAreaId: safeArea.id,
        bounds: overlap,
        area: rounded(area(overlap)),
      });
    }
  }

  const hiddenOrCollectedCount = runtime.getObjects().filter((object) => object.hidden || object.collected).length;
  const missingFocusIds = requestedIds.size
    ? [...requestedIds].filter((id) => !runtime.getObjects().some((object) => String(object.id) === id))
    : [];

  return {
    schemaVersion: LOOPLAB_FRAME_DESCRIPTION_SCHEMA,
    sourceDigest: options.sourceDigest ?? null,
    runtimeState: "deterministic-initial-frame",
    map: { id: state.activeMapId, name: state.mapName },
    logicalCanvas: canvas,
    projection,
    scene: {
      entryCount: entries.length,
      totalRenderedEntryCount: rendered.length,
      filteredRenderedEntryCount: filtered.length,
      truncatedEntryCount: Math.max(0, filtered.length - entries.length),
      hiddenOrCollectedObjectCount: hiddenOrCollectedCount,
      entries,
    },
    overlapReport: {
      count: overlaps.length,
      totalCount: totalOverlapCount,
      truncatedCount: Math.max(0, totalOverlapCount - overlaps.length),
      overlaps,
      policy: "Rectangle overlap is a review target, not proof of an occlusion defect.",
    },
    hudReport: {
      safeAreas: hudSafeAreas,
      intrusionCount: hudIntrusions.length,
      totalIntrusionCount: totalHudIntrusionCount,
      truncatedCount: Math.max(0, totalHudIntrusionCount - hudIntrusions.length),
      intrusions: hudIntrusions,
    },
    focus: {
      requestedObjectIds: [...requestedIds],
      missingObjectIds: missingFocusIds,
    },
    unavailable: {
      pixels: "No browser pixel buffer was supplied. Use capture_visual_review for pixel statistics, screenshots, or responsive DOM evidence.",
      presentationTransforms: "Event-driven shake, squash, particles, audio, and transition overlays are not applied to this deterministic initial-frame geometry.",
      responsiveLayout: "Logical canvas bounds do not prove CSS containment, touch-control visibility, or real viewport/DPR behavior.",
    },
    proofBoundary: "Read-only semantic geometry from the canonical deterministic runtime and exported renderer formulas. It is not visual, browser, acceptance, replay, or release evidence.",
  };
}
