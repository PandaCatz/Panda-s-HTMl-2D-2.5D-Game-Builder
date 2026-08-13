export function createRuntimeModel(project) {
  function compareStableIds(first, second) {
    const firstId = String(first);
    const secondId = String(second);
    return firstId < secondId ? -1 : firstId > secondId ? 1 : 0;
  }

  const runtimeDependencies = arguments[1] && typeof arguments[1] === "object" ? arguments[1] : {};
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const compileTileRuntimeProgram = typeof runtimeDependencies.compileTileRuntimeProgram === "function"
    ? runtimeDependencies.compileTileRuntimeProgram
    : (_program, map = {}) => ({
        schemaVersion: "looplab-tile-runtime/v1",
        present: false,
        mapId: map?.id ?? null,
        visualEntries: [],
        collisionObjects: [],
        counts: { visualEntries: 0, collisionObjects: 0, collisionCells: 0, unresolvedTerrainCells: 0 },
      });
  const compileWorldStreamRuntime = typeof runtimeDependencies.compileWorldStreamRuntime === "function"
    ? runtimeDependencies.compileWorldStreamRuntime
    : (_project, map = {}) => ({
        schemaVersion: "looplab-world-stream-runtime/v1",
        present: false,
        hostMapId: map?.id ?? null,
      });
  const runtimeObjectChangeKeys = new Set([
    "hidden", "solid", "color", "opacity", "runtimeState", "active", "conducted", "cooldownTicks", "durationTicks", "elapsedTicks", "enabled", "energy", "health", "hp", "locked", "maxHp", "mode", "motionX", "motionY", "muted", "open", "ownerId", "pathId", "pathProgressVariableId", "phase", "pinTicks", "progress", "resonantTicks", "rootStage", "staggerTicks", "state", "supportId", "targetId", "threaded", "value",
  ]);
  const fallbackMap = {
    id: "main",
    name: "Main map",
    width: project.width,
    height: project.height,
    background: project.background,
    gravity: project.gravity,
    grid: project.grid,
    controlMode: project.controlMode,
    projection: project.projection,
    navigation: project.navigation,
    collisionGeometry: project.collisionGeometry,
    elevationTransitions: project.elevationTransitions,
    tileProgram: project.tileProgram,
    worldStream: project.worldStream,
    objects: project.objects || [],
  };
  const maps = Array.isArray(project.maps) && project.maps.length ? clone(project.maps) : [fallbackMap];
  const initialMapId = maps.some((map) => map.id === project.startMapId)
    ? project.startMapId
    : maps.some((map) => map.id === project.activeMapId)
      ? project.activeMapId
      : maps[0].id;
  const inputs = new Set();
  const inputSources = new Set();
  const pressedInputs = new Set();
  const releasedInputs = new Set();
  const activeActionIds = new Set();
  const inputActionAliases = Object.freeze({
    "move-left": "left",
    left: "left",
    "move-right": "right",
    right: "right",
    "move-up": "up",
    up: "up",
    "move-down": "down",
    down: "down",
    jump: "jump",
    interact: "interact",
    lock: "interact",
  });
  const playerInputCodes = new Set(["ArrowLeft", "KeyA", "left", "ArrowRight", "KeyD", "right", "ArrowUp", "KeyW", "up", "ArrowDown", "KeyS", "down", "Space", "jump", "KeyE", "interact"]);
  const collectedIds = new Set();
  const events = [];
  const gameplayProgram = project.gameplayProgram && typeof project.gameplayProgram === "object" ? clone(project.gameplayProgram) : { version: 1, variables: [], rules: [] };
  const combatProgram = project.combatProgram && typeof project.combatProgram === "object" ? clone(project.combatProgram) : { schemaVersion: "looplab-combat-program/v1", enabled: false, maxProjectiles: 1, teams: [], actors: [], emitters: [], acceptanceTestIds: [] };
  const actorProgram = project.actorProgram && typeof project.actorProgram === "object" ? clone(project.actorProgram) : { schemaVersion: "looplab-actor-program/v1", enabled: false, actors: [], acceptanceTestIds: [] };
  const choicePages = Array.isArray(gameplayProgram.choicePages) ? gameplayProgram.choicePages : [];
  const clocks = Array.isArray(gameplayProgram.clocks) ? gameplayProgram.clocks : [];
  const hudBindings = Array.isArray(gameplayProgram.hudBindings) ? gameplayProgram.hudBindings : [];
  const gameplayVariables = {};
  const completedRunRules = new Set();
  const completedMapRules = new Set();
  const objectOverrides = new Map();
  const pathOverrides = new Map();
  const motionBodyStates = new Map();
  const motionBodyStateSchema = "looplab-motion-body-state/v1";
  const motionBodyRuntimeStateSchema = "looplab-motion-body-runtime-state/v2";
  const motionBodyEpsilon = 0.0000001;
  const combatHealthStates = new Map();
  const combatEmitterStates = new Map();
  const combatProjectileSlots = [];
  const combatStateSchema = "looplab-combat-state/v1";
  const combatEpsilon = 0.0000001;
  const actorStates = new Map();
  const actorStateSchema = "looplab-actor-state/v1";
  const actorEpsilon = 0.0000001;
  const overlapContacts = new Set();
  let activeMap = maps[0];
  let objects = [];
  let activePaths = [];
  let activeCollisionGeometry = null;
  let activeCollisionSegments = [];
  let activeElevationTransitions = null;
  let activeElevationSegments = [];
  let activeTileRuntime = compileTileRuntimeProgram(null, activeMap);
  let activeWorldStreamRuntime = null;
  let activeWorldStreamState = {
    schemaVersion: "looplab-world-stream-runtime/v1",
    present: false,
    hostMapId: initialMapId,
  };
  let won = false;
  let interactionHeld = false;
  let portalCooldown = 0;
  let activeTraversal = null;
  let activeChoicePageId = null;
  let pendingChoiceId = null;
  let gameplayRevision = 0;
  let combatRevision = 0;
  let combatSequence = 0;
  let actorRevision = 0;

  function emit(type, detail) {
    events.push({ type, ...(detail || {}) });
  }

  function mapById(id) {
    return maps.find((map) => map.id === id) || null;
  }

  function resetGameplayVariables() {
    for (const key of Object.keys(gameplayVariables)) delete gameplayVariables[key];
    for (const variable of gameplayProgram.variables || []) {
      if (!variable || typeof variable.id !== "string" || !variable.id) continue;
      gameplayVariables[variable.id] = clone(variable.initial);
    }
  }

  function variableDefinition(id) {
    return (gameplayProgram.variables || []).find((variable) => variable.id === id) || null;
  }

  function boundedVariableValue(id, value) {
    const definition = variableDefinition(id);
    if (!definition) return value;
    if (definition.type === "number") {
      let next = Number(value);
      if (!Number.isFinite(next)) next = Number(definition.initial || 0);
      if (Number.isFinite(Number(definition.min))) next = Math.max(Number(definition.min), next);
      if (Number.isFinite(Number(definition.max))) next = Math.min(Number(definition.max), next);
      return next;
    }
    if (definition.type === "boolean") return Boolean(value);
    return String(value ?? "");
  }

  function setGameplayVariable(id, value) {
    if (!variableDefinition(id)) return false;
    const next = boundedVariableValue(id, value);
    if (gameplayVariables[id] === next) return false;
    gameplayVariables[id] = next;
    gameplayRevision += 1;
    return true;
  }

  function runtimeKey(mapId, id) {
    return `${mapId}:${id}`;
  }

  function applyObjectOverride(object, changes) {
    if (!object || !changes) return;
    for (const key of runtimeObjectChangeKeys) {
      if (Object.prototype.hasOwnProperty.call(changes, key)) object[key] = changes[key];
    }
    if (Object.prototype.hasOwnProperty.call(changes, "colliderEnabled")) {
      object.collider ??= { enabled: Boolean(changes.colliderEnabled), offsetX: 0, offsetY: 0, width: object.width, height: object.height, trigger: false, oneWay: false };
      object.collider.enabled = Boolean(changes.colliderEnabled);
    }
  }

  function applyPathOverride(path, changes) {
    if (!path || !changes) return;
    if (Object.prototype.hasOwnProperty.call(changes, "enabled")) path.enabled = Boolean(changes.enabled);
  }

  function colliderBox(object) {
    if (!object || object.collider?.enabled === false) return null;
    const collider = object.collider || { offsetX: 0, offsetY: 0, width: object.width, height: object.height };
    const zMin = Number.isFinite(collider.zMin) ? collider.zMin : Number(object.z || 0);
    const zMax = Number.isFinite(collider.zMax) ? collider.zMax : zMin + Number(object.collisionHeight || 1);
    return {
      x: Number(object.x || 0) + Number(collider.offsetX || 0),
      y: Number(object.y || 0) + Number(collider.offsetY || 0),
      width: Math.max(0, Number(collider.width ?? object.width ?? 0)),
      height: Math.max(0, Number(collider.height ?? object.height ?? 0)),
      zMin,
      zMax,
    };
  }

  function collisionGeometryTuning() {
    const tuning = activeCollisionGeometry?.tuning || {};
    return {
      minimumFloorNormalY: Number.isFinite(tuning.minimumFloorNormalY) ? Math.max(0, Math.min(1, tuning.minimumFloorNormalY)) : 0.707107,
      floorSnapDistance: Number.isFinite(tuning.floorSnapDistance) ? Math.max(0, Math.min(64, tuning.floorSnapDistance)) : 8,
      maximumStepUp: Number.isFinite(tuning.maximumStepUp) ? Math.max(0, Math.min(64, tuning.maximumStepUp)) : 12,
      stopOnSlope: tuning.stopOnSlope !== false,
      slopeSlideAcceleration: Number.isFinite(tuning.slopeSlideAcceleration) ? Math.max(0, Math.min(4096, tuning.slopeSlideAcceleration)) : 900,
      maximumSlideSpeed: Number.isFinite(tuning.maximumSlideSpeed) ? Math.max(0.001, Math.min(4096, tuning.maximumSlideSpeed)) : 360,
      contactEpsilon: Number.isFinite(tuning.contactEpsilon) ? Math.max(0.000001, Math.min(1, tuning.contactEpsilon)) : 0.001,
    };
  }

  function buildCollisionSegments(geometry) {
    const chains = Array.isArray(geometry?.chains) ? [...geometry.chains] : [];
    chains.sort((first, second) => compareStableIds(first?.id, second?.id));
    const segments = [];
    for (const chain of chains) {
      if (!chain || chain.enabled === false || chain.frontFace !== "right" || !Array.isArray(chain.points)) continue;
      for (let index = 0; index < chain.points.length - 1; index += 1) {
        const a = chain.points[index];
        const b = chain.points[index + 1];
        const ax = Number(a?.x);
        const ay = Number(a?.y);
        const bx = Number(b?.x);
        const by = Number(b?.y);
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.hypot(dx, dy);
        if (![ax, ay, bx, by].every(Number.isFinite) || !(length > 0.000001)) continue;
        const zMin = Number.isFinite(chain.zMin) ? Number(chain.zMin) : 0;
        const zMax = Number.isFinite(chain.zMax) ? Number(chain.zMax) : zMin + 1;
        segments.push({
          id: `${String(chain.id)}:${String(index).padStart(4, "0")}`,
          chainId: String(chain.id),
          segmentIndex: index,
          ax,
          ay,
          bx,
          by,
          dx,
          dy,
          length,
          tangentX: dx / length,
          tangentY: dy / length,
          normalX: dy / length,
          normalY: -dx / length,
          ownsEnd: index === chain.points.length - 2,
          role: ["auto", "floor", "boundary"].includes(chain.role) ? chain.role : "auto",
          oneWay: chain.oneWay === true,
          zMin,
          zMax,
        });
      }
    }
    return segments;
  }

  function buildElevationSegments(program) {
    const transitions = Array.isArray(program?.transitions) ? [...program.transitions] : [];
    transitions.sort((first, second) => compareStableIds(first?.id, second?.id));
    const segments = [];
    for (const transition of transitions) {
      if (!transition || transition.enabled === false || !Array.isArray(transition.points)) continue;
      const raw = [];
      let totalLength = 0;
      for (let index = 0; index < transition.points.length - 1; index += 1) {
        const a = transition.points[index];
        const b = transition.points[index + 1];
        const ax = Number(a?.x);
        const ay = Number(a?.y);
        const az = Number(a?.z);
        const bx = Number(b?.x);
        const by = Number(b?.y);
        const bz = Number(b?.z);
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.hypot(dx, dy);
        if (![ax, ay, az, bx, by, bz].every(Number.isFinite) || !(length > 0.000001)) continue;
        raw.push({ index, ax, ay, az, bx, by, bz, dx, dy, dz: bz - az, length, startDistance: totalLength });
        totalLength += length;
      }
      const start = raw[0] ? { x: raw[0].ax, y: raw[0].ay, z: raw[0].az } : null;
      const final = raw[raw.length - 1];
      const end = final ? { x: final.bx, y: final.by, z: final.bz } : null;
      for (const segment of raw) {
        segments.push({
          id: `${String(transition.id)}:${String(segment.index).padStart(4, "0")}`,
          transitionId: String(transition.id),
          segmentIndex: segment.index,
          ax: segment.ax,
          ay: segment.ay,
          az: segment.az,
          bx: segment.bx,
          by: segment.by,
          bz: segment.bz,
          dx: segment.dx,
          dy: segment.dy,
          dz: segment.dz,
          length: segment.length,
          startDistance: segment.startDistance,
          totalLength,
          start,
          end,
          width: Number.isFinite(transition.width) ? Math.max(0.001, Number(transition.width)) : 48,
          entryRadius: Number.isFinite(transition.entryRadius) ? Math.max(0.001, Number(transition.entryRadius)) : 48,
          entryZTolerance: Number.isFinite(transition.entryZTolerance) ? Math.max(0, Number(transition.entryZTolerance)) : 0.5,
          oneWay: transition.oneWay === true,
          collisionChainId: typeof transition.collisionChainId === "string" ? transition.collisionChainId : null,
        });
      }
    }
    return segments;
  }

  function elevationPointForObject(object) {
    const box = colliderBox(object);
    if (box) return { x: box.x + box.width / 2, y: box.y + box.height };
    return { x: Number(object?.x || 0) + Number(object?.width || 0) / 2, y: Number(object?.y || 0) + Number(object?.height || 0) };
  }

  function sampleElevationAtPoint(point, transitionId = null) {
    if (!point || activeElevationSegments.length === 0) return null;
    let best = null;
    for (const segment of activeElevationSegments) {
      if (transitionId && segment.transitionId !== transitionId) continue;
      const denominator = segment.length * segment.length;
      const parameter = Math.max(0, Math.min(1, ((Number(point.x) - segment.ax) * segment.dx + (Number(point.y) - segment.ay) * segment.dy) / denominator));
      const x = segment.ax + segment.dx * parameter;
      const y = segment.ay + segment.dy * parameter;
      const distance = Math.hypot(Number(point.x) - x, Number(point.y) - y);
      if (distance > segment.width / 2 + 0.000001) continue;
      const progress = segment.totalLength > 0 ? (segment.startDistance + segment.length * parameter) / segment.totalLength : 0;
      const candidate = { ...segment, parameter, progress, x, y, z: segment.az + segment.dz * parameter, distance };
      if (!best || candidate.distance < best.distance - 0.000001 || (Math.abs(candidate.distance - best.distance) <= 0.000001 && (compareStableIds(candidate.transitionId, best.transitionId) < 0 || (candidate.transitionId === best.transitionId && candidate.segmentIndex < best.segmentIndex)))) best = candidate;
    }
    return best;
  }

  function clearElevationTransition(player, detail = {}) {
    const priorId = player.elevationTransitionId ?? null;
    player.elevationTransitionId = null;
    player.elevationSegmentId = null;
    player.elevationProgress = 0;
    player.elevationSupportZ = Number(player.z || 0);
    if (priorId && detail.emit !== false) emit("elevation.exited", { mapId: activeMap.id, transitionId: priorId, supportZ: Number(player.z || 0), endpoint: detail.endpoint ?? null });
  }

  function applyElevationSample(player, sample, entering = false) {
    const priorId = player.elevationTransitionId ?? null;
    player.elevationTransitionId = sample.transitionId;
    player.elevationSegmentId = sample.id;
    player.elevationProgress = sample.progress;
    player.elevationSupportZ = sample.z;
    setObjectZ(player, sample.z);
    if (entering && priorId !== sample.transitionId) emit("elevation.entered", { mapId: activeMap.id, transitionId: sample.transitionId, segmentId: sample.id, supportZ: sample.z, progress: sample.progress });
  }

  function canEnterElevationTransition(player, sample) {
    const point = elevationPointForObject(player);
    const startDistance = sample.start ? Math.hypot(point.x - sample.start.x, point.y - sample.start.y) : Infinity;
    const endDistance = sample.end ? Math.hypot(point.x - sample.end.x, point.y - sample.end.y) : Infinity;
    const currentZ = Number(player.z || 0);
    const startCompatible = startDistance <= sample.entryRadius + 0.000001 && Math.abs(currentZ - sample.start.z) <= sample.entryZTolerance + 0.000001;
    const endCompatible = !sample.oneWay && endDistance <= sample.entryRadius + 0.000001 && Math.abs(currentZ - sample.end.z) <= sample.entryZTolerance + 0.000001;
    return startCompatible || endCompatible;
  }

  function updateTopdownElevation(player, previousPose) {
    if (activeElevationSegments.length === 0) {
      if (player.elevationTransitionId) clearElevationTransition(player);
      return false;
    }
    const activeId = typeof player.elevationTransitionId === "string" ? player.elevationTransitionId : null;
    let sample = sampleElevationAtPoint(elevationPointForObject(player), activeId);
    if (!activeId) {
      sample ??= sampleElevationAtPoint(elevationPointForObject(player));
      if (!sample || !canEnterElevationTransition(player, sample)) return false;
      applyElevationSample(player, sample, true);
      return true;
    }
    if (sample && sample.oneWay && Number.isFinite(player.elevationProgress) && sample.progress + 0.000001 < Number(player.elevationProgress)) sample = null;
    if (sample) {
      applyElevationSample(player, sample);
      return true;
    }
    const priorProgress = Number(player.elevationProgress || 0);
    const priorSegment = activeElevationSegments.find((segment) => segment.transitionId === activeId);
    if (priorSegment && priorProgress <= Math.min(0.5, priorSegment.entryRadius / Math.max(priorSegment.totalLength, 0.000001))) {
      setObjectZ(player, priorSegment.start.z);
      clearElevationTransition(player, { endpoint: "start" });
      return false;
    }
    if (priorSegment && priorProgress >= 1 - Math.min(0.5, priorSegment.entryRadius / Math.max(priorSegment.totalLength, 0.000001))) {
      setObjectZ(player, priorSegment.end.z);
      clearElevationTransition(player, { endpoint: "end" });
      return false;
    }
    if (previousPose) {
      player.x = previousPose.x;
      player.y = previousPose.y;
      const restored = sampleElevationAtPoint(elevationPointForObject(player), activeId);
      if (restored) applyElevationSample(player, restored);
    }
    return true;
  }

  function platformerElevationSample(collisionSegment, parameter) {
    const segment = activeElevationSegments.find((candidate) => candidate.collisionChainId === collisionSegment?.chainId && candidate.segmentIndex === collisionSegment?.segmentIndex);
    if (!segment) return null;
    const clamped = Math.max(0, Math.min(1, Number(parameter || 0)));
    return { ...segment, parameter: clamped, progress: segment.totalLength > 0 ? (segment.startDistance + segment.length * clamped) / segment.totalLength : 0, z: segment.az + segment.dz * clamped };
  }

  function segmentZOverlapsPlayer(segment, playerBox) {
    return playerBox && playerBox.zMin < segment.zMax && playerBox.zMax > segment.zMin;
  }

  function isFloorSegment(segment, tuning = collisionGeometryTuning()) {
    if (segment.role === "boundary") return false;
    return segment.normalY < 0 && -segment.normalY + tuning.contactEpsilon >= tuning.minimumFloorNormalY;
  }

  function segmentPointAtX(segment, x, epsilon) {
    if (Math.abs(segment.dx) <= epsilon) return null;
    const parameter = (x - segment.ax) / segment.dx;
    if (parameter < -epsilon || parameter > 1 + epsilon) return null;
    if (!segment.ownsEnd && parameter >= 1 - epsilon) return null;
    const clamped = Math.max(0, Math.min(1, parameter));
    return { x, y: segment.ay + segment.dy * clamped, parameter: clamped };
  }

  function clearGroundContact(player) {
    player.groundChainId = null;
    player.groundSegmentId = null;
    player.groundNormalX = 0;
    player.groundNormalY = -1;
    player.slopeSliding = false;
  }

  function applyGroundContact(player, segment) {
    player.groundChainId = segment.chainId;
    player.groundSegmentId = segment.id;
    player.groundNormalX = segment.normalX;
    player.groundNormalY = segment.normalY;
    player.slopeSliding = false;
  }

  function resolveSegmentBoundary(player, previousBox, axis, dt = 1 / 60) {
    const currentBox = colliderBox(player);
    if (!currentBox || !previousBox || activeCollisionSegments.length === 0) return false;
    const tuning = collisionGeometryTuning();
    const previousCenter = { x: previousBox.x + previousBox.width / 2, y: previousBox.y + previousBox.height / 2 };
    const currentCenter = { x: currentBox.x + currentBox.width / 2, y: currentBox.y + currentBox.height / 2 };
    let best = null;
    for (const segment of activeCollisionSegments) {
      if (!segmentZOverlapsPlayer(segment, currentBox)) continue;
      if ((activeMap.controlMode ?? project.controlMode) === "platformer" && isFloorSegment(segment, tuning)) continue;
      const radius = Math.abs(segment.normalX) * currentBox.width / 2 + Math.abs(segment.normalY) * currentBox.height / 2;
      const previousDistance = (previousCenter.x - segment.ax) * segment.normalX + (previousCenter.y - segment.ay) * segment.normalY - radius;
      const currentDistance = (currentCenter.x - segment.ax) * segment.normalX + (currentCenter.y - segment.ay) * segment.normalY - radius;
      if (previousDistance < -tuning.contactEpsilon || currentDistance >= tuning.contactEpsilon || currentDistance >= previousDistance) continue;
      const denominator = previousDistance - currentDistance;
      const time = denominator > tuning.contactEpsilon ? Math.max(0, Math.min(1, previousDistance / denominator)) : 0;
      const contactX = previousCenter.x + (currentCenter.x - previousCenter.x) * time - segment.normalX * radius;
      const contactY = previousCenter.y + (currentCenter.y - previousCenter.y) * time - segment.normalY * radius;
      const tangent = ((contactX - segment.ax) * segment.dx + (contactY - segment.ay) * segment.dy) / (segment.length * segment.length);
      if (tangent < -tuning.contactEpsilon || tangent > 1 + tuning.contactEpsilon || (!segment.ownsEnd && tangent >= 1 - tuning.contactEpsilon)) continue;
      if (!best || time < best.time - tuning.contactEpsilon || (Math.abs(time - best.time) <= tuning.contactEpsilon && compareStableIds(segment.id, best.segment.id) < 0)) best = { segment, time, currentDistance };
    }
    if (!best) return false;
    const correction = -best.currentDistance + tuning.contactEpsilon;
    if (axis === "x") {
      player.x += best.segment.normalX * correction;
      if (Number(player.vx || 0) * best.segment.normalX < 0) player.vx = 0;
    } else {
      player.y += best.segment.normalY * correction;
      if (Number(player.vy || 0) * best.segment.normalY < 0) player.vy = 0;
    }
    if ((activeMap.controlMode ?? project.controlMode) === "platformer" && best.segment.normalY < 0) {
      player.slopeSliding = true;
      const downhill = best.segment.tangentY >= 0 ? 1 : -1;
      player.vx = Math.max(-tuning.maximumSlideSpeed, Math.min(tuning.maximumSlideSpeed, Number(player.vx || 0) + downhill * tuning.slopeSlideAcceleration * Math.max(0, Number(dt) || 0)));
    }
    return true;
  }

  function resolvePlatformerFloorSegments(player, previousBox, wasGrounded, movementStartBox = previousBox) {
    const currentBox = colliderBox(player);
    if (!currentBox || !previousBox || activeCollisionSegments.length === 0 || player.vy < 0) return false;
    const tuning = collisionGeometryTuning();
    const footX = currentBox.x + currentBox.width / 2;
    const previousFootX = movementStartBox.x + movementStartBox.width / 2;
    const previousFootY = previousBox.y + previousBox.height;
    const sweepStartFootY = movementStartBox.y + movementStartBox.height;
    const currentFootY = currentBox.y + currentBox.height;
    let best = null;
    for (const segment of activeCollisionSegments) {
      if (!isFloorSegment(segment, tuning) || !segmentZOverlapsPlayer(segment, currentBox)) continue;
      const point = segmentPointAtX(segment, footX, tuning.contactEpsilon);
      if (!point) continue;
      const previousPoint = segmentPointAtX(segment, previousFootX, tuning.contactEpsilon) ?? point;
      const crossed = sweepStartFootY <= previousPoint.y + tuning.contactEpsilon && currentFootY >= point.y - tuning.contactEpsilon;
      const stepUp = wasGrounded && previousFootY >= point.y && previousFootY - point.y <= tuning.maximumStepUp + tuning.contactEpsilon;
      const snapDown = wasGrounded && currentFootY <= point.y && point.y - currentFootY <= tuning.floorSnapDistance + tuning.contactEpsilon;
      if (!crossed && !stepUp && !snapDown) continue;
      const distance = Math.abs(point.y - previousFootY);
      if (!best || distance < best.distance - tuning.contactEpsilon || (Math.abs(distance - best.distance) <= tuning.contactEpsilon && compareStableIds(segment.id, best.segment.id) < 0)) best = { segment, point, distance };
    }
    if (!best) return false;
    const collider = player.collider || { offsetY: 0, height: player.height };
    player.y = best.point.y - Number(collider.offsetY || 0) - Number(collider.height ?? player.height);
    player.vy = 0;
    player.grounded = true;
    applyGroundContact(player, best.segment);
    const elevationSample = platformerElevationSample(best.segment, best.point.parameter);
    if (elevationSample) applyElevationSample(player, elevationSample, player.elevationTransitionId !== elevationSample.transitionId);
    else if (player.elevationTransitionId) clearElevationTransition(player);
    return true;
  }

  function overlaps(firstObject, secondObject) {
    const first = colliderBox(firstObject);
    const second = colliderBox(secondObject);
    if (!first || !second) return false;
    return first.x < second.x + second.width &&
      first.x + first.width > second.x &&
      first.y < second.y + second.height &&
      first.y + first.height > second.y &&
      first.zMin < second.zMax &&
      first.zMax > second.zMin;
  }

  function compareGameplayValue(actual, operator, expected) {
    const normalizedOperator = ({ "==": "eq", "===": "eq", "!=": "ne", "!==": "ne", ">": "gt", ">=": "gte", "<": "lt", "<=": "lte" })[operator] || operator;
    if (normalizedOperator === "truthy") return Boolean(actual);
    if (normalizedOperator === "falsy") return !actual;
    if (normalizedOperator === "eq") return actual === expected;
    if (normalizedOperator === "ne") return actual !== expected;
    if (normalizedOperator === "gt") return Number(actual) > Number(expected);
    if (normalizedOperator === "gte") return Number(actual) >= Number(expected);
    if (normalizedOperator === "lt") return Number(actual) < Number(expected);
    if (normalizedOperator === "lte") return Number(actual) <= Number(expected);
    return false;
  }

  function gameplayStateTriggerPasses(trigger) {
    if (!trigger?.variableId) return true;
    return compareGameplayValue(gameplayVariables[trigger.variableId], trigger.operator || "truthy", trigger.value);
  }

  function gameplayConditionsPass(rule) {
    return (rule.conditions || []).every((condition) => compareGameplayValue(gameplayVariables[condition.variableId], condition.operator || "eq", condition.value));
  }

  function conditionListPasses(conditions) {
    return (conditions || []).every((condition) => compareGameplayValue(gameplayVariables[condition.variableId], condition.operator || "eq", condition.value));
  }

  function safeInteger(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(Number.MIN_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(numeric)));
  }

  function evaluateIntegerExpression(expression, depth = 0, budget = { count: 0 }) {
    budget.count += 1;
    if (depth > 12 || budget.count > 64) return { value: 0, fault: "expression-limit" };
    if (Number.isSafeInteger(expression)) return { value: expression, fault: null };
    if (!expression || typeof expression !== "object" || Array.isArray(expression)) return { value: 0, fault: "invalid-expression" };
    if (typeof expression.variableId === "string") return { value: safeInteger(gameplayVariables[expression.variableId]), fault: null };
    const operands = Array.isArray(expression.operands)
      ? expression.operands.map((operand) => evaluateIntegerExpression(operand, depth + 1, budget))
      : [];
    const fault = operands.find((operand) => operand.fault)?.fault ?? null;
    const values = operands.map((operand) => operand.value);
    const operator = expression.operator;
    let value = 0;
    if (operator === "add") value = values.reduce((total, entry) => total + entry, 0);
    else if (operator === "subtract") value = values[0] - values[1];
    else if (operator === "multiply") value = values.reduce((total, entry) => total * entry, 1);
    else if (operator === "divide") {
      if (values[1] === 0) return { value: 0, fault: "divide-by-zero" };
      value = values[0] / values[1];
    } else if (operator === "modulo") {
      if (values[1] === 0) return { value: 0, fault: "modulo-by-zero" };
      value = values[0] % values[1];
    } else if (operator === "min") value = Math.min(...values);
    else if (operator === "max") value = Math.max(...values);
    else if (operator === "clamp") value = Math.max(Math.min(values[1], values[2]), Math.min(Math.max(values[1], values[2]), values[0]));
    else if (operator === "abs") value = Math.abs(values[0]);
    else if (operator === "negate") value = -values[0];
    else return { value: 0, fault: "unsupported-operator" };
    return { value: safeInteger(value), fault };
  }

  function interpolateGameplayText(text) {
    return String(text ?? "").replace(/\{([A-Za-z0-9][A-Za-z0-9._:-]*)\}/g, (match, variableId) => Object.prototype.hasOwnProperty.call(gameplayVariables, variableId) ? String(gameplayVariables[variableId]) : match);
  }

  function choicePageDefinition(pageId = activeChoicePageId) {
    return choicePages.find((page) => page.id === pageId) || null;
  }

  function getChoiceState() {
    const page = choicePageDefinition();
    if (!page) return null;
    return {
      id: page.id,
      title: interpolateGameplayText(page.title),
      body: interpolateGameplayText(page.body),
      modal: page.modal !== false,
      choices: (page.choices || [])
        .map((choice) => ({
          id: choice.id,
          label: interpolateGameplayText(choice.label),
          actionId: choice.actionId,
          visible: conditionListPasses(choice.visibleWhen),
          enabled: conditionListPasses(choice.enabledWhen),
        }))
        .filter((choice) => choice.visible),
    };
  }

  function getHudState() {
    return hudBindings
      .filter((binding) => conditionListPasses(binding.visibleWhen))
      .map((binding) => ({
        id: binding.id,
        text: interpolateGameplayText(binding.text),
        ariaLabel: interpolateGameplayText(binding.ariaLabel || binding.text),
        region: binding.region || "primary",
      }));
  }

  function clearInputState() {
    inputSources.clear();
    inputs.clear();
    pressedInputs.clear();
    releasedInputs.clear();
    activeActionIds.clear();
    interactionHeld = false;
  }

  function openChoicePage(pageId, sourceId = null) {
    const page = choicePageDefinition(pageId);
    if (!page || activeChoicePageId === page.id) return false;
    activeChoicePageId = page.id;
    pendingChoiceId = null;
    clearInputState();
    gameplayRevision += 1;
    emit("choice.opened", { mapId: activeMap.id, pageId: page.id, sourceId });
    return true;
  }

  function closeChoicePage(sourceId = null) {
    if (!activeChoicePageId) return false;
    const pageId = activeChoicePageId;
    activeChoicePageId = null;
    pendingChoiceId = null;
    clearInputState();
    gameplayRevision += 1;
    emit("choice.closed", { mapId: activeMap.id, pageId, sourceId });
    return true;
  }

  function chooseChoice(choiceId) {
    const page = choicePageDefinition();
    const choice = page?.choices?.find((candidate) => candidate.id === choiceId);
    if (!choice || !conditionListPasses(choice.visibleWhen) || !conditionListPasses(choice.enabledWhen)) return false;
    pendingChoiceId = choice.id;
    gameplayRevision += 1;
    return true;
  }

  function gameplayRuleCompleted(rule) {
    if (rule.once === "never") return false;
    if (rule.once === "map") return completedMapRules.has(rule.id);
    return completedRunRules.has(rule.id);
  }

  function markGameplayRuleCompleted(rule) {
    if (rule.once === "map") completedMapRules.add(rule.id);
    else if (rule.once !== "never") completedRunRules.add(rule.id);
  }

  function inputActionActive(action, source = inputs) {
    return [action.id, ...(action.bindings || [])].some((code) => source.has(code));
  }

  function sampleInputActionPhases() {
    const phases = { pressed: new Set(), held: new Set(), released: new Set() };
    const nextActiveActionIds = new Set();
    for (const action of project.inputActions || []) {
      const active = inputActionActive(action);
      const wasActive = activeActionIds.has(action.id);
      const pressedBetweenTicks = inputActionActive(action, pressedInputs);
      const releasedBetweenTicks = inputActionActive(action, releasedInputs);
      if (active) nextActiveActionIds.add(action.id);
      if ((active && !wasActive) || (!active && !wasActive && pressedBetweenTicks)) phases.pressed.add(action.id);
      if (active) phases.held.add(action.id);
      if ((!active && wasActive) || (!active && !wasActive && pressedBetweenTicks && releasedBetweenTicks)) phases.released.add(action.id);
    }
    activeActionIds.clear();
    for (const actionId of nextActiveActionIds) activeActionIds.add(actionId);
    return phases;
  }

  function gameplayEventMatches(rule, event) {
    const trigger = rule.trigger || {};
    if (trigger.type !== "event" || trigger.event !== event.type) return false;
    if (trigger.mapId && trigger.mapId !== (event.mapId || activeMap.id)) return false;
    if (trigger.objectId && trigger.objectId !== event.objectId) return false;
    return true;
  }

  function applyGameplayEffect(effect, rule, player) {
    if (effect.type === "set-variable") setGameplayVariable(effect.variableId, effect.value);
    else if (effect.type === "add-variable") setGameplayVariable(effect.variableId, Number(gameplayVariables[effect.variableId] || 0) + Number(effect.value || 0));
    else if (effect.type === "set-variable-expression") {
      const result = evaluateIntegerExpression(effect.expression);
      setGameplayVariable(effect.variableId, result.value);
      if (result.fault) emit("gameplay.expression-fault", { mapId: activeMap.id, ruleId: rule.id, variableId: effect.variableId, fault: result.fault });
    }
    else if (effect.type === "toggle-variable") setGameplayVariable(effect.variableId, !gameplayVariables[effect.variableId]);
    else if (effect.type === "set-object") {
      const mapId = effect.mapId || activeMap.id;
      const key = runtimeKey(mapId, effect.objectId);
      const changes = { ...(objectOverrides.get(key) || {}), ...(effect.changes || {}) };
      objectOverrides.set(key, changes);
      if (mapId === activeMap.id) applyObjectOverride(objects.find((object) => object.id === effect.objectId), changes);
      gameplayRevision += 1;
    } else if (effect.type === "set-path") {
      const mapId = effect.mapId || activeMap.id;
      const key = runtimeKey(mapId, effect.pathId);
      const changes = { ...(pathOverrides.get(key) || {}), ...(effect.changes || {}) };
      pathOverrides.set(key, changes);
      if (mapId === activeMap.id) applyPathOverride(activePaths.find((path) => path.id === effect.pathId), changes);
      gameplayRevision += 1;
    } else if (effect.type === "emit") emit(effect.event, { mapId: activeMap.id, ruleId: rule.id, ...(effect.detail || {}) });
    else if (effect.type === "load-map") loadMap(effect.mapId, effect.spawnId || null);
    else if (effect.type === "respawn") {
      const currentPlayer = objects.find((object) => object.kind === "player") || player;
      if (currentPlayer) respawn(currentPlayer, effect.spawnId || null, { cause: "gameplay-effect", ruleId: rule.id });
    } else if (effect.type === "win") {
      if (!won) {
        won = true;
        gameplayRevision += 1;
        emit("goal.reached", { mapId: activeMap.id, ruleId: rule.id });
      }
    } else if (effect.type === "impulse-player") {
      const currentPlayer = objects.find((object) => object.kind === "player") || player;
      if (currentPlayer) {
        currentPlayer.vx = Number(currentPlayer.vx || 0) + Number(effect.x || 0);
        currentPlayer.vy = Number(currentPlayer.vy || 0) + Number(effect.y || 0);
        gameplayRevision += 1;
      }
    } else if (effect.type === "collect-object") {
      const mapId = effect.mapId || activeMap.id;
      collectedIds.add(runtimeKey(mapId, effect.objectId));
      if (mapId === activeMap.id) {
        const object = objects.find((candidate) => candidate.id === effect.objectId);
        if (object) object.collected = true;
      }
      gameplayRevision += 1;
      emit("object.collected", { mapId, objectId: effect.objectId, ruleId: rule.id });
    } else if (effect.type === "open-choice-page") openChoicePage(effect.pageId, rule.id);
    else if (effect.type === "close-choice-page") closeChoicePage(rule.id);
    else if (effect.type === "advance-clock") {
      const clock = clocks.find((candidate) => candidate.id === effect.clockId);
      if (clock) {
        const steps = safeInteger(effect.steps ?? 1);
        const next = safeInteger(gameplayVariables[clock.variableId]) + safeInteger(clock.step || 1) * steps;
        setGameplayVariable(clock.variableId, safeInteger(next));
        emit("clock.advanced", { mapId: activeMap.id, ruleId: rule.id, clockId: clock.id, variableId: clock.variableId, value: gameplayVariables[clock.variableId], steps });
      }
    }
  }

  function executeChoice(choice, player) {
    const page = choicePageDefinition();
    if (!page || !choice || !conditionListPasses(choice.visibleWhen) || !conditionListPasses(choice.enabledWhen)) return false;
    const source = { id: `choice:${choice.id}` };
    pendingChoiceId = null;
    for (const effect of choice.effects || []) applyGameplayEffect(effect, source, player);
    const sourcePageId = page.id;
    if (choice.nextPageId) openChoicePage(choice.nextPageId, source.id);
    else if (choice.close !== false) closeChoicePage(source.id);
    gameplayRevision += 1;
    emit("choice.selected", { mapId: activeMap.id, pageId: sourcePageId, choiceId: choice.id, actionId: choice.actionId });
    return true;
  }

  function processChoiceSelection(inputActionPhases, player) {
    const page = choicePageDefinition();
    if (!page) {
      pendingChoiceId = null;
      return false;
    }
    const choice = pendingChoiceId
      ? page.choices?.find((candidate) => candidate.id === pendingChoiceId)
      : page.choices?.find((candidate) => inputActionPhases.pressed.has(candidate.actionId) && conditionListPasses(candidate.visibleWhen) && conditionListPasses(candidate.enabledWhen));
    if (!choice) {
      if (pendingChoiceId) {
        emit("choice.rejected", { mapId: activeMap.id, pageId: page.id, choiceId: pendingChoiceId });
        pendingChoiceId = null;
        gameplayRevision += 1;
      }
      return false;
    }
    return executeChoice(choice, player);
  }

  function runGameplayRule(rule, player) {
    if (!rule.enabled || gameplayRuleCompleted(rule) || !gameplayConditionsPass(rule)) return false;
    markGameplayRuleCompleted(rule);
    for (const effect of rule.effects || []) applyGameplayEffect(effect, rule, player);
    gameplayRevision += 1;
    emit("gameplay.rule-fired", { mapId: activeMap.id, ruleId: rule.id });
    return true;
  }

  function processGameplayRules(player, inputActionPhases, frameEventStart) {
    const rules = gameplayProgram.rules || [];
    const activeAtStart = activeMap.id;
    const nextContacts = new Set();
    for (const rule of rules) {
      const trigger = rule.trigger || {};
      if (!rule.enabled || gameplayRuleCompleted(rule) || trigger.mapId && trigger.mapId !== activeMap.id) continue;
      if (trigger.type === "input" && inputActionPhases[trigger.phase || "pressed"]?.has(trigger.actionId)) runGameplayRule(rule, player);
      else if (trigger.type === "state" && gameplayStateTriggerPasses(trigger)) runGameplayRule(rule, player);
      else if (trigger.type === "overlap") {
        const target = objects.find((object) => object.id === trigger.objectId);
        const contactKey = runtimeKey(activeMap.id, rule.id);
        const touching = Boolean(target && !target.hidden && overlaps(objects.find((object) => object.kind === "player") || player, target));
        const wasTouching = overlapContacts.has(contactKey);
        if (touching) nextContacts.add(contactKey);
        const edge = trigger.edge || "enter";
        if ((edge === "stay" && touching) || (edge === "enter" && touching && !wasTouching) || (edge === "exit" && !touching && wasTouching)) runGameplayRule(rule, player);
      }
    }
    overlapContacts.clear();
    if (activeMap.id === activeAtStart) for (const key of nextContacts) overlapContacts.add(key);

    let eventIndex = frameEventStart;
    let processed = 0;
    while (eventIndex < events.length && processed < 128) {
      const event = events[eventIndex];
      eventIndex += 1;
      processed += 1;
      for (const rule of rules) if (rule.enabled && !gameplayRuleCompleted(rule) && gameplayEventMatches(rule, event)) runGameplayRule(rule, objects.find((object) => object.kind === "player") || player);
    }
    if (eventIndex < events.length) emit("gameplay.rule-guard", { mapId: activeMap.id, processed, remaining: events.length - eventIndex });
  }

  function setObjectZ(object, z) {
    const nextZ = Number(z || 0);
    const collider = object.collider;
    const collisionHeight = collider && Number.isFinite(collider.zMax) && Number.isFinite(collider.zMin)
      ? Math.max(0.001, collider.zMax - collider.zMin)
      : Number(object.collisionHeight || 1);
    object.z = nextZ;
    object.supportZ = nextZ;
    if (collider) {
      collider.zMin = nextZ;
      collider.zMax = nextZ + collisionHeight;
    }
  }

  function motionBodyAnchorOffsets(object) {
    return {
      x: Number(object?.groundAnchor?.offsetX ?? Number(object?.width || 0) / 2),
      y: Number(object?.groundAnchor?.offsetY ?? object?.height ?? 0),
    };
  }

  function motionBodyDirectionLabel(direction) {
    return Number(direction) < 0 ? "reverse" : "forward";
  }

  function initialMotionBodyState(map, object) {
    const body = object?.motionBody;
    const path = (map?.traversalPaths || []).find((candidate) => candidate.id === body?.pathId);
    if (!body || !path) return null;
    const offsets = motionBodyAnchorOffsets(object);
    const closest = closestTraversalPoint(
      path,
      Number(object.x || 0) + offsets.x,
      Number(object.y || 0) + offsets.y,
      Number(object.z || 0),
    );
    const geometry = closest?.geometry ?? traversalGeometry(path);
    const direction = body.initialDirection === "reverse" ? -1 : 1;
    return {
      schemaVersion: motionBodyStateSchema,
      mapId: map.id,
      objectId: object.id,
      pathId: body.pathId,
      progress: Number(closest?.pathDistance ?? (direction < 0 ? geometry.total : 0)),
      speed: 0,
      direction,
      engaged: false,
      blocked: false,
      blockerId: null,
      blockerProgress: null,
      completed: false,
      riderId: null,
      appliedDeltaX: 0,
      appliedDeltaY: 0,
      appliedDeltaZ: 0,
      crushed: false,
      crushBlockerId: null,
      crushResponse: null,
    };
  }

  function resetMotionBodyStates() {
    motionBodyStates.clear();
    for (const map of [...maps].sort((first, second) => compareStableIds(first.id, second.id))) {
      for (const object of [...(map.objects || [])].sort((first, second) => compareStableIds(first.id, second.id))) {
        if (!object?.motionBody || typeof object.motionBody !== "object") continue;
        const state = initialMotionBodyState(map, object);
        if (state) motionBodyStates.set(runtimeKey(map.id, object.id), state);
      }
    }
  }

  function ensureMotionBodyState(map, object) {
    const key = runtimeKey(map.id, object.id);
    let state = motionBodyStates.get(key);
    if (!state || state.pathId !== object.motionBody?.pathId) {
      state = initialMotionBodyState(map, object);
      if (state) motionBodyStates.set(key, state);
    }
    return state ?? null;
  }

  function positionMotionBodyOnSample(object, sample) {
    if (!sample) return false;
    const offsets = motionBodyAnchorOffsets(object);
    object.x = Number(sample.x) - offsets.x;
    object.y = Number(sample.y) - offsets.y;
    setObjectZ(object, Number(sample.z || 0));
    return true;
  }

  function applyMotionBodyStateToObject(map, object, state) {
    const path = (map?.traversalPaths || []).find((candidate) => candidate.id === state?.pathId);
    if (!path || !state) return false;
    const sample = traversalSample(traversalGeometry(path), state.progress);
    if (!positionMotionBodyOnSample(object, sample)) return false;
    object.vx = 0;
    object.vy = 0;
    return true;
  }

  function motionBodyBlockers(object) {
    return objects
      .filter((candidate) => candidate !== object && !candidate.hidden && candidate.collider?.enabled !== false && !candidate.collider?.trigger && (candidate.kind === "player" || candidate.solid))
      .sort((first, second) => compareStableIds(first.id, second.id));
  }

  function firstMotionBodyBlocker(object, blockers) {
    return blockers.find((candidate) => overlaps(object, candidate)) || null;
  }

  function motionBodyCarryEnabled(body) {
    return body?.schemaVersion === "looplab-motion-body/v2" && body.riderMode === "carry-player" && (activeMap.controlMode ?? project.controlMode) === "platformer";
  }

  function motionBodyRider(object, body) {
    if (!motionBodyCarryEnabled(body) || activeTraversal) return null;
    const rider = objects.find((candidate) => candidate.kind === "player" && !candidate.hidden);
    const platformBox = colliderBox(object);
    const riderBox = colliderBox(rider);
    if (!rider || !platformBox || !riderBox || Number(rider.vy || 0) < -motionBodyEpsilon) return null;
    const tolerance = Math.max(0, Math.min(32, Number(body.carryTolerance ?? 2)));
    const horizontal = riderBox.x + riderBox.width > platformBox.x + motionBodyEpsilon && riderBox.x < platformBox.x + platformBox.width - motionBodyEpsilon;
    const heightContact = Math.abs(riderBox.y + riderBox.height - platformBox.y) <= tolerance + motionBodyEpsilon;
    const zContact = riderBox.zMin < platformBox.zMax + motionBodyEpsilon && riderBox.zMax > platformBox.zMin - motionBodyEpsilon;
    return horizontal && heightContact && zContact ? rider : null;
  }

  function objectPose(object) {
    return {
      x: Number(object.x || 0),
      y: Number(object.y || 0),
      z: Number(object.z || 0),
      supportZ: Number(object.supportZ ?? object.z ?? 0),
      colliderZMin: object.collider && Number.isFinite(object.collider.zMin) ? Number(object.collider.zMin) : null,
      colliderZMax: object.collider && Number.isFinite(object.collider.zMax) ? Number(object.collider.zMax) : null,
      grounded: Boolean(object.grounded),
    };
  }

  function restoreObjectPose(object, pose) {
    object.x = pose.x;
    object.y = pose.y;
    object.z = pose.z;
    object.supportZ = pose.supportZ;
    object.grounded = pose.grounded;
    if (object.collider) {
      if (pose.colliderZMin == null) delete object.collider.zMin;
      else object.collider.zMin = pose.colliderZMin;
      if (pose.colliderZMax == null) delete object.collider.zMax;
      else object.collider.zMax = pose.colliderZMax;
    }
  }

  function firstCarriedSegmentBlocker(previousBox, currentBox) {
    if (!previousBox || !currentBox) return null;
    const tuning = collisionGeometryTuning();
    const previousCenter = { x: previousBox.x + previousBox.width / 2, y: previousBox.y + previousBox.height / 2 };
    const currentCenter = { x: currentBox.x + currentBox.width / 2, y: currentBox.y + currentBox.height / 2 };
    let best = null;
    for (const segment of activeCollisionSegments) {
      if (!segmentZOverlapsPlayer(segment, currentBox)) continue;
      const radius = Math.abs(segment.normalX) * currentBox.width / 2 + Math.abs(segment.normalY) * currentBox.height / 2;
      const previousDistance = (previousCenter.x - segment.ax) * segment.normalX + (previousCenter.y - segment.ay) * segment.normalY - radius;
      const currentDistance = (currentCenter.x - segment.ax) * segment.normalX + (currentCenter.y - segment.ay) * segment.normalY - radius;
      if (previousDistance < -tuning.contactEpsilon || currentDistance >= tuning.contactEpsilon || currentDistance >= previousDistance) continue;
      const denominator = previousDistance - currentDistance;
      const time = denominator > tuning.contactEpsilon ? Math.max(0, Math.min(1, previousDistance / denominator)) : 0;
      const contactX = previousCenter.x + (currentCenter.x - previousCenter.x) * time - segment.normalX * radius;
      const contactY = previousCenter.y + (currentCenter.y - previousCenter.y) * time - segment.normalY * radius;
      const tangent = ((contactX - segment.ax) * segment.dx + (contactY - segment.ay) * segment.dy) / (segment.length * segment.length);
      if (tangent < -tuning.contactEpsilon || tangent > 1 + tuning.contactEpsilon || (!segment.ownsEnd && tangent >= 1 - tuning.contactEpsilon)) continue;
      if (!best || time < best.time - tuning.contactEpsilon || (Math.abs(time - best.time) <= tuning.contactEpsilon && compareStableIds(segment.id, best.segment.id) < 0)) best = { segment, time };
    }
    return best ? `collision-chain:${best.segment.id}` : null;
  }

  function carriedPlayerBlocker(player, platform, previousBox) {
    const currentBox = colliderBox(player);
    if (!currentBox) return "invalid-player-collider";
    const width = Number(activeMap.width ?? project.width ?? 0);
    const height = Number(activeMap.height ?? project.height ?? 0);
    if (currentBox.x < -motionBodyEpsilon || currentBox.x + currentBox.width > width + motionBodyEpsilon || currentBox.y < -motionBodyEpsilon || currentBox.y + currentBox.height > height + motionBodyEpsilon) return "map-bounds";
    const obstacle = objects
      .filter((candidate) => candidate !== player && candidate !== platform && !candidate.hidden && candidate.solid && candidate.collider?.enabled !== false && !candidate.collider?.trigger)
      .sort((first, second) => compareStableIds(first.id, second.id))
      .find((candidate) => overlaps(player, candidate));
    if (obstacle) return obstacle.id;
    return firstCarriedSegmentBlocker(previousBox, currentBox);
  }

  function tryCarryMotionBodyRider(player, platform, delta) {
    const previousPose = objectPose(player);
    let previousBox = colliderBox(player);
    player.x += delta.x;
    let blockerId = carriedPlayerBlocker(player, platform, previousBox);
    if (!blockerId) {
      previousBox = colliderBox(player);
      player.y += delta.y;
      blockerId = carriedPlayerBlocker(player, platform, previousBox);
    }
    if (!blockerId && Math.abs(delta.z) > motionBodyEpsilon) {
      previousBox = colliderBox(player);
      setObjectZ(player, Number(player.z || 0) + delta.z);
      blockerId = carriedPlayerBlocker(player, platform, previousBox);
    }
    if (blockerId) {
      restoreObjectPose(player, previousPose);
      return { moved: false, blockerId };
    }
    player.grounded = true;
    return { moved: true, blockerId: null };
  }

  function emitMotionBodyCrush(state, player, blockerId, response) {
    if (state.crushBlockerId !== blockerId || state.crushResponse !== response) {
      emitMotionBody("motion-body.crushed", state, { playerId: player.id, blockerId, response });
    }
    state.crushed = true;
    state.crushBlockerId = blockerId;
    state.crushResponse = response;
  }

  function tryPositionMotionBody(object, sample, blockers) {
    const offsets = motionBodyAnchorOffsets(object);
    const targetX = Number(sample.x) - offsets.x;
    const targetY = Number(sample.y) - offsets.y;
    const previous = { x: object.x, y: object.y, z: object.z };
    object.x = targetX;
    object.y = previous.y;
    setObjectZ(object, Number(sample.z || 0));
    let blocker = firstMotionBodyBlocker(object, blockers);
    if (!blocker) {
      object.y = targetY;
      blocker = firstMotionBodyBlocker(object, blockers);
    }
    if (blocker) {
      object.x = previous.x;
      object.y = previous.y;
      setObjectZ(object, previous.z);
      return { moved: false, blocker };
    }
    return { moved: true, blocker: null };
  }

  function emitMotionBody(type, state, detail = {}) {
    emit(type, {
      mapId: state.mapId,
      objectId: state.objectId,
      pathId: state.pathId,
      progress: Number(state.progress || 0),
      speed: Number(state.speed || 0),
      direction: motionBodyDirectionLabel(state.direction),
      ...detail,
    });
  }

  function finishMotionBodyBoundary(object, state, body, geometry) {
    emitMotionBody("motion-body.completed", state, { endBehavior: body.endBehavior || "stop" });
    if ((body.endBehavior || "stop") === "stop") {
      state.completed = true;
      state.speed = 0;
      return false;
    }
    state.completed = false;
    state.blocked = false;
    state.blockerId = null;
    state.blockerProgress = null;
    if (body.endBehavior === "ping-pong") {
      state.direction *= -1;
      emitMotionBody("motion-body.reversed", state);
      return true;
    }
    state.progress = state.direction > 0 ? 0 : geometry.total;
    applyMotionBodyStateToObject(activeMap, object, state);
    return true;
  }

  function updateMotionBody(object, state, inputActionPhases, dt) {
    const body = object.motionBody;
    let rider = motionBodyRider(object, body);
    state.riderId = rider?.id ?? null;
    state.appliedDeltaX = 0;
    state.appliedDeltaY = 0;
    state.appliedDeltaZ = 0;
    state.crushed = false;
    let crushedThisUpdate = false;
    const path = activePaths.find((candidate) => candidate.id === state.pathId);
    if (!body?.enabled || !path || path.enabled === false) {
      state.speed = 0;
      state.engaged = false;
      state.blocked = false;
      state.blockerId = null;
      state.blockerProgress = null;
      object.vx = 0;
      object.vy = 0;
      state.crushBlockerId = null;
      state.crushResponse = null;
      return;
    }
    const active = body.driver === "automatic" || inputActionPhases.held.has(body.actionId);
    if (active && !state.engaged && !state.completed) emitMotionBody("motion-body.started", state, { driver: body.driver });
    if (!active && state.engaged && body.driver === "input") emitMotionBody("motion-body.released", state, { driver: body.driver });
    state.engaged = active;
    const crushStopLocked = active
      && state.crushResponse === "stop"
      && state.crushBlockerId
      && rider
      && state.blockerId === rider.id;
    if (crushStopLocked) {
      state.speed = 0;
      state.blocked = true;
      state.crushed = true;
      object.vx = 0;
      object.vy = 0;
      return;
    }
    if (!active) {
      state.blocked = false;
      state.blockerId = null;
      state.blockerProgress = null;
    }

    const targetSpeed = active && !state.completed ? Math.max(0, Number(body.maxSpeed || 0)) : 0;
    const rate = targetSpeed > state.speed ? Math.max(0, Number(body.acceleration || 0)) : Math.max(0, Number(body.deceleration || 0));
    state.speed = moveToward(Number(state.speed || 0), targetSpeed, rate * dt);
    if (state.speed <= motionBodyEpsilon || dt <= 0) {
      state.speed = state.speed <= motionBodyEpsilon ? 0 : state.speed;
      object.vx = 0;
      object.vy = 0;
      state.crushBlockerId = null;
      state.crushResponse = null;
      return;
    }

    const geometry = traversalGeometry(path);
    if (!geometry.segments.length || geometry.total <= motionBodyEpsilon) {
      state.speed = 0;
      object.vx = 0;
      object.vy = 0;
      return;
    }
    const collider = object.collider || {};
    const smallestColliderSide = Math.min(
      Math.max(1, Number(collider.width ?? object.width ?? 1)),
      Math.max(1, Number(collider.height ?? object.height ?? 1)),
    );
    const maximumStep = Math.max(1, Math.min(8, smallestColliderSide / 2));
    const blockers = motionBodyBlockers(object).filter((candidate) => candidate !== rider);
    const startX = Number(object.x || 0);
    const startY = Number(object.y || 0);
    let remaining = state.speed * dt;
    let guard = 0;
    let blocked = null;

    while (remaining > motionBodyEpsilon && guard < 512) {
      guard += 1;
      const distanceToBoundary = state.direction > 0 ? geometry.total - state.progress : state.progress;
      if (distanceToBoundary <= motionBodyEpsilon) {
        if (!finishMotionBodyBoundary(object, state, body, geometry)) break;
        continue;
      }
      const step = Math.min(maximumStep, remaining, distanceToBoundary);
      const nextProgress = state.progress + step * state.direction;
      const sample = traversalSample(geometry, nextProgress);
      const platformPose = objectPose(object);
      const movement = tryPositionMotionBody(object, sample, blockers);
      if (!movement.moved) {
        blocked = movement.blocker;
        state.speed = 0;
        if (state.blockerId !== (blocked?.id ?? null)) emitMotionBody("motion-body.blocked", state, { blockerId: blocked?.id ?? null });
        state.blocked = true;
        state.blockerId = blocked?.id ?? null;
        state.blockerProgress = state.progress;
        break;
      }
      const delta = {
        x: Number(object.x || 0) - platformPose.x,
        y: Number(object.y || 0) - platformPose.y,
        z: Number(object.z || 0) - platformPose.z,
      };
      if (rider) {
        const carry = tryCarryMotionBodyRider(rider, object, delta);
        if (!carry.moved) {
          const response = body.crushResponse === "respawn" ? "respawn" : "stop";
          crushedThisUpdate = true;
          emitMotionBodyCrush(state, rider, carry.blockerId, response);
          if (response === "stop") {
            restoreObjectPose(object, platformPose);
            state.speed = 0;
            state.blocked = true;
            state.blockerId = rider.id;
            state.blockerProgress = state.progress;
            blocked = rider;
            break;
          }
          respawn(rider, null, { cause: "motion-body-crush", objectId: object.id });
          state.riderId = null;
          rider = null;
        }
      }
      state.progress = nextProgress;
      state.appliedDeltaX += delta.x;
      state.appliedDeltaY += delta.y;
      state.appliedDeltaZ += delta.z;
      remaining -= step;
      const atBoundary = state.direction > 0
        ? geometry.total - state.progress <= motionBodyEpsilon
        : state.progress <= motionBodyEpsilon;
      if (atBoundary && !finishMotionBodyBoundary(object, state, body, geometry)) break;
    }

    if (guard >= 512 && remaining > motionBodyEpsilon) {
      state.speed = 0;
      emitMotionBody("motion-body.guard", state, { remaining });
    }
    if (blocked) {
      object.vx = 0;
      object.vy = 0;
    } else {
      state.blocked = false;
      if (state.blockerProgress != null && Math.abs(state.progress - state.blockerProgress) > maximumStep + motionBodyEpsilon) {
        state.blockerId = null;
        state.blockerProgress = null;
      }
      object.vx = dt > 0 ? (Number(object.x || 0) - startX) / dt : 0;
      object.vy = dt > 0 ? (Number(object.y || 0) - startY) / dt : 0;
    }
    const movedThisUpdate = Math.abs(state.appliedDeltaX) > motionBodyEpsilon
      || Math.abs(state.appliedDeltaY) > motionBodyEpsilon
      || Math.abs(state.appliedDeltaZ) > motionBodyEpsilon;
    if (!crushedThisUpdate && movedThisUpdate) {
      state.crushBlockerId = null;
      state.crushResponse = null;
    }
  }

  function updateMotionBodies(inputActionPhases, dt) {
    const movingObjects = objects
      .filter((object) => object?.motionBody && typeof object.motionBody === "object")
      .sort((first, second) => compareStableIds(first.id, second.id));
    for (const object of movingObjects) {
      const state = ensureMotionBodyState(activeMap, object);
      if (state) updateMotionBody(object, state, inputActionPhases, dt);
    }
  }

  function getMotionBodyStates() {
    const snapshots = [];
    for (const state of motionBodyStates.values()) {
      const map = mapById(state.mapId);
      const source = map?.objects?.find((object) => object.id === state.objectId);
      const live = state.mapId === activeMap.id ? objects.find((object) => object.id === state.objectId) : null;
      const object = live || source;
      const path = map?.traversalPaths?.find((candidate) => candidate.id === state.pathId);
      const sample = path ? traversalSample(traversalGeometry(path), state.progress) : null;
      const offsets = motionBodyAnchorOffsets(object);
      snapshots.push({
        schemaVersion: motionBodyRuntimeStateSchema,
        mapId: state.mapId,
        objectId: state.objectId,
        pathId: state.pathId,
        progress: Number(state.progress || 0),
        speed: Number(state.speed || 0),
        direction: motionBodyDirectionLabel(state.direction),
        engaged: Boolean(state.engaged),
        blocked: Boolean(state.blocked),
        blockerId: state.blockerId ?? null,
        blockerProgress: state.blockerProgress == null ? null : Number(state.blockerProgress),
        completed: Boolean(state.completed),
        riderId: state.riderId ?? null,
        appliedDeltaX: Number(state.appliedDeltaX || 0),
        appliedDeltaY: Number(state.appliedDeltaY || 0),
        appliedDeltaZ: Number(state.appliedDeltaZ || 0),
        crushed: Boolean(state.crushed),
        crushBlockerId: state.crushBlockerId ?? null,
        crushResponse: state.crushResponse ?? null,
        x: Number(live?.x ?? (sample ? sample.x - offsets.x : object?.x) ?? 0),
        y: Number(live?.y ?? (sample ? sample.y - offsets.y : object?.y) ?? 0),
        z: Number(live?.z ?? sample?.z ?? object?.z ?? 0),
      });
    }
    return snapshots.sort((first, second) => compareStableIds(runtimeKey(first.mapId, first.objectId), runtimeKey(second.mapId, second.objectId)));
  }

  function actorProgramEnabled() {
    return actorProgram?.enabled !== false && Array.isArray(actorProgram?.actors);
  }

  function actorDefinitionForObject(mapId, objectId) {
    return (actorProgram.actors || []).find((actor) => actor.mapId === mapId && actor.objectId === objectId) || null;
  }

  function actorAnchorOffsets(object) {
    return {
      x: Number(object?.groundAnchor?.offsetX ?? Number(object?.width || 0) / 2),
      y: Number(object?.groundAnchor?.offsetY ?? object?.height ?? 0),
    };
  }

  function actorAnchorPoint(object) {
    const offsets = actorAnchorOffsets(object);
    return { x: Number(object?.x || 0) + offsets.x, y: Number(object?.y || 0) + offsets.y, z: Number(object?.z || 0) };
  }

  function actorObjectCenter(object) {
    const box = colliderBox(object);
    if (box) return { x: box.x + box.width / 2, y: box.y + box.height / 2, z: box.zMin + (box.zMax - box.zMin) / 2 };
    return { x: Number(object?.x || 0) + Number(object?.width || 0) / 2, y: Number(object?.y || 0) + Number(object?.height || 0) / 2, z: Number(object?.z || 0) };
  }

  function actorNavigationNodes(map = activeMap) {
    return [...(map?.navigation?.nodes || [])].sort((first, second) => compareStableIds(first.id, second.id));
  }

  function actorNodeById(nodeId, map = activeMap) {
    return (map?.navigation?.nodes || []).find((node) => node.id === nodeId) || null;
  }

  function actorNodeDistance(first, second) {
    return Math.hypot(Number(first?.x || 0) - Number(second?.x || 0), Number(first?.y || 0) - Number(second?.y || 0), (Number(first?.z || 0) - Number(second?.z || 0)) * 32);
  }

  function actorNearestNode(point, layerId = null, map = activeMap) {
    let best = null;
    for (const node of actorNavigationNodes(map)) {
      if (layerId && node.layerId && node.layerId !== layerId) continue;
      const distance = actorNodeDistance(point, node);
      if (!best || distance < best.distance || (distance === best.distance && compareStableIds(node.id, best.node.id) < 0)) best = { node, distance };
    }
    return best?.node ?? null;
  }

  function actorFindPath(from, to, layerId = null, map = activeMap) {
    const nodes = actorNavigationNodes(map).filter((node) => !layerId || !node.layerId || node.layerId === layerId);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const start = typeof from === "string" ? byId.get(from) : actorNearestNode(from, layerId, map);
    const goal = typeof to === "string" ? byId.get(to) : actorNearestNode(to, layerId, map);
    if (!start || !goal) return { ok: false, nodeIds: [], points: [], cost: Infinity };
    const adjacency = new Map(nodes.map((node) => [node.id, []]));
    let minimumCost = 1;
    for (const link of [...(map?.navigation?.links || [])].sort((first, second) => compareStableIds(first.id, second.id))) {
      const a = byId.get(link.a);
      const b = byId.get(link.b);
      if (!a || !b || (layerId && link.layerId && link.layerId !== layerId)) continue;
      const cost = Math.max(0.01, Number(link.cost || 1));
      minimumCost = Math.min(minimumCost, cost);
      const weight = actorNodeDistance(a, b) * cost;
      adjacency.get(a.id).push({ id: b.id, weight });
      if (!link.oneWay) adjacency.get(b.id).push({ id: a.id, weight });
    }
    for (const edges of adjacency.values()) edges.sort((first, second) => compareStableIds(first.id, second.id));
    const open = new Set([start.id]);
    const cameFrom = new Map();
    const scores = new Map(nodes.map((node) => [node.id, Infinity]));
    const estimates = new Map(nodes.map((node) => [node.id, Infinity]));
    scores.set(start.id, 0);
    estimates.set(start.id, actorNodeDistance(start, goal) * minimumCost);
    while (open.size) {
      let current = null;
      for (const id of open) if (current === null || estimates.get(id) < estimates.get(current) || (estimates.get(id) === estimates.get(current) && compareStableIds(id, current) < 0)) current = id;
      if (current === goal.id) {
        const nodeIds = [current];
        while (cameFrom.has(current)) { current = cameFrom.get(current); nodeIds.push(current); }
        nodeIds.reverse();
        return { ok: true, nodeIds, points: nodeIds.map((id) => clone(byId.get(id))), cost: scores.get(goal.id) };
      }
      open.delete(current);
      for (const edge of adjacency.get(current) || []) {
        const nextScore = scores.get(current) + edge.weight;
        if (nextScore > scores.get(edge.id) || (nextScore === scores.get(edge.id) && compareStableIds(current, cameFrom.get(edge.id) ?? "\uffff") >= 0)) continue;
        cameFrom.set(edge.id, current);
        scores.set(edge.id, nextScore);
        estimates.set(edge.id, nextScore + actorNodeDistance(byId.get(edge.id), goal) * minimumCost);
        open.add(edge.id);
      }
    }
    return { ok: false, nodeIds: [], points: [], cost: Infinity };
  }

  function initialActorState(actor) {
    const map = mapById(actor.mapId);
    const object = map?.objects?.find((candidate) => candidate.id === actor.objectId);
    if (!map || !object) return null;
    const facingX = Number(actor.initialFacing?.x ?? 1);
    const facingY = Number(actor.initialFacing?.y ?? 0);
    const magnitude = Math.hypot(facingX, facingY) || 1;
    return {
      schemaVersion: actorStateSchema,
      actorId: actor.id,
      mapId: actor.mapId,
      objectId: actor.objectId,
      mode: actor.baseMode || "hold",
      previousMode: null,
      x: Number(object.x || 0),
      y: Number(object.y || 0),
      z: Number(object.z || 0),
      vx: 0,
      vy: 0,
      facingX: facingX / magnitude,
      facingY: facingY / magnitude,
      routeNodeIds: actor.baseMode === "patrol" ? [...(actor.patrolNodeIds || [])] : [],
      routeIndex: 0,
      routeDirection: 1,
      targetId: null,
      detected: false,
      memoryTicksRemaining: 0,
      repathTicksRemaining: 0,
      lastSeenX: null,
      lastSeenY: null,
      lastSeenZ: null,
      blockerId: null,
      arrived: actor.baseMode === "hold",
      revision: 0,
    };
  }

  function resetActorStates() {
    actorStates.clear();
    actorRevision = 0;
    if (!actorProgramEnabled()) return;
    for (const actor of [...(actorProgram.actors || [])].sort((first, second) => compareStableIds(first.id, second.id))) {
      const state = initialActorState(actor);
      if (state) actorStates.set(actor.id, state);
    }
  }

  function applyActorStateToObject(mapId, object) {
    const actor = actorDefinitionForObject(mapId, object.id);
    const state = actor ? actorStates.get(actor.id) : null;
    if (!state) return false;
    object.x = Number(state.x || 0);
    object.y = Number(state.y || 0);
    setObjectZ(object, Number(state.z || 0));
    object.vx = Number(state.vx || 0);
    object.vy = Number(state.vy || 0);
    object.runtimeState = state.mode;
    return true;
  }

  function actorTarget(actor) {
    const target = actor.target;
    if (!target) return null;
    if (target.kind === "player") {
      const object = objects.find((candidate) => candidate.kind === "player" && !candidate.hidden) || null;
      return object ? { id: object.id, object } : null;
    }
    if (target.kind === "object") {
      const object = objects.find((candidate) => candidate.id === target.id && !candidate.hidden) || null;
      return object ? { id: object.id, object } : null;
    }
    const targetActor = (actorProgram.actors || []).find((candidate) => candidate.id === target.id && candidate.mapId === activeMap.id);
    const object = targetActor ? objects.find((candidate) => candidate.id === targetActor.objectId && !candidate.hidden) : null;
    return object ? { id: targetActor.id, object } : null;
  }

  function actorSegmentBoxFraction(from, to, box) {
    let minimum = 0;
    let maximum = 1;
    for (const [axis, low, high] of [["x", box.x, box.x + box.width], ["y", box.y, box.y + box.height]]) {
      const delta = Number(to[axis]) - Number(from[axis]);
      if (Math.abs(delta) <= actorEpsilon) {
        if (Number(from[axis]) < low || Number(from[axis]) > high) return null;
        continue;
      }
      let first = (low - Number(from[axis])) / delta;
      let second = (high - Number(from[axis])) / delta;
      if (first > second) [first, second] = [second, first];
      minimum = Math.max(minimum, first);
      maximum = Math.min(maximum, second);
      if (maximum < minimum) return null;
    }
    return minimum >= 0 && minimum <= 1 ? minimum : null;
  }

  function actorPerception(actor, object, targetObject, state) {
    const from = actorObjectCenter(object);
    const to = actorObjectCenter(targetObject);
    const distance = actorNodeDistance(from, to);
    if (distance > Number(actor.detectionRadius || 0)) return { visible: false, blockerId: null, distance, point: to };
    const planarDistance = Math.hypot(to.x - from.x, to.y - from.y);
    if (Number(actor.fieldOfViewDegrees ?? 360) < 360 && planarDistance > actorEpsilon) {
      const directionX = (to.x - from.x) / planarDistance;
      const directionY = (to.y - from.y) / planarDistance;
      const threshold = Math.cos(Number(actor.fieldOfViewDegrees || 0) * Math.PI / 360);
      if (directionX * state.facingX + directionY * state.facingY < threshold) return { visible: false, blockerId: null, distance, point: to };
    }
    const fromBox = colliderBox(object);
    const toBox = colliderBox(targetObject);
    if (fromBox && toBox && (fromBox.zMin >= toBox.zMax || fromBox.zMax <= toBox.zMin)) return { visible: false, blockerId: null, distance, point: to };
    let nearest = null;
    for (const blocker of [...objects].sort((first, second) => compareStableIds(first.id, second.id))) {
      if (blocker === object || blocker === targetObject || blocker.hidden || !blocker.solid || blocker.collider?.enabled === false || blocker.collider?.trigger) continue;
      const box = colliderBox(blocker);
      if (!box) continue;
      const fraction = actorSegmentBoxFraction(from, to, box);
      if (fraction === null || fraction <= actorEpsilon || fraction >= 1 - actorEpsilon) continue;
      const z = from.z + (to.z - from.z) * fraction;
      if (z < box.zMin || z >= box.zMax) continue;
      if (!nearest || fraction < nearest.fraction || (fraction === nearest.fraction && compareStableIds(blocker.id, nearest.id) < 0)) nearest = { id: blocker.id, fraction };
    }
    return { visible: !nearest, blockerId: nearest?.id ?? null, distance, point: to };
  }

  function actorCutsceneActive(actor) {
    const cutscene = actor.cutscene;
    if (!cutscene) return false;
    return compareGameplayValue(gameplayVariables[cutscene.variableId], cutscene.operator || "eq", cutscene.value);
  }

  function setActorMode(actor, state, mode) {
    if (state.mode === mode) return false;
    const previousMode = state.mode;
    state.previousMode = previousMode;
    state.mode = mode;
    state.routeNodeIds = [];
    state.routeIndex = 0;
    state.routeDirection = 1;
    state.repathTicksRemaining = 0;
    state.arrived = mode === "hold";
    actorRevision += 1;
    state.revision = actorRevision;
    emit("actor.mode-changed", { mapId: state.mapId, actorId: state.actorId, objectId: state.objectId, previousMode, mode });
    return true;
  }

  function actorAtHome(actor, object) {
    const home = actorNodeById(actor.homeNodeId);
    return home ? actorNodeDistance(actorAnchorPoint(object), home) <= Number(actor.arrivalRadius || 0) + actorEpsilon : true;
  }

  function planActorPath(actor, state, object, goal) {
    const home = actorNodeById(actor.homeNodeId);
    const layerId = home?.layerId ?? null;
    const route = actorFindPath(actorAnchorPoint(object), goal, layerId);
    state.routeNodeIds = route.ok ? route.nodeIds : [];
    state.routeIndex = route.ok && route.nodeIds.length > 1 ? 1 : 0;
    state.routeDirection = 1;
    state.repathTicksRemaining = Math.max(1, Number(actor.repathTicks || 1));
    state.arrived = !route.ok || route.nodeIds.length === 0;
    return route.ok;
  }

  function planActorFlee(actor, state, object, targetPoint) {
    const home = actorNodeById(actor.homeNodeId);
    const layerId = home?.layerId ?? null;
    let best = null;
    for (const node of actorNavigationNodes().filter((candidate) => !layerId || !candidate.layerId || candidate.layerId === layerId)) {
      const route = actorFindPath(actorAnchorPoint(object), node.id, layerId);
      if (!route.ok) continue;
      const distance = actorNodeDistance(node, targetPoint);
      if (!best || distance > best.distance || (distance === best.distance && compareStableIds(node.id, best.nodeId) < 0)) best = { nodeId: node.id, distance, route };
    }
    state.routeNodeIds = best?.route?.nodeIds ?? [];
    state.routeIndex = state.routeNodeIds.length > 1 ? 1 : 0;
    state.routeDirection = 1;
    state.repathTicksRemaining = Math.max(1, Number(actor.repathTicks || 1));
    state.arrived = !best;
    return Boolean(best);
  }

  function actorRouteBehavior(actor, state) {
    return state.mode === "cutscene" ? actor.cutscene?.routeBehavior || "stop" : state.mode === "patrol" ? actor.routeBehavior || "loop" : "stop";
  }

  function advanceActorRoute(actor, state) {
    const count = state.routeNodeIds.length;
    if (!count) { state.arrived = true; return false; }
    const reachedNodeId = state.routeNodeIds[state.routeIndex] ?? null;
    emit("actor.node-reached", { mapId: state.mapId, actorId: state.actorId, objectId: state.objectId, mode: state.mode, nodeId: reachedNodeId, routeIndex: state.routeIndex });
    const behavior = actorRouteBehavior(actor, state);
    if (state.routeDirection > 0 && state.routeIndex < count - 1) state.routeIndex += 1;
    else if (state.routeDirection < 0 && state.routeIndex > 0) state.routeIndex -= 1;
    else if (behavior === "loop") state.routeIndex = state.routeDirection > 0 ? 0 : count - 1;
    else if (behavior === "ping-pong" && count > 1) { state.routeDirection *= -1; state.routeIndex += state.routeDirection; }
    else {
      state.arrived = true;
      emit("actor.arrived", { mapId: state.mapId, actorId: state.actorId, objectId: state.objectId, mode: state.mode, nodeId: reachedNodeId });
      return false;
    }
    state.arrived = false;
    return true;
  }

  function actorBlockers(object, targetObject) {
    return objects
      .filter((candidate) => candidate !== object && candidate !== targetObject && !candidate.hidden && candidate.solid && candidate.collider?.enabled !== false && !candidate.collider?.trigger)
      .sort((first, second) => compareStableIds(first.id, second.id));
  }

  function moveActorToward(actor, state, object, point, amount, targetObject) {
    const start = actorAnchorPoint(object);
    const dx = Number(point.x || 0) - start.x;
    const dy = Number(point.y || 0) - start.y;
    const dz = Number(point.z || 0) - start.z;
    const distance = Math.hypot(dx, dy, dz * 32);
    if (distance <= actorEpsilon || amount <= 0) return { moved: false, blockerId: null, distanceBefore: distance, distanceAfter: distance };
    const ratio = Math.min(1, amount / distance);
    const totalX = dx * ratio;
    const totalY = dy * ratio;
    const totalZ = dz * ratio;
    const collider = object.collider || {};
    const maximumStep = Math.max(1, Math.min(8, Math.min(Math.max(1, Number(collider.width ?? object.width ?? 1)), Math.max(1, Number(collider.height ?? object.height ?? 1))) / 2));
    const steps = Math.max(1, Math.min(512, Math.ceil(Math.hypot(totalX, totalY) / maximumStep)));
    const stepX = totalX / steps;
    const stepY = totalY / steps;
    const stepZ = totalZ / steps;
    const blockers = actorBlockers(object, targetObject);
    let blockerId = null;
    for (let index = 0; index < steps; index += 1) {
      const previousX = Number(object.x || 0);
      const previousY = Number(object.y || 0);
      const previousZ = Number(object.z || 0);
      setObjectZ(object, previousZ + stepZ);
      object.x = previousX + stepX;
      let blocker = blockers.find((candidate) => overlaps(object, candidate)) || null;
      if (blocker) { object.x = previousX; blockerId ??= blocker.id; }
      object.y = previousY + stepY;
      blocker = blockers.find((candidate) => overlaps(object, candidate)) || null;
      if (blocker) { object.y = previousY; blockerId ??= blocker.id; }
      if (object.x === previousX && object.y === previousY) {
        setObjectZ(object, previousZ);
        break;
      }
    }
    const finish = actorAnchorPoint(object);
    const movedDistance = Math.hypot(finish.x - start.x, finish.y - start.y, (finish.z - start.z) * 32);
    if (movedDistance > actorEpsilon) {
      const planar = Math.hypot(finish.x - start.x, finish.y - start.y);
      if (planar > actorEpsilon) { state.facingX = (finish.x - start.x) / planar; state.facingY = (finish.y - start.y) / planar; }
      object.vx = finish.x - start.x;
      object.vy = finish.y - start.y;
    } else { object.vx = 0; object.vy = 0; }
    return { moved: movedDistance > actorEpsilon, blockerId, distanceBefore: distance, distanceAfter: actorNodeDistance(finish, point) };
  }

  function updateActor(actor, state, object, dt) {
    if (object.hidden) { object.vx = 0; object.vy = 0; return; }
    const target = actorTarget(actor);
    const perception = target ? actorPerception(actor, object, target.object, state) : { visible: false, blockerId: null, distance: Infinity, point: null };
    if (perception.visible && !state.detected) emit("actor.detected", { mapId: state.mapId, actorId: state.actorId, objectId: state.objectId, targetId: target.id });
    if (!perception.visible && state.detected) emit("actor.lost", { mapId: state.mapId, actorId: state.actorId, objectId: state.objectId, targetId: state.targetId, blockerId: perception.blockerId });
    state.detected = Boolean(perception.visible);
    state.targetId = target?.id ?? null;
    if (perception.visible) {
      state.memoryTicksRemaining = Number(actor.memoryTicks || 0);
      state.lastSeenX = perception.point.x;
      state.lastSeenY = perception.point.y;
      state.lastSeenZ = perception.point.z;
    } else if (state.memoryTicksRemaining > 0) state.memoryTicksRemaining -= 1;
    state.repathTicksRemaining = Math.max(0, Number(state.repathTicksRemaining || 0) - 1);

    let nextMode;
    if (actorCutsceneActive(actor)) nextMode = "cutscene";
    else if (perception.visible && actor.detectionMode !== "none") nextMode = actor.detectionMode;
    else if (actor.detectionMode !== "none" && state.memoryTicksRemaining > 0 && state.lastSeenX !== null) nextMode = actor.detectionMode;
    else if (["chase", "flee", "return"].includes(state.mode) && !actorAtHome(actor, object)) nextMode = "return";
    else nextMode = actor.baseMode || "hold";
    setActorMode(actor, state, nextMode);

    const rememberedPoint = state.lastSeenX === null ? null : { x: state.lastSeenX, y: state.lastSeenY, z: state.lastSeenZ };
    if (state.mode === "hold") { state.routeNodeIds = []; state.arrived = true; }
    else if (state.mode === "patrol" && state.routeNodeIds.length === 0) { state.routeNodeIds = [...(actor.patrolNodeIds || [])]; state.routeIndex = 0; state.routeDirection = 1; state.arrived = false; }
    else if (state.mode === "cutscene" && state.routeNodeIds.length === 0) { state.routeNodeIds = [...(actor.cutscene?.nodeIds || [])]; state.routeIndex = 0; state.routeDirection = 1; state.arrived = false; }
    else if (state.mode === "chase") {
      const chasePoint = perception.visible ? perception.point : rememberedPoint;
      if (chasePoint && perception.distance <= Number(actor.stopDistance || 0) && perception.visible) { state.routeNodeIds = []; state.arrived = true; }
      else if (chasePoint && (state.repathTicksRemaining <= 0 || state.routeNodeIds.length === 0)) planActorPath(actor, state, object, chasePoint);
    } else if (state.mode === "flee") {
      const fleePoint = perception.visible ? perception.point : rememberedPoint;
      if (fleePoint && actorNodeDistance(actorAnchorPoint(object), fleePoint) >= Number(actor.safeDistance || 0)) { state.routeNodeIds = []; state.arrived = true; }
      else if (fleePoint && (state.repathTicksRemaining <= 0 || state.routeNodeIds.length === 0)) planActorFlee(actor, state, object, fleePoint);
    } else if (state.mode === "return" && (state.repathTicksRemaining <= 0 || state.routeNodeIds.length === 0)) planActorPath(actor, state, object, actor.homeNodeId);

    const startX = Number(object.x || 0);
    const startY = Number(object.y || 0);
    const startZ = Number(object.z || 0);
    let remaining = Math.max(0, Number(actor.speed || 0) * dt);
    let guard = 0;
    let blockerId = null;
    while (remaining > actorEpsilon && !state.arrived && guard < 64) {
      guard += 1;
      const nodeId = state.routeNodeIds[state.routeIndex];
      const point = actorNodeById(nodeId);
      if (!point) { state.arrived = true; break; }
      const before = actorNodeDistance(actorAnchorPoint(object), point);
      if (before <= Number(actor.arrivalRadius || 0) + actorEpsilon) {
        if (!advanceActorRoute(actor, state)) break;
        continue;
      }
      const movement = moveActorToward(actor, state, object, point, remaining, target?.object ?? null);
      blockerId = movement.blockerId;
      const progressed = Math.max(0, movement.distanceBefore - movement.distanceAfter);
      remaining = Math.max(0, remaining - progressed);
      if (!movement.moved || blockerId) break;
      if (movement.distanceAfter <= Number(actor.arrivalRadius || 0) + actorEpsilon) {
        if (!advanceActorRoute(actor, state)) break;
      } else remaining = 0;
    }
    const priorBlockerId = state.blockerId;
    state.blockerId = blockerId;
    if (blockerId && blockerId !== priorBlockerId) emit("actor.blocked", { mapId: state.mapId, actorId: state.actorId, objectId: state.objectId, mode: state.mode, blockerId });
    state.x = Number(object.x || 0);
    state.y = Number(object.y || 0);
    state.z = Number(object.z || 0);
    state.vx = dt > 0 ? (state.x - startX) / dt : 0;
    state.vy = dt > 0 ? (state.y - startY) / dt : 0;
    object.vx = state.vx;
    object.vy = state.vy;
    object.runtimeState = state.mode;
    if (state.x !== startX || state.y !== startY || state.z !== startZ || blockerId !== priorBlockerId) {
      actorRevision += 1;
      state.revision = actorRevision;
    }
  }

  function updateActors(dt) {
    if (!actorProgramEnabled()) return;
    for (const actor of [...(actorProgram.actors || [])].filter((candidate) => candidate.mapId === activeMap.id).sort((first, second) => compareStableIds(first.id, second.id))) {
      const state = actorStates.get(actor.id);
      const object = objects.find((candidate) => candidate.id === actor.objectId);
      if (state && object) updateActor(actor, state, object, dt);
    }
  }

  function getActorStates() {
    return [...actorStates.values()].map((state) => {
      const live = state.mapId === activeMap.id ? objects.find((object) => object.id === state.objectId) : null;
      return {
        ...clone(state),
        x: Number(live?.x ?? state.x ?? 0),
        y: Number(live?.y ?? state.y ?? 0),
        z: Number(live?.z ?? state.z ?? 0),
        vx: Number(live?.vx ?? state.vx ?? 0),
        vy: Number(live?.vy ?? state.vy ?? 0),
      };
    }).sort((first, second) => compareStableIds(first.actorId, second.actorId));
  }

  function combatProgramEnabled() {
    return combatProgram?.enabled !== false && Array.isArray(combatProgram?.actors) && Array.isArray(combatProgram?.emitters);
  }

  function combatActorForObject(mapId, objectId) {
    return (combatProgram.actors || []).find((actor) => actor.mapId === mapId && actor.objectId === objectId) || null;
  }

  function combatTeamTargetIds(teamId) {
    const team = (combatProgram.teams || []).find((candidate) => candidate.id === teamId);
    return new Set(team?.targetTeamIds || []);
  }

  function combatObjectCenter(object) {
    const box = colliderBox(object);
    if (box) return { x: box.x + box.width / 2, y: box.y + box.height / 2, z: box.zMin, zHeight: Math.max(0.001, box.zMax - box.zMin) };
    return {
      x: Number(object?.x || 0) + Number(object?.width || 0) / 2,
      y: Number(object?.y || 0) + Number(object?.height || 0) / 2,
      z: Number(object?.z || 0),
      zHeight: Math.max(0.001, Number(object?.collisionHeight || 1)),
    };
  }

  function resetCombatState() {
    combatHealthStates.clear();
    combatEmitterStates.clear();
    combatProjectileSlots.length = 0;
    combatRevision = 0;
    combatSequence = 0;
    if (!combatProgramEnabled()) return;
    for (const actor of [...(combatProgram.actors || [])].sort((first, second) => compareStableIds(first.id, second.id))) {
      const maxHp = Math.max(1, Math.trunc(Number(actor.maxHp || 1)));
      const hp = Math.max(0, Math.min(maxHp, Math.trunc(Number(actor.initialHp ?? maxHp))));
      combatHealthStates.set(actor.id, {
        actorId: actor.id,
        mapId: actor.mapId,
        objectId: actor.objectId,
        teamId: actor.teamId,
        hp,
        maxHp,
        invulnerabilityTicks: 0,
        depleted: hp <= 0,
      });
    }
    const globalLimit = Math.max(1, Math.min(512, Math.trunc(Number(combatProgram.maxProjectiles || 1))));
    for (const emitter of [...(combatProgram.emitters || [])].sort((first, second) => compareStableIds(first.id, second.id))) {
      combatEmitterStates.set(emitter.id, {
        emitterId: emitter.id,
        mapId: emitter.mapId,
        cooldownTicks: 0,
        lastDirectionX: Number(emitter.aim?.x ?? 1),
        lastDirectionY: Number(emitter.aim?.y ?? 0),
        lastTargetActorId: null,
        shotsFired: 0,
        overflowCount: 0,
      });
      const poolSize = Math.max(1, Math.min(128, Math.trunc(Number(emitter.poolSize || 1)), globalLimit - combatProjectileSlots.length));
      for (let index = 0; index < poolSize && combatProjectileSlots.length < globalLimit; index += 1) {
        combatProjectileSlots.push({ slotId: `${emitter.id}:${String(index).padStart(3, "0")}`, emitterId: emitter.id, slotIndex: index, active: false });
      }
    }
  }

  function applyCombatStateToObject(mapId, object) {
    const actor = combatActorForObject(mapId, object?.id);
    const state = actor ? combatHealthStates.get(actor.id) : null;
    if (!actor || !state || !state.depleted) return;
    if (actor.deathBehavior === "hide") {
      object.hidden = true;
      if (object.collider) object.collider.enabled = false;
    }
  }

  function deactivateCombatProjectile(slot, reason, detail = {}) {
    if (!slot?.active) return false;
    const snapshot = { mapId: slot.mapId, projectileId: slot.projectileId, emitterId: slot.emitterId, ownerObjectId: slot.ownerObjectId, reason, ...detail };
    slot.active = false;
    slot.hitActorIds = [];
    combatRevision += 1;
    emit("projectile.expired", snapshot);
    return true;
  }

  function clearActiveProjectiles(mapId, reason = "map-change") {
    for (const slot of combatProjectileSlots) if (slot.active && (!mapId || slot.mapId === mapId)) deactivateCombatProjectile(slot, reason);
  }

  function normalizeCombatDirection(x, y, fallbackX = 1, fallbackY = 0) {
    let dx = Number(x || 0);
    let dy = Number(y || 0);
    let length = Math.hypot(dx, dy);
    if (length <= combatEpsilon) {
      dx = Number(fallbackX || 0);
      dy = Number(fallbackY || 0);
      length = Math.hypot(dx, dy);
    }
    if (length <= combatEpsilon) return { x: 1, y: 0 };
    return { x: dx / length, y: dy / length };
  }

  function combatTargetCandidates(emitter, ownerCenter) {
    const targetTeams = combatTeamTargetIds(emitter.teamId);
    return (combatProgram.actors || [])
      .filter((actor) => actor.mapId === activeMap.id && targetTeams.has(actor.teamId))
      .map((actor) => ({ actor, state: combatHealthStates.get(actor.id), object: objects.find((object) => object.id === actor.objectId) }))
      .filter((entry) => entry.state && !entry.state.depleted && entry.object && !entry.object.hidden && entry.object.collider?.enabled !== false)
      .map((entry) => {
        const center = combatObjectCenter(entry.object);
        const distanceSquared = (center.x - ownerCenter.x) ** 2 + (center.y - ownerCenter.y) ** 2;
        return { ...entry, center, distanceSquared };
      })
      .filter((entry) => entry.distanceSquared <= Number(emitter.aim?.range || 1_024) ** 2 + combatEpsilon)
      .sort((first, second) => first.distanceSquared - second.distanceSquared || compareStableIds(first.actor.id, second.actor.id));
  }

  function combatAimDirection(emitter, state, owner, movementDirection) {
    const ownerCenter = combatObjectCenter(owner);
    let targetActorId = null;
    let direction;
    if (emitter.aim?.mode === "nearest") {
      const target = combatTargetCandidates(emitter, ownerCenter)[0] || null;
      if (target) {
        targetActorId = target.actor.id;
        direction = normalizeCombatDirection(target.center.x - ownerCenter.x, target.center.y - ownerCenter.y, state.lastDirectionX, state.lastDirectionY);
      }
    } else if (emitter.aim?.mode === "movement") {
      direction = normalizeCombatDirection(
        movementDirection?.x || owner.vx,
        movementDirection?.y || owner.vy,
        state.lastDirectionX || emitter.aim?.x,
        state.lastDirectionY || emitter.aim?.y,
      );
    }
    direction ||= normalizeCombatDirection(emitter.aim?.x, emitter.aim?.y, state.lastDirectionX, state.lastDirectionY);
    state.lastDirectionX = direction.x;
    state.lastDirectionY = direction.y;
    state.lastTargetActorId = targetActorId;
    return { direction, targetActorId, ownerCenter };
  }

  function spawnCombatProjectile(emitter, movementDirection) {
    const state = combatEmitterStates.get(emitter.id);
    const owner = objects.find((object) => object.id === emitter.ownerObjectId);
    if (!state || !owner || owner.hidden || owner.active === false) return false;
    const ownerActor = combatActorForObject(activeMap.id, owner.id);
    if (ownerActor && combatHealthStates.get(ownerActor.id)?.depleted) return false;
    const activeCount = combatProjectileSlots.filter((slot) => slot.active).length;
    const slot = combatProjectileSlots.find((candidate) => candidate.emitterId === emitter.id && !candidate.active);
    const globalLimit = Math.max(1, Math.min(512, Math.trunc(Number(combatProgram.maxProjectiles || 1))));
    if (!slot || activeCount >= globalLimit) {
      state.cooldownTicks = Math.max(1, Math.trunc(Number(emitter.cooldownTicks || 1)));
      state.overflowCount += 1;
      combatRevision += 1;
      emit("projectile.overflow", { mapId: activeMap.id, emitterId: emitter.id, ownerObjectId: owner.id, activeCount, maxProjectiles: globalLimit, poolSize: Number(emitter.poolSize || 0) });
      return false;
    }
    const aim = combatAimDirection(emitter, state, owner, movementDirection);
    const projectile = emitter.projectile || {};
    const muzzle = emitter.muzzle || {};
    combatSequence += 1;
    Object.assign(slot, {
      active: true,
      projectileId: `${emitter.id}:shot:${combatSequence}`,
      sequence: combatSequence,
      mapId: activeMap.id,
      ownerObjectId: owner.id,
      teamId: emitter.teamId,
      targetActorId: aim.targetActorId,
      x: aim.ownerCenter.x + Number(muzzle.offsetX || 0) + aim.direction.x * Number(muzzle.distance || 0),
      y: aim.ownerCenter.y + Number(muzzle.offsetY || 0) + aim.direction.y * Number(muzzle.distance || 0),
      z: aim.ownerCenter.z,
      vx: aim.direction.x * Number(projectile.speed || 0),
      vy: aim.direction.y * Number(projectile.speed || 0),
      width: Math.max(0.25, Number(projectile.width || 1)),
      height: Math.max(0.25, Number(projectile.height || 1)),
      zHeight: Math.max(0.001, Number(projectile.zHeight || 1)),
      remainingTicks: Math.max(1, Math.trunc(Number(projectile.lifetimeTicks || 1))),
      damage: Math.max(1, Math.trunc(Number(projectile.damage || 1))),
      hitsRemaining: Math.max(1, Math.trunc(Number(projectile.pierce || 0)) + 1),
      worldCollision: projectile.worldCollision !== false,
      color: String(projectile.color || "#f4f4f0"),
      opacity: Math.max(0, Math.min(1, Number(projectile.opacity ?? 1))),
      hitActorIds: [],
    });
    state.cooldownTicks = Math.max(1, Math.trunc(Number(emitter.cooldownTicks || 1)));
    state.shotsFired += 1;
    combatRevision += 1;
    emit("projectile.spawned", { mapId: activeMap.id, projectileId: slot.projectileId, emitterId: emitter.id, ownerObjectId: owner.id, targetActorId: aim.targetActorId, sequence: slot.sequence });
    return true;
  }

  function sweptCombatFraction(startX, startY, endX, endY, box, halfWidth, halfHeight) {
    const minX = Number(box.x) - halfWidth;
    const maxX = Number(box.x) + Number(box.width) + halfWidth;
    const minY = Number(box.y) - halfHeight;
    const maxY = Number(box.y) + Number(box.height) + halfHeight;
    const dx = endX - startX;
    const dy = endY - startY;
    let entry = 0;
    let exit = 1;
    for (const axis of [{ start: startX, delta: dx, min: minX, max: maxX }, { start: startY, delta: dy, min: minY, max: maxY }]) {
      if (Math.abs(axis.delta) <= combatEpsilon) {
        if (axis.start < axis.min || axis.start > axis.max) return null;
        continue;
      }
      const first = (axis.min - axis.start) / axis.delta;
      const second = (axis.max - axis.start) / axis.delta;
      entry = Math.max(entry, Math.min(first, second));
      exit = Math.min(exit, Math.max(first, second));
      if (entry - exit > combatEpsilon) return null;
    }
    if (exit < -combatEpsilon || entry > 1 + combatEpsilon) return null;
    return Math.max(0, Math.min(1, entry));
  }

  function combatProjectileCandidates(slot, endX, endY) {
    const candidates = [];
    const halfWidth = slot.width / 2;
    const halfHeight = slot.height / 2;
    const zMin = Number(slot.z || 0);
    const zMax = zMin + Number(slot.zHeight || 1);
    const targetTeams = combatTeamTargetIds(slot.teamId);
    const targetObjectIds = new Set();
    for (const actor of combatProgram.actors || []) {
      if (actor.mapId !== activeMap.id || !targetTeams.has(actor.teamId) || slot.hitActorIds.includes(actor.id)) continue;
      const state = combatHealthStates.get(actor.id);
      const object = objects.find((candidate) => candidate.id === actor.objectId);
      if (!state || state.depleted || !object || object.hidden || object.collider?.enabled === false || object.id === slot.ownerObjectId) continue;
      const box = colliderBox(object);
      if (!box || !(zMin < box.zMax && zMax > box.zMin)) continue;
      const fraction = sweptCombatFraction(slot.x, slot.y, endX, endY, box, halfWidth, halfHeight);
      if (fraction == null) continue;
      targetObjectIds.add(object.id);
      candidates.push({ type: "actor", fraction, id: actor.id, actor, state, object });
    }
    if (slot.worldCollision) {
      for (const object of objects) {
        if (object.id === slot.ownerObjectId || object.hidden || !object.solid || object.collider?.enabled === false || object.collider?.trigger || targetObjectIds.has(object.id)) continue;
        const box = colliderBox(object);
        if (!box || !(zMin < box.zMax && zMax > box.zMin)) continue;
        const fraction = sweptCombatFraction(slot.x, slot.y, endX, endY, box, halfWidth, halfHeight);
        if (fraction != null) candidates.push({ type: "world", fraction, id: object.id, object });
      }
    }
    return candidates.sort((first, second) => first.fraction - second.fraction || (first.type === second.type ? 0 : first.type === "actor" ? -1 : 1) || compareStableIds(first.id, second.id));
  }

  function resolveCombatActorHit(slot, candidate) {
    const actor = candidate.actor;
    const state = candidate.state;
    const previousHp = state.hp;
    const immune = state.invulnerabilityTicks > 0 || state.depleted;
    const damageApplied = immune ? 0 : Math.min(previousHp, Math.max(1, Math.trunc(Number(slot.damage || 1))));
    emit("projectile.hit", { mapId: activeMap.id, projectileId: slot.projectileId, emitterId: slot.emitterId, ownerObjectId: slot.ownerObjectId, actorId: actor.id, objectId: actor.objectId, damage: Number(slot.damage || 0), damageApplied, hpBefore: previousHp, hpAfter: previousHp - damageApplied });
    if (immune) {
      emit("health.immune", { mapId: activeMap.id, actorId: actor.id, objectId: actor.objectId, projectileId: slot.projectileId, hp: previousHp, invulnerabilityTicks: state.invulnerabilityTicks });
      return;
    }
    state.hp = Math.max(0, previousHp - damageApplied);
    state.invulnerabilityTicks = Math.max(0, Math.trunc(Number(actor.invulnerabilityTicks || 0)));
    combatRevision += 1;
    emit("health.changed", { mapId: activeMap.id, actorId: actor.id, objectId: actor.objectId, projectileId: slot.projectileId, previousHp, hp: state.hp, maxHp: state.maxHp, delta: -damageApplied });
    if (state.hp > 0 || state.depleted) return;
    state.depleted = true;
    const liveObject = objects.find((object) => object.id === actor.objectId) || null;
    emit("health.depleted", { mapId: activeMap.id, actorId: actor.id, objectId: actor.objectId, projectileId: slot.projectileId, deathBehavior: actor.deathBehavior || "event-only" });
    if (actor.deathBehavior === "hide" && liveObject) {
      liveObject.hidden = true;
      if (liveObject.collider) liveObject.collider.enabled = false;
    } else if (actor.deathBehavior === "respawn" && liveObject?.kind === "player") {
      respawn(liveObject, null, { cause: "combat", objectId: actor.objectId });
      state.hp = state.maxHp;
      state.depleted = false;
      state.invulnerabilityTicks = Math.max(1, Math.trunc(Number(actor.invulnerabilityTicks || 0)));
      emit("health.respawned", { mapId: activeMap.id, actorId: actor.id, objectId: actor.objectId, hp: state.hp, maxHp: state.maxHp });
    }
  }

  function updateCombatProjectile(slot, dt, tickDelta) {
    if (!slot.active || slot.mapId !== activeMap.id) return;
    const startX = Number(slot.x || 0);
    const startY = Number(slot.y || 0);
    const endX = startX + Number(slot.vx || 0) * dt;
    const endY = startY + Number(slot.vy || 0) * dt;
    const candidates = combatProjectileCandidates(slot, endX, endY);
    for (const candidate of candidates) {
      if (!slot.active) break;
      const hitX = startX + (endX - startX) * candidate.fraction;
      const hitY = startY + (endY - startY) * candidate.fraction;
      if (candidate.type === "world") {
        slot.x = hitX;
        slot.y = hitY;
        deactivateCombatProjectile(slot, "world-hit", { objectId: candidate.object.id });
        break;
      }
      slot.x = hitX;
      slot.y = hitY;
      resolveCombatActorHit(slot, candidate);
      slot.hitActorIds.push(candidate.actor.id);
      slot.hitActorIds.sort(compareStableIds);
      slot.hitsRemaining -= 1;
      if (slot.hitsRemaining <= 0) {
        deactivateCombatProjectile(slot, "actor-hit", { actorId: candidate.actor.id, objectId: candidate.object.id });
        break;
      }
    }
    if (!slot.active) return;
    slot.x = endX;
    slot.y = endY;
    slot.remainingTicks = Math.max(0, Math.trunc(Number(slot.remainingTicks || 0)) - tickDelta);
    const width = Number(activeMap.width ?? project.width ?? 0);
    const height = Number(activeMap.height ?? project.height ?? 0);
    if (slot.x < -slot.width || slot.y < -slot.height || slot.x > width + slot.width || slot.y > height + slot.height) deactivateCombatProjectile(slot, "bounds");
    else if (slot.remainingTicks <= 0) deactivateCombatProjectile(slot, "lifetime");
  }

  function updateCombat(inputActionPhases, dt, movementDirection) {
    if (!combatProgramEnabled()) return;
    const tickDelta = dt > 0 ? Math.max(1, Math.round(dt * 60)) : 0;
    for (const state of combatHealthStates.values()) if (state.mapId === activeMap.id) state.invulnerabilityTicks = Math.max(0, Number(state.invulnerabilityTicks || 0) - tickDelta);
    for (const state of combatEmitterStates.values()) if (state.mapId === activeMap.id) state.cooldownTicks = Math.max(0, Number(state.cooldownTicks || 0) - tickDelta);
    const emitters = (combatProgram.emitters || []).filter((emitter) => emitter.mapId === activeMap.id).sort((first, second) => compareStableIds(first.id, second.id));
    for (const emitter of emitters) {
      const state = combatEmitterStates.get(emitter.id);
      if (!state || state.cooldownTicks > 0) continue;
      const fire = emitter.trigger === "automatic" || emitter.trigger === "held" && inputActionPhases.held.has(emitter.actionId) || emitter.trigger === "pressed" && inputActionPhases.pressed.has(emitter.actionId);
      if (fire) spawnCombatProjectile(emitter, movementDirection);
    }
    for (const slot of [...combatProjectileSlots].filter((candidate) => candidate.active && candidate.mapId === activeMap.id).sort((first, second) => Number(first.sequence || 0) - Number(second.sequence || 0) || compareStableIds(first.slotId, second.slotId))) updateCombatProjectile(slot, dt, tickDelta);
  }

  function getCombatState() {
    const health = [...combatHealthStates.values()].map((state) => ({
      actorId: state.actorId,
      mapId: state.mapId,
      objectId: state.objectId,
      teamId: state.teamId,
      hp: Number(state.hp || 0),
      maxHp: Number(state.maxHp || 0),
      invulnerabilityTicks: Number(state.invulnerabilityTicks || 0),
      depleted: Boolean(state.depleted),
    })).sort((first, second) => compareStableIds(first.actorId, second.actorId));
    const emitters = [...combatEmitterStates.values()].map((state) => ({
      emitterId: state.emitterId,
      mapId: state.mapId,
      cooldownTicks: Number(state.cooldownTicks || 0),
      lastDirectionX: Number(state.lastDirectionX || 0),
      lastDirectionY: Number(state.lastDirectionY || 0),
      lastTargetActorId: state.lastTargetActorId ?? null,
      shotsFired: Number(state.shotsFired || 0),
      overflowCount: Number(state.overflowCount || 0),
      activeProjectiles: combatProjectileSlots.filter((slot) => slot.active && slot.emitterId === state.emitterId).length,
    })).sort((first, second) => compareStableIds(first.emitterId, second.emitterId));
    const projectiles = combatProjectileSlots.filter((slot) => slot.active).map((slot) => ({
      slotId: slot.slotId,
      projectileId: slot.projectileId,
      emitterId: slot.emitterId,
      sequence: Number(slot.sequence || 0),
      mapId: slot.mapId,
      ownerObjectId: slot.ownerObjectId,
      teamId: slot.teamId,
      targetActorId: slot.targetActorId ?? null,
      x: Number(slot.x || 0),
      y: Number(slot.y || 0),
      z: Number(slot.z || 0),
      vx: Number(slot.vx || 0),
      vy: Number(slot.vy || 0),
      width: Number(slot.width || 0),
      height: Number(slot.height || 0),
      zHeight: Number(slot.zHeight || 0),
      remainingTicks: Number(slot.remainingTicks || 0),
      damage: Number(slot.damage || 0),
      hitsRemaining: Number(slot.hitsRemaining || 0),
      worldCollision: Boolean(slot.worldCollision),
      color: String(slot.color || ""),
      opacity: Number(slot.opacity ?? 1),
      hitActorIds: [...(slot.hitActorIds || [])].sort(compareStableIds),
    })).sort((first, second) => first.sequence - second.sequence || compareStableIds(first.slotId, second.slotId));
    return {
      schemaVersion: combatStateSchema,
      enabled: combatProgramEnabled(),
      revision: combatRevision,
      sequence: combatSequence,
      maxProjectiles: Math.max(1, Math.min(512, Math.trunc(Number(combatProgram.maxProjectiles || 1)))),
      poolCapacity: combatProjectileSlots.length,
      activeProjectileCount: projectiles.length,
      health,
      emitters,
      projectiles,
    };
  }

  function positionAtSpawn(player, spawnId) {
    const spawn = objects.find((object) => object.kind === "spawn" && (!spawnId || object.id === spawnId)) || objects.find((object) => object.kind === "spawn");
    if (!spawn) return false;
    player.x = spawn.x + (spawn.width - player.width) / 2;
    player.y = spawn.y + spawn.height - player.height;
    setObjectZ(player, spawn.supportZ ?? spawn.z ?? 0);
    player.vx = 0;
    player.vy = 0;
    player.grounded = false;
    clearGroundContact(player);
    clearElevationTransition(player, { emit: false });
    player.jumpHeld = false;
    player.coyoteTicksRemaining = 0;
    player.jumpBufferTicksRemaining = 0;
    return true;
  }

  function prepareRuntimeObject(source, mapId) {
    return {
      ...clone(source),
      vx: 0,
      vy: 0,
      grounded: false,
      groundChainId: null,
      groundSegmentId: null,
      groundNormalX: 0,
      groundNormalY: -1,
      slopeSliding: false,
      elevationTransitionId: null,
      elevationSegmentId: null,
      elevationProgress: 0,
      elevationSupportZ: Number(source.supportZ ?? source.z ?? 0),
      jumpHeld: false,
      coyoteTicksRemaining: 0,
      jumpBufferTicksRemaining: 0,
      collected: collectedIds.has(mapId + ":" + source.id),
    };
  }

  function loadMap(id, spawnId) {
    const target = mapById(id);
    if (!target) return false;
    if (activeMap?.id && activeMap.id !== target.id) clearActiveProjectiles(activeMap.id, "map-change");
    activeMap = target;
    activeWorldStreamRuntime = compileWorldStreamRuntime(project, target, compileTileRuntimeProgram);
    const worldComposition = activeWorldStreamRuntime?.present ? activeWorldStreamRuntime.compose(0) : null;
    activeWorldStreamState = worldComposition?.state ?? {
      schemaVersion: "looplab-world-stream-runtime/v1",
      present: false,
      hostMapId: target.id,
    };
    objects = (worldComposition?.objects ?? target.objects ?? []).map((object) => prepareRuntimeObject(object, target.id));
    activePaths = clone(target.traversalPaths || []);
    activeCollisionGeometry = worldComposition?.collisionGeometry
      ?? (target.collisionGeometry && typeof target.collisionGeometry === "object" ? clone(target.collisionGeometry) : null);
    activeCollisionSegments = buildCollisionSegments(activeCollisionGeometry);
    activeElevationTransitions = target.elevationTransitions && typeof target.elevationTransitions === "object" ? clone(target.elevationTransitions) : null;
    activeElevationSegments = buildElevationSegments(activeElevationTransitions);
    activeTileRuntime = worldComposition?.tileRuntime ?? compileTileRuntimeProgram(target.tileProgram, target);
    for (const object of objects) applyObjectOverride(object, objectOverrides.get(runtimeKey(target.id, object.id)));
    for (const path of activePaths) applyPathOverride(path, pathOverrides.get(runtimeKey(target.id, path.id)));
    for (const object of objects) applyCombatStateToObject(target.id, object);
    for (const object of objects) {
      if (!object?.motionBody || typeof object.motionBody !== "object") continue;
      const state = ensureMotionBodyState(target, object);
      if (state) applyMotionBodyStateToObject(target, object, state);
    }
    for (const object of objects) applyActorStateToObject(target.id, object);
    const player = objects.find((object) => object.kind === "player");
    activeTraversal = null;
    activeChoicePageId = null;
    pendingChoiceId = null;
    completedMapRules.clear();
    overlapContacts.clear();
    if (player && spawnId) positionAtSpawn(player, spawnId);
    won = false;
    gameplayRevision += 1;
    emit("map.changed", { mapId: target.id, mapName: target.name, transition: "instant" });
    return true;
  }

  function refreshWorldStreamWindow(player) {
    if (!player || !activeWorldStreamRuntime?.present) return false;
    const previousOrdinal = Number(activeWorldStreamState?.currentOrdinal ?? 0);
    const previousWindow = (activeWorldStreamState?.residentInstanceIds ?? []).join("|");
    const ordinal = activeWorldStreamRuntime.ordinalForPosition(
      Number(player.x || 0) + Number(player.width || 0) / 2,
      Number(player.y || 0) + Number(player.height || 0) / 2,
    );
    const composition = activeWorldStreamRuntime.compose(ordinal);
    activeWorldStreamState = composition.state;
    const nextWindow = (activeWorldStreamState.residentInstanceIds ?? []).join("|");
    if (previousOrdinal === ordinal && previousWindow === nextWindow) return false;

    const residentObjects = (composition.objects ?? [])
      .filter((object) => object.kind !== "player")
      .map((object) => prepareRuntimeObject(object, activeMap.id));
    objects = [player, ...residentObjects];
    activeCollisionGeometry = composition.collisionGeometry;
    activeCollisionSegments = buildCollisionSegments(activeCollisionGeometry);
    activeTileRuntime = composition.tileRuntime;
    for (const object of residentObjects) applyObjectOverride(object, objectOverrides.get(runtimeKey(activeMap.id, object.id)));
    for (const object of residentObjects) applyCombatStateToObject(activeMap.id, object);
    for (const object of residentObjects) applyActorStateToObject(activeMap.id, object);
    gameplayRevision += 1;
    emit("world.chunk.changed", {
      mapId: activeMap.id,
      fromOrdinal: previousOrdinal,
      toOrdinal: ordinal,
      currentInstanceId: activeWorldStreamState.currentInstanceId,
      residentInstanceIds: clone(activeWorldStreamState.residentInstanceIds),
    });
    return true;
  }

  function reset() {
    clearInputState();
    collectedIds.clear();
    completedRunRules.clear();
    completedMapRules.clear();
    objectOverrides.clear();
    pathOverrides.clear();
    resetMotionBodyStates();
    resetCombatState();
    resetActorStates();
    overlapContacts.clear();
    resetGameplayVariables();
    interactionHeld = false;
    portalCooldown = 0;
    activeTraversal = null;
    won = false;
    gameplayRevision = 0;
    events.length = 0;
    loadMap(initialMapId, null);
    if (gameplayProgram.initialChoicePageId) openChoicePage(gameplayProgram.initialChoicePageId, "runtime.reset");
  }

  function respawn(player, spawnId, detail = {}) {
    activeTraversal = null;
    const fromX = Number(player.x || 0);
    const fromY = Number(player.y || 0);
    const fromZ = Number(player.z || 0);
    const source = activeMap.objects.find((object) => object.id === player.id);
    if (!positionAtSpawn(player, spawnId)) {
      player.x = source?.x ?? 0;
      player.y = source?.y ?? 0;
      setObjectZ(player, source?.supportZ ?? source?.z ?? 0);
      player.vx = 0;
      player.vy = 0;
    }
    emit("player.respawned", {
      mapId: activeMap.id,
      cause: detail.cause || "runtime",
      ...(detail.objectId ? { objectId: detail.objectId } : {}),
      ...(detail.ruleId ? { ruleId: detail.ruleId } : {}),
      ...(spawnId ? { spawnId } : {}),
      fromX,
      fromY,
      fromZ,
      toX: Number(player.x || 0),
      toY: Number(player.y || 0),
      toZ: Number(player.z || 0),
    });
  }
  function inputActive(...codes) {
    return codes.some((code) => inputs.has(code));
  }

  function inputCodesForSource(source) {
    const requested = String(source ?? "").trim();
    if (!requested) return [];
    const action = (project.inputActions || []).find((candidate) => candidate.id === requested);
    if (!action) return [inputActionAliases[requested] || requested];
    const bindings = (action.bindings || []).filter((candidate) => typeof candidate === "string" && candidate.trim());
    const binding = bindings.find((candidate) => playerInputCodes.has(candidate)) || bindings[0];
    const resolved = inputActionAliases[action.id] || binding || requested;
    return resolved === requested ? [requested] : [requested, resolved];
  }

  function solidObjects(player) {
    return [
      ...objects.filter((object) => object !== player && !object.hidden && object.solid && object.collider?.enabled !== false && !object.collider?.trigger),
      ...activeTileRuntime.collisionObjects,
    ];
  }

  function rangesOverlap(firstMin, firstMax, secondMin, secondMax) {
    return firstMin < secondMax && firstMax > secondMin;
  }

  function resolveHorizontal(player, solids, previousBox) {
    const playerCollider = player.collider || { offsetX: 0, offsetY: 0, width: player.width, height: player.height };
    const currentBox = colliderBox(player);
    if (!currentBox || !previousBox) return;
    let resolvedX = null;
    let nearestDistance = Infinity;
    for (const solid of solids) {
      if (solid.collider?.oneWay) continue;
      const box = colliderBox(solid);
      if (!box) continue;
      const zOverlap = currentBox.zMin < box.zMax && currentBox.zMax > box.zMin;
      const verticalOverlap = rangesOverlap(currentBox.y, currentBox.y + currentBox.height, box.y, box.y + box.height);
      if (!zOverlap || !verticalOverlap) continue;
      let candidate = null;
      let distance = Infinity;
      if (player.vx > 0) {
        const crossed = previousBox.x + previousBox.width <= box.x && currentBox.x + currentBox.width >= box.x;
        const penetrated = currentBox.x < box.x + box.width && currentBox.x + currentBox.width > box.x;
        if (crossed || penetrated) {
          candidate = box.x - Number(playerCollider.offsetX || 0) - Number(playerCollider.width ?? player.width);
          distance = Math.max(0, box.x - (previousBox.x + previousBox.width));
        }
      } else if (player.vx < 0) {
        const crossed = previousBox.x >= box.x + box.width && currentBox.x <= box.x + box.width;
        const penetrated = currentBox.x < box.x + box.width && currentBox.x + currentBox.width > box.x;
        if (crossed || penetrated) {
          candidate = box.x + box.width - Number(playerCollider.offsetX || 0);
          distance = Math.max(0, previousBox.x - (box.x + box.width));
        }
      }
      if (candidate != null && distance < nearestDistance) {
        nearestDistance = distance;
        resolvedX = candidate;
      }
    }
    if (resolvedX != null) player.x = resolvedX;
  }

  function resolveVerticalTopdown(player, solids, previousBox) {
    const playerCollider = player.collider || { offsetX: 0, offsetY: 0, width: player.width, height: player.height };
    const currentBox = colliderBox(player);
    if (!currentBox || !previousBox) return;
    let resolvedY = null;
    let nearestDistance = Infinity;
    for (const solid of solids) {
      const box = colliderBox(solid);
      if (!box) continue;
      const zOverlap = currentBox.zMin < box.zMax && currentBox.zMax > box.zMin;
      const horizontalOverlap = rangesOverlap(currentBox.x, currentBox.x + currentBox.width, box.x, box.x + box.width);
      if (!zOverlap || !horizontalOverlap) continue;
      let candidate = null;
      let distance = Infinity;
      if (player.vy > 0) {
        const crossed = previousBox.y + previousBox.height <= box.y && currentBox.y + currentBox.height >= box.y;
        const penetrated = currentBox.y < box.y + box.height && currentBox.y + currentBox.height > box.y;
        if (crossed || penetrated) {
          candidate = box.y - Number(playerCollider.offsetY || 0) - Number(playerCollider.height ?? player.height);
          distance = Math.max(0, box.y - (previousBox.y + previousBox.height));
        }
      } else if (player.vy < 0) {
        const crossed = previousBox.y >= box.y + box.height && currentBox.y <= box.y + box.height;
        const penetrated = currentBox.y < box.y + box.height && currentBox.y + currentBox.height > box.y;
        if (crossed || penetrated) {
          candidate = box.y + box.height - Number(playerCollider.offsetY || 0);
          distance = Math.max(0, previousBox.y - (box.y + box.height));
        }
      }
      if (candidate != null && distance < nearestDistance) {
        nearestDistance = distance;
        resolvedY = candidate;
      }
    }
    if (resolvedY != null) player.y = resolvedY;
  }

  function updateTopdown(player, dt, direction) {
    const solids = solidObjects(player);
    player.vx = direction.x * 250;
    player.vy = direction.y * 250;
    const previousHorizontalPose = { x: Number(player.x || 0), y: Number(player.y || 0), z: Number(player.z || 0) };
    const previousHorizontalBox = colliderBox(player);
    player.x += player.vx * dt;
    updateTopdownElevation(player, previousHorizontalPose);
    resolveHorizontal(player, solids, previousHorizontalBox);
    updateTopdownElevation(player, previousHorizontalPose);
    const previousVerticalPose = { x: Number(player.x || 0), y: Number(player.y || 0), z: Number(player.z || 0) };
    resolveSegmentBoundary(player, previousHorizontalBox, "x", dt);
    const previousVerticalBox = colliderBox(player);
    player.y += player.vy * dt;
    updateTopdownElevation(player, previousVerticalPose);
    resolveVerticalTopdown(player, solids, previousVerticalBox);
    updateTopdownElevation(player, previousVerticalPose);
    resolveSegmentBoundary(player, previousVerticalBox, "y", dt);
  }

  function moveToward(value, target, maximumDelta) {
    if (value < target) return Math.min(target, value + maximumDelta);
    if (value > target) return Math.max(target, value - maximumDelta);
    return target;
  }

  function platformerTuning() {
    return {
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
      ...(project.movementTuning || {}),
      ...(activeMap.movementTuning || {}),
    };
  }

  function updatePlatformer(player, dt, direction, jumping, jumpPressed) {
    const solids = solidObjects(player);
    const playerCollider = player.collider || { offsetX: 0, offsetY: 0, width: player.width, height: player.height };
    const tuning = platformerTuning();
    const wasGrounded = Boolean(player.grounded);
    clearGroundContact(player);
    const tickDelta = dt > 0 ? Math.max(1, Math.round(dt * 60)) : 0;
    if (wasGrounded) player.coyoteTicksRemaining = Math.max(1, Number(tuning.coyoteTicks));
    else player.coyoteTicksRemaining = Math.max(0, Number(player.coyoteTicksRemaining || 0) - tickDelta);
    if (jumpPressed) player.jumpBufferTicksRemaining = Math.max(1, Number(tuning.jumpBufferTicks));
    else player.jumpBufferTicksRemaining = Math.max(0, Number(player.jumpBufferTicksRemaining || 0) - tickDelta);

    const targetSpeed = direction.x * Number(tuning.maxRunSpeed);
    const acceleration = wasGrounded ? Number(tuning.groundAcceleration) : Number(tuning.airAcceleration);
    const rate = direction.x === 0 && wasGrounded ? Number(tuning.groundFriction) : acceleration;
    player.vx = moveToward(Number(player.vx || 0), targetSpeed, Math.max(0, rate) * dt);

    const canJump = player.jumpBufferTicksRemaining > 0 && player.coyoteTicksRemaining > 0;
    if (canJump) {
      player.vy = -Math.abs(Number(tuning.jumpVelocity));
      player.grounded = false;
      player.coyoteTicksRemaining = 0;
      player.jumpBufferTicksRemaining = 0;
      emit("player.jumped", { mapId: activeMap.id, objectId: player.id });
    } else if (player.jumpHeld && !jumping && player.vy < -Math.abs(Number(tuning.jumpCutVelocity))) {
      player.vy = -Math.abs(Number(tuning.jumpCutVelocity));
    }
    player.jumpHeld = jumping;
    const previousHorizontalBox = colliderBox(player);
    player.x += player.vx * dt;
    resolveHorizontal(player, solids, previousHorizontalBox);
    resolveSegmentBoundary(player, previousHorizontalBox, "x", dt);
    const previousBox = colliderBox(player);
    const previousBottom = previousBox ? previousBox.y + previousBox.height : player.y + player.height;
    const previousTop = previousBox ? previousBox.y : player.y;
    const gravityScale = player.vy > 0
      ? Number(tuning.fallGravityScale)
      : Math.abs(Number(player.vy || 0)) <= Number(tuning.apexThreshold)
        ? Number(tuning.apexGravityScale)
        : 1;
    player.vy += Number(activeMap.gravity ?? project.gravity ?? 1500) * Math.max(0, gravityScale) * dt;
    player.y += player.vy * dt;
    player.grounded = false;

    for (const solid of solids) {
      const playerBox = colliderBox(player);
      const solidBox = colliderBox(solid);
      if (!playerBox || !solidBox) continue;
      const horizontal = playerBox.x + playerBox.width > solidBox.x && playerBox.x < solidBox.x + solidBox.width;
      const zOverlap = playerBox.zMin < solidBox.zMax && playerBox.zMax > solidBox.zMin;
      if (!horizontal || !zOverlap) continue;
      const crossedTop = previousBottom <= solidBox.y + 7 && playerBox.y + playerBox.height >= solidBox.y;
      if (player.vy >= 0 && crossedTop) {
        player.y = solidBox.y - Number(playerCollider.offsetY || 0) - Number(playerCollider.height ?? player.height);
        player.vy = 0;
        player.grounded = true;
        setObjectZ(player, solid.supportZ ?? solid.z ?? player.z ?? 0);
        if (player.elevationTransitionId) clearElevationTransition(player);
      } else if (!solid.collider?.oneWay) {
        const crossedBottom = previousTop >= solidBox.y + solidBox.height - 7 && playerBox.y <= solidBox.y + solidBox.height;
        if (player.vy < 0 && crossedBottom) {
          player.y = solidBox.y + solidBox.height - Number(playerCollider.offsetY || 0);
          player.vy = 0;
        }
      }
    }
    resolveSegmentBoundary(player, previousBox, "y", dt);
    if (resolvePlatformerFloorSegments(player, previousBox, wasGrounded, previousHorizontalBox)) {
      const groundSegment = activeCollisionSegments.find((segment) => segment.id === player.groundSegmentId);
      if (!player.elevationTransitionId) setObjectZ(player, groundSegment?.zMin ?? player.z ?? 0);
    }
    if (!player.grounded && player.elevationTransitionId) clearElevationTransition(player);
    if (!wasGrounded && player.grounded) emit("player.landed", { mapId: activeMap.id, objectId: player.id });
  }

  function traversalGeometry(path) {
    const points = Array.isArray(path?.points) ? path.points : [];
    const segments = [];
    let total = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index];
      const to = points[index + 1];
      const dx = Number(to.x) - Number(from.x);
      const dy = Number(to.y) - Number(from.y);
      const length = Math.hypot(dx, dy);
      if (length <= 0.000001) continue;
      segments.push({ from, to, dx, dy, length, start: total });
      total += length;
    }
    return { segments, total };
  }

  function traversalSample(geometry, distance) {
    if (!geometry.segments.length) return null;
    const clamped = Math.max(0, Math.min(geometry.total, distance));
    const segment = geometry.segments.find((candidate) => clamped <= candidate.start + candidate.length) || geometry.segments.at(-1);
    const amount = Math.max(0, Math.min(1, (clamped - segment.start) / segment.length));
    return {
      x: Number(segment.from.x) + segment.dx * amount,
      y: Number(segment.from.y) + segment.dy * amount,
      z: Number(segment.from.z || 0) + (Number(segment.to.z || 0) - Number(segment.from.z || 0)) * amount,
      tangentX: segment.dx / segment.length,
      tangentY: segment.dy / segment.length,
    };
  }

  function closestTraversalPoint(path, x, y, z) {
    const geometry = traversalGeometry(path);
    let best = null;
    for (const segment of geometry.segments) {
      const px = x - Number(segment.from.x);
      const py = y - Number(segment.from.y);
      const amount = Math.max(0, Math.min(1, (px * segment.dx + py * segment.dy) / (segment.length * segment.length)));
      const sampleX = Number(segment.from.x) + segment.dx * amount;
      const sampleY = Number(segment.from.y) + segment.dy * amount;
      const sampleZ = Number(segment.from.z || 0) + (Number(segment.to.z || 0) - Number(segment.from.z || 0)) * amount;
      const distance = Math.hypot(x - sampleX, y - sampleY);
      const zDistance = Math.abs(Number(z || 0) - sampleZ);
      if (!best || distance < best.distance) best = { distance, zDistance, sampleZ, pathDistance: segment.start + segment.length * amount, tangentX: segment.dx / segment.length, tangentY: segment.dy / segment.length, geometry };
    }
    return best;
  }

  function positionPlayerOnTraversal(player, sample) {
    const collider = player.collider || { offsetX: 0, offsetY: 0, width: player.width, height: player.height };
    player.x = sample.x - Number(collider.offsetX || 0) - Number(collider.width ?? player.width) / 2;
    player.y = sample.y - Number(collider.offsetY || 0) - Number(collider.height ?? player.height);
    setObjectZ(player, sample.z);
  }

  function tryBeginTraversal(player, direction) {
    const collider = colliderBox(player);
    if (!collider) return false;
    const anchorX = collider.x + collider.width / 2;
    const anchorY = collider.y + collider.height;
    const intendedVx = Number(player.vx || 0) || Number(direction.x || 0) * 260;
    const intendedVy = Number(player.vy || 0) || Number(direction.y || 0) * 260;
    const speed = Math.hypot(intendedVx, intendedVy);
    let selected = null;
    for (const path of activePaths) {
      if (path.enabled === false) continue;
      const closest = closestTraversalPoint(path, anchorX, anchorY, player.z);
      if (!closest || closest.distance > Number(path.entryRadius || 0) || closest.zDistance > Number(path.entryZTolerance ?? 0.5) || speed < Number(path.minimumEntrySpeed || 0)) continue;
      if (!selected || closest.distance < selected.closest.distance) selected = { path, closest };
    }
    if (!selected) return false;
    const dot = intendedVx * selected.closest.tangentX + intendedVy * selected.closest.tangentY;
    const traversalDirection = selected.path.direction === "forward" ? 1 : selected.path.direction === "reverse" ? -1 : dot < 0 ? -1 : 1;
    activeTraversal = {
      pathId: selected.path.id,
      distance: selected.closest.pathDistance,
      direction: traversalDirection,
      speed: Math.max(Number(selected.path.minimumEntrySpeed || 0), speed),
      geometry: selected.closest.geometry,
    };
    const sample = traversalSample(activeTraversal.geometry, activeTraversal.distance);
    if (sample) positionPlayerOnTraversal(player, sample);
    emit("traversal.started", { mapId: activeMap.id, pathId: selected.path.id, direction: traversalDirection });
    return true;
  }

  function bailTraversal(player) {
    if (!activeTraversal) return false;
    const path = activePaths.find((candidate) => candidate.id === activeTraversal.pathId);
    const pathId = activeTraversal.pathId;
    activeTraversal = null;
    if (path?.bailBehavior === "reset") respawn(player, null, { cause: "traversal-bail", objectId: pathId });
    else if (path?.bailBehavior === "launch") player.vy = Number(path.exitImpulse?.y ?? -120);
    emit("traversal.bailed", { mapId: activeMap.id, pathId, behavior: path?.bailBehavior || "drop" });
    return true;
  }

  function updateTraversal(player, dt) {
    if (!activeTraversal) return false;
    const path = activePaths.find((candidate) => candidate.id === activeTraversal.pathId);
    if (!path) {
      activeTraversal = null;
      return false;
    }
    activeTraversal.speed = Math.min(Number(path.maximumSpeed || activeTraversal.speed), Math.max(0, activeTraversal.speed + Number(path.acceleration || 0) * dt));
    activeTraversal.distance += activeTraversal.speed * dt * activeTraversal.direction;
    const completed = activeTraversal.distance < 0 || activeTraversal.distance > activeTraversal.geometry.total;
    const sample = traversalSample(activeTraversal.geometry, activeTraversal.distance);
    if (sample) {
      positionPlayerOnTraversal(player, sample);
      player.vx = sample.tangentX * activeTraversal.speed * activeTraversal.direction;
      player.vy = sample.tangentY * activeTraversal.speed * activeTraversal.direction;
      player.grounded = false;
    }
    if (completed) {
      const pathId = activeTraversal.pathId;
      const direction = activeTraversal.direction;
      activeTraversal = null;
      player.vx += Number(path.exitImpulse?.x || 0) * direction;
      player.vy += Number(path.exitImpulse?.y || 0);
      emit("traversal.completed", { mapId: activeMap.id, pathId, direction });
    }
    return true;
  }

  function update(rawDt) {
    const frameEventStart = events.length;
    const dt = Math.max(0, Math.min(Number(rawDt || 0), 0.05));
    portalCooldown = Math.max(0, portalCooldown - dt);
    const player = objects.find((object) => object.kind === "player");
    const left = inputActive("ArrowLeft", "KeyA", "left");
    const right = inputActive("ArrowRight", "KeyD", "right");
    const up = inputActive("ArrowUp", "KeyW", "up");
    const down = inputActive("ArrowDown", "KeyS", "down");
    const jumpPressed = ["ArrowUp", "KeyW", "up", "Space", "jump"].some((code) => pressedInputs.has(code));
    const jumping = up || inputActive("Space", "jump") || jumpPressed;
    const interacting = inputActive("KeyE", "interact");
    const interactionPressed = ["KeyE", "interact"].some((code) => pressedInputs.has(code));
    const freshInteraction = interactionPressed || (interacting && !interactionHeld);
    const inputActionPhases = sampleInputActionPhases();
    for (const actionId of inputActionPhases.pressed) {
      emit("input.action", { mapId: activeMap.id, actionId });
    }
    const choiceAtTickStart = choicePageDefinition();
    const choiceWasModal = Boolean(choiceAtTickStart && choiceAtTickStart.modal !== false);
    const choiceSelected = processChoiceSelection(inputActionPhases, player);
    interactionHeld = interacting;
    pressedInputs.clear();
    releasedInputs.clear();
    if (choiceWasModal) {
      if (choiceSelected) processGameplayRules(player, { pressed: new Set(), held: new Set(), released: new Set() }, frameEventStart);
      return drainEvents();
    }
    updateMotionBodies(inputActionPhases, dt);
    updateActors(dt);
    if (!player) {
      updateCombat(inputActionPhases, dt, { x: 0, y: 0 });
      processGameplayRules(null, inputActionPhases, frameEventStart);
      return drainEvents();
    }
    const direction = { x: Number(right) - Number(left), y: Number(down) - Number(up) };
    let interactionConsumed = false;

    if (activeTraversal && freshInteraction) interactionConsumed = bailTraversal(player);
    if (!activeTraversal && freshInteraction && !interactionConsumed) interactionConsumed = tryBeginTraversal(player, direction);

    if (activeTraversal) updateTraversal(player, dt);
    else if ((activeMap.controlMode ?? project.controlMode) === "topdown") updateTopdown(player, dt, direction);
    else updatePlatformer(player, dt, direction, jumping, jumpPressed);

    refreshWorldStreamWindow(player);
    updateCombat(inputActionPhases, dt, direction);

    const worldBounds = activeWorldStreamState?.present ? activeWorldStreamState.worldBounds : null;
    const minX = Number(worldBounds?.minX ?? 0);
    const minY = Number(worldBounds?.minY ?? 0);
    const maxX = Number(worldBounds?.maxX ?? activeMap.width ?? project.width);
    const maxY = Number(worldBounds?.maxY ?? activeMap.height ?? project.height);
    player.x = Math.max(minX, Math.min(maxX - player.width, player.x));
    if (player.y > maxY + 80) respawn(player, null, { cause: "fall" });
    player.y = Math.max(minY - 80, Math.min(maxY - player.height, player.y));

    for (const object of objects) {
      if (!object.hidden && object.kind === "coin" && !object.collected && overlaps(player, object)) {
        object.collected = true;
        collectedIds.add(activeMap.id + ":" + object.id);
        gameplayRevision += 1;
        emit("coin.collected", { mapId: activeMap.id, objectId: object.id, count: collectedIds.size });
      }
      if (!object.hidden && object.kind === "hazard" && overlaps(player, object)) respawn(player, null, { cause: "hazard", objectId: object.id });
      if (!object.hidden && object.kind === "goal" && overlaps(player, object) && !won) {
        won = true;
        gameplayRevision += 1;
        emit("goal.reached", { mapId: activeMap.id, objectId: object.id });
      }
    }

    if (freshInteraction && !interactionConsumed && portalCooldown <= 0) {
      const portal = objects.find((object) => !object.hidden && object.kind === "portal" && overlaps(player, object));
      if (portal?.targetMapId && mapById(portal.targetMapId)) {
        const transition = portal.transition || "fade";
        const sourceMapId = activeMap.id;
        portalCooldown = 0.35;
        loadMap(portal.targetMapId, portal.targetSpawnId || null);
        const mapEvent = events.at(-1);
        if (mapEvent?.type === "map.changed") mapEvent.transition = transition;
        emit("portal.entered", { sourceMapId, targetMapId: activeMap.id, objectId: portal.id, transition });
      }
    }
    processGameplayRules(objects.find((object) => object.kind === "player") || player, inputActionPhases, frameEventStart);
    return drainEvents();
  }

  function setInput(code, pressed) {
    const source = String(code ?? "").trim();
    if (!source) return;
    const previousInputs = new Set(inputs);
    if (pressed) inputSources.add(source);
    else inputSources.delete(source);
    const nextInputs = new Set();
    for (const activeSource of inputSources) {
      for (const resolvedCode of inputCodesForSource(activeSource)) nextInputs.add(resolvedCode);
    }
    for (const resolvedCode of nextInputs) if (!previousInputs.has(resolvedCode)) pressedInputs.add(resolvedCode);
    for (const resolvedCode of previousInputs) if (!nextInputs.has(resolvedCode)) releasedInputs.add(resolvedCode);
    inputs.clear();
    for (const resolvedCode of nextInputs) inputs.add(resolvedCode);
  }

  function drainEvents() {
    return events.splice(0, events.length);
  }

  function depthKey(object, slice) {
    const projection = activeMap.projection ?? project.projection;
    if (projection?.type === "dimetric-2:1") {
      const anchorX = Number(object.x || 0) + Number(object.groundAnchor?.offsetX ?? Number(object.width || 0) / 2);
      const anchorY = Number(object.y || 0) + Number(object.groundAnchor?.offsetY ?? object.height ?? 0);
      return Number(object.depthLayer || 0) * 1_000_000_000 +
        (anchorX + anchorY) * 1024 +
        Number(object.z || 0) * 32 +
        Number(object.depthBias || 0) +
        Number(slice?.depthBias || 0);
    }
    return Number(object.depthLayer || 0) * 1_000_000_000 +
      Number(object.z || 0) * 1_000_000 +
      (Number(object.y || 0) + Number(object.height || 0)) * 100 +
      Number(object.depthBias || 0) +
      Number(slice?.depthBias || 0);
  }

  function renderEntries() {
    const entries = [];
    for (const object of objects) {
      if (object.collected || object.hidden) continue;
      const slices = Array.isArray(object.depthSlices) && object.depthSlices.length ? object.depthSlices : [null];
      for (const slice of slices) entries.push({ object, slice, depth: depthKey(object, slice) });
    }
    for (const slot of combatProjectileSlots) {
      if (!slot.active || slot.mapId !== activeMap.id) continue;
      const object = {
        id: slot.projectileId,
        kind: "projectile",
        x: Number(slot.x || 0) - Number(slot.width || 0) / 2,
        y: Number(slot.y || 0) - Number(slot.height || 0) / 2,
        z: Number(slot.z || 0),
        width: Number(slot.width || 0),
        height: Number(slot.height || 0),
        collisionHeight: Number(slot.zHeight || 1),
        color: slot.color,
        opacity: slot.opacity,
        groundAnchor: { offsetX: Number(slot.width || 0) / 2, offsetY: Number(slot.height || 0) / 2 },
      };
      entries.push({ object, slice: null, depth: depthKey(object, null) });
    }
    return entries.sort((a, b) => a.depth - b.depth || compareStableIds(a.object.id, b.object.id) || compareStableIds(a.slice?.id ?? "", b.slice?.id ?? ""));
  }

  function validateSaveState(input) {
    const maximumCollectedIds = 1024;
    const maximumCompletedRuleIds = 512;
    const maximumObjectOverrides = 1024;
    const maximumPathOverrides = 1024;
    const maximumMotionBodyStates = 128;
    const maximumActorStates = 128;
    const maximumVariables = 256;
    const errors = [];
    const addError = (message) => {
      if (errors.length < 64) errors.push(String(message).slice(0, 240));
    };
    const plainObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
    const exactFields = (value, fields, path) => {
      if (!plainObject(value)) {
        addError(`${path} must be an object.`);
        return false;
      }
      const actual = Object.keys(value).sort();
      const expected = [...fields].sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) addError(`${path} contains unknown or missing fields.`);
      return true;
    };
    const uniqueStrings = (value, maximum, path) => {
      if (!Array.isArray(value) || value.length > maximum) {
        addError(`${path} must be an array with at most ${maximum} entries.`);
        return [];
      }
      const normalized = [];
      const seen = new Set();
      for (const entry of value) {
        if (typeof entry !== "string" || !entry || entry.length > 240) addError(`${path} entries must be non-empty bounded strings.`);
        else if (seen.has(entry)) addError(`${path} contains duplicate ${entry}.`);
        else {
          seen.add(entry);
          normalized.push(entry);
        }
      }
      return normalized.sort(compareStableIds);
    };
    const saveVersion = Number(input?.version);
    const baseStateFields = ["schemaVersion", "version", "activeMapId", "player", "collectedIds", "completedRunRuleIds", "completedMapRuleIds", "variables", "objectOverrides", "pathOverrides", "activeChoicePageId", "pendingChoiceId", "won"];
    const stateFields = saveVersion === 6 ? [...baseStateFields, "motionBodyStates", "combatState", "actorStates", "elevationState", "worldStreamState"] : saveVersion === 5 ? [...baseStateFields, "motionBodyStates", "combatState", "actorStates", "elevationState"] : saveVersion === 4 ? [...baseStateFields, "motionBodyStates", "combatState", "actorStates"] : saveVersion === 3 ? [...baseStateFields, "motionBodyStates", "combatState"] : saveVersion === 2 ? [...baseStateFields, "motionBodyStates"] : baseStateFields;
    if (!exactFields(input, stateFields, "save state")) return { valid: false, errors, state: null };
    if (![1, 2, 3, 4, 5, 6].includes(saveVersion)) addError("Save state version must be 1, 2, 3, 4, 5, or 6.");
    const expectedSaveSchema = saveVersion === 6 ? "looplab-runtime-save-state/v6" : saveVersion === 5 ? "looplab-runtime-save-state/v5" : saveVersion === 4 ? "looplab-runtime-save-state/v4" : saveVersion === 3 ? "looplab-runtime-save-state/v3" : saveVersion === 2 ? "looplab-runtime-save-state/v2" : "looplab-runtime-save-state/v1";
    if (input.schemaVersion !== expectedSaveSchema) addError("Save state schemaVersion must match version " + String(saveVersion) + ".");
    const targetMap = typeof input.activeMapId === "string" ? mapById(input.activeMapId) : null;
    if (!targetMap) addError("Save state activeMapId does not reference a current map.");
    const validationWorldRuntime = targetMap?.worldStream ? compileWorldStreamRuntime(project, targetMap, compileTileRuntimeProgram) : null;
    if (validationWorldRuntime?.present) validationWorldRuntime.ensureThrough(Math.max(0, Number(targetMap.worldStream.horizon || 1) - 1));
    const validationWorldPlan = validationWorldRuntime?.present ? validationWorldRuntime.getPlan().instances ?? [] : [];
    const validWorldStreamObjectKey = (key) => {
      const mapPrefix = String(targetMap?.id ?? "") + ":";
      if (!key.startsWith(mapPrefix)) return false;
      const objectId = key.slice(mapPrefix.length);
      for (const instance of validationWorldPlan) {
        if (instance.ordinal === 0) continue;
        const instancePrefix = instance.id + ":";
        if (!objectId.startsWith(instancePrefix)) continue;
        const sourceId = objectId.slice(instancePrefix.length);
        return Boolean(mapById(instance.mapId)?.objects?.some((object) => object.id === sourceId));
      }
      return false;
    };

    const validCollectedIds = new Set();
    for (const map of maps) for (const object of map.objects || []) validCollectedIds.add(runtimeKey(map.id, object.id));
    const normalizedCollectedIds = uniqueStrings(input.collectedIds, maximumCollectedIds, "collectedIds");
    for (const id of normalizedCollectedIds) if (!validCollectedIds.has(id) && !validWorldStreamObjectKey(id)) addError(`collectedIds references missing object ${id}.`);

    const runRuleIds = new Set((gameplayProgram.rules || []).filter((rule) => rule?.once !== "never" && rule?.once !== "map").map((rule) => rule.id));
    const mapRuleIds = new Set((gameplayProgram.rules || []).filter((rule) => rule?.once === "map").map((rule) => rule.id));
    const normalizedRunRuleIds = uniqueStrings(input.completedRunRuleIds, maximumCompletedRuleIds, "completedRunRuleIds");
    const normalizedMapRuleIds = uniqueStrings(input.completedMapRuleIds, maximumCompletedRuleIds, "completedMapRuleIds");
    for (const id of normalizedRunRuleIds) if (!runRuleIds.has(id)) addError(`completedRunRuleIds references missing run rule ${id}.`);
    for (const id of normalizedMapRuleIds) if (!mapRuleIds.has(id)) addError(`completedMapRuleIds references missing map rule ${id}.`);

    const variableDefinitions = (gameplayProgram.variables || []).filter((variable) => variable && typeof variable.id === "string").sort((a, b) => compareStableIds(a.id, b.id));
    if (variableDefinitions.length > maximumVariables) addError(`The runtime declares more than ${maximumVariables} saveable variables.`);
    const normalizedVariables = {};
    if (!plainObject(input.variables)) addError("variables must be an object.");
    else {
      const expectedVariableIds = variableDefinitions.map((variable) => variable.id);
      if (JSON.stringify(Object.keys(input.variables).sort(compareStableIds)) !== JSON.stringify(expectedVariableIds)) addError("variables must contain every current variable exactly once.");
      for (const definition of variableDefinitions) {
        const value = input.variables[definition.id];
        if (definition.type === "number") {
          if (!Number.isFinite(value)) addError(`Variable ${definition.id} must be a finite number.`);
          if (Number.isFinite(Number(definition.min)) && value < Number(definition.min)) addError(`Variable ${definition.id} is below its minimum.`);
          if (Number.isFinite(Number(definition.max)) && value > Number(definition.max)) addError(`Variable ${definition.id} is above its maximum.`);
        } else if (definition.type === "boolean") {
          if (typeof value !== "boolean") addError(`Variable ${definition.id} must be boolean.`);
        } else if (typeof value !== "string" || value.length > 2048) addError(`Variable ${definition.id} must be a bounded string.`);
        normalizedVariables[definition.id] = clone(value);
      }
    }

    const normalizedObjectOverrides = [];
    const seenObjectOverrides = new Set();
    if (!Array.isArray(input.objectOverrides) || input.objectOverrides.length > maximumObjectOverrides) addError(`objectOverrides must contain at most ${maximumObjectOverrides} entries.`);
    else for (const entry of input.objectOverrides) {
      if (!exactFields(entry, ["mapId", "objectId", "changes"], "objectOverrides entry")) continue;
      const map = mapById(entry.mapId);
      const key = runtimeKey(entry.mapId, entry.objectId);
      if (!map?.objects?.some((object) => object.id === entry.objectId)) addError(`objectOverrides references missing object ${key}.`);
      if (seenObjectOverrides.has(key)) addError(`objectOverrides contains duplicate ${key}.`);
      seenObjectOverrides.add(key);
      const changes = {};
      if (!plainObject(entry.changes)) addError(`objectOverrides ${key}.changes must be an object.`);
      else for (const [changeKey, value] of Object.entries(entry.changes)) {
        if (changeKey !== "colliderEnabled" && !runtimeObjectChangeKeys.has(changeKey)) addError(`objectOverrides ${key} contains unsupported change ${changeKey}.`);
        else if (changeKey === "colliderEnabled" && typeof value !== "boolean") addError(`objectOverrides ${key}.colliderEnabled must be boolean.`);
        else if (value !== null && typeof value !== "boolean" && typeof value !== "string" && !Number.isFinite(value)) addError(`objectOverrides ${key}.${changeKey} must be a finite JSON primitive.`);
        else if (typeof value === "string" && value.length > 1024) addError(`objectOverrides ${key}.${changeKey} is too long.`);
        else changes[changeKey] = value;
      }
      normalizedObjectOverrides.push({ mapId: entry.mapId, objectId: entry.objectId, changes });
    }
    normalizedObjectOverrides.sort((a, b) => compareStableIds(runtimeKey(a.mapId, a.objectId), runtimeKey(b.mapId, b.objectId)));

    const normalizedPathOverrides = [];
    const seenPathOverrides = new Set();
    if (!Array.isArray(input.pathOverrides) || input.pathOverrides.length > maximumPathOverrides) addError(`pathOverrides must contain at most ${maximumPathOverrides} entries.`);
    else for (const entry of input.pathOverrides) {
      if (!exactFields(entry, ["mapId", "pathId", "changes"], "pathOverrides entry")) continue;
      const map = mapById(entry.mapId);
      const key = runtimeKey(entry.mapId, entry.pathId);
      if (!map?.traversalPaths?.some((path) => path.id === entry.pathId)) addError(`pathOverrides references missing path ${key}.`);
      if (seenPathOverrides.has(key)) addError(`pathOverrides contains duplicate ${key}.`);
      seenPathOverrides.add(key);
      if (!exactFields(entry.changes, ["enabled"], `pathOverrides ${key}.changes`) || typeof entry.changes?.enabled !== "boolean") addError(`pathOverrides ${key}.changes.enabled must be boolean.`);
      normalizedPathOverrides.push({ mapId: entry.mapId, pathId: entry.pathId, changes: { enabled: Boolean(entry.changes?.enabled) } });
    }
    normalizedPathOverrides.sort((a, b) => compareStableIds(runtimeKey(a.mapId, a.pathId), runtimeKey(b.mapId, b.pathId)));

    const motionDefinitions = new Map();
    for (const map of maps) {
      for (const object of map.objects || []) {
        if (!object?.motionBody || typeof object.motionBody !== "object") continue;
        motionDefinitions.set(runtimeKey(map.id, object.id), { map, object, path: (map.traversalPaths || []).find((path) => path.id === object.motionBody.pathId) });
      }
    }
    const normalizedMotionBodyStates = [];
    if (saveVersion >= 2) {
      const seenMotionBodies = new Set();
      if (!Array.isArray(input.motionBodyStates) || input.motionBodyStates.length > maximumMotionBodyStates) {
        addError("motionBodyStates must contain at most " + String(maximumMotionBodyStates) + " entries.");
      } else {
        for (const entry of input.motionBodyStates) {
          const fields = ["schemaVersion", "mapId", "objectId", "pathId", "progress", "speed", "direction", "blocked", "blockerId", "blockerProgress", "completed"];
          if (!exactFields(entry, fields, "motionBodyStates entry")) continue;
          const key = runtimeKey(entry.mapId, entry.objectId);
          const definition = motionDefinitions.get(key);
          if (!definition) addError("motionBodyStates references missing motion body " + key + ".");
          if (seenMotionBodies.has(key)) addError("motionBodyStates contains duplicate " + key + ".");
          seenMotionBodies.add(key);
          if (entry.schemaVersion !== motionBodyStateSchema) addError("motionBodyStates " + key + " has the wrong schemaVersion.");
          if (definition && entry.pathId !== definition.object.motionBody.pathId) addError("motionBodyStates " + key + " pathId does not match authored data.");
          const total = definition?.path ? traversalGeometry(definition.path).total : 0;
          if (!Number.isFinite(entry.progress) || entry.progress < -motionBodyEpsilon || entry.progress > total + motionBodyEpsilon) addError("motionBodyStates " + key + " progress is outside its authored path.");
          if (!Number.isFinite(entry.speed) || entry.speed < 0 || entry.speed > 4096) addError("motionBodyStates " + key + " speed must be finite and bounded.");
          if (!["forward", "reverse"].includes(entry.direction)) addError("motionBodyStates " + key + " direction is invalid.");
          for (const field of ["blocked", "completed"]) if (typeof entry[field] !== "boolean") addError("motionBodyStates " + key + "." + field + " must be boolean.");
          if (entry.blockerId !== null && (typeof entry.blockerId !== "string" || !definition?.map?.objects?.some((object) => object.id === entry.blockerId))) addError("motionBodyStates " + key + " blockerId is invalid.");
          if (entry.blockerProgress !== null && (!Number.isFinite(entry.blockerProgress) || entry.blockerProgress < -motionBodyEpsilon || entry.blockerProgress > total + motionBodyEpsilon)) addError("motionBodyStates " + key + " blockerProgress is invalid.");
          normalizedMotionBodyStates.push({
            schemaVersion: motionBodyStateSchema,
            mapId: entry.mapId,
            objectId: entry.objectId,
            pathId: entry.pathId,
            progress: Number(entry.progress),
            speed: Number(entry.speed),
            direction: entry.direction,
            blocked: Boolean(entry.blocked),
            blockerId: entry.blockerId,
            blockerProgress: entry.blockerProgress == null ? null : Number(entry.blockerProgress),
            completed: Boolean(entry.completed),
          });
        }
      }
      for (const key of motionDefinitions.keys()) if (!seenMotionBodies.has(key)) addError("motionBodyStates is missing " + key + ".");
      normalizedMotionBodyStates.sort((first, second) => compareStableIds(runtimeKey(first.mapId, first.objectId), runtimeKey(second.mapId, second.objectId)));
    }
    let normalizedCombatState = null;
    if (saveVersion >= 3 && input.combatState !== null) {
      const combatFields = ["schemaVersion", "revision", "sequence", "health", "emitters", "projectiles"];
      if (exactFields(input.combatState, combatFields, "combatState")) {
        if (input.combatState.schemaVersion !== combatStateSchema) addError("combatState has the wrong schemaVersion.");
        if (!Number.isSafeInteger(input.combatState.revision) || input.combatState.revision < 0) addError("combatState.revision must be a non-negative safe integer.");
        if (!Number.isSafeInteger(input.combatState.sequence) || input.combatState.sequence < 0) addError("combatState.sequence must be a non-negative safe integer.");
        const actorDefinitions = new Map((combatProgram.actors || []).map((actor) => [actor.id, actor]));
        const emitterDefinitions = new Map((combatProgram.emitters || []).map((emitter) => [emitter.id, emitter]));
        const slotDefinitions = new Map(combatProjectileSlots.map((slot) => [slot.slotId, slot]));
        const normalizedHealth = [];
        const seenActors = new Set();
        if (!Array.isArray(input.combatState.health) || input.combatState.health.length > 128) addError("combatState.health must contain at most 128 entries.");
        else for (const entry of input.combatState.health) {
          const fields = ["actorId", "mapId", "objectId", "teamId", "hp", "maxHp", "invulnerabilityTicks", "depleted"];
          if (!exactFields(entry, fields, "combatState.health entry")) continue;
          const definition = actorDefinitions.get(entry.actorId);
          if (!definition) addError("combatState.health references missing actor " + String(entry.actorId) + ".");
          if (seenActors.has(entry.actorId)) addError("combatState.health contains duplicate actor " + String(entry.actorId) + ".");
          seenActors.add(entry.actorId);
          if (definition && (entry.mapId !== definition.mapId || entry.objectId !== definition.objectId || entry.teamId !== definition.teamId || entry.maxHp !== definition.maxHp)) addError("combatState.health " + String(entry.actorId) + " does not match authored data.");
          if (!Number.isSafeInteger(entry.hp) || entry.hp < 0 || entry.hp > Number(definition?.maxHp || 0)) addError("combatState.health " + String(entry.actorId) + " hp is invalid.");
          if (!Number.isSafeInteger(entry.maxHp) || entry.maxHp < 1 || entry.maxHp > 1_000_000) addError("combatState.health " + String(entry.actorId) + " maxHp is invalid.");
          if (!Number.isSafeInteger(entry.invulnerabilityTicks) || entry.invulnerabilityTicks < 0 || entry.invulnerabilityTicks > 1_200) addError("combatState.health " + String(entry.actorId) + " invulnerabilityTicks is invalid.");
          if (typeof entry.depleted !== "boolean" || entry.depleted !== (entry.hp <= 0)) addError("combatState.health " + String(entry.actorId) + " depleted must match hp.");
          normalizedHealth.push({ actorId: entry.actorId, mapId: entry.mapId, objectId: entry.objectId, teamId: entry.teamId, hp: Number(entry.hp), maxHp: Number(entry.maxHp), invulnerabilityTicks: Number(entry.invulnerabilityTicks), depleted: Boolean(entry.depleted) });
        }
        for (const actorId of actorDefinitions.keys()) if (!seenActors.has(actorId)) addError("combatState.health is missing actor " + actorId + ".");
        normalizedHealth.sort((first, second) => compareStableIds(first.actorId, second.actorId));

        const normalizedEmitters = [];
        const seenEmitters = new Set();
        if (!Array.isArray(input.combatState.emitters) || input.combatState.emitters.length > 64) addError("combatState.emitters must contain at most 64 entries.");
        else for (const entry of input.combatState.emitters) {
          const fields = ["emitterId", "mapId", "cooldownTicks", "lastDirectionX", "lastDirectionY", "lastTargetActorId", "shotsFired", "overflowCount"];
          if (!exactFields(entry, fields, "combatState.emitters entry")) continue;
          const definition = emitterDefinitions.get(entry.emitterId);
          if (!definition) addError("combatState.emitters references missing emitter " + String(entry.emitterId) + ".");
          if (seenEmitters.has(entry.emitterId)) addError("combatState.emitters contains duplicate emitter " + String(entry.emitterId) + ".");
          seenEmitters.add(entry.emitterId);
          if (definition && entry.mapId !== definition.mapId) addError("combatState emitter " + String(entry.emitterId) + " mapId does not match authored data.");
          if (!Number.isSafeInteger(entry.cooldownTicks) || entry.cooldownTicks < 0 || entry.cooldownTicks > Number(definition?.cooldownTicks || 3_600)) addError("combatState emitter " + String(entry.emitterId) + " cooldownTicks is invalid.");
          if (!Number.isFinite(entry.lastDirectionX) || !Number.isFinite(entry.lastDirectionY) || Math.hypot(entry.lastDirectionX, entry.lastDirectionY) < 0.999 || Math.hypot(entry.lastDirectionX, entry.lastDirectionY) > 1.001) addError("combatState emitter " + String(entry.emitterId) + " direction must be normalized.");
          if (entry.lastTargetActorId !== null && !actorDefinitions.has(entry.lastTargetActorId)) addError("combatState emitter " + String(entry.emitterId) + " target actor is invalid.");
          for (const field of ["shotsFired", "overflowCount"]) if (!Number.isSafeInteger(entry[field]) || entry[field] < 0) addError("combatState emitter " + String(entry.emitterId) + " " + field + " is invalid.");
          normalizedEmitters.push({ emitterId: entry.emitterId, mapId: entry.mapId, cooldownTicks: Number(entry.cooldownTicks), lastDirectionX: Number(entry.lastDirectionX), lastDirectionY: Number(entry.lastDirectionY), lastTargetActorId: entry.lastTargetActorId, shotsFired: Number(entry.shotsFired), overflowCount: Number(entry.overflowCount) });
        }
        for (const emitterId of emitterDefinitions.keys()) if (!seenEmitters.has(emitterId)) addError("combatState.emitters is missing emitter " + emitterId + ".");
        normalizedEmitters.sort((first, second) => compareStableIds(first.emitterId, second.emitterId));

        const normalizedProjectiles = [];
        const seenSlots = new Set();
        const seenProjectileIds = new Set();
        const seenSequences = new Set();
        const maximumProjectiles = Math.max(1, Math.min(512, Math.trunc(Number(combatProgram.maxProjectiles || 1))));
        if (!Array.isArray(input.combatState.projectiles) || input.combatState.projectiles.length > maximumProjectiles) addError("combatState.projectiles exceeds the authored global pool.");
        else for (const entry of input.combatState.projectiles) {
          const fields = ["slotId", "projectileId", "emitterId", "sequence", "mapId", "ownerObjectId", "teamId", "targetActorId", "x", "y", "z", "vx", "vy", "width", "height", "zHeight", "remainingTicks", "damage", "hitsRemaining", "worldCollision", "color", "opacity", "hitActorIds"];
          if (!exactFields(entry, fields, "combatState.projectiles entry")) continue;
          const slot = slotDefinitions.get(entry.slotId);
          const emitter = emitterDefinitions.get(entry.emitterId);
          if (!slot || slot.emitterId !== entry.emitterId) addError("combatState projectile " + String(entry.slotId) + " does not reference its authored pool slot.");
          if (seenSlots.has(entry.slotId)) addError("combatState.projectiles contains duplicate slot " + String(entry.slotId) + ".");
          seenSlots.add(entry.slotId);
          if (typeof entry.projectileId !== "string" || !entry.projectileId || entry.projectileId.length > 240 || seenProjectileIds.has(entry.projectileId)) addError("combatState projectileId must be unique and bounded.");
          seenProjectileIds.add(entry.projectileId);
          if (!Number.isSafeInteger(entry.sequence) || entry.sequence < 1 || entry.sequence > input.combatState.sequence || seenSequences.has(entry.sequence)) addError("combatState projectile sequence is invalid or duplicated.");
          seenSequences.add(entry.sequence);
          if (!emitter || entry.mapId !== input.activeMapId || entry.mapId !== emitter.mapId || entry.ownerObjectId !== emitter.ownerObjectId || entry.teamId !== emitter.teamId) addError("combatState projectile " + String(entry.projectileId) + " does not match its authored emitter or active map.");
          if (entry.targetActorId !== null && !actorDefinitions.has(entry.targetActorId)) addError("combatState projectile targetActorId is invalid.");
          for (const field of ["x", "y", "z", "vx", "vy", "width", "height", "zHeight", "opacity"]) if (!Number.isFinite(entry[field])) addError("combatState projectile " + String(entry.projectileId) + " " + field + " must be finite.");
          if (emitter && (entry.width !== emitter.projectile.width || entry.height !== emitter.projectile.height || entry.zHeight !== emitter.projectile.zHeight || entry.damage !== emitter.projectile.damage || entry.worldCollision !== emitter.projectile.worldCollision || entry.color !== emitter.projectile.color || entry.opacity !== emitter.projectile.opacity)) addError("combatState projectile " + String(entry.projectileId) + " properties do not match authored data.");
          if (emitter && Math.abs(Math.hypot(entry.vx, entry.vy) - Number(emitter.projectile.speed)) > 0.000001) addError("combatState projectile " + String(entry.projectileId) + " velocity does not match authored speed.");
          if (!Number.isSafeInteger(entry.remainingTicks) || entry.remainingTicks < 1 || entry.remainingTicks > Number(emitter?.projectile?.lifetimeTicks || 7_200)) addError("combatState projectile remainingTicks is invalid.");
          if (!Number.isSafeInteger(entry.damage) || entry.damage < 1 || entry.damage > 1_000_000) addError("combatState projectile damage is invalid.");
          if (!Number.isSafeInteger(entry.hitsRemaining) || entry.hitsRemaining < 1 || entry.hitsRemaining > Number(emitter?.projectile?.pierce || 0) + 1) addError("combatState projectile hitsRemaining is invalid.");
          if (typeof entry.worldCollision !== "boolean" || typeof entry.color !== "string" || typeof entry.opacity !== "number" || entry.opacity < 0 || entry.opacity > 1) addError("combatState projectile presentation or collision fields are invalid.");
          const hitActorIds = uniqueStrings(entry.hitActorIds, 64, "combatState projectile hitActorIds");
          for (const actorId of hitActorIds) if (!actorDefinitions.has(actorId)) addError("combatState projectile hitActorIds references missing actor " + actorId + ".");
          normalizedProjectiles.push({ slotId: entry.slotId, projectileId: entry.projectileId, emitterId: entry.emitterId, sequence: Number(entry.sequence), mapId: entry.mapId, ownerObjectId: entry.ownerObjectId, teamId: entry.teamId, targetActorId: entry.targetActorId, x: Number(entry.x), y: Number(entry.y), z: Number(entry.z), vx: Number(entry.vx), vy: Number(entry.vy), width: Number(entry.width), height: Number(entry.height), zHeight: Number(entry.zHeight), remainingTicks: Number(entry.remainingTicks), damage: Number(entry.damage), hitsRemaining: Number(entry.hitsRemaining), worldCollision: Boolean(entry.worldCollision), color: entry.color, opacity: Number(entry.opacity), hitActorIds });
        }
        normalizedProjectiles.sort((first, second) => first.sequence - second.sequence || compareStableIds(first.slotId, second.slotId));
        normalizedCombatState = { schemaVersion: combatStateSchema, revision: Number(input.combatState.revision), sequence: Number(input.combatState.sequence), health: normalizedHealth, emitters: normalizedEmitters, projectiles: normalizedProjectiles };
      }
    } else if (saveVersion === 3) addError("combatState must be present in save state version 3.");
    const normalizedActorStates = [];
    if (saveVersion >= 4) {
      const actorDefinitions = new Map((actorProgram.actors || []).map((actor) => [actor.id, actor]));
      const seenActors = new Set();
      if (!Array.isArray(input.actorStates) || input.actorStates.length > maximumActorStates) addError("actorStates must contain at most " + String(maximumActorStates) + " entries.");
      else for (const entry of input.actorStates) {
        const fields = ["schemaVersion", "actorId", "mapId", "objectId", "mode", "previousMode", "x", "y", "z", "vx", "vy", "facingX", "facingY", "routeNodeIds", "routeIndex", "routeDirection", "targetId", "detected", "memoryTicksRemaining", "repathTicksRemaining", "lastSeenX", "lastSeenY", "lastSeenZ", "blockerId", "arrived", "revision"];
        if (!exactFields(entry, fields, "actorStates entry")) continue;
        const definition = actorDefinitions.get(entry.actorId);
        if (!definition) addError("actorStates references missing actor " + String(entry.actorId) + ".");
        if (seenActors.has(entry.actorId)) addError("actorStates contains duplicate actor " + String(entry.actorId) + ".");
        seenActors.add(entry.actorId);
        if (entry.schemaVersion !== actorStateSchema) addError("actorStates " + String(entry.actorId) + " has the wrong schemaVersion.");
        if (definition && (entry.mapId !== definition.mapId || entry.objectId !== definition.objectId)) addError("actorStates " + String(entry.actorId) + " does not match authored data.");
        if (!["hold", "patrol", "chase", "flee", "return", "cutscene"].includes(entry.mode)) addError("actorStates " + String(entry.actorId) + " mode is invalid.");
        if (entry.previousMode !== null && !["hold", "patrol", "chase", "flee", "return", "cutscene"].includes(entry.previousMode)) addError("actorStates " + String(entry.actorId) + " previousMode is invalid.");
        for (const field of ["x", "y", "z", "vx", "vy", "facingX", "facingY"]) if (!Number.isFinite(entry[field])) addError("actorStates " + String(entry.actorId) + " " + field + " must be finite.");
        const facingMagnitude = Math.hypot(entry.facingX, entry.facingY);
        if (!Number.isFinite(facingMagnitude) || facingMagnitude < 0.999 || facingMagnitude > 1.001) addError("actorStates " + String(entry.actorId) + " facing must be normalized.");
        const routeNodeIds = uniqueStrings(entry.routeNodeIds, 256, "actorStates " + String(entry.actorId) + " routeNodeIds");
        const actorMap = definition ? mapById(definition.mapId) : null;
        const navigationNodeIds = new Set((actorMap?.navigation?.nodes || []).map((node) => node.id));
        for (const nodeId of routeNodeIds) if (!navigationNodeIds.has(nodeId)) addError("actorStates " + String(entry.actorId) + " route references missing node " + nodeId + ".");
        if (!Number.isSafeInteger(entry.routeIndex) || (routeNodeIds.length ? entry.routeIndex < 0 || entry.routeIndex >= routeNodeIds.length : entry.routeIndex !== 0)) addError("actorStates " + String(entry.actorId) + " routeIndex is invalid.");
        if (![1, -1].includes(entry.routeDirection)) addError("actorStates " + String(entry.actorId) + " routeDirection is invalid.");
        if (entry.targetId !== null && (typeof entry.targetId !== "string" || !entry.targetId || entry.targetId.length > 240)) addError("actorStates " + String(entry.actorId) + " targetId is invalid.");
        if (typeof entry.detected !== "boolean" || typeof entry.arrived !== "boolean") addError("actorStates " + String(entry.actorId) + " detected and arrived must be boolean.");
        if (!Number.isSafeInteger(entry.memoryTicksRemaining) || entry.memoryTicksRemaining < 0 || entry.memoryTicksRemaining > 7_200) addError("actorStates " + String(entry.actorId) + " memoryTicksRemaining is invalid.");
        if (!Number.isSafeInteger(entry.repathTicksRemaining) || entry.repathTicksRemaining < 0 || entry.repathTicksRemaining > 600) addError("actorStates " + String(entry.actorId) + " repathTicksRemaining is invalid.");
        const lastSeenValues = [entry.lastSeenX, entry.lastSeenY, entry.lastSeenZ];
        if (!(lastSeenValues.every((value) => value === null) || lastSeenValues.every((value) => Number.isFinite(value)))) addError("actorStates " + String(entry.actorId) + " last-seen coordinates must be all null or all finite.");
        if (entry.blockerId !== null && (typeof entry.blockerId !== "string" || !actorMap?.objects?.some((object) => object.id === entry.blockerId))) addError("actorStates " + String(entry.actorId) + " blockerId is invalid.");
        if (!Number.isSafeInteger(entry.revision) || entry.revision < 0) addError("actorStates " + String(entry.actorId) + " revision is invalid.");
        normalizedActorStates.push({ ...clone(entry), routeNodeIds });
      }
      for (const actorId of actorDefinitions.keys()) if (!seenActors.has(actorId)) addError("actorStates is missing actor " + actorId + ".");
      normalizedActorStates.sort((first, second) => compareStableIds(first.actorId, second.actorId));
      if (!Number.isSafeInteger(Math.max(0, ...normalizedActorStates.map((state) => state.revision)))) addError("actorStates revisions are invalid.");
    }
    let normalizedWorldStreamState = null;
    let savedWorldComposition = null;
    if (saveVersion === 6) {
      const fields = ["schemaVersion", "hostMapId", "routeDigest", "currentOrdinal", "currentInstanceId"];
      if (exactFields(input.worldStreamState, fields, "worldStreamState")) {
        if (input.worldStreamState.schemaVersion !== "looplab-world-stream-save-state/v1") addError("worldStreamState has the wrong schemaVersion.");
        if (input.worldStreamState.hostMapId !== targetMap?.id) addError("worldStreamState.hostMapId must match activeMapId.");
        if (!Number.isSafeInteger(input.worldStreamState.currentOrdinal) || input.worldStreamState.currentOrdinal < 0 || input.worldStreamState.currentOrdinal >= Number(targetMap?.worldStream?.horizon || 0)) addError("worldStreamState.currentOrdinal is outside the authored horizon.");
        if (typeof input.worldStreamState.routeDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(input.worldStreamState.routeDigest)) addError("worldStreamState.routeDigest must be a canonical SHA-256 digest.");
        if (typeof input.worldStreamState.currentInstanceId !== "string" || !input.worldStreamState.currentInstanceId || input.worldStreamState.currentInstanceId.length > 320) addError("worldStreamState.currentInstanceId must be a bounded stable instance ID.");
        const savedWorldRuntime = validationWorldRuntime;
        if (!savedWorldRuntime?.present) addError("Save state version 6 requires an authored world stream on activeMapId.");
        else {
          savedWorldComposition = savedWorldRuntime.compose(input.worldStreamState.currentOrdinal);
          if (savedWorldComposition.state.contradiction) addError("worldStreamState cannot restore a contradictory authored route.");
          if (savedWorldComposition.state.routeDigest !== input.worldStreamState.routeDigest) addError("worldStreamState.routeDigest does not match the current deterministic route.");
          if (savedWorldComposition.state.currentInstanceId !== input.worldStreamState.currentInstanceId) addError("worldStreamState.currentInstanceId does not match currentOrdinal.");
        }
        normalizedWorldStreamState = {
          schemaVersion: "looplab-world-stream-save-state/v1",
          hostMapId: input.worldStreamState.hostMapId,
          routeDigest: input.worldStreamState.routeDigest,
          currentOrdinal: Number(input.worldStreamState.currentOrdinal),
          currentInstanceId: input.worldStreamState.currentInstanceId,
        };
      }
    }

    const targetPlayer = targetMap?.objects?.find((object) => object.kind === "player") || null;
    let normalizedPlayer = null;
    if (targetPlayer) {
      if (!exactFields(input.player, ["id", "x", "y", "z"], "player")) normalizedPlayer = null;
      else {
        if (input.player.id !== targetPlayer.id) addError("Save state player does not match the active map player.");
        for (const field of ["x", "y", "z"]) if (!Number.isFinite(input.player[field])) addError(`player.${field} must be finite.`);
        const bounds = savedWorldComposition?.state?.worldBounds ?? { minX: 0, minY: 0, maxX: Number(targetMap.width ?? project.width ?? 0), maxY: Number(targetMap.height ?? project.height ?? 0) };
        if (input.player.x < Number(bounds.minX) - 80 || input.player.x > Number(bounds.maxX) + 80 || input.player.y < Number(bounds.minY) - 80 || input.player.y > Number(bounds.maxY) + 80 || Math.abs(input.player.z) > 1_000_000) addError("Saved player position is outside the bounded active world envelope.");
        normalizedPlayer = { id: input.player.id, x: Number(input.player.x), y: Number(input.player.y), z: Number(input.player.z) };
      }
    } else if (input.player !== null) addError("Save state must not contain a player for a map without one.");

    const activePage = input.activeChoicePageId === null ? null : choicePages.find((page) => page.id === input.activeChoicePageId) || null;
    if (input.activeChoicePageId !== null && !activePage) addError("activeChoicePageId does not reference a current choice page.");
    if (input.pendingChoiceId !== null && !activePage?.choices?.some((choice) => choice.id === input.pendingChoiceId)) addError("pendingChoiceId does not reference a choice on the active page.");
    if (typeof input.won !== "boolean") addError("won must be boolean.");

    let normalizedElevationState = null;
    if (saveVersion >= 5) {
      if (!exactFields(input.elevationState, ["transitionId", "segmentId", "progress", "supportZ"], "elevationState")) normalizedElevationState = null;
      else {
        const transitionIds = new Set((targetMap?.elevationTransitions?.transitions ?? []).map((transition) => transition.id));
        const segmentIds = new Set(buildElevationSegments(targetMap?.elevationTransitions).map((segment) => segment.id));
        if (input.elevationState.transitionId !== null && !transitionIds.has(input.elevationState.transitionId)) addError("elevationState.transitionId does not reference a current transition.");
        if (input.elevationState.segmentId !== null && !segmentIds.has(input.elevationState.segmentId)) addError("elevationState.segmentId does not reference a current transition segment.");
        if (!Number.isFinite(input.elevationState.progress) || input.elevationState.progress < 0 || input.elevationState.progress > 1) addError("elevationState.progress must be finite from 0 through 1.");
        if (!Number.isFinite(input.elevationState.supportZ) || Math.abs(input.elevationState.supportZ) > 1024) addError("elevationState.supportZ must be a bounded support elevation.");
        normalizedElevationState = { transitionId: input.elevationState.transitionId, segmentId: input.elevationState.segmentId, progress: Number(input.elevationState.progress), supportZ: Number(input.elevationState.supportZ) };
      }
    }

    const state = errors.length ? null : {
      schemaVersion: saveVersion === 6 ? "looplab-runtime-save-state/v6" : saveVersion === 5 ? "looplab-runtime-save-state/v5" : saveVersion === 4 ? "looplab-runtime-save-state/v4" : saveVersion === 3 ? "looplab-runtime-save-state/v3" : saveVersion === 2 ? "looplab-runtime-save-state/v2" : "looplab-runtime-save-state/v1",
      version: saveVersion,
      activeMapId: targetMap.id,
      player: normalizedPlayer,
      collectedIds: normalizedCollectedIds,
      completedRunRuleIds: normalizedRunRuleIds,
      completedMapRuleIds: normalizedMapRuleIds,
      variables: normalizedVariables,
      objectOverrides: normalizedObjectOverrides,
      pathOverrides: normalizedPathOverrides,
      ...(saveVersion >= 2 ? { motionBodyStates: normalizedMotionBodyStates } : {}),
      ...(saveVersion >= 3 ? { combatState: normalizedCombatState } : {}),
      ...(saveVersion >= 4 ? { actorStates: normalizedActorStates } : {}),
      ...(saveVersion >= 5 ? { elevationState: normalizedElevationState } : {}),
      ...(saveVersion === 6 ? { worldStreamState: normalizedWorldStreamState } : {}),
      activeChoicePageId: activePage?.id ?? null,
      pendingChoiceId: input.pendingChoiceId ?? null,
      won: input.won,
    };
    return { valid: errors.length === 0, errors, state };
  }

  function exportSaveState() {
    const player = objects.find((object) => object.kind === "player");
    const variables = {};
    for (const id of Object.keys(gameplayVariables).sort(compareStableIds)) variables[id] = clone(gameplayVariables[id]);
    const savedObjectOverrides = [];
    const savedPathOverrides = [];
    for (const map of [...maps].sort((a, b) => compareStableIds(a.id, b.id))) {
      for (const object of [...(map.objects || [])].sort((a, b) => compareStableIds(a.id, b.id))) {
        const changes = objectOverrides.get(runtimeKey(map.id, object.id));
        if (changes) savedObjectOverrides.push({ mapId: map.id, objectId: object.id, changes: clone(changes) });
      }
      for (const path of [...(map.traversalPaths || [])].sort((a, b) => compareStableIds(a.id, b.id))) {
        const changes = pathOverrides.get(runtimeKey(map.id, path.id));
        if (changes) savedPathOverrides.push({ mapId: map.id, pathId: path.id, changes: clone(changes) });
      }
    }
    const savedMotionBodyStates = getMotionBodyStates().map((state) => ({
      schemaVersion: motionBodyStateSchema,
      mapId: state.mapId,
      objectId: state.objectId,
      pathId: state.pathId,
      progress: state.progress,
      speed: state.speed,
      direction: state.direction,
      blocked: state.blocked,
      blockerId: state.blockerId,
      blockerProgress: state.blockerProgress,
      completed: state.completed,
    }));
    const combat = getCombatState();
    const savedCombatState = {
      schemaVersion: combatStateSchema,
      revision: combat.revision,
      sequence: combat.sequence,
      health: combat.health,
      emitters: combat.emitters.map((state) => {
        const saved = { ...state };
        delete saved.activeProjectiles;
        return saved;
      }),
      projectiles: combat.projectiles,
    };
    const hasCombatState = combatProgramEnabled() && (combat.health.length > 0 || combat.emitters.length > 0);
    const savedActorStates = getActorStates();
    const hasActorState = actorProgramEnabled() && savedActorStates.length > 0;
    const hasActiveElevation = Boolean(player?.elevationTransitionId);
    const hasWorldStream = activeWorldStreamState?.present === true;
    const saveVersion = hasWorldStream ? 6 : hasActiveElevation ? 5 : hasActorState ? 4 : hasCombatState ? 3 : savedMotionBodyStates.length ? 2 : 1;
    return {
      schemaVersion: saveVersion === 6 ? "looplab-runtime-save-state/v6" : saveVersion === 5 ? "looplab-runtime-save-state/v5" : saveVersion === 4 ? "looplab-runtime-save-state/v4" : saveVersion === 3 ? "looplab-runtime-save-state/v3" : saveVersion === 2 ? "looplab-runtime-save-state/v2" : "looplab-runtime-save-state/v1",
      version: saveVersion,
      activeMapId: activeMap.id,
      player: player ? { id: player.id, x: Number(player.x), y: Number(player.y), z: Number(player.z || 0) } : null,
      collectedIds: [...collectedIds].sort(compareStableIds),
      completedRunRuleIds: [...completedRunRules].sort(compareStableIds),
      completedMapRuleIds: [...completedMapRules].sort(compareStableIds),
      variables,
      objectOverrides: savedObjectOverrides,
      pathOverrides: savedPathOverrides,
      ...(saveVersion >= 2 ? { motionBodyStates: savedMotionBodyStates } : {}),
      ...(saveVersion >= 5 ? { elevationState: { transitionId: player?.elevationTransitionId ?? null, segmentId: player?.elevationSegmentId ?? null, progress: Number(player?.elevationProgress || 0), supportZ: Number(player?.elevationSupportZ ?? player?.z ?? 0) } } : {}),
      ...(saveVersion >= 3 ? { combatState: hasCombatState ? savedCombatState : null } : {}),
      ...(saveVersion >= 4 ? { actorStates: savedActorStates } : {}),
      ...(saveVersion === 6 ? { worldStreamState: { schemaVersion: "looplab-world-stream-save-state/v1", hostMapId: activeMap.id, routeDigest: activeWorldStreamState.routeDigest, currentOrdinal: Number(activeWorldStreamState.currentOrdinal || 0), currentInstanceId: activeWorldStreamState.currentInstanceId } } : {}),
      activeChoicePageId,
      pendingChoiceId,
      won,
    };
  }

  function applyValidatedSaveState(state, announce = true) {
    clearInputState();
    collectedIds.clear();
    for (const id of state.collectedIds) collectedIds.add(id);
    completedRunRules.clear();
    for (const id of state.completedRunRuleIds) completedRunRules.add(id);
    objectOverrides.clear();
    for (const entry of state.objectOverrides) objectOverrides.set(runtimeKey(entry.mapId, entry.objectId), clone(entry.changes));
    pathOverrides.clear();
    for (const entry of state.pathOverrides) pathOverrides.set(runtimeKey(entry.mapId, entry.pathId), clone(entry.changes));
    resetMotionBodyStates();
    for (const entry of state.motionBodyStates || []) {
      const current = motionBodyStates.get(runtimeKey(entry.mapId, entry.objectId));
      if (!current) continue;
      current.pathId = entry.pathId;
      current.progress = entry.progress;
      current.speed = entry.speed;
      current.direction = entry.direction === "reverse" ? -1 : 1;
      current.engaged = false;
      current.blocked = entry.blocked;
      current.blockerId = entry.blockerId;
      current.blockerProgress = entry.blockerProgress;
      current.completed = entry.completed;
    }
    resetCombatState();
    if (state.combatState) {
      combatRevision = state.combatState.revision;
      combatSequence = state.combatState.sequence;
      for (const entry of state.combatState.health) {
        const current = combatHealthStates.get(entry.actorId);
        if (current) Object.assign(current, clone(entry));
      }
      for (const entry of state.combatState.emitters) {
        const current = combatEmitterStates.get(entry.emitterId);
        if (current) Object.assign(current, clone(entry));
      }
      for (const entry of state.combatState.projectiles) {
        const slot = combatProjectileSlots.find((candidate) => candidate.slotId === entry.slotId);
        if (slot) Object.assign(slot, clone(entry), { active: true });
      }
    }
    resetActorStates();
    for (const entry of state.actorStates || []) {
      const current = actorStates.get(entry.actorId);
      if (current) Object.assign(current, clone(entry));
    }
    actorRevision = Math.max(0, ...(state.actorStates || []).map((entry) => Number(entry.revision || 0)));
    if (!loadMap(state.activeMapId, null)) throw new Error("Saved map could not be loaded.");
    completedMapRules.clear();
    for (const id of state.completedMapRuleIds) completedMapRules.add(id);
    for (const id of Object.keys(gameplayVariables)) delete gameplayVariables[id];
    for (const [id, value] of Object.entries(state.variables)) gameplayVariables[id] = clone(value);
    const player = objects.find((object) => object.kind === "player");
    if (player && state.player) {
      player.x = state.player.x;
      player.y = state.player.y;
      setObjectZ(player, state.player.z);
      player.vx = 0;
      player.vy = 0;
      player.grounded = false;
      player.jumpHeld = false;
      player.coyoteTicksRemaining = 0;
      player.jumpBufferTicksRemaining = 0;
      if (state.elevationState?.transitionId) {
        player.elevationTransitionId = state.elevationState.transitionId;
        player.elevationSegmentId = state.elevationState.segmentId;
        player.elevationProgress = state.elevationState.progress;
        player.elevationSupportZ = state.elevationState.supportZ;
      } else clearElevationTransition(player, { emit: false });
    }
    if (player && state.worldStreamState) {
      refreshWorldStreamWindow(player);
      if (activeWorldStreamState.currentOrdinal !== state.worldStreamState.currentOrdinal || activeWorldStreamState.currentInstanceId !== state.worldStreamState.currentInstanceId || activeWorldStreamState.routeDigest !== state.worldStreamState.routeDigest) {
        throw new Error("Saved world-stream position does not match the deterministic authored route.");
      }
    }
    activeChoicePageId = state.activeChoicePageId;
    pendingChoiceId = state.pendingChoiceId;
    won = state.won;
    interactionHeld = false;
    portalCooldown = 0;
    activeTraversal = null;
    overlapContacts.clear();
    gameplayRevision += 1;
    events.length = 0;
    if (announce) emit("save.restored", { mapId: activeMap.id });
  }

  function restoreSaveState(input) {
    const validation = validateSaveState(input);
    if (!validation.valid) return { ok: false, error: validation.errors[0] || "Save state is invalid.", errors: validation.errors };
    const backup = exportSaveState();
    try {
      applyValidatedSaveState(validation.state, true);
      return { ok: true, state: getState(), saveState: exportSaveState() };
    } catch (error) {
      try {
        const backupValidation = validateSaveState(backup);
        if (backupValidation.valid) applyValidatedSaveState(backupValidation.state, false);
        else reset();
      } catch {
        reset();
      }
      events.length = 0;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  function getState() {
    const player = objects.find((object) => object.kind === "player");
    const worldBounds = activeWorldStreamState?.present ? activeWorldStreamState.worldBounds : null;
    return {
      activeMapId: activeMap.id,
      mapName: activeMap.name,
      width: Number(activeMap.width ?? project.width),
      height: Number(activeMap.height ?? project.height),
      worldBounds: worldBounds ? clone(worldBounds) : {
        minX: 0,
        minY: 0,
        maxX: Number(activeMap.width ?? project.width),
        maxY: Number(activeMap.height ?? project.height),
        width: Number(activeMap.width ?? project.width),
        height: Number(activeMap.height ?? project.height),
      },
      background: activeMap.background ?? project.background,
      gravity: Number(activeMap.gravity ?? project.gravity),
      controlMode: activeMap.controlMode ?? project.controlMode,
      projection: activeMap.projection ?? project.projection ?? { type: "orthographic", tileWidth: activeMap.grid ?? project.grid, tileHeight: activeMap.grid ?? project.grid },
      collectedCount: collectedIds.size,
      activeTraversalPathId: activeTraversal?.pathId ?? null,
      activeChoicePageId,
      gameplayRevision,
      variables: clone(gameplayVariables),
      completedRuleIds: [...completedRunRules].sort(),
      deterministicState: {
        activeInputCodes: [...inputs].sort(),
        activeActionIds: [...activeActionIds].sort(),
        overlapContactIds: [...overlapContacts].sort(),
        activeChoicePageId,
        pendingChoiceId,
      },
      motionBodies: getMotionBodyStates(),
      actors: getActorStates(),
      combat: { enabled: combatProgramEnabled(), revision: combatRevision, activeProjectileCount: combatProjectileSlots.filter((slot) => slot.active).length },
      worldStream: clone(activeWorldStreamState),
      player: player ? {
        id: player.id,
        x: Number(player.x),
        y: Number(player.y),
        z: Number(player.z || 0),
        vx: Number(player.vx || 0),
        vy: Number(player.vy || 0),
        grounded: Boolean(player.grounded),
        groundChainId: player.groundChainId ?? null,
        groundSegmentId: player.groundSegmentId ?? null,
        groundNormalX: Number(player.groundNormalX || 0),
        groundNormalY: Number.isFinite(player.groundNormalY) ? Number(player.groundNormalY) : -1,
        slopeSliding: Boolean(player.slopeSliding),
        elevationTransitionId: player.elevationTransitionId ?? null,
        elevationSegmentId: player.elevationSegmentId ?? null,
        elevationProgress: Number(player.elevationProgress || 0),
        elevationSupportZ: Number.isFinite(player.elevationSupportZ) ? Number(player.elevationSupportZ) : Number(player.z || 0),
      } : null,
      won,
    };
  }

  function getObjects() {
    return objects;
  }

  function getTraversalPaths() {
    return activePaths;
  }

  function getCollisionGeometry() {
    return {
      mapId: activeMap.id,
      geometry: clone(activeCollisionGeometry),
      segments: clone(activeCollisionSegments),
      tileCollision: {
        schemaVersion: activeTileRuntime.schemaVersion,
        objectCount: activeTileRuntime.collisionObjects.length,
        cellCount: activeTileRuntime.counts.collisionCells,
        objects: clone(activeTileRuntime.collisionObjects),
      },
    };
  }

  function getElevationTransitions() {
    return {
      mapId: activeMap.id,
      program: clone(activeElevationTransitions),
      segments: clone(activeElevationSegments),
    };
  }

  function getTileProgram() {
    return clone(activeMap.tileProgram ?? null);
  }

  function getTileRuntime() {
    return clone(activeTileRuntime);
  }

  function getWorldStreamState() {
    return clone(activeWorldStreamState);
  }

  function markWorldStreamDraw(observation = {}) {
    if (!activeWorldStreamRuntime?.present) return getWorldStreamState();
    activeWorldStreamState = activeWorldStreamRuntime.markDraw(observation);
    return getWorldStreamState();
  }

  function getGameplayState() {
    return {
      revision: gameplayRevision,
      variables: clone(gameplayVariables),
      completedRuleIds: [...completedRunRules].sort(),
      completedMapRuleIds: [...completedMapRules].sort(),
      activeActionIds: [...activeActionIds].sort(),
      overlapContactIds: [...overlapContacts].sort(),
      activeChoicePageId,
      pendingChoiceId,
      choice: getChoiceState(),
      clocks: clocks.map((clock) => ({ id: clock.id, label: clock.label, unit: clock.unit, variableId: clock.variableId, value: clone(gameplayVariables[clock.variableId]) })),
      hud: getHudState(),
    };
  }

  function getNavigation() {
    return activeMap.navigation || { version: 1, activeLayerId: "", layers: [], nodes: [], links: [], areas: [] };
  }

  reset();
  return { update, reset, loadMap, setInput, chooseChoice, drainEvents, getState, getObjects, getTraversalPaths, getCollisionGeometry, getElevationTransitions, getTileProgram, getTileRuntime, getWorldStreamState, markWorldStreamDraw, getMotionBodyStates, getActorStates, getCombatState, getNavigation, getGameplayState, getChoiceState, getHudState, validateSaveState, exportSaveState, restoreSaveState, colliderBox, overlaps, renderEntries, respawn };
}

export function measurePlatformerJumpEnvelope(project, options = {}) {
  const cloneValue = (value) => JSON.parse(JSON.stringify(value));
  const maps = Array.isArray(project?.maps) && project.maps.length
    ? project.maps
    : [{
        id: "main",
        name: "Main map",
        width: project?.width,
        height: project?.height,
        gravity: project?.gravity,
        controlMode: project?.controlMode,
        movementTuning: project?.movementTuning,
        objects: project?.objects || [],
      }];
  const activeMap = maps.find((map) => map.id === options.mapId) || maps[0];
  if ((activeMap?.controlMode ?? project?.controlMode) !== "platformer") return null;
  const sourcePlayer = (activeMap.objects || []).find((object) => object.kind === "player" && !object.hidden);
  if (!sourcePlayer) return null;
  const gravity = Number(activeMap.gravity ?? project.gravity ?? 1500);
  if (!Number.isFinite(gravity) || gravity <= 0) return null;
  const sourceCollider = sourcePlayer.collider || { enabled: true, offsetX: 0, offsetY: 0, width: sourcePlayer.width, height: sourcePlayer.height };
  const colliderHeight = Math.max(1, Number(sourceCollider.height ?? sourcePlayer.height ?? 1));
  const colliderOffsetY = Number(sourceCollider.offsetY || 0);
  const groundTop = 1000;
  const probePlayer = {
    ...cloneValue(sourcePlayer),
    id: "looplab-jump-envelope-player",
    x: 200,
    y: groundTop - colliderOffsetY - colliderHeight,
    z: 0,
    supportZ: 0,
    hidden: false,
    solid: false,
    collider: { ...cloneValue(sourceCollider), enabled: true, trigger: false, oneWay: false, zMin: 0, zMax: 1 },
  };
  const probeGround = {
    id: "looplab-jump-envelope-ground",
    kind: "platform",
    name: "Jump envelope ground",
    x: 0,
    y: groundTop,
    z: 0,
    supportZ: 0,
    width: 2000,
    height: 32,
    solid: true,
    hidden: false,
    collider: { enabled: true, offsetX: 0, offsetY: 0, width: 2000, height: 32, trigger: false, oneWay: true, zMin: 0, zMax: 1 },
  };
  const probeMap = {
    id: "looplab-jump-envelope-map",
    name: "Jump envelope probe",
    width: 2000,
    height: 1400,
    background: "#d9d9d9",
    gravity,
    grid: Number(activeMap.grid ?? project.grid ?? 20),
    controlMode: "platformer",
    movementTuning: cloneValue(activeMap.movementTuning ?? project.movementTuning ?? {}),
    objects: [probePlayer, probeGround],
  };
  const probeProject = {
    width: probeMap.width,
    height: probeMap.height,
    background: probeMap.background,
    gravity,
    grid: probeMap.grid,
    controlMode: "platformer",
    movementTuning: cloneValue(project.movementTuning ?? {}),
    inputActions: [{ id: "jump", label: "Jump", bindings: ["Space"] }],
    objects: probeMap.objects,
    maps: [probeMap],
    startMapId: probeMap.id,
    activeMapId: probeMap.id,
  };
  const runtime = createRuntimeModel(probeProject);
  const tickRate = 60;
  const dt = 1 / tickRate;
  runtime.update(dt);
  const settledPlayer = runtime.getObjects().find((object) => object.kind === "player");
  const settledBox = runtime.colliderBox(settledPlayer);
  if (!settledBox || !runtime.getState().player?.grounded) return null;
  const startFootY = settledBox.y + settledBox.height;
  let minimumFootY = startFootY;
  let apexTick = 0;
  let takeoffTick = null;
  let landingTick = null;
  runtime.setInput("jump", true);
  const maximumTicks = Math.max(60, Math.min(600, Number(options.maximumTicks ?? 360)));
  for (let tick = 1; tick <= maximumTicks; tick += 1) {
    const emitted = runtime.update(dt);
    if (takeoffTick == null && emitted.some((event) => event.type === "player.jumped")) takeoffTick = tick;
    const player = runtime.getObjects().find((object) => object.kind === "player");
    const box = runtime.colliderBox(player);
    if (box) {
      const footY = box.y + box.height;
      if (footY < minimumFootY) {
        minimumFootY = footY;
        apexTick = tick;
      }
    }
    if (takeoffTick != null && emitted.some((event) => event.type === "player.landed")) {
      landingTick = tick;
      break;
    }
  }
  runtime.setInput("jump", false);
  if (takeoffTick == null || landingTick == null) return null;
  const airborneTicks = landingTick - takeoffTick + 1;
  const maxRunSpeed = Number(activeMap.movementTuning?.maxRunSpeed ?? project.movementTuning?.maxRunSpeed ?? 260);
  return {
    method: "fork-and-step-runtime",
    tickRate,
    takeoffTick,
    apexTick,
    landingTick,
    airborneTicks,
    maxRise: startFootY - minimumFootY,
    maximumHorizontalTravel: Math.max(0, maxRunSpeed) * airborneTicks / tickRate,
    horizontalPolicy: "max-run-speed upper bound across measured airtime",
  };
}
