import { needsSurfaceSupport, resolveSupportContact } from "./looplab-support.mjs";
import { analyzeNavigationMap } from "./looplab-navigation.mjs";

export const DEFAULT_DIMETRIC_PROJECTION = {
  type: "dimetric-2:1",
  tileWidth: 128,
  tileHeight: 64,
  elevationStep: 32,
  originX: 480,
  originY: 96,
  worldUnitsPerTile: 128,
};
/**
 * @typedef {object} ProjectionLike
 * @property {string=} type
 * @property {number=} tileWidth
 * @property {number=} tileHeight
 * @property {number=} elevationStep
 * @property {number=} originX
 * @property {number=} originY
 * @property {number=} worldUnitsPerTile
 */

/** @typedef {{ width?: number, height?: number, grid?: number }} ProjectionViewport */
/** @typedef {{ x: number, y: number, z?: number }} WorldPoint */
/** @typedef {{ x: number, y: number, width: number, height: number }} WorldRect */
export function assetGroundAnchorTouchesBottom(asset, tolerancePixels = 2) {
  const frameHeight = Number(asset?.frameHeight);
  const anchorY = Number(asset?.anchorY);
  if (!Number.isFinite(frameHeight) || frameHeight <= 0 || !Number.isFinite(anchorY)) return false;
  if (anchorY >= 0 && anchorY <= 1) return Math.abs(1 - anchorY) * frameHeight <= tolerancePixels;
  return Math.abs(anchorY - (frameHeight - 1)) <= tolerancePixels;
}

/**
 * @param {ProjectionLike} [projection]
 * @param {ProjectionViewport} [viewport]
 */
export function normalizeProjection(projection = {}, viewport = {}) {
  if (projection.type !== "dimetric-2:1") {
    const tile = Number.isFinite(Number(projection.tileWidth)) ? Number(projection.tileWidth) : Number(viewport.grid ?? 20);
    return { type: "orthographic", tileWidth: tile, tileHeight: Number(projection.tileHeight ?? tile) };
  }
  return {
    type: "dimetric-2:1",
    tileWidth: 128,
    tileHeight: 64,
    elevationStep: Number.isFinite(Number(projection.elevationStep)) ? Number(projection.elevationStep) : 32,
    originX: Number.isFinite(Number(projection.originX)) ? Number(projection.originX) : Number(viewport.width ?? 960) / 2,
    originY: Number.isFinite(Number(projection.originY)) ? Number(projection.originY) : 96,
    worldUnitsPerTile: Number.isFinite(Number(projection.worldUnitsPerTile)) && Number(projection.worldUnitsPerTile) > 0 ? Number(projection.worldUnitsPerTile) : 128,
  };
}

/**
 * @param {WorldPoint} point
 * @param {ProjectionLike} [projection]
 */
export function worldToScreen(point, projection = DEFAULT_DIMETRIC_PROJECTION) {
  if (projection.type !== "dimetric-2:1") return { x: point.x, y: point.y - (point.z ?? 0) };
  const normalized = normalizeProjection(projection);
  const halfWidth = normalized.tileWidth / 2 / normalized.worldUnitsPerTile;
  const halfHeight = normalized.tileHeight / 2 / normalized.worldUnitsPerTile;
  return {
    x: normalized.originX + (point.x - point.y) * halfWidth,
    y: normalized.originY + (point.x + point.y) * halfHeight - (point.z ?? 0) * normalized.elevationStep,
  };
}

/**
 * @param {{ x: number, y: number }} point
 * @param {ProjectionLike} [projection]
 * @param {number} [z]
 */
export function screenToWorld(point, projection = DEFAULT_DIMETRIC_PROJECTION, z = 0) {
  if (projection.type !== "dimetric-2:1") return { x: point.x, y: point.y, z };
  const normalized = normalizeProjection(projection);
  const normalizedX = (point.x - normalized.originX) / (normalized.tileWidth / 2) * normalized.worldUnitsPerTile;
  const normalizedY = (point.y + z * normalized.elevationStep - normalized.originY) / (normalized.tileHeight / 2) * normalized.worldUnitsPerTile;
  return {
    x: (normalizedX + normalizedY) / 2,
    y: (normalizedY - normalizedX) / 2,
    z,
  };
}

/**
 * @param {{ x?: number, y?: number, width?: number, height?: number, worldX?: number, worldY?: number, z?: number, depthLayer?: number, depthBias?: number, groundAnchor?: { offsetX?: number, offsetY?: number } }} object
 * @param {ProjectionLike} [projection]
 */
export function depthKey(object, projection = DEFAULT_DIMETRIC_PROJECTION) {
  const worldX = object.worldX ?? (object.x ?? 0) + (object.groundAnchor?.offsetX ?? (object.width ?? 0) / 2);
  const worldY = object.worldY ?? (object.y ?? 0) + (object.groundAnchor?.offsetY ?? object.height ?? 0);
  const z = object.z ?? 0;
  const layer = object.depthLayer ?? 0;
  const bias = object.depthBias ?? 0;
  if (projection.type !== "dimetric-2:1") return layer * 1_000_000 + (object.y ?? 0) + (object.height ?? 0) + bias;
  return layer * 1_000_000_000 + (worldX + worldY) * 1024 + z * 32 + bias;
}

/**
 * @param {WorldRect} rect
 * @param {ProjectionLike} [projection]
 * @param {number} [z]
 */
export function projectWorldRect(rect, projection = DEFAULT_DIMETRIC_PROJECTION, z = 0) {
  return [
    worldToScreen({ x: rect.x, y: rect.y, z }, projection),
    worldToScreen({ x: rect.x + rect.width, y: rect.y, z }, projection),
    worldToScreen({ x: rect.x + rect.width, y: rect.y + rect.height, z }, projection),
    worldToScreen({ x: rect.x, y: rect.y + rect.height, z }, projection),
  ];
}

const rectsOverlap = (a, b) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

const overlapArea = (a, b) => {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
};

const collisionRect = (object) => {
  if (object.collider?.enabled === false) return null;
  const collider = object.collider ?? { offsetX: 0, offsetY: 0, width: object.width, height: object.height };
  return {
    x: (object.x ?? 0) + (collider.offsetX ?? 0),
    y: (object.y ?? 0) + (collider.offsetY ?? 0),
    width: collider.width ?? object.width,
    height: collider.height ?? object.height,
    zMin: collider.zMin ?? object.z ?? 0,
    zMax: collider.zMax ?? (object.z ?? 0) + (object.collisionHeight ?? 1),
  };
};

const visualRect = (object) => {
  const visual = object.visualBounds;
  return visual
    ? { x: object.x + visual.offsetX, y: object.y + visual.offsetY, width: visual.width, height: visual.height }
    : { x: object.x, y: object.y, width: object.width, height: object.height };
};

const zOverlaps = (a, b) => a.zMin < b.zMax && a.zMax > b.zMin;

function mapsFor(project) {
  if (project.maps?.length) return project.maps;
  return [{
    id: project.activeMapId ?? "map-main",
    name: "Main map",
    width: project.width,
    height: project.height,
    background: project.background,
    gravity: project.gravity,
    grid: project.grid,
    controlMode: project.controlMode,
    projection: project.projection,
    navigation: project.navigation,
    objects: project.objects ?? [],
    worldStream: project.worldStream,
    clearanceZones: project.clearanceZones ?? [],
  }];
}

function assetBytes(asset) {
  if (typeof asset.dataUrl !== "string") return 0;
  const base64 = asset.dataUrl.split(",")[1] ?? "";
  return Math.floor(base64.length * 0.75);
}

export function analyzeSpatialProject(project) {
  const issues = [];
  const add = (severity, code, message, context = {}) => issues.push({ severity, code, message, ...context });
  const projectProjection = normalizeProjection(project.projection ?? { type: "orthographic", tileWidth: project.grid, tileHeight: project.grid }, project);
  const maps = mapsFor(project);
  const mapIds = new Set(maps.map((map) => map.id));
  const worldStreamGroups = maps
    .filter((map) => map?.worldStream?.enabled !== false && Array.isArray(map?.worldStream?.templates) && map.worldStream.templates.length)
    .map((host) => ({
      hostMapId: host.id,
      templateMapIds: new Set(host.worldStream.templates.map((template) => template?.mapId).filter((mapId) => mapIds.has(mapId))),
    }));
  const shareWorldStream = (firstMapId, secondMapId) => worldStreamGroups.some((group) => group.templateMapIds.has(firstMapId) && group.templateMapIds.has(secondMapId));

  for (const map of maps) {
    const rawProjection = map.projection ?? project.projection ?? { type: "orthographic", tileWidth: map.grid, tileHeight: map.grid };
    const projection = normalizeProjection(rawProjection, map);
    if (rawProjection.type === "dimetric-2:1") {
      if (rawProjection.tileWidth !== 128 || rawProjection.tileHeight !== 64) add("error", "projection-size", `${map.name} must normalize dimetric tiles to exact 128×64 diamonds.`, { mapId: map.id });
      if (rawProjection.tileWidth !== rawProjection.tileHeight * 2) add("error", "projection-ratio", `${map.name} must maintain an exact 2:1 width-to-height ratio.`, { mapId: map.id });
      if (!(Number(rawProjection.worldUnitsPerTile ?? 128) > 0)) add("error", "projection-world-unit", `${map.name} needs a positive worldUnitsPerTile value.`, { mapId: map.id });
    }
    const objects = map.objects ?? [];
    const objectIds = new Set(objects.map((object) => object.id));
    const clearanceZones = map.clearanceZones ?? project.clearanceZones ?? [];
    const hudSafeAreas = map.hudSafeAreas ?? project.hudSafeAreas ?? [];
    const modularGroups = new Map();
    let interactionSocketCount = 0;

    for (const object of objects) {
      const context = { mapId: map.id, objectId: object.id };
      const collider = collisionRect(object);
      const visual = visualRect(object);
      const boundaryRects = collider ? [visual, collider] : [visual];
      const boundary = {
        x: Math.min(...boundaryRects.map((rect) => rect.x)),
        y: Math.min(...boundaryRects.map((rect) => rect.y)),
        width: Math.max(...boundaryRects.map((rect) => rect.x + rect.width)) - Math.min(...boundaryRects.map((rect) => rect.x)),
        height: Math.max(...boundaryRects.map((rect) => rect.y + rect.height)) - Math.min(...boundaryRects.map((rect) => rect.y)),
      };
      const fullyOutsideMap = boundary.x + boundary.width <= 0 || boundary.y + boundary.height <= 0 || boundary.x >= map.width || boundary.y >= map.height;
      const crossesMapBoundary = boundary.x < 0 || boundary.y < 0 || boundary.x + boundary.width > map.width || boundary.y + boundary.height > map.height;
      if (fullyOutsideMap) add("error", "object-outside-map", `${object.name} is fully outside ${map.name}'s ${map.width}×${map.height} boundary.`, context);
      else if (crossesMapBoundary) add("warning", "object-clipped-by-map", `${object.name}'s visual or authored collision footprint crosses ${map.name}'s ${map.width}×${map.height} boundary.`, context);

      if (object.assetId && object.anchorMode !== "ground") add("warning", "ground-anchor", `${object.name} uses generated art without an explicit ground-contact anchor.`, context);
      if (object.collisionOwner === "generated-art") add("error", "collision-owner", `${object.name} lets generated art own gameplay collision; collision must remain authored map data.`, context);
      if (collider) {
        const visualArea = Math.max(1, visual.width * visual.height);
        const intersection = overlapArea(collider, visual);
        if (intersection / Math.max(1, collider.width * collider.height) < 0.7) add("warning", "footprint-visual-mismatch", `${object.name}'s gameplay footprint substantially disagrees with its visible bounds.`, context);
        if (collider.width * collider.height > visualArea * 1.8) add("warning", "invisible-collision", `${object.name} has collision far larger than its artwork.`, context);
      }
      const support = resolveSupportContact(map, object, project.assets ?? [], { projection });
      if (needsSurfaceSupport(object) && support.status === "missing") add("error", "support-missing", `${object.name} must rest on the floor or an authored support surface, but no support contact is assigned.`, context);
      if (support.status === "anchor") add("error", "support-anchor", `${object.name} has a support contact but does not use its visual ground anchor.`, context);
      if (support.status === "missing-surface") add("error", "support-surface-missing", `${object.name} points to a support surface that no longer exists.`, context);
      if (support.status === "invalid-surface") add("error", "support-surface-invalid", `${object.name}'s assigned support is not an enabled authored solid surface.`, context);
      if (support.status === "outside-footprint") add("error", "support-footprint", `${object.name}'s base footprint does not overlap ${support.support?.name ?? "its assigned support"}.`, context);
      if (support.status === "gap") add("error", "support-gap", `${object.name}'s ground contact is ${Math.abs(support.gap ?? 0).toFixed(1)}px/unit away from ${support.support?.name ?? "its support"}; snap it to remove the float or sink.`, context);
      if (support.status === "height") add("error", "support-height", `${object.name} is rendered at z=${object.z ?? 0} but its support height is z=${object.supportZ}.`, context);
      if (!object.supportContact && (object.z ?? 0) !== (object.supportZ ?? object.z ?? 0)) add("error", "support-height", `${object.name} is rendered at z=${object.z ?? 0} but supported at z=${object.supportZ}.`, context);
      if ((object.z ?? 0) > 0 && ["terrain", "ledge", "building"].includes(object.role) && !(object.depthSlices?.length > 1)) add("warning", "depth-slices", `${object.name} is elevated but has no separate foreground/background depth slices.`, context);
      if ((object.visualBounds?.height ?? object.height) > object.height && (object.cullingPadding ?? 0) < (object.visualBounds.height - object.height)) add("warning", "culling-padding", `${object.name} can be culled before its full artwork leaves the screen.`, context);
      if (object.role === "signature" && object.density !== "sparse") add("warning", "signature-density", `${object.name} is a signature visual but is not marked for sparse placement.`, context);
      if (object.interactionSockets) {
        const socketIds = new Set();
        for (const socket of object.interactionSockets) {
          if (!socket.id || socketIds.has(socket.id)) add("error", "socket-id", `${object.name} has a missing or duplicate interaction socket ID.`, context);
          socketIds.add(socket.id);
          if (socket.requiresFreshPress !== true) add("error", "implicit-snap", `${object.name} socket ${socket.id} allows implicit proximity snapping instead of a fresh input.`, context);
          interactionSocketCount += 1;
        }
      }
      if (object.modularPathId) {
        const entries = modularGroups.get(object.modularPathId) ?? [];
        entries.push(object);
        modularGroups.set(object.modularPathId, entries);
      }
      if (object.kind === "portal") {
        if (!object.targetMapId || !mapIds.has(object.targetMapId)) add("error", "portal-target", `${object.name} points to a missing map.`, context);
        else {
          const target = maps.find((candidate) => candidate.id === object.targetMapId);
          const targetSpawns = new Set((target?.objects ?? []).filter((candidate) => candidate.kind === "spawn").map((candidate) => candidate.id));
          if (!object.targetSpawnId || !targetSpawns.has(object.targetSpawnId)) add("error", "portal-spawn", `${object.name} points to a missing spawn on ${target?.name ?? object.targetMapId}.`, context);
        }
      }

      for (const zone of clearanceZones) {
        if (!collider || object.blocksMovement === false) continue;
        const zoneRect = { ...zone, zMin: zone.zMin ?? 0, zMax: zone.zMax ?? 1 };
        if (rectsOverlap(collider, zoneRect) && zOverlaps(collider, zoneRect)) add("warning", "route-clearance", `${object.name} blocks the ${zone.phase ?? "route"} zone for ${zone.routeName ?? zone.routeId ?? "a line"}.`, { ...context, routeId: zone.routeId });
      }
      for (const safeArea of hudSafeAreas) {
        if (object.allowHudOverlap === true || object.kind === "decor") continue;
        if (rectsOverlap(visual, safeArea)) add("warning", "hud-landmark-overlap", `${object.name} enters the ${safeArea.name ?? "HUD"} exclusion zone.`, { ...context, safeAreaId: safeArea.id });
      }
    }

    const expectedSockets = map.interactionPolicy?.expectedSockets ?? project.interactionPolicy?.expectedSockets;
    if (Number.isInteger(expectedSockets) && interactionSocketCount !== expectedSockets) add("error", "socket-count", `${map.name} defines ${interactionSocketCount} interaction sockets; its feature contract requires ${expectedSockets}.`, { mapId: map.id });
    if ((map.interactionPolicy?.requiresFreshPress ?? project.interactionPolicy?.requiresFreshPress) === true) {
      const implicit = objects.flatMap((object) => object.interactionSockets ?? []).filter((socket) => socket.requiresFreshPress !== true);
      if (implicit.length) add("error", "fresh-input-policy", `${implicit.length} socket(s) violate the map-wide fresh-input policy.`, { mapId: map.id });
    }

    const interactionObjects = objects
      .filter((object) => ["coin", "hazard", "goal", "portal"].includes(object.kind) || ["rail", "ledge", "bench", "music-pad"].includes(object.role))
      .sort((a, b) => (a.x + a.width / 2) - (b.x + b.width / 2));
    const maxInteractionGap = map.maxInteractionGap ?? project.maxInteractionGap ?? (map.controlMode === "topdown" ? 380 : 300);
    for (let index = 1; index < interactionObjects.length; index += 1) {
      const previous = interactionObjects[index - 1];
      const current = interactionObjects[index];
      const gap = Math.hypot((current.x + current.width / 2) - (previous.x + previous.width / 2), (current.y + current.height / 2) - (previous.y + previous.height / 2));
      if (gap > maxInteractionGap) add("warning", "dead-space", `${Math.round(gap)}px separates ${previous.name} from ${current.name} with no authored interaction between them.`, { mapId: map.id, objectId: current.id });
    }

    for (const [pathId, pieces] of modularGroups) {
      const ordered = [...pieces].sort((a, b) => (a.modularOrder ?? 0) - (b.modularOrder ?? 0));
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1];
        const current = ordered[index];
        if (!previous.pathEnd || !current.pathStart) {
          add("warning", "modular-endpoints", `Modular path ${pathId} is missing authored endpoints.`, { mapId: map.id });
          continue;
        }
        const distance = Math.hypot(previous.pathEnd.x - current.pathStart.x, previous.pathEnd.y - current.pathStart.y, (previous.pathEnd.z ?? 0) - (current.pathStart.z ?? 0));
        if (distance > (project.pathJoinTolerance ?? 0.05)) add("error", "modular-gap", `Modular path ${pathId} has a ${distance.toFixed(2)}-unit gap or drift between pieces.`, { mapId: map.id, objectId: current.id });
      }
    }

    for (let firstIndex = 0; firstIndex < objects.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < objects.length; secondIndex += 1) {
        const first = objects[firstIndex];
        const second = objects[secondIndex];
        const firstCollision = collisionRect(first);
        const secondCollision = collisionRect(second);
        if (!firstCollision || !secondCollision || !rectsOverlap(firstCollision, secondCollision)) continue;
        if (!zOverlaps(firstCollision, secondCollision)) {
          if ((first.z ?? 0) !== (second.z ?? 0) && (!first.routeLayer || !second.routeLayer)) add("warning", "route-layer-ambiguity", `${first.name} and ${second.name} share screen space at different heights without explicit route-layer IDs.`, { mapId: map.id, objectId: second.id });
          continue;
        }
        if (first.assetId && first.assetId === second.assetId && overlapArea(visualRect(first), visualRect(second)) > Math.min(first.width * first.height, second.width * second.height) * 0.65) add("warning", "duplicate-art", `${first.name} and ${second.name} appear to duplicate the same artwork and geometry.`, { mapId: map.id, objectId: second.id });
        if ((first.role === "building" || second.role === "building") && first.blocksMovement !== false && second.blocksMovement !== false) add("warning", "inside-building", `${first.name} overlaps ${second.name}'s architectural footprint.`, { mapId: map.id, objectId: second.id });
      }
    }

    if (projection.type === "dimetric-2:1") {
      const depthValues = objects.map((object) => ({ id: object.id, value: depthKey(object, projection) }));
      const duplicates = depthValues.filter((entry, index) => depthValues.findIndex((candidate) => candidate.value === entry.value) !== index);
      if (duplicates.length && objects.some((object) => (object.z ?? 0) > 0)) add("warning", "depth-tie", `${duplicates.length} elevated object(s) share an unresolved depth key.`, { mapId: map.id });
    }

    const navigation = analyzeNavigationMap(map);
    for (const issue of navigation.issues) add(issue.severity, issue.code, issue.message, Object.fromEntries(Object.entries(issue).filter(([key]) => !["severity", "code", "message"].includes(key))));

    if (objectIds.size !== objects.length) add("error", "duplicate-object-id", `${map.name} contains duplicate object IDs.`, { mapId: map.id });
  }

  if (maps.length) {
    const explicitStartMap = project.startMapId;
    const startMapId = maps.some((map) => map.id === explicitStartMap) ? explicitStartMap : maps[0].id;
    if (!explicitStartMap) add("warning", "start-map-missing", `${maps[0].name} is used as the first player-facing map, but the project has no explicit startMapId.`, { mapId: maps[0].id });
    else if (!maps.some((map) => map.id === explicitStartMap)) add("error", "start-map-invalid", `The configured first map (${explicitStartMap}) does not exist.`);
    if (startMapId !== maps[0].id) add("warning", "start-map-order", `The first map is ${startMapId}, but it is not first in the authored route order.`, { mapId: startMapId });

    for (let index = 0; index < maps.length - 1; index += 1) {
      const source = maps[index];
      const target = maps[index + 1];
      const forwardPortal = (source.objects ?? []).find((object) => object.kind === "portal" && object.targetMapId === target.id);
      if (!forwardPortal && !shareWorldStream(source.id, target.id)) add("error", "map-route-gap", `${source.name} does not have an authored portal or continuous-world route to the next map, ${target.name}.`, { mapId: source.id, targetMapId: target.id });
    }

    const adjacency = new Map(maps.map((map) => [map.id, new Set((map.objects ?? []).filter((object) => object.kind === "portal" && mapIds.has(object.targetMapId)).map((object) => object.targetMapId))]));
    for (const group of worldStreamGroups) {
      const hostTargets = adjacency.get(group.hostMapId);
      for (const mapId of group.templateMapIds) hostTargets?.add(mapId);
      for (const sourceMapId of group.templateMapIds) {
        const targets = adjacency.get(sourceMapId);
        for (const targetMapId of group.templateMapIds) targets?.add(targetMapId);
      }
    }
    const reachable = new Set([startMapId]);
    const pending = [startMapId];
    while (pending.length) {
      const current = pending.shift();
      for (const targetId of adjacency.get(current) ?? []) {
        if (reachable.has(targetId)) continue;
        reachable.add(targetId);
        pending.push(targetId);
      }
    }
    for (const map of maps) if (!reachable.has(map.id)) add("error", "map-unreachable", `${map.name} cannot be reached from the first map through authored portal or continuous-world connections.`, { mapId: map.id, startMapId });
  }

  for (const asset of project.assets ?? []) {
    if (asset.type === "tileset" && asset.generator?.seamless === false) add("warning", "tile-seams", `${asset.name} is not marked as edge-sealed for seamless repetition.`, { assetId: asset.id });
    if (asset.collisionPolicy && asset.collisionPolicy !== "authored-only") add("error", "asset-collision-policy", `${asset.name} can define gameplay collision; generated assets must use authored-only collision.`, { assetId: asset.id });
    if (asset.type === "sprite" && asset.anchorMode === "ground" && !assetGroundAnchorTouchesBottom(asset)) add("warning", "asset-ground-anchor", `${asset.name}'s ground anchor does not land on the bottom contact row.`, { assetId: asset.id });
  }

  const totalAssetBytes = (project.assets ?? []).reduce((total, asset) => total + assetBytes(asset), 0);
  const packageBudget = project.packageBudgetBytes ?? 2_000_000;
  if (totalAssetBytes > packageBudget) add("warning", "package-budget", `Embedded assets use ${totalAssetBytes.toLocaleString()} bytes, above the ${packageBudget.toLocaleString()}-byte budget.`);
  if (project.authoring?.generatedArtifact === true) add("error", "generated-source-edit", "The loaded file is a generated artifact. Edit the authoring source and regenerate instead.");
  if (project.authoring?.sourceRevision && project.authoring?.generatedFromRevision && project.authoring.sourceRevision !== project.authoring.generatedFromRevision) add("error", "generated-drift", "Generated output no longer matches the current authoring-source revision.");

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const score = Math.max(0, 100 - errorCount * 10 - warningCount * 2);
  return {
    score,
    grade: score >= 95 ? "production-ready" : score >= 80 ? "strong" : score >= 60 ? "needs-attention" : "unsafe",
    projection: projectProjection,
    projections: Object.fromEntries(maps.map((map) => [map.id, normalizeProjection(map.projection ?? project.projection, map)])),
    package: { assetBytes: totalAssetBytes, budgetBytes: packageBudget, withinBudget: totalAssetBytes <= packageBudget },
    mapCount: maps.length,
    errorCount,
    warningCount,
    issues,
  };
}
