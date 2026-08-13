import test from "node:test";
import assert from "node:assert/strict";

import { createRuntimeModel } from "../lib/looplab-runtime-instance.mjs";
import { captureReplayState, LOOPLAB_REPLAY_HASH_VERSION } from "../lib/looplab-replay.mjs";
import { normalizeTileProgram } from "../lib/looplab-tile-program.mjs";
import { applyAgentCommand, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { buildStructuralIterationDiff } from "../lib/looplab-structural-iteration-diff.mjs";
import {
  LOOPLAB_WORLD_STREAM_SCHEMA,
  compileWorldStreamRuntime,
  inspectWorldStream,
  normalizeWorldStream,
  planWorldStream,
  suggestWorldStream,
  worldStreamDigest,
  worldStreamSocketsCompatible,
} from "../lib/looplab-world-stream.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

function tileProgram(assetId, collisionCells = [1, 0, 0, 0]) {
  return normalizeTileProgram({
    collisionOwner: "authored-map",
    cellWidth: 32,
    cellHeight: 32,
    columns: 2,
    rows: 2,
    chunkSize: 16,
    variationSeed: 17,
    palette: [{
      id: `${assetId}-tile`,
      name: `${assetId} tile`,
      assetId,
      frame: 0,
      drawOffsetX: 0,
      drawOffsetY: 0,
      anchor: "top-left",
      probability: 1,
      transforms: { horizontal: false, vertical: false, diagonal: false },
    }],
    terrainSets: [],
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
      chunks: [{ x: 0, y: 0, width: 2, height: 2, cells: [1, 1, 1, 1] }],
      terrainChunks: [],
    }],
    collisionLayers: [{
      id: "collision",
      name: "Collision",
      visible: true,
      locked: false,
      zMin: 0,
      zMax: 1,
      chunks: [{ x: 0, y: 0, width: 2, height: 2, cells: collisionCells }],
    }],
  });
}

function map(id, { player = false, assetId = "shared-terrain" } = {}) {
  return {
    id,
    name: `Map ${id}`,
    width: 64,
    height: 64,
    background: "#3f3f42",
    gravity: 0,
    grid: 32,
    controlMode: "topdown",
    projection: { type: "orthographic", tileWidth: 32, tileHeight: 32 },
    navigation: { nodes: [], links: [], areas: [] },
    objects: [
      ...(player ? [{ id: "player", name: "Player", kind: "player", x: 16, y: 16, width: 16, height: 24, color: "#445566", solid: true }] : []),
      { id: `prop-${id}`, name: `Prop ${id}`, kind: "decor", x: 24, y: 24, width: 16, height: 16, color: "#55555a", solid: false, assetId },
    ],
    traversalPaths: [],
    collisionGeometry: null,
    tileProgram: tileProgram(assetId),
  };
}

function template(id, mapId, weight = 1) {
  return {
    id,
    name: `Chunk ${id}`,
    mapId,
    weight,
    entry: { id: "entry", tag: "route", edge: "left", x: 0, y: 32, z: 0, span: 32 },
    exit: { id: "exit", tag: "route", edge: "right", x: 64, y: 32, z: 0, span: 32 },
  };
}

function projectWithWorld({ mode = "finite", sequence = ["a", "b"], horizon = 4 } = {}) {
  const project = {
    id: "world-project",
    name: "World stream fixture",
    activeMapId: "map-a",
    startMapId: "map-a",
    width: 64,
    height: 64,
    background: "#3f3f42",
    gravity: 0,
    grid: 32,
    controlMode: "topdown",
    projection: { type: "orthographic", tileWidth: 32, tileHeight: 32 },
    assets: [{
      id: "shared-terrain",
      name: "Shared terrain",
      type: "tileset",
      width: 32,
      height: 32,
      frames: 1,
      frameWidth: 32,
      frameHeight: 32,
      columns: 1,
      dataUrl: "data:image/png;base64,AAAA",
    }],
    maps: [map("map-a", { player: true }), map("map-b"), map("map-c")],
  };
  Object.assign(project, {
    objects: clone(project.maps[0].objects),
    navigation: clone(project.maps[0].navigation),
    traversalPaths: clone(project.maps[0].traversalPaths),
    collisionGeometry: clone(project.maps[0].collisionGeometry),
    tileProgram: clone(project.maps[0].tileProgram),
  });
  const program = normalizeWorldStream({
    mode,
    axis: "horizontal",
    seed: "world-seed",
    startTemplateId: "a",
    horizon,
    sequence,
    templates: [template("a", "map-a"), template("b", "map-b", 2), template("c", "map-c", 1)],
    budgets: {
      retainBehind: 1,
      prefetchAhead: 1,
      maxResidentChunks: 3,
      maxResidentTileCells: 64,
      maxResidentCollisionCells: 64,
      maxDecodedRgbaBytes: 32 * 32 * 4,
      cullPadding: 32,
    },
  });
  project.maps[0].worldStream = program;
  project.worldStream = program;
  return { project, program };
}

test("world-stream source normalizes to canonical stable ordering and digest", () => {
  const { program } = projectWithWorld();
  const reversed = normalizeWorldStream({ ...clone(program), templates: [...program.templates].reverse() });
  assert.equal(program.schemaVersion, LOOPLAB_WORLD_STREAM_SCHEMA);
  assert.deepEqual(program.templates.map((entry) => entry.id), ["a", "b", "c"]);
  assert.equal(worldStreamDigest(program), worldStreamDigest(reversed));
  assert.equal(program.owner, "authored-map");
});

test("socket compatibility checks edge, tag, cross-axis, z, and span independently", () => {
  const source = template("a", "map-a").exit;
  const target = template("b", "map-b").entry;
  const match = worldStreamSocketsCompatible(source, target, { axis: "horizontal" });
  assert.equal(match.compatible, true);
  const mismatch = worldStreamSocketsCompatible(source, { ...target, z: 3, tag: "secret" }, { axis: "horizontal" });
  assert.equal(mismatch.compatible, false);
  assert.deepEqual(mismatch.checks.filter((entry) => !entry.passed).map((entry) => entry.id), ["tag", "z"]);
});

test("finite plans align exact authored sockets and report contradictions", () => {
  const { project, program } = projectWithWorld();
  const plan = planWorldStream(project, program, { mapId: "map-a" });
  assert.equal(plan.status, "ready");
  assert.equal(plan.complete, true);
  assert.deepEqual(plan.instances.map(({ templateId, x, y }) => ({ templateId, x, y })), [
    { templateId: "a", x: 0, y: 0 },
    { templateId: "b", x: 64, y: 0 },
  ]);
  assert.deepEqual({ x: plan.seams[0].x, y: plan.seams[0].y, z: plan.seams[0].z }, { x: 64, y: 32, z: 0 });

  const broken = clone(program);
  broken.templates.find((entry) => entry.id === "b").entry.tag = "different-route";
  const rejected = planWorldStream(project, broken, { mapId: "map-a" });
  assert.equal(rejected.status, "contradiction");
  assert.equal(rejected.contradiction.code, "incompatible-sequence");
});

test("seeded plans are deterministic and independent of template array order", () => {
  const firstFixture = projectWithWorld({ mode: "seeded", sequence: [], horizon: 24 });
  const first = planWorldStream(firstFixture.project, firstFixture.program, { mapId: "map-a", count: 24 });
  const reordered = normalizeWorldStream({ ...clone(firstFixture.program), templates: [...firstFixture.program.templates].reverse() });
  const second = planWorldStream(firstFixture.project, reordered, { mapId: "map-a", count: 24 });
  assert.equal(first.status, "ready");
  assert.equal(first.routeDigest, second.routeDigest);
  assert.deepEqual(first.instances.map((entry) => entry.templateId), second.instances.map((entry) => entry.templateId));
  assert.equal(first.instances.length, 24);
  assert.ok(new Set(first.instances.map((entry) => entry.templateId)).size >= 2);
});

test("inspection proves v1 restrictions, unique decoded memory, and seam evidence boundaries", () => {
  const { project, program } = projectWithWorld();
  const report = inspectWorldStream(project, program, { mapId: "map-a", strict: true });
  assert.equal(report.present, true);
  assert.equal(report.valid, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.decodedRgbaBytes, 32 * 32 * 4);
  assert.equal(report.residentWorstCase.decodedRgbaBytes, 32 * 32 * 4, "a repeated embedded atlas is counted once per resident window");
  assert.ok(report.warnings.some((message) => /captured first-draw/i.test(message)));

  const unsafe = clone(project);
  unsafe.maps[1].objects.push({ id: "moving-platform", kind: "platform", motionBody: { pathId: "loop" } });
  const rejected = inspectWorldStream(unsafe, program, { mapId: "map-a", strict: true });
  assert.equal(rejected.valid, false);
  assert.ok(rejected.issues.some((entry) => entry.code === "world-stream-motion-body"));
});

test("suggestion is explicit, reviewable, and only offered for compatible maps", () => {
  const { project } = projectWithWorld();
  delete project.maps[0].worldStream;
  delete project.worldStream;
  const suggestion = suggestWorldStream(project, { mapId: "map-a", mode: "finite" });
  assert.equal(suggestion.available, true);
  assert.equal(suggestion.program.sequence[0], "chunk-map-a");
  assert.match(suggestion.instructions, /review every map edge/i);
  assert.match(suggestion.decisionBoundary, /cannot prove/i);
});

test("headless commands, bounded context, Doctor, and manifest expose one canonical world-stream contract", () => {
  const fixture = projectWithWorld();
  const project = clone(fixture.project);
  delete project.maps[0].worldStream;
  delete project.worldStream;
  const suggestion = applyAgentCommand(project, { op: "suggest_world_stream", mapId: "map-a", mode: "finite", axis: "horizontal", seed: "headless-world", horizon: 3, tag: "route", z: 0, span: 32 }).result;
  assert.equal(suggestion.available, true);
  const stored = applyAgentCommand(project, { op: "set_world_stream", mapId: "map-a", program: suggestion.program });
  assert.equal(stored.changed, true);
  assert.equal(stored.result.report.valid, true, JSON.stringify(stored.result.report.issues, null, 2));
  const exact = applyAgentCommand(stored.project, { op: "get_world_stream", mapId: "map-a" }).result;
  const plan = applyAgentCommand(stored.project, { op: "get_world_stream_plan", mapId: "map-a" }).result;
  assert.equal(exact.worldStreamDigest, stored.result.worldStreamDigest);
  assert.equal(plan.instances.length, 3);

  const context = applyAgentCommand(stored.project, { op: "get_project_context", view: "campaign" }).result;
  assert.equal(context.campaign.worldStreamMapCount, 1);
  assert.equal(context.maps.entries.find((entry) => entry.id === "map-a").worldStream.programDigest, exact.worldStreamDigest);
  assert.equal(context.maps.entries.find((entry) => entry.id === "map-a").worldStream.exactReadCommand, "get_world_stream");

  const doctor = analyzeProject(stored.project, { profile: "production" });
  assert.equal(doctor.worldStreamReports.length, 1);
  assert.ok(doctor.categories["world-stream"].some((entry) => entry.code === "world-stream-seam-evidence"));
  assert.equal(doctor.categories["world-stream"].find((entry) => entry.code === "world-stream-seam-evidence").owner, "world-stream-authoring-and-runtime");

  const manifest = getAgentManifest();
  for (const op of ["get_world_stream", "get_world_stream_report", "get_world_stream_plan", "suggest_world_stream", "set_world_stream", "remove_world_stream"]) {
    assert.ok(manifest.commands.includes(op), `${op} must be available without the UI`);
    assert.ok(manifest.commandContracts.commands.find((entry) => entry.op === op), `${op} must have a strict command schema`);
  }

  const removed = applyAgentCommand(stored.project, { op: "remove_world_stream", mapId: "map-a" });
  assert.equal(removed.changed, true);
  assert.equal(removed.project.maps[0].worldStream, undefined);
  assert.equal(removed.project.maps.length, 3, "removing composition preserves every source map");
});

test("candidate structural diffs report route, socket, and budget changes by authored identity", () => {
  const { project } = projectWithWorld();
  const changed = clone(project);
  changed.maps[0].worldStream.seed = "another-seed";
  changed.maps[0].worldStream.templates.find((entry) => entry.id === "b").entry.span = 24;
  changed.maps[0].worldStream.budgets.maxResidentTileCells = 96;
  changed.worldStream = changed.maps[0].worldStream;
  const diff = buildStructuralIterationDiff({ firstProject: project, secondProject: changed });
  assert.equal(diff.summary.worldStreams.modified, 1);
  assert.deepEqual(diff.maps[0].worldStreamChanges[0].changeKinds, ["route-selection-changed", "templates-or-sockets-changed", "residency-budget-changed"]);
  assert.equal(diff.changed, true);
});

test("runtime composition keeps a bounded resident window and stable per-instance identities", () => {
  const { project } = projectWithWorld({ mode: "seeded", sequence: [], horizon: 8 });
  const runtime = compileWorldStreamRuntime(project, project.maps[0]);
  assert.equal(runtime.present, true);
  const initial = runtime.compose(0);
  assert.deepEqual(initial.state.residentRange, { start: 0, end: 1 });
  assert.equal(initial.state.budgetPassed, true);
  assert.equal(initial.state.budget.decodedRgbaBytes.used, 32 * 32 * 4);
  assert.ok(initial.objects.some((entry) => entry.id === "player"));
  assert.equal(initial.objects.filter((entry) => entry.kind === "player").length, 1);
  assert.ok(initial.objects.some((entry) => entry.id.startsWith("chunk-000001-")));
  assert.ok(initial.tileRuntime.visualEntries.some((entry) => entry.worldChunkOrdinal === 1));

  const laterOrdinal = runtime.ordinalForPosition(150, 16);
  const later = runtime.compose(laterOrdinal);
  assert.equal(later.state.currentOrdinal, 2);
  assert.deepEqual(later.state.residentRange, { start: 1, end: 3 });
  assert.equal(later.objects.filter((entry) => entry.kind === "player").length, 0);
  assert.equal(later.state.budget.decodedRgbaBytes.used, 32 * 32 * 4);

  const drawn = runtime.markDraw({ readyAssetIds: ["shared-terrain"], drawnTileCount: 7, visibleTileCount: 9, timestamp: 1234 });
  assert.equal(drawn.assetsReady, true);
  assert.equal(drawn.firstDrawAt, 1234);
  assert.equal(drawn.lastDrawnTileCount, 7);
  assert.equal(drawn.lastVisibleTileCount, 9);
});

test("canonical runtime crosses chunk windows without replacing the live player", () => {
  const { project } = projectWithWorld({ mode: "seeded", sequence: [], horizon: 8 });
  const runtime = createRuntimeModel(project);
  const player = runtime.getObjects().find((entry) => entry.kind === "player");
  assert.ok(player);
  player.x = 150;
  runtime.update(0);
  const state = runtime.getState();
  const currentPlayer = runtime.getObjects().find((entry) => entry.kind === "player");
  assert.equal(currentPlayer, player, "the live physics object remains stable while resident source objects rotate");
  assert.equal(state.worldStream.currentOrdinal, 2);
  assert.deepEqual(state.worldStream.residentRange, { start: 1, end: 3 });
  assert.equal(runtime.getObjects().filter((entry) => entry.kind === "player").length, 1);
  assert.ok(runtime.getTileRuntime().visualEntries.every((entry) => entry.worldChunkOrdinal >= 1 && entry.worldChunkOrdinal <= 3));
  const draw = runtime.markWorldStreamDraw({ readyAssetIds: ["shared-terrain"], drawnTileCount: 4, visibleTileCount: 6, timestamp: 77 });
  assert.equal(draw.assetsReady, true);
  assert.equal(runtime.getState().worldStream.firstDrawAt, 77);
});

test("replay v12 hashes deterministic chunk state while save v6 restores the exact ordinal", () => {
  const { project } = projectWithWorld({ mode: "seeded", sequence: [], horizon: 8 });
  const runtime = createRuntimeModel(project);
  const player = runtime.getObjects().find((entry) => entry.kind === "player");
  player.x = 150;
  runtime.update(0);
  const beforeDraw = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_HASH_VERSION });
  runtime.markWorldStreamDraw({ readyAssetIds: ["shared-terrain"], drawnTileCount: 4, visibleTileCount: 6, timestamp: 991 });
  const afterDraw = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_HASH_VERSION });
  assert.deepEqual(afterDraw, beforeDraw, "visual loading and first-draw timing never enter deterministic replay truth");
  assert.equal(beforeDraw.worldStream.currentOrdinal, 2);

  const saved = runtime.exportSaveState();
  assert.equal(saved.version, 6);
  assert.equal(saved.schemaVersion, "looplab-runtime-save-state/v6");
  assert.equal(saved.worldStreamState.currentOrdinal, 2);
  assert.equal(runtime.validateSaveState(saved).valid, true);

  runtime.reset();
  const restored = runtime.restoreSaveState(saved);
  assert.equal(restored.ok, true, restored.error);
  assert.equal(runtime.getState().worldStream.currentOrdinal, 2);
  assert.equal(runtime.getObjects().find((entry) => entry.kind === "player").x, 150);
});
