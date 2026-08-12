export const LOOPLAB_GAME_SHELL_SCHEMA = "looplab-game-shell/v1";
export const LOOPLAB_GAME_SHELL_REPORT_SCHEMA = "looplab-game-shell-report/v1";
export const LOOPLAB_GAME_SHELL_STATE_SCHEMA = "looplab-game-shell-state/v1";

export const LOOPLAB_GAME_SHELL_LIMITS = Object.freeze({
  maximumLabelLength: 96,
  maximumMessageLength: 320,
  minimumTouchControlSize: 44,
  maximumTouchControlSize: 80,
});

export const LOOPLAB_GAME_SHELL_POLICY = Object.freeze({
  sourceField: "gameShell",
  schemaVersion: LOOPLAB_GAME_SHELL_SCHEMA,
  reportSchemaVersion: LOOPLAB_GAME_SHELL_REPORT_SCHEMA,
  stateSchemaVersion: LOOPLAB_GAME_SHELL_STATE_SCHEMA,
  states: ["title", "playing", "paused", "won", "lost"],
  pauseCauses: ["user", "visibility", "blur", "settings"],
  simulationBoundary: "The shell gates whether the fixed-step simulation advances but never enters simulation state, collision, save data, acceptance observations, or replay hashes.",
  lifecycleBoundary: "Visibility and focus loss release held inputs, clear frame accumulation, suspend presentation, and retain an explicit pause cause. Returning visibility never silently overrides a deliberate pause or terminal state.",
  terminalBoundary: "Win and loss surfaces derive only from authored deterministic runtime truth. The shell cannot invent a timeout, defeat, score, or completion condition.",
  persistenceBoundary: "Shell preferences are page-session state. Strict one-file exports do not use browser storage, cookies, network requests, or sidecar files.",
  accessibilityBoundary: "Settings use a native modal dialog; every shell action has a visible label and focus indicator; reduced motion initializes from the system preference and remains explicitly overridable.",
  judgmentBoundary: "A valid shell proves state coverage and browser-operable controls, not visual quality, writing quality, pacing, fun, or suitability of the chosen labels.",
});

const STATUS = new Set(["draft", "approved"]);
const START_MODES = new Set(["title", "play"]);
const RESTART_MODES = new Set(["title", "play"]);
const LOSS_SOURCES = new Set(["none", "player-health-depleted", "boolean-variable"]);
const REDUCED_MOTION_DEFAULTS = new Set(["system", "reduce", "full"]);
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const clean = (value) => typeof value === "string" ? value.trim() : "";
const bool = (value, fallback) => typeof value === "boolean" ? value : fallback;
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum, fallback) => Math.max(minimum, Math.min(maximum, finite(value, fallback)));

function label(value, fallback, maximum = LOOPLAB_GAME_SHELL_LIMITS.maximumLabelLength) {
  const text = clean(value) || fallback;
  return text.slice(0, maximum);
}

export function normalizeGameShell(input = {}, options = {}) {
  const projectName = label(options.projectName, "Game");
  const enabled = bool(input.enabled, true);
  const lossSource = LOSS_SOURCES.has(input.terminal?.lose?.source) ? input.terminal.lose.source : "none";
  const variableId = lossSource === "boolean-variable" ? clean(input.terminal?.lose?.variableId) : null;
  return {
    schemaVersion: LOOPLAB_GAME_SHELL_SCHEMA,
    status: STATUS.has(input.status) ? input.status : "draft",
    enabled,
    startMode: START_MODES.has(input.startMode) ? input.startMode : "title",
    restartMode: RESTART_MODES.has(input.restartMode) ? input.restartMode : "play",
    labels: {
      gameTitle: label(input.labels?.gameTitle, projectName),
      tagline: label(input.labels?.tagline, "A LoopLab game", LOOPLAB_GAME_SHELL_LIMITS.maximumMessageLength),
      play: label(input.labels?.play, "Play"),
      pause: label(input.labels?.pause, "Pause"),
      resume: label(input.labels?.resume, "Resume"),
      restart: label(input.labels?.restart, "Restart"),
      settings: label(input.labels?.settings, "Settings"),
      settingsTitle: label(input.labels?.settingsTitle, "Game settings"),
      closeSettings: label(input.labels?.closeSettings, "Back"),
      winTitle: label(input.labels?.winTitle, "Victory"),
      winMessage: label(input.labels?.winMessage, "You completed the game.", LOOPLAB_GAME_SHELL_LIMITS.maximumMessageLength),
      loseTitle: label(input.labels?.loseTitle, "Game over"),
      loseMessage: label(input.labels?.loseMessage, "The run has ended.", LOOPLAB_GAME_SHELL_LIMITS.maximumMessageLength),
    },
    settings: {
      enabled: bool(input.settings?.enabled, true),
      audio: bool(input.settings?.audio, true),
      reducedMotion: bool(input.settings?.reducedMotion, true),
      touchControlSize: bool(input.settings?.touchControlSize, true),
      defaultMuted: bool(input.settings?.defaultMuted, false),
      defaultVolume: clamp(input.settings?.defaultVolume, 0, 1, 0.55),
      defaultReducedMotion: REDUCED_MOTION_DEFAULTS.has(input.settings?.defaultReducedMotion) ? input.settings.defaultReducedMotion : "system",
      defaultTouchControlSize: Math.round(clamp(input.settings?.defaultTouchControlSize, LOOPLAB_GAME_SHELL_LIMITS.minimumTouchControlSize, LOOPLAB_GAME_SHELL_LIMITS.maximumTouchControlSize, 52)),
    },
    terminal: {
      win: {
        enabled: bool(input.terminal?.win?.enabled, true),
        source: "runtime-won",
      },
      lose: {
        enabled: bool(input.terminal?.lose?.enabled, lossSource !== "none"),
        source: lossSource,
        variableId,
        expected: bool(input.terminal?.lose?.expected, true),
      },
    },
    waiver: enabled ? null : { reason: clean(input.waiver?.reason) },
  };
}

const ALLOWED_KEYS = Object.freeze({
  root: new Set(["schemaVersion", "status", "enabled", "startMode", "restartMode", "labels", "settings", "terminal", "waiver"]),
  labels: new Set(["gameTitle", "tagline", "play", "pause", "resume", "restart", "settings", "settingsTitle", "closeSettings", "winTitle", "winMessage", "loseTitle", "loseMessage"]),
  settings: new Set(["enabled", "audio", "reducedMotion", "touchControlSize", "defaultMuted", "defaultVolume", "defaultReducedMotion", "defaultTouchControlSize"]),
  terminal: new Set(["win", "lose"]),
  win: new Set(["enabled", "source"]),
  lose: new Set(["enabled", "source", "variableId", "expected"]),
  waiver: new Set(["reason"]),
});

function addIssue(issues, severity, code, message, context = {}) {
  issues.push({ severity, code, message, ...context });
}

function unknownKeys(value, allowed, path, issues) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) if (!allowed.has(key)) addIssue(issues, "error", "game-shell-field-unknown", `${path}.${key} is not an allowed game-shell field.`, { path: `${path}.${key}` });
}

function validateShape(input, field, issues) {
  if (input[field] !== undefined && (!input[field] || typeof input[field] !== "object" || Array.isArray(input[field]))) addIssue(issues, "error", "game-shell-shape", `gameShell.${field} must be an object.`, { path: `gameShell.${field}` });
}

function projectPlayers(project) {
  const maps = Array.isArray(project?.maps) && project.maps.length ? project.maps : [{ id: project?.activeMapId ?? "map-main", objects: project?.objects ?? [] }];
  return maps.flatMap((map) => (map.objects ?? []).filter((object) => object?.kind === "player").map((object) => ({ mapId: map.id, object })));
}

function playerHealthLossAvailable(project) {
  const players = new Set(projectPlayers(project).map(({ mapId, object }) => `${mapId}:${object.id}`));
  return (project?.combatProgram?.actors ?? []).some((actor) => players.has(`${actor.mapId}:${actor.objectId}`) && actor.deathBehavior !== "respawn");
}

export function inspectGameShell(project, input = project?.gameShell, options = {}) {
  const sourceDigest = options.sourceDigest ?? null;
  const strict = options.strict === true;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    const issue = { severity: strict ? "error" : "warning", code: "game-shell-missing", message: "The project has no authored standard game shell." };
    return {
      schemaVersion: LOOPLAB_GAME_SHELL_REPORT_SCHEMA,
      shellSchemaVersion: LOOPLAB_GAME_SHELL_SCHEMA,
      present: false,
      valid: !strict,
      shipReady: false,
      status: "missing",
      sourceDigest,
      shell: null,
      metrics: { stateCount: 0, settingsControlCount: 0, terminalCount: 0 },
      errors: strict ? [issue.message] : [],
      warnings: strict ? [] : [issue.message],
      issues: [issue],
      proofBoundary: LOOPLAB_GAME_SHELL_POLICY.judgmentBoundary,
    };
  }

  const issues = [];
  unknownKeys(input, ALLOWED_KEYS.root, "gameShell", issues);
  for (const field of ["labels", "settings", "terminal"]) validateShape(input, field, issues);
  if (input.waiver !== undefined && input.waiver !== null && (typeof input.waiver !== "object" || Array.isArray(input.waiver))) addIssue(issues, "error", "game-shell-shape", "gameShell.waiver must be an object or null.", { path: "gameShell.waiver" });
  if (input.terminal && typeof input.terminal === "object" && !Array.isArray(input.terminal)) {
    for (const field of ["win", "lose"]) validateShape(input.terminal, field, issues);
  }
  unknownKeys(input.labels, ALLOWED_KEYS.labels, "gameShell.labels", issues);
  unknownKeys(input.settings, ALLOWED_KEYS.settings, "gameShell.settings", issues);
  unknownKeys(input.terminal, ALLOWED_KEYS.terminal, "gameShell.terminal", issues);
  unknownKeys(input.terminal?.win, ALLOWED_KEYS.win, "gameShell.terminal.win", issues);
  unknownKeys(input.terminal?.lose, ALLOWED_KEYS.lose, "gameShell.terminal.lose", issues);
  unknownKeys(input.waiver, ALLOWED_KEYS.waiver, "gameShell.waiver", issues);

  if (input.schemaVersion !== undefined && input.schemaVersion !== LOOPLAB_GAME_SHELL_SCHEMA) addIssue(issues, "error", "game-shell-version", `gameShell.schemaVersion must be ${LOOPLAB_GAME_SHELL_SCHEMA}.`);
  if (input.status !== undefined && !STATUS.has(input.status)) addIssue(issues, "error", "game-shell-status", "gameShell.status must be draft or approved.");
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") addIssue(issues, "error", "game-shell-enabled", "gameShell.enabled must be boolean.");
  if (input.startMode !== undefined && !START_MODES.has(input.startMode)) addIssue(issues, "error", "game-shell-start-mode", "gameShell.startMode must be title or play.");
  if (input.restartMode !== undefined && !RESTART_MODES.has(input.restartMode)) addIssue(issues, "error", "game-shell-restart-mode", "gameShell.restartMode must be title or play.");
  if (input.terminal?.win?.source !== undefined && input.terminal.win.source !== "runtime-won") addIssue(issues, "error", "game-shell-win-source", "gameShell.terminal.win.source must be runtime-won.");
  if (input.terminal?.lose?.source !== undefined && !LOSS_SOURCES.has(input.terminal.lose.source)) addIssue(issues, "error", "game-shell-loss-source", "gameShell.terminal.lose.source must be none, player-health-depleted, or boolean-variable.");
  if (input.settings?.defaultReducedMotion !== undefined && !REDUCED_MOTION_DEFAULTS.has(input.settings.defaultReducedMotion)) addIssue(issues, "error", "game-shell-reduced-motion", "gameShell.settings.defaultReducedMotion must be system, reduce, or full.");
  if (input.settings?.defaultVolume !== undefined && (!Number.isFinite(Number(input.settings.defaultVolume)) || Number(input.settings.defaultVolume) < 0 || Number(input.settings.defaultVolume) > 1)) addIssue(issues, "error", "game-shell-volume", "gameShell.settings.defaultVolume must be from 0 through 1.");
  if (input.settings?.defaultTouchControlSize !== undefined && (!Number.isInteger(Number(input.settings.defaultTouchControlSize)) || Number(input.settings.defaultTouchControlSize) < LOOPLAB_GAME_SHELL_LIMITS.minimumTouchControlSize || Number(input.settings.defaultTouchControlSize) > LOOPLAB_GAME_SHELL_LIMITS.maximumTouchControlSize)) addIssue(issues, "error", "game-shell-touch-size", `gameShell.settings.defaultTouchControlSize must be an integer from ${LOOPLAB_GAME_SHELL_LIMITS.minimumTouchControlSize} through ${LOOPLAB_GAME_SHELL_LIMITS.maximumTouchControlSize}.`);
  for (const [path, value] of [
    ["gameShell.settings.enabled", input.settings?.enabled],
    ["gameShell.settings.audio", input.settings?.audio],
    ["gameShell.settings.reducedMotion", input.settings?.reducedMotion],
    ["gameShell.settings.touchControlSize", input.settings?.touchControlSize],
    ["gameShell.settings.defaultMuted", input.settings?.defaultMuted],
    ["gameShell.terminal.win.enabled", input.terminal?.win?.enabled],
    ["gameShell.terminal.lose.enabled", input.terminal?.lose?.enabled],
    ["gameShell.terminal.lose.expected", input.terminal?.lose?.expected],
  ]) if (value !== undefined && typeof value !== "boolean") addIssue(issues, "error", "game-shell-boolean", `${path} must be boolean.`, { path });

  for (const key of ALLOWED_KEYS.labels) {
    if (input.labels?.[key] !== undefined && (typeof input.labels[key] !== "string" || !input.labels[key].trim())) addIssue(issues, "error", "game-shell-label-empty", `gameShell.labels.${key} must be a non-empty string.`, { path: `gameShell.labels.${key}` });
    const maximum = key.endsWith("Message") || key === "tagline" ? LOOPLAB_GAME_SHELL_LIMITS.maximumMessageLength : LOOPLAB_GAME_SHELL_LIMITS.maximumLabelLength;
    if (typeof input.labels?.[key] === "string" && input.labels[key].trim().length > maximum) addIssue(issues, "error", "game-shell-label-long", `gameShell.labels.${key} may contain at most ${maximum} characters.`, { path: `gameShell.labels.${key}` });
  }

  const shell = normalizeGameShell(input, { projectName: project?.name });
  if (!shell.enabled && !shell.waiver?.reason) addIssue(issues, strict ? "error" : "warning", "game-shell-waiver-missing", "A disabled standard game shell requires an explicit non-empty ship waiver reason.", { path: "gameShell.waiver.reason" });
  if (shell.enabled && shell.status !== "approved") addIssue(issues, strict ? "error" : "warning", "game-shell-draft", "The standard game shell is still draft and has not been approved for shipping.", { path: "gameShell.status" });
  if (shell.enabled && shell.startMode === "play") addIssue(issues, "warning", "game-shell-title-skipped", "The shell starts directly in play, so the authored title surface is skipped.", { path: "gameShell.startMode" });
  if (shell.settings.enabled && !shell.settings.audio && !shell.settings.reducedMotion && !shell.settings.touchControlSize) addIssue(issues, "warning", "game-shell-settings-empty", "Game-shell settings are enabled but expose no controls.", { path: "gameShell.settings" });
  if (shell.terminal.lose.enabled && shell.terminal.lose.source === "none") addIssue(issues, "error", "game-shell-loss-unbound", "The loss surface is enabled without an authored deterministic loss source.", { path: "gameShell.terminal.lose.source" });
  if (shell.terminal.lose.source === "boolean-variable") {
    const variable = (project?.gameplayProgram?.variables ?? []).find((candidate) => candidate?.id === shell.terminal.lose.variableId);
    if (!STABLE_ID.test(shell.terminal.lose.variableId ?? "")) addIssue(issues, "error", "game-shell-loss-variable-id", "Boolean-variable loss requires a stable variableId.", { path: "gameShell.terminal.lose.variableId" });
    else if (!variable) addIssue(issues, "error", "game-shell-loss-variable-missing", `Loss variable ${shell.terminal.lose.variableId} does not exist in the gameplay program.`, { variableId: shell.terminal.lose.variableId });
    else if (variable.type !== "boolean") addIssue(issues, "error", "game-shell-loss-variable-type", `Loss variable ${shell.terminal.lose.variableId} must be boolean.`, { variableId: shell.terminal.lose.variableId });
  }
  if (shell.terminal.lose.source === "player-health-depleted" && !playerHealthLossAvailable(project)) addIssue(issues, "error", "game-shell-player-loss-unavailable", "Player-health-depleted loss requires a non-respawning authored combat actor for a player object.", { path: "gameShell.terminal.lose.source" });

  const errors = issues.filter((issue) => issue.severity === "error").map((issue) => issue.message);
  const warnings = issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message);
  const waived = shell.enabled === false && Boolean(shell.waiver?.reason);
  return {
    schemaVersion: LOOPLAB_GAME_SHELL_REPORT_SCHEMA,
    shellSchemaVersion: LOOPLAB_GAME_SHELL_SCHEMA,
    present: true,
    valid: errors.length === 0,
    shipReady: errors.length === 0 && (waived || (shell.enabled && shell.status === "approved")),
    status: errors.length ? "invalid" : waived ? "waived" : warnings.length ? "review" : shell.status,
    sourceDigest,
    shell,
    metrics: {
      stateCount: shell.enabled ? LOOPLAB_GAME_SHELL_POLICY.states.length : 0,
      settingsControlCount: shell.settings.enabled ? [shell.settings.audio, shell.settings.reducedMotion, shell.settings.touchControlSize].filter(Boolean).length : 0,
      terminalCount: [shell.terminal.win.enabled, shell.terminal.lose.enabled].filter(Boolean).length,
    },
    errors,
    warnings,
    issues,
    proofBoundary: LOOPLAB_GAME_SHELL_POLICY.judgmentBoundary,
  };
}

export function suggestGameShell(project, options = {}) {
  const presentationVolume = Number(project?.presentationProgram?.audio?.masterVolume);
  const playerLoss = playerHealthLossAvailable(project);
  const shell = normalizeGameShell({
    status: options.status === "approved" ? "approved" : "draft",
    enabled: true,
    startMode: "title",
    restartMode: "play",
    labels: {
      gameTitle: project?.name,
      tagline: clean(project?.designBrief?.userPrompt) || clean(project?.designBrief?.coreLoop) || "A LoopLab game",
    },
    settings: {
      enabled: true,
      audio: project?.presentationProgram?.audio?.enabled !== false,
      reducedMotion: true,
      touchControlSize: true,
      defaultMuted: false,
      defaultVolume: Number.isFinite(presentationVolume) ? presentationVolume : 0.55,
      defaultReducedMotion: "system",
      defaultTouchControlSize: 52,
    },
    terminal: {
      win: { enabled: true, source: "runtime-won" },
      lose: { enabled: playerLoss, source: playerLoss ? "player-health-depleted" : "none", expected: true },
    },
  }, { projectName: project?.name });
  return {
    schemaVersion: "looplab-game-shell-suggestion/v1",
    provider: "none",
    sourceDigest: options.sourceDigest ?? null,
    shell,
    report: inspectGameShell(project, shell, { sourceDigest: options.sourceDigest, strict: options.status === "approved" }),
    decisionBoundary: LOOPLAB_GAME_SHELL_POLICY.judgmentBoundary,
  };
}

// Deliberately self-contained: one-file exports embed this factory with toString().
export function createGameShellRuntime(inputShell, options = {}) {
  const shell = inputShell && typeof inputShell === "object" ? inputShell : null;
  const enabled = shell?.enabled === true;
  const host = options.host || (typeof globalThis !== "undefined" ? globalThis : {});
  const media = host.matchMedia?.("(prefers-reduced-motion: reduce)") || null;
  const settings = shell?.settings || {};
  const terminal = shell?.terminal || { win: { enabled: true }, lose: { enabled: false, source: "none" } };
  let state = enabled && shell.startMode !== "play" ? "title" : "playing";
  let pauseCause = null;
  let settingsOpen = false;
  let revision = 0;
  let terminalReason = null;
  let systemReducedMotion = media?.matches === true;
  let reducedMotionMode = settings.defaultReducedMotion === "reduce" || settings.defaultReducedMotion === "full" ? settings.defaultReducedMotion : "system";
  let muted = settings.defaultMuted === true;
  let volume = Math.max(0, Math.min(1, Number.isFinite(Number(settings.defaultVolume)) ? Number(settings.defaultVolume) : 0.55));
  let touchControlSize = Math.max(44, Math.min(80, Math.round(Number(settings.defaultTouchControlSize) || 52)));
  let destroyed = false;

  function safe(callback, ...args) { try { return typeof callback === "function" ? callback(...args) : undefined; } catch { return undefined; } }
  function effectiveReducedMotion() { return reducedMotionMode === "reduce" || (reducedMotionMode === "system" && systemReducedMotion); }
  function blocked() { return enabled && (state !== "playing" || settingsOpen); }
  function snapshot() {
    return {
      schemaVersion: "looplab-game-shell-state/v1",
      enabled,
      state,
      pauseCause,
      settingsOpen,
      simulationBlocked: blocked(),
      terminalReason,
      revision,
      preferences: { muted, volume, reducedMotion: reducedMotionMode, effectiveReducedMotion: effectiveReducedMotion(), touchControlSize },
    };
  }
  function notify() { const value = snapshot(); safe(options.onChange, value); return value; }
  function releaseAndSuspend() { safe(options.releaseInputs); safe(options.suspendPresentation); }
  function resumePresentation() { safe(options.resumePresentation); }
  function applyPreferences() { safe(options.setMuted, muted); safe(options.setVolume, volume); safe(options.setReducedMotion, effectiveReducedMotion()); safe(options.setTouchControlSize, touchControlSize); }
  function change(nextState, cause = null, reason = null) {
    if (destroyed || !enabled) return snapshot();
    if (state === nextState && pauseCause === cause && terminalReason === reason) return snapshot();
    state = nextState; pauseCause = cause; terminalReason = reason; settingsOpen = false; revision += 1;
    if (state === "playing") resumePresentation(); else releaseAndSuspend();
    safe(options.focusTarget, state);
    return notify();
  }
  function start() { return change("playing", null, null); }
  function pause(cause = "user") { return state === "playing" ? change("paused", cause || "user", null) : snapshot(); }
  function resume() { return state === "paused" ? change("playing", null, null) : snapshot(); }
  function restart() {
    if (destroyed) return snapshot();
    safe(options.releaseInputs); safe(options.resetSimulation); safe(options.resetPresentation);
    state = enabled && shell.restartMode === "title" ? "title" : "playing";
    pauseCause = null; settingsOpen = false; terminalReason = null; revision += 1;
    if (state === "playing") resumePresentation(); else safe(options.suspendPresentation);
    safe(options.focusTarget, state); return notify();
  }
  function openSettings() {
    if (!enabled || settings.enabled === false || settingsOpen || destroyed) return snapshot();
    settingsOpen = true; revision += 1; releaseAndSuspend(); safe(options.openSettingsDialog); return notify();
  }
  function closeSettings() {
    if (!settingsOpen || destroyed) return snapshot();
    settingsOpen = false; revision += 1; safe(options.closeSettingsDialog);
    if (state === "playing") resumePresentation();
    safe(options.focusTarget, state); return notify();
  }
  function handleVisibility(hidden) { return hidden === true && state === "playing" ? pause("visibility") : snapshot(); }
  function handleBlur() { return state === "playing" ? pause("blur") : snapshot(); }
  function lossReached() {
    const loss = terminal.lose || {};
    if (loss.enabled !== true || loss.source === "none") return false;
    if (loss.source === "boolean-variable") return Boolean(safe(options.getGameplayState)?.variables?.[loss.variableId]) === (loss.expected !== false);
    if (loss.source === "player-health-depleted") {
      const playerId = safe(options.getGameState)?.player?.id;
      return Boolean(playerId && (safe(options.getCombatState)?.health || []).some(function (entry) { return entry?.objectId === playerId && entry?.depleted === true; }));
    }
    return false;
  }
  function sync() {
    if (!enabled || destroyed || state === "won" || state === "lost") return snapshot();
    const gameState = safe(options.getGameState) || {};
    if (terminal.win?.enabled !== false && gameState.won === true) return change("won", null, "runtime-won");
    if (lossReached()) return change("lost", null, terminal.lose?.source || "loss");
    return snapshot();
  }
  function setMuted(next) { muted = next !== false; revision += 1; safe(options.setMuted, muted); return notify(); }
  function setVolume(next) { volume = Math.max(0, Math.min(1, Number(next) || 0)); revision += 1; safe(options.setVolume, volume); return notify(); }
  function setReducedMotion(next) { reducedMotionMode = next === "system" ? "system" : next === true || next === "reduce" ? "reduce" : "full"; revision += 1; safe(options.setReducedMotion, effectiveReducedMotion()); return notify(); }
  function setTouchControlSize(next) { touchControlSize = Math.max(44, Math.min(80, Math.round(Number(next) || 52))); revision += 1; safe(options.setTouchControlSize, touchControlSize); return notify(); }
  function onMediaChange(event) { systemReducedMotion = event?.matches === true; if (reducedMotionMode === "system") { revision += 1; safe(options.setReducedMotion, effectiveReducedMotion()); notify(); } }
  media?.addEventListener?.("change", onMediaChange);
  applyPreferences();
  if (blocked()) releaseAndSuspend();
  function destroy() { if (destroyed) return; destroyed = true; media?.removeEventListener?.("change", onMediaChange); releaseAndSuspend(); }
  return { getState: snapshot, start, pause, resume, restart, openSettings, closeSettings, handleVisibility, handleBlur, sync, setMuted, setVolume, setReducedMotion, setTouchControlSize, destroy };
}
