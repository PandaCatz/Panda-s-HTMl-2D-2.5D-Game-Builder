import test from "node:test";
import assert from "node:assert/strict";

import { applyAgentCommand, createTemplate, getAgentManifest, validateProject } from "../lib/looplab-agent-core.mjs";
import { analyzeProject, doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import { composeDirectedGameBrief } from "../lib/looplab-game-director.mjs";
import {
  LOOPLAB_GAME_FOUNDATION_IDS,
  LOOPLAB_GAME_FOUNDATION_MATERIALIZATION_SCHEMA,
  LOOPLAB_GAME_FOUNDATION_REGISTRY_SCHEMA,
  LOOPLAB_GAME_FOUNDATION_SEARCH_SCHEMA,
} from "../lib/looplab-game-foundations.mjs";

test("top-down reference is a complete deterministic state-changing foundation", () => {
  const project = createTemplate("topdown");
  const doctor = analyzeProject(project, { profile: "prototype" });
  assert.equal(validateProject(project).valid, true);
  assert.equal(doctor.score, 100);
  assert.equal(doctor.errorCount, 0);
  assert.equal(doctor.warningCount, 0);
  assert.equal(doctor.acceptanceResults.status, "passed");
  assert.equal(doctor.replayResults.status, "passed");
  assert.equal(doctor.completionReport.status, "passed");
  assert.equal(doctor.completionReport.proof, "authored-acceptance");
  assert.equal(project.gameplayProgram.rules.length, 2);
  assert.ok(project.objects.some((object) => object.kind === "hazard"));
  assert.equal(project.objects.find((object) => object.id === "goal").hidden, true);
});

test("foundation registry derives proof maturity from real source and evidence", () => {
  const project = createTemplate("blank");
  const outcome = applyAgentCommand(project, { op: "list_game_foundations" });
  assert.equal(outcome.changed, false);
  assert.equal(outcome.result.schemaVersion, LOOPLAB_GAME_FOUNDATION_REGISTRY_SCHEMA);
  assert.deepEqual(outcome.result.foundations.map((entry) => entry.id), LOOPLAB_GAME_FOUNDATION_IDS);
  assert.deepEqual(outcome.result.provenPlayableIds.sort(), ["platformer", "systems", "topdown"]);
  assert.deepEqual(outcome.result.validatedStarterIds.sort(), ["dimetric", "kinetic"]);
  assert.equal(outcome.result.providerUsage.totalTokens, 0);
  assert.equal(outcome.result.providerUsage.rateEquivalentUsd, 0);
  assert.ok(outcome.result.foundations.find((entry) => entry.id === "kinetic").gapLedger.some((gap) => gap.id === "replay-not-proven"));
  assert.ok(outcome.result.foundations.find((entry) => entry.id === "dimetric").gapLedger.some((gap) => gap.id === "completion-not-proven"));
});

test("directed-brief routing is deterministic, preserves alternatives, and never chooses a winner", () => {
  const project = createTemplate("blank");
  project.designBrief = composeDirectedGameBrief({
    userPrompt: "A relic hunt in a compact overhead ruin.",
    genre: "action-adventure",
    coreLoop: "explore-collect-unlock",
    movementTemplate: "top-down-action-rpg",
    format: "top-down",
    progression: "level-campaign",
    campaignScope: "single-map",
  });
  const first = applyAgentCommand(project, { op: "suggest_game_foundations", allowReplacement: true }).result;
  const second = applyAgentCommand(project, { op: "suggest_game_foundations", allowReplacement: true }).result;
  assert.equal(first.schemaVersion, LOOPLAB_GAME_FOUNDATION_SEARCH_SCHEMA);
  assert.equal(first.automaticWinner, null);
  assert.equal(first.candidates[0].id, "topdown");
  assert.equal(first.candidates[0].fit.compatible, true);
  assert.equal(first.candidates[0].preparedProofComplete, true);
  assert.equal(first.candidates[0].preparedReadiness, "proven-playable");
  assert.equal(first.candidates[0].preparedDoctor.prototype.errorCount, 0);
  assert.equal(first.candidates[0].materializable, true);
  assert.ok(first.candidates.some((candidate) => !candidate.fit.compatible));
  assert.deepEqual(first.candidates.map((candidate) => candidate.candidateDigest), second.candidates.map((candidate) => candidate.candidateDigest));
  assert.equal(first.providerUsage.totalTokens, 0);
});

test("loaded projects are protected until explicit foundation replacement is reviewed", () => {
  const project = createTemplate("blank");
  const protectedSearch = applyAgentCommand(project, { op: "suggest_game_foundations" }).result;
  assert.ok(protectedSearch.candidates.some((candidate) => candidate.safe));
  assert.ok(protectedSearch.candidates.every((candidate) => !candidate.materializable && candidate.replacementBlocked));
  const candidate = protectedSearch.candidates.find((entry) => entry.id === "topdown");
  assert.throws(() => applyAgentCommand(project, {
    op: "materialize_game_foundation",
    foundationId: candidate.id,
    expectedCandidateDigest: candidate.candidateDigest,
    expectedSourceDigest: doctorSourceDigest(project),
    allowReplacement: false,
  }), /protected/i);
});

test("foundation materialization is source-bound, read-only, and returns an applicable ordinary preview", () => {
  const project = createTemplate("blank");
  project.name = "Keep This Project Name";
  project.designBrief = composeDirectedGameBrief({ userPrompt: "A compact top-down relic route.", format: "top-down", movementTemplate: "top-down-action-rpg" });
  const sourceDigest = doctorSourceDigest(project);
  const sourceBefore = JSON.stringify(project);
  const search = applyAgentCommand(project, { op: "suggest_game_foundations", allowReplacement: true }).result;
  const selected = search.candidates.find((candidate) => candidate.id === "topdown");
  const materialized = applyAgentCommand(project, selected.materializationRequest);
  assert.equal(materialized.changed, false);
  assert.equal(JSON.stringify(project), sourceBefore);
  assert.equal(materialized.result.schemaVersion, LOOPLAB_GAME_FOUNDATION_MATERIALIZATION_SCHEMA);
  assert.equal(materialized.result.mutatesProject, false);
  assert.equal(materialized.result.automaticWinner, null);
  assert.deepEqual(materialized.result.previewCommand.commands.map((command) => command.op), ["replace_project"]);
  assert.equal(materialized.result.previewCommand.commands[0].project.name, "Keep This Project Name");
  assert.deepEqual(materialized.result.previewCommand.commands[0].project.designBrief, project.designBrief);
  const preview = applyAgentCommand(project, materialized.result.previewCommand);
  assert.equal(preview.changed, false);
  assert.equal(preview.result.changed, true);
  assert.equal(preview.result.applicable, true);
  assert.equal(preview.result.validation.valid, true);
  assert.deepEqual(preview.result.commandErrors, []);
  assert.equal(preview.result.sourceDigest, sourceDigest);
});

test("foundation materialization fails closed on stale source, digest tampering, and unproven starters", () => {
  const project = createTemplate("blank");
  const sourceDigest = doctorSourceDigest(project);
  const search = applyAgentCommand(project, { op: "suggest_game_foundations", allowReplacement: true }).result;
  const selected = search.candidates.find((candidate) => candidate.id === "topdown");
  assert.throws(() => applyAgentCommand(project, { ...selected.materializationRequest, expectedSourceDigest: "source-stale" }), /stale-source/i);
  assert.throws(() => applyAgentCommand(project, {
    ...selected.materializationRequest,
    expectedCandidateDigest: `${selected.candidateDigest.slice(0, -1)}${selected.candidateDigest.endsWith("0") ? "1" : "0"}`,
  }), /candidate digest is stale/i);
  const unproven = search.candidates.find((candidate) => candidate.id === "dimetric");
  assert.equal(unproven.preparedProofComplete, false);
  assert.equal(unproven.preparedReadiness, "validated-starter");
  assert.equal(unproven.proofBlocked, true);
  assert.equal(unproven.materializationRequest, null);
  assert.throws(() => applyAgentCommand(project, {
    op: "materialize_game_foundation",
    foundationId: "dimetric",
    expectedCandidateDigest: unproven.candidateDigest,
    expectedSourceDigest: sourceDigest,
    allowReplacement: true,
  }), /not yet proven playable/i);
});

test("manifest and generated command contracts expose foundation parity", () => {
  const manifest = getAgentManifest();
  const operations = ["list_game_foundations", "suggest_game_foundations", "materialize_game_foundation"];
  for (const operation of operations) {
    assert.ok(manifest.commandSurfaces.core.includes(operation));
    assert.ok(manifest.commandSurfaces.browserSession.includes(operation));
    const contract = manifest.commandContracts.commands.find((entry) => entry.op === operation);
    assert.ok(contract);
    assert.equal(contract.annotations.readOnlyHint, true);
  }
  assert.deepEqual(manifest.gameFoundations.foundationIds, LOOPLAB_GAME_FOUNDATION_IDS);
  assert.equal(manifest.gameFoundations.searchSchema, LOOPLAB_GAME_FOUNDATION_SEARCH_SCHEMA);
  assert.match(manifest.gameFoundations.selectionPolicy, /automaticWinner is always null/i);
});
