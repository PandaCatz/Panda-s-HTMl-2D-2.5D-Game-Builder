#!/usr/bin/env node

import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createTemplate } from "../lib/looplab-agent-core.mjs";
import { inspectClaudeCliOutput } from "../lib/looplab-claude-cli.mjs";
import { createClaudeIntegrationPlan, inspectClaudeIntegration } from "../lib/looplab-claude-integration.mjs";
import {
  LOOPLAB_CLAUDE_OPERABILITY_TOOLS,
  buildClaudeOperabilityInvocation,
  collectClaudeToolUseNames,
  createClaudeOperabilityMcpConfig,
  inspectClaudeOperabilityOutput,
} from "../lib/looplab-claude-operability.mjs";
import { runProviderProcess } from "../lib/looplab-provider-process.mjs";
import { runProviderCommand } from "../lib/looplab-provider-status.mjs";
import { createProviderModelSelectionReceipt } from "../lib/looplab-provider-model-policy.mjs";
import { createUsageReceipt, usageFromCliOutput } from "../lib/looplab-provider-usage.mjs";
import { LOOPLAB_PROTOCOL_VERSION } from "../lib/looplab-versions.mjs";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const positional = argv.filter((entry) => !entry.startsWith("--"));

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = argv.find((entry) => entry.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function usage() {
  return [
    "LoopLab Claude core + live MCP operability smoke",
    "",
    'npm run claude:smoke -- "H:\\games"',
    'node scripts/looplab-claude-smoke.mjs --games-root="H:\\games"',
    "",
    "Runs one monitored, nonpersistent Claude session with exactly two read-only MCP tools.",
    "A strict temporary MCP config advertises only those two schemas; installed user/project MCP catalogs are ignored.",
    "The live editor and exact protocol are preflighted before Claude starts, so an offline app costs zero provider tokens.",
    "The core call uses a temporary synthetic blank project and the live call reads one bounded public recipe query.",
    "No user project brief, shared-project catalog, provider transcript, asset, or credential is submitted.",
  ].join("\n");
}

async function assertDirectory(path, label) {
  const info = await stat(path).catch(() => null);
  if (!info?.isDirectory()) throw new Error(`${label} does not exist or is not a directory: ${path}`);
}

async function createSyntheticFixture(gamesRoot) {
  const directory = await mkdtemp(join(gamesRoot, ".looplab-claude-smoke-"));
  const path = join(directory, "synthetic-blank.loop.json");
  const project = createTemplate("blank");
  await writeFile(path, `${JSON.stringify(project)}\n`, { encoding: "utf8", flag: "wx" });
  return {
    directory,
    relative: relative(gamesRoot, path).replaceAll("\\", "/"),
  };
}

function activityFromLine(line) {
  let message;
  try { message = JSON.parse(String(line ?? "")); } catch { return null; }
  const tools = collectClaudeToolUseNames([message]).filter((tool) => LOOPLAB_CLAUDE_OPERABILITY_TOOLS.includes(tool));
  if (tools.length) return { event: "claude.smoke.tool", tools };
  if (message?.type === "system" && message?.subtype === "init") return { event: "claude.smoke.started", model: typeof message.model === "string" ? message.model : null };
  if (message?.type === "result") return { event: "claude.smoke.provider-finished", subtype: message.subtype ?? "unknown", isError: Boolean(message.is_error ?? message.isError) };
  return null;
}

function authMethodFromStatus(output) {
  const normalized = String(output ?? "").toLowerCase();
  if (/claude\.ai|pro plan|max plan|subscription/.test(normalized)) return "Claude account";
  if (/api[ -]?key|console account/.test(normalized)) return "API key";
  if (/access token/.test(normalized)) return "access token";
  if (/bedrock/.test(normalized)) return "Amazon Bedrock";
  if (/vertex/.test(normalized)) return "Google Vertex AI";
  return "saved CLI session";
}

async function main() {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (option("project")) throw new Error("Claude smoke no longer accepts --project. It always creates a temporary synthetic blank fixture so user game data is not submitted.");
  const gamesRootInput = option("games-root", option("workspace", positional[0] ?? null));
  if (!gamesRootInput) throw new Error("Claude smoke requires --games-root=<games-root> so the core MCP scope is explicit.");
  const gamesRoot = resolve(gamesRootInput);
  await assertDirectory(gamesRoot, "Claude smoke games root");
  const appUrl = option("app-url", "http://127.0.0.1:3000/");
  const plan = createClaudeIntegrationPlan({ projectRoot: PROJECT_ROOT, workspaceRoot: gamesRoot, appUrl, scope: "user" });
  const integration = await inspectClaudeIntegration({ plan });
  if (!integration.operabilityReady) throw new Error(`Claude integration is not ready: ${integration.nextAction}`);

  const authResult = await runProviderCommand("claude", ["auth", "status"], { timeoutMs: 30_000 });
  const authMethod = authResult.ok ? authMethodFromStatus(`${authResult.stdout}\n${authResult.stderr}`) : "saved CLI session";
  const timeoutMs = Math.max(60_000, Number(option("timeout-ms", process.env.LOOPLAB_CLAUDE_SMOKE_TIMEOUT_MS ?? 1_800_000)) || 1_800_000);
  const fixture = await createSyntheticFixture(gamesRoot);
  const mcpConfigPath = join(fixture.directory, "claude-operability.mcp.json");
  const mcpConfig = createClaudeOperabilityMcpConfig({
    nodePath: process.execPath,
    serverEntry: join(PROJECT_ROOT, "scripts", "looplab-mcp.mjs"),
    workspaceRoot: gamesRoot,
    appUrl: plan.appUrl,
  });
  await writeFile(mcpConfigPath, `${JSON.stringify(mcpConfig)}\n`, { encoding: "utf8", flag: "wx" });
  const maxBudgetUsd = Number(option("max-budget-usd", process.env.LOOPLAB_CLAUDE_SMOKE_MAX_BUDGET_USD ?? 1));
  const invocation = buildClaudeOperabilityInvocation({
    projectPath: fixture.relative,
    expectedProtocolVersion: LOOPLAB_PROTOCOL_VERSION,
    mcpConfigPath,
    maxBudgetUsd,
    model: option("model", undefined),
    effort: option("effort", undefined),
  });
  process.stderr.write(`${JSON.stringify({ event: "claude.smoke.submitted", purpose: "operability-only", gameCreation: false, gamesRoot, fixture: "synthetic-blank", privacyMode: "synthetic-fixture-and-public-recipe", isolatedMcp: true, advertisedToolCount: 2, model: invocation.modelPolicy.model, effort: invocation.modelPolicy.effort, maxBudgetUsd, timeoutMs, tools: LOOPLAB_CLAUDE_OPERABILITY_TOOLS })}\n`);

  try {
    const result = await runProviderProcess({
      command: "claude",
      args: invocation.args,
      cwd: fixture.directory,
      timeoutMs,
      timeoutLabel: "LoopLab MCP operability smoke",
      onStdoutLine: (line) => {
        const activity = activityFromLine(line);
        if (activity) process.stderr.write(`${JSON.stringify(activity)}\n`);
      },
    });
    const inspected = inspectClaudeOperabilityOutput(result.stdout, { expectedProtocolVersion: LOOPLAB_PROTOCOL_VERSION });
    const measured = usageFromCliOutput(result.stdout, result.stderr);
    const receiptModel = inspected.telemetry.model ?? measured.model ?? invocation.modelPolicy.model;
    const usageReceipt = createUsageReceipt({
      provider: "claude",
      model: receiptModel,
      usage: inspected.telemetry.usage ?? measured.usage,
      source: "claude-code-cli-stream-json",
      providerReportedUsd: inspected.telemetry.providerReportedUsd,
      authMethod,
      modelSelection: createProviderModelSelectionReceipt(invocation.modelPolicy, { providerReportedModel: inspected.telemetry.model ?? measured.model }),
    });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      operation: "claude-operability-smoke",
      gamesRoot,
      fixture: "synthetic-blank",
      privacyMode: "synthetic-fixture-and-public-recipe",
      protocolVersion: LOOPLAB_PROTOCOL_VERSION,
      integration: {
        registrationComplete: integration.registrationComplete,
        configurationCurrent: integration.configurationCurrent,
        skillCurrent: integration.skillCurrent,
        connected: integration.connected,
        liveAppReady: integration.liveAppReady,
      },
      evidence: inspected.evidence,
      usageReceipt,
    })}\n`);
  } catch (error) {
    const telemetry = error?.claudeTelemetry ?? inspectClaudeCliOutput(error?.processResult?.stdout);
    const measured = usageFromCliOutput(error?.processResult?.stdout, error?.processResult?.stderr);
    const receiptModel = telemetry.model ?? measured.model ?? invocation.modelPolicy.model;
    const usageReceipt = createUsageReceipt({
      provider: "claude",
      model: receiptModel,
      usage: telemetry.usage ?? measured.usage,
      source: "claude-code-cli-stream-json",
      providerReportedUsd: telemetry.providerReportedUsd,
      authMethod,
      modelSelection: createProviderModelSelectionReceipt(invocation.modelPolicy, { providerReportedModel: telemetry.model ?? measured.model }),
    });
    process.stdout.write(`${JSON.stringify({
      ok: false,
      operation: "claude-operability-smoke",
      gamesRoot,
      fixture: "synthetic-blank",
      privacyMode: "synthetic-fixture-and-public-recipe",
      protocolVersion: LOOPLAB_PROTOCOL_VERSION,
      error: error instanceof Error ? error.message : String(error),
      evidence: error?.operabilityEvidence ?? null,
      usageReceipt,
    })}\n`);
    process.exitCode = 1;
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    operation: "claude-operability-smoke",
    error: error instanceof Error ? error.message : String(error),
    usageReceipt: createUsageReceipt({
      provider: "claude",
      model: null,
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      source: "claude-code-cli-preflight",
      providerReportedUsd: 0,
      authMethod: null,
    }),
  })}\n`);
  process.exitCode = 1;
});
