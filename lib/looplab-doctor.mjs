import { analyzeSpatialProject } from "./looplab-spatial.mjs";
import { LOOPLAB_PROJECT_SCHEMA_VERSION } from "./looplab-reuse-guide.mjs";
import { runReplaySuite } from "./looplab-replay.mjs";
import { buildRuntimeJoinPlan } from "./looplab-runtime-join.mjs";
import { inspectVerbArchitecture } from "./looplab-verb-architecture.mjs";
import { inspectGameplayProgram } from "./looplab-gameplay-rules.mjs";
import { getAcceptancePlan, runAcceptanceSuite } from "./looplab-acceptance.mjs";
import { campaignScopeRequirement } from "./looplab-game-director.mjs";
import { canonicalJson, sha256Hex } from "./looplab-canonical-digest.mjs";
import { measurePlatformerJumpEnvelope } from "./looplab-runtime-model.mjs";
import { analyzeInputActionLiveness } from "./looplab-input-liveness.mjs";
import { runCompletionHarness } from "./looplab-completion-harness.mjs";
import { validateReleaseVerification } from "./looplab-release-verification.mjs";
import { LOOPLAB_EXPORTED_RUNTIME_VERSION } from "./looplab-versions.mjs";
import { inspectNarrativeContract } from "./looplab-narrative.mjs";
import { inspectTuningContract } from "./looplab-tuning-search.mjs";
import { inspectStructuralScaffoldContract } from "./looplab-structural-scaffolds.mjs";
import { inspectSpatialLayoutContract } from "./looplab-spatial-layouts.mjs";
import { inspectPresentationProgram } from "./looplab-presentation.mjs";
import { inspectGameShell } from "./looplab-game-shell.mjs";
import { inspectSaveProgram } from "./looplab-save-state.mjs";
import { inspectMotionBodies } from "./looplab-motion-bodies.mjs";
import { inspectCombatProgram } from "./looplab-combat.mjs";
import { inspectActorProgram } from "./looplab-actors.mjs";
import { inspectCollisionGeometry } from "./looplab-collision-geometry.mjs";
import { inspectElevationTransitions } from "./looplab-elevation-transitions.mjs";
import { inspectTileProgram } from "./looplab-tile-program.mjs";
import { inspectWorldStream } from "./looplab-world-stream.mjs";
import { inspectVisualIdentity } from "./looplab-visual-identity.mjs";
import { inspectProjectPrivacy } from "./looplab-project-privacy.mjs";
import { inspectCommunityExchanges } from "./looplab-community-exchange.mjs";

const REQUIRED_CONTRACT_LINKS = [
  "visual",
  "collision",
  "inputAction",
  "animationState",
  "feedbackEvent",
  "placementRules",
  "responsiveRules",
  "acceptanceTests",
];

const unrelatedVerbFamilies = [
  new Set(["jump", "trick", "interact", "grind", "slide", "land"]),
  new Set(["pause", "attack", "confirm"]),
];

const isProduction = (project, options) => (options?.profile ?? project.doctorProfile ?? "prototype") === "production";

const CATEGORY_OWNERS = {
  maps: "map-and-collision",
  workflow: "iteration-manager",
  build: "build-system",
  assets: "asset-pipeline",
  controls: "input-system",
  replay: "simulation-and-replay",
  tests: "acceptance-tests",
  contracts: "feature-contracts",
  release: "packaging",
  performance: "performance-lab",
  audio: "audio-lifecycle",
  lifecycle: "page-lifecycle",
  devices: "responsive-ui",
  accessibility: "accessibility",
  gameplay: "gameplay-systems",
  narrative: "narrative-design-and-writing",
  tuning: "gameplay-tuning",
  presentation: "audio-and-game-feel",
  "game-shell": "game-shell-and-accessibility",
  "visual-identity": "art-direction-and-asset-pipeline",
  "motion-bodies": "simulation-and-collision",
  combat: "gameplay-systems-and-collision",
  actors: "gameplay-systems-navigation-and-collision",
  "collision-geometry": "simulation-and-collision",
  "elevation-transitions": "map-navigation-and-collision",
  "tile-program": "tile-authoring-and-collision",
  "world-stream": "world-stream-authoring-and-runtime",
  "community-exchange": "asset-and-map-interchange",
  privacy: "privacy-and-release-safety",
};

const CATEGORY_ACTIONS = {
  maps: "Open the marked map with collision and anchor overlays, correct the authored geometry, then replay the affected route.",
  workflow: "Repair the candidate lineage or workstream state before another AI pass starts.",
  build: "Regenerate from the authoring source, verify the served build ID, and capture fresh evidence.",
  assets: "Regenerate or normalize the asset with its invariant locks, then preview every frame in-engine.",
  controls: "Separate the conflicting action binding and update animation, onboarding, and replay contracts together.",
  replay: "Record a fixed-tick seeded replay and approve the expected state hash intentionally.",
  tests: "Replace global or implementation-coupled checks with stable feature and owner IDs.",
  contracts: "Reconnect the missing dependency and rerun every system named by the feature contract.",
  release: "Repackage as a self-contained release and repeat CSP, offline, debug-strip, and byte-ledger checks.",
  performance: "Measure frame pacing, render CPU, draw calls, loading, and throttled degradation independently.",
  audio: "Move audio behind a user gesture and verify pause, mute, cancellation, resume, and offline behavior.",
  lifecycle: "Pause simulation and scheduled feedback on focus loss, then realign with simulation time on resume.",
  devices: "Open the named viewport overlay, clear HUD/touch exclusions, and capture a responsive screenshot.",
  accessibility: "Provide equivalent static feedback, focus behavior, and semantic status outside the canvas.",
  privacy: "Remove the private value from authored source, rotate any real credential, and rerun the local privacy preflight before export or publication.",
  gameplay: "Prune redundant or isolated verbs, implement every retained state change in runtime data, and bind it to a stable acceptance or replay test.",
  narrative: "Repair the source Narrative Contract, reconnect beats and endings to stable gameplay IDs, add readable delivery, then rerun its linked acceptance evidence.",
  tuning: "Repair the bounded Tuning Contract, rerun the deterministic search, then preview and play the non-dominated candidates before choosing explicitly.",
  presentation: "Repair the authored event mapping, preview sound and motion with reduced motion enabled and disabled, then rerun hostile-browser verification.",
  "game-shell": "Repair the authored title, play, pause, terminal, restart, and settings contract; then exercise its keyboard, focus, visibility, reduced-motion, audio, and headless controls in the exported browser artifact.",
  "visual-identity": "Repair the authored visual-identity contract or its referenced asset evidence, then regenerate affected assets and visually review the exact current source.",
  "motion-bodies": "Repair the authored path, ground anchor, collider, semantic input, support height, and linked executable acceptance evidence before another candidate run.",
  combat: "Repair the bounded combat program, authored collider/team/action references, and linked executable firing/hit/health evidence before another candidate run.",
  actors: "Repair the actor program's authored object, navigation, perception, elevation, route, and executable evidence references before another candidate run.",
  "collision-geometry": "Open the authored collision overlay, correct chain point order, normals, elevation, or tuning, then rerun deterministic movement, replay, and browser checks.",
  "elevation-transitions": "Open the authored ramp/stair overlay, repair world x/y/z points, corridor entry, collision-chain, navigation-link, and layer agreement, then rerun route, replay, and browser checks.",
  "tile-program": "Open the selected map's tile layers, repair exact palette, terrain-signature, chunk, projection, navigation, or collision-profile references, then preview and apply a fresh digest-bound patch before browser review.",
  "world-stream": "Open the continuous-world report, repair authored socket geometry, template eligibility, deterministic route, or residency budgets, then capture first-draw and unique-pixel seam evidence from the exact exported build.",
  "community-exchange": "Re-preview the exact retained Tiled or Aseprite source against the current canonical target, repair explicit dependencies or bindings, then apply a fresh source- and preview-digest receipt.",
};

function hashDigest(prefix, source) {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function doctorSourceProjection(project) {
  const source = { ...(project ?? {}) };
  for (const field of ["iteration", "iterationHistory", "iterationArchive", "build", "authoring", "workstreams", "agentRequests", "agentWorkLedger", "releaseVerification"]) delete source[field];
  if (Array.isArray(source.maps) && source.maps.length > 0) {
    source.maps = source.maps.map((map) => ({
      ...map,
      objects: map.objects ?? [],
      traversalPaths: map.traversalPaths ?? [],
      clearanceZones: map.clearanceZones ?? [],
      hudSafeAreas: map.hudSafeAreas ?? [],
    }));
    for (const field of [
      "activeMapId",
      "width",
      "height",
      "background",
      "gravity",
      "grid",
      "controlMode",
      "projection",
      "navigation",
      "objects",
      "traversalPaths",
      "elevationTransitions",
      "clearanceZones",
      "hudSafeAreas",
      "maxInteractionGap",
      "interactionPolicy",
    ]) delete source[field];
  }
  return source;
}

export function doctorSourceDigest(project) {
  return `source-${sha256Hex(canonicalJson(doctorSourceProjection(project)))}`;
}

function digestIssues(profile, issues, sourceDigest) {
  const source = JSON.stringify({ profile, sourceDigest, issues: issues.map((issue) => [issue.severity, issue.code, issue.mapId ?? "", issue.objectId ?? "", issue.assetId ?? "", issue.featureId ?? ""]).sort() });
  return hashDigest("doctor", source);
}

function assetBytes(asset) {
  if (typeof asset?.dataUrl !== "string") return 0;
  const base64 = asset.dataUrl.split(",")[1] ?? "";
  return Math.floor(base64.length * 0.75);
}

function addIssue(issues, severity, code, message, category, context = {}) {
  issues.push({ severity, code, message, category, ...context });
}

function analyzeWorkflow(project, issues, strict) {
  const iteration = project.iteration;
  if (!iteration?.id) addIssue(issues, strict ? "error" : "warning", "iteration-id", "The current candidate has no immutable iteration ID.", "workflow");
  if (iteration?.status && !["candidate", "verified", "promoted", "rejected", "rolled-back"].includes(iteration.status)) addIssue(issues, "error", "iteration-status", "The candidate lifecycle status is not supported.", "workflow");
  if (iteration?.status === "promoted" && iteration.verifiedAt == null) addIssue(issues, "error", "unverified-promotion", "This candidate is promoted without verification evidence.", "workflow");
  if (iteration?.readOnly === true && project.authoring?.dirty === true) addIssue(issues, "error", "snapshot-mutation", "A read-only rollback snapshot has been modified.", "workflow");
  if (iteration?.id && iteration.parentId === iteration.id) addIssue(issues, "error", "iteration-parent", "A candidate cannot be its own parent.", "workflow");
  const workstreams = project.workstreams ?? [];
  const ids = new Set();
  for (const stream of workstreams) {
    if (!stream.id || ids.has(stream.id)) addIssue(issues, "error", "workstream-id", "Workstreams require stable, unique IDs.", "workflow");
    ids.add(stream.id);
    if (!["completed", "active", "blocked", "pending"].includes(stream.status)) addIssue(issues, "error", "workstream-status", `${stream.name ?? stream.id} has an invalid queue status.`, "workflow", { workstreamId: stream.id });
  }
  if (workstreams.filter((stream) => stream.status === "active").length > 1) addIssue(issues, "warning", "multiple-active-workstreams", "More than one workstream is marked active; the next AI objective is ambiguous.", "workflow");
  for (const contradiction of project.specification?.contradictions ?? []) addIssue(issues, "error", "spec-contradiction", contradiction.message ?? "Two specification rules contradict each other.", "workflow", { files: contradiction.files });
}

function analyzeBuildFreshness(project, issues, strict) {
  const build = project.build;
  if (!build?.id) addIssue(issues, strict ? "error" : "warning", "build-id", "The preview has no visible build ID, so stale builds are hard to identify.", "build");
  if (build?.sourceRevision && build?.generatedFromRevision && build.sourceRevision !== build.generatedFromRevision) addIssue(issues, "error", "stale-build", `Build ${build.id ?? "unknown"} was generated from an older source revision.`, "build");
  if (build?.sourceTimestamp && build?.outputTimestamp && Date.parse(build.outputTimestamp) < Date.parse(build.sourceTimestamp)) addIssue(issues, "error", "output-older-than-source", "Generated output is older than its authoring source.", "build");
  if (build?.servedBuildId && build?.id && build.servedBuildId !== build.id) addIssue(issues, "error", "wrong-preview-server", `The browser is serving ${build.servedBuildId}, not current build ${build.id}.`, "build");
  if (project.authoring?.generatedArtifact === true) addIssue(issues, "error", "generated-source-edit", "A generated artifact is open for editing; changes belong in the authoring source.", "build");
}

export function analyzeVisualReadiness(project) {
  const maps = Array.isArray(project?.maps) && project.maps.length ? project.maps : [{ objects: project?.objects ?? [] }];
  const objects = maps.flatMap((map) => Array.isArray(map?.objects) ? map.objects : []);
  const assets = Array.isArray(project?.assets) ? project.assets : [];
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const visualIdentityReport = inspectVisualIdentity(project);
  const adoptedIdentity = visualIdentityReport.present && visualIdentityReport.identity?.status === "adopted" && visualIdentityReport.errors.length === 0;
  const identityDigest = visualIdentityReport.identityDigest;
  const identityStampedAssets = assets.filter((asset) => asset?.generator?.visualIdentityInherited === true && asset?.generator?.visualIdentityDigest === identityDigest);
  const requested = Boolean(
    project?.designBrief
    || project?.scaffold?.artDirection
    || visualIdentityReport.present
    || (project?.agentRequests ?? []).some((request) => request?.status === "completed"),
  );
  const primaryObjects = objects.filter((object) => ["player", "platform", "hazard", "goal"].includes(object?.kind));
  const coveredPrimary = primaryObjects.filter((object) => object?.assetId && assetById.has(object.assetId));
  const primaryCoverage = primaryObjects.length ? coveredPrimary.length / primaryObjects.length : 0;
  const players = primaryObjects.filter((object) => object?.kind === "player");
  const playerAssets = players.map((object) => assetById.get(object.assetId)).filter(Boolean);
  const playerIdentityReady = players.length > 0
    && playerAssets.length === players.length
    && playerAssets.every((asset) => asset.type === "sprite" && Number(asset.frames ?? 0) >= 2);
  const referencedAssets = [...new Map(objects.map((object) => [object?.assetId, assetById.get(object?.assetId)]).filter(([, asset]) => asset).map(([, asset]) => [asset.id, asset])).values()];
  const styledAssets = referencedAssets.filter((asset) => asset.generator?.styleId || asset.generator?.artDirectionId || asset.generator?.palettePolicy);
  const styleIds = new Set(styledAssets.map((asset) => asset.generator?.styleId ?? asset.generator?.artDirectionId).filter(Boolean));
  const styleMetadataRatio = referencedAssets.length ? styledAssets.length / referencedAssets.length : 0;
  const matchingIdentityAssets = referencedAssets.filter((asset) => asset?.generator?.visualIdentityInherited === true && asset?.generator?.visualIdentityDigest === identityDigest);
  const identityReceiptRatio = referencedAssets.length ? matchingIdentityAssets.length / referencedAssets.length : 0;
  const artDirectionCohesive = adoptedIdentity
    ? referencedAssets.length > 0 && identityReceiptRatio >= 0.75
    : referencedAssets.length > 0 && styleMetadataRatio >= 0.75 && styleIds.size >= 1 && styleIds.size <= 2;
  const pipelineAssets = [...new Map([...playerAssets, ...referencedAssets.filter((asset) => asset.type === "sprite" && Number(asset.frames ?? 0) > 1)].map((asset) => [asset.id, asset])).values()];
  const spritePipelineProven = pipelineAssets.length > 0 && pipelineAssets.every((asset) => {
    const invariants = asset.invariants ?? {};
    const analysis = asset.analysis ?? {};
    const paletteProof = Boolean(invariants.palette || invariants.paletteSourcePreserved === true || analysis.onPalette === true);
    const anchorProof = Boolean(invariants.anchor || invariants.groundAnchor === true || asset.anchorMode);
    const scaleProof = Boolean(invariants.scale || invariants.sharedScale === true || analysis.sharedScale === true);
    const measurementProof = asset.generator?.source !== "openai-image-api" || (analysis.measured === true && typeof analysis.measurementVersion === "string" && analysis.measurementVersion.length > 0);
    const failed = Array.isArray(analysis.failedInvariants) && analysis.failedInvariants.length > 0;
    return paletteProof && anchorProof && scaleProof && measurementProof && analysis.onPalette !== false && analysis.sharedScale !== false && !failed;
  });
  const checks = [
    { id: "primary-art-coverage", passed: primaryObjects.length > 0 && primaryCoverage >= 0.75, detail: `${coveredPrimary.length}/${primaryObjects.length} player, platform, hazard, and goal objects use authored visual assets.` },
    { id: "player-animation-identity", passed: playerIdentityReady, detail: playerIdentityReady ? `${players.length} player placement${players.length === 1 ? "" : "s"} use a multi-frame identity sprite.` : "Every player placement needs the same intentional multi-frame character identity." },
    { id: "art-direction-cohesion", passed: artDirectionCohesive, detail: adoptedIdentity ? `${matchingIdentityAssets.length}/${referencedAssets.length} referenced assets carry the exact adopted visual-identity digest.` : `${styledAssets.length}/${referencedAssets.length} referenced assets carry style, art-direction, or palette policy metadata across ${styleIds.size} style ID${styleIds.size === 1 ? "" : "s"}.` },
    { id: "sprite-pipeline-proof", passed: spritePipelineProven, detail: spritePipelineProven ? `${pipelineAssets.length} animated or player sprite asset${pipelineAssets.length === 1 ? "" : "s"} carry palette, shared-scale, and anchor proof.` : "Animated and player sprites need source-bound palette, shared-scale, and anchor proof." },
  ];
  if (visualIdentityReport.present) checks.push({ id: "visual-identity-contract", passed: adoptedIdentity, detail: adoptedIdentity
    ? `Adopted identity ${identityDigest} resolves ${visualIdentityReport.metrics.referenceCount} reference${visualIdentityReport.metrics.referenceCount === 1 ? "" : "s"}.`
    : `Visual identity is ${visualIdentityReport.status}; adopt a valid reviewed contract before treating it as the project baseline.` });
  const passedCount = checks.filter((check) => check.passed).length;
  const score = requested ? Math.round((passedCount / checks.length) * 100) : null;
  return {
    requested,
    status: !requested ? "not-requested" : score === 100 ? "measurably-ready" : score >= 75 ? "review" : "needs-art-pass",
    score,
    passedCount,
    checkCount: checks.length,
    checks,
    metrics: {
      primaryObjectCount: primaryObjects.length,
      coveredPrimaryCount: coveredPrimary.length,
      primaryCoverage,
      playerCount: players.length,
      referencedAssetCount: referencedAssets.length,
      styleMetadataRatio,
      styleIdCount: styleIds.size,
      pipelineAssetCount: pipelineAssets.length,
      visualIdentityPresent: visualIdentityReport.present,
      visualIdentityStatus: visualIdentityReport.status,
      visualIdentityDigest: identityDigest,
      identityStampedAssetCount: identityStampedAssets.length,
      identityReceiptRatio,
    },
    aestheticApproval: "not-claimed",
    visualIdentityReport,
    limitation: "These checks measure coverage, character identity, style metadata, and sprite-pipeline proof. They do not judge taste, composition, originality, or whether the art looks good.",
  };
}

function analyzeAssets(project, issues, strict) {
  const assets = project.assets ?? [];
  for (const asset of assets) {
    const context = { assetId: asset.id };
    if (asset.collisionPolicy && asset.collisionPolicy !== "authored-only") addIssue(issues, "error", "generated-collision", `${asset.name} can redefine gameplay collision.`, "assets", context);
    if (asset.type === "sprite") {
      const invariants = asset.invariants;
      if (strict && !invariants) addIssue(issues, "warning", "missing-asset-invariants", `${asset.name} has no identity, palette, scale, anchor, or equipment locks.`, "assets", context);
      const analysis = asset.analysis ?? {};
      if ((analysis.silhouetteDrift ?? 0) > (invariants?.maxSilhouetteDrift ?? 0.14)) addIssue(issues, "error", "silhouette-drift", `${asset.name} changes scale or proportions across frames.`, "assets", context);
      if ((analysis.anchorVariance ?? 0) > (invariants?.maxAnchorVariance ?? 1)) addIssue(issues, "error", "anchor-drift", `${asset.name}'s ground-contact point moves across frames.`, "assets", context);
      if ((analysis.characterCountMax ?? 1) > 1) addIssue(issues, "error", "duplicate-character", `${asset.name} contains duplicated characters or frame leakage.`, "assets", context);
      if ((analysis.haloPixelRatio ?? 0) > 0.01) addIssue(issues, "warning", "alpha-halo", `${asset.name} retains a transparent-edge halo or chroma residue.`, "assets", context);
      for (const invariant of analysis.failedInvariants ?? []) addIssue(issues, "error", "asset-invariant", `${asset.name} changed locked invariant: ${invariant}.`, "assets", context);
    }
    if (asset.generator?.source === "openai-image-api") {
      const actions = Array.isArray(asset.invariants?.actions) ? asset.invariants.actions : [];
      if (asset.invariants?.providerNormalized !== true) addIssue(issues, "error", "ai-art-not-normalized", `${asset.name} is still provider source art instead of a normalized game asset.`, "assets", context);
      if (asset.invariants?.analysisMeasured !== true || asset.analysis?.measured !== true || typeof asset.analysis?.measurementVersion !== "string" || !asset.analysis.measurementVersion) addIssue(issues, "error", "ai-art-analysis-unmeasured", `${asset.name} claims provider normalization without source-bound pixel measurements.`, "assets", context);
      if (asset.invariants?.transparentBackground !== true) addIssue(issues, "error", "ai-art-not-transparent", `${asset.name} did not prove transparent final output.`, "assets", context);
      if (asset.invariants?.sharedScale !== true || asset.analysis?.sharedScale !== true) addIssue(issues, "error", "ai-art-scale-unproven", `${asset.name} did not prove one shared scale across every frame.`, "assets", context);
      if (!asset.generator?.model || !/^[0-9a-f]{64}$/i.test(String(asset.generator?.promptDigest ?? ""))) addIssue(issues, "error", "ai-art-provenance", `${asset.name} is missing its provider model or prompt digest.`, "assets", context);
      if (actions.length !== asset.frames) addIssue(issues, "error", "ai-art-frame-order", `${asset.name} has ${asset.frames} packed frames but ${actions.length} ordered frame labels.`, "assets", context);
      if (!Number.isFinite(Number(asset.analysis?.sourceEncodedBytes)) || Number(asset.analysis?.sourceEncodedBytes) <= 0) addIssue(issues, "warning", "ai-art-source-size", `${asset.name} is missing its provider-source byte measurement.`, "assets", context);
      if (Number(asset.analysis?.sourceAnchorVariance ?? 0) > Math.max(2, Number(asset.invariants?.maxAnchorVariance ?? 1) * 4)) addIssue(issues, "warning", "ai-art-source-anchor-correction", `${asset.name} required a large source-anchor correction before packing; review every frame against the common ground contact.`, "assets", context);
      if (asset.collisionPolicy !== "authored-only") addIssue(issues, "error", "ai-art-collision-owner", `${asset.name} attempts to own collision instead of leaving it to authored map data.`, "assets", context);
    }
    if (asset.generator?.containsText === true && asset.analysis?.textVerified !== true) addIssue(issues, "warning", "unverified-generated-text", `${asset.name} contains AI-generated text that has not been checked.`, "assets", context);
  }
  const visualReadiness = analyzeVisualReadiness(project);
  if (visualReadiness.requested) {
    const issueByCheck = {
      "primary-art-coverage": ["primary-art-coverage", "Fewer than 75% of primary gameplay objects use authored visual assets; the scene still reads as a placeholder mix."],
      "player-animation-identity": ["player-animation-identity", "The player lacks one intentional multi-frame character identity across its map placements."],
      "art-direction-cohesion": ["art-direction-cohesion", "Referenced assets do not yet carry enough shared style, art-direction, or palette-policy metadata to prove cohesion."],
      "sprite-pipeline-proof": ["sprite-pipeline-proof", "Player or animated sprites are missing palette, shared-scale, or anchor proof from the sprite pipeline."],
    };
    for (const check of visualReadiness.checks.filter((candidate) => !candidate.passed)) {
      const [code, message] = issueByCheck[check.id];
      addIssue(issues, "warning", code, message, "assets", { visualReadinessCheckId: check.id });
    }
  } else {
    const primary = (project.objects ?? []).filter((object) => ["player", "platform", "hazard", "goal"].includes(object.kind));
    const styled = primary.filter((object) => object.assetId).length;
    if (primary.length >= 4 && styled > 0 && styled < Math.ceil(primary.length * 0.5)) addIssue(issues, "warning", "visual-tier-mismatch", "Generated and placeholder art are mixed across primary gameplay objects.", "assets");
  }
  return visualReadiness;
}

function analyzeInputs(project, issues, strict) {
  const actions = project.inputActions ?? [];
  const byBinding = new Map();
  for (const action of actions) {
    for (const binding of action.bindings ?? []) {
      const entries = byBinding.get(binding) ?? [];
      entries.push(action);
      byBinding.set(binding, entries);
    }
    if (action.animationState == null) addIssue(issues, strict ? "warning" : "info", "input-animation", `${action.label ?? action.id} has no linked animation state.`, "controls", { actionId: action.id });
    if (action.onboarding === false) addIssue(issues, "warning", "input-onboarding", `${action.label ?? action.id} is missing from onboarding.`, "controls", { actionId: action.id });
    if (action.replayEvent === false) addIssue(issues, "warning", "input-replay", `${action.label ?? action.id} is not represented in replay files.`, "controls", { actionId: action.id });
  }
  for (const [binding, entries] of byBinding) {
    if (entries.length < 2) continue;
    const ids = entries.map((entry) => entry.id);
    const ambiguous = unrelatedVerbFamilies.some((family) => ids.filter((id) => family.has(id)).length > 1);
    if (ambiguous) addIssue(issues, "error", "overloaded-input", `${binding} triggers unrelated actions: ${ids.join(", ")}.`, "controls", { binding });
  }
  for (const chord of project.inputPolicy?.impossibleChords ?? []) addIssue(issues, "error", "impossible-chord", `${chord.join(" + ")} cannot be used reliably together.`, "controls");
  if (strict && actions.length === 0) addIssue(issues, "warning", "input-contract", "No explicit input-action contract exists.", "controls");
  const liveness = analyzeInputActionLiveness(project);
  for (const action of liveness.actions.filter((candidate) => candidate.classification === "dead")) {
    addIssue(
      issues,
      strict ? "error" : "warning",
      "input-action-dead",
      `${action.label || action.actionId} is declared but has no executable runtime consumer.`,
      "controls",
      {
        actionId: action.actionId,
        bindings: action.bindings,
        intentReferences: action.intentReferences,
        action: `Connect ${action.actionId} to an enabled gameplay input rule, a choice, or a real player control; otherwise remove the declaration. Then rerun Project Doctor and the browser harness.`,
        invalidates: ["inputActions", "gameplayProgram", "verbArchitecture", "candidate-verification"],
        evidenceRequired: ["input-action-liveness", "browser-harness"],
      },
    );
  }
  return liveness;
}

function analyzeReplayAndTests(project, issues, strict, sourceDigest) {
  const replay = project.replay;
  if (strict && !replay) addIssue(issues, "warning", "replay-contract", "No deterministic replay contract exists for regression testing.", "replay");
  let replayResults = { schemaVersion: "looplab-replay-result/v1", status: replay ? "no-fixtures" : "not-configured", passed: false, caseCount: 0, passedCount: 0, failedCount: 0, recordableCount: 0, firstDivergence: null, cases: [] };
  if (replay) {
    if (!Number.isFinite(replay.tickRate) || replay.tickRate <= 0) addIssue(issues, "error", "fixed-tick", "Replay simulation needs a fixed positive tick rate.", "replay");
    if (!replay.version) addIssue(issues, "error", "replay-version", "Replay files need an explicit format version.", "replay");
    if (replay.seed == null) addIssue(issues, "warning", "replay-seed", "Randomness is not seeded for deterministic replay.", "replay");
    if (strict && (replay.cases ?? []).length === 0) addIssue(issues, "warning", "replay-fixtures-missing", "No executable deterministic replay fixture protects the shipped gameplay route.", "replay");
    try {
      replayResults = runReplaySuite(project);
      for (const result of replayResults.cases) {
        if (result.status === "recordable") addIssue(issues, "warning", "replay-hash", `${result.caseId} has inputs but no approved deterministic state checkpoints.`, "replay", { replayCaseId: result.caseId });
        if (result.status === "failed") addIssue(issues, "error", "replay-diverged", `${result.caseId} first diverged at simulation tick ${result.firstMismatchTick}.`, "replay", { replayCaseId: result.caseId, tick: result.firstMismatchTick, expectedHash: result.mismatches[0]?.expectedHash, actualHash: result.mismatches[0]?.actualHash });
      }
    } catch (error) {
      replayResults = { ...replayResults, status: "invalid", error: error instanceof Error ? error.message : String(error) };
      addIssue(issues, "error", "replay-execution", `Replay fixtures could not execute: ${replayResults.error}`, "replay");
    }
  }
  for (const test of project.acceptanceTests ?? []) {
    if (test.assertion === "global-count") addIssue(issues, "warning", "brittle-global-count", `${test.name ?? test.id} asserts a global count instead of semantic ownership.`, "tests", { testId: test.id });
    if (!test.featureId && !test.ownerId) addIssue(issues, "warning", "test-ownership", `${test.name ?? test.id} does not identify a stable feature or owner ID.`, "tests", { testId: test.id });
    if (test.buildId && project.build?.id && test.buildId !== project.build.id) addIssue(issues, "error", "test-wrong-build", `${test.name ?? test.id} ran against build ${test.buildId}, not ${project.build.id}.`, "tests", { testId: test.id });
  }
  let acceptanceResults;
  try {
    acceptanceResults = runAcceptanceSuite(project, { sourceDigest });
  } catch (error) {
    acceptanceResults = { schemaVersion: "looplab-acceptance-result/v1", status: "invalid", passed: false, testCount: 0, executableCount: 0, passedCount: 0, failedCount: 0, invalidCount: 1, specifiedCount: 0, tests: [], error: error instanceof Error ? error.message : String(error) };
    addIssue(issues, "error", "acceptance-execution", `Acceptance tests could not execute: ${acceptanceResults.error}`, "tests");
  }
  for (const result of acceptanceResults.tests ?? []) {
    if (result.status === "failed") addIssue(issues, "error", "acceptance-failed", `${result.testId} failed at assertion ${result.firstFailure?.id ?? "unknown"} after simulation tick ${result.firstFailure?.tick ?? result.tickCount}.`, "tests", { testId: result.testId, assertionId: result.firstFailure?.id, tick: result.firstFailure?.tick });
    if (result.status === "invalid") addIssue(issues, "error", "acceptance-invalid", `${result.testId} is not executable: ${(result.errors ?? []).join(" ")}`, "tests", { testId: result.testId });
  }
  const acceptancePlan = getAcceptancePlan(project, { sourceDigest, acceptanceResults, replayResults });
  if (acceptancePlan.verbSpecOnlyIds.length) addIssue(issues, strict ? "error" : "warning", "acceptance-spec-only", `Prose-only acceptance specifications do not prove verb behavior: ${acceptancePlan.verbSpecOnlyIds.join(", ")}.`, "tests", { testIds: acceptancePlan.verbSpecOnlyIds });
  if (acceptancePlan.staleIds.length) addIssue(issues, "warning", "acceptance-stale", `Referenced acceptance evidence targets stale source or specification digests: ${acceptancePlan.staleIds.join(", ")}.`, "tests", { testIds: acceptancePlan.staleIds });
  return { replayResults, acceptanceResults, acceptancePlan };
}

function analyzeContracts(project, issues, strict) {
  const contracts = project.featureContracts ?? [];
  if (strict && contracts.length === 0) addIssue(issues, "warning", "feature-contracts", "No feature contract links art, collision, controls, feedback, and tests.", "contracts");
  const ids = new Set();
  const acceptanceIds = new Set((project.acceptanceTests ?? []).map((test) => test?.id).filter(Boolean));
  for (const contract of contracts) {
    if (!contract.id || ids.has(contract.id)) addIssue(issues, "error", "feature-id", "Feature contracts require stable, unique IDs.", "contracts");
    ids.add(contract.id);
    for (const link of REQUIRED_CONTRACT_LINKS) if (contract[link] == null) addIssue(issues, "warning", "contract-link", `${contract.name ?? contract.id} is missing its ${link} link.`, "contracts", { featureId: contract.id, link });
    const linkedTests = Array.isArray(contract.acceptanceTests) ? contract.acceptanceTests : typeof contract.acceptanceTests === "string" ? [contract.acceptanceTests] : [];
    for (const testId of linkedTests) if (!acceptanceIds.has(testId)) addIssue(issues, "error", "contract-test-missing", `${contract.name ?? contract.id} references missing acceptance test ${testId}.`, "contracts", { featureId: contract.id, testId });
    if (contract.dirtyDependencies?.length) addIssue(issues, "error", "contract-dirty", `${contract.name ?? contract.id} changed; rebuild or reverify ${contract.dirtyDependencies.join(", ")}.`, "contracts", { featureId: contract.id });
  }
}

function analyzeVerbArchitecture(project, issues, strict, evidence = {}) {
  const required = project.qualityContracts?.verbArchitectureRequired === true;
  const inspection = inspectVerbArchitecture(project, project?.verbArchitecture, evidence);
  if (!inspection.present) {
    if (required) addIssue(issues, strict ? "error" : "warning", "verb-architecture-missing", "The brief promises a designed verb system, but the project has no machine-readable verb architecture.", "gameplay");
    return inspection;
  }

  for (const message of inspection.errors) addIssue(issues, "error", "verb-architecture-invalid", message, "gameplay");
  for (const message of inspection.warnings) {
    if (/pair\(s\) have not been scored|lack complete runtime|lack complete acceptance|lacks complete runtime feedback|Standalone verb .* has no independent|Relationship .* (has no authored application|appears only at mastery\/finale|is marked recurring|has no teaching|has no pressure)|must define both failure and recovery|repeatable core loop is incomplete|Resource loops have unresolved/.test(message)) continue;
    addIssue(issues, strict ? "error" : "warning", "verb-architecture-incomplete", message, "gameplay");
  }
  if (inspection.missingPairs.length) addIssue(issues, strict ? "error" : "warning", "verb-pair-coverage", `${inspection.missingPairs.length} selected verb pair(s) are unscored: ${inspection.missingPairs.join(", ")}.`, "gameplay");
  if (inspection.implementationGaps.length) addIssue(issues, strict ? "error" : "warning", "verb-runtime-evidence", `Runtime implementation IDs are missing or unresolved for ${inspection.implementationGaps.join(", ")}.`, "gameplay");
  if (inspection.testGaps.length) addIssue(issues, strict ? "error" : "warning", "verb-test-evidence", `Acceptance or replay test IDs are missing or unresolved for ${inspection.testGaps.join(", ")}.`, "gameplay");
  if (inspection.feedbackGaps?.length) addIssue(issues, strict ? "error" : "warning", "verb-feedback-coverage", `Readable runtime feedback is missing or unresolved for ${inspection.feedbackGaps.join(", ")}.`, "gameplay");
  if (inspection.independentUseGaps?.length) addIssue(issues, strict ? "error" : "warning", "verb-independent-use", `Standalone verbs need an independent authored application: ${inspection.independentUseGaps.join(", ")}.`, "gameplay");
  if (inspection.relationshipUseGaps?.length) addIssue(issues, strict ? "error" : "warning", "verb-relationship-coverage", `Verb relationships need recurring teaching and pressure/mastery use instead of a finale-only checklist: ${inspection.relationshipUseGaps.join(", ")}.`, "gameplay");
  if (inspection.recoveryGaps?.length) addIssue(issues, strict ? "error" : "warning", "verb-recovery-coverage", `Gameplay applications need explicit failure and recovery: ${inspection.recoveryGaps.join(", ")}.`, "gameplay");
  if (inspection.loopGaps?.length) addIssue(issues, strict ? "error" : "warning", "verb-core-loop-coverage", `The repeatable decide-act-feedback loop is incomplete: ${inspection.loopGaps.join(", ")}.`, "gameplay");
  if (inspection.resourceGaps?.length) addIssue(issues, strict ? "error" : "warning", "verb-resource-loop-coverage", `Resource state, sources, sinks, pressure, or recovery are incomplete: ${inspection.resourceGaps.join(", ")}.`, "gameplay");
  if (inspection.progressionGaps?.length) addIssue(issues, "error", "verb-progression-coverage", `Verb-system progression is invalid: ${inspection.progressionGaps.join(", ")}.`, "gameplay");
  if (inspection.architecture.status === "verified" && (inspection.errors.length || inspection.warnings.length)) {
    addIssue(issues, "error", "verb-architecture-false-verification", "The verb architecture is marked verified while its design or evidence checks still have findings.", "gameplay");
  }
  return inspection;
}

function analyzeGameplayProgram(project, issues, strict) {
  const required = project.qualityContracts?.gameplayProgramRequired === true;
  const inspection = inspectGameplayProgram(project);
  if (!inspection.present) {
    if (required) addIssue(issues, strict ? "error" : "warning", "gameplay-program-missing", "The candidate promises runtime gameplay systems but has no deterministic gameplay program.", "gameplay");
    return inspection;
  }
  for (const message of inspection.errors) addIssue(issues, "error", "gameplay-program-invalid", message, "gameplay");
  for (const message of inspection.warnings) addIssue(issues, strict ? "error" : "warning", "gameplay-program-incomplete", message, "gameplay");
  if (required && inspection.metrics.executableRuleCount + inspection.metrics.choiceCount === 0) addIssue(issues, strict ? "error" : "warning", "gameplay-program-empty", "The runtime gameplay program has no enabled rules or authored choices.", "gameplay");
  return inspection;
}

function analyzeTemplateAdaptation(project, issues, strict) {
  const provenance = project.templateProvenance;
  if (!provenance || !project.designBrief) return;
  if (provenance.adaptationStatus === "starter") {
    addIssue(issues, strict ? "error" : "warning", "template-adaptation-pending", `The ${provenance.id ?? "starter"} scaffold is still marked as an unadapted starting point.`, "gameplay");
  }
  if (provenance.id !== "dimetric" || Number(provenance.version) < 2) return;
  const maps = project.maps?.length ? project.maps : [{ objects: project.objects ?? [], traversalPaths: project.traversalPaths ?? [] }];
  const objectById = new Map(maps.flatMap((map) => map.objects ?? []).map((object) => [object.id, object]));
  const pathById = new Map(maps.flatMap((map) => map.traversalPaths ?? []).map((path) => [path.id, path]));
  const residue = [
    objectById.get("player")?.name === "Dimetric player" ? "player:Dimetric player" : null,
    objectById.get("route-token-a")?.name === "Sample marker A" ? "object:Sample marker A" : null,
    objectById.get("route-token-b")?.name === "Sample marker B" ? "object:Sample marker B" : null,
    objectById.get("goal")?.name === "Route end" ? "goal:Route end" : null,
    pathById.get("ground-passage-route")?.name === "Ground passage route" ? "path:Ground passage route" : null,
    pathById.get("raised-passage-route")?.name === "Raised passage route" ? "path:Raised passage route" : null,
  ].filter(Boolean);
  if (residue.length) addIssue(issues, strict ? "error" : "warning", "template-semantic-residue", `${residue.length} neutral starter semantic label(s) still need game-specific authored meaning: ${residue.join(", ")}.`, "gameplay");
}

function analyzeRelease(project, issues, strict, sourceDigest) {
  const release = project.release ?? {};
  if ((release.externalRequests ?? []).length) addIssue(issues, "error", "external-release-request", "The single-file release still depends on external requests.", "release");
  if ((release.debugMarkers ?? []).length) addIssue(issues, "warning", "debug-in-release", "Debug code or markers are present in the release candidate.", "release");
  if (release.cspValidated === false) addIssue(issues, "error", "csp-invalid", "The packaged game fails its Content Security Policy check.", "release");
  if (release.offlineVerified === false) addIssue(issues, "error", "offline-failure", "The packaged game does not continue offline.", "release");
  if (strict && release.offlineVerified !== false) {
    const verification = validateReleaseVerification(project.releaseVerification, { sourceDigest, runtimeVersion: LOOPLAB_EXPORTED_RUNTIME_VERSION });
    if (!verification.valid) {
      const legacy = release.offlineVerified === true ? " A legacy offlineVerified=true flag is not verification evidence." : "";
      addIssue(
        issues,
        "warning",
        "offline-unverified",
        `The exact one-file HTML has no current source- and artifact-bound browser attestation.${legacy} ${verification.errors[0] ?? "Run the release verifier."}`.trim(),
        "release",
        {
          action: "Run the canonical release verifier against the exact generated HTML with visual captures, then retain its structured attestation.",
          invalidates: ["release-verification", "candidate-verification"],
          evidenceRequired: ["looplab-release-verification/v1"],
        },
      );
    }
  }
  const bytes = (project.assets ?? []).reduce((total, asset) => total + assetBytes(asset), 0);
  if (bytes > (project.packageBudgetBytes ?? 2_000_000)) addIssue(issues, "warning", "package-budget", "Embedded asset bytes exceed the configured single-file budget.", "release");
  const performance = project.performance ?? {};
  if (performance.combinedScore != null) addIssue(issues, "warning", "combined-performance-score", "Frame pacing, render CPU, draw calls, loading, and degradation should be reported separately.", "performance");
  if (project.audio?.enabled && project.audio.unlockOnGesture !== true) addIssue(issues, "error", "audio-unlock", "Audio must remain locked until a user gesture.", "audio");
  if (project.audio?.enabled && project.audio.cancelOnPause !== true) addIssue(issues, "warning", "audio-cancel", "Pause and mute must cancel scheduled simulation-aligned audio.", "audio");
  if (project.lifecycle?.pauseOnBlur === false) addIssue(issues, "warning", "focus-pause", "The game keeps simulating after browser focus is lost.", "lifecycle");
}

function analyzeReuseGuideContracts(project, issues, strict) {
  if (project.schemaVersion === undefined) {
    if (strict) addIssue(issues, "info", "schema-version-unrecorded", `Record project schema ${LOOPLAB_PROJECT_SCHEMA_VERSION} before the next authored migration.`, "contracts");
  } else if (project.schemaVersion !== LOOPLAB_PROJECT_SCHEMA_VERSION) {
    addIssue(issues, "error", "schema-version-unsupported", `Project schema ${project.schemaVersion} is not supported; migrate it explicitly to ${LOOPLAB_PROJECT_SCHEMA_VERSION}.`, "contracts");
  }

  const release = project.release ?? {};
  if (release.serviceWorker === true || release.pwa === true || release.cacheApiRequired === true) {
    addIssue(issues, "error", "one-file-pwa-conflict", "Service workers, Cache API dependencies, and multi-file PWA output are outside the one-uploadable-HTML contract.", "release");
  }

  const architecture = project.qualityContracts?.architecture;
  if (!architecture) {
    if (strict) addIssue(issues, "info", "architecture-boundary-unrecorded", "Record the simulation, renderer, fixed-step, camera, and generated-art ownership boundaries.", "contracts");
  } else {
    if (architecture.simulationStateSerializable === false) addIssue(issues, "error", "renderer-owned-simulation", "Simulation and saveable state must remain serializable and independent from renderer objects.", "replay");
    if (architecture.rendererDisposableAdapter === false) addIssue(issues, "error", "renderer-not-adapter", "Canvas, Phaser, Pixi, or melonJS must remain a disposable view/browser adapter rather than gameplay truth.", "contracts");
    if (architecture.semanticInputActions === false) addIssue(issues, "error", "physical-input-owned-rules", "Gameplay rules consume semantic actions, not direct DOM keyboard or pointer events.", "controls");
    if (architecture.cameraPresentationOnly === false) addIssue(issues, "error", "camera-owned-gameplay", "Camera state cannot determine collision, progression, or saveable gameplay truth.", "replay");
    if (architecture.generatedArtOwnsCollision === true) addIssue(issues, "error", "generated-art-collision", "Generated pixels cannot own collision or traversal geometry.", "maps");
    const fixedStepHz = Number(architecture.fixedStepHz);
    if (!Number.isFinite(fixedStepHz) || fixedStepHz <= 0) addIssue(issues, "error", "fixed-step-invalid", "The renderer-independent simulation needs a positive fixed-step frequency.", "replay");
    else if (project.replay?.tickRate && fixedStepHz !== Number(project.replay.tickRate)) addIssue(issues, "error", "replay-tick-mismatch", `The ${fixedStepHz} Hz simulation does not match the ${project.replay.tickRate} Hz replay contract.`, "replay");
    const catchUpSteps = Number(architecture.maximumCatchUpSteps);
    if (!Number.isInteger(catchUpSteps) || catchUpSteps < 1) addIssue(issues, "error", "catch-up-cap-invalid", "Fixed-step simulation needs a positive integer maximum catch-up count.", "performance");
    else if (catchUpSteps > 8) addIssue(issues, "warning", "catch-up-cap-high", `${catchUpSteps} catch-up steps can create a spiral of death after a long frame.`, "performance");
  }
}

function analyzeTraversalPaths(project, issues, strict) {
  const maps = project.maps?.length ? project.maps : [{ id: project.activeMapId ?? "map-main", width: project.width, height: project.height, traversalPaths: project.traversalPaths ?? [] }];
  const acceptanceIds = new Set((project.acceptanceTests ?? []).map((test) => test.id));
  for (const map of maps) {
    const pathIds = new Set((map.traversalPaths ?? []).map((path) => path.id));
    for (const path of map.traversalPaths ?? []) {
      const context = { mapId: map.id, featureId: path.id };
      if (path.collisionOwner !== "authored-map") addIssue(issues, "error", "traversal-authority", `${path.name ?? path.id} lets artwork or runtime inference own its traversal path.`, "maps", context);
      if (!Array.isArray(path.points) || path.points.length < 2) addIssue(issues, "error", "traversal-points", `${path.name ?? path.id} needs at least two authored control points.`, "maps", context);
      for (const point of path.points ?? []) if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > map.width || point.y > map.height) {
        addIssue(issues, "error", "traversal-point-bounds", `${path.name ?? path.id} contains a control point outside ${map.id}.`, "maps", context);
        break;
      }
      if (!Number.isFinite(path.entryRadius) || path.entryRadius <= 0 || !Number.isFinite(path.minimumEntrySpeed) || path.minimumEntrySpeed < 0 || !["both", "forward", "reverse"].includes(path.direction)) {
        addIssue(issues, "error", "traversal-entry-contract", `${path.name ?? path.id} has an invalid entry radius, speed, or direction rule.`, "maps", context);
      }
      const missingTransfer = (path.transferPathIds ?? []).find((id) => !pathIds.has(id));
      if (missingTransfer) addIssue(issues, "error", "traversal-transfer-target", `${path.name ?? path.id} transfers to missing path ${missingTransfer}.`, "maps", context);
      if (strict && (!path.acceptanceTestId || !acceptanceIds.has(path.acceptanceTestId))) addIssue(issues, "warning", "traversal-test-missing", `${path.name ?? path.id} has no linked acceptance test for entry, travel, transfer, exit, and bail behavior.`, "tests", context);
    }
  }

  const highSpeedGame = project.designBrief?.movementTemplate === "kinetic-runner" || project.designBrief?.genre === "skating-tricks";
  const highSpeedPolicy = project.qualityContracts?.collision2d?.highSpeedPolicy;
  if (highSpeedPolicy !== undefined && !["fixed-step", "substeps", "swept-aabb"].includes(highSpeedPolicy)) addIssue(issues, "error", "high-speed-policy-invalid", `${highSpeedPolicy} is not a supported high-speed collision policy.`, "maps");
  if (highSpeedGame && highSpeedPolicy == null) addIssue(issues, "warning", "high-speed-policy-missing", "This high-speed movement template has no recorded fixed-step, substep, or swept-AABB collision policy.", "maps");
  if (highSpeedGame && highSpeedPolicy === "fixed-step") addIssue(issues, "warning", "high-speed-sweep-recommended", "Fixed-step collision alone may tunnel through thin rails or barriers; verify substeps or swept AABB at maximum speed.", "maps");
}

function analyzeBrowser2DContracts(project, issues, strict) {
  if ((project.runtimeProfile?.dimension ?? "2d") !== "2d") return;
  const framework = project.runtimeProfile?.framework === "standalone" ? "canvas" : project.runtimeProfile?.framework ?? "canvas";
  const release = project.release ?? {};
  const exportProfile = release.exportProfile === "hosted" ? "hosted" : "strict";
  const contracts = project.qualityContracts;

  if (release.singleFile === false) addIssue(issues, "error", "single-file-disabled", "This project is configured to produce more than one upload file.", "release");
  if (release.networkFree === false) addIssue(issues, "error", "network-dependent-release", "The uploaded HTML still requires a network connection.", "release");
  if (release.storageFree === false && exportProfile !== "hosted") addIssue(issues, "error", "storage-dependent-release", "Strict export requires browser storage that may be unavailable in a sandboxed upload.", "release");
  if ((release.moduleImports ?? []).length) addIssue(issues, "error", "external-module-import", "The one-file game still contains module imports instead of an inlined browser runtime.", "release");
  if (release.runtimeBundleEmbedded === false) addIssue(issues, "error", "runtime-not-embedded", "The selected game runtime is not embedded in the HTML artifact.", "release");
  if (release.assetLookupValidated === false) addIssue(issues, "error", "asset-lookup-invalid", "At least one runtime asset reference bypasses the embedded asset manifest.", "release");

  const expectedDelivery = framework === "phaser" ? "inline-script-tag" : framework === "pixi" ? "inline-umd-with-official-csp-polyfill" : framework === "melon" ? "tree-shaken-inline-iife" : "built-in-inline";
  if (release.engineDelivery && release.engineDelivery !== expectedDelivery) {
    addIssue(issues, "error", "engine-delivery", `${framework} must use ${expectedDelivery} delivery for a self-contained HTML export.`, "release");
  } else if (strict && release.singleFile !== false && !release.engineDelivery) {
    addIssue(issues, "info", "engine-delivery-unrecorded", `Record ${expectedDelivery} as the ${framework} delivery contract before release evidence is collected.`, "release");
  }

  if (!contracts) {
    addIssue(issues, "info", "browser-2d-contracts", "No explicit Canvas, collision, input, presentation, or palette quality contract is recorded yet.", "contracts");
    return;
  }

  const canvas = contracts.canvas2d ?? {};
  if (canvas.fixedBackbuffer === false) addIssue(issues, "warning", "variable-backbuffer", "Canvas backing dimensions change with layout instead of using one stable logical resolution.", "performance");
  if (canvas.cappedDpr === false) addIssue(issues, "warning", "uncapped-dpr", "Canvas device-pixel ratio is uncapped and can multiply fill and decoded-memory cost on mobile.", "performance");
  if (canvas.oneAnimationFrameOwner === false) addIssue(issues, "error", "multiple-frame-owners", "More than one system owns requestAnimationFrame scheduling, risking duplicate game loops.", "performance");
  if (canvas.atlasIntegerRects === false) addIssue(issues, "warning", "fractional-atlas-rects", "Atlas source rectangles are not integer-aligned, which can introduce tile seams and frame bleed.", "assets");
  const targetP95 = Number(canvas.targetP95FrameMs ?? project.performance?.targetP95FrameMs ?? 12);
  const measuredP95 = Number(project.performance?.lastP95FrameMs);
  if (Number.isFinite(targetP95) && targetP95 > 16.67) addIssue(issues, "warning", "slow-frame-target", `The p95 frame-time target is ${targetP95.toFixed(2)} ms, above a 60 Hz frame.`, "performance");
  if (Number.isFinite(measuredP95) && Number.isFinite(targetP95) && measuredP95 > targetP95) addIssue(issues, "warning", "p95-frame-budget", `Measured p95 frame time is ${measuredP95.toFixed(2)} ms, above the ${targetP95.toFixed(2)} ms target.`, "performance");

  const collision = contracts.collision2d ?? {};
  if (collision.authority && collision.authority !== "authored-map") addIssue(issues, "error", "collision-authority", "Collision authority moved away from authored map geometry.", "maps");
  if (collision.halfOpenTileRanges === false) addIssue(issues, "warning", "tile-range-boundary", "Tile collision ranges do not use a half-open max edge and may include the neighboring tile at exact boundaries.", "maps");
  if (collision.fastBodySubsteps === false) addIssue(issues, "warning", "collision-tunneling", "Fast bodies have no substep or swept-collision policy.", "maps");
  if (collision.highSpeedPolicy === "swept-aabb" && collision.fastBodySubsteps === false) addIssue(issues, "info", "swept-without-substeps", "Swept AABB is active without fallback substeps; keep the tunneling fixture in generated tests.", "tests");
  if (collision.deterministicOrdering === false) addIssue(issues, "error", "collision-order", "Collision candidate ordering is nondeterministic and can desynchronize replays.", "replay");

  const input = contracts.inputViewport ?? {};
  if (input.tickSnapshots === false) addIssue(issues, "error", "input-snapshot", "DOM input events mutate gameplay directly instead of producing per-tick action snapshots.", "controls");
  if (input.readsKeyAndCode === false) addIssue(issues, "warning", "key-code-coverage", "Keyboard handling does not recognize both logical key values and physical key codes.", "controls");
  if (input.clearsOnBlur === false) addIssue(issues, "warning", "stuck-input", "Held inputs are not cleared on blur or visibility loss.", "controls");
  if (input.pointerCapture === false) addIssue(issues, "warning", "pointer-capture", "Touch controls do not capture and cancel pointer ownership reliably.", "controls");

  const presentation = contracts.presentation ?? {};
  if (presentation.eventQueue === false || presentation.simulationIndependent === false) addIssue(issues, "error", "presentation-simulation-coupling", "Visual, audio, camera, or hitstop effects can mutate deterministic simulation state.", "replay");

  const palette = contracts.palette ?? {};
  if (palette.onePaletteAcrossFrames === false) addIssue(issues, "error", "per-frame-palette", "Animation frames do not share one locked palette and can flicker.", "assets");
  if (palette.averagingAfterQuantization === true) addIssue(issues, "error", "off-palette-resample", "A color-averaging operation runs after quantization and can invent off-palette pixels.", "assets");
  if (palette.alphaWeightedResample === false) addIssue(issues, "warning", "alpha-resample-halo", "Sprite downscaling is not alpha-weighted and can create dark silhouette halos.", "assets");
  if (palette.gameplayCriticalRecoloring === true) addIssue(issues, "warning", "critical-art-recolor", "Gameplay-critical sprites or rails are allowed through a recoloring path.", "assets");
}

function analyzeDevices(project, issues, strict) {
  const required = ["desktop", "small-laptop", "portrait-390x844", "dpr2-mobile"];
  const profiles = new Set((project.deviceProfiles ?? []).map((profile) => profile.id));
  if (strict) for (const id of required) if (!profiles.has(id)) addIssue(issues, "warning", "device-profile", `The ${id} viewport has not been verified.`, "devices", { profileId: id });
  for (const profile of project.deviceProfiles ?? []) {
    if ((profile.touchTargetMin ?? 44) < 44) addIssue(issues, "warning", "touch-target", `${profile.name ?? profile.id} has touch targets below 44 CSS pixels.`, "devices", { profileId: profile.id });
    if (profile.hudOverlaps?.length) addIssue(issues, "error", "hud-overlap", `${profile.name ?? profile.id} has HUD or touch controls covering important map landmarks.`, "devices", { profileId: profile.id });
  }
  if (project.accessibility?.reducedMotion === false) addIssue(issues, "warning", "reduced-motion", "Reduced-motion users have no static feedback alternative.", "accessibility");
  if (project.accessibility?.canvasSemantics === false) addIssue(issues, "warning", "canvas-semantics", "The canvas has no assistive-technology status or control semantics.", "accessibility");
}

function analyzeCampaignScope(project, issues, strict) {
  const requirement = campaignScopeRequirement(project?.designBrief?.campaignScope);
  if (!requirement) return;
  const mapCount = Array.isArray(project?.maps)
    ? project.maps.length
    : project && (Array.isArray(project.objects) || Number.isFinite(Number(project.width)) || Number.isFinite(Number(project.height)))
      ? 1
      : 0;
  const belowMinimum = mapCount < requirement.minMaps;
  const aboveMaximum = requirement.maxMaps !== null && mapCount > requirement.maxMaps;
  if (!belowMinimum && !aboveMaximum) return;
  const expected = requirement.maxMaps === requirement.minMaps
    ? `${requirement.minMaps} authored ${requirement.minMaps === 1 ? "map" : "maps"}`
    : `${requirement.minMaps}–${requirement.maxMaps} authored maps`;
  addIssue(
    issues,
    strict ? "error" : "warning",
    "campaign-map-count",
    `${requirement.label} requires ${expected}, but this project currently contains ${mapCount}.`,
    "maps",
    {
      campaignScope: requirement.value,
      expectedMinMaps: requirement.minMaps,
      expectedMaxMaps: requirement.maxMaps,
      actualMapCount: mapCount,
      action: `Use add_map or remove_map until the project has ${expected}. Keep the player route ordered, connect every consecutive map with connect_maps, then rerun Project Doctor and runtime-join checks.`,
      invalidates: ["design-brief", "maps", "candidate-verification"],
      evidenceRequired: ["project-doctor", "runtime-join-plan", "playtest"],
    },
  );
}

function authoredColliderBox(object) {
  if (!object || object.collider?.enabled === false) return null;
  const collider = object.collider || { offsetX: 0, offsetY: 0, width: object.width, height: object.height };
  return {
    x: Number(object.x || 0) + Number(collider.offsetX || 0),
    y: Number(object.y || 0) + Number(collider.offsetY || 0),
    width: Math.max(0, Number(collider.width ?? object.width ?? 0)),
    height: Math.max(0, Number(collider.height ?? object.height ?? 0)),
  };
}

function horizontalGap(first, second) {
  if (first.x + first.width < second.x) return second.x - (first.x + first.width);
  if (second.x + second.width < first.x) return first.x - (second.x + second.width);
  return 0;
}

function analyzePlatformerReachability(project, issues, strict) {
  const maps = Array.isArray(project?.maps) && project.maps.length
    ? project.maps
    : [{ id: "main", width: project?.width, height: project?.height, gravity: project?.gravity, controlMode: project?.controlMode, projection: project?.projection, objects: project?.objects || [] }];
  for (const map of maps) {
    if ((map.controlMode ?? project.controlMode) !== "platformer" || (map.projection ?? project.projection)?.type === "dimetric-2:1") continue;
    const player = (map.objects || []).find((object) => object.kind === "player" && !object.hidden);
    const playerBox = authoredColliderBox(player);
    const envelope = measurePlatformerJumpEnvelope(project, { mapId: map.id });
    if (!player || !playerBox || !envelope) continue;
    const supports = (map.objects || [])
      .filter((object) => object !== player && !object.hidden && object.solid && object.collider?.enabled !== false && !object.collider?.trigger)
      .map((object) => ({ object, box: authoredColliderBox(object) }))
      .filter((entry) => entry.box && entry.box.width > 0);
    const playerFootY = playerBox.y + playerBox.height;
    const startingSupport = supports
      .filter((entry) => horizontalGap(playerBox, entry.box) === 0 && entry.box.y >= playerFootY - 4)
      .sort((first, second) => first.box.y - second.box.y)[0];
    if (!startingSupport) continue;
    const reachableSupportIds = new Set([startingSupport.object.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const target of supports) {
        if (reachableSupportIds.has(target.object.id)) continue;
        const reachable = supports.some((source) => {
          if (!reachableSupportIds.has(source.object.id)) return false;
          const requiredRise = source.box.y - target.box.y;
          const gap = horizontalGap(source.box, target.box);
          return requiredRise <= envelope.maxRise + 2 && gap <= envelope.maximumHorizontalTravel + playerBox.width;
        });
        if (reachable) {
          reachableSupportIds.add(target.object.id);
          changed = true;
        }
      }
    }
    for (const support of supports) {
      if (reachableSupportIds.has(support.object.id) || support.box.y >= startingSupport.box.y) continue;
      const requiredRise = Math.min(...supports.filter((entry) => reachableSupportIds.has(entry.object.id)).map((entry) => entry.box.y - support.box.y));
      addIssue(
        issues,
        "info",
        "platformer-support-unreachable",
        `${support.object.name ?? support.object.id} is above the measured ${envelope.maxRise.toFixed(1)}px jump envelope from every reachable support.`,
        "maps",
        { mapId: map.id, objectId: support.object.id, maxJumpRise: envelope.maxRise, requiredRise, predictionMethod: envelope.method },
      );
    }
    const requiredTargets = (map.objects || []).filter((object) => !object.hidden && (object.kind === "goal" || (object.kind === "portal" && object.targetMapId)));
    for (const target of requiredTargets) {
      const targetBox = authoredColliderBox(target);
      if (!targetBox) continue;
      const candidates = supports
        .filter((support) => reachableSupportIds.has(support.object.id))
        .map((support) => ({
          support,
          gap: horizontalGap(support.box, targetBox),
          requiredRise: Math.max(0, support.box.y - (targetBox.y + targetBox.height + playerBox.height - 1)),
        }));
      const reachable = candidates.some((candidate) => candidate.requiredRise <= envelope.maxRise + 2 && candidate.gap <= envelope.maximumHorizontalTravel + playerBox.width);
      if (reachable) continue;
      const best = candidates.sort((first, second) => first.requiredRise - second.requiredRise || first.gap - second.gap)[0];
      addIssue(
        issues,
        strict ? "error" : "warning",
        "platformer-required-target-unreachable",
        `${target.name ?? target.id} cannot be reached from the authored start under the measured ${envelope.maxRise.toFixed(1)}px jump envelope.`,
        "maps",
        {
          mapId: map.id,
          objectId: target.id,
          maxJumpRise: envelope.maxRise,
          maximumHorizontalTravel: envelope.maximumHorizontalTravel,
          requiredRise: best?.requiredRise ?? null,
          requiredHorizontalGap: best?.gap ?? null,
          predictionMethod: envelope.method,
          action: `Lower ${target.name ?? target.id}, add a reachable intermediate support, or intentionally retune movementTuning. Then record a behavior-asserting route that reaches it and rerun Project Doctor.`,
          invalidates: ["maps", "movementTuning", "replay", "candidate-verification"],
          evidenceRequired: ["project-doctor", "replay", "playtest"],
        },
      );
    }
  }
}

function analyzeNarrativeContract(project, issues, strict, evidence = {}) {
  const required = project.qualityContracts?.narrativeContractRequired === true;
  const report = inspectNarrativeContract(project, project.narrativeContract, evidence);
  if (!report.present) {
    if (required) addIssue(issues, strict ? "error" : "warning", "narrative-contract-missing", "The candidate promises material story content but has no machine-readable Narrative Contract.", "narrative");
    return report;
  }
  for (const finding of report.issues) {
    const severity = finding.severity === "error" ? "error" : strict && required ? "error" : finding.severity;
    addIssue(issues, severity, finding.code, finding.message, "narrative", {
      beatId: finding.beatId,
      endingId: finding.endingId,
      pageId: finding.pageId,
      choiceId: finding.choiceId,
      lineId: finding.lineId,
      characterId: finding.characterId,
      testId: finding.testId,
      mapId: finding.mapId,
      objectId: finding.objectId,
      featureId: finding.featureId,
      invalidates: ["narrativeContract", "gameplayProgram", "acceptance-tests", "candidate-verification"],
      evidenceRequired: ["automated-check", "playtest"],
    });
  }
  return report;
}

function analyzeTuningContract(project, issues, strict, evidence = {}) {
  const report = inspectTuningContract(project, project.tuningContract, evidence);
  if (!report.present) return report;
  for (const finding of report.issues) {
    addIssue(issues, finding.severity === "error" ? "error" : strict ? "warning" : finding.severity, finding.code, finding.message, "tuning", {
      parameterId: finding.parameterId,
      objectiveId: finding.objectiveId,
      constraintId: finding.constraintId,
      target: finding.target,
      invalidates: ["tuningContract", "tuning-search", "candidate-verification"],
      evidenceRequired: ["tuning-search", "playtest"],
    });
  }
  return report;
}

function analyzeStructuralScaffoldContract(project, issues, strict, evidence = {}) {
  const report = inspectStructuralScaffoldContract(project, project.structuralScaffoldContract, evidence);
  if (!report.present) return report;
  for (const finding of report.issues) {
    addIssue(issues, finding.severity === "error" ? "error" : strict ? "warning" : finding.severity, finding.code, finding.message, "contracts", {
      family: finding.family,
      field: finding.field,
      invalidates: ["structuralScaffoldContract", "structural-scaffold-search", "candidate-verification"],
      evidenceRequired: ["structural-scaffold-search", "preview", "playtest"],
    });
  }
  return report;
}

function analyzeSpatialLayoutContract(project, issues, strict, evidence = {}) {
  const report = inspectSpatialLayoutContract(project, project.spatialLayoutContract, evidence);
  if (!report.present) return report;
  for (const finding of report.issues) {
    addIssue(issues, finding.severity === "error" ? "error" : strict ? "warning" : finding.severity, finding.code, finding.message, "maps", {
      mapId: finding.mapId ?? report.map?.id,
      objectId: finding.objectId,
      family: finding.family,
      field: finding.field,
      path: finding.path,
      invalidates: ["spatialLayoutContract", "spatial-layout-search", "candidate-verification"],
      evidenceRequired: ["spatial-layout-search", "preview", "browser-harness", "playtest"],
    });
  }
  return report;
}

function analyzePresentationProgram(project, issues, strict, evidence = {}) {
  const required = project.qualityContracts?.presentationProgramRequired === true;
  const report = inspectPresentationProgram(project, project.presentationProgram, evidence);
  if (!report.present) {
    if (required) addIssue(issues, strict ? "error" : "warning", "presentation-program-missing", "The candidate requires authored sound and game-feel feedback but has no machine-readable Presentation Program.", "presentation");
    return report;
  }
  for (const finding of report.issues) {
    const severity = finding.severity === "error" ? "error" : strict && required ? "error" : finding.severity;
    addIssue(issues, severity, finding.code, finding.message, "presentation", {
      cueId: finding.cueId,
      event: finding.event,
      path: finding.path,
      invalidates: ["presentationProgram", "visual-review", "release-verification"],
      evidenceRequired: ["browser-harness", "reduced-motion-capture", "playtest"],
    });
  }
  if (report.program?.enabled && report.program.audio?.enabled && project.lifecycle?.pauseOnBlur === false) {
    addIssue(issues, strict ? "error" : "warning", "presentation-audio-lifecycle", "Authored audio is enabled while pause-on-blur is disabled.", "presentation", { invalidates: ["presentationProgram", "release-verification"], evidenceRequired: ["browser-harness"] });
  }
  return report;
}

function analyzeCompletionEvidence(project, issues, strict, sourceDigest, acceptanceResults) {
  const report = runCompletionHarness(project, { sourceDigest, acceptanceResults });
  if (report.status === "dead-end") {
    addIssue(
      issues,
      strict ? "error" : "warning",
      "completion-root-dead-end",
      "The authored terminal target exists, but no executable semantic action changes the initial gameplay state under the declared completion action model.",
      "tests",
      {
        completionStatus: report.status,
        completionReason: report.reason,
        completionConfigDigest: report.search.configDigest,
        action: "Connect a live semantic action to a state-changing route toward the terminal predicate, then rerun the completion harness and exact-artifact browser witness.",
        invalidates: ["gameplay", "acceptance", "replay", "candidate-verification"],
        evidenceRequired: ["completion-harness", "browser-harness"],
      },
    );
  } else if (report.status === "inconclusive") {
    addIssue(
      issues,
      strict ? "error" : "warning",
      "completion-evidence-inconclusive",
      `The bounded completion search did not reach the terminal predicate; this is missing evidence, not proof that the game is unwinnable (${report.reason}).`,
      "tests",
      {
        completionStatus: report.status,
        completionReason: report.reason,
        completionConfigDigest: report.search.configDigest,
        exploredStates: report.coverage.exploredStates,
        expandedTransitions: report.coverage.expandedTransitions,
        action: "Author a passing runtime.won acceptance route or provide a domain-appropriate completion policy, then replay its semantic-action witness in the exact exported HTML.",
        invalidates: ["acceptance", "replay", "candidate-verification"],
        evidenceRequired: ["completion-harness", "browser-harness"],
      },
    );
  } else if (report.status === "invalid") {
    addIssue(
      issues,
      "error",
      "completion-harness-invalid",
      `The completion harness could not evaluate the project: ${report.error ?? report.reason}.`,
      "tests",
      {
        completionStatus: report.status,
        completionReason: report.reason,
        completionConfigDigest: report.search.configDigest,
        action: "Repair the invalid deterministic runtime or completion contract before changing search bounds.",
        invalidates: ["acceptance", "replay", "candidate-verification"],
        evidenceRequired: ["completion-harness"],
      },
    );
  }
  return report;
}

export function analyzeProject(project, options = {}) {
  const strict = isProduction(project, options);
  const sourceDigest = doctorSourceDigest(project);
  const spatial = analyzeSpatialProject(project);
  const issues = spatial.issues.map((issue) => ({ ...issue, category: issue.category ?? "maps" }));
  const privacyReport = inspectProjectPrivacy(project, { sourceDigest });
  for (const finding of privacyReport.issues) addIssue(issues, finding.severity, finding.code, finding.message, "privacy", {
    path: finding.path,
    kind: finding.kind,
    action: finding.action,
    invalidates: ["privacy", "provider-context", "diagnostics", "one-file-export", "release-verification", "candidate-verification"],
    evidenceRequired: ["project-privacy-report", "one-file-audit"],
  });
  const communityExchangeReport = inspectCommunityExchanges(project);
  for (const finding of communityExchangeReport.issues) addIssue(issues, finding.severity, finding.code, finding.message, "community-exchange", {
    path: finding.path,
    exchangeId: finding.exchangeId,
    action: CATEGORY_ACTIONS["community-exchange"],
    invalidates: ["community-exchange-round-trip"],
    evidenceRequired: ["community-exchange-report"],
  });
  const visualIdentityReport = inspectVisualIdentity(project, project.visualIdentity, { sourceDigest });
  for (const finding of visualIdentityReport.issues) addIssue(issues, finding.severity, finding.code, finding.message, "visual-identity", {
    path: finding.path,
    referenceId: finding.referenceId,
    assetId: finding.assetId,
    directiveId: finding.directiveId,
    action: CATEGORY_ACTIONS["visual-identity"],
    invalidates: ["visualIdentity", "assets", "visual-review", "candidate-verification"],
    evidenceRequired: ["project-doctor", "visual-review"],
  });
  const runtimeJoinPlan = buildRuntimeJoinPlan(project);
  for (const issue of runtimeJoinPlan.issues) addIssue(issues, issue.severity, issue.code, issue.message, "maps", issue);
  const motionBodyReport = inspectMotionBodies(project, { strict });
  for (const finding of motionBodyReport.issues) addIssue(issues, finding.severity, finding.code, finding.message, "motion-bodies", {
    mapId: finding.mapId,
    objectId: finding.objectId,
    pathId: finding.pathId,
    actionId: finding.actionId,
    testId: finding.testId,
    action: CATEGORY_ACTIONS["motion-bodies"],
    invalidates: ["motion-bodies", "collision", "replay", "acceptance", "candidate-verification"],
    evidenceRequired: ["executable-acceptance", "replay", "project-doctor"],
  });
  const combatReport = inspectCombatProgram(project, project.combatProgram, { strict });
  for (const finding of combatReport.issues) addIssue(issues, finding.severity, finding.code, finding.message, "combat", {
    path: finding.path,
    mapId: finding.mapId,
    objectId: finding.objectId,
    actionId: finding.actionId,
    actorId: finding.actorId,
    emitterId: finding.emitterId,
    teamId: finding.teamId,
    testId: finding.testId,
    action: CATEGORY_ACTIONS.combat,
    invalidates: ["combat", "collision", "replay", "save-state", "acceptance", "candidate-verification"],
    evidenceRequired: ["executable-acceptance", "replay", "project-doctor", "browser-harness"],
  });
  const actorReport = inspectActorProgram(project, project.actorProgram, { strict });
  for (const finding of actorReport.issues) addIssue(issues, finding.severity, finding.code, finding.message, "actors", {
    path: finding.path,
    mapId: finding.mapId,
    objectId: finding.objectId,
    actorId: finding.actorId,
    nodeId: finding.nodeId,
    testId: finding.testId,
    action: CATEGORY_ACTIONS.actors,
    invalidates: ["actors", "navigation", "collision", "replay", "save-state", "acceptance", "candidate-verification"],
    evidenceRequired: ["executable-acceptance", "replay", "project-doctor", "browser-harness"],
  });
  const collisionMaps = Array.isArray(project?.maps) && project.maps.length
    ? project.maps
    : [{ id: project?.activeMapId ?? "map-main", collisionGeometry: project?.collisionGeometry }];
  const collisionGeometryReports = collisionMaps.map((map) => inspectCollisionGeometry(project, map.collisionGeometry, { mapId: map.id, strict }));
  for (const collisionReport of collisionGeometryReports) for (const finding of collisionReport.issues) addIssue(issues, finding.severity, finding.code, finding.message, "collision-geometry", {
    path: finding.path,
    mapId: collisionReport.mapId,
    objectId: finding.objectId,
    chainId: finding.chainId,
    segmentIndex: finding.segmentIndex,
    action: CATEGORY_ACTIONS["collision-geometry"],
    invalidates: ["collision-geometry", "movement", "replay", "acceptance", "candidate-verification"],
    evidenceRequired: ["executable-acceptance", "replay", "project-doctor", "browser-harness"],
  });
  const elevationMaps = Array.isArray(project?.maps) && project.maps.length
    ? project.maps
    : [{ id: project?.activeMapId ?? "map-main", elevationTransitions: project?.elevationTransitions }];
  const elevationTransitionReports = elevationMaps.map((map) => inspectElevationTransitions(project, map.elevationTransitions, { mapId: map.id, strict }));
  for (const elevationReport of elevationTransitionReports) for (const finding of elevationReport.issues) addIssue(issues, finding.severity, finding.code, finding.message, "elevation-transitions", {
    path: finding.path,
    mapId: elevationReport.mapId,
    transitionId: finding.transitionId,
    linkId: finding.linkId,
    chainId: finding.chainId,
    nodeId: finding.nodeId,
    segmentIndex: finding.segmentIndex,
    action: CATEGORY_ACTIONS["elevation-transitions"],
    invalidates: ["elevation-transitions", "collision-geometry", "navigation", "movement", "replay", "acceptance", "candidate-verification"],
    evidenceRequired: ["executable-acceptance", "replay", "project-doctor", "browser-harness"],
  });
  const tileMaps = Array.isArray(project?.maps) && project.maps.length
    ? project.maps
    : [{ id: project?.activeMapId ?? "map-main", tileProgram: project?.tileProgram }];
  const tileProgramReports = tileMaps.map((map) => inspectTileProgram(project, map.tileProgram, { mapId: map.id, strict }));
  for (const tileReport of tileProgramReports) for (const finding of tileReport.issues) addIssue(issues, finding.severity, finding.code, finding.message, "tile-program", {
    path: finding.path,
    mapId: tileReport.mapId,
    layerId: finding.layerId,
    x: finding.x,
    y: finding.y,
    terrainId: finding.terrainId,
    action: CATEGORY_ACTIONS["tile-program"],
    invalidates: ["tile-program", "visual-layout", "collision", "navigation", "replay", "acceptance", "candidate-verification"],
    evidenceRequired: ["project-doctor", "browser-harness", "visual-review", "replay"],
  });
  const worldStreamMaps = (Array.isArray(project?.maps) && project.maps.length
    ? project.maps
    : [{ id: project?.activeMapId ?? "map-main", worldStream: project?.worldStream }])
    .filter((map) => map?.worldStream != null);
  const worldStreamReports = worldStreamMaps.map((map) => inspectWorldStream(project, map.worldStream, { mapId: map.id, strict }));
  for (const streamReport of worldStreamReports) for (const finding of streamReport.issues) addIssue(issues, finding.severity, finding.code, finding.message, "world-stream", {
    path: finding.path,
    mapId: streamReport.mapId,
    templateId: finding.templateId,
    ordinal: finding.ordinal,
    action: CATEGORY_ACTIONS["world-stream"],
    invalidates: ["world-stream", "tile-program", "collision", "camera", "replay", "save-state", "release-verification", "candidate-verification"],
    evidenceRequired: finding.code === "world-stream-seam-evidence"
      ? ["browser-harness", "first-draw-screenshot", "unique-pixel-seam-review", "one-file-audit"]
      : ["project-doctor", "world-stream-plan", "replay", "browser-harness"],
  });
  analyzePlatformerReachability(project, issues, strict);
  analyzeCampaignScope(project, issues, strict);
  analyzeWorkflow(project, issues, strict);
  analyzeBuildFreshness(project, issues, strict);
  const visualReadiness = analyzeAssets(project, issues, strict);
  const inputActionLiveness = analyzeInputs(project, issues, strict);
  const { replayResults, acceptanceResults, acceptancePlan } = analyzeReplayAndTests(project, issues, strict, sourceDigest);
  const completionReport = analyzeCompletionEvidence(project, issues, strict, sourceDigest, acceptanceResults);
  analyzeContracts(project, issues, strict);
  analyzeTemplateAdaptation(project, issues, strict);
  const gameplayProgram = analyzeGameplayProgram(project, issues, strict);
  const narrativeReport = analyzeNarrativeContract(project, issues, strict, { sourceDigest, acceptancePlan, passingTestIds: acceptancePlan.passingIds });
  const presentationReport = analyzePresentationProgram(project, issues, strict, { sourceDigest });
  const gameShellReport = inspectGameShell(project, project.gameShell, { sourceDigest, strict });
  for (const finding of gameShellReport.issues) addIssue(issues, finding.severity, finding.code, finding.message, "game-shell", {
    path: finding.path,
    variableId: finding.variableId,
    action: CATEGORY_ACTIONS["game-shell"],
    invalidates: ["gameShell", "browser-lifecycle", "release-verification", "candidate-verification"],
    evidenceRequired: ["project-doctor", "browser-harness", "keyboard-and-focus-review"],
  });
  const saveReport = inspectSaveProgram(project, project.saveProgram, { sourceDigest });
  for (const issue of saveReport.issues) addIssue(issues, issue.severity, issue.code, issue.message, "release", {
    path: issue.path,
    action: "Repair the export profile and portable save contract, then regenerate and audit the exact one-file artifact.",
    invalidates: ["saveProgram", "release-verification", "candidate-verification"],
    evidenceRequired: ["one-file-audit", "browser-harness"],
  });
  const tuningReport = analyzeTuningContract(project, issues, strict, { sourceDigest });
  const structuralScaffoldReport = analyzeStructuralScaffoldContract(project, issues, strict, { sourceDigest });
  const spatialLayoutReport = analyzeSpatialLayoutContract(project, issues, strict, { sourceDigest });
  const verbArchitecture = analyzeVerbArchitecture(project, issues, strict, { sourceDigest, acceptanceResults, replayResults, passingTestIds: acceptancePlan.passingIds });
  analyzeReuseGuideContracts(project, issues, strict);
  analyzeTraversalPaths(project, issues, strict);
  analyzeRelease(project, issues, strict, sourceDigest);
  analyzeBrowser2DContracts(project, issues, strict);
  analyzeDevices(project, issues, strict);
  const actionableIssues = issues.map((issue) => ({
    ...issue,
    owner: CATEGORY_OWNERS[issue.category] ?? "project-doctor",
    action: issue.action ?? CATEGORY_ACTIONS[issue.category] ?? "Inspect the affected feature contract, correct its source data, and rerun the relevant acceptance test.",
    invalidates: issue.invalidates ?? [issue.category, "candidate-verification"],
    evidenceRequired: issue.evidenceRequired ?? (issue.category === "maps" || issue.category === "devices" || issue.category === "assets" ? ["screenshot", "playtest"] : ["automated-check"]),
  }));
  const errorCount = actionableIssues.filter((issue) => issue.severity === "error").length;
  const warningCount = actionableIssues.filter((issue) => issue.severity === "warning").length;
  const infoCount = actionableIssues.filter((issue) => issue.severity === "info").length;
  const score = Math.max(0, 100 - errorCount * 8 - warningCount * 2);
  const technicalStatus = errorCount > 0 ? "blocked" : warningCount > 0 ? "passes-with-findings" : "clean";
  const categories = Object.fromEntries([...new Set(actionableIssues.map((issue) => issue.category))].map((category) => [category, actionableIssues.filter((issue) => issue.category === category)]));
  const profile = strict ? "production" : "prototype";
  const digest = digestIssues(profile, actionableIssues, sourceDigest);
  const nextActions = actionableIssues
    .filter((issue) => issue.severity === "error" || issue.severity === "warning")
    .sort((first, second) => (first.severity === "error" ? -1 : 1) - (second.severity === "error" ? -1 : 1))
    .slice(0, 8)
    .map((issue) => ({ code: issue.code, owner: issue.owner, action: issue.action, context: { mapId: issue.mapId, exchangeId: issue.exchangeId, templateId: issue.templateId, ordinal: issue.ordinal, transitionId: issue.transitionId, linkId: issue.linkId, chainId: issue.chainId, nodeId: issue.nodeId, objectId: issue.objectId, assetId: issue.assetId, actionId: issue.actionId, featureId: issue.featureId, beatId: issue.beatId, endingId: issue.endingId, pageId: issue.pageId, choiceId: issue.choiceId, lineId: issue.lineId, characterId: issue.characterId, testId: issue.testId, parameterId: issue.parameterId, objectiveId: issue.objectiveId, constraintId: issue.constraintId, cueId: issue.cueId, event: issue.event, path: issue.path, target: issue.target, campaignScope: issue.campaignScope, expectedMinMaps: issue.expectedMinMaps, expectedMaxMaps: issue.expectedMaxMaps, actualMapCount: issue.actualMapCount, maxJumpRise: issue.maxJumpRise, maximumHorizontalTravel: issue.maximumHorizontalTravel, requiredRise: issue.requiredRise, requiredHorizontalGap: issue.requiredHorizontalGap, predictionMethod: issue.predictionMethod, completionStatus: issue.completionStatus, completionReason: issue.completionReason, completionConfigDigest: issue.completionConfigDigest, exploredStates: issue.exploredStates, expandedTransitions: issue.expandedTransitions }, evidenceRequired: issue.evidenceRequired }));
  return {
    profile,
    digest,
    sourceDigest,
    score,
    grade: errorCount === 0 && score >= 90 ? "verified" : score >= 75 ? "strong" : score >= 55 ? "needs-work" : "unsafe",
    technicalStatus,
    visualReadiness,
    replayResults,
    acceptanceResults,
    acceptancePlan,
    gameplayProgram,
    narrativeReport,
    presentationReport,
    gameShellReport,
    visualIdentityReport,
    saveReport,
    tuningReport,
    structuralScaffoldReport,
    spatialLayoutReport,
    verbArchitecture,
    inputActionLiveness: { ...inputActionLiveness, sourceDigest },
    completionReport,
    runtimeJoinPlan,
    motionBodyReport,
    combatReport,
    actorReport,
    collisionGeometryReports,
    elevationTransitionReports,
    tileProgramReports,
    worldStreamReports,
    communityExchangeReport,
    privacyReport,
    errorCount,
    warningCount,
    infoCount,
    issues: actionableIssues,
    categories,
    spatial,
    canPromote: errorCount === 0 && (strict ? warningCount === 0 : true),
    nextActions,
    gate: { ranAt: new Date().toISOString(), blocking: errorCount > 0 || (strict && warningCount > 0), verifiedDigestRequiredForPromotion: true },
  };
}

export function canCollectOfflineVerificationEvidence(project, report = analyzeProject(project)) {
  const blockingIssues = report?.issues?.filter((issue) => issue.severity !== "info") ?? [];
  return project?.iteration?.status === "candidate"
    && report?.errorCount === 0
    && report?.warningCount === 1
    && blockingIssues.length === 1
    && blockingIssues[0]?.code === "offline-unverified";
}

export const PROJECT_DOCTOR_CAPABILITIES = [
  "iteration-lifecycle",
  "build-freshness",
  "authored-collision",
  "map-depth-and-clearance",
  "asset-invariants",
  "measured-visual-readiness",
  "technical-vs-aesthetic-claim-boundary",
  "input-action-contracts",
  "input-action-liveness",
  "bounded-completion-and-softlock-evidence",
  "deterministic-replays",
  "deterministic-actor-perception-and-navigation",
  "executable-replay-fixtures-first-divergence",
  "actual-runtime-join-capture-plan",
  "structured-campaign-scope",
  "semantic-tests",
  "source-bound-executable-acceptance-tests",
  "scored-verb-architecture",
  "deterministic-gameplay-rules",
  "single-file-release",
  "strict-and-hosted-one-file-export-profiles",
  "portable-source-bound-save-codes",
  "exact-audited-hosted-storage-wrapper",
  "source-and-artifact-bound-release-verification",
  "source-bound-project-and-artifact-privacy-preflight",
  "inline-runtime-delivery",
  "canvas-2d-performance-contract",
  "collision-response-contract",
  "tick-input-and-mobile-viewport",
  "presentation-event-boundary",
  "standard-game-shell-lifecycle",
  "palette-pipeline-invariants",
  "versioned-project-schema",
  "renderer-independent-fixed-step-boundary",
  "authored-traversal-path-contracts",
  "high-speed-sweep-policy",
  "one-file-pwa-exclusion",
  "separate-performance-metrics",
  "device-and-hud-overlays",
  "feature-contract-dependencies",
];
