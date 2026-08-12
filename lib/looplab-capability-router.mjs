import { buildReuseGuideRoute } from "./looplab-reuse-guide.mjs";

export const LOOPLAB_GAME_STUDIO_PLAN_SCHEMA = "looplab-game-studio-plan/v1";
export const LOOPLAB_RUNTIME_KNOWLEDGE = Object.freeze({
  schemaVersion: "looplab-runtime-knowledge/v1",
  canvas: {
    role: "Lean native 2D adapter",
    adapterStatus: "release-ready",
    chooseWhen: ["custom drawing or projection", "tight byte budget", "small or systems-first game", "direct pixel control"],
    strengths: ["smallest one-file output", "transparent frame ownership", "custom dimetric depth", "no engine upgrade surface"],
    costs: ["LoopLab must own scenes, cameras, batching, animation playback, and debug tooling"],
    absorbNatively: ["fixed logical backbuffer", "capped DPR", "dirty-region and draw-call budgeting", "offscreen prerendering", "one frame owner"],
  },
  phaser: {
    role: "Full 2D game-framework adapter",
    adapterStatus: "release-ready-pinned-3.90.0",
    chooseWhen: ["scene orchestration", "camera tooling", "tilemaps", "sprite animation", "Arcade Physics adapters", "large gameplay surface"],
    strengths: ["mature scene lifecycle", "camera and input systems", "animation and texture managers", "tilemaps", "debug ecosystem"],
    costs: ["larger encoded HTML", "higher memory floor", "engine-specific adapter and upgrade testing"],
    absorbNatively: ["Boot/Menu/Gameplay/Overlay lifecycle", "camera dead zones and follow profiles", "animation state registration", "physics debug views", "scene transition receipts"],
  },
  pixi: {
    role: "Renderer-first scene-graph reference knowledge",
    adapterStatus: "knowledge-integrated-adapter-pending",
    chooseWhen: ["large sprite counts", "particles", "filters and compositing", "renderer-first architecture", "WebGL batching"],
    strengths: ["high-performance scene graph", "texture and render groups", "filters", "dedicated ticker", "renderer flexibility"],
    costs: ["gameplay, collision, scenes, and level flow remain LoopLab responsibilities", "larger one-file output than Canvas"],
    absorbNatively: ["render groups", "texture lifecycle and aliases", "dedicated ticker ownership", "scene-graph culling", "batch and decoded-memory diagnostics"],
  },
  melon: {
    role: "Integrated Tiled-oriented 2D engine reference knowledge",
    adapterStatus: "knowledge-integrated-adapter-pending",
    chooseWhen: ["Tiled or TMX workflow", "orthogonal tile layers", "level loading", "entity pooling", "integrated world and viewport"],
    strengths: ["Tiled integration", "application and stage lifecycle", "object pooling", "spatial indexing", "Canvas/WebGL renderer parity"],
    costs: ["tree-shaken ESM-to-IIFE build required", "authored collision must not be replaced by imported visual geometry", "engine conventions add migration surface"],
    absorbNatively: ["Tiled import validation", "pool lifecycle", "stage reset/destroy contracts", "sparse tile-layer strategy", "collision/debug overlays"],
  },
  compositionPolicy: "Compose the useful capabilities, not competing engines. A shipped game has one primary frame/render owner; LoopLab simulation, authored collision, replay, DOM UI, assets, Doctor, and Playwright remain shared services.",
  evidencePolicy: "A framework label is a decision input, not proof. Only a real adapter, exact embedded bytes, and browser evidence may mark that runtime release-ready.",
});
export const LOOPLAB_RUNTIME_SELECTION_POLICY = Object.freeze({
  schemaVersion: "looplab-runtime-selection-policy/v1",
  mode: "deterministic-quality-fit",
  defaultFramework: "canvas",
  automaticCandidates: ["canvas", "phaser"],
  explicitCandidates: ["canvas", "phaser", "pixi", "melon"],
  releaseReadyAdapters: ["canvas", "phaser"],
  phaserThreshold: 3,
  existingProjectPolicy: "Do not silently replace an existing runtime during an improvement pass. Report the better-fit runtime and require an explicit override before an engine migration.",
  singleFilePolicy: "Single-file delivery never disqualifies Phaser. Its browser script build and every selected asset must be inlined with no module, CDN, or runtime network dependency.",
  compositionPolicy: LOOPLAB_RUNTIME_KNOWLEDGE.compositionPolicy,
  authority: "LoopLab computes this receipt locally from the same project, prompt, workstream, and explicit preference for the UI, headless API, Codex, Claude, and durable provider loop.",
});
export const LOOPLAB_NARRATIVE_ROUTING_POLICY = Object.freeze({
  schemaVersion: "looplab-narrative-routing/v1",
  defaultMode: "auto",
  modes: ["auto", "include", "exclude"],
  signalThreshold: 2,
  specialistId: "narrative-designer",
  specialistIds: ["narrative-designer", "narrator-dialogue-writer"],
  policy: "Route the Narrative Designer and Narrator/Dialogue Writer together when authored intent contains story, character, dialogue, quest, lore, environmental-storytelling, or branching-choice signals, or when narrative work is explicitly selected. Mechanics-first games do not receive mandatory story scope.",
  roleBoundary: "The Narrative Designer owns causal structure, continuity, state bindings, and endings. The Narrator/Dialogue Writer owns narrator voice, dialogue, barks, tutorial copy, and readable text equivalents. Both work inside one provider invocation and share the gameplayProgram as runtime truth.",
  implementationBoundary: "Narrative promises must resolve to authored text/assets plus stable gameplay, quest, dialogue, progression, or ending state IDs. Prose-only lore cannot masquerade as an implemented mechanic, and required information cannot depend on spoken audio alone.",
});

const SUPPORTED_2D_FRAMEWORKS = new Set(LOOPLAB_RUNTIME_SELECTION_POLICY.explicitCandidates);
const RELEASE_READY_2D_FRAMEWORKS = new Set(LOOPLAB_RUNTIME_SELECTION_POLICY.releaseReadyAdapters);
const ONE_FILE_DELIVERY_TARGET = Object.freeze({
  canvas: "built-in-inline",
  phaser: "inline-script-tag",
  pixi: "inline-umd",
  melon: "tree-shaken-inline-iife",
});

export const GAME_STUDIO_CAPABILITIES = [
  {
    id: "web-game-foundations",
    label: "Architecture",
    owns: ["simulation-boundary", "input-model", "asset-manifest", "save-debug-performance-strategy"],
    applies: () => true,
  },
  {
    id: "single-file-html-games",
    label: "One-file HTML",
    owns: ["single-html-artifact", "inline-runtime", "offline-assets", "encoded-and-decoded-budgets", "artifact-preflight"],
    applies: (context) => context.singleFile,
  },
  {
    id: "phaser-core",
    label: "Phaser Core · inline script",
    owns: ["phaser-config", "scene-lifecycle", "asset-loader", "camera", "scene-transitions", "inline-script-delivery"],
    applies: (context) => context.dimension === "2d" && context.framework === "phaser",
  },
  {
    id: "phaser-2d-game",
    label: "Phaser 2D",
    owns: ["2d-scenes", "camera", "sprite-playback", "thin-render-adapter", "phaser-export"],
    applies: (context) => context.dimension === "2d" && context.framework === "phaser" && ["creation", "runtime", "gameplay", "maps", "collision", "character", "assets", "release"].includes(context.track),
  },
  {
    id: "phaser-arcade-physics",
    label: "Phaser Arcade Physics",
    owns: ["arcade-bodies", "velocity-and-gravity", "colliders-and-overlaps", "world-bounds", "physics-debug"],
    applies: (context) => context.dimension === "2d" && context.framework === "phaser" && (["creation", "gameplay", "maps", "collision", "character"].includes(context.track) || context.promptMatches(/physics|collision|platform|velocity|gravity|overlap|body|movement/i)),
  },
  {
    id: "pixijs-rendering",
    label: "PixiJS capability knowledge",
    owns: ["scene-graph-patterns", "texture-lifecycle", "render-groups", "ticker-ownership", "pointer-event-patterns", "pending-adapter-boundary"],
    applies: (context) => context.dimension === "2d" && (context.runtimeSelection.bestFitFramework === "pixi" || context.runtimeSelection.requestedUnavailableFramework === "pixi" || context.framework === "pixi"),
  },
  {
    id: "melonjs-engine",
    label: "melonJS capability knowledge",
    owns: ["application-and-stage-patterns", "tiled-import-validation", "pool-lifecycle", "sparse-tile-layers", "collision-debug-patterns", "pending-adapter-boundary"],
    applies: (context) => context.dimension === "2d" && (context.runtimeSelection.bestFitFramework === "melon" || context.runtimeSelection.requestedUnavailableFramework === "melon" || context.framework === "melon"),
  },
  {
    id: "canvas-2d-performance",
    label: "Canvas Performance",
    owns: ["fixed-backbuffer", "capped-dpr", "atlas-seams", "render-state-budget", "culling", "p95-frame-time"],
    applies: (context) => context.dimension === "2d",
  },
  {
    id: "collision-and-response-2d",
    label: "Collision & Response",
    owns: ["authored-collision", "polyline-chains", "right-hand-normals", "slope-grounding", "grounded-snap", "bounded-step-up", "axis-separated-resolution", "half-open-endpoints", "substeps", "one-way-platforms", "z-gated-routes", "deterministic-order"],
    applies: (context) => context.dimension === "2d" && (["creation", "gameplay", "maps", "collision", "character"].includes(context.track) || context.promptMatches(/collision|hitbox|ground|floor|platform|slope|tunnel|support|footprint/i)),
  },
  {
    id: "high-speed-sweep-2d",
    label: "Swept Collision",
    owns: ["swept-aabb", "thin-obstacle-tunneling", "one-way-surfaces", "slope-and-segment-tests", "swept-preview"],
    applies: (context) => context.dimension === "2d" && (["creation", "gameplay", "maps", "collision"].includes(context.track) || context.promptMatches(/fast|speed|dash|skate|runner|tunnel|swept|thin obstacle/i)),
  },
  {
    id: "rail-path-authoring",
    label: "Rail & Path Authoring",
    owns: ["authored-control-points", "entry-radius", "minimum-entry-speed", "direction-rules", "transfers", "exit-impulse", "bail-behavior"],
    applies: (context) => context.dimension === "2d" && (context.promptMatches(/rail|grind|spline|path editor|traversal path|skate|zipline|track/i) || ["maps", "collision"].includes(context.track)),
  },
  {
    id: "isometric-depth-sorting",
    label: "Isometric Depth",
    owns: ["2-to-1-projection", "screen-space-facing", "raised-surface-slices", "composite-depth-key", "rail-midpoint-sort", "high-route-underpass"],
    applies: (context) => context.dimension === "2d" && (context.projection === "dimetric-2:1" || context.promptMatches(/isometric|dimetric|2:1|depth sort|raised terrain|underpass|viaduct/i)),
  },
  {
    id: "input-and-mobile-viewport",
    label: "Input & Mobile",
    owns: ["event-to-tick-snapshots", "key-and-code", "pointer-capture", "focus-release", "visual-viewport", "safe-areas", "gamepad"],
    applies: (context) => context.dimension === "2d" && (["creation", "gameplay", "ui", "character", "release", "input"].includes(context.track) || context.promptMatches(/input|keyboard|touch|mobile|pointer|gamepad|viewport|safe area/i)),
  },
  {
    id: "camera-strategy-library",
    label: "Camera Strategies",
    owns: ["smooth-follow", "velocity-lead", "room-camera", "dead-zones", "look-ahead", "cue-zones", "reduced-motion-camera"],
    applies: (context) => context.dimension === "2d" && (["creation", "gameplay", "maps", "ui"].includes(context.track) || context.promptMatches(/camera|follow|look ahead|dead zone|room framing|velocity lead/i)),
  },
  {
    id: "game-feel-and-juice",
    label: "Game Feel",
    owns: ["coyote-time", "input-buffering", "variable-action-shape", "presentation-events", "hitstop", "camera-trauma", "particle-pools"],
    applies: (context) => context.dimension === "2d" && (["creation", "gameplay", "character", "feel"].includes(context.track) || context.promptMatches(/feel|juice|coyote|buffer|hitstop|shake|camera|particle|feedback/i)),
  },
  {
    id: "narrative-design",
    label: "Narrative Design & Writing",
    owns: ["story-structure", "character-continuity", "dialogue-and-barks", "quests-and-lore", "environmental-storytelling", "ending-payoff", "narrative-state-bindings"],
    applies: (context) => context.dimension === "2d" && context.narrativeSelection.included,
  },
  {
    id: "procedural-web-audio",
    label: "Procedural Web Audio",
    owns: ["gesture-unlock", "click-free-envelopes", "voice-cap", "master-limiter", "pause-and-mute", "simulation-owned-beat-grid"],
    applies: (context) => context.dimension === "2d" && (["creation", "audio"].includes(context.track) || context.promptMatches(/audio|sound|music|sfx|mute|beat|rhythm/i)),
  },
  {
    id: "game-ui-frontend",
    label: "Game UI",
    owns: ["hud", "menus", "overlays", "responsive-layout", "playfield-protection", "accessibility"],
    applies: (context) => ["creation", "ui", "release", "gameplay"].includes(context.track) || context.promptMatches(/hud|menu|overlay|mobile|touch|portrait|accessib|onboard/i),
  },
  {
    id: "sprite-pipeline",
    label: "Sprite Pipeline",
    owns: ["full-strip-generation", "identity-lock", "shared-scale", "ground-anchor", "frame-analysis"],
    applies: (context) => context.dimension === "2d" && (["creation", "character", "assets"].includes(context.track) || context.promptMatches(/sprite|character|animation|frame|tile|art/i)),
  },
  {
    id: "animation-state-editor",
    label: "Animation State Editor",
    owns: ["frame-slicing", "feet-and-action-anchors", "animation-definitions", "state-transitions", "interruptibility", "presentation-only-frame-events"],
    applies: (context) => context.dimension === "2d" && (["creation", "character", "assets"].includes(context.track) || context.promptMatches(/animation state|sprite sheet|frame rate|atlas|interruptible/i)),
  },
  {
    id: "pixel-art-palette-pipeline",
    label: "Palette Pipeline",
    owns: ["one-palette-across-frames", "deterministic-quantization", "alpha-weighted-resample", "on-palette-gate", "flicker-report", "gameplay-color-protection"],
    applies: (context) => context.dimension === "2d" && (["creation", "character", "assets"].includes(context.track) || context.promptMatches(/pixel art|palette|quantiz|downscale|atlas|frame boil|halo|tile|sprite/i)),
  },
  {
    id: "deterministic-sim-replay",
    label: "Deterministic Replay",
    owns: ["fixed-60hz-simulation", "seeded-prng", "state-digest", "behavioral-replay-fixtures", "headless-sim-driver", "versioned-rerecord"],
    applies: (context) => context.dimension === "2d" && (["creation", "gameplay", "maps", "collision", "release", "tests"].includes(context.track) || context.promptMatches(/replay|determin|seed|ghost|daily|regression|simulation/i)),
  },
  {
    id: "deterministic-actor-systems",
    label: "Actor Systems",
    owns: ["patrol-and-cutscene-routes", "perception-and-memory", "chase-flee-return-priority", "authored-navigation", "actor-events", "actor-replay-and-acceptance"],
    applies: (context) => context.dimension === "2d" && (context.hasActorProgram || context.promptMatches(/\b(?:npc|actor|enemy|guard|companion|patrol|chase|flee|line of sight|cutscene route)\b/i)),
  },
  {
    id: "continuous-world-chunks",
    label: "Continuous World Chunks",
    owns: ["chunk-schema", "entry-exit-grammar", "runtime-join-seams", "embedded-prefetch", "decode-and-residency-budget", "closed-loop-validation"],
    applies: (context) => context.dimension === "2d" && context.promptMatches(/continuous|chunk|district|panorama|endless|streaming|seam|scrolling world|closed loop/i),
  },
  {
    id: "effects-plugin-system",
    label: "Effects Plugins",
    owns: ["afterimage-history", "parallax-planes", "effect-parameters", "sidecar-requirements", "reduced-motion-presets", "simulation-independence"],
    applies: (context) => context.dimension === "2d" && (["creation", "assets", "character", "ui"].includes(context.track) || context.promptMatches(/afterimage|trail|parallax|shader|effect|reflection|particle|grading/i)),
  },
  {
    id: "performance-profiler",
    label: "Runtime Profiler",
    owns: ["p95-frame-time", "fixed-step-count", "dropped-catch-up", "long-frame", "decoded-and-gpu-bytes", "first-draw", "input-to-render-latency"],
    applies: (context) => context.dimension === "2d" && ["creation", "release"].includes(context.track),
  },
  {
    id: "verification-gates",
    label: "Verification Gates",
    owns: ["artifact-invariants", "known-good-calibration", "false-positive-control", "numeric-budget-reporting", "generated-output-gate"],
    applies: () => true,
  },
  {
    id: "game-playtest",
    label: "Playtest & QA · Playwright",
    owns: ["playwright-browser-automation", "browser-smoke-test", "screenshot-evidence", "hud-review", "input-and-transition-test", "responsive-qa"],
    applies: () => true,
  },
];

export const LOOPLAB_SPECIALIST_AGENTS = [
  { id: "creative-director", label: "Creative Director", owns: ["prompt synthesis", "genre promise", "art direction", "acceptance intent"], produces: "directed game brief", instruction: "Resolve the user's words and selected constraints into one coherent game promise. Preserve the user's taste and identify what must be visibly true in the first playable minute." },
  { id: "game-loop-designer", label: "Game Loop Designer", owns: ["verbs", "goals", "pacing", "progression", "fun hypothesis"], produces: "playable loop and pacing review", instruction: "Define the repeatable verbs, feedback, mastery curve, scoring, and next-decision cadence. Reject empty travel and mechanics without readable setup, payoff, and recovery." },
  { id: "narrative-designer", label: "Narrative Designer", owns: ["story structure", "branching causality", "character continuity", "quests and lore", "environmental storytelling", "ending payoff"], produces: "state-bound narrative structure and continuity review", instruction: "Shape story causality, character continuity, environmental clues, choices, and payoff around the playable loop. Bind every required beat and ending to stable quest, dialogue, progression, gameplay, map, or ending state IDs; never use prose volume to disguise inert mechanics." },
  { id: "narrator-dialogue-writer", label: "Narrator & Dialogue Writer", owns: ["narrator voice", "dialogue", "barks", "tutorial copy", "line continuity", "readable text equivalents"], produces: "game-ready voice, dialogue, and accessible delivery review", instruction: "Realize the approved narrative structure as concise narrator copy, dialogue, barks, and tutorial text. Preserve terminology and speaker voice, keep essential information readable without spoken audio, and attach every required line to stable narrative beat and runtime IDs." },
  { id: "technical-architect", label: "Technical Architect", owns: ["simulation boundary", "renderer choice", "input model", "data ownership"], produces: "runtime architecture review", instruction: "Keep deterministic authored state outside render objects and choose the smallest runtime that satisfies the brief and one-file delivery." },
  { id: "gameplay-engineer", label: "Gameplay Engineer", owns: ["movement", "interactions", "physics", "game feel", "determinism"], produces: "gameplay implementation review", instruction: "Turn the loop into deterministic controls and interactions with responsive buffering, fair recovery, and presentation events that never mutate simulation state." },
  { id: "actor-systems-designer", label: "Actor Systems Designer", owns: ["actor state machines", "patrol and cutscene routes", "perception", "chase and flee", "navigation evidence"], produces: "deterministic actor-behavior review", instruction: "Bind every actor to authored objects, colliders, support height, and navigation. Use stable fixed-tick transitions, explicit line of sight, bounded repathing, readable arrival radii, and executable route/perception evidence; never let rendering or generated art own behavior geometry." },
  { id: "level-collision-architect", label: "Level & Collision Architect", owns: ["map flow", "ground anchors", "support heights", "AABB and polyline collision", "slope normals", "depth", "transitions"], produces: "map, support, and collision review", instruction: "Author visible routes and collision from map data. For slopes and boundaries, use ordered stable-ID chains whose right-hand y-down normals face the playable side; verify half-open seams, grounded snap, step-up, one-way descent, support z, run-up, landing, recovery, portals, depth slices, and high-route/underpass separation. Never infer collision from art." },
  { id: "art-director", label: "Art Director", owns: ["tiles", "sprites", "palette", "animation identity", "visual hierarchy"], produces: "asset and cohesion review", instruction: "Create one legible visual language across environment, characters, UI, and effects. Lock palette, scale, identity, anchors, frame structure, and gameplay-critical colors." },
  { id: "audio-designer", label: "Audio Designer", owns: ["sound cues", "music system", "mix budget", "gesture unlock"], produces: "audio feedback review", instruction: "Map important simulation events to clear, click-free, voice-capped sound feedback that works inside the offline artifact and respects mute and pause." },
  { id: "ui-accessibility-designer", label: "UI & Accessibility Designer", owns: ["HUD", "menus", "touch controls", "safe areas", "readability"], produces: "responsive UI review", instruction: "Protect the playfield while making goals, score, controls, focus, touch targets, reduced motion, portrait layout, and status feedback readable." },
  { id: "release-engineer", label: "Performance & One-File Engineer", owns: ["frame budget", "culling", "asset memory", "inline engine", "offline HTML"], produces: "performance and packaging review", instruction: "Enforce measured frame and memory budgets and exactly one offline HTML with no module, CDN, runtime network, storage, secret, or unembedded asset dependency." },
  { id: "project-doctor-critic", label: "Project Doctor Critic", owns: ["regression identity", "feature contracts", "artifact invariants", "promotion gate"], produces: "independent acceptance review", instruction: "Challenge the proposed pass against stable issue identities and linked feature contracts. A score cannot excuse a blocker, stale evidence, or unsupported claim." },
  { id: "playtest-qa", label: "Playtest QA", owns: ["Playwright", "input paths", "viewports", "screenshots", "browser evidence"], produces: "source-bound browser evidence", instruction: "Exercise the actual rendered candidate with real browser input, affected device profiles, screenshots, transitions, HUD review, and offline request monitoring." },
];

const CAPABILITY_AGENT = {
  "web-game-foundations": "technical-architect",
  "single-file-html-games": "release-engineer",
  "phaser-core": "technical-architect",
  "phaser-2d-game": "gameplay-engineer",
  "phaser-arcade-physics": "gameplay-engineer",
  "pixijs-rendering": "technical-architect",
  "melonjs-engine": "technical-architect",
  "canvas-2d-performance": "release-engineer",
  "collision-and-response-2d": "level-collision-architect",
  "high-speed-sweep-2d": "level-collision-architect",
  "rail-path-authoring": "level-collision-architect",
  "isometric-depth-sorting": "level-collision-architect",
  "input-and-mobile-viewport": "gameplay-engineer",
  "camera-strategy-library": "gameplay-engineer",
  "game-feel-and-juice": "game-loop-designer",
  "narrative-design": "narrative-designer",
  "procedural-web-audio": "audio-designer",
  "game-ui-frontend": "ui-accessibility-designer",
  "sprite-pipeline": "art-director",
  "animation-state-editor": "art-director",
  "pixel-art-palette-pipeline": "art-director",
  "deterministic-sim-replay": "gameplay-engineer",
  "deterministic-actor-systems": "actor-systems-designer",
  "continuous-world-chunks": "level-collision-architect",
  "effects-plugin-system": "art-director",
  "performance-profiler": "release-engineer",
  "verification-gates": "project-doctor-critic",
  "game-playtest": "playtest-qa",
};

function buildAgentPlan(context, capabilities) {
  const plannedIds = context.track === "creation" ? ["creative-director", "game-loop-designer"] : [];
  if (context.narrativeSelection.included) plannedIds.push(...LOOPLAB_NARRATIVE_ROUTING_POLICY.specialistIds);
  for (const capability of capabilities) plannedIds.push(CAPABILITY_AGENT[capability.id]);
  const uniqueIds = plannedIds.filter((id, index) => id && plannedIds.indexOf(id) === index);
  return uniqueIds.map((id, index) => {
    const agent = LOOPLAB_SPECIALIST_AGENTS.find((candidate) => candidate.id === id);
    const executor = id === "project-doctor-critic" ? "project-doctor" : id === "playtest-qa" ? "playwright" : "selected-provider";
    return {
      order: index + 1,
      agentId: agent.id,
      label: agent.label,
      owns: agent.owns,
      produces: agent.produces,
      instruction: agent.instruction,
      capabilityIds: capabilities.filter((capability) => CAPABILITY_AGENT[capability.id] === id).map((capability) => capability.id),
      executor,
      receiptRequired: executor === "selected-provider",
    };
  });
}

function explicitPromptFramework(prompt) {
  if (/\bmelon(?:js)?\b/i.test(prompt)) return "melon";
  if (/\bpixi(?:js)?\b/i.test(prompt)) return "pixi";
  if (/\bphaser(?:\.js)?\b/i.test(prompt)) return "phaser";
  if (/\b(?:html5\s+)?canvas(?:\s*2d)?\b/i.test(prompt)) return "canvas";
  return null;
}

const NARRATIVE_SIGNAL_DEFINITIONS = [
  ["story-structure", /\b(?:story|narrative|plot|storyline|character arc|story arc)\b/i, 2, "The authored intent explicitly asks for story structure or a narrative arc."],
  ["characters-and-dialogue", /\b(?:npc|dialogue|conversation|barks?|companion|relationship|character continuity)\b/i, 3, "Characters, dialogue, or relationship continuity need a dedicated narrative pass."],
  ["quests-and-lore", /\b(?:quests?|lore|worldbuilding|environmental storytelling|journal entries|codex entries)\b/i, 2, "Quests, lore, or environmental storytelling need authored continuity and state bindings."],
  ["branching-choice", /\b(?:branching narrative|choice-driven|dialogue tree|multiple endings?|visual novel)\b/i, 3, "Branching choices require explicit state, continuity, and ending consequences."],
  ["narrative-genre", /\b(?:story-driven|narrative adventure|action rpg|role-playing game|rpg campaign)\b/i, 2, "The selected genre convention carries material narrative expectations."],
  ["ending-payoff", /\b(?:epilogue|prologue|ending payoff|finale payoff|story ending)\b/i, 1, "The brief names a narrative opening or ending payoff."],
];

export function selectNarrativeSupport(project, request = {}, prompt = String(request.prompt ?? request.objective ?? ""), track = String(request.track ?? "gameplay")) {
  const rawMode = request.narrativeMode ?? (request.narrative === true ? "include" : request.narrative === false ? "exclude" : LOOPLAB_NARRATIVE_ROUTING_POLICY.defaultMode);
  const mode = LOOPLAB_NARRATIVE_ROUTING_POLICY.modes.includes(rawMode) ? rawMode : LOOPLAB_NARRATIVE_ROUTING_POLICY.defaultMode;
  const brief = project?.designBrief ?? {};
  const authoredText = [
    prompt,
    request.genre,
    request.coreLoop,
    request.progression,
    brief.genre,
    brief.coreLoop,
    brief.progression,
    brief.userPrompt,
    brief.composedPrompt,
    project?.iteration?.objective,
  ].filter((value) => typeof value === "string" && value.trim()).join("\n").slice(0, 24_000);
  const signals = NARRATIVE_SIGNAL_DEFINITIONS
    .filter(([, pattern]) => pattern.test(authoredText))
    .map(([id, , weight, evidence]) => ({ id, weight, evidence }));
  const score = signals.reduce((total, signal) => total + signal.weight, 0);
  const narrativeTrack = ["narrative", "story", "writing"].includes(track);
  const included = mode === "include" || (mode === "auto" && (narrativeTrack || score >= LOOPLAB_NARRATIVE_ROUTING_POLICY.signalThreshold));
  const selectionSource = mode === "include" ? "explicit-include" : mode === "exclude" ? "explicit-exclude" : narrativeTrack ? "narrative-workstream" : included ? "authored-signals" : "not-requested";
  return {
    schemaVersion: LOOPLAB_NARRATIVE_ROUTING_POLICY.schemaVersion,
    mode,
    included,
    selectionSource,
    score,
    threshold: LOOPLAB_NARRATIVE_ROUTING_POLICY.signalThreshold,
    signals,
    specialistId: LOOPLAB_NARRATIVE_ROUTING_POLICY.specialistId,
    specialistIds: LOOPLAB_NARRATIVE_ROUTING_POLICY.specialistIds,
    policy: LOOPLAB_NARRATIVE_ROUTING_POLICY.policy,
    roleBoundary: LOOPLAB_NARRATIVE_ROUTING_POLICY.roleBoundary,
    implementationBoundary: LOOPLAB_NARRATIVE_ROUTING_POLICY.implementationBoundary,
  };
}

function assetFrameCount(asset) {
  if (Array.isArray(asset?.frames)) return asset.frames.length;
  if (Number.isFinite(Number(asset?.frames))) return Number(asset.frames);
  if (Array.isArray(asset?.animations)) return asset.animations.reduce((total, animation) => total + (animation?.frames?.length ?? 0), 0);
  return Number(asset?.frameCount ?? 1);
}

function qualityFitSignals(project, prompt, track, projection) {
  const signals = [];
  const add = (id, framework, weight, evidence) => signals.push({ id, framework, weight, evidence });
  const promptSignals = [
    ["tilemap-workflow", /\b(?:tilemap|tileset|tile layer|tiled map|world tile)\b/i, 4, "The brief benefits from Phaser's tilemap and layer workflow."],
    ["scene-orchestration", /\b(?:multiple scenes?|scene transitions?|menu scene|pause scene|level select|multiple levels?|connected maps?|campaign|rooms?)\b/i, 2, "The brief benefits from explicit scene and transition orchestration."],
    ["camera-tooling", /\b(?:camera follow|camera pan|camera zoom|camera shake|screen shake|parallax|dead[ -]?zone|room camera|look[ -]?ahead)\b/i, 2, "The brief calls for reusable camera and presentation tooling."],
    ["sprite-animation", /\b(?:sprite(?:sheet)? animation|animation states?|animated character|texture atlas|sprite atlas|frame animation)\b/i, 2, "The brief calls for coordinated sprite animation and atlas playback."],
    ["arcade-physics", /\b(?:arcade physics|platformer|physics bod(?:y|ies)|gravity|velocity|colliders?|overlaps?)\b/i, 2, "The brief benefits from Phaser Arcade Physics adapters and debug tooling."],
    ["renderer-first", /\b(?:renderer[ -]?first|sprite[ -]?heavy|thousands? of sprites?|render groups?|webgl batching)\b/i, 4, "The brief may benefit from PixiJS's renderer-first scene graph and batching."],
    ["particles-and-filters", /\b(?:particle field|particle system|filters?|shader effects?|post[ -]?processing|compositing)\b/i, 3, "The brief may benefit from PixiJS particles, filters, and compositing."],
    ["tiled-authoring", /\b(?:tiled editor|tiled workflow|tmx|tsx map|tiled object layer)\b/i, 5, "The brief may benefit from melonJS's Tiled-oriented level workflow."],
    ["integrated-level-engine", /\b(?:entity pooling|object pool|level loader|orthogonal tile layers?)\b/i, 3, "The brief may benefit from melonJS application, level, and pooling conventions."],
  ];
  for (const [id, pattern, weight, evidence] of promptSignals) {
    if (!pattern.test(prompt)) continue;
    const framework = id === "renderer-first" || id === "particles-and-filters" ? "pixi" : id === "tiled-authoring" || id === "integrated-level-engine" ? "melon" : "phaser";
    add(id, framework, weight, evidence);
  }

  const maps = Array.isArray(project?.maps) ? project.maps : [];
  if (maps.length > 1) add("authored-multi-map", "phaser", 2, `${maps.length} authored maps benefit from scene/camera lifecycle support.`);
  const animatedAssetCount = (project?.assets ?? []).filter((asset) => assetFrameCount(asset) > 1).length;
  if (animatedAssetCount > 0) add("existing-animation-load", "phaser", 1, `${animatedAssetCount} animated asset${animatedAssetCount === 1 ? "" : "s"} can use Phaser's animation and texture managers.`);
  if (track === "creation" && signals.some((signal) => signal.framework === "phaser")) add("new-game-adapter-choice", "phaser", 1, "A creation pass can choose the better adapter before project-specific runtime work accumulates.");

  if (projection === "dimetric-2:1" || /\b(?:dimetric|isometric|2:1|underpass|world z|depth slices?)\b/i.test(prompt)) {
    add("authored-dimetric-depth", "canvas", 3, "Custom authored x/y/z projection and deterministic depth slices favor LoopLab's direct Canvas adapter unless Phaser adds a separate concrete benefit.");
  }
  if (/\b(?:tiny|microgame|minimal runtime|single[ -]?screen|custom canvas|procedural canvas)\b/i.test(prompt)) {
    add("lean-custom-runtime", "canvas", 3, "A lean or highly custom draw loop gains little from an engine bundle.");
  }
  if (/\b(?:turn[ -]?based|card game|dialogue game|visual novel|logic puzzle|management sim)\b/i.test(prompt)) {
    add("systems-first-game", "canvas", 2, "A systems-first game can keep a smaller direct renderer without sacrificing its core experience.");
  }
  const packageBudgetBytes = Number(project?.packageBudgetBytes);
  if (Number.isFinite(packageBudgetBytes) && packageBudgetBytes > 0 && packageBudgetBytes < 1_500_000) {
    add("tight-package-budget", "canvas", 4, `The ${packageBudgetBytes.toLocaleString("en-US")}-byte package budget leaves little room for an embedded engine bundle.`);
  }
  return signals;
}

export function selectGameRuntime(project, request = {}) {
  const prompt = String(request.prompt ?? request.objective ?? "");
  const track = String(request.track ?? "gameplay");
  const projection = request.projection ?? project?.projection?.type ?? "orthographic";
  const singleFile = request.singleFile ?? project?.release?.singleFile ?? true;
  const rawPreference = request.framework ?? request.runtimePreference ?? "auto";
  const frameworkPreference = SUPPORTED_2D_FRAMEWORKS.has(rawPreference) ? rawPreference : "auto";
  const currentProjectFramework = project?.runtimeProfile?.framework === "standalone" ? "canvas" : SUPPORTED_2D_FRAMEWORKS.has(project?.runtimeProfile?.framework) ? project.runtimeProfile.framework : "canvas";
  const namedFramework = explicitPromptFramework(prompt);
  const signals = qualityFitSignals(project, prompt, track, projection);
  const scores = { canvas: 0, phaser: 0, pixi: 0, melon: 0 };
  for (const signal of signals) if (Object.prototype.hasOwnProperty.call(scores, signal.framework)) scores[signal.framework] += signal.weight;
  const knowledgeRanking = Object.entries(scores).sort((left, right) => right[1] - left[1] || LOOPLAB_RUNTIME_SELECTION_POLICY.explicitCandidates.indexOf(left[0]) - LOOPLAB_RUNTIME_SELECTION_POLICY.explicitCandidates.indexOf(right[0]));
  const bestFitFramework = knowledgeRanking[0]?.[1] > 0 ? knowledgeRanking[0][0] : "canvas";
  const recommendedFramework = scores.phaser >= LOOPLAB_RUNTIME_SELECTION_POLICY.phaserThreshold && scores.phaser > scores.canvas ? "phaser" : "canvas";

  let selectedFramework;
  let selectionSource;
  let explicitOverride = false;
  let migrationRequiresOptIn = false;
  let requestedUnavailableFramework = null;
  if (frameworkPreference !== "auto" && !RELEASE_READY_2D_FRAMEWORKS.has(frameworkPreference)) {
    requestedUnavailableFramework = frameworkPreference;
    selectedFramework = RELEASE_READY_2D_FRAMEWORKS.has(currentProjectFramework) ? currentProjectFramework : "canvas";
    selectionSource = "adapter-unavailable-fallback";
  } else if (frameworkPreference !== "auto") {
    selectedFramework = frameworkPreference;
    selectionSource = "explicit-runtime-control";
    explicitOverride = true;
  } else if (namedFramework && !RELEASE_READY_2D_FRAMEWORKS.has(namedFramework)) {
    requestedUnavailableFramework = namedFramework;
    selectedFramework = RELEASE_READY_2D_FRAMEWORKS.has(currentProjectFramework) ? currentProjectFramework : "canvas";
    selectionSource = "adapter-unavailable-fallback";
  } else if (namedFramework) {
    selectedFramework = namedFramework;
    selectionSource = "explicit-prompt";
    explicitOverride = true;
  } else if (currentProjectFramework !== "canvas") {
    selectedFramework = currentProjectFramework;
    selectionSource = "existing-project-runtime";
  } else if (track === "creation") {
    selectedFramework = recommendedFramework;
    selectionSource = "automatic-quality-fit";
  } else {
    selectedFramework = currentProjectFramework;
    selectionSource = recommendedFramework === currentProjectFramework ? "automatic-quality-fit" : "existing-project-stability";
    migrationRequiresOptIn = recommendedFramework !== currentProjectFramework;
  }

  const winningSignals = signals
    .filter((signal) => signal.framework === recommendedFramework)
    .sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id));
  const scoreGap = Math.abs(scores.phaser - scores.canvas);
  const confidence = explicitOverride || selectionSource === "existing-project-runtime" ? "high" : scoreGap >= 4 ? "high" : scoreGap >= 2 ? "medium" : "low";
  const reasons = winningSignals.slice(0, 4).map((signal) => signal.evidence);
  const knowledgeReasons = signals.filter((signal) => signal.framework === bestFitFramework).sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id)).slice(0, 4).map((signal) => signal.evidence);
  if (requestedUnavailableFramework) reasons.unshift(`${requestedUnavailableFramework} decision knowledge is available, but its exact one-file adapter is not release-ready; LoopLab preserved ${selectedFramework} instead of fabricating support.`);
  if (reasons.length === 0) reasons.push("The brief does not yet show a quality benefit large enough to justify an engine adapter over direct Canvas 2D.");
  if (singleFile && (selectedFramework === "phaser" || recommendedFramework === "phaser")) reasons.push("Single-file delivery remains compatible: LoopLab must inline the Phaser browser script build and all selected assets.");

  const adapterAvailable = RELEASE_READY_2D_FRAMEWORKS.has(selectedFramework);
  return {
    schemaVersion: LOOPLAB_RUNTIME_SELECTION_POLICY.schemaVersion,
    policyVersion: 1,
    mode: LOOPLAB_RUNTIME_SELECTION_POLICY.mode,
    programOwned: true,
    externalSkillRequired: false,
    frameworkPreference,
    currentProjectFramework,
    recommendedFramework,
    bestFitFramework,
    selectedFramework,
    selectionSource,
    explicitOverride,
    migrationRequiresOptIn,
    requestedUnavailableFramework,
    adapterAvailable,
    adapterAvailability: Object.fromEntries(LOOPLAB_RUNTIME_SELECTION_POLICY.explicitCandidates.map((framework) => [framework, { releaseReady: RELEASE_READY_2D_FRAMEWORKS.has(framework), status: RELEASE_READY_2D_FRAMEWORKS.has(framework) ? "available" : "knowledge-integrated-adapter-pending" }])),
    projectChangeRequired: selectedFramework !== currentProjectFramework,
    confidence,
    scores,
    threshold: LOOPLAB_RUNTIME_SELECTION_POLICY.phaserThreshold,
    signals,
    reasons,
    knowledgeReasons,
    singleFile: {
      required: Boolean(singleFile),
      compatible: !singleFile || adapterAvailable,
      delivery: adapterAvailable ? ONE_FILE_DELIVERY_TARGET[selectedFramework] : "adapter-pending",
      targetDelivery: ONE_FILE_DELIVERY_TARGET[selectedFramework],
      rule: LOOPLAB_RUNTIME_SELECTION_POLICY.singleFilePolicy,
    },
    phaser: {
      optional: true,
      selected: selectedFramework === "phaser",
      recommended: recommendedFramework === "phaser",
      strengthens: ["scene lifecycle", "tilemaps", "camera tooling", "sprite animation", "Arcade Physics adapters", "debug tooling"],
      preserves: ["renderer-independent simulation", "semantic input snapshots", "authored collision authority", "deterministic replay", "DOM UI", "one offline HTML"],
      costs: ["larger encoded HTML", "more runtime memory", "engine-specific adapter and upgrade surface"],
    },
    runtimeKnowledge: LOOPLAB_RUNTIME_KNOWLEDGE,
    alternatives: [
      { framework: "canvas", bestWhen: "The game is lean, highly custom, dimetric-depth-heavy, or under a tight encoded-byte budget." },
      { framework: "phaser", bestWhen: "Scenes, tilemaps, cameras, sprite animation, physics tooling, or project scale are likely to improve the game." },
      { framework: "pixi", bestWhen: "A renderer-first scene graph is explicitly wanted without Phaser gameplay conventions." },
      { framework: "melon", bestWhen: "The project explicitly benefits from melonJS and Tiled-oriented runtime conventions." },
    ],
    authority: LOOPLAB_RUNTIME_SELECTION_POLICY.authority,
  };
}

function normalizeContext(project, request = {}) {
  const prompt = String(request.prompt ?? request.objective ?? "");
  const track = String(request.track ?? "gameplay");
  const requestedDimension = request.dimension ?? project.runtimeProfile?.dimension ?? "2d";
  const runtimeSelection = selectGameRuntime(project, request);
  const narrativeSelection = selectNarrativeSupport(project, request, prompt, track);
  const rawRequestedFramework = request.framework ?? request.runtimePreference ?? null;
  const invalidFramework = rawRequestedFramework != null && rawRequestedFramework !== "auto" && rawRequestedFramework !== "standalone" && !SUPPORTED_2D_FRAMEWORKS.has(rawRequestedFramework);
  const scopeCorrection = requestedDimension !== "2d" || invalidFramework
    ? "LoopLab authors 2D HTML games only. The request was kept in 2D; dimetric/isometric elevation remains authored x/y/z rendered through 2D sprites and Canvas projection."
    : null;
  return {
    prompt,
    track,
    dimension: "2d",
    framework: runtimeSelection.selectedFramework,
    runtimeSelection,
    narrativeSelection,
    hasActorProgram: project?.actorProgram?.enabled !== false && (project?.actorProgram?.actors?.length ?? 0) > 0,
    hasCollisionGeometry: (project?.maps ?? [project]).some((map) => (map?.collisionGeometry?.chains?.length ?? 0) > 0),
    requestedDimension,
    requestedFramework: rawRequestedFramework,
    scopeCorrection,
    projection: request.projection ?? project.projection?.type ?? "orthographic",
    singleFile: request.singleFile ?? project.release?.singleFile ?? true,
    promptMatches: (pattern) => pattern.test(prompt),
  };
}

export function routeGameStudioWork(project, request = {}) {
  const context = normalizeContext(project, request);
  const selected = GAME_STUDIO_CAPABILITIES.filter((capability) => capability.applies(context));
  const architecture = selected.find((capability) => capability.id === "web-game-foundations");
  const playtest = selected.find((capability) => capability.id === "game-playtest");
  const execution = selected.filter((capability) => !["web-game-foundations", "game-playtest"].includes(capability.id));
  const ordered = [architecture, ...execution, playtest].filter(Boolean);
  const agentPlan = buildAgentPlan(context, ordered);
  const rendererBoundary = context.framework === "phaser"
      ? "Phaser scenes are thin adapters; the Phaser browser build is embedded with an inline script tag and every loader URL resolves through the embedded asset manifest."
      : context.framework === "pixi"
        ? "PixiJS capability knowledge may shape LoopLab's scene graph, texture, batching, culling, and ticker decisions, but no Pixi runtime is shipped until its exact one-file adapter passes the static and browser gates."
        : context.framework === "melon"
          ? "melonJS capability knowledge may shape LoopLab's Tiled import, stage lifecycle, pooling, sparse-layer, and debug decisions, but no melonJS runtime is shipped until its exact one-file adapter passes the static and browser gates."
          : "Canvas 2D uses one fixed logical backbuffer, capped DPR presentation scaling, one render loop, and renderer-only interpolation.";
  const productionPlan = {
    schemaVersion: LOOPLAB_GAME_STUDIO_PLAN_SCHEMA,
    programOwned: true,
    externalSkillRequired: false,
    supplementsExistingArchitecture: true,
    runtimeSelection: context.runtimeSelection,
    design: {
      requiredBrief: ["player fantasy", "purpose-earned player decisions", "interaction relationships and recurring applications", "repeatable decide-act-feedback loop", "failure and recovery", "progression", "target session length"],
      rule: "Structured selections strengthen the user's words; they do not replace the user's vision or silently freeze art direction.",
    },
    narrative: {
      routing: context.narrativeSelection,
      roles: [
        { id: "narrative-designer", label: "Narrative Designer", owns: "causal structure, continuity, choices, state bindings, and ending payoff" },
        { id: "narrator-dialogue-writer", label: "Narrator & Dialogue Writer", owns: "narrator voice, dialogue, barks, tutorial copy, and readable text equivalents" },
      ],
      requiredWhenIncluded: ["story or world premise", "character and terminology continuity", "playable delivery plan", "state-bound beat/quest/dialogue/ending IDs", "skippable readable presentation", "continuity and payoff review"],
      execution: "Both roles run as ordered stages inside the same selected-provider invocation and write one shared narrative contract over gameplayProgram state.",
      boundary: LOOPLAB_NARRATIVE_ROUTING_POLICY.implementationBoundary,
    },
    architecture: {
      rule: "The deterministic simulation, authored project data, and saveable state stay independent from the selected release-ready renderer. Canvas and Phaser are disposable browser adapters; PixiJS and melonJS currently contribute program-owned design knowledge without claiming engine delivery.",
      phaserScenePolicy: "Use thin Boot/Menu/Gameplay/Overlay scenes only when selected. Scenes translate semantic inputs into simulation actions and render snapshots; they never own gameplay truth.",
      runtimeKnowledge: LOOPLAB_RUNTIME_KNOWLEDGE,
      compositionPolicy: LOOPLAB_RUNTIME_SELECTION_POLICY.compositionPolicy,
    },
    ui: {
      implementation: "DOM HUD and menus by default",
      persistentLayout: "One primary HUD cluster and at most one small secondary cluster; protect the center and lower-middle playfield.",
      overlays: "Pause, settings, controls, objectives, and long text live behind drawers or modal overlays that gate gameplay input.",
      accessibility: ["keyboard focus", "reduced motion", "readable contrast", "semantic labels", "touch controls only on touch-capable profiles"],
    },
    assets: {
      manifest: "Stable logical keys grouped by domain; renderer objects are never stored in project state.",
      pipeline: ["generate or import source art", "split and measure frames", "normalize shared scale and ground anchors", "lock palette where requested", "pack atlas", "report encoded and decoded memory"],
      collisionAuthority: "authored-map",
    },
    playtest: {
      executor: "playwright",
      independentGate: true,
      requiredEvidence: ["boot to useful state", "semantic input paths", "core-loop completion and recovery", "HUD and overlay readability", "affected viewport profiles", "screenshots", "zero unexpected runtime requests", "pause/focus lifecycle"],
      issueFormat: ["severity", "reproduction steps", "expected behavior", "actual behavior", "owner"],
    },
  };
  return {
    schemaVersion: LOOPLAB_GAME_STUDIO_PLAN_SCHEMA,
    productScope: {
      dimension: "2d",
      includes: ["side-scroller", "top-down", "single-screen", "connected maps", "dimetric/isometric 2.5D"],
      excludes: ["3D engine", "3D editor", "Three.js runtime", "React Three Fiber runtime", "GLB/glTF asset pipeline"],
      rule: "World z may express elevation, support, collision, and deterministic draw order, but rendering and authored assets remain 2D.",
    },
    context: { prompt: context.prompt, track: context.track, dimension: context.dimension, framework: context.framework, frameworkPreference: context.runtimeSelection.frameworkPreference, projection: context.projection, singleFile: context.singleFile, scopeCorrection: context.scopeCorrection, narrative: context.narrativeSelection },
    runtimeSelection: context.runtimeSelection,
    productionPlan,
    route: ordered.map((capability, index) => ({
      order: index + 1,
      capabilityId: capability.id,
      label: capability.label,
      owns: capability.owns,
      gate: capability.id === "game-playtest" ? "evidence-required" : "implementation",
    })),
    agentPlan,
    agentExecution: {
      mode: "single-provider-staged-review",
      providerInvocationsPerIteration: 1,
      independentAgentProcesses: false,
      truthPolicy: "The selected provider receives this ordered specialist plan in one generation request. A role is reported complete only when the provider returns its review receipt; Project Doctor and Playwright remain independent executable gates.",
      runtimePolicy: "The same deterministic runtime-selection receipt is supplied to OpenAI, Anthropic, Codex CLI, and Claude CLI. No provider-specific heuristic may silently choose a different framework.",
      narrativePolicy: "The same conditional narrative receipt is supplied to every provider. Story-bearing work receives both the Narrative Designer and Narrator/Dialogue Writer stages inside one provider call; mechanics-first work does not acquire mandatory story scope unless explicitly requested.",
    },
    reuseGuide: buildReuseGuideRoute(ordered),
    boundaries: {
      simulation: "Gameplay rules run at a fixed 60 Hz from action snapshots and a seeded PRNG; render, audio, and wall-clock state never feed back into simulation.",
      rendering: rendererBoundary,
      input: "DOM events update device state; each simulation tick consumes one immutable action snapshot, and input is cleared on blur, visibility loss, and pointer cancellation.",
      collision: "Authored map geometry is the sole collision owner; response is deterministic, support/visual footprints remain independent, and generated art never creates gameplay geometry.",
      presentation: "Simulation emits presentation events; hitstop, camera trauma, particles, sound, and UI consume them without mutating simulation state.",
      ui: "DOM HUD and menus use game-specific hierarchy, protect the playfield, gate input while modal, support reduced motion, and keep touch targets at least 44 CSS pixels.",
      assets: "Stable manifest keys point to normalized 2D sprite strips and tiles; one chosen project palette spans related frames, ground anchors are explicit, and encoded bytes are reported separately from decoded RGBA memory.",
      packaging: context.singleFile ? "The upload artifact is one offline HTML file. Runtime code, engine bundle, maps, authored collision, UI, and selected assets are inlined; no module import, CDN, network, or storage dependency may remain." : "Package against the project's declared host constraints.",
      verification: "Gate the generated HTML artifact, then end every pass with Playwright browser input, screenshot, responsive, transition, and overlay evidence. Report measured p95 frame time and encoded/decoded budgets.",
    },
  };
}
