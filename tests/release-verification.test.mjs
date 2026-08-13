import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyAgentCommand,
  applyCollectedVerificationEvidence,
  buildStandaloneArtifact,
  buildVerificationHtml,
  createTemplate,
  getAgentManifest,
  promoteVerifiedIteration,
} from "../lib/looplab-agent-core.mjs";
import { sha256Hex } from "../lib/looplab-canonical-digest.mjs";
import { analyzeProject, doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import {
  createReleaseVerificationAttestation,
  createReleaseVerificationAttestationAsync,
  getReleaseVerificationPolicy,
  recordReleaseVerification,
  validateReleaseVerification,
} from "../lib/looplab-release-verification.mjs";
import { prepareExactVerificationSubject, runExactReleaseVerification } from "../lib/looplab-release-verification-runner.mjs";
import { buildExactArtifactEvidencePlan, preparePersistentVerificationEvidence } from "../lib/looplab-exact-artifact-evidence.mjs";
import {
  LOOPLAB_PLATFORM_HARNESS_CSP,
  LOOPLAB_PLATFORM_HARNESS_SCHEMA,
  LOOPLAB_PLATFORM_HARNESS_VERSION,
} from "../lib/looplab-platform-harness-contract.mjs";
import { auditStandaloneHtml } from "../lib/looplab-single-file-audit.mjs";
import { createRuntimePlaytestEvidence, validateVerificationEvidence, verificationCoverageRequirements } from "../lib/looplab-verification.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

function productionCandidate() {
  let project = { ...createTemplate("kinetic"), doctorProfile: "production" };
  project = applyAgentCommand(project, {
    op: "record_replay_case",
    id: "release-startup",
    name: "Release startup remains deterministic",
    tickCount: 1,
    inputs: [],
    checkpointInterval: 1,
  }).project;
  return applyAgentCommand(project, { op: "begin_iteration", id: "release-candidate", buildId: "release-candidate" }).project;
}

function passingPlatformReceipt(html, sourceDigest) {
  const digest = "a".repeat(64);
  return {
    schemaVersion: LOOPLAB_PLATFORM_HARNESS_SCHEMA,
    runner: "playwright-core",
    runnerVersion: LOOPLAB_PLATFORM_HARNESS_VERSION,
    status: "passed",
    passed: true,
    sourceDigest,
    expectedSourceDigest: sourceDigest,
    artifactSha256: sha256Hex(html),
    startedAt: "2026-08-10T12:00:00.000Z",
    completedAt: "2026-08-10T12:00:05.000Z",
    environment: {
      sandbox: ["allow-scripts"],
      opaqueOriginRequired: true,
      csp: LOOPLAB_PLATFORM_HARNESS_CSP,
      frameCount: 1_200,
      frameMs: 16,
      malformedInputInterval: 8,
      hostileAudioResume: true,
      browser: { name: "chromium", version: "fixture-1", launchTarget: "fixture" },
      viewport: { width: 1_280, height: 800 },
    },
    runtimeVersion: "2.35.0",
    checks: getReleaseVerificationPolicy().requiredChecks.map((check) => ({ id: check.id, status: check.allowedStatuses[0], detail: `${check.id} passed.` })),
    findings: [],
    visualEvidence: {
      requested: true,
      initial: { screenshot: { path: "initial.png", sha256: digest, byteLength: 100 } },
      final: { screenshot: { path: "final.png", sha256: "b".repeat(64), byteLength: 120 } },
    },
  };
}

function editorEvidence(project) {
  const doctor = analyzeProject(project);
  const requirements = verificationCoverageRequirements(project);
  const profiles = new Map((project.deviceProfiles ?? []).map((profile) => [profile.id, profile]));
  const createdAt = "2026-08-10T12:10:00.000Z";
  const screenshots = requirements.requiredMapIds.flatMap((mapId, mapIndex) => requirements.requiredProfileIds.map((profileId, profileIndex) => {
    const profile = profiles.get(profileId);
    const digit = ((mapIndex * requirements.requiredProfileIds.length + profileIndex + 1) % 16).toString(16);
    return {
      version: 2,
      type: "screenshot",
      id: `canvas:${mapId}:${profileId}`,
      status: "passed",
      sourceDigest: doctor.sourceDigest,
      createdAt,
      runner: "playwright-release-fixture",
      mapId,
      profileId,
      sha256: `sha256:${digit.repeat(64)}`,
      width: 960,
      height: 540,
      viewport: { width: 1440, height: 1000, devicePixelRatio: 1 },
      targetViewport: { width: profile.width, height: profile.height, devicePixelRatio: profile.dpr ?? 1 },
      renderedBounds: { width: Math.min(960, profile.width), height: Math.min(540, profile.height) },
      cleanPlay: true,
      editorOverlays: false,
      profileSimulation: "in-app-device-profile",
    };
  }));
  const responsive = requirements.requiredProfileIds.map((profileId) => {
    const profile = profiles.get(profileId);
    return {
      version: 2,
      type: "responsive",
      id: `responsive:${profileId}`,
      status: "passed",
      sourceDigest: doctor.sourceDigest,
      createdAt,
      runner: "playwright-release-fixture",
      profileId,
      profileSimulation: "in-app-device-profile",
      targetViewport: { width: profile.width, height: profile.height, devicePixelRatio: profile.dpr ?? 1 },
      viewport: { width: 1440, height: 1000, devicePixelRatio: 1 },
      checks: [{ id: "layout-contained", status: "passed", detail: "Fixture layout is contained." }],
    };
  });
  const runtimeJoins = doctor.runtimeJoinPlan.joins.flatMap((join, joinIndex) => requirements.requiredProfileIds.map((profileId, profileIndex) => ({
    version: 2,
    type: "runtime-join",
    id: `runtime-join:${join.portalId}:${profileId}`,
    status: "passed",
    sourceDigest: doctor.sourceDigest,
    createdAt,
    runner: "runtime-join-release-fixture",
    portalId: join.portalId,
    sourceMapId: join.sourceMapId,
    targetMapId: join.targetMapId,
    targetSpawnId: join.targetSpawnId,
    profileId,
    sourceSha256: `sha256:${((joinIndex + profileIndex + 1) % 16).toString(16).repeat(64)}`,
    targetSha256: `sha256:${((joinIndex + profileIndex + 2) % 16).toString(16).repeat(64)}`,
    actualVisibleJoin: true,
    playerExcluded: true,
    nextUniqueContentInspected: true,
    metrics: { changedPixelRatio: 0.5, targetUniquePixelRatio: 0.25, boundaryColorDelta: 0.05 },
    checks: [
      { id: "runtime-transition", status: "passed", detail: "Actual portal event observed." },
      { id: "exact-target-spawn", status: "passed", detail: "Exact spawn observed." },
      { id: "clear-target-landing", status: "passed", detail: "Landing collider is clear." },
      { id: "next-unique-content", status: "passed", detail: "Unique target pixels observed." },
    ],
  })));
  return [
    createRuntimePlaytestEvidence(project, { sourceDigest: doctor.sourceDigest, createdAt, runner: "node-release-fixture" }),
    ...screenshots,
    ...responsive,
    ...runtimeJoins,
  ];
}

test("persistent exact-artifact evidence cannot retain absolute local capture paths", () => {
  const windowsCapture = ["Z:", "looplab-captures", "map-a.png"].join("\\");
  const windowsJoinCapture = ["Y:", "looplab-captures", "join-target.png"].join("\\");
  const posixJoinCapture = ["", "looplab-captures", "join-source.png"].join("/");
  const portable = preparePersistentVerificationEvidence([
    { type: "screenshot", capturePath: windowsCapture, detail: "Current frame" },
    { type: "runtime-join", capturePaths: { source: posixJoinCapture, target: windowsJoinCapture } },
  ]);
  assert.equal(portable[0].capturePath, "map-a.png");
  assert.deepEqual(portable[1].capturePaths, { source: "join-source.png", target: "join-target.png" });
  assert.doesNotMatch(JSON.stringify(portable), /(?:[A-Za-z]:[\\/]|\\\\|\/(?:tmp|home|Users)\/)/);
  assert.throws(
    () => preparePersistentVerificationEvidence([{ type: "screenshot", detail: windowsCapture }]),
    /absolute local path outside a declared path field/,
  );
});

test("headless exact-artifact receipts cover the same map/profile contract as editor receipts", () => {
  const project = productionCandidate();
  const doctor = analyzeProject(project);
  const requirements = verificationCoverageRequirements(project);
  const contentStats = { distinctQuantizedColorCount: 32, luminanceMean: 110, luminanceStdDev: 24, opaquePixelRatio: 1, flatFrame: false };
  const evidenceRefs = editorEvidence(project).map((evidence) => evidence.type === "screenshot"
    ? { ...evidence, profileSimulation: "headless-browser-profile", contentStats }
    : evidence.type === "responsive" ? { ...evidence, profileSimulation: "headless-browser-profile" } : evidence);
  const validation = validateVerificationEvidence(evidenceRefs, { sourceDigest: doctor.sourceDigest, ...requirements });
  const plan = buildExactArtifactEvidencePlan(project, { sourceDigest: doctor.sourceDigest });
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.equal(plan.maps.length, requirements.requiredMapIds.length);
  assert.equal(plan.profiles.length, requirements.requiredProfileIds.length);
  assert.equal(plan.joins.length, requirements.requiredJoinIds.length);
});

test("verification rejects a source-bound screenshot receipt whose pixels prove a flat frame", () => {
  const project = productionCandidate();
  const doctor = analyzeProject(project);
  const requirements = verificationCoverageRequirements(project);
  const evidenceRefs = editorEvidence(project);
  const screenshot = evidenceRefs.find((evidence) => evidence.type === "screenshot");
  screenshot.contentStats = { distinctQuantizedColorCount: 1, luminanceMean: 128, luminanceStdDev: 0, opaquePixelRatio: 1, flatFrame: true };
  const validation = validateVerificationEvidence(evidenceRefs, { sourceDigest: doctor.sourceDigest, ...requirements });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /flat frame|luminanceStdDev/i);
});
test("legacy offline booleans do not satisfy production release verification", () => {
  const project = { ...productionCandidate(), release: { ...productionCandidate().release, offlineVerified: true } };
  const report = analyzeProject(project);
  const issue = report.issues.find((candidate) => candidate.code === "offline-unverified");
  assert.ok(issue);
  assert.match(issue.message, /legacy offlineVerified=true flag is not verification evidence/i);
  assert.equal(report.gate.blocking, true);
});

test("a current exact-artifact attestation clears only the offline gate without changing source truth", () => {
  const project = productionCandidate();
  const beforeDigest = doctorSourceDigest(project);
  const html = buildVerificationHtml(project);
  const audit = auditStandaloneHtml(html);
  const attestation = createReleaseVerificationAttestation({
    project,
    sourceDigest: beforeDigest,
    html,
    audit,
    platformReceipt: passingPlatformReceipt(html, beforeDigest),
    filename: "kinetic-city.html",
    verifiedAt: "2026-08-10T12:00:06.000Z",
  });
  const verifiedProject = recordReleaseVerification(project, attestation, { sourceDigest: beforeDigest });
  assert.equal(doctorSourceDigest(verifiedProject), beforeDigest, "recording evidence must not mutate authored source truth");
  assert.equal(validateReleaseVerification(verifiedProject.releaseVerification, { sourceDigest: beforeDigest }).valid, true);
  const report = analyzeProject(verifiedProject);
  assert.equal(report.warningCount, 0, JSON.stringify(report.issues, null, 2));
  assert.equal(report.errorCount, 0, JSON.stringify(report.issues, null, 2));
});

test("native async artifact hashing produces the exact same attestation as the compatibility path", async () => {
  const project = productionCandidate();
  const sourceDigest = doctorSourceDigest(project);
  const html = buildVerificationHtml(project);
  const audit = auditStandaloneHtml(html);
  const options = {
    project,
    sourceDigest,
    html,
    audit,
    platformReceipt: passingPlatformReceipt(html, sourceDigest),
    filename: "kinetic-city.html",
    verifiedAt: "2026-08-10T12:00:06.000Z",
  };
  assert.deepEqual(await createReleaseVerificationAttestationAsync(options), createReleaseVerificationAttestation(options));
});

test("attestations reject altered artifacts, stale sources, policy drift, verifier drift, and check drift", () => {
  const project = productionCandidate();
  const sourceDigest = doctorSourceDigest(project);
  const html = buildVerificationHtml(project);
  const audit = auditStandaloneHtml(html);
  const baseReceipt = passingPlatformReceipt(html, sourceDigest);

  assert.throws(() => createReleaseVerificationAttestation({ project, sourceDigest, html: `${html}\n`, audit, platformReceipt: baseReceipt }), /audit byte count|exact HTML subject bytes/);
  const staleSourceDigest = `${sourceDigest.slice(0, -1)}${sourceDigest.endsWith("0") ? "1" : "0"}`;
  assert.throws(() => createReleaseVerificationAttestation({ project, sourceDigest: staleSourceDigest, html, audit, platformReceipt: baseReceipt }), /source digest/);
  const wrongRunner = clone(baseReceipt);
  wrongRunner.runnerVersion += 1;
  assert.throws(() => createReleaseVerificationAttestation({ project, sourceDigest, html, audit, platformReceipt: wrongRunner }), /verifier identity or version/);
  const failedCheck = clone(baseReceipt);
  failedCheck.checks.find((check) => check.id === "no-external-requests").status = "failed";
  assert.throws(() => createReleaseVerificationAttestation({ project, sourceDigest, html, audit, platformReceipt: failedCheck }), /disallowed status/);
  const extraCheck = clone(baseReceipt);
  extraCheck.checks.push({ id: "future-check", status: "passed" });
  assert.throws(() => createReleaseVerificationAttestation({ project, sourceDigest, html, audit, platformReceipt: extraCheck }), /Unexpected release-verification check/);

  const attestation = createReleaseVerificationAttestation({ project, sourceDigest, html, audit, platformReceipt: baseReceipt });
  const changedPolicy = clone(attestation);
  changedPolicy.policy.version += 1;
  assert.equal(validateReleaseVerification(changedPolicy, { sourceDigest }).valid, false);
  const changedDigest = clone(attestation);
  changedDigest.subject.digest.sha256 = "f".repeat(64);
  assert.equal(validateReleaseVerification(changedDigest, { sourceDigest }).valid, false);
});

test("verification, lifecycle evidence, and promotion metadata cannot change the attested HTML bytes", () => {
  let project = productionCandidate();
  const sourceDigest = doctorSourceDigest(project);
  const verificationHtml = buildVerificationHtml(project);
  const audit = auditStandaloneHtml(verificationHtml);
  const attestation = createReleaseVerificationAttestation({
    project,
    sourceDigest,
    html: verificationHtml,
    audit,
    platformReceipt: passingPlatformReceipt(verificationHtml, sourceDigest),
    filename: "kinetic-city.html",
  });
  project = recordReleaseVerification(project, attestation, { sourceDigest });

  const attestedCandidate = buildStandaloneArtifact(project, { filename: "kinetic-city.html" });
  assert.equal(attestedCandidate.html, verificationHtml);
  assert.equal(attestedCandidate.receipt.artifact.sha256, attestation.subject.digest.sha256);
  assert.equal(attestedCandidate.receipt.status, "draft", "artifact proof does not replace editor iteration verification");

  project = applyCollectedVerificationEvidence(project, editorEvidence(project)).project;
  const verified = buildStandaloneArtifact(project, { filename: "kinetic-city.html" });
  assert.equal(verified.html, verificationHtml, "iteration verification metadata must stay outside shipped bytes");
  assert.equal(verified.receipt.status, "release-ready");
  assert.equal(verified.receipt.release.exactArtifactVerification.valid, true);
  assert.equal(verified.receipt.artifact.sha256, attestation.subject.digest.sha256);

  project = promoteVerifiedIteration(project).project;
  const promoted = buildStandaloneArtifact(project, { filename: "kinetic-city.html" });
  assert.equal(promoted.html, verificationHtml, "promotion metadata must stay outside shipped bytes");
  assert.doesNotMatch(promoted.html, /looplab-release-verification\/v1/);
  assert.doesNotMatch(promoted.html, /release-candidate/);
});

test("the shared runner rejects release-policy drift before launching a browser", async () => {
  await assert.rejects(
    runExactReleaseVerification(productionCandidate(), { frameCount: 48, frameMs: 16 }),
    /requires 1200 frames at 16 ms/,
  );
});

test("exact verification regenerates stale build metadata without changing authored source truth", () => {
  const project = productionCandidate();
  project.build.generatedFromRevision = "older-unverified-build";
  project.build.servedBuildId = "older-preview";
  project.build.outputTimestamp = "2026-08-10T11:00:00.000Z";
  const beforeDigest = doctorSourceDigest(project);
  assert.ok(analyzeProject(project).issues.some((issue) => issue.code === "stale-build"));

  const generatedAt = new Date(Date.parse(project.build.sourceTimestamp) + 1_000).toISOString();
  const subject = prepareExactVerificationSubject(project, { generatedAt });
  assert.equal(project.build.generatedFromRevision, "older-unverified-build", "preparation must not mutate the caller's project");
  assert.equal(doctorSourceDigest(subject), beforeDigest, "build regeneration metadata must stay outside authored source truth");
  assert.equal(subject.build.generatedFromRevision, subject.build.sourceRevision);
  assert.equal(subject.build.servedBuildId, subject.build.id);
  assert.equal(subject.build.outputTimestamp, generatedAt);
  const report = analyzeProject(subject);
  assert.deepEqual(report.issues.filter((issue) => issue.severity !== "info").map((issue) => issue.code), ["offline-unverified"]);
  assert.match(buildVerificationHtml(subject), /^<!doctype html>/i);
});

test("companion, mouse UI, and headless commands share one durable exact-verification implementation", async () => {
  const [companion, page] = await Promise.all([
    readFile(new URL("../scripts/looplab-companion.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  const manifest = getAgentManifest();
  assert.equal(manifest.releaseVerification.schemaVersion, "looplab-release-verification/v1");
  assert.equal(manifest.releaseVerification.companionEndpoint, "/release-verification-jobs");
  for (const command of ["get_release_verification", "verify_release", "get_release_verification_job", "cancel_release_verification_job"]) assert.ok(manifest.commands.includes(command));
  assert.match(companion, /runExactReleaseVerification/);
  assert.match(companion, /url\.pathname === "\/release-verification-jobs"/);
  assert.match(companion, /controller\?\.abort\(\)/);
  assert.match(companion, /totalTokens: 0/);
  assert.match(companion, /estimatedUsd: 0/);
  const releaseRoutes = companion.slice(companion.indexOf('url.pathname === "/release-verification-jobs"'), companion.indexOf("const assetMatch"));
  assert.doesNotMatch(releaseRoutes, /markResultDelivered\(job\)/);
  assert.match(page, /"Verify exact build"/);
  assert.match(page, /command\.op === "verify_release"/);
  assert.match(page, /command\.op === "get_release_verification_job"/);
  assert.match(page, /\[stale-source\] Exact verification passed source/);
  assert.match(page, /artifact\.html !== result\.html/);
});
