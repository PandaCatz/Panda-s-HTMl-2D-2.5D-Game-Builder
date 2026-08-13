import { isAbsolute } from "node:path";

import { claudeCliStructuredSchema, requireClaudeCliStructuredResult } from "./looplab-claude-cli.mjs";
import { resolveClaudeCliModelPolicy } from "./looplab-provider-model-policy.mjs";

export const LOOPLAB_CLAUDE_OPERABILITY_SCHEMA = "looplab-claude-operability/v1";
export const LOOPLAB_CLAUDE_OPERABILITY_TOOLS = Object.freeze([
  "mcp__looplab-core__get_agent_brief",
  "mcp__looplab-live__list_agent_recipes",
]);

export function createClaudeOperabilityMcpConfig({
  nodePath = process.execPath,
  serverEntry,
  workspaceRoot,
  appUrl = "http://127.0.0.1:3000/",
  timeoutMs = 120_000,
} = {}) {
  const executable = String(nodePath ?? "").trim();
  const entry = String(serverEntry ?? "").trim();
  const workspace = String(workspaceRoot ?? "").trim();
  if (!isAbsolute(executable)) throw new Error("Claude operability MCP config requires an absolute Node executable path.");
  if (!isAbsolute(entry)) throw new Error("Claude operability MCP config requires an absolute LoopLab MCP server path.");
  if (!isAbsolute(workspace)) throw new Error("Claude operability MCP config requires an absolute games root.");
  const parsedAppUrl = new URL(String(appUrl));
  if (parsedAppUrl.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]", "::1"].includes(parsedAppUrl.hostname.toLowerCase())) {
    throw new Error("Claude operability MCP config requires a loopback HTTP app URL.");
  }
  const boundedTimeoutMs = Math.max(1_000, Math.min(120_000, Number(timeoutMs) || 120_000));
  return {
    mcpServers: {
      "looplab-core": {
        command: executable,
        args: [entry, "--surface=core", `--workspace=${workspace}`, "--only-tools=get_agent_brief", `--timeout-ms=${boundedTimeoutMs}`],
      },
      "looplab-live": {
        command: executable,
        args: [entry, "--surface=browser", `--app-url=${parsedAppUrl.href}`, "--only-tools=list_agent_recipes", `--timeout-ms=${boundedTimeoutMs}`],
      },
    },
  };
}

export const LOOPLAB_CLAUDE_OPERABILITY_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: { type: "string", const: LOOPLAB_CLAUDE_OPERABILITY_SCHEMA },
    core: {
      type: "object",
      additionalProperties: false,
      properties: {
        toolCalled: { type: "boolean" },
        ok: { type: "boolean" },
        transport: { type: "string", enum: ["core-file"] },
        protocolVersion: { type: "string" },
        projectPath: { type: "string", minLength: 1 },
      },
      required: ["toolCalled", "ok", "transport", "protocolVersion", "projectPath"],
    },
    live: {
      type: "object",
      additionalProperties: false,
      properties: {
        toolCalled: { type: "boolean" },
        ok: { type: "boolean" },
        transport: { type: "string", enum: ["browser-session"] },
        protocolVersion: { type: "string" },
        recipeCount: { type: "integer", minimum: 0 },
      },
      required: ["toolCalled", "ok", "transport", "protocolVersion", "recipeCount"],
    },
    conclusion: { type: "string", enum: ["ready", "not-ready"] },
    notes: { type: "string", maxLength: 240 },
  },
  required: ["schemaVersion", "core", "live", "conclusion", "notes"],
});

export function buildClaudeOperabilityPrompt({ projectPath, expectedProtocolVersion } = {}) {
  if (typeof projectPath !== "string" || !projectPath.trim()) throw new Error("Claude operability smoke requires a workspace-relative synthetic .loop.json fixture path.");
  if (typeof expectedProtocolVersion !== "string" || !expectedProtocolVersion.trim()) throw new Error("Claude operability smoke requires the current LoopLab protocol version.");
  return [
    "Perform one read-only LoopLab operability smoke test using only synthetic/public test data.",
    "Call exactly the two allowed MCP tools and do not call anything else.",
    `1. Call ${LOOPLAB_CLAUDE_OPERABILITY_TOOLS[0]} with ${JSON.stringify({ projectPath: projectPath.trim() })}. The project is a temporary synthetic blank fixture created only for this smoke.`,
    `2. Call ${LOOPLAB_CLAUDE_OPERABILITY_TOOLS[1]} with ${JSON.stringify({ query: "operability", limit: 1 })}. Recipes are public built-in LoopLab guidance; do not inspect any selected user project.`,
    "Inspect both returned envelopes. Do not edit, save, mount, list projects, read shared projects, generate, export, or invoke another provider.",
    `The required protocolVersion is ${expectedProtocolVersion.trim()}.`,
    "Report ready only when both calls return ok=true, the core transport is core-file, the live transport is browser-session, and both protocol versions match.",
    "recipeCount is the number of bounded public recipe summaries returned by the live call; zero is valid when the query has no match.",
    "Return only the requested schema-bound result.",
  ].join("\n");
}

export function buildClaudeOperabilityInvocation({
  projectPath,
  expectedProtocolVersion,
  maxTurns = 4,
  maxBudgetUsd = 1,
  mcpConfigPath,
  model,
  effort,
  env = process.env,
} = {}) {
  const configPath = String(mcpConfigPath ?? "").trim();
  if (!isAbsolute(configPath)) throw new Error("Claude operability smoke requires an absolute isolated MCP config path.");
  const toolNames = [...LOOPLAB_CLAUDE_OPERABILITY_TOOLS];
  const turnLimit = Math.max(2, Math.min(12, Math.floor(Number(maxTurns) || 4)));
  const budget = Math.max(0.01, Math.min(5, Number(maxBudgetUsd) || 1));
  const modelPolicy = resolveClaudeCliModelPolicy({ purpose: "operability-smoke", env, model, effort });
  const args = [
    "-p",
    buildClaudeOperabilityPrompt({ projectPath, expectedProtocolVersion }),
    "--output-format",
    "stream-json",
    "--verbose",
    "--json-schema",
    JSON.stringify(claudeCliStructuredSchema(LOOPLAB_CLAUDE_OPERABILITY_OUTPUT_SCHEMA)),
    "--no-session-persistence",
    "--no-chrome",
    "--permission-mode",
    "dontAsk",
    "--mcp-config",
    configPath,
    "--strict-mcp-config",
    "--tools",
    toolNames.join(","),
    "--allowedTools",
    toolNames.join(","),
  ];
  args.push("--model", modelPolicy.model, "--effort", modelPolicy.effort);
  args.push("--max-turns", String(turnLimit), "--max-budget-usd", String(budget));
  return { args, modelPolicy };
}

export function buildClaudeOperabilityArgs(options = {}) {
  return buildClaudeOperabilityInvocation(options).args;
}

function collectToolUses(value, found) {
  if (Array.isArray(value)) {
    for (const entry of value) collectToolUses(entry, found);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (value.type === "tool_use" && typeof value.name === "string" && value.name.trim()) found.add(value.name.trim());
  for (const child of Object.values(value)) collectToolUses(child, found);
}

export function collectClaudeToolUseNames(messages) {
  const found = new Set();
  collectToolUses(messages, found);
  return [...found];
}

function failedEvidence(message, telemetry, evidence) {
  const error = new Error(message);
  error.claudeTelemetry = telemetry;
  error.operabilityEvidence = evidence;
  return error;
}

export function inspectClaudeOperabilityOutput(stdout, { expectedProtocolVersion } = {}) {
  const telemetry = requireClaudeCliStructuredResult(stdout);
  const structured = telemetry.structuredOutput;
  const toolUses = collectClaudeToolUseNames(telemetry.messages);
  const missingTools = LOOPLAB_CLAUDE_OPERABILITY_TOOLS.filter((tool) => !toolUses.includes(tool));
  const checks = {
    bothToolsObserved: missingTools.length === 0,
    schemaCurrent: structured.schemaVersion === LOOPLAB_CLAUDE_OPERABILITY_SCHEMA,
    coreReady: structured.core?.toolCalled === true && structured.core?.ok === true && structured.core?.transport === "core-file",
    liveReady: structured.live?.toolCalled === true && structured.live?.ok === true && structured.live?.transport === "browser-session",
    coreProtocolCurrent: structured.core?.protocolVersion === expectedProtocolVersion,
    liveProtocolCurrent: structured.live?.protocolVersion === expectedProtocolVersion,
    conclusionReady: structured.conclusion === "ready",
  };
  const ready = Object.values(checks).every(Boolean);
  const evidence = {
    schemaVersion: LOOPLAB_CLAUDE_OPERABILITY_SCHEMA,
    ready,
    privacyMode: "synthetic-fixture-and-public-recipe",
    checks,
    observedTools: toolUses.filter((tool) => LOOPLAB_CLAUDE_OPERABILITY_TOOLS.includes(tool)),
    missingTools,
    core: structured.core ?? null,
    live: structured.live ?? null,
    conclusion: structured.conclusion ?? null,
    notes: structured.notes ?? "",
  };
  if (!ready) throw failedEvidence(`Claude did not prove both LoopLab MCP profiles are operational${missingTools.length ? `; missing observed tool use: ${missingTools.join(", ")}` : ""}.`, telemetry, evidence);
  return { telemetry, evidence };
}
