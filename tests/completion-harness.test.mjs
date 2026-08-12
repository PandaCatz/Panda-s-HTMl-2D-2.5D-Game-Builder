import assert from "node:assert/strict";
import test from "node:test";
import { applyAgentCommand, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import {
  inspectCompletionTarget,
  LOOPLAB_COMPLETION_HARNESS_SCHEMA,
  runCompletionHarness,
} from "../lib/looplab-completion-harness.mjs";

function choiceCompletionProject() {
  const project = createTemplate("systems");
  project.qualityContracts = { ...project.qualityContracts, completionMode: "required" };
  project.gameplayProgram.choicePages[0].choices[0].effects.push({ type: "win" });
  return project;
}

function inputRuleProject({ threshold = null } = {}) {
  const project = createTemplate("systems");
  project.qualityContracts = { ...project.qualityContracts, completionMode: "required" };
  project.gameplayProgram.choicePages = [];
  project.gameplayProgram.hudBindings = [];
  project.gameplayProgram.clocks = [];
  project.gameplayProgram.variables = [{ id: "progress", label: "Progress", type: "number", initial: 0, min: 0, max: 20 }];
  project.gameplayProgram.rules = threshold == null
    ? [{
        id: "blocked-win",
        enabled: true,
        trigger: { type: "input", actionId: "choice-1", phase: "pressed" },
        conditions: [{ variableId: "progress", operator: "gte", value: 1 }],
        effects: [{ type: "win" }],
        once: "never",
      }]
    : [
        {
          id: "advance-progress",
          enabled: true,
          trigger: { type: "input", actionId: "choice-1", phase: "pressed" },
          conditions: [],
          effects: [{ type: "add-variable", variableId: "progress", value: 1 }],
          once: "never",
        },
        {
          id: "finish-progress",
          enabled: true,
          trigger: { type: "input", actionId: "choice-1", phase: "pressed" },
          conditions: [{ variableId: "progress", operator: "gte", value: threshold }],
          effects: [{ type: "win" }],
          once: "never",
        },
      ];
  project.acceptanceTests = [];
  project.replay = { version: "1", tickRate: 60, seed: 1, cases: [] };
  return project;
}

test("bounded completion search emits a deterministic semantic-action witness for a choice game", () => {
  const project = choiceCompletionProject();
  const target = inspectCompletionTarget(project);
  assert.equal(target.required, true);
  assert.equal(target.winEffectOwners.some((owner) => owner.type === "choice" && owner.id === "buy-lanterns"), true);

  const first = runCompletionHarness(project, { sourceDigest: "source-choice", maxNodes: 32, maxDepth: 3 });
  const second = runCompletionHarness(project, { sourceDigest: "source-choice", maxNodes: 32, maxDepth: 3 });
  assert.deepEqual(second, first);
  assert.equal(first.schemaVersion, LOOPLAB_COMPLETION_HARNESS_SCHEMA);
  assert.equal(first.status, "passed");
  assert.equal(first.proof, "bounded-model-search");
  assert.equal(first.sourceDigest, "source-choice");
  assert.equal(first.terminalState.won, true);
  assert.deepEqual(first.reproTape.inputs, [
    { tick: 0, actionId: "choice-1", pressed: true },
    { tick: 1, actionId: "choice-1", pressed: false },
  ]);
});

test("a completion target with no state-changing executable action is a proven root dead-end", () => {
  const project = inputRuleProject();
  const report = runCompletionHarness(project, { maxNodes: 32, maxDepth: 3 });
  assert.equal(report.status, "dead-end");
  assert.equal(report.passed, false);
  assert.equal(report.reason, "initial-state-has-no-state-changing-action");
  assert.equal(report.coverage.reachableDeadEnds, 1);
  assert.equal(report.coverage.budgetExhausted, false);
  assert.equal(analyzeProject(project, { profile: "prototype" }).issues.find((issue) => issue.code === "completion-root-dead-end")?.severity, "warning");
  assert.equal(analyzeProject(project, { profile: "production" }).issues.find((issue) => issue.code === "completion-root-dead-end")?.severity, "error");
});

test("an exhausted bound remains inconclusive instead of claiming the game is unwinnable", () => {
  const project = inputRuleProject({ threshold: 50 });
  const report = runCompletionHarness(project, { maxNodes: 32, maxDepth: 1 });
  assert.equal(report.status, "inconclusive");
  assert.equal(report.passed, false);
  assert.equal(report.reason, "search-budget-exhausted");
  assert.equal(report.coverage.budgetExhausted, true);
  assert.ok(report.coverage.exploredStates >= 2);
  const issue = analyzeProject(project, { profile: "production" }).issues.find((candidate) => candidate.code === "completion-evidence-inconclusive");
  assert.equal(issue?.severity, "error");
  assert.match(issue?.message ?? "", /missing evidence, not proof/);
});

test("a passing authored win acceptance route is reused before exploratory search", () => {
  const report = runCompletionHarness(createTemplate("platformer"), { sourceDigest: "source-platformer" });
  assert.equal(report.status, "passed");
  assert.equal(report.proof, "authored-acceptance");
  assert.equal(report.witnessId, "pocket-route-completion");
  assert.equal(report.terminalState.won, true);
  assert.ok(report.reproTape.inputs.length > 0);
});

test("authored completion witnesses preserve explicit start map and spawn context", () => {
  const report = runCompletionHarness(createTemplate("kinetic"), { sourceDigest: "source-kinetic" });
  assert.equal(report.status, "passed");
  assert.equal(report.proof, "authored-acceptance");
  assert.equal(report.witnessId, "test-finish");
  assert.equal(report.reproTape.startMapId, "map-river");
  assert.equal(report.reproTape.startSpawnId, "river-spawn");
  assert.equal(report.terminalState.activeMapId, "map-river");
  assert.equal(report.terminalState.won, true);
});

test("open-ended projects without a terminal target are explicitly not applicable", () => {
  const project = createTemplate("systems");
  project.qualityContracts = { ...project.qualityContracts, completionMode: "open-ended" };
  const report = runCompletionHarness(project);
  assert.equal(report.status, "not-applicable");
  assert.equal(report.passed, true);
  assert.equal(report.reason, "open-ended-project");
});

test("headless and manifest surfaces expose the same source-bound completion contract", () => {
  const project = createTemplate("platformer");
  const before = JSON.stringify(project);
  const outcome = applyAgentCommand(project, { op: "get_completion_report", profile: "production" });
  assert.equal(outcome.changed, false);
  assert.equal(JSON.stringify(outcome.project), before);
  assert.equal(outcome.result.status, "passed");
  assert.match(outcome.result.sourceDigest, /^source-/);

  const manifest = getAgentManifest();
  assert.equal(manifest.completionHarness.schemaVersion, LOOPLAB_COMPLETION_HARNESS_SCHEMA);
  assert.equal(manifest.completionHarness.command, "get_completion_report");
  assert.ok(manifest.commands.includes("get_completion_report"));
  assert.ok(manifest.commandSurfaces.core.includes("get_completion_report"));
  assert.ok(manifest.requiredWorkflow.includes("get_completion_report"));
  assert.ok(manifest.exportedRuntime.methods.includes("getCompletionReport"));
  assert.ok(manifest.exportedRuntime.commands.includes("get_completion_report"));
  assert.match(manifest.completionHarness.honestyPolicy, /inconclusive, never proof/i);
});
