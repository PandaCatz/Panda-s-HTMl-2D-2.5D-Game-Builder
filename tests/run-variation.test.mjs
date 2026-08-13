import assert from "node:assert/strict";
import test from "node:test";

import {
  LOOPLAB_RUN_VARIATION_PROGRAM_SCHEMA,
  buildReplayGhost,
  createRunCodeRuntime,
  inspectRunVariationProgram,
  normalizeRunVariationProgram,
  resolveRunVariation,
  runVariationProgramDigest,
  runVariationSelectionProgramDigest,
  validUtcRunDay,
} from "../lib/looplab-run-variation.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-instance.mjs";
import { validateLooplabCommandInput } from "../lib/looplab-agent-contracts.mjs";
import { LOOPLAB_REPLAY_RUN_VARIATION_HASH_VERSION, captureReplayState, recordReplayCase, replayStateDigest, runReplayCase } from "../lib/looplab-replay.mjs";
import { applyAgentCommand, createTemplate } from "../lib/looplab-agent-core.mjs";

function program() {
  return normalizeRunVariationProgram({
    schemaVersion: LOOPLAB_RUN_VARIATION_PROGRAM_SCHEMA,
    version: 1,
    enabled: true,
    seedNamespace: "test-game",
    defaultSeed: "alpha",
    dailyChallenge: { enabled: true, namespace: "daily" },
    pools: [
      {
        id: "layout",
        label: "Layout",
        variants: [
          { id: "wide", label: "Wide", weight: 2, assignments: [{ variableId: "density", value: 1 }] },
          { id: "dense", label: "Dense", weight: 1, assignments: [{ variableId: "density", value: 3 }] },
        ],
      },
      {
        id: "weather",
        label: "Weather",
        variants: [
          { id: "clear", label: "Clear", weight: 1, assignments: [{ variableId: "storm", value: false }] },
          { id: "storm", label: "Storm", weight: 1, assignments: [{ variableId: "storm", value: true }] },
        ],
      },
    ],
    ghosts: [],
    acceptanceTestIds: ["seed-alpha", "seed-beta"],
  });
}

function project() {
  return {
    name: "Variation test",
    activeMapId: "map-main",
    maps: [{ id: "map-main", objects: [] }],
    gameplayProgram: {
      version: 1,
      variables: [
        { id: "density", label: "Density", type: "number", initial: 1, min: 0, max: 4, resetPolicy: "run" },
        { id: "storm", label: "Storm", type: "boolean", initial: false, resetPolicy: "session" },
        { id: "meta", label: "Meta", type: "number", initial: 0, min: 0, max: 10, resetPolicy: "session" },
      ],
      rules: [],
    },
    replay: {
      version: "1",
      tickRate: 60,
      seed: 1,
      cases: [
        { id: "seed-alpha", tickCount: 1, inputs: [], runSeed: "alpha" },
        { id: "seed-beta", tickCount: 1, inputs: [], runSeed: "beta" },
      ],
    },
    runVariationProgram: program(),
  };
}

test("run variation is stable across pool and variant array order", () => {
  const first = program();
  const reordered = structuredClone(first);
  reordered.pools.reverse();
  for (const pool of reordered.pools) pool.variants.reverse();
  assert.equal(runVariationProgramDigest(first), runVariationProgramDigest(reordered));
  const a = resolveRunVariation(first, { seed: "same-seed" });
  const b = resolveRunVariation(reordered, { seed: "same-seed" });
  assert.deepEqual(a.selections.map(({ poolId, variantId }) => ({ poolId, variantId })), b.selections.map(({ poolId, variantId }) => ({ poolId, variantId })));
  assert.deepEqual(a.assignments, b.assignments);
});

test("presentation labels, ghost metadata, and evidence do not reshape gameplay selections or replay v14", () => {
  const first = program();
  const presentationEdit = structuredClone(first);
  presentationEdit.pools[0].label = "A clearer layout label";
  presentationEdit.pools[0].variants[0].label = "A clearer variant label";
  presentationEdit.acceptanceTestIds = ["new-evidence-reference"];
  presentationEdit.ghosts = [{
    id: "ghost-presentation-only",
    label: "Presentation ghost",
    replayCaseId: "seed-alpha",
    replayDigest: "sha256:" + "1".repeat(64),
    trajectoryDigest: "sha256:" + "2".repeat(64),
    sampleEveryTicks: 2,
    color: "#c4ccd4",
    opacity: 0.45,
    frames: [
      { tick: 0, mapId: "map-main", x: 0, y: 0, z: 0, facingX: 1 },
      { tick: 2, mapId: "map-main", x: 4, y: 0, z: 0, facingX: 1 },
    ],
  }];
  assert.notEqual(runVariationProgramDigest(first), runVariationProgramDigest(presentationEdit));
  assert.equal(runVariationSelectionProgramDigest(first), runVariationSelectionProgramDigest(presentationEdit));
  const original = resolveRunVariation(first, { seed: "same-seed" });
  const edited = resolveRunVariation(presentationEdit, { seed: "same-seed" });
  assert.equal(original.selectionProgramDigest, edited.selectionProgramDigest);
  assert.equal(original.selectionDigest, edited.selectionDigest);
  assert.deepEqual(original.selections, edited.selections);
  assert.deepEqual(original.assignments, edited.assignments);

  const firstProject = project();
  firstProject.runVariationProgram = first;
  const editedProject = structuredClone(firstProject);
  editedProject.runVariationProgram = presentationEdit;
  const firstRuntime = createRuntimeModel(firstProject);
  const editedRuntime = createRuntimeModel(editedProject);
  firstRuntime.startRun({ seed: "same-seed" });
  editedRuntime.startRun({ seed: "same-seed" });
  firstRuntime.update(1 / 60);
  editedRuntime.update(1 / 60);
  const firstSnapshot = captureReplayState(firstRuntime, { hashVersion: LOOPLAB_REPLAY_RUN_VARIATION_HASH_VERSION });
  const editedSnapshot = captureReplayState(editedRuntime, { hashVersion: LOOPLAB_REPLAY_RUN_VARIATION_HASH_VERSION });
  assert.deepEqual(firstSnapshot.runVariation, editedSnapshot.runVariation);
  assert.equal(
    replayStateDigest(firstSnapshot, { hashVersion: LOOPLAB_REPLAY_RUN_VARIATION_HASH_VERSION }),
    replayStateDigest(editedSnapshot, { hashVersion: LOOPLAB_REPLAY_RUN_VARIATION_HASH_VERSION }),
  );
});

test("daily challenges require an explicit real UTC day and reproduce exactly", () => {
  assert.equal(validUtcRunDay("2026-02-28"), true);
  assert.equal(validUtcRunDay("2026-02-29"), false);
  assert.throws(() => resolveRunVariation(program(), { mode: "daily", utcDay: "2026-02-29" }), /real UTC date/);
  const first = resolveRunVariation(program(), { mode: "daily", utcDay: "2026-08-13" });
  const second = resolveRunVariation(program(), { mode: "daily", utcDay: "2026-08-13" });
  const next = resolveRunVariation(program(), { mode: "daily", utcDay: "2026-08-14" });
  assert.deepEqual(first, second);
  assert.equal(first.mode, "daily");
  assert.equal(first.utcDay, "2026-08-13");
  assert.notEqual(first.seed, next.seed);
});

test("headless contracts preview explicit standard and daily selections without mutation", () => {
  const authored = project();
  const before = structuredClone(authored);
  const standard = applyAgentCommand(authored, { op: "preview_run_variation", mode: "standard", seed: "alpha" });
  assert.equal(standard.changed, false);
  assert.equal(standard.result.state.seed, "alpha");
  assert.deepEqual(authored, before);
  const daily = applyAgentCommand(authored, { op: "preview_run_variation", mode: "daily", utcDay: "2026-08-13" });
  assert.equal(daily.result.state.utcDay, "2026-08-13");
  assert.equal(validateLooplabCommandInput({ op: "preview_run_variation", mode: "standard", seed: "alpha" }).valid, true);
  assert.equal(validateLooplabCommandInput({ op: "preview_start_run", seed: "alpha" }).valid, true);
  assert.equal(validateLooplabCommandInput({ op: "preview_start_daily_challenge", utcDay: "2026-08-13" }).valid, true);
  assert.equal(validateLooplabCommandInput({ op: "preview_start_daily_challenge", utcDay: "not-a-date" }).valid, false);
});

test("strict authoring report validates typed assignments, reset policy, and two-seed evidence", () => {
  const report = inspectRunVariationProgram(project(), project().runVariationProgram, { strict: true, sourceDigest: "source-test" });
  assert.equal(report.valid, true);
  assert.equal(report.shipReady, true);
  assert.equal(report.metrics.coveredSeedCount, 2);
  const broken = project();
  broken.gameplayProgram.variables[0].resetPolicy = "forever";
  broken.runVariationProgram.pools[0].variants[0].assignments[0].value = "wrong";
  broken.runVariationProgram.acceptanceTestIds = ["seed-alpha"];
  const invalid = inspectRunVariationProgram(broken, broken.runVariationProgram, { strict: true });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.some((entry) => entry.code === "run-variation-reset-policy"));
  assert.ok(invalid.issues.some((entry) => entry.code === "run-variation-value-type"));
  assert.ok(invalid.issues.some((entry) => entry.code === "run-variation-seed-evidence" && entry.severity === "error"));
  const numericOnly = project();
  numericOnly.replay.cases = numericOnly.replay.cases.map((entry, index) => ({ ...entry, runSeed: undefined, seed: index + 10 }));
  const numericReport = inspectRunVariationProgram(numericOnly, numericOnly.runVariationProgram, { strict: true });
  assert.equal(numericReport.metrics.coveredSeedCount, 0);
  assert.ok(numericReport.issues.some((entry) => entry.code === "run-variation-seed-evidence" && entry.severity === "error"));
});

test("one gameplay variable cannot be owned by two variation pools", () => {
  const authored = project();
  authored.runVariationProgram.pools[1].variants[0].assignments.push({ variableId: "density", value: 2 });
  authored.runVariationProgram.pools[1].variants[1].assignments.push({ variableId: "density", value: 4 });
  const report = inspectRunVariationProgram(authored, authored.runVariationProgram, { strict: true });
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((entry) => entry.code === "run-variation-variable-pool-conflict"));
});

test("LR1 run codes are compact, source-bound, corruption-detecting, and start at tick zero", () => {
  const sourceDigest = "source-" + "a".repeat(64);
  const authored = program();
  let state = resolveRunVariation(authored, { seed: "alpha" });
  const engine = {
    getRunVariationState: () => structuredClone(state),
    previewRunVariation: (options) => resolveRunVariation(authored, options),
    startRun: (options) => (state = resolveRunVariation(authored, { mode: "standard", seed: options.seed })),
    startDailyChallenge: (options) => (state = resolveRunVariation(authored, { mode: "daily", utcDay: options.utcDay })),
  };
  const runtime = createRunCodeRuntime(engine, { sourceDigest, programDigest: runVariationProgramDigest(authored) });
  const code = runtime.exportCode();
  assert.match(code, /^LR1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
  assert.ok(code.length < 1024);
  assert.equal(runtime.inspectCode(code).valid, true);
  state = resolveRunVariation(authored, { seed: "different" });
  assert.equal(runtime.importCode(code).ok, true);
  assert.equal(state.seed, "alpha");
  assert.equal(runtime.inspectCode(code.slice(0, -1) + (code.endsWith("0") ? "1" : "0")).valid, false);
  const otherSource = createRunCodeRuntime(engine, { sourceDigest: "source-" + "b".repeat(64), programDigest: runVariationProgramDigest(authored) });
  assert.match(otherSource.inspectCode(code).errors[0], /different exported game revision/);
});

test("runtime startRun preserves session variables, full reset clears them, and save v7 restores run identity", () => {
  const authored = project();
  const runtime = createRuntimeModel(authored);
  runtime.drainEvents();
  const started = runtime.startRun({ seed: "alpha" });
  assert.equal(started.seed, "alpha");
  const save = runtime.exportSaveState();
  assert.equal(save.version, 7);
  assert.equal(save.schemaVersion, "looplab-runtime-save-state/v7");
  save.variables.meta = 7;
  assert.equal(runtime.restoreSaveState(save).ok, true);
  assert.equal(runtime.getState().variables.meta, 7);
  runtime.startRun({ seed: "beta" });
  assert.equal(runtime.getState().variables.meta, 7);
  runtime.reset();
  assert.equal(runtime.getState().variables.meta, 0);
  assert.equal(runtime.getRunVariationState().seed, authored.runVariationProgram.defaultSeed);
});

test("ghost observations interpolate by deterministic tick and never enter runtime objects", () => {
  const authored = project();
  authored.runVariationProgram.ghosts = [{
    id: "ghost-reference",
    label: "Reference",
    replayCaseId: "seed-alpha",
    replayDigest: "sha256:" + "1".repeat(64),
    trajectoryDigest: "sha256:" + "2".repeat(64),
    sampleEveryTicks: 2,
    color: "#c4ccd4",
    opacity: 0.5,
    frames: [
      { tick: 0, mapId: "map-main", x: 0, y: 0, z: 0, facingX: 1 },
      { tick: 2, mapId: "map-main", x: 20, y: 10, z: 2, facingX: -1 },
    ],
  }];
  const runtime = createRuntimeModel(authored);
  assert.equal(runtime.getObjects().some((object) => object.id === "ghost-reference"), false);
  runtime.update(1 / 60);
  const ghost = runtime.getGhostStates()[0];
  assert.equal(ghost.presentationOnly, true);
  assert.equal(ghost.x, 10);
  assert.equal(ghost.y, 5);
  assert.equal(runtime.exportSaveState().objectOverrides.some((entry) => entry.objectId === "ghost-reference"), false);
});

test("replay v14 starts the authored seed before tick zero and can derive a passing presentation ghost", () => {
  const authored = createTemplate("platformer");
  authored.gameplayProgram = { version: 1, variables: [{ id: "density", label: "Density", type: "number", initial: 0, min: 0, max: 4, resetPolicy: "run" }], rules: [] };
  authored.runVariationProgram = normalizeRunVariationProgram({
    schemaVersion: LOOPLAB_RUN_VARIATION_PROGRAM_SCHEMA,
    version: 1,
    enabled: true,
    seedNamespace: "replay-test",
    defaultSeed: "alpha",
    dailyChallenge: { enabled: true, namespace: "daily" },
    pools: [{ id: "density", label: "Density", variants: [
      { id: "low", label: "Low", weight: 1, assignments: [{ variableId: "density", value: 1 }] },
      { id: "high", label: "High", weight: 1, assignments: [{ variableId: "density", value: 3 }] },
    ] }],
    ghosts: [],
    acceptanceTestIds: [],
  });
  authored.replay = { version: "1", tickRate: 60, seed: 1, cases: [] };
  const recorded = recordReplayCase(authored, { id: "seed-alpha", name: "Seed alpha", runSeed: "alpha", tickCount: 4, inputs: [], checkpointInterval: 2 });
  assert.equal(recorded.replayCase.hashVersion, LOOPLAB_REPLAY_RUN_VARIATION_HASH_VERSION);
  assert.equal(recorded.replayCase.runSeed, "alpha");
  authored.replay.cases = [recorded.replayCase];
  const rerun = runReplayCase(authored, recorded.replayCase, { capturePlayerEveryTicks: 2 });
  assert.equal(rerun.passed, true);
  assert.equal(rerun.runSeed, "alpha");
  assert.equal(rerun.playerTrajectory[0].tick, 0);
  assert.equal(rerun.playerTrajectory.at(-1).tick, 4);
  const preview = buildReplayGhost(authored, "seed-alpha", { id: "ghost-alpha", sampleEveryTicks: 2 });
  assert.equal(preview.ghost.id, "ghost-alpha");
  assert.equal(preview.ghost.frames.length, 3);
  assert.match(preview.ghost.replayDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(preview.ghost.trajectoryDigest, /^sha256:[a-f0-9]{64}$/);
});
