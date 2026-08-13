import assert from "node:assert/strict";
import test from "node:test";

import { applyAgentCommand, buildStandaloneHtml, createTemplate, getAgentManifest, validateProject } from "../lib/looplab-agent-core.mjs";
import { runAcceptanceSuite } from "../lib/looplab-acceptance.mjs";
import { inspectActorProgram, LOOPLAB_ACTOR_PROGRAM_SCHEMA, suggestActorProgram } from "../lib/looplab-actors.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { captureReplayState, LOOPLAB_REPLAY_ACTOR_HASH_VERSION, LOOPLAB_REPLAY_COMBAT_HASH_VERSION, LOOPLAB_REPLAY_HASH_VERSION } from "../lib/looplab-replay.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";

const clone = (value) => structuredClone(value);

function actorObject(id = "guard", x = 200, y = 200) {
  return {
    id, name: id, kind: "decor", x, y, z: 0, supportZ: 0, width: 20, height: 20,
    color: "#55555c", opacity: 1, solid: false, hidden: false, anchorMode: "ground", collisionOwner: "authored-map",
    groundAnchor: { offsetX: 10, offsetY: 20 },
    collider: { enabled: true, offsetX: 0, offsetY: 0, width: 20, height: 20, trigger: false, oneWay: false, zMin: 0, zMax: 1 },
  };
}

function actorDefinition(overrides = {}) {
  return {
    id: "actor-guard", mapId: "map-main", objectId: "guard", baseMode: "patrol", detectionMode: "none", target: null,
    speed: 60, arrivalRadius: 1, stopDistance: 18, safeDistance: 160, detectionRadius: 300, fieldOfViewDegrees: 360,
    memoryTicks: 12, repathTicks: 2, routeBehavior: "ping-pong", patrolNodeIds: ["node-a", "node-b", "node-c"],
    homeNodeId: "node-a", initialFacing: { x: 1, y: 0 }, cutscene: null, ...overrides,
  };
}

function actorProject(overrides = {}) {
  const project = createTemplate("topdown");
  project.maps[0].id = "map-main";
  project.startMapId = "map-main";
  project.activeMapId = "map-main";
  project.objects.push(actorObject());
  project.maps[0].objects = clone(project.objects);
  project.maps[0].navigation = {
    version: 1, activeLayerId: "ground", layers: [{ id: "ground", name: "Ground", color: "#55555c", visible: true, locked: false, zMin: 0, zMax: 1 }],
    nodes: [
      { id: "node-a", x: 210, y: 220, z: 0, layerId: "ground" },
      { id: "node-b", x: 310, y: 220, z: 0, layerId: "ground" },
      { id: "node-c", x: 410, y: 220, z: 0, layerId: "ground" },
      { id: "node-far", x: 210, y: 400, z: 0, layerId: "ground" },
    ],
    links: [
      { id: "link-a-b", a: "node-a", b: "node-b", layerId: "ground", cost: 1, oneWay: false },
      { id: "link-b-c", a: "node-b", b: "node-c", layerId: "ground", cost: 1, oneWay: false },
      { id: "link-a-far", a: "node-a", b: "node-far", layerId: "ground", cost: 1, oneWay: false },
    ],
    areas: [],
  };
  project.navigation = clone(project.maps[0].navigation);
  project.replay = { ...project.replay, cases: [] };
  project.actorProgram = {
    schemaVersion: LOOPLAB_ACTOR_PROGRAM_SCHEMA, enabled: true, actors: [actorDefinition(overrides.actor)], acceptanceTestIds: [],
  };
  return project;
}

test("actor inspection rejects unknown fields, movement-owner conflicts, and missing references", () => {
  const project = actorProject();
  assert.equal(inspectActorProgram(project).valid, true);
  project.actorProgram.actors[0].inventedGeometry = true;
  project.actorProgram.actors[0].homeNodeId = "missing";
  project.maps[0].objects.find((object) => object.id === "guard").motionBody = { schemaVersion: "looplab-motion-body/v1" };
  const report = inspectActorProgram(project);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === "actor-unknown-field"));
  assert.ok(report.issues.some((issue) => issue.code === "actor-home-node"));
  assert.ok(report.issues.some((issue) => issue.code === "actor-motion-conflict"));
});

test("actor inspection rejects unauthored route steps and cross-map actor targets", () => {
  const disconnected = actorProject();
  disconnected.maps[0].navigation.links.find((link) => link.id === "link-b-c").oneWay = true;
  disconnected.navigation = clone(disconnected.maps[0].navigation);
  const disconnectedReport = inspectActorProgram(disconnected);
  assert.equal(disconnectedReport.valid, false);
  assert.ok(disconnectedReport.issues.some((issue) => issue.code === "actor-route-link-missing" && issue.fromNodeId === "node-c" && issue.toNodeId === "node-b"));

  const crossMap = actorProject({ actor: { detectionMode: "chase", target: { kind: "actor", id: "actor-other" } } });
  const otherMap = clone(crossMap.maps[0]);
  otherMap.id = "map-other";
  const otherObject = otherMap.objects.find((object) => object.id === "guard");
  otherObject.id = "guard-other";
  otherObject.name = "guard-other";
  crossMap.maps.push(otherMap);
  crossMap.actorProgram.actors.push(actorDefinition({ id: "actor-other", mapId: "map-other", objectId: "guard-other", baseMode: "hold", patrolNodeIds: [] }));
  const crossMapReport = inspectActorProgram(crossMap);
  assert.equal(crossMapReport.valid, false);
  assert.ok(crossMapReport.issues.some((issue) => issue.code === "actor-target-map"));
});

test("patrol movement follows authored nodes, emits route events, and round-trips save v4", () => {
  const runtime = createRuntimeModel(actorProject());
  let events = [];
  for (let tick = 0; tick < 110; tick += 1) events.push(...runtime.update(1 / 60));
  const state = runtime.getActorStates()[0];
  assert.equal(state.mode, "patrol");
  assert.ok(state.x > 290, `expected authored patrol progress, got x=${state.x}`);
  assert.ok(events.some((event) => event.type === "actor.node-reached" && event.nodeId === "node-b"));
  const saved = runtime.exportSaveState();
  assert.equal(saved.schemaVersion, "looplab-runtime-save-state/v4");
  assert.equal(saved.version, 4);
  assert.equal(runtime.validateSaveState(saved).valid, true);
  const before = runtime.getActorStates();
  runtime.reset();
  assert.equal(runtime.restoreSaveState(saved).ok, true);
  assert.deepEqual(runtime.getActorStates(), before);
});

test("line of sight selects the nearest stable blocker independent of object order", () => {
  const project = actorProject({ actor: { baseMode: "hold", patrolNodeIds: [], detectionMode: "chase", target: { kind: "player" }, detectionRadius: 1000, stopDistance: 10 } });
  const player = project.maps[0].objects.find((object) => object.id === "player");
  player.x = 430;
  player.y = 192;
  project.objects = clone(project.maps[0].objects);
  const wallA = { ...actorObject("wall-a", 320, 190), kind: "platform", width: 12, height: 60, solid: true, hidden: true, groundAnchor: { offsetX: 6, offsetY: 60 }, collider: { enabled: true, offsetX: 0, offsetY: 0, width: 12, height: 60, trigger: false, oneWay: false, zMin: 0, zMax: 1 } };
  const wallB = { ...clone(wallA), id: "wall-b", name: "wall-b" };
  project.maps[0].objects.push(wallB, wallA);
  project.objects = clone(project.maps[0].objects);
  const runtime = createRuntimeModel(project);
  assert.ok(runtime.update(1 / 60).some((event) => event.type === "actor.detected"));
  runtime.getObjects().find((object) => object.id === "wall-a").hidden = false;
  runtime.getObjects().find((object) => object.id === "wall-b").hidden = false;
  const lost = runtime.update(1 / 60).find((event) => event.type === "actor.lost");
  assert.equal(lost.blockerId, "wall-a");
  assert.equal(runtime.getActorStates()[0].detected, false);
});

test("cutscene gate has priority and flee selects the farthest reachable stable node", () => {
  const cutscene = actorProject({ actor: { baseMode: "hold", patrolNodeIds: [], cutscene: { variableId: "scene-live", operator: "eq", value: true, nodeIds: ["node-a", "node-b"], routeBehavior: "stop" } } });
  cutscene.gameplayProgram.variables.push({ id: "scene-live", type: "boolean", initial: true });
  const cutsceneRuntime = createRuntimeModel(cutscene);
  const events = cutsceneRuntime.update(1 / 60);
  assert.equal(cutsceneRuntime.getActorStates()[0].mode, "cutscene");
  assert.ok(events.some((event) => event.type === "actor.mode-changed" && event.mode === "cutscene"));

  const flee = actorProject({ actor: { baseMode: "hold", patrolNodeIds: [], detectionMode: "flee", target: { kind: "player" }, detectionRadius: 1000, safeDistance: 1000 } });
  const player = flee.maps[0].objects.find((object) => object.id === "player");
  player.x = 250;
  player.y = 192;
  flee.objects = clone(flee.maps[0].objects);
  const fleeRuntime = createRuntimeModel(flee);
  fleeRuntime.update(1 / 60);
  const state = fleeRuntime.getActorStates()[0];
  assert.equal(state.mode, "flee");
  assert.equal(state.routeNodeIds.at(-1), "node-far");
});

test("actor suggestion is provider-free, bounded, and source-valid", () => {
  const project = actorProject();
  delete project.actorProgram;
  const suggestion = suggestActorProgram(project, { mapId: "map-main", objectIds: ["guard"] });
  assert.equal(suggestion.provider, "none");
  assert.equal(suggestion.available, true);
  assert.equal(suggestion.program.actors.length, 1);
  assert.equal(suggestion.report.valid, true);
});

test("acceptance, replay v8, headless commands, Doctor, manifest, and one-file export expose the same actor truth", () => {
  const project = actorProject();
  project.acceptanceTests = [{
    id: "actor-patrol", name: "Guard begins authored patrol", ownerId: "guard",
    assertion: "The guard reaches its authored home node and advances along the patrol route on fixed ticks.",
    runner: "looplab-deterministic-runtime",
    driver: { tickRate: 60, tickCount: 2, inputs: [] },
    assertions: [
      { id: "actor-mode", target: "actor-state", targetId: "actor-guard", property: "mode", operator: "equals", expected: "patrol", atTick: 2 },
      { id: "actor-progress", target: "actor-state", targetId: "actor-guard", property: "x", operator: "greater-than", expected: 200, atTick: 2 },
      { id: "actor-node-event", target: "event-emitted", targetId: "actor.node-reached", operator: "greater-or-equal", expected: 1, atTick: 2 },
    ],
  }];
  project.actorProgram.acceptanceTestIds = ["actor-patrol"];
  assert.equal(runAcceptanceSuite(project).status, "passed");
  const validation = validateProject(project);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.equal(analyzeProject(project, { profile: "production" }).actorReport.valid, true);

  const runtime = createRuntimeModel(project);
  runtime.update(1 / 60);
  const v7 = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_COMBAT_HASH_VERSION });
  const v8 = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_ACTOR_HASH_VERSION });
  assert.equal(Object.hasOwn(v7, "actors"), false);
  assert.equal(v8.actors[0].actorId, "actor-guard");

  const source = clone(project);
  delete source.actorProgram;
  const set = applyAgentCommand(source, { op: "set_actor_program", program: project.actorProgram });
  assert.equal(set.changed, true);
  assert.equal(set.result.report.valid, true);
  assert.equal(applyAgentCommand(set.project, { op: "get_actor_report", profile: "production" }).result.actorCount, 1);
  const suggested = applyAgentCommand(source, { op: "suggest_actor_program", mapId: "map-main", objectIds: ["guard"] });
  assert.equal(suggested.changed, false);
  assert.equal(suggested.result.provider, "none");
  assert.equal(suggested.result.available, true);

  const manifest = getAgentManifest();
  assert.ok(manifest.commands.includes("suggest_actor_program"));
  assert.ok(manifest.commands.includes("set_actor_program"));
  assert.ok(manifest.exportedRuntime.methods.includes("getActorStates"));
  assert.ok(manifest.exportedRuntime.commands.includes("get_actor_states"));
  assert.equal(manifest.deterministicActors.schemaVersion, LOOPLAB_ACTOR_PROGRAM_SCHEMA);
  assert.equal(manifest.deterministicReplay.currentHashVersion, LOOPLAB_REPLAY_HASH_VERSION);

  const html = buildStandaloneHtml(project);
  assert.match(html, /getActorStates/);
  assert.match(html, /get_actor_states/);
  assert.match(html, /actor\.mode-changed/);
  assert.match(html, /looplab-runtime-save-state\/v4/);
  assert.match(html, /\[1,2,3,4,5,6,7,8,9,10,11,12,13,14\]/);

  const removed = applyAgentCommand(set.project, { op: "remove_actor_program" });
  assert.equal(removed.changed, true);
  assert.equal(removed.result.removed.schemaVersion, LOOPLAB_ACTOR_PROGRAM_SCHEMA);
});
