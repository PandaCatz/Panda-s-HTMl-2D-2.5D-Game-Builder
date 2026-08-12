import test from "node:test";
import assert from "node:assert/strict";

import { applyAgentCommand, buildStandaloneHtml, createTemplate, getAgentManifest, validateProject } from "../lib/looplab-agent-core.mjs";
import { runAcceptanceSuite } from "../lib/looplab-acceptance.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { inspectGameplayProgram, LOOPLAB_GAMEPLAY_RULE_POLICY, LOOPLAB_RUNTIME_OBJECT_CHANGE_KEYS, normalizeGameplayProgram } from "../lib/looplab-gameplay-rules.mjs";
import { captureReplayState, runReplayCase, runReplaySuite } from "../lib/looplab-replay.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";

function gameplayFixture() {
  const project = createTemplate("dimetric");
  for (const object of project.maps[0].objects) object.requiresSupport = false;
  project.objects = structuredClone(project.maps[0].objects);
  project.traversalPaths.find((path) => path.id === "raised-passage-route").enabled = false;
  project.maps[0].traversalPaths = structuredClone(project.traversalPaths);
  project.qualityContracts = { ...(project.qualityContracts ?? {}), gameplayProgramRequired: true };
  project.gameplayProgram = normalizeGameplayProgram({
    version: 1,
    variables: [
      { id: "resonance", label: "Resonance", type: "number", initial: 0, min: 0, max: 3, visible: true },
      { id: "gate-open", label: "Gate", type: "boolean", initial: false, visible: true },
    ],
    rules: [
      {
        id: "gain-resonance",
        name: "Gain resonance",
        enabled: true,
        trigger: { type: "event", event: "coin.collected", objectId: "route-token-a", mapId: "map-main" },
        conditions: [],
        once: "run",
        effects: [{ type: "add-variable", variableId: "resonance", value: 1 }],
      },
      {
        id: "open-raised-route",
        name: "Open raised route",
        enabled: true,
        trigger: { type: "state", mapId: "map-main" },
        conditions: [{ variableId: "resonance", operator: "gte", value: 1 }],
        once: "run",
        effects: [
          { type: "set-variable", variableId: "gate-open", value: true },
          { type: "set-path", pathId: "raised-passage-route", mapId: "map-main", changes: { enabled: true } },
          { type: "win" },
        ],
      },
      {
        id: "hide-marker-on-input",
        name: "Hide marker on input",
        enabled: true,
        trigger: { type: "input", actionId: "interact", mapId: "map-main" },
        conditions: [],
        once: "run",
        effects: [{ type: "set-object", objectId: "route-token-b", mapId: "map-main", changes: { hidden: true, runtimeState: "phased" } }],
      },
    ],
  });
  return project;
}

function systemsGameFixture() {
  return createTemplate("systems");
}

test("gameplay programs validate stable variables, triggers, runtime targets, and bounded effects", () => {
  const project = gameplayFixture();
  const inspection = inspectGameplayProgram(project);
  assert.equal(inspection.present, true);
  assert.deepEqual(inspection.errors, []);
  assert.equal(inspection.metrics.variableCount, 2);
  assert.equal(inspection.metrics.executableRuleCount, 3);

  const unsafe = structuredClone(project.gameplayProgram);
  unsafe.rules.push({
    id: "loop-event",
    name: "Loop event",
    enabled: true,
    trigger: { type: "event", event: "loop.forever" },
    conditions: [],
    once: "never",
    effects: [{ type: "emit", event: "loop.forever" }],
  });
  assert.match(inspectGameplayProgram(project, unsafe).errors.join(" "), /unbounded direct event loop/);
});

test("deterministic preview runtime executes input, event, state, object, path, and win effects", () => {
  const project = gameplayFixture();
  const runtime = createRuntimeModel(project);
  runtime.drainEvents();
  assert.equal(runtime.getTraversalPaths().find((path) => path.id === "raised-passage-route").enabled, false);

  runtime.setInput("interact", true);
  let events = runtime.update(1 / 60);
  runtime.setInput("interact", false);
  assert.equal(runtime.getObjects().find((object) => object.id === "route-token-b").hidden, true);
  assert.ok(events.some((event) => event.type === "gameplay.rule-fired" && event.ruleId === "hide-marker-on-input"));

  const player = runtime.getObjects().find((object) => object.kind === "player");
  const token = runtime.getObjects().find((object) => object.id === "route-token-a");
  player.x = token.x;
  player.y = token.y;
  player.z = token.z || 0;
  player.collider.zMin = token.collider.zMin;
  player.collider.zMax = token.collider.zMax;
  events = runtime.update(1 / 60);
  assert.equal(runtime.getState().variables.resonance, 1);
  assert.ok(events.some((event) => event.type === "gameplay.rule-fired" && event.ruleId === "gain-resonance"));

  events = runtime.update(1 / 60);
  assert.equal(runtime.getState().variables["gate-open"], true);
  assert.equal(runtime.getState().won, true);
  assert.equal(runtime.getTraversalPaths().find((path) => path.id === "raised-passage-route").enabled, true);
  assert.ok(events.some((event) => event.type === "goal.reached"));
});

test("set-object preserves bounded scalar gameplay state without permitting authored geometry mutation", () => {
  const project = gameplayFixture();
  const program = structuredClone(project.gameplayProgram);
  program.rules[2].effects[0].changes = {
    hidden: true,
    hp: 3,
    motionX: -2,
    pathId: "route.fen.wallwalkHigh",
    pinTicks: 120,
    threaded: true,
    x: 999,
    width: 999,
    assetId: "replacement-art",
    collider: { enabled: false },
    constructor: "unsafe",
    targetId: { nested: "not-scalar" },
  };
  project.gameplayProgram = normalizeGameplayProgram(program);
  const changes = project.gameplayProgram.rules[2].effects[0].changes;
  assert.deepEqual(changes, {
    hidden: true,
    hp: 3,
    motionX: -2,
    pathId: "route.fen.wallwalkHigh",
    pinTicks: 120,
    threaded: true,
  });
  assert.ok(LOOPLAB_RUNTIME_OBJECT_CHANGE_KEYS.includes("hp"));
  assert.equal(LOOPLAB_RUNTIME_OBJECT_CHANGE_KEYS.includes("x"), false);
  assert.deepEqual(inspectGameplayProgram(project).errors, []);

  const runtime = createRuntimeModel(project);
  const before = runtime.getObjects().find((object) => object.id === "route-token-b");
  const authoredX = before.x;
  const authoredWidth = before.width;
  runtime.setInput("interact", true);
  runtime.update(1 / 60);
  const after = runtime.getObjects().find((object) => object.id === "route-token-b");
  assert.equal(after.hp, 3);
  assert.equal(after.motionX, -2);
  assert.equal(after.pathId, "route.fen.wallwalkHigh");
  assert.equal(after.pinTicks, 120);
  assert.equal(after.threaded, true);
  assert.equal(after.x, authoredX);
  assert.equal(after.width, authoredWidth);
  assert.notEqual(after.assetId, "replacement-art");
  assert.deepEqual(captureReplayState(runtime).objects.find((object) => object.id === "route-token-b").runtimeObjectState, {
    hp: 3,
    motionX: -2,
    pathId: "route.fen.wallwalkHigh",
    pinTicks: 120,
    threaded: true,
  });
});

test("state triggers honor symbolic predicates instead of firing every simulation tick", () => {
  const project = gameplayFixture();
  project.gameplayProgram.variables.push({ id: "player.hp", label: "HP", type: "number", initial: 4, min: 0, max: 4, visible: true });
  project.gameplayProgram.rules.push({
    id: "respawn-at-zero",
    name: "Respawn at zero",
    enabled: true,
    trigger: { type: "state", variableId: "player.hp", operator: "<=", value: 0, mapId: "map-main" },
    conditions: [],
    once: "never",
    effects: [{ type: "respawn" }],
  });
  project.gameplayProgram = normalizeGameplayProgram(project.gameplayProgram);
  assert.equal(project.gameplayProgram.rules.at(-1).trigger.operator, "lte");
  assert.deepEqual(inspectGameplayProgram(project).errors, []);

  const runtime = createRuntimeModel(project);
  const player = runtime.getObjects().find((object) => object.kind === "player");
  const startX = player.x;
  runtime.setInput("right", true);
  runtime.update(1 / 60);
  runtime.setInput("right", false);
  assert.ok(player.x > startX);
  assert.ok(player.vx > 0);
  assert.equal(runtime.drainEvents().some((event) => event.type === "player.respawned"), false);
});

test("input phases and overlap edges reproduce held, released, enter, stay, and exit deterministically", () => {
  const project = gameplayFixture();
  const map = project.maps[0];
  const authoredPlayer = map.objects.find((object) => object.kind === "player");
  const triggerZone = {
    id: "phase-trigger-zone",
    name: "Phase trigger zone",
    kind: "decor",
    x: Number(authoredPlayer.x || 0) + Number(authoredPlayer.collider?.offsetX || 0),
    y: Number(authoredPlayer.y || 0) + Number(authoredPlayer.collider?.offsetY || 0),
    z: Number(authoredPlayer.z || 0),
    width: 1,
    height: Math.max(1, Number(authoredPlayer.collider?.height ?? authoredPlayer.height ?? 1)),
    color: "#555555",
    solid: false,
    hidden: false,
    requiresSupport: false,
    anchorMode: "ground",
    collisionOwner: "authored-map",
    collider: {
      enabled: true,
      offsetX: 0,
      offsetY: 0,
      width: 1,
      height: Math.max(1, Number(authoredPlayer.collider?.height ?? authoredPlayer.height ?? 1)),
      trigger: true,
      oneWay: false,
      zMin: Number(authoredPlayer.collider?.zMin ?? authoredPlayer.z ?? 0),
      zMax: Number(authoredPlayer.collider?.zMax ?? Number(authoredPlayer.z || 0) + 1),
    },
  };
  map.objects.push(triggerZone);
  project.objects = structuredClone(map.objects);
  const counter = (id) => ({ id, label: id, type: "number", initial: 0, min: 0, max: 100, visible: false });
  const incrementRule = (id, trigger, variableId) => ({
    id,
    name: id,
    enabled: true,
    trigger: { ...trigger, mapId: map.id },
    conditions: [],
    once: "never",
    effects: [{ type: "add-variable", variableId, value: 1 }],
  });
  project.gameplayProgram = normalizeGameplayProgram({
    version: 1,
    variables: ["pressed-count", "held-count", "released-count", "enter-count", "stay-count", "exit-count"].map(counter),
    rules: [
      incrementRule("action-pressed", { type: "input", actionId: "interact", phase: "pressed" }, "pressed-count"),
      incrementRule("action-held", { type: "input", actionId: "interact", phase: "held" }, "held-count"),
      incrementRule("action-released", { type: "input", actionId: "interact", phase: "released" }, "released-count"),
      incrementRule("zone-enter", { type: "overlap", objectId: triggerZone.id, edge: "enter" }, "enter-count"),
      incrementRule("zone-stay", { type: "overlap", objectId: triggerZone.id, edge: "stay" }, "stay-count"),
      incrementRule("zone-exit", { type: "overlap", objectId: triggerZone.id, edge: "exit" }, "exit-count"),
    ],
  });
  assert.deepEqual(inspectGameplayProgram(project).errors, []);
  assert.deepEqual(LOOPLAB_GAMEPLAY_RULE_POLICY.inputPhases, ["pressed", "held", "released"]);
  assert.deepEqual(LOOPLAB_GAMEPLAY_RULE_POLICY.overlapEdges, ["enter", "stay", "exit"]);

  const runtime = createRuntimeModel(project);
  const player = runtime.getObjects().find((object) => object.kind === "player");
  player.x = triggerZone.x + 100;
  runtime.drainEvents();
  const fired = (events) => events.filter((event) => event.type === "gameplay.rule-fired").map((event) => event.ruleId);

  runtime.setInput("interact", true);
  assert.deepEqual(fired(runtime.update(1 / 60)), ["action-pressed", "action-held"]);
  assert.deepEqual(fired(runtime.update(1 / 60)), ["action-held"]);
  runtime.setInput("interact", false);
  assert.deepEqual(fired(runtime.update(1 / 60)), ["action-released"]);
  assert.deepEqual(fired(runtime.update(1 / 60)), []);
  assert.deepEqual(runtime.getState().variables, {
    "enter-count": 0,
    "exit-count": 0,
    "held-count": 2,
    "pressed-count": 1,
    "released-count": 1,
    "stay-count": 0,
  });

  const placeOnZone = () => {
    player.x = triggerZone.x - Number(player.collider?.offsetX || 0);
    player.y = triggerZone.y - Number(player.collider?.offsetY || 0);
    player.z = triggerZone.z;
    player.vx = 0;
    player.vy = 0;
    player.collider.zMin = triggerZone.collider.zMin;
    player.collider.zMax = triggerZone.collider.zMax;
  };
  placeOnZone();
  assert.deepEqual(fired(runtime.update(1 / 60)), ["zone-enter", "zone-stay"]);
  assert.equal(captureReplayState(runtime).deterministicState.overlapContactIds.length, 3);
  placeOnZone();
  assert.deepEqual(fired(runtime.update(1 / 60)), ["zone-stay"]);
  player.x = triggerZone.x + 100;
  assert.deepEqual(fired(runtime.update(1 / 60)), ["zone-exit"]);
  assert.deepEqual(captureReplayState(runtime).deterministicState.overlapContactIds, []);
  assert.deepEqual(runtime.getState().variables, {
    "enter-count": 1,
    "exit-count": 1,
    "held-count": 2,
    "pressed-count": 1,
    "released-count": 1,
    "stay-count": 2,
  });

  const replayCase = {
    id: "phase-and-overlap-regression",
    tickCount: 40,
    inputs: [
      { tick: 0, action: "interact", pressed: true },
      { tick: 2, action: "interact", pressed: false },
      { tick: 4, action: "move-right", pressed: true },
      { tick: 20, action: "move-right", pressed: false },
    ],
  };
  const firstReplay = runReplayCase(project, replayCase);
  const secondReplay = runReplayCase(project, replayCase);
  assert.equal(firstReplay.finalHash, secondReplay.finalHash);
  assert.deepEqual(firstReplay.emittedEventCounts, secondReplay.emittedEventCounts);
  assert.ok(firstReplay.emittedEventCounts["gameplay.rule-fired"] >= 7);
});

test("headless commands, Doctor, replay hashes, manifest, and one-file export share gameplay truth", () => {
  const base = createTemplate("dimetric");
  base.qualityContracts = { ...(base.qualityContracts ?? {}), gameplayProgramRequired: true };
  let report = analyzeProject(base, { profile: "production" });
  assert.equal(report.issues.some((issue) => issue.code === "gameplay-program-missing"), true);

  const fixture = gameplayFixture();
  const authored = applyAgentCommand({ ...fixture, gameplayProgram: undefined }, { op: "set_gameplay_program", program: fixture.gameplayProgram });
  const inspected = applyAgentCommand(authored.project, { op: "get_gameplay_program" });
  assert.equal(inspected.result.metrics.ruleCount, 3);

  const runtime = createRuntimeModel(fixture);
  const snapshot = captureReplayState(runtime);
  assert.deepEqual(snapshot.variables, { "gate-open": false, resonance: 0 });
  assert.ok(Array.isArray(snapshot.paths));

  const html = buildStandaloneHtml(fixture);
  assert.match(html, /getGameplayState/);
  assert.match(html, /get_gameplay_state/);
  assert.match(html, /version:'2\.27\.0'/);

  const manifest = getAgentManifest();
  assert.equal(manifest.protocolVersion, "1.99.0");
  assert.equal(manifest.exportedRuntime.version, "2.27.0");
  assert.deepEqual(manifest.gameplayRules.policy, LOOPLAB_GAMEPLAY_RULE_POLICY);
  assert.equal(manifest.commands.includes("set_gameplay_program"), true);
});

test("genre-neutral choice pages, clocks, integer formulas, HUD bindings, and playerless simulation share deterministic truth", () => {
  const project = systemsGameFixture();
  assert.equal(project.templateProvenance.id, "systems");
  assert.deepEqual(validateProject(project).warnings.filter((warning) => /no player|no spawn/.test(warning)), []);
  assert.equal(analyzeProject(project).issues.some((issue) => issue.code === "gameplay-program-empty"), false);
  const playerlessPlatformer = createTemplate("platformer");
  playerlessPlatformer.objects = playerlessPlatformer.objects.filter((object) => !["player", "spawn"].includes(object.kind));
  playerlessPlatformer.maps[0].objects = playerlessPlatformer.maps[0].objects.filter((object) => !["player", "spawn"].includes(object.kind));
  assert.match(validateProject(playerlessPlatformer).warnings.join(" "), /has no player/);
  const inspection = inspectGameplayProgram(project);
  assert.deepEqual(inspection.errors, []);
  assert.equal(inspection.metrics.choicePageCount, 2);
  assert.equal(inspection.metrics.choiceCount, 3);
  assert.equal(inspection.metrics.clockCount, 1);
  assert.equal(inspection.metrics.hudBindingCount, 1);

  const runtime = createRuntimeModel(project);
  assert.equal(runtime.getState().player, null);
  assert.equal(runtime.getState().activeChoicePageId, "market-offer");
  assert.equal(runtime.getChoiceState().title, "Day 1: glass market");
  assert.deepEqual(runtime.getHudState(), [{ id: "market-ledger", text: "Day 1 · 10 credits · 2 cargo", ariaLabel: "Market day 1, 10 credits, 2 cargo", region: "primary" }]);

  assert.equal(runtime.chooseChoice("buy-lanterns"), true);
  const firstEvents = runtime.update(1 / 60);
  assert.deepEqual(runtime.getState().variables, { cargo: 3, credits: 6, day: 2 });
  assert.equal(runtime.getState().activeChoicePageId, "market-receipt");
  assert.equal(runtime.getChoiceState().body, "Day 2. Balance 6. Cargo 3.");
  assert.ok(firstEvents.some((event) => event.type === "choice.selected" && event.choiceId === "buy-lanterns"));
  assert.ok(firstEvents.some((event) => event.type === "clock.advanced" && event.value === 2));

  assert.equal(runtime.chooseChoice("close-ledger"), true);
  runtime.update(1 / 60);
  assert.equal(runtime.getChoiceState(), null);

  const replayCase = {
    id: "market-choice-route",
    hashVersion: 4,
    tickCount: 4,
    inputs: [
      { tick: 0, action: "choice-1", pressed: true },
      { tick: 1, action: "choice-1", pressed: false },
      { tick: 2, action: "choice-1", pressed: true },
      { tick: 3, action: "choice-1", pressed: false },
    ],
  };
  const firstReplay = runReplayCase(project, replayCase);
  const secondReplay = runReplayCase(project, replayCase);
  assert.equal(firstReplay.finalHash, secondReplay.finalHash);
  assert.equal(firstReplay.hashVersion, 4);
  assert.ok(firstReplay.emittedEventCounts["choice.selected"] >= 2);

  const acceptance = runAcceptanceSuite(project);
  assert.equal(acceptance.status, "passed");
  assert.equal(acceptance.tests[0].assertions.length, 5);
  assert.equal(runReplaySuite(project).status, "passed");

  const legacyProjection = captureReplayState(createRuntimeModel(project), { hashVersion: 3 });
  assert.deepEqual(Object.keys(legacyProjection.deterministicState).sort(), ["activeActionIds", "activeInputCodes", "overlapContactIds"]);
  const systemsProjection = captureReplayState(createRuntimeModel(project), { hashVersion: 4 });
  assert.equal(systemsProjection.deterministicState.activeChoicePageId, "market-offer");

  const html = buildStandaloneHtml(project);
  assert.match(html, /id="choice-layer"/);
  assert.match(html, /getChoiceState/);
  assert.match(html, /get_hud_state/);
  assert.match(html, /choose_choice/);
  assert.match(html, /version:'2\.27\.0'/);

  const manifest = getAgentManifest();
  assert.equal(manifest.templates.includes("systems"), true);
});

test("systems-game validation rejects executable formula strings and unresolved semantic references", () => {
  const project = systemsGameFixture();
  const unsafe = structuredClone(project.gameplayProgram);
  unsafe.choicePages[0].choices[0].effects[0].expression = "credits - 4";
  unsafe.choicePages[0].choices[0].actionId = "missing-choice-action";
  unsafe.choicePages[0].choices[1].effects.push({
    type: "set-variable-expression",
    variableId: "credits",
    expression: { operator: "add", operands: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  });
  unsafe.clocks[0].variableId = "missing-day";
  const errors = inspectGameplayProgram(project, unsafe).errors.join(" ");
  assert.match(errors, /bounded expression node/);
  assert.match(errors, /wrong arity for add/);
  assert.match(errors, /declared semantic input action/);
  assert.match(errors, /missing variable missing-day/);
});
