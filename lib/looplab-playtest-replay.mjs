import { canonicalSha256 } from "./looplab-canonical-digest.mjs";
import { analyzeProject } from "./looplab-doctor.mjs";
import {
  LOOPLAB_PLAYTEST_REPLAY_EVENT_TYPES,
  LOOPLAB_PLAYTEST_SESSION_LEGACY_SCHEMA,
  LOOPLAB_PLAYTEST_SESSION_SCHEMA,
  parsePlaytestSession,
} from "./looplab-playtest-observation.mjs";
import { recordReplayCase } from "./looplab-replay.mjs";

export const LOOPLAB_PLAYTEST_REPLAY_PREVIEW_SCHEMA = "looplab-playtest-replay-preview/v1";
export const LOOPLAB_PLAYTEST_REPLAY_PROMOTION_SCHEMA = "looplab-playtest-replay-promotion/v1";

export const LOOPLAB_PLAYTEST_REPLAY_POLICY = Object.freeze({
  observationAuthority: false,
  previewMutatesProject: false,
  exactTickTapeRequired: true,
  authoredResetRequired: true,
  sourceDigestRequired: true,
  sessionDigestRequired: true,
  promotionDigestRequired: true,
  dryRunRequired: true,
  eventCountParityRequired: true,
  ordinaryReplayCasePath: true,
  replayFixtureAfterPromotion: true,
});

const REPLAY_ACTION_ALIASES = new Set([
  "left", "right", "up", "down", "jump", "interact", "lock",
  "move-left", "move-right", "move-up", "move-down",
]);

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function blocker(code, message) {
  return { code, message };
}

function warning(code, message) {
  return { code, message };
}

function replayCaseId(session, requested) {
  const explicit = String(requested ?? "").trim();
  if (explicit) return explicit;
  const suffix = String(session.id ?? "recorded-run")
    .toLowerCase()
    .replace(/^playtest-/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "recorded-run";
  return `human-run-${suffix}`;
}

function eventCounts(events) {
  const comparable = new Set(LOOPLAB_PLAYTEST_REPLAY_EVENT_TYPES);
  const counts = {};
  for (const event of Array.isArray(events) ? events : []) {
    const type = String(event?.type ?? "");
    if (!comparable.has(type)) continue;
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

function compareEventCounts(recordedEvents, emittedCounts = {}) {
  const recorded = eventCounts(recordedEvents);
  const replayed = Object.fromEntries(
    Object.entries(emittedCounts)
      .filter(([type, count]) => LOOPLAB_PLAYTEST_REPLAY_EVENT_TYPES.includes(type) && Number(count) > 0)
      .map(([type, count]) => [type, Number(count)]),
  );
  const types = [...new Set([...Object.keys(recorded), ...Object.keys(replayed)])].sort();
  const differences = types
    .map((type) => ({ type, recorded: recorded[type] ?? 0, replayed: replayed[type] ?? 0 }))
    .filter((entry) => entry.recorded !== entry.replayed);
  return { matched: differences.length === 0, recorded, replayed, differences };
}

function promotionSubject(preview) {
  return {
    schemaVersion: LOOPLAB_PLAYTEST_REPLAY_PROMOTION_SCHEMA,
    sourceDigest: preview.sourceDigest,
    sessionDigest: preview.sessionDigest,
    replaySpecification: preview.replaySpecification,
    replayCaseDigest: preview.replayCaseDigest,
    replayResult: preview.replayResult,
    eventComparison: preview.eventComparison,
    blockers: preview.blockers,
    warnings: preview.warnings,
    eligible: preview.eligible,
  };
}

export function previewPlaytestReplay(inputProject, inputSession, options = {}) {
  const project = clone(inputProject);
  const sourceDigest = analyzeProject(project).sourceDigest;
  const blockers = [];
  const warnings = [
    warning("observation-not-evidence", "The saved observation remains non-authoritative until this exact preview is explicitly promoted and rerun through the ordinary replay path."),
    warning("observation-metadata-excluded", "Heatmaps, samples, wall-clock timing, device/source labels, and feedback are excluded from the replay fixture."),
  ];
  let session = null;
  try {
    session = parsePlaytestSession(inputSession);
  } catch (error) {
    blockers.push(blocker("invalid-session", error instanceof Error ? error.message : "The playtest session is invalid."));
  }

  const base = {
    schemaVersion: LOOPLAB_PLAYTEST_REPLAY_PREVIEW_SCHEMA,
    readOnly: true,
    providerFree: true,
    cloneExecuted: true,
    sourceDigest,
    sessionDigest: session?.digest ?? null,
    sourceMatches: Boolean(session && session.source?.sourceDigest === sourceDigest),
    replaySpecification: null,
    replayCase: null,
    replayCaseDigest: null,
    replayResult: null,
    eventComparison: null,
    blockers,
    warnings,
    eligible: false,
    policy: clone(LOOPLAB_PLAYTEST_REPLAY_POLICY),
  };

  if (!session) {
    const promotionDigest = canonicalSha256(promotionSubject(base));
    return { ...base, promotionDigest };
  }

  if (session.schemaVersion === LOOPLAB_PLAYTEST_SESSION_LEGACY_SCHEMA) {
    blockers.push(blocker("legacy-wall-clock-tape", `Session ${session.id} predates exact simulation-tick capture and cannot be safely rounded into a replay.`));
  } else if (session.schemaVersion !== LOOPLAB_PLAYTEST_SESSION_SCHEMA) {
    blockers.push(blocker("unsupported-session-version", `Session ${session.id} uses an unsupported recorder schema.`));
  }
  if (session.source.sourceDigest !== sourceDigest) blockers.push(blocker("stale-source", `Session ${session.id} belongs to ${session.source.sourceDigest}, while the current project is ${sourceDigest}.`));

  const tape = session.inputTape ?? {};
  if (session.schemaVersion === LOOPLAB_PLAYTEST_SESSION_SCHEMA) {
    if (tape.startTick !== 0) blockers.push(blocker("nonzero-start-tick", "Replay promotion requires a zero-based simulation tape."));
    if (tape.startMode !== "authored-reset") blockers.push(blocker("non-reset-start", "The recording began from the current preview state instead of the authored reset state."));
    if (!Number.isInteger(tape.tickCount) || tape.tickCount < 1) blockers.push(blocker("empty-tick-tape", "The recording must contain at least one completed simulation tick."));
  }
  if (session.outcome === "timeout") blockers.push(blocker("recorder-limit-reached", "The recording reached a recorder limit and cannot prove a complete exact tape."));
  if (Number(session.dropped?.inputTransitions ?? 0) > 0) blockers.push(blocker("dropped-input", "The recorder dropped semantic input transitions."));
  if (Number(session.dropped?.events ?? 0) > 0) blockers.push(blocker("dropped-events", "The recorder dropped runtime events required for parity comparison."));
  if ((session.events ?? []).some((event) => event.type === "preview.reset")) blockers.push(blocker("mid-run-reset", "The run reset after recording began; record a fresh uninterrupted run."));

  const knownActions = new Set([
    ...REPLAY_ACTION_ALIASES,
    ...(project.inputActions ?? []).map((action) => String(action?.id ?? "").trim()).filter(Boolean),
  ]);
  for (const transition of tape.transitions ?? []) {
    if (!knownActions.has(String(transition.action ?? ""))) {
      blockers.push(blocker("unresolved-action", `Semantic action ${transition.action} is not declared by the current project runtime.`));
      break;
    }
  }

  const id = replayCaseId(session, options.id);
  const existing = (project.replay?.cases ?? []).find((candidate) => candidate.id === id);
  if (existing && (!Number.isInteger(options.revision) || Number(options.revision) <= Number(existing.revision ?? 1) || !String(options.changeReason ?? "").trim())) {
    blockers.push(blocker("unsafe-replacement", `Replay ${id} already exists. Supply a higher revision and an explicit changeReason to replace a regression bar.`));
  }

  const replaySpecification = session.schemaVersion === LOOPLAB_PLAYTEST_SESSION_SCHEMA ? {
    id,
    name: String(options.name ?? `Human run · ${session.source.projectName}`).trim() || id,
    revision: Number.isInteger(options.revision) ? Number(options.revision) : 1,
    changeReason: String(options.changeReason ?? `Promoted from exact playtest ${session.id}.`).trim(),
    tickRate: Number(tape.tickRate),
    tickCount: Number(tape.tickCount),
    startMapId: session.source.startMapId,
    ...(session.source.startSpawnId ? { startSpawnId: session.source.startSpawnId } : {}),
    inputs: (tape.transitions ?? [])
      .filter((transition) => Number.isInteger(transition.tick) && transition.tick < tape.tickCount)
      .map((transition) => ({ tick: transition.tick, action: transition.action, pressed: transition.pressed })),
    checkpointInterval: Number.isInteger(options.checkpointInterval) ? Number(options.checkpointInterval) : 30,
  } : null;
  base.replaySpecification = replaySpecification;

  let recorded = null;
  if (blockers.length === 0 && replaySpecification) {
    try {
      recorded = recordReplayCase(project, replaySpecification);
      const eventComparison = compareEventCounts(session.events, recorded.result.emittedEventCounts);
      base.replayCase = clone(recorded.replayCase);
      base.replayCaseDigest = canonicalSha256(recorded.replayCase);
      base.replayResult = clone(recorded.result);
      base.eventComparison = eventComparison;
      if (!recorded.result.passed) blockers.push(blocker("dry-run-failed", "The recorded fixture did not immediately replay with its own pinned hashes."));
      if (!eventComparison.matched) blockers.push(blocker("event-count-mismatch", "The deterministic replay emitted different canonical event counts than the observed run."));
    } catch (error) {
      blockers.push(blocker("dry-run-error", error instanceof Error ? error.message : "The deterministic dry run failed."));
    }
  }

  const eligible = blockers.length === 0 && Boolean(recorded?.result?.passed);
  const preview = { ...base, blockers, warnings, eligible };
  const promotionDigest = canonicalSha256(promotionSubject(preview));
  return { ...preview, promotionDigest };
}

export function authorizePlaytestReplayPromotion(inputProject, inputSession, options = {}) {
  const preview = previewPlaytestReplay(inputProject, inputSession, options);
  const expectedSourceDigest = String(options.expectedSourceDigest ?? "").trim();
  const expectedSessionDigest = String(options.expectedSessionDigest ?? "").trim();
  const expectedPromotionDigest = String(options.expectedPromotionDigest ?? "").trim();
  if (!expectedSourceDigest || expectedSourceDigest !== preview.sourceDigest) throw new Error(`[stale-source] Replay promotion expected ${expectedSourceDigest || "no source digest"}, but the current project is ${preview.sourceDigest}.`);
  if (!expectedSessionDigest || expectedSessionDigest !== preview.sessionDigest) throw new Error(`[stale-session] Replay promotion expected ${expectedSessionDigest || "no session digest"}, but the selected session is ${preview.sessionDigest}.`);
  if (!expectedPromotionDigest || expectedPromotionDigest !== preview.promotionDigest) throw new Error(`[stale-promotion] Replay promotion expected ${expectedPromotionDigest || "no promotion digest"}, but the exact review is ${preview.promotionDigest}.`);
  if (!preview.eligible) throw new Error(`Playtest replay promotion is blocked: ${preview.blockers.map((entry) => `[${entry.code}] ${entry.message}`).join(" ")}`);
  return preview;
}
