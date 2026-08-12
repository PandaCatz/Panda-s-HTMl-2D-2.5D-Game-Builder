import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TextEncoder } from "node:util";
import { runInNewContext } from "node:vm";
import { applyAgentCommand, buildStandaloneArtifact, buildStandaloneHtml, buildStandaloneRuntimePrelude, createTemplate, validateProject } from "../lib/looplab-agent-core.mjs";
import { runAcceptanceSuite } from "../lib/looplab-acceptance.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";
import { readGamepadInputCodes } from "../lib/looplab-gamepad.mjs";
import { canonicalReplaySerialize, LOOPLAB_REPLAY_HASH_VERSION, LOOPLAB_REPLAY_MOTION_HASH_VERSION, replayStateDigest, runReplaySuite } from "../lib/looplab-replay.mjs";
import { DEFAULT_DIMETRIC_PROJECTION } from "../lib/looplab-spatial.mjs";

function object(kind, id, changes = {}) {
  const presets = {
    player: { name: "Player", width: 10, height: 10, color: "#5b5cf0", solid: false, collider: { enabled: true, offsetX: 2, offsetY: 1, width: 6, height: 9, trigger: false, oneWay: false, zMin: 0, zMax: 1 } },
    platform: { name: "Solid", width: 10, height: 20, color: "#202018", solid: true, collider: { enabled: true, offsetX: 2, offsetY: 0, width: 10, height: 20, trigger: false, oneWay: false, zMin: 0, zMax: 1 } },
    spawn: { name: "Spawn", width: 20, height: 20, color: "#c8ff4d", solid: false, collider: { enabled: false, offsetX: 0, offsetY: 0, width: 20, height: 20, trigger: false, oneWay: false, zMin: 0, zMax: 1 } },
    portal: { name: "Portal", width: 10, height: 10, color: "#42cde3", solid: false, collider: { enabled: true, offsetX: 0, offsetY: 0, width: 10, height: 10, trigger: true, oneWay: false, zMin: 0, zMax: 1 } },
    decor: { name: "Decor", width: 10, height: 10, color: "#96e6d2", solid: false, collider: { enabled: false, offsetX: 0, offsetY: 0, width: 10, height: 10, trigger: false, oneWay: false, zMin: 0, zMax: 1 } },
  };
  return { id, kind, x: 0, y: 0, z: 0, supportZ: 0, anchorMode: "ground", collisionOwner: "authored-map", ...presets[kind], ...changes };
}

function map(id, objects, changes = {}) {
  return { id, name: id === "map-a" ? "Atrium" : "Roof", width: 200, height: 120, background: "#e8e0ca", gravity: 0, grid: 10, controlMode: "topdown", objects, ...changes };
}

function linkedProject() {
  const mapAObjects = [
    object("player", "player-a", { x: 10, y: 10 }),
    object("spawn", "spawn-a", { x: 0, y: 0 }),
    object("portal", "portal-a", { x: 10, y: 10, targetMapId: "map-b", targetSpawnId: "spawn-b", transition: "fade", runtimeJoin: { version: 1, enabled: true, mode: "portal", sourceEdge: "right", targetEdge: "left", overlapPixels: 0, sampleDepth: 8, minimumUniquePixelRatio: 0.01, maximumBoundaryColorDelta: 1, requireExactSpawn: true, requireClearLanding: true } }),
    object("decor", "sliced-sign", { x: 50, y: 20, depthLayer: 0, depthSlices: [{ id: "back", sourceY: 0, height: 5, depthBias: -20 }, { id: "front", sourceY: 5, height: 5, depthBias: 20 }] }),
  ];
  const mapBObjects = [
    object("player", "player-b", { x: 0, y: 0 }),
    object("spawn", "spawn-b", { x: 100, y: 80, z: 4, supportZ: 4, collider: { enabled: false, offsetX: 0, offsetY: 0, width: 20, height: 20, trigger: false, oneWay: false, zMin: 4, zMax: 5 } }),
    object("portal", "portal-b", { x: 105, y: 90, z: 4, supportZ: 4, targetMapId: "map-a", targetSpawnId: "spawn-a", transition: "slide", collider: { enabled: true, offsetX: 0, offsetY: 0, width: 10, height: 10, trigger: true, oneWay: false, zMin: 4, zMax: 5 } }),
  ];
  const maps = [map("map-a", mapAObjects), map("map-b", mapBObjects)];
  return { name: "Runtime Contract", width: 200, height: 120, background: "#e8e0ca", gravity: 0, grid: 10, controlMode: "topdown", objects: mapAObjects, assets: [], maps, activeMapId: "map-a" };
}

function executeStandaloneRuntime(html) {
  const projectText = html.match(/<script id="looplab-project-data" type="application\/json">([\s\S]*?)<\/script>/i)?.[1];
  const script = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/i)?.[1];
  assert.ok(projectText && script, "standalone artifact must expose project metadata and one runtime script");
  const project = JSON.parse(projectText);
  const context2d = new Proxy({}, {
    get(target, property) {
      if (!(property in target)) target[property] = () => undefined;
      return target[property];
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
  const elements = new Map();
  const element = (id) => {
    if (elements.has(id)) return elements.get(id);
    const value = {
      id,
      dataset: {},
      style: {},
      hidden: false,
      inert: false,
      disabled: false,
      value: "",
      textContent: id === "looplab-project-data" ? projectText : "",
      width: project.width,
      height: project.height,
      addEventListener() {},
      append() {},
      focus() {},
      removeAttribute(name) { delete this[name]; },
      setAttribute(name, next) { this[name] = String(next); },
      getContext() { return context2d; },
    };
    elements.set(id, value);
    return value;
  };
  class StubImage {
    constructor() {
      this.complete = false;
      this.naturalWidth = 0;
      this.src = "";
    }
  }
  class StubCustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      Object.assign(this, options);
    }
  }
  const sandbox = {
    console,
    document: {
      hidden: false,
      hasFocus: () => true,
      getElementById: element,
      createElement: (tagName) => ({ tagName: String(tagName).toUpperCase(), dataset: {}, style: {}, disabled: false, textContent: "", addEventListener() {}, append() {}, focus() {}, setAttribute(name, next) { this[name] = String(next); }, removeAttribute(name) { delete this[name]; } }),
      querySelectorAll: () => [],
      addEventListener() {},
      dispatchEvent() {},
    },
    navigator: { getGamepads: () => [] },
    performance: { now: () => 0 },
    requestAnimationFrame: () => 1,
    queueMicrotask: (callback) => callback(),
    addEventListener() {},
    Image: StubImage,
    CustomEvent: StubCustomEvent,
    TextEncoder,
  };
  sandbox.window = sandbox;
  runInNewContext(script, sandbox, { timeout: 5_000 });
  assert.ok(sandbox.window.looplabRuntime, "standalone runtime API must initialize in the artifact scope");
  return sandbox.window.looplabRuntime;
}

test("the exact exported dependency prelude remains import-free and covers every runtime branch in isolation", () => {
  const source = readFileSync(new URL("../lib/looplab-runtime-model.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/m, "the string-inlined runtime module must never gain imports");
  const prelude = buildStandaloneRuntimePrelude();
  const isolated = new Function(`"use strict"; ${prelude}\nreturn { DEFAULT_DIMETRIC_PROJECTION, normalizeProjection, worldToScreen, createRuntimeModel, readGamepadInputCodes };`)();
  assert.deepEqual(isolated.DEFAULT_DIMETRIC_PROJECTION, DEFAULT_DIMETRIC_PROJECTION);

  const isolatedRuntime = isolated.createRuntimeModel(linkedProject());
  assert.equal(isolatedRuntime.getState().activeMapId, "map-a");
  assert.doesNotThrow(() => isolatedRuntime.update(1 / 60));

  const platformerRuntime = isolated.createRuntimeModel(createTemplate("platformer"));
  platformerRuntime.setInput("right", true);
  platformerRuntime.setInput("jump", true);
  assert.doesNotThrow(() => platformerRuntime.update(1 / 60));

  const traversalProject = linkedProject();
  const path = { id: "test-path", name: "Test path", kind: "grind", points: [{ x: 10, y: 10, z: 0 }, { x: 110, y: 10, z: 0 }], entryRadius: 30, minimumEntrySpeed: 0, direction: "both", acceleration: 0, maximumSpeed: 200, exitImpulse: { x: 0, y: 0 }, bailBehavior: "drop", collisionOwner: "authored-map" };
  traversalProject.maps[0].traversalPaths = [path];
  traversalProject.traversalPaths = [path];
  const traversalRuntime = isolated.createRuntimeModel(traversalProject);
  traversalRuntime.setInput("interact", true);
  traversalRuntime.update(1 / 60);
  assert.equal(traversalRuntime.getState().activeTraversalPathId, "test-path");

  const dimetricProject = linkedProject();
  dimetricProject.projection = { ...DEFAULT_DIMETRIC_PROJECTION };
  dimetricProject.maps[0].projection = { ...DEFAULT_DIMETRIC_PROJECTION };
  const dimetricRuntime = isolated.createRuntimeModel(dimetricProject);
  assert.doesNotThrow(() => dimetricRuntime.renderEntries());
  assert.deepEqual(isolated.worldToScreen({ x: 0, y: 0, z: 0 }, isolated.DEFAULT_DIMETRIC_PROJECTION), { x: 480, y: 96 });

  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[0] = { pressed: true, value: 1 };
  assert.ok(isolated.readGamepadInputCodes([{ buttons, axes: [0, 0] }]).includes("GamepadButton0"));

  const html = buildStandaloneHtml(linkedProject());
  assert.ok(html.includes(prelude), "the export must embed the exact dependency prelude exercised by the isolation test");
  assert.ok(html.includes(`const createRuntimeModelFactory=${createRuntimeModel.toString()};`), "the export must embed the audited factory literally");
  assert.ok(html.includes("const createRuntimeModel=(project)=>createRuntimeModelFactory(project,{compileTileRuntimeProgram});"), "the export must inject the audited tile compiler into the runtime factory");
});

test("the built artifact replay and acceptance runners stay identical to the canonical Node runners", () => {
  let project = linkedProject();
  project.acceptanceTests = [{
    id: "map-starts-correctly",
    name: "Map starts correctly",
    runner: "looplab-deterministic-runtime",
    driver: { tickRate: 60, tickCount: 2, inputs: [] },
    assertions: [{ id: "starts-map-a", target: "runtime-state", property: "activeMapId", operator: "equals", expected: "map-a", atTick: 2 }],
  }];
  project = applyAgentCommand(project, {
    op: "record_replay_case",
    id: "artifact-parity",
    name: "Artifact replay parity",
    tickCount: 4,
    inputs: [{ tick: 0, action: "move-right", pressed: true }, { tick: 3, action: "move-right", pressed: false }],
    checkpointInterval: 1,
  }).project;
  const doctor = analyzeProject(project);
  const runtime = executeStandaloneRuntime(buildStandaloneHtml(project));
  assert.equal(runtime.getSourceDigest(), doctor.sourceDigest);
  const canonicalReplay = runReplaySuite(project);
  const embeddedReplay = JSON.parse(JSON.stringify(runtime.runReplaySuite()));
  assert.deepEqual(embeddedReplay, canonicalReplay);
  const canonicalAcceptance = runAcceptanceSuite(project, { sourceDigest: doctor.sourceDigest });
  const embeddedAcceptance = JSON.parse(JSON.stringify(runtime.runAcceptanceSuite()));
  assert.deepEqual(embeddedAcceptance, canonicalAcceptance);
});

test("the exact exported runtime exposes a bounded visible runtime-join probe", () => {
  const runtime = executeStandaloneRuntime(buildStandaloneHtml(linkedProject()));
  const join = runtime.getRuntimeJoinPlan().joins[0];
  assert.ok(join?.portalId);
  const source = runtime.beginRuntimeJoinProbe(join.portalId);
  assert.equal(source.ok, true, JSON.stringify(source));
  assert.equal(source.playerExcluded, true);
  assert.equal(runtime.getState().activeMapId, join.sourceMapId);
  const transition = runtime.commitRuntimeJoinProbe(join.portalId);
  assert.equal(transition.ok, true, JSON.stringify(transition));
  assert.equal(transition.transitioned, true);
  assert.equal(transition.exactSpawn, true);
  assert.equal(transition.landingClear, true);
  assert.equal(runtime.getState().activeMapId, join.targetMapId);
  const finished = runtime.finishRuntimeJoinProbe();
  assert.equal(finished.ok, true);
});
test("semantic action IDs drive identical movement through the Node and exported runtime APIs", () => {
  const project = createTemplate("platformer");
  const nodeRuntime = createRuntimeModel(project);
  const exportedRuntime = executeStandaloneRuntime(buildStandaloneHtml(project));
  const before = nodeRuntime.getState().player.x;

  nodeRuntime.setInput("move-right", true);
  exportedRuntime.setInput("move-right", true);
  for (let index = 0; index < 12; index += 1) nodeRuntime.update(1 / 60);
  exportedRuntime.step(200);
  nodeRuntime.setInput("move-right", false);
  exportedRuntime.setInput("move-right", false);

  const nodeState = nodeRuntime.getState();
  const exportedState = JSON.parse(JSON.stringify(exportedRuntime.getState()));
  assert.ok(nodeState.player.x > before, "the semantic move-right action must produce locomotion");
  assert.ok(Math.abs(exportedState.player.x - nodeState.player.x) < 0.000_001, "the exported and Node trajectories must match");
  assert.deepEqual(exportedState.deterministicState.activeActionIds, ["move-right"]);
});

test("the exported replay serializer and hash stay bit-identical to the canonical module", () => {
  const html = buildStandaloneHtml(linkedProject());
  const canonicalSource = html.match(/function replayCanonicalize\(value\)\{[^\n]+/)?.[0];
  const hashSource = html.match(/function replayHash\(value,hashVersion\)\{[^\n]+/)?.[0];
  assert.ok(canonicalSource && hashSource, "the export must contain both replay hash helpers");
  const embedded = new Function(`"use strict"; ${buildStandaloneRuntimePrelude()}\n${canonicalSource}\n${hashSource}\nreturn { serialize: (value) => JSON.stringify(replayCanonicalize(value)), hash: replayHash };`)();
  const samples = [
    null,
    { z: [{ b: 2, a: 1 }], a: { y: true, x: false } },
    { activeMapId: "map-a", player: { x: 1.25, y: -0, grounded: false }, objects: [{ id: "b" }, { id: "a", hidden: true }] },
  ];
  for (const sample of samples) {
    assert.equal(embedded.serialize(sample), canonicalReplaySerialize(sample));
    assert.equal(embedded.hash(sample, LOOPLAB_REPLAY_HASH_VERSION), replayStateDigest(sample));
    assert.equal(embedded.hash(sample, LOOPLAB_REPLAY_MOTION_HASH_VERSION), replayStateDigest(sample, { hashVersion: LOOPLAB_REPLAY_MOTION_HASH_VERSION }));
  }
});

test("uses fresh interaction input to move between authored maps and target spawns", () => {
  const project = linkedProject();
  assert.deepEqual(validateProject(project).errors, []);
  const runtime = createRuntimeModel(project);
  runtime.drainEvents();
  runtime.setInput("KeyE", true);
  const events = runtime.update(0.016);

  assert.equal(runtime.getState().activeMapId, "map-b");
  assert.equal(events.some((event) => event.type === "portal.entered" && event.transition === "fade"), true);
  const player = runtime.getObjects().find((entry) => entry.kind === "player");
  assert.equal(player.x, 105);
  assert.equal(player.y, 90);
  assert.equal(player.z, 4);
  assert.equal(player.collider.zMin, 4);

  runtime.update(0.5);
  assert.equal(runtime.getState().activeMapId, "map-b", "holding E must not bounce through the return portal");
});

test("gamepad polling applies deadzones and exposes stable semantic binding codes", () => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[0] = { pressed: true, value: 1 };
  buttons[7] = { pressed: false, value: 0.75 };
  const codes = readGamepadInputCodes([{ buttons, axes: [-0.7, 0.1] }]);
  assert.ok(codes.includes("GamepadButton0"));
  assert.ok(codes.includes("GamepadRightTrigger"));
  assert.ok(codes.includes("GamepadDPadLeft"), "the deadzoned left stick shares the authored movement binding");
  assert.ok(!codes.includes("GamepadDPadDown"), "sub-deadzone drift must not move the player");
});

test("queues a short keyboard or touch tap until the next simulation frame", () => {
  const runtime = createRuntimeModel(linkedProject());
  runtime.drainEvents();
  runtime.setInput("interact", true);
  runtime.setInput("interact", false);
  runtime.update(0.016);

  assert.equal(runtime.getState().activeMapId, "map-b");
  assert.equal(runtime.drainEvents().length, 0, "update returns and drains the emitted event batch");
});

test("advances held movement deterministically across fixed 60 Hz steps", () => {
  const runtime = createRuntimeModel(linkedProject());
  runtime.drainEvents();
  const before = runtime.getObjects().find((entry) => entry.kind === "player").x;
  runtime.setInput("right", true);
  for (let index = 0; index < 12; index += 1) runtime.update(1 / 60);
  runtime.setInput("right", false);
  const after = runtime.getObjects().find((entry) => entry.kind === "player").x;

  assert.ok(Math.abs((after - before) - 50) < 0.000_001, `expected exactly 50px of movement, received ${after - before}`);
});

test("resolves authored collider offsets and keeps z-separated routes independent", () => {
  const baseObjects = [object("player", "player", { x: 0, y: 0 }), object("spawn", "spawn")];
  const blocking = map("map-a", [...baseObjects, object("platform", "wall", { x: 15, y: 0 })]);
  const blockingProject = { name: "Collision", width: 200, height: 120, background: "#ffffff", gravity: 0, grid: 10, controlMode: "topdown", objects: blocking.objects, assets: [], maps: [blocking], activeMapId: "map-a" };
  const blockedRuntime = createRuntimeModel(blockingProject);
  blockedRuntime.setInput("right", true);
  blockedRuntime.update(0.04);
  assert.equal(blockedRuntime.getObjects().find((entry) => entry.kind === "player").x, 9);

  const elevatedWall = object("platform", "wall", { x: 15, y: 0, z: 4, supportZ: 4, collider: { enabled: true, offsetX: 2, offsetY: 0, width: 10, height: 20, trigger: false, oneWay: false, zMin: 4, zMax: 5 } });
  const passing = map("map-a", [...baseObjects, elevatedWall]);
  const passingRuntime = createRuntimeModel({ ...blockingProject, objects: passing.objects, maps: [passing] });
  passingRuntime.setInput("right", true);
  passingRuntime.update(0.04);
  assert.equal(passingRuntime.getObjects().find((entry) => entry.kind === "player").x, 10);
});

test("creates deterministic depth entries for authored slices", () => {
  const runtime = createRuntimeModel(linkedProject());
  const slicedEntries = runtime.renderEntries().filter((entry) => entry.object.id === "sliced-sign");
  assert.deepEqual(slicedEntries.map((entry) => entry.slice.id), ["back", "front"]);
  assert.ok(slicedEntries[0].depth < slicedEntries[1].depth);
});

test("exports the tested runtime model, linked maps, mobile-only touch controls, and headless API", () => {
  const project = linkedProject();
  project.release = { externalRequests: [], debugMarkers: [] };
  project.assets = [{ id: "embedded-pixel", name: "Embedded pixel", type: "sprite", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1zGkwAAAABJRU5ErkJggg==", width: 1, height: 1, frameWidth: 1, frameHeight: 1, frames: 1, columns: 1, anchorX: 0.5, anchorY: 1, anchorMode: "ground", collisionPolicy: "authored-only", generator: { kind: "test" } }];
  const html = buildStandaloneHtml(project);
  assert.match(html, /const runtimeApi=\{version:'2\.27\.0',getSourceDigest/);
  assert.match(html, /Object\.isExtensible\(window\)/);
  assert.match(html, /id="looplab-runtime-bridge"/);
  assert.match(html, /id="looplab-runtime-form"/);
  assert.match(html, /looplab:runtime-command/);
  assert.match(html, /looplab:runtime-response/);
  assert.match(html, /const FIXED_STEP=1\/60/);
  assert.match(html, /MAX_CATCH_UP_STEPS=5/);
  assert.match(html, /getPerformance:getPerformance/);
  assert.match(html, /getTraversalPaths/);
  assert.match(html, /getRuntimeJoinPlan/);
  assert.match(html, /get_source_digest/);
  assert.match(html, /getCompletionReport/);
  assert.match(html, /get_completion_report/);
  assert.match(html, /get_runtime_join_plan/);
  assert.match(html, /runEmbeddedAcceptanceTest/);
  assert.match(html, /get_acceptance_tests/);
  assert.match(html, /run_acceptance_test/);
  assert.match(html, /run_acceptance_suite/);
  assert.match(html, /runEmbeddedReplayCase/);
  assert.match(html, /run_replay_suite/);
  assert.match(html, /looplab-runtime-ready/);
  assert.match(html, /data-input="interact"/);
  assert.match(html, /id="touch-controls" hidden aria-hidden="true"/);
  assert.match(html, /readGamepadInputCodes/);
  assert.match(html, /navigator\.getGamepads\(\)/);
  assert.match(html, /event\.pointerType==='touch'/);
  assert.match(html, /\.touch-controls\[hidden\]\{display:none!important\}/);
  assert.match(html, /@media\(max-width:700px\)/);
  assert.doesNotMatch(html, /mobileTouchQuery/, "viewport width alone must not enable touch controls on desktop");
  assert.match(html, /visibilitychange/);
  assert.match(html, /targetMapId/);
  assert.match(html, /depthSlices/);
  assert.match(html, /function createRuntimeModel\(project\)/);
  assert.match(html, /data:image\/png;base64,iVBOR/);
  assert.match(html, /id="looplab-runtime-submit" type="button"/);
  assert.match(html, /runtimeSubmit\.addEventListener\('click',submitRuntimeCommand\)/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel=["']?stylesheet|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/i);
  assert.equal((html.match(/<!doctype html>/gi) ?? []).length, 1);
  assert.equal((html.match(/<style>/gi) ?? []).length, 1);
  const embeddedScript = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  assert.ok(embeddedScript, "export must contain one embedded runtime script");
  assert.doesNotThrow(() => new Function(embeddedScript), "embedded runtime script must parse in a browser");
});

test("embeds the Narrative Contract and source-bound Narrative Report in the one-file headless runtime", () => {
  let project = createTemplate("systems");
  project.qualityContracts = { ...(project.qualityContracts ?? {}), narrativeContractRequired: true };
  const contract = {
    version: 1,
    status: "implemented",
    premise: "A market choice closes the daily ledger.",
    entryPageIds: ["market-offer"],
    characters: [{ id: "narrator", name: "Narrator" }],
    lines: [{ id: "market-line", speakerId: "narrator", voiceRole: "narrator", text: "The market opens.", delivery: "text", essential: true }],
    beats: [{ id: "market-beat", label: "Market opens", kind: "setup", required: true, essential: true, delivery: "text", pageId: "market-offer", variableIds: ["day"], lineIds: ["market-line"], acceptanceTestIds: ["market-choice-route"] }],
    endings: [{ id: "ledger-ending", label: "Ledger closed", kind: "success", choiceId: "close-ledger", acceptanceTestIds: ["market-choice-route"] }],
  };
  project = applyAgentCommand(project, { op: "set_narrative_contract", contract }).project;
  const runtime = executeStandaloneRuntime(buildStandaloneHtml(project));
  assert.equal(runtime.getNarrativeContract().premise, contract.premise);
  assert.equal(runtime.getNarrativeReport().schemaVersion, "looplab-narrative-report/v1");
  assert.equal(runtime.getNarrativeReport().status, "passed");
  assert.equal(runtime.getNarrativeReport().metrics.reachableEndingCount, 1);
  assert.match(runtime.getNarrativeReport().sourceDigest, /^source-[a-f0-9]{64}$/);
});

test("returns a source-bound draft receipt from an audited prototype artifact", () => {
  const project = linkedProject();
  project.release = { externalRequests: [], debugMarkers: [] };
  const artifact = buildStandaloneArtifact(project, { filename: "runtime-contract.html", generatedAt: "2026-08-08T12:00:00.000Z" });

  assert.match(artifact.html, /^<!doctype html>/i);
  assert.equal(artifact.audit.valid, true);
  assert.equal(artifact.receipt.schemaVersion, "looplab-export-receipt/v5");
  assert.equal(artifact.receipt.status, "draft");
  assert.equal(artifact.receipt.release.shippable, false);
  assert.equal(artifact.receipt.release.doctorProfile, "prototype");
  assert.equal(artifact.receipt.release.sourceBoundVerification, false);
  assert.match(artifact.receipt.release.reason, /iteration draft rather than a release claim/);
  assert.equal(artifact.receipt.filename, "runtime-contract.html");
  assert.equal(artifact.receipt.generatedAt, "2026-08-08T12:00:00.000Z");
  assert.equal(artifact.receipt.artifact.byteLength, artifact.audit.byteLength);
  assert.equal(artifact.receipt.artifact.uploadFileCount, 1);
  assert.equal(artifact.receipt.artifact.valid, true);
  assert.ok(artifact.receipt.artifact.checks.every((check) => check.passed));
  assert.equal(artifact.receipt.doctor.errorCount, 0);
  assert.equal(artifact.receipt.privacy.status, "clear");
  assert.equal(artifact.receipt.privacy.findingCount, 0);
  assert.equal(artifact.receipt.privacy.matchedValuesReturned, false);
  assert.equal(artifact.receipt.privacy.sourceDigest, artifact.receipt.source.sourceDigest);
  assert.match(artifact.receipt.privacy.digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(artifact.receipt.source.sourceDigest, /^source-/);
  assert.equal(artifact.receipt.game.mapCount, 2);
  assert.equal(artifact.receipt.game.startMapId, "map-a");
  assert.equal(artifact.receipt.runtime.offlinePlayable, true);
  assert.deepEqual(artifact.receipt.runtime.externalDependencies, []);
  assert.equal(artifact.receipt.editableSource.filename, "runtime-contract.loop.json");
  assert.equal(artifact.receipt.editableSource.authoritative, true);
});

test("release-ready export refuses a legacy offline boolean without an exact-artifact attestation", () => {
  let project = applyAgentCommand(createTemplate("platformer"), {
    op: "upsert_feature_contract",
    contract: {
      id: "feature-pocket-route",
      name: "Pocket route completion",
      visual: "pocket-route-art",
      collision: "authored-platform-geometry",
      inputAction: "move-right",
      animationState: "run",
      feedbackEvent: "goal.reached",
      placementRules: "The authored staircase keeps readable launch, landing, and recovery space.",
      responsiveRules: "The route and goal stay outside the HUD-safe band.",
      acceptanceTests: ["pocket-route-completion"],
    },
  }).project;
  project = applyAgentCommand(project, {
    op: "record_replay_case",
    id: "release-startup",
    name: "Release startup remains deterministic",
    tickCount: 1,
    inputs: [],
    checkpointInterval: 1,
  }).project;
  project = { ...project, doctorProfile: "production", release: { ...project.release, offlineVerified: true } };
  const doctor = analyzeProject(project);
  assert.equal(doctor.errorCount, 0, JSON.stringify(doctor.issues, null, 2));
  assert.equal(doctor.warningCount, 1, JSON.stringify(doctor.issues, null, 2));
  assert.equal(doctor.issues.find((issue) => issue.severity === "warning")?.code, "offline-unverified");
  assert.throws(() => buildStandaloneArtifact(project, { filename: "pocket-release.html" }), /Project Doctor blocked HTML export/);
});

test("manifest declares the generated game as one offline-playable HTML file", async () => {
  const { getAgentManifest } = await import("../lib/looplab-agent-core.mjs");
  const manifest = getAgentManifest();
  assert.equal(manifest.exportedRuntime.packaging, "single-self-contained-html");
  assert.equal(manifest.exportedRuntime.offlinePlayable, true);
  assert.deepEqual(manifest.exportedRuntime.externalDependencies, []);
  assert.ok(manifest.exportedRuntime.embeds.includes("selected-assets-as-data-urls"));
  assert.equal(manifest.exportedRuntime.version, "2.27.0");
  assert.ok(manifest.exportedRuntime.embeds.includes("keyboard-gamepad-and-touch-controls"));
  assert.ok(manifest.exportedRuntime.embeds.includes("deterministic-replay-fixtures"));
  assert.ok(manifest.exportedRuntime.embeds.includes("deterministic-acceptance-fixtures"));
  assert.ok(manifest.exportedRuntime.embeds.includes("runtime-join-plan"));
  assert.ok(manifest.exportedRuntime.methods.includes("runReplaySuite"));
  assert.ok(manifest.exportedRuntime.methods.includes("runAcceptanceSuite"));
  assert.ok(manifest.exportedRuntime.methods.includes("runAcceptanceTest"));
  assert.ok(manifest.exportedRuntime.methods.includes("getRuntimeJoinPlan"));
  assert.equal(manifest.exportedRuntime.domBridge.form.commandInput, "#looplab-runtime-command");
  assert.equal(manifest.exportReceipt.prepareCommand, "prepare_export");
  assert.equal(manifest.exportReceipt.exportCommand, "export_html");
  assert.equal(manifest.exportReceipt.cliOperation, "prepare-export");
  assert.equal(manifest.exportReceipt.schemaVersion, "looplab-export-receipt/v5");
  assert.deepEqual(manifest.exportReceipt.statuses, ["draft", "release-ready"]);
  assert.match(manifest.exportReceipt.statusPolicy, /production Doctor is warning-clean/);
  assert.ok(manifest.commands.includes("prepare_export"));
});
