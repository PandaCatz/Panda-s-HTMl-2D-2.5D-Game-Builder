import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { applyAgentCommand, createTemplate, getAgentManifest, getPublicAgentManifest, validateProject } from "../lib/looplab-agent-core.mjs";
import { routeGameStudioWork } from "../lib/looplab-capability-router.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { composeDirectedGameBrief } from "../lib/looplab-game-director.mjs";
import { LOOPLAB_PROJECT_SCHEMA_VERSION, LOOPLAB_REUSE_GUIDE_SOURCE } from "../lib/looplab-reuse-guide.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";

test("pins the supplied reuse guide and routes its optional systems without claiming activation", () => {
  const project = createTemplate("platformer");
  const routed = routeGameStudioWork(project, {
    track: "creation",
    prompt: "Build a fast skating game with rails, continuous chunks, camera lead, afterimages, and a profiler.",
  });
  const capabilityIds = routed.route.map((entry) => entry.capabilityId);
  assert.equal(routed.reuseGuide.source.sha256, LOOPLAB_REUSE_GUIDE_SOURCE.sha256);
  assert.equal(routed.reuseGuide.projectSchemaVersion, LOOPLAB_PROJECT_SCHEMA_VERSION);
  assert.ok(capabilityIds.includes("high-speed-sweep-2d"));
  assert.ok(capabilityIds.includes("rail-path-authoring"));
  assert.ok(capabilityIds.includes("continuous-world-chunks"));
  assert.ok(capabilityIds.includes("effects-plugin-system"));
  assert.ok(capabilityIds.includes("performance-profiler"));
  assert.ok(routed.reuseGuide.oneFileAdaptation.excluded.includes("service-worker"));
  assert.match(routed.reuseGuide.activationPolicy, /not proof/i);
});

test("movement templates strengthen the directed prompt and are available headlessly", () => {
  const brief = composeDirectedGameBrief({
    userPrompt: "A rooftop courier who chains grinds across a neon district.",
    genre: "skating-tricks",
    coreLoop: "traverse-chain-score",
    movementTemplate: "kinetic-runner",
    format: "connected-rooms",
    progression: "score-attack",
  });
  assert.equal(brief.movementTemplate, "kinetic-runner");
  assert.match(brief.composedPrompt, /Movement \/ rules template: Kinetic runner \/ skating/);
  const manifest = getAgentManifest();
  assert.ok(manifest.gameDirector.fields.movementTemplate.some((choice) => choice.value === "kinetic-runner"));
  assert.equal(manifest.projectSchema.currentVersion, LOOPLAB_PROJECT_SCHEMA_VERSION);
  assert.equal(manifest.projectSchema.schemaUrl, "/project-schema.json");
});

test("the headless manifest permanently requires hard-won fixes to become regression-tested capabilities", () => {
  const manifest = getAgentManifest();
  assert.equal(manifest.capabilityHarvesting.id, "capability-harvesting-v1");
  assert.equal(manifest.capabilityHarvesting.permanent, true);
  assert.match(manifest.capabilityHarvesting.trigger, /recur/i);
  assert.ok(manifest.capabilityHarvesting.procedure.some((step) => /regression test/i.test(step)));
  assert.match(manifest.capabilityHarvesting.boundary, /Never weaken Project Doctor|Never weaken Doctor/i);
  assert.match(manifest.longRunningProviderJobs.startEndpoint, /\/jobs$/);
  assert.match(manifest.longRunningProviderJobs.statusEndpoint, /\/jobs\/\{id\}\/status$/);
  assert.match(manifest.longRunningProviderJobs.launchPolicy, /Submit exactly once/i);
  assert.match(manifest.longRunningProviderJobs.timeoutPolicy, /no application-side provider timeout/i);
  assert.match(manifest.longRunningProviderJobs.freshnessPolicy, /protocolVersion/i);
  assert.match(manifest.longRunningProviderJobs.segmentationPolicy, /ordered bounded passes/i);
});

test("AI providers can canonically author linked contracts, acceptance specifications, and measured replay fixtures", () => {
  let project = createTemplate("platformer");
  const acceptance = applyAgentCommand(project, {
    op: "upsert_acceptance_test",
    test: {
      id: "test-first-route",
      name: "First route is deterministic",
      featureId: "feature-first-route",
      assertion: "authored-traversal-route",
      expected: "The player follows the authored route and reaches its recovery zone.",
    },
  });
  project = acceptance.project;
  const contract = applyAgentCommand(project, {
    op: "upsert_feature_contract",
    contract: {
      id: "feature-first-route",
      name: "First route",
      visual: "first-route-art",
      collision: "first-route-authored-geometry",
      inputAction: "move-right",
      animationState: "run",
      feedbackEvent: "route.completed",
      placementRules: "Authored setup, traversal, landing, and recovery remain clear.",
      responsiveRules: "The route stays outside the HUD-safe band.",
      acceptanceTests: ["test-first-route"],
    },
  });
  project = contract.project;
  const replay = applyAgentCommand(project, {
    op: "record_replay_case",
    id: "replay-first-route",
    name: "First route replay",
    tickCount: 6,
    inputs: [
      { tick: 0, action: "move-right", pressed: true },
      { tick: 5, action: "move-right", pressed: false },
    ],
    checkpointInterval: 2,
  });
  assert.equal(replay.validation.valid, true);
  assert.equal(replay.project.featureContracts.find((entry) => entry.id === "feature-first-route").acceptanceTests[0], "test-first-route");
  assert.equal(replay.project.acceptanceTests.find((entry) => entry.id === "test-first-route").featureId, "feature-first-route");
  const authoredReplay = replay.project.replay.cases.find((entry) => entry.id === "replay-first-route");
  assert.match(authoredReplay.expectedHash, /^replay-sha256-[0-9a-f]{64}$/);
  assert.ok(authoredReplay.checkpoints.length >= 3);
  assert.equal(analyzeProject(replay.project).issues.some((issue) => issue.code === "contract-test-missing"), false);

  assert.throws(() => applyAgentCommand(createTemplate("platformer"), {
    op: "upsert_feature_contract",
    contract: { id: "incomplete-contract", name: "Incomplete" },
  }), /visual is required/);
});

test("static manifest exposes the same reuse source, commands, templates, and runtime probes", async () => {
  const [staticManifest, publicSchema] = await Promise.all([
    readFile(new URL("../public/agent-manifest.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/project-schema.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  const dynamicManifest = getAgentManifest();
  assert.deepEqual(staticManifest, getPublicAgentManifest());
  assert.equal(staticManifest.protocolVersion, dynamicManifest.protocolVersion);
  assert.equal(staticManifest.projectSchema.schemaUrl, dynamicManifest.projectSchema.schemaUrl);
  assert.equal(staticManifest.reuseGuide.source.sha256, dynamicManifest.reuseGuide.source.sha256);
  assert.ok(staticManifest.gameDirector.fields.movementTemplate.includes("kinetic-runner"));
  assert.ok(staticManifest.commands.includes("add_traversal_path"));
  assert.ok(staticManifest.exportedRuntime.methods.includes("getTraversalPaths"));
  assert.ok(staticManifest.exportedRuntime.methods.includes("getPerformance"));
  assert.ok(staticManifest.exportedRuntime.methods.includes("runReplaySuite"));
  assert.ok(staticManifest.exportedRuntime.methods.includes("getRuntimeJoinPlan"));
  assert.ok(staticManifest.exportedRuntime.methods.includes("getNarrativeReport"));
  assert.ok(staticManifest.commands.includes("set_narrative_contract"));
  assert.equal(staticManifest.narrativeRules.schemas.contract, "looplab-narrative-contract/v1");
  assert.equal(staticManifest.narrativeRules.schemas.report, "looplab-narrative-report/v1");
  assert.deepEqual(staticManifest.runtimeJoinValidation, dynamicManifest.runtimeJoinValidation);
  assert.deepEqual(staticManifest.capabilityHarvesting, dynamicManifest.capabilityHarvesting);
  assert.deepEqual(staticManifest.longRunningProviderJobs, dynamicManifest.longRunningProviderJobs);
  assert.equal(staticManifest.longRunningProviderJobs.activityEvent, "provider.activity");
  assert.match(staticManifest.longRunningProviderJobs.heartbeatPolicy, /process-only/);
  assert.deepEqual(staticManifest.gameplayRules.policy.inputPhases, ["pressed", "held", "released"]);
  assert.deepEqual(staticManifest.gameplayRules.policy.overlapEdges, ["enter", "stay", "exit"]);
  assert.equal(staticManifest.companion.generationJobStatus, "/jobs/{id}/status");
  assert.equal(staticManifest.companion.lifecycleShutdown, "/lifecycle/shutdown");
  assert.match(staticManifest.companion.lifecyclePolicy, /exact protocol match/);
  assert.equal(staticManifest.companion.expectedProtocolVersion, dynamicManifest.protocolVersion);
  assert.ok(staticManifest.commands.includes("get_runtime_join_plan"));
  assert.deepEqual(staticManifest.deterministicReplay.commands, dynamicManifest.deterministicReplay.commands);
  assert.deepEqual(staticManifest.authoredEvidence, dynamicManifest.authoredEvidence);
  for (const command of [...dynamicManifest.authoredEvidence.featureContractCommands, ...dynamicManifest.authoredEvidence.acceptanceTestCommands]) assert.ok(staticManifest.commands.includes(command));
  assert.deepEqual(staticManifest.editorPreview, dynamicManifest.editorPreview);
  assert.deepEqual(staticManifest.editorPreview.playMode, { mode: "play", focus: true });
  assert.deepEqual(staticManifest.exportReceipt, dynamicManifest.exportReceipt);
  assert.ok(staticManifest.commands.includes("prepare_export"));
  assert.equal(publicSchema.properties.schemaVersion.const, LOOPLAB_PROJECT_SCHEMA_VERSION);
  assert.deepEqual(publicSchema.$defs.gameplayProgram.properties.rules.items.properties.trigger.properties.phase.enum, ["pressed", "held", "released"]);
  assert.deepEqual(publicSchema.$defs.gameplayProgram.properties.rules.items.properties.trigger.properties.edge.enum, ["enter", "stay", "exit"]);
  assert.equal(publicSchema.properties.narrativeContract.$ref, "#/$defs/narrativeContract");
  assert.equal(publicSchema.$defs.narrativeContract.properties.version.const, 1);
  assert.deepEqual(publicSchema.$defs.narrativeContract.properties.lines.items.properties.voiceRole.enum, ["narrator", "character", "system", "environment"]);
  assert.equal(publicSchema.properties.release.properties.singleFile.const, true);
  assert.equal(publicSchema.properties.release.properties.networkFree.const, true);
  assert.equal(publicSchema.properties.replay.$ref, "#/$defs/replay");
  assert.equal(publicSchema.properties.featureContracts.items.$ref, "#/$defs/featureContract");
  assert.equal(publicSchema.properties.acceptanceTests.items.$ref, "#/$defs/acceptanceTest");
  assert.ok(publicSchema.$defs.featureContract.required.includes("acceptanceTests"));
  assert.equal(publicSchema.$defs.acceptanceTest.anyOf.length, 2);
  assert.equal(publicSchema.$defs.replayCase.properties.expectedHash.pattern, "^(?:replay-[0-9a-f]{8}|replay-sha256-[0-9a-f]{64})$");
  assert.equal(publicSchema.$defs.traversalPath.properties.exitImpulse.$ref, "#/$defs/vector");
  assert.equal(publicSchema.$defs.object.properties.runtimeJoin.$ref, "#/$defs/runtimeJoin");
  assert.deepEqual(publicSchema.$defs.runtimeJoin.properties.mode.enum, ["portal", "continuous"]);
});

test("headless traversal commands keep path geometry authored, stable, and map-local", () => {
  const project = createTemplate("platformer");
  const added = applyAgentCommand(project, {
    op: "add_traversal_path",
    path: {
      id: "rail-main-line",
      name: "Main line",
      kind: "rail",
      points: [{ x: 180, y: 390, z: 0 }, { x: 520, y: 330, z: 0 }],
      entryRadius: 30,
      minimumEntrySpeed: 90,
      direction: "both",
      maximumSpeed: 560,
      transferPathIds: [],
      bailBehavior: "drop",
    },
  });
  assert.equal(added.project.traversalPaths[0].collisionOwner, "authored-map");
  assert.equal(added.project.maps[0].traversalPaths[0].id, "rail-main-line");
  assert.equal(validateProject(added.project).valid, true);

  const updated = applyAgentCommand(added.project, { op: "update_traversal_path", id: "rail-main-line", changes: { entryRadius: 42, direction: "forward" } });
  assert.equal(updated.project.traversalPaths[0].entryRadius, 42);
  assert.equal(updated.project.traversalPaths[0].direction, "forward");

  const removed = applyAgentCommand(updated.project, { op: "remove_traversal_path", id: "rail-main-line" });
  assert.equal(removed.project.traversalPaths.length, 0);
  assert.equal(removed.project.maps[0].traversalPaths.length, 0);
});

test("fresh interaction captures and rides an authored traversal path", () => {
  const project = createTemplate("topdown");
  const player = project.objects.find((object) => object.kind === "player");
  const box = player.collider;
  const anchorX = player.x + box.offsetX + box.width / 2;
  const anchorY = player.y + box.offsetY + box.height;
  project.traversalPaths = [{
    id: "test-rail",
    name: "Test rail",
    kind: "rail",
    collisionOwner: "authored-map",
    points: [{ x: anchorX, y: anchorY, z: 0 }, { x: anchorX + 100, y: anchorY, z: 0 }],
    entryRadius: 10,
    minimumEntrySpeed: 40,
    direction: "forward",
    maximumSpeed: 260,
    exitImpulse: { x: 0, y: 0, z: 0 },
    transferPathIds: [],
    bailBehavior: "drop",
  }];
  project.maps[0].traversalPaths = structuredClone(project.traversalPaths);
  const runtime = createRuntimeModel(project);
  runtime.setInput("KeyD", true);
  runtime.setInput("KeyE", true);
  const started = runtime.update(1 / 60);
  assert.ok(started.some((event) => event.type === "traversal.started" && event.pathId === "test-rail"));
  assert.equal(runtime.getState().activeTraversalPathId, "test-rail");
  runtime.setInput("KeyE", false);
  let completed = false;
  for (let index = 0; index < 40 && !completed; index += 1) completed = runtime.update(1 / 60).some((event) => event.type === "traversal.completed");
  assert.equal(completed, true);
  assert.equal(runtime.getState().activeTraversalPathId, null);
});

test("swept axis response blocks a fast tiny body from tunneling through a thin wall", () => {
  const player = { id: "player", kind: "player", name: "Player", x: 0, y: 5, z: 0, supportZ: 0, width: 2, height: 2, color: "#fff", solid: false, collider: { enabled: true, offsetX: 0, offsetY: 0, width: 2, height: 2, trigger: false, oneWay: false, zMin: 0, zMax: 1 } };
  const wall = { id: "wall", kind: "platform", name: "Thin wall", x: 5, y: 0, z: 0, supportZ: 0, width: 1, height: 20, color: "#000", solid: true, collider: { enabled: true, offsetX: 0, offsetY: 0, width: 1, height: 20, trigger: false, oneWay: false, zMin: 0, zMax: 1 } };
  const runtime = createRuntimeModel({ name: "Sweep", width: 100, height: 40, background: "#fff", gravity: 0, grid: 1, controlMode: "topdown", objects: [player, wall] });
  runtime.setInput("KeyD", true);
  runtime.update(0.05);
  assert.equal(runtime.getObjects().find((object) => object.id === "player").x, 3);
});

test("Project Doctor rejects incompatible schemas, renderer ownership, and PWA dependencies", () => {
  const project = createTemplate("platformer");
  const report = analyzeProject({
    ...project,
    schemaVersion: "99.0.0",
    release: { ...project.release, pwa: true, serviceWorker: true },
    qualityContracts: { ...project.qualityContracts, architecture: { ...project.qualityContracts.architecture, rendererDisposableAdapter: false } },
  });
  const codes = new Set(report.issues.map((issue) => issue.code));
  assert.ok(codes.has("schema-version-unsupported"));
  assert.ok(codes.has("renderer-not-adapter"));
  assert.ok(codes.has("one-file-pwa-conflict"));
  assert.equal(report.canPromote, false);
});
