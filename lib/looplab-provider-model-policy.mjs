import { canonicalSha256 } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_PROVIDER_MODEL_POLICY_SCHEMA = "looplab-provider-model-policy/v1";
export const LOOPLAB_PROVIDER_MODEL_SELECTION_SCHEMA = "looplab-provider-model-selection/v1";
export const LOOPLAB_VISUAL_MODEL_BENCHMARK_SCHEMA = "looplab-visual-model-benchmark/v1";
export const LOOPLAB_VISUAL_MODEL_BENCHMARK_PROFILE = Object.freeze({
  schemaVersion: "looplab-visual-model-benchmark-profile/v1",
  id: "grounded-visual-critique/v1",
  purpose: "visual-critique",
  baselineModel: "claude-opus-5",
  minimumMatchedTrials: 3,
  minimumSonnetPreferenceRate: 2 / 3,
  minimumMeanScoreAdvantage: 1,
  requiredEvidence: Object.freeze([
    "same exact capture set",
    "same exact prompt and rubric",
    "blinded pairwise preference",
    "source-bound visual-quality scores",
  ]),
});
export const LOOPLAB_VISUAL_MODEL_BENCHMARK_PROFILE_DIGEST = canonicalSha256(LOOPLAB_VISUAL_MODEL_BENCHMARK_PROFILE);

export const LOOPLAB_PROVIDER_PURPOSES = Object.freeze([
  "prompt-draft",
  "game-iteration",
  "research",
  "visual-critique",
  "operability-smoke",
]);

const VALID_EFFORTS = Object.freeze(["low", "medium", "high", "xhigh", "max"]);
const PURPOSE_ENV_SUFFIX = Object.freeze({
  "prompt-draft": "PROMPT",
  "game-iteration": "ITERATION",
  research: "RESEARCH",
  "visual-critique": "VISION",
  "operability-smoke": "SMOKE",
});
const SHA256_RECEIPT = /^sha256:[a-f0-9]{64}$/;

export const LOOPLAB_PROVIDER_MODEL_POLICY = Object.freeze({
  schemaVersion: LOOPLAB_PROVIDER_MODEL_POLICY_SCHEMA,
  codexCli: Object.freeze({
    defaultModel: "gpt-5.6-sol",
    defaultEffort: "max",
    modelSemantics: "Pin the flagship GPT-5.6 Sol model for every LoopLab Codex CLI workload unless the user explicitly configures a task-specific override.",
    effortSemantics: "Pass model_reasoning_effort=max on every launch by default; never inherit an unknown user-config effort.",
  }),
  claudeCli: Object.freeze({
    defaultModel: "claude-opus-5",
    defaultEffort: "max",
    modelSemantics: "Pin Claude Opus 5 for every LoopLab Claude Code workload unless the user explicitly configures a task-specific override.",
    effortSemantics: "Pass --effort max on every launch by default; never inherit an unknown session effort.",
  }),
  visualCritique: Object.freeze({
    defaultClaudeModel: "claude-opus-5",
    defaultAnthropicApiModel: "claude-opus-5",
    alternateModelFamily: "sonnet",
    benchmarkSchemaVersion: LOOPLAB_VISUAL_MODEL_BENCHMARK_SCHEMA,
    benchmarkProfile: LOOPLAB_VISUAL_MODEL_BENCHMARK_PROFILE,
    benchmarkProfileDigest: LOOPLAB_VISUAL_MODEL_BENCHMARK_PROFILE_DIGEST,
    sonnetEligibility: "Sonnet is eligible only when an explicit full model ID is bound to a content-verified matched visual-critique benchmark receipt in which Sonnet beats Claude Opus 5. Cost, quota, overload, or latency alone cannot silently downgrade an Opus critique.",
    silentFallbackAllowed: false,
  }),
});

function normalizedPurpose(value) {
  return LOOPLAB_PROVIDER_PURPOSES.includes(value) ? value : "game-iteration";
}

function configuredValue(entries) {
  for (const [value, source] of entries) {
    if (typeof value === "string" && value.trim()) return { value: value.trim(), source };
  }
  return null;
}

function normalizedEffort(value, fallback) {
  const effort = String(value ?? "").trim().toLowerCase();
  return VALID_EFFORTS.includes(effort) ? effort : fallback;
}

function isSonnetModel(value) {
  return /^(?:sonnet|claude-sonnet(?:-|$))/i.test(String(value ?? "").trim());
}

function visualEvidenceDigest(value) {
  const digest = String(value ?? "").trim().toLowerCase();
  return SHA256_RECEIPT.test(digest) ? digest : null;
}

function finiteScore(value) {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}

function normalizedBenchmarkReceiptPayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return {
    schemaVersion: input.schemaVersion,
    profileDigest: input.profileDigest,
    purpose: input.purpose,
    candidateModel: input.candidateModel,
    evaluator: input.evaluator,
    trials: input.trials,
    conclusion: input.conclusion,
  };
}

export function createVisualModelBenchmarkReceipt(input = {}) {
  const payload = {
    schemaVersion: LOOPLAB_VISUAL_MODEL_BENCHMARK_SCHEMA,
    profileDigest: LOOPLAB_VISUAL_MODEL_BENCHMARK_PROFILE_DIGEST,
    purpose: "visual-critique",
    candidateModel: input.candidateModel,
    evaluator: input.evaluator,
    trials: input.trials,
    conclusion: input.conclusion,
  };
  return { ...payload, receiptDigest: canonicalSha256(payload) };
}

export function validateVisualModelBenchmarkReceipt(receipt, { requestedModel } = {}) {
  const errors = [];
  const payload = normalizedBenchmarkReceiptPayload(receipt);
  if (!payload) return { eligible: false, digest: null, candidateModel: null, metrics: null, errors: ["benchmark receipt must be an object"] };
  if (payload.schemaVersion !== LOOPLAB_VISUAL_MODEL_BENCHMARK_SCHEMA) errors.push(`schemaVersion must be ${LOOPLAB_VISUAL_MODEL_BENCHMARK_SCHEMA}`);
  if (payload.profileDigest !== LOOPLAB_VISUAL_MODEL_BENCHMARK_PROFILE_DIGEST) errors.push("profileDigest does not match LoopLab's frozen visual-critique benchmark profile");
  if (payload.purpose !== "visual-critique") errors.push("purpose must be visual-critique");
  const candidateModel = String(payload.candidateModel ?? "").trim();
  if (!/^claude-sonnet-[a-z0-9.-]+$/i.test(candidateModel)) errors.push("candidateModel must be an exact claude-sonnet-* model ID, not an alias");
  if (requestedModel && String(requestedModel).trim() !== candidateModel) errors.push("candidateModel must exactly match the requested Sonnet model");
  const evaluatorKind = String(payload.evaluator?.kind ?? "").trim();
  const evaluatorDigest = visualEvidenceDigest(payload.evaluator?.rubricDigest);
  if (!["human-blinded", "frozen-pairwise-rubric"].includes(evaluatorKind)) errors.push("evaluator.kind must be human-blinded or frozen-pairwise-rubric");
  if (!evaluatorDigest) errors.push("evaluator.rubricDigest must be a sha256 digest");
  if (payload.conclusion !== "sonnet-better") errors.push("conclusion must be sonnet-better");

  const trials = Array.isArray(payload.trials) ? payload.trials : [];
  if (trials.length < LOOPLAB_VISUAL_MODEL_BENCHMARK_PROFILE.minimumMatchedTrials) errors.push(`at least ${LOOPLAB_VISUAL_MODEL_BENCHMARK_PROFILE.minimumMatchedTrials} matched trials are required`);
  const trialIds = new Set();
  const inputDigests = new Set();
  let sonnetWins = 0;
  let opusWins = 0;
  let ties = 0;
  let opusScoreTotal = 0;
  let sonnetScoreTotal = 0;
  let validScoreCount = 0;
  for (const [index, trial] of trials.entries()) {
    const label = `trial ${index + 1}`;
    const id = String(trial?.id ?? "").trim();
    const inputDigest = visualEvidenceDigest(trial?.inputDigest);
    const evaluationDigest = visualEvidenceDigest(trial?.evaluationDigest);
    if (!id || trialIds.has(id)) errors.push(`${label} must have a unique id`);
    if (id) trialIds.add(id);
    if (!inputDigest || inputDigests.has(inputDigest)) errors.push(`${label} must have a unique sha256 inputDigest for its matched capture/prompt pair`);
    if (inputDigest) inputDigests.add(inputDigest);
    if (!evaluationDigest) errors.push(`${label} evaluationDigest must be a sha256 digest`);
    if (trial?.opus?.model !== LOOPLAB_VISUAL_MODEL_BENCHMARK_PROFILE.baselineModel) errors.push(`${label} Opus model must be ${LOOPLAB_VISUAL_MODEL_BENCHMARK_PROFILE.baselineModel}`);
    if (trial?.sonnet?.model !== candidateModel) errors.push(`${label} Sonnet model must match candidateModel`);
    if (trial?.opus?.hardFailure === true || trial?.sonnet?.hardFailure === true) errors.push(`${label} cannot qualify a visual-quality comparison after either model has a hard failure`);
    const opusScore = finiteScore(trial?.opus?.score);
    const sonnetScore = finiteScore(trial?.sonnet?.score);
    if (opusScore === null || sonnetScore === null) errors.push(`${label} must contain 0..100 Opus and Sonnet scores`);
    else {
      opusScoreTotal += opusScore;
      sonnetScoreTotal += sonnetScore;
      validScoreCount += 1;
    }
    if (trial?.preference === "sonnet") sonnetWins += 1;
    else if (trial?.preference === "opus") opusWins += 1;
    else if (trial?.preference === "tie") ties += 1;
    else errors.push(`${label} preference must be opus, sonnet, or tie`);
  }
  const decisiveTrials = sonnetWins + opusWins;
  const sonnetPreferenceRate = decisiveTrials ? sonnetWins / decisiveTrials : 0;
  const opusMeanScore = validScoreCount ? opusScoreTotal / validScoreCount : 0;
  const sonnetMeanScore = validScoreCount ? sonnetScoreTotal / validScoreCount : 0;
  const meanScoreAdvantage = sonnetMeanScore - opusMeanScore;
  if (sonnetWins <= opusWins || sonnetPreferenceRate < LOOPLAB_VISUAL_MODEL_BENCHMARK_PROFILE.minimumSonnetPreferenceRate) errors.push("Sonnet must win at least two thirds of decisive matched preferences and more trials than Opus");
  if (meanScoreAdvantage < LOOPLAB_VISUAL_MODEL_BENCHMARK_PROFILE.minimumMeanScoreAdvantage) errors.push(`Sonnet's mean score must beat Opus by at least ${LOOPLAB_VISUAL_MODEL_BENCHMARK_PROFILE.minimumMeanScoreAdvantage} point`);
  const digest = visualEvidenceDigest(receipt?.receiptDigest);
  const expectedDigest = canonicalSha256(payload);
  if (!digest || digest !== expectedDigest) errors.push("receiptDigest does not match the canonical benchmark receipt content");
  return {
    eligible: errors.length === 0,
    digest: errors.length === 0 ? digest : null,
    candidateModel: candidateModel || null,
    metrics: { trialCount: trials.length, sonnetWins, opusWins, ties, sonnetPreferenceRate, opusMeanScore, sonnetMeanScore, meanScoreAdvantage },
    errors,
  };
}

function assertEvidenceBackedVisualModel(model, evidenceReceipt, providerLabel) {
  if (!isSonnetModel(model)) return null;
  const validation = validateVisualModelBenchmarkReceipt(evidenceReceipt, { requestedModel: model });
  if (!validation.eligible) {
    throw new Error(`${providerLabel} visual critique may use Sonnet only when LOOPLAB_VISUAL_CRITIQUE_MODEL_BENCHMARK points to a content-verified matched benchmark receipt proving that exact model beats Claude Opus 5. ${validation.errors.join("; ") || "No qualifying receipt was provided."}`);
  }
  return validation;
}

export function resolveCodexCliModelPolicy({ purpose, env = process.env, model, effort } = {}) {
  const normalized = normalizedPurpose(purpose);
  const suffix = PURPOSE_ENV_SUFFIX[normalized];
  const selectedModel = configuredValue([
    [model, "call"],
    [env?.[`LOOPLAB_CODEX_${suffix}_MODEL`], `LOOPLAB_CODEX_${suffix}_MODEL`],
    [env?.LOOPLAB_CODEX_MODEL, "LOOPLAB_CODEX_MODEL"],
    [LOOPLAB_PROVIDER_MODEL_POLICY.codexCli.defaultModel, "policy-default"],
  ]);
  const selectedEffort = configuredValue([
    [effort, "call"],
    [env?.[`LOOPLAB_CODEX_${suffix}_REASONING_EFFORT`], `LOOPLAB_CODEX_${suffix}_REASONING_EFFORT`],
    [env?.LOOPLAB_CODEX_REASONING_EFFORT, "LOOPLAB_CODEX_REASONING_EFFORT"],
    [LOOPLAB_PROVIDER_MODEL_POLICY.codexCli.defaultEffort, "policy-default"],
  ]);
  const resolvedEffort = normalizedEffort(selectedEffort?.value, LOOPLAB_PROVIDER_MODEL_POLICY.codexCli.defaultEffort);
  return {
    schemaVersion: LOOPLAB_PROVIDER_MODEL_SELECTION_SCHEMA,
    provider: "codex",
    transport: "cli",
    purpose: normalized,
    model: selectedModel.value,
    effort: resolvedEffort,
    modelSource: selectedModel.source,
    effortSource: VALID_EFFORTS.includes(String(selectedEffort?.value).toLowerCase()) ? selectedEffort.source : "policy-default",
    selectionReason: selectedModel.source === "policy-default"
      ? "LoopLab's quality-first Codex CLI default is GPT-5.6 Sol at maximum reasoning effort."
      : `The explicit ${selectedModel.source} model override was applied with an explicit ${resolvedEffort} reasoning launch setting.`,
    silentModelFallbackAllowed: false,
    evidenceDigest: null,
  };
}

export function resolveClaudeCliModelPolicy({ purpose, env = process.env, model, effort, sonnetEvidenceReceipt } = {}) {
  const normalized = normalizedPurpose(purpose);
  const suffix = PURPOSE_ENV_SUFFIX[normalized];
  const selectedModel = configuredValue([
    [model, "call"],
    [env?.[`LOOPLAB_CLAUDE_${suffix}_MODEL`], `LOOPLAB_CLAUDE_${suffix}_MODEL`],
    [env?.LOOPLAB_CLAUDE_MODEL, "LOOPLAB_CLAUDE_MODEL"],
    [LOOPLAB_PROVIDER_MODEL_POLICY.claudeCli.defaultModel, "policy-default"],
  ]);
  const selectedEffort = configuredValue([
    [effort, "call"],
    [env?.[`LOOPLAB_CLAUDE_${suffix}_EFFORT`], `LOOPLAB_CLAUDE_${suffix}_EFFORT`],
    [env?.LOOPLAB_CLAUDE_EFFORT, "LOOPLAB_CLAUDE_EFFORT"],
    [LOOPLAB_PROVIDER_MODEL_POLICY.claudeCli.defaultEffort, "policy-default"],
  ]);
  const resolvedEffort = normalizedEffort(selectedEffort?.value, LOOPLAB_PROVIDER_MODEL_POLICY.claudeCli.defaultEffort);
  const evidence = normalized === "visual-critique"
    ? assertEvidenceBackedVisualModel(
      selectedModel.value,
      sonnetEvidenceReceipt,
      "Claude CLI",
    )
    : null;
  return {
    schemaVersion: LOOPLAB_PROVIDER_MODEL_SELECTION_SCHEMA,
    provider: "claude",
    transport: "cli",
    purpose: normalized,
    model: selectedModel.value,
    effort: resolvedEffort,
    modelSource: selectedModel.source,
    effortSource: VALID_EFFORTS.includes(String(selectedEffort?.value).toLowerCase()) ? selectedEffort.source : "policy-default",
    selectionReason: normalized === "visual-critique" && evidence
      ? `Sonnet was explicitly selected for visual critique after matched benchmark receipt ${evidence.digest} proved that exact model beat Claude Opus 5 across ${evidence.metrics.trialCount} trials.`
      : normalized === "visual-critique"
        ? "Visual critique is an intelligence-sensitive multimodal judgment task, so LoopLab defaults to Claude Opus 5 at maximum effort."
        : selectedModel.source === "policy-default"
          ? "LoopLab's quality-first Claude CLI default is Claude Opus 5 at maximum effort."
          : `The explicit ${selectedModel.source} model override was applied with an explicit ${resolvedEffort} effort launch setting.`,
    silentModelFallbackAllowed: false,
    evidenceDigest: evidence?.digest ?? null,
  };
}

export function resolveAnthropicVisualModelPolicy({ env = process.env, model, sonnetEvidenceReceipt } = {}) {
  const selectedModel = configuredValue([
    [model, "call"],
    [env?.LOOPLAB_ANTHROPIC_VISION_MODEL, "LOOPLAB_ANTHROPIC_VISION_MODEL"],
    [LOOPLAB_PROVIDER_MODEL_POLICY.visualCritique.defaultAnthropicApiModel, "policy-default"],
  ]);
  const evidence = assertEvidenceBackedVisualModel(
    selectedModel.value,
    sonnetEvidenceReceipt,
    "Anthropic API",
  );
  return {
    schemaVersion: LOOPLAB_PROVIDER_MODEL_SELECTION_SCHEMA,
    provider: "anthropic",
    transport: "api",
    purpose: "visual-critique",
    model: selectedModel.value,
    effort: null,
    modelSource: selectedModel.source,
    effortSource: null,
    selectionReason: evidence
      ? `Sonnet was explicitly selected for visual critique after matched benchmark receipt ${evidence.digest} proved that exact model beat Claude Opus 5 across ${evidence.metrics.trialCount} trials.`
      : "Anthropic-family visual critique defaults to Claude Opus 5; no Sonnet downgrade is implicit.",
    silentModelFallbackAllowed: false,
    evidenceDigest: evidence?.digest ?? null,
  };
}

export function buildCodexCliInvocation(baseArgs, options = {}) {
  if (!Array.isArray(baseArgs)) throw new Error("Codex CLI invocation requires an argument array.");
  const execIndex = baseArgs.indexOf("exec");
  if (execIndex < 0) throw new Error("Codex CLI model policy requires an exec subcommand.");
  if (baseArgs.some((entry) => entry === "-m" || entry === "--model" || String(entry).startsWith("model_reasoning_effort="))) {
    throw new Error("Codex CLI base arguments must not contain a competing model or reasoning-effort override.");
  }
  const modelPolicy = resolveCodexCliModelPolicy(options);
  return {
    args: [
      ...baseArgs.slice(0, execIndex + 1),
      "--model",
      modelPolicy.model,
      "--config",
      `model_reasoning_effort=${JSON.stringify(modelPolicy.effort)}`,
      ...baseArgs.slice(execIndex + 1),
    ],
    modelPolicy,
  };
}

export function createProviderModelSelectionReceipt(modelPolicy, { providerReportedModel = null } = {}) {
  if (!modelPolicy || typeof modelPolicy !== "object") return null;
  return {
    schemaVersion: LOOPLAB_PROVIDER_MODEL_SELECTION_SCHEMA,
    provider: modelPolicy.provider,
    transport: modelPolicy.transport,
    purpose: modelPolicy.purpose,
    requestedModel: modelPolicy.model,
    requestedEffort: modelPolicy.effort,
    launchModel: modelPolicy.model,
    launchEffort: modelPolicy.effort,
    providerReportedModel: typeof providerReportedModel === "string" && providerReportedModel.trim() ? providerReportedModel.trim() : null,
    providerReportedEffort: null,
    effortEvidence: modelPolicy.effort ? "explicit-launch-argument" : "not-applicable",
    modelSource: modelPolicy.modelSource,
    effortSource: modelPolicy.effortSource,
    selectionReason: modelPolicy.selectionReason,
    silentModelFallbackAllowed: modelPolicy.silentModelFallbackAllowed === true,
    evidenceDigest: modelPolicy.evidenceDigest ?? null,
  };
}
