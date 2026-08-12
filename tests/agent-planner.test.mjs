import assert from "node:assert/strict";
import test from "node:test";

import { applyAgentCommand, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { canonicalJson } from "../lib/looplab-canonical-digest.mjs";
import { getLooplabCommandContracts } from "../lib/looplab-agent-contracts.mjs";
import { LOOPLAB_AGENT_COMMANDS } from "../lib/looplab-command-surfaces.mjs";

const SUPPORTED_PROP_PARAMETERS = {
  mapId: "map-main",
  objectId: "planner-vending-machine",
  name: "Planner vending machine",
  x: 650,
  y: 400,
  width: 32,
  height: 64,
  footprint: { offsetX: 6, offsetY: 48, width: 20, height: 16, collisionHeight: 1 },
  groundAnchor: { offsetX: 16, offsetY: 64 },
  supportMode: "auto",
  supportTolerance: 2,
};

test("agent plans are deterministic, source-bound, provider-free, and non-mutating", () => {
  const project = createTemplate("blank");
  const before = canonicalJson(project);
  const command = { op: "draft_agent_plan", intent: "Place a grounded vending machine" };
  const first = applyAgentCommand(project, command);
  const second = applyAgentCommand(project, command);

  assert.equal(first.changed, false);
  assert.equal(canonicalJson(project), before);
  assert.deepEqual(first.result, second.result);
  assert.equal(first.result.schemaVersion, "looplab-agent-plan/v2");
  assert.match(first.result.sourceDigest, /^source-[a-f0-9]{64}$/);
  assert.match(first.result.planDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.result.authority.nonExecuting, true);
  assert.equal(first.result.authority.providerUsed, false);
  assert.equal(first.result.authority.persistsProject, false);
  assert.equal(first.result.authority.grantsMutationAuthority, false);
  assert.equal(first.result.authority.authoritativeRepresentation, "coverage-and-phases");
  assert.equal(first.result.authority.uiRole, "secondary inspection and precise-tweak surface; never a capability ceiling");
  assert.match(first.result.resume.planDefinitionDigest, /^sha256:[a-f0-9]{64}$/);
});

test("broad release intent becomes one covered, resumable agent workflow without first-match macro hijacking", () => {
  const project = createTemplate("kinetic");
  const intent = "Prepare this protected project for production release: fix every current Doctor blocker and warning, protect deterministic completion evidence, verify both connected maps and round-trip joins, run acceptance, replay, and visual QA, then produce and verify one offline HTML export without weakening gates.";
  const plan = applyAgentCommand(project, { op: "draft_agent_plan", intent }).result;
  const coverage = new Map(plan.coverage.map((entry) => [entry.id, entry]));
  const phases = new Map(plan.phases.map((phase) => [phase.id, phase]));

  assert.equal(plan.strategy.kind, "composite-workflow");
  assert.deepEqual([...coverage.keys()], ["doctor-repair", "completion-evidence", "map-round-trip", "acceptance", "replay", "visual-qa", "offline-release"]);
  for (const entry of coverage.values()) {
    assert.ok(entry.phaseIds.length > 0, `${entry.id} was detected but not assigned to a phase`);
    for (const phaseId of entry.phaseIds) assert.ok(phases.has(phaseId), `${entry.id} points to unknown phase ${phaseId}`);
  }
  assert.deepEqual(plan.missingInputs, []);
  assert.ok(phases.get("verify-requested-evidence").operations.includes("get_runtime_join_plan"));
  assert.ok(phases.get("verify-requested-evidence").operations.includes("run_acceptance_suite"));
  assert.ok(phases.get("verify-requested-evidence").operations.includes("run_replay_suite"));
  assert.ok(phases.get("verify-requested-evidence").operations.includes("capture_visual_review"));
  assert.ok(phases.get("verify-and-export-release").operations.includes("verify_release"));
  assert.ok(phases.get("verify-and-export-release").operations.includes("export_html"));
  assert.equal(coverage.get("completion-evidence").status, "redraft-required");
  assert.ok(phases.get("protect-completion-evidence").sourcePolicy.includes("Redraft"));
  assert.equal(plan.retryPolicy.appliedReceipts, "never auto-retry");
  assert.equal(plan.resume.preserveCompletedEvidence, true);
});

test("incomplete proven-macro intent reports exact required inputs without inventing an apply command", () => {
  const project = createTemplate("blank");
  const plan = applyAgentCommand(project, { op: "draft_agent_plan", intent: "Add a floor-standing supported prop" }).result;

  assert.equal(plan.strategy.kind, "command-macro");
  assert.equal(plan.strategy.id, "place-supported-prop");
  assert.deepEqual(plan.missingInputs.map((entry) => entry.key), ["mapId", "objectId", "x", "y"]);
  assert.equal(plan.macroPreview, undefined);
  assert.equal(plan.steps.find((step) => step.id === "preview-proven-macro").command, undefined);
  const applyStep = plan.steps.find((step) => step.id === "apply-exact-reviewed-plan");
  assert.equal(applyStep.status, "blocked");
  assert.equal(applyStep.command, undefined);
  assert.ok(applyStep.blockedBy.includes("missing:mapId"));
});

test("complete proven-macro intent embeds the real clone preview and exact review-only apply command", () => {
  const project = createTemplate("blank");
  const before = canonicalJson(project);
  const direct = applyAgentCommand(project, { op: "preview_command_macro", macroId: "place-supported-prop", parameters: SUPPORTED_PROP_PARAMETERS }).result;
  const plan = applyAgentCommand(project, {
    op: "draft_agent_plan",
    intent: "Place a supported vending machine",
    macroId: "place-supported-prop",
    parameters: SUPPORTED_PROP_PARAMETERS,
  }).result;

  assert.deepEqual(plan.macroPreview, direct);
  assert.equal(canonicalJson(project), before);
  const applyStep = plan.steps.find((step) => step.id === "apply-exact-reviewed-plan");
  assert.equal(applyStep.status, "review-required");
  assert.deepEqual(applyStep.command, {
    op: "apply_command_macro",
    macroId: "place-supported-prop",
    parameters: direct.parameters,
    expectedSourceDigest: direct.sourceDigest,
    expectedExpansionDigest: direct.expansionDigest,
    compact: true,
  });
  assert.equal(plan.authority.nonExecuting, true);
});

test("completion protection intent selects the source-derived replay macro with no provider or copied tape", () => {
  const project = createTemplate("kinetic");
  const before = canonicalJson(project);
  const plan = applyAgentCommand(project, { op: "draft_agent_plan", intent: "Protect the completion witness as a replay regression" }).result;

  assert.equal(plan.strategy.kind, "command-macro");
  assert.equal(plan.strategy.id, "protect-completion-witness");
  assert.deepEqual(plan.missingInputs, []);
  assert.equal(plan.macroPreview.applicable, true);
  assert.equal(plan.macroPreview.commands[0].op, "record_replay_case");
  assert.equal(plan.macroPreview.doctor.release.delta.warnings, -1);
  assert.equal(plan.authority.providerUsed, false);
  assert.equal(canonicalJson(project), before);
});

test("planner rejects ambiguous strategies, unknown map scope, and unused parameters", () => {
  const project = createTemplate("blank");
  assert.throws(() => applyAgentCommand(project, { op: "draft_agent_plan", intent: "Do work", macroId: "place-supported-prop", recipeId: "place-grounded-supported-prop" }), /either macroId or recipeId/);
  assert.throws(() => applyAgentCommand(project, { op: "draft_agent_plan", intent: "Improve this map", mapIds: ["not-a-map"] }), /Unknown mapIds/);
  assert.throws(() => applyAgentCommand(project, { op: "draft_agent_plan", intent: "Improve colors", parameters: { x: 1 } }), /parameters are accepted only/);
  assert.throws(() => applyAgentCommand(project, { op: "draft_agent_plan", intent: "Place prop", macroId: "not-real" }), /Unknown command macro/);
});

test("recipe matching requires query evidence so unrelated intent is not hijacked by project findings", () => {
  const project = createTemplate("platformer");
  const artPlan = applyAgentCommand(project, { op: "draft_agent_plan", intent: "Improve color composition and silhouette hierarchy" }).result;
  assert.equal(artPlan.strategy.kind, "guarded-workflow");

  const replayPlan = applyAgentCommand(project, { op: "draft_agent_plan", intent: "Diagnose replay mismatch and hash divergence" }).result;
  assert.equal(replayPlan.strategy.kind, "playbook-recipe");
  assert.equal(replayPlan.strategy.id, "diagnose-replay-divergence");
  assert.ok(replayPlan.steps.some((step) => step.operations.includes("run_replay_suite")));
});

test("every planned operation has a published strict contract and source changes invalidate the plan digest", () => {
  const project = createTemplate("blank");
  const first = applyAgentCommand(project, { op: "draft_agent_plan", intent: "Improve enemy encounter pacing" }).result;
  const changed = applyAgentCommand(project, { op: "set_project", changes: { name: "Changed source" } }).project;
  const second = applyAgentCommand(changed, { op: "draft_agent_plan", intent: "Improve enemy encounter pacing" }).result;
  const contracts = new Map(getLooplabCommandContracts().map((contract) => [contract.op, contract]));

  assert.notEqual(first.sourceDigest, second.sourceDigest);
  assert.notEqual(first.planDigest, second.planDigest);
  for (const step of first.steps) {
    for (const op of step.operations) {
      assert.ok(LOOPLAB_AGENT_COMMANDS.includes(op), `unknown planned operation ${op}`);
      assert.ok(contracts.has(op), `missing contract for ${op}`);
    }
  }
  assert.deepEqual(first.operationContracts.map((contract) => contract.op), [...new Set(first.steps.flatMap((step) => step.operations))]);
  const plannerContract = contracts.get("draft_agent_plan");
  assert.equal(plannerContract.annotations.readOnlyHint, true);
  assert.equal(plannerContract.inputSchema.additionalProperties, false);
  assert.deepEqual(plannerContract.inputSchema.required, ["intent"]);
  assert.equal(getAgentManifest().agentIntentPlanning.command, "draft_agent_plan");
});

test("guarded workflows use clone preview receipts instead of legacy direct batches", () => {
  const project = createTemplate("blank");
  const plan = applyAgentCommand(project, { op: "draft_agent_plan", intent: "Improve enemy encounter pacing" }).result;
  const operations = plan.steps.flatMap((step) => step.operations);

  assert.ok(operations.includes("preview_batch"));
  assert.ok(operations.includes("apply_previewed_batch"));
  assert.ok(!operations.includes("apply_batch"));
});

test("compact plans reference published schemas and recipes instead of duplicating full registries", () => {
  const project = createTemplate("kinetic");
  const full = applyAgentCommand(project, { op: "draft_agent_plan", intent: "Ship the selected project as a verified one-file offline HTML release" }).result;
  const compact = applyAgentCommand(project, { op: "draft_agent_plan", intent: "Ship the selected project as a verified one-file offline HTML release", compact: true }).result;

  assert.equal(full.operationContractMode, "inline-full");
  assert.ok(full.operationContracts.every((contract) => contract.inputSchema));
  assert.equal(compact.operationContractMode, "manifest-references");
  assert.ok(compact.operationContracts.every((contract) => contract.contractRef && !contract.inputSchema));
  assert.ok(compact.recipeRef.recipeRef.startsWith("looplab://agent-playbook#"));
  assert.equal(compact.stepDetailMode, "phase-and-resource-references");
  assert.ok(compact.steps.every((step) => !Object.hasOwn(step, "instruction")));
  assert.ok(JSON.stringify(compact).length < JSON.stringify(full).length / 2);
});
