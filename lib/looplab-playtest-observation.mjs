import { canonicalSha256 } from "./looplab-canonical-digest.mjs";
import { LOOPLAB_CANONICAL_PRESENTATION_EVENTS } from "./looplab-presentation.mjs";

export const LOOPLAB_PLAYTEST_LEDGER_SCHEMA = "looplab-playtest-ledger/v1";
export const LOOPLAB_PLAYTEST_SESSION_LEGACY_SCHEMA = "looplab-playtest-session/v1";
export const LOOPLAB_PLAYTEST_SESSION_SCHEMA = "looplab-playtest-session/v2";

export const LOOPLAB_PLAYTEST_PURPOSE = "Improve the selected 2D game through a local, consented human playtest observation.";

export const LOOPLAB_PLAYTEST_OBSERVATION_POLICY = Object.freeze({
  storage: "browser-local-builder-only",
  optInRequired: true,
  purpose: LOOPLAB_PLAYTEST_PURPOSE,
  networkTelemetry: false,
  projectSource: false,
  providerContext: false,
  exportedHtml: false,
  verificationEvidence: false,
  replayFixture: false,
  automaticPreference: false,
  behavioralTasteInference: false,
  screenshots: false,
  deviceIdentity: false,
  arbitraryKeys: false,
});

export const LOOPLAB_PLAYTEST_LIMITS = Object.freeze({
  sessions: 20,
  activeDurationMs: 15 * 60 * 1_000,
  inputTransitions: 4_000,
  samples: 3_600,
  events: 2_000,
  idleSpans: 200,
  sampleIntervalMs: 250,
  idleThresholdMs: 5_000,
  heatmapColumns: 16,
  heatmapRows: 12,
  feedbackTags: 8,
  feedbackTagLength: 48,
  feedbackNoteLength: 600,
  simulationTicks: 36_000,
});

const RATINGS = new Set(["up", "neutral", "down", "unrated"]);
const OUTCOMES = new Set(["completed", "quit", "stopped", "timeout", "left-preview"]);
const INPUT_SOURCES = new Set(["keyboard", "touch", "gamepad", "headless", "lifecycle"]);
export const LOOPLAB_PLAYTEST_REPLAY_EVENT_TYPES = Object.freeze([...LOOPLAB_CANONICAL_PRESENTATION_EVENTS]);
const KNOWN_EVENTS = new Set([
  ...LOOPLAB_PLAYTEST_REPLAY_EVENT_TYPES,
  "gameplay.rule-guard",
  "motion-body.guard",
  "preview.reset",
]);
const EVENT_TEXT_FIELDS = new Set([
  "mapId", "mapName", "transition", "objectId", "ruleId", "sourceMapId", "targetMapId",
  "actionId", "pathId", "choiceId", "pageId", "clockId", "variableId", "cause", "spawnId",
  "blockerId", "playerId", "actorId", "targetActorId", "projectileId", "emitterId", "teamId",
  "direction", "driver", "endBehavior", "response", "mode", "previousMode", "nodeId", "targetNodeId",
]);
const EVENT_NUMBER_FIELDS = new Set([
  "count", "value", "steps", "fromX", "fromY", "fromZ", "toX", "toY", "toZ",
  "progress", "speed", "remaining", "damage", "health", "maximumHealth",
]);
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SOURCE_DIGEST_PATTERN = /^(?:sha256:|source-)[a-f0-9]{64}$/;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{5,95}$/;
const SEMANTIC_ACTION_PATTERN = /^[a-z][a-z0-9-]{0,79}$/;
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const rounded = (value, precision = 3) => Number(finite(value).toFixed(precision));
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, finite(value, minimum)));
const cleanText = (value, maximum) => String(value ?? "").trim().slice(0, maximum);
const validDate = (value) => typeof value === "string" && value === value.trim() && value.length <= 40 && Number.isFinite(Date.parse(value));

function strictText(value, label, maximum, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === "")) return "";
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  const text = value.trim();
  if (!text || text.length > maximum) throw new Error(`${label} must be 1–${maximum} trimmed characters.`);
  return text;
}

function strictId(value, label) {
  const id = strictText(value, label, 96);
  if (!ID_PATTERN.test(id)) throw new Error(`${label} must be a stable lowercase hyphenated ID.`);
  return id;
}

function strictTime(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > LOOPLAB_PLAYTEST_LIMITS.activeDurationMs) throw new Error(`${label} must be a bounded non-negative integer.`);
  return value;
}

function strictTags(value) {
  if (!Array.isArray(value)) throw new Error("Playtest feedback tags must be an array.");
  if (value.length > LOOPLAB_PLAYTEST_LIMITS.feedbackTags) throw new Error(`Playtest feedback may contain at most ${LOOPLAB_PLAYTEST_LIMITS.feedbackTags} tags.`);
  const tags = value.map((tag, index) => strictText(tag, `Playtest feedback tag ${index + 1}`, LOOPLAB_PLAYTEST_LIMITS.feedbackTagLength));
  if (new Set(tags.map((tag) => tag.toLowerCase())).size !== tags.length) throw new Error("Playtest feedback tags cannot contain duplicates.");
  return tags;
}

function unknownKeys(value, allowed, label, errors) {
  for (const key of Object.keys(value ?? {})) if (!allowed.has(key)) errors.push(`${label}.${key} is not an allowed field.`);
}

function normalizedMapBounds(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) throw new Error("Playtest source requires 1–64 map bounds.");
  const seen = new Set();
  return value.map((map, index) => {
    if (!map || typeof map !== "object" || Array.isArray(map)) throw new Error(`Playtest map bound ${index + 1} must be an object.`);
    const unknown = Object.keys(map).filter((key) => !["mapId", "width", "height"].includes(key));
    if (unknown.length) throw new Error(`Playtest map bound ${index + 1}.${unknown[0]} is not allowed.`);
    const mapId = strictText(map.mapId, `Playtest map bound ${index + 1} ID`, 120);
    if (seen.has(mapId)) throw new Error(`Playtest map bound duplicates ${mapId}.`);
    seen.add(mapId);
    if (!Number.isFinite(map.width) || map.width < 1 || map.width > 100_000) throw new Error(`Playtest map bound ${index + 1} width must be a finite number from 1–100000.`);
    if (!Number.isFinite(map.height) || map.height < 1 || map.height > 100_000) throw new Error(`Playtest map bound ${index + 1} height must be a finite number from 1–100000.`);
    const width = rounded(map.width);
    const height = rounded(map.height);
    return { mapId, width, height };
  });
}

function normalizedSourceBinding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Playtest source binding must be an object.");
  const unknown = Object.keys(value).filter((key) => !["projectId", "projectName", "iterationId", "sourceDigest", "startMapId", "startSpawnId", "mapBounds"].includes(key));
  if (unknown.length) throw new Error(`Playtest source.${unknown[0]} is not allowed.`);
  const sourceDigest = strictText(value.sourceDigest, "Playtest source digest", 80);
  if (!SOURCE_DIGEST_PATTERN.test(sourceDigest)) throw new Error("Playtest source digest must be an exact Project Doctor or canonical SHA-256 digest.");
  return {
    projectId: strictText(value.projectId, "Playtest project ID", 160),
    projectName: strictText(value.projectName, "Playtest project name", 200),
    iterationId: value.iterationId === null || value.iterationId === undefined ? null : strictText(value.iterationId, "Playtest iteration ID", 160),
    sourceDigest,
    startMapId: strictText(value.startMapId, "Playtest start map ID", 120),
    startSpawnId: value.startSpawnId === null || value.startSpawnId === undefined ? null : strictText(value.startSpawnId, "Playtest start spawn ID", 120),
    mapBounds: normalizedMapBounds(value.mapBounds),
  };
}

function sessionId(source, now) {
  return `playtest-${canonicalSha256({ sourceDigest: source.sourceDigest, projectId: source.projectId, now }).slice(-16)}`;
}

function advanceClock(draft, monotonicMs) {
  const next = Math.max(draft._lastMonotonicMs, finite(monotonicMs, draft._lastMonotonicMs));
  const rawElapsed = next - draft._lastMonotonicMs;
  if (draft._clockActive && draft.activeDurationMs < LOOPLAB_PLAYTEST_LIMITS.activeDurationMs && rawElapsed > 1_000) draft.dropped.clockGaps += 1;
  const elapsed = Math.min(rawElapsed, 1_000);
  draft._lastMonotonicMs = next;
  if (!draft._clockActive || draft.activeDurationMs >= LOOPLAB_PLAYTEST_LIMITS.activeDurationMs) return draft.activeDurationMs;
  const accepted = Math.min(elapsed, LOOPLAB_PLAYTEST_LIMITS.activeDurationMs - draft.activeDurationMs);
  draft.activeDurationMs = Math.round(draft.activeDurationMs + accepted);
  if (draft.activeDurationMs >= LOOPLAB_PLAYTEST_LIMITS.activeDurationMs) draft.limitReached = true;
  return draft.activeDurationMs;
}

function assertDraft(draft) {
  if (!draft || draft.schemaVersion !== LOOPLAB_PLAYTEST_SESSION_SCHEMA || draft.status !== "recording") throw new Error("An active playtest recording is required.");
}

export function createPlaytestLedger() {
  return { schemaVersion: LOOPLAB_PLAYTEST_LEDGER_SCHEMA, revision: 0, updatedAt: null, sessions: [] };
}

export function startPlaytestSession(input = {}, options = {}) {
  if (input.consent !== true) throw new Error("Start playtest recording only after explicit consent=true.");
  const source = normalizedSourceBinding(input.source);
  if (!source.mapBounds.some((map) => map.mapId === source.startMapId)) throw new Error("Playtest start map must exist in the source-bound map list.");
  const now = options.now ?? new Date().toISOString();
  if (!validDate(now)) throw new Error("Playtest start time must be ISO-compatible.");
  const monotonicNow = Math.max(0, finite(options.monotonicNow));
  const active = options.active !== false;
  return {
    schemaVersion: LOOPLAB_PLAYTEST_SESSION_SCHEMA,
    id: input.id === undefined ? sessionId(source, now) : strictId(input.id, "Playtest session ID"),
    status: "recording",
    source,
    consent: { granted: true, purpose: LOOPLAB_PLAYTEST_PURPOSE, grantedAt: now },
    startedAt: now,
    activeDurationMs: 0,
    inputTransitions: [],
    samples: [],
    events: [],
    idleSpans: [],
    suspensions: { count: 0, reasons: {} },
    dropped: { inputTransitions: 0, samples: 0, events: 0, clockGaps: 0 },
    limitReached: false,
    _clockActive: active,
    _lastMonotonicMs: monotonicNow,
    _currentMapId: source.startMapId,
    _simulationTick: 0,
    _tickRate: Number.isInteger(options.tickRate) && options.tickRate >= 20 && options.tickRate <= 240 ? options.tickRate : 60,
    _startMode: options.startMode === "current-preview" ? "current-preview" : "authored-reset",
    _pressedActions: new Set(),
    _lastSampleAtMs: -LOOPLAB_PLAYTEST_LIMITS.sampleIntervalMs,
    _lastActivityAtMs: 0,
    _idleStartAtMs: null,
    _lastPosition: null,
  };
}

export function advancePlaytestSimulationTick(draft, count = 1) {
  assertDraft(draft);
  if (!Number.isInteger(count) || count < 1 || count > LOOPLAB_PLAYTEST_LIMITS.simulationTicks) throw new Error("Playtest simulation tick advance must be a bounded positive integer.");
  draft._simulationTick = Math.min(LOOPLAB_PLAYTEST_LIMITS.simulationTicks, draft._simulationTick + count);
  if (draft._simulationTick >= LOOPLAB_PLAYTEST_LIMITS.simulationTicks) draft.limitReached = true;
  return draft._simulationTick;
}

export function setPlaytestSessionActive(draft, active, monotonicMs, reason = "preview-paused") {
  assertDraft(draft);
  advanceClock(draft, monotonicMs);
  const next = Boolean(active) && !draft.limitReached;
  if (draft._clockActive && !next) {
    const cleanReason = cleanText(reason, 48).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "preview-paused";
    draft.suspensions.count += 1;
    draft.suspensions.reasons[cleanReason] = (draft.suspensions.reasons[cleanReason] ?? 0) + 1;
  }
  draft._clockActive = next;
  return playtestActiveSessionView(draft);
}

export function resolvePlaytestAction(code, inputActions = []) {
  const source = cleanText(code, 120);
  if (!source) return null;
  for (const action of Array.isArray(inputActions) ? inputActions : []) {
    if (!action || typeof action.id !== "string") continue;
    if (action.id === source || (Array.isArray(action.bindings) && action.bindings.includes(source))) return cleanText(action.id, 80) || null;
  }
  const aliases = {
    ArrowLeft: "left", KeyA: "left", left: "left", "move-left": "left",
    ArrowRight: "right", KeyD: "right", right: "right", "move-right": "right",
    ArrowUp: "up", KeyW: "up", up: "up", "move-up": "up",
    ArrowDown: "down", KeyS: "down", down: "down", "move-down": "down",
    Space: "jump", jump: "jump", KeyE: "interact", interact: "interact", lock: "interact",
  };
  return aliases[source] ?? null;
}

export function recordPlaytestInput(draft, input = {}, monotonicMs) {
  assertDraft(draft);
  advanceClock(draft, monotonicMs);
  const action = strictText(input.action, "Playtest semantic action", 80);
  if (!SEMANTIC_ACTION_PATTERN.test(action)) throw new Error("Playtest semantic action must be a lowercase action ID, not a raw key or typed text.");
  const pressed = input.pressed === true;
  const source = INPUT_SOURCES.has(input.source) ? input.source : "lifecycle";
  const already = draft._pressedActions.has(action);
  if (already === pressed) return false;
  if (pressed) draft._pressedActions.add(action);
  else draft._pressedActions.delete(action);
  draft._lastActivityAtMs = draft.activeDurationMs;
  closeIdleSpan(draft, draft.activeDurationMs);
  if (draft.inputTransitions.length >= LOOPLAB_PLAYTEST_LIMITS.inputTransitions) {
    draft.dropped.inputTransitions += 1;
    return false;
  }
  draft.inputTransitions.push({ tick: draft._simulationTick, atMs: draft.activeDurationMs, action, pressed, source });
  return true;
}

function closeIdleSpan(draft, atMs) {
  if (draft._idleStartAtMs === null) return;
  const endMs = Math.max(draft._idleStartAtMs, Math.round(atMs));
  if (draft.idleSpans.length < LOOPLAB_PLAYTEST_LIMITS.idleSpans) {
    draft.idleSpans.push({ startMs: draft._idleStartAtMs, endMs, durationMs: endMs - draft._idleStartAtMs, mapId: draft._currentMapId });
  }
  draft._idleStartAtMs = null;
}

function trackActivity(draft, state) {
  const player = state?.player;
  const position = player ? { mapId: state.activeMapId, x: finite(player.x), y: finite(player.y), z: finite(player.z) } : null;
  const moved = Boolean(position && draft._lastPosition && (position.mapId !== draft._lastPosition.mapId || Math.hypot(position.x - draft._lastPosition.x, position.y - draft._lastPosition.y) > 0.25 || Math.abs(position.z - draft._lastPosition.z) > 0.25));
  if (position) draft._lastPosition = position;
  if (moved || draft._pressedActions.size > 0) {
    draft._lastActivityAtMs = draft.activeDurationMs;
    closeIdleSpan(draft, draft.activeDurationMs);
  } else if (draft._idleStartAtMs === null && draft.activeDurationMs - draft._lastActivityAtMs >= LOOPLAB_PLAYTEST_LIMITS.idleThresholdMs) {
    draft._idleStartAtMs = draft._lastActivityAtMs + LOOPLAB_PLAYTEST_LIMITS.idleThresholdMs;
  }
}

export function recordPlaytestSample(draft, state = {}, monotonicMs) {
  assertDraft(draft);
  advanceClock(draft, monotonicMs);
  if (!draft._clockActive || draft.limitReached || draft.activeDurationMs - draft._lastSampleAtMs < LOOPLAB_PLAYTEST_LIMITS.sampleIntervalMs) return false;
  const mapId = cleanText(state.activeMapId, 120);
  const player = state.player;
  if (!mapId || !player || !Number.isFinite(Number(player.x)) || !Number.isFinite(Number(player.y))) return false;
  if (mapId !== draft._currentMapId) draft._currentMapId = mapId;
  trackActivity(draft, state);
  draft._lastSampleAtMs = draft.activeDurationMs;
  if (draft.samples.length >= LOOPLAB_PLAYTEST_LIMITS.samples) {
    draft.dropped.samples += 1;
    draft.limitReached = true;
    return false;
  }
  const bound = draft.source.mapBounds.find((map) => map.mapId === mapId) ?? { width: Math.max(1, finite(state.width, 1)), height: Math.max(1, finite(state.height, 1)) };
  const x = rounded(player.x);
  const y = rounded(player.y);
  const z = rounded(player.z);
  const cellX = Math.floor(clamp(x / bound.width, 0, 0.999999) * LOOPLAB_PLAYTEST_LIMITS.heatmapColumns);
  const cellY = Math.floor(clamp(y / bound.height, 0, 0.999999) * LOOPLAB_PLAYTEST_LIMITS.heatmapRows);
  draft.samples.push({ atMs: draft.activeDurationMs, mapId, x, y, z, cellX, cellY });
  return true;
}

function sanitizeRuntimeEvent(event, state, atMs) {
  if (!event || typeof event !== "object" || !KNOWN_EVENTS.has(event.type)) return null;
  const clean = { atMs, type: event.type };
  for (const key of EVENT_TEXT_FIELDS) {
    if (typeof event[key] === "string" && event[key].trim()) clean[key] = cleanText(event[key], 160);
  }
  for (const key of EVENT_NUMBER_FIELDS) if (Number.isFinite(Number(event[key]))) clean[key] = rounded(event[key]);
  const mapId = clean.mapId ?? cleanText(state?.activeMapId, 120);
  if (mapId) clean.mapId = mapId;
  const player = state?.player;
  if (player) clean.position = { x: rounded(player.x), y: rounded(player.y), z: rounded(player.z) };
  return clean;
}

export function recordPlaytestEvents(draft, events = [], state = {}, monotonicMs) {
  assertDraft(draft);
  advanceClock(draft, monotonicMs);
  let recorded = 0;
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type === "map.changed" && typeof event.mapId === "string" && event.mapId && event.mapId !== draft._currentMapId) draft._currentMapId = event.mapId;
    const clean = sanitizeRuntimeEvent(event, state, draft.activeDurationMs);
    if (!clean) continue;
    if (draft.events.length >= LOOPLAB_PLAYTEST_LIMITS.events) {
      draft.dropped.events += 1;
      continue;
    }
    draft.events.push(clean);
    recorded += 1;
  }
  return recorded;
}

export function recordPlaytestReset(draft, state = {}, monotonicMs) {
  return recordPlaytestEvents(draft, [{ type: "preview.reset", mapId: state.activeMapId }], state, monotonicMs);
}

function normalizedFeedback(value = {}) {
  const rating = value.rating ?? "unrated";
  if (!RATINGS.has(rating)) throw new Error("Playtest rating must be up, neutral, down, or unrated.");
  const tags = strictTags(value.tags ?? []);
  const note = value.note === undefined || value.note === null || value.note === "" ? "" : strictText(value.note, "Playtest feedback note", LOOPLAB_PLAYTEST_LIMITS.feedbackNoteLength);
  return { source: rating === "unrated" && tags.length === 0 && !note ? "unrated" : "user-explicit", rating, tags, note };
}

function heatmapForSession(draft, mapId) {
  const counts = new Map();
  for (const sample of draft.samples) {
    if (sample.mapId !== mapId) continue;
    const key = `${sample.cellX}:${sample.cellY}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const respawns = new Map();
  for (const event of draft.events) {
    if (event.type !== "player.respawned" || event.mapId !== mapId) continue;
    const bound = draft.source.mapBounds.find((map) => map.mapId === mapId);
    const x = Number.isFinite(event.fromX) ? event.fromX : event.position?.x;
    const y = Number.isFinite(event.fromY) ? event.fromY : event.position?.y;
    if (!bound || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const cellX = Math.floor(clamp(x / bound.width, 0, 0.999999) * LOOPLAB_PLAYTEST_LIMITS.heatmapColumns);
    const cellY = Math.floor(clamp(y / bound.height, 0, 0.999999) * LOOPLAB_PLAYTEST_LIMITS.heatmapRows);
    const key = `${cellX}:${cellY}`;
    respawns.set(key, (respawns.get(key) ?? 0) + 1);
  }
  const keys = [...new Set([...counts.keys(), ...respawns.keys()])].sort((a, b) => {
    const [ax, ay] = a.split(":").map(Number);
    const [bx, by] = b.split(":").map(Number);
    return ay - by || ax - bx;
  });
  return {
    mapId,
    columns: LOOPLAB_PLAYTEST_LIMITS.heatmapColumns,
    rows: LOOPLAB_PLAYTEST_LIMITS.heatmapRows,
    cells: keys.map((key) => {
      const [x, y] = key.split(":").map(Number);
      return { x, y, samples: counts.get(key) ?? 0, respawns: respawns.get(key) ?? 0 };
    }),
  };
}

function observedMapTimeline(session) {
  const activeDurationMs = Math.max(0, Math.round(finite(session.activeDurationMs)));
  const sourceMapIds = new Set(session.source.mapBounds.map((map) => map.mapId));
  const markersByTime = new Map();
  for (const [index, sample] of (session.samples ?? []).entries()) {
    if (!sourceMapIds.has(sample?.mapId) || !Number.isInteger(sample?.atMs)) continue;
    markersByTime.set(sample.atMs, { atMs: sample.atMs, mapId: sample.mapId, priority: 0, index });
  }
  for (const [index, event] of (session.events ?? []).entries()) {
    if (event?.type !== "map.changed" || !sourceMapIds.has(event.mapId) || !Number.isInteger(event.atMs)) continue;
    markersByTime.set(event.atMs, { atMs: event.atMs, mapId: event.mapId, priority: 1, index });
  }
  const markers = [...markersByTime.values()].sort((a, b) => a.atMs - b.atMs || a.priority - b.priority || a.index - b.index);
  const durations = { [session.source.startMapId]: 0 };
  const visits = { [session.source.startMapId]: 1 };
  const segments = [{ atMs: 0, mapId: session.source.startMapId }];
  let currentMapId = session.source.startMapId;
  let previousAtMs = 0;
  for (const marker of markers) {
    const atMs = Math.max(previousAtMs, Math.min(activeDurationMs, marker.atMs));
    if (marker.mapId === currentMapId) continue;
    durations[currentMapId] = Math.round((durations[currentMapId] ?? 0) + (atMs - previousAtMs));
    currentMapId = marker.mapId;
    if (!Object.prototype.hasOwnProperty.call(durations, currentMapId)) durations[currentMapId] = 0;
    visits[currentMapId] = (visits[currentMapId] ?? 0) + 1;
    previousAtMs = atMs;
    segments.push({ atMs, mapId: currentMapId });
  }
  durations[currentMapId] = Math.round((durations[currentMapId] ?? 0) + (activeDurationMs - previousAtMs));
  return { durations, visits, segments };
}

function observedMapAt(timeline, atMs) {
  return timeline.segments.findLast((segment) => segment.atMs <= atMs)?.mapId ?? timeline.segments[0].mapId;
}

function summarizeSession(session, outcome) {
  const samples = Array.isArray(session.samples) ? session.samples : [];
  const events = Array.isArray(session.events) ? session.events : [];
  const transitions = Array.isArray(session.inputTransitions) ? session.inputTransitions : session.inputTape?.transitions ?? [];
  const idleSpans = Array.isArray(session.idleSpans) ? session.idleSpans : [];
  const timeline = observedMapTimeline(session);
  const mapIds = [...new Set([...Object.keys(timeline.durations), ...samples.map((sample) => sample.mapId), ...events.map((event) => event.mapId).filter(Boolean)])];
  const countType = (type, mapId = null) => events.filter((event) => event.type === type && (!mapId || event.mapId === mapId)).length;
  const mapStats = mapIds.map((mapId) => ({
    mapId,
    activeDurationMs: Math.round(timeline.durations[mapId] ?? 0),
    visits: timeline.visits[mapId] ?? 0,
    sampleCount: samples.filter((sample) => sample.mapId === mapId).length,
    actionCount: transitions.filter((input) => input.pressed && observedMapAt(timeline, input.atMs) === mapId).length,
    collections: countType("coin.collected", mapId) + countType("object.collected", mapId),
    respawns: countType("player.respawned", mapId),
    resets: countType("preview.reset", mapId),
    portals: countType("portal.entered", mapId),
  }));
  return {
    activeDurationMs: session.activeDurationMs,
    outcome,
    completed: outcome === "completed" || countType("goal.reached") > 0,
    counts: {
      inputTransitions: transitions.length,
      actions: transitions.filter((input) => input.pressed).length,
      collections: countType("coin.collected") + countType("object.collected"),
      respawns: countType("player.respawned"),
      resets: countType("preview.reset"),
      portals: countType("portal.entered"),
      mapChanges: countType("map.changed"),
      idleSpans: idleSpans.length,
    },
    mapStats,
    heatmaps: mapIds.map((mapId) => heatmapForSession(session, mapId)),
  };
}

export function finishPlaytestSession(draft, input = {}, options = {}) {
  assertDraft(draft);
  advanceClock(draft, options.monotonicNow ?? draft._lastMonotonicMs);
  draft._clockActive = false;
  closeIdleSpan(draft, draft.activeDurationMs);
  for (const action of [...draft._pressedActions].sort()) recordPlaytestInput(draft, { action, pressed: false, source: "lifecycle" }, draft._lastMonotonicMs);
  const outcome = input.outcome ?? (draft.events.some((event) => event.type === "goal.reached") ? "completed" : draft.limitReached ? "timeout" : "stopped");
  if (!OUTCOMES.has(outcome)) throw new Error("Playtest outcome must be completed, quit, stopped, timeout, or left-preview.");
  const endedAt = options.now ?? new Date().toISOString();
  if (!validDate(endedAt)) throw new Error("Playtest end time must be ISO-compatible.");
  if (Date.parse(endedAt) < Date.parse(draft.startedAt)) throw new Error("Playtest end time cannot precede its start time.");
  const session = {
    schemaVersion: LOOPLAB_PLAYTEST_SESSION_SCHEMA,
    id: draft.id,
    status: "completed",
    source: clone(draft.source),
    consent: clone(draft.consent),
    startedAt: draft.startedAt,
    endedAt,
    activeDurationMs: draft.activeDurationMs,
    outcome,
    inputTape: {
      semantics: "simulation-tick-action-transitions",
      replayFixture: false,
      tickRate: draft._tickRate,
      startTick: 0,
      startMode: draft._startMode,
      tickCount: draft._simulationTick,
      transitions: clone(draft.inputTransitions),
    },
    samples: clone(draft.samples),
    events: clone(draft.events),
    idleSpans: clone(draft.idleSpans),
    suspensions: clone(draft.suspensions),
    dropped: clone(draft.dropped),
    feedback: normalizedFeedback(input),
    summary: summarizeSession(draft, outcome),
    policy: clone(LOOPLAB_PLAYTEST_OBSERVATION_POLICY),
  };
  const digest = canonicalSha256(session);
  const completed = { ...session, digest };
  const validation = validatePlaytestSession(completed);
  if (!validation.valid) throw new Error(`Completed playtest session is invalid: ${validation.errors.join(" ")}`);
  return completed;
}

/** @param {any | null} draft */
export function playtestActiveSessionView(draft) {
  if (!draft) return null;
  assertDraft(draft);
  return {
    schemaVersion: LOOPLAB_PLAYTEST_SESSION_SCHEMA,
    id: draft.id,
    status: draft.status,
    source: clone(draft.source),
    consent: clone(draft.consent),
    startedAt: draft.startedAt,
    activeDurationMs: draft.activeDurationMs,
    inputTransitionCount: draft.inputTransitions.length,
    simulationTick: draft._simulationTick,
    tickRate: draft._tickRate,
    startMode: draft._startMode,
    sampleCount: draft.samples.length,
    eventCount: draft.events.length,
    currentMapId: draft._currentMapId,
    suspended: !draft._clockActive,
    limitReached: draft.limitReached,
    policy: clone(LOOPLAB_PLAYTEST_OBSERVATION_POLICY),
  };
}

function sessionAllowedKeys() {
  return new Set(["schemaVersion", "id", "status", "source", "consent", "startedAt", "endedAt", "activeDurationMs", "outcome", "inputTape", "samples", "events", "idleSpans", "suspensions", "dropped", "feedback", "summary", "policy", "digest"]);
}

function validateNondecreasingTimes(values, label, errors) {
  let previous = -1;
  for (const [index, value] of values.entries()) {
    if (!Number.isInteger(value?.atMs)) continue;
    if (value.atMs < previous) errors.push(`${label}[${index}].atMs must be nondecreasing.`);
    previous = Math.max(previous, value.atMs);
  }
}

function validateSessionSample(sample, index, source, activeDurationMs, errors) {
  const label = `session.samples[${index}]`;
  if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  unknownKeys(sample, new Set(["atMs", "mapId", "x", "y", "z", "cellX", "cellY"]), label, errors);
  try { strictTime(sample.atMs, `${label}.atMs`); } catch (error) { errors.push(error.message); }
  if (Number.isInteger(activeDurationMs) && sample.atMs > activeDurationMs) errors.push(`${label}.atMs cannot exceed the session duration.`);
  const mapId = cleanText(sample.mapId, 120);
  if (!mapId || mapId !== sample.mapId || !source?.mapBounds?.some((map) => map.mapId === mapId)) errors.push(`${label}.mapId must reference a source-bound map.`);
  for (const key of ["x", "y", "z"]) {
    if (!Number.isFinite(sample[key])) errors.push(`${label}.${key} must be finite.`);
    else if (rounded(sample[key]) !== sample[key]) errors.push(`${label}.${key} must use canonical three-decimal precision.`);
  }
  if (!Number.isInteger(sample.cellX) || sample.cellX < 0 || sample.cellX >= LOOPLAB_PLAYTEST_LIMITS.heatmapColumns) errors.push(`${label}.cellX is outside the heatmap grid.`);
  if (!Number.isInteger(sample.cellY) || sample.cellY < 0 || sample.cellY >= LOOPLAB_PLAYTEST_LIMITS.heatmapRows) errors.push(`${label}.cellY is outside the heatmap grid.`);
  const bound = source?.mapBounds?.find((map) => map.mapId === mapId);
  if (bound && Number.isFinite(sample.x) && Number.isFinite(sample.y) && Number.isInteger(sample.cellX) && Number.isInteger(sample.cellY)) {
    const expectedCellX = Math.floor(clamp(sample.x / bound.width, 0, 0.999999) * LOOPLAB_PLAYTEST_LIMITS.heatmapColumns);
    const expectedCellY = Math.floor(clamp(sample.y / bound.height, 0, 0.999999) * LOOPLAB_PLAYTEST_LIMITS.heatmapRows);
    if (sample.cellX !== expectedCellX || sample.cellY !== expectedCellY) errors.push(`${label} heatmap cell does not match its source-bound world coordinates.`);
  }
}

function validateSessionEvent(event, index, source, activeDurationMs, errors) {
  const label = `session.events[${index}]`;
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  unknownKeys(event, new Set(["atMs", "type", "position", ...EVENT_TEXT_FIELDS, ...EVENT_NUMBER_FIELDS]), label, errors);
  try { strictTime(event.atMs, `${label}.atMs`); } catch (error) { errors.push(error.message); }
  if (Number.isInteger(activeDurationMs) && event.atMs > activeDurationMs) errors.push(`${label}.atMs cannot exceed the session duration.`);
  if (!KNOWN_EVENTS.has(event.type)) errors.push(`${label}.type is not a canonical observable runtime event.`);
  if (event.mapId !== undefined && (!source?.mapBounds?.some((map) => map.mapId === event.mapId) || event.mapId !== cleanText(event.mapId, 120))) errors.push(`${label}.mapId must reference a source-bound map.`);
  for (const key of EVENT_TEXT_FIELDS) if (event[key] !== undefined && (typeof event[key] !== "string" || event[key] !== cleanText(event[key], key === "mapId" ? 120 : 160))) errors.push(`${label}.${key} must be a canonical bounded non-empty string.`);
  for (const key of EVENT_NUMBER_FIELDS) if (event[key] !== undefined && (!Number.isFinite(event[key]) || rounded(event[key]) !== event[key])) errors.push(`${label}.${key} must be finite with canonical three-decimal precision.`);
  if (event.position !== undefined) {
    if (!event.position || typeof event.position !== "object" || Array.isArray(event.position)) errors.push(`${label}.position must be an object.`);
    else {
      unknownKeys(event.position, new Set(["x", "y", "z"]), `${label}.position`, errors);
      for (const key of ["x", "y", "z"]) if (!Number.isFinite(event.position[key]) || rounded(event.position[key]) !== event.position[key]) errors.push(`${label}.position.${key} must be finite with canonical three-decimal precision.`);
    }
  }
}

function validateSessionSummary(summary, session, source, errors) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    errors.push("session.summary must be an object.");
    return;
  }
  unknownKeys(summary, new Set(["activeDurationMs", "outcome", "completed", "counts", "mapStats", "heatmaps"]), "session.summary", errors);
  if (summary.activeDurationMs !== session.activeDurationMs || summary.outcome !== session.outcome || typeof summary.completed !== "boolean") errors.push("session.summary must match the session duration and outcome.");
  const countKeys = ["inputTransitions", "actions", "collections", "respawns", "resets", "portals", "mapChanges", "idleSpans"];
  if (!summary.counts || typeof summary.counts !== "object" || Array.isArray(summary.counts)) errors.push("session.summary.counts must be an object.");
  else {
    unknownKeys(summary.counts, new Set(countKeys), "session.summary.counts", errors);
    for (const key of countKeys) if (!Number.isInteger(summary.counts[key]) || summary.counts[key] < 0) errors.push(`session.summary.counts.${key} must be a non-negative integer.`);
    if (summary.counts.inputTransitions !== session.inputTape?.transitions?.length) errors.push("session.summary input transition count is stale.");
    if (summary.counts.idleSpans !== session.idleSpans?.length) errors.push("session.summary idle-span count is stale.");
  }
  const mapIds = new Set(source?.mapBounds?.map((map) => map.mapId) ?? []);
  if (!Array.isArray(summary.mapStats) || summary.mapStats.length > mapIds.size) errors.push("session.summary.mapStats must be a bounded array of source maps.");
  else for (const [index, stat] of summary.mapStats.entries()) {
    const label = `session.summary.mapStats[${index}]`;
    if (!stat || typeof stat !== "object" || Array.isArray(stat)) { errors.push(`${label} must be an object.`); continue; }
    unknownKeys(stat, new Set(["mapId", "activeDurationMs", "visits", "sampleCount", "actionCount", "collections", "respawns", "resets", "portals"]), label, errors);
    if (!mapIds.has(stat.mapId)) errors.push(`${label}.mapId must reference a source-bound map.`);
    for (const key of ["activeDurationMs", "visits", "sampleCount", "actionCount", "collections", "respawns", "resets", "portals"]) if (!Number.isInteger(stat[key]) || stat[key] < 0) errors.push(`${label}.${key} must be a non-negative integer.`);
  }
  if (!Array.isArray(summary.heatmaps) || summary.heatmaps.length > mapIds.size) errors.push("session.summary.heatmaps must be a bounded array of source maps.");
  else for (const [index, heatmap] of summary.heatmaps.entries()) {
    const label = `session.summary.heatmaps[${index}]`;
    if (!heatmap || typeof heatmap !== "object" || Array.isArray(heatmap)) { errors.push(`${label} must be an object.`); continue; }
    unknownKeys(heatmap, new Set(["mapId", "columns", "rows", "cells"]), label, errors);
    if (!mapIds.has(heatmap.mapId) || heatmap.columns !== LOOPLAB_PLAYTEST_LIMITS.heatmapColumns || heatmap.rows !== LOOPLAB_PLAYTEST_LIMITS.heatmapRows || !Array.isArray(heatmap.cells)) errors.push(`${label} has an invalid map or grid.`);
    else for (const [cellIndex, cell] of heatmap.cells.entries()) {
      const cellLabel = `${label}.cells[${cellIndex}]`;
      if (!cell || typeof cell !== "object" || Array.isArray(cell)) { errors.push(`${cellLabel} must be an object.`); continue; }
      unknownKeys(cell, new Set(["x", "y", "samples", "respawns"]), cellLabel, errors);
      if (!Number.isInteger(cell.x) || cell.x < 0 || cell.x >= heatmap.columns || !Number.isInteger(cell.y) || cell.y < 0 || cell.y >= heatmap.rows) errors.push(`${cellLabel} is outside the heatmap grid.`);
      if (!Number.isInteger(cell.samples) || cell.samples < 0 || !Number.isInteger(cell.respawns) || cell.respawns < 0) errors.push(`${cellLabel} counts must be non-negative integers.`);
    }
  }
}

export function validatePlaytestSession(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, errors: ["Playtest session must be an object."] };
  unknownKeys(value, sessionAllowedKeys(), "session", errors);
  const legacySession = value.schemaVersion === LOOPLAB_PLAYTEST_SESSION_LEGACY_SCHEMA;
  const exactTickSession = value.schemaVersion === LOOPLAB_PLAYTEST_SESSION_SCHEMA;
  if (!legacySession && !exactTickSession) errors.push(`session.schemaVersion must be ${LOOPLAB_PLAYTEST_SESSION_LEGACY_SCHEMA} or ${LOOPLAB_PLAYTEST_SESSION_SCHEMA}.`);
  if (typeof value.id !== "string" || !ID_PATTERN.test(value.id)) errors.push("session.id must be a stable lowercase hyphenated ID.");
  if (value.status !== "completed") errors.push("session.status must be completed.");
  let source = null;
  try {
    source = normalizedSourceBinding(value.source);
    if (canonicalSha256(source) !== canonicalSha256(value.source)) errors.push("session.source must already be in exact canonical form.");
    if (!source.mapBounds.some((map) => map.mapId === source.startMapId)) errors.push("session.source.startMapId must reference a source-bound map.");
  } catch (error) { errors.push(error.message); }
  if (!value.consent || value.consent.granted !== true || value.consent.purpose !== LOOPLAB_PLAYTEST_PURPOSE || !validDate(value.consent.grantedAt)) errors.push("session.consent must record exact explicit purpose and grant time.");
  else unknownKeys(value.consent, new Set(["granted", "purpose", "grantedAt"]), "session.consent", errors);
  if (!validDate(value.startedAt) || !validDate(value.endedAt)) errors.push("session requires ISO-compatible startedAt and endedAt.");
  else if (Date.parse(value.endedAt) < Date.parse(value.startedAt)) errors.push("session.endedAt cannot precede session.startedAt.");
  try { strictTime(value.activeDurationMs, "session.activeDurationMs"); } catch (error) { errors.push(error.message); }
  if (!OUTCOMES.has(value.outcome)) errors.push("session.outcome is invalid.");
  const expectedSemantics = exactTickSession ? "simulation-tick-action-transitions" : "observational-action-transitions";
  if (!value.inputTape || value.inputTape.semantics !== expectedSemantics || value.inputTape.replayFixture !== false || !Array.isArray(value.inputTape.transitions) || value.inputTape.transitions.length > LOOPLAB_PLAYTEST_LIMITS.inputTransitions) errors.push(`session.inputTape must be a bounded ${expectedSemantics}, non-replay action tape.`);
  else {
    const tapeKeys = exactTickSession
      ? new Set(["semantics", "replayFixture", "tickRate", "startTick", "startMode", "tickCount", "transitions"])
      : new Set(["semantics", "replayFixture", "transitions"]);
    unknownKeys(value.inputTape, tapeKeys, "session.inputTape", errors);
    if (exactTickSession) {
      if (!Number.isInteger(value.inputTape.tickRate) || value.inputTape.tickRate < 20 || value.inputTape.tickRate > 240) errors.push("session.inputTape.tickRate must be an integer from 20 through 240.");
      if (value.inputTape.startTick !== 0) errors.push("session.inputTape.startTick must be zero for source-bound replay promotion.");
      if (!["authored-reset", "current-preview"].includes(value.inputTape.startMode)) errors.push("session.inputTape.startMode must be authored-reset or current-preview.");
      if (!Number.isInteger(value.inputTape.tickCount) || value.inputTape.tickCount < 0 || value.inputTape.tickCount > LOOPLAB_PLAYTEST_LIMITS.simulationTicks) errors.push(`session.inputTape.tickCount must be an integer from 0 through ${LOOPLAB_PLAYTEST_LIMITS.simulationTicks}.`);
    }
    for (const [index, transition] of value.inputTape.transitions.entries()) {
      unknownKeys(transition, exactTickSession ? new Set(["tick", "atMs", "action", "pressed", "source"]) : new Set(["atMs", "action", "pressed", "source"]), `session.inputTape.transitions[${index}]`, errors);
      try {
        strictTime(transition.atMs, `session.inputTape.transitions[${index}].atMs`);
        const action = strictText(transition.action, `session.inputTape.transitions[${index}].action`, 80);
        if (!SEMANTIC_ACTION_PATTERN.test(action) || action !== transition.action) errors.push(`session.inputTape.transitions[${index}].action must be a canonical semantic action ID, not a raw key.`);
      } catch (error) { errors.push(error.message); }
      if (exactTickSession && (!Number.isInteger(transition.tick) || transition.tick < 0 || !Number.isInteger(value.inputTape.tickCount) || transition.tick > value.inputTape.tickCount)) errors.push(`session.inputTape.transitions[${index}].tick must address an exact recorded simulation boundary.`);
      if (Number.isInteger(value.activeDurationMs) && transition.atMs > value.activeDurationMs) errors.push(`session.inputTape.transitions[${index}].atMs cannot exceed the session duration.`);
      if (typeof transition.pressed !== "boolean" || !INPUT_SOURCES.has(transition.source)) errors.push(`session.inputTape.transitions[${index}] has invalid pressed/source fields.`);
    }
    validateNondecreasingTimes(value.inputTape.transitions, "session.inputTape.transitions", errors);
    if (exactTickSession) {
      let previousTick = -1;
      for (const [index, transition] of value.inputTape.transitions.entries()) {
        if (!Number.isInteger(transition?.tick)) continue;
        if (transition.tick < previousTick) errors.push(`session.inputTape.transitions[${index}].tick must be nondecreasing.`);
        previousTick = Math.max(previousTick, transition.tick);
      }
    }
    const pressedActions = new Set();
    for (const [index, transition] of value.inputTape.transitions.entries()) {
      if (!SEMANTIC_ACTION_PATTERN.test(transition?.action ?? "") || typeof transition.pressed !== "boolean") continue;
      const alreadyPressed = pressedActions.has(transition.action);
      if (alreadyPressed === transition.pressed) errors.push(`session.inputTape.transitions[${index}] does not change semantic action state.`);
      if (transition.source === "lifecycle" && transition.pressed) errors.push(`session.inputTape.transitions[${index}] lifecycle input may only release an action.`);
      if (transition.pressed) pressedActions.add(transition.action);
      else pressedActions.delete(transition.action);
    }
    if (pressedActions.size > 0) errors.push("session.inputTape must release every pressed semantic action before completion.");
  }
  if (!Array.isArray(value.samples) || value.samples.length > LOOPLAB_PLAYTEST_LIMITS.samples) errors.push("session.samples must be a bounded array.");
  else {
    value.samples.forEach((sample, index) => validateSessionSample(sample, index, source, value.activeDurationMs, errors));
    validateNondecreasingTimes(value.samples, "session.samples", errors);
  }
  if (!Array.isArray(value.events) || value.events.length > LOOPLAB_PLAYTEST_LIMITS.events) errors.push("session.events must be a bounded array.");
  else {
    value.events.forEach((event, index) => validateSessionEvent(event, index, source, value.activeDurationMs, errors));
    validateNondecreasingTimes(value.events, "session.events", errors);
  }
  if (!Array.isArray(value.idleSpans) || value.idleSpans.length > LOOPLAB_PLAYTEST_LIMITS.idleSpans) errors.push("session.idleSpans must be a bounded array.");
  else for (const [index, span] of value.idleSpans.entries()) {
    const label = `session.idleSpans[${index}]`;
    if (!span || typeof span !== "object" || Array.isArray(span)) { errors.push(`${label} must be an object.`); continue; }
    unknownKeys(span, new Set(["startMs", "endMs", "durationMs", "mapId"]), label, errors);
    try { strictTime(span.startMs, `${label}.startMs`); strictTime(span.endMs, `${label}.endMs`); strictTime(span.durationMs, `${label}.durationMs`); } catch (error) { errors.push(error.message); }
    if (span.endMs < span.startMs || span.durationMs !== span.endMs - span.startMs || span.endMs > value.activeDurationMs) errors.push(`${label} has inconsistent timing.`);
    if (!source?.mapBounds?.some((map) => map.mapId === span.mapId)) errors.push(`${label}.mapId must reference a source-bound map.`);
  }
  if (!value.suspensions || typeof value.suspensions !== "object" || Array.isArray(value.suspensions)) errors.push("session.suspensions must be an object.");
  else {
    unknownKeys(value.suspensions, new Set(["count", "reasons"]), "session.suspensions", errors);
    if (!Number.isInteger(value.suspensions.count) || value.suspensions.count < 0 || !value.suspensions.reasons || typeof value.suspensions.reasons !== "object" || Array.isArray(value.suspensions.reasons)) errors.push("session.suspensions count/reasons are invalid.");
    else {
      for (const [reason, count] of Object.entries(value.suspensions.reasons)) if (!/^[a-z][a-z0-9-]{0,47}$/.test(reason) || !Number.isInteger(count) || count < 1) errors.push("session.suspensions contains an invalid reason/count.");
      const suspensionTotal = Object.values(value.suspensions.reasons).reduce((total, count) => total + (Number.isInteger(count) ? count : 0), 0);
      if (suspensionTotal !== value.suspensions.count) errors.push("session.suspensions.count must equal its reason counts.");
    }
  }
  if (!value.dropped || typeof value.dropped !== "object" || Array.isArray(value.dropped)) errors.push("session.dropped must be an object.");
  else {
    const droppedKeys = ["inputTransitions", "samples", "events", "clockGaps"];
    unknownKeys(value.dropped, new Set(droppedKeys), "session.dropped", errors);
    for (const key of droppedKeys) if (!Number.isInteger(value.dropped[key]) || value.dropped[key] < 0) errors.push(`session.dropped.${key} must be a non-negative integer.`);
    if (value.dropped.inputTransitions > 0 && value.inputTape?.transitions?.length !== LOOPLAB_PLAYTEST_LIMITS.inputTransitions) errors.push("session.dropped.inputTransitions requires a full transition buffer.");
    if (value.dropped.samples > 0 && value.samples?.length !== LOOPLAB_PLAYTEST_LIMITS.samples) errors.push("session.dropped.samples requires a full sample buffer.");
    if (value.dropped.events > 0 && value.events?.length !== LOOPLAB_PLAYTEST_LIMITS.events) errors.push("session.dropped.events requires a full event buffer.");
  }
  try {
    const feedback = normalizedFeedback(value.feedback);
    if (canonicalSha256(feedback) !== canonicalSha256(value.feedback)) errors.push("session.feedback must already be in exact canonical form.");
  } catch (error) { errors.push(error.message); }
  if (!value.feedback || !["unrated", "user-explicit"].includes(value.feedback.source)) errors.push("session.feedback source must be unrated or user-explicit.");
  else {
    unknownKeys(value.feedback, new Set(["source", "rating", "tags", "note"]), "session.feedback", errors);
    const shouldBeExplicit = value.feedback.rating !== "unrated" || value.feedback.tags?.length > 0 || Boolean(value.feedback.note);
    if ((shouldBeExplicit ? "user-explicit" : "unrated") !== value.feedback.source) errors.push("session.feedback source does not match deliberate feedback content.");
  }
  if (canonicalSha256(value.policy) !== canonicalSha256(LOOPLAB_PLAYTEST_OBSERVATION_POLICY)) errors.push("session.policy does not match LoopLab's observation boundary.");
  validateSessionSummary(value.summary, value, source, errors);
  if (source && Array.isArray(value.inputTape?.transitions) && Array.isArray(value.samples) && Array.isArray(value.events) && Array.isArray(value.idleSpans) && Number.isInteger(value.activeDurationMs) && OUTCOMES.has(value.outcome)) {
    const expectedSummary = summarizeSession({ ...value, source }, value.outcome);
    if (canonicalSha256(expectedSummary) !== canonicalSha256(value.summary)) errors.push("session.summary must equal the canonical summary derived from its primary observation data.");
  }
  const digestSubject = clone(value);
  delete digestSubject.digest;
  if (!SHA256_PATTERN.test(String(value.digest ?? "")) || canonicalSha256(digestSubject) !== value.digest) errors.push("session.digest does not match canonical session content.");
  return { valid: errors.length === 0, errors };
}
export function parsePlaytestSession(value) {
  const validation = validatePlaytestSession(value);
  if (!validation.valid) throw new Error(`Playtest session is invalid: ${validation.errors.join(" ")}`);
  return clone(value);
}

export function validatePlaytestLedger(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, errors: ["Playtest ledger must be an object."] };
  unknownKeys(value, new Set(["schemaVersion", "revision", "updatedAt", "sessions"]), "ledger", errors);
  if (value.schemaVersion !== LOOPLAB_PLAYTEST_LEDGER_SCHEMA) errors.push(`ledger.schemaVersion must be ${LOOPLAB_PLAYTEST_LEDGER_SCHEMA}.`);
  if (!Number.isInteger(value.revision) || value.revision < 0) errors.push("ledger.revision must be a non-negative integer.");
  if (value.updatedAt !== null && !validDate(value.updatedAt)) errors.push("ledger.updatedAt must be null or ISO-compatible.");
  if (!Array.isArray(value.sessions) || value.sessions.length > LOOPLAB_PLAYTEST_LIMITS.sessions) errors.push(`ledger.sessions cannot exceed ${LOOPLAB_PLAYTEST_LIMITS.sessions} sessions.`);
  const ids = new Set();
  for (const session of Array.isArray(value.sessions) ? value.sessions : []) {
    const validation = validatePlaytestSession(session);
    errors.push(...validation.errors.map((error) => `ledger.${error}`));
    if (ids.has(session?.id)) errors.push(`ledger.sessions duplicates ${session.id}.`);
    ids.add(session?.id);
  }
  return { valid: errors.length === 0, errors };
}

export function parsePlaytestLedger(value) {
  const validation = validatePlaytestLedger(value);
  if (!validation.valid) throw new Error(`Playtest ledger is invalid: ${validation.errors.join(" ")}`);
  return clone(value);
}

function mutateLedger(ledger, sessions, now) {
  const current = parsePlaytestLedger(ledger);
  if (!validDate(now)) throw new Error("Playtest ledger update time must be ISO-compatible.");
  return parsePlaytestLedger({
    schemaVersion: LOOPLAB_PLAYTEST_LEDGER_SCHEMA,
    revision: current.revision + 1,
    updatedAt: now,
    sessions: sessions.slice(-LOOPLAB_PLAYTEST_LIMITS.sessions),
  });
}

export function addPlaytestSession(ledger, session, options = {}) {
  const current = parsePlaytestLedger(ledger);
  const next = parsePlaytestSession(session);
  if (current.sessions.some((candidate) => candidate.id === next.id)) throw new Error(`Playtest session already exists: ${next.id}`);
  return mutateLedger(current, [...current.sessions, next], options.now ?? new Date().toISOString());
}

export function updatePlaytestFeedback(ledger, id, feedback, options = {}) {
  const current = parsePlaytestLedger(ledger);
  const session = current.sessions.find((candidate) => candidate.id === id);
  if (!session) throw new Error(`Playtest session was not found: ${id}`);
  const next = { ...session, feedback: normalizedFeedback(feedback) };
  delete next.digest;
  next.digest = canonicalSha256(next);
  return mutateLedger(current, current.sessions.map((candidate) => candidate.id === id ? parsePlaytestSession(next) : candidate), options.now ?? new Date().toISOString());
}

export function removePlaytestSession(ledger, id, options = {}) {
  const current = parsePlaytestLedger(ledger);
  if (!current.sessions.some((session) => session.id === id)) throw new Error(`Playtest session was not found: ${id}`);
  return mutateLedger(current, current.sessions.filter((session) => session.id !== id), options.now ?? new Date().toISOString());
}

export function clearPlaytestSessions(ledger, options = {}) {
  const current = parsePlaytestLedger(ledger);
  return mutateLedger(current, [], options.now ?? new Date().toISOString());
}

function compactSession(session, currentSourceDigest) {
  return {
    id: session.id,
    source: clone(session.source),
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    activeDurationMs: session.activeDurationMs,
    outcome: session.outcome,
    feedback: clone(session.feedback),
    summary: clone(session.summary),
    digest: session.digest,
    currentSource: currentSourceDigest ? session.source.sourceDigest === currentSourceDigest : null,
  };
}

/**
 * @param {any} ledger
 * @param {any | null} [activeDraft]
 * @param {{ currentSourceDigest?: string | null }} [options]
 */
export function playtestLedgerView(ledger, activeDraft = null, options = {}) {
  const current = parsePlaytestLedger(ledger);
  return {
    schemaVersion: current.schemaVersion,
    revision: current.revision,
    updatedAt: current.updatedAt,
    sessionCount: current.sessions.length,
    digest: canonicalSha256(current),
    activeSession: activeDraft ? playtestActiveSessionView(activeDraft) : null,
    sessions: [...current.sessions].reverse().map((session) => compactSession(session, options.currentSourceDigest)),
    policy: clone(LOOPLAB_PLAYTEST_OBSERVATION_POLICY),
    limits: clone(LOOPLAB_PLAYTEST_LIMITS),
  };
}

export function getPlaytestSession(ledger, id) {
  const current = parsePlaytestLedger(ledger);
  const session = current.sessions.find((candidate) => candidate.id === id);
  if (!session) throw new Error(`Playtest session was not found: ${id}`);
  return clone(session);
}
