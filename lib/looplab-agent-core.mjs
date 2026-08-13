import { analyzeProject, canCollectOfflineVerificationEvidence, doctorSourceDigest, doctorSourceProjection } from "./looplab-doctor.mjs";
import { createRuntimeModel } from "./looplab-runtime-model.mjs";
import { validateVerificationEvidence, verificationCoverageRequirements } from "./looplab-verification.mjs";
import { extractProjectFromHtml, LOOPLAB_PROJECT_SCRIPT_ID, serializeProjectMetadata } from "./looplab-html-project.mjs";
import { assertStandaloneHtml, auditStandaloneHtml } from "./looplab-single-file-audit.mjs";
import { listSupportSurfaces, resolveSupportContact, snapObjectToSupport } from "./looplab-support.mjs";
import { LOOPLAB_GAME_DIRECTOR, LOOPLAB_PROMPT_LENSES, LOOPLAB_PROVIDER_PROMPT_MAX_CHARACTERS, composeDirectedGameBrief, composeProviderGeneratedGameBrief, promptVariantLabel, validateDirectedGameBrief } from "./looplab-game-director.mjs";
import { GAME_STUDIO_CAPABILITIES, LOOPLAB_GAME_STUDIO_PLAN_SCHEMA, LOOPLAB_NARRATIVE_ROUTING_POLICY, LOOPLAB_RUNTIME_KNOWLEDGE, LOOPLAB_RUNTIME_SELECTION_POLICY, LOOPLAB_SPECIALIST_AGENTS } from "./looplab-capability-router.mjs";
import { LOOPLAB_MOVEMENT_TEMPLATES, LOOPLAB_OPTIONAL_EFFECT_PLUGINS, LOOPLAB_PROJECT_SCHEMA_VERSION, LOOPLAB_REUSE_GUIDE_CONTRACT } from "./looplab-reuse-guide.mjs";
import { buildKineticCityScaffold } from "./looplab-directed-scaffold.mjs";
import {
  analyzeNavigationMap,
  authoredRouteDocumentDigest,
  createNavigationModel,
  exportPathEditorNavigation,
  findNavigationPath,
  importPathEditorNavigation,
  markAuthoredRouteDocumentEdited,
  normalizeAuthoredRouteDocument,
  setAuthoredRouteDocument,
  summarizeAuthoredRouteDocument,
  verifyAuthoredRouteDocument,
} from "./looplab-navigation.mjs";
import { DEFAULT_DIMETRIC_PROJECTION, normalizeProjection, worldToScreen } from "./looplab-spatial.mjs";
import { LOOPLAB_MIN_TICK_RATE, LOOPLAB_REPLAY_GAMEPLAY_HASH_VERSION, LOOPLAB_REPLAY_CHOICE_HASH_VERSION, LOOPLAB_REPLAY_COMBAT_HASH_VERSION, LOOPLAB_REPLAY_ACTOR_HASH_VERSION, LOOPLAB_REPLAY_COLLISION_HASH_VERSION, LOOPLAB_REPLAY_MOTION_CARRY_HASH_VERSION, LOOPLAB_REPLAY_ELEVATION_HASH_VERSION, LOOPLAB_REPLAY_WORLD_STREAM_HASH_VERSION, LOOPLAB_REPLAY_HASH_VERSION, LOOPLAB_REPLAY_LEGACY_HASH_VERSION, LOOPLAB_REPLAY_MOTION_HASH_VERSION, LOOPLAB_REPLAY_PREVIOUS_HASH_VERSION, LOOPLAB_REPLAY_SHA256_HASH_VERSION, recordReplayCase, runReplaySuite, validateReplayCase } from "./looplab-replay.mjs";
import { authorizePlaytestReplayPromotion, previewPlaytestReplay } from "./looplab-playtest-replay.mjs";
import { buildRuntimeJoinPlan, createRuntimeJoinContract } from "./looplab-runtime-join.mjs";
import { LOOPLAB_COLOR_ACCESSIBILITY_SCHEMA_VERSION } from "./looplab-color-accessibility.mjs";
import { inspectVerbArchitecture, LOOPLAB_VERB_ARCHITECTURE_POLICY, normalizeVerbArchitecture } from "./looplab-verb-architecture.mjs";
import { inspectGameplayProgram, LOOPLAB_GAMEPLAY_RULE_POLICY, LOOPLAB_RUNTIME_OBJECT_STATE_KEYS, normalizeGameplayProgram } from "./looplab-gameplay-rules.mjs";
import { inspectMotionBodies, LOOPLAB_MOTION_BODY_LIMITS, LOOPLAB_MOTION_BODY_POLICY, LOOPLAB_MOTION_BODY_RUNTIME_STATE_SCHEMA, LOOPLAB_MOTION_BODY_SCHEMA, LOOPLAB_MOTION_BODY_STATE_SCHEMA, normalizeMotionBody, suggestMotionBody } from "./looplab-motion-bodies.mjs";
import { inspectCombatProgram, LOOPLAB_COMBAT_LIMITS, LOOPLAB_COMBAT_POLICY, LOOPLAB_COMBAT_PROGRAM_SCHEMA, LOOPLAB_COMBAT_STATE_SCHEMA, normalizeCombatProgram, suggestCombatProgram } from "./looplab-combat.mjs";
import { inspectActorProgram, LOOPLAB_ACTOR_LIMITS, LOOPLAB_ACTOR_POLICY, LOOPLAB_ACTOR_PROGRAM_SCHEMA, LOOPLAB_ACTOR_STATE_SCHEMA, normalizeActorProgram, suggestActorProgram } from "./looplab-actors.mjs";
import {
  collisionSegmentsForGeometry,
  inspectCollisionGeometry,
  LOOPLAB_COLLISION_GEOMETRY_LIMITS,
  LOOPLAB_COLLISION_GEOMETRY_POLICY,
  LOOPLAB_COLLISION_GEOMETRY_REPORT_SCHEMA,
  LOOPLAB_COLLISION_GEOMETRY_SCHEMA,
  normalizeCollisionGeometry,
  suggestCollisionGeometry,
} from "./looplab-collision-geometry.mjs";
import {
  elevationSegmentsForProgram,
  inspectElevationTransitions,
  LOOPLAB_ELEVATION_TRANSITIONS_LIMITS,
  LOOPLAB_ELEVATION_TRANSITIONS_POLICY,
  LOOPLAB_ELEVATION_TRANSITIONS_REPORT_SCHEMA,
  LOOPLAB_ELEVATION_TRANSITIONS_SCHEMA,
  normalizeElevationTransitions,
  suggestElevationTransitions,
} from "./looplab-elevation-transitions.mjs";
import {
  inspectTileProgram,
  LOOPLAB_TILE_PATCH_PREVIEW_SCHEMA,
  LOOPLAB_TILE_PATCH_SCHEMA,
  LOOPLAB_TILE_PROGRAM_LIMITS,
  LOOPLAB_TILE_PROGRAM_POLICY,
  LOOPLAB_TILE_PROGRAM_REPORT_SCHEMA,
  LOOPLAB_TILE_PROGRAM_SCHEMA,
  LOOPLAB_TILE_REGION_SCHEMA,
  normalizeTileProgram,
  previewTilePatch,
  readTileRegion,
  suggestTileProgram,
  tileProgramDigest,
} from "./looplab-tile-program.mjs";
import {
  exportCommunityExchange,
  inspectCommunityExchanges,
  LOOPLAB_COMMUNITY_EXCHANGE_POLICY,
  LOOPLAB_COMMUNITY_EXCHANGE_REPORT_SCHEMA,
  LOOPLAB_COMMUNITY_EXCHANGE_SCHEMA,
  previewAsepriteImport,
  previewTiledImport,
  upsertCommunityExchange,
} from "./looplab-community-exchange.mjs";
import {
  compileWorldStreamRuntime,
  inspectWorldStream,
  LOOPLAB_WORLD_STREAM_LIMITS,
  LOOPLAB_WORLD_STREAM_PLAN_SCHEMA,
  LOOPLAB_WORLD_STREAM_POLICY,
  LOOPLAB_WORLD_STREAM_REPORT_SCHEMA,
  LOOPLAB_WORLD_STREAM_RUNTIME_SCHEMA,
  LOOPLAB_WORLD_STREAM_SCHEMA,
  LOOPLAB_WORLD_STREAM_SEAM_SCHEMA,
  normalizeWorldStream,
  planWorldStream,
  suggestWorldStream,
  worldStreamDigest,
} from "./looplab-world-stream.mjs";
import { LOOPLAB_OBJECT_UPDATE_POLICY, unsupportedObjectUpdateFields } from "./looplab-object-fields.mjs";
import { inspectNarrativeContract, LOOPLAB_NARRATIVE_CONTRACT_POLICY, LOOPLAB_NARRATIVE_CONTRACT_SCHEMA, LOOPLAB_NARRATIVE_REPORT_SCHEMA, normalizeNarrativeContract } from "./looplab-narrative.mjs";
import {
  createPresentationRuntime,
  inspectPresentationProgram,
  LOOPLAB_PRESENTATION_LIMITS,
  LOOPLAB_PRESENTATION_POLICY,
  LOOPLAB_PRESENTATION_PROGRAM_SCHEMA,
  LOOPLAB_PRESENTATION_REPORT_SCHEMA,
  normalizePresentationProgram,
  suggestPresentationProgram,
} from "./looplab-presentation.mjs";
import { LOOPLAB_AUDIO_RESOURCE_LIMITS, LOOPLAB_AUDIO_RESOURCE_REPORT_SCHEMA } from "./looplab-audio-resources.mjs";
import {
  createGameShellRuntime,
  inspectGameShell,
  LOOPLAB_GAME_SHELL_LIMITS,
  LOOPLAB_GAME_SHELL_POLICY,
  LOOPLAB_GAME_SHELL_REPORT_SCHEMA,
  LOOPLAB_GAME_SHELL_SCHEMA,
  LOOPLAB_GAME_SHELL_STATE_SCHEMA,
  normalizeGameShell,
  suggestGameShell,
} from "./looplab-game-shell.mjs";
import { inspectVisualIdentity, LOOPLAB_VISUAL_IDENTITY_LIMITS, LOOPLAB_VISUAL_IDENTITY_POLICY, LOOPLAB_VISUAL_IDENTITY_REPORT_SCHEMA, LOOPLAB_VISUAL_IDENTITY_SCHEMA, normalizeVisualIdentity } from "./looplab-visual-identity.mjs";
import {
  createSaveCodeRuntime,
  exportProfileId,
  inspectSaveProgram,
  LOOPLAB_EXPORT_PROFILE_SCHEMA,
  LOOPLAB_HOSTED_STORAGE_WRAPPER_SCHEMA,
  LOOPLAB_HOSTED_STORAGE_WRAPPER_SHA256,
  LOOPLAB_HOSTED_STORAGE_WRAPPER_SOURCE,
  LOOPLAB_HOSTED_STORAGE_WRAPPER_VERSION,
  LOOPLAB_PERSISTENCE_POLICY,
  normalizeSaveProgram,
  projectWithExportProfile,
} from "./looplab-save-state.mjs";
import { readGamepadInputCodes } from "./looplab-gamepad.mjs";
import { getAcceptancePlan, LOOPLAB_ACCEPTANCE_RESULT_SCHEMA, LOOPLAB_ACCEPTANCE_RUNNER, LOOPLAB_ACCEPTANCE_RUNNER_VERSION, runAcceptanceSuite, validateExecutableAcceptanceTest } from "./looplab-acceptance.mjs";
import { getProviderParityContract } from "./looplab-provider-parity.mjs";
import { LOOPLAB_PROVIDER_FAILOVER_POLICY } from "./looplab-provider-routing.mjs";
import { LOOPLAB_PROVIDER_MODEL_POLICY } from "./looplab-provider-model-policy.mjs";
import { getClaudeIntegrationManifest } from "./looplab-claude-contract.mjs";
import {
  LOOPLAB_AGENT_COMMANDS,
  LOOPLAB_BROWSER_ONLY_COMMANDS,
  LOOPLAB_BROWSER_SESSION_COMMANDS,
  LOOPLAB_CORE_COMMANDS,
  looplabCommandSurface,
} from "./looplab-command-surfaces.mjs";
import { LOOPLAB_PLATFORM_HARNESS_DEFAULTS, LOOPLAB_PLATFORM_HARNESS_SCHEMA, LOOPLAB_PLATFORM_HARNESS_VERSION } from "./looplab-platform-harness-contract.mjs";
import { analyzeInputActionLiveness, LOOPLAB_INPUT_ACTION_LIVENESS_SCHEMA } from "./looplab-input-liveness.mjs";
import { LOOPLAB_COMPLETION_HARNESS_DEFAULTS, LOOPLAB_COMPLETION_HARNESS_SCHEMA, LOOPLAB_COMPLETION_HARNESS_VERSION } from "./looplab-completion-harness.mjs";
import { LOOPLAB_BOT_COHORT_LIMITS, LOOPLAB_BOT_COHORT_REPORT_SCHEMA, LOOPLAB_BOT_COHORT_RUNNER_VERSION, runBotCohorts } from "./looplab-bot-cohorts.mjs";
import { LOOPLAB_COMMAND_CONTRACT_SCHEMA, LOOPLAB_MCP_SERVER_VERSION, getLooplabCommandContracts, validateLooplabCommandInput } from "./looplab-agent-contracts.mjs";
import { LOOPLAB_LOCAL_COPILOT_ADVICE_SCHEMA, LOOPLAB_LOCAL_COPILOT_LIMITS, LOOPLAB_LOCAL_COPILOT_MODES, LOOPLAB_LOCAL_COPILOT_POLICY, LOOPLAB_LOCAL_COPILOT_STATUS_SCHEMA, LOOPLAB_LOCAL_COPILOT_USAGE_SCHEMA } from "./looplab-local-copilot.mjs";
import { LOOPLAB_VISUAL_CRITIQUE_DIMENSIONS, LOOPLAB_VISUAL_CRITIQUE_LIMITS, LOOPLAB_VISUAL_CRITIQUE_REQUEST_VERSION, LOOPLAB_VISUAL_CRITIQUE_VERSION } from "./looplab-visual-critique.mjs";
import { LOOPLAB_AGENT_FORM_RESPONSE_LIMIT_CHARACTERS, LOOPLAB_BOUNDED_AGENT_RESPONSE_SCHEMA } from "./looplab-bounded-agent-response.mjs";
import { LOOPLAB_COMMAND_MACRO_PLAN_SCHEMA, expandCommandMacro, listCommandMacros } from "./looplab-command-macros.mjs";
import { canonicalJson, canonicalSha256, canonicalizeJson, rotateRight, SHA256_WORDS, sha256Hex } from "./looplab-canonical-digest.mjs";
import { compileTileRuntimeProgram, LOOPLAB_TILE_RUNTIME_SCHEMA } from "./looplab-tile-runtime.mjs";
import { compactProviderProject } from "./looplab-provider-context.mjs";
import { buildProjectJsonPatch, LOOPLAB_PROJECT_READ_SCHEMA, queryProjectDocument } from "./looplab-project-read.mjs";
import { LOOPLAB_SIMULATION_LIMITS, LOOPLAB_SIMULATION_PROBE_SCHEMA, runSimulationProbe } from "./looplab-simulation-probe.mjs";
import { LOOPLAB_AGENT_SESSION_LIMITS, LOOPLAB_AGENT_SESSION_SAVE_POLICIES, LOOPLAB_AGENT_SESSION_SCHEMA } from "./looplab-agent-session.mjs";
import { describeSemanticFrame, LOOPLAB_FRAME_DESCRIPTION_LIMITS, LOOPLAB_FRAME_DESCRIPTION_SCHEMA } from "./looplab-frame-description.mjs";
import {
  LOOPLAB_PHASER_BROWSER_BUNDLE,
  LOOPLAB_PHASER_BROWSER_BYTES,
  LOOPLAB_PHASER_BROWSER_SHA256,
  LOOPLAB_PHASER_BROWSER_VERSION,
} from "./generated/looplab-phaser-browser-bundle.mjs";
import {
  LOOPLAB_PIXI_BROWSER_BUNDLE,
  LOOPLAB_PIXI_BROWSER_BYTES,
  LOOPLAB_PIXI_BROWSER_SHA256,
  LOOPLAB_PIXI_BROWSER_VERSION,
} from "./generated/looplab-pixi-browser-bundle.mjs";
import {
  LOOPLAB_MELON_BROWSER_BUNDLE,
  LOOPLAB_MELON_BROWSER_BYTES,
  LOOPLAB_MELON_BROWSER_SHA256,
  LOOPLAB_MELON_BROWSER_VERSION,
} from "./generated/looplab-melon-browser-bundle.mjs";
import { getAgentRecipe, listAgentRecipes, matchAgentRecipes } from "./looplab-agent-playbook.mjs";
import { buildAgentPlan, LOOPLAB_AGENT_PLAN_SCHEMA } from "./looplab-agent-planner.mjs";
import {
  applyAgentWorkLedgerCommand,
  getAgentWorkLedger,
  LOOPLAB_AGENT_WORK_LEDGER_MUTATIONS,
  LOOPLAB_AGENT_WORK_LEDGER_SCHEMA,
  validateAgentWorkLedger,
} from "./looplab-agent-work-ledger.mjs";
import {
  buildAgentProjectContext,
  LOOPLAB_AGENT_PROJECT_CONTEXT_LIMITS,
  LOOPLAB_AGENT_PROJECT_CONTEXT_SCHEMA,
  mapAgentIndexEntry,
  summarizeAgentCampaign,
} from "./looplab-agent-context.mjs";
import { buildAgentReadiness, LOOPLAB_AGENT_READINESS_SCHEMA } from "./looplab-agent-readiness.mjs";
import {
  getAgentChanges,
  LOOPLAB_AGENT_CHANGE_FEED_LIMITS,
  LOOPLAB_AGENT_CHANGE_FEED_SCHEMA,
  recordAgentProjectChange,
  validateAgentChangeFeed,
} from "./looplab-agent-change-feed.mjs";
import { LOOPLAB_AGENT_PRESENCE_POLICY, LOOPLAB_AGENT_PRESENCE_SCHEMA } from "./looplab-agent-presence.mjs";
import { LOOPLAB_SHARED_PROJECT_STORE_POLICY, LOOPLAB_SHARED_PROJECT_STORE_SCHEMA } from "./looplab-shared-project-contract.mjs";
import {
  buildMechanicalRepairPlan,
  LOOPLAB_AUTO_REPAIR_LIMITS,
  LOOPLAB_AUTO_REPAIR_SCHEMA,
  LOOPLAB_CONVERGENCE_SCHEMA,
} from "./looplab-auto-repair.mjs";
import { LOOPLAB_COMPANION_VERSION, LOOPLAB_EXPORTED_RUNTIME_VERSION, LOOPLAB_PROTOCOL_VERSION } from "./looplab-versions.mjs";
import { LOOPLAB_APPLIED_PREFERENCE_CONTEXT_SCHEMA, LOOPLAB_PREFERENCE_DIMENSIONS, LOOPLAB_PREFERENCE_MEMORY_POLICY, LOOPLAB_PREFERENCE_MEMORY_SCHEMA } from "./looplab-preference-memory.mjs";
import { LOOPLAB_PLAYTEST_LEDGER_SCHEMA, LOOPLAB_PLAYTEST_LIMITS, LOOPLAB_PLAYTEST_OBSERVATION_POLICY, LOOPLAB_PLAYTEST_SESSION_SCHEMA } from "./looplab-playtest-observation.mjs";
import { buildCandidateDecisionPacket, LOOPLAB_CANDIDATE_DECISION_SCHEMA } from "./looplab-candidate-decision.mjs";
import { buildStructuralIterationDiff, LOOPLAB_STRUCTURAL_ITERATION_DIFF_SCHEMA } from "./looplab-structural-iteration-diff.mjs";
import {
  inspectTuningContract,
  LOOPLAB_FEEL_REPORT_SCHEMA,
  LOOPLAB_TUNING_CONTRACT_SCHEMA,
  LOOPLAB_TUNING_LIMITS,
  LOOPLAB_TUNING_REPORT_SCHEMA,
  LOOPLAB_TUNING_SEARCH_SCHEMA,
  measureGameFeel,
  normalizeTuningContract,
  runTuningSearch,
  suggestTuningContract,
} from "./looplab-tuning-search.mjs";
import {
  inspectStructuralScaffoldContract,
  LOOPLAB_STRUCTURAL_SCAFFOLD_CONTRACT_SCHEMA,
  LOOPLAB_STRUCTURAL_SCAFFOLD_FAMILIES,
  LOOPLAB_STRUCTURAL_SCAFFOLD_LIMITS,
  LOOPLAB_STRUCTURAL_SCAFFOLD_MATERIALIZATION_SCHEMA,
  LOOPLAB_STRUCTURAL_SCAFFOLD_REPORT_SCHEMA,
  LOOPLAB_STRUCTURAL_SCAFFOLD_SEARCH_SCHEMA,
  materializeStructuralScaffold,
  normalizeStructuralScaffoldContract,
  runStructuralScaffoldSearch,
  suggestStructuralScaffoldContract,
} from "./looplab-structural-scaffolds.mjs";
import {
  inspectSpatialLayoutContract,
  LOOPLAB_SPATIAL_LAYOUT_CONTRACT_SCHEMA,
  LOOPLAB_SPATIAL_LAYOUT_DESCRIPTOR_AXES,
  LOOPLAB_SPATIAL_LAYOUT_FAMILIES,
  LOOPLAB_SPATIAL_LAYOUT_LIMITS,
  LOOPLAB_SPATIAL_LAYOUT_MATERIALIZATION_SCHEMA,
  LOOPLAB_SPATIAL_LAYOUT_REPORT_SCHEMA,
  LOOPLAB_SPATIAL_LAYOUT_SEARCH_SCHEMA,
  materializeSpatialLayout,
  normalizeSpatialLayoutContract,
  runSpatialLayoutSearch,
  suggestSpatialLayoutContract,
} from "./looplab-spatial-layouts.mjs";
import {
  listGameFoundations,
  LOOPLAB_GAME_FOUNDATION_IDS,
  LOOPLAB_GAME_FOUNDATION_LIMITS,
  LOOPLAB_GAME_FOUNDATION_MATERIALIZATION_SCHEMA,
  LOOPLAB_GAME_FOUNDATION_REGISTRY_SCHEMA,
  LOOPLAB_GAME_FOUNDATION_SEARCH_SCHEMA,
  materializeGameFoundation,
  suggestGameFoundations,
} from "./looplab-game-foundations.mjs";
import {
  getReleaseVerificationPolicy,
  LOOPLAB_RELEASE_VERIFICATION_SCHEMA,
  releaseVerificationMatchesHtml,
  validateReleaseVerification,
} from "./looplab-release-verification.mjs";
import {
  compareBuilderBenchmarkRuns,
  evaluateBuilderBenchmark,
  getBuilderBenchmarkSuite,
  listBuilderBenchmarks,
  LOOPLAB_BUILDER_BENCHMARK_COMPARISON_SCHEMA,
  LOOPLAB_BUILDER_BENCHMARK_LIMITS,
  LOOPLAB_BUILDER_BENCHMARK_RUN_SCHEMA,
} from "./looplab-builder-benchmark.mjs";

export { LOOPLAB_COMPANION_VERSION, LOOPLAB_EXPORTED_RUNTIME_VERSION, LOOPLAB_PROTOCOL_VERSION } from "./looplab-versions.mjs";
export { getAgentChanges, recordAgentProjectChange } from "./looplab-agent-change-feed.mjs";

const ITERATION_HISTORY_LIMIT = 50;
const ITERATION_SNAPSHOT_LIMIT = 12;
const LOOPLAB_2D_FRAMEWORKS = new Set(["standalone", "canvas", "phaser", "pixi", "melon"]);
const LOOPLAB_RELEASE_READY_RUNTIME_ADAPTERS = Object.freeze({
  canvas: Object.freeze({
    framework: "canvas",
    engineDelivery: "built-in-inline",
    primaryFrameOwner: "looplab-canvas",
    renderAdapter: "looplab-canvas-2d",
    integration: "canonical-canvas",
    vendor: null,
  }),
  phaser: Object.freeze({
    framework: "phaser",
    engineDelivery: "inline-script-tag",
    primaryFrameOwner: "phaser",
    renderAdapter: "phaser-canvas-with-looplab-draw-hook",
    integration: "canonical-canvas-post-render",
    vendor: Object.freeze({ id: "phaser", version: LOOPLAB_PHASER_BROWSER_VERSION, browserBundleBytes: LOOPLAB_PHASER_BROWSER_BYTES, browserBundleSha256: LOOPLAB_PHASER_BROWSER_SHA256 }),
  }),
  pixi: Object.freeze({
    framework: "pixi",
    engineDelivery: "inline-umd-with-official-csp-polyfill",
    primaryFrameOwner: "pixi",
    renderAdapter: "pixi-canvas-texture-with-looplab-draw-hook",
    strictCsp: true,
    cspAdapter: "pixi-static-sync-polyfills",
    integration: "canonical-canvas-texture",
    vendor: Object.freeze({ id: "pixi", version: LOOPLAB_PIXI_BROWSER_VERSION, browserBundleBytes: LOOPLAB_PIXI_BROWSER_BYTES, browserBundleSha256: LOOPLAB_PIXI_BROWSER_SHA256 }),
  }),
  melon: Object.freeze({
    framework: "melon",
    engineDelivery: "tree-shaken-inline-iife",
    primaryFrameOwner: "melon",
    renderAdapter: "melon-canvas-renderable-with-looplab-draw-hook",
    integration: "standalone-application-explicit-camera",
    vendor: Object.freeze({ id: "melon", version: LOOPLAB_MELON_BROWSER_VERSION, browserBundleBytes: LOOPLAB_MELON_BROWSER_BYTES, browserBundleSha256: LOOPLAB_MELON_BROWSER_SHA256 }),
  }),
});
export const LOOPLAB_AGENT_BATCH_PREVIEW_SCHEMA = "looplab-agent-batch-preview/v1";

export function buildStandaloneRuntimePrelude() {
  return [
    `const DEFAULT_DIMETRIC_PROJECTION=${serializeProjectMetadata(DEFAULT_DIMETRIC_PROJECTION)};`,
    `const normalizeProjection=${normalizeProjection.toString()};`,
    `const worldToScreen=${worldToScreen.toString()};`,
    `const SHA256_WORDS=new Uint32Array(${JSON.stringify(Array.from(SHA256_WORDS))});`,
    `const rotateRight=${rotateRight.toString()};`,
    `const sha256Hex=${sha256Hex.toString()};`,
    `const canonicalizeJson=${canonicalizeJson.toString()};`,
    `const canonicalJson=${canonicalJson.toString()};`,
    `const canonicalSha256=${canonicalSha256.toString()};`,
    `const compileTileRuntimeProgram=${compileTileRuntimeProgram.toString()};`,
    `const compileWorldStreamRuntime=${compileWorldStreamRuntime.toString()};`,
    `const createRuntimeModelFactory=${createRuntimeModel.toString()};`,
    "const createRuntimeModel=(project)=>createRuntimeModelFactory(project,{compileTileRuntimeProgram,compileWorldStreamRuntime});",
    `const createPresentationRuntime=${createPresentationRuntime.toString()};`,
    `const createGameShellRuntime=${createGameShellRuntime.toString()};`,
    `const createSaveCodeRuntime=${createSaveCodeRuntime.toString()};`,
    `const readGamepadInputCodes=${readGamepadInputCodes.toString()};`,
  ].join("\n    ");
}

function normalize2dRuntimeProfile(profile = {}) {
  return {
    dimension: "2d",
    framework: LOOPLAB_2D_FRAMEWORKS.has(profile?.framework) ? profile.framework : "canvas",
  };
}

export const LOOPLAB_OBJECT_KINDS = [
  "player",
  "platform",
  "coin",
  "hazard",
  "decor",
  "spawn",
  "portal",
  "goal",
];

const PROJECT_FIELDS = new Set([
  "schemaVersion",
  "name",
  "width",
  "height",
  "background",
  "gravity",
  "grid",
  "controlMode",
  "inputActions",
  "projection",
  "packageBudgetBytes",
  "pathJoinTolerance",
  "maxInteractionGap",
  "startMapId",
  "designBrief",
  "verbArchitecture",
  "gameplayProgram",
  "combatProgram",
  "actorProgram",
  "collisionGeometry",
  "elevationTransitions",
  "tileProgram",
  "worldStream",
  "narrativeContract",
  "presentationProgram",
  "gameShell",
  "saveProgram",
  "tuningContract",
  "structuralScaffoldContract",
  "spatialLayoutContract",
  "templateProvenance",
  "doctorProfile",
  "runtimeProfile",
  "movementTuning",
  "scaffold",
  "traversalPaths",
  "navigation",
]);

const LOOPLAB_EVIDENCE_AUTHORITY = Symbol("looplab-evidence-authority");
const LOOPLAB_EVIDENCE_AUTHORITY_OPS = new Set(["verify_iteration", "promote_iteration"]);

const OBJECT_PRESETS = {
  player: { name: "Player", width: 44, height: 58, color: "#5b5cf0", solid: false, anchorMode: "ground", collisionOwner: "authored-map", collider: { enabled: true, offsetX: 6, offsetY: 4, width: 32, height: 54, trigger: false, oneWay: false, zMin: 0, zMax: 1 } },
  platform: { name: "Platform", width: 180, height: 28, color: "#202018", solid: true, anchorMode: "ground", collisionOwner: "authored-map", collider: { enabled: true, offsetX: 0, offsetY: 0, width: 180, height: 28, trigger: false, oneWay: true, zMin: 0, zMax: 1 } },
  coin: { name: "Coin", width: 30, height: 30, color: "#ffc928", solid: false, anchorMode: "ground", collisionOwner: "authored-map", collider: { enabled: true, offsetX: 2, offsetY: 2, width: 26, height: 26, trigger: true, oneWay: false, zMin: 0, zMax: 1 } },
  hazard: { name: "Spikes", width: 84, height: 28, color: "#ff5c3b", solid: false, anchorMode: "ground", collisionOwner: "authored-map", collider: { enabled: true, offsetX: 0, offsetY: 0, width: 84, height: 28, trigger: true, oneWay: false, zMin: 0, zMax: 1 } },
  decor: { name: "Decoration", width: 72, height: 72, color: "#96e6d2", solid: false, anchorMode: "ground", collisionOwner: "authored-map", collider: { enabled: false, offsetX: 0, offsetY: 0, width: 72, height: 72, trigger: false, oneWay: false, zMin: 0, zMax: 1 } },
  spawn: { name: "Spawn point", width: 42, height: 64, color: "#c8ff4d", solid: false, anchorMode: "ground", collisionOwner: "authored-map", collider: { enabled: false, offsetX: 0, offsetY: 0, width: 42, height: 64, trigger: false, oneWay: false, zMin: 0, zMax: 1 } },
  portal: { name: "Map portal", width: 52, height: 76, color: "#42cde3", solid: false, anchorMode: "ground", collisionOwner: "authored-map", transition: "fade", collider: { enabled: true, offsetX: 4, offsetY: 4, width: 44, height: 72, trigger: true, oneWay: false, zMin: 0, zMax: 1 } },
  goal: { name: "Goal", width: 48, height: 72, color: "#c8ff4d", solid: false, anchorMode: "ground", collisionOwner: "authored-map", collider: { enabled: true, offsetX: 4, offsetY: 4, width: 40, height: 68, trigger: true, oneWay: false, zMin: 0, zMax: 1 } },
};

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

const STABLE_AUTHORED_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const FEATURE_CONTRACT_LINKS = [
  "visual",
  "collision",
  "inputAction",
  "animationState",
  "feedbackEvent",
  "placementRules",
  "responsiveRules",
  "acceptanceTests",
];

function normalizeStableAuthoredId(value, label) {
  const id = String(value ?? "").trim();
  if (!id || !STABLE_AUTHORED_ID_PATTERN.test(id)) throw new Error(`${label} requires a stable id using letters, numbers, dots, underscores, colons, or hyphens.`);
  return id;
}

function normalizeStringIdList(value, label, { required = false } = {}) {
  if (value === undefined && !required) return undefined;
  if (!Array.isArray(value) || (required && value.length === 0)) throw new Error(`${label} must be ${required ? "a non-empty " : "an "}array of stable IDs.`);
  const ids = value.map((id, index) => normalizeStableAuthoredId(id, `${label}[${index}]`));
  if (new Set(ids).size !== ids.length) throw new Error(`${label} must not contain duplicate IDs.`);
  return ids;
}

function normalizeFeatureContract(value, label = "feature contract") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const contract = clone(value);
  contract.id = normalizeStableAuthoredId(contract.id, label);
  contract.name = String(contract.name ?? contract.id).trim();
  if (!contract.name) throw new Error(`${label}.name must be a non-empty string.`);
  for (const field of FEATURE_CONTRACT_LINKS) if (contract[field] == null) throw new Error(`${label}.${field} is required.`);
  contract.acceptanceTests = normalizeStringIdList(contract.acceptanceTests, `${label}.acceptanceTests`, { required: true });
  if (contract.dirtyDependencies !== undefined) contract.dirtyDependencies = normalizeStringIdList(contract.dirtyDependencies, `${label}.dirtyDependencies`);
  return contract;
}

function normalizeAcceptanceTest(value, label = "acceptance test") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const acceptanceTest = clone(value);
  acceptanceTest.id = normalizeStableAuthoredId(acceptanceTest.id, label);
  acceptanceTest.name = String(acceptanceTest.name ?? acceptanceTest.id).trim();
  if (!acceptanceTest.name) throw new Error(`${label}.name must be a non-empty string.`);
  if (typeof acceptanceTest.assertion !== "string" || !acceptanceTest.assertion.trim()) throw new Error(`${label}.assertion must be a non-empty string.`);
  acceptanceTest.assertion = acceptanceTest.assertion.trim();
  const ownerField = typeof acceptanceTest.featureId === "string" && acceptanceTest.featureId.trim() ? "featureId" : "ownerId";
  if (acceptanceTest[ownerField] == null) throw new Error(`${label} requires featureId or ownerId.`);
  acceptanceTest[ownerField] = normalizeStableAuthoredId(acceptanceTest[ownerField], `${label}.${ownerField}`);
  if (acceptanceTest.featureId !== undefined) acceptanceTest.featureId = normalizeStableAuthoredId(acceptanceTest.featureId, `${label}.featureId`);
  if (acceptanceTest.ownerId !== undefined) acceptanceTest.ownerId = normalizeStableAuthoredId(acceptanceTest.ownerId, `${label}.ownerId`);
  const executable = validateExecutableAcceptanceTest(acceptanceTest, { prefix: label });
  if (executable.errors.length) throw new Error(executable.errors.join(" "));
  return acceptanceTest;
}

function normalizeUniqueAuthoredRecords(value, label, normalizer, maximum) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (value.length > maximum) throw new Error(`${label} must contain at most ${maximum} records.`);
  const records = value.map((record, index) => normalizer(record, `${label}[${index}]`));
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.id)) throw new Error(`${label} duplicates ${record.id}.`);
    ids.add(record.id);
  }
  return records;
}

function upsertAuthoredRecord(records, record) {
  const next = [...(records ?? [])];
  const index = next.findIndex((candidate) => candidate.id === record.id);
  if (index >= 0) next[index] = record;
  else next.push(record);
  return next;
}

function compactTextDigest(prefix, value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, "0")}-${value.length}`;
}

function registerIterationBlob(blobs, value) {
  const base = compactTextDigest("data", value);
  let key = base;
  let collision = 1;
  while (typeof blobs[key] === "string" && blobs[key] !== value) {
    key = `${base}-${collision}`;
    collision += 1;
  }
  blobs[key] = value;
  return key;
}

function externalizeIterationSnapshot(inputProject, blobs) {
  const snapshot = syncActiveMap(clone(inputProject));
  delete snapshot.iterationHistory;
  delete snapshot.iterationArchive;
  for (const field of ["assets", "resources"]) {
    if (!Array.isArray(snapshot[field])) continue;
    snapshot[field] = snapshot[field].map((record) => {
      if (!record || typeof record !== "object" || typeof record.dataUrl !== "string") return record;
      const dataRef = registerIterationBlob(blobs, record.dataUrl);
      const next = { ...record, __looplabDataRef: dataRef };
      delete next.dataUrl;
      return next;
    });
  }
  return snapshot;
}

function hydrateIterationSnapshot(snapshot, blobs) {
  const project = clone(snapshot);
  for (const field of ["assets", "resources"]) {
    if (!Array.isArray(project[field])) continue;
    project[field] = project[field].map((record) => {
      if (!record || typeof record !== "object" || typeof record.__looplabDataRef !== "string") return record;
      const dataUrl = blobs[record.__looplabDataRef];
      if (typeof dataUrl !== "string") throw new Error(`Iteration snapshot is missing embedded data ${record.__looplabDataRef}.`);
      const next = { ...record, dataUrl };
      delete next.__looplabDataRef;
      return next;
    });
  }
  return syncActiveMap(project);
}

function pruneIterationBlobs(archive) {
  const used = new Set();
  for (const snapshot of archive.snapshots ?? []) {
    for (const field of ["assets", "resources"]) {
      for (const record of snapshot?.project?.[field] ?? []) {
        if (typeof record?.__looplabDataRef === "string") used.add(record.__looplabDataRef);
      }
    }
  }
  archive.assetBlobs = Object.fromEntries(Object.entries(archive.assetBlobs ?? {}).filter(([key]) => used.has(key)));
  return archive;
}

function normalizedIterationArchive(project) {
  const existing = project.iterationArchive && typeof project.iterationArchive === "object" && !Array.isArray(project.iterationArchive)
    ? clone(project.iterationArchive)
    : {};
  const firstHistoryId = Array.isArray(project.iterationHistory) ? project.iterationHistory.find((entry) => typeof entry?.id === "string")?.id : null;
  return {
    version: 1,
    lineageId: typeof existing.lineageId === "string" && existing.lineageId ? existing.lineageId : firstHistoryId ?? project.iteration?.parentId ?? project.iteration?.id ?? `lineage-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    snapshots: Array.isArray(existing.snapshots) ? existing.snapshots.slice(-ITERATION_SNAPSHOT_LIMIT) : [],
    assetBlobs: existing.assetBlobs && typeof existing.assetBlobs === "object" && !Array.isArray(existing.assetBlobs) ? existing.assetBlobs : {},
  };
}

function iterationReceipt(project, metadata = {}, snapshotId = null) {
  const doctor = analyzeProject(project);
  const iteration = project.iteration ?? {};
  const id = String(metadata.id ?? iteration.id ?? "").trim();
  if (!id) throw new Error("An iteration checkpoint requires an iteration id.");
  const explicitScore = Number(metadata.score);
  return {
    id,
    parentId: metadata.parentId !== undefined ? metadata.parentId : iteration.parentId ?? null,
    status: String(metadata.status ?? iteration.status ?? "candidate"),
    accepted: metadata.accepted !== undefined ? metadata.accepted === true : String(metadata.status ?? iteration.status ?? "candidate") !== "rejected",
    restorable: Boolean(snapshotId),
    snapshotId,
    restoredFrom: typeof metadata.restoredFrom === "string" ? metadata.restoredFrom : undefined,
    objective: String(metadata.objective ?? iteration.objective ?? "Improve the game"),
    summary: typeof metadata.summary === "string" ? metadata.summary : undefined,
    reason: typeof metadata.reason === "string" ? metadata.reason : undefined,
    condition: typeof metadata.condition === "string" ? metadata.condition : undefined,
    provider: typeof metadata.provider === "string" ? metadata.provider : undefined,
    track: String(metadata.track ?? iteration.track ?? "gameplay"),
    score: Number.isFinite(explicitScore) ? explicitScore : doctor.score,
    scoreKind: Number.isFinite(explicitScore) ? String(metadata.scoreKind ?? "quality") : "doctor",
    qualityDelta: Number.isFinite(Number(metadata.qualityDelta)) ? Number(metadata.qualityDelta) : undefined,
    evaluation: metadata.evaluation && typeof metadata.evaluation === "object" && !Array.isArray(metadata.evaluation) ? clone(metadata.evaluation) : undefined,
    comparison: metadata.comparison && typeof metadata.comparison === "object" && !Array.isArray(metadata.comparison) ? clone(metadata.comparison) : undefined,
    providerParity: metadata.providerParity && typeof metadata.providerParity === "object" && !Array.isArray(metadata.providerParity) ? clone(metadata.providerParity) : undefined,
    doctorScore: Number.isFinite(Number(metadata.doctorScore)) ? Number(metadata.doctorScore) : doctor.score,
    errorCount: Number.isFinite(Number(metadata.errorCount)) ? Number(metadata.errorCount) : doctor.errorCount,
    warningCount: Number.isFinite(Number(metadata.warningCount)) ? Number(metadata.warningCount) : doctor.warningCount,
    doctorDigest: typeof metadata.doctorDigest === "string" ? metadata.doctorDigest : doctor.digest,
    sourceDigest: typeof metadata.sourceDigest === "string" ? metadata.sourceDigest : doctor.sourceDigest,
    doctorProfile: typeof metadata.doctorProfile === "string" ? metadata.doctorProfile : doctor.profile,
    buildId: project.build?.id ?? null,
    mapCount: project.maps?.length ?? 1,
    objectCount: project.objects?.length ?? 0,
    assetCount: project.assets?.length ?? 0,
    gameplayVariableCount: project.gameplayProgram?.variables?.length ?? 0,
    gameplayRuleCount: project.gameplayProgram?.rules?.length ?? 0,
    gameplayChoicePageCount: project.gameplayProgram?.choicePages?.length ?? 0,
    gameplayClockCount: project.gameplayProgram?.clocks?.length ?? 0,
    gameplayHudBindingCount: project.gameplayProgram?.hudBindings?.length ?? 0,
    createdAt: String(metadata.createdAt ?? iteration.createdAt ?? new Date().toISOString()),
  };
}

export function checkpointIteration(inputProject, metadata = {}) {
  const project = syncActiveMap(clone(inputProject));
  const archive = normalizedIterationArchive(project);
  const id = String(metadata.id ?? project.iteration?.id ?? "").trim();
  if (!id) throw new Error("An iteration checkpoint requires an iteration id.");
  const includeSnapshot = metadata.snapshot !== false;
  let snapshotId = null;
  if (includeSnapshot) {
    snapshotId = id;
    const sourceDigest = doctorSourceDigest(project);
    const snapshot = {
      id,
      sourceDigest,
      createdAt: String(metadata.createdAt ?? new Date().toISOString()),
      project: externalizeIterationSnapshot(project, archive.assetBlobs),
    };
    archive.snapshots = [...archive.snapshots.filter((entry) => entry?.id !== id), snapshot].slice(-ITERATION_SNAPSHOT_LIMIT);
  }
  pruneIterationBlobs(archive);
  const history = Array.isArray(project.iterationHistory) ? project.iterationHistory : [];
  const previousEntry = history.find((candidate) => candidate?.id === id) ?? null;
  const entry = iterationReceipt(project, metadata, snapshotId);
  if (previousEntry?.sourceDigest === entry.sourceDigest) {
    for (const field of ["objective", "summary", "reason", "condition", "provider", "score", "scoreKind", "qualityDelta", "evaluation", "comparison", "providerParity"]) {
      if (metadata[field] === undefined && previousEntry[field] !== undefined) entry[field] = previousEntry[field];
    }
  }
  const iterationHistory = [...history.filter((candidate) => candidate?.id !== entry.id), entry].slice(-ITERATION_HISTORY_LIMIT);
  return { project: { ...project, iterationHistory, iterationArchive: archive }, entry: clone(entry) };
}

export function listIterationHistory(inputProject) {
  const project = syncActiveMap(clone(inputProject));
  const archive = normalizedIterationArchive(project);
  const snapshots = new Map(archive.snapshots.map((entry) => [entry.id, entry]));
  const entries = (Array.isArray(project.iterationHistory) ? clone(project.iterationHistory) : []).map((entry) => ({
    ...entry,
    restorable: snapshots.has(entry.snapshotId ?? entry.id),
    current: entry.id === project.iteration?.id,
  }));
  if (project.iteration?.id) {
    const doctor = analyzeProject(project);
    const currentIndex = entries.findIndex((entry) => entry.id === project.iteration.id);
    const stored = currentIndex >= 0 ? entries[currentIndex] : null;
    if (!stored || stored.sourceDigest !== doctor.sourceDigest || stored.status !== project.iteration.status) {
      const live = {
        ...iterationReceipt(project, { id: project.iteration.id, status: project.iteration.status, createdAt: project.iteration.createdAt }, stored?.snapshotId ?? null),
        restorable: Boolean(stored?.snapshotId && snapshots.has(stored.snapshotId)),
        current: true,
        live: true,
      };
      if (currentIndex >= 0) entries[currentIndex] = live;
      else entries.push(live);
    }
  }
  return {
    schemaVersion: "looplab-iteration-ledger/v1",
    lineageId: archive.lineageId,
    currentId: project.iteration?.id ?? null,
    entryCount: entries.length,
    snapshotCount: archive.snapshots.length,
    snapshotLimit: ITERATION_SNAPSHOT_LIMIT,
    entries,
  };
}

function projectForIteration(project, id) {
  if (id === project.iteration?.id) return syncActiveMap(clone(project));
  const archive = normalizedIterationArchive(project);
  const snapshot = archive.snapshots.find((entry) => entry?.id === id);
  if (!snapshot) throw new Error(`Iteration ${id} does not have a restorable snapshot.`);
  return hydrateIterationSnapshot(snapshot.project, archive.assetBlobs);
}

function projectForSourceDigest(inputProject, sourceDigest) {
  const requested = String(sourceDigest ?? "").trim();
  if (!/^source-[0-9a-f]{64}$/.test(requested)) throw new Error("sinceDigest must be a Project Doctor source digest.");
  const current = syncActiveMap(clone(inputProject));
  if (doctorSourceDigest(current) === requested) return current;
  const archive = normalizedIterationArchive(current);
  const snapshot = archive.snapshots.find((entry) => entry?.sourceDigest === requested);
  if (!snapshot) {
    const available = archive.snapshots.map((entry) => entry?.sourceDigest).filter(Boolean).slice(-12);
    throw new Error(`[source-digest-not-found] No archived project snapshot matches ${requested}. Available baselines: ${available.join(", ") || "none"}.`);
  }
  const baseline = syncActiveMap(hydrateIterationSnapshot(snapshot.project, archive.assetBlobs));
  if (doctorSourceDigest(baseline) !== requested) throw new Error(`[source-digest-mismatch] Archived project snapshot no longer matches ${requested}. Refresh the full project.`);
  return baseline;
}

export function compareIterationHistory(inputProject, firstId, secondId, options = {}) {
  const project = syncActiveMap(clone(inputProject));
  const ledger = listIterationHistory(project);
  const first = ledger.entries.find((entry) => entry.id === firstId);
  const second = ledger.entries.find((entry) => entry.id === secondId);
  if (!first || !second) throw new Error("compare_iterations requires two iteration ids that exist in the ledger.");
  const firstProject = projectForIteration(project, first.id);
  const secondProject = projectForIteration(project, second.id);
  const firstDoctor = analyzeProject(firstProject);
  const secondDoctor = analyzeProject(secondProject);
  const counts = (candidate) => ({ maps: candidate.maps?.length ?? 1, objects: candidate.objects?.length ?? 0, assets: candidate.assets?.length ?? 0 });
  const firstCounts = counts(firstProject);
  const secondCounts = counts(secondProject);
  const structuralDiff = buildStructuralIterationDiff({
    firstProject,
    secondProject,
    first: { iterationId: first.id, sourceDigest: firstDoctor.sourceDigest },
    second: { iterationId: second.id, sourceDigest: secondDoctor.sourceDigest },
    maximumDetailChanges: options.maximumStructuralChanges,
  });
  return buildCandidateDecisionPacket({
    first,
    second,
    changed: firstDoctor.sourceDigest !== secondDoctor.sourceDigest,
    delta: {
      doctorScore: secondDoctor.score - firstDoctor.score,
      errors: secondDoctor.errorCount - firstDoctor.errorCount,
      warnings: secondDoctor.warningCount - firstDoctor.warningCount,
      maps: secondCounts.maps - firstCounts.maps,
      objects: secondCounts.objects - firstCounts.objects,
      assets: secondCounts.assets - firstCounts.assets,
    },
    doctor: {
      first: { score: firstDoctor.score, errorCount: firstDoctor.errorCount, warningCount: firstDoctor.warningCount, digest: firstDoctor.digest, sourceDigest: firstDoctor.sourceDigest, profile: firstDoctor.profile },
      second: { score: secondDoctor.score, errorCount: secondDoctor.errorCount, warningCount: secondDoctor.warningCount, digest: secondDoctor.digest, sourceDigest: secondDoctor.sourceDigest, profile: secondDoctor.profile },
    },
    counts: { first: firstCounts, second: secondCounts },
    structuralDiff,
  });
}

export function restoreIteration(inputProject, id, options = {}) {
  const currentCheckpoint = checkpointIteration(inputProject, {
    id: inputProject.iteration?.id,
    status: inputProject.iteration?.status ?? "candidate",
    summary: "Checkpoint captured automatically before restoring another iteration",
  }).project;
  const archive = normalizedIterationArchive(currentCheckpoint);
  const snapshot = archive.snapshots.find((entry) => entry?.id === id);
  if (!snapshot) throw new Error(`Iteration ${id} does not have a restorable snapshot.`);
  const targetEntry = (currentCheckpoint.iterationHistory ?? []).find((entry) => entry?.id === id) ?? null;
  const restoredSource = hydrateIterationSnapshot(snapshot.project, archive.assetBlobs);
  const now = options.now ?? new Date().toISOString();
  const nextId = options.id ?? `restore-${String(id).replace(/[^a-zA-Z0-9_-]+/g, "-")}-${now.replace(/[:.]/g, "-")}`;
  const restored = syncActiveMap({
    ...restoredSource,
    iterationHistory: currentCheckpoint.iterationHistory,
    iterationArchive: archive,
    iteration: {
      id: nextId,
      parentId: id,
      status: "candidate",
      track: options.track ?? targetEntry?.track ?? "gameplay",
      objective: options.objective ?? `Restore ${id} as a new editable candidate`,
      createdAt: now,
      readOnly: false,
    },
    build: {
      ...(restoredSource.build ?? {}),
      id: options.buildId ?? nextId,
      sourceRevision: nextId,
      generatedFromRevision: nextId,
      sourceTimestamp: now,
    },
    authoring: {
      ...(restoredSource.authoring ?? {}),
      dirty: true,
      changedAt: now,
      restoredFromIteration: id,
    },
  });
  delete restored.build.outputTimestamp;
  delete restored.build.servedBuildId;
  const checkpoint = checkpointIteration(restored, {
    id: nextId,
    parentId: id,
    status: "candidate",
    accepted: true,
    restoredFrom: id,
    summary: `Restored ${id} as an editable child; the original snapshot remains unchanged`,
    createdAt: now,
  });
  return { ...checkpoint, restoredFrom: clone(targetEntry), sourceDigest: snapshot.sourceDigest };
}

function normalizeAuthoredProjection(projection, viewport = {}) {
  return projection === undefined ? undefined : normalizeProjection(projection, viewport);
}

let generatedIdCounter = 0;
const secureUniqueId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const values = globalThis.crypto.getRandomValues(new Uint32Array(4));
    return [...values].map((value) => value.toString(16).padStart(8, "0")).join("");
  }
  generatedIdCounter += 1;
  return `${Date.now().toString(36)}-${generatedIdCounter.toString(36)}`;
};
const makeId = () => `object-${secureUniqueId()}`;

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const escapeHtml = (value) =>
  String(value).replace(/[&<>'"]/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });

function createObject(kind, properties = {}) {
  if (!LOOPLAB_OBJECT_KINDS.includes(kind)) {
    throw new Error(`Unknown object kind: ${String(kind)}`);
  }

  const object = {
    id: properties.id ?? makeId(),
    x: properties.x ?? 100,
    y: properties.y ?? 100,
    z: properties.z ?? 0,
    supportZ: properties.supportZ ?? properties.z ?? 0,
    ...OBJECT_PRESETS[kind],
    ...properties,
    kind,
  };
  if (!properties.collider && object.collider) {
    const preset = OBJECT_PRESETS[kind];
    const scaleX = object.width / preset.width;
    const scaleY = object.height / preset.height;
    object.collider = {
      ...object.collider,
      offsetX: Math.round(object.collider.offsetX * scaleX),
      offsetY: Math.round(object.collider.offsetY * scaleY),
      width: Math.max(1, Math.round(object.collider.width * scaleX)),
      height: Math.max(1, Math.round(object.collider.height * scaleY)),
      zMin: object.z,
      zMax: object.z + 1,
    };
  }
  return object;
}

function createProjectFoundation(base, slug) {
  const iterationId = `${slug}-v001`;
  const createdAt = new Date().toISOString();
  const presentationProgram = base.presentationProgram ?? suggestPresentationProgram(base).program;
  const gameShell = base.gameShell ?? suggestGameShell({ ...base, presentationProgram }, { status: "approved" }).shell;
  return ensureMaps({
    ...base,
    schemaVersion: base.schemaVersion ?? LOOPLAB_PROJECT_SCHEMA_VERSION,
    projection: base.projection ?? { type: "orthographic", tileWidth: 20, tileHeight: 20 },
    packageBudgetBytes: base.packageBudgetBytes ?? 2_000_000,
    doctorProfile: base.doctorProfile ?? "prototype",
    iteration: base.iteration ?? { id: iterationId, parentId: null, status: "candidate", track: "creation", objective: "Build a clear, playable first version", createdAt, readOnly: false },
    build: base.build ?? { id: iterationId, sourceRevision: iterationId, generatedFromRevision: iterationId, sourceTimestamp: createdAt, servedBuildId: iterationId },
    workstreams: base.workstreams ?? [
      { id: "creation", name: "Full game creation", status: "active" },
      { id: "gameplay", name: "Gameplay & feel", status: "pending" },
      { id: "narrative", name: "Story & narrative", status: "pending" },
      { id: "maps", name: "Maps & collision", status: "pending" },
      { id: "character", name: "Characters & sprites", status: "pending" },
      { id: "assets", name: "Tiles & assets", status: "pending" },
      { id: "input", name: "Input & mobile", status: "pending" },
      { id: "ui", name: "UI & devices", status: "pending" },
      { id: "audio", name: "Audio", status: "pending" },
      { id: "release", name: "Performance & release", status: "pending" },
    ],
    inputActions: base.inputActions ?? [
      { id: "move-left", label: "Move left", bindings: ["ArrowLeft", "KeyA"], animationState: "run", onboarding: true, replayEvent: true },
      { id: "move-right", label: "Move right", bindings: ["ArrowRight", "KeyD"], animationState: "run", onboarding: true, replayEvent: true },
      { id: "jump", label: "Jump", bindings: ["Space", "ArrowUp", "KeyW"], animationState: "jump", onboarding: true, replayEvent: true },
      { id: "interact", label: "Interact / lock", bindings: ["KeyE"], animationState: "interact", onboarding: true, replayEvent: true },
    ],
    presentationProgram,
    gameShell,
    saveProgram: base.saveProgram ?? normalizeSaveProgram({ enabled: true, portableCodes: true }, { profile: "strict" }),
    replay: base.replay ?? { version: "1", tickRate: 60, seed: 1, cases: [] },
    release: {
      externalRequests: [],
      debugMarkers: [],
      singleFile: true,
      networkFree: true,
      allowNetwork: false,
      exportProfile: "strict",
      storageFree: true,
      allowStorage: false,
      runtimeBundleEmbedded: true,
      engineDelivery: "built-in-inline",
      moduleImports: [],
      assetLookupValidated: true,
      ...(base.release ?? {}),
    },
    performance: { targetP95FrameMs: 12, ...(base.performance ?? {}) },
    qualityContracts: {
      ...(base.qualityContracts ?? {}),
      architecture: { simulationStateSerializable: true, rendererDisposableAdapter: true, semanticInputActions: true, fixedStepHz: 60, maximumCatchUpSteps: 5, cameraPresentationOnly: true, generatedArtOwnsCollision: false, ...(base.qualityContracts?.architecture ?? {}) },
      canvas2d: { fixedBackbuffer: true, cappedDpr: true, opaqueContext: true, oneAnimationFrameOwner: true, atlasIntegerRects: true, culling: true, targetP95FrameMs: 12, ...(base.qualityContracts?.canvas2d ?? {}) },
      collision2d: { authority: "authored-map", axisSeparated: true, halfOpenTileRanges: true, fastBodySubsteps: true, highSpeedPolicy: "swept-aabb", deterministicOrdering: true, ...(base.qualityContracts?.collision2d ?? {}) },
      inputViewport: { tickSnapshots: true, readsKeyAndCode: true, clearsOnBlur: true, pointerCapture: true, safeAreas: true, touchTargetMin: 44, ...(base.qualityContracts?.inputViewport ?? {}) },
      presentation: { eventQueue: true, simulationIndependent: true, reducedMotion: true, ...(base.qualityContracts?.presentation ?? {}) },
      palette: { onePaletteAcrossFrames: true, averagingAfterQuantization: false, alphaWeightedResample: true, gameplayCriticalRecoloring: false, ...(base.qualityContracts?.palette ?? {}) },
    },
    deviceProfiles: base.deviceProfiles ?? [
      { id: "desktop", name: "Desktop", width: 1440, height: 900, touchTargetMin: 44 },
      { id: "small-laptop", name: "Small laptop", width: 1024, height: 768, touchTargetMin: 44 },
      { id: "portrait-390x844", name: "Portrait mobile", width: 390, height: 844, touchTargetMin: 44 },
      { id: "dpr2-mobile", name: "DPR2 mobile", width: 390, height: 844, dpr: 2, touchTargetMin: 44 },
    ],
    lifecycle: { pauseOnBlur: true, ...(base.lifecycle ?? {}) },
    accessibility: { reducedMotion: true, canvasSemantics: true, ...(base.accessibility ?? {}) },
    runtimeProfile: normalize2dRuntimeProfile(base.runtimeProfile),
    movementTuning: {
      maxRunSpeed: 260,
      groundAcceleration: 2200,
      airAcceleration: 1200,
      groundFriction: 2600,
      jumpVelocity: 570,
      coyoteTicks: 6,
      jumpBufferTicks: 8,
      jumpCutVelocity: 235,
      apexGravityScale: 0.6,
      fallGravityScale: 1.45,
      apexThreshold: 86,
      ...(base.movementTuning ?? {}),
    },
  });
}

function pocketRouteInputs() {
  return [
    { tick: 0, action: "move-right", pressed: true },
    { tick: 48, action: "jump", pressed: true },
    { tick: 62, action: "jump", pressed: false },
    { tick: 112, action: "jump", pressed: true },
    { tick: 126, action: "jump", pressed: false },
    { tick: 165, action: "move-right", pressed: false },
  ];
}

function pocketRouteAcceptanceTest() {
  return {
    id: "pocket-route-completion",
    name: "Collect every route coin and reach the exit",
    ownerId: "goal",
    assertion: "The authored staircase route collects all three coins and reaches the goal under the shipped movement tuning.",
    runner: "looplab-deterministic-runtime",
    driver: { tickRate: 60, tickCount: 170, inputs: pocketRouteInputs() },
    assertions: [
      { id: "route-won", target: "runtime-state", property: "won", operator: "equals", expected: true, atTick: 170 },
      { id: "route-coins", target: "runtime-state", property: "collectedCount", operator: "greater-or-equal", expected: 3, atTick: 170 },
      { id: "route-goal-event", target: "event-emitted", targetId: "goal.reached", operator: "greater-or-equal", expected: 1, atTick: 170 },
    ],
  };
}

function pocketRouteReplayCase() {
  return {
    id: "pocket-route-completion",
    name: "Collect every route coin and reach the exit",
    revision: 1,
    hashVersion: 3,
    changeReason: "Initial deterministic fixture",
    tickRate: 60,
    seed: 1,
    tickCount: 170,
    inputs: pocketRouteInputs(),
    expectedHash: "replay-dd4c1d21",
    checkpoints: [
      { tick: 10, hash: "replay-bb4c4d6e" },
      { tick: 20, hash: "replay-37825bf6" },
      { tick: 30, hash: "replay-c2be1312" },
      { tick: 40, hash: "replay-d87da302" },
      { tick: 50, hash: "replay-36945f76" },
      { tick: 60, hash: "replay-966d8976" },
      { tick: 70, hash: "replay-0916996a" },
      { tick: 80, hash: "replay-a8c132f0" },
      { tick: 90, hash: "replay-d6c941a2" },
      { tick: 100, hash: "replay-d2e1cd72" },
      { tick: 110, hash: "replay-f985f50e" },
      { tick: 120, hash: "replay-192261ca" },
      { tick: 130, hash: "replay-4493cec8" },
      { tick: 140, hash: "replay-b9544f26" },
      { tick: 150, hash: "replay-d67154fc" },
      { tick: 160, hash: "replay-79deb498" },
      { tick: 170, hash: "replay-dd4c1d21" },
    ],
  };
}

function topdownRelicRouteInputs() {
  return [
    { tick: 0, action: "move-left", pressed: true },
    { tick: 65, action: "move-left", pressed: false },
    { tick: 67, action: "move-up", pressed: true },
    { tick: 87, action: "move-up", pressed: false },
    { tick: 89, action: "move-right", pressed: true },
    { tick: 229, action: "move-right", pressed: false },
  ];
}

function topdownRelicProgram() {
  return normalizeGameplayProgram({
    version: 1,
    variables: [
      { id: "relics", label: "Relics", type: "number", initial: 0, min: 0, max: 1, visible: true },
      { id: "exit-unlocked", label: "Exit unlocked", type: "boolean", initial: false, visible: true },
    ],
    rules: [
      {
        id: "collect-relic",
        name: "Collect the relic",
        enabled: true,
        trigger: { type: "event", event: "coin.collected", objectId: "relic", mapId: "map-main" },
        conditions: [],
        once: "run",
        effects: [
          { type: "add-variable", variableId: "relics", value: 1 },
          { type: "emit", event: "progress.relic-collected" },
        ],
      },
      {
        id: "unlock-exit",
        name: "Reveal the quest exit",
        enabled: true,
        trigger: { type: "state", mapId: "map-main" },
        conditions: [{ variableId: "relics", operator: "gte", value: 1 }],
        once: "run",
        effects: [
          { type: "set-variable", variableId: "exit-unlocked", value: true },
          { type: "set-object", objectId: "goal", mapId: "map-main", changes: { hidden: false, locked: false } },
          { type: "emit", event: "progress.exit-unlocked" },
        ],
      },
    ],
  });
}

function topdownRelicAcceptanceTest() {
  return {
    id: "topdown-relic-route",
    name: "Collect the relic, unlock the exit, and finish",
    ownerId: "goal",
    assertion: "The authored route collects the relic, changes quest state, reveals the exit, and reaches the goal.",
    runner: LOOPLAB_ACCEPTANCE_RUNNER,
    driver: { tickRate: 60, tickCount: 232, inputs: topdownRelicRouteInputs() },
    assertions: [
      { id: "route-won", target: "runtime-state", property: "won", operator: "equals", expected: true },
      { id: "relic-collected", target: "runtime-state", property: "collectedCount", operator: "greater-or-equal", expected: 1 },
      { id: "exit-unlocked", target: "gameplay-variable", targetId: "exit-unlocked", operator: "equals", expected: true },
      { id: "unlock-event", target: "event-emitted", targetId: "progress.exit-unlocked", operator: "greater-or-equal", expected: 1 },
      { id: "goal-event", target: "event-emitted", targetId: "goal.reached", operator: "greater-or-equal", expected: 1 },
    ],
  };
}

function topdownRelicReplayCase() {
  return {
    id: "topdown-relic-route",
    name: "Collect the relic, unlock the exit, and finish",
    revision: 1,
    hashVersion: 4,
    changeReason: "Add a deterministic state-changing top-down reference route",
    tickRate: 60,
    seed: 1,
    tickCount: 232,
    inputs: topdownRelicRouteInputs(),
    expectedHash: "replay-1ae03038",
    checkpoints: [
      { tick: 16, hash: "replay-ce51bfc3" },
      { tick: 32, hash: "replay-f2f54f0d" },
      { tick: 48, hash: "replay-03d6d10b" },
      { tick: 64, hash: "replay-906c8735" },
      { tick: 80, hash: "replay-d94733cf" },
      { tick: 96, hash: "replay-21ac44d9" },
      { tick: 112, hash: "replay-bb6fb0f7" },
      { tick: 128, hash: "replay-be2f2ba5" },
      { tick: 144, hash: "replay-dddbefd1" },
      { tick: 160, hash: "replay-6959cc27" },
      { tick: 176, hash: "replay-a4ab3f99" },
      { tick: 192, hash: "replay-a7aba9c9" },
      { tick: 208, hash: "replay-99e0878b" },
      { tick: 224, hash: "replay-86e55006" },
      { tick: 232, hash: "replay-1ae03038" },
    ],
  };
}

function ledgerMarketInputs() {
  return [
    { tick: 0, action: "choice-1", pressed: true },
    { tick: 1, action: "choice-1", pressed: false },
    { tick: 2, action: "choice-1", pressed: true },
    { tick: 3, action: "choice-1", pressed: false },
  ];
}

function ledgerMarketProgram() {
  return normalizeGameplayProgram({
    version: 1,
    variables: [
      { id: "credits", label: "Credits", type: "number", initial: 10, min: 0, max: 99, visible: true },
      { id: "cargo", label: "Cargo", type: "number", initial: 2, min: 0, max: 9, visible: true },
      { id: "day", label: "Day", type: "number", initial: 1, min: 1, max: 30, visible: true },
    ],
    clocks: [{ id: "campaign-day", label: "Market day", variableId: "day", unit: "day", step: 1 }],
    initialChoicePageId: "market-offer",
    choicePages: [
      {
        id: "market-offer",
        title: "Day {day}: glass market",
        body: "You have {credits} credits and {cargo} crates.",
        modal: true,
        choices: [
          {
            id: "buy-lanterns",
            label: "Buy lanterns for 4 credits",
            actionId: "choice-1",
            visibleWhen: [],
            enabledWhen: [{ variableId: "credits", operator: "gte", value: 4 }],
            effects: [
              { type: "set-variable-expression", variableId: "credits", expression: { operator: "subtract", operands: [{ variableId: "credits" }, 4] } },
              { type: "set-variable-expression", variableId: "cargo", expression: { operator: "clamp", operands: [{ operator: "add", operands: [{ variableId: "cargo" }, 1] }, 0, 9] } },
              { type: "advance-clock", clockId: "campaign-day", steps: 1 },
            ],
            nextPageId: "market-receipt",
            close: false,
          },
          {
            id: "wait-a-day",
            label: "Wait until tomorrow",
            actionId: "choice-2",
            visibleWhen: [],
            enabledWhen: [],
            effects: [{ type: "advance-clock", clockId: "campaign-day", steps: 1 }],
            nextPageId: "market-receipt",
            close: false,
          },
        ],
      },
      {
        id: "market-receipt",
        title: "Ledger updated",
        body: "Day {day}. Balance {credits}. Cargo {cargo}.",
        modal: true,
        choices: [{ id: "close-ledger", label: "Continue", actionId: "choice-1", visibleWhen: [], enabledWhen: [], effects: [], close: true }],
      },
    ],
    hudBindings: [
      { id: "market-ledger", text: "Day {day} · {credits} credits · {cargo} cargo", ariaLabel: "Market day {day}, {credits} credits, {cargo} cargo", region: "primary", visibleWhen: [] },
    ],
    rules: [],
  });
}

function ledgerMarketAcceptanceTest() {
  return {
    id: "market-choice-route",
    name: "Buy cargo and close the ledger",
    ownerId: "gameplay.market",
    assertion: "A semantic choice purchase updates the ledger, advances the day, and closes the modal.",
    runner: LOOPLAB_ACCEPTANCE_RUNNER,
    driver: { tickRate: 60, tickCount: 4, inputs: ledgerMarketInputs() },
    assertions: [
      { id: "credits-spent", target: "gameplay-variable", targetId: "credits", operator: "equals", expected: 6 },
      { id: "cargo-added", target: "gameplay-variable", targetId: "cargo", operator: "equals", expected: 3 },
      { id: "day-advanced", target: "gameplay-variable", targetId: "day", operator: "equals", expected: 2 },
      { id: "two-choices", target: "event-emitted", targetId: "choice.selected", operator: "equals", expected: 2 },
      { id: "modal-closed", target: "runtime-state", property: "activeChoicePageId", operator: "falsy" },
    ],
  };
}

function ledgerMarketReplayCase() {
  return {
    id: "market-choice-route",
    name: "Buy cargo and close the ledger",
    revision: 1,
    hashVersion: 4,
    changeReason: "Initial genre-neutral systems fixture",
    tickRate: 60,
    seed: 1,
    tickCount: 4,
    inputs: ledgerMarketInputs(),
    expectedHash: "replay-615ffbec",
    checkpoints: [
      { tick: 1, hash: "replay-01d886e6" },
      { tick: 2, hash: "replay-01d886e6" },
      { tick: 3, hash: "replay-615ffbec" },
      { tick: 4, hash: "replay-615ffbec" },
    ],
  };
}

export function createTemplate(template = "blank") {
  if (template === "kinetic") {
    const brief = composeDirectedGameBrief({
      userPrompt: "A stylish rollerblading courier crosses two connected city districts, chains authored rails, collects momentum tokens, and reaches a clear night-route finish.",
      genre: "skating-tricks",
      coreLoop: "traverse-chain-score",
      movementTemplate: "kinetic-runner",
      format: "connected-rooms",
      progression: "score-attack",
    });
    const foundation = createProjectFoundation({
      name: "Kinetic City: Night Route",
      width: 1280,
      height: 720,
      background: "#15182f",
      gravity: 1500,
      grid: 20,
      controlMode: "platformer",
      assets: [],
      objects: [
        createObject("player", { id: "player", x: 62, y: 612 }),
        createObject("platform", { id: "ground", x: 0, y: 684, width: 1280, height: 36 }),
        createObject("spawn", { id: "spawn", x: 62, y: 620 }),
      ],
    }, "kinetic");
    return buildKineticCityScaffold(foundation, brief);
  }

  if (template === "platformer") {
    return createProjectFoundation({
      name: "Pocket Platformer",
      width: 960,
      height: 540,
      background: "#f4ecd8",
      gravity: 1500,
      grid: 20,
      controlMode: "platformer",
      assets: [],
      acceptanceTests: [pocketRouteAcceptanceTest()],
      replay: { version: "1", tickRate: 60, seed: 1, cases: [pocketRouteReplayCase()] },
      objects: [
        createObject("decor", { id: "cloud", name: "Mint cloud", x: 76, y: 88, width: 116, height: 52 }),
        createObject("decor", { id: "sun-block", name: "Sun block", x: 718, y: 126, color: "#ffca2e", width: 68, height: 68 }),
        createObject("player", { id: "player", name: "Hero", x: 110, y: 378 }),
        createObject("platform", { id: "start-floor", name: "Start floor", x: 58, y: 466, width: 310 }),
        createObject("platform", { id: "ledge", name: "Middle ledge", x: 430, y: 398, width: 190 }),
        createObject("platform", { id: "high-ledge", name: "High ledge", x: 702, y: 314, width: 180 }),
        createObject("platform", { id: "ground", name: "World floor", x: 0, y: 520, width: 960, height: 20 }),
        createObject("coin", { id: "coin-1", name: "Coin A", x: 490, y: 348 }),
        createObject("coin", { id: "coin-2", name: "Coin B", x: 548, y: 348 }),
        createObject("coin", { id: "coin-3", name: "Coin C", x: 770, y: 264 }),
        createObject("hazard", { id: "hazard-1", name: "Spikes", x: 330, y: 492 }),
        createObject("spawn", { id: "spawn", name: "Checkpoint", x: 82, y: 398 }),
        createObject("goal", { id: "goal", name: "Exit flag", x: 820, y: 242 }),
      ],
    }, "platformer");
  }

  if (template === "topdown") {
    return createProjectFoundation({
      name: "Agent Quest",
      width: 960,
      height: 540,
      background: "#dff0c7",
      gravity: 0,
      grid: 24,
      controlMode: "topdown",
      assets: [],
      qualityContracts: { gameplayProgramRequired: true, completionMode: "required" },
      gameplayProgram: topdownRelicProgram(),
      acceptanceTests: [topdownRelicAcceptanceTest()],
      replay: { version: "1", tickRate: 60, seed: 1, cases: [topdownRelicReplayCase()] },
      inputActions: [
        { id: "move-left", label: "Move left", bindings: ["ArrowLeft", "KeyA"], animationState: "walk", onboarding: true, replayEvent: true },
        { id: "move-right", label: "Move right", bindings: ["ArrowRight", "KeyD"], animationState: "walk", onboarding: true, replayEvent: true },
        { id: "move-up", label: "Move up", bindings: ["ArrowUp", "KeyW"], animationState: "walk", onboarding: true, replayEvent: true },
        { id: "move-down", label: "Move down", bindings: ["ArrowDown", "KeyS"], animationState: "walk", onboarding: true, replayEvent: true },
        { id: "interact", label: "Interact", bindings: ["KeyE"], animationState: "interact", onboarding: true, replayEvent: true },
      ],
      objects: [
        createObject("player", { id: "player", name: "Explorer", x: 450, y: 236, width: 46, height: 46 }),
        createObject("platform", { id: "north-wall", name: "North wall", x: 92, y: 76, width: 776, height: 24 }),
        createObject("platform", { id: "south-wall", name: "South wall", x: 92, y: 440, width: 776, height: 24 }),
        createObject("platform", { id: "west-wall", name: "West wall", x: 92, y: 100, width: 24, height: 340 }),
        createObject("platform", { id: "east-wall", name: "East wall", x: 844, y: 100, width: 24, height: 340 }),
        createObject("coin", { id: "relic", name: "Relic", x: 182, y: 150 }),
        createObject("hazard", { id: "hazard", name: "Quest hazard", x: 470, y: 330 }),
        createObject("spawn", { id: "spawn", name: "Spawn", x: 450, y: 236 }),
        createObject("goal", { id: "goal", name: "Quest marker", x: 760, y: 144, hidden: true, locked: true }),
      ],
    }, "topdown");
  }

  if (template === "systems") {
    return createProjectFoundation({
      name: "Lantern Market Ledger",
      width: 960,
      height: 540,
      background: "#d5d5d2",
      gravity: 0,
      grid: 24,
      controlMode: "topdown",
      assets: [],
      qualityContracts: { gameplayProgramRequired: true },
      inputActions: [
        { id: "choice-1", label: "Choose first option", bindings: ["Digit1"], animationState: "decide", onboarding: true, replayEvent: true },
        { id: "choice-2", label: "Choose second option", bindings: ["Digit2"], animationState: "decide", onboarding: true, replayEvent: true },
      ],
      gameplayProgram: ledgerMarketProgram(),
      acceptanceTests: [ledgerMarketAcceptanceTest()],
      replay: { version: "1", tickRate: 60, seed: 1, cases: [ledgerMarketReplayCase()] },
      objects: [
        createObject("decor", { id: "market-sky", name: "Market sky", x: 0, y: 0, width: 960, height: 540, color: "#d5d5d2", collider: { enabled: false, offsetX: 0, offsetY: 0, width: 960, height: 540, trigger: false, oneWay: false, zMin: 0, zMax: 0 } }),
        createObject("decor", { id: "market-hall", name: "Market hall", x: 84, y: 104, width: 792, height: 350, color: "#3f3f42", collider: { enabled: false, offsetX: 0, offsetY: 0, width: 792, height: 350, trigger: false, oneWay: false, zMin: 0, zMax: 0 } }),
        createObject("decor", { id: "lantern-counter", name: "Lantern counter", x: 160, y: 290, width: 264, height: 92, color: "#6a5b4a", collider: { enabled: false, offsetX: 0, offsetY: 0, width: 264, height: 92, trigger: false, oneWay: false, zMin: 0, zMax: 0 } }),
        createObject("decor", { id: "cargo-counter", name: "Cargo counter", x: 536, y: 290, width: 264, height: 92, color: "#55565a", collider: { enabled: false, offsetX: 0, offsetY: 0, width: 264, height: 92, trigger: false, oneWay: false, zMin: 0, zMax: 0 } }),
        createObject("decor", { id: "lantern-glow-a", name: "Lantern glow A", x: 220, y: 154, width: 52, height: 82, color: "#d5a755", collider: { enabled: false, offsetX: 0, offsetY: 0, width: 52, height: 82, trigger: false, oneWay: false, zMin: 0, zMax: 0 } }),
        createObject("decor", { id: "lantern-glow-b", name: "Lantern glow B", x: 688, y: 154, width: 52, height: 82, color: "#c68a55", collider: { enabled: false, offsetX: 0, offsetY: 0, width: 52, height: 82, trigger: false, oneWay: false, zMin: 0, zMax: 0 } }),
      ],
      templateProvenance: { id: "systems", version: 1, semanticMode: "genre-neutral", adaptationStatus: "starter", neutralRuntimeIds: ["market-offer", "market-receipt", "campaign-day", "market-ledger"] },
      runtimeProfile: { dimension: "2d", framework: "canvas" },
    }, "systems");
  }

  if (template === "dimetric") {
    const projection = normalizeProjection({
      type: "dimetric-2:1",
      tileWidth: 128,
      tileHeight: 64,
      elevationStep: 32,
      originX: 512,
      originY: 84,
      worldUnitsPerTile: 128,
    }, { width: 1024, height: 768 });
    const raisedDeckSlices = [0, 40, 80, 120].map((sourceY, index) => ({
      id: `deck-depth-${index + 1}`,
      sourceY,
      height: 40,
      depthBias: (sourceY + 20 - 160) * 1024,
    }));
    return createProjectFoundation({
      name: "Dimetric World Workshop",
      width: 1024,
      height: 768,
      background: "#d8d8d5",
      gravity: 0,
      grid: 64,
      controlMode: "topdown",
      projection,
      assets: [],
      inputActions: [
        { id: "move-left", label: "Move left", bindings: ["ArrowLeft", "KeyA"], animationState: "travel", onboarding: true, replayEvent: true },
        { id: "move-right", label: "Move right", bindings: ["ArrowRight", "KeyD"], animationState: "travel", onboarding: true, replayEvent: true },
        { id: "move-up", label: "Move up", bindings: ["ArrowUp", "KeyW"], animationState: "travel", onboarding: true, replayEvent: true },
        { id: "move-down", label: "Move down", bindings: ["ArrowDown", "KeyS"], animationState: "travel", onboarding: true, replayEvent: true },
        { id: "interact", label: "Interact / lock", bindings: ["KeyE"], animationState: "interact", onboarding: true, replayEvent: true },
      ],
      navigation: createNavigationModel({
        activeLayerId: "ground-route",
        layers: [
          { id: "ground-route", name: "Ground / underpass", color: "#55555f", visible: true, locked: false, zMin: 0, zMax: 1 },
          { id: "deck-route", name: "Raised deck", color: "#777783", visible: true, locked: false, zMin: 4, zMax: 5 },
        ],
        nodes: [
          { id: "ground-start", x: 180, y: 580, z: 0, layerId: "ground-route", destinationId: "start" },
          { id: "ground-west", x: 300, y: 500, z: 0, layerId: "ground-route", destinationId: "plaza" },
          { id: "ground-under-a", x: 400, y: 420, z: 0, layerId: "ground-route", destinationId: "underpass-west" },
          { id: "ground-under-b", x: 640, y: 420, z: 0, layerId: "ground-route", destinationId: "underpass-east" },
          { id: "ground-finish", x: 840, y: 500, z: 0, layerId: "ground-route", destinationId: "finish" },
          { id: "deck-west", x: 400, y: 420, z: 4, layerId: "deck-route", destinationId: "deck-west" },
          { id: "deck-east", x: 640, y: 420, z: 4, layerId: "deck-route", destinationId: "deck-east" },
        ],
        links: [
          { id: "ground-start-west", a: "ground-start", b: "ground-west", layerId: "ground-route", cost: 1, oneWay: false },
          { id: "ground-west-under", a: "ground-west", b: "ground-under-a", layerId: "ground-route", cost: 1, oneWay: false },
          { id: "ground-underpass", a: "ground-under-a", b: "ground-under-b", layerId: "ground-route", cost: 1, oneWay: false },
          { id: "ground-under-finish", a: "ground-under-b", b: "ground-finish", layerId: "ground-route", cost: 1, oneWay: false },
          { id: "deck-line", a: "deck-west", b: "deck-east", layerId: "deck-route", cost: 1, oneWay: false },
        ],
        areas: [
          { id: "ground-walkable", name: "Ground walkable area", kind: "walkable", layerId: "ground-route", zMin: 0, zMax: 1, points: [{ x: 72, y: 72, z: 0 }, { x: 952, y: 72, z: 0 }, { x: 952, y: 696, z: 0 }, { x: 72, y: 696, z: 0 }] },
          { id: "west-building-footprint", name: "West building footprint", kind: "blocked", layerId: "ground-route", zMin: 0, zMax: 1, points: [{ x: 112, y: 112, z: 0 }, { x: 304, y: 112, z: 0 }, { x: 304, y: 272, z: 0 }, { x: 112, y: 272, z: 0 }] },
          { id: "east-building-footprint", name: "East building footprint", kind: "blocked", layerId: "ground-route", zMin: 0, zMax: 1, points: [{ x: 720, y: 96, z: 0 }, { x: 896, y: 96, z: 0 }, { x: 896, y: 256, z: 0 }, { x: 720, y: 256, z: 0 }] },
          { id: "deck-walkable", name: "Raised deck walkable area", kind: "walkable", layerId: "deck-route", zMin: 4, zMax: 5, points: [{ x: 360, y: 340, z: 4 }, { x: 680, y: 340, z: 4 }, { x: 680, y: 500, z: 4 }, { x: 360, y: 500, z: 4 }] },
        ],
      }),
      traversalPaths: [
        { id: "ground-passage-route", name: "Ground passage route", kind: "route", collisionOwner: "authored-map", routeLayer: "ground-route", points: [{ x: 300, y: 500, z: 0 }, { x: 400, y: 420, z: 0 }, { x: 640, y: 420, z: 0 }], entryRadius: 30, entryZTolerance: 0.5, minimumEntrySpeed: 0, direction: "both", acceleration: 80, maximumSpeed: 440, exitImpulse: { x: 20, y: 0, z: 0 }, transferPathIds: [], bailBehavior: "drop" },
        { id: "raised-passage-route", name: "Raised passage route", kind: "route", collisionOwner: "authored-map", routeLayer: "deck-route", points: [{ x: 400, y: 420, z: 4 }, { x: 640, y: 420, z: 4 }], entryRadius: 30, entryZTolerance: 0.5, minimumEntrySpeed: 0, direction: "both", acceleration: 80, maximumSpeed: 440, exitImpulse: { x: 20, y: 0, z: 0 }, transferPathIds: [], bailBehavior: "drop" },
      ],
      objects: [
        createObject("platform", { id: "world-ground", name: "World ground plane", role: "ground-plane", x: 64, y: 64, width: 896, height: 640, color: "#bdbdb9", solid: false, collisionHeight: 0, collider: { enabled: false, offsetX: 0, offsetY: 0, width: 896, height: 640, trigger: false, oneWay: false, zMin: 0, zMax: 1 } }),
        createObject("platform", { id: "west-building", name: "West structure", role: "building", x: 112, y: 112, width: 192, height: 160, color: "#4b4b52", solid: true, requiresSupport: true, supportContact: { mode: "floor", offset: 0, tolerance: 2 }, collisionHeight: 3, collider: { enabled: true, offsetX: 0, offsetY: 0, width: 192, height: 160, trigger: false, oneWay: false, zMin: 0, zMax: 3 } }),
        createObject("platform", { id: "east-building", name: "East structure", role: "building", x: 720, y: 96, width: 176, height: 160, color: "#606068", solid: true, requiresSupport: true, supportContact: { mode: "floor", offset: 0, tolerance: 2 }, collisionHeight: 3, collider: { enabled: true, offsetX: 0, offsetY: 0, width: 176, height: 160, trigger: false, oneWay: false, zMin: 0, zMax: 3 } }),
        createObject("platform", { id: "deck-support-north", name: "North deck support", role: "support", x: 360, y: 340, width: 320, height: 24, color: "#55555d", solid: true, requiresSupport: true, supportContact: { mode: "floor", offset: 0, tolerance: 2 }, collisionHeight: 4, collider: { enabled: true, offsetX: 0, offsetY: 0, width: 320, height: 24, trigger: false, oneWay: false, zMin: 0, zMax: 4 } }),
        createObject("platform", { id: "deck-support-south", name: "South deck support", role: "support", x: 360, y: 476, width: 320, height: 24, color: "#55555d", solid: true, requiresSupport: true, supportContact: { mode: "floor", offset: 0, tolerance: 2 }, collisionHeight: 4, collider: { enabled: true, offsetX: 0, offsetY: 0, width: 320, height: 24, trigger: false, oneWay: false, zMin: 0, zMax: 4 } }),
        createObject("platform", { id: "raised-deck", name: "Raised route deck", role: "terrain", x: 360, y: 340, z: 4, supportZ: 4, width: 320, height: 160, color: "#73737b", solid: true, requiresSupport: true, supportContact: { mode: "surface", surfaceId: "deck-support-north", offset: 0, tolerance: 2 }, collisionHeight: 1, depthSlices: raisedDeckSlices, collider: { enabled: true, offsetX: 0, offsetY: 0, width: 320, height: 160, trigger: false, oneWay: false, zMin: 4, zMax: 5 } }),
        createObject("player", { id: "player", name: "Dimetric player", x: 158, y: 522, color: "#3c3c45" }),
        createObject("spawn", { id: "spawn", name: "Ground start", x: 159, y: 516, color: "#5b5b65" }),
        createObject("coin", { id: "route-token-a", name: "Sample marker A", x: 334, y: 454, color: "#8b5cf6" }),
        createObject("coin", { id: "route-token-b", name: "Sample marker B", x: 588, y: 374, color: "#8b5cf6" }),
        createObject("goal", { id: "goal", name: "Route end", x: 818, y: 438, color: "#3f3f47" }),
      ],
      templateProvenance: { id: "dimetric", version: 3, semanticMode: "neutral", adaptationStatus: "starter", neutralRuntimeIds: ["ground-passage-route", "raised-passage-route", "world-ground", "deck-support-north", "deck-support-south", "raised-deck", "player", "spawn", "route-token-a", "route-token-b", "goal"] },
      runtimeProfile: { dimension: "2d", framework: "canvas" },
    }, "dimetric");
  }

  if (template !== "blank") throw new Error(`Unknown template: ${template}`);
  return createProjectFoundation({
    name: "Untitled Game",
    width: 960,
    height: 540,
    background: "#f4ecd8",
    gravity: 1500,
    grid: 20,
    controlMode: "platformer",
    assets: [],
    objects: [
      createObject("player", { id: "player", x: 120, y: 402 }),
      createObject("platform", { id: "ground", name: "Ground", x: 0, y: 520, width: 960, height: 20 }),
      createObject("spawn", { id: "spawn", x: 86, y: 410 }),
    ],
  }, "blank");
}

function mapSnapshot(project, id, name) {
  return {
    id,
    name,
    width: project.width,
    height: project.height,
    background: project.background,
    gravity: project.gravity,
    grid: project.grid,
    controlMode: project.controlMode,
    projection: normalizeAuthoredProjection(project.projection, project),
    navigation: createNavigationModel(project.navigation),
    objects: clone(project.objects ?? []),
    traversalPaths: clone(project.traversalPaths ?? []),
    collisionGeometry: clone(project.collisionGeometry),
    elevationTransitions: clone(project.elevationTransitions),
    tileProgram: clone(project.tileProgram),
    worldStream: clone(project.worldStream),
    clearanceZones: clone(project.clearanceZones ?? []),
    hudSafeAreas: clone(project.hudSafeAreas ?? []),
    maxInteractionGap: project.maxInteractionGap,
    interactionPolicy: clone(project.interactionPolicy),
  };
}

function ensureMaps(project) {
  if (project.maps?.length && project.activeMapId && project.maps.some((map) => map.id === project.activeMapId)) {
    const startMapId = project.maps.some((map) => map.id === project.startMapId) ? project.startMapId : project.maps[0].id;
    return startMapId === project.startMapId ? project : { ...project, startMapId };
  }
  const id = project.activeMapId ?? "map-main";
  return { ...project, activeMapId: id, startMapId: project.startMapId ?? id, maps: [mapSnapshot(project, id, "Main map")] };
}

function syncActiveMap(project) {
  const normalized = ensureMaps(project);
  const id = normalized.activeMapId;
  const current = normalized.maps.find((map) => map.id === id);
  const snapshot = mapSnapshot(normalized, id, current?.name ?? "Map");
  return {
    ...normalized,
    projection: clone(snapshot.projection),
    navigation: createNavigationModel(snapshot.navigation),
    maps: normalized.maps.map((map) => map.id === id ? { ...map, ...snapshot } : map),
  };
}

function activateMap(project, mapId) {
  const normalized = syncActiveMap(project);
  const target = normalized.maps.find((map) => map.id === mapId);
  if (!target) throw new Error(`Map was not found: ${mapId}`);
  return {
    ...normalized,
    activeMapId: target.id,
    width: target.width,
    height: target.height,
    background: target.background,
    gravity: target.gravity,
    grid: target.grid,
    controlMode: target.controlMode,
    projection: normalizeAuthoredProjection(target.projection ?? normalized.projection, target),
    navigation: createNavigationModel(target.navigation),
    objects: clone(target.objects),
    traversalPaths: clone(target.traversalPaths ?? []),
    collisionGeometry: clone(target.collisionGeometry),
    elevationTransitions: clone(target.elevationTransitions),
    tileProgram: clone(target.tileProgram),
    worldStream: clone(target.worldStream),
    clearanceZones: clone(target.clearanceZones ?? []),
    hudSafeAreas: clone(target.hudSafeAreas ?? []),
    maxInteractionGap: target.maxInteractionGap,
    interactionPolicy: clone(target.interactionPolicy),
  };
}

function hydrateActiveMap(project, maps, activeMapId = project.activeMapId) {
  const target = maps.find((map) => map.id === activeMapId) ?? maps[0];
  if (!target) throw new Error("A project must contain at least one map.");
  return {
    ...project,
    maps,
    activeMapId: target.id,
    startMapId: maps.some((map) => map.id === project.startMapId) ? project.startMapId : maps[0].id,
    width: target.width,
    height: target.height,
    background: target.background,
    gravity: target.gravity,
    grid: target.grid,
    controlMode: target.controlMode,
    projection: normalizeAuthoredProjection(target.projection ?? project.projection, target),
    navigation: createNavigationModel(target.navigation),
    objects: clone(target.objects),
    traversalPaths: clone(target.traversalPaths ?? []),
    collisionGeometry: clone(target.collisionGeometry),
    elevationTransitions: clone(target.elevationTransitions),
    tileProgram: clone(target.tileProgram),
    worldStream: clone(target.worldStream),
    clearanceZones: clone(target.clearanceZones ?? []),
    hudSafeAreas: clone(target.hudSafeAreas ?? []),
    maxInteractionGap: target.maxInteractionGap,
    interactionPolicy: clone(target.interactionPolicy),
  };
}

export function invalidateVerifiedAuthoring(previousProject, nextProject, options = {}) {
  const previous = syncActiveMap(clone(previousProject));
  const next = syncActiveMap(clone(nextProject));
  const previousIteration = previous.iteration;
  const nextIteration = next.iteration;
  const protectedStatus = previousIteration?.status === "verified" || previousIteration?.status === "promoted";
  const sameLifecycle = protectedStatus && previousIteration.id === nextIteration?.id && previousIteration.status === nextIteration?.status;
  const sourceChanged = doctorSourceDigest(previous) !== doctorSourceDigest(next);
  const profileChanged = (previous.doctorProfile ?? "prototype") !== (next.doctorProfile ?? "prototype");
  if (!sameLifecycle || (!sourceChanged && !profileChanged)) return next;

  const now = options.now ?? new Date().toISOString();
  const id = options.id ?? `iteration-${now.replace(/[:.]/g, "-")}-${secureUniqueId()}`;
  const iteration = {
    ...nextIteration,
    id,
    parentId: previousIteration.id,
    status: "candidate",
    createdAt: now,
    readOnly: false,
  };
  delete iteration.verifiedAt;
  delete iteration.promotedAt;
  delete iteration.verification;

  const build = { ...(next.build ?? {}) };
  build.id = options.buildId ?? id;
  build.sourceRevision = id;
  build.generatedFromRevision = id;
  build.sourceTimestamp = now;
  delete build.outputTimestamp;
  delete build.servedBuildId;

  return {
    ...next,
    iteration,
    build,
    authoring: {
      ...(next.authoring ?? {}),
      dirty: true,
      changedAt: now,
      invalidatedVerificationOf: previousIteration.id,
      invalidationReason: options.reason ?? "Authored game state changed",
    },
  };
}

function signatureSimilarity(first, second) {
  if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length || first.length === 0) return 0;
  const error = first.reduce((total, value, index) => total + Math.abs(value - second[index]), 0) / first.length;
  return Math.max(0, 1 - error / 255);
}

function configuredDoctorProfile(project, command) {
  const profile = project.doctorProfile ?? "prototype";
  if (command.profile !== undefined && command.profile !== profile) {
    throw new Error(`Verification must use the project's configured ${profile} Doctor profile.`);
  }
  return profile;
}

function preserveStrictestDoctorProfile(currentProject, replacement) {
  if (!replacement || typeof replacement !== "object" || Array.isArray(replacement)) return replacement;
  if ((currentProject?.doctorProfile ?? "prototype") === "production" || replacement.doctorProfile === "production") replacement.doctorProfile = "production";
  else replacement.doctorProfile = "prototype";
  return replacement;
}

function validateMapFields(map, prefix, errors) {
  if (typeof map.name !== "string" || !map.name.trim()) errors.push(`${prefix}.name must be a non-empty string.`);
  if (!isFiniteNumber(map.width) || map.width < 64 || map.width > 8192) errors.push(`${prefix}.width must be between 64 and 8192.`);
  if (!isFiniteNumber(map.height) || map.height < 64 || map.height > 8192) errors.push(`${prefix}.height must be between 64 and 8192.`);
  if (typeof map.background !== "string" || !/^#[0-9a-f]{6}$/i.test(map.background)) errors.push(`${prefix}.background must be a six-digit hex color.`);
  if (!isFiniteNumber(map.gravity)) errors.push(`${prefix}.gravity must be a finite number.`);
  if (!isFiniteNumber(map.grid) || map.grid < 1 || map.grid > 256) errors.push(`${prefix}.grid must be between 1 and 256.`);
  if (!["platformer", "topdown"].includes(map.controlMode)) errors.push(`${prefix}.controlMode must be platformer or topdown.`);
  if (map.projection !== undefined) {
    const projection = map.projection;
    if (!projection || typeof projection !== "object" || Array.isArray(projection)) errors.push(`${prefix}.projection must be an object.`);
    else if (!["orthographic", "dimetric-2:1"].includes(projection.type)) errors.push(`${prefix}.projection.type must be orthographic or dimetric-2:1.`);
    else if (projection.type === "dimetric-2:1") {
      if (projection.tileWidth !== 128 || projection.tileHeight !== 64) errors.push(`${prefix}.projection must use exact 128×64 dimetric tiles.`);
      for (const field of ["elevationStep", "originX", "originY", "worldUnitsPerTile"]) if (!isFiniteNumber(projection[field])) errors.push(`${prefix}.projection.${field} must be finite.`);
      if (isFiniteNumber(projection.worldUnitsPerTile) && projection.worldUnitsPerTile <= 0) errors.push(`${prefix}.projection.worldUnitsPerTile must be greater than zero.`);
    }
  }
}

function validateObjects(objects, prefix, assetIds, errors, warnings, options = {}) {
  if (!Array.isArray(objects)) {
    errors.push(`${prefix} must be an array.`);
    return;
  }
  const ids = new Set();
  objects.forEach((object, index) => {
    const objectPrefix = `${prefix}[${index}]`;
    if (!object || typeof object !== "object" || Array.isArray(object)) {
      errors.push(`${objectPrefix} must be an object.`);
      return;
    }
    if (typeof object.id !== "string" || !object.id) errors.push(`${objectPrefix}.id must be a non-empty string.`);
    else if (ids.has(object.id)) errors.push(`${objectPrefix}.id duplicates ${object.id}.`);
    else ids.add(object.id);
    if (!LOOPLAB_OBJECT_KINDS.includes(object.kind)) errors.push(`${objectPrefix}.kind is not supported.`);
    if (typeof object.name !== "string" || !object.name.trim()) errors.push(`${objectPrefix}.name must be a non-empty string.`);
    for (const field of ["x", "y", "width", "height"]) {
      if (!isFiniteNumber(object[field])) errors.push(`${objectPrefix}.${field} must be a finite number.`);
    }
    if (isFiniteNumber(object.width) && object.width <= 0) errors.push(`${objectPrefix}.width must be greater than zero.`);
    if (isFiniteNumber(object.height) && object.height <= 0) errors.push(`${objectPrefix}.height must be greater than zero.`);
    if (typeof object.color !== "string" || !/^#[0-9a-f]{6}$/i.test(object.color)) errors.push(`${objectPrefix}.color must be a six-digit hex color.`);
    if (typeof object.solid !== "boolean") errors.push(`${objectPrefix}.solid must be boolean.`);
    if (object.assetId !== undefined && (typeof object.assetId !== "string" || !assetIds.has(object.assetId))) errors.push(`${objectPrefix}.assetId does not reference a project asset.`);
    if (object.assetFrame !== undefined && (!Number.isInteger(object.assetFrame) || object.assetFrame < 0)) errors.push(`${objectPrefix}.assetFrame must be a non-negative integer.`);
    if (object.anchorMode !== undefined && !["ground", "center", "top-left"].includes(object.anchorMode)) errors.push(`${objectPrefix}.anchorMode is not supported.`);
    if (object.collisionOwner !== undefined && object.collisionOwner !== "authored-map") errors.push(`${objectPrefix}.collisionOwner must be authored-map.`);
    if (object.runtimeJoin !== undefined) {
      const join = object.runtimeJoin;
      if (object.kind !== "portal") errors.push(`${objectPrefix}.runtimeJoin is supported only on portal objects.`);
      if (!join || typeof join !== "object" || Array.isArray(join)) errors.push(`${objectPrefix}.runtimeJoin must be an object.`);
      else {
        if (join.version !== undefined && join.version !== 1) errors.push(`${objectPrefix}.runtimeJoin.version must be 1.`);
        if (typeof join.enabled !== "boolean") errors.push(`${objectPrefix}.runtimeJoin.enabled must be boolean.`);
        if (join.mode !== undefined && !["portal", "continuous"].includes(join.mode)) errors.push(`${objectPrefix}.runtimeJoin.mode must be portal or continuous.`);
        for (const field of ["sourceEdge", "targetEdge"]) if (join[field] !== undefined && !["left", "right", "top", "bottom"].includes(join[field])) errors.push(`${objectPrefix}.runtimeJoin.${field} must be left, right, top, or bottom.`);
        for (const field of ["overlapPixels", "sampleDepth"]) if (join[field] !== undefined && (!Number.isInteger(join[field]) || join[field] < (field === "sampleDepth" ? 1 : 0))) errors.push(`${objectPrefix}.runtimeJoin.${field} must be ${field === "sampleDepth" ? "a positive" : "a non-negative"} integer.`);
        for (const field of ["minimumUniquePixelRatio", "maximumBoundaryColorDelta"]) if (join[field] !== undefined && (!isFiniteNumber(join[field]) || join[field] < 0 || join[field] > 1)) errors.push(`${objectPrefix}.runtimeJoin.${field} must be from 0 through 1.`);
        for (const field of ["requireExactSpawn", "requireClearLanding"]) if (join[field] !== undefined && typeof join[field] !== "boolean") errors.push(`${objectPrefix}.runtimeJoin.${field} must be boolean.`);
      }
    }
    if (object.z !== undefined && !isFiniteNumber(object.z)) errors.push(`${objectPrefix}.z must be finite.`);
    if (object.supportZ !== undefined && !isFiniteNumber(object.supportZ)) errors.push(`${objectPrefix}.supportZ must be finite.`);
    if (object.requiresSupport !== undefined && typeof object.requiresSupport !== "boolean") errors.push(`${objectPrefix}.requiresSupport must be boolean.`);
    if (object.groundAnchor !== undefined) {
      if (!object.groundAnchor || typeof object.groundAnchor !== "object" || Array.isArray(object.groundAnchor)) errors.push(`${objectPrefix}.groundAnchor must be an object.`);
      else for (const field of ["offsetX", "offsetY"]) if (!isFiniteNumber(object.groundAnchor[field])) errors.push(`${objectPrefix}.groundAnchor.${field} must be finite.`);
    }
    if (object.supportFootprint !== undefined) {
      if (!object.supportFootprint || typeof object.supportFootprint !== "object" || Array.isArray(object.supportFootprint)) errors.push(`${objectPrefix}.supportFootprint must be an object.`);
      else {
        for (const field of ["offsetX", "offsetY", "width", "height"]) if (!isFiniteNumber(object.supportFootprint[field])) errors.push(`${objectPrefix}.supportFootprint.${field} must be finite.`);
        if (isFiniteNumber(object.supportFootprint.width) && object.supportFootprint.width <= 0) errors.push(`${objectPrefix}.supportFootprint.width must be greater than zero.`);
        if (isFiniteNumber(object.supportFootprint.height) && object.supportFootprint.height <= 0) errors.push(`${objectPrefix}.supportFootprint.height must be greater than zero.`);
      }
    }
    if (object.supportContact !== undefined) {
      const contact = object.supportContact;
      if (!contact || typeof contact !== "object" || Array.isArray(contact)) errors.push(`${objectPrefix}.supportContact must be an object.`);
      else {
        if (!["floor", "surface", "free"].includes(contact.mode)) errors.push(`${objectPrefix}.supportContact.mode is not supported.`);
        if (contact.mode === "surface" && (typeof contact.surfaceId !== "string" || !contact.surfaceId)) errors.push(`${objectPrefix}.supportContact.surfaceId is required for surface mode.`);
        if (contact.offset !== undefined && !isFiniteNumber(contact.offset)) errors.push(`${objectPrefix}.supportContact.offset must be finite.`);
        if (contact.tolerance !== undefined && (!isFiniteNumber(contact.tolerance) || contact.tolerance < 0)) errors.push(`${objectPrefix}.supportContact.tolerance must be a non-negative finite number.`);
      }
    }
    if (object.collider !== undefined) {
      const collider = object.collider;
      if (!collider || typeof collider !== "object" || Array.isArray(collider)) errors.push(`${objectPrefix}.collider must be an object.`);
      else {
        if (typeof collider.enabled !== "boolean") errors.push(`${objectPrefix}.collider.enabled must be boolean.`);
        for (const field of ["offsetX", "offsetY", "width", "height"]) if (!isFiniteNumber(collider[field])) errors.push(`${objectPrefix}.collider.${field} must be finite.`);
        if (isFiniteNumber(collider.width) && collider.width <= 0) errors.push(`${objectPrefix}.collider.width must be greater than zero.`);
        if (isFiniteNumber(collider.height) && collider.height <= 0) errors.push(`${objectPrefix}.collider.height must be greater than zero.`);
        if (collider.trigger !== undefined && typeof collider.trigger !== "boolean") errors.push(`${objectPrefix}.collider.trigger must be boolean.`);
        if (collider.oneWay !== undefined && typeof collider.oneWay !== "boolean") errors.push(`${objectPrefix}.collider.oneWay must be boolean.`);
      }
    }
  });
  const players = objects.filter((object) => object?.kind === "player");
  const spawns = objects.filter((object) => object?.kind === "spawn");
  if (!players.length && options.playerRequired !== false) warnings.push(`${prefix} has no player, so player locomotion and collision-driven interactions cannot run.`);
  if (players.length > 1) warnings.push(`${prefix} has multiple players; only the first is controlled.`);
  if (players.length && !spawns.length) warnings.push(`${prefix} has no spawn; respawn uses the player's original position.`);
}

function projectRequiresPlayerActor(project) {
  const playerActionIds = new Set(["move-left", "move-right", "move-up", "move-down", "jump", "dash", "dodge", "sprint"]);
  const playerAnimationStates = new Set(["run", "jump", "fall", "travel", "dash", "dodge", "skate", "grind"]);
  if ((project.inputActions ?? []).some((action) => playerActionIds.has(action?.id) || playerAnimationStates.has(action?.animationState))) return true;
  const program = project.gameplayProgram;
  const effects = [
    ...(program?.rules ?? []).flatMap((rule) => rule?.effects ?? []),
    ...(program?.choicePages ?? []).flatMap((page) => (page?.choices ?? []).flatMap((choice) => choice?.effects ?? [])),
  ];
  if (effects.some((effect) => ["impulse-player", "respawn"].includes(effect?.type))) return true;
  const maps = project.maps?.length ? project.maps : [project];
  return maps.some((map) => (map.traversalPaths ?? []).length > 0 || (map.objects ?? []).some((object) => ["coin", "hazard", "goal"].includes(object?.kind)));
}

function validateTraversalPaths(paths, prefix, map, errors) {
  if (paths === undefined) return;
  if (!Array.isArray(paths)) {
    errors.push(`${prefix} must be an array when provided.`);
    return;
  }
  const ids = new Set();
  for (const [index, path] of paths.entries()) {
    const pathPrefix = `${prefix}[${index}]`;
    if (!path || typeof path !== "object" || Array.isArray(path)) {
      errors.push(`${pathPrefix} must be an object.`);
      continue;
    }
    if (typeof path.id !== "string" || !path.id) errors.push(`${pathPrefix}.id must be a non-empty string.`);
    else if (ids.has(path.id)) errors.push(`${pathPrefix}.id duplicates ${path.id}.`);
    else ids.add(path.id);
    if (typeof path.name !== "string" || !path.name.trim()) errors.push(`${pathPrefix}.name must be a non-empty string.`);
    if (!new Set(["rail", "grind", "zipline", "route"]).has(path.kind)) errors.push(`${pathPrefix}.kind must be rail, grind, zipline, or route.`);
    if (path.collisionOwner !== "authored-map") errors.push(`${pathPrefix}.collisionOwner must be authored-map.`);
    if (!Array.isArray(path.points) || path.points.length < 2) errors.push(`${pathPrefix}.points must contain at least two control points.`);
    else for (const [pointIndex, point] of path.points.entries()) {
      const pointPrefix = `${pathPrefix}.points[${pointIndex}]`;
      if (!point || typeof point !== "object" || Array.isArray(point)) {
        errors.push(`${pointPrefix} must be an object.`);
        continue;
      }
      if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y)) errors.push(`${pointPrefix}.x and .y must be finite.`);
      if (isFiniteNumber(point.x) && (point.x < 0 || point.x > map.width)) errors.push(`${pointPrefix}.x must stay inside the map.`);
      if (isFiniteNumber(point.y) && (point.y < 0 || point.y > map.height)) errors.push(`${pointPrefix}.y must stay inside the map.`);
      if (point.z !== undefined && !isFiniteNumber(point.z)) errors.push(`${pointPrefix}.z must be finite when provided.`);
    }
    if (!isFiniteNumber(path.entryRadius) || path.entryRadius <= 0) errors.push(`${pathPrefix}.entryRadius must be greater than zero.`);
    if (!isFiniteNumber(path.minimumEntrySpeed) || path.minimumEntrySpeed < 0) errors.push(`${pathPrefix}.minimumEntrySpeed must be zero or greater.`);
    if (path.entryZTolerance !== undefined && (!isFiniteNumber(path.entryZTolerance) || path.entryZTolerance < 0)) errors.push(`${pathPrefix}.entryZTolerance must be zero or greater when provided.`);
    if (path.routeLayer !== undefined && (typeof path.routeLayer !== "string" || !path.routeLayer)) errors.push(`${pathPrefix}.routeLayer must be a non-empty string when provided.`);
    if (!new Set(["both", "forward", "reverse"]).has(path.direction)) errors.push(`${pathPrefix}.direction must be both, forward, or reverse.`);
    if (path.enabled !== undefined && typeof path.enabled !== "boolean") errors.push(`${pathPrefix}.enabled must be boolean when provided.`);
    if (path.acceleration !== undefined && !isFiniteNumber(path.acceleration)) errors.push(`${pathPrefix}.acceleration must be finite when provided.`);
    if (path.maximumSpeed !== undefined && (!isFiniteNumber(path.maximumSpeed) || path.maximumSpeed <= 0)) errors.push(`${pathPrefix}.maximumSpeed must be greater than zero when provided.`);
    if (path.exitImpulse !== undefined) {
      if (!path.exitImpulse || typeof path.exitImpulse !== "object" || Array.isArray(path.exitImpulse)) errors.push(`${pathPrefix}.exitImpulse must be an object.`);
      else for (const field of ["x", "y", "z"]) if (path.exitImpulse[field] !== undefined && !isFiniteNumber(path.exitImpulse[field])) errors.push(`${pathPrefix}.exitImpulse.${field} must be finite.`);
    }
    if (path.transferPathIds !== undefined && (!Array.isArray(path.transferPathIds) || path.transferPathIds.some((id) => typeof id !== "string" || !id))) errors.push(`${pathPrefix}.transferPathIds must contain non-empty strings.`);
    if (path.bailBehavior !== undefined && !new Set(["drop", "launch", "reset", "continue"]).has(path.bailBehavior)) errors.push(`${pathPrefix}.bailBehavior is not supported.`);
  }
  for (const [index, path] of paths.entries()) {
    for (const transferId of path?.transferPathIds ?? []) if (!ids.has(transferId)) errors.push(`${prefix}[${index}].transferPathIds references missing path ${transferId}.`);
  }
}

function validateAuthoredEvidence(project, errors) {
  const collections = [
    { field: "featureContracts", maximum: 128 },
    { field: "acceptanceTests", maximum: 256 },
  ];
  for (const { field, maximum } of collections) {
    const records = project[field];
    if (records === undefined) continue;
    if (!Array.isArray(records)) {
      errors.push(`${field} must be an array when provided.`);
      continue;
    }
    if (records.length > maximum) errors.push(`${field} must contain at most ${maximum} records.`);
    const ids = new Set();
    for (const [index, record] of records.entries()) {
      const prefix = `${field}[${index}]`;
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        errors.push(`${prefix} must be an object.`);
        continue;
      }
      const id = String(record.id ?? "").trim();
      if (!id || !STABLE_AUTHORED_ID_PATTERN.test(id)) errors.push(`${prefix}.id must be a stable non-empty ID.`);
      else if (ids.has(id)) errors.push(`${prefix}.id duplicates ${id}.`);
      else ids.add(id);
      if (record.name !== undefined && (typeof record.name !== "string" || !record.name.trim())) errors.push(`${prefix}.name must be a non-empty string when provided.`);
      if (field === "featureContracts" && record.acceptanceTests !== undefined) {
        try {
          normalizeStringIdList(record.acceptanceTests, `${prefix}.acceptanceTests`);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      if (field === "acceptanceTests") {
        if (record.assertion !== undefined && (typeof record.assertion !== "string" || !record.assertion.trim())) errors.push(`${prefix}.assertion must be a non-empty string when provided.`);
        for (const ownerField of ["featureId", "ownerId"]) if (record[ownerField] !== undefined) {
          const ownerId = String(record[ownerField] ?? "").trim();
          if (!ownerId || !STABLE_AUTHORED_ID_PATTERN.test(ownerId)) errors.push(`${prefix}.${ownerField} must be a stable non-empty ID when provided.`);
        }
        const executable = validateExecutableAcceptanceTest(record, { prefix });
        errors.push(...executable.errors);
      }
    }
  }
}

export function validateProject(project) {
  const errors = [];
  const warnings = [];
  if (!project || typeof project !== "object" || Array.isArray(project)) return { valid: false, errors: ["Project must be a JSON object."], warnings };
  if (project.schemaVersion !== undefined && project.schemaVersion !== LOOPLAB_PROJECT_SCHEMA_VERSION) errors.push(`schemaVersion must be ${LOOPLAB_PROJECT_SCHEMA_VERSION}.`);
  if (typeof project.name !== "string" || !project.name.trim()) errors.push("Project name must be a non-empty string.");
  if (project.doctorProfile !== undefined && !new Set(["prototype", "production"]).has(project.doctorProfile)) errors.push("doctorProfile must be prototype or production.");
  if (project.runtimeProfile !== undefined) {
    if (!project.runtimeProfile || typeof project.runtimeProfile !== "object" || Array.isArray(project.runtimeProfile)) errors.push("runtimeProfile must be an object when provided.");
    else {
      if (project.runtimeProfile.dimension !== "2d") errors.push("runtimeProfile.dimension must be 2d. LoopLab does not author 3D projects.");
      if (!LOOPLAB_2D_FRAMEWORKS.has(project.runtimeProfile.framework)) errors.push("runtimeProfile.framework must be standalone, canvas, phaser, pixi, or melon.");
    }
  }
  const workLedgerValidation = validateAgentWorkLedger(project.agentWorkLedger);
  errors.push(...workLedgerValidation.errors);
  warnings.push(...workLedgerValidation.warnings);
  const changeFeedValidation = validateAgentChangeFeed(project.authoring?.agentChangeFeed);
  errors.push(...changeFeedValidation.errors);
  warnings.push(...changeFeedValidation.warnings);
  if (project.designBrief !== undefined) errors.push(...validateDirectedGameBrief(project.designBrief));
  const visualIdentityValidation = inspectVisualIdentity(project);
  errors.push(...visualIdentityValidation.errors);
  warnings.push(...visualIdentityValidation.warnings);
  if (project.inputActions !== undefined) {
    if (!Array.isArray(project.inputActions)) errors.push("inputActions must be an array when provided.");
    else {
      if (project.inputActions.length > 64) errors.push("inputActions must contain at most 64 actions.");
      const actionIds = new Set();
      for (const [index, action] of project.inputActions.entries()) {
        const prefix = `inputActions[${index}]`;
        if (!action || typeof action !== "object" || Array.isArray(action)) {
          errors.push(`${prefix} must be an object.`);
          continue;
        }
        if (typeof action.id !== "string" || !action.id.trim()) errors.push(`${prefix}.id must be a non-empty string.`);
        else if (actionIds.has(action.id)) errors.push(`${prefix}.id duplicates ${action.id}.`);
        else actionIds.add(action.id);
        if (typeof action.label !== "string" || !action.label.trim()) errors.push(`${prefix}.label must be a non-empty string.`);
        if (!Array.isArray(action.bindings) || action.bindings.length === 0) errors.push(`${prefix}.bindings must contain at least one binding.`);
        else {
          const bindings = new Set();
          for (const binding of action.bindings) {
            if (typeof binding !== "string" || !binding.trim()) errors.push(`${prefix}.bindings must contain non-empty strings.`);
            else if (bindings.has(binding)) errors.push(`${prefix}.bindings duplicates ${binding}.`);
            else bindings.add(binding);
          }
        }
        if (action.animationState !== undefined && (typeof action.animationState !== "string" || !action.animationState.trim())) errors.push(`${prefix}.animationState must be a non-empty string when provided.`);
        if (action.onboarding !== undefined && typeof action.onboarding !== "boolean") errors.push(`${prefix}.onboarding must be boolean when provided.`);
        if (action.replayEvent !== undefined && typeof action.replayEvent !== "boolean") errors.push(`${prefix}.replayEvent must be boolean when provided.`);
      }
    }
  }
  if (project.gameplayProgram !== undefined) {
    const gameplayInspection = inspectGameplayProgram(project);
    errors.push(...gameplayInspection.errors);
    warnings.push(...gameplayInspection.warnings);
  }
  if (project.combatProgram !== undefined) {
    const combatInspection = inspectCombatProgram(project);
    errors.push(...combatInspection.errors.map((message) => `combatProgram: ${message}`));
    warnings.push(...combatInspection.warnings.map((message) => `combatProgram: ${message}`));
  }
  if (project.actorProgram !== undefined) {
    const actorInspection = inspectActorProgram(project);
    errors.push(...actorInspection.errors.map((message) => `actorProgram: ${message}`));
    warnings.push(...actorInspection.warnings.map((message) => `actorProgram: ${message}`));
  }
  if (!(project.maps?.length) && project.collisionGeometry !== undefined) {
    const collisionInspection = inspectCollisionGeometry(project, project.collisionGeometry, { mapId: project.activeMapId });
    errors.push(...collisionInspection.errors.map((message) => `collisionGeometry: ${message}`));
    warnings.push(...collisionInspection.warnings.map((message) => `collisionGeometry: ${message}`));
  }
  if (!(project.maps?.length) && project.elevationTransitions !== undefined) {
    const elevationInspection = inspectElevationTransitions(project, project.elevationTransitions, { mapId: project.activeMapId });
    errors.push(...elevationInspection.errors.map((message) => `elevationTransitions: ${message}`));
    warnings.push(...elevationInspection.warnings.map((message) => `elevationTransitions: ${message}`));
  }
  if (!(project.maps?.length) && project.tileProgram !== undefined) {
    const tileInspection = inspectTileProgram(project, project.tileProgram, { mapId: project.activeMapId });
    errors.push(...tileInspection.errors.map((finding) => `tileProgram: ${finding.message}`));
    warnings.push(...tileInspection.warnings.map((finding) => `tileProgram: ${finding.message}`));
  }
  if (!(project.maps?.length) && project.worldStream !== undefined) {
    const worldStreamInspection = inspectWorldStream(project, project.worldStream, { mapId: project.activeMapId });
    errors.push(...worldStreamInspection.issues.filter((finding) => finding.severity === "error").map((finding) => `worldStream: ${finding.message}`));
    warnings.push(...worldStreamInspection.issues.filter((finding) => finding.severity === "warning").map((finding) => `worldStream: ${finding.message}`));
  }
  if (project.narrativeContract !== undefined) {
    const narrativeInspection = inspectNarrativeContract(project);
    errors.push(...narrativeInspection.errors);
    warnings.push(...narrativeInspection.warnings);
  }
  if (project.presentationProgram !== undefined) {
    const presentationInspection = inspectPresentationProgram(project);
    errors.push(...presentationInspection.errors);
    warnings.push(...presentationInspection.warnings);
  }
  if (project.tuningContract !== undefined) {
    const tuningInspection = inspectTuningContract(project);
    errors.push(...tuningInspection.errors);
    warnings.push(...tuningInspection.warnings);
  }
  if (project.structuralScaffoldContract !== undefined) {
    const scaffoldInspection = inspectStructuralScaffoldContract(project);
    errors.push(...scaffoldInspection.errors);
    warnings.push(...scaffoldInspection.warnings);
  }
  if (project.spatialLayoutContract !== undefined) {
    const spatialLayoutInspection = inspectSpatialLayoutContract(project);
    errors.push(...spatialLayoutInspection.errors);
    warnings.push(...spatialLayoutInspection.warnings);
  }
  if (project.movementTuning !== undefined) {
    const tuning = project.movementTuning;
    if (!tuning || typeof tuning !== "object" || Array.isArray(tuning)) errors.push("movementTuning must be an object when provided.");
    else {
      for (const field of ["maxRunSpeed", "groundAcceleration", "airAcceleration", "groundFriction", "jumpVelocity", "jumpCutVelocity", "apexGravityScale", "fallGravityScale", "apexThreshold"]) {
        if (!isFiniteNumber(tuning[field]) || tuning[field] < 0) errors.push(`movementTuning.${field} must be a non-negative finite number.`);
      }
      for (const field of ["coyoteTicks", "jumpBufferTicks"]) if (!Number.isInteger(tuning[field]) || tuning[field] < 0 || tuning[field] > 30) errors.push(`movementTuning.${field} must be an integer from 0 through 30.`);
    }
  }
  if (project.replay !== undefined) {
    const replay = project.replay;
    if (!replay || typeof replay !== "object" || Array.isArray(replay)) errors.push("replay must be an object when provided.");
    else {
      if (typeof replay.version !== "string" || !replay.version) errors.push("replay.version must be a non-empty string.");
      if (!isFiniteNumber(replay.tickRate) || replay.tickRate < LOOPLAB_MIN_TICK_RATE || replay.tickRate > 240) errors.push(`replay.tickRate must be from ${LOOPLAB_MIN_TICK_RATE} through 240.`);
      if (!isFiniteNumber(replay.seed)) errors.push("replay.seed must be a finite number.");
      if (!Array.isArray(replay.cases)) errors.push("replay.cases must be an array.");
      else {
        const replayIds = new Set();
        for (const [index, replayCase] of replay.cases.entries()) {
          const prefix = `replay.cases[${index}]`;
          errors.push(...validateReplayCase(replayCase, { prefix, allowLegacy: true }));
          if (replayCase && replayCase.tickCount === undefined && replayCase.inputs === undefined) warnings.push(`${prefix} contains legacy hash metadata and must be rerecorded as an executable fixture.`);
          if (typeof replayCase?.id === "string" && replayCase.id) {
            if (replayIds.has(replayCase.id)) errors.push(`${prefix}.id duplicates ${replayCase.id}.`);
            else replayIds.add(replayCase.id);
          }
        }
      }
      if (replay.changeLog !== undefined) {
        if (!Array.isArray(replay.changeLog)) errors.push("replay.changeLog must be an array when provided.");
        else {
          if (replay.changeLog.length > 128) errors.push("replay.changeLog must contain at most 128 entries.");
          let previousSequence = 0;
          for (const [index, entry] of replay.changeLog.entries()) {
            const prefix = `replay.changeLog[${index}]`;
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) { errors.push(`${prefix} must be an object.`); continue; }
            if (!Number.isInteger(entry.sequence) || entry.sequence <= previousSequence) errors.push(`${prefix}.sequence must be a strictly increasing positive integer.`);
            else previousSequence = entry.sequence;
            if (entry.action !== "removed") errors.push(`${prefix}.action must be removed.`);
            if (typeof entry.caseId !== "string" || !entry.caseId.trim()) errors.push(`${prefix}.caseId must be a non-empty string.`);
            if (!Number.isInteger(entry.revision) || entry.revision < 1) errors.push(`${prefix}.revision must be a positive integer.`);
            if (typeof entry.changeReason !== "string" || !entry.changeReason.trim() || entry.changeReason.length > 1200) errors.push(`${prefix}.changeReason must be 1 through 1200 characters.`);
            if (typeof entry.sourceDigest !== "string" || !/^source-[0-9a-f]{64}$/.test(entry.sourceDigest)) errors.push(`${prefix}.sourceDigest must be a Project Doctor source digest.`);
            if (typeof entry.priorCaseDigest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(entry.priorCaseDigest)) errors.push(`${prefix}.priorCaseDigest must be a canonical SHA-256 digest.`);
          }
        }
      }
    }
  }
  validateAuthoredEvidence(project, errors);
  validateMapFields(project, "Project", errors);
  if (!Array.isArray(project.objects)) errors.push("Project objects must be an array.");

  if (project.iteration !== undefined) {
    const iteration = project.iteration;
    if (!iteration || typeof iteration !== "object" || Array.isArray(iteration)) errors.push("iteration must be an object when provided.");
    else {
      if (typeof iteration.id !== "string" || !iteration.id) errors.push("iteration.id must be a non-empty string.");
      if (!new Set(["candidate", "verified", "promoted", "rejected", "rolled-back"]).has(iteration.status)) errors.push("iteration.status is not supported.");
      if (iteration.readOnly !== undefined && typeof iteration.readOnly !== "boolean") errors.push("iteration.readOnly must be boolean.");
      if (iteration.status === "verified" || iteration.status === "promoted") {
        const verification = iteration.verification;
        if (!verification || typeof verification !== "object" || Array.isArray(verification)) errors.push("verified iterations require a Project Doctor verification receipt.");
        else {
          for (const field of ["digest", "sourceDigest", "profile", "verifiedAt"]) if (typeof verification[field] !== "string" || !verification[field]) errors.push(`iteration.verification.${field} must be a non-empty string.`);
          if (!new Set(["prototype", "production"]).has(verification.profile)) errors.push("iteration.verification.profile is not supported.");
          const evidence = validateVerificationEvidence(verification.evidenceRefs, { sourceDigest: verification.sourceDigest, ...verificationCoverageRequirements(project) });
          for (const evidenceError of evidence.errors) errors.push(`iteration.verification.${evidenceError}`);
        }
        if (typeof iteration.verifiedAt !== "string" || !iteration.verifiedAt) errors.push("verified iterations require iteration.verifiedAt.");
      }
      if (iteration.status === "promoted" && (typeof iteration.promotedAt !== "string" || !iteration.promotedAt)) errors.push("promoted iterations require iteration.promotedAt.");
    }
  }

  if (project.iterationHistory !== undefined) {
    if (!Array.isArray(project.iterationHistory)) errors.push("iterationHistory must be an array when provided.");
    else {
      const ids = new Set();
      if (project.iterationHistory.length > ITERATION_HISTORY_LIMIT) errors.push(`iterationHistory must contain at most ${ITERATION_HISTORY_LIMIT} entries.`);
      for (const [index, entry] of project.iterationHistory.entries()) {
        const prefix = `iterationHistory[${index}]`;
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) { errors.push(`${prefix} must be an object.`); continue; }
        if (typeof entry.id !== "string" || !entry.id) errors.push(`${prefix}.id must be a non-empty string.`);
        else if (ids.has(entry.id)) errors.push(`${prefix}.id duplicates ${entry.id}.`);
        else ids.add(entry.id);
        if (typeof entry.status !== "string" || !entry.status) errors.push(`${prefix}.status must be a non-empty string.`);
        if (entry.sourceDigest !== undefined && (typeof entry.sourceDigest !== "string" || !entry.sourceDigest)) errors.push(`${prefix}.sourceDigest must be a non-empty string when provided.`);
        if (entry.score !== undefined && !isFiniteNumber(entry.score)) errors.push(`${prefix}.score must be finite when provided.`);
        if (entry.doctorScore !== undefined && !isFiniteNumber(entry.doctorScore)) errors.push(`${prefix}.doctorScore must be finite when provided.`);
        if (entry.restorable !== undefined && typeof entry.restorable !== "boolean") errors.push(`${prefix}.restorable must be boolean when provided.`);
      }
    }
  }

  if (project.iterationArchive !== undefined) {
    const archive = project.iterationArchive;
    if (!archive || typeof archive !== "object" || Array.isArray(archive)) errors.push("iterationArchive must be an object when provided.");
    else {
      if (archive.version !== 1) errors.push("iterationArchive.version must be 1.");
      if (typeof archive.lineageId !== "string" || !archive.lineageId) errors.push("iterationArchive.lineageId must be a non-empty string.");
      if (!Array.isArray(archive.snapshots)) errors.push("iterationArchive.snapshots must be an array.");
      else {
        if (archive.snapshots.length > ITERATION_SNAPSHOT_LIMIT) errors.push(`iterationArchive.snapshots must contain at most ${ITERATION_SNAPSHOT_LIMIT} entries.`);
        const snapshotIds = new Set();
        for (const [index, snapshot] of archive.snapshots.entries()) {
          const prefix = `iterationArchive.snapshots[${index}]`;
          if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) { errors.push(`${prefix} must be an object.`); continue; }
          if (typeof snapshot.id !== "string" || !snapshot.id) errors.push(`${prefix}.id must be a non-empty string.`);
          else if (snapshotIds.has(snapshot.id)) errors.push(`${prefix}.id duplicates ${snapshot.id}.`);
          else snapshotIds.add(snapshot.id);
          if (typeof snapshot.sourceDigest !== "string" || !snapshot.sourceDigest) errors.push(`${prefix}.sourceDigest must be a non-empty string.`);
          if (!snapshot.project || typeof snapshot.project !== "object" || Array.isArray(snapshot.project)) errors.push(`${prefix}.project must be an object.`);
        }
      }
      if (!archive.assetBlobs || typeof archive.assetBlobs !== "object" || Array.isArray(archive.assetBlobs)) errors.push("iterationArchive.assetBlobs must be an object.");
      else for (const [key, value] of Object.entries(archive.assetBlobs)) {
        if (!key || typeof value !== "string" || !value.startsWith("data:")) errors.push(`iterationArchive.assetBlobs.${key || "<empty>"} must be a data URL string.`);
      }
    }
  }

  if (project.build !== undefined) {
    if (!project.build || typeof project.build !== "object" || Array.isArray(project.build)) errors.push("build must be an object when provided.");
    else if (typeof project.build.id !== "string" || !project.build.id) errors.push("build.id must be a non-empty string.");
  }

  const assetIds = new Set();
  if (project.assets !== undefined && !Array.isArray(project.assets)) errors.push("Project assets must be an array when provided.");
  for (const [index, asset] of (project.assets ?? []).entries()) {
    const prefix = `assets[${index}]`;
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) { errors.push(`${prefix} must be an object.`); continue; }
    if (typeof asset.id !== "string" || !asset.id) errors.push(`${prefix}.id must be a non-empty string.`);
    else if (assetIds.has(asset.id)) errors.push(`${prefix}.id duplicates ${asset.id}.`);
    else assetIds.add(asset.id);
    if (!["tileset", "sprite"].includes(asset.type)) errors.push(`${prefix}.type must be tileset or sprite.`);
    if (typeof asset.name !== "string" || !asset.name.trim()) errors.push(`${prefix}.name must be a non-empty string.`);
    const isPngData = typeof asset.dataUrl === "string" && asset.dataUrl.startsWith("data:image/png;base64,");
    const isTrustedScaffoldSvg = typeof asset.dataUrl === "string" && asset.dataUrl.startsWith("data:image/svg+xml;base64,") && asset.generator?.kind === "directed-scaffold";
    if (!isPngData && !isTrustedScaffoldSvg) errors.push(`${prefix}.dataUrl must be a PNG data URL or a trusted built-in scaffold SVG data URL.`);
    for (const field of ["width", "height", "frameWidth", "frameHeight", "frames", "columns"]) if (!isFiniteNumber(asset[field]) || asset[field] <= 0) errors.push(`${prefix}.${field} must be greater than zero.`);
    if (asset.collisionPolicy !== undefined && asset.collisionPolicy !== "authored-only") errors.push(`${prefix}.collisionPolicy must be authored-only.`);
  }

  const playerRequired = projectRequiresPlayerActor(project);
  if (Array.isArray(project.objects)) validateObjects(project.objects, "objects", assetIds, errors, warnings, { playerRequired });
  validateTraversalPaths(project.traversalPaths, "traversalPaths", project, errors);
  if (!(project.maps?.length)) {
    const navigation = analyzeNavigationMap({ ...project, id: project.activeMapId ?? "map-main" });
    for (const issue of navigation.issues) (issue.severity === "error" ? errors : warnings).push(`navigation.${issue.code}: ${issue.message}`);
  }
  const mapIds = new Set();
  const worldStreamTemplateMapIds = new Set((project.maps ?? []).flatMap((map) => map?.worldStream?.templates ?? []).map((template) => template?.mapId).filter(Boolean));
  if (project.maps !== undefined && !Array.isArray(project.maps)) errors.push("Project maps must be an array when provided.");
  for (const [index, map] of (project.maps ?? []).entries()) {
    const prefix = `maps[${index}]`;
    if (!map || typeof map !== "object" || Array.isArray(map)) { errors.push(`${prefix} must be an object.`); continue; }
    if (typeof map.id !== "string" || !map.id) errors.push(`${prefix}.id must be a non-empty string.`);
    else if (mapIds.has(map.id)) errors.push(`${prefix}.id duplicates ${map.id}.`);
    else mapIds.add(map.id);
    validateMapFields(map, prefix, errors);
    validateObjects(map.objects, `${prefix}.objects`, assetIds, errors, warnings, { playerRequired: playerRequired && !worldStreamTemplateMapIds.has(map.id) });
    validateTraversalPaths(map.traversalPaths, `${prefix}.traversalPaths`, map, errors);
    const navigation = analyzeNavigationMap(map);
    for (const issue of navigation.issues) (issue.severity === "error" ? errors : warnings).push(`${prefix}.navigation.${issue.code}: ${issue.message}`);
    if (map.collisionGeometry !== undefined) {
      const collisionInspection = inspectCollisionGeometry(project, map.collisionGeometry, { mapId: map.id });
      errors.push(...collisionInspection.errors.map((message) => `${prefix}.collisionGeometry: ${message}`));
      warnings.push(...collisionInspection.warnings.map((message) => `${prefix}.collisionGeometry: ${message}`));
    }
    if (map.elevationTransitions !== undefined) {
      const elevationInspection = inspectElevationTransitions(project, map.elevationTransitions, { mapId: map.id });
      errors.push(...elevationInspection.errors.map((message) => `${prefix}.elevationTransitions: ${message}`));
      warnings.push(...elevationInspection.warnings.map((message) => `${prefix}.elevationTransitions: ${message}`));
    }
    if (map.tileProgram !== undefined) {
      const tileInspection = inspectTileProgram(project, map.tileProgram, { mapId: map.id });
      errors.push(...tileInspection.errors.map((finding) => `${prefix}.tileProgram: ${finding.message}`));
      warnings.push(...tileInspection.warnings.map((finding) => `${prefix}.tileProgram: ${finding.message}`));
    }
    if (map.worldStream !== undefined) {
      const worldStreamInspection = inspectWorldStream(project, map.worldStream, { mapId: map.id });
      errors.push(...worldStreamInspection.issues.filter((finding) => finding.severity === "error").map((finding) => `${prefix}.worldStream: ${finding.message}`));
      warnings.push(...worldStreamInspection.issues.filter((finding) => finding.severity === "warning").map((finding) => `${prefix}.worldStream: ${finding.message}`));
    }
  const motionBodyInspection = inspectMotionBodies(project);
  errors.push(...motionBodyInspection.errors.map((message) => `motionBody: ${message}`));
  warnings.push(...motionBodyInspection.warnings.map((message) => `motionBody: ${message}`));
  }
  if ((project.maps?.length ?? 0) > 0 && (!project.activeMapId || !mapIds.has(project.activeMapId))) errors.push("Project activeMapId must reference an existing map.");
  if ((project.maps?.length ?? 0) > 0 && project.startMapId !== undefined && !mapIds.has(project.startMapId)) errors.push("Project startMapId must reference an existing map.");
  if ((project.maps?.length ?? 0) > 0 && project.startMapId === undefined) warnings.push("Project startMapId is missing; the first map will be used as the player-facing start.");
  for (const [index, replayCase] of (project.replay?.cases ?? []).entries()) {
    if (replayCase.startMapId !== undefined && (project.maps?.length ?? 0) > 0 && !mapIds.has(replayCase.startMapId)) errors.push(`replay.cases[${index}].startMapId must reference an existing map.`);
    if (replayCase.startSpawnId !== undefined) {
      const startMap = (project.maps ?? []).find((map) => map.id === (replayCase.startMapId ?? project.startMapId));
      if (startMap && !(startMap.objects ?? []).some((object) => object.kind === "spawn" && object.id === replayCase.startSpawnId)) errors.push(`replay.cases[${index}].startSpawnId must reference a spawn in its start map.`);
    }
  }

  for (const [index, reference] of (project.visualReferences ?? []).entries()) {
    const prefix = `visualReferences[${index}]`;
    if (!reference || typeof reference !== "object") { errors.push(`${prefix} must be an object.`); continue; }
    if (typeof reference.id !== "string" || !reference.id) errors.push(`${prefix}.id must be a non-empty string.`);
    if (typeof reference.mapId !== "string" || ((project.maps?.length ?? 0) > 0 && !mapIds.has(reference.mapId))) errors.push(`${prefix}.mapId must reference an existing map.`);
    for (const field of ["x", "y", "width", "height"]) if (!isFiniteNumber(reference[field])) errors.push(`${prefix}.${field} must be finite.`);
    if (!Array.isArray(reference.signature) || reference.signature.length === 0 || reference.signature.some((value) => !isFiniteNumber(value))) errors.push(`${prefix}.signature must be a numeric array.`);
  }

  const maps = project.maps?.length ? project.maps : [{ id: project.activeMapId ?? "map-main", objects: project.objects ?? [] }];
  for (const map of maps) {
    for (const portal of (map.objects ?? []).filter((object) => object.kind === "portal")) {
      const target = maps.find((candidate) => candidate.id === portal.targetMapId);
      if (!target) errors.push(`Portal ${portal.id} must reference an existing targetMapId.`);
      else if (!target.objects.some((object) => object.kind === "spawn" && object.id === portal.targetSpawnId)) errors.push(`Portal ${portal.id} must reference an existing targetSpawnId.`);
    }
  }
  const runtimeJoinPlan = buildRuntimeJoinPlan(project);
  const saveInspection = inspectSaveProgram(project, project.saveProgram, { sourceDigest: doctorSourceDigest(project) });
  const gameShellInspection = inspectGameShell(project, project.gameShell, { sourceDigest: doctorSourceDigest(project), strict: project.doctorProfile === "production" });
  errors.push(...saveInspection.errors.map((message) => `saveProgram: ${message}`));
  warnings.push(...saveInspection.warnings.map((message) => `saveProgram: ${message}`));
  errors.push(...gameShellInspection.errors.map((message) => `gameShell: ${message}`));
  warnings.push(...gameShellInspection.warnings.map((message) => `gameShell: ${message}`));
  const communityExchangeInspection = inspectCommunityExchanges(project);
  warnings.push(...communityExchangeInspection.issues.filter((issue) => issue.severity === "warning").map((issue) => `communityExchange.${issue.code}: ${issue.message}`));
  for (const issue of runtimeJoinPlan.issues) errors.push(`runtimeJoin.${issue.code}: ${issue.message}`);
  return { valid: errors.length === 0, errors, warnings };
}

function findObjectIndex(project, command) {
  if (typeof command.id === "string") return project.objects.findIndex((object) => object.id === command.id);
  if (typeof command.name === "string") return project.objects.findIndex((object) => object.name === command.name);
  throw new Error("Object command requires an id or name selector.");
}

export function summarizeProject(project) {
  const campaign = summarizeAgentCampaign(project);
  const workLedger = getAgentWorkLedger(project, { includeEvents: false, limit: 1 });
  return {
    name: project.name,
    size: { width: project.width, height: project.height },
    controlMode: project.controlMode,
    objectCount: campaign.objectCount,
    mapCount: campaign.mapCount,
    assetCount: project.assets?.length ?? 0,
    activeMapId: project.activeMapId ?? "map-main",
    iteration: project.iteration ? {
      id: project.iteration.id ?? null,
      parentId: project.iteration.parentId ?? null,
      status: project.iteration.status ?? null,
      track: project.iteration.track ?? null,
      condition: project.iteration.condition ?? null,
      createdAt: project.iteration.createdAt ?? null,
      readOnly: project.iteration.readOnly === true,
      objectiveLength: String(project.iteration.objective ?? "").length,
    } : null,
    iterationLedger: {
      lineageId: project.iterationArchive?.lineageId ?? null,
      entryCount: project.iterationHistory?.length ?? 0,
      snapshotCount: project.iterationArchive?.snapshots?.length ?? 0,
    },
    buildId: project.build?.id ?? null,
    agentWorkLedger: {
      schemaVersion: workLedger.ledgerSchemaVersion,
      digest: workLedger.ledgerDigest,
      revision: workLedger.revision,
      total: workLedger.total,
      counts: workLedger.counts,
      activeClaims: workLedger.activeClaims,
      expiredClaims: workLedger.expiredClaims,
    },
    gameplayProgram: project.gameplayProgram ? {
      variableCount: project.gameplayProgram.variables?.length ?? 0,
      ruleCount: project.gameplayProgram.rules?.length ?? 0,
      choicePageCount: project.gameplayProgram.choicePages?.length ?? 0,
      choiceCount: (project.gameplayProgram.choicePages ?? []).reduce(
        (total, page) => total + (page?.choices?.length ?? 0),
        0,
      ),
      clockCount: project.gameplayProgram.clocks?.length ?? 0,
      hudBindingCount: project.gameplayProgram.hudBindings?.length ?? 0,
      initialChoicePageId: project.gameplayProgram.initialChoicePageId ?? null,
    } : null,
    combatProgram: project.combatProgram ? {
      enabled: project.combatProgram.enabled !== false,
      teamCount: project.combatProgram.teams?.length ?? 0,
      actorCount: project.combatProgram.actors?.length ?? 0,
      emitterCount: project.combatProgram.emitters?.length ?? 0,
      poolCapacity: (project.combatProgram.emitters ?? []).reduce((total, emitter) => total + Number(emitter?.poolSize || 0), 0),
      maxProjectiles: project.combatProgram.maxProjectiles ?? null,
      acceptanceTestCount: project.combatProgram.acceptanceTestIds?.length ?? 0,
    } : null,
    actorProgram: project.actorProgram ? {
      enabled: project.actorProgram.enabled !== false,
      actorCount: project.actorProgram.actors?.length ?? 0,
      patrolCount: (project.actorProgram.actors ?? []).filter((actor) => actor?.baseMode === "patrol").length,
      perceptionCount: (project.actorProgram.actors ?? []).filter((actor) => actor?.detectionMode && actor.detectionMode !== "none").length,
      cutsceneCount: (project.actorProgram.actors ?? []).filter((actor) => actor?.cutscene).length,
      acceptanceTestCount: project.actorProgram.acceptanceTestIds?.length ?? 0,
    } : null,
    collisionGeometry: (() => {
      const maps = project.maps?.length ? project.maps : [{ id: project.activeMapId ?? "map-main", collisionGeometry: project.collisionGeometry }];
      const reports = maps.map((map) => inspectCollisionGeometry(project, map.collisionGeometry, { mapId: map.id })).filter((report) => report.present);
      return reports.length ? {
        mapCount: reports.length,
        chainCount: reports.reduce((total, report) => total + report.chainCount, 0),
        segmentCount: reports.reduce((total, report) => total + report.segmentCount, 0),
        invalidMapCount: reports.filter((report) => !report.valid).length,
      } : null;
    })(),
    elevationTransitions: (() => {
      const maps = project.maps?.length ? project.maps : [{ id: project.activeMapId ?? "map-main", elevationTransitions: project.elevationTransitions }];
      const reports = maps.map((map) => inspectElevationTransitions(project, map.elevationTransitions, { mapId: map.id })).filter((report) => report.present);
      return reports.length ? {
        mapCount: reports.length,
        transitionCount: reports.reduce((total, report) => total + report.transitionCount, 0),
        segmentCount: reports.reduce((total, report) => total + report.segmentCount, 0),
        navigationBoundCount: reports.reduce((total, report) => total + report.navigationBoundCount, 0),
        collisionBoundCount: reports.reduce((total, report) => total + report.collisionBoundCount, 0),
        invalidMapCount: reports.filter((report) => !report.valid).length,
      } : null;
    })(),
    tilePrograms: (() => {
      const maps = project.maps?.length ? project.maps : [{ id: project.activeMapId ?? "map-main", tileProgram: project.tileProgram }];
      const reports = maps.map((map) => inspectTileProgram(project, map.tileProgram, { mapId: map.id })).filter((report) => report.present);
      return reports.length ? {
        mapCount: reports.length,
        layerCount: reports.reduce((total, report) => total + report.counts.layers, 0),
        collisionLayerCount: reports.reduce((total, report) => total + report.counts.collisionLayers, 0),
        storedCellCount: reports.reduce((total, report) => total + report.counts.storedCells, 0),
        unresolvedTerrainCellCount: reports.reduce((total, report) => total + report.counts.unresolvedTerrainCells, 0),
        invalidMapCount: reports.filter((report) => !report.valid).length,
      } : null;
    })(),
    worldStreams: (() => {
      const maps = project.maps?.length ? project.maps : [{ id: project.activeMapId ?? "map-main", worldStream: project.worldStream }];
      const reports = maps.map((map) => inspectWorldStream(project, map.worldStream, { mapId: map.id })).filter((report) => report.present);
      return reports.length ? {
        mapCount: reports.length,
        templateCount: reports.reduce((total, report) => total + report.templateCount, 0),
        plannedInstanceCount: reports.reduce((total, report) => total + report.plannedInstanceCount, 0),
        seamCount: reports.reduce((total, report) => total + report.seamCount, 0),
        invalidMapCount: reports.filter((report) => !report.valid).length,
        maximumResidentChunks: Math.max(...reports.map((report) => Number(report.residentWorstCase?.chunks || 0))),
        maximumDecodedRgbaBytes: Math.max(...reports.map((report) => Number(report.residentWorstCase?.decodedRgbaBytes || 0))),
      } : null;
    })(),
    narrativeContract: project.narrativeContract ? {
      status: project.narrativeContract.status ?? "draft",
      characterCount: project.narrativeContract.characters?.length ?? 0,
      lineCount: project.narrativeContract.lines?.length ?? 0,
      beatCount: project.narrativeContract.beats?.length ?? 0,
      requiredBeatCount: (project.narrativeContract.beats ?? []).filter((beat) => beat?.required === true).length,
      endingCount: project.narrativeContract.endings?.length ?? 0,
    } : null,
    presentationProgram: project.presentationProgram ? {
      status: project.presentationProgram.status ?? "draft",
      enabled: project.presentationProgram.enabled !== false,
      audioCueCount: project.presentationProgram.audio?.cues?.length ?? 0,
      motionCueCount: project.presentationProgram.motion?.cues?.length ?? 0,
      effectCount: (project.presentationProgram.motion?.cues ?? []).reduce((total, cue) => total + (cue?.effects?.length ?? 0), 0),
    } : null,
    gameShell: project.gameShell ? {
      status: project.gameShell.status ?? "draft",
      enabled: project.gameShell.enabled === true,
      startMode: project.gameShell.startMode ?? null,
      restartMode: project.gameShell.restartMode ?? null,
      settingsEnabled: project.gameShell.settings?.enabled === true,
      lossSource: project.gameShell.terminal?.lose?.source ?? "none",
      waived: project.gameShell.enabled === false && Boolean(project.gameShell.waiver?.reason),
    } : null,
    exportProfile: exportProfileId(project),
    saveProgram: project.saveProgram ? {
      schemaVersion: project.saveProgram.schemaVersion ?? null,
      enabled: project.saveProgram.enabled === true,
      portableCodes: project.saveProgram.portableCodes === true,
      hostedAutoSave: project.saveProgram.hosted?.autoSave === true,
      hostedRestoreOnBoot: project.saveProgram.hosted?.restoreOnBoot === true,
    } : null,
    tuningContract: project.tuningContract ? {
      status: project.tuningContract.status ?? "draft",
      parameterCount: project.tuningContract.parameters?.length ?? 0,
      objectiveCount: project.tuningContract.objectives?.length ?? 0,
      constraintCount: project.tuningContract.constraints?.length ?? 0,
      maxCandidates: project.tuningContract.search?.maxCandidates ?? null,
    } : null,
    structuralScaffoldContract: project.structuralScaffoldContract ? {
      status: project.structuralScaffoldContract.status ?? "draft",
      families: clone(project.structuralScaffoldContract.families ?? []),
      maxCandidates: project.structuralScaffoldContract.search?.maxCandidates ?? null,
      replacementPolicy: project.structuralScaffoldContract.constraints?.replacementPolicy ?? null,
    } : null,
    spatialLayoutContract: project.spatialLayoutContract ? {
      status: project.spatialLayoutContract.status ?? "draft",
      mapId: project.spatialLayoutContract.mapId ?? null,
      families: clone(project.spatialLayoutContract.families ?? []),
      pinnedObjectCount: project.spatialLayoutContract.pinnedObjectIds?.length ?? 0,
      maxCandidates: project.spatialLayoutContract.search?.maxCandidates ?? null,
      replacementPolicy: project.spatialLayoutContract.constraints?.replacementPolicy ?? null,
    } : null,
    traversalPathCount: campaign.traversalPathCount,
    navigation: campaign.navigation,
    byKind: campaign.byKind,
  };
}

function summarizeAgentHistoryEntry(entry) {
  return {
    id: entry?.id ?? null,
    parentId: entry?.parentId ?? null,
    status: entry?.status ?? null,
    score: Number.isFinite(Number(entry?.score)) ? Number(entry.score) : null,
    scoreKind: entry?.scoreKind ?? null,
    sourceDigest: entry?.sourceDigest ?? null,
    createdAt: entry?.createdAt ?? null,
    summary: typeof entry?.summary === "string" ? entry.summary.slice(0, 500) : null,
  };
}

function agentBriefChanges(project, currentSourceDigest, { sinceDigest, sinceTimestamp } = {}) {
  const history = Array.isArray(project.iterationHistory) ? project.iterationHistory : [];
  const requestedDigest = typeof sinceDigest === "string" && sinceDigest.trim() ? sinceDigest.trim() : null;
  const requestedTimestamp = typeof sinceTimestamp === "string" && sinceTimestamp.trim() ? sinceTimestamp.trim() : null;
  let entries = [];
  let baselineStatus = requestedDigest || requestedTimestamp ? "not-found" : "not-requested";
  if (requestedDigest) {
    if (requestedDigest === currentSourceDigest) baselineStatus = "current";
    else {
      const index = history.findIndex((entry) => entry?.sourceDigest === requestedDigest);
      if (index >= 0) {
        baselineStatus = "history-match";
        entries = history.slice(index + 1);
      }
    }
  }
  if (requestedTimestamp) {
    const parsed = Date.parse(requestedTimestamp);
    if (Number.isFinite(parsed)) {
      baselineStatus = baselineStatus === "not-found" || baselineStatus === "not-requested" ? "timestamp" : baselineStatus;
      const byTime = history.filter((entry) => Number.isFinite(Date.parse(entry?.createdAt ?? "")) && Date.parse(entry.createdAt) > parsed);
      entries = entries.length ? entries.filter((entry) => byTime.includes(entry)) : byTime;
    } else {
      baselineStatus = "invalid-timestamp";
    }
  }
  return {
    requestedDigest,
    requestedTimestamp,
    baselineStatus,
    changed: requestedDigest ? requestedDigest !== currentSourceDigest : entries.length > 0,
    entryCount: entries.length,
    entries: entries.slice(-8).map(summarizeAgentHistoryEntry),
    truncated: entries.length > 8,
  };
}

function agentBriefNextActions(project, doctor, releaseDoctor, pendingRequests, workLedger, maxNextActions) {
  const actions = [];
  const add = (op, reason, args = {}) => {
    if (actions.length >= maxNextActions || actions.some((entry) => entry.op === op && entry.reason === reason)) return;
    actions.push({ op, reason, args });
  };
  if (pendingRequests.length) add("get_pending_requests", `${pendingRequests.length} pending agent request(s) need routing or completion.`);
  if (workLedger.items.length) add("get_work_ledger", `${workLedger.items.length} active shared work item(s) need review, claim renewal, handoff, or closure.`, { status: ["open", "in-progress", "blocked"] });
  if ((project.maps?.length ?? 1) > 1) add("get_project_context", "Inspect the campaign index or exact affected maps without loading embedded assets and unrelated map documents.", { view: "campaign" });
  const readiness = buildAgentReadiness(doctor, releaseDoctor, { maxReleaseFindings: 8 });
  if (readiness.releaseDelta.findingCount > 0 || readiness.release.blocking) {
    add("get_doctor", `Production readiness is ${readiness.release.blocking ? "blocked" : "not clean"}; inspect ${readiness.releaseDelta.findingCount} release-only finding(s) before a release-ready export.`, { profile: "production" });
  }
  if (releaseDoctor.privacyReport?.findingCount > 0) {
    add("get_privacy_report", `Privacy preflight found ${releaseDoctor.privacyReport.findingCount} value-free issue record(s); inspect structural paths before any provider handoff, export, or publication.`, { profile: "production" });
  }
  for (const issue of doctor.issues ?? []) {
    if (!["error", "warning"].includes(issue.severity)) continue;
    const next = issue.nextAction ?? {};
    add("route_work", `${issue.code}: ${issue.message}`, {
      track: next.subsystem ?? issue.category ?? "full-game-creation",
      affectedIds: Array.isArray(next.affectedIds) ? next.affectedIds.slice(0, 12) : [],
      repairAction: next.repairAction ?? null,
      evidenceRequired: Array.isArray(next.evidenceRequired) ? next.evidenceRequired.slice(0, 12) : [],
    });
  }
  if (doctor.acceptanceResults?.status !== "passed") add("run_acceptance_suite", `Acceptance status is ${doctor.acceptanceResults?.status ?? "unknown"}.`);
  if (!["passed", "not-applicable"].includes(doctor.completionReport?.status)) add("get_completion_report", `Completion evidence is ${doctor.completionReport?.status ?? "unknown"}.`);
  if (doctor.replayResults?.status !== "passed") add("run_replay_suite", `Replay status is ${doctor.replayResults?.status ?? "unknown"}.`);
  if (!["measurably-ready", "not-requested"].includes(doctor.visualReadiness?.status)) add("get_visual_readiness", `Visual readiness is ${doctor.visualReadiness?.status ?? "unknown"}.`);
  const verification = project.iteration?.verification;
  const verificationCurrent = verification?.sourceDigest === doctor.sourceDigest
    && verification?.digest === doctor.digest
    && verification?.profile === doctor.profile;
  const releaseVerificationCurrent = verification?.sourceDigest === releaseDoctor.sourceDigest
    && verification?.digest === releaseDoctor.digest
    && verification?.profile === "production";
  if (doctor.errorCount === 0 && !verificationCurrent) add("collect_verification_evidence", "The candidate needs current browser/visual evidence before verification.");
  if (doctor.canPromote === true && verificationCurrent && project.iteration?.status !== "promoted") add("promote_iteration", `The ${doctor.profile}-verified candidate is eligible for protected-version promotion. This does not establish production release readiness.`);
  if (releaseDoctor.errorCount === 0 && releaseDoctor.warningCount === 0 && releaseDoctor.gate?.blocking !== true && releaseVerificationCurrent) add("export_html", "The production evidence path is ready for an exact one-file export and artifact audit.");
  return actions;
}

function agentBriefPlaybookStates(project, doctor, releaseDoctor, pendingRequests) {
  const states = [];
  if (pendingRequests.length) states.push("pending-agent-request");
  if (getAgentWorkLedger(project, { status: ["open", "in-progress", "blocked"], limit: 1, eventLimit: 0 }).items.length) states.push("shared-work-active");
  if (doctor.replayResults?.status !== "passed") states.push("replay-not-passed");
  const releaseVerificationCurrent = project.iteration?.verification?.sourceDigest === releaseDoctor.sourceDigest
    && project.iteration?.verification?.digest === releaseDoctor.digest
    && project.iteration?.verification?.profile === "production";
  if (releaseDoctor.errorCount === 0 && releaseDoctor.warningCount === 0 && releaseDoctor.gate?.blocking !== true && releaseVerificationCurrent) states.push("release-candidate");
  return states;
}

export function buildAgentBrief(inputProject, options = {}) {
  const project = syncActiveMap(inputProject);
  const doctor = analyzeProject(project, { profile: options.profile });
  const maxFindings = Math.max(1, Math.min(20, Number(options.maxFindings ?? 8)));
  const maxNextActions = Math.max(1, Math.min(10, Number(options.maxNextActions ?? 5)));
  const releaseDoctor = doctor.profile === "production" ? doctor : analyzeProject(project, { profile: "production" });
  const readiness = buildAgentReadiness(doctor, releaseDoctor, { maxReleaseFindings: maxFindings });
  const pendingRequests = (project.agentRequests ?? []).filter((request) => request?.status === "pending").map((request) => ({
    id: request.id ?? null,
    provider: request.provider ?? null,
    track: request.track ?? null,
    createdAt: request.createdAt ?? null,
    prompt: typeof request.prompt === "string" ? request.prompt.slice(0, 600) : "",
    loop: request.loop ? {
      strategy: request.loop.strategy ?? null,
      currentIteration: request.loop.currentIteration ?? null,
      maxIterations: request.loop.maxIterations ?? null,
      conditions: Array.isArray(request.loop.conditions) ? request.loop.conditions.slice(0, 12) : [],
    } : null,
  }));
  const workLedger = getAgentWorkLedger(project, { status: ["open", "in-progress", "blocked"], limit: 8, eventLimit: 0 });
  const findings = (doctor.issues ?? []).filter((issue) => issue.severity === "error" || issue.severity === "warning");
  const playbook = matchAgentRecipes({
    issueCodes: [...new Set([...findings.map((issue) => issue.code), ...readiness.releaseDelta.findings.map((issue) => issue.code).filter(Boolean)])],
    states: agentBriefPlaybookStates(project, doctor, releaseDoctor, pendingRequests),
    query: options.playbookQuery,
    limit: Math.max(1, Math.min(5, Number(options.maxRecipes ?? 3))),
  });
  return {
    schemaVersion: "looplab-agent-brief/v2",
    protocolVersion: LOOPLAB_PROTOCOL_VERSION,
    sourceDigest: doctor.sourceDigest,
    project: summarizeProject(project),
    campaignIndex: {
      total: project.maps?.length ?? 1,
      returned: Math.min(project.maps?.length ?? 1, 12),
      truncated: (project.maps?.length ?? 1) > 12,
      maps: (project.maps?.length ? project.maps : [{ ...project, id: project.activeMapId ?? "map-main" }]).slice(0, 12).map((map, index) => mapAgentIndexEntry(map, project, index)),
      fullContextCommand: { op: "get_project_context", view: "campaign" },
    },
    lifecycle: {
      doctor: { profile: doctor.profile, score: doctor.score, errorCount: doctor.errorCount, warningCount: doctor.warningCount, digest: doctor.digest },
      iteration: project.iteration ? { id: project.iteration.id ?? null, parentId: project.iteration.parentId ?? null, status: project.iteration.status ?? null, readOnly: project.iteration.readOnly === true } : null,
      acceptance: { status: doctor.acceptanceResults?.status ?? "unknown", passed: doctor.acceptanceResults?.passed === true },
      completion: { status: doctor.completionReport?.status ?? "unknown", passed: doctor.completionReport?.status === "passed", witnessId: doctor.completionReport?.witness?.id ?? null },
      replay: { status: doctor.replayResults?.status ?? "unknown", passed: doctor.replayResults?.passed === true },
      visual: { status: doctor.visualReadiness?.status ?? "unknown" },
      verificationCurrent: project.iteration?.verification?.sourceDigest === doctor.sourceDigest
        && project.iteration?.verification?.digest === doctor.digest
        && project.iteration?.verification?.profile === doctor.profile,
    },
    readiness,
    openFindings: findings.slice(0, maxFindings).map((issue) => ({
      severity: issue.severity,
      code: issue.code,
      category: issue.category ?? null,
      mapId: issue.mapId ?? null,
      objectId: issue.objectId ?? null,
      assetId: issue.assetId ?? null,
      featureId: issue.featureId ?? null,
      message: issue.message,
      evidenceRequired: Array.isArray(issue.nextAction?.evidenceRequired) ? issue.nextAction.evidenceRequired.slice(0, 12) : [],
      nextAction: issue.nextAction ?? null,
    })),
    findingCount: findings.length,
    findingsTruncated: findings.length > maxFindings,
    changes: agentBriefChanges(project, doctor.sourceDigest, options),
    pendingRequests,
    workLedger: {
      schemaVersion: workLedger.ledgerSchemaVersion,
      digest: workLedger.ledgerDigest,
      revision: workLedger.revision,
      total: workLedger.total,
      counts: workLedger.counts,
      activeClaims: workLedger.activeClaims,
      expiredClaims: workLedger.expiredClaims,
      items: workLedger.items.map((item) => ({
        id: item.id,
        title: item.title,
        kind: item.kind,
        priority: item.priority,
        status: item.status,
        updatedAt: item.updatedAt,
        updatedBy: item.updatedBy,
        claim: item.claim,
        claimState: item.claimState,
        blockers: item.blockers,
      })),
      truncated: workLedger.truncated,
    },
    nextActions: agentBriefNextActions(project, doctor, releaseDoctor, pendingRequests, workLedger, maxNextActions),
    playbook,
  };
}

const commandMacroIssueIdentity = (issue) => [
  issue?.category ?? "uncategorized",
  issue?.code ?? "unknown",
  issue?.mapId ?? "",
  issue?.objectId ?? "",
  issue?.assetId ?? "",
  issue?.featureId ?? "",
].join(":");

function commandMacroDoctorSummary(doctor) {
  return {
    profile: doctor.profile,
    score: doctor.score,
    errorCount: doctor.errorCount,
    warningCount: doctor.warningCount,
    digest: doctor.digest,
    sourceDigest: doctor.sourceDigest,
  };
}

function commandMacroNewBlockers(beforeIssues = [], afterIssues = []) {
  const before = new Map();
  for (const issue of beforeIssues.filter((candidate) => candidate.severity === "error")) {
    const identity = commandMacroIssueIdentity(issue);
    before.set(identity, (before.get(identity) ?? 0) + 1);
  }
  const added = [];
  for (const issue of afterIssues.filter((candidate) => candidate.severity === "error")) {
    const identity = commandMacroIssueIdentity(issue);
    const remaining = before.get(identity) ?? 0;
    if (remaining > 0) {
      before.set(identity, remaining - 1);
      continue;
    }
    added.push(issue);
  }
  return added.map((issue) => ({
    severity: issue.severity,
    category: issue.category,
    code: issue.code,
    message: issue.message,
    nextAction: issue.nextAction ?? null,
    mapId: issue.mapId ?? null,
    objectId: issue.objectId ?? null,
    assetId: issue.assetId ?? null,
    featureId: issue.featureId ?? null,
  }));
}

export function previewCommandMacro(inputProject, options = {}) {
  const beforeProject = syncActiveMap(clone(inputProject));
  const beforeDoctor = analyzeProject(beforeProject);
  const beforeReleaseDoctor = beforeDoctor.profile === "production" ? beforeDoctor : analyzeProject(beforeProject, { profile: "production" });
  const expansion = expandCommandMacro(beforeProject, options.macroId ?? options.id, options.parameters ?? {});
  let projectedProject = beforeProject;
  const results = [];
  for (const command of expansion.commands) {
    if (["list_command_macros", "preview_command_macro", "apply_command_macro"].includes(command.op)) throw new Error("Command macros cannot contain or invoke another macro operation.");
    const outcome = applyAgentCommand(projectedProject, command, { recordChange: false });
    projectedProject = outcome.project;
    results.push({ op: command.op, changed: outcome.changed, result: clone(outcome.result), validation: clone(outcome.validation) });
  }
  const afterDoctor = analyzeProject(projectedProject);
  const afterReleaseDoctor = afterDoctor.profile === "production" ? afterDoctor : analyzeProject(projectedProject, { profile: "production" });
  const validation = validateProject(projectedProject);
  const currentNewBlockers = commandMacroNewBlockers(beforeDoctor.issues, afterDoctor.issues);
  const releaseNewBlockers = commandMacroNewBlockers(beforeReleaseDoctor.issues, afterReleaseDoctor.issues);
  const newBlockers = [...new Map([...currentNewBlockers, ...releaseNewBlockers].map((issue) => [commandMacroIssueIdentity(issue), issue])).values()];
  const changed = doctorSourceDigest(beforeProject) !== doctorSourceDigest(projectedProject);
  return {
    ...expansion,
    sourceDigest: beforeDoctor.sourceDigest,
    projectedSourceDigest: afterDoctor.sourceDigest,
    invocationId: typeof options.invocationId === "string" && options.invocationId.trim() ? options.invocationId.trim().slice(0, 128) : null,
    changed,
    applicable: validation.valid && newBlockers.length === 0,
    doctor: {
      before: commandMacroDoctorSummary(beforeDoctor),
      after: commandMacroDoctorSummary(afterDoctor),
      delta: {
        score: afterDoctor.score - beforeDoctor.score,
        errors: afterDoctor.errorCount - beforeDoctor.errorCount,
        warnings: afterDoctor.warningCount - beforeDoctor.warningCount,
      },
      newBlockers,
      release: {
        before: commandMacroDoctorSummary(beforeReleaseDoctor),
        after: commandMacroDoctorSummary(afterReleaseDoctor),
        delta: {
          score: afterReleaseDoctor.score - beforeReleaseDoctor.score,
          errors: afterReleaseDoctor.errorCount - beforeReleaseDoctor.errorCount,
          warnings: afterReleaseDoctor.warningCount - beforeReleaseDoctor.warningCount,
        },
        newBlockers: releaseNewBlockers,
      },
    },
    validation,
    results,
    projectedProject,
  };
}

function commandMacroResultSummary(entry) {
  const validation = entry.validation ? {
    valid: entry.validation.valid === true,
    errorCount: entry.validation.errors?.length ?? 0,
    warningCount: entry.validation.warnings?.length ?? 0,
    ...((entry.validation.errors?.length ?? 0) > 0 ? { errors: clone(entry.validation.errors) } : {}),
    ...((entry.validation.warnings?.length ?? 0) > 0 ? { warnings: clone(entry.validation.warnings) } : {}),
  } : null;
  if (entry.op === "record_replay_case" && entry.result?.replayCase && entry.result?.replayResult) {
    const fixture = entry.result.replayCase;
    const replay = entry.result.replayResult;
    return {
      op: entry.op,
      changed: entry.changed,
      result: {
        replayFixture: {
          id: fixture.id,
          name: fixture.name,
          revision: fixture.revision,
          hashVersion: fixture.hashVersion,
          changeReason: fixture.changeReason,
          tickRate: fixture.tickRate,
          tickCount: fixture.tickCount,
          startMapId: fixture.startMapId ?? null,
          startSpawnId: fixture.startSpawnId ?? null,
          inputCount: fixture.inputs?.length ?? 0,
          checkpointCount: fixture.checkpoints?.length ?? 0,
          expectedHash: fixture.expectedHash,
        },
        replayResult: {
          caseId: replay.caseId,
          status: replay.status,
          passed: replay.passed,
          finalHash: replay.finalHash,
          firstMismatchTick: replay.firstMismatchTick,
          mismatchCount: replay.mismatches?.length ?? 0,
          emittedEventCounts: clone(replay.emittedEventCounts ?? {}),
        },
      },
      validation,
    };
  }
  return { ...entry, result: clone(entry.result), validation };
}

function publicCommandMacroPlan(plan, options = {}) {
  const publicPlan = { ...plan };
  delete publicPlan.projectedProject;
  const full = options.detail === "full";
  publicPlan.operationResultDetail = full ? "full" : "summary";
  if (!full) publicPlan.results = plan.results.map(commandMacroResultSummary);
  return publicPlan;
}

const BATCH_PREVIEW_FORBIDDEN_OPERATIONS = new Set([
  "preview_batch", "apply_previewed_batch", "preview_command_macro", "apply_command_macro", "auto_repair", "converge",
  "add_work_item", "claim_work_item", "update_work_item", "release_work_item",
  "begin_iteration", "create_variation", "verify_iteration", "promote_iteration",
  "checkpoint_iteration", "record_iteration_attempt", "restore_iteration",
  "queue_agent_request", "complete_agent_request",
]);

function stableBatchIdentity(command) {
  switch (command.op) {
    case "add_object": return command.object?.id;
    case "duplicate_object": return command.newId;
    case "add_navigation_layer": return command.layer?.id ?? command.id;
    case "add_navigation_node": return command.node?.id ?? command.id;
    case "connect_navigation_nodes": return command.link?.id ?? command.id;
    case "add_navigation_area": return command.area?.id ?? command.id;
    case "add_traversal_path": return command.path?.id ?? command.id;
    case "add_asset": return command.asset?.id;
    case "add_map":
    case "add_dimetric_map": return command.map?.id ?? command.id;
    case "connect_maps": return command.portalId;
    case "add_reference": return command.id;
    case "set_authored_route_document": return command.data?.id ?? command.document?.id;
    default: return true;
  }
}

function batchIssueSummary(issue) {
  return {
    severity: issue?.severity ?? "warning",
    category: issue?.category ?? null,
    code: issue?.code ?? "unknown",
    message: issue?.message ?? "Unknown Project Doctor finding",
    action: issue?.action ?? null,
    mapId: issue?.mapId ?? null,
    objectId: issue?.objectId ?? null,
    assetId: issue?.assetId ?? null,
    featureId: issue?.featureId ?? null,
  };
}

function batchIssueDifference(sourceIssues = [], targetIssues = []) {
  const remaining = new Map();
  for (const issue of sourceIssues) {
    const identity = commandMacroIssueIdentity(issue);
    const entries = remaining.get(identity) ?? [];
    entries.push(issue);
    remaining.set(identity, entries);
  }
  const difference = [];
  for (const issue of targetIssues) {
    const identity = commandMacroIssueIdentity(issue);
    const entries = remaining.get(identity) ?? [];
    if (entries.length) {
      entries.pop();
      remaining.set(identity, entries);
    } else difference.push(batchIssueSummary(issue));
  }
  return difference;
}

function batchDoctorProjection(beforeDoctor, afterDoctor) {
  const introduced = batchIssueDifference(beforeDoctor.issues, afterDoctor.issues);
  const resolved = batchIssueDifference(afterDoctor.issues, beforeDoctor.issues);
  return {
    before: commandMacroDoctorSummary(beforeDoctor),
    after: commandMacroDoctorSummary(afterDoctor),
    delta: {
      score: afterDoctor.score - beforeDoctor.score,
      errors: afterDoctor.errorCount - beforeDoctor.errorCount,
      warnings: afterDoctor.warningCount - beforeDoctor.warningCount,
    },
    introduced,
    resolved,
    newBlockers: introduced.filter((issue) => issue.severity === "error"),
  };
}

function communityExchangeSafety(beforeProject, afterProject, profile) {
  const activeProfile = profile ?? beforeProject.doctorProfile ?? "prototype";
  const beforeDoctor = analyzeProject(beforeProject, { profile: activeProfile });
  const afterDoctor = analyzeProject(afterProject, { profile: activeProfile });
  const beforeReleaseDoctor = beforeDoctor.profile === "production" ? beforeDoctor : analyzeProject(beforeProject, { profile: "production" });
  const afterReleaseDoctor = afterDoctor.profile === "production" ? afterDoctor : analyzeProject(afterProject, { profile: "production" });
  const current = batchDoctorProjection(beforeDoctor, afterDoctor);
  const release = batchDoctorProjection(beforeReleaseDoctor, afterReleaseDoctor);
  const newBlockers = [...new Map([...current.newBlockers, ...release.newBlockers].map((issue) => [commandMacroIssueIdentity(issue), issue])).values()];
  return {
    sourceDigest: beforeDoctor.sourceDigest,
    projectedSourceDigest: afterDoctor.sourceDigest,
    validation: validateProject(afterProject),
    doctor: { ...current, release, newBlockers },
  };
}

function projectedTiledExchange(project, preview) {
  const normalized = syncActiveMap(project);
  const mapId = preview.proposal.mapId;
  const index = normalized.maps.findIndex((candidate) => candidate.id === mapId);
  if (index < 0) throw new Error("Tiled import target map was not found.");
  const maps = clone(normalized.maps);
  maps[index] = { ...maps[index], ...clone(preview.proposal.mapChanges), tileProgram: clone(preview.proposal.tileProgram) };
  return upsertCommunityExchange(hydrateActiveMap(normalized, maps), preview.proposal.exchangeEntry);
}

function projectedAsepriteExchange(project, preview) {
  const normalized = syncActiveMap(project);
  const assets = clone(normalized.assets ?? []);
  const assetIndex = assets.findIndex((candidate) => candidate.id === preview.proposal.assetId);
  if (assetIndex < 0) throw new Error("Aseprite import target asset was not found.");
  assets[assetIndex] = clone(preview.proposal.updatedAsset);
  const projected = { ...normalized, assets, presentationProgram: clone(preview.proposal.presentationProgram) };
  return upsertCommunityExchange(projected, preview.proposal.exchangeEntry);
}

function publicCommunityExchangePreview(preview, compact = true) {
  const output = clone(preview);
  const entry = output.proposal?.exchangeEntry;
  if (entry) {
    delete entry.sourceText;
    entry.dependencies = (entry.dependencies ?? []).map((dependency) => {
      const next = { ...dependency };
      delete next.sourceText;
      return next;
    });
  }
  if (compact && output.proposal) {
    delete output.proposal.tileProgram;
    delete output.proposal.updatedAsset;
    delete output.proposal.presentationProgram;
  }
  return output;
}

function batchCommandError(index, command, stage, error) {
  return {
    index,
    op: typeof command?.op === "string" ? command.op : null,
    stage,
    message: String(error instanceof Error ? error.message : error).slice(0, 1_200),
  };
}

function validateBatchCommand(command, index) {
  const validation = validateLooplabCommandInput(command, { rejectTransportEnvelope: true });
  if (!validation.contract) return validation.errors.map((error) => batchCommandError(index, command, "contract", error));
  const errors = validation.errors.map((error) => batchCommandError(index, command, "schema", error));
  if (!validation.contract.surfaces.includes("core")) errors.push(batchCommandError(index, command, "contract", `${command.op} is browser-session only and cannot be reproduced by the canonical file/headless batch runner.`));
  if (!validation.contract.mutatesProject || validation.contract.coordinationOnly) errors.push(batchCommandError(index, command, "contract", `${command.op} is not an authored project mutation and does not belong in an atomic game batch.`));
  if (BATCH_PREVIEW_FORBIDDEN_OPERATIONS.has(command.op)) errors.push(batchCommandError(index, command, "contract", `${command.op} has its own lifecycle, authority, coordination, or preview/apply workflow and cannot be nested in preview_batch.`));
  if (stableBatchIdentity(command) !== true && !String(stableBatchIdentity(command) ?? "").trim()) {
    errors.push(batchCommandError(index, command, "stability", `${command.op} must provide its stable authored ID so preview and apply cannot generate different identities.`));
  }
  return errors;
}

export function previewAgentBatch(inputProject, options = {}, internalOptions = {}) {
  if (!Array.isArray(options.commands) || options.commands.length < 1 || options.commands.length > 64) throw new Error("preview_batch requires 1 to 64 ordered commands.");
  const summary = String(options.summary ?? "").trim();
  if (!summary || summary.length > 1_200) throw new Error("preview_batch summary must contain 1 to 1200 characters.");
  const profile = options.profile ?? inputProject.doctorProfile ?? "prototype";
  if (!["prototype", "production"].includes(profile)) throw new Error("preview_batch profile must be prototype or production.");
  const beforeProject = syncActiveMap(clone(inputProject));
  const beforeDoctor = analyzeProject(beforeProject, { profile });
  const expectedSourceDigest = String(options.expectedSourceDigest ?? "").trim();
  if (!expectedSourceDigest) throw new Error("preview_batch requires expectedSourceDigest from the Project Doctor report inspected before drafting the batch.");
  if (expectedSourceDigest !== beforeDoctor.sourceDigest) throw new Error(`[stale-source] Batch preview expected ${expectedSourceDigest}, but the selected project is now ${beforeDoctor.sourceDigest}. Inspect current truth and rebuild the batch.`);
  const beforeReleaseDoctor = beforeDoctor.profile === "production" ? beforeDoctor : analyzeProject(beforeProject, { profile: "production" });
  const commands = options.commands.map((command) => clone(command));
  const commandErrors = commands.flatMap((command, index) => validateBatchCommand(command, index));
  const results = [];
  let projectedProject = beforeProject;
  if (commandErrors.length === 0) {
    for (let index = 0; index < commands.length; index += 1) {
      const command = commands[index];
      try {
        const outcome = applyAgentCommand(projectedProject, command, { recordChange: false, allowInvalidResult: internalOptions.allowInvalidIntermediate === true });
        projectedProject = outcome.project;
        results.push({ index, op: command.op, changed: outcome.changed, result: clone(outcome.result), validation: clone(outcome.validation) });
      } catch (error) {
        commandErrors.push(batchCommandError(index, command, "execution", error));
        results.push({ index, op: command.op, changed: false, error: String(error instanceof Error ? error.message : error) });
        projectedProject = beforeProject;
        break;
      }
    }
  }
  const validation = validateProject(projectedProject);
  const afterDoctor = analyzeProject(projectedProject, { profile });
  const afterReleaseDoctor = afterDoctor.profile === "production" ? afterDoctor : analyzeProject(projectedProject, { profile: "production" });
  const currentProjection = batchDoctorProjection(beforeDoctor, afterDoctor);
  const releaseProjection = batchDoctorProjection(beforeReleaseDoctor, afterReleaseDoctor);
  const newBlockers = [...new Map([...currentProjection.newBlockers, ...releaseProjection.newBlockers].map((issue) => [commandMacroIssueIdentity(issue), issue])).values()];
  const changed = commandErrors.length === 0 && beforeDoctor.sourceDigest !== afterDoctor.sourceDigest;
  const applicable = commandErrors.length === 0 && validation.valid && newBlockers.length === 0;
  const digestProjection = {
    schemaVersion: LOOPLAB_AGENT_BATCH_PREVIEW_SCHEMA,
    protocolVersion: LOOPLAB_PROTOCOL_VERSION,
    sourceDigest: beforeDoctor.sourceDigest,
    projectedSourceDigest: afterDoctor.sourceDigest,
    summary,
    profile,
    commands,
    commandErrors,
    validation: { valid: validation.valid, errors: validation.errors, warnings: validation.warnings },
    doctor: {
      current: { after: currentProjection.after, delta: currentProjection.delta, introduced: currentProjection.introduced, resolved: currentProjection.resolved },
      release: { after: releaseProjection.after, delta: releaseProjection.delta, introduced: releaseProjection.introduced, resolved: releaseProjection.resolved },
    },
  };
  const previewDigest = canonicalSha256(digestProjection);
  return {
    schemaVersion: LOOPLAB_AGENT_BATCH_PREVIEW_SCHEMA,
    protocolVersion: LOOPLAB_PROTOCOL_VERSION,
    sourceDigest: beforeDoctor.sourceDigest,
    projectedSourceDigest: afterDoctor.sourceDigest,
    previewDigest,
    summary,
    profile,
    commandCount: commands.length,
    commands,
    changed,
    applicable,
    rolledBack: commandErrors.length > 0,
    commandErrors,
    validation,
    doctor: { ...currentProjection, release: releaseProjection, newBlockers },
    results,
    evidencePolicy: changed
      ? "The projected authored source changes, so existing source-bound acceptance, replay, visual, verification, and release receipts must be rerun or revalidated by their canonical gates."
      : "The projected authored source digest does not change; this preview does not independently validate existing evidence.",
    authority: {
      providerUsed: false,
      persistsProject: false,
      grantsMutationAuthority: false,
      reviewRequired: true,
      exactApplyRequiresCurrentSourceAndPreviewDigest: true,
    },
    applyCommand: applicable ? {
      op: "apply_previewed_batch",
      commands: clone(commands),
      summary,
      profile,
      expectedSourceDigest: beforeDoctor.sourceDigest,
      expectedPreviewDigest: previewDigest,
    } : null,
    projectedProject,
  };
}

function publicAgentBatchPreview(plan, options = {}) {
  const publicPlan = { ...plan };
  delete publicPlan.projectedProject;
  const full = options.detail === "full";
  publicPlan.operationResultDetail = full ? "full" : "summary";
  if (!full) publicPlan.results = plan.results.map(commandMacroResultSummary);
  return publicPlan;
}

function normalizeMechanicalRepairOptions(inputProject, options = {}) {
  const expectedSourceDigest = String(options.expectedSourceDigest ?? "").trim();
  if (!expectedSourceDigest) throw new Error("Mechanical repair requires expectedSourceDigest from the Project Doctor report inspected immediately before planning.");
  const profile = options.profile ?? inputProject.doctorProfile ?? "prototype";
  if (!["prototype", "production"].includes(profile)) throw new Error("Mechanical repair profile must be prototype or production.");
  const rawMaxRepairs = Number(options.maxRepairs ?? LOOPLAB_AUTO_REPAIR_LIMITS.defaultRepairs);
  if (!Number.isInteger(rawMaxRepairs) || rawMaxRepairs < 1 || rawMaxRepairs > LOOPLAB_AUTO_REPAIR_LIMITS.maximumRepairs) {
    throw new Error(`Mechanical repair maxRepairs must be an integer from 1 to ${LOOPLAB_AUTO_REPAIR_LIMITS.maximumRepairs}.`);
  }
  const findingCodes = options.findingCodes == null ? null : options.findingCodes;
  if (findingCodes !== null && (!Array.isArray(findingCodes) || findingCodes.length > 32 || findingCodes.some((code) => typeof code !== "string" || !code.trim()))) {
    throw new Error("Mechanical repair findingCodes must contain at most 32 non-empty strings.");
  }
  return {
    expectedSourceDigest,
    profile,
    maxRepairs: rawMaxRepairs,
    findingCodes: findingCodes ? [...new Set(findingCodes.map((code) => code.trim()))].sort() : null,
  };
}

function zeroDoctorProjection(doctor) {
  const summary = commandMacroDoctorSummary(doctor);
  return {
    before: summary,
    after: summary,
    delta: { score: 0, errors: 0, warnings: 0 },
    introduced: [],
    resolved: [],
    newBlockers: [],
  };
}

function publicMechanicalRepairPlan(plan) {
  const result = { ...plan };
  delete result.projectedProject;
  return result;
}

export function previewMechanicalAutoRepair(inputProject, options = {}) {
  const normalized = normalizeMechanicalRepairOptions(inputProject, options);
  const current = syncActiveMap(clone(inputProject));
  const beforeDoctor = analyzeProject(current, { profile: normalized.profile });
  if (beforeDoctor.sourceDigest !== normalized.expectedSourceDigest) {
    throw new Error(`[stale-source] Mechanical repair expected ${normalized.expectedSourceDigest}, but the selected project is now ${beforeDoctor.sourceDigest}. Inspect current truth and replan.`);
  }
  const beforeReleaseDoctor = beforeDoctor.profile === "production" ? beforeDoctor : analyzeProject(current, { profile: "production" });
  const candidate = buildMechanicalRepairPlan(current, beforeDoctor, normalized);
  const summary = `Apply ${candidate.safeRepairCount} deterministic Project Doctor repair${candidate.safeRepairCount === 1 ? "" : "s"} without inventing gameplay or visual design.`;
  let batch = null;
  let projectedProject = current;
  let validation = validateProject(current);
  let currentProjection = zeroDoctorProjection(beforeDoctor);
  let releaseProjection = zeroDoctorProjection(beforeReleaseDoctor);
  let changed = false;
  let applicable = false;
  let projectedSourceDigest = beforeDoctor.sourceDigest;
  if (candidate.commands.length) {
    batch = previewAgentBatch(current, {
      commands: candidate.commands,
      summary,
      profile: normalized.profile,
      expectedSourceDigest: beforeDoctor.sourceDigest,
      detail: "summary",
    }, { allowInvalidIntermediate: true });
    projectedProject = batch.projectedProject;
    validation = batch.validation;
    currentProjection = {
      before: batch.doctor.before,
      after: batch.doctor.after,
      delta: batch.doctor.delta,
      introduced: batch.doctor.introduced,
      resolved: batch.doctor.resolved,
      newBlockers: batch.doctor.newBlockers,
    };
    releaseProjection = batch.doctor.release;
    changed = batch.changed;
    applicable = batch.applicable && batch.changed;
    projectedSourceDigest = batch.projectedSourceDigest;
  }
  const digestProjection = {
    schemaVersion: LOOPLAB_AUTO_REPAIR_SCHEMA,
    protocolVersion: LOOPLAB_PROTOCOL_VERSION,
    sourceDigest: beforeDoctor.sourceDigest,
    projectedSourceDigest,
    profile: normalized.profile,
    findingCodes: normalized.findingCodes,
    maxRepairs: normalized.maxRepairs,
    commands: candidate.commands,
    repairs: candidate.repairs,
    residue: candidate.residue,
    omittedResidueCount: candidate.omittedResidueCount,
    validation: { valid: validation.valid, errors: validation.errors, warnings: validation.warnings },
    doctor: {
      current: { after: currentProjection.after, delta: currentProjection.delta, introduced: currentProjection.introduced, resolved: currentProjection.resolved },
      release: { after: releaseProjection.after, delta: releaseProjection.delta, introduced: releaseProjection.introduced, resolved: releaseProjection.resolved },
    },
  };
  const repairDigest = canonicalSha256(digestProjection);
  return {
    schemaVersion: LOOPLAB_AUTO_REPAIR_SCHEMA,
    protocolVersion: LOOPLAB_PROTOCOL_VERSION,
    sourceDigest: beforeDoctor.sourceDigest,
    projectedSourceDigest,
    repairDigest,
    profile: normalized.profile,
    selectedFindingCodes: candidate.selectedFindingCodes,
    maxRepairs: normalized.maxRepairs,
    summary,
    safeRepairCount: candidate.safeRepairCount,
    commandCount: candidate.commandCount,
    commands: candidate.commands,
    repairs: candidate.repairs,
    residue: candidate.residue,
    omittedResidueCount: candidate.omittedResidueCount,
    repairLimitReached: candidate.limits.repairLimitReached,
    changed,
    applicable,
    validation,
    doctor: { current: currentProjection, release: releaseProjection },
    batchPreviewDigest: batch?.previewDigest ?? null,
    authority: {
      providerUsed: false,
      persistsProject: false,
      grantsMutationAuthority: false,
      automaticScope: "Only deterministic, local, idempotent Project Doctor invariant restoration is eligible. Design, tuning, route, art, and reachability decisions remain residue.",
      exactApplyRequiresCurrentSourceAndRepairDigest: true,
    },
    applyCommand: applicable ? {
      op: "auto_repair",
      apply: true,
      profile: normalized.profile,
      maxRepairs: normalized.maxRepairs,
      ...(normalized.findingCodes ? { findingCodes: normalized.findingCodes } : {}),
      expectedSourceDigest: beforeDoctor.sourceDigest,
      expectedRepairDigest: repairDigest,
    } : null,
    projectedProject,
  };
}

function publicConvergencePlan(plan) {
  const result = { ...plan };
  delete result.projectedProject;
  return result;
}

export function previewMechanicalConvergence(inputProject, options = {}) {
  const normalized = normalizeMechanicalRepairOptions(inputProject, options);
  const rawMaxPasses = Number(options.maxPasses ?? LOOPLAB_AUTO_REPAIR_LIMITS.defaultPasses);
  if (!Number.isInteger(rawMaxPasses) || rawMaxPasses < 1 || rawMaxPasses > LOOPLAB_AUTO_REPAIR_LIMITS.maximumPasses) {
    throw new Error(`converge maxPasses must be an integer from 1 to ${LOOPLAB_AUTO_REPAIR_LIMITS.maximumPasses}.`);
  }
  const initial = syncActiveMap(clone(inputProject));
  const initialDoctor = analyzeProject(initial, { profile: normalized.profile });
  const initialReleaseDoctor = initialDoctor.profile === "production" ? initialDoctor : analyzeProject(initial, { profile: "production" });
  if (initialDoctor.sourceDigest !== normalized.expectedSourceDigest) {
    throw new Error(`[stale-source] Convergence expected ${normalized.expectedSourceDigest}, but the selected project is now ${initialDoctor.sourceDigest}. Inspect current truth and replan.`);
  }
  let working = initial;
  let workingDoctor = initialDoctor;
  const visited = new Set([initialDoctor.sourceDigest]);
  const passes = [];
  let stopReason = "max-passes";
  let rejected = false;
  for (let passNumber = 1; passNumber <= rawMaxPasses; passNumber += 1) {
    const repair = previewMechanicalAutoRepair(working, {
      ...normalized,
      expectedSourceDigest: workingDoctor.sourceDigest,
    });
    if (!repair.safeRepairCount || !repair.commandCount) {
      stopReason = repair.residue.length || repair.omittedResidueCount ? "judgment-residue" : "fixed-point";
      break;
    }
    const pass = {
      pass: passNumber,
      sourceDigest: repair.sourceDigest,
      projectedSourceDigest: repair.projectedSourceDigest,
      repairDigest: repair.repairDigest,
      safeRepairCount: repair.safeRepairCount,
      commandCount: repair.commandCount,
      findingCodes: [...new Set(repair.repairs.flatMap((entry) => entry.findingCodes))].sort(),
      repairs: repair.repairs,
      doctor: repair.doctor,
      validation: repair.validation,
      applicable: repair.applicable,
    };
    passes.push(pass);
    if (!repair.applicable || !repair.changed) {
      stopReason = "preview-rejected";
      rejected = true;
      break;
    }
    if (visited.has(repair.projectedSourceDigest)) {
      stopReason = "cycle-detected";
      rejected = true;
      break;
    }
    visited.add(repair.projectedSourceDigest);
    working = repair.projectedProject;
    workingDoctor = analyzeProject(working, { profile: normalized.profile });
    if (passNumber === rawMaxPasses) stopReason = "max-passes";
  }
  const finalDoctor = analyzeProject(working, { profile: normalized.profile });
  const finalReleaseDoctor = finalDoctor.profile === "production" ? finalDoctor : analyzeProject(working, { profile: "production" });
  const remaining = buildMechanicalRepairPlan(working, finalDoctor, normalized);
  if (stopReason === "max-passes" && remaining.safeRepairCount === 0) {
    stopReason = remaining.residue.length || remaining.omittedResidueCount ? "judgment-residue" : "fixed-point";
  }
  const validation = validateProject(working);
  const changed = initialDoctor.sourceDigest !== finalDoctor.sourceDigest;
  const applicable = changed && validation.valid && !rejected;
  const digestProjection = {
    schemaVersion: LOOPLAB_CONVERGENCE_SCHEMA,
    protocolVersion: LOOPLAB_PROTOCOL_VERSION,
    sourceDigest: initialDoctor.sourceDigest,
    projectedSourceDigest: finalDoctor.sourceDigest,
    profile: normalized.profile,
    findingCodes: normalized.findingCodes,
    maxRepairs: normalized.maxRepairs,
    maxPasses: rawMaxPasses,
    stopReason,
    passes: passes.map((pass) => ({
      pass: pass.pass,
      sourceDigest: pass.sourceDigest,
      projectedSourceDigest: pass.projectedSourceDigest,
      repairDigest: pass.repairDigest,
      safeRepairCount: pass.safeRepairCount,
      commandCount: pass.commandCount,
      findingCodes: pass.findingCodes,
      validation: { valid: pass.validation.valid, errors: pass.validation.errors, warnings: pass.validation.warnings },
      applicable: pass.applicable,
    })),
    finalDoctor: commandMacroDoctorSummary(finalDoctor),
    finalReleaseDoctor: commandMacroDoctorSummary(finalReleaseDoctor),
    initialDoctor: commandMacroDoctorSummary(initialDoctor),
    initialReleaseDoctor: commandMacroDoctorSummary(initialReleaseDoctor),
    remainingSafeRepairCount: remaining.safeRepairCount,
    residue: remaining.residue,
    omittedResidueCount: remaining.omittedResidueCount,
    validation: { valid: validation.valid, errors: validation.errors, warnings: validation.warnings },
  };
  const convergenceDigest = canonicalSha256(digestProjection);
  return {
    schemaVersion: LOOPLAB_CONVERGENCE_SCHEMA,
    protocolVersion: LOOPLAB_PROTOCOL_VERSION,
    sourceDigest: initialDoctor.sourceDigest,
    projectedSourceDigest: finalDoctor.sourceDigest,
    convergenceDigest,
    profile: normalized.profile,
    selectedFindingCodes: normalized.findingCodes,
    maxRepairs: normalized.maxRepairs,
    maxPasses: rawMaxPasses,
    passCount: passes.length,
    totalRepairCount: passes.reduce((sum, pass) => sum + pass.safeRepairCount, 0),
    totalCommandCount: passes.reduce((sum, pass) => sum + pass.commandCount, 0),
    passes,
    stopReason,
    changed,
    applicable,
    validation,
    initialDoctor: commandMacroDoctorSummary(initialDoctor),
    initialReleaseDoctor: commandMacroDoctorSummary(initialReleaseDoctor),
    finalDoctor: commandMacroDoctorSummary(finalDoctor),
    finalReleaseDoctor: commandMacroDoctorSummary(finalReleaseDoctor),
    remainingSafeRepairCount: remaining.safeRepairCount,
    residue: remaining.residue,
    omittedResidueCount: remaining.omittedResidueCount,
    authority: {
      providerUsed: false,
      persistsProject: false,
      grantsMutationAuthority: false,
      bounded: true,
      cycleDetection: true,
      exactApplyRequiresCurrentSourceAndConvergenceDigest: true,
    },
    applyCommand: applicable ? {
      op: "converge",
      apply: true,
      profile: normalized.profile,
      maxRepairs: normalized.maxRepairs,
      maxPasses: rawMaxPasses,
      ...(normalized.findingCodes ? { findingCodes: normalized.findingCodes } : {}),
      expectedSourceDigest: initialDoctor.sourceDigest,
      expectedConvergenceDigest: convergenceDigest,
    } : null,
    projectedProject: working,
  };
}

function installRecordedReplayCase(inputProject, command) {
  const project = syncActiveMap(inputProject);
  const recorded = recordReplayCase(project, command);
  const cases = [...(project.replay?.cases ?? [])];
  const existingIndex = cases.findIndex((replayCase) => replayCase.id === recorded.replayCase.id);
  if (existingIndex >= 0) cases[existingIndex] = recorded.replayCase;
  else cases.push(recorded.replayCase);
  project.replay = {
    ...(project.replay ?? {}),
    version: String(project.replay?.version ?? "1"),
    tickRate: Number(command.tickRate ?? project.replay?.tickRate ?? 60),
    seed: Number(command.seed ?? project.replay?.seed ?? 1),
    cases,
  };
  return { project, recorded };
}

export function applyAgentCommand(inputProject, command, options = {}) {
  if (!command || typeof command !== "object" || Array.isArray(command)) throw new Error("Command must be a JSON object.");
  if (typeof command.op !== "string") throw new Error("Command requires a string op field.");
  const commandSurface = looplabCommandSurface(command.op);
  const hasEvidenceAuthority = options.evidenceAuthority === LOOPLAB_EVIDENCE_AUTHORITY && LOOPLAB_EVIDENCE_AUTHORITY_OPS.has(command.op);
  if (commandSurface === "browser-session" && !hasEvidenceAuthority) throw new Error(`${command.op} is a browser-session command. Use window.looplabAgent, the looplab:agent-command event transport, or the #looplab-agent-bridge form instead of the core apply transport.`);
  if (commandSurface !== "core" && !hasEvidenceAuthority) throw new Error(`Unknown command op: ${command.op}`);
  if (Object.prototype.hasOwnProperty.call(command, "expectedSourceDigest")) {
    const expectedSourceDigest = String(command.expectedSourceDigest ?? "").trim();
    if (!expectedSourceDigest) throw new Error("expectedSourceDigest must be a non-empty Project Doctor source digest.");
    const actualSourceDigest = doctorSourceDigest(syncActiveMap(clone(inputProject)));
    if (expectedSourceDigest !== actualSourceDigest) {
      throw new Error(`[stale-source] Command expected ${expectedSourceDigest}, but the selected project is now ${actualSourceDigest}. Inspect the current project and rebase the edit instead of applying it to stale state.`);
    }
  }

  if (command.op === "replace_project") {
    const replacement = invalidateVerifiedAuthoring(inputProject, preserveStrictestDoctorProfile(inputProject, clone(command.project)), { reason: "Headless project replacement changed authored game state" });
    const recorded = options.recordChange === false ? replacement : recordAgentProjectChange(inputProject, replacement, command, { channel: "headless" });
    const validation = validateProject(recorded);
    if (!validation.valid) throw new Error(`Replacement project is invalid: ${validation.errors.join(" ")}`);
    return { changed: true, project: recorded, result: { replaced: true }, validation };
  }

  if (command.op === "import_html") {
    const imported = extractProjectFromHtml(command.html);
    const replacement = invalidateVerifiedAuthoring(inputProject, preserveStrictestDoctorProfile(inputProject, clone(imported.project)), { reason: "Imported HTML changed authored game state" });
    const recorded = options.recordChange === false ? replacement : recordAgentProjectChange(inputProject, replacement, command, { channel: "headless" });
    const validation = validateProject(recorded);
    if (!validation.valid) throw new Error(`Imported HTML contains an invalid Looplab project: ${validation.errors.join(" ")}`);
    return { changed: true, project: recorded, result: { imported: true, source: imported.source, mapCount: recorded.maps?.length ?? 1 }, validation };
  }

  let project = clone(inputProject);
  let result = null;
  let changed = false;
  let coordinationOnly = false;
  let changeRecordCommand = command;

  switch (command.op) {
    case "get_project": {
      const current = syncActiveMap(project);
      const sourceDigest = doctorSourceDigest(current);
      const compact = command.compact === true;
      if (command.sinceDigest) {
        const baseline = projectForSourceDigest(current, command.sinceDigest);
        const beforeSource = doctorSourceProjection(baseline);
        const afterSource = doctorSourceProjection(current);
        const beforeDocument = compact ? compactProviderProject(beforeSource) : clone(beforeSource);
        const afterDocument = compact ? compactProviderProject(afterSource) : clone(afterSource);
        result = {
          schemaVersion: LOOPLAB_PROJECT_READ_SCHEMA,
          mode: "patch",
          compact,
          sinceDigest: String(command.sinceDigest),
          sourceDigest,
          changed: String(command.sinceDigest) !== sourceDigest,
          patch: buildProjectJsonPatch(beforeDocument, afterDocument),
          summary: summarizeProject(current),
        };
      } else {
        result = {
          schemaVersion: LOOPLAB_PROJECT_READ_SCHEMA,
          mode: "full",
          compact,
          sourceDigest,
          project: compact ? compactProviderProject(current) : clone(current),
          summary: summarizeProject(current),
        };
      }
      break;
    }
    case "query_project": {
      const current = syncActiveMap(project);
      const compact = command.compact !== false;
      const document = compact ? compactProviderProject(current) : clone(current);
      result = {
        ...queryProjectDocument(document, { select: command.select, pointers: command.pointers }),
        compact,
        sourceDigest: doctorSourceDigest(current),
        summary: summarizeProject(current),
      };
      break;
    }
    case "describe_frame": {
      const current = syncActiveMap(project);
      result = describeSemanticFrame(current, {
        ...command,
        sourceDigest: doctorSourceDigest(current),
      });
      break;
    }
    case "simulate": {
      const current = syncActiveMap(project);
      result = runSimulationProbe(current, {
        ...command,
        sourceDigest: doctorSourceDigest(current),
      });
      break;
    }
    case "get_export_profile": {
      const sourceDigest = doctorSourceDigest(syncActiveMap(clone(project)));
      const report = inspectSaveProgram(project, project.saveProgram, { sourceDigest });
      result = {
        schemaVersion: LOOPLAB_EXPORT_PROFILE_SCHEMA,
        sourceDigest,
        profile: report.profile,
        release: clone(project.release ?? {}),
        saveProgram: clone(project.saveProgram ?? null),
        report,
        policy: clone(LOOPLAB_PERSISTENCE_POLICY),
      };
      break;
    }
    case "get_save_report": {
      const sourceDigest = doctorSourceDigest(syncActiveMap(clone(project)));
      result = inspectSaveProgram(project, project.saveProgram, { sourceDigest });
      break;
    }
    case "get_project_context": {
      const contextProject = syncActiveMap(project);
      const doctor = analyzeProject(contextProject, { profile: command.profile });
      const releaseDoctor = doctor.profile === "production" ? doctor : analyzeProject(contextProject, { profile: "production" });
      const workLedger = getAgentWorkLedger(contextProject, { includeEvents: false, limit: 8, eventLimit: 0 });
      result = buildAgentProjectContext(contextProject, {
        ...command,
        protocolVersion: LOOPLAB_PROTOCOL_VERSION,
        sourceDigest: doctor.sourceDigest,
        doctor,
        releaseDoctor,
        runtimeJoinPlan: buildRuntimeJoinPlan(contextProject),
        workLedger: {
          schemaVersion: workLedger.ledgerSchemaVersion,
          digest: workLedger.ledgerDigest,
          revision: workLedger.revision,
          total: workLedger.total,
          counts: workLedger.counts,
          activeClaims: workLedger.activeClaims,
          expiredClaims: workLedger.expiredClaims,
          items: workLedger.items.map((item) => ({ id: item.id, title: item.title, kind: item.kind, priority: item.priority, status: item.status, claim: item.claim, claimState: item.claimState })),
          truncated: workLedger.truncated,
        },
      });
      break;
    }
    case "get_agent_brief":
      result = buildAgentBrief(project, command);
      break;
    case "get_agent_changes":
      result = getAgentChanges(project, command);
      break;
    case "draft_agent_plan": {
      const current = syncActiveMap(project);
      const currentDoctor = analyzeProject(current, { profile: command.profile });
      const releaseDoctor = currentDoctor.profile === "production" ? currentDoctor : analyzeProject(current, { profile: "production" });
      result = buildAgentPlan(current, command, {
        protocolVersion: LOOPLAB_PROTOCOL_VERSION,
        sourceDigest: currentDoctor.sourceDigest,
        currentDoctor,
        releaseDoctor,
        readiness: buildAgentReadiness(currentDoctor, releaseDoctor, { maxReleaseFindings: 8 }),
        previewMacro: (macroCommand) => publicCommandMacroPlan(previewCommandMacro(current, macroCommand)),
      });
      break;
    }
    case "get_work_ledger":
      result = getAgentWorkLedger(project, command);
      break;
    case "add_work_item":
    case "claim_work_item":
    case "update_work_item":
    case "release_work_item": {
      const outcome = applyAgentWorkLedgerCommand(project, command, { sourceDigest: doctorSourceDigest(inputProject) });
      project = outcome.project;
      result = outcome.result;
      changed = true;
      coordinationOnly = true;
      break;
    }
    case "list_agent_recipes":
      result = listAgentRecipes(command);
      break;
    case "get_agent_recipe":
      result = getAgentRecipe(command.recipeId);
      break;
    case "list_command_macros":
      result = listCommandMacros();
      break;
    case "preview_command_macro":
      result = publicCommandMacroPlan(previewCommandMacro(project, command), command);
      break;
    case "apply_command_macro": {
      const expectedSourceDigest = String(command.expectedSourceDigest ?? "").trim();
      if (!expectedSourceDigest) throw new Error("apply_command_macro requires expectedSourceDigest from the exact previewed project.");
      const expectedExpansionDigest = String(command.expectedExpansionDigest ?? "").trim();
      if (!/^sha256:[a-f0-9]{64}$/i.test(expectedExpansionDigest)) throw new Error("apply_command_macro requires the SHA-256 expectedExpansionDigest returned by preview_command_macro.");
      const plan = previewCommandMacro(project, command);
      if (plan.sourceDigest !== expectedSourceDigest) throw new Error(`[stale-source] Macro expected ${expectedSourceDigest}, but the selected project is now ${plan.sourceDigest}. Preview the macro again against the current project.`);
      if (plan.expansionDigest !== expectedExpansionDigest) throw new Error(`[stale-macro-plan] Macro expansion expected ${expectedExpansionDigest}, but the exact current expansion is ${plan.expansionDigest}. Inspect the new preview instead of applying a different command sequence.`);
      if (!plan.validation.valid) throw new Error(`Macro rejected: the projected project is invalid: ${plan.validation.errors.join(" ")}`);
      if (plan.doctor.newBlockers.length) throw new Error(`Macro rejected: it introduces ${plan.doctor.newBlockers.length} new Project Doctor blocker(s): ${plan.doctor.newBlockers.map((issue) => issue.code).join(", ")}.`);
      project = plan.projectedProject;
      changed = plan.changed;
      result = { ...publicCommandMacroPlan(plan, command), applied: true, schemaVersion: LOOPLAB_COMMAND_MACRO_PLAN_SCHEMA };
      break;
    }
    case "preview_batch":
      result = publicAgentBatchPreview(previewAgentBatch(project, command), command);
      break;
    case "apply_previewed_batch": {
      const expectedPreviewDigest = String(command.expectedPreviewDigest ?? "").trim();
      if (!/^sha256:[a-f0-9]{64}$/i.test(expectedPreviewDigest)) throw new Error("apply_previewed_batch requires the SHA-256 expectedPreviewDigest returned by preview_batch.");
      const plan = previewAgentBatch(project, command);
      if (plan.previewDigest !== expectedPreviewDigest) throw new Error(`[stale-batch-preview] Batch expected ${expectedPreviewDigest}, but the exact current preview is ${plan.previewDigest}. Review the changed commands, summary, profile, source, or projected outcome before applying.`);
      if (plan.commandErrors.length) throw new Error(`Batch rejected at command ${plan.commandErrors[0].index}: ${plan.commandErrors[0].message}`);
      if (!plan.validation.valid) throw new Error(`Batch rejected: the projected project is invalid: ${plan.validation.errors.join(" ")}`);
      if (plan.doctor.newBlockers.length) throw new Error(`Batch rejected: it introduces ${plan.doctor.newBlockers.length} new Project Doctor blocker(s): ${plan.doctor.newBlockers.map((issue) => issue.code).join(", ")}.`);
      project = plan.projectedProject;
      changed = plan.changed;
      result = { ...publicAgentBatchPreview(plan, command), applied: true, schemaVersion: LOOPLAB_AGENT_BATCH_PREVIEW_SCHEMA };
      break;
    }
    case "auto_repair": {
      const plan = previewMechanicalAutoRepair(project, command);
      if (command.apply === true) {
        const expectedRepairDigest = String(command.expectedRepairDigest ?? "").trim();
        if (!/^sha256:[a-f0-9]{64}$/i.test(expectedRepairDigest)) throw new Error("auto_repair apply requires the SHA-256 expectedRepairDigest returned by its exact dry-run preview.");
        if (plan.repairDigest !== expectedRepairDigest) throw new Error(`[stale-repair-plan] Mechanical repair expected ${expectedRepairDigest}, but the exact current plan is ${plan.repairDigest}. Review the changed source, filters, limits, commands, or Doctor projection before applying.`);
        if (!plan.applicable) throw new Error("Mechanical repair is not applicable: no source-changing safe repair passed validation and both Doctor gates.");
        project = plan.projectedProject;
        changed = plan.changed;
        changeRecordCommand = { ...command, commands: plan.commands };
        result = { ...publicMechanicalRepairPlan(plan), applied: true };
      } else result = { ...publicMechanicalRepairPlan(plan), applied: false };
      break;
    }
    case "converge": {
      const plan = previewMechanicalConvergence(project, command);
      if (command.apply === true) {
        const expectedConvergenceDigest = String(command.expectedConvergenceDigest ?? "").trim();
        if (!/^sha256:[a-f0-9]{64}$/i.test(expectedConvergenceDigest)) throw new Error("converge apply requires the SHA-256 expectedConvergenceDigest returned by its exact dry-run preview.");
        if (plan.convergenceDigest !== expectedConvergenceDigest) throw new Error(`[stale-convergence-plan] Convergence expected ${expectedConvergenceDigest}, but the exact current plan is ${plan.convergenceDigest}. Review the changed source, filters, limits, pass receipts, or residue before applying.`);
        if (!plan.applicable) throw new Error(`Convergence is not applicable (stopReason=${plan.stopReason}); no exact bounded improvement can be committed.`);
        project = plan.projectedProject;
        changed = plan.changed;
        changeRecordCommand = { ...command, commands: plan.passes.flatMap((pass) => pass.repairs.map((repair) => repair.command)).slice(0, 64) };
        result = { ...publicConvergencePlan(plan), applied: true };
      } else result = { ...publicConvergencePlan(plan), applied: false };
      break;
    }
    case "list_builder_benchmarks":
      result = listBuilderBenchmarks(command);
      break;
    case "evaluate_builder_benchmark": {
      const current = syncActiveMap(project);
      const validation = validateProject(current);
      const currentDoctor = analyzeProject(current, { profile: current.doctorProfile });
      const releaseDoctor = currentDoctor.profile === "production" ? currentDoctor : analyzeProject(current, { profile: "production" });
      let standaloneAudit;
      let htmlGenerationError = null;
      try {
        standaloneAudit = auditStandaloneHtml(buildStandaloneHtml(current));
      } catch (error) {
        htmlGenerationError = error instanceof Error ? error.message : String(error);
        standaloneAudit = { valid: false, byteLength: null, errors: [], warnings: [], generationError: htmlGenerationError };
      }
      result = evaluateBuilderBenchmark(current, command.benchmarkId, { validation, currentDoctor, releaseDoctor, standaloneAudit, htmlGenerationError, run: command.run });
      break;
    }
    case "compare_builder_benchmark_runs":
      result = compareBuilderBenchmarkRuns(command.baselineRuns, command.candidateRuns);
      break;
    case "validate":
      result = validateProject(project);
      break;
    case "doctor":
    case "get_doctor":
      result = analyzeProject(syncActiveMap(project), { profile: command.profile });
      break;
    case "get_privacy_report":
      result = analyzeProject(syncActiveMap(project), { profile: command.profile }).privacyReport;
      break;
    case "get_release_verification": {
      const current = syncActiveMap(project);
      const doctor = analyzeProject(current, { profile: "production" });
      const verification = validateReleaseVerification(current.releaseVerification, { sourceDigest: doctor.sourceDigest, runtimeVersion: LOOPLAB_EXPORTED_RUNTIME_VERSION });
      result = {
        schemaVersion: LOOPLAB_RELEASE_VERIFICATION_SCHEMA,
        present: Boolean(current.releaseVerification),
        current: verification.current,
        sourceDigest: doctor.sourceDigest,
        policy: getReleaseVerificationPolicy(),
        verification,
        attestation: verification.attestation ? clone(verification.attestation) : null,
      };
      break;
    }
    case "get_motion_body_report":
      result = inspectMotionBodies(syncActiveMap(project), { strict: command.profile === "production" });
      break;
    case "suggest_motion_body":
      result = suggestMotionBody(syncActiveMap(project), command);
      break;
    case "get_runtime_join_plan":
      result = buildRuntimeJoinPlan(syncActiveMap(project));
      break;
    case "get_acceptance_plan": {
      const current = syncActiveMap(project);
      const doctor = analyzeProject(current);
      result = doctor.acceptancePlan ?? getAcceptancePlan(current, { sourceDigest: doctor.sourceDigest, acceptanceResults: doctor.acceptanceResults, replayResults: doctor.replayResults });
      break;
    }
    case "run_acceptance_suite": {
      const current = syncActiveMap(project);
      result = runAcceptanceSuite(current, { testId: command.testId ?? command.id, sourceDigest: doctorSourceDigest(current) });
      break;
    }
    case "get_completion_report": {
      const current = syncActiveMap(project);
      result = analyzeProject(current, { profile: command.profile }).completionReport;
      break;
    }
    case "run_bot_cohorts": {
      const current = syncActiveMap(project);
      result = runBotCohorts(current, { ...command, sourceDigest: doctorSourceDigest(current) });
      break;
    }
    case "run_replay_suite":
      result = runReplaySuite(syncActiveMap(project), { caseId: command.caseId });
      break;
    case "preview_playtest_replay":
      result = previewPlaytestReplay(syncActiveMap(project), command.session, command);
      break;
    case "promote_playtest_replay": {
      project = syncActiveMap(project);
      const preview = authorizePlaytestReplayPromotion(project, command.session, command);
      const installed = installRecordedReplayCase(project, preview.replaySpecification);
      project = installed.project;
      changed = true;
      result = {
        schemaVersion: "looplab-playtest-replay-promotion-receipt/v1",
        promoted: true,
        sourceDigest: preview.sourceDigest,
        sessionDigest: preview.sessionDigest,
        promotionDigest: preview.promotionDigest,
        replayCase: clone(installed.recorded.replayCase),
        replayResult: clone(installed.recorded.result),
        eventComparison: clone(preview.eventComparison),
      };
      break;
    }
    case "record_replay_case": {
      const installed = installRecordedReplayCase(project, command);
      project = installed.project;
      changed = true;
      result = { replayCase: clone(installed.recorded.replayCase), replayResult: installed.recorded.result };
      break;
    }
    case "remove_replay_case": {
      const id = String(command.id ?? command.caseId ?? "").trim();
      if (!id) throw new Error("remove_replay_case requires id or caseId.");
      const changeReason = String(command.changeReason ?? "").trim();
      if (!changeReason) throw new Error("remove_replay_case requires changeReason so removing a regression bar is explicit.");
      if (changeReason.length > 1200) throw new Error("remove_replay_case changeReason must be at most 1200 characters.");
      project = syncActiveMap(project);
      const cases = project.replay?.cases ?? [];
      const removedCase = cases.find((replayCase) => replayCase.id === id);
      if (!removedCase) throw new Error(`Replay case was not found: ${id}`);
      const nextCases = cases.filter((replayCase) => replayCase.id !== id);
      const priorChangeLog = Array.isArray(project.replay?.changeLog) ? project.replay.changeLog : [];
      const sequence = priorChangeLog.reduce((maximum, entry) => Math.max(maximum, Number.isInteger(entry?.sequence) ? entry.sequence : 0), 0) + 1;
      const change = {
        sequence,
        action: "removed",
        caseId: id,
        revision: Number(removedCase.revision ?? 1),
        changeReason,
        sourceDigest: doctorSourceDigest(project),
        priorCaseDigest: canonicalSha256(removedCase),
      };
      project.replay = {
        ...(project.replay ?? { version: "1", tickRate: 60, seed: 1 }),
        cases: nextCases,
        changeLog: [...priorChangeLog.slice(-127), change],
      };
      changed = true;
      result = { removedId: id, change: clone(change) };
      break;
    }
    case "set_feature_contracts": {
      project.featureContracts = normalizeUniqueAuthoredRecords(command.contracts ?? command.featureContracts, "featureContracts", normalizeFeatureContract, 128);
      changed = true;
      result = { count: project.featureContracts.length, ids: project.featureContracts.map((contract) => contract.id) };
      break;
    }
    case "upsert_feature_contract": {
      const contract = normalizeFeatureContract(command.contract);
      project.featureContracts = upsertAuthoredRecord(project.featureContracts, contract);
      changed = true;
      result = { contract: clone(contract), created: !(inputProject.featureContracts ?? []).some((candidate) => candidate.id === contract.id) };
      break;
    }
    case "remove_feature_contract": {
      const id = normalizeStableAuthoredId(command.id, "remove_feature_contract");
      const contracts = project.featureContracts ?? [];
      const nextContracts = contracts.filter((contract) => contract.id !== id);
      if (nextContracts.length === contracts.length) throw new Error(`Feature contract was not found: ${id}`);
      project.featureContracts = nextContracts;
      changed = true;
      result = { removedId: id };
      break;
    }
    case "set_acceptance_tests": {
      project.acceptanceTests = normalizeUniqueAuthoredRecords(command.tests ?? command.acceptanceTests, "acceptanceTests", normalizeAcceptanceTest, 256);
      changed = true;
      result = { count: project.acceptanceTests.length, ids: project.acceptanceTests.map((acceptanceTest) => acceptanceTest.id) };
      break;
    }
    case "upsert_acceptance_test": {
      const acceptanceTest = normalizeAcceptanceTest(command.test ?? command.acceptanceTest);
      project.acceptanceTests = upsertAuthoredRecord(project.acceptanceTests, acceptanceTest);
      changed = true;
      result = { acceptanceTest: clone(acceptanceTest), created: !(inputProject.acceptanceTests ?? []).some((candidate) => candidate.id === acceptanceTest.id) };
      break;
    }
    case "remove_acceptance_test": {
      const id = normalizeStableAuthoredId(command.id, "remove_acceptance_test");
      const acceptanceTests = project.acceptanceTests ?? [];
      const nextTests = acceptanceTests.filter((acceptanceTest) => acceptanceTest.id !== id);
      if (nextTests.length === acceptanceTests.length) throw new Error(`Acceptance test was not found: ${id}`);
      project.acceptanceTests = nextTests;
      changed = true;
      result = { removedId: id };
      break;
    }
    case "set_project": {
      const changes = command.changes;
      if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw new Error("set_project requires a changes object.");
      for (const [key, value] of Object.entries(changes)) {
        if (!PROJECT_FIELDS.has(key)) throw new Error(`set_project cannot change ${key}.`);
        if (key === "movementTuning") {
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("set_project movementTuning must be an object.");
          project.movementTuning = { ...(project.movementTuning ?? {}), ...clone(value) };
        } else {
          project[key] = value;
        }
      }
      changed = true;
      result = { updated: Object.keys(changes) };
      break;
    }
    case "set_runtime_profile": {
      const framework = String(command.framework ?? "").trim().toLowerCase();
      const adapter = LOOPLAB_RELEASE_READY_RUNTIME_ADAPTERS[framework];
      if (!adapter) throw new Error("set_runtime_profile framework must be canvas, phaser, pixi, or melon.");
      const persistenceProfile = exportProfileId(project);
      const currentSaveProgram = clone(project.saveProgram ?? null);
      project.runtimeProfile = { dimension: "2d", framework };
      project.release = {
        ...(project.release ?? {}),
        singleFile: true,
        networkFree: true,
        allowNetwork: false,
        runtimeBundleEmbedded: true,
        engineDelivery: adapter.engineDelivery,
        moduleImports: [],
        externalRequests: [],
        assetLookupValidated: true,
      };
      project = projectWithExportProfile(project, {
        profile: persistenceProfile,
        portableSaves: currentSaveProgram?.enabled === true && currentSaveProgram?.portableCodes === true,
        autoSave: currentSaveProgram?.hosted?.autoSave !== false,
        restoreOnBoot: currentSaveProgram?.hosted?.restoreOnBoot !== false,
      }).project;
      changed = true;
      result = {
        framework,
        exportProfile: persistenceProfile,
        reason: typeof command.reason === "string" && command.reason.trim() ? command.reason.trim() : null,
        primaryFrameOwner: adapter.primaryFrameOwner,
        renderAdapter: adapter.renderAdapter,
        singleFileDelivery: adapter.engineDelivery,
        ...(adapter.vendor ? { version: adapter.vendor.version, browserBundleBytes: adapter.vendor.browserBundleBytes, browserBundleSha256: adapter.vendor.browserBundleSha256 } : {}),
      };
      break;
    }
    case "set_export_profile": {
      const profile = String(command.profile ?? "").trim().toLowerCase();
      const transitioned = projectWithExportProfile(project, {
        profile,
        portableSaves: command.portableSaves === true,
        autoSave: command.autoSave !== false,
        restoreOnBoot: command.restoreOnBoot !== false,
      });
      project = transitioned.project;
      const sourceDigest = doctorSourceDigest(syncActiveMap(clone(project)));
      changed = true;
      result = {
        profile,
        sourceDigest,
        release: clone(project.release),
        saveProgram: clone(project.saveProgram ?? null),
        report: inspectSaveProgram(project, project.saveProgram, { sourceDigest }),
      };
      break;
    }
    case "add_object": {
      const properties = command.object ?? {};
      const kind = command.kind ?? properties.kind;
      const object = createObject(kind, properties);
      if (project.objects.some((candidate) => candidate.id === object.id)) throw new Error(`Object id already exists: ${object.id}`);
      project.objects.push(object);
      changed = true;
      result = { object: clone(object) };
      break;
    }
    case "update_object": {
      const index = findObjectIndex(project, command);
      if (index < 0) throw new Error("Object was not found.");
      const changes = clone(command.changes ?? {});
      if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw new Error("update_object requires a changes object.");
      const unsupported = unsupportedObjectUpdateFields(changes);
      if (unsupported.includes("motionBody")) throw new Error("update_object cannot change motionBody; use set_motion_body or remove_motion_body.");
      if (unsupported.some((key) => key === "id" || key === "kind")) throw new Error(`update_object cannot change ${unsupported.filter((key) => key === "id" || key === "kind").join(", ")}; recreate the object intentionally instead.`);
      if (unsupported.length) throw new Error(`update_object cannot change unsupported field${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}.`);
      if (changes.collisionOwner !== undefined && changes.collisionOwner !== "authored-map") throw new Error("update_object cannot change collisionOwner to anything except authored-map.");
      const next = { ...project.objects[index], ...changes };
      project.objects[index] = next;
      changed = true;
      result = { object: clone(next), changedFields: Object.keys(changes) };
      break;
    }
    case "set_motion_body": {
      const index = findObjectIndex(project, command);
      if (index < 0) throw new Error("Object was not found.");
      const input = command.body ?? command.motionBody;
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("set_motion_body requires a body object.");
      const motionBody = normalizeMotionBody(input);
      project.objects[index] = { ...project.objects[index], motionBody };
      changed = true;
      result = { objectId: project.objects[index].id, motionBody: clone(motionBody) };
      break;
    }
    case "remove_motion_body": {
      const index = findObjectIndex(project, command);
      if (index < 0) throw new Error("Object was not found.");
      const previous = clone(project.objects[index].motionBody ?? null);
      delete project.objects[index].motionBody;
      changed = previous !== null;
      result = { objectId: project.objects[index].id, removed: previous };
      break;
    }
    case "attach_to_support": {
      const index = findObjectIndex(project, command);
      if (index < 0) throw new Error("Object was not found.");
      const snapped = snapObjectToSupport(project, project.objects[index].id, {
        mode: command.mode ?? "auto",
        surfaceId: command.surfaceId,
        offset: command.offset,
        tolerance: command.tolerance,
        projection: project.projection,
      }, project.assets ?? []);
      project.objects[index] = snapped.object;
      changed = true;
      result = { object: clone(snapped.object), contact: clone(snapped.contact), surface: clone(snapped.surface) };
      break;
    }
    case "inspect_supports": {
      const index = findObjectIndex(project, command);
      if (index < 0) throw new Error("Object was not found.");
      const object = project.objects[index];
      result = {
        object: clone(object),
        contact: clone(resolveSupportContact(project, object, project.assets ?? [], { projection: project.projection })),
        surfaces: clone(listSupportSurfaces(project, object.id)),
      };
      break;
    }
    case "remove_object": {
      const index = findObjectIndex(project, command);
      if (index < 0) throw new Error("Object was not found.");
      const [removed] = project.objects.splice(index, 1);
      changed = true;
      result = { removed: clone(removed) };
      break;
    }
    case "duplicate_object": {
      const index = findObjectIndex(project, command);
      if (index < 0) throw new Error("Object was not found.");
      const source = project.objects[index];
      const copy = {
        ...source,
        id: command.newId ?? makeId(),
        name: command.newName ?? `${source.name} copy`,
        x: source.x + (command.offsetX ?? project.grid),
        y: source.y + (command.offsetY ?? project.grid),
      };
      if (project.objects.some((object) => object.id === copy.id)) throw new Error(`Object id already exists: ${copy.id}`);
      project.objects.push(copy);
      changed = true;
      result = { object: clone(copy) };
      break;
    }
    case "clear_objects": {
      const kind = command.kind;
      const before = project.objects.length;
      project.objects = kind ? project.objects.filter((object) => object.kind !== kind) : [];
      changed = before !== project.objects.length;
      result = { removedCount: before - project.objects.length };
      break;
    }
    case "reorder_object": {
      const index = findObjectIndex(project, command);
      if (index < 0) throw new Error("Object was not found.");
      const [object] = project.objects.splice(index, 1);
      if (command.position === "front") project.objects.push(object);
      else if (command.position === "back") project.objects.unshift(object);
      else throw new Error("reorder_object position must be front or back.");
      changed = true;
      result = { object: clone(object), position: command.position };
      break;
    }
    case "set_map_projection": {
      const requested = command.projection ?? { type: command.type ?? "orthographic" };
      const projection = requested.type === "dimetric-2:1"
        ? normalizeProjection({ ...requested, type: "dimetric-2:1", tileWidth: 128, tileHeight: 64 }, project)
        : normalizeProjection({ ...requested, type: "orthographic", tileWidth: requested.tileWidth ?? project.grid, tileHeight: requested.tileHeight ?? project.grid }, project);
      project.projection = projection;
      if (projection.type === "dimetric-2:1" && command.preserveControlMode !== true) {
        project.controlMode = "topdown";
        project.gravity = 0;
      }
      changed = true;
      result = { mapId: project.activeMapId, projection: clone(projection), controlMode: project.controlMode };
      break;
    }
    case "add_navigation_layer": {
      project.navigation = createNavigationModel(project.navigation);
      const layer = {
        id: String(command.layer?.id ?? command.id ?? makeId()),
        name: String(command.layer?.name ?? command.name ?? `Route layer ${project.navigation.layers.length + 1}`),
        color: String(command.layer?.color ?? "#5b5cf0"),
        visible: command.layer?.visible !== false,
        locked: command.layer?.locked === true,
        zMin: Number(command.layer?.zMin ?? command.zMin ?? 0),
        zMax: Number(command.layer?.zMax ?? command.zMax ?? Number(command.layer?.zMin ?? command.zMin ?? 0) + 1),
      };
      if (project.navigation.layers.some((candidate) => candidate.id === layer.id)) throw new Error(`Navigation layer id already exists: ${layer.id}`);
      project.navigation.layers.push(layer);
      project.navigation.activeLayerId = layer.id;
      changed = true;
      result = { layer: clone(layer), mapId: project.activeMapId };
      break;
    }
    case "update_navigation_layer": {
      project.navigation = createNavigationModel(project.navigation);
      const index = project.navigation.layers.findIndex((layer) => layer.id === command.id);
      if (index < 0) throw new Error("Navigation layer was not found.");
      const changes = clone(command.changes ?? {});
      const allowed = new Set(["name", "color", "visible", "locked", "zMin", "zMax"]);
      for (const key of Object.keys(changes)) if (!allowed.has(key)) throw new Error(`update_navigation_layer cannot change ${key}.`);
      project.navigation.layers[index] = { ...project.navigation.layers[index], ...changes, id: project.navigation.layers[index].id };
      changed = true;
      result = { layer: clone(project.navigation.layers[index]), mapId: project.activeMapId };
      break;
    }
    case "remove_navigation_layer": {
      project.navigation = createNavigationModel(project.navigation);
      const index = project.navigation.layers.findIndex((layer) => layer.id === command.id);
      if (index < 0) throw new Error("Navigation layer was not found.");
      const used = project.navigation.nodes.some((node) => node.layerId === command.id)
        || project.navigation.links.some((link) => link.layerId === command.id)
        || project.navigation.areas.some((area) => area.layerId === command.id)
        || (project.traversalPaths ?? []).some((path) => path.routeLayer === command.id);
      if (used && command.reassignTo === undefined) throw new Error("Navigation layer is still used. Provide reassignTo or move its nodes, links, areas, and traversal paths first.");
      if (used) {
        const target = String(command.reassignTo || "");
        if (!target || !project.navigation.layers.some((layer) => layer.id === target && layer.id !== command.id)) throw new Error("reassignTo must reference another navigation layer.");
        project.navigation.nodes = project.navigation.nodes.map((node) => node.layerId === command.id ? { ...node, layerId: target } : node);
        project.navigation.links = project.navigation.links.map((link) => link.layerId === command.id ? { ...link, layerId: target } : link);
        project.navigation.areas = project.navigation.areas.map((area) => area.layerId === command.id ? { ...area, layerId: target } : area);
        project.traversalPaths = (project.traversalPaths ?? []).map((path) => path.routeLayer === command.id ? { ...path, routeLayer: target } : path);
      }
      const [removed] = project.navigation.layers.splice(index, 1);
      if (project.navigation.activeLayerId === removed.id) project.navigation.activeLayerId = project.navigation.layers[0]?.id ?? "";
      changed = true;
      result = { removed: clone(removed), mapId: project.activeMapId };
      break;
    }
    case "add_navigation_node": {
      project.navigation = createNavigationModel(project.navigation);
      const activeLayer = project.navigation.layers.find((layer) => layer.id === (command.node?.layerId ?? command.layerId ?? project.navigation.activeLayerId));
      const node = {
        id: String(command.node?.id ?? command.id ?? makeId()),
        x: Number(command.node?.x ?? command.x ?? project.width / 2),
        y: Number(command.node?.y ?? command.y ?? project.height / 2),
        z: Number(command.node?.z ?? command.z ?? activeLayer?.zMin ?? 0),
        ...(activeLayer ? { layerId: activeLayer.id } : {}),
        ...(command.node?.destinationId ?? command.destinationId ? { destinationId: String(command.node?.destinationId ?? command.destinationId) } : {}),
        ...(Array.isArray(command.node?.tags) ? { tags: command.node.tags.map(String) } : {}),
      };
      if (project.navigation.nodes.some((candidate) => candidate.id === node.id)) throw new Error(`Navigation node id already exists: ${node.id}`);
      project.navigation.nodes.push(node);
      changed = true;
      result = { node: clone(node), mapId: project.activeMapId };
      break;
    }
    case "update_navigation_node": {
      project.navigation = createNavigationModel(project.navigation);
      const index = project.navigation.nodes.findIndex((node) => node.id === command.id);
      if (index < 0) throw new Error("Navigation node was not found.");
      const changes = clone(command.changes ?? {});
      const allowed = new Set(["x", "y", "z", "layerId", "destinationId", "tags"]);
      for (const key of Object.keys(changes)) if (!allowed.has(key)) throw new Error(`update_navigation_node cannot change ${key}.`);
      project.navigation.nodes[index] = { ...project.navigation.nodes[index], ...changes, id: project.navigation.nodes[index].id };
      changed = true;
      result = { node: clone(project.navigation.nodes[index]), mapId: project.activeMapId };
      break;
    }
    case "remove_navigation_node": {
      project.navigation = createNavigationModel(project.navigation);
      const index = project.navigation.nodes.findIndex((node) => node.id === command.id);
      if (index < 0) throw new Error("Navigation node was not found.");
      const [removed] = project.navigation.nodes.splice(index, 1);
      const beforeLinks = project.navigation.links.length;
      project.navigation.links = project.navigation.links.filter((link) => link.a !== removed.id && link.b !== removed.id);
      changed = true;
      result = { removed: clone(removed), removedLinkCount: beforeLinks - project.navigation.links.length, mapId: project.activeMapId };
      break;
    }
    case "connect_navigation_nodes": {
      project.navigation = createNavigationModel(project.navigation);
      const a = String(command.a ?? "");
      const b = String(command.b ?? "");
      if (!project.navigation.nodes.some((node) => node.id === a) || !project.navigation.nodes.some((node) => node.id === b)) throw new Error("connect_navigation_nodes requires existing a and b node ids.");
      if (a === b) throw new Error("A navigation link must connect two different nodes.");
      const link = {
        id: String(command.link?.id ?? command.id ?? makeId()),
        a,
        b,
        ...(command.link?.layerId ?? command.layerId ?? project.navigation.activeLayerId ? { layerId: String(command.link?.layerId ?? command.layerId ?? project.navigation.activeLayerId) } : {}),
        cost: Math.max(0.01, Number(command.link?.cost ?? command.cost ?? 1)),
        oneWay: (command.link?.oneWay ?? command.oneWay) === true,
      };
      if (project.navigation.links.some((candidate) => candidate.id === link.id)) throw new Error(`Navigation link id already exists: ${link.id}`);
      project.navigation.links.push(link);
      changed = true;
      result = { link: clone(link), mapId: project.activeMapId };
      break;
    }
    case "update_navigation_link": {
      project.navigation = createNavigationModel(project.navigation);
      const index = project.navigation.links.findIndex((link) => link.id === command.id);
      if (index < 0) throw new Error("Navigation link was not found.");
      const changes = clone(command.changes ?? {});
      const allowed = new Set(["a", "b", "layerId", "cost", "oneWay"]);
      for (const key of Object.keys(changes)) if (!allowed.has(key)) throw new Error(`update_navigation_link cannot change ${key}.`);
      project.navigation.links[index] = { ...project.navigation.links[index], ...changes, id: project.navigation.links[index].id };
      changed = true;
      result = { link: clone(project.navigation.links[index]), mapId: project.activeMapId };
      break;
    }
    case "remove_navigation_link": {
      project.navigation = createNavigationModel(project.navigation);
      const index = project.navigation.links.findIndex((link) => link.id === command.id);
      if (index < 0) throw new Error("Navigation link was not found.");
      const [removed] = project.navigation.links.splice(index, 1);
      changed = true;
      result = { removed: clone(removed), mapId: project.activeMapId };
      break;
    }
    case "add_navigation_area": {
      project.navigation = createNavigationModel(project.navigation);
      const source = clone(command.area ?? command);
      const area = createNavigationModel({ areas: [{
        id: source.id ?? makeId(),
        name: source.name ?? `${source.kind === "blocked" ? "Blocked" : "Walkable"} area ${project.navigation.areas.length + 1}`,
        kind: source.kind,
        points: source.points,
        layerId: source.layerId ?? project.navigation.activeLayerId,
        zMin: source.zMin ?? 0,
        zMax: source.zMax ?? Number(source.zMin ?? 0) + 1,
      }] }).areas[0];
      if (area.points.length < 3) throw new Error("add_navigation_area requires at least three polygon points.");
      if (project.navigation.areas.some((candidate) => candidate.id === area.id)) throw new Error(`Navigation area id already exists: ${area.id}`);
      project.navigation.areas.push(area);
      changed = true;
      result = { area: clone(area), mapId: project.activeMapId };
      break;
    }
    case "update_navigation_area": {
      project.navigation = createNavigationModel(project.navigation);
      const index = project.navigation.areas.findIndex((area) => area.id === command.id);
      if (index < 0) throw new Error("Navigation area was not found.");
      const changes = clone(command.changes ?? {});
      const allowed = new Set(["name", "kind", "points", "layerId", "zMin", "zMax"]);
      for (const key of Object.keys(changes)) if (!allowed.has(key)) throw new Error(`update_navigation_area cannot change ${key}.`);
      const normalized = createNavigationModel({ areas: [{ ...project.navigation.areas[index], ...changes }] }).areas[0];
      if (normalized.points.length < 3) throw new Error("A navigation area must keep at least three polygon points.");
      project.navigation.areas[index] = normalized;
      changed = true;
      result = { area: clone(normalized), mapId: project.activeMapId };
      break;
    }
    case "remove_navigation_area": {
      project.navigation = createNavigationModel(project.navigation);
      const index = project.navigation.areas.findIndex((area) => area.id === command.id);
      if (index < 0) throw new Error("Navigation area was not found.");
      const [removed] = project.navigation.areas.splice(index, 1);
      changed = true;
      result = { removed: clone(removed), mapId: project.activeMapId };
      break;
    }
    case "get_authored_route_document": {
      project.navigation = createNavigationModel(project.navigation);
      const authoredRoute = normalizeAuthoredRouteDocument(project.navigation.authoredRoute);
      result = {
        summary: summarizeAuthoredRouteDocument(authoredRoute),
        ...(command.summaryOnly === true ? {} : { authoredRoute: clone(authoredRoute) }),
        mapId: project.activeMapId,
      };
      break;
    }
    case "set_authored_route_document": {
      project.navigation = setAuthoredRouteDocument(project.navigation, command.data ?? command.authoredRoute, {
        sourceFormat: command.sourceFormat,
        coordinateSpace: command.coordinateSpace,
      });
      changed = true;
      result = { summary: summarizeAuthoredRouteDocument(project.navigation.authoredRoute), mapId: project.activeMapId };
      break;
    }
    case "update_authored_route_actor": {
      project.navigation = createNavigationModel(project.navigation);
      const route = normalizeAuthoredRouteDocument(project.navigation.authoredRoute);
      if (!route) throw new Error("No authored route document is attached to this map.");
      const data = clone(route.data);
      const collectionKey = Array.isArray(data.actors) ? "actors" : Array.isArray(data.characters) ? "characters" : null;
      if (!collectionKey) throw new Error("The authored route document has no actors or characters array.");
      const index = data[collectionKey].findIndex((actor) => String(actor.id) === String(command.id ?? command.actorId));
      if (index < 0) throw new Error("Authored route actor was not found.");
      const changes = clone(command.changes ?? {});
      data[collectionKey][index] = { ...data[collectionKey][index], ...changes, id: data[collectionKey][index].id };
      for (const key of Array.isArray(command.unset) ? command.unset : []) {
        if (typeof key === "string" && key && key !== "id") delete data[collectionKey][index][key];
      }
      const routeChanged = authoredRouteDocumentDigest(data) !== authoredRouteDocumentDigest(route.data);
      if (routeChanged) project.navigation.authoredRoute = markAuthoredRouteDocumentEdited(route, data, `Actor ${data[collectionKey][index].id} changed`);
      changed = routeChanged;
      result = { actor: clone(data[collectionKey][index]), changed: routeChanged, summary: summarizeAuthoredRouteDocument(project.navigation.authoredRoute), mapId: project.activeMapId };
      break;
    }
    case "update_authored_route_step": {
      project.navigation = createNavigationModel(project.navigation);
      const route = normalizeAuthoredRouteDocument(project.navigation.authoredRoute);
      if (!route) throw new Error("No authored route document is attached to this map.");
      const data = clone(route.data);
      const actors = Array.isArray(data.actors) ? data.actors : Array.isArray(data.characters) ? data.characters : null;
      if (!actors) throw new Error("The authored route document has no actors or characters array.");
      const actor = actors.find((candidate) => String(candidate.id) === String(command.actorId));
      if (!actor || !Array.isArray(actor.schedule)) throw new Error("Authored route actor or schedule was not found.");
      const stepIndex = Math.floor(Number(command.stepIndex));
      if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= actor.schedule.length) throw new Error("stepIndex must reference an existing schedule step.");
      actor.schedule[stepIndex] = { ...actor.schedule[stepIndex], ...clone(command.changes ?? {}) };
      for (const key of Array.isArray(command.unset) ? command.unset : []) {
        if (typeof key === "string" && key) delete actor.schedule[stepIndex][key];
      }
      const routeChanged = authoredRouteDocumentDigest(data) !== authoredRouteDocumentDigest(route.data);
      if (routeChanged) project.navigation.authoredRoute = markAuthoredRouteDocumentEdited(route, data, `Actor ${actor.id} schedule step ${stepIndex} changed`);
      changed = routeChanged;
      result = { actorId: actor.id, stepIndex, step: clone(actor.schedule[stepIndex]), changed: routeChanged, summary: summarizeAuthoredRouteDocument(project.navigation.authoredRoute), mapId: project.activeMapId };
      break;
    }
    case "update_authored_route_meeting": {
      project.navigation = createNavigationModel(project.navigation);
      const route = normalizeAuthoredRouteDocument(project.navigation.authoredRoute);
      if (!route) throw new Error("No authored route document is attached to this map.");
      const data = clone(route.data);
      if (!Array.isArray(data.meetings)) throw new Error("The authored route document has no meetings array.");
      const index = data.meetings.findIndex((meeting) => String(meeting.id) === String(command.id ?? command.meetingId));
      if (index < 0) throw new Error("Authored route meeting was not found.");
      data.meetings[index] = { ...data.meetings[index], ...clone(command.changes ?? {}), id: data.meetings[index].id };
      for (const key of Array.isArray(command.unset) ? command.unset : []) {
        if (typeof key === "string" && key && key !== "id") delete data.meetings[index][key];
      }
      const routeChanged = authoredRouteDocumentDigest(data) !== authoredRouteDocumentDigest(route.data);
      if (routeChanged) project.navigation.authoredRoute = markAuthoredRouteDocumentEdited(route, data, `Meeting ${data.meetings[index].id} changed`);
      changed = routeChanged;
      result = { meeting: clone(data.meetings[index]), changed: routeChanged, summary: summarizeAuthoredRouteDocument(project.navigation.authoredRoute), mapId: project.activeMapId };
      break;
    }
    case "verify_authored_route_document": {
      project.navigation = verifyAuthoredRouteDocument(project.navigation, command.evidence ?? command);
      changed = true;
      result = { summary: summarizeAuthoredRouteDocument(project.navigation.authoredRoute), integrity: clone(project.navigation.authoredRoute.integrity), mapId: project.activeMapId };
      break;
    }
    case "remove_authored_route_document": {
      project.navigation = createNavigationModel(project.navigation);
      if (!project.navigation.authoredRoute) throw new Error("No authored route document is attached to this map.");
      const removed = project.navigation.authoredRoute;
      delete project.navigation.authoredRoute;
      changed = true;
      result = { removed: summarizeAuthoredRouteDocument(removed), mapId: project.activeMapId };
      break;
    }
    case "export_authored_route_document": {
      project.navigation = createNavigationModel(project.navigation);
      const authoredRoute = normalizeAuthoredRouteDocument(project.navigation.authoredRoute);
      if (!authoredRoute) throw new Error("No authored route document is attached to this map.");
      result = { data: clone(authoredRoute.data), integrity: clone(authoredRoute.integrity), summary: summarizeAuthoredRouteDocument(authoredRoute), mapId: project.activeMapId };
      break;
    }
    case "import_path_editor_navigation": {
      project.navigation = importPathEditorNavigation(command.data, project);
      const importedProjection = command.data?.looplab?.projection;
      if (importedProjection && typeof importedProjection === "object" && !Array.isArray(importedProjection)) {
        project.projection = normalizeAuthoredProjection(importedProjection, project);
      }
      const importedElevationTransitions = command.data?.looplab?.elevationTransitions;
      if (importedElevationTransitions !== undefined) {
        const inspection = inspectElevationTransitions({ ...project, maps: undefined }, importedElevationTransitions, { mapId: project.activeMapId });
        if (!inspection.valid) throw new Error(inspection.errors[0] || "Path Editor elevation transitions are invalid.");
        project.elevationTransitions = normalizeElevationTransitions(importedElevationTransitions);
      }
      changed = true;
      result = { navigation: clone(project.navigation), projection: clone(project.projection), elevationTransitions: clone(project.elevationTransitions ?? null), authoredRoute: summarizeAuthoredRouteDocument(project.navigation.authoredRoute), sourceFormat: "path-editor-v2", mapId: project.activeMapId };
      break;
    }
    case "export_path_editor_navigation": {
      result = {
        data: exportPathEditorNavigation(project.navigation, {
          id: project.activeMapId,
          width: project.width,
          height: project.height,
          grid: project.grid,
          projection: project.projection,
          elevationTransitions: project.elevationTransitions,
        }),
        sourceFormat: "looplab-navigation-v1",
        targetFormat: "path-editor-v2+looplab-rich-route-v2",
        mapId: project.activeMapId,
      };
      break;
    }
    case "test_navigation_route": {
      project.navigation = createNavigationModel(project.navigation);
      const from = command.from ?? project.navigation.testRoute?.from;
      const to = command.to ?? project.navigation.testRoute?.to;
      if (!from || !to) throw new Error("test_navigation_route requires from and to points or node ids.");
      const route = findNavigationPath(project.navigation, from, to, { layerIds: command.layerIds, elevationScale: project.projection?.elevationStep ?? 32 });
      if (command.save === true && typeof from !== "string" && typeof to !== "string") {
        project.navigation.testRoute = { from: clone(from), to: clone(to), ...(Array.isArray(command.layerIds) ? { layerIds: clone(command.layerIds) } : {}) };
        changed = true;
      }
      result = { route, mapId: project.activeMapId };
      break;
    }
    case "add_traversal_path": {
      project.traversalPaths ??= [];
      const path = clone(command.path ?? {});
      path.id ??= command.id ?? makeId();
      path.name ??= command.name ?? `Traversal path ${project.traversalPaths.length + 1}`;
      path.kind ??= "rail";
      path.collisionOwner = "authored-map";
      path.points ??= [
        { x: Math.round(project.width * 0.3), y: Math.round(project.height * 0.65), z: 0 },
        { x: Math.round(project.width * 0.7), y: Math.round(project.height * 0.65), z: 0 },
      ];
      path.entryRadius ??= 28;
      path.entryZTolerance ??= 0.5;
      path.minimumEntrySpeed ??= 80;
      path.direction ??= "both";
      path.acceleration ??= 0;
      path.maximumSpeed ??= 520;
      path.exitImpulse ??= { x: 0, y: -120, z: 0 };
      path.transferPathIds ??= [];
      path.bailBehavior ??= "drop";
      if (!path.routeLayer && project.navigation?.activeLayerId) path.routeLayer = project.navigation.activeLayerId;
      if (project.traversalPaths.some((candidate) => candidate.id === path.id)) throw new Error(`Traversal path id already exists: ${path.id}`);
      project.traversalPaths.push(path);
      changed = true;
      result = { path: clone(path), mapId: project.activeMapId };
      break;
    }
    case "update_traversal_path": {
      project.traversalPaths ??= [];
      const index = project.traversalPaths.findIndex((path) => path.id === command.id);
      if (index < 0) throw new Error("Traversal path was not found.");
      const changes = clone(command.changes ?? {});
      const allowed = new Set(["name", "kind", "points", "entryRadius", "entryZTolerance", "minimumEntrySpeed", "direction", "acceleration", "maximumSpeed", "exitImpulse", "transferPathIds", "bailBehavior", "routeLayer", "visualObjectId", "acceptanceTestId", "collisionOwner"]);
      for (const key of Object.keys(changes)) if (!allowed.has(key)) throw new Error(`update_traversal_path cannot change ${key}.`);
      if (changes.collisionOwner !== undefined && changes.collisionOwner !== "authored-map") throw new Error("update_traversal_path cannot change collisionOwner to anything except authored-map.");
      project.traversalPaths[index] = { ...project.traversalPaths[index], ...changes, id: project.traversalPaths[index].id, collisionOwner: "authored-map" };
      changed = true;
      result = { path: clone(project.traversalPaths[index]), mapId: project.activeMapId };
      break;
    }
    case "remove_traversal_path": {
      project.traversalPaths ??= [];
      const index = project.traversalPaths.findIndex((path) => path.id === command.id);
      if (index < 0) throw new Error("Traversal path was not found.");
      const [removed] = project.traversalPaths.splice(index, 1);
      project.traversalPaths = project.traversalPaths.map((path) => ({ ...path, transferPathIds: (path.transferPathIds ?? []).filter((id) => id !== removed.id) }));
      changed = true;
      result = { removed: clone(removed), mapId: project.activeMapId };
      break;
    }
    case "add_asset": {
      const asset = clone(command.asset);
      if (!asset || typeof asset !== "object" || Array.isArray(asset)) throw new Error("add_asset requires an asset object.");
      project.assets ??= [];
      if (project.assets.some((candidate) => candidate.id === asset.id)) throw new Error(`Asset id already exists: ${asset.id}`);
      project.assets.push(asset);
      changed = true;
      result = { asset: clone(asset) };
      break;
    }
    case "update_asset": {
      project.assets ??= [];
      const index = typeof command.id === "string"
        ? project.assets.findIndex((asset) => asset.id === command.id)
        : project.assets.findIndex((asset) => asset.name === command.name);
      if (index < 0) throw new Error("Asset was not found.");
      if (!command.changes || typeof command.changes !== "object" || Array.isArray(command.changes)) throw new Error("update_asset requires a changes object.");
      const changes = clone(command.changes);
      const allowed = new Set(["name", "type", "dataUrl", "width", "height", "frameWidth", "frameHeight", "frames", "columns", "anchorX", "anchorY", "anchorMode", "invariants", "analysis", "generator", "collisionPolicy"]);
      for (const key of Object.keys(changes)) if (!allowed.has(key)) throw new Error(`update_asset cannot change ${key}.`);
      if (changes.collisionPolicy !== undefined && changes.collisionPolicy !== "authored-only") throw new Error("update_asset cannot change collisionPolicy to anything except authored-only.");
      const current = project.assets[index];
      const updated = { ...current, ...changes, id: current.id, collisionPolicy: "authored-only" };
      project.assets[index] = updated;
      changed = true;
      const compactAsset = clone(updated);
      const dataUrl = compactAsset.dataUrl;
      delete compactAsset.dataUrl;
      result = {
        asset: compactAsset,
        changedFields: Object.keys(changes),
        embeddedData: {
          present: typeof dataUrl === "string" && dataUrl.length > 0,
          characterLength: typeof dataUrl === "string" ? dataUrl.length : 0,
        },
      };
      break;
    }
    case "remove_asset": {
      project.assets ??= [];
      const index = typeof command.id === "string"
        ? project.assets.findIndex((asset) => asset.id === command.id)
        : project.assets.findIndex((asset) => asset.name === command.name);
      if (index < 0) throw new Error("Asset was not found.");
      const [removed] = project.assets.splice(index, 1);
      project.objects = project.objects.map((object) => object.assetId === removed.id ? { ...object, assetId: undefined, assetFrame: undefined } : object);
      changed = true;
      result = { removed: clone(removed) };
      break;
    }
    case "add_map": {
      const normalized = syncActiveMap(project);
      const map = clone(command.map ?? {});
      map.id ??= command.id ?? makeId();
      map.name ??= command.name ?? `Map ${normalized.maps.length + 1}`;
      map.width ??= normalized.width;
      map.height ??= normalized.height;
      map.background ??= normalized.background;
      map.gravity ??= normalized.gravity;
      map.grid ??= normalized.grid;
      map.controlMode ??= normalized.controlMode;
      map.projection ??= clone(normalized.projection);
      map.navigation = createNavigationModel(map.navigation);
      map.objects ??= [];
      map.traversalPaths ??= [];
      if (normalized.maps.some((candidate) => candidate.id === map.id)) throw new Error(`Map id already exists: ${map.id}`);
      Object.assign(project, normalized, { maps: [...normalized.maps, map] });
      if (command.activate === true) Object.assign(project, activateMap(project, map.id));
      changed = true;
      result = { map: clone(map), activeMapId: project.activeMapId };
      break;
    }
    case "add_dimetric_map": {
      const normalized = syncActiveMap(project);
      const templateProject = createTemplate("dimetric");
      const templateMap = clone(templateProject.maps[0]);
      const map = {
        ...templateMap,
        id: String(command.id ?? makeId()),
        name: String(command.name ?? `Dimetric map ${normalized.maps.length + 1}`),
      };
      if (normalized.maps.some((candidate) => candidate.id === map.id)) throw new Error(`Map id already exists: ${map.id}`);
      Object.assign(project, normalized, { maps: [...normalized.maps, map] });
      if (command.activate !== false) Object.assign(project, activateMap(project, map.id));
      changed = true;
      result = { map: clone(map), activeMapId: project.activeMapId, template: "dimetric" };
      break;
    }
    case "set_start_map": {
      const normalized = syncActiveMap(project);
      const index = normalized.maps.findIndex((map) => map.id === command.id);
      if (index < 0) throw new Error("Start map was not found.");
      const maps = [...normalized.maps];
      const [startMap] = maps.splice(index, 1);
      maps.unshift(startMap);
      project = hydrateActiveMap({ ...normalized, startMapId: startMap.id }, maps);
      changed = true;
      result = { startMapId: startMap.id, order: maps.map((map) => map.id) };
      break;
    }
    case "reorder_map": {
      const normalized = syncActiveMap(project);
      const fromIndex = normalized.maps.findIndex((map) => map.id === command.id);
      if (fromIndex < 0) throw new Error("Map was not found.");
      const rawIndex = command.toIndex ?? (command.direction === "up" ? fromIndex - 1 : command.direction === "down" ? fromIndex + 1 : fromIndex);
      const toIndex = Math.max(0, Math.min(normalized.maps.length - 1, Math.trunc(Number(rawIndex))));
      if (!Number.isFinite(toIndex)) throw new Error("reorder_map requires a finite toIndex or an up/down direction.");
      const maps = [...normalized.maps];
      const [moved] = maps.splice(fromIndex, 1);
      maps.splice(toIndex, 0, moved);
      project = hydrateActiveMap({ ...normalized, startMapId: maps[0].id }, maps);
      changed = fromIndex !== toIndex;
      result = { mapId: moved.id, toIndex, startMapId: maps[0].id, order: maps.map((map) => map.id) };
      break;
    }
    case "connect_maps": {
      const normalized = syncActiveMap(project);
      const sourceIndex = normalized.maps.findIndex((map) => map.id === command.sourceMapId);
      const targetIndex = normalized.maps.findIndex((map) => map.id === command.targetMapId);
      if (sourceIndex < 0 || targetIndex < 0) throw new Error("connect_maps requires existing sourceMapId and targetMapId values.");
      if (sourceIndex === targetIndex) throw new Error("A forward map connection must target a different map.");
      const maps = clone(normalized.maps);
      const source = maps[sourceIndex];
      const target = maps[targetIndex];
      let spawn = target.objects.find((object) => object.kind === "spawn" && object.id === command.targetSpawnId)
        ?? target.objects.find((object) => object.kind === "spawn");
      if (!spawn) {
        spawn = createObject("spawn", {
          id: command.targetSpawnId ?? `${target.id}-entry`,
          name: `Entry from ${source.name}`,
          x: Math.max(24, Number(command.spawnX ?? 64)),
          y: Math.max(24, Number(command.spawnY ?? (target.controlMode === "topdown" ? target.height / 2 : target.height - 130))),
        });
        target.objects.push(spawn);
      }
      const requestedPortalId = command.portalId ?? `${source.id}-to-${target.id}`;
      let portalIndex = source.objects.findIndex((object) => object.kind === "portal" && object.id === requestedPortalId);
      const connectionRole = command.connectionRole ?? "route-exit";
      if (portalIndex < 0 && command.reuseForwardExit !== false) portalIndex = source.objects.findIndex((object) => object.kind === "portal" && object.role === connectionRole);
      const existingPortal = portalIndex >= 0 ? source.objects[portalIndex] : null;
      const portal = createObject("portal", {
        ...(existingPortal ?? {}),
        id: existingPortal?.id ?? requestedPortalId,
        name: command.portalName ?? `Continue to ${target.name}`,
        x: Math.max(0, Number(command.portalX ?? existingPortal?.x ?? source.width - 84)),
        y: Math.max(0, Number(command.portalY ?? existingPortal?.y ?? (source.controlMode === "topdown" ? source.height / 2 - 38 : source.height - 102))),
        role: connectionRole,
        targetMapId: target.id,
        targetSpawnId: spawn.id,
        transition: command.transition ?? "fade",
      });
      const requestedJoin = command.runtimeJoin === false
        ? { ...(existingPortal?.runtimeJoin ?? {}), enabled: false }
        : { ...(existingPortal?.runtimeJoin ?? {}), ...(command.runtimeJoin && typeof command.runtimeJoin === "object" && !Array.isArray(command.runtimeJoin) ? command.runtimeJoin : {}), enabled: command.runtimeJoin?.enabled ?? existingPortal?.runtimeJoin?.enabled ?? true };
      portal.runtimeJoin = createRuntimeJoinContract({ sourceMap: source, targetMap: target, portal, targetSpawn: spawn, overrides: requestedJoin });
      if (portalIndex >= 0) source.objects[portalIndex] = portal;
      else source.objects.push(portal);
      project = hydrateActiveMap(normalized, maps);
      changed = true;
      result = { sourceMapId: source.id, targetMapId: target.id, portal: clone(portal), spawn: clone(spawn) };
      break;
    }
    case "update_map": {
      const normalized = syncActiveMap(project);
      const mapId = command.id ?? normalized.activeMapId;
      const index = normalized.maps.findIndex((map) => map.id === mapId);
      if (index < 0) throw new Error("Map was not found.");
      const changes = clone(command.changes ?? {});
      const allowed = new Set(["name", "width", "height", "background", "gravity", "grid", "controlMode", "projection", "navigation", "objects", "traversalPaths", "collisionGeometry", "elevationTransitions", "tileProgram", "worldStream", "clearanceZones", "hudSafeAreas", "maxInteractionGap", "interactionPolicy", "chunk"]);
      for (const key of Object.keys(changes)) if (!allowed.has(key)) throw new Error(`update_map cannot change ${key}.`);
      normalized.maps[index] = { ...normalized.maps[index], ...changes, id: normalized.maps[index].id };
      project = hydrateActiveMap(normalized, normalized.maps);
      changed = true;
      result = { map: clone(normalized.maps[index]) };
      break;
    }
    case "switch_map": {
      Object.assign(project, activateMap(project, command.id));
      changed = true;
      result = { activeMapId: project.activeMapId };
      break;
    }
    case "remove_map": {
      const normalized = syncActiveMap(project);
      if (normalized.maps.length <= 1) throw new Error("A project must keep at least one map.");
      const index = normalized.maps.findIndex((map) => map.id === command.id);
      if (index < 0) throw new Error("Map was not found.");
      const [removed] = normalized.maps.splice(index, 1);
      const nextId = normalized.activeMapId === removed.id ? normalized.maps[0].id : normalized.activeMapId;
      const startMapId = normalized.startMapId === removed.id ? normalized.maps[0].id : normalized.startMapId;
      Object.assign(project, hydrateActiveMap({ ...normalized, startMapId }, normalized.maps, nextId));
      changed = true;
      result = { removed: clone(removed), activeMapId: project.activeMapId };
      break;
    }
    case "add_reference": {
      const reference = clone(command.reference);
      if (!reference?.id || !reference?.mapId || !Array.isArray(reference.signature)) throw new Error("add_reference requires id, mapId, and signature.");
      project.visualReferences ??= [];
      if (project.visualReferences.some((candidate) => candidate.id === reference.id)) throw new Error(`Reference id already exists: ${reference.id}`);
      project.visualReferences.push(reference);
      changed = true;
      result = { reference: clone(reference) };
      break;
    }
    case "find_reference": {
      const references = project.visualReferences ?? [];
      if (typeof command.id === "string") result = { match: clone(references.find((reference) => reference.id === command.id) ?? null), similarity: 1 };
      else if (typeof command.label === "string") result = { match: clone(references.find((reference) => reference.label === command.label) ?? null), similarity: 1 };
      else if (Array.isArray(command.signature)) {
        const ranked = references.map((reference) => ({ reference, similarity: signatureSimilarity(reference.signature, command.signature) })).sort((a, b) => b.similarity - a.similarity);
        result = ranked.length ? { match: clone(ranked[0].reference), similarity: ranked[0].similarity, candidates: ranked.slice(0, 5).map((entry) => ({ id: entry.reference.id, label: entry.reference.label, similarity: entry.similarity })) } : { match: null, similarity: 0, candidates: [] };
      } else throw new Error("find_reference requires id, label, or signature.");
      break;
    }
    case "remove_reference": {
      project.visualReferences ??= [];
      const index = project.visualReferences.findIndex((reference) => reference.id === command.id);
      if (index < 0) throw new Error("Visual reference was not found.");
      const [removed] = project.visualReferences.splice(index, 1);
      changed = true;
      result = { removed: clone(removed) };
      break;
    }
    case "begin_iteration": {
      const previousId = project.iteration?.id ?? null;
      if (previousId) {
        const previousReceipt = project.iterationHistory?.find((entry) => entry?.id === previousId);
        project = checkpointIteration(project, {
          id: previousId,
          status: project.iteration.status,
          summary: command.parentSummary ?? (previousReceipt ? undefined : "Parent checkpoint captured before starting a new AI iteration"),
        }).project;
      }
      const id = command.id ?? `iteration-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      project.iteration = { id, parentId: command.parentId ?? previousId, status: "candidate", track: command.track ?? "gameplay", objective: command.objective ?? "Improve the game", createdAt: new Date().toISOString(), readOnly: false };
      project.build = { ...(project.build ?? {}), id: command.buildId ?? id, sourceRevision: command.sourceRevision ?? id, generatedFromRevision: command.sourceRevision ?? id, sourceTimestamp: new Date().toISOString() };
      delete project.build.outputTimestamp;
      delete project.build.servedBuildId;
      project.authoring = { ...(project.authoring ?? {}), dirty: true, changedAt: new Date().toISOString() };
      changed = true;
      result = { iteration: clone(project.iteration), build: clone(project.build) };
      break;
    }
    case "create_variation": {
      const baseName = String(project.name ?? "Untitled Game").trim() || "Untitled Game";
      const name = typeof command.name === "string" ? command.name.trim() : `${baseName} — Variation`;
      if (!name) throw new Error("create_variation requires a non-empty name when name is provided.");
      const previousId = project.iteration?.id ?? null;
      if (previousId) {
        const previousReceipt = project.iterationHistory?.find((entry) => entry?.id === previousId);
        project = checkpointIteration(project, {
          id: previousId,
          status: project.iteration.status,
          summary: command.parentSummary ?? (previousReceipt ? undefined : "Base project checkpoint captured before creating a variation"),
        }).project;
      }
      const id = command.id ?? `variation-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      project.name = name;
      project.iteration = { id, parentId: command.parentId ?? previousId, status: "candidate", track: command.track ?? "creation", objective: command.objective ?? `Create an independent variation of ${baseName}`, createdAt: new Date().toISOString(), readOnly: false };
      project.build = { ...(project.build ?? {}), id: command.buildId ?? id, sourceRevision: command.sourceRevision ?? id, generatedFromRevision: previousId ?? id, sourceTimestamp: new Date().toISOString() };
      delete project.build.outputTimestamp;
      delete project.build.servedBuildId;
      project.authoring = { ...(project.authoring ?? {}), dirty: true, changedAt: new Date().toISOString() };
      changed = true;
      result = { base: { name: baseName, iterationId: previousId }, variation: { name, iteration: clone(project.iteration), build: clone(project.build) } };
      break;
    }
    case "verify_iteration": {
      if (!project.iteration?.id) throw new Error("No active iteration exists.");
      if (project.iteration.status === "promoted") throw new Error("Promoted snapshots are immutable. Begin or create a child candidate before making another version.");
      if (command.force === true) throw new Error("Project Doctor verification cannot be bypassed with force.");
      project = syncActiveMap(project);
      const doctor = analyzeProject(project, { profile: configuredDoctorProfile(project, command) });
      if (doctor.gate.blocking) throw new Error(`Project Doctor blocked verification with ${doctor.errorCount} error(s) and ${doctor.warningCount} warning(s) in the ${doctor.profile} profile.`);
      const evidence = validateVerificationEvidence(command.evidenceRefs, { sourceDigest: doctor.sourceDigest, ...verificationCoverageRequirements(project) });
      if (!evidence.valid) throw new Error(`Verification evidence is incomplete: ${evidence.errors.join(" ")}`);
      const verifiedAt = new Date().toISOString();
      project.iteration = {
        ...project.iteration,
        status: "verified",
        verifiedAt,
        readOnly: false,
        verification: {
          digest: doctor.digest,
          sourceDigest: doctor.sourceDigest,
          profile: doctor.profile,
          score: doctor.score,
          errorCount: doctor.errorCount,
          warningCount: doctor.warningCount,
          verifiedAt,
          buildId: project.build?.id ?? null,
          sourceRevision: project.build?.sourceRevision ?? null,
          evidenceRefs: clone(evidence.evidenceRefs),
        },
      };
      project.authoring = { ...(project.authoring ?? {}), dirty: false, verifiedAt };
      project = checkpointIteration(project, {
        id: project.iteration.id,
        status: "verified",
        accepted: true,
        summary: "Project Doctor and source-bound browser evidence verified this exact candidate",
        createdAt: verifiedAt,
      }).project;
      changed = true;
      result = { iteration: clone(project.iteration), doctor };
      break;
    }
    case "promote_iteration": {
      if (project.iteration?.status !== "verified") throw new Error("Only a verified candidate can be promoted.");
      project = syncActiveMap(project);
      const doctor = analyzeProject(project, { profile: configuredDoctorProfile(project, command) });
      if (doctor.gate.blocking) throw new Error(`Project Doctor blocked promotion with ${doctor.errorCount} error(s) and ${doctor.warningCount} warning(s) in the ${doctor.profile} profile.`);
      const verification = project.iteration.verification;
      if (!verification || verification.digest !== doctor.digest || verification.sourceDigest !== doctor.sourceDigest || verification.profile !== doctor.profile) {
        throw new Error("Project Doctor verification is missing or stale. Verify this exact candidate again before promotion.");
      }
      if ((verification.buildId ?? null) !== (project.build?.id ?? null) || (verification.sourceRevision ?? null) !== (project.build?.sourceRevision ?? null)) {
        throw new Error("The verified build identity changed. Verify the current build again before promotion.");
      }
      const evidence = validateVerificationEvidence(verification.evidenceRefs, { sourceDigest: doctor.sourceDigest, ...verificationCoverageRequirements(project) });
      if (!evidence.valid) throw new Error(`Verification evidence is missing or stale. Recollect it before promotion: ${evidence.errors.join(" ")}`);
      project.iteration = { ...project.iteration, status: "promoted", promotedAt: new Date().toISOString(), readOnly: true };
      project = checkpointIteration(project, {
        id: project.iteration.id,
        status: "promoted",
        accepted: true,
        summary: "Verified candidate promoted as a protected project version",
        createdAt: project.iteration.promotedAt,
      }).project;
      changed = true;
      result = { iteration: clone(project.iteration), doctor };
      break;
    }
    case "checkpoint_iteration": {
      const checkpoint = checkpointIteration(project, {
        id: command.id,
        parentId: command.parentId,
        status: command.status,
        accepted: command.accepted,
        snapshot: command.snapshot,
        objective: command.objective,
        summary: command.summary,
        reason: command.reason,
        condition: command.condition,
        provider: command.provider,
        track: command.track,
        score: command.score,
        scoreKind: command.scoreKind,
        qualityDelta: command.qualityDelta,
        evaluation: command.evaluation,
        comparison: command.comparison,
        providerParity: command.providerParity,
        doctorScore: command.doctorScore,
        errorCount: command.errorCount,
        warningCount: command.warningCount,
        doctorDigest: command.doctorDigest,
        sourceDigest: command.sourceDigest,
        doctorProfile: command.doctorProfile,
        createdAt: command.createdAt,
      });
      project = checkpoint.project;
      changed = true;
      result = { entry: checkpoint.entry, ledger: listIterationHistory(project) };
      break;
    }
    case "record_iteration_attempt": {
      const checkpoint = checkpointIteration(project, {
        id: command.id,
        parentId: command.parentId,
        status: command.status ?? "rejected",
        accepted: command.accepted === true,
        snapshot: false,
        objective: command.objective,
        summary: command.summary,
        reason: command.reason,
        condition: command.condition,
        provider: command.provider,
        track: command.track,
        score: command.score,
        scoreKind: command.scoreKind,
        qualityDelta: command.qualityDelta,
        evaluation: command.evaluation,
        comparison: command.comparison,
        providerParity: command.providerParity,
        doctorScore: command.doctorScore,
        errorCount: command.errorCount,
        warningCount: command.warningCount,
        doctorDigest: command.doctorDigest,
        sourceDigest: command.sourceDigest,
        doctorProfile: command.doctorProfile,
        createdAt: command.createdAt,
      });
      project = checkpoint.project;
      changed = true;
      result = { entry: checkpoint.entry, ledger: listIterationHistory(project) };
      break;
    }
    case "get_iteration_history": {
      result = listIterationHistory(project);
      break;
    }
    case "compare_iterations": {
      const ids = Array.isArray(command.ids) ? command.ids : [command.firstId, command.secondId];
      if (ids.length !== 2 || ids.some((id) => typeof id !== "string" || !id)) throw new Error("compare_iterations requires ids containing exactly two iteration ids.");
      result = compareIterationHistory(project, ids[0], ids[1], { maximumStructuralChanges: command.maximumStructuralChanges });
      break;
    }
    case "restore_iteration": {
      if (typeof command.id !== "string" || !command.id) throw new Error("restore_iteration requires an id.");
      const restored = restoreIteration(project, command.id, { id: command.restoreAsId, buildId: command.buildId, objective: command.objective, track: command.track });
      project = restored.project;
      changed = true;
      result = { entry: restored.entry, restoredFrom: restored.restoredFrom, sourceDigest: restored.sourceDigest };
      break;
    }
    case "get_gameplay_program": {
      result = inspectGameplayProgram(project);
      break;
    }
    case "set_gameplay_program": {
      if (!command.program || typeof command.program !== "object" || Array.isArray(command.program)) {
        throw new Error("set_gameplay_program requires a program object.");
      }
      const program = normalizeGameplayProgram(command.program);
      const inspection = inspectGameplayProgram({ ...project, gameplayProgram: program }, program);
      if (inspection.errors.length) throw new Error(`Gameplay program is invalid: ${inspection.errors.join(" ")}`);
      project.gameplayProgram = program;
      changed = true;
      result = { program: clone(program), inspection: clone(inspection) };
      break;
    }
    case "remove_gameplay_program": {
      delete project.gameplayProgram;
      changed = true;
      result = { removed: true };
      break;
    }
    case "get_combat_program": {
      result = inspectCombatProgram(project, project.combatProgram, { strict: command.profile === "production" });
      break;
    }
    case "get_combat_report": {
      result = inspectCombatProgram(project, project.combatProgram, { strict: command.profile === "production" });
      break;
    }
    case "suggest_combat_program": {
      result = suggestCombatProgram(project, { mapId: command.mapId, actionId: command.actionId, maxTargets: command.maxTargets });
      break;
    }
    case "set_combat_program": {
      if (!command.program || typeof command.program !== "object" || Array.isArray(command.program)) throw new Error("set_combat_program requires a program object.");
      const inspection = inspectCombatProgram({ ...project, combatProgram: command.program }, command.program, { strict: command.profile === "production" });
      if (inspection.errors.length) throw new Error(`Combat program is invalid: ${inspection.errors.join(" ")}`);
      project.combatProgram = normalizeCombatProgram(command.program);
      changed = true;
      result = { program: clone(project.combatProgram), report: clone(inspectCombatProgram(project, project.combatProgram, { strict: command.profile === "production" })) };
      break;
    }
    case "remove_combat_program": {
      const removed = clone(project.combatProgram ?? null);
      delete project.combatProgram;
      changed = removed !== null;
      result = { removed };
      break;
    }
    case "get_actor_program":
    case "get_actor_report": {
      result = inspectActorProgram(project, project.actorProgram, { strict: command.profile === "production" });
      break;
    }
    case "suggest_actor_program": {
      result = suggestActorProgram(project, { mapId: command.mapId, objectIds: command.objectIds, maxActors: command.maxActors });
      break;
    }
    case "set_actor_program": {
      if (!command.program || typeof command.program !== "object" || Array.isArray(command.program)) throw new Error("set_actor_program requires a program object.");
      const inspection = inspectActorProgram({ ...project, actorProgram: command.program }, command.program, { strict: command.profile === "production" });
      if (inspection.errors.length) throw new Error(`Actor program is invalid: ${inspection.errors.join(" ")}`);
      project.actorProgram = normalizeActorProgram(command.program);
      changed = true;
      result = { program: clone(project.actorProgram), report: clone(inspectActorProgram(project, project.actorProgram, { strict: command.profile === "production" })) };
      break;
    }
    case "remove_actor_program": {
      const removed = clone(project.actorProgram ?? null);
      delete project.actorProgram;
      changed = removed !== null;
      result = { removed };
      break;
    }
    case "get_collision_geometry": {
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const map = normalized.maps.find((candidate) => candidate.id === mapId);
      if (!map) throw new Error("Collision geometry map was not found.");
      const geometry = clone(map.collisionGeometry ?? null);
      result = {
        mapId,
        geometry,
        segments: geometry ? collisionSegmentsForGeometry(geometry) : [],
        policy: LOOPLAB_COLLISION_GEOMETRY_POLICY,
      };
      break;
    }
    case "get_collision_geometry_report": {
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const map = normalized.maps.find((candidate) => candidate.id === mapId);
      if (!map) throw new Error("Collision geometry map was not found.");
      result = inspectCollisionGeometry(normalized, map.collisionGeometry, { mapId, strict: command.profile === "production" });
      break;
    }
    case "suggest_collision_geometry": {
      result = suggestCollisionGeometry(syncActiveMap(project), { mapId: command.mapId, objectIds: command.objectIds, tuning: command.tuning });
      break;
    }
    case "set_collision_geometry": {
      if (!command.geometry || typeof command.geometry !== "object" || Array.isArray(command.geometry)) throw new Error("set_collision_geometry requires a geometry object.");
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const index = normalized.maps.findIndex((candidate) => candidate.id === mapId);
      if (index < 0) throw new Error("Collision geometry map was not found.");
      const inspection = inspectCollisionGeometry(normalized, command.geometry, { mapId, strict: command.profile === "production" });
      if (inspection.errors.length) throw new Error(`Collision geometry is invalid: ${inspection.errors.join(" ")}`);
      const maps = clone(normalized.maps);
      maps[index].collisionGeometry = normalizeCollisionGeometry(command.geometry);
      project = hydrateActiveMap(normalized, maps);
      changed = true;
      result = {
        mapId,
        geometry: clone(maps[index].collisionGeometry),
        report: clone(inspectCollisionGeometry(project, maps[index].collisionGeometry, { mapId, strict: command.profile === "production" })),
      };
      break;
    }
    case "remove_collision_geometry": {
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const index = normalized.maps.findIndex((candidate) => candidate.id === mapId);
      if (index < 0) throw new Error("Collision geometry map was not found.");
      const maps = clone(normalized.maps);
      const removed = clone(maps[index].collisionGeometry ?? null);
      delete maps[index].collisionGeometry;
      project = hydrateActiveMap(normalized, maps);
      changed = removed !== null;
      result = { mapId, removed };
      break;
    }
    case "get_elevation_transitions": {
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const map = normalized.maps.find((candidate) => candidate.id === mapId);
      if (!map) throw new Error("Elevation-transition map was not found.");
      const program = clone(map.elevationTransitions ?? null);
      result = {
        mapId,
        program,
        segments: program ? elevationSegmentsForProgram(program) : [],
        policy: LOOPLAB_ELEVATION_TRANSITIONS_POLICY,
      };
      break;
    }
    case "get_elevation_transition_report": {
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const map = normalized.maps.find((candidate) => candidate.id === mapId);
      if (!map) throw new Error("Elevation-transition map was not found.");
      result = inspectElevationTransitions(normalized, map.elevationTransitions, { mapId, strict: command.profile === "production" });
      break;
    }
    case "suggest_elevation_transitions": {
      result = suggestElevationTransitions(syncActiveMap(project), {
        mapId: command.mapId,
        navigationLinkId: command.navigationLinkId,
        collisionChainId: command.collisionChainId,
        id: command.id,
        name: command.name,
        kind: command.kind,
        width: command.width,
        entryRadius: command.entryRadius,
        entryZTolerance: command.entryZTolerance,
      });
      break;
    }
    case "set_elevation_transitions": {
      if (!command.program || typeof command.program !== "object" || Array.isArray(command.program)) throw new Error("set_elevation_transitions requires a program object.");
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const index = normalized.maps.findIndex((candidate) => candidate.id === mapId);
      if (index < 0) throw new Error("Elevation-transition map was not found.");
      const inspection = inspectElevationTransitions(normalized, command.program, { mapId, strict: command.profile === "production" });
      if (!inspection.valid) throw new Error(inspection.errors[0] || "Elevation transitions are invalid.");
      const maps = clone(normalized.maps);
      maps[index].elevationTransitions = normalizeElevationTransitions(command.program);
      project = hydrateActiveMap(normalized, maps);
      changed = true;
      result = {
        mapId,
        program: clone(maps[index].elevationTransitions),
        report: clone(inspectElevationTransitions(project, maps[index].elevationTransitions, { mapId, strict: command.profile === "production" })),
      };
      break;
    }
    case "remove_elevation_transitions": {
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const index = normalized.maps.findIndex((candidate) => candidate.id === mapId);
      if (index < 0) throw new Error("Elevation-transition map was not found.");
      const maps = clone(normalized.maps);
      const removed = clone(maps[index].elevationTransitions ?? null);
      delete maps[index].elevationTransitions;
      project = hydrateActiveMap(normalized, maps);
      changed = removed !== null;
      result = { mapId, removed };
      break;
    }
    case "get_tile_program": {
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const map = normalized.maps.find((candidate) => candidate.id === mapId);
      if (!map) throw new Error("Tile-program map was not found.");
      const program = clone(map.tileProgram ?? null);
      const report = inspectTileProgram(normalized, map.tileProgram, { mapId });
      result = {
        mapId,
        program,
        tileProgramDigest: report.programDigest,
        report,
        policy: LOOPLAB_TILE_PROGRAM_POLICY,
      };
      break;
    }
    case "get_tile_program_report": {
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const map = normalized.maps.find((candidate) => candidate.id === mapId);
      if (!map) throw new Error("Tile-program map was not found.");
      result = inspectTileProgram(normalized, map.tileProgram, { mapId });
      break;
    }
    case "get_tile_region": {
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const map = normalized.maps.find((candidate) => candidate.id === mapId);
      if (!map) throw new Error("Tile-program map was not found.");
      if (!map.tileProgram) throw new Error("The selected map does not have a tile program.");
      result = readTileRegion(map.tileProgram, {
        mapId,
        layerId: command.layerId,
        collisionLayerId: command.collisionLayerId,
        x: command.x,
        y: command.y,
        width: command.width,
        height: command.height,
      });
      break;
    }
    case "suggest_tile_program": {
      result = suggestTileProgram(syncActiveMap(project), {
        mapId: command.mapId,
        assetIds: command.assetIds,
        variationSeed: command.variationSeed,
      });
      break;
    }
    case "set_tile_program": {
      if (!command.program || typeof command.program !== "object" || Array.isArray(command.program)) throw new Error("set_tile_program requires a program object.");
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const index = normalized.maps.findIndex((candidate) => candidate.id === mapId);
      if (index < 0) throw new Error("Tile-program map was not found.");
      const inspection = inspectTileProgram(normalized, command.program, { mapId });
      if (inspection.errors.length) throw new Error(`Tile program is invalid: ${inspection.errors.map((finding) => finding.message).join(" ")}`);
      const nextProgram = normalizeTileProgram(command.program);
      const previousDigest = normalized.maps[index].tileProgram ? tileProgramDigest(normalized.maps[index].tileProgram) : null;
      const nextDigest = tileProgramDigest(nextProgram);
      const maps = clone(normalized.maps);
      maps[index].tileProgram = nextProgram;
      project = hydrateActiveMap(normalized, maps);
      changed = previousDigest !== nextDigest;
      result = {
        mapId,
        program: clone(nextProgram),
        tileProgramDigest: nextDigest,
        report: inspectTileProgram(project, nextProgram, { mapId }),
      };
      break;
    }
    case "remove_tile_program": {
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const index = normalized.maps.findIndex((candidate) => candidate.id === mapId);
      if (index < 0) throw new Error("Tile-program map was not found.");
      const maps = clone(normalized.maps);
      const removed = clone(maps[index].tileProgram ?? null);
      delete maps[index].tileProgram;
      project = hydrateActiveMap(normalized, maps);
      changed = removed !== null;
      result = { mapId, removed };
      break;
    }
    case "get_world_stream": {
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const map = normalized.maps.find((candidate) => candidate.id === mapId);
      if (!map) throw new Error("World-stream host map was not found.");
      const program = clone(map.worldStream ?? null);
      const report = inspectWorldStream(normalized, map.worldStream, { mapId, strict: command.strict === true });
      result = {
        mapId,
        program,
        worldStreamDigest: report.programDigest,
        report,
        policy: LOOPLAB_WORLD_STREAM_POLICY,
      };
      break;
    }
    case "get_world_stream_report": {
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const map = normalized.maps.find((candidate) => candidate.id === mapId);
      if (!map) throw new Error("World-stream host map was not found.");
      result = inspectWorldStream(normalized, map.worldStream, { mapId, strict: command.strict === true });
      break;
    }
    case "get_world_stream_plan": {
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const map = normalized.maps.find((candidate) => candidate.id === mapId);
      if (!map) throw new Error("World-stream host map was not found.");
      if (!map.worldStream) throw new Error("The selected map does not have a world stream.");
      result = planWorldStream(normalized, map.worldStream, { mapId, count: command.count });
      break;
    }
    case "suggest_world_stream": {
      result = suggestWorldStream(syncActiveMap(project), {
        mapId: command.mapId,
        mode: command.mode,
        axis: command.axis,
        seed: command.seed,
        horizon: command.horizon,
        tag: command.tag,
        z: command.z,
        span: command.span,
        budgets: command.budgets,
        tolerances: command.tolerances,
      });
      break;
    }
    case "set_world_stream": {
      if (!command.program || typeof command.program !== "object" || Array.isArray(command.program)) throw new Error("set_world_stream requires a program object.");
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const index = normalized.maps.findIndex((candidate) => candidate.id === mapId);
      if (index < 0) throw new Error("World-stream host map was not found.");
      const inspection = inspectWorldStream(normalized, command.program, { mapId, strict: false });
      const blocking = inspection.issues.filter((finding) => finding.severity === "error");
      if (blocking.length) throw new Error(`World stream is invalid: ${blocking.map((finding) => finding.message).join(" ")}`);
      const nextProgram = normalizeWorldStream(command.program);
      const previousDigest = normalized.maps[index].worldStream ? worldStreamDigest(normalized.maps[index].worldStream) : null;
      const nextDigest = worldStreamDigest(nextProgram);
      const maps = clone(normalized.maps);
      maps[index].worldStream = nextProgram;
      project = hydrateActiveMap(normalized, maps);
      changed = previousDigest !== nextDigest;
      result = {
        mapId,
        program: clone(nextProgram),
        worldStreamDigest: nextDigest,
        report: inspectWorldStream(project, nextProgram, { mapId, strict: command.strict === true }),
      };
      break;
    }
    case "remove_world_stream": {
      const normalized = syncActiveMap(project);
      const mapId = command.mapId ?? normalized.activeMapId;
      const index = normalized.maps.findIndex((candidate) => candidate.id === mapId);
      if (index < 0) throw new Error("World-stream host map was not found.");
      const maps = clone(normalized.maps);
      const removed = clone(maps[index].worldStream ?? null);
      delete maps[index].worldStream;
      project = hydrateActiveMap(normalized, maps);
      changed = removed !== null;
      result = { mapId, removed };
      break;
    }
    case "preview_tile_patch": {
      if (!command.patch || typeof command.patch !== "object" || Array.isArray(command.patch)) throw new Error("preview_tile_patch requires a tile patch object.");
      const normalized = syncActiveMap(project);
      const mapId = command.patch.mapId;
      const index = normalized.maps.findIndex((candidate) => candidate.id === mapId);
      if (index < 0) throw new Error("Tile patch map was not found.");
      const currentProgram = normalized.maps[index].tileProgram;
      if (!currentProgram) throw new Error("The selected map does not have a tile program.");
      const currentInspection = inspectTileProgram(normalized, currentProgram, { mapId });
      if (!currentInspection.valid) throw new Error(`Current tile program is invalid: ${currentInspection.errors.map((finding) => finding.message).join(" ")}`);
      const preview = previewTilePatch(currentProgram, command.patch);
      const maps = clone(normalized.maps);
      maps[index].tileProgram = preview.program;
      const projectedProject = hydrateActiveMap(normalized, maps);
      const projectedInspection = inspectTileProgram(projectedProject, preview.program, { mapId });
      const validation = validateProject(projectedProject);
      const profile = command.profile ?? normalized.doctorProfile ?? "prototype";
      const beforeDoctor = analyzeProject(normalized, { profile });
      const afterDoctor = analyzeProject(projectedProject, { profile });
      const beforeReleaseDoctor = beforeDoctor.profile === "production" ? beforeDoctor : analyzeProject(normalized, { profile: "production" });
      const afterReleaseDoctor = afterDoctor.profile === "production" ? afterDoctor : analyzeProject(projectedProject, { profile: "production" });
      const doctor = batchDoctorProjection(beforeDoctor, afterDoctor);
      const releaseDoctor = batchDoctorProjection(beforeReleaseDoctor, afterReleaseDoctor);
      const newBlockers = [...new Map([...doctor.newBlockers, ...releaseDoctor.newBlockers].map((issue) => [commandMacroIssueIdentity(issue), issue])).values()];
      const applicable = projectedInspection.valid && validation.valid && newBlockers.length === 0;
      const publicPreview = {
        ...preview,
        sourceDigest: beforeDoctor.sourceDigest,
        projectedSourceDigest: afterDoctor.sourceDigest,
        applicable,
        validation,
        tileProgramReport: projectedInspection,
        doctor: { ...doctor, release: releaseDoctor, newBlockers },
        authority: {
          providerUsed: false,
          persistsProject: false,
          grantsMutationAuthority: false,
          exactApplyRequiresCurrentSourceProgramAndPatchDigests: true,
        },
        applyCommand: applicable ? {
          op: "apply_tile_patch",
          patch: clone(preview.patch),
          expectedSourceDigest: beforeDoctor.sourceDigest,
          tileProgramDigest: preview.tileProgramDigest,
          patchDigest: preview.patchDigest,
        } : null,
      };
      if (command.compact !== false) delete publicPreview.program;
      result = publicPreview;
      break;
    }
    case "apply_tile_patch": {
      if (!command.patch || typeof command.patch !== "object" || Array.isArray(command.patch)) throw new Error("apply_tile_patch requires a tile patch object.");
      const normalized = syncActiveMap(project);
      const sourceDigest = doctorSourceDigest(normalized);
      if (!command.expectedSourceDigest) throw new Error("apply_tile_patch requires expectedSourceDigest from the exact previewed project.");
      if (command.expectedSourceDigest !== sourceDigest) throw new Error(`[stale-source] Tile patch expected ${command.expectedSourceDigest}, but the selected project is now ${sourceDigest}. Preview the patch again.`);
      const mapId = command.patch.mapId;
      const index = normalized.maps.findIndex((candidate) => candidate.id === mapId);
      if (index < 0) throw new Error("Tile patch map was not found.");
      const currentProgram = normalized.maps[index].tileProgram;
      if (!currentProgram) throw new Error("The selected map does not have a tile program.");
      const currentDigest = tileProgramDigest(currentProgram);
      if (command.tileProgramDigest !== currentDigest) throw new Error(`[stale-tile-program] Tile patch expected ${command.tileProgramDigest}, but the selected map is now ${currentDigest}. Preview the patch again.`);
      const preview = previewTilePatch(currentProgram, command.patch);
      if (command.patchDigest !== preview.patchDigest) throw new Error(`[stale-tile-patch] Tile patch receipt expected ${command.patchDigest}, but the canonical patch is ${preview.patchDigest}. Preview the exact patch again.`);
      const maps = clone(normalized.maps);
      maps[index].tileProgram = preview.program;
      const projectedProject = hydrateActiveMap(normalized, maps);
      const inspection = inspectTileProgram(projectedProject, preview.program, { mapId });
      if (!inspection.valid) throw new Error(`Tile patch would produce an invalid tile program: ${inspection.errors.map((finding) => finding.message).join(" ")}`);
      project = projectedProject;
      changed = preview.changed;
      const publicPreview = { ...preview };
      if (command.compact !== false) delete publicPreview.program;
      result = { ...publicPreview, applied: preview.changed, report: inspection };
      break;
    }
    case "list_community_exchanges": {
      const report = inspectCommunityExchanges(syncActiveMap(project));
      result = {
        schemaVersion: LOOPLAB_COMMUNITY_EXCHANGE_REPORT_SCHEMA,
        entryCount: report.entries.filter((entry) => !command.kind || entry.kind === command.kind).length,
        entries: report.entries.filter((entry) => !command.kind || entry.kind === command.kind),
        policy: LOOPLAB_COMMUNITY_EXCHANGE_POLICY,
      };
      break;
    }
    case "get_community_exchange_report": {
      const report = inspectCommunityExchanges(syncActiveMap(project));
      result = command.kind ? { ...report, entryCount: report.entries.filter((entry) => entry.kind === command.kind).length, entries: report.entries.filter((entry) => entry.kind === command.kind) } : report;
      break;
    }
    case "preview_tiled_import": {
      const normalized = syncActiveMap(project);
      const sourceDigest = doctorSourceDigest(normalized);
      const preview = previewTiledImport(normalized, command, { sourceDigest });
      let safety = null;
      let tileProgramReport = null;
      let exchangeReport = null;
      let applicable = false;
      if (preview.applicable) {
        const projectedProject = projectedTiledExchange(normalized, preview);
        tileProgramReport = inspectTileProgram(projectedProject, preview.proposal.tileProgram, { mapId: preview.proposal.mapId });
        exchangeReport = inspectCommunityExchanges(projectedProject);
        safety = communityExchangeSafety(normalized, projectedProject, command.profile);
        applicable = tileProgramReport.valid && safety.validation.valid && safety.doctor.newBlockers.length === 0 && !exchangeReport.issues.some((issue) => issue.severity === "warning");
      }
      const publicPreview = publicCommunityExchangePreview(preview, command.compact !== false);
      result = {
        ...publicPreview,
        applicable,
        projectedSourceDigest: safety?.projectedSourceDigest ?? null,
        validation: safety?.validation ?? null,
        doctor: safety?.doctor ?? null,
        tileProgramReport,
        exchangeReport,
        applyCommand: applicable ? {
          ...clone(command),
          op: "apply_tiled_import",
          expectedSourceDigest: sourceDigest,
          expectedPreviewDigest: preview.previewDigest,
        } : null,
      };
      break;
    }
    case "apply_tiled_import": {
      const normalized = syncActiveMap(project);
      const sourceDigest = doctorSourceDigest(normalized);
      if (!command.expectedSourceDigest) throw new Error("apply_tiled_import requires expectedSourceDigest from the exact previewed project.");
      if (!command.expectedPreviewDigest) throw new Error("apply_tiled_import requires expectedPreviewDigest from preview_tiled_import.");
      const preview = previewTiledImport(normalized, command, { sourceDigest });
      if (command.expectedPreviewDigest !== preview.previewDigest) throw new Error(`[stale-community-preview] Tiled import expected ${command.expectedPreviewDigest}, but the exact current preview is ${preview.previewDigest}. Preview the same source and bindings again.`);
      if (!preview.applicable) throw new Error(`Tiled import is not applicable: ${preview.errors.join(" ")}`);
      const projectedProject = projectedTiledExchange(normalized, preview);
      const tileProgramReport = inspectTileProgram(projectedProject, preview.proposal.tileProgram, { mapId: preview.proposal.mapId });
      const exchangeReport = inspectCommunityExchanges(projectedProject);
      const safety = communityExchangeSafety(normalized, projectedProject, command.profile);
      if (!tileProgramReport.valid) throw new Error(`Tiled import would produce an invalid tile program: ${tileProgramReport.errors.map((finding) => finding.message).join(" ")}`);
      if (!safety.validation.valid) throw new Error(`Tiled import would produce an invalid project: ${safety.validation.errors.join(" ")}`);
      if (safety.doctor.newBlockers.length) throw new Error(`Tiled import would introduce ${safety.doctor.newBlockers.length} new Project Doctor blocker(s): ${safety.doctor.newBlockers.map((issue) => issue.code).join(", ")}.`);
      if (exchangeReport.issues.some((issue) => issue.severity === "warning")) throw new Error(`Tiled exchange envelope is invalid: ${exchangeReport.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message).join(" ")}`);
      project = projectedProject;
      changed = canonicalJson(project) !== canonicalJson(normalized);
      result = {
        ...publicCommunityExchangePreview(preview, command.compact !== false),
        applied: changed,
        projectedSourceDigest: safety.projectedSourceDigest,
        tileProgramReport,
        exchangeReport,
        doctor: safety.doctor,
      };
      break;
    }
    case "preview_aseprite_import": {
      const normalized = syncActiveMap(project);
      const sourceDigest = doctorSourceDigest(normalized);
      const preview = previewAsepriteImport(normalized, command, { sourceDigest });
      let safety = null;
      let presentationReport = null;
      let exchangeReport = null;
      let applicable = false;
      if (preview.applicable) {
        const projectedProject = projectedAsepriteExchange(normalized, preview);
        presentationReport = inspectPresentationProgram(projectedProject, projectedProject.presentationProgram, { sourceDigest: doctorSourceDigest(projectedProject) });
        exchangeReport = inspectCommunityExchanges(projectedProject);
        safety = communityExchangeSafety(normalized, projectedProject, command.profile);
        applicable = presentationReport.errors.length === 0 && safety.validation.valid && safety.doctor.newBlockers.length === 0 && !exchangeReport.issues.some((issue) => issue.severity === "warning");
      }
      const publicPreview = publicCommunityExchangePreview(preview, command.compact !== false);
      result = {
        ...publicPreview,
        applicable,
        projectedSourceDigest: safety?.projectedSourceDigest ?? null,
        validation: safety?.validation ?? null,
        doctor: safety?.doctor ?? null,
        presentationReport,
        exchangeReport,
        applyCommand: applicable ? {
          ...clone(command),
          op: "apply_aseprite_import",
          expectedSourceDigest: sourceDigest,
          expectedPreviewDigest: preview.previewDigest,
        } : null,
      };
      break;
    }
    case "apply_aseprite_import": {
      const normalized = syncActiveMap(project);
      const sourceDigest = doctorSourceDigest(normalized);
      if (!command.expectedSourceDigest) throw new Error("apply_aseprite_import requires expectedSourceDigest from the exact previewed project.");
      if (!command.expectedPreviewDigest) throw new Error("apply_aseprite_import requires expectedPreviewDigest from preview_aseprite_import.");
      const preview = previewAsepriteImport(normalized, command, { sourceDigest });
      if (command.expectedPreviewDigest !== preview.previewDigest) throw new Error(`[stale-community-preview] Aseprite import expected ${command.expectedPreviewDigest}, but the exact current preview is ${preview.previewDigest}. Preview the same source and target again.`);
      if (!preview.applicable) throw new Error(`Aseprite import is not applicable: ${preview.errors.join(" ")}`);
      const projectedProject = projectedAsepriteExchange(normalized, preview);
      const presentationReport = inspectPresentationProgram(projectedProject, projectedProject.presentationProgram, { sourceDigest: doctorSourceDigest(projectedProject) });
      const exchangeReport = inspectCommunityExchanges(projectedProject);
      const safety = communityExchangeSafety(normalized, projectedProject, command.profile);
      if (presentationReport.errors.length) throw new Error(`Aseprite import would produce an invalid presentation program: ${presentationReport.errors.map((finding) => finding.message ?? finding).join(" ")}`);
      if (!safety.validation.valid) throw new Error(`Aseprite import would produce an invalid project: ${safety.validation.errors.join(" ")}`);
      if (safety.doctor.newBlockers.length) throw new Error(`Aseprite import would introduce ${safety.doctor.newBlockers.length} new Project Doctor blocker(s): ${safety.doctor.newBlockers.map((issue) => issue.code).join(", ")}.`);
      if (exchangeReport.issues.some((issue) => issue.severity === "warning")) throw new Error(`Aseprite exchange envelope is invalid: ${exchangeReport.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message).join(" ")}`);
      project = projectedProject;
      changed = canonicalJson(project) !== canonicalJson(normalized);
      result = {
        ...publicCommunityExchangePreview(preview, command.compact !== false),
        applied: changed,
        projectedSourceDigest: safety.projectedSourceDigest,
        presentationReport,
        exchangeReport,
        doctor: safety.doctor,
      };
      break;
    }
    case "export_community_exchange": {
      result = exportCommunityExchange(syncActiveMap(project), command);
      break;
    }
    case "get_narrative_contract": {
      result = inspectNarrativeContract(project, project.narrativeContract, { sourceDigest: doctorSourceDigest(project) });
      break;
    }
    case "get_narrative_report": {
      result = analyzeProject(syncActiveMap(project), { profile: command.profile }).narrativeReport;
      break;
    }
    case "set_narrative_contract": {
      if (!command.contract || typeof command.contract !== "object" || Array.isArray(command.contract)) {
        throw new Error("set_narrative_contract requires a contract object.");
      }
      const contract = normalizeNarrativeContract(command.contract);
      const projected = { ...project, narrativeContract: contract };
      const sourceDigest = doctorSourceDigest(projected);
      const report = inspectNarrativeContract(projected, contract, { sourceDigest, acceptancePlan: getAcceptancePlan(projected, { sourceDigest }) });
      if (report.errors.length) throw new Error(`Narrative contract is invalid: ${report.errors.join(" ")}`);
      project.narrativeContract = contract;
      changed = true;
      result = { contract: clone(contract), report: clone(report) };
      break;
    }
    case "remove_narrative_contract": {
      delete project.narrativeContract;
      changed = true;
      result = { removed: true };
      break;
    }
    case "get_visual_identity": {
      const report = inspectVisualIdentity(project, project.visualIdentity, { sourceDigest: doctorSourceDigest(project) });
      result = { identity: clone(project.visualIdentity ?? null), report: clone(report) };
      break;
    }
    case "get_visual_identity_report": {
      result = inspectVisualIdentity(project, project.visualIdentity, { sourceDigest: doctorSourceDigest(project) });
      break;
    }
    case "set_visual_identity": {
      if (!command.identity || typeof command.identity !== "object" || Array.isArray(command.identity)) throw new Error("set_visual_identity requires an identity object.");
      const preliminary = inspectVisualIdentity({ ...project, visualIdentity: command.identity }, command.identity);
      if (preliminary.errors.length) throw new Error(`Visual identity is invalid: ${preliminary.errors.join(" ")}`);
      const identity = normalizeVisualIdentity(command.identity);
      const projected = { ...project, visualIdentity: identity };
      const report = inspectVisualIdentity(projected, identity, { sourceDigest: doctorSourceDigest(projected) });
      if (report.errors.length) throw new Error(`Visual identity is invalid: ${report.errors.join(" ")}`);
      project.visualIdentity = identity;
      changed = true;
      result = { identity: clone(identity), report: clone(report) };
      break;
    }
    case "remove_visual_identity": {
      delete project.visualIdentity;
      changed = true;
      result = { removed: true };
      break;
    }
    case "get_presentation_program": {
      result = inspectPresentationProgram(project, project.presentationProgram, { sourceDigest: doctorSourceDigest(project) });
      break;
    }
    case "get_presentation_report": {
      result = analyzeProject(syncActiveMap(project), { profile: command.profile }).presentationReport;
      break;
    }
    case "suggest_presentation_program": {
      result = suggestPresentationProgram(project, { sourceDigest: doctorSourceDigest(project), status: command.status });
      break;
    }
    case "set_presentation_program": {
      if (!command.program || typeof command.program !== "object" || Array.isArray(command.program)) throw new Error("set_presentation_program requires a program object.");
      const preliminary = inspectPresentationProgram({ ...project, presentationProgram: command.program }, command.program);
      if (preliminary.errors.length) throw new Error(`Presentation program is invalid: ${preliminary.errors.join(" ")}`);
      const program = normalizePresentationProgram(command.program);
      const projected = { ...project, presentationProgram: program };
      const report = inspectPresentationProgram(projected, program, { sourceDigest: doctorSourceDigest(projected) });
      if (report.errors.length) throw new Error(`Presentation program is invalid: ${report.errors.join(" ")}`);
      project.presentationProgram = program;
      changed = true;
      result = { program: clone(program), report: clone(report) };
      break;
    }
    case "remove_presentation_program": {
      delete project.presentationProgram;
      changed = true;
      result = { removed: true };
      break;
    }
    case "get_game_shell": {
      result = { shell: clone(project.gameShell ?? null), report: clone(inspectGameShell(project, project.gameShell, { sourceDigest: doctorSourceDigest(project), strict: command.profile === "production" })) };
      break;
    }
    case "get_game_shell_report": {
      result = analyzeProject(syncActiveMap(project), { profile: command.profile }).gameShellReport;
      break;
    }
    case "suggest_game_shell": {
      result = suggestGameShell(project, { sourceDigest: doctorSourceDigest(project), status: command.status });
      break;
    }
    case "set_game_shell": {
      if (!command.shell || typeof command.shell !== "object" || Array.isArray(command.shell)) throw new Error("set_game_shell requires a shell object.");
      const preliminary = inspectGameShell({ ...project, gameShell: command.shell }, command.shell, { strict: command.shell.status === "approved" });
      if (preliminary.errors.length) throw new Error(`Game shell is invalid: ${preliminary.errors.join(" ")}`);
      const shell = normalizeGameShell(command.shell, { projectName: project.name });
      const projected = { ...project, gameShell: shell };
      const report = inspectGameShell(projected, shell, { sourceDigest: doctorSourceDigest(projected), strict: shell.status === "approved" });
      if (report.errors.length) throw new Error(`Game shell is invalid: ${report.errors.join(" ")}`);
      project.gameShell = shell;
      changed = true;
      result = { shell: clone(shell), report: clone(report) };
      break;
    }
    case "remove_game_shell": {
      delete project.gameShell;
      changed = true;
      result = { removed: true };
      break;
    }
    case "get_feel_report": {
      result = measureGameFeel(project, { sourceDigest: doctorSourceDigest(project) });
      break;
    }
    case "get_tuning_contract": {
      result = inspectTuningContract(project, project.tuningContract, { sourceDigest: doctorSourceDigest(project) });
      break;
    }
    case "suggest_tuning_contract": {
      result = suggestTuningContract(project, { sourceDigest: doctorSourceDigest(project), maxCandidates: command.maxCandidates });
      break;
    }
    case "set_tuning_contract": {
      if (!command.contract || typeof command.contract !== "object" || Array.isArray(command.contract)) throw new Error("set_tuning_contract requires a contract object.");
      const contract = normalizeTuningContract(command.contract);
      const projected = { ...project, tuningContract: contract };
      const inspection = inspectTuningContract(projected, contract, { sourceDigest: doctorSourceDigest(projected) });
      if (inspection.errors.length) throw new Error(`Tuning contract is invalid: ${inspection.errors.join(" ")}`);
      project.tuningContract = contract;
      changed = true;
      result = { contract: clone(contract), inspection: clone(inspection) };
      break;
    }
    case "remove_tuning_contract": {
      delete project.tuningContract;
      changed = true;
      result = { removed: true };
      break;
    }
    case "run_tuning_search": {
      const sourceDigest = doctorSourceDigest(project);
      result = runTuningSearch(project, {
        sourceDigest,
        contract: command.contract ?? project.tuningContract,
        evaluateCandidate: (candidate) => ({
          validation: validateProject(candidate),
          prototypeDoctor: analyzeProject(candidate, { profile: "prototype" }),
          productionDoctor: analyzeProject(candidate, { profile: "production" }),
        }),
      });
      break;
    }
    case "list_game_foundations": {
      const evaluateFoundation = (candidate) => ({
        validation: validateProject(candidate),
        prototypeDoctor: analyzeProject(candidate, { profile: "prototype" }),
        productionDoctor: analyzeProject(candidate, { profile: "production" }),
      });
      result = listGameFoundations({ loadFoundation: createTemplate, evaluateFoundation });
      break;
    }
    case "suggest_game_foundations": {
      const sourceDigest = doctorSourceDigest(project);
      const evaluateFoundation = (candidate) => ({
        validation: validateProject(candidate),
        prototypeDoctor: analyzeProject(candidate, { profile: "prototype" }),
        productionDoctor: analyzeProject(candidate, { profile: "production" }),
      });
      result = suggestGameFoundations(project, {
        sourceDigest,
        loadFoundation: createTemplate,
        evaluateFoundation,
        maxCandidates: command.maxCandidates,
        allowReplacement: command.allowReplacement,
        allowUnproven: command.allowUnproven,
      });
      break;
    }
    case "materialize_game_foundation": {
      const sourceDigest = doctorSourceDigest(project);
      const evaluateFoundation = (candidate) => ({
        validation: validateProject(candidate),
        prototypeDoctor: analyzeProject(candidate, { profile: "prototype" }),
        productionDoctor: analyzeProject(candidate, { profile: "production" }),
      });
      result = materializeGameFoundation(project, {
        sourceDigest,
        loadFoundation: createTemplate,
        evaluateFoundation,
        foundationId: command.foundationId,
        expectedCandidateDigest: command.expectedCandidateDigest,
        maxCandidates: LOOPLAB_GAME_FOUNDATION_LIMITS.maximumCandidates,
        allowReplacement: command.allowReplacement,
        allowUnproven: command.allowUnproven,
      });
      break;
    }
    case "get_structural_scaffold_contract": {
      result = inspectStructuralScaffoldContract(project, project.structuralScaffoldContract, { sourceDigest: doctorSourceDigest(project) });
      break;
    }
    case "suggest_structural_scaffold_contract": {
      result = suggestStructuralScaffoldContract(project, { families: command.families, maxCandidates: command.maxCandidates, allowReplacement: command.allowReplacement });
      break;
    }
    case "set_structural_scaffold_contract": {
      if (!command.contract || typeof command.contract !== "object" || Array.isArray(command.contract)) throw new Error("set_structural_scaffold_contract requires a contract object.");
      const contract = normalizeStructuralScaffoldContract(command.contract);
      const projected = { ...project, structuralScaffoldContract: contract };
      const inspection = inspectStructuralScaffoldContract(projected, command.contract, { sourceDigest: doctorSourceDigest(projected) });
      if (inspection.errors.length) throw new Error(`Structural scaffold contract is invalid: ${inspection.errors.join(" ")}`);
      project.structuralScaffoldContract = contract;
      changed = true;
      result = { contract: clone(contract), inspection: clone(inspection) };
      break;
    }
    case "remove_structural_scaffold_contract": {
      delete project.structuralScaffoldContract;
      changed = true;
      result = { removed: true };
      break;
    }
    case "run_structural_scaffold_search": {
      const sourceDigest = doctorSourceDigest(project);
      result = runStructuralScaffoldSearch(project, {
        sourceDigest,
        contract: command.contract ?? project.structuralScaffoldContract,
        evaluateCandidate: (candidate) => ({
          validation: validateProject(candidate),
          prototypeDoctor: analyzeProject(candidate, { profile: "prototype" }),
          productionDoctor: analyzeProject(candidate, { profile: "production" }),
        }),
      });
      break;
    }
    case "materialize_structural_scaffold": {
      const sourceDigest = doctorSourceDigest(project);
      result = materializeStructuralScaffold(project, {
        sourceDigest,
        contract: command.contract ?? project.structuralScaffoldContract,
        candidateId: command.candidateId,
        expectedCandidateDigest: command.expectedCandidateDigest,
        slotValues: command.slotValues,
        evaluateCandidate: (candidate) => ({
          validation: validateProject(candidate),
          prototypeDoctor: analyzeProject(candidate, { profile: "prototype" }),
          productionDoctor: analyzeProject(candidate, { profile: "production" }),
        }),
      });
      break;
    }
    case "get_spatial_layout_contract": {
      result = inspectSpatialLayoutContract(project, project.spatialLayoutContract, { sourceDigest: doctorSourceDigest(project) });
      break;
    }
    case "suggest_spatial_layout_contract": {
      result = suggestSpatialLayoutContract(project, { mapId: command.mapId, maxCandidates: command.maxCandidates, allowReplacement: command.allowReplacement });
      break;
    }
    case "set_spatial_layout_contract": {
      if (!command.contract || typeof command.contract !== "object" || Array.isArray(command.contract)) throw new Error("set_spatial_layout_contract requires a contract object.");
      const contract = normalizeSpatialLayoutContract(project, command.contract);
      const projected = { ...project, spatialLayoutContract: contract };
      const inspection = inspectSpatialLayoutContract(projected, command.contract, { sourceDigest: doctorSourceDigest(projected) });
      if (inspection.errors.length) throw new Error(`Spatial layout contract is invalid: ${inspection.errors.join(" ")}`);
      project.spatialLayoutContract = contract;
      changed = true;
      result = { contract: clone(contract), inspection: clone(inspection) };
      break;
    }
    case "remove_spatial_layout_contract": {
      delete project.spatialLayoutContract;
      changed = true;
      result = { removed: true };
      break;
    }
    case "run_spatial_layout_search": {
      const sourceDigest = doctorSourceDigest(project);
      const evaluateCandidate = (mapChanges, sourceProject, mapId) => {
        const candidate = mapChanges
          ? applyAgentCommand(sourceProject, { op: "update_map", id: mapId, changes: mapChanges }, { recordChange: false, allowInvalidResult: true }).project
          : sourceProject;
        return {
          validation: validateProject(candidate),
          prototypeDoctor: analyzeProject(candidate, { profile: "prototype" }),
          productionDoctor: analyzeProject(candidate, { profile: "production" }),
        };
      };
      result = runSpatialLayoutSearch(project, { sourceDigest, contract: command.contract ?? project.spatialLayoutContract, evaluateCandidate });
      break;
    }
    case "materialize_spatial_layout": {
      const sourceDigest = doctorSourceDigest(project);
      const evaluateCandidate = (mapChanges, sourceProject, mapId) => {
        const candidate = mapChanges
          ? applyAgentCommand(sourceProject, { op: "update_map", id: mapId, changes: mapChanges }, { recordChange: false, allowInvalidResult: true }).project
          : sourceProject;
        return {
          validation: validateProject(candidate),
          prototypeDoctor: analyzeProject(candidate, { profile: "prototype" }),
          productionDoctor: analyzeProject(candidate, { profile: "production" }),
        };
      };
      result = materializeSpatialLayout(project, {
        sourceDigest,
        contract: command.contract ?? project.spatialLayoutContract,
        candidateId: command.candidateId,
        expectedCandidateDigest: command.expectedCandidateDigest,
        evaluateCandidate,
      });
      break;
    }
    case "get_verb_architecture": {
      result = inspectVerbArchitecture(project);
      break;
    }
    case "set_verb_architecture": {
      if (!command.architecture || typeof command.architecture !== "object" || Array.isArray(command.architecture)) {
        throw new Error("set_verb_architecture requires an architecture object.");
      }
      const architecture = normalizeVerbArchitecture(command.architecture);
      const inspection = inspectVerbArchitecture({ ...project, verbArchitecture: architecture }, architecture);
      if (inspection.errors.length) throw new Error(`Verb architecture is invalid: ${inspection.errors.join(" ")}`);
      project.verbArchitecture = architecture;
      changed = true;
      result = { architecture: clone(architecture), inspection: clone(inspection) };
      break;
    }
    case "remove_verb_architecture": {
      delete project.verbArchitecture;
      changed = true;
      result = { removed: true };
      break;
    }
    case "queue_agent_request": {
      project.agentRequests ??= [];
      const request = { id: command.id ?? makeId(), prompt: String(command.prompt ?? "").trim(), provider: command.provider ?? "openai", track: command.track ?? "gameplay", designBrief: command.designBrief ? clone(command.designBrief) : null, loop: command.loop ? clone(command.loop) : null, status: "pending", createdAt: new Date().toISOString() };
      if (!request.prompt) throw new Error("queue_agent_request requires a prompt.");
      if (request.designBrief) {
        const briefErrors = validateDirectedGameBrief(request.designBrief, "queue_agent_request.designBrief");
        if (briefErrors.length) throw new Error(briefErrors.join(" "));
        if (request.prompt !== request.designBrief.composedPrompt) throw new Error("queue_agent_request prompt must match designBrief.composedPrompt.");
      }
      project.agentRequests.push(request);
      changed = true;
      result = { request: clone(request) };
      break;
    }
    case "set_game_brief": {
      const designBrief = composeDirectedGameBrief(command);
      project.designBrief = designBrief;
      changed = true;
      result = { designBrief: clone(designBrief) };
      break;
    }
    case "get_prompt_draft": {
      const existingBrief = project.designBrief && validateDirectedGameBrief(project.designBrief).length === 0 ? project.designBrief : null;
      const designBrief = existingBrief ?? composeDirectedGameBrief(command);
      result = { designBrief: clone(designBrief), promptVariant: designBrief.promptVariant ?? null, promptVariantLabel: promptVariantLabel(designBrief.promptVariant), composedPrompt: designBrief.composedPrompt, providerGenerated: Boolean(designBrief.promptGeneration), promptGeneration: clone(designBrief.promptGeneration ?? null) };
      break;
    }
    case "retry_prompt": {
      const draft = command.draft && typeof command.draft === "object" && !Array.isArray(command.draft)
        ? command.draft
        : { ...(command.promptGeneration ?? {}), prompt: command.generatedPrompt, comparisonPrompt: command.currentPrompt, requiredConstraints: command.requiredConstraints ?? command.promptGeneration?.requiredConstraints };
      if (!draft || typeof draft.prompt !== "string") throw new Error("retry_prompt requires a provider-generated draft. Use the browser bridge or POST /prompt-drafts; local lens rotation is not AI generation.");
      const current = project.designBrief ?? composeDirectedGameBrief(command);
      const designBrief = composeProviderGeneratedGameBrief(current, draft);
      project.designBrief = designBrief;
      changed = true;
      result = { designBrief: clone(designBrief), providerGenerated: true, promptGeneration: clone(designBrief.promptGeneration), composedPrompt: designBrief.composedPrompt };
      break;
    }
    case "complete_agent_request": {
      project.agentRequests ??= [];
      const index = project.agentRequests.findIndex((request) => request.id === command.id);
      if (index < 0) throw new Error("Agent request was not found.");
      project.agentRequests[index] = { ...project.agentRequests[index], status: command.status ?? "completed", summary: command.summary ?? null, completedAt: new Date().toISOString() };
      changed = true;
      result = { request: clone(project.agentRequests[index]) };
      break;
    }
    default:
      throw new Error(`Unknown command op: ${command.op}`);
  }

  if (changed && !coordinationOnly) project = invalidateVerifiedAuthoring(inputProject, syncActiveMap(project), { reason: `Headless ${command.op} changed authored game state` });
  if (changed && options.recordChange !== false) project = recordAgentProjectChange(inputProject, project, changeRecordCommand, { channel: "headless", ...(coordinationOnly ? { category: "coordination" } : {}) });
  const validation = validateProject(project);
  if (changed && !validation.valid && options.allowInvalidResult !== true) throw new Error(`Command produced an invalid project: ${validation.errors.join(" ")}`);
  return { changed, project, result, validation };
}

export function applyCollectedVerificationEvidence(inputProject, evidenceRefs, options = {}) {
  return applyAgentCommand(inputProject, { op: "verify_iteration", evidenceRefs }, { ...options, evidenceAuthority: LOOPLAB_EVIDENCE_AUTHORITY });
}

export function promoteVerifiedIteration(inputProject, options = {}) {
  return applyAgentCommand(inputProject, { op: "promote_iteration" }, { ...options, evidenceAuthority: LOOPLAB_EVIDENCE_AUTHORITY });
}

export function getAgentManifest() {
  return {
    name: "Looplab Headless Agent API",
    protocolVersion: LOOPLAB_PROTOCOL_VERSION,
    agentOperatingModel: {
      purpose: "LoopLab is an AI capability amplifier and structured game-authoring workstation, not a form the agent is confined to.",
      headlessFirst: true,
      primaryConsumer: "Codex, Claude, and other schema-capable agents operating complete 2D game-authoring workflows.",
      primarySurface: "The versioned command contracts, compact state selectors, durable companion jobs, receipts, and verification gates are the canonical product surface.",
      humanUiRole: "The Windows UI is a secondary inspection, direction, and precise-tweak layer over the same capabilities; it is never an agent capability ceiling.",
      visualPolicy: "Use machine-readable state and exact commands for repeatable authoring; use the rendered UI and browser automation when visual judgment or direct manipulation is the evidence required.",
      userRole: "The AI may own the complete create-preview-adjust-test-export workflow while the user retains optional direction, inspection, and precise mouse edits.",
      memoryPolicy: "Project state, variations, route truth, assets, diagnostics, replay evidence, visual captures, comparisons, and export receipts make future passes more informed than editing raw HTML or screenshots alone.",
      errorPrevention: [
        "separate generated art from authored collision and traversal truth",
        "require ground-contact anchors and explicit support for floor-standing objects",
        "preserve world x/y/z and deterministic depth independently from screen projection",
        "round-trip rich route documents without discarding timing, waits, animation, facing, meetings, events, depth, or hashes",
        "mark evidence stale after authored changes instead of silently reusing or rerecording it",
        "validate exact map joins and replay behavior in the runtime, not only the schema",
        "make UI and headless edits share the same command validation",
        "protect the best project with variations and reject regressing candidates",
        "turn repeatable hard-won fixes into tested builder capabilities instead of one-off project workarounds",
      ],
    },
    agentIntentPlanning: {
      schemaVersion: LOOPLAB_AGENT_PLAN_SCHEMA,
      command: "draft_agent_plan",
      providerFree: true,
      nonExecuting: true,
      sourceBound: true,
      primaryConsumer: "Codex, Claude, CLI, MCP, and browser-bridge agents.",
      authoritativeRepresentation: "coverage and ordered phases; the visible UI is a secondary inspection surface, never the capability ceiling",
      strategies: ["composite-workflow", "command-macro", "playbook-recipe", "guarded-workflow"],
      composition: "Multiple independent intent requirements are preserved in an explicit coverage ledger and ordered bounded phases instead of collapsing to the first phrase-matched macro.",
      compactPlan: "With compact:true, plans retain authoritative phase/coverage/source/retry data and exact commands/receipts, while step instructions, command schemas, macros, and recipes become stable references into looplab://manifest and looplab://agent-playbook instead of repeated prose and registries.",
      retryPolicy: "Reads may be retried; durable jobs resume by ID; mutations retry only when confirmed unapplied; an applied receipt forbids automatic replay.",
      resumePolicy: "Preserve completed phase evidence and resume the first incomplete phase only while plan definition and source lineage remain valid; otherwise redraft.",
      reviewBoundary: "A drafted plan never persists, executes, or grants authority. A later canonical mutation must still satisfy current source and expansion digests plus every normal Doctor, replay, browser, provider, and export gate.",
      stalePolicy: "Any sourceDigest change invalidates downstream exact commands unless it is the acknowledged receipt from the just-completed phase; redraft against current truth before continuing.",
    },
    agentBatchPreview: {
      schemaVersion: LOOPLAB_AGENT_BATCH_PREVIEW_SCHEMA,
      previewCommand: "preview_batch",
      applyCommand: "apply_previewed_batch",
      providerFree: true,
      cloneExecuted: true,
      sourceBound: true,
      previewDigestBound: true,
      maximumCommands: 64,
      authority: "A preview never persists or grants mutation authority. Apply rebuilds the same preview and requires both the current source digest and exact preview digest before one atomic write.",
      sideEffectBoundary: "Only canonical core authored-project mutations are previewable. Provider, browser, coordination, lifecycle, nested macro, and nested preview operations are rejected.",
      gate: "The current-authoring and production Doctor profiles are both evaluated; a new blocker in either profile rejects apply.",
    },
    mechanicalRepair: {
      repairSchemaVersion: LOOPLAB_AUTO_REPAIR_SCHEMA,
      convergenceSchemaVersion: LOOPLAB_CONVERGENCE_SCHEMA,
      previewCommand: "auto_repair",
      convergenceCommand: "converge",
      limits: LOOPLAB_AUTO_REPAIR_LIMITS,
      providerFree: true,
      dryRunDefault: true,
      sourceBound: true,
      exactPlanDigestBound: true,
      boundedConvergence: true,
      cycleDetection: true,
      authority: "Only deterministic, local, idempotent invariant restoration may be proposed automatically. Exact source and plan digests are required before one atomic commit.",
      judgmentBoundary: "Art direction, route design, reachability, tuning, collider semantics, clearance, and any non-unique change remain visible residue for a human or provider-backed design pass.",
      gate: "Every pass clone-executes canonical core commands, validates the projected project, evaluates current and production Doctor profiles, and rejects new blockers.",
    },
    builderBenchmark: {
      ...getBuilderBenchmarkSuite(),
      runSchemaVersion: LOOPLAB_BUILDER_BENCHMARK_RUN_SCHEMA,
      comparisonSchemaVersion: LOOPLAB_BUILDER_BENCHMARK_COMPARISON_SCHEMA,
      commands: ["list_builder_benchmarks", "evaluate_builder_benchmark", "compare_builder_benchmark_runs"],
      limits: LOOPLAB_BUILDER_BENCHMARK_LIMITS,
      providerFreeEvaluation: true,
      providerExecution: "Provider-backed benchmark generation uses the ordinary Director and durable companion /jobs lifecycle. No benchmark ID grants privileged behavior or a hidden generation path.",
      evidenceBoundary: "Raw validation, current/production Doctor, liveness, completion, acceptance, replay, join, gameplay-program, visual-readiness, and exact one-file audit evidence remain visible. A composite proxy never hides a blocker and never claims taste.",
    },
    agentChangeFeed: {
      schemaVersion: LOOPLAB_AGENT_CHANGE_FEED_SCHEMA,
      command: "get_agent_changes",
      limits: LOOPLAB_AGENT_CHANGE_FEED_LIMITS,
      cursorPolicy: "Cursors are opaque bookmarks. Omitted cursor establishes the current bookmark; a retained cursor returns later events; an expired or foreign cursor returns resyncRequired instead of a misleading empty delta.",
      retentionPolicy: "One compact semantic event is retained per successful mutation. Atomic batches and proven macros remain one event. Raw commands, prompts, provider content, secrets, embedded assets, snapshots, patches, and exported HTML are never retained.",
      authority: "The feed is resumable orientation only. Canonical project/context reads, source-bound commands, Project Doctor, and exact evidence remain authoritative.",
      delivery: "The looplab:agent-change-recorded browser event is a wake-up hint. Browser, CLI, and MCP clients recover through get_agent_changes from their last cursor.",
      runtimeBoundary: "The journal lives in non-runtime authoring metadata and does not alter gameplay source digests or exported one-file HTML bytes.",
    },
    capabilityHarvesting: {
      id: "capability-harvesting-v1",
      permanent: true,
      trigger: "A difficult problem reveals a failure mode likely to recur across projects, providers, interfaces, runtimes, or verification passes.",
      procedure: [
        "reproduce and solve the concrete failure without weakening a gate",
        "classify the solution as project-specific or reusable",
        "encode reusable behavior in the narrowest canonical LoopLab layer",
        "add a regression test that reproduces the original failure",
        "replay the rejected candidate through the improved builder",
        "record the reusable capability gained",
      ],
      canonicalLayers: ["command-and-schema", "runtime-and-export", "doctor-and-verification", "ui-and-headless-transport", "provider-context", "agent-guidance"],
      boundary: "Keep narrative, art direction, level content, and balance project-specific. Never weaken Doctor, replay, browser, or release gates to make a candidate pass.",
    },
    preferenceMemory: {
      schemaVersion: LOOPLAB_PREFERENCE_MEMORY_SCHEMA,
      appliedContextSchemaVersion: LOOPLAB_APPLIED_PREFERENCE_CONTEXT_SCHEMA,
      commands: ["get_preference_memory", "get_applied_preferences", "set_preference_memory_enabled", "add_preference_statement", "record_candidate_preference", "update_preference_entry", "remove_preference_entry", "clear_preference_memory", "import_preference_memory"],
      dimensions: LOOPLAB_PREFERENCE_DIMENSIONS,
      policy: LOOPLAB_PREFERENCE_MEMORY_POLICY,
      storage: "Browser-local builder state on the supported Windows authoring host. It is not project source and file-only core commands never read it implicitly.",
      providerBoundary: "Only an exact, bounded looplab-applied-preference-context/v1 receipt may enter prompt generation or a durable provider job. The current user brief and explicit style locks override every entry.",
      inferenceBoundary: "Only deliberate statements and source-bound candidate choices are stored. Hover, click, dwell time, Doctor output, provider output, and missing feedback never become preferences.",
      exportBoundary: "Preference memory, applied context, screenshots, prompts, responses, and credentials are excluded from project JSON, replay state, snapshots, and one-file HTML.",
    },
    playtestObservation: {
      ledgerSchemaVersion: LOOPLAB_PLAYTEST_LEDGER_SCHEMA,
      sessionSchemaVersion: LOOPLAB_PLAYTEST_SESSION_SCHEMA,
      commands: ["get_playtest_sessions", "get_active_playtest_session", "start_playtest_session", "finish_playtest_session", "discard_playtest_session", "update_playtest_feedback", "remove_playtest_session", "clear_playtest_sessions", "import_playtest_sessions", "preview_playtest_replay", "promote_playtest_replay"],
      policy: LOOPLAB_PLAYTEST_OBSERVATION_POLICY,
      limits: LOOPLAB_PLAYTEST_LIMITS,
      storage: "Browser-local builder state on the supported Windows authoring host. Recording is off by default and requires explicit consent for every session.",
      timing: "Active elapsed time remains descriptive and uses the browser monotonic clock, while replay-capable v2 tapes bind every semantic transition to the exact fixed simulation boundary. Hidden or UI-only refreshes never advance that tick.",
      inputBoundary: "Only resolved semantic gameplay-action transitions are retained. Arbitrary typed keys, text input, screenshots, device identifiers, and browser fingerprints are rejected. Legacy wall-clock tapes remain readable but cannot be rounded into replay ticks.",
      spatialBoundary: "World coordinates are sampled at most four times per active second and reduced to source-bound per-map 16 by 12 heatmaps. Screen coordinates never become map truth.",
      preferenceBoundary: "Deaths, resets, idle spans, quits, completion, and dwell are descriptive design observations only. Taste exists only when the player deliberately supplies a rating, tag, or note.",
      evidenceBoundary: "A human observation session is never evidence by itself. Explicit promotion requires matching source/session/preview digests, an authored-reset exact-tick tape, no dropped inputs/events or reset, event-count parity, and the ordinary replay recorder's passing pinned rerun; only that resulting replay fixture enters Project Doctor and release gates.",
      providerBoundary: "Playtest sessions never enter provider context automatically. A human or agent may deliberately summarize relevant findings in a later bounded request.",
      exportBoundary: "The ledger, input tape, world samples, ratings, and heatmaps are excluded from project JSON and one-file game HTML.",
    },    productScope: {
      dimension: "2d",
      renderer: "2D browser runtime using Canvas, Phaser, PixiJS, or melonJS as a view adapter",
      includes: ["orthographic", "top-down", "side-scroller", "single-screen", "connected maps", "dimetric/isometric 2.5D"],
      excludes: ["3D engine", "3D editor", "Three.js", "React Three Fiber", "GLB/glTF asset pipeline"],
      elevationPolicy: "Dimetric/isometric maps may author world x/y/z for elevation, support, collision, and deterministic depth while all visuals remain 2D sprites, tiles, and Canvas draw operations.",
    },
    objectAuthoring: { ...LOOPLAB_OBJECT_UPDATE_POLICY },
    transport: {
      cli: "npm run agent -- <operation>",
      browserGlobal: "window.looplabAgent",
      browserGlobalAvailability: "preferred-when-window-is-extensible",
      manifestUrl: "/agent-manifest.json",
      projectStateSelector: "#looplab-project-state",
      directorStateSelector: "#looplab-director-state",
      preferenceMemoryStateSelector: "#looplab-preference-memory-state",
      playtestObservationStateSelector: "#looplab-playtest-observation-state",
      researchStateSelector: "#looplab-research-state",
      assetCatalogStateSelector: "#looplab-asset-catalog-state",
      assetPackStateSelector: "#looplab-asset-pack-state",
      visualReviewStateSelector: "#looplab-visual-review-state",
      visualCritiqueStateSelector: "#looplab-visual-critique-state",
      projectContextSelector: "#looplab-agent-context-pack",
      workLedgerSelector: "#looplab-agent-work-ledger",
      intentPlanSelector: "#looplab-agent-plan",
      batchPreviewSelector: "#looplab-agent-batch-preview",
      changeFeedSelector: "#looplab-agent-change-feed",
      builderBenchmarkSelector: "#looplab-agent-builder-benchmark",
      bridgeSelector: "#looplab-agent-bridge",
      domCommandEvent: "looplab:agent-command",
      domResponseEvent: "looplab:agent-response",
      domForm: {
        selector: "#looplab-agent-form",
        commandInput: "#looplab-agent-command",
        submit: "#looplab-agent-submit",
        result: "#looplab-agent-result",
        compactOnly: true,
        responseSchema: LOOPLAB_BOUNDED_AGENT_RESPONSE_SCHEMA,
        responseLimitCharacters: LOOPLAB_AGENT_FORM_RESPONSE_LIMIT_CHARACTERS,
        overflowPolicy: "The form always emits complete, parseable JSON. Oversized successful mutations return an applied receipt with retrySafe=false; oversized read-only results return a structured recovery problem. Complete source belongs on MCP, CLI, or resource surfaces.",
      },
      readyEvent: "looplab:ready",
      changeEvent: "looplab:project-changed",
      agentChangeRecordedEvent: "looplab:agent-change-recorded",
      workLedgerChangeEvent: "looplab:work-ledger-changed",
      preferenceMemoryChangeEvent: "looplab:preference-memory-changed",
      playtestObservationChangeEvent: "looplab:playtest-observation-changed",
    },
    requiredWorkflow: ["list_shared_projects", "get_agent_changes", "get_agent_brief", "draft_agent_plan", "get_agent_presence", "get_work_ledger", "get_pending_requests", "get_doctor", "get_project_context", "route_work", "preview_batch", "apply_previewed_batch", "save_shared_project", "get_doctor", "get_privacy_report", "get_acceptance_plan", "run_acceptance_suite", "get_completion_report", "run_bot_cohorts", "run_replay_suite", "get_runtime_join_plan", "get_visual_readiness", "playtest", "capture_visual_review", "collect_verification_evidence", "verify_release", "get_release_verification", "verify_iteration", "checkpoint_iteration", "promote_iteration"],
    headlessResponses: {
      compactMutationOption: "Set compact:true on browser window/event mutations to omit the full embedded-asset project while preserving result and validation. The hardened browser form enforces compact:true for every command.",
      boundedFormTransport: "The hardened browser form is a compact-only locator fallback with a declared character budget. It never character-slices JSON. An oversized successful mutation returns a source-bound applied receipt with retrySafe=false; an oversized read returns a structured size problem and recovery surfaces.",
      browserMcpTransport: "Browser MCP defaults every command to compact:true and defensively omits the redundant outer project payload. Callers may explicitly request compact:false only when complete data is genuinely required; get_project remains the deliberate full-state operation.",
      mutationPrecondition: "Set expectedSourceDigest to the Project Doctor sourceDigest inspected before authoring. preview_batch rejects stale state before clone execution; apply_previewed_batch additionally requires its exact SHA-256 preview digest.",
      batchPreviewWorkflow: "Use preview_batch for a nontrivial arbitrary canonical batch, review command errors plus current/release Doctor deltas, then call apply_previewed_batch with unchanged commands, summary, profile, expectedSourceDigest, and expectedPreviewDigest. Preview is provider-free and non-persisting; apply re-previews and atomically writes only the exact reviewed projection.",
      commandMacroWorkflow: "Use list_command_macros, preview_command_macro, then apply_command_macro with both the exact expectedSourceDigest and SHA-256 expectedExpansionDigest. Preview runs current-authoring and production Doctor on a clone; operation receipts are compact by default with detail=full available; macros expand only to canonical core commands and never bypass either gate.",
      agentPlaybookWorkflow: "Use relevant recipe references from get_agent_brief, search with list_agent_recipes, then read one exact recipe with get_agent_recipe. Recipes are read-only context and never execute or bypass canonical command gates.",
      agentIntentPlanWorkflow: "Send a bounded intent to draft_agent_plan after the warm-start brief. Treat coverage and ordered phases as authoritative: every detected requirement must be satisfied, planned, blocked, or explicitly need input. Retain completed evidence, redraft after authored source changes, resume durable jobs by ID, and never retry an applied mutation receipt. The plan is provider-free, non-executing, and shared identically by Codex, Claude, CLI, MCP, browser bridge, and the secondary UI.",
      agentPresenceWorkflow: "Read get_agent_presence, then register_agent_presence with one stable ID and renew before half the returned TTL. Retain the opaque leaseToken locally, leave explicitly when possible, and use the durable work ledger—not presence—for ownership, handoff, or completion truth.",
      sharedProjectStoreWorkflow: "Begin with list_shared_projects and mount the chosen ID before editing. Retain sourceDigest for gameplay-command freshness and the separate complete-document revisionDigest for shared-store concurrency. Save with expectedRevisionDigest or createOnly. On HTTP 412 preserve the local draft, preview and apply only an exact conflict-free rebase receipt, rerun gates, then save explicitly. IndexedDB is a recoverable browser cache, never equal authority.",
      sharedWorkLedgerWorkflow: "Use compact-by-default get_work_ledger, then send the exact returned ledgerDigest as expectedLedgerDigest to add, claim, update, or release work. Claims are renewable leases; coordination changes never invalidate gameplay verification or execute work automatically.",
      agentProjectContextWorkflow: "Start with get_agent_brief, then use get_project_context view=campaign or view=map with stable mapIds. The bounded context is source-bound and omission-explicit, but it is never mutation input or verification evidence. Use get_project only when the complete editable source is actually required.",
      agentChangeFeedWorkflow: "Store the opaque currentCursor from get_agent_changes. On resume, request later events with that cursor and follow nextCursor while hasMore. If resyncRequired is true, discard cached assumptions and reread get_agent_brief plus bounded project context before continuing.",
      agentReadinessWorkflow: "Read get_agent_brief.readiness.current for the active authoring gate and readiness.release for the production target on the same source. A passing prototype/current profile may protect an iteration but is never release readiness; production blocking and exact evidence govern release-ready one-file export. Prototype exports remain drafts.",
      privacyWorkflow: "Require get_privacy_report status=clear on the current production source before provider handoff, shared-project publication, release verification, or export. Prompt drafting, game iteration, research, consented visual critique, AI art, and the loopback copilot independently rescan their exact outbound text before inference. Findings are value-free and must be repaired locally, never forwarded to another provider.",
      assetPatchCommand: "Use update_asset with a stable id and changes object for precise visual metadata or embedded-image updates without replacing authored collision.",
      collisionPolicy: "update_asset preserves collisionPolicy=authored-only and never changes object collision geometry.",
    },
    agentWorkLedger: {
      schemaVersion: LOOPLAB_AGENT_WORK_LEDGER_SCHEMA,
      commands: ["get_work_ledger", ...LOOPLAB_AGENT_WORK_LEDGER_MUTATIONS],
      concurrency: "Every mutation requires the exact expectedLedgerDigest returned by the latest read; stale writers receive a stale-ledger error and must rebase.",
      claims: { kind: "renewable-expiring-lease", defaultSeconds: 7200, minimumSeconds: 300, maximumSeconds: 86400, intentionalTakeoverRequiresReason: true },
      privacy: { providerContext: false, exportedHtml: false, secretsAllowed: false },
      evidenceBoundary: "Coordination metadata is separate from the Project Doctor source digest and cannot invalidate or satisfy gameplay verification.",
      executionBoundary: "Ledger items are plans and receipts only. They never auto-execute commands, bypass command contracts, or weaken gates.",
    },
    agentPresence: {
      schemaVersion: LOOPLAB_AGENT_PRESENCE_SCHEMA,
      commands: ["get_agent_presence", "register_agent_presence", "leave_agent_presence"],
      endpoint: "/agent-presence",
      policy: LOOPLAB_AGENT_PRESENCE_POLICY,
      lease: "Server-timestamped, companion-memory-only, opaque-token heartbeat with structured conflict and automatic expiry.",
      durableAuthority: "Presence says who is live now. agentWorkLedger remains the only durable coordination, claim, handoff, and completion authority.",
      privacy: { projectSource: false, providerContext: false, exportedHtml: false, prompts: false, paths: false, secrets: false },
      evidenceBoundary: "Live presence never enters Project Doctor source digests and can neither satisfy nor invalidate acceptance, replay, visual, or release evidence.",
    },
    agentProjectContext: {
      schemaVersion: LOOPLAB_AGENT_PROJECT_CONTEXT_SCHEMA,
      command: "get_project_context",
      views: ["campaign", "map"],
      limits: LOOPLAB_AGENT_PROJECT_CONTEXT_LIMITS,
      sourceBinding: "Every response carries the exact Project Doctor sourceDigest used to build it.",
      omissionPolicy: "Embedded payloads, provider prompt bodies, secrets, snapshots, exported HTML, and unrelated map documents are omitted explicitly. Omission never means absence.",
      truthBoundary: "The context pack is read-only orientation. It is neither full mutation input nor acceptance, replay, browser, visual, or release evidence.",
      fullFallback: { op: "get_project" },
    },
    agentProjectReads: {
      schemaVersion: LOOPLAB_PROJECT_READ_SCHEMA,
      commands: ["get_project", "query_project"],
      compactDefault: { get_project: false, query_project: true },
      selectiveReads: ["strict selector", "RFC 6901 JSON Pointer"],
      diffReads: "get_project with sinceDigest returns a bounded RFC 6902-style patch against an archived Project Doctor source digest.",
      sourceBoundary: "Diffs compare Doctor-authored source projections; lifecycle, work-ledger, build, and verification metadata never create patch noise.",
      assetBoundary: "compact=true replaces embedded data URLs with length receipts and reports omitted bytes; compact=false is an explicit full-payload request.",
    },
    agentJsonlSession: {
      schemaVersion: LOOPLAB_AGENT_SESSION_SCHEMA,
      cli: "npm run agent -- session <project.loop.json> --save-policy=explicit|on-mutation|never",
      savePolicies: LOOPLAB_AGENT_SESSION_SAVE_POLICIES,
      limits: LOOPLAB_AGENT_SESSION_LIMITS,
      transport: "One JSON object per stdin line produces exactly one JSON result per stdout line; no unsolicited startup payload is written.",
      persistence: "The project remains in memory for the process lifetime. Disk writes are explicit, automatic after each applied change, or disabled according to the required startup policy.",
      mutationPrecondition: "Every contract-classified project mutation requires the latest session sourceDigest as expectedSourceDigest. Stale commands fail without changing session state.",
      controls: [{ sessionOp: "status" }, { sessionOp: "save" }, { sessionOp: "close" }],
      resultBoundary: "Results omit the complete in-memory project, default canonical commands to compact output, distinguish applied-but-unpersisted failures, and state whether retry is safe.",
    },
    agentReadiness: {
      schemaVersion: LOOPLAB_AGENT_READINESS_SCHEMA,
      currentSemantics: "active-authoring-gate",
      releaseSemantics: "one-file-release-target",
      releaseProfile: "production",
      policy: "A passing current profile may protect a verified iteration but is not release readiness. Production blocking plus exact source-bound evidence govern a release-ready one-file export; prototype exports remain drafts.",
    },
    templates: ["blank", "platformer", "topdown", "dimetric", "kinetic", "systems"],
    directedScaffolds: {
      kinetic: {
        template: "kinetic",
        name: "Kinetic City: Night Route",
        useFor: ["skating-tricks", "kinetic-runner", "traverse-chain-score", "rollerblading", "parkour", "momentum"],
        includes: ["two-connected-maps", "embedded-cohesive-art", "authored-traversal-paths", "ground-anchors", "movement-feel", "feature-contracts", "acceptance-tests"],
        truthPolicy: "Deterministic local provider input; never report it as an AI-generated or verified result.",
      },
    },
    objectKinds: LOOPLAB_OBJECT_KINDS,
    inputAuthoring: {
      command: "set_project",
      field: "changes.inputActions",
      replacementSemantics: "atomic",
      fields: ["id", "label", "bindings", "animationState", "onboarding", "replayEvent"],
      rule: "Author semantic input actions before gameplay rules and verb architecture reference them. Every action needs a stable unique ID, at least one concrete binding, onboarding visibility, replay coverage, and an animation state.",
      runtimePolicy: "setInput accepts semantic action IDs directly. The canonical runtime expands them to their locomotion or authored binding while retaining the semantic action phase, so Node, preview, replay, and exported headless control cannot diverge.",
      liveness: {
        schemaVersion: LOOPLAB_INPUT_ACTION_LIVENESS_SCHEMA,
        doctorIssueCode: "input-action-dead",
        executableConsumers: ["runtime-player-control", "gameplay-rule", "choice"],
        intentOnlyReferences: ["disabled-gameplay-rule", "verb-architecture", "animation-state", "onboarding", "replay-event"],
        policy: "Every declared action must have an executable consumer. Project Doctor checks the source graph; the browser harness then drives and releases every semantic action in the exact one-file artifact.",
      },
    },
    platformerReachability: {
      predictionMethod: "fork-and-step-runtime",
      tickRate: 60,
      doctorIssueCodes: ["platformer-support-unreachable", "platformer-required-target-unreachable"],
      requiredTargets: ["goal", "connected-map portal"],
      policy: "Project Doctor measures the real shipped jump integrator, builds a conservative support graph, reports unreachable optional supports as diagnostics, and blocks production when a required target has no route under the authored movement envelope.",
      evidence: ["behavior-asserting acceptance route", "versioned replay checkpoints", "browser playtest"],
      starterFixture: "pocket-route-completion",
    },
    completionHarness: {
      schemaVersion: LOOPLAB_COMPLETION_HARNESS_SCHEMA,
      runnerVersion: LOOPLAB_COMPLETION_HARNESS_VERSION,
      command: "get_completion_report",
      cli: "npm run agent -- completion <project.loop.json>",
      targetPredicate: "runtime.won === true",
      proofOrder: ["passing-authored-acceptance", "bounded-deterministic-model-search"],
      defaultBounds: LOOPLAB_COMPLETION_HARNESS_DEFAULTS,
      statuses: ["passed", "dead-end", "inconclusive", "not-applicable", "invalid"],
      honestyPolicy: "A bounded search that does not find a terminal witness is inconclusive, never proof that a game is unwinnable.",
      artifactEvidence: "The platform harness replays the source-bound semantic-action witness inside the exact exported one-file HTML and requires the exported runtime to reach runtime.won.",
    },
    botCohorts: {
      schemaVersion: LOOPLAB_BOT_COHORT_REPORT_SCHEMA,
      runnerVersion: LOOPLAB_BOT_COHORT_RUNNER_VERSION,
      command: "run_bot_cohorts",
      cli: "npm run agent -- bot-cohorts <project.loop.json> --source-digest=source-...",
      limits: LOOPLAB_BOT_COHORT_LIMITS,
      policies: ["start-state idle", "semantic action sweep", "single-action pressure", "seeded exploration", "known completion witness", "isolated map probes"],
      designSignals: ["route and map use", "live action and verb use", "verb co-exercise", "rule and choice activity", "traversal and portal activity", "single-action completion risk", "stationary active-input spans", "meaningful event density"],
      sourceBinding: "The report is read-only and bound to the exact current Project Doctor source digest; stale expectedSourceDigest inputs fail before simulation.",
      designPolicy: "Use observed gaps to revise teaching, recurring decisions, combinations, routes, pacing, and feedback. Never optimize blindly for cohort coverage or let a proxy choose a creative winner.",
      honestyPolicy: "Synthetic policies are not human personas. They prove only the listed deterministic observations and never prove fun, taste, accessibility, fairness, aesthetic quality, preference, or unreachability.",
      followupEvidence: ["provider-backed grounded design critique", "browser playtest", "human playtest observation", "candidate preference comparison against the protected baseline"],
    },
    designQualityProgram: {
      goal: "Help agents make materially better games, not merely valid HTML or higher proxy scores.",
      statusVocabulary: ["implemented", "partial", "open"],
      stages: [
        {
          id: "meaningfully-diverse-candidates",
          status: "partial",
          available: ["protected variations", "foundation alternatives", "tuning Pareto sets", "structural scaffold search", "spatial quality-diversity search", "source-bound candidate comparison"],
          open: "Generate and retain several whole-game creative candidates that differ in mechanics, relationships, flow, pacing, onboarding, feedback, progression, and art direction rather than surface wording alone.",
        },
        {
          id: "multidimensional-design-comparison",
          status: "partial",
          available: ["frozen cross-genre acceptance profiles", "named dimension vectors", "hard-gate comparison", "grounded visual critique", "candidate preference receipts"],
          open: "Unify play structure and presentation comparison without reducing creative quality to one automatic score or winner.",
        },
        {
          id: "real-play-and-explicit-preference",
          status: "partial",
          available: ["tick-accurate human play sessions", "feedback and heatmaps", "source-bound replay promotion", "explicit studio preference memory", "candidate preference records"],
          open: "Add study-level participant/session organization and richer preference evidence while keeping observations outside gameplay truth.",
        },
        {
          id: "deterministic-bot-diagnostics",
          status: "implemented",
          available: ["source-bound behavior cohorts", "dead-content and route observations", "single-action pressure", "exact deterministic traces", "explicit non-human proof boundary"],
          open: "Calibrate additional genre-neutral policies only against concrete observed failures; never use bots as a fun score.",
        },
        {
          id: "matched-agent-trials",
          status: "partial",
          available: ["visible cross-genre golden briefs", "deterministic evaluator receipts", "comparable run digests", "provider usage receipts"],
          open: "Run counterbalanced matched trials with and without LoopLab under equal model, prompt, context, time, and token conditions, then retain the complete trial set.",
        },
        {
          id: "polished-cross-genre-reference-games",
          status: "open",
          available: ["technically proven cross-genre foundations"],
          open: "Build and maintain polished reference games across substantially different 2D and dimetric 2.5D genres instead of treating structural fixtures as quality exemplars.",
        },
        {
          id: "blinded-human-preference",
          status: "open",
          available: ["explicit non-blind candidate preference records"],
          open: "Measure whether blinded players consistently prefer LoopLab-assisted outcomes while separating identity, order, familiarity, and recruitment effects.",
        },
      ],
      decisionPolicy: "Technical gates reject broken candidates. Behavioral reports expose design questions. Providers may propose and critique. Visual and human evidence decide creative preference. No single proxy automatically promotes a winner.",
      claimBoundary: "LoopLab may claim a capability is implemented only from code and exact proof. It may claim better game-design outcomes only from complete matched trials and blinded human preference evidence, not from internal scores or selected examples.",
    },
    platformHarness: {
      schemaVersion: LOOPLAB_PLATFORM_HARNESS_SCHEMA,
      runner: "playwright-core",
      runnerVersion: LOOPLAB_PLATFORM_HARNESS_VERSION,
      cli: {
        operation: "platform-harness",
        command: "npm run agent -- platform-harness <project.loop.json> <game.html>",
        directCommand: "npm run harness:platform -- <game.html>",
        browserOperation: "browser-harness",
        browserCommand: "npm run agent -- browser-harness <project.loop.json> <game.html> [--captures=<directory>]",
        visualDirectCommand: "npm run harness:browser -- <game.html>",
        loopbackPreviewCommand: "npm run preview:browser -- <game.html>",
      },
      environment: {
        iframeSandbox: ["allow-scripts"],
        opaqueOriginRequired: true,
        hostileAudioResume: true,
        exactFrameCount: LOOPLAB_PLATFORM_HARNESS_DEFAULTS.frameCount,
        exactFrameMs: LOOPLAB_PLATFORM_HARNESS_DEFAULTS.frameMs,
        malformedInputInterval: LOOPLAB_PLATFORM_HARNESS_DEFAULTS.malformedInputInterval,
      },
      checks: ["browser-available", "runtime-ready", "sandbox-opaque-origin", "source-digest", "game-shell-lifecycle", "portable-save-roundtrip", "input-action-liveness", "real-keyboard-input", "blur-clears-input", "semantic-input", "audio-failure-isolated", "presentation-runtime-isolated", "no-external-requests", "no-unhandled-errors", "frame-soak", "replay-suite", "acceptance-suite", "completion-witness", "terminal-state", "visual-capture"],
      receiptBinding: ["project-doctor-source-digest", "artifact-sha256"],
      findingPolicy: "Failures use Project Doctor-style subsystem, affectedIds, repairAction, and evidenceRequired fields so agents can perform the next pass without scraping prose.",
    },
    browserHarness: {
      schemaVersion: "looplab-browser-preview/v1",
      purpose: "Give Codex, Claude, CI, and human reviewers the same exact exported bytes through a safe browser surface instead of file-URL automation.",
      automatedCommand: "npm run agent -- browser-harness <project.loop.json> <game.html> [--captures=<directory>]",
      directAutomatedCommand: "npm run harness:browser -- <game.html>",
      interactiveCommand: "npm run preview:browser -- <game.html>",
      transport: {
        bind: "loopback-only",
        defaultHost: "127.0.0.1",
        defaultPort: "ephemeral",
        perRunUrl: "unguessable",
        cache: "disabled",
        runtimeNetwork: "blocked-by-csp",
      },
      evidence: ["initial-png", "final-png", "bounded-dom-snapshot", "runtime-state", "platform-harness-receipt", "artifact-sha256", "project-doctor-source-digest"],
      agentPolicy: "AI agents should use browser-harness after export whenever visual or interaction evidence is required, inspect the PNG and bounded DOM evidence, and use preview:browser only when an interactive localhost session is needed.",
    },
    gameplayRules: {
      policy: LOOPLAB_GAMEPLAY_RULE_POLICY,
      commands: ["get_gameplay_program", "set_gameplay_program", "remove_gameplay_program"],
      runtimeProofBoundary: "A rule is implementation only when the deterministic preview, replay model, and exported one-file runtime execute the same declared trigger, conditions, and effects.",
      systemsGameContract: {
        genres: "Genre-neutral: narrative, trading, management, tactics, RPG, deck/turn-based, top-down, platformer, and 2.5D projects may compose the same systems.",
        choiceInput: "Every choice references a declared semantic input action, so mouse UI, keyboard/gamepad, deterministic replay, acceptance tests, and headless control share one decision path.",
        formulas: "Integer-only bounded expression trees; no source strings, eval, Function, object paths, network, storage, or wall-clock access.",
        clocks: "Named clocks advance only through deterministic effects and may represent a turn, round, day, phase, wave, or other authored unit.",
        ui: "Variable-bound HUD and choice/dialogue pages render as accessible DOM overlays while authored gameplay remains renderer-independent.",
      },
      headlessState: "Exported games expose getGameplayState, getChoiceState, getHudState, chooseChoice, and matching runtime commands alongside variables, clock values, completedRuleIds, active action IDs, overlap contacts, and replay-hashed modal state.",
    },
    narrativeRules: {
      policy: LOOPLAB_NARRATIVE_CONTRACT_POLICY,
      schemas: { contract: LOOPLAB_NARRATIVE_CONTRACT_SCHEMA, report: LOOPLAB_NARRATIVE_REPORT_SCHEMA },
      commands: ["get_narrative_contract", "get_narrative_report", "set_narrative_contract", "remove_narrative_contract"],
      runtimeMethods: ["getNarrativeContract", "getNarrativeReport"],
      runtimeCommands: ["get_narrative_contract", "get_narrative_report"],
      proofBoundary: LOOPLAB_NARRATIVE_CONTRACT_POLICY.proofBoundary,
    },
    visualIdentityRules: {
      policy: LOOPLAB_VISUAL_IDENTITY_POLICY,
      schemas: { identity: LOOPLAB_VISUAL_IDENTITY_SCHEMA, report: LOOPLAB_VISUAL_IDENTITY_REPORT_SCHEMA },
      limits: LOOPLAB_VISUAL_IDENTITY_LIMITS,
      commands: ["get_visual_identity", "get_visual_identity_report", "set_visual_identity", "remove_visual_identity"],
      defaultInheritance: true,
      imageReferenceConsent: "Every individual provider-art job with delivery=image requires referenceConsent=true. Selecting or storing a reference never grants upload consent.",
      providerMutationPolicy: "Providers may inherit or explicitly bypass the contract for one run, but never adopt, remove, or rewrite it implicitly.",
      runtimePolicy: "Visual identity is authoring-only guidance and receipt evidence; the contract is omitted from one-file runtime payloads.",
      proofBoundary: LOOPLAB_VISUAL_IDENTITY_POLICY.judgmentBoundary,
    },
    presentationRules: {
      policy: LOOPLAB_PRESENTATION_POLICY,
      schemas: { program: LOOPLAB_PRESENTATION_PROGRAM_SCHEMA, report: LOOPLAB_PRESENTATION_REPORT_SCHEMA },
      limits: LOOPLAB_PRESENTATION_LIMITS,
      commands: ["get_presentation_program", "get_presentation_report", "suggest_presentation_program", "set_presentation_program", "remove_presentation_program"],
      runtimeMethods: ["getPresentationProgram", "getPresentationReport", "getPresentationStatus", "setAudioMuted"],
      runtimeCommands: ["get_presentation_program", "get_presentation_report", "get_presentation_status", "set_audio_muted"],
      lifecycle: "Input is accepted before audio unlock is attempted. Blur, visibility loss, pause, mute, reset, and teardown cancel active feedback without affecting gameplay.",
      cameraAuthoring: {
        source: "presentationProgram.camera",
        overlapPolicy: "Enabled zones match authored map-space subject coordinates. Higher priority wins, then smaller area, then stable ID; the decision is deterministic in preview and export.",
        reducedMotion: "Every approved camera zone carries an explicit reducedMotionBehavior. Camera state consumes immutable snapshots and never mutates simulation or replay truth.",
        runtimeStatus: "get_presentation_status returns the active zone, projected center, zoom, initialization state, and transition count.",
      },
      animationAuthoring: {
        source: "presentationProgram.animation.machines",
        targetPolicy: "Machines bind by stable object ID or kind and select state transitions by priority then stable ID.",
        interruptionModes: ["immediate", "frame-end", "cycle-end", "locked"],
        triggers: ["event", "action-active", "action-inactive", "moving", "stopped", "grounded", "airborne", "runtime-state", "complete"],
        assetPolicy: "Every state references an embedded sprite and in-range frames. Approved multi-frame states declare one reduced-motion frame; locked looping states are invalid.",
        runtimeStatus: "get_presentation_status returns active machine/object/state/frame records, pending transitions, accepted transitions, and rejected interruptions.",
      },
      effectPluginAuthoring: {
        source: "presentationProgram.effectPlugins",
        primitives: ["particles", "shake", "flash", "squash"],
        reference: "Motion cues use {type:'plugin', pluginId}. Plugins cannot contain scripts, nested plugins, network loaders, or arbitrary fields.",
        reducedMotion: "Every plugin explicitly replaces or omits its full-motion recipe.",
        assetPolicy: "Sprite-backed effects declare exact embedded asset requirements and minimum frame counts; Project Doctor blocks missing, undeclared, or undersized assets.",
      },
      embeddedAudio: {
        cueKind: "sample",
        resourceField: "resourceId",
        resourceCollection: "project.resources",
        resourceReportSchema: LOOPLAB_AUDIO_RESOURCE_REPORT_SCHEMA,
        limits: LOOPLAB_AUDIO_RESOURCE_LIMITS,
        measurement: "Referenced OGG Vorbis and PCM/float WAV resources are measured as decoded 32-bit PCM; unsupported or unresolved audio is Doctor-blocked.",
        runtime: "Referenced samples decode lazily only after Web Audio unlock, share the authored voice cap and envelopes, and isolate per-resource decode failures from gameplay.",
      },
      proofBoundary: LOOPLAB_PRESENTATION_POLICY.judgmentBoundary,
    },
    gameShellRules: {
      policy: LOOPLAB_GAME_SHELL_POLICY,
      schemas: { shell: LOOPLAB_GAME_SHELL_SCHEMA, report: LOOPLAB_GAME_SHELL_REPORT_SCHEMA, state: LOOPLAB_GAME_SHELL_STATE_SCHEMA },
      limits: LOOPLAB_GAME_SHELL_LIMITS,
      commands: ["get_game_shell", "get_game_shell_report", "suggest_game_shell", "set_game_shell", "remove_game_shell"],
      runtimeMethods: ["getGameShell", "getGameShellReport", "getGameShellState", "startGame", "pause", "resume", "restart", "openGameSettings", "closeGameSettings", "setAudioMuted", "setMasterVolume", "setReducedMotion", "setTouchControlSize"],
      runtimeCommands: ["get_game_shell", "get_game_shell_report", "get_game_shell_state", "start_game", "pause", "resume", "restart", "open_game_settings", "close_game_settings", "set_audio_muted", "set_master_volume", "set_reduced_motion", "set_touch_control_size"],
      lifecycle: "The shell owns title/play/pause/win/loss/settings browser surfaces and gates simulation advancement without entering deterministic simulation, saves, acceptance observations, or replay hashes.",
      terminalTruth: "Win and loss UI may observe only authored deterministic runtime truth. A shell cannot invent a timer, score threshold, defeat, or completion condition.",
      proofBoundary: LOOPLAB_GAME_SHELL_POLICY.judgmentBoundary,
    },
    gameDirector: {
      command: "set_game_brief",
      draftCommand: "get_prompt_draft",
      retryCommand: "retry_prompt",
      promptEndpoint: "http://127.0.0.1:4317/prompt-drafts",
      generationEndpoint: "http://127.0.0.1:4317/jobs",
      browserCommands: ["get_director_state", "configure_director", "get_prompt_draft", "retry_prompt", "start_ai_build", "start_research"],
      gameShell: "New foundations receive an approved renderer-neutral standard shell. AI may refine its labels and deterministic terminal bindings through canonical game-shell commands, while humans retain the same Fine Tune surface.",
      headlessSuperset: true,
      headlessPolicy: "The UI is a convenience surface, not a capability ceiling. Headless callers may supply arbitrary provider inputs, complete project JSON, goals, conditions, and low-level authored commands directly.",
      behavior: "Selections clarify and strengthen the user's free-text vision; they never replace it.",
      artDirectionPolicy: {
        defaultMode: "explore",
        modes: ["explore", "preserve", "locked"],
        styleLocksAreOptional: true,
        boundary: "Objective quality targets never become palette, setting, rendering-style, material, camera, or character-design locks unless the user selects locked mode and supplies them explicitly.",
      },
      loopEvaluation: {
        profileSchema: "looplab-loop-evaluation-profile/v1",
        evaluationSchema: "looplab-loop-evaluation/v2",
        comparisonSchema: "looplab-loop-comparison/v2",
        profiles: ["auto", "general", "platformer", "top-down", "connected-world", "systems"],
        selectionPolicy: "Explicit profile wins. Auto selects once from the starting authored project and remains frozen for every candidate in that run, so a candidate cannot change the metric used to judge itself.",
        acceptancePolicy: "A candidate must remain schema-valid, pass every independent hard gate, avoid regression in every applicable named dimension, and meet the requested aggregate minimum delta.",
        dimensions: ["integrity", "playability", "executable-evidence", "world-authoring", "campaign-continuity", "systems-and-choice", "presentation-readiness-proxy"],
        judgmentBoundary: "The measurable presentation proxy and aggregate score do not claim fun, originality, composition, visual taste, or emotional effect; visual and human review remain required.",
        ledgerPolicy: "Accepted and rejected attempts retain the frozen profile, dimension vector, hard-gate results, comparison receipt, and source-bound Doctor identity.",
        candidateDecisionSchema: LOOPLAB_CANDIDATE_DECISION_SCHEMA,
        candidateSelectionPolicy: "Hard gates constrain eligibility. Matching frozen-profile dimensions establish only Pareto dominance, tradeoff, or equivalence. Changed candidates never receive an automatic creative winner; Codex, Claude, or the user must preview and play both before explicitly continuing from one source-bound snapshot.",
      },
      fields: {
        genre: LOOPLAB_GAME_DIRECTOR.genres,
        coreLoop: LOOPLAB_GAME_DIRECTOR.coreLoops,
        movementTemplate: LOOPLAB_GAME_DIRECTOR.movementTemplates,
        format: LOOPLAB_GAME_DIRECTOR.formats,
        progression: LOOPLAB_GAME_DIRECTOR.progressions,
        campaignScope: LOOPLAB_GAME_DIRECTOR.campaignScopes,
        userPrompt: { type: "string", required: false },
        artDirectionMode: ["explore", "preserve", "locked"],
        styleLocks: { type: "array", itemType: "string", required: false },
      },
      promptLenses: LOOPLAB_PROMPT_LENSES,
      promptLensPolicy: "Lenses are deterministic provider-input helpers and are never labeled as AI output.",
      retryPolicy: "Retry must invoke the selected authenticated provider, preserve the user's exact words and all supplied constraints, return materially different prompt text, and record provider provenance. It never falls back to local lens rotation.",
      campaignScopePolicy: "World scope is structured authoring truth, not a prose suggestion. Project Doctor checks the authored map count against it, while spatial validation checks ordered reachability and exact portal-to-spawn continuity.",
      promptDraftBudget: {
        maximumCharacters: LOOPLAB_PROVIDER_PROMPT_MAX_CHARACTERS,
        targetCharacters: { minimum: 8000, maximum: 14000 },
        claudeMaximumTurns: 2,
        policy: "Preserve user truth and executable requirements, but compress repeated explanation. Measured provider usage remains the acceptance evidence for efficiency.",
      },
      gameplayProgram: {
        policy: LOOPLAB_GAMEPLAY_RULE_POLICY,
        inspectCommand: "get_gameplay_program",
        authorCommand: "set_gameplay_program",
        removeCommand: "remove_gameplay_program",
        proofBoundary: "A feature-contract description is not implementation. Complex mechanics must resolve to executable deterministic gameplay rules or other runtime-owned IDs.",
      },
      narrativeContract: {
        policy: LOOPLAB_NARRATIVE_CONTRACT_POLICY,
        contractSchemaVersion: LOOPLAB_NARRATIVE_CONTRACT_SCHEMA,
        reportSchemaVersion: LOOPLAB_NARRATIVE_REPORT_SCHEMA,
        inspectCommand: "get_narrative_contract",
        reportCommand: "get_narrative_report",
        authorCommand: "set_narrative_contract",
        removeCommand: "remove_narrative_contract",
        proofBoundary: LOOPLAB_NARRATIVE_CONTRACT_POLICY.proofBoundary,
      },
      presentationProgram: {
        policy: LOOPLAB_PRESENTATION_POLICY,
        programSchemaVersion: LOOPLAB_PRESENTATION_PROGRAM_SCHEMA,
        reportSchemaVersion: LOOPLAB_PRESENTATION_REPORT_SCHEMA,
        inspectCommand: "get_presentation_program",
        reportCommand: "get_presentation_report",
        suggestCommand: "suggest_presentation_program",
        authorCommand: "set_presentation_program",
        removeCommand: "remove_presentation_program",
        authoringSurfaces: ["structured camera-zone editor", "animation state and interruption editor", "declarative effect-plugin editor", "advanced exact JSON", "headless canonical command"],
        parity: "Mouse and headless agents write the same whole presentationProgram. Preview and one-file export use the same self-contained controller, camera transforms, animation selection, and effect recipes.",
      },
      verbArchitecture: {
        policy: LOOPLAB_VERB_ARCHITECTURE_POLICY,
        inspectCommand: "get_verb_architecture",
        authorCommand: "set_verb_architecture",
        removeCommand: "remove_verb_architecture",
        proofBoundary: "A named verb, relationship, application, loop step, resource flow, or progression beat is not implemented until its runtime implementation IDs and executable acceptance or replay test IDs resolve in the current project. A count, score matrix, or finale checklist is not proof.",
      },
      templateAdaptationPolicy: "A neutral starter may contribute geometry and technical contracts, but its sample player, markers, paths, goals, genre, setting, palette, and names must be replaced or deliberately repurposed before templateProvenance.adaptationStatus becomes adapted.",
      example: { op: "set_game_brief", userPrompt: "A rooftop courier game with expressive movement", genre: "skating-tricks", coreLoop: "traverse-chain-score", movementTemplate: "kinetic-runner", format: "connected-rooms", progression: "score-attack", campaignScope: "three-connected-regions" },
    },
    usageReceipts: {
      schemaVersion: "looplab-ai-usage/v1",
      promptDraftField: "draft.usage",
      iterationEvent: "usage.completed",
      loopTotalEvent: "loop.completed",
      loopTotalField: "usage",
      generationResultField: "usage",
      researchEvent: "research.usage.completed",
      researchReportField: "usage",
      loopAccountingPolicy: "The final loop total sums every provider attempt in that invocation, including accepted and rejected candidates.",
      tokenFields: ["inputTokens", "promptTokens", "cachedInputTokens", "cacheWriteTokens", "outputTokens", "reasoningTokens", "totalTokens"],
      cliBillingPolicy: "Detected Codex and Claude subscription sessions use API-rate-equivalent dollar labels; detected API-key, access-token, Bedrock, or Vertex sessions use API billing labels.",
      unknownPricingPolicy: "Keep estimatedUsd null rather than inventing a model price.",
      modelSelectionField: "usage.modelSelection",
      modelSelectionPolicy: "CLI receipts retain the requested model and effort launch settings, provider-reported resolved model when available, selection reason, and whether a silent model fallback was allowed.",
    },
    providerModels: LOOPLAB_PROVIDER_MODEL_POLICY,
    providerParity: getProviderParityContract(),
    providerRouting: LOOPLAB_PROVIDER_FAILOVER_POLICY,
    claudeIntegration: getClaudeIntegrationManifest(),
    localCopilot: {
      statusSchemaVersion: LOOPLAB_LOCAL_COPILOT_STATUS_SCHEMA,
      adviceSchemaVersion: LOOPLAB_LOCAL_COPILOT_ADVICE_SCHEMA,
      usageSchemaVersion: LOOPLAB_LOCAL_COPILOT_USAGE_SCHEMA,
      commands: ["get_local_copilot_status", "start_local_copilot", "get_local_copilot_job", "cancel_local_copilot_job"],
      modes: LOOPLAB_LOCAL_COPILOT_MODES,
      limits: LOOPLAB_LOCAL_COPILOT_LIMITS,
      policy: LOOPLAB_LOCAL_COPILOT_POLICY,
      role: "Optional local AI for bounded context compression, critique, risk identification, and suggested next intents adjacent to Codex or Claude.",
      authorityBoundary: "Local advice is not source truth, a reviewed command, a project mutation, collision authority, or Doctor/replay/acceptance/browser/release evidence.",
      detection: "Passive loopback /v1/models checks only; scanning never downloads, loads, or invokes a model.",
      supportedServers: ["Ollama default loopback", "LM Studio default loopback", "explicit loopback OpenAI-compatible server such as Foundry Local"],
      configuration: {
        url: "LOOPLAB_LOCAL_AI_URL (optional literal loopback OpenAI-compatible origin)",
        engine: "LOOPLAB_LOCAL_AI_ENGINE (optional stable label)",
        label: "LOOPLAB_LOCAL_AI_LABEL (optional human-readable label)",
        model: "LOOPLAB_LOCAL_AI_MODEL (optional exact discovered model ID)",
        token: "LOOPLAB_LOCAL_AI_TOKEN (optional loopback access token; never returned)",
      },
    },
    visualCritique: {
      requestSchemaVersion: LOOPLAB_VISUAL_CRITIQUE_REQUEST_VERSION,
      resultSchemaVersion: LOOPLAB_VISUAL_CRITIQUE_VERSION,
      commands: ["start_visual_critique", "get_visual_critique_job", "cancel_visual_critique_job", "get_visual_critique"],
      dimensions: LOOPLAB_VISUAL_CRITIQUE_DIMENSIONS,
      limits: LOOPLAB_VISUAL_CRITIQUE_LIMITS,
      companionEndpoint: "http://127.0.0.1:4317/visual-critique-jobs",
      consent: "consent:true is required for every image submission; prior capture or provider consent is never reused",
      grounding: "Every observation, dimension, strength, and issue must reference exact submitted capture IDs. Observations precede evaluation.",
      storage: "The companion re-hashes decoded PNG/JPEG/WebP bytes, uses isolated temporary files, deletes them at terminal job completion, and returns no image bytes in status, events, results, projects, exports, or documentation.",
      authorityBoundary: "Visual critique is advisory only. It cannot mutate a project, own collision, satisfy Doctor/replay/acceptance/browser/release evidence, select an automatic winner, or prove aesthetic quality.",
    },
    longRunningProviderJobs: {
      startEndpoint: "POST http://127.0.0.1:4317/jobs",
      statusEndpoint: "GET http://127.0.0.1:4317/jobs/{id}/status",
      resultEndpoint: "GET http://127.0.0.1:4317/jobs/{id}/result",
      eventsEndpoint: "GET http://127.0.0.1:4317/jobs/{id}/events",
      cancelEndpoint: "POST http://127.0.0.1:4317/jobs/{id}/cancel",
      mutationAuthentication: {
        header: "x-looplab-session-token",
        sessionFile: ".looplab/companion-session.json",
        policy: "Every POST requires the current launcher-owned session token. The browser receives it from the managed server process; local headless clients read the ignored session descriptor without logging or sending it to a provider.",
      },
      requiredFor: ["complex provider builds", "iterative loops", "large structured patches", "runs that may exceed a caller or shell timeout"],
      launchPolicy: "Submit exactly once to the long-lived companion, retain the returned job ID, and poll status or result. Do not keep the provider child owned by a short-lived shell wrapper.",
      inFlightPolicy: "Never restart, retry, or submit a duplicate while the job status is starting or running. Monitor the existing job and let it finish unless the user explicitly cancels it.",
      timeoutPolicy: "Complex generation jobs have no application-side provider timeout by default. Caller timeouts must not own or terminate the companion job.",
      freshnessPolicy: "Before submission, require GET /health protocolVersion to equal this manifest's protocolVersion. Restart or replace a stale companion before it validates or launches a project.",
      segmentationPolicy: "When one response would require a monolithic campaign rewrite, split the same objective into ordered bounded passes with explicit stable handoff IDs and gates; do not resend the full project goal on every pass.",
      passPlanSchema: "looplab-provider-pass-plan/v1",
      passPlanEvents: ["provider.pass-plan.prepared", "provider.pass.started", "provider.context.prepared", "provider.context.blocked"],
      contextBudget: {
        requestField: "contextBudgetTokens",
        defaultRoughTokens: 96000,
        minimumRoughTokens: 8000,
        maximumRoughTokens: 200000,
        estimatePolicy: "Character count divided by four is planning evidence only. Completed provider usage remains authoritative.",
        preflightPolicy: "If the active compact pass still exceeds the configured budget, stop before provider.requested and report the largest sections. Never silently truncate authored maps, collision, replay, or acceptance evidence.",
      },
      providerContextCompaction: {
        activeMapMirrorPolicy: "When maps are present, omit root-level active-map mirrors because maps[] is the authoring source supplied to the provider.",
        scopedMapPolicy: "Budget-driven map passes receive complete selected maps plus a content-light index of every map. Runtime-join passes receive portals, spawns, and nearby clearance geometry with an explicit partial-projection warning.",
      },
      openAiPromptCaching: {
        stablePrefixFirst: true,
        cacheKeyPolicy: "Derive prompt_cache_key only from the non-private stable developer instruction and purpose; never from project or user content.",
        explicitBreakpointPolicy: "Use an explicit developer-prefix breakpoint and explicit cache mode only on GPT-5.6-family or later models; older models retain the stable prefix and cache key without unsupported breakpoint fields.",
        evidencePolicy: "Report cached and cache-write tokens only from measured provider usage; never predict dollar savings.",
      },
      activityEvent: "provider.activity",
      activityPolicy: "Codex JSONL and Claude stream-JSON activity are reduced to content-free allowlisted eventType/itemType metadata. Prompts, responses, tool arguments, commands, and reasoning content are never copied into job events.",
      heartbeatPolicy: "provider.progress reports process-only liveness until a real provider JSONL event is observed, then reports the last safe event type and its measured age. Neither state is treated as proof of quality or as permission to time out the run.",
      usagePolicy: "Report the measured receipt from the completed job. If an external failure prevents a receipt, report usage as unknown instead of inventing a total.",
    },
    projectLibrary: {
      stateSelector: "#looplab-project-library-state",
      schemaVersion: LOOPLAB_SHARED_PROJECT_STORE_SCHEMA,
      browserCommands: ["list_projects", "select_project", "list_shared_projects", "mount_shared_project", "preview_shared_project_rebase", "apply_shared_project_rebase", "save_shared_project", "create_variation"],
      companionEndpoints: { list: "/projects", project: "/projects/:id" },
      persistence: LOOPLAB_SHARED_PROJECT_STORE_POLICY,
      cachePolicy: "IndexedDB snapshots and the localStorage active-project mirror are recoverable browser caches. Mounted companion bytes and their exact revisionDigest are authoritative for complete-document concurrency.",
      selectionPolicy: "AI generation and improvement loops always use the explicitly selected project.",
      variationPolicy: "create_variation checkpoints the base, clones the complete editable project into a renamed child candidate, and never mutates the base library entry.",
      staleWritePolicy: "Updates require If-Match with the exact latest revisionDigest. Creates require If-None-Match: *. HTTP 412 preserves remote truth and the unsaved local draft for exact preview/apply rebase, gates, and explicit save.",
      sourceTruthBoundary: LOOPLAB_SHARED_PROJECT_STORE_POLICY.sourceTruth,
    },
    communityExchange: {
      schemaVersion: LOOPLAB_COMMUNITY_EXCHANGE_SCHEMA,
      reportSchemaVersion: LOOPLAB_COMMUNITY_EXCHANGE_REPORT_SCHEMA,
      commands: ["list_community_exchanges", "get_community_exchange_report", "preview_tiled_import", "apply_tiled_import", "preview_aseprite_import", "apply_aseprite_import", "export_community_exchange"],
      formats: ["Tiled JSON", "TMX with explicitly supplied TSX", "Aseprite JSON array", "Aseprite JSON hash"],
      workflow: "Preview exact source and dependencies, inspect canonical projection plus both Doctor profiles, then apply with matching expectedSourceDigest and expectedPreviewDigest. Export reports exact unchanged bytes separately from an explicitly requested stale original.",
      policy: LOOPLAB_COMMUNITY_EXCHANGE_POLICY,
      headlessSuperset: true,
      collisionOwner: "authored-map",
      runtimePayload: "omitted-authoring-envelope",
    },
    projectSchema: {
      currentVersion: LOOPLAB_PROJECT_SCHEMA_VERSION,
      schemaUrl: "/project-schema.json",
      field: "schemaVersion",
      migrations: "Older projects are normalized on load; unknown or newer schema versions are rejected until an explicit migration exists.",
      stableIds: true,
      rendererObjectsAllowed: false,
    },
    reuseGuide: {
      ...LOOPLAB_REUSE_GUIDE_CONTRACT,
      movementTemplates: LOOPLAB_MOVEMENT_TEMPLATES,
      optionalEffectPlugins: LOOPLAB_OPTIONAL_EFFECT_PLUGINS,
    },
    research: {
      companionEndpoint: "http://127.0.0.1:4317/research-jobs",
      engines: ["source-command-sc-research", "game-studio", "web-game-foundations", "openai-docs", "provider-native"],
      depths: ["quick", "standard", "deep", "exhaustive"],
      presets: ["full-brief", "similar-games", "genre-expectations", "core-loop", "controls", "map-flow", "art-direction", "accessibility", "browser-performance", "engine-selection", "canvas-patterns"],
      output: ["executive-summary", "confidence", "cited-findings", "suggestions", "uncertainties", "markdown", "usage-receipt"],
      mutationPolicy: "report-only; a human or agent must explicitly apply a suggestion in a later operation",
    },
    gameStudioProductionPlan: {
      schemaVersion: LOOPLAB_GAME_STUDIO_PLAN_SCHEMA,
      routingCommand: "route_work",
      directorField: "framework",
      companionField: "framework",
      providerContextField: "capabilityRoute.productionPlan",
      runtimeSelectionField: "capabilityRoute.runtimeSelection",
      policy: LOOPLAB_RUNTIME_SELECTION_POLICY,
      runtimeKnowledge: LOOPLAB_RUNTIME_KNOWLEDGE,
      narrativeRouting: LOOPLAB_NARRATIVE_ROUTING_POLICY,
      adapterStatus: { canvas: "release-ready", phaser: "release-ready-pinned-3.90.0", pixi: "release-ready-pinned-8.19.0-strict-csp", melon: "release-ready-pinned-17.4.0" },
      parity: ["mouse UI", "window.looplabAgent", "DOM bridge", "CLI", "MCP core", "MCP browser", "OpenAI API", "Anthropic API", "Codex CLI", "Claude CLI"],
      rule: "The production plan is a native LoopLab capability. It coordinates architecture, runtime choice, DOM UI, sprite/assets, and Playwright QA without replacing existing authoring or requiring an external Codex skill at execution time.",
    },
    installedSkills: {
      excluded: ["hbg-loop"],
      routeOrder: "web-game-foundations first; verification-gates and game-playtest last",
      integrationPolicy: "These are versioned LoopLab-native capabilities used directly by the program. They supplement the existing simulation, authoring, asset, Doctor, and export systems and never require asking Codex to load an external skill at run time.",
      capabilities: GAME_STUDIO_CAPABILITIES.map(({ id, label, owns }) => ({ id, label, owns })),
      oneFileRuntimePolicy: {
        canvas: { status: "release-ready", delivery: "built-in-inline" },
        phaser: { status: "release-ready", delivery: "inline-script-tag", pinnedVersion: LOOPLAB_PHASER_BROWSER_VERSION, sha256: LOOPLAB_PHASER_BROWSER_SHA256 },
        pixi: { status: "release-ready", delivery: "inline-umd-with-official-csp-polyfill", pinnedVersion: LOOPLAB_PIXI_BROWSER_VERSION, sha256: LOOPLAB_PIXI_BROWSER_SHA256, csp: "strict-no-unsafe-eval" },
        melon: { status: "release-ready", delivery: "tree-shaken-inline-iife", pinnedVersion: LOOPLAB_MELON_BROWSER_VERSION, sha256: LOOPLAB_MELON_BROWSER_SHA256, integration: "standalone-application-explicit-camera" },
        forbidden: ["external-module-import", "cdn-runtime", "network-asset-load"],
      },
      referenceCatalogs: [{ id: "awesome-canvas", url: "https://github.com/raphamorim/awesome-canvas", policy: "discovery-only; verify each linked project's license and current implementation before reuse" }],
    },
    specialistAgents: {
      roster: LOOPLAB_SPECIALIST_AGENTS.map((agent) => ({ ...agent, executor: agent.id === "project-doctor-critic" ? "project-doctor" : agent.id === "playtest-qa" ? "playwright" : "selected-provider" })),
      routingCommand: "route_work",
      executionMode: "single-provider-staged-review",
      providerInvocationsPerIteration: 1,
      independentAgentProcesses: false,
      narrativeRouting: LOOPLAB_NARRATIVE_ROUTING_POLICY,
      events: ["specialist.roster.planned", "provider.requested", "provider.responded", "specialist.covered", "specialist.coverage.missing", "iteration.accepted", "iteration.rejected"],
      truthPolicy: "Agent names are ordered specialist roles inside the selected provider request. Completion requires returned review receipts; Project Doctor and Playwright run as independent gates and are never simulated.",
      fullCreationWorkstream: "creation",
      productionPlanSchema: LOOPLAB_GAME_STUDIO_PLAN_SCHEMA,
      runtimeSelectionPolicy: LOOPLAB_RUNTIME_SELECTION_POLICY,
      providerParity: "OpenAI, Anthropic, Codex CLI, and Claude CLI receive the same compact production plan and runtime-selection receipt in the durable provider context.",
    },
    verification: {
      collectCommand: "collect_verification_evidence",
      automatedBrowserCommand: "run_post_generation_qa",
      visualReviewCommand: "capture_visual_review",
      visualReviewStateCommand: "get_visual_review",
      visualReviewSelectCommand: "select_visual_review_capture",
      visualCritiqueCommands: ["start_visual_critique", "get_visual_critique_job", "cancel_visual_critique_job", "get_visual_critique"],
      visualPerception: {
        schemaVersion: "looplab-visual-perception/v1",
        sources: ["known-runtime-object-geometry", "measured-hud-geometry", "object-bound-project-doctor-findings", "same-session-pixel-diff", "exact-capture-color-measurement"],
        claimBoundary: "Semantic boxes identify exact known geometry. Pixel comparison only identifies changed regions and never claims an aesthetic, depth, or collision defect by itself.",
        payloadFlags: ["includeThumbnails", "includeAnnotatedImages", "includeCrops"],
        visualOnlyPolicy: "capture_visual_review remains available for diagnosis when Project Doctor blocks promotion evidence; collect_verification_evidence remains strict.",
        accessibility: "Every overlay uses a number, label, severity word, and line style in addition to color.",
        colorAccessibility: {
          schemaVersion: LOOPLAB_COLOR_ACCESSIBILITY_SCHEMA_VERSION,
          sources: ["computed-hud-styles-over-exact-capture-pixels", "bounded-observed-authored-gameplay-colors", "authored-redundant-cue-semantics"],
          standards: ["WCAG-2.2-1.4.1", "WCAG-2.2-1.4.3", "WCAG-2.2-1.4.11", "Machado-Oliveira-Fernandes-2009"],
          outputs: ["contrast-distribution", "protan-deutan-tritan-simulation", "CIELAB-deltaE76", "observed-color-proof", "redundant-cue-review"],
          claimBoundary: "Advisory measurements never claim taste, legal or WCAG conformance, diagnosis, or equivalence to testing with people who have color-vision deficiencies.",
          headlessSurface: "capture_visual_review and get_visual_review expose the same receipt shown by the mouse-driven Visual QA panel.",
        },
      },
      verifyCommand: "verify_iteration",
      verifyEverythingCli: { operation: "verify-everything", command: "npm run agent -- verify-everything <project.loop.json> [game.html] [--captures=directory] [--receipt=receipt.json] [--promote]", receiptSchemaVersion: "looplab-verify-everything-receipt/v1", evidenceSchemaVersion: "looplab-exact-artifact-evidence/v1", providerTokens: 0 },
      promoteCommand: "promote_iteration",
      requiredEvidence: ["source-bound-deterministic-playtest", "clean-play-map-by-device-screenshot-matrix", "responsive-profile-checks", "actual-runtime-join-receipts-for-enabled-portals"],
      conditionalReplayEvidence: "When authored replay fixtures exist, automatic QA adds a source-bound replay receipt containing every passing case revision, tick count, and final simulation hash.",
      visualCoverage: "Every authored map must be captured in clean play mode for every configured device profile. Responsive receipts must prove HUD containment, exact viewport and DPR, and profile-correct touch controls.",
      visualContentPolicy: "Trusted collectors measure quantized color diversity, luminance variance, and opacity from canvas pixels. A blank or flat frame is rejected even when its PNG hash is valid.",
      profileSimulations: ["in-app-device-profile", "headless-browser-profile"],
      viewportTruthPolicy: "Receipts record configured targetViewport separately from the actual browser viewport; Looplab never describes an in-app profile simulation as a resized browser.",
      imageStoragePolicy: "Clean captures, annotated captures, and focused crops are ephemeral UI/headless results and opt-in headless payloads. Projects and one-file exports retain hashes and measurements, never screenshot data URLs.",
      automaticAfterAcceptedBrowserGeneration: true,
      automaticFailurePolicy: "Preserve the accepted candidate as unverified, expose the concrete evidence failure in the live console and Project Doctor, and never fabricate a passing receipt.",
      promotionPolicy: "Verification may run automatically; promotion remains an explicit release decision.",
      runtimeChecks: ["start-map", "map-load", "player-input", "depth-order", "portal-target-spawn", "fresh-interaction-press", "deterministic-replay-suite", "actual-runtime-map-join"],
      stalePolicy: "Every evidence object must match the current Project Doctor sourceDigest; empty arrays and legacy string references are rejected.",
      cliLoopPolicy: "CLI loops may accept a Doctor-clean, runtime-tested candidate, but it remains a candidate until browser evidence is collected and verify_iteration succeeds.",
    },
    releaseVerification: {
      schemaVersion: LOOPLAB_RELEASE_VERIFICATION_SCHEMA,
      policy: getReleaseVerificationPolicy(),
      inspectCommand: "get_release_verification",
      browserCommand: "verify_release",
      browserStatusCommand: "get_release_verification_job",
      browserCancelCommand: "cancel_release_verification_job",
      cliOperation: "verify-release",
      completeCliOperation: "verify-everything",
      completeReceiptSchemaVersion: "looplab-verify-everything-receipt/v1",
      companionEndpoint: "/release-verification-jobs",
      authority: "A current structured attestation, not release.offlineVerified, binds the exact Project Doctor source and exact HTML SHA-256 to the hostile Playwright browser receipt and static audit.",
      byteStability: "Lifecycle, work-ledger, provider-request, build, authoring, and release-evidence metadata stay in editable source and outside shipped HTML so verification cannot change its own subject.",
      trustBoundary: "This is a digest-bound local integrity receipt rooted in the trusted LoopLab runner; it is not a public signature or protection against a malicious person forging project JSON.",
    },
    runtimeJoinValidation: {
      schemaVersion: "looplab-runtime-join/v1",
      planCommand: "get_runtime_join_plan",
      browserEvidenceCommand: "collect_verification_evidence",
      headlessEvidenceOperation: "verify-everything",
      exactArtifactEvidenceSchemaVersion: "looplab-exact-artifact-evidence/v1",
      modes: ["portal", "continuous"],
      evidenceType: "runtime-join",
      coverage: "Every runtimeJoin-enabled portal is captured for every configured device profile.",
      transitionPolicy: "Drive the actual runtime portal interaction, require its exact destination spawn and a clear landing, then capture both rendered environments.",
      pixelPolicy: "Exclude the player from both captures and measure genuinely new destination pixels after any declared overlap; copied-overlap equality is never sufficient.",
      continuityPolicy: "Continuous joins additionally compare the outgoing source edge with the incoming target edge against the authored boundary-color threshold.",
      sourceBinding: "Every receipt carries the current Project Doctor sourceDigest plus source and target pixel SHA-256 values.",
    },
    semanticFrameDescription: {
      schemaVersion: LOOPLAB_FRAME_DESCRIPTION_SCHEMA,
      command: "describe_frame",
      limits: LOOPLAB_FRAME_DESCRIPTION_LIMITS,
      source: "Canonical deterministic runtime renderEntries plus the exact exported object-placement, depth-slice, dimetric-platform, and worldToScreen formulas.",
      outputs: ["draw order", "screen bounds", "screen polygons", "visibility", "bounded pair overlaps", "HUD safe-area intrusions", "optional authored collision projection"],
      pixelBoundary: "Core results never invent pixel statistics. Browser pixels, responsive DOM containment, and viewport/DPR proof require capture_visual_review or the browser harness.",
      presentationBoundary: "The base-frame scene graph excludes event-driven shake, squash, particles, audio, and transition overlays and states that omission explicitly.",
      evidenceBoundary: "Semantic frame descriptions are read-only review context, never acceptance, replay, browser, visual, or release evidence.",
    },
    simulationProbe: {
      schemaVersion: LOOPLAB_SIMULATION_PROBE_SCHEMA,
      command: "simulate",
      limits: LOOPLAB_SIMULATION_LIMITS,
      emit: ["state", "events", "positions"],
      compactDefault: "Only final state is returned unless events or sampled positions are explicitly requested.",
      sourceBinding: "Every result carries the exact Project Doctor sourceDigest used by the cloned deterministic runtime.",
      mutationBoundary: "The probe clones authored source and never changes the selected project, iteration, replay fixtures, evidence, or work ledger.",
      outputBoundary: "Events and position samples are strictly bounded; the receipt reports every truncation and the effective sampling stride.",
      fixtureWorkflow: "Pass includeFixtureCandidate=true to receive an ordinary versioned replay candidate, then explicitly record and rerun it. A probe is never replay, acceptance, browser, visual, or release evidence by itself.",
    },
    deterministicReplay: {
      schemaVersion: "looplab-replay-result/v1",
      commands: ["preview_playtest_replay", "promote_playtest_replay", "record_replay_case", "run_replay_suite", "remove_replay_case"],
      currentHashVersion: LOOPLAB_REPLAY_HASH_VERSION,
      legacyHashVersion: LOOPLAB_REPLAY_LEGACY_HASH_VERSION,
      supportedHashVersions: [LOOPLAB_REPLAY_LEGACY_HASH_VERSION, LOOPLAB_REPLAY_PREVIOUS_HASH_VERSION, LOOPLAB_REPLAY_GAMEPLAY_HASH_VERSION, LOOPLAB_REPLAY_CHOICE_HASH_VERSION, LOOPLAB_REPLAY_MOTION_HASH_VERSION, LOOPLAB_REPLAY_SHA256_HASH_VERSION, LOOPLAB_REPLAY_COMBAT_HASH_VERSION, LOOPLAB_REPLAY_ACTOR_HASH_VERSION, LOOPLAB_REPLAY_COLLISION_HASH_VERSION, LOOPLAB_REPLAY_MOTION_CARRY_HASH_VERSION, LOOPLAB_REPLAY_ELEVATION_HASH_VERSION, LOOPLAB_REPLAY_WORLD_STREAM_HASH_VERSION],
      minimumTickRate: LOOPLAB_MIN_TICK_RATE,
      digestAlgorithms: { legacyVersions: [1, 2, 3, 4, 5], legacy: "FNV-1a-32", sha256Versions: [LOOPLAB_REPLAY_SHA256_HASH_VERSION, LOOPLAB_REPLAY_COMBAT_HASH_VERSION, LOOPLAB_REPLAY_ACTOR_HASH_VERSION, LOOPLAB_REPLAY_COLLISION_HASH_VERSION, LOOPLAB_REPLAY_MOTION_CARRY_HASH_VERSION, LOOPLAB_REPLAY_ELEVATION_HASH_VERSION, LOOPLAB_REPLAY_WORLD_STREAM_HASH_VERSION], currentVersion: LOOPLAB_REPLAY_WORLD_STREAM_HASH_VERSION, current: "SHA-256" },
      digestFormats: { legacy: "replay-<8 lowercase hex>", current: "replay-sha256-<64 lowercase hex>" },
      hashVersionPolicy: "Fixtures without hashVersion retain the original v1 FNV-1a projection; versions 1 through 11 remain byte-compatible. Every new or explicitly rerecorded fixture writes v12 SHA-256 with deterministic world-stream route, resident-window, and chunk identity in addition to the v11 elevation, v10 motion-body, and v9 authored segment-ground state. Visual loading, first-draw timing, camera, and asset readiness remain excluded. Runtime-state additions must add a new projection instead of silently invalidating accepted evidence.",
      inputContract: "Semantic input transitions are sampled by zero-based simulation tick and deterministically expose pressed, held, and released action phases; checkpoints bind the state after one-based ticks.",
      hashContract: "Canonical nested simulation-only snapshots include action/contact state that can affect the next tick and exclude artwork, camera, animation playback, audio, particles, and wall-clock state.",
      divergencePolicy: "Every recorded checkpoint is compared in tick order and reports the first mismatching tick.",
      rerecordPolicy: "Replacing a fixture requires a higher revision and a non-empty changeReason; a changed hash is never silently accepted.",
      playtestPromotion: {
        sessionSchemaVersion: "looplab-playtest-session/v2",
        previewSchemaVersion: "looplab-playtest-replay-preview/v1",
        previewCommand: "preview_playtest_replay",
        applyCommand: "promote_playtest_replay",
        exactness: "The recorder captures semantic transitions at exact completed fixed-step boundaries. Legacy wall-clock sessions are reviewable but never rounded into replay ticks.",
        authority: "A saved observation remains non-evidence. Promotion requires exact current source, saved-session, and preview digests, an authored-reset start, no dropped inputs/events or mid-run reset, canonical event-count parity, and an immediately passing ordinary replay dry run.",
      },
      completionWitnessPromotion: "protect-completion-witness derives the exact current passed completion tape and previews one ordinary record_replay_case command. It can create only a new fixture; an existing ID requires the manual versioned rerecord path.",
      doctorPolicy: "Project Doctor runs every authored fixture and reports missing fixtures, recordable fixtures, and deterministic divergence.",
      example: { op: "record_replay_case", id: "reach-first-ledge", tickCount: 120, inputs: [{ tick: 0, action: "move-right", pressed: true }, { tick: 90, action: "move-right", pressed: false }], checkpointInterval: 1 },
    },
    deterministicMotionBodies: {
      schemaVersion: LOOPLAB_MOTION_BODY_SCHEMA,
      stateSchemaVersion: LOOPLAB_MOTION_BODY_STATE_SCHEMA,
      runtimeStateSchemaVersion: LOOPLAB_MOTION_BODY_RUNTIME_STATE_SCHEMA,
      commands: ["get_motion_body_report", "suggest_motion_body", "set_motion_body", "remove_motion_body"],
      runtimeMethods: ["getMotionBodyStates"],
      runtimeCommands: ["get_motion_body_states"],
      limits: LOOPLAB_MOTION_BODY_LIMITS,
      policy: LOOPLAB_MOTION_BODY_POLICY,
      supportedDrivers: ["input", "automatic"],
      inputSemantics: "Input-driven bodies consume the held phase of one declared semantic action and decelerate deterministically after release.",
      authoredGeometry: "Each body follows one same-map authored traversal path. Its ground anchor, collider footprint, support z, and depth remain independent authored contracts.",
      collision: "Body movement is substepped and resolved against stable-ID authored solids. Version 2 can transfer the exact accepted fixed-z platform delta to a qualified platformer player; blocked carry follows the authored stop-or-respawn crush response. No generated sprite pixel can create or move collision.",
      evidence: "Project Doctor validates every binding and production projects link an executable acceptance test. Replay v5-v9 retain the frozen legacy motion projection; v10 adds rider, accepted-delta, and crush state that can affect a later tick.",
      examples: {
        cargo: { op: "set_motion_body", id: "cargo-crate", body: { schemaVersion: LOOPLAB_MOTION_BODY_SCHEMA, enabled: true, driver: "input", pathId: "cargo-track", actionId: "tether", initialDirection: "forward", endBehavior: "stop", maxSpeed: 120, acceleration: 720, deceleration: 960, collisionResponse: "stop", snapTolerance: 8, acceptanceTestId: "test-cargo-tether" } },
        sentry: { op: "set_motion_body", id: "sentry-a", body: { schemaVersion: LOOPLAB_MOTION_BODY_SCHEMA, enabled: true, driver: "automatic", pathId: "sentry-patrol", initialDirection: "forward", endBehavior: "ping-pong", maxSpeed: 80, acceleration: 480, deceleration: 720, collisionResponse: "stop", snapTolerance: 8, acceptanceTestId: "test-sentry-patrol" } },
      },
    },
    deterministicCombat: {
      schemaVersion: LOOPLAB_COMBAT_PROGRAM_SCHEMA,
      stateSchemaVersion: LOOPLAB_COMBAT_STATE_SCHEMA,
      commands: ["get_combat_program", "get_combat_report", "suggest_combat_program", "set_combat_program", "remove_combat_program"],
      runtimeMethods: ["getCombatState"],
      runtimeCommands: ["get_combat_state"],
      limits: LOOPLAB_COMBAT_LIMITS,
      policy: LOOPLAB_COMBAT_POLICY,
      systems: ["health", "projectile-pools", "swept-collision", "teams", "fixed-aim", "movement-aim", "nearest-targeting"],
      events: ["projectile.spawned", "projectile.hit", "projectile.expired", "projectile.overflow", "health.changed", "health.immune", "health.depleted", "health.respawned"],
      evidence: "Project Doctor validates strict authored references and bounded pools; production projects link executable acceptance evidence. Replay v7 and save state v3 preserve every latent combat state field.",
      rendererBoundary: "Canvas, Phaser, Pixi, and melonJS render the same projectile state. No renderer advances combat or derives a hitbox from art.",
    },
    deterministicActors: {
      schemaVersion: LOOPLAB_ACTOR_PROGRAM_SCHEMA,
      stateSchemaVersion: LOOPLAB_ACTOR_STATE_SCHEMA,
      commands: ["get_actor_program", "get_actor_report", "suggest_actor_program", "set_actor_program", "remove_actor_program"],
      runtimeMethods: ["getActorStates"],
      runtimeCommands: ["get_actor_states"],
      limits: LOOPLAB_ACTOR_LIMITS,
      policy: LOOPLAB_ACTOR_POLICY,
      modes: ["hold", "patrol", "chase", "flee", "return", "cutscene"],
      events: ["actor.mode-changed", "actor.detected", "actor.lost", "actor.blocked", "actor.node-reached", "actor.arrived"],
      evidence: "Project Doctor validates object, collider, elevation, navigation, target, variable, and acceptance references. Replay v8 and save state v4 preserve every actor field that can affect a later tick.",
      rendererBoundary: "Canvas, Phaser, Pixi, and melonJS render the same canonical actor-bound map objects. No renderer advances actor behavior or invents geometry.",
    },
    authoredCollisionGeometry: {
      schemaVersion: LOOPLAB_COLLISION_GEOMETRY_SCHEMA,
      reportSchemaVersion: LOOPLAB_COLLISION_GEOMETRY_REPORT_SCHEMA,
      commands: ["get_collision_geometry", "get_collision_geometry_report", "suggest_collision_geometry", "set_collision_geometry", "remove_collision_geometry"],
      runtimeMethods: ["getCollisionGeometry"],
      runtimeCommands: ["get_collision_geometry"],
      limits: LOOPLAB_COLLISION_GEOMETRY_LIMITS,
      policy: LOOPLAB_COLLISION_GEOMETRY_POLICY,
      normalFormula: "For point A to B in y-down world coordinates: tangent=(dx/length,dy/length), right-hand normal=(dy/length,-dx/length).",
      endpointPolicy: "Start inclusive, end exclusive except for the last segment of an open chain; stable chain ID and segment index break equal contacts.",
      evidence: "Project Doctor validates geometry, winding, elevation, bounds, and references. Replay v9 introduced segment-ground identity, normal, and slide state; v10 added motion-body rider/crush state; current v11 retains both and adds active elevation-transition support state. Browser evidence verifies the rendered result.",
      rendererBoundary: "Canvas, Phaser, Pixi, and melonJS consume the same authored chains. Sprite pixels, visual bounds, projection, and AI-generated art never own collision.",
    },
    authoredElevationTransitions: {
      schemaVersion: LOOPLAB_ELEVATION_TRANSITIONS_SCHEMA,
      reportSchemaVersion: LOOPLAB_ELEVATION_TRANSITIONS_REPORT_SCHEMA,
      commands: ["get_elevation_transitions", "get_elevation_transition_report", "suggest_elevation_transitions", "set_elevation_transitions", "remove_elevation_transitions"],
      runtimeMethods: ["getElevationTransitions"],
      runtimeCommands: ["get_elevation_transitions"],
      limits: LOOPLAB_ELEVATION_TRANSITIONS_LIMITS,
      policy: LOOPLAB_ELEVATION_TRANSITIONS_POLICY,
      supportFormula: "For an authored point A to B, supportZ=A.z+(B.z-A.z)*clamp(dot(P-A,B-A)/|B-A|^2,0,1).",
      entryPolicy: "Top-down and dimetric actors enter only near a height-compatible endpoint; one-way transitions enter at the first point only. Active actors cannot leave a corridor side at an intermediate height.",
      bindingPolicy: "Collision-chain x/y owns platformer contact shape. Navigation-link endpoints/layers/direction own route connectivity. The transition owns only world-space support interpolation and cross-contract agreement.",
      rendererBoundary: "Canvas, Phaser, Pixi, and melonJS render the same canonical transition state. Art, screen projection, and depth sorting never create a ramp or stair implicitly.",
    },
    canonicalTilePrograms: {
      schemaVersion: LOOPLAB_TILE_PROGRAM_SCHEMA,
      reportSchemaVersion: LOOPLAB_TILE_PROGRAM_REPORT_SCHEMA,
      regionSchemaVersion: LOOPLAB_TILE_REGION_SCHEMA,
      patchSchemaVersion: LOOPLAB_TILE_PATCH_SCHEMA,
      patchPreviewSchemaVersion: LOOPLAB_TILE_PATCH_PREVIEW_SCHEMA,
      runtimeSchemaVersion: LOOPLAB_TILE_RUNTIME_SCHEMA,
      commands: ["get_tile_program", "get_tile_program_report", "get_tile_region", "suggest_tile_program", "set_tile_program", "remove_tile_program", "preview_tile_patch", "apply_tile_patch"],
      runtimeMethods: ["getTileProgram", "getTileRuntime"],
      runtimeCommands: ["get_tile_program", "get_tile_runtime"],
      limits: LOOPLAB_TILE_PROGRAM_LIMITS,
      policy: LOOPLAB_TILE_PROGRAM_POLICY,
      editWorkflow: "Read a bounded region, preview an exact map-owned patch, review deterministic visual/collision changes plus both Doctor profiles, then apply only with unchanged source, tile-program, and patch digests.",
      collisionBoundary: "Visual tiles, generated pixels, filenames, and autotile variants never imply collision. Separate authored collision layers and profiles remain the sole tile-collision owner.",
      rendererBoundary: "Canvas, Phaser, Pixi, and melonJS render the same sparse chunk source and exact autotile resolution. Renderers may cache or cull but cannot mutate source, choose variants, or invent collision.",
    },
    authoredContinuousWorlds: {
      schemaVersion: LOOPLAB_WORLD_STREAM_SCHEMA,
      reportSchemaVersion: LOOPLAB_WORLD_STREAM_REPORT_SCHEMA,
      planSchemaVersion: LOOPLAB_WORLD_STREAM_PLAN_SCHEMA,
      runtimeSchemaVersion: LOOPLAB_WORLD_STREAM_RUNTIME_SCHEMA,
      seamSchemaVersion: LOOPLAB_WORLD_STREAM_SEAM_SCHEMA,
      commands: ["get_world_stream", "get_world_stream_report", "get_world_stream_plan", "suggest_world_stream", "set_world_stream", "remove_world_stream"],
      runtimeMethods: ["getWorldStreamState", "markWorldStreamDraw"],
      runtimeCommands: ["get_world_stream_state", "mark_world_stream_draw"],
      limits: LOOPLAB_WORLD_STREAM_LIMITS,
      policy: LOOPLAB_WORLD_STREAM_POLICY,
      selectionFormula: "Compatible templates are stable-ID sorted, then selected by canonical SHA-256 over seed, ordinal, prior template ID, and prior exit-socket ID. Array order and Math.random never affect the route.",
      compositionBoundary: "Version 1 composes finite or seeded horizontal/vertical embedded 2D map chunks by exact authored edge sockets. It does not claim arbitrary branching, rotation, scaling, network streaming, or 3D.",
      memoryBoundary: "Resident decoded RGBA cost is counted once per unique embedded asset, while tile and collision work are counted per resident chunk instance.",
      evidenceBoundary: "Project Doctor proves source shape, deterministic planning, socket compatibility, supported systems, and budgets. Captured first-draw and unique-pixel seam evidence are still required before claiming visual continuity.",
    },
    executableAcceptance: {
      schemaVersion: LOOPLAB_ACCEPTANCE_RESULT_SCHEMA,
      runner: LOOPLAB_ACCEPTANCE_RUNNER,
      runnerVersion: LOOPLAB_ACCEPTANCE_RUNNER_VERSION,
      commands: ["get_acceptance_plan", "run_acceptance_suite"],
      statuses: ["specified", "passed", "failed", "invalid"],
      targets: ["gameplay-variable", "completed-rule", "event-emitted", "object-property", "runtime-state", "traversal-path", "combat-health", "combat-emitter", "combat-state", "actor-state"],
      proofBoundary: "A prose acceptance record is a specification, never passing evidence. Only a current deterministic execution, passing replay, or source-bound behavior receipt whose check ID matches can satisfy a verb evidence reference.",
      isolationPolicy: "Each deterministic acceptance test receives a fresh runtime model, fixed tick rate, bounded semantic input program, and allowlisted state observations.",
      securityPolicy: "Acceptance project data cannot contain executable JavaScript, eval, shell commands, DOM selectors, storage, network access, arbitrary object paths, or provider claims of pass status.",
      doctorPolicy: "Project Doctor executes the suite fresh, reports failed or invalid cases, distinguishes spec-only and stale evidence, and never auto-generates a passing receipt.",
      example: { op: "upsert_acceptance_test", test: { id: "test-gate-open", name: "Gate opens", ownerId: "gate", assertion: "Interacting opens the gate", runner: LOOPLAB_ACCEPTANCE_RUNNER, driver: { tickRate: 60, tickCount: 2, inputs: [{ tick: 0, action: "interact", pressed: true }, { tick: 1, action: "interact", pressed: false }] }, assertions: [{ id: "gate-open", target: "object-property", targetId: "gate", property: "open", operator: "equals", expected: true }] } },
    },
    authoredEvidence: {
      featureContractCommands: ["set_feature_contracts", "upsert_feature_contract", "remove_feature_contract"],
      acceptanceTestCommands: ["set_acceptance_tests", "upsert_acceptance_test", "remove_acceptance_test"],
      featureContractLinks: FEATURE_CONTRACT_LINKS,
      acceptanceOwnership: ["featureId", "ownerId"],
      replacementSemantics: "set commands atomically replace their complete collection; upsert commands preserve unrelated records by stable ID",
      proofBoundary: "A contract or acceptance specification documents an intended check. It does not count as runtime proof until its implementation IDs resolve and a deterministic acceptance run, deterministic replay, browser QA, or another source-bound verification receipt passes.",
      doctorPolicy: "Project Doctor rejects duplicate IDs and unresolved contract-to-test links, executes restricted deterministic acceptance drivers, and reports spec-only, failed, stale, and missing evidence without converting prose into proof.",
    },
    visualReadiness: {
      command: "get_visual_readiness",
      doctorField: "visualReadiness",
      statuses: ["not-requested", "measurably-ready", "review", "needs-art-pass"],
      checks: ["primary-art-coverage", "player-animation-identity", "art-direction-cohesion", "sprite-pipeline-proof"],
      productionPolicy: "A directed generated game records failed measurable checks as asset warnings. Prototype verification may pass with findings; production remains warning-clean.",
      truthPolicy: "This report measures coverage and pipeline proof only. It never claims to judge taste, composition, originality, or whether artwork looks good.",
    },
    iterationLedger: {
      schemaVersion: "looplab-iteration-ledger/v1",
      candidateDecisionSchema: LOOPLAB_CANDIDATE_DECISION_SCHEMA,
      structuralDiffSchema: LOOPLAB_STRUCTURAL_ITERATION_DIFF_SCHEMA,
      commands: ["checkpoint_iteration", "record_iteration_attempt", "get_iteration_history", "compare_iterations", "restore_iteration"],
      historyLimit: ITERATION_HISTORY_LIMIT,
      snapshotLimit: ITERATION_SNAPSHOT_LIMIT,
      sourceBinding: "Every receipt records the Project Doctor sourceDigest for the exact authored project state.",
      restorePolicy: "Restoring never overwrites a historical snapshot; it creates a new editable child candidate with the restored iteration as parent.",
      selectionPolicy: "compare_iterations returns the same source-bound decision packet and stable-ID structural overlay to the UI, CLI, MCP, Codex, and Claude. It reports hard-gate feasibility and Pareto relations without naming an automatic creative winner; changed candidates require explicit preview, play, and human-directed continuation.",
      structuralDiffPolicy: "Object placement, object colliders, authored collision chains, and canonical tile colliders are compared independently in authored world space. Aggregate counts are complete, details are bounded and explicit about truncation, and proximity/art/pixels never establish identity or collision.",
      storagePolicy: "Editable .loop.json projects retain bounded deduplicated snapshots; shipped one-file HTML omits the snapshot archive.",
    },
    editorPreview: {
      command: "set_mode",
      playMode: { mode: "play", focus: true },
      defaultFocused: true,
      focusField: "focus",
      shortcuts: { enter: "P", toggleFocus: "F", escape: "show-panels-then-exit" },
      headlessState: "get_preview_state.workspace",
      uiPolicy: "Focused preview hides the AI Director, Project Doctor, map tabs, and rule strip while preserving the Preview toolbar and one-click return to editing.",
    },
    exportReceipt: {
      schemaVersion: "looplab-export-receipt/v5",
      prepareCommand: "prepare_export",
      exportCommand: "export_html",
      cliOperation: "prepare-export",
      statuses: ["draft", "release-ready"],
      statusPolicy: "draft remains offline-playable and auditable; release-ready is emitted only when the production Doctor is warning-clean, the exact iteration is currently verified or promoted, the generated HTML audit passes, and its SHA-256 exactly matches the current structured browser attestation",
      artifactGateField: "receipt.artifact.gate",
      draftPolicy: "Prototype or unverified exports remain downloadable for iteration but must never be described as ready to distribute.",
      sourceBinding: "receipt.source.sourceDigest must equal the current Project Doctor sourceDigest",
      artifactFields: ["sha256", "uploadFileCount", "byteLength", "embeddedPayloadBytes", "decodedImageMemoryBytes", "embeddedResourceCount", "scriptCount", "checks", "warnings"],
      stalePolicy: "Any authored project change makes an earlier receipt historical; rebuild before claiming it describes the current project.",
      uiActions: ["verify-exact-build", "cancel-exact-verification", "download-html", "open-exact-build", "save-editable-project"],
    },
    visualAuthoring: {
      mapTabs: true,
      mapFlow: {
        startField: "startMapId",
        order: "project.maps array order; index 0 is the player-facing start",
        commands: ["set_start_map", "reorder_map", "connect_maps"],
        connectionContract: "connect_maps authors a source portal, exact destination spawn, and enabled runtimeJoin capture contract by default; preview and export start at startMapId.",
      },
      htmlProjectImport: { command: "import_html", metadataSelector: `#${LOOPLAB_PROJECT_SCRIPT_ID}`, policy: "Looplab HTML only; never infer collision from arbitrary markup" },
      supportContacts: {
        commands: ["inspect_supports", "attach_to_support"],
        modes: ["auto", "floor", "surface", "free"],
        independentFields: ["groundAnchor", "supportFootprint", "collider", "supportZ"],
        example: { op: "attach_to_support", id: "vending-machine", mode: "auto", tolerance: 2 },
      },
      motionBodies: {
        commands: ["get_motion_body_report", "suggest_motion_body", "set_motion_body", "remove_motion_body"],
        contract: "Reusable deterministic non-player bodies follow authored paths under held semantic input or automatic patrol control. Solid platformer platforms can carry the player with explicit stop-or-respawn crush handling. Preview and one-file export execute the same runtime.",
        geometryPolicy: "Paths, colliders, ground anchors, support z, depth, and stopping blockers are authored map data. Visual assets are never sampled for physics.",
      },
      traversalPaths: {
        commands: ["add_traversal_path", "update_traversal_path", "remove_traversal_path"],
        kinds: ["rail", "grind", "zipline", "route"],
        requiredFields: ["stable id", "two or more control points", "entry radius", "minimum entry speed", "direction", "authored-map collision owner"],
        visualPolicy: "The editor renders authored paths independently from rail artwork; visual assets never become collision or traversal truth.",
      },
      dimetricMapEditor: {
        command: "set_map_projection",
        starterTemplate: "dimetric",
        addMapCommand: "add_dimetric_map",
        projection: { type: "dimetric-2:1", tileWidth: 128, tileHeight: 64, elevationStep: 32, worldUnitsPerTile: 128 },
        editorTools: ["select", "tiles", "traversal", "collision-chain", "navigation", "walkable-ramp", "walkable-stairs", "timed-route", "walkable-area", "blocked-area", "test-route"],
        coordinatePolicy: "Simulation remains in authored world x/y/z. Authoring, preview, export, hit-testing, and drag placement share the same reversible projection adapter.",
        heightPolicy: "Visual z, support z, collider zMin/zMax, route layer, and depth slices remain independently authored.",
        starterProof: ["ground-and-raised-route-layers", "underpass-and-deck-at-shared-world-xy", "authored-traversal-at-z0-and-z4", "blocked-building-footprints", "non-overlapping-depth-slices"],
      },
      navigationGraph: {
        commands: ["add_navigation_layer", "update_navigation_layer", "remove_navigation_layer", "add_navigation_node", "update_navigation_node", "remove_navigation_node", "connect_navigation_nodes", "update_navigation_link", "remove_navigation_link", "add_navigation_area", "update_navigation_area", "remove_navigation_area", "test_navigation_route", "import_path_editor_navigation", "export_path_editor_navigation", "get_authored_route_document", "set_authored_route_document", "update_authored_route_actor", "update_authored_route_step", "update_authored_route_meeting", "verify_authored_route_document", "export_authored_route_document", "remove_authored_route_document"],
        supports: ["layer visibility and locks", "elevation ranges", "one-way links", "cost multipliers", "stable destinations", "authored walkable ramps and stairs", "walkable polygons", "blocked polygons", "admissible A-star test routes", "exact blocked-polygon crossing checks", "Path Editor v2 import and export", "lossless rich-route and elevation-transition source documents", "animation timing", "per-stop waits", "facing and depth", "meeting windows", "route events", "deterministic hash receipts"],
        pathEditorRoundTrip: { baseFormat: "path-editor-v2", extension: "looplab-rich-route-v2", policy: "Portable percentage x/y remains available, while the Looplab extension losslessly preserves projection, z, authored ramps/stairs, the complete authored route source document, timings, waits, facing, meetings, events, depth, and hashes. Schedule edits mark preserved hashes stale until measured replay or render evidence verifies the exact current digest." },
        authoredRouteEnvelope: { version: 1, sourceFormats: ["city-activity-v1", "path-editor-v2", "looplab-authored-route-v1"], coordinateSpaces: ["world", "percent", "source-pixels"], digestAlgorithm: "sha256-jcs-v1", integrityStates: ["unverified", "preserved", "verified", "stale"] },
        objectMapping: "Navigation and gameplay objects remain separate. A lossless authored route document may describe scheduled actors without becoming collision truth.",
      },
      assetGeneration: {
        tilesets: { command: "generate_tiles", themes: ["meadow", "dungeon", "desert", "neon"], sizes: [16, 32, 48, 64] },
        sprites: { command: "generate_sprite", roles: ["hero", "enemy", "pickup", "prop", "effect", "ui"], palettes: ["violet", "ember", "forest", "mono"], sizes: [16, 32, 48, 64] },
        providerArt: {
          command: "generate_ai_asset",
          statusCommand: "get_ai_asset_job",
          cancelCommand: "cancel_ai_asset_job",
          provider: "openai",
          transport: "/asset-jobs",
          roles: ["character", "enemy", "pickup", "prop", "effect", "ui", "tileset", "environment"],
          frameSizes: [16, 32, 48, 64],
          submitPolicy: "Submit exactly once, retain the durable job ID, and resume or inspect that job without resubmission. No outer UI timeout.",
          sourcePolicy: "One complete ordered sheet per request is measured cell-by-cell, then normalized locally with one shared scale, one palette, explicit anchors, provenance, and decoded-memory evidence.",
          visualIdentity: {
            contractField: "visualIdentity",
            defaultInheritance: true,
            oneJobBypass: "Set useVisualIdentity=false explicitly; the provider cannot remove or rewrite the project contract.",
            semanticReferences: "Reference notes enter the bounded prompt without uploading project pixels.",
            imageReferences: "Applicable delivery=image project PNGs use OpenAI's multipart /v1/images/edits route with repeated image[] parts.",
            consent: "Every job that uploads image references requires fresh referenceConsent=true. Selecting or storing a project reference is not consent.",
            limits: { maximumImagesPerJob: 4, maximumDecodedBytesPerJob: 16777216 },
            receipts: "Public requests and retained job receipts contain IDs, hashes, counts, and byte lengths, never reference image bytes.",
          },
          analysisContract: { version: "looplab-frame-analysis/v1", stages: ["provider-source-cells", "normalized-packed-frames"], metrics: ["alpha-bounds", "empty-frames", "silhouette-drift", "anchor-variance", "subject-clusters", "border-leakage", "matte-halo-signal", "tile-opposing-edge-delta"], connectivity: 8, alphaThreshold: 16 },
          rejectionPolicy: "Unmeasured or failed provider art remains reviewable and downloadable but cannot be attached, placed, or described as game-ready. Headless generation returns rejected=true without mutating the project.",
          collisionPolicy: "Provider pixels are visual source art only; authored map data remains the sole collision owner.",
          fallback: "generate_tiles and generate_sprite remain deterministic zero-provider fallbacks.",
        },
        guarantees: ["measured-frame-analysis", "palette-lock", "ground-anchor-where-applicable", "authored-collision-only", "atlas-memory-ledger"],
      },
      commercialAssetLibrary: {
        catalogUrl: "/cc0-asset-catalog.json",
        stateSelector: "#looplab-asset-catalog-state",
        installedManifestUrl: "/asset-packs/manifest.json",
        installedIndexUrlTemplate: "/asset-packs/index/{packId}.json",
        installedStateSelector: "#looplab-asset-pack-state",
        browserCommands: ["get_asset_library_state", "list_asset_packs", "select_asset_pack", "list_pack_assets", "preview_pack_asset", "select_pack_assets", "import_pack_assets"],
        cliOperations: ["asset-packs", "pack-assets", "import-pack"],
        policyId: "verified-cc0-commercial-v1",
        admission: "Individually verified CC0 1.0/public-domain only; commercial use, modification, redistribution, and no required attribution must all be true.",
        importBoundary: "Only selected files are embedded into the authoring project and final HTML; generated art never owns collision.",
      },
    },
    exportedRuntime: {
      version: LOOPLAB_EXPORTED_RUNTIME_VERSION,
      packaging: "single-self-contained-html",
      uploadFiles: 1,
      offlinePlayable: true,
      launch: "Open the exported .html file directly in a modern browser; no server or installation is required.",
      externalDependencies: [],
      embeds: ["fixed-step-runtime", "deterministic-gameplay-program", "deterministic-actor-program", "authored-segment-and-slope-collision", "choice-and-dialogue-pages", "source-narrative-contract-and-report", "named-turn-and-day-clocks", "integer-formulas", "variable-bound-dom-hud", "deterministic-acceptance-fixtures", "deterministic-replay-fixtures", "runtime-join-plan", "portable-source-bound-save-codes", "styles", "maps", "authored-collision", "authored-traversal-paths", "layered-navigation-graph", "dimetric-projection", "project-metadata", "selected-assets-as-data-urls", "keyboard-gamepad-and-touch-controls", "local-performance-probe"],
      catalogBoundary: "The builder's source catalog is not bundled; only assets selected into the project are embedded.",
      engineDelivery: {
        canvas: "built-in-inline",
        phaser: "inline-script-tag",
        pixi: "inline-umd-with-official-csp-polyfill",
        melon: "tree-shaken-inline-iife",
      },
      artifactGate: ["doctype-and-complete-document", "inline-script-parse", "no-external-references", "no-network-dependency", "profile-bound-storage-capability", "encoded-byte-budget", "decoded-rgba-budget", "single-frame-owner", "playwright-smoke-and-screenshot"],
      persistence: {
        exportProfileSchema: LOOPLAB_EXPORT_PROFILE_SCHEMA,
        defaultProfile: LOOPLAB_PERSISTENCE_POLICY.defaultExportProfile,
        profiles: [...LOOPLAB_PERSISTENCE_POLICY.exportProfiles],
        authoringCommands: ["get_export_profile", "get_save_report", "set_export_profile"],
        runtimeCommands: ["get_save_report", "get_save_status", "export_save_code", "inspect_save_code", "import_save_code", "persist_hosted_save", "clear_hosted_save"],
        strict: "No persistent-storage API. Optional portable codes stay under player control.",
        hosted: { wrapper: LOOPLAB_HOSTED_STORAGE_WRAPPER_SCHEMA, version: LOOPLAB_HOSTED_STORAGE_WRAPPER_VERSION, sha256: LOOPLAB_HOSTED_STORAGE_WRAPPER_SHA256, fallback: "portable-save-code" },
        policy: clone(LOOPLAB_PERSISTENCE_POLICY),
      },
      browserGlobal: "window.looplabRuntime",
      browserGlobalAvailability: "preferred-when-window-is-extensible",
      domBridge: {
        selector: "#looplab-runtime-bridge",
        commandEvent: "looplab:runtime-command",
        responseEvent: "looplab:runtime-response",
        form: { selector: "#looplab-runtime-form", commandInput: "#looplab-runtime-command", submit: "#looplab-runtime-submit", result: "#looplab-runtime-result" },
      },
      readyEvent: "looplab-runtime-ready",
      methods: ["getSourceDigest", "getRuntimeAdapterInfo", "getInputActionLiveness", "getCompletionReport", "getNarrativeContract", "getNarrativeReport", "getSaveReport", "getSaveStatus", "exportSaveCode", "inspectSaveCode", "importSaveCode", "persistHostedSave", "clearHostedSave", "getState", "getObjects", "getTraversalPaths", "getCollisionGeometry", "getElevationTransitions", "getTileProgram", "getTileRuntime", "getWorldStreamState", "markWorldStreamDraw", "getMotionBodyStates", "getActorStates", "getCombatState", "getNavigation", "getGameplayState", "getChoiceState", "getHudState", "chooseChoice", "getRuntimeJoinPlan", "beginRuntimeJoinProbe", "commitRuntimeJoinProbe", "finishRuntimeJoinProbe", "getCollisionBox", "getPerformance", "getAcceptanceTests", "runAcceptanceTest", "runAcceptanceSuite", "getReplayCases", "runReplayCase", "runReplaySuite", "setInput", "step", "reset", "loadMap", "pause", "resume"],
      commands: ["get_source_digest", "get_runtime_adapter", "get_input_action_liveness", "get_completion_report", "get_narrative_contract", "get_narrative_report", "get_save_report", "get_save_status", "export_save_code", "inspect_save_code", "import_save_code", "persist_hosted_save", "clear_hosted_save", "get_state", "get_objects", "get_traversal_paths", "get_collision_geometry", "get_elevation_transitions", "get_tile_program", "get_tile_runtime", "get_world_stream_state", "mark_world_stream_draw", "get_motion_body_states", "get_actor_states", "get_combat_state", "get_navigation", "get_gameplay_state", "get_choice_state", "get_hud_state", "choose_choice", "get_runtime_join_plan", "begin_runtime_join_probe", "commit_runtime_join_probe", "finish_runtime_join_probe", "get_collision_box", "get_acceptance_tests", "run_acceptance_test", "run_acceptance_suite", "get_replay_cases", "run_replay_case", "run_replay_suite", "set_input", "step", "reset", "load_map", "pause", "resume"],
    },
    commands: [...LOOPLAB_AGENT_COMMANDS],
    commandSurfaces: {
      core: [...LOOPLAB_CORE_COMMANDS],
      browserSession: [...LOOPLAB_BROWSER_SESSION_COMMANDS],
      browserOnly: [...LOOPLAB_BROWSER_ONLY_COMMANDS],
      coreTransport: "applyAgentCommand; npm run agent -- apply/batch",
      browserTransport: "window.looplabAgent; looplab:agent-command; #looplab-agent-bridge",
    },
    tuningSearch: {
      feelReportSchema: LOOPLAB_FEEL_REPORT_SCHEMA,
      contractSchema: LOOPLAB_TUNING_CONTRACT_SCHEMA,
      reportSchema: LOOPLAB_TUNING_REPORT_SCHEMA,
      searchSchema: LOOPLAB_TUNING_SEARCH_SCHEMA,
      commands: ["get_feel_report", "get_tuning_contract", "suggest_tuning_contract", "set_tuning_contract", "remove_tuning_contract", "run_tuning_search"],
      limits: LOOPLAB_TUNING_LIMITS,
      targetPolicy: "Only allowlisted numeric movement tuning, project gravity, and numeric gameplay-variable initial values may be searched; arbitrary object paths and executable expressions are rejected.",
      evaluationPolicy: "Every candidate is evaluated under both Project Doctor profiles against the unchanged baseline, including schema, blocker, acceptance, replay, completion, input-liveness, and runtime-join non-regression gates.",
      selectionPolicy: "run_tuning_search returns safe Pareto candidates and ordinary preview_batch commands, never an automatic creative winner. Preview, play, and explicit continuation remain mandatory.",
      evidencePolicy: "Search is provider-free and read-only. It never rerecords replay or acceptance evidence, mutates the project, or claims fun, taste, composition, originality, or emotional effect.",
    },
    gameFoundations: {
      registrySchema: LOOPLAB_GAME_FOUNDATION_REGISTRY_SCHEMA,
      searchSchema: LOOPLAB_GAME_FOUNDATION_SEARCH_SCHEMA,
      materializationSchema: LOOPLAB_GAME_FOUNDATION_MATERIALIZATION_SCHEMA,
      foundationIds: LOOPLAB_GAME_FOUNDATION_IDS,
      commands: ["list_game_foundations", "suggest_game_foundations", "materialize_game_foundation"],
      limits: LOOPLAB_GAME_FOUNDATION_LIMITS,
      inspectionPolicy: "Inspect real template source and evidence. Proven-playable requires validation, required gameplay roles, a state-changing loop, executable acceptance, deterministic replay, and completion proof; art, story, audio, balance, and fun remain separate gaps.",
      selectionPolicy: "Brief compatibility and proof maturity produce several source-bound candidates. automaticWinner is always null; explicit agent or human selection is mandatory.",
      applicationPolicy: "Loaded projects are protected by default. Materialization requires explicit replacement authority and returns one ordinary replace_project command inside a source-bound preview_batch; preview and exact apply remain separate.",
      evidencePolicy: "Provider-free technical routing never promotes a candidate, invents visual quality, treats generated art as collision, or rerecords evidence silently.",
    },
    structuralScaffoldSearch: {
      contractSchema: LOOPLAB_STRUCTURAL_SCAFFOLD_CONTRACT_SCHEMA,
      reportSchema: LOOPLAB_STRUCTURAL_SCAFFOLD_REPORT_SCHEMA,
      searchSchema: LOOPLAB_STRUCTURAL_SCAFFOLD_SEARCH_SCHEMA,
      materializationSchema: LOOPLAB_STRUCTURAL_SCAFFOLD_MATERIALIZATION_SCHEMA,
      families: LOOPLAB_STRUCTURAL_SCAFFOLD_FAMILIES,
      commands: ["get_structural_scaffold_contract", "suggest_structural_scaffold_contract", "set_structural_scaffold_contract", "remove_structural_scaffold_contract", "run_structural_scaffold_search", "materialize_structural_scaffold"],
      limits: LOOPLAB_STRUCTURAL_SCAFFOLD_LIMITS,
      generationPolicy: "Deterministic renderer-neutral quest, economy, and encounter structures are valid by construction, then independently checked for reachability, terminal outcomes, semantic references, schema validity, and both Doctor profiles.",
      selectionPolicy: "A descriptor archive preserves qualitatively different safe candidates. automaticWinner is always null; agent judgment, complete content-slot authorship, preview, and explicit apply remain mandatory.",
      applicationPolicy: "Search and materialization are read-only. Materialization returns only ordinary set_project/set_gameplay_program commands inside a source-bound preview_batch request.",
      evidencePolicy: "Provider-free structural feasibility is not evidence of fun, balance, prose quality, art quality, or spatial playability.",
    },
    spatialLayoutSearch: {
      contractSchema: LOOPLAB_SPATIAL_LAYOUT_CONTRACT_SCHEMA,
      reportSchema: LOOPLAB_SPATIAL_LAYOUT_REPORT_SCHEMA,
      searchSchema: LOOPLAB_SPATIAL_LAYOUT_SEARCH_SCHEMA,
      materializationSchema: LOOPLAB_SPATIAL_LAYOUT_MATERIALIZATION_SCHEMA,
      families: LOOPLAB_SPATIAL_LAYOUT_FAMILIES,
      descriptorAxes: LOOPLAB_SPATIAL_LAYOUT_DESCRIPTOR_AXES,
      commands: ["get_spatial_layout_contract", "suggest_spatial_layout_contract", "set_spatial_layout_contract", "remove_spatial_layout_contract", "run_spatial_layout_search", "materialize_spatial_layout"],
      limits: LOOPLAB_SPATIAL_LAYOUT_LIMITS,
      generationPolicy: "Generate projection-compatible authored side-view, top-down, or dimetric 2.5D map layouts. Art remains separate and never owns collision.",
      evaluationPolicy: "Every cloned candidate runs real schema validation plus prototype and production Doctor, acceptance, replay, input-liveness, and runtime-join non-regression gates.",
      selectionPolicy: "A deterministic descriptor archive preserves distinct feasible layouts. automaticWinner is always null; exact visual review, playtest, and explicit agent or user choice remain mandatory.",
      applicationPolicy: "Search and materialization are read-only. Exact pinned objects remain byte-for-byte canonical, existing geometry is protected by default, and materialization returns one ordinary source-bound update_map preview batch.",
      evidencePolicy: "A spatial hard-gate pass is technical feasibility, not evidence of fun, pacing, composition, originality, or art quality. Existing replay or acceptance truth is never silently rerecorded.",
    },
    commandContracts: {
      schemaVersion: LOOPLAB_COMMAND_CONTRACT_SCHEMA,
      commands: getLooplabCommandContracts(),
    },
    commandMacros: listCommandMacros(),
    agentPlaybook: {
      ...listAgentRecipes({ status: "all", limit: 50 }),
      resource: "looplab://agent-playbook",
      commands: ["list_agent_recipes", "get_agent_recipe"],
    },
    mcpServer: {
      version: LOOPLAB_MCP_SERVER_VERSION,
      transport: "stdio",
      implementation: "generated-from-commandContracts",
      profiles: {
        core: "Workspace-contained .loop.json files through applyAgentCommand with atomic writes and source-digest preconditions.",
        browser: "Persistent Playwright session through the live window.looplabAgent/DOM bridge for the complete browser-session surface.",
      },
      resources: ["looplab://manifest", "looplab://agent-playbook", "looplab://agent-guide", "looplab://mcp-setup"],
      stdoutPolicy: "MCP JSON-RPC messages only; diagnostics use stderr.",
      providerBoundary: "This external authoring server is never injected into LoopLab's own Codex or Claude provider subprocesses.",
    },
  };
}

export function getCompactAgentManifest() {
  const manifest = getAgentManifest();
  const commandIndex = manifest.commandContracts.commands.map((contract) => ({
    op: contract.op,
    surfaces: contract.surfaces,
    mutates: contract.mutatesProject ? "project" : contract.mutatesBuilderState ? "builder" : null,
    sourceDigestRequiredInMcp: contract.requiresSourceDigestInMcp,
    required: contract.inputSchema.required ?? [],
    accepts: Object.keys(contract.inputSchema.properties ?? {}),
  }));
  return {
    name: manifest.name,
    protocolVersion: manifest.protocolVersion,
    compact: true,
    agentOperatingModel: manifest.agentOperatingModel,
    productScope: manifest.productScope,
    transport: manifest.transport,
    requiredWorkflow: manifest.requiredWorkflow,
    headlessResponses: manifest.headlessResponses,
    commandSurfaces: manifest.commandSurfaces,
    commandContracts: {
      schemaVersion: manifest.commandContracts.schemaVersion,
      count: commandIndex.length,
      commands: commandIndex,
    },
    fullManifest: {
      url: manifest.transport.manifestUrl,
      mcpResource: "looplab://manifest",
      browserCommand: { op: "get_manifest", compact: false },
      guidance: "Use the static manifest URL or MCP resource for complete JSON Schemas. The browser command defaults to this bounded, parseable bootstrap index.",
    },
  };
}

export function getPublicAgentManifest() {
  const publicManifest = clone(getAgentManifest());
  for (const field of ["genre", "coreLoop", "movementTemplate", "format", "progression", "campaignScope"]) {
    if (Array.isArray(publicManifest.gameDirector?.fields?.[field])) {
      publicManifest.gameDirector.fields[field] = publicManifest.gameDirector.fields[field].map((choice) => choice?.value ?? choice);
    }
  }
  publicManifest.gameDirector.artDirectionPolicy = {
    ...publicManifest.gameDirector.artDirectionPolicy,
    default: publicManifest.gameDirector.artDirectionPolicy.defaultMode,
    qualityBoundary: "Objective quality goals do not silently become palette, setting, rendering-style, material, camera, or character-design locks.",
  };
  publicManifest.objectAuthoring = { ...LOOPLAB_OBJECT_UPDATE_POLICY };
  publicManifest.companion = {
    baseUrl: "http://127.0.0.1:4317",
    expectedCompanionVersion: LOOPLAB_COMPANION_VERSION,
    expectedProtocolVersion: LOOPLAB_PROTOCOL_VERSION,
    providers: "/providers",
    promptDrafts: "/prompt-drafts",
    agentPresence: "/agent-presence",
    agentPresenceLeave: "/agent-presence/{id}/leave",
    agentPresencePolicy: LOOPLAB_AGENT_PRESENCE_POLICY,
    generationJobs: "/jobs",
    generationJobStatus: "/jobs/{id}/status",
    lifecycleShutdown: "/lifecycle/shutdown",
    lifecyclePolicy: "The managed launcher reuses only an exact protocol match. It may cooperatively replace a stale LoopLab companion only when every AI job, local-copilot job, research job, prompt generation, and provider connection is idle; active or unknown services are never killed.",
    researchJobs: "/research-jobs",
    researchJobStatus: "/research-jobs/{id}/status",
    visualCritiqueJobs: "/visual-critique-jobs",
    visualCritiqueJobStatus: "/visual-critique-jobs/{id}/status",
    visualCritiquePolicy: "Each job requires explicit image-submission consent, binds results to exact source and capture-set digests, deletes temporary captures, and remains advisory rather than verification evidence.",
    assetJobs: "/asset-jobs",
    assetJobStatus: "/asset-jobs/{id}/status",
    assetJobPolicy: "OpenAI image requests are companion-owned durable jobs. Browser and headless callers retain the returned ID, monitor it without an outer timeout, and never resubmit an active job.",
    localCopilotStatus: "/local-copilot",
    localCopilotJobs: "/local-copilot/jobs",
    localCopilotJobStatus: "/local-copilot/jobs/{id}/status",
    localCopilotPolicy: "Optional loopback local inference is advisory, schema-constrained, tool-free, non-mutating, and retained as a durable cancellable job. It supplements Codex or Claude and never creates verification evidence.",
    mutationAuthentication: {
      header: "x-looplab-session-token",
      sessionFile: ".looplab/companion-session.json",
      requiredMethods: ["POST"],
      secretHandling: "Read locally for companion control only; never log, persist in a project, or include in provider context.",
    },
    providerConnectionCancel: "/provider-connections/{id}/cancel",
    providerConnectionResume: "Repeat the provider connection request to resume the existing connection instead of starting a duplicate sign-in.",
    browserReceivesApiKey: "transient-masked-field-only",
    apiKeyBoundaries: ["loopback-only", "no-project-storage", "no-browser-persistence", "no-console-or-log-output", "no-export"],
    apiKeyStorage: ["process-environment", "windows-current-user-dpapi-vault"],
  };
  publicManifest.visualReviewStateSelector = publicManifest.transport.visualReviewStateSelector;
  publicManifest.visualCritiqueStateSelector = publicManifest.transport.visualCritiqueStateSelector;
  publicManifest.domBridge = {
    selector: publicManifest.transport.bridgeSelector,
    commandEvent: publicManifest.transport.domCommandEvent,
    responseEvent: publicManifest.transport.domResponseEvent,
    form: clone(publicManifest.transport.domForm),
  };
  return publicManifest;
}

const STANDALONE_RUNTIME_OMITTED_FIELDS = Object.freeze([
  "iteration",
  "iterationHistory",
  "iterationArchive",
  "build",
  "authoring",
  "workstreams",
  "agentRequests",
  "agentWorkLedger",
  "releaseVerification",
  "tuningContract",
  "structuralScaffoldContract",
  "spatialLayoutContract",
  "visualIdentity",
]);

export function projectForStandaloneRuntime(project) {
  const runtimeProject = syncActiveMap(clone(project));
  for (const field of STANDALONE_RUNTIME_OMITTED_FIELDS) delete runtimeProject[field];
  if (runtimeProject.release && typeof runtimeProject.release === "object") {
    runtimeProject.release = { ...runtimeProject.release };
    delete runtimeProject.release.offlineVerified;
  }
  return runtimeProject;
}

function buildStandaloneHtmlInternal(project, { verificationArtifact = false } = {}) {
  const authoredProject = syncActiveMap(clone(project));
  const exportProject = projectForStandaloneRuntime(authoredProject);
  const validation = validateProject(authoredProject);
  if (!validation.valid) throw new Error(`Cannot export an invalid project: ${validation.errors.join(" ")}`);
  const doctor = analyzeProject(authoredProject);
  const verificationEligible = verificationArtifact && canCollectOfflineVerificationEvidence(authoredProject, doctor);
  if (doctor.gate.blocking && !verificationEligible) {
    const blockers = doctor.issues.filter((issue) => issue.severity === "error" || (doctor.profile === "production" && issue.severity === "warning")).slice(0, 3).map((issue) => issue.code).join(", ");
    throw new Error(`Project Doctor blocked HTML export with ${doctor.errorCount} error(s) and ${doctor.warningCount} warning(s) in the ${doctor.profile} profile${blockers ? `: ${blockers}` : ""}.`);
  }
  if (authoredProject.iteration?.status === "verified" || authoredProject.iteration?.status === "promoted") {
    const verification = authoredProject.iteration.verification;
    const evidence = verification
      ? validateVerificationEvidence(verification.evidenceRefs, { sourceDigest: doctor.sourceDigest, ...verificationCoverageRequirements(authoredProject) })
      : { valid: false };
    const stale = !verification
      || verification.digest !== doctor.digest
      || verification.sourceDigest !== doctor.sourceDigest
      || verification.profile !== doctor.profile
      || (verification.buildId ?? null) !== (authoredProject.build?.id ?? null)
      || (verification.sourceRevision ?? null) !== (authoredProject.build?.sourceRevision ?? null)
      || !evidence.valid;
    if (stale) throw new Error("Project Doctor blocked HTML export because this verified snapshot is stale. Verify the exact current candidate again.");
  }
  const config = serializeProjectMetadata(exportProject);
  const runtimeJoinConfig = serializeProjectMetadata(buildRuntimeJoinPlan(exportProject));
  const inputActionLivenessConfig = serializeProjectMetadata(analyzeInputActionLiveness(exportProject, { sourceDigest: doctor.sourceDigest }));
  const completionReportConfig = serializeProjectMetadata(doctor.completionReport);
  const narrativeReportConfig = serializeProjectMetadata(doctor.narrativeReport);
  const presentationReportConfig = serializeProjectMetadata(doctor.presentationReport);
  const gameShellReportConfig = serializeProjectMetadata(doctor.gameShellReport);
  const saveReportConfig = serializeProjectMetadata(doctor.saveReport);
  const title = escapeHtml(exportProject.name);
  const inputHint = escapeHtml((exportProject.inputActions ?? []).map((action) => `${action.label ?? action.id}: ${(action.bindings ?? []).join(" / ") || action.id}`).join(" · "));
  const runtimeObjectStateKeys = serializeProjectMetadata(LOOPLAB_RUNTIME_OBJECT_STATE_KEYS);
  const runtimePrelude = buildStandaloneRuntimePrelude();
  const runtimeFramework = exportProject.runtimeProfile?.framework === "standalone" ? "canvas" : exportProject.runtimeProfile?.framework ?? "canvas";
  const runtimeAdapter = LOOPLAB_RELEASE_READY_RUNTIME_ADAPTERS[runtimeFramework];
  if (!runtimeAdapter) throw new Error(`Cannot export unsupported runtime adapter ${runtimeFramework}.`);
  const embeddedEngineScript = runtimeFramework === "phaser"
    ? `  <script data-looplab-vendor="phaser" data-version="${LOOPLAB_PHASER_BROWSER_VERSION}" data-sha256="${LOOPLAB_PHASER_BROWSER_SHA256}">${LOOPLAB_PHASER_BROWSER_BUNDLE}</script>\n`
    : runtimeFramework === "pixi"
      ? `  <script data-looplab-vendor="pixi" data-version="${LOOPLAB_PIXI_BROWSER_VERSION}" data-sha256="${LOOPLAB_PIXI_BROWSER_SHA256}">${LOOPLAB_PIXI_BROWSER_BUNDLE}</script>\n`
      : runtimeFramework === "melon"
        ? `  <script data-looplab-vendor="melon" data-version="${LOOPLAB_MELON_BROWSER_VERSION}" data-sha256="${LOOPLAB_MELON_BROWSER_SHA256}">${LOOPLAB_MELON_BROWSER_BUNDLE}</script>\n`
        : "";
  const pinnedRuntimeVendorConfig = runtimeAdapter.vendor
    ? serializeProjectMetadata({ id: runtimeAdapter.vendor.id, version: runtimeAdapter.vendor.version, sha256: runtimeAdapter.vendor.browserBundleSha256, bytes: runtimeAdapter.vendor.browserBundleBytes })
    : "null";
  const exportProfile = exportProfileId(exportProject);
  const embeddedStorageScript = exportProfile === "hosted"
    ? `  <script data-looplab-capability="${LOOPLAB_HOSTED_STORAGE_WRAPPER_SCHEMA}" data-version="${LOOPLAB_HOSTED_STORAGE_WRAPPER_VERSION}" data-sha256="${LOOPLAB_HOSTED_STORAGE_WRAPPER_SHA256}">${LOOPLAB_HOSTED_STORAGE_WRAPPER_SOURCE}</script>\n`
    : "";
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${title}</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#171714;color:#fff;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}body{display:grid;place-items:center;padding:20px;overscroll-behavior:none}.game-shell{width:min(100%,1100px)}.game-bar{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;text-transform:uppercase;letter-spacing:.08em;font-size:12px}.game-bar strong{font-size:15px}.game-stats{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:10px}.game-bar button,.touch-controls button{min-width:44px;min-height:44px;border:1px solid #fff;background:transparent;color:#fff;padding:8px 12px;cursor:pointer;font:inherit}.game-bar button:focus-visible,.touch-controls button:focus-visible,canvas:focus-visible{outline:3px solid #c8ff4d;outline-offset:2px}.map-name{color:#c8ff4d}.runtime-status{min-width:9ch;color:#b9b9b0}.frame{position:relative;overflow:hidden;border:2px solid #fff;background:#000;box-shadow:8px 8px 0 #5b5cf0}canvas{display:block;width:100%;height:auto;image-rendering:pixelated;touch-action:none}.transition{pointer-events:none;position:absolute;inset:0;background:#080808;opacity:0}.hint{opacity:.72;margin:14px 0 0;text-align:center;font-size:12px;line-height:1.6}.touch-controls{display:none;grid-template-columns:repeat(3,52px) 1fr repeat(2,68px);gap:7px;align-items:end;justify-content:center;margin-top:16px;touch-action:none}.touch-controls[data-active=true]{display:grid}.touch-controls[hidden]{display:none!important}.touch-controls button{padding:0;background:#272722;font-weight:800}.touch-controls [data-input=up]{grid-column:2}.touch-controls [data-input=left]{grid-column:1;grid-row:2}.touch-controls [data-input=down]{grid-column:2;grid-row:2}.touch-controls [data-input=right]{grid-column:3;grid-row:2}.touch-controls [data-input=jump]{grid-column:5;grid-row:1/3}.touch-controls [data-input=interact]{grid-column:6;grid-row:1/3}.runtime-bridge{margin-top:14px;border-top:1px solid #45453f;color:#b9b9b0;font-size:11px}.runtime-bridge summary{width:max-content;cursor:pointer;padding:10px 0;text-transform:uppercase;letter-spacing:.08em}.runtime-bridge form{display:grid;grid-template-columns:1fr auto;gap:7px;padding:0 0 14px}.runtime-bridge label{display:grid;gap:4px}.runtime-bridge label:last-of-type{grid-column:1/-1}.runtime-bridge textarea{width:100%;min-height:64px;resize:vertical;border:1px solid #65655d;background:#0e0e0c;color:#fff;padding:8px;font:11px/1.4 inherit}.runtime-bridge button{align-self:end;min-height:44px;border:1px solid #c8ff4d;background:#c8ff4d;color:#151515;padding:8px 14px;font:700 11px/1 inherit;text-transform:uppercase}.runtime-bridge span{font-size:9px;text-transform:uppercase}@media(max-width:700px){body{padding:10px 10px 18px}.game-bar{align-items:flex-end}.game-stats{justify-content:flex-start}.hint{font-size:11px}}@media(prefers-reduced-motion:reduce){.transition{display:none}}
    .systems-hud{pointer-events:none;position:absolute;inset:12px 12px auto;z-index:3;display:grid;grid-template-columns:1fr auto;gap:8px;align-items:start}.systems-hud [data-hud-region]{display:flex;flex-wrap:wrap;gap:6px}.systems-hud [data-hud-region=secondary]{justify-content:flex-end}.systems-hud [data-hud-region=ticker]{grid-column:1/-1;justify-content:center}.systems-hud span{border:1px solid rgba(255,255,255,.52);background:rgba(28,29,29,.9);padding:6px 9px;color:#fff;font:700 11px/1.25 inherit;box-shadow:3px 3px 0 rgba(0,0,0,.32)}.choice-layer{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:clamp(12px,4vw,44px);background:rgba(12,13,14,.68)}.choice-layer[hidden]{display:none}.choice-card{width:min(100%,660px);max-height:100%;overflow:auto;border:2px solid #fff;background:#292b2d;color:#fff;padding:clamp(16px,4vw,30px);box-shadow:9px 9px 0 rgba(0,0,0,.5)}.choice-card h2{margin:0 0 10px;font:800 clamp(20px,4vw,34px)/1.05 inherit;letter-spacing:.02em}.choice-card p{margin:0;color:#deded8;font:500 14px/1.6 inherit;white-space:pre-wrap}.choice-options{display:grid;gap:8px;margin-top:20px}.choice-options button{min-height:48px;border:1px solid #fff;background:#3b3d3f;color:#fff;padding:10px 12px;text-align:left;cursor:pointer;font:700 13px/1.3 inherit}.choice-options button:hover:not(:disabled){background:#525558}.choice-options button:disabled{cursor:not-allowed;opacity:.45}.choice-options button:focus-visible{outline:3px solid #fff;outline-offset:3px}@media(max-width:700px){.systems-hud{inset:7px 7px auto}.systems-hud [data-hud-region=secondary]{justify-content:flex-start}.choice-layer{align-items:end;padding:10px}.choice-card{max-height:78%;box-shadow:5px 5px 0 rgba(0,0,0,.5)}}
    .save-dialog{width:min(calc(100% - 24px),680px);max-height:calc(100% - 24px);overflow:auto;border:2px solid #303033;background:#d6d6d2;color:#202024;padding:0;box-shadow:10px 10px 0 rgba(0,0,0,.55);font:13px/1.45 inherit}.save-dialog::backdrop{background:rgba(8,8,10,.76)}.save-dialog form{display:grid;gap:12px;padding:20px}.save-dialog h2{margin:0;font:800 22px/1.1 inherit}.save-dialog p{margin:0;color:#4a4a50}.save-dialog textarea{width:100%;min-height:170px;resize:vertical;border:2px solid #3d3d42;background:#f2f2ef;color:#19191d;padding:10px;font:11px/1.4 inherit}.save-actions{display:flex;flex-wrap:wrap;gap:8px}.save-actions button{min-height:44px;border:2px solid #3d3d42;background:#3d3d42;color:#fff;padding:8px 12px;cursor:pointer;font:700 11px/1 inherit;text-transform:uppercase}.save-actions button.secondary{background:transparent;color:#242428}.save-actions button:focus-visible,.save-dialog textarea:focus-visible{outline:3px solid #5b5cf0;outline-offset:2px}.save-status{min-height:1.5em;font-weight:700}.save-boundary{padding:10px;border-left:4px solid #5b5cf0;background:#e7e7e3}@media(max-width:700px){.save-dialog form{padding:14px}.save-dialog textarea{min-height:130px}}
    .shell-layer{position:absolute;inset:0;z-index:8;display:grid;place-items:center;padding:clamp(14px,5vw,52px);background:linear-gradient(145deg,rgba(18,18,20,.76),rgba(34,34,37,.94));backdrop-filter:blur(4px)}.shell-layer[hidden]{display:none}.shell-card{width:min(100%,650px);border:2px solid #e6e6e2;background:#d6d6d2;color:#202024;padding:clamp(20px,5vw,42px);box-shadow:12px 12px 0 rgba(0,0,0,.58)}.shell-card .shell-kicker{margin:0 0 8px;color:#5a5a60;font:800 11px/1.2 inherit;letter-spacing:.14em;text-transform:uppercase}.shell-card h1{margin:0;font:900 clamp(28px,7vw,64px)/.95 inherit;overflow-wrap:anywhere}.shell-card p{margin:14px 0 0;max-width:54ch;color:#48484d;font:600 clamp(13px,2vw,17px)/1.55 inherit;white-space:pre-wrap}.shell-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:24px}.shell-actions button,.shell-bar-button{min-height:44px;border:2px solid #3d3d42;background:#3d3d42;color:#fff;padding:9px 14px;cursor:pointer;font:800 12px/1 inherit;text-transform:uppercase}.shell-actions button.secondary{background:transparent;color:#242428}.shell-actions button:focus-visible,.shell-bar-button:focus-visible{outline:3px solid #fff;outline-offset:3px}.shell-settings-dialog{width:min(calc(100% - 24px),560px);max-height:calc(100% - 24px);overflow:auto;border:2px solid #303033;background:#d6d6d2;color:#202024;padding:0;box-shadow:10px 10px 0 rgba(0,0,0,.55);font:13px/1.45 inherit}.shell-settings-dialog::backdrop{background:rgba(8,8,10,.8)}.shell-settings-dialog form{display:grid;gap:15px;padding:20px}.shell-settings-dialog h2{margin:0;font:900 24px/1.1 inherit}.shell-setting{display:grid;grid-template-columns:minmax(130px,1fr) minmax(150px,1.4fr);gap:12px;align-items:center}.shell-setting input[type=range]{width:100%}.shell-setting select{min-height:44px;border:2px solid #3d3d42;background:#f2f2ef;color:#19191d;padding:7px;font:inherit}.shell-setting input:focus-visible,.shell-setting select:focus-visible,.shell-settings-dialog button:focus-visible{outline:3px solid #5b5cf0;outline-offset:2px}.shell-setting-output{font-weight:800}.shell-settings-dialog menu{display:flex;justify-content:flex-end;margin:0;padding:0}.shell-settings-dialog button{min-height:44px;border:2px solid #3d3d42;background:#3d3d42;color:#fff;padding:8px 14px;cursor:pointer;font:800 11px/1 inherit;text-transform:uppercase}.touch-controls{--looplab-touch-size:52px;grid-template-columns:repeat(3,var(--looplab-touch-size)) 1fr repeat(2,max(68px,var(--looplab-touch-size)))}@media(max-width:700px){.shell-layer{align-items:end;padding:10px}.shell-card{box-shadow:6px 6px 0 rgba(0,0,0,.58)}.shell-setting{grid-template-columns:1fr}.shell-settings-dialog form{padding:14px}}
  </style>
</head>
<body>
  <script id="${LOOPLAB_PROJECT_SCRIPT_ID}" type="application/json">${config}</script>
  <main class="game-shell">
    <div class="game-bar"><strong>${title}</strong><div class="game-stats"><span class="map-name" id="map-name">Map</span><span><span id="score">0</span> collected</span><span id="gameplay-state"></span><span class="runtime-status" id="runtime-status" role="status" aria-live="polite">Ready</span><button id="shell-pause" class="shell-bar-button" type="button">Pause</button><button id="shell-settings-toggle" class="shell-bar-button" type="button">Settings</button><button id="audio-toggle" type="button" aria-pressed="false">Sound: on</button><button id="save-toggle" type="button">Save</button><button id="reset" type="button">Reset</button></div></div>
    <div class="frame">
      <canvas id="game" width="${exportProject.width}" height="${exportProject.height}" tabindex="0" aria-label="${title} game canvas" aria-describedby="controls-hint"></canvas>
      <div class="systems-hud" id="systems-hud" aria-live="polite"><div id="systems-hud-primary" data-hud-region="primary"></div><div id="systems-hud-secondary" data-hud-region="secondary"></div><div id="systems-hud-ticker" data-hud-region="ticker"></div></div>
      <section class="choice-layer" id="choice-layer" role="dialog" aria-modal="true" aria-labelledby="choice-title" aria-describedby="choice-body" hidden>
        <div class="choice-card"><h2 id="choice-title"></h2><p id="choice-body"></p><div class="choice-options" id="choice-options"></div></div>
      </section>
      <section class="shell-layer" id="game-shell-layer" role="status" aria-live="polite" aria-atomic="true" aria-labelledby="game-shell-title" aria-describedby="game-shell-message" hidden>
        <div class="shell-card"><p class="shell-kicker" id="game-shell-kicker">Game</p><h1 id="game-shell-title"></h1><p id="game-shell-message"></p><div class="shell-actions"><button id="game-shell-primary" type="button">Play</button><button class="secondary" id="game-shell-restart" type="button">Restart</button><button class="secondary" id="game-shell-settings" type="button">Settings</button></div></div>
      </section>
      <div class="transition" id="transition"></div>
    </div>
    <div class="touch-controls" id="touch-controls" hidden aria-hidden="true" aria-label="Touch game controls"><button type="button" data-input="left" aria-label="Move left">←</button><button type="button" data-input="up" aria-label="Move up">↑</button><button type="button" data-input="down" aria-label="Move down">↓</button><button type="button" data-input="right" aria-label="Move right">→</button><button type="button" data-input="jump" aria-label="Jump">Jump</button><button type="button" data-input="interact" aria-label="Interact or enter portal">E / Lock</button></div>
    <p class="hint" id="controls-hint">${inputHint || "Move with arrow keys or WASD. Press E / Lock once to interact."}</p>
    <details class="runtime-bridge" id="looplab-runtime-bridge" data-ready="false" data-command-event="looplab:runtime-command" data-response-event="looplab:runtime-response">
      <summary>Headless runtime API</summary>
      <form id="looplab-runtime-form"><label><span>Command JSON</span><textarea id="looplab-runtime-command" aria-label="Looplab runtime command JSON" spellcheck="false">{"op":"get_state"}</textarea></label><button id="looplab-runtime-submit" type="button">Run command</button><label><span>Result JSON</span><textarea id="looplab-runtime-result" aria-label="Looplab runtime result JSON" readonly spellcheck="false"></textarea></label></form>
    </details>
    <dialog class="save-dialog" id="save-dialog" aria-labelledby="save-title" aria-describedby="save-boundary">
      <form method="dialog"><h2 id="save-title">Portable save</h2><p class="save-boundary" id="save-boundary">Save codes contain bounded gameplay progress for this exact game revision. They contain no account, provider, replay, camera, or collision-authoring data.</p><label for="save-code">Save code</label><textarea id="save-code" spellcheck="false" autocomplete="off" aria-describedby="save-status"></textarea><p class="save-status" id="save-status" role="status" aria-live="polite"></p><div class="save-actions"><button id="save-export" type="button">Generate code</button><button id="save-import" type="button">Restore code</button><button class="secondary" id="save-clear-hosted" type="button">Clear stored save</button><button class="secondary" id="save-close" type="submit">Close</button></div></form>
    </dialog>
    <dialog class="shell-settings-dialog" id="game-shell-settings-dialog" aria-labelledby="game-shell-settings-title">
      <form method="dialog"><h2 id="game-shell-settings-title">Game settings</h2><label class="shell-setting" id="game-shell-mute-row"><span>Sound</span><span><input id="game-shell-muted" type="checkbox"> <span>Mute audio</span></span></label><label class="shell-setting" id="game-shell-volume-row"><span>Volume</span><span><input id="game-shell-volume" type="range" min="0" max="1" step="0.05" value="0.55"> <output class="shell-setting-output" id="game-shell-volume-output">55%</output></span></label><label class="shell-setting" id="game-shell-motion-row"><span>Motion</span><select id="game-shell-motion"><option value="system">Use system setting</option><option value="reduce">Reduce motion</option><option value="full">Full motion</option></select></label><label class="shell-setting" id="game-shell-touch-row"><span>Touch control size</span><span><input id="game-shell-touch-size" type="range" min="44" max="80" step="2" value="52"> <output class="shell-setting-output" id="game-shell-touch-output">52px</output></span></label><menu><button id="game-shell-settings-close" type="submit">Back</button></menu></form>
    </dialog>
  </main>
${embeddedStorageScript}${embeddedEngineScript}  <script>
    const project=JSON.parse(document.getElementById('${LOOPLAB_PROJECT_SCRIPT_ID}').textContent);
    const projectSourceDigest='${doctor.sourceDigest}';
    const runtimeFramework=${serializeProjectMetadata(runtimeFramework)};
    const pinnedRuntimeVendor=${pinnedRuntimeVendorConfig};
    const runtimeJoinPlan=${runtimeJoinConfig};
    const inputActionLiveness=${inputActionLivenessConfig};
    const completionReport=${completionReportConfig};
    const narrativeReport=${narrativeReportConfig};
    const presentationReport=${presentationReportConfig};
    const gameShellReport=${gameShellReportConfig};
    const saveReport=${saveReportConfig};
    ${runtimePrelude}
    const engine=createRuntimeModel(project);
    const saves=createSaveCodeRuntime(engine,{sourceDigest:projectSourceDigest,profile:saveReport.profile,program:project.saveProgram||null,hostedStorage:globalThis.__looplabHostedStorage||null});
    const displayCanvas=document.getElementById('game');
    const usesEngineSurface=runtimeFramework==='pixi'||runtimeFramework==='melon';
    const canvas=usesEngineSurface?Object.assign(document.createElement('canvas'),{width:displayCanvas.width,height:displayCanvas.height}):displayCanvas;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('LoopLab could not initialize its canonical Canvas 2D surface.');
    let primaryRuntime=null;
    const score=document.getElementById('score');
    const mapName=document.getElementById('map-name');
    const gameplayState=document.getElementById('gameplay-state');
    const runtimeStatus=document.getElementById('runtime-status');
    const audioToggle=document.getElementById('audio-toggle');
    const shellPause=document.getElementById('shell-pause');
    const shellSettingsToggle=document.getElementById('shell-settings-toggle');
    const shellLayer=document.getElementById('game-shell-layer');
    const shellKicker=document.getElementById('game-shell-kicker');
    const shellTitle=document.getElementById('game-shell-title');
    const shellMessage=document.getElementById('game-shell-message');
    const shellPrimary=document.getElementById('game-shell-primary');
    const shellRestart=document.getElementById('game-shell-restart');
    const shellSettings=document.getElementById('game-shell-settings');
    const shellSettingsDialog=document.getElementById('game-shell-settings-dialog');
    const shellSettingsTitle=document.getElementById('game-shell-settings-title');
    const shellMuted=document.getElementById('game-shell-muted');
    const shellVolume=document.getElementById('game-shell-volume');
    const shellVolumeOutput=document.getElementById('game-shell-volume-output');
    const shellMotion=document.getElementById('game-shell-motion');
    const shellTouchSize=document.getElementById('game-shell-touch-size');
    const shellTouchOutput=document.getElementById('game-shell-touch-output');
    const shellMuteRow=document.getElementById('game-shell-mute-row');
    const shellVolumeRow=document.getElementById('game-shell-volume-row');
    const shellMotionRow=document.getElementById('game-shell-motion-row');
    const shellTouchRow=document.getElementById('game-shell-touch-row');
    const saveToggle=document.getElementById('save-toggle');
    const saveDialog=document.getElementById('save-dialog');
    const saveCode=document.getElementById('save-code');
    const saveStatus=document.getElementById('save-status');
    const saveClearHosted=document.getElementById('save-clear-hosted');
    const transition=document.getElementById('transition');
    const systemsHud=document.getElementById('systems-hud');
    const hudRegions=new Map([['primary',document.getElementById('systems-hud-primary')],['secondary',document.getElementById('systems-hud-secondary')],['ticker',document.getElementById('systems-hud-ticker')]]);
    const choiceLayer=document.getElementById('choice-layer');
    const choiceTitle=document.getElementById('choice-title');
    const choiceBody=document.getElementById('choice-body');
    const choiceOptions=document.getElementById('choice-options');
    const assets=new Map((project.assets||[]).map(function(asset){return [asset.id,asset]}));
    const assetImages=new Map();
    const heldInputs=new Set();
    let gamepadInputs=new Set();
    let last=performance.now();
    let transitionAlpha=0;
    const FIXED_STEP=1/60;
    const MAX_CATCH_UP_STEPS=5;
    let accumulator=0;
    let fixedStepCount=0;
    let droppedCatchUpEvents=0;
    let longFrames=0;
    let currentFrameMs=0;
    let visualTick=0;
    let choiceUiSignature='';
    let tileRuntimeCache={key:null,value:null};
    function presentationPoint(event,target){const state=engine.getState();if(target==='center')return{x:canvas.width/2,y:canvas.height/2,objectId:null};const requestedId=target==='player'?state.player?.id:event?.objectId;const object=engine.getObjects().find(function(candidate){return candidate.id===requestedId})||engine.getObjects().find(function(candidate){return candidate.kind==='player'});if(!object)return{x:canvas.width/2,y:canvas.height/2,objectId:null};const placement=objectPlacement(object);return{x:placement.x+Number(object.width||0)/2,y:placement.y+Number(object.height||0),objectId:object.id}}
    function presentationProjectPoint(point){return projectedPoint(point)}
    function presentationSnapshot(){const state=engine.getState();const objects=engine.getObjects().map(function(object){const placement=objectPlacement(object);return Object.assign({},object,{screenX:placement.x+Number(object.width||0)/2,screenY:placement.y+Number(object.height||0)})});let screenBounds={x:0,y:0,width:Number(state.width||canvas.width),height:Number(state.height||canvas.height)};if(activeProjection().type==='dimetric-2:1'){const corners=[projectedPoint({x:0,y:0,z:0}),projectedPoint({x:Number(state.width||0),y:0,z:0}),projectedPoint({x:Number(state.width||0),y:Number(state.height||0),z:0}),projectedPoint({x:0,y:Number(state.height||0),z:0})];const xs=corners.map(function(point){return Number(point.x||0)});const ys=corners.map(function(point){return Number(point.y||0)});const minX=Math.min.apply(Math,xs);const minY=Math.min.apply(Math,ys);screenBounds={x:minX,y:minY,width:Math.max(1,Math.max.apply(Math,xs)-minX),height:Math.max(1,Math.max.apply(Math,ys)-minY)}}return{mapId:state.activeMapId,width:Number(state.width||canvas.width),height:Number(state.height||canvas.height),objects:objects,activeActionIds:state.deterministicState?.activeActionIds||[],screenBounds:screenBounds}}
    function presentationAssetFrame(assetId,requestedFrame){const asset=assets.get(assetId);const image=asset&&assetImages.get(asset.id);if(!asset||!image||!image.complete||!image.naturalWidth)return null;const frame=Math.max(0,Math.min(Number(asset.frames||1)-1,Number(requestedFrame||0)));const columns=Math.max(1,Number(asset.columns||1));const sw=Number(asset.frameWidth||image.naturalWidth||1);const sh=Number(asset.frameHeight||image.naturalHeight||1);return{image:image,sx:(frame%columns)*sw,sy:Math.floor(frame/columns)*sh,sw:sw,sh:sh}}
    const presentation=createPresentationRuntime(project.presentationProgram,{host:globalThis,document:document,width:canvas.width,height:canvas.height,resources:project.resources||[],getPoint:presentationPoint,getSnapshot:presentationSnapshot,projectPoint:presentationProjectPoint,getAssetFrame:presentationAssetFrame});
    const gameShell=createGameShellRuntime(project.gameShell,{host:globalThis,getGameState:function(){return engine.getState()},getGameplayState:function(){return engine.getGameplayState()},getCombatState:function(){return engine.getCombatState()},releaseInputs:releaseInputs,suspendPresentation:function(){void presentation.suspend().then(syncAudioToggle)},resumePresentation:function(){void presentation.resume().then(syncAudioToggle)},resetSimulation:resetSimulationOnly,resetPresentation:function(){presentation.reset()},setMuted:function(value){presentation.setMuted(value)},setVolume:function(value){presentation.setMasterVolume(value)},setReducedMotion:function(value){presentation.setReducedMotion(value)},setTouchControlSize:function(value){document.getElementById('touch-controls')?.style?.setProperty?.('--looplab-touch-size',String(value)+'px')},openSettingsDialog:function(){if(!shellSettingsDialog.open)shellSettingsDialog.showModal()},closeSettingsDialog:function(){if(shellSettingsDialog.open)shellSettingsDialog.close()},focusTarget:function(state){queueMicrotask(function(){if(state==='playing')displayCanvas.focus();else shellPrimary.focus()})},onChange:syncShellUi});
    const frameSamples=[];
    (project.assets||[]).forEach(function(asset){const image=new Image();image.src=asset.dataUrl;assetImages.set(asset.id,image)});

    function syncSystemsUi(){
      const hud=engine.getHudState();
      hudRegions.forEach(function(region){region.textContent=''});
      hud.forEach(function(binding){const region=hudRegions.get(binding.region)||hudRegions.get('primary');const value=document.createElement('span');value.textContent=binding.text;value.setAttribute('aria-label',binding.ariaLabel);region.append(value)});
      systemsHud.hidden=hud.length===0;
      const choice=engine.getChoiceState();
      const signature=JSON.stringify(choice);
      if(signature===choiceUiSignature)return;
      choiceUiSignature=signature;
      if(!choice){choiceLayer.hidden=true;choiceLayer.inert=true;choiceTitle.textContent='';choiceBody.textContent='';choiceOptions.textContent='';return}
      choiceLayer.hidden=false;choiceLayer.inert=false;choiceLayer.setAttribute('aria-modal',String(choice.modal!==false));choiceTitle.textContent=choice.title;choiceBody.textContent=choice.body;choiceOptions.textContent='';
      let firstEnabledButton=null;
      choice.choices.forEach(function(choiceOption){const button=document.createElement('button');button.type='button';button.textContent=choiceOption.label;button.disabled=!choiceOption.enabled;if(!button.disabled&&!firstEnabledButton)firstEnabledButton=button;button.dataset.choiceId=choiceOption.id;button.dataset.actionId=choiceOption.actionId;button.addEventListener('click',function(){if(engine.chooseChoice(choiceOption.id)){announce('Choice queued: '+choiceOption.label);syncUi()}});choiceOptions.append(button)});
      queueMicrotask(function(){firstEnabledButton?.focus?.()});
    }
    function resizeRuntimeSurfaces(width,height){
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}
      if(runtimeFramework==='phaser'&&primaryRuntime?.scale?.resize)primaryRuntime.scale.resize(width,height);
      else if(runtimeFramework==='pixi'&&primaryRuntime?.renderer?.resize){primaryRuntime.renderer.resize(width,height);if(primaryRuntime.__looplabTexture?.source?.resize)primaryRuntime.__looplabTexture.source.resize(width,height);if(primaryRuntime.__looplabSprite){primaryRuntime.__looplabSprite.width=width;primaryRuntime.__looplabSprite.height=height}}
      else if(runtimeFramework==='melon'&&primaryRuntime?.renderer?.resize){primaryRuntime.renderer.resize(width,height);primaryRuntime.world?.resize?.(width,height);primaryRuntime.viewport?.resize?.(width,height);primaryRuntime.__looplabSurface?.resize?.(width,height)}
      else if(displayCanvas.width!==width||displayCanvas.height!==height){displayCanvas.width=width;displayCanvas.height=height}
    }
    function syncUi(){const state=engine.getState();if(canvas.width!==state.width||canvas.height!==state.height||displayCanvas.width!==state.width||displayCanvas.height!==state.height)resizeRuntimeSurfaces(state.width,state.height);score.textContent=String(state.collectedCount);mapName.textContent=state.mapName||state.activeMapId;const explicitHud=(project.gameplayProgram?.hudBindings||[]).length>0;const visible=explicitHud?[]:(project.gameplayProgram?.variables||[]).filter(function(variable){return variable.visible===true}).map(function(variable){return (variable.label||variable.id)+': '+String(state.variables?.[variable.id]??'')});gameplayState.textContent=visible.join(' · ');gameplayState.hidden=visible.length===0;displayCanvas.setAttribute('aria-label','${title} — '+(state.mapName||state.activeMapId));syncSystemsUi();syncShellUi()}
    function announce(message){runtimeStatus.textContent=message}
    function syncSaveUi(message){const status=saves.getStatus();saveToggle.hidden=!status.enabled;saveToggle.setAttribute('aria-expanded',String(saveDialog.open));saveClearHosted.hidden=!status.hosted.configured;if(message!==undefined)saveStatus.textContent=message;else if(status.lastError)saveStatus.textContent=status.lastError;else if(status.hosted.configured&&status.hosted.state==='unavailable')saveStatus.textContent='Browser storage is unavailable here. Portable codes still work.';else saveStatus.textContent=status.profile==='hosted'?'Hosted persistence is optional; this code remains the portable fallback.':'This strict one-file build stores nothing automatically.'}
    function syncShellUi(){const state=gameShell.getState();const shell=project.gameShell||{};const labels=shell.labels||{};const active=state.enabled===true;const terminal=state.state==='won'||state.state==='lost';shellPause.hidden=!active||!['playing','paused'].includes(state.state);shellPause.textContent=state.state==='paused'?(labels.resume||'Resume'):(labels.pause||'Pause');shellPause.setAttribute('aria-pressed',String(state.state==='paused'));shellSettingsToggle.hidden=!active||shell.settings?.enabled===false;shellSettingsToggle.textContent=labels.settings||'Settings';shellLayer.hidden=!active||state.state==='playing';shellLayer.inert=shellLayer.hidden;shellKicker.textContent=state.state==='title'?'Ready':state.state==='paused'?'Paused':state.state==='won'?'Complete':'Run ended';shellTitle.textContent=state.state==='title'?(labels.gameTitle||project.name):state.state==='paused'?(labels.pause||'Paused'):state.state==='won'?(labels.winTitle||'Victory'):(labels.loseTitle||'Game over');shellMessage.textContent=state.state==='title'?(labels.tagline||'A LoopLab game'):state.state==='paused'?(state.pauseCause==='visibility'?'The game paused when the page was hidden. Resume when ready.':state.pauseCause==='blur'?'The game paused when the window lost focus. Resume when ready.':'Your progress is held until you resume.'):state.state==='won'?(labels.winMessage||'You completed the game.'):(labels.loseMessage||'The run has ended.');shellPrimary.textContent=state.state==='title'?(labels.play||'Play'):state.state==='paused'?(labels.resume||'Resume'):(labels.restart||'Restart');shellRestart.textContent=labels.restart||'Restart';shellRestart.hidden=state.state==='title';shellSettings.textContent=labels.settings||'Settings';shellSettings.hidden=shell.settings?.enabled===false;shellSettingsTitle.textContent=labels.settingsTitle||'Game settings';shellMuteRow.hidden=shell.settings?.audio===false;shellVolumeRow.hidden=shell.settings?.audio===false;shellMotionRow.hidden=shell.settings?.reducedMotion===false;shellTouchRow.hidden=shell.settings?.touchControlSize===false;shellMuted.checked=state.preferences.muted;shellVolume.value=String(state.preferences.volume);shellVolumeOutput.value=Math.round(state.preferences.volume*100)+'%';shellVolumeOutput.textContent=shellVolumeOutput.value;shellMotion.value=state.preferences.reducedMotion;shellTouchSize.value=String(state.preferences.touchControlSize);shellTouchOutput.value=String(state.preferences.touchControlSize)+'px';shellTouchOutput.textContent=shellTouchOutput.value;displayCanvas.inert=state.simulationBlocked;choiceLayer.inert=state.simulationBlocked||choiceLayer.hidden;document.getElementById('touch-controls')?.style?.setProperty?.('--looplab-touch-size',String(state.preferences.touchControlSize)+'px');if(!active&&shellSettingsDialog.open)shellSettingsDialog.close();if(terminal)announce(state.state==='won'?'Game complete':'Game over');if(typeof syncTouchControls==='function')syncTouchControls()}
    function generatePortableSave(){try{const code=saves.exportCode();saveCode.value=code;saveCode.focus();saveCode.select();syncSaveUi('Save code generated. Copy it somewhere safe.');return{ok:true,code:code,status:saves.getStatus()}}catch(error){syncSaveUi(error instanceof Error?error.message:String(error));return{ok:false,error:error instanceof Error?error.message:String(error),status:saves.getStatus()}}}
    function applyPortableSave(code){const result=saves.importCode(String(code||''));if(result.ok){releaseInputs();presentation.reset();handleEvents(engine.drainEvents(),{autoSave:false});syncUi();draw();announce('Save restored')}syncSaveUi(result.ok?'Save restored for this game revision.':result.error);return result}
    function openSaveDialog(){if(!saves.getStatus().enabled)return;if(gameShell.getState().state==='playing')gameShell.pause('user');if(!saveCode.value)generatePortableSave();syncSaveUi();saveDialog.showModal();saveToggle.setAttribute('aria-expanded','true');queueMicrotask(function(){saveCode.focus();saveCode.select()})}
    function handleEvents(events,eventOptions={}){presentation.handleEvents(events);const persisted=saves.handleEvents(events,eventOptions);if(persisted&&!persisted.ok)syncSaveUi();events.forEach(function(event){if(event.type==='coin.collected')announce('Collected '+event.count);if(event.type==='player.respawned')announce('Respawned');if(event.type==='goal.reached')announce('Goal reached');if(event.type==='gameplay.rule-fired')announce('State changed: '+event.ruleId);if(event.type==='traversal.started')announce('Locked onto '+event.pathId);if(event.type==='traversal.completed')announce('Traversal complete');if(event.type==='traversal.bailed')announce('Traversal released');if(event.type==='choice.opened')announce('Decision ready');if(event.type==='choice.selected')announce('Selected '+event.choiceId);if(event.type==='clock.advanced')announce((event.clockId||'Clock')+' '+String(event.value));if(event.type==='gameplay.expression-fault')announce('Formula fault: '+event.fault);if(event.type==='projectile.hit')announce('Hit '+(event.actorId||event.objectId));if(event.type==='projectile.overflow')announce('Projectile pool full: '+event.emitterId);if(event.type==='health.depleted')announce('Defeated '+(event.actorId||event.objectId));if(event.type==='map.changed'){announce('Entered '+event.mapName);if(event.transition!=='instant')transitionAlpha=1}});gameShell.sync();syncUi()}
    function rounded(x,y,width,height,radius){ctx.beginPath();if(typeof ctx.roundRect==='function')ctx.roundRect(x,y,width,height,radius);else ctx.rect(x,y,width,height);ctx.fill()}
    function activeProjection(){const state=engine.getState();return normalizeProjection(state.projection||{type:'orthographic',tileWidth:20,tileHeight:20},state)}
    function projectedPoint(point){const projection=activeProjection();return projection.type==='dimetric-2:1'?worldToScreen({x:Number(point.x||0),y:Number(point.y||0),z:Number(point.z||0)},projection):{x:Number(point.x||0),y:Number(point.y||0)}}
    function objectPlacement(object){const projection=activeProjection();if(projection.type!=='dimetric-2:1')return{x:Number(object.x||0),y:Number(object.y||0)};const anchorX=Number(object.groundAnchor?.offsetX??Number(object.width||0)/2);const anchorY=Number(object.groundAnchor?.offsetY??object.height??0);const screen=worldToScreen({x:Number(object.x||0)+anchorX,y:Number(object.y||0)+anchorY,z:Number(object.z||0)},projection);return{x:screen.x-anchorX,y:screen.y-anchorY}}
    function activeCameraTransform(){const base=presentation.getCameraTransform();const state=engine.getState();const stream=state.worldStream;if(!stream?.present)return base;const player=engine.getObjects().find(function(object){return object.kind==='player'});if(!player)return base;const projection=activeProjection();const center=projection.type==='dimetric-2:1'?worldToScreen({x:Number(player.x||0)+Number(player.width||0)/2,y:Number(player.y||0)+Number(player.height||0)/2,z:Number(player.z||0)},projection):{x:Number(player.x||0)+Number(player.width||0)/2,y:Number(player.y||0)+Number(player.height||0)/2};const zoom=Number(base.zoom||1);let x=Number(base.x||0);let y=Number(base.y||0);if(projection.type==='dimetric-2:1'){x+=canvas.width/2-center.x*zoom;y+=canvas.height/2-center.y*zoom;return{x:x,y:y,zoom:zoom}}const bounds=state.worldBounds||{minX:0,minY:0,maxX:state.width,maxY:state.height};const bounded=function(value,minimum,maximum){return minimum<=maximum?Math.min(maximum,Math.max(minimum,value)):(minimum+maximum)/2};if(stream.axis==='horizontal'){const follow=canvas.width/2-center.x*zoom;x+=bounded(follow,canvas.width-Number(bounds.maxX||0)*zoom,-Number(bounds.minX||0)*zoom)}else{const follow=canvas.height/2-center.y*zoom;y+=bounded(follow,canvas.height-Number(bounds.maxY||0)*zoom,-Number(bounds.minY||0)*zoom)}return{x:x,y:y,zoom:zoom}}
    function drawTraversalPaths(){const active=engine.getState().activeTraversalPathId;ctx.save();(engine.getTraversalPaths()||[]).forEach(function(path){if(!active||path.id!==active||!path.points||path.points.length<2)return;const points=path.points.map(projectedPoint);ctx.strokeStyle='#c8ff4d';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);points.slice(1).forEach(function(point){ctx.lineTo(point.x,point.y)});ctx.stroke()});ctx.restore()}
    function drawPrimitive(object){ctx.fillStyle=object.color||'#888';if(object.kind==='coin'){ctx.beginPath();ctx.arc(object.x+object.width/2,object.y+object.height/2,Math.min(object.width,object.height)/2,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#25251e';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle='rgba(255,255,255,.55)';ctx.fillRect(object.x+object.width*.32,object.y+object.height*.2,4,7)}else if(object.kind==='hazard'){const count=Math.max(1,Math.round(object.width/24));ctx.beginPath();ctx.moveTo(object.x,object.y+object.height);for(let index=0;index<count;index+=1){const x=object.x+index*(object.width/count);ctx.lineTo(x+object.width/count/2,object.y);ctx.lineTo(x+object.width/count,object.y+object.height)}ctx.closePath();ctx.fill()}else if(object.kind==='spawn'){ctx.globalAlpha=.62;ctx.strokeStyle=object.color;ctx.lineWidth=3;ctx.strokeRect(object.x+5,object.y+5,object.width-10,object.height-5);ctx.globalAlpha=1}else if(object.kind==='portal'){rounded(object.x,object.y,object.width,object.height,Math.min(12,object.width/3));ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=3;ctx.strokeRect(object.x+8,object.y+8,object.width-16,object.height-12)}else if(object.kind==='goal'){ctx.fillRect(object.x+5,object.y,4,object.height);ctx.beginPath();ctx.moveTo(object.x+9,object.y+4);ctx.lineTo(object.x+object.width,object.y+14);ctx.lineTo(object.x+9,object.y+26);ctx.closePath();ctx.fill()}else{rounded(object.x,object.y,object.width,object.height,object.kind==='player'?9:4);if(object.kind==='player'){ctx.fillStyle='#fff';ctx.fillRect(object.x+object.width*.22,object.y+object.height*.25,7,8);ctx.fillRect(object.x+object.width*.62,object.y+object.height*.25,7,8);ctx.fillStyle='#24241f';ctx.fillRect(object.x+object.width*.25,object.y+object.height*.28,3,4);ctx.fillRect(object.x+object.width*.65,object.y+object.height*.28,3,4)}if(object.kind==='platform'){ctx.fillStyle='rgba(255,255,255,.35)';ctx.fillRect(object.x,object.y,object.width,5)}}}
    function sliceBounds(object,slice,asset){if(!slice)return null;const sourceTotal=Math.max(1,Number(asset?.frameHeight||object.height));const sourceY=Math.max(0,Math.min(sourceTotal,Number(slice.sourceY||0)));const sourceHeight=Math.max(0,Math.min(sourceTotal-sourceY,Number(slice.height||sourceTotal)));return {sourceY:sourceY,sourceHeight:sourceHeight,destinationY:object.y+(sourceY/sourceTotal)*object.height,destinationHeight:(sourceHeight/sourceTotal)*object.height}}
    function drawDimetricPlatform(object){const projection=activeProjection();const z=Number(object.z||0);const points=[projectedPoint({x:object.x,y:object.y,z:z}),projectedPoint({x:Number(object.x)+Number(object.width),y:object.y,z:z}),projectedPoint({x:Number(object.x)+Number(object.width),y:Number(object.y)+Number(object.height),z:z}),projectedPoint({x:object.x,y:Number(object.y)+Number(object.height),z:z})];ctx.fillStyle=object.color||'#555';ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);points.slice(1).forEach(function(point){ctx.lineTo(point.x,point.y)});ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(255,255,255,.28)';ctx.lineWidth=2;ctx.stroke();if(Number(object.collisionHeight||0)>0){const drop=Math.max(5,Number(projection.elevationStep||32)*Math.min(1,Number(object.collisionHeight||1)));ctx.fillStyle='rgba(20,20,24,.34)';ctx.beginPath();ctx.moveTo(points[2].x,points[2].y);ctx.lineTo(points[3].x,points[3].y);ctx.lineTo(points[3].x,points[3].y+drop);ctx.lineTo(points[2].x,points[2].y+drop);ctx.closePath();ctx.fill()}}
    function drawObject(object,slice){ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,Number(object.opacity??1)));const animationFrame=presentation.getAnimationFrame(object.id,object.assetId,object.assetFrame);const selectedAssetId=animationFrame.assetId||object.assetId;const asset=selectedAssetId&&assets.get(selectedAssetId);const image=asset&&assetImages.get(asset.id);if(!asset&&activeProjection().type==='dimetric-2:1'&&object.kind==='platform'){drawDimetricPlatform(object);ctx.restore();return}const placement=objectPlacement(object);ctx.translate(placement.x-Number(object.x||0),placement.y-Number(object.y||0));const feedbackTransform=presentation.getObjectTransform(object.id);if(feedbackTransform.scaleX!==1||feedbackTransform.scaleY!==1){const anchorX=Number(object.x||0)+Number(object.width||0)/2;const anchorY=Number(object.y||0)+Number(object.height||0);ctx.translate(anchorX,anchorY);ctx.scale(feedbackTransform.scaleX,feedbackTransform.scaleY);ctx.translate(-anchorX,-anchorY)}const bounds=sliceBounds(object,slice,asset);if(bounds){ctx.beginPath();ctx.rect(object.x,bounds.destinationY,object.width,bounds.destinationHeight);ctx.clip()}if(asset&&image&&image.complete&&image.naturalWidth){let requested=animationFrame.frame??object.assetFrame??0;if(asset.frames>1&&object.kind==='coin'&&!animationFrame.machineId)requested=Math.floor(visualTick/8)%asset.frames;if(asset.frames>1&&object.kind==='player'&&!animationFrame.machineId){const state=engine.getState();requested=state.activeTraversalPathId?Math.min(3,asset.frames-1):Math.abs(Number(object.vy||0))>48?Math.min(2,asset.frames-1):Math.abs(Number(object.vx||0))>18?Math.min(Math.floor(visualTick/8)%2,asset.frames-1):0}const frame=Math.max(0,Math.min(asset.frames-1,requested));const columns=Math.max(1,asset.columns||1);const sx=(frame%columns)*asset.frameWidth;const sy=Math.floor(frame/columns)*asset.frameHeight;if(bounds)ctx.drawImage(image,sx,sy+bounds.sourceY,asset.frameWidth,bounds.sourceHeight,object.x,bounds.destinationY,object.width,bounds.destinationHeight);else ctx.drawImage(image,sx,sy,asset.frameWidth,asset.frameHeight,object.x,object.y,object.width,object.height)}else drawPrimitive(object);ctx.restore()}
    function activeTileRuntime(){const state=engine.getState();const key=state.activeMapId+':'+String(state.worldStream?.activationSequence||0);if(tileRuntimeCache.key!==key){tileRuntimeCache={key:key,value:engine.getTileRuntime()}}return tileRuntimeCache.value}
    function drawTile(entry){const asset=assets.get(entry.assetId);const image=asset&&assetImages.get(asset.id);if(!asset||!image||!image.complete||!image.naturalWidth)return false;const projection=activeProjection();const anchorPoint=projection.type==='dimetric-2:1'?worldToScreen({x:entry.worldX,y:entry.worldY,z:entry.z},projection):{x:entry.worldX,y:entry.worldY};const width=Number(entry.destinationWidth||asset.frameWidth||1);const height=Number(entry.destinationHeight||asset.frameHeight||1);const anchor=entry.anchor||'top-left';const anchorX=anchor==='bottom-center'||anchor==='center'?width/2:0;const anchorY=anchor==='bottom-left'||anchor==='bottom-center'?height:anchor==='center'?height/2:0;const x=Math.round(anchorPoint.x-anchorX+Number(entry.drawOffsetX||0));const y=Math.round(anchorPoint.y-anchorY+Number(entry.drawOffsetY||0));const camera=activeCameraTransform();if((x+width)*camera.zoom+camera.x<0||(y+height)*camera.zoom+camera.y<0||x*camera.zoom+camera.x>canvas.width||y*camera.zoom+camera.y>canvas.height)return false;const frame=Math.max(0,Math.min(Number(asset.frames||1)-1,Number(entry.frame||0)));const columns=Math.max(1,Number(asset.columns||1));const sx=(frame%columns)*Number(asset.frameWidth||width);const sy=Math.floor(frame/columns)*Number(asset.frameHeight||height);ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,Number(entry.opacity??1)));ctx.globalCompositeOperation=entry.blendMode==='normal'?'source-over':entry.blendMode||'source-over';ctx.translate(x,y);if(entry.flipD)ctx.transform(0,height/width,width/height,0,0,0);if(entry.flipH){ctx.translate(width,0);ctx.scale(-1,1)}if(entry.flipV){ctx.translate(0,height);ctx.scale(1,-1)}ctx.drawImage(image,sx,sy,Number(asset.frameWidth||width),Number(asset.frameHeight||height),0,0,width,height);ctx.restore();return true}
    function draw(){visualTick+=1;const state=engine.getState();ctx.fillStyle=state.background||'#111';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;const camera=activeCameraTransform();ctx.save();ctx.translate(camera.x,camera.y);ctx.scale(camera.zoom,camera.zoom);const tileEntries=activeTileRuntime().visualEntries||[];let drawnTileCount=0;const paintTile=function(entry){if(drawTile(entry))drawnTileCount+=1};tileEntries.filter(function(entry){return entry.role==='ground-static'}).forEach(paintTile);drawTraversalPaths();const interleaved=[...engine.renderEntries().map(function(entry){return{kind:'object',id:entry.object.id,depth:entry.depth,entry:entry}}),...tileEntries.filter(function(entry){return entry.role==='interleaved'}).map(function(entry){return{kind:'tile',id:entry.id,depth:entry.depth,entry:entry}})].sort(function(first,second){return first.depth-second.depth||String(first.id).localeCompare(String(second.id))});interleaved.forEach(function(item){if(item.kind==='tile')paintTile(item.entry);else drawObject(item.entry.object,item.entry.slice)});tileEntries.filter(function(entry){return entry.role==='foreground'}).forEach(paintTile);presentation.drawWorld(ctx);ctx.restore();presentation.drawOverlay(ctx,canvas.width,canvas.height);if(state.worldStream?.present){const required=state.worldStream.requiredAssetIds||[];const ready=required.filter(function(id){const image=assetImages.get(id);return Boolean(image&&image.complete&&image.naturalWidth)});engine.markWorldStreamDraw({readyAssetIds:ready,drawnTileCount:drawnTileCount,visibleTileCount:drawnTileCount,timestamp:performance.now(),completed:ready.length===required.length&&drawnTileCount>0})}transitionAlpha=Math.max(0,transitionAlpha-.08);transition.style.opacity=String(transitionAlpha)}
    function releaseInputs(){heldInputs.forEach(function(code){engine.setInput(code,false)});heldInputs.clear()}
    function setInput(code,pressed){engine.setInput(code,pressed);if(pressed)heldInputs.add(code);else heldInputs.delete(code)}
    function syncGamepadInputs(){const canPoll=!gameShell.getState().simulationBlocked&&!document.hidden&&(!document.hasFocus||document.hasFocus())&&typeof navigator.getGamepads==='function';const next=new Set(canPoll?readGamepadInputCodes(navigator.getGamepads()):[]);gamepadInputs.forEach(function(code){if(!next.has(code))setInput(code,false)});next.forEach(function(code){setInput(code,true)});gamepadInputs=next}
    function recordFrame(ms){currentFrameMs=ms;frameSamples.push(ms);if(frameSamples.length>240)frameSamples.shift();if(ms>50)longFrames+=1}
    function advanceFixed(seconds){const events=[];accumulator+=Math.max(0,Math.min(Number(seconds||0),.25));let steps=0;while(accumulator>=FIXED_STEP&&steps<MAX_CATCH_UP_STEPS){events.push.apply(events,engine.update(FIXED_STEP));accumulator-=FIXED_STEP;fixedStepCount+=1;steps+=1}if(accumulator>=FIXED_STEP){droppedCatchUpEvents+=1;accumulator%=FIXED_STEP}return events}
    function stepExact(milliseconds){let remaining=Math.max(0,Math.min(1000,Number(milliseconds||0)))/1000;const events=[];while(remaining>.000001){const step=Math.min(remaining,FIXED_STEP);events.push.apply(events,engine.update(step));remaining-=step;fixedStepCount+=1}return events}
    function getPerformance(){const sorted=frameSamples.slice().sort(function(a,b){return a-b});const index=Math.max(0,Math.ceil(sorted.length*.95)-1);return {currentFrameMs:currentFrameMs,p95FrameMs:sorted[index]||0,fixedStepCount:fixedStepCount,droppedCatchUpEvents:droppedCatchUpEvents,longFrames:longFrames,fixedStepHz:60,maximumCatchUpSteps:MAX_CATCH_UP_STEPS}}
    function frame(now,scheduleNext=true,providedElapsedMs=null){const elapsedMs=Math.max(0,providedElapsedMs??(now-last));last=now;recordFrame(elapsedMs);syncGamepadInputs();if(!gameShell.getState().simulationBlocked&&!document.hidden){const emitted=advanceFixed(elapsedMs/1000);handleEvents(emitted);presentation.update(elapsedMs)}if(scheduleNext){draw();requestAnimationFrame(frame)}}
    function assertLoadedRuntimeVersion(loadedVersion){if(!pinnedRuntimeVendor||String(loadedVersion||'')===String(pinnedRuntimeVendor.version))return;throw new Error('The loaded '+pinnedRuntimeVendor.id+' runtime version '+String(loadedVersion||'(missing)')+' does not match pinned '+pinnedRuntimeVendor.version+'.')}
    async function bootPrimaryRuntime(){
      if(runtimeFramework==='canvas'){requestAnimationFrame(frame);return}
      if(runtimeFramework==='phaser'){
        if(typeof globalThis.Phaser!=='object'||typeof globalThis.Phaser.Game!=='function')throw new Error('The pinned Phaser browser runtime did not initialize.');
        assertLoadedRuntimeVersion(globalThis.Phaser.VERSION);
        class LoopLabGameplayScene extends globalThis.Phaser.Scene{constructor(){super({key:'LoopLabGameplay'})}create(){last=performance.now()}update(time,delta){frame(time,false,delta)}}
        primaryRuntime=new globalThis.Phaser.Game({type:globalThis.Phaser.CANVAS,width:canvas.width,height:canvas.height,canvas:canvas,context:ctx,transparent:false,backgroundColor:project.background||'#111',pixelArt:true,antialias:false,banner:false,audio:{noAudio:true},input:{keyboard:false,mouse:false,touch:false,gamepad:false},fps:{target:60},scene:[LoopLabGameplayScene]});
        primaryRuntime.events.on(globalThis.Phaser.Core.Events.POST_RENDER,draw);
        return;
      }
      if(runtimeFramework==='pixi'){
        const PIXI=globalThis.PIXI;
        if(!PIXI||typeof PIXI.Application!=='function'||typeof PIXI.Texture?.from!=='function')throw new Error('The pinned PixiJS browser runtime did not initialize.');
        assertLoadedRuntimeVersion(PIXI.VERSION);
        const application=new PIXI.Application();
        await application.init({canvas:displayCanvas,width:canvas.width,height:canvas.height,autoStart:false,preference:'webgl',antialias:false,background:project.background||'#111'});
        const texture=PIXI.Texture.from(canvas);
        if(texture.source)texture.source.scaleMode='nearest';
        const sprite=new PIXI.Sprite(texture);sprite.width=canvas.width;sprite.height=canvas.height;application.stage.addChild(sprite);
        application.__looplabTexture=texture;application.__looplabSprite=sprite;primaryRuntime=application;
        application.ticker.add(function(ticker){frame(performance.now(),false,ticker.deltaMS);draw();texture.source?.update?.()});
        last=performance.now();application.start();
        return;
      }
      if(runtimeFramework==='melon'){
        const melon=globalThis.LoopLabMelon;
        if(!melon||typeof melon.Application!=='function'||typeof melon.Camera2d!=='function'||typeof melon.Renderable!=='function'||typeof melon.Stage!=='function')throw new Error('The pinned melonJS browser runtime did not initialize.');
        assertLoadedRuntimeVersion(melon.version);
        melon.boot();
        primaryRuntime=new melon.Application(canvas.width,canvas.height,{parent:displayCanvas.parentElement,canvas:displayCanvas,renderer:melon.CANVAS,scale:1,scaleMethod:'manual',antiAlias:false,consoleHeader:false,physic:'none'});displayCanvas.parentElement.prepend(displayCanvas);
        class LoopLabSurface extends melon.Renderable{
          constructor(){super(0,0,canvas.width,canvas.height);this.anchorPoint.set(0,0);this.alwaysUpdate=true;this.floating=false}
          update(delta){frame(performance.now(),false,delta);return true}
          draw(renderer){draw();renderer.drawImage(canvas,0,0,canvas.width,canvas.height,0,0,canvas.width,canvas.height)}
        }
        class LoopLabStage extends melon.Stage{constructor(){super({cameras:[new melon.Camera2d(0,0,canvas.width,canvas.height)]})}onResetEvent(){const surface=new LoopLabSurface();primaryRuntime.__looplabSurface=surface;primaryRuntime.world.addChild(surface)}}
        melon.state.set(melon.state.PLAY,new LoopLabStage());last=performance.now();melon.state.change(melon.state.PLAY,true);
        return;
      }
      throw new Error('Unsupported LoopLab runtime adapter: '+runtimeFramework);
    }
    function resetSimulationOnly(){engine.reset();handleEvents(engine.drainEvents(),{autoSave:false});last=performance.now();accumulator=0;syncUi();announce('Reset — stored save unchanged');draw()}
    function reset(){return gameShell.restart()}
    function replayCanonicalize(value){if(Array.isArray(value))return value.map(replayCanonicalize);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(function(key){return [key,replayCanonicalize(value[key])]}))}
    function replayHash(value,hashVersion){const text=JSON.stringify(replayCanonicalize(value));if(Number(hashVersion)>=6)return 'replay-sha256-'+sha256Hex(text);let hash=2166136261;for(let index=0;index<text.length;index+=1){hash^=text.charCodeAt(index);hash=Math.imul(hash,16777619)}return 'replay-'+(hash>>>0).toString(16).padStart(8,'0')}
    function replayCompareIds(first,second){const firstId=String(first);const secondId=String(second);return firstId<secondId?-1:firstId>secondId?1:0}
    function replayLegacyMotionBody(state){return {schemaVersion:'looplab-motion-body-state/v1',mapId:state.mapId,objectId:state.objectId,pathId:state.pathId,progress:Number(state.progress||0),speed:Number(state.speed||0),direction:state.direction,engaged:Boolean(state.engaged),blocked:Boolean(state.blocked),blockerId:state.blockerId??null,blockerProgress:state.blockerProgress==null?null:Number(state.blockerProgress),completed:Boolean(state.completed),x:Number(state.x||0),y:Number(state.y||0),z:Number(state.z||0)}}
    function replayWorldStream(state){if(!state?.present)return{schemaVersion:'looplab-world-stream-runtime/v1',present:false,hostMapId:state?.hostMapId??null};return{schemaVersion:'looplab-world-stream-runtime/v1',present:true,enabled:state.enabled!==false,hostMapId:state.hostMapId,mode:state.mode,axis:state.axis,seed:state.seed,horizon:Number(state.horizon||0),routeDigest:state.routeDigest,currentOrdinal:Number(state.currentOrdinal||0),currentInstanceId:state.currentInstanceId??null,currentTemplateId:state.currentTemplateId??null,currentSourceMapId:state.currentSourceMapId??null,generatedInstanceCount:Number(state.generatedInstanceCount||0),residentInstanceIds:JSON.parse(JSON.stringify(state.residentInstanceIds??[])),residentRange:JSON.parse(JSON.stringify(state.residentRange??{start:0,end:-1})),worldBounds:JSON.parse(JSON.stringify(state.worldBounds??null)),activationSequence:Number(state.activationSequence||0),budget:JSON.parse(JSON.stringify(state.budget??null)),budgetPassed:Boolean(state.budgetPassed),contradiction:JSON.parse(JSON.stringify(state.contradiction??null)),choices:JSON.parse(JSON.stringify(state.choices??[]))}}
    const runtimeObjectStateKeys=${runtimeObjectStateKeys};
    function replaySnapshot(replayEngine,hashVersion){
      const state=replayEngine.getState();
      const common={activeMapId:state.activeMapId,collectedCount:Number(state.collectedCount??0),activeTraversalPathId:state.activeTraversalPathId??null,player:state.player?{id:state.player.id,x:Number(state.player.x??0),y:Number(state.player.y??0),z:Number(state.player.z??0),vx:Number(state.player.vx??0),vy:Number(state.player.vy??0),grounded:Boolean(state.player.grounded)}:null,won:Boolean(state.won)};
      if(Number(hashVersion)>=9&&common.player)common.player={...common.player,groundChainId:state.player.groundChainId??null,groundSegmentId:state.player.groundSegmentId??null,groundNormalX:Number(state.player.groundNormalX??0),groundNormalY:Number(state.player.groundNormalY??-1),slopeSliding:Boolean(state.player.slopeSliding)};
      if(Number(hashVersion)>=11&&common.player)common.player={...common.player,elevationTransitionId:state.player.elevationTransitionId??null,elevationSegmentId:state.player.elevationSegmentId??null,elevationProgress:Number(state.player.elevationProgress??0),elevationSupportZ:Number(state.player.elevationSupportZ??state.player.z??0)};
      if(Number(hashVersion??1)===1)return {...common,objects:replayEngine.getObjects().map(function(object){return {id:String(object.id??''),kind:String(object.kind??''),x:Number(object.x??0),y:Number(object.y??0),z:Number(object.z??0),vx:Number(object.vx??0),vy:Number(object.vy??0),grounded:Boolean(object.grounded),collected:Boolean(object.collected)}}).sort(function(first,second){return replayCompareIds(first.id,second.id)})};
      const legacyDeterministicState={activeInputCodes:JSON.parse(JSON.stringify(state.deterministicState?.activeInputCodes??[])),activeActionIds:JSON.parse(JSON.stringify(state.deterministicState?.activeActionIds??[])),overlapContactIds:JSON.parse(JSON.stringify(state.deterministicState?.overlapContactIds??[]))};
      const deterministicState=Number(hashVersion)<=3?legacyDeterministicState:JSON.parse(JSON.stringify(state.deterministicState??{...legacyDeterministicState,activeChoicePageId:null,pendingChoiceId:null}));
      const snapshot={...common,variables:JSON.parse(JSON.stringify(state.variables??{})),completedRuleIds:JSON.parse(JSON.stringify(state.completedRuleIds??[])),deterministicState:deterministicState,objects:replayEngine.getObjects().map(function(object){const runtimeObjectState=Object.fromEntries(runtimeObjectStateKeys.filter(function(key){return Object.prototype.hasOwnProperty.call(object,key)}).map(function(key){return [key,JSON.parse(JSON.stringify(object[key]))]}));return {id:String(object.id??''),kind:String(object.kind??''),x:Number(object.x??0),y:Number(object.y??0),z:Number(object.z??0),vx:Number(object.vx??0),vy:Number(object.vy??0),grounded:Boolean(object.grounded),collected:Boolean(object.collected),hidden:Boolean(object.hidden),solid:Boolean(object.solid),colliderEnabled:object.collider?.enabled!==false,runtimeState:String(object.runtimeState??''),...(Object.keys(runtimeObjectState).length?{runtimeObjectState:runtimeObjectState}:{})}}).sort(function(first,second){return replayCompareIds(first.id,second.id)}),paths:replayEngine.getTraversalPaths().map(function(path){return{id:String(path.id??''),enabled:path.enabled!==false}}).sort(function(first,second){return replayCompareIds(first.id,second.id)})};if(Number(hashVersion)>=5){const motionBodies=replayEngine.getMotionBodyStates?.()??[];snapshot.motionBodies=JSON.parse(JSON.stringify(motionBodies.map(function(state){return Number(hashVersion)>=10?state:replayLegacyMotionBody(state)})))}if(Number(hashVersion)>=7)snapshot.combat=JSON.parse(JSON.stringify(replayEngine.getCombatState?.()??null));if(Number(hashVersion)>=8)snapshot.actors=JSON.parse(JSON.stringify(replayEngine.getActorStates?.()??[]));if(Number(hashVersion)>=12)snapshot.worldStream=replayWorldStream(replayEngine.getWorldStreamState?.()??state.worldStream);return snapshot;
    }
    function replayInputCode(input){const aliases={'move-left':'left',left:'left','move-right':'right',right:'right','move-up':'up',up:'up','move-down':'down',down:'down',jump:'jump',interact:'interact',lock:'interact'};const requested=String(input.action??input.actionId??input.code??'').trim();if(aliases[requested])return aliases[requested];const action=(project.inputActions??[]).find(function(candidate){return candidate.id===requested});if(!action)return requested;if(aliases[action.id])return aliases[action.id];return (action.bindings??[]).find(function(binding){return typeof binding==='string'&&binding.trim()})??requested}
    function runEmbeddedReplayCase(caseId){const fixture=(project.replay?.cases??[]).find(function(candidate){return candidate.id===caseId});if(!fixture)throw new Error('Replay case was not found: '+caseId);const replayEngine=createRuntimeModel(JSON.parse(JSON.stringify(project)));if(fixture.startMapId&&!replayEngine.loadMap(fixture.startMapId,fixture.startSpawnId??null))throw new Error('Replay references missing start map '+fixture.startMapId);replayEngine.drainEvents();const tickRate=Number(fixture.tickRate??project.replay?.tickRate??60);if(!Number.isFinite(tickRate)||tickRate<20||tickRate>240)throw new Error('Replay tickRate must be a finite number from 20 through 240.');const hashVersion=Number(fixture.hashVersion??1);if(![1,2,3,4,5,6,7,8,9,10,11,12].includes(hashVersion))throw new Error('Replay hashVersion must be one of 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12.');const inputsByTick=new Map();(fixture.inputs??[]).forEach(function(input){const values=inputsByTick.get(input.tick)??[];values.push(input);inputsByTick.set(input.tick,values)});const expectedByTick=new Map((fixture.checkpoints??[]).map(function(checkpoint){return [checkpoint.tick,checkpoint.hash]}));const mismatches=[];const checkpoints=[];const emittedEventCounts={};let finalHash='';for(let tickIndex=0;tickIndex<fixture.tickCount;tickIndex+=1){(inputsByTick.get(tickIndex)??[]).forEach(function(input){replayEngine.setInput(replayInputCode(input),input.pressed)});const events=replayEngine.update(1/tickRate);events.forEach(function(event){emittedEventCounts[event.type]=(emittedEventCounts[event.type]??0)+1});const tick=tickIndex+1;const actualHash=replayHash(replaySnapshot(replayEngine,hashVersion),hashVersion);finalHash=actualHash;const expected=expectedByTick.get(tick);if(expected&&expected!==actualHash)mismatches.push({tick:tick,expectedHash:expected,actualHash:actualHash});if(expected)checkpoints.push({tick:tick,hash:actualHash,expectedHash:expected,passed:expected===actualHash})}const expectedHash=fixture.expectedHash??expectedByTick.get(fixture.tickCount)??null;if(expectedHash&&expectedHash!==finalHash&&!mismatches.some(function(entry){return entry.tick===fixture.tickCount}))mismatches.push({tick:fixture.tickCount,expectedHash:expectedHash,actualHash:finalHash});mismatches.sort(function(first,second){return first.tick-second.tick});const hasExpectations=Boolean(expectedHash||expectedByTick.size);return {caseId:fixture.id,revision:Number(fixture.revision??1),hashVersion:hashVersion,tickRate:tickRate,tickCount:fixture.tickCount,seed:Number(fixture.seed??project.replay?.seed??1),status:!hasExpectations?'recordable':mismatches.length?'failed':'passed',passed:hasExpectations&&mismatches.length===0,expectedHash:expectedHash,finalHash:finalHash,firstMismatchTick:mismatches[0]?.tick??null,mismatches:mismatches,checkpoints:checkpoints,emittedEventCounts:emittedEventCounts}}
    function runEmbeddedReplaySuite(){const cases=(project.replay?.cases||[]).map(function(fixture){return runEmbeddedReplayCase(fixture.id)});const failedCount=cases.filter(function(result){return result.status==='failed'}).length;const recordableCount=cases.filter(function(result){return result.status==='recordable'}).length;const passedCount=cases.filter(function(result){return result.status==='passed'}).length;const status=cases.length===0?'no-fixtures':failedCount?'failed':recordableCount?'recordable':'passed';const first=cases.filter(function(result){return result.firstMismatchTick!=null}).sort(function(a,b){return a.firstMismatchTick-b.firstMismatchTick})[0];return {schemaVersion:'looplab-replay-result/v1',status:status,passed:status==='passed',caseCount:cases.length,passedCount:passedCount,failedCount:failedCount,recordableCount:recordableCount,firstDivergence:first?{caseId:first.caseId,tick:first.firstMismatchTick}:null,cases:cases}}
    const acceptanceTargets=new Set(['gameplay-variable','completed-rule','event-emitted','object-property','runtime-state','traversal-path','combat-health','combat-emitter','combat-state','actor-state']);
    const acceptanceOperators=new Set(['equals','not-equals','greater-than','greater-or-equal','less-than','less-or-equal','contains','truthy','falsy']);
    const acceptanceRuntimeProperties=new Set(['activeMapId','collectedCount','activeTraversalPathId','activeChoicePageId','won']);
    const acceptanceObjectProperties=new Set(['active','collected','enabled','grounded','hidden','locked','open','runtimeState','solid','vx','vy','x','y','z','colliderEnabled']);
    const acceptanceCombatHealthProperties=new Set(['hp','maxHp','invulnerabilityTicks','depleted']);
    const acceptanceCombatEmitterProperties=new Set(['cooldownTicks','lastTargetActorId','shotsFired','overflowCount','activeProjectiles']);
    const acceptanceCombatStateProperties=new Set(['enabled','revision','sequence','poolCapacity','activeProjectileCount','maxProjectiles']);
    const acceptanceActorStateProperties=new Set(['mode','previousMode','x','y','z','vx','vy','facingX','facingY','routeIndex','routeDirection','targetId','detected','memoryTicksRemaining','repathTicksRemaining','blockerId','arrived','revision']);
    function acceptanceDigest(prefix,value){const text=JSON.stringify(replayCanonicalize(value));let hash=2166136261;for(let index=0;index<text.length;index+=1){hash^=text.charCodeAt(index);hash=Math.imul(hash,16777619)}return prefix+'-'+(hash>>>0).toString(16).padStart(8,'0')}
    function acceptanceEqual(first,second){if(first===undefined||second===undefined)return first===second;if((first&&typeof first==='object')||(second&&typeof second==='object'))return JSON.stringify(replayCanonicalize(first))===JSON.stringify(replayCanonicalize(second));return Object.is(first,second)}
    function acceptancePassed(operator,observed,expected){if(operator==='equals')return acceptanceEqual(observed,expected);if(operator==='not-equals')return !acceptanceEqual(observed,expected);if(operator==='greater-than')return typeof observed==='number'&&observed>Number(expected);if(operator==='greater-or-equal')return typeof observed==='number'&&observed>=Number(expected);if(operator==='less-than')return typeof observed==='number'&&observed<Number(expected);if(operator==='less-or-equal')return typeof observed==='number'&&observed<=Number(expected);if(operator==='contains')return typeof observed==='string'?observed.includes(String(expected)):Array.isArray(observed)&&observed.some(function(entry){return acceptanceEqual(entry,expected)});if(operator==='truthy')return Boolean(observed);if(operator==='falsy')return !observed;return false}
    function acceptanceObserved(testEngine,assertion,eventCounts){const state=testEngine.getState();if(assertion.target==='gameplay-variable')return state.variables?.[assertion.targetId];if(assertion.target==='completed-rule')return (state.completedRuleIds||[]).includes(assertion.targetId);if(assertion.target==='event-emitted')return Number(eventCounts[assertion.targetId]||0);if(assertion.target==='runtime-state')return state[assertion.property];if(assertion.target==='object-property'){const object=testEngine.getObjects().find(function(candidate){return candidate.id===assertion.targetId});if(!object)return undefined;return assertion.property==='colliderEnabled'?object.collider?.enabled!==false:object[assertion.property]}if(assertion.target==='traversal-path'){const path=testEngine.getTraversalPaths().find(function(candidate){return candidate.id===assertion.targetId});return path?.[assertion.property]}if(assertion.target==='combat-health')return testEngine.getCombatState()?.health?.find(function(entry){return entry.actorId===assertion.targetId})?.[assertion.property];if(assertion.target==='combat-emitter')return testEngine.getCombatState()?.emitters?.find(function(entry){return entry.emitterId===assertion.targetId})?.[assertion.property];if(assertion.target==='combat-state')return testEngine.getCombatState()?.[assertion.property];if(assertion.target==='actor-state')return testEngine.getActorStates?.().find(function(entry){return entry.actorId===assertion.targetId})?.[assertion.property];return undefined}
    function validateEmbeddedAcceptance(spec){const errors=[];if(spec.runner!=='looplab-deterministic-runtime')errors.push('runner must be looplab-deterministic-runtime');if(!spec.driver||typeof spec.driver!=='object')errors.push('driver is required');const tickRate=Number(spec.driver?.tickRate??60);const tickCount=Number(spec.driver?.tickCount);if(!Number.isFinite(tickRate)||tickRate<20||tickRate>240)errors.push('tickRate must be from 20 through 240');if(!Number.isInteger(tickCount)||tickCount<1||tickCount>36000)errors.push('tickCount must be 1 through 36000');if(!Array.isArray(spec.driver?.inputs)||spec.driver.inputs.length>4096)errors.push('inputs must be an array of at most 4096 transitions');if(!Array.isArray(spec.assertions)||spec.assertions.length<1||spec.assertions.length>64)errors.push('assertions must contain 1 through 64 checks');(spec.assertions??[]).forEach(function(assertion){if(!acceptanceTargets.has(assertion.target))errors.push('unsupported target '+String(assertion.target));if(!acceptanceOperators.has(assertion.operator))errors.push('unsupported operator '+String(assertion.operator));if(assertion.target==='runtime-state'&&!acceptanceRuntimeProperties.has(assertion.property))errors.push('unsupported runtime property '+String(assertion.property));if(assertion.target==='object-property'&&!acceptanceObjectProperties.has(assertion.property))errors.push('unsupported object property '+String(assertion.property));if(assertion.target==='traversal-path'&&assertion.property!=='enabled')errors.push('unsupported traversal property '+String(assertion.property));if(assertion.target==='combat-health'&&!acceptanceCombatHealthProperties.has(assertion.property))errors.push('unsupported combat health property '+String(assertion.property));if(assertion.target==='combat-emitter'&&!acceptanceCombatEmitterProperties.has(assertion.property))errors.push('unsupported combat emitter property '+String(assertion.property));if(assertion.target==='combat-state'&&!acceptanceCombatStateProperties.has(assertion.property))errors.push('unsupported combat state property '+String(assertion.property));if(assertion.target==='actor-state'&&!acceptanceActorStateProperties.has(assertion.property))errors.push('unsupported actor state property '+String(assertion.property))});return errors}
    function runEmbeddedAcceptanceTest(testId){const spec=(project.acceptanceTests??[]).find(function(candidate){return candidate.id===testId});if(!spec)throw new Error('Acceptance test was not found: '+testId);const base={schemaVersion:'looplab-acceptance-result/v1',runner:'looplab-deterministic-runtime',runnerVersion:1,sourceDigest:projectSourceDigest,acceptanceSpecDigest:acceptanceDigest('acceptance',spec),testId:spec.id};const hasIntent=Object.prototype.hasOwnProperty.call(spec,'runner')||Object.prototype.hasOwnProperty.call(spec,'driver')||Object.prototype.hasOwnProperty.call(spec,'assertions');if(!hasIntent)return {...base,status:'specified',passed:false,tickRate:null,tickCount:0,inputDigest:null,assertions:[],errors:[]};const errors=validateEmbeddedAcceptance(spec);if(errors.length)return {...base,status:'invalid',passed:false,tickRate:Number(spec.driver?.tickRate??60),tickCount:0,inputDigest:null,assertions:[],errors:errors};const tickRate=Number(spec.driver.tickRate??60);const tickCount=Number(spec.driver.tickCount);const inputDigest=acceptanceDigest('acceptance-input',spec.driver.inputs??[]);const testEngine=createRuntimeModel(JSON.parse(JSON.stringify(project)));if(spec.driver.startMapId&&!testEngine.loadMap(spec.driver.startMapId,spec.driver.startSpawnId??null))return {...base,status:'invalid',passed:false,tickRate:tickRate,tickCount:0,inputDigest:inputDigest,assertions:[],errors:['Missing start map '+spec.driver.startMapId]};testEngine.drainEvents();const inputsByTick=new Map();(spec.driver.inputs??[]).forEach(function(input){const values=inputsByTick.get(input.tick)??[];values.push(input);inputsByTick.set(input.tick,values)});const assertionsByTick=new Map();spec.assertions.forEach(function(assertion){const tick=Number(assertion.atTick??tickCount);const values=assertionsByTick.get(tick)??[];values.push(assertion);assertionsByTick.set(tick,values)});const eventCounts={};const results=[];for(let tickIndex=0;tickIndex<tickCount;tickIndex+=1){(inputsByTick.get(tickIndex)??[]).forEach(function(input){testEngine.setInput(replayInputCode(input),input.pressed)});const events=testEngine.update(1/tickRate);events.forEach(function(event){eventCounts[event.type]=(eventCounts[event.type]??0)+1});const tick=tickIndex+1;(assertionsByTick.get(tick)??[]).forEach(function(assertion){const observed=acceptanceObserved(testEngine,assertion,eventCounts);const passed=acceptancePassed(assertion.operator,observed,assertion.expected);results.push({id:assertion.id,status:passed?'passed':'failed',target:assertion.target,targetId:assertion.targetId??null,property:assertion.property??null,operator:assertion.operator,expected:Object.prototype.hasOwnProperty.call(assertion,'expected')?JSON.parse(JSON.stringify(assertion.expected)):null,observed:observed===undefined?null:JSON.parse(JSON.stringify(observed)),observedDefined:observed!==undefined,tick:tick})})}const passed=results.length===spec.assertions.length&&results.every(function(result){return result.status==='passed'});return {...base,status:passed?'passed':'failed',passed:passed,tickRate:tickRate,tickCount:tickCount,inputDigest:inputDigest,assertions:results,firstFailure:results.find(function(result){return result.status==='failed'})??null,emittedEventCounts:eventCounts,errors:[]}}
    function runEmbeddedAcceptanceSuite(testId){const specs=testId?(project.acceptanceTests||[]).filter(function(spec){return spec.id===testId}):(project.acceptanceTests||[]);if(testId&&!specs.length)throw new Error('Acceptance test was not found: '+testId);const tests=specs.map(function(spec){return runEmbeddedAcceptanceTest(spec.id)});const passedCount=tests.filter(function(result){return result.status==='passed'}).length;const failedCount=tests.filter(function(result){return result.status==='failed'}).length;const invalidCount=tests.filter(function(result){return result.status==='invalid'}).length;const specifiedCount=tests.filter(function(result){return result.status==='specified'}).length;const status=tests.length===0?'no-specs':invalidCount?'invalid':failedCount?'failed':specifiedCount?'specified':'passed';return {schemaVersion:'looplab-acceptance-result/v1',status:status,passed:status==='passed',testCount:tests.length,executableCount:tests.length-specifiedCount,passedCount:passedCount,failedCount:failedCount,invalidCount:invalidCount,specifiedCount:specifiedCount,tests:tests}}

    function syncAudioToggle(){const status=presentation.getStatus();audioToggle.hidden=!status.audio.enabled;audioToggle.setAttribute('aria-pressed',String(status.audio.muted));audioToggle.textContent=status.audio.muted?'Sound: off':status.audio.state==='unavailable'||status.audio.state==='failed'?'Sound: unavailable':'Sound: on'}
    addEventListener('keydown',function(event){if(event.code==='Escape'&&!shellSettingsDialog.open&&!saveDialog.open){const shellState=gameShell.getState();if(shellState.state==='playing')gameShell.pause('user');else if(shellState.state==='paused')gameShell.resume();event.preventDefault();return}if(gameShell.getState().simulationBlocked||event.target?.closest?.('button,input,select,textarea,dialog'))return;setInput(event.code,true);void presentation.unlock().then(syncAudioToggle);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyE'].includes(event.code))event.preventDefault()},{passive:false});
    addEventListener('keyup',function(event){setInput(event.code,false)});
    addEventListener('blur',function(){gameShell.handleBlur();releaseInputs();void presentation.suspend().then(syncAudioToggle)});
    document.addEventListener('visibilitychange',function(){releaseInputs();last=performance.now();accumulator=0;gameShell.handleVisibility(document.hidden);if(document.hidden)void presentation.suspend().then(syncAudioToggle);announce(document.hidden?'Paused':'Ready')});
    const touchControls=document.getElementById('touch-controls');
    let touchInputSeen=false;
    function syncTouchControls(){const active=touchInputSeen&&!gameShell.getState().simulationBlocked;touchControls.hidden=!active;touchControls.inert=!active;touchControls.dataset.active=String(active);touchControls.setAttribute('aria-hidden',String(!active))}
    document.addEventListener('pointerdown',function(event){void presentation.unlock().then(syncAudioToggle);if(event.pointerType==='touch'&&!touchInputSeen){touchInputSeen=true;syncTouchControls();announce('Touch controls ready')}},{passive:true});
    syncTouchControls();
    document.querySelectorAll('[data-input]').forEach(function(button){const codes={left:'left',right:'right',up:'up',down:'down',jump:'jump',interact:'interact'};const code=codes[button.dataset.input];const release=function(){setInput(code,false);button.removeAttribute('data-pressed')};button.addEventListener('pointerdown',function(event){event.preventDefault();button.setPointerCapture(event.pointerId);setInput(code,true);button.setAttribute('data-pressed','true')});button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release)});
    document.getElementById('reset').addEventListener('click',reset);
    shellPause.addEventListener('click',function(){const state=gameShell.getState();if(state.state==='playing')gameShell.pause('user');else if(state.state==='paused')gameShell.resume();syncTouchControls()});
    shellSettingsToggle.addEventListener('click',function(){gameShell.openSettings()});
    shellPrimary.addEventListener('click',function(){const state=gameShell.getState();if(state.state==='title')gameShell.start();else if(state.state==='paused')gameShell.resume();else gameShell.restart();void presentation.unlock().then(syncAudioToggle);syncTouchControls()});
    shellRestart.addEventListener('click',function(){gameShell.restart();void presentation.unlock().then(syncAudioToggle);syncTouchControls()});
    shellSettings.addEventListener('click',function(){gameShell.openSettings()});
    shellMuted.addEventListener('change',function(){gameShell.setMuted(shellMuted.checked);if(!shellMuted.checked)void presentation.unlock().then(syncAudioToggle);syncAudioToggle()});
    shellVolume.addEventListener('input',function(){gameShell.setVolume(Number(shellVolume.value));syncAudioToggle()});
    shellMotion.addEventListener('change',function(){gameShell.setReducedMotion(shellMotion.value)});
    shellTouchSize.addEventListener('input',function(){gameShell.setTouchControlSize(Number(shellTouchSize.value));syncTouchControls()});
    shellSettingsDialog.addEventListener('close',function(){if(gameShell.getState().settingsOpen)gameShell.closeSettings();syncTouchControls()});
    audioToggle.addEventListener('click',function(){const nextMuted=!presentation.getStatus().audio.muted;gameShell.setMuted(nextMuted);if(!nextMuted)void presentation.unlock().then(syncAudioToggle);syncAudioToggle()});
    saveToggle.addEventListener('click',openSaveDialog);document.getElementById('save-export').addEventListener('click',generatePortableSave);document.getElementById('save-import').addEventListener('click',function(){applyPortableSave(saveCode.value)});saveClearHosted.addEventListener('click',function(){const result=saves.clearHosted();syncSaveUi(result.ok?'Stored save cleared. Portable text is unchanged.':result.error)});saveDialog.addEventListener('close',function(){saveToggle.setAttribute('aria-expanded','false');saveToggle.focus()});
    function getLoadedRuntimeVersion(){if(runtimeFramework==='phaser')return globalThis.Phaser?.VERSION??null;if(runtimeFramework==='pixi')return globalThis.PIXI?.VERSION??null;if(runtimeFramework==='melon')return globalThis.LoopLabMelon?.version??null;return null}
    function getRuntimeAdapterInfo(){const descriptors={canvas:{primaryFrameOwner:'looplab-canvas',renderAdapter:'looplab-canvas-2d',integration:'canonical-canvas'},phaser:{primaryFrameOwner:'phaser',renderAdapter:'phaser-canvas-with-looplab-draw-hook',integration:'canonical-canvas-post-render'},pixi:{primaryFrameOwner:'pixi',renderAdapter:'pixi-canvas-texture-with-looplab-draw-hook',integration:'canonical-canvas-texture',cspAdapter:'pixi-static-sync-polyfills'},melon:{primaryFrameOwner:'melon',renderAdapter:'melon-canvas-renderable-with-looplab-draw-hook',integration:'standalone-application-explicit-camera'}};const descriptor=descriptors[runtimeFramework]||descriptors.canvas;return {framework:runtimeFramework,primaryFrameOwner:descriptor.primaryFrameOwner,renderAdapter:descriptor.renderAdapter,integration:descriptor.integration,singleFile:true,networkFree:true,strictCsp:true,cspAdapter:descriptor.cspAdapter??null,exportProfile:saveReport.profile,storageFree:saveReport.profile==='strict',portableSaves:saves.getStatus().enabled,vendor:pinnedRuntimeVendor?{...pinnedRuntimeVendor,loadedVersion:getLoadedRuntimeVersion()}:null}}
    let runtimeJoinProbe=null;
    function runtimeBoxesOverlap(first,second){return Boolean(first&&second&&first.x<second.x+second.width&&first.x+first.width>second.x&&first.y<second.y+second.height&&first.y+first.height>second.y&&first.zMin<second.zMax&&first.zMax>second.zMin)}
    function finishRuntimeJoinProbe(){if(!runtimeJoinProbe)return {ok:true,active:false};const player=engine.getObjects().find(function(object){return object.kind==='player'});if(player)player.collected=runtimeJoinProbe.targetCollected??runtimeJoinProbe.sourceCollected??false;runtimeJoinProbe=null;reset();return {ok:true,active:false}}
    function beginRuntimeJoinProbe(portalId){if(runtimeJoinProbe)finishRuntimeJoinProbe();const join=runtimeJoinPlan.joins.find(function(candidate){return candidate.portalId===portalId});if(!join)return {ok:false,error:'Runtime join was not found: '+String(portalId)};presentation.reset();engine.reset();handleEvents(engine.drainEvents(),{autoSave:false});if(!engine.loadMap(join.sourceMapId,null))return {ok:false,error:'Source map could not load: '+join.sourceMapId};engine.drainEvents();setInput('interact',false);engine.update(1/60);engine.drainEvents();const objects=engine.getObjects();const portal=objects.find(function(object){return object.id===join.portalId&&object.kind==='portal'});const player=objects.find(function(object){return object.kind==='player'});if(!portal||!player)return {ok:false,error:'Runtime join is missing its portal or player.'};player.x=Number(portal.x)+Math.max(0,(Number(portal.width)-Number(player.width))/2);player.y=Number(portal.y)+Math.max(0,(Number(portal.height)-Number(player.height))/2);const portalZ=Number(portal.supportZ??portal.z??0);const playerHeight=Number(player.collisionHeight??1);player.z=portalZ;player.supportZ=portalZ;if(player.collider){player.collider.zMin=portalZ;player.collider.zMax=portalZ+playerHeight}const sourceCollected=player.collected;player.collected=true;runtimeJoinProbe={join:join,sourcePlayer:player,sourceCollected:sourceCollected,targetCollected:null};syncUi();draw();return {ok:true,phase:'source',join:JSON.parse(JSON.stringify(join)),activeMapId:engine.getState().activeMapId,playerExcluded:true}}
    function commitRuntimeJoinProbe(portalId){const probe=runtimeJoinProbe;if(!probe||probe.join.portalId!==portalId)return {ok:false,error:'Begin the same runtime join probe before committing it.'};probe.sourcePlayer.collected=probe.sourceCollected;setInput('interact',true);const events=engine.update(.0001);setInput('interact',false);const transitioned=engine.getState().activeMapId===probe.join.targetMapId&&events.some(function(event){return event.type==='portal.entered'&&event.objectId===probe.join.portalId});const objects=engine.getObjects();const tileColliders=engine.getTileRuntime().collisionObjects||[];const player=objects.find(function(object){return object.kind==='player'});const spawn=objects.find(function(object){return object.kind==='spawn'&&object.id===probe.join.targetSpawnId});const expectedX=player&&spawn?Number(spawn.x)+(Number(spawn.width)-Number(player.width))/2:NaN;const expectedY=player&&spawn?Number(spawn.y)+Number(spawn.height)-Number(player.height):NaN;const exactSpawn=Boolean(player&&spawn)&&Math.abs(Number(player.x)-expectedX)<.001&&Math.abs(Number(player.y)-expectedY)<.001;const playerBox=player?engine.colliderBox(player):null;const landingClear=Boolean(player)&&![...objects,...tileColliders].some(function(object){return object.id!==player.id&&object.solid!==false&&runtimeBoxesOverlap(playerBox,engine.colliderBox(object))});if(!player)return {ok:false,error:'Runtime join lost the player after transition.',transitioned:transitioned};probe.targetCollected=player.collected;player.collected=true;syncUi();draw();return {ok:true,phase:'target',join:JSON.parse(JSON.stringify(probe.join)),transitioned:transitioned,exactSpawn:exactSpawn,landingClear:landingClear,activeMapId:engine.getState().activeMapId,targetSpawnId:spawn?.id??null,playerExcluded:true,events:events.map(function(event){return JSON.parse(JSON.stringify(event))})}}
    const runtimeApi={version:'${LOOPLAB_EXPORTED_RUNTIME_VERSION}',getSourceDigest:function(){return projectSourceDigest},getRuntimeAdapterInfo:getRuntimeAdapterInfo,getInputActionLiveness:function(){return JSON.parse(JSON.stringify(inputActionLiveness))},getCompletionReport:function(){return JSON.parse(JSON.stringify(completionReport))},getNarrativeContract:function(){return JSON.parse(JSON.stringify(project.narrativeContract||null))},getNarrativeReport:function(){return JSON.parse(JSON.stringify(narrativeReport))},getPresentationProgram:function(){return JSON.parse(JSON.stringify(project.presentationProgram||null))},getPresentationReport:function(){return JSON.parse(JSON.stringify(presentationReport))},getPresentationStatus:function(){return JSON.parse(JSON.stringify(presentation.getStatus()))},setAudioMuted:function(muted){const status=presentation.setMuted(muted!==false);syncAudioToggle();return JSON.parse(JSON.stringify(status))},getSaveReport:function(){return JSON.parse(JSON.stringify(saveReport))},getSaveStatus:function(){return JSON.parse(JSON.stringify(saves.getStatus()))},exportSaveCode:generatePortableSave,inspectSaveCode:function(code){return JSON.parse(JSON.stringify(saves.inspectCode(String(code||''))))},importSaveCode:applyPortableSave,persistHostedSave:function(){const result=saves.persistHosted();syncSaveUi();return JSON.parse(JSON.stringify(result))},clearHostedSave:function(){const result=saves.clearHosted();syncSaveUi();return JSON.parse(JSON.stringify(result))},getState:engine.getState,getObjects:function(){return engine.getObjects().map(function(object){return JSON.parse(JSON.stringify(object))})},getTraversalPaths:function(){return engine.getTraversalPaths().map(function(path){return JSON.parse(JSON.stringify(path))})},getCollisionGeometry:function(){return JSON.parse(JSON.stringify(engine.getCollisionGeometry()))},getElevationTransitions:function(){return JSON.parse(JSON.stringify(engine.getElevationTransitions()))},getMotionBodyStates:function(){return JSON.parse(JSON.stringify(engine.getMotionBodyStates()))},getActorStates:function(){return JSON.parse(JSON.stringify(engine.getActorStates()))},getNavigation:function(){return JSON.parse(JSON.stringify(engine.getNavigation()))},getGameplayState:function(){return JSON.parse(JSON.stringify(engine.getGameplayState()))},getChoiceState:function(){return JSON.parse(JSON.stringify(engine.getChoiceState()))},getHudState:function(){return JSON.parse(JSON.stringify(engine.getHudState()))},chooseChoice:function(choiceId){const queued=engine.chooseChoice(String(choiceId||''));syncUi();return queued},getRuntimeJoinPlan:function(){return JSON.parse(JSON.stringify(runtimeJoinPlan))},beginRuntimeJoinProbe:beginRuntimeJoinProbe,commitRuntimeJoinProbe:commitRuntimeJoinProbe,finishRuntimeJoinProbe:finishRuntimeJoinProbe,getCollisionBox:function(id){const object=typeof id==='string'?engine.getObjects().find(function(candidate){return candidate.id===id}):id;return object?engine.colliderBox(object):null},getPerformance:getPerformance,getAcceptanceTests:function(){return JSON.parse(JSON.stringify(project.acceptanceTests||[]))},runAcceptanceTest:runEmbeddedAcceptanceTest,runAcceptanceSuite:runEmbeddedAcceptanceSuite,getReplayCases:function(){return JSON.parse(JSON.stringify(project.replay?.cases||[]))},runReplayCase:runEmbeddedReplayCase,runReplaySuite:runEmbeddedReplaySuite,setInput:setInput,step:function(milliseconds){const delta=Number(milliseconds||0);const emitted=stepExact(delta);handleEvents(emitted);presentation.update(delta);draw();return {events:emitted,state:engine.getState(),performance:getPerformance(),presentation:presentation.getStatus(),save:saves.getStatus()}},reset:reset,loadMap:function(mapId,spawnId){const loaded=engine.loadMap(mapId,spawnId||null);handleEvents(engine.drainEvents());syncUi();draw();return loaded},pause:function(){manuallyPaused=true;releaseInputs();void presentation.suspend().then(syncAudioToggle);announce('Paused')},resume:function(){manuallyPaused=false;last=performance.now();accumulator=0;void presentation.resume().then(syncAudioToggle);announce('Ready')}};
    runtimeApi.getCombatState=function(){return JSON.parse(JSON.stringify(engine.getCombatState()))};
    runtimeApi.getTileProgram=function(){return JSON.parse(JSON.stringify(engine.getTileProgram()))};
    runtimeApi.getTileRuntime=function(){return JSON.parse(JSON.stringify(engine.getTileRuntime()))};
    runtimeApi.getWorldStreamState=function(){return JSON.parse(JSON.stringify(engine.getWorldStreamState()))};
    runtimeApi.markWorldStreamDraw=function(observation){return JSON.parse(JSON.stringify(engine.markWorldStreamDraw(observation||{})))};
    runtimeApi.getGameShell=function(){return JSON.parse(JSON.stringify(project.gameShell||null))};
    runtimeApi.getGameShellReport=function(){return JSON.parse(JSON.stringify(gameShellReport))};
    runtimeApi.getGameShellState=function(){return JSON.parse(JSON.stringify(gameShell.getState()))};
    runtimeApi.startGame=function(){const state=gameShell.start();syncShellUi();return JSON.parse(JSON.stringify(state))};
    runtimeApi.pause=function(){const state=gameShell.pause('user');syncShellUi();return JSON.parse(JSON.stringify(state))};
    runtimeApi.resume=function(){last=performance.now();accumulator=0;const state=gameShell.resume();syncShellUi();return JSON.parse(JSON.stringify(state))};
    runtimeApi.restart=function(){const state=gameShell.restart();syncShellUi();return JSON.parse(JSON.stringify(state))};
    runtimeApi.openGameSettings=function(){return JSON.parse(JSON.stringify(gameShell.openSettings()))};
    runtimeApi.closeGameSettings=function(){return JSON.parse(JSON.stringify(gameShell.closeSettings()))};
    runtimeApi.setAudioMuted=function(muted){gameShell.setMuted(muted!==false);syncAudioToggle();return JSON.parse(JSON.stringify(presentation.getStatus()))};
    runtimeApi.setMasterVolume=function(volume){const state=gameShell.setVolume(volume);syncAudioToggle();return JSON.parse(JSON.stringify(state))};
    runtimeApi.setReducedMotion=function(mode){return JSON.parse(JSON.stringify(gameShell.setReducedMotion(mode)))};
    runtimeApi.setTouchControlSize=function(size){const state=gameShell.setTouchControlSize(size);syncTouchControls();return JSON.parse(JSON.stringify(state))};
    const runtimeStep=runtimeApi.step;runtimeApi.step=function(milliseconds){const result=runtimeStep(milliseconds);gameShell.sync();syncShellUi();return {...result,shell:runtimeApi.getGameShellState()}};
    const runtimeLoadMap=runtimeApi.loadMap;runtimeApi.loadMap=function(mapId,spawnId){const loaded=runtimeLoadMap(mapId,spawnId);gameShell.sync();syncShellUi();return loaded};
    function runRuntimeCommand(command){
      if(!command||typeof command!=='object'||Array.isArray(command)||typeof command.op!=='string')throw new Error('Runtime command requires a string op.');
      if(command.op==='get_source_digest')return {ok:true,sourceDigest:runtimeApi.getSourceDigest()};
      if(command.op==='get_runtime_adapter')return {ok:true,adapter:runtimeApi.getRuntimeAdapterInfo()};
      if(command.op==='get_input_action_liveness')return {ok:true,liveness:runtimeApi.getInputActionLiveness()};
      if(command.op==='get_completion_report')return {ok:true,completion:runtimeApi.getCompletionReport()};
      if(command.op==='get_narrative_contract')return {ok:true,contract:runtimeApi.getNarrativeContract()};
      if(command.op==='get_narrative_report')return {ok:true,report:runtimeApi.getNarrativeReport()};
      if(command.op==='get_presentation_program')return {ok:true,program:runtimeApi.getPresentationProgram()};
      if(command.op==='get_presentation_report')return {ok:true,report:runtimeApi.getPresentationReport()};
      if(command.op==='get_presentation_status')return {ok:true,presentation:runtimeApi.getPresentationStatus()};
      if(command.op==='set_audio_muted')return {ok:true,presentation:runtimeApi.setAudioMuted(command.muted!==false)};
      if(command.op==='get_game_shell')return {ok:true,shell:runtimeApi.getGameShell()};
      if(command.op==='get_game_shell_report')return {ok:true,report:runtimeApi.getGameShellReport()};
      if(command.op==='get_game_shell_state')return {ok:true,shell:runtimeApi.getGameShellState()};
      if(command.op==='start_game')return {ok:true,shell:runtimeApi.startGame()};
      if(command.op==='restart')return {ok:true,shell:runtimeApi.restart(),state:runtimeApi.getState()};
      if(command.op==='open_game_settings')return {ok:true,shell:runtimeApi.openGameSettings()};
      if(command.op==='close_game_settings')return {ok:true,shell:runtimeApi.closeGameSettings()};
      if(command.op==='set_master_volume')return {ok:true,shell:runtimeApi.setMasterVolume(command.volume)};
      if(command.op==='set_reduced_motion')return {ok:true,shell:runtimeApi.setReducedMotion(command.mode??command.reducedMotion)};
      if(command.op==='set_touch_control_size')return {ok:true,shell:runtimeApi.setTouchControlSize(command.size)};
      if(command.op==='get_save_report')return {ok:true,report:runtimeApi.getSaveReport()};
      if(command.op==='get_save_status')return {ok:true,save:runtimeApi.getSaveStatus()};
      if(command.op==='export_save_code')return runtimeApi.exportSaveCode();
      if(command.op==='inspect_save_code')return {ok:true,inspection:runtimeApi.inspectSaveCode(String(command.code||''))};
      if(command.op==='import_save_code')return runtimeApi.importSaveCode(String(command.code||''));
      if(command.op==='persist_hosted_save')return runtimeApi.persistHostedSave();
      if(command.op==='clear_hosted_save')return runtimeApi.clearHostedSave();
      if(command.op==='get_state')return {ok:true,state:runtimeApi.getState(),performance:runtimeApi.getPerformance()};
      if(command.op==='get_objects')return {ok:true,objects:runtimeApi.getObjects()};
      if(command.op==='get_traversal_paths')return {ok:true,paths:runtimeApi.getTraversalPaths()};
      if(command.op==='get_collision_geometry')return {ok:true,collisionGeometry:runtimeApi.getCollisionGeometry()};
      if(command.op==='get_elevation_transitions')return {ok:true,elevationTransitions:runtimeApi.getElevationTransitions()};
      if(command.op==='get_tile_program')return {ok:true,tileProgram:runtimeApi.getTileProgram()};
      if(command.op==='get_tile_runtime')return {ok:true,tileRuntime:runtimeApi.getTileRuntime()};
      if(command.op==='get_world_stream_state')return {ok:true,worldStream:runtimeApi.getWorldStreamState()};
      if(command.op==='mark_world_stream_draw')return {ok:true,worldStream:runtimeApi.markWorldStreamDraw({readyAssetIds:Array.isArray(command.readyAssetIds)?command.readyAssetIds:[],drawnTileCount:Number(command.drawnTileCount||0),visibleTileCount:Number(command.visibleTileCount||0),timestamp:Number(command.timestamp||0),completed:command.completed!==false})};
      if(command.op==='get_motion_body_states')return {ok:true,motionBodies:runtimeApi.getMotionBodyStates()};
      if(command.op==='get_actor_states')return {ok:true,actors:runtimeApi.getActorStates()};
      if(command.op==='get_combat_state')return {ok:true,combat:runtimeApi.getCombatState()};
      if(command.op==='get_navigation')return {ok:true,navigation:runtimeApi.getNavigation()};
      if(command.op==='get_gameplay_state')return {ok:true,gameplay:runtimeApi.getGameplayState()};
      if(command.op==='get_choice_state')return {ok:true,choice:runtimeApi.getChoiceState()};
      if(command.op==='get_hud_state')return {ok:true,hud:runtimeApi.getHudState()};
      if(command.op==='choose_choice'){const queued=runtimeApi.chooseChoice(String(command.choiceId||command.id||''));return {ok:queued,queued:queued,choice:runtimeApi.getChoiceState(),state:runtimeApi.getState()}}
      if(command.op==='get_runtime_join_plan')return {ok:true,plan:runtimeApi.getRuntimeJoinPlan()};
      if(command.op==='begin_runtime_join_probe')return runtimeApi.beginRuntimeJoinProbe(String(command.portalId||command.id||''));
      if(command.op==='commit_runtime_join_probe')return runtimeApi.commitRuntimeJoinProbe(String(command.portalId||command.id||''));
      if(command.op==='finish_runtime_join_probe')return runtimeApi.finishRuntimeJoinProbe();
      if(command.op==='get_collision_box')return {ok:true,id:command.id,box:runtimeApi.getCollisionBox(String(command.id||''))};
      if(command.op==='get_acceptance_tests')return {ok:true,tests:runtimeApi.getAcceptanceTests()};
      if(command.op==='run_acceptance_test')return {ok:true,acceptance:runtimeApi.runAcceptanceTest(String(command.testId||command.id||''))};
      if(command.op==='run_acceptance_suite')return {ok:true,acceptance:runtimeApi.runAcceptanceSuite(typeof command.testId==='string'?command.testId:undefined)};
      if(command.op==='get_replay_cases')return {ok:true,cases:runtimeApi.getReplayCases()};
      if(command.op==='run_replay_case')return {ok:true,replay:runtimeApi.runReplayCase(String(command.caseId||command.id||''))};
      if(command.op==='run_replay_suite')return {ok:true,replay:runtimeApi.runReplaySuite()};
      if(command.op==='set_input'){runtimeApi.setInput(String(command.code||command.action||''),command.pressed!==false);return {ok:true,state:runtimeApi.getState()}}
      if(command.op==='step')return {ok:true,...runtimeApi.step(Number(command.deltaMs||command.milliseconds||16.6667))};
      if(command.op==='reset'){runtimeApi.reset();return {ok:true,state:runtimeApi.getState()}}
      if(command.op==='load_map'){const loaded=runtimeApi.loadMap(String(command.mapId||''),typeof command.spawnId==='string'?command.spawnId:null);return {ok:loaded,state:runtimeApi.getState()}}
      if(command.op==='pause')return {ok:true,shell:runtimeApi.pause(),state:runtimeApi.getState()}
      if(command.op==='resume')return {ok:true,shell:runtimeApi.resume(),state:runtimeApi.getState()}
      throw new Error('Unknown runtime command: '+command.op)
    }
    const runtimeBridge=document.getElementById('looplab-runtime-bridge');const runtimeForm=document.getElementById('looplab-runtime-form');const runtimeCommandInput=document.getElementById('looplab-runtime-command');const runtimeResultOutput=document.getElementById('looplab-runtime-result');const runtimeSubmit=document.getElementById('looplab-runtime-submit');
    function executeRuntimeCommand(command){try{return runRuntimeCommand(command)}catch(error){return {ok:false,error:error instanceof Error?error.message:String(error)}}}
    function submitRuntimeCommand(event){if(event)event.preventDefault();runtimeSubmit.disabled=true;let result;try{result=executeRuntimeCommand(JSON.parse(runtimeCommandInput.value))}catch(error){result={ok:false,error:error instanceof Error?error.message:String(error)}}runtimeResultOutput.value=JSON.stringify(result,null,2);runtimeSubmit.disabled=false}
    runtimeForm.addEventListener('submit',submitRuntimeCommand);runtimeSubmit.addEventListener('click',submitRuntimeCommand);
    document.addEventListener('looplab:runtime-command',function(event){const detail=event.detail||{};const result=executeRuntimeCommand(detail.command||detail);document.dispatchEvent(new CustomEvent('looplab:runtime-response',{detail:{id:detail.id||null,result:result}}))});
    try{if(Object.isExtensible(window))window.looplabRuntime=runtimeApi}catch(error){}
    async function initializeRuntime(){
      try{
        const bootSave=saves.restoreHosted();handleEvents(engine.drainEvents(),{autoSave:false});syncUi();syncAudioToggle();syncSaveUi();syncShellUi();if(bootSave.restored)announce('Stored save restored');else if(saves.getStatus().hosted.configured&&saves.getStatus().hosted.state==='unavailable')announce('Ready — portable saves available');draw();await bootPrimaryRuntime();runtimeBridge.dataset.ready='true';document.dispatchEvent(new CustomEvent('looplab-runtime-ready',{bubbles:true,detail:{version:'${LOOPLAB_EXPORTED_RUNTIME_VERSION}',sourceDigest:projectSourceDigest,mapId:engine.getState().activeMapId,adapter:getRuntimeAdapterInfo(),presentation:presentation.getStatus(),gameShell:gameShell.getState(),save:saves.getStatus()}}));
      }catch(error){const message=error instanceof Error?error.message:String(error);runtimeBridge.dataset.ready='error';announce('Runtime failed');document.dispatchEvent(new CustomEvent('looplab-runtime-error',{bubbles:true,detail:{version:'${LOOPLAB_EXPORTED_RUNTIME_VERSION}',sourceDigest:projectSourceDigest,framework:runtimeFramework,error:message}}));setTimeout(function(){throw error},0)}
    }
    void initializeRuntime();
  </script>
</body>
</html>`;
  const audit = assertStandaloneHtml(html, { sourceDigest: doctor.sourceDigest });
  const releaseVerification = validateReleaseVerification(authoredProject.releaseVerification, {
    sourceDigest: doctor.sourceDigest,
    runtimeVersion: LOOPLAB_EXPORTED_RUNTIME_VERSION,
  });
  const releaseArtifact = releaseVerificationMatchesHtml(authoredProject.releaseVerification, html);
  if (!verificationArtifact && doctor.profile === "production" && releaseVerification.valid && !releaseArtifact.valid) {
    throw new Error(`Project Doctor blocked HTML export because the generated bytes do not match the verified release subject. Expected ${releaseArtifact.expectedArtifactSha256 ?? "an attested SHA-256"}; generated ${releaseArtifact.artifactSha256}. Rerun release verification for this exact runtime and source.`);
  }
  return { html, audit, project: authoredProject, runtimeProject: exportProject, doctor, saveReport: doctor.saveReport, releaseVerification, releaseArtifact };
}

export function buildStandaloneHtml(project) {
  return buildStandaloneHtmlInternal(project).html;
}

function standaloneFilename(project, requestedFilename) {
  if (typeof requestedFilename === "string" && requestedFilename.trim()) {
    const trimmed = requestedFilename.trim();
    return /\.html?$/i.test(trimmed) ? trimmed : `${trimmed}.html`;
  }
  const slug = String(project.name ?? "my-game").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-game";
  return `${slug}.html`;
}

function buildExportReceipt({ project, doctor, audit, saveReport, releaseVerification, releaseArtifact }, options = {}) {
  const filename = standaloneFilename(project, options.filename);
  const sourceFilename = filename.replace(/\.html?$/i, ".loop.json");
  const exportProfile = saveReport?.profile ?? exportProfileId(project);
  const iterationStatus = project.iteration?.status ?? "untracked";
  const sourceBoundVerification = iterationStatus === "verified" || iterationStatus === "promoted";
  const releaseReady = audit.valid
    && doctor.profile === "production"
    && doctor.errorCount === 0
    && doctor.warningCount === 0
    && sourceBoundVerification
    && releaseVerification?.valid === true
    && releaseArtifact?.valid === true;
  const status = releaseReady ? "release-ready" : "draft";
  const readiness = releaseReady
    ? {
        status,
        shippable: true,
        reason: "The production Doctor is warning-clean, the exact candidate has current source-bound iteration evidence, and this exact one-file SHA-256 matches its browser attestation.",
        nextAction: "Distribute this exact one-file artifact. Any authored source change requires a new verification and export receipt.",
      }
    : doctor.profile !== "production"
      ? {
          status,
          shippable: false,
          reason: "This playable artifact was built under the prototype Doctor profile, so it is an iteration draft rather than a release claim.",
          nextAction: "Switch to the production Doctor profile, clear every warning, collect source-bound browser evidence, and verify the exact candidate before release.",
        }
      : {
          status,
          shippable: false,
          reason: releaseVerification?.valid !== true
            ? "The production Doctor and artifact audit passed, but this source has no current structured exact-artifact browser attestation."
            : releaseArtifact?.valid !== true
              ? "The production Doctor passed, but these generated HTML bytes do not match the attested release subject."
              : "The production Doctor and exact-artifact attestation passed, but this candidate has not completed source-bound iteration verification.",
          nextAction: releaseVerification?.valid !== true || releaseArtifact?.valid !== true
            ? "Run the canonical release verifier with visual captures, then export the exact attested bytes without authored changes."
            : "Collect source-bound editor evidence and run verify_iteration. Export the verified or promoted candidate again without further authored edits.",
        };
  const sourcePrivacy = doctor.privacyReport;
  const artifactPrivacy = audit.privacy;
  const privacyStatus = sourcePrivacy?.status === "blocked" || artifactPrivacy?.status === "blocked"
    ? "blocked"
    : sourcePrivacy?.status === "review-required" || artifactPrivacy?.status === "review-required"
      ? "review-required"
      : "clear";
  const privacyFindingCount = Number(sourcePrivacy?.findingCount ?? 0) + Number(artifactPrivacy?.issues?.filter((issue) => issue.path === "artifact").length ?? 0);
  const privacyErrorCount = Number(sourcePrivacy?.errorCount ?? 0) + Number(artifactPrivacy?.issues?.filter((issue) => issue.path === "artifact" && issue.severity === "error").length ?? 0);
  const privacyWarningCount = Number(sourcePrivacy?.warningCount ?? 0) + Number(artifactPrivacy?.issues?.filter((issue) => issue.path === "artifact" && issue.severity === "warning").length ?? 0);
  return {
    schemaVersion: "looplab-export-receipt/v5",
    status,
    generatedAt: typeof options.generatedAt === "string" && options.generatedAt ? options.generatedAt : new Date().toISOString(),
    filename,
    source: {
      projectName: project.name,
      projectSchemaVersion: project.schemaVersion ?? null,
      buildId: project.build?.id ?? null,
      sourceRevision: project.build?.sourceRevision ?? null,
      sourceDigest: doctor.sourceDigest,
      doctorDigest: doctor.digest,
    },
    doctor: {
      profile: doctor.profile,
      score: doctor.score,
      grade: doctor.grade,
      errorCount: doctor.errorCount,
      warningCount: doctor.warningCount,
      canPromote: doctor.canPromote,
    },
    privacy: {
      schemaVersion: "looplab-export-privacy-receipt/v1",
      status: privacyStatus,
      sourceDigest: doctor.sourceDigest,
      digest: canonicalSha256({ sourceDigest: doctor.sourceDigest, sourceReportDigest: sourcePrivacy?.digest ?? null, artifactReportDigest: artifactPrivacy?.digest ?? null }),
      sourceReportDigest: sourcePrivacy?.digest ?? null,
      artifactReportDigest: artifactPrivacy?.digest ?? null,
      findingCount: privacyFindingCount,
      errorCount: privacyErrorCount,
      warningCount: privacyWarningCount,
      matchedValuesReturned: false,
      proofBoundary: sourcePrivacy?.proofBoundary ?? artifactPrivacy?.proofBoundary ?? "A clear heuristic privacy scan is not proof of absence.",
    },
    release: {
      ...readiness,
      doctorProfile: doctor.profile,
      exportProfile,
      iterationStatus,
      sourceBoundVerification,
      persistence: {
        schemaVersion: saveReport?.schemaVersion ?? null,
        status: saveReport?.status ?? "absent",
        portableCodes: saveReport?.program?.portableCodes === true,
        automaticStorage: exportProfile === "hosted",
        exactWrapper: exportProfile === "hosted" ? LOOPLAB_HOSTED_STORAGE_WRAPPER_SCHEMA : null,
        fallback: exportProfile === "hosted" ? "Portable codes remain available when browser storage is unavailable." : "No persistent storage API is used.",
      },
      exactArtifactVerification: {
        valid: releaseVerification?.valid === true && releaseArtifact?.valid === true,
        attestationDigest: releaseVerification?.attestationDigest ?? null,
        verifiedAt: releaseVerification?.attestation?.verifiedAt ?? null,
        expectedSha256: releaseArtifact?.expectedArtifactSha256 ?? null,
        actualSha256: releaseArtifact?.artifactSha256 ?? null,
      },
    },
    artifact: {
      gate: "passed",
      valid: audit.valid,
      sha256: releaseArtifact?.artifactSha256 ?? null,
      uploadFileCount: audit.uploadFileCount,
      byteLength: audit.byteLength,
      embeddedPayloadBytes: audit.embeddedPayloadBytes,
      decodedImageMemoryBytes: audit.decodedImageMemoryBytes,
      embeddedResourceCount: audit.embeddedResourceCount,
      scriptCount: audit.scriptCount,
      runtimeCapabilities: clone(audit.runtimeCapabilities ?? []),
      checks: audit.checks.map((check) => ({ ...check })),
      warnings: audit.warnings.map((warning) => ({ ...warning })),
    },
    game: {
      mapCount: project.maps?.length ?? 1,
      startMapId: project.startMapId ?? project.maps?.[0]?.id ?? project.activeMapId ?? "map-main",
      selectedAssetCount: project.assets?.length ?? 0,
      embeddedResourceCount: (project.assets?.length ?? 0) + (project.resources?.length ?? 0),
    },
    runtime: {
      version: LOOPLAB_EXPORTED_RUNTIME_VERSION,
      offlinePlayable: true,
      externalDependencies: [],
      launch: exportProfile === "hosted"
        ? "Open this one HTML file directly for offline play and portable saves. Serve the same file from a stable HTTP(S) origin when automatic browser persistence is desired; unavailable storage degrades to portable codes."
        : "Open this HTML file directly in a modern browser; no server, provider, companion, storage permission, or package install is required.",
    },
    editableSource: {
      filename: sourceFilename,
      authoritative: true,
      htmlIsBuildArtifact: true,
    },
  };
}

export function buildStandaloneArtifact(project, options = {}) {
  const built = buildStandaloneHtmlInternal(project);
  return {
    html: built.html,
    audit: built.audit,
    receipt: buildExportReceipt(built, options),
  };
}

export function buildVerificationHtml(project) {
  return buildStandaloneHtmlInternal(project, { verificationArtifact: true }).html;
}
