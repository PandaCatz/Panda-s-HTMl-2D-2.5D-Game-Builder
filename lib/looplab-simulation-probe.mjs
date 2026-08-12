import { canonicalSha256 } from "./looplab-canonical-digest.mjs";
import {
  captureReplayState,
  LOOPLAB_MIN_TICK_RATE,
  LOOPLAB_REPLAY_HASH_VERSION,
  replayStateDigest,
  resolveReplayActionCode,
} from "./looplab-replay.mjs";
import { createRuntimeModel } from "./looplab-runtime-instance.mjs";

export const LOOPLAB_SIMULATION_PROBE_SCHEMA = "looplab-simulation-probe/v1";
export const LOOPLAB_SIMULATION_LIMITS = Object.freeze({
  maximumTicks: 36_000,
  maximumInputs: 4_096,
  maximumEvents: 1_024,
  maximumPositionSamples: 256,
  minimumTickRate: LOOPLAB_MIN_TICK_RATE,
  maximumTickRate: 240,
});

const EMIT_VALUES = Object.freeze(["state", "events", "positions"]);
const EMIT_SET = new Set(EMIT_VALUES);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function boundedInteger(value, label, minimum, maximum, fallback) {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return resolved;
}

function normalizeEmit(value) {
  const requested = value === undefined ? ["state"] : value;
  if (!Array.isArray(requested) || requested.length < 1 || requested.length > EMIT_VALUES.length) {
    throw new Error(`emit must contain 1 through ${EMIT_VALUES.length} values.`);
  }
  const normalized = [];
  for (const entry of requested) {
    const name = String(entry ?? "").trim();
    if (!EMIT_SET.has(name)) throw new Error(`emit contains unsupported value ${name || "(empty)"}.`);
    if (normalized.includes(name)) throw new Error(`emit contains duplicate value ${name}.`);
    normalized.push(name);
  }
  return normalized;
}

function normalizeInputs(project, value, tickCount) {
  const source = value === undefined ? [] : value;
  if (!Array.isArray(source) || source.length > LOOPLAB_SIMULATION_LIMITS.maximumInputs) {
    throw new Error(`inputs must be an array with at most ${LOOPLAB_SIMULATION_LIMITS.maximumInputs} transitions.`);
  }
  const normalized = [];
  const seen = new Set();
  for (const [index, input] of source.entries()) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`inputs[${index}] must be an object.`);
    const keys = Object.keys(input);
    const unknown = keys.filter((key) => !["tick", "pressed", "action", "actionId", "code"].includes(key));
    if (unknown.length) throw new Error(`inputs[${index}] contains unknown fields: ${unknown.join(", ")}.`);
    if (!Number.isInteger(input.tick) || input.tick < 0 || input.tick >= tickCount) {
      throw new Error(`inputs[${index}].tick must address a zero-based simulation tick before tickCount.`);
    }
    if (typeof input.pressed !== "boolean") throw new Error(`inputs[${index}].pressed must be boolean.`);
    const requestedFields = ["action", "actionId", "code"].filter((field) => typeof input[field] === "string" && input[field].trim());
    if (requestedFields.length !== 1) throw new Error(`inputs[${index}] requires exactly one non-empty action, actionId, or code.`);
    const requested = String(input[requestedFields[0]]).trim();
    if (requested.length > 120) throw new Error(`inputs[${index}] action identifier must contain at most 120 characters.`);
    const code = resolveReplayActionCode(project, input);
    if (!code) throw new Error(`inputs[${index}] could not resolve an input code.`);
    const duplicateKey = `${input.tick}\u0000${code}`;
    if (seen.has(duplicateKey)) throw new Error(`inputs[${index}] duplicates another transition for ${requested} at tick ${input.tick}.`);
    seen.add(duplicateKey);
    normalized.push({ tick: input.tick, action: requested, pressed: input.pressed, code });
  }
  return normalized;
}

function inputTapeForFixture(inputs) {
  return inputs.map(({ tick, action, pressed }) => ({ tick, action, pressed }));
}

function positionSample(runtime, tick) {
  const state = runtime.getState();
  return {
    tick,
    mapId: state.activeMapId,
    player: state.player ? {
      id: state.player.id,
      x: Number(state.player.x),
      y: Number(state.player.y),
      z: Number(state.player.z || 0),
      vx: Number(state.player.vx || 0),
      vy: Number(state.player.vy || 0),
      grounded: Boolean(state.player.grounded),
    } : null,
    activeTraversalPathId: state.activeTraversalPathId ?? null,
    won: Boolean(state.won),
  };
}

function fixtureIdFor(inputDigest) {
  return `simulation-${String(inputDigest).replace(/^sha256:/, "").slice(0, 16)}`;
}

export function runSimulationProbe(project, options = {}) {
  const tickCount = boundedInteger(options.tickCount, "tickCount", 1, LOOPLAB_SIMULATION_LIMITS.maximumTicks);
  const tickRate = boundedInteger(
    options.tickRate,
    "tickRate",
    LOOPLAB_SIMULATION_LIMITS.minimumTickRate,
    LOOPLAB_SIMULATION_LIMITS.maximumTickRate,
    60,
  );
  const emit = normalizeEmit(options.emit);
  const inputs = normalizeInputs(project, options.inputs, tickCount);
  const runtime = createRuntimeModel(clone(project));
  if (options.startMapId !== undefined) {
    const startMapId = String(options.startMapId ?? "").trim();
    if (!startMapId) throw new Error("startMapId must be a non-empty string when provided.");
    const startSpawnId = options.startSpawnId === undefined ? null : String(options.startSpawnId ?? "").trim();
    if (options.startSpawnId !== undefined && !startSpawnId) throw new Error("startSpawnId must be a non-empty string when provided.");
    if (!runtime.loadMap(startMapId, startSpawnId)) throw new Error(`Simulation start map or spawn could not load: ${startMapId}.`);
  } else if (options.startSpawnId !== undefined) {
    throw new Error("startSpawnId requires startMapId.");
  }
  runtime.drainEvents();

  const initialState = runtime.getState();
  const fixtureInputs = inputTapeForFixture(inputs);
  const inputDigest = canonicalSha256({
    tickRate,
    tickCount,
    startMapId: initialState.activeMapId,
    startSpawnId: options.startSpawnId ?? null,
    inputs: fixtureInputs,
  });
  const byTick = new Map();
  for (const input of inputs) {
    const transitions = byTick.get(input.tick) ?? [];
    transitions.push(input);
    byTick.set(input.tick, transitions);
  }

  const includeEvents = emit.includes("events");
  const includePositions = emit.includes("positions");
  const maximumPositionSamples = boundedInteger(
    options.maximumPositionSamples,
    "maximumPositionSamples",
    2,
    LOOPLAB_SIMULATION_LIMITS.maximumPositionSamples,
    LOOPLAB_SIMULATION_LIMITS.maximumPositionSamples,
  );
  const requestedSampleEvery = boundedInteger(options.sampleEvery, "sampleEvery", 1, tickCount, 1);
  const minimumBoundedStride = Math.max(1, Math.ceil(tickCount / Math.max(1, maximumPositionSamples - 1)));
  const effectiveSampleEvery = Math.max(requestedSampleEvery, minimumBoundedStride);
  const events = [];
  const eventCounts = {};
  let omittedEventCount = 0;
  const positions = includePositions ? [positionSample(runtime, 0)] : [];

  for (let tickIndex = 0; tickIndex < tickCount; tickIndex += 1) {
    for (const input of byTick.get(tickIndex) ?? []) runtime.setInput(input.code, input.pressed);
    const emitted = runtime.update(1 / tickRate);
    const tick = tickIndex + 1;
    for (const event of emitted) {
      const type = String(event?.type ?? "unknown");
      eventCounts[type] = (eventCounts[type] ?? 0) + 1;
      if (includeEvents && events.length < LOOPLAB_SIMULATION_LIMITS.maximumEvents) events.push({ tick, ...clone(event) });
      else if (includeEvents) omittedEventCount += 1;
    }
    if (includePositions && (tick % effectiveSampleEvery === 0 || tick === tickCount)) {
      if (positions.at(-1)?.tick !== tick) positions.push(positionSample(runtime, tick));
    }
  }

  const finalState = runtime.getState();
  const finalHash = replayStateDigest(captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_HASH_VERSION }), {
    hashVersion: LOOPLAB_REPLAY_HASH_VERSION,
  });
  const includeFixtureCandidate = options.includeFixtureCandidate === true;
  const fixtureCandidate = includeFixtureCandidate ? {
    id: fixtureIdFor(inputDigest),
    revision: 1,
    changeReason: "Promoted from a bounded LoopLab simulation probe.",
    hashVersion: LOOPLAB_REPLAY_HASH_VERSION,
    tickRate,
    tickCount,
    seed: Number(project.replay?.seed ?? 1),
    startMapId: initialState.activeMapId,
    ...(options.startSpawnId ? { startSpawnId: String(options.startSpawnId) } : {}),
    inputs: fixtureInputs,
    checkpoints: [{ tick: tickCount, hash: finalHash }],
    expectedHash: finalHash,
  } : null;

  return {
    schemaVersion: LOOPLAB_SIMULATION_PROBE_SCHEMA,
    sourceDigest: options.sourceDigest ?? null,
    inputDigest,
    readOnly: true,
    proofBoundary: "Deterministic model probe only. This is not browser, visual, acceptance, replay-fixture, or release evidence until explicitly promoted and rerun through those gates.",
    configuration: {
      tickRate,
      tickCount,
      startMapId: initialState.activeMapId,
      startSpawnId: options.startSpawnId ?? null,
      emit,
      transitionCount: inputs.length,
    },
    finalHash,
    eventCounts,
    outputBounds: {
      maximumEvents: LOOPLAB_SIMULATION_LIMITS.maximumEvents,
      returnedEvents: includeEvents ? events.length : 0,
      omittedEventCount: includeEvents ? omittedEventCount : 0,
      requestedSampleEvery: includePositions ? requestedSampleEvery : null,
      effectiveSampleEvery: includePositions ? effectiveSampleEvery : null,
      maximumPositionSamples: includePositions ? maximumPositionSamples : null,
      returnedPositionSamples: includePositions ? positions.length : 0,
    },
    ...(emit.includes("state") ? { state: clone(finalState) } : {}),
    ...(includeEvents ? { events } : {}),
    ...(includePositions ? { positions } : {}),
    fixtureCandidateAvailable: true,
    fixtureCandidateDigest: canonicalSha256({
      tickRate,
      tickCount,
      startMapId: initialState.activeMapId,
      startSpawnId: options.startSpawnId ?? null,
      inputs: fixtureInputs,
      finalHash,
    }),
    fixtureCandidate,
  };
}
