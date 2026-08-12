import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAgentCommand,
  buildStandaloneHtml,
  createTemplate,
  getAgentManifest,
  summarizeProject,
} from "../lib/looplab-agent-core.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import {
  createGameShellRuntime,
  inspectGameShell,
  LOOPLAB_GAME_SHELL_SCHEMA,
  normalizeGameShell,
  suggestGameShell,
} from "../lib/looplab-game-shell.mjs";

test("new foundations receive one approved renderer-neutral standard shell", () => {
  const project = createTemplate("topdown");
  const report = inspectGameShell(project, project.gameShell, { strict: true });
  assert.equal(project.gameShell.schemaVersion, LOOPLAB_GAME_SHELL_SCHEMA);
  assert.equal(project.gameShell.status, "approved");
  assert.equal(project.gameShell.startMode, "title");
  assert.equal(report.valid, true);
  assert.equal(report.shipReady, true);
  assert.deepEqual(report.metrics, { stateCount: 5, settingsControlCount: 3, terminalCount: 1 });
  assert.equal(summarizeProject(project).gameShell.status, "approved");
});

test("Codex and Claude share canonical game-shell commands and strict mutation validation", () => {
  const project = createTemplate("platformer");
  const manifest = getAgentManifest();
  for (const op of ["get_game_shell", "get_game_shell_report", "suggest_game_shell", "set_game_shell", "remove_game_shell"]) {
    assert.ok(manifest.commandSurfaces.core.includes(op), `${op} must be in the shared core surface`);
    assert.ok(manifest.commandSurfaces.browserSession.includes(op), `${op} must be in the browser surface`);
  }

  const suggestion = applyAgentCommand(project, { op: "suggest_game_shell", status: "draft" }).result;
  assert.equal(suggestion.provider, "none");
  assert.equal(suggestion.shell.status, "draft");

  const approved = { ...suggestion.shell, status: "approved", labels: { ...suggestion.shell.labels, gameTitle: "Bounded Shell Test" } };
  const saved = applyAgentCommand(project, { op: "set_game_shell", shell: approved });
  assert.equal(saved.changed, true);
  assert.equal(saved.project.gameShell.labels.gameTitle, "Bounded Shell Test");
  assert.equal(saved.result.report.shipReady, true);

  assert.throws(() => applyAgentCommand(saved.project, {
    op: "set_game_shell",
    shell: { ...approved, terminal: { ...approved.terminal, lose: { enabled: true, source: "boolean-variable", variableId: "missing-loss", expected: true } } },
  }), /Loss variable missing-loss does not exist/);

  const removed = applyAgentCommand(saved.project, { op: "remove_game_shell" });
  assert.equal(removed.changed, true);
  assert.equal(removed.project.gameShell, undefined);
});

test("Project Doctor requires a standard shell for production or an explicit waiver", () => {
  const missing = createTemplate("topdown");
  missing.doctorProfile = "production";
  delete missing.gameShell;
  const missingReport = analyzeProject(missing, { profile: "production" });
  assert.ok(missingReport.issues.some((issue) => issue.code === "game-shell-missing" && issue.severity === "error"));

  const waived = createTemplate("topdown");
  waived.doctorProfile = "production";
  waived.gameShell = normalizeGameShell({ enabled: false, status: "approved", waiver: { reason: "A deliberately kiosk-like embedded installation owns its surrounding shell." } }, { projectName: waived.name });
  const waivedReport = analyzeProject(waived, { profile: "production" });
  assert.equal(waivedReport.gameShellReport.status, "waived");
  assert.equal(waivedReport.gameShellReport.shipReady, true);
  assert.equal(waivedReport.issues.some((issue) => issue.category === "game-shell"), false);
});

test("the runtime shell gates simulation without becoming deterministic game state", () => {
  const project = createTemplate("topdown");
  const shell = suggestGameShell(project, { status: "approved" }).shell;
  let gameState = { won: false, player: { id: "player" } };
  let gameplayState = { variables: { defeated: false } };
  let releases = 0;
  let suspends = 0;
  let resumes = 0;
  let resets = 0;
  const preferences = [];
  const runtime = createGameShellRuntime(shell, {
    host: { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) },
    getGameState: () => gameState,
    getGameplayState: () => gameplayState,
    getCombatState: () => ({ health: [] }),
    releaseInputs: () => { releases += 1; },
    suspendPresentation: () => { suspends += 1; },
    resumePresentation: () => { resumes += 1; },
    resetSimulation: () => { resets += 1; gameState = { won: false, player: { id: "player" } }; },
    setMuted: (value) => preferences.push(["muted", value]),
    setVolume: (value) => preferences.push(["volume", value]),
    setReducedMotion: (value) => preferences.push(["motion", value]),
    setTouchControlSize: (value) => preferences.push(["touch", value]),
  });

  assert.equal(runtime.getState().state, "title");
  assert.equal(runtime.getState().simulationBlocked, true);
  runtime.start();
  assert.equal(runtime.getState().state, "playing");
  assert.equal(runtime.getState().simulationBlocked, false);
  runtime.handleBlur();
  assert.deepEqual({ state: runtime.getState().state, cause: runtime.getState().pauseCause }, { state: "paused", cause: "blur" });
  runtime.handleVisibility(false);
  assert.equal(runtime.getState().state, "paused", "visibility restoration must never auto-resume");
  runtime.resume();
  runtime.openSettings();
  assert.equal(runtime.getState().simulationBlocked, true);
  runtime.closeSettings();
  assert.equal(runtime.getState().simulationBlocked, false);
  runtime.setMuted(true);
  runtime.setVolume(0.25);
  runtime.setReducedMotion("reduce");
  runtime.setTouchControlSize(64);
  assert.deepEqual(runtime.getState().preferences, { muted: true, volume: 0.25, reducedMotion: "reduce", effectiveReducedMotion: true, touchControlSize: 64 });
  gameState = { won: true, player: { id: "player" } };
  runtime.sync();
  assert.equal(runtime.getState().state, "won");
  runtime.restart();
  assert.equal(runtime.getState().state, "playing");
  assert.equal(resets, 1);
  assert.ok(releases >= 3);
  assert.ok(suspends >= 3);
  assert.ok(resumes >= 3);
  assert.ok(preferences.some(([kind, value]) => kind === "motion" && value === true));
});

test("boolean-variable loss is authored and deterministic", () => {
  const project = createTemplate("topdown");
  project.gameplayProgram = {
    schemaVersion: "looplab-gameplay-program/v1",
    version: 1,
    variables: [{ id: "defeated", type: "boolean", initial: false, label: "Defeated", visible: false }],
    clocks: [], rules: [], choicePages: [], hudBindings: [], initialChoicePageId: null,
  };
  const shell = normalizeGameShell({
    status: "approved",
    terminal: { win: { enabled: false }, lose: { enabled: true, source: "boolean-variable", variableId: "defeated", expected: true } },
  }, { projectName: project.name });
  assert.equal(inspectGameShell(project, shell, { strict: true }).valid, true);
  let defeated = false;
  const runtime = createGameShellRuntime(shell, {
    getGameState: () => ({ won: false, player: { id: "player" } }),
    getGameplayState: () => ({ variables: { defeated } }),
  });
  runtime.start();
  defeated = true;
  runtime.sync();
  assert.equal(runtime.getState().state, "lost");
  assert.equal(runtime.getState().terminalReason, "boolean-variable");
});

test("one-file exports contain a real shell and matching headless runtime operations", () => {
  const project = createTemplate("topdown");
  const html = buildStandaloneHtml(project);
  for (const marker of [
    'id="game-shell-layer"',
    'id="game-shell-settings-dialog"',
    "const createGameShellRuntime=",
    "getGameShellState",
    "command.op==='start_game'",
    "command.op==='restart'",
    "command.op==='set_master_volume'",
  ]) assert.ok(html.includes(marker), `export must contain ${marker}`);
  assert.ok(!html.includes("looplab-game-shell-preferences"), "game-shell preferences remain session-only and do not introduce a storage key");
});
