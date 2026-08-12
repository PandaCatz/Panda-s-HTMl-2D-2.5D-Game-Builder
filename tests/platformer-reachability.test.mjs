import assert from "node:assert/strict";
import test from "node:test";
import { createTemplate } from "../lib/looplab-agent-core.mjs";
import { runAcceptanceSuite } from "../lib/looplab-acceptance.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { measurePlatformerJumpEnvelope } from "../lib/looplab-runtime-model.mjs";
import { runReplaySuite } from "../lib/looplab-replay.mjs";

test("measures the platformer jump envelope by stepping the shipped runtime", () => {
  const envelope = measurePlatformerJumpEnvelope(createTemplate("platformer"));
  assert.equal(envelope.method, "fork-and-step-runtime");
  assert.equal(envelope.tickRate, 60);
  assert.ok(envelope.maxRise > 90 && envelope.maxRise < 130, `unexpected jump rise ${envelope.maxRise}`);
  assert.ok(envelope.maximumHorizontalTravel > 150);
});

test("the Pocket Platformer headless starter has a reachable authored goal route", () => {
  const project = createTemplate("platformer");
  const doctor = analyzeProject(project);
  assert.equal(doctor.issues.some((issue) => issue.code === "platformer-required-target-unreachable"), false);
  assert.equal(doctor.issues.some((issue) => issue.code === "platformer-support-unreachable"), false);
  const acceptance = runAcceptanceSuite(project);
  const route = acceptance.tests.find((result) => result.testId === "pocket-route-completion");
  assert.equal(route?.passed, true);
  assert.equal(route?.assertions.find((assertion) => assertion.id === "route-coins")?.observed, 3);
  const replay = runReplaySuite(project);
  assert.equal(replay.passed, true);
  assert.equal(replay.cases[0].expectedHash, "replay-dd4c1d21");
});

test("Doctor reports an elevated goal that the measured movement envelope cannot reach", () => {
  const project = createTemplate("platformer");
  const map = project.maps[0];
  const byId = new Map(map.objects.map((object) => [object.id, object]));
  const objects = [
    { ...byId.get("player"), x: 120, y: 402 },
    { ...byId.get("ground"), x: 0, y: 520, width: 960, height: 20, collider: { ...byId.get("ground").collider, width: 960, height: 20 } },
    { ...byId.get("ledge"), x: 430, y: 390, width: 200, collider: { ...byId.get("ledge").collider, width: 200 } },
    { ...byId.get("goal"), x: 820, y: 242 },
  ];
  map.objects = objects;
  project.objects = objects;
  const doctor = analyzeProject(project);
  const issue = doctor.issues.find((candidate) => candidate.code === "platformer-required-target-unreachable");
  assert.ok(issue, "the impossible goal must produce a structured Doctor finding");
  assert.equal(issue.objectId, "goal");
  assert.equal(issue.predictionMethod, "fork-and-step-runtime");
  assert.ok(issue.requiredRise > issue.maxJumpRise);
  assert.deepEqual(issue.evidenceRequired, ["project-doctor", "replay", "playtest"]);
});
