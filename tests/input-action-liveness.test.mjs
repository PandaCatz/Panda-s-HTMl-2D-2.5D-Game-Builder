import assert from "node:assert/strict";
import test from "node:test";
import { createTemplate } from "../lib/looplab-agent-core.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { analyzeInputActionLiveness, LOOPLAB_INPUT_ACTION_LIVENESS_SCHEMA, resolveSemanticInputAction } from "../lib/looplab-input-liveness.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";

test("player controls and systems choices are classified by executable consumers", () => {
  const platformer = analyzeInputActionLiveness(createTemplate("platformer"));
  assert.equal(platformer.schemaVersion, LOOPLAB_INPUT_ACTION_LIVENESS_SCHEMA);
  assert.equal(platformer.passed, true);
  assert.equal(platformer.deadCount, 0);
  assert.ok(platformer.actions.every((action) => action.consumers.some((consumer) => consumer.type === "runtime-player-control")));

  const systems = analyzeInputActionLiveness(createTemplate("systems"));
  assert.equal(systems.passed, true);
  assert.equal(systems.deadCount, 0);
  assert.ok(systems.actions.every((action) => action.consumers.some((consumer) => consumer.type === "choice" || consumer.type === "gameplay-rule")));
});

test("intent metadata and disabled rules do not make a dead action executable", () => {
  const project = createTemplate("systems");
  project.inputActions.push({
    id: "future-scan",
    label: "Future scan",
    bindings: ["KeyF"],
    animationState: "scan",
    onboarding: true,
    replayEvent: true,
  });
  project.gameplayProgram.rules.push({
    id: "future-scan-disabled",
    enabled: false,
    trigger: { type: "input", actionId: "future-scan", phase: "pressed" },
    effects: [{ type: "emit-event", event: "scan.requested" }],
  });
  project.verbArchitecture = {
    version: 1,
    verbs: [{ id: "scan", label: "Scan", status: "supporting", inputActionIds: ["future-scan"] }],
  };

  const liveness = analyzeInputActionLiveness(project);
  const action = liveness.actions.find((candidate) => candidate.actionId === "future-scan");
  assert.equal(action.classification, "dead");
  assert.deepEqual(action.consumers, []);
  assert.ok(action.intentReferences.some((reference) => reference.type === "disabled-gameplay-rule"));
  assert.ok(action.intentReferences.some((reference) => reference.type === "verb-architecture"));

  const prototype = analyzeProject(project, { profile: "prototype" });
  const prototypeIssue = prototype.issues.find((issue) => issue.code === "input-action-dead" && issue.actionId === "future-scan");
  assert.equal(prototypeIssue?.severity, "warning");
  assert.deepEqual(prototypeIssue?.evidenceRequired, ["input-action-liveness", "browser-harness"]);
  assert.equal(prototype.inputActionLiveness.sourceDigest, prototype.sourceDigest);

  const production = analyzeProject(project, { profile: "production" });
  assert.equal(production.issues.find((issue) => issue.code === "input-action-dead" && issue.actionId === "future-scan")?.severity, "error");
});

test("an enabled input rule turns a custom playerless action live", () => {
  const project = createTemplate("systems");
  project.inputActions.push({ id: "scan", label: "Scan", bindings: ["KeyF"] });
  project.gameplayProgram.rules.push({
    id: "scan-rule",
    trigger: { type: "input", actionId: "scan", phase: "released" },
    effects: [{ type: "emit-event", event: "scan.completed" }],
  });

  const result = analyzeInputActionLiveness(project).actions.find((action) => action.actionId === "scan");
  assert.equal(result.classification, "live");
  assert.deepEqual(result.consumers, [{ type: "gameplay-rule", id: "scan-rule", phase: "released" }]);
});

test("an enabled combat emitter is an executable semantic-input consumer", () => {
  const project = createTemplate("topdown");
  project.inputActions.push({ id: "fire", label: "Fire", bindings: ["KeyF"] });
  project.combatProgram = {
    schemaVersion: "looplab-combat-program/v1",
    enabled: true,
    maxProjectiles: 8,
    teams: [{ id: "player-team", targetTeamIds: ["enemy-team"] }, { id: "enemy-team", targetTeamIds: ["player-team"] }],
    actors: [],
    emitters: [{
      id: "player-shot",
      mapId: project.maps[0].id,
      ownerObjectId: project.maps[0].objects.find((object) => object.kind === "player").id,
      teamId: "player-team",
      trigger: "pressed",
      actionId: "fire",
      cooldownTicks: 8,
      poolSize: 4,
      muzzle: { offsetX: 0, offsetY: 0, distance: 8 },
      aim: { mode: "movement", x: 1, y: 0, range: 500 },
      projectile: { speed: 500, width: 6, height: 6, zHeight: 1, lifetimeTicks: 60, damage: 1, pierce: 0, worldCollision: true },
    }],
    acceptanceTestIds: [],
  };

  const action = analyzeInputActionLiveness(project).actions.find((candidate) => candidate.actionId === "fire");
  assert.equal(action.classification, "live");
  assert.deepEqual(action.consumers, [{ type: "combat-emitter", id: "player-shot", mapId: project.maps[0].id, trigger: "pressed" }]);

  project.combatProgram.enabled = false;
  const disabled = analyzeInputActionLiveness(project).actions.find((candidate) => candidate.actionId === "fire");
  assert.equal(disabled.classification, "dead");
  assert.equal(disabled.intentReferences[0].type, "disabled-combat-emitter");
});

test("semantic player actions prefer any executable movement binding, not an inert first binding", () => {
  const action = { id: "stride-east", label: "Stride east", bindings: ["KeyL", "ArrowRight"] };
  assert.equal(resolveSemanticInputAction(action).resolvedCode, "ArrowRight");

  const project = createTemplate("platformer");
  project.inputActions = [action];
  const runtime = createRuntimeModel(project);
  const before = runtime.getState().player;
  runtime.setInput("stride-east", true);
  const events = runtime.update(1 / 60);
  const after = runtime.getState().player;
  assert.ok(after.vx > before.vx);
  assert.ok(events.some((event) => event.type === "input.action" && event.actionId === "stride-east"));
});

test("player-control liveness respects each map's control mode", () => {
  const topdown = createTemplate("topdown");
  const topdownReport = analyzeInputActionLiveness(topdown);
  assert.equal(topdownReport.passed, true);
  assert.deepEqual(topdownReport.actions.map((action) => action.actionId), ["move-left", "move-right", "move-up", "move-down", "interact"]);
  assert.ok(topdownReport.actions.find((action) => action.actionId === "move-up")?.consumers.some((consumer) => consumer.type === "runtime-player-control"));

  topdown.inputActions.push({ id: "jump", label: "Jump", bindings: ["Space"], animationState: "jump", onboarding: true, replayEvent: true });
  const jump = analyzeInputActionLiveness(topdown).actions.find((action) => action.actionId === "jump");
  assert.equal(jump.classification, "dead", "top-down movement ignores jump unless an authored gameplay rule consumes it");

  const platformer = createTemplate("platformer");
  platformer.inputActions.push({ id: "move-down", label: "Move down", bindings: ["ArrowDown"] });
  const down = analyzeInputActionLiveness(platformer).actions.find((action) => action.actionId === "move-down");
  assert.equal(down.classification, "dead", "platformer movement ignores down unless an authored gameplay rule consumes it");
});
