import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";

import { CLAUDE_STRUCTURED_OUTPUT_MIN_VERSION, claudeHeadlessCapabilities } from "./looplab-claude-cli.mjs";
import {
  LOOPLAB_CLAUDE_INTEGRATION_SCHEMA,
  LOOPLAB_CLAUDE_MCP_SERVER_IDS,
  LOOPLAB_CLAUDE_SETUP_SCOPES,
  getClaudeIntegrationManifest as getPortableClaudeIntegrationManifest,
} from "./looplab-claude-contract.mjs";
import { runProviderCommand } from "./looplab-provider-status.mjs";
import { LOOPLAB_PROTOCOL_VERSION } from "./looplab-versions.mjs";

export { LOOPLAB_CLAUDE_INTEGRATION_SCHEMA, LOOPLAB_CLAUDE_MCP_SERVER_IDS, LOOPLAB_CLAUDE_SETUP_SCOPES };

function escapedPattern(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanOutput(value) {
  // Claude CLI output may contain ANSI control bytes that must be stripped before parsing.
  // eslint-disable-next-line no-control-regex
  return String(value ?? "").replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\r/g, "").trim();
}

function safeError(result, fallback) {
  const message = cleanOutput(result?.stderr || result?.stdout);
  return message ? message.slice(0, 500) : fallback;
}

function normalizeExecutable(value) {
  const normalized = String(value ?? "").trim().replaceAll("/", "\\");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function contentDigest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function workspaceArgument(value) {
  return String(value ?? "").match(/(?:^|\s)--workspace=(.+?)(?=\s--[a-z0-9-]+=|$)/i)?.[1]?.trim() ?? null;
}

function argumentsWithoutWorkspace(value) {
  return String(value ?? "")
    .replace(/(?:^|\s)--workspace=(.+?)(?=\s--[a-z0-9-]+=|$)/i, " --workspace=<configured>")
    .trim();
}

export function inspectClaudeMcpDefinition(output, definition, { workspaceExists = existsSync } = {}) {
  const lines = cleanOutput(output).split("\n").map((line) => line.trim());
  const field = (name) => lines.find((line) => line.startsWith(`${name}:`))?.slice(name.length + 1).trim() ?? "";
  const scopeLabel = field("Scope");
  const observedScope = /^User config\b/i.test(scopeLabel)
    ? "user"
    : /^Local config\b/i.test(scopeLabel)
      ? "local"
      : /^Project config\b/i.test(scopeLabel)
        ? "project"
        : "unknown";
  const commandMatches = normalizeExecutable(field("Command")) === normalizeExecutable(definition.command);
  const observedArgs = field("Args");
  const expectedArgs = definition.args.join(" ");
  const observedWorkspaceRoot = workspaceArgument(observedArgs);
  const configuredWorkspaceValid = !definition.allowConfiguredWorkspace || Boolean(
    observedWorkspaceRoot
    && isAbsolute(observedWorkspaceRoot)
    && workspaceExists(observedWorkspaceRoot),
  );
  const argsMatch = definition.allowConfiguredWorkspace
    ? argumentsWithoutWorkspace(observedArgs) === argumentsWithoutWorkspace(expectedArgs) && configuredWorkspaceValid
    : observedArgs === expectedArgs;
  const scopeMatches = observedScope === definition.scope;
  return {
    id: definition.id,
    observedScope,
    commandMatches,
    argsMatch,
    scopeMatches,
    observedWorkspaceRoot,
    configuredWorkspaceValid,
    configurationCurrent: commandMatches && argsMatch && scopeMatches,
  };
}

async function inspectRegisteredDefinition({ runner, definition }) {
  const result = await runner("claude", ["mcp", "get", definition.id], { timeoutMs: 30_000 });
  const details = inspectClaudeMcpDefinition(`${result?.stdout ?? ""}\n${result?.stderr ?? ""}`, definition);
  return { ...details, readable: Boolean(result?.ok || details.commandMatches || details.argsMatch) };
}

export function normalizeLoopbackAppUrl(value = "http://127.0.0.1:3000/") {
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    throw new Error("Claude live MCP requires a valid loopback HTTP URL.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]", "::1"].includes(hostname)) {
    throw new Error("Claude live MCP is restricted to localhost, 127.0.0.1, or ::1 over HTTP.");
  }
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  parsed.search = "";
  if (!parsed.pathname.endsWith("/")) parsed.pathname = `${parsed.pathname}/`;
  return parsed.toString();
}

export async function inspectLoopLabApp({
  appUrl = "http://127.0.0.1:3000/",
  expectedProtocolVersion = LOOPLAB_PROTOCOL_VERSION,
  fetchImpl = fetch,
  timeoutMs = 2_000,
} = {}) {
  const normalizedUrl = normalizeLoopbackAppUrl(appUrl);
  const manifestUrl = new URL("agent-manifest.json", normalizedUrl).href;
  const boundedTimeoutMs = Math.max(250, Math.min(10_000, Number(timeoutMs) || 2_000));
  try {
    const response = await fetchImpl(manifestUrl, { signal: AbortSignal.timeout(boundedTimeoutMs) });
    if (!response?.ok) {
      return {
        checked: true,
        reachable: false,
        protocolCurrent: false,
        appUrl: normalizedUrl,
        manifestUrl,
        expectedProtocolVersion,
        observedProtocolVersion: null,
        error: `LoopLab manifest returned HTTP ${response?.status ?? "unknown"}.`,
      };
    }
    const manifest = await response.json();
    const observedProtocolVersion = typeof manifest?.protocolVersion === "string" ? manifest.protocolVersion : null;
    return {
      checked: true,
      reachable: true,
      protocolCurrent: observedProtocolVersion === expectedProtocolVersion,
      appUrl: normalizedUrl,
      manifestUrl,
      expectedProtocolVersion,
      observedProtocolVersion,
      error: observedProtocolVersion
        ? observedProtocolVersion === expectedProtocolVersion
          ? null
          : `LoopLab reports protocol ${observedProtocolVersion}; expected ${expectedProtocolVersion}.`
        : "LoopLab manifest did not report a protocol version.",
    };
  } catch (error) {
    return {
      checked: true,
      reachable: false,
      protocolCurrent: false,
      appUrl: normalizedUrl,
      manifestUrl,
      expectedProtocolVersion,
      observedProtocolVersion: null,
      error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    };
  }
}

export function createClaudeIntegrationPlan({
  projectRoot = resolve("."),
  workspaceRoot = projectRoot,
  appUrl = "http://127.0.0.1:3000/",
  scope = "user",
  allowConfiguredWorkspace = false,
  userHome = homedir(),
} = {}) {
  if (!LOOPLAB_CLAUDE_SETUP_SCOPES.includes(scope)) {
    throw new Error(`Claude MCP scope must be ${LOOPLAB_CLAUDE_SETUP_SCOPES.join(" or ")}.`);
  }
  const root = resolve(projectRoot);
  const workspace = resolve(workspaceRoot);
  const serverEntry = resolve(root, "scripts", "looplab-mcp.mjs");
  const liveUrl = normalizeLoopbackAppUrl(appUrl);
  const servers = [
    {
      id: "looplab-core",
      profile: "core",
      scope,
      command: process.execPath,
      args: [serverEntry, "--surface=core", `--workspace=${workspace}`, "--timeout-ms=120000"],
      allowConfiguredWorkspace: Boolean(allowConfiguredWorkspace),
      purpose: "Workspace-contained deterministic .loop.json authoring.",
    },
    {
      id: "looplab-live",
      profile: "browser",
      scope,
      command: process.execPath,
      args: [serverEntry, "--surface=browser", `--app-url=${liveUrl}`, "--timeout-ms=120000"],
      purpose: "Complete live LoopLab editor, provider, visual, playtest, and export control.",
    },
  ];
  return {
    schemaVersion: LOOPLAB_CLAUDE_INTEGRATION_SCHEMA,
    minimumClaudeVersion: CLAUDE_STRUCTURED_OUTPUT_MIN_VERSION,
    scope,
    projectRoot: root,
    workspaceRoot: workspace,
    appUrl: liveUrl,
    servers,
    skill: {
      id: "looplab-game-builder",
      required: scope === "user",
      source: resolve(root, ".claude", "skills", "looplab-game-builder", "SKILL.md"),
      target: resolve(userHome, ".claude", "skills", "looplab-game-builder", "SKILL.md"),
    },
    securityBoundary: "Registration stores executable paths and non-secret local arguments only. Provider credentials remain outside MCP configuration.",
  };
}

export async function inspectClaudeUserSkill({ plan = createClaudeIntegrationPlan() } = {}) {
  if (!plan.skill.required) {
    return { id: plan.skill.id, required: false, installed: true, current: true, source: plan.skill.source, target: null };
  }
  const source = await readFile(plan.skill.source, "utf8");
  const target = await readFile(plan.skill.target, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  const sourceDigest = contentDigest(source);
  const targetDigest = target === null ? null : contentDigest(target);
  return {
    id: plan.skill.id,
    required: true,
    installed: target !== null,
    current: targetDigest === sourceDigest,
    source: plan.skill.source,
    target: plan.skill.target,
    sourceDigest,
    targetDigest,
  };
}

export async function syncClaudeUserSkill({ plan = createClaudeIntegrationPlan() } = {}) {
  const before = await inspectClaudeUserSkill({ plan });
  if (!before.required || before.current) return { ...before, action: "skipped" };
  const source = await readFile(plan.skill.source, "utf8");
  if (before.installed) {
    const existing = await readFile(plan.skill.target, "utf8");
    if (!/^---\s*[\s\S]*?\bname:\s*looplab-game-builder\s*$/m.test(existing)) {
      throw new Error(`Claude skill target exists but is not LoopLab-owned: ${plan.skill.target}`);
    }
  }
  await mkdir(dirname(plan.skill.target), { recursive: true });
  const temporary = `${plan.skill.target}.looplab-${process.pid}-${Date.now()}.tmp`;
  const backup = `${plan.skill.target}.looplab-${process.pid}-${Date.now()}.bak`;
  let backupCreated = false;
  try {
    await writeFile(temporary, source, { encoding: "utf8", flag: "wx" });
    if (before.installed) {
      await rename(plan.skill.target, backup);
      backupCreated = true;
    }
    await rename(temporary, plan.skill.target);
    if (backupCreated) await rm(backup, { force: true }).catch(() => {});
  } catch (error) {
    if (backupCreated && !existsSync(plan.skill.target)) await rename(backup, plan.skill.target).catch(() => {});
    throw error;
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
  const after = await inspectClaudeUserSkill({ plan });
  if (!after.current) throw new Error("Claude user skill synchronization did not persist exact source bytes.");
  return { ...after, action: before.installed ? "updated" : "added" };
}

export function inspectClaudeMcpList(output, serverIds = LOOPLAB_CLAUDE_MCP_SERVER_IDS) {
  const lines = cleanOutput(output).split("\n").map((line) => line.trim()).filter(Boolean);
  return serverIds.map((id) => {
    const line = lines.find((entry) => new RegExp(`^${escapedPattern(id)}\\s*:`).test(entry)) ?? "";
    const normalized = line.toLowerCase();
    const state = !line
      ? "missing"
      : /connected|cached\b/.test(normalized)
        ? "connected"
        : /pending approval/.test(normalized)
          ? "pending-approval"
          : /needs authentication/.test(normalized)
            ? "needs-authentication"
            : /failed|connection error|rejected|not configured/.test(normalized)
              ? "unavailable"
              : "registered";
    return {
      id,
      registered: Boolean(line),
      connected: state === "connected",
      state,
    };
  });
}

export async function inspectClaudeIntegration({
  runner = runProviderCommand,
  plan = createClaudeIntegrationPlan(),
  skillInspector = inspectClaudeUserSkill,
  appInspector = inspectLoopLabApp,
} = {}) {
  const versionResult = await runner("claude", ["--version"], { timeoutMs: 15_000 });
  const versionOutput = versionResult?.ok ? versionResult.stdout || versionResult.stderr : "";
  const capabilities = claudeHeadlessCapabilities(versionOutput);
  if (!versionResult?.ok) {
    return {
      schemaVersion: LOOPLAB_CLAUDE_INTEGRATION_SCHEMA,
      available: false,
      parityReady: false,
      registrationComplete: false,
      configurationCurrent: false,
      skillCurrent: false,
      connected: false,
      liveAppReady: false,
      liveApp: { checked: false, reachable: false, protocolCurrent: false, appUrl: plan.appUrl },
      operabilityReady: false,
      capabilities,
      servers: plan.servers.map(({ id, profile }) => ({ id, profile, registered: false, connected: false, state: "unknown" })),
      nextAction: "Install or repair Claude Code, then run npm run claude:status again.",
      error: safeError(versionResult, "Claude Code could not be launched."),
    };
  }
  const listResult = await runner("claude", ["mcp", "list"], { timeoutMs: 30_000 });
  const observed = inspectClaudeMcpList(`${listResult?.stdout ?? ""}\n${listResult?.stderr ?? ""}`, plan.servers.map(({ id }) => id));
  const servers = [];
  for (const definition of plan.servers) {
    const state = observed.find(({ id }) => id === definition.id);
    const configuration = state?.registered
      ? await inspectRegisteredDefinition({ runner, definition })
      : { configurationCurrent: false, commandMatches: false, argsMatch: false, scopeMatches: false, observedWorkspaceRoot: null };
    servers.push({ id: definition.id, profile: definition.profile, ...state, ...configuration });
  }
  const registrationComplete = servers.every(({ registered }) => registered);
  const configurationCurrent = registrationComplete && servers.every((entry) => entry.configurationCurrent);
  const connected = servers.every((entry) => entry.connected);
  const skill = await skillInspector({ plan });
  const skillCurrent = !skill.required || skill.current;
  const live = servers.find(({ id }) => id === "looplab-live");
  const core = servers.find(({ id }) => id === "looplab-core");
  let liveApp = { checked: false, reachable: false, protocolCurrent: false, appUrl: plan.appUrl };
  if (registrationComplete && configurationCurrent && connected) {
    try {
      liveApp = await appInspector({ appUrl: plan.appUrl, expectedProtocolVersion: LOOPLAB_PROTOCOL_VERSION });
    } catch (error) {
      liveApp = {
        checked: true,
        reachable: false,
        protocolCurrent: false,
        appUrl: plan.appUrl,
        error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      };
    }
  }
  const liveAppReady = liveApp.checked === true && liveApp.reachable === true && liveApp.protocolCurrent === true;
  return {
    schemaVersion: LOOPLAB_CLAUDE_INTEGRATION_SCHEMA,
    available: true,
    parityReady: capabilities.parityReady,
    registrationComplete,
    configurationCurrent,
    skillCurrent,
    connected,
    liveAppReady,
    liveApp,
    operabilityReady: capabilities.parityReady && registrationComplete && configurationCurrent && skillCurrent && connected && liveAppReady,
    capabilities,
    servers,
    skill,
    configuredWorkspaceRoot: core?.observedWorkspaceRoot ?? plan.workspaceRoot,
    nextAction: !capabilities.parityReady
      ? `Upgrade Claude Code to ${CLAUDE_STRUCTURED_OUTPUT_MIN_VERSION} or newer.`
      : !registrationComplete
        ? 'Run npm run claude:setup -- "<games-root>" to register both LoopLab MCP profiles.'
        : !configurationCurrent
          ? 'Run npm run claude:setup -- "<games-root>" to reconcile stale LoopLab MCP paths, scope, workspace, or app URL.'
          : !skillCurrent
            ? 'Run npm run claude:setup -- "<games-root>" to synchronize Claude\'s cross-project LoopLab skill.'
            : !live?.connected
              ? "Start LoopLab, then run npm run claude:status again; registration is already complete."
              : !liveApp.reachable
                ? `Start LoopLab at ${plan.appUrl}, then run npm run claude:status again. The MCP process is connected, but the editor is not reachable.`
                : !liveApp.protocolCurrent
                  ? `Restart LoopLab so ${plan.appUrl} serves protocol ${LOOPLAB_PROTOCOL_VERSION}; it currently reports ${liveApp.observedProtocolVersion ?? "unknown"}.`
                  : connected
                    ? "Claude can use LoopLab through both core and live MCP profiles, and the live editor protocol is current."
                    : "Inspect the unavailable MCP profile with claude mcp get <server-name>.",
    error: listResult?.ok ? null : safeError(listResult, "Claude MCP status could not be read."),
  };
}

export async function installClaudeIntegration({
  runner = runProviderCommand,
  plan = createClaudeIntegrationPlan(),
  skillInspector = inspectClaudeUserSkill,
  skillSync = syncClaudeUserSkill,
  appInspector = inspectLoopLabApp,
} = {}) {
  const before = await inspectClaudeIntegration({ runner, plan, skillInspector, appInspector });
  if (!before.available || !before.parityReady) {
    throw new Error(before.nextAction);
  }
  const added = [];
  const updated = [];
  const skipped = [];
  for (const definition of plan.servers) {
    const current = before.servers.find(({ id }) => id === definition.id);
    if (current?.registered) {
      if (current.configurationCurrent) {
        skipped.push(definition.id);
        continue;
      }
      const removal = await runner("claude", ["mcp", "remove", "--scope", plan.scope, definition.id], { timeoutMs: 30_000 });
      if (!removal?.ok) {
        throw new Error(`Claude MCP reconciliation failed while removing stale ${definition.id}: ${safeError(removal, "unknown CLI error")}`);
      }
    }
    const result = await runner("claude", [
      "mcp",
      "add",
      "--transport",
      "stdio",
      "--scope",
      plan.scope,
      definition.id,
      "--",
      definition.command,
      ...definition.args,
    ], { timeoutMs: 30_000 });
    if (!result?.ok) {
      throw new Error(`Claude MCP registration failed for ${definition.id}: ${safeError(result, "unknown CLI error")}`);
    }
    if (current?.registered) updated.push(definition.id);
    else added.push(definition.id);
  }
  const skill = await skillSync({ plan });
  const after = await inspectClaudeIntegration({ runner, plan, skillInspector, appInspector });
  if (!after.registrationComplete) {
    const missing = after.servers.filter(({ registered }) => !registered).map(({ id }) => id);
    throw new Error(`Claude MCP registration did not persist for ${missing.join(", ")}.`);
  }
  const configurations = after.servers.map(({ id, observedScope, commandMatches, argsMatch, scopeMatches, configurationCurrent, observedWorkspaceRoot }) => ({
    id,
    observedScope,
    commandMatches,
    argsMatch,
    scopeMatches,
    configurationCurrent,
    observedWorkspaceRoot,
  }));
  const stale = configurations.filter(({ configurationCurrent }) => !configurationCurrent).map(({ id }) => id);
  if (stale.length) {
    throw new Error(`Claude MCP registration persisted with stale command arguments for ${stale.join(", ")}.`);
  }
  if (!after.skillCurrent) throw new Error("Claude user skill remained stale after setup.");
  return {
    schemaVersion: LOOPLAB_CLAUDE_INTEGRATION_SCHEMA,
    operation: "install",
    scope: plan.scope,
    workspaceRoot: plan.workspaceRoot,
    appUrl: plan.appUrl,
    added,
    updated,
    skipped,
    configurations,
    skill,
    before,
    after,
    providerUsage: { totalTokens: 0, rateEquivalentUsd: 0 },
  };
}

export function getClaudeIntegrationManifest() {
  return getPortableClaudeIntegrationManifest({ minimumClaudeVersion: CLAUDE_STRUCTURED_OUTPUT_MIN_VERSION });
}
