import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildStandaloneHtml, createTemplate, getAgentManifest, validateProject } from "../lib/looplab-agent-core.mjs";
import { inspectGameplayProgram, normalizeGameplayProgram } from "../lib/looplab-gameplay-rules.mjs";
import { captureReplayState } from "../lib/looplab-replay.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";

const transparentPixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function narrativeContract() {
  return {
    version: 1,
    status: "implemented",
    premise: "A market courier accepts a delivery and closes the ledger.",
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

function dialogueQuestFixture() {
  const project = createTemplate("systems");
  project.qualityContracts = { ...project.qualityContracts, narrativeContractRequired: true };
  project.narrativeContract = narrativeContract();
  project.assets.push({
    id: "market-narrator-portrait",
    name: "Market Narrator portrait",
    type: "sprite",
    dataUrl: transparentPixel,
    width: 1,
    height: 1,
    frameWidth: 1,
    frameHeight: 1,
    frames: 1,
    columns: 1,
    collisionPolicy: "authored-only",
  });
  project.inputActions.push({ id: "quest-progress", label: "Deliver a relic", bindings: ["KeyQ"], animationState: "interact", onboarding: true, replayEvent: true });
  project.replay.cases = [];
  project.acceptanceTests.push({
    id: "market-delivery-route",
    name: "Accept and complete the market delivery",
    ownerId: "gameplay.quest.market-delivery",
    assertion: "A semantic choice activates the quest and three fresh delivery inputs complete its only objective.",
    runner: "looplab-deterministic-runtime",
    driver: {
      tickRate: 60,
      tickCount: 14,
      inputs: [
        { tick: 0, action: "choice-1", pressed: true },
        { tick: 1, action: "choice-1", pressed: false },
        { tick: 2, action: "choice-1", pressed: true },
        { tick: 3, action: "choice-1", pressed: false },
        { tick: 4, action: "quest-progress", pressed: true },
        { tick: 5, action: "quest-progress", pressed: false },
        { tick: 6, action: "quest-progress", pressed: true },
        { tick: 7, action: "quest-progress", pressed: false },
        { tick: 8, action: "quest-progress", pressed: true },
        { tick: 9, action: "quest-progress", pressed: false },
      ],
    },
    assertions: [
      { id: "quest-completed", target: "gameplay-variable", targetId: "quest-status", operator: "equals", expected: 2 },
      { id: "three-delivered", target: "gameplay-variable", targetId: "delivered-relics", operator: "equals", expected: 3 },
      { id: "completion-event", target: "event-emitted", targetId: "quest.completed", operator: "equals", expected: 1 },
    ],
  });

  const program = structuredClone(project.gameplayProgram);
  program.variables.push(
    { id: "quest-status", label: "Delivery status", type: "number", initial: 0, min: 0, max: 3, visible: false },
    { id: "delivered-relics", label: "Delivered relics", type: "number", initial: 0, min: 0, max: 3, visible: true },
  );
  Object.assign(program.choicePages[0], {
    lineId: "line-market-opens",
    speakerId: "market-narrator",
    portraitAssetId: "market-narrator-portrait",
    portraitSide: "left",
    revealMode: "typewriter",
    charactersPerSecond: 36,
    ariaLabel: "Market Narrator offers a delivery quest",
  });
  program.choicePages[0].choices[0].effects.push({ type: "emit", event: "quest.accepted" });
  program.rules.push(
    {
      id: "activate-market-delivery",
      name: "Activate market delivery",
      enabled: true,
      trigger: { type: "event", event: "quest.accepted" },
      conditions: [{ variableId: "quest-status", operator: "eq", value: 0 }],
      once: "run",
      effects: [{ type: "set-variable", variableId: "quest-status", value: 1 }],
    },
    {
      id: "deliver-market-relic",
      name: "Deliver one market relic",
      enabled: true,
      trigger: { type: "input", actionId: "quest-progress", phase: "pressed" },
      conditions: [{ variableId: "quest-status", operator: "eq", value: 1 }],
      once: "never",
      effects: [{ type: "add-variable", variableId: "delivered-relics", value: 1 }],
    },
    {
      id: "complete-market-delivery",
      name: "Complete market delivery",
      enabled: true,
      trigger: { type: "state", variableId: "delivered-relics", operator: "gte", value: 3 },
      conditions: [{ variableId: "quest-status", operator: "eq", value: 1 }],
      once: "run",
      effects: [{ type: "set-variable", variableId: "quest-status", value: 2 }],
    },
  );
  program.quests = [{
    id: "market-delivery",
    title: "Glass-market delivery",
    description: "Deliver three relics to the market ledger.",
    giverId: "market-narrator",
    statusVariableId: "quest-status",
    visibleWhen: [{ variableId: "quest-status", operator: "gte", value: 1 }],
    activationRuleId: "activate-market-delivery",
    completionRuleId: "complete-market-delivery",
    objectives: [{
      id: "deliver-three-relics",
      label: "Deliver relics",
      visibleWhen: [{ variableId: "quest-status", operator: "gte", value: 1 }],
      completeWhen: [{ variableId: "delivered-relics", operator: "gte", value: 3 }],
      progressVariableId: "delivered-relics",
      target: 3,
      acceptanceTestIds: ["market-delivery-route"],
    }],
    acceptanceTestIds: ["market-delivery-route"],
  }];
  project.gameplayProgram = normalizeGameplayProgram(program);
  return project;
}

test("dialogue metadata and quest bindings validate against authored narrative, assets, rules, and evidence", () => {
  const project = dialogueQuestFixture();
  const inspection = inspectGameplayProgram(project);
  assert.deepEqual(inspection.errors, []);
  assert.deepEqual(inspection.warnings, []);
  assert.equal(inspection.metrics.dialoguePageCount, 1);
  assert.equal(inspection.metrics.questCount, 1);
  assert.equal(inspection.metrics.questObjectiveCount, 1);
  assert.equal(validateProject(project).valid, true);
});

test("dialogue presentation stays metadata-only while quest lifecycle, progress, save, and restore share deterministic variables", () => {
  const project = dialogueQuestFixture();
  const runtime = createRuntimeModel(project);
  runtime.drainEvents();

  assert.deepEqual(runtime.getQuestState().quests, []);
  assert.deepEqual(runtime.getChoiceState(), {
    id: "market-offer",
    title: "Day 1: glass market",
    body: "You have 10 credits and 2 crates.",
    modal: true,
    lineId: "line-market-opens",
    speakerId: "market-narrator",
    speakerName: "Market Narrator",
    portraitAssetId: "market-narrator-portrait",
    portraitSide: "left",
    revealMode: "typewriter",
    charactersPerSecond: 36,
    ariaLabel: "Market Narrator offers a delivery quest",
    choices: [
      { id: "buy-lanterns", label: "Buy lanterns for 4 credits", actionId: "choice-1", visible: true, enabled: true },
      { id: "wait-a-day", label: "Wait until tomorrow", actionId: "choice-2", visible: true, enabled: true },
    ],
  });

  assert.equal(runtime.chooseChoice("buy-lanterns"), true);
  let events = runtime.update(1 / 60);
  assert.ok(events.some((event) => event.type === "quest.started" && event.questId === "market-delivery"));
  assert.equal(runtime.getQuestState().quests[0].status, "active");
  assert.equal(runtime.chooseChoice("close-ledger"), true);
  events = runtime.update(1 / 60);
  assert.equal(runtime.getChoiceState(), null);

  const lifecycleEvents = [...events];
  for (let index = 0; index < 3; index += 1) {
    runtime.setInput("quest-progress", true);
    lifecycleEvents.push(...runtime.update(1 / 60));
    runtime.setInput("quest-progress", false);
    lifecycleEvents.push(...runtime.update(1 / 60));
  }
  lifecycleEvents.push(...runtime.update(1 / 60));
  const quest = runtime.getQuestState().quests[0];
  assert.equal(quest.status, "completed");
  assert.equal(quest.objectives[0].progress, 3);
  assert.equal(quest.objectives[0].target, 3);
  assert.equal(quest.objectives[0].completed, true);
  assert.ok(lifecycleEvents.some((event) => event.type === "quest.progressed" && event.objectiveId === "deliver-three-relics"));
  assert.ok(lifecycleEvents.some((event) => event.type === "quest.completed" && event.questId === "market-delivery"));

  const save = runtime.exportSaveState();
  const replayState = captureReplayState(runtime);
  assert.equal(replayState.variables["quest-status"], 2);
  assert.equal(replayState.variables["delivered-relics"], 3);
  assert.equal(Object.hasOwn(replayState, "quests"), false, "replay truth must remain canonical variables instead of duplicating the derived quest journal");
  const restored = createRuntimeModel(project);
  assert.equal(restored.restoreSaveState(save).ok, true);
  assert.deepEqual(restored.getQuestState().quests, runtime.getQuestState().quests);
  assert.equal(save.variables["quest-status"], 2);
  assert.equal(save.variables["delivered-relics"], 3);
  assert.equal(Object.hasOwn(save, "quests"), false, "quests must remain a derived view instead of a second mutable state store");
});

test("one-file HTML, headless runtime commands, agent manifest, and public schema expose the same dialogue and quest contract", () => {
  const html = buildStandaloneHtml(dialogueQuestFixture());
  assert.match(html, /id="quest-journal"/);
  assert.match(html, /id="choice-body-visual"/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /getQuestState/);
  assert.match(html, /get_quest_state/);

  const manifest = getAgentManifest();
  assert.ok(manifest.exportedRuntime.methods.includes("getQuestState"));
  assert.ok(manifest.exportedRuntime.commands.includes("get_quest_state"));
  assert.equal(manifest.gameplayRules.policy.quests.separateMutableStore, false);
  assert.equal(manifest.gameplayRules.policy.dialogue.autoAdvance, false);

  const schema = JSON.parse(readFileSync(new URL("../public/project-schema.json", import.meta.url), "utf8"));
  const gameplay = schema.$defs.gameplayProgram.properties;
  assert.ok(gameplay.choicePages.items.properties.speakerId);
  assert.ok(gameplay.choicePages.items.properties.portraitAssetId);
  assert.deepEqual(gameplay.choicePages.items.properties.revealMode.enum, ["instant", "typewriter"]);
  assert.ok(gameplay.quests.items.properties.statusVariableId);
  assert.ok(gameplay.quests.items.properties.objectives.items.properties.progressVariableId);
});

test("invalid dialogue and quest references fail closed instead of inventing runtime truth", () => {
  const project = dialogueQuestFixture();
  const broken = structuredClone(project.gameplayProgram);
  Object.assign(broken.choicePages[0], {
    lineId: "missing-line",
    speakerId: "missing-speaker",
    portraitAssetId: "missing-portrait",
    portraitSide: "center",
    revealMode: "typewriter",
    charactersPerSecond: 2,
  });
  broken.quests[0].giverId = "missing-giver";
  broken.quests[0].activationRuleId = "missing-rule";
  broken.quests[0].objectives.push({ ...broken.quests[0].objectives[0] });
  broken.rules.push({
    id: "invalid-quest-status",
    name: "Invalid quest status",
    enabled: true,
    trigger: { type: "event", event: "invalid.quest.status" },
    conditions: [],
    once: "run",
    effects: [{ type: "set-variable", variableId: "quest-status", value: 9 }],
  });

  const errors = inspectGameplayProgram(project, broken).errors.join("\n");
  assert.match(errors, /missing Narrative Contract line missing-line/);
  assert.match(errors, /missing Narrative Contract character missing-speaker/);
  assert.match(errors, /missing project asset missing-portrait/);
  assert.match(errors, /portraitSide must be left or right/);
  assert.match(errors, /charactersPerSecond must be a finite number from 5 through 120/);
  assert.match(errors, /giverId references missing Narrative Contract character missing-giver/);
  assert.match(errors, /activationRuleId references missing gameplay rule missing-rule/);
  assert.match(errors, /objective IDs must be globally unique/);
  assert.match(errors, /sets quest market-delivery to invalid status 9/);
});
