import { sha256Hex } from "./looplab-canonical-digest.mjs";
import { tileProgramDigest } from "./looplab-tile-program.mjs";
import { worldStreamDigest } from "./looplab-world-stream.mjs";

const OMITTED_PROJECT_FIELDS = new Set([
  "agentRequests",
  "agentWorkLedger",
  "actorProgram",
  "combatProgram",
  "gameplayProgram",
  "narrativeContract",
  "tuningContract",
  "structuralScaffoldContract",
  "iterationArchive",
  "iterationHistory",
  "verbArchitecture",
]);

const ACTIVE_MAP_MIRROR_FIELDS = new Set([
  "background",
  "clearanceZones",
  "collisionGeometry",
  "elevationTransitions",
  "controlMode",
  "gravity",
  "grid",
  "height",
  "hudSafeAreas",
  "interactionPolicy",
  "maxInteractionGap",
  "navigation",
  "objects",
  "projection",
  "traversalPaths",
  "tileProgram",
  "worldStream",
  "width",
]);

export const LOOPLAB_PROVIDER_CONTEXT_POLICY = Object.freeze({
  version: 1,
  defaultRoughTokenBudget: 96_000,
  minimumRoughTokenBudget: 8_000,
  maximumRoughTokenBudget: 200_000,
  maximumPasses: 8,
  requiredGates: ["project-doctor", "deterministic-replay", "runtime-join-if-affected"],
  estimatePolicy: "Character count divided by four is planning evidence only; completed provider usage remains authoritative.",
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function boundedText(value, maximum = 4_000) {
  const text = String(value ?? "").trim();
  if (text.length <= maximum) return text;
  return `${text.slice(0, maximum)}\n[truncated ${text.length - maximum} characters]`;
}

function compactPromptGeneration(generation) {
  if (!generation || typeof generation !== "object") return generation ?? null;
  const { basePrompt, prompt, composedPrompt, ...metadata } = generation;
  delete metadata.console;
  return {
    ...clone(metadata),
    promptLength: String(prompt ?? composedPrompt ?? basePrompt ?? "").length,
  };
}

function compactDesignBrief(brief) {
  if (!brief || typeof brief !== "object") return brief ?? null;
  const { composedPrompt, preparedProviderInput, promptGeneration, ...directedInputs } = brief;
  return {
    ...clone(directedInputs),
    composedPromptLength: String(composedPrompt ?? "").length,
    preparedProviderInputLength: String(preparedProviderInput ?? "").length,
    promptGeneration: compactPromptGeneration(promptGeneration),
  };
}

function compactIteration(iteration) {
  if (!iteration || typeof iteration !== "object") return iteration ?? null;
  const { objective, route, agentPlan, agentExecution, boundaries, ...identity } = iteration;
  return {
    ...clone(identity),
    objectiveSummary: boundedText(objective, 800),
    providerPlanOmitted: Boolean(route || agentPlan || agentExecution || boundaries),
  };
}

function boundedInteger(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.floor(parsed))) : fallback;
}

function stableDigest(prefix, value) {
  return `${prefix}-${sha256Hex(String(value ?? "")).slice(0, 16)}`;
}

function stableSlug(value, fallback = "scope") {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 38) || fallback;
}

function mapIndexEntry(map) {
  const tileProgram = map?.tileProgram;
  return {
    id: map?.id,
    name: map?.name,
    width: map?.width,
    height: map?.height,
    projection: map?.projection?.type ?? null,
    objectCount: map?.objects?.length ?? 0,
    traversalPathCount: map?.traversalPaths?.length ?? 0,
    elevationTransitionCount: map?.elevationTransitions?.transitions?.length ?? 0,
    navigationNodeCount: map?.navigation?.nodes?.length ?? 0,
    portalIds: (map?.objects ?? []).filter((object) => object?.kind === "portal").map((object) => object.id),
    spawnIds: (map?.objects ?? []).filter((object) => object?.kind === "spawn").map((object) => object.id),
    tileProgram: tileProgram ? {
      digest: tileProgramDigest(tileProgram),
      layers: tileProgram.layers?.length ?? 0,
      collisionLayers: tileProgram.collisionLayers?.length ?? 0,
      paletteEntries: tileProgram.palette?.length ?? 0,
    } : null,
    worldStream: map?.worldStream ? {
      digest: worldStreamDigest(map.worldStream),
      enabled: map.worldStream.enabled !== false,
      mode: map.worldStream.mode ?? null,
      axis: map.worldStream.axis ?? null,
      horizon: map.worldStream.horizon ?? null,
      templateCount: map.worldStream.templates?.length ?? 0,
    } : null,
  };
}

function compactTileProgram(program) {
  if (!program || typeof program !== "object" || Array.isArray(program)) return program ?? null;
  const chunkSummary = (chunks) => ({
    count: Array.isArray(chunks) ? chunks.length : 0,
    storedCells: (Array.isArray(chunks) ? chunks : []).reduce((total, chunk) => total + (chunk?.cells?.length ?? 0), 0),
    nonEmptyCells: (Array.isArray(chunks) ? chunks : []).reduce((total, chunk) => total + (chunk?.cells?.filter((cell) => cell !== 0).length ?? 0), 0),
  });
  return {
    schemaVersion: program.schemaVersion,
    collisionOwner: program.collisionOwner,
    tileProgramDigest: tileProgramDigest(program),
    cellWidth: program.cellWidth,
    cellHeight: program.cellHeight,
    columns: program.columns,
    rows: program.rows,
    chunkSize: program.chunkSize,
    variationSeed: program.variationSeed,
    palette: clone(program.palette ?? []),
    terrainSets: (program.terrainSets ?? []).map((set) => ({ ...clone(set), variants: clone(set.variants ?? []) })),
    collisionProfiles: clone(program.collisionProfiles ?? []),
    layers: (program.layers ?? []).map((layer) => ({ ...clone(layer), chunks: undefined, terrainChunks: undefined, directChunkSummary: chunkSummary(layer.chunks), terrainChunkSummary: chunkSummary(layer.terrainChunks) })),
    collisionLayers: (program.collisionLayers ?? []).map((layer) => ({ ...clone(layer), chunks: undefined, chunkSummary: chunkSummary(layer.chunks) })),
    cellPayloadOmitted: true,
    exactReadCommand: "get_tile_region",
    editWorkflow: ["preview_tile_patch", "apply_tile_patch"],
  };
}

function compactProviderMap(map) {
  const compact = clone(map);
  if (compact?.tileProgram) compact.tileProgram = compactTileProgram(map.tileProgram);
  return compact;
}

function runtimeJoinMapProjection(map) {
  const objects = map?.objects ?? [];
  const anchors = objects.filter((object) => ["player", "portal", "spawn"].includes(object?.kind));
  const clearanceObjects = objects.filter((object) => {
    if (["player", "portal", "spawn"].includes(object?.kind)) return false;
    return anchors.some((anchor) => {
      const dx = Number(object?.x ?? 0) - Number(anchor?.x ?? 0);
      const dy = Number(object?.y ?? 0) - Number(anchor?.y ?? 0);
      return Math.hypot(dx, dy) <= 220;
    });
  });
  return {
    id: map?.id,
    name: map?.name,
    width: map?.width,
    height: map?.height,
    background: map?.background,
    gravity: map?.gravity,
    grid: map?.grid,
    controlMode: map?.controlMode,
    projection: clone(map?.projection),
    tileProgram: compactTileProgram(map?.tileProgram),
    objects: clone([...anchors, ...clearanceObjects]),
    traversalPaths: [],
    providerProjection: {
      mode: "runtime-joins",
      fullObjectCount: objects.length,
      includedObjectCount: anchors.length + clearanceObjects.length,
      instruction: "This map contains portal/spawn objects and nearby landing-clearance geometry only. Missing objects still exist in authoring truth and must not be deleted or inferred absent.",
    },
  };
}

export function compactProviderProject(project, options = {}) {
  const compact = {};
  const omittedBytes = {};
  for (const [key, value] of Object.entries(project ?? {})) {
    if (OMITTED_PROJECT_FIELDS.has(key)) {
      omittedBytes[key] = JSON.stringify(value ?? null).length;
      continue;
    }
    if (ACTIVE_MAP_MIRROR_FIELDS.has(key) && Array.isArray(project?.maps) && project.maps.length) {
      omittedBytes[`activeMapMirror.${key}`] = JSON.stringify(value ?? null).length;
      continue;
    }
    if (key === "maps" && Array.isArray(value)) {
      const selectedMapIds = new Set((options.mapIds ?? []).map((id) => String(id)));
      const selectedMaps = selectedMapIds.size ? value.filter((map) => selectedMapIds.has(String(map?.id))) : value;
      const compactedMaps = options.projectionMode === "runtime-joins"
        ? selectedMaps.map(runtimeJoinMapProjection)
        : selectedMaps.map(compactProviderMap);
      compact.maps = compactedMaps;
      const allMapBytes = JSON.stringify(value).length;
      const selectedMapBytes = JSON.stringify(selectedMaps).length;
      omittedBytes.unselectedMaps = Math.max(0, allMapBytes - selectedMapBytes);
      omittedBytes.tileProgramCellPayloads = Math.max(0, selectedMapBytes - JSON.stringify(compactedMaps).length);
      continue;
    }
    if (key === "assets") {
      compact.assets = (value ?? []).map((asset) => ({
        ...clone(asset),
        dataUrl: typeof asset?.dataUrl === "string" ? `[embedded image omitted: ${asset.dataUrl.length} characters]` : asset?.dataUrl,
      }));
      continue;
    }
    if (key === "designBrief") {
      compact.designBrief = compactDesignBrief(value);
      omittedBytes.designBriefPrompts = Math.max(0, JSON.stringify(value ?? null).length - JSON.stringify(compact.designBrief).length);
      continue;
    }
    if (key === "iteration") {
      compact.iteration = compactIteration(value);
      omittedBytes.iterationDetail = Math.max(0, JSON.stringify(value ?? null).length - JSON.stringify(compact.iteration).length);
      continue;
    }
    compact[key] = clone(value);
  }
  compact.providerContext = {
    compact: true,
    omittedBytes,
    originalActiveMapId: project?.activeMapId ?? null,
    mapIndex: (project?.maps ?? []).map(mapIndexEntry),
    projectionMode: options.projectionMode ?? "full-maps",
    selectedMapIds: clone(options.mapIds ?? []),
    instruction: "Historical snapshots, old request bodies, and duplicate composed prompts are intentionally omitted. The current goal, validation findings, authored maps, runtime IDs, and compact prior-attempt diagnostics remain authoritative.",
  };
  if (compact.maps?.length && !compact.maps.some((map) => map.id === compact.activeMapId)) compact.activeMapId = compact.maps[0].id;
  return compact;
}

function uniqueConditions(conditions) {
  const seen = new Set();
  return (conditions ?? []).map((condition) => String(condition ?? "").trim()).filter((condition) => {
    if (!condition || seen.has(condition)) return false;
    seen.add(condition);
    return true;
  });
}

function passRecord({ index, label, objectiveText, mapIds = [], projectionMode = "full-maps", kind = "objective", previousId = null }) {
  const identity = `${kind}\n${label}\n${objectiveText}\n${mapIds.join("|")}\n${projectionMode}`;
  const passId = `pass-${String(index + 1).padStart(2, "0")}-${stableSlug(label)}-${stableDigest("scope", identity).slice(-6)}`;
  return {
    passId,
    order: index + 1,
    label: boundedText(label, 180),
    kind,
    objectiveText: String(objectiveText ?? "").trim(),
    mapIds: clone(mapIds),
    projectionMode,
    dependsOn: previousId ? [previousId] : [],
    requiredGates: clone(LOOPLAB_PROVIDER_CONTEXT_POLICY.requiredGates),
  };
}

function chunkValues(values, count) {
  const chunkCount = Math.max(1, Math.min(values.length || 1, count));
  const chunkSize = Math.ceil(values.length / chunkCount);
  return Array.from({ length: chunkCount }, (_, index) => values.slice(index * chunkSize, (index + 1) * chunkSize)).filter((chunk) => chunk.length);
}

function goalSegments(goal) {
  const text = String(goal ?? "").trim();
  const paragraphs = text.split(/\n\s*\n+/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
  return sentences.length > 1 ? sentences : [text];
}

export function planProviderPasses({
  goal,
  conditions = [],
  project,
  measurement,
  sourceDigest = null,
  roughTokenBudget = LOOPLAB_PROVIDER_CONTEXT_POLICY.defaultRoughTokenBudget,
  maximumPasses = LOOPLAB_PROVIDER_CONTEXT_POLICY.maximumPasses,
}) {
  const normalizedGoal = String(goal ?? "").trim();
  if (!normalizedGoal) throw new Error("Provider pass planning requires a non-empty goal.");
  const budget = boundedInteger(
    roughTokenBudget,
    LOOPLAB_PROVIDER_CONTEXT_POLICY.minimumRoughTokenBudget,
    LOOPLAB_PROVIDER_CONTEXT_POLICY.maximumRoughTokenBudget,
    LOOPLAB_PROVIDER_CONTEXT_POLICY.defaultRoughTokenBudget,
  );
  const passLimit = boundedInteger(maximumPasses, 1, LOOPLAB_PROVIDER_CONTEXT_POLICY.maximumPasses, LOOPLAB_PROVIDER_CONTEXT_POLICY.maximumPasses);
  const measured = measurement ?? measureProviderIterationContext({ goal: normalizedGoal, project: compactProviderProject(project) });
  const overBudget = measured.roughTokenEstimate > budget;
  const objectiveDigest = stableDigest("objective", normalizedGoal);
  const explicitConditions = uniqueConditions(conditions);
  const maps = project?.maps ?? [];
  const specs = [];

  if (explicitConditions.length > 1) {
    chunkValues(explicitConditions, Math.min(passLimit, explicitConditions.length)).forEach((conditionGroup) => specs.push({
      label: conditionGroup.join(" + "),
      objectiveText: conditionGroup.map((condition) => `Satisfy this explicit condition: ${condition}`).join("\n"),
      kind: "condition",
      mapIds: [],
      projectionMode: "full-maps",
    }));
  } else if (overBudget && maps.length > 1 && passLimit > 1) {
    const mapPassCount = Math.min(maps.length, Math.max(1, passLimit - 1));
    for (const group of chunkValues(maps, mapPassCount)) {
      specs.push({
        label: `Author ${group.map((map) => map.name ?? map.id).join(" + ")}`,
        objectiveText: `Advance only the authored gameplay, layout, collision, and acceptance scope for map IDs ${group.map((map) => map.id).join(", ")}. Preserve every other map and the overall objective.`,
        kind: "map",
        mapIds: group.map((map) => map.id),
        projectionMode: "selected-maps",
      });
    }
    if (specs.length < passLimit) specs.push({
      label: "Integrate map transitions",
      objectiveText: "Integrate the completed map passes: validate exact portal-to-spawn joins, landing clearance, continuity, runtime-join contracts, and shared progression without rewriting completed map content.",
      kind: "integration",
      mapIds: maps.map((map) => map.id),
      projectionMode: "runtime-joins",
    });
  } else if (overBudget && passLimit > 1) {
    const segments = goalSegments(normalizedGoal);
    for (const group of chunkValues(segments, Math.min(passLimit, segments.length))) {
      specs.push({
        label: boundedText(group[0], 100),
        objectiveText: group.join("\n\n"),
        kind: "objective-segment",
        mapIds: [],
        projectionMode: "full-maps",
      });
    }
  }

  if (!specs.length) specs.push({
    label: explicitConditions[0] ?? "Complete coherent pass",
    objectiveText: explicitConditions[0] ? `${normalizedGoal}\n\nCurrent condition: ${explicitConditions[0]}` : normalizedGoal,
    kind: explicitConditions[0] ? "condition" : "objective",
    mapIds: [],
    projectionMode: "full-maps",
  });

  const passes = [];
  for (const [index, spec] of specs.entries()) passes.push(passRecord({ ...spec, index, previousId: passes.at(-1)?.passId ?? null }));
  const planIdentity = JSON.stringify({ objectiveDigest, sourceDigest, budget, passes: passes.map(({ passId, kind, mapIds, projectionMode }) => ({ passId, kind, mapIds, projectionMode })) });
  return {
    schemaVersion: "looplab-provider-pass-plan/v1",
    planId: stableDigest("provider-plan", planIdentity),
    objectiveDigest,
    objectiveCharacters: normalizedGoal.length,
    sourceDigest,
    mode: passes.length > 1 ? "bounded" : "single",
    reason: passes.length > 1 ? (explicitConditions.length > 1 ? "multiple-conditions" : "context-budget") : "single-context-within-plan",
    completionPolicy: {
      schemaVersion: "looplab-provider-pass-completion/v1",
      id: passes.length > 1 ? "required-passes-before-target-score" : "target-score-before-single-pass",
      requiredAcceptedPasses: passes.length,
      targetScoreBehavior: passes.length > 1 ? "deferred-until-required-passes-complete" : "stop-before-provider-call",
      providerCallCap: "iterations",
      explanation: passes.length > 1
        ? "Every planned condition, map, or integration scope must be accepted before the loop can finish; stop score never silently skips a required scope. Max passes remains the hard provider-call cap."
        : "The loop stops before requesting the provider when the frozen evaluation score already meets the target.",
    },
    budget: { roughTokenLimit: budget, originalMeasurement: clone(measured), estimatePolicy: LOOPLAB_PROVIDER_CONTEXT_POLICY.estimatePolicy },
    passes,
  };
}

export function publicProviderPassPlan(plan) {
  if (!plan) return null;
  return {
    ...clone(plan),
    passes: (plan.passes ?? []).map(({ objectiveText, ...pass }) => ({ ...clone(pass), objectiveCharacters: String(objectiveText ?? "").length })),
  };
}

export function selectProviderPass(plan, attempts = []) {
  const accepted = new Set((attempts ?? []).filter((attempt) => attempt?.accepted && attempt?.passId && (!attempt.planId || attempt.planId === plan?.planId)).map((attempt) => attempt.passId));
  return (plan?.passes ?? []).find((pass) => !accepted.has(pass.passId)) ?? null;
}

export function providerGoalForPass(goal, plan, pass) {
  if (!pass || plan?.mode !== "bounded") return String(goal ?? "").trim();
  const position = `${pass.order}/${plan.passes.length}`;
  const overall = String(goal ?? "").trim();
  return `${overall}\n\nBOUNDED PROVIDER PASS ${position} — ${pass.label}\nPASS ID: ${pass.passId}\nOVERALL OBJECTIVE DIGEST: ${plan.objectiveDigest}\nDEPENDENCIES: ${pass.dependsOn.length ? pass.dependsOn.join(", ") : "none"}\nCURRENT SCOPE:\n${pass.objectiveText}\n\nWork only inside this scope. Preserve completed and later-pass content. Return a coherent command set that can pass Project Doctor and deterministic replay independently.`;
}

export function compactQualityReport(quality) {
  if (!quality || typeof quality !== "object") return quality ?? null;
  const doctor = quality.doctor ?? {};
  return {
    schemaVersion: quality.schemaVersion,
    digest: quality.digest,
    profile: quality.profile ? {
      schemaVersion: quality.profile.schemaVersion,
      id: quality.profile.id,
      label: quality.profile.label,
      source: quality.profile.source,
      reason: quality.profile.reason,
      digest: quality.profile.digest,
      weights: clone(quality.profile.weights),
      frozenFromStartingProject: quality.profile.frozenFromStartingProject === true,
    } : null,
    score: quality.score,
    maximum: quality.maximum,
    grade: quality.grade,
    valid: quality.valid,
    gameplayScore: quality.gameplayScore,
    validation: clone(quality.validation),
    checks: clone(quality.checks),
    dimensions: (quality.dimensions ?? []).map((dimension) => ({
      id: dimension.id,
      label: dimension.label,
      score: dimension.score,
      maximum: dimension.maximum,
      weight: dimension.weight,
      applicable: dimension.applicable,
      detail: boundedText(dimension.detail, 800),
      metrics: clone(dimension.metrics),
      limitation: boundedText(dimension.limitation, 800),
    })),
    hardGates: clone(quality.hardGates),
    judgmentResidue: clone(quality.judgmentResidue),
    doctor: {
      profile: doctor.profile,
      digest: doctor.digest,
      sourceDigest: doctor.sourceDigest,
      score: doctor.score,
      grade: doctor.grade,
      technicalStatus: doctor.technicalStatus,
      errorCount: doctor.errorCount,
      warningCount: doctor.warningCount,
      canPromote: doctor.canPromote,
      issues: (doctor.issues ?? []).slice(0, 40).map((issue) => ({
        severity: issue.severity,
        code: issue.code,
        message: boundedText(issue.message, 800),
        mapId: issue.mapId,
        objectId: issue.objectId,
        assetId: issue.assetId,
        featureId: issue.featureId,
      })),
      nextActions: (doctor.nextActions ?? []).slice(0, 20).map((action) => ({
        code: action.code,
        owner: action.owner,
        action: boundedText(action.action, 800),
        context: clone(action.context),
        evidenceRequired: clone(action.evidenceRequired),
      })),
      visualReadiness: doctor.visualReadiness ? {
        status: doctor.visualReadiness.status,
        score: doctor.visualReadiness.score,
        checks: clone(doctor.visualReadiness.checks),
        metrics: clone(doctor.visualReadiness.metrics),
      } : null,
      replayResults: doctor.replayResults ? {
        status: doctor.replayResults.status,
        caseCount: doctor.replayResults.caseCount,
        passedCount: doctor.replayResults.passedCount,
        failedCount: doctor.replayResults.failedCount,
        firstDivergence: clone(doctor.replayResults.firstDivergence),
      } : null,
      runtimeJoinPlan: doctor.runtimeJoinPlan ? {
        status: doctor.runtimeJoinPlan.status,
        joinCount: doctor.runtimeJoinPlan.joinCount,
        issues: clone(doctor.runtimeJoinPlan.issues),
      } : null,
    },
  };
}

export function compactPriorAttempts(attempts, maximum = 3) {
  return (attempts ?? []).slice(-maximum).map((attempt) => ({
    iteration: attempt.iteration,
    planId: attempt.planId,
    passId: attempt.passId,
    accepted: attempt.accepted,
    strategy: attempt.strategy,
    condition: attempt.condition,
    summary: boundedText(attempt.summary, 1_500),
    hypothesis: boundedText(attempt.hypothesis, 1_200),
    quality: clone(attempt.quality),
    rejectionReason: boundedText(attempt.rejectionReason, 6_000),
    commandCount: attempt.commands?.length ?? 0,
    commandOps: (attempt.commands ?? []).map((command) => command.op),
    agentReviews: (attempt.agentReviews ?? []).map((review) => ({
      agentId: review.agentId,
      verdict: review.verdict,
      note: boundedText(review.note, 700),
    })),
  }));
}

export function compactCapabilityRoute(capabilityRoute) {
  if (!capabilityRoute || typeof capabilityRoute !== "object") return capabilityRoute ?? null;
  const runtimeSelection = clone(capabilityRoute.runtimeSelection ?? {});
  delete runtimeSelection.runtimeKnowledge;
  return {
    schemaVersion: capabilityRoute.schemaVersion ?? null,
    productScope: clone(capabilityRoute.productScope),
    context: capabilityRoute.context ? { ...clone(capabilityRoute.context), prompt: "[current goal supplied separately]" } : null,
    runtimeSelection,
    productionPlan: capabilityRoute.productionPlan ? {
      schemaVersion: capabilityRoute.productionPlan.schemaVersion,
      programOwned: capabilityRoute.productionPlan.programOwned === true,
      externalSkillRequired: capabilityRoute.productionPlan.externalSkillRequired === true,
      supplementsExistingArchitecture: capabilityRoute.productionPlan.supplementsExistingArchitecture === true,
      design: clone(capabilityRoute.productionPlan.design),
      narrative: clone(capabilityRoute.productionPlan.narrative),
      architecture: clone(capabilityRoute.productionPlan.architecture),
      ui: clone(capabilityRoute.productionPlan.ui),
      assets: clone(capabilityRoute.productionPlan.assets),
      playtest: clone(capabilityRoute.productionPlan.playtest),
    } : null,
    route: (capabilityRoute.route ?? []).map(({ order, capabilityId, label, owns, gate }) => ({ order, capabilityId, label, owns: clone(owns), gate })),
    agentPlan: (capabilityRoute.agentPlan ?? []).map(({ order, agentId, label, owns, produces, instruction, executor, receiptRequired }) => ({
      order,
      agentId,
      label,
      owns: clone(owns),
      produces,
      instruction: boundedText(instruction, 700),
      executor,
      receiptRequired,
    })),
    agentExecution: clone(capabilityRoute.agentExecution),
    reuseGuide: capabilityRoute.reuseGuide ? {
      source: clone(capabilityRoute.reuseGuide.source),
      projectSchemaVersion: capabilityRoute.reuseGuide.projectSchemaVersion,
      requiredArchitecture: clone(capabilityRoute.reuseGuide.requiredArchitecture),
      fixedStep: clone(capabilityRoute.reuseGuide.fixedStep),
      oneFileAdaptation: clone(capabilityRoute.reuseGuide.oneFileAdaptation),
      activationPolicy: capabilityRoute.reuseGuide.activationPolicy,
    } : null,
    boundaries: clone(capabilityRoute.boundaries),
  };
}

export function buildProviderIterationContext({
  goal,
  baseGoal,
  strategy,
  condition,
  artDirection,
  iteration,
  project,
  quality,
  gameplayProgram,
  combatProgram,
  actorProgram,
  narrativeContract,
  visualIdentity,
  tuningContract,
  verbArchitecture,
  preferenceContext,
  capabilityRoute,
  priorAttempts,
  passPlan = null,
  activePass = null,
}) {
  return {
    goal,
    baseGoal: baseGoal === goal ? "[same as goal]" : baseGoal,
    strategy,
    condition,
    artDirection: clone(artDirection),
    iteration,
    providerPlan: passPlan ? {
      ...publicProviderPassPlan(passPlan),
      activePassId: activePass?.passId ?? null,
    } : null,
    project: compactProviderProject(project, activePass ? { mapIds: activePass.mapIds, projectionMode: activePass.projectionMode } : {}),
    quality: compactQualityReport(quality),
    gameplayProgram: clone(gameplayProgram),
    combatProgram: clone(combatProgram),
    actorProgram: clone(actorProgram),
    narrativeContract: clone(narrativeContract),
    visualIdentity: clone(visualIdentity),
    tuningContract: clone(tuningContract),
    verbArchitecture: clone(verbArchitecture),
    preferenceContext: clone(preferenceContext),
    capabilityRoute: compactCapabilityRoute(capabilityRoute),
    priorAttempts: compactPriorAttempts(priorAttempts),
  };
}

export function measureProviderIterationContext(context) {
  const sectionCharacters = Object.fromEntries(
    Object.entries(context ?? {}).map(([key, value]) => [key, JSON.stringify(value ?? null).length]),
  );
  const characters = JSON.stringify(context ?? null).length;
  return {
    characters,
    roughTokenEstimate: Math.ceil(characters / 4),
    sectionCharacters,
  };
}

export function preflightProviderIterationContext(context, roughTokenBudget = LOOPLAB_PROVIDER_CONTEXT_POLICY.defaultRoughTokenBudget) {
  const requestedBudget = Number(roughTokenBudget);
  const budgetRoughTokens = Number.isFinite(requestedBudget)
    ? Math.max(LOOPLAB_PROVIDER_CONTEXT_POLICY.minimumRoughTokenBudget, Math.min(LOOPLAB_PROVIDER_CONTEXT_POLICY.maximumRoughTokenBudget, Math.floor(requestedBudget)))
    : LOOPLAB_PROVIDER_CONTEXT_POLICY.defaultRoughTokenBudget;
  const measurement = measureProviderIterationContext(context);
  return {
    allowed: measurement.roughTokenEstimate <= budgetRoughTokens,
    budgetRoughTokens,
    ...measurement,
    largestSections: Object.entries(measurement.sectionCharacters).sort((first, second) => second[1] - first[1]).slice(0, 4),
    estimatePolicy: LOOPLAB_PROVIDER_CONTEXT_POLICY.estimatePolicy,
  };
}
