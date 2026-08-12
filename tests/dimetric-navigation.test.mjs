import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  applyAgentCommand,
  buildStandaloneHtml,
  createTemplate,
  getAgentManifest,
  validateProject,
} from "../lib/looplab-agent-core.mjs";
import {
  analyzeNavigationMap,
  authoredRouteDocumentDigest,
  createNavigationModel,
  exportPathEditorNavigation,
  findNavigationPath,
  importPathEditorNavigation,
  summarizeAuthoredRouteDocument,
} from "../lib/looplab-navigation.mjs";
import { canonicalJson } from "../lib/looplab-canonical-digest.mjs";
import { doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";
import {
  normalizeProjection,
  screenToWorld,
  worldToScreen,
} from "../lib/looplab-spatial.mjs";

const DIMETRIC = normalizeProjection({
  type: "dimetric-2:1",
  tileWidth: 128,
  tileHeight: 64,
  elevationStep: 32,
  originX: 480,
  originY: 96,
  worldUnitsPerTile: 128,
});

const RICH_ROUTE = {
  id: "city-activity-test",
  version: 1,
  loopMs: 4000,
  canvas: { width: 1280, height: 720 },
  atlas: { sha256: "atlas-original" },
  animations: {
    courier_idle: { frameMs: 120, direction: "right", anchor: [0.5, 1], frames: [0, 1] },
    courier_run: { frameMs: 80, direction: "right", anchor: [0.5, 1], frames: [2, 3, 4] },
  },
  actors: [
    {
      id: "courier",
      name: "Courier",
      facing: 90,
      depthBias: 0.04,
      schedule: [
        { kind: "move", fromMs: 0, toMs: 2000, from: [120, 300, 0], to: [620, 300, 4], animation: "courier_run", facing: "east", event: "enter-deck", depthZ: 4 },
        { kind: "wait", fromMs: 2000, toMs: 2600, at: [620, 300, 4], animation: "courier_idle", facing: "south" },
        { kind: "move", fromMs: 2600, toMs: 4000, from: [620, 300, 4], to: [1100, 500, 0], animation: "courier_run", event: "exit-deck" },
      ],
    },
    { id: "guide", name: "Guide", facing: "west", depthBias: 0.02, schedule: [{ kind: "wait", fromMs: 0, toMs: 4000, at: [620, 300, 4], animation: "courier_idle" }] },
  ],
  meetings: [{ id: "handoff", actorIds: ["courier", "guide"], at: [620, 300, 4], fromMs: 2100, toMs: 2400, maxDistance: 24 }],
  sampleFrames: [{ atMs: 1000, rgbaSha256: "frame-original" }],
};

test("exact 128x64 dimetric projection is reversible for authored world x/y/z", () => {
  const origin = worldToScreen({ x: 0, y: 0, z: 0 }, DIMETRIC);
  const east = worldToScreen({ x: 128, y: 0, z: 0 }, DIMETRIC);
  const south = worldToScreen({ x: 0, y: 128, z: 0 }, DIMETRIC);
  const raised = worldToScreen({ x: 128, y: 0, z: 2 }, DIMETRIC);

  assert.deepEqual(origin, { x: 480, y: 96 });
  assert.deepEqual(east, { x: 544, y: 128 });
  assert.deepEqual(south, { x: 416, y: 128 });
  assert.deepEqual(raised, { x: 544, y: 64 });
  assert.deepEqual(screenToWorld(raised, DIMETRIC, 2), { x: 128, y: 0, z: 2 });
});

test("layered A* honors costs and one-way authored links", () => {
  const navigation = createNavigationModel({
    activeLayerId: "ground",
    layers: [
      { id: "ground", name: "Ground route", color: "#555555", zMin: 0, zMax: 1 },
      { id: "deck", name: "Viaduct deck", color: "#777777", zMin: 4, zMax: 5 },
    ],
    nodes: [
      { id: "a", x: 0, y: 0, z: 0, layerId: "ground", destinationId: "start" },
      { id: "b", x: 100, y: 0, z: 0, layerId: "ground" },
      { id: "c", x: 200, y: 0, z: 0, layerId: "ground", destinationId: "finish" },
      { id: "deck-a", x: 0, y: 0, z: 4, layerId: "deck" },
    ],
    links: [
      { id: "a-b", a: "a", b: "b", layerId: "ground", cost: 1, oneWay: true },
      { id: "b-c", a: "b", b: "c", layerId: "ground", cost: 1, oneWay: false },
      { id: "a-c-expensive", a: "a", b: "c", layerId: "ground", cost: 3, oneWay: false },
    ],
  });

  const forward = findNavigationPath(navigation, "a", "c", { layerIds: ["ground"] });
  assert.equal(forward.ok, true);
  assert.deepEqual(forward.nodeIds, ["a", "b", "c"]);

  const reverseWithoutDirect = findNavigationPath({
    ...navigation,
    links: navigation.links.filter((link) => link.id !== "a-c-expensive"),
  }, "c", "a", { layerIds: ["ground"] });
  assert.equal(reverseWithoutDirect.ok, false);
  assert.equal(reverseWithoutDirect.reason, "disconnected");
});

test("A* remains admissible when authored link multipliers are below one", () => {
  const navigation = createNavigationModel({
    nodes: [
      { id: "start", x: 0, y: 0, z: 0 },
      { id: "detour", x: 0, y: 100, z: 0 },
      { id: "finish", x: 10, y: 0, z: 0 },
    ],
    links: [
      { id: "direct", a: "start", b: "finish", cost: 1, oneWay: false },
      { id: "cheap-a", a: "start", b: "detour", cost: 0.01, oneWay: false },
      { id: "cheap-b", a: "detour", b: "finish", cost: 0.01, oneWay: false },
    ],
  });

  const route = findNavigationPath(navigation, "start", "finish");
  assert.equal(route.ok, true);
  assert.deepEqual(route.nodeIds, ["start", "detour", "finish"]);
  assert.ok(route.cost < 3, `expected the cheap route, received cost ${route.cost}`);
});

test("navigation validation catches authored links crossing blocked ground", () => {
  const map = {
    id: "map-blocked-test",
    width: 640,
    height: 360,
    navigation: {
      layers: [{ id: "ground", name: "Ground", color: "#555555", zMin: 0, zMax: 1 }],
      nodes: [
        { id: "left", x: 80, y: 180, z: 0, layerId: "ground" },
        { id: "right", x: 560, y: 180, z: 0, layerId: "ground" },
      ],
      links: [{ id: "through-wall", a: "left", b: "right", layerId: "ground", cost: 1 }],
      areas: [{
        id: "wall",
        name: "Building footprint",
        kind: "blocked",
        layerId: "ground",
        zMin: 0,
        zMax: 1,
        points: [{ x: 260, y: 100 }, { x: 380, y: 100 }, { x: 380, y: 260 }, { x: 260, y: 260 }],
      }],
    },
  };
  const report = analyzeNavigationMap(map);
  assert.ok(report.issues.some((issue) => issue.code === "navigation-blocked-link" && issue.linkId === "through-wall"));
});

test("blocked-link validation catches a thin polygon between sparse sample positions", () => {
  const report = analyzeNavigationMap({
    id: "map-thin-blocker",
    width: 1000,
    height: 500,
    navigation: {
      layers: [{ id: "ground", name: "Ground", color: "#555555", zMin: 0, zMax: 1 }],
      nodes: [
        { id: "left", x: 0, y: 250, z: 0, layerId: "ground" },
        { id: "right", x: 1000, y: 250, z: 0, layerId: "ground" },
      ],
      links: [{ id: "thin-crossing", a: "left", b: "right", layerId: "ground", cost: 1 }],
      areas: [{ id: "thin-wall", name: "Thin wall", kind: "blocked", layerId: "ground", zMin: 0, zMax: 1, points: [
        { x: 331, y: 200, z: 0 }, { x: 334, y: 200, z: 0 }, { x: 334, y: 300, z: 0 }, { x: 331, y: 300, z: 0 },
      ] }],
    },
  });
  assert.ok(report.issues.some((issue) => issue.code === "navigation-blocked-link" && issue.linkId === "thin-crossing"));
});

test("independent elevation layers and named one-way destinations are intentional", () => {
  const report = analyzeNavigationMap({
    id: "map-layered",
    width: 640,
    height: 360,
    navigation: {
      layers: [
        { id: "ground", name: "Ground", color: "#555555", zMin: 0, zMax: 1 },
        { id: "deck", name: "Deck", color: "#777777", zMin: 4, zMax: 5 },
      ],
      nodes: [
        { id: "g1", x: 80, y: 180, z: 0, layerId: "ground" },
        { id: "g2", x: 260, y: 180, z: 0, layerId: "ground", destinationId: "ground-exit" },
        { id: "d1", x: 80, y: 180, z: 4, layerId: "deck" },
        { id: "d2", x: 260, y: 180, z: 4, layerId: "deck", destinationId: "deck-exit" },
      ],
      links: [
        { id: "ground-link", a: "g1", b: "g2", layerId: "ground", oneWay: false },
        { id: "deck-link", a: "d1", b: "d2", layerId: "deck", oneWay: true },
      ],
    },
  });
  assert.equal(report.issues.some((issue) => issue.code === "navigation-components"), false);
  assert.equal(report.issues.some((issue) => issue.code === "navigation-one-way-dead-end"), false);
  assert.equal(report.issues.some((issue) => issue.code === "navigation-height-ambiguity"), false);
});

test("Path Editor v2 percentage data imports into current map world bounds", () => {
  const imported = importPathEditorNavigation({
    version: 2,
    layers: [{ id: "ground", name: "Ground", color: "#555555" }],
    nodes: [
      { id: "start", x: 10, y: 20, dest: "start-gate" },
      { id: "finish", x: 90, y: 80, dest: "finish-gate" },
    ],
    edges: [{ id: "route", a: "start", b: "finish", layer: "ground", cost: 1.5, oneWay: true }],
    areas: [{ id: "plaza", name: "Plaza", kind: "walkable", points: [[5, 10], [95, 10], [95, 90], [5, 90]] }],
  }, { width: 1000, height: 500 });

  assert.deepEqual(imported.nodes[0], { id: "start", x: 100, y: 100, z: 0, destinationId: "start-gate" });
  assert.deepEqual(imported.nodes[1], { id: "finish", x: 900, y: 400, z: 0, destinationId: "finish-gate" });
  assert.equal(imported.links[0].oneWay, true);
  assert.equal(imported.links[0].cost, 1.5);
  assert.deepEqual(imported.areas[0].points[2], { x: 950, y: 450, z: 0 });
});

test("Path Editor round trip preserves projection and raised route heights", () => {
  const original = createNavigationModel({
    activeLayerId: "deck",
    layers: [
      { id: "ground", name: "Ground", color: "#55555f", zMin: 0, zMax: 1 },
      { id: "deck", name: "Deck", color: "#777783", zMin: 4, zMax: 5 },
    ],
    nodes: [
      { id: "under", x: 400, y: 220, z: 0, layerId: "ground", destinationId: "underpass" },
      { id: "high", x: 400, y: 220, z: 4, layerId: "deck", destinationId: "viaduct" },
      { id: "high-end", x: 640, y: 300, z: 4, layerId: "deck" },
    ],
    links: [{ id: "deck-link", a: "high", b: "high-end", layerId: "deck", cost: 0.75, oneWay: true }],
    areas: [{ id: "deck-area", name: "Deck", kind: "walkable", layerId: "deck", zMin: 4, zMax: 5, points: [
      { x: 320, y: 160, z: 4 }, { x: 720, y: 160, z: 4 }, { x: 720, y: 360, z: 4 }, { x: 320, y: 360, z: 4 },
    ] }],
  });
  const projection = { ...DIMETRIC, type: "dimetric-2:1" };
  const exported = exportPathEditorNavigation(original, { id: "district", width: 1000, height: 500, projection });
  const imported = importPathEditorNavigation(exported, { width: 1000, height: 500, projection: { type: "orthographic" } });

  assert.equal(exported.looplab.coordinatePolicy, "path-editor-percent-xy+looplab-world-z");
  assert.equal(exported.looplab.projection.type, "dimetric-2:1");
  assert.deepEqual(imported.layers.map((layer) => [layer.id, layer.zMin, layer.zMax]), [["ground", 0, 1], ["deck", 4, 5]]);
  assert.deepEqual(imported.nodes.map((node) => [node.id, node.x, node.y, node.z, node.layerId]), [
    ["under", 400, 220, 0, "ground"],
    ["high", 400, 220, 4, "deck"],
    ["high-end", 640, 300, 4, "deck"],
  ]);
  assert.deepEqual(imported.areas[0].points[0], { x: 320, y: 160, z: 4 });
  assert.equal(imported.areas[0].zMin, 4);
  assert.equal(imported.links[0].cost, 0.75);
  const restoredProject = applyAgentCommand(createTemplate("topdown"), { op: "import_path_editor_navigation", data: exported }).project;
  assert.equal(restoredProject.projection.type, "dimetric-2:1");
  assert.equal(restoredProject.navigation.nodes.find((node) => node.id === "high").z, 4);
});

test("authored route documents use canonical SHA-256 independent of object key order", () => {
  const reordered = { sampleFrames: RICH_ROUTE.sampleFrames, meetings: RICH_ROUTE.meetings, actors: RICH_ROUTE.actors, animations: RICH_ROUTE.animations, atlas: RICH_ROUTE.atlas, canvas: RICH_ROUTE.canvas, loopMs: RICH_ROUTE.loopMs, version: RICH_ROUTE.version, id: RICH_ROUTE.id };
  const expected = `sha256:${createHash("sha256").update(canonicalJson(RICH_ROUTE)).digest("hex")}`;
  assert.equal(authoredRouteDocumentDigest(RICH_ROUTE), expected);
  assert.equal(authoredRouteDocumentDigest(reordered), expected);
  assert.match(expected, /^sha256:[a-f0-9]{64}$/);
});

test("rich timed routes survive Path Editor round trips and only material edits stale evidence", () => {
  let project = applyAgentCommand(createTemplate("topdown"), {
    op: "set_authored_route_document",
    data: RICH_ROUTE,
    sourceFormat: "city-activity-v1",
    coordinateSpace: "source-pixels",
  }).project;
  const initial = project.navigation.authoredRoute;
  const initialSummary = summarizeAuthoredRouteDocument(initial);
  assert.equal(initialSummary.actorCount, 2);
  assert.equal(initialSummary.scheduleSteps, 4);
  assert.equal(initialSummary.meetingCount, 1);
  assert.equal(initialSummary.hashStatus, "preserved");
  assert.equal(initialSummary.digestAlgorithm, "sha256-jcs-v1");
  assert.match(initialSummary.currentDigest, /^sha256:[a-f0-9]{64}$/);

  const portable = exportPathEditorNavigation(project.navigation, { id: "city", width: 1280, height: 720 });
  assert.equal(portable.looplab.version, 2);
  assert.deepEqual(portable.looplab.authoredRoute.data, RICH_ROUTE);
  const restored = importPathEditorNavigation(portable, { width: 1280, height: 720 });
  assert.deepEqual(restored.authoredRoute.data, RICH_ROUTE);
  assert.deepEqual(restored.authoredRoute.integrity, initial.integrity);

  const noOp = applyAgentCommand(project, { op: "update_authored_route_step", actorId: "courier", stepIndex: 0, changes: { fromMs: 0 } });
  assert.equal(noOp.changed, false);
  assert.equal(noOp.result.changed, false);
  assert.equal(noOp.project.navigation.authoredRoute.integrity.revision, 0);
  assert.equal(noOp.project.navigation.authoredRoute.integrity.hashStatus, "preserved");

  const edited = applyAgentCommand(project, { op: "update_authored_route_step", actorId: "courier", stepIndex: 0, changes: { fromMs: 100, facing: "north-east" } });
  project = edited.project;
  assert.equal(edited.changed, true);
  assert.equal(project.navigation.authoredRoute.integrity.revision, 1);
  assert.equal(project.navigation.authoredRoute.integrity.hashStatus, "stale");
  assert.equal(project.navigation.authoredRoute.data.meetings[0].id, "handoff");
  assert.equal(project.navigation.authoredRoute.data.actors[0].schedule[0].animation, "courier_run");
  assert.equal(project.navigation.authoredRoute.data.actors[0].schedule[0].event, "enter-deck");
  assert.equal(project.navigation.authoredRoute.data.actors[0].schedule[0].depthZ, 4);
  assert.equal(validateProject(project).valid, true);

  const currentDigest = project.navigation.authoredRoute.integrity.currentDigest;
  const preservedReceipts = project.navigation.authoredRoute.integrity.hashes.map((receipt) => ({ ...receipt, source: "combined" }));
  project = applyAgentCommand(project, { op: "verify_authored_route_document", currentDigest, kind: "combined", hashes: preservedReceipts }).project;
  assert.equal(project.navigation.authoredRoute.integrity.hashStatus, "verified");
  assert.equal(project.navigation.authoredRoute.integrity.verifiedDigest, currentDigest);

  const changedReceipts = preservedReceipts.map((receipt, index) => index === 0 ? { ...receipt, value: `${receipt.value}-changed` } : receipt);
  assert.throws(() => applyAgentCommand(edited.project, { op: "verify_authored_route_document", currentDigest, kind: "deterministic-replay", hashes: changedReceipts }), /simVersion and a versionLog reason/);
  const rerecorded = applyAgentCommand(edited.project, { op: "verify_authored_route_document", currentDigest, kind: "deterministic-replay", hashes: changedReceipts, simVersion: "route-sim-2", versionLog: [{ reason: "Intentional route timing change validated against the updated replay." }] });
  assert.equal(rerecorded.project.navigation.authoredRoute.integrity.hashStatus, "verified");
  assert.equal(rerecorded.project.navigation.authoredRoute.integrity.simVersion, "route-sim-2");
});

test("rich route validation rejects non-numeric coordinates instead of silently coercing them to zero", () => {
  const invalid = structuredClone(RICH_ROUTE);
  invalid.actors[0].schedule[0].from = ["not-a-number", 300, 0];
  assert.throws(() => applyAgentCommand(createTemplate("topdown"), { op: "set_authored_route_document", data: invalid }), /non-finite route coordinate/);
});

test("headless mutation preconditions reject edits authored against stale project state", () => {
  const project = createTemplate("topdown");
  const expectedSourceDigest = doctorSourceDigest(project);
  const first = applyAgentCommand(project, { op: "add_object", kind: "coin", object: { id: "fresh-coin", x: 40, y: 40 }, expectedSourceDigest });
  assert.notEqual(doctorSourceDigest(first.project), expectedSourceDigest);
  assert.throws(() => applyAgentCommand(first.project, { op: "add_object", kind: "coin", object: { id: "stale-coin", x: 80, y: 40 }, expectedSourceDigest }), /\[stale-source\]/);
  assert.equal(first.project.objects.some((object) => object.id === "stale-coin"), false);
});

test("dimetric starter proves underpass, deck, traversal height, and depth slicing", () => {
  const project = createTemplate("dimetric");
  const map = project.maps[0];
  const groundNode = map.navigation.nodes.find((node) => node.id === "ground-under-a");
  const deckNode = map.navigation.nodes.find((node) => node.id === "deck-west");
  const deck = map.objects.find((object) => object.id === "raised-deck");

  assert.equal(validateProject(project).valid, true);
  assert.equal(project.projection.type, "dimetric-2:1");
  assert.equal(project.projection.tileWidth, 128);
  assert.equal(project.projection.tileHeight, 64);
  assert.deepEqual([groundNode.x, groundNode.y, groundNode.z], [deckNode.x, deckNode.y, 0]);
  assert.equal(deckNode.z, 4);
  assert.deepEqual(map.traversalPaths.map((path) => [path.id, path.routeLayer, path.points[0].z]), [
    ["ground-passage-route", "ground-route", 0],
    ["raised-passage-route", "deck-route", 4],
  ]);
  assert.equal(deck.collider.zMin, 4);
  assert.equal(deck.supportZ, 4);
  assert.equal(deck.depthSlices.length, 4);
  assert.deepEqual(deck.depthSlices.map((slice) => [slice.sourceY, slice.height]), [[0, 40], [40, 40], [80, 40], [120, 40]]);

  const added = applyAgentCommand(project, { op: "add_dimetric_map", id: "district-2", name: "District 2", activate: true });
  assert.equal(added.project.maps.length, 2);
  assert.equal(added.project.activeMapId, "district-2");
  assert.equal(added.project.projection.type, "dimetric-2:1");
});

test("headless API authors, validates, exports, and preserves per-map 2.5D data", () => {
  let project = createTemplate("topdown");
  const command = (input) => {
    const outcome = applyAgentCommand(project, input);
    project = outcome.project;
    return outcome;
  };

  command({ op: "set_map_projection", projection: DIMETRIC });
  command({ op: "add_navigation_layer", layer: { id: "ground", name: "Ground", color: "#555555", zMin: 0, zMax: 1 } });
  command({ op: "add_navigation_node", node: { id: "start", x: 160, y: 160, z: 0, layerId: "ground", destinationId: "start" } });
  command({ op: "add_navigation_node", node: { id: "finish", x: 560, y: 320, z: 0, layerId: "ground", destinationId: "finish" } });
  command({ op: "connect_navigation_nodes", id: "main-route", a: "start", b: "finish", layerId: "ground", cost: 1 });
  const tested = command({ op: "test_navigation_route", from: "start", to: "finish", layerIds: ["ground"] });

  assert.equal(tested.changed, false);
  assert.equal(tested.result.route.ok, true);
  assert.equal(validateProject(project).valid, true);
  assert.equal(project.maps[0].projection.type, "dimetric-2:1");
  assert.equal(project.maps[0].navigation.nodes.length, 2);

  const manifest = getAgentManifest();
  assert.equal(manifest.protocolVersion, "1.100.0");
  assert.ok(manifest.commands.includes("set_map_projection"));
  assert.ok(manifest.commands.includes("import_path_editor_navigation"));
  assert.ok(manifest.commands.includes("export_path_editor_navigation"));
  assert.ok(manifest.commands.includes("set_authored_route_document"));
  assert.ok(manifest.commands.includes("verify_authored_route_document"));
  assert.ok(manifest.commands.includes("add_dimetric_map"));
  assert.ok(manifest.templates.includes("dimetric"));
  assert.ok(manifest.exportedRuntime.methods.includes("getNavigation"));

  const html = buildStandaloneHtml(project);
  assert.match(html, /version:'2\.27\.0'/);
  assert.match(html, /looplab-runtime-ready'.+version:'2\.27\.0'/);
  assert.match(html, /get_navigation/);
  assert.match(html, /function worldToScreen/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);

  command({ op: "add_map", id: "map-deck", name: "Raised deck", activate: true });
  assert.equal(project.projection.type, "dimetric-2:1");
  assert.equal(project.navigation.nodes.length, 0);
  command({ op: "add_navigation_layer", layer: { id: "deck", name: "Raised deck", color: "#777777", zMin: 4, zMax: 5 } });
  command({ op: "switch_map", id: "map-main" });
  assert.equal(project.navigation.activeLayerId, "ground");
  assert.equal(project.navigation.nodes.length, 2);
  command({ op: "switch_map", id: "map-deck" });
  assert.equal(project.navigation.activeLayerId, "deck");
});

test("ground players cannot implicitly capture a raised traversal at the same x/y", () => {
  const player = {
    id: "player",
    kind: "player",
    name: "Skater",
    x: 100,
    y: 100,
    z: 0,
    supportZ: 0,
    width: 44,
    height: 58,
    color: "#555555",
    solid: false,
    collider: { enabled: true, offsetX: 6, offsetY: 4, width: 32, height: 54, trigger: false, oneWay: false, zMin: 0, zMax: 1 },
  };
  const map = {
    id: "map-main",
    name: "Underpass",
    width: 640,
    height: 360,
    background: "#d8d8d6",
    gravity: 0,
    grid: 16,
    controlMode: "topdown",
    projection: DIMETRIC,
    navigation: createNavigationModel(),
    objects: [player],
    traversalPaths: [{
      id: "deck-rail",
      name: "Viaduct deck rail",
      kind: "rail",
      collisionOwner: "authored-map",
      points: [{ x: 122, y: 158, z: 4 }, { x: 300, y: 158, z: 4 }],
      entryRadius: 12,
      entryZTolerance: 0.4,
      minimumEntrySpeed: 0,
      direction: "both",
      acceleration: 0,
      maximumSpeed: 300,
      exitImpulse: { x: 0, y: 0, z: 0 },
      transferPathIds: [],
      bailBehavior: "drop",
      routeLayer: "deck",
    }],
  };
  const runtime = createRuntimeModel({ ...map, activeMapId: map.id, startMapId: map.id, objects: map.objects, maps: [map] });
  runtime.drainEvents();

  runtime.setInput("KeyE", true);
  const groundEvents = runtime.update(1 / 60);
  assert.equal(runtime.getState().activeTraversalPathId, null);
  assert.equal(groundEvents.some((event) => event.type === "traversal.started"), false);

  runtime.setInput("KeyE", false);
  runtime.update(1 / 60);
  runtime.getObjects().find((object) => object.id === "player").z = 4;
  runtime.setInput("KeyE", true);
  const deckEvents = runtime.update(1 / 60);
  assert.equal(runtime.getState().activeTraversalPathId, "deck-rail");
  assert.ok(deckEvents.some((event) => event.type === "traversal.started" && event.pathId === "deck-rail"));
});
