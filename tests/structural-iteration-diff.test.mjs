import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildStructuralIterationDiff, LOOPLAB_STRUCTURAL_ITERATION_DIFF_SCHEMA } from "../lib/looplab-structural-iteration-diff.mjs";

const clone = (value) => structuredClone(value);

function object(id, x, overrides = {}) {
  return {
    id,
    name: id,
    kind: "platform",
    x,
    y: 20,
    z: 0,
    supportZ: 0,
    width: 20,
    height: 10,
    collisionOwner: "authored-map",
    solid: true,
    groundAnchor: { offsetX: 10, offsetY: 10 },
    collider: { enabled: true, offsetX: 0, offsetY: 0, width: 20, height: 10, trigger: false, oneWay: false, zMin: 0, zMax: 1 },
    ...overrides,
  };
}

function tileProgram(x = 0) {
  return {
    schemaVersion: "looplab-tile-program/v1",
    collisionOwner: "authored-map",
    chunkSize: 16,
    columns: 8,
    rows: 8,
    cellWidth: 16,
    cellHeight: 16,
    variationSeed: 0,
    palette: [],
    terrainSets: [],
    layers: [],
    collisionProfiles: [{ id: "solid", name: "Solid", shape: "solid-full" }],
    collisionLayers: [{ id: "walls", name: "Walls", visible: true, locked: false, zMin: 0, zMax: 1, chunks: [{ x, y: 0, width: 1, height: 1, cells: [1] }] }],
  };
}

function chain(id, x = 0) {
  return { id, name: id, enabled: true, role: "floor", oneWay: true, frontFace: "right", zMin: 0, zMax: 1, points: [{ id: `${id}-a`, x, y: 50 }, { id: `${id}-b`, x: x + 20, y: 50 }] };
}

function map(id = "map-main", overrides = {}) {
  return {
    id,
    name: id,
    width: 160,
    height: 90,
    grid: 10,
    gravity: 1000,
    controlMode: "platformer",
    projection: { type: "orthographic", tileWidth: 16, tileHeight: 16 },
    objects: [object("a", 10), object("b", 40)],
    collisionGeometry: { schemaVersion: "looplab-collision-geometry/v1", collisionOwner: "authored-map", tuning: {}, chains: [chain("floor")] },
    tileProgram: tileProgram(),
    ...overrides,
  };
}

function project(maps = [map()]) {
  return { id: "project", activeMapId: maps[0].id, maps };
}

function diff(firstProject, secondProject, options = {}) {
  return buildStructuralIterationDiff({
    firstProject,
    secondProject,
    first: { iterationId: "first", sourceDigest: `source-${"1".repeat(64)}` },
    second: { iterationId: "second", sourceDigest: `source-${"2".repeat(64)}` },
    ...options,
  });
}

test("stable IDs make map, object, chain, and tile ordering irrelevant", () => {
  const first = project([map("map-a"), map("map-b")]);
  const second = clone(first);
  second.maps.reverse();
  for (const candidate of second.maps) {
    candidate.objects.reverse();
    candidate.collisionGeometry.chains.reverse();
    candidate.tileProgram.collisionLayers.reverse();
  }
  const result = diff(first, second);
  assert.equal(result.schemaVersion, LOOPLAB_STRUCTURAL_ITERATION_DIFF_SCHEMA);
  assert.equal(result.changed, false);
  assert.equal(result.detailCount, 0);
  assert.equal(result.summary.maps.changed, 0);
  assert.match(result.digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.policy.identity, /never establish identity/i);
});

test("object placement and collider geometry remain independent before/after changes", () => {
  const first = project();
  const second = clone(first);
  const changed = second.maps[0].objects.find((entry) => entry.id === "a");
  changed.x = 35;
  changed.supportZ = 4;
  changed.collider.offsetX = 7;
  changed.collider.oneWay = true;

  const result = diff(first, second);
  const mapDiff = result.maps.find((entry) => entry.mapId === "map-main");
  const objectChange = mapDiff.objectChanges.find((entry) => entry.id === "a");
  const colliderChange = mapDiff.colliderChanges.find((entry) => entry.id === "a:collider");
  assert.deepEqual(objectChange.changeKinds, ["moved", "support-changed"]);
  assert.equal(objectChange.before.bounds.x, 10);
  assert.equal(objectChange.after.bounds.x, 35);
  assert.ok(colliderChange.changeKinds.includes("moved"));
  assert.ok(colliderChange.changeKinds.includes("offset-changed"));
  assert.ok(colliderChange.changeKinds.includes("collision-mode-changed"));
  assert.equal(colliderChange.after.bounds.x, 42);
  assert.equal(result.summary.objects.moved, 1);
  assert.equal(result.summary.objects.supportChanged, 1);
  assert.equal(result.summary.objectColliders.modified, 1);
});

test("added and removed objects, chains, and canonical tile colliders are explicit", () => {
  const first = project();
  const second = clone(first);
  second.maps[0].objects = [object("b", 40), object("c", 70)];
  second.maps[0].collisionGeometry.chains = [chain("ceiling", 60)];
  second.maps[0].tileProgram = tileProgram(1);

  const result = diff(first, second);
  assert.equal(result.summary.objects.added, 1);
  assert.equal(result.summary.objects.removed, 1);
  assert.equal(result.summary.collisionChains.added, 1);
  assert.equal(result.summary.collisionChains.removed, 1);
  assert.equal(result.summary.tileColliders.added, 1);
  assert.equal(result.summary.tileColliders.removed, 1);
  const mapDiff = result.maps[0];
  assert.equal(mapDiff.objectChanges.find((entry) => entry.id === "a")?.change, "removed");
  assert.equal(mapDiff.objectChanges.find((entry) => entry.id === "c")?.change, "added");
  assert.equal(mapDiff.chainChanges.find((entry) => entry.id === "floor")?.change, "removed");
  assert.equal(mapDiff.chainChanges.find((entry) => entry.id === "ceiling")?.change, "added");
});

test("map dimensions and projection changes are declared instead of silently reprojected", () => {
  const first = project();
  const second = clone(first);
  second.maps[0].width = 320;
  second.maps[0].projection = { type: "dimetric-2:1", tileWidth: 128, tileHeight: 64, worldUnitsPerTile: 128 };
  const result = diff(first, second);
  assert.deepEqual(result.maps[0].changeKinds, ["map-resized", "projection-changed"]);
  assert.equal(result.summary.maps.resized, 1);
  assert.equal(result.summary.maps.projectionChanged, 1);
});

test("detail is bounded without hiding complete aggregate counts", () => {
  const first = project([map("map-many", { objects: Array.from({ length: 48 }, (_, index) => object(`old-${String(index).padStart(2, "0")}`, index * 2)), collisionGeometry: null, tileProgram: null })]);
  const second = project([map("map-many", { objects: Array.from({ length: 48 }, (_, index) => object(`new-${String(index).padStart(2, "0")}`, index * 2)), collisionGeometry: null, tileProgram: null })]);
  const result = diff(first, second, { maximumDetailChanges: 32 });
  assert.equal(result.summary.objects.added, 48);
  assert.equal(result.summary.objects.removed, 48);
  assert.equal(result.summary.objectColliders.added, 48);
  assert.equal(result.summary.objectColliders.removed, 48);
  assert.equal(result.truncated, true);
  assert.equal(result.maximumDetailChanges, 32);
  assert.equal(result.maps[0].retainedDetailCount, 32);
  assert.ok(result.maps[0].omittedDetailCount > 0);
});

test("mouse and headless surfaces expose the same bounded structural receipt", async () => {
  const [page, css, manifest] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/agent-manifest.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.equal(manifest.iterationLedger.structuralDiffSchema, LOOPLAB_STRUCTURAL_ITERATION_DIFF_SCHEMA);
  assert.match(manifest.iterationLedger.structuralDiffPolicy, /authored world space/i);
  assert.match(page, /StructuralIterationOverlay/);
  assert.match(page, /Stable-ID world-space evidence/);
  assert.match(page, /Dashed · before \/ removed/);
  assert.match(page, /Solid · after \/ added/);
  assert.match(page, /change-focused world crop/);
  assert.match(page, /category\.includes\("collider"\) \|\| category\.includes\("collision chain"\) \? "C"/);
  assert.match(page, /Evidence, not a verdict/);
  assert.match(css, /\.iteration-structural-diff\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.structural-chain\.before\s*\{[^}]*stroke-dasharray/);
  assert.match(css, /\.structural-chain\.after\s*\{/);
});
