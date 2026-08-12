const VARIABLE_TYPES = new Set(["number", "boolean", "string"]);
const TRIGGER_TYPES = new Set(["event", "input", "overlap", "state"]);
const INPUT_PHASES = new Set(["pressed", "held", "released"]);
const OVERLAP_EDGES = new Set(["enter", "stay", "exit"]);
const ONCE_SCOPES = new Set(["never", "map", "run"]);
const CONDITION_OPERATORS = new Set(["eq", "ne", "gt", "gte", "lt", "lte", "truthy", "falsy"]);
const EFFECT_TYPES = new Set(["set-variable", "add-variable", "set-variable-expression", "toggle-variable", "set-object", "set-path", "emit", "load-map", "respawn", "win", "impulse-player", "collect-object", "open-choice-page", "close-choice-page", "advance-clock"]);
const EXPRESSION_OPERATORS = new Set(["add", "subtract", "multiply", "divide", "modulo", "min", "max", "clamp", "abs", "negate"]);
const HUD_REGIONS = new Set(["primary", "secondary", "ticker"]);
const EXPRESSION_MAX_DEPTH = 12;
const EXPRESSION_MAX_NODES = 64;
export const LOOPLAB_RUNTIME_OBJECT_CHANGE_KEYS = Object.freeze([
  "hidden",
  "solid",
  "color",
  "opacity",
  "colliderEnabled",
  "runtimeState",
  "active",
  "conducted",
  "cooldownTicks",
  "durationTicks",
  "elapsedTicks",
  "enabled",
  "energy",
  "health",
  "hp",
  "locked",
  "maxHp",
  "mode",
  "motionX",
  "motionY",
  "muted",
  "open",
  "ownerId",
  "pathId",
  "pathProgressVariableId",
  "phase",
  "pinTicks",
  "progress",
  "resonantTicks",
  "rootStage",
  "staggerTicks",
  "state",
  "supportId",
  "targetId",
  "threaded",
  "value",
]);
export const LOOPLAB_RUNTIME_OBJECT_STATE_KEYS = Object.freeze(
  LOOPLAB_RUNTIME_OBJECT_CHANGE_KEYS.filter((key) => !["hidden", "solid", "color", "opacity", "colliderEnabled", "runtimeState"].includes(key)),
);
const OBJECT_CHANGE_KEYS = new Set(LOOPLAB_RUNTIME_OBJECT_CHANGE_KEYS);
const PATH_CHANGE_KEYS = new Set(["enabled"]);
const CONDITION_OPERATOR_ALIASES = new Map([
  ["==", "eq"],
  ["===", "eq"],
  ["!=", "ne"],
  ["!==", "ne"],
  [">", "gt"],
  [">=", "gte"],
  ["<", "lt"],
  ["<=", "lte"],
]);

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const stableId = (value) => typeof value === "string" && /^[a-z0-9][a-z0-9._:-]*$/i.test(value);
const scalar = (value) => typeof value === "number" && Number.isFinite(value) || typeof value === "boolean" || typeof value === "string";
const normalizeConditionOperator = (value, fallback = "eq") => {
  const normalized = CONDITION_OPERATOR_ALIASES.get(value) ?? value;
  return CONDITION_OPERATORS.has(normalized) ? normalized : fallback;
};

function normalizeVariable(variable = {}) {
  const inferredType = typeof variable.initial === "boolean" ? "boolean" : typeof variable.initial === "string" ? "string" : "number";
  const type = VARIABLE_TYPES.has(variable.type) ? variable.type : inferredType;
  const initial = type === "number" ? Number(variable.initial ?? 0) : type === "boolean" ? Boolean(variable.initial) : String(variable.initial ?? "");
  return {
    ...clone(variable),
    id: String(variable.id ?? "").trim(),
    label: String(variable.label ?? variable.id ?? "").trim(),
    type,
    initial,
    min: type === "number" && Number.isFinite(Number(variable.min)) ? Number(variable.min) : undefined,
    max: type === "number" && Number.isFinite(Number(variable.max)) ? Number(variable.max) : undefined,
    visible: variable.visible === true,
  };
}

function normalizeCondition(condition = {}) {
  return {
    ...clone(condition),
    variableId: String(condition.variableId ?? "").trim(),
    operator: normalizeConditionOperator(condition.operator),
    value: scalar(condition.value) ? condition.value : null,
  };
}

function normalizeIntegerExpression(expression, depth = 0, budget = { count: 0 }) {
  budget.count += 1;
  if (depth > EXPRESSION_MAX_DEPTH || budget.count > EXPRESSION_MAX_NODES) return null;
  if (Number.isSafeInteger(expression)) return expression;
  if (!expression || typeof expression !== "object" || Array.isArray(expression)) return clone(expression);
  if (typeof expression.variableId === "string") return { variableId: expression.variableId.trim() };
  return {
    operator: typeof expression.operator === "string" ? expression.operator.trim() : "",
    operands: Array.isArray(expression.operands)
      ? expression.operands.slice(0, 9).map((operand) => normalizeIntegerExpression(operand, depth + 1, budget))
      : [],
  };
}

function normalizeTrigger(trigger = {}) {
  const type = TRIGGER_TYPES.has(trigger.type) ? trigger.type : "event";
  return {
    ...clone(trigger),
    type,
    event: typeof trigger.event === "string" ? trigger.event.trim() : undefined,
    actionId: typeof trigger.actionId === "string" ? trigger.actionId.trim() : undefined,
    phase: INPUT_PHASES.has(trigger.phase) ? trigger.phase : "pressed",
    objectId: typeof trigger.objectId === "string" ? trigger.objectId.trim() : undefined,
    mapId: typeof trigger.mapId === "string" ? trigger.mapId.trim() : undefined,
    edge: OVERLAP_EDGES.has(trigger.edge) ? trigger.edge : "enter",
    variableId: typeof trigger.variableId === "string" ? trigger.variableId.trim() : undefined,
    operator: normalizeConditionOperator(trigger.operator, "truthy"),
    value: scalar(trigger.value) ? trigger.value : null,
  };
}

function normalizeEffect(effect = {}) {
  const changes = effect.changes && typeof effect.changes === "object" && !Array.isArray(effect.changes)
    ? Object.fromEntries(Object.entries(effect.changes).filter(([key, value]) => OBJECT_CHANGE_KEYS.has(key) && scalar(value)))
    : undefined;
  const pathChanges = effect.changes && typeof effect.changes === "object" && !Array.isArray(effect.changes)
    ? Object.fromEntries(Object.entries(effect.changes).filter(([key]) => PATH_CHANGE_KEYS.has(key)))
    : undefined;
  return {
    ...clone(effect),
    type: EFFECT_TYPES.has(effect.type) ? effect.type : String(effect.type ?? "").trim(),
    variableId: typeof effect.variableId === "string" ? effect.variableId.trim() : undefined,
    value: scalar(effect.value) ? effect.value : undefined,
    expression: effect.expression === undefined ? undefined : normalizeIntegerExpression(effect.expression),
    objectId: typeof effect.objectId === "string" ? effect.objectId.trim() : undefined,
    pathId: typeof effect.pathId === "string" ? effect.pathId.trim() : undefined,
    pageId: typeof effect.pageId === "string" ? effect.pageId.trim() : undefined,
    clockId: typeof effect.clockId === "string" ? effect.clockId.trim() : undefined,
    steps: Number.isSafeInteger(effect.steps) ? effect.steps : 1,
    mapId: typeof effect.mapId === "string" ? effect.mapId.trim() : undefined,
    spawnId: typeof effect.spawnId === "string" ? effect.spawnId.trim() : undefined,
    event: typeof effect.event === "string" ? effect.event.trim() : undefined,
    detail: effect.detail && typeof effect.detail === "object" && !Array.isArray(effect.detail) ? clone(effect.detail) : undefined,
    changes: effect.type === "set-path" ? pathChanges : changes,
    x: Number.isFinite(Number(effect.x)) ? Number(effect.x) : 0,
    y: Number.isFinite(Number(effect.y)) ? Number(effect.y) : 0,
  };
}

function normalizeChoice(choice = {}) {
  return {
    ...clone(choice),
    id: String(choice.id ?? "").trim(),
    label: String(choice.label ?? choice.id ?? "").trim(),
    actionId: String(choice.actionId ?? "").trim(),
    visibleWhen: Array.isArray(choice.visibleWhen) ? choice.visibleWhen.map(normalizeCondition) : [],
    enabledWhen: Array.isArray(choice.enabledWhen) ? choice.enabledWhen.map(normalizeCondition) : [],
    effects: Array.isArray(choice.effects) ? choice.effects.map(normalizeEffect) : [],
    nextPageId: typeof choice.nextPageId === "string" ? choice.nextPageId.trim() : undefined,
    close: choice.close !== false,
  };
}

function normalizeChoicePage(page = {}) {
  return {
    ...clone(page),
    id: String(page.id ?? "").trim(),
    title: String(page.title ?? page.id ?? "").trim(),
    body: String(page.body ?? "").trim(),
    modal: page.modal !== false,
    choices: Array.isArray(page.choices) ? page.choices.map(normalizeChoice) : [],
  };
}

function normalizeClock(clock = {}) {
  return {
    ...clone(clock),
    id: String(clock.id ?? "").trim(),
    label: String(clock.label ?? clock.id ?? "").trim(),
    variableId: String(clock.variableId ?? "").trim(),
    unit: String(clock.unit ?? "turn").trim() || "turn",
    step: Number.isSafeInteger(clock.step) && clock.step > 0 ? clock.step : 1,
  };
}

function normalizeHudBinding(binding = {}) {
  return {
    ...clone(binding),
    id: String(binding.id ?? "").trim(),
    text: String(binding.text ?? "").trim(),
    ariaLabel: typeof binding.ariaLabel === "string" ? binding.ariaLabel.trim() : undefined,
    region: HUD_REGIONS.has(binding.region) ? binding.region : "primary",
    visibleWhen: Array.isArray(binding.visibleWhen) ? binding.visibleWhen.map(normalizeCondition) : [],
  };
}

function normalizeRule(rule = {}) {
  return {
    ...clone(rule),
    id: String(rule.id ?? "").trim(),
    name: String(rule.name ?? rule.id ?? "").trim(),
    enabled: rule.enabled !== false,
    trigger: normalizeTrigger(rule.trigger),
    conditions: Array.isArray(rule.conditions) ? rule.conditions.map(normalizeCondition) : [],
    once: ONCE_SCOPES.has(rule.once) ? rule.once : "run",
    effects: Array.isArray(rule.effects) ? rule.effects.map(normalizeEffect) : [],
  };
}

export function normalizeGameplayProgram(input = {}) {
  return {
    ...clone(input),
    version: 1,
    variables: Array.isArray(input.variables) ? input.variables.map(normalizeVariable) : [],
    rules: Array.isArray(input.rules) ? input.rules.map(normalizeRule) : [],
    choicePages: Array.isArray(input.choicePages) ? input.choicePages.map(normalizeChoicePage) : [],
    initialChoicePageId: typeof input.initialChoicePageId === "string" ? input.initialChoicePageId.trim() : undefined,
    clocks: Array.isArray(input.clocks) ? input.clocks.map(normalizeClock) : [],
    hudBindings: Array.isArray(input.hudBindings) ? input.hudBindings.map(normalizeHudBinding) : [],
  };
}

export function inspectGameplayProgram(project, input = project?.gameplayProgram) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { present: false, program: null, errors: [], warnings: [], metrics: { variableCount: 0, ruleCount: 0, executableRuleCount: 0, choicePageCount: 0, choiceCount: 0, clockCount: 0, hudBindingCount: 0, triggerTypes: [] } };
  }
  const program = normalizeGameplayProgram(input);
  const errors = [];
  const warnings = [];
  const variableIds = new Set();
  const variableDefinitions = new Map();
  const ruleIds = new Set();
  const pageIds = new Set();
  const choiceIds = new Set();
  const clockIds = new Set();
  const hudBindingIds = new Set();
  const actionIds = new Set((project?.inputActions ?? []).map((action) => action?.id).filter(stableId));
  const maps = project?.maps?.length ? project.maps : [{ id: project?.activeMapId ?? "map-main", objects: project?.objects ?? [], traversalPaths: project?.traversalPaths ?? [] }];
  const mapIds = new Set(maps.map((map) => map?.id).filter(stableId));
  const objectOwners = new Map();
  const pathOwners = new Map();
  for (const map of maps) {
    for (const object of map.objects ?? []) {
      if (!objectOwners.has(object.id)) objectOwners.set(object.id, []);
      objectOwners.get(object.id).push(map.id);
    }
    for (const path of map.traversalPaths ?? []) {
      if (!pathOwners.has(path.id)) pathOwners.set(path.id, []);
      pathOwners.get(path.id).push(map.id);
    }
  }

  for (const [index, variable] of program.variables.entries()) {
    const prefix = `gameplayProgram.variables[${index}]`;
    if (!stableId(variable.id)) errors.push(`${prefix}.id must be a stable non-empty id.`);
    else if (variableIds.has(variable.id)) errors.push(`${prefix}.id duplicates ${variable.id}.`);
    variableIds.add(variable.id);
    if (stableId(variable.id)) variableDefinitions.set(variable.id, variable);
    if (!variable.label) warnings.push(`${prefix} has no player-facing label.`);
    if (variable.type === "number") {
      if (!Number.isFinite(variable.initial)) errors.push(`${prefix}.initial must be finite for a number variable.`);
      if (variable.min !== undefined && variable.max !== undefined && variable.min > variable.max) errors.push(`${prefix}.min cannot exceed .max.`);
      if (variable.min !== undefined && variable.initial < variable.min || variable.max !== undefined && variable.initial > variable.max) errors.push(`${prefix}.initial must stay within its min/max bounds.`);
    }
  }

  const validateConditions = (conditions, prefix) => {
    for (const [conditionIndex, condition] of conditions.entries()) {
      const conditionPrefix = `${prefix}[${conditionIndex}]`;
      if (!variableIds.has(condition.variableId)) errors.push(`${conditionPrefix}.variableId references missing variable ${condition.variableId || "(empty)"}.`);
      if (!["truthy", "falsy"].includes(condition.operator) && !scalar(condition.value)) errors.push(`${conditionPrefix}.value must be a finite number, boolean, or string.`);
    }
  };

  const validateExpression = (expression, prefix, depth = 0, budget = { count: 0 }) => {
    budget.count += 1;
    if (depth > EXPRESSION_MAX_DEPTH) {
      errors.push(`${prefix} exceeds the maximum expression depth of ${EXPRESSION_MAX_DEPTH}.`);
      return;
    }
    if (budget.count > EXPRESSION_MAX_NODES) {
      errors.push(`${prefix} exceeds the maximum expression size of ${EXPRESSION_MAX_NODES} nodes.`);
      return;
    }
    if (Number.isSafeInteger(expression)) return;
    if (!expression || typeof expression !== "object" || Array.isArray(expression)) {
      errors.push(`${prefix} must be a safe integer, variable reference, or bounded expression node.`);
      return;
    }
    if (typeof expression.variableId === "string") {
      const definition = variableDefinitions.get(expression.variableId);
      if (!definition) errors.push(`${prefix}.variableId references missing variable ${expression.variableId || "(empty)"}.`);
      else if (definition.type !== "number") errors.push(`${prefix}.variableId must reference a number variable.`);
      return;
    }
    if (!EXPRESSION_OPERATORS.has(expression.operator)) {
      errors.push(`${prefix}.operator is unsupported: ${expression.operator || "(empty)"}.`);
      return;
    }
    const operands = Array.isArray(expression.operands) ? expression.operands : [];
    const count = operands.length;
    const validCount = ["abs", "negate"].includes(expression.operator)
      ? count === 1
      : expression.operator === "clamp"
        ? count === 3
        : ["subtract", "divide", "modulo"].includes(expression.operator)
          ? count === 2
          : count >= 2 && count <= 8;
    if (!validCount) errors.push(`${prefix}.operands has the wrong arity for ${expression.operator}.`);
    for (const [operandIndex, operand] of operands.entries()) validateExpression(operand, `${prefix}.operands[${operandIndex}]`, depth + 1, budget);
  };

  const textTokens = (text) => [...String(text ?? "").matchAll(/\{([A-Za-z0-9][A-Za-z0-9._:-]*)\}/g)].map((match) => match[1]);
  const validateTextTokens = (text, prefix) => {
    for (const token of textTokens(text)) if (!variableIds.has(token)) warnings.push(`${prefix} references unknown interpolation variable ${token}.`);
  };

  for (const [pageIndex, page] of program.choicePages.entries()) {
    const prefix = `gameplayProgram.choicePages[${pageIndex}]`;
    if (!stableId(page.id)) errors.push(`${prefix}.id must be a stable non-empty id.`);
    else if (pageIds.has(page.id)) errors.push(`${prefix}.id duplicates ${page.id}.`);
    pageIds.add(page.id);
  }
  for (const [clockIndex, clock] of program.clocks.entries()) {
    const prefix = `gameplayProgram.clocks[${clockIndex}]`;
    if (!stableId(clock.id)) errors.push(`${prefix}.id must be a stable non-empty id.`);
    else if (clockIds.has(clock.id)) errors.push(`${prefix}.id duplicates ${clock.id}.`);
    clockIds.add(clock.id);
  }

  const resolveOwner = (owners, id, mapId, prefix, kind) => {
    if (!stableId(id) || !owners.has(id)) {
      errors.push(`${prefix} references missing ${kind} ${id || "(empty)"}.`);
      return;
    }
    const ownerMaps = owners.get(id);
    if (mapId && !ownerMaps.includes(mapId)) errors.push(`${prefix} references ${kind} ${id} outside map ${mapId}.`);
    if (!mapId && ownerMaps.length > 1) errors.push(`${prefix} must provide mapId because ${kind} ${id} exists in multiple maps.`);
  };

  const validateEffect = (effect, effectPrefix, options = {}) => {
    if (!EFFECT_TYPES.has(effect.type)) {
      errors.push(`${effectPrefix}.type is unsupported: ${effect.type || "(empty)"}.`);
      return;
    }
    if (["set-variable", "add-variable", "set-variable-expression", "toggle-variable"].includes(effect.type) && !variableIds.has(effect.variableId)) errors.push(`${effectPrefix}.variableId references missing variable ${effect.variableId || "(empty)"}.`);
    if (["set-variable", "add-variable"].includes(effect.type) && !scalar(effect.value)) errors.push(`${effectPrefix}.value must be a finite number, boolean, or string.`);
    if (effect.type === "set-variable-expression") {
      if (variableDefinitions.get(effect.variableId)?.type !== "number") errors.push(`${effectPrefix}.variableId must reference a number variable.`);
      validateExpression(effect.expression, `${effectPrefix}.expression`);
    }
    if (effect.type === "set-object" || effect.type === "collect-object") resolveOwner(objectOwners, effect.objectId, effect.mapId, effectPrefix, "object");
    if (effect.type === "set-object" && (!effect.changes || !Object.keys(effect.changes).length)) errors.push(`${effectPrefix}.changes must contain an allowed runtime object field.`);
    if (effect.type === "set-path") {
      resolveOwner(pathOwners, effect.pathId, effect.mapId, effectPrefix, "path");
      if (!effect.changes || !Object.keys(effect.changes).length) errors.push(`${effectPrefix}.changes must contain enabled.`);
    }
    if (effect.type === "emit" && !effect.event) errors.push(`${effectPrefix}.event is required.`);
    if (effect.type === "load-map") {
      if (!effect.mapId || !mapIds.has(effect.mapId)) errors.push(`${effectPrefix}.mapId references a missing map.`);
      const target = maps.find((map) => map.id === effect.mapId);
      if (effect.spawnId && !target?.objects?.some((object) => object.kind === "spawn" && object.id === effect.spawnId)) errors.push(`${effectPrefix}.spawnId references a missing spawn in ${effect.mapId}.`);
    }
    if (effect.type === "open-choice-page" && !pageIds.has(effect.pageId)) errors.push(`${effectPrefix}.pageId references missing choice page ${effect.pageId || "(empty)"}.`);
    if (effect.type === "advance-clock") {
      if (!clockIds.has(effect.clockId)) errors.push(`${effectPrefix}.clockId references missing clock ${effect.clockId || "(empty)"}.`);
      if (!Number.isSafeInteger(effect.steps)) errors.push(`${effectPrefix}.steps must be a safe integer.`);
    }
    if (options.choice && ["open-choice-page", "close-choice-page"].includes(effect.type)) errors.push(`${effectPrefix}.type must use the choice's nextPageId or close fields instead of nested page-control effects.`);
  };

  for (const [pageIndex, page] of program.choicePages.entries()) {
    const prefix = `gameplayProgram.choicePages[${pageIndex}]`;
    if (!page.title) warnings.push(`${prefix} has no player-facing title.`);
    if (!page.body) warnings.push(`${prefix} has no player-facing body.`);
    if (!page.choices.length) errors.push(`${prefix}.choices must contain at least one choice.`);
    validateTextTokens(page.title, `${prefix}.title`);
    validateTextTokens(page.body, `${prefix}.body`);
    const actionIdsOnPage = new Set();
    for (const [choiceIndex, choice] of page.choices.entries()) {
      const choicePrefix = `${prefix}.choices[${choiceIndex}]`;
      if (!stableId(choice.id)) errors.push(`${choicePrefix}.id must be a stable non-empty id.`);
      else if (choiceIds.has(choice.id)) errors.push(`${choicePrefix}.id duplicates ${choice.id}; choice IDs must be globally unique.`);
      choiceIds.add(choice.id);
      if (!choice.label) errors.push(`${choicePrefix}.label must be player-facing text.`);
      validateTextTokens(choice.label, `${choicePrefix}.label`);
      if (!choice.actionId || !actionIds.has(choice.actionId)) errors.push(`${choicePrefix}.actionId must reference a declared semantic input action.`);
      else if (actionIdsOnPage.has(choice.actionId)) errors.push(`${choicePrefix}.actionId duplicates ${choice.actionId} on the same page.`);
      actionIdsOnPage.add(choice.actionId);
      validateConditions(choice.visibleWhen, `${choicePrefix}.visibleWhen`);
      validateConditions(choice.enabledWhen, `${choicePrefix}.enabledWhen`);
      if (choice.nextPageId && !pageIds.has(choice.nextPageId)) errors.push(`${choicePrefix}.nextPageId references missing choice page ${choice.nextPageId}.`);
      for (const [effectIndex, effect] of choice.effects.entries()) validateEffect(effect, `${choicePrefix}.effects[${effectIndex}]`, { choice: true });
    }
  }

  if (program.initialChoicePageId && !pageIds.has(program.initialChoicePageId)) errors.push(`gameplayProgram.initialChoicePageId references missing choice page ${program.initialChoicePageId}.`);

  for (const [clockIndex, clock] of program.clocks.entries()) {
    const prefix = `gameplayProgram.clocks[${clockIndex}]`;
    const definition = variableDefinitions.get(clock.variableId);
    if (!definition) errors.push(`${prefix}.variableId references missing variable ${clock.variableId || "(empty)"}.`);
    else if (definition.type !== "number" || !Number.isSafeInteger(definition.initial)) errors.push(`${prefix}.variableId must reference a number variable with a safe-integer initial value.`);
    if (!Number.isSafeInteger(clock.step) || clock.step <= 0) errors.push(`${prefix}.step must be a positive safe integer.`);
  }

  for (const [bindingIndex, binding] of program.hudBindings.entries()) {
    const prefix = `gameplayProgram.hudBindings[${bindingIndex}]`;
    if (!stableId(binding.id)) errors.push(`${prefix}.id must be a stable non-empty id.`);
    else if (hudBindingIds.has(binding.id)) errors.push(`${prefix}.id duplicates ${binding.id}.`);
    hudBindingIds.add(binding.id);
    if (!binding.text) errors.push(`${prefix}.text must be player-facing text.`);
    validateTextTokens(binding.text, `${prefix}.text`);
    if (binding.ariaLabel) validateTextTokens(binding.ariaLabel, `${prefix}.ariaLabel`);
    validateConditions(binding.visibleWhen, `${prefix}.visibleWhen`);
  }

  for (const [index, rule] of program.rules.entries()) {
    const prefix = `gameplayProgram.rules[${index}]`;
    if (!stableId(rule.id)) errors.push(`${prefix}.id must be a stable non-empty id.`);
    else if (ruleIds.has(rule.id)) errors.push(`${prefix}.id duplicates ${rule.id}.`);
    ruleIds.add(rule.id);
    if (!rule.name) warnings.push(`${prefix} has no player-facing name.`);
    if (!rule.effects.length) errors.push(`${prefix}.effects must contain at least one executable effect.`);
    if (rule.trigger.mapId && !mapIds.has(rule.trigger.mapId)) errors.push(`${prefix}.trigger.mapId references missing map ${rule.trigger.mapId}.`);
    if (rule.trigger.type === "event" && !rule.trigger.event) errors.push(`${prefix}.trigger.event is required for event rules.`);
    if (rule.trigger.type === "input" && (!rule.trigger.actionId || !actionIds.has(rule.trigger.actionId))) errors.push(`${prefix}.trigger.actionId must reference a declared input action.`);
    if (rule.trigger.type === "overlap") resolveOwner(objectOwners, rule.trigger.objectId, rule.trigger.mapId, `${prefix}.trigger`, "object");
    if (rule.trigger.type === "state" && rule.trigger.variableId) {
      if (!variableIds.has(rule.trigger.variableId)) errors.push(`${prefix}.trigger.variableId references missing variable ${rule.trigger.variableId}.`);
      if (!["truthy", "falsy"].includes(rule.trigger.operator) && !scalar(rule.trigger.value)) errors.push(`${prefix}.trigger.value must be a finite number, boolean, or string.`);
    }
    validateConditions(rule.conditions, `${prefix}.conditions`);
    for (const [effectIndex, effect] of rule.effects.entries()) {
      const effectPrefix = `${prefix}.effects[${effectIndex}]`;
      validateEffect(effect, effectPrefix);
      if (rule.once === "never" && rule.trigger.type === "event" && effect.type === "emit" && rule.trigger.event === effect.event) errors.push(`${effectPrefix} creates an unbounded direct event loop.`);
    }
  }

  const triggerTypes = [...new Set(program.rules.filter((rule) => rule.enabled).map((rule) => rule.trigger.type))];
  if (program.rules.length && !program.variables.length && program.rules.every((rule) => rule.trigger.type !== "input" && rule.trigger.type !== "overlap")) warnings.push("The gameplay program has no authored variables; verify that its event-only rules still create observable state changes.");
  return {
    present: true,
    program,
    errors,
    warnings,
    metrics: {
      variableCount: program.variables.length,
      ruleCount: program.rules.length,
      executableRuleCount: program.rules.filter((rule) => rule.enabled && rule.effects.length).length,
      choicePageCount: program.choicePages.length,
      choiceCount: program.choicePages.reduce((total, page) => total + page.choices.length, 0),
      clockCount: program.clocks.length,
      hudBindingCount: program.hudBindings.length,
      triggerTypes,
    },
  };
}

export const LOOPLAB_GAMEPLAY_RULE_POLICY = Object.freeze({
  version: 2,
  triggers: [...TRIGGER_TYPES],
  inputPhases: [...INPUT_PHASES],
  overlapEdges: [...OVERLAP_EDGES],
  effects: [...EFFECT_TYPES],
  expressionOperators: [...EXPRESSION_OPERATORS],
  expressionLimits: { maximumDepth: EXPRESSION_MAX_DEPTH, maximumNodes: EXPRESSION_MAX_NODES, integersOnly: true, executableStrings: false },
  systems: ["choice-pages", "dialogue", "clocks", "turn-and-day-advancement", "integer-formulas", "variable-bound-hud"],
  objectChangeKeys: [...LOOPLAB_RUNTIME_OBJECT_CHANGE_KEYS],
  objectChangeRule: "set-object may change only allowlisted scalar runtime state. IDs, assets, transforms, dimensions, anchors, support geometry, and collider structure remain authored-map data.",
  rule: "Complex mechanics must be executable deterministic rules: declared input, event, overlap, or state triggers; pressed/held/released action phases; enter/stay/exit overlap edges; typed variables; bounded effects; stable runtime IDs; and replay or acceptance evidence.",
});
