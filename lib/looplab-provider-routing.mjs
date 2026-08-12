export const LOOPLAB_PROVIDER_ROUTE_SCHEMA = "looplab-provider-route/v1";
export const LOOPLAB_PROVIDER_FAILOVER_RECEIPT_SCHEMA = "looplab-provider-failover-receipt/v1";
export const LOOPLAB_PROVIDER_PATHS = Object.freeze(["codex", "openai", "claude", "anthropic"]);
export const LOOPLAB_PROVIDER_ROUTE_MODES = Object.freeze(["fallback", "strict"]);

export const LOOPLAB_PROVIDER_PATH_META = Object.freeze({
  codex: Object.freeze({ label: "Codex CLI", vendor: "openai", transport: "cli" }),
  openai: Object.freeze({ label: "OpenAI API", vendor: "openai", transport: "api" }),
  claude: Object.freeze({ label: "Claude Code CLI", vendor: "anthropic", transport: "cli" }),
  anthropic: Object.freeze({ label: "Anthropic API", vendor: "anthropic", transport: "api" }),
});

export const LOOPLAB_PROVIDER_FAILOVER_POLICY = Object.freeze({
  schemaVersion: LOOPLAB_PROVIDER_ROUTE_SCHEMA,
  defaultMode: "fallback",
  paths: LOOPLAB_PROVIDER_PATHS,
  preference: "Use the requested provider path first. If it is unavailable, try the same vendor's other transport before crossing to the other vendor with the same transport kind, then its alternate transport.",
  strictMode: "Strict mode runs only the exact requested path and is reserved for provider-specific tests, comparisons, or explicit user locks.",
  runtimeFailure: "A failed provider proposal may be retried on the next ready path only while it remains an uncommitted proposal. The selected project is never mutated by the failed path.",
  provenance: "Fallback is never silent: requested path, actual path, ordered attempts, failure summaries, usage receipts, and whether fallback occurred remain observable in the job and console.",
  isolation: "CLI sessions and API credentials are independent. OpenAI-family and Anthropic-family failures never change another path's readiness or block its connection flow.",
  unsupportedOperations: "Fallback only considers paths that implement the requested operation. OpenAI image generation remains OpenAI-API-only until another installed path can return equivalent image bytes and measured provenance.",
});

const FALLBACK_ORDER = Object.freeze({
  codex: Object.freeze(["codex", "openai", "claude", "anthropic"]),
  openai: Object.freeze(["openai", "codex", "anthropic", "claude"]),
  claude: Object.freeze(["claude", "anthropic", "codex", "openai"]),
  anthropic: Object.freeze(["anthropic", "claude", "openai", "codex"]),
  auto: LOOPLAB_PROVIDER_PATHS,
});

function uniqueProviderPaths(values) {
  const seen = new Set();
  return values.filter((provider) => LOOPLAB_PROVIDER_PATHS.includes(provider) && !seen.has(provider) && seen.add(provider));
}

export function normalizeProviderRouteMode(value) {
  return LOOPLAB_PROVIDER_ROUTE_MODES.includes(value) ? value : LOOPLAB_PROVIDER_FAILOVER_POLICY.defaultMode;
}

export function providerFallbackOrder(requestedProvider = "auto", eligibleProviders = LOOPLAB_PROVIDER_PATHS) {
  const requested = LOOPLAB_PROVIDER_PATHS.includes(requestedProvider) ? requestedProvider : "auto";
  const eligible = new Set(uniqueProviderPaths(Array.isArray(eligibleProviders) ? eligibleProviders : LOOPLAB_PROVIDER_PATHS));
  return [...(FALLBACK_ORDER[requested] ?? FALLBACK_ORDER.auto)].filter((provider) => eligible.has(provider));
}

export function providerFamilyPaths(provider) {
  const vendor = LOOPLAB_PROVIDER_PATH_META[provider]?.vendor;
  if (!vendor) return [];
  return LOOPLAB_PROVIDER_PATHS.filter((candidate) => LOOPLAB_PROVIDER_PATH_META[candidate].vendor === vendor);
}

export function findRunningProviderConnection(connections, provider = null) {
  const values = connections instanceof Map
    ? [...connections.values()]
    : Array.isArray(connections)
      ? connections
      : [];
  return values.find((connection) => connection?.status === "running" && (!provider || connection.provider === provider)) ?? null;
}

/**
 * @param {unknown} scan
 * @param {{ requestedProvider?: string, mode?: "fallback" | "strict", attemptedProviders?: string[], eligibleProviders?: string[] }} options
 */
export function resolveProviderRoute(scan, {
  requestedProvider = "auto",
  mode = LOOPLAB_PROVIDER_FAILOVER_POLICY.defaultMode,
  attemptedProviders = [],
  eligibleProviders = LOOPLAB_PROVIDER_PATHS,
} = {}) {
  const normalizedRequested = LOOPLAB_PROVIDER_PATHS.includes(requestedProvider) ? requestedProvider : "auto";
  const normalizedMode = normalizeProviderRouteMode(mode);
  const attempted = new Set(uniqueProviderPaths(Array.isArray(attemptedProviders) ? attemptedProviders : []));
  const statuses = scan?.providers && typeof scan.providers === "object" ? scan.providers : scan ?? {};
  const completeOrder = providerFallbackOrder(normalizedRequested, eligibleProviders);
  const order = normalizedMode === "strict" && normalizedRequested !== "auto" ? completeOrder.slice(0, 1) : completeOrder;
  const candidates = order.map((provider, index) => {
    const status = statuses?.[provider] ?? {};
    const alreadyAttempted = attempted.has(provider);
    return {
      provider,
      label: LOOPLAB_PROVIDER_PATH_META[provider].label,
      vendor: LOOPLAB_PROVIDER_PATH_META[provider].vendor,
      transport: LOOPLAB_PROVIDER_PATH_META[provider].transport,
      rank: index + 1,
      ready: status.ready === true,
      state: typeof status.state === "string" ? status.state : "unknown",
      alreadyAttempted,
      usable: status.ready === true && !alreadyAttempted,
      summary: typeof status.summary === "string" ? status.summary : `${LOOPLAB_PROVIDER_PATH_META[provider].label} has not been checked`,
    };
  });
  const selected = candidates.find((candidate) => candidate.usable) ?? null;
  const requestedStatus = normalizedRequested === "auto" ? null : candidates.find((candidate) => candidate.provider === normalizedRequested) ?? null;
  const fallbackUsed = Boolean(selected && normalizedRequested !== "auto" && selected.provider !== normalizedRequested);
  const readyProviders = candidates.filter((candidate) => candidate.ready).map((candidate) => candidate.provider);
  const route = {
    schemaVersion: LOOPLAB_PROVIDER_ROUTE_SCHEMA,
    requestedProvider: normalizedRequested,
    mode: normalizedMode,
    selectedProvider: selected?.provider ?? null,
    fallbackUsed,
    readyProviders,
    attemptedProviders: [...attempted],
    candidates,
    allUnavailable: !selected,
    selectionReason: selected
      ? fallbackUsed
        ? `${requestedStatus?.label ?? normalizedRequested} is not usable for this attempt; ${selected.label} is the next verified ready path.`
        : normalizedRequested === "auto"
          ? `${selected.label} is the first verified ready path in automatic order.`
          : `${selected.label} is the requested verified ready path.`
      : normalizedMode === "strict" && normalizedRequested !== "auto"
        ? `${requestedStatus?.label ?? normalizedRequested} is not ready and strict mode forbids fallback.`
        : "No eligible provider path is both verified ready and unattempted.",
  };
  return route;
}

export function isRetryableProviderPathFailure(value) {
  const message = String(value?.message ?? value ?? "").toLowerCase();
  if (!message) return false;
  return /(?:\b(?:enoent|eacces|eperm|econn(?:reset|refused|aborted)|etimedout|timeout|timed out|network|socket|dns|fetch failed|rate limit|too many requests|overloaded|service unavailable|temporarily unavailable|authentication|unauthenticated|not logged in|needs? (?:login|sign-in)|invalid api key|api key|credential|permission denied|quota|insufficient[_ -]quota|billing|credits?|http (?:401|403|408|409|429|5\d\d)|exited with code)\b|could not be (?:launched|reached)|cannot run|not installed|returned no (?:output|response|structured)|invalid (?:json|structured)|malformed (?:json|response)|structured_output)/i.test(message);
}

export function createProviderFailoverReceipt({ requestedProvider = "auto", mode = "fallback", selectedProvider = null, attempts = [] } = {}) {
  const normalizedAttempts = (Array.isArray(attempts) ? attempts : []).map((attempt, index) => ({
    order: index + 1,
    provider: LOOPLAB_PROVIDER_PATHS.includes(attempt?.provider) ? attempt.provider : "unknown",
    status: ["selected", "running", "completed", "failed", "skipped"].includes(attempt?.status) ? attempt.status : "failed",
    reason: typeof attempt?.reason === "string" ? attempt.reason.slice(0, 1_000) : null,
    usage: attempt?.usage && typeof attempt.usage === "object" ? attempt.usage : null,
  }));
  const actualProvider = LOOPLAB_PROVIDER_PATHS.includes(selectedProvider) ? selectedProvider : normalizedAttempts.findLast?.((attempt) => attempt.status === "completed")?.provider ?? null;
  return {
    schemaVersion: LOOPLAB_PROVIDER_FAILOVER_RECEIPT_SCHEMA,
    requestedProvider: LOOPLAB_PROVIDER_PATHS.includes(requestedProvider) ? requestedProvider : "auto",
    mode: normalizeProviderRouteMode(mode),
    selectedProvider: actualProvider,
    fallbackUsed: Boolean(actualProvider && LOOPLAB_PROVIDER_PATHS.includes(requestedProvider) && actualProvider !== requestedProvider),
    attempts: normalizedAttempts,
    attemptCount: normalizedAttempts.length,
    policy: LOOPLAB_PROVIDER_FAILOVER_POLICY.provenance,
  };
}
