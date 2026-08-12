import { canonicalSha256 } from "./looplab-canonical-digest.mjs";
import { measurePlatformerJumpEnvelope } from "./looplab-runtime-model.mjs";

export const LOOPLAB_FEEL_REPORT_SCHEMA = "looplab-feel-report/v1";
export const LOOPLAB_TUNING_CONTRACT_SCHEMA = "looplab-tuning-contract/v1";
export const LOOPLAB_TUNING_REPORT_SCHEMA = "looplab-tuning-report/v1";
export const LOOPLAB_TUNING_SEARCH_SCHEMA = "looplab-tuning-search/v1";

export const LOOPLAB_TUNING_LIMITS = Object.freeze({
  maximumParameters: 5,
  maximumObjectives: 8,
  maximumConstraints: 8,
  maximumValuesPerParameter: 9,
  maximumCandidates: 24,
  defaultCandidates: 12,
});

const STABLE_ID = /^[a-z0-9][a-z0-9-]*$/;
const MOVEMENT_DEFAULTS = Object.freeze({
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
});

const MOVEMENT_FIELDS = Object.freeze({
  maxRunSpeed: { integer: false, minimum: 0 },
  groundAcceleration: { integer: false, minimum: 0 },
  airAcceleration: { integer: false, minimum: 0 },
  groundFriction: { integer: false, minimum: 0 },
  jumpVelocity: { integer: false, minimum: 0 },
  coyoteTicks: { integer: true, minimum: 0, maximum: 30 },
  jumpBufferTicks: { integer: true, minimum: 0, maximum: 30 },
  jumpCutVelocity: { integer: false, minimum: 0 },
  apexGravityScale: { integer: false, minimum: 0 },
  fallGravityScale: { integer: false, minimum: 0 },
  apexThreshold: { integer: false, minimum: 0 },
});

export const LOOPLAB_TUNING_METRICS = Object.freeze([
  Object.freeze({ id: "feel.timeToMaxSpeedMs", label: "Time to maximum speed", unit: "ms" }),
  Object.freeze({ id: "feel.stopTimeMs", label: "Stopping time", unit: "ms" }),
  Object.freeze({ id: "feel.maxJumpRisePx", label: "Maximum jump rise", unit: "px", platformerOnly: true }),
  Object.freeze({ id: "feel.timeToApexMs", label: "Time to jump apex", unit: "ms", platformerOnly: true }),
  Object.freeze({ id: "feel.airTimeMs", label: "Total jump airtime", unit: "ms", platformerOnly: true }),
  Object.freeze({ id: "feel.maximumHorizontalTravelPx", label: "Maximum horizontal travel during measured airtime", unit: "px", platformerOnly: true }),
  Object.freeze({ id: "feel.coyoteWindowMs", label: "Coyote-time window", unit: "ms", platformerOnly: true }),
  Object.freeze({ id: "feel.jumpBufferWindowMs", label: "Jump-buffer window", unit: "ms", platformerOnly: true }),
  Object.freeze({ id: "doctor.prototypeScore", label: "Prototype Doctor score", unit: "score" }),
  Object.freeze({ id: "doctor.productionScore", label: "Production Doctor score", unit: "score" }),
]);

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const round = (value, places = 3) => {
  if (!Number.isFinite(Number(value))) return null;
  const scale = 10 ** places;
  return Math.round(Number(value) * scale) / scale;
};
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const projectMaps = (project) => project?.maps?.length ? project.maps : [project];
const startMap = (project) => projectMaps(project).find((map) => map?.id === project?.startMapId) ?? projectMaps(project)[0] ?? project;
const controlMode = (project) => startMap(project)?.controlMode ?? project?.controlMode ?? "platformer";
const movementTuning = (project) => ({ ...MOVEMENT_DEFAULTS, ...(project?.movementTuning ?? {}), ...(startMap(project)?.movementTuning ?? {}) });
const ticksToMs = (ticks, tickRate = 60) => finite(ticks) ? round((ticks / tickRate) * 1000, 1) : null;
const durationTicks = (distance, perSecondRate, tickRate = 60) => {
  if (!finite(distance) || distance <= 0) return 0;
  if (!finite(perSecondRate) || perSecondRate <= 0) return null;
  return Math.ceil(distance / (perSecondRate / tickRate));
};

export function measureGameFeel(project, options = {}) {
  const mode = controlMode(project);
  const tuning = movementTuning(project);
  const tickRate = 60;
  const accelerationTicks = durationTicks(Number(tuning.maxRunSpeed), Number(tuning.groundAcceleration), tickRate);
  const stopTicks = durationTicks(Number(tuning.maxRunSpeed), Number(tuning.groundFriction), tickRate);
  const envelope = mode === "platformer" ? measurePlatformerJumpEnvelope(project) : null;
  const metrics = {
    timeToMaxSpeedMs: ticksToMs(accelerationTicks, tickRate),
    stopTimeMs: ticksToMs(stopTicks, tickRate),
    maxJumpRisePx: round(envelope?.maxRise, 2),
    timeToApexMs: envelope ? ticksToMs(Math.max(0, envelope.apexTick - envelope.takeoffTick), envelope.tickRate) : null,
    airTimeMs: envelope ? ticksToMs(envelope.airborneTicks, envelope.tickRate) : null,
    maximumHorizontalTravelPx: round(envelope?.maximumHorizontalTravel, 2),
    coyoteWindowMs: mode === "platformer" ? ticksToMs(Number(tuning.coyoteTicks), tickRate) : null,
    jumpBufferWindowMs: mode === "platformer" ? ticksToMs(Number(tuning.jumpBufferTicks), tickRate) : null,
  };
  const report = {
    schemaVersion: LOOPLAB_FEEL_REPORT_SCHEMA,
    sourceDigest: typeof options.sourceDigest === "string" ? options.sourceDigest : null,
    status: mode === "platformer" || mode === "topdown" ? "measured" : "not-applicable",
    controlMode: mode,
    method: envelope?.method ?? "deterministic-integrator-constants",
    tickRate,
    movementTuning: clone(tuning),
    metrics,
    limitations: [
      "These are deterministic movement measurements, not a claim that the game is fun, well paced, accessible, or visually satisfying.",
      "Genre target bands require human-tuned references or recorded player preference evidence; LoopLab does not invent them.",
    ],
  };
  return { ...report, digest: canonicalSha256(report) };
}

function normalizeParameter(parameter) {
  return {
    id: String(parameter?.id ?? "").trim(),
    target: String(parameter?.target ?? "").trim(),
    ...(Array.isArray(parameter?.values) ? { values: parameter.values.map(Number) } : {}),
    ...(finite(Number(parameter?.minimum)) ? { minimum: Number(parameter.minimum) } : {}),
    ...(finite(Number(parameter?.maximum)) ? { maximum: Number(parameter.maximum) } : {}),
    ...(finite(Number(parameter?.step)) ? { step: Number(parameter.step) } : {}),
  };
}

function normalizeObjective(objective) {
  return {
    id: String(objective?.id ?? "").trim(),
    metric: String(objective?.metric ?? "").trim(),
    goal: ["minimize", "maximize", "target", "range"].includes(objective?.goal) ? objective.goal : "target",
    ...(finite(Number(objective?.target)) ? { target: Number(objective.target) } : {}),
    ...(finite(Number(objective?.minimum)) ? { minimum: Number(objective.minimum) } : {}),
    ...(finite(Number(objective?.maximum)) ? { maximum: Number(objective.maximum) } : {}),
  };
}

function normalizeConstraint(constraint) {
  return {
    id: String(constraint?.id ?? "").trim(),
    metric: String(constraint?.metric ?? "").trim(),
    operator: ["gte", "lte", "between"].includes(constraint?.operator) ? constraint.operator : "gte",
    ...(finite(Number(constraint?.value)) ? { value: Number(constraint.value) } : {}),
    ...(finite(Number(constraint?.minimum)) ? { minimum: Number(constraint.minimum) } : {}),
    ...(finite(Number(constraint?.maximum)) ? { maximum: Number(constraint.maximum) } : {}),
  };
}

export function normalizeTuningContract(contract = {}) {
  return {
    schemaVersion: LOOPLAB_TUNING_CONTRACT_SCHEMA,
    status: contract?.status === "approved" ? "approved" : "draft",
    intent: String(contract?.intent ?? "Explore bounded gameplay-feel variants without choosing a creative winner.").trim(),
    parameters: Array.isArray(contract?.parameters) ? contract.parameters.map(normalizeParameter) : [],
    objectives: Array.isArray(contract?.objectives) ? contract.objectives.map(normalizeObjective) : [],
    constraints: Array.isArray(contract?.constraints) ? contract.constraints.map(normalizeConstraint) : [],
    search: {
      strategy: "grid-or-stratified",
      maxCandidates: Number.isInteger(Number(contract?.search?.maxCandidates)) ? Number(contract.search.maxCandidates) : LOOPLAB_TUNING_LIMITS.defaultCandidates,
    },
  };
}

function parameterTarget(project, target) {
  if (target === "gravity") return { supported: true, value: Number(project?.gravity), integer: false, minimum: 0, kind: "project" };
  const movement = /^movementTuning\.([A-Za-z][A-Za-z0-9]*)$/.exec(target);
  if (movement) {
    const definition = MOVEMENT_FIELDS[movement[1]];
    return definition ? { supported: true, value: Number(movementTuning(project)[movement[1]]), ...definition, kind: "movement", field: movement[1] } : { supported: false };
  }
  const variable = /^gameplayVariable\.([a-z0-9][a-z0-9-]*)\.initial$/.exec(target);
  if (variable) {
    const entry = (project?.gameplayProgram?.variables ?? []).find((candidate) => candidate?.id === variable[1]);
    return entry && finite(Number(entry.initial))
      ? { supported: true, value: Number(entry.initial), integer: entry.type !== "number", kind: "gameplay-variable", variableId: variable[1] }
      : { supported: false };
  }
  return { supported: false };
}

function parameterValues(parameter) {
  if (Array.isArray(parameter.values)) return [...new Set(parameter.values.map(Number))];
  if (!finite(parameter.minimum) || !finite(parameter.maximum) || !finite(parameter.step) || parameter.step <= 0) return [];
  const values = [];
  for (let value = parameter.minimum, index = 0; value <= parameter.maximum + parameter.step * 1e-9 && index < LOOPLAB_TUNING_LIMITS.maximumValuesPerParameter + 1; value += parameter.step, index += 1) {
    values.push(round(value, 6));
  }
  return values;
}

function metricValue(metric, feel, doctors, assignments = {}) {
  if (metric.startsWith("feel.")) return feel?.metrics?.[metric.slice("feel.".length)] ?? null;
  if (metric === "doctor.prototypeScore") return doctors?.prototype?.score ?? null;
  if (metric === "doctor.productionScore") return doctors?.production?.score ?? null;
  if (metric.startsWith("parameter.")) return assignments[metric.slice("parameter.".length)] ?? null;
  return null;
}

function metricSupported(metric, parameterIds) {
  return LOOPLAB_TUNING_METRICS.some((entry) => entry.id === metric) || (metric.startsWith("parameter.") && parameterIds.has(metric.slice("parameter.".length)));
}

export function inspectTuningContract(project, input = project?.tuningContract, options = {}) {
  if (input == null) {
    return {
      schemaVersion: LOOPLAB_TUNING_REPORT_SCHEMA,
      present: false,
      status: "not-configured",
      sourceDigest: options.sourceDigest ?? null,
      contract: null,
      contractDigest: null,
      feel: measureGameFeel(project, options),
      issues: [],
      errors: [],
      warnings: [],
      limitations: ["No tuning search runs until a reviewer authors or accepts a bounded Tuning Contract."],
    };
  }
  const contract = normalizeTuningContract(input);
  const issues = [];
  const add = (severity, code, message, context = {}) => issues.push({ severity, code, message, ...context });
  if (input?.schemaVersion !== LOOPLAB_TUNING_CONTRACT_SCHEMA) add("error", "tuning-schema-version", `tuningContract.schemaVersion must be ${LOOPLAB_TUNING_CONTRACT_SCHEMA}.`);
  if (!contract.intent) add("error", "tuning-intent-missing", "tuningContract.intent must explain the bounded design intent.");
  if (!contract.parameters.length) add("error", "tuning-parameters-missing", "tuningContract.parameters must declare at least one allowlisted numeric target.");
  if (contract.parameters.length > LOOPLAB_TUNING_LIMITS.maximumParameters) add("error", "tuning-parameter-limit", `A tuning contract may declare at most ${LOOPLAB_TUNING_LIMITS.maximumParameters} parameters.`);
  if (!contract.objectives.length) add("error", "tuning-objectives-missing", "tuningContract.objectives must declare at least one measured objective.");
  if (contract.objectives.length > LOOPLAB_TUNING_LIMITS.maximumObjectives) add("error", "tuning-objective-limit", `A tuning contract may declare at most ${LOOPLAB_TUNING_LIMITS.maximumObjectives} objectives.`);
  if (contract.constraints.length > LOOPLAB_TUNING_LIMITS.maximumConstraints) add("error", "tuning-constraint-limit", `A tuning contract may declare at most ${LOOPLAB_TUNING_LIMITS.maximumConstraints} constraints.`);
  if (!Number.isInteger(contract.search.maxCandidates) || contract.search.maxCandidates < 2 || contract.search.maxCandidates > LOOPLAB_TUNING_LIMITS.maximumCandidates) add("error", "tuning-candidate-budget", `tuningContract.search.maxCandidates must be an integer from 2 through ${LOOPLAB_TUNING_LIMITS.maximumCandidates}.`);

  const parameterIds = new Set();
  for (const parameter of contract.parameters) {
    if (!STABLE_ID.test(parameter.id)) add("error", "tuning-parameter-id", `Tuning parameter IDs must be stable lowercase hyphenated IDs: ${parameter.id || "(missing)"}.`, { parameterId: parameter.id });
    else if (parameterIds.has(parameter.id)) add("error", "tuning-parameter-duplicate", `Tuning parameter ID is duplicated: ${parameter.id}.`, { parameterId: parameter.id });
    else parameterIds.add(parameter.id);
    const target = parameterTarget(project, parameter.target);
    if (!target.supported || !finite(target.value)) add("error", "tuning-target-unsupported", `Tuning target is missing, non-numeric, or unsupported: ${parameter.target || "(missing)"}.`, { parameterId: parameter.id, target: parameter.target });
    const values = parameterValues(parameter);
    if (!values.length) add("error", "tuning-values-missing", `Tuning parameter ${parameter.id || "(missing)"} needs finite values or minimum/maximum/step.`, { parameterId: parameter.id });
    if (values.length > LOOPLAB_TUNING_LIMITS.maximumValuesPerParameter) add("error", "tuning-values-limit", `Tuning parameter ${parameter.id} expands to more than ${LOOPLAB_TUNING_LIMITS.maximumValuesPerParameter} values.`, { parameterId: parameter.id });
    for (const value of values) {
      if (!finite(value)) add("error", "tuning-value-invalid", `Tuning parameter ${parameter.id} contains a non-finite value.`, { parameterId: parameter.id });
      if (target.integer && !Number.isInteger(value)) add("error", "tuning-value-integer", `Tuning parameter ${parameter.id} targets an integer and may contain only integers.`, { parameterId: parameter.id, value });
      if (finite(target.minimum) && value < target.minimum) add("error", "tuning-value-bounds", `Tuning parameter ${parameter.id} cannot be less than ${target.minimum}.`, { parameterId: parameter.id, value });
      if (finite(target.maximum) && value > target.maximum) add("error", "tuning-value-bounds", `Tuning parameter ${parameter.id} cannot exceed ${target.maximum}.`, { parameterId: parameter.id, value });
    }
  }

  const feel = measureGameFeel(project, options);
  const objectiveIds = new Set();
  for (const objective of contract.objectives) {
    if (!STABLE_ID.test(objective.id)) add("error", "tuning-objective-id", `Tuning objective IDs must be stable lowercase hyphenated IDs: ${objective.id || "(missing)"}.`, { objectiveId: objective.id });
    else if (objectiveIds.has(objective.id)) add("error", "tuning-objective-duplicate", `Tuning objective ID is duplicated: ${objective.id}.`, { objectiveId: objective.id });
    else objectiveIds.add(objective.id);
    if (!metricSupported(objective.metric, parameterIds)) add("error", "tuning-objective-metric", `Tuning objective ${objective.id || "(missing)"} uses an unsupported metric: ${objective.metric || "(missing)"}.`, { objectiveId: objective.id, metric: objective.metric });
    if (objective.goal === "target" && !finite(objective.target)) add("error", "tuning-objective-target", `Target objective ${objective.id} requires a finite target.`);
    if (objective.goal === "range" && (!finite(objective.minimum) || !finite(objective.maximum) || objective.minimum > objective.maximum)) add("error", "tuning-objective-range", `Range objective ${objective.id} requires finite ordered minimum and maximum values.`);
  }
  const constraintIds = new Set();
  for (const constraint of contract.constraints) {
    if (!STABLE_ID.test(constraint.id)) add("error", "tuning-constraint-id", `Tuning constraint IDs must be stable lowercase hyphenated IDs: ${constraint.id || "(missing)"}.`, { constraintId: constraint.id });
    else if (constraintIds.has(constraint.id)) add("error", "tuning-constraint-duplicate", `Tuning constraint ID is duplicated: ${constraint.id}.`, { constraintId: constraint.id });
    else constraintIds.add(constraint.id);
    if (!metricSupported(constraint.metric, parameterIds)) add("error", "tuning-constraint-metric", `Tuning constraint ${constraint.id || "(missing)"} uses an unsupported metric: ${constraint.metric || "(missing)"}.`, { constraintId: constraint.id, metric: constraint.metric });
    if (constraint.operator === "between" && (!finite(constraint.minimum) || !finite(constraint.maximum) || constraint.minimum > constraint.maximum)) add("error", "tuning-constraint-range", `Between constraint ${constraint.id} requires finite ordered minimum and maximum values.`);
    if (constraint.operator !== "between" && !finite(constraint.value)) add("error", "tuning-constraint-value", `Constraint ${constraint.id} requires a finite value.`);
  }
  const report = {
    schemaVersion: LOOPLAB_TUNING_REPORT_SCHEMA,
    present: true,
    status: issues.some((issue) => issue.severity === "error") ? "invalid" : contract.status,
    sourceDigest: options.sourceDigest ?? null,
    contract,
    contractDigest: canonicalSha256(contract),
    feel,
    metrics: { parameterCount: contract.parameters.length, objectiveCount: contract.objectives.length, constraintCount: contract.constraints.length, maxCandidates: contract.search.maxCandidates },
    issues,
    errors: issues.filter((issue) => issue.severity === "error").map((issue) => issue.message),
    warnings: issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message),
    limitations: [
      "The contract can search measured numeric behavior; it cannot define fun, taste, originality, composition, or emotional effect.",
      "A search never mutates the project or rerecords replay/acceptance evidence. Selection and application remain explicit.",
    ],
  };
  return { ...report, digest: canonicalSha256({ ...report, feel: feel.digest }) };
}

function scaledValues(value, scales, integer = false, minimum = 0) {
  return [...new Set(scales.map((scale) => Math.max(minimum, integer ? Math.round(value * scale) : round(value * scale, 3))))];
}

function rangeObjective(id, metric, value, fraction = 0.12) {
  const spread = Math.max(Math.abs(value) * fraction, metric.endsWith("Ms") ? 16.7 : 1);
  return { id, metric, goal: "range", minimum: round(value - spread, 3), maximum: round(value + spread, 3) };
}

export function suggestTuningContract(project, options = {}) {
  const feel = measureGameFeel(project, options);
  const tuning = movementTuning(project);
  const mode = controlMode(project);
  let parameters = [];
  let objectives = [];
  if (mode === "platformer") {
    parameters = [
      { id: "run-speed", target: "movementTuning.maxRunSpeed", values: scaledValues(Number(tuning.maxRunSpeed), [0.85, 1, 1.15]) },
      { id: "ground-acceleration", target: "movementTuning.groundAcceleration", values: scaledValues(Number(tuning.groundAcceleration), [0.75, 1, 1.25]) },
      { id: "jump-velocity", target: "movementTuning.jumpVelocity", values: scaledValues(Number(tuning.jumpVelocity), [0.9, 1, 1.1]) },
    ];
    objectives = [
      rangeObjective("preserve-acceleration-band", "feel.timeToMaxSpeedMs", feel.metrics.timeToMaxSpeedMs),
      rangeObjective("preserve-jump-rise-band", "feel.maxJumpRisePx", feel.metrics.maxJumpRisePx),
      rangeObjective("preserve-airtime-band", "feel.airTimeMs", feel.metrics.airTimeMs),
    ];
  } else if (mode === "topdown") {
    parameters = [
      { id: "run-speed", target: "movementTuning.maxRunSpeed", values: scaledValues(Number(tuning.maxRunSpeed), [0.85, 1, 1.15]) },
      { id: "ground-acceleration", target: "movementTuning.groundAcceleration", values: scaledValues(Number(tuning.groundAcceleration), [0.75, 1, 1.25]) },
      { id: "ground-friction", target: "movementTuning.groundFriction", values: scaledValues(Number(tuning.groundFriction), [0.75, 1, 1.25]) },
    ];
    objectives = [
      rangeObjective("preserve-acceleration-band", "feel.timeToMaxSpeedMs", feel.metrics.timeToMaxSpeedMs),
      rangeObjective("preserve-stopping-band", "feel.stopTimeMs", feel.metrics.stopTimeMs),
    ];
  } else {
    const numericVariables = (project?.gameplayProgram?.variables ?? []).filter((variable) => finite(Number(variable?.initial))).slice(0, 3);
    parameters = numericVariables.map((variable) => ({ id: variable.id, target: `gameplayVariable.${variable.id}.initial`, values: scaledValues(Number(variable.initial), [0.8, 1, 1.2], variable.type !== "number") }));
    objectives = numericVariables.map((variable) => ({ id: `preserve-${variable.id}-band`, metric: `parameter.${variable.id}`, goal: "range", minimum: Math.min(...scaledValues(Number(variable.initial), [0.8, 1], variable.type !== "number")), maximum: Math.max(...scaledValues(Number(variable.initial), [1, 1.2], variable.type !== "number")) }));
  }
  const contract = normalizeTuningContract({
    status: "draft",
    intent: "Explore a bounded repertoire near the current authored feel. Edit these measured ranges to express the desired direction before treating any candidate as preferred.",
    parameters,
    objectives,
    constraints: [],
    search: { maxCandidates: Number.isInteger(options.maxCandidates) ? options.maxCandidates : LOOPLAB_TUNING_LIMITS.defaultCandidates },
  });
  return {
    schemaVersion: "looplab-tuning-suggestion/v1",
    available: parameters.length > 0 && objectives.length > 0,
    feel,
    contract,
    contractDigest: canonicalSha256(contract),
    instruction: "Review and adjust the target ranges first. This starter preserves a neighborhood around current measured behavior and does not claim that neighborhood is fun or genre-optimal.",
  };
}

function assignParameter(project, parameter, value) {
  const target = parameterTarget(project, parameter.target);
  if (!target.supported) throw new Error(`Unsupported tuning target: ${parameter.target}`);
  if (target.kind === "project") project.gravity = value;
  else if (target.kind === "movement") project.movementTuning = { ...(project.movementTuning ?? {}), [target.field]: value };
  else if (target.kind === "gameplay-variable") {
    project.gameplayProgram = {
      ...project.gameplayProgram,
      variables: (project.gameplayProgram?.variables ?? []).map((variable) => variable?.id === target.variableId ? { ...variable, initial: value } : variable),
    };
  }
}

function commandsForAssignments(project, contract, assignments) {
  const movementChanges = {};
  let gravity;
  let gameplayChanged = false;
  const candidate = clone(project);
  for (const parameter of contract.parameters) {
    const value = assignments[parameter.id];
    const target = parameterTarget(candidate, parameter.target);
    assignParameter(candidate, parameter, value);
    if (target.kind === "movement") movementChanges[target.field] = value;
    else if (target.kind === "project") gravity = value;
    else if (target.kind === "gameplay-variable") gameplayChanged = true;
  }
  const changes = {};
  if (Object.keys(movementChanges).length) changes.movementTuning = movementChanges;
  if (gravity !== undefined) changes.gravity = gravity;
  const commands = Object.keys(changes).length ? [{ op: "set_project", changes }] : [];
  if (gameplayChanged) commands.push({ op: "set_gameplay_program", program: clone(candidate.gameplayProgram) });
  return { candidate, commands };
}

function seededRandom(seedText) {
  let seed = Number.parseInt(canonicalSha256(seedText).slice(-8), 16) >>> 0;
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function cartesian(levels, limit = Infinity) {
  const output = [];
  const walk = (index, values) => {
    if (output.length >= limit) return;
    if (index >= levels.length) {
      output.push(values);
      return;
    }
    for (const value of levels[index]) {
      walk(index + 1, [...values, value]);
      if (output.length >= limit) break;
    }
  };
  walk(0, []);
  return output;
}

function candidateVectors(levels, budget, seedText) {
  const total = levels.reduce((count, values) => count * values.length, 1);
  if (total <= budget) return { strategy: "grid", totalSpace: total, vectors: cartesian(levels) };
  const random = seededRandom(seedText);
  const permutations = levels.map(() => shuffle([...Array(budget).keys()], random));
  const vectors = [];
  const seen = new Set();
  for (let trial = 0; trial < budget * 4 && vectors.length < budget; trial += 1) {
    const vector = levels.map((values, parameterIndex) => {
      const stratum = permutations[parameterIndex][trial % budget];
      const index = Math.min(values.length - 1, Math.floor(((stratum + 0.5) / budget) * values.length));
      return values[index];
    });
    const key = JSON.stringify(vector);
    if (!seen.has(key)) {
      seen.add(key);
      vectors.push(vector);
    }
    if ((trial + 1) % budget === 0) permutations.forEach((values, index) => { permutations[index] = shuffle(values, random); });
  }
  if (vectors.length < budget) {
    for (const vector of cartesian(levels, total)) {
      const key = JSON.stringify(vector);
      if (!seen.has(key)) {
        seen.add(key);
        vectors.push(vector);
      }
      if (vectors.length >= budget) break;
    }
  }
  return { strategy: "deterministic-stratified", totalSpace: total, vectors: vectors.slice(0, budget) };
}

function issueIdentity(issue) {
  return [issue?.category, issue?.code, issue?.mapId, issue?.objectId, issue?.assetId, issue?.featureId, issue?.testId].map((value) => value ?? "").join(":");
}

function doctorSummary(doctor) {
  return {
    profile: doctor?.profile ?? null,
    sourceDigest: doctor?.sourceDigest ?? null,
    digest: doctor?.digest ?? null,
    score: doctor?.score ?? null,
    errorCount: doctor?.errorCount ?? null,
    warningCount: doctor?.warningCount ?? null,
    acceptanceFailures: doctor?.acceptanceResults?.failedCount ?? 0,
    replayFailures: doctor?.replayResults?.failedCount ?? 0,
    completionStatus: doctor?.completionReport?.status ?? "not-applicable",
    completionPassed: doctor?.completionReport?.status === "not-applicable" ? null : doctor?.completionReport?.passed === true,
    deadInputActions: doctor?.inputActionLiveness?.deadCount ?? 0,
    runtimeJoinErrors: (doctor?.runtimeJoinPlan?.issues ?? []).filter((issue) => issue?.severity === "error").length,
    errorKeys: (doctor?.issues ?? []).filter((issue) => issue?.severity === "error").map(issueIdentity).sort(),
  };
}

function completionRegressed(before, after) {
  if (before.completionPassed === true) return after.completionPassed !== true;
  if (["invalid", "dead-end"].includes(after.completionStatus) && !["invalid", "dead-end"].includes(before.completionStatus)) return true;
  return false;
}

function noRegressionGates(baseline, candidate, validation) {
  const gates = [];
  const gate = (id, passed, detail) => gates.push({ id, passed, detail });
  gate("schema-valid", validation?.valid === true, validation?.valid ? "Candidate schema is valid." : `${validation?.errors?.length ?? 1} schema error(s).`);
  for (const profile of ["prototype", "production"]) {
    const before = baseline[profile];
    const after = candidate[profile];
    const beforeErrors = new Set(before.errorKeys);
    const introduced = after.errorKeys.filter((key) => !beforeErrors.has(key));
    gate(`${profile}-doctor-no-new-blockers`, introduced.length === 0 && after.errorCount <= before.errorCount, `${before.errorCount} → ${after.errorCount} blocker(s); ${introduced.length} newly introduced.`);
    gate(`${profile}-acceptance-non-regression`, after.acceptanceFailures <= before.acceptanceFailures, `${before.acceptanceFailures} → ${after.acceptanceFailures} acceptance failure(s).`);
    gate(`${profile}-replay-non-regression`, after.replayFailures <= before.replayFailures, `${before.replayFailures} → ${after.replayFailures} replay failure(s).`);
    gate(`${profile}-completion-non-regression`, !completionRegressed(before, after), `${before.completionStatus} → ${after.completionStatus}.`);
    gate(`${profile}-input-non-regression`, after.deadInputActions <= before.deadInputActions, `${before.deadInputActions} → ${after.deadInputActions} dead action(s).`);
    gate(`${profile}-map-join-non-regression`, after.runtimeJoinErrors <= before.runtimeJoinErrors, `${before.runtimeJoinErrors} → ${after.runtimeJoinErrors} runtime-join blocker(s).`);
  }
  return gates;
}

function objectiveObservation(objective, value) {
  let loss = null;
  if (finite(value)) {
    if (objective.goal === "minimize") loss = value;
    else if (objective.goal === "maximize") loss = -value;
    else if (objective.goal === "target") loss = Math.abs(value - objective.target) / Math.max(1, Math.abs(objective.target));
    else if (objective.goal === "range") loss = value < objective.minimum ? (objective.minimum - value) / Math.max(1, Math.abs(objective.minimum)) : value > objective.maximum ? (value - objective.maximum) / Math.max(1, Math.abs(objective.maximum)) : 0;
  }
  return { id: objective.id, metric: objective.metric, goal: objective.goal, value: finite(value) ? round(value, 4) : null, loss: finite(loss) ? round(loss, 8) : null, ...(finite(objective.target) ? { target: objective.target } : {}), ...(finite(objective.minimum) ? { minimum: objective.minimum } : {}), ...(finite(objective.maximum) ? { maximum: objective.maximum } : {}) };
}

function constraintObservation(constraint, value) {
  const passed = finite(value) && (constraint.operator === "gte" ? value >= constraint.value : constraint.operator === "lte" ? value <= constraint.value : value >= constraint.minimum && value <= constraint.maximum);
  return { id: constraint.id, metric: constraint.metric, operator: constraint.operator, value: finite(value) ? round(value, 4) : null, passed, ...(finite(constraint.value) ? { expected: constraint.value } : {}), ...(finite(constraint.minimum) ? { minimum: constraint.minimum } : {}), ...(finite(constraint.maximum) ? { maximum: constraint.maximum } : {}) };
}

function dominates(first, second) {
  if (!first.safe || !second.safe) return false;
  const firstLosses = first.objectives.map((entry) => entry.loss);
  const secondLosses = second.objectives.map((entry) => entry.loss);
  if (firstLosses.some((value) => !finite(value)) || secondLosses.some((value) => !finite(value))) return false;
  return firstLosses.every((value, index) => value <= secondLosses[index]) && firstLosses.some((value, index) => value < secondLosses[index]);
}

export function runTuningSearch(project, options = {}) {
  const sourceDigest = options.sourceDigest ?? null;
  const inspection = inspectTuningContract(project, options.contract ?? project?.tuningContract, { sourceDigest });
  if (!inspection.present) throw new Error("run_tuning_search requires an authored tuningContract or explicit contract.");
  if (inspection.errors.length) throw new Error(`Tuning contract is invalid: ${inspection.errors.join(" ")}`);
  if (typeof options.evaluateCandidate !== "function") throw new Error("run_tuning_search requires the canonical candidate evaluator.");
  const contract = inspection.contract;
  const baselineAssignments = Object.fromEntries(contract.parameters.map((parameter) => [parameter.id, parameterTarget(project, parameter.target).value]));
  const levels = contract.parameters.map(parameterValues);
  const budget = contract.search.maxCandidates;
  const generated = candidateVectors(levels, Math.max(1, budget - 1), inspection.contractDigest);
  const rawAssignments = [baselineAssignments, ...generated.vectors.map((vector) => Object.fromEntries(contract.parameters.map((parameter, index) => [parameter.id, vector[index]])))];
  const seen = new Set();
  const assignmentsList = rawAssignments.filter((assignments) => {
    const key = canonicalSha256(assignments);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, budget);
  const baselineEvaluation = options.evaluateCandidate(project);
  const baselineDoctors = { prototype: doctorSummary(baselineEvaluation.prototypeDoctor), production: doctorSummary(baselineEvaluation.productionDoctor) };
  const candidates = assignmentsList.map((assignments, index) => {
    const { candidate, commands } = commandsForAssignments(project, contract, assignments);
    const evaluation = index === 0 ? baselineEvaluation : options.evaluateCandidate(candidate);
    const doctors = { prototype: doctorSummary(evaluation.prototypeDoctor), production: doctorSummary(evaluation.productionDoctor) };
    const feel = measureGameFeel(candidate, { sourceDigest: doctors.prototype.sourceDigest });
    const gates = noRegressionGates(baselineDoctors, doctors, evaluation.validation);
    const objectives = contract.objectives.map((objective) => objectiveObservation(objective, metricValue(objective.metric, feel, doctors, assignments)));
    const constraints = contract.constraints.map((constraint) => constraintObservation(constraint, metricValue(constraint.metric, feel, doctors, assignments)));
    const changed = commands.length > 0 && canonicalSha256(assignments) !== canonicalSha256(baselineAssignments);
    const safe = gates.every((gate) => gate.passed) && constraints.every((constraint) => constraint.passed) && objectives.every((objective) => finite(objective.loss));
    const identity = { sourceDigest, contractDigest: inspection.contractDigest, assignments, gates: gates.map((gate) => [gate.id, gate.passed]), objectives: objectives.map((entry) => [entry.id, entry.value, entry.loss]), constraints: constraints.map((entry) => [entry.id, entry.value, entry.passed]) };
    return {
      id: index === 0 ? "tune-baseline" : `tune-${String(index).padStart(3, "0")}`,
      baseline: index === 0,
      changed,
      safe,
      pareto: false,
      assignments,
      gates,
      failedGateIds: gates.filter((gate) => !gate.passed).map((gate) => gate.id),
      objectives,
      constraints,
      failedConstraintIds: constraints.filter((constraint) => !constraint.passed).map((constraint) => constraint.id),
      feel,
      doctor: doctors,
      candidateDigest: canonicalSha256(identity),
      previewCommand: changed && safe ? {
        op: "preview_batch",
        commands,
        summary: `Apply reviewed tuning candidate ${index === 0 ? "baseline" : `tune-${String(index).padStart(3, "0")}`} from ${inspection.contractDigest}.`,
        expectedSourceDigest: sourceDigest,
      } : null,
    };
  });
  for (const candidate of candidates) candidate.pareto = candidate.safe && !candidates.some((other) => other !== candidate && dominates(other, candidate));
  const compactIdentity = candidates.map((candidate) => ({ id: candidate.id, candidateDigest: candidate.candidateDigest, safe: candidate.safe, pareto: candidate.pareto }));
  const report = {
    schemaVersion: LOOPLAB_TUNING_SEARCH_SCHEMA,
    sourceDigest,
    contractDigest: inspection.contractDigest,
    contract,
    strategy: generated.strategy,
    totalParameterCombinations: generated.totalSpace,
    evaluatedCandidateCount: candidates.length,
    candidateBudget: budget,
    baselineCandidateId: "tune-baseline",
    safeCandidateIds: candidates.filter((candidate) => candidate.safe).map((candidate) => candidate.id),
    paretoCandidateIds: candidates.filter((candidate) => candidate.pareto).map((candidate) => candidate.id),
    automaticWinner: null,
    humanDecisionRequired: candidates.some((candidate) => candidate.changed),
    candidates,
    decisionBoundary: "Hard gates and numeric Pareto relations identify safe measured tradeoffs; they do not prove fun or choose a creative winner. Preview and play selected candidates on protected variations before explicit continuation.",
    applicationPolicy: "The search is read-only. Each changed candidate exposes ordinary preview_batch input; apply only through the unchanged source and exact preview digest. Replay or acceptance evidence is never rerecorded automatically.",
    providerUsage: { provider: "none", measured: true, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, rateEquivalentUsd: 0 },
    limitations: inspection.limitations,
  };
  return { ...report, searchDigest: canonicalSha256({ schemaVersion: report.schemaVersion, sourceDigest, contractDigest: inspection.contractDigest, strategy: generated.strategy, candidates: compactIdentity, decisionBoundary: report.decisionBoundary }) };
}
