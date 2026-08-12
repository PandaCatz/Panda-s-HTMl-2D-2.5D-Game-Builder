import { createRuntimeModel } from "./looplab-runtime-instance.mjs";
import { canonicalReplaySerialize, LOOPLAB_MIN_TICK_RATE, resolveReplayActionCode, runReplaySuite } from "./looplab-replay.mjs";

export const LOOPLAB_ACCEPTANCE_RUNNER = "looplab-deterministic-runtime";
export const LOOPLAB_ACCEPTANCE_RESULT_SCHEMA = "looplab-acceptance-result/v1";
export const LOOPLAB_ACCEPTANCE_RUNNER_VERSION = 1;

const DEFAULT_MAX_TICKS = 60 * 60 * 10;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const TARGETS = new Set(["gameplay-variable", "completed-rule", "event-emitted", "object-property", "runtime-state", "traversal-path", "combat-health", "combat-emitter", "combat-state", "actor-state"]);
const OPERATORS = new Set(["equals", "not-equals", "greater-than", "greater-or-equal", "less-than", "less-or-equal", "contains", "truthy", "falsy"]);
const RUNTIME_PROPERTIES = new Set(["activeMapId", "collectedCount", "activeTraversalPathId", "activeChoicePageId", "won"]);
const OBJECT_PROPERTIES = new Set(["active", "collected", "enabled", "grounded", "hidden", "locked", "open", "runtimeState", "solid", "vx", "vy", "x", "y", "z", "colliderEnabled"]);
const PATH_PROPERTIES = new Set(["enabled"]);
const COMBAT_HEALTH_PROPERTIES = new Set(["hp", "maxHp", "invulnerabilityTicks", "depleted"]);
const COMBAT_EMITTER_PROPERTIES = new Set(["cooldownTicks", "lastTargetActorId", "shotsFired", "overflowCount", "activeProjectiles"]);
const COMBAT_STATE_PROPERTIES = new Set(["enabled", "revision", "sequence", "poolCapacity", "activeProjectileCount", "maxProjectiles"]);
const ACTOR_STATE_PROPERTIES = new Set(["mode", "previousMode", "x", "y", "z", "vx", "vy", "facingX", "facingY", "routeIndex", "routeDirection", "targetId", "detected", "memoryTicksRemaining", "repathTicksRemaining", "blockerId", "arrived", "revision"]);
const BEHAVIOR_EVIDENCE_TYPES = new Set(["playtest", "replay", "automated-test"]);

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const stableId = (value) => typeof value === "string" && STABLE_ID.test(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function digest(prefix, value) {
  const text = canonicalReplaySerialize(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function acceptanceSpecDigest(test) {
  return digest("acceptance", clone(test));
}

function executionIntent(test) {
  return Boolean(test && typeof test === "object" && (hasOwn(test, "runner") || hasOwn(test, "driver") || hasOwn(test, "assertions")));
}

export function validateExecutableAcceptanceTest(test, options = {}) {
  const errors = [];
  const prefix = options.prefix ?? "acceptance test";
  const maximumTicks = Number(options.maximumTicks ?? DEFAULT_MAX_TICKS);
  if (!test || typeof test !== "object" || Array.isArray(test)) return { executable: false, errors: [`${prefix} must be an object.`] };
  if (!executionIntent(test)) return { executable: false, errors };
  if (test.runner !== LOOPLAB_ACCEPTANCE_RUNNER) errors.push(`${prefix}.runner must be ${LOOPLAB_ACCEPTANCE_RUNNER}.`);
  if (!test.driver || typeof test.driver !== "object" || Array.isArray(test.driver)) {
    errors.push(`${prefix}.driver must be an object.`);
  } else {
    const tickRate = Number(test.driver.tickRate ?? 60);
    if (!Number.isFinite(tickRate) || tickRate < LOOPLAB_MIN_TICK_RATE || tickRate > 240) errors.push(`${prefix}.driver.tickRate must be from ${LOOPLAB_MIN_TICK_RATE} through 240.`);
    if (!Number.isInteger(test.driver.tickCount) || test.driver.tickCount < 1 || test.driver.tickCount > maximumTicks) errors.push(`${prefix}.driver.tickCount must be an integer from 1 through ${maximumTicks}.`);
    for (const field of ["startMapId", "startSpawnId"]) if (test.driver[field] !== undefined && !stableId(test.driver[field])) errors.push(`${prefix}.driver.${field} must be a stable ID when provided.`);
    if (!Array.isArray(test.driver.inputs)) errors.push(`${prefix}.driver.inputs must be an array.`);
    else if (test.driver.inputs.length > 4096) errors.push(`${prefix}.driver.inputs must contain at most 4096 transitions.`);
    else for (const [index, input] of test.driver.inputs.entries()) {
      const inputPrefix = `${prefix}.driver.inputs[${index}]`;
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        errors.push(`${inputPrefix} must be an object.`);
        continue;
      }
      if (!Number.isInteger(input.tick) || input.tick < 0 || (Number.isInteger(test.driver.tickCount) && input.tick >= test.driver.tickCount)) errors.push(`${inputPrefix}.tick must address a zero-based simulation tick inside the test.`);
      if (typeof input.pressed !== "boolean") errors.push(`${inputPrefix}.pressed must be boolean.`);
      if (![input.action, input.actionId, input.code].some((value) => typeof value === "string" && value.trim())) errors.push(`${inputPrefix} requires action, actionId, or code.`);
    }
  }
  if (!Array.isArray(test.assertions) || test.assertions.length === 0) {
    errors.push(`${prefix}.assertions must be a non-empty array.`);
  } else if (test.assertions.length > 64) {
    errors.push(`${prefix}.assertions must contain at most 64 checks.`);
  } else {
    const assertionIds = new Set();
    for (const [index, assertion] of test.assertions.entries()) {
      const assertionPrefix = `${prefix}.assertions[${index}]`;
      if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
        errors.push(`${assertionPrefix} must be an object.`);
        continue;
      }
      if (!stableId(assertion.id)) errors.push(`${assertionPrefix}.id must be a stable ID.`);
      else if (assertionIds.has(assertion.id)) errors.push(`${assertionPrefix}.id duplicates ${assertion.id}.`);
      else assertionIds.add(assertion.id);
      if (!TARGETS.has(assertion.target)) errors.push(`${assertionPrefix}.target is not supported.`);
      if (!OPERATORS.has(assertion.operator)) errors.push(`${assertionPrefix}.operator is not supported.`);
      if (!["truthy", "falsy"].includes(assertion.operator) && !hasOwn(assertion, "expected")) errors.push(`${assertionPrefix}.expected is required for ${assertion.operator ?? "this operator"}.`);
      if (assertion.atTick !== undefined && (!Number.isInteger(assertion.atTick) || assertion.atTick < 1 || (Number.isInteger(test.driver?.tickCount) && assertion.atTick > test.driver.tickCount))) errors.push(`${assertionPrefix}.atTick must address the state after a simulation tick inside the test.`);
      if (["gameplay-variable", "completed-rule", "event-emitted", "object-property", "traversal-path", "combat-health", "combat-emitter", "actor-state"].includes(assertion.target) && !stableId(assertion.targetId)) errors.push(`${assertionPrefix}.targetId must be a stable ID for ${assertion.target ?? "this target"}.`);
      if (assertion.target === "runtime-state" && !RUNTIME_PROPERTIES.has(assertion.property)) errors.push(`${assertionPrefix}.property is not an allowlisted runtime-state property.`);
      if (assertion.target === "object-property" && !OBJECT_PROPERTIES.has(assertion.property)) errors.push(`${assertionPrefix}.property is not an allowlisted object property.`);
      if (assertion.target === "traversal-path" && !PATH_PROPERTIES.has(assertion.property)) errors.push(`${assertionPrefix}.property is not an allowlisted traversal-path property.`);
      if (assertion.target === "combat-health" && !COMBAT_HEALTH_PROPERTIES.has(assertion.property)) errors.push(`${assertionPrefix}.property is not an allowlisted combat-health property.`);
      if (assertion.target === "combat-emitter" && !COMBAT_EMITTER_PROPERTIES.has(assertion.property)) errors.push(`${assertionPrefix}.property is not an allowlisted combat-emitter property.`);
      if (assertion.target === "combat-state" && !COMBAT_STATE_PROPERTIES.has(assertion.property)) errors.push(`${assertionPrefix}.property is not an allowlisted combat-state property.`);
      if (assertion.target === "actor-state" && !ACTOR_STATE_PROPERTIES.has(assertion.property)) errors.push(`${assertionPrefix}.property is not an allowlisted actor-state property.`);
    }
  }
  return { executable: true, errors };
}

function observeAssertion(runtime, assertion, eventRecords) {
  const state = runtime.getState();
  if (assertion.target === "gameplay-variable") return state.variables?.[assertion.targetId];
  if (assertion.target === "completed-rule") return (state.completedRuleIds ?? []).includes(assertion.targetId);
  if (assertion.target === "event-emitted") return eventRecords.filter((entry) => entry.event.type === assertion.targetId).length;
  if (assertion.target === "runtime-state") return state[assertion.property];
  if (assertion.target === "object-property") {
    const object = runtime.getObjects().find((candidate) => candidate.id === assertion.targetId);
    if (!object) return undefined;
    if (assertion.property === "colliderEnabled") return object.collider?.enabled !== false;
    return object[assertion.property];
  }
  if (assertion.target === "traversal-path") {
    const path = runtime.getTraversalPaths().find((candidate) => candidate.id === assertion.targetId);
    return path?.[assertion.property];
  }
  if (assertion.target === "combat-health") return runtime.getCombatState()?.health?.find((entry) => entry.actorId === assertion.targetId)?.[assertion.property];
  if (assertion.target === "combat-emitter") return runtime.getCombatState()?.emitters?.find((entry) => entry.emitterId === assertion.targetId)?.[assertion.property];
  if (assertion.target === "combat-state") return runtime.getCombatState()?.[assertion.property];
  if (assertion.target === "actor-state") return runtime.getActorStates?.().find((entry) => entry.actorId === assertion.targetId)?.[assertion.property];
  return undefined;
}

function valuesEqual(first, second) {
  if (first === undefined || second === undefined) return first === second;
  if ((first && typeof first === "object") || (second && typeof second === "object")) return canonicalReplaySerialize(first) === canonicalReplaySerialize(second);
  return Object.is(first, second);
}

function assertionPassed(operator, observed, expected) {
  if (operator === "equals") return valuesEqual(observed, expected);
  if (operator === "not-equals") return !valuesEqual(observed, expected);
  if (operator === "greater-than") return typeof observed === "number" && observed > Number(expected);
  if (operator === "greater-or-equal") return typeof observed === "number" && observed >= Number(expected);
  if (operator === "less-than") return typeof observed === "number" && observed < Number(expected);
  if (operator === "less-or-equal") return typeof observed === "number" && observed <= Number(expected);
  if (operator === "contains") {
    if (typeof observed === "string") return observed.includes(String(expected));
    if (Array.isArray(observed)) return observed.some((entry) => valuesEqual(entry, expected));
    return false;
  }
  if (operator === "truthy") return Boolean(observed);
  if (operator === "falsy") return !observed;
  return false;
}

function baseReceipt(test, sourceDigest) {
  return {
    schemaVersion: LOOPLAB_ACCEPTANCE_RESULT_SCHEMA,
    runner: LOOPLAB_ACCEPTANCE_RUNNER,
    runnerVersion: LOOPLAB_ACCEPTANCE_RUNNER_VERSION,
    sourceDigest: typeof sourceDigest === "string" && sourceDigest ? sourceDigest : null,
    acceptanceSpecDigest: acceptanceSpecDigest(test),
    testId: String(test?.id ?? ""),
  };
}

export function runAcceptanceTest(project, test, options = {}) {
  const validation = validateExecutableAcceptanceTest(test, options);
  const base = baseReceipt(test, options.sourceDigest);
  if (!validation.executable) return { ...base, status: "specified", passed: false, tickRate: null, tickCount: 0, inputDigest: null, assertions: [], errors: [] };
  if (validation.errors.length) return { ...base, status: "invalid", passed: false, tickRate: Number(test?.driver?.tickRate ?? 60), tickCount: 0, inputDigest: null, assertions: [], errors: validation.errors };

  const tickRate = Number(test.driver.tickRate ?? 60);
  const tickCount = Number(test.driver.tickCount);
  const inputDigest = digest("acceptance-input", test.driver.inputs ?? []);
  try {
    const runtime = createRuntimeModel(clone(project));
    if (test.driver.startMapId && !runtime.loadMap(test.driver.startMapId, test.driver.startSpawnId ?? null)) {
      return { ...base, status: "invalid", passed: false, tickRate, tickCount: 0, inputDigest, assertions: [], errors: [`Acceptance test ${test.id} references missing start map ${test.driver.startMapId}.`] };
    }
    runtime.drainEvents();
    const inputsByTick = new Map();
    for (const input of test.driver.inputs ?? []) {
      const inputs = inputsByTick.get(input.tick) ?? [];
      inputs.push(input);
      inputsByTick.set(input.tick, inputs);
    }
    const assertionsByTick = new Map();
    for (const assertion of test.assertions) {
      const tick = Number(assertion.atTick ?? tickCount);
      const assertions = assertionsByTick.get(tick) ?? [];
      assertions.push(assertion);
      assertionsByTick.set(tick, assertions);
    }
    const eventRecords = [];
    const emittedEventCounts = {};
    const assertionResults = [];
    for (let tickIndex = 0; tickIndex < tickCount; tickIndex += 1) {
      for (const input of inputsByTick.get(tickIndex) ?? []) {
        const code = resolveReplayActionCode(project, input);
        if (!code) throw new Error(`Acceptance test ${test.id} has an unresolved input at tick ${tickIndex}.`);
        runtime.setInput(code, input.pressed);
      }
      const events = runtime.update(1 / tickRate);
      const tick = tickIndex + 1;
      for (const event of events) {
        eventRecords.push({ tick, event: clone(event) });
        emittedEventCounts[event.type] = (emittedEventCounts[event.type] ?? 0) + 1;
      }
      for (const assertion of assertionsByTick.get(tick) ?? []) {
        const observed = observeAssertion(runtime, assertion, eventRecords);
        const passed = assertionPassed(assertion.operator, observed, assertion.expected);
        assertionResults.push({
          id: assertion.id,
          status: passed ? "passed" : "failed",
          target: assertion.target,
          targetId: assertion.targetId ?? null,
          property: assertion.property ?? null,
          operator: assertion.operator,
          expected: hasOwn(assertion, "expected") ? clone(assertion.expected) : null,
          observed: observed === undefined ? null : clone(observed),
          observedDefined: observed !== undefined,
          tick,
        });
      }
    }
    const passed = assertionResults.length === test.assertions.length && assertionResults.every((assertion) => assertion.status === "passed");
    return {
      ...base,
      status: passed ? "passed" : "failed",
      passed,
      tickRate,
      tickCount,
      inputDigest,
      assertions: assertionResults,
      firstFailure: assertionResults.find((assertion) => assertion.status === "failed") ?? null,
      emittedEventCounts,
      errors: [],
    };
  } catch (error) {
    return { ...base, status: "invalid", passed: false, tickRate, tickCount: 0, inputDigest, assertions: [], errors: [error instanceof Error ? error.message : String(error)] };
  }
}

export function runAcceptanceSuite(project, options = {}) {
  const allTests = Array.isArray(project?.acceptanceTests) ? project.acceptanceTests : [];
  const selected = options.testId ? allTests.filter((test) => test?.id === options.testId) : allTests;
  if (options.testId && selected.length === 0) throw new Error(`Acceptance test was not found: ${options.testId}`);
  const tests = selected.map((test) => runAcceptanceTest(project, test, options));
  const passedCount = tests.filter((result) => result.status === "passed").length;
  const failedCount = tests.filter((result) => result.status === "failed").length;
  const invalidCount = tests.filter((result) => result.status === "invalid").length;
  const specifiedCount = tests.filter((result) => result.status === "specified").length;
  const status = tests.length === 0 ? "no-specs" : invalidCount ? "invalid" : failedCount ? "failed" : specifiedCount ? "specified" : "passed";
  return {
    schemaVersion: LOOPLAB_ACCEPTANCE_RESULT_SCHEMA,
    status,
    passed: status === "passed",
    testCount: tests.length,
    executableCount: tests.length - specifiedCount,
    passedCount,
    failedCount,
    invalidCount,
    specifiedCount,
    tests,
  };
}

function referencedTestOwners(project) {
  const references = new Map();
  const add = (id, ownerType, ownerId) => {
    if (!stableId(id)) return;
    const owners = references.get(id) ?? [];
    const key = `${ownerType}:${ownerId}`;
    if (!owners.some((owner) => `${owner.type}:${owner.id}` === key)) owners.push({ type: ownerType, id: ownerId });
    references.set(id, owners);
  };
  const architecture = project?.verbArchitecture;
  for (const verb of architecture?.verbs ?? []) if (verb?.status !== "cut") for (const id of verb?.testIds ?? []) add(id, "verb", verb.id);
  for (const combination of architecture?.combinations ?? []) for (const id of combination?.testIds ?? []) add(id, "combination", combination.id);
  for (const progression of architecture?.progression ?? []) for (const id of progression?.testIds ?? []) add(id, "progression", progression.id);
  for (const contract of project?.featureContracts ?? []) for (const id of Array.isArray(contract?.acceptanceTests) ? contract.acceptanceTests : []) add(id, "feature-contract", contract.id);
  const maps = Array.isArray(project?.maps) && project.maps.length ? project.maps : [{ id: project?.activeMapId ?? "main", traversalPaths: project?.traversalPaths ?? [] }];
  for (const map of maps) for (const path of map?.traversalPaths ?? []) if (path?.acceptanceTestId) add(path.acceptanceTestId, "traversal-path", `${map.id}:${path.id}`);
  for (const id of project?.combatProgram?.acceptanceTestIds ?? []) add(id, "combat-program", "combat");
  for (const id of project?.actorProgram?.acceptanceTestIds ?? []) add(id, "actor-program", "actors");
  return references;
}

function externalEvidence(project, sourceDigest, specById) {
  const passedIds = new Set();
  const staleIds = new Set();
  const evidenceRefs = project?.iteration?.verification?.evidenceRefs;
  if (!Array.isArray(evidenceRefs)) return { passedIds, staleIds };
  for (const evidence of evidenceRefs) {
    if (!evidence || typeof evidence !== "object" || evidence.status !== "passed" || !BEHAVIOR_EVIDENCE_TYPES.has(evidence.type) || !Array.isArray(evidence.checks)) continue;
    for (const check of evidence.checks) {
      if (!check || typeof check.id !== "string" || check.status !== "passed") continue;
      const spec = specById.get(check.id);
      const expectedSpecDigest = spec ? acceptanceSpecDigest(spec) : null;
      const declaredSpecDigest = check.acceptanceSpecDigest ?? evidence.acceptanceSpecDigest ?? null;
      const current = Boolean(sourceDigest && evidence.sourceDigest === sourceDigest && (!declaredSpecDigest || !expectedSpecDigest || declaredSpecDigest === expectedSpecDigest));
      if (current) passedIds.add(check.id);
      else staleIds.add(check.id);
    }
  }
  return { passedIds, staleIds };
}

function safeReplaySuite(project, replayResults) {
  if (replayResults) return replayResults;
  try {
    return runReplaySuite(project);
  } catch (error) {
    return { schemaVersion: "looplab-replay-result/v1", status: "invalid", passed: false, caseCount: 0, passedCount: 0, failedCount: 0, recordableCount: 0, firstDivergence: null, cases: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export function collectPassingTestIds(project, options = {}) {
  const acceptanceResults = options.acceptanceResults ?? runAcceptanceSuite(project, { sourceDigest: options.sourceDigest });
  const replayResults = safeReplaySuite(project, options.replayResults);
  const specById = new Map((project?.acceptanceTests ?? []).filter((test) => stableId(test?.id)).map((test) => [test.id, test]));
  const external = externalEvidence(project, options.sourceDigest, specById);
  const ids = new Set(external.passedIds);
  for (const result of acceptanceResults.tests ?? []) if (result.status === "passed") ids.add(result.testId);
  for (const result of replayResults.cases ?? []) if (result.status === "passed") ids.add(result.caseId);
  return ids;
}

export function getAcceptancePlan(project, options = {}) {
  const acceptanceResults = options.acceptanceResults ?? runAcceptanceSuite(project, { sourceDigest: options.sourceDigest });
  const replayResults = safeReplaySuite(project, options.replayResults);
  const specs = Array.isArray(project?.acceptanceTests) ? project.acceptanceTests : [];
  const specById = new Map(specs.filter((test) => stableId(test?.id)).map((test) => [test.id, test]));
  const replayById = new Map((project?.replay?.cases ?? []).filter((replayCase) => stableId(replayCase?.id)).map((replayCase) => [replayCase.id, replayCase]));
  const acceptanceById = new Map((acceptanceResults.tests ?? []).map((result) => [result.testId, result]));
  const replayResultById = new Map((replayResults.cases ?? []).map((result) => [result.caseId, result]));
  const references = referencedTestOwners(project);
  const external = externalEvidence(project, options.sourceDigest, specById);
  const ids = new Set([...references.keys(), ...specById.keys(), ...replayById.keys(), ...external.passedIds, ...external.staleIds]);
  const items = [...ids].sort().map((id) => {
    const acceptance = acceptanceById.get(id);
    const replay = replayResultById.get(id);
    let status = "missing";
    let proof = null;
    if (acceptance?.status === "passed") { status = "passed"; proof = "deterministic-acceptance"; }
    else if (replay?.status === "passed") { status = "passed"; proof = "deterministic-replay"; }
    else if (external.passedIds.has(id)) { status = "passed"; proof = "source-bound-external"; }
    else if (acceptance?.status === "failed" || replay?.status === "failed") status = "failed";
    else if (acceptance?.status === "invalid" || replayResults.status === "invalid" && replayById.has(id)) status = "invalid";
    else if (external.staleIds.has(id)) status = "stale";
    else if (acceptance?.status === "specified" || specById.has(id)) status = "specified";
    else if (replay?.status === "recordable") status = "recordable";
    return {
      id,
      status,
      proof,
      referenced: references.has(id),
      owners: clone(references.get(id) ?? []),
      acceptanceSpecDigest: specById.has(id) ? acceptanceSpecDigest(specById.get(id)) : null,
      assertionCount: acceptance?.assertions?.length ?? 0,
      firstFailure: clone(acceptance?.firstFailure ?? null),
      errors: clone(acceptance?.errors ?? []),
    };
  });
  const referencedItems = items.filter((item) => item.referenced);
  const verbOwned = (item) => item.owners.some((owner) => ["verb", "combination", "progression"].includes(owner.type));
  return {
    schemaVersion: "looplab-acceptance-plan/v1",
    sourceDigest: options.sourceDigest ?? null,
    referencedCount: referencedItems.length,
    passingIds: items.filter((item) => item.status === "passed").map((item) => item.id),
    specOnlyIds: items.filter((item) => item.status === "specified").map((item) => item.id),
    referencedSpecOnlyIds: referencedItems.filter((item) => item.status === "specified").map((item) => item.id),
    verbSpecOnlyIds: referencedItems.filter((item) => item.status === "specified" && verbOwned(item)).map((item) => item.id),
    failedIds: items.filter((item) => item.status === "failed").map((item) => item.id),
    invalidIds: items.filter((item) => item.status === "invalid").map((item) => item.id),
    staleIds: referencedItems.filter((item) => item.status === "stale").map((item) => item.id),
    missingIds: referencedItems.filter((item) => item.status === "missing" || item.status === "recordable").map((item) => item.id),
    unreferencedSpecIds: items.filter((item) => !item.referenced && specById.has(item.id)).map((item) => item.id),
    items,
  };
}
