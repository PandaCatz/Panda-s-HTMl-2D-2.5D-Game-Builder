import assert from "node:assert/strict";
import test from "node:test";

import { applyAgentCommand, buildStandaloneHtml, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import {
  inspectMotionBodies,
  LOOPLAB_MOTION_BODY_LEGACY_SCHEMA,
  LOOPLAB_MOTION_BODY_RUNTIME_STATE_SCHEMA,
  LOOPLAB_MOTION_BODY_SCHEMA,
} from "../lib/looplab-motion-bodies.mjs";
import {
  captureReplayState,
  LOOPLAB_REPLAY_CHOICE_HASH_VERSION,
  LOOPLAB_REPLAY_COLLISION_HASH_VERSION,
  LOOPLAB_REPLAY_MOTION_CARRY_HASH_VERSION,
  LOOPLAB_REPLAY_MOTION_HASH_VERSION,
  LOOPLAB_REPLAY_SHA256_HASH_VERSION,
  replayStateDigest,
} from "../lib/looplab-replay.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";

function clone(value) {
  return structuredClone(value);
}

function motionBody(overrides = {}) {
  return {
    schemaVersion: LOOPLAB_MOTION_BODY_SCHEMA,
    enabled: true,
    driver: "input",
    pathId: "cargo-route",
    actionId: "interact",
    initialDirection: "forward",
    endBehavior: "stop",
    maxSpeed: 180,
    acceleration: 720,
    deceleration: 960,
    collisionResponse: "stop",
    snapTolerance: 8,
    riderMode: "block",
    carryTolerance: 2,
    crushResponse: "stop",
    ...overrides,
  };
}

function motionProject(options = {}) {
  const project = createTemplate("topdown");
  const map = project.maps[0];
  const source = clone(project.objects.find((object) => object.id === "south-wall"));
  const cargo = {
    ...source,
    id: "cargo",
    name: "Cargo",
    kind: "platform",
    x: 80,
    y: 80,
    width: 20,
    height: 20,
    groundAnchor: { offsetX: 10, offsetY: 20 },
    collider: { ...source.collider, enabled: true, oneWay: false, trigger: false, width: 20, height: 20 },
    motionBody: motionBody(options.body),
  };
  const blocker = {
    ...source,
    id: "blocker",
    name: "Blocker",
    kind: "platform",
    x: 110,
    y: 80,
    width: 20,
    height: 20,
    groundAnchor: { offsetX: 10, offsetY: 20 },
    collider: { ...source.collider, enabled: true, oneWay: false, trigger: false, width: 20, height: 20 },
  };
  const path = {
    id: "cargo-route",
    name: "Cargo route",
    kind: "route",
    collisionOwner: "authored-map",
    points: [{ x: 90, y: 100, z: 0 }, { x: 240, y: 100, z: 0 }],
    entryRadius: 8,
    entryZTolerance: 8,
    minimumEntrySpeed: 0,
    direction: "both",
    acceleration: 0,
    maximumSpeed: 180,
    exitImpulse: { x: 0, y: 0, z: 0 },
    transferPathIds: [],
    bailBehavior: "drop",
  };
  project.objects = [
    ...project.objects.filter((object) => !["north-wall", "south-wall", "west-wall", "east-wall"].includes(object.id)),
    cargo,
    ...(options.blocker === false ? [] : [blocker]),
  ];
  project.traversalPaths = [path];
  map.objects = clone(project.objects);
  map.traversalPaths = clone(project.traversalPaths);
  project.replay = { ...project.replay, cases: [] };
  return project;
}

function rideProject(options = {}) {
  const project = createTemplate("platformer");
  const sourcePlayer = clone(project.objects.find((object) => object.id === "player"));
  const sourcePlatform = clone(project.objects.find((object) => object.id === "start-floor"));
  const sourceSpawn = clone(project.objects.find((object) => object.id === "spawn"));
  const vertical = options.axis === "vertical";
  const platform = {
    ...sourcePlatform,
    id: "carrier",
    name: "Carrier",
    x: 100,
    y: 300,
    width: 120,
    height: 20,
    groundAnchor: { offsetX: 60, offsetY: 20 },
    collider: { ...sourcePlatform.collider, oneWay: false, width: 120, height: 20 },
    motionBody: motionBody({
      driver: "automatic",
      actionId: undefined,
      pathId: "carrier-route",
      endBehavior: "stop",
      maxSpeed: 120,
      acceleration: 720,
      deceleration: 960,
      riderMode: options.legacy ? undefined : "carry-player",
      carryTolerance: options.legacy ? undefined : 2,
      crushResponse: options.crushResponse ?? "stop",
      ...(options.legacy ? { schemaVersion: LOOPLAB_MOTION_BODY_LEGACY_SCHEMA } : {}),
    }),
  };
  if (options.legacy) {
    delete platform.motionBody.riderMode;
    delete platform.motionBody.carryTolerance;
    delete platform.motionBody.crushResponse;
  }
  const player = {
    ...sourcePlayer,
    x: options.playerX ?? 190,
    y: 242,
    vx: 0,
    vy: 0,
    grounded: true,
  };
  const spawn = { ...sourceSpawn, x: 20, y: 242 };
  const wall = {
    ...sourcePlatform,
    id: "crush-wall",
    name: "Crush wall",
    x: 260,
    y: 150,
    width: 20,
    height: 150,
    collider: { ...sourcePlatform.collider, oneWay: false, width: 20, height: 150 },
  };
  const path = {
    id: "carrier-route",
    name: "Carrier route",
    kind: "route",
    collisionOwner: "authored-map",
    points: vertical
      ? [{ x: 160, y: 320, z: 0 }, { x: 160, y: 220, z: 0 }]
      : [{ x: 160, y: 320, z: 0 }, { x: 360, y: 320, z: 0 }],
    entryRadius: 8,
    entryZTolerance: 8,
    minimumEntrySpeed: 0,
    direction: "both",
    acceleration: 0,
    maximumSpeed: 120,
    exitImpulse: { x: 0, y: 0, z: 0 },
    transferPathIds: [],
    bailBehavior: "drop",
  };
  project.objects = [player, platform, spawn, ...(options.wall ? [wall] : [])];
  project.traversalPaths = [path];
  project.maps[0].objects = clone(project.objects);
  project.maps[0].traversalPaths = clone(project.traversalPaths);
  project.replay = { ...project.replay, cases: [] };
  return project;
}

test("motion-body inspection rejects unsafe numeric input and open collision loops", () => {
  const project = motionProject({ blocker: false });
  assert.equal(inspectMotionBodies(project).valid, true);

  project.objects.find((object) => object.id === "cargo").motionBody.maxSpeed = "180";
  project.maps[0].objects = clone(project.objects);
  const numeric = inspectMotionBodies(project);
  assert.equal(numeric.valid, false);
  assert.ok(numeric.issues.some((issue) => issue.code === "motion-body-speed"));

  project.objects.find((object) => object.id === "cargo").motionBody.maxSpeed = 180;
  project.objects.find((object) => object.id === "cargo").motionBody.endBehavior = "loop";
  project.maps[0].objects = clone(project.objects);
  const openLoop = inspectMotionBodies(project);
  assert.equal(openLoop.valid, false);
  assert.ok(openLoop.issues.some((issue) => issue.code === "motion-body-loop-open"));
});

test("held semantic input moves a body until authored collision and emits stable lifecycle events", () => {
  const runtime = createRuntimeModel(motionProject());
  runtime.setInput("KeyE", true);
  const events = [];
  for (let index = 0; index < 120; index += 1) events.push(...runtime.update(1 / 60));
  const state = runtime.getMotionBodyStates().find((entry) => entry.objectId === "cargo");
  const cargo = runtime.getObjects().find((object) => object.id === "cargo");
  assert.equal(state.blocked, true);
  assert.equal(state.blockerId, "blocker");
  assert.equal(cargo.x, 90);
  assert.equal(events.filter((event) => event.type === "motion-body.started").length, 1);
  assert.equal(events.filter((event) => event.type === "motion-body.blocked").length, 1);

  runtime.setInput("KeyE", false);
  const released = runtime.update(1 / 60);
  assert.equal(released.filter((event) => event.type === "motion-body.released").length, 1);
});

test("v2 platforms carry a qualified player by the exact accepted horizontal and vertical delta", () => {
  for (const axis of ["horizontal", "vertical"]) {
    const runtime = createRuntimeModel(rideProject({ axis }));
    const initialPlayer = clone(runtime.getObjects().find((object) => object.id === "player"));
    const initialPlatform = clone(runtime.getObjects().find((object) => object.id === "carrier"));
    for (let index = 0; index < 20; index += 1) runtime.update(1 / 60);
    const player = runtime.getObjects().find((object) => object.id === "player");
    const platform = runtime.getObjects().find((object) => object.id === "carrier");
    const state = runtime.getMotionBodyStates().find((entry) => entry.objectId === "carrier");
    assert.equal(state.schemaVersion, LOOPLAB_MOTION_BODY_RUNTIME_STATE_SCHEMA);
    assert.equal(state.riderId, "player");
    assert.ok(Math.abs((player.x - initialPlayer.x) - (platform.x - initialPlatform.x)) < 0.000001);
    assert.ok(Math.abs((player.y - initialPlayer.y) - (platform.y - initialPlatform.y)) < 0.000001);
    assert.equal(state.crushed, false);
  }
});

test("legacy v1 bodies retain player-blocking semantics instead of silently carrying", () => {
  const runtime = createRuntimeModel(rideProject({ axis: "vertical", legacy: true }));
  const playerBefore = clone(runtime.getObjects().find((object) => object.id === "player"));
  const platformBefore = clone(runtime.getObjects().find((object) => object.id === "carrier"));
  const events = [];
  for (let index = 0; index < 10; index += 1) events.push(...runtime.update(1 / 60));
  const player = runtime.getObjects().find((object) => object.id === "player");
  const platform = runtime.getObjects().find((object) => object.id === "carrier");
  const state = runtime.getMotionBodyStates().find((entry) => entry.objectId === "carrier");
  assert.equal(platform.y, platformBefore.y);
  assert.equal(player.y, playerBefore.y);
  assert.equal(state.blocked, true);
  assert.equal(state.blockerId, "player");
  assert.equal(state.riderId, null);
  assert.equal(events.filter((event) => event.type === "motion-body.blocked").length, 1);
});

test("carry-player rejects changing-z paths until an authored support-volume contract exists", () => {
  const project = rideProject();
  project.traversalPaths[0].points[1].z = 4;
  project.maps[0].traversalPaths = clone(project.traversalPaths);
  const report = inspectMotionBodies(project);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === "motion-body-rider-z-path"));
});

test("crush stop rolls back the blocked substep and emits one latched event", () => {
  const runtime = createRuntimeModel(rideProject({ wall: true }));
  const events = [];
  for (let index = 0; index < 90; index += 1) events.push(...runtime.update(1 / 60));
  const player = runtime.getObjects().find((object) => object.id === "player");
  const platform = runtime.getObjects().find((object) => object.id === "carrier");
  const state = runtime.getMotionBodyStates().find((entry) => entry.objectId === "carrier");
  assert.equal(state.blocked, true);
  assert.equal(state.blockerId, "player");
  assert.equal(state.crushed, true, "crush remains observable while the automatic platform keeps applying pressure");
  assert.equal(state.crushBlockerId, "crush-wall");
  assert.equal(state.crushResponse, "stop");
  assert.ok(platform.x < 140);
  assert.ok(player.x + player.collider.offsetX + player.collider.width <= 260.000001);
  const crushEvents = events.filter((event) => event.type === "motion-body.crushed");
  assert.equal(crushEvents.length, 1, JSON.stringify(crushEvents));
  assert.equal(crushEvents[0].blockerId, "crush-wall");
  assert.equal(crushEvents[0].response, "stop");
});

test("crush respawn uses the canonical spawn path once and lets the platform continue", () => {
  const runtime = createRuntimeModel(rideProject({ wall: true, crushResponse: "respawn" }));
  const events = [];
  for (let index = 0; index < 90; index += 1) events.push(...runtime.update(1 / 60));
  const player = runtime.getObjects().find((object) => object.id === "player");
  const platform = runtime.getObjects().find((object) => object.id === "carrier");
  assert.ok(platform.x > 140);
  assert.ok(player.x < 100);
  assert.equal(events.filter((event) => event.type === "motion-body.crushed").length, 1);
  const respawn = events.find((event) => event.type === "player.respawned" && event.cause === "motion-body-crush");
  assert.equal(respawn?.objectId, "carrier");
});

test("automatic ping-pong bodies reverse and inactive map motion state persists", () => {
  const project = motionProject({ blocker: false });
  const first = clone(project.maps[0]);
  const second = clone(first);
  second.id = "map-auto";
  second.name = "Automatic room";
  second.objects = second.objects.map((object) => object.id === "cargo"
    ? { ...object, id: "sentry", name: "Sentry", motionBody: motionBody({ driver: "automatic", actionId: undefined, pathId: "sentry-route", endBehavior: "ping-pong", maxSpeed: 240, acceleration: 2400 }) }
    : object);
  second.traversalPaths = second.traversalPaths.map((path) => ({ ...path, id: "sentry-route", points: [{ x: 90, y: 100, z: 0 }, { x: 130, y: 100, z: 0 }] }));
  project.maps = [first, second];
  project.activeMapId = first.id;
  project.objects = clone(first.objects);
  project.traversalPaths = clone(first.traversalPaths);

  const runtime = createRuntimeModel(project);
  runtime.setInput("KeyE", true);
  for (let index = 0; index < 30; index += 1) runtime.update(1 / 60);
  runtime.setInput("KeyE", false);
  const before = runtime.getMotionBodyStates().find((entry) => entry.mapId === first.id && entry.objectId === "cargo").progress;

  assert.equal(runtime.loadMap(second.id), true);
  const events = [];
  for (let index = 0; index < 45; index += 1) events.push(...runtime.update(1 / 60));
  assert.ok(events.some((event) => event.type === "motion-body.reversed"));
  const sentry = runtime.getMotionBodyStates().find((entry) => entry.objectId === "sentry");
  assert.ok(sentry.progress >= 0 && sentry.progress <= 40);

  assert.equal(runtime.loadMap(first.id), true);
  const after = runtime.getMotionBodyStates().find((entry) => entry.mapId === first.id && entry.objectId === "cargo").progress;
  assert.equal(after, before);
});

test("motion-body save v2 round-trips while projects without bodies keep exact v1 shape", () => {
  const plainRuntime = createRuntimeModel(createTemplate("topdown"));
  const plainSave = plainRuntime.exportSaveState();
  assert.equal(plainSave.schemaVersion, "looplab-runtime-save-state/v1");
  assert.equal(plainSave.version, 1);
  assert.equal(Object.hasOwn(plainSave, "motionBodyStates"), false);

  const runtime = createRuntimeModel(motionProject({ blocker: false }));
  runtime.setInput("KeyE", true);
  for (let index = 0; index < 25; index += 1) runtime.update(1 / 60);
  const before = runtime.getMotionBodyStates()[0];
  const saved = runtime.exportSaveState();
  assert.equal(saved.schemaVersion, "looplab-runtime-save-state/v2");
  assert.equal(saved.version, 2);
  assert.equal(saved.motionBodyStates.length, 1);
  assert.equal(runtime.validateSaveState(saved).valid, true);

  runtime.reset();
  assert.equal(runtime.restoreSaveState(saved).ok, true);
  const after = runtime.getMotionBodyStates()[0];
  assert.equal(after.progress, before.progress);
  assert.equal(after.speed, before.speed);
  assert.equal(after.direction, before.direction);
  assert.equal(after.engaged, false);
});

test("replay v5 through v9 keep the frozen motion projection while v10 adds rider and crush state", () => {
  const runtime = createRuntimeModel(motionProject({ blocker: false }));
  runtime.setInput("KeyE", true);
  runtime.update(1 / 60);
  const v4 = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_CHOICE_HASH_VERSION });
  const v5 = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_MOTION_HASH_VERSION });
  const v6 = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_SHA256_HASH_VERSION });
  const v9 = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_COLLISION_HASH_VERSION });
  const v10 = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_MOTION_CARRY_HASH_VERSION });
  assert.equal(Object.hasOwn(v4, "motionBodies"), false);
  assert.equal(v5.motionBodies.length, 1);
  assert.deepEqual(v6, v5, "v6 intentionally retains the complete v5 state projection");
  assert.equal(v5.motionBodies[0].schemaVersion, "looplab-motion-body-state/v1");
  assert.equal(v9.motionBodies[0].schemaVersion, "looplab-motion-body-state/v1");
  assert.equal(Object.hasOwn(v9.motionBodies[0], "riderId"), false);
  assert.equal(v10.motionBodies[0].schemaVersion, LOOPLAB_MOTION_BODY_RUNTIME_STATE_SCHEMA);
  assert.equal(Object.hasOwn(v10.motionBodies[0], "riderId"), true);
  assert.equal(Object.hasOwn(v10.motionBodies[0], "crushResponse"), true);
  const firstV5 = replayStateDigest(v5, { hashVersion: LOOPLAB_REPLAY_MOTION_HASH_VERSION });
  const firstV6 = replayStateDigest(v6, { hashVersion: LOOPLAB_REPLAY_SHA256_HASH_VERSION });
  assert.match(firstV5, /^replay-[0-9a-f]{8}$/);
  assert.match(firstV6, /^replay-sha256-[0-9a-f]{64}$/);
  runtime.update(1 / 60);
  assert.notEqual(replayStateDigest(captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_MOTION_HASH_VERSION }), { hashVersion: LOOPLAB_REPLAY_MOTION_HASH_VERSION }), firstV5);
  assert.notEqual(replayStateDigest(captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_SHA256_HASH_VERSION }), { hashVersion: LOOPLAB_REPLAY_SHA256_HASH_VERSION }), firstV6);
});

test("headless commands, Doctor, manifest, and standalone export expose motion-body truth", () => {
  const project = motionProject({ blocker: false });
  const suggested = applyAgentCommand(project, { op: "suggest_motion_body", id: "cargo", pathId: "cargo-route" });
  assert.equal(suggested.changed, false);
  assert.equal(suggested.result.available, true);
  assert.equal(suggested.result.body.schemaVersion, LOOPLAB_MOTION_BODY_SCHEMA);
  assert.equal(suggested.result.body.riderMode, "block");
  delete project.objects.find((object) => object.id === "cargo").motionBody;
  project.maps[0].objects = clone(project.objects);
  const set = applyAgentCommand(project, { op: "set_motion_body", id: "cargo", body: motionBody() });
  assert.equal(set.changed, true);
  assert.equal(set.result.motionBody.schemaVersion, LOOPLAB_MOTION_BODY_SCHEMA);

  const report = applyAgentCommand(set.project, { op: "get_motion_body_report", profile: "production" });
  assert.equal(report.changed, false);
  assert.equal(report.result.bodyCount, 1);
  assert.ok(report.result.issues.some((issue) => issue.code === "motion-body-evidence-missing" && issue.severity === "warning"));
  const doctor = analyzeProject(set.project, { profile: "production" });
  assert.equal(doctor.motionBodyReport.bodyCount, 1);
  assert.ok(doctor.issues.some((issue) => issue.code === "motion-body-evidence-missing"));

  const manifest = getAgentManifest();
  assert.ok(manifest.commands.includes("set_motion_body"));
  assert.ok(manifest.commands.includes("suggest_motion_body"));
  assert.ok(manifest.commands.includes("get_motion_body_report"));
  assert.ok(manifest.exportedRuntime.methods.includes("getMotionBodyStates"));
  assert.equal(manifest.deterministicMotionBodies.schemaVersion, LOOPLAB_MOTION_BODY_SCHEMA);
  assert.equal(manifest.deterministicMotionBodies.runtimeStateSchemaVersion, LOOPLAB_MOTION_BODY_RUNTIME_STATE_SCHEMA);
  assert.ok(manifest.deterministicMotionBodies.runtimeCommands.includes("get_motion_body_states"));

  const html = buildStandaloneHtml(set.project);
  assert.match(html, /getMotionBodyStates/);
  assert.match(html, /get_motion_body_states/);
  assert.match(html, /motion-body\.blocked/);
  assert.match(html, /motion-body\.crushed/);

  const removed = applyAgentCommand(set.project, { op: "remove_motion_body", id: "cargo" });
  assert.equal(removed.changed, true);
  assert.equal(removed.result.removed.schemaVersion, LOOPLAB_MOTION_BODY_SCHEMA);
});
