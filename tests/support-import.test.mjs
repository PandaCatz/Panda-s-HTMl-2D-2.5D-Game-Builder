import assert from "node:assert/strict";
import test from "node:test";

import { analyzeSpatialProject } from "../lib/looplab-spatial.mjs";
import { applyAgentCommand, buildStandaloneHtml, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { extractProjectFromHtml } from "../lib/looplab-html-project.mjs";
import { generateSpritePixels } from "../lib/looplab-pixel-generator.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";
import { resolveSupportContact } from "../lib/looplab-support.mjs";

test("floor-standing props snap their visual anchor to authored ground without surrendering collision authority", () => {
  let project = createTemplate("platformer");
  project = applyAgentCommand(project, {
    op: "add_object",
    kind: "decor",
    object: {
      id: "vending-machine",
      name: "Vending machine",
      x: 880,
      y: 120,
      width: 64,
      height: 112,
      role: "vending-machine",
      requiresSupport: true,
      collider: { enabled: true, offsetX: 8, offsetY: 16, width: 48, height: 96, trigger: false, oneWay: false, zMin: 0, zMax: 2 },
      supportFootprint: { offsetX: 10, offsetY: 104, width: 44, height: 8 },
    },
  }).project;

  const before = analyzeSpatialProject(project);
  assert.ok(before.issues.some((issue) => issue.code === "support-missing" && issue.objectId === "vending-machine"));

  const attached = applyAgentCommand(project, { op: "attach_to_support", id: "vending-machine", mode: "auto" });
  project = attached.project;
  const object = project.objects.find((candidate) => candidate.id === "vending-machine");
  assert.equal(object.supportContact.mode, "surface");
  assert.equal(object.supportContact.surfaceId, "ground");
  assert.equal(object.anchorMode, "ground");
  assert.equal(object.collisionOwner, "authored-map");
  assert.equal(object.y + object.height, 520, "the visible ground anchor lands on the authored floor top");
  assert.equal(resolveSupportContact(project, object, [], { projection: project.projection }).valid, true);
  assert.ok(!analyzeSpatialProject(project).issues.some((issue) => issue.code.startsWith("support-") && issue.objectId === "vending-machine"));

  const drifted = applyAgentCommand(project, { op: "update_object", id: object.id, changes: { y: object.y - 7 } }).project;
  assert.ok(analyzeSpatialProject(drifted).issues.some((issue) => issue.code === "support-gap" && issue.objectId === "vending-machine"));
});

test("raised support surfaces set an independent route height for top-down and dimetric maps", () => {
  let project = createTemplate("topdown");
  project.projection = { type: "dimetric-2:1", tileWidth: 128, tileHeight: 64, elevationStep: 32, originX: 480, originY: 96 };
  project = applyAgentCommand(project, { op: "add_object", kind: "platform", object: { id: "viaduct-deck", name: "Viaduct deck", x: 300, y: 180, width: 240, height: 120, z: 4, supportZ: 4, collisionHeight: 1, role: "terrain", collider: { enabled: true, offsetX: 0, offsetY: 0, width: 240, height: 120, trigger: false, oneWay: false, zMin: 4, zMax: 5 } } }).project;
  project = applyAgentCommand(project, { op: "add_object", kind: "decor", object: { id: "deck-kiosk", name: "Deck kiosk", x: 360, y: 210, width: 60, height: 84, role: "kiosk", requiresSupport: true } }).project;
  project = applyAgentCommand(project, { op: "attach_to_support", id: "deck-kiosk", mode: "surface", surfaceId: "viaduct-deck" }).project;
  const kiosk = project.objects.find((object) => object.id === "deck-kiosk");
  assert.equal(kiosk.z, 5);
  assert.equal(kiosk.supportZ, 5);
  assert.equal(kiosk.supportContact.surfaceId, "viaduct-deck");
  assert.equal(resolveSupportContact(project, kiosk, [], { projection: project.projection }).valid, true);
});

test("standalone HTML embeds lossless project metadata that reopens every map as authored data", () => {
  const first = createTemplate("platformer");
  first.replay = { ...first.replay, cases: [] };
  first.acceptanceTests = [];
  let project = {
    ...first,
    name: "Maps </script> stay data",
    activeMapId: "map-a",
    maps: [
      { id: "map-a", name: "Plaza", width: first.width, height: first.height, background: first.background, gravity: first.gravity, grid: first.grid, controlMode: first.controlMode, objects: first.objects },
      { id: "map-b", name: "Underpass", width: first.width, height: first.height, background: "#20252a", gravity: first.gravity, grid: first.grid, controlMode: first.controlMode, objects: first.objects.map((object) => ({ ...object, id: `b-${object.id}` })) },
    ],
  };
  project = applyAgentCommand(project, { op: "connect_maps", sourceMapId: "map-a", targetMapId: "map-b" }).project;
  project = applyAgentCommand(project, { op: "connect_maps", sourceMapId: "map-b", targetMapId: "map-a", connectionRole: "route-return", reuseForwardExit: false }).project;
  const html = buildStandaloneHtml(project);
  assert.match(html, /id="looplab-project-data"/);
  assert.doesNotMatch(html, /Maps <\/script> stay data/);
  const imported = extractProjectFromHtml(html);
  assert.equal(imported.source, "looplab-metadata");
  assert.equal(imported.project.name, project.name);
  assert.deepEqual(imported.project.maps.map((map) => map.name), ["Plaza", "Underpass"]);
});

test("HTML import preserves literal entity text while retaining legacy entity-encoded metadata support", () => {
  const project = createTemplate("blank");
  project.name = "Literal &quot; and &amp; stay literal";
  const rawHtml = `<script id="looplab-project-data" type="application/json">${JSON.stringify(project)}</script>`;
  assert.equal(extractProjectFromHtml(rawHtml).project.name, project.name);

  const encodedJson = JSON.stringify({ ...project, name: "Legacy encoded metadata" })
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const legacyHtml = `<script id="looplab-project-state" type="application/json">${encodedJson}</script>`;
  assert.equal(extractProjectFromHtml(legacyHtml).project.name, "Legacy encoded metadata");
});

test("AI manifest exposes visual asset, HTML import, and support-contact commands", () => {
  const manifest = getAgentManifest();
  assert.ok(manifest.commands.includes("attach_to_support"));
  assert.ok(manifest.commands.includes("inspect_supports"));
  assert.ok(manifest.commands.includes("import_html"));
  assert.ok(manifest.commands.includes("update_asset"));
  assert.match(manifest.headlessResponses.compactMutationOption, /compact:true/);
  assert.deepEqual(manifest.visualAuthoring.assetGeneration.sprites.roles, ["hero", "enemy", "pickup", "prop", "effect", "ui"]);
  assert.deepEqual(manifest.visualAuthoring.assetGeneration.sprites.palettes, ["violet", "ember", "forest", "mono"]);
  assert.deepEqual(manifest.visualAuthoring.assetGeneration.sprites.sizes, [16, 32, 48, 64]);
  assert.deepEqual(manifest.visualAuthoring.assetGeneration.tilesets.sizes, [16, 32, 48, 64]);
});

test("set_project rejects the wrong payload shape instead of silently succeeding", () => {
  const project = createTemplate("platformer");
  assert.throws(
    () => applyAgentCommand(project, { op: "set_project", project: { name: "Wrong shape" } }),
    /set_project requires a changes object/,
  );
  const replaced = applyAgentCommand(project, { op: "replace_project", project: { ...project, name: "Replacement" } });
  assert.equal(replaced.project.name, "Replacement");
  assert.equal(replaced.result.replaced, true);
});

test("set_project cannot overwrite verification-owned, measured, coordination, or replay state", () => {
  const project = createTemplate("platformer");
  const forbidden = {
    release: { offlineVerified: true },
    performance: { lastP95FrameMs: 1 },
    qualityContracts: { canvas2d: { cappedDpr: true } },
    workstreams: [],
    replay: { version: "1", tickRate: 60, seed: 1, cases: [] },
  };
  for (const [field, value] of Object.entries(forbidden)) {
    assert.throws(() => applyAgentCommand(project, { op: "set_project", changes: { [field]: value } }), new RegExp(`set_project cannot change ${field}`));
  }
});

test("set_project atomically authors validated semantic input actions", () => {
  const project = createTemplate("topdown");
  const inputActions = [
    { id: "move-left", label: "Move left", bindings: ["ArrowLeft", "KeyA"], animationState: "travel", onboarding: true, replayEvent: true },
    { id: "action-chime", label: "Chime", bindings: ["KeyJ"], animationState: "chime", onboarding: true, replayEvent: true },
  ];
  const updated = applyAgentCommand(project, { op: "set_project", changes: { inputActions } });
  assert.deepEqual(updated.project.inputActions, inputActions);
  assert.deepEqual(updated.result.updated, ["inputActions"]);
  assert.equal(updated.validation.valid, true);
  assert.equal(getAgentManifest().inputAuthoring.field, "changes.inputActions");

  assert.throws(
    () => applyAgentCommand(project, { op: "set_project", changes: { inputActions: [{ ...inputActions[0], bindings: [] }] } }),
    /bindings must contain at least one binding/,
  );
  assert.throws(
    () => applyAgentCommand(project, { op: "set_project", changes: { inputActions: [inputActions[0], { ...inputActions[0] }] } }),
    /id duplicates move-left/,
  );
});

test("set_project merges partial movement tuning without deleting required defaults", () => {
  const project = createTemplate("topdown");
  const original = structuredClone(project.movementTuning);
  const updated = applyAgentCommand(project, {
    op: "set_project",
    changes: { movementTuning: { maxRunSpeed: 188, groundAcceleration: 1320 } },
  });

  assert.equal(updated.project.movementTuning.maxRunSpeed, 188);
  assert.equal(updated.project.movementTuning.groundAcceleration, 1320);
  assert.equal(updated.project.movementTuning.airAcceleration, original.airAcceleration);
  assert.equal(updated.project.movementTuning.jumpVelocity, original.jumpVelocity);
  assert.equal(updated.project.movementTuning.jumpBufferTicks, original.jumpBufferTicks);
  assert.equal(updated.validation.valid, true);
});

test("effects and UI strips use center anchors while game-world sprites retain ground anchors", () => {
  assert.equal(generateSpritePixels({ kind: "effect" }).anchorY, 0.5);
  assert.equal(generateSpritePixels({ kind: "ui" }).anchorY, 0.5);
  assert.equal(generateSpritePixels({ kind: "prop" }).anchorY, 1);
  assert.equal(generateSpritePixels({ kind: "hero" }).anchorY, 1);
});

test("headless asset patches stay compact, preserve stable ids, and never acquire collision authority", () => {
  let project = createTemplate("platformer");
  project = applyAgentCommand(project, {
    op: "add_asset",
    asset: {
      id: "grounded-prop",
      name: "Grounded prop",
      type: "sprite",
      dataUrl: "data:image/png;base64,AAAA",
      width: 32,
      height: 32,
      frameWidth: 32,
      frameHeight: 32,
      frames: 1,
      columns: 1,
      anchorX: 0.5,
      anchorY: 1,
      anchorMode: "ground",
      collisionPolicy: "authored-only",
    },
  }).project;
  const objectsBefore = structuredClone(project.objects);
  assert.equal(analyzeSpatialProject(project).issues.some((issue) => issue.code === "asset-ground-anchor" && issue.assetId === "grounded-prop"), false, "normalized anchorY=1 is a valid bottom contact");

  const misplaced = applyAgentCommand(project, { op: "update_asset", id: "grounded-prop", changes: { anchorY: 0.5 } });
  assert.equal(analyzeSpatialProject(misplaced.project).issues.some((issue) => issue.code === "asset-ground-anchor" && issue.assetId === "grounded-prop"), true, "a real mid-frame ground anchor still warns");

  const outcome = applyAgentCommand(project, { op: "update_asset", id: "grounded-prop", changes: { anchorY: 31 } });
  const updated = outcome.project.assets.find((asset) => asset.id === "grounded-prop");

  assert.equal(updated.anchorY, 31);
  assert.equal(updated.id, "grounded-prop");
  assert.equal(updated.collisionPolicy, "authored-only");
  assert.deepEqual(outcome.project.objects, objectsBefore);
  assert.equal(outcome.result.asset.dataUrl, undefined);
  assert.deepEqual(outcome.result.changedFields, ["anchorY"]);
  assert.equal(outcome.result.embeddedData.present, true);
  assert.equal(analyzeSpatialProject(outcome.project).issues.some((issue) => issue.code === "asset-ground-anchor" && issue.assetId === "grounded-prop"), false);
  assert.throws(() => applyAgentCommand(project, { op: "update_asset", id: "grounded-prop", changes: { id: "replacement" } }), /cannot change id/);
  assert.throws(() => applyAgentCommand(project, { op: "update_asset", id: "grounded-prop", changes: { collisionPolicy: "generated-art" } }), /cannot change collisionPolicy/);
});

test("map size changes keep coordinates authored and Doctor reports clipped or outside objects", () => {
  let project = createTemplate("platformer");
  project = applyAgentCommand(project, { op: "update_map", id: "map-main", changes: { width: 640, height: 360 } }).project;
  assert.equal(project.width, 640);
  assert.equal(project.height, 360);
  project = applyAgentCommand(project, { op: "add_object", kind: "decor", object: { id: "edge-sign", name: "Edge sign", x: 630, y: 100, width: 40, height: 40 } }).project;
  assert.ok(analyzeSpatialProject(project).issues.some((issue) => issue.code === "object-clipped-by-map" && issue.objectId === "edge-sign"));
  project = applyAgentCommand(project, { op: "update_object", id: "edge-sign", changes: { x: 700 } }).project;
  assert.ok(analyzeSpatialProject(project).issues.some((issue) => issue.code === "object-outside-map" && issue.objectId === "edge-sign"));
});

test("ordered map routes define the first experience and authored portal-to-spawn connections", () => {
  let project = createTemplate("platformer");
  project = applyAgentCommand(project, { op: "add_map", id: "map-two", name: "Map 2", map: { objects: [] } }).project;
  project = applyAgentCommand(project, { op: "connect_maps", sourceMapId: "map-main", targetMapId: "map-two" }).project;
  const firstConnection = project.maps.find((map) => map.id === "map-main").objects.find((object) => object.kind === "portal" && object.targetMapId === "map-two");
  const destinationSpawn = project.maps.find((map) => map.id === "map-two").objects.find((object) => object.kind === "spawn" && object.id === firstConnection.targetSpawnId);
  assert.ok(firstConnection);
  assert.ok(destinationSpawn);
  project = applyAgentCommand(project, { op: "connect_maps", sourceMapId: "map-two", targetMapId: "map-main", connectionRole: "route-return", reuseForwardExit: false }).project;
  assert.equal(analyzeSpatialProject(project).issues.some((issue) => issue.code === "map-unreachable" || issue.code === "map-route-gap"), false);

  project = applyAgentCommand(project, { op: "set_start_map", id: "map-two" }).project;
  assert.equal(project.startMapId, "map-two");
  assert.deepEqual(project.maps.map((map) => map.id), ["map-two", "map-main"]);
  assert.equal(createRuntimeModel(project).getState().activeMapId, "map-two");
});
