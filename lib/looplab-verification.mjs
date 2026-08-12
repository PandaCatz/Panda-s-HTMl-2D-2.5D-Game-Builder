import { createRuntimeModel } from "./looplab-runtime-instance.mjs";
import { runReplaySuite } from "./looplab-replay.mjs";
import { buildRuntimeJoinPlan } from "./looplab-runtime-join.mjs";

export const VERIFICATION_EVIDENCE_VERSION = 2;

const EVIDENCE_TYPES = new Set(["playtest", "screenshot", "responsive", "replay", "runtime-join", "automated-test"]);
const BEHAVIOR_EVIDENCE_TYPES = new Set(["playtest", "replay", "automated-test"]);
const PROFILE_SIMULATIONS = new Set(["in-app-device-profile", "headless-browser-profile"]);

const finitePositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const finiteRatio = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1;

const uniqueStrings = (values) => [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];

export function verificationCoverageRequirements(project) {
  const mapIds = uniqueStrings(routeMaps(project).map((map) => map?.id));
  const configuredProfiles = Array.isArray(project?.deviceProfiles) ? project.deviceProfiles : [];
  const profileIds = uniqueStrings(configuredProfiles.map((profile) => profile?.id));
  const requiredProfileIds = profileIds.length ? profileIds : ["desktop"];
  const requiredJoinIds = uniqueStrings(buildRuntimeJoinPlan(project).joins.map((join) => join.portalId));
  return {
    requiredMapIds: mapIds,
    requiredProfileIds,
    requiredJoinIds,
    requireResponsiveCoverage: true,
    requiredCaptureCount: mapIds.length * requiredProfileIds.length,
    requiredJoinCaptureCount: requiredJoinIds.length * requiredProfileIds.length,
  };
}

function evidenceError(errors, index, message) {
  errors.push(`evidenceRefs[${index}] ${message}`);
}

/**
 * @param {unknown} evidenceRefs
 * @param {{ sourceDigest?: string, requireScreenshot?: boolean, requiredMapIds?: string[], requiredProfileIds?: string[], requiredJoinIds?: string[], requireResponsiveCoverage?: boolean }} [options]
 */
export function validateVerificationEvidence(evidenceRefs, {
  sourceDigest,
  requireScreenshot = true,
  requiredMapIds = [],
  requiredProfileIds = [],
  requiredJoinIds = [],
  requireResponsiveCoverage = false,
} = {}) {
  const errors = [];
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) {
    return { valid: false, errors: ["Verification requires non-empty playtest and screenshot evidence."], evidenceRefs: [] };
  }

  let hasBehaviorEvidence = false;
  let hasScreenshotEvidence = false;
  const screenshotPairs = new Set();
  const responsiveProfiles = new Set();
  const runtimeJoinPairs = new Set();
  const strictVisualReceipts = requiredMapIds.length > 0 || requiredProfileIds.length > 0;
  for (const [index, evidence] of evidenceRefs.entries()) {
    const evidenceErrorCount = errors.length;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
      evidenceError(errors, index, "must be a structured, source-bound evidence object; legacy strings must be recollected.");
      continue;
    }
    if (!EVIDENCE_TYPES.has(evidence.type)) evidenceError(errors, index, `has unsupported type ${String(evidence.type)}.`);
    if (typeof evidence.id !== "string" || !evidence.id.trim()) evidenceError(errors, index, "requires a non-empty id.");
    if (evidence.status !== "passed") evidenceError(errors, index, "must have status \"passed\".");
    if (typeof evidence.sourceDigest !== "string" || !evidence.sourceDigest) evidenceError(errors, index, "requires sourceDigest.");
    else if (sourceDigest && evidence.sourceDigest !== sourceDigest) evidenceError(errors, index, `targets stale source ${evidence.sourceDigest}; expected ${sourceDigest}.`);
    if (typeof evidence.createdAt !== "string" || !Number.isFinite(Date.parse(evidence.createdAt))) evidenceError(errors, index, "requires an ISO createdAt timestamp.");

    if (BEHAVIOR_EVIDENCE_TYPES.has(evidence.type)) {
      hasBehaviorEvidence = true;
      if (!Array.isArray(evidence.checks) || evidence.checks.length === 0) evidenceError(errors, index, "requires at least one recorded behavior check.");
      else {
        for (const [checkIndex, check] of evidence.checks.entries()) {
          if (!check || typeof check !== "object" || Array.isArray(check) || typeof check.id !== "string" || !check.id || check.status !== "passed") {
            evidenceError(errors, index, `contains an invalid or non-passing check at checks[${checkIndex}].`);
          }
        }
      }
    }

    if (evidence.type === "screenshot") {
      hasScreenshotEvidence = true;
      if (!/^sha256:[a-f0-9]{64}$/i.test(String(evidence.sha256 ?? ""))) evidenceError(errors, index, "requires a SHA-256 pixel receipt.");
      if (!finitePositive(evidence.width) || !finitePositive(evidence.height)) evidenceError(errors, index, "requires positive canvas width and height.");
      if (!evidence.viewport || typeof evidence.viewport !== "object" || !finitePositive(evidence.viewport.width) || !finitePositive(evidence.viewport.height)) {
        evidenceError(errors, index, "requires the browser viewport dimensions used for the capture.");
      }
      if (strictVisualReceipts || Number(evidence.version) >= 2) {
        if (typeof evidence.mapId !== "string" || !evidence.mapId.trim()) evidenceError(errors, index, "requires mapId for visual coverage.");
        if (typeof evidence.profileId !== "string" || !evidence.profileId.trim()) evidenceError(errors, index, "requires profileId for visual coverage.");
        if (!evidence.targetViewport || typeof evidence.targetViewport !== "object" || !finitePositive(evidence.targetViewport.width) || !finitePositive(evidence.targetViewport.height)) {
          evidenceError(errors, index, "requires the configured targetViewport dimensions.");
        }
        if (!evidence.renderedBounds || typeof evidence.renderedBounds !== "object" || !finitePositive(evidence.renderedBounds.width) || !finitePositive(evidence.renderedBounds.height)) {
          evidenceError(errors, index, "requires positive renderedBounds.");
        }
        if (evidence.cleanPlay !== true) evidenceError(errors, index, "must prove clean play mode rather than an editor canvas.");
        if (evidence.editorOverlays !== false) evidenceError(errors, index, "must prove editor overlays were disabled.");
        if (!PROFILE_SIMULATIONS.has(evidence.profileSimulation)) evidenceError(errors, index, "must identify a trusted in-app or headless browser device-profile simulation.");
        if (Object.prototype.hasOwnProperty.call(evidence, "contentStats")) {
          const stats = evidence.contentStats;
          if (!stats || typeof stats !== "object" || Array.isArray(stats)) evidenceError(errors, index, "requires structured contentStats when visual-content analysis is supplied.");
          else {
            if (!Number.isInteger(Number(stats.distinctQuantizedColorCount)) || Number(stats.distinctQuantizedColorCount) < 4) evidenceError(errors, index, "contains fewer than four distinct quantized colors and is treated as a flat frame.");
            if (!Number.isFinite(Number(stats.luminanceMean)) || Number(stats.luminanceMean) < 0 || Number(stats.luminanceMean) > 255) evidenceError(errors, index, "requires a finite luminanceMean from 0 through 255.");
            if (!Number.isFinite(Number(stats.luminanceStdDev)) || Number(stats.luminanceStdDev) < 1) evidenceError(errors, index, "requires luminanceStdDev of at least 1 to reject blank or flat frames.");
            if (!finiteRatio(stats.opaquePixelRatio)) evidenceError(errors, index, "requires opaquePixelRatio from 0 through 1.");
            if (stats.flatFrame !== false) evidenceError(errors, index, "must explicitly prove that the captured canvas was not a flat frame.");
          }
        }
      }
      if (errors.length === evidenceErrorCount && typeof evidence.mapId === "string" && typeof evidence.profileId === "string") {
        screenshotPairs.add(`${evidence.mapId}\u0000${evidence.profileId}`);
      }
    }

    if (evidence.type === "responsive") {
      if (typeof evidence.profileId !== "string" || !evidence.profileId.trim()) evidenceError(errors, index, "requires profileId for responsive coverage.");
      if (!evidence.targetViewport || typeof evidence.targetViewport !== "object" || !finitePositive(evidence.targetViewport.width) || !finitePositive(evidence.targetViewport.height)) {
        evidenceError(errors, index, "requires the configured targetViewport dimensions.");
      }
      if (!evidence.viewport || typeof evidence.viewport !== "object" || !finitePositive(evidence.viewport.width) || !finitePositive(evidence.viewport.height)) {
        evidenceError(errors, index, "requires the actual browser viewport dimensions.");
      }
      if (!PROFILE_SIMULATIONS.has(evidence.profileSimulation)) evidenceError(errors, index, "must identify a trusted in-app or headless browser device-profile simulation.");
      if (!Array.isArray(evidence.checks) || evidence.checks.length === 0) evidenceError(errors, index, "requires at least one responsive layout check.");
      else {
        for (const [checkIndex, check] of evidence.checks.entries()) {
          if (!check || typeof check !== "object" || Array.isArray(check) || typeof check.id !== "string" || !check.id || check.status !== "passed") {
            evidenceError(errors, index, `contains an invalid or non-passing responsive check at checks[${checkIndex}].`);
          }
        }
      }
      if (errors.length === evidenceErrorCount && typeof evidence.profileId === "string") responsiveProfiles.add(evidence.profileId);
    }

    if (evidence.type === "runtime-join") {
      for (const field of ["portalId", "sourceMapId", "targetMapId", "targetSpawnId", "profileId"]) if (typeof evidence[field] !== "string" || !evidence[field].trim()) evidenceError(errors, index, `requires ${field}.`);
      for (const field of ["sourceSha256", "targetSha256"]) if (!/^sha256:[a-f0-9]{64}$/i.test(String(evidence[field] ?? ""))) evidenceError(errors, index, `requires a ${field} pixel receipt.`);
      if (evidence.actualVisibleJoin !== true) evidenceError(errors, index, "must inspect the actual visible runtime join.");
      if (evidence.playerExcluded !== true) evidenceError(errors, index, "must exclude transient player pixels from environment comparison.");
      if (evidence.nextUniqueContentInspected !== true) evidenceError(errors, index, "must inspect content after the declared overlap rather than accepting copied-overlap equality.");
      if (!evidence.metrics || typeof evidence.metrics !== "object" || !finiteRatio(evidence.metrics.changedPixelRatio) || !finiteRatio(evidence.metrics.targetUniquePixelRatio) || !finiteRatio(evidence.metrics.boundaryColorDelta)) evidenceError(errors, index, "requires runtime-join pixel ratios from 0 through 1.");
      if (!Array.isArray(evidence.checks) || evidence.checks.length === 0) evidenceError(errors, index, "requires runtime-join checks.");
      else for (const [checkIndex, check] of evidence.checks.entries()) if (!check || typeof check !== "object" || typeof check.id !== "string" || !check.id || check.status !== "passed") evidenceError(errors, index, `contains an invalid or non-passing join check at checks[${checkIndex}].`);
      if (errors.length === evidenceErrorCount && typeof evidence.portalId === "string" && typeof evidence.profileId === "string") runtimeJoinPairs.add(`${evidence.portalId}\u0000${evidence.profileId}`);
    }
  }

  if (!hasBehaviorEvidence) errors.push("Verification requires passed gameplay, replay, or automated-test evidence.");
  if (requireScreenshot && !hasScreenshotEvidence) errors.push("Verification requires a hashed canvas screenshot for visual evidence.");
  const mapIds = uniqueStrings(requiredMapIds);
  const profileIds = uniqueStrings(requiredProfileIds);
  if (mapIds.length && profileIds.length) {
    const requiredPairs = mapIds.flatMap((mapId) => profileIds.map((profileId) => `${mapId}\u0000${profileId}`));
    const missingPairs = requiredPairs.filter((pair) => !screenshotPairs.has(pair));
    if (missingPairs.length) {
      const examples = missingPairs.slice(0, 4).map((pair) => pair.replace("\u0000", " × ")).join(", ");
      errors.push(`Visual capture matrix covers ${requiredPairs.length - missingPairs.length}/${requiredPairs.length} required map/profile pairs; missing ${examples}${missingPairs.length > 4 ? ` and ${missingPairs.length - 4} more` : ""}.`);
    }
  }
  if (requireResponsiveCoverage && profileIds.length) {
    const missingProfiles = profileIds.filter((profileId) => !responsiveProfiles.has(profileId));
    if (missingProfiles.length) errors.push(`Responsive layout coverage is ${profileIds.length - missingProfiles.length}/${profileIds.length} profiles; missing ${missingProfiles.join(", ")}.`);
  }
  const joinIds = uniqueStrings(requiredJoinIds);
  if (joinIds.length && profileIds.length) {
    const requiredPairs = joinIds.flatMap((joinId) => profileIds.map((profileId) => `${joinId}\u0000${profileId}`));
    const missingPairs = requiredPairs.filter((pair) => !runtimeJoinPairs.has(pair));
    if (missingPairs.length) {
      const examples = missingPairs.slice(0, 4).map((pair) => pair.replace("\u0000", " × ")).join(", ");
      errors.push(`Runtime-join coverage is ${requiredPairs.length - missingPairs.length}/${requiredPairs.length} required portal/profile pairs; missing ${examples}${missingPairs.length > 4 ? ` and ${missingPairs.length - 4} more` : ""}.`);
    }
  }
  return { valid: errors.length === 0, errors, evidenceRefs };
}

function pushCheck(checks, id, passed, detail) {
  checks.push({ id, status: passed ? "passed" : "failed", detail });
}

function routeMaps(project) {
  if (Array.isArray(project.maps) && project.maps.length) return project.maps;
  return [{
    id: project.activeMapId ?? "main",
    name: "Main map",
    width: project.width,
    height: project.height,
    background: project.background,
    gravity: project.gravity,
    grid: project.grid,
    controlMode: project.controlMode,
    objects: project.objects ?? [],
  }];
}

function matchPortalHeight(player, portal) {
  const z = Number(portal.supportZ ?? portal.z ?? 0);
  const height = Number(player.collisionHeight ?? 1);
  player.z = z;
  player.supportZ = z;
  if (player.collider) {
    player.collider.zMin = z;
    player.collider.zMax = z + height;
  }
}

export function runDeterministicPlaytest(project) {
  const checks = [];
  const maps = routeMaps(project);
  const engine = createRuntimeModel(project);
  engine.drainEvents();
  const expectedStart = maps.some((map) => map.id === project.startMapId) ? project.startMapId : maps[0]?.id;
  pushCheck(checks, "start-map", engine.getState().activeMapId === expectedStart, `Expected ${expectedStart}; opened ${engine.getState().activeMapId}.`);

  for (const map of maps) {
    const loaded = engine.loadMap(map.id, null);
    engine.drainEvents();
    pushCheck(checks, `map-load:${map.id}`, loaded && engine.getState().activeMapId === map.id, loaded ? `Loaded ${map.name ?? map.id}.` : `Could not load ${map.id}.`);
    if (!loaded) continue;
    const objects = engine.getObjects();
    const player = objects.find((object) => object.kind === "player");
    pushCheck(checks, `player-present:${map.id}`, Boolean(player), player ? `Player ${player.id} is controllable.` : "No player exists on this map.");
    const entries = engine.renderEntries();
    const sorted = entries.every((entry, index) => index === 0 || entries[index - 1].depth <= entry.depth);
    pushCheck(checks, `depth-order:${map.id}`, sorted, `${entries.length} render entries evaluated.`);
    if (!player) continue;
    const beforeX = Number(player.x);
    engine.setInput("right", true);
    engine.update(1 / 60);
    engine.setInput("right", false);
    const movedPlayer = engine.getObjects().find((object) => object.kind === "player");
    const inputApplied = Boolean(movedPlayer) && Number.isFinite(movedPlayer.vx) && movedPlayer.vx > 0 && Number(movedPlayer.x) >= beforeX;
    pushCheck(checks, `movement:${map.id}`, inputApplied, movedPlayer ? `Right input produced vx=${movedPlayer.vx}.` : "Player disappeared during movement.");
  }

  let transitionCount = 0;
  for (const map of maps) {
    for (const portal of (map.objects ?? []).filter((object) => object.kind === "portal")) {
      const targetMap = maps.find((candidate) => candidate.id === portal.targetMapId);
      const targetSpawn = targetMap?.objects?.find((object) => object.kind === "spawn" && object.id === portal.targetSpawnId);
      if (!engine.loadMap(map.id, null)) {
        pushCheck(checks, `portal:${portal.id}`, false, `Source map ${map.id} could not load.`);
        continue;
      }
      engine.drainEvents();
      const player = engine.getObjects().find((object) => object.kind === "player");
      if (!player || !targetMap || !targetSpawn) {
        pushCheck(checks, `portal:${portal.id}`, false, "Portal, destination map, exact spawn, or player is missing.");
        continue;
      }
      player.x = Number(portal.x) + Math.max(0, (Number(portal.width) - Number(player.width)) / 2);
      player.y = Number(portal.y) + Math.max(0, (Number(portal.height) - Number(player.height)) / 2);
      matchPortalHeight(player, portal);
      engine.setInput("interact", true);
      const transitionEvents = engine.update(0.0001);
      const transitioned = engine.getState().activeMapId === targetMap.id && transitionEvents.some((event) => event.type === "portal.entered" && event.objectId === portal.id);
      const destinationPlayer = engine.getObjects().find((object) => object.kind === "player");
      const expectedX = destinationPlayer ? Number(targetSpawn.x) + (Number(targetSpawn.width) - Number(destinationPlayer.width)) / 2 : NaN;
      const expectedY = destinationPlayer ? Number(targetSpawn.y) + Number(targetSpawn.height) - Number(destinationPlayer.height) : NaN;
      const exactSpawn = Boolean(destinationPlayer) && Math.abs(Number(destinationPlayer.x) - expectedX) < 0.001 && Math.abs(Number(destinationPlayer.y) - expectedY) < 0.001;
      pushCheck(checks, `portal:${portal.id}`, transitioned && exactSpawn, transitioned ? `Entered ${targetMap.id} at exact spawn ${targetSpawn.id}.` : `Portal did not enter ${targetMap.id}.`);
      if (transitioned && exactSpawn) transitionCount += 1;

      const heldEvents = [];
      for (let step = 0; step < 10; step += 1) heldEvents.push(...engine.update(0.05));
      const bounced = heldEvents.some((event) => event.type === "portal.entered");
      pushCheck(checks, `portal-fresh-press:${portal.id}`, !bounced, bounced ? "Held interaction entered another portal." : "Held interaction did not bounce between maps.");
      engine.setInput("interact", false);
      engine.update(0);
    }
  }

  const failures = checks.filter((check) => check.status !== "passed");
  return {
    passed: failures.length === 0,
    checks,
    failures,
    mapCount: maps.length,
    transitionCount,
    startMapId: expectedStart,
  };
}

/**
 * @param {any} project
 * @param {{ sourceDigest?: string, createdAt?: string, runner?: string }} [options]
 */
export function createRuntimePlaytestEvidence(project, { sourceDigest, createdAt = new Date().toISOString(), runner = "looplab-runtime-model" } = {}) {
  if (typeof sourceDigest !== "string" || !sourceDigest) throw new Error("Runtime evidence requires the current Project Doctor sourceDigest.");
  const playtest = runDeterministicPlaytest(project);
  if (!playtest.passed) throw new Error(`Deterministic playtest failed: ${playtest.failures.map((check) => check.id).join(", ")}`);
  return {
    version: VERIFICATION_EVIDENCE_VERSION,
    type: "playtest",
    id: `runtime:${sourceDigest}`,
    status: "passed",
    sourceDigest,
    createdAt,
    runner,
    checks: playtest.checks,
    mapCount: playtest.mapCount,
    transitionCount: playtest.transitionCount,
  };
}

/**
 * @param {any} project
 * @param {{ sourceDigest?: string, createdAt?: string, runner?: string }} [options]
 */
export function createReplayEvidence(project, { sourceDigest, createdAt = new Date().toISOString(), runner = "looplab-replay-runner" } = {}) {
  if (typeof sourceDigest !== "string" || !sourceDigest) throw new Error("Replay evidence requires the current Project Doctor sourceDigest.");
  const replay = runReplaySuite(project);
  if (replay.caseCount === 0) return null;
  if (!replay.passed) throw new Error(`Deterministic replay failed${replay.firstDivergence ? ` at ${replay.firstDivergence.caseId} tick ${replay.firstDivergence.tick}` : ` with status ${replay.status}`}.`);
  return {
    version: VERIFICATION_EVIDENCE_VERSION,
    type: "replay",
    id: `replay:${sourceDigest}`,
    status: "passed",
    sourceDigest,
    createdAt,
    runner,
    checks: replay.cases.map((result) => ({ id: result.caseId, status: "passed", detail: `${result.tickCount} ticks · revision ${result.revision} · ${result.finalHash}` })),
    caseCount: replay.caseCount,
    tickCount: replay.cases.reduce((total, result) => total + result.tickCount, 0),
    cases: replay.cases.map((result) => ({ id: result.caseId, revision: result.revision, tickCount: result.tickCount, finalHash: result.finalHash })),
  };
}
