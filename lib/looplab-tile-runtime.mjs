import { canonicalSha256 } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_TILE_RUNTIME_SCHEMA = "looplab-tile-runtime/v1";

export function compileTileRuntimeProgram(program, map = {}) {
  const compareIds = (first, second) => String(first) < String(second) ? -1 : String(first) > String(second) ? 1 : 0;
  const empty = {
    schemaVersion: "looplab-tile-runtime/v1",
    present: false,
    mapId: map?.id ?? null,
    visualEntries: [],
    collisionObjects: [],
    counts: { visualEntries: 0, collisionObjects: 0, collisionCells: 0, unresolvedTerrainCells: 0 },
  };
  if (!program || typeof program !== "object" || Array.isArray(program)) return empty;

  const chunkSize = Number(program.chunkSize || 16);
  const columns = Number(program.columns || 0);
  const rows = Number(program.rows || 0);
  const projection = map?.projection ?? {};
  const dimetric = projection.type === "dimetric-2:1";
  const worldUnitsPerTile = dimetric ? Number(projection.worldUnitsPerTile || 128) : null;
  const worldCellWidth = dimetric ? worldUnitsPerTile : Number(program.cellWidth || 1);
  const worldCellHeight = dimetric ? worldUnitsPerTile : Number(program.cellHeight || 1);
  const palette = Array.isArray(program.palette) ? program.palette : [];
  const terrainSets = Array.isArray(program.terrainSets) ? program.terrainSets : [];
  const layers = Array.isArray(program.layers) ? program.layers : [];
  const collisionProfiles = Array.isArray(program.collisionProfiles) ? program.collisionProfiles : [];
  const collisionLayers = Array.isArray(program.collisionLayers) ? program.collisionLayers : [];
  const chunkOrigin = (value) => Math.floor(value / chunkSize) * chunkSize;
  const chunkKey = (x, y) => `${x}:${y}`;
  const collectionIndex = (chunks) => new Map((Array.isArray(chunks) ? chunks : []).map((chunk) => [chunkKey(chunk.x, chunk.y), chunk]));
  const readCell = (index, x, y) => {
    const chunk = index.get(chunkKey(chunkOrigin(x), chunkOrigin(y)));
    if (!chunk) return 0;
    const localX = x - Number(chunk.x || 0);
    const localY = y - Number(chunk.y || 0);
    if (localX < 0 || localY < 0 || localX >= chunk.width || localY >= chunk.height) return 0;
    return Number(chunk.cells?.[localY * chunk.width + localX] || 0) >>> 0;
  };
  const paletteById = new Map(palette.map((entry, index) => [entry.id, { entry, slot: index + 1 }]));
  const terrainSetById = new Map(terrainSets.map((set) => [set.id, set]));
  const visualIndexes = new Map(layers.map((layer) => [layer.id, collectionIndex(layer.chunks)]));
  const terrainIndexes = new Map(layers.map((layer) => [layer.id, collectionIndex(layer.terrainChunks)]));
  const terrainIdAt = (layer, x, y) => {
    const set = terrainSetById.get(layer?.terrainSetId);
    if (!set) return null;
    const slot = readCell(terrainIndexes.get(layer.id) ?? new Map(), x, y);
    return slot === 0 ? null : set.terrainIds?.[slot - 1] ?? null;
  };
  const signatureOffsets = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  const signatureAt = (layer, x, y) => signatureOffsets.map(([offsetX, offsetY]) => {
    const neighborX = x + offsetX;
    const neighborY = y + offsetY;
    return neighborX < 0 || neighborY < 0 || neighborX >= columns || neighborY >= rows ? null : terrainIdAt(layer, neighborX, neighborY);
  });
  const signatureMatches = (expected, actual) => Array.isArray(expected) && expected.length === 8 && expected.every((value, index) => value === "*" || value === actual[index]);
  const deterministicUnit = (value) => Number.parseInt(canonicalSha256(value).slice("sha256:".length, "sha256:".length + 13), 16) / 0x1_0000_0000_0000;
  const chooseVariant = (candidates, identity) => {
    const ordered = candidates.filter((variant) => Number(variant.probability) > 0).sort((first, second) => compareIds(first.id, second.id));
    const total = ordered.reduce((sum, variant) => sum + Number(variant.probability), 0);
    if (!(total > 0)) return null;
    let cursor = deterministicUnit(identity) * total;
    for (const variant of ordered) {
      cursor -= Number(variant.probability);
      if (cursor < 0) return variant;
    }
    return ordered.at(-1) ?? null;
  };
  const decodeWord = (word) => {
    const unsigned = Number(word || 0) >>> 0;
    const slot = unsigned & 0x0fffffff;
    if (!slot) return null;
    return {
      slot,
      palette: palette[slot - 1] ?? null,
      flipH: Boolean(unsigned & (0x80000000 >>> 0)),
      flipV: Boolean(unsigned & 0x40000000),
      flipD: Boolean(unsigned & 0x20000000),
    };
  };
  const resolveCell = (layer, x, y) => {
    const manual = decodeWord(readCell(visualIndexes.get(layer.id) ?? new Map(), x, y));
    if (manual) return { resolved: true, reason: "manual-override", decoded: manual, variantId: null };
    const terrainId = terrainIdAt(layer, x, y);
    if (!terrainId) return { resolved: true, reason: "empty", decoded: null, variantId: null };
    const set = terrainSetById.get(layer.terrainSetId);
    if (!set) return { resolved: false, reason: "unknown-terrain-set", decoded: null, variantId: null };
    const signature = signatureAt(layer, x, y);
    const candidates = (set.variants ?? []).filter((variant) => variant.centerTerrainId === terrainId && signatureMatches(variant.signature, signature));
    const variant = chooseVariant(candidates, { mapId: map?.id ?? "map-main", layerId: layer.id, x, y, terrainSetId: set.id, variationSeed: Number(program.variationSeed || 0) });
    const resolvedPalette = variant ? paletteById.get(variant.tileId) : null;
    if (!variant || !resolvedPalette) return { resolved: false, reason: variant ? "unknown-variant-tile" : "missing-signature", decoded: null, variantId: variant?.id ?? null };
    return { resolved: true, reason: "terrain", decoded: { slot: resolvedPalette.slot, palette: resolvedPalette.entry, flipH: false, flipV: false, flipD: false }, variantId: variant.id };
  };
  const nonEmptyCoordinates = (layer) => {
    const keys = new Set();
    for (const chunk of [...(layer.chunks ?? []), ...(layer.terrainChunks ?? [])]) {
      for (let localY = 0; localY < Number(chunk.height || 0); localY += 1) for (let localX = 0; localX < Number(chunk.width || 0); localX += 1) {
        if (Number(chunk.cells?.[localY * chunk.width + localX] || 0) !== 0) keys.add(`${Number(chunk.x || 0) + localX},${Number(chunk.y || 0) + localY}`);
      }
    }
    return [...keys].map((key) => key.split(",").map(Number)).sort((first, second) => first[1] - second[1] || first[0] - second[0]);
  };

  const visualEntries = [];
  let unresolvedTerrainCells = 0;
  layers.forEach((layer, layerIndex) => {
    if (layer.visible === false) return;
    const roleOffset = layer.role === "ground-static" ? -1_000_000_000_000 : layer.role === "foreground" ? 1_000_000_000_000 : 0;
    for (const [x, y] of nonEmptyCoordinates(layer)) {
      const resolved = resolveCell(layer, x, y);
      if (!resolved.resolved) { unresolvedTerrainCells += 1; continue; }
      if (!resolved.decoded?.palette) continue;
      const worldX = x * worldCellWidth;
      const worldY = y * worldCellHeight;
      const supportZ = Number(layer.supportZ || 0);
      const depth = roleOffset + (dimetric
        ? (worldX + worldY) * 1024 + supportZ * 32
        : supportZ * 1_000_000 + (worldY + worldCellHeight) * 100) + layerIndex / 1_000;
      visualEntries.push({
        id: `tile:${layer.id}:${x}:${y}`,
        kind: "tile",
        mapId: map?.id ?? null,
        layerId: layer.id,
        role: layer.role,
        x,
        y,
        worldX,
        worldY,
        worldWidth: worldCellWidth,
        worldHeight: worldCellHeight,
        z: supportZ,
        depth,
        opacity: Number(layer.opacity ?? 1),
        blendMode: layer.blendMode ?? "normal",
        tileId: resolved.decoded.palette.id,
        assetId: resolved.decoded.palette.assetId,
        frame: Number(resolved.decoded.palette.frame || 0),
        drawOffsetX: Number(resolved.decoded.palette.drawOffsetX || 0),
        drawOffsetY: Number(resolved.decoded.palette.drawOffsetY || 0),
        anchor: resolved.decoded.palette.anchor ?? "top-left",
        flipH: resolved.decoded.flipH,
        flipV: resolved.decoded.flipV,
        flipD: resolved.decoded.flipD,
        destinationWidth: Number(program.cellWidth || 1),
        destinationHeight: Number(program.cellHeight || 1),
        resolution: resolved.reason,
        variantId: resolved.variantId,
      });
    }
  });
  visualEntries.sort((first, second) => first.depth - second.depth || compareIds(first.id, second.id));

  const collisionObjects = [];
  let collisionCells = 0;
  collisionLayers.forEach((layer) => {
    const rowsByY = new Map();
    for (const chunk of layer.chunks ?? []) for (let localY = 0; localY < Number(chunk.height || 0); localY += 1) for (let localX = 0; localX < Number(chunk.width || 0); localX += 1) {
      const slot = Number(chunk.cells?.[localY * chunk.width + localX] || 0);
      if (!slot) continue;
      const x = Number(chunk.x || 0) + localX;
      const y = Number(chunk.y || 0) + localY;
      if (!rowsByY.has(y)) rowsByY.set(y, new Map());
      rowsByY.get(y).set(x, slot);
      collisionCells += 1;
    }
    let active = new Map();
    let priorY = null;
    const completed = [];
    for (const y of [...rowsByY.keys()].sort((first, second) => first - second)) {
      if (priorY !== null && y !== priorY + 1) { completed.push(...active.values()); active = new Map(); }
      const cells = [...rowsByY.get(y).entries()].sort((first, second) => first[0] - second[0]);
      const runs = [];
      for (const [x, slot] of cells) {
        const prior = runs.at(-1);
        if (prior && prior.slot === slot && x === prior.x + prior.width) prior.width += 1;
        else runs.push({ slot, x, y, width: 1, height: 1 });
      }
      const next = new Map();
      for (const run of runs) {
        const key = `${run.slot}:${run.x}:${run.width}`;
        const prior = active.get(key);
        next.set(key, prior ? { ...prior, height: prior.height + 1 } : run);
      }
      for (const [key, rectangle] of active) if (!next.has(key)) completed.push(rectangle);
      active = next;
      priorY = y;
    }
    completed.push(...active.values());
    completed.sort((first, second) => first.y - second.y || first.x - second.x || first.slot - second.slot);
    for (const rectangle of completed) {
      const profile = collisionProfiles[rectangle.slot - 1];
      if (!profile) continue;
      const x = rectangle.x * worldCellWidth;
      const y = rectangle.y * worldCellHeight;
      const width = rectangle.width * worldCellWidth;
      const height = rectangle.height * worldCellHeight;
      collisionObjects.push({
        id: `tile-collision:${layer.id}:${rectangle.x}:${rectangle.y}:${rectangle.width}:${rectangle.height}`,
        name: `${layer.name ?? layer.id} ${profile.name ?? profile.id}`,
        kind: "tile-collider",
        mapId: map?.id ?? null,
        tileCollision: true,
        collisionOwner: "authored-map",
        tileCollisionLayerId: layer.id,
        tileCollisionProfileId: profile.id,
        x,
        y,
        z: Number(layer.zMin || 0),
        supportZ: Number(layer.zMin || 0),
        width,
        height,
        solid: true,
        hidden: false,
        collider: { enabled: true, offsetX: 0, offsetY: 0, width, height, trigger: false, oneWay: profile.shape === "one-way-top", zMin: Number(layer.zMin || 0), zMax: Number(layer.zMax || 1) },
      });
    }
  });
  collisionObjects.sort((first, second) => compareIds(first.id, second.id));

  return {
    schemaVersion: "looplab-tile-runtime/v1",
    present: true,
    mapId: map?.id ?? null,
    programSchemaVersion: program.schemaVersion ?? null,
    visualEntries,
    collisionObjects,
    counts: { visualEntries: visualEntries.length, collisionObjects: collisionObjects.length, collisionCells, unresolvedTerrainCells },
  };
}
