import assert from "node:assert/strict";
import test from "node:test";

import { applyAgentCommand, buildStandaloneHtml, createTemplate, getAgentManifest, validateProject } from "../lib/looplab-agent-core.mjs";
import { runAcceptanceSuite } from "../lib/looplab-acceptance.mjs";
import { inspectCombatProgram, LOOPLAB_COMBAT_PROGRAM_SCHEMA } from "../lib/looplab-combat.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import {
  captureReplayState,
  LOOPLAB_REPLAY_COMBAT_HASH_VERSION,
  LOOPLAB_REPLAY_MOTION_HASH_VERSION,
  LOOPLAB_REPLAY_SHA256_HASH_VERSION,
  replayStateDigest,
} from "../lib/looplab-replay.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";

const clone = (value) => structuredClone(value);

function combatProgram(overrides = {}) {
  return {
    schemaVersion: LOOPLAB_COMBAT_PROGRAM_SCHEMA,
    enabled: true,
    maxProjectiles: 4,
    teams: [
      { id: "enemy", targetTeamIds: ["player"] },
      { id: "player", targetTeamIds: ["enemy"] },
    ],
    actors: [
      { id: "actor-player", mapId: "map-main", objectId: "player", teamId: "player", maxHp: 100, initialHp: 100, invulnerabilityTicks: 0, deathBehavior: "respawn" },
      { id: "actor-target", mapId: "map-main", objectId: "target", teamId: "enemy", maxHp: 10, initialHp: 10, invulnerabilityTicks: 0, deathBehavior: "hide" },
    ],
    emitters: [{
      id: "player-shot",
      mapId: "map-main",
      ownerObjectId: "player",
      teamId: "player",
      trigger: "pressed",
      actionId: "fire",
      cooldownTicks: 1,
      poolSize: 2,
      muzzle: { offsetX: 0, offsetY: 0, distance: 0 },
      aim: { mode: "fixed", x: 1, y: 0, range: 1024 },
      projectile: { speed: 8192, width: 4, height: 4, zHeight: 1, lifetimeTicks: 120, damage: 4, pierce: 0, worldCollision: true, color: "#f4f4f0", opacity: 1 },
    }],
    acceptanceTestIds: ["combat-hit"],
    ...overrides,
  };
}

function combatProject(options = {}) {
  const project = createTemplate("topdown");
  project.inputActions.push({ id: "fire", label: "Fire", bindings: ["KeyF"], animationState: "attack", onboarding: true, replayEvent: true });
  const target = {
    id: "target",
    name: "Thin target",
    kind: "decor",
    x: 580,
    y: 248,
    z: 0,
    supportZ: 0,
    width: 4,
    height: 24,
    color: "#55555c",
    opacity: 1,
    solid: false,
    hidden: false,
    anchorMode: "ground",
    collisionOwner: "authored-map",
    groundAnchor: { offsetX: 2, offsetY: 24 },
    collider: { enabled: true, offsetX: 0, offsetY: 0, width: 4, height: 24, trigger: true, oneWay: false, zMin: 0, zMax: 1 },
  };
  project.objects = [...project.objects, target];
  project.replay = { ...project.replay, cases: [] };
  project.combatProgram = combatProgram(options.program);
  project.acceptanceTests = [{
    id: "combat-hit",
    name: "Fast projectile hits thin target",
    ownerId: "target",
    assertion: "A fixed-tick fast projectile uses swept authored collision and reduces target health exactly once.",
    runner: "looplab-deterministic-runtime",
    driver: { tickRate: 60, tickCount: 2, inputs: [{ tick: 0, action: "fire", pressed: true }, { tick: 1, action: "fire", pressed: false }] },
    assertions: [
      { id: "target-hp", target: "combat-health", targetId: "actor-target", property: "hp", operator: "equals", expected: 6, atTick: 1 },
      { id: "hit-event", target: "event-emitted", targetId: "projectile.hit", operator: "equals", expected: 1, atTick: 1 },
      { id: "shot-count", target: "combat-emitter", targetId: "player-shot", property: "shotsFired", operator: "equals", expected: 1, atTick: 1 },
      { id: "active-shots", target: "combat-state", property: "activeProjectileCount", operator: "equals", expected: 0, atTick: 1 },
    ],
  }];
  project.maps[0].objects = clone(project.objects);
  return project;
}

test("combat inspection rejects unknown fields, unsafe bounds, and missing authored references", () => {
  const project = combatProject();
  assert.equal(inspectCombatProgram(project).valid, true);

  project.combatProgram.emitters[0].projectile.speed = "8192";
  project.combatProgram.emitters[0].inventedGeometry = true;
  project.combatProgram.actors[1].objectId = "missing-target";
  const report = inspectCombatProgram(project);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === "combat-emitter-unknown-field"));
  assert.ok(report.issues.some((issue) => issue.code === "combat-projectile-speed"));
  assert.ok(report.issues.some((issue) => issue.code === "combat-actor-object"));
});

test("swept authored collision catches a thin target crossed inside one tick and applies integer damage once", () => {
  const runtime = createRuntimeModel(combatProject());
  runtime.setInput("fire", true);
  const events = runtime.update(1 / 60);
  const target = runtime.getCombatState().health.find((entry) => entry.actorId === "actor-target");
  assert.equal(target.hp, 6);
  assert.equal(events.filter((event) => event.type === "projectile.hit").length, 1);
  assert.equal(events.filter((event) => event.type === "health.changed").length, 1);
  assert.equal(events.find((event) => event.type === "projectile.hit").damageApplied, 4);
  assert.equal(runtime.getCombatState().activeProjectileCount, 0);
});

test("nearest targeting resolves equal-distance candidates by stable actor ID, independent of object order", () => {
  const project = combatProject();
  const sourceTarget = project.objects.find((object) => object.id === "target");
  const targetA = { ...clone(sourceTarget), id: "target-a", x: 570, y: 210 };
  const targetB = { ...clone(sourceTarget), id: "target-b", x: 570, y: 287 };
  project.objects = project.objects.filter((object) => object.id !== "target");
  project.objects.push(targetB, targetA);
  project.combatProgram.actors = project.combatProgram.actors.filter((actor) => actor.id !== "actor-target");
  project.combatProgram.actors.push(
    { id: "actor-b", mapId: "map-main", objectId: "target-b", teamId: "enemy", maxHp: 10, initialHp: 10, invulnerabilityTicks: 0, deathBehavior: "event-only" },
    { id: "actor-a", mapId: "map-main", objectId: "target-a", teamId: "enemy", maxHp: 10, initialHp: 10, invulnerabilityTicks: 0, deathBehavior: "event-only" },
  );
  project.combatProgram.emitters[0].aim = { mode: "nearest", x: 1, y: 0, range: 1024 };
  project.maps[0].objects = clone(project.objects);
  const runtime = createRuntimeModel(project);
  runtime.setInput("fire", true);
  runtime.update(1 / 60);
  assert.equal(runtime.getCombatState().emitters[0].lastTargetActorId, "actor-a");
});

test("bounded projectile pools emit deterministic overflow without growing", () => {
  const project = combatProject();
  const emitter = project.combatProgram.emitters[0];
  emitter.trigger = "held";
  emitter.poolSize = 1;
  emitter.projectile.speed = 1;
  emitter.projectile.lifetimeTicks = 120;
  emitter.projectile.worldCollision = false;
  project.combatProgram.maxProjectiles = 1;
  const runtime = createRuntimeModel(project);
  runtime.setInput("fire", true);
  const first = runtime.update(1 / 60);
  const second = runtime.update(1 / 60);
  assert.equal(first.filter((event) => event.type === "projectile.spawned").length, 1);
  assert.equal(second.filter((event) => event.type === "projectile.overflow").length, 1);
  const state = runtime.getCombatState();
  assert.equal(state.poolCapacity, 1);
  assert.equal(state.activeProjectileCount, 1);
  assert.equal(state.emitters[0].overflowCount, 1);
});

test("combat save v3 round-trips health, projectile pool, cooldown, and sequence while older projects keep v1", () => {
  const plain = createRuntimeModel(createTemplate("topdown"));
  assert.equal(plain.exportSaveState().version, 1);

  const project = combatProject();
  project.combatProgram.emitters[0].projectile.speed = 1;
  project.combatProgram.emitters[0].projectile.worldCollision = false;
  const runtime = createRuntimeModel(project);
  runtime.setInput("fire", true);
  runtime.update(1 / 60);
  const before = runtime.getCombatState();
  const saved = runtime.exportSaveState();
  assert.equal(saved.schemaVersion, "looplab-runtime-save-state/v3");
  assert.equal(saved.version, 3);
  assert.equal(runtime.validateSaveState(saved).valid, true);
  runtime.reset();
  assert.equal(runtime.restoreSaveState(saved).ok, true);
  assert.deepEqual(runtime.getCombatState(), before);
});

test("replay v6 stays frozen while v7 adds deterministic combat state", () => {
  const runtime = createRuntimeModel(combatProject());
  runtime.setInput("fire", true);
  runtime.update(1 / 60);
  const v5 = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_MOTION_HASH_VERSION });
  const v6 = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_SHA256_HASH_VERSION });
  const v7 = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_COMBAT_HASH_VERSION });
  assert.deepEqual(v6, v5, "v6 keeps the frozen v5 state projection and changes only the digest algorithm");
  assert.equal(Object.hasOwn(v6, "combat"), false);
  assert.equal(v7.combat.activeProjectileCount, 0);
  assert.equal(v7.combat.health.find((entry) => entry.actorId === "actor-target").hp, 6);
  assert.match(replayStateDigest(v6, { hashVersion: LOOPLAB_REPLAY_SHA256_HASH_VERSION }), /^replay-sha256-[0-9a-f]{64}$/);
  assert.match(replayStateDigest(v7, { hashVersion: LOOPLAB_REPLAY_COMBAT_HASH_VERSION }), /^replay-sha256-[0-9a-f]{64}$/);
});

test("acceptance, headless commands, Doctor, manifest, and one-file export expose the same combat truth", () => {
  const project = combatProject();
  const acceptance = runAcceptanceSuite(project);
  assert.equal(acceptance.status, "passed");
  assert.equal(acceptance.tests[0].assertions.length, 4);
  assert.equal(validateProject(project).valid, true);

  const removedSource = clone(project);
  delete removedSource.combatProgram;
  const set = applyAgentCommand(removedSource, { op: "set_combat_program", program: project.combatProgram });
  assert.equal(set.changed, true);
  assert.equal(set.result.report.valid, true);
  assert.equal(applyAgentCommand(set.project, { op: "get_combat_report", profile: "production" }).result.emitterCount, 1);
  assert.equal(analyzeProject(project, { profile: "production" }).combatReport.valid, true);

  const starterSource = createTemplate("topdown");
  const starter = applyAgentCommand(starterSource, { op: "suggest_combat_program", mapId: starterSource.maps[0].id });
  assert.equal(starter.changed, false);
  assert.equal(starter.result.provider, "none");
  assert.equal(starter.result.available, true);
  assert.equal(starter.result.report.valid, true);
  assert.equal(starter.result.program.emitters[0].actionId, "interact");

  const manifest = getAgentManifest();
  assert.ok(manifest.commands.includes("suggest_combat_program"));
  assert.ok(manifest.commands.includes("set_combat_program"));
  assert.ok(manifest.commands.includes("get_combat_report"));
  assert.ok(manifest.exportedRuntime.methods.includes("getCombatState"));
  assert.ok(manifest.exportedRuntime.commands.includes("get_combat_state"));
  assert.equal(manifest.deterministicCombat.schemaVersion, LOOPLAB_COMBAT_PROGRAM_SCHEMA);

  const html = buildStandaloneHtml(project);
  assert.match(html, /getCombatState/);
  assert.match(html, /get_combat_state/);
  assert.match(html, /projectile\.overflow/);
  assert.match(html, /looplab-runtime-save-state\/v3/);

  const removed = applyAgentCommand(set.project, { op: "remove_combat_program" });
  assert.equal(removed.changed, true);
  assert.equal(removed.result.removed.schemaVersion, LOOPLAB_COMBAT_PROGRAM_SCHEMA);
});
