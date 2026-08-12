import assert from "node:assert/strict";
import test from "node:test";

import { applyAgentCommand, createTemplate, getAgentManifest, validateProject } from "../lib/looplab-agent-core.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { inspectNarrativeContract, LOOPLAB_NARRATIVE_CONTRACT_SCHEMA, LOOPLAB_NARRATIVE_REPORT_SCHEMA } from "../lib/looplab-narrative.mjs";

function validContract() {
  return {
    version: 1,
    status: "implemented",
    premise: "A market courier chooses how to spend the day and closes the ledger.",
    entryPageIds: ["market-offer"],
    continuityTerms: ["glass market", "ledger"],
    characters: [
      { id: "market-narrator", name: "Market Narrator", role: "guide" },
      { id: "courier", name: "Courier", role: "player" },
    ],
    lines: [
      { id: "line-market-opens", speakerId: "market-narrator", voiceRole: "narrator", text: "The glass market opens.", delivery: "text", essential: true },
      { id: "line-ledger-closes", speakerId: "courier", voiceRole: "character", text: "Ledger closed.", delivery: "text", essential: true },
    ],
    beats: [
      { id: "beat-market-opens", label: "Market opens", kind: "setup", required: true, essential: true, delivery: "text", pageId: "market-offer", variableIds: ["day"], lineIds: ["line-market-opens"], acceptanceTestIds: ["market-choice-route"] },
      { id: "beat-ledger-closes", label: "Ledger closes", kind: "ending", required: true, essential: true, delivery: "text", choiceId: "close-ledger", lineIds: ["line-ledger-closes"], acceptanceTestIds: ["market-choice-route"] },
    ],
    endings: [
      { id: "ending-ledger", label: "Ledger closed", kind: "success", choiceId: "close-ledger", beatId: "beat-ledger-closes", acceptanceTestIds: ["market-choice-route"] },
    ],
  };
}

function storyProject() {
  const project = createTemplate("systems");
  project.qualityContracts = { ...(project.qualityContracts ?? {}), narrativeContractRequired: true };
  return project;
}

test("authors a source-bound Narrative Contract and proves branch/rejoin reachability with current evidence", () => {
  const outcome = applyAgentCommand(storyProject(), { op: "set_narrative_contract", contract: validContract() });
  assert.equal(outcome.changed, true);
  assert.equal(validateProject(outcome.project).valid, true);
  assert.equal(outcome.result.report.schemaVersion, LOOPLAB_NARRATIVE_REPORT_SCHEMA);
  assert.equal(outcome.result.report.contractSchemaVersion, LOOPLAB_NARRATIVE_CONTRACT_SCHEMA);
  assert.equal(outcome.result.report.status, "passed");
  assert.equal(outcome.result.report.metrics.reachablePageCount, 2);
  assert.equal(outcome.result.report.metrics.unreachablePageCount, 0);
  assert.equal(outcome.result.report.metrics.reachableEndingCount, 1);
  assert.equal(outcome.result.report.metrics.trapCycleCount, 0);
  assert.equal(outcome.result.report.beats.every((beat) => beat.evidenceStatus === "passed"), true);
  assert.deepEqual(outcome.result.report.shortestEndingPaths[0].path.map((step) => step.id), ["market-offer", "buy-lanterns", "market-receipt", "close-ledger"]);

  const report = applyAgentCommand(outcome.project, { op: "get_narrative_report", profile: "prototype" }).result;
  assert.equal(report.status, "passed");
  assert.match(report.sourceDigest, /^source-[a-f0-9]{64}$/);
  assert.match(report.contractDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(report.digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(analyzeProject(outcome.project).narrativeReport.status, "passed");
});

test("keeps mechanics-only projects optional but reports a missing required story contract", () => {
  const mechanics = createTemplate("platformer");
  const optional = inspectNarrativeContract(mechanics);
  assert.equal(optional.status, "absent");
  assert.deepEqual(optional.errors, []);
  assert.equal(analyzeProject(mechanics).issues.some((issue) => issue.code === "narrative-contract-missing"), false);

  const required = storyProject();
  const doctor = analyzeProject(required);
  assert.equal(doctor.narrativeReport.status, "missing");
  assert.ok(doctor.issues.some((issue) => issue.code === "narrative-contract-missing" && issue.category === "narrative"));
});

test("rejects missing runtime, line, speaker, and evidence references", () => {
  const project = storyProject();
  const broken = validContract();
  broken.lines[0].speakerId = "missing-speaker";
  broken.beats[0].pageId = "missing-page";
  broken.beats[0].lineIds = ["missing-line"];
  broken.beats[0].acceptanceTestIds = ["missing-test"];
  const report = inspectNarrativeContract({ ...project, narrativeContract: broken }, broken);
  assert.equal(report.status, "failed");
  assert.ok(report.issues.some((issue) => issue.code === "narrative-speaker-missing"));
  assert.ok(report.issues.some((issue) => issue.code === "narrative-page-missing"));
  assert.ok(report.issues.some((issue) => issue.code === "narrative-line-missing"));
  assert.ok(report.issues.some((issue) => issue.code === "narrative-acceptance-missing"));
  assert.throws(() => applyAgentCommand(project, { op: "set_narrative_contract", contract: broken }), /Narrative contract is invalid/);
});

test("finds unreachable pages, blocking terminals, and reachable trap cycles without pretending to solve runtime conditions", () => {
  const project = storyProject();
  project.gameplayProgram.choicePages.push(
    { id: "orphan-page", title: "Orphan", body: "No entry opens this page.", modal: true, choices: [{ id: "orphan-exit", label: "Leave", actionId: "choice-1", visibleWhen: [], enabledWhen: [], effects: [], close: true }] },
    { id: "implicit-close-page", title: "Implicit close", body: "The runtime closes by default.", modal: true, choices: [{ id: "implicit-close-choice", label: "Leave", actionId: "choice-1", visibleWhen: [], enabledWhen: [], effects: [] }] },
    { id: "loop-a", title: "Loop A", body: "A", modal: true, choices: [{ id: "to-loop-b", label: "Continue", actionId: "choice-1", visibleWhen: [], enabledWhen: [], effects: [], nextPageId: "loop-b", close: false }] },
    { id: "loop-b", title: "Loop B", body: "B", modal: true, choices: [{ id: "to-loop-a", label: "Continue", actionId: "choice-1", visibleWhen: [], enabledWhen: [], effects: [], nextPageId: "loop-a", close: false }] },
    { id: "stuck-page", title: "Stuck", body: "No close or next page.", modal: true, choices: [{ id: "stuck-choice", label: "Wait", actionId: "choice-1", visibleWhen: [], enabledWhen: [], effects: [], close: false }] },
  );
  const contract = validContract();
  contract.entryPageIds.push("implicit-close-page", "loop-a", "stuck-page");
  project.narrativeContract = contract;
  const report = inspectNarrativeContract(project, contract);
  assert.equal(report.analysis.complete, true);
  assert.ok(report.pages.unreachableIds.includes("orphan-page"));
  assert.ok(report.issues.some((issue) => issue.code === "narrative-page-unreachable" && issue.pageId === "orphan-page"));
  assert.ok(report.issues.some((issue) => issue.code === "narrative-blocking-terminal" && issue.choiceId === "stuck-choice"));
  assert.equal(report.pages.blockingTerminals.some((terminal) => terminal.choiceId === "implicit-close-choice"), false);
  assert.ok(report.pages.exits.some((terminal) => terminal.choiceId === "implicit-close-choice"));
  assert.deepEqual(report.trapCycles[0].pageIds, ["loop-a", "loop-b"]);
  assert.ok(report.issues.some((issue) => issue.code === "narrative-trap-cycle"));
  assert.match(report.analysis.conditionModel, /structural-overapproximation/);
});

test("requires every linked proof to pass instead of hiding a failed check behind one passing witness", () => {
  const project = storyProject();
  const secondTest = JSON.parse(JSON.stringify(project.acceptanceTests[0]));
  secondTest.id = "market-choice-regression";
  project.acceptanceTests.push(secondTest);
  const contract = validContract();
  contract.beats[0].acceptanceTestIds.push(secondTest.id);
  project.narrativeContract = contract;
  const report = inspectNarrativeContract(project, contract, {
    acceptancePlan: {
      items: [
        { id: "market-choice-route", status: "passed" },
        { id: secondTest.id, status: "failed" },
      ],
    },
  });
  assert.equal(report.beats.find((beat) => beat.id === "beat-market-opens").evidenceStatus, "failed");
  assert.ok(report.issues.some((issue) => issue.code === "narrative-beat-evidence-not-passing" && issue.beatId === "beat-market-opens"));
});

test("blocks essential audio-only delivery and exposes narrator-aware headless contracts", () => {
  const project = storyProject();
  const contract = validContract();
  contract.lines[0] = { ...contract.lines[0], text: "", textEquivalent: "", delivery: "audio", audioAssetId: "voice-intro", essential: true };
  contract.beats[0] = { ...contract.beats[0], delivery: "audio", essential: true };
  const report = inspectNarrativeContract({ ...project, narrativeContract: contract }, contract);
  assert.ok(report.issues.some((issue) => issue.code === "narrative-line-not-readable" && issue.severity === "error"));
  assert.ok(report.issues.some((issue) => issue.code === "narrative-essential-audio-only" && issue.severity === "error"));

  const manifest = getAgentManifest();
  for (const op of ["get_narrative_contract", "get_narrative_report", "set_narrative_contract", "remove_narrative_contract"]) {
    assert.ok(manifest.commands.includes(op));
    assert.ok(manifest.commandSurfaces.core.includes(op));
    assert.ok(manifest.commandContracts.commands.some((entry) => entry.op === op));
  }
  assert.deepEqual(manifest.specialistAgents.narrativeRouting.specialistIds, ["narrative-designer", "narrator-dialogue-writer"]);
  assert.ok(manifest.exportedRuntime.methods.includes("getNarrativeReport"));
  assert.ok(manifest.exportedRuntime.commands.includes("get_narrative_report"));
});
