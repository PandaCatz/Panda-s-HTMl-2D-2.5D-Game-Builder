import { runAcceptanceSuite } from "./looplab-acceptance.mjs";
import { canonicalJson, sha256Hex } from "./looplab-canonical-digest.mjs";
import { analyzeInputActionLiveness } from "./looplab-input-liveness.mjs";
import { captureReplayState, LOOPLAB_REPLAY_HASH_VERSION, replayStateDigest } from "./looplab-replay.mjs";
import { createRuntimeModel } from "./looplab-runtime-instance.mjs";

export const LOOPLAB_COMPLETION_HARNESS_SCHEMA = "looplab-completion-harness/v1";
export const LOOPLAB_COMPLETION_HARNESS_VERSION = 1;
export const LOOPLAB_COMPLETION_HARNESS_DEFAULTS = Object.freeze({
  tickRate: 60,
  maxNodes: 128,
  maxDepth: 8,
  maxTransitions: 512,
  continuousHoldTicks: [12, 45],
  discreteHoldTicks: [1],
  settleTicks: 1,
  positionQuantum: 4,
  velocityQuantum: 10,
  maxChordActions: 1,
});

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const stableText = (value) => typeof value === "string" && value.trim().length > 0;
const completionCache = new Map();
const COMPLETION_CACHE_LIMIT = 64;
const finiteInteger = (value, fallback, minimum, maximum) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
};

function uniquePositiveIntegers(values, fallback, maximum = 600) {
  const normalized = Array.isArray(values)
    ? values.map(Number).filter((value) => Number.isInteger(value) && value > 0 && value <= maximum)
    : [];
  return [...new Set(normalized.length ? normalized : fallback)].sort((first, second) => first - second);
}

function normalizedConfig(options = {}) {
  const config = {
    tickRate: finiteInteger(options.tickRate, LOOPLAB_COMPLETION_HARNESS_DEFAULTS.tickRate, 20, 240),
    maxNodes: finiteInteger(options.maxNodes, LOOPLAB_COMPLETION_HARNESS_DEFAULTS.maxNodes, 1, 20_000),
    maxDepth: finiteInteger(options.maxDepth, LOOPLAB_COMPLETION_HARNESS_DEFAULTS.maxDepth, 0, 128),
    maxTransitions: finiteInteger(options.maxTransitions, LOOPLAB_COMPLETION_HARNESS_DEFAULTS.maxTransitions, 1, 100_000),
    continuousHoldTicks: uniquePositiveIntegers(options.continuousHoldTicks, LOOPLAB_COMPLETION_HARNESS_DEFAULTS.continuousHoldTicks),
    discreteHoldTicks: uniquePositiveIntegers(options.discreteHoldTicks, LOOPLAB_COMPLETION_HARNESS_DEFAULTS.discreteHoldTicks),
    settleTicks: finiteInteger(options.settleTicks, LOOPLAB_COMPLETION_HARNESS_DEFAULTS.settleTicks, 1, 120),
    positionQuantum: finiteInteger(options.positionQuantum, LOOPLAB_COMPLETION_HARNESS_DEFAULTS.positionQuantum, 1, 128),
    velocityQuantum: finiteInteger(options.velocityQuantum, LOOPLAB_COMPLETION_HARNESS_DEFAULTS.velocityQuantum, 1, 1_000),
    maxChordActions: 1,
  };
  return {
    ...config,
    digest: `completion-config-${sha256Hex(canonicalJson(config)).slice(0, 16)}`,
  };
}

function authoredMaps(project) {
  if (Array.isArray(project?.maps) && project.maps.length > 0) return project.maps;
  return [{ id: project?.activeMapId ?? project?.startMapId ?? "main", objects: project?.objects ?? [] }];
}

function effectOwners(project, effectType) {
  const owners = [];
  for (const rule of project?.gameplayProgram?.rules ?? []) {
    if (rule?.enabled === false) continue;
    if ((rule?.effects ?? []).some((effect) => effect?.type === effectType)) owners.push({ type: "gameplay-rule", id: rule.id ?? null });
  }
  for (const page of project?.gameplayProgram?.choicePages ?? []) {
    for (const choice of page?.choices ?? []) {
      if ((choice?.effects ?? []).some((effect) => effect?.type === effectType)) owners.push({ type: "choice", pageId: page.id ?? null, id: choice.id ?? null });
    }
  }
  return owners;
}

export function inspectCompletionTarget(project = {}) {
  const goalIds = authoredMaps(project).flatMap((map) => (map?.objects ?? [])
    .filter((object) => object?.kind === "goal" && object?.hidden !== true && object?.collider?.enabled !== false)
    .map((object) => `${map?.id ?? "main"}:${object.id ?? "goal"}`));
  const winEffectOwners = effectOwners(project, "win");
  const declaredMode = project?.qualityContracts?.completionMode === "open-ended"
    ? "open-ended"
    : project?.qualityContracts?.completionMode === "required"
      ? "required"
      : "auto";
  const required = declaredMode === "required" || goalIds.length > 0 || winEffectOwners.length > 0;
  return {
    required,
    declaredMode,
    predicate: "runtime.won === true",
    goalIds,
    winEffectOwners,
    reason: required ? "terminal-target-authored" : declaredMode === "open-ended" ? "open-ended-project" : "no-terminal-target",
  };
}

function terminalAcceptanceSpecification(test) {
  return (test?.assertions ?? []).some((assertion) => assertion?.target === "runtime-state"
    && assertion?.property === "won"
    && (assertion.operator === "truthy" || assertion.operator === "equals" && assertion.expected === true));
}

function normalizeInputTape(inputs = []) {
  return inputs.map((input) => ({
    tick: Number(input.tick),
    actionId: String(input.actionId ?? input.action ?? input.code ?? ""),
    pressed: input.pressed !== false,
  }));
}

function quantize(value, quantum) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number / quantum) * quantum : 0;
}

function searchProjection(runtime, config) {
  const snapshot = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_HASH_VERSION });
  const projectObject = (object) => ({
    ...object,
    x: quantize(object.x, config.positionQuantum),
    y: quantize(object.y, config.positionQuantum),
    z: quantize(object.z, config.positionQuantum),
    vx: quantize(object.vx, config.velocityQuantum),
    vy: quantize(object.vy, config.velocityQuantum),
  });
  return {
    ...snapshot,
    player: snapshot.player ? projectObject(snapshot.player) : null,
    deterministicState: {
      ...(snapshot.deterministicState ?? {}),
      activeInputCodes: [],
      activeActionIds: [],
    },
    objects: (snapshot.objects ?? []).map(projectObject),
  };
}

function stateSummary(runtime) {
  const state = runtime.getState();
  return {
    activeMapId: state.activeMapId,
    won: Boolean(state.won),
    collectedCount: Number(state.collectedCount ?? 0),
    activeChoicePageId: state.activeChoicePageId ?? null,
    gameplayRevision: Number(state.gameplayRevision ?? 0),
    variables: clone(state.variables ?? {}),
    completedRuleIds: clone(state.completedRuleIds ?? []),
    player: state.player ? {
      id: state.player.id,
      x: Number(state.player.x ?? 0),
      y: Number(state.player.y ?? 0),
      z: Number(state.player.z ?? 0),
      vx: Number(state.player.vx ?? 0),
      vy: Number(state.player.vy ?? 0),
      grounded: Boolean(state.player.grounded),
    } : null,
  };
}

function runInputTape(project, tape, config) {
  const runtime = createRuntimeModel(clone(project));
  if (stableText(tape.startMapId) && !runtime.loadMap(tape.startMapId, stableText(tape.startSpawnId) ? tape.startSpawnId : null)) {
    throw new Error(`Completion tape references missing start map ${tape.startMapId}.`);
  }
  runtime.drainEvents();
  const inputsByTick = new Map();
  for (const input of tape.inputs ?? []) {
    const list = inputsByTick.get(input.tick) ?? [];
    list.push(input);
    inputsByTick.set(input.tick, list);
  }
  const emittedEventCounts = {};
  for (let tick = 0; tick < tape.tickCount; tick += 1) {
    for (const input of inputsByTick.get(tick) ?? []) runtime.setInput(input.actionId, input.pressed);
    for (const event of runtime.update(1 / config.tickRate)) emittedEventCounts[event.type] = (emittedEventCounts[event.type] ?? 0) + 1;
  }
  const exactState = captureReplayState(runtime, { hashVersion: LOOPLAB_REPLAY_HASH_VERSION });
  const projection = searchProjection(runtime, config);
  return {
    runtime,
    won: Boolean(runtime.getState().won),
    exactStateDigest: replayStateDigest(exactState, { hashVersion: LOOPLAB_REPLAY_HASH_VERSION }),
    searchStateDigest: `completion-state-${sha256Hex(canonicalJson(projection)).slice(0, 16)}`,
    summary: stateSummary(runtime),
    choice: clone(runtime.getChoiceState()),
    emittedEventCounts,
  };
}

function macrosToTape(steps, config) {
  const inputs = [];
  let tick = 0;
  for (const step of steps) {
    for (const actionId of step.actionIds) inputs.push({ tick, actionId, pressed: true });
    tick += step.holdTicks;
    for (const actionId of step.actionIds) inputs.push({ tick, actionId, pressed: false });
    tick += config.settleTicks;
  }
  return { tickRate: config.tickRate, tickCount: Math.max(1, tick), inputs };
}

function executableActions(project) {
  return analyzeInputActionLiveness(project).actions.filter((action) => action.classification === "live");
}

function candidateMacros(project, outcome, config, actions) {
  const activeChoices = (outcome.choice?.choices ?? [])
    .filter((choice) => choice?.enabled !== false && stableText(choice?.actionId))
    .map((choice) => choice.actionId.trim());
  const activeChoiceActions = [...new Set(activeChoices)].sort();
  if (activeChoiceActions.length > 0) return activeChoiceActions.map((actionId) => ({ actionIds: [actionId], holdTicks: config.discreteHoldTicks[0], kind: "choice" }));

  const candidates = [];
  for (const action of actions) {
    const playerConsumer = action.consumers.find((consumer) => consumer.type === "runtime-player-control");
    const continuous = playerConsumer && !["jump", "interact", "Space", "KeyE"].includes(playerConsumer.code);
    const durations = continuous ? config.continuousHoldTicks : config.discreteHoldTicks;
    for (const holdTicks of durations) candidates.push({ actionIds: [action.actionId], holdTicks, kind: continuous ? "continuous" : "discrete" });
  }
  return candidates;
}

function baseReceipt({ sourceDigest, target, config }) {
  return {
    schemaVersion: LOOPLAB_COMPLETION_HARNESS_SCHEMA,
    runnerVersion: LOOPLAB_COMPLETION_HARNESS_VERSION,
    sourceDigest: stableText(sourceDigest) ? sourceDigest : null,
    target,
    search: {
      strategy: "bounded-breadth-first",
      model: "looplab-deterministic-runtime",
      abstraction: "quantized-gameplay-state-under-approximation",
      configDigest: config.digest,
      tickRate: config.tickRate,
      maxNodes: config.maxNodes,
      maxDepth: config.maxDepth,
      maxTransitions: config.maxTransitions,
      continuousHoldTicks: config.continuousHoldTicks,
      discreteHoldTicks: config.discreteHoldTicks,
      settleTicks: config.settleTicks,
      maxChordActions: config.maxChordActions,
      positionQuantum: config.positionQuantum,
      velocityQuantum: config.velocityQuantum,
    },
  };
}

function passedReceipt(base, proof, witnessId, tape, outcome, coverage) {
  return {
    ...base,
    status: "passed",
    passed: true,
    proof,
    reason: "terminal-witness-reached",
    witnessId,
    reproTape: clone(tape),
    finalStateDigest: outcome.exactStateDigest,
    terminalState: outcome.summary,
    coverage,
  };
}

export function runCompletionHarness(project = {}, options = {}) {
  const target = inspectCompletionTarget(project);
  const config = normalizedConfig(options);
  const base = baseReceipt({ sourceDigest: options.sourceDigest, target, config });
  const cacheKey = stableText(options.sourceDigest) && options.cache !== false ? `${options.sourceDigest}:${config.digest}` : null;
  if (cacheKey && completionCache.has(cacheKey)) return clone(completionCache.get(cacheKey));
  const finish = (report) => {
    if (cacheKey) {
      if (completionCache.size >= COMPLETION_CACHE_LIMIT) completionCache.delete(completionCache.keys().next().value);
      completionCache.set(cacheKey, clone(report));
    }
    return report;
  };
  if (!target.required) {
    return finish({
      ...base,
      status: "not-applicable",
      passed: true,
      proof: "none",
      reason: target.reason,
      witnessId: null,
      reproTape: null,
      finalStateDigest: null,
      terminalState: null,
      coverage: { exploredStates: 0, expandedTransitions: 0, reachableDeadEnds: 0, frontierStates: 0, maximumDepthReached: 0, budgetExhausted: false },
    });
  }

  try {
    const acceptanceResults = options.acceptanceResults ?? runAcceptanceSuite(project, { sourceDigest: options.sourceDigest });
    for (const test of project?.acceptanceTests ?? []) {
      if (!terminalAcceptanceSpecification(test)) continue;
      const result = acceptanceResults.tests?.find((candidate) => candidate.testId === test.id);
      if (result?.status !== "passed") continue;
      const tape = {
        startMapId: stableText(test.driver?.startMapId) ? test.driver.startMapId : null,
        startSpawnId: stableText(test.driver?.startSpawnId) ? test.driver.startSpawnId : null,
        tickRate: Number(test.driver?.tickRate ?? config.tickRate),
        tickCount: Number(test.driver?.tickCount ?? 1),
        inputs: normalizeInputTape(test.driver?.inputs ?? []),
      };
      const authoredConfig = normalizedConfig({ ...config, tickRate: tape.tickRate });
      const outcome = runInputTape(project, tape, authoredConfig);
      if (outcome.won) return finish(passedReceipt(base, "authored-acceptance", test.id, tape, outcome, { exploredStates: 1, expandedTransitions: tape.inputs.length, reachableDeadEnds: 0, frontierStates: 0, maximumDepthReached: 0, budgetExhausted: false }));
    }

    const actions = executableActions(project);
    const rootTape = macrosToTape([], config);
    const root = runInputTape(project, rootTape, config);
    if (root.won) return finish(passedReceipt(base, "bounded-model-search", "completion-root", rootTape, root, { exploredStates: 1, expandedTransitions: 0, reachableDeadEnds: 0, frontierStates: 0, maximumDepthReached: 0, budgetExhausted: false }));

    const queue = [{ steps: [], outcome: root }];
    const seen = new Set([root.searchStateDigest]);
    let cursor = 0;
    let expandedTransitions = 0;
    let reachableDeadEnds = 0;
    let firstDeadEnd = null;
    let maximumDepthReached = 0;
    let budgetExhausted = false;

    while (cursor < queue.length) {
      const node = queue[cursor++];
      maximumDepthReached = Math.max(maximumDepthReached, node.steps.length);
      if (node.steps.length >= config.maxDepth) {
        budgetExhausted = true;
        continue;
      }
      const macros = candidateMacros(project, node.outcome, config, actions);
      let changedSuccessors = 0;
      for (const macro of macros) {
        if (seen.size >= config.maxNodes || expandedTransitions >= config.maxTransitions) {
          budgetExhausted = true;
          break;
        }
        const steps = [...node.steps, macro];
        const tape = macrosToTape(steps, config);
        const outcome = runInputTape(project, tape, config);
        expandedTransitions += 1;
        if (outcome.won) {
          return finish(passedReceipt(base, "bounded-model-search", `completion-search-${steps.length}`, tape, outcome, {
            exploredStates: seen.size + (seen.has(outcome.searchStateDigest) ? 0 : 1),
            expandedTransitions,
            reachableDeadEnds,
            frontierStates: Math.max(0, queue.length - cursor),
            maximumDepthReached: steps.length,
            budgetExhausted: false,
          }));
        }
        if (seen.has(outcome.searchStateDigest)) continue;
        changedSuccessors += 1;
        seen.add(outcome.searchStateDigest);
        queue.push({ steps, outcome });
      }
      if (changedSuccessors === 0 && !budgetExhausted) {
        reachableDeadEnds += 1;
        if (!firstDeadEnd) firstDeadEnd = macrosToTape(node.steps, config);
        if (node.steps.length === 0) {
          return finish({
            ...base,
            status: "dead-end",
            passed: false,
            proof: "bounded-model-search",
            reason: actions.length === 0 ? "no-executable-actions" : "initial-state-has-no-state-changing-action",
            witnessId: "completion-root-dead-end",
            reproTape: firstDeadEnd,
            finalStateDigest: root.exactStateDigest,
            terminalState: root.summary,
            coverage: { exploredStates: seen.size, expandedTransitions, reachableDeadEnds, frontierStates: Math.max(0, queue.length - cursor), maximumDepthReached, budgetExhausted: false },
          });
        }
      }
      if (budgetExhausted) break;
    }

    return finish({
      ...base,
      status: "inconclusive",
      passed: false,
      proof: "none",
      reason: budgetExhausted ? "search-budget-exhausted" : "macro-model-exhausted-without-terminal-witness",
      witnessId: null,
      reproTape: null,
      firstDeadEndTape: clone(firstDeadEnd),
      finalStateDigest: null,
      terminalState: null,
      coverage: {
        exploredStates: seen.size,
        expandedTransitions,
        reachableDeadEnds,
        frontierStates: Math.max(0, queue.length - cursor),
        maximumDepthReached,
        budgetExhausted,
      },
    });
  } catch (error) {
    return finish({
      ...base,
      status: "invalid",
      passed: false,
      proof: "none",
      reason: "completion-harness-error",
      error: error instanceof Error ? error.message : String(error),
      witnessId: null,
      reproTape: null,
      finalStateDigest: null,
      terminalState: null,
      coverage: { exploredStates: 0, expandedTransitions: 0, reachableDeadEnds: 0, frontierStates: 0, maximumDepthReached: 0, budgetExhausted: false },
    });
  }
}
