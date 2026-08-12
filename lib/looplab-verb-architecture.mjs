import { collectPassingTestIds } from "./looplab-acceptance.mjs";

const VERB_CATEGORIES = new Set(["movement", "interaction", "combat", "world-state", "resource", "recovery", "expression", "utility"]);
const VERB_STATUSES = new Set(["core", "supporting", "cut"]);
const PAIR_DECISIONS = new Set(["keep", "cut", "defer"]);
const ARCHITECTURE_STATUSES = new Set(["draft", "implemented", "verified"]);
const VERB_CONTEXTS = new Set(["traversal", "encounter", "puzzle", "progression", "recovery", "expression"]);
const VERB_ROLES = new Set(["primary", "supporting", "contextual", "recovery", "expression"]);
const VERB_ACTIVATIONS = new Set(["press", "hold", "release", "contextual"]);
const RELATIONSHIP_OPERATORS = new Set(["sequence", "simultaneous", "modifier", "state-gate", "resource-loop", "counterplay", "substitution"]);
const RELATIONSHIP_CADENCES = new Set(["recurring", "situational", "mastery"]);
const APPLICATION_STAGES = new Set(["teach", "practice", "combine", "pressure", "mastery", "recovery", "expression"]);
const CORE_LOOP_PHASES = new Set(["observe", "decide", "act", "resolve", "feedback", "recover", "progress"]);

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const stableId = (value) => typeof value === "string" && /^[a-z0-9][a-z0-9._:-]*$/i.test(value);
const strings = (value) => Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter(Boolean) : [];
const boundedScore = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const pairKey = (ids) => [...ids].sort().join("::");

function normalizedVerb(verb = {}) {
  return {
    ...clone(verb),
    id: String(verb.id ?? "").trim(),
    label: String(verb.label ?? verb.id ?? "").trim(),
    category: VERB_CATEGORIES.has(verb.category) ? verb.category : "interaction",
    status: VERB_STATUSES.has(verb.status) ? verb.status : "core",
    description: String(verb.description ?? "").trim(),
    purpose: String(verb.purpose ?? "").trim(),
    role: VERB_ROLES.has(verb.role) ? verb.role : (verb.status === "supporting" ? "supporting" : "primary"),
    activation: VERB_ACTIVATIONS.has(verb.activation) ? verb.activation : "press",
    standalone: verb.standalone !== false,
    dependsOnVerbIds: strings(verb.dependsOnVerbIds),
    inputActionIds: strings(verb.inputActionIds),
    affordanceIds: strings(verb.affordanceIds),
    stateChanges: strings(verb.stateChanges),
    feedbackIds: strings(verb.feedbackIds),
    implementationIds: strings(verb.implementationIds),
    testIds: strings(verb.testIds),
  };
}

function normalizedPair(evaluation = {}) {
  const verbIds = [...new Set(strings(evaluation.verbIds))].slice(0, 2).sort();
  return {
    ...clone(evaluation),
    id: String(evaluation.id ?? (verbIds.length === 2 ? `pair-${verbIds.join("-")}` : "")).trim(),
    verbIds,
    synergy: boundedScore(evaluation.synergy),
    redundancy: boundedScore(evaluation.redundancy),
    readability: boundedScore(evaluation.readability),
    implementationCost: boundedScore(evaluation.implementationCost),
    decision: PAIR_DECISIONS.has(evaluation.decision) ? evaluation.decision : "defer",
    rationale: String(evaluation.rationale ?? "").trim(),
  };
}

function normalizedCombination(combination = {}) {
  return {
    ...clone(combination),
    id: String(combination.id ?? "").trim(),
    verbIds: [...new Set(strings(combination.verbIds))],
    contexts: [...new Set(strings(combination.contexts))],
    consequence: String(combination.consequence ?? "").trim(),
    introducedMapId: typeof combination.introducedMapId === "string" ? combination.introducedMapId.trim() : null,
    masteryMapId: typeof combination.masteryMapId === "string" ? combination.masteryMapId.trim() : null,
    implementationIds: strings(combination.implementationIds),
    testIds: strings(combination.testIds),
  };
}

function normalizedProgression(entry = {}) {
  return {
    ...clone(entry),
    id: String(entry.id ?? "").trim(),
    label: String(entry.label ?? entry.id ?? "").trim(),
    requiresIds: strings(entry.requiresIds),
    unlocksVerbIds: strings(entry.unlocksVerbIds),
    modifiesVerbIds: strings(entry.modifiesVerbIds),
    relationshipIds: strings(entry.relationshipIds),
    applicationIds: strings(entry.applicationIds),
    implementationIds: strings(entry.implementationIds),
    testIds: strings(entry.testIds),
  };
}

function normalizedRelationship(relationship = {}) {
  return {
    ...clone(relationship),
    id: String(relationship.id ?? "").trim(),
    verbIds: [...new Set(strings(relationship.verbIds))],
    operator: RELATIONSHIP_OPERATORS.has(relationship.operator) ? relationship.operator : "sequence",
    contexts: [...new Set(strings(relationship.contexts))],
    consequence: String(relationship.consequence ?? "").trim(),
    cadence: RELATIONSHIP_CADENCES.has(relationship.cadence) ? relationship.cadence : "recurring",
    rationale: String(relationship.rationale ?? "").trim(),
    implementationIds: strings(relationship.implementationIds),
    testIds: strings(relationship.testIds),
  };
}

function normalizedApplication(application = {}) {
  return {
    ...clone(application),
    id: String(application.id ?? "").trim(),
    label: String(application.label ?? application.id ?? "").trim(),
    mapId: typeof application.mapId === "string" ? application.mapId.trim() : null,
    stage: APPLICATION_STAGES.has(application.stage) ? application.stage : "practice",
    verbIds: [...new Set(strings(application.verbIds))],
    relationshipIds: [...new Set(strings(application.relationshipIds))],
    setup: String(application.setup ?? "").trim(),
    success: String(application.success ?? "").trim(),
    failure: String(application.failure ?? "").trim(),
    recovery: String(application.recovery ?? "").trim(),
    implementationIds: strings(application.implementationIds),
    testIds: strings(application.testIds),
  };
}

function normalizedCoreLoopStep(step = {}) {
  return {
    ...clone(step),
    id: String(step.id ?? "").trim(),
    phase: CORE_LOOP_PHASES.has(step.phase) ? step.phase : "act",
    verbIds: [...new Set(strings(step.verbIds))],
    relationshipIds: [...new Set(strings(step.relationshipIds))],
    stateChanges: strings(step.stateChanges),
    implementationIds: strings(step.implementationIds),
    testIds: strings(step.testIds),
  };
}

function normalizedResource(resource = {}) {
  return {
    ...clone(resource),
    id: String(resource.id ?? "").trim(),
    label: String(resource.label ?? resource.id ?? "").trim(),
    stateId: String(resource.stateId ?? "").trim(),
    gainedByVerbIds: [...new Set(strings(resource.gainedByVerbIds))],
    spentByVerbIds: [...new Set(strings(resource.spentByVerbIds))],
    pressure: String(resource.pressure ?? "").trim(),
    recovery: String(resource.recovery ?? "").trim(),
    implementationIds: strings(resource.implementationIds),
    testIds: strings(resource.testIds),
  };
}

export function normalizeVerbArchitecture(input = {}) {
  const version = Number(input.version) === 1 ? 1 : 2;
  return {
    ...clone(input),
    version,
    status: ARCHITECTURE_STATUSES.has(input.status) ? input.status : "draft",
    hypothesis: String(input.hypothesis ?? "").trim(),
    verbs: Array.isArray(input.verbs) ? input.verbs.map(normalizedVerb) : [],
    pairEvaluations: Array.isArray(input.pairEvaluations) ? input.pairEvaluations.map(normalizedPair) : [],
    combinations: Array.isArray(input.combinations) ? input.combinations.map(normalizedCombination) : [],
    relationships: version >= 2 && Array.isArray(input.relationships) ? input.relationships.map(normalizedRelationship) : [],
    applications: version >= 2 && Array.isArray(input.applications) ? input.applications.map(normalizedApplication) : [],
    coreLoop: version >= 2 && Array.isArray(input.coreLoop) ? input.coreLoop.map(normalizedCoreLoopStep) : [],
    resources: version >= 2 && Array.isArray(input.resources) ? input.resources.map(normalizedResource) : [],
    progression: Array.isArray(input.progression) ? input.progression.map(normalizedProgression) : [],
  };
}

function allPairs(ids) {
  const result = [];
  for (let first = 0; first < ids.length; first += 1) {
    for (let second = first + 1; second < ids.length; second += 1) result.push(pairKey([ids[first], ids[second]]));
  }
  return result;
}

function collectRuntimeIds(project) {
  const ids = new Set();
  const evidenceOnlyKeys = new Set([
    "acceptanceTests", "agentRequests", "agentWorkLedger", "assets", "build", "designBrief", "deviceProfiles", "featureContracts",
    "iteration", "iterationArchive", "iterationHistory", "qualityContracts", "release", "replay",
    "resources", "verbArchitecture", "visualReferences", "workstreams",
  ]);
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach((entry) => visit(entry));
    if (!value || typeof value !== "object") return;
    for (const [childKey, childValue] of Object.entries(value)) {
      if (childKey === "id" && typeof childValue === "string" && childValue.trim()) ids.add(childValue.trim());
      if (!evidenceOnlyKeys.has(childKey)) visit(childValue);
    }
  };
  visit(project);
  return ids;
}

const coverageRatio = (covered, total) => total > 0 ? covered / total : 1;

function inspectVerbSystemV2(project, architecture, evidence = {}) {
  const errors = [];
  const warnings = [];
  const implementationGaps = [];
  const testGaps = [];
  const feedbackGaps = [];
  const independentUseGaps = [];
  const relationshipUseGaps = [];
  const recoveryGaps = [];
  const loopGaps = [];
  const resourceGaps = [];
  const progressionGaps = [];
  const inputActionIds = new Set((project?.inputActions ?? []).map((action) => action?.id).filter(stableId));
  const projectIds = collectRuntimeIds(project ?? {});
  const passingTestIds = evidence.passingTestIds
    ? new Set(evidence.passingTestIds)
    : collectPassingTestIds(project ?? {}, {
      sourceDigest: evidence.sourceDigest,
      acceptanceResults: evidence.acceptanceResults,
      replayResults: evidence.replayResults,
    });
  const mapIds = new Set((project?.maps ?? []).map((map) => map?.id).filter(stableId));
  const evidenceOwners = [];

  const inspectEvidence = (ownerType, owner) => {
    const key = ownerType + ":" + (owner.id || "(unnamed)");
    evidenceOwners.push(key);
    if (!owner.implementationIds?.length || owner.implementationIds.some((id) => !projectIds.has(id))) implementationGaps.push(key);
    if (!owner.testIds?.length || owner.testIds.some((id) => !passingTestIds.has(id))) testGaps.push(key);
  };

  if (!architecture.hypothesis) warnings.push("Verb system v2 requires a player-facing hypothesis about the decisions and dynamics it should create.");

  const verbIds = new Set();
  for (const verb of architecture.verbs) {
    if (!stableId(verb.id)) errors.push("Verb id is missing or unstable: " + (verb.id || "(empty)") + ".");
    else if (verbIds.has(verb.id)) errors.push("Verb id is duplicated: " + verb.id + ".");
    verbIds.add(verb.id);
    if (!verb.label) errors.push("Verb " + (verb.id || "(unnamed)") + " requires a label.");
    if (!verb.description) warnings.push("Verb " + (verb.id || "(unnamed)") + " has no player-facing behavior description.");
  }

  const activeVerbs = architecture.verbs.filter((verb) => verb.status !== "cut");
  const activeVerbIds = new Set(activeVerbs.map((verb) => verb.id));
  if (!activeVerbs.length) warnings.push("Verb system v2 has no active player verb.");
  if (activeVerbs.length > 10) warnings.push("The verb system has more than ten active verbs; justify the input, attention, onboarding, and feedback load or prune it.");

  for (const verb of activeVerbs) {
    if (!verb.purpose) warnings.push("Selected verb " + verb.id + " does not explain what distinct player decision it earns.");
    if (!verb.inputActionIds.length) warnings.push("Selected verb " + verb.id + " has no semantic input action.");
    for (const actionId of verb.inputActionIds) if (!inputActionIds.has(actionId)) errors.push("Verb " + verb.id + " references unknown input action " + actionId + ".");
    if (!verb.stateChanges.length) warnings.push("Selected verb " + verb.id + " does not name an observable gameplay state change.");
    if (!verb.affordanceIds.length && !["movement", "expression"].includes(verb.category)) warnings.push("Selected verb " + verb.id + " has no authored affordance or target ID.");
    for (const affordanceId of verb.affordanceIds) if (!projectIds.has(affordanceId)) errors.push("Verb " + verb.id + " references unknown affordance " + affordanceId + ".");
    if (!verb.feedbackIds.length || verb.feedbackIds.some((id) => !projectIds.has(id))) {
      feedbackGaps.push("verb:" + verb.id);
      warnings.push("Selected verb " + verb.id + " lacks complete runtime feedback references.");
    }
    if (!verb.standalone && !verb.dependsOnVerbIds.length) warnings.push("Dependent verb " + verb.id + " must name the verb IDs it modifies or requires.");
    for (const dependencyId of verb.dependsOnVerbIds) if (!activeVerbIds.has(dependencyId) || dependencyId === verb.id) errors.push("Verb " + verb.id + " has invalid dependency " + dependencyId + ".");
    inspectEvidence("verb", verb);
  }

  const relationshipIds = new Set();
  const relationshipById = new Map();
  const relationshipContexts = new Set();
  for (const relationship of architecture.relationships) {
    if (!stableId(relationship.id)) errors.push("Relationship id is missing or unstable: " + (relationship.id || "(empty)") + ".");
    else if (relationshipIds.has(relationship.id)) errors.push("Relationship id is duplicated: " + relationship.id + ".");
    relationshipIds.add(relationship.id);
    relationshipById.set(relationship.id, relationship);
    if (relationship.verbIds.length < 2) errors.push("Relationship " + (relationship.id || "(unnamed)") + " must connect at least two active verbs.");
    for (const id of relationship.verbIds) if (!activeVerbIds.has(id)) errors.push("Relationship " + (relationship.id || "(unnamed)") + " references unknown active verb " + id + ".");
    if (!relationship.contexts.length) warnings.push("Relationship " + (relationship.id || "(unnamed)") + " has no gameplay context.");
    for (const context of relationship.contexts) {
      if (!VERB_CONTEXTS.has(context)) errors.push("Relationship " + (relationship.id || "(unnamed)") + " uses unsupported context " + context + ".");
      relationshipContexts.add(context);
    }
    if (!relationship.consequence) warnings.push("Relationship " + (relationship.id || "(unnamed)") + " does not name an observable state-changing consequence.");
    if (!relationship.rationale) warnings.push("Relationship " + (relationship.id || "(unnamed)") + " does not explain the new decision created by the connection.");
    inspectEvidence("relationship", relationship);
  }

  const applicationIds = new Set();
  const relationshipUses = new Map(architecture.relationships.map((relationship) => [relationship.id, []]));
  const independentlyUsedVerbIds = new Set();
  const applicationCoveredVerbIds = new Set();
  const applicationContexts = new Set();
  for (const application of architecture.applications) {
    if (!stableId(application.id)) errors.push("Application id is missing or unstable: " + (application.id || "(empty)") + ".");
    else if (applicationIds.has(application.id)) errors.push("Application id is duplicated: " + application.id + ".");
    applicationIds.add(application.id);
    if (!application.label) errors.push("Application " + (application.id || "(unnamed)") + " requires a label.");
    if (!application.mapId) warnings.push("Application " + (application.id || "(unnamed)") + " has no authored map.");
    else if (mapIds.size && !mapIds.has(application.mapId)) errors.push("Application " + (application.id || "(unnamed)") + " references unknown map " + application.mapId + ".");
    if (!application.verbIds.length && !application.relationshipIds.length) errors.push("Application " + (application.id || "(unnamed)") + " must exercise a verb or relationship.");
    for (const id of application.verbIds) {
      if (!activeVerbIds.has(id)) errors.push("Application " + (application.id || "(unnamed)") + " references unknown active verb " + id + ".");
      applicationCoveredVerbIds.add(id);
    }
    for (const id of application.relationshipIds) {
      if (!relationshipIds.has(id)) errors.push("Application " + (application.id || "(unnamed)") + " references unknown relationship " + id + ".");
      else {
        relationshipUses.get(id).push(application);
        for (const verbId of relationshipById.get(id).verbIds) applicationCoveredVerbIds.add(verbId);
      }
    }
    if (application.verbIds.length === 1 && application.relationshipIds.length === 0) independentlyUsedVerbIds.add(application.verbIds[0]);
    if (!application.setup) warnings.push("Application " + (application.id || "(unnamed)") + " does not define a readable setup.");
    if (!application.success) warnings.push("Application " + (application.id || "(unnamed)") + " does not define an observable success state.");
    if (!application.failure || !application.recovery) {
      recoveryGaps.push("application:" + (application.id || "(unnamed)"));
      warnings.push("Application " + (application.id || "(unnamed)") + " must define both failure and recovery so the verb system remains playable.");
    }
    applicationContexts.add(application.stage);
    inspectEvidence("application", application);
  }

  for (const verb of activeVerbs) {
    if (!applicationCoveredVerbIds.has(verb.id)) warnings.push("Selected verb " + verb.id + " is never exercised by an authored application.");
    if (verb.standalone && !independentlyUsedVerbIds.has(verb.id)) {
      independentUseGaps.push(verb.id);
      warnings.push("Standalone verb " + verb.id + " has no independent authored application.");
    }
  }

  const earlyStages = new Set(["teach", "practice", "combine"]);
  const advancedStages = new Set(["pressure", "mastery", "recovery", "expression"]);
  for (const relationship of architecture.relationships) {
    const uses = relationshipUses.get(relationship.id) ?? [];
    const onlyMastery = uses.length > 0 && uses.every((application) => application.stage === "mastery");
    const lacksRecurrence = relationship.cadence === "recurring" && uses.length < 2;
    const lacksEarlyUse = relationship.cadence === "recurring" && !uses.some((application) => earlyStages.has(application.stage));
    const lacksAdvancedUse = relationship.cadence === "recurring" && !uses.some((application) => advancedStages.has(application.stage));
    if (!uses.length || onlyMastery || lacksRecurrence || lacksEarlyUse || lacksAdvancedUse) {
      relationshipUseGaps.push(relationship.id);
      const reason = !uses.length
        ? "has no authored application"
        : onlyMastery
          ? "appears only at mastery/finale"
          : lacksRecurrence
            ? "is marked recurring but appears fewer than twice"
            : lacksEarlyUse
              ? "has no teaching, practice, or combination application"
              : "has no pressure, mastery, recovery, or expression application";
      warnings.push("Relationship " + relationship.id + " " + reason + ".");
    }
  }

  const loopStepIds = new Set();
  const loopPhases = new Set();
  const coreLoopVerbIds = new Set();
  for (const step of architecture.coreLoop) {
    if (!stableId(step.id)) errors.push("Core-loop step id is missing or unstable: " + (step.id || "(empty)") + ".");
    else if (loopStepIds.has(step.id)) errors.push("Core-loop step id is duplicated: " + step.id + ".");
    loopStepIds.add(step.id);
    loopPhases.add(step.phase);
    if (!step.verbIds.length && !step.relationshipIds.length && step.phase === "act") warnings.push("Core-loop action step " + (step.id || "(unnamed)") + " does not exercise a verb or relationship.");
    for (const id of step.verbIds) {
      if (!activeVerbIds.has(id)) errors.push("Core-loop step " + (step.id || "(unnamed)") + " references unknown active verb " + id + ".");
      coreLoopVerbIds.add(id);
    }
    for (const id of step.relationshipIds) {
      if (!relationshipIds.has(id)) errors.push("Core-loop step " + (step.id || "(unnamed)") + " references unknown relationship " + id + ".");
      else for (const verbId of relationshipById.get(id).verbIds) coreLoopVerbIds.add(verbId);
    }
    inspectEvidence("core-loop", step);
  }
  if (architecture.coreLoop.length < 3) loopGaps.push("core-loop:too-short");
  for (const phase of ["decide", "act", "feedback"]) if (!loopPhases.has(phase)) loopGaps.push("core-loop:missing-" + phase);
  for (const verb of activeVerbs.filter((entry) => entry.role === "primary")) if (!coreLoopVerbIds.has(verb.id)) loopGaps.push("verb:" + verb.id);
  if (loopGaps.length) warnings.push("The repeatable core loop is incomplete: " + loopGaps.join(", ") + ".");

  const resourceIds = new Set();
  for (const resource of architecture.resources) {
    if (!stableId(resource.id)) errors.push("Resource id is missing or unstable: " + (resource.id || "(empty)") + ".");
    else if (resourceIds.has(resource.id)) errors.push("Resource id is duplicated: " + resource.id + ".");
    resourceIds.add(resource.id);
    if (!resource.label) errors.push("Resource " + (resource.id || "(unnamed)") + " requires a label.");
    if (!stableId(resource.stateId) || !projectIds.has(resource.stateId)) resourceGaps.push("resource:" + (resource.id || "(unnamed)") + ":state");
    for (const id of [...resource.gainedByVerbIds, ...resource.spentByVerbIds]) if (!activeVerbIds.has(id)) errors.push("Resource " + (resource.id || "(unnamed)") + " references unknown active verb " + id + ".");
    if (!resource.gainedByVerbIds.length || !resource.spentByVerbIds.length) resourceGaps.push("resource:" + (resource.id || "(unnamed)") + ":flow");
    if (!resource.pressure || !resource.recovery) resourceGaps.push("resource:" + (resource.id || "(unnamed)") + ":pressure-recovery");
    inspectEvidence("resource", resource);
  }
  if (resourceGaps.length) warnings.push("Resource loops have unresolved state, source/sink, pressure, or recovery coverage: " + resourceGaps.join(", ") + ".");

  const progressionIds = new Set(architecture.progression.map((entry) => entry.id).filter(stableId));
  const seenProgressionIds = new Set();
  const progressionDependencies = new Map();
  for (const entry of architecture.progression) {
    if (!stableId(entry.id)) errors.push("Progression id is missing or unstable: " + (entry.id || "(empty)") + ".");
    else if (seenProgressionIds.has(entry.id)) errors.push("Progression id is duplicated: " + entry.id + ".");
    seenProgressionIds.add(entry.id);
    for (const id of [...entry.unlocksVerbIds, ...entry.modifiesVerbIds]) if (!activeVerbIds.has(id)) errors.push("Progression " + (entry.id || "(unnamed)") + " references unknown active verb " + id + ".");
    for (const id of entry.relationshipIds) if (!relationshipIds.has(id)) errors.push("Progression " + (entry.id || "(unnamed)") + " references unknown relationship " + id + ".");
    for (const id of entry.applicationIds) if (!applicationIds.has(id)) errors.push("Progression " + (entry.id || "(unnamed)") + " references unknown application " + id + ".");
    for (const id of entry.requiresIds) if (!projectIds.has(id) && !progressionIds.has(id)) warnings.push("Progression " + (entry.id || "(unnamed)") + " requires unresolved runtime or progression id " + id + ".");
    progressionDependencies.set(entry.id, entry.requiresIds.filter((id) => progressionIds.has(id)));
    inspectEvidence("progression", entry);
  }
  const visiting = new Set();
  const visited = new Set();
  let progressionCycle = false;
  const visitProgression = (id) => {
    if (visiting.has(id)) {
      progressionCycle = true;
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependencyId of progressionDependencies.get(id) ?? []) visitProgression(dependencyId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of progressionIds) visitProgression(id);
  if (progressionCycle) {
    progressionGaps.push("progression:cycle");
    errors.push("Verb-system progression contains a dependency cycle.");
  }

  const isolatedVerbIds = activeVerbs
    .filter((verb) => !applicationCoveredVerbIds.has(verb.id) && !coreLoopVerbIds.has(verb.id))
    .map((verb) => verb.id);
  const activeStandaloneVerbs = activeVerbs.filter((verb) => verb.standalone);
  const provenImplementationCount = evidenceOwners.length - new Set(implementationGaps).size;
  const provenTestCount = evidenceOwners.length - new Set(testGaps).size;

  return {
    present: true,
    architecture,
    errors,
    warnings,
    implementationGaps,
    testGaps,
    feedbackGaps,
    independentUseGaps,
    relationshipUseGaps,
    recoveryGaps,
    loopGaps,
    resourceGaps,
    progressionGaps,
    missingPairs: [],
    unprovenKeptPairs: [],
    graph: {
      nodes: activeVerbs.map((verb) => ({ id: verb.id, role: verb.role, standalone: verb.standalone })),
      edges: architecture.relationships.map((relationship) => ({ id: relationship.id, verbIds: relationship.verbIds, operator: relationship.operator, cadence: relationship.cadence })),
      isolatedVerbIds,
    },
    metrics: {
      selectedVerbCount: activeVerbs.length,
      activeVerbCount: activeVerbs.length,
      pairCoverage: 1,
      combinationCount: architecture.relationships.length,
      relationshipCount: architecture.relationships.length,
      applicationCount: architecture.applications.length,
      contextCount: new Set([...relationshipContexts, ...applicationContexts]).size,
      keptPairCount: 0,
      unprovenKeptPairCount: 0,
      independentUseCoverage: coverageRatio(activeStandaloneVerbs.length - independentUseGaps.length, activeStandaloneVerbs.length),
      relationshipUseCoverage: coverageRatio(architecture.relationships.length - relationshipUseGaps.length, architecture.relationships.length),
      feedbackCoverage: coverageRatio(activeVerbs.length - feedbackGaps.length, activeVerbs.length),
      recoveryCoverage: coverageRatio(architecture.applications.length - recoveryGaps.length, architecture.applications.length),
      runtimeEvidenceCoverage: coverageRatio(provenImplementationCount, evidenceOwners.length),
      testEvidenceCoverage: coverageRatio(provenTestCount, evidenceOwners.length),
    },
  };
}

export function inspectVerbArchitecture(project, input = project?.verbArchitecture, evidence = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      present: false,
      architecture: null,
      errors: [],
      warnings: [],
      implementationGaps: [],
      testGaps: [],
      feedbackGaps: [],
      independentUseGaps: [],
      relationshipUseGaps: [],
      recoveryGaps: [],
      loopGaps: [],
      resourceGaps: [],
      progressionGaps: [],
      missingPairs: [],
      unprovenKeptPairs: [],
      graph: { nodes: [], edges: [], isolatedVerbIds: [] },
      metrics: {
        selectedVerbCount: 0,
        activeVerbCount: 0,
        pairCoverage: 0,
        combinationCount: 0,
        relationshipCount: 0,
        applicationCount: 0,
        contextCount: 0,
        keptPairCount: 0,
        unprovenKeptPairCount: 0,
        independentUseCoverage: 0,
        relationshipUseCoverage: 0,
        feedbackCoverage: 0,
        recoveryCoverage: 0,
        runtimeEvidenceCoverage: 0,
        testEvidenceCoverage: 0,
      },
    };
  }
  const architecture = normalizeVerbArchitecture(input);
  if (architecture.version >= 2) return inspectVerbSystemV2(project, architecture, evidence);
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const inputActionIds = new Set((project?.inputActions ?? []).map((action) => action?.id).filter(stableId));
  for (const verb of architecture.verbs) {
    if (!stableId(verb.id)) errors.push(`Verb id is missing or unstable: ${verb.id || "(empty)"}.`);
    else if (ids.has(verb.id)) errors.push(`Verb id is duplicated: ${verb.id}.`);
    ids.add(verb.id);
    if (!verb.label) errors.push(`Verb ${verb.id || "(unnamed)"} requires a label.`);
    if (!verb.description) warnings.push(`Verb ${verb.id || "(unnamed)"} has no player-facing behavior description.`);
    if (verb.status !== "cut" && !verb.stateChanges.length) warnings.push(`Selected verb ${verb.id || "(unnamed)"} does not name an observable gameplay state change.`);
    for (const actionId of verb.inputActionIds) if (!inputActionIds.has(actionId)) errors.push(`Verb ${verb.id || "(unnamed)"} references unknown input action ${actionId}.`);
  }
  const selected = architecture.verbs.filter((verb) => verb.status !== "cut");
  if (selected.length < 2) warnings.push("A verb architecture needs at least two selected verbs to create combinations.");
  if (selected.length > 6) warnings.push("More than six selected verbs is likely to exceed onboarding and input readability budgets.");
  const selectedIds = new Set(selected.map((verb) => verb.id));
  const expectedPairs = new Set(allPairs([...selectedIds]));
  const evaluatedPairs = new Set();
  const pairEvaluationIds = new Set();
  const pairDecisions = new Map();
  for (const evaluation of architecture.pairEvaluations) {
    if (!stableId(evaluation.id)) errors.push(`Pair evaluation id is missing or unstable: ${evaluation.id || "(empty)"}.`);
    else if (pairEvaluationIds.has(evaluation.id)) errors.push(`Pair evaluation id is duplicated: ${evaluation.id}.`);
    pairEvaluationIds.add(evaluation.id);
    if (evaluation.verbIds.length !== 2 || evaluation.verbIds.some((id) => !selectedIds.has(id))) errors.push(`Pair evaluation ${evaluation.id || "(unnamed)"} must reference two selected verbs.`);
    const key = pairKey(evaluation.verbIds);
    if (evaluatedPairs.has(key)) errors.push(`Verb pair is evaluated more than once: ${key}.`);
    evaluatedPairs.add(key);
    pairDecisions.set(key, evaluation.decision);
    for (const field of ["synergy", "redundancy", "readability", "implementationCost"]) {
      const score = evaluation[field];
      if (score === null || score < 0 || score > 10) errors.push(`Pair evaluation ${evaluation.id || "(unnamed)"}.${field} must be between 0 and 10.`);
    }
    if (!evaluation.rationale) warnings.push(`Pair evaluation ${evaluation.id || "(unnamed)"} has no decision rationale.`);
  }
  const missingPairs = [...expectedPairs].filter((key) => !evaluatedPairs.has(key));
  if (missingPairs.length) warnings.push(`${missingPairs.length} selected verb pair(s) have not been scored.`);
  const contextIds = new Set();
  const combinedVerbIds = new Set();
  const combinationIds = new Set();
  const authoredCombinationPairs = new Set();
  const mapIds = new Set((project?.maps ?? []).map((map) => map?.id).filter(stableId));
  for (const combination of architecture.combinations) {
    if (!stableId(combination.id)) errors.push(`Combination id is missing or unstable: ${combination.id || "(empty)"}.`);
    else if (combinationIds.has(combination.id)) errors.push(`Combination id is duplicated: ${combination.id}.`);
    combinationIds.add(combination.id);
    if (combination.verbIds.length < 2) errors.push(`Combination ${combination.id || "(unnamed)"} must combine at least two verbs.`);
    for (const id of combination.verbIds) {
      if (!selectedIds.has(id)) errors.push(`Combination ${combination.id || "(unnamed)"} references unknown selected verb ${id}.`);
      combinedVerbIds.add(id);
    }
    if (!combination.consequence) warnings.push(`Combination ${combination.id || "(unnamed)"} does not name a state-changing gameplay consequence.`);
    if (!combination.contexts.length) warnings.push(`Combination ${combination.id || "(unnamed)"} has no traversal, encounter, puzzle, progression, recovery, or expression context.`);
    for (const context of combination.contexts) if (!VERB_CONTEXTS.has(context)) errors.push(`Combination ${combination.id || "(unnamed)"} uses unsupported context ${context}.`);
    for (const key of allPairs(combination.verbIds)) {
      authoredCombinationPairs.add(key);
      if (pairDecisions.has(key) && pairDecisions.get(key) !== "keep") warnings.push(`Combination ${combination.id || "(unnamed)"} uses verb pair ${key} even though its decision is ${pairDecisions.get(key)}.`);
    }
    if (!combination.introducedMapId) warnings.push(`Combination ${combination.id || "(unnamed)"} has no teaching map.`);
    else if (mapIds.size && !mapIds.has(combination.introducedMapId)) errors.push(`Combination ${combination.id || "(unnamed)"} references unknown teaching map ${combination.introducedMapId}.`);
    if (!combination.masteryMapId) warnings.push(`Combination ${combination.id || "(unnamed)"} has no mastery map.`);
    else if (mapIds.size && !mapIds.has(combination.masteryMapId)) errors.push(`Combination ${combination.id || "(unnamed)"} references unknown mastery map ${combination.masteryMapId}.`);
    combination.contexts.forEach((context) => contextIds.add(context));
  }
  for (const verb of selected) if (!combinedVerbIds.has(verb.id)) warnings.push(`Selected verb ${verb.id} is isolated from every authored combination.`);
  const unprovenKeptPairs = [...pairDecisions.entries()].filter(([key, decision]) => decision === "keep" && !authoredCombinationPairs.has(key)).map(([key]) => key);
  if (unprovenKeptPairs.length) warnings.push(`${unprovenKeptPairs.length} kept verb pair(s) have no authored state-changing combination.`);

  const projectIds = collectRuntimeIds(project ?? {});
  const testIds = evidence.passingTestIds
    ? new Set(evidence.passingTestIds)
    : collectPassingTestIds(project ?? {}, {
      sourceDigest: evidence.sourceDigest,
      acceptanceResults: evidence.acceptanceResults,
      replayResults: evidence.replayResults,
    });
  const implementationGaps = [];
  const testGaps = [];
  const inspectEvidence = (ownerType, owner) => {
    if (!owner.implementationIds?.length || owner.implementationIds.some((id) => !projectIds.has(id))) implementationGaps.push(`${ownerType}:${owner.id}`);
    if (!owner.testIds?.length || owner.testIds.some((id) => !testIds.has(id))) testGaps.push(`${ownerType}:${owner.id}`);
  };
  selected.forEach((verb) => inspectEvidence("verb", verb));
  architecture.combinations.forEach((combination) => inspectEvidence("combination", combination));
  const progressionIds = new Set(architecture.progression.map((entry) => entry.id).filter(stableId));
  const seenProgressionIds = new Set();
  architecture.progression.forEach((entry) => {
    if (!stableId(entry.id)) errors.push(`Progression id is missing or unstable: ${entry.id || "(empty)"}.`);
    else if (seenProgressionIds.has(entry.id)) errors.push(`Progression id is duplicated: ${entry.id}.`);
    seenProgressionIds.add(entry.id);
    for (const id of [...entry.unlocksVerbIds, ...entry.modifiesVerbIds]) if (!selectedIds.has(id)) errors.push(`Progression ${entry.id || "(unnamed)"} references unknown selected verb ${id}.`);
    for (const id of entry.requiresIds) if (!projectIds.has(id) && !progressionIds.has(id)) warnings.push(`Progression ${entry.id || "(unnamed)"} requires unresolved runtime or progression id ${id}.`);
    inspectEvidence("progression", entry);
  });
  if (implementationGaps.length) warnings.push(`${implementationGaps.length} verb-architecture item(s) lack complete runtime implementation references.`);
  if (testGaps.length) warnings.push(`${testGaps.length} verb-architecture item(s) lack complete acceptance or replay test references.`);

  return {
    present: true,
    architecture,
    errors,
    warnings,
    implementationGaps,
    testGaps,
    missingPairs,
    unprovenKeptPairs,
    metrics: {
      selectedVerbCount: selected.length,
      pairCoverage: expectedPairs.size ? (expectedPairs.size - missingPairs.length) / expectedPairs.size : 0,
      combinationCount: architecture.combinations.length,
      contextCount: contextIds.size,
      keptPairCount: [...pairDecisions.values()].filter((decision) => decision === "keep").length,
      unprovenKeptPairCount: unprovenKeptPairs.length,
    },
  };
}

export const LOOPLAB_VERB_ARCHITECTURE_POLICY = Object.freeze({
  version: 2,
  supportedVersions: [1, 2],
  countPolicy: "There is no target verb count. One deep verb is valid; additional verbs must earn their input, attention, onboarding, implementation, and feedback cost through distinct recurring decisions.",
  operators: [...RELATIONSHIP_OPERATORS],
  cadences: [...RELATIONSHIP_CADENCES],
  contexts: [...VERB_CONTEXTS],
  applicationStages: [...APPLICATION_STAGES],
  coreLoopPhases: [...CORE_LOOP_PHASES],
  requiredLoopPhases: ["decide", "act", "feedback"],
  rule: "Start from recurring player decisions, not a requested mechanic count. Give every active verb a purpose, semantic input, observable state change, readable feedback, runtime implementation, and executable proof. Connect only intentional relationships, name their operator and consequence, and exercise recurring relationships before the finale across teaching, practice, pressure, recovery, mastery, or expression applications. Model the repeatable decide-act-feedback loop and any resource source/sink pressure explicitly. A named mechanic, score matrix, or finale checklist is not a gameplay system.",
  designBasis: [
    "Mechanics must be evaluated through the runtime dynamics and player experience they create.",
    "Each interaction loop closes decision, action, simulation, feedback, and player-model updating.",
    "Skills and combinations require repeated, linked applications so they do not burn out or appear only as a final checklist.",
    "Resource mechanics require explicit sources, sinks, state influence, pressure, and recovery rather than prose labels.",
  ],
});
