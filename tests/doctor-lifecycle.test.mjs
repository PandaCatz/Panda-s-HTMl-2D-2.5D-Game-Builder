import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAgentCommand,
  applyCollectedVerificationEvidence,
  buildStandaloneHtml,
  buildVerificationHtml,
  createTemplate,
  invalidateVerifiedAuthoring,
  promoteVerifiedIteration,
  validateProject,
} from "../lib/looplab-agent-core.mjs";
import { analyzeProject, canCollectOfflineVerificationEvidence, doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import { createRuntimePlaytestEvidence, validateVerificationEvidence, verificationCoverageRequirements } from "../lib/looplab-verification.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

function platformerWithoutProtectedRoute() {
  const project = createTemplate("platformer");
  project.replay = { ...project.replay, cases: [] };
  project.acceptanceTests = [];
  project.qualityContracts = { ...project.qualityContracts, completionMode: "open-ended" };
  project.objects = project.objects.filter((object) => object.kind !== "goal");
  project.maps = project.maps.map((map) => ({ ...map, objects: map.objects.filter((object) => object.kind !== "goal") }));
  return project;
}

function candidate(profile = "prototype") {
  const project = { ...platformerWithoutProtectedRoute(), doctorProfile: profile };
  return applyAgentCommand(project, { op: "begin_iteration", id: "iteration-test", buildId: "build-test" }).project;
}

function evidenceFor(project) {
  const report = analyzeProject(project);
  const createdAt = "2026-08-07T12:00:00.000Z";
  const requirements = verificationCoverageRequirements(project);
  const profiles = new Map((project.deviceProfiles ?? []).map((profile) => [profile.id, profile]));
  const screenshots = requirements.requiredMapIds.flatMap((mapId, mapIndex) => requirements.requiredProfileIds.map((profileId, profileIndex) => {
    const profile = profiles.get(profileId) ?? { id: profileId, width: 1440, height: 900, dpr: 1 };
    const hashDigit = ((mapIndex * requirements.requiredProfileIds.length + profileIndex) % 16).toString(16);
    return {
      version: 2,
      type: "screenshot",
      id: `canvas:${mapId}:${profileId}`,
      status: "passed",
      sourceDigest: report.sourceDigest,
      createdAt,
      runner: "playwright-test-fixture",
      mapId,
      profileId,
      sha256: `sha256:${hashDigit.repeat(64)}`,
      width: 960,
      height: 540,
      viewport: { width: 1440, height: 1000, devicePixelRatio: 1 },
      targetViewport: { width: profile.width, height: profile.height, devicePixelRatio: profile.dpr ?? 1 },
      renderedBounds: { width: Math.min(960, profile.width), height: 540 },
      cleanPlay: true,
      editorOverlays: false,
      profileSimulation: "in-app-device-profile",
    };
  }));
  const responsive = requirements.requiredProfileIds.map((profileId) => {
    const profile = profiles.get(profileId) ?? { id: profileId, width: 1440, height: 900, dpr: 1 };
    return {
      version: 2,
      type: "responsive",
      id: `responsive:${profileId}`,
      status: "passed",
      sourceDigest: report.sourceDigest,
      createdAt,
      runner: "playwright-test-fixture",
      profileId,
      profileSimulation: "in-app-device-profile",
      targetViewport: { width: profile.width, height: profile.height, devicePixelRatio: profile.dpr ?? 1 },
      viewport: { width: 1440, height: 1000, devicePixelRatio: 1 },
      checks: [{ id: "layout-contained", status: "passed", detail: "Fixture layout is contained." }],
    };
  });
  return [
    createRuntimePlaytestEvidence(project, { sourceDigest: report.sourceDigest, createdAt, runner: "node-test" }),
    ...screenshots,
    ...responsive,
  ];
}

test("separates technical verification from measurable visual readiness", () => {
  const directed = applyAgentCommand(createTemplate("platformer"), {
    op: "set_game_brief",
    userPrompt: "Build a polished platform game with a deliberate character and cohesive environment art.",
  }).project;
  const report = analyzeProject(directed);
  const failedChecks = report.visualReadiness.checks.filter((check) => !check.passed).map((check) => check.id);

  assert.equal(report.technicalStatus, "passes-with-findings");
  assert.equal(report.visualReadiness.status, "needs-art-pass");
  assert.equal(report.visualReadiness.score, 0);
  assert.equal(report.visualReadiness.aestheticApproval, "not-claimed");
  assert.deepEqual(failedChecks, ["primary-art-coverage", "player-animation-identity", "art-direction-cohesion", "sprite-pipeline-proof"]);
  assert.ok(report.issues.some((issue) => issue.code === "primary-art-coverage" && issue.category === "assets"));
  assert.equal(report.gate.blocking, false, "prototype mode can verify technical behavior while reporting visual findings honestly");

  const kinetic = analyzeProject(createTemplate("kinetic"));
  assert.equal(kinetic.visualReadiness.status, "measurably-ready");
  assert.equal(kinetic.visualReadiness.score, 100);
  assert.equal(kinetic.visualReadiness.passedCount, kinetic.visualReadiness.checkCount);
  assert.match(kinetic.visualReadiness.limitation, /do not judge taste/i);
});

function verifiedCandidate() {
  const project = candidate();
  return applyCollectedVerificationEvidence(project, evidenceFor(project)).project;
}

test("Doctor receipts bind to authored source but ignore active map tab selection", () => {
  let project = candidate();
  const before = analyzeProject(project);
  assert.match(before.sourceDigest, /^source-[0-9a-f]{64}$/, "authorization receipts must use a collision-resistant SHA-256 source digest");
  project = applyAgentCommand(project, { op: "update_object", id: "coin-1", changes: { x: 520 } }).project;
  const after = analyzeProject(project);
  assert.notEqual(after.sourceDigest, before.sourceDigest);
  assert.notEqual(after.digest, before.digest, "the Doctor digest must change even when issue identities happen to remain equal");

  project = applyAgentCommand(project, { op: "add_map", id: "map-two", name: "Second map" }).project;
  const beforeSwitch = doctorSourceDigest(project);
  project = applyAgentCommand(project, { op: "switch_map", id: "map-two" }).project;
  assert.equal(doctorSourceDigest(project), beforeSwitch, "opening another authored map is a view change, not a source mutation");
});

test("full Project Doctor verification stores a source-bound receipt and promotion reruns it", () => {
  const candidateProject = candidate();
  const evidenceRefs = evidenceFor(candidateProject);
  const outcome = applyCollectedVerificationEvidence(candidateProject, evidenceRefs);
  const verified = outcome.project;
  const report = analyzeProject(verified);
  assert.equal(verified.iteration.status, "verified");
  assert.equal(verified.iteration.verification.digest, report.digest);
  assert.equal(verified.iteration.verification.sourceDigest, report.sourceDigest);
  assert.equal(verified.iteration.verification.profile, report.profile);
  assert.deepEqual(verified.iteration.verification.evidenceRefs, evidenceRefs);
  assert.equal(validateVerificationEvidence(verified.iteration.verification.evidenceRefs, { sourceDigest: report.sourceDigest, ...verificationCoverageRequirements(verified) }).valid, true);
  assert.doesNotThrow(() => buildStandaloneHtml(verified));

  const promoted = promoteVerifiedIteration(verified).project;
  assert.equal(promoted.iteration.status, "promoted");
  assert.equal(promoted.iteration.readOnly, true);
  assert.doesNotThrow(() => buildStandaloneHtml(promoted));
});

test("editing a verified or promoted snapshot automatically creates a clean child candidate", () => {
  const verified = verifiedCandidate();
  const child = applyAgentCommand(verified, { op: "update_object", id: "coin-1", changes: { x: 540 } }).project;
  assert.equal(child.iteration.status, "candidate");
  assert.equal(child.iteration.parentId, verified.iteration.id);
  assert.notEqual(child.iteration.id, verified.iteration.id);
  assert.equal(child.iteration.verification, undefined);
  assert.equal(child.iteration.verifiedAt, undefined);
  assert.equal(child.authoring.dirty, true);
  assert.equal(child.build.outputTimestamp, undefined);
  assert.equal(child.build.servedBuildId, undefined);

  const promoted = promoteVerifiedIteration(verified).project;
  const promotedChild = invalidateVerifiedAuthoring(promoted, { ...promoted, name: "Edited after promotion" }, { id: "child-after-promotion", now: "2026-08-07T12:00:00.000Z" });
  assert.equal(promotedChild.iteration.status, "candidate");
  assert.equal(promotedChild.iteration.parentId, promoted.iteration.id);
  assert.equal(promotedChild.iteration.readOnly, false);
});

test("stale source and build receipts cannot be promoted or exported", () => {
  const verified = verifiedCandidate();
  const staleSource = clone(verified);
  staleSource.objects = staleSource.objects.map((object) => object.id === "coin-1" ? { ...object, x: object.x + 20 } : object);
  staleSource.maps = staleSource.maps.map((map) => map.id === staleSource.activeMapId ? { ...map, objects: clone(staleSource.objects) } : map);
  assert.throws(() => promoteVerifiedIteration(staleSource), /missing or stale/);
  assert.throws(() => buildStandaloneHtml(staleSource), /verified snapshot is stale/);

  const staleBuild = clone(verified);
  staleBuild.build.id = "different-build";
  assert.throws(() => promoteVerifiedIteration(staleBuild), /build identity changed/);
  assert.throws(() => buildStandaloneHtml(staleBuild), /verified snapshot is stale/);
});

test("Doctor blockers, production warnings, and force bypasses prevent verification and export", () => {
  const blocked = { ...candidate(), release: { externalRequests: ["https://example.invalid/runtime.js"] } };
  assert.throws(() => applyCollectedVerificationEvidence(blocked, []), /Project Doctor blocked verification/);
  assert.throws(() => buildStandaloneHtml(blocked), /Project Doctor blocked HTML export/);
  assert.throws(() => applyAgentCommand(candidate(), { op: "verify_iteration", force: true }), /browser-session command/);

  const production = candidate("production");
  const report = analyzeProject(production);
  assert.equal(report.errorCount, 0);
  assert.ok(report.warningCount > 0);
  assert.equal(report.gate.blocking, true);
  assert.throws(() => applyCollectedVerificationEvidence(production, evidenceFor(production)), /production profile/);
  assert.throws(() => applyAgentCommand(production, { op: "verify_iteration", profile: "prototype" }), /browser-session command/);
  assert.throws(() => buildStandaloneHtml(production), /production profile/);
});

test("verification HTML permits only the circular offline-unverified production warning", () => {
  let production = { ...createTemplate("kinetic"), doctorProfile: "production" };
  production = applyAgentCommand(production, { op: "record_replay_case", id: "startup-smoke", name: "Runtime starts deterministically", tickCount: 1, inputs: [], checkpointInterval: 1 }).project;
  production = applyAgentCommand(production, { op: "begin_iteration", id: "kinetic-verification", buildId: "kinetic-verification" }).project;
  const report = analyzeProject(production);
  assert.deepEqual(report.issues.filter((issue) => issue.severity !== "info").map((issue) => issue.code), ["offline-unverified"]);
  assert.ok(report.issues.some((issue) => issue.code === "platformer-support-unreachable" && issue.severity === "info"));
  assert.equal(canCollectOfflineVerificationEvidence(production, report), true);
  const html = buildVerificationHtml(production);
  assert.match(html, /^<!doctype html>/i);

  const releaseError = { ...production, release: { ...production.release, externalRequests: ["https://example.invalid/runtime.js"] } };
  assert.equal(canCollectOfflineVerificationEvidence(releaseError, analyzeProject(releaseError)), false);
  assert.throws(() => buildVerificationHtml(releaseError), /Project Doctor blocked HTML export/);

  const extraWarning = { ...production, release: { ...production.release, debugMarkers: ["debug-grid"] } };
  assert.equal(canCollectOfflineVerificationEvidence(extraWarning, analyzeProject(extraWarning)), false);
  assert.throws(() => buildVerificationHtml(extraWarning), /Project Doctor blocked HTML export/);
});

test("verification rejects empty, legacy, failed, and stale evidence", () => {
  const project = candidate();
  const digest = analyzeProject(project).sourceDigest;
  assert.throws(() => applyCollectedVerificationEvidence(project, []), /non-empty playtest and screenshot evidence/);
  assert.throws(() => applyCollectedVerificationEvidence(project, ["playtest:desktop"]), /legacy strings/);
  const failed = evidenceFor(project);
  failed[0].checks[0].status = "failed";
  assert.throws(() => applyCollectedVerificationEvidence(project, failed), /non-passing check/);
  const stale = evidenceFor(project).map((evidence) => ({ ...evidence, sourceDigest: `${digest}-stale` }));
  assert.throws(() => applyCollectedVerificationEvidence(project, stale), /targets stale source/);
  const incompleteMatrix = evidenceFor(project);
  incompleteMatrix.splice(incompleteMatrix.findIndex((evidence) => evidence.type === "screenshot"), 1);
  assert.throws(() => applyCollectedVerificationEvidence(project, incompleteMatrix), /Visual capture matrix covers/);
  const failedResponsive = evidenceFor(project);
  const responsive = failedResponsive.find((evidence) => evidence.type === "responsive");
  responsive.checks[0].status = "failed";
  assert.throws(() => applyCollectedVerificationEvidence(project, failedResponsive), /non-passing responsive check/);
});

test("headless replacement cannot weaken the configured Doctor profile", () => {
  const production = candidate("production");
  const attemptedDowngrade = { ...production, doctorProfile: "prototype", name: "Replacement" };
  const replaced = applyAgentCommand(production, { op: "replace_project", project: attemptedDowngrade }).project;
  assert.equal(replaced.doctorProfile, "production");
  assert.throws(() => applyAgentCommand(replaced, { op: "verify_iteration", profile: "prototype" }), /browser-session command/);
});

test("verified lifecycle metadata is structurally validated", () => {
  const fabricated = candidate();
  fabricated.iteration = { ...fabricated.iteration, status: "verified", verifiedAt: new Date().toISOString() };
  const validation = validateProject(fabricated);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("verification receipt")));
  assert.equal(validateProject({ ...candidate(), doctorProfile: "disabled" }).valid, false);
});

test("iteration ledger receipts are source-bound, comparable, and safely restorable", () => {
  let project = platformerWithoutProtectedRoute();
  project = applyAgentCommand(project, { op: "begin_iteration", id: "layout-a", objective: "Create the first route" }).project;
  project = applyAgentCommand(project, { op: "update_object", id: "coin-1", changes: { x: 500 } }).project;
  project = applyAgentCommand(project, { op: "checkpoint_iteration", id: "layout-a", score: 70, scoreKind: "quality", summary: "First accepted route" }).project;
  const layoutADigest = doctorSourceDigest(project);

  project = applyAgentCommand(project, { op: "begin_iteration", id: "layout-b", objective: "Improve route pacing" }).project;
  project = applyAgentCommand(project, { op: "update_object", id: "coin-1", changes: { x: 620 } }).project;
  project = applyAgentCommand(project, { op: "checkpoint_iteration", id: "layout-b", score: 76, scoreKind: "quality", qualityDelta: 6, summary: "Longer recovery lane" }).project;

  const ledger = applyAgentCommand(project, { op: "get_iteration_history" }).result;
  assert.equal(ledger.schemaVersion, "looplab-iteration-ledger/v1");
  assert.equal(ledger.currentId, "layout-b");
  assert.ok(ledger.entries.find((entry) => entry.id === "layout-a")?.restorable);
  assert.ok(ledger.entries.find((entry) => entry.id === "layout-b")?.restorable);
  assert.equal(ledger.entries.find((entry) => entry.id === "layout-a")?.score, 70, "starting the next pass must not replace an explicit AI quality score with a generic Doctor score");
  assert.equal(ledger.entries.find((entry) => entry.id === "layout-a")?.summary, "First accepted route");
  assert.ok(ledger.snapshotCount >= 2);

  const comparison = applyAgentCommand(project, { op: "compare_iterations", ids: ["layout-a", "layout-b"] }).result;
  assert.equal(comparison.schemaVersion, "looplab-candidate-decision/v1");
  assert.equal(comparison.changed, true);
  assert.equal(comparison.first.sourceDigest, layoutADigest);
  assert.notEqual(comparison.doctor.first.sourceDigest, comparison.doctor.second.sourceDigest);
  assert.equal(comparison.technicalRelation, "insufficient-evidence", "legacy checkpoints without frozen dimension receipts must not be ranked from Doctor score alone");
  assert.equal(comparison.automaticWinner, null);
  assert.equal(Object.hasOwn(comparison, "winner"), false);
  assert.ok(comparison.evidence.missing.some((item) => item.includes("loop evaluation receipt")));

  const restored = applyAgentCommand(project, { op: "restore_iteration", id: "layout-a", restoreAsId: "layout-a-restored" }).project;
  assert.equal(restored.iteration.id, "layout-a-restored");
  assert.equal(restored.iteration.parentId, "layout-a");
  assert.equal(restored.iteration.status, "candidate");
  assert.equal(restored.iteration.verification, undefined);
  assert.equal(doctorSourceDigest(restored), layoutADigest);
  assert.equal(restored.iterationHistory.find((entry) => entry.id === "layout-a")?.sourceDigest, layoutADigest);
  assert.equal(restored.iterationHistory.find((entry) => entry.id === "layout-a-restored")?.restoredFrom, "layout-a");
  assert.equal(validateProject(restored).valid, true);

  const html = buildStandaloneHtml(restored);
  assert.doesNotMatch(html, /"iterationArchive"/);
  assert.doesNotMatch(html, /"iterationHistory"/, "lifecycle receipts stay in editable source so later verification cannot change shipped bytes");
});

test("rejected attempt receipts survive without changing authored source or consuming a snapshot", () => {
  const project = candidate();
  const beforeDigest = doctorSourceDigest(project);
  const beforeSnapshots = project.iterationArchive?.snapshots?.length ?? 0;
  const recorded = applyAgentCommand(project, {
    op: "record_iteration_attempt",
    id: "attempt-007",
    status: "rejected",
    accepted: false,
    reason: "Introduced a collision blocker",
    score: 41,
    scoreKind: "quality",
  }).project;
  assert.equal(doctorSourceDigest(recorded), beforeDigest);
  assert.equal(recorded.iterationArchive.snapshots.length, beforeSnapshots);
  assert.equal(recorded.iterationHistory.find((entry) => entry.id === "attempt-007")?.restorable, false);
  assert.equal(recorded.iterationHistory.find((entry) => entry.id === "attempt-007")?.reason, "Introduced a collision blocker");
  assert.equal(validateProject(recorded).valid, true);
});
