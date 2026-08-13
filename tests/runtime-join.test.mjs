import assert from "node:assert/strict";
import test from "node:test";

import { applyAgentCommand, buildStandaloneHtml, createTemplate, getAgentManifest, validateProject } from "../lib/looplab-agent-core.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { analyzeRuntimeJoinPixels, buildRuntimeJoinPlan } from "../lib/looplab-runtime-join.mjs";
import { validateVerificationEvidence, verificationCoverageRequirements } from "../lib/looplab-verification.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

function connectedProject() {
  let project = createTemplate("platformer");
  project.replay = { ...project.replay, cases: [] };
  project.acceptanceTests = [];
  const sourceMapId = project.maps[0].id;
  project = applyAgentCommand(project, { op: "add_map", id: "map-two", name: "Second map" }).project;
  project = applyAgentCommand(project, {
    op: "connect_maps",
    sourceMapId,
    targetMapId: "map-two",
    portalId: "map-one-to-two",
    targetSpawnId: "map-two-entry",
    runtimeJoin: {
      mode: "continuous",
      sourceEdge: "right",
      targetEdge: "left",
      overlapPixels: 16,
      sampleDepth: 8,
      minimumUniquePixelRatio: 0.02,
      maximumBoundaryColorDelta: 0.2,
    },
  }).project;
  return project;
}

function rgbaFrame(width, height, colorAt) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const color = colorAt(x, y);
    const offset = (y * width + x) * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3] ?? 255;
  }
  return { width, height, pixels };
}

function runtimeJoinReceipt({ sourceDigest, portalId, profileId }) {
  return {
    version: 2,
    type: "runtime-join",
    id: `runtime-join:${portalId}:${profileId}`,
    status: "passed",
    sourceDigest,
    createdAt: "2026-08-08T12:00:00.000Z",
    runner: "runtime-join-node-fixture",
    portalId,
    sourceMapId: "map-main",
    targetMapId: "map-two",
    targetSpawnId: "map-two-entry",
    profileId,
    sourceSha256: `sha256:${"1".repeat(64)}`,
    targetSha256: `sha256:${"2".repeat(64)}`,
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
  };
}

test("connect_maps authors an inspectable runtime-join contract by default", () => {
  const project = connectedProject();
  const plan = buildRuntimeJoinPlan(project);
  assert.equal(plan.status, "ready");
  assert.equal(plan.joinCount, 1);
  assert.equal(plan.joins[0].portalId, "map-one-to-two");
  assert.equal(plan.joins[0].targetSpawnId, "map-two-entry");
  assert.equal(plan.joins[0].contract.mode, "continuous");
  assert.equal(plan.joins[0].contract.enabled, true);

  const headless = applyAgentCommand(project, { op: "get_runtime_join_plan" });
  assert.equal(headless.changed, false);
  assert.deepEqual(headless.result, plan);

  const manifest = getAgentManifest();
  assert.equal(manifest.protocolVersion, "1.103.0");
  assert.equal(manifest.runtimeJoinValidation.planCommand, "get_runtime_join_plan");
  assert.ok(manifest.requiredWorkflow.includes("get_runtime_join_plan"));
  assert.ok(manifest.exportedRuntime.methods.includes("getRuntimeJoinPlan"));
  for (const method of ["beginRuntimeJoinProbe", "commitRuntimeJoinProbe", "finishRuntimeJoinProbe"]) assert.ok(manifest.exportedRuntime.methods.includes(method));
  for (const command of ["begin_runtime_join_probe", "commit_runtime_join_probe", "finish_runtime_join_probe"]) assert.ok(manifest.exportedRuntime.commands.includes(command));
  assert.equal(manifest.exportedRuntime.version, "2.29.0");

  const html = buildStandaloneHtml(project);
  assert.match(html, /const runtimeJoinPlan=\{"schemaVersion":"looplab-runtime-join-plan\/v1"/);
  assert.match(html, /getRuntimeJoinPlan:function\(\)/);
  assert.match(html, /command\.op==='get_runtime_join_plan'/);
});

test("actual pixel analysis accepts a continuous boundary with new target content", () => {
  const dark = [24, 24, 28, 255];
  const seam = [72, 74, 80, 255];
  const unique = [42, 166, 192, 255];
  const sourceFrame = rgbaFrame(8, 6, (x) => x >= 6 ? seam : dark);
  const targetFrame = rgbaFrame(8, 6, (x) => x < 4 ? seam : unique);
  const result = analyzeRuntimeJoinPixels({
    sourceFrame,
    targetFrame,
    contract: {
      mode: "continuous",
      sourceEdge: "right",
      targetEdge: "left",
      overlapPixels: 2,
      sampleDepth: 2,
      minimumUniquePixelRatio: 0.1,
      maximumBoundaryColorDelta: 0.05,
    },
  });

  assert.equal(result.status, "passed");
  assert.equal(result.checks.find((check) => check.id === "boundary-color-continuity").passed, true);
  assert.ok(result.metrics.targetUniquePixelRatio >= 0.1);
});

test("a zero-overlap portal proves unique content from the full post-transition environment", () => {
  const edge = [72, 74, 80, 255];
  const sourceFrame = rgbaFrame(8, 6, (x) => x < 2 ? [24, 24, 28, 255] : edge);
  const targetFrame = rgbaFrame(8, 6, (x) => x < 2 ? edge : [42, 166, 192, 255]);
  const result = analyzeRuntimeJoinPixels({
    sourceFrame,
    targetFrame,
    contract: {
      mode: "portal",
      sourceEdge: "right",
      targetEdge: "left",
      overlapPixels: 0,
      sampleDepth: 2,
      minimumUniquePixelRatio: 0.1,
      maximumBoundaryColorDelta: 1,
    },
  });

  assert.equal(result.status, "passed");
  assert.equal(result.metrics.targetUniquePixelRatio, result.metrics.changedPixelRatio);
  assert.match(result.checks.find((check) => check.id === "next-unique-content").detail, /zero-overlap portal transition/);
});

test("copied overlap cannot pass when only distant pixels make the frames look different", () => {
  const dark = [24, 24, 28, 255];
  const copied = [72, 74, 80, 255];
  const distant = [210, 64, 90, 255];
  const sourceFrame = rgbaFrame(8, 6, (x) => x >= 6 ? copied : dark);
  const targetFrame = rgbaFrame(8, 6, (x) => x >= 6 ? distant : copied);
  const result = analyzeRuntimeJoinPixels({
    sourceFrame,
    targetFrame,
    contract: {
      mode: "continuous",
      sourceEdge: "right",
      targetEdge: "left",
      overlapPixels: 2,
      sampleDepth: 2,
      minimumUniquePixelRatio: 0.1,
      maximumBoundaryColorDelta: 0.05,
    },
  });

  assert.ok(result.metrics.changedPixelRatio >= 0.1, "the full frames differ, so a weak whole-frame check would pass");
  assert.equal(result.checks.find((check) => check.id === "next-unique-content").passed, false);
  assert.equal(result.status, "failed");
});

test("invalid runtime-join metadata is rejected by validation and Project Doctor", () => {
  const project = connectedProject();
  const malformed = clone(project);
  const source = malformed.maps.find((map) => map.id === malformed.startMapId);
  const portal = source.objects.find((object) => object.id === "map-one-to-two");
  portal.runtimeJoin.sourceEdge = "diagonal";
  portal.runtimeJoin.minimumUniquePixelRatio = 2;
  malformed.objects = clone(source.objects);

  const validation = validateProject(malformed);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("runtimeJoin.sourceEdge")));
  assert.ok(validation.errors.some((error) => error.includes("runtimeJoin.minimumUniquePixelRatio")));

  const doctor = analyzeProject(malformed);
  assert.equal(doctor.runtimeJoinPlan.status, "invalid");
  assert.ok(doctor.issues.some((issue) => issue.code === "runtime-join-source-edge"));
});

test("verification requires one source-bound runtime-join receipt per portal and profile", () => {
  const project = connectedProject();
  const sourceDigest = analyzeProject(project).sourceDigest;
  const requirements = verificationCoverageRequirements(project);
  assert.deepEqual(requirements.requiredJoinIds, ["map-one-to-two"]);
  assert.equal(requirements.requiredJoinCaptureCount, requirements.requiredProfileIds.length);

  const behavior = {
    version: 2,
    type: "automated-test",
    id: "behavior-fixture",
    status: "passed",
    sourceDigest,
    createdAt: "2026-08-08T12:00:00.000Z",
    checks: [{ id: "runtime-starts", status: "passed", detail: "Runtime started." }],
  };
  const receipts = requirements.requiredProfileIds.map((profileId) => runtimeJoinReceipt({ sourceDigest, portalId: "map-one-to-two", profileId }));
  const options = {
    sourceDigest,
    requireScreenshot: false,
    requiredProfileIds: requirements.requiredProfileIds,
    requiredJoinIds: requirements.requiredJoinIds,
  };
  assert.equal(validateVerificationEvidence([behavior, ...receipts], options).valid, true);

  const missing = validateVerificationEvidence([behavior, ...receipts.slice(1)], options);
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some((error) => error.includes("Runtime-join coverage")));
});
