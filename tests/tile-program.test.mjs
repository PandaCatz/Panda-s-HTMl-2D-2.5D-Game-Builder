import test from "node:test";
import assert from "node:assert/strict";

import { applyAgentCommand, createTemplate, getAgentManifest, validateProject } from "../lib/looplab-agent-core.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";

import {
  LOOPLAB_TILE_CELL_FLAGS,
  LOOPLAB_TILE_PATCH_SCHEMA,
  LOOPLAB_TILE_PROGRAM_SCHEMA,
  decodeTileCell,
  encodeTileCell,
  inspectTileProgram,
  normalizeTileProgram,
  previewTilePatch,
  readTileRegion,
  resolveTerrainCell,
  suggestTileProgram,
  tileProgramDigest,
} from "../lib/looplab-tile-program.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

function baseProgram(overrides = {}) {
  return normalizeTileProgram({
    schemaVersion: LOOPLAB_TILE_PROGRAM_SCHEMA,
    collisionOwner: "authored-map",
    cellWidth: 32,
    cellHeight: 32,
    columns: 4,
    rows: 3,
    chunkSize: 16,
    variationSeed: 17,
    palette: [
      { id: "grass-isolated-a", name: "Grass isolated A", assetId: "terrain-atlas", frame: 0, drawOffsetX: 0, drawOffsetY: 0, anchor: "top-left", probability: 1, transforms: { horizontal: false, vertical: false, diagonal: false } },
      { id: "grass-isolated-b", name: "Grass isolated B", assetId: "terrain-atlas", frame: 1, drawOffsetX: 0, drawOffsetY: 0, anchor: "top-left", probability: 1, transforms: { horizontal: false, vertical: false, diagonal: false } },
      { id: "grass-east", name: "Grass east", assetId: "terrain-atlas", frame: 2, drawOffsetX: 0, drawOffsetY: 0, anchor: "top-left", probability: 1, transforms: { horizontal: false, vertical: false, diagonal: false } },
      { id: "grass-west", name: "Grass west", assetId: "terrain-atlas", frame: 3, drawOffsetX: 0, drawOffsetY: 0, anchor: "top-left", probability: 1, transforms: { horizontal: false, vertical: false, diagonal: false } },
      { id: "grass-horizontal", name: "Grass horizontal", assetId: "terrain-atlas", frame: 4, drawOffsetX: 0, drawOffsetY: 0, anchor: "top-left", probability: 1, transforms: { horizontal: false, vertical: false, diagonal: false } },
    ],
    terrainSets: [{
      id: "ground-terrain",
      name: "Ground terrain",
      kind: "edge",
      terrainIds: ["grass"],
      variants: [
        { id: "isolated-a", tileId: "grass-isolated-a", centerTerrainId: "grass", signature: [null, "*", null, "*", null, "*", null, "*"], probability: 1 },
        { id: "isolated-b", tileId: "grass-isolated-b", centerTerrainId: "grass", signature: [null, "*", null, "*", null, "*", null, "*"], probability: 1 },
        { id: "east", tileId: "grass-east", centerTerrainId: "grass", signature: [null, "*", "grass", "*", null, "*", null, "*"], probability: 1 },
        { id: "west", tileId: "grass-west", centerTerrainId: "grass", signature: [null, "*", null, "*", null, "*", "grass", "*"], probability: 1 },
        { id: "horizontal", tileId: "grass-horizontal", centerTerrainId: "grass", signature: [null, "*", "grass", "*", null, "*", "grass", "*"], probability: 1 },
      ],
    }],
    collisionProfiles: [{ id: "solid", name: "Solid", shape: "solid-full" }],
    layers: [{
      id: "ground",
      name: "Ground",
      role: "ground-static",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      parallaxX: 1,
      parallaxY: 1,
      supportZ: 0,
      terrainSetId: "ground-terrain",
      chunks: [],
      terrainChunks: [],
    }],
    collisionLayers: [{ id: "ground-collision", name: "Ground collision", visible: true, locked: false, zMin: 0, zMax: 1, chunks: [] }],
    ...overrides,
  });
}

function projectWith(program = baseProgram(), mapOverrides = {}) {
  return {
    id: "tile-project",
    activeMapId: "map-main",
    assets: [{ id: "terrain-atlas", type: "tileset", frames: 5, frameWidth: 32, frameHeight: 32, columns: 5, dataUrl: "data:image/png;base64,AAAA" }],
    maps: [{
      id: "map-main",
      name: "Tile map",
      width: 128,
      height: 96,
      grid: 32,
      projection: { type: "orthographic", tileWidth: 32, tileHeight: 32 },
      objects: [],
      tileProgram: program,
      ...mapOverrides,
    }],
  };
}

function patch(operations) {
  return { schemaVersion: LOOPLAB_TILE_PATCH_SCHEMA, mapId: "map-main", operations };
}

test("tile programs normalize to stable compact source and validate against map and asset truth", () => {
  const program = baseProgram();
  const project = projectWith(program);
  const report = inspectTileProgram(project);
  assert.equal(report.present, true);
  assert.equal(report.valid, true, JSON.stringify(report.errors, null, 2));
  assert.equal(report.counts.palette, 5);
  assert.equal(report.counts.layers, 1);
  assert.equal(report.counts.collisionLayers, 1);
  assert.match(report.programDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(tileProgramDigest(clone(program)), report.programDigest);
  assert.equal(tileProgramDigest(normalizeTileProgram(program)), report.programDigest);
  assert.match(report.policy.collisionAuthority, /authored separately/i);
  assert.match(report.policy.visualAuthority, /do not create gameplay meaning/i);
});

test("tile words retain explicit transforms and reject transforms on empty cells", () => {
  const word = encodeTileCell({ slot: 3, flipH: true, flipD: true });
  assert.equal(word >>> 0, (LOOPLAB_TILE_CELL_FLAGS.horizontal | LOOPLAB_TILE_CELL_FLAGS.diagonal | 3) >>> 0);
  assert.deepEqual(decodeTileCell(word, baseProgram().palette), { slot: 3, tileId: "grass-east", flipH: true, flipV: false, flipD: true });
  assert.throws(() => encodeTileCell({ slot: 0, flipH: true }), /empty tile cell/i);
});

test("strict inspection rejects unknown fields, invalid ownership, reserved words, and unauthorized transforms", () => {
  const program = clone(baseProgram());
  program.unreviewed = true;
  program.collisionOwner = "generated-art";
  program.layers[0].chunks = [{ x: 0, y: 0, width: 4, height: 3, cells: Array(12).fill(0) }];
  program.layers[0].chunks[0].cells[0] = (LOOPLAB_TILE_CELL_FLAGS.reserved | 1) >>> 0;
  program.layers[0].chunks[0].cells[1] = (LOOPLAB_TILE_CELL_FLAGS.horizontal | 1) >>> 0;
  const report = inspectTileProgram(projectWith(program), program, { mapId: "map-main" });
  assert.equal(report.valid, false);
  const codes = new Set(report.errors.map((issue) => issue.code));
  assert.ok(codes.has("tile-program-field"));
  assert.ok(codes.has("tile-program-owner"));
  assert.ok(codes.has("tile-cell-reserved"));
  assert.ok(codes.has("tile-cell-transform"));
});

test("terrain painting is non-mutating, no-op stable, and returns bounded resolved region data", () => {
  const program = baseProgram();
  const original = clone(program);
  const first = previewTilePatch(program, patch([{ kind: "paint-terrain", layerId: "ground", x: 1, y: 1, terrainId: "grass" }]));
  assert.equal(first.changed, true);
  assert.equal(first.counts.terrainWrites, 1);
  assert.equal(first.counts.unresolvedSignatures, 0);
  assert.deepEqual(program, original, "preview must not mutate its input");
  assert.match(first.patchDigest, /^sha256:[a-f0-9]{64}$/);
  const second = previewTilePatch(first.program, patch([{ kind: "paint-terrain", layerId: "ground", x: 1, y: 1, terrainId: "grass" }]));
  assert.equal(second.changed, false);
  assert.equal(second.counts.terrainWrites, 0);
  assert.equal(second.projectedTileProgramDigest, first.projectedTileProgramDigest);
  const region = readTileRegion(first.program, { mapId: "map-main", layerId: "ground", collisionLayerId: "ground-collision", x: 0, y: 0, width: 4, height: 3 });
  assert.equal(region.resolvedCells.length, 12);
  assert.equal(region.terrainIds[5], "grass");
  assert.ok(["grass-isolated-a", "grass-isolated-b"].includes(region.resolvedCells[5].tileId));
  assert.equal(region.collisionProfileIds[5], null);
});

test("autotile resolution is independent of paint order and stable across repeated reads", () => {
  const forward = previewTilePatch(baseProgram(), patch([
    { kind: "paint-terrain", layerId: "ground", x: 1, y: 1, terrainId: "grass" },
    { kind: "paint-terrain", layerId: "ground", x: 2, y: 1, terrainId: "grass" },
  ]));
  const reverse = previewTilePatch(baseProgram(), patch([
    { kind: "paint-terrain", layerId: "ground", x: 2, y: 1, terrainId: "grass" },
    { kind: "paint-terrain", layerId: "ground", x: 1, y: 1, terrainId: "grass" },
  ]));
  assert.equal(forward.projectedTileProgramDigest, reverse.projectedTileProgramDigest);
  const firstRegion = readTileRegion(forward.program, { mapId: "map-main", layerId: "ground", x: 0, y: 0, width: 4, height: 3 });
  const secondRegion = readTileRegion(reverse.program, { mapId: "map-main", layerId: "ground", x: 0, y: 0, width: 4, height: 3 });
  assert.deepEqual(firstRegion.resolvedCells, secondRegion.resolvedCells);
  assert.equal(firstRegion.resolvedCells[5].tileId, "grass-east");
  assert.equal(firstRegion.resolvedCells[6].tileId, "grass-west");
  assert.deepEqual(
    resolveTerrainCell(forward.program, "ground", 1, 1, { mapId: "map-main" }),
    resolveTerrainCell(forward.program, "ground", 1, 1, { mapId: "map-main" }),
  );
});

test("missing terrain signatures are explicit preview and Doctor blockers", () => {
  const result = previewTilePatch(baseProgram(), patch([
    { kind: "paint-terrain", layerId: "ground", x: 1, y: 1, terrainId: "grass" },
    { kind: "paint-terrain", layerId: "ground", x: 1, y: 2, terrainId: "grass" },
  ]));
  assert.equal(result.changed, true);
  assert.equal(result.counts.unresolvedSignatures, 2);
  assert.ok(result.unresolvedSignatures.every((entry) => entry.reason === "missing-signature"));
  const report = inspectTileProgram(projectWith(result.program));
  assert.equal(report.valid, false);
  assert.equal(report.counts.unresolvedTerrainCells, 2);
  assert.ok(report.errors.some((issue) => issue.code === "tile-terrain-pattern-missing"));
});

test("visual and collision patches remain separate authored changes", () => {
  const visual = previewTilePatch(baseProgram(), patch([{ kind: "paint-tile", layerId: "ground", x: 0, y: 0, tileId: "grass-isolated-a" }]));
  assert.equal(visual.counts.directCellWrites, 1);
  assert.equal(visual.counts.collisionWrites, 0);
  let region = readTileRegion(visual.program, { mapId: "map-main", layerId: "ground", collisionLayerId: "ground-collision", x: 0, y: 0, width: 1, height: 1 });
  assert.equal(region.resolvedCells[0].tileId, "grass-isolated-a");
  assert.equal(region.collisionProfileIds[0], null);

  const collision = previewTilePatch(visual.program, patch([{ kind: "paint-collision", layerId: "ground-collision", x: 0, y: 0, profileId: "solid" }]));
  assert.equal(collision.counts.directCellWrites, 0);
  assert.equal(collision.counts.collisionWrites, 1);
  assert.equal(collision.visualChanges.length, 0);
  region = readTileRegion(collision.program, { mapId: "map-main", layerId: "ground", collisionLayerId: "ground-collision", x: 0, y: 0, width: 1, height: 1 });
  assert.equal(region.resolvedCells[0].tileId, "grass-isolated-a");
  assert.equal(region.collisionProfileIds[0], "solid");

  const artChanged = clone(collision.program);
  artChanged.palette[0].frame = 1;
  const afterArt = readTileRegion(artChanged, { mapId: "map-main", layerId: "ground", collisionLayerId: "ground-collision", x: 0, y: 0, width: 1, height: 1 });
  assert.equal(afterArt.collisionProfileIds[0], "solid", "changing art metadata must not rewrite collision cells");
});

test("sparse patches use exact edge chunk dimensions and erase empty chunks", () => {
  const painted = previewTilePatch(baseProgram(), patch([{ kind: "paint-tile", layerId: "ground", x: 3, y: 2, tileId: "grass-isolated-a" }]));
  assert.equal(painted.program.layers[0].chunks.length, 1);
  assert.deepEqual(
    { x: painted.program.layers[0].chunks[0].x, y: painted.program.layers[0].chunks[0].y, width: painted.program.layers[0].chunks[0].width, height: painted.program.layers[0].chunks[0].height, length: painted.program.layers[0].chunks[0].cells.length },
    { x: 0, y: 0, width: 4, height: 3, length: 12 },
  );
  const erased = previewTilePatch(painted.program, patch([{ kind: "erase-tile", layerId: "ground", x: 3, y: 2 }]));
  assert.equal(erased.program.layers[0].chunks.length, 0);
});

test("patches reject out-of-bounds coordinates, unauthorized transforms, and unbounded reads", () => {
  assert.throws(
    () => previewTilePatch(baseProgram(), patch([{ kind: "paint-tile", layerId: "ground", x: 4, y: 0, tileId: "grass-isolated-a" }])),
    (error) => error.code === "tile-patch-coordinate",
  );
  assert.throws(
    () => previewTilePatch(baseProgram(), patch([{ kind: "paint-tile", layerId: "ground", x: 0, y: 0, tileId: "grass-isolated-a", flipH: true }])),
    (error) => error.code === "tile-patch-transform",
  );
  const large = baseProgram({ columns: 65, rows: 65 });
  assert.throws(
    () => readTileRegion(large, { mapId: "map-main", layerId: "ground", x: 0, y: 0, width: 65, height: 65 }),
    (error) => error.code === "tile-region-limit",
  );
});

test("patches reject locked layers and fields irrelevant to the requested operation", () => {
  const lockedVisual = baseProgram();
  lockedVisual.layers[0].locked = true;
  assert.throws(
    () => previewTilePatch(lockedVisual, patch([{ kind: "paint-tile", layerId: "ground", x: 0, y: 0, tileId: "grass-isolated-a" }])),
    (error) => error.code === "tile-patch-layer-locked",
  );
  const lockedCollision = baseProgram();
  lockedCollision.collisionLayers[0].locked = true;
  assert.throws(
    () => previewTilePatch(lockedCollision, patch([{ kind: "paint-collision", layerId: "ground-collision", x: 0, y: 0, profileId: "solid" }])),
    (error) => error.code === "tile-patch-layer-locked",
  );
  assert.throws(
    () => previewTilePatch(baseProgram(), patch([{ kind: "erase-tile", layerId: "ground", x: 0, y: 0, tileId: "grass-isolated-a" }])),
    (error) => error.code === "tile-patch-operation-field",
  );
});

test("strict inspection rejects partial internal chunks that later paint operations cannot address safely", () => {
  const program = clone(baseProgram({ columns: 32, rows: 32 }));
  program.layers[0].chunks = [{ x: 0, y: 0, width: 8, height: 8, cells: Array(64).fill(0) }];
  const report = inspectTileProgram(projectWith(program, { width: 1_024, height: 1_024 }));
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((issue) => issue.code === "tile-chunk-shape"));
});

test("stable layer IDs containing colons retain correct dirty-cell and chunk attribution", () => {
  const program = baseProgram();
  program.layers[0].id = "ground:paint";
  const result = previewTilePatch(program, patch([{ kind: "paint-terrain", layerId: "ground:paint", x: 1, y: 1, terrainId: "grass" }]));
  assert.equal(result.changed, true);
  assert.deepEqual(result.dirtyChunks, [{ id: "ground:paint@0,0", layerId: "ground:paint", x: 0, y: 0 }]);
  assert.equal(result.visualChanges[0].layerId, "ground:paint");
});

test("dimetric tile programs require the exact authored 128x64 projection", () => {
  const dimetric = baseProgram({ cellWidth: 128, cellHeight: 64, columns: 2, rows: 1 });
  const project = projectWith(dimetric, { width: 256, height: 128, grid: 128, projection: { type: "dimetric-2:1", tileWidth: 128, tileHeight: 64, elevationStep: 32, worldUnitsPerTile: 128 } });
  assert.equal(inspectTileProgram(project).valid, true);

  const wrong = baseProgram({ cellWidth: 64, cellHeight: 64, columns: 4, rows: 2 });
  const report = inspectTileProgram(projectWith(wrong, { width: 256, height: 128, grid: 128, projection: { type: "dimetric-2:1", tileWidth: 128, tileHeight: 64, elevationStep: 32, worldUnitsPerTile: 128 } }));
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((issue) => issue.code === "tile-program-dimetric-size"));
});

test("provider-free tile suggestion prepares map-owned layers without inferring terrain or collision from art", () => {
  const suggestion = suggestTileProgram(projectWith(), { mapId: "map-main", assetIds: ["terrain-atlas"] });
  assert.equal(suggestion.provider, "none");
  assert.equal(suggestion.available, true, JSON.stringify(suggestion.report.errors, null, 2));
  assert.equal(suggestion.program.palette.length, 5);
  assert.equal(suggestion.program.layers[0].role, "ground-static");
  assert.equal(suggestion.program.terrainSets.length, 0);
  assert.equal(suggestion.program.collisionLayers[0].chunks.length, 0);
  assert.match(suggestion.reasons.at(-1), /never infers adjacency metadata or collision from pixels/i);

  const dimetric = suggestTileProgram(projectWith(undefined, { width: 256, height: 128, grid: 128, projection: { type: "dimetric-2:1", tileWidth: 128, tileHeight: 64, elevationStep: 32, worldUnitsPerTile: 128 } }));
  assert.equal(dimetric.program.cellWidth, 128);
  assert.equal(dimetric.program.cellHeight, 64);
  assert.equal(dimetric.program.columns, 2);
  assert.equal(dimetric.program.rows, 1);
  assert.equal(dimetric.program.layers[0].role, "interleaved");
  assert.equal(dimetric.program.palette[0].anchor, "bottom-center");
});

test("canonical tile commands give Claude and Codex the same digest-bound preview and apply workflow", () => {
  const source = createTemplate("blank");
  source.assets.push({ id: "terrain-atlas", name: "Terrain atlas", type: "tileset", width: 160, height: 32, frames: 5, frameWidth: 32, frameHeight: 32, columns: 5, dataUrl: "data:image/png;base64,AAAA" });
  const cellWidth = source.maps[0].projection.tileWidth;
  const cellHeight = source.maps[0].projection.tileHeight;
  const program = baseProgram({ cellWidth, cellHeight, columns: Math.ceil(source.width / cellWidth), rows: Math.ceil(source.height / cellHeight) });
  const set = applyAgentCommand(source, { op: "set_tile_program", mapId: source.activeMapId, program });
  assert.equal(set.changed, true);
  assert.equal(set.result.report.valid, true, JSON.stringify(set.result.report.errors, null, 2));
  assert.equal(validateProject(set.project).valid, true);
  assert.equal(analyzeProject(set.project).tileProgramReports[0].valid, true);

  const edit = { schemaVersion: LOOPLAB_TILE_PATCH_SCHEMA, mapId: source.activeMapId, operations: [{ kind: "paint-tile", layerId: "ground", x: 2, y: 2, tileId: "grass-isolated-a" }] };
  const preview = applyAgentCommand(set.project, { op: "preview_tile_patch", patch: edit }).result;
  assert.equal(preview.changed, true);
  assert.equal(preview.applicable, true, JSON.stringify(preview.doctor.newBlockers, null, 2));
  assert.equal(Object.hasOwn(preview, "program"), false, "compact preview must not repeat the complete tile program");
  assert.match(preview.patchDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(preview.applyCommand.expectedSourceDigest, preview.sourceDigest);

  const applied = applyAgentCommand(set.project, preview.applyCommand);
  assert.equal(applied.changed, true);
  assert.equal(applied.result.applied, true);
  const region = applyAgentCommand(applied.project, { op: "get_tile_region", mapId: source.activeMapId, layerId: "ground", collisionLayerId: "ground-collision", x: 2, y: 2, width: 1, height: 1 }).result;
  assert.equal(region.resolvedCells[0].tileId, "grass-isolated-a");
  assert.equal(region.collisionProfileIds[0], null);

  const currentSourceDigest = analyzeProject(applied.project).sourceDigest;
  assert.throws(
    () => applyAgentCommand(applied.project, { ...preview.applyCommand, expectedSourceDigest: currentSourceDigest }),
    /stale-tile-program/,
  );

  const noOpPreview = applyAgentCommand(applied.project, { op: "preview_tile_patch", patch: edit }).result;
  assert.equal(noOpPreview.changed, false);
  const noOpApply = applyAgentCommand(applied.project, noOpPreview.applyCommand);
  assert.equal(noOpApply.changed, false);
  assert.equal(analyzeProject(noOpApply.project).sourceDigest, noOpPreview.sourceDigest);

  const manifest = getAgentManifest();
  assert.ok(manifest.commands.includes("apply_tile_patch"));
  assert.equal(manifest.canonicalTilePrograms.schemaVersion, LOOPLAB_TILE_PROGRAM_SCHEMA);
  assert.match(manifest.canonicalTilePrograms.collisionBoundary, /never imply collision/i);
});
