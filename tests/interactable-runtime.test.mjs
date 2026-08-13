import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";
import { materializeInteractableTemplate } from "../lib/looplab-interactables.mjs";
import { captureReplayState, LOOPLAB_REPLAY_INTERACTABLE_HASH_VERSION, LOOPLAB_REPLAY_WORLD_STREAM_HASH_VERSION } from "../lib/looplab-replay.mjs";

function player(x, y) {
  return {
    id: "player",
    kind: "player",
    name: "Player",
    x,
    y,
    z: 0,
    supportZ: 0,
    width: 24,
    height: 32,
    color: "#56606a",
    solid: false,
    anchorMode: "ground",
    collisionOwner: "authored-map",
    groundAnchor: { offsetX: 12, offsetY: 32 },
    collider: { enabled: true, offsetX: 0, offsetY: 0, width: 24, height: 32, trigger: false, oneWay: false, zMin: 0, zMax: 1 },
  };
}

function floor(y = 400) {
  return {
    id: "floor",
    kind: "platform",
    name: "Floor",
    x: 0,
    y,
    z: 0,
    supportZ: 0,
    width: 640,
    height: 40,
    color: "#3d4146",
    solid: true,
    anchorMode: "ground",
    collisionOwner: "authored-map",
    groundAnchor: { offsetX: 320, offsetY: 40 },
    collider: { enabled: true, offsetX: 0, offsetY: 0, width: 640, height: 40, trigger: false, oneWay: false, zMin: 0, zMax: 1 },
  };
}

function bundle(templateId, instanceId, x, y, parameters = {}) {
  return materializeInteractableTemplate({
    templateId,
    instanceId,
    mapId: "main",
    sourceDigest: `source-${"a".repeat(64)}`,
    x,
    y,
    parameters,
  }).objects;
}

function runtimeProject(objects, { controlMode = "platformer", gravity = controlMode === "platformer" ? 1500 : 0, movementTuning } = {}) {
  const map = { id: "main", name: "Main", width: 640, height: 480, background: "#d4d4d4", gravity, grid: 16, controlMode, objects, ...(movementTuning ? { movementTuning } : {}) };
  return { name: "Interactable runtime", width: 640, height: 480, background: "#d4d4d4", gravity, grid: 16, controlMode, objects, maps: [map], activeMapId: "main", startMapId: "main", assets: [] };
}

function eventTypes(events) {
  return events.map((entry) => entry.type);
}

test("a swept authored spring launches once and uses simulation-tick cooldown", () => {
  const spring = bundle("spring", "fast-pad", 120, 400, { width: 8, impulseX: 0, impulseY: -900, cooldownTicks: 4 });
  const runtime = createRuntimeModel(runtimeProject([player(0, 368), floor(), ...spring], {
    movementTuning: { maxRunSpeed: 4000, groundAcceleration: 100000, airAcceleration: 100000, groundFriction: 2600 },
  }));
  runtime.setInput("right", true);
  const events = runtime.update(0.05);
  assert.ok(eventTypes(events).includes("spring.launched"), "thin trigger must be caught by the swept test");
  assert.equal(runtime.getState().player.vy, -900);
  const pad = runtime.getObjects().find((object) => object.kind === "spring");
  assert.equal(pad.cooldownTicks, 4);
  assert.equal(eventTypes(runtime.update(1 / 60)).includes("spring.launched"), false);
  assert.equal(pad.cooldownTicks, 3);
});

test("ladder entry is explicit and replaces gravity until a deliberate jump exit", () => {
  const ladder = bundle("ladder", "shaft", 120, 400, { climbSpeed: 180 });
  const runtime = createRuntimeModel(runtimeProject([player(108, 340), floor(), ...ladder]));
  runtime.setInput("interact", true);
  assert.ok(eventTypes(runtime.update(1 / 60)).includes("ladder.entered"));
  assert.equal(runtime.getState().player.interactableMode, "ladder");
  runtime.setInput("interact", false);
  runtime.setInput("up", true);
  const before = runtime.getState().player.y;
  runtime.update(1 / 60);
  assert.ok(runtime.getState().player.y < before);
  assert.equal(runtime.getState().player.vy, -180);
  runtime.setInput("jump", true);
  assert.ok(eventTypes(runtime.update(1 / 60)).includes("ladder.exited"));
  assert.equal(runtime.getState().player.interactableMode, "default");
  assert.equal(runtime.getState().player.vy, -260);
});

test("conveyors and crumble platforms act only through exact resolved support", () => {
  const conveyor = bundle("conveyor", "belt", 160, 400, { speed: 120 });
  const conveyorRuntime = createRuntimeModel(runtimeProject([player(120, 344), ...conveyor]));
  const startX = conveyorRuntime.getState().player.x;
  const conveyorEvents = conveyorRuntime.update(1 / 60);
  assert.ok(eventTypes(conveyorEvents).includes("conveyor.engaged"));
  assert.equal(conveyorRuntime.getState().player.groundObjectId, conveyor[0].id);
  assert.ok(conveyorRuntime.getState().player.x > startX);
  const currentReplay = captureReplayState(conveyorRuntime, { hashVersion: LOOPLAB_REPLAY_INTERACTABLE_HASH_VERSION });
  const legacyReplay = captureReplayState(conveyorRuntime, { hashVersion: LOOPLAB_REPLAY_WORLD_STREAM_HASH_VERSION });
  assert.equal(currentReplay.player.groundObjectId, conveyor[0].id);
  assert.equal(currentReplay.player.conveyorObjectId, conveyor[0].id);
  assert.equal(Object.prototype.hasOwnProperty.call(legacyReplay.player, "groundObjectId"), false);

  const crumble = bundle("crumble-platform", "fragile", 160, 400, { warningTicks: 2, disabledTicks: 3 });
  const crumbleRuntime = createRuntimeModel(runtimeProject([player(120, 344), ...crumble]));
  assert.ok(eventTypes(crumbleRuntime.update(1 / 60)).includes("crumble.armed"));
  assert.equal(crumbleRuntime.getObjects().find((object) => object.kind === "crumble-platform").runtimeState, "armed");
  crumbleRuntime.update(1 / 60);
  const fallEvents = crumbleRuntime.update(1 / 60);
  const platform = crumbleRuntime.getObjects().find((object) => object.kind === "crumble-platform");
  assert.ok(eventTypes(fallEvents).includes("crumble.fell"));
  assert.equal(platform.runtimeState, "disabled");
  assert.equal(platform.collider.enabled, false);
  assert.equal(platform.solid, false);
});

test("portable save state restores logical inventory and exact door runtime overrides", () => {
  const lock = bundle("key-door", "save-lock", 100, 300, { doorOffsetX: 180, interactionRadius: 32 });
  const project = runtimeProject([player(92, 268), ...lock], { controlMode: "topdown", gravity: 0 });
  const runtime = createRuntimeModel(project);
  runtime.update(1 / 60);
  const door = runtime.getObjects().find((object) => object.interactable?.role === "door");
  const actor = runtime.getObjects().find((object) => object.kind === "player");
  actor.x = door.x - actor.width - 8;
  actor.y = door.y + door.height - actor.height;
  runtime.setInput("interact", true);
  runtime.update(1 / 60);
  const saveState = runtime.exportSaveState();
  const restored = createRuntimeModel(project);
  const outcome = restored.restoreSaveState(saveState);
  assert.equal(outcome.ok, true);
  const restoredKey = restored.getObjects().find((object) => object.kind === "key");
  const restoredDoor = restored.getObjects().find((object) => object.interactable?.role === "door");
  assert.equal(restoredKey.collected, true);
  assert.equal(restoredDoor.runtimeState, "open");
  assert.equal(restoredDoor.collider.enabled, false);
  assert.equal(restoredDoor.solid, false);
});

test("key-door logic is logical-ID based and pressure plates control only their bound gate", () => {
  const lock = bundle("key-door", "lock-a", 100, 300, { doorOffsetX: 180, interactionRadius: 32 });
  const keyRuntime = createRuntimeModel(runtimeProject([player(92, 268), ...lock], { controlMode: "topdown", gravity: 0 }));
  assert.ok(eventTypes(keyRuntime.update(1 / 60)).includes("key.collected"));
  assert.equal(keyRuntime.getState().collectedCount, 0, "logical keys are inventory state, not coin score");
  const door = keyRuntime.getObjects().find((object) => object.interactable?.role === "door");
  const keyPlayer = keyRuntime.getObjects().find((object) => object.kind === "player");
  keyPlayer.x = door.x - keyPlayer.width - 8;
  keyPlayer.y = door.y + door.height - keyPlayer.height;
  keyRuntime.setInput("interact", true);
  assert.ok(eventTypes(keyRuntime.update(1 / 60)).includes("door.opened"));
  assert.equal(door.collider.enabled, false);
  assert.equal(door.solid, false);

  const plateBundle = bundle("pressure-plate", "plate-a", 120, 300, { gateOffsetX: 200, latch: false });
  const plateRuntime = createRuntimeModel(runtimeProject([player(108, 268), ...plateBundle], { controlMode: "topdown", gravity: 0 }));
  const openEvents = plateRuntime.update(1 / 60);
  assert.ok(eventTypes(openEvents).includes("plate.pressed"));
  const gate = plateRuntime.getObjects().find((object) => object.interactable?.role === "gate");
  assert.equal(gate.collider.enabled, false);
  const platePlayer = plateRuntime.getObjects().find((object) => object.kind === "player");
  platePlayer.x = 20;
  platePlayer.y = 20;
  const closeEvents = plateRuntime.update(1 / 60);
  assert.ok(eventTypes(closeEvents).includes("plate.released"));
  assert.ok(eventTypes(closeEvents).includes("door.closed"));
  assert.equal(gate.collider.enabled, true);
});

test("down+jump disables only the exact supported one-way platform", () => {
  const first = bundle("one-way-platform", "upper", 160, 400, { dropThroughTicks: 10, dropNudge: 4 });
  const second = bundle("one-way-platform", "other", 420, 400, { dropThroughTicks: 10, dropNudge: 4 });
  const runtime = createRuntimeModel(runtimeProject([player(120, 348), ...first, ...second]));
  runtime.update(1 / 60);
  assert.equal(runtime.getState().player.groundObjectId, first[0].id);
  runtime.setInput("down", true);
  runtime.setInput("jump", true);
  const events = runtime.update(1 / 60);
  assert.ok(eventTypes(events).includes("one-way.dropped"));
  const upper = runtime.getObjects().find((object) => object.id === first[0].id);
  const other = runtime.getObjects().find((object) => object.id === second[0].id);
  assert.ok(upper.dropThroughTicks > 0);
  assert.equal(Number(other.dropThroughTicks || 0), 0);
  assert.equal(runtime.getState().player.grounded, false);
});
