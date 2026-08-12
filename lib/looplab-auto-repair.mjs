import { collisionRectFor, visualRectFor } from "./looplab-support.mjs";

export const LOOPLAB_AUTO_REPAIR_SCHEMA = "looplab-auto-repair/v1";
export const LOOPLAB_CONVERGENCE_SCHEMA = "looplab-convergence/v1";
export const LOOPLAB_AUTO_REPAIR_LIMITS = Object.freeze({
  defaultRepairs: 16,
  maximumRepairs: 24,
  defaultPasses: 3,
  maximumPasses: 6,
  maximumResidue: 128,
});

const AUTOMATIC_CODES = new Set([
  "asset-collision-policy",
  "collision-owner",
  "culling-padding",
  "fresh-input-policy",
  "ground-anchor",
  "implicit-snap",
  "object-clipped-by-map",
  "object-outside-map",
  "projection-ratio",
  "projection-size",
  "projection-world-unit",
  "signature-density",
  "start-map-missing",
  "support-anchor",
  "support-gap",
  "support-height",
  "support-missing",
  "traversal-authority",
  "traversal-point-bounds",
]);

const JUDGMENT_REASONS = Object.freeze({
  "asset-ground-anchor": "Changing authored sprite contact pixels can shift animation registration and requires visual review.",
  "dead-space": "Adding or moving interactions changes pacing and level design.",
  "depth-slices": "Foreground/background slicing requires art-aware occlusion judgment.",
  "depth-tie": "Choosing a depth bias changes authored presentation order.",
  "duplicate-art": "Removing either visual may discard intentional composition.",
  "footprint-visual-mismatch": "Changing a gameplay footprint requires movement and collision judgment.",
  "hud-landmark-overlap": "Moving a landmark or HUD is a presentation decision.",
  "inside-building": "Resolving architectural overlap requires route and scene judgment.",
  "invisible-collision": "Shrinking collision can change gameplay reachability.",
  "map-route-gap": "Creating a map transition requires an authored destination, spawn, and route decision.",
  "map-unreachable": "Reachability repair requires choosing the intended campaign route.",
  "modular-gap": "Joining authored interaction geometry may change timing and traversal behavior.",
  "route-clearance": "Moving a prop or route changes level flow and requires playtest evidence.",
  "start-map-order": "Reordering the campaign changes the player-facing sequence.",
  "support-footprint": "Moving an object onto a support changes authored placement.",
  "support-surface-invalid": "Selecting a replacement solid surface is an authored geometry decision.",
  "support-surface-missing": "Selecting a replacement support is ambiguous.",
  "tile-seams": "Repairing pixels requires an art or tileset pipeline, not metadata mutation.",
  "traversal-entry-contract": "Entry speed, radius, and direction are gameplay tuning.",
  "traversal-points": "Inventing missing route points changes traversal design.",
  "traversal-transfer-target": "Choosing a replacement transfer path changes route semantics.",
});

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clone = (value) => structuredClone(value);

function mapsFor(project) {
  if (Array.isArray(project?.maps) && project.maps.length) return project.maps;
  return [{
    id: project?.activeMapId ?? "map-main",
    name: project?.name ?? "Main map",
    width: project?.width,
    height: project?.height,
    projection: project?.projection,
    controlMode: project?.controlMode,
    objects: project?.objects ?? [],
    traversalPaths: project?.traversalPaths ?? [],
  }];
}

function issueIdentity(issue) {
  return [issue?.code, issue?.mapId, issue?.objectId, issue?.assetId, issue?.featureId].map((value) => value ?? "").join("|");
}

function compactIssue(issue, reason) {
  return {
    severity: issue?.severity ?? "warning",
    code: issue?.code ?? "unknown",
    message: issue?.message ?? "Unknown Project Doctor finding",
    mapId: issue?.mapId ?? null,
    objectId: issue?.objectId ?? null,
    assetId: issue?.assetId ?? null,
    featureId: issue?.featureId ?? null,
    reason,
  };
}

function boundaryFor(object) {
  const visual = visualRectFor(object);
  const collider = collisionRectFor(object);
  const rects = collider ? [visual, collider] : [visual];
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function clampedObjectPosition(map, object) {
  const boundary = boundaryFor(object);
  const width = finite(map?.width);
  const height = finite(map?.height);
  if (!(width > 0 && height > 0) || boundary.width > width || boundary.height > height) return null;
  const nextLeft = Math.min(Math.max(boundary.x, 0), width - boundary.width);
  const nextTop = Math.min(Math.max(boundary.y, 0), height - boundary.height);
  const x = finite(object.x) + nextLeft - boundary.x;
  const y = finite(object.y) + nextTop - boundary.y;
  if (x === finite(object.x) && y === finite(object.y)) return null;
  return { x, y };
}

function exactProjection(map) {
  const source = map?.projection ?? {};
  return {
    ...clone(source),
    type: "dimetric-2:1",
    tileWidth: 128,
    tileHeight: 64,
    elevationStep: Number.isFinite(Number(source.elevationStep)) ? Number(source.elevationStep) : 32,
    originX: Number.isFinite(Number(source.originX)) ? Number(source.originX) : finite(map?.width, 960) / 2,
    originY: Number.isFinite(Number(source.originY)) ? Number(source.originY) : 96,
    worldUnitsPerTile: Number.isFinite(Number(source.worldUnitsPerTile)) && Number(source.worldUnitsPerTile) > 0 ? Number(source.worldUnitsPerTile) : 128,
  };
}

function residueReason(issue, requestedCodes) {
  if (requestedCodes && !requestedCodes.has(issue.code)) return "Excluded by the requested finding-code filter.";
  return JUDGMENT_REASONS[issue.code]
    ?? (AUTOMATIC_CODES.has(issue.code)
      ? "The finding matched a mechanical class, but current source did not provide a unique safe repair."
      : "No deterministic, local, behavior-preserving repair is registered for this finding.");
}

function normalizedOptions(options = {}) {
  const requestedCodes = Array.isArray(options.findingCodes) && options.findingCodes.length
    ? new Set(options.findingCodes.map((code) => String(code)))
    : null;
  const rawLimit = Number(options.maxRepairs ?? LOOPLAB_AUTO_REPAIR_LIMITS.defaultRepairs);
  return {
    requestedCodes,
    maxRepairs: Math.max(1, Math.min(LOOPLAB_AUTO_REPAIR_LIMITS.maximumRepairs, Number.isInteger(rawLimit) ? rawLimit : LOOPLAB_AUTO_REPAIR_LIMITS.defaultRepairs)),
  };
}

function selected(issue, requestedCodes) {
  return !requestedCodes || requestedCodes.has(issue.code);
}

export function buildMechanicalRepairPlan(project, doctor, options = {}) {
  const { requestedCodes, maxRepairs } = normalizedOptions(options);
  const maps = mapsFor(project);
  const mapById = new Map(maps.map((map) => [map.id, map]));
  const consumed = new Set();
  const targets = [];
  const addTarget = (target) => {
    if (targets.length >= maxRepairs) return false;
    targets.push(target);
    for (const issue of target.issues) consumed.add(issueIdentity(issue));
    return true;
  };

  const startIssue = (doctor?.issues ?? []).find((issue) => issue.code === "start-map-missing" && selected(issue, requestedCodes));
  if (startIssue && maps[0]?.id) addTarget({
    scope: "project",
    targetId: maps[0].id,
    issues: [startIssue],
    command: { op: "set_start_map", id: maps[0].id },
    summary: `Declare ${maps[0].id} as the explicit first map without changing the authored route order.`,
  });

  for (const asset of project?.assets ?? []) {
    const issues = (doctor?.issues ?? []).filter((issue) => issue.assetId === asset.id && issue.code === "asset-collision-policy" && selected(issue, requestedCodes));
    if (!issues.length || targets.length >= maxRepairs) continue;
    addTarget({
      scope: "asset",
      targetId: asset.id,
      issues,
      command: { op: "update_asset", id: asset.id, changes: { collisionPolicy: "authored-only" } },
      summary: `Restore authored-only collision authority for asset ${asset.id}.`,
    });
  }

  const mapTargets = new Map();
  const appendMapTarget = (mapId, target) => {
    if (targets.length >= maxRepairs) return false;
    const entries = mapTargets.get(mapId) ?? [];
    entries.push(target);
    mapTargets.set(mapId, entries);
    return addTarget(target);
  };

  for (const map of maps) {
    const projectionIssues = (doctor?.issues ?? []).filter((issue) => issue.mapId === map.id && ["projection-size", "projection-ratio", "projection-world-unit"].includes(issue.code) && selected(issue, requestedCodes));
    if (projectionIssues.length && map.projection?.type === "dimetric-2:1" && targets.length < maxRepairs) appendMapTarget(map.id, {
      scope: "map",
      mapId: map.id,
      targetId: map.id,
      issues: projectionIssues,
      command: { op: "set_map_projection", projection: exactProjection(map), preserveControlMode: true },
      summary: `Normalize ${map.id} to an exact 128×64 dimetric projection with positive world units.`,
    });

    const mapIssues = (doctor?.issues ?? []).filter((issue) => issue.mapId === map.id);
    const objectById = new Map((map.objects ?? []).map((object) => [object.id, object]));
    for (const object of map.objects ?? []) {
      if (targets.length >= maxRepairs) break;
      const issues = mapIssues.filter((issue) => issue.objectId === object.id && selected(issue, requestedCodes));
      const changes = {};
      const changeIssues = [];
      const boundaryIssue = issues.find((issue) => ["object-outside-map", "object-clipped-by-map"].includes(issue.code));
      if (boundaryIssue) {
        const position = clampedObjectPosition(map, object);
        if (position) {
          Object.assign(changes, position);
          changeIssues.push(...issues.filter((issue) => ["object-outside-map", "object-clipped-by-map"].includes(issue.code)));
        }
      }
      const collisionIssue = issues.find((issue) => issue.code === "collision-owner");
      if (collisionIssue) {
        changes.collisionOwner = "authored-map";
        changeIssues.push(collisionIssue);
      }
      const anchorIssue = issues.find((issue) => issue.code === "ground-anchor");
      if (anchorIssue) {
        changes.anchorMode = "ground";
        changeIssues.push(anchorIssue);
      }
      const cullingIssue = issues.find((issue) => issue.code === "culling-padding");
      if (cullingIssue) {
        changes.cullingPadding = Math.max(0, finite(object.visualBounds?.height, finite(object.height)) - finite(object.height));
        changeIssues.push(cullingIssue);
      }
      const densityIssue = issues.find((issue) => issue.code === "signature-density");
      if (densityIssue) {
        changes.density = "sparse";
        changeIssues.push(densityIssue);
      }
      const socketIssues = issues.filter((issue) => issue.code === "implicit-snap");
      const policyIssue = mapIssues.find((issue) => issue.code === "fresh-input-policy" && selected(issue, requestedCodes));
      if ((socketIssues.length || policyIssue) && Array.isArray(object.interactionSockets) && object.interactionSockets.some((socket) => socket.requiresFreshPress !== true)) {
        changes.interactionSockets = object.interactionSockets.map((socket) => ({ ...clone(socket), requiresFreshPress: true }));
        changeIssues.push(...socketIssues);
        if (policyIssue) changeIssues.push(policyIssue);
      }
      const uniqueChangeIssues = [...new Map(changeIssues.map((issue) => [issueIdentity(issue), issue])).values()];
      if (Object.keys(changes).length && uniqueChangeIssues.length && targets.length < maxRepairs) appendMapTarget(map.id, {
        scope: "object",
        mapId: map.id,
        targetId: object.id,
        issues: uniqueChangeIssues,
        command: { op: "update_object", id: object.id, changes },
        summary: `Restore deterministic placement or metadata invariants for object ${object.id}.`,
      });

      const supportIssues = issues.filter((issue) => ["support-missing", "support-anchor", "support-gap", "support-height"].includes(issue.code));
      if (supportIssues.length && targets.length < maxRepairs) appendMapTarget(map.id, {
        scope: "object-support",
        mapId: map.id,
        targetId: object.id,
        issues: supportIssues,
        command: {
          op: "attach_to_support",
          id: object.id,
          mode: object.supportContact?.mode === "surface" && object.supportContact?.surfaceId && objectById.has(object.supportContact.surfaceId) ? "surface" : "auto",
          ...(object.supportContact?.mode === "surface" && object.supportContact?.surfaceId && objectById.has(object.supportContact.surfaceId) ? { surfaceId: object.supportContact.surfaceId } : {}),
          offset: finite(object.supportContact?.offset),
          tolerance: Math.max(0, finite(object.supportContact?.tolerance, 2)),
        },
        summary: `Snap ${object.id} to its unique authored support or the map floor using its ground anchor.`,
      });
    }

    for (const path of map.traversalPaths ?? []) {
      if (targets.length >= maxRepairs) break;
      const issues = mapIssues.filter((issue) => issue.featureId === path.id && selected(issue, requestedCodes));
      const changes = {};
      const repairIssues = [];
      const authority = issues.find((issue) => issue.code === "traversal-authority");
      if (authority) {
        changes.collisionOwner = "authored-map";
        repairIssues.push(authority);
      }
      const bounds = issues.find((issue) => issue.code === "traversal-point-bounds");
      if (bounds && Array.isArray(path.points) && path.points.length >= 2 && path.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
        changes.points = path.points.map((point) => ({
          ...clone(point),
          x: Math.min(Math.max(point.x, 0), finite(map.width)),
          y: Math.min(Math.max(point.y, 0), finite(map.height)),
        }));
        repairIssues.push(bounds);
      }
      if (Object.keys(changes).length && repairIssues.length) appendMapTarget(map.id, {
        scope: "traversal-path",
        mapId: map.id,
        targetId: path.id,
        issues: repairIssues,
        command: { op: "update_traversal_path", id: path.id, changes },
        summary: `Restore authored traversal authority or clamp existing control points for ${path.id}.`,
      });
    }
  }

  const commands = [];
  const directTargets = targets.filter((target) => !target.mapId);
  commands.push(...directTargets.map((target) => clone(target.command)));
  let activeMapId = project?.activeMapId ?? maps[0]?.id ?? null;
  const originalActiveMapId = activeMapId;
  for (const map of maps) {
    const entries = (mapTargets.get(map.id) ?? []).filter((entry) => targets.includes(entry));
    if (!entries.length) continue;
    if (maps.length > 1 && activeMapId !== map.id) {
      commands.push({ op: "switch_map", id: map.id });
      activeMapId = map.id;
    }
    commands.push(...entries.map((entry) => clone(entry.command)));
  }
  if (maps.length > 1 && originalActiveMapId && activeMapId !== originalActiveMapId && mapById.has(originalActiveMapId)) commands.push({ op: "switch_map", id: originalActiveMapId });

  const repairs = targets.map((target, index) => ({
    index,
    scope: target.scope,
    mapId: target.mapId ?? null,
    targetId: target.targetId,
    findingCodes: [...new Set(target.issues.map((issue) => issue.code))],
    findingCount: target.issues.length,
    summary: target.summary,
    command: clone(target.command),
  }));
  const residue = [];
  for (const issue of doctor?.issues ?? []) {
    if (consumed.has(issueIdentity(issue))) continue;
    residue.push(compactIssue(issue, residueReason(issue, requestedCodes)));
    if (residue.length >= LOOPLAB_AUTO_REPAIR_LIMITS.maximumResidue) break;
  }
  const omittedResidueCount = Math.max(0, (doctor?.issues?.length ?? 0) - consumed.size - residue.length);

  return {
    schemaVersion: LOOPLAB_AUTO_REPAIR_SCHEMA,
    commands,
    repairs,
    residue,
    omittedResidueCount,
    selectedFindingCodes: requestedCodes ? [...requestedCodes].sort() : null,
    limits: { maxRepairs, repairLimitReached: targets.length >= maxRepairs },
    sourceIssueCount: doctor?.issues?.length ?? 0,
    consumedFindingCount: consumed.size,
    safeRepairCount: repairs.length,
    commandCount: commands.length,
  };
}
