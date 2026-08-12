import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { applyAgentCommand, createTemplate, getAgentManifest, getCompactAgentManifest } from "../lib/looplab-agent-core.mjs";
import {
  LOOPLAB_AGENT_COMMANDS,
  LOOPLAB_BROWSER_ONLY_COMMANDS,
  LOOPLAB_BROWSER_SESSION_COMMANDS,
  LOOPLAB_CORE_COMMANDS,
  looplabCommandSurface,
} from "../lib/looplab-command-surfaces.mjs";

test("manifest command surfaces are derived from the dispatcher registry without overlap or omissions", async () => {
  const manifest = getAgentManifest();
  assert.deepEqual(manifest.commands, [...LOOPLAB_AGENT_COMMANDS]);
  assert.deepEqual(manifest.commandSurfaces.core, [...LOOPLAB_CORE_COMMANDS]);
  assert.deepEqual(manifest.commandSurfaces.browserSession, [...LOOPLAB_BROWSER_SESSION_COMMANDS]);
  assert.deepEqual(manifest.commandSurfaces.browserOnly, [...LOOPLAB_BROWSER_ONLY_COMMANDS]);
  assert.equal(new Set(LOOPLAB_AGENT_COMMANDS).size, LOOPLAB_AGENT_COMMANDS.length);
  assert.deepEqual(new Set([...LOOPLAB_CORE_COMMANDS, ...LOOPLAB_BROWSER_ONLY_COMMANDS]), new Set(LOOPLAB_AGENT_COMMANDS));
  assert.equal(LOOPLAB_CORE_COMMANDS.some((op) => LOOPLAB_BROWSER_ONLY_COMMANDS.includes(op)), false);

  const source = await readFile(new URL("../lib/looplab-agent-core.mjs", import.meta.url), "utf8");
  const dispatcher = source.slice(source.indexOf("export function applyAgentCommand"), source.indexOf("export function getAgentManifest"));
  const implemented = new Set(["replace_project", ...[...dispatcher.matchAll(/case "([^"]+)"/g)].map((match) => match[1])]);
  const implementedCore = new Set([...implemented].filter((op) => looplabCommandSurface(op) === "core"));
  const implementedTrustedLifecycle = new Set([...implemented].filter((op) => looplabCommandSurface(op) === "browser-session"));
  assert.deepEqual(new Set(LOOPLAB_CORE_COMMANDS), implementedCore);
  assert.deepEqual(implementedTrustedLifecycle, new Set(["verify_iteration", "promote_iteration"]));
});

test("compact manifest is a bounded parseable browser bootstrap with every command", () => {
  const full = getAgentManifest();
  const compact = getCompactAgentManifest();
  const serialized = JSON.stringify({ ok: true, manifest: compact });
  assert.ok(serialized.length < 100_000, `compact browser manifest must stay below 100,000 characters, received ${serialized.length}`);
  assert.deepEqual(JSON.parse(serialized), { ok: true, manifest: compact });
  assert.equal(compact.compact, true);
  assert.equal(compact.protocolVersion, full.protocolVersion);
  assert.equal(compact.commandContracts.count, full.commandContracts.commands.length);
  assert.deepEqual(compact.commandContracts.commands.map((command) => command.op), full.commandContracts.commands.map((command) => command.op));
  assert.equal(compact.fullManifest.url, "/agent-manifest.json");
  assert.equal(compact.commandContracts.commands.find((command) => command.op === "run_structural_scaffold_search")?.mutates, null);
});

test("core transport reports the correct browser-session transport instead of a bare unknown-op error", () => {
  const project = createTemplate("platformer");
  assert.equal(looplabCommandSurface("set_mode"), "browser-session");
  assert.equal(looplabCommandSurface("verify_iteration"), "browser-session");
  assert.equal(looplabCommandSurface("promote_iteration"), "browser-session");
  assert.equal(looplabCommandSurface("set_project"), "core");
  assert.equal(looplabCommandSurface("not_real"), null);
  assert.throws(() => applyAgentCommand(project, { op: "set_mode", mode: "play" }), /browser-session command.*window\.looplabAgent.*#looplab-agent-bridge/);
  assert.throws(() => applyAgentCommand(project, { op: "verify_iteration", evidenceRefs: [] }), /browser-session command/);
  assert.throws(() => applyAgentCommand(project, { op: "promote_iteration" }), /browser-session command/);
  assert.throws(() => applyAgentCommand(project, { op: "not_real" }), /Unknown command op: not_real/);
});

test("every browser-only command is represented by the real browser dispatcher", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /import \{ validateLooplabCommandInput \} from "\.\.\/lib\/looplab-agent-contracts\.mjs";/);
  assert.match(page, /const inputValidation = validateLooplabCommandInput\(command\);[\s\S]*?\[invalid-command\]/);
  assert.match(page, /const activeProvider = overrides\.provider \?\? aiProvider;/);
  assert.match(page, /queueAiBuild\(\{ provider: \["openai", "anthropic", "codex", "claude"\]/);
  for (const op of LOOPLAB_BROWSER_ONLY_COMMANDS) {
    assert.match(page, new RegExp(`command\\.op === ["']${op}["']`), `${op} must have a browser-session dispatcher branch`);
  }
});

test("verify-everything is discoverable, exact-artifact-bound, and refuses stale project writes", async () => {
  const source = await readFile(new URL("../scripts/looplab-agent.mjs", import.meta.url), "utf8");
  assert.match(source, /verifyEverything: "npm run agent -- verify-everything/);
  assert.match(source, /collectVerificationEvidence: true/);
  assert.match(source, /applyCollectedVerificationEvidence\(outcome\.project, outcome\.verificationEvidence\.evidenceRefs\)/);
  assert.match(source, /currentProjectSha256 !== originalProjectSha256/);
  assert.match(source, /No HTML, receipt, or project update was written/);
  assert.match(source, /writeTextAtomic\(outputPath, outcome\.html\)/);
  assert.match(source, /schemaVersion: "looplab-verify-everything-receipt\/v1"/);
});