export const LOOPLAB_INPUT_ACTION_LIVENESS_SCHEMA = "looplab-input-action-liveness/v1";

const PLAYER_INPUT_ALIASES = Object.freeze({
  "move-left": "left",
  left: "left",
  "move-right": "right",
  right: "right",
  "move-up": "up",
  up: "up",
  "move-down": "down",
  down: "down",
  jump: "jump",
  interact: "interact",
  lock: "interact",
});

const PLAYER_INPUT_CODES = new Set([
  "ArrowLeft", "KeyA", "left",
  "ArrowRight", "KeyD", "right",
  "ArrowUp", "KeyW", "up",
  "ArrowDown", "KeyS", "down",
  "Space", "jump",
  "KeyE", "interact",
]);

const CANONICAL_PLAYER_CODES = Object.freeze({
  ArrowLeft: "left", KeyA: "left", left: "left",
  ArrowRight: "right", KeyD: "right", right: "right",
  ArrowUp: "up", KeyW: "up", up: "up",
  ArrowDown: "down", KeyS: "down", down: "down",
  Space: "jump", jump: "jump",
  KeyE: "interact", interact: "interact",
});

const stableText = (value) => typeof value === "string" && value.trim().length > 0;

function unique(values) {
  return [...new Set(values.filter(stableText))];
}

function authoredMaps(project) {
  if (Array.isArray(project?.maps) && project.maps.length > 0) return project.maps;
  return [{ id: project?.activeMapId ?? project?.startMapId ?? "main", objects: project?.objects ?? [] }];
}

function playerControlSupported(controlMode, code) {
  const canonical = CANONICAL_PLAYER_CODES[code] ?? null;
  if (!canonical) return false;
  if (canonical === "interact") return true;
  if (controlMode === "topdown") return ["left", "right", "up", "down"].includes(canonical);
  return ["left", "right", "up", "jump"].includes(canonical);
}

export function resolveSemanticInputAction(action = {}) {
  const id = stableText(action.id) ? action.id.trim() : "";
  const bindings = unique(Array.isArray(action.bindings) ? action.bindings.filter(stableText).map((binding) => binding.trim()) : []);
  const playerBinding = bindings.find((binding) => PLAYER_INPUT_CODES.has(binding));
  const resolvedCode = PLAYER_INPUT_ALIASES[id] ?? playerBinding ?? bindings[0] ?? id;
  return {
    id,
    bindings,
    resolvedCode,
    runtimeCodes: unique([id, resolvedCode]),
    playerCode: PLAYER_INPUT_CODES.has(resolvedCode) ? resolvedCode : null,
  };
}

export function analyzeInputActionLiveness(project = {}, options = {}) {
  const actions = Array.isArray(project.inputActions) ? project.inputActions : [];
  const maps = authoredMaps(project);
  const playerMaps = maps
    .filter((map) => (map?.objects ?? []).some((object) => object?.kind === "player"))
    .map((map) => ({ id: map.id ?? "main", controlMode: map.controlMode ?? project.controlMode ?? "platformer" }));
  const rules = Array.isArray(project.gameplayProgram?.rules) ? project.gameplayProgram.rules : [];
  const choicePages = Array.isArray(project.gameplayProgram?.choicePages) ? project.gameplayProgram.choicePages : [];
  const verbs = Array.isArray(project.verbArchitecture?.verbs) ? project.verbArchitecture.verbs : [];
  const combatEnabled = project.combatProgram?.enabled !== false;
  const combatEmitters = Array.isArray(project.combatProgram?.emitters) ? project.combatProgram.emitters : [];

  const results = actions.map((action) => {
    const resolution = resolveSemanticInputAction(action);
    const consumers = [];
    const intentReferences = [];

    const supportedPlayerMapIds = resolution.playerCode
      ? playerMaps.filter((map) => playerControlSupported(map.controlMode, resolution.playerCode)).map((map) => map.id)
      : [];
    if (supportedPlayerMapIds.length > 0) {
      consumers.push({ type: "runtime-player-control", code: resolution.playerCode, mapIds: supportedPlayerMapIds });
    }

    for (const rule of rules) {
      if (rule?.trigger?.type !== "input" || rule.trigger.actionId !== resolution.id) continue;
      if (rule.enabled === false) intentReferences.push({ type: "disabled-gameplay-rule", id: rule.id ?? null });
      else consumers.push({ type: "gameplay-rule", id: rule.id ?? null, phase: rule.trigger.phase ?? "pressed" });
    }

    for (const page of choicePages) {
      for (const choice of page?.choices ?? []) {
        if (choice?.actionId === resolution.id) consumers.push({ type: "choice", pageId: page.id ?? null, choiceId: choice.id ?? null });
      }
    }

    for (const emitter of combatEmitters) {
      if (emitter?.trigger === "automatic" || emitter?.actionId !== resolution.id) continue;
      const reference = {
        type: combatEnabled ? "combat-emitter" : "disabled-combat-emitter",
        id: emitter.id ?? null,
        mapId: emitter.mapId ?? null,
        trigger: emitter.trigger ?? "pressed",
      };
      if (combatEnabled) consumers.push(reference);
      else intentReferences.push(reference);
    }

    for (const verb of verbs) {
      if ((verb?.inputActionIds ?? []).includes(resolution.id)) intentReferences.push({ type: "verb-architecture", id: verb.id ?? null });
    }
    if (stableText(action.animationState)) intentReferences.push({ type: "animation-state", id: action.animationState.trim() });
    if (action.onboarding === true) intentReferences.push({ type: "onboarding" });
    if (action.replayEvent === true) intentReferences.push({ type: "replay-event" });

    return {
      actionId: resolution.id,
      label: stableText(action.label) ? action.label.trim() : resolution.id,
      bindings: resolution.bindings,
      semanticResolution: { resolvedCode: resolution.resolvedCode, runtimeCodes: resolution.runtimeCodes },
      classification: consumers.length > 0 ? "live" : "dead",
      consumers,
      intentReferences,
    };
  });

  const liveCount = results.filter((result) => result.classification === "live").length;
  const deadCount = results.length - liveCount;
  return {
    schemaVersion: LOOPLAB_INPUT_ACTION_LIVENESS_SCHEMA,
    sourceDigest: stableText(options.sourceDigest) ? options.sourceDigest : null,
    status: actions.length === 0 ? "no-actions" : deadCount === 0 ? "passed" : "failed",
    passed: actions.length > 0 && deadCount === 0,
    actionCount: results.length,
    liveCount,
    deadCount,
    actions: results,
  };
}
