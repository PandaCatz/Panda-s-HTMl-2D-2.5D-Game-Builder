import assert from "node:assert/strict";
import test from "node:test";

import { applyAgentCommand, buildStandaloneHtml, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import {
  elevationSegmentsForProgram,
  inspectElevationTransitions,
  LOOPLAB_ELEVATION_TRANSITIONS_SCHEMA,
  normalizeElevationTransitions,
  sampleElevationTransition,
  suggestElevationTransitions,
} from "../lib/looplab-elevation-transitions.mjs";
import { captureReplayState, LOOPLAB_REPLAY_ELEVATION_HASH_VERSION, LOOPLAB_REPLAY_HASH_VERSION, LOOPLAB_REPLAY_MOTION_CARRY_HASH_VERSION } from "../lib/looplab-replay.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";
import { buildAgentProjectContext } from "../lib/looplab-agent-context.mjs";
import { compactProviderProject } from "../lib/looplab-provider-context.mjs";
import { buildStructuralIterationDiff } from "../lib/looplab-structural-iteration-diff.mjs";

function mapFixture() {
  return {
    id: "map-main",
    name: "Layered route",
    width: 640,
    height: 480,
    grid: 32,
    controlMode: "topdown",
    projection: { type: "dimetric-2:1", tileWidth: 128, tileHeight: 64, elevationStep: 32, worldUnitsPerTile: 128 },
    objects: [],
    navigation: {
      version: 1,
      activeLayerId: "ground",
      layers: [
        { id: "ground", name: "Ground", color: "#555555", visible: true, locked: false, zMin: 0, zMax: 1 },
        { id: "deck", name: "Deck", color: "#777777", visible: true, locked: false, zMin: 4, zMax: 5 },
      ],
      nodes: [
        { id: "ramp-low", x: 100, y: 240, z: 0, layerId: "ground" },
        { id: "ramp-high", x: 300, y: 240, z: 4, layerId: "deck" },
      ],
      links: [{ id: "ramp-link", a: "ramp-low", b: "ramp-high", cost: 1.25, oneWay: false }],
      areas: [],
    },
    collisionGeometry: {
      schemaVersion: "looplab-collision-geometry/v1",
      collisionOwner: "authored-map",
      tuning: { minimumFloorNormalY: 0.707107, floorSnapDistance: 8, maximumStepUp: 12, stopOnSlope: true, slopeSlideAcceleration: 900, maximumSlideSpeed: 360, contactEpsilon: 0.001 },
      chains: [{
        id: "ramp-floor",
        name: "Ramp floor",
        enabled: true,
        role: "floor",
        oneWay: true,
        frontFace: "right",
        zMin: 0,
        zMax: 5,
        points: [
          { id: "low", x: 100, y: 240 },
          { id: "mid", x: 200, y: 220 },
          { id: "high", x: 300, y: 240 },
        ],
      }],
    },
  };
}

function program(overrides = {}) {
  return {
    schemaVersion: LOOPLAB_ELEVATION_TRANSITIONS_SCHEMA,
    supportOwner: "authored-map",
    transitions: [{
      id: "ramp-main",
      name: "Main ramp",
      enabled: true,
      kind: "ramp",
      width: 48,
      entryRadius: 56,
      entryZTolerance: 0.5,
      oneWay: false,
      fromLayerId: "ground",
      toLayerId: "deck",
      navigationLinkId: "ramp-link",
      points: [
        { id: "low", x: 100, y: 240, z: 0 },
        { id: "high", x: 300, y: 240, z: 4 },
      ],
      ...overrides,
    }],
  };
}

function runtimeProject({ oneWay = false, startZ = 0, startX = 45, startY = 40 } = {}) {
  const map = {
    id: "map-main",
    name: "Runtime ramp",
    width: 420,
    height: 200,
    grid: 20,
    gravity: 0,
    controlMode: "topdown",
    projection: { type: "dimetric-2:1", tileWidth: 128, tileHeight: 64, elevationStep: 32, worldUnitsPerTile: 128 },
    objects: [{
      id: "player",
      kind: "player",
      name: "Player",
      x: startX,
      y: startY,
      z: startZ,
      supportZ: startZ,
      width: 10,
      height: 10,
      solid: false,
      hidden: false,
      collider: { enabled: true, offsetX: 0, offsetY: 0, width: 10, height: 10, trigger: false, oneWay: false, zMin: startZ, zMax: startZ + 1 },
    }],
    navigation: {
      version: 1,
      activeLayerId: "ground",
      layers: [
        { id: "ground", name: "Ground", color: "#555555", visible: true, locked: false, zMin: 0, zMax: 1 },
        { id: "deck", name: "Deck", color: "#777777", visible: true, locked: false, zMin: 4, zMax: 5 },
      ],
      nodes: [
        { id: "low", x: 50, y: 50, z: 0, layerId: "ground" },
        { id: "high", x: 250, y: 50, z: 4, layerId: "deck" },
      ],
      links: [{ id: "ramp-link", a: "low", b: "high", cost: 1, oneWay }],
      areas: [],
    },
    elevationTransitions: program({
      oneWay,
      fromLayerId: "ground",
      toLayerId: "deck",
      navigationLinkId: "ramp-link",
      width: 40,
      entryRadius: 30,
      points: [
        { id: "low", x: 50, y: 50, z: 0 },
        { id: "high", x: 250, y: 50, z: 4 },
      ],
    }),
    traversalPaths: [],
  };
  return {
    name: "Runtime ramp",
    width: map.width,
    height: map.height,
    background: "#d9d9d9",
    gravity: 0,
    grid: map.grid,
    controlMode: "topdown",
    inputActions: [],
    objects: structuredClone(map.objects),
    maps: [map],
    activeMapId: map.id,
    startMapId: map.id,
    replay: { seed: 1, tickRate: 60, cases: [] },
  };
}

test("elevation transitions normalize in stable order and derive deterministic support segments", () => {
  const normalized = normalizeElevationTransitions({ transitions: [
    { id: "z", points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 2 }] },
    { id: "a", kind: "stairs", width: 99999, points: [{ id: "first", x: 0, y: 0, z: 2 }, { id: "second", x: 0, y: 10, z: 0 }] },
  ] });
  assert.deepEqual(normalized.transitions.map((entry) => entry.id), ["a", "z"]);
  assert.equal(normalized.transitions[0].kind, "stairs");
  assert.equal(normalized.transitions[0].width, 4096);
  assert.deepEqual(normalized.transitions[0].points.map((point) => point.id), ["first", "second"]);
  const segments = elevationSegmentsForProgram(normalized);
  assert.deepEqual(segments.map((segment) => segment.transitionId), ["a", "z"]);
  assert.equal(segments[0].az, 2);
  assert.equal(segments[0].bz, 0);
});

test("sampling interpolates support Z along the authored world-space corridor", () => {
  const sample = sampleElevationTransition(program(), { x: 200, y: 250 });
  assert.equal(sample.transitionId, "ramp-main");
  assert.equal(sample.segmentId, "ramp-main:0000");
  assert.equal(sample.progress, 0.5);
  assert.equal(sample.z, 2);
  assert.equal(sample.distance, 10);
  assert.equal(sampleElevationTransition(program(), { x: 200, y: 300 }), null);
});

test("Doctor contract validates exact navigation endpoints, height layers, and collision windows", () => {
  const map = mapFixture();
  const source = program({
    collisionChainId: undefined,
    points: [
      { id: "low", x: 100, y: 240, z: 0 },
      { id: "high", x: 300, y: 240, z: 4 },
    ],
  });
  map.elevationTransitions = source;
  const report = inspectElevationTransitions({ maps: [map], activeMapId: map.id }, source, { mapId: map.id, strict: true });
  assert.equal(report.valid, true);
  assert.equal(report.navigationBoundCount, 1);
  assert.equal(report.rampCount, 1);

  const broken = structuredClone(source);
  broken.transitions[0].points[1].z = -1;
  broken.transitions[0].unknownPixels = true;
  const invalid = inspectElevationTransitions({ maps: [map], activeMapId: map.id }, broken, { mapId: map.id, strict: true });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.some((issue) => issue.code === "elevation-transition-unknown-field"));
  assert.ok(invalid.issues.some((issue) => issue.code === "elevation-transition-navigation-endpoint"));
});

test("a platformer collision binding must match x/y points and span every support height", () => {
  const map = mapFixture();
  map.controlMode = "platformer";
  map.elevationTransitions = program({
    collisionChainId: "ramp-floor",
    points: [
      { id: "low", x: 100, y: 240, z: 0 },
      { id: "mid", x: 200, y: 220, z: 2 },
      { id: "high", x: 300, y: 240, z: 4 },
    ],
  });
  const valid = inspectElevationTransitions({ maps: [map], activeMapId: map.id }, map.elevationTransitions, { mapId: map.id, strict: true });
  assert.equal(valid.valid, true);
  assert.equal(valid.collisionBoundCount, 1);

  map.collisionGeometry.chains[0].zMax = 2;
  const invalid = inspectElevationTransitions({ maps: [map], activeMapId: map.id }, map.elevationTransitions, { mapId: map.id, strict: true });
  assert.ok(invalid.issues.some((issue) => issue.code === "elevation-transition-collision-window"));
});

test("provider-free suggestion converts a cross-height navigation link into an authored starter", () => {
  const map = mapFixture();
  const project = { activeMapId: map.id, maps: [map], grid: 32 };
  const suggestion = suggestElevationTransitions(project, { mapId: map.id, navigationLinkId: "ramp-link", kind: "stairs" });
  assert.equal(suggestion.provider, "none");
  assert.equal(suggestion.available, true);
  assert.equal(suggestion.program.transitions[0].kind, "stairs");
  assert.equal(suggestion.program.transitions[0].navigationLinkId, "ramp-link");
  assert.deepEqual(suggestion.program.transitions[0].points.map((point) => point.z), [0, 4]);
  assert.equal(suggestion.report.valid, true);
});

test("top-down runtime enters only at a compatible endpoint and interpolates support Z", () => {
  const runtime = createRuntimeModel(runtimeProject());
  runtime.setInput("right", true);
  const events = [];
  for (let tick = 0; tick < 25; tick += 1) events.push(...runtime.update(1 / 60));
  const state = runtime.getState();
  assert.equal(state.player.elevationTransitionId, "ramp-main");
  assert.equal(state.player.elevationSegmentId, "ramp-main:0000");
  assert.ok(state.player.elevationProgress > 0.45 && state.player.elevationProgress < 0.6);
  assert.equal(state.player.z, state.player.elevationSupportZ);
  assert.ok(state.player.z > 1.8 && state.player.z < 2.4);
  assert.ok(events.some((event) => event.type === "elevation.entered"));
});

test("an underpass actor cannot snap onto the middle of a raised transition", () => {
  const runtime = createRuntimeModel(runtimeProject({ startX: 145, startY: 40, startZ: 0 }));
  runtime.update(1 / 60);
  const state = runtime.getState();
  assert.equal(state.player.elevationTransitionId, null);
  assert.equal(state.player.z, 0);
});

test("one-way transition rejects entry from its high endpoint", () => {
  const runtime = createRuntimeModel(runtimeProject({ oneWay: true, startX: 245, startY: 40, startZ: 4 }));
  runtime.setInput("left", true);
  for (let tick = 0; tick < 5; tick += 1) runtime.update(1 / 60);
  const state = runtime.getState();
  assert.equal(state.player.elevationTransitionId, null);
  assert.equal(state.player.z, 4);
});

test("active transition rejects a mid-route side exit and save v5 restores its latent state", () => {
  const runtime = createRuntimeModel(runtimeProject());
  runtime.setInput("right", true);
  for (let tick = 0; tick < 24; tick += 1) runtime.update(1 / 60);
  runtime.setInput("right", false);
  const before = runtime.getState().player;
  runtime.setInput("down", true);
  for (let tick = 0; tick < 10; tick += 1) runtime.update(1 / 60);
  const contained = runtime.getState().player;
  assert.equal(contained.elevationTransitionId, "ramp-main");
  assert.ok(contained.y > before.y);
  assert.ok(contained.y <= 60.000001);

  const save = runtime.exportSaveState();
  assert.equal(save.version, 5);
  assert.equal(save.schemaVersion, "looplab-runtime-save-state/v5");
  assert.equal(save.elevationState.transitionId, "ramp-main");
  const restored = createRuntimeModel(runtimeProject());
  const result = restored.restoreSaveState(save);
  assert.equal(result.ok, true);
  assert.equal(result.state.player.elevationTransitionId, "ramp-main");
  assert.equal(result.state.player.elevationProgress, save.elevationState.progress);
});

test("replay v11 adds elevation state without altering replay v10 projection", () => {
  const runtime = createRuntimeModel(runtimeProject());
  runtime.setInput("right", true);
  for (let tick = 0; tick < 12; tick += 1) runtime.update(1 / 60);
  const v10 = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_MOTION_CARRY_HASH_VERSION });
  const v11 = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_ELEVATION_HASH_VERSION });
  assert.equal(Object.hasOwn(v10.player, "elevationTransitionId"), false);
  assert.equal(v11.player.elevationTransitionId, "ramp-main");
  assert.equal(v11.player.elevationSupportZ, runtime.getState().player.z);
});

test("platformer floor contact keeps screen collision and support-Z interpolation separate", () => {
  const map = {
    id: "map-main",
    name: "Platformer ramp",
    width: 360,
    height: 240,
    gravity: 600,
    grid: 20,
    controlMode: "platformer",
    objects: [{
      id: "player", kind: "player", name: "Player", x: 45, y: 100, z: 0, supportZ: 0, width: 10, height: 10, solid: false, hidden: false,
      collider: { enabled: true, offsetX: 0, offsetY: 0, width: 10, height: 10, trigger: false, oneWay: false, zMin: 0, zMax: 1 },
    }],
    traversalPaths: [],
    collisionGeometry: {
      schemaVersion: "looplab-collision-geometry/v1",
      collisionOwner: "authored-map",
      tuning: { minimumFloorNormalY: 0.7, floorSnapDistance: 8, maximumStepUp: 12, stopOnSlope: true, slopeSlideAcceleration: 900, maximumSlideSpeed: 360, contactEpsilon: 0.001 },
      chains: [{ id: "ramp-floor", name: "Ramp floor", enabled: true, role: "floor", oneWay: true, frontFace: "right", zMin: 0, zMax: 5, points: [{ id: "low", x: 50, y: 150 }, { id: "high", x: 250, y: 100 }] }],
    },
    elevationTransitions: program({
      collisionChainId: "ramp-floor",
      fromLayerId: undefined,
      toLayerId: undefined,
      navigationLinkId: undefined,
      width: 40,
      points: [{ id: "low", x: 50, y: 150, z: 0 }, { id: "high", x: 250, y: 100, z: 4 }],
    }),
  };
  const project = { name: map.name, width: map.width, height: map.height, background: "#d9d9d9", gravity: map.gravity, grid: map.grid, controlMode: map.controlMode, inputActions: [], objects: structuredClone(map.objects), maps: [map], activeMapId: map.id, startMapId: map.id, replay: { seed: 1, tickRate: 60, cases: [] } };
  const runtime = createRuntimeModel(project);
  for (let tick = 0; tick < 30; tick += 1) runtime.update(1 / 60);
  runtime.setInput("right", true);
  for (let tick = 0; tick < 32; tick += 1) runtime.update(1 / 60);
  const state = runtime.getState().player;
  assert.equal(state.grounded, true);
  assert.equal(state.groundChainId, "ramp-floor");
  assert.equal(state.elevationTransitionId, "ramp-main");
  assert.ok(state.z > 1);
  assert.equal(state.z, state.elevationSupportZ);
  assert.ok(state.y < 140);
});

test("headless commands, Doctor, manifest, and one-file export expose authored elevation transitions", () => {
  const source = createTemplate("topdown");
  const active = source.maps.find((map) => map.id === source.activeMapId);
  active.navigation = structuredClone(mapFixture().navigation);
  source.navigation = structuredClone(active.navigation);
  const set = applyAgentCommand(source, { op: "set_elevation_transitions", mapId: active.id, program: program(), profile: "production" });
  assert.equal(set.changed, true);
  assert.equal(set.result.report.valid, true);
  const read = applyAgentCommand(set.project, { op: "get_elevation_transitions", mapId: active.id });
  assert.equal(read.result.segments[0].transitionId, "ramp-main");
  const report = applyAgentCommand(set.project, { op: "get_elevation_transition_report", mapId: active.id, profile: "production" });
  assert.equal(report.result.valid, true);
  assert.equal(analyzeProject(set.project, { profile: "production" }).elevationTransitionReports[0].valid, true);

  const manifest = getAgentManifest();
  assert.ok(manifest.commands.includes("set_elevation_transitions"));
  assert.equal(manifest.authoredElevationTransitions.schemaVersion, LOOPLAB_ELEVATION_TRANSITIONS_SCHEMA);
  assert.equal(manifest.deterministicReplay.currentHashVersion, LOOPLAB_REPLAY_HASH_VERSION);

  const html = buildStandaloneHtml(set.project);
  assert.match(html, /getElevationTransitions/);
  assert.match(html, /get_elevation_transitions/);
  assert.match(html, /elevationTransitionId/);
  assert.match(html, /\[1,2,3,4,5,6,7,8,9,10,11,12,13\]/);

  const removed = applyAgentCommand(set.project, { op: "remove_elevation_transitions", mapId: active.id });
  assert.equal(removed.changed, true);
  assert.equal(removed.result.removed.schemaVersion, LOOPLAB_ELEVATION_TRANSITIONS_SCHEMA);
});

test("elevation transitions survive bounded context, provider projection, Path Editor round trips, and structural diffs", () => {
  const source = createTemplate("topdown");
  const active = source.maps.find((map) => map.id === source.activeMapId);
  active.navigation = structuredClone(mapFixture().navigation);
  source.navigation = structuredClone(active.navigation);
  const authored = applyAgentCommand(source, { op: "set_elevation_transitions", mapId: active.id, program: program(), profile: "production" }).project;

  const context = buildAgentProjectContext(authored, { view: "campaign" });
  assert.equal(context.campaign.elevationTransitionCount, 1);
  assert.equal(context.maps.entries[0].elevationTransitionCount, 1);

  const provider = compactProviderProject(authored);
  assert.equal(provider.maps[0].elevationTransitions.transitions[0].id, "ramp-main");
  assert.equal(Object.prototype.hasOwnProperty.call(provider, "elevationTransitions"), false);

  const exported = applyAgentCommand(authored, { op: "export_path_editor_navigation" }).result.data;
  assert.equal(exported.looplab.elevationTransitions.transitions[0].id, "ramp-main");
  const imported = applyAgentCommand(source, { op: "import_path_editor_navigation", data: exported }).project;
  assert.deepEqual(imported.elevationTransitions, authored.elevationTransitions);

  const diff = buildStructuralIterationDiff({
    firstProject: source,
    secondProject: authored,
    first: { iterationId: "before", sourceDigest: "source-before" },
    second: { iterationId: "after", sourceDigest: "source-after" },
  });
  assert.equal(diff.summary.elevationTransitions.added, 1);
  assert.equal(diff.maps[0].elevationTransitionChanges[0].id, "ramp-main");
  assert.deepEqual(diff.maps[0].elevationTransitionChanges[0].changeKinds, ["added"]);
});
