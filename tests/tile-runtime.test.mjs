import test from "node:test";
import assert from "node:assert/strict";

import { buildStandaloneHtml, createTemplate } from "../lib/looplab-agent-core.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-instance.mjs";
import { compileTileRuntimeProgram, LOOPLAB_TILE_RUNTIME_SCHEMA } from "../lib/looplab-tile-runtime.mjs";
import { LOOPLAB_TILE_PROGRAM_SCHEMA } from "../lib/looplab-tile-program.mjs";

function collisionProgram({ columns = 48, rows = 27 } = {}) {
  const width = Math.min(16, columns);
  const height = Math.min(16, rows - 16);
  const cells = Array(width * height).fill(0);
  for (let y = 0; y < height; y += 1) cells[y * width + 10] = 1;
  return {
    schemaVersion: LOOPLAB_TILE_PROGRAM_SCHEMA,
    collisionOwner: "authored-map",
    cellWidth: 20,
    cellHeight: 20,
    columns,
    rows,
    chunkSize: 16,
    variationSeed: 7,
    palette: [],
    terrainSets: [],
    collisionProfiles: [{ id: "solid", name: "Solid", shape: "solid-full" }],
    layers: [{ id: "ground", name: "Ground", role: "ground-static", visible: true, locked: false, opacity: 1, blendMode: "normal", parallaxX: 1, parallaxY: 1, supportZ: 0, chunks: [], terrainChunks: [] }],
    collisionLayers: [{ id: "walls", name: "Walls", visible: true, locked: false, zMin: 0, zMax: 1, chunks: [{ x: 0, y: 16, width, height, cells }] }],
  };
}

function projectWithCollisionTiles() {
  const project = createTemplate("blank");
  const program = collisionProgram();
  project.tileProgram = program;
  project.maps[0].tileProgram = program;
  return project;
}

test("tile collision cells compile into deterministic merged authored rectangles", () => {
  const project = projectWithCollisionTiles();
  const first = compileTileRuntimeProgram(project.maps[0].tileProgram, project.maps[0]);
  const second = compileTileRuntimeProgram(project.maps[0].tileProgram, project.maps[0]);
  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, LOOPLAB_TILE_RUNTIME_SCHEMA);
  assert.equal(first.counts.collisionCells, 11);
  assert.equal(first.counts.collisionObjects, 1);
  assert.deepEqual(
    { x: first.collisionObjects[0].x, y: first.collisionObjects[0].y, width: first.collisionObjects[0].width, height: first.collisionObjects[0].height },
    { x: 200, y: 320, width: 20, height: 220 },
  );
  assert.equal(first.collisionObjects[0].collisionOwner, "authored-map");
});

test("the canonical runtime blocks player movement against tile-owned collision", () => {
  const runtime = createRuntimeModel(projectWithCollisionTiles());
  runtime.setInput("right", true);
  for (let tick = 0; tick < 240; tick += 1) runtime.update(1 / 60);
  runtime.setInput("right", false);
  const player = runtime.getObjects().find((object) => object.kind === "player");
  assert.ok(player);
  assert.ok(player.x <= 162.001, `player crossed the tile wall at x=200 (player x=${player.x})`);
  assert.equal(runtime.getTileRuntime().counts.collisionObjects, 1);
  assert.equal(runtime.getCollisionGeometry().tileCollision.objectCount, 1);
});

test("one-file exports embed the tile compiler and expose bounded tile runtime inspection", () => {
  const html = buildStandaloneHtml(projectWithCollisionTiles());
  assert.match(html, /const compileTileRuntimeProgram=/);
  assert.match(html, /runtimeApi\.getTileProgram=/);
  assert.match(html, /runtimeApi\.getTileRuntime=/);
  assert.match(html, /command\.op==='get_tile_runtime'/);
  assert.doesNotMatch(html, /from ["']\.\/looplab-tile-runtime/);
});
