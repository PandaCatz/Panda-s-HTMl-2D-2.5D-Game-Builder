export const LOOPLAB_PROJECT_SCHEMA_VERSION = "1.0.0";

export const LOOPLAB_REUSE_GUIDE_SOURCE = Object.freeze({
  id: "card-wind-runner-reuse-guide",
  title: "HTML 2D Game Maker — Reuse Guide from Card Wind Runner",
  sha256: "9662eb78f40a6c6e74931485a5a9ff54a26345ae833ac4d2f2fefaa9fa560083",
  policy: "Extract renderer-independent contracts and optional plugins; never copy the project scene as maker core.",
});

export const LOOPLAB_MOVEMENT_TEMPLATES = Object.freeze([
  Object.freeze({
    value: "kinetic-runner",
    label: "Kinetic runner / skating",
    direction: "Use momentum, buffered jumps, low-object traversal, authored rail capture, clean exits, recovery, checkpoints, and speed-readable camera lead.",
    systems: ["locomotion", "traversal", "collision", "pickup", "checkpoint"],
  }),
  Object.freeze({
    value: "traditional-platformer",
    label: "Traditional platformer",
    direction: "Use precise acceleration, coyote time, buffered jumping, variable jump height, fair hazards, checkpoints, and readable landing space.",
    systems: ["locomotion", "collision", "pickup", "checkpoint"],
  }),
  Object.freeze({
    value: "top-down-action-rpg",
    label: "Top-down action RPG",
    direction: "Use eight-way or four-way movement, authored interaction footprints, readable attacks, pickups, room transitions, and checkpoint-safe state.",
    systems: ["locomotion", "collision", "combat", "pickup", "checkpoint"],
  }),
  Object.freeze({
    value: "twin-stick-shooter",
    label: "Twin-stick shooter",
    direction: "Separate movement and aim actions, keep projectiles deterministic, telegraph threats, manage encounter density, and support keyboard, pointer, touch, and gamepad profiles.",
    systems: ["locomotion", "collision", "combat", "projectile", "pickup"],
  }),
  Object.freeze({
    value: "tactics-grid",
    label: "Tactics grid",
    direction: "Use deterministic turns, explicit grid occupancy, previewable actions, readable ranges, stable initiative, and serializable encounter state.",
    systems: ["turn-order", "grid-traversal", "combat", "objective"],
  }),
  Object.freeze({
    value: "deck-combat-encounter",
    label: "Deck-combat encounter",
    direction: "Use deterministic draws, readable intent, explicit costs, authored encounter phases, recoverable state, and presentation that never owns combat truth.",
    systems: ["turn-order", "deck", "combat", "objective"],
  }),
  Object.freeze({
    value: "exploration-narrative",
    label: "Exploration / narrative",
    direction: "Use semantic interactions, authored triggers, connected landmarks, persistent objectives, accessible dialogue surfaces, and calm camera strategies.",
    systems: ["locomotion", "collision", "interaction", "objective", "checkpoint"],
  }),
]);

export const LOOPLAB_OPTIONAL_EFFECT_PLUGINS = Object.freeze([
  Object.freeze({ id: "afterimage-trail", label: "Historical-pose afterimage", requires: ["pose-history"], reducedMotion: "disabled-or-shortened", activation: "explicit-project-plugin" }),
  Object.freeze({ id: "parallax-planes", label: "Layered parallax planes", requires: ["separated-image-planes", "parallax-metadata"], reducedMotion: "static-planes", activation: "explicit-project-plugin" }),
  Object.freeze({ id: "palette-lut-grading", label: "Palette / LUT grading", requires: ["declared-lut"], reducedMotion: "unchanged", activation: "explicit-project-plugin" }),
  Object.freeze({ id: "wet-surface-reflection", label: "Wet-surface reflections", requires: ["reflection-mask"], reducedMotion: "static-reflection", activation: "explicit-project-plugin" }),
  Object.freeze({ id: "color-wind-shader", label: "Color-wind shader", requires: ["phase-sidecar", "material-mask", "matching-dimensions"], reducedMotion: "static-grade", activation: "explicit-opt-in-only" }),
]);

export const LOOPLAB_REUSE_GUIDE_CONTRACT = Object.freeze({
  source: LOOPLAB_REUSE_GUIDE_SOURCE,
  projectSchema: Object.freeze({
    currentVersion: LOOPLAB_PROJECT_SCHEMA_VERSION,
    stableProjectScopedIds: true,
    serializableStateOnly: true,
    rendererObjectsForbidden: true,
    migrationsRequiredForVersionChange: true,
  }),
  architecture: Object.freeze({
    simulationOwner: "renderer-independent-serializable-state",
    rendererRole: "disposable-view-and-browser-adapter",
    inputBoundary: "semantic-actions-sampled-per-simulation-tick",
    cameraBoundary: "presentation-only",
    collisionAuthority: "authored-map-data",
    uiBoundary: "responsive-dom-for-text-and-accessibility",
  }),
  fixedStep: Object.freeze({ hz: 60, maximumCatchUpSteps: 5, reportDroppedCatchUp: true, seededRandomRequiredForGeneratedRandomness: true }),
  performanceMetrics: Object.freeze([
    "current-frame-ms",
    "p95-frame-ms",
    "fixed-simulation-steps",
    "dropped-catch-up-events",
    "long-frames",
    "encoded-package-bytes",
    "decoded-image-bytes",
    "estimated-gpu-bytes",
    "fetch-decode-upload-first-draw",
    "input-sample-to-render-latency",
  ]),
  oneFileAdaptation: Object.freeze({
    deliverable: "exactly-one-offline-html",
    inline: ["runtime", "styles", "maps", "authored-collision", "selected-assets", "ui", "project-metadata"],
    excluded: ["service-worker", "cache-api-dependency", "pwa-multi-file-export", "runtime-fetch", "cdn", "module-import", "external-sidecar"],
    note: "The source guide's Vite and optional PWA recommendations are adapted to Looplab's stricter upload contract; selected sidecars must be embedded data, not separate files.",
  }),
  activationPolicy: "A routed capability is available to the AI, not proof that a candidate implements it. Optional systems become active only with authored project data, declared requirements, and acceptance evidence.",
});

const CAPABILITY_CONTRACTS = Object.freeze({
  "high-speed-sweep-2d": Object.freeze(["Preview swept movement against thin authored geometry.", "Use swept AABB or an explicitly recorded fixed-step/substep fallback; never infer collision from pixels."]),
  "rail-path-authoring": Object.freeze(["Store traversal paths as authored control points with entry, speed, direction, transfer, exit, and bail data.", "Keep visual rail art separate from the gameplay path owner."]),
  "camera-strategy-library": Object.freeze(["Select a composable camera strategy and a reduced-motion variant.", "Camera state cannot determine collision, progression, or saveable truth."]),
  "animation-state-editor": Object.freeze(["Animation reads simulation state.", "Frame events may emit presentation cues but never own damage, collision, or projectile creation."]),
  "continuous-world-chunks": Object.freeze(["Validate the actual runtime join from the previous visible tail to the next unique content.", "Copied overlap equality alone is never seam evidence."]),
  "effects-plugin-system": Object.freeze(["Declare parameters, required embedded assets, full-motion preset, and reduced-motion preset.", "Effects cannot change simulation speed, gravity, collision, timers, or difficulty."]),
  "performance-profiler": Object.freeze(["Report frame pacing and fixed-step drops separately.", "Report encoded, decoded, and estimated GPU memory separately; never collapse them into one score."]),
});

export function buildReuseGuideRoute(capabilities = []) {
  const capabilityIds = capabilities.map((capability) => typeof capability === "string" ? capability : capability.id);
  return {
    source: LOOPLAB_REUSE_GUIDE_SOURCE,
    projectSchemaVersion: LOOPLAB_PROJECT_SCHEMA_VERSION,
    requiredArchitecture: LOOPLAB_REUSE_GUIDE_CONTRACT.architecture,
    fixedStep: LOOPLAB_REUSE_GUIDE_CONTRACT.fixedStep,
    movementTemplates: LOOPLAB_MOVEMENT_TEMPLATES.map(({ value, label, systems }) => ({ value, label, systems })),
    routedCapabilityContracts: capabilityIds
      .filter((id) => CAPABILITY_CONTRACTS[id])
      .map((id) => ({ capabilityId: id, rules: CAPABILITY_CONTRACTS[id] })),
    optionalEffectPlugins: capabilityIds.includes("effects-plugin-system") ? LOOPLAB_OPTIONAL_EFFECT_PLUGINS : [],
    oneFileAdaptation: LOOPLAB_REUSE_GUIDE_CONTRACT.oneFileAdaptation,
    activationPolicy: LOOPLAB_REUSE_GUIDE_CONTRACT.activationPolicy,
  };
}
