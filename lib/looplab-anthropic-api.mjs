const UNSUPPORTED_STRUCTURED_OUTPUT_KEYWORDS = new Set([
  "$schema",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
]);

function cloneForAnthropic(value) {
  if (Array.isArray(value)) return value.map(cloneForAnthropic);
  if (!value || typeof value !== "object") return value;
  const transformed = {};
  const retainedConstraints = [];
  for (const [key, child] of Object.entries(value)) {
    if (UNSUPPORTED_STRUCTURED_OUTPUT_KEYWORDS.has(key)) {
      if (key !== "$schema") retainedConstraints.push(`${key}=${JSON.stringify(child)}`);
      continue;
    }
    transformed[key] = cloneForAnthropic(child);
  }
  if (value.type === "object") transformed.additionalProperties = false;
  if (retainedConstraints.length) {
    const note = `LoopLab validates these application constraints after decoding: ${retainedConstraints.join(", ")}.`;
    transformed.description = [transformed.description, note].filter(Boolean).join(" ");
  }
  return transformed;
}

export function anthropicStructuredSchema(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new Error("Anthropic structured output requires a JSON object schema.");
  return cloneForAnthropic(schema);
}

export function anthropicStructuredThinking(model) {
  const normalized = String(model ?? "").trim().toLowerCase();
  if (/^claude-(?:fable|mythos)(?:-|$)/.test(normalized)) return { type: "adaptive" };
  return { type: "disabled" };
}

export function buildAnthropicMessagesRequest({ model, maxTokens, system, userInput, schema, tools = [], thinking = anthropicStructuredThinking(model) }) {
  return {
    model,
    max_tokens: maxTokens,
    thinking,
    system,
    messages: [{ role: "user", content: userInput }],
    ...(tools.length ? { tools } : {}),
    output_config: {
      format: {
        type: "json_schema",
        schema: anthropicStructuredSchema(schema),
      },
    },
  };
}

export function requireAnthropicStructuredResult(value, label = "response") {
  const fail = (message) => {
    const error = new Error(message);
    error.providerResponse = value;
    throw error;
  };
  if (!value || typeof value !== "object") fail(`Anthropic API returned no ${label}.`);
  if (value.stop_reason === "refusal") fail(`Anthropic API refused the ${label}; refusal text is not schema output.`);
  if (value.stop_reason === "max_tokens") fail(`Anthropic API truncated the ${label} at max_tokens; incomplete text is not schema output.`);
  if (value.stop_reason === "model_context_window_exceeded") fail(`Anthropic API exhausted the model context while generating the ${label}; incomplete text is not schema output.`);
  const outputText = value.content?.filter((content) => content?.type === "text").map((content) => content.text).join("\n").trim();
  if (!outputText) fail(`Anthropic API returned no structured ${label}.`);
  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    fail(`Anthropic API returned invalid structured JSON for the ${label}.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail(`Anthropic API returned a non-object ${label}.`);
  return parsed;
}
