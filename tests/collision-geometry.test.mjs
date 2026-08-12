import assert from "node:assert/strict";
import test from "node:test";

import { applyAgentCommand, buildStandaloneHtml, createTemplate, getAgentManifest, validateProject } from "../lib/looplab-agent-core.mjs";
import {
  collisionSegmentsForGeometry,
  inspectCollisionGeometry,
  LOOPLAB_COLLISION_GEOMETRY_SCHEMA,
  normalizeCollisionGeometry,
  suggestCollisionGeometry,
} from "../lib/looplab-collision-geometry.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { captureReplayState, LOOPLAB_REPLAY_COLLISION_HASH_VERSION, LOOPLAB_REPLAY_ACTOR_HASH_VERSION, LOOPLAB_REPLAY_MOTION_CARRY_HASH_VERSION } from "../lib/looplab-replay.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";

const clone = (value) => structuredClone(value);

function geometry(overrides = {}) {
  return {
    schemaVersion: LOOPLAB_COLLISION_GEOMETRY_SCHEMA,
    collisionOwner: "authored-map",
    tuning: {
      minimumFloorNormalY: 0.707107,
      floorSnapDistance: 8,
      maximumStepUp: 12,
      stopOnSlope: true,
      slopeSlideAcceleration: 900,
      maximumSlideSpeed: 360,
      contactEpsilon: 0.001,
    },
    chains: [
      {
        id: "slope-main",
        name: "Main ascending floor",
        enabled: true,
        role: "floor",
        oneWay: true,
        frontFace: "right",
        zMin: 0,
        zMax: 1,
        points: [
          { id: "slope-a", x: 160, y: 460 },
          { id: "slope-b", x: 320, y: 380 },
          { id: "slope-c", x: 480, y: 380 },
        ],
      },
    ],
    ...overrides,
  };
}

function platformerProject() {
  const project = createTemplate("blank");
  project.maps[0].id = "map-main";
  project.activeMapId = "map-main";
  project.startMapId = "map-main";
  project.maps[0].collisionGeometry = geometry();
  project.collisionGeometry = clone(project.maps[0].collisionGeometry);
  project.maps[0].objects = project.maps[0].objects.filter((object) => object.id !== "ground");
  project.objects = clone(project.maps[0].objects);
  const player = project.maps[0].objects.find((object) => object.kind === "player");
  player.x = 190;
  player.y = 350;
  project.objects = clone(project.maps[0].objects);
  project.replay = { ...project.replay, cases: [] };
  return project;
}

test("collision geometry derives right-hand y-down normals in stable chain order", () => {
  const input = geometry({
    chains: [
      { id: "z-floor", name: "Z", enabled: true, role: "floor", oneWay: true, frontFace: "right", zMin: 0, zMax: 1, points: [{ id: "a", x: 0, y: 20 }, { id: "b", x: 20, y: 10 }] },
      { id: "a-wall", name: "A", enabled: true, role: "boundary", oneWay: false, frontFace: "right", zMin: 0, zMax: 1, points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 20 }] },
    ],
  });
  const segments = collisionSegmentsForGeometry(input);
  assert.deepEqual(segments.map((segment) => segment.chainId), ["a-wall", "z-floor"]);
  assert.equal(segments[0].normalX, 1);
  assert.equal(Object.is(segments[0].normalY, -0), true);
  assert.ok(segments[1].normalY < 0);
  assert.equal(segments[0].ownsStart, true);
  assert.equal(segments[0].ownsEnd, true);
});

test("collision inspection rejects unknown fields, zero-length segments, bad winding, and invalid source references", () => {
  const project = createTemplate("blank");
  const input = geometry();
  input.untrustedPixels = true;
  input.chains[0].sourceObjectId = "missing";
  input.chains[0].points[1] = { id: "duplicate-position", x: 160, y: 460 };
  input.chains[0].points[2] = { id: "reverse", x: 80, y: 460 };
  const report = inspectCollisionGeometry(project, input, { mapId: project.activeMapId });
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === "collision-geometry-unknown-field"));
  assert.ok(report.issues.some((issue) => issue.code === "collision-chain-source-object"));
  assert.ok(report.issues.some((issue) => issue.code === "collision-segment-zero-length"));
  assert.ok(report.issues.some((issue) => issue.code === "collision-floor-winding"));
});

test("normalization is bounded and canonical without changing authored point order", () => {
  const input = geometry({
    tuning: { floorSnapDistance: 1_000, maximumStepUp: -20 },
    chains: [
      { id: "z", name: "Z", points: [{ id: "z1", x: 10, y: 10 }, { id: "z2", x: 20, y: 10 }] },
      { id: "a", name: "A", points: [{ id: "a2", x: 20, y: 10 }, { id: "a1", x: 10, y: 10 }] },
    ],
  });
  const normalized = normalizeCollisionGeometry(input);
  assert.deepEqual(normalized.chains.map((chain) => chain.id), ["a", "z"]);
  assert.deepEqual(normalized.chains[0].points.map((point) => point.id), ["a2", "a1"]);
  assert.equal(normalized.tuning.floorSnapDistance, 64);
  assert.equal(normalized.tuning.maximumStepUp, 0);
});

test("provider-free suggestion uses only selected authored one-way collider tops", () => {
  const project = createTemplate("blank");
  const suggestion = suggestCollisionGeometry(project, { objectIds: ["ground"] });
  assert.equal(suggestion.provider, "none");
  assert.equal(suggestion.available, true);
  assert.deepEqual(suggestion.sourceObjectIds, ["ground"]);
  assert.equal(suggestion.geometry.chains[0].sourceObjectId, "ground");
  assert.equal(suggestion.report.valid, true);
  assert.equal(suggestion.geometry.chains[0].points[0].y, project.objects.find((object) => object.id === "ground").y);
});

test("runtime follows authored slope, publishes contact state, and replay v9 preserves it", () => {
  const project = platformerProject();
  const runtime = createRuntimeModel(project);
  runtime.setInput("right", true);
  for (let tick = 0; tick < 50; tick += 1) runtime.update(1 / 60);
  const state = runtime.getState();
  assert.equal(state.player.grounded, true);
  assert.equal(state.player.groundChainId, "slope-main");
  assert.ok(state.player.groundNormalY < -0.7);
  assert.ok(state.player.x > 300);
  assert.ok(state.player.y < 350);
  const v8 = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_ACTOR_HASH_VERSION });
  const v9 = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_COLLISION_HASH_VERSION });
  assert.equal(Object.hasOwn(v8.player, "groundChainId"), false);
  assert.equal(v9.player.groundChainId, "slope-main");
});

test("headless commands, Doctor, manifest, and one-file export expose collision geometry to Claude and Codex", () => {
  const source = createTemplate("blank");
  const set = applyAgentCommand(source, { op: "set_collision_geometry", mapId: source.activeMapId, geometry: geometry() });
  assert.equal(set.changed, true);
  assert.equal(set.result.report.valid, true);
  assert.equal(applyAgentCommand(set.project, { op: "get_collision_geometry_report", mapId: source.activeMapId, profile: "production" }).result.segmentCount, 2);
  assert.equal(validateProject(set.project).valid, true);
  assert.equal(analyzeProject(set.project, { profile: "production" }).collisionGeometryReports[0].valid, true);

  const manifest = getAgentManifest();
  assert.ok(manifest.commands.includes("set_collision_geometry"));
  assert.equal(manifest.authoredCollisionGeometry.schemaVersion, LOOPLAB_COLLISION_GEOMETRY_SCHEMA);
  assert.equal(manifest.deterministicReplay.currentHashVersion, LOOPLAB_REPLAY_MOTION_CARRY_HASH_VERSION);

  const html = buildStandaloneHtml(set.project);
  assert.match(html, /groundChainId/);
  assert.match(html, /get_collision_geometry/);
  assert.match(html, /\[1,2,3,4,5,6,7,8,9,10\]/);

  const removed = applyAgentCommand(set.project, { op: "remove_collision_geometry", mapId: source.activeMapId });
  assert.equal(removed.changed, true);
  assert.equal(removed.result.removed.schemaVersion, LOOPLAB_COLLISION_GEOMETRY_SCHEMA);
});
