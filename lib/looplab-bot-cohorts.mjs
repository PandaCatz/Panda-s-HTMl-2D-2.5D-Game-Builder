import { canonicalSha256, sha256Hex } from "./looplab-canonical-digest.mjs";
import { runCompletionHarness } from "./looplab-completion-harness.mjs";
import { analyzeInputActionLiveness } from "./looplab-input-liveness.mjs";
import { captureReplayState, LOOPLAB_REPLAY_HASH_VERSION, replayStateDigest } from "./looplab-replay.mjs";
import { createRuntimeModel } from "./looplab-runtime-instance.mjs";

export const LOOPLAB_BOT_COHORT_REPORT_SCHEMA = "looplab-bot-cohort-report/v1";
export const LOOPLAB_BOT_COHORT_RUNNER_VERSION = 1;
export const LOOPLAB_BOT_COHORT_LIMITS = Object.freeze({
  tickRate: 60,
  minimumTicksPerRun: 60,
  maximumTicksPerRun: 3_600,
  minimumRuns: 4,
  maximumRuns: 32,
  maximumMaps: 6,
  maximumSeeds: 8,
  maximumActions: 12,
  maximumTotalTicks: 48_000,
});

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const stableText = (value) => typeof value === "string" && value.trim().length > 0;
const finiteInteger = (value, fallback, minimum, maximum) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
};
const sorted = (values) => [...new Set(values)].sort();
const ratio = (observed, authored) => authored > 0 ? Number((observed / authored).toFixed(3)) : null;
const mapKey = (mapId, id) => `${String(mapId ?? "main")}:${String(id ?? "unknown")}`;

function authoredMaps(project) {
  if (Array.isArray(project?.maps) && project.maps.length > 0) return project.maps;
  return [{
    id: project?.activeMapId ?? project?.startMapId ?? "main",
    name: project?.name ?? "Main",
    width: project?.width,
    height: project?.height,
    objects: project?.objects ?? [],
    traversalPaths: project?.traversalPaths ?? [],
  }];
}

function normalizedSeed(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number >>> 0 : null;
}

function seedFromText(value) {
  return Number.parseInt(sha256Hex(String(value)).slice(0, 8), 16) >>> 0;
}

function createPrng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function normalizeConfig(project, options = {}) {
  if (options.tickRate !== undefined && Number(options.tickRate) !== LOOPLAB_BOT_COHORT_LIMITS.tickRate) throw new Error("Bot cohorts require the canonical fixed 60 Hz tick rate.");
  const sourceIdentity = stableText(options.sourceDigest) ? options.sourceDigest.trim() : canonicalSha256(project);
  const baseSeed = seedFromText(sourceIdentity);
  const requestedSeeds = Array.isArray(options.seeds)
    ? options.seeds.map(normalizedSeed).filter((seed) => seed !== null)
    : [];
  const seeds = [...new Set((requestedSeeds.length ? requestedSeeds : [baseSeed, baseSeed ^ 0x9e3779b9, baseSeed ^ 0x85ebca6b])
    .slice(0, LOOPLAB_BOT_COHORT_LIMITS.maximumSeeds))].sort((first, second) => first - second);
  const ticksPerRun = finiteInteger(options.ticksPerRun, 720, LOOPLAB_BOT_COHORT_LIMITS.minimumTicksPerRun, LOOPLAB_BOT_COHORT_LIMITS.maximumTicksPerRun);
  const maxRuns = finiteInteger(options.maxRuns, 24, LOOPLAB_BOT_COHORT_LIMITS.minimumRuns, LOOPLAB_BOT_COHORT_LIMITS.maximumRuns);
  return {
    tickRate: LOOPLAB_BOT_COHORT_LIMITS.tickRate,
    ticksPerRun,
    idleTicks: finiteInteger(options.idleTicks, Math.min(180, ticksPerRun), 30, ticksPerRun),
    actionHoldTicks: finiteInteger(options.actionHoldTicks, 90, 1, Math.min(600, ticksPerRun)),
    decisionTicks: finiteInteger(options.decisionTicks, 30, 5, Math.min(300, ticksPerRun)),
    spatialCellSize: finiteInteger(options.spatialCellSize, 64, 8, 256),
    maxRuns,
    seeds,
    includeCompletionWitness: options.includeCompletionWitness !== false,
  };
}

function authoredInventory(project, maps) {
  const objectEntries = maps.flatMap((map) => (map?.objects ?? []).map((object) => ({ mapId: map.id, object })));
  const byKind = (kind) => objectEntries.filter((entry) => entry.object?.kind === kind).map((entry) => mapKey(entry.mapId, entry.object?.id));
  const rules = (project?.gameplayProgram?.rules ?? []).filter((rule) => rule?.enabled !== false).map((rule) => String(rule?.id ?? "")).filter(Boolean);
  const choices = (project?.gameplayProgram?.choicePages ?? []).flatMap((page) => (page?.choices ?? []).map((choice) => `${page?.id ?? "page"}:${choice?.id ?? "choice"}`));
  const paths = maps.flatMap((map) => (map?.traversalPaths ?? []).filter((path) => path?.enabled !== false).map((path) => mapKey(map.id, path?.id)));
  const actors = project?.actorProgram?.enabled === false ? [] : (project?.actorProgram?.actors ?? []).map((actor) => mapKey(actor?.mapId, actor?.id));
  const emitters = project?.combatProgram?.enabled === false ? [] : (project?.combatProgram?.emitters ?? []).map((emitter) => mapKey(emitter?.mapId, emitter?.id));
  const verbs = (project?.verbArchitecture?.verbs ?? []).filter((verb) => !["cut", "dormant"].includes(verb?.status)).map((verb) => ({
    id: String(verb?.id ?? ""),
    inputActionIds: sorted(Array.isArray(verb?.inputActionIds) ? verb.inputActionIds.filter(stableText).map((id) => id.trim()) : []),
  })).filter((verb) => verb.id);
  const combinations = (project?.verbArchitecture?.combinations ?? []).map((combination) => ({
    id: String(combination?.id ?? ""),
    verbIds: sorted(Array.isArray(combination?.verbIds) ? combination.verbIds.filter(stableText).map((id) => id.trim()) : []),
  })).filter((combination) => combination.id && combination.verbIds.length > 1);
  return {
    mapIds: maps.map((map) => String(map?.id ?? "main")),
    rules: sorted(rules),
    choices: sorted(choices),
    traversalPaths: sorted(paths),
    portals: sorted(byKind("portal")),
    goals: sorted(byKind("goal")),
    collectibles: sorted([...byKind("coin"), ...byKind("collectible")]),
    hazards: sorted(byKind("hazard")),
    actors: sorted(actors),
    emitters: sorted(emitters),
    verbs,
    combinations,
  };
}

function actionCatalog(project, liveness) {
  const live = liveness.actions.filter((action) => action.classification === "live").map((action) => ({
    actionId: action.actionId,
    resolvedCode: action.semanticResolution?.resolvedCode ?? action.actionId,
    source: "authored-live-action",
  }));
  if (live.length > 0) return live.slice(0, LOOPLAB_BOT_COHORT_LIMITS.maximumActions);
  const modes = new Set(authoredMaps(project).map((map) => map?.controlMode ?? project?.controlMode ?? "platformer"));
  const fallback = modes.has("topdown")
    ? ["move-left", "move-right", "move-up", "move-down", "interact"]
    : ["move-left", "move-right", "jump", "interact"];
  return fallback.map((actionId) => ({ actionId, resolvedCode: actionId, source: "canonical-runtime-fallback" }));
}

function continuousAction(action) {
  return new Set(["move-left", "left", "ArrowLeft", "KeyA", "move-right", "right", "ArrowRight", "KeyD", "move-up", "up", "ArrowUp", "KeyW", "move-down", "down", "ArrowDown", "KeyS"]).has(action?.resolvedCode);
}

function selectedMaps(maps, options, startMapId) {
  const byId = new Map(maps.map((map) => [String(map?.id ?? "main"), map]));
  const requested = Array.isArray(options.mapIds) ? options.mapIds.filter(stableText).map((id) => id.trim()) : [];
  for (const id of requested) if (!byId.has(id)) throw new Error(`Bot cohort map ${id} does not exist.`);
  const ids = requested.length ? requested : maps.map((map) => String(map?.id ?? "main"));
  return [startMapId, ...sorted(ids.filter((id) => id !== startMapId))].slice(0, LOOPLAB_BOT_COHORT_LIMITS.maximumMaps);
}

function completionWitness(project, sourceDigest, config) {
  if (!config.includeCompletionWitness) return { report: null, tape: null };
  const report = runCompletionHarness(project, {
    sourceDigest,
    tickRate: config.tickRate,
    maxNodes: 256,
    maxDepth: 8,
    maxTransitions: 1_024,
    continuousHoldTicks: [30, 90],
    discreteHoldTicks: [1],
    settleTicks: 2,
    cache: false,
  });
  const tape = report?.passed && report?.reproTape && Number(report.reproTape.tickCount) <= LOOPLAB_BOT_COHORT_LIMITS.maximumTicksPerRun
    ? clone(report.reproTape)
    : null;
  return { report, tape };
}

function cohortPolicies(project, maps, mapIds, actions, config, sourceDigest) {
  const startMapId = String(project?.startMapId ?? project?.activeMapId ?? maps[0]?.id ?? "main");
  const policies = [
    { id: "idle-start", kind: "idle", label: "Start-state idle observation", mapId: startMapId, tickCount: config.idleTicks, routeEvidence: true },
    { id: "action-sweep-start", kind: "action-sweep", label: "Start-map semantic action sweep", mapId: startMapId, tickCount: config.ticksPerRun, routeEvidence: true },
    ...config.seeds.map((seed, index) => ({ id: `explorer-${index + 1}-${seed}`, kind: "explorer", label: `Deterministic explorer ${index + 1}`, mapId: startMapId, tickCount: config.ticksPerRun, seed, routeEvidence: true })),
  ];
  const witness = completionWitness(project, sourceDigest, config);
  if (witness.tape) {
    const witnessStartMapId = witness.tape.startMapId ?? startMapId;
    policies.push({ id: "completion-witness", kind: "witness", label: "Known completion witness", mapId: witnessStartMapId, tickCount: witness.tape.tickCount, tape: witness.tape, routeEvidence: witnessStartMapId === startMapId });
  }
  for (const mapId of mapIds.filter((id) => id !== startMapId)) {
    policies.push({ id: `idle-${mapId}`, kind: "idle", label: `Isolated idle probe: ${mapId}`, mapId, tickCount: config.idleTicks, routeEvidence: false });
    policies.push({ id: `action-sweep-${mapId}`, kind: "action-sweep", label: `Isolated action sweep: ${mapId}`, mapId, tickCount: config.ticksPerRun, routeEvidence: false });
  }
  for (const action of actions.slice(0, 8)) {
    policies.push({ id: `single-${action.actionId}`, kind: "single-action", label: `Single-action pressure: ${action.actionId}`, mapId: startMapId, tickCount: config.ticksPerRun, action, routeEvidence: true });
  }
  return { policies: policies.slice(0, config.maxRuns), completion: witness.report };
}

function desiredActionController(policy, actions, config) {
  if (policy.kind === "idle") return () => [];
  if (policy.kind === "single-action") {
    return (tick) => continuousAction(policy.action) || tick % Math.max(15, config.decisionTicks) === 0 ? [policy.action.actionId] : [];
  }
  if (policy.kind === "action-sweep") {
    const phases = [];
    let cursor = 0;
    for (const action of actions) {
      const duration = continuousAction(action) ? config.actionHoldTicks : 1;
      phases.push({ start: cursor, end: cursor + duration, actionId: action.actionId });
      cursor += duration + Math.min(12, config.decisionTicks);
    }
    return (tick) => {
      if (!phases.length) return [];
      const localTick = tick % Math.max(1, cursor);
      const phase = phases.find((candidate) => localTick >= candidate.start && localTick < candidate.end);
      return phase ? [phase.actionId] : [];
    };
  }
  const random = createPrng(policy.seed ?? 1);
  let segmentEnd = 0;
  let baseAction = null;
  let pulseAction = null;
  let pulseEnd = 0;
  return (tick, runtime) => {
    const choice = runtime.getChoiceState?.();
    const enabledChoices = (choice?.choices ?? []).filter((candidate) => candidate?.enabled !== false && stableText(candidate?.actionId));
    if (enabledChoices.length > 0 && tick >= pulseEnd) {
      pulseAction = enabledChoices[Math.floor(random() * enabledChoices.length)].actionId;
      pulseEnd = tick + 1;
      return [pulseAction];
    }
    if (tick >= segmentEnd) {
      baseAction = actions.length ? actions[Math.floor(random() * actions.length)] : null;
      const discrete = actions.filter((action) => !continuousAction(action) && action.actionId !== baseAction?.actionId);
      pulseAction = baseAction && continuousAction(baseAction) && discrete.length > 0 && random() < 0.45
        ? discrete[Math.floor(random() * discrete.length)].actionId
        : null;
      pulseEnd = pulseAction ? tick + 1 : tick;
      segmentEnd = tick + config.decisionTicks;
    }
    const desired = baseAction && (continuousAction(baseAction) || tick < segmentEnd && tick % Math.max(15, config.decisionTicks) === 0) ? [baseAction.actionId] : [];
    if (pulseAction && tick < pulseEnd) desired.push(pulseAction);
    return sorted(desired);
  };
}

function emptyObserved() {
  return {
    actions: new Set(), maps: new Set(), routeMaps: new Set(), contacts: new Set(), rules: new Set(), choices: new Set(), paths: new Set(), portals: new Set(), goals: new Set(), collectibles: new Set(), actors: new Set(), emitters: new Set(), hazardContacts: new Set(), spatialCells: new Set(),
  };
}

function observeEvent(event, observed, eventCounts) {
  const type = String(event?.type ?? "unknown");
  eventCounts[type] = (eventCounts[type] ?? 0) + 1;
  if (type === "input.action" && stableText(event.actionId)) observed.actions.add(event.actionId);
  if (type === "gameplay.rule-fired" && stableText(event.ruleId)) observed.rules.add(event.ruleId);
  if (type === "choice.selected") observed.choices.add(`${event.pageId ?? "page"}:${event.choiceId ?? "choice"}`);
  if (type.startsWith("traversal.") && stableText(event.pathId)) observed.paths.add(mapKey(event.mapId, event.pathId));
  if (type === "portal.entered") observed.portals.add(mapKey(event.sourceMapId, event.objectId));
  if (type === "goal.reached") observed.goals.add(mapKey(event.mapId, event.objectId ?? event.ruleId));
  if (["coin.collected", "object.collected"].includes(type)) observed.collectibles.add(mapKey(event.mapId, event.objectId));
  if (type.startsWith("actor.") && stableText(event.actorId)) observed.actors.add(mapKey(event.mapId, event.actorId));
  if (type.startsWith("projectile.") && stableText(event.emitterId)) observed.emitters.add(mapKey(event.mapId, event.emitterId));
}

function runCohort(project, policy, actions, config, inventory) {
  const runtime = createRuntimeModel(clone(project));
  if (!runtime.loadMap(policy.mapId, policy.tape?.startSpawnId ?? null)) throw new Error(`Bot cohort could not load map ${policy.mapId}.`);
  runtime.drainEvents();
  const observed = emptyObserved();
  const eventCounts = {};
  const ticksByMap = {};
  const inputOperations = [];
  const activeInputs = new Set();
  const desiredActions = desiredActionController(policy, actions, config);
  const witnessInputs = new Map();
  for (const input of policy.tape?.inputs ?? []) {
    const tick = Number(input.tick);
    const list = witnessInputs.get(tick) ?? [];
    list.push({ actionId: String(input.actionId ?? input.action ?? input.code ?? ""), pressed: input.pressed !== false });
    witnessInputs.set(tick, list);
  }
  let longestStationaryActiveTicks = 0;
  let stationaryActiveTicks = 0;
  let priorPlayer = runtime.getState().player;
  let completionTick = null;
  let executedTicks = 0;

  const applyInput = (actionId, pressed, tick) => {
    if (!actionId) return;
    runtime.setInput(actionId, pressed);
    if (pressed) activeInputs.add(actionId);
    else activeInputs.delete(actionId);
    inputOperations.push({ tick, actionId, pressed });
  };

  for (let tick = 0; tick < policy.tickCount && executedTicks < LOOPLAB_BOT_COHORT_LIMITS.maximumTotalTicks; tick += 1) {
    if (policy.kind === "witness") {
      for (const input of witnessInputs.get(tick) ?? []) applyInput(input.actionId, input.pressed, tick);
    } else {
      const desired = new Set(desiredActions(tick, runtime));
      for (const actionId of [...activeInputs]) if (!desired.has(actionId)) applyInput(actionId, false, tick);
      for (const actionId of desired) if (!activeInputs.has(actionId)) applyInput(actionId, true, tick);
    }
    const events = runtime.update(1 / config.tickRate);
    executedTicks += 1;
    for (const event of events) observeEvent(event, observed, eventCounts);
    const state = runtime.getState();
    observed.maps.add(state.activeMapId);
    if (policy.routeEvidence) observed.routeMaps.add(state.activeMapId);
    ticksByMap[state.activeMapId] = (ticksByMap[state.activeMapId] ?? 0) + 1;
    const player = state.player;
    if (player) {
      const cellX = Math.floor(Number(player.x ?? 0) / config.spatialCellSize);
      const cellY = Math.floor(Number(player.y ?? 0) / config.spatialCellSize);
      observed.spatialCells.add(`${state.activeMapId}:${cellX}:${cellY}`);
      const moved = !priorPlayer || Math.hypot(Number(player.x ?? 0) - Number(priorPlayer.x ?? 0), Number(player.y ?? 0) - Number(priorPlayer.y ?? 0), Number(player.z ?? 0) - Number(priorPlayer.z ?? 0)) > 0.25;
      const active = (state.deterministicState?.activeInputCodes ?? []).length > 0;
      stationaryActiveTicks = active && !moved ? stationaryActiveTicks + 1 : 0;
      longestStationaryActiveTicks = Math.max(longestStationaryActiveTicks, stationaryActiveTicks);
      const runtimePlayer = runtime.getObjects().find((object) => object?.kind === "player");
      if (runtimePlayer) for (const object of runtime.getObjects()) {
        if (!object?.id || object.id === runtimePlayer.id || object.hidden === true) continue;
        if (!runtime.overlaps(runtimePlayer, object)) continue;
        const id = mapKey(state.activeMapId, object.id);
        observed.contacts.add(id);
        if (object.kind === "hazard") observed.hazardContacts.add(id);
      }
    }
    priorPlayer = player ? clone(player) : null;
    if (state.won && completionTick === null) completionTick = tick;
    if (state.won && policy.kind !== "witness") break;
  }
  for (const actionId of [...activeInputs]) runtime.setInput(actionId, false);
  const finalState = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_HASH_VERSION });
  const meaningfulEvents = Object.entries(eventCounts).filter(([type]) => !["input.action", "map.changed", "player.landed"].includes(type)).reduce((sum, [, count]) => sum + count, 0);
  const exercisedVerbIds = inventory.verbs.filter((verb) => verb.inputActionIds.some((actionId) => observed.actions.has(actionId))).map((verb) => verb.id);
  return {
    id: policy.id,
    label: policy.label,
    policy: policy.kind,
    seed: policy.seed ?? null,
    startMapId: policy.mapId,
    routeEvidence: policy.routeEvidence,
    tickRate: config.tickRate,
    requestedTicks: policy.tickCount,
    executedTicks,
    inputDigest: canonicalSha256(inputOperations),
    finalStateDigest: replayStateDigest(finalState, { hashVersion: LOOPLAB_REPLAY_HASH_VERSION }),
    completed: completionTick !== null,
    completionTick,
    meaningfulEvents,
    eventCounts: Object.fromEntries(Object.entries(eventCounts).sort(([first], [second]) => first.localeCompare(second))),
    actionIds: sorted(observed.actions),
    exercisedVerbIds: sorted(exercisedVerbIds),
    visitedMapIds: sorted(observed.maps),
    ticksByMap: Object.fromEntries(Object.entries(ticksByMap).sort(([first], [second]) => first.localeCompare(second))),
    contactIds: sorted(observed.contacts),
    spatialCellCount: observed.spatialCells.size,
    longestStationaryActiveTicks,
    observed: Object.fromEntries(Object.entries(observed).map(([key, value]) => [key, sorted(value)])),
  };
}

function mergeObserved(runs) {
  const merged = emptyObserved();
  for (const run of runs) for (const key of Object.keys(merged)) for (const value of run.observed[key] ?? []) merged[key].add(value);
  return merged;
}

function coverageEntry(authoredIds, observedIds) {
  const authored = sorted(authoredIds);
  const observed = sorted(observedIds).filter((id) => authored.includes(id));
  return { authoredCount: authored.length, observedCount: observed.length, ratio: ratio(observed.length, authored.length), observedIds: observed, unobservedIds: authored.filter((id) => !observed.includes(id)) };
}

function buildFindings({ liveness, coverage, runs, completion, totalMeaningfulEvents, config }) {
  const findings = [];
  const add = (code, title, evidence, suggestion, confidence = "bounded-observation") => findings.push({ code, severity: "advisory", title, evidence, suggestion, confidence });
  if (liveness.liveCount === 0) add("no-live-authored-actions", "No authored semantic action has a live runtime consumer", { actionCount: liveness.actionCount, deadActionIds: liveness.actions.map((action) => action.actionId) }, "Connect purpose-earned semantic actions to the runtime before judging the game loop.", "source-fact");
  if (coverage.routeMaps.unobservedIds.length > 0) add("route-maps-unvisited", "Natural-start cohorts did not reach every authored map", { unvisitedMapIds: coverage.routeMaps.unobservedIds, observedMapIds: coverage.routeMaps.observedIds }, "Inspect map joins, route readability, prerequisites, and recovery paths; a bounded miss is not proof the maps are unreachable.");
  if (coverage.actions.unobservedIds.length > 0) add("live-actions-unexercised", "Some live semantic actions never produced an input event", { actionIds: coverage.actions.unobservedIds }, "Give each action a readable opportunity, teach it, and make it useful in recurring decisions rather than only naming it in the brief.");
  if (coverage.verbs.unobservedIds.length > 0) add("verbs-unexercised", "Some authored verbs were not exercised by their linked inputs", { verbIds: coverage.verbs.unobservedIds }, "Add situations that require these verbs and verify their state change and feedback; input observation alone cannot prove the verb works well.");
  if (coverage.combinations.unobservedIds.length > 0) add("verb-combinations-unobserved", "Some authored verb combinations were never co-exercised in one run", { combinationIds: coverage.combinations.unobservedIds }, "Create teaching, practice, pressure, recovery, and mastery uses that make the relationship necessary; co-exercise is only a lead, not proof of a real combination.");
  if (coverage.rules.unobservedIds.length > 0) add("gameplay-rules-unfired", "Some enabled gameplay rules never fired", { ruleIds: coverage.rules.unobservedIds }, "Check triggers and make consequential rules encounterable in ordinary play.");
  if (coverage.choices.unobservedIds.length > 0) add("choices-unselected", "Some authored choices were not selected", { choiceIds: coverage.choices.unobservedIds }, "Check whether choices appear, are enabled, and create understandable consequences.");
  if (coverage.traversalPaths.unobservedIds.length > 0) add("traversal-unexercised", "Some traversal paths were never entered", { pathIds: coverage.traversalPaths.unobservedIds }, "Check approach clearance, interaction affordance, path continuity, exits, and recovery space.");
  if (coverage.portals.unobservedIds.length > 0) add("portals-unentered", "Some map exits were never entered", { portalIds: coverage.portals.unobservedIds }, "Inspect placement, collision ownership, fresh-interaction requirements, and destination spawns.");
  const singleActionWins = runs.filter((run) => run.policy === "single-action" && run.completed).map((run) => ({ runId: run.id, actionIds: run.actionIds, completionTick: run.completionTick }));
  if (singleActionWins.length > 0) add("possible-trivial-dominant-strategy", "A single-action pressure run reached completion", { runs: singleActionWins }, "Confirm whether this is intentional accessibility or whether one action bypasses the decisions, combinations, and risks that define the game.");
  const stalled = runs.filter((run) => run.policy === "explorer" && run.longestStationaryActiveTicks >= Math.max(120, config.decisionTicks * 4)).map((run) => ({ runId: run.id, ticks: run.longestStationaryActiveTicks }));
  if (stalled.length > 0) add("stalled-under-active-input", "Some cohorts remained stationary while input stayed active", { runs: stalled }, "Inspect blocked starts, collision traps, unclear required interactions, and recovery behavior; intentional hold actions can also create this signal.");
  if (completion?.target?.required && !runs.some((run) => run.completed)) add("completion-unobserved", "No included cohort reached the authored terminal state", { completionHarnessStatus: completion.status, completionHarnessReason: completion.reason, exploredStates: completion.coverage?.exploredStates ?? 0 }, "Use the completion witness/search as a debugging lead, then perform a real playtest. Bounded exhaustion never proves unwinnability.");
  if (totalMeaningfulEvents === 0) add("no-observed-gameplay-events", "Cohorts produced no gameplay event beyond raw input and map setup", { runCount: runs.length }, "Verify that player actions change the world and produce readable feedback rather than only moving an avatar.");
  return findings;
}

export function runBotCohorts(project = {}, options = {}) {
  const sourceDigest = stableText(options.sourceDigest) ? options.sourceDigest.trim() : null;
  const maps = authoredMaps(project);
  if (maps.length === 0) throw new Error("Bot cohorts require at least one authored map.");
  const startMapId = String(project?.startMapId ?? project?.activeMapId ?? maps[0]?.id ?? "main");
  const config = normalizeConfig(project, options);
  const mapIds = selectedMaps(maps, options, startMapId);
  const liveness = analyzeInputActionLiveness(project, { sourceDigest });
  const actions = actionCatalog(project, liveness);
  const inventory = authoredInventory(project, maps);
  const planned = cohortPolicies(project, maps, mapIds, actions, config, sourceDigest);
  const runs = [];
  let totalTicks = 0;
  for (const policy of planned.policies) {
    if (totalTicks >= LOOPLAB_BOT_COHORT_LIMITS.maximumTotalTicks) break;
    const boundedPolicy = { ...policy, tickCount: Math.min(policy.tickCount, LOOPLAB_BOT_COHORT_LIMITS.maximumTotalTicks - totalTicks) };
    const run = runCohort(project, boundedPolicy, actions, config, inventory);
    runs.push(run);
    totalTicks += run.executedTicks;
  }
  const observed = mergeObserved(runs);
  const routeMapIds = sorted(runs.filter((run) => run.routeEvidence).flatMap((run) => run.observed.routeMaps ?? []));
  const liveActionIds = liveness.actions.filter((action) => action.classification === "live").map((action) => action.actionId);
  const observedVerbIds = inventory.verbs.filter((verb) => verb.inputActionIds.some((actionId) => observed.actions.has(actionId))).map((verb) => verb.id);
  const coexercisedCombinationIds = inventory.combinations.filter((combination) => runs.some((run) => combination.verbIds.every((verbId) => run.exercisedVerbIds.includes(verbId)))).map((combination) => combination.id);
  const coverage = {
    maps: coverageEntry(inventory.mapIds, observed.maps),
    routeMaps: coverageEntry(inventory.mapIds, routeMapIds),
    actions: coverageEntry(liveActionIds, observed.actions),
    verbs: coverageEntry(inventory.verbs.map((verb) => verb.id), observedVerbIds),
    combinations: coverageEntry(inventory.combinations.map((combination) => combination.id), coexercisedCombinationIds),
    rules: coverageEntry(inventory.rules, observed.rules),
    choices: coverageEntry(inventory.choices, observed.choices),
    traversalPaths: coverageEntry(inventory.traversalPaths, observed.paths),
    portals: coverageEntry(inventory.portals, observed.portals),
    goals: coverageEntry(inventory.goals, observed.goals),
    collectibles: coverageEntry(inventory.collectibles, observed.collectibles),
    actors: coverageEntry(inventory.actors, observed.actors),
    combatEmitters: coverageEntry(inventory.emitters, observed.emitters),
    contacts: { observedCount: observed.contacts.size, observedIds: sorted(observed.contacts), hazardContactIds: sorted(observed.hazardContacts) },
    spatial: { cellSize: config.spatialCellSize, observedCellCount: observed.spatialCells.size, observedCellIds: sorted(observed.spatialCells) },
  };
  const totalMeaningfulEvents = runs.reduce((sum, run) => sum + run.meaningfulEvents, 0);
  const findings = buildFindings({ inventory, liveness, coverage, runs, completion: planned.completion, totalMeaningfulEvents, config });
  const report = {
    schemaVersion: LOOPLAB_BOT_COHORT_REPORT_SCHEMA,
    runnerVersion: LOOPLAB_BOT_COHORT_RUNNER_VERSION,
    sourceDigest,
    status: findings.length > 0 ? "attention" : "observations-available",
    providerFree: true,
    readOnly: true,
    deterministic: true,
    config: { ...config, configDigest: canonicalSha256(config), selectedMapIds: mapIds },
    actionLiveness: liveness,
    completionHarness: planned.completion,
    inventory,
    coverage,
    summary: {
      runCount: runs.length,
      executedTicks: totalTicks,
      simulatedSeconds: Number((totalTicks / config.tickRate).toFixed(3)),
      completedRunCount: runs.filter((run) => run.completed).length,
      meaningfulEventCount: totalMeaningfulEvents,
      meaningfulEventsPerSimulatedMinute: totalTicks > 0 ? Number((totalMeaningfulEvents * config.tickRate * 60 / totalTicks).toFixed(2)) : 0,
      advisoryFindingCount: findings.length,
    },
    runs,
    findings,
    designQuestions: [
      "Do the observed actions create recurring decisions, or merely movement and button presses?",
      "Can players understand why state changed and plan a better next attempt?",
      "Do authored verb combinations create consequences that neither verb produces alone?",
      "Are quiet travel, challenge density, recovery space, and escalation intentionally paced?",
      "Would real players prefer this candidate over the protected baseline, and why?",
    ],
    proofBoundary: {
      statement: "These are deterministic synthetic behavior probes, not human personas.",
      proves: ["the exact reported runtime events, contacts, map visits, input observations, completion states, stalls, and replay hashes occurred under the listed bounded policies"],
      doesNotProve: ["fun", "taste", "aesthetic quality", "fairness", "accessibility", "narrative quality", "player preference", "unreachability", "absence of other strategies"],
      nextEvidence: ["provider-backed design critique grounded in this report", "browser playtest", "human playtest observation", "candidate preference comparison against the protected baseline"],
    },
    providerUsage: { provider: "none", measured: true, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, rateEquivalentUsd: 0 },
  };
  return { ...report, reportDigest: canonicalSha256(report) };
}
