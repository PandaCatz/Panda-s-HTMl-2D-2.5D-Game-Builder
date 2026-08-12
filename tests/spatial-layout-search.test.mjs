import test from "node:test";
import assert from "node:assert/strict";

import { applyAgentCommand, createTemplate, getAgentManifest, validateProject } from "../lib/looplab-agent-core.mjs";
import { analyzeProject, doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import {
  LOOPLAB_SPATIAL_LAYOUT_CONTRACT_SCHEMA,
  LOOPLAB_SPATIAL_LAYOUT_FAMILIES,
  LOOPLAB_SPATIAL_LAYOUT_MATERIALIZATION_SCHEMA,
  LOOPLAB_SPATIAL_LAYOUT_SEARCH_SCHEMA,
} from "../lib/looplab-spatial-layouts.mjs";

function configuredTemplate(template = "blank", options = {}) {
  const project = createTemplate(template);
  const suggestion = applyAgentCommand(project, { op: "suggest_spatial_layout_contract", ...options }).result;
  const stored = applyAgentCommand(project, { op: "set_spatial_layout_contract", contract: suggestion.contract }).project;
  return { project: stored, contract: suggestion.contract, suggestion, sourceDigest: doctorSourceDigest(stored) };
}

test("spatial suggestions choose the projection-compatible family and pin critical authored actors", () => {
  const expected = new Map([
    ["blank", "sideview-route"],
    ["topdown", "topdown-route"],
    ["dimetric", "dimetric-layered-route"],
  ]);
  for (const [template, family] of expected) {
    const project = createTemplate(template);
    const suggestion = applyAgentCommand(project, { op: "suggest_spatial_layout_contract" }).result;
    assert.equal(suggestion.available, true);
    assert.equal(suggestion.compatibleFamily, family);
    assert.deepEqual(suggestion.contract.families, [family]);
    const map = project.maps.find((entry) => entry.id === suggestion.contract.mapId);
    const mandatoryPins = map.objects.filter((object) => ["player", "spawn", "goal", "portal"].includes(object.kind) || object.locked === true || object.spatialLayoutPinned === true).map((object) => object.id);
    for (const id of mandatoryPins) assert.ok(suggestion.contract.pinnedObjectIds.includes(id), `missing mandatory pin ${id}`);
  }
});

test("spatial search is deterministic, read-only, descriptor-distinct, and never chooses a winner", () => {
  const { project, sourceDigest } = configuredTemplate("blank", { allowReplacement: true, maxCandidates: 6 });
  const sourceBefore = JSON.stringify(project);
  const first = applyAgentCommand(project, { op: "run_spatial_layout_search", expectedSourceDigest: sourceDigest });
  const second = applyAgentCommand(project, { op: "run_spatial_layout_search", expectedSourceDigest: sourceDigest });
  assert.equal(first.changed, false);
  assert.equal(JSON.stringify(project), sourceBefore);
  assert.equal(first.result.schemaVersion, LOOPLAB_SPATIAL_LAYOUT_SEARCH_SCHEMA);
  assert.equal(first.result.status, "completed");
  assert.equal(first.result.automaticWinner, null);
  assert.equal(first.result.providerUsage.totalTokens, 0);
  assert.equal(first.result.providerUsage.rateEquivalentUsd, 0);
  assert.deepEqual(first.result.candidates.map((candidate) => candidate.candidateDigest), second.result.candidates.map((candidate) => candidate.candidateDigest));
  assert.equal(new Set(first.result.candidates.map((candidate) => candidate.descriptors.cellId)).size, first.result.candidates.length);
  assert.ok(first.result.candidates.length >= 2);
  assert.ok(first.result.candidates.every((candidate) => candidate.safe && candidate.materializable && candidate.failedGateIds.length === 0));
});

test("accepted top-down evidence protects its route while dimetric search produces safe supported layouts", () => {
  const topdown = configuredTemplate("topdown", { allowReplacement: true, maxCandidates: 6 });
  const topdownSearch = applyAgentCommand(topdown.project, { op: "run_spatial_layout_search", expectedSourceDigest: topdown.sourceDigest }).result;
  assert.ok(topdownSearch.candidates.length > 0);
  assert.ok(topdownSearch.candidates.every((candidate) => !candidate.safe && !candidate.materializable));
  assert.ok(topdownSearch.candidates.every((candidate) => candidate.failedGateIds.some((id) => id.includes("acceptance-non-regression"))));
  assert.ok(topdownSearch.candidates.every((candidate) => candidate.failedGateIds.some((id) => id.includes("replay-non-regression"))));

  const dimetric = createTemplate("dimetric");
  const doctor = analyzeProject(dimetric, { profile: "prototype" });
  assert.deepEqual(doctor.issues.filter((issue) => issue.code === "support-missing"), []);
  const { project, sourceDigest } = configuredTemplate("dimetric", { allowReplacement: true, maxCandidates: 6 });
  const search = applyAgentCommand(project, { op: "run_spatial_layout_search", expectedSourceDigest: sourceDigest }).result;
  const layered = search.candidates.find((candidate) => candidate.id === "dimetric-deck-underpass");
  assert.equal(layered.safe, true);
  assert.ok(layered.preview.routes.some((route) => route.points.some((point) => point.z === 0)));
  assert.ok(layered.preview.routes.some((route) => route.points.some((point) => point.z === 4)));
  assert.ok(layered.preview.objects.some((object) => object.id === "spatial-deck-underpass-support-north"));
  assert.ok(layered.preview.objects.some((object) => object.id === "spatial-deck-underpass-support-south"));
});

test("materialization preserves exact pins and returns an ordinary applicable preview batch", () => {
  const { project, sourceDigest } = configuredTemplate("blank", { allowReplacement: true, maxCandidates: 6 });
  const search = applyAgentCommand(project, { op: "run_spatial_layout_search", expectedSourceDigest: sourceDigest }).result;
  const selected = search.candidates.find((candidate) => candidate.safe && candidate.materializable);
  const materialized = applyAgentCommand(project, selected.materializationRequest);
  assert.equal(materialized.changed, false);
  assert.equal(materialized.result.schemaVersion, LOOPLAB_SPATIAL_LAYOUT_MATERIALIZATION_SCHEMA);
  assert.equal(materialized.result.mutatesProject, false);
  assert.equal(materialized.result.automaticWinner, null);
  assert.deepEqual(materialized.result.previewCommand.commands.map((command) => command.op), ["update_map"]);
  const map = project.maps.find((entry) => entry.id === selected.mapId);
  const changedObjects = materialized.result.previewCommand.commands[0].changes.objects;
  for (const id of selected.pinnedObjectIds) {
    assert.deepEqual(changedObjects.find((object) => object.id === id), map.objects.find((object) => object.id === id));
  }
  const preview = applyAgentCommand(project, materialized.result.previewCommand);
  assert.equal(preview.changed, false);
  assert.equal(preview.result.applicable, true);
  assert.equal(preview.result.validation.valid, true);
  assert.deepEqual(preview.result.commandErrors, []);
});

test("existing geometry remains protected until replacement is explicit", () => {
  const { project, sourceDigest } = configuredTemplate("blank");
  const search = applyAgentCommand(project, { op: "run_spatial_layout_search", expectedSourceDigest: sourceDigest }).result;
  assert.ok(search.candidates.some((candidate) => candidate.safe));
  assert.ok(search.candidates.every((candidate) => candidate.replacementBlocked && !candidate.materializable && candidate.materializationRequest === null));
  const candidate = search.candidates.find((entry) => entry.safe);
  assert.throws(() => applyAgentCommand(project, {
    op: "materialize_spatial_layout",
    candidateId: candidate.id,
    expectedCandidateDigest: candidate.candidateDigest,
    expectedSourceDigest: sourceDigest,
  }), /existing map is protected/i);
});

test("accepted platformer evidence rejects geometry changes instead of being rerecorded", () => {
  const { project, sourceDigest } = configuredTemplate("platformer", { allowReplacement: true, maxCandidates: 6 });
  const search = applyAgentCommand(project, { op: "run_spatial_layout_search", expectedSourceDigest: sourceDigest }).result;
  assert.ok(search.candidates.length > 0);
  assert.ok(search.candidates.every((candidate) => !candidate.safe && !candidate.materializable && candidate.materializationRequest === null));
  assert.ok(search.candidates.every((candidate) => candidate.failedGateIds.some((id) => id.includes("acceptance-non-regression"))));
  assert.ok(search.candidates.every((candidate) => candidate.failedGateIds.some((id) => id.includes("replay-non-regression"))));
  assert.equal(validateProject(project).valid, true);
});

test("spatial contracts and receipts fail closed on unknown fields, incompatible families, stale sources, and tampering", () => {
  const { project, contract, sourceDigest } = configuredTemplate("blank", { allowReplacement: true });
  assert.equal(contract.schemaVersion, LOOPLAB_SPATIAL_LAYOUT_CONTRACT_SCHEMA);
  assert.throws(() => applyAgentCommand(project, { op: "set_spatial_layout_contract", contract: { ...contract, hiddenAuthority: true } }), /not supported/i);
  assert.throws(() => applyAgentCommand(project, { op: "set_spatial_layout_contract", contract: { ...contract, families: ["topdown-route"] } }), /incompatible/i);
  assert.throws(() => applyAgentCommand(project, { op: "run_spatial_layout_search", expectedSourceDigest: "source-stale" }), /stale-source/i);
  const search = applyAgentCommand(project, { op: "run_spatial_layout_search", expectedSourceDigest: sourceDigest }).result;
  const candidate = search.candidates.find((entry) => entry.safe);
  assert.throws(() => applyAgentCommand(project, {
    op: "materialize_spatial_layout",
    candidateId: candidate.id,
    expectedCandidateDigest: `${candidate.candidateDigest.slice(0, -1)}${candidate.candidateDigest.endsWith("0") ? "1" : "0"}`,
    expectedSourceDigest: sourceDigest,
  }), /candidate digest is stale/i);
});

test("Doctor and the generated agent manifest expose the complete spatial layout capability", () => {
  const { project } = configuredTemplate("blank");
  const doctor = analyzeProject(project, { profile: "prototype" });
  assert.equal(doctor.spatialLayoutReport.present, true);
  assert.equal(doctor.spatialLayoutReport.contract.schemaVersion, LOOPLAB_SPATIAL_LAYOUT_CONTRACT_SCHEMA);
  const manifest = getAgentManifest();
  const operations = ["get_spatial_layout_contract", "suggest_spatial_layout_contract", "set_spatial_layout_contract", "remove_spatial_layout_contract", "run_spatial_layout_search", "materialize_spatial_layout"];
  for (const operation of operations) {
    assert.ok(manifest.commandSurfaces.core.includes(operation));
    assert.ok(manifest.commandSurfaces.browserSession.includes(operation));
    assert.ok(manifest.commandContracts.commands.some((contract) => contract.op === operation));
  }
  assert.deepEqual(manifest.spatialLayoutSearch.families, LOOPLAB_SPATIAL_LAYOUT_FAMILIES);
  assert.equal(manifest.spatialLayoutSearch.searchSchema, LOOPLAB_SPATIAL_LAYOUT_SEARCH_SCHEMA);
  assert.match(manifest.spatialLayoutSearch.selectionPolicy, /automaticWinner is always null/i);
});
