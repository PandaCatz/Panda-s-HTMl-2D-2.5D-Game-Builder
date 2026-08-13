import { inspectPresentationAudioResources } from "./looplab-audio-resources.mjs";

export const LOOPLAB_PRESENTATION_PROGRAM_SCHEMA = "looplab-presentation-program/v1";
export const LOOPLAB_PRESENTATION_REPORT_SCHEMA = "looplab-presentation-report/v1";

export const LOOPLAB_PRESENTATION_LIMITS = Object.freeze({
  maximumAudioCues: 32,
  maximumMotionCues: 32,
  maximumEffectsPerCue: 6,
  maximumCameraZones: 32,
  maximumAnimationMachines: 32,
  maximumAnimationStatesPerMachine: 32,
  maximumAnimationTransitionsPerMachine: 64,
  maximumAnimationFramesPerState: 64,
  maximumEffectPlugins: 32,
  maximumEffectsPerPlugin: 8,
  maximumAssetRequirementsPerPlugin: 8,
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
  accessibilityBoundary: "Reduced-motion preference selects authored camera, animation, and effect alternatives; legacy inline motion still disables shake, particles, and squash while preserving static flash and DOM status equivalents.",
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
const PRIMITIVE_EFFECTS = new Set(["particles", "shake", "flash", "squash"]);
const MOTION_EFFECTS = new Set([...PRIMITIVE_EFFECTS, "plugin"]);
const TARGETS = new Set(["event-object", "player", "center"]);
const STATUS = new Set(["draft", "approved"]);
const REDUCED_MOTION = new Set(["respect", "always-reduce", "ignore"]);
const CAMERA_MODES = new Set(["follow", "fixed"]);
const CAMERA_TARGET_TYPES = new Set(["object-id", "object-kind"]);
const ANIMATION_INTERRUPT_MODES = new Set(["immediate", "frame-end", "cycle-end", "locked"]);
const ANIMATION_TRIGGERS = new Set(["event", "action-active", "action-inactive", "moving", "stopped", "grounded", "airborne", "runtime-state", "complete"]);
const EFFECT_REDUCED_MOTION_MODES = new Set(["replace", "omit"]);

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
  if (type === "plugin") return {
    type,
    pluginId: cleanString(effect.pluginId),
  };
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
    ...(STABLE_ID.test(cleanString(effect.assetId)) ? {
      assetId: cleanString(effect.assetId),
      frame: integer(effect.frame, 0, 0, 65_535),
    } : {}),
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

function normalizeCameraTarget(target = {}) {
  return {
    type: CAMERA_TARGET_TYPES.has(target.type) ? target.type : "object-kind",
    id: cleanString(target.id) || "player",
  };
}

function normalizeCameraBehavior(behavior = {}, reduced = false) {
  return {
    mode: CAMERA_MODES.has(behavior.mode) ? behavior.mode : "follow",
    centerX: finite(behavior.centerX, 0),
    centerY: finite(behavior.centerY, 0),
    offsetX: finite(behavior.offsetX, 0),
    offsetY: finite(behavior.offsetY, 0),
    zoom: clamp(behavior.zoom, 0.25, 4, 1),
    lerpX: clamp(behavior.lerpX, 0, 1, reduced ? 1 : 0.18),
    lerpY: clamp(behavior.lerpY, 0, 1, reduced ? 1 : 0.18),
    deadzoneWidth: clamp(behavior.deadzoneWidth, 0, 8_192, 120),
    deadzoneHeight: clamp(behavior.deadzoneHeight, 0, 8_192, 72),
    transitionMs: integer(behavior.transitionMs, reduced ? 0 : 220, 0, 4_000),
    clampToMap: bool(behavior.clampToMap, true),
  };
}

function normalizeCameraZone(zone = {}) {
  const behavior = normalizeCameraBehavior(zone.behavior);
  return {
    id: cleanString(zone.id),
    mapId: cleanString(zone.mapId),
    enabled: bool(zone.enabled, true),
    priority: integer(zone.priority, 0, -100, 100),
    x: finite(zone.x, 0),
    y: finite(zone.y, 0),
    width: clamp(zone.width, 1, 1_000_000, 320),
    height: clamp(zone.height, 1, 1_000_000, 180),
    behavior,
    reducedMotionBehavior: normalizeCameraBehavior(zone.reducedMotionBehavior ?? { ...behavior, lerpX: 1, lerpY: 1, transitionMs: 0 }, true),
  };
}

function normalizeAnimationState(state = {}) {
  const frames = Array.isArray(state.frames)
    ? state.frames.slice(0, LOOPLAB_PRESENTATION_LIMITS.maximumAnimationFramesPerState).map((frame) => integer(frame, 0, 0, 65_535))
    : [0];
  return {
    id: cleanString(state.id),
    assetId: cleanString(state.assetId),
    frames: frames.length ? frames : [0],
    fps: clamp(state.fps, 1, 60, 8),
    loop: bool(state.loop, true),
    interruptMode: ANIMATION_INTERRUPT_MODES.has(state.interruptMode) ? state.interruptMode : "immediate",
    reducedMotionFrame: integer(state.reducedMotionFrame ?? frames[0], 0, 0, 65_535),
  };
}

function normalizeAnimationTransition(transition = {}) {
  const trigger = ANIMATION_TRIGGERS.has(transition.trigger) ? transition.trigger : "event";
  return {
    id: cleanString(transition.id),
    from: cleanString(transition.from) || "*",
    to: cleanString(transition.to),
    trigger,
    priority: integer(transition.priority, 0, -100, 100),
    queue: bool(transition.queue, true),
    ...(trigger === "event" ? { event: cleanString(transition.event) } : {}),
    ...(trigger === "action-active" || trigger === "action-inactive" ? { actionId: cleanString(transition.actionId) } : {}),
    ...(trigger === "runtime-state" ? { value: cleanString(transition.value) } : {}),
  };
}

function normalizeAnimationMachine(machine = {}) {
  return {
    id: cleanString(machine.id),
    enabled: bool(machine.enabled, true),
    target: normalizeCameraTarget(machine.target),
    initialState: cleanString(machine.initialState),
    states: Array.isArray(machine.states)
      ? machine.states.slice(0, LOOPLAB_PRESENTATION_LIMITS.maximumAnimationStatesPerMachine).map(normalizeAnimationState)
      : [],
    transitions: Array.isArray(machine.transitions)
      ? machine.transitions.slice(0, LOOPLAB_PRESENTATION_LIMITS.maximumAnimationTransitionsPerMachine).map(normalizeAnimationTransition)
      : [],
  };
}

function normalizeAssetRequirement(requirement = {}) {
  return {
    assetId: cleanString(requirement.assetId),
    minimumFrames: integer(requirement.minimumFrames, 1, 1, 65_535),
    purpose: cleanString(requirement.purpose) || "effect",
  };
}

function normalizeEffectPlugin(plugin = {}) {
  const reducedMode = EFFECT_REDUCED_MOTION_MODES.has(plugin.reducedMotion?.mode) ? plugin.reducedMotion.mode : "omit";
  return {
    id: cleanString(plugin.id),
    enabled: bool(plugin.enabled, true),
    effects: Array.isArray(plugin.effects)
      ? plugin.effects.slice(0, LOOPLAB_PRESENTATION_LIMITS.maximumEffectsPerPlugin).map(normalizeMotionEffect).filter((effect) => PRIMITIVE_EFFECTS.has(effect.type))
      : [],
    reducedMotion: {
      mode: reducedMode,
      effects: reducedMode === "replace" && Array.isArray(plugin.reducedMotion?.effects)
        ? plugin.reducedMotion.effects.slice(0, LOOPLAB_PRESENTATION_LIMITS.maximumEffectsPerPlugin).map(normalizeMotionEffect).filter((effect) => PRIMITIVE_EFFECTS.has(effect.type))
        : [],
    },
    assetRequirements: Array.isArray(plugin.assetRequirements)
      ? plugin.assetRequirements.slice(0, LOOPLAB_PRESENTATION_LIMITS.maximumAssetRequirementsPerPlugin).map(normalizeAssetRequirement)
      : [],
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
    camera: {
      enabled: bool(input.camera?.enabled, false),
      subject: normalizeCameraTarget(input.camera?.subject),
      defaultBehavior: normalizeCameraBehavior(input.camera?.defaultBehavior),
      zones: Array.isArray(input.camera?.zones)
        ? input.camera.zones.slice(0, LOOPLAB_PRESENTATION_LIMITS.maximumCameraZones).map(normalizeCameraZone)
        : [],
    },
    animation: {
      enabled: bool(input.animation?.enabled, false),
      machines: Array.isArray(input.animation?.machines)
        ? input.animation.machines.slice(0, LOOPLAB_PRESENTATION_LIMITS.maximumAnimationMachines).map(normalizeAnimationMachine)
        : [],
    },
    effectPlugins: Array.isArray(input.effectPlugins)
      ? input.effectPlugins.slice(0, LOOPLAB_PRESENTATION_LIMITS.maximumEffectPlugins).map(normalizeEffectPlugin)
      : [],
  };
}

const ALLOWED_KEYS = Object.freeze({
  root: new Set(["version", "status", "enabled", "reducedMotion", "audio", "motion", "camera", "animation", "effectPlugins"]),
  audio: new Set(["enabled", "masterVolume", "maxVoices", "debounceMs", "cues"]),
  audioCue: new Set(["id", "event", "enabled", "kind", "waveform", "frequency", "endFrequency", "filterFrequency", "durationMs", "attackMs", "releaseMs", "volume", "pitchVariationCents", "resourceId", "playbackRate"]),
  motion: new Set(["enabled", "maxParticles", "cues"]),
  motionCue: new Set(["id", "event", "enabled", "target", "effects"]),
  particles: new Set(["type", "count", "color", "secondaryColor", "speed", "spread", "direction", "lifetimeMs", "size", "gravity", "assetId", "frame"]),
  shake: new Set(["type", "intensity", "durationMs"]),
  flash: new Set(["type", "color", "opacity", "durationMs"]),
  squash: new Set(["type", "scaleX", "scaleY", "durationMs"]),
  plugin: new Set(["type", "pluginId"]),
  camera: new Set(["enabled", "subject", "defaultBehavior", "zones"]),
  target: new Set(["type", "id"]),
  cameraBehavior: new Set(["mode", "centerX", "centerY", "offsetX", "offsetY", "zoom", "lerpX", "lerpY", "deadzoneWidth", "deadzoneHeight", "transitionMs", "clampToMap"]),
  cameraZone: new Set(["id", "mapId", "enabled", "priority", "x", "y", "width", "height", "behavior", "reducedMotionBehavior"]),
  animation: new Set(["enabled", "machines"]),
  animationMachine: new Set(["id", "enabled", "target", "initialState", "states", "transitions"]),
  animationState: new Set(["id", "assetId", "frames", "fps", "loop", "interruptMode", "reducedMotionFrame"]),
  animationTransition: new Set(["id", "from", "to", "trigger", "priority", "queue", "event", "actionId", "value"]),
  effectPlugin: new Set(["id", "enabled", "effects", "reducedMotion", "assetRequirements"]),
  effectPluginReducedMotion: new Set(["mode", "effects"]),
  assetRequirement: new Set(["assetId", "minimumFrames", "purpose"]),
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

function validateStableIdentityList(entries, field, issues, code = "presentation-id") {
  const ids = new Set();
  for (const [index, entry] of entries.entries()) {
    if (!STABLE_ID.test(entry?.id ?? "")) addIssue(issues, "error", `${code}-invalid`, `${field}[${index}].id must be a stable non-empty ID.`, { field, index });
    else if (ids.has(entry.id)) addIssue(issues, "error", `${code}-duplicate`, `${field}[${index}].id duplicates ${entry.id}.`, { field, index, id: entry.id });
    else ids.add(entry.id);
  }
  return ids;
}

function validateTarget(target, field, issues) {
  unknownKeys(target, ALLOWED_KEYS.target, field, issues);
  if (!target || typeof target !== "object" || Array.isArray(target)) addIssue(issues, "error", "presentation-target-shape", `${field} must be an object.`);
  else {
    if (!CAMERA_TARGET_TYPES.has(target.type)) addIssue(issues, "error", "presentation-target-type", `${field}.type must be object-id or object-kind.`);
    if (!STABLE_ID.test(target.id ?? "")) addIssue(issues, "error", "presentation-target-id", `${field}.id must be a stable object ID or kind.`);
  }
}

function validateCameraBehavior(behavior, field, issues) {
  unknownKeys(behavior, ALLOWED_KEYS.cameraBehavior, field, issues);
  if (!behavior || typeof behavior !== "object" || Array.isArray(behavior)) {
    addIssue(issues, "error", "presentation-camera-behavior-shape", `${field} must be an object.`);
    return;
  }
  if (!CAMERA_MODES.has(behavior.mode)) addIssue(issues, "error", "presentation-camera-mode", `${field}.mode must be follow or fixed.`);
  for (const key of ["centerX", "centerY", "offsetX", "offsetY", "zoom", "lerpX", "lerpY", "deadzoneWidth", "deadzoneHeight", "transitionMs"]) {
    if (!Number.isFinite(Number(behavior[key]))) addIssue(issues, "error", "presentation-camera-number", `${field}.${key} must be finite.`, { field: `${field}.${key}` });
  }
  if (Number(behavior.zoom) < 0.25 || Number(behavior.zoom) > 4) addIssue(issues, "error", "presentation-camera-zoom", `${field}.zoom must be from 0.25 through 4.`);
  for (const key of ["lerpX", "lerpY"]) if (Number(behavior[key]) < 0 || Number(behavior[key]) > 1) addIssue(issues, "error", "presentation-camera-lerp", `${field}.${key} must be from 0 through 1.`);
  for (const key of ["deadzoneWidth", "deadzoneHeight", "transitionMs"]) if (Number(behavior[key]) < 0) addIssue(issues, "error", "presentation-camera-range", `${field}.${key} must not be negative.`);
  if (typeof behavior.clampToMap !== "boolean") addIssue(issues, "error", "presentation-camera-clamp", `${field}.clampToMap must be boolean.`);
}

function validatePrimitiveEffect(effect, field, issues) {
  const type = effect?.type;
  if (!PRIMITIVE_EFFECTS.has(type)) {
    addIssue(issues, "error", "presentation-plugin-effect-type", `${field} must use a built-in declarative primitive.`, { field });
    return;
  }
  unknownKeys(effect, ALLOWED_KEYS[type], field, issues);
}

function projectMaps(project) {
  return Array.isArray(project?.maps) && project.maps.length ? project.maps : [{ id: project?.activeMapId ?? "map-main", width: project?.width, height: project?.height, objects: project?.objects ?? [] }];
}

function targetObjects(project, target) {
  const objects = projectMaps(project).flatMap((map) => map?.objects ?? []);
  if (target?.type === "object-id") return objects.filter((object) => object?.id === target.id);
  if (target?.type === "object-kind") return objects.filter((object) => object?.kind === target.id);
  return [];
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
    metrics: { audioCueCount: 0, motionCueCount: 0, effectCount: 0, mappedEventCount: 0, feedbackCoverage: 0, referencedAudioResourceCount: 0, encodedAudioBytes: 0, decodedAudioBytes: 0, cameraZoneCount: 0, animationMachineCount: 0, animationStateCount: 0, animationTransitionCount: 0, effectPluginCount: 0, assetRequirementCount: 0 },
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
  unknownKeys(input.camera, ALLOWED_KEYS.camera, "presentationProgram.camera", issues);
  unknownKeys(input.animation, ALLOWED_KEYS.animation, "presentationProgram.animation", issues);
  if (input.version !== undefined && input.version !== 1) addIssue(issues, "error", "presentation-version", "presentationProgram.version must be 1.");
  if (input.status !== undefined && !STATUS.has(input.status)) addIssue(issues, "error", "presentation-status", "presentationProgram.status must be draft or approved.");
  if (input.reducedMotion !== undefined && !REDUCED_MOTION.has(input.reducedMotion)) addIssue(issues, "error", "presentation-reduced-motion", "presentationProgram.reducedMotion must be respect, always-reduce, or ignore.");
  if (input.audio !== undefined && (!input.audio || typeof input.audio !== "object" || Array.isArray(input.audio))) addIssue(issues, "error", "presentation-audio-shape", "presentationProgram.audio must be an object.");
  if (input.motion !== undefined && (!input.motion || typeof input.motion !== "object" || Array.isArray(input.motion))) addIssue(issues, "error", "presentation-motion-shape", "presentationProgram.motion must be an object.");
  if (input.camera !== undefined && (!input.camera || typeof input.camera !== "object" || Array.isArray(input.camera))) addIssue(issues, "error", "presentation-camera-shape", "presentationProgram.camera must be an object.");
  if (input.animation !== undefined && (!input.animation || typeof input.animation !== "object" || Array.isArray(input.animation))) addIssue(issues, "error", "presentation-animation-shape", "presentationProgram.animation must be an object.");
  if (input.effectPlugins !== undefined && !Array.isArray(input.effectPlugins)) addIssue(issues, "error", "presentation-effect-plugins-shape", "presentationProgram.effectPlugins must be an array.");
  if (input.audio?.cues !== undefined && !Array.isArray(input.audio.cues)) addIssue(issues, "error", "presentation-audio-cues-shape", "presentationProgram.audio.cues must be an array.");
  if (input.motion?.cues !== undefined && !Array.isArray(input.motion.cues)) addIssue(issues, "error", "presentation-motion-cues-shape", "presentationProgram.motion.cues must be an array.");
  if ((input.audio?.cues?.length ?? 0) > LOOPLAB_PRESENTATION_LIMITS.maximumAudioCues) addIssue(issues, "error", "presentation-audio-cue-limit", `presentationProgram.audio.cues may contain at most ${LOOPLAB_PRESENTATION_LIMITS.maximumAudioCues} cues.`);
  if ((input.motion?.cues?.length ?? 0) > LOOPLAB_PRESENTATION_LIMITS.maximumMotionCues) addIssue(issues, "error", "presentation-motion-cue-limit", `presentationProgram.motion.cues may contain at most ${LOOPLAB_PRESENTATION_LIMITS.maximumMotionCues} cues.`);
  if ((input.camera?.zones?.length ?? 0) > LOOPLAB_PRESENTATION_LIMITS.maximumCameraZones) addIssue(issues, "error", "presentation-camera-zone-limit", `presentationProgram.camera.zones may contain at most ${LOOPLAB_PRESENTATION_LIMITS.maximumCameraZones} zones.`);
  if ((input.animation?.machines?.length ?? 0) > LOOPLAB_PRESENTATION_LIMITS.maximumAnimationMachines) addIssue(issues, "error", "presentation-animation-machine-limit", `presentationProgram.animation.machines may contain at most ${LOOPLAB_PRESENTATION_LIMITS.maximumAnimationMachines} machines.`);
  if ((input.effectPlugins?.length ?? 0) > LOOPLAB_PRESENTATION_LIMITS.maximumEffectPlugins) addIssue(issues, "error", "presentation-effect-plugin-limit", `presentationProgram.effectPlugins may contain at most ${LOOPLAB_PRESENTATION_LIMITS.maximumEffectPlugins} plugins.`);

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

  const maps = new Map(projectMaps(project).map((map) => [map.id, map]));
  if (input.camera?.subject !== undefined) validateTarget(input.camera.subject, "presentationProgram.camera.subject", issues);
  if (input.camera?.defaultBehavior !== undefined) validateCameraBehavior(input.camera.defaultBehavior, "presentationProgram.camera.defaultBehavior", issues);
  if (input.camera?.zones !== undefined && !Array.isArray(input.camera.zones)) addIssue(issues, "error", "presentation-camera-zones-shape", "presentationProgram.camera.zones must be an array.");
  validateStableIdentityList(input.camera?.zones ?? [], "presentationProgram.camera.zones", issues, "presentation-camera-zone-id");
  for (const [index, zone] of (input.camera?.zones ?? []).entries()) {
    const field = `presentationProgram.camera.zones[${index}]`;
    unknownKeys(zone, ALLOWED_KEYS.cameraZone, field, issues);
    if (!STABLE_ID.test(zone?.mapId ?? "") || !maps.has(zone.mapId)) addIssue(issues, "error", "presentation-camera-map", `${field}.mapId must reference an authored map.`, { index, mapId: zone?.mapId });
    for (const key of ["x", "y", "width", "height", "priority"]) if (!Number.isFinite(Number(zone?.[key]))) addIssue(issues, "error", "presentation-camera-zone-number", `${field}.${key} must be finite.`);
    if (Number(zone?.width) <= 0 || Number(zone?.height) <= 0) addIssue(issues, "error", "presentation-camera-zone-size", `${field} must have positive width and height.`);
    const map = maps.get(zone?.mapId);
    if (map && (Number(zone.x) < 0 || Number(zone.y) < 0 || Number(zone.x) + Number(zone.width) > Number(map.width ?? project?.width ?? 0) || Number(zone.y) + Number(zone.height) > Number(map.height ?? project?.height ?? 0))) addIssue(issues, "error", "presentation-camera-zone-bounds", `${field} must stay inside its authored map bounds.`, { index, mapId: zone.mapId });
    validateCameraBehavior(zone?.behavior, `${field}.behavior`, issues);
    if (zone?.reducedMotionBehavior === undefined && input.status === "approved") addIssue(issues, "error", "presentation-camera-reduced-motion-missing", `${field} requires an explicit reducedMotionBehavior when approved.`, { index, zoneId: zone?.id });
    else if (zone?.reducedMotionBehavior !== undefined) validateCameraBehavior(zone.reducedMotionBehavior, `${field}.reducedMotionBehavior`, issues);
  }

  if (input.animation?.machines !== undefined && !Array.isArray(input.animation.machines)) addIssue(issues, "error", "presentation-animation-machines-shape", "presentationProgram.animation.machines must be an array.");
  validateStableIdentityList(input.animation?.machines ?? [], "presentationProgram.animation.machines", issues, "presentation-animation-machine-id");
  const assets = new Map((project?.assets ?? []).map((asset) => [asset.id, asset]));
  for (const [machineIndex, machine] of (input.animation?.machines ?? []).entries()) {
    const field = `presentationProgram.animation.machines[${machineIndex}]`;
    unknownKeys(machine, ALLOWED_KEYS.animationMachine, field, issues);
    validateTarget(machine?.target, `${field}.target`, issues);
    if (targetObjects(project, machine?.target).length === 0) addIssue(issues, "error", "presentation-animation-target-missing", `${field}.target does not resolve to an authored object.`, { machineIndex, machineId: machine?.id });
    if (!Array.isArray(machine?.states) || machine.states.length === 0) addIssue(issues, "error", "presentation-animation-states-empty", `${field}.states must be a non-empty array.`);
    if ((machine?.states?.length ?? 0) > LOOPLAB_PRESENTATION_LIMITS.maximumAnimationStatesPerMachine) addIssue(issues, "error", "presentation-animation-state-limit", `${field}.states exceeds the bounded limit.`);
    if (!Array.isArray(machine?.transitions)) addIssue(issues, "error", "presentation-animation-transitions-shape", `${field}.transitions must be an array.`);
    if ((machine?.transitions?.length ?? 0) > LOOPLAB_PRESENTATION_LIMITS.maximumAnimationTransitionsPerMachine) addIssue(issues, "error", "presentation-animation-transition-limit", `${field}.transitions exceeds the bounded limit.`);
    const stateIds = validateStableIdentityList(machine?.states ?? [], `${field}.states`, issues, "presentation-animation-state-id");
    const transitionIds = validateStableIdentityList(machine?.transitions ?? [], `${field}.transitions`, issues, "presentation-animation-transition-id");
    if (!stateIds.has(machine?.initialState)) addIssue(issues, "error", "presentation-animation-initial-state", `${field}.initialState must reference one authored state.`, { machineIndex, machineId: machine?.id });
    for (const [stateIndex, state] of (machine?.states ?? []).entries()) {
      const stateField = `${field}.states[${stateIndex}]`;
      unknownKeys(state, ALLOWED_KEYS.animationState, stateField, issues);
      const asset = assets.get(state?.assetId);
      if (!STABLE_ID.test(state?.assetId ?? "") || !asset) addIssue(issues, "error", "presentation-animation-asset-missing", `${stateField}.assetId must reference an embedded sprite asset.`, { machineIndex, stateIndex, assetId: state?.assetId });
      else if (asset.type !== "sprite") addIssue(issues, "error", "presentation-animation-asset-type", `${stateField}.assetId must reference a sprite rather than ${String(asset.type)}.`, { machineIndex, stateIndex, assetId: state?.assetId });
      if (!Array.isArray(state?.frames) || state.frames.length === 0) addIssue(issues, "error", "presentation-animation-frames-empty", `${stateField}.frames must be a non-empty array.`);
      if ((state?.frames?.length ?? 0) > LOOPLAB_PRESENTATION_LIMITS.maximumAnimationFramesPerState) addIssue(issues, "error", "presentation-animation-frame-limit", `${stateField}.frames exceeds the bounded limit.`);
      for (const frame of state?.frames ?? []) if (!Number.isInteger(frame) || frame < 0 || (asset && frame >= Number(asset.frames ?? 0))) addIssue(issues, "error", "presentation-animation-frame-invalid", `${stateField}.frames contains a frame outside asset ${String(state?.assetId)}.`, { machineIndex, stateIndex, frame });
      if (!ANIMATION_INTERRUPT_MODES.has(state?.interruptMode)) addIssue(issues, "error", "presentation-animation-interrupt-mode", `${stateField}.interruptMode is unsupported.`);
      if (!Number.isFinite(Number(state?.fps)) || Number(state.fps) < 1 || Number(state.fps) > 60) addIssue(issues, "error", "presentation-animation-fps", `${stateField}.fps must be from 1 through 60.`);
      if (input.status === "approved" && (state?.frames?.length ?? 0) > 1 && !Number.isInteger(state?.reducedMotionFrame)) addIssue(issues, "error", "presentation-animation-reduced-frame-missing", `${stateField} requires reducedMotionFrame when approved.`, { machineIndex, stateIndex, stateId: state?.id });
      if (state?.reducedMotionFrame !== undefined && (!Number.isInteger(state.reducedMotionFrame) || state.reducedMotionFrame < 0 || (asset && state.reducedMotionFrame >= Number(asset.frames ?? 0)))) addIssue(issues, "error", "presentation-animation-reduced-frame-invalid", `${stateField}.reducedMotionFrame must address the same embedded asset.`, { machineIndex, stateIndex });
      if (state?.interruptMode === "locked" && state?.loop === true) addIssue(issues, "error", "presentation-animation-locked-loop", `${stateField} cannot be both locked and looping because no transition could leave it.`, { machineIndex, stateIndex });
    }
    for (const [transitionIndex, transition] of (machine?.transitions ?? []).entries()) {
      const transitionField = `${field}.transitions[${transitionIndex}]`;
      unknownKeys(transition, ALLOWED_KEYS.animationTransition, transitionField, issues);
      if (transition?.from !== "*" && !stateIds.has(transition?.from)) addIssue(issues, "error", "presentation-animation-transition-from", `${transitionField}.from must be * or an authored state.`);
      if (!stateIds.has(transition?.to)) addIssue(issues, "error", "presentation-animation-transition-to", `${transitionField}.to must reference an authored state.`);
      if (!ANIMATION_TRIGGERS.has(transition?.trigger)) addIssue(issues, "error", "presentation-animation-trigger", `${transitionField}.trigger is unsupported.`);
      if (transition?.trigger === "event" && !STABLE_ID.test(transition?.event ?? "")) addIssue(issues, "error", "presentation-animation-event", `${transitionField}.event must be a stable event ID.`);
      if ((transition?.trigger === "action-active" || transition?.trigger === "action-inactive") && !STABLE_ID.test(transition?.actionId ?? "")) addIssue(issues, "error", "presentation-animation-action", `${transitionField}.actionId must be a stable semantic input action ID.`);
      if (transition?.trigger === "runtime-state" && !cleanString(transition?.value)) addIssue(issues, "error", "presentation-animation-runtime-state", `${transitionField}.value must be non-empty.`);
      if (!transitionIds.has(transition?.id)) continue;
    }
  }

  const pluginIds = validateStableIdentityList(input.effectPlugins ?? [], "presentationProgram.effectPlugins", issues, "presentation-effect-plugin-id");
  for (const [pluginIndex, plugin] of (input.effectPlugins ?? []).entries()) {
    const field = `presentationProgram.effectPlugins[${pluginIndex}]`;
    unknownKeys(plugin, ALLOWED_KEYS.effectPlugin, field, issues);
    if (!Array.isArray(plugin?.effects) || plugin.effects.length === 0) addIssue(issues, "error", "presentation-effect-plugin-empty", `${field}.effects must contain at least one declarative primitive.`);
    if ((plugin?.effects?.length ?? 0) > LOOPLAB_PRESENTATION_LIMITS.maximumEffectsPerPlugin) addIssue(issues, "error", "presentation-effect-plugin-effect-limit", `${field}.effects exceeds the bounded limit.`);
    (plugin?.effects ?? []).forEach((effect, effectIndex) => validatePrimitiveEffect(effect, `${field}.effects[${effectIndex}]`, issues));
    unknownKeys(plugin?.reducedMotion, ALLOWED_KEYS.effectPluginReducedMotion, `${field}.reducedMotion`, issues);
    if (!plugin?.reducedMotion || !EFFECT_REDUCED_MOTION_MODES.has(plugin.reducedMotion.mode)) addIssue(issues, "error", "presentation-effect-plugin-reduced-motion", `${field}.reducedMotion must explicitly replace or omit motion.`);
    if (plugin?.reducedMotion?.mode === "replace" && (!Array.isArray(plugin.reducedMotion.effects) || plugin.reducedMotion.effects.length === 0)) addIssue(issues, "error", "presentation-effect-plugin-reduced-empty", `${field}.reducedMotion.effects must be non-empty for replace mode.`);
    (plugin?.reducedMotion?.effects ?? []).forEach((effect, effectIndex) => validatePrimitiveEffect(effect, `${field}.reducedMotion.effects[${effectIndex}]`, issues));
    if (!Array.isArray(plugin?.assetRequirements)) addIssue(issues, "error", "presentation-effect-plugin-assets-shape", `${field}.assetRequirements must be an array.`);
    if ((plugin?.assetRequirements?.length ?? 0) > LOOPLAB_PRESENTATION_LIMITS.maximumAssetRequirementsPerPlugin) addIssue(issues, "error", "presentation-effect-plugin-asset-limit", `${field}.assetRequirements exceeds the bounded limit.`);
    const requiredAssetIds = new Set();
    for (const [requirementIndex, requirement] of (plugin?.assetRequirements ?? []).entries()) {
      const requirementField = `${field}.assetRequirements[${requirementIndex}]`;
      unknownKeys(requirement, ALLOWED_KEYS.assetRequirement, requirementField, issues);
      if (!STABLE_ID.test(requirement?.assetId ?? "") || requiredAssetIds.has(requirement.assetId)) addIssue(issues, "error", "presentation-effect-plugin-asset-id", `${requirementField}.assetId must be stable and unique within the plugin.`);
      else requiredAssetIds.add(requirement.assetId);
      const asset = assets.get(requirement?.assetId);
      if (!asset) addIssue(issues, "error", "presentation-effect-plugin-asset-missing", `${requirementField}.assetId is not embedded in the project.`, { pluginIndex, requirementIndex, assetId: requirement?.assetId });
      if (!Number.isInteger(requirement?.minimumFrames) || requirement.minimumFrames < 1) addIssue(issues, "error", "presentation-effect-plugin-minimum-frames", `${requirementField}.minimumFrames must be a positive integer.`);
      else if (asset && Number(asset.frames ?? 0) < requirement.minimumFrames) addIssue(issues, "error", "presentation-effect-plugin-asset-frames", `${requirementField} requires ${requirement.minimumFrames} frames but asset ${requirement.assetId} has ${Number(asset.frames ?? 0)}.`, { pluginIndex, requirementIndex, assetId: requirement.assetId });
    }
    for (const effect of [...(plugin?.effects ?? []), ...(plugin?.reducedMotion?.effects ?? [])]) if (effect?.assetId && !requiredAssetIds.has(effect.assetId)) addIssue(issues, "error", "presentation-effect-plugin-asset-undeclared", `${field} uses asset ${effect.assetId} without declaring it in assetRequirements.`, { pluginIndex, assetId: effect.assetId });
  }
  for (const [cueIndex, cue] of (input.motion?.cues ?? []).entries()) for (const [effectIndex, effect] of (cue?.effects ?? []).entries()) if (effect?.type === "plugin" && !pluginIds.has(effect.pluginId)) addIssue(issues, "error", "presentation-effect-plugin-reference", `Motion cue ${cueIndex} effect ${effectIndex} references missing plugin ${String(effect.pluginId)}.`, { cueIndex, effectIndex, pluginId: effect.pluginId });

  const program = normalizePresentationProgram(input);
  const audioResources = inspectPresentationAudioResources(project, program.audio.cues);
  issues.push(...audioResources.issues);
  validateCueIdentity(program.audio.cues, "presentationProgram.audio.cues", issues);
  validateCueIdentity(program.motion.cues, "presentationProgram.motion.cues", issues);
  if (program.enabled && program.audio.enabled && program.audio.cues.length === 0) addIssue(issues, "warning", "presentation-audio-empty", "Authored audio is enabled but has no event cues.");
  if (program.enabled && program.motion.enabled && program.motion.cues.length === 0) addIssue(issues, "warning", "presentation-motion-empty", "Authored motion is enabled but has no event cues.");
  if (program.enabled && program.camera.enabled && program.camera.zones.length === 0) addIssue(issues, "warning", "presentation-camera-zones-empty", "Authored camera control is enabled but has no camera zones; only the default behavior will apply.");
  if (program.enabled && program.animation.enabled && program.animation.machines.length === 0) addIssue(issues, "warning", "presentation-animation-machines-empty", "Authored animation is enabled but has no animation machines.");
  if (program.reducedMotion === "ignore") addIssue(issues, "warning", "presentation-reduced-motion-ignored", "The presentation program ignores the user's reduced-motion preference.");

  const knownEvents = authoredEvents(project);
  const animationEvents = program.animation.machines.flatMap((machine) => machine.transitions.filter((transition) => transition.trigger === "event").map((transition) => transition.event));
  const mappedEvents = [...new Set([...program.audio.cues, ...program.motion.cues].filter((cue) => cue.enabled).map((cue) => cue.event).concat(animationEvents))].sort();
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
      cameraZoneCount: program.camera.zones.length,
      animationMachineCount: program.animation.machines.length,
      animationStateCount: program.animation.machines.reduce((total, machine) => total + machine.states.length, 0),
      animationTransitionCount: program.animation.machines.reduce((total, machine) => total + machine.transitions.length, 0),
      effectPluginCount: program.effectPlugins.length,
      assetRequirementCount: program.effectPlugins.reduce((total, plugin) => total + plugin.assetRequirements.length, 0),
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
    camera: {
      enabled: false,
      subject: { type: "object-kind", id: "player" },
      defaultBehavior: { mode: "follow", centerX: 0, centerY: 0, offsetX: 0, offsetY: 0, zoom: 1, lerpX: 0.18, lerpY: 0.18, deadzoneWidth: 120, deadzoneHeight: 72, transitionMs: 220, clampToMap: true },
      zones: [],
    },
    animation: { enabled: false, machines: [] },
    effectPlugins: [],
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
  const getSnapshot = typeof options.getSnapshot === "function" ? options.getSnapshot : function () { return { mapId: null, width: Number(options.width || 0), height: Number(options.height || 0), objects: [], activeActionIds: [], screenBounds: { x: 0, y: 0, width: Number(options.width || 0), height: Number(options.height || 0) } }; };
  const projectPoint = typeof options.projectPoint === "function" ? options.projectPoint : function (point) { return { x: Number(point?.x || 0), y: Number(point?.y || 0) }; };
  const getAssetFrame = typeof options.getAssetFrame === "function" ? options.getAssetFrame : function () { return null; };
  const audioConfig = program?.audio || { enabled: false, cues: [] };
  const motionConfig = program?.motion || { enabled: false, cues: [] };
  const cameraConfig = program?.camera || { enabled: false, subject: { type: "object-kind", id: "player" }, defaultBehavior: { mode: "follow", zoom: 1, lerpX: 1, lerpY: 1, deadzoneWidth: 0, deadzoneHeight: 0, transitionMs: 0, clampToMap: true }, zones: [] };
  const animationConfig = program?.animation || { enabled: false, machines: [] };
  const effectPlugins = new Map();
  (program?.effectPlugins || []).forEach(function (plugin) { if (plugin?.enabled !== false && plugin?.id) effectPlugins.set(plugin.id, plugin); });
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
  const animationInstances = new Map();
  const queuedAnimationEvents = [];
  let shakeIntensity = 0;
  let shakeRemaining = 0;
  let shakeTotal = 0;
  let flash = null;
  let disposed = false;
  let handledEventCount = 0;
  let triggeredAudioCueCount = 0;
  let triggeredMotionCueCount = 0;
  let skippedReducedMotionCount = 0;
  let triggeredEffectPluginCount = 0;
  let missingEffectPluginCount = 0;
  let cameraInitialized = false;
  let cameraCenterX = Number(options.width || 0) / 2;
  let cameraCenterY = Number(options.height || 0) / 2;
  let cameraZoom = 1;
  let activeCameraZoneId = null;
  let cameraZoneTransitionElapsed = 0;
  let cameraZoneTransitionMs = 0;
  let cameraZoneStartX = cameraCenterX;
  let cameraZoneStartY = cameraCenterY;
  let cameraZoneStartZoom = cameraZoom;
  let cameraTransitionCount = 0;
  let animationTransitionCount = 0;
  let rejectedAnimationTransitionCount = 0;
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
  function compareStable(first, second) { return String(first?.id || "").localeCompare(String(second?.id || "")); }
  function targetMatches(object, target) {
    if (!object || !target) return false;
    return target.type === "object-id" ? object.id === target.id : target.type === "object-kind" ? object.kind === target.id : false;
  }
  function snapshotObjects(snapshot) { return Array.isArray(snapshot?.objects) ? snapshot.objects : []; }
  function resolveCameraSubject(snapshot) {
    const target = cameraConfig.subject || { type: "object-kind", id: "player" };
    return snapshotObjects(snapshot).filter(function (object) { return targetMatches(object, target); }).sort(compareStable)[0] || null;
  }
  function screenPointForObject(object) {
    if (!object) return { x: 0, y: 0 };
    if (Number.isFinite(Number(object.screenX)) && Number.isFinite(Number(object.screenY))) return { x: Number(object.screenX), y: Number(object.screenY) };
    const projected = projectPoint({ x: Number(object.x || 0) + Number(object.width || 0) / 2, y: Number(object.y || 0) + Number(object.height || 0), z: Number(object.z || 0) });
    return { x: Number(projected?.x || 0), y: Number(projected?.y || 0) };
  }
  function cameraZoneFor(snapshot, subject) {
    if (!subject) return null;
    const mapId = String(snapshot?.mapId || "");
    const x = Number(subject.x || 0) + Number(subject.width || 0) / 2;
    const y = Number(subject.y || 0) + Number(subject.height || 0);
    return (cameraConfig.zones || []).filter(function (zone) {
      return zone?.enabled !== false && String(zone?.mapId || "") === mapId && x >= Number(zone.x || 0) && y >= Number(zone.y || 0) && x <= Number(zone.x || 0) + Number(zone.width || 0) && y <= Number(zone.y || 0) + Number(zone.height || 0);
    }).sort(function (first, second) {
      const priority = Number(second.priority || 0) - Number(first.priority || 0);
      if (priority) return priority;
      const area = Number(first.width || 0) * Number(first.height || 0) - Number(second.width || 0) * Number(second.height || 0);
      return area || compareStable(first, second);
    })[0] || null;
  }
  function clampCameraCenter(value, start, size, viewportSize) {
    if (!(size > 0) || viewportSize >= size) return start + size / 2;
    return Math.max(start + viewportSize / 2, Math.min(start + size - viewportSize / 2, value));
  }
  function updateCamera(delta) {
    if (!enabled || cameraConfig.enabled === false) return;
    const snapshot = getSnapshot() || {};
    const subject = resolveCameraSubject(snapshot);
    if (!subject) return;
    const zone = cameraZoneFor(snapshot, subject);
    const nextZoneId = zone?.id || null;
    const behavior = reducedMotion && zone?.reducedMotionBehavior ? zone.reducedMotionBehavior : zone?.behavior || cameraConfig.defaultBehavior || {};
    const subjectPoint = screenPointForObject(subject);
    const fixedPoint = projectPoint({ x: Number(behavior.centerX || 0), y: Number(behavior.centerY || 0), z: Number(subject.z || 0) }) || { x: 0, y: 0 };
    let desiredX = behavior.mode === "fixed" ? Number(fixedPoint.x || 0) : subjectPoint.x + Number(behavior.offsetX || 0);
    let desiredY = behavior.mode === "fixed" ? Number(fixedPoint.y || 0) : subjectPoint.y + Number(behavior.offsetY || 0);
    const desiredZoom = Math.max(0.25, Math.min(4, Number(behavior.zoom || 1)));
    if (cameraInitialized && behavior.mode !== "fixed") {
      const halfDeadzoneX = Math.max(0, Number(behavior.deadzoneWidth || 0)) / 2;
      const halfDeadzoneY = Math.max(0, Number(behavior.deadzoneHeight || 0)) / 2;
      const offsetSubjectX = subjectPoint.x + Number(behavior.offsetX || 0);
      const offsetSubjectY = subjectPoint.y + Number(behavior.offsetY || 0);
      desiredX = offsetSubjectX < cameraCenterX - halfDeadzoneX ? offsetSubjectX + halfDeadzoneX : offsetSubjectX > cameraCenterX + halfDeadzoneX ? offsetSubjectX - halfDeadzoneX : cameraCenterX;
      desiredY = offsetSubjectY < cameraCenterY - halfDeadzoneY ? offsetSubjectY + halfDeadzoneY : offsetSubjectY > cameraCenterY + halfDeadzoneY ? offsetSubjectY - halfDeadzoneY : cameraCenterY;
    }
    const bounds = snapshot?.screenBounds || { x: 0, y: 0, width: Number(snapshot?.width || options.width || 0), height: Number(snapshot?.height || options.height || 0) };
    if (behavior.clampToMap !== false) {
      desiredX = clampCameraCenter(desiredX, Number(bounds.x || 0), Number(bounds.width || 0), Number(options.width || snapshot?.width || 0) / desiredZoom);
      desiredY = clampCameraCenter(desiredY, Number(bounds.y || 0), Number(bounds.height || 0), Number(options.height || snapshot?.height || 0) / desiredZoom);
    }
    if (!cameraInitialized) {
      cameraCenterX = desiredX; cameraCenterY = desiredY; cameraZoom = desiredZoom; cameraInitialized = true; activeCameraZoneId = nextZoneId;
      return;
    }
    if (nextZoneId !== activeCameraZoneId) {
      activeCameraZoneId = nextZoneId;
      cameraZoneTransitionElapsed = 0;
      cameraZoneTransitionMs = Math.max(0, Number(behavior.transitionMs || 0));
      cameraZoneStartX = cameraCenterX; cameraZoneStartY = cameraCenterY; cameraZoneStartZoom = cameraZoom;
      cameraTransitionCount += 1;
    }
    if (cameraZoneTransitionElapsed < cameraZoneTransitionMs && cameraZoneTransitionMs > 0) {
      cameraZoneTransitionElapsed = Math.min(cameraZoneTransitionMs, cameraZoneTransitionElapsed + delta);
      const amount = cameraZoneTransitionElapsed / cameraZoneTransitionMs;
      const eased = amount * amount * (3 - 2 * amount);
      cameraCenterX = cameraZoneStartX + (desiredX - cameraZoneStartX) * eased;
      cameraCenterY = cameraZoneStartY + (desiredY - cameraZoneStartY) * eased;
      cameraZoom = cameraZoneStartZoom + (desiredZoom - cameraZoneStartZoom) * eased;
      return;
    }
    const frameScale = Math.max(0, delta) / (1000 / 60);
    const lerpX = 1 - Math.pow(1 - Math.max(0, Math.min(1, Number(behavior.lerpX ?? 1))), frameScale);
    const lerpY = 1 - Math.pow(1 - Math.max(0, Math.min(1, Number(behavior.lerpY ?? 1))), frameScale);
    cameraCenterX += (desiredX - cameraCenterX) * lerpX;
    cameraCenterY += (desiredY - cameraCenterY) * lerpY;
    cameraZoom += (desiredZoom - cameraZoom) * Math.max(lerpX, lerpY);
  }
  function matchingAnimationMachine(object) {
    return (animationConfig.machines || []).filter(function (machine) { return machine?.enabled !== false && targetMatches(object, machine.target); }).sort(compareStable)[0] || null;
  }
  function animationState(machine, stateId) { return (machine?.states || []).find(function (state) { return state.id === stateId; }) || null; }
  function ensureAnimationInstance(object) {
    if (!object || animationConfig.enabled === false || !enabled) return null;
    const machine = matchingAnimationMachine(object);
    if (!machine) return null;
    const key = String(machine.id) + ":" + String(object.id);
    let instance = animationInstances.get(key);
    if (!instance || instance.machine !== machine) {
      const initial = animationState(machine, machine.initialState) || (machine.states || [])[0];
      if (!initial) return null;
      instance = { key: key, objectId: object.id, machine: machine, stateId: initial.id, elapsedMs: 0, pending: null, completed: false };
      animationInstances.set(key, instance);
    }
    return instance;
  }
  function transitionMatches(transition, instance, object, snapshot, events, completed) {
    if (transition.from !== "*" && transition.from !== instance.stateId) return false;
    const actions = new Set(Array.isArray(snapshot?.activeActionIds) ? snapshot.activeActionIds : []);
    if (transition.trigger === "event") return events.some(function (event) { return event?.type === transition.event && (!event.objectId || event.objectId === object.id); });
    if (transition.trigger === "action-active") return actions.has(transition.actionId);
    if (transition.trigger === "action-inactive") return !actions.has(transition.actionId);
    const speed = Math.hypot(Number(object.vx || 0), Number(object.vy || 0));
    if (transition.trigger === "moving") return speed > 0.01;
    if (transition.trigger === "stopped") return speed <= 0.01;
    if (transition.trigger === "grounded") return object.grounded === true;
    if (transition.trigger === "airborne") return object.grounded === false;
    if (transition.trigger === "runtime-state") return String(object.runtimeState || "") === String(transition.value || "");
    if (transition.trigger === "complete") return completed;
    return false;
  }
  function transitionOrder(first, second) { return Number(second.priority || 0) - Number(first.priority || 0) || compareStable(first, second); }
  function applyAnimationTransition(instance, transition) {
    if (!animationState(instance.machine, transition.to) || transition.to === instance.stateId) return false;
    instance.stateId = transition.to; instance.elapsedMs = 0; instance.pending = null; instance.completed = false; animationTransitionCount += 1; return true;
  }
  function queueAnimationTransition(instance, transition) {
    if (transition.queue === false) { rejectedAnimationTransitionCount += 1; return; }
    if (!instance.pending || transitionOrder(transition, instance.pending) < 0) instance.pending = transition;
  }
  function transitionBoundaryAllows(state, boundaries) {
    if (state.interruptMode === "immediate") return true;
    if (state.interruptMode === "frame-end") return boundaries.frame;
    if (state.interruptMode === "cycle-end") return boundaries.cycle;
    return boundaries.completed;
  }
  function updateAnimations(delta) {
    if (!enabled || animationConfig.enabled === false) { queuedAnimationEvents.splice(0); return; }
    const snapshot = getSnapshot() || {};
    const events = queuedAnimationEvents.splice(0);
    const liveKeys = new Set();
    for (const object of snapshotObjects(snapshot).slice().sort(compareStable)) {
      const instance = ensureAnimationInstance(object);
      if (!instance) continue;
      liveKeys.add(instance.key);
      const state = animationState(instance.machine, instance.stateId);
      if (!state) continue;
      const frames = Array.isArray(state.frames) && state.frames.length ? state.frames : [0];
      const frameDuration = 1000 / Math.max(1, Number(state.fps || 1));
      const cycleDuration = frameDuration * frames.length;
      const previousElapsed = instance.elapsedMs;
      instance.elapsedMs += delta;
      let completed = false;
      if (state.loop !== true && instance.elapsedMs >= cycleDuration) { instance.elapsedMs = cycleDuration; completed = !instance.completed; instance.completed = true; }
      const boundaries = {
        frame: Math.floor(previousElapsed / frameDuration) !== Math.floor(instance.elapsedMs / frameDuration),
        cycle: state.loop === true && Math.floor(previousElapsed / cycleDuration) !== Math.floor(instance.elapsedMs / cycleDuration),
        completed: completed || instance.completed,
      };
      const candidate = (instance.machine.transitions || []).filter(function (transition) { return transitionMatches(transition, instance, object, snapshot, events, completed); }).sort(transitionOrder)[0] || null;
      if (candidate) {
        if (transitionBoundaryAllows(state, boundaries)) applyAnimationTransition(instance, candidate);
        else queueAnimationTransition(instance, candidate);
      }
      if (instance.pending && transitionBoundaryAllows(state, boundaries)) applyAnimationTransition(instance, instance.pending);
    }
    animationInstances.forEach(function (_instance, key) { if (!liveKeys.has(key)) animationInstances.delete(key); });
  }
  function getAnimationFrame(objectId, fallbackAssetId, fallbackFrame) {
    const snapshot = getSnapshot() || {};
    const object = snapshotObjects(snapshot).find(function (candidate) { return candidate.id === objectId; });
    const instance = ensureAnimationInstance(object);
    if (!instance) return { assetId: fallbackAssetId || null, frame: Number(fallbackFrame || 0), machineId: null, stateId: null };
    const state = animationState(instance.machine, instance.stateId);
    if (!state) return { assetId: fallbackAssetId || null, frame: Number(fallbackFrame || 0), machineId: instance.machine.id, stateId: null };
    const frames = Array.isArray(state.frames) && state.frames.length ? state.frames : [0];
    const frameDuration = 1000 / Math.max(1, Number(state.fps || 1));
    const index = state.loop === true ? Math.floor(instance.elapsedMs / frameDuration) % frames.length : Math.min(frames.length - 1, Math.floor(instance.elapsedMs / frameDuration));
    return { assetId: state.assetId || fallbackAssetId || null, frame: reducedMotion ? Number(state.reducedMotionFrame ?? frames[0]) : Number(frames[index] ?? frames[0] ?? fallbackFrame ?? 0), machineId: instance.machine.id, stateId: state.id };
  }
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
        assetId: effect.assetId || null,
        frame: Math.max(0, Number(effect.frame || 0)),
      });
    }
  }
  function runPrimitiveEffect(effect, point, cueId, explicitReducedVariant) {
    if (!explicitReducedVariant && reducedMotion && (effect.type === "particles" || effect.type === "shake" || effect.type === "squash")) { skippedReducedMotionCount += 1; return; }
    if (effect.type === "particles") spawnParticles(effect, point, cueId);
    else if (effect.type === "shake") {
      shakeIntensity = Math.max(shakeIntensity, Math.max(0, Number(effect.intensity || 0)));
      shakeRemaining = Math.max(shakeRemaining, Math.max(20, Number(effect.durationMs || 140)));
      shakeTotal = Math.max(shakeTotal, shakeRemaining);
    } else if (effect.type === "flash") flash = { color: effect.color || "#fff", opacity: Math.max(0, Math.min(0.9, Number(effect.opacity || 0))), remaining: Math.max(20, Number(effect.durationMs || 100)), total: Math.max(20, Number(effect.durationMs || 100)) };
    else if (effect.type === "squash" && point.objectId) squashes.set(point.objectId, { scaleX: Number(effect.scaleX || 1), scaleY: Number(effect.scaleY || 1), remaining: Math.max(20, Number(effect.durationMs || 120)), total: Math.max(20, Number(effect.durationMs || 120)) });
  }
  function runEffect(effect, point, cueId) {
    if (effect.type !== "plugin") { runPrimitiveEffect(effect, point, cueId, false); return; }
    const plugin = effectPlugins.get(effect.pluginId);
    if (!plugin) { missingEffectPluginCount += 1; return; }
    const variant = reducedMotion ? plugin.reducedMotion || { mode: "omit", effects: [] } : null;
    const effects = reducedMotion ? variant.mode === "replace" ? variant.effects || [] : [] : plugin.effects || [];
    effects.forEach(function (primitive) { runPrimitiveEffect(primitive, point, String(cueId || "cue") + ":" + String(plugin.id), reducedMotion); });
    triggeredEffectPluginCount += 1;
  }
  function triggerMotionCue(cue, event) {
    if (!enabled || motionConfig.enabled === false || disposed) return;
    const point = getPoint(event, cue.target || "event-object") || { x: 0, y: 0, objectId: null };
    for (const effect of cue.effects || []) runEffect(effect, point, cue.id);
    triggeredMotionCueCount += 1;
  }
  function handleEvents(events) {
    if (!enabled || disposed) return;
    for (const event of Array.isArray(events) ? events : []) {
      if (!event || typeof event.type !== "string") continue;
      eventCounter += 1; handledEventCount += 1;
      queuedAnimationEvents.push(event);
      if (queuedAnimationEvents.length > 64) queuedAnimationEvents.splice(0, queuedAnimationEvents.length - 64);
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
    updateAnimations(delta);
    updateCamera(delta);
  }
  function getCameraOffset() {
    if (reducedMotion || !shakeRemaining || !shakeIntensity) return { x: 0, y: 0 };
    const progress = shakeTotal ? shakeRemaining / shakeTotal : 0;
    const trauma = progress * progress;
    const seed = eventCounter * 97 + Math.round(shakeRemaining);
    return { x: Math.sin(seed * 12.9898) * shakeIntensity * trauma, y: Math.cos(seed * 78.233) * shakeIntensity * trauma };
  }
  function getCameraTransform() {
    const shake = getCameraOffset();
    if (!enabled || cameraConfig.enabled === false || !cameraInitialized) return { x: shake.x, y: shake.y, zoom: 1, centerX: Number(options.width || 0) / 2, centerY: Number(options.height || 0) / 2, zoneId: null };
    const width = Number(options.width || getSnapshot()?.width || 0);
    const height = Number(options.height || getSnapshot()?.height || 0);
    return { x: width / 2 - cameraCenterX * cameraZoom + shake.x, y: height / 2 - cameraCenterY * cameraZoom + shake.y, zoom: cameraZoom, centerX: cameraCenterX, centerY: cameraCenterY, zoneId: activeCameraZoneId };
  }
  function getObjectTransform(objectId) {
    const entry = squashes.get(objectId);
    if (!entry || reducedMotion) return { scaleX: 1, scaleY: 1 };
    const progress = entry.total ? entry.remaining / entry.total : 0;
    const envelope = Math.sin(Math.PI * Math.max(0, Math.min(1, progress)));
    return { scaleX: 1 + (entry.scaleX - 1) * envelope, scaleY: 1 + (entry.scaleY - 1) * envelope };
  }
  function drawWorld(context2d) {
    if (!context2d) return;
    context2d.save();
    particles.forEach(function (particle) {
      const alpha = Math.max(0, 1 - particle.age / particle.lifetime);
      context2d.globalAlpha = alpha;
      const frame = particle.assetId ? getAssetFrame(particle.assetId, particle.frame) : null;
      if (frame?.image) context2d.drawImage(frame.image, Number(frame.sx || 0), Number(frame.sy || 0), Number(frame.sw || frame.image.width || 1), Number(frame.sh || frame.image.height || 1), Math.round(particle.x - particle.size / 2), Math.round(particle.y - particle.size / 2), Math.max(1, Math.round(particle.size)), Math.max(1, Math.round(particle.size)));
      else { context2d.fillStyle = particle.color || "#fff"; context2d.fillRect(Math.round(particle.x - particle.size / 2), Math.round(particle.y - particle.size / 2), Math.max(1, Math.round(particle.size)), Math.max(1, Math.round(particle.size))); }
    });
    context2d.restore();
  }
  function drawOverlay(context2d, width, height) {
    if (!context2d || !flash) return;
    const alpha = flash.total ? flash.opacity * (flash.remaining / flash.total) : 0;
    context2d.save(); context2d.globalAlpha = Math.max(0, Math.min(0.9, alpha)); context2d.fillStyle = flash.color || "#fff"; context2d.fillRect(0, 0, Number(width || 0), Number(height || 0)); context2d.restore();
  }
  function clearMotion() { particles.splice(0); squashes.clear(); shakeIntensity = 0; shakeRemaining = 0; shakeTotal = 0; flash = null; }
  function resetAuthoredPresentationState() {
    animationInstances.clear(); queuedAnimationEvents.splice(0); cameraInitialized = false; activeCameraZoneId = null; cameraZoneTransitionElapsed = 0; cameraZoneTransitionMs = 0;
  }
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
  function reset() { stopVoices(); pendingAudio = []; cueTimes.clear(); clearMotion(); resetAuthoredPresentationState(); return getStatus(); }
  function getStatus() {
    let decodedBytes = 0;
    decodedAudioBuffers.forEach(function (buffer) { decodedBytes += Math.max(0, Number(buffer?.length || 0)) * Math.max(0, Number(buffer?.numberOfChannels || 0)) * 4; });
    return {
      enabled: enabled,
      audio: { enabled: audioConfig.enabled !== false && enabled, state: audioState, muted: muted, masterVolume: masterVolume, contextState: context?.state || null, decodeSampleRate: decodeSampleRate, activeVoices: voices.length, pendingEvents: pendingAudio.length, triggeredCueCount: triggeredAudioCueCount, embeddedResourceCount: embeddedAudioResources.size, decodedResourceCount: decodedAudioBuffers.size, decodingResourceCount: decodingAudioBuffers.size, decodedBytes: decodedBytes, resourceErrors: Object.fromEntries(audioResourceErrors), error: audioError },
      motion: { enabled: motionConfig.enabled !== false && enabled, reducedMotion: reducedMotion, reducedMotionSource: reducedMotionOverride == null ? program?.reducedMotion === "always-reduce" || program?.reducedMotion === "ignore" ? "program" : "system" : "shell-override", activeParticles: particles.length, activeSquashes: squashes.size, shakeActive: shakeRemaining > 0, flashActive: Boolean(flash), triggeredCueCount: triggeredMotionCueCount, skippedReducedMotionCount: skippedReducedMotionCount },
      camera: { enabled: cameraConfig.enabled !== false && enabled, initialized: cameraInitialized, activeZoneId: activeCameraZoneId, centerX: cameraCenterX, centerY: cameraCenterY, zoom: cameraZoom, transitionCount: cameraTransitionCount },
      animation: { enabled: animationConfig.enabled !== false && enabled, activeInstanceCount: animationInstances.size, transitionCount: animationTransitionCount, rejectedTransitionCount: rejectedAnimationTransitionCount, activeStates: [...animationInstances.values()].map(function (instance) { const frame = getAnimationFrame(instance.objectId, null, 0); return { machineId: instance.machine.id, objectId: instance.objectId, stateId: instance.stateId, assetId: frame.assetId, frame: frame.frame, pendingTransitionId: instance.pending?.id || null }; }).sort(function (first, second) { return String(first.machineId).localeCompare(String(second.machineId)) || String(first.objectId).localeCompare(String(second.objectId)); }) },
      effectPlugins: { authoredCount: effectPlugins.size, triggeredCount: triggeredEffectPluginCount, missingReferenceCount: missingEffectPluginCount },
      handledEventCount: handledEventCount,
      simulationIndependent: true,
    };
  }
  function onMediaChange(event) { if (reducedMotionOverride != null) return; reducedMotion = program?.reducedMotion === "always-reduce" || (program?.reducedMotion !== "ignore" && event.matches === true); if (reducedMotion) clearMotion(); }
  media?.addEventListener?.("change", onMediaChange);
  function destroy() { disposed = true; stopVoices(); pendingAudio = []; clearMotion(); resetAuthoredPresentationState(); decodedAudioBuffers.clear(); audioResourceErrors.clear(); media?.removeEventListener?.("change", onMediaChange); try { context?.close?.(); } catch { /* Context teardown is best effort and never affects game state. */ } }
  return { handleEvents: handleEvents, update: update, unlock: unlock, suspend: suspend, resume: resume, reset: reset, setMuted: setMuted, setMasterVolume: setMasterVolume, setReducedMotion: setReducedMotion, getStatus: getStatus, getCameraOffset: getCameraOffset, getCameraTransform: getCameraTransform, getAnimationFrame: getAnimationFrame, getObjectTransform: getObjectTransform, drawWorld: drawWorld, drawOverlay: drawOverlay, destroy: destroy };
}
