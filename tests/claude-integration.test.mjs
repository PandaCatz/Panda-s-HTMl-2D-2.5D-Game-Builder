import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";

import { getAgentManifest } from "../lib/looplab-agent-core.mjs";
import {
  LOOPLAB_CLAUDE_INTEGRATION_SCHEMA,
  createClaudeIntegrationPlan,
  getClaudeIntegrationManifest,
  inspectClaudeIntegration,
  inspectLoopLabApp,
  inspectClaudeMcpDefinition,
  inspectClaudeMcpList,
  inspectClaudeUserSkill,
  installClaudeIntegration,
  normalizeLoopbackAppUrl,
  syncClaudeUserSkill,
} from "../lib/looplab-claude-integration.mjs";

const LOCAL_BROWSER_MODULE_EXTENSIONS = ["", ".mjs", ".js", ".tsx", ".ts", ".jsx", ".json"];

function currentSkill(plan) {
  return {
    id: plan.skill.id,
    required: plan.skill.required,
    installed: true,
    current: true,
    source: plan.skill.source,
    target: plan.skill.target,
    sourceDigest: "sha256:test",
    targetDigest: "sha256:test",
  };
}

const inspectCurrentSkill = async ({ plan }) => currentSkill(plan);
const syncCurrentSkill = async ({ plan }) => ({ ...currentSkill(plan), action: "skipped" });
const inspectReadyApp = async ({ appUrl, expectedProtocolVersion }) => ({
  checked: true,
  reachable: true,
  protocolCurrent: true,
  appUrl,
  expectedProtocolVersion,
  observedProtocolVersion: expectedProtocolVersion,
  error: null,
});

function resolveLocalBrowserModule(parentFile, specifier) {
  const base = resolve(dirname(parentFile), specifier);
  for (const extension of LOCAL_BROWSER_MODULE_EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  for (const extension of LOCAL_BROWSER_MODULE_EXTENSIONS.slice(1)) {
    const candidate = resolve(base, `index${extension}`);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Cannot resolve browser module ${specifier} from ${parentFile}`);
}

function collectLocalBrowserModuleGraph(entryFile) {
  const pending = [resolve(entryFile)];
  const visited = new Map();
  const importPatterns = [
    /\bimport\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  while (pending.length > 0) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    const source = readFileSync(file, "utf8");
    visited.set(file, source);
    for (const pattern of importPatterns) {
      for (const match of source.matchAll(pattern)) {
        if (match[1].startsWith(".")) pending.push(resolveLocalBrowserModule(file, match[1]));
      }
    }
  }
  return visited;
}

test("browser agent manifest depends only on the portable Claude contract", () => {
  const agentCore = readFileSync(resolve("lib/looplab-agent-core.mjs"), "utf8");
  const portableContract = readFileSync(resolve("lib/looplab-claude-contract.mjs"), "utf8");
  assert.match(agentCore, /from "\.\/looplab-claude-contract\.mjs"/);
  assert.doesNotMatch(agentCore, /from "\.\/looplab-claude-integration\.mjs"/);
  assert.doesNotMatch(portableContract, /node:|looplab-provider-status|child_process/);
});

test("the complete browser module graph cannot reach Node-only provider code", () => {
  const graph = collectLocalBrowserModuleGraph("app/page.tsx");
  assert.ok(graph.size > 20, "the regression must inspect the transitive browser graph, not only the entry file");
  for (const [file, source] of graph) {
    const label = relative(resolve("."), file);
    assert.doesNotMatch(source, /(?:from\s+|import\(\s*)["']node:/, `${label} imports a Node builtin`);
    assert.doesNotMatch(
      source,
      /looplab-(?:provider-status|provider-process|claude-integration)\.mjs/,
      `${label} reaches a Node-only LoopLab provider module`,
    );
  }
});

test("Claude integration plan uses absolute secret-free LoopLab MCP definitions", () => {
  const plan = createClaudeIntegrationPlan({
    projectRoot: resolve("."),
    workspaceRoot: resolve("tests"),
    appUrl: "http://localhost:3000",
  });
  assert.equal(plan.schemaVersion, LOOPLAB_CLAUDE_INTEGRATION_SCHEMA);
  assert.equal(plan.scope, "user");
  assert.equal(plan.appUrl, "http://localhost:3000/");
  assert.deepEqual(plan.servers.map(({ id }) => id), ["looplab-core", "looplab-live"]);
  for (const server of plan.servers) {
    assert.equal(resolve(server.command), server.command);
    assert.equal(resolve(server.args[0]), server.args[0]);
    assert.match(server.args[0], /scripts[\\/]looplab-mcp\.mjs$/);
    assert.doesNotMatch(JSON.stringify(server), /api[_-]?key|token|secret/i);
  }
  assert.match(plan.servers[0].args.join(" "), /--surface=core/);
  assert.match(plan.servers[0].args.join(" "), /--workspace=/);
  assert.match(plan.servers[1].args.join(" "), /--surface=browser/);
  assert.match(plan.servers[1].args.join(" "), /--app-url=http:\/\/localhost:3000\//);
});

test("Claude live integration rejects remote, credentialed, and non-HTTP URLs", () => {
  assert.equal(normalizeLoopbackAppUrl("http://127.0.0.1:3000"), "http://127.0.0.1:3000/");
  assert.throws(() => normalizeLoopbackAppUrl("https://127.0.0.1:3000"), /restricted/);
  assert.throws(() => normalizeLoopbackAppUrl("http://example.com:3000"), /restricted/);
  assert.throws(() => createClaudeIntegrationPlan({ scope: "project" }), /scope must be/);
});

test("Claude live-app probe verifies the exact public manifest protocol without invoking a provider", async () => {
  const requests = [];
  const ready = await inspectLoopLabApp({
    appUrl: "http://127.0.0.1:3000/",
    expectedProtocolVersion: "1.96.0",
    fetchImpl: async (url) => {
      requests.push(url);
      return new Response(JSON.stringify({ protocolVersion: "1.96.0" }), { status: 200 });
    },
  });
  assert.deepEqual(requests, ["http://127.0.0.1:3000/agent-manifest.json"]);
  assert.equal(ready.reachable, true);
  assert.equal(ready.protocolCurrent, true);

  const stale = await inspectLoopLabApp({
    appUrl: "http://127.0.0.1:3000/",
    expectedProtocolVersion: "1.96.0",
    fetchImpl: async () => new Response(JSON.stringify({ protocolVersion: "1.90.0" }), { status: 200 }),
  });
  assert.equal(stale.reachable, true);
  assert.equal(stale.protocolCurrent, false);
  assert.match(stale.error, /reports protocol 1\.90\.0/);

  const offline = await inspectLoopLabApp({
    fetchImpl: async () => { throw new Error("connection refused"); },
  });
  assert.equal(offline.reachable, false);
  assert.match(offline.error, /connection refused/);
});

test("Claude MCP list inspection separates registration from connectivity", () => {
  const entries = inspectClaudeMcpList([
    "Checking MCP server health…",
    "looplab-core: node server --surface=core - √ Connected",
    "looplab-live: node server --surface=browser - × Failed to connect",
  ].join("\n"));
  assert.deepEqual(entries, [
    { id: "looplab-core", registered: true, connected: true, state: "connected" },
    { id: "looplab-live", registered: true, connected: false, state: "unavailable" },
  ]);
});

test("Claude integration status reports the exact missing registration without invoking a model", async () => {
  const calls = [];
  const runner = async (command, args) => {
    calls.push([command, args]);
    if (args[0] === "--version") return { ok: true, stdout: "2.1.224 (Claude Code)", stderr: "" };
    return { ok: true, stdout: "other: https://example.test/mcp - √ Connected", stderr: "" };
  };
  const status = await inspectClaudeIntegration({ runner, plan: createClaudeIntegrationPlan(), skillInspector: inspectCurrentSkill });
  assert.equal(status.available, true);
  assert.equal(status.parityReady, true);
  assert.equal(status.registrationComplete, false);
  assert.deepEqual(status.servers.map(({ state }) => state), ["missing", "missing"]);
  assert.match(status.nextAction, /claude:setup/);
  assert.match(status.nextAction, /claude:setup -- "<games-root>"/);
  assert.equal(calls.length, 2);
});

test("Claude status rejects connected registrations whose exact definition is stale", async () => {
  const plan = createClaudeIntegrationPlan({ workspaceRoot: resolve("tests") });
  const runner = async (command, args) => {
    assert.equal(command, "claude");
    if (args[0] === "--version") return { ok: true, stdout: "2.1.224 (Claude Code)", stderr: "" };
    if (args[0] === "mcp" && args[1] === "list") {
      return { ok: true, stdout: plan.servers.map(({ id }) => `${id}: node LoopLab - √ Connected`).join("\n"), stderr: "" };
    }
    if (args[0] === "mcp" && args[1] === "get") {
      const definition = plan.servers.find(({ id }) => id === args[2]);
      const staleArgs = definition.id === "looplab-core"
        ? definition.args.map((entry) => entry.startsWith("--workspace=") ? `--workspace=${resolve(".")}` : entry)
        : definition.args;
      return {
        ok: true,
        stdout: `${definition.id}:\n  Scope: User config (available in all your projects)\n  Status: √ Connected\n  Type: stdio\n  Command: ${definition.command}\n  Args: ${staleArgs.join(" ")}\n  Environment:`,
        stderr: "",
      };
    }
    throw new Error(`Unexpected Claude test command: ${args.join(" ")}`);
  };
  const status = await inspectClaudeIntegration({ runner, plan, skillInspector: inspectCurrentSkill });
  assert.equal(status.registrationComplete, true);
  assert.equal(status.connected, true);
  assert.equal(status.configurationCurrent, false);
  assert.equal(status.operabilityReady, false);
  assert.equal(status.servers.find(({ id }) => id === "looplab-core").argsMatch, false);
  assert.match(status.nextAction, /reconcile stale LoopLab MCP paths/);
});

test("Claude status rejects a connected live MCP when the actual editor is unreachable", async () => {
  const plan = createClaudeIntegrationPlan({ workspaceRoot: resolve("tests") });
  const runner = async (command, args) => {
    assert.equal(command, "claude");
    if (args[0] === "--version") return { ok: true, stdout: "2.1.224 (Claude Code)", stderr: "" };
    if (args[0] === "mcp" && args[1] === "list") {
      return { ok: true, stdout: plan.servers.map(({ id }) => `${id}: node LoopLab - √ Connected`).join("\n"), stderr: "" };
    }
    if (args[0] === "mcp" && args[1] === "get") {
      const definition = plan.servers.find(({ id }) => id === args[2]);
      return {
        ok: true,
        stdout: `${definition.id}:\n  Scope: User config (available in all your projects)\n  Status: √ Connected\n  Type: stdio\n  Command: ${definition.command}\n  Args: ${definition.args.join(" ")}\n  Environment:`,
        stderr: "",
      };
    }
    throw new Error(`Unexpected Claude test command: ${args.join(" ")}`);
  };
  const status = await inspectClaudeIntegration({
    runner,
    plan,
    skillInspector: inspectCurrentSkill,
    appInspector: async ({ appUrl }) => ({ checked: true, reachable: false, protocolCurrent: false, appUrl, error: "connection refused" }),
  });
  assert.equal(status.connected, true);
  assert.equal(status.liveAppReady, false);
  assert.equal(status.operabilityReady, false);
  assert.match(status.nextAction, /MCP process is connected, but the editor is not reachable/);
});

test("Claude definition inspection accepts an existing configured workspace only in discovery mode", () => {
  const strict = createClaudeIntegrationPlan({ workspaceRoot: resolve("tests") }).servers[0];
  const observedArgs = strict.args.map((entry) => entry.startsWith("--workspace=") ? `--workspace=${resolve(".")}` : entry);
  const output = `Scope: User config (available in all your projects)\nCommand: ${strict.command}\nArgs: ${observedArgs.join(" ")}`;
  assert.equal(inspectClaudeMcpDefinition(output, strict).configurationCurrent, false);
  assert.equal(inspectClaudeMcpDefinition(output, { ...strict, allowConfiguredWorkspace: true }).configurationCurrent, true);
});

test("Claude setup registers only missing user-scoped servers with correct option ordering", async () => {
  const registered = new Set();
  const addCalls = [];
  const plan = createClaudeIntegrationPlan();
  const runner = async (command, args) => {
    assert.equal(command, "claude");
    if (args[0] === "--version") return { ok: true, stdout: "2.1.224 (Claude Code)", stderr: "" };
    if (args[0] === "mcp" && args[1] === "list") {
      return { ok: true, stdout: [...registered].map((id) => `${id}: node LoopLab - √ Connected`).join("\n"), stderr: "" };
    }
    if (args[0] === "mcp" && args[1] === "get") {
      const definition = plan.servers.find(({ id }) => id === args[2]);
      return {
        ok: true,
        stdout: `${definition.id}:\n  Scope: User config (available in all your projects)\n  Status: √ Connected\n  Type: stdio\n  Command: ${definition.command}\n  Args: ${definition.args.join(" ")}\n  Environment:`,
        stderr: "",
      };
    }
    if (args[0] === "mcp" && args[1] === "add") {
      addCalls.push(args);
      const separator = args.indexOf("--");
      assert.ok(separator > 0);
      const id = args[separator - 1];
      registered.add(id);
      return { ok: true, stdout: `Added ${id}`, stderr: "" };
    }
    throw new Error(`Unexpected Claude test command: ${args.join(" ")}`);
  };
  const result = await installClaudeIntegration({ runner, plan, skillInspector: inspectCurrentSkill, skillSync: syncCurrentSkill, appInspector: inspectReadyApp });
  assert.deepEqual(result.added, ["looplab-core", "looplab-live"]);
  assert.deepEqual(result.skipped, []);
  assert.equal(result.after.registrationComplete, true);
  assert.equal(result.after.connected, true);
  assert.equal(result.after.liveAppReady, true);
  assert.deepEqual(result.providerUsage, { totalTokens: 0, rateEquivalentUsd: 0 });
  for (const args of addCalls) {
    assert.deepEqual(args.slice(0, 6), ["mcp", "add", "--transport", "stdio", "--scope", "user"]);
  }

  const second = await installClaudeIntegration({ runner, plan, skillInspector: inspectCurrentSkill, skillSync: syncCurrentSkill, appInspector: inspectReadyApp });
  assert.deepEqual(second.added, []);
  assert.deepEqual(second.skipped, ["looplab-core", "looplab-live"]);
  assert.equal(addCalls.length, 2, "idempotent setup must not rewrite existing registrations");
});

test("Claude setup replaces stale LoopLab registrations and verifies exact arguments", async () => {
  const plan = createClaudeIntegrationPlan({ workspaceRoot: "H:\\games-root" });
  const configurations = new Map(plan.servers.map((definition) => [definition.id, {
    command: definition.command,
    args: definition.args.map((entry) => definition.id === "looplab-core"
      ? entry.replace("H:\\games-root", "H:\\stale")
      : entry.replace("http://127.0.0.1:3000/", "http://127.0.0.1:3999/")),
  }]));
  const removals = [];
  const additions = [];
  const runner = async (command, args) => {
    assert.equal(command, "claude");
    if (args[0] === "--version") return { ok: true, stdout: "2.1.224 (Claude Code)", stderr: "" };
    if (args[0] === "mcp" && args[1] === "list") {
      return { ok: true, stdout: [...configurations.keys()].map((id) => `${id}: node LoopLab - √ Connected`).join("\n"), stderr: "" };
    }
    if (args[0] === "mcp" && args[1] === "get") {
      const current = configurations.get(args[2]);
      return {
        ok: true,
        stdout: `${args[2]}:\n  Scope: User config (available in all your projects)\n  Status: √ Connected\n  Type: stdio\n  Command: ${current.command}\n  Args: ${current.args.join(" ")}\n  Environment:`,
        stderr: "",
      };
    }
    if (args[0] === "mcp" && args[1] === "remove") {
      const id = args.at(-1);
      removals.push(id);
      configurations.delete(id);
      return { ok: true, stdout: `Removed ${id}`, stderr: "" };
    }
    if (args[0] === "mcp" && args[1] === "add") {
      const separator = args.indexOf("--");
      const id = args[separator - 1];
      additions.push(id);
      configurations.set(id, { command: args[separator + 1], args: args.slice(separator + 2) });
      return { ok: true, stdout: `Added ${id}`, stderr: "" };
    }
    throw new Error(`Unexpected Claude test command: ${args.join(" ")}`);
  };

  const result = await installClaudeIntegration({ runner, plan, skillInspector: inspectCurrentSkill, skillSync: syncCurrentSkill, appInspector: inspectReadyApp });
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.updated, ["looplab-core", "looplab-live"]);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(removals, ["looplab-core", "looplab-live"]);
  assert.deepEqual(additions, ["looplab-core", "looplab-live"]);
  assert.ok(result.configurations.every(({ configurationCurrent }) => configurationCurrent));
});

test("Claude setup atomically synchronizes the repository-owned skill for cross-project use", async () => {
  const root = await mkdtemp(join(tmpdir(), "looplab-claude-skill-"));
  try {
    const projectRoot = join(root, "checkout");
    const userHome = join(root, "user");
    const source = join(projectRoot, ".claude", "skills", "looplab-game-builder", "SKILL.md");
    const target = join(userHome, ".claude", "skills", "looplab-game-builder", "SKILL.md");
    await mkdir(dirname(source), { recursive: true });
    await mkdir(dirname(target), { recursive: true });
    await writeFile(source, "---\nname: looplab-game-builder\n---\n\ncurrent instructions\n", "utf8");
    await writeFile(target, "---\nname: looplab-game-builder\n---\n\nstale instructions\n", "utf8");
    const plan = createClaudeIntegrationPlan({ projectRoot, workspaceRoot: root, userHome });
    const before = await inspectClaudeUserSkill({ plan });
    assert.equal(before.installed, true);
    assert.equal(before.current, false);
    const synchronized = await syncClaudeUserSkill({ plan });
    assert.equal(synchronized.action, "updated");
    assert.equal(synchronized.current, true);
    assert.equal(await readFile(target, "utf8"), await readFile(source, "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generated manifest exposes Claude bootstrap without changing provider authority", () => {
  const portable = getClaudeIntegrationManifest();
  const manifest = getAgentManifest();
  assert.deepEqual(manifest.claudeIntegration, portable);
  assert.equal(portable.schemaVersion, LOOPLAB_CLAUDE_INTEGRATION_SCHEMA);
  assert.equal(portable.minimumClaudeVersion, "2.1.205");
  assert.equal(portable.statusCommand, "npm run claude:status");
  assert.match(portable.setupCommand, /claude:setup/);
  assert.equal(portable.setupCommand, 'npm run claude:setup -- "<games-root>"');
  assert.match(portable.smokeCommand, /claude:smoke/);
  assert.match(portable.crossProjectSkill, /atomically synchronizes/);
  assert.match(portable.providerBoundary, /MCP-free/);
  assert.deepEqual(Object.keys(portable.mcpProfiles), ["looplab-core", "looplab-live"]);
});
