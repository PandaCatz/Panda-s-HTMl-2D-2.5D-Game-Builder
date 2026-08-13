import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const USAGE_RECEIPT_VERSION = "looplab-ai-usage/v1";
export const OPENAI_PRICING_AS_OF = "2026-08-08";

const OPENAI_PRICING = Object.freeze({
  "gpt-5.6-sol": Object.freeze({
    inputPerMillion: 5,
    cachedInputPerMillion: 0.5,
    outputPerMillion: 30,
    cacheWriteMultiplier: 1.25,
    longContextThreshold: 272_000,
    longInputMultiplier: 2,
    longOutputMultiplier: 1.5,
    sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-sol",
  }),
  "gpt-5.6-terra": Object.freeze({
    inputPerMillion: 2.5,
    cachedInputPerMillion: 0.25,
    outputPerMillion: 15,
    cacheWriteMultiplier: 1.25,
    longContextThreshold: 272_000,
    longInputMultiplier: 2,
    longOutputMultiplier: 1.5,
    sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-terra",
  }),
  "gpt-5.6-luna": Object.freeze({
    inputPerMillion: 1,
    cachedInputPerMillion: 0.1,
    outputPerMillion: 6,
    cacheWriteMultiplier: 1.25,
    longContextThreshold: 272_000,
    longInputMultiplier: 2,
    longOutputMultiplier: 1.5,
    sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-luna",
  }),
  "gpt-5.2": Object.freeze({
    inputPerMillion: 1.75,
    cachedInputPerMillion: 0.175,
    outputPerMillion: 14,
    cacheWriteMultiplier: 1,
    sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.2",
  }),
});

function tokenCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function firstTokenCount(...values) {
  for (const value of values) {
    const count = tokenCount(value);
    if (count !== null) return count;
  }
  return null;
}

function normalizeModelName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function pricingForModel(model) {
  const normalized = normalizeModelName(model);
  if (!normalized) return null;
  if (normalized === "gpt-5.6" || normalized.startsWith("gpt-5.6-sol")) return { model: "gpt-5.6-sol", ...OPENAI_PRICING["gpt-5.6-sol"] };
  if (normalized.startsWith("gpt-5.6-terra")) return { model: "gpt-5.6-terra", ...OPENAI_PRICING["gpt-5.6-terra"] };
  if (normalized.startsWith("gpt-5.6-luna")) return { model: "gpt-5.6-luna", ...OPENAI_PRICING["gpt-5.6-luna"] };
  if (normalized === "gpt-5.2" || normalized.startsWith("gpt-5.2-")) return { model: "gpt-5.2", ...OPENAI_PRICING["gpt-5.2"] };
  return null;
}

export function normalizeProviderUsage(raw = {}) {
  const usage = raw && typeof raw === "object" ? raw : {};
  const inputDetails = usage.input_tokens_details ?? usage.inputTokensDetails ?? {};
  const outputDetails = usage.output_tokens_details ?? usage.outputTokensDetails ?? {};
  const inputTokens = firstTokenCount(usage.input_tokens, usage.inputTokens, usage.prompt_tokens, usage.promptTokens);
  const cachedInputTokens = firstTokenCount(
    usage.cached_input_tokens,
    usage.cachedInputTokens,
    usage.cache_read_input_tokens,
    usage.cacheReadInputTokens,
    inputDetails.cached_tokens,
    inputDetails.cachedTokens,
  ) ?? 0;
  const cacheWriteTokens = firstTokenCount(
    usage.cache_write_tokens,
    usage.cacheWriteTokens,
    usage.cache_write_input_tokens,
    usage.cacheWriteInputTokens,
    usage.cache_creation_input_tokens,
    usage.cacheCreationInputTokens,
    inputDetails.cache_write_tokens,
    inputDetails.cacheWriteTokens,
  ) ?? 0;
  const outputTokens = firstTokenCount(usage.output_tokens, usage.outputTokens, usage.completion_tokens, usage.completionTokens);
  const reasoningTokens = firstTokenCount(
    usage.reasoning_tokens,
    usage.reasoningTokens,
    usage.reasoning_output_tokens,
    usage.reasoningOutputTokens,
    outputDetails.reasoning_tokens,
    outputDetails.reasoningTokens,
  ) ?? 0;
  const separateCacheAccounting = [
    usage.cache_read_input_tokens,
    usage.cacheReadInputTokens,
    usage.cache_creation_input_tokens,
    usage.cacheCreationInputTokens,
  ].some((value) => tokenCount(value) !== null);
  const promptTokens = firstTokenCount(usage.prompt_tokens, usage.promptTokens)
    ?? (inputTokens !== null || (separateCacheAccounting && (cachedInputTokens > 0 || cacheWriteTokens > 0))
      ? (inputTokens ?? 0) + (separateCacheAccounting ? cachedInputTokens + cacheWriteTokens : 0)
      : null);
  const derivedTotal = promptTokens !== null || outputTokens !== null
    ? (promptTokens ?? 0) + (outputTokens ?? 0)
    : null;
  const totalTokens = firstTokenCount(usage.total_tokens, usage.totalTokens) ?? derivedTotal;
  return { inputTokens, promptTokens, cachedInputTokens, cacheWriteTokens, outputTokens, reasoningTokens, totalTokens };
}

function estimateOpenAiUsd(model, usage) {
  const pricing = pricingForModel(model);
  if (!pricing || usage.inputTokens === null || usage.outputTokens === null) return { estimatedUsd: null, pricing: null };
  const longContextApplied = Boolean(pricing.longContextThreshold && usage.inputTokens > pricing.longContextThreshold);
  const inputMultiplier = longContextApplied ? pricing.longInputMultiplier : 1;
  const outputMultiplier = longContextApplied ? pricing.longOutputMultiplier : 1;
  const cachedInputTokens = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const cacheWriteTokens = Math.min(usage.cacheWriteTokens, Math.max(0, usage.inputTokens - cachedInputTokens));
  const uncachedInputTokens = Math.max(0, usage.inputTokens - cachedInputTokens - cacheWriteTokens);
  const inputCost = uncachedInputTokens * pricing.inputPerMillion * inputMultiplier / 1_000_000;
  const cachedCost = cachedInputTokens * pricing.cachedInputPerMillion * inputMultiplier / 1_000_000;
  const cacheWriteCost = cacheWriteTokens * pricing.inputPerMillion * pricing.cacheWriteMultiplier * inputMultiplier / 1_000_000;
  const outputCost = usage.outputTokens * pricing.outputPerMillion * outputMultiplier / 1_000_000;
  return {
    estimatedUsd: Number((inputCost + cachedCost + cacheWriteCost + outputCost).toFixed(8)),
    pricing: {
      currency: "USD",
      asOf: OPENAI_PRICING_AS_OF,
      sourceUrl: pricing.sourceUrl,
      canonicalModel: pricing.model,
      inputPerMillion: pricing.inputPerMillion * inputMultiplier,
      cachedInputPerMillion: pricing.cachedInputPerMillion * inputMultiplier,
      cacheWritePerMillion: pricing.inputPerMillion * pricing.cacheWriteMultiplier * inputMultiplier,
      outputPerMillion: pricing.outputPerMillion * outputMultiplier,
      longContextApplied,
    },
  };
}

function billingModeForProvider(provider, authMethod) {
  if (provider !== "codex" && provider !== "claude") return "api";
  const normalized = String(authMethod ?? "").trim().toLowerCase();
  if (/api[ -]?key|access token|console account|bedrock|vertex/.test(normalized)) return "api";
  return "subscription";
}

export function createUsageReceipt({ provider, model, usage, source = "provider-reported", providerReportedUsd = null, authMethod = null, modelSelection = null } = {}) {
  const normalizedUsage = normalizeProviderUsage(usage);
  const billingMode = billingModeForProvider(provider, authMethod);
  const subscriptionBacked = billingMode === "subscription";
  const openAiProvider = provider === "openai" || provider === "codex";
  const estimate = openAiProvider ? estimateOpenAiUsd(model, normalizedUsage) : { estimatedUsd: null, pricing: null };
  const reportedUsd = Number(providerReportedUsd);
  const hasReportedUsd = providerReportedUsd !== null && providerReportedUsd !== undefined && Number.isFinite(reportedUsd) && reportedUsd >= 0;
  const estimatedUsd = hasReportedUsd ? Number(reportedUsd.toFixed(8)) : estimate.estimatedUsd;
  const measured = normalizedUsage.totalTokens !== null;
  return {
    schemaVersion: USAGE_RECEIPT_VERSION,
    provider: provider ?? "unknown",
    model: model ?? null,
    source,
    measured,
    billingMode,
    authMethod: typeof authMethod === "string" && authMethod.trim() ? authMethod.trim() : null,
    ...normalizedUsage,
    estimatedUsd,
    estimateKind: hasReportedUsd ? "provider-reported" : estimate.pricing ? (subscriptionBacked ? "api-rate-equivalent" : "standard-api-rate-estimate") : "unavailable",
    pricing: hasReportedUsd ? null : estimate.pricing,
    actualChargeClaimed: false,
    modelSelection: modelSelection && typeof modelSelection === "object" ? modelSelection : null,
    note: subscriptionBacked
      ? estimatedUsd === null
        ? "This CLI run used a signed-in subscription session. Token pricing was unavailable, so no dollar amount was invented."
        : "This CLI run used a signed-in subscription session. The dollar figure is a standard API-rate equivalent, not an additional CLI charge."
      : estimatedUsd === null
        ? "The provider reported token usage, but Looplab has no verified price for this model. No dollar amount was invented."
        : "The dollar figure estimates token charges at the listed standard API rates; separate tool-call or non-token fees are not included.",
  };
}

export function attachUsageReceipt(error, receipt) {
  const normalized = error instanceof Error ? error : new Error(String(error));
  if (receipt && typeof receipt === "object") normalized.usageReceipt = receipt;
  return normalized;
}

function collectUsageCandidates(value, candidates, models, depth = 0) {
  if (!value || typeof value !== "object" || depth > 6) return;
  if (typeof value.model === "string") models.push(value.model);
  if (value.usage && typeof value.usage === "object") candidates.push(value.usage);
  for (const nested of Object.values(value)) collectUsageCandidates(nested, candidates, models, depth + 1);
}

function textTokenCount(text, label) {
  const match = String(text ?? "").match(new RegExp(`${label}\\s*(?::|=|\\r?\\n)\\s*([0-9][0-9,]*)`, "i"));
  return match ? tokenCount(match[1].replaceAll(",", "")) : null;
}

export function usageFromCliOutput(stdout, stderr = "") {
  const candidates = [];
  const models = [];
  for (const line of String(stdout ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    try { collectUsageCandidates(JSON.parse(line), candidates, models); }
    catch { /* Non-JSON progress output is handled by the text fallback. */ }
  }
  const combined = `${stdout ?? ""}\n${stderr ?? ""}`;
  const configuredModel = combined.match(/^\s*model\s*:\s*([^\s]+)\s*$/im)?.[1] ?? null;
  if (candidates.length) return { usage: normalizeProviderUsage(candidates.at(-1)), model: models.at(-1) ?? configuredModel };
  const inputTokens = textTokenCount(combined, "input tokens?");
  const cachedInputTokens = textTokenCount(combined, "cached input tokens?");
  const outputTokens = textTokenCount(combined, "output tokens?");
  const reasoningTokens = textTokenCount(combined, "reasoning tokens?");
  const totalTokens = textTokenCount(combined, "(?:total )?tokens used");
  return {
    usage: normalizeProviderUsage({ input_tokens: inputTokens, cached_input_tokens: cachedInputTokens, output_tokens: outputTokens, reasoning_tokens: reasoningTokens, total_tokens: totalTokens }),
    model: models.at(-1) ?? configuredModel,
  };
}

export async function readCodexConfiguredModel({ env = process.env, homeDirectory = homedir() } = {}) {
  const codexDirectory = env.CODEX_HOME || join(homeDirectory, ".codex");
  try {
    const config = await readFile(join(codexDirectory, "config.toml"), "utf8");
    return config.match(/^\s*model\s*=\s*["']([^"']+)["']\s*$/m)?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

export function aggregateUsageReceipts(receipts, { provider = "mixed", model = "multiple", label = "loop-total" } = {}) {
  const usable = (Array.isArray(receipts) ? receipts : []).filter((receipt) => receipt && typeof receipt === "object");
  const sum = (key) => usable.reduce((total, receipt) => total + (tokenCount(receipt[key]) ?? 0), 0);
  const measuredRuns = usable.filter((receipt) => receipt.measured).length;
  const pricedRuns = usable.filter((receipt) => receipt.estimatedUsd !== null && receipt.estimatedUsd !== undefined && Number.isFinite(Number(receipt.estimatedUsd))).length;
  const estimatedUsd = pricedRuns ? Number(usable.reduce((total, receipt) => total + (receipt.estimatedUsd !== null && receipt.estimatedUsd !== undefined && Number.isFinite(Number(receipt.estimatedUsd)) ? Number(receipt.estimatedUsd) : 0), 0).toFixed(8)) : null;
  return {
    schemaVersion: USAGE_RECEIPT_VERSION,
    kind: label,
    provider,
    model,
    source: "aggregate",
    billingMode: usable.every((receipt) => receipt.billingMode === "subscription") ? "subscription" : usable.every((receipt) => receipt.billingMode === "api") ? "api" : "mixed",
    runCount: usable.length,
    measuredRuns,
    pricedRuns,
    unpricedRuns: usable.length - pricedRuns,
    measured: usable.length > 0 && measuredRuns === usable.length,
    inputTokens: sum("inputTokens"),
    promptTokens: sum("promptTokens"),
    cachedInputTokens: sum("cachedInputTokens"),
    cacheWriteTokens: sum("cacheWriteTokens"),
    outputTokens: sum("outputTokens"),
    reasoningTokens: sum("reasoningTokens"),
    totalTokens: sum("totalTokens"),
    estimatedUsd,
    estimateKind: pricedRuns === usable.length && usable.length ? "aggregate" : pricedRuns ? "partial-aggregate" : "unavailable",
    pricing: null,
    actualChargeClaimed: false,
    note: usable.every((receipt) => receipt.billingMode === "subscription")
      ? "Loop total across all attempts. Dollar figures are API-rate equivalents for subscription-backed CLI runs, not additional CLI charges."
      : "Loop total across all attempts. Dollar figures sum the available per-run estimates; separate tool-call or non-token fees are not included.",
  };
}

export function usageReceiptSummary(receipt, prefix = "Usage") {
  if (!receipt) return `${prefix}: unavailable`;
  const tokens = receipt.measured ? Number(receipt.totalTokens ?? 0).toLocaleString("en-US") : "unavailable";
  const usd = receipt.estimatedUsd !== null && receipt.estimatedUsd !== undefined && Number.isFinite(Number(receipt.estimatedUsd)) ? `$${Number(receipt.estimatedUsd).toFixed(6)}` : "USD unavailable";
  const runs = receipt.runCount ? ` across ${receipt.runCount} run${receipt.runCount === 1 ? "" : "s"}` : "";
  return `${prefix}: ${tokens} tokens${runs} · ${usd}${receipt.billingMode === "subscription" ? " API-equivalent" : " estimated"}`;
}
