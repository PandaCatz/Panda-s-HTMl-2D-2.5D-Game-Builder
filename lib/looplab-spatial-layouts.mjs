import { canonicalSha256 } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_SPATIAL_LAYOUT_CONTRACT_SCHEMA = "looplab-spatial-layout-contract/v1";
export const LOOPLAB_SPATIAL_LAYOUT_REPORT_SCHEMA = "looplab-spatial-layout-report/v1";
export const LOOPLAB_SPATIAL_LAYOUT_SEARCH_SCHEMA = "looplab-spatial-layout-search/v1";
export const LOOPLAB_SPATIAL_LAYOUT_MATERIALIZATION_SCHEMA = "looplab-spatial-layout-materialization/v1";
export const LOOPLAB_SPATIAL_LAYOUT_FAMILIES = Object.freeze(["sideview-route", "topdown-route", "dimetric-layered-route"]);
export const LOOPLAB_SPATIAL_LAYOUT_DESCRIPTOR_AXES = Object.freeze(["topology", "route-beats", "branches", "elevation-layers", "density"]);
export const LOOPLAB_SPATIAL_LAYOUT_LIMITS = Object.freeze({
  maximumCandidates: 6,
  defaultCandidates: 3,
  maximumPinnedObjects: 64,
  maximumRouteBeats: 12,
  maximumBranches: 4,
  minimumClearance: 16,
  maximumClearance: 128,
});

const CONTRACT_KEYS = new Set(["schemaVersion", "status", "intent", "mapId", "families", "pinnedObjectIds", "constraints", "search"]);
const CONSTRAINT_KEYS = new Set(["minimumRouteBeats", "maximumRouteBeats", "minimumBranches", "maximumBranches", "cyclePolicy", "elevationPolicy", "minimumClearance", "replacementPolicy"]);
const SEARCH_KEYS = new Set(["maxCandidates", "descriptorAxes"]);
const STATUS = new Set(["draft", "approved"]);
const CYCLE_POLICIES = new Set(["allow", "forbid", "required"]);
const ELEVATION_POLICIES = new Set(["ground-only", "allow", "required"]);
const REPLACEMENT_POLICIES = new Set(["preserve-existing", "replace-explicit"]);
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback) => Number.isInteger(value) ? value : fallback;
const rounded = (value) => Math.round(Number(value));
const scaled = (size, ratio, minimum = 0) => Math.max(minimum, rounded(finite(size) * ratio));

function issue(severity, code, message, context = {}) {
  return { severity, code, message, ...context };
}

function unknownFields(value, allowed, path, issues) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(issue("error", "spatial-layout-unknown-field", `${path}.${key} is not supported.`, { path: `${path}.${key}` }));
}

function projectMaps(project) {
  if (Array.isArray(project?.maps) && project.maps.length) return project.maps;
  if (!project || typeof project !== "object") return [];
  return [{
    id: project.activeMapId ?? project.startMapId ?? "map-main",
    name: project.name ?? "Map",
    width: project.width,
    height: project.height,
    background: project.background,
    gravity: project.gravity,
    grid: project.grid,
    controlMode: project.controlMode,
    projection: clone(project.projection),
    objects: clone(project.objects ?? []),
    navigation: clone(project.navigation),
    traversalPaths: clone(project.traversalPaths ?? []),
  }];
}

function selectedMap(project, mapId) {
  const maps = projectMaps(project);
  return maps.find((map) => map.id === mapId) ?? null;
}

export function spatialLayoutFamilyForMap(map) {
  if (map?.projection?.type === "dimetric-2:1") return "dimetric-layered-route";
  if (map?.controlMode === "platformer") return "sideview-route";
  return "topdown-route";
}

function defaultPinnedObjectIds(map) {
  return (map?.objects ?? [])
    .filter((object) => ["player", "spawn", "goal", "portal"].includes(object?.kind) || object?.locked === true || object?.spatialLayoutPinned === true)
    .map((object) => object.id)
    .filter((id) => typeof id === "string" && id)
    .sort();
}

export function normalizeSpatialLayoutContract(project, input = {}) {
  const maps = projectMaps(project);
  const mapId = typeof input.mapId === "string" && input.mapId.trim() ? input.mapId.trim() : project?.activeMapId ?? maps[0]?.id ?? "";
  const map = maps.find((candidate) => candidate.id === mapId) ?? maps[0] ?? null;
  const compatibleFamily = spatialLayoutFamilyForMap(map);
  const requestedFamilies = Array.isArray(input.families) ? input.families : [compatibleFamily];
  const families = [...new Set(requestedFamilies.filter((family) => LOOPLAB_SPATIAL_LAYOUT_FAMILIES.includes(family)))];
  const mandatoryPinnedObjectIds = defaultPinnedObjectIds(map);
  const requestedPinnedObjectIds = Array.isArray(input.pinnedObjectIds)
    ? input.pinnedObjectIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim())
    : [];
  const pinnedObjectIds = [...new Set([...mandatoryPinnedObjectIds, ...requestedPinnedObjectIds])];
  const descriptorAxes = Array.isArray(input.search?.descriptorAxes)
    ? [...new Set(input.search.descriptorAxes.filter((axis) => LOOPLAB_SPATIAL_LAYOUT_DESCRIPTOR_AXES.includes(axis)))]
    : ["topology", "branches", "elevation-layers"];
  return {
    schemaVersion: LOOPLAB_SPATIAL_LAYOUT_CONTRACT_SCHEMA,
    status: STATUS.has(input.status) ? input.status : "draft",
    intent: typeof input.intent === "string" ? input.intent.trim() : "",
    mapId,
    families: families.length ? families : [compatibleFamily],
    pinnedObjectIds,
    constraints: {
      minimumRouteBeats: integer(input.constraints?.minimumRouteBeats, 3),
      maximumRouteBeats: integer(input.constraints?.maximumRouteBeats, 10),
      minimumBranches: integer(input.constraints?.minimumBranches, 0),
      maximumBranches: integer(input.constraints?.maximumBranches, 3),
      cyclePolicy: CYCLE_POLICIES.has(input.constraints?.cyclePolicy) ? input.constraints.cyclePolicy : "allow",
      elevationPolicy: ELEVATION_POLICIES.has(input.constraints?.elevationPolicy) ? input.constraints.elevationPolicy : compatibleFamily === "dimetric-layered-route" ? "allow" : "ground-only",
      minimumClearance: integer(input.constraints?.minimumClearance, compatibleFamily === "sideview-route" ? 44 : 52),
      replacementPolicy: REPLACEMENT_POLICIES.has(input.constraints?.replacementPolicy) ? input.constraints.replacementPolicy : "preserve-existing",
    },
    search: {
      maxCandidates: integer(input.search?.maxCandidates, LOOPLAB_SPATIAL_LAYOUT_LIMITS.defaultCandidates),
      descriptorAxes: descriptorAxes.length >= 2 ? descriptorAxes : ["topology", "branches"],
    },
  };
}

export function inspectSpatialLayoutContract(project, input = project?.spatialLayoutContract, options = {}) {
  if (input == null) return {
    schemaVersion: LOOPLAB_SPATIAL_LAYOUT_REPORT_SCHEMA,
    present: false,
    status: "not-configured",
    sourceDigest: options.sourceDigest ?? null,
    contract: null,
    contractDigest: null,
    map: null,
    issues: [],
    errors: [],
    warnings: [],
    limitations: ["Spatial alternatives require an explicit map-scoped contract and never run from prose alone."],
  };
  const issues = [];
  unknownFields(input, CONTRACT_KEYS, "spatialLayoutContract", issues);
  unknownFields(input?.constraints, CONSTRAINT_KEYS, "spatialLayoutContract.constraints", issues);
  unknownFields(input?.search, SEARCH_KEYS, "spatialLayoutContract.search", issues);
  const contract = normalizeSpatialLayoutContract(project, input);
  const map = selectedMap(project, contract.mapId);
  if (!input || typeof input !== "object" || Array.isArray(input)) issues.push(issue("error", "spatial-layout-contract-object", "spatialLayoutContract must be one object."));
  if (input?.schemaVersion !== LOOPLAB_SPATIAL_LAYOUT_CONTRACT_SCHEMA) issues.push(issue("error", "spatial-layout-schema", `spatialLayoutContract.schemaVersion must be ${LOOPLAB_SPATIAL_LAYOUT_CONTRACT_SCHEMA}.`, { path: "spatialLayoutContract.schemaVersion" }));
  if (!STATUS.has(input?.status)) issues.push(issue("error", "spatial-layout-status", "spatialLayoutContract.status must be draft or approved.", { path: "spatialLayoutContract.status" }));
  if (!contract.intent || contract.intent.length > 600) issues.push(issue("error", "spatial-layout-intent", "spatialLayoutContract.intent must contain 1 through 600 characters.", { path: "spatialLayoutContract.intent" }));
  if (!map) issues.push(issue("error", "spatial-layout-map", `Spatial layout map does not exist: ${contract.mapId || "(missing)"}.`, { mapId: contract.mapId }));
  if (!Array.isArray(input?.families) || input.families.length !== 1) issues.push(issue("error", "spatial-layout-families", "spatialLayoutContract.families must contain exactly one projection-compatible family."));
  const compatibleFamily = spatialLayoutFamilyForMap(map);
  for (const family of input?.families ?? []) {
    if (!LOOPLAB_SPATIAL_LAYOUT_FAMILIES.includes(family)) issues.push(issue("error", "spatial-layout-family", `Unsupported spatial layout family: ${String(family)}.`, { family }));
    else if (family !== compatibleFamily) issues.push(issue("error", "spatial-layout-family-incompatible", `${family} is incompatible with ${map?.projection?.type ?? "orthographic"}/${map?.controlMode ?? "topdown"}; use ${compatibleFamily}.`, { family, mapId: map?.id }));
  }
  if (!Array.isArray(input?.pinnedObjectIds) || input.pinnedObjectIds.length > LOOPLAB_SPATIAL_LAYOUT_LIMITS.maximumPinnedObjects) issues.push(issue("error", "spatial-layout-pins", `pinnedObjectIds must be an array with at most ${LOOPLAB_SPATIAL_LAYOUT_LIMITS.maximumPinnedObjects} stable IDs.`));
  if (Array.isArray(input?.pinnedObjectIds) && map) {
    const mapIds = new Set((map.objects ?? []).map((object) => object?.id));
    const seen = new Set();
    for (const id of input.pinnedObjectIds) {
      if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) issues.push(issue("error", "spatial-layout-pin-id", `Pinned object ID is invalid: ${String(id)}.`));
      else if (seen.has(id)) issues.push(issue("error", "spatial-layout-pin-duplicate", `Pinned object ID is duplicated: ${id}.`, { objectId: id }));
      else if (!mapIds.has(id)) issues.push(issue("error", "spatial-layout-pin-missing", `Pinned object does not exist on ${map.id}: ${id}.`, { objectId: id, mapId: map.id }));
      seen.add(id);
    }
  }
  if (!input?.constraints || typeof input.constraints !== "object" || Array.isArray(input.constraints)) issues.push(issue("error", "spatial-layout-constraints", "spatialLayoutContract.constraints must be one object."));
  for (const [field, minimum, maximum] of [
    ["minimumRouteBeats", 2, LOOPLAB_SPATIAL_LAYOUT_LIMITS.maximumRouteBeats],
    ["maximumRouteBeats", 2, LOOPLAB_SPATIAL_LAYOUT_LIMITS.maximumRouteBeats],
    ["minimumBranches", 0, LOOPLAB_SPATIAL_LAYOUT_LIMITS.maximumBranches],
    ["maximumBranches", 0, LOOPLAB_SPATIAL_LAYOUT_LIMITS.maximumBranches],
    ["minimumClearance", LOOPLAB_SPATIAL_LAYOUT_LIMITS.minimumClearance, LOOPLAB_SPATIAL_LAYOUT_LIMITS.maximumClearance],
  ]) {
    const value = input?.constraints?.[field];
    if (!Number.isInteger(value) || value < minimum || value > maximum) issues.push(issue("error", "spatial-layout-constraint-bounds", `constraints.${field} must be an integer from ${minimum} through ${maximum}.`, { field }));
  }
  if (contract.constraints.minimumRouteBeats > contract.constraints.maximumRouteBeats) issues.push(issue("error", "spatial-layout-route-order", "minimumRouteBeats cannot exceed maximumRouteBeats."));
  if (contract.constraints.minimumBranches > contract.constraints.maximumBranches) issues.push(issue("error", "spatial-layout-branch-order", "minimumBranches cannot exceed maximumBranches."));
  if (!CYCLE_POLICIES.has(input?.constraints?.cyclePolicy)) issues.push(issue("error", "spatial-layout-cycle-policy", "cyclePolicy must be allow, forbid, or required."));
  if (!ELEVATION_POLICIES.has(input?.constraints?.elevationPolicy)) issues.push(issue("error", "spatial-layout-elevation-policy", "elevationPolicy must be ground-only, allow, or required."));
  if (compatibleFamily !== "dimetric-layered-route" && contract.constraints.elevationPolicy !== "ground-only") issues.push(issue("error", "spatial-layout-elevation-incompatible", "Orthographic spatial layouts must use ground-only elevation."));
  if (!REPLACEMENT_POLICIES.has(input?.constraints?.replacementPolicy)) issues.push(issue("error", "spatial-layout-replacement-policy", "replacementPolicy must be preserve-existing or replace-explicit."));
  if (!input?.search || typeof input.search !== "object" || Array.isArray(input.search)) issues.push(issue("error", "spatial-layout-search-object", "spatialLayoutContract.search must be one object."));
  if (!Number.isInteger(input?.search?.maxCandidates) || input.search.maxCandidates < 2 || input.search.maxCandidates > LOOPLAB_SPATIAL_LAYOUT_LIMITS.maximumCandidates) issues.push(issue("error", "spatial-layout-candidate-budget", `search.maxCandidates must be an integer from 2 through ${LOOPLAB_SPATIAL_LAYOUT_LIMITS.maximumCandidates}.`));
  if (!Array.isArray(input?.search?.descriptorAxes) || input.search.descriptorAxes.length < 2 || input.search.descriptorAxes.length > 4) issues.push(issue("error", "spatial-layout-descriptor-axes", "search.descriptorAxes must contain two through four supported axes."));
  if (Array.isArray(input?.search?.descriptorAxes)) {
    const seen = new Set();
    for (const axis of input.search.descriptorAxes) {
      if (!LOOPLAB_SPATIAL_LAYOUT_DESCRIPTOR_AXES.includes(axis)) issues.push(issue("error", "spatial-layout-descriptor-axis", `Unsupported descriptor axis: ${String(axis)}.`));
      else if (seen.has(axis)) issues.push(issue("error", "spatial-layout-descriptor-duplicate", `Descriptor axis is duplicated: ${axis}.`));
      seen.add(axis);
    }
  }
  const normalized = issues.some((entry) => entry.severity === "error") ? clone(input) : contract;
  const report = {
    schemaVersion: LOOPLAB_SPATIAL_LAYOUT_REPORT_SCHEMA,
    present: true,
    status: issues.some((entry) => entry.severity === "error") ? "invalid" : contract.status,
    sourceDigest: options.sourceDigest ?? null,
    contract: normalized,
    contractDigest: issues.some((entry) => entry.severity === "error") ? null : canonicalSha256(contract),
    map: map ? { id: map.id, name: map.name, width: map.width, height: map.height, controlMode: map.controlMode, projection: map.projection?.type ?? "orthographic", objectCount: map.objects?.length ?? 0 } : null,
    existingMapProtected: Boolean(map?.objects?.length) && contract.constraints.replacementPolicy !== "replace-explicit",
    pinnedObjectCount: contract.pinnedObjectIds.length,
    issues,
    errors: issues.filter((entry) => entry.severity === "error").map((entry) => entry.message),
    warnings: issues.filter((entry) => entry.severity === "warning").map((entry) => entry.message),
    limitations: [
      "Spatial gates prove schema, collision, support, reachability, evidence non-regression, and map-join compatibility—not fun, pacing, composition, or aesthetic quality.",
      "Generated layout geometry is authored map data. Art remains separate and never becomes collision automatically.",
      "Search and materialization are read-only; only the returned exact ordinary preview batch may be explicitly applied on an unchanged protected variation.",
    ],
  };
  return { ...report, digest: canonicalSha256(report) };
}

export function suggestSpatialLayoutContract(project, options = {}) {
  const mapId = options.mapId ?? project?.activeMapId ?? projectMaps(project)[0]?.id ?? "";
  const map = selectedMap(project, mapId);
  const family = spatialLayoutFamilyForMap(map);
  const contract = normalizeSpatialLayoutContract(project, {
    status: "draft",
    intent: "Explore several collision-authored, projection-correct spatial routes; preserve pinned joins and landmarks exactly; prove each candidate under both Doctor profiles; then preview and choose explicitly.",
    mapId,
    families: [family],
    pinnedObjectIds: defaultPinnedObjectIds(map),
    constraints: {
      minimumRouteBeats: 3,
      maximumRouteBeats: 10,
      minimumBranches: 0,
      maximumBranches: 3,
      cyclePolicy: "allow",
      elevationPolicy: family === "dimetric-layered-route" ? "allow" : "ground-only",
      minimumClearance: family === "sideview-route" ? 44 : 52,
      replacementPolicy: options.allowReplacement === true ? "replace-explicit" : "preserve-existing",
    },
    search: { maxCandidates: integer(options.maxCandidates, LOOPLAB_SPATIAL_LAYOUT_LIMITS.defaultCandidates), descriptorAxes: ["topology", "branches", "elevation-layers"] },
  });
  return {
    schemaVersion: "looplab-spatial-layout-suggestion/v1",
    available: Boolean(map),
    contract,
    contractDigest: canonicalSha256(contract),
    compatibleFamily: family,
    existingMapProtected: Boolean(map?.objects?.length) && contract.constraints.replacementPolicy !== "replace-explicit",
    instruction: "Review the target map, pins, descriptor axes, and hard constraints. Use replace-explicit only on a protected variation when replacing authored map geometry is intentional.",
  };
}

const OBJECT_PRESETS = Object.freeze({
  player: { name: "Player", width: 44, height: 58, color: "#3f3f48", solid: false, collider: { enabled: true, offsetX: 6, offsetY: 4, width: 32, height: 54, trigger: false, oneWay: false } },
  platform: { name: "Platform", width: 180, height: 28, color: "#44444c", solid: true, collider: { enabled: true, offsetX: 0, offsetY: 0, width: 180, height: 28, trigger: false, oneWay: true } },
  spawn: { name: "Spawn", width: 42, height: 64, color: "#71717a", solid: false, collider: { enabled: false, offsetX: 0, offsetY: 0, width: 42, height: 64, trigger: false, oneWay: false } },
  goal: { name: "Goal", width: 48, height: 72, color: "#55555e", solid: false, collider: { enabled: true, offsetX: 4, offsetY: 4, width: 40, height: 68, trigger: true, oneWay: false } },
  coin: { name: "Route marker", width: 30, height: 30, color: "#777780", solid: false, collider: { enabled: true, offsetX: 2, offsetY: 2, width: 26, height: 26, trigger: true, oneWay: false } },
});

function authoredObject(kind, properties = {}) {
  const preset = OBJECT_PRESETS[kind];
  if (!preset) throw new Error(`Unsupported spatial blueprint object kind: ${kind}.`);
  const z = finite(properties.z, 0);
  const width = Math.max(4, rounded(properties.width ?? preset.width));
  const height = Math.max(4, rounded(properties.height ?? preset.height));
  const colliderPreset = preset.collider;
  const collider = properties.collider ?? {
    ...colliderPreset,
    offsetX: rounded(colliderPreset.offsetX * width / preset.width),
    offsetY: rounded(colliderPreset.offsetY * height / preset.height),
    width: Math.max(1, rounded(colliderPreset.width * width / preset.width)),
    height: Math.max(1, rounded(colliderPreset.height * height / preset.height)),
    zMin: z,
    zMax: z + finite(properties.collisionHeight, 1),
  };
  return {
    id: properties.id,
    x: rounded(properties.x),
    y: rounded(properties.y),
    z,
    supportZ: finite(properties.supportZ, z),
    ...preset,
    ...properties,
    width,
    height,
    anchorMode: properties.anchorMode ?? "ground",
    collisionOwner: "authored-map",
    collider,
    kind,
  };
}

function route(id, role, points, width) {
  return { id, role, width, points: points.map((point) => ({ x: rounded(point.x), y: rounded(point.y), z: finite(point.z, 0) })) };
}

function boundaryWalls(map, prefix = "layout") {
  const width = finite(map.width, 960);
  const height = finite(map.height, 540);
  const thickness = Math.max(18, Math.min(32, rounded(Math.min(width, height) * 0.045)));
  return [
    authoredObject("platform", { id: `${prefix}-north-wall`, name: "North boundary", x: 0, y: 0, width, height: thickness, collider: { enabled: true, offsetX: 0, offsetY: 0, width, height: thickness, trigger: false, oneWay: false, zMin: 0, zMax: 1 } }),
    authoredObject("platform", { id: `${prefix}-south-wall`, name: "South boundary", x: 0, y: height - thickness, width, height: thickness, collider: { enabled: true, offsetX: 0, offsetY: 0, width, height: thickness, trigger: false, oneWay: false, zMin: 0, zMax: 1 } }),
    authoredObject("platform", { id: `${prefix}-west-wall`, name: "West boundary", x: 0, y: thickness, width: thickness, height: height - thickness * 2, collider: { enabled: true, offsetX: 0, offsetY: 0, width: thickness, height: height - thickness * 2, trigger: false, oneWay: false, zMin: 0, zMax: 1 } }),
    authoredObject("platform", { id: `${prefix}-east-wall`, name: "East boundary", x: width - thickness, y: thickness, width: thickness, height: height - thickness * 2, collider: { enabled: true, offsetX: 0, offsetY: 0, width: thickness, height: height - thickness * 2, trigger: false, oneWay: false, zMin: 0, zMax: 1 } }),
  ];
}

function emptyNavigation() {
  return { version: 1, activeLayerId: "", layers: [], nodes: [], links: [], areas: [] };
}

function sideviewBlueprints(map) {
  const w = finite(map.width, 960);
  const h = finite(map.height, 540);
  const baseY = scaled(h, 0.86);
  const platform = (variant, index, x, y, width) => authoredObject("platform", { id: `spatial-${variant}-platform-${index}`, name: `Route support ${index}`, x, y, width, height: Math.max(20, scaled(h, 0.045)), color: index % 2 ? "#44444c" : "#55555e" });
  const steppedSupports = [
    platform("stepped-ascent", 1, 0, baseY, scaled(w, 0.25)),
    platform("stepped-ascent", 2, scaled(w, 0.29), scaled(h, 0.74), scaled(w, 0.18)),
    platform("stepped-ascent", 3, scaled(w, 0.51), scaled(h, 0.63), scaled(w, 0.18)),
    platform("stepped-ascent", 4, scaled(w, 0.73), scaled(h, 0.72), scaled(w, 0.27)),
  ];
  const steppedRoute = route("primary", "primary", steppedSupports.map((support) => ({ x: support.x + support.width / 2, y: support.y, z: 0 })), Math.max(44, scaled(h, 0.1)));
  const forkGround = platform("fork-rejoin", 1, 0, baseY, w);
  const forkUpper = [
    platform("fork-rejoin", 2, scaled(w, 0.24), scaled(h, 0.68), scaled(w, 0.2)),
    platform("fork-rejoin", 3, scaled(w, 0.47), scaled(h, 0.58), scaled(w, 0.2)),
    platform("fork-rejoin", 4, scaled(w, 0.7), scaled(h, 0.68), scaled(w, 0.16)),
  ];
  const recoveryGround = platform("wave-recovery", 1, 0, baseY, w);
  const recoveryUpper = [
    platform("wave-recovery", 2, scaled(w, 0.2), scaled(h, 0.72), scaled(w, 0.16)),
    platform("wave-recovery", 3, scaled(w, 0.4), scaled(h, 0.62), scaled(w, 0.16)),
    platform("wave-recovery", 4, scaled(w, 0.6), scaled(h, 0.7), scaled(w, 0.16)),
    platform("wave-recovery", 5, scaled(w, 0.8), scaled(h, 0.6), scaled(w, 0.14)),
  ];
  return [
    { id: "sideview-stepped-ascent", family: "sideview-route", variant: "stepped-ascent", topology: "linear", branchCount: 0, loopCount: 0, clearance: 48, routes: [steppedRoute], objects: [...steppedSupports] },
    { id: "sideview-fork-rejoin", family: "sideview-route", variant: "fork-rejoin", topology: "fork-merge", branchCount: 1, loopCount: 0, clearance: 48, routes: [route("primary", "primary", [{ x: scaled(w, 0.08), y: baseY }, { x: scaled(w, 0.5), y: baseY }, { x: scaled(w, 0.92), y: baseY }], 48), route("high-route", "alternate", [{ x: scaled(w, 0.18), y: baseY }, ...forkUpper.map((support) => ({ x: support.x + support.width / 2, y: support.y })), { x: scaled(w, 0.88), y: baseY }], 48)], objects: [forkGround, ...forkUpper] },
    { id: "sideview-wave-recovery", family: "sideview-route", variant: "wave-recovery", topology: "loop", branchCount: 2, loopCount: 1, clearance: 48, routes: [route("recovery", "primary", [{ x: scaled(w, 0.08), y: baseY }, { x: scaled(w, 0.5), y: baseY }, { x: scaled(w, 0.92), y: baseY }], 48), route("wave", "alternate", [{ x: scaled(w, 0.12), y: baseY }, ...recoveryUpper.map((support) => ({ x: support.x + support.width / 2, y: support.y })), { x: scaled(w, 0.92), y: baseY }], 48)], objects: [recoveryGround, ...recoveryUpper] },
  ].map((blueprint) => ({ ...blueprint, mapChanges: { controlMode: "platformer", gravity: Math.max(1, finite(map.gravity, 1680)), projection: { ...(map.projection ?? {}), type: "orthographic" }, objects: blueprint.objects, navigation: emptyNavigation(), traversalPaths: [], clearanceZones: [] } }));
}

function topdownBlueprints(map) {
  const w = finite(map.width, 960);
  const h = finite(map.height, 540);
  const obstacle = (variant, index, x, y, width, height) => authoredObject("platform", { id: `spatial-${variant}-obstacle-${index}`, name: `Route block ${index}`, x, y, width, height, color: index % 2 ? "#44444c" : "#575760", collider: { enabled: true, offsetX: 0, offsetY: 0, width, height, trigger: false, oneWay: false, zMin: 0, zMax: 1 } });
  const ringObjects = [obstacle("ring-loop", 1, scaled(w, 0.36), scaled(h, 0.28), scaled(w, 0.28), scaled(h, 0.44))];
  const dividerWidth = Math.max(24, scaled(w, 0.045));
  const forkObjects = [
    obstacle("fork-merge", 1, scaled(w, 0.49), scaled(h, 0.18), dividerWidth, scaled(h, 0.22)),
    obstacle("fork-merge", 2, scaled(w, 0.49), scaled(h, 0.6), dividerWidth, scaled(h, 0.22)),
  ];
  const hubObjects = [
    obstacle("hub-spoke", 1, scaled(w, 0.31), scaled(h, 0.22), scaled(w, 0.16), scaled(h, 0.2)),
    obstacle("hub-spoke", 2, scaled(w, 0.53), scaled(h, 0.22), scaled(w, 0.16), scaled(h, 0.2)),
    obstacle("hub-spoke", 3, scaled(w, 0.31), scaled(h, 0.58), scaled(w, 0.16), scaled(h, 0.2)),
    obstacle("hub-spoke", 4, scaled(w, 0.53), scaled(h, 0.58), scaled(w, 0.16), scaled(h, 0.2)),
  ];
  const finish = (blueprint) => ({ ...blueprint, mapChanges: { controlMode: "topdown", gravity: 0, projection: { ...(map.projection ?? {}), type: "orthographic" }, objects: [...boundaryWalls(map, blueprint.variant), ...blueprint.objects], navigation: emptyNavigation(), traversalPaths: [], clearanceZones: [] } });
  return [
    finish({ id: "topdown-ring-loop", family: "topdown-route", variant: "ring-loop", topology: "loop", branchCount: 1, loopCount: 1, clearance: 56, routes: [route("north-route", "primary", [{ x: scaled(w, 0.12), y: scaled(h, 0.5) }, { x: scaled(w, 0.26), y: scaled(h, 0.18) }, { x: scaled(w, 0.74), y: scaled(h, 0.18) }, { x: scaled(w, 0.88), y: scaled(h, 0.5) }], 56), route("south-route", "alternate", [{ x: scaled(w, 0.12), y: scaled(h, 0.5) }, { x: scaled(w, 0.26), y: scaled(h, 0.82) }, { x: scaled(w, 0.74), y: scaled(h, 0.82) }, { x: scaled(w, 0.88), y: scaled(h, 0.5) }], 56)], objects: ringObjects }),
    finish({ id: "topdown-fork-merge", family: "topdown-route", variant: "fork-merge", topology: "fork-merge", branchCount: 1, loopCount: 0, clearance: 56, routes: [route("upper-route", "primary", [{ x: scaled(w, 0.12), y: scaled(h, 0.5) }, { x: scaled(w, 0.45), y: scaled(h, 0.48) }, { x: scaled(w, 0.56), y: scaled(h, 0.48) }, { x: scaled(w, 0.88), y: scaled(h, 0.5) }], 56), route("lower-route", "alternate", [{ x: scaled(w, 0.12), y: scaled(h, 0.5) }, { x: scaled(w, 0.45), y: scaled(h, 0.52) }, { x: scaled(w, 0.56), y: scaled(h, 0.52) }, { x: scaled(w, 0.88), y: scaled(h, 0.5) }], 56)], objects: forkObjects }),
    finish({ id: "topdown-hub-spoke", family: "topdown-route", variant: "hub-spoke", topology: "hub-spoke", branchCount: 2, loopCount: 1, clearance: 56, routes: [route("hub-route", "primary", [{ x: scaled(w, 0.12), y: scaled(h, 0.5) }, { x: scaled(w, 0.5), y: scaled(h, 0.5) }, { x: scaled(w, 0.88), y: scaled(h, 0.5) }], 56), route("north-spoke", "alternate", [{ x: scaled(w, 0.5), y: scaled(h, 0.5) }, { x: scaled(w, 0.5), y: scaled(h, 0.12) }], 56), route("south-spoke", "recovery", [{ x: scaled(w, 0.5), y: scaled(h, 0.5) }, { x: scaled(w, 0.5), y: scaled(h, 0.88) }], 56)], objects: hubObjects }),
  ];
}

function dimetricNavigation(map, routes, deckBounds = null) {
  const groundRoutes = routes.filter((candidate) => candidate.points.every((point) => finite(point.z, 0) < 2));
  const deckRoutes = routes.filter((candidate) => candidate.points.some((point) => finite(point.z, 0) >= 2));
  const nodes = [];
  const links = [];
  for (const candidate of routes) {
    const layerId = candidate.points.some((point) => finite(point.z, 0) >= 2) ? "deck-route" : "ground-route";
    candidate.points.forEach((point, index) => nodes.push({ id: `${candidate.id}-node-${index + 1}`, x: point.x, y: point.y, z: point.z, layerId, destinationId: `${candidate.id}-${index + 1}` }));
    for (let index = 1; index < candidate.points.length; index += 1) links.push({ id: `${candidate.id}-link-${index}`, a: `${candidate.id}-node-${index}`, b: `${candidate.id}-node-${index + 1}`, layerId, cost: 1, oneWay: false });
  }
  const marginX = scaled(map.width, 0.06);
  const marginY = scaled(map.height, 0.08);
  const areas = [{
    id: "ground-walkable",
    name: "Ground walkable area",
    kind: "walkable",
    points: [
      { x: marginX, y: marginY, z: 0 },
      { x: finite(map.width) - marginX, y: marginY, z: 0 },
      { x: finite(map.width) - marginX, y: finite(map.height) - marginY, z: 0 },
      { x: marginX, y: finite(map.height) - marginY, z: 0 },
    ],
    layerId: "ground-route",
    zMin: 0,
    zMax: 1,
  }];
  if (deckBounds) areas.push({
    id: "deck-walkable",
    name: "Raised deck walkable area",
    kind: "walkable",
    points: [
      { x: deckBounds.x, y: deckBounds.y, z: 4 },
      { x: deckBounds.x + deckBounds.width, y: deckBounds.y, z: 4 },
      { x: deckBounds.x + deckBounds.width, y: deckBounds.y + deckBounds.height, z: 4 },
      { x: deckBounds.x, y: deckBounds.y + deckBounds.height, z: 4 },
    ],
    layerId: "deck-route",
    zMin: 4,
    zMax: 5,
  });
  const layers = [{ id: "ground-route", name: "Ground / underpass", color: "#55555f", visible: true, locked: false, zMin: 0, zMax: 1 }];
  if (deckRoutes.length) layers.push({ id: "deck-route", name: "Raised deck", color: "#777783", visible: true, locked: false, zMin: 4, zMax: 5 });
  return { version: 1, activeLayerId: groundRoutes.length ? "ground-route" : layers[0].id, layers, nodes, links, areas };
}

function dimetricBlueprints(map) {
  const w = finite(map.width, 1024);
  const h = finite(map.height, 768);
  const projection = { type: "dimetric-2:1", tileWidth: 128, tileHeight: 64, elevationStep: finite(map.projection?.elevationStep, 32), originX: finite(map.projection?.originX, w / 2), originY: finite(map.projection?.originY, 84), worldUnitsPerTile: 128 };
  const ground = authoredObject("platform", { id: "world-ground", name: "World ground plane", x: scaled(w, 0.06), y: scaled(h, 0.08), width: scaled(w, 0.88), height: scaled(h, 0.84), color: "#bdbdb9", solid: false, role: "ground-plane", collisionHeight: 0, collider: { enabled: false, offsetX: 0, offsetY: 0, width: scaled(w, 0.88), height: scaled(h, 0.84), trigger: false, oneWay: false, zMin: 0, zMax: 1 } });
  const block = (variant, index, x, y, width, height) => authoredObject("platform", { id: `spatial-${variant}-block-${index}`, name: `Structure ${index}`, x, y, width, height, color: index % 2 ? "#4b4b52" : "#606068", solid: true, role: "building", requiresSupport: true, supportContact: { mode: "floor", offset: 0, tolerance: 2 }, collisionHeight: 3, collider: { enabled: true, offsetX: 0, offsetY: 0, width, height, trigger: false, oneWay: false, zMin: 0, zMax: 3 } });
  const groundLoopRoutes = [
    route("north-loop", "primary", [{ x: scaled(w, 0.18), y: scaled(h, 0.72) }, { x: scaled(w, 0.28), y: scaled(h, 0.38) }, { x: scaled(w, 0.68), y: scaled(h, 0.32) }, { x: scaled(w, 0.82), y: scaled(h, 0.6) }], 60),
    route("south-loop", "alternate", [{ x: scaled(w, 0.18), y: scaled(h, 0.72) }, { x: scaled(w, 0.42), y: scaled(h, 0.8) }, { x: scaled(w, 0.72), y: scaled(h, 0.72) }, { x: scaled(w, 0.82), y: scaled(h, 0.6) }], 60),
  ];
  const forkRoutes = [
    route("west-fork", "primary", [{ x: scaled(w, 0.18), y: scaled(h, 0.72) }, { x: scaled(w, 0.38), y: scaled(h, 0.48) }, { x: scaled(w, 0.62), y: scaled(h, 0.44) }, { x: scaled(w, 0.82), y: scaled(h, 0.6) }], 60),
    route("east-fork", "alternate", [{ x: scaled(w, 0.18), y: scaled(h, 0.72) }, { x: scaled(w, 0.38), y: scaled(h, 0.7) }, { x: scaled(w, 0.66), y: scaled(h, 0.68) }, { x: scaled(w, 0.82), y: scaled(h, 0.6) }], 60),
  ];
  const deckBounds = { x: scaled(w, 0.35), y: scaled(h, 0.44), width: scaled(w, 0.3), height: scaled(h, 0.2) };
  const deckSupportHeight = Math.max(16, scaled(h, 0.03));
  const deckSupports = [
    authoredObject("platform", { id: "spatial-deck-underpass-support-north", name: "North deck support", x: deckBounds.x, y: deckBounds.y, width: deckBounds.width, height: deckSupportHeight, color: "#55555d", solid: true, role: "support", requiresSupport: true, supportContact: { mode: "floor", offset: 0, tolerance: 2 }, collisionHeight: 4, collider: { enabled: true, offsetX: 0, offsetY: 0, width: deckBounds.width, height: deckSupportHeight, trigger: false, oneWay: false, zMin: 0, zMax: 4 } }),
    authoredObject("platform", { id: "spatial-deck-underpass-support-south", name: "South deck support", x: deckBounds.x, y: deckBounds.y + deckBounds.height - deckSupportHeight, width: deckBounds.width, height: deckSupportHeight, color: "#55555d", solid: true, role: "support", requiresSupport: true, supportContact: { mode: "floor", offset: 0, tolerance: 2 }, collisionHeight: 4, collider: { enabled: true, offsetX: 0, offsetY: 0, width: deckBounds.width, height: deckSupportHeight, trigger: false, oneWay: false, zMin: 0, zMax: 4 } }),
  ];
  const deck = authoredObject("platform", {
    id: "raised-deck",
    name: "Raised route deck",
    ...deckBounds,
    z: 4,
    supportZ: 4,
    color: "#73737b",
    solid: true,
    role: "terrain",
    requiresSupport: true,
    supportContact: { mode: "surface", surfaceId: "spatial-deck-underpass-support-north", offset: 0, tolerance: 2 },
    collisionHeight: 1,
    collider: { enabled: true, offsetX: 0, offsetY: 0, width: deckBounds.width, height: deckBounds.height, trigger: false, oneWay: false, zMin: 4, zMax: 5 },
    depthSlices: [0, 1, 2, 3].map((index) => ({ id: `deck-depth-${index + 1}`, sourceY: rounded(deckBounds.height / 4 * index), height: rounded(deckBounds.height / 4), depthBias: -rounded((4 - index) * 20480) })),
  });
  const layeredRoutes = [
    route("ground-underpass", "primary", [{ x: scaled(w, 0.18), y: scaled(h, 0.72), z: 0 }, { x: scaled(w, 0.38), y: scaled(h, 0.56), z: 0 }, { x: scaled(w, 0.62), y: scaled(h, 0.56), z: 0 }, { x: scaled(w, 0.82), y: scaled(h, 0.6), z: 0 }], 60),
    route("raised-passage", "alternate", [{ x: scaled(w, 0.38), y: scaled(h, 0.56), z: 4 }, { x: scaled(w, 0.5), y: scaled(h, 0.54), z: 4 }, { x: scaled(w, 0.62), y: scaled(h, 0.56), z: 4 }], 60),
  ];
  const finish = (blueprint, deckArea = null) => ({
    ...blueprint,
    mapChanges: {
      controlMode: "topdown",
      gravity: 0,
      projection,
      objects: [ground, ...blueprint.objects],
      navigation: dimetricNavigation(map, blueprint.routes, deckArea),
      traversalPaths: blueprint.routes.map((candidate) => ({ id: `spatial-${candidate.id}`, name: candidate.id.replaceAll("-", " "), kind: "route", collisionOwner: "authored-map", routeLayer: candidate.points.some((point) => point.z >= 2) ? "deck-route" : "ground-route", points: clone(candidate.points), entryRadius: 30, entryZTolerance: 0.5, minimumEntrySpeed: 0, direction: "both", acceleration: 80, maximumSpeed: 440, exitImpulse: { x: 20, y: 0, z: 0 }, transferPathIds: [], bailBehavior: "drop" })),
      clearanceZones: [],
    },
  });
  return [
    finish({ id: "dimetric-ground-loop", family: "dimetric-layered-route", variant: "ground-loop", topology: "loop", branchCount: 1, loopCount: 1, clearance: 60, routes: groundLoopRoutes, objects: [block("ground-loop", 1, scaled(w, 0.38), scaled(h, 0.34), scaled(w, 0.2), scaled(h, 0.24)), block("ground-loop", 2, scaled(w, 0.62), scaled(h, 0.2), scaled(w, 0.16), scaled(h, 0.2))] }),
    finish({ id: "dimetric-fork-merge", family: "dimetric-layered-route", variant: "fork-merge", topology: "fork-merge", branchCount: 1, loopCount: 0, clearance: 60, routes: forkRoutes, objects: [block("fork-merge", 1, scaled(w, 0.46), scaled(h, 0.42), scaled(w, 0.16), scaled(h, 0.18)), block("fork-merge", 2, scaled(w, 0.72), scaled(h, 0.2), scaled(w, 0.13), scaled(h, 0.18))] }),
    finish({ id: "dimetric-deck-underpass", family: "dimetric-layered-route", variant: "deck-underpass", topology: "parallel-layers", branchCount: 1, loopCount: 0, clearance: 60, routes: layeredRoutes, objects: [block("deck-underpass", 1, scaled(w, 0.12), scaled(h, 0.16), scaled(w, 0.18), scaled(h, 0.2)), block("deck-underpass", 2, scaled(w, 0.7), scaled(h, 0.14), scaled(w, 0.16), scaled(h, 0.2)), ...deckSupports, deck] }, deckBounds),
  ];
}

function allBlueprints(map, families) {
  const blueprints = [
    ...(families.includes("sideview-route") ? sideviewBlueprints(map) : []),
    ...(families.includes("topdown-route") ? topdownBlueprints(map) : []),
    ...(families.includes("dimetric-layered-route") ? dimetricBlueprints(map) : []),
  ];
  return blueprints.sort((a, b) => a.id.localeCompare(b.id));
}

function mergePinnedObjects(candidateObjects, originalObjects, pinnedObjectIds) {
  const pinned = new Map((originalObjects ?? []).filter((object) => pinnedObjectIds.includes(object?.id)).map((object) => [object.id, clone(object)]));
  const merged = candidateObjects.filter((object) => !pinned.has(object.id));
  for (const object of pinned.values()) merged.push(object);
  return merged;
}

function prepareBlueprint(map, blueprint, contract) {
  const mapChanges = clone(blueprint.mapChanges);
  mapChanges.objects = mergePinnedObjects(mapChanges.objects, map.objects ?? [], contract.pinnedObjectIds);
  return { ...blueprint, mapChanges };
}

function analyzeBlueprint(map, blueprint, contract) {
  const errors = [];
  const ids = new Set();
  for (const object of blueprint.mapChanges.objects ?? []) {
    if (!object?.id || ids.has(object.id)) errors.push(`Object ID is missing or duplicated: ${object?.id ?? "(missing)"}.`);
    ids.add(object?.id);
    if (![object.x, object.y, object.width, object.height].every((value) => Number.isFinite(Number(value)))) errors.push(`Object ${object?.id ?? "(missing)"} has non-finite bounds.`);
    else if (object.x < 0 || object.y < 0 || object.x + object.width > map.width + 1 || object.y + object.height > map.height + 1) errors.push(`Object ${object.id} extends outside map bounds.`);
    if (object?.collider?.enabled && object.collisionOwner !== "authored-map") errors.push(`Object ${object.id} collider is not owned by authored map data.`);
    if (object?.z !== object?.supportZ && object?.kind !== "decor") errors.push(`Object ${object.id} visual z and support z disagree.`);
    if (object?.collider?.enabled && (finite(object.collider.zMin, object.z) !== finite(object.z) || finite(object.collider.zMax, object.z + 1) <= finite(object.collider.zMin, object.z))) errors.push(`Object ${object.id} has an invalid collision z band.`);
  }
  const routeIds = new Set();
  for (const candidate of blueprint.routes) {
    if (!candidate.id || routeIds.has(candidate.id)) errors.push(`Route ID is missing or duplicated: ${candidate.id ?? "(missing)"}.`);
    routeIds.add(candidate.id);
    if (!Array.isArray(candidate.points) || candidate.points.length < 2) errors.push(`Route ${candidate.id} needs at least two points.`);
    for (const point of candidate.points ?? []) if (![point.x, point.y, point.z].every((value) => Number.isFinite(Number(value))) || point.x < 0 || point.y < 0 || point.x > map.width || point.y > map.height) errors.push(`Route ${candidate.id} contains an invalid or out-of-bounds point.`);
  }
  for (const pinnedId of contract.pinnedObjectIds) {
    const before = (map.objects ?? []).find((object) => object.id === pinnedId);
    const after = (blueprint.mapChanges.objects ?? []).find((object) => object.id === pinnedId);
    if (!before || !after || canonicalSha256(before) !== canonicalSha256(after)) errors.push(`Pinned object changed or disappeared: ${pinnedId}.`);
  }
  const primary = blueprint.routes.find((candidate) => candidate.role === "primary") ?? blueprint.routes[0];
  const routeBeats = primary?.points?.length ?? 0;
  const elevationLayers = new Set(blueprint.routes.flatMap((candidate) => candidate.points.map((point) => finite(point.z, 0)))).size;
  const solidArea = (blueprint.mapChanges.objects ?? []).filter((object) => object.solid && object.collider?.enabled).reduce((total, object) => total + finite(object.width) * finite(object.height), 0);
  const density = Math.max(0, Math.min(1, solidArea / Math.max(1, finite(map.width) * finite(map.height))));
  return {
    errors,
    routeBeats,
    branchCount: blueprint.branchCount,
    loopCount: blueprint.loopCount,
    elevationLayers,
    topology: blueprint.topology,
    clearance: blueprint.clearance,
    density,
    objectCount: blueprint.mapChanges.objects?.length ?? 0,
    routeCount: blueprint.routes.length,
  };
}

function constraintFailures(metrics, constraints) {
  const failed = [];
  if (metrics.routeBeats < constraints.minimumRouteBeats) failed.push("minimum-route-beats");
  if (metrics.routeBeats > constraints.maximumRouteBeats) failed.push("maximum-route-beats");
  if (metrics.branchCount < constraints.minimumBranches) failed.push("minimum-branches");
  if (metrics.branchCount > constraints.maximumBranches) failed.push("maximum-branches");
  if (constraints.cyclePolicy === "forbid" && metrics.loopCount > 0) failed.push("cycles-forbidden");
  if (constraints.cyclePolicy === "required" && metrics.loopCount === 0) failed.push("cycle-required");
  if (constraints.elevationPolicy === "ground-only" && metrics.elevationLayers > 1) failed.push("elevation-forbidden");
  if (constraints.elevationPolicy === "required" && metrics.elevationLayers < 2) failed.push("elevation-required");
  if (metrics.clearance < constraints.minimumClearance) failed.push("minimum-clearance");
  return failed;
}

function descriptorBucket(axis, metrics) {
  if (axis === "topology") return metrics.topology;
  if (axis === "route-beats") return metrics.routeBeats <= 4 ? "short" : metrics.routeBeats <= 6 ? "medium" : "long";
  if (axis === "branches") return metrics.branchCount === 0 ? "none" : metrics.branchCount === 1 ? "one" : "many";
  if (axis === "elevation-layers") return metrics.elevationLayers <= 1 ? "ground" : "layered";
  if (axis === "density") return metrics.density < 0.12 ? "open" : metrics.density < 0.24 ? "balanced" : "dense";
  return "unknown";
}

function descriptorCell(metrics, axes) {
  const values = Object.fromEntries(axes.map((axis) => [axis, descriptorBucket(axis, metrics)]));
  return { axes: clone(axes), values, cellId: axes.map((axis) => `${axis}:${values[axis]}`).join("|") };
}

function issueIdentity(value) {
  return [value?.category, value?.code, value?.mapId, value?.objectId, value?.featureId, value?.testId].map((entry) => entry ?? "").join(":");
}

function doctorSummary(doctor) {
  return {
    profile: doctor?.profile ?? null,
    sourceDigest: doctor?.sourceDigest ?? null,
    digest: doctor?.digest ?? null,
    score: doctor?.score ?? null,
    errorCount: doctor?.errorCount ?? null,
    warningCount: doctor?.warningCount ?? null,
    acceptanceFailures: doctor?.acceptanceResults?.failedCount ?? 0,
    replayFailures: doctor?.replayResults?.failedCount ?? 0,
    deadInputActions: doctor?.inputActionLiveness?.deadCount ?? 0,
    runtimeJoinErrors: (doctor?.runtimeJoinPlan?.issues ?? []).filter((entry) => entry?.severity === "error").length,
    errorKeys: (doctor?.issues ?? []).filter((entry) => entry?.severity === "error").map(issueIdentity).sort(),
  };
}

function noRegressionGates(baseline, candidate, validation, blueprintErrors) {
  const gates = [];
  const gate = (id, passed, detail) => gates.push({ id, passed, detail });
  gate("spatial-blueprint-valid", blueprintErrors.length === 0, blueprintErrors.length ? `${blueprintErrors.length} spatial blueprint error(s).` : "Object identity, bounds, routes, z bands, authored collision, and pins are valid.");
  gate("schema-valid", validation?.valid === true, validation?.valid ? "Candidate project schema is valid." : `${validation?.errors?.length ?? 1} schema error(s).`);
  for (const profile of ["prototype", "production"]) {
    const before = baseline[profile];
    const after = candidate[profile];
    const beforeErrors = new Set(before.errorKeys);
    const introduced = after.errorKeys.filter((key) => !beforeErrors.has(key));
    gate(`${profile}-doctor-no-new-blockers`, introduced.length === 0 && after.errorCount <= before.errorCount, `${before.errorCount} → ${after.errorCount} blocker(s); ${introduced.length} newly introduced.`);
    gate(`${profile}-acceptance-non-regression`, after.acceptanceFailures <= before.acceptanceFailures, `${before.acceptanceFailures} → ${after.acceptanceFailures} acceptance failure(s).`);
    gate(`${profile}-replay-non-regression`, after.replayFailures <= before.replayFailures, `${before.replayFailures} → ${after.replayFailures} replay failure(s).`);
    gate(`${profile}-input-non-regression`, after.deadInputActions <= before.deadInputActions, `${before.deadInputActions} → ${after.deadInputActions} dead action(s).`);
    gate(`${profile}-map-join-non-regression`, after.runtimeJoinErrors <= before.runtimeJoinErrors, `${before.runtimeJoinErrors} → ${after.runtimeJoinErrors} runtime-join blocker(s).`);
  }
  return gates;
}

function previewShape(map, blueprint) {
  return {
    width: map.width,
    height: map.height,
    routes: clone(blueprint.routes),
    objects: (blueprint.mapChanges.objects ?? []).map((object) => ({ id: object.id, kind: object.kind, x: object.x, y: object.y, z: object.z ?? 0, width: object.width, height: object.height, solid: object.solid === true, pinned: false })),
  };
}

function generateEntries(project, contract) {
  const map = selectedMap(project, contract.mapId);
  if (!map) return { map: null, generated: [] };
  const generated = allBlueprints(map, contract.families).map((source) => {
    const blueprint = prepareBlueprint(map, source, contract);
    const metrics = analyzeBlueprint(map, blueprint, contract);
    const failedConstraints = constraintFailures(metrics, contract.constraints);
    const descriptors = descriptorCell(metrics, contract.search.descriptorAxes);
    const blueprintDigest = canonicalSha256({ id: blueprint.id, family: blueprint.family, variant: blueprint.variant, mapId: map.id, mapChanges: blueprint.mapChanges, routes: blueprint.routes });
    return { blueprint, metrics, failedConstraints, descriptors, blueprintDigest };
  });
  return { map, generated };
}

export function runSpatialLayoutSearch(project, options = {}) {
  const sourceDigest = options.sourceDigest ?? null;
  const inspection = inspectSpatialLayoutContract(project, options.contract ?? project?.spatialLayoutContract, { sourceDigest });
  if (!inspection.present) throw new Error("run_spatial_layout_search requires an authored spatialLayoutContract or explicit contract.");
  if (inspection.errors.length) throw new Error(`Spatial layout contract is invalid: ${inspection.errors.join(" ")}`);
  if (typeof options.evaluateCandidate !== "function") throw new Error("run_spatial_layout_search requires the canonical candidate evaluator.");
  const contract = inspection.contract;
  const { map, generated } = generateEntries(project, contract);
  const baselineEvaluation = options.evaluateCandidate(null, project);
  const baselineDoctors = { prototype: doctorSummary(baselineEvaluation.prototypeDoctor), production: doctorSummary(baselineEvaluation.productionDoctor) };
  const eligible = generated.filter((entry) => entry.failedConstraints.length === 0);
  const archive = new Map();
  for (const entry of eligible.sort((a, b) => a.blueprint.id.localeCompare(b.blueprint.id))) if (!archive.has(entry.descriptors.cellId)) archive.set(entry.descriptors.cellId, entry);
  const selected = [...archive.values()].slice(0, contract.search.maxCandidates);
  const candidates = selected.map((entry) => {
    const evaluation = options.evaluateCandidate(entry.blueprint.mapChanges, project, map.id);
    const doctors = { prototype: doctorSummary(evaluation.prototypeDoctor), production: doctorSummary(evaluation.productionDoctor) };
    const gates = noRegressionGates(baselineDoctors, doctors, evaluation.validation, entry.metrics.errors);
    const safe = gates.every((gate) => gate.passed);
    const replacementBlocked = Boolean(map?.objects?.length) && contract.constraints.replacementPolicy !== "replace-explicit";
    const identity = { sourceDigest, contractDigest: inspection.contractDigest, mapId: map.id, id: entry.blueprint.id, blueprintDigest: entry.blueprintDigest, descriptors: entry.descriptors, gates: gates.map((gate) => [gate.id, gate.passed]) };
    const candidateDigest = canonicalSha256(identity);
    const preview = previewShape(map, entry.blueprint);
    for (const object of preview.objects) object.pinned = contract.pinnedObjectIds.includes(object.id);
    return {
      id: entry.blueprint.id,
      mapId: map.id,
      family: entry.blueprint.family,
      variant: entry.blueprint.variant,
      safe,
      materializable: safe && !replacementBlocked,
      replacementBlocked,
      descriptors: entry.descriptors,
      metrics: { ...entry.metrics, errors: clone(entry.metrics.errors) },
      gates,
      failedGateIds: gates.filter((gate) => !gate.passed).map((gate) => gate.id),
      blueprintDigest: entry.blueprintDigest,
      candidateDigest,
      pinnedObjectIds: clone(contract.pinnedObjectIds),
      preview,
      materializationRequest: safe && !replacementBlocked ? { op: "materialize_spatial_layout", candidateId: entry.blueprint.id, expectedCandidateDigest: candidateDigest, expectedSourceDigest: sourceDigest } : null,
      doctor: doctors,
    };
  });
  const excluded = generated.filter((entry) => entry.failedConstraints.length).map((entry) => ({ id: entry.blueprint.id, failedConstraintIds: entry.failedConstraints, descriptors: entry.descriptors }));
  const report = {
    schemaVersion: LOOPLAB_SPATIAL_LAYOUT_SEARCH_SCHEMA,
    status: candidates.length ? "completed" : "infeasible",
    sourceDigest,
    contractDigest: inspection.contractDigest,
    contract,
    map: inspection.map,
    strategy: "deterministic-spatial-descriptor-archive",
    generatedBlueprintCount: generated.length,
    feasibleDescriptorCellCount: archive.size,
    evaluatedCandidateCount: candidates.length,
    candidateBudget: contract.search.maxCandidates,
    safeCandidateIds: candidates.filter((candidate) => candidate.safe).map((candidate) => candidate.id),
    materializableCandidateIds: candidates.filter((candidate) => candidate.materializable).map((candidate) => candidate.id),
    automaticWinner: null,
    agentDecisionRequired: candidates.length > 0,
    candidates,
    excluded,
    infeasibility: candidates.length ? null : { reason: "No projection-compatible spatial blueprint satisfied every authored constraint.", authoredConstraintsPreserved: true },
    decisionBoundary: "Hard gates prove bounded spatial and technical feasibility only. They do not prove fun, pacing, visual composition, originality, or creative preference; no candidate is selected automatically.",
    applicationPolicy: "Search is read-only. On a protected variation, explicitly allow replacement, materialize the exact source-bound candidate, preview the returned ordinary update_map batch, play it, then apply only if the unchanged preview still passes.",
    providerUsage: { provider: "none", measured: true, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, rateEquivalentUsd: 0 },
    limitations: inspection.limitations,
  };
  return { ...report, searchDigest: canonicalSha256({ schemaVersion: report.schemaVersion, sourceDigest, contractDigest: inspection.contractDigest, candidateIdentity: candidates.map((candidate) => [candidate.id, candidate.candidateDigest, candidate.safe, candidate.materializable]), excluded }) };
}

export function materializeSpatialLayout(project, options = {}) {
  const search = runSpatialLayoutSearch(project, options);
  const candidate = search.candidates.find((entry) => entry.id === options.candidateId);
  if (!candidate) throw new Error(`Unknown or constraint-excluded spatial layout candidate: ${options.candidateId ?? "(missing)"}.`);
  if (candidate.candidateDigest !== options.expectedCandidateDigest) throw new Error("Spatial layout candidate digest is stale or does not match the selected candidate.");
  if (!candidate.safe) throw new Error(`Spatial layout candidate ${candidate.id} failed its hard gates.`);
  if (!candidate.materializable) throw new Error("The existing map is protected. Create a project variation and store a replace-explicit spatial layout contract before materializing replacement geometry.");
  const { map, generated } = generateEntries(project, search.contract);
  const selected = generated.find((entry) => entry.blueprint.id === candidate.id);
  if (!map || !selected) throw new Error("The selected spatial layout blueprint is no longer available.");
  const commands = [{ op: "update_map", id: map.id, changes: clone(selected.blueprint.mapChanges) }];
  const previewCommand = { op: "preview_batch", commands, summary: `Materialize reviewed spatial layout ${candidate.id} from ${search.contractDigest}.`, expectedSourceDigest: search.sourceDigest };
  const receipt = {
    schemaVersion: LOOPLAB_SPATIAL_LAYOUT_MATERIALIZATION_SCHEMA,
    sourceDigest: search.sourceDigest,
    contractDigest: search.contractDigest,
    searchDigest: search.searchDigest,
    mapId: map.id,
    candidateId: candidate.id,
    candidateDigest: candidate.candidateDigest,
    blueprintDigest: candidate.blueprintDigest,
    pinnedObjectIds: clone(search.contract.pinnedObjectIds),
    pinnedObjectsDigest: canonicalSha256((map.objects ?? []).filter((object) => search.contract.pinnedObjectIds.includes(object.id)).sort((a, b) => a.id.localeCompare(b.id))),
    commandBatchDigest: canonicalSha256(commands),
    previewCommand,
    mutatesProject: false,
    explicitPreviewAndApplyRequired: true,
    automaticWinner: null,
    providerUsage: { provider: "none", measured: true, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, rateEquivalentUsd: 0 },
  };
  return { ...receipt, materializationDigest: canonicalSha256(receipt) };
}
