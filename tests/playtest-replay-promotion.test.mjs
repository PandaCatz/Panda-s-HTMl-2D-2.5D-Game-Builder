import assert from "node:assert/strict";
import test from "node:test";

import { applyAgentCommand, createTemplate } from "../lib/looplab-agent-core.mjs";
import { canonicalSha256 } from "../lib/looplab-canonical-digest.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import {
  LOOPLAB_PLAYTEST_SESSION_LEGACY_SCHEMA,
  LOOPLAB_PLAYTEST_SESSION_SCHEMA,
  advancePlaytestSimulationTick,
  finishPlaytestSession,
  recordPlaytestEvents,
  recordPlaytestInput,
  startPlaytestSession,
  validatePlaytestSession,
} from "../lib/looplab-playtest-observation.mjs";
import {
  authorizePlaytestReplayPromotion,
  previewPlaytestReplay,
} from "../lib/looplab-playtest-replay.mjs";
import { runReplaySuite } from "../lib/looplab-replay.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";

const START = "2026-08-12T12:00:00.000Z";
const END = "2026-08-12T12:00:02.000Z";

function sourceFor(project) {
  const maps = project.maps ?? [project];
  return {
    projectId: "playtest-promotion-project",
    projectName: project.name,
    iterationId: project.iteration?.id ?? null,
    sourceDigest: analyzeProject(project).sourceDigest,
    startMapId: project.startMapId ?? project.activeMapId ?? maps[0].id,
    startSpawnId: null,
    mapBounds: maps.map((map) => ({ mapId: map.id, width: map.width, height: map.height })),
  };
}

function recordExactRun(project, { id = "playtest-exact-good-run", ticks = 90, startMode = "authored-reset", midRunReset = false } = {}) {
  const source = sourceFor(project);
  const runtime = createRuntimeModel(project);
  assert.equal(runtime.loadMap(source.startMapId, null), true);
  runtime.drainEvents();
  const draft = startPlaytestSession(
    { consent: true, id, source },
    { now: START, monotonicNow: 0, active: true, tickRate: 60, startMode },
  );
  recordPlaytestInput(draft, { action: "right", pressed: true, source: "keyboard" }, 0);
  for (let tick = 0; tick < ticks; tick += 1) {
    if (tick === 45) {
      runtime.setInput("right", false);
      recordPlaytestInput(draft, { action: "right", pressed: false, source: "keyboard" }, tick * (1000 / 60));
    } else if (tick === 0) runtime.setInput("right", true);
    const events = runtime.update(1 / 60);
    advancePlaytestSimulationTick(draft);
    recordPlaytestEvents(draft, events, runtime.getState(), (tick + 1) * (1000 / 60));
  }
  if (midRunReset) recordPlaytestEvents(draft, [{ type: "preview.reset", mapId: source.startMapId }], runtime.getState(), 1_490);
  return finishPlaytestSession(draft, { outcome: "stopped" }, { now: END, monotonicNow: 1_500 });
}

test("exact playtest ticks preview and promote through the ordinary replay recorder", () => {
  const project = createTemplate("platformer");
  const session = recordExactRun(project);
  assert.equal(session.schemaVersion, LOOPLAB_PLAYTEST_SESSION_SCHEMA);
  assert.equal(session.inputTape.semantics, "simulation-tick-action-transitions");
  assert.equal(session.inputTape.tickCount, 90);
  assert.deepEqual(session.inputTape.transitions.map(({ tick, action, pressed }) => ({ tick, action, pressed })), [
    { tick: 0, action: "right", pressed: true },
    { tick: 45, action: "right", pressed: false },
  ]);

  const preview = previewPlaytestReplay(project, session);
  assert.equal(preview.readOnly, true);
  assert.equal(preview.eligible, true, JSON.stringify(preview.blockers));
  assert.equal(preview.eventComparison.matched, true);
  assert.equal(preview.replayResult.status, "passed");

  const promoted = applyAgentCommand(project, {
    op: "promote_playtest_replay",
    session,
    expectedSourceDigest: preview.sourceDigest,
    expectedSessionDigest: preview.sessionDigest,
    expectedPromotionDigest: preview.promotionDigest,
  });
  assert.equal(promoted.changed, true);
  assert.equal(promoted.result.promoted, true);
  assert.equal(promoted.result.replayResult.passed, true);
  assert.equal(runReplaySuite(promoted.project).passed, true);
});

test("promotion rejects stale review digests and never mutates through preview", () => {
  const project = createTemplate("platformer");
  const session = recordExactRun(project, { id: "playtest-digest-guard-run", ticks: 30 });
  const before = canonicalSha256(project);
  const preview = previewPlaytestReplay(project, session);
  assert.equal(canonicalSha256(project), before);
  assert.throws(() => authorizePlaytestReplayPromotion(project, session, {
    expectedSourceDigest: preview.sourceDigest,
    expectedSessionDigest: preview.sessionDigest,
    expectedPromotionDigest: `sha256:${"0".repeat(64)}`,
  }), /stale-promotion/i);
  assert.equal(canonicalSha256(project), before);
});

test("legacy wall-clock sessions remain readable but cannot be rounded into replay ticks", () => {
  const project = createTemplate("platformer");
  const exact = recordExactRun(project, { id: "playtest-legacy-readable", ticks: 20 });
  const legacy = structuredClone(exact);
  legacy.schemaVersion = LOOPLAB_PLAYTEST_SESSION_LEGACY_SCHEMA;
  legacy.inputTape = {
    semantics: "observational-action-transitions",
    replayFixture: false,
    transitions: exact.inputTape.transitions.map(({ atMs, action, pressed, source }) => ({ atMs, action, pressed, source })),
  };
  delete legacy.digest;
  legacy.digest = canonicalSha256(legacy);
  assert.equal(validatePlaytestSession(legacy).valid, true);
  const preview = previewPlaytestReplay(project, legacy);
  assert.equal(preview.eligible, false);
  assert.ok(preview.blockers.some((entry) => entry.code === "legacy-wall-clock-tape"));
});

test("mid-run resets and non-reset starts remain explicit blockers", () => {
  const project = createTemplate("platformer");
  const currentPreview = recordExactRun(project, { id: "playtest-nonreset-run", ticks: 20, startMode: "current-preview" });
  const resetRun = recordExactRun(project, { id: "playtest-reset-run", ticks: 20, midRunReset: true });
  const currentPreviewReview = previewPlaytestReplay(project, currentPreview);
  const resetReview = previewPlaytestReplay(project, resetRun);
  assert.ok(currentPreviewReview.blockers.some((entry) => entry.code === "non-reset-start"));
  assert.ok(resetReview.blockers.some((entry) => entry.code === "mid-run-reset"));
});
