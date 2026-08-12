import { canonicalSha256 } from "./looplab-canonical-digest.mjs";
import { inspectGameplayProgram } from "./looplab-gameplay-rules.mjs";
import { LOOPLAB_EXPORTED_RUNTIME_VERSION, LOOPLAB_PROTOCOL_VERSION } from "./looplab-versions.mjs";

export const LOOPLAB_BUILDER_BENCHMARK_SUITE_SCHEMA = "looplab-builder-benchmark-suite/v1";
export const LOOPLAB_BUILDER_BENCHMARK_RUN_SCHEMA = "looplab-builder-benchmark-run/v1";
export const LOOPLAB_BUILDER_BENCHMARK_COMPARISON_SCHEMA = "looplab-builder-benchmark-comparison/v1";
export const LOOPLAB_BUILDER_BENCHMARK_SUITE_VERSION = 1;
export const LOOPLAB_BUILDER_BENCHMARK_LIMITS = Object.freeze({ maximumTasks: 24, maximumRunsPerSide: 50, minimumStochasticTrials: 3, maximumTrials: 50 });

const TASK_CATEGORIES = Object.freeze(["platformer", "top-down", "connected-world", "systems"]);
const EXPECTATION_GRADERS = new Set([
  "validation-clean",
  "doctor-error-free",
  "input-liveness",
  "map-count",
  "control-mode",
  "object-kind-count",
  "completion-passed",
  "acceptance-passed",
  "acceptance-observable-state",
  "replay-passed",
  "runtime-joins",
  "campaign-round-trip",
  "gameplay-program",
  "gameplay-effects",
  "visual-readiness",
  "standalone-audit",
]);
const PROVIDERS = new Set(["none", "openai", "anthropic", "codex", "claude", "file"]);
const RUN_KEYS = new Set(["provider", "model", "scaffold", "strategy", "contextBudgetTokens", "trialSetId", "trialIndex", "trialCount", "usage", "toolCalls", "retries", "wallTimeMs"]);
const USAGE_KEYS = new Set(["inputTokens", "cachedInputTokens", "outputTokens", "reasoningTokens", "totalTokens", "rateEquivalentUsd"]);
const NOT_TASTE_EVIDENCE = "This receipt measures explicit technical fitness, authored structure, deterministic behavior, and package evidence. It does not prove fun, originality, composition, art direction, or aesthetic quality.";

const COMMON_EXPECTATIONS = Object.freeze([
  expectation("project-valid", "correctness", "The candidate is a valid LoopLab authored project.", "validation-clean"),
  expectation("authoring-doctor", "correctness", "The active authoring profile has no Project Doctor errors.", "doctor-error-free", { profile: "current" }),
  expectation("release-doctor", "correctness", "The production profile has no Project Doctor errors; release-only warnings remain visible separately.", "doctor-error-free", { profile: "release" }),
  expectation("live-controls", "playability", "Every declared input action has an executable runtime consumer.", "input-liveness"),
  expectation("offline-one-file", "packaging", "A generated one-file HTML candidate passes the standalone artifact audit.", "standalone-audit"),
]);

function expectation(id, dimension, statement, grader, parameters = {}, required = true) {
  return { id, dimension, required, statement, grader: { type: grader, ...parameters } };
}

function task(input) {
  const taskWithoutDigest = {
    suiteVersion: LOOPLAB_BUILDER_BENCHMARK_SUITE_VERSION,
    revision: 1,
    ...input,
    expectations: [...COMMON_EXPECTATIONS, ...input.expectations],
    judgmentResidue: [
      "Does the game feel enjoyable and readable during a real playtest?",
      "Does the art direction look cohesive and intentional rather than merely satisfying metadata checks?",
      "Are pacing, difficulty, composition, and player guidance appropriate for the creative brief?",
    ],
    benchmarkPolicy: {
      visibleRequirementsOnly: true,
      implementationAgnostic: true,
      privilegedGenerationPath: false,
      providerExecution: "ordinary-director-and-durable-companion-job",
    },
  };
  return deepFreeze({ ...taskWithoutDigest, taskDigest: canonicalSha256(taskWithoutDigest) });
}

const TASKS = Object.freeze([
  task({
    id: "platformer-completion-route",
    title: "Single-map platformer completion route",
    category: "platformer",
    startingTemplate: "platformer",
    campaignScope: "single-map",
    prompt: "Build a polished single-map 2D platformer with responsive movement, collectible progress, a fair hazard, a reachable finish, game-ready visual assets, and deterministic proof that the route can be completed. Export it as one offline HTML file.",
    ordinaryDirectorConstraints: [
      "Use one authored map with at least one collectible, hazard, and terminal goal.",
      "Prove completion with a passing executable acceptance test and a deterministic replay fixture.",
      "Keep generated art separate from authored collision and preserve live semantic controls.",
    ],
    expectations: [
      expectation("one-map", "world", "Exactly one authored map is used.", "map-count", { minimum: 1, maximum: 1 }),
      expectation("collectible", "world", "At least one collectible object is authored.", "object-kind-count", { kind: "coin", minimum: 1 }),
      expectation("hazard", "world", "At least one gameplay hazard is authored.", "object-kind-count", { kind: "hazard", minimum: 1 }),
      expectation("terminal-goal", "world", "At least one terminal goal is authored.", "object-kind-count", { kind: "goal", minimum: 1 }),
      expectation("completion", "playability", "The deterministic completion harness reaches the terminal state.", "completion-passed"),
      expectation("acceptance", "playability", "At least one executable acceptance test passes with no failed or invalid executable test.", "acceptance-passed", { minimumExecutable: 1 }),
      expectation("replay", "playability", "At least one deterministic replay fixture passes without divergence.", "replay-passed", { minimumCases: 1 }),
      expectation("visual-proxy", "presentation", "Game-ready art is requested and the measurable visual-readiness proxy scores at least 75.", "visual-readiness", { minimumScore: 75, requireRequested: true }),
    ],
  }),
  task({
    id: "topdown-collect-unlock",
    title: "Top-down collect and unlock",
    category: "top-down",
    startingTemplate: "topdown",
    campaignScope: "single-map",
    prompt: "Build a polished single-map top-down 2D game where the player explores in four directions, collects at least one progression item, changes an observable game state, and reaches an unlocked finish. Include game-ready visual assets, executable acceptance proof, deterministic replay, and one offline HTML export.",
    ordinaryDirectorConstraints: [
      "Use top-down movement with live horizontal and vertical controls.",
      "The completion proof must include an observable state change in addition to winning.",
      "Do not implement the unlock only as decoration or prose.",
    ],
    expectations: [
      expectation("one-map", "world", "Exactly one authored map is used.", "map-count", { minimum: 1, maximum: 1 }),
      expectation("topdown-control", "playability", "The authored runtime uses top-down movement.", "control-mode", { value: "topdown" }),
      expectation("collectible", "world", "At least one collectible object is authored.", "object-kind-count", { kind: "coin", minimum: 1 }),
      expectation("terminal-goal", "world", "At least one terminal goal is authored.", "object-kind-count", { kind: "goal", minimum: 1 }),
      expectation("completion", "playability", "The deterministic completion harness reaches the terminal state.", "completion-passed"),
      expectation("acceptance", "playability", "At least one executable acceptance test passes with no failed or invalid executable test.", "acceptance-passed", { minimumExecutable: 1 }),
      expectation("state-change-proof", "playability", "A passing executable test proves the win plus at least one distinct state or event outcome.", "acceptance-observable-state", { minimumDistinctOutcomes: 2 }),
      expectation("replay", "playability", "At least one deterministic replay fixture passes without divergence.", "replay-passed", { minimumCases: 1 }),
      expectation("visual-proxy", "presentation", "Game-ready art is requested and the measurable visual-readiness proxy scores at least 75.", "visual-readiness", { minimumScore: 75, requireRequested: true }),
    ],
  }),
  task({
    id: "two-map-round-trip-journey",
    title: "Two-map round-trip journey",
    category: "connected-world",
    startingTemplate: "kinetic",
    campaignScope: "two-connected-maps",
    prompt: "Build a polished 2D or dimetric 2.5D game with exactly two connected authored maps. The player experiences map one first, travels to map two through an exact portal-to-spawn join, can return to map one through a second exact join, and can complete a terminal objective. Preserve game-ready art, deterministic proof, and one offline HTML export.",
    ordinaryDirectorConstraints: [
      "Author separate forward and return runtime-join contracts; copied screen overlap is not transition proof.",
      "Every enabled portal targets an exact existing spawn with a clear landing.",
      "Prove terminal completion, at least one executable acceptance path, and deterministic replay.",
    ],
    expectations: [
      expectation("two-maps", "world", "Exactly two authored maps are used.", "map-count", { minimum: 2, maximum: 2 }),
      expectation("two-joins", "world", "At least two valid exact runtime joins provide forward and return travel.", "runtime-joins", { minimum: 2 }),
      expectation("round-trip", "world", "Every map is reachable from the start map and can route back to it through authored runtime joins.", "campaign-round-trip"),
      expectation("completion", "playability", "The deterministic completion harness reaches the terminal state.", "completion-passed"),
      expectation("acceptance", "playability", "At least one executable acceptance test passes with no failed or invalid executable test.", "acceptance-passed", { minimumExecutable: 1 }),
      expectation("replay", "playability", "At least one deterministic replay fixture passes without divergence.", "replay-passed", { minimumCases: 1 }),
      expectation("visual-proxy", "presentation", "Game-ready art is requested and the measurable visual-readiness proxy scores at least 75.", "visual-readiness", { minimumScore: 75, requireRequested: true }),
    ],
  }),
  task({
    id: "systems-choice-economy",
    title: "Choice-driven systems game",
    category: "systems",
    startingTemplate: "systems",
    campaignScope: "single-map",
    prompt: "Build a polished non-platformer 2D systems game where choices change at least two typed variables, a formula computes a bounded result, a turn or day clock advances, and the HUD exposes current state. Prove the choice flow with executable acceptance and deterministic replay, then export one offline HTML file.",
    ordinaryDirectorConstraints: [
      "Use an executable gameplay program, not prose-only rules.",
      "Include at least one choice page with two choices, two typed variables, one clock, and one HUD binding.",
      "Use a set-variable-expression effect and an advance-clock effect, with acceptance and replay evidence.",
    ],
    expectations: [
      expectation("systems-structure", "systems", "The executable gameplay program has at least two variables, one choice page, two choices, one clock, and one HUD binding.", "gameplay-program", { minimumVariables: 2, minimumChoicePages: 1, minimumChoices: 2, minimumClocks: 1, minimumHudBindings: 1 }),
      expectation("systems-effects", "systems", "The authored choice/rule graph executes both a variable expression and a clock advance.", "gameplay-effects", { requiredTypes: ["set-variable-expression", "advance-clock"] }),
      expectation("acceptance", "playability", "At least one executable acceptance test passes with no failed or invalid executable test.", "acceptance-passed", { minimumExecutable: 1 }),
      expectation("state-change-proof", "playability", "A passing executable test proves at least two distinct state or event outcomes.", "acceptance-observable-state", { minimumDistinctOutcomes: 2 }),
      expectation("replay", "playability", "At least one deterministic replay fixture passes without divergence.", "replay-passed", { minimumCases: 1 }),
      expectation("visual-observation", "presentation", "Visual readiness is reported as an observation; systems/UI quality still requires direct review.", "visual-readiness", { minimumScore: 0, requireRequested: false }, false),
    ],
  }),
]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function finiteNonNegative(value, label, { integer = false, nullable = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (nullable) return null;
    return 0;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || (integer && !Number.isInteger(numeric))) throw new Error(`${label} must be a non-negative${integer ? " integer" : " number"}.`);
  return numeric;
}

function boundedOptionalString(value, label, maximum = 160) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (!text || text.length > maximum) throw new Error(`${label} must be a non-empty string of at most ${maximum} characters.`);
  return text;
}

function normalizeUsage(input, provider) {
  if (input !== undefined && (!input || typeof input !== "object" || Array.isArray(input))) throw new Error("run.usage must be one object.");
  for (const key of Object.keys(input ?? {})) if (!USAGE_KEYS.has(key)) throw new Error(`run.usage contains unsupported field: ${key}`);
  const usage = {
    inputTokens: finiteNonNegative(input?.inputTokens, "run.usage.inputTokens", { integer: true }),
    cachedInputTokens: finiteNonNegative(input?.cachedInputTokens, "run.usage.cachedInputTokens", { integer: true }),
    outputTokens: finiteNonNegative(input?.outputTokens, "run.usage.outputTokens", { integer: true }),
    reasoningTokens: finiteNonNegative(input?.reasoningTokens, "run.usage.reasoningTokens", { integer: true }),
    totalTokens: finiteNonNegative(input?.totalTokens, "run.usage.totalTokens", { integer: true }),
    rateEquivalentUsd: finiteNonNegative(input?.rateEquivalentUsd, "run.usage.rateEquivalentUsd"),
  };
  const measuredTotal = usage.inputTokens + usage.outputTokens;
  if (usage.totalTokens === 0 && measuredTotal > 0) usage.totalTokens = measuredTotal;
  if (usage.cachedInputTokens > usage.inputTokens) throw new Error("run.usage.cachedInputTokens cannot exceed inputTokens.");
  if (provider === "none" && Object.values(usage).some((value) => value !== 0)) throw new Error("A provider-none benchmark run cannot claim provider token or dollar usage.");
  return usage;
}

export function normalizeBuilderBenchmarkRun(input = {}, taskDefinition = null) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("run must be one object.");
  for (const key of Object.keys(input)) if (!RUN_KEYS.has(key)) throw new Error(`run contains unsupported field: ${key}`);
  const provider = String(input.provider ?? "none").trim().toLowerCase();
  if (!PROVIDERS.has(provider)) throw new Error(`Unsupported benchmark provider: ${provider}`);
  const model = boundedOptionalString(input.model, "run.model");
  const scaffold = boundedOptionalString(input.scaffold, "run.scaffold") ?? taskDefinition?.startingTemplate ?? "unknown";
  const strategy = boundedOptionalString(input.strategy, "run.strategy") ?? (provider === "none" ? "deterministic-evaluation" : null);
  const contextBudgetTokens = finiteNonNegative(input.contextBudgetTokens, "run.contextBudgetTokens", { integer: true, nullable: true });
  const trialSetId = boundedOptionalString(input.trialSetId, "run.trialSetId", 120);
  const trialIndex = finiteNonNegative(input.trialIndex, "run.trialIndex", { integer: true, nullable: true });
  const trialCount = finiteNonNegative(input.trialCount, "run.trialCount", { integer: true, nullable: true });
  const hasAnyTrialField = trialSetId !== null || trialIndex !== null || trialCount !== null;
  if (hasAnyTrialField && (trialSetId === null || trialIndex === null || trialCount === null)) throw new Error("run.trialSetId, trialIndex, and trialCount must be provided together.");
  if (trialCount !== null && (trialCount < 1 || trialCount > LOOPLAB_BUILDER_BENCHMARK_LIMITS.maximumTrials || trialIndex < 1 || trialIndex > trialCount)) throw new Error(`Benchmark trial identity must be within 1..${LOOPLAB_BUILDER_BENCHMARK_LIMITS.maximumTrials}.`);
  if (provider !== "none" && (!model || !strategy || contextBudgetTokens === null || !hasAnyTrialField)) throw new Error("Provider-backed benchmark runs require model, strategy, contextBudgetTokens, trialSetId, trialIndex, and trialCount.");
  if (provider === "none" && hasAnyTrialField) throw new Error("Deterministic provider-none evaluation is one exact observation and must not claim a stochastic trial set.");
  return {
    provider,
    model,
    scaffold,
    strategy,
    contextBudgetTokens,
    trialSetId,
    trialIndex,
    trialCount,
    usage: normalizeUsage(input.usage, provider),
    toolCalls: finiteNonNegative(input.toolCalls, "run.toolCalls", { integer: true }),
    retries: finiteNonNegative(input.retries, "run.retries", { integer: true }),
    wallTimeMs: finiteNonNegative(input.wallTimeMs, "run.wallTimeMs", { integer: true, nullable: true }),
  };
}

function taskDigestProjection(taskDefinition) {
  const projection = { ...taskDefinition };
  delete projection.taskDigest;
  return projection;
}

export function validateBuilderBenchmarkSuite(tasks = TASKS) {
  const errors = [];
  const ids = new Set();
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > LOOPLAB_BUILDER_BENCHMARK_LIMITS.maximumTasks) errors.push("The benchmark suite must contain a bounded non-empty task list.");
  for (const [taskIndex, definition] of (tasks ?? []).entries()) {
    const prefix = `tasks[${taskIndex}]`;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(definition?.id ?? "")) errors.push(`${prefix}.id must be a stable lowercase hyphenated ID.`);
    if (ids.has(definition?.id)) errors.push(`${prefix}.id duplicates ${definition.id}.`);
    ids.add(definition?.id);
    if (!TASK_CATEGORIES.includes(definition?.category)) errors.push(`${prefix}.category is unsupported.`);
    if (!Number.isInteger(definition?.revision) || definition.revision < 1) errors.push(`${prefix}.revision must be a positive integer.`);
    if (typeof definition?.prompt !== "string" || definition.prompt.trim().length < 80) errors.push(`${prefix}.prompt must expose a concrete visible brief.`);
    if (!Array.isArray(definition?.ordinaryDirectorConstraints) || definition.ordinaryDirectorConstraints.length < 2) errors.push(`${prefix}.ordinaryDirectorConstraints must expose the ordinary generation constraints.`);
    if (!Array.isArray(definition?.expectations) || definition.expectations.length < 1) errors.push(`${prefix}.expectations must be non-empty.`);
    const expectationIds = new Set();
    for (const [expectationIndex, entry] of (definition?.expectations ?? []).entries()) {
      const expectationPrefix = `${prefix}.expectations[${expectationIndex}]`;
      if (!/^[a-z0-9][a-z0-9-]*$/.test(entry?.id ?? "")) errors.push(`${expectationPrefix}.id must be stable.`);
      if (expectationIds.has(entry?.id)) errors.push(`${expectationPrefix}.id duplicates ${entry.id}.`);
      expectationIds.add(entry?.id);
      if (typeof entry?.statement !== "string" || !entry.statement.trim()) errors.push(`${expectationPrefix}.statement is required so the grader is not hidden.`);
      if (typeof entry?.required !== "boolean") errors.push(`${expectationPrefix}.required must be explicit.`);
      if (!EXPECTATION_GRADERS.has(entry?.grader?.type)) errors.push(`${expectationPrefix}.grader.type is unsupported.`);
    }
    const expectedDigest = canonicalSha256(taskDigestProjection(definition));
    if (definition?.taskDigest !== expectedDigest) errors.push(`${prefix}.taskDigest does not match the visible task contract.`);
  }
  return { valid: errors.length === 0, errors, taskCount: tasks?.length ?? 0 };
}

const SUITE_VALIDATION = validateBuilderBenchmarkSuite(TASKS);
if (!SUITE_VALIDATION.valid) throw new Error(`Invalid LoopLab builder benchmark suite: ${SUITE_VALIDATION.errors.join(" ")}`);
const SUITE_DIGEST = canonicalSha256(TASKS.map((entry) => ({ id: entry.id, revision: entry.revision, taskDigest: entry.taskDigest })));

export function getBuilderBenchmarkSuite() {
  return clone({
    schemaVersion: LOOPLAB_BUILDER_BENCHMARK_SUITE_SCHEMA,
    suiteVersion: LOOPLAB_BUILDER_BENCHMARK_SUITE_VERSION,
    suiteDigest: SUITE_DIGEST,
    taskCount: TASKS.length,
    categories: TASK_CATEGORIES,
    minimumStochasticTrials: LOOPLAB_BUILDER_BENCHMARK_LIMITS.minimumStochasticTrials,
    tasks: TASKS,
    policy: {
      defaultCi: "provider-free-registry-and-evaluator-validation",
      providerRuns: "explicit-opt-in-durable-companion-jobs",
      comparison: "exact task and run identity; builder protocol/runtime are the independent variable",
      noBenchmarkDetection: true,
      notTasteEvidence: NOT_TASTE_EVIDENCE,
    },
  });
}

export function getBuilderBenchmark(benchmarkId) {
  const id = String(benchmarkId ?? "").trim();
  const found = TASKS.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown builder benchmark: ${id || "(empty)"}`);
  return clone(found);
}

export function listBuilderBenchmarks(options = {}) {
  const query = String(options.query ?? "").trim().toLowerCase();
  const category = String(options.category ?? "all").trim();
  if (category !== "all" && !TASK_CATEGORIES.includes(category)) throw new Error(`Unsupported builder benchmark category: ${category}`);
  const limit = Math.max(1, Math.min(LOOPLAB_BUILDER_BENCHMARK_LIMITS.maximumTasks, Math.trunc(Number(options.limit ?? LOOPLAB_BUILDER_BENCHMARK_LIMITS.maximumTasks)) || LOOPLAB_BUILDER_BENCHMARK_LIMITS.maximumTasks));
  const tasks = TASKS.filter((entry) => {
    if (category !== "all" && entry.category !== category) return false;
    if (!query) return true;
    const haystack = `${entry.id} ${entry.title} ${entry.category} ${entry.prompt} ${entry.ordinaryDirectorConstraints.join(" ")}`.toLowerCase();
    return haystack.includes(query);
  }).slice(0, limit);
  return {
    schemaVersion: LOOPLAB_BUILDER_BENCHMARK_SUITE_SCHEMA,
    suiteVersion: LOOPLAB_BUILDER_BENCHMARK_SUITE_VERSION,
    suiteDigest: SUITE_DIGEST,
    total: TASKS.length,
    returned: tasks.length,
    categories: TASK_CATEGORIES,
    tasks: clone(tasks),
    minimumStochasticTrials: LOOPLAB_BUILDER_BENCHMARK_LIMITS.minimumStochasticTrials,
    providerExecution: "Use the ordinary Director and durable companion job lifecycle; benchmark IDs never unlock a privileged generation path.",
    notTasteEvidence: NOT_TASTE_EVIDENCE,
  };
}

function mapsForProject(project) {
  if (Array.isArray(project?.maps) && project.maps.length) return project.maps;
  return [{ id: project?.activeMapId ?? project?.startMapId ?? "map-main", name: project?.name ?? "Main map", objects: Array.isArray(project?.objects) ? project.objects : [] }];
}

function summarizeDoctor(report) {
  return {
    profile: report?.profile ?? null,
    digest: report?.digest ?? null,
    sourceDigest: report?.sourceDigest ?? null,
    score: Number.isFinite(Number(report?.score)) ? Number(report.score) : null,
    technicalStatus: report?.technicalStatus ?? null,
    errorCount: Number(report?.errorCount ?? 0),
    warningCount: Number(report?.warningCount ?? 0),
    blocking: report?.gate?.blocking === true,
    issueCodes: (report?.issues ?? []).map((issue) => String(issue.code ?? "")).filter(Boolean),
  };
}

function summarizeAcceptance(report) {
  return {
    status: report?.status ?? "missing",
    passed: report?.passed === true,
    testCount: Number(report?.testCount ?? 0),
    executableCount: Number(report?.executableCount ?? 0),
    passedCount: Number(report?.passedCount ?? 0),
    failedCount: Number(report?.failedCount ?? 0),
    invalidCount: Number(report?.invalidCount ?? 0),
    specifiedCount: Number(report?.specifiedCount ?? 0),
    tests: (report?.tests ?? []).map((test) => ({ testId: test.testId ?? null, status: test.status ?? null, passed: test.passed === true, assertionCount: Array.isArray(test.assertions) ? test.assertions.length : 0 })),
  };
}

function summarizeReplay(report) {
  return {
    status: report?.status ?? "missing",
    passed: report?.passed === true,
    caseCount: Number(report?.caseCount ?? 0),
    passedCount: Number(report?.passedCount ?? 0),
    failedCount: Number(report?.failedCount ?? 0),
    firstDivergence: report?.firstDivergence ?? null,
    cases: (report?.cases ?? []).map((entry) => ({ caseId: entry.caseId ?? null, status: entry.status ?? null, passed: entry.passed === true, tickCount: Number(entry.tickCount ?? 0), finalHash: entry.finalHash ?? null })),
  };
}

function gameplayEffectTypes(program) {
  const effects = [];
  for (const rule of program?.rules ?? []) effects.push(...(rule?.effects ?? []));
  for (const page of program?.choicePages ?? []) for (const choice of page?.choices ?? []) effects.push(...(choice?.effects ?? []));
  return [...new Set(effects.map((effect) => String(effect?.type ?? "")).filter(Boolean))].sort();
}

function allReachable(graph, origin) {
  const seen = new Set(origin ? [origin] : []);
  const queue = origin ? [origin] : [];
  while (queue.length) {
    const current = queue.shift();
    for (const next of graph.get(current) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return seen;
}

function evaluateExpectation(entry, context) {
  const { project, validation, currentDoctor, releaseDoctor, standaloneAudit, gameplayInspection, maps } = context;
  const type = entry.grader.type;
  let passed = false;
  let observed = null;
  let evidenceRefs = [];
  if (type === "validation-clean") {
    passed = validation?.valid === true;
    observed = { valid: validation?.valid === true, errorCount: validation?.errors?.length ?? 0, warningCount: validation?.warnings?.length ?? 0 };
    evidenceRefs = ["validateProject"];
  } else if (type === "doctor-error-free") {
    const doctor = entry.grader.profile === "release" ? releaseDoctor : currentDoctor;
    passed = doctor?.errorCount === 0;
    observed = summarizeDoctor(doctor);
    evidenceRefs = [`Project Doctor:${doctor?.profile ?? entry.grader.profile}`];
  } else if (type === "input-liveness") {
    const liveness = currentDoctor?.inputActionLiveness;
    passed = liveness?.passed === true && Number(liveness?.deadCount ?? 0) === 0;
    observed = { status: liveness?.status ?? "missing", passed: liveness?.passed === true, actionCount: Number(liveness?.actionCount ?? 0), liveCount: Number(liveness?.liveCount ?? 0), deadCount: Number(liveness?.deadCount ?? 0) };
    evidenceRefs = ["looplab-input-action-liveness/v1"];
  } else if (type === "map-count") {
    const count = maps.length;
    passed = count >= Number(entry.grader.minimum ?? 0) && count <= Number(entry.grader.maximum ?? Number.POSITIVE_INFINITY);
    observed = { count, mapIds: maps.map((map) => map.id) };
    evidenceRefs = ["authored maps[]"];
  } else if (type === "control-mode") {
    const value = String(project?.controlMode ?? "");
    passed = value === entry.grader.value;
    observed = { value };
    evidenceRefs = ["project.controlMode"];
  } else if (type === "object-kind-count") {
    const count = maps.flatMap((map) => map.objects ?? []).filter((object) => object?.kind === entry.grader.kind).length;
    passed = count >= Number(entry.grader.minimum ?? 0);
    observed = { kind: entry.grader.kind, count };
    evidenceRefs = ["authored map objects"];
  } else if (type === "completion-passed") {
    const report = currentDoctor?.completionReport;
    passed = report?.target?.required === true && report?.status === "passed" && report?.passed === true;
    observed = { status: report?.status ?? "missing", passed: report?.passed === true, targetRequired: report?.target?.required === true, proof: report?.proof ?? null, witnessId: report?.witnessId ?? null, finalStateDigest: report?.finalStateDigest ?? null };
    evidenceRefs = ["looplab-completion-harness/v1"];
  } else if (type === "acceptance-passed") {
    const report = currentDoctor?.acceptanceResults;
    const minimumExecutable = Number(entry.grader.minimumExecutable ?? 1);
    passed = Number(report?.executableCount ?? 0) >= minimumExecutable && Number(report?.passedCount ?? 0) === Number(report?.executableCount ?? 0) && Number(report?.failedCount ?? 0) === 0 && Number(report?.invalidCount ?? 0) === 0;
    observed = summarizeAcceptance(report);
    evidenceRefs = ["looplab-acceptance-result/v1"];
  } else if (type === "acceptance-observable-state") {
    const passing = (currentDoctor?.acceptanceResults?.tests ?? []).filter((test) => test?.status === "passed" && test?.passed === true);
    const outcomes = new Set();
    for (const test of passing) for (const assertion of test.assertions ?? []) {
      const identity = assertion.target === "event-emitted" ? `event:${assertion.targetId}` : `${assertion.target}:${assertion.targetId ?? "runtime"}:${assertion.property}`;
      outcomes.add(identity);
    }
    passed = outcomes.size >= Number(entry.grader.minimumDistinctOutcomes ?? 2);
    observed = { passingTestCount: passing.length, distinctOutcomeCount: outcomes.size, outcomes: [...outcomes].sort() };
    evidenceRefs = ["passing executable acceptance assertions"];
  } else if (type === "replay-passed") {
    const report = currentDoctor?.replayResults;
    passed = report?.passed === true && Number(report?.caseCount ?? 0) >= Number(entry.grader.minimumCases ?? 1) && Number(report?.failedCount ?? 0) === 0;
    observed = summarizeReplay(report);
    evidenceRefs = ["looplab-replay-result/v1"];
  } else if (type === "runtime-joins") {
    const plan = currentDoctor?.runtimeJoinPlan;
    passed = plan?.status === "ready" && Number(plan?.joinCount ?? 0) >= Number(entry.grader.minimum ?? 1) && !(plan?.issues ?? []).some((issue) => issue.severity === "error");
    observed = { status: plan?.status ?? "missing", joinCount: Number(plan?.joinCount ?? 0), issueCount: plan?.issues?.length ?? 0, joins: (plan?.joins ?? []).map((join) => ({ id: join.id, sourceMapId: join.sourceMapId, targetMapId: join.targetMapId, targetSpawnId: join.targetSpawnId })) };
    evidenceRefs = ["looplab-runtime-join-plan/v1"];
  } else if (type === "campaign-round-trip") {
    const plan = currentDoctor?.runtimeJoinPlan;
    const startMapId = project?.startMapId ?? project?.activeMapId ?? maps[0]?.id ?? null;
    const forward = new Map(maps.map((map) => [map.id, []]));
    const reverse = new Map(maps.map((map) => [map.id, []]));
    for (const join of plan?.joins ?? []) {
      if (!forward.has(join.sourceMapId)) forward.set(join.sourceMapId, []);
      if (!reverse.has(join.targetMapId)) reverse.set(join.targetMapId, []);
      forward.get(join.sourceMapId).push(join.targetMapId);
      reverse.get(join.targetMapId).push(join.sourceMapId);
    }
    const reachable = allReachable(forward, startMapId);
    const canReturn = allReachable(reverse, startMapId);
    const missingForward = maps.map((map) => map.id).filter((id) => !reachable.has(id));
    const missingReturn = maps.map((map) => map.id).filter((id) => !canReturn.has(id));
    passed = maps.length > 1 && missingForward.length === 0 && missingReturn.length === 0;
    observed = { startMapId, reachableMapIds: [...reachable].sort(), returnableMapIds: [...canReturn].sort(), missingForward, missingReturn };
    evidenceRefs = ["authored runtime-join graph"];
  } else if (type === "gameplay-program") {
    const metrics = gameplayInspection.metrics;
    passed = gameplayInspection.present === true && gameplayInspection.errors.length === 0
      && metrics.variableCount >= Number(entry.grader.minimumVariables ?? 0)
      && metrics.choicePageCount >= Number(entry.grader.minimumChoicePages ?? 0)
      && metrics.choiceCount >= Number(entry.grader.minimumChoices ?? 0)
      && metrics.clockCount >= Number(entry.grader.minimumClocks ?? 0)
      && metrics.hudBindingCount >= Number(entry.grader.minimumHudBindings ?? 0);
    observed = { present: gameplayInspection.present, errorCount: gameplayInspection.errors.length, warningCount: gameplayInspection.warnings.length, metrics };
    evidenceRefs = ["inspectGameplayProgram"];
  } else if (type === "gameplay-effects") {
    const effectTypes = gameplayEffectTypes(gameplayInspection.program);
    const missingTypes = (entry.grader.requiredTypes ?? []).filter((effectType) => !effectTypes.includes(effectType));
    passed = gameplayInspection.present === true && gameplayInspection.errors.length === 0 && missingTypes.length === 0;
    observed = { effectTypes, missingTypes };
    evidenceRefs = ["authored gameplayProgram choice/rule effects"];
  } else if (type === "visual-readiness") {
    const report = currentDoctor?.visualReadiness;
    const requested = report?.requested === true;
    const score = Number.isFinite(Number(report?.score)) ? Number(report.score) : null;
    passed = entry.grader.requireRequested === true ? requested && score !== null && score >= Number(entry.grader.minimumScore ?? 0) : true;
    observed = { requested, status: report?.status ?? "missing", score, passedCount: Number(report?.passedCount ?? 0), checkCount: Number(report?.checkCount ?? 0), aestheticApproval: report?.aestheticApproval ?? "not-claimed", limitation: report?.limitation ?? NOT_TASTE_EVIDENCE };
    evidenceRefs = ["Project Doctor visual-readiness proxy"];
  } else if (type === "standalone-audit") {
    passed = standaloneAudit?.valid === true;
    observed = { valid: standaloneAudit?.valid === true, byteLength: standaloneAudit?.byteLength ?? null, errorCount: standaloneAudit?.errors?.length ?? 0, warningCount: standaloneAudit?.warnings?.length ?? 0, generationError: standaloneAudit?.generationError ?? null };
    evidenceRefs = ["exact generated HTML", "auditStandaloneHtml"];
  }
  return { id: entry.id, dimension: entry.dimension, required: entry.required, statement: entry.statement, grader: clone(entry.grader), passed, status: passed ? "passed" : "failed", observed, evidenceRefs };
}

function comparabilityProjection(taskDefinition, run) {
  return {
    taskId: taskDefinition.id,
    taskRevision: taskDefinition.revision,
    taskDigest: taskDefinition.taskDigest,
    provider: run.provider,
    model: run.model,
    scaffold: run.scaffold,
    strategy: run.strategy,
    contextBudgetTokens: run.contextBudgetTokens,
  };
}

export function evaluateBuilderBenchmark(project, benchmarkId, evidence = {}) {
  const taskDefinition = getBuilderBenchmark(benchmarkId);
  if (!evidence.validation || typeof evidence.validation.valid !== "boolean") throw new Error("Benchmark evaluation requires the canonical validateProject result.");
  if (!evidence.currentDoctor || !evidence.releaseDoctor) throw new Error("Benchmark evaluation requires current and production Project Doctor reports.");
  if (!evidence.currentDoctor.sourceDigest || evidence.currentDoctor.sourceDigest !== evidence.releaseDoctor.sourceDigest) throw new Error("Benchmark Doctor evidence must bind both profiles to one exact source digest.");
  const run = normalizeBuilderBenchmarkRun(evidence.run ?? {}, taskDefinition);
  const standaloneAudit = evidence.standaloneAudit ?? { valid: false, errors: [], warnings: [], byteLength: null, generationError: evidence.htmlGenerationError ?? "No exact HTML audit was provided." };
  const gameplayInspection = inspectGameplayProgram(project);
  const maps = mapsForProject(project);
  const context = { project, validation: evidence.validation, currentDoctor: evidence.currentDoctor, releaseDoctor: evidence.releaseDoctor, standaloneAudit, gameplayInspection, maps };
  const checks = taskDefinition.expectations.map((entry) => evaluateExpectation(entry, context));
  const requiredChecks = checks.filter((entry) => entry.required);
  const failedRequired = requiredChecks.filter((entry) => !entry.passed);
  const observationChecks = checks.filter((entry) => !entry.required);
  const requiredScore = requiredChecks.length ? Math.round(requiredChecks.filter((entry) => entry.passed).length / requiredChecks.length * 100) : 100;
  const observationScore = observationChecks.length ? Math.round(observationChecks.filter((entry) => entry.passed).length / observationChecks.length * 100) : null;
  const comparability = comparabilityProjection(taskDefinition, run);
  const receiptWithoutDigest = {
    schemaVersion: LOOPLAB_BUILDER_BENCHMARK_RUN_SCHEMA,
    suite: { schemaVersion: LOOPLAB_BUILDER_BENCHMARK_SUITE_SCHEMA, version: LOOPLAB_BUILDER_BENCHMARK_SUITE_VERSION, digest: SUITE_DIGEST },
    benchmark: { id: taskDefinition.id, title: taskDefinition.title, category: taskDefinition.category, revision: taskDefinition.revision, taskDigest: taskDefinition.taskDigest },
    builder: { protocolVersion: LOOPLAB_PROTOCOL_VERSION, runtimeVersion: LOOPLAB_EXPORTED_RUNTIME_VERSION },
    sourceDigest: evidence.currentDoctor.sourceDigest,
    project: { name: String(project?.name ?? "Untitled game"), mapCount: maps.length, startMapId: project?.startMapId ?? project?.activeMapId ?? maps[0]?.id ?? null },
    run,
    comparability: { ...comparability, key: canonicalSha256(comparability), builderVersionsAreIndependentVariable: true },
    passed: failedRequired.length === 0,
    technicalFitness: {
      requiredScore,
      observationScore,
      requiredCheckCount: requiredChecks.length,
      passedRequiredCount: requiredChecks.length - failedRequired.length,
      failedRequiredCount: failedRequired.length,
      observationCheckCount: observationChecks.length,
      failedRequiredIds: failedRequired.map((entry) => entry.id),
    },
    checks,
    blockers: failedRequired.map((entry) => ({ id: entry.id, dimension: entry.dimension, statement: entry.statement, observed: entry.observed })),
    evidence: {
      validation: clone(evidence.validation),
      doctor: { current: summarizeDoctor(evidence.currentDoctor), release: summarizeDoctor(evidence.releaseDoctor) },
      completion: clone(evidence.currentDoctor.completionReport ?? null),
      acceptance: summarizeAcceptance(evidence.currentDoctor.acceptanceResults),
      replay: summarizeReplay(evidence.currentDoctor.replayResults),
      inputLiveness: clone(evidence.currentDoctor.inputActionLiveness ?? null),
      runtimeJoins: clone(evidence.currentDoctor.runtimeJoinPlan ?? null),
      gameplayProgram: { present: gameplayInspection.present, errors: gameplayInspection.errors, warnings: gameplayInspection.warnings, metrics: gameplayInspection.metrics, effectTypes: gameplayEffectTypes(gameplayInspection.program) },
      visualReadiness: clone(evidence.currentDoctor.visualReadiness ?? null),
      standaloneAudit: clone(standaloneAudit),
    },
    judgmentResidue: clone(taskDefinition.judgmentResidue),
    notTasteEvidence: NOT_TASTE_EVIDENCE,
  };
  return { ...receiptWithoutDigest, receiptDigest: canonicalSha256(receiptWithoutDigest) };
}

export function validateBuilderBenchmarkReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return { valid: false, errors: ["Benchmark receipt must be one object."] };
  if (receipt.schemaVersion !== LOOPLAB_BUILDER_BENCHMARK_RUN_SCHEMA) errors.push("Benchmark receipt schemaVersion is unsupported.");
  if (!/^sha256:[a-f0-9]{64}$/.test(String(receipt.receiptDigest ?? ""))) errors.push("Benchmark receiptDigest is missing or malformed.");
  else {
    const projection = { ...receipt };
    delete projection.receiptDigest;
    if (canonicalSha256(projection) !== receipt.receiptDigest) errors.push("Benchmark receiptDigest does not match the exact receipt content.");
  }
  let taskDefinition = null;
  try { taskDefinition = getBuilderBenchmark(receipt?.benchmark?.id); } catch (error) { errors.push(error.message); }
  if (taskDefinition && (receipt.benchmark.revision !== taskDefinition.revision || receipt.benchmark.taskDigest !== taskDefinition.taskDigest)) errors.push("Benchmark task revision/digest does not match the current visible contract.");
  if (!/^source-[a-f0-9]{64}$/.test(String(receipt.sourceDigest ?? ""))) errors.push("Benchmark receipt sourceDigest is missing or malformed.");
  if (receipt?.evidence?.doctor?.current?.sourceDigest !== receipt.sourceDigest || receipt?.evidence?.doctor?.release?.sourceDigest !== receipt.sourceDigest) errors.push("Benchmark Doctor evidence is not bound to the receipt sourceDigest.");
  if (receipt?.comparability?.key !== canonicalSha256({
    taskId: receipt?.benchmark?.id,
    taskRevision: receipt?.benchmark?.revision,
    taskDigest: receipt?.benchmark?.taskDigest,
    provider: receipt?.run?.provider,
    model: receipt?.run?.model ?? null,
    scaffold: receipt?.run?.scaffold,
    strategy: receipt?.run?.strategy ?? null,
    contextBudgetTokens: receipt?.run?.contextBudgetTokens ?? null,
  })) errors.push("Benchmark comparability key does not match the exact task/run identity.");
  try { normalizeBuilderBenchmarkRun(receipt.run, taskDefinition); } catch (error) { errors.push(error.message); }
  if (!Array.isArray(receipt.checks) || !Array.isArray(receipt.blockers)) errors.push("Benchmark receipt checks and blockers must be arrays.");
  return { valid: errors.length === 0, errors };
}

function validateReceiptSet(input, label) {
  if (!Array.isArray(input) || input.length < 1 || input.length > LOOPLAB_BUILDER_BENCHMARK_LIMITS.maximumRunsPerSide) throw new Error(`${label} must contain 1..${LOOPLAB_BUILDER_BENCHMARK_LIMITS.maximumRunsPerSide} benchmark receipts.`);
  for (const [index, receipt] of input.entries()) {
    const validation = validateBuilderBenchmarkReceipt(receipt);
    if (!validation.valid) throw new Error(`${label}[${index}] is invalid: ${validation.errors.join(" ")}`);
  }
  return input;
}

function trialSetSummary(receipts, label) {
  const provider = receipts[0].run.provider;
  if (receipts.some((receipt) => receipt.run.provider !== provider)) throw new Error(`${label} mixes providers.`);
  if (provider === "none") {
    if (receipts.length !== 1) throw new Error(`${label} provider-none evaluation must contain exactly one deterministic receipt.`);
    return { provider, kind: "deterministic", complete: true, trialSetId: null, trialCount: 1, indexes: [1] };
  }
  const trialSetIds = [...new Set(receipts.map((receipt) => receipt.run.trialSetId))];
  const trialCounts = [...new Set(receipts.map((receipt) => receipt.run.trialCount))];
  if (trialSetIds.length !== 1 || trialCounts.length !== 1) throw new Error(`${label} must contain one complete trial set identity.`);
  const trialCount = trialCounts[0];
  const indexes = receipts.map((receipt) => receipt.run.trialIndex).sort((a, b) => a - b);
  const expected = Array.from({ length: trialCount }, (_, index) => index + 1);
  if (receipts.length !== trialCount || indexes.some((value, index) => value !== expected[index])) throw new Error(`${label} is incomplete or contains duplicate/cherry-picked trial indexes; expected exactly 1..${trialCount}.`);
  return { provider, kind: "stochastic", complete: true, trialSetId: trialSetIds[0], trialCount, indexes };
}

function mean(values) {
  const numbers = values.filter((value) => Number.isFinite(value));
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}

function aggregateReceipts(receipts) {
  const passed = receipts.filter((receipt) => receipt.passed);
  return {
    runCount: receipts.length,
    passedCount: passed.length,
    passRate: passed.length / receipts.length,
    meanRequiredScore: mean(receipts.map((receipt) => receipt.technicalFitness.requiredScore)),
    meanCurrentDoctorScore: mean(receipts.map((receipt) => receipt.evidence.doctor.current.score)),
    meanReleaseDoctorScore: mean(receipts.map((receipt) => receipt.evidence.doctor.release.score)),
    meanInputTokens: mean(receipts.map((receipt) => receipt.run.usage.inputTokens)),
    meanOutputTokens: mean(receipts.map((receipt) => receipt.run.usage.outputTokens)),
    meanTotalTokens: mean(receipts.map((receipt) => receipt.run.usage.totalTokens)),
    meanRateEquivalentUsd: mean(receipts.map((receipt) => receipt.run.usage.rateEquivalentUsd)),
    meanToolCalls: mean(receipts.map((receipt) => receipt.run.toolCalls)),
    meanRetries: mean(receipts.map((receipt) => receipt.run.retries)),
    meanWallTimeMs: mean(receipts.map((receipt) => receipt.run.wallTimeMs)),
    blockerCounts: Object.fromEntries([...new Set(receipts.flatMap((receipt) => receipt.blockers.map((blocker) => blocker.id)))].sort().map((id) => [id, receipts.filter((receipt) => receipt.blockers.some((blocker) => blocker.id === id)).length])),
  };
}

function delta(candidate, baseline) {
  if (!Number.isFinite(candidate) || !Number.isFinite(baseline)) return null;
  return candidate - baseline;
}

export function compareBuilderBenchmarkRuns(baselineInput, candidateInput) {
  const baselineRuns = validateReceiptSet(baselineInput, "baselineRuns");
  const candidateRuns = validateReceiptSet(candidateInput, "candidateRuns");
  const all = [...baselineRuns, ...candidateRuns];
  const taskDigests = new Set(all.map((receipt) => receipt.benchmark.taskDigest));
  const comparabilityKeys = new Set(all.map((receipt) => receipt.comparability.key));
  if (taskDigests.size !== 1) throw new Error("Benchmark comparison requires the exact same visible task revision/digest.");
  if (comparabilityKeys.size !== 1) throw new Error("Benchmark comparison is confounded: provider, model, scaffold, strategy, or context budget differs.");
  const baselineTrials = trialSetSummary(baselineRuns, "baselineRuns");
  const candidateTrials = trialSetSummary(candidateRuns, "candidateRuns");
  if (baselineTrials.kind !== candidateTrials.kind || baselineTrials.trialCount !== candidateTrials.trialCount) throw new Error("Benchmark comparison requires matching deterministic/stochastic mode and trial counts.");
  const baseline = aggregateReceipts(baselineRuns);
  const candidate = aggregateReceipts(candidateRuns);
  const efficiencyEligible = baseline.passedCount === baseline.runCount && candidate.passedCount === candidate.runCount && baselineTrials.provider !== "none";
  const deltas = {
    passRate: delta(candidate.passRate, baseline.passRate),
    requiredScore: delta(candidate.meanRequiredScore, baseline.meanRequiredScore),
    currentDoctorScore: delta(candidate.meanCurrentDoctorScore, baseline.meanCurrentDoctorScore),
    releaseDoctorScore: delta(candidate.meanReleaseDoctorScore, baseline.meanReleaseDoctorScore),
    inputTokens: efficiencyEligible ? delta(candidate.meanInputTokens, baseline.meanInputTokens) : null,
    outputTokens: efficiencyEligible ? delta(candidate.meanOutputTokens, baseline.meanOutputTokens) : null,
    totalTokens: efficiencyEligible ? delta(candidate.meanTotalTokens, baseline.meanTotalTokens) : null,
    rateEquivalentUsd: efficiencyEligible ? delta(candidate.meanRateEquivalentUsd, baseline.meanRateEquivalentUsd) : null,
    toolCalls: efficiencyEligible ? delta(candidate.meanToolCalls, baseline.meanToolCalls) : null,
    retries: efficiencyEligible ? delta(candidate.meanRetries, baseline.meanRetries) : null,
    wallTimeMs: efficiencyEligible ? delta(candidate.meanWallTimeMs, baseline.meanWallTimeMs) : null,
  };
  const stochasticEnough = baselineTrials.kind === "stochastic" && baselineTrials.trialCount >= LOOPLAB_BUILDER_BENCHMARK_LIMITS.minimumStochasticTrials;
  let conclusion = baselineTrials.kind === "deterministic" ? "deterministic-delta" : stochasticEnough ? "unchanged" : "insufficient-trials";
  const reasons = [];
  if (deltas.passRate > 0 || (deltas.passRate === 0 && deltas.requiredScore > 0)) { reasons.push("technical-fitness-improved"); if (stochasticEnough) conclusion = "improved"; }
  if (deltas.passRate < 0 || (deltas.passRate === 0 && deltas.requiredScore < 0)) { reasons.push("technical-fitness-regressed"); if (stochasticEnough) conclusion = "regressed"; }
  if (efficiencyEligible && deltas.totalTokens < 0) reasons.push("gate-equivalent-token-use-decreased");
  if (efficiencyEligible && deltas.totalTokens > 0) reasons.push("gate-equivalent-token-use-increased");
  if (efficiencyEligible && deltas.rateEquivalentUsd < 0) reasons.push("gate-equivalent-rate-equivalent-cost-decreased");
  if (efficiencyEligible && deltas.rateEquivalentUsd > 0) reasons.push("gate-equivalent-rate-equivalent-cost-increased");
  if (stochasticEnough && reasons.includes("technical-fitness-improved") && reasons.includes("gate-equivalent-token-use-increased")) conclusion = "mixed";
  if (stochasticEnough && reasons.includes("technical-fitness-regressed") && reasons.includes("gate-equivalent-token-use-decreased")) conclusion = "mixed";
  const comparisonWithoutDigest = {
    schemaVersion: LOOPLAB_BUILDER_BENCHMARK_COMPARISON_SCHEMA,
    suite: clone(baselineRuns[0].suite),
    benchmark: clone(baselineRuns[0].benchmark),
    comparability: clone(baselineRuns[0].comparability),
    builderVersions: {
      baseline: [...new Set(baselineRuns.map((receipt) => `${receipt.builder.protocolVersion}/${receipt.builder.runtimeVersion}`))],
      candidate: [...new Set(candidateRuns.map((receipt) => `${receipt.builder.protocolVersion}/${receipt.builder.runtimeVersion}`))],
      treatedAsIndependentVariable: true,
    },
    trials: { baseline: baselineTrials, candidate: candidateTrials, minimumForStochasticClaim: LOOPLAB_BUILDER_BENCHMARK_LIMITS.minimumStochasticTrials },
    conclusion,
    claimStrength: baselineTrials.kind === "deterministic" ? "one-exact-candidate-delta" : stochasticEnough ? "provisional-repeated-trials" : "insufficient-trials",
    reasons,
    baseline,
    candidate,
    deltas,
    efficiency: { eligible: efficiencyEligible, reason: efficiencyEligible ? "Every run on both sides passed the same technical gate." : "Efficiency is withheld unless both complete run sets pass the same technical gate." },
    receiptDigests: { baseline: baselineRuns.map((receipt) => receipt.receiptDigest), candidate: candidateRuns.map((receipt) => receipt.receiptDigest) },
    notTasteEvidence: NOT_TASTE_EVIDENCE,
  };
  return { ...comparisonWithoutDigest, comparisonDigest: canonicalSha256(comparisonWithoutDigest) };
}
