import { canonicalSha256 } from "./looplab-canonical-digest.mjs";
import { LOOPLAB_PROVIDER_FAILOVER_POLICY, LOOPLAB_PROVIDER_PATHS as PROVIDER_PATHS } from "./looplab-provider-routing.mjs";

export const LOOPLAB_PROVIDER_PARITY_SCHEMA = "looplab-provider-parity/v2";
export const LOOPLAB_PROVIDER_PARITY_RECEIPT_SCHEMA = "looplab-provider-parity-receipt/v1";
export const LOOPLAB_PARITY_PROVIDERS = Object.freeze(["codex", "claude"]);
export const LOOPLAB_PROVIDER_PATHS = PROVIDER_PATHS;
export const LOOPLAB_PROVIDER_INDEPENDENCE_POLICY = Object.freeze({
  paths: LOOPLAB_PROVIDER_PATHS,
  pathMeaning: Object.freeze({ codex: "Codex CLI", openai: "OpenAI API", claude: "Claude Code CLI", anthropic: "Anthropic API" }),
  failureIsolation: "A missing, blocked, unauthenticated, outdated, or failed provider path changes only that path's readiness. It never blocks scanning, selecting, or running another ready path.",
  vendorIsolation: "Codex/OpenAI availability never depends on Claude/Anthropic availability, and Claude/Anthropic availability never depends on Codex/OpenAI availability.",
  transportIsolation: "Within one vendor, CLI login and direct API credentials are independent. Either ready transport may operate without the other.",
  selection: "Every creative job records one requested provider path, then resolves one actual ready path under the shared strict-or-fallback route policy immediately before submission.",
  fallback: LOOPLAB_PROVIDER_FAILOVER_POLICY.provenance,
  fallbackOrder: LOOPLAB_PROVIDER_FAILOVER_POLICY.preference,
  strictMode: LOOPLAB_PROVIDER_FAILOVER_POLICY.strictMode,
});

const SHARED_SEMANTICS = Object.freeze({
  projectSelection: "The selected project and protected variation are resolved before provider selection. Providers cannot infer or change the target project.",
  durableJob: "Prompt, research, one-pass generation, and iterative work use the same companion-owned retained job lifecycle with one submission, one job ID, observable events, cancellation, and terminal result.",
  context: "Both providers receive the same bounded provider context, pass plan, authored source truth, capability route, specialist receipt requirements, and objective constraints.",
  structuredOutput: "Both providers must return one schema-constrained object. Free-form success, malformed output, truncation, refusal, and missing structured output are rejected before mutation.",
  authoringAuthority: "Neither provider edits the selected project directly. Provider commands pass through the same canonical command dispatcher, validation, source-digest rules, and authored collision/support/traversal boundaries.",
  evaluation: "The same evaluation profile is selected once from the starting authored project and frozen for every candidate, independent of provider identity.",
  acceptance: "Both providers face identical schema validity, hard gates, per-dimension regression protection, minimum delta, deterministic runtime playtest, Doctor, acceptance, replay, completion, join, browser, and release evidence policies.",
  preservation: "The previous best verified candidate remains authoritative unless a candidate passes the shared acceptance contract. Rejected output cannot mutate the protected best.",
  receipts: "Accepted and rejected attempts retain the same source-bound evaluation, comparison, provider-parity, and usage receipt shapes.",
  usage: "Both providers report measured token usage when available. Subscription-backed CLI dollars are labelled API-rate equivalents; missing usage is never invented.",
  headlessSurface: "Codex and Claude use the same manifest, MCP tools, CLI commands, browser bridge, DOM form/event transports, Project Doctor, browser harness, benchmark, and one-file exporter.",
});

const OPERATIONS = Object.freeze({
  "prompt-draft": Object.freeze({
    tools: "none",
    input: "same directed brief, existing prompt provenance, retry attempt, and required constraints",
    result: "same prompt-draft schema and post-provider validation",
  }),
  research: Object.freeze({
    tools: "read-only web research",
    input: "same question, selected research engine, depth, project context, and report schema",
    result: "same citation/source normalization, confidence, suggestion, Markdown, persistence, and usage contract",
  }),
  "game-loop": Object.freeze({
    tools: "none",
    input: "same compact project context, pass plan, specialist roster, goal, conditions, art policy, and frozen evaluator",
    result: "same iteration schema, canonical command application, comparison, rejection, checkpoint, and loop-total receipt",
  }),
});

const PROVIDER_TRANSPORTS = Object.freeze({
  codex: Object.freeze({
    contract: "looplab-codex-headless/v1",
    output: "schema-bound JSONL plus isolated response file",
    lifetime: "ephemeral",
    activity: "content-free allowlisted JSONL event and item types",
    promptAndLoopAuthority: "structured response only; no direct project mutation",
    researchAuthority: "read-only web discovery; no direct project mutation",
  }),
  claude: Object.freeze({
    contract: "looplab-claude-headless/v1",
    minimumVersion: "2.1.205",
    output: "schema-bound stream JSON with required final structured_output",
    lifetime: "nonpersistent safe mode",
    activity: "content-free allowlisted stream-JSON message and event types",
    promptAndLoopAuthority: "no tools; structured response only; no direct project mutation",
    researchAuthority: "WebSearch and WebFetch only; no direct project mutation",
  }),
});

const SHARED_CONTRACT_SUBJECT = Object.freeze({
  schemaVersion: LOOPLAB_PROVIDER_PARITY_SCHEMA,
  providers: LOOPLAB_PARITY_PROVIDERS,
  semantics: SHARED_SEMANTICS,
  operations: OPERATIONS,
});

export const LOOPLAB_PROVIDER_PARITY_SHARED_DIGEST = canonicalSha256(SHARED_CONTRACT_SUBJECT);

const clone = (value) => JSON.parse(JSON.stringify(value));

export function getProviderParityContract() {
  const contract = {
    ...clone(SHARED_CONTRACT_SUBJECT),
    sharedContractDigest: LOOPLAB_PROVIDER_PARITY_SHARED_DIGEST,
    providerTransports: clone(PROVIDER_TRANSPORTS),
    providerIndependence: clone(LOOPLAB_PROVIDER_INDEPENDENCE_POLICY),
    readinessPolicy: "A CLI is ready only when authenticated and able to satisfy its complete structured headless transport contract.",
    truthPolicy: "Neither provider may claim Doctor, replay, acceptance, browser, visual, benchmark, or export evidence that LoopLab did not execute independently.",
    parityBoundary: "Operational and authoring semantics are identical. Model creativity, wording, latency, token count, and candidate quality are intentionally not claimed to be identical.",
  };
  return { ...contract, contractDigest: canonicalSha256(contract) };
}

export function createProviderParityReceipt({ provider, operation = "game-loop", sourceDigest = null, evaluationProfile = null, passPlanId = null } = {}) {
  if (!LOOPLAB_PARITY_PROVIDERS.includes(provider)) return null;
  if (!Object.hasOwn(OPERATIONS, operation)) throw new Error(`Unknown provider parity operation: ${operation}.`);
  const profile = evaluationProfile && typeof evaluationProfile === "object"
    ? {
        id: typeof evaluationProfile.id === "string" ? evaluationProfile.id : null,
        digest: typeof evaluationProfile.digest === "string" ? evaluationProfile.digest : null,
      }
    : null;
  const receipt = {
    schemaVersion: LOOPLAB_PROVIDER_PARITY_RECEIPT_SCHEMA,
    contractVersion: LOOPLAB_PROVIDER_PARITY_SCHEMA,
    sharedContractDigest: LOOPLAB_PROVIDER_PARITY_SHARED_DIGEST,
    provider,
    providerTransport: clone(PROVIDER_TRANSPORTS[provider]),
    operation,
    operationSemantics: clone(OPERATIONS[operation]),
    sourceDigest: typeof sourceDigest === "string" ? sourceDigest : null,
    evaluationProfile: profile,
    passPlanId: typeof passPlanId === "string" ? passPlanId : null,
    guarantees: Object.keys(SHARED_SEMANTICS),
    semanticParity: true,
    outputIdentityClaimed: false,
  };
  return { ...receipt, receiptDigest: canonicalSha256(receipt) };
}
