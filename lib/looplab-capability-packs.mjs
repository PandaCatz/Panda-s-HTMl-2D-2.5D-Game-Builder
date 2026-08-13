import { canonicalSha256 } from "./looplab-canonical-digest.mjs";
import {
  GAME_STUDIO_CAPABILITIES,
  LOOPLAB_SPECIALIST_AGENTS,
  routeGameStudioWork,
} from "./looplab-capability-router.mjs";

export const LOOPLAB_CAPABILITY_PACK_SCHEMA = "looplab-capability-pack/v1";
export const LOOPLAB_CAPABILITY_PACK_REGISTRY_SCHEMA = "looplab-capability-pack-registry/v1";
export const LOOPLAB_CAPABILITY_PACK_QUERY_SCHEMA = "looplab-capability-pack-query/v1";
export const LOOPLAB_CAPABILITY_PACK_REFRESH_SCHEMA = "looplab-capability-pack-refresh-inspection/v1";
export const LOOPLAB_CAPABILITY_PACK_CALIBRATION_SCHEMA = "looplab-capability-pack-calibration/v1";

const REPOSITORY_URL = "https://github.com/PandaCatz/Panda-s-HTMl-2D-2.5D-Game-Builder";
const PACK_SOURCE_URL = `${REPOSITORY_URL}/blob/main/lib/looplab-capability-packs.mjs`;
const ROUTER_SOURCE_URL = `${REPOSITORY_URL}/blob/main/lib/looplab-capability-router.mjs`;
const STABLE_ID = /^[a-z0-9][a-z0-9-]*$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const HEX_SHA256 = /^[a-f0-9]{64}$/;
const MAX_QUERY_RESULTS = 40;

const PACK_AUTHORITY = Object.freeze({
  orientationOnly: true,
  executable: false,
  autoDownload: false,
  projectMutation: false,
  collisionAuthority: false,
  evidenceAuthority: false,
  creativeWinnerAuthority: false,
  refreshMode: "inspect-only",
  routerAuthority: "lib/looplab-capability-router.mjs",
  rule: "Capability packs provide bounded decision knowledge. The canonical router, authored project, Project Doctor, replay, browser evidence, and explicit human or agent judgment retain their existing authority.",
});

const CAPABILITY_DECISION_KNOWLEDGE = Object.freeze({
  "web-game-foundations": {
    chooseWhen: ["starting or restructuring any game", "defining simulation/render/input/save boundaries"],
    avoidWhen: ["never skip it because a renderer already supplies a scene graph"],
    guidance: "Keep serializable authored state and fixed-tick simulation independent from every renderer, DOM overlay, effect, and wall clock.",
  },
  "single-file-html-games": {
    chooseWhen: ["the deliverable is one offline HTML file", "evaluating encoded and decoded package cost"],
    avoidWhen: ["do not leave CDN, module, runtime fetch, or storage dependencies"],
    guidance: "Inline the selected runtime and assets, audit the exact emitted HTML, and measure encoded bytes separately from decoded memory.",
  },
  "phaser-core": {
    chooseWhen: ["scene lifecycle, cameras, loading, or scene transitions materially reduce custom orchestration"],
    avoidWhen: ["a lean custom renderer is sufficient", "Phaser would become gameplay truth"],
    guidance: "Use the pinned browser script-tag bundle in one-file builds; Phaser scenes remain thin adapters over LoopLab simulation.",
  },
  "phaser-2d-game": {
    chooseWhen: ["a larger 2D game benefits from scenes, animation managers, cameras, tilemaps, or debug tooling"],
    avoidWhen: ["engine migration is not explicitly approved for an existing project"],
    guidance: "Let Phaser organize presentation and lifecycle while stable authored IDs, collision, replay, and semantic input stay renderer-independent.",
  },
  "phaser-arcade-physics": {
    chooseWhen: ["Arcade bodies, gravity, overlaps, and debug views accelerate a compatible 2D mechanic"],
    avoidWhen: ["generated or engine geometry would replace authored collision", "the game needs unsupported general rigid-body physics"],
    guidance: "Treat Arcade Physics as an adapter and diagnostic aid; reconcile every body with authored collision and deterministic acceptance evidence.",
  },
  "pixijs-rendering": {
    chooseWhen: ["sprite count, batching, filters, compositing, or scene-graph control dominate"],
    avoidWhen: ["the project expects Pixi to supply gameplay, collision, scenes, or progression"],
    guidance: "Use the pinned browser UMD/IIFE path and one visible ticker; LoopLab continues to own gameplay and evidence.",
  },
  "melonjs-engine": {
    chooseWhen: ["Tiled/TMX authoring, level loading, pooling, or integrated stage conventions provide a concrete benefit"],
    avoidWhen: ["imported visual tile geometry would become collision truth"],
    guidance: "Use the pinned tree-shaken inline IIFE and validate imported Tiled data before mapping it to separate authored gameplay layers.",
  },
  "canvas-2d-performance": {
    chooseWhen: ["using Canvas directly or sharing renderer-neutral frame-budget rules"],
    avoidWhen: ["uncapped DPR, multiple frame owners, or per-frame allocation is left unmeasured"],
    guidance: "Use a fixed logical backbuffer, capped DPR, stable draw order, culling, prerendering, and measured p95 frame cost.",
  },
  "collision-and-response-2d": {
    chooseWhen: ["any object contacts floors, walls, slopes, supports, or one-way surfaces"],
    avoidWhen: ["inferring gameplay geometry from pixels or sprite bounds"],
    guidance: "Author collision separately, use deterministic stable ordering and explicit support/z contracts, then verify response rather than appearance.",
  },
  "high-speed-sweep-2d": {
    chooseWhen: ["fast bodies may cross thin geometry between fixed ticks"],
    avoidWhen: ["substeps alone are assumed to prove tunneling cannot occur"],
    guidance: "Sweep the authored body against eligible segments and surfaces, resolve earliest time of impact with stable ties, and expose a preview receipt.",
  },
  "rail-path-authoring": {
    chooseWhen: ["gameplay follows rails, grinds, ziplines, splines, or authored transfer paths"],
    avoidWhen: ["artwork or proximity implicitly captures the player"],
    guidance: "Use stable authored control points, explicit entry/speed/direction/exit/bail rules, and a fresh interaction input.",
  },
  "isometric-depth-sorting": {
    chooseWhen: ["2:1 dimetric/isometric maps contain elevation, underpasses, or foreground occlusion"],
    avoidWhen: ["screen position is treated as sufficient world or collision identity"],
    guidance: "Keep reversible world x/y/z projection, support height, collision z ranges, and visual depth slices as separate contracts.",
  },
  "input-and-mobile-viewport": {
    chooseWhen: ["keyboard, pointer, gamepad, focus lifecycle, touch, or responsive viewport behavior matters"],
    avoidWhen: ["desktop builds display touch controls without a touch-capable profile"],
    guidance: "Convert devices to semantic per-tick action snapshots and clear held state on every focus, visibility, and pointer-cancel boundary.",
  },
  "camera-strategy-library": {
    chooseWhen: ["camera framing materially affects anticipation, navigation, or comfort"],
    avoidWhen: ["camera motion hides required cues or ignores reduced-motion settings"],
    guidance: "Select an explicit camera strategy with dead zones, look-ahead, cue zones, and bounded motion rather than ad hoc following.",
  },
  "game-feel-and-juice": {
    chooseWhen: ["controls are correct but stiff, delayed, unclear, or unrewarding"],
    avoidWhen: ["presentation effects mutate deterministic gameplay state"],
    guidance: "Improve input forgiveness and feedback through explicit bounded contracts; keep shake, hitstop, particles, and audio presentation-only.",
  },
  "narrative-design": {
    chooseWhen: ["the authored brief materially includes story, character, dialogue, quest, lore, choices, or endings"],
    avoidWhen: ["mandatory story is added to a mechanics-first brief", "prose is treated as implemented gameplay"],
    guidance: "Bind beats, lines, choices, and endings to stable gameplay/map/state IDs and provide readable equivalents for spoken information.",
  },
  "procedural-web-audio": {
    chooseWhen: ["a self-contained build needs compact sound or music systems"],
    avoidWhen: ["audio starts before user gesture or clicks through unsafe envelopes"],
    guidance: "Unlock on gesture, cap voices, use click-free envelopes and a master limiter, and keep beat timing simulation-owned when gameplay depends on it.",
  },
  "game-ui-frontend": {
    chooseWhen: ["HUD, menus, overlays, onboarding, settings, or accessibility surfaces are required"],
    avoidWhen: ["persistent UI obscures the playfield or modal UI leaks gameplay input"],
    guidance: "Prefer responsive semantic DOM overlays, protect the center/lower playfield, and gate controls while overlays are active.",
  },
  "sprite-pipeline": {
    chooseWhen: ["generated or imported characters, props, effects, or tile strips require game-ready normalization"],
    avoidWhen: ["unmeasured frames are attached directly to a project"],
    guidance: "Split, analyze, matte-clean, shared-scale normalize, ground-anchor, palette-lock when requested, pack, and provenance-stamp before attachment.",
  },
  "animation-state-editor": {
    chooseWhen: ["sprite frames must become interruptible gameplay-facing animation states"],
    avoidWhen: ["frame timing or event placement changes simulation truth implicitly"],
    guidance: "Author frame slicing, anchors, rates, transitions, and presentation-only frame events with stable state IDs.",
  },
  "pixel-art-palette-pipeline": {
    chooseWhen: ["pixel art must remain stable across frames, tiles, scales, and generated sources"],
    avoidWhen: ["each frame is independently quantized or downscaled without alpha-aware filtering"],
    guidance: "Use one approved palette, deterministic quantization, alpha-weighted resampling, and explicit flicker/on-palette gates.",
  },
  "deterministic-sim-replay": {
    chooseWhen: ["mechanics, regression fixtures, ghosts, seeds, or repeatable QA require exact simulation"],
    avoidWhen: ["changed hashes are silently rerecorded or old versions are reinterpreted"],
    guidance: "Use fixed ticks, seeded randomness, semantic inputs, versioned state projections, and fail at the first divergent tick.",
  },
  "deterministic-actor-systems": {
    chooseWhen: ["NPCs, enemies, companions, patrols, perception, chase, flee, or cutscene routes are authored"],
    avoidWhen: ["render sprites own navigation or behavior state"],
    guidance: "Bind actors to authored objects/navigation and evaluate fixed-tick stable-ID behavior priority with replay and acceptance coverage.",
  },
  "continuous-world-chunks": {
    chooseWhen: ["large connected districts, streaming panoramas, endless routes, or closed loops need bounded residency"],
    avoidWhen: ["copied overlap or prefetch claims are accepted without a real runtime join"],
    guidance: "Author entry/exit grammar and embedded chunks, then verify exact joins, draw coverage, decode timing, residency, and loop closure.",
  },
  "effects-plugin-system": {
    chooseWhen: ["afterimages, parallax, filters, trails, reflections, or grading should be reusable"],
    avoidWhen: ["an effect becomes required simulation state or ignores reduced motion"],
    guidance: "Keep effects parameterized, renderer-side, removable, budgeted, and paired with reduced-motion behavior.",
  },
  "performance-profiler": {
    chooseWhen: ["release decisions require measured frame, memory, startup, or input-latency evidence"],
    avoidWhen: ["average FPS or encoded bytes alone are treated as sufficient"],
    guidance: "Report p95 frame cost, catch-up drops, long frames, first draw, input-to-render latency, encoded bytes, decoded bytes, and GPU estimates separately.",
  },
  "verification-gates": {
    chooseWhen: ["every implementation or release pass"],
    avoidWhen: ["a validator is added without known-good calibration or false-positive control"],
    guidance: "Bind every receipt to exact source/artifact identity, calibrate the check, report numeric limits, and never turn a proxy into a quality claim.",
  },
  "game-playtest": {
    chooseWhen: ["every browser-visible change and every release candidate"],
    avoidWhen: ["DOM state or deterministic simulation is used as a substitute for rendered browser evidence"],
    guidance: "Use Playwright to drive semantic inputs, transitions, overlays, and affected viewports; retain screenshots and unexpected-request evidence.",
  },
});

const CALIBRATION_CASES = Object.freeze([
  {
    id: "phaser-runtime-route",
    label: "Phaser runtime and physics routing",
    request: { track: "runtime", framework: "phaser", prompt: "Use Phaser scenes and Arcade Physics for a platformer" },
    expectedCapabilityIds: ["web-game-foundations", "single-file-html-games", "phaser-core", "phaser-2d-game", "phaser-arcade-physics", "canvas-2d-performance", "collision-and-response-2d", "verification-gates", "game-playtest"],
  },
  {
    id: "dimetric-map-route",
    label: "Dimetric elevation and authored collision routing",
    request: { track: "maps", projection: "dimetric-2:1", prompt: "raised dimetric terrain with an underpass and authored collision" },
    expectedCapabilityIds: ["web-game-foundations", "single-file-html-games", "canvas-2d-performance", "collision-and-response-2d", "high-speed-sweep-2d", "rail-path-authoring", "isometric-depth-sorting", "camera-strategy-library", "deterministic-sim-replay", "verification-gates", "game-playtest"],
  },
  {
    id: "pixel-assets-route",
    label: "Pixel sprite and palette routing",
    request: { track: "assets", prompt: "pixel art sprite sheet palette atlas animation frames" },
    expectedCapabilityIds: ["web-game-foundations", "single-file-html-games", "canvas-2d-performance", "sprite-pipeline", "animation-state-editor", "pixel-art-palette-pipeline", "effects-plugin-system", "verification-gates", "game-playtest"],
  },
  {
    id: "one-file-release-route",
    label: "One-file release and browser evidence routing",
    request: { track: "release", singleFile: true, prompt: "one offline HTML with performance verification" },
    expectedCapabilityIds: ["web-game-foundations", "single-file-html-games", "canvas-2d-performance", "input-and-mobile-viewport", "game-ui-frontend", "deterministic-sim-replay", "performance-profiler", "verification-gates", "game-playtest"],
  },
]);

const PACK_SEEDS = Object.freeze([
  {
    id: "architecture-delivery",
    label: "Architecture & one-file delivery",
    scope: "Renderer-independent architecture and the self-contained HTML upload contract.",
    categories: ["architecture", "packaging", "offline"],
    capabilityIds: ["web-game-foundations", "single-file-html-games"],
    specialistOwnerIds: ["technical-architect", "release-engineer"],
    decisionRules: [
      "Establish simulation, render, input, asset, save, and evidence ownership before selecting a renderer.",
      "A framework is eligible for a one-file game only when its exact browser bytes and every asset can be inlined and audited.",
    ],
  },
  {
    id: "runtime-renderers",
    label: "2D runtimes & renderers",
    scope: "Canvas, Phaser, PixiJS, and melonJS decision knowledge with one primary frame owner.",
    categories: ["runtime", "rendering", "performance"],
    capabilityIds: ["phaser-core", "phaser-2d-game", "phaser-arcade-physics", "pixijs-rendering", "melonjs-engine", "canvas-2d-performance"],
    specialistOwnerIds: ["technical-architect", "gameplay-engineer", "release-engineer"],
    decisionRules: [
      "Choose the smallest release-ready adapter that provides a concrete quality or tooling benefit for the brief.",
      "Compose renderer capabilities, not competing engines: exactly one runtime owns visible frames while LoopLab services remain shared.",
      "Do not migrate an existing game's runtime without explicit opt-in and equivalent release evidence.",
    ],
  },
  {
    id: "spatial-gameplay",
    label: "Spatial gameplay & control",
    scope: "Authored collision, traversal, elevation, camera, input, feel, actors, and connected-world behavior.",
    categories: ["gameplay", "collision", "maps", "input", "dimetric"],
    capabilityIds: ["collision-and-response-2d", "high-speed-sweep-2d", "rail-path-authoring", "isometric-depth-sorting", "input-and-mobile-viewport", "camera-strategy-library", "game-feel-and-juice", "deterministic-actor-systems", "continuous-world-chunks"],
    specialistOwnerIds: ["gameplay-engineer", "actor-systems-designer", "level-collision-architect"],
    decisionRules: [
      "Author gameplay geometry and state separately from visible pixels and renderer objects.",
      "Every route, support, portal, and raised surface uses stable IDs plus explicit world-space and z/depth contracts.",
      "Responsive feel may add forgiveness and presentation, but must not weaken deterministic collision or evidence.",
    ],
  },
  {
    id: "experience-content",
    label: "Narrative, audio & interface",
    scope: "Player-facing story, sound, HUD, menus, overlays, accessibility, and playfield protection.",
    categories: ["narrative", "audio", "ui", "accessibility"],
    capabilityIds: ["narrative-design", "procedural-web-audio", "game-ui-frontend"],
    specialistOwnerIds: ["narrative-designer", "narrator-dialogue-writer", "audio-designer", "ui-accessibility-designer"],
    decisionRules: [
      "Route narrative only when authored intent materially asks for it, then bind required information to stable runtime state.",
      "Keep essential information readable without audio and keep modal UI from leaking gameplay input.",
    ],
  },
  {
    id: "art-presentation",
    label: "Sprites, animation & visual effects",
    scope: "Measured game-ready 2D art normalization, stable animation identity, palette control, and removable effects.",
    categories: ["art", "sprites", "animation", "palette", "effects"],
    capabilityIds: ["sprite-pipeline", "animation-state-editor", "pixel-art-palette-pipeline", "effects-plugin-system"],
    specialistOwnerIds: ["art-director", "gameplay-engineer", "release-engineer"],
    decisionRules: [
      "Generated art remains source material until frame analysis, anchor/scale normalization, palette handling, packing, and provenance succeed.",
      "Art and effects never create collision or deterministic gameplay state.",
    ],
  },
  {
    id: "verification-release",
    label: "Replay, profiling & browser QA",
    scope: "Deterministic regression evidence, calibrated gates, measured performance, and real browser playtests.",
    categories: ["verification", "replay", "performance", "playtest", "release"],
    capabilityIds: ["deterministic-sim-replay", "performance-profiler", "verification-gates", "game-playtest"],
    specialistOwnerIds: ["project-doctor-critic", "playtest-qa", "release-engineer"],
    decisionRules: [
      "Technical gates prove only their measured invariants; they never prove fun, beauty, originality, or player preference.",
      "Run deterministic checks before browser QA, and bind every receipt to the exact source or emitted artifact it measured.",
    ],
  },
]);

const capabilityById = new Map(GAME_STUDIO_CAPABILITIES.map((capability) => [capability.id, capability]));
const specialistById = new Map(LOOPLAB_SPECIALIST_AGENTS.map((agent) => [agent.id, agent]));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function packSourceProjection(pack) {
  return {
    id: pack.id,
    revision: pack.revision,
    label: pack.label,
    scope: pack.scope,
    categories: pack.categories,
    capabilities: pack.capabilities,
    specialistOwners: pack.specialistOwners,
    decisionRules: pack.decisionRules,
    calibrationCaseIds: pack.calibrationCaseIds,
    policy: pack.policy,
  };
}

function packDigestProjection(pack) {
  const value = clone(pack);
  delete value.digest;
  return value;
}

function registryDigestProjection(registry) {
  const value = clone(registry);
  delete value.digest;
  return value;
}

function capabilityEntry(capability, specialistOwnerIds) {
  const knowledge = CAPABILITY_DECISION_KNOWLEDGE[capability.id];
  if (!knowledge) throw new Error(`Capability ${capability.id} is missing decision knowledge.`);
  return {
    id: capability.id,
    label: capability.label,
    owns: [...capability.owns],
    specialistOwnerIds: [...specialistOwnerIds],
    chooseWhen: [...knowledge.chooseWhen],
    avoidWhen: [...knowledge.avoidWhen],
    guidance: knowledge.guidance,
    sourceCapabilityDigest: canonicalSha256({ id: capability.id, label: capability.label, owns: capability.owns }),
  };
}

function buildCapabilityPack(seed, revision = 1) {
  const capabilities = seed.capabilityIds.map((id) => {
    const capability = capabilityById.get(id);
    if (!capability) throw new Error(`Capability pack ${seed.id} references unknown capability ${id}.`);
    return capabilityEntry(capability, seed.specialistOwnerIds);
  });
  const specialistOwners = seed.specialistOwnerIds.map((id) => {
    const agent = specialistById.get(id);
    if (!agent) throw new Error(`Capability pack ${seed.id} references unknown specialist ${id}.`);
    return { id: agent.id, label: agent.label, owns: [...agent.owns] };
  });
  const calibrationCaseIds = CALIBRATION_CASES
    .filter((testCase) => testCase.expectedCapabilityIds.some((id) => seed.capabilityIds.includes(id)))
    .map((testCase) => testCase.id);
  const base = {
    schemaVersion: LOOPLAB_CAPABILITY_PACK_SCHEMA,
    id: seed.id,
    revision,
    label: seed.label,
    scope: seed.scope,
    categories: [...seed.categories],
    capabilities,
    specialistOwners,
    decisionRules: [...seed.decisionRules],
    calibrationCaseIds,
    policy: clone(PACK_AUTHORITY),
  };
  const contentDigest = canonicalSha256(packSourceProjection(base));
  const pack = {
    ...base,
    contentDigest,
    sources: [{
      id: `${seed.id}-native-source`,
      uri: `looplab://capability-pack-source/${seed.id}@${revision}`,
      immutableRef: `looplab-native:${seed.id}@${revision}`,
      mediaType: "application/json",
      sha256: contentDigest.slice("sha256:".length),
      licenseExpression: "NOASSERTION",
      licenseEvidenceUri: ROUTER_SOURCE_URL,
      rightsBoundary: "The repository currently publishes no license file. Integrity metadata must not be interpreted as permission to copy third-party material or as a commercial-use grant.",
    }],
    provenance: {
      schemaVersion: "looplab-capability-pack-provenance/v1",
      kind: "unsigned-local-build",
      builderId: "lib/looplab-capability-packs.mjs",
      builderSourceUri: PACK_SOURCE_URL,
      sourceDigest: contentDigest,
      reproducible: true,
      claimBoundary: "This deterministic local statement binds content to the checked-in builder. It does not claim signer identity, remote authenticity, or SLSA certification.",
    },
  };
  pack.digest = canonicalSha256(packDigestProjection(pack));
  return Object.freeze(pack);
}

const BUILT_IN_PACKS = Object.freeze(PACK_SEEDS.map((seed) => buildCapabilityPack(seed)));
const builtInPackById = new Map(BUILT_IN_PACKS.map((pack) => [pack.id, pack]));

export function runCapabilityPackCalibrations() {
  const cases = CALIBRATION_CASES.map((testCase) => {
    const actualCapabilityIds = routeGameStudioWork({}, testCase.request).route.map((entry) => entry.capabilityId);
    const passed = JSON.stringify(actualCapabilityIds) === JSON.stringify(testCase.expectedCapabilityIds);
    return {
      id: testCase.id,
      label: testCase.label,
      requestDigest: canonicalSha256(testCase.request),
      expectationDigest: canonicalSha256(testCase.expectedCapabilityIds),
      actualDigest: canonicalSha256(actualCapabilityIds),
      expectedCapabilityIds: [...testCase.expectedCapabilityIds],
      actualCapabilityIds,
      passed,
    };
  });
  const receipt = {
    schemaVersion: LOOPLAB_CAPABILITY_PACK_CALIBRATION_SCHEMA,
    router: "lib/looplab-capability-router.mjs",
    caseCount: cases.length,
    passedCount: cases.filter((entry) => entry.passed).length,
    valid: cases.every((entry) => entry.passed),
    cases,
    claimBoundary: "These deterministic fixtures detect registry/router drift. They do not prove provider judgment, game quality, or runtime correctness.",
  };
  return { ...receipt, digest: canonicalSha256(receipt) };
}

const BUILT_IN_CALIBRATION = Object.freeze(runCapabilityPackCalibrations());

export function validateCapabilityPack(pack) {
  const errors = [];
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) return { valid: false, errors: ["Pack must be a JSON object."] };
  if (pack.schemaVersion !== LOOPLAB_CAPABILITY_PACK_SCHEMA) errors.push(`schemaVersion must be ${LOOPLAB_CAPABILITY_PACK_SCHEMA}`);
  if (!STABLE_ID.test(String(pack.id ?? ""))) errors.push("id must be a lowercase stable ID");
  if (!Number.isInteger(pack.revision) || pack.revision < 1) errors.push("revision must be a positive integer");
  if (!Array.isArray(pack.categories) || !pack.categories.length || pack.categories.some((entry) => !STABLE_ID.test(String(entry)))) errors.push("categories must contain stable IDs");
  if (!Array.isArray(pack.capabilities) || !pack.capabilities.length) errors.push("capabilities must be a non-empty array");
  const seenCapabilities = new Set();
  for (const [index, entry] of (pack.capabilities ?? []).entries()) {
    const label = `capabilities[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) { errors.push(`${label} must be an object`); continue; }
    if (!STABLE_ID.test(String(entry.id ?? ""))) errors.push(`${label}.id must be a stable ID`);
    if (seenCapabilities.has(entry.id)) errors.push(`${label}.id is duplicated`);
    seenCapabilities.add(entry.id);
    const canonical = capabilityById.get(entry.id);
    if (!canonical) errors.push(`${label}.id is not a current LoopLab capability`);
    else {
      if (entry.label !== canonical.label) errors.push(`${label}.label differs from the canonical router`);
      if (JSON.stringify(entry.owns) !== JSON.stringify(canonical.owns)) errors.push(`${label}.owns differs from the canonical router`);
      if (entry.sourceCapabilityDigest !== canonicalSha256({ id: canonical.id, label: canonical.label, owns: canonical.owns })) errors.push(`${label}.sourceCapabilityDigest is stale`);
    }
    if (!Array.isArray(entry.chooseWhen) || !entry.chooseWhen.length) errors.push(`${label}.chooseWhen must be non-empty`);
    if (!Array.isArray(entry.avoidWhen) || !entry.avoidWhen.length) errors.push(`${label}.avoidWhen must be non-empty`);
    if (typeof entry.guidance !== "string" || !entry.guidance.trim()) errors.push(`${label}.guidance must be non-empty`);
    for (const ownerId of entry.specialistOwnerIds ?? []) if (!specialistById.has(ownerId)) errors.push(`${label} references unknown specialist ${ownerId}`);
  }
  if (!Array.isArray(pack.specialistOwners) || pack.specialistOwners.some((entry) => !specialistById.has(entry?.id))) errors.push("specialistOwners must reference the current specialist roster");
  if (!Array.isArray(pack.decisionRules) || !pack.decisionRules.length) errors.push("decisionRules must be non-empty");
  if (!Array.isArray(pack.calibrationCaseIds) || pack.calibrationCaseIds.some((id) => !CALIBRATION_CASES.some((entry) => entry.id === id))) errors.push("calibrationCaseIds must reference known calibration cases");
  for (const [key, expected] of Object.entries(PACK_AUTHORITY)) if (pack.policy?.[key] !== expected) errors.push(`policy.${key} must preserve the native authority boundary`);
  const expectedContentDigest = canonicalSha256(packSourceProjection(pack));
  if (pack.contentDigest !== expectedContentDigest) errors.push("contentDigest does not match the canonical pack content");
  if (!Array.isArray(pack.sources) || !pack.sources.length) errors.push("sources must be a non-empty array");
  for (const [index, source] of (pack.sources ?? []).entries()) {
    const label = `sources[${index}]`;
    if (!HEX_SHA256.test(String(source?.sha256 ?? ""))) errors.push(`${label}.sha256 must be an exact SHA-256 hex digest`);
    if (source?.sha256 !== expectedContentDigest.slice("sha256:".length)) errors.push(`${label}.sha256 does not bind the canonical pack content`);
    if (typeof source?.immutableRef !== "string" || !source.immutableRef.trim()) errors.push(`${label}.immutableRef is required`);
    if (source?.immutableRef !== `looplab-native:${pack.id}@${pack.revision}`) errors.push(`${label}.immutableRef must bind the exact pack ID and revision`);
    if (source?.uri !== `looplab://capability-pack-source/${pack.id}@${pack.revision}`) errors.push(`${label}.uri must bind the exact pack ID and revision`);
    if (typeof source?.licenseExpression !== "string" || !source.licenseExpression.trim()) errors.push(`${label}.licenseExpression is required`);
    if (typeof source?.licenseEvidenceUri !== "string" || !source.licenseEvidenceUri.trim()) errors.push(`${label}.licenseEvidenceUri is required`);
  }
  if (pack.provenance?.kind !== "unsigned-local-build") errors.push("provenance.kind must truthfully remain unsigned-local-build");
  if (pack.provenance?.sourceDigest !== expectedContentDigest) errors.push("provenance.sourceDigest does not match canonical pack content");
  if (!String(pack.provenance?.claimBoundary ?? "").includes("does not claim")) errors.push("provenance must state its claim boundary");
  const expectedDigest = canonicalSha256(packDigestProjection(pack));
  if (!SHA256.test(String(pack.digest ?? "")) || pack.digest !== expectedDigest) errors.push("digest does not match the complete canonical pack envelope");
  try {
    const serialized = JSON.stringify(pack);
    if (serialized.includes("[native code]")) errors.push("pack contains executable source material");
  } catch {
    errors.push("pack must be JSON serializable");
  }
  return { valid: errors.length === 0, errors, expectedContentDigest, expectedDigest };
}

function buildRegistry() {
  const packs = [...BUILT_IN_PACKS].sort((left, right) => left.id.localeCompare(right.id)).map(clone);
  const registry = {
    schemaVersion: LOOPLAB_CAPABILITY_PACK_REGISTRY_SCHEMA,
    revision: 1,
    packCount: packs.length,
    capabilityCount: packs.reduce((total, pack) => total + pack.capabilities.length, 0),
    packs,
    calibration: clone(BUILT_IN_CALIBRATION),
    policy: clone(PACK_AUTHORITY),
    source: {
      uri: "looplab://capability-packs",
      builderSourceUri: PACK_SOURCE_URL,
      licenseExpression: "NOASSERTION",
      licenseBoundary: "License declarations are metadata and evidence pointers, not proof of rights. No third-party capability text or executable code is downloaded or redistributed by this registry.",
    },
  };
  registry.digest = canonicalSha256(registryDigestProjection(registry));
  return registry;
}

const BUILT_IN_REGISTRY = Object.freeze(buildRegistry());

export function validateCapabilityPackRegistry(registry = BUILT_IN_REGISTRY) {
  const errors = [];
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) return { valid: false, errors: ["Registry must be a JSON object."] };
  if (registry.schemaVersion !== LOOPLAB_CAPABILITY_PACK_REGISTRY_SCHEMA) errors.push(`schemaVersion must be ${LOOPLAB_CAPABILITY_PACK_REGISTRY_SCHEMA}`);
  const packs = Array.isArray(registry.packs) ? registry.packs : [];
  if (registry.packCount !== packs.length) errors.push("packCount does not match packs.length");
  const packIds = new Set();
  const capabilityIds = new Set();
  for (const pack of packs) {
    if (packIds.has(pack.id)) errors.push(`pack ID ${pack.id} is duplicated`);
    packIds.add(pack.id);
    const validation = validateCapabilityPack(pack);
    errors.push(...validation.errors.map((error) => `${pack.id}: ${error}`));
    for (const capability of pack.capabilities ?? []) {
      if (capabilityIds.has(capability.id)) errors.push(`capability ${capability.id} appears in more than one pack`);
      capabilityIds.add(capability.id);
    }
  }
  const canonicalCapabilityIds = GAME_STUDIO_CAPABILITIES.map((entry) => entry.id).sort();
  if (JSON.stringify([...capabilityIds].sort()) !== JSON.stringify(canonicalCapabilityIds)) errors.push("registry must cover every canonical capability exactly once");
  if (registry.capabilityCount !== capabilityIds.size) errors.push("capabilityCount does not match unique capability coverage");
  if (registry.calibration?.valid !== true || registry.calibration?.passedCount !== registry.calibration?.caseCount) errors.push("all router calibration cases must pass");
  for (const [key, expected] of Object.entries(PACK_AUTHORITY)) if (registry.policy?.[key] !== expected) errors.push(`policy.${key} must preserve the native authority boundary`);
  const expectedDigest = canonicalSha256(registryDigestProjection(registry));
  if (registry.digest !== expectedDigest) errors.push("registry digest does not match the canonical registry envelope");
  return { valid: errors.length === 0, errors, expectedDigest, packCount: packs.length, capabilityCount: capabilityIds.size };
}

export function getCapabilityPackRegistry() {
  return clone(BUILT_IN_REGISTRY);
}

function boundedLimit(value, fallback = 20) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_QUERY_RESULTS, Math.floor(parsed)));
}

function searchableText(pack, capability = null) {
  const values = capability
    ? [pack.id, pack.label, ...pack.categories, capability.id, capability.label, ...capability.owns, ...capability.chooseWhen, ...capability.avoidWhen, capability.guidance]
    : [pack.id, pack.label, pack.scope, ...pack.categories, ...pack.decisionRules, ...pack.capabilities.flatMap((entry) => [entry.id, entry.label, ...entry.owns])];
  return values.join(" ").toLowerCase();
}

function queryScore(text, query) {
  const normalized = String(query ?? "").trim().toLowerCase();
  if (!normalized) return 1;
  let score = text.includes(normalized) ? 20 : 0;
  for (const token of [...new Set(normalized.split(/[^a-z0-9]+/).filter((entry) => entry.length > 1))]) if (text.includes(token)) score += 3;
  return score;
}

/**
 * @param {{ query?: string, category?: string, limit?: number, offset?: number }} [options]
 */
export function listCapabilityPacks({ query = "", category, limit = 20, offset = 0 } = {}) {
  const normalizedCategory = String(category ?? "").trim().toLowerCase();
  const start = Math.max(0, Math.floor(Number(offset) || 0));
  const maximum = boundedLimit(limit);
  const matches = BUILT_IN_PACKS
    .map((pack) => ({ pack, score: queryScore(searchableText(pack), query) }))
    .filter(({ pack, score }) => score > 0 && (!normalizedCategory || pack.categories.includes(normalizedCategory)))
    .sort((left, right) => right.score - left.score || left.pack.id.localeCompare(right.pack.id));
  return {
    schemaVersion: LOOPLAB_CAPABILITY_PACK_QUERY_SCHEMA,
    mode: "pack-list",
    registryDigest: BUILT_IN_REGISTRY.digest,
    query: String(query ?? "").trim(),
    category: normalizedCategory || null,
    total: matches.length,
    offset: start,
    limit: maximum,
    packs: matches.slice(start, start + maximum).map(({ pack }) => ({
      id: pack.id,
      revision: pack.revision,
      label: pack.label,
      scope: pack.scope,
      categories: [...pack.categories],
      capabilityCount: pack.capabilities.length,
      capabilityIds: pack.capabilities.map((entry) => entry.id),
      digest: pack.digest,
      contentDigest: pack.contentDigest,
      licenseExpressions: [...new Set(pack.sources.map((source) => source.licenseExpression))],
      calibrationCaseIds: [...pack.calibrationCaseIds],
    })),
    authority: clone(PACK_AUTHORITY),
  };
}

/** @param {string} packId */
export function getCapabilityPack(packId) {
  const id = String(packId ?? "").trim();
  const pack = builtInPackById.get(id);
  if (!pack) throw new Error(`Unknown capability pack: ${id || "(empty)"}.`);
  return {
    schemaVersion: LOOPLAB_CAPABILITY_PACK_QUERY_SCHEMA,
    mode: "pack-detail",
    registryDigest: BUILT_IN_REGISTRY.digest,
    pack: clone(pack),
    validation: validateCapabilityPack(pack),
    calibration: {
      schemaVersion: LOOPLAB_CAPABILITY_PACK_CALIBRATION_SCHEMA,
      valid: pack.calibrationCaseIds.every((idValue) => BUILT_IN_CALIBRATION.cases.find((entry) => entry.id === idValue)?.passed === true),
      cases: BUILT_IN_CALIBRATION.cases.filter((entry) => pack.calibrationCaseIds.includes(entry.id)).map(clone),
    },
    authority: clone(PACK_AUTHORITY),
  };
}

/**
 * @param {{ query?: string, packIds?: string[], capabilityIds?: string[], limit?: number }} [options]
 */
export function queryCapabilityKnowledge({ query = "", packIds = [], capabilityIds = [], limit = 12 } = {}) {
  const requestedPacks = new Set((packIds ?? []).map((entry) => String(entry).trim()).filter(Boolean));
  const requestedCapabilities = new Set((capabilityIds ?? []).map((entry) => String(entry).trim()).filter(Boolean));
  const maximum = boundedLimit(limit, 12);
  const results = [];
  for (const pack of BUILT_IN_PACKS) {
    if (requestedPacks.size && !requestedPacks.has(pack.id)) continue;
    for (const capability of pack.capabilities) {
      if (requestedCapabilities.size && !requestedCapabilities.has(capability.id)) continue;
      const score = queryScore(searchableText(pack, capability), query);
      if (score <= 0) continue;
      results.push({
        score,
        packId: pack.id,
        packRevision: pack.revision,
        packDigest: pack.digest,
        capability: clone(capability),
        decisionRules: [...pack.decisionRules],
        source: clone(pack.sources[0]),
      });
    }
  }
  results.sort((left, right) => right.score - left.score || left.capability.id.localeCompare(right.capability.id));
  return {
    schemaVersion: LOOPLAB_CAPABILITY_PACK_QUERY_SCHEMA,
    mode: "knowledge-search",
    registryDigest: BUILT_IN_REGISTRY.digest,
    query: String(query ?? "").trim(),
    total: results.length,
    limit: maximum,
    results: results.slice(0, maximum).map((entry) => ({
      packId: entry.packId,
      packRevision: entry.packRevision,
      packDigest: entry.packDigest,
      capability: entry.capability,
      decisionRules: entry.decisionRules,
      source: entry.source,
    })),
    authority: clone(PACK_AUTHORITY),
  };
}

function structuralDiff(current, candidate) {
  const currentCapabilities = new Map((current.capabilities ?? []).map((entry) => [entry.id, entry]));
  const candidateCapabilities = new Map((candidate.capabilities ?? []).map((entry) => [entry.id, entry]));
  const addedCapabilityIds = [...candidateCapabilities.keys()].filter((id) => !currentCapabilities.has(id)).sort();
  const removedCapabilityIds = [...currentCapabilities.keys()].filter((id) => !candidateCapabilities.has(id)).sort();
  const changedCapabilityIds = [...candidateCapabilities.keys()].filter((id) => currentCapabilities.has(id) && canonicalSha256(candidateCapabilities.get(id)) !== canonicalSha256(currentCapabilities.get(id))).sort();
  const fields = ["label", "scope", "categories", "specialistOwners", "decisionRules", "calibrationCaseIds", "policy", "sources", "provenance"];
  const changedFields = fields.filter((field) => canonicalSha256(candidate[field]) !== canonicalSha256(current[field]));
  return { addedCapabilityIds, removedCapabilityIds, changedCapabilityIds, changedFields };
}

export function inspectCapabilityPackRefresh(candidateInput) {
  const candidate = clone(candidateInput);
  const current = builtInPackById.get(String(candidate?.id ?? ""));
  const candidateValidation = validateCapabilityPack(candidate);
  const base = {
    schemaVersion: LOOPLAB_CAPABILITY_PACK_REFRESH_SCHEMA,
    inspectedOnly: true,
    mutationApplied: false,
    candidateId: candidate?.id ?? null,
    candidateRevision: Number.isInteger(candidate?.revision) ? candidate.revision : null,
    candidateDigest: candidate?.digest ?? null,
    registryDigest: BUILT_IN_REGISTRY.digest,
    policy: clone(PACK_AUTHORITY),
  };
  if (!current) return { ...base, status: "unknown-pack", admissible: false, errors: [`No installed capability pack has ID ${candidate?.id ?? "(empty)"}.`], candidateValidation };
  const diff = structuralDiff(current, candidate);
  if (candidate.revision < current.revision) return { ...base, status: "rollback-rejected", admissible: false, currentRevision: current.revision, currentDigest: current.digest, diff, errors: ["Candidate revision is lower than the installed revision."], candidateValidation };
  if (candidate.revision === current.revision && candidate.digest === current.digest) return { ...base, status: "current", admissible: false, noOp: true, currentRevision: current.revision, currentDigest: current.digest, diff, errors: [], candidateValidation };
  if (candidate.revision === current.revision && candidate.digest !== current.digest) return { ...base, status: "equivocation-rejected", admissible: false, currentRevision: current.revision, currentDigest: current.digest, diff, errors: ["The same pack revision was presented with different content."], candidateValidation };
  if (!candidateValidation.valid) return { ...base, status: "invalid-candidate", admissible: false, currentRevision: current.revision, currentDigest: current.digest, diff, errors: candidateValidation.errors, candidateValidation };
  const removedCurrentCapability = diff.removedCapabilityIds.length > 0;
  const addedCanonicalCapability = diff.addedCapabilityIds.length > 0;
  const unknownCapability = (candidate.capabilities ?? []).some((entry) => !capabilityById.has(entry.id));
  const calibrationIds = new Set(candidate.calibrationCaseIds ?? []);
  const missingCalibration = (candidate.capabilities ?? []).some((entry) => CALIBRATION_CASES.some((testCase) => testCase.expectedCapabilityIds.includes(entry.id)) && !CALIBRATION_CASES.some((testCase) => calibrationIds.has(testCase.id) && testCase.expectedCapabilityIds.includes(entry.id)));
  const policyChanged = diff.changedFields.includes("policy");
  const errors = [
    ...(removedCurrentCapability ? ["A refresh cannot remove an installed canonical capability."] : []),
    ...(addedCanonicalCapability ? ["A refresh cannot move or duplicate a canonical capability from another installed pack."] : []),
    ...(unknownCapability ? ["A refresh cannot introduce an unknown executable capability through declarative metadata."] : []),
    ...(missingCalibration ? ["Every routed capability must remain covered by at least one current router calibration case."] : []),
    ...(policyChanged ? ["A refresh cannot broaden capability-pack authority."] : []),
  ];
  return {
    ...base,
    status: errors.length ? "policy-rejected" : "reviewable-newer-revision",
    admissible: errors.length === 0,
    requiresExplicitInstall: errors.length === 0,
    currentRevision: current.revision,
    currentDigest: current.digest,
    diff,
    errors,
    candidateValidation,
    nextStep: errors.length ? "Repair the candidate and inspect again." : "Review provenance, license evidence, decision changes, and calibrations; this read-only operation never installs the candidate.",
  };
}

export function resealCapabilityPackCandidate(candidateInput) {
  const candidate = clone(candidateInput);
  candidate.contentDigest = canonicalSha256(packSourceProjection(candidate));
  candidate.sources = (candidate.sources ?? []).map((source) => ({
    ...source,
    uri: `looplab://capability-pack-source/${candidate.id}@${candidate.revision}`,
    immutableRef: `looplab-native:${candidate.id}@${candidate.revision}`,
    sha256: candidate.contentDigest.slice("sha256:".length),
  }));
  candidate.provenance = { ...(candidate.provenance ?? {}), sourceDigest: candidate.contentDigest };
  candidate.digest = canonicalSha256(packDigestProjection(candidate));
  return candidate;
}
