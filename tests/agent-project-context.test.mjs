import assert from "node:assert/strict";
import test from "node:test";

import {
  LOOPLAB_PROTOCOL_VERSION,
  applyAgentCommand,
  createTemplate,
  getAgentManifest,
} from "../lib/looplab-agent-core.mjs";
import { getLooplabCommandContracts } from "../lib/looplab-agent-contracts.mjs";

test("agent brief counts the complete connected campaign instead of only the active map", () => {
  const project = createTemplate("kinetic");
  const brief = applyAgentCommand(project, { op: "get_agent_brief", maxNextActions: 10 }).result;

  assert.equal(brief.project.mapCount, 2);
  assert.equal(brief.project.objectCount, 24);
  assert.equal(brief.project.byKind.goal, 1);
  assert.equal(brief.campaignIndex.total, 2);
  assert.deepEqual(brief.campaignIndex.maps.map((map) => map.id), ["map-plaza", "map-river"]);
  assert.deepEqual(brief.campaignIndex.maps.find((map) => map.id === "map-river").objectIdsByKind.goal.ids, ["river-finish"]);
  assert.ok(brief.nextActions.some((action) => action.op === "get_project_context"));
});

test("agent brief distinguishes the active authoring gate from production readiness", () => {
  const project = createTemplate("kinetic");
  const brief = applyAgentCommand(project, { op: "get_agent_brief", maxFindings: 8, maxNextActions: 10 }).result;

  assert.equal(brief.schemaVersion, "looplab-agent-brief/v2");
  assert.equal(brief.readiness.schemaVersion, "looplab-agent-readiness/v1");
  assert.equal(brief.readiness.sourceDigest, brief.sourceDigest);
  assert.equal(brief.readiness.current.profile, "prototype");
  assert.equal(brief.readiness.current.score, 100);
  assert.equal(brief.readiness.current.blocking, false);
  assert.equal(brief.readiness.release.profile, "production");
  assert.equal(brief.readiness.release.score, 96);
  assert.equal(brief.readiness.release.blocking, true);
  assert.equal(brief.readiness.releaseDelta.blockingOnlyAtRelease, true);
  assert.equal(brief.readiness.releaseDelta.findingCount, 2);
  assert.deepEqual(brief.readiness.releaseDelta.findings.map((finding) => finding.code).sort(), ["offline-unverified", "replay-fixtures-missing"]);
  assert.ok(brief.nextActions.some((action) => action.op === "get_doctor" && action.args.profile === "production"));
  assert.match(brief.readiness.interpretation, /current-profile pass is not release readiness/i);
});

test("production brief does not invent a release delta against itself", () => {
  const project = createTemplate("kinetic");
  const brief = applyAgentCommand(project, { op: "get_agent_brief", profile: "production" }).result;

  assert.equal(brief.readiness.current.profile, "production");
  assert.equal(brief.readiness.release.profile, "production");
  assert.equal(brief.readiness.current.digest, brief.readiness.release.digest);
  assert.equal(brief.readiness.releaseDelta.findingCount, 0);
  assert.equal(brief.readiness.releaseDelta.blockingOnlyAtRelease, false);
});

test("prototype verification may protect an iteration but never authorizes release export", () => {
  const project = createTemplate("kinetic");
  const initial = applyAgentCommand(project, { op: "get_agent_brief", maxNextActions: 10 }).result;
  project.iteration.status = "verified";
  project.iteration.verification = {
    sourceDigest: initial.sourceDigest,
    digest: initial.readiness.current.digest,
    profile: "prototype",
    evidenceRefs: [],
  };

  const brief = applyAgentCommand(project, { op: "get_agent_brief", maxNextActions: 10 }).result;

  assert.equal(brief.lifecycle.verificationCurrent, true);
  assert.equal(brief.readiness.release.blocking, true);
  assert.ok(brief.nextActions.some((action) => action.op === "get_doctor" && action.args.profile === "production"));
  assert.ok(brief.nextActions.some((action) => action.op === "promote_iteration" && /does not establish production release readiness/i.test(action.reason)));
  assert.ok(!brief.nextActions.some((action) => action.op === "export_html"));
  assert.ok(!brief.playbook.matches.some((recipe) => recipe.id === "release-one-file-html" && recipe.relevance.reasons.includes("state:release-candidate")));

  const productionBrief = applyAgentCommand(project, { op: "get_agent_brief", profile: "production", maxNextActions: 10 }).result;
  assert.equal(productionBrief.lifecycle.verificationCurrent, false);
  assert.ok(!productionBrief.nextActions.some((action) => action.op === "promote_iteration"));
  assert.ok(!productionBrief.nextActions.some((action) => action.op === "export_html"));
});

test("campaign context is source-bound, omission-explicit, payload-free, and materially smaller", () => {
  const project = createTemplate("kinetic");
  project.designBrief.composedPrompt = "COMPOSED-PROMPT-SENTINEL";
  project.designBrief.providerPrompt = "PROVIDER-PROMPT-SENTINEL";
  project.assets[0].dataUrl = "data:image/png;base64,ASSET-PAYLOAD-SENTINEL";
  project.iterationArchive = { snapshots: [{ html: "EXPORTED-HTML-SENTINEL" }] };
  project.maps[1].authToken = "MAP-AUTH-TOKEN-SENTINEL";
  project.maps[1].pixels = ["MAP-PIXEL-PAYLOAD-SENTINEL"];
  project.maps[1].exportedHtml = "MAP-EXPORTED-HTML-SENTINEL";

  const outcome = applyAgentCommand(project, { op: "get_project_context", view: "campaign" });
  const context = outcome.result;
  const serialized = JSON.stringify(context);

  assert.equal(outcome.changed, false);
  assert.deepEqual(outcome.project, project);
  assert.equal(context.schemaVersion, "looplab-agent-project-context/v1");
  assert.equal(context.protocolVersion, LOOPLAB_PROTOCOL_VERSION);
  assert.match(context.sourceDigest, /^source-[a-f0-9]{64}$/);
  assert.equal(context.sourceOfTruth, false);
  assert.equal(context.mutationInput, false);
  assert.equal(context.verificationEvidence, false);
  assert.equal(context.campaign.objectCount, 24);
  assert.equal(context.campaign.byKind.goal, 1);
  assert.equal(context.mapDocuments.length, 0);
  assert.equal(context.connections[0].sourceMapId, "map-plaza");
  assert.equal(context.connections[0].targetMapId, "map-river");
  assert.equal(context.connections[0].runtimeJoinPresent, true);
  assert.equal(context.evidenceIndex.readiness.current.profile, "prototype");
  assert.equal(context.evidenceIndex.readiness.release.profile, "production");
  assert.equal(context.evidenceIndex.readiness.releaseDelta.findingCount, 2);
  assert.ok(context.measurements.payloadCharacters < context.measurements.fullProjectCharacters * 0.8);
  assert.equal(context.measurements.smallerThanFullProject, true);
  assert.equal(context.measurements.overheadCharacters, 0);
  assert.ok(context.measurements.roughTokenEstimate > 0);
  assert.doesNotMatch(serialized, /ASSET-PAYLOAD-SENTINEL|COMPOSED-PROMPT-SENTINEL|PROVIDER-PROMPT-SENTINEL|EXPORTED-HTML-SENTINEL|MAP-AUTH-TOKEN-SENTINEL|MAP-PIXEL-PAYLOAD-SENTINEL|MAP-EXPORTED-HTML-SENTINEL/);
  assert.doesNotMatch(serialized, /data:image\/png;base64/);
  assert.match(context.omissionPolicy.interpretation, /never evidence.*absent/i);
});

test("map context returns the exact selected authoring map without unrelated map documents", () => {
  const project = createTemplate("kinetic");
  project.maps[1].authToken = "SELECTED-MAP-AUTH-TOKEN-SENTINEL";
  project.maps[1].pixels = ["SELECTED-MAP-PIXEL-SENTINEL"];
  project.maps[1].exportedHtml = "SELECTED-MAP-HTML-SENTINEL";
  const campaignDigest = applyAgentCommand(project, { op: "get_project_context", view: "campaign" }).result.sourceDigest;
  const context = applyAgentCommand(project, { op: "get_project_context", view: "map", mapIds: ["map-river"] }).result;

  assert.equal(context.sourceDigest, campaignDigest);
  assert.deepEqual(context.selectedMapIds, ["map-river"]);
  assert.equal(context.mapDocuments.length, 1);
  assert.equal(context.mapDocuments[0].id, "map-river");
  assert.ok(context.mapDocuments[0].objects.some((object) => object.id === "river-finish" && object.kind === "goal"));
  assert.ok(!context.mapDocuments.some((map) => map.id === "map-plaza"));
  assert.deepEqual(context.assets.referencedBySelectedMaps.sort(), [...new Set(context.mapDocuments[0].objects.map((object) => object.assetId).filter(Boolean))].sort());
  assert.doesNotMatch(JSON.stringify(context), /SELECTED-MAP-AUTH-TOKEN-SENTINEL|SELECTED-MAP-PIXEL-SENTINEL|SELECTED-MAP-HTML-SENTINEL/);
});

test("project context rejects ambiguous or invalid map requests", () => {
  const project = createTemplate("kinetic");
  assert.throws(() => applyAgentCommand(project, { op: "get_project_context", view: "everything" }), /campaign or map/);
  assert.throws(() => applyAgentCommand(project, { op: "get_project_context", view: "map" }), /requires at least one stable mapId/);
  assert.throws(() => applyAgentCommand(project, { op: "get_project_context", mapIds: "map-river" }), /mapIds must be an array/);
  assert.throws(() => applyAgentCommand(project, { op: "get_project_context", view: "map", mapIds: ["map-river", "map-river"] }), /must not contain duplicates/);
  assert.throws(() => applyAgentCommand(project, { op: "get_project_context", view: "map", mapIds: [42] }), /only non-empty strings/);
  assert.throws(() => applyAgentCommand(project, { op: "get_project_context", mapLimit: 0 }), /integer from 1 to 64/);
  assert.throws(() => applyAgentCommand(project, { op: "get_project_context", mapLimit: 1.5 }), /integer from 1 to 64/);
  assert.throws(() => applyAgentCommand(project, { op: "get_project_context", mapLimit: "2" }), /integer from 1 to 64/);
  assert.throws(() => applyAgentCommand(project, { op: "get_project_context", view: "map", mapIds: ["missing-map"] }), /Unknown mapIds: missing-map/);
  assert.throws(() => applyAgentCommand(project, { op: "get_project_context", view: "map", mapIds: Array.from({ length: 9 }, (_, index) => `map-${index}`) }), /at most 8 mapIds/);
});

test("campaign navigation totals do not duplicate an unscoped active-map mirror", () => {
  const project = createTemplate("kinetic");
  const active = project.maps.find((map) => map.id === project.activeMapId);
  const inactive = project.maps.find((map) => map.id !== project.activeMapId);
  project.navigation = {
    layers: [{ id: "legacy-layer" }],
    nodes: [{ id: "legacy-node" }],
    links: [],
    areas: [],
  };
  delete active.navigation;
  delete inactive.navigation;

  const context = applyAgentCommand(project, { op: "get_project_context", view: "campaign" }).result;

  assert.equal(context.campaign.navigation.layers, 1);
  assert.equal(context.campaign.navigation.nodes, 1);
  assert.equal(context.maps.entries.find((map) => map.id === project.activeMapId).navigation.layers, 1);
  assert.equal(context.maps.entries.find((map) => map.id !== project.activeMapId).navigation.layers, 0);
});

test("manifest and typed command contracts publish the bounded context workflow", () => {
  const manifest = getAgentManifest();
  const contract = getLooplabCommandContracts().find((entry) => entry.op === "get_project_context");

  assert.equal(manifest.protocolVersion, "1.105.0");
  assert.equal(manifest.commandSurfaces.core.length, 190);
  assert.equal(manifest.commandSurfaces.browserSession.length, 271);
  assert.equal(manifest.requiredWorkflow[0], "list_shared_projects");
  assert.equal(manifest.requiredWorkflow[1], "get_agent_changes");
  assert.equal(manifest.requiredWorkflow[2], "get_agent_brief");
  assert.ok(manifest.requiredWorkflow.indexOf("get_project_context") < manifest.requiredWorkflow.indexOf("route_work"));
  assert.equal(manifest.agentProjectContext.schemaVersion, "looplab-agent-project-context/v1");
  assert.equal(manifest.agentReadiness.schemaVersion, "looplab-agent-readiness/v1");
  assert.deepEqual(manifest.agentProjectContext.views, ["campaign", "map"]);
  assert.deepEqual(contract.surfaces, ["core", "browser-session"]);
  assert.equal(contract.annotations.readOnlyHint, true);
  assert.deepEqual(contract.inputSchema.properties.view.enum, ["campaign", "map"]);
  assert.equal(contract.inputSchema.properties.mapIds.maxItems, 8);
});
