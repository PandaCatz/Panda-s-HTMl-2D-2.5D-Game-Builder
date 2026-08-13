import { canonicalSha256 } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_INTERACTABLE_TEMPLATE_SCHEMA = "looplab-interactable-template/v1";
export const LOOPLAB_INTERACTABLE_REGISTRY_SCHEMA = "looplab-interactable-template-registry/v1";
export const LOOPLAB_INTERACTABLE_INSTANCE_SCHEMA = "looplab-interactable-instance/v1";
export const LOOPLAB_INTERACTABLE_PREVIEW_SCHEMA = "looplab-interactable-template-preview/v1";
export const LOOPLAB_INTERACTABLE_REPORT_SCHEMA = "looplab-interactable-report/v1";

export const LOOPLAB_INTERACTABLE_KINDS = Object.freeze([
  "spring",
  "ladder",
  "conveyor",
  "crumble-platform",
  "key",
  "door",
  "pressure-plate",
  "one-way-platform",
]);

export const LOOPLAB_INTERACTABLE_RUNTIME_STATE_KEYS = Object.freeze([
  "dropThroughTicks",
  "interactableStateTicks",
]);

export const LOOPLAB_INTERACTABLE_LIMITS = Object.freeze({
  maximumInstancesPerMap: 256,
  maximumObjectsPerInstance: 4,
  maximumCoordinateMagnitude: 1_000_000,
  maximumDimension: 8192,
  maximumParameterStringLength: 128,
  maximumTicks: 36_000,
  maximumSpeed: 4_000,
});

export const LOOPLAB_INTERACTABLE_POLICY = Object.freeze({
  fixedTick: true,
  rendererNeutral: true,
  collisionOwner: "authored-map",
  artAuthority: false,
  providerRequired: false,
  implicitProximitySnap: false,
  sensorPolicy: "Springs, ladders, keys, and pressure plates use authored trigger colliders. Thin sensors are evaluated with a swept player test so a fast body cannot tunnel through them.",
  solidPolicy: "Doors, conveyors, crumble platforms, and one-way platforms use authored solid colliders. Generated artwork never creates or changes collision.",
  supportPolicy: "Conveyors and crumble platforms react only to the exact resolved support object, never to visual proximity.",
  templatePolicy: "Template defaults are versioned and content-digested. Instance overrides remain explicit and are never silently rewritten by a later template revision.",
  evidencePolicy: "Each template ships feature-contract, acceptance, and replay fixture templates. Those templates are starting evidence contracts, not proof that an applied instance already passed.",
});

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const stableId = (value) => typeof value === "string" && STABLE_ID.test(value);
const boundedString = (value) => typeof value === "string" && value.length <= LOOPLAB_INTERACTABLE_LIMITS.maximumParameterStringLength;

function numberParameter(label, defaultValue, minimum, maximum, options = {}) {
  return Object.freeze({ type: options.integer ? "integer" : "number", label, default: defaultValue, minimum, maximum });
}

function booleanParameter(label, defaultValue) {
  return Object.freeze({ type: "boolean", label, default: defaultValue });
}

function enumParameter(label, defaultValue, values) {
  return Object.freeze({ type: "enum", label, default: defaultValue, values: Object.freeze([...values]) });
}

function stringParameter(label, defaultValue = "", options = {}) {
  return Object.freeze({ type: "string", label, default: defaultValue, stableId: options.stableId === true, optional: options.optional === true });
}

function contractTemplate(id, name, feedbackEvent, placementRules) {
  return Object.freeze({
    id: `feature-${id}-INSTANCE_ID`,
    name,
    visual: "Bind deliberate authored art or a reviewed asset; visuals never define the collider or behavior.",
    collision: "Use the exact authored collider materialized by the template and keep collisionOwner=authored-map.",
    inputAction: id === "ladder" || id === "key-door" || id === "one-way-platform" ? "Use declared semantic input actions and fresh presses where the template requires them." : "No implicit UI gesture is required unless an explicit instance override says otherwise.",
    animationState: `Present the authored ${id} runtime state without feeding presentation timing back into simulation.`,
    feedbackEvent,
    placementRules,
    responsiveRules: "Keep the complete visual bounds visible and readable across configured viewports; gameplay geometry remains in authored world coordinates.",
    acceptanceTests: [`accept-${id}-INSTANCE_ID`],
  });
}

function fixtureTemplates(id, assertion, eventType, inputs = []) {
  return Object.freeze({
    acceptance: Object.freeze({
      id: `accept-${id}-INSTANCE_ID`,
      name: `${id} instance behavior`,
      ownerId: `feature-${id}-INSTANCE_ID`,
      assertion,
      requirements: Object.freeze([
        Object.freeze({ target: "event-emitted", targetId: eventType, operator: "greater-or-equal", expected: 1, atTick: "CALIBRATE_FROM_PLACEMENT" }),
      ]),
    }),
    replay: Object.freeze({
      id: `replay-${id}-INSTANCE_ID`,
      name: `${id} deterministic replay`,
      tickRate: 60,
      tickCount: "CALIBRATE_FROM_PLACEMENT",
      inputs: Object.freeze(inputs.map((entry) => Object.freeze(entry))),
      expectedHash: "RECORD_AFTER_CURRENT_SOURCE_PASSES",
      requiredEvent: eventType,
    }),
  });
}

function template(input) {
  const content = {
    schemaVersion: LOOPLAB_INTERACTABLE_TEMPLATE_SCHEMA,
    revision: 1,
    authority: LOOPLAB_INTERACTABLE_POLICY,
    ...input,
  };
  return Object.freeze({ ...content, digest: canonicalSha256(content) });
}

const TEMPLATE_LIST = Object.freeze([
  template({
    id: "spring",
    label: "Spring / impulse pad",
    summary: "Launch the player from an authored swept trigger without making artwork or overlap proximity authoritative.",
    controlModes: Object.freeze(["platformer", "topdown"]),
    objectPlan: Object.freeze([Object.freeze({ role: "spring", kind: "spring", sensor: true })]),
    parameters: Object.freeze({
      width: numberParameter("Width", 64, 8, 1024),
      height: numberParameter("Height", 18, 4, 512),
      impulseX: numberParameter("Horizontal impulse", 0, -LOOPLAB_INTERACTABLE_LIMITS.maximumSpeed, LOOPLAB_INTERACTABLE_LIMITS.maximumSpeed),
      impulseY: numberParameter("Vertical impulse", -720, -LOOPLAB_INTERACTABLE_LIMITS.maximumSpeed, LOOPLAB_INTERACTABLE_LIMITS.maximumSpeed),
      velocityMode: enumParameter("Velocity mode", "set", ["set", "add"]),
      cooldownTicks: numberParameter("Cooldown ticks", 8, 0, 600, { integer: true }),
      topdownImpulseTicks: numberParameter("Top-down impulse duration", 12, 1, 120, { integer: true }),
    }),
    events: Object.freeze(["spring.launched"]),
    featureContract: contractTemplate("spring", "Authored spring launch", "spring.launched", "Give the player a readable approach and recovery/landing zone; do not place the trigger inside unrelated solid geometry."),
    fixtures: fixtureTemplates("spring", "The exact authored spring trigger launches the player once and emits spring.launched.", "spring.launched", []),
  }),
  template({
    id: "ladder",
    label: "Explicit ladder",
    summary: "Enter a gravity-replacing vertical controller only on a fresh interact press inside an authored ladder sensor.",
    controlModes: Object.freeze(["platformer"]),
    objectPlan: Object.freeze([Object.freeze({ role: "ladder", kind: "ladder", sensor: true })]),
    parameters: Object.freeze({
      width: numberParameter("Width", 32, 12, 512),
      height: numberParameter("Height", 192, 32, 4096),
      climbSpeed: numberParameter("Climb speed", 180, 20, 1200),
      snapSpeed: numberParameter("Horizontal alignment speed", 720, 20, 4000),
      exitImpulseY: numberParameter("Jump exit impulse", -260, -2000, 0),
      requireFreshInteract: booleanParameter("Require fresh interact", true),
    }),
    events: Object.freeze(["ladder.entered", "ladder.exited"]),
    featureContract: contractTemplate("ladder", "Explicit ladder traversal", "ladder.entered / ladder.exited", "Align authored entry/exit clearances with floors. Entry must remain explicit so nearby ladders never capture the player unexpectedly."),
    fixtures: fixtureTemplates("ladder", "A fresh interact press enters the exact ladder, vertical input climbs without gravity, and exit restores ordinary movement.", "ladder.entered", [{ tick: "ENTRY_TICK", action: "interact", pressed: true }, { tick: "CLIMB_TICK", action: "move-up", pressed: true }]),
  }),
  template({
    id: "conveyor",
    label: "Support-bound conveyor",
    summary: "Move a platformer only while the conveyor is the exact resolved support object.",
    controlModes: Object.freeze(["platformer"]),
    objectPlan: Object.freeze([Object.freeze({ role: "conveyor", kind: "conveyor", sensor: false })]),
    parameters: Object.freeze({
      width: numberParameter("Width", 160, 24, 4096),
      height: numberParameter("Height", 24, 8, 512),
      speed: numberParameter("Belt speed", 120, -1200, 1200),
      oneWay: booleanParameter("One-way top", true),
    }),
    events: Object.freeze(["conveyor.engaged", "conveyor.disengaged"]),
    featureContract: contractTemplate("conveyor", "Exact-support conveyor carry", "conveyor.engaged / conveyor.disengaged", "Provide safe entry and exit space. The belt may affect the player only after collision resolves this exact object as ground support."),
    fixtures: fixtureTemplates("conveyor", "The player is displaced by belt speed only while grounded on this exact conveyor.", "conveyor.engaged", []),
  }),
  template({
    id: "crumble-platform",
    label: "Crumble platform",
    summary: "Arm on exact support, disable after a fixed warning, and optionally reset after a fixed simulation-tick delay.",
    controlModes: Object.freeze(["platformer"]),
    objectPlan: Object.freeze([Object.freeze({ role: "platform", kind: "crumble-platform", sensor: false })]),
    parameters: Object.freeze({
      width: numberParameter("Width", 128, 24, 4096),
      height: numberParameter("Height", 24, 8, 512),
      warningTicks: numberParameter("Warning ticks", 30, 1, LOOPLAB_INTERACTABLE_LIMITS.maximumTicks, { integer: true }),
      disabledTicks: numberParameter("Disabled ticks", 120, 1, LOOPLAB_INTERACTABLE_LIMITS.maximumTicks, { integer: true }),
      reset: booleanParameter("Reset", true),
      hideWhenDisabled: booleanParameter("Hide when disabled", true),
    }),
    events: Object.freeze(["crumble.armed", "crumble.fell", "crumble.reset"]),
    featureContract: contractTemplate("crumble-platform", "Tick-authored crumble platform", "crumble.armed / crumble.fell / crumble.reset", "Provide a readable warning, a survivable destination, and enough clearance to reset without intersecting the player."),
    fixtures: fixtureTemplates("crumble-platform", "Exact support arms the platform; authored tick counts disable and reset it deterministically.", "crumble.fell", []),
  }),
  template({
    id: "key-door",
    label: "Key and locked door",
    summary: "Collect a stable logical key and open its authored solid door using a fresh interact press near the door.",
    controlModes: Object.freeze(["platformer", "topdown"]),
    objectPlan: Object.freeze([
      Object.freeze({ role: "key", kind: "key", sensor: true }),
      Object.freeze({ role: "door", kind: "door", sensor: false }),
    ]),
    parameters: Object.freeze({
      keyId: stringParameter("Logical key ID", "", { stableId: true, optional: true }),
      keyWidth: numberParameter("Key width", 28, 8, 256),
      keyHeight: numberParameter("Key height", 28, 8, 256),
      doorWidth: numberParameter("Door width", 48, 12, 1024),
      doorHeight: numberParameter("Door height", 112, 24, 4096),
      doorOffsetX: numberParameter("Door offset X", 176, -8192, 8192),
      doorOffsetY: numberParameter("Door ground-anchor offset Y", 0, -8192, 8192),
      interactionRadius: numberParameter("Door interaction radius", 28, 0, 512),
      autoOpen: booleanParameter("Open automatically", false),
    }),
    events: Object.freeze(["key.collected", "door.opened", "door.locked"]),
    featureContract: contractTemplate("key-door", "Logical key and authored door", "key.collected / door.opened", "Make the key readable before the door decision and keep the closed door's authored collider aligned with its visible footprint."),
    fixtures: fixtureTemplates("key-door", "The collected logical key unlocks only its matching door and the open door stops colliding.", "door.opened", [{ tick: "DOOR_TICK", action: "interact", pressed: true }]),
  }),
  template({
    id: "pressure-plate",
    label: "Pressure plate and hold gate",
    summary: "Open a dedicated authored gate while the player occupies a swept plate sensor and close it on release.",
    controlModes: Object.freeze(["platformer", "topdown"]),
    objectPlan: Object.freeze([
      Object.freeze({ role: "plate", kind: "pressure-plate", sensor: true }),
      Object.freeze({ role: "gate", kind: "door", sensor: false }),
    ]),
    parameters: Object.freeze({
      plateWidth: numberParameter("Plate width", 56, 12, 1024),
      plateHeight: numberParameter("Plate height", 12, 4, 256),
      gateWidth: numberParameter("Gate width", 48, 12, 1024),
      gateHeight: numberParameter("Gate height", 112, 24, 4096),
      gateOffsetX: numberParameter("Gate offset X", 192, -8192, 8192),
      gateOffsetY: numberParameter("Gate ground-anchor offset Y", 0, -8192, 8192),
      latch: booleanParameter("Latch after press", false),
    }),
    events: Object.freeze(["plate.pressed", "plate.released", "door.opened", "door.closed"]),
    featureContract: contractTemplate("pressure-plate", "Pressure plate hold gate", "plate.pressed / plate.released", "Keep the plate reachable, make the controlled gate relationship visually legible, and verify the release route cannot trap the player unfairly."),
    fixtures: fixtureTemplates("pressure-plate", "Plate enter opens only its bound gate; plate exit closes a non-latched gate.", "plate.pressed", []),
  }),
  template({
    id: "one-way-platform",
    label: "Drop-through one-way platform",
    summary: "Collide only from above and disable only the exact supported platform during a deliberate down+jump drop.",
    controlModes: Object.freeze(["platformer"]),
    objectPlan: Object.freeze([Object.freeze({ role: "platform", kind: "one-way-platform", sensor: false })]),
    parameters: Object.freeze({
      width: numberParameter("Width", 160, 24, 4096),
      height: numberParameter("Height", 20, 4, 512),
      dropThroughTicks: numberParameter("Drop-through ticks", 12, 2, 120, { integer: true }),
      dropNudge: numberParameter("Downward release nudge", 3, 0, 32),
    }),
    events: Object.freeze(["one-way.dropped"]),
    featureContract: contractTemplate("one-way-platform", "Target-specific drop-through platform", "one-way.dropped", "Provide visible space below the platform and ensure down+jump cannot disable any unrelated one-way surface."),
    fixtures: fixtureTemplates("one-way-platform", "The player lands from above, passes from below, and down+jump disables only the exact supported platform for bounded ticks.", "one-way.dropped", [{ tick: "DROP_TICK", action: "move-down", pressed: true }, { tick: "DROP_TICK", action: "jump", pressed: true }]),
  }),
]);

const TEMPLATE_BY_ID = new Map(TEMPLATE_LIST.map((entry) => [entry.id, entry]));

const REGISTRY_CONTENT = Object.freeze({
  schemaVersion: LOOPLAB_INTERACTABLE_REGISTRY_SCHEMA,
  revision: 1,
  templates: TEMPLATE_LIST,
  policy: LOOPLAB_INTERACTABLE_POLICY,
});

export const LOOPLAB_INTERACTABLE_TEMPLATE_REGISTRY = Object.freeze({
  ...REGISTRY_CONTENT,
  digest: canonicalSha256(REGISTRY_CONTENT),
});

function parameterError(definition, value, path) {
  if (definition.type === "number" || definition.type === "integer") {
    if (!finite(value) || (definition.type === "integer" && !Number.isSafeInteger(value))) return `${path} must be a finite ${definition.type}.`;
    if (value < definition.minimum || value > definition.maximum) return `${path} must be from ${definition.minimum} through ${definition.maximum}.`;
    return null;
  }
  if (definition.type === "boolean") return typeof value === "boolean" ? null : `${path} must be boolean.`;
  if (definition.type === "enum") return definition.values.includes(value) ? null : `${path} must be one of ${definition.values.join(", ")}.`;
  if (definition.type === "string") {
    if (!boundedString(value)) return `${path} must be a bounded string.`;
    if (!value && definition.optional) return null;
    if (definition.stableId && !stableId(value)) return `${path} must be a stable ID.`;
    return null;
  }
  return `${path} has an unsupported parameter definition.`;
}

export function resolveInteractableParameters(templateId, input = {}) {
  const selected = TEMPLATE_BY_ID.get(String(templateId ?? "").trim());
  if (!selected) throw new Error(`Unknown interactable template: ${String(templateId || "(empty)")}.`);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Interactable parameters must be an object.");
  const unknown = Object.keys(input).filter((key) => !Object.prototype.hasOwnProperty.call(selected.parameters, key)).sort();
  if (unknown.length) throw new Error(`Unknown ${selected.id} parameter${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`);
  const parameters = {};
  const overrides = {};
  for (const [key, definition] of Object.entries(selected.parameters)) {
    const explicit = Object.prototype.hasOwnProperty.call(input, key);
    const value = explicit ? input[key] : definition.default;
    const error = parameterError(definition, value, `parameters.${key}`);
    if (error) throw new Error(error);
    parameters[key] = clone(value);
    if (explicit) overrides[key] = clone(value);
  }
  return { template: selected, parameters, overrides };
}

function collider(width, height, { trigger = false, oneWay = false, z = 0 } = {}) {
  return { enabled: true, offsetX: 0, offsetY: 0, width, height, trigger, oneWay, zMin: z, zMax: z + 1 };
}

function baseObject({ id, kind, name, x, y, z, width, height, color, solid, trigger = false, oneWay = false, metadata }) {
  return {
    id,
    kind,
    name,
    x,
    y,
    z,
    supportZ: z,
    width,
    height,
    color,
    solid,
    anchorMode: "ground",
    collisionOwner: "authored-map",
    groundAnchor: { offsetX: width / 2, offsetY: height },
    supportFootprint: { offsetX: 0, offsetY: Math.max(0, height - Math.min(height, 8)), width, height: Math.min(height, 8) },
    collider: collider(width, height, { trigger, oneWay, z }),
    interactable: metadata,
  };
}

function groundedObject({ anchorX, groundY, ...input }) {
  return baseObject({
    ...input,
    x: Number(anchorX) - Number(input.width) / 2,
    y: Number(groundY) - Number(input.height),
  });
}

function objectId(instanceId, role) {
  return `interactable-${instanceId}-${role}`;
}

function instanceMetadata(templateEntry, instanceId, role, parameters, overrides) {
  return {
    schemaVersion: LOOPLAB_INTERACTABLE_INSTANCE_SCHEMA,
    instanceId,
    templateId: templateEntry.id,
    templateRevision: templateEntry.revision,
    templateDigest: templateEntry.digest,
    role,
    parameters: clone(parameters),
    overrides: clone(overrides),
  };
}

function materializedObjects(templateEntry, instanceId, origin, parameters, overrides) {
  const { x, y, z } = origin;
  const meta = (role) => instanceMetadata(templateEntry, instanceId, role, parameters, overrides);
  if (templateEntry.id === "spring") {
    return [groundedObject({ id: objectId(instanceId, "spring"), kind: "spring", name: "Spring", anchorX: x, groundY: y, z, width: parameters.width, height: parameters.height, color: "#3c3f46", solid: false, trigger: true, metadata: meta("spring") })];
  }
  if (templateEntry.id === "ladder") {
    return [groundedObject({ id: objectId(instanceId, "ladder"), kind: "ladder", name: "Ladder", anchorX: x, groundY: y, z, width: parameters.width, height: parameters.height, color: "#5a5d64", solid: false, trigger: true, metadata: meta("ladder") })];
  }
  if (templateEntry.id === "conveyor") {
    return [groundedObject({ id: objectId(instanceId, "conveyor"), kind: "conveyor", name: "Conveyor", anchorX: x, groundY: y, z, width: parameters.width, height: parameters.height, color: "#34373d", solid: true, oneWay: parameters.oneWay, metadata: meta("conveyor") })];
  }
  if (templateEntry.id === "crumble-platform") {
    return [groundedObject({ id: objectId(instanceId, "platform"), kind: "crumble-platform", name: "Crumble platform", anchorX: x, groundY: y, z, width: parameters.width, height: parameters.height, color: "#55545a", solid: true, oneWay: true, metadata: meta("platform") })];
  }
  if (templateEntry.id === "key-door") {
    const keyId = parameters.keyId || `${instanceId}-key`;
    parameters = { ...parameters, keyId };
    const keyMeta = instanceMetadata(templateEntry, instanceId, "key", parameters, overrides);
    const doorMeta = instanceMetadata(templateEntry, instanceId, "door", parameters, overrides);
    return [
      groundedObject({ id: objectId(instanceId, "key"), kind: "key", name: "Key", anchorX: x, groundY: y, z, width: parameters.keyWidth, height: parameters.keyHeight, color: "#d4ad45", solid: false, trigger: true, metadata: keyMeta }),
      groundedObject({ id: objectId(instanceId, "door"), kind: "door", name: "Locked door", anchorX: x + parameters.doorOffsetX, groundY: y + parameters.doorOffsetY, z, width: parameters.doorWidth, height: parameters.doorHeight, color: "#36383d", solid: true, metadata: doorMeta }),
    ];
  }
  if (templateEntry.id === "pressure-plate") {
    const gateId = objectId(instanceId, "gate");
    parameters = { ...parameters, targetObjectIds: [gateId] };
    return [
      groundedObject({ id: objectId(instanceId, "plate"), kind: "pressure-plate", name: "Pressure plate", anchorX: x, groundY: y, z, width: parameters.plateWidth, height: parameters.plateHeight, color: "#696b70", solid: false, trigger: true, metadata: instanceMetadata(templateEntry, instanceId, "plate", parameters, overrides) }),
      groundedObject({ id: gateId, kind: "door", name: "Pressure gate", anchorX: x + parameters.gateOffsetX, groundY: y + parameters.gateOffsetY, z, width: parameters.gateWidth, height: parameters.gateHeight, color: "#33353a", solid: true, metadata: instanceMetadata(templateEntry, instanceId, "gate", parameters, overrides) }),
    ];
  }
  if (templateEntry.id === "one-way-platform") {
    return [groundedObject({ id: objectId(instanceId, "platform"), kind: "one-way-platform", name: "One-way platform", anchorX: x, groundY: y, z, width: parameters.width, height: parameters.height, color: "#3f4248", solid: true, oneWay: true, metadata: meta("platform") })];
  }
  throw new Error(`Interactable template ${templateEntry.id} has no materializer.`);
}

export function getInteractableTemplateRegistry() {
  return clone(LOOPLAB_INTERACTABLE_TEMPLATE_REGISTRY);
}

export function listInteractableTemplates({ query = "", controlMode, limit = 20, offset = 0 } = {}) {
  const normalizedQuery = String(query ?? "").trim().toLowerCase();
  const normalizedControlMode = String(controlMode ?? "").trim().toLowerCase();
  const start = Math.max(0, Math.floor(Number(offset) || 0));
  const maximum = Math.max(1, Math.min(50, Math.floor(Number(limit) || 20)));
  const matches = TEMPLATE_LIST.filter((entry) => {
    if (normalizedControlMode && !entry.controlModes.includes(normalizedControlMode)) return false;
    if (!normalizedQuery) return true;
    return [entry.id, entry.label, entry.summary, ...entry.events, ...entry.objectPlan.map((plan) => `${plan.role} ${plan.kind}`)].join(" ").toLowerCase().includes(normalizedQuery);
  });
  return {
    schemaVersion: LOOPLAB_INTERACTABLE_REGISTRY_SCHEMA,
    registryDigest: LOOPLAB_INTERACTABLE_TEMPLATE_REGISTRY.digest,
    total: matches.length,
    offset: start,
    limit: maximum,
    templates: matches.slice(start, start + maximum).map((entry) => ({ id: entry.id, revision: entry.revision, digest: entry.digest, label: entry.label, summary: entry.summary, controlModes: [...entry.controlModes], roles: entry.objectPlan.map((plan) => plan.role), events: [...entry.events] })),
    policy: clone(LOOPLAB_INTERACTABLE_POLICY),
  };
}

export function getInteractableTemplate(templateId) {
  const selected = TEMPLATE_BY_ID.get(String(templateId ?? "").trim());
  if (!selected) throw new Error(`Unknown interactable template: ${String(templateId || "(empty)")}.`);
  return { schemaVersion: LOOPLAB_INTERACTABLE_TEMPLATE_SCHEMA, registryDigest: LOOPLAB_INTERACTABLE_TEMPLATE_REGISTRY.digest, template: clone(selected), policy: clone(LOOPLAB_INTERACTABLE_POLICY) };
}

export function materializeInteractableTemplate({ templateId, instanceId, x, y, z = 0, parameters = {}, mapId = null, sourceDigest = null } = {}) {
  const normalizedInstanceId = String(instanceId ?? "").trim();
  if (!stableId(normalizedInstanceId)) throw new Error("instanceId must be a stable ID using letters, numbers, dots, underscores, colons, or hyphens.");
  const origin = { x: Number(x), y: Number(y), z: Number(z) };
  for (const [key, value] of Object.entries(origin)) if (!finite(value) || Math.abs(value) > LOOPLAB_INTERACTABLE_LIMITS.maximumCoordinateMagnitude) throw new Error(`${key} must be a bounded finite coordinate.`);
  const resolved = resolveInteractableParameters(templateId, parameters);
  const objects = materializedObjects(resolved.template, normalizedInstanceId, origin, clone(resolved.parameters), resolved.overrides);
  if (objects.length > LOOPLAB_INTERACTABLE_LIMITS.maximumObjectsPerInstance) throw new Error("Interactable template produced too many objects.");
  const payload = {
    schemaVersion: LOOPLAB_INTERACTABLE_PREVIEW_SCHEMA,
    registryDigest: LOOPLAB_INTERACTABLE_TEMPLATE_REGISTRY.digest,
    sourceDigest,
    mapId,
    instanceId: normalizedInstanceId,
    templateId: resolved.template.id,
    templateRevision: resolved.template.revision,
    templateDigest: resolved.template.digest,
    origin,
    parameters: clone(objects[0]?.interactable?.parameters ?? resolved.parameters),
    overrides: clone(resolved.overrides),
    objects,
    featureContractTemplate: clone(resolved.template.featureContract),
    fixtureTemplates: clone(resolved.template.fixtures),
    events: [...resolved.template.events],
    authority: clone(LOOPLAB_INTERACTABLE_POLICY),
  };
  return { ...payload, previewDigest: canonicalSha256(payload) };
}

function compareValues(first, second) {
  return canonicalSha256(first) === canonicalSha256(second);
}

export function inspectInteractables(project, options = {}) {
  const errors = [];
  const warnings = [];
  const entries = [];
  const maps = Array.isArray(project?.maps) && project.maps.length ? project.maps : [project];
  for (const map of maps) {
    const objects = Array.isArray(map?.objects) ? map.objects : [];
    const objectById = new Map(objects.map((object) => [object?.id, object]));
    const groups = new Map();
    for (const object of objects) {
      const metadata = object?.interactable;
      const isInteractableKind = LOOPLAB_INTERACTABLE_KINDS.includes(object?.kind);
      if (!metadata && !isInteractableKind) continue;
      const prefix = `maps.${map?.id ?? "(missing)"}.objects.${object?.id ?? "(missing)"}.interactable`;
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        errors.push(`${prefix} is required for interactable object kind ${object?.kind ?? "(missing)"}.`);
        continue;
      }
      const requiredFields = ["schemaVersion", "instanceId", "templateId", "templateRevision", "templateDigest", "role", "parameters", "overrides"];
      const extraFields = Object.keys(metadata).filter((key) => !requiredFields.includes(key)).sort();
      if (extraFields.length) errors.push(`${prefix} contains unsupported fields: ${extraFields.join(", ")}.`);
      if (metadata.schemaVersion !== LOOPLAB_INTERACTABLE_INSTANCE_SCHEMA) errors.push(`${prefix}.schemaVersion must be ${LOOPLAB_INTERACTABLE_INSTANCE_SCHEMA}.`);
      if (!stableId(metadata.instanceId)) errors.push(`${prefix}.instanceId must be a stable ID.`);
      const selected = TEMPLATE_BY_ID.get(metadata.templateId);
      if (!selected) errors.push(`${prefix}.templateId references an unknown template.`);
      if (selected && metadata.templateRevision !== selected.revision) errors.push(`${prefix}.templateRevision does not match the installed template revision.`);
      if (selected && metadata.templateDigest !== selected.digest) errors.push(`${prefix}.templateDigest does not match the installed template content.`);
      const plan = selected?.objectPlan.find((entry) => entry.role === metadata.role);
      if (selected && !plan) errors.push(`${prefix}.role is not declared by ${selected.id}.`);
      if (plan && object.kind !== plan.kind) errors.push(`${prefix} role ${plan.role} requires object kind ${plan.kind}.`);
      let resolved = null;
      if (selected) {
        try {
          resolved = resolveInteractableParameters(selected.id, metadata.overrides ?? {});
          const expectedParameters = { ...resolved.parameters };
          if (selected.id === "key-door" && !expectedParameters.keyId) expectedParameters.keyId = `${metadata.instanceId}-key`;
          if (selected.id === "pressure-plate") expectedParameters.targetObjectIds = [objectId(metadata.instanceId, "gate")];
          if (!compareValues(metadata.parameters, expectedParameters)) errors.push(`${prefix}.parameters do not equal template defaults plus explicit overrides.`);
        } catch (error) {
          errors.push(`${prefix}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (object.collisionOwner !== "authored-map") errors.push(`${prefix} requires collisionOwner=authored-map.`);
      if (!object.collider || object.collider.enabled === undefined) errors.push(`${prefix} requires an explicit authored collider.`);
      if (plan?.sensor === true && (object.solid !== false || object.collider?.trigger !== true)) errors.push(`${prefix} sensor role must be non-solid with collider.trigger=true.`);
      if (plan?.sensor === false && (object.solid !== true || object.collider?.trigger === true)) errors.push(`${prefix} solid role must be solid with collider.trigger=false.`);
      if (!selected?.controlModes.includes(map?.controlMode ?? project?.controlMode)) errors.push(`${prefix} template ${metadata.templateId} does not support control mode ${map?.controlMode ?? project?.controlMode}.`);
      const groupKey = `${map?.id ?? ""}:${metadata.instanceId}`;
      const group = groups.get(groupKey) ?? { mapId: map?.id ?? null, instanceId: metadata.instanceId, templateId: metadata.templateId, objectIds: [], roles: [] };
      if (group.templateId !== metadata.templateId) errors.push(`${prefix}.instanceId is shared by different templates.`);
      group.objectIds.push(object.id);
      group.roles.push(metadata.role);
      groups.set(groupKey, group);
      entries.push({ mapId: map?.id ?? null, objectId: object?.id ?? null, kind: object?.kind ?? null, instanceId: metadata.instanceId ?? null, templateId: metadata.templateId ?? null, role: metadata.role ?? null, templateDigest: metadata.templateDigest ?? null, valid: Boolean(selected && plan && resolved) });
    }
    if (groups.size > LOOPLAB_INTERACTABLE_LIMITS.maximumInstancesPerMap) errors.push(`Map ${map?.id ?? "(missing)"} exceeds ${LOOPLAB_INTERACTABLE_LIMITS.maximumInstancesPerMap} interactable instances.`);
    for (const group of groups.values()) {
      const selected = TEMPLATE_BY_ID.get(group.templateId);
      if (!selected) continue;
      const expectedRoles = selected.objectPlan.map((entry) => entry.role).sort();
      const actualRoles = [...group.roles].sort();
      if (!compareValues(expectedRoles, actualRoles)) errors.push(`Interactable instance ${group.instanceId} in map ${group.mapId} requires exact roles ${expectedRoles.join(", ")}; found ${actualRoles.join(", ") || "none"}.`);
      if (new Set(group.objectIds).size !== group.objectIds.length) errors.push(`Interactable instance ${group.instanceId} contains duplicate object IDs.`);
      if (selected.id === "pressure-plate") {
        const plate = objects.find((object) => object?.interactable?.instanceId === group.instanceId && object?.interactable?.role === "plate");
        for (const targetId of plate?.interactable?.parameters?.targetObjectIds ?? []) if (!objectById.has(targetId)) errors.push(`Pressure plate ${plate?.id ?? group.instanceId} references missing target ${targetId}.`);
      }
    }
  }
  const grouped = new Map();
  for (const entry of entries) {
    const key = `${entry.mapId}:${entry.instanceId}`;
    if (!grouped.has(key)) grouped.set(key, { mapId: entry.mapId, instanceId: entry.instanceId, templateId: entry.templateId, objectIds: [], roles: [] });
    grouped.get(key).objectIds.push(entry.objectId);
    grouped.get(key).roles.push(entry.role);
  }
  const instances = [...grouped.values()].sort((a, b) => `${a.mapId}:${a.instanceId}`.localeCompare(`${b.mapId}:${b.instanceId}`));
  if (options.requireEvidence === true && instances.length) {
    const acceptanceIds = new Set((project?.acceptanceTests ?? []).map((entry) => entry?.id));
    const replayIds = new Set((project?.replay?.cases ?? []).map((entry) => entry?.id));
    for (const instance of instances) {
      const acceptanceId = `accept-${instance.templateId}-${instance.instanceId}`;
      const replayId = `replay-${instance.templateId}-${instance.instanceId}`;
      if (!acceptanceIds.has(acceptanceId) || !replayIds.has(replayId)) warnings.push(`Interactable instance ${instance.instanceId} has reusable fixture templates but no current project acceptance/replay pair (${acceptanceId}, ${replayId}).`);
    }
  }
  return {
    schemaVersion: LOOPLAB_INTERACTABLE_REPORT_SCHEMA,
    present: entries.length > 0,
    valid: errors.length === 0,
    registryDigest: LOOPLAB_INTERACTABLE_TEMPLATE_REGISTRY.digest,
    templateCount: TEMPLATE_LIST.length,
    instanceCount: instances.length,
    objectCount: entries.length,
    entries: entries.sort((a, b) => `${a.mapId}:${a.objectId}`.localeCompare(`${b.mapId}:${b.objectId}`)),
    instances,
    errors,
    warnings,
    policy: clone(LOOPLAB_INTERACTABLE_POLICY),
  };
}

export function assertInteractablePreview(preview, { sourceDigest, templateDigest, previewDigest } = {}) {
  if (!preview || typeof preview !== "object" || Array.isArray(preview)) throw new Error("Interactable preview must be an object.");
  if (preview.schemaVersion !== LOOPLAB_INTERACTABLE_PREVIEW_SCHEMA) throw new Error(`Interactable preview schemaVersion must be ${LOOPLAB_INTERACTABLE_PREVIEW_SCHEMA}.`);
  if (sourceDigest && preview.sourceDigest !== sourceDigest) throw new Error(`[stale-source] Interactable preview expected ${preview.sourceDigest}, but the selected project is now ${sourceDigest}.`);
  if (templateDigest && preview.templateDigest !== templateDigest) throw new Error("Interactable template digest changed after preview; create a new preview.");
  const payload = clone(preview);
  const provided = payload.previewDigest;
  delete payload.previewDigest;
  const expected = canonicalSha256(payload);
  if (provided !== expected || (previewDigest && previewDigest !== expected)) throw new Error("Interactable preview digest does not match the exact materialized bundle.");
  return clone(preview);
}

export function removeInteractableInstance(project, { mapId, instanceId } = {}) {
  const normalized = clone(project);
  const maps = Array.isArray(normalized.maps) && normalized.maps.length ? normalized.maps : [normalized];
  const target = maps.find((map) => map.id === mapId);
  if (!target) throw new Error(`Map was not found: ${String(mapId || "(empty)")}.`);
  const removed = (target.objects ?? []).filter((object) => object?.interactable?.instanceId === instanceId);
  if (!removed.length) throw new Error(`Interactable instance was not found: ${String(instanceId || "(empty)")}.`);
  target.objects = (target.objects ?? []).filter((object) => object?.interactable?.instanceId !== instanceId);
  if (normalized.activeMapId === target.id) normalized.objects = clone(target.objects);
  return { project: normalized, removed: removed.map((object) => ({ id: object.id, role: object.interactable?.role, kind: object.kind })) };
}
