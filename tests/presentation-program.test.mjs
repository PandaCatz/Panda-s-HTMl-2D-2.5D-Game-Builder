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
import { LOOPLAB_AUDIO_DECODE_SAMPLE_RATE, analyzeEmbeddedAudioBytes, inspectEmbeddedAudioResource } from "../lib/looplab-audio-resources.mjs";

function platformer() {
  return structuredClone(createTemplate("platformer"));
}

function tinyWaveResource(id = "audio-confirm") {
  const frameCount = 8;
  const channels = 1;
  const sampleRate = 8_000;
  const bitsPerSample = 16;
  const dataBytes = frameCount * channels * bitsPerSample / 8;
  const bytes = Buffer.alloc(44 + dataBytes);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(36 + dataBytes, 4);
  bytes.write("WAVEfmt ", 8, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(channels, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28);
  bytes.writeUInt16LE(channels * bitsPerSample / 8, 32);
  bytes.writeUInt16LE(bitsPerSample, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(dataBytes, 40);
  return {
    id,
    name: `${id}.wav`,
    kind: "audio",
    mimeType: "audio/wav",
    dataUrl: `data:audio/wav;base64,${bytes.toString("base64")}`,
    bytes: bytes.length,
    _bytes: bytes,
  };
}

function sampleProgram(resourceId = "audio-confirm") {
  return {
    version: 1,
    status: "approved",
    enabled: true,
    reducedMotion: "respect",
    audio: {
      enabled: true,
      masterVolume: 0.5,
      maxVoices: 4,
      debounceMs: 0,
      cues: [{
        id: "confirm-sample",
        event: "choice.selected",
        enabled: true,
        kind: "sample",
        waveform: "sine",
        frequency: 220,
        endFrequency: 220,
        filterFrequency: 800,
        durationMs: 250,
        attackMs: 4,
        releaseMs: 40,
        volume: 0.2,
        pitchVariationCents: 0,
        resourceId,
        playbackRate: 1,
      }],
    },
    motion: { enabled: false, maxParticles: 0, cues: [] },
  };
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

  assert.equal(manifest.protocolVersion, "1.103.0");
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
  assert.ok(projectSchema.$defs.presentationAudioCue.properties.kind.enum.includes("sample"));
  assert.equal(projectSchema.properties.resources.items.$ref, "#/$defs/embeddedResource");
  assert.equal(projectSchema.$defs.presentationMotionCue.properties.effects.maxItems, 6);
  assert.equal(manifest.presentationRules.embeddedAudio.cueKind, "sample");
  assert.equal(manifest.presentationRules.embeddedAudio.resourceCollection, "project.resources");
  assert.equal(manifest.presentationRules.embeddedAudio.limits.maximumDecodedBytes, 32 * 1024 * 1024);
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
      this.sampleRate = LOOPLAB_AUDIO_DECODE_SAMPLE_RATE;
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

test("sample cues bind only exact embedded audio resources and report encoded plus decoded cost", () => {
  const project = platformer();
  const resource = tinyWaveResource();
  project.resources = [{ ...resource, _bytes: undefined }];
  project.presentationProgram = sampleProgram(resource.id);

  const byteAnalysis = analyzeEmbeddedAudioBytes(resource._bytes, resource.mimeType);
  assert.deepEqual({
    format: byteAnalysis.format,
    channels: byteAnalysis.channels,
    sampleRate: byteAnalysis.sampleRate,
    frameCount: byteAnalysis.frameCount,
    sourceDecodedMemoryBytes: byteAnalysis.sourceDecodedMemoryBytes,
    decodedSampleRate: byteAnalysis.decodedSampleRate,
    decodedFrameCount: byteAnalysis.decodedFrameCount,
    decodedMemoryBytes: byteAnalysis.decodedMemoryBytes,
  }, {
    format: "wav-pcm",
    channels: 1,
    sampleRate: 8_000,
    frameCount: 8,
    sourceDecodedMemoryBytes: 32,
    decodedSampleRate: LOOPLAB_AUDIO_DECODE_SAMPLE_RATE,
    decodedFrameCount: 48,
    decodedMemoryBytes: 192,
  });
  assert.equal(inspectEmbeddedAudioResource(project.resources[0]).ok, true);

  const report = inspectPresentationProgram(project);
  assert.deepEqual(report.errors, []);
  assert.equal(report.metrics.referencedAudioResourceCount, 1);
  assert.equal(report.metrics.encodedAudioBytes, resource.bytes);
  assert.equal(report.metrics.decodedAudioBytes, 192);
  assert.equal(report.audioResources.valid, true);

  const exportProject = platformer();
  exportProject.resources = [{ ...resource, _bytes: undefined }];
  exportProject.presentationProgram.audio.cues.push(sampleProgram(resource.id).audio.cues[0]);
  const html = buildStandaloneHtml(exportProject);
  assert.ok(html.includes(resource.id));
  assert.ok(html.includes("resources:project.resources||[]"));
  assert.ok(html.includes("decodeAudioData"));
});

test("sample cues are Doctor-blocked when an embedded resource is missing or not audio", () => {
  const missing = platformer();
  missing.presentationProgram = sampleProgram("audio-missing");
  const missingReport = inspectPresentationProgram(missing);
  assert.ok(missingReport.errors.some((message) => /not embedded/i.test(message)));
  assert.throws(() => applyAgentCommand(missing, { op: "set_presentation_program", program: missing.presentationProgram }), /not embedded/i);

  const wrongKind = platformer();
  const resource = tinyWaveResource();
  wrongKind.resources = [{ ...resource, kind: "document", _bytes: undefined }];
  wrongKind.presentationProgram = sampleProgram(resource.id);
  const wrongKindDoctor = analyzeProject(wrongKind);
  assert.ok(wrongKindDoctor.issues.some((issue) => issue.code === "presentation-audio-resource-invalid"));
});

test("embedded samples decode lazily after unlock and resource failures stay isolated from gameplay", async () => {
  const resource = tinyWaveResource();
  const started = [];
  const contextOptions = [];
  const audioParam = () => ({ setValueAtTime() {}, cancelScheduledValues() {}, exponentialRampToValueAtTime() {} });
  class SampleAudioContext {
    constructor(options) {
      contextOptions.push(options);
      this.state = "suspended";
      this.currentTime = 0;
      this.destination = {};
      this.sampleRate = options.sampleRate;
    }
    createGain() { return { gain: audioParam(), connect() {} }; }
    createDynamicsCompressor() { return { threshold: audioParam(), knee: audioParam(), ratio: audioParam(), attack: audioParam(), release: audioParam(), connect() {} }; }
    createBufferSource() {
      return { playbackRate: audioParam(), detune: audioParam(), connect() {}, start() { started.push("sample"); }, stop() {} };
    }
    decodeAudioData() { return Promise.resolve({ duration: 0.001, length: 48, numberOfChannels: 1 }); }
    async resume() { this.state = "running"; }
    async suspend() { this.state = "suspended"; }
    close() {}
  }
  const runtime = createPresentationRuntime(sampleProgram(resource.id), {
    host: { AudioContext: SampleAudioContext, atob: globalThis.atob },
    resources: [{ ...resource, _bytes: undefined }],
    performance: { now: () => 100 },
  });
  runtime.handleEvents([{ type: "choice.selected" }]);
  assert.equal(runtime.getStatus().audio.pendingEvents, 1);
  await runtime.unlock();
  await new Promise((resolve) => setImmediate(resolve));
  const status = runtime.getStatus();
  assert.equal(status.audio.state, "running");
  assert.equal(status.audio.decodeSampleRate, LOOPLAB_AUDIO_DECODE_SAMPLE_RATE);
  assert.equal(status.audio.decodedResourceCount, 1);
  assert.equal(status.audio.decodedBytes, 192);
  assert.equal(status.audio.triggeredCueCount, 1);
  assert.deepEqual(contextOptions[0], { latencyHint: "interactive", sampleRate: LOOPLAB_AUDIO_DECODE_SAMPLE_RATE });
  assert.deepEqual(started, ["sample"]);

  class RejectingDecodeContext extends SampleAudioContext {
    decodeAudioData() { return Promise.reject(new Error("hostile decode")); }
  }
  const hostile = createPresentationRuntime(sampleProgram(resource.id), {
    host: { AudioContext: RejectingDecodeContext, atob: globalThis.atob },
    resources: [{ ...resource, _bytes: undefined }],
    performance: { now: () => 100 },
  });
  hostile.handleEvents([{ type: "choice.selected" }]);
  await hostile.unlock();
  await new Promise((resolve) => setImmediate(resolve));
  const hostileStatus = hostile.getStatus();
  assert.equal(hostileStatus.audio.state, "running");
  assert.match(hostileStatus.audio.resourceErrors[resource.id], /hostile decode/i);
  assert.equal(hostileStatus.audio.triggeredCueCount, 0);
  assert.equal(hostileStatus.handledEventCount, 1);
  assert.equal(hostileStatus.simulationIndependent, true);
});
