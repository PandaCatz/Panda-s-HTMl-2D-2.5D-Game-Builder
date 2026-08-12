import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyAgentCommand,
  buildStandaloneHtml,
  buildStandaloneRuntimePrelude,
  createTemplate,
  getAgentManifest,
} from "../lib/looplab-agent-core.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import {
  LOOPLAB_PRESENTATION_PROGRAM_SCHEMA,
  LOOPLAB_PRESENTATION_REPORT_SCHEMA,
  createPresentationRuntime,
  inspectPresentationProgram,
  suggestPresentationProgram,
} from "../lib/looplab-presentation.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";

function platformer() {
  return structuredClone(createTemplate("platformer"));
}

test("provider-free presentation suggestions are bounded, source-aware, and explicit about judgment", () => {
  const project = platformer();
  const suggestion = suggestPresentationProgram(project, { sourceDigest: "source-test" });

  assert.equal(suggestion.provider, "none");
  assert.equal(suggestion.sourceDigest, "source-test");
  assert.equal(suggestion.program.version, 1);
  assert.ok(suggestion.program.audio.cues.some((cue) => cue.event === "player.jumped"));
  assert.ok(suggestion.program.motion.cues.some((cue) => cue.event === "player.landed"));
  assert.equal(suggestion.report.schemaVersion, LOOPLAB_PRESENTATION_REPORT_SCHEMA);
  assert.equal(suggestion.report.programSchemaVersion, LOOPLAB_PRESENTATION_PROGRAM_SCHEMA);
  assert.deepEqual(suggestion.report.errors, []);
  assert.match(suggestion.decisionBoundary, /do not prove|does not prove/i);
});

test("provider-free suggestions do not infer platformer verbs merely because a game has a player", () => {
  const topdown = suggestPresentationProgram(createTemplate("topdown")).program;
  const systems = suggestPresentationProgram(createTemplate("systems")).program;

  assert.equal(topdown.audio.cues.some((cue) => ["player.jumped", "player.landed"].includes(cue.event)), false);
  assert.ok(topdown.audio.cues.some((cue) => cue.event === "coin.collected"));
  assert.equal(systems.audio.cues.some((cue) => ["player.jumped", "player.landed"].includes(cue.event)), false);
  assert.ok(systems.audio.cues.some((cue) => cue.event === "choice.selected"));
});

test("combat projects receive renderer-neutral hit and depletion feedback suggestions", () => {
  const project = createTemplate("topdown");
  project.combatProgram = {
    schemaVersion: "looplab-combat-program/v1",
    enabled: true,
    maxProjectiles: 8,
    teams: [{ id: "a", targetTeamIds: ["b"] }, { id: "b", targetTeamIds: ["a"] }],
    actors: [{ id: "target", mapId: project.maps[0].id, objectId: "goal", teamId: "b", maxHp: 3, initialHp: 3, invulnerabilityTicks: 0, deathBehavior: "hide" }],
    emitters: [{ id: "shot", mapId: project.maps[0].id, ownerObjectId: "player", teamId: "a", trigger: "pressed", actionId: "interact", cooldownTicks: 8, poolSize: 4, muzzle: { offsetX: 0, offsetY: 0, distance: 8 }, aim: { mode: "nearest", x: 1, y: 0, range: 500 }, projectile: { speed: 500, width: 6, height: 6, zHeight: 1, lifetimeTicks: 60, damage: 1, pierce: 0, worldCollision: true } }],
    acceptanceTestIds: [],
  };
  const suggestion = suggestPresentationProgram(project);
  assert.ok(suggestion.program.audio.cues.some((cue) => cue.event === "projectile.hit"));
  assert.ok(suggestion.program.motion.cues.some((cue) => cue.event === "health.depleted"));
  assert.equal(suggestion.report.issues.some((issue) => issue.code === "presentation-event-unresolved"), false);
});

test("actor projects receive renderer-neutral perception and arrival feedback suggestions", () => {
  const project = createTemplate("topdown");
  project.actorProgram = {
    schemaVersion: "looplab-actor-program/v1",
    enabled: true,
    actors: [{ id: "guard" }],
    acceptanceTestIds: [],
  };
  const suggestion = suggestPresentationProgram(project);
  assert.ok(suggestion.program.audio.cues.some((cue) => cue.event === "actor.detected"));
  assert.ok(suggestion.program.audio.cues.some((cue) => cue.event === "actor.arrived"));
  assert.ok(suggestion.program.motion.cues.some((cue) => cue.event === "actor.blocked"));
  assert.equal(suggestion.report.issues.some((issue) => issue.code === "presentation-event-unresolved"), false);
});

test("manifest and public project schema make presentation authoring discoverable to any agent", () => {
  const manifest = getAgentManifest();
  const projectSchema = JSON.parse(readFileSync(new URL("../public/project-schema.json", import.meta.url), "utf8"));

  assert.equal(manifest.protocolVersion, "1.99.0");
  assert.deepEqual(manifest.presentationRules.schemas, {
    program: LOOPLAB_PRESENTATION_PROGRAM_SCHEMA,
    report: LOOPLAB_PRESENTATION_REPORT_SCHEMA,
  });
  for (const operation of ["get_presentation_program", "get_presentation_report", "suggest_presentation_program", "set_presentation_program", "remove_presentation_program"]) {
    assert.ok(manifest.presentationRules.commands.includes(operation));
    assert.ok(manifest.commands.includes(operation));
  }
  assert.deepEqual(manifest.presentationRules.runtimeCommands, ["get_presentation_program", "get_presentation_report", "get_presentation_status", "set_audio_muted"]);
  assert.equal(projectSchema.properties.presentationProgram.$ref, "#/$defs/presentationProgram");
  assert.equal(projectSchema.properties.qualityContracts.properties.presentationProgramRequired.type, "boolean");
  assert.equal(projectSchema.$defs.presentationProgram.additionalProperties, false);
  assert.equal(projectSchema.$defs.presentationAudioCue.additionalProperties, false);
  assert.equal(projectSchema.$defs.presentationMotionCue.properties.effects.maxItems, 6);
});

test("presentation programs reject unknown structure before normalization can hide it", () => {
  const project = platformer();
  const invalid = structuredClone(project.presentationProgram);
  invalid.audio.secretNetworkLoader = true;

  const report = inspectPresentationProgram(project, invalid);
  assert.ok(report.errors.some((message) => /secretNetworkLoader.*not an allowed/i.test(message)));
  assert.throws(
    () => applyAgentCommand(project, { op: "set_presentation_program", program: invalid }),
    /Presentation program is invalid.*secretNetworkLoader/i,
  );
});

test("canonical commands suggest, set, inspect, report, and remove the same presentation source", () => {
  const base = platformer();
  delete base.presentationProgram;
  const suggestion = applyAgentCommand(base, { op: "suggest_presentation_program", status: "approved" });

  assert.equal(suggestion.changed, false);
  assert.equal(suggestion.result.provider, "none");
  assert.equal(suggestion.result.program.status, "approved");

  const stored = applyAgentCommand(base, { op: "set_presentation_program", program: suggestion.result.program });
  assert.equal(stored.changed, true);
  assert.equal(stored.result.report.present, true);
  assert.equal(stored.result.report.sourceDigest, analyzeProject(stored.project).sourceDigest);

  const inspected = applyAgentCommand(stored.project, { op: "get_presentation_program" });
  const doctorReport = applyAgentCommand(stored.project, { op: "get_presentation_report" });
  assert.deepEqual(inspected.result.program, stored.project.presentationProgram);
  assert.equal(doctorReport.result.schemaVersion, LOOPLAB_PRESENTATION_REPORT_SCHEMA);

  const removed = applyAgentCommand(stored.project, { op: "remove_presentation_program" });
  assert.equal(removed.changed, true);
  assert.equal("presentationProgram" in removed.project, false);
});

test("Project Doctor makes an explicitly required presentation program a real gate", () => {
  const project = platformer();
  project.qualityContracts = { ...(project.qualityContracts ?? {}), presentationProgramRequired: true };
  delete project.presentationProgram;

  const doctor = analyzeProject(project);
  assert.equal(doctor.presentationReport.status, "missing");
  assert.ok(doctor.issues.some((issue) => issue.code === "presentation-program-missing"));
});

test("the presentation controller isolates unavailable and hostile Web Audio implementations", async () => {
  const program = suggestPresentationProgram(platformer()).program;
  const unavailable = createPresentationRuntime(program, { host: {}, performance: { now: () => 100 } });
  unavailable.handleEvents([{ type: "player.jumped", objectId: "player" }]);
  const unavailableStatus = await unavailable.unlock();
  assert.equal(unavailableStatus.audio.state, "unavailable");
  assert.equal(unavailableStatus.simulationIndependent, true);

  class HostileAudioContext {
    constructor() {
      this.state = "suspended";
      this.currentTime = 0;
    }
    async resume() {
      this.state = "running";
    }
  }
  const hostile = createPresentationRuntime(program, {
    host: { AudioContext: HostileAudioContext },
    performance: { now: () => 100 },
  });
  hostile.handleEvents([{ type: "player.jumped", objectId: "player" }]);
  const hostileStatus = await hostile.unlock();
  assert.equal(hostileStatus.audio.state, "failed");
  assert.match(hostileStatus.audio.error, /gain nodes are unavailable/i);
  assert.equal(hostileStatus.handledEventCount, 1);
});

test("reduced motion skips particles, shake, and squash while retaining a static flash", () => {
  const program = {
    version: 1,
    status: "approved",
    enabled: true,
    reducedMotion: "always-reduce",
    audio: { enabled: false, masterVolume: 0, maxVoices: 1, debounceMs: 0, cues: [] },
    motion: {
      enabled: true,
      maxParticles: 20,
      cues: [{
        id: "land-accessible",
        event: "player.landed",
        enabled: true,
        target: "event-object",
        effects: [
          { type: "particles", count: 8, color: "#ddd", secondaryColor: "#888", speed: 100, spread: 2, direction: 0, lifetimeMs: 200, size: 2, gravity: 0 },
          { type: "shake", intensity: 4, durationMs: 100 },
          { type: "squash", scaleX: 1.1, scaleY: 0.9, durationMs: 100 },
          { type: "flash", color: "#ddd", opacity: 0.1, durationMs: 100 },
        ],
      }],
    },
  };
  const controller = createPresentationRuntime(program, {
    host: {},
    getPoint: () => ({ x: 20, y: 30, objectId: "player" }),
  });

  controller.handleEvents([{ type: "player.landed", objectId: "player" }]);
  const status = controller.getStatus();
  assert.equal(status.motion.reducedMotion, true);
  assert.equal(status.motion.activeParticles, 0);
  assert.equal(status.motion.activeSquashes, 0);
  assert.equal(status.motion.shakeActive, false);
  assert.equal(status.motion.flashActive, true);
  assert.equal(status.motion.skippedReducedMotionCount, 3);
});

test("the standard shell can override presentation volume and reduced motion without touching simulation", () => {
  const program = suggestPresentationProgram(platformer()).program;
  const controller = createPresentationRuntime(program, {
    host: { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) },
  });
  const volume = controller.setMasterVolume(0.25);
  assert.equal(volume.audio.masterVolume, 0.25);
  const reduced = controller.setReducedMotion(true);
  assert.equal(reduced.motion.reducedMotion, true);
  assert.equal(reduced.motion.reducedMotionSource, "shell-override");
  const restored = controller.setReducedMotion(null);
  assert.equal(restored.motion.reducedMotion, false);
  assert.equal(restored.motion.reducedMotionSource, "system");
  assert.equal(restored.simulationIndependent, true);
});

test("presentation stays outside deterministic simulation and is literally embedded in one-file exports", () => {
  const withPresentation = platformer();
  const withoutPresentation = structuredClone(withPresentation);
  delete withoutPresentation.presentationProgram;
  const decoratedRuntime = createRuntimeModel(withPresentation);
  const plainRuntime = createRuntimeModel(withoutPresentation);

  for (const runtime of [decoratedRuntime, plainRuntime]) {
    runtime.setInput("right", true);
    runtime.setInput("jump", true);
    for (let tick = 0; tick < 30; tick += 1) runtime.update(1 / 60);
  }
  assert.deepEqual(decoratedRuntime.getState(), plainRuntime.getState());

  const prelude = buildStandaloneRuntimePrelude();
  const isolated = new Function(`"use strict"; ${prelude}\nreturn createPresentationRuntime;`)();
  assert.equal(typeof isolated, "function");

  const html = buildStandaloneHtml(withPresentation);
  assert.ok(html.includes(`const createPresentationRuntime=${createPresentationRuntime.toString()};`));
  assert.ok(html.includes('id="looplab-project-data"'));
  assert.ok(html.includes('"presentationProgram"'));
  assert.match(html, /get_presentation_status/);
  assert.match(html, /set_audio_muted/);
});
