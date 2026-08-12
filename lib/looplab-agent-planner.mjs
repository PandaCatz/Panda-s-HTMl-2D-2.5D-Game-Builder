import { canonicalSha256 } from "./looplab-canonical-digest.mjs";
import { getLooplabCommandContract } from "./looplab-agent-contracts.mjs";
import { listCommandMacros } from "./looplab-command-macros.mjs";
import { getAgentRecipe, matchAgentRecipes } from "./looplab-agent-playbook.mjs";

export const LOOPLAB_AGENT_PLAN_SCHEMA = "looplab-agent-plan/v2";

const STABLE_ID = /^[a-z0-9][a-z0-9-]*$/;
const QUERY_STOPWORDS = new Set(["and", "the", "for", "with", "from", "into", "without", "game", "games", "improve", "make", "build", "add", "create", "better", "current", "selected"]);
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function boundedString(value, label, maximum) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  const normalized = value.trim();
  if (normalized.length > maximum) throw new Error(`${label} must be at most ${maximum} characters.`);
  if ([...normalized].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error(`${label} cannot contain control characters.`);
  return normalized;
}

function optionalStableId(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = boundedString(value, label, 120);
  if (!STABLE_ID.test(normalized)) throw new Error(`${label} must be a stable lowercase ID.`);
  return normalized;
}

function normalizeParameters(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("parameters must be one JSON object.");
  return clone(value);
}

function normalizeMapIds(project, value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) throw new Error("mapIds must contain at most 8 exact map IDs.");
  const ids = value.map((entry, index) => boundedString(entry, `mapIds[${index}]`, 128));
  if (new Set(ids).size !== ids.length) throw new Error("mapIds must not contain duplicates.");
  const known = new Set((project.maps ?? []).map((map) => map.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`Unknown mapIds: ${unknown.join(", ")}. Inspect get_project_context before planning against exact maps.`);
  return ids;
}

function macroMatchesForIntent(intent, macros) {
  const normalized = intent.toLowerCase();
  const phrases = [
    ["place-supported-prop", ["supported prop", "grounded prop", "floor-standing", "floor standing", "vending machine", "ground anchor", "attach to support", "support contact"]],
    ["connect-maps-round-trip", ["connect maps", "link maps", "round trip", "round-trip", "map connection", "map transition", "forward and return portal", "two-way portal"]],
    ["protect-completion-witness", ["protect completion", "completion replay", "completion witness", "manufacture replay", "record completion", "replay from completion", "completion regression"]],
  ];
  const matches = [];
  for (const [id, terms] of phrases) {
    const term = terms.find((candidate) => normalized.includes(candidate));
    if (term && macros.some((macro) => macro.id === id)) matches.push({ id, reason: `intent:${term}` });
  }
  return matches;
}

function intentRequirements(intent) {
  const normalized = intent.toLowerCase();
  const definitions = [
    { id: "doctor-repair", title: "Repair current Project Doctor findings", terms: ["project doctor", "doctor blocker", "doctor warning", "repair doctor", "fix every current doctor", "fix doctor"] },
    { id: "completion-evidence", title: "Protect deterministic completion evidence", terms: ["protect completion", "completion witness", "completion evidence", "completion regression", "deterministic completion", "record completion"] },
    { id: "map-round-trip", title: "Verify or author explicit map joins", terms: ["connect maps", "link maps", "connected maps", "map joins", "map transition", "round trip", "round-trip", "two-way portal"] },
    { id: "acceptance", title: "Run acceptance evidence", terms: ["run acceptance", "acceptance suite", "acceptance qa", "acceptance evidence", "acceptance"] },
    { id: "replay", title: "Run deterministic replay evidence", terms: ["run replay", "replay suite", "replay qa", "verify replay", "replay evidence", "acceptance, replay", "replay and visual"] },
    { id: "visual-qa", title: "Collect browser visual evidence", terms: ["visual qa", "visual review", "visual verification", "visual evidence", "browser qa"] },
    { id: "offline-release", title: "Verify and export one offline HTML release", terms: ["production release", "one offline html", "offline html", "one-file", "single-file", "release export", "produce and verify", "ship ready"] },
  ];
  return definitions.flatMap((definition) => {
    const term = definition.terms.find((candidate) => normalized.includes(candidate));
    return term ? [{ ...definition, detectedBy: `intent:${term}` }] : [];
  });
}

function mapIntentMode(intent) {
  const normalized = intent.toLowerCase();
  const authoring = ["connect maps", "link maps", "author map joins", "create map joins", "add portals", "create portals"].some((term) => normalized.includes(term));
  const verification = ["verify", "check", "test", "exercise", "connected maps", "round trip", "round-trip"].some((term) => normalized.includes(term));
  return authoring ? "author" : verification ? "verify" : "inspect";
}

function playbookStates(currentDoctor, releaseDoctor) {
  const states = [];
  if (currentDoctor?.replayResults?.passed !== true) states.push("replay-not-passed");
  if (currentDoctor?.runtimeJoinPlan?.passed === false || releaseDoctor?.runtimeJoinPlan?.passed === false) states.push("runtime-join-not-passed");
  if (releaseDoctor?.gate?.blocking === true) states.push("export-not-ready");
  return states;
}

function selectRecipe(intent, explicitRecipeId, context, maxMatches) {
  if (explicitRecipeId) {
    const response = getAgentRecipe(explicitRecipeId);
    return { recipe: response.recipe, reason: "explicit-recipe" };
  }
  const findings = [
    ...(context.currentDoctor?.issues ?? []),
    ...(context.releaseDoctor?.issues ?? []),
  ];
  const matches = matchAgentRecipes({
    query: intent,
    issueCodes: [...new Set(findings.map((finding) => finding?.code).filter(Boolean))],
    states: playbookStates(context.currentDoctor, context.releaseDoctor),
    limit: maxMatches,
  });
  const meaningfulQueryReason = (reason) => reason.startsWith("query:") && !QUERY_STOPWORDS.has(reason.slice(6));
  const queryMatch = matches.matches
    .filter((match) => match.relevance?.reasons?.some(meaningfulQueryReason))
    .sort((left, right) => {
      const leftCount = left.relevance.reasons.filter(meaningfulQueryReason).length;
      const rightCount = right.relevance.reasons.filter(meaningfulQueryReason).length;
      return rightCount - leftCount || right.relevance.score - left.relevance.score || left.id.localeCompare(right.id);
    })[0];
  if (!queryMatch) return null;
  return { recipe: getAgentRecipe(queryMatch.id).recipe, reason: queryMatch.relevance.reasons.find(meaningfulQueryReason) ?? "query-match" };
}

function schemaParameterState(macro, parameters) {
  const schema = macro.parameterSchema ?? {};
  const properties = schema.properties ?? {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const missingInputs = required.filter((key) => !owns(parameters, key)).map((key) => ({
    key,
    required: true,
    schema: clone(properties[key] ?? {}),
    description: properties[key]?.description ?? `Required ${key} parameter.`,
  }));
  const unknown = schema.additionalProperties === false
    ? Object.keys(parameters).filter((key) => !owns(properties, key)).map((key) => ({ key, code: "unknown-parameter", message: `${macro.id} does not accept parameter: ${key}.` }))
    : [];
  return { missingInputs, parameterIssues: unknown };
}

function compactReadiness(readiness, currentDoctor, releaseDoctor) {
  const summarize = (entry, doctor) => ({
    profile: entry?.profile ?? doctor?.profile ?? null,
    score: entry?.score ?? doctor?.score ?? null,
    errorCount: entry?.errorCount ?? doctor?.errorCount ?? 0,
    warningCount: entry?.warningCount ?? doctor?.warningCount ?? 0,
    blocking: entry?.blocking ?? doctor?.gate?.blocking ?? false,
  });
  return {
    current: summarize(readiness?.current, currentDoctor),
    release: summarize(readiness?.release, releaseDoctor),
    interpretation: readiness?.interpretation ?? "The current authoring gate and production release gate remain independent.",
  };
}

function commandContract(op, { compact = false } = {}) {
  const contract = getLooplabCommandContract(op);
  if (!contract) throw new Error(`Agent plan references unknown operation: ${op}.`);
  if (compact) {
    return {
      op: contract.op,
      mutatesProject: contract.mutatesProject,
      requiresSourceDigestInMcp: contract.requiresSourceDigestInMcp,
      contractRef: `looplab://manifest#commandContracts/${contract.op}`,
    };
  }
  return {
    op: contract.op,
    title: contract.title,
    description: contract.description,
    surfaces: clone(contract.surfaces),
    mutatesProject: contract.mutatesProject,
    requiresSourceDigestInMcp: contract.requiresSourceDigestInMcp,
    inputSchema: clone(contract.inputSchema),
  };
}

function macroReference(macro) {
  return {
    id: macro.id,
    title: macro.title,
    safetyClass: macro.safetyClass,
    parameterSchemaRef: `looplab://manifest#commandMacros/${macro.id}`,
  };
}

function recipeReference(recipe) {
  return {
    id: recipe.id,
    revision: recipe.revision,
    title: recipe.title,
    recipeDigest: recipe.recipeDigest,
    recipeRef: `looplab://agent-playbook#${recipe.id}`,
  };
}

function compactStepReference(step) {
  return {
    id: step.id,
    ...(step.phaseId ? { phaseId: step.phaseId } : {}),
    status: step.status,
    operations: clone(step.operations ?? []),
    ...(step.command ? { command: clone(step.command) } : {}),
    ...(step.blockedBy?.length ? { blockedBy: clone(step.blockedBy) } : {}),
    ...(step.issues?.length ? { issues: clone(step.issues) } : {}),
  };
}

function uniqueOperations(steps) {
  return [...new Set(steps.flatMap((step) => step.operations ?? []))];
}

function prefixedSteps(phaseId, steps, options = {}) {
  return steps.map((step) => ({
    ...clone(step),
    id: `${phaseId}-${step.id}`,
    phaseId,
    ...(options.forceStatus ? { status: options.forceStatus } : {}),
    ...(options.blockedBy?.length ? { blockedBy: [...new Set([...(step.blockedBy ?? []), ...options.blockedBy])] } : {}),
  }));
}

function phaseRecord({ id, title, status, dependsOn = [], steps, mutatesProject = false, sourcePolicy, retryClass, completionEvidence = [] }) {
  return {
    phase: {
      id,
      title,
      status,
      dependsOn: clone(dependsOn),
      stepIds: steps.map((step) => step.id),
      operations: uniqueOperations(steps),
      mutatesProject,
      sourcePolicy,
      retryClass,
      completionEvidence: clone(completionEvidence),
    },
    steps,
  };
}

function doctorFindingCount(context) {
  const entries = [context.readiness?.current, context.readiness?.release];
  return entries.reduce((total, entry) => total + Number(entry?.errorCount ?? 0) + Number(entry?.warningCount ?? 0), 0);
}

function addCoverage(coverage, requirement, status, phaseIds, evidence) {
  coverage.push({
    id: requirement.id,
    title: requirement.title,
    detectedBy: requirement.detectedBy,
    status,
    phaseIds: clone(phaseIds),
    evidence,
  });
}

function macroSteps(intent, macro, parameters, parameterState, preview, previewError) {
  const missing = parameterState.missingInputs.map((entry) => entry.key);
  const issueMessages = parameterState.parameterIssues.map((entry) => entry.message);
  if (previewError) issueMessages.push(previewError);
  const exactPreviewCommand = preview ? { op: "preview_command_macro", macroId: macro.id, parameters: clone(preview.parameters ?? parameters), compact: true } : null;
  const ready = Boolean(preview?.applicable && preview?.expansionDigest && preview?.sourceDigest);
  return [
    {
      id: "inspect-source-and-parameters",
      status: missing.length || issueMessages.length ? "needs-input" : "ready",
      operations: ["get_agent_brief", "get_project_context", "list_command_macros"],
      instruction: `Confirm the exact source and supply only parameters accepted by ${macro.id}.`,
      ...(missing.length ? { blockedBy: missing.map((key) => `missing:${key}`) } : {}),
      ...(issueMessages.length ? { issues: issueMessages } : {}),
    },
    {
      id: "preview-proven-macro",
      status: preview ? (preview.applicable ? "review-required" : "blocked") : "blocked",
      operations: ["preview_command_macro"],
      instruction: "Run the real macro expansion against a clone and inspect its exact Doctor delta before authoring.",
      ...(exactPreviewCommand ? { command: exactPreviewCommand } : {}),
      ...(!preview ? { blockedBy: [...missing.map((key) => `missing:${key}`), ...issueMessages] } : {}),
    },
    {
      id: "apply-exact-reviewed-plan",
      status: ready ? "review-required" : "blocked",
      operations: ["apply_command_macro"],
      instruction: "Apply only this reviewed source-bound expansion; any source or expansion digest change requires a new preview.",
      ...(ready ? {
        command: {
          op: "apply_command_macro",
          macroId: macro.id,
          parameters: clone(preview.parameters),
          expectedSourceDigest: preview.sourceDigest,
          expectedExpansionDigest: preview.expansionDigest,
          compact: true,
        },
      } : { blockedBy: [...missing.map((key) => `missing:${key}`), ...issueMessages, ...(preview && !preview.applicable ? ["doctor-blocked"] : [])] }),
    },
    {
      id: "verify-current-source",
      status: "blocked",
      operations: ["get_doctor", "run_acceptance_suite", "run_replay_suite", "capture_visual_review"],
      instruction: `After an approved apply, verify behavior and visuals for the intent: ${intent}`,
      blockedBy: ["mutation-not-executed"],
    },
  ];
}

function recipeSteps(recipe) {
  return recipe.steps.map((step) => ({
    id: step.id,
    status: "guidance-only",
    operations: clone(step.commands),
    instruction: step.instruction,
  }));
}

function genericSteps(intent, mapIds) {
  return [
    { id: "read-source-bound-brief", status: "ready", operations: ["get_agent_brief"], instruction: "Read the bounded project brief and retain its exact source digest.", command: { op: "get_agent_brief" } },
    { id: "load-exact-context", status: "ready", operations: ["get_project_context"], instruction: mapIds.length ? "Load only the selected map documents before drafting edits." : "Load the campaign index, then request exact maps only when the intended scope requires them.", command: { op: "get_project_context", view: mapIds.length ? "map" : "campaign", ...(mapIds.length ? { mapIds } : {}) } },
    { id: "route-specialist-work", status: "ready", operations: ["route_work"], instruction: "Route the intent to the relevant 2D game specialists without treating the route as mutation authority.", command: { op: "route_work", track: "game-creation", prompt: intent } },
    { id: "draft-and-preview-canonical-edits", status: "needs-agent-draft", operations: ["preview_batch"], instruction: "Draft the smallest coherent canonical command batch with stable IDs and explicit authored collision, support, projection, and map scope, then clone-preview it against the current source digest." },
    { id: "review-and-apply-exact-preview", status: "blocked", operations: ["apply_previewed_batch"], instruction: "Apply only the unchanged source-bound preview receipt; a source, command, summary, or preview-digest change requires a new preview.", blockedBy: ["canonical-command-batch-not-supplied", "preview-receipt-not-reviewed"] },
    { id: "verify-behavior-and-visuals", status: "blocked", operations: ["get_doctor", "run_acceptance_suite", "run_replay_suite", "get_runtime_join_plan", "capture_visual_review"], instruction: "Verify the changed source through deterministic and visual evidence; reject regressions instead of weakening gates.", blockedBy: ["mutation-not-executed"] },
  ];
}

function buildCompositeWorkflow(project, intent, requirements, mapIds, registry, context) {
  const phases = [];
  const steps = [];
  const coverage = [];
  const components = [];
  const recipes = [];
  const macros = [];
  const macroPreviews = [];
  const missingInputs = [];
  const parameterIssues = [];
  const mutationPhaseIds = [];

  const appendPhase = (record) => {
    phases.push(record.phase);
    steps.push(...record.steps);
    if (record.phase.mutatesProject) mutationPhaseIds.push(record.phase.id);
    return record.phase.id;
  };
  const requirement = (id) => requirements.find((entry) => entry.id === id);
  const inspectionSteps = prefixedSteps("inspect-current-source", [
    { id: "read-brief", status: "ready", operations: ["get_agent_brief"], instruction: "Read the bounded project brief and retain the exact current and production readiness summaries.", command: { op: "get_agent_brief" } },
    { id: "read-doctor", status: "ready", operations: ["get_doctor"], instruction: "Read Project Doctor on the current source before deciding which requested work is already satisfied.", command: { op: "get_doctor" } },
    { id: "load-context", status: "ready", operations: ["get_project_context"], instruction: mapIds.length ? "Load the exact requested map documents without treating context as mutation input." : "Load the bounded campaign index and request exact map documents only when authoring needs them.", command: { op: "get_project_context", view: mapIds.length ? "map" : "campaign", ...(mapIds.length ? { mapIds } : {}) } },
  ]);
  appendPhase(phaseRecord({
    id: "inspect-current-source",
    title: "Inspect current source truth",
    status: "ready",
    steps: inspectionSteps,
    sourcePolicy: "Bind all decisions to this sourceDigest; context is orientation, not mutation authority.",
    retryClass: "read-only-retryable",
    completionEvidence: ["current sourceDigest", "current and production Doctor summaries", "bounded project context"],
  }));

  let dependency = "inspect-current-source";
  const doctorRequirement = requirement("doctor-repair");
  if (doctorRequirement) {
    if (doctorFindingCount(context) === 0) {
      addCoverage(coverage, doctorRequirement, "satisfied", ["inspect-current-source"], "Both current and production readiness summaries report no blocker or warning to repair.");
    } else {
      const recipe = getAgentRecipe("repair-doctor-mechanics").recipe;
      recipes.push(recipe);
      components.push({ kind: "playbook-recipe", id: recipe.id, title: recipe.title, reason: doctorRequirement.detectedBy, recipeDigest: recipe.recipeDigest, phaseIds: ["repair-doctor-findings"] });
      const phaseSteps = prefixedSteps("repair-doctor-findings", recipeSteps(recipe));
      dependency = appendPhase(phaseRecord({
        id: "repair-doctor-findings",
        title: "Repair Doctor findings without inventing design truth",
        status: "needs-agent-draft",
        dependsOn: [dependency],
        steps: phaseSteps,
        mutatesProject: true,
        sourcePolicy: "Preview deterministic repairs first; judgment residue requires a bounded agent design pass. Redraft every later exact command after apply changes the sourceDigest.",
        retryClass: "mutation-retry-only-when-confirmed-unapplied",
        completionEvidence: ["source-bound repair receipt", "post-apply Doctor result", "explicit judgment residue"],
      }));
      addCoverage(coverage, doctorRequirement, "planned", [dependency], "The deterministic repair recipe plus explicit judgment residue covers current Doctor findings.");
    }
  }

  const completionRequirement = requirement("completion-evidence");
  if (completionRequirement) {
    if (context.currentDoctor?.replayResults?.passed === true) {
      addCoverage(coverage, completionRequirement, "satisfied", ["inspect-current-source"], "Current Project Doctor reports passing replay evidence for this source.");
    } else {
      const macro = registry.macros.find((entry) => entry.id === "protect-completion-witness");
      if (!macro) throw new Error("The composite planner requires the protect-completion-witness proven macro.");
      const parameterState = schemaParameterState(macro, {});
      let preview = null;
      let previewError = null;
      const upstreamMutation = mutationPhaseIds.length > 0;
      if (!upstreamMutation && typeof context.previewMacro === "function") {
        try {
          preview = clone(context.previewMacro({ op: "preview_command_macro", macroId: macro.id, parameters: {}, compact: true }));
        } catch (error) {
          previewError = error instanceof Error ? error.message : String(error);
          parameterIssues.push({ code: "macro-preview-rejected", message: previewError });
        }
      }
      macros.push(macro);
      if (preview) macroPreviews.push(preview);
      components.push({ kind: "command-macro", id: macro.id, title: macro.title, reason: completionRequirement.detectedBy, safetyClass: macro.safetyClass, phaseIds: ["protect-completion-evidence"] });
      const upstreamBlock = upstreamMutation ? [`redraft-after:${mutationPhaseIds.at(-1)}`] : [];
      const baseSteps = macroSteps(intent, macro, {}, parameterState, preview, previewError);
      const phaseSteps = prefixedSteps("protect-completion-evidence", baseSteps, upstreamBlock.length ? { forceStatus: "blocked", blockedBy: upstreamBlock } : {});
      dependency = appendPhase(phaseRecord({
        id: "protect-completion-evidence",
        title: "Protect deterministic completion evidence",
        status: upstreamMutation ? "blocked" : preview?.applicable ? "review-required" : "needs-input",
        dependsOn: [dependency],
        steps: phaseSteps,
        mutatesProject: true,
        sourcePolicy: upstreamMutation ? "Redraft this phase after the prior mutation so its macro preview binds the new sourceDigest." : "Apply only the exact reviewed expansion digest, then redraft downstream work against the new sourceDigest.",
        retryClass: "mutation-retry-only-when-confirmed-unapplied",
        completionEvidence: ["source-derived completion replay case", "passing replay suite on the resulting source"],
      }));
      addCoverage(coverage, completionRequirement, upstreamMutation ? "redraft-required" : "planned", [dependency], upstreamMutation ? "A prior authored mutation invalidates any completion macro preview calculated now." : "The proven completion-witness macro supplies source-derived replay evidence without copying a stale tape.");
    }
  }

  const mapRequirement = requirement("map-round-trip");
  const joinPassed = context.currentDoctor?.runtimeJoinPlan?.passed === true && context.releaseDoctor?.runtimeJoinPlan?.passed !== false;
  if (mapRequirement && !joinPassed && mapIntentMode(intent) === "author") {
    const macro = registry.macros.find((entry) => entry.id === "connect-maps-round-trip");
    if (!macro) throw new Error("The composite planner requires the connect-maps-round-trip proven macro.");
    const parameterState = schemaParameterState(macro, {});
    const namespacedMissing = parameterState.missingInputs.map((entry) => ({ ...entry, parameterKey: entry.key, key: `${macro.id}.${entry.key}` }));
    missingInputs.push(...namespacedMissing);
    macros.push(macro);
    components.push({ kind: "command-macro", id: macro.id, title: macro.title, reason: mapRequirement.detectedBy, safetyClass: macro.safetyClass, phaseIds: ["author-map-round-trip"] });
    const phaseSteps = prefixedSteps("author-map-round-trip", macroSteps(intent, macro, {}, parameterState, null, null), {
      forceStatus: "blocked",
      blockedBy: [...namespacedMissing.map((entry) => `missing:${entry.key}`), ...(mutationPhaseIds.length ? [`redraft-after:${mutationPhaseIds.at(-1)}`] : [])],
    });
    dependency = appendPhase(phaseRecord({
      id: "author-map-round-trip",
      title: "Author explicit forward and return joins",
      status: "needs-input",
      dependsOn: [dependency],
      steps: phaseSteps,
      mutatesProject: true,
      sourcePolicy: "Collect exact map, portal, and spawn IDs after prior mutations, then draft a fresh source-bound macro preview.",
      retryClass: "mutation-retry-only-when-confirmed-unapplied",
      completionEvidence: ["exact forward and return portal IDs", "passing runtime join plan"],
    }));
    addCoverage(coverage, mapRequirement, "needs-input", [dependency], "The project does not currently prove round-trip joins and the intent explicitly requests authoring them.");
  }

  const verificationRequirements = requirements.filter((entry) => ["completion-evidence", "map-round-trip", "acceptance", "replay", "visual-qa", "offline-release"].includes(entry.id));
  if (verificationRequirements.length) {
    const operations = ["get_doctor"];
    if (mapRequirement || requirement("offline-release")) operations.push("get_runtime_join_plan");
    if (requirement("acceptance") || requirement("offline-release")) operations.push("run_acceptance_suite");
    if (completionRequirement || requirement("offline-release")) operations.push("get_completion_report");
    if (requirement("replay") || completionRequirement || requirement("offline-release")) operations.push("run_replay_suite");
    if (requirement("visual-qa") || requirement("offline-release")) operations.push("capture_visual_review", "collect_verification_evidence");
    const blockedBy = mutationPhaseIds.length ? [`redraft-after:${mutationPhaseIds.at(-1)}`] : [];
    const verificationSteps = prefixedSteps("verify-requested-evidence", [{
      id: "run-current-source-gates",
      status: blockedBy.length ? "blocked" : "ready",
      operations: [...new Set(operations)],
      instruction: "Run every requested deterministic and browser-visible gate on one current source digest; retain exact receipts and do not weaken a failing gate.",
      ...(blockedBy.length ? { blockedBy } : {}),
    }]);
    dependency = appendPhase(phaseRecord({
      id: "verify-requested-evidence",
      title: "Verify all requested behavior and visual evidence",
      status: blockedBy.length ? "blocked" : "ready",
      dependsOn: [dependency],
      steps: verificationSteps,
      sourcePolicy: blockedBy.length ? "Redraft after the last authored mutation, then run all gates against the resulting sourceDigest." : "All evidence must report this plan's current sourceDigest.",
      retryClass: "read-only-retryable; durable jobs resume by existing job ID",
      completionEvidence: ["Doctor", "acceptance", "completion", "replay", "runtime joins", "browser visual evidence"],
    }));
    for (const entry of verificationRequirements) {
      if (coverage.some((item) => item.id === entry.id)) {
        const existing = coverage.find((item) => item.id === entry.id);
        if (!existing.phaseIds.includes(dependency)) existing.phaseIds.push(dependency);
        continue;
      }
      const satisfied = entry.id === "map-round-trip" && joinPassed;
      addCoverage(coverage, entry, satisfied ? "satisfied" : "planned", [dependency], satisfied ? "The current runtime join plan passes; this phase re-verifies it with the requested evidence." : "The verification phase explicitly runs the requested gate on the current source.");
    }
  }

  const releaseRequirement = requirement("offline-release");
  if (releaseRequirement) {
    const recipe = getAgentRecipe("release-one-file-html").recipe;
    recipes.push(recipe);
    const releaseStepIds = new Set(["verify-exact-artifact", "verify-candidate", "prepare-and-export"]);
    const releaseSteps = prefixedSteps("verify-and-export-release", recipeSteps(recipe).filter((step) => releaseStepIds.has(step.id)), {
      forceStatus: "blocked",
      blockedBy: ["requested-evidence-not-current-and-passing"],
    });
    components.push({ kind: "playbook-recipe", id: recipe.id, title: recipe.title, reason: releaseRequirement.detectedBy, recipeDigest: recipe.recipeDigest, phaseIds: ["verify-requested-evidence", "verify-and-export-release"] });
    const releasePhaseId = appendPhase(phaseRecord({
      id: "verify-and-export-release",
      title: "Verify the exact artifact and export one offline HTML file",
      status: "blocked",
      dependsOn: [dependency],
      steps: releaseSteps,
      mutatesProject: true,
      sourcePolicy: "Use one durable release-verification job and the exact resulting source/artifact attestation; any source change requires a new verification job.",
      retryClass: "resume-existing-job; never duplicate an applied promotion or export receipt",
      completionEvidence: ["release verification job ID", "source-bound artifact SHA-256", "one-file export receipt"],
    }));
    const existing = coverage.find((entry) => entry.id === releaseRequirement.id);
    if (existing) {
      existing.status = "planned";
      if (!existing.phaseIds.includes(releasePhaseId)) existing.phaseIds.push(releasePhaseId);
      existing.evidence = "The release recipe verifies the exact artifact before promotion and one-file export.";
    }
  }

  return { phases, steps, coverage, components, recipes, macros, macroPreviews, missingInputs, parameterIssues };
}

export function buildAgentPlan(project, command = {}, context = {}) {
  if (!project || typeof project !== "object" || Array.isArray(project)) throw new Error("buildAgentPlan requires one valid LoopLab project.");
  const intent = boundedString(command.intent, "intent", 600);
  const macroId = optionalStableId(command.macroId, "macroId");
  const recipeId = optionalStableId(command.recipeId, "recipeId");
  if (macroId && recipeId) throw new Error("Choose either macroId or recipeId, not both.");
  const mapIds = normalizeMapIds(project, command.mapIds);
  const parameters = normalizeParameters(command.parameters);
  const maxMatches = Number(command.maxMatches ?? 3);
  if (!Number.isInteger(maxMatches) || maxMatches < 1 || maxMatches > 5) throw new Error("maxMatches must be an integer between 1 and 5.");
  const sourceDigest = boundedString(context.sourceDigest, "sourceDigest", 160);
  const protocolVersion = boundedString(context.protocolVersion, "protocolVersion", 32);
  const registry = listCommandMacros();
  const explicitMacro = macroId ? registry.macros.find((macro) => macro.id === macroId) : null;
  if (macroId && !explicitMacro) throw new Error(`Unknown command macro: ${macroId}. Run list_command_macros to inspect the available registry.`);
  const requirements = intentRequirements(intent);
  const compositeRequested = !macroId && !recipeId && requirements.length > 1;
  const inferredMacros = macroId || compositeRequested ? [] : macroMatchesForIntent(intent, registry.macros);
  const inferredMacro = inferredMacros[0] ?? null;
  const macro = explicitMacro ?? (inferredMacro ? registry.macros.find((candidate) => candidate.id === inferredMacro.id) : null);
  if ((!macro || compositeRequested) && Object.keys(parameters).length) throw new Error("parameters are accepted only when one explicit or unambiguous proven macro is selected.");

  let strategy;
  let steps;
  let phases;
  let coverage;
  let components = [];
  let macroPreview = null;
  let macroPreviews = [];
  let missingInputs = [];
  let parameterIssues = [];
  let recipe = null;
  let recipes = [];
  let macros = [];

  if (compositeRequested) {
    const composite = buildCompositeWorkflow(project, intent, requirements, mapIds, registry, context);
    steps = composite.steps;
    phases = composite.phases;
    coverage = composite.coverage;
    components = composite.components;
    recipes = composite.recipes;
    macros = composite.macros;
    macroPreviews = composite.macroPreviews;
    missingInputs = composite.missingInputs;
    parameterIssues = composite.parameterIssues;
    strategy = {
      kind: "composite-workflow",
      id: "covered-intent-workflow",
      title: "Covered multi-stage agent workflow",
      reason: "multiple-independent-intent-requirements",
      componentIds: components.map((component) => component.id),
    };
  } else if (macro) {
    const parameterState = schemaParameterState(macro, parameters);
    missingInputs = parameterState.missingInputs;
    parameterIssues = parameterState.parameterIssues;
    let previewError = null;
    if (!missingInputs.length && !parameterIssues.length && typeof context.previewMacro === "function") {
      try {
        macroPreview = clone(context.previewMacro({ op: "preview_command_macro", macroId: macro.id, parameters, compact: true }));
      } catch (error) {
        previewError = error instanceof Error ? error.message : String(error);
        parameterIssues.push({ code: "macro-preview-rejected", message: previewError });
      }
    }
    strategy = { kind: "command-macro", id: macro.id, title: macro.title, reason: macroId ? "explicit-macro" : inferredMacro.reason, safetyClass: macro.safetyClass };
    steps = macroSteps(intent, macro, parameters, parameterState, macroPreview, previewError);
    const phaseStatus = missingInputs.length || parameterIssues.length ? "needs-input" : macroPreview?.applicable ? "review-required" : "blocked";
    phases = [phaseRecord({
      id: `macro-${macro.id}`,
      title: macro.title,
      status: phaseStatus,
      steps,
      mutatesProject: true,
      sourcePolicy: "Apply only the exact reviewed source and expansion digests; redraft after any source change.",
      retryClass: "mutation-retry-only-when-confirmed-unapplied",
      completionEvidence: ["macro preview receipt", "post-apply Doctor and requested verification evidence"],
    }).phase];
    coverage = [{
      id: `macro-${macro.id}`,
      title: macro.title,
      detectedBy: macroId ? "explicit-macro" : inferredMacro.reason,
      status: missingInputs.length ? "needs-input" : macroPreview?.applicable ? "planned" : "blocked",
      phaseIds: phases.map((phase) => phase.id),
      evidence: "The selected proven macro owns this bounded intent; no unrelated requirement was detected.",
    }];
    components = [{ kind: "command-macro", id: macro.id, title: macro.title, reason: strategy.reason, safetyClass: macro.safetyClass, phaseIds: phases.map((phase) => phase.id) }];
    macros = [macro];
    if (macroPreview) macroPreviews = [macroPreview];
  } else {
    const selectedRecipe = selectRecipe(intent, recipeId, context, maxMatches);
    if (selectedRecipe) {
      recipe = clone(selectedRecipe.recipe);
      strategy = { kind: "playbook-recipe", id: recipe.id, title: recipe.title, reason: selectedRecipe.reason, recipeDigest: recipe.recipeDigest };
      steps = recipeSteps(recipe);
      phases = [phaseRecord({
        id: `recipe-${recipe.id}`,
        title: recipe.title,
        status: "guidance-only",
        steps,
        sourcePolicy: "Resolve each recipe step against current state; preview mutations and retain exact evidence receipts.",
        retryClass: "operation-specific; never retry an applied mutation blindly",
        completionEvidence: recipe.evidence,
      }).phase];
      const matchedRequirement = requirements[0];
      coverage = [{
        id: matchedRequirement?.id ?? `recipe-${recipe.id}`,
        title: matchedRequirement?.title ?? recipe.title,
        detectedBy: matchedRequirement?.detectedBy ?? selectedRecipe.reason,
        status: "planned",
        phaseIds: phases.map((phase) => phase.id),
        evidence: "The exact versioned playbook recipe covers the bounded intent.",
      }];
      components = [{ kind: "playbook-recipe", id: recipe.id, title: recipe.title, reason: strategy.reason, recipeDigest: recipe.recipeDigest, phaseIds: phases.map((phase) => phase.id) }];
      recipes = [recipe];
    } else {
      strategy = { kind: "guarded-workflow", id: "canonical-edit-workflow", title: "Canonical source-bound edit workflow", reason: "no-proven-macro-or-query-matched-recipe" };
      steps = genericSteps(intent, mapIds);
      phases = [phaseRecord({
        id: "canonical-edit-workflow",
        title: "Canonical source-bound edit workflow",
        status: "needs-agent-draft",
        steps,
        mutatesProject: true,
        sourcePolicy: "Preview the coherent canonical batch, apply its exact receipt once, then redraft verification against the new sourceDigest.",
        retryClass: "mutation-retry-only-when-confirmed-unapplied",
        completionEvidence: ["preview receipt", "applied receipt", "post-mutation deterministic and visual evidence"],
      }).phase];
      coverage = [{
        id: "bounded-canonical-intent",
        title: "Execute the bounded intent through canonical commands",
        detectedBy: "fallback:guarded-workflow",
        status: "needs-agent-draft",
        phaseIds: phases.map((phase) => phase.id),
        evidence: "The agent must draft the smallest coherent canonical batch; the UI does not limit available commands.",
      }];
      components = [{ kind: "guarded-workflow", id: strategy.id, title: strategy.title, reason: strategy.reason, phaseIds: phases.map((phase) => phase.id) }];
    }
  }

  const operations = uniqueOperations(steps);
  const compact = command.compact === true;
  const retryPolicy = {
    reads: "retryable",
    previews: "retryable only while their source binding remains current",
    mutations: "retry only with explicit evidence that the original attempt was not applied",
    appliedReceipts: "never auto-retry",
    durableJobs: "resume the existing job ID instead of resubmitting",
  };
  const planDefinitionDigest = canonicalSha256({
    schemaVersion: LOOPLAB_AGENT_PLAN_SCHEMA,
    strategy,
    phases: phases.map((phase) => ({ id: phase.id, dependsOn: phase.dependsOn, operations: phase.operations, mutatesProject: phase.mutatesProject, sourcePolicy: phase.sourcePolicy, retryClass: phase.retryClass })),
    coverage: coverage.map((entry) => ({ id: entry.id, phaseIds: entry.phaseIds })),
    retryPolicy,
  });
  const plan = {
    schemaVersion: LOOPLAB_AGENT_PLAN_SCHEMA,
    protocolVersion,
    sourceDigest,
    intent,
    mapIds,
    strategy,
    components,
    readiness: compactReadiness(context.readiness, context.currentDoctor, context.releaseDoctor),
    coverage,
    phases,
    stepDetailMode: compact ? "phase-and-resource-references" : "inline-instructions",
    steps: compact ? steps.map(compactStepReference) : steps,
    missingInputs,
    parameterIssues,
    ...(macro ? compact ? { macroRef: macroReference(macro) } : { macro: clone(macro) } : {}),
    ...(macroPreview ? { macroPreview } : {}),
    ...(recipe ? compact ? { recipeRef: recipeReference(recipe) } : { recipe } : {}),
    ...(macros.length ? { macros: compact ? macros.map(macroReference) : clone(macros) } : {}),
    ...(macroPreviews.length ? { macroPreviews: clone(macroPreviews) } : {}),
    ...(recipes.length ? { recipes: compact ? recipes.map(recipeReference) : clone(recipes) } : {}),
    operationContractMode: compact ? "manifest-references" : "inline-full",
    operationContracts: operations.map((op) => commandContract(op, { compact })),
    retryPolicy,
    resume: {
      mode: "first-incomplete-phase",
      startPhaseId: phases.find((phase) => phase.status !== "satisfied")?.id ?? null,
      preserveCompletedEvidence: true,
      planDefinitionDigest,
      validWhile: ["planDefinitionDigest matches", "source lineage matches the last completed mutation receipt", "completed evidence remains current"],
      redraftTriggers: ["sourceDigest changed outside an acknowledged completed mutation", "plan definition changed", "a phase reports stale source", "a gate changes the required work"],
    },
    authority: {
      nonExecuting: true,
      providerUsed: false,
      persistsProject: false,
      grantsMutationAuthority: false,
      reviewRequiredBeforeMutation: true,
      authoritativeRepresentation: "coverage-and-phases",
      primaryConsumer: "Codex, Claude, CLI, MCP, and browser-bridge agents",
      uiRole: "secondary inspection and precise-tweak surface; never a capability ceiling",
      mutationBoundary: "A later canonical command remains subject to current source/ledger/expansion digests, Project Doctor, replay, browser, provider, and export gates.",
    },
  };
  return { ...plan, planDigest: canonicalSha256(plan) };
}
