const SUPPORT_REQUIRED_ROLES = new Set([
  "barrier",
  "bench",
  "building",
  "kiosk",
  "ledge",
  "lamp",
  "prop",
  "rail",
  "ramp",
  "terrain",
  "vending-machine",
]);

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const overlaps1d = (firstStart, firstLength, secondStart, secondLength, tolerance = 0) =>
  firstStart < secondStart + secondLength + tolerance &&
  firstStart + firstLength > secondStart - tolerance;

export function collisionRectFor(object) {
  if (!object?.collider || object.collider.enabled === false) return null;
  return {
    x: finite(object.x) + finite(object.collider.offsetX),
    y: finite(object.y) + finite(object.collider.offsetY),
    width: finite(object.collider.width, finite(object.width, 1)),
    height: finite(object.collider.height, finite(object.height, 1)),
    zMin: finite(object.collider.zMin, finite(object.z)),
    zMax: finite(object.collider.zMax, finite(object.z) + finite(object.collisionHeight, 1)),
  };
}

export function visualRectFor(object) {
  const visual = object?.visualBounds;
  return visual
    ? {
        x: finite(object.x) + finite(visual.offsetX),
        y: finite(object.y) + finite(visual.offsetY),
        width: finite(visual.width, finite(object.width, 1)),
        height: finite(visual.height, finite(object.height, 1)),
      }
    : {
        x: finite(object?.x),
        y: finite(object?.y),
        width: finite(object?.width, 1),
        height: finite(object?.height, 1),
      };
}

function normalizedAssetAnchor(value, frameSize, renderedSize, fallbackRatio) {
  if (!Number.isFinite(Number(value))) return renderedSize * fallbackRatio;
  const anchor = Number(value);
  if (anchor >= 0 && anchor <= 1) return anchor * renderedSize;
  return frameSize > 0 ? (anchor / frameSize) * renderedSize : renderedSize * fallbackRatio;
}

export function groundAnchorOffset(object, assets = []) {
  if (object?.groundAnchor && Number.isFinite(Number(object.groundAnchor.offsetX)) && Number.isFinite(Number(object.groundAnchor.offsetY))) {
    return { x: Number(object.groundAnchor.offsetX), y: Number(object.groundAnchor.offsetY), source: "object" };
  }
  const asset = object?.assetId ? assets.find((candidate) => candidate.id === object.assetId) : null;
  if (asset) {
    return {
      x: normalizedAssetAnchor(asset.anchorX, finite(asset.frameWidth, 1), finite(object.width, 1), 0.5),
      y: normalizedAssetAnchor(asset.anchorY, finite(asset.frameHeight, 1), finite(object.height, 1), 1),
      source: "asset",
    };
  }
  const visual = visualRectFor(object);
  return {
    x: visual.x - finite(object?.x) + visual.width / 2,
    y: visual.y - finite(object?.y) + visual.height,
    source: "visual-bounds",
  };
}

export function groundAnchorPoint(object, assets = []) {
  const offset = groundAnchorOffset(object, assets);
  return { x: finite(object?.x) + offset.x, y: finite(object?.y) + offset.y, source: offset.source };
}

export function supportFootprintRect(object) {
  const footprint = object?.supportFootprint;
  if (footprint) {
    return {
      x: finite(object.x) + finite(footprint.offsetX),
      y: finite(object.y) + finite(footprint.offsetY),
      width: finite(footprint.width, 1),
      height: finite(footprint.height, 1),
    };
  }
  const collider = collisionRectFor(object);
  if (collider) return { x: collider.x, y: collider.y, width: collider.width, height: collider.height };
  const visual = visualRectFor(object);
  const width = Math.max(1, visual.width * 0.6);
  return {
    x: visual.x + (visual.width - width) / 2,
    y: visual.y + visual.height - Math.max(1, visual.height * 0.1),
    width,
    height: Math.max(1, visual.height * 0.1),
  };
}

export function needsSurfaceSupport(object) {
  if (object?.requiresSupport === true) return true;
  if (object?.requiresSupport === false) return false;
  return SUPPORT_REQUIRED_ROLES.has(String(object?.role ?? ""));
}

function isPlanarMap(map, projection) {
  return map?.controlMode === "topdown" || projection?.type === "dimetric-2:1";
}

function isSupportSurface(object) {
  const collider = collisionRectFor(object);
  return Boolean(collider && (object?.solid === true || object?.collider?.oneWay === true || object?.role === "terrain"));
}

/**
 * @typedef {{ id: string, name: string, kind: string, role: string | null, x: number, y: number, width: number, height: number, zMin: number, zMax: number }} SupportSurface
 */

/**
 * @param {{ objects?: any[] } | null | undefined} map
 * @param {string | null} [objectId]
 * @returns {SupportSurface[]}
 */
export function listSupportSurfaces(map, objectId = null) {
  return (map?.objects ?? [])
    .filter((object) => object.id !== objectId && isSupportSurface(object))
    .map((object) => {
      const collider = collisionRectFor(object);
      return {
        id: object.id,
        name: object.name,
        kind: object.kind,
        role: object.role ?? null,
        x: collider.x,
        y: collider.y,
        width: collider.width,
        height: collider.height,
        zMin: collider.zMin,
        zMax: collider.zMax,
      };
    });
}

export function findBestSupportSurface(map, object, { projection, tolerance = 2 } = {}) {
  const surfaces = listSupportSurfaces(map, object?.id);
  const footprint = supportFootprintRect(object);
  const anchor = groundAnchorPoint(object);
  if (isPlanarMap(map, projection)) {
    return surfaces
      .filter((surface) =>
        overlaps1d(footprint.x, footprint.width, surface.x, surface.width, tolerance) &&
        overlaps1d(footprint.y, footprint.height, surface.y, surface.height, tolerance))
      .sort((first, second) => second.zMax - first.zMax)[0] ?? null;
  }
  const horizontallySupporting = surfaces.filter((surface) => overlaps1d(footprint.x, footprint.width, surface.x, surface.width, tolerance));
  return horizontallySupporting
    .map((surface) => ({ ...surface, distance: surface.y - anchor.y }))
    .filter((surface) => surface.distance >= -tolerance)
    .sort((first, second) => first.distance - second.distance)[0] ?? null;
}

export function resolveSupportContact(map, object, assets = [], { projection } = {}) {
  const contact = object?.supportContact;
  const tolerance = Math.max(0, finite(contact?.tolerance, 2));
  const offset = finite(contact?.offset);
  const anchor = groundAnchorPoint(object, assets);
  const footprint = supportFootprintRect(object);
  const planar = isPlanarMap(map, projection);

  if (!contact || contact.mode === "free") {
    return {
      valid: !needsSurfaceSupport(object),
      status: needsSurfaceSupport(object) ? "missing" : "free",
      tolerance,
      anchor,
      footprint,
      support: null,
      gap: null,
      overlap: true,
    };
  }

  if (object.anchorMode !== "ground") {
    return { valid: false, status: "anchor", tolerance, anchor, footprint, support: null, gap: null, overlap: true };
  }

  if (contact.mode === "floor") {
    const expected = planar ? offset : finite(map?.floorY, finite(map?.height)) - offset;
    const actual = planar ? finite(object.z) : anchor.y;
    const gap = actual - expected;
    return {
      valid: Math.abs(gap) <= tolerance && finite(object.supportZ, finite(object.z)) === finite(object.z),
      status: Math.abs(gap) <= tolerance ? "attached" : "gap",
      tolerance,
      anchor,
      footprint,
      support: { id: "floor", name: "Map floor", zMax: planar ? offset : finite(object.z) },
      expected,
      actual,
      gap,
      overlap: true,
    };
  }

  const supportObject = (map?.objects ?? []).find((candidate) => candidate.id === contact.surfaceId);
  if (!supportObject) return { valid: false, status: "missing-surface", tolerance, anchor, footprint, support: null, gap: null, overlap: false };
  const support = collisionRectFor(supportObject);
  if (!support || !isSupportSurface(supportObject)) return { valid: false, status: "invalid-surface", tolerance, anchor, footprint, support: supportObject, gap: null, overlap: false };

  const overlap = planar
    ? overlaps1d(footprint.x, footprint.width, support.x, support.width, tolerance) && overlaps1d(footprint.y, footprint.height, support.y, support.height, tolerance)
    : overlaps1d(footprint.x, footprint.width, support.x, support.width, tolerance);
  const expected = planar ? support.zMax + offset : support.y - offset;
  const actual = planar ? finite(object.z) : anchor.y;
  const gap = actual - expected;
  const zMatches = finite(object.supportZ, finite(object.z)) === finite(object.z);
  return {
    valid: overlap && Math.abs(gap) <= tolerance && zMatches,
    status: !overlap ? "outside-footprint" : Math.abs(gap) > tolerance ? "gap" : !zMatches ? "height" : "attached",
    tolerance,
    anchor,
    footprint,
    support: { id: supportObject.id, name: supportObject.name, ...support },
    expected,
    actual,
    gap,
    overlap,
  };
}

export function snapObjectToSupport(map, objectId, options = {}, assets = []) {
  const source = (map?.objects ?? []).find((object) => object.id === objectId);
  if (!source) throw new Error(`Object was not found: ${String(objectId)}`);
  const projection = options.projection;
  const requestedMode = options.mode ?? "auto";
  if (!['auto', 'floor', 'surface', 'free'].includes(requestedMode)) throw new Error("Support mode must be auto, floor, surface, or free.");
  if (requestedMode === "free") {
    const object = { ...source, requiresSupport: false, supportContact: { mode: "free", tolerance: Math.max(0, finite(options.tolerance, 2)), offset: finite(options.offset) } };
    return { object, contact: resolveSupportContact(map, object, assets, { projection }), surface: null };
  }

  const best = options.surfaceId
    ? listSupportSurfaces(map, source.id).find((surface) => surface.id === options.surfaceId) ?? null
    : findBestSupportSurface(map, source, { projection, tolerance: options.tolerance });
  const mode = requestedMode === "auto" ? (best ? "surface" : "floor") : requestedMode;
  if (mode === "surface" && !best) throw new Error(options.surfaceId ? `Support surface was not found: ${options.surfaceId}` : "No support surface overlaps or sits below this object.");

  let object = {
    ...source,
    anchorMode: "ground",
    requiresSupport: true,
    supportContact: {
      mode,
      ...(mode === "surface" ? { surfaceId: best.id } : {}),
      offset: finite(options.offset),
      tolerance: Math.max(0, finite(options.tolerance, 2)),
    },
  };
  const before = resolveSupportContact(map, object, assets, { projection });
  if (isPlanarMap(map, projection)) {
    const nextZ = finite(before.expected);
    const collisionHeight = finite(object.collisionHeight, Math.max(1, finite(object.collider?.zMax, finite(object.z) + 1) - finite(object.collider?.zMin, finite(object.z))));
    object = {
      ...object,
      z: nextZ,
      supportZ: nextZ,
      collider: object.collider ? { ...object.collider, zMin: nextZ, zMax: nextZ + collisionHeight } : object.collider,
    };
  } else {
    object = {
      ...object,
      y: finite(object.y) - finite(before.gap),
      z: mode === "surface" ? finite((map.objects ?? []).find((candidate) => candidate.id === best.id)?.z) : 0,
      supportZ: mode === "surface" ? finite((map.objects ?? []).find((candidate) => candidate.id === best.id)?.supportZ, finite((map.objects ?? []).find((candidate) => candidate.id === best.id)?.z)) : 0,
    };
    if (object.collider) {
      const collisionHeight = finite(object.collisionHeight, Math.max(1, finite(object.collider.zMax, finite(object.z) + 1) - finite(object.collider.zMin, finite(object.z))));
      object.collider = { ...object.collider, zMin: object.z, zMax: object.z + collisionHeight };
    }
  }
  const nextMap = { ...map, objects: map.objects.map((candidate) => candidate.id === objectId ? object : candidate) };
  return { object, contact: resolveSupportContact(nextMap, object, assets, { projection }), surface: best };
}
