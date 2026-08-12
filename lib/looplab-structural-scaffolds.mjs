import { canonicalSha256 } from "./looplab-canonical-digest.mjs";
import { inspectGameplayProgram, normalizeGameplayProgram } from "./looplab-gameplay-rules.mjs";

export const LOOPLAB_STRUCTURAL_SCAFFOLD_CONTRACT_SCHEMA = "looplab-structural-scaffold-contract/v1";
export const LOOPLAB_STRUCTURAL_SCAFFOLD_REPORT_SCHEMA = "looplab-structural-scaffold-report/v1";
export const LOOPLAB_STRUCTURAL_SCAFFOLD_SEARCH_SCHEMA = "looplab-structural-scaffold-search/v1";
export const LOOPLAB_STRUCTURAL_SCAFFOLD_MATERIALIZATION_SCHEMA = "looplab-structural-scaffold-materialization/v1";
export const LOOPLAB_STRUCTURAL_SCAFFOLD_FAMILIES = Object.freeze(["quest-network", "economy-loop", "encounter-progression"]);
export const LOOPLAB_STRUCTURAL_SCAFFOLD_LIMITS = Object.freeze({
  maximumCandidates: 9,
  defaultCandidates: 6,
  maximumChoicesPerPage: 4,
  maximumDecisionDepth: 8,
  maximumContentSlots: 40,
  maximumSlotCharacters: 240,
});

const CONTRACT_KEYS = new Set(["schemaVersion", "status", "intent", "families", "constraints", "search"]);
const CONSTRAINT_KEYS = new Set(["minimumDecisionDepth", "maximumDecisionDepth", "minimumBranchPages", "maximumBranchPages", "cyclePolicy", "maximumChoicesPerPage", "replacementPolicy"]);
const SEARCH_KEYS = new Set(["maxCandidates"]);
const STATUS = new Set(["draft", "approved"]);
const CYCLE_POLICIES = new Set(["allow", "forbid", "required"]);
const REPLACEMENT_POLICIES = new Set(["empty-only", "replace-explicit"]);
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const marker = (id) => `[[slot:${id}]]`;

function strictInteger(value, fallback) {
  return Number.isInteger(value) ? value : fallback;
}

export function normalizeStructuralScaffoldContract(input = {}) {
  const families = Array.isArray(input.families)
    ? [...new Set(input.families.filter((family) => LOOPLAB_STRUCTURAL_SCAFFOLD_FAMILIES.includes(family)))]
    : [];
  return {
    schemaVersion: LOOPLAB_STRUCTURAL_SCAFFOLD_CONTRACT_SCHEMA,
    status: STATUS.has(input.status) ? input.status : "draft",
    intent: typeof input.intent === "string" ? input.intent.trim() : "",
    families,
    constraints: {
      minimumDecisionDepth: strictInteger(input.constraints?.minimumDecisionDepth, 2),
      maximumDecisionDepth: strictInteger(input.constraints?.maximumDecisionDepth, 6),
      minimumBranchPages: strictInteger(input.constraints?.minimumBranchPages, 0),
      maximumBranchPages: strictInteger(input.constraints?.maximumBranchPages, 4),
      cyclePolicy: CYCLE_POLICIES.has(input.constraints?.cyclePolicy) ? input.constraints.cyclePolicy : "allow",
      maximumChoicesPerPage: strictInteger(input.constraints?.maximumChoicesPerPage, 4),
      replacementPolicy: REPLACEMENT_POLICIES.has(input.constraints?.replacementPolicy) ? input.constraints.replacementPolicy : "empty-only",
    },
    search: {
      maxCandidates: strictInteger(input.search?.maxCandidates, LOOPLAB_STRUCTURAL_SCAFFOLD_LIMITS.defaultCandidates),
    },
  };
}

function unknownFields(value, allowed, prefix, issues) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push({ severity: "error", code: "scaffold-unknown-field", message: `${prefix} contains unsupported field: ${key}.` });
}

export function inspectStructuralScaffoldContract(project, input = project?.structuralScaffoldContract, options = {}) {
  if (input == null) {
    return {
      schemaVersion: LOOPLAB_STRUCTURAL_SCAFFOLD_REPORT_SCHEMA,
      present: false,
      status: "not-configured",
      sourceDigest: options.sourceDigest ?? null,
      contract: null,
      contractDigest: null,
      issues: [],
      errors: [],
      warnings: [],
      limitations: ["No structural search runs until an agent or reviewer authors or accepts a bounded scaffold contract."],
    };
  }
  const issues = [];
  const add = (severity, code, message, context = {}) => issues.push({ severity, code, message, ...context });
  if (!input || typeof input !== "object" || Array.isArray(input)) add("error", "scaffold-contract-object", "structuralScaffoldContract must be one object.");
  unknownFields(input, CONTRACT_KEYS, "structuralScaffoldContract", issues);
  unknownFields(input?.constraints, CONSTRAINT_KEYS, "structuralScaffoldContract.constraints", issues);
  unknownFields(input?.search, SEARCH_KEYS, "structuralScaffoldContract.search", issues);
  const contract = normalizeStructuralScaffoldContract(input);
  if (input?.schemaVersion !== LOOPLAB_STRUCTURAL_SCAFFOLD_CONTRACT_SCHEMA) add("error", "scaffold-schema-version", `structuralScaffoldContract.schemaVersion must be ${LOOPLAB_STRUCTURAL_SCAFFOLD_CONTRACT_SCHEMA}.`);
  if (!STATUS.has(input?.status)) add("error", "scaffold-status", "structuralScaffoldContract.status must be draft or approved.");
  if (!contract.intent || contract.intent.length > 600) add("error", "scaffold-intent", "structuralScaffoldContract.intent must contain 1 through 600 characters.");
  if (!Array.isArray(input?.families) || !input.families.length || input.families.length > LOOPLAB_STRUCTURAL_SCAFFOLD_FAMILIES.length) add("error", "scaffold-families", "structuralScaffoldContract.families must contain one through three supported families.");
  if (Array.isArray(input?.families)) {
    const seen = new Set();
    for (const family of input.families) {
      if (!LOOPLAB_STRUCTURAL_SCAFFOLD_FAMILIES.includes(family)) add("error", "scaffold-family", `Unsupported structural scaffold family: ${String(family)}.`, { family });
      else if (seen.has(family)) add("error", "scaffold-family-duplicate", `Structural scaffold family is duplicated: ${family}.`, { family });
      seen.add(family);
    }
  }
  if (!input?.constraints || typeof input.constraints !== "object" || Array.isArray(input.constraints)) add("error", "scaffold-constraints-object", "structuralScaffoldContract.constraints must be one object.");
  const bounds = [
    ["minimumDecisionDepth", 1, LOOPLAB_STRUCTURAL_SCAFFOLD_LIMITS.maximumDecisionDepth],
    ["maximumDecisionDepth", 1, LOOPLAB_STRUCTURAL_SCAFFOLD_LIMITS.maximumDecisionDepth],
    ["minimumBranchPages", 0, 6],
    ["maximumBranchPages", 0, 6],
    ["maximumChoicesPerPage", 1, LOOPLAB_STRUCTURAL_SCAFFOLD_LIMITS.maximumChoicesPerPage],
  ];
  for (const [field, minimum, maximum] of bounds) {
    const value = input?.constraints?.[field];
    if (!Number.isInteger(value) || value < minimum || value > maximum) add("error", "scaffold-constraint-bounds", `structuralScaffoldContract.constraints.${field} must be an integer from ${minimum} through ${maximum}.`, { field });
  }
  if (contract.constraints.minimumDecisionDepth > contract.constraints.maximumDecisionDepth) add("error", "scaffold-depth-order", "minimumDecisionDepth cannot exceed maximumDecisionDepth.");
  if (contract.constraints.minimumBranchPages > contract.constraints.maximumBranchPages) add("error", "scaffold-branch-order", "minimumBranchPages cannot exceed maximumBranchPages.");
  if (!CYCLE_POLICIES.has(input?.constraints?.cyclePolicy)) add("error", "scaffold-cycle-policy", "cyclePolicy must be allow, forbid, or required.");
  if (!REPLACEMENT_POLICIES.has(input?.constraints?.replacementPolicy)) add("error", "scaffold-replacement-policy", "replacementPolicy must be empty-only or replace-explicit.");
  if (!input?.search || typeof input.search !== "object" || Array.isArray(input.search)) add("error", "scaffold-search-object", "structuralScaffoldContract.search must be one object.");
  if (!Number.isInteger(input?.search?.maxCandidates) || input.search.maxCandidates < 2 || input.search.maxCandidates > LOOPLAB_STRUCTURAL_SCAFFOLD_LIMITS.maximumCandidates) add("error", "scaffold-candidate-budget", `structuralScaffoldContract.search.maxCandidates must be an integer from 2 through ${LOOPLAB_STRUCTURAL_SCAFFOLD_LIMITS.maximumCandidates}.`);
  const report = {
    schemaVersion: LOOPLAB_STRUCTURAL_SCAFFOLD_REPORT_SCHEMA,
    present: true,
    status: issues.some((issue) => issue.severity === "error") ? "invalid" : contract.status,
    sourceDigest: options.sourceDigest ?? null,
    contract,
    contractDigest: canonicalSha256(contract),
    metrics: { familyCount: contract.families.length, maxCandidates: contract.search.maxCandidates },
    existingGameplayProgramProtected: Boolean(project?.gameplayProgram) && contract.constraints.replacementPolicy === "empty-only",
    issues,
    errors: issues.filter((issue) => issue.severity === "error").map((issue) => issue.message),
    warnings: issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message),
    limitations: [
      "Structural feasibility does not prove fun, balance, narrative quality, visual quality, or spatial playability.",
      "Search and materialization are read-only. Only an exact ordinary preview batch can be explicitly applied.",
    ],
  };
  return { ...report, digest: canonicalSha256(report) };
}

export function suggestStructuralScaffoldContract(project, options = {}) {
  const requested = Array.isArray(options.families) ? options.families : LOOPLAB_STRUCTURAL_SCAFFOLD_FAMILIES;
  const families = [...new Set(requested.filter((family) => LOOPLAB_STRUCTURAL_SCAFFOLD_FAMILIES.includes(family)))];
  const contract = normalizeStructuralScaffoldContract({
    status: "draft",
    intent: "Generate several renderer-neutral, executable game-structure alternatives, prove their references and reachability, then let an agent choose and author the content slots before previewing any mutation.",
    families: families.length ? families : LOOPLAB_STRUCTURAL_SCAFFOLD_FAMILIES,
    constraints: {
      minimumDecisionDepth: 2,
      maximumDecisionDepth: 6,
      minimumBranchPages: 0,
      maximumBranchPages: 4,
      cyclePolicy: "allow",
      maximumChoicesPerPage: 4,
      replacementPolicy: options.allowReplacement === true ? "replace-explicit" : "empty-only",
    },
    search: { maxCandidates: Number.isInteger(options.maxCandidates) ? options.maxCandidates : LOOPLAB_STRUCTURAL_SCAFFOLD_LIMITS.defaultCandidates },
  });
  return {
    schemaVersion: "looplab-structural-scaffold-suggestion/v1",
    available: true,
    contract,
    contractDigest: canonicalSha256(contract),
    existingGameplayProgramProtected: Boolean(project?.gameplayProgram) && contract.constraints.replacementPolicy === "empty-only",
    instruction: "Review the families and hard constraints. Set replace-explicit only on a protected variation when replacing an existing gameplay program is intentional.",
  };
}

function slot(id, kind, purpose, defaultValue, maxLength = 120) {
  return { id, kind, purpose, required: true, maxLength, defaultValue };
}

function createBuilder(family, variant) {
  const slots = [];
  const addSlot = (id, kind, purpose, value, maxLength) => {
    slots.push(slot(id, kind, purpose, value, maxLength));
    return marker(id);
  };
  const page = (id, choices, purpose = id) => ({
    id,
    title: addSlot(`${id}-title`, "title", `${purpose} title`, purpose.replace(/-/g, " ")),
    body: addSlot(`${id}-body`, "body", `${purpose} body`, `Describe ${purpose.replace(/-/g, " ")}.`, 240),
    modal: true,
    choices,
  });
  const choice = (id, action, nextPageId, effects = [], options = {}) => ({
    id,
    label: addSlot(`${id}-label`, "choice-label", `${id.replace(/-/g, " ")} choice label`, id.replace(/-/g, " ")),
    actionId: `choice-${action}`,
    visibleWhen: options.visibleWhen ?? [],
    enabledWhen: options.enabledWhen ?? [],
    effects,
    ...(nextPageId ? { nextPageId } : {}),
    close: options.close ?? !nextPageId,
  });
  return { family, variant, slots, page, choice };
}

function questBlueprint(variant) {
  const b = createBuilder("quest-network", variant);
  const variables = [
    { id: "quest-progress", label: "Progress", type: "number", initial: 0, min: 0, max: 9, visible: true },
    { id: "quest-insight", label: "Insight", type: "number", initial: 0, min: 0, max: 9, visible: true },
  ];
  let choicePages;
  if (variant === "linear-objective") {
    choicePages = [
      b.page("quest-start", [b.choice("accept-objective", 1, "quest-task", [{ type: "set-variable", variableId: "quest-progress", value: 1 }])], "quest opening"),
      b.page("quest-task", [b.choice("resolve-objective", 1, "quest-finish", [{ type: "set-variable", variableId: "quest-progress", value: 2 }])], "quest task"),
      b.page("quest-finish", [b.choice("complete-quest", 1, null, [{ type: "set-variable", variableId: "quest-progress", value: 3 }, { type: "win" }])], "quest resolution"),
    ];
  } else if (variant === "fork-and-merge") {
    choicePages = [
      b.page("quest-start", [b.choice("take-direct-route", 1, "quest-direct"), b.choice("seek-insight-route", 2, "quest-insight")], "quest route decision"),
      b.page("quest-direct", [b.choice("finish-direct-route", 1, "quest-merge", [{ type: "set-variable", variableId: "quest-progress", value: 1 }])], "direct route"),
      b.page("quest-insight", [b.choice("finish-insight-route", 1, "quest-merge", [{ type: "set-variable", variableId: "quest-insight", value: 1 }])], "insight route"),
      b.page("quest-merge", [b.choice("complete-quest", 1, null, [{ type: "set-variable", variableId: "quest-progress", value: 2 }, { type: "win" }])], "quest convergence"),
    ];
  } else {
    choicePages = [
      b.page("quest-start", [b.choice("pursue-main-objective", 1, "quest-main"), b.choice("investigate-side-objective", 2, "quest-side")], "quest route decision"),
      b.page("quest-side", [b.choice("return-with-insight", 1, "quest-start", [{ type: "set-variable", variableId: "quest-insight", value: 1 }])], "optional objective"),
      b.page("quest-main", [b.choice("resolve-main-objective", 1, "quest-finish", [{ type: "set-variable", variableId: "quest-progress", value: 1 }])], "main objective"),
      b.page("quest-finish", [b.choice("complete-quest", 1, null, [{ type: "set-variable", variableId: "quest-progress", value: 2 }, { type: "win" }])], "quest resolution"),
    ];
  }
  return finishBlueprint(b, { variables, choicePages, initialChoicePageId: "quest-start", clocks: [], hudBindings: [{ id: "quest-status", text: "Progress {quest-progress} · Insight {quest-insight}", ariaLabel: "Quest progress {quest-progress}, insight {quest-insight}", region: "primary", visibleWhen: [] }], rules: [] });
}

function economyBlueprint(variant) {
  const b = createBuilder("economy-loop", variant);
  const variables = [
    { id: "credits", label: "Credits", type: "number", initial: 6, min: 0, max: 99, visible: true },
    { id: "stock", label: "Stock", type: "number", initial: 1, min: 0, max: 9, visible: true },
    { id: "day", label: "Day", type: "number", initial: 1, min: 1, max: 30, visible: true },
    ...(variant === "diversified-market" ? [{ id: "reputation", label: "Reputation", type: "number", initial: 0, min: 0, max: 9, visible: true }] : []),
  ];
  const marketChoices = [
    b.choice("acquire-stock", 1, "economy-receipt", [
      { type: "set-variable-expression", variableId: "credits", expression: { operator: "subtract", operands: [{ variableId: "credits" }, 3] } },
      { type: "set-variable-expression", variableId: "stock", expression: { operator: "clamp", operands: [{ operator: "add", operands: [{ variableId: "stock" }, 1] }, 0, 9] } },
      { type: "advance-clock", clockId: "economy-day", steps: 1 },
    ], { enabledWhen: [{ variableId: "credits", operator: "gte", value: 3 }], close: false }),
    b.choice("sell-stock", 2, "economy-receipt", [
      { type: "set-variable-expression", variableId: "credits", expression: { operator: "clamp", operands: [{ operator: "add", operands: [{ variableId: "credits" }, 5] }, 0, 99] } },
      { type: "set-variable-expression", variableId: "stock", expression: { operator: "subtract", operands: [{ variableId: "stock" }, 1] } },
      { type: "advance-clock", clockId: "economy-day", steps: 1 },
    ], { enabledWhen: [{ variableId: "stock", operator: "gte", value: 1 }], close: false }),
  ];
  if (variant === "diversified-market") marketChoices.push(b.choice("build-reputation", 3, "economy-receipt", [{ type: "set-variable-expression", variableId: "reputation", expression: { operator: "clamp", operands: [{ operator: "add", operands: [{ variableId: "reputation" }, 1] }, 0, 9] } }, { type: "advance-clock", clockId: "economy-day", steps: 1 }], { close: false }));
  marketChoices.push(b.choice("review-contract", variant === "diversified-market" ? 4 : 3, "economy-finish", [], { enabledWhen: [{ variableId: "credits", operator: "gte", value: 10 }], close: false }));
  const receiptNext = variant === "broker-rest-cycle" ? "economy-rest" : "economy-market";
  const choicePages = [
    b.page("economy-market", marketChoices, "market decision"),
    b.page("economy-receipt", [b.choice("review-ledger", 1, receiptNext, [], { close: false })], "transaction result"),
    ...(variant === "broker-rest-cycle" ? [b.page("economy-rest", [b.choice("begin-next-day", 1, "economy-market", [{ type: "advance-clock", clockId: "economy-day", steps: 1 }], { close: false })], "between-day recovery")] : []),
    b.page("economy-finish", [b.choice("complete-contract", 1, null, [{ type: "win" }])], "contract completion"),
  ];
  return finishBlueprint(b, { variables, choicePages, initialChoicePageId: "economy-market", clocks: [{ id: "economy-day", label: "Economy day", variableId: "day", unit: "day", step: 1 }], hudBindings: [{ id: "economy-status", text: "Day {day} · {credits} credits · {stock} stock", ariaLabel: "Day {day}, {credits} credits, {stock} stock", region: "primary", visibleWhen: [] }], rules: [] });
}

function encounterBlueprint(variant) {
  const b = createBuilder("encounter-progression", variant);
  const variables = [
    { id: "resolve", label: "Resolve", type: "number", initial: 2, min: 0, max: 9, visible: true },
    { id: "stage", label: "Stage", type: "number", initial: 1, min: 1, max: 9, visible: true },
    { id: "turn", label: "Turn", type: "number", initial: 1, min: 1, max: 30, visible: true },
  ];
  let choicePages;
  if (variant === "encounter-ladder") {
    choicePages = [
      b.page("encounter-start", [b.choice("prepare-approach", 1, "encounter-middle", [{ type: "set-variable", variableId: "stage", value: 2 }, { type: "advance-clock", clockId: "encounter-turn", steps: 1 }])], "encounter setup"),
      b.page("encounter-middle", [b.choice("commit-approach", 1, "encounter-finish", [{ type: "set-variable", variableId: "stage", value: 3 }, { type: "advance-clock", clockId: "encounter-turn", steps: 1 }])], "encounter escalation"),
      b.page("encounter-finish", [b.choice("resolve-encounter", 1, null, [{ type: "win" }])], "encounter resolution"),
    ];
  } else if (variant === "risk-recovery-cycle") {
    choicePages = [
      b.page("encounter-start", [b.choice("take-steady-route", 1, "encounter-finish", [{ type: "add-variable", variableId: "resolve", value: 1 }]), b.choice("take-risky-route", 2, "encounter-recovery", [{ type: "add-variable", variableId: "resolve", value: -1 }])], "encounter route decision"),
      b.page("encounter-recovery", [b.choice("recover-and-retry", 1, "encounter-start", [{ type: "set-variable-expression", variableId: "resolve", expression: { operator: "clamp", operands: [{ operator: "add", operands: [{ variableId: "resolve" }, 1] }, 0, 9] } }, { type: "advance-clock", clockId: "encounter-turn", steps: 1 }], { close: false })], "risk recovery"),
      b.page("encounter-finish", [b.choice("resolve-encounter", 1, null, [{ type: "set-variable", variableId: "stage", value: 2 }, { type: "win" }])], "encounter resolution"),
    ];
  } else {
    choicePages = [
      b.page("encounter-start", [b.choice("choose-control-plan", 1, "encounter-control"), b.choice("choose-pressure-plan", 2, "encounter-pressure")], "encounter plan"),
      b.page("encounter-control", [b.choice("execute-control-plan", 1, "encounter-merge", [{ type: "add-variable", variableId: "resolve", value: 1 }])], "control plan"),
      b.page("encounter-pressure", [b.choice("execute-pressure-plan", 1, "encounter-merge", [{ type: "add-variable", variableId: "resolve", value: -1 }])], "pressure plan"),
      b.page("encounter-merge", [b.choice("resolve-encounter", 1, null, [{ type: "set-variable", variableId: "stage", value: 2 }, { type: "win" }])], "encounter convergence"),
    ];
  }
  return finishBlueprint(b, { variables, choicePages, initialChoicePageId: "encounter-start", clocks: [{ id: "encounter-turn", label: "Encounter turn", variableId: "turn", unit: "turn", step: 1 }], hudBindings: [{ id: "encounter-status", text: "Stage {stage} · Resolve {resolve} · Turn {turn}", ariaLabel: "Stage {stage}, resolve {resolve}, turn {turn}", region: "primary", visibleWhen: [] }], rules: [] });
}

function finishBlueprint(builder, program) {
  const normalized = normalizeGameplayProgram({ version: 1, ...program });
  const requiredActions = [...new Set(normalized.choicePages.flatMap((page) => page.choices.map((choice) => choice.actionId)))].sort();
  return {
    id: `${builder.family}-${builder.variant}`,
    family: builder.family,
    variant: builder.variant,
    program: normalized,
    contentSlots: builder.slots,
    requiredActions,
  };
}

function allBlueprints(families) {
  const output = [];
  if (families.includes("quest-network")) output.push(questBlueprint("linear-objective"), questBlueprint("fork-and-merge"), questBlueprint("optional-side-cycle"));
  if (families.includes("economy-loop")) output.push(economyBlueprint("single-market"), economyBlueprint("broker-rest-cycle"), economyBlueprint("diversified-market"));
  if (families.includes("encounter-progression")) output.push(encounterBlueprint("encounter-ladder"), encounterBlueprint("risk-recovery-cycle"), encounterBlueprint("loadout-fork"));
  return output;
}

function analyzeGraph(program) {
  const pages = new Map(program.choicePages.map((page) => [page.id, page]));
  const adjacency = new Map([...pages.keys()].map((id) => [id, []]));
  const indegree = new Map([...pages.keys()].map((id) => [id, 0]));
  const terminalPages = new Set();
  const errors = [];
  for (const page of pages.values()) {
    if (!page.choices.length) errors.push(`Choice page ${page.id} is a dead end with no choices.`);
    for (const choice of page.choices) {
      const wins = choice.effects.some((effect) => effect.type === "win");
      if (wins) terminalPages.add(page.id);
      if (choice.nextPageId) {
        if (!pages.has(choice.nextPageId)) errors.push(`Choice ${choice.id} references missing page ${choice.nextPageId}.`);
        else {
          adjacency.get(page.id).push(choice.nextPageId);
          indegree.set(choice.nextPageId, indegree.get(choice.nextPageId) + 1);
        }
      } else if (!wins) errors.push(`Choice ${choice.id} closes without a next page or terminal win effect.`);
    }
  }
  const start = program.initialChoicePageId;
  const queue = pages.has(start) ? [[start, 0]] : [];
  const reachable = new Set();
  let minimumTerminalDepth = null;
  while (queue.length) {
    const [id, depth] = queue.shift();
    if (reachable.has(id)) continue;
    reachable.add(id);
    if (terminalPages.has(id) && minimumTerminalDepth === null) minimumTerminalDepth = depth + 1;
    for (const next of adjacency.get(id) ?? []) if (!reachable.has(next)) queue.push([next, depth + 1]);
  }
  for (const id of pages.keys()) if (!reachable.has(id)) errors.push(`Choice page ${id} is unreachable from ${start || "(missing start)"}.`);
  if (!terminalPages.size || minimumTerminalDepth === null) errors.push("No reachable terminal win choice exists.");
  let cycleCount = 0;
  const visited = new Set();
  const active = new Set();
  const walk = (id) => {
    visited.add(id);
    active.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (!visited.has(next)) walk(next);
      else if (active.has(next)) cycleCount += 1;
    }
    active.delete(id);
  };
  if (pages.has(start)) walk(start);
  const outcomeCount = (page) => new Set(page.choices.map((choice) => choice.nextPageId ?? (choice.effects.some((effect) => effect.type === "win") ? "$terminal" : "$close"))).size;
  const branchPages = [...pages.values()].filter((page) => outcomeCount(page) > 1).length;
  const mergePages = [...indegree.values()].filter((count) => count > 1).length;
  const maximumChoicesPerPage = Math.max(0, ...[...pages.values()].map((page) => page.choices.length));
  return {
    errors,
    reachablePageCount: reachable.size,
    pageCount: pages.size,
    terminalPageCount: terminalPages.size,
    minimumTerminalDepth,
    branchPages,
    mergePages,
    cycleCount,
    maximumChoicesPerPage,
    variableCount: program.variables.length,
  };
}

function descriptorCell(metrics) {
  const branching = metrics.branchPages === 0 ? "linear" : metrics.branchPages === 1 ? "forked" : "networked";
  const cyclicity = metrics.cycleCount > 0 ? "cyclic" : "acyclic";
  const depth = metrics.minimumTerminalDepth <= 2 ? "short" : metrics.minimumTerminalDepth <= 4 ? "medium" : "long";
  const state = metrics.variableCount <= 2 ? "lean-state" : "rich-state";
  return { branching, cyclicity, depth, state, cellId: `${branching}:${cyclicity}:${depth}:${state}` };
}

function satisfiesContract(metrics, constraints) {
  const failed = [];
  if (metrics.minimumTerminalDepth < constraints.minimumDecisionDepth) failed.push("minimum-decision-depth");
  if (metrics.minimumTerminalDepth > constraints.maximumDecisionDepth) failed.push("maximum-decision-depth");
  if (metrics.branchPages < constraints.minimumBranchPages) failed.push("minimum-branch-pages");
  if (metrics.branchPages > constraints.maximumBranchPages) failed.push("maximum-branch-pages");
  if (metrics.maximumChoicesPerPage > constraints.maximumChoicesPerPage) failed.push("maximum-choices-per-page");
  if (constraints.cyclePolicy === "forbid" && metrics.cycleCount > 0) failed.push("cycles-forbidden");
  if (constraints.cyclePolicy === "required" && metrics.cycleCount === 0) failed.push("cycle-required");
  return failed;
}

function inputActionsForBlueprint(project, blueprint) {
  const existing = clone(project?.inputActions ?? []);
  const ids = new Set(existing.map((action) => action?.id));
  for (const actionId of blueprint.requiredActions) {
    if (ids.has(actionId)) continue;
    const index = Number(actionId.split("-").at(-1));
    existing.push({ id: actionId, label: `Choose option ${index}`, bindings: [`Digit${index}`], animationState: "decide", onboarding: true, replayEvent: true });
    ids.add(actionId);
  }
  return existing;
}

function projectForBlueprint(project, blueprint) {
  return { ...clone(project), inputActions: inputActionsForBlueprint(project, blueprint), gameplayProgram: clone(blueprint.program) };
}

function issueIdentity(issue) {
  return [issue?.category, issue?.code, issue?.mapId, issue?.objectId, issue?.featureId, issue?.testId].map((value) => value ?? "").join(":");
}

function doctorSummary(doctor) {
  return {
    profile: doctor?.profile ?? null,
    sourceDigest: doctor?.sourceDigest ?? null,
    digest: doctor?.digest ?? null,
    errorCount: doctor?.errorCount ?? null,
    warningCount: doctor?.warningCount ?? null,
    acceptanceFailures: doctor?.acceptanceResults?.failedCount ?? 0,
    replayFailures: doctor?.replayResults?.failedCount ?? 0,
    deadInputActions: doctor?.inputActionLiveness?.deadCount ?? 0,
    runtimeJoinErrors: (doctor?.runtimeJoinPlan?.issues ?? []).filter((issue) => issue?.severity === "error").length,
    errorKeys: (doctor?.issues ?? []).filter((issue) => issue?.severity === "error").map(issueIdentity).sort(),
  };
}

function noRegressionGates(baseline, candidate, validation, structuralErrors, gameplayErrors) {
  const gates = [];
  const gate = (id, passed, detail) => gates.push({ id, passed, detail });
  gate("structural-graph-valid", structuralErrors.length === 0, structuralErrors.length ? `${structuralErrors.length} structural error(s).` : "Reachability, terminals, and references are valid.");
  gate("gameplay-program-valid", gameplayErrors.length === 0, gameplayErrors.length ? `${gameplayErrors.length} gameplay-program error(s).` : "The canonical gameplay-program inspector passed.");
  gate("schema-valid", validation?.valid === true, validation?.valid ? "Candidate schema is valid." : `${validation?.errors?.length ?? 1} schema error(s).`);
  for (const profile of ["prototype", "production"]) {
    const before = baseline[profile];
    const after = candidate[profile];
    const beforeErrors = new Set(before.errorKeys);
    const introduced = after.errorKeys.filter((key) => !beforeErrors.has(key));
    gate(`${profile}-doctor-no-new-blockers`, introduced.length === 0 && after.errorCount <= before.errorCount, `${before.errorCount} → ${after.errorCount} blocker(s); ${introduced.length} newly introduced.`);
    gate(`${profile}-acceptance-non-regression`, after.acceptanceFailures <= before.acceptanceFailures, `${before.acceptanceFailures} → ${after.acceptanceFailures} acceptance failure(s).`);
    gate(`${profile}-replay-non-regression`, after.replayFailures <= before.replayFailures, `${before.replayFailures} → ${after.replayFailures} replay failure(s).`);
    gate(`${profile}-input-non-regression`, after.deadInputActions <= before.deadInputActions, `${before.deadInputActions} → ${after.deadInputActions} dead action(s).`);
    gate(`${profile}-map-join-non-regression`, after.runtimeJoinErrors <= before.runtimeJoinErrors, `${before.runtimeJoinErrors} → ${after.runtimeJoinErrors} runtime-join blocker(s).`);
  }
  return gates;
}

function roundRobin(candidates, families, limit) {
  const buckets = new Map(families.map((family) => [family, candidates.filter((candidate) => (candidate.family ?? candidate.blueprint?.family) === family)]));
  const output = [];
  while (output.length < limit && [...buckets.values()].some((bucket) => bucket.length)) {
    for (const family of families) {
      const next = buckets.get(family)?.shift();
      if (next) output.push(next);
      if (output.length >= limit) break;
    }
  }
  return output;
}

export function runStructuralScaffoldSearch(project, options = {}) {
  const sourceDigest = options.sourceDigest ?? null;
  const inspection = inspectStructuralScaffoldContract(project, options.contract ?? project?.structuralScaffoldContract, { sourceDigest });
  if (!inspection.present) throw new Error("run_structural_scaffold_search requires an authored structuralScaffoldContract or explicit contract.");
  if (inspection.errors.length) throw new Error(`Structural scaffold contract is invalid: ${inspection.errors.join(" ")}`);
  if (typeof options.evaluateCandidate !== "function") throw new Error("run_structural_scaffold_search requires the canonical candidate evaluator.");
  const contract = inspection.contract;
  const baselineEvaluation = options.evaluateCandidate(project);
  const baselineDoctors = { prototype: doctorSummary(baselineEvaluation.prototypeDoctor), production: doctorSummary(baselineEvaluation.productionDoctor) };
  const generated = allBlueprints(contract.families).map((blueprint) => {
    const graph = analyzeGraph(blueprint.program);
    const failedConstraints = satisfiesContract(graph, contract.constraints);
    const descriptors = descriptorCell(graph);
    return { blueprint, graph, failedConstraints, descriptors, blueprintDigest: canonicalSha256({ id: blueprint.id, program: blueprint.program, contentSlots: blueprint.contentSlots, requiredActions: blueprint.requiredActions }) };
  });
  const constraintSafe = generated.filter((entry) => entry.failedConstraints.length === 0);
  const archive = new Map();
  for (const entry of constraintSafe.sort((a, b) => a.blueprint.id.localeCompare(b.blueprint.id))) if (!archive.has(entry.descriptors.cellId)) archive.set(entry.descriptors.cellId, entry);
  const selected = roundRobin([...archive.values()], contract.families, contract.search.maxCandidates);
  const candidates = selected.map((entry) => {
    const candidateProject = projectForBlueprint(project, entry.blueprint);
    const gameplay = inspectGameplayProgram(candidateProject, entry.blueprint.program);
    const evaluation = options.evaluateCandidate(candidateProject);
    const doctors = { prototype: doctorSummary(evaluation.prototypeDoctor), production: doctorSummary(evaluation.productionDoctor) };
    const gates = noRegressionGates(baselineDoctors, doctors, evaluation.validation, entry.graph.errors, gameplay.errors);
    const safe = gates.every((gate) => gate.passed);
    const replacementBlocked = Boolean(project?.gameplayProgram) && contract.constraints.replacementPolicy !== "replace-explicit";
    const identity = { sourceDigest, contractDigest: inspection.contractDigest, id: entry.blueprint.id, blueprintDigest: entry.blueprintDigest, descriptors: entry.descriptors, gates: gates.map((gate) => [gate.id, gate.passed]) };
    return {
      id: entry.blueprint.id,
      family: entry.blueprint.family,
      variant: entry.blueprint.variant,
      safe,
      materializable: safe && !replacementBlocked,
      replacementBlocked,
      descriptors: entry.descriptors,
      metrics: entry.graph,
      gates,
      failedGateIds: gates.filter((gate) => !gate.passed).map((gate) => gate.id),
      contentSlots: clone(entry.blueprint.contentSlots),
      requiredActions: clone(entry.blueprint.requiredActions),
      blueprintDigest: entry.blueprintDigest,
      candidateDigest: canonicalSha256(identity),
      materializationRequest: safe && !replacementBlocked ? {
        op: "materialize_structural_scaffold",
        candidateId: entry.blueprint.id,
        expectedCandidateDigest: canonicalSha256(identity),
        expectedSourceDigest: sourceDigest,
      } : null,
      slotValueTemplate: Object.fromEntries(entry.blueprint.contentSlots.map((contentSlot) => [contentSlot.id, contentSlot.defaultValue])),
      doctor: doctors,
    };
  });
  const excluded = generated.filter((entry) => entry.failedConstraints.length).map((entry) => ({ id: entry.blueprint.id, failedConstraintIds: entry.failedConstraints, descriptors: entry.descriptors }));
  const report = {
    schemaVersion: LOOPLAB_STRUCTURAL_SCAFFOLD_SEARCH_SCHEMA,
    status: candidates.length ? "completed" : "infeasible",
    sourceDigest,
    contractDigest: inspection.contractDigest,
    contract,
    strategy: "deterministic-descriptor-archive",
    generatedBlueprintCount: generated.length,
    feasibleDescriptorCellCount: archive.size,
    evaluatedCandidateCount: candidates.length,
    candidateBudget: contract.search.maxCandidates,
    safeCandidateIds: candidates.filter((candidate) => candidate.safe).map((candidate) => candidate.id),
    materializableCandidateIds: candidates.filter((candidate) => candidate.materializable).map((candidate) => candidate.id),
    automaticWinner: null,
    agentDecisionRequired: candidates.length > 0,
    candidates,
    excluded,
    infeasibility: candidates.length ? null : { reason: "No generated blueprint satisfied every authored structural constraint.", authoredConstraintsPreserved: true },
    decisionBoundary: "Hard gates prove bounded structural and technical feasibility only. They do not prove fun, balance, narrative quality, or creative preference, and no candidate is selected automatically.",
    applicationPolicy: "Search is read-only. Fill every content slot, materialize the exact source-bound candidate, preview the returned ordinary command batch, then explicitly apply it on an unchanged protected variation.",
    providerUsage: { provider: "none", measured: true, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, rateEquivalentUsd: 0 },
    limitations: inspection.limitations,
  };
  return { ...report, searchDigest: canonicalSha256({ schemaVersion: report.schemaVersion, sourceDigest, contractDigest: inspection.contractDigest, candidateIdentity: candidates.map((candidate) => [candidate.id, candidate.candidateDigest, candidate.safe, candidate.materializable]), excluded }) };
}

function validateSlotValues(contentSlots, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("slotValues must be one object keyed by the candidate's exact content-slot IDs.");
  const expected = new Set(contentSlots.map((contentSlot) => contentSlot.id));
  for (const key of Object.keys(input)) if (!expected.has(key)) throw new Error(`slotValues contains unknown content slot: ${key}.`);
  const values = {};
  for (const contentSlot of contentSlots) {
    const value = input[contentSlot.id];
    if (typeof value !== "string") throw new Error(`slotValues.${contentSlot.id} must be a string.`);
    const text = value.trim();
    if (!text) throw new Error(`slotValues.${contentSlot.id} must not be empty.`);
    if (text.length > contentSlot.maxLength) throw new Error(`slotValues.${contentSlot.id} must contain at most ${contentSlot.maxLength} characters.`);
    values[contentSlot.id] = text;
  }
  return values;
}

function replaceSlots(value, slotValues) {
  if (typeof value === "string") {
    let output = value;
    for (const [id, text] of Object.entries(slotValues)) output = output.split(marker(id)).join(text);
    return output;
  }
  if (Array.isArray(value)) return value.map((entry) => replaceSlots(entry, slotValues));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceSlots(entry, slotValues)]));
  return value;
}

export function materializeStructuralScaffold(project, options = {}) {
  const search = runStructuralScaffoldSearch(project, options);
  const candidate = search.candidates.find((entry) => entry.id === options.candidateId);
  if (!candidate) throw new Error(`Unknown or constraint-excluded structural scaffold candidate: ${options.candidateId ?? "(missing)"}.`);
  if (candidate.candidateDigest !== options.expectedCandidateDigest) throw new Error("Structural scaffold candidate digest is stale or does not match the selected candidate.");
  if (!candidate.safe) throw new Error(`Structural scaffold candidate ${candidate.id} failed its hard gates.`);
  if (!candidate.materializable) throw new Error("The existing gameplay program is protected. Use a project variation and an explicit replace-explicit contract before materializing a replacement.");
  const blueprint = allBlueprints(search.contract.families).find((entry) => entry.id === candidate.id);
  if (!blueprint) throw new Error("The selected scaffold blueprint is no longer available.");
  const slotValues = validateSlotValues(blueprint.contentSlots, options.slotValues);
  const program = normalizeGameplayProgram(replaceSlots(blueprint.program, slotValues));
  if (JSON.stringify(program).includes("[[slot:")) throw new Error("Materialized gameplay program still contains an unresolved content slot.");
  const inputActions = inputActionsForBlueprint(project, blueprint);
  const projected = { ...clone(project), inputActions, gameplayProgram: program };
  const gameplay = inspectGameplayProgram(projected, program);
  if (gameplay.errors.length) throw new Error(`Materialized gameplay program is invalid: ${gameplay.errors.join(" ")}`);
  const commands = [];
  if (canonicalSha256(inputActions) !== canonicalSha256(project?.inputActions ?? [])) commands.push({ op: "set_project", changes: { inputActions } });
  commands.push({ op: "set_gameplay_program", program });
  const previewCommand = {
    op: "preview_batch",
    commands,
    summary: `Materialize reviewed structural scaffold ${candidate.id} from ${search.contractDigest}.`,
    expectedSourceDigest: search.sourceDigest,
  };
  const receipt = {
    schemaVersion: LOOPLAB_STRUCTURAL_SCAFFOLD_MATERIALIZATION_SCHEMA,
    sourceDigest: search.sourceDigest,
    contractDigest: search.contractDigest,
    searchDigest: search.searchDigest,
    candidateId: candidate.id,
    candidateDigest: candidate.candidateDigest,
    blueprintDigest: candidate.blueprintDigest,
    slotValuesDigest: canonicalSha256(slotValues),
    commandBatchDigest: canonicalSha256(commands),
    previewCommand,
    mutatesProject: false,
    explicitPreviewAndApplyRequired: true,
    automaticWinner: null,
    providerUsage: { provider: "none", measured: true, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, rateEquivalentUsd: 0 },
  };
  return { ...receipt, materializationDigest: canonicalSha256(receipt) };
}
