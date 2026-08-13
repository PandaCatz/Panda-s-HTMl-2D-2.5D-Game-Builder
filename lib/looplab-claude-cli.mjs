import { resolveClaudeCliModelPolicy } from "./looplab-provider-model-policy.mjs";

export const CLAUDE_STRUCTURED_OUTPUT_MIN_VERSION = "2.1.205";

function parseVersion(value) {
  const match = String(value ?? "").match(/(?:^|\s)(\d+)\.(\d+)\.(\d+)(?:\s|$)/);
  return match ? match.slice(1, 4).map((part) => Number(part)) : null;
}

function compareVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const difference = Number(left?.[index] ?? 0) - Number(right?.[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

export function claudeHeadlessCapabilities(versionOutput) {
  const versionParts = parseVersion(versionOutput);
  const minimumParts = parseVersion(CLAUDE_STRUCTURED_OUTPUT_MIN_VERSION);
  const structuredOutputReliable = Boolean(versionParts && minimumParts && compareVersion(versionParts, minimumParts) >= 0);
  return {
    contract: "looplab-claude-headless/v1",
    version: versionParts ? versionParts.join(".") : null,
    minimumVersion: CLAUDE_STRUCTURED_OUTPUT_MIN_VERSION,
    parityReady: structuredOutputReliable,
    structuredOutput: structuredOutputReliable,
    streamJson: structuredOutputReliable,
    nonPersistentSessions: structuredOutputReliable,
    deterministicPermissions: structuredOutputReliable,
    measuredUsage: structuredOutputReliable,
    reason: structuredOutputReliable
      ? "Claude Code supports LoopLab's schema-bound, stream-JSON, nonpersistent headless contract."
      : `Claude Code ${CLAUDE_STRUCTURED_OUTPUT_MIN_VERSION} or newer is required for reliable structured headless output.`,
  };
}

function normalizedTools(tools) {
  return [...new Set((Array.isArray(tools) ? tools : []).map((tool) => String(tool).trim()).filter(Boolean))];
}
function cloneForClaudeCli(value) {
  if (Array.isArray(value)) return value.map(cloneForClaudeCli);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "$schema")
    .map(([key, child]) => [key, cloneForClaudeCli(child)]));
}

export function claudeCliStructuredSchema(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new Error("Claude CLI requires one JSON Schema object.");
  return cloneForClaudeCli(schema);
}


export function buildClaudeCliInvocation({ prompt, schema, maxTurns = 3, tools = [], model, effort, maxBudgetUsd, purpose = "game-iteration", env = process.env, sonnetEvidenceReceipt } = {}) {
  if (typeof prompt !== "string" || !prompt.trim()) throw new Error("Claude CLI requires a non-empty prompt.");
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new Error("Claude CLI requires one JSON Schema object.");
  const turnLimit = Math.max(1, Math.min(100, Math.floor(Number(maxTurns) || 3)));
  const toolNames = normalizedTools(tools);
  const modelPolicy = resolveClaudeCliModelPolicy({ purpose, env, model, effort, sonnetEvidenceReceipt });
  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--json-schema",
    JSON.stringify(claudeCliStructuredSchema(schema)),
    "--no-session-persistence",
    "--safe-mode",
    "--no-chrome",
    "--permission-mode",
    "dontAsk",
    "--strict-mcp-config",
    "--tools",
    toolNames.join(","),
  ];
  if (toolNames.length) args.push("--allowedTools", toolNames.join(","));
  args.push("--model", modelPolicy.model, "--effort", modelPolicy.effort);
  const budget = Number(maxBudgetUsd);
  if (Number.isFinite(budget) && budget > 0) args.push("--max-budget-usd", String(budget));
  args.push("--max-turns", String(turnLimit));
  return { args, modelPolicy };
}

export function buildClaudeCliArgs(options = {}) {
  return buildClaudeCliInvocation(options).args;
}

function parseJsonLines(stdout) {
  const messages = [];
  for (const line of String(stdout ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) messages.push(parsed);
    } catch {
      // Non-JSON diagnostics cannot become provider output or activity proof.
    }
  }
  return messages;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function aggregateModelUsage(modelUsage) {
  const entries = modelUsage && typeof modelUsage === "object" && !Array.isArray(modelUsage) ? Object.values(modelUsage) : [];
  if (!entries.length) return null;
  const sum = (...keys) => entries.reduce((total, entry) => {
    for (const key of keys) {
      const count = numberOrNull(entry?.[key]);
      if (count !== null) return total + count;
    }
    return total;
  }, 0);
  const inputTokens = sum("inputTokens", "input_tokens");
  const outputTokens = sum("outputTokens", "output_tokens");
  const cacheReadInputTokens = sum("cacheReadInputTokens", "cache_read_input_tokens");
  const cacheCreationInputTokens = sum("cacheCreationInputTokens", "cache_creation_input_tokens");
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_input_tokens: cacheReadInputTokens,
    cache_creation_input_tokens: cacheCreationInputTokens,
    total_tokens: inputTokens + cacheReadInputTokens + cacheCreationInputTokens + outputTokens,
  };
}

function safeResultMetadata(result) {
  if (!result) return null;
  return {
    type: "result",
    subtype: typeof result.subtype === "string" ? result.subtype : "unknown",
    isError: Boolean(result.is_error ?? result.isError),
    durationMs: numberOrNull(result.duration_ms ?? result.durationMs),
    durationApiMs: numberOrNull(result.duration_api_ms ?? result.durationApiMs),
    numTurns: numberOrNull(result.num_turns ?? result.numTurns),
    sessionIdPresent: Boolean(result.session_id ?? result.sessionId),
    errorCount: Array.isArray(result.errors) ? result.errors.length : 0,
  };
}

export function inspectClaudeCliOutput(stdout) {
  const messages = parseJsonLines(stdout);
  const result = [...messages].reverse().find((message) => message.type === "result") ?? null;
  const init = messages.find((message) => message.type === "system" && message.subtype === "init") ?? null;
  const modelUsage = result?.modelUsage ?? result?.model_usage ?? null;
  const modelNames = modelUsage && typeof modelUsage === "object" && !Array.isArray(modelUsage) ? Object.keys(modelUsage) : [];
  const usage = result?.usage && typeof result.usage === "object" ? result.usage : aggregateModelUsage(modelUsage);
  const providerReportedUsd = numberOrNull(result?.total_cost_usd ?? result?.totalCostUsd ?? result?.totalCostUSD);
  const structuredOutput = result?.structured_output ?? result?.structuredOutput ?? null;
  return {
    messages,
    result: safeResultMetadata(result),
    structuredOutput,
    usage,
    model: modelNames[0] ?? (typeof init?.model === "string" ? init.model : null),
    providerReportedUsd,
  };
}

export function requireClaudeCliStructuredResult(stdout) {
  const inspected = inspectClaudeCliOutput(stdout);
  if (!inspected.result) {
    const error = new Error("Claude Code emitted no final stream-JSON result.");
    error.claudeTelemetry = inspected;
    throw error;
  }
  if (inspected.result.subtype !== "success" || inspected.result.isError) {
    const error = new Error(`Claude Code ended with ${inspected.result.subtype}${inspected.result.errorCount ? ` (${inspected.result.errorCount} structured-output error(s))` : ""}.`);
    error.claudeTelemetry = inspected;
    throw error;
  }
  if (!inspected.structuredOutput || typeof inspected.structuredOutput !== "object" || Array.isArray(inspected.structuredOutput)) {
    const error = new Error("Claude Code reported success without a schema-validated structured_output object.");
    error.claudeTelemetry = inspected;
    throw error;
  }
  return inspected;
}
