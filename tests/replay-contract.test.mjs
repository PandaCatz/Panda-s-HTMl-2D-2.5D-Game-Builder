import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyAgentCommand, buildStandaloneHtml, createTemplate, getAgentManifest, validateProject } from "../lib/looplab-agent-core.mjs";
import { validateExecutableAcceptanceTest } from "../lib/looplab-acceptance.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { canonicalReplaySerialize, LOOPLAB_REPLAY_HASH_VERSION, LOOPLAB_REPLAY_MOTION_HASH_VERSION, replayStateDigest, runReplaySuite, validateReplayCase } from "../lib/looplab-replay.mjs";
import { createReplayEvidence, validateVerificationEvidence } from "../lib/looplab-verification.mjs";

const routeFixture = {
  op: "record_replay_case",
  id: "opening-run",
  name: "Opening run remains deterministic",
  tickCount: 90,
  inputs: [
    { tick: 0, action: "move-right", pressed: true },
    { tick: 24, action: "jump", pressed: true },
    { tick: 30, action: "jump", pressed: false },
    { tick: 72, action: "move-right", pressed: false },
  ],
  checkpointInterval: 1,
};

const legacyPocketProject = JSON.parse(readFileSync(new URL("./fixtures/pocket-platformer-replay-v1.json", import.meta.url), "utf8"));

function platformerWithoutBaselineReplay() {
  const project = createTemplate("platformer");
  project.replay = { ...project.replay, cases: [] };
  return project;
}

test("canonical replay serialization is stable across nested key order", () => {
  const first = { z: [{ b: 2, a: 1 }], a: { y: true, x: false } };
  const second = { a: { x: false, y: true }, z: [{ a: 1, b: 2 }] };
  assert.equal(canonicalReplaySerialize(first), canonicalReplaySerialize(second));
  assert.equal(replayStateDigest(first), replayStateDigest(second));
  assert.match(replayStateDigest(first), /^replay-sha256-[0-9a-f]{64}$/);
  assert.equal(replayStateDigest(first, { hashVersion: LOOPLAB_REPLAY_MOTION_HASH_VERSION }), replayStateDigest(second, { hashVersion: LOOPLAB_REPLAY_MOTION_HASH_VERSION }));
  assert.match(replayStateDigest(first, { hashVersion: LOOPLAB_REPLAY_MOTION_HASH_VERSION }), /^replay-[0-9a-f]{8}$/);
});

test("replay and executable acceptance clocks cannot fall below the runtime dt clamp", () => {
  const replayErrors = validateReplayCase({ id: "too-slow", tickRate: 19, tickCount: 1, inputs: [] });
  assert.ok(replayErrors.some((error) => /tickRate must be from 20 through 240/.test(error)));
  const acceptance = validateExecutableAcceptanceTest({
    id: "too-slow",
    runner: "looplab-deterministic-runtime",
    driver: { tickRate: 19, tickCount: 1, inputs: [] },
    assertions: [{ id: "still-here", target: "runtime-state", property: "activeMapId", operator: "truthy" }],
  });
  assert.ok(acceptance.errors.some((error) => /tickRate must be from 20 through 240/.test(error)));
});

test("protected v1 replay evidence survives richer runtime snapshots without silent rerecording", () => {
  const suite = runReplaySuite(legacyPocketProject);
  assert.equal(suite.status, "passed");
  assert.equal(suite.cases[0].hashVersion, 1);
  assert.equal(suite.cases[0].checkpoints[0].hash, "replay-04a07489");
  assert.equal(suite.cases[0].finalHash, "replay-e3f6bd29");

  const html = buildStandaloneHtml(createTemplate("platformer"));
  assert.match(html, /Number\(fixture\.hashVersion\?\?1\)/);
  assert.match(html, /replaySnapshot\(replayEngine,hashVersion\)/);
});

test("records and executes semantic-input fixtures with per-tick checkpoints", () => {
  const project = platformerWithoutBaselineReplay();
  const recorded = applyAgentCommand(project, routeFixture);

  assert.equal(recorded.changed, true);
  assert.equal(recorded.result.replayCase.revision, 1);
  assert.equal(recorded.result.replayCase.hashVersion, LOOPLAB_REPLAY_HASH_VERSION);
  assert.equal(recorded.result.replayCase.checkpoints.length, routeFixture.tickCount);
  assert.equal(recorded.result.replayResult.status, "passed");
  assert.equal(validateProject(recorded.project).valid, true);

  const suite = runReplaySuite(recorded.project);
  assert.equal(suite.status, "passed");
  assert.equal(suite.caseCount, 1);
  assert.equal(suite.passedCount, 1);
  assert.equal(suite.firstDivergence, null);

  const headless = applyAgentCommand(recorded.project, { op: "run_replay_suite" });
  assert.equal(headless.changed, false);
  assert.equal(headless.result.cases[0].finalHash, recorded.result.replayCase.expectedHash);

  const doctor = analyzeProject(recorded.project, { profile: "prototype" });
  assert.equal(doctor.replayResults.status, "passed");
  assert.equal(doctor.issues.some((issue) => issue.code === "replay-diverged"), false);
  const evidence = createReplayEvidence(recorded.project, { sourceDigest: doctor.sourceDigest, createdAt: "2026-08-08T12:00:00.000Z", runner: "node-test" });
  assert.equal(evidence.type, "replay");
  assert.equal(evidence.checks[0].status, "passed");
  assert.equal(validateVerificationEvidence([evidence], { sourceDigest: doctor.sourceDigest, requireScreenshot: false }).valid, true);
});

test("reports the first deterministic divergence and blocks Doctor acceptance", () => {
  const recorded = applyAgentCommand(platformerWithoutBaselineReplay(), routeFixture).project;
  const changed = applyAgentCommand(recorded, { op: "set_project", changes: { gravity: 900 } }).project;
  const suite = runReplaySuite(changed);

  assert.equal(suite.status, "failed");
  assert.equal(suite.failedCount, 1);
  assert.equal(suite.firstDivergence.caseId, "opening-run");
  assert.equal(suite.firstDivergence.tick, 1);
  assert.equal(suite.cases[0].mismatches[0].tick, 1);

  const doctor = analyzeProject(changed, { profile: "prototype" });
  assert.equal(doctor.technicalStatus, "blocked");
  assert.equal(doctor.replayResults.status, "failed");
  assert.equal(doctor.issues.some((issue) => issue.code === "replay-diverged" && issue.tick === 1), true);
});

test("requires an explicit versioned reason before replacing a replay quality bar", () => {
  const recorded = applyAgentCommand(platformerWithoutBaselineReplay(), routeFixture).project;
  assert.throws(
    () => applyAgentCommand(recorded, { ...routeFixture, revision: 2 }),
    /requires changeReason/,
  );
  assert.throws(
    () => applyAgentCommand(recorded, { ...routeFixture, revision: 1, changeReason: "Invalid same-revision attempt" }),
    /revision greater than 1/,
  );

  const rerecorded = applyAgentCommand(recorded, { ...routeFixture, revision: 2, changeReason: "Movement contract intentionally changed" });
  assert.equal(rerecorded.result.replayCase.revision, 2);
  assert.equal(rerecorded.result.replayCase.changeReason, "Movement contract intentionally changed");
  assert.equal(rerecorded.result.replayResult.status, "passed");
});

test("replay deletion requires provenance, leaves a deterministic tombstone, and preserves revision history", () => {
  const recorded = applyAgentCommand(platformerWithoutBaselineReplay(), routeFixture).project;
  assert.throws(() => applyAgentCommand(recorded, { op: "remove_replay_case", id: "opening-run" }), /requires changeReason/);

  const command = { op: "remove_replay_case", id: "opening-run", changeReason: "The authored opening route was intentionally retired" };
  const first = applyAgentCommand(recorded, command);
  const repeated = applyAgentCommand(structuredClone(recorded), command);
  assert.deepEqual(first.result.change, repeated.result.change, "the tombstone must be deterministic for the same exact source");
  assert.equal(first.project.replay.cases.length, 0);
  assert.equal(first.project.replay.changeLog.length, 1);
  assert.deepEqual(first.project.replay.changeLog[0], first.result.change);
  assert.match(first.result.change.sourceDigest, /^source-[0-9a-f]{64}$/);
  assert.match(first.result.change.priorCaseDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(validateProject(first.project).valid, true);

  assert.throws(() => applyAgentCommand(first.project, routeFixture), /requires changeReason/);
  const restored = applyAgentCommand(first.project, { ...routeFixture, revision: 2, changeReason: "Restore the route under a reviewed second revision" });
  assert.equal(restored.result.replayCase.revision, 2);
  assert.equal(restored.project.replay.changeLog.length, 1, "recording must not erase removal provenance");

  const tampered = structuredClone(first.project);
  tampered.replay.changeLog[0].sourceDigest = "source-forged";
  assert.equal(validateProject(tampered).valid, false);
});

test("production Doctor and the manifest expose executable replay truth", () => {
  const project = createTemplate("platformer");
  const doctor = analyzeProject(project, { profile: "production" });
  assert.equal(doctor.replayResults.status, "passed");
  assert.equal(doctor.replayResults.caseCount, 1);
  assert.equal(doctor.replayResults.cases[0].caseId, "pocket-route-completion");
  assert.equal(doctor.issues.some((issue) => issue.code === "replay-fixtures-missing"), false);

  const manifest = getAgentManifest();
  assert.deepEqual(manifest.deterministicReplay.commands, ["preview_playtest_replay", "promote_playtest_replay", "record_replay_case", "run_replay_suite", "remove_replay_case"]);
  assert.ok(manifest.requiredWorkflow.includes("run_replay_suite"));
  assert.ok(manifest.commands.includes("record_replay_case"));
  assert.ok(manifest.exportedRuntime.methods.includes("runReplayCase"));
  assert.equal(manifest.exportedRuntime.version, "2.29.0");
  assert.equal(manifest.deterministicReplay.currentHashVersion, 10);
  assert.equal(manifest.deterministicReplay.legacyHashVersion, 1);
  assert.deepEqual(manifest.deterministicReplay.supportedHashVersions, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(manifest.deterministicReplay.minimumTickRate, 20);
  assert.deepEqual(manifest.deterministicReplay.digestAlgorithms, { legacyVersions: [1, 2, 3, 4, 5], legacy: "FNV-1a-32", sha256Versions: [6, 7, 8, 9, 10], currentVersion: 10, current: "SHA-256" });
  assert.match(manifest.deterministicReplay.hashVersionPolicy, /must add a new projection/i);
});
