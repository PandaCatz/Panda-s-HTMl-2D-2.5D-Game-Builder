import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildStandaloneHtml, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { getLooplabCommandContracts } from "../lib/looplab-agent-contracts.mjs";
import { LOOPLAB_BROWSER_ONLY_COMMANDS, LOOPLAB_CORE_COMMANDS } from "../lib/looplab-command-surfaces.mjs";

const OPS = [
  "get_preference_memory",
  "get_applied_preferences",
  "set_preference_memory_enabled",
  "add_preference_statement",
  "record_candidate_preference",
  "update_preference_entry",
  "remove_preference_entry",
  "clear_preference_memory",
  "import_preference_memory",
];

test("preference memory has one strict browser-session contract for mouse, Codex, and Claude", () => {
  const contracts = new Map(getLooplabCommandContracts().map((contract) => [contract.op, contract]));
  const manifest = getAgentManifest();
  for (const op of OPS) {
    assert.ok(manifest.commands.includes(op), `${op} missing from manifest`);
    assert.ok(LOOPLAB_BROWSER_ONLY_COMMANDS.includes(op), `${op} must use the shared live browser session`);
    assert.ok(!LOOPLAB_CORE_COMMANDS.includes(op), `${op} must not silently read browser-local memory in file-only core mode`);
    assert.deepEqual(contracts.get(op).surfaces, ["browser-session"]);
    assert.equal(contracts.get(op).requiresSourceDigestInMcp, false);
  }
  assert.equal(contracts.get("get_preference_memory").mutatesProject, false);
  assert.equal(contracts.get("get_applied_preferences").mutatesProject, false);
  assert.equal(contracts.get("add_preference_statement").mutatesProject, false);
  assert.equal(contracts.get("record_candidate_preference").mutatesProject, false);
  assert.equal(contracts.get("clear_preference_memory").mutatesProject, false);
  assert.equal(contracts.get("add_preference_statement").mutatesBuilderState, true);
  assert.equal(contracts.get("record_candidate_preference").mutatesBuilderState, true);
  assert.equal(contracts.get("clear_preference_memory").mutatesBuilderState, true);
  assert.equal(manifest.preferenceMemory.schemaVersion, "looplab-preference-memory/v1");
  assert.equal(manifest.preferenceMemory.appliedContextSchemaVersion, "looplab-applied-preference-context/v1");
  assert.deepEqual(manifest.preferenceMemory.commands, OPS);
  assert.equal(manifest.transport.preferenceMemoryStateSelector, "#looplab-preference-memory-state");
  assert.equal(manifest.transport.preferenceMemoryChangeEvent, "looplab:preference-memory-changed");
  assert.equal(contracts.get("get_applied_preferences").inputSchema.properties.context.additionalProperties, false);
  assert.equal(contracts.get("add_preference_statement").inputSchema.properties.context.additionalProperties, false);
  assert.equal(contracts.get("update_preference_entry").inputSchema.properties.changes.additionalProperties, false);
  assert.equal(contracts.get("import_preference_memory").inputSchema.properties.memory.additionalProperties, false);
  assert.equal(contracts.get("start_ai_build").inputSchema.properties.preferenceContext.additionalProperties, false);
});

test("Director exposes visible preference controls and the exact headless operations", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Studio preference memory/);
  assert.match(page, /Local, explicit, inspectable/);
  assert.match(page, /Remember your choice/);
  assert.match(page, /id="looplab-preference-memory-state"/);
  assert.match(page, /looplab:preference-memory-changed/);
  assert.match(page, /command\.op === "get_preference_memory"/);
  assert.match(page, /command\.op === "record_candidate_preference"/);
  assert.match(page, /preferenceContext: runPreferenceContext/);
  assert.match(page, /Builder-local only\. It never stores screenshots/);
});

test("durable provider paths carry a validated receipt without putting memory in one-file games", async () => {
  const [loop, companion, prompt] = await Promise.all([
    readFile(new URL("../scripts/looplab-loop.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/looplab-companion.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/looplab-prompt.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(companion, /normalizeAppliedPreferenceContext\(payload\.preferenceContext\)/);
  assert.match(companion, /--preference-context/);
  assert.match(loop, /soft guidance, never as a score, hidden reward, hard acceptance condition, or automatic winner/i);
  assert.match(loop, /preferenceReceipt/);
  assert.match(prompt, /current USER VISION, directed constraints, and explicit style locks override it/i);

  const html = buildStandaloneHtml(createTemplate("platformer"));
  assert.ok(!html.includes("looplab-preference-memory/v1"));
  assert.ok(!html.includes("looplab-applied-preference-context/v1"));
  assert.ok(!html.includes("PREFERENCE_MEMORY_STORAGE_KEY"));
});
