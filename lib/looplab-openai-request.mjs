import { createHash } from "node:crypto";

function normalizedPurpose(value) {
  return String(value ?? "request").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "request";
}

export function openAiSupportsExplicitPromptCacheBreakpoints(model) {
  const match = String(model ?? "").toLowerCase().match(/^gpt-(\d+)(?:\.(\d+))?/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2] ?? 0);
  return major > 5 || (major === 5 && minor >= 6);
}

export function openAiPromptCacheKey({ purpose, developerPrompt }) {
  const digest = createHash("sha256").update(String(developerPrompt ?? ""), "utf8").digest("hex").slice(0, 24);
  return `looplab:${normalizedPurpose(purpose)}:${digest}`;
}

export function buildOpenAiResponsesRequest({
  model,
  purpose,
  developerPrompt,
  userInput,
  userContent,
  schema,
  schemaName,
  strict = true,
  tools,
  include,
}) {
  const explicitCache = openAiSupportsExplicitPromptCacheBreakpoints(model);
  const developerText = String(developerPrompt ?? "");
  const request = {
    model,
    store: false,
    prompt_cache_key: openAiPromptCacheKey({ purpose, developerPrompt: developerText }),
    input: [
      explicitCache
        ? {
            role: "developer",
            content: [{ type: "input_text", text: developerText, prompt_cache_breakpoint: { mode: "explicit" } }],
          }
        : { role: "developer", content: developerText },
      { role: "user", content: userContent === undefined ? String(userInput ?? "") : userContent },
    ],
  };
  if (explicitCache) request.prompt_cache_options = { mode: "explicit" };
  if (Array.isArray(tools) && tools.length) request.tools = tools;
  if (Array.isArray(include) && include.length) request.include = include;
  if (schema && schemaName) request.text = { format: { type: "json_schema", name: schemaName, strict: Boolean(strict), schema } };
  return request;
}

function openAiStructuredError(message, response) {
  const error = new Error(message);
  error.providerResponse = response;
  return error;
}

function openAiOutputParts(value) {
  return (Array.isArray(value?.output) ? value.output : [])
    .flatMap((item) => Array.isArray(item?.content) ? item.content : []);
}

export function requireOpenAiStructuredResult(value, label = "response") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw openAiStructuredError(`OpenAI API returned no ${label}.`, value);
  }
  if (value.status === "incomplete") {
    const reason = value.incomplete_details?.reason ? ` (${value.incomplete_details.reason})` : "";
    throw openAiStructuredError(`OpenAI API returned an incomplete ${label}${reason}; incomplete text is not schema output.`, value);
  }
  if (["failed", "cancelled", "queued", "in_progress"].includes(value.status)) {
    const detail = value.error?.message ? `: ${value.error.message}` : "";
    throw openAiStructuredError(`OpenAI API ${label} status was ${value.status}${detail}.`, value);
  }
  const parts = openAiOutputParts(value);
  const refusal = parts.filter((part) => part?.type === "refusal").map((part) => part.refusal).filter(Boolean).join("\n").trim();
  if (refusal) throw openAiStructuredError(`OpenAI API refused the ${label}; refusal text is not schema output.`, value);
  const outputText = typeof value.output_text === "string" && value.output_text.trim()
    ? value.output_text.trim()
    : parts.filter((part) => part?.type === "output_text").map((part) => part.text).filter((text) => typeof text === "string").join("\n").trim();
  if (!outputText) throw openAiStructuredError(`OpenAI API returned no structured ${label}.`, value);
  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw openAiStructuredError(`OpenAI API returned invalid structured JSON for the ${label}.`, value);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw openAiStructuredError(`OpenAI API returned a non-object ${label}.`, value);
  }
  return parsed;
}
