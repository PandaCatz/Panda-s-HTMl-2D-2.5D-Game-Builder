import test from "node:test";
import assert from "node:assert/strict";

import { applyAgentCommand, createTemplate, getAgentManifest, validateProject } from "../lib/looplab-agent-core.mjs";
import { doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import {
  LOOPLAB_STRUCTURAL_SCAFFOLD_CONTRACT_SCHEMA,
  LOOPLAB_STRUCTURAL_SCAFFOLD_FAMILIES,
  LOOPLAB_STRUCTURAL_SCAFFOLD_MATERIALIZATION_SCHEMA,
  LOOPLAB_STRUCTURAL_SCAFFOLD_SEARCH_SCHEMA,
} from "../lib/looplab-structural-scaffolds.mjs";

function configuredBlank(options = {}) {
  const project = createTemplate("blank");
  const suggestion = applyAgentCommand(project, { op: "suggest_structural_scaffold_contract", ...options }).result;
  const stored = applyAgentCommand(project, { op: "set_structural_scaffold_contract", contract: suggestion.contract }).project;
  return { project: stored, contract: suggestion.contract, sourceDigest: doctorSourceDigest(stored) };
}

test("structural scaffold search returns deterministic, descriptor-distinct, cross-family safe candidates without a winner", () => {
  const { project, sourceDigest } = configuredBlank();
  const first = applyAgentCommand(project, { op: "run_structural_scaffold_search", expectedSourceDigest: sourceDigest });
  const second = applyAgentCommand(project, { op: "run_structural_scaffold_search", expectedSourceDigest: sourceDigest });
  assert.equal(first.changed, false);
  assert.equal(first.result.schemaVersion, LOOPLAB_STRUCTURAL_SCAFFOLD_SEARCH_SCHEMA);
  assert.equal(first.result.status, "completed");
  assert.equal(first.result.automaticWinner, null);
  assert.equal(first.result.providerUsage.totalTokens, 0);
  assert.equal(first.result.providerUsage.rateEquivalentUsd, 0);
  assert.deepEqual(first.result.candidates.map((candidate) => candidate.candidateDigest), second.result.candidates.map((candidate) => candidate.candidateDigest));
  assert.equal(new Set(first.result.candidates.map((candidate) => candidate.descriptors.cellId)).size, first.result.candidates.length);
  assert.deepEqual([...new Set(first.result.candidates.map((candidate) => candidate.family))].sort(), [...LOOPLAB_STRUCTURAL_SCAFFOLD_FAMILIES].sort());
  assert.ok(first.result.candidates.every((candidate) => candidate.safe && candidate.materializable && candidate.failedGateIds.length === 0));
});

test("materialization requires every content slot and returns an ordinary non-mutating preview batch", () => {
  const { project, sourceDigest } = configuredBlank();
  const search = applyAgentCommand(project, { op: "run_structural_scaffold_search", expectedSourceDigest: sourceDigest }).result;
  const selected = search.candidates.find((candidate) => candidate.family === "economy-loop");
  const slotValues = Object.fromEntries(selected.contentSlots.map((slot) => [slot.id, `Authored ${slot.defaultValue}`]));
  const materialized = applyAgentCommand(project, {
    op: "materialize_structural_scaffold",
    candidateId: selected.id,
    expectedCandidateDigest: selected.candidateDigest,
    expectedSourceDigest: sourceDigest,
    slotValues,
  });
  assert.equal(materialized.changed, false);
  assert.equal(materialized.result.schemaVersion, LOOPLAB_STRUCTURAL_SCAFFOLD_MATERIALIZATION_SCHEMA);
  assert.equal(materialized.result.mutatesProject, false);
  assert.deepEqual(materialized.result.previewCommand.commands.map((command) => command.op), ["set_project", "set_gameplay_program"]);
  assert.equal(JSON.stringify(materialized.result.previewCommand).includes("[[slot:"), false);
  const preview = applyAgentCommand(project, materialized.result.previewCommand);
  assert.equal(preview.changed, false);
  assert.equal(preview.result.validation.valid, true);
  assert.equal(preview.result.applicable, true);
  assert.equal(preview.result.commandErrors.length, 0);
  assert.equal(preview.result.authority.providerUsed, false);
});

test("existing gameplay programs remain protected unless replacement is explicit", () => {
  const project = createTemplate("blank");
  project.gameplayProgram = { version: 1, variables: [], rules: [], choicePages: [], clocks: [], hudBindings: [] };
  assert.equal(validateProject(project).valid, true);
  const suggestion = applyAgentCommand(project, { op: "suggest_structural_scaffold_contract" }).result;
  const stored = applyAgentCommand(project, { op: "set_structural_scaffold_contract", contract: suggestion.contract }).project;
  const sourceDigest = doctorSourceDigest(stored);
  const search = applyAgentCommand(stored, { op: "run_structural_scaffold_search", expectedSourceDigest: sourceDigest }).result;
  assert.ok(search.candidates.every((candidate) => candidate.replacementBlocked && candidate.materializationRequest === null));
  const candidate = search.candidates[0];
  assert.throws(() => applyAgentCommand(stored, {
    op: "materialize_structural_scaffold",
    candidateId: candidate.id,
    expectedCandidateDigest: candidate.candidateDigest,
    expectedSourceDigest: sourceDigest,
    slotValues: Object.fromEntries(candidate.contentSlots.map((slot) => [slot.id, slot.defaultValue])),
  }), /existing gameplay program is protected/i);
});

test("structural scaffold contracts and receipts fail closed on unknown fields, stale source, candidate tampering, and incomplete slots", () => {
  const { project, contract, sourceDigest } = configuredBlank();
  assert.equal(contract.schemaVersion, LOOPLAB_STRUCTURAL_SCAFFOLD_CONTRACT_SCHEMA);
  assert.throws(() => applyAgentCommand(project, { op: "set_structural_scaffold_contract", contract: { ...contract, hiddenAuthority: true } }), /unsupported field/i);
  assert.throws(() => applyAgentCommand(project, { op: "run_structural_scaffold_search", expectedSourceDigest: "source-stale" }), /stale-source/i);
  const search = applyAgentCommand(project, { op: "run_structural_scaffold_search", expectedSourceDigest: sourceDigest }).result;
  const candidate = search.candidates[0];
  assert.throws(() => applyAgentCommand(project, {
    op: "materialize_structural_scaffold",
    candidateId: candidate.id,
    expectedCandidateDigest: `${candidate.candidateDigest.slice(0, -1)}${candidate.candidateDigest.endsWith("0") ? "1" : "0"}`,
    expectedSourceDigest: sourceDigest,
    slotValues: {},
  }), /candidate digest is stale/i);
  assert.throws(() => applyAgentCommand(project, {
    op: "materialize_structural_scaffold",
    candidateId: candidate.id,
    expectedCandidateDigest: candidate.candidateDigest,
    expectedSourceDigest: sourceDigest,
    slotValues: {},
  }), /must be a string/i);
});

test("agent manifest exposes the structural scaffold capability on core, browser, and MCP-derived contracts", () => {
  const manifest = getAgentManifest();
  const operations = ["get_structural_scaffold_contract", "suggest_structural_scaffold_contract", "set_structural_scaffold_contract", "remove_structural_scaffold_contract", "run_structural_scaffold_search", "materialize_structural_scaffold"];
  for (const operation of operations) {
    assert.ok(manifest.commandSurfaces.core.includes(operation));
    assert.ok(manifest.commandSurfaces.browserSession.includes(operation));
    assert.ok(manifest.commandContracts.commands.some((contract) => contract.op === operation));
  }
  assert.equal(manifest.structuralScaffoldSearch.searchSchema, LOOPLAB_STRUCTURAL_SCAFFOLD_SEARCH_SCHEMA);
  assert.equal(manifest.structuralScaffoldSearch.selectionPolicy.includes("automaticWinner is always null"), true);
});
