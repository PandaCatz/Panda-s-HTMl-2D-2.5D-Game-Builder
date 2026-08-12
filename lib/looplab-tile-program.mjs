import { canonicalSha256 } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_TILE_PROGRAM_SCHEMA = "looplab-tile-program/v1";
export const LOOPLAB_TILE_PROGRAM_REPORT_SCHEMA = "looplab-tile-program-report/v1";
export const LOOPLAB_TILE_REGION_SCHEMA = "looplab-tile-region/v1";
export const LOOPLAB_TILE_PATCH_SCHEMA = "looplab-tile-patch/v1";
export const LOOPLAB_TILE_PATCH_PREVIEW_SCHEMA = "looplab-tile-patch-preview/v1";

export const LOOPLAB_TILE_CELL_FLAGS = Object.freeze({
  horizontal: 0x80000000 >>> 0,
  vertical: 0x40000000,
  diagonal: 0x20000000,
  reserved: 0x10000000,
  paletteMask: 0x0fffffff,
});

export const LOOPLAB_TILE_PROGRAM_LIMITS = Object.freeze({
  chunkSize: 16,
  maximumLayers: 64,
  maximumCollisionLayers: 64,
  maximumPaletteEntries: 4_096,
  maximumTerrainSets: 64,
  maximumTerrainsPerSet: 254,
  maximumVariantsPerSet: 4_096,
  maximumCollisionProfiles: 256,
  maximumChunksPerCollection: 4_096,
  maximumStoredCells: 1_048_576,
  maximumPatchOperations: 4_096,
  maximumRegionCells: 4_096,
  maximumCellDimension: 512,
  maximumGridDimension: 8_192,
  maximumDrawOffset: 8_192,
  maximumElevationMagnitude: 1_024,
});

export const LOOPLAB_TILE_PROGRAM_POLICY = Object.freeze({
  sourceField: "map.tileProgram",
  visualAuthority: "Visual tile words reference stable LoopLab palette entries and explicit transforms. Asset pixels, filenames, alpha, and generated roles do not create gameplay meaning.",
  collisionAuthority: "Tile collision is authored separately through collision layers and profiles owned by the map. Visual tiles and terrain variants never imply collision.",
  terrainAuthority: "Autotiling resolves exact authored edge, corner, or mixed signatures. Missing signatures remain actionable findings; no nearest visual match is invented.",
  deterministicVariation: "Equivalent variants use a stable hash of map, layer, coordinate, terrain-set, and authored variation seed. Source revision and edit order never perturb unaffected cells.",
  projection: "Orthographic and exact 128x64 dimetric maps share logical cell coordinates. World z, support, navigation, collision, depth, and screen projection remain independent authored contracts.",
  rendererBoundary: "Canvas, Phaser, PixiJS, and melonJS may cache or cull the same tile source, but no renderer owns simulation, collision, terrain resolution, or evidence.",
  judgmentBoundary: "Project Doctor can validate references, bounds, signatures, collision ownership, and budgets. It cannot certify visual taste, repetition quality, or fun without browser and playtest evidence.",
});

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const ROOT_FIELDS = new Set(["schemaVersion", "collisionOwner", "cellWidth", "cellHeight", "columns", "rows", "chunkSize", "variationSeed", "palette", "terrainSets", "collisionProfiles", "layers", "collisionLayers"]);
const PALETTE_FIELDS = new Set(["id", "name", "assetId", "frame", "drawOffsetX", "drawOffsetY", "anchor", "probability", "transforms"]);
const TRANSFORM_FIELDS = new Set(["horizontal", "vertical", "diagonal"]);
const TERRAIN_SET_FIELDS = new Set(["id", "name", "kind", "terrainIds", "variants"]);
const VARIANT_FIELDS = new Set(["id", "tileId", "centerTerrainId", "signature", "probability"]);
const LAYER_FIELDS = new Set(["id", "name", "role", "visible", "locked", "opacity", "blendMode", "parallaxX", "parallaxY", "supportZ", "navigationLayerId", "terrainSetId", "chunks", "terrainChunks"]);
const COLLISION_PROFILE_FIELDS = new Set(["id", "name", "shape"]);
const COLLISION_LAYER_FIELDS = new Set(["id", "name", "visible", "locked", "zMin", "zMax", "navigationLayerId", "chunks"]);
const CHUNK_FIELDS = new Set(["x", "y", "width", "height", "cells"]);
const PATCH_FIELDS = new Set(["schemaVersion", "mapId", "operations"]);
const PATCH_OPERATION_FIELDS = new Set(["kind", "layerId", "x", "y", "tileId", "terrainId", "profileId", "flipH", "flipV", "flipD"]);
const PATCH_FIELDS_BY_KIND = Object.freeze({
  "paint-tile": new Set(["kind", "layerId", "x", "y", "tileId", "flipH", "flipV", "flipD"]),
  "erase-tile": new Set(["kind", "layerId", "x", "y"]),
  "paint-terrain": new Set(["kind", "layerId", "x", "y", "terrainId"]),
  "erase-terrain": new Set(["kind", "layerId", "x", "y"]),
  "paint-collision": new Set(["kind", "layerId", "x", "y", "profileId"]),
  "erase-collision": new Set(["kind", "layerId", "x", "y"]),
});
const TERRAIN_KINDS = new Set(["corner", "edge", "mixed"]);
const LAYER_ROLES = new Set(["ground-static", "interleaved", "foreground"]);
const BLEND_MODES = new Set(["normal", "multiply", "screen", "overlay", "darken", "lighten"]);
const ANCHORS = new Set(["top-left", "bottom-left", "bottom-center", "center"]);
const COLLISION_SHAPES = new Set(["solid-full", "one-way-top"]);
const PATCH_KINDS = new Set(["paint-tile", "erase-tile", "paint-terrain", "erase-terrain", "paint-collision", "erase-collision"]);
const SIGNATURE_DIRECTIONS = Object.freeze(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
const SIGNATURE_OFFSETS = Object.freeze([[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]);

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const integer = (value) => Number.isInteger(value);
const stableId = (value) => typeof value === "string" && STABLE_ID.test(value);
const clone = (value) => JSON.parse(JSON.stringify(value));
const compareIds = (first, second) => String(first) < String(second) ? -1 : String(first) > String(second) ? 1 : 0;
const compareChunks = (first, second) => first.y - second.y || first.x - second.x;

function suggestedStableId(value, fallback) {
  const normalized = String(value ?? "").trim().replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^[^A-Za-z0-9]+/, "").replace(/-+$/g, "");
  return normalized || fallback;
}

function boundedInteger(value, fallback, minimum, maximum) {
  return integer(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function boundedNumber(value, fallback, minimum, maximum) {
  return finite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function unknownFields(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function mapsForProject(project = {}) {
  return Array.isArray(project.maps) && project.maps.length
    ? project.maps
    : [{
        id: project.activeMapId ?? "map-main",
        width: project.width,
        height: project.height,
        grid: project.grid,
        projection: project.projection,
        navigation: project.navigation,
        objects: project.objects ?? [],
        collisionGeometry: project.collisionGeometry,
        tileProgram: project.tileProgram,
      }];
}

function mapForProject(project = {}, mapId) {
  const maps = mapsForProject(project);
  return maps.find((map) => map?.id === mapId)
    ?? maps.find((map) => map?.id === project.activeMapId)
    ?? maps[0]
    ?? null;
}

function logicalWorldCellSize(map = {}, project = {}, program = {}) {
  const projection = map.projection ?? project.projection ?? {};
  if (projection.type === "dimetric-2:1") {
    const worldUnitsPerTile = finite(Number(projection.worldUnitsPerTile)) && Number(projection.worldUnitsPerTile) > 0 ? Number(projection.worldUnitsPerTile) : 128;
    return { width: worldUnitsPerTile, height: worldUnitsPerTile };
  }
  return { width: Number(program.cellWidth || 1), height: Number(program.cellHeight || 1) };
}

function normalizeChunk(chunk = {}) {
  const width = boundedInteger(chunk.width, LOOPLAB_TILE_PROGRAM_LIMITS.chunkSize, 1, LOOPLAB_TILE_PROGRAM_LIMITS.chunkSize);
  const height = boundedInteger(chunk.height, LOOPLAB_TILE_PROGRAM_LIMITS.chunkSize, 1, LOOPLAB_TILE_PROGRAM_LIMITS.chunkSize);
  const length = width * height;
  const source = Array.isArray(chunk.cells) ? chunk.cells : [];
  return {
    x: integer(chunk.x) ? chunk.x : 0,
    y: integer(chunk.y) ? chunk.y : 0,
    width,
    height,
    cells: Array.from({ length }, (_, index) => integer(source[index]) && source[index] >= 0 && source[index] <= 0xffffffff ? source[index] >>> 0 : 0),
  };
}

function normalizeChunks(chunks) {
  return (Array.isArray(chunks) ? chunks : []).map(normalizeChunk).sort(compareChunks);
}

function normalizePaletteEntry(entry = {}, index = 0) {
  const transforms = entry.transforms && typeof entry.transforms === "object" && !Array.isArray(entry.transforms) ? entry.transforms : {};
  return {
    id: String(entry.id ?? `tile-${String(index + 1).padStart(3, "0")}`).trim(),
    name: String(entry.name ?? entry.id ?? `Tile ${index + 1}`).trim(),
    assetId: String(entry.assetId ?? "").trim(),
    frame: boundedInteger(entry.frame, 0, 0, 1_000_000),
    drawOffsetX: boundedInteger(entry.drawOffsetX, 0, -LOOPLAB_TILE_PROGRAM_LIMITS.maximumDrawOffset, LOOPLAB_TILE_PROGRAM_LIMITS.maximumDrawOffset),
    drawOffsetY: boundedInteger(entry.drawOffsetY, 0, -LOOPLAB_TILE_PROGRAM_LIMITS.maximumDrawOffset, LOOPLAB_TILE_PROGRAM_LIMITS.maximumDrawOffset),
    anchor: ANCHORS.has(entry.anchor) ? entry.anchor : "top-left",
    probability: boundedNumber(entry.probability, 1, 0, 1_000_000),
    transforms: {
      horizontal: transforms.horizontal === true,
      vertical: transforms.vertical === true,
      diagonal: transforms.diagonal === true,
    },
  };
}

function normalizeVariant(variant = {}, index = 0) {
  const signature = Array.isArray(variant.signature) ? variant.signature : [];
  return {
    id: String(variant.id ?? `variant-${String(index + 1).padStart(3, "0")}`).trim(),
    tileId: String(variant.tileId ?? "").trim(),
    centerTerrainId: String(variant.centerTerrainId ?? "").trim(),
    signature: Array.from({ length: 8 }, (_, directionIndex) => {
      const value = signature[directionIndex];
      return value === null || value === "*" ? value : String(value ?? "*").trim();
    }),
    probability: boundedNumber(variant.probability, 1, 0, 1_000_000),
  };
}

function normalizeTerrainSet(set = {}, index = 0) {
  return {
    id: String(set.id ?? `terrain-${String(index + 1).padStart(2, "0")}`).trim(),
    name: String(set.name ?? set.id ?? `Terrain ${index + 1}`).trim(),
    kind: TERRAIN_KINDS.has(set.kind) ? set.kind : "edge",
    terrainIds: (Array.isArray(set.terrainIds) ? set.terrainIds : []).map((value) => String(value).trim()),
    variants: (Array.isArray(set.variants) ? set.variants : []).map(normalizeVariant),
  };
}

function normalizeLayer(layer = {}, index = 0) {
  return {
    id: String(layer.id ?? `tile-layer-${String(index + 1).padStart(2, "0")}`).trim(),
    name: String(layer.name ?? layer.id ?? `Tile layer ${index + 1}`).trim(),
    role: LAYER_ROLES.has(layer.role) ? layer.role : "ground-static",
    visible: layer.visible !== false,
    locked: layer.locked === true,
    opacity: boundedNumber(layer.opacity, 1, 0, 1),
    blendMode: BLEND_MODES.has(layer.blendMode) ? layer.blendMode : "normal",
    parallaxX: boundedNumber(layer.parallaxX, 1, 0, 8),
    parallaxY: boundedNumber(layer.parallaxY, 1, 0, 8),
    supportZ: boundedNumber(layer.supportZ, 0, -LOOPLAB_TILE_PROGRAM_LIMITS.maximumElevationMagnitude, LOOPLAB_TILE_PROGRAM_LIMITS.maximumElevationMagnitude),
    ...(typeof layer.navigationLayerId === "string" && layer.navigationLayerId.trim() ? { navigationLayerId: layer.navigationLayerId.trim() } : {}),
    ...(typeof layer.terrainSetId === "string" && layer.terrainSetId.trim() ? { terrainSetId: layer.terrainSetId.trim() } : {}),
    chunks: normalizeChunks(layer.chunks),
    terrainChunks: normalizeChunks(layer.terrainChunks),
  };
}

function normalizeCollisionProfile(profile = {}, index = 0) {
  return {
    id: String(profile.id ?? `collision-${String(index + 1).padStart(2, "0")}`).trim(),
    name: String(profile.name ?? profile.id ?? `Collision ${index + 1}`).trim(),
    shape: COLLISION_SHAPES.has(profile.shape) ? profile.shape : "solid-full",
  };
}

function normalizeCollisionLayer(layer = {}, index = 0) {
  const zMin = boundedNumber(layer.zMin, 0, -LOOPLAB_TILE_PROGRAM_LIMITS.maximumElevationMagnitude, LOOPLAB_TILE_PROGRAM_LIMITS.maximumElevationMagnitude);
  return {
    id: String(layer.id ?? `tile-collision-${String(index + 1).padStart(2, "0")}`).trim(),
    name: String(layer.name ?? layer.id ?? `Tile collision ${index + 1}`).trim(),
    visible: layer.visible !== false,
    locked: layer.locked === true,
    zMin,
    zMax: boundedNumber(layer.zMax, zMin + 1, -LOOPLAB_TILE_PROGRAM_LIMITS.maximumElevationMagnitude, LOOPLAB_TILE_PROGRAM_LIMITS.maximumElevationMagnitude),
    ...(typeof layer.navigationLayerId === "string" && layer.navigationLayerId.trim() ? { navigationLayerId: layer.navigationLayerId.trim() } : {}),
    chunks: normalizeChunks(layer.chunks),
  };
}

export function normalizeTileProgram(input = {}) {
  return {
    schemaVersion: LOOPLAB_TILE_PROGRAM_SCHEMA,
    collisionOwner: "authored-map",
    cellWidth: boundedInteger(input.cellWidth, 32, 1, LOOPLAB_TILE_PROGRAM_LIMITS.maximumCellDimension),
    cellHeight: boundedInteger(input.cellHeight, 32, 1, LOOPLAB_TILE_PROGRAM_LIMITS.maximumCellDimension),
    columns: boundedInteger(input.columns, 1, 1, LOOPLAB_TILE_PROGRAM_LIMITS.maximumGridDimension),
    rows: boundedInteger(input.rows, 1, 1, LOOPLAB_TILE_PROGRAM_LIMITS.maximumGridDimension),
    chunkSize: LOOPLAB_TILE_PROGRAM_LIMITS.chunkSize,
    variationSeed: boundedInteger(input.variationSeed, 1, 0, 0x7fffffff),
    palette: (Array.isArray(input.palette) ? input.palette : []).map(normalizePaletteEntry),
    terrainSets: (Array.isArray(input.terrainSets) ? input.terrainSets : []).map(normalizeTerrainSet),
    collisionProfiles: (Array.isArray(input.collisionProfiles) ? input.collisionProfiles : []).map(normalizeCollisionProfile),
    layers: (Array.isArray(input.layers) ? input.layers : []).map(normalizeLayer),
    collisionLayers: (Array.isArray(input.collisionLayers) ? input.collisionLayers : []).map(normalizeCollisionLayer),
  };
}

export function suggestTileProgram(project = {}, options = {}) {
  const map = mapForProject(project, options.mapId);
  if (!map) return {
    schemaVersion: "looplab-tile-program-suggestion/v1",
    provider: "none",
    available: false,
    mapId: options.mapId ?? null,
    program: null,
    report: null,
    sourceAssetIds: [],
    reasons: ["No authored map is available."],
    decisionBoundary: LOOPLAB_TILE_PROGRAM_POLICY.judgmentBoundary,
  };
  const requestedAssetIds = Array.isArray(options.assetIds) ? [...new Set(options.assetIds.map(String))] : null;
  const assets = (Array.isArray(project.assets) ? project.assets : [])
    .filter((asset) => asset?.type === "tileset")
    .filter((asset) => !requestedAssetIds || requestedAssetIds.includes(asset.id))
    .sort((first, second) => compareIds(first.id, second.id));
  const projection = map.projection ?? project.projection ?? {};
  const dimetric = projection.type === "dimetric-2:1";
  const cellWidth = dimetric ? 128 : boundedInteger(projection.tileWidth ?? map.grid ?? project.grid, 32, 1, LOOPLAB_TILE_PROGRAM_LIMITS.maximumCellDimension);
  const cellHeight = dimetric ? 64 : boundedInteger(projection.tileHeight ?? map.grid ?? project.grid, cellWidth, 1, LOOPLAB_TILE_PROGRAM_LIMITS.maximumCellDimension);
  const logicalCell = logicalWorldCellSize(map, project, { cellWidth, cellHeight });
  const usedIds = new Set();
  const palette = [];
  for (const asset of assets) {
    const frameCount = boundedInteger(asset.frames, 1, 1, 1_000_000);
    for (let frame = 0; frame < frameCount && palette.length < LOOPLAB_TILE_PROGRAM_LIMITS.maximumPaletteEntries; frame += 1) {
      const baseId = suggestedStableId(`${asset.id}:frame-${frame}`, `tile-${palette.length + 1}`);
      let id = baseId;
      let suffix = 2;
      while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
      usedIds.add(id);
      palette.push(normalizePaletteEntry({
        id,
        name: `${asset.name ?? asset.id} frame ${frame}`,
        assetId: asset.id,
        frame,
        anchor: dimetric ? "bottom-center" : "top-left",
        transforms: { horizontal: false, vertical: false, diagonal: false },
      }, palette.length));
    }
  }
  const program = normalizeTileProgram({
    cellWidth,
    cellHeight,
    columns: Math.max(1, Math.ceil(Number(map.width ?? project.width ?? logicalCell.width) / logicalCell.width)),
    rows: Math.max(1, Math.ceil(Number(map.height ?? project.height ?? logicalCell.height) / logicalCell.height)),
    variationSeed: boundedInteger(options.variationSeed, 1, 0, 0x7fffffff),
    palette,
    terrainSets: [],
    collisionProfiles: [{ id: "solid-full", name: "Solid full cell", shape: "solid-full" }],
    layers: [{ id: "ground-tiles", name: "Ground tiles", role: dimetric ? "interleaved" : "ground-static", visible: true, locked: false, opacity: 1, blendMode: "normal", parallaxX: 1, parallaxY: 1, supportZ: 0, chunks: [], terrainChunks: [] }],
    collisionLayers: [{ id: "ground-tile-collision", name: "Ground tile collision", visible: true, locked: false, zMin: 0, zMax: 1, chunks: [] }],
  });
  const report = inspectTileProgram(project, program, { mapId: map.id });
  const missingRequested = requestedAssetIds?.filter((id) => !assets.some((asset) => asset.id === id)) ?? [];
  return {
    schemaVersion: "looplab-tile-program-suggestion/v1",
    provider: "none",
    available: report.valid,
    mapId: map.id,
    program,
    report,
    sourceAssetIds: assets.map((asset) => asset.id),
    reasons: [
      ...(palette.length ? [`Prepared ${palette.length} stable visual palette entries from ${assets.length} authored tileset asset${assets.length === 1 ? "" : "s"}.`] : ["Prepared empty canonical layers. Add or select an authored tileset before painting visual cells."]),
      ...(missingRequested.length ? [`Ignored unknown or non-tileset asset IDs: ${missingRequested.join(", ")}.`] : []),
      "Terrain signatures remain empty because LoopLab never infers adjacency metadata or collision from pixels.",
    ],
    instructions: "Review the cell size, palette frames, layer roles, and support z. Author terrain signatures explicitly; paint visual and collision cells through separate digest-bound patches.",
    decisionBoundary: LOOPLAB_TILE_PROGRAM_POLICY.judgmentBoundary,
  };
}

export function tileProgramDigest(input = {}) {
  return canonicalSha256(normalizeTileProgram(input));
}

export function encodeTileCell({ slot = 0, flipH = false, flipV = false, flipD = false } = {}) {
  if (!integer(slot) || slot < 0 || slot > LOOPLAB_TILE_CELL_FLAGS.paletteMask) throw new Error("Tile palette slot must be a bounded non-negative integer.");
  if (slot === 0 && (flipH || flipV || flipD)) throw new Error("An empty tile cell cannot carry transform flags.");
  return ((slot & LOOPLAB_TILE_CELL_FLAGS.paletteMask)
    | (flipH ? LOOPLAB_TILE_CELL_FLAGS.horizontal : 0)
    | (flipV ? LOOPLAB_TILE_CELL_FLAGS.vertical : 0)
    | (flipD ? LOOPLAB_TILE_CELL_FLAGS.diagonal : 0)) >>> 0;
}

export function decodeTileCell(word, palette = []) {
  if (!integer(word) || word < 0 || word > 0xffffffff) return null;
  const unsigned = word >>> 0;
  const slot = unsigned & LOOPLAB_TILE_CELL_FLAGS.paletteMask;
  if (slot === 0) return null;
  return {
    slot,
    tileId: palette[slot - 1]?.id ?? null,
    flipH: Boolean(unsigned & LOOPLAB_TILE_CELL_FLAGS.horizontal),
    flipV: Boolean(unsigned & LOOPLAB_TILE_CELL_FLAGS.vertical),
    flipD: Boolean(unsigned & LOOPLAB_TILE_CELL_FLAGS.diagonal),
  };
}

function chunkKey(x, y) {
  return `${x}:${y}`;
}

function coordinateKey(layerId, x, y) {
  return `${layerId}@${x},${y}`;
}

function parseCoordinateKey(value) {
  const separator = value.lastIndexOf("@");
  const comma = value.lastIndexOf(",");
  return {
    layerId: value.slice(0, separator),
    x: Number(value.slice(separator + 1, comma)),
    y: Number(value.slice(comma + 1)),
  };
}

function compareCoordinateKeys(first, second) {
  const left = parseCoordinateKey(first);
  const right = parseCoordinateKey(second);
  return compareIds(left.layerId, right.layerId) || left.y - right.y || left.x - right.x;
}

function chunkOrigin(value, size) {
  return Math.floor(value / size) * size;
}

function collectionIndex(chunks = []) {
  return new Map(chunks.map((chunk) => [chunkKey(chunk.x, chunk.y), chunk]));
}

function readCellFromIndex(index, x, y, chunkSize) {
  const originX = chunkOrigin(x, chunkSize);
  const originY = chunkOrigin(y, chunkSize);
  const chunk = index.get(chunkKey(originX, originY));
  if (!chunk) return 0;
  const localX = x - chunk.x;
  const localY = y - chunk.y;
  if (localX < 0 || localY < 0 || localX >= chunk.width || localY >= chunk.height) return 0;
  return chunk.cells[localY * chunk.width + localX] >>> 0;
}

function writeCollectionCell(chunks, x, y, value, program) {
  const originX = chunkOrigin(x, program.chunkSize);
  const originY = chunkOrigin(y, program.chunkSize);
  const key = chunkKey(originX, originY);
  let index = chunks.findIndex((chunk) => chunkKey(chunk.x, chunk.y) === key);
  if (index < 0) {
    if (value === 0) return false;
    const width = Math.min(program.chunkSize, program.columns - originX);
    const height = Math.min(program.chunkSize, program.rows - originY);
    chunks.push({ x: originX, y: originY, width, height, cells: Array(width * height).fill(0) });
    chunks.sort(compareChunks);
    index = chunks.findIndex((chunk) => chunkKey(chunk.x, chunk.y) === key);
  }
  const chunk = chunks[index];
  const offset = (y - chunk.y) * chunk.width + (x - chunk.x);
  const next = value >>> 0;
  if ((chunk.cells[offset] >>> 0) === next) return false;
  chunk.cells[offset] = next;
  if (next === 0 && chunk.cells.every((cell) => cell === 0)) chunks.splice(index, 1);
  return true;
}

function createProgramIndexes(program) {
  const paletteById = new Map(program.palette.map((entry, index) => [entry.id, { entry, slot: index + 1 }]));
  const terrainSetById = new Map(program.terrainSets.map((set) => [set.id, set]));
  const collisionProfileById = new Map(program.collisionProfiles.map((entry, index) => [entry.id, { entry, slot: index + 1 }]));
  const layerById = new Map(program.layers.map((layer) => [layer.id, layer]));
  const collisionLayerById = new Map(program.collisionLayers.map((layer) => [layer.id, layer]));
  const visualChunkIndexes = new Map(program.layers.map((layer) => [layer.id, collectionIndex(layer.chunks)]));
  const terrainChunkIndexes = new Map(program.layers.map((layer) => [layer.id, collectionIndex(layer.terrainChunks)]));
  const collisionChunkIndexes = new Map(program.collisionLayers.map((layer) => [layer.id, collectionIndex(layer.chunks)]));
  return { paletteById, terrainSetById, collisionProfileById, layerById, collisionLayerById, visualChunkIndexes, terrainChunkIndexes, collisionChunkIndexes };
}

function terrainIdAt(program, layer, x, y, indexes) {
  if (!layer?.terrainSetId) return null;
  const set = indexes.terrainSetById.get(layer.terrainSetId);
  if (!set) return null;
  const slot = readCellFromIndex(indexes.terrainChunkIndexes.get(layer.id) ?? new Map(), x, y, program.chunkSize);
  return slot === 0 ? null : set.terrainIds[slot - 1] ?? null;
}

function terrainSignatureAt(program, layer, x, y, indexes) {
  return SIGNATURE_OFFSETS.map(([offsetX, offsetY]) => {
    const neighborX = x + offsetX;
    const neighborY = y + offsetY;
    if (neighborX < 0 || neighborY < 0 || neighborX >= program.columns || neighborY >= program.rows) return null;
    return terrainIdAt(program, layer, neighborX, neighborY, indexes);
  });
}

function signatureMatches(expected, actual) {
  return expected.length === 8 && expected.every((value, index) => value === "*" || value === actual[index]);
}

function deterministicUnit(value) {
  const digest = canonicalSha256(value).slice("sha256:".length, "sha256:".length + 13);
  return Number.parseInt(digest, 16) / 0x1_0000_0000_0000;
}

function chooseVariant(candidates, identity) {
  const ordered = candidates.filter((variant) => variant.probability > 0).sort((first, second) => compareIds(first.id, second.id));
  const total = ordered.reduce((sum, variant) => sum + variant.probability, 0);
  if (!(total > 0)) return null;
  let cursor = deterministicUnit(identity) * total;
  for (const variant of ordered) {
    cursor -= variant.probability;
    if (cursor < 0) return variant;
  }
  return ordered.at(-1) ?? null;
}

export function resolveTerrainCell(input, layerId, x, y, { mapId = "map-main", indexes: suppliedIndexes } = {}) {
  const program = normalizeTileProgram(input);
  const indexes = suppliedIndexes ?? createProgramIndexes(program);
  const layer = indexes.layerById.get(layerId);
  if (!layer) return { resolved: false, reason: "unknown-layer", word: 0, tile: null, terrainId: null, signature: null, variantId: null };
  const manualWord = readCellFromIndex(indexes.visualChunkIndexes.get(layerId) ?? new Map(), x, y, program.chunkSize);
  if (manualWord !== 0) return { resolved: true, reason: "manual-override", word: manualWord, tile: decodeTileCell(manualWord, program.palette), terrainId: terrainIdAt(program, layer, x, y, indexes), signature: null, variantId: null };
  const terrainId = terrainIdAt(program, layer, x, y, indexes);
  if (!terrainId) return { resolved: true, reason: "empty", word: 0, tile: null, terrainId: null, signature: null, variantId: null };
  const set = indexes.terrainSetById.get(layer.terrainSetId);
  if (!set) return { resolved: false, reason: "unknown-terrain-set", word: 0, tile: null, terrainId, signature: null, variantId: null };
  const signature = terrainSignatureAt(program, layer, x, y, indexes);
  const candidates = set.variants.filter((variant) => variant.centerTerrainId === terrainId && signatureMatches(variant.signature, signature));
  const variant = chooseVariant(candidates, { mapId, layerId, x, y, terrainSetId: set.id, variationSeed: program.variationSeed });
  if (!variant) return { resolved: false, reason: "missing-signature", word: 0, tile: null, terrainId, signature, variantId: null };
  const palette = indexes.paletteById.get(variant.tileId);
  if (!palette) return { resolved: false, reason: "unknown-variant-tile", word: 0, tile: null, terrainId, signature, variantId: variant.id };
  const word = encodeTileCell({ slot: palette.slot });
  return { resolved: true, reason: "terrain", word, tile: decodeTileCell(word, program.palette), terrainId, signature, variantId: variant.id };
}

function issueProblem(code, message, path) {
  const error = new Error(message);
  error.code = code;
  if (path) error.path = path;
  return error;
}

function requireRegion(program, options = {}) {
  const x = options.x;
  const y = options.y;
  const width = options.width;
  const height = options.height;
  if (![x, y, width, height].every(integer) || x < 0 || y < 0 || width < 1 || height < 1 || x + width > program.columns || y + height > program.rows) {
    throw issueProblem("tile-region-bounds", "Tile region must use positive integral dimensions inside the tile-program grid.", "region");
  }
  if (width * height > LOOPLAB_TILE_PROGRAM_LIMITS.maximumRegionCells) throw issueProblem("tile-region-limit", `Tile region cannot exceed ${LOOPLAB_TILE_PROGRAM_LIMITS.maximumRegionCells} cells.`, "region");
  return { x, y, width, height };
}

export function readTileRegion(input, options = {}) {
  const program = normalizeTileProgram(input);
  const region = requireRegion(program, options);
  const indexes = createProgramIndexes(program);
  const layer = indexes.layerById.get(options.layerId);
  if (!layer) throw issueProblem("tile-region-layer", `Unknown tile layer: ${String(options.layerId)}`, "layerId");
  const collisionLayer = options.collisionLayerId === undefined ? null : indexes.collisionLayerById.get(options.collisionLayerId);
  if (options.collisionLayerId !== undefined && !collisionLayer) throw issueProblem("tile-region-collision-layer", `Unknown tile collision layer: ${String(options.collisionLayerId)}`, "collisionLayerId");
  const manualCells = [];
  const terrainIds = [];
  const resolvedCells = [];
  const resolution = [];
  const collisionProfileIds = [];
  for (let row = 0; row < region.height; row += 1) {
    for (let column = 0; column < region.width; column += 1) {
      const x = region.x + column;
      const y = region.y + row;
      const manualWord = readCellFromIndex(indexes.visualChunkIndexes.get(layer.id) ?? new Map(), x, y, program.chunkSize);
      const resolved = resolveTerrainCell(program, layer.id, x, y, { mapId: options.mapId ?? "map-main", indexes });
      manualCells.push(decodeTileCell(manualWord, program.palette));
      terrainIds.push(terrainIdAt(program, layer, x, y, indexes));
      resolvedCells.push(resolved.tile);
      resolution.push({ resolved: resolved.resolved, reason: resolved.reason, variantId: resolved.variantId, signature: resolved.signature });
      if (collisionLayer) {
        const slot = readCellFromIndex(indexes.collisionChunkIndexes.get(collisionLayer.id) ?? new Map(), x, y, program.chunkSize);
        collisionProfileIds.push(slot === 0 ? null : program.collisionProfiles[slot - 1]?.id ?? null);
      }
    }
  }
  return {
    schemaVersion: LOOPLAB_TILE_REGION_SCHEMA,
    mapId: options.mapId ?? null,
    layerId: layer.id,
    collisionLayerId: collisionLayer?.id ?? null,
    programDigest: tileProgramDigest(program),
    region,
    manualCells,
    terrainIds,
    resolvedCells,
    resolution,
    collisionProfileIds,
  };
}

function validatePatchOperation(program, operation, index, indexes) {
  const path = `operations[${index}]`;
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) throw issueProblem("tile-patch-operation", `${path} must be an object.`, path);
  const unknown = unknownFields(operation, PATCH_OPERATION_FIELDS);
  if (unknown.length) throw issueProblem("tile-patch-operation-field", `${path} contains unsupported fields: ${unknown.join(", ")}.`, path);
  if (!PATCH_KINDS.has(operation.kind)) throw issueProblem("tile-patch-operation-kind", `${path}.kind is unsupported.`, `${path}.kind`);
  const irrelevant = unknownFields(operation, PATCH_FIELDS_BY_KIND[operation.kind]);
  if (irrelevant.length) throw issueProblem("tile-patch-operation-field", `${path} contains fields that are not valid for ${operation.kind}: ${irrelevant.join(", ")}.`, path);
  if (!integer(operation.x) || !integer(operation.y) || operation.x < 0 || operation.y < 0 || operation.x >= program.columns || operation.y >= program.rows) throw issueProblem("tile-patch-coordinate", `${path} must target an integral cell inside the tile-program grid.`, path);
  const collision = operation.kind === "paint-collision" || operation.kind === "erase-collision";
  if (collision) {
    const collisionLayer = indexes.collisionLayerById.get(operation.layerId);
    if (!collisionLayer) throw issueProblem("tile-patch-collision-layer", `${path}.layerId must reference a collision layer.`, `${path}.layerId`);
    if (collisionLayer.locked) throw issueProblem("tile-patch-layer-locked", `${path}.layerId references a locked collision layer.`, `${path}.layerId`);
    if (operation.kind === "paint-collision" && !indexes.collisionProfileById.has(operation.profileId)) throw issueProblem("tile-patch-collision-profile", `${path}.profileId must reference a collision profile.`, `${path}.profileId`);
    return;
  }
  const layer = indexes.layerById.get(operation.layerId);
  if (!layer) throw issueProblem("tile-patch-layer", `${path}.layerId must reference a visual tile layer.`, `${path}.layerId`);
  if (layer.locked) throw issueProblem("tile-patch-layer-locked", `${path}.layerId references a locked visual layer.`, `${path}.layerId`);
  if (operation.kind === "paint-tile") {
    const palette = indexes.paletteById.get(operation.tileId);
    if (!palette) throw issueProblem("tile-patch-tile", `${path}.tileId must reference a palette entry.`, `${path}.tileId`);
    if (operation.flipH === true && !palette.entry.transforms.horizontal) throw issueProblem("tile-patch-transform", `${path} requests an unauthorized horizontal transform.`, `${path}.flipH`);
    if (operation.flipV === true && !palette.entry.transforms.vertical) throw issueProblem("tile-patch-transform", `${path} requests an unauthorized vertical transform.`, `${path}.flipV`);
    if (operation.flipD === true && !palette.entry.transforms.diagonal) throw issueProblem("tile-patch-transform", `${path} requests an unauthorized diagonal transform.`, `${path}.flipD`);
  }
  if (operation.kind === "paint-terrain") {
    const set = indexes.terrainSetById.get(layer.terrainSetId);
    if (!set) throw issueProblem("tile-patch-terrain-set", `${path} targets a layer without a valid terrain set.`, `${path}.layerId`);
    if (!set.terrainIds.includes(operation.terrainId)) throw issueProblem("tile-patch-terrain", `${path}.terrainId must belong to ${set.id}.`, `${path}.terrainId`);
  }
}

function canonicalPatch(patch = {}) {
  return {
    schemaVersion: LOOPLAB_TILE_PATCH_SCHEMA,
    mapId: String(patch.mapId ?? "").trim(),
    operations: (Array.isArray(patch.operations) ? patch.operations : []).map((operation) => ({
      kind: operation.kind,
      layerId: operation.layerId,
      x: operation.x,
      y: operation.y,
      ...(operation.tileId !== undefined ? { tileId: operation.tileId } : {}),
      ...(operation.terrainId !== undefined ? { terrainId: operation.terrainId } : {}),
      ...(operation.profileId !== undefined ? { profileId: operation.profileId } : {}),
      ...(operation.flipH === true ? { flipH: true } : {}),
      ...(operation.flipV === true ? { flipV: true } : {}),
      ...(operation.flipD === true ? { flipD: true } : {}),
    })),
  };
}

function addDirtyCoordinate(target, program, layerId, x, y) {
  if (x < 0 || y < 0 || x >= program.columns || y >= program.rows) return;
  target.add(coordinateKey(layerId, x, y));
}

export function previewTilePatch(input, patch = {}) {
  const before = normalizeTileProgram(input);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw issueProblem("tile-patch-invalid", "Tile patch must be an object.", "patch");
  const unknown = unknownFields(patch, PATCH_FIELDS);
  if (unknown.length) throw issueProblem("tile-patch-field", `Tile patch contains unsupported fields: ${unknown.join(", ")}.`, "patch");
  if (patch.schemaVersion !== LOOPLAB_TILE_PATCH_SCHEMA) throw issueProblem("tile-patch-schema", `Tile patch schemaVersion must be ${LOOPLAB_TILE_PATCH_SCHEMA}.`, "schemaVersion");
  if (!stableId(patch.mapId)) throw issueProblem("tile-patch-map", "Tile patch mapId must be a stable ID.", "mapId");
  if (!Array.isArray(patch.operations) || patch.operations.length < 1 || patch.operations.length > LOOPLAB_TILE_PROGRAM_LIMITS.maximumPatchOperations) throw issueProblem("tile-patch-operations", `Tile patch operations must contain 1-${LOOPLAB_TILE_PROGRAM_LIMITS.maximumPatchOperations} entries.`, "operations");
  const beforeIndexes = createProgramIndexes(before);
  patch.operations.forEach((operation, index) => validatePatchOperation(before, operation, index, beforeIndexes));
  const normalizedPatch = canonicalPatch(patch);
  const after = clone(before);
  const afterIndexes = createProgramIndexes(after);
  const dirtyVisualCoordinates = new Set();
  const dirtyCollisionCoordinates = new Set();
  let directCellWrites = 0;
  let terrainWrites = 0;
  let collisionWrites = 0;

  for (const operation of normalizedPatch.operations) {
    if (operation.kind === "paint-collision" || operation.kind === "erase-collision") {
      const layer = afterIndexes.collisionLayerById.get(operation.layerId);
      const value = operation.kind === "erase-collision" ? 0 : afterIndexes.collisionProfileById.get(operation.profileId).slot;
      if (writeCollectionCell(layer.chunks, operation.x, operation.y, value, after)) collisionWrites += 1;
      addDirtyCoordinate(dirtyCollisionCoordinates, after, layer.id, operation.x, operation.y);
      continue;
    }
    const layer = afterIndexes.layerById.get(operation.layerId);
    if (operation.kind === "paint-tile" || operation.kind === "erase-tile") {
      const value = operation.kind === "erase-tile" ? 0 : encodeTileCell({ slot: afterIndexes.paletteById.get(operation.tileId).slot, flipH: operation.flipH, flipV: operation.flipV, flipD: operation.flipD });
      if (writeCollectionCell(layer.chunks, operation.x, operation.y, value, after)) directCellWrites += 1;
      addDirtyCoordinate(dirtyVisualCoordinates, after, layer.id, operation.x, operation.y);
      continue;
    }
    const set = afterIndexes.terrainSetById.get(layer.terrainSetId);
    const value = operation.kind === "erase-terrain" ? 0 : set.terrainIds.indexOf(operation.terrainId) + 1;
    if (writeCollectionCell(layer.terrainChunks, operation.x, operation.y, value, after)) terrainWrites += 1;
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) addDirtyCoordinate(dirtyVisualCoordinates, after, layer.id, operation.x + offsetX, operation.y + offsetY);
    }
  }

  const refreshedAfterIndexes = createProgramIndexes(after);
  const visualChanges = [];
  const unresolvedSignatures = [];
  for (const coordinate of [...dirtyVisualCoordinates].sort(compareCoordinateKeys)) {
    const { layerId, x, y } = parseCoordinateKey(coordinate);
    const previous = resolveTerrainCell(before, layerId, x, y, { mapId: normalizedPatch.mapId, indexes: beforeIndexes });
    const next = resolveTerrainCell(after, layerId, x, y, { mapId: normalizedPatch.mapId, indexes: refreshedAfterIndexes });
    if (previous.word !== next.word || previous.reason !== next.reason || previous.terrainId !== next.terrainId) {
      visualChanges.push({ layerId, x, y, before: previous.tile, after: next.tile, beforeReason: previous.reason, afterReason: next.reason, terrainId: next.terrainId });
    }
    if (!next.resolved) unresolvedSignatures.push({ layerId, x, y, terrainId: next.terrainId, signature: next.signature, reason: next.reason });
  }

  const collisionChanges = [];
  for (const coordinate of [...dirtyCollisionCoordinates].sort(compareCoordinateKeys)) {
    const { layerId, x, y } = parseCoordinateKey(coordinate);
    const beforeSlot = readCellFromIndex(beforeIndexes.collisionChunkIndexes.get(layerId) ?? new Map(), x, y, before.chunkSize);
    const afterSlot = readCellFromIndex(refreshedAfterIndexes.collisionChunkIndexes.get(layerId) ?? new Map(), x, y, after.chunkSize);
    if (beforeSlot !== afterSlot) collisionChanges.push({ layerId, x, y, beforeProfileId: beforeSlot === 0 ? null : before.collisionProfiles[beforeSlot - 1]?.id ?? null, afterProfileId: afterSlot === 0 ? null : after.collisionProfiles[afterSlot - 1]?.id ?? null });
  }

  const beforeDigest = tileProgramDigest(before);
  const afterDigest = tileProgramDigest(after);
  const patchDigest = canonicalSha256({ tileProgramDigest: beforeDigest, patch: normalizedPatch });
  const dirtyChunkMap = new Map();
  for (const coordinate of [...dirtyVisualCoordinates, ...dirtyCollisionCoordinates]) {
    const { layerId, x, y } = parseCoordinateKey(coordinate);
    const chunkX = chunkOrigin(x, after.chunkSize);
    const chunkY = chunkOrigin(y, after.chunkSize);
    const id = `${layerId}@${chunkX},${chunkY}`;
    dirtyChunkMap.set(id, { id, layerId, x: chunkX, y: chunkY });
  }
  const dirtyChunks = [...dirtyChunkMap.values()].sort((first, second) => compareIds(first.layerId, second.layerId) || first.y - second.y || first.x - second.x);

  return {
    schemaVersion: LOOPLAB_TILE_PATCH_PREVIEW_SCHEMA,
    mapId: normalizedPatch.mapId,
    changed: beforeDigest !== afterDigest,
    tileProgramDigest: beforeDigest,
    projectedTileProgramDigest: afterDigest,
    patchDigest,
    patch: normalizedPatch,
    counts: { operations: normalizedPatch.operations.length, directCellWrites, terrainWrites, collisionWrites, visualChanges: visualChanges.length, collisionChanges: collisionChanges.length, unresolvedSignatures: unresolvedSignatures.length },
    dirtyChunks,
    visualChanges,
    collisionChanges,
    unresolvedSignatures,
    program: after,
  };
}

function inspectChunkCollection(chunks, path, program, cellRule, add) {
  if (!Array.isArray(chunks)) {
    add("error", "tile-chunks-invalid", `${path} must be an array.`, { path });
    return { chunks: 0, storedCells: 0, nonEmptyCells: 0 };
  }
  if (chunks.length > LOOPLAB_TILE_PROGRAM_LIMITS.maximumChunksPerCollection) add("error", "tile-chunk-limit", `${path} cannot exceed ${LOOPLAB_TILE_PROGRAM_LIMITS.maximumChunksPerCollection} chunks.`, { path });
  const keys = new Set();
  let storedCells = 0;
  let nonEmptyCells = 0;
  for (const [index, chunk] of chunks.entries()) {
    const chunkPath = `${path}[${index}]`;
    if (!chunk || typeof chunk !== "object" || Array.isArray(chunk)) {
      add("error", "tile-chunk-invalid", `${chunkPath} must be an object.`, { path: chunkPath });
      continue;
    }
    const unknown = unknownFields(chunk, CHUNK_FIELDS);
    if (unknown.length) add("error", "tile-chunk-field", `${chunkPath} contains unsupported fields: ${unknown.join(", ")}.`, { path: chunkPath });
    if (!integer(chunk.x) || !integer(chunk.y) || chunk.x < 0 || chunk.y < 0 || chunk.x % program.chunkSize !== 0 || chunk.y % program.chunkSize !== 0) add("error", "tile-chunk-origin", `${chunkPath} must use non-negative chunk-aligned integral x/y coordinates.`, { path: chunkPath });
    const key = chunkKey(chunk.x, chunk.y);
    if (keys.has(key)) add("error", "tile-chunk-duplicate", `${chunkPath} duplicates chunk ${key}.`, { path: chunkPath });
    keys.add(key);
    if (!integer(chunk.width) || !integer(chunk.height) || chunk.width < 1 || chunk.height < 1 || chunk.width > program.chunkSize || chunk.height > program.chunkSize || chunk.x + chunk.width > program.columns || chunk.y + chunk.height > program.rows) add("error", "tile-chunk-bounds", `${chunkPath} dimensions must remain inside the grid and chunk bound.`, { path: chunkPath });
    else {
      const expectedWidth = Math.min(program.chunkSize, program.columns - chunk.x);
      const expectedHeight = Math.min(program.chunkSize, program.rows - chunk.y);
      if (chunk.width !== expectedWidth || chunk.height !== expectedHeight) add("error", "tile-chunk-shape", `${chunkPath} must use the complete ${expectedWidth}×${expectedHeight} chunk shape at this origin.`, { path: chunkPath });
    }
    const expectedLength = integer(chunk.width) && integer(chunk.height) ? chunk.width * chunk.height : -1;
    if (!Array.isArray(chunk.cells) || chunk.cells.length !== expectedLength) {
      add("error", "tile-chunk-cells", `${chunkPath}.cells must contain exactly width × height entries.`, { path: `${chunkPath}.cells` });
      continue;
    }
    storedCells += chunk.cells.length;
    for (const [cellIndex, cell] of chunk.cells.entries()) {
      if (cell !== 0) nonEmptyCells += 1;
      cellRule(cell, `${chunkPath}.cells[${cellIndex}]`);
    }
    if (chunk.cells.every((cell) => cell === 0)) add("warning", "tile-empty-chunk", `${chunkPath} is empty and should be omitted from sparse source.`, { path: chunkPath });
  }
  if (storedCells > LOOPLAB_TILE_PROGRAM_LIMITS.maximumStoredCells) add("error", "tile-stored-cell-limit", `${path} exceeds ${LOOPLAB_TILE_PROGRAM_LIMITS.maximumStoredCells} stored cells.`, { path });
  return { chunks: chunks.length, storedCells, nonEmptyCells };
}

export function inspectTileProgram(project = {}, input, options = {}) {
  const map = mapForProject(project, options.mapId);
  const value = input === undefined ? map?.tileProgram : input;
  const present = value !== undefined && value !== null;
  const issues = [];
  const add = (severity, code, message, detail = {}) => {
    if (issues.length < 512) issues.push({ severity, code, message, ...detail });
  };
  const report = {
    schemaVersion: LOOPLAB_TILE_PROGRAM_REPORT_SCHEMA,
    present,
    valid: true,
    mapId: map?.id ?? options.mapId ?? null,
    programDigest: null,
    counts: { palette: 0, terrainSets: 0, terrainVariants: 0, layers: 0, collisionProfiles: 0, collisionLayers: 0, chunks: 0, storedCells: 0, nonEmptyCells: 0, unresolvedTerrainCells: 0 },
    issues,
    errors: [],
    warnings: [],
    policy: LOOPLAB_TILE_PROGRAM_POLICY,
  };
  if (!present) return report;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    add("error", "tile-program-invalid", "tileProgram must be an object.", { path: "tileProgram" });
    report.errors = issues.filter((issue) => issue.severity === "error");
    report.warnings = issues.filter((issue) => issue.severity === "warning");
    report.valid = false;
    return report;
  }

  const unknownRoot = unknownFields(value, ROOT_FIELDS);
  if (unknownRoot.length) add("error", "tile-program-field", `tileProgram contains unsupported fields: ${unknownRoot.join(", ")}.`, { path: "tileProgram" });
  if (value.schemaVersion !== LOOPLAB_TILE_PROGRAM_SCHEMA) add("error", "tile-program-schema", `tileProgram.schemaVersion must be ${LOOPLAB_TILE_PROGRAM_SCHEMA}.`, { path: "tileProgram.schemaVersion" });
  if (value.collisionOwner !== "authored-map") add("error", "tile-program-owner", "tileProgram.collisionOwner must be authored-map.", { path: "tileProgram.collisionOwner" });
  for (const field of ["cellWidth", "cellHeight", "columns", "rows", "chunkSize", "variationSeed"]) {
    if (!integer(value[field])) add("error", "tile-program-integer", `tileProgram.${field} must be an integer.`, { path: `tileProgram.${field}` });
  }
  if (integer(value.cellWidth) && (value.cellWidth < 1 || value.cellWidth > LOOPLAB_TILE_PROGRAM_LIMITS.maximumCellDimension)) add("error", "tile-program-cell-size", "tileProgram.cellWidth exceeds its supported bound.", { path: "tileProgram.cellWidth" });
  if (integer(value.cellHeight) && (value.cellHeight < 1 || value.cellHeight > LOOPLAB_TILE_PROGRAM_LIMITS.maximumCellDimension)) add("error", "tile-program-cell-size", "tileProgram.cellHeight exceeds its supported bound.", { path: "tileProgram.cellHeight" });
  if (integer(value.columns) && (value.columns < 1 || value.columns > LOOPLAB_TILE_PROGRAM_LIMITS.maximumGridDimension)) add("error", "tile-program-grid", "tileProgram.columns exceeds its supported bound.", { path: "tileProgram.columns" });
  if (integer(value.rows) && (value.rows < 1 || value.rows > LOOPLAB_TILE_PROGRAM_LIMITS.maximumGridDimension)) add("error", "tile-program-grid", "tileProgram.rows exceeds its supported bound.", { path: "tileProgram.rows" });
  if (value.chunkSize !== LOOPLAB_TILE_PROGRAM_LIMITS.chunkSize) add("error", "tile-program-chunk-size", `tileProgram.chunkSize must be ${LOOPLAB_TILE_PROGRAM_LIMITS.chunkSize} in v1.`, { path: "tileProgram.chunkSize" });
  if (integer(value.variationSeed) && (value.variationSeed < 0 || value.variationSeed > 0x7fffffff)) add("error", "tile-program-seed", "tileProgram.variationSeed must be between 0 and 2147483647.", { path: "tileProgram.variationSeed" });

  const program = normalizeTileProgram(value);
  report.programDigest = tileProgramDigest(program);
  const projection = map?.projection ?? project.projection ?? { type: "orthographic", tileWidth: map?.grid ?? project.grid, tileHeight: map?.grid ?? project.grid };
  if (projection?.type === "dimetric-2:1" && (program.cellWidth !== 128 || program.cellHeight !== 64)) add("error", "tile-program-dimetric-size", "Dimetric tileProgram cells must use exact 128×64 diamonds.", { path: "tileProgram" });
  if (finite(projection?.tileWidth) && program.cellWidth !== projection.tileWidth) add("error", "tile-program-projection-size", "tileProgram.cellWidth must match the authored projection tileWidth.", { path: "tileProgram.cellWidth" });
  if (finite(projection?.tileHeight) && program.cellHeight !== projection.tileHeight) add("error", "tile-program-projection-size", "tileProgram.cellHeight must match the authored projection tileHeight.", { path: "tileProgram.cellHeight" });
  const logicalCell = logicalWorldCellSize(map, project, program);
  if (finite(map?.width) && program.columns !== Math.ceil(map.width / logicalCell.width)) add("error", "tile-program-columns", "tileProgram.columns must exactly cover the authored map width in logical world cells.", { path: "tileProgram.columns" });
  if (finite(map?.height) && program.rows !== Math.ceil(map.height / logicalCell.height)) add("error", "tile-program-rows", "tileProgram.rows must exactly cover the authored map height in logical world cells.", { path: "tileProgram.rows" });

  const assets = new Map((project.assets ?? []).map((asset) => [asset.id, asset]));
  const paletteIds = new Set();
  if (!Array.isArray(value.palette)) add("error", "tile-palette-invalid", "tileProgram.palette must be an array.", { path: "tileProgram.palette" });
  else {
    report.counts.palette = value.palette.length;
    if (value.palette.length > LOOPLAB_TILE_PROGRAM_LIMITS.maximumPaletteEntries) add("error", "tile-palette-limit", `tileProgram.palette cannot exceed ${LOOPLAB_TILE_PROGRAM_LIMITS.maximumPaletteEntries} entries.`, { path: "tileProgram.palette" });
    for (const [index, entry] of value.palette.entries()) {
      const path = `tileProgram.palette[${index}]`;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) { add("error", "tile-palette-entry", `${path} must be an object.`, { path }); continue; }
      const unknown = unknownFields(entry, PALETTE_FIELDS);
      if (unknown.length) add("error", "tile-palette-field", `${path} contains unsupported fields: ${unknown.join(", ")}.`, { path });
      if (!stableId(entry.id)) add("error", "tile-palette-id", `${path}.id must be a stable ID.`, { path: `${path}.id` });
      else if (paletteIds.has(entry.id)) add("error", "tile-palette-duplicate", `${path}.id duplicates ${entry.id}.`, { path: `${path}.id` });
      else paletteIds.add(entry.id);
      if (typeof entry.name !== "string" || !entry.name.trim()) add("error", "tile-palette-name", `${path}.name must be non-empty.`, { path: `${path}.name` });
      const asset = assets.get(entry.assetId);
      if (!asset) add("error", "tile-palette-asset", `${path}.assetId must reference an authored project asset.`, { path: `${path}.assetId` });
      else {
        const frames = Math.max(1, Number(asset.frames ?? 1));
        if (!integer(entry.frame) || entry.frame < 0 || entry.frame >= frames) add("error", "tile-palette-frame", `${path}.frame must reference an existing asset frame.`, { path: `${path}.frame` });
        if (asset.type !== "tileset") add("warning", "tile-palette-asset-type", `${path}.assetId is not typed as a tileset; review its atlas and frame evidence.`, { path: `${path}.assetId` });
      }
      if (!integer(entry.drawOffsetX) || Math.abs(entry.drawOffsetX) > LOOPLAB_TILE_PROGRAM_LIMITS.maximumDrawOffset || !integer(entry.drawOffsetY) || Math.abs(entry.drawOffsetY) > LOOPLAB_TILE_PROGRAM_LIMITS.maximumDrawOffset) add("error", "tile-palette-offset", `${path} draw offsets must be bounded integers.`, { path });
      if (!ANCHORS.has(entry.anchor)) add("error", "tile-palette-anchor", `${path}.anchor is unsupported.`, { path: `${path}.anchor` });
      if (!finite(entry.probability) || entry.probability < 0 || entry.probability > 1_000_000) add("error", "tile-palette-probability", `${path}.probability must be finite and bounded.`, { path: `${path}.probability` });
      if (!entry.transforms || typeof entry.transforms !== "object" || Array.isArray(entry.transforms)) add("error", "tile-palette-transforms", `${path}.transforms must be an object.`, { path: `${path}.transforms` });
      else {
        const transformUnknown = unknownFields(entry.transforms, TRANSFORM_FIELDS);
        if (transformUnknown.length) add("error", "tile-palette-transform-field", `${path}.transforms contains unsupported fields: ${transformUnknown.join(", ")}.`, { path: `${path}.transforms` });
        for (const field of TRANSFORM_FIELDS) if (typeof entry.transforms[field] !== "boolean") add("error", "tile-palette-transform", `${path}.transforms.${field} must be boolean.`, { path: `${path}.transforms.${field}` });
      }
    }
  }

  const terrainSetIds = new Set();
  if (!Array.isArray(value.terrainSets)) add("error", "tile-terrain-sets", "tileProgram.terrainSets must be an array.", { path: "tileProgram.terrainSets" });
  else {
    report.counts.terrainSets = value.terrainSets.length;
    if (value.terrainSets.length > LOOPLAB_TILE_PROGRAM_LIMITS.maximumTerrainSets) add("error", "tile-terrain-set-limit", `tileProgram.terrainSets cannot exceed ${LOOPLAB_TILE_PROGRAM_LIMITS.maximumTerrainSets}.`, { path: "tileProgram.terrainSets" });
    for (const [setIndex, set] of value.terrainSets.entries()) {
      const path = `tileProgram.terrainSets[${setIndex}]`;
      if (!set || typeof set !== "object" || Array.isArray(set)) { add("error", "tile-terrain-set", `${path} must be an object.`, { path }); continue; }
      const unknown = unknownFields(set, TERRAIN_SET_FIELDS);
      if (unknown.length) add("error", "tile-terrain-set-field", `${path} contains unsupported fields: ${unknown.join(", ")}.`, { path });
      if (!stableId(set.id)) add("error", "tile-terrain-set-id", `${path}.id must be a stable ID.`, { path: `${path}.id` });
      else if (terrainSetIds.has(set.id)) add("error", "tile-terrain-set-duplicate", `${path}.id duplicates ${set.id}.`, { path: `${path}.id` });
      else terrainSetIds.add(set.id);
      if (!TERRAIN_KINDS.has(set.kind)) add("error", "tile-terrain-kind", `${path}.kind must be corner, edge, or mixed.`, { path: `${path}.kind` });
      if (!Array.isArray(set.terrainIds) || set.terrainIds.length < 1 || set.terrainIds.length > LOOPLAB_TILE_PROGRAM_LIMITS.maximumTerrainsPerSet) add("error", "tile-terrain-ids", `${path}.terrainIds must contain 1-${LOOPLAB_TILE_PROGRAM_LIMITS.maximumTerrainsPerSet} stable IDs.`, { path: `${path}.terrainIds` });
      const terrainIds = new Set();
      for (const [terrainIndex, terrainId] of (set.terrainIds ?? []).entries()) {
        if (!stableId(terrainId) || terrainIds.has(terrainId)) add("error", "tile-terrain-id", `${path}.terrainIds[${terrainIndex}] must be a unique stable ID.`, { path: `${path}.terrainIds[${terrainIndex}]` });
        terrainIds.add(terrainId);
      }
      if (!Array.isArray(set.variants) || set.variants.length > LOOPLAB_TILE_PROGRAM_LIMITS.maximumVariantsPerSet) add("error", "tile-terrain-variants", `${path}.variants must be a bounded array.`, { path: `${path}.variants` });
      const variantIds = new Set();
      report.counts.terrainVariants += Array.isArray(set.variants) ? set.variants.length : 0;
      for (const [variantIndex, variant] of (set.variants ?? []).entries()) {
        const variantPath = `${path}.variants[${variantIndex}]`;
        if (!variant || typeof variant !== "object" || Array.isArray(variant)) { add("error", "tile-terrain-variant", `${variantPath} must be an object.`, { path: variantPath }); continue; }
        const variantUnknown = unknownFields(variant, VARIANT_FIELDS);
        if (variantUnknown.length) add("error", "tile-terrain-variant-field", `${variantPath} contains unsupported fields: ${variantUnknown.join(", ")}.`, { path: variantPath });
        if (!stableId(variant.id) || variantIds.has(variant.id)) add("error", "tile-terrain-variant-id", `${variantPath}.id must be a unique stable ID.`, { path: `${variantPath}.id` });
        variantIds.add(variant.id);
        if (!paletteIds.has(variant.tileId)) add("error", "tile-terrain-variant-tile", `${variantPath}.tileId must reference a palette entry.`, { path: `${variantPath}.tileId` });
        if (!terrainIds.has(variant.centerTerrainId)) add("error", "tile-terrain-variant-center", `${variantPath}.centerTerrainId must reference this set's terrainIds.`, { path: `${variantPath}.centerTerrainId` });
        if (!Array.isArray(variant.signature) || variant.signature.length !== 8) add("error", "tile-terrain-signature", `${variantPath}.signature must contain N, NE, E, SE, S, SW, W, NW.`, { path: `${variantPath}.signature` });
        else {
          variant.signature.forEach((part, directionIndex) => {
            if (part !== null && part !== "*" && !terrainIds.has(part)) add("error", "tile-terrain-signature-value", `${variantPath}.signature[${directionIndex}] must be null, *, or a terrain ID.`, { path: `${variantPath}.signature[${directionIndex}]`, direction: SIGNATURE_DIRECTIONS[directionIndex] });
            const diagonal = directionIndex % 2 === 1;
            if (set.kind === "edge" && diagonal && part !== "*") add("error", "tile-terrain-signature-kind", `${variantPath} edge signatures must wildcard diagonal directions.`, { path: `${variantPath}.signature[${directionIndex}]` });
            if (set.kind === "corner" && !diagonal && part !== "*") add("error", "tile-terrain-signature-kind", `${variantPath} corner signatures must wildcard cardinal directions.`, { path: `${variantPath}.signature[${directionIndex}]` });
            if (set.kind === "mixed" && part === "*") add("error", "tile-terrain-signature-kind", `${variantPath} mixed signatures must author every direction.`, { path: `${variantPath}.signature[${directionIndex}]` });
          });
        }
        if (!finite(variant.probability) || variant.probability < 0 || variant.probability > 1_000_000) add("error", "tile-terrain-variant-probability", `${variantPath}.probability must be finite and bounded.`, { path: `${variantPath}.probability` });
      }
    }
  }

  const collisionProfileIds = new Set();
  if (!Array.isArray(value.collisionProfiles)) add("error", "tile-collision-profiles", "tileProgram.collisionProfiles must be an array.", { path: "tileProgram.collisionProfiles" });
  else {
    report.counts.collisionProfiles = value.collisionProfiles.length;
    if (value.collisionProfiles.length > LOOPLAB_TILE_PROGRAM_LIMITS.maximumCollisionProfiles) add("error", "tile-collision-profile-limit", `tileProgram.collisionProfiles cannot exceed ${LOOPLAB_TILE_PROGRAM_LIMITS.maximumCollisionProfiles}.`, { path: "tileProgram.collisionProfiles" });
    for (const [index, profile] of value.collisionProfiles.entries()) {
      const path = `tileProgram.collisionProfiles[${index}]`;
      if (!profile || typeof profile !== "object" || Array.isArray(profile)) { add("error", "tile-collision-profile", `${path} must be an object.`, { path }); continue; }
      const unknown = unknownFields(profile, COLLISION_PROFILE_FIELDS);
      if (unknown.length) add("error", "tile-collision-profile-field", `${path} contains unsupported fields: ${unknown.join(", ")}.`, { path });
      if (!stableId(profile.id) || collisionProfileIds.has(profile.id)) add("error", "tile-collision-profile-id", `${path}.id must be a unique stable ID.`, { path: `${path}.id` });
      collisionProfileIds.add(profile.id);
      if (typeof profile.name !== "string" || !profile.name.trim()) add("error", "tile-collision-profile-name", `${path}.name must be non-empty.`, { path: `${path}.name` });
      if (!COLLISION_SHAPES.has(profile.shape)) add("error", "tile-collision-profile-shape", `${path}.shape must be solid-full or one-way-top.`, { path: `${path}.shape` });
    }
  }

  const navigationLayerIds = new Set(map?.navigation?.layers?.map((layer) => layer.id) ?? []);
  const indexes = createProgramIndexes(program);
  const visualWordRule = (word, path) => {
    if (!integer(word) || word < 0 || word > 0xffffffff) { add("error", "tile-cell-word", `${path} must be an unsigned 32-bit integer.`, { path }); return; }
    const unsigned = word >>> 0;
    const slot = unsigned & LOOPLAB_TILE_CELL_FLAGS.paletteMask;
    if (unsigned & LOOPLAB_TILE_CELL_FLAGS.reserved) add("error", "tile-cell-reserved", `${path} uses the reserved transform bit.`, { path });
    if (slot > program.palette.length) add("error", "tile-cell-palette", `${path} references missing palette slot ${slot}.`, { path });
    if (slot === 0 && unsigned !== 0) add("error", "tile-cell-empty-flags", `${path} cannot apply transforms to an empty tile.`, { path });
    if (slot > 0) {
      const entry = program.palette[slot - 1];
      if ((unsigned & LOOPLAB_TILE_CELL_FLAGS.horizontal) && !entry.transforms.horizontal) add("error", "tile-cell-transform", `${path} uses an unauthorized horizontal transform.`, { path });
      if ((unsigned & LOOPLAB_TILE_CELL_FLAGS.vertical) && !entry.transforms.vertical) add("error", "tile-cell-transform", `${path} uses an unauthorized vertical transform.`, { path });
      if ((unsigned & LOOPLAB_TILE_CELL_FLAGS.diagonal) && !entry.transforms.diagonal) add("error", "tile-cell-transform", `${path} uses an unauthorized diagonal transform.`, { path });
    }
  };

  const layerIds = new Set();
  if (!Array.isArray(value.layers)) add("error", "tile-layers-invalid", "tileProgram.layers must be an array.", { path: "tileProgram.layers" });
  else {
    report.counts.layers = value.layers.length;
    if (value.layers.length > LOOPLAB_TILE_PROGRAM_LIMITS.maximumLayers) add("error", "tile-layer-limit", `tileProgram.layers cannot exceed ${LOOPLAB_TILE_PROGRAM_LIMITS.maximumLayers}.`, { path: "tileProgram.layers" });
    for (const [index, layer] of value.layers.entries()) {
      const path = `tileProgram.layers[${index}]`;
      if (!layer || typeof layer !== "object" || Array.isArray(layer)) { add("error", "tile-layer", `${path} must be an object.`, { path }); continue; }
      const unknown = unknownFields(layer, LAYER_FIELDS);
      if (unknown.length) add("error", "tile-layer-field", `${path} contains unsupported fields: ${unknown.join(", ")}.`, { path });
      if (!stableId(layer.id) || layerIds.has(layer.id)) add("error", "tile-layer-id", `${path}.id must be a unique stable ID.`, { path: `${path}.id` });
      layerIds.add(layer.id);
      if (typeof layer.name !== "string" || !layer.name.trim()) add("error", "tile-layer-name", `${path}.name must be non-empty.`, { path: `${path}.name` });
      if (!LAYER_ROLES.has(layer.role)) add("error", "tile-layer-role", `${path}.role is unsupported.`, { path: `${path}.role` });
      if (typeof layer.visible !== "boolean" || typeof layer.locked !== "boolean") add("error", "tile-layer-state", `${path}.visible and locked must be boolean.`, { path });
      if (!finite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) add("error", "tile-layer-opacity", `${path}.opacity must be between 0 and 1.`, { path: `${path}.opacity` });
      if (!BLEND_MODES.has(layer.blendMode)) add("error", "tile-layer-blend", `${path}.blendMode is unsupported.`, { path: `${path}.blendMode` });
      if (!finite(layer.parallaxX) || layer.parallaxX < 0 || layer.parallaxX > 8 || !finite(layer.parallaxY) || layer.parallaxY < 0 || layer.parallaxY > 8) add("error", "tile-layer-parallax", `${path} parallax values must be finite and bounded.`, { path });
      if (!finite(layer.supportZ) || Math.abs(layer.supportZ) > LOOPLAB_TILE_PROGRAM_LIMITS.maximumElevationMagnitude) add("error", "tile-layer-support", `${path}.supportZ must be a bounded elevation.`, { path: `${path}.supportZ` });
      if (layer.navigationLayerId !== undefined && !navigationLayerIds.has(layer.navigationLayerId)) add("error", "tile-layer-navigation", `${path}.navigationLayerId must reference an authored navigation layer.`, { path: `${path}.navigationLayerId` });
      if (layer.terrainSetId !== undefined && !terrainSetIds.has(layer.terrainSetId)) add("error", "tile-layer-terrain-set", `${path}.terrainSetId must reference an authored terrain set.`, { path: `${path}.terrainSetId` });
      if ((layer.terrainChunks?.length ?? 0) > 0 && !layer.terrainSetId) add("error", "tile-layer-terrain-missing", `${path} has terrain chunks without terrainSetId.`, { path: `${path}.terrainSetId` });
      const visual = inspectChunkCollection(layer.chunks, `${path}.chunks`, program, visualWordRule, add);
      const set = indexes.terrainSetById.get(layer.terrainSetId);
      const terrain = inspectChunkCollection(layer.terrainChunks, `${path}.terrainChunks`, program, (cell, cellPath) => {
        if (!integer(cell) || cell < 0 || cell > (set?.terrainIds.length ?? 0)) add("error", "tile-terrain-cell", `${cellPath} must reference this layer's terrain palette.`, { path: cellPath });
      }, add);
      report.counts.chunks += visual.chunks + terrain.chunks;
      report.counts.storedCells += visual.storedCells + terrain.storedCells;
      report.counts.nonEmptyCells += visual.nonEmptyCells + terrain.nonEmptyCells;
    }
  }

  const collisionLayerIds = new Set();
  if (!Array.isArray(value.collisionLayers)) add("error", "tile-collision-layers", "tileProgram.collisionLayers must be an array.", { path: "tileProgram.collisionLayers" });
  else {
    report.counts.collisionLayers = value.collisionLayers.length;
    if (value.collisionLayers.length > LOOPLAB_TILE_PROGRAM_LIMITS.maximumCollisionLayers) add("error", "tile-collision-layer-limit", `tileProgram.collisionLayers cannot exceed ${LOOPLAB_TILE_PROGRAM_LIMITS.maximumCollisionLayers}.`, { path: "tileProgram.collisionLayers" });
    for (const [index, layer] of value.collisionLayers.entries()) {
      const path = `tileProgram.collisionLayers[${index}]`;
      if (!layer || typeof layer !== "object" || Array.isArray(layer)) { add("error", "tile-collision-layer", `${path} must be an object.`, { path }); continue; }
      const unknown = unknownFields(layer, COLLISION_LAYER_FIELDS);
      if (unknown.length) add("error", "tile-collision-layer-field", `${path} contains unsupported fields: ${unknown.join(", ")}.`, { path });
      if (!stableId(layer.id) || collisionLayerIds.has(layer.id)) add("error", "tile-collision-layer-id", `${path}.id must be a unique stable ID.`, { path: `${path}.id` });
      collisionLayerIds.add(layer.id);
      if (typeof layer.name !== "string" || !layer.name.trim()) add("error", "tile-collision-layer-name", `${path}.name must be non-empty.`, { path: `${path}.name` });
      if (typeof layer.visible !== "boolean" || typeof layer.locked !== "boolean") add("error", "tile-collision-layer-state", `${path}.visible and locked must be boolean.`, { path });
      if (!finite(layer.zMin) || !finite(layer.zMax) || Math.abs(layer.zMin) > LOOPLAB_TILE_PROGRAM_LIMITS.maximumElevationMagnitude || Math.abs(layer.zMax) > LOOPLAB_TILE_PROGRAM_LIMITS.maximumElevationMagnitude || layer.zMax <= layer.zMin) add("error", "tile-collision-layer-z", `${path} requires bounded zMax > zMin.`, { path });
      if (layer.navigationLayerId !== undefined && !navigationLayerIds.has(layer.navigationLayerId)) add("error", "tile-collision-layer-navigation", `${path}.navigationLayerId must reference an authored navigation layer.`, { path: `${path}.navigationLayerId` });
      const collision = inspectChunkCollection(layer.chunks, `${path}.chunks`, program, (cell, cellPath) => {
        if (!integer(cell) || cell < 0 || cell > program.collisionProfiles.length) add("error", "tile-collision-cell", `${cellPath} must reference a collision profile.`, { path: cellPath });
      }, add);
      report.counts.chunks += collision.chunks;
      report.counts.storedCells += collision.storedCells;
      report.counts.nonEmptyCells += collision.nonEmptyCells;
    }
  }

  const resolutionIndexes = createProgramIndexes(program);
  for (const layer of program.layers) {
    if (!layer.terrainSetId) continue;
    const terrainIndex = resolutionIndexes.terrainChunkIndexes.get(layer.id) ?? new Map();
    for (const chunk of layer.terrainChunks) {
      for (let localY = 0; localY < chunk.height; localY += 1) {
        for (let localX = 0; localX < chunk.width; localX += 1) {
          const x = chunk.x + localX;
          const y = chunk.y + localY;
          if (readCellFromIndex(terrainIndex, x, y, program.chunkSize) === 0) continue;
          const resolved = resolveTerrainCell(program, layer.id, x, y, { mapId: map?.id ?? "map-main", indexes: resolutionIndexes });
          if (!resolved.resolved) {
            report.counts.unresolvedTerrainCells += 1;
            if (report.counts.unresolvedTerrainCells <= 64) add("error", "tile-terrain-pattern-missing", `Tile terrain at ${layer.id} (${x},${y}) has no exact authored variant.`, { path: `tileProgram.layers.${layer.id}.terrainChunks`, layerId: layer.id, x, y, terrainId: resolved.terrainId, signature: resolved.signature, reason: resolved.reason });
          }
        }
      }
    }
  }

  if (report.counts.storedCells > LOOPLAB_TILE_PROGRAM_LIMITS.maximumStoredCells) add("error", "tile-program-stored-cell-limit", `tileProgram exceeds ${LOOPLAB_TILE_PROGRAM_LIMITS.maximumStoredCells} stored cells across all collections.`, { path: "tileProgram" });
  report.errors = issues.filter((issue) => issue.severity === "error");
  report.warnings = issues.filter((issue) => issue.severity === "warning");
  report.valid = report.errors.length === 0;
  return report;
}
