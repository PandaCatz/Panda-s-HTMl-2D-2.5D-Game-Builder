import test from "node:test";
import assert from "node:assert/strict";

import { acceptanceSpecDigest, getAcceptancePlan, LOOPLAB_ACCEPTANCE_RUNNER, runAcceptanceSuite } from "../lib/looplab-acceptance.mjs";
import { applyAgentCommand, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { analyzeProject, doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import { inspectVerbArchitecture } from "../lib/looplab-verb-architecture.mjs";

function acceptanceTest(id, expectedMapId = "map-main") {
  return {
    id,
    name: id,
    ownerId: "acceptance-owner",
    assertion: "The deterministic runtime reaches the expected map.",
    runner: LOOPLAB_ACCEPTANCE_RUNNER,
    driver: { tickRate: 60, tickCount: 1, startMapId: "map-main", inputs: [] },
    assertions: [{ id: `${id}-map`, target: "runtime-state", property: "activeMapId", operator: "equals", expected: expectedMapId }],
  };
}

function architecture(testId) {
  return {
    version: 1,
    status: "implemented",
    hypothesis: "Two authored actions alter traversal state together.",
    verbs: [
      { id: "orient", label: "Orient", category: "movement", status: "core", description: "Choose a route.", inputActionIds: ["move-up"], stateChanges: ["route changes"], implementationIds: ["move-up", "ground-route"], testIds: [testId] },
      { id: "bind", label: "Bind", category: "interaction", status: "core", description: "Bind a route.", inputActionIds: ["interact"], stateChanges: ["path changes"], implementationIds: ["interact", "ground-passage-route"], testIds: [testId] },
    ],
    pairEvaluations: [{ id: "pair-orient-bind", verbIds: ["orient", "bind"], synergy: 8, redundancy: 1, readability: 8, implementationCost: 4, decision: "keep", rationale: "The actions alter one another's route value." }],
    combinations: [{ id: "orient-bind-route", verbIds: ["orient", "bind"], contexts: ["traversal"], consequence: "An authored route changes.", introducedMapId: "map-main", masteryMapId: "map-main", implementationIds: ["ground-passage-route"], testIds: [testId] }],
    progression: [],
  };
}

function projectWithEvidence(testRecord) {
  const project = createTemplate("dimetric");
  project.acceptanceTests = [testRecord];
  project.verbArchitecture = architecture(testRecord.id);
  return project;
}

test("prose-only acceptance IDs cannot satisfy verb evidence", () => {
  const project = projectWithEvidence({ id: "test-route", name: "Route", ownerId: "route", assertion: "The route works." });
  const inspection = inspectVerbArchitecture(project);
  const doctor = analyzeProject(project, { profile: "production" });

  assert.deepEqual(inspection.testGaps, ["verb:orient", "verb:bind", "combination:orient-bind-route"]);
  assert.equal(doctor.acceptanceResults.status, "specified");
  assert.deepEqual(doctor.acceptancePlan.verbSpecOnlyIds, ["test-route"]);
  assert.equal(doctor.issues.some((issue) => issue.code === "acceptance-spec-only"), true);
  assert.equal(doctor.issues.some((issue) => issue.code === "verb-test-evidence"), true);
});

test("passing deterministic acceptance execution resolves referenced evidence", () => {
  const project = projectWithEvidence(acceptanceTest("test-route"));
  const sourceDigest = doctorSourceDigest(project);
  const suite = runAcceptanceSuite(project, { sourceDigest });
  const plan = getAcceptancePlan(project, { sourceDigest, acceptanceResults: suite });
  const inspection = inspectVerbArchitecture(project);

  assert.equal(suite.status, "passed");
  assert.equal(suite.tests[0].sourceDigest, sourceDigest);
  assert.match(suite.tests[0].acceptanceSpecDigest, /^acceptance-[a-f0-9]{8}$/);
  assert.equal(suite.tests[0].assertions[0].observed, "map-main");
  assert.deepEqual(plan.passingIds, ["test-route"]);
  assert.deepEqual(inspection.testGaps, []);
});

test("a failing executable acceptance test blocks Doctor and remains unproven", () => {
  const project = projectWithEvidence(acceptanceTest("test-route", "map-that-does-not-exist"));
  const suite = runAcceptanceSuite(project);
  const doctor = analyzeProject(project, { profile: "production" });

  assert.equal(suite.status, "failed");
  assert.equal(suite.tests[0].firstFailure.id, "test-route-map");
  assert.equal(doctor.issues.some((issue) => issue.code === "acceptance-failed" && issue.severity === "error"), true);
  assert.equal(doctor.issues.some((issue) => issue.code === "verb-test-evidence"), true);
});

test("a replay ID counts only after its current fixture executes and passes", () => {
  const project = createTemplate("dimetric");
  project.acceptanceTests = [];
  project.replay = { version: "1", tickRate: 60, seed: 1, cases: [{ id: "replay-route", name: "Route", tickCount: 1, inputs: [] }] };
  project.verbArchitecture = architecture("replay-route");

  const inspection = inspectVerbArchitecture(project);
  const doctor = analyzeProject(project);
  assert.equal(doctor.replayResults.status, "recordable");
  assert.equal(inspection.testGaps.length, 3);
  assert.deepEqual(doctor.acceptancePlan.missingIds, ["replay-route"]);
});

test("current external behavior receipts can prove a test ID and become stale after source changes", () => {
  const project = projectWithEvidence({ id: "test-route", name: "Route", ownerId: "route", assertion: "The route works." });
  const sourceDigest = doctorSourceDigest(project);
  project.iteration = {
    status: "candidate",
    verification: {
      sourceDigest,
      evidenceRefs: [{ version: 2, type: "automated-test", id: "acceptance-browser", status: "passed", sourceDigest, createdAt: "2026-08-09T12:00:00.000Z", runner: "playwright", checks: [{ id: "test-route", status: "passed", detail: "Observed in the current browser runtime." }] }],
    },
  };

  let plan = getAcceptancePlan(project, { sourceDigest });
  let inspection = inspectVerbArchitecture(project, project.verbArchitecture, { sourceDigest });
  assert.equal(plan.items.find((item) => item.id === "test-route").proof, "source-bound-external");
  assert.deepEqual(inspection.testGaps, []);

  project.maps[0].background = "#333333";
  const changedDigest = doctorSourceDigest(project);
  plan = getAcceptancePlan(project, { sourceDigest: changedDigest });
  inspection = inspectVerbArchitecture(project, project.verbArchitecture, { sourceDigest: changedDigest });
  const doctor = analyzeProject(project);
  assert.notEqual(changedDigest, sourceDigest);
  assert.deepEqual(plan.staleIds, ["test-route"]);
  assert.equal(inspection.testGaps.length, 3);
  assert.equal(doctor.issues.some((issue) => issue.code === "acceptance-stale"), true);
});

test("acceptance authoring rejects arbitrary runners, targets, and object paths", () => {
  const project = createTemplate("dimetric");
  const unsafe = acceptanceTest("test-unsafe");
  unsafe.runner = "javascript";
  unsafe.assertions[0] = { id: "unsafe", target: "object-property", targetId: "player", property: "constructor.prototype", operator: "truthy" };
  assert.throws(() => applyAgentCommand(project, { op: "upsert_acceptance_test", test: unsafe }), /runner must be looplab-deterministic-runtime|allowlisted object property/);
});

test("each deterministic acceptance case starts from a fresh runtime", () => {
  const project = createTemplate("dimetric");
  const player = project.maps[0].objects.find((object) => object.kind === "player");
  project.acceptanceTests = [
    {
      id: "test-move",
      name: "Move",
      ownerId: "player",
      assertion: "Movement changes x.",
      runner: LOOPLAB_ACCEPTANCE_RUNNER,
      driver: { tickRate: 60, tickCount: 6, startMapId: "map-main", inputs: [{ tick: 0, action: "move-right", pressed: true }, { tick: 5, action: "move-right", pressed: false }] },
      assertions: [{ id: "moved", target: "object-property", targetId: player.id, property: "x", operator: "greater-than", expected: player.x }],
    },
    {
      id: "test-fresh",
      name: "Fresh",
      ownerId: "player",
      assertion: "The next case starts fresh.",
      runner: LOOPLAB_ACCEPTANCE_RUNNER,
      driver: { tickRate: 60, tickCount: 1, startMapId: "map-main", inputs: [] },
      assertions: [{ id: "fresh-x", target: "object-property", targetId: player.id, property: "x", operator: "equals", expected: player.x }],
    },
  ];

  const suite = runAcceptanceSuite(project);
  assert.equal(suite.status, "passed");
  assert.equal(suite.tests[1].assertions[0].observed, player.x);
});

test("acceptance specification digests are canonical and change with the quality bar", () => {
  const first = acceptanceTest("test-digest");
  const reordered = { assertions: first.assertions, driver: first.driver, assertion: first.assertion, ownerId: first.ownerId, name: first.name, runner: first.runner, id: first.id };
  assert.equal(acceptanceSpecDigest(first), acceptanceSpecDigest(reordered));
  reordered.assertions = [{ ...reordered.assertions[0], expected: "another-map" }];
  assert.notEqual(acceptanceSpecDigest(first), acceptanceSpecDigest(reordered));
});

test("headless acceptance commands are read-only and return structured proof", () => {
  const project = projectWithEvidence(acceptanceTest("test-route"));
  const before = JSON.stringify(project);
  const plan = applyAgentCommand(project, { op: "get_acceptance_plan" });
  const suite = applyAgentCommand(project, { op: "run_acceptance_suite", testId: "test-route" });

  assert.equal(plan.changed, false);
  assert.equal(suite.changed, false);
  assert.equal(plan.result.items[0].status, "passed");
  assert.equal(suite.result.status, "passed");
  assert.equal(JSON.stringify(project), before);
});

test("the agent manifest makes executable acceptance a required headless capability", () => {
  const manifest = getAgentManifest();
  assert.equal(manifest.protocolVersion, "1.109.0");
  assert.deepEqual(manifest.executableAcceptance.commands, ["get_acceptance_plan", "run_acceptance_suite"]);
  assert.ok(manifest.commands.includes("get_acceptance_plan"));
  assert.ok(manifest.commands.includes("run_acceptance_suite"));
  assert.ok(manifest.requiredWorkflow.includes("run_acceptance_suite"));
  assert.match(manifest.executableAcceptance.proofBoundary, /prose acceptance record is a specification/i);
  assert.match(manifest.executableAcceptance.securityPolicy, /cannot contain executable JavaScript/i);
});
