import { canonicalSha256 } from "./looplab-canonical-digest.mjs";
import { compileTileRuntimeProgram } from "./looplab-tile-runtime.mjs";

export const LOOPLAB_STRUCTURAL_ITERATION_DIFF_SCHEMA = "looplab-structural-iteration-diff/v1";

const compareIds = (first, second) => String(first).localeCompare(String(second));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const same = (first, second) => canonicalSha256(first) === canonicalSha256(second);

function dimensions(map = {}) {
  return { width: finite(map.width), height: finite(map.height) };
}

function projection(map = {}) {
  const source = map.projection && typeof map.projection === "object" && !Array.isArray(map.projection) ? map.projection : { type: "orthographic" };
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined).sort(([first], [second]) => compareIds(first, second)).map(([key, value]) => [key, clone(value)]));
}

function rootMap(project = {}) {
  return {
    id: text(project.activeMapId, "map-main"),
    name: text(project.name, "Main map"),
    width: project.width,
    height: project.height,
    background: project.background,
    gravity: project.gravity,
    grid: project.grid,
    controlMode: project.controlMode,
    projection: project.projection,
    objects: project.objects,
    collisionGeometry: project.collisionGeometry,
    tileProgram: project.tileProgram,
  };
}

function projectMaps(project = {}) {
  const maps = Array.isArray(project.maps) && project.maps.length ? project.maps : [rootMap(project)];
  return maps.filter((map) => map && typeof map === "object" && !Array.isArray(map)).map((map, index) => ({ ...map, id: text(map.id, `map-${index + 1}`) }));
}

function indexed(records, kind, warnings) {
  const result = new Map();
  for (const record of [...records].sort((first, second) => compareIds(first?.id, second?.id))) {
    const id = text(record?.id);
    if (!id) continue;
    if (result.has(id)) {
      warnings.push(`${kind} ${id} is duplicated; the structural comparison retained the first stable-ID record and reported the source ambiguity.`);
      continue;
    }
    result.set(id, record);
  }
  return result;
}

function placementSnapshot(object = {}) {
  return {
    x: finite(object.x),
    y: finite(object.y),
    z: finite(object.z),
    supportZ: finite(object.supportZ, finite(object.z)),
    width: Math.max(0, finite(object.width)),
    height: Math.max(0, finite(object.height)),
  };
}

function anchorSnapshot(anchor) {
  if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) return null;
  return { offsetX: finite(anchor.offsetX), offsetY: finite(anchor.offsetY) };
}

function visualBoundsSnapshot(bounds) {
  if (!bounds || typeof bounds !== "object" || Array.isArray(bounds)) return null;
  return {
    offsetX: finite(bounds.offsetX),
    offsetY: finite(bounds.offsetY),
    width: Math.max(0, finite(bounds.width)),
    height: Math.max(0, finite(bounds.height)),
  };
}

function objectSnapshot(object = {}) {
  const placement = placementSnapshot(object);
  return {
    id: text(object.id),
    label: text(object.name, text(object.id, "Object")),
    kind: text(object.kind, "object"),
    placement,
    bounds: { x: placement.x, y: placement.y, width: placement.width, height: placement.height, zMin: placement.z, zMax: placement.z },
    groundAnchor: anchorSnapshot(object.groundAnchor),
    visualBounds: visualBoundsSnapshot(object.visualBounds),
    structuralState: {
      solid: object.solid === true,
      hidden: object.hidden === true,
      collisionOwner: object.collisionOwner ?? null,
    },
  };
}

function colliderSnapshot(object = {}) {
  const collider = object.collider;
  if (!collider || typeof collider !== "object" || Array.isArray(collider)) return null;
  const placement = placementSnapshot(object);
  const offsetX = finite(collider.offsetX);
  const offsetY = finite(collider.offsetY);
  const width = Math.max(0, finite(collider.width, placement.width));
  const height = Math.max(0, finite(collider.height, placement.height));
  return {
    id: `${text(object.id)}:collider`,
    objectId: text(object.id),
    label: `${text(object.name, text(object.id, "Object"))} collider`,
    ownerType: "object",
    enabled: collider.enabled !== false,
    trigger: collider.trigger === true,
    oneWay: collider.oneWay === true,
    offsetX,
    offsetY,
    width,
    height,
    zMin: finite(collider.zMin, placement.z),
    zMax: finite(collider.zMax, placement.z + 1),
    bounds: { x: placement.x + offsetX, y: placement.y + offsetY, width, height, zMin: finite(collider.zMin, placement.z), zMax: finite(collider.zMax, placement.z + 1) },
  };
}

function chainSnapshot(chain = {}) {
  return {
    id: text(chain.id),
    label: text(chain.name, text(chain.id, "Collision chain")),
    enabled: chain.enabled !== false,
    role: text(chain.role, "auto"),
    oneWay: chain.oneWay === true,
    frontFace: text(chain.frontFace, "right"),
    zMin: finite(chain.zMin),
    zMax: finite(chain.zMax, 1),
    sourceObjectId: text(chain.sourceObjectId) || null,
    points: (Array.isArray(chain.points) ? chain.points : []).map((point, index) => ({ id: text(point?.id, `point-${index + 1}`), x: finite(point?.x), y: finite(point?.y) })),
  };
}

function tileColliderSnapshots(map = {}) {
  const runtime = compileTileRuntimeProgram(map.tileProgram, map);
  return runtime.collisionObjects.map((object) => ({
    id: text(object.id),
    label: text(object.name, text(object.id, "Tile collider")),
    ownerType: "tile",
    layerId: text(object.tileCollisionLayerId) || null,
    profileId: text(object.tileCollisionProfileId) || null,
    enabled: object.collider?.enabled !== false,
    trigger: object.collider?.trigger === true,
    oneWay: object.collider?.oneWay === true,
    zMin: finite(object.collider?.zMin, finite(object.z)),
    zMax: finite(object.collider?.zMax, finite(object.z) + 1),
    bounds: { x: finite(object.x), y: finite(object.y), width: Math.max(0, finite(object.width)), height: Math.max(0, finite(object.height)), zMin: finite(object.collider?.zMin, finite(object.z)), zMax: finite(object.collider?.zMax, finite(object.z) + 1) },
  }));
}

function changeRecord(id, change, before, after, changeKinds = []) {
  return { id, change, changeKinds, before: before ? clone(before) : null, after: after ? clone(after) : null };
}

function objectChangeKinds(first, second) {
  const kinds = [];
  if (first.placement.x !== second.placement.x || first.placement.y !== second.placement.y) kinds.push("moved");
  if (first.placement.z !== second.placement.z) kinds.push("elevation-changed");
  if (first.placement.supportZ !== second.placement.supportZ) kinds.push("support-changed");
  if (first.placement.width !== second.placement.width || first.placement.height !== second.placement.height) kinds.push("resized");
  if (!same(first.groundAnchor, second.groundAnchor)) kinds.push("anchor-changed");
  if (!same(first.visualBounds, second.visualBounds)) kinds.push("visual-bounds-changed");
  if (first.kind !== second.kind) kinds.push("kind-changed");
  if (!same(first.structuralState, second.structuralState)) kinds.push("structural-state-changed");
  return kinds;
}

function colliderChangeKinds(first, second) {
  const kinds = [];
  if (first.bounds.x !== second.bounds.x || first.bounds.y !== second.bounds.y) kinds.push("moved");
  if (first.bounds.width !== second.bounds.width || first.bounds.height !== second.bounds.height) kinds.push("resized");
  if (first.zMin !== second.zMin || first.zMax !== second.zMax) kinds.push("elevation-range-changed");
  if (first.offsetX !== second.offsetX || first.offsetY !== second.offsetY) kinds.push("offset-changed");
  if (first.enabled !== second.enabled) kinds.push("enabled-changed");
  if (first.trigger !== second.trigger || first.oneWay !== second.oneWay) kinds.push("collision-mode-changed");
  if (first.layerId !== second.layerId || first.profileId !== second.profileId) kinds.push("tile-profile-changed");
  return kinds;
}

function chainChangeKinds(first, second) {
  const kinds = [];
  if (!same(first.points, second.points)) kinds.push("points-changed");
  if (first.zMin !== second.zMin || first.zMax !== second.zMax) kinds.push("elevation-range-changed");
  if (first.enabled !== second.enabled || first.role !== second.role || first.oneWay !== second.oneWay || first.frontFace !== second.frontFace) kinds.push("collision-mode-changed");
  if (first.sourceObjectId !== second.sourceObjectId) kinds.push("source-changed");
  return kinds;
}

function diffIndexed(firstIndex, secondIndex, snapshot, changeKinds) {
  const ids = [...new Set([...firstIndex.keys(), ...secondIndex.keys()])].sort(compareIds);
  return ids.flatMap((id) => {
    const firstRecord = firstIndex.get(id);
    const secondRecord = secondIndex.get(id);
    const before = firstRecord ? snapshot(firstRecord) : null;
    const after = secondRecord ? snapshot(secondRecord) : null;
    if (!before) return [changeRecord(id, "added", null, after, ["added"] )];
    if (!after) return [changeRecord(id, "removed", before, null, ["removed"] )];
    const kinds = changeKinds(before, after);
    return kinds.length ? [changeRecord(id, "modified", before, after, kinds)] : [];
  });
}

function mapStructuralDiff(firstMap, secondMap, warnings) {
  const mapId = text(secondMap?.id, text(firstMap?.id));
  const status = !firstMap ? "added" : !secondMap ? "removed" : "modified";
  const firstDimensions = firstMap ? dimensions(firstMap) : null;
  const secondDimensions = secondMap ? dimensions(secondMap) : null;
  const firstProjection = firstMap ? projection(firstMap) : null;
  const secondProjection = secondMap ? projection(secondMap) : null;
  const changeKinds = [];
  if (!firstMap) changeKinds.push("map-added");
  else if (!secondMap) changeKinds.push("map-removed");
  else {
    if (!same(firstDimensions, secondDimensions)) changeKinds.push("map-resized");
    if (!same(firstProjection, secondProjection)) changeKinds.push("projection-changed");
    const firstSettings = { grid: finite(firstMap.grid), gravity: finite(firstMap.gravity), controlMode: text(firstMap.controlMode) };
    const secondSettings = { grid: finite(secondMap.grid), gravity: finite(secondMap.gravity), controlMode: text(secondMap.controlMode) };
    if (!same(firstSettings, secondSettings)) changeKinds.push("map-settings-changed");
  }

  const firstObjects = indexed(firstMap?.objects ?? [], `map ${mapId} object`, warnings);
  const secondObjects = indexed(secondMap?.objects ?? [], `map ${mapId} object`, warnings);
  const objectChanges = diffIndexed(firstObjects, secondObjects, objectSnapshot, objectChangeKinds);
  const colliderChanges = [...new Set([...firstObjects.keys(), ...secondObjects.keys()])].sort(compareIds).flatMap((id) => {
    const before = firstObjects.has(id) ? colliderSnapshot(firstObjects.get(id)) : null;
    const after = secondObjects.has(id) ? colliderSnapshot(secondObjects.get(id)) : null;
    if (!before && !after) return [];
    if (!before) return [changeRecord(`${id}:collider`, "added", null, after, ["added"] )];
    if (!after) return [changeRecord(`${id}:collider`, "removed", before, null, ["removed"] )];
    const kinds = colliderChangeKinds(before, after);
    return kinds.length ? [changeRecord(`${id}:collider`, "modified", before, after, kinds)] : [];
  });

  const firstChains = indexed(firstMap?.collisionGeometry?.chains ?? [], `map ${mapId} collision chain`, warnings);
  const secondChains = indexed(secondMap?.collisionGeometry?.chains ?? [], `map ${mapId} collision chain`, warnings);
  const chainChanges = diffIndexed(firstChains, secondChains, chainSnapshot, chainChangeKinds);

  const firstTile = indexed(firstMap ? tileColliderSnapshots(firstMap) : [], `map ${mapId} tile collider`, warnings);
  const secondTile = indexed(secondMap ? tileColliderSnapshots(secondMap) : [], `map ${mapId} tile collider`, warnings);
  const tileColliderChanges = diffIndexed(firstTile, secondTile, (value) => value, colliderChangeKinds);

  const detailCount = objectChanges.length + colliderChanges.length + chainChanges.length + tileColliderChanges.length;
  return {
    mapId,
    label: text(secondMap?.name, text(firstMap?.name, mapId)),
    status: changeKinds.length || detailCount ? status : "unchanged",
    changeKinds,
    dimensions: { first: firstDimensions, second: secondDimensions },
    projections: { first: firstProjection, second: secondProjection },
    detailCount,
    objectChanges,
    colliderChanges,
    chainChanges,
    tileColliderChanges,
  };
}

function countsFor(records) {
  return {
    added: records.filter((entry) => entry.change === "added").length,
    removed: records.filter((entry) => entry.change === "removed").length,
    modified: records.filter((entry) => entry.change === "modified").length,
  };
}

function summaryFor(maps, firstMapCount, secondMapCount) {
  const objects = maps.flatMap((map) => map.objectChanges);
  const colliders = maps.flatMap((map) => map.colliderChanges);
  const chains = maps.flatMap((map) => map.chainChanges);
  const tileColliders = maps.flatMap((map) => map.tileColliderChanges);
  const objectCounts = countsFor(objects);
  return {
    mapCount: { first: firstMapCount, second: secondMapCount },
    maps: {
      changed: maps.filter((map) => map.status !== "unchanged").length,
      added: maps.filter((map) => map.status === "added").length,
      removed: maps.filter((map) => map.status === "removed").length,
      resized: maps.filter((map) => map.changeKinds.includes("map-resized")).length,
      projectionChanged: maps.filter((map) => map.changeKinds.includes("projection-changed")).length,
    },
    objects: {
      ...objectCounts,
      moved: objects.filter((entry) => entry.changeKinds.includes("moved")).length,
      resized: objects.filter((entry) => entry.changeKinds.includes("resized")).length,
      supportChanged: objects.filter((entry) => entry.changeKinds.includes("support-changed") || entry.changeKinds.includes("elevation-changed")).length,
      anchorChanged: objects.filter((entry) => entry.changeKinds.includes("anchor-changed")).length,
    },
    objectColliders: countsFor(colliders),
    collisionChains: countsFor(chains),
    tileColliders: countsFor(tileColliders),
  };
}

function boundedMaps(maps, maximumDetailChanges) {
  let remaining = maximumDetailChanges;
  return maps.map((map) => {
    const next = { ...map };
    let retained = 0;
    for (const field of ["objectChanges", "colliderChanges", "chainChanges", "tileColliderChanges"]) {
      const values = map[field];
      const keep = values.slice(0, Math.max(0, remaining));
      remaining -= keep.length;
      retained += keep.length;
      next[field] = keep;
    }
    next.retainedDetailCount = retained;
    next.omittedDetailCount = map.detailCount - retained;
    return next;
  });
}

/**
 * Builds a non-mutating stable-ID structural comparison between two exact
 * authored project snapshots. The report is evidence, not an executable patch
 * or a creative ranking.
 */
export function buildStructuralIterationDiff({ firstProject, secondProject, first = {}, second = {}, maximumDetailChanges = 512 } = {}) {
  if (!firstProject || typeof firstProject !== "object" || !secondProject || typeof secondProject !== "object") throw new Error("Structural iteration diff requires two authored project snapshots.");
  const maximum = Math.max(32, Math.min(4096, Math.trunc(finite(maximumDetailChanges, 512))));
  const warnings = [];
  const firstMaps = indexed(projectMaps(firstProject), "map", warnings);
  const secondMaps = indexed(projectMaps(secondProject), "map", warnings);
  const mapIds = [...new Set([...firstMaps.keys(), ...secondMaps.keys()])].sort(compareIds);
  const completeMaps = mapIds.map((id) => mapStructuralDiff(firstMaps.get(id) ?? null, secondMaps.get(id) ?? null, warnings));
  const summary = summaryFor(completeMaps, firstMaps.size, secondMaps.size);
  const detailCount = completeMaps.reduce((sum, map) => sum + map.detailCount, 0);
  const receipt = {
    schemaVersion: LOOPLAB_STRUCTURAL_ITERATION_DIFF_SCHEMA,
    first: { iterationId: text(first.iterationId) || null, sourceDigest: text(first.sourceDigest) || null },
    second: { iterationId: text(second.iterationId) || null, sourceDigest: text(second.sourceDigest) || null },
    changed: summary.maps.changed > 0,
    summary,
    detailCount,
    maximumDetailChanges: maximum,
    truncated: detailCount > maximum,
    warnings: [...new Set(warnings)].sort(compareIds),
    maps: boundedMaps(completeMaps, maximum),
    policy: {
      identity: "Stable authored map/object/chain/layer IDs only; array order, proximity, names, art, and pixels never establish identity.",
      sourceBinding: "The receipt is bound to both exact Project Doctor source digests and both iteration IDs.",
      collisionAuthority: "Object colliders, authored collision chains, and canonical compiled tile-collision layers remain independent authored-map truth.",
      coordinateSpace: "All overlay geometry remains authored world space. Projection is reported separately and never inferred from screen pixels.",
      detailBound: "Aggregate counts are complete; maps expose bounded deterministic detail with explicit omitted counts.",
      mutation: "Comparison is read-only and cannot apply, restore, select, or rank a candidate.",
      judgment: "More, fewer, or different structural changes do not prove quality, fun, safety, accessibility, or aesthetic preference.",
    },
  };
  return { ...receipt, digest: canonicalSha256(receipt) };
}
