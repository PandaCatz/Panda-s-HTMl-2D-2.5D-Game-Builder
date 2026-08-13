import { inspectPresentationAudioResources } from "./looplab-audio-resources.mjs";

export const LOOPLAB_PRESENTATION_PROGRAM_SCHEMA = "looplab-presentation-program/v1";
export const LOOPLAB_PRESENTATION_REPORT_SCHEMA = "looplab-presentation-report/v1";

export const LOOPLAB_PRESENTATION_LIMITS = Object.freeze({
  maximumAudioCues: 32,
  maximumMotionCues: 32,
  maximumEffectsPerCue: 6,
  maximumVoices: 24,
  maximumParticles: 320,
  maximumPendingAudioEvents: 32,
  maximumCueDurationMs: 2_000,
});

export const LOOPLAB_PRESENTATION_POLICY = Object.freeze({
  sourceField: "presentationProgram",
  programSchemaVersion: LOOPLAB_PRESENTATION_PROGRAM_SCHEMA,
  reportSchemaVersion: LOOPLAB_PRESENTATION_REPORT_SCHEMA,
  simulationBoundary: "Presentation consumes immutable runtime events and never contributes state to simulation, collision, completion, acceptance, or replay hashes.",
  audioBoundary: "One lazily-created Web Audio context unlocks only after a real user gesture; failures are isolated from input and gameplay.",
  accessibilityBoundary: "Reduced-motion preference disables shake, particles, and squash while preserving static flash and DOM status equivalents.",
  rendererBoundary: "The authored program is renderer-neutral. Canvas and the pinned Phaser canvas hook consume the same controller; future adapters must preserve the same event semantics.",
  judgmentBoundary: "Schema validity and event coverage do not prove that sound design, visual rhythm, intensity, or game feel are aesthetically good. Preview and human or agent judgment remain required.",
});

export const LOOPLAB_CANONICAL_PRESENTATION_EVENTS = Object.freeze([
  "actor.arrived",
  "actor.blocked",
  "actor.detected",
  "actor.lost",
  "actor.mode-changed",
  "actor.node-reached",
  "choice.opened",
  "choice.closed",
  "choice.selected",
  "choice.rejected",
  "clock.advanced",
  "coin.collected",
  "gameplay.expression-fault",
  "gameplay.rule-fired",
  "goal.reached",
  "input.action",
  "map.changed",
  "motion-body.blocked",
  "motion-body.completed",
  "motion-body.crushed",
  "motion-body.released",
  "motion-body.reversed",
  "motion-body.started",
  "object.collected",
  "player.jumped",
  "player.landed",
  "player.respawned",
  "portal.entered",
  "projectile.expired",
  "projectile.hit",
  "projectile.overflow",
  "projectile.spawned",
  "health.changed",
  "health.depleted",
  "health.immune",
  "health.respawned",
  "traversal.bailed",
  "traversal.completed",
  "traversal.started",
]);

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const AUDIO_KINDS = new Set(["tone", "noise", "sample"]);
const WAVEFORMS = new Set(["sine", "square", "sawtooth", "triangle"]);
const MOTION_EFFECTS = new Set(["particles", "shake", "flash", "squash"]);
const TARGETS = new Set(["event-object", "player", "center"]);
const STATUS = new Set(["draft", "approved"]);
const REDUCED_MOTION = new Set(["respect", "always-reduce", "ignore"]);

const cleanString = (value) => typeof value === "string" ? value.trim() : "";
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum, fallback = minimum) => Math.max(minimum, Math.min(maximum, finite(value, fallback)));
const integer = (value, fallback, minimum, maximum) => Math.max(minimum, Math.min(maximum, Math.round(finite(value, fallback))));
const bool = (value, fallback) => typeof value === "boolean" ? value : fallback;

function normalizeAudioCue(cue = {}) {
  const kind = AUDIO_KINDS.has(cue.kind) ? cue.kind : "tone";
  return {
    id: cleanString(cue.id),
    event: cleanString(cue.event),
    enabled: bool(cue.enabled, true),
    kind,
    waveform: WAVEFORMS.has(cue.waveform) ? cue.waveform : "sine",
    frequency: clamp(cue.frequency, 40, 4_000, 220),
    endFrequency: clamp(cue.endFrequency ?? cue.frequency, 40, 4_000, 220),
    filterFrequency: clamp(cue.filterFrequency, 80, 12_000, 800),
    durationMs: integer(cue.durationMs, 140, 20, LOOPLAB_PRESENTATION_LIMITS.maximumCueDurationMs),
    attackMs: integer(cue.attackMs, 8, 1, 250),
    releaseMs: integer(cue.releaseMs, 90, 5, 1_000),
    volume: clamp(cue.volume, 0, 1, 0.15),
    pitchVariationCents: integer(cue.pitchVariationCents, 0, 0, 120),
    ...(kind === "sample" ? {
      resourceId: cleanString(cue.resourceId),
      playbackRate: clamp(cue.playbackRate, 0.5, 2, 1),
    } : {}),
  };
}

function normalizeMotionEffect(effect = {}) {
  const type = MOTION_EFFECTS.has(effect.type) ? effect.type : "flash";
  if (type === "particles") return {
    type,
    count: integer(effect.count, 8, 1, 64),
    color: cleanString(effect.color) || "#f3f3f0",
    secondaryColor: cleanString(effect.secondaryColor) || cleanString(effect.color) || "#f3f3f0",
    speed: clamp(effect.speed, 0, 1_200, 160),
    spread: clamp(effect.spread, 0, Math.PI * 2, Math.PI * 2),
    direction: clamp(effect.direction, -Math.PI * 2, Math.PI * 2, 0),
    lifetimeMs: integer(effect.lifetimeMs, 320, 40, LOOPLAB_PRESENTATION_LIMITS.maximumCueDurationMs),
    size: clamp(effect.size, 1, 32, 3),
    gravity: clamp(effect.gravity, -2_000, 2_000, 0),
  };
  if (type === "shake") return {
    type,
    intensity: clamp(effect.intensity, 0, 24, 3),
    durationMs: integer(effect.durationMs, 140, 20, 1_000),
  };
  if (type === "squash") return {
    type,
    scaleX: clamp(effect.scaleX, 0.55, 1.8, 1.1),
    scaleY: clamp(effect.scaleY, 0.55, 1.8, 0.9),
    durationMs: integer(effect.durationMs, 120, 20, 800),
  };
  return {
    type: "flash",
    color: cleanString(effect.color) || "#f3f3f0",
    opacity: clamp(effect.opacity, 0, 0.9, 0.15),
    durationMs: integer(effect.durationMs, 100, 20, 800),
  };
}

function normalizeMotionCue(cue = {}) {
  return {
    id: cleanString(cue.id),
    event: cleanString(cue.event),
    enabled: bool(cue.enabled, true),
    target: TARGETS.has(cue.target) ? cue.target : "event-object",
    effects: Array.isArray(cue.effects)
      ? cue.effects.slice(0, LOOPLAB_PRESENTATION_LIMITS.maximumEffectsPerCue).map(normalizeMotionEffect)
      : [],
  };
}

export function normalizePresentationProgram(input = {}) {
  return {
    version: 1,
    status: STATUS.has(input.status) ? input.status : "draft",
    enabled: bool(input.enabled, true),
    reducedMotion: REDUCED_MOTION.has(input.reducedMotion) ? input.reducedMotion : "respect",
    audio: {
      enabled: bool(input.audio?.enabled, true),
      masterVolume: clamp(input.audio?.masterVolume, 0, 1, 0.55),
      maxVoices: integer(input.audio?.maxVoices, 12, 1, LOOPLAB_PRESENTATION_LIMITS.maximumVoices),
      debounceMs: integer(input.audio?.debounceMs, 30, 0, 500),
      cues: Array.isArray(input.audio?.cues)
        ? input.audio.cues.slice(0, LOOPLAB_PRESENTATION_LIMITS.maximumAudioCues).map(normalizeAudioCue)
        : [],
    },
    motion: {
      enabled: bool(input.motion?.enabled, true),
      maxParticles: integer(input.motion?.maxParticles, 160, 0, LOOPLAB_PRESENTATION_LIMITS.maximumParticles),
      cues: Array.isArray(input.motion?.cues)
        ? input.motion.cues.slice(0, LOOPLAB_PRESENTATION_LIMITS.maximumMotionCues).map(normalizeMotionCue)
        : [],
    },
  };
}

const ALLOWED_KEYS = Object.freeze({
  root: new Set(["version", "status", "enabled", "reducedMotion", "audio", "motion"]),
  audio: new Set(["enabled", "masterVolume", "maxVoices", "debounceMs", "cues"]),
  audioCue: new Set(["id", "event", "enabled", "kind", "waveform", "frequency", "endFrequency", "filterFrequency", "durationMs", "attackMs", "releaseMs", "volume", "pitchVariationCents", "resourceId", "playbackRate"]),
  motion: new Set(["enabled", "maxParticles", "cues"]),
  motionCue: new Set(["id", "event", "enabled", "target", "effects"]),
  particles: new Set(["type", "count", "color", "secondaryColor", "speed", "spread", "direction", "lifetimeMs", "size", "gravity"]),
  shake: new Set(["type", "intensity", "durationMs"]),
  flash: new Set(["type", "color", "opacity", "durationMs"]),
  squash: new Set(["type", "scaleX", "scaleY", "durationMs"]),
});

function addIssue(issues, severity, code, message, context = {}) {
  issues.push({ severity, code, message, ...context });
}

function unknownKeys(value, allowed, path, issues) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) if (!allowed.has(key)) {
    addIssue(issues, "error", "presentation-field-unknown", `${path}.${key} is not an allowed presentation field.`, { path: `${path}.${key}` });
  }
}

function validateCueIdentity(cues, field, issues) {
  const ids = new Set();
  for (const [index, cue] of cues.entries()) {
    if (!STABLE_ID.test(cue.id)) addIssue(issues, "error", "presentation-cue-id-invalid", `${field}[${index}].id must be a stable non-empty ID.`, { field, index });
    else if (ids.has(cue.id)) addIssue(issues, "error", "presentation-cue-id-duplicate", `${field}[${index}].id duplicates ${cue.id}.`, { field, index, cueId: cue.id });
    else ids.add(cue.id);
    if (!STABLE_ID.test(cue.event)) addIssue(issues, "error", "presentation-event-invalid", `${field}[${index}].event must be a stable non-empty event ID.`, { field, index, cueId: cue.id });
  }
  return ids;
}

function authoredEvents(project) {
  const events = new Set(LOOPLAB_CANONICAL_PRESENTATION_EVENTS);
  for (const rule of project?.gameplayProgram?.rules ?? []) for (const effect of rule?.effects ?? []) {
    if (effect?.type === "emit" && STABLE_ID.test(effect.event ?? "")) events.add(effect.event);
  }
  for (const contract of project?.featureContracts ?? []) {
    const feedback = contract?.feedbackEvent;
    for (const event of Array.isArray(feedback) ? feedback : [feedback]) if (STABLE_ID.test(event ?? "")) events.add(event);
  }
  return events;
}

export function inspectPresentationProgram(project, input = project?.presentationProgram, options = {}) {
  const required = project?.qualityContracts?.presentationProgramRequired === true;
  const sourceDigest = options.sourceDigest ?? null;
  if (!input || typeof input !== "object" || Array.isArray(input)) return {
    schemaVersion: LOOPLAB_PRESENTATION_REPORT_SCHEMA,
    programSchemaVersion: LOOPLAB_PRESENTATION_PROGRAM_SCHEMA,
    present: false,
    required,
    status: required ? "missing" : "absent",
    sourceDigest,
    program: null,
    metrics: { audioCueCount: 0, motionCueCount: 0, effectCount: 0, mappedEventCount: 0, feedbackCoverage: 0, referencedAudioResourceCount: 0, encodedAudioBytes: 0, decodedAudioBytes: 0 },
    audioResources: inspectPresentationAudioResources(project, []),
    mappedEvents: [],
    unmappedFeedbackEvents: [],
    errors: required ? ["A presentation program is required but missing."] : [],
    warnings: [],
    issues: required ? [{ severity: "error", code: "presentation-program-missing", message: "A presentation program is required but missing." }] : [],
    proofBoundary: LOOPLAB_PRESENTATION_POLICY.judgmentBoundary,
  };

  const issues = [];
  unknownKeys(input, ALLOWED_KEYS.root, "presentationProgram", issues);
  unknownKeys(input.audio, ALLOWED_KEYS.audio, "presentationProgram.audio", issues);
  unknownKeys(input.motion, ALLOWED_KEYS.motion, "presentationProgram.motion", issues);
  if (input.version !== undefined && input.version !== 1) addIssue(issues, "error", "presentation-version", "presentationProgram.version must be 1.");
  if (input.status !== undefined && !STATUS.has(input.status)) addIssue(issues, "error", "presentation-status", "presentationProgram.status must be draft or approved.");
  if (input.reducedMotion !== undefined && !REDUCED_MOTION.has(input.reducedMotion)) addIssue(issues, "error", "presentation-reduced-motion", "presentationProgram.reducedMotion must be respect, always-reduce, or ignore.");
  if (input.audio !== undefined && (!input.audio || typeof input.audio !== "object" || Array.isArray(input.audio))) addIssue(issues, "error", "presentation-audio-shape", "presentationProgram.audio must be an object.");
  if (input.motion !== undefined && (!input.motion || typeof input.motion !== "object" || Array.isArray(input.motion))) addIssue(issues, "error", "presentation-motion-shape", "presentationProgram.motion must be an object.");
  if (input.audio?.cues !== undefined && !Array.isArray(input.audio.cues)) addIssue(issues, "error", "presentation-audio-cues-shape", "presentationProgram.audio.cues must be an array.");
  if (input.motion?.cues !== undefined && !Array.isArray(input.motion.cues)) addIssue(issues, "error", "presentation-motion-cues-shape", "presentationProgram.motion.cues must be an array.");
  if ((input.audio?.cues?.length ?? 0) > LOOPLAB_PRESENTATION_LIMITS.maximumAudioCues) addIssue(issues, "error", "presentation-audio-cue-limit", `presentationProgram.audio.cues may contain at most ${LOOPLAB_PRESENTATION_LIMITS.maximumAudioCues} cues.`);
  if ((input.motion?.cues?.length ?? 0) > LOOPLAB_PRESENTATION_LIMITS.maximumMotionCues) addIssue(issues, "error", "presentation-motion-cue-limit", `presentationProgram.motion.cues may contain at most ${LOOPLAB_PRESENTATION_LIMITS.maximumMotionCues} cues.`);

  for (const [index, cue] of (input.audio?.cues ?? []).entries()) {
    unknownKeys(cue, ALLOWED_KEYS.audioCue, `presentationProgram.audio.cues[${index}]`, issues);
    if (!AUDIO_KINDS.has(cue?.kind ?? "tone")) addIssue(issues, "error", "presentation-audio-kind", `Audio cue ${index} has unsupported kind ${String(cue?.kind)}.`, { index });
    if (cue?.waveform !== undefined && !WAVEFORMS.has(cue.waveform)) addIssue(issues, "error", "presentation-waveform", `Audio cue ${index} has unsupported waveform ${String(cue.waveform)}.`, { index });
    if (cue?.kind === "sample" && !STABLE_ID.test(cue?.resourceId ?? "")) addIssue(issues, "error", "presentation-audio-resource-id", `Sample audio cue ${index} must name a stable embedded resourceId.`, { index, cueId: cue?.id });
  }
  for (const [cueIndex, cue] of (input.motion?.cues ?? []).entries()) {
    unknownKeys(cue, ALLOWED_KEYS.motionCue, `presentationProgram.motion.cues[${cueIndex}]`, issues);
    if (cue?.target !== undefined && !TARGETS.has(cue.target)) addIssue(issues, "error", "presentation-target", `Motion cue ${cueIndex} has unsupported target ${String(cue.target)}.`, { cueIndex });
    if (!Array.isArray(cue?.effects) || cue.effects.length === 0) addIssue(issues, "error", "presentation-motion-effects-empty", `Motion cue ${cueIndex} must contain at least one effect.`, { cueIndex });
    if ((cue?.effects?.length ?? 0) > LOOPLAB_PRESENTATION_LIMITS.maximumEffectsPerCue) addIssue(issues, "error", "presentation-motion-effect-limit", `Motion cue ${cueIndex} may contain at most ${LOOPLAB_PRESENTATION_LIMITS.maximumEffectsPerCue} effects.`, { cueIndex });
    for (const [effectIndex, effect] of (cue?.effects ?? []).entries()) {
      const type = effect?.type;
      if (!MOTION_EFFECTS.has(type)) addIssue(issues, "error", "presentation-effect-type", `Motion cue ${cueIndex} effect ${effectIndex} has unsupported type ${String(type)}.`, { cueIndex, effectIndex });
      else unknownKeys(effect, ALLOWED_KEYS[type], `presentationProgram.motion.cues[${cueIndex}].effects[${effectIndex}]`, issues);
    }
  }

  const program = normalizePresentationProgram(input);
  const audioResources = inspectPresentationAudioResources(project, program.audio.cues);
  issues.push(...audioResources.issues);
  validateCueIdentity(program.audio.cues, "presentationProgram.audio.cues", issues);
  validateCueIdentity(program.motion.cues, "presentationProgram.motion.cues", issues);
  if (program.enabled && program.audio.enabled && program.audio.cues.length === 0) addIssue(issues, "warning", "presentation-audio-empty", "Authored audio is enabled but has no event cues.");
  if (program.enabled && program.motion.enabled && program.motion.cues.length === 0) addIssue(issues, "warning", "presentation-motion-empty", "Authored motion is enabled but has no event cues.");
  if (program.reducedMotion === "ignore") addIssue(issues, "warning", "presentation-reduced-motion-ignored", "The presentation program ignores the user's reduced-motion preference.");

  const knownEvents = authoredEvents(project);
  const mappedEvents = [...new Set([...program.audio.cues, ...program.motion.cues].filter((cue) => cue.enabled).map((cue) => cue.event))].sort();
  for (const event of mappedEvents) if (!knownEvents.has(event)) addIssue(issues, "warning", "presentation-event-unresolved", `Presentation event ${event} is not emitted by the current canonical runtime or authored gameplay program.`, { event });
  const feedbackEvents = [...new Set((project?.featureContracts ?? []).flatMap((contract) => Array.isArray(contract?.feedbackEvent) ? contract.feedbackEvent : [contract?.feedbackEvent]).filter((event) => STABLE_ID.test(event ?? "")))].sort();
  const unmappedFeedbackEvents = feedbackEvents.filter((event) => !mappedEvents.includes(event));
  if (program.status === "approved") for (const event of unmappedFeedbackEvents) addIssue(issues, "warning", "presentation-feedback-unmapped", `Approved presentation does not map feature feedback event ${event}.`, { event });

  const errors = issues.filter((issue) => issue.severity === "error").map((issue) => issue.message);
  const warnings = issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message);
  return {
    schemaVersion: LOOPLAB_PRESENTATION_REPORT_SCHEMA,
    programSchemaVersion: LOOPLAB_PRESENTATION_PROGRAM_SCHEMA,
    present: true,
    required,
    status: errors.length ? "invalid" : warnings.length ? "review" : program.status,
    sourceDigest,
    program,
    metrics: {
      audioCueCount: program.audio.cues.length,
      motionCueCount: program.motion.cues.length,
      effectCount: program.motion.cues.reduce((total, cue) => total + cue.effects.length, 0),
      mappedEventCount: mappedEvents.length,
      feedbackCoverage: feedbackEvents.length ? (feedbackEvents.length - unmappedFeedbackEvents.length) / feedbackEvents.length : 1,
      maximumVoices: program.audio.maxVoices,
      maximumParticles: program.motion.maxParticles,
      referencedAudioResourceCount: audioResources.referencedResourceCount,
      encodedAudioBytes: audioResources.encodedBytes,
      decodedAudioBytes: audioResources.decodedBytes,
    },
    audioResources,
    mappedEvents,
    unmappedFeedbackEvents,
    errors,
    warnings,
    issues,
    proofBoundary: LOOPLAB_PRESENTATION_POLICY.judgmentBoundary,
  };
}

function hasObjectKind(project, kind) {
  const maps = Array.isArray(project?.maps) && project.maps.length ? project.maps : [{ objects: project?.objects ?? [] }];
  return maps.some((map) => (map.objects ?? []).some((object) => object?.kind === kind));
}

function hasControlMode(project, mode) {
  const maps = Array.isArray(project?.maps) && project.maps.length ? project.maps : [project];
  return maps.some((map) => map?.controlMode === mode);
}

export function suggestPresentationProgram(project, options = {}) {
  const audio = [];
  const motion = [];
  const addAudio = (id, event, kind, settings) => audio.push({ id, event, kind, ...settings });
  const addMotion = (id, event, target, effects) => motion.push({ id, event, target, effects });
  if (hasControlMode(project, "platformer")) {
    addAudio("jump-tone", "player.jumped", "tone", { waveform: "triangle", frequency: 260, endFrequency: 420, durationMs: 110, attackMs: 5, releaseMs: 75, volume: 0.18, pitchVariationCents: 18 });
    addAudio("land-noise", "player.landed", "noise", { filterFrequency: 520, durationMs: 85, attackMs: 3, releaseMs: 65, volume: 0.12, pitchVariationCents: 8 });
    addMotion("land-response", "player.landed", "event-object", [
      { type: "particles", count: 7, color: "#d6d6d2", secondaryColor: "#8d8d88", speed: 115, spread: 2.5, direction: -Math.PI / 2, lifetimeMs: 260, size: 3, gravity: 280 },
      { type: "squash", scaleX: 1.12, scaleY: 0.9, durationMs: 120 },
      { type: "shake", intensity: 2.5, durationMs: 90 },
    ]);
  }
  if (hasObjectKind(project, "coin")) {
    addAudio("collect-chime", "coin.collected", "tone", { waveform: "sine", frequency: 620, endFrequency: 930, durationMs: 150, attackMs: 4, releaseMs: 110, volume: 0.2, pitchVariationCents: 35 });
    addMotion("collect-spark", "coin.collected", "event-object", [
      { type: "particles", count: 12, color: "#f3f3f0", secondaryColor: "#a7a7a1", speed: 170, spread: Math.PI * 2, direction: 0, lifetimeMs: 360, size: 3, gravity: 120 },
      { type: "flash", color: "#f3f3f0", opacity: 0.12, durationMs: 90 },
    ]);
  }
  if (hasObjectKind(project, "hazard")) {
    addAudio("respawn-drop", "player.respawned", "noise", { filterFrequency: 340, durationMs: 220, attackMs: 3, releaseMs: 180, volume: 0.2, pitchVariationCents: 0 });
    addMotion("respawn-flash", "player.respawned", "player", [{ type: "flash", color: "#d9d9d4", opacity: 0.22, durationMs: 150 }]);
  }
  if (hasObjectKind(project, "goal")) {
    addAudio("goal-rise", "goal.reached", "tone", { waveform: "triangle", frequency: 440, endFrequency: 880, durationMs: 420, attackMs: 10, releaseMs: 300, volume: 0.24, pitchVariationCents: 0 });
    addMotion("goal-burst", "goal.reached", "event-object", [
      { type: "particles", count: 24, color: "#f3f3f0", secondaryColor: "#777773", speed: 230, spread: Math.PI * 2, direction: 0, lifetimeMs: 640, size: 4, gravity: 150 },
      { type: "flash", color: "#f3f3f0", opacity: 0.2, durationMs: 180 },
      { type: "shake", intensity: 4, durationMs: 220 },
    ]);
  }
  if ((project?.traversalPaths ?? []).length || (project?.maps ?? []).some((map) => (map.traversalPaths ?? []).length)) {
    addAudio("traversal-lock", "traversal.started", "tone", { waveform: "square", frequency: 180, endFrequency: 250, durationMs: 90, attackMs: 3, releaseMs: 60, volume: 0.1, pitchVariationCents: 12 });
    addAudio("traversal-complete", "traversal.completed", "tone", { waveform: "triangle", frequency: 390, endFrequency: 650, durationMs: 180, attackMs: 5, releaseMs: 130, volume: 0.16, pitchVariationCents: 16 });
  }
  if (project?.combatProgram?.enabled !== false && (project?.combatProgram?.emitters?.length ?? 0) > 0) {
    addAudio("projectile-launch", "projectile.spawned", "tone", { waveform: "square", frequency: 210, endFrequency: 150, durationMs: 70, attackMs: 2, releaseMs: 45, volume: 0.1, pitchVariationCents: 22 });
    addAudio("projectile-impact", "projectile.hit", "noise", { filterFrequency: 720, durationMs: 90, attackMs: 2, releaseMs: 65, volume: 0.16, pitchVariationCents: 18 });
    addMotion("projectile-impact-response", "projectile.hit", "event-object", [
      { type: "particles", count: 9, color: "#eeeeea", secondaryColor: "#6e7073", speed: 155, spread: Math.PI * 2, direction: 0, lifetimeMs: 260, size: 3, gravity: 80 },
      { type: "squash", scaleX: 1.08, scaleY: 0.92, durationMs: 90 },
      { type: "shake", intensity: 2.25, durationMs: 80 },
    ]);
    if ((project?.combatProgram?.actors?.length ?? 0) > 0) {
      addAudio("combat-depleted", "health.depleted", "tone", { waveform: "sawtooth", frequency: 180, endFrequency: 70, durationMs: 260, attackMs: 4, releaseMs: 210, volume: 0.18, pitchVariationCents: 12 });
      addMotion("combat-depleted-response", "health.depleted", "event-object", [
        { type: "particles", count: 18, color: "#f1f1ed", secondaryColor: "#55575a", speed: 210, spread: Math.PI * 2, direction: 0, lifetimeMs: 520, size: 4, gravity: 130 },
        { type: "flash", color: "#d8d8d4", opacity: 0.18, durationMs: 140 },
        { type: "shake", intensity: 4, durationMs: 180 },
      ]);
    }
  }
  if (project?.actorProgram?.enabled !== false && (project?.actorProgram?.actors?.length ?? 0) > 0) {
    addAudio("actor-detected", "actor.detected", "tone", { waveform: "square", frequency: 240, endFrequency: 390, durationMs: 120, attackMs: 3, releaseMs: 80, volume: 0.12, pitchVariationCents: 10 });
    addAudio("actor-arrived", "actor.arrived", "tone", { waveform: "triangle", frequency: 330, endFrequency: 260, durationMs: 100, attackMs: 4, releaseMs: 70, volume: 0.09, pitchVariationCents: 8 });
    addMotion("actor-detected-response", "actor.detected", "event-object", [
      { type: "flash", color: "#d6d6d2", opacity: 0.14, durationMs: 100 },
      { type: "squash", scaleX: 1.06, scaleY: 0.94, durationMs: 100 },
    ]);
    addMotion("actor-blocked-response", "actor.blocked", "event-object", [{ type: "shake", intensity: 1.5, durationMs: 70 }]);
  }
  if (!audio.length) addAudio("decision-confirm", "choice.selected", "tone", { waveform: "sine", frequency: 360, endFrequency: 520, durationMs: 130, attackMs: 5, releaseMs: 90, volume: 0.15, pitchVariationCents: 8 });
  if (!motion.length) addMotion("decision-flash", "choice.selected", "center", [{ type: "flash", color: "#f3f3f0", opacity: 0.1, durationMs: 90 }]);
  const program = normalizePresentationProgram({
    version: 1,
    status: options.status === "approved" ? "approved" : "draft",
    enabled: true,
    reducedMotion: "respect",
    audio: { enabled: true, masterVolume: 0.55, maxVoices: 12, debounceMs: 30, cues: audio },
    motion: { enabled: true, maxParticles: 160, cues: motion },
  });
  return {
    schemaVersion: "looplab-presentation-suggestion/v1",
    provider: "none",
    sourceDigest: options.sourceDigest ?? null,
    program,
    report: inspectPresentationProgram(project, program, { sourceDigest: options.sourceDigest }),
    decisionBoundary: LOOPLAB_PRESENTATION_POLICY.judgmentBoundary,
  };
}

// This factory is deliberately self-contained because the exported one-file HTML
// embeds createPresentationRuntime.toString() without module imports.
export function createPresentationRuntime(inputProgram, options = {}) {
  const program = inputProgram && typeof inputProgram === "object" ? inputProgram : null;
  const host = options.host || (typeof globalThis !== "undefined" ? globalThis : {});
  const performanceRef = options.performance || host.performance || { now: function () { return Date.now(); } };
  const getPoint = typeof options.getPoint === "function" ? options.getPoint : function (_event, target) {
    return target === "center" ? { x: Number(options.width || 0) / 2, y: Number(options.height || 0) / 2, objectId: null } : { x: 0, y: 0, objectId: null };
  };
  const audioConfig = program?.audio || { enabled: false, cues: [] };
  const motionConfig = program?.motion || { enabled: false, cues: [] };
  const embeddedAudioResources = new Map();
  (Array.isArray(options.resources) ? options.resources : []).forEach(function (resource) {
    if (resource?.kind === "audio" && typeof resource.id === "string" && typeof resource.dataUrl === "string") embeddedAudioResources.set(resource.id, resource);
  });
  const enabled = program?.enabled !== false;
  const audioCues = new Map();
  const motionCues = new Map();
  (audioConfig.cues || []).forEach(function (cue) { if (cue?.enabled !== false && cue?.event) { const list = audioCues.get(cue.event) || []; list.push(cue); audioCues.set(cue.event, list); } });
  (motionConfig.cues || []).forEach(function (cue) { if (cue?.enabled !== false && cue?.event) { const list = motionCues.get(cue.event) || []; list.push(cue); motionCues.set(cue.event, list); } });
  const media = program?.reducedMotion === "always-reduce" ? null : host.matchMedia?.("(prefers-reduced-motion: reduce)") || null;
  let reducedMotionOverride = null;
  let reducedMotion = program?.reducedMotion === "always-reduce" || (program?.reducedMotion !== "ignore" && media?.matches === true);
  let context = null;
  let master = null;
  let limiter = null;
  let noiseBuffer = null;
  let audioState = audioConfig.enabled === false || !enabled ? "disabled" : "locked";
  let audioError = null;
  let muted = false;
  let masterVolume = Math.max(0, Math.min(1, Number.isFinite(Number(audioConfig.masterVolume)) ? Number(audioConfig.masterVolume) : 0.55));
  let eventCounter = 0;
  let voiceCounter = 0;
  let pendingAudio = [];
  const decodedAudioBuffers = new Map();
  const decodingAudioBuffers = new Map();
  const audioResourceErrors = new Map();
  const voices = [];
  const cueTimes = new Map();
  const particles = [];
  const squashes = new Map();
  let shakeIntensity = 0;
  let shakeRemaining = 0;
  let shakeTotal = 0;
  let flash = null;
  let disposed = false;
  let handledEventCount = 0;
  let triggeredAudioCueCount = 0;
  let triggeredMotionCueCount = 0;
  let skippedReducedMotionCount = 0;
  const decodeSampleRate = 48000;

  function nowMs() { return Number(performanceRef.now?.() || Date.now()); }
  function safeCall(callback) { try { return callback(); } catch (error) { audioError = error instanceof Error ? error.message : String(error); audioState = "failed"; return null; } }
  function removeVoice(source) { const index = voices.findIndex(function (voice) { return voice.source === source; }); if (index >= 0) voices.splice(index, 1); }
  function stopVoice(voice) { try { voice.source.stop?.(); } catch { /* A voice may already have ended; bounded removal still follows. */ } removeVoice(voice.source); }
  function stopVoices() { voices.slice().forEach(stopVoice); }
  function configureGraph() {
    const Context = host.AudioContext || host.webkitAudioContext;
    if (typeof Context !== "function") { audioState = "unavailable"; return false; }
    context = new Context({ latencyHint: "interactive", sampleRate: decodeSampleRate });
    if (!context || typeof context.createGain !== "function") throw new Error("Web Audio gain nodes are unavailable.");
    if (Number(context.sampleRate) !== decodeSampleRate) throw new Error("Web Audio did not honor LoopLab's fixed 48 kHz decode rate.");
    master = context.createGain();
    master.gain.setValueAtTime(Math.max(0.0001, muted ? 0.0001 : masterVolume), context.currentTime || 0);
    if (typeof context.createDynamicsCompressor === "function") {
      limiter = context.createDynamicsCompressor();
      limiter.threshold?.setValueAtTime?.(-8, context.currentTime || 0);
      limiter.knee?.setValueAtTime?.(4, context.currentTime || 0);
      limiter.ratio?.setValueAtTime?.(12, context.currentTime || 0);
      limiter.attack?.setValueAtTime?.(0.003, context.currentTime || 0);
      limiter.release?.setValueAtTime?.(0.12, context.currentTime || 0);
      master.connect(limiter); limiter.connect(context.destination);
    } else master.connect(context.destination);
    return true;
  }
  function ensureContext() {
    if (context) return true;
    if (!enabled || audioConfig.enabled === false || disposed) return false;
    return safeCall(configureGraph) === true;
  }
  function flushPending() {
    const cutoff = nowMs() - 220;
    const queued = pendingAudio.filter(function (entry) { return entry.queuedAt >= cutoff; });
    pendingAudio = [];
    queued.forEach(function (entry) { triggerAudioCue(entry.cue, entry.event, true); });
  }
  async function unlock() {
    if (!enabled || audioConfig.enabled === false || disposed) return getStatus();
    try {
      if (!ensureContext()) return getStatus();
      if (typeof context.resume === "function" && context.state !== "running") await context.resume();
      if (context.state && context.state !== "running") { audioState = "locked"; return getStatus(); }
      audioState = muted ? "muted" : "running";
      audioError = null;
      flushPending();
      primeReferencedSamples();
    } catch (error) {
      audioError = error instanceof Error ? error.message : String(error);
      audioState = "failed";
    }
    return getStatus();
  }
  function sourceDestination() { return master; }
  function registerVoice(source, endTime) {
    const maximum = Math.max(1, Math.min(24, Number(audioConfig.maxVoices || 12)));
    while (voices.length >= maximum) stopVoice(voices[0]);
    const voice = { id: ++voiceCounter, source: source, endTime: endTime };
    voices.push(voice);
    source.onended = function () { removeVoice(source); };
  }
  function buildNoiseBuffer() {
    if (noiseBuffer || !context?.createBuffer) return noiseBuffer;
    const length = Math.max(1, Math.floor((context.sampleRate || 44100) * 0.5));
    noiseBuffer = context.createBuffer(1, length, context.sampleRate || 44100);
    const data = noiseBuffer.getChannelData(0);
    let seed = 0x13579bdf;
    for (let index = 0; index < data.length; index += 1) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[index] = (seed / 2147483648) - 1; }
    return noiseBuffer;
  }
  function embeddedDataUrlToArrayBuffer(dataUrl) {
    const match = /^data:([^;,]+)?((?:;[^,]*)*?),(.*)$/s.exec(String(dataUrl || ""));
    if (!match) throw new Error("Embedded audio has an invalid data URL.");
    const mimeType = String(match[1] || "").toLowerCase();
    if (!mimeType.startsWith("audio/")) throw new Error("Embedded presentation resource is not audio.");
    const payload = match[3] || "";
    let binary;
    if (/;base64(?:;|$)/i.test(match[2] || "")) {
      if (typeof host.atob !== "function") throw new Error("Base64 audio decoding is unavailable.");
      binary = host.atob(payload.replace(/\s+/g, ""));
    } else binary = decodeURIComponent(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index) & 0xff;
    return bytes.buffer;
  }
  function decodeAudioBuffer(arrayBuffer) {
    return new Promise(function (resolve, reject) {
      let settled = false;
      function accept(buffer) { if (!settled) { settled = true; resolve(buffer); } }
      function decline(error) { if (!settled) { settled = true; reject(error); } }
      try {
        const result = context.decodeAudioData(arrayBuffer, accept, decline);
        if (result && typeof result.then === "function") result.then(accept, decline);
      } catch (error) { decline(error); }
    });
  }
  function decodeResource(resourceId) {
    if (decodedAudioBuffers.has(resourceId)) return Promise.resolve(decodedAudioBuffers.get(resourceId));
    if (decodingAudioBuffers.has(resourceId)) return decodingAudioBuffers.get(resourceId);
    const resource = embeddedAudioResources.get(resourceId);
    if (!resource) {
      const message = "Embedded audio resource is unavailable: " + String(resourceId);
      audioResourceErrors.set(resourceId, message);
      return Promise.resolve(null);
    }
    if (!context || typeof context.decodeAudioData !== "function") {
      const message = "Web Audio decoding is unavailable for resource " + String(resourceId) + ".";
      audioResourceErrors.set(resourceId, message);
      return Promise.resolve(null);
    }
    const pending = Promise.resolve().then(function () {
      return decodeAudioBuffer(embeddedDataUrlToArrayBuffer(resource.dataUrl));
    }).then(function (buffer) {
      if (!buffer || disposed) return null;
      decodedAudioBuffers.set(resourceId, buffer);
      audioResourceErrors.delete(resourceId);
      return buffer;
    }).catch(function (error) {
      audioResourceErrors.set(resourceId, error instanceof Error ? error.message : String(error));
      return null;
    }).finally(function () { decodingAudioBuffers.delete(resourceId); });
    decodingAudioBuffers.set(resourceId, pending);
    return pending;
  }
  function primeReferencedSamples() {
    const resourceIds = new Set();
    (audioConfig.cues || []).forEach(function (cue) { if (cue?.enabled !== false && cue?.kind === "sample" && cue.resourceId) resourceIds.add(cue.resourceId); });
    resourceIds.forEach(function (resourceId) { void decodeResource(resourceId); });
  }
  function playAudioCue(cue, buffer) {
    safeCall(function () {
      const start = context.currentTime || 0;
      const playbackRate = cue.kind === "sample" ? Math.max(0.5, Math.min(2, Number(cue.playbackRate || 1))) : 1;
      const naturalDuration = cue.kind === "sample" && buffer ? Number(buffer.duration || 0) / playbackRate : Infinity;
      const duration = Math.max(0.02, Math.min(2, Number(cue.durationMs || (cue.kind === "sample" ? 1_000 : 140)) / 1000, naturalDuration || Infinity));
      const attack = Math.max(0.001, Math.min(duration * 0.5, Number(cue.attackMs || 8) / 1000));
      const release = Math.max(0.005, Math.min(duration, Number(cue.releaseMs || 90) / 1000));
      const end = start + duration;
      const gain = context.createGain();
      const volume = Math.max(0.0001, Math.min(1, Number(cue.volume ?? 0.15)));
      gain.gain.cancelScheduledValues?.(start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + attack);
      gain.gain.setValueAtTime(volume, Math.max(start + attack, end - release));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      gain.connect(sourceDestination());
      let source;
      if (cue.kind === "sample") {
        if (!buffer) return;
        source = context.createBufferSource();
        source.buffer = buffer;
        source.playbackRate?.setValueAtTime?.(playbackRate, start);
        const variation = Number(cue.pitchVariationCents || 0);
        const signed = ((voiceCounter * 1103515245 + 12345) >>> 16) % 2001 / 1000 - 1;
        source.detune?.setValueAtTime?.(signed * variation, start);
        source.connect(gain);
      } else if (cue.kind === "noise") {
        source = context.createBufferSource();
        source.buffer = buildNoiseBuffer();
        if (typeof context.createBiquadFilter === "function") {
          const filter = context.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.setValueAtTime(Math.max(80, Math.min(12000, Number(cue.filterFrequency || 600))), start);
          source.connect(filter); filter.connect(gain);
        } else source.connect(gain);
      } else {
        source = context.createOscillator();
        source.type = cue.waveform || "sine";
        const variation = Number(cue.pitchVariationCents || 0);
        const signed = ((voiceCounter * 1103515245 + 12345) >>> 16) % 2001 / 1000 - 1;
        source.detune?.setValueAtTime?.(signed * variation, start);
        source.frequency.setValueAtTime(Math.max(40, Math.min(4000, Number(cue.frequency || 220))), start);
        source.frequency.exponentialRampToValueAtTime(Math.max(40, Math.min(4000, Number(cue.endFrequency || cue.frequency || 220))), end);
        source.connect(gain);
      }
      registerVoice(source, end);
      source.start(start);
      source.stop(end + 0.02);
      triggeredAudioCueCount += 1;
    });
  }
  function triggerAudioCue(cue, event, fromQueue) {
    if (muted || disposed || !enabled || audioConfig.enabled === false) return;
    const at = nowMs();
    const key = String(cue.id || "cue");
    const debounce = Math.max(0, Number(audioConfig.debounceMs || 0));
    if (!fromQueue && at - Number(cueTimes.get(key) || -Infinity) < debounce) return;
    cueTimes.set(key, at);
    if (!context || context.state !== "running" || !master) {
      pendingAudio.push({ cue: cue, event: event, queuedAt: at });
      const limit = 32;
      if (pendingAudio.length > limit) pendingAudio.splice(0, pendingAudio.length - limit);
      return;
    }
    if (cue.kind === "sample") {
      const requestedAt = at;
      const decoded = decodedAudioBuffers.get(cue.resourceId);
      if (decoded) playAudioCue(cue, decoded);
      else void decodeResource(cue.resourceId).then(function (buffer) {
        if (buffer && !disposed && !muted && context?.state === "running" && nowMs() - requestedAt <= 220) playAudioCue(cue, buffer);
      });
      return;
    }
    playAudioCue(cue, null);
  }
  function makeSeed(text) { let seed = 2166136261 ^ eventCounter; for (let index = 0; index < text.length; index += 1) { seed ^= text.charCodeAt(index); seed = Math.imul(seed, 16777619); } return seed >>> 0; }
  function randomFactory(seed) { let state = seed || 1; return function () { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }; }
  function spawnParticles(effect, point, cueId) {
    const maximum = Math.max(0, Math.min(320, Number(motionConfig.maxParticles || 0)));
    if (!maximum) return;
    const random = randomFactory(makeSeed(String(cueId || "particles")));
    const count = Math.max(1, Math.min(64, Number(effect.count || 8)));
    for (let index = 0; index < count; index += 1) {
      if (particles.length >= maximum) particles.shift();
      const angle = Number(effect.direction || 0) + (random() - 0.5) * Number(effect.spread || Math.PI * 2);
      const speed = Number(effect.speed || 0) * (0.55 + random() * 0.45);
      particles.push({
        x: Number(point.x || 0), y: Number(point.y || 0), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        gravity: Number(effect.gravity || 0), age: 0, lifetime: Math.max(40, Number(effect.lifetimeMs || 320)),
        size: Math.max(1, Number(effect.size || 3)) * (0.7 + random() * 0.6),
        color: random() < 0.5 ? effect.color : effect.secondaryColor,
      });
    }
  }
  function triggerMotionCue(cue, event) {
    if (!enabled || motionConfig.enabled === false || disposed) return;
    const point = getPoint(event, cue.target || "event-object") || { x: 0, y: 0, objectId: null };
    for (const effect of cue.effects || []) {
      if (reducedMotion && (effect.type === "particles" || effect.type === "shake" || effect.type === "squash")) { skippedReducedMotionCount += 1; continue; }
      if (effect.type === "particles") spawnParticles(effect, point, cue.id);
      else if (effect.type === "shake") {
        shakeIntensity = Math.max(shakeIntensity, Math.max(0, Number(effect.intensity || 0)));
        shakeRemaining = Math.max(shakeRemaining, Math.max(20, Number(effect.durationMs || 140)));
        shakeTotal = Math.max(shakeTotal, shakeRemaining);
      } else if (effect.type === "flash") flash = { color: effect.color || "#fff", opacity: Math.max(0, Math.min(0.9, Number(effect.opacity || 0))), remaining: Math.max(20, Number(effect.durationMs || 100)), total: Math.max(20, Number(effect.durationMs || 100)) };
      else if (effect.type === "squash" && point.objectId) squashes.set(point.objectId, { scaleX: Number(effect.scaleX || 1), scaleY: Number(effect.scaleY || 1), remaining: Math.max(20, Number(effect.durationMs || 120)), total: Math.max(20, Number(effect.durationMs || 120)) });
    }
    triggeredMotionCueCount += 1;
  }
  function handleEvents(events) {
    if (!enabled || disposed) return;
    for (const event of Array.isArray(events) ? events : []) {
      if (!event || typeof event.type !== "string") continue;
      eventCounter += 1; handledEventCount += 1;
      (audioCues.get(event.type) || []).forEach(function (cue) { triggerAudioCue(cue, event, false); });
      (motionCues.get(event.type) || []).forEach(function (cue) { triggerMotionCue(cue, event); });
    }
  }
  function update(deltaMs) {
    if (disposed) return;
    const delta = Math.max(0, Math.min(100, Number(deltaMs || 0)));
    const seconds = delta / 1000;
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index]; particle.age += delta; particle.vy += particle.gravity * seconds; particle.x += particle.vx * seconds; particle.y += particle.vy * seconds;
      if (particle.age >= particle.lifetime) particles.splice(index, 1);
    }
    if (shakeRemaining > 0) { shakeRemaining = Math.max(0, shakeRemaining - delta); if (!shakeRemaining) { shakeIntensity = 0; shakeTotal = 0; } }
    if (flash) { flash.remaining = Math.max(0, flash.remaining - delta); if (!flash.remaining) flash = null; }
    squashes.forEach(function (entry, id) { entry.remaining = Math.max(0, entry.remaining - delta); if (!entry.remaining) squashes.delete(id); });
  }
  function getCameraOffset() {
    if (reducedMotion || !shakeRemaining || !shakeIntensity) return { x: 0, y: 0 };
    const progress = shakeTotal ? shakeRemaining / shakeTotal : 0;
    const trauma = progress * progress;
    const seed = eventCounter * 97 + Math.round(shakeRemaining);
    return { x: Math.sin(seed * 12.9898) * shakeIntensity * trauma, y: Math.cos(seed * 78.233) * shakeIntensity * trauma };
  }
  function getObjectTransform(objectId) {
    const entry = squashes.get(objectId);
    if (!entry || reducedMotion) return { scaleX: 1, scaleY: 1 };
    const progress = entry.total ? entry.remaining / entry.total : 0;
    const envelope = Math.sin(Math.PI * Math.max(0, Math.min(1, progress)));
    return { scaleX: 1 + (entry.scaleX - 1) * envelope, scaleY: 1 + (entry.scaleY - 1) * envelope };
  }
  function drawWorld(context2d) {
    if (!context2d || reducedMotion) return;
    context2d.save();
    particles.forEach(function (particle) { const alpha = Math.max(0, 1 - particle.age / particle.lifetime); context2d.globalAlpha = alpha; context2d.fillStyle = particle.color || "#fff"; context2d.fillRect(Math.round(particle.x - particle.size / 2), Math.round(particle.y - particle.size / 2), Math.max(1, Math.round(particle.size)), Math.max(1, Math.round(particle.size))); });
    context2d.restore();
  }
  function drawOverlay(context2d, width, height) {
    if (!context2d || !flash) return;
    const alpha = flash.total ? flash.opacity * (flash.remaining / flash.total) : 0;
    context2d.save(); context2d.globalAlpha = Math.max(0, Math.min(0.9, alpha)); context2d.fillStyle = flash.color || "#fff"; context2d.fillRect(0, 0, Number(width || 0), Number(height || 0)); context2d.restore();
  }
  function clearMotion() { particles.splice(0); squashes.clear(); shakeIntensity = 0; shakeRemaining = 0; shakeTotal = 0; flash = null; }
  async function suspend() {
    stopVoices(); pendingAudio = []; clearMotion();
    try { if (context && typeof context.suspend === "function" && context.state === "running") await context.suspend(); if (audioState !== "disabled" && audioState !== "unavailable" && audioState !== "failed") audioState = "suspended"; } catch (error) { audioError = error instanceof Error ? error.message : String(error); audioState = "failed"; }
    return getStatus();
  }
  async function resume() { return unlock(); }
  function setMuted(nextMuted) {
    muted = nextMuted !== false;
    stopVoices(); pendingAudio = [];
    if (master && context) safeCall(function () { const now = context.currentTime || 0; master.gain.cancelScheduledValues?.(now); master.gain.setValueAtTime(Math.max(0.0001, muted ? 0.0001 : masterVolume), now); return true; });
    if (audioState !== "disabled" && audioState !== "unavailable" && audioState !== "failed") audioState = muted ? "muted" : context?.state === "running" ? "running" : "locked";
    return getStatus();
  }
  function setMasterVolume(nextVolume) {
    const numeric = Number(nextVolume);
    masterVolume = Math.max(0, Math.min(1, Number.isFinite(numeric) ? numeric : masterVolume));
    if (master && context) safeCall(function () { const now = context.currentTime || 0; master.gain.cancelScheduledValues?.(now); master.gain.setValueAtTime(Math.max(0.0001, muted ? 0.0001 : masterVolume), now); return true; });
    return getStatus();
  }
  function setReducedMotion(nextReducedMotion) {
    reducedMotionOverride = nextReducedMotion == null ? null : nextReducedMotion === true;
    reducedMotion = reducedMotionOverride ?? (program?.reducedMotion === "always-reduce" || (program?.reducedMotion !== "ignore" && media?.matches === true));
    if (reducedMotion) clearMotion();
    return getStatus();
  }
  function reset() { stopVoices(); pendingAudio = []; cueTimes.clear(); clearMotion(); return getStatus(); }
  function getStatus() {
    let decodedBytes = 0;
    decodedAudioBuffers.forEach(function (buffer) { decodedBytes += Math.max(0, Number(buffer?.length || 0)) * Math.max(0, Number(buffer?.numberOfChannels || 0)) * 4; });
    return {
      enabled: enabled,
      audio: { enabled: audioConfig.enabled !== false && enabled, state: audioState, muted: muted, masterVolume: masterVolume, contextState: context?.state || null, decodeSampleRate: decodeSampleRate, activeVoices: voices.length, pendingEvents: pendingAudio.length, triggeredCueCount: triggeredAudioCueCount, embeddedResourceCount: embeddedAudioResources.size, decodedResourceCount: decodedAudioBuffers.size, decodingResourceCount: decodingAudioBuffers.size, decodedBytes: decodedBytes, resourceErrors: Object.fromEntries(audioResourceErrors), error: audioError },
      motion: { enabled: motionConfig.enabled !== false && enabled, reducedMotion: reducedMotion, reducedMotionSource: reducedMotionOverride == null ? program?.reducedMotion === "always-reduce" || program?.reducedMotion === "ignore" ? "program" : "system" : "shell-override", activeParticles: particles.length, activeSquashes: squashes.size, shakeActive: shakeRemaining > 0, flashActive: Boolean(flash), triggeredCueCount: triggeredMotionCueCount, skippedReducedMotionCount: skippedReducedMotionCount },
      handledEventCount: handledEventCount,
      simulationIndependent: true,
    };
  }
  function onMediaChange(event) { if (reducedMotionOverride != null) return; reducedMotion = program?.reducedMotion === "always-reduce" || (program?.reducedMotion !== "ignore" && event.matches === true); if (reducedMotion) clearMotion(); }
  media?.addEventListener?.("change", onMediaChange);
  function destroy() { disposed = true; stopVoices(); pendingAudio = []; clearMotion(); decodedAudioBuffers.clear(); audioResourceErrors.clear(); media?.removeEventListener?.("change", onMediaChange); try { context?.close?.(); } catch { /* Context teardown is best effort and never affects game state. */ } }
  return { handleEvents: handleEvents, update: update, unlock: unlock, suspend: suspend, resume: resume, reset: reset, setMuted: setMuted, setMasterVolume: setMasterVolume, setReducedMotion: setReducedMotion, getStatus: getStatus, getCameraOffset: getCameraOffset, getObjectTransform: getObjectTransform, drawWorld: drawWorld, drawOverlay: drawOverlay, destroy: destroy };
}
