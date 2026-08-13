import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { applyAgentCommand, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { LOOPLAB_GAME_STUDIO_PLAN_SCHEMA, LOOPLAB_NARRATIVE_ROUTING_POLICY, LOOPLAB_RUNTIME_KNOWLEDGE, LOOPLAB_RUNTIME_SELECTION_POLICY, LOOPLAB_SPECIALIST_AGENTS, routeGameStudioWork, selectGameRuntime, selectNarrativeSupport } from "../lib/looplab-capability-router.mjs";

const EXPECTED_IDS = [
  "creative-director",
  "game-loop-designer",
  "narrative-designer",
  "narrator-dialogue-writer",
  "technical-architect",
  "gameplay-engineer",
  "actor-systems-designer",
  "level-collision-architect",
  "art-director",
  "audio-designer",
  "ui-accessibility-designer",
  "release-engineer",
  "project-doctor-critic",
  "playtest-qa",
];

test("publishes a stable truthful specialist roster", () => {
  assert.deepEqual(LOOPLAB_SPECIALIST_AGENTS.map((agent) => agent.id), EXPECTED_IDS);
  const manifest = getAgentManifest();
  assert.equal(manifest.protocolVersion, "1.111.0");
  assert.equal(manifest.specialistAgents.executionMode, "single-provider-staged-review");
  assert.equal(manifest.specialistAgents.providerInvocationsPerIteration, 1);
  assert.equal(manifest.specialistAgents.independentAgentProcesses, false);
  assert.equal(manifest.specialistAgents.narrativeRouting.schemaVersion, LOOPLAB_NARRATIVE_ROUTING_POLICY.schemaVersion);
  assert.equal(manifest.specialistAgents.roster.find((agent) => agent.id === "project-doctor-critic").executor, "project-doctor");
  assert.equal(manifest.specialistAgents.roster.find((agent) => agent.id === "playtest-qa").executor, "playwright");
  assert.ok(manifest.specialistAgents.roster.filter((agent) => agent.executor === "selected-provider").length >= 7);
  assert.deepEqual(manifest.exportedRuntime.engineDelivery, {
    canvas: "built-in-inline",
    phaser: "inline-script-tag",
    pixi: "inline-umd-with-official-csp-polyfill",
    melon: "tree-shaken-inline-iife",
  });
  assert.equal(Object.hasOwn(manifest.exportedRuntime, "pendingEngineTargets"), false);
});

test("generated runtime wrappers stay byte-stable on Windows checkouts", async () => {
  const attributes = await readFile(new URL("../.gitattributes", import.meta.url), "utf8");
  assert.match(attributes, /^lib\/generated\/looplab-\*-browser-bundle\.mjs text eol=lf$/m);

  for (const runtime of ["phaser", "pixi", "melon"]) {
    const source = await readFile(new URL(`../lib/generated/looplab-${runtime}-browser-bundle.mjs`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\r\n/, runtime);
  }
});

test("Full game creation routes every broad 2D discipline and keeps gates independent", () => {
  const route = routeGameStudioWork(createTemplate("platformer"), { track: "creation", prompt: "Create a cohesive skating game with art, audio, touch UI, and fair collision" });
  const capabilityIds = route.route.map((step) => step.capabilityId);
  const agentIds = route.agentPlan.map((agent) => agent.agentId);
  assert.equal(route.context.track, "creation");
  assert.ok(capabilityIds.includes("collision-and-response-2d"));
  assert.ok(capabilityIds.includes("procedural-web-audio"));
  assert.ok(capabilityIds.includes("sprite-pipeline"));
  assert.ok(capabilityIds.includes("game-ui-frontend"));
  assert.ok(agentIds.includes("creative-director"));
  assert.ok(agentIds.includes("art-director"));
  assert.equal(route.agentPlan.find((agent) => agent.agentId === "project-doctor-critic").receiptRequired, false);
  assert.equal(route.agentPlan.find((agent) => agent.agentId === "playtest-qa").receiptRequired, false);
  assert.equal(route.agentExecution.providerInvocationsPerIteration, 1);
  assert.equal(route.agentExecution.independentAgentProcesses, false);
});

test("story-bearing work conditionally routes the Narrative Designer and Narrator/Dialogue Writer", () => {
  const route = routeGameStudioWork(createTemplate("topdown"), {
    track: "creation",
    prompt: "Build a story-driven adventure with NPC dialogue, character continuity, quests, environmental storytelling, and a branching ending.",
  });
  assert.equal(route.context.narrative.included, true);
  assert.equal(route.context.narrative.selectionSource, "authored-signals");
  assert.ok(route.context.narrative.score >= route.context.narrative.threshold);
  assert.ok(route.route.some((step) => step.capabilityId === "narrative-design"));
  assert.ok(route.agentPlan.some((agent) => agent.agentId === "narrative-designer" && agent.receiptRequired));
  assert.ok(route.agentPlan.some((agent) => agent.agentId === "narrator-dialogue-writer" && agent.receiptRequired));
  assert.deepEqual(route.context.narrative.specialistIds, ["narrative-designer", "narrator-dialogue-writer"]);
  assert.equal(route.productionPlan.narrative.roles.length, 2);
  assert.match(route.productionPlan.narrative.boundary, /stable gameplay, quest, dialogue, progression, or ending state IDs/i);
  assert.equal(route.agentExecution.providerInvocationsPerIteration, 1);
});

test("mechanics-first work omits narrative scope unless explicitly included", () => {
  const project = createTemplate("platformer");
  const automatic = routeGameStudioWork(project, { track: "gameplay", prompt: "Tune jump arcs, coyote time, collision response, and time-trial scoring." });
  assert.equal(automatic.context.narrative.included, false);
  assert.equal(automatic.agentPlan.some((agent) => agent.agentId === "narrative-designer"), false);
  assert.equal(automatic.agentPlan.some((agent) => agent.agentId === "narrator-dialogue-writer"), false);

  const included = routeGameStudioWork(project, { track: "gameplay", narrativeMode: "include", prompt: "Tune the same mechanics." });
  assert.equal(included.context.narrative.included, true);
  assert.equal(included.context.narrative.selectionSource, "explicit-include");
  assert.ok(included.agentPlan.some((agent) => agent.agentId === "narrator-dialogue-writer"));

  const excluded = selectNarrativeSupport(project, { narrativeMode: "exclude", prompt: "Add NPC dialogue, lore, and multiple endings." });
  assert.equal(excluded.included, false);
  assert.equal(excluded.selectionSource, "explicit-exclude");
});

test("actor-bearing work automatically routes deterministic actor-system expertise", () => {
  const project = createTemplate("topdown");
  project.actorProgram = { schemaVersion: "looplab-actor-program/v1", enabled: true, actors: [{ id: "guard" }], acceptanceTestIds: [] };
  const route = routeGameStudioWork(project, { track: "gameplay", prompt: "Improve this authored encounter." });
  assert.ok(route.route.some((step) => step.capabilityId === "deterministic-actor-systems"));
  const specialist = route.agentPlan.find((agent) => agent.agentId === "actor-systems-designer");
  assert.equal(specialist?.executor, "selected-provider");
  assert.ok(specialist?.capabilityIds.includes("deterministic-actor-systems"));
  assert.match(specialist?.instruction ?? "", /authored objects, colliders, support height, and navigation/i);
});

test("Auto selects Phaser when its native 2D tooling is likely to improve a new game", () => {
  const project = createTemplate("platformer");
  const route = routeGameStudioWork(project, {
    track: "creation",
    framework: "auto",
    prompt: "Build a multi-scene platformer with Tiled tilemaps, camera follow, sprite animation, and Arcade Physics overlaps.",
  });
  const capabilityIds = route.route.map((step) => step.capabilityId);
  assert.equal(route.schemaVersion, LOOPLAB_GAME_STUDIO_PLAN_SCHEMA);
  assert.equal(route.runtimeSelection.schemaVersion, LOOPLAB_RUNTIME_SELECTION_POLICY.schemaVersion);
  assert.equal(route.runtimeSelection.selectedFramework, "phaser");
  assert.equal(route.runtimeSelection.recommendedFramework, "phaser");
  assert.equal(route.runtimeSelection.selectionSource, "automatic-quality-fit");
  assert.equal(route.runtimeSelection.singleFile.required, true);
  assert.equal(route.runtimeSelection.singleFile.compatible, true);
  assert.equal(route.runtimeSelection.singleFile.delivery, "inline-script-tag");
  assert.ok(capabilityIds.includes("phaser-core"));
  assert.ok(capabilityIds.includes("phaser-2d-game"));
  assert.ok(capabilityIds.includes("phaser-arcade-physics"));
  assert.equal(route.productionPlan.programOwned, true);
  assert.equal(route.productionPlan.externalSkillRequired, false);
  assert.equal(route.productionPlan.supplementsExistingArchitecture, true);
  assert.equal(route.productionPlan.playtest.executor, "playwright");
  assert.match(route.boundaries.packaging, /one offline HTML file/i);
});

test("Single-file delivery is not a negative engine signal", () => {
  const runtime = selectGameRuntime(createTemplate("platformer"), {
    track: "creation",
    framework: "auto",
    singleFile: true,
    prompt: "Create a tilemap platformer with scene transitions, camera shake, and animated sprite atlases.",
  });
  assert.equal(runtime.selectedFramework, "phaser");
  assert.equal(runtime.singleFile.compatible, true);
  assert.match(runtime.singleFile.rule, /never disqualifies a release-ready adapter/i);
  assert.ok(runtime.signals.every((signal) => signal.id !== "single-file-penalty"));
});

test("Auto preserves an existing runtime during improvement while exposing a better-fit migration", () => {
  const project = createTemplate("platformer");
  const automatic = selectGameRuntime(project, {
    track: "gameplay",
    framework: "auto",
    prompt: "Add Tiled tilemaps, multiple scenes, camera follow, and sprite animation.",
  });
  assert.equal(automatic.currentProjectFramework, "canvas");
  assert.equal(automatic.recommendedFramework, "phaser");
  assert.equal(automatic.selectedFramework, "canvas");
  assert.equal(automatic.selectionSource, "existing-project-stability");
  assert.equal(automatic.migrationRequiresOptIn, true);

  const explicit = selectGameRuntime(project, {
    track: "gameplay",
    framework: "phaser",
    prompt: "Add Tiled tilemaps, multiple scenes, camera follow, and sprite animation.",
  });
  assert.equal(explicit.selectedFramework, "phaser");
  assert.equal(explicit.selectionSource, "explicit-runtime-control");
  assert.equal(explicit.explicitOverride, true);
});

test("Custom dimetric depth keeps Canvas unless another Phaser benefit wins", () => {
  const runtime = selectGameRuntime(createTemplate("dimetric"), {
    track: "creation",
    framework: "auto",
    prompt: "Build a dimetric 2:1 underpass with authored world z and deterministic depth slices.",
  });
  assert.equal(runtime.recommendedFramework, "canvas");
  assert.equal(runtime.selectedFramework, "canvas");
  assert.ok(runtime.signals.some((signal) => signal.id === "authored-dimetric-depth"));
});

test("Canvas, Phaser, PixiJS, and melonJS decision knowledge and adapters are native", () => {
  assert.deepEqual(Object.keys(LOOPLAB_RUNTIME_KNOWLEDGE).filter((key) => ["canvas", "phaser", "pixi", "melon"].includes(key)), ["canvas", "phaser", "pixi", "melon"]);
  for (const framework of ["canvas", "phaser", "pixi", "melon"]) {
    assert.ok(LOOPLAB_RUNTIME_KNOWLEDGE[framework].chooseWhen.length > 0);
    assert.ok(LOOPLAB_RUNTIME_KNOWLEDGE[framework].strengths.length > 0);
    assert.ok(LOOPLAB_RUNTIME_KNOWLEDGE[framework].costs.length > 0);
    assert.ok(LOOPLAB_RUNTIME_KNOWLEDGE[framework].absorbNatively.length > 0);
  }

  const pixi = selectGameRuntime(createTemplate("blank"), { track: "creation", framework: "pixi", prompt: "A renderer-first particle field with filters and thousands of sprites." });
  assert.equal(pixi.bestFitFramework, "pixi");
  assert.equal(pixi.selectedFramework, "pixi");
  assert.equal(pixi.requestedUnavailableFramework, null);
  assert.equal(pixi.adapterAvailability.pixi.status, "available");
  assert.equal(pixi.singleFile.delivery, "inline-umd-with-official-csp-polyfill");

  const melon = selectGameRuntime(createTemplate("blank"), { track: "creation", framework: "melon", prompt: "Import a Tiled TMX world with orthogonal object layers and entity pooling." });
  assert.equal(melon.bestFitFramework, "melon");
  assert.equal(melon.selectedFramework, "melon");
  assert.equal(melon.requestedUnavailableFramework, null);
  assert.equal(melon.singleFile.delivery, "tree-shaken-inline-iife");
});

test("the dedicated runtime command applies every release-ready one-file adapter atomically", () => {
  const expectations = {
    canvas: { delivery: "built-in-inline", owner: "looplab-canvas", version: undefined },
    phaser: { delivery: "inline-script-tag", owner: "phaser", version: "3.90.0" },
    pixi: { delivery: "inline-umd-with-official-csp-polyfill", owner: "pixi", version: "8.19.0" },
    melon: { delivery: "tree-shaken-inline-iife", owner: "melon", version: "17.4.0" },
  };
  for (const [framework, expected] of Object.entries(expectations)) {
    const outcome = applyAgentCommand(createTemplate("platformer"), { op: "set_runtime_profile", framework, reason: "Measured runtime fit" });
    assert.equal(outcome.project.runtimeProfile.framework, framework);
    assert.equal(outcome.project.release.engineDelivery, expected.delivery);
    assert.equal(outcome.project.release.runtimeBundleEmbedded, true);
    assert.equal(outcome.result.primaryFrameOwner, expected.owner);
    assert.equal(outcome.result.version, expected.version);
  }
  assert.throws(() => applyAgentCommand(createTemplate("platformer"), { op: "set_runtime_profile", framework: "three" }), /canvas, phaser, pixi, or melon/i);
});

test("Auto can select PixiJS or melonJS for a new game when their concrete signals win", () => {
  const pixi = selectGameRuntime(createTemplate("blank"), {
    track: "creation",
    framework: "auto",
    prompt: "Build a renderer-first field with thousands of sprites, render groups, particle systems, filters, and WebGL batching.",
  });
  assert.equal(pixi.recommendedFramework, "pixi");
  assert.equal(pixi.selectedFramework, "pixi");
  assert.equal(pixi.selectionSource, "automatic-quality-fit");

  const melon = selectGameRuntime(createTemplate("blank"), {
    track: "creation",
    framework: "auto",
    prompt: "Use a Tiled TMX workflow with orthogonal object layers, a level loader, and entity pooling.",
  });
  assert.equal(melon.recommendedFramework, "melon");
  assert.equal(melon.selectedFramework, "melon");
  assert.equal(melon.selectionSource, "automatic-quality-fit");
});

test("work routing is strictly 2D even when a caller asks for a 3D stack", () => {
  const route = routeGameStudioWork(createTemplate("platformer"), {
    track: "creation",
    dimension: "3d",
    framework: "three",
    prompt: "Turn this into a Three.js GLB game",
  });
  const capabilityIds = route.route.map((step) => step.capabilityId);
  assert.equal(route.context.dimension, "2d");
  assert.equal(route.context.framework, "canvas");
  assert.match(route.context.scopeCorrection, /2D HTML games only/i);
  assert.equal(route.productScope.dimension, "2d");
  assert.ok(route.productScope.includes.includes("dimetric/isometric 2.5D"));
  assert.ok(capabilityIds.includes("canvas-2d-performance"));
  assert.ok(capabilityIds.every((id) => !/three|3d|gltf|glb/i.test(id)));
});

test("static and dynamic manifests expose the same roster identity and executors", async () => {
  const dynamic = getAgentManifest().specialistAgents;
  const staticManifest = JSON.parse(await readFile(new URL("../public/agent-manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(
    staticManifest.specialistAgents.roster.map(({ id, executor }) => ({ id, executor })),
    dynamic.roster.map(({ id, executor }) => ({ id, executor })),
  );
  assert.equal(staticManifest.specialistAgents.providerInvocationsPerIteration, dynamic.providerInvocationsPerIteration);
  assert.equal(staticManifest.specialistAgents.independentAgentProcesses, dynamic.independentAgentProcesses);
  assert.deepEqual(staticManifest.productScope, getAgentManifest().productScope);
});

test("mouse UI, headless route, and durable Codex/Claude loops share runtime and narrative preferences", async () => {
  const [page, companion, loop, agentCli] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/looplab-companion.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/looplab-loop.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/looplab-agent.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(page, /aria-label="2D runtime routing"/);
  assert.match(page, /framework: activeRuntimePreference/);
  assert.match(page, /runtimeSelection: activeAgentRoute\.runtimeSelection/);
  assert.match(companion, /"--framework", runtimePreference/);
  assert.match(companion, /"--narrative", narrativeMode/);
  assert.match(loop, /option\("--framework", "auto"\)/);
  assert.match(loop, /option\("--narrative", "auto"\)/);
  assert.match(loop, /capabilityRoute\.runtimeSelection/);
  assert.match(loop, /capabilityRoute\.context\.narrative/);
  assert.match(agentCli, /--narrative auto\|include\|exclude/);
  assert.match(page, /narrativeMode: command\.narrativeMode/);

  const manifest = getAgentManifest();
  const routeContract = manifest.commandContracts.commands.find((contract) => contract.op === "route_work");
  const buildContract = manifest.commandContracts.commands.find((contract) => contract.op === "start_ai_build");
  assert.deepEqual(routeContract.inputSchema.properties.framework.enum, ["auto", "canvas", "phaser", "pixi", "melon"]);
  assert.deepEqual(buildContract.inputSchema.properties.framework.enum, ["auto", "canvas", "phaser", "pixi", "melon"]);
  assert.deepEqual(routeContract.inputSchema.properties.narrativeMode.enum, ["auto", "include", "exclude"]);
  assert.deepEqual(buildContract.inputSchema.properties.narrativeMode.enum, ["auto", "include", "exclude"]);
  assert.equal(manifest.specialistAgents.runtimeSelectionPolicy.schemaVersion, LOOPLAB_RUNTIME_SELECTION_POLICY.schemaVersion);
  assert.equal(manifest.gameStudioProductionPlan.schemaVersion, LOOPLAB_GAME_STUDIO_PLAN_SCHEMA);
  assert.ok(manifest.gameStudioProductionPlan.parity.includes("Claude CLI"));
  assert.ok(manifest.gameStudioProductionPlan.parity.includes("MCP browser"));
  assert.match(manifest.installedSkills.integrationPolicy, /never require asking Codex/i);
});

test("static and dynamic manifests expose the bounded iteration ledger", async () => {
  const dynamic = getAgentManifest();
  const staticManifest = JSON.parse(await readFile(new URL("../public/agent-manifest.json", import.meta.url), "utf8"));
  assert.equal(staticManifest.protocolVersion, dynamic.protocolVersion);
  assert.deepEqual(staticManifest.iterationLedger.commands, dynamic.iterationLedger.commands);
  assert.equal(staticManifest.iterationLedger.historyLimit, 50);
  assert.equal(staticManifest.iterationLedger.snapshotLimit, 12);
  for (const command of dynamic.iterationLedger.commands) assert.ok(dynamic.commands.includes(command));
});

test("provider response schema requires concise specialist coverage receipts", async () => {
  const schema = JSON.parse(await readFile(new URL("../agent/iteration-schema.json", import.meta.url), "utf8"));
  assert.ok(schema.required.includes("agentReviews"));
  assert.deepEqual(schema.properties.agentReviews.items.properties.verdict.enum, ["proceed", "revise", "block"]);
  assert.equal(schema.properties.agentReviews.items.additionalProperties, false);
  assert.deepEqual(schema.properties.commands.items.required, ["op", "argumentsJson"]);
  assert.equal(schema.properties.commands.items.additionalProperties, false);
  assert.equal(schema.properties.commands.items.properties.argumentsJson.type, "string");
  assert.ok(schema.properties.commands.items.properties.op.enum.includes("set_narrative_contract"));
  assert.ok(schema.properties.commands.items.properties.op.enum.includes("remove_narrative_contract"));
});
