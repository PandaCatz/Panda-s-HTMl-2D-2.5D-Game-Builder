import { canonicalSha256 } from "./looplab-canonical-digest.mjs";
import { assertProviderPayloadPrivacy } from "./looplab-project-privacy.mjs";

export const LOOPLAB_LOCAL_COPILOT_STATUS_SCHEMA = "looplab-local-copilot-status/v1";
export const LOOPLAB_LOCAL_COPILOT_ADVICE_SCHEMA = "looplab-local-copilot-advice/v1";
export const LOOPLAB_LOCAL_COPILOT_USAGE_SCHEMA = "looplab-local-copilot-usage/v1";
export const LOOPLAB_LOCAL_COPILOT_MODES = Object.freeze([
  "summarize-context",
  "critique-plan",
  "identify-risks",
  "suggest-next-actions",
]);
export const LOOPLAB_LOCAL_COPILOT_LIMITS = Object.freeze({
  taskCharacters: 4_000,
  contextCharacters: 40_000,
  sourceDigestCharacters: 160,
  models: 64,
  observations: 10,
  suggestions: 8,
  uncertainties: 8,
  outputTokens: 2_500,
});
export const LOOPLAB_LOCAL_COPILOT_POLICY = Object.freeze({
  advisoryOnly: true,
  mutatesProject: false,
  verificationEvidence: false,
  collisionAuthority: false,
  toolExecution: false,
  providerReplacement: false,
  stateless: true,
  remoteEndpointsAllowed: false,
  projectSecretsAllowed: false,
  generatedCommandsAreReviewed: false,
});

const DEFAULT_ENDPOINTS = Object.freeze([
  Object.freeze({ id: "ollama", label: "Ollama", origin: "http://127.0.0.1:11434", docsUrl: "https://docs.ollama.com/api/openai-compatibility" }),
  Object.freeze({ id: "lm-studio", label: "LM Studio", origin: "http://127.0.0.1:1234", docsUrl: "https://lmstudio.ai/docs/developer" }),
]);

const ADVICE_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 2_000 },
    observations: {
      type: "array",
      maxItems: LOOPLAB_LOCAL_COPILOT_LIMITS.observations,
      items: {
        type: "object",
        properties: {
          title: { type: "string", minLength: 1, maxLength: 160 },
          detail: { type: "string", minLength: 1, maxLength: 1_000 },
          confidence: { enum: ["high", "medium", "low"] },
        },
        required: ["title", "detail", "confidence"],
        additionalProperties: false,
      },
    },
    suggestions: {
      type: "array",
      maxItems: LOOPLAB_LOCAL_COPILOT_LIMITS.suggestions,
      items: {
        type: "object",
        properties: {
          title: { type: "string", minLength: 1, maxLength: 160 },
          rationale: { type: "string", minLength: 1, maxLength: 1_000 },
          priority: { enum: ["high", "medium", "low"] },
          proposedIntent: { type: "string", minLength: 1, maxLength: 600 },
        },
        required: ["title", "rationale", "priority", "proposedIntent"],
        additionalProperties: false,
      },
    },
    uncertainties: {
      type: "array",
      maxItems: LOOPLAB_LOCAL_COPILOT_LIMITS.uncertainties,
      items: { type: "string", minLength: 1, maxLength: 600 },
    },
  },
  required: ["summary", "observations", "suggestions", "uncertainties"],
  additionalProperties: false,
});

function boundedString(value, name, maximum, { required = false } = {}) {
  const normalized = String(value ?? "").trim();
  if (required && !normalized) throw new Error(`${name} must not be empty.`);
  if (normalized.length > maximum) throw new Error(`${name} exceeds the ${maximum.toLocaleString("en-US")} character limit.`);
  return normalized;
}

function loopbackHostname(hostname) {
  const normalized = String(hostname ?? "").toLowerCase();
  if (normalized === "localhost" || normalized === "127.0.0.1") return "127.0.0.1";
  if (normalized === "[::1]" || normalized === "::1") return "[::1]";
  throw new Error("Local copilot endpoints must use a literal loopback host (127.0.0.1 or ::1).");
}

export function normalizeLocalCopilotOrigin(value) {
  const input = boundedString(value, "Local copilot origin", 240, { required: true });
  let url;
  try { url = new URL(input); }
  catch { throw new Error("Local copilot origin must be a complete http:// loopback origin."); }
  if (url.protocol !== "http:") throw new Error("Local copilot endpoints must use loopback HTTP.");
  if (url.username || url.password) throw new Error("Local copilot origins cannot contain URL credentials.");
  if (url.search || url.hash) throw new Error("Local copilot origins cannot contain a query or fragment.");
  if (url.pathname !== "/") throw new Error("Local copilot origin must not contain an endpoint path.");
  const hostname = loopbackHostname(url.hostname);
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("Local copilot origin requires an explicit valid port.");
  return `http://${hostname}:${port}`;
}

function configuredEndpoints(env) {
  const explicit = String(env.LOOPLAB_LOCAL_AI_URL ?? env.LOOPLAB_LOCAL_COPILOT_URL ?? "").trim();
  if (!explicit) return DEFAULT_ENDPOINTS.map((entry) => ({ ...entry }));
  const origin = normalizeLocalCopilotOrigin(explicit);
  const engine = boundedString(env.LOOPLAB_LOCAL_AI_ENGINE ?? "openai-compatible", "Local copilot engine", 80, { required: true }).toLowerCase();
  return [{
    id: engine.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "openai-compatible",
    label: boundedString(env.LOOPLAB_LOCAL_AI_LABEL ?? "Local OpenAI-compatible AI", "Local copilot label", 120, { required: true }),
    origin,
    docsUrl: null,
    configured: true,
  }];
}

function modelIds(value) {
  const data = Array.isArray(value?.data) ? value.data : [];
  return [...new Set(data.map((entry) => String(entry?.id ?? "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, LOOPLAB_LOCAL_COPILOT_LIMITS.models);
}

async function inspectEndpoint(endpoint, { fetcher, token, timeoutMs }) {
  try {
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetcher(`${endpoint.origin}/v1/models`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { ...endpoint, reachable: true, ready: false, state: "blocked", models: [], detail: `${endpoint.label} returned HTTP ${response.status} from its local models endpoint.` };
    }
    const models = modelIds(await response.json());
    if (!models.length) return { ...endpoint, reachable: true, ready: false, state: "needs-model", models, detail: `${endpoint.label} is reachable but reports no available chat model.` };
    return { ...endpoint, reachable: true, ready: true, state: "ready", models, detail: `${endpoint.label} is reachable on loopback and reports ${models.length} model${models.length === 1 ? "" : "s"}.` };
  } catch {
    return { ...endpoint, reachable: false, ready: false, state: "unavailable", models: [], detail: `${endpoint.label} did not answer its loopback models endpoint.` };
  }
}

function chooseCandidate(candidates, configuredModel) {
  const ready = candidates.filter((candidate) => candidate.ready);
  if (!ready.length) return null;
  if (configuredModel) return ready.find((candidate) => candidate.models.includes(configuredModel)) ?? ready[0];
  return ready[0];
}

export async function inspectLocalCopilot({ env = process.env, fetcher = fetch } = {}) {
  const timeoutValue = Number(env.LOOPLAB_LOCAL_AI_SCAN_TIMEOUT_MS ?? 1_500);
  const timeoutMs = Number.isFinite(timeoutValue) ? Math.max(250, Math.min(5_000, Math.floor(timeoutValue))) : 1_500;
  let token = "";
  let configuredModel = "";
  let endpoints = [];
  try {
    token = boundedString(env.LOOPLAB_LOCAL_AI_TOKEN ?? "", "Local copilot access token", 4_096);
    configuredModel = boundedString(env.LOOPLAB_LOCAL_AI_MODEL ?? "", "Configured local model", 240);
    endpoints = configuredEndpoints(env);
  } catch (error) {
    return {
      schemaVersion: LOOPLAB_LOCAL_COPILOT_STATUS_SCHEMA,
      checkedAt: new Date().toISOString(),
      state: "blocked",
      ready: false,
      engine: null,
      label: "Local AI copilot",
      origin: null,
      model: null,
      availableModels: [],
      authenticated: Boolean(token),
      authentication: token ? "local access token present" : "not required",
      summary: "Local AI configuration is invalid",
      detail: error instanceof Error ? error.message : "Local AI configuration could not be validated.",
      candidates: [],
      policy: LOOPLAB_LOCAL_COPILOT_POLICY,
    };
  }
  const candidates = await Promise.all(endpoints.map((endpoint) => inspectEndpoint(endpoint, { fetcher, token, timeoutMs })));
  const selected = chooseCandidate(candidates, configuredModel);
  const configuredModelAvailable = !configuredModel || Boolean(selected?.models.includes(configuredModel));
  const model = configuredModelAvailable && configuredModel ? configuredModel : selected?.models[0] ?? null;
  const reachable = candidates.some((candidate) => candidate.reachable);
  const endpointBlocked = candidates.some((candidate) => candidate.state === "blocked");
  const state = selected ? (configuredModelAvailable ? "ready" : "blocked") : endpointBlocked ? "blocked" : reachable ? "needs-model" : "unavailable";
  const ready = state === "ready" && Boolean(model);
  return {
    schemaVersion: LOOPLAB_LOCAL_COPILOT_STATUS_SCHEMA,
    checkedAt: new Date().toISOString(),
    state,
    ready,
    engine: selected?.id ?? null,
    label: selected?.label ?? "Local AI copilot",
    origin: selected?.origin ?? null,
    model,
    availableModels: selected?.models ?? [],
    authenticated: Boolean(token),
    authentication: token ? "local access token present" : "not required",
    summary: ready
      ? `${selected.label} local AI is ready`
      : state === "blocked"
        ? configuredModel
          ? `Configured local model ${configuredModel} was not found`
          : "A local AI server rejected model discovery"
        : reachable
          ? "A local AI server is reachable but needs a chat model"
          : "No supported local AI server was detected",
    detail: ready
      ? `${model} will be used only for bounded advisory work. It cannot mutate projects or produce verification evidence.`
      : state === "blocked"
        ? configuredModel
          ? `Set LOOPLAB_LOCAL_AI_MODEL to one of the reported model IDs, then scan again.`
          : "Check the local server's access policy and LOOPLAB_LOCAL_AI_TOKEN, then scan again. LoopLab will not weaken or bypass local authentication."
        : reachable
          ? "Load or download a chat model in the local runtime, then scan again. LoopLab will not download one during detection."
          : "Start Ollama on 127.0.0.1:11434, LM Studio on 127.0.0.1:1234, or configure LOOPLAB_LOCAL_AI_URL to another loopback OpenAI-compatible server.",
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      origin: candidate.origin,
      state: candidate.state,
      reachable: candidate.reachable,
      ready: candidate.ready,
      models: candidate.models,
      detail: candidate.detail,
      docsUrl: candidate.docsUrl ?? null,
    })),
    policy: LOOPLAB_LOCAL_COPILOT_POLICY,
  };
}

export function normalizeLocalCopilotRequest(payload = {}) {
  const requestedMode = payload.mode ?? "suggest-next-actions";
  if (!LOOPLAB_LOCAL_COPILOT_MODES.includes(requestedMode)) throw new Error(`Local copilot mode must be one of: ${LOOPLAB_LOCAL_COPILOT_MODES.join(", ")}.`);
  const mode = requestedMode;
  const task = boundedString(payload.task ?? payload.goal, "Local copilot task", LOOPLAB_LOCAL_COPILOT_LIMITS.taskCharacters, { required: true });
  const sourceDigest = boundedString(payload.sourceDigest ?? "", "sourceDigest", LOOPLAB_LOCAL_COPILOT_LIMITS.sourceDigestCharacters);
  const model = boundedString(payload.model ?? "", "Local copilot model", 240);
  const context = payload.context ?? {};
  if (!context || typeof context !== "object" || Array.isArray(context)) throw new Error("Local copilot context must be one JSON object.");
  const contextJson = JSON.stringify(context);
  if (contextJson.length > LOOPLAB_LOCAL_COPILOT_LIMITS.contextCharacters) throw new Error(`Local copilot context exceeds the ${LOOPLAB_LOCAL_COPILOT_LIMITS.contextCharacters.toLocaleString("en-US")} character limit.`);
  if (/data:image\//i.test(contextJson)) throw new Error("Local copilot context cannot contain image data URLs.");
  return { mode, task, sourceDigest: sourceDigest || null, model: model || null, context: JSON.parse(contextJson), contextCharacters: contextJson.length };
}

function exactKeys(value, expected, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${name} does not match the strict local-copilot output schema.`);
}

function validatedText(value, name, maximum) {
  const normalized = boundedString(value, name, maximum, { required: true });
  return normalized;
}

export function validateLocalCopilotAdvice(value) {
  exactKeys(value, ["summary", "observations", "suggestions", "uncertainties"], "Local copilot response");
  if (!Array.isArray(value.observations) || value.observations.length > LOOPLAB_LOCAL_COPILOT_LIMITS.observations) throw new Error("Local copilot observations are invalid or unbounded.");
  if (!Array.isArray(value.suggestions) || value.suggestions.length > LOOPLAB_LOCAL_COPILOT_LIMITS.suggestions) throw new Error("Local copilot suggestions are invalid or unbounded.");
  if (!Array.isArray(value.uncertainties) || value.uncertainties.length > LOOPLAB_LOCAL_COPILOT_LIMITS.uncertainties) throw new Error("Local copilot uncertainties are invalid or unbounded.");
  const observations = value.observations.map((entry, index) => {
    exactKeys(entry, ["title", "detail", "confidence"], `Observation ${index + 1}`);
    if (!["high", "medium", "low"].includes(entry.confidence)) throw new Error(`Observation ${index + 1} has an invalid confidence.`);
    return { id: `observation-${index + 1}`, title: validatedText(entry.title, `Observation ${index + 1} title`, 160), detail: validatedText(entry.detail, `Observation ${index + 1} detail`, 1_000), confidence: entry.confidence };
  });
  const suggestions = value.suggestions.map((entry, index) => {
    exactKeys(entry, ["title", "rationale", "priority", "proposedIntent"], `Suggestion ${index + 1}`);
    if (!["high", "medium", "low"].includes(entry.priority)) throw new Error(`Suggestion ${index + 1} has an invalid priority.`);
    return { id: `suggestion-${index + 1}`, title: validatedText(entry.title, `Suggestion ${index + 1} title`, 160), rationale: validatedText(entry.rationale, `Suggestion ${index + 1} rationale`, 1_000), priority: entry.priority, proposedIntent: validatedText(entry.proposedIntent, `Suggestion ${index + 1} proposedIntent`, 600) };
  });
  const uncertainties = value.uncertainties.map((entry, index) => validatedText(entry, `Uncertainty ${index + 1}`, 600));
  return { summary: validatedText(value.summary, "Local copilot summary", 2_000), observations, suggestions, uncertainties };
}

function localUsage(responseUsage, { engine, model }) {
  const inputTokens = Number(responseUsage?.prompt_tokens);
  const outputTokens = Number(responseUsage?.completion_tokens);
  const totalTokens = Number(responseUsage?.total_tokens);
  const measured = [inputTokens, outputTokens, totalTokens].some((value) => Number.isFinite(value) && value >= 0);
  return {
    schemaVersion: LOOPLAB_LOCAL_COPILOT_USAGE_SCHEMA,
    provider: "local-copilot",
    engine,
    model,
    source: "loopback-openai-compatible",
    measured,
    billingMode: "local",
    inputTokens: Number.isFinite(inputTokens) && inputTokens >= 0 ? inputTokens : null,
    outputTokens: Number.isFinite(outputTokens) && outputTokens >= 0 ? outputTokens : null,
    totalTokens: Number.isFinite(totalTokens) && totalTokens >= 0 ? totalTokens : null,
    estimatedUsd: 0,
    estimateKind: "local-no-provider-charge",
    actualChargeClaimed: false,
    note: "Local inference has no LoopLab provider-token charge. Electricity and hardware costs are not estimated.",
  };
}

export async function runLocalCopilot(requestInput, { status, env = process.env, fetcher = fetch, signal } = {}) {
  const request = normalizeLocalCopilotRequest(requestInput);
  if (!status?.ready || !status.origin || !status.engine) throw new Error(status?.detail ?? "No local AI copilot is ready.");
  const model = request.model ?? status.model;
  if (!model || !status.availableModels.includes(model)) throw new Error("Requested local copilot model is not available in the selected local engine.");
  const system = [
    "You are LoopLab's bounded local advisory copilot for 2D and sprite-based 2.5D HTML game authoring.",
    "Return only the requested JSON object. Never claim you ran code, inspected files outside the supplied context, changed a project, proved collision, or passed Doctor, replay, acceptance, browser, visual, or release gates.",
    "Do not emit shell commands, executable code, tool calls, provider credentials, or direct project mutation commands.",
    "Suggestions are natural-language intents for Codex or Claude to inspect and independently validate.",
  ].join(" ");
  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ mode: request.mode, task: request.task, sourceDigest: request.sourceDigest, context: request.context }) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "looplab_local_copilot_advice", strict: true, schema: ADVICE_SCHEMA } },
    temperature: 0.2,
    max_tokens: LOOPLAB_LOCAL_COPILOT_LIMITS.outputTokens,
    stream: false,
  };
  assertProviderPayloadPrivacy(body, { label: "local-copilot payload", sourceDigest: request.sourceDigest });
  const token = String(env.LOOPLAB_LOCAL_AI_TOKEN ?? "").trim();
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetcher(`${status.origin}/v1/chat/completions`, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify(body),
  });
  let envelope;
  try { envelope = await response.json(); }
  catch { envelope = null; }
  if (!response.ok) throw new Error(`Local AI returned HTTP ${response.status}; the project was not changed.`);
  const content = envelope?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Local AI returned no structured advice; the project was not changed.");
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { throw new Error("Local AI did not return valid JSON; the project was not changed."); }
  const advice = validateLocalCopilotAdvice(parsed);
  return {
    schemaVersion: LOOPLAB_LOCAL_COPILOT_ADVICE_SCHEMA,
    createdAt: new Date().toISOString(),
    taskDigest: canonicalSha256({ mode: request.mode, task: request.task, sourceDigest: request.sourceDigest, context: request.context }),
    sourceDigest: request.sourceDigest,
    mode: request.mode,
    engine: status.engine,
    model,
    ...advice,
    usage: localUsage(envelope?.usage, { engine: status.engine, model }),
    policy: LOOPLAB_LOCAL_COPILOT_POLICY,
  };
}

export function localCopilotJsonSchema() {
  return JSON.parse(JSON.stringify(ADVICE_SCHEMA));
}
