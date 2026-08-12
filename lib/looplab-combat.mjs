export const LOOPLAB_COMBAT_PROGRAM_SCHEMA = "looplab-combat-program/v1";
export const LOOPLAB_COMBAT_STATE_SCHEMA = "looplab-combat-state/v1";

export const LOOPLAB_COMBAT_LIMITS = Object.freeze({
  maximumTeams: 32,
  maximumActors: 128,
  maximumEmitters: 64,
  maximumProjectiles: 512,
  maximumPoolPerEmitter: 128,
  maximumSpeed: 8_192,
  maximumExtent: 256,
  maximumLifetimeTicks: 7_200,
  maximumCooldownTicks: 3_600,
  maximumInvulnerabilityTicks: 1_200,
  maximumDamage: 1_000_000,
  maximumHitPoints: 1_000_000,
  maximumPierce: 64,
  maximumTargetRange: 16_384,
});

export const LOOPLAB_COMBAT_POLICY = Object.freeze({
  sourceField: "project.combatProgram",
  geometryAuthority: "Authored object colliders remain the sole hit and world-collision geometry. Sprite pixels, generated art, and renderer bounds never create gameplay collision.",
  simulation: "Health, cooldowns, targeting, projectile pools, swept collision, hit resolution, and lifecycle events advance only on the deterministic fixed simulation tick.",
  targeting: "Teams and target-team IDs are explicit authored data. Nearest-target ties resolve by stable actor ID, never object-array or renderer order.",
  pooling: "Every emitter has a fixed logical pool and the program has a hard global ceiling. Exhaustion emits projectile.overflow and never allocates beyond the authored bound.",
  replay: "The newest replay projection includes every combat state field that can affect a later tick. Older projections remain frozen.",
  rendering: "Canvas, Phaser, Pixi, and melonJS may render combat state, but no renderer owns or advances it.",
  judgmentBoundary: "Project Doctor can verify bounds, references, deterministic policies, and executable evidence. It cannot certify balance, challenge, readability, or fun without playtest evidence.",
});

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const PROGRAM_FIELDS = new Set(["schemaVersion", "enabled", "maxProjectiles", "teams", "actors", "emitters", "acceptanceTestIds"]);
const TEAM_FIELDS = new Set(["id", "targetTeamIds"]);
const ACTOR_FIELDS = new Set(["id", "mapId", "objectId", "teamId", "maxHp", "initialHp", "invulnerabilityTicks", "deathBehavior"]);
const EMITTER_FIELDS = new Set(["id", "mapId", "ownerObjectId", "teamId", "trigger", "actionId", "cooldownTicks", "poolSize", "muzzle", "aim", "projectile"]);
const MUZZLE_FIELDS = new Set(["offsetX", "offsetY", "distance"]);
const AIM_FIELDS = new Set(["mode", "x", "y", "range"]);
const PROJECTILE_FIELDS = new Set(["speed", "width", "height", "zHeight", "lifetimeTicks", "damage", "pierce", "worldCollision", "color", "opacity"]);
const TRIGGERS = new Set(["pressed", "held", "automatic"]);
const AIM_MODES = new Set(["fixed", "movement", "nearest"]);
const DEATH_BEHAVIORS = new Set(["event-only", "hide", "respawn"]);
const TARGET_KINDS = new Set(["enemy", "hazard", "target", "boss"]);

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const stableId = (value) => typeof value === "string" && STABLE_ID.test(value);
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const integer = (value) => Number.isInteger(value);
const compareIds = (first, second) => String(first) < String(second) ? -1 : String(first) > String(second) ? 1 : 0;

function boundedNumber(value, fallback, minimum, maximum) {
  return finite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function boundedInteger(value, fallback, minimum, maximum) {
  return integer(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry ?? "").trim()).filter(Boolean))].sort(compareIds);
}

function normalizeTeam(team = {}) {
  return {
    id: String(team.id ?? "").trim(),
    targetTeamIds: normalizeIdList(team.targetTeamIds),
  };
}

function normalizeActor(actor = {}) {
  const maxHp = boundedInteger(actor.maxHp, 100, 1, LOOPLAB_COMBAT_LIMITS.maximumHitPoints);
  return {
    id: String(actor.id ?? "").trim(),
    mapId: String(actor.mapId ?? "").trim(),
    objectId: String(actor.objectId ?? "").trim(),
    teamId: String(actor.teamId ?? "").trim(),
    maxHp,
    initialHp: boundedInteger(actor.initialHp, maxHp, 0, maxHp),
    invulnerabilityTicks: boundedInteger(actor.invulnerabilityTicks, 0, 0, LOOPLAB_COMBAT_LIMITS.maximumInvulnerabilityTicks),
    deathBehavior: DEATH_BEHAVIORS.has(actor.deathBehavior) ? actor.deathBehavior : "event-only",
  };
}

function normalizeEmitter(emitter = {}) {
  const trigger = TRIGGERS.has(emitter.trigger) ? emitter.trigger : "pressed";
  const aimMode = AIM_MODES.has(emitter.aim?.mode) ? emitter.aim.mode : "fixed";
  return {
    id: String(emitter.id ?? "").trim(),
    mapId: String(emitter.mapId ?? "").trim(),
    ownerObjectId: String(emitter.ownerObjectId ?? "").trim(),
    teamId: String(emitter.teamId ?? "").trim(),
    trigger,
    ...(trigger === "automatic" ? {} : { actionId: String(emitter.actionId ?? "").trim() }),
    cooldownTicks: boundedInteger(emitter.cooldownTicks, 12, 1, LOOPLAB_COMBAT_LIMITS.maximumCooldownTicks),
    poolSize: boundedInteger(emitter.poolSize, 16, 1, LOOPLAB_COMBAT_LIMITS.maximumPoolPerEmitter),
    muzzle: {
      offsetX: boundedNumber(emitter.muzzle?.offsetX, 0, -LOOPLAB_COMBAT_LIMITS.maximumExtent, LOOPLAB_COMBAT_LIMITS.maximumExtent),
      offsetY: boundedNumber(emitter.muzzle?.offsetY, 0, -LOOPLAB_COMBAT_LIMITS.maximumExtent, LOOPLAB_COMBAT_LIMITS.maximumExtent),
      distance: boundedNumber(emitter.muzzle?.distance, 0, 0, LOOPLAB_COMBAT_LIMITS.maximumExtent),
    },
    aim: {
      mode: aimMode,
      x: boundedNumber(emitter.aim?.x, 1, -1, 1),
      y: boundedNumber(emitter.aim?.y, 0, -1, 1),
      range: boundedNumber(emitter.aim?.range, 1_024, 1, LOOPLAB_COMBAT_LIMITS.maximumTargetRange),
    },
    projectile: {
      speed: boundedNumber(emitter.projectile?.speed, 720, 1, LOOPLAB_COMBAT_LIMITS.maximumSpeed),
      width: boundedNumber(emitter.projectile?.width, 8, 0.25, LOOPLAB_COMBAT_LIMITS.maximumExtent),
      height: boundedNumber(emitter.projectile?.height, 8, 0.25, LOOPLAB_COMBAT_LIMITS.maximumExtent),
      zHeight: boundedNumber(emitter.projectile?.zHeight, 1, 0.001, LOOPLAB_COMBAT_LIMITS.maximumExtent),
      lifetimeTicks: boundedInteger(emitter.projectile?.lifetimeTicks, 120, 1, LOOPLAB_COMBAT_LIMITS.maximumLifetimeTicks),
      damage: boundedInteger(emitter.projectile?.damage, 1, 1, LOOPLAB_COMBAT_LIMITS.maximumDamage),
      pierce: boundedInteger(emitter.projectile?.pierce, 0, 0, LOOPLAB_COMBAT_LIMITS.maximumPierce),
      worldCollision: emitter.projectile?.worldCollision !== false,
      color: typeof emitter.projectile?.color === "string" && emitter.projectile.color.trim() ? emitter.projectile.color.trim() : "#f4f4f0",
      opacity: boundedNumber(emitter.projectile?.opacity, 1, 0, 1),
    },
  };
}

export function normalizeCombatProgram(input = {}) {
  return {
    schemaVersion: LOOPLAB_COMBAT_PROGRAM_SCHEMA,
    enabled: input.enabled !== false,
    maxProjectiles: boundedInteger(input.maxProjectiles, 128, 1, LOOPLAB_COMBAT_LIMITS.maximumProjectiles),
    teams: (Array.isArray(input.teams) ? input.teams : []).map(normalizeTeam).sort((first, second) => compareIds(first.id, second.id)),
    actors: (Array.isArray(input.actors) ? input.actors : []).map(normalizeActor).sort((first, second) => compareIds(first.id, second.id)),
    emitters: (Array.isArray(input.emitters) ? input.emitters : []).map(normalizeEmitter).sort((first, second) => compareIds(first.id, second.id)),
    acceptanceTestIds: normalizeIdList(input.acceptanceTestIds),
  };
}

export function suggestCombatProgram(project = {}, options = {}) {
  const maps = mapsForProject(project);
  const requestedMapId = typeof options.mapId === "string" ? options.mapId.trim() : "";
  const map = maps.find((candidate) => candidate?.id === requestedMapId)
    ?? maps.find((candidate) => candidate?.id === project?.activeMapId)
    ?? maps[0];
  const objects = Array.isArray(map?.objects) ? map.objects : [];
  const player = objects.find((object) => object?.kind === "player");
  const declaredActions = new Set((project?.inputActions ?? []).map((action) => action?.id).filter(stableId));
  const requestedActionId = typeof options.actionId === "string" ? options.actionId.trim() : "";
  const preferredActionId = [requestedActionId, "fire", "attack", "shoot", "blast", "interact"]
    .find((actionId) => declaredActions.has(actionId)) ?? null;
  if (!map || !player || !preferredActionId) {
    return {
      schemaVersion: "looplab-combat-suggestion/v1",
      provider: "none",
      available: false,
      mapId: map?.id ?? null,
      program: null,
      report: null,
      reasons: [
        ...(!map ? ["No authored map is available."] : []),
        ...(!player ? ["The selected map has no authored player object."] : []),
        ...(!preferredActionId ? ["Declare a semantic fire, attack, shoot, blast, or interact input action first."] : []),
      ],
      decisionBoundary: LOOPLAB_COMBAT_POLICY.judgmentBoundary,
    };
  }
  const requestedMaximum = integer(options.maxTargets) ? options.maxTargets : 8;
  const targetLimit = Math.max(0, Math.min(LOOPLAB_COMBAT_LIMITS.maximumActors - 1, requestedMaximum));
  const targets = objects
    .filter((object) => object?.id !== player.id && TARGET_KINDS.has(object?.kind) && object?.collider?.enabled !== false)
    .sort((first, second) => compareIds(first.id, second.id))
    .slice(0, targetLimit);
  const playerTeamId = "player-team";
  const enemyTeamId = "enemy-team";
  const program = normalizeCombatProgram({
    schemaVersion: LOOPLAB_COMBAT_PROGRAM_SCHEMA,
    enabled: true,
    maxProjectiles: 24,
    teams: [
      { id: playerTeamId, targetTeamIds: [enemyTeamId] },
      { id: enemyTeamId, targetTeamIds: [playerTeamId] },
    ],
    actors: [
      { id: "player-actor", mapId: map.id, objectId: player.id, teamId: playerTeamId, maxHp: 5, initialHp: 5, invulnerabilityTicks: 18, deathBehavior: "respawn" },
      ...targets.map((object, index) => ({ id: `target-${String(index + 1).padStart(2, "0")}-${object.id}`, mapId: map.id, objectId: object.id, teamId: enemyTeamId, maxHp: object.kind === "boss" ? 12 : 3, initialHp: object.kind === "boss" ? 12 : 3, invulnerabilityTicks: 4, deathBehavior: "hide" })),
    ],
    emitters: [{
      id: "player-primary",
      mapId: map.id,
      ownerObjectId: player.id,
      teamId: playerTeamId,
      trigger: "pressed",
      actionId: preferredActionId,
      cooldownTicks: 8,
      poolSize: 12,
      muzzle: { offsetX: 0, offsetY: -Math.max(2, Number(player.height ?? 16) * 0.45), distance: Math.max(6, Number(player.width ?? 16) * 0.6) },
      aim: { mode: targets.length ? "nearest" : "movement", x: 1, y: 0, range: Math.max(256, Math.min(1_024, Math.hypot(Number(map.width ?? 800), Number(map.height ?? 450)))) },
      projectile: { speed: 720, width: 7, height: 7, zHeight: 1, lifetimeTicks: 90, damage: 1, pierce: 0, worldCollision: true, color: "#d7d7d2", opacity: 1 },
    }],
    acceptanceTestIds: [],
  });
  const projected = { ...project, combatProgram: program };
  return {
    schemaVersion: "looplab-combat-suggestion/v1",
    provider: "none",
    available: true,
    mapId: map.id,
    actionId: preferredActionId,
    targetObjectIds: targets.map((object) => object.id),
    program,
    report: inspectCombatProgram(projected, program),
    instructions: targets.length
      ? "Review health, cooldown, damage, aim, and executable acceptance evidence before saving. Authored object colliders remain authoritative."
      : "No target-like objects were inferred. The starter uses movement aim; author explicit enemy or target actors before claiming a complete combat loop.",
    decisionBoundary: LOOPLAB_COMBAT_POLICY.judgmentBoundary,
  };
}

function unknownFields(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function mapsForProject(project) {
  return Array.isArray(project?.maps) && project.maps.length
    ? project.maps
    : [{ id: project?.activeMapId ?? "map-main", width: project?.width, height: project?.height, objects: project?.objects ?? [] }];
}

export function inspectCombatProgram(project, input = project?.combatProgram, options = {}) {
  const strict = options.strict === true;
  const issues = [];
  const add = (severity, code, message, context = {}) => issues.push({ severity, code, message, ...context });
  if (input === undefined) {
    return {
      schemaVersion: "looplab-combat-report/v1",
      present: false,
      enabled: false,
      valid: true,
      teamCount: 0,
      actorCount: 0,
      emitterCount: 0,
      poolCapacity: 0,
      errors: [],
      warnings: [],
      issues: [],
      program: null,
    };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    add("error", "combat-program-invalid", "combatProgram must be an object.", { path: "combatProgram" });
    return {
      schemaVersion: "looplab-combat-report/v1",
      present: true,
      enabled: false,
      valid: false,
      teamCount: 0,
      actorCount: 0,
      emitterCount: 0,
      poolCapacity: 0,
      errors: issues.map((issue) => issue.message),
      warnings: [],
      issues,
      program: null,
    };
  }

  const program = normalizeCombatProgram(input);
  const maps = mapsForProject(project);
  const mapsById = new Map(maps.map((map) => [map?.id, map]));
  const inputActions = new Map((project?.inputActions ?? []).filter((action) => stableId(action?.id)).map((action) => [action.id, action]));
  const acceptanceIds = new Set((project?.acceptanceTests ?? []).map((test) => test?.id).filter(stableId));
  const teamIds = new Set();
  const actorIds = new Set();
  const emitterIds = new Set();

  const programUnknown = unknownFields(input, PROGRAM_FIELDS);
  if (programUnknown.length) add("error", "combat-program-unknown-field", `combatProgram contains unsupported fields: ${programUnknown.join(", ")}.`, { path: "combatProgram" });
  if (input.schemaVersion !== LOOPLAB_COMBAT_PROGRAM_SCHEMA) add("error", "combat-program-schema", `combatProgram.schemaVersion must be ${LOOPLAB_COMBAT_PROGRAM_SCHEMA}.`, { path: "combatProgram.schemaVersion" });
  if (typeof input.enabled !== "boolean") add("error", "combat-program-enabled", "combatProgram.enabled must be boolean.", { path: "combatProgram.enabled" });
  if (!integer(input.maxProjectiles) || input.maxProjectiles < 1 || input.maxProjectiles > LOOPLAB_COMBAT_LIMITS.maximumProjectiles) add("error", "combat-program-capacity", `combatProgram.maxProjectiles must be an integer from 1 through ${LOOPLAB_COMBAT_LIMITS.maximumProjectiles}.`, { path: "combatProgram.maxProjectiles" });
  for (const field of ["teams", "actors", "emitters", "acceptanceTestIds"]) if (!Array.isArray(input[field])) add("error", "combat-program-array", `combatProgram.${field} must be an array.`, { path: `combatProgram.${field}` });
  if ((input.teams?.length ?? 0) > LOOPLAB_COMBAT_LIMITS.maximumTeams) add("error", "combat-team-count", `combatProgram declares more than ${LOOPLAB_COMBAT_LIMITS.maximumTeams} teams.`, { path: "combatProgram.teams" });
  if ((input.actors?.length ?? 0) > LOOPLAB_COMBAT_LIMITS.maximumActors) add("error", "combat-actor-count", `combatProgram declares more than ${LOOPLAB_COMBAT_LIMITS.maximumActors} actors.`, { path: "combatProgram.actors" });
  if ((input.emitters?.length ?? 0) > LOOPLAB_COMBAT_LIMITS.maximumEmitters) add("error", "combat-emitter-count", `combatProgram declares more than ${LOOPLAB_COMBAT_LIMITS.maximumEmitters} emitters.`, { path: "combatProgram.emitters" });

  for (const [index, raw] of (input.teams ?? []).entries()) {
    const path = `combatProgram.teams[${index}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { add("error", "combat-team-invalid", `${path} must be an object.`, { path }); continue; }
    const unknown = unknownFields(raw, TEAM_FIELDS);
    if (unknown.length) add("error", "combat-team-unknown-field", `${path} contains unsupported fields: ${unknown.join(", ")}.`, { path });
    if (!stableId(raw.id)) add("error", "combat-team-id", `${path}.id must be a stable ID.`, { path: `${path}.id` });
    else if (teamIds.has(raw.id)) add("error", "combat-team-duplicate", `${path}.id duplicates ${raw.id}.`, { path: `${path}.id`, teamId: raw.id });
    else teamIds.add(raw.id);
    if (!Array.isArray(raw.targetTeamIds) || raw.targetTeamIds.some((id) => !stableId(id)) || new Set(raw.targetTeamIds).size !== raw.targetTeamIds.length) add("error", "combat-team-targets", `${path}.targetTeamIds must be a unique array of stable team IDs.`, { path: `${path}.targetTeamIds`, teamId: raw.id });
  }
  for (const team of program.teams) for (const targetTeamId of team.targetTeamIds) if (!teamIds.has(targetTeamId)) add("error", "combat-team-target-missing", `Team ${team.id} targets missing team ${targetTeamId}.`, { teamId: team.id, targetTeamId });

  for (const [index, raw] of (input.actors ?? []).entries()) {
    const path = `combatProgram.actors[${index}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { add("error", "combat-actor-invalid", `${path} must be an object.`, { path }); continue; }
    const unknown = unknownFields(raw, ACTOR_FIELDS);
    if (unknown.length) add("error", "combat-actor-unknown-field", `${path} contains unsupported fields: ${unknown.join(", ")}.`, { path, actorId: raw.id });
    if (!stableId(raw.id)) add("error", "combat-actor-id", `${path}.id must be a stable ID.`, { path: `${path}.id` });
    else if (actorIds.has(raw.id)) add("error", "combat-actor-duplicate", `${path}.id duplicates ${raw.id}.`, { path: `${path}.id`, actorId: raw.id });
    else actorIds.add(raw.id);
    if (!stableId(raw.mapId) || !mapsById.has(raw.mapId)) add("error", "combat-actor-map", `${path}.mapId must reference an authored map.`, { path: `${path}.mapId`, actorId: raw.id, mapId: raw.mapId });
    const map = mapsById.get(raw.mapId);
    const object = map?.objects?.find((candidate) => candidate?.id === raw.objectId);
    if (!stableId(raw.objectId) || !object) add("error", "combat-actor-object", `${path}.objectId must reference an object on ${raw.mapId || "its map"}.`, { path: `${path}.objectId`, actorId: raw.id, mapId: raw.mapId, objectId: raw.objectId });
    else {
      if (!object.collider || object.collider.enabled === false) add("error", "combat-actor-collider", `Combat actor ${raw.id} requires an enabled authored collider on ${raw.objectId}.`, { actorId: raw.id, mapId: raw.mapId, objectId: raw.objectId });
      if (object.collisionOwner !== "authored-map") add("error", "combat-actor-authority", `Combat actor ${raw.id} must keep authored-map collision ownership.`, { actorId: raw.id, mapId: raw.mapId, objectId: raw.objectId });
    }
    if (!stableId(raw.teamId) || !teamIds.has(raw.teamId)) add("error", "combat-actor-team", `${path}.teamId must reference a declared team.`, { path: `${path}.teamId`, actorId: raw.id, teamId: raw.teamId });
    if (!integer(raw.maxHp) || raw.maxHp < 1 || raw.maxHp > LOOPLAB_COMBAT_LIMITS.maximumHitPoints) add("error", "combat-actor-max-hp", `${path}.maxHp must be an integer from 1 through ${LOOPLAB_COMBAT_LIMITS.maximumHitPoints}.`, { path: `${path}.maxHp`, actorId: raw.id });
    if (!integer(raw.initialHp) || raw.initialHp < 0 || raw.initialHp > raw.maxHp) add("error", "combat-actor-initial-hp", `${path}.initialHp must be an integer from 0 through maxHp.`, { path: `${path}.initialHp`, actorId: raw.id });
    if (!integer(raw.invulnerabilityTicks) || raw.invulnerabilityTicks < 0 || raw.invulnerabilityTicks > LOOPLAB_COMBAT_LIMITS.maximumInvulnerabilityTicks) add("error", "combat-actor-invulnerability", `${path}.invulnerabilityTicks must be a bounded non-negative integer.`, { path: `${path}.invulnerabilityTicks`, actorId: raw.id });
    if (!DEATH_BEHAVIORS.has(raw.deathBehavior)) add("error", "combat-actor-death", `${path}.deathBehavior must be event-only, hide, or respawn.`, { path: `${path}.deathBehavior`, actorId: raw.id });
    if (raw.deathBehavior === "respawn" && object?.kind !== "player") add("error", "combat-actor-respawn-kind", `Combat actor ${raw.id} can use respawn only when its object is the player.`, { actorId: raw.id, objectId: raw.objectId });
  }

  let poolCapacity = 0;
  for (const [index, raw] of (input.emitters ?? []).entries()) {
    const path = `combatProgram.emitters[${index}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { add("error", "combat-emitter-invalid", `${path} must be an object.`, { path }); continue; }
    const unknown = unknownFields(raw, EMITTER_FIELDS);
    if (unknown.length) add("error", "combat-emitter-unknown-field", `${path} contains unsupported fields: ${unknown.join(", ")}.`, { path, emitterId: raw.id });
    if (!stableId(raw.id)) add("error", "combat-emitter-id", `${path}.id must be a stable ID.`, { path: `${path}.id` });
    else if (emitterIds.has(raw.id)) add("error", "combat-emitter-duplicate", `${path}.id duplicates ${raw.id}.`, { path: `${path}.id`, emitterId: raw.id });
    else emitterIds.add(raw.id);
    if (!stableId(raw.mapId) || !mapsById.has(raw.mapId)) add("error", "combat-emitter-map", `${path}.mapId must reference an authored map.`, { path: `${path}.mapId`, emitterId: raw.id, mapId: raw.mapId });
    const map = mapsById.get(raw.mapId);
    const owner = map?.objects?.find((candidate) => candidate?.id === raw.ownerObjectId);
    if (!stableId(raw.ownerObjectId) || !owner) add("error", "combat-emitter-owner", `${path}.ownerObjectId must reference an object on ${raw.mapId || "its map"}.`, { path: `${path}.ownerObjectId`, emitterId: raw.id, mapId: raw.mapId, objectId: raw.ownerObjectId });
    if (!stableId(raw.teamId) || !teamIds.has(raw.teamId)) add("error", "combat-emitter-team", `${path}.teamId must reference a declared team.`, { path: `${path}.teamId`, emitterId: raw.id, teamId: raw.teamId });
    if (!TRIGGERS.has(raw.trigger)) add("error", "combat-emitter-trigger", `${path}.trigger must be pressed, held, or automatic.`, { path: `${path}.trigger`, emitterId: raw.id });
    if (raw.trigger === "automatic") {
      if (raw.actionId !== undefined) add("error", "combat-emitter-automatic-action", `${path} must omit actionId for an automatic emitter.`, { path: `${path}.actionId`, emitterId: raw.id });
    } else if (!stableId(raw.actionId) || !inputActions.has(raw.actionId)) add("error", "combat-emitter-action", `${path}.actionId must reference a declared semantic input action.`, { path: `${path}.actionId`, emitterId: raw.id, actionId: raw.actionId });
    else if (inputActions.get(raw.actionId)?.replayEvent === false) add("error", "combat-emitter-replay-action", `Emitter ${raw.id} action ${raw.actionId} is excluded from replay input.`, { emitterId: raw.id, actionId: raw.actionId });
    if (!integer(raw.cooldownTicks) || raw.cooldownTicks < 1 || raw.cooldownTicks > LOOPLAB_COMBAT_LIMITS.maximumCooldownTicks) add("error", "combat-emitter-cooldown", `${path}.cooldownTicks must be a bounded positive integer.`, { path: `${path}.cooldownTicks`, emitterId: raw.id });
    if (!integer(raw.poolSize) || raw.poolSize < 1 || raw.poolSize > LOOPLAB_COMBAT_LIMITS.maximumPoolPerEmitter) add("error", "combat-emitter-pool", `${path}.poolSize must be an integer from 1 through ${LOOPLAB_COMBAT_LIMITS.maximumPoolPerEmitter}.`, { path: `${path}.poolSize`, emitterId: raw.id });
    if (integer(raw.poolSize) && raw.poolSize > 0) poolCapacity += raw.poolSize;
    if (!raw.muzzle || typeof raw.muzzle !== "object" || Array.isArray(raw.muzzle)) add("error", "combat-emitter-muzzle", `${path}.muzzle must be an object.`, { path: `${path}.muzzle`, emitterId: raw.id });
    else {
      const fields = unknownFields(raw.muzzle, MUZZLE_FIELDS);
      if (fields.length) add("error", "combat-emitter-muzzle-field", `${path}.muzzle contains unsupported fields: ${fields.join(", ")}.`, { path: `${path}.muzzle`, emitterId: raw.id });
      for (const field of ["offsetX", "offsetY", "distance"]) if (!finite(raw.muzzle[field])) add("error", "combat-emitter-muzzle-number", `${path}.muzzle.${field} must be finite.`, { path: `${path}.muzzle.${field}`, emitterId: raw.id });
      if (finite(raw.muzzle.distance) && (raw.muzzle.distance < 0 || raw.muzzle.distance > LOOPLAB_COMBAT_LIMITS.maximumExtent)) add("error", "combat-emitter-muzzle-distance", `${path}.muzzle.distance is outside the deterministic bound.`, { path: `${path}.muzzle.distance`, emitterId: raw.id });
    }
    if (!raw.aim || typeof raw.aim !== "object" || Array.isArray(raw.aim)) add("error", "combat-emitter-aim", `${path}.aim must be an object.`, { path: `${path}.aim`, emitterId: raw.id });
    else {
      const fields = unknownFields(raw.aim, AIM_FIELDS);
      if (fields.length) add("error", "combat-emitter-aim-field", `${path}.aim contains unsupported fields: ${fields.join(", ")}.`, { path: `${path}.aim`, emitterId: raw.id });
      if (!AIM_MODES.has(raw.aim.mode)) add("error", "combat-emitter-aim-mode", `${path}.aim.mode must be fixed, movement, or nearest.`, { path: `${path}.aim.mode`, emitterId: raw.id });
      if (!finite(raw.aim.x) || !finite(raw.aim.y) || Math.hypot(raw.aim.x, raw.aim.y) <= 0.000001) add("error", "combat-emitter-aim-vector", `${path}.aim x/y must form a finite non-zero fallback direction.`, { path: `${path}.aim`, emitterId: raw.id });
      if (!finite(raw.aim.range) || raw.aim.range < 1 || raw.aim.range > LOOPLAB_COMBAT_LIMITS.maximumTargetRange) add("error", "combat-emitter-range", `${path}.aim.range must be finite and bounded.`, { path: `${path}.aim.range`, emitterId: raw.id });
    }
    if (!raw.projectile || typeof raw.projectile !== "object" || Array.isArray(raw.projectile)) add("error", "combat-projectile-invalid", `${path}.projectile must be an object.`, { path: `${path}.projectile`, emitterId: raw.id });
    else {
      const fields = unknownFields(raw.projectile, PROJECTILE_FIELDS);
      if (fields.length) add("error", "combat-projectile-field", `${path}.projectile contains unsupported fields: ${fields.join(", ")}.`, { path: `${path}.projectile`, emitterId: raw.id });
      if (!finite(raw.projectile.speed) || raw.projectile.speed <= 0 || raw.projectile.speed > LOOPLAB_COMBAT_LIMITS.maximumSpeed) add("error", "combat-projectile-speed", `${path}.projectile.speed must be finite, positive, and bounded.`, { path: `${path}.projectile.speed`, emitterId: raw.id });
      for (const field of ["width", "height", "zHeight"]) if (!finite(raw.projectile[field]) || raw.projectile[field] <= 0 || raw.projectile[field] > LOOPLAB_COMBAT_LIMITS.maximumExtent) add("error", "combat-projectile-extent", `${path}.projectile.${field} must be finite, positive, and bounded.`, { path: `${path}.projectile.${field}`, emitterId: raw.id });
      if (!integer(raw.projectile.lifetimeTicks) || raw.projectile.lifetimeTicks < 1 || raw.projectile.lifetimeTicks > LOOPLAB_COMBAT_LIMITS.maximumLifetimeTicks) add("error", "combat-projectile-lifetime", `${path}.projectile.lifetimeTicks must be a bounded positive integer.`, { path: `${path}.projectile.lifetimeTicks`, emitterId: raw.id });
      if (!integer(raw.projectile.damage) || raw.projectile.damage < 1 || raw.projectile.damage > LOOPLAB_COMBAT_LIMITS.maximumDamage) add("error", "combat-projectile-damage", `${path}.projectile.damage must be a bounded positive integer.`, { path: `${path}.projectile.damage`, emitterId: raw.id });
      if (!integer(raw.projectile.pierce) || raw.projectile.pierce < 0 || raw.projectile.pierce > LOOPLAB_COMBAT_LIMITS.maximumPierce) add("error", "combat-projectile-pierce", `${path}.projectile.pierce must be a bounded non-negative integer.`, { path: `${path}.projectile.pierce`, emitterId: raw.id });
      if (typeof raw.projectile.worldCollision !== "boolean") add("error", "combat-projectile-world-collision", `${path}.projectile.worldCollision must be boolean.`, { path: `${path}.projectile.worldCollision`, emitterId: raw.id });
      if (typeof raw.projectile.color !== "string" || !raw.projectile.color.trim()) add("error", "combat-projectile-color", `${path}.projectile.color must be a non-empty string.`, { path: `${path}.projectile.color`, emitterId: raw.id });
      if (!finite(raw.projectile.opacity) || raw.projectile.opacity < 0 || raw.projectile.opacity > 1) add("error", "combat-projectile-opacity", `${path}.projectile.opacity must be from 0 through 1.`, { path: `${path}.projectile.opacity`, emitterId: raw.id });
    }
  }

  if (poolCapacity > program.maxProjectiles) add("error", "combat-pool-global-capacity", `Emitter pools total ${poolCapacity}, exceeding combatProgram.maxProjectiles ${program.maxProjectiles}.`, { poolCapacity, maxProjectiles: program.maxProjectiles });
  for (const testId of program.acceptanceTestIds) if (!stableId(testId) || !acceptanceIds.has(testId)) add("error", "combat-evidence-invalid", `combatProgram references missing acceptance test ${testId || "(empty)"}.`, { testId });
  if (program.enabled && (program.actors.length || program.emitters.length) && program.acceptanceTestIds.length === 0) add(strict ? "warning" : "info", "combat-evidence-missing", "The enabled combat program has no linked executable acceptance test for firing, swept hits, health, and pool overflow.", {});
  for (const emitter of program.emitters) {
    const team = program.teams.find((candidate) => candidate.id === emitter.teamId);
    if (team && team.targetTeamIds.length === 0) add("warning", "combat-emitter-no-targets", `Emitter ${emitter.id} belongs to team ${team.id}, which targets no teams.`, { emitterId: emitter.id, teamId: team.id });
  }

  issues.sort((first, second) => compareIds(`${first.path ?? ""}:${first.actorId ?? ""}:${first.emitterId ?? ""}:${first.code}`, `${second.path ?? ""}:${second.actorId ?? ""}:${second.emitterId ?? ""}:${second.code}`));
  return {
    schemaVersion: "looplab-combat-report/v1",
    present: true,
    enabled: program.enabled,
    valid: !issues.some((issue) => issue.severity === "error"),
    teamCount: program.teams.length,
    actorCount: program.actors.length,
    emitterCount: program.emitters.length,
    poolCapacity,
    maxProjectiles: program.maxProjectiles,
    errors: issues.filter((issue) => issue.severity === "error").map((issue) => issue.message),
    warnings: issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message),
    issues,
    program: clone(program),
  };
}
