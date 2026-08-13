import { canonicalSha256 } from "./looplab-canonical-digest.mjs";
import { compileTileRuntimeProgram } from "./looplab-tile-runtime.mjs";
import { inspectTileProgram } from "./looplab-tile-program.mjs";

export const LOOPLAB_WORLD_STREAM_SCHEMA = "looplab-world-stream/v1";
export const LOOPLAB_WORLD_STREAM_REPORT_SCHEMA = "looplab-world-stream-report/v1";
export const LOOPLAB_WORLD_STREAM_PLAN_SCHEMA = "looplab-world-stream-plan/v1";
export const LOOPLAB_WORLD_STREAM_RUNTIME_SCHEMA = "looplab-world-stream-runtime/v1";
export const LOOPLAB_WORLD_STREAM_SEAM_SCHEMA = "looplab-world-stream-seam/v1";

export const LOOPLAB_WORLD_STREAM_LIMITS = Object.freeze({
  maximumTemplates: 128,
  maximumFiniteSequence: 4_096,
  maximumHorizon: 4_096,
  maximumResidentChunks: 16,
  maximumResidentTileCells: 262_144,
  maximumResidentCollisionCells: 131_072,
  maximumDecodedRgbaBytes: 1_073_741_824,
  maximumCullPadding: 4_096,
  maximumCoordinateMagnitude: 1_048_576,
  maximumSocketSpan: 65_536,
  maximumSeedLength: 128,
});

export const LOOPLAB_WORLD_STREAM_POLICY = Object.freeze({
  sourceField: "map.worldStream",
  ownership: "Authored map chunks, sockets, budgets, and deterministic selection own world composition. Tiles, sprites, screenshots, and renderer objects never invent adjacency.",
  scope: "Version 1 is a finite or seeded horizontal/vertical route. It does not claim arbitrary branching, rotation, scaling, network streaming, or a 3D world.",
  deterministicSelection: "Compatible candidates are stable-ID sorted and selected by canonical SHA-256 over seed, ordinal, prior template, and prior socket. Math.random and array order are never gameplay truth.",
  residency: "Resident chunks and camera-visible entries are separate budgets. Single-file streaming activates embedded source only and performs no runtime fetch.",
  assetMemory: "Decoded RGBA bytes are counted once per unique embedded asset referenced by the resident window, never once per repeated chunk instance.",
  collision: "Authored object and tile collision remain independent from art. A socket aligns map coordinates but never creates a collider from pixels.",
  evidence: "A valid plan proves deterministic geometry only. Captured first-draw and unique-pixel seam evidence remain required before claiming a visually seamless release.",
  judgmentBoundary: "Project Doctor can prove schema, compatibility, deterministic planning, budgets, and unsupported-system rejection. It cannot prove pacing, route quality, visual composition, or fun.",
});

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const MODES = new Set(["finite", "seeded"]);
const AXES = new Set(["horizontal", "vertical"]);
const EDGES = new Set(["left", "right", "top", "bottom"]);
const PROGRAM_FIELDS = new Set(["schemaVersion", "owner", "enabled", "mode", "axis", "seed", "startTemplateId", "horizon", "sequence", "budgets", "tolerances", "templates"]);
const TEMPLATE_FIELDS = new Set(["id", "name", "mapId", "weight", "entry", "exit"]);
const SOCKET_FIELDS = new Set(["id", "tag", "edge", "x", "y", "z", "span"]);
const BUDGET_FIELDS = new Set(["retainBehind", "prefetchAhead", "maxResidentChunks", "maxResidentTileCells", "maxResidentCollisionCells", "maxDecodedRgbaBytes", "cullPadding"]);
const TOLERANCE_FIELDS = new Set(["crossAxis", "z", "span"]);

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const stableId = (value) => typeof value === "string" && STABLE_ID.test(value);
const compareIds = (first, second) => String(first) < String(second) ? -1 : String(first) > String(second) ? 1 : 0;
function boundedInteger(value, fallback, minimum, maximum) {
  return Number.isInteger(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function boundedNumber(value, fallback, minimum, maximum) {
  return finite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function unknownFields(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function mapsForProject(project = {}) {
  return Array.isArray(project?.maps) && project.maps.length
    ? project.maps
    : [{
        id: project?.activeMapId ?? "map-main",
        name: project?.name ?? "Main map",
        width: project?.width,
        height: project?.height,
        background: project?.background,
        gravity: project?.gravity,
        grid: project?.grid,
        controlMode: project?.controlMode,
        projection: project?.projection,
        navigation: project?.navigation,
        objects: project?.objects ?? [],
        traversalPaths: project?.traversalPaths,
        collisionGeometry: project?.collisionGeometry,
        elevationTransitions: project?.elevationTransitions,
        tileProgram: project?.tileProgram,
        worldStream: project?.worldStream,
      }];
}

function mapForInspection(project, mapId) {
  const maps = mapsForProject(project);
  return maps.find((map) => map?.id === mapId)
    ?? maps.find((map) => map?.id === project?.activeMapId)
    ?? maps[0]
    ?? null;
}

function normalizeSocket(socket, fallbackId) {
  if (!socket || typeof socket !== "object" || Array.isArray(socket)) return null;
  return {
    id: String(socket.id ?? fallbackId).trim(),
    tag: String(socket.tag ?? "route").trim(),
    edge: EDGES.has(socket.edge) ? socket.edge : fallbackId === "entry" ? "left" : "right",
    x: finite(socket.x) ? socket.x : 0,
    y: finite(socket.y) ? socket.y : 0,
    z: finite(socket.z) ? socket.z : 0,
    span: boundedNumber(socket.span, 1, 0.001, LOOPLAB_WORLD_STREAM_LIMITS.maximumSocketSpan),
  };
}

function normalizeTemplate(template = {}) {
  return {
    id: String(template.id ?? "").trim(),
    name: String(template.name ?? template.id ?? "World chunk").trim(),
    mapId: String(template.mapId ?? "").trim(),
    weight: boundedNumber(template.weight, 1, 0.000001, 1_000_000),
    entry: normalizeSocket(template.entry, "entry"),
    exit: normalizeSocket(template.exit, "exit"),
  };
}

export function normalizeWorldStream(input = {}) {
  const mode = MODES.has(input.mode) ? input.mode : "finite";
  const axis = AXES.has(input.axis) ? input.axis : "horizontal";
  const sequence = (Array.isArray(input.sequence) ? input.sequence : []).map((value) => String(value ?? "").trim()).filter(Boolean);
  const retainBehind = boundedInteger(input.budgets?.retainBehind, 1, 0, LOOPLAB_WORLD_STREAM_LIMITS.maximumResidentChunks - 1);
  const prefetchAhead = boundedInteger(input.budgets?.prefetchAhead, 2, 0, LOOPLAB_WORLD_STREAM_LIMITS.maximumResidentChunks - 1);
  const minimumResident = Math.min(LOOPLAB_WORLD_STREAM_LIMITS.maximumResidentChunks, retainBehind + prefetchAhead + 1);
  return {
    schemaVersion: LOOPLAB_WORLD_STREAM_SCHEMA,
    owner: "authored-map",
    enabled: input.enabled !== false,
    mode,
    axis,
    seed: String(input.seed ?? "looplab-world").slice(0, LOOPLAB_WORLD_STREAM_LIMITS.maximumSeedLength),
    startTemplateId: String(input.startTemplateId ?? sequence[0] ?? "").trim(),
    horizon: boundedInteger(input.horizon, mode === "finite" ? Math.max(2, sequence.length) : 64, 2, LOOPLAB_WORLD_STREAM_LIMITS.maximumHorizon),
    sequence,
    budgets: {
      retainBehind,
      prefetchAhead,
      maxResidentChunks: boundedInteger(input.budgets?.maxResidentChunks, Math.max(4, minimumResident), minimumResident, LOOPLAB_WORLD_STREAM_LIMITS.maximumResidentChunks),
      maxResidentTileCells: boundedInteger(input.budgets?.maxResidentTileCells, 16_384, 1, LOOPLAB_WORLD_STREAM_LIMITS.maximumResidentTileCells),
      maxResidentCollisionCells: boundedInteger(input.budgets?.maxResidentCollisionCells, 8_192, 1, LOOPLAB_WORLD_STREAM_LIMITS.maximumResidentCollisionCells),
      maxDecodedRgbaBytes: boundedInteger(input.budgets?.maxDecodedRgbaBytes, 67_108_864, 1, LOOPLAB_WORLD_STREAM_LIMITS.maximumDecodedRgbaBytes),
      cullPadding: boundedNumber(input.budgets?.cullPadding, 64, 0, LOOPLAB_WORLD_STREAM_LIMITS.maximumCullPadding),
    },
    tolerances: {
      crossAxis: boundedNumber(input.tolerances?.crossAxis, 0.001, 0, 64),
      z: boundedNumber(input.tolerances?.z, 0.001, 0, 64),
      span: boundedNumber(input.tolerances?.span, 0.001, 0, 64),
    },
    templates: (Array.isArray(input.templates) ? input.templates : []).map(normalizeTemplate).sort((first, second) => compareIds(first.id, second.id)),
  };
}

export function worldStreamDigest(input = {}) {
  return canonicalSha256(normalizeWorldStream(input));
}

export function worldStreamSocketsCompatible(sourceSocket, targetSocket, options = {}) {
  const axis = AXES.has(options.axis) ? options.axis : "horizontal";
  const tolerances = {
    crossAxis: boundedNumber(options.tolerances?.crossAxis, 0.001, 0, 64),
    z: boundedNumber(options.tolerances?.z, 0.001, 0, 64),
    span: boundedNumber(options.tolerances?.span, 0.001, 0, 64),
  };
  const expectedSourceEdge = axis === "horizontal" ? "right" : "bottom";
  const expectedTargetEdge = axis === "horizontal" ? "left" : "top";
  const sourceCross = axis === "horizontal" ? Number(sourceSocket?.y) : Number(sourceSocket?.x);
  const targetCross = axis === "horizontal" ? Number(targetSocket?.y) : Number(targetSocket?.x);
  const checks = [
    { id: "source-edge", passed: sourceSocket?.edge === expectedSourceEdge, expected: expectedSourceEdge, observed: sourceSocket?.edge ?? null },
    { id: "target-edge", passed: targetSocket?.edge === expectedTargetEdge, expected: expectedTargetEdge, observed: targetSocket?.edge ?? null },
    { id: "tag", passed: Boolean(sourceSocket?.tag) && sourceSocket?.tag === targetSocket?.tag, expected: sourceSocket?.tag ?? null, observed: targetSocket?.tag ?? null },
    { id: "cross-axis", passed: finite(sourceCross) && finite(targetCross) && Math.abs(sourceCross - targetCross) <= tolerances.crossAxis, expected: sourceCross, observed: targetCross },
    { id: "z", passed: finite(sourceSocket?.z) && finite(targetSocket?.z) && Math.abs(Number(sourceSocket.z) - Number(targetSocket.z)) <= tolerances.z, expected: sourceSocket?.z ?? null, observed: targetSocket?.z ?? null },
    { id: "span", passed: finite(sourceSocket?.span) && finite(targetSocket?.span) && Math.abs(Number(sourceSocket.span) - Number(targetSocket.span)) <= tolerances.span, expected: sourceSocket?.span ?? null, observed: targetSocket?.span ?? null },
  ];
  return {
    schemaVersion: "looplab-world-stream-socket-match/v1",
    axis,
    compatible: checks.every((check) => check.passed),
    checks,
  };
}

function deterministicUnit(identity) {
  return Number.parseInt(canonicalSha256(identity).slice("sha256:".length, "sha256:".length + 13), 16) / 0x1_0000_0000_0000;
}

function chooseWeightedTemplate(candidates, identity) {
  const ordered = candidates.filter((candidate) => Number(candidate.weight) > 0).sort((first, second) => compareIds(first.id, second.id));
  const totalWeight = ordered.reduce((sum, candidate) => sum + Number(candidate.weight), 0);
  const unit = deterministicUnit(identity);
  if (!(totalWeight > 0)) return { selected: null, unit, totalWeight: 0, candidateIds: ordered.map((candidate) => candidate.id) };
  let cursor = unit * totalWeight;
  let selected = ordered.at(-1) ?? null;
  for (const candidate of ordered) {
    cursor -= Number(candidate.weight);
    if (cursor < 0) { selected = candidate; break; }
  }
  return { selected, unit, totalWeight, candidateIds: ordered.map((candidate) => candidate.id) };
}

export function planWorldStream(project = {}, input, options = {}) {
  const program = normalizeWorldStream(input ?? mapForInspection(project, options.mapId)?.worldStream ?? {});
  const maps = mapsForProject(project);
  const mapById = new Map(maps.map((map) => [map.id, map]));
  const templateById = new Map(program.templates.map((template) => [template.id, template]));
  const requestedCount = program.mode === "finite"
    ? program.sequence.length
    : boundedInteger(options.count, program.horizon, 1, LOOPLAB_WORLD_STREAM_LIMITS.maximumHorizon);
  const templateIds = program.mode === "finite" ? [...program.sequence] : [program.startTemplateId];
  const choices = [];
  let contradiction = null;
  if (!templateById.has(program.startTemplateId)) contradiction = { ordinal: 0, code: "missing-start-template", message: `World stream start template ${program.startTemplateId || "(empty)"} does not exist.` };
  while (!contradiction && templateIds.length < requestedCount) {
    const ordinal = templateIds.length;
    const previous = templateById.get(templateIds[ordinal - 1]);
    if (!previous?.exit) {
      contradiction = { ordinal, code: "missing-exit-socket", message: `Template ${previous?.id ?? "(missing)"} cannot continue without an exit socket.` };
      break;
    }
    const candidates = program.templates.filter((candidate) => candidate.entry && candidate.exit && worldStreamSocketsCompatible(previous.exit, candidate.entry, program).compatible);
    const choice = chooseWeightedTemplate(candidates, { seed: program.seed, ordinal, priorTemplateId: previous.id, priorSocketId: previous.exit.id });
    choices.push({ ordinal, priorTemplateId: previous.id, priorSocketId: previous.exit.id, candidateIds: choice.candidateIds, totalWeight: choice.totalWeight, unit: choice.unit, selectedTemplateId: choice.selected?.id ?? null });
    if (!choice.selected) {
      contradiction = { ordinal, code: "no-compatible-template", message: `No template has an entry socket compatible with ${previous.id}.${previous.exit.id}.` };
      break;
    }
    templateIds.push(choice.selected.id);
  }

  const instances = [];
  const seams = [];
  for (let ordinal = 0; !contradiction && ordinal < templateIds.length; ordinal += 1) {
    const template = templateById.get(templateIds[ordinal]);
    const map = template ? mapById.get(template.mapId) : null;
    if (!template || !map) {
      contradiction = { ordinal, code: "missing-template-map", message: `Template ${templateIds[ordinal] ?? "(missing)"} references a missing map.` };
      break;
    }
    let x = 0;
    let y = 0;
    if (ordinal > 0) {
      const prior = instances[ordinal - 1];
      const priorTemplate = templateById.get(prior.templateId);
      const compatibility = worldStreamSocketsCompatible(priorTemplate?.exit, template.entry, program);
      if (!compatibility.compatible) {
        contradiction = { ordinal, code: "incompatible-sequence", message: `${priorTemplate?.id ?? "(missing)"} cannot join ${template.id}.`, checks: compatibility.checks };
        break;
      }
      x = prior.x + Number(priorTemplate.exit.x) - Number(template.entry.x);
      y = prior.y + Number(priorTemplate.exit.y) - Number(template.entry.y);
      seams.push({
        id: `seam-${String(ordinal - 1).padStart(6, "0")}-${String(ordinal).padStart(6, "0")}`,
        sourceOrdinal: ordinal - 1,
        targetOrdinal: ordinal,
        sourceInstanceId: prior.id,
        targetInstanceId: `chunk-${String(ordinal).padStart(6, "0")}-${template.id}`,
        sourceTemplateId: prior.templateId,
        targetTemplateId: template.id,
        sourceSocketId: priorTemplate.exit.id,
        targetSocketId: template.entry.id,
        tag: template.entry.tag,
        x: prior.x + Number(priorTemplate.exit.x),
        y: prior.y + Number(priorTemplate.exit.y),
        z: Number(priorTemplate.exit.z),
        compatibility,
      });
    }
    instances.push({
      id: `chunk-${String(ordinal).padStart(6, "0")}-${template.id}`,
      ordinal,
      templateId: template.id,
      mapId: template.mapId,
      x,
      y,
      width: Number(map.width || 0),
      height: Number(map.height || 0),
      entrySocketId: template.entry?.id ?? null,
      exitSocketId: template.exit?.id ?? null,
    });
  }
  const extents = instances.length ? {
    minX: Math.min(...instances.map((instance) => instance.x)),
    minY: Math.min(...instances.map((instance) => instance.y)),
    maxX: Math.max(...instances.map((instance) => instance.x + instance.width)),
    maxY: Math.max(...instances.map((instance) => instance.y + instance.height)),
  } : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const routeDigest = canonicalSha256({ schemaVersion: LOOPLAB_WORLD_STREAM_PLAN_SCHEMA, programDigest: worldStreamDigest(program), instances, seams: seams.map((seam) => ({ id: seam.id, sourceInstanceId: seam.sourceInstanceId, targetInstanceId: seam.targetInstanceId, x: seam.x, y: seam.y, z: seam.z })) });
  return {
    schemaVersion: LOOPLAB_WORLD_STREAM_PLAN_SCHEMA,
    status: contradiction ? "contradiction" : instances.length ? "ready" : "empty",
    complete: !contradiction && instances.length === requestedCount,
    mapId: options.mapId ?? mapForInspection(project, options.mapId)?.id ?? null,
    mode: program.mode,
    axis: program.axis,
    seed: program.seed,
    requestedCount,
    routeDigest,
    extents: { ...extents, width: extents.maxX - extents.minX, height: extents.maxY - extents.minY },
    instances,
    seams,
    choices,
    contradiction,
  };
}

function assetIdsForMap(map = {}) {
  const ids = new Set();
  for (const entry of map.tileProgram?.palette ?? []) if (typeof entry?.assetId === "string" && entry.assetId) ids.add(entry.assetId);
  for (const object of map.objects ?? []) if (typeof object?.assetId === "string" && object.assetId) ids.add(object.assetId);
  return [...ids].sort(compareIds);
}

function decodedAssetBytes(project, assetIds) {
  const byId = new Map((project?.assets ?? []).map((asset) => [asset.id, asset]));
  let bytes = 0;
  const missing = [];
  for (const id of new Set(assetIds)) {
    const asset = byId.get(id);
    if (!asset) { missing.push(id); continue; }
    bytes += Math.max(0, Math.trunc(Number(asset.width || 0))) * Math.max(0, Math.trunc(Number(asset.height || 0))) * 4;
  }
  return { bytes, missing: missing.sort(compareIds) };
}

function nonEmptyNavigation(map) {
  return Boolean((map?.navigation?.nodes?.length ?? 0) || (map?.navigation?.links?.length ?? 0) || (map?.navigation?.areas?.length ?? 0));
}

function projectionIdentity(map = {}) {
  const projection = map.projection ?? { type: "orthographic" };
  return canonicalSha256({
    type: projection.type ?? "orthographic",
    tileWidth: projection.tileWidth ?? null,
    tileHeight: projection.tileHeight ?? null,
    worldUnitsPerTile: projection.worldUnitsPerTile ?? null,
    elevationStep: projection.elevationStep ?? null,
    originX: projection.originX ?? null,
    originY: projection.originY ?? null,
  });
}

export function inspectWorldStream(project = {}, input, options = {}) {
  const hostMap = mapForInspection(project, options.mapId);
  const value = input === undefined ? hostMap?.worldStream : input;
  const present = value !== undefined && value !== null;
  const issues = [];
  const add = (severity, code, message, detail = {}) => issues.push({ severity, code, message, ...detail });
  const report = {
    schemaVersion: LOOPLAB_WORLD_STREAM_REPORT_SCHEMA,
    present,
    valid: true,
    mapId: hostMap?.id ?? options.mapId ?? null,
    programDigest: null,
    templateCount: 0,
    plannedInstanceCount: 0,
    seamCount: 0,
    compatibleSeamCount: 0,
    residentWorstCase: null,
    requiredAssetIds: [],
    decodedRgbaBytes: 0,
    plan: null,
    issues,
    errors: [],
    warnings: [],
    policy: LOOPLAB_WORLD_STREAM_POLICY,
  };
  if (!present) return report;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    add("error", "world-stream-invalid", "worldStream must be an object.", { path: "worldStream" });
  } else {
    const unknown = unknownFields(value, PROGRAM_FIELDS);
    if (unknown.length) add("error", "world-stream-unknown-field", `worldStream contains unsupported fields: ${unknown.join(", ")}.`, { path: "worldStream" });
    if (value.schemaVersion !== LOOPLAB_WORLD_STREAM_SCHEMA) add("error", "world-stream-schema", `worldStream.schemaVersion must be ${LOOPLAB_WORLD_STREAM_SCHEMA}.`, { path: "worldStream.schemaVersion" });
    if (value.owner !== "authored-map") add("error", "world-stream-owner", "worldStream.owner must be authored-map.", { path: "worldStream.owner" });
    if (typeof value.enabled !== "boolean") add("error", "world-stream-enabled", "worldStream.enabled must be boolean.", { path: "worldStream.enabled" });
    if (!MODES.has(value.mode)) add("error", "world-stream-mode", "worldStream.mode must be finite or seeded.", { path: "worldStream.mode" });
    if (!AXES.has(value.axis)) add("error", "world-stream-axis", "worldStream.axis must be horizontal or vertical.", { path: "worldStream.axis" });
    if (typeof value.seed !== "string" || !value.seed || value.seed.length > LOOPLAB_WORLD_STREAM_LIMITS.maximumSeedLength) add("error", "world-stream-seed", `worldStream.seed must be a non-empty string no longer than ${LOOPLAB_WORLD_STREAM_LIMITS.maximumSeedLength} characters.`, { path: "worldStream.seed" });
    if (!stableId(value.startTemplateId)) add("error", "world-stream-start", "worldStream.startTemplateId must be a stable ID.", { path: "worldStream.startTemplateId" });
    if (!Number.isInteger(value.horizon) || value.horizon < 2 || value.horizon > LOOPLAB_WORLD_STREAM_LIMITS.maximumHorizon) add("error", "world-stream-horizon", `worldStream.horizon must be an integer from 2 through ${LOOPLAB_WORLD_STREAM_LIMITS.maximumHorizon}.`, { path: "worldStream.horizon" });

    const budgetUnknown = unknownFields(value.budgets, BUDGET_FIELDS);
    if (budgetUnknown.length) add("error", "world-stream-budget-field", `worldStream.budgets contains unsupported fields: ${budgetUnknown.join(", ")}.`, { path: "worldStream.budgets" });
    const budgetRules = [
      ["retainBehind", 0, LOOPLAB_WORLD_STREAM_LIMITS.maximumResidentChunks - 1],
      ["prefetchAhead", 0, LOOPLAB_WORLD_STREAM_LIMITS.maximumResidentChunks - 1],
      ["maxResidentChunks", 1, LOOPLAB_WORLD_STREAM_LIMITS.maximumResidentChunks],
      ["maxResidentTileCells", 1, LOOPLAB_WORLD_STREAM_LIMITS.maximumResidentTileCells],
      ["maxResidentCollisionCells", 1, LOOPLAB_WORLD_STREAM_LIMITS.maximumResidentCollisionCells],
      ["maxDecodedRgbaBytes", 1, LOOPLAB_WORLD_STREAM_LIMITS.maximumDecodedRgbaBytes],
    ];
    for (const [field, minimum, maximum] of budgetRules) if (!Number.isInteger(value.budgets?.[field]) || value.budgets[field] < minimum || value.budgets[field] > maximum) add("error", "world-stream-budget", `worldStream.budgets.${field} must be an integer from ${minimum} through ${maximum}.`, { path: `worldStream.budgets.${field}` });
    if (!finite(value.budgets?.cullPadding) || value.budgets.cullPadding < 0 || value.budgets.cullPadding > LOOPLAB_WORLD_STREAM_LIMITS.maximumCullPadding) add("error", "world-stream-cull-padding", `worldStream.budgets.cullPadding must be finite from 0 through ${LOOPLAB_WORLD_STREAM_LIMITS.maximumCullPadding}.`, { path: "worldStream.budgets.cullPadding" });
    if (Number.isInteger(value.budgets?.retainBehind) && Number.isInteger(value.budgets?.prefetchAhead) && Number.isInteger(value.budgets?.maxResidentChunks) && value.budgets.retainBehind + value.budgets.prefetchAhead + 1 > value.budgets.maxResidentChunks) add("error", "world-stream-resident-window", "retainBehind + prefetchAhead + the current chunk exceeds maxResidentChunks.", { path: "worldStream.budgets" });
    const toleranceUnknown = unknownFields(value.tolerances, TOLERANCE_FIELDS);
    if (toleranceUnknown.length) add("error", "world-stream-tolerance-field", `worldStream.tolerances contains unsupported fields: ${toleranceUnknown.join(", ")}.`, { path: "worldStream.tolerances" });
    for (const field of ["crossAxis", "z", "span"]) if (!finite(value.tolerances?.[field]) || value.tolerances[field] < 0 || value.tolerances[field] > 64) add("error", "world-stream-tolerance", `worldStream.tolerances.${field} must be finite from 0 through 64.`, { path: `worldStream.tolerances.${field}` });

    if (!Array.isArray(value.sequence)) add("error", "world-stream-sequence", "worldStream.sequence must be an array.", { path: "worldStream.sequence" });
    else {
      if (value.sequence.length > LOOPLAB_WORLD_STREAM_LIMITS.maximumFiniteSequence) add("error", "world-stream-sequence-limit", `worldStream.sequence cannot exceed ${LOOPLAB_WORLD_STREAM_LIMITS.maximumFiniteSequence} entries.`, { path: "worldStream.sequence" });
      value.sequence.forEach((id, index) => { if (!stableId(id)) add("error", "world-stream-sequence-id", `worldStream.sequence[${index}] must be a stable template ID.`, { path: `worldStream.sequence[${index}]` }); });
      if (value.mode === "finite" && value.sequence.length < 2) add("error", "world-stream-finite-sequence", "A finite world stream needs at least two authored sequence entries.", { path: "worldStream.sequence" });
      if (value.mode === "finite" && value.sequence[0] !== value.startTemplateId) add("error", "world-stream-sequence-start", "A finite world stream sequence must begin with startTemplateId.", { path: "worldStream.sequence[0]" });
    }

    if (!Array.isArray(value.templates)) add("error", "world-stream-templates", "worldStream.templates must be an array.", { path: "worldStream.templates" });
    else {
      report.templateCount = value.templates.length;
      if (value.templates.length < 2 || value.templates.length > LOOPLAB_WORLD_STREAM_LIMITS.maximumTemplates) add("error", "world-stream-template-count", `worldStream.templates must contain 2 through ${LOOPLAB_WORLD_STREAM_LIMITS.maximumTemplates} entries.`, { path: "worldStream.templates" });
      const ids = new Set();
      const maps = mapsForProject(project);
      const mapById = new Map(maps.map((map) => [map.id, map]));
      const startTemplate = value.templates.find((template) => template?.id === value.startTemplateId);
      const startMap = startTemplate ? mapById.get(startTemplate.mapId) : null;
      const expectedEntryEdge = value.axis === "vertical" ? "top" : "left";
      const expectedExitEdge = value.axis === "vertical" ? "bottom" : "right";
      for (const [index, template] of value.templates.entries()) {
        const path = `worldStream.templates[${index}]`;
        if (!template || typeof template !== "object" || Array.isArray(template)) { add("error", "world-stream-template-invalid", `${path} must be an object.`, { path }); continue; }
        const extra = unknownFields(template, TEMPLATE_FIELDS);
        if (extra.length) add("error", "world-stream-template-field", `${path} contains unsupported fields: ${extra.join(", ")}.`, { path, templateId: template.id });
        if (!stableId(template.id)) add("error", "world-stream-template-id", `${path}.id must be a stable ID.`, { path: `${path}.id` });
        else if (ids.has(template.id)) add("error", "world-stream-template-duplicate", `${path}.id duplicates ${template.id}.`, { path: `${path}.id`, templateId: template.id });
        else ids.add(template.id);
        if (typeof template.name !== "string" || !template.name.trim()) add("error", "world-stream-template-name", `${path}.name must be non-empty.`, { path: `${path}.name`, templateId: template.id });
        if (!stableId(template.mapId)) add("error", "world-stream-template-map-id", `${path}.mapId must be a stable map ID.`, { path: `${path}.mapId`, templateId: template.id });
        if (!finite(template.weight) || template.weight <= 0 || template.weight > 1_000_000) add("error", "world-stream-template-weight", `${path}.weight must be finite and greater than zero.`, { path: `${path}.weight`, templateId: template.id });
        const map = mapById.get(template.mapId);
        if (!map) add("error", "world-stream-template-map", `${path}.mapId references missing map ${template.mapId}.`, { path: `${path}.mapId`, templateId: template.id });
        const requireEntry = value.mode === "seeded" || template.id !== value.startTemplateId || value.sequence?.indexOf(template.id) > 0;
        const requireExit = value.mode === "seeded" || value.sequence?.slice(0, -1).includes(template.id);
        for (const [role, socket, expectedEdge] of [["entry", template.entry, expectedEntryEdge], ["exit", template.exit, expectedExitEdge]]) {
          const socketPath = `${path}.${role}`;
          if (!socket || typeof socket !== "object" || Array.isArray(socket)) {
            if (role === "entry" ? requireEntry : requireExit) add("error", "world-stream-socket-required", `${socketPath} is required by the route.`, { path: socketPath, templateId: template.id });
            continue;
          }
          const socketExtra = unknownFields(socket, SOCKET_FIELDS);
          if (socketExtra.length) add("error", "world-stream-socket-field", `${socketPath} contains unsupported fields: ${socketExtra.join(", ")}.`, { path: socketPath, templateId: template.id });
          if (!stableId(socket.id)) add("error", "world-stream-socket-id", `${socketPath}.id must be a stable ID.`, { path: `${socketPath}.id`, templateId: template.id });
          if (typeof socket.tag !== "string" || !socket.tag.trim() || socket.tag.length > 128) add("error", "world-stream-socket-tag", `${socketPath}.tag must be a non-empty bounded string.`, { path: `${socketPath}.tag`, templateId: template.id });
          if (!EDGES.has(socket.edge) || socket.edge !== expectedEdge) add("error", "world-stream-socket-edge", `${socketPath}.edge must be ${expectedEdge} for a ${value.axis} route.`, { path: `${socketPath}.edge`, templateId: template.id });
          for (const coordinate of ["x", "y", "z"]) if (!finite(socket[coordinate]) || Math.abs(socket[coordinate]) > LOOPLAB_WORLD_STREAM_LIMITS.maximumCoordinateMagnitude) add("error", "world-stream-socket-coordinate", `${socketPath}.${coordinate} must be finite and bounded.`, { path: `${socketPath}.${coordinate}`, templateId: template.id });
          if (!finite(socket.span) || socket.span <= 0 || socket.span > LOOPLAB_WORLD_STREAM_LIMITS.maximumSocketSpan) add("error", "world-stream-socket-span", `${socketPath}.span must be finite and greater than zero.`, { path: `${socketPath}.span`, templateId: template.id });
          if (map && finite(socket.x) && finite(socket.y)) {
            const edgeCoordinate = value.axis === "horizontal" ? socket.x : socket.y;
            const expectedCoordinate = role === "entry" ? 0 : Number(value.axis === "horizontal" ? map.width : map.height);
            if (Math.abs(edgeCoordinate - expectedCoordinate) > Number(value.tolerances?.crossAxis ?? 0.001)) add("error", "world-stream-socket-boundary", `${socketPath} must sit exactly on the authored ${expectedEdge} map boundary.`, { path: socketPath, templateId: template.id });
          }
        }
        if (map && startMap) {
          const crossSize = value.axis === "horizontal" ? Number(map.height) : Number(map.width);
          const startCrossSize = value.axis === "horizontal" ? Number(startMap.height) : Number(startMap.width);
          if (!finite(crossSize) || !finite(startCrossSize) || Math.abs(crossSize - startCrossSize) > Number(value.tolerances?.crossAxis ?? 0.001)) add("error", "world-stream-cross-size", `${path} must match the start chunk's cross-axis map size.`, { path: `${path}.mapId`, templateId: template.id });
          if ((map.controlMode ?? project.controlMode) !== (startMap.controlMode ?? project.controlMode)) add("error", "world-stream-control-mode", `${path} must use the same control mode as the start chunk.`, { path: `${path}.mapId`, templateId: template.id });
          if (Number(map.gravity ?? project.gravity) !== Number(startMap.gravity ?? project.gravity)) add("error", "world-stream-gravity", `${path} must use the same gravity as the start chunk.`, { path: `${path}.mapId`, templateId: template.id });
          if (projectionIdentity(map) !== projectionIdentity(startMap)) add("error", "world-stream-projection", `${path} must use the exact start-chunk 2D projection.`, { path: `${path}.mapId`, templateId: template.id });
          if ((map.background ?? project.background) !== (startMap.background ?? project.background)) add("warning", "world-stream-background", `${path} uses a different background; v1 retains the host background across the continuous route.`, { path: `${path}.mapId`, templateId: template.id });
        }
        if (map) {
          const tileReport = inspectTileProgram(project, map.tileProgram, { mapId: map.id, strict: options.strict === true });
          if (!tileReport.present) add(options.strict === true ? "error" : "warning", "world-stream-tile-program", `${path} needs an authored tile program for a visually complete streamed chunk.`, { path: `${path}.mapId`, templateId: template.id });
          else if (!tileReport.valid) add("error", "world-stream-tile-invalid", `${path} references an invalid tile program.`, { path: `${path}.mapId`, templateId: template.id });
          const playerCount = (map.objects ?? []).filter((object) => object?.kind === "player").length;
          if (template.id === value.startTemplateId ? playerCount !== 1 : playerCount !== 0) add("error", "world-stream-player-ownership", `${path} ${template.id === value.startTemplateId ? "must contain exactly one player" : "must not contain a player"}.`, { path: `${path}.mapId`, templateId: template.id });
          if ((map.objects ?? []).some((object) => object?.kind === "portal")) add("error", "world-stream-portal", `${path} cannot contain portal objects; chunk crossing is automatic and continuous.`, { path: `${path}.mapId`, templateId: template.id });
          if ((map.objects ?? []).some((object) => object?.motionBody)) add("error", "world-stream-motion-body", `${path} cannot contain motion bodies in v1 because per-instance deterministic body identity is not yet remapped.`, { path: `${path}.mapId`, templateId: template.id });
          if ((map.traversalPaths?.length ?? 0) > 0) add("error", "world-stream-traversal", `${path} cannot contain traversal paths in v1 because per-instance path identity is not yet remapped.`, { path: `${path}.mapId`, templateId: template.id });
          if ((map.elevationTransitions?.transitions?.length ?? 0) > 0) add("error", "world-stream-elevation", `${path} cannot contain elevation-transition programs in v1 because per-instance navigation/collision bindings are not yet remapped.`, { path: `${path}.mapId`, templateId: template.id });
          if (nonEmptyNavigation(map)) add("error", "world-stream-navigation", `${path} cannot contain authored navigation in v1 because stable per-instance node/link identities are not yet remapped.`, { path: `${path}.mapId`, templateId: template.id });
        }
      }
      for (const id of value.sequence ?? []) if (!ids.has(id)) add("error", "world-stream-sequence-reference", `worldStream.sequence references missing template ${id}.`, { path: "worldStream.sequence", templateId: id });
      if (!ids.has(value.startTemplateId)) add("error", "world-stream-start-reference", `worldStream.startTemplateId references missing template ${value.startTemplateId}.`, { path: "worldStream.startTemplateId" });
    }

    const normalized = normalizeWorldStream(value);
    report.programDigest = worldStreamDigest(normalized);
    const plan = planWorldStream(project, normalized, { mapId: hostMap?.id, count: normalized.mode === "finite" ? normalized.sequence.length : normalized.horizon });
    report.plan = plan;
    report.plannedInstanceCount = plan.instances.length;
    report.seamCount = plan.seams.length;
    report.compatibleSeamCount = plan.seams.filter((seam) => seam.compatibility.compatible).length;
    if (plan.contradiction) add("error", `world-stream-${plan.contradiction.code}`, plan.contradiction.message, { path: "worldStream", ordinal: plan.contradiction.ordinal });

    const maps = mapsForProject(project);
    const mapById = new Map(maps.map((map) => [map.id, map]));
    const runtimeByMapId = new Map();
    for (const template of normalized.templates) {
      const map = mapById.get(template.mapId);
      if (map && !runtimeByMapId.has(map.id)) runtimeByMapId.set(map.id, compileTileRuntimeProgram(map.tileProgram, map));
    }
    let worst = { chunks: 0, tileCells: 0, collisionCells: 0, decodedRgbaBytes: 0, assetIds: [], startOrdinal: 0, endOrdinal: -1 };
    for (let ordinal = 0; ordinal < plan.instances.length; ordinal += 1) {
      const start = Math.max(0, ordinal - normalized.budgets.retainBehind);
      const end = Math.min(plan.instances.length - 1, ordinal + normalized.budgets.prefetchAhead);
      const window = plan.instances.slice(start, end + 1);
      const assetIds = window.flatMap((instance) => assetIdsForMap(mapById.get(instance.mapId)));
      const decoded = decodedAssetBytes(project, assetIds);
      const tileCells = window.reduce((sum, instance) => {
        const runtime = runtimeByMapId.get(instance.mapId);
        return sum + Number(runtime?.counts?.visualEntries || 0);
      }, 0);
      const collisionCells = window.reduce((sum, instance) => sum + Number(runtimeByMapId.get(instance.mapId)?.counts?.collisionCells || 0), 0);
      const candidate = { chunks: window.length, tileCells, collisionCells, decodedRgbaBytes: decoded.bytes, assetIds: [...new Set(assetIds)].sort(compareIds), missingAssetIds: decoded.missing, startOrdinal: start, endOrdinal: end };
      const score = candidate.chunks + candidate.tileCells + candidate.collisionCells + candidate.decodedRgbaBytes;
      const worstScore = worst.chunks + worst.tileCells + worst.collisionCells + worst.decodedRgbaBytes;
      if (score > worstScore) worst = candidate;
    }
    report.residentWorstCase = worst;
    report.requiredAssetIds = [...new Set(normalized.templates.flatMap((template) => assetIdsForMap(mapById.get(template.mapId))))].sort(compareIds);
    report.decodedRgbaBytes = decodedAssetBytes(project, report.requiredAssetIds).bytes;
    if (worst.chunks > normalized.budgets.maxResidentChunks) add("error", "world-stream-chunk-budget", `Resident window needs ${worst.chunks} chunks but maxResidentChunks is ${normalized.budgets.maxResidentChunks}.`, { path: "worldStream.budgets.maxResidentChunks" });
    if (worst.tileCells > normalized.budgets.maxResidentTileCells) add("error", "world-stream-tile-budget", `Resident window needs ${worst.tileCells} visual tile cells but maxResidentTileCells is ${normalized.budgets.maxResidentTileCells}.`, { path: "worldStream.budgets.maxResidentTileCells" });
    if (worst.collisionCells > normalized.budgets.maxResidentCollisionCells) add("error", "world-stream-collision-budget", `Resident window needs ${worst.collisionCells} collision cells but maxResidentCollisionCells is ${normalized.budgets.maxResidentCollisionCells}.`, { path: "worldStream.budgets.maxResidentCollisionCells" });
    if (worst.decodedRgbaBytes > normalized.budgets.maxDecodedRgbaBytes) add("error", "world-stream-decoded-budget", `Resident window needs ${worst.decodedRgbaBytes} unique decoded RGBA bytes but maxDecodedRgbaBytes is ${normalized.budgets.maxDecodedRgbaBytes}.`, { path: "worldStream.budgets.maxDecodedRgbaBytes" });
    if (worst.missingAssetIds?.length) add("error", "world-stream-asset-missing", `Resident chunks reference missing assets: ${worst.missingAssetIds.join(", ")}.`, { path: "worldStream.templates" });
    if ((project.actorProgram?.actors?.some((actor) => normalized.templates.some((template) => template.mapId === actor.mapId)))) add("error", "world-stream-actor-program", "World-stream template maps cannot host actor-program actors in v1.", { path: "actorProgram.actors" });
    if ((project.combatProgram?.actors?.some((actor) => normalized.templates.some((template) => template.mapId === actor.mapId))) || (project.combatProgram?.emitters?.some((emitter) => normalized.templates.some((template) => template.mapId === emitter.mapId)))) add("error", "world-stream-combat-program", "World-stream template maps cannot host combat actors or emitters in v1.", { path: "combatProgram" });
    if (options.strict === true && normalized.enabled && plan.seams.length) add("warning", "world-stream-seam-evidence", `${plan.seams.length} authored seams still require captured first-draw and unique-pixel browser evidence for release judgment.`, { path: "worldStream" });
  }
  report.errors = issues.filter((finding) => finding.severity === "error").map((finding) => finding.message);
  report.warnings = issues.filter((finding) => finding.severity === "warning").map((finding) => finding.message);
  report.valid = report.errors.length === 0;
  return report;
}

export function suggestWorldStream(project = {}, options = {}) {
  const maps = mapsForProject(project);
  const host = mapForInspection(project, options.mapId);
  if (!host || maps.length < 2) return {
    schemaVersion: "looplab-world-stream-suggestion/v1",
    provider: "none",
    available: false,
    mapId: host?.id ?? options.mapId ?? null,
    program: null,
    report: null,
    reasons: ["At least two authored maps are required."],
    decisionBoundary: LOOPLAB_WORLD_STREAM_POLICY.judgmentBoundary,
  };
  const axis = options.axis === "vertical" ? "vertical" : "horizontal";
  const compatible = maps.filter((map) => (map.controlMode ?? project.controlMode) === (host.controlMode ?? project.controlMode)
    && Number(map.gravity ?? project.gravity) === Number(host.gravity ?? project.gravity)
    && projectionIdentity(map) === projectionIdentity(host)
    && Number(axis === "horizontal" ? map.height : map.width) === Number(axis === "horizontal" ? host.height : host.width));
  if (compatible.length < 2) return {
    schemaVersion: "looplab-world-stream-suggestion/v1",
    provider: "none",
    available: false,
    mapId: host.id,
    program: null,
    report: null,
    reasons: ["No second map matches the host control mode, gravity, projection, and cross-axis size."],
    decisionBoundary: LOOPLAB_WORLD_STREAM_POLICY.judgmentBoundary,
  };
  const cross = axis === "horizontal" ? Number(host.height || 0) / 2 : Number(host.width || 0) / 2;
  const templates = compatible.map((map, index) => ({
    id: `chunk-${map.id}`,
    name: `${map.name ?? map.id} chunk`,
    mapId: map.id,
    weight: 1,
    entry: {
      id: "entry",
      tag: String(options.tag ?? "route"),
      edge: axis === "horizontal" ? "left" : "top",
      x: axis === "horizontal" ? 0 : cross,
      y: axis === "horizontal" ? cross : 0,
      z: Number(options.z ?? 0),
      span: Number(options.span ?? Math.max(1, Number(host.grid ?? project.grid ?? 32) * 2)),
    },
    exit: {
      id: "exit",
      tag: String(options.tag ?? "route"),
      edge: axis === "horizontal" ? "right" : "bottom",
      x: axis === "horizontal" ? Number(map.width || 0) : cross,
      y: axis === "horizontal" ? cross : Number(map.height || 0),
      z: Number(options.z ?? 0),
      span: Number(options.span ?? Math.max(1, Number(host.grid ?? project.grid ?? 32) * 2)),
    },
    _order: index,
  }));
  const startTemplateId = `chunk-${host.id}`;
  const sequence = [startTemplateId, ...templates.filter((template) => template.id !== startTemplateId).map((template) => template.id)];
  const program = normalizeWorldStream({
    mode: options.mode === "seeded" ? "seeded" : "finite",
    axis,
    seed: String(options.seed ?? "looplab-world"),
    startTemplateId,
    horizon: Number(options.horizon ?? Math.max(2, sequence.length)),
    sequence,
    templates: templates.map((template) => {
      const copy = { ...template };
      delete copy._order;
      return copy;
    }),
    budgets: options.budgets,
    tolerances: options.tolerances,
  });
  return {
    schemaVersion: "looplab-world-stream-suggestion/v1",
    provider: "none",
    available: true,
    mapId: host.id,
    program,
    report: inspectWorldStream(project, program, { mapId: host.id }),
    instructions: "Review every map edge, socket span/Z, background continuity, static-object eligibility, residency budget, and captured seam before saving. The suggestion does not infer joins or collision from art.",
    decisionBoundary: LOOPLAB_WORLD_STREAM_POLICY.judgmentBoundary,
  };
}

export function compileWorldStreamRuntime(project = {}, hostMap = {}, compileTiles = compileTileRuntimeProgram) {
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const compare = (first, second) => String(first) < String(second) ? -1 : String(first) > String(second) ? 1 : 0;
  const source = hostMap?.worldStream;
  if (!source || source.enabled === false) return {
    schemaVersion: "looplab-world-stream-runtime/v1",
    present: false,
    hostMapId: hostMap?.id ?? null,
  };
  const program = copy(source);
  const maps = Array.isArray(project?.maps) && project.maps.length ? project.maps : [hostMap];
  const mapById = new Map(maps.map((map) => [map.id, map]));
  const templateById = new Map((program.templates ?? []).map((template) => [template.id, template]));
  const assetsById = new Map((project.assets ?? []).map((asset) => [asset.id, asset]));
  const tileCache = new Map();
  const plan = [];
  const choices = [];
  let contradiction = null;
  let currentOrdinal = 0;
  let currentWindowKey = "";
  let firstDrawAt = null;
  let activationSequence = 0;
  let lastDrawnTileCount = 0;
  let lastVisibleTileCount = 0;
  let readyAssetIds = [];

  const unitFor = (identity) => Number.parseInt(canonicalSha256(identity).slice("sha256:".length, "sha256:".length + 13), 16) / 0x1_0000_0000_0000;
  const socketCompatible = (sourceSocket, targetSocket) => {
    const horizontal = program.axis === "horizontal";
    const crossA = horizontal ? Number(sourceSocket?.y) : Number(sourceSocket?.x);
    const crossB = horizontal ? Number(targetSocket?.y) : Number(targetSocket?.x);
    return sourceSocket?.edge === (horizontal ? "right" : "bottom")
      && targetSocket?.edge === (horizontal ? "left" : "top")
      && sourceSocket?.tag === targetSocket?.tag
      && Math.abs(crossA - crossB) <= Number(program.tolerances?.crossAxis ?? 0.001)
      && Math.abs(Number(sourceSocket?.z) - Number(targetSocket?.z)) <= Number(program.tolerances?.z ?? 0.001)
      && Math.abs(Number(sourceSocket?.span) - Number(targetSocket?.span)) <= Number(program.tolerances?.span ?? 0.001);
  };
  const templateIdAt = (ordinal) => {
    if (program.mode === "finite") return program.sequence?.[ordinal] ?? null;
    if (ordinal === 0) return program.startTemplateId;
    const prior = templateById.get(plan[ordinal - 1]?.templateId);
    const candidates = [...templateById.values()].filter((template) => template.entry && template.exit && socketCompatible(prior?.exit, template.entry)).sort((first, second) => compare(first.id, second.id));
    const total = candidates.reduce((sum, template) => sum + Number(template.weight || 0), 0);
    const unit = unitFor({ seed: program.seed, ordinal, priorTemplateId: prior?.id ?? null, priorSocketId: prior?.exit?.id ?? null });
    let cursor = unit * total;
    let selected = total > 0 ? candidates.at(-1) : null;
    for (const candidate of candidates) {
      cursor -= Number(candidate.weight || 0);
      if (cursor < 0) { selected = candidate; break; }
    }
    choices.push({ ordinal, priorTemplateId: prior?.id ?? null, candidateIds: candidates.map((candidate) => candidate.id), unit, totalWeight: total, selectedTemplateId: selected?.id ?? null });
    return selected?.id ?? null;
  };
  const ensureThrough = (ordinal) => {
    const maximum = Math.min(Number(program.horizon || 2) - 1, Math.max(0, ordinal));
    while (!contradiction && plan.length <= maximum) {
      const nextOrdinal = plan.length;
      const templateId = templateIdAt(nextOrdinal);
      const template = templateById.get(templateId);
      const map = template ? mapById.get(template.mapId) : null;
      if (!template || !map) {
        contradiction = { ordinal: nextOrdinal, code: "missing-template", message: `Cannot resolve world-stream template at ordinal ${nextOrdinal}.` };
        break;
      }
      let x = 0;
      let y = 0;
      if (nextOrdinal > 0) {
        const prior = plan[nextOrdinal - 1];
        const priorTemplate = templateById.get(prior.templateId);
        if (!socketCompatible(priorTemplate?.exit, template.entry)) {
          contradiction = { ordinal: nextOrdinal, code: "incompatible-socket", message: `${priorTemplate?.id ?? "(missing)"} cannot join ${template.id}.` };
          break;
        }
        x = prior.x + Number(priorTemplate.exit.x) - Number(template.entry.x);
        y = prior.y + Number(priorTemplate.exit.y) - Number(template.entry.y);
      }
      plan.push({ id: `chunk-${String(nextOrdinal).padStart(6, "0")}-${template.id}`, ordinal: nextOrdinal, templateId: template.id, mapId: template.mapId, x, y, width: Number(map.width || 0), height: Number(map.height || 0) });
    }
  };
  ensureThrough(program.mode === "finite" ? Number(program.sequence?.length || 1) - 1 : Number(program.budgets?.prefetchAhead || 0));

  const runtimeForMap = (map) => {
    if (!tileCache.has(map.id)) tileCache.set(map.id, compileTiles(map.tileProgram, map));
    return tileCache.get(map.id);
  };
  const prefixFor = (instance, sourceId) => instance.ordinal === 0 ? String(sourceId) : `${instance.id}:${sourceId}`;
  const offsetObject = (object, instance) => {
    const next = copy(object);
    next.id = prefixFor(instance, object.id);
    next.sourceObjectId = object.id;
    next.worldChunkInstanceId = instance.id;
    next.worldChunkOrdinal = instance.ordinal;
    next.x = Number(object.x || 0) + instance.x;
    next.y = Number(object.y || 0) + instance.y;
    if (next.supportContact?.surfaceId) next.supportContact.surfaceId = prefixFor(instance, next.supportContact.surfaceId);
    if (next.targetId) next.targetId = prefixFor(instance, next.targetId);
    return next;
  };
  const offsetTileRuntime = (runtime, instance) => {
    const visualEntries = (runtime.visualEntries ?? []).map((entry) => ({
      ...copy(entry),
      id: prefixFor(instance, entry.id),
      mapId: hostMap.id,
      sourceMapId: instance.mapId,
      worldChunkInstanceId: instance.id,
      worldChunkOrdinal: instance.ordinal,
      worldX: Number(entry.worldX || 0) + instance.x,
      worldY: Number(entry.worldY || 0) + instance.y,
      depth: Number(entry.depth || 0) + (program.axis === "horizontal" ? instance.x : instance.y) / 1_000_000,
    }));
    const collisionObjects = (runtime.collisionObjects ?? []).map((object) => offsetObject(object, instance));
    return { visualEntries, collisionObjects };
  };
  const offsetCollisionGeometry = (geometry, instance) => {
    if (!geometry?.chains?.length) return [];
    return geometry.chains.map((chain) => ({
      ...copy(chain),
      id: prefixFor(instance, chain.id),
      points: (chain.points ?? []).map((point) => ({ ...copy(point), id: prefixFor(instance, point.id), x: Number(point.x || 0) + instance.x, y: Number(point.y || 0) + instance.y })),
    }));
  };
  const assetIdsFor = (map) => [...new Set([
    ...(map.tileProgram?.palette ?? []).map((entry) => entry?.assetId),
    ...(map.objects ?? []).map((object) => object?.assetId),
  ].filter((id) => typeof id === "string" && id))].sort(compare);
  const decodedBytes = (assetIds) => [...new Set(assetIds)].reduce((sum, id) => {
    const asset = assetsById.get(id);
    return sum + (asset ? Math.max(0, Math.trunc(Number(asset.width || 0))) * Math.max(0, Math.trunc(Number(asset.height || 0))) * 4 : 0);
  }, 0);
  const ordinalForPosition = (x, y) => {
    const coordinate = program.axis === "horizontal" ? Number(x) : Number(y);
    let match = plan.find((instance) => coordinate >= (program.axis === "horizontal" ? instance.x : instance.y) && coordinate < (program.axis === "horizontal" ? instance.x + instance.width : instance.y + instance.height));
    if (!match && program.mode === "seeded" && plan.length < Number(program.horizon || 2)) {
      const last = plan.at(-1);
      const lastEnd = last ? (program.axis === "horizontal" ? last.x + last.width : last.y + last.height) : 0;
      if (coordinate >= lastEnd) {
        ensureThrough(Math.min(Number(program.horizon || 2) - 1, plan.length + Number(program.budgets?.prefetchAhead || 0)));
        match = plan.find((instance) => coordinate >= (program.axis === "horizontal" ? instance.x : instance.y) && coordinate < (program.axis === "horizontal" ? instance.x + instance.width : instance.y + instance.height));
      }
    }
    return match?.ordinal ?? Math.max(0, Math.min(plan.length - 1, currentOrdinal));
  };
  const compose = (ordinal = currentOrdinal) => {
    currentOrdinal = Math.max(0, Math.min(Number(program.horizon || 2) - 1, Math.trunc(Number(ordinal || 0))));
    ensureThrough(Math.min(Number(program.horizon || 2) - 1, currentOrdinal + Number(program.budgets?.prefetchAhead || 0)));
    const start = Math.max(0, currentOrdinal - Number(program.budgets?.retainBehind || 0));
    const end = Math.min(plan.length - 1, currentOrdinal + Number(program.budgets?.prefetchAhead || 0));
    const resident = plan.slice(start, end + 1);
    const key = resident.map((instance) => instance.id).join("|");
    if (key !== currentWindowKey) { currentWindowKey = key; activationSequence += 1; firstDrawAt = null; }
    const objects = [];
    const visualEntries = [];
    const tileCollisionObjects = [];
    const collisionChains = [];
    const requiredAssetIds = [];
    let visualCells = 0;
    let collisionCells = 0;
    let unresolvedTerrainCells = 0;
    for (const instance of resident) {
      const map = mapById.get(instance.mapId);
      if (!map) continue;
      for (const object of map.objects ?? []) {
        if (object.kind === "portal") continue;
        if (object.kind === "player" && instance.ordinal !== 0) continue;
        objects.push(offsetObject(object, instance));
      }
      const runtime = runtimeForMap(map);
      const offset = offsetTileRuntime(runtime, instance);
      visualEntries.push(...offset.visualEntries);
      tileCollisionObjects.push(...offset.collisionObjects);
      collisionChains.push(...offsetCollisionGeometry(map.collisionGeometry, instance));
      visualCells += Number(runtime.counts?.visualEntries || 0);
      collisionCells += Number(runtime.counts?.collisionCells || 0);
      unresolvedTerrainCells += Number(runtime.counts?.unresolvedTerrainCells || 0);
      requiredAssetIds.push(...assetIdsFor(map));
    }
    visualEntries.sort((first, second) => Number(first.depth) - Number(second.depth) || compare(first.id, second.id));
    tileCollisionObjects.sort((first, second) => compare(first.id, second.id));
    collisionChains.sort((first, second) => compare(first.id, second.id));
    const uniqueAssets = [...new Set(requiredAssetIds)].sort(compare);
    const extents = plan.length ? {
      minX: Math.min(...plan.map((instance) => instance.x)),
      minY: Math.min(...plan.map((instance) => instance.y)),
      maxX: Math.max(...plan.map((instance) => instance.x + instance.width)),
      maxY: Math.max(...plan.map((instance) => instance.y + instance.height)),
    } : { minX: 0, minY: 0, maxX: Number(hostMap.width || 0), maxY: Number(hostMap.height || 0) };
    const budget = {
      chunks: { used: resident.length, limit: Number(program.budgets?.maxResidentChunks || 1), passed: resident.length <= Number(program.budgets?.maxResidentChunks || 1) },
      tileCells: { used: visualCells, limit: Number(program.budgets?.maxResidentTileCells || 1), passed: visualCells <= Number(program.budgets?.maxResidentTileCells || 1) },
      collisionCells: { used: collisionCells, limit: Number(program.budgets?.maxResidentCollisionCells || 1), passed: collisionCells <= Number(program.budgets?.maxResidentCollisionCells || 1) },
      decodedRgbaBytes: { used: decodedBytes(uniqueAssets), limit: Number(program.budgets?.maxDecodedRgbaBytes || 1), passed: decodedBytes(uniqueAssets) <= Number(program.budgets?.maxDecodedRgbaBytes || 1) },
    };
    return {
      objects,
      collisionGeometry: collisionChains.length ? { schemaVersion: "looplab-collision-geometry/v1", collisionOwner: "authored-map", chains: collisionChains } : null,
      tileRuntime: {
        schemaVersion: "looplab-tile-runtime/v1",
        present: visualEntries.length > 0 || tileCollisionObjects.length > 0,
        mapId: hostMap.id,
        worldStream: true,
        visualEntries,
        collisionObjects: tileCollisionObjects,
        counts: { visualEntries: visualEntries.length, collisionObjects: tileCollisionObjects.length, collisionCells, unresolvedTerrainCells },
      },
      state: {
        schemaVersion: "looplab-world-stream-runtime/v1",
        present: true,
        enabled: program.enabled !== false,
        hostMapId: hostMap.id,
        mode: program.mode,
        axis: program.axis,
        seed: program.seed,
        horizon: Number(program.horizon || 0),
        routeDigest: canonicalSha256({ schemaVersion: "looplab-world-stream-runtime-route/v1", program }),
        currentOrdinal,
        currentInstanceId: plan[currentOrdinal]?.id ?? null,
        currentTemplateId: plan[currentOrdinal]?.templateId ?? null,
        currentSourceMapId: plan[currentOrdinal]?.mapId ?? null,
        generatedInstanceCount: plan.length,
        residentInstanceIds: resident.map((instance) => instance.id),
        residentRange: { start, end },
        worldBounds: { ...extents, width: extents.maxX - extents.minX, height: extents.maxY - extents.minY },
        requiredAssetIds: uniqueAssets,
        readyAssetIds: [...readyAssetIds],
        assetsReady: uniqueAssets.every((id) => readyAssetIds.includes(id)),
        activationSequence,
        firstDrawAt,
        lastDrawnTileCount,
        lastVisibleTileCount,
        budget,
        budgetPassed: Object.values(budget).every((entry) => entry.passed),
        contradiction: contradiction ? copy(contradiction) : null,
        choices: copy(choices),
      },
    };
  };
  const markDraw = (observation = {}) => {
    readyAssetIds = [...new Set((observation.readyAssetIds ?? []).map(String))].sort(compare);
    lastDrawnTileCount = Math.max(0, Math.trunc(Number(observation.drawnTileCount || 0)));
    lastVisibleTileCount = Math.max(lastDrawnTileCount, Math.trunc(Number(observation.visibleTileCount ?? lastDrawnTileCount)));
    if (observation.completed !== false && !firstDrawAt) firstDrawAt = Number.isFinite(Number(observation.timestamp)) ? Number(observation.timestamp) : 0;
    return compose(currentOrdinal).state;
  };
  return {
    schemaVersion: "looplab-world-stream-runtime/v1",
    present: true,
    hostMapId: hostMap.id,
    program: copy(program),
    ensureThrough,
    ordinalForPosition,
    compose,
    markDraw,
    getPlan: () => ({ schemaVersion: "looplab-world-stream-plan/v1", status: contradiction ? "contradiction" : "ready", instances: copy(plan), choices: copy(choices), contradiction: contradiction ? copy(contradiction) : null }),
  };
}
