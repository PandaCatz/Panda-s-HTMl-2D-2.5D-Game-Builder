#!/usr/bin/env node

import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LOOPLAB_CLAUDE_SETUP_SCOPES,
  createClaudeIntegrationPlan,
  inspectClaudeIntegration,
  installClaudeIntegration,
} from "../lib/looplab-claude-integration.mjs";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const positional = argv.filter((entry) => !entry.startsWith("--"));
const operation = positional[0] ?? "status";
const explicitWorkspace = argv.some((entry) => entry.startsWith("--games-root=") || entry.startsWith("--workspace=")) || Boolean(positional[1]);

function option(name, fallback) {
  const prefix = `--${name}=`;
  const found = argv.find((entry) => entry.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function usage() {
  return [
    "LoopLab Claude Code integration",
    "",
    "npm run claude:status",
    'npm run claude:status -- "<games-root>"  # strict workspace check',
    'npm run claude:setup -- "<games-root>"',
    "node scripts/looplab-claude-setup.mjs install --games-root=<games-root> [--app-url=http://127.0.0.1:3000/] [--scope=user|local]",
    "",
    "status is read-only. Without a games root it validates the configured absolute workspace; with one it requires an exact match.",
    "setup reconciles both MCP profiles, synchronizes Claude's private cross-project LoopLab skill, and never stores provider credentials.",
  ].join("\n");
}

async function assertDirectory(path) {
  const info = await stat(path).catch(() => null);
  if (!info?.isDirectory()) throw new Error(`Claude core MCP workspace does not exist or is not a directory: ${path}`);
}

async function main() {
  if (argv.includes("--help") || argv.includes("-h") || operation === "help") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!["status", "install"].includes(operation)) throw new Error(`Unknown Claude integration operation: ${operation}`);
  if (operation === "install" && !explicitWorkspace) throw new Error('Claude setup requires an explicit <games-root>. Example: npm run claude:setup -- "H:\\games"');
  const workspaceRoot = resolve(option("games-root", option("workspace", positional[1] ?? process.cwd())));
  const scope = option("scope", positional[3] ?? "user");
  if (!LOOPLAB_CLAUDE_SETUP_SCOPES.includes(scope)) throw new Error(`--scope must be ${LOOPLAB_CLAUDE_SETUP_SCOPES.join(" or ")}.`);
  await assertDirectory(workspaceRoot);
  const plan = createClaudeIntegrationPlan({
    projectRoot: PROJECT_ROOT,
    workspaceRoot,
    appUrl: option("app-url", positional[2] ?? "http://127.0.0.1:3000/"),
    scope,
    allowConfiguredWorkspace: operation === "status" && !explicitWorkspace,
  });
  const result = operation === "install"
    ? await installClaudeIntegration({ plan })
    : await inspectClaudeIntegration({ plan });
  process.stdout.write(`${JSON.stringify({ ok: true, operation, ...result })}\n`);
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    operation,
    error: error instanceof Error ? error.message : String(error),
    providerUsage: { totalTokens: 0, rateEquivalentUsd: 0 },
  })}\n`);
  process.exitCode = 1;
});
