import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  LOOPLAB_CLAUDE_OPERABILITY_SCHEMA,
  LOOPLAB_CLAUDE_OPERABILITY_TOOLS,
  buildClaudeOperabilityArgs,
  collectClaudeToolUseNames,
  createClaudeOperabilityMcpConfig,
  inspectClaudeOperabilityOutput,
} from "../lib/looplab-claude-operability.mjs";
import { LOOPLAB_PROTOCOL_VERSION as PROTOCOL } from "../lib/looplab-versions.mjs";

function stream({ includeCore = true, includeLive = true } = {}) {
  const content = [];
  if (includeCore) content.push({ type: "tool_use", id: "core-1", name: LOOPLAB_CLAUDE_OPERABILITY_TOOLS[0], input: { projectPath: ".looplab-claude-smoke-123/synthetic-blank.loop.json" } });
  if (includeLive) content.push({ type: "tool_use", id: "live-1", name: LOOPLAB_CLAUDE_OPERABILITY_TOOLS[1], input: { query: "operability", limit: 1 } });
  return [
    JSON.stringify({ type: "system", subtype: "init", model: "claude-sonnet-5" }),
    JSON.stringify({ type: "assistant", message: { content } }),
    JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      total_cost_usd: 0.0012,
      usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 10 },
      structured_output: {
        schemaVersion: LOOPLAB_CLAUDE_OPERABILITY_SCHEMA,
        core: { toolCalled: true, ok: true, transport: "core-file", protocolVersion: PROTOCOL, projectPath: "H:\\games\\.looplab-claude-smoke-123\\synthetic-blank.loop.json" },
        live: { toolCalled: true, ok: true, transport: "browser-session", protocolVersion: PROTOCOL, recipeCount: 1 },
        conclusion: "ready",
        notes: "Both read-only profiles returned current envelopes from synthetic/public data.",
      },
    }),
  ].join("\n");
}

test("Claude operability args enable only the two privacy-safe read-only MCP tools", () => {
  const mcpConfigPath = resolve("tests", "isolated-claude-smoke.mcp.json");
  const args = buildClaudeOperabilityArgs({ projectPath: ".looplab-claude-smoke-123/synthetic-blank.loop.json", expectedProtocolVersion: PROTOCOL, mcpConfigPath });
  assert.equal(args[0], "-p");
  assert.match(args[1], /temporary synthetic blank fixture/);
  assert.match(args[1], /list_agent_recipes with \{"query":"operability","limit":1\}/);
  assert.doesNotMatch(args[1], /list_shared_projects/);
  assert.ok(args.includes("stream-json"));
  assert.ok(!args.includes("--setting-sources"));
  assert.ok(args.includes("--allowedTools"));
  assert.equal(args[args.indexOf("--tools") + 1], LOOPLAB_CLAUDE_OPERABILITY_TOOLS.join(","));
  assert.equal(args[args.indexOf("--allowedTools") + 1], LOOPLAB_CLAUDE_OPERABILITY_TOOLS.join(","));
  assert.ok(!args.includes("--safe-mode"), "safe mode would disable the MCP profiles this command must prove");
  assert.ok(args.includes("--strict-mcp-config"));
  assert.equal(args[args.indexOf("--mcp-config") + 1], mcpConfigPath);
  assert.equal(args[args.indexOf("--model") + 1], "haiku");
  assert.equal(args[args.indexOf("--max-budget-usd") + 1], "0.25");
});

test("Claude operability config advertises exactly one schema on each isolated MCP profile", () => {
  const config = createClaudeOperabilityMcpConfig({
    nodePath: process.execPath,
    serverEntry: resolve("scripts", "looplab-mcp.mjs"),
    workspaceRoot: resolve("tests"),
    appUrl: "http://127.0.0.1:3000/",
  });
  assert.deepEqual(Object.keys(config.mcpServers), ["looplab-core", "looplab-live"]);
  assert.match(config.mcpServers["looplab-core"].args.join(" "), /--only-tools=get_agent_brief/);
  assert.match(config.mcpServers["looplab-live"].args.join(" "), /--only-tools=list_agent_recipes/);
  assert.equal(config.mcpServers["looplab-core"].args.filter((entry) => entry.startsWith("--only-tools=")).length, 1);
  assert.equal(config.mcpServers["looplab-live"].args.filter((entry) => entry.startsWith("--only-tools=")).length, 1);
  assert.doesNotMatch(JSON.stringify(config), /api[_-]?key|token|secret/i);
});

test("Claude operability proof requires observed core and live tool-use events", () => {
  const inspected = inspectClaudeOperabilityOutput(stream(), { expectedProtocolVersion: PROTOCOL });
  assert.equal(inspected.evidence.ready, true);
  assert.equal(inspected.evidence.privacyMode, "synthetic-fixture-and-public-recipe");
  assert.deepEqual(inspected.evidence.observedTools, LOOPLAB_CLAUDE_OPERABILITY_TOOLS);
  assert.equal(inspected.evidence.core.transport, "core-file");
  assert.equal(inspected.evidence.live.transport, "browser-session");
  assert.equal(inspected.telemetry.providerReportedUsd, 0.0012);
});

test("Claude operability proof rejects a claimed success when a tool was not actually called", () => {
  assert.throws(
    () => inspectClaudeOperabilityOutput(stream({ includeLive: false }), { expectedProtocolVersion: PROTOCOL }),
    /missing observed tool use: mcp__looplab-live__list_agent_recipes/,
  );
});

test("Claude tool-use collection ignores prose that merely names a tool", () => {
  const names = collectClaudeToolUseNames([{ type: "assistant", message: { content: [{ type: "text", text: LOOPLAB_CLAUDE_OPERABILITY_TOOLS[0] }] } }]);
  assert.deepEqual(names, []);
});
