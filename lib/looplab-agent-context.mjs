import { buildAgentReadiness } from "./looplab-agent-readiness.mjs";
import { tileProgramDigest } from "./looplab-tile-program.mjs";
import { worldStreamDigest } from "./looplab-world-stream.mjs";
import { inspectInteractables } from "./looplab-interactables.mjs";

const AGENT_CONTEXT_SCHEMA_VERSION = "looplab-agent-project-context/v1";
const OBJECT_KINDS = Object.freeze(["player", "platform", "coin", "hazard", "decor", "spawn", "portal", "goal", "spring", "ladder", "conveyor", "crumble-platform", "key", "door", "pressure-plate", "one-way-platform"]);
const MAP_ID_LIST_KINDS = Object.freeze(["player", "spawn", "portal", "goal", "hazard"]);
const DEFAULT_MAP_LIMIT = 24;
const MAX_MAP_LIMIT = 64;
const MAX_SELECTED_MAPS = 8;

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function projectMaps(project) {
  if (Array.isArray(project?.maps) && project.maps.length) return project.maps;
  return [{
    id: project?.activeMapId ?? project?.startMapId ?? "map-main",
    name: project?.name ?? "Main map",
    width: project?.width,
    height: project?.height,
    projection: project?.projection,
    controlMode: project?.controlMode,
    objects: project?.objects ?? [],
    traversalPaths: project?.traversalPaths ?? [],
    collisionGeometry: project?.collisionGeometry,
    elevationTransitions: project?.elevationTransitions,
    navigation: project?.navigation,
    tileProgram: project?.tileProgram,
    worldStream: project?.worldStream,
  }];
}

function worldStreamContext(program) {
  if (!program || typeof program !== "object" || Array.isArray(program)) return null;
  const templates = Array.isArray(program.templates) ? program.templates : [];
  return {
    present: true,
    schemaVersion: program.schemaVersion ?? null,
    programDigest: worldStreamDigest(program),
    enabled: program.enabled !== false,
    mode: program.mode ?? null,
    axis: program.axis ?? null,
    seed: program.seed ?? null,
    startTemplateId: program.startTemplateId ?? null,
    horizon: program.horizon ?? null,
    sequence: clone(program.sequence ?? []),
    templates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      mapId: template.mapId,
      weight: template.weight,
      entry: clone(template.entry ?? null),
      exit: clone(template.exit ?? null),
    })),
    budgets: clone(program.budgets ?? null),
    tolerances: clone(program.tolerances ?? null),
    exactReadCommand: "get_world_stream",
    planCommand: "get_world_stream_plan",
    editWorkflow: ["suggest_world_stream", "set_world_stream", "get_world_stream_report"],
  };
}

function tileProgramContext(program, { paletteLimit = 128 } = {}) {
  if (!program || typeof program !== "object" || Array.isArray(program)) return null;
  const palette = Array.isArray(program.palette) ? program.palette : [];
  const terrainSets = Array.isArray(program.terrainSets) ? program.terrainSets : [];
  const layers = Array.isArray(program.layers) ? program.layers : [];
  const collisionProfiles = Array.isArray(program.collisionProfiles) ? program.collisionProfiles : [];
  const collisionLayers = Array.isArray(program.collisionLayers) ? program.collisionLayers : [];
  const summarizeChunks = (chunks) => ({
    count: Array.isArray(chunks) ? chunks.length : 0,
    storedCells: (Array.isArray(chunks) ? chunks : []).reduce((total, chunk) => total + (Array.isArray(chunk?.cells) ? chunk.cells.length : 0), 0),
    nonEmptyCells: (Array.isArray(chunks) ? chunks : []).reduce((total, chunk) => total + (Array.isArray(chunk?.cells) ? chunk.cells.filter((cell) => cell !== 0).length : 0), 0),
  });
  return {
    present: true,
    schemaVersion: program.schemaVersion ?? null,
    programDigest: tileProgramDigest(program),
    collisionOwner: program.collisionOwner ?? null,
    grid: { cellWidth: program.cellWidth ?? null, cellHeight: program.cellHeight ?? null, columns: program.columns ?? null, rows: program.rows ?? null, chunkSize: program.chunkSize ?? null },
    variationSeed: program.variationSeed ?? null,
    palette: {
      total: palette.length,
      returned: Math.min(palette.length, paletteLimit),
      truncated: palette.length > paletteLimit,
      entries: palette.slice(0, paletteLimit).map((entry) => ({ id: entry.id, name: entry.name, assetId: entry.assetId, frame: entry.frame, drawOffsetX: entry.drawOffsetX, drawOffsetY: entry.drawOffsetY, anchor: entry.anchor, transforms: clone(entry.transforms) })),
    },
    terrainSets: terrainSets.map((set) => ({ id: set.id, name: set.name, kind: set.kind, terrainIds: clone(set.terrainIds ?? []), variantCount: set.variants?.length ?? 0 })),
    layers: layers.map((layer) => ({ id: layer.id, name: layer.name, role: layer.role, visible: layer.visible, locked: layer.locked, supportZ: layer.supportZ, navigationLayerId: layer.navigationLayerId ?? null, terrainSetId: layer.terrainSetId ?? null, direct: summarizeChunks(layer.chunks), terrain: summarizeChunks(layer.terrainChunks) })),
    collisionProfiles: collisionProfiles.map((profile) => ({ id: profile.id, name: profile.name, shape: profile.shape })),
    collisionLayers: collisionLayers.map((layer) => ({ id: layer.id, name: layer.name, visible: layer.visible, locked: layer.locked, zMin: layer.zMin, zMax: layer.zMax, navigationLayerId: layer.navigationLayerId ?? null, cells: summarizeChunks(layer.chunks) })),
    cellPayloadOmitted: true,
    exactReadCommand: "get_tile_region",
    editWorkflow: ["preview_tile_patch", "apply_tile_patch"],
  };
}

function blankKindCounts() {
  return Object.fromEntries(OBJECT_KINDS.map((kind) => [kind, 0]));
}

function countNavigation(map, project) {
  const local = map?.navigation ?? null;
  const global = project?.navigation ?? null;
  const activeMapId = project?.activeMapId ?? project?.startMapId ?? projectMaps(project)[0]?.id;
  const belongsToMap = (entry) => entry?.mapId ? entry.mapId === map.id : map.id === activeMapId;
  const values = (field) => {
    if (Array.isArray(local?.[field])) return local[field];
    if (Array.isArray(global?.[field])) return global[field].filter(belongsToMap);
    return [];
  };
  return {
    layers: values("layers").length,
    nodes: values("nodes").length,
    links: values("links").length,
    areas: values("areas").length,
    authoredRoute: Boolean(local?.authoredRoute ?? (map.id === activeMapId ? global?.authoredRoute : null)),
  };
}

export function mapAgentIndexEntry(map, project, index = 0) {
  const objects = Array.isArray(map?.objects) ? map.objects : [];
  const byKind = blankKindCounts();
  const ids = Object.fromEntries(MAP_ID_LIST_KINDS.map((kind) => [kind, []]));
  for (const object of objects) {
    if (object?.kind in byKind) byKind[object.kind] += 1;
    if (object?.kind in ids && typeof object.id === "string") ids[object.kind].push(object.id);
  }
  const boundedIds = Object.fromEntries(Object.entries(ids).map(([kind, values]) => [kind, {
    total: values.length,
    returned: Math.min(values.length, 24),
    truncated: values.length > 24,
    ids: values.slice(0, 24),
  }]));
  const interactableInstanceIds = [...new Set(objects.map((object) => object?.interactable?.instanceId).filter(Boolean))].sort();
  return {
    id: map?.id ?? `map-${index + 1}`,
    name: map?.name ?? `Map ${index + 1}`,
    order: index,
    active: (project?.activeMapId ?? project?.startMapId) === map?.id,
    start: (project?.startMapId ?? project?.activeMapId) === map?.id,
    size: { width: Number(map?.width ?? project?.width ?? 0), height: Number(map?.height ?? project?.height ?? 0) },
    projection: clone(map?.projection ?? project?.projection ?? { type: "orthographic" }),
    controlMode: map?.controlMode ?? project?.controlMode ?? null,
    objectCount: objects.length,
    interactables: {
      instanceCount: interactableInstanceIds.length,
      returned: Math.min(interactableInstanceIds.length, 24),
      truncated: interactableInstanceIds.length > 24,
      instanceIds: interactableInstanceIds.slice(0, 24),
    },
    byKind,
    objectIdsByKind: boundedIds,
    traversalPathCount: Array.isArray(map?.traversalPaths) ? map.traversalPaths.length : 0,
    collisionChainCount: Array.isArray(map?.collisionGeometry?.chains) ? map.collisionGeometry.chains.length : 0,
    elevationTransitionCount: Array.isArray(map?.elevationTransitions?.transitions) ? map.elevationTransitions.transitions.length : 0,
    navigation: countNavigation(map, project),
    tileProgram: tileProgramContext(map?.tileProgram ?? (map?.id === project?.activeMapId ? project?.tileProgram : null), { paletteLimit: 0 }),
    worldStream: worldStreamContext(map?.worldStream ?? (map?.id === project?.activeMapId ? project?.worldStream : null)),
  };
}

export function summarizeAgentCampaign(project) {
  const maps = projectMaps(project);
  const entries = maps.map((map, index) => mapAgentIndexEntry(map, project, index));
  const byKind = blankKindCounts();
  for (const entry of entries) for (const kind of OBJECT_KINDS) byKind[kind] += entry.byKind[kind];
  return {
    mapCount: entries.length,
    objectCount: entries.reduce((total, entry) => total + entry.objectCount, 0),
    traversalPathCount: entries.reduce((total, entry) => total + entry.traversalPathCount, 0),
    collisionChainCount: entries.reduce((total, entry) => total + entry.collisionChainCount, 0),
    elevationTransitionCount: entries.reduce((total, entry) => total + entry.elevationTransitionCount, 0),
    worldStreamMapCount: entries.filter((entry) => entry.worldStream?.present).length,
    navigation: entries.reduce((total, entry) => ({
      layers: total.layers + entry.navigation.layers,
      nodes: total.nodes + entry.navigation.nodes,
      links: total.links + entry.navigation.links,
      areas: total.areas + entry.navigation.areas,
      authoredRouteMaps: total.authoredRouteMaps + (entry.navigation.authoredRoute ? 1 : 0),
    }), { layers: 0, nodes: 0, links: 0, areas: 0, authoredRouteMaps: 0 }),
    byKind,
  };
}

function assetMetadata(asset) {
  const dataUrl = typeof asset?.dataUrl === "string" ? asset.dataUrl : "";
  return {
    id: asset?.id ?? null,
    name: asset?.name ?? null,
    type: asset?.type ?? asset?.kind ?? null,
    dimensions: {
      width: Number(asset?.width ?? 0),
      height: Number(asset?.height ?? 0),
      frameWidth: Number(asset?.frameWidth ?? asset?.width ?? 0),
      frameHeight: Number(asset?.frameHeight ?? asset?.height ?? 0),
      frames: Number(asset?.frames ?? 1),
      columns: Number(asset?.columns ?? 1),
    },
    anchor: {
      mode: asset?.anchorMode ?? null,
      x: Number(asset?.anchorX ?? 0),
      y: Number(asset?.anchorY ?? 0),
    },
    collisionPolicy: asset?.collisionPolicy ?? null,
    opaqueBounds: clone(asset?.opaqueBounds ?? null),
    colliderBounds: clone(asset?.colliderBounds ?? null),
    invariants: clone(asset?.invariants ?? null),
    analysis: clone(asset?.analysis ?? null),
    generator: clone(asset?.generator ?? null),
    license: clone(asset?.license ?? null),
    source: clone(asset?.source ?? null),
    embedded: Boolean(dataUrl),
    embeddedCharacters: dataUrl.length,
  };
}

function acceptanceIndex(test) {
  const driver = test?.driver ?? {};
  return {
    id: test?.id ?? null,
    name: test?.name ?? null,
    featureId: test?.featureId ?? null,
    assertion: test?.assertion ?? null,
    runner: test?.runner ?? null,
    startMapId: driver.startMapId ?? null,
    startSpawnId: driver.startSpawnId ?? null,
    tickRate: Number(driver.tickRate ?? 0) || null,
    tickCount: Number(driver.tickCount ?? 0) || null,
    inputCount: Array.isArray(driver.inputs) ? driver.inputs.length : 0,
    assertionCount: Array.isArray(test?.assertions) ? test.assertions.length : 0,
  };
}

function replayIndex(replayCase) {
  return {
    id: replayCase?.id ?? null,
    revision: replayCase?.revision ?? replayCase?.version ?? null,
    hashVersion: replayCase?.hashVersion ?? null,
    startMapId: replayCase?.startMapId ?? replayCase?.driver?.startMapId ?? null,
    startSpawnId: replayCase?.startSpawnId ?? replayCase?.driver?.startSpawnId ?? null,
    tickCount: Number(replayCase?.tickCount ?? replayCase?.ticks ?? replayCase?.driver?.tickCount ?? 0) || null,
    inputCount: Array.isArray(replayCase?.inputs) ? replayCase.inputs.length : Array.isArray(replayCase?.driver?.inputs) ? replayCase.driver.inputs.length : 0,
    checkpointCount: Array.isArray(replayCase?.checkpoints) ? replayCase.checkpoints.length : 0,
    expectedHash: replayCase?.expectedHash ?? replayCase?.hash ?? null,
  };
}

function sanitizedDesignBrief(brief) {
  if (!brief || typeof brief !== "object") return null;
  const allowed = ["genre", "coreLoop", "movementTemplate", "format", "progression", "campaignScope", "camera", "mapStyle", "artDirectionMode", "styleLocks"];
  const result = Object.fromEntries(allowed.filter((key) => brief[key] !== undefined).map((key) => [key, clone(brief[key])]));
  result.hasUserPrompt = typeof brief.userPrompt === "string" && brief.userPrompt.trim().length > 0;
  result.userPromptCharacters = typeof brief.userPrompt === "string" ? brief.userPrompt.length : 0;
  result.omittedPreparedPromptCharacters = [brief.composedPrompt, brief.providerPrompt, brief.preparedPrompt].reduce((total, value) => total + (typeof value === "string" ? value.length : 0), 0);
  return result;
}

const OMIT_KEY = /(?:dataurl|base64|(?:^|_)(?:html|snapshot|snapshots|pixels|pixeldata|rawbytes|imagebytes|audiobytes|fontbytes|binary)$|exportedhtml|verificationhtml|api[_-]?key|authorization|(?:access|refresh|session|auth|bearer)[_-]?token|private[_-]?key|secret|composedprompt|preparedprompt|providerprompt|providerrequest|providerresponse)/i;

function sanitizeMapDocument(value, key = "") {
  if (OMIT_KEY.test(key)) return undefined;
  if (Array.isArray(value)) return value.map((entry) => sanitizeMapDocument(entry)).filter((entry) => entry !== undefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).flatMap(([childKey, childValue]) => {
      const sanitized = sanitizeMapDocument(childValue, childKey);
      return sanitized === undefined ? [] : [[childKey, sanitized]];
    }));
  }
  return value;
}

function contextConnections(runtimeJoinPlan, maps) {
  if (Array.isArray(runtimeJoinPlan?.joins)) {
    return runtimeJoinPlan.joins.map((join) => ({
      id: join.id ?? null,
      sourceMapId: join.sourceMapId ?? null,
      sourcePortalId: join.portalId ?? null,
      targetMapId: join.targetMapId ?? null,
      targetSpawnId: join.targetSpawnId ?? null,
      transition: join.transition ?? null,
      sourceEdge: join.contract?.sourceEdge ?? null,
      targetEdge: join.contract?.targetEdge ?? null,
      exactSpawnRequired: join.contract?.requireExactSpawn === true,
      clearLandingRequired: join.contract?.requireClearLanding === true,
      runtimeJoinPresent: true,
    }));
  }
  return maps.flatMap((map) => (map.objects ?? []).filter((object) => object?.kind === "portal").map((portal) => ({
    id: `join:${map.id}:${portal.id}`,
    sourceMapId: map.id,
    sourcePortalId: portal.id,
    targetMapId: portal.targetMapId ?? null,
    targetSpawnId: portal.targetSpawnId ?? null,
    transition: portal.transition ?? null,
    runtimeJoinPresent: false,
  })));
}

function doctorIndex(doctor) {
  if (!doctor) return null;
  return {
    profile: doctor.profile ?? null,
    score: doctor.score ?? null,
    errorCount: doctor.errorCount ?? null,
    warningCount: doctor.warningCount ?? null,
    digest: doctor.digest ?? null,
    gateBlocking: doctor.gate?.blocking === true,
    acceptanceStatus: doctor.acceptanceResults?.status ?? null,
    completionStatus: doctor.completionReport?.status ?? null,
    replayStatus: doctor.replayResults?.status ?? null,
    visualStatus: doctor.visualReadiness?.status ?? null,
  };
}

function contextMeasurements(project, draft) {
  const fullProjectCharacters = JSON.stringify(project).length;
  const payload = JSON.stringify(draft);
  const payloadCharacters = payload.length;
  const utf8Bytes = new TextEncoder().encode(payload).length;
  const characterDelta = fullProjectCharacters - payloadCharacters;
  return {
    fullProjectCharacters,
    payloadCharacters,
    utf8Bytes,
    roughTokenEstimate: Math.ceil(payloadCharacters / 4),
    roughTokenEstimatePolicy: "Planning estimate only; provider tokenization varies.",
    smallerThanFullProject: characterDelta >= 0,
    omittedCharacters: Math.max(0, characterDelta),
    overheadCharacters: Math.max(0, -characterDelta),
    reductionRatio: fullProjectCharacters > 0 && characterDelta > 0 ? Number((characterDelta / fullProjectCharacters).toFixed(4)) : 0,
  };
}

export function buildAgentProjectContext(project, options = {}) {
  const view = options.view ?? "campaign";
  if (!new Set(["campaign", "map"]).has(view)) throw new Error("get_project_context view must be campaign or map.");
  const mapLimit = options.mapLimit === undefined ? DEFAULT_MAP_LIMIT : options.mapLimit;
  if (!Number.isInteger(mapLimit) || mapLimit < 1 || mapLimit > MAX_MAP_LIMIT) {
    throw new Error(`get_project_context mapLimit must be an integer from 1 to ${MAX_MAP_LIMIT}.`);
  }
  const maps = projectMaps(project);
  if (options.mapIds !== undefined && !Array.isArray(options.mapIds)) throw new Error("get_project_context mapIds must be an array of stable map ID strings.");
  const mapIds = (options.mapIds ?? []).map((value) => {
    if (typeof value !== "string" || !value.trim()) throw new Error("get_project_context mapIds must contain only non-empty strings.");
    return value.trim();
  });
  if (new Set(mapIds).size !== mapIds.length) throw new Error("get_project_context mapIds must not contain duplicates.");
  if (mapIds.length > MAX_SELECTED_MAPS) throw new Error(`get_project_context accepts at most ${MAX_SELECTED_MAPS} mapIds.`);
  if (view === "map" && !mapIds.length) throw new Error("get_project_context map view requires at least one stable mapId.");
  const mapById = new Map(maps.map((map) => [map.id, map]));
  const unknownMapIds = mapIds.filter((id) => !mapById.has(id));
  if (unknownMapIds.length) throw new Error(`Unknown mapIds: ${unknownMapIds.join(", ")}.`);
  const selectedMaps = view === "map" ? mapIds.map((id) => mapById.get(id)) : [];
  const allIndex = maps.map((map, index) => mapAgentIndexEntry(map, project, index));
  const campaign = summarizeAgentCampaign(project);
  const replayCases = project?.replay?.cases ?? project?.replayCases ?? [];
  const assets = (project?.assets ?? []).map(assetMetadata);
  const interactableReport = inspectInteractables(project);
  const referencedAssetIds = [...new Set(selectedMaps.flatMap((map) => [
    ...(map?.objects ?? []).map((object) => object?.assetId),
    ...(map?.tileProgram?.palette ?? []).map((entry) => entry?.assetId),
  ].filter(Boolean)))];
  const context = {
    schemaVersion: AGENT_CONTEXT_SCHEMA_VERSION,
    view,
    protocolVersion: options.protocolVersion ?? null,
    sourceDigest: options.sourceDigest ?? null,
    sourceOfTruth: false,
    mutationInput: false,
    verificationEvidence: false,
    fullProjectCommand: "get_project",
    project: {
      name: project?.name ?? null,
      schemaVersion: project?.schemaVersion ?? null,
      activeMapId: project?.activeMapId ?? maps[0]?.id ?? null,
      startMapId: project?.startMapId ?? maps[0]?.id ?? null,
      runtimeProfile: clone(project?.runtimeProfile ?? null),
      doctorProfile: project?.doctorProfile ?? null,
      packageBudgetBytes: project?.packageBudgetBytes ?? null,
      buildId: project?.build?.id ?? null,
      iteration: project?.iteration ? {
        id: project.iteration.id ?? null,
        parentId: project.iteration.parentId ?? null,
        status: project.iteration.status ?? null,
        track: project.iteration.track ?? null,
        readOnly: project.iteration.readOnly === true,
      } : null,
    },
    campaign,
    maps: {
      total: allIndex.length,
      returned: Math.min(allIndex.length, mapLimit),
      truncated: allIndex.length > mapLimit,
      entries: allIndex.slice(0, mapLimit),
    },
    selectedMapIds: mapIds,
    mapDocuments: selectedMaps.map((map) => {
      const document = sanitizeMapDocument(map);
      delete document.tileProgram;
      if (map?.tileProgram) document.tileProgram = tileProgramContext(map.tileProgram);
      delete document.worldStream;
      if (map?.worldStream) document.worldStream = worldStreamContext(map.worldStream);
      return document;
    }),
    connections: contextConnections(options.runtimeJoinPlan, maps),
    assets: {
      total: assets.length,
      referencedBySelectedMaps: referencedAssetIds,
      entries: assets,
      payloadPolicy: "Metadata only. Embedded image/audio/font bytes are omitted.",
    },
    authoring: {
      designBrief: sanitizedDesignBrief(project?.designBrief),
      featureContracts: sanitizeMapDocument(project?.featureContracts ?? []),
      gameplayProgram: sanitizeMapDocument(project?.gameplayProgram ?? null),
      combatProgram: sanitizeMapDocument(project?.combatProgram ?? null),
      actorProgram: sanitizeMapDocument(project?.actorProgram ?? null),
      presentationProgram: sanitizeMapDocument(project?.presentationProgram ?? null),
      gameShell: sanitizeMapDocument(project?.gameShell ?? null),
      saveProgram: sanitizeMapDocument(project?.saveProgram ?? null),
      narrativeContract: sanitizeMapDocument(project?.narrativeContract ?? null),
      visualIdentity: sanitizeMapDocument(project?.visualIdentity ?? null),
      tuningContract: sanitizeMapDocument(project?.tuningContract ?? null),
      structuralScaffoldContract: sanitizeMapDocument(project?.structuralScaffoldContract ?? null),
      spatialLayoutContract: sanitizeMapDocument(project?.spatialLayoutContract ?? null),
      verbArchitecture: sanitizeMapDocument(project?.verbArchitecture ?? null),
      inputActions: sanitizeMapDocument(project?.inputActions ?? []),
      movementTuning: sanitizeMapDocument(project?.movementTuning ?? null),
      qualityContracts: sanitizeMapDocument(project?.qualityContracts ?? null),
      release: sanitizeMapDocument(project?.release ?? null),
      deviceProfiles: sanitizeMapDocument(project?.deviceProfiles ?? []),
      interactables: {
        present: interactableReport.present,
        valid: interactableReport.valid,
        registryDigest: interactableReport.registryDigest,
        templateCount: interactableReport.templateCount,
        instanceCount: interactableReport.instanceCount,
        objectCount: interactableReport.objectCount,
        instances: sanitizeMapDocument(interactableReport.instances),
        errors: sanitizeMapDocument(interactableReport.errors),
        warnings: sanitizeMapDocument(interactableReport.warnings),
        workflow: ["list_interactable_templates", "get_interactable_template", "preview_interactable_template", "apply_interactable_template", "get_interactable_report"],
      },
    },
    evidenceIndex: {
      doctor: doctorIndex(options.doctor),
      narrative: options.doctor?.narrativeReport ? sanitizeMapDocument({
        schemaVersion: options.doctor.narrativeReport.schemaVersion,
        status: options.doctor.narrativeReport.status,
        sourceDigest: options.doctor.narrativeReport.sourceDigest,
        contractDigest: options.doctor.narrativeReport.contractDigest,
        metrics: options.doctor.narrativeReport.metrics,
        analysis: options.doctor.narrativeReport.analysis,
        issues: options.doctor.narrativeReport.issues?.slice(0, 24),
        shortestEndingPaths: options.doctor.narrativeReport.shortestEndingPaths,
        proofBoundary: options.doctor.narrativeReport.proofBoundary,
      }) : null,
      visualIdentity: options.doctor?.visualIdentityReport ? sanitizeMapDocument({
        schemaVersion: options.doctor.visualIdentityReport.schemaVersion,
        status: options.doctor.visualIdentityReport.status,
        sourceDigest: options.doctor.visualIdentityReport.sourceDigest,
        identityDigest: options.doctor.visualIdentityReport.identityDigest,
        metrics: options.doctor.visualIdentityReport.metrics,
        referenceEvidence: options.doctor.visualIdentityReport.referenceEvidence,
        issues: options.doctor.visualIdentityReport.issues?.slice(0, 24),
        proofBoundary: options.doctor.visualIdentityReport.proofBoundary,
      }) : null,
      tuning: options.doctor?.tuningReport ? sanitizeMapDocument({
        schemaVersion: options.doctor.tuningReport.schemaVersion,
        status: options.doctor.tuningReport.status,
        sourceDigest: options.doctor.tuningReport.sourceDigest,
        contractDigest: options.doctor.tuningReport.contractDigest,
        metrics: options.doctor.tuningReport.metrics,
        feel: options.doctor.tuningReport.feel,
        issues: options.doctor.tuningReport.issues?.slice(0, 24),
        limitations: options.doctor.tuningReport.limitations,
      }) : null,
      readiness: options.doctor && options.releaseDoctor ? buildAgentReadiness(options.doctor, options.releaseDoctor, { maxReleaseFindings: 8 }) : null,
      acceptance: (project?.acceptanceTests ?? []).map(acceptanceIndex),
      replay: replayCases.map(replayIndex),
      verification: project?.iteration?.verification ? {
        sourceDigest: project.iteration.verification.sourceDigest ?? null,
        doctorDigest: project.iteration.verification.digest ?? null,
        collectedAt: project.iteration.verification.collectedAt ?? null,
      } : null,
    },
    workLedger: clone(options.workLedger ?? null),
    omissionPolicy: {
      omitted: [
        "embedded asset/resource data URLs and binary-like pixel payloads",
        "prepared/composed provider prompt bodies and provider request/response bodies",
        "iteration snapshots and exported HTML",
        "secrets, API keys, authorization tokens, and provider credentials",
        view === "campaign" ? "complete map object documents; request view=map with stable mapIds" : "unselected map object documents",
        "complete shared-work event history",
      ],
      interpretation: "An omitted field is unknown in this view, never evidence that the authored value is absent.",
      fullFallback: { op: "get_project" },
    },
  };
  return { ...context, measurements: contextMeasurements(project, context) };
}

export const LOOPLAB_AGENT_PROJECT_CONTEXT_SCHEMA = AGENT_CONTEXT_SCHEMA_VERSION;
export const LOOPLAB_AGENT_PROJECT_CONTEXT_LIMITS = Object.freeze({ defaultMapLimit: DEFAULT_MAP_LIMIT, maxMapLimit: MAX_MAP_LIMIT, maxSelectedMaps: MAX_SELECTED_MAPS });
