import assert from "node:assert/strict";
import test from "node:test";

import { createTemplate } from "../lib/looplab-agent-core.mjs";
import { canonicalSha256 } from "../lib/looplab-canonical-digest.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";
import {
  LOOPLAB_PLAYTEST_LEDGER_SCHEMA,
  LOOPLAB_PLAYTEST_OBSERVATION_POLICY,
  LOOPLAB_PLAYTEST_SESSION_SCHEMA,
  addPlaytestSession,
  clearPlaytestSessions,
  createPlaytestLedger,
  finishPlaytestSession,
  parsePlaytestLedger,
  parsePlaytestSession,
  playtestLedgerView,
  recordPlaytestEvents,
  recordPlaytestInput,
  recordPlaytestReset,
  recordPlaytestSample,
  removePlaytestSession,
  resolvePlaytestAction,
  setPlaytestSessionActive,
  startPlaytestSession,
  updatePlaytestFeedback,
  validatePlaytestSession,
} from "../lib/looplab-playtest-observation.mjs";

const START = "2026-08-10T12:00:00.000Z";
const END = "2026-08-10T12:00:09.000Z";
const SOURCE = {
  projectId: "project-pocket",
  projectName: "Pocket Platformer",
  iterationId: "iteration-002",
  sourceDigest: `sha256:${"a".repeat(64)}`,
  startMapId: "map-one",
  startSpawnId: null,
  mapBounds: [
    { mapId: "map-one", width: 320, height: 180 },
    { mapId: "map-two", width: 640, height: 360 },
  ],
};

function draft() {
  return startPlaytestSession({ consent: true, id: "playtest-session-one", source: SOURCE }, { now: START, monotonicNow: 0, active: true });
}

test("playtest observation requires explicit consent and records semantic actions only", () => {
  assert.throws(() => startPlaytestSession({ source: SOURCE }, { now: START, monotonicNow: 0 }), /consent=true/i);
  assert.equal(resolvePlaytestAction("KeyA"), "left");
  assert.equal(resolvePlaytestAction("typed-private-text"), null);
  assert.equal(resolvePlaytestAction("KeyQ", [{ id: "dash", bindings: ["KeyQ"] }]), "dash");

  const active = draft();
  assert.equal(recordPlaytestInput(active, { action: "left", pressed: true, source: "keyboard" }, 100), true);
  assert.equal(recordPlaytestInput(active, { action: "left", pressed: true, source: "keyboard" }, 120), false);
  assert.equal(recordPlaytestInput(active, { action: "left", pressed: false, source: "keyboard" }, 200), true);
  assert.throws(() => recordPlaytestInput(active, { action: "KeyA", pressed: true, source: "keyboard" }, 225), /semantic action/i);
  const session = finishPlaytestSession(active, { outcome: "stopped" }, { now: END, monotonicNow: 250 });

  assert.equal(session.schemaVersion, LOOPLAB_PLAYTEST_SESSION_SCHEMA);
  assert.equal(session.inputTape.replayFixture, false);
  assert.deepEqual(session.inputTape.transitions.map(({ action, pressed }) => ({ action, pressed })), [{ action: "left", pressed: true }, { action: "left", pressed: false }]);
  assert.ok(!JSON.stringify(session).includes("KeyA"));
  assert.equal(session.feedback.source, "unrated");
  assert.equal(session.policy.verificationEvidence, false);
  assert.equal(session.policy.automaticPreference, false);
  assert.equal(validatePlaytestSession(session).valid, true);
});

test("active time excludes hidden/paused intervals and summaries preserve spatial/event facts", () => {
  const active = draft();
  const state = (mapId, x, y, won = false) => ({ activeMapId: mapId, width: mapId === "map-one" ? 320 : 640, height: mapId === "map-one" ? 180 : 360, player: { x, y, z: 0 }, won });

  recordPlaytestSample(active, state("map-one", 16, 90), 0);
  recordPlaytestInput(active, { action: "right", pressed: true, source: "gamepad" }, 100);
  recordPlaytestSample(active, state("map-one", 160, 90), 500);
  recordPlaytestEvents(active, [
    { type: "motion-body.crushed", mapId: "map-one", objectId: "carrier", playerId: "player", blockerId: "ceiling", response: "stop", progress: 31 },
    { type: "player.respawned", mapId: "map-one", cause: "hazard", objectId: "spikes", fromX: 250, fromY: 160, fromZ: 0, toX: 16, toY: 90, toZ: 0 },
  ], state("map-one", 16, 90), 750);
  setPlaytestSessionActive(active, false, 1_000, "document-hidden");
  setPlaytestSessionActive(active, true, 6_000, "document-visible");
  recordPlaytestEvents(active, [{ type: "map.changed", mapId: "map-two", mapName: "Second", transition: "fade" }, { type: "portal.entered", sourceMapId: "map-one", targetMapId: "map-two", objectId: "door" }], state("map-two", 64, 180), 6_250);
  recordPlaytestSample(active, state("map-two", 64, 180), 6_250);
  recordPlaytestReset(active, state("map-two", 64, 180), 6_500);
  recordPlaytestEvents(active, [{ type: "goal.reached", mapId: "map-two", objectId: "goal" }], state("map-two", 620, 300, true), 6_750);
  const session = finishPlaytestSession(active, { outcome: "completed", rating: "up", tags: ["clear-route"], note: "The second map transition stayed readable." }, { now: END, monotonicNow: 7_000 });

  assert.equal(session.activeDurationMs, 2_000);
  assert.equal(session.suspensions.count, 1);
  assert.equal(session.suspensions.reasons["document-hidden"], 1);
  assert.equal(session.summary.completed, true);
  assert.equal(session.summary.counts.respawns, 1);
  assert.deepEqual(
    session.events.find((event) => event.type === "motion-body.crushed"),
    { atMs: 750, type: "motion-body.crushed", mapId: "map-one", objectId: "carrier", playerId: "player", blockerId: "ceiling", response: "stop", progress: 31, position: { x: 16, y: 90, z: 0 } },
  );
  assert.equal(session.summary.counts.portals, 1);
  assert.equal(session.summary.counts.resets, 1);
  assert.equal(session.summary.mapStats.length, 2);
  assert.equal(session.summary.mapStats.find((stat) => stat.mapId === "map-one").visits, 1);
  assert.equal(session.summary.mapStats.find((stat) => stat.mapId === "map-two").visits, 1);
  assert.equal(session.summary.heatmaps.length, 2);
  assert.ok(session.summary.heatmaps[0].cells.some((cell) => cell.respawns === 1));
  assert.equal(session.feedback.source, "user-explicit");
  assert.equal(session.feedback.rating, "up");
});

test("active monotonic gaps are bounded and surfaced without counting suspended time", () => {
  const active = draft();
  const state = { activeMapId: "map-one", width: 320, height: 180, player: { x: 20, y: 40, z: 0 } };
  recordPlaytestSample(active, state, 0);
  recordPlaytestSample(active, state, 5_000);
  setPlaytestSessionActive(active, false, 5_100, "document-hidden");
  setPlaytestSessionActive(active, true, 25_100, "document-visible");
  const session = finishPlaytestSession(active, {}, { now: END, monotonicNow: 25_300 });

  assert.equal(session.activeDurationMs, 1_300);
  assert.equal(session.dropped.clockGaps, 1);
  assert.equal(session.suspensions.count, 1);
});

test("strict imports reject recomputed digests over coerced source or tampered derived summaries", () => {
  const active = draft();
  recordPlaytestSample(active, { activeMapId: "map-one", width: 320, height: 180, player: { x: 40, y: 60, z: 0 } }, 0);
  recordPlaytestInput(active, { action: "jump", pressed: true, source: "keyboard" }, 10);
  recordPlaytestInput(active, { action: "jump", pressed: false, source: "keyboard" }, 20);
  const session = finishPlaytestSession(active, {}, { now: END, monotonicNow: 100 });

  const tamperedSummary = structuredClone(session);
  tamperedSummary.summary.counts.respawns += 1;
  delete tamperedSummary.digest;
  tamperedSummary.digest = canonicalSha256(tamperedSummary);
  assert.throws(() => parsePlaytestSession(tamperedSummary), /canonical summary derived/i);

  const coercedSource = structuredClone(session);
  coercedSource.source.mapBounds[0].width = "320";
  delete coercedSource.digest;
  coercedSource.digest = canonicalSha256(coercedSource);
  assert.throws(() => parsePlaytestSession(coercedSource), /finite number|canonical form/i);

  const rawAction = structuredClone(session);
  rawAction.inputTape.transitions[0].action = " jump ";
  delete rawAction.digest;
  rawAction.digest = canonicalSha256(rawAction);
  assert.throws(() => parsePlaytestSession(rawAction), /canonical semantic action/i);

  const falseDrop = structuredClone(session);
  falseDrop.dropped.events = 1;
  delete falseDrop.digest;
  falseDrop.digest = canonicalSha256(falseDrop);
  assert.throws(() => parsePlaytestSession(falseDrop), /full event buffer/i);

  const wrongCell = structuredClone(session);
  wrongCell.samples[0].cellX += 1;
  wrongCell.summary.heatmaps[0].cells[0].x += 1;
  delete wrongCell.digest;
  wrongCell.digest = canonicalSha256(wrongCell);
  assert.throws(() => parsePlaytestSession(wrongCell), /heatmap cell/i);
});

test("the local ledger is bounded, inspectable, removable, and rejects hidden telemetry fields", () => {
  const active = draft();
  recordPlaytestSample(active, { activeMapId: "map-one", width: 320, height: 180, player: { x: 40, y: 60, z: 0 } }, 0);
  const session = finishPlaytestSession(active, { outcome: "quit" }, { now: END, monotonicNow: 100 });
  let ledger = addPlaytestSession(createPlaytestLedger(), session, { now: END });
  assert.equal(ledger.schemaVersion, LOOPLAB_PLAYTEST_LEDGER_SCHEMA);
  assert.equal(playtestLedgerView(ledger, null, { currentSourceDigest: SOURCE.sourceDigest }).sessions[0].currentSource, true);

  ledger = updatePlaytestFeedback(ledger, session.id, { rating: "down", tags: ["unclear-goal"], note: "I did not know where to go." }, { now: "2026-08-10T12:01:00.000Z" });
  assert.equal(ledger.sessions[0].feedback.rating, "down");
  assert.equal(ledger.sessions[0].feedback.source, "user-explicit");

  const tampered = structuredClone(ledger);
  tampered.sessions[0].samples[0].deviceId = "fingerprint";
  const digestSubject = structuredClone(tampered.sessions[0]);
  delete digestSubject.digest;
  tampered.sessions[0].digest = canonicalSha256(digestSubject);
  assert.throws(() => parsePlaytestLedger(tampered), /deviceId|not an allowed field/i);

  ledger = removePlaytestSession(ledger, session.id, { now: "2026-08-10T12:02:00.000Z" });
  assert.equal(ledger.sessions.length, 0);
  assert.equal(clearPlaytestSessions(ledger, { now: "2026-08-10T12:03:00.000Z" }).sessions.length, 0);
  assert.deepEqual(LOOPLAB_PLAYTEST_OBSERVATION_POLICY, {
    storage: "browser-local-builder-only", optInRequired: true, purpose: LOOPLAB_PLAYTEST_OBSERVATION_POLICY.purpose,
    networkTelemetry: false, projectSource: false, providerContext: false, exportedHtml: false,
    verificationEvidence: false, replayFixture: false, automaticPreference: false, behavioralTasteInference: false,
    screenshots: false, deviceIdentity: false, arbitraryKeys: false,
  });
});

test("runtime hazard respawns expose exact failure and support coordinates to the observer", () => {
  const runtime = createRuntimeModel(createTemplate("platformer"));
  runtime.drainEvents();
  const player = runtime.getObjects().find((object) => object.kind === "player");
  player.x = 345;
  player.y = 475;
  player.z = 0;

  const event = runtime.update(1 / 60).find((candidate) => candidate.type === "player.respawned");
  assert.ok(event);
  assert.equal(event.cause, "hazard");
  assert.equal(event.objectId, "hazard-1");
  assert.equal(event.fromX, 345);
  assert.ok(event.fromY > 475 && event.fromY < 476);
  assert.equal(event.fromZ, 0);
  assert.equal(event.toX, 81);
  assert.equal(event.toY, 404);
  assert.equal(event.toZ, 0);
  assert.deepEqual(runtime.getState().player, { id: "player", x: 81, y: 404, z: 0, vx: 0, vy: 0, grounded: false, groundChainId: null, groundSegmentId: null, groundNormalX: 0, groundNormalY: -1, slopeSliding: false, elevationTransitionId: null, elevationSegmentId: null, elevationProgress: 0, elevationSupportZ: 0 });
});
test("playtest source binding accepts the exact digest produced by Project Doctor", () => {
  const project = createTemplate("platformer");
  const sourceDigest = analyzeProject(project).sourceDigest;
  assert.match(sourceDigest, /^source-[a-f0-9]{64}$/);
  const map = project.maps[0];
  const active = startPlaytestSession({
    consent: true,
    id: "playtest-doctor-source",
    source: {
      projectId: "project-doctor-source",
      projectName: project.name,
      iterationId: null,
      sourceDigest,
      startMapId: map.id,
      startSpawnId: null,
      mapBounds: project.maps.map((candidate) => ({ mapId: candidate.id, width: candidate.width, height: candidate.height })),
    },
  }, { now: START, monotonicNow: 0, active: true });
  recordPlaytestSample(active, { activeMapId: map.id, width: map.width, height: map.height, player: { x: 110, y: 378, z: 0 } }, 0);
  const session = finishPlaytestSession(active, {}, { now: END, monotonicNow: 100 });
  assert.equal(session.source.sourceDigest, sourceDigest);
  assert.equal(validatePlaytestSession(session).valid, true);
});
