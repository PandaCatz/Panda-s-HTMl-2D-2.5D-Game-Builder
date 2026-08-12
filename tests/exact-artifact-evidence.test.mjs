import assert from "node:assert/strict";
import test from "node:test";

import { applyAgentCommand, buildVerificationHtml, createTemplate } from "../lib/looplab-agent-core.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { collectExactArtifactVerificationEvidence, LOOPLAB_EXACT_ARTIFACT_EVIDENCE_SCHEMA } from "../lib/looplab-exact-artifact-evidence.mjs";

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
    runtimeJoin: { mode: "portal", sourceEdge: "right", targetEdge: "left", overlapPixels: 0, sampleDepth: 8, minimumUniquePixelRatio: 0.001, maximumBoundaryColorDelta: 1 },
  }).project;
  const player = structuredClone(project.maps[0].objects.find((object) => object.kind === "player"));
  player.id = "player-two";
  project.maps.find((map) => map.id === "map-two").objects.push(player);
  return project;
}

test("the installed browser proves every exact artifact map, device profile, DPR, and visible runtime join", { timeout: 90_000 }, async () => {
  const project = connectedProject();
  const doctor = analyzeProject(project);
  const receipt = await collectExactArtifactVerificationEvidence({ html: buildVerificationHtml(project), project, sourceDigest: doctor.sourceDigest });

  assert.equal(receipt.schemaVersion, LOOPLAB_EXACT_ARTIFACT_EVIDENCE_SCHEMA);
  assert.equal(receipt.status, "passed", receipt.validation.errors.join("\n"));
  assert.equal(receipt.sourceDigest, doctor.sourceDigest);
  assert.match(receipt.artifactSha256, /^sha256:[a-f0-9]{64}$/);
  assert.ok(receipt.browser?.version);
  const screenshots = receipt.evidenceRefs.filter((entry) => entry.type === "screenshot");
  const responsive = receipt.evidenceRefs.filter((entry) => entry.type === "responsive");
  const joins = receipt.evidenceRefs.filter((entry) => entry.type === "runtime-join");
  assert.equal(screenshots.length, receipt.plan.maps.length * receipt.plan.profiles.length);
  assert.equal(responsive.length, receipt.plan.profiles.length);
  assert.equal(joins.length, receipt.plan.joins.length * receipt.plan.profiles.length);
  for (const screenshot of screenshots) {
    assert.equal(screenshot.status, "passed");
    assert.equal(screenshot.contentStats.flatFrame, false);
    assert.ok(screenshot.contentStats.distinctQuantizedColorCount >= 4);
    assert.ok(screenshot.contentStats.luminanceStdDev >= 1);
  }
  for (const profile of receipt.plan.profiles) {
    const evidence = responsive.find((entry) => entry.profileId === profile.id);
    assert.equal(evidence.status, "passed");
    assert.equal(evidence.viewport.width, profile.width);
    assert.equal(evidence.viewport.height, profile.height);
    assert.equal(evidence.viewport.devicePixelRatio, profile.dpr);
  }
  for (const join of joins) {
    assert.equal(join.status, "passed");
    assert.equal(join.actualVisibleJoin, true);
    assert.equal(join.playerExcluded, true);
    assert.equal(join.checks.find((check) => check.id === "exact-target-spawn")?.status, "passed");
    assert.equal(join.checks.find((check) => check.id === "clear-target-landing")?.status, "passed");
  }
  assert.deepEqual(receipt.usage, { provider: "local", model: "none", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, estimatedUsd: 0, billingBasis: "local-operation", actualChargeClaimed: false });
});