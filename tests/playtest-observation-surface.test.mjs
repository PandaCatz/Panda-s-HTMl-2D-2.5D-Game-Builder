import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildStandaloneHtml, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { getLooplabCommandContracts } from "../lib/looplab-agent-contracts.mjs";
import { LOOPLAB_BROWSER_ONLY_COMMANDS, LOOPLAB_CORE_COMMANDS } from "../lib/looplab-command-surfaces.mjs";

const SESSION_OPS = [
  "get_playtest_sessions",
  "get_active_playtest_session",
  "start_playtest_session",
  "finish_playtest_session",
  "discard_playtest_session",
  "update_playtest_feedback",
  "remove_playtest_session",
  "clear_playtest_sessions",
  "import_playtest_sessions",
];

const PROMOTION_OPS = ["preview_playtest_replay", "promote_playtest_replay"];
const OPS = [...SESSION_OPS, ...PROMOTION_OPS];

const READ_OPS = new Set(["get_playtest_sessions", "get_active_playtest_session"]);

test("consented playtest observation has one browser-session contract for mouse, Codex, and Claude", () => {
  const contracts = new Map(getLooplabCommandContracts().map((contract) => [contract.op, contract]));
  const manifest = getAgentManifest();
  for (const op of SESSION_OPS) {
    const contract = contracts.get(op);
    assert.ok(manifest.commands.includes(op), `${op} missing from manifest`);
    assert.ok(LOOPLAB_BROWSER_ONLY_COMMANDS.includes(op), `${op} must use the shared live browser session`);
    assert.ok(!LOOPLAB_CORE_COMMANDS.includes(op), `${op} must not read browser-local observations in file-only core mode`);
    assert.deepEqual(contract.surfaces, ["browser-session"]);
    assert.equal(contract.requiresSourceDigestInMcp, false);
    assert.equal(contract.mutatesProject, false);
    assert.equal(contract.mutatesBuilderState, !READ_OPS.has(op));
    assert.equal(contract.inputSchema.additionalProperties, false);
  }

  for (const op of PROMOTION_OPS) {
    const contract = contracts.get(op);
    assert.ok(manifest.commands.includes(op), `${op} missing from manifest`);
    assert.ok(LOOPLAB_CORE_COMMANDS.includes(op), `${op} must work for file-only Codex and Claude clients`);
    assert.ok(!LOOPLAB_BROWSER_ONLY_COMMANDS.includes(op), `${op} must not be trapped in browser-local state`);
    assert.deepEqual(contract.surfaces, ["core", "browser-session"]);
    assert.equal(contract.mutatesProject, op === "promote_playtest_replay");
    assert.equal(contract.mutatesBuilderState, false);
    assert.equal(contract.requiresSourceDigestInMcp, op === "promote_playtest_replay");
    assert.equal(contract.inputSchema.additionalProperties, false);
  }

  assert.deepEqual(manifest.playtestObservation.commands, OPS);
  assert.equal(manifest.playtestObservation.ledgerSchemaVersion, "looplab-playtest-ledger/v1");
  assert.equal(manifest.playtestObservation.sessionSchemaVersion, "looplab-playtest-session/v2");
  assert.equal(manifest.playtestObservation.policy.optInRequired, true);
  assert.equal(manifest.playtestObservation.policy.networkTelemetry, false);
  assert.equal(manifest.playtestObservation.policy.projectSource, false);
  assert.equal(manifest.playtestObservation.policy.providerContext, false);
  assert.equal(manifest.playtestObservation.policy.exportedHtml, false);
  assert.equal(manifest.playtestObservation.policy.verificationEvidence, false);
  assert.equal(manifest.playtestObservation.policy.replayFixture, false);
  assert.equal(manifest.playtestObservation.policy.automaticPreference, false);
  assert.equal(manifest.playtestObservation.policy.behavioralTasteInference, false);
  assert.equal(manifest.playtestObservation.policy.arbitraryKeys, false);
  assert.equal(manifest.transport.playtestObservationStateSelector, "#looplab-playtest-observation-state");
  assert.equal(manifest.transport.playtestObservationChangeEvent, "looplab:playtest-observation-changed");

  const startSchema = contracts.get("start_playtest_session").inputSchema;
  assert.ok(startSchema.required.includes("consent"));
  assert.equal(startSchema.properties.consent.type, "boolean");
  const importSchema = contracts.get("import_playtest_sessions").inputSchema;
  assert.equal(importSchema.properties.ledger.additionalProperties, false);
  assert.equal(importSchema.properties.ledger.properties.sessions.items.additionalProperties, false);
  assert.equal(importSchema.properties.ledger.properties.sessions.items.properties.source.additionalProperties, false);
  const sourceDigestPattern = new RegExp(importSchema.properties.ledger.properties.sessions.items.properties.source.properties.sourceDigest.pattern);
  assert.equal(sourceDigestPattern.test("source-" + "a".repeat(64)), true);
  assert.equal(sourceDigestPattern.test("source-"), false);
  assert.equal(importSchema.properties.ledger.properties.sessions.items.properties.feedback.additionalProperties, false);
  const sessionSchema = importSchema.properties.ledger.properties.sessions.items;
  for (const field of ["suspensions", "dropped", "feedback", "summary", "policy"]) {
    assert.equal(sessionSchema.properties[field].additionalProperties, false, `${field} must reject unknown import fields`);
  }
  assert.equal(sessionSchema.properties.inputTape.oneOf.length, 2);
  for (const tapeSchema of sessionSchema.properties.inputTape.oneOf) {
    assert.equal(tapeSchema.additionalProperties, false, "every input tape version must reject unknown import fields");
    assert.equal(tapeSchema.properties.transitions.items.additionalProperties, false);
  }
  assert.equal(sessionSchema.properties.samples.items.additionalProperties, false);
  assert.equal(sessionSchema.properties.events.items.additionalProperties, false);
  assert.equal(sessionSchema.properties.idleSpans.items.additionalProperties, false);
  assert.equal(sessionSchema.properties.summary.properties.counts.additionalProperties, false);
  assert.equal(sessionSchema.properties.summary.properties.mapStats.items.additionalProperties, false);
  assert.equal(sessionSchema.properties.summary.properties.heatmaps.items.additionalProperties, false);
  assert.equal(sessionSchema.properties.summary.properties.heatmaps.items.properties.cells.items.additionalProperties, false);
});

test("the visible recorder is explicit, selectable, source-bound, and also headlessly operable", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Human Play Sessions/);
  assert.match(page, /RECORD PLAYTEST LOCALLY/);
  assert.match(page, /Nothing is sent over the network/);
  assert.match(page, /never sends telemetry, changes project source, automatically becomes a replay fixture, or decides which version wins/);
  assert.match(page, /id="looplab-playtest-observation-state"/);
  assert.match(page, /looplab:playtest-observation-changed/);
  assert.match(page, /selectedPlaytestCurrentSource && selectedPlaytestHeatmap/);
  assert.match(page, /Overlay withheld because the project source changed/);
  assert.match(page, /Save explicit feedback/);
  assert.match(page, /session\.source\.projectName/);
  assert.match(page, /command\.op === "start_playtest_session"/);
  assert.match(page, /start_playtest_session requires explicit consent=true/);
  assert.match(page, /command\.op === "get_playtest_sessions"/);
  assert.match(page, /command\.op === "import_playtest_sessions"/);
  assert.match(page, /command\.op === "preview_playtest_replay"/);
  assert.match(page, /command\.op === "promote_playtest_replay"/);
  assert.match(page, /Review exact replay/);
  assert.match(page, /Protect this run/);
  assert.match(page, /const canonicalSession = getPlaytestSession\(playtestLedgerRef\.current, selectedPlaytestSession\.id\) as PlaytestSession;/);
  assert.match(page, /const outcome = applyAgentCommand\(projectRef\.current, \{\s*op: "preview_playtest_replay",\s*session: canonicalSession,/s);
  assert.match(page, /const outcome = applyAgentCommand\(projectRef\.current, \{\s*op: "promote_playtest_replay",\s*session: canonicalSession,/s);
  assert.match(page, /playtest\.replay\.failed/);
  assert.match(page, /selectPlaytestSession\(parsedPlaytests\.sessions\.at\(-1\)\?\.id \?\? null\)/);
  assert.match(page, /selectPlaytestSession\(ledger\.sessions\.at\(-1\)\?\.id \?\? null\)/);
  assert.match(styles, /\.playtest-heatmap-overlay/);
  assert.match(styles, /\.playtest-observation-panel/);
  assert.match(styles, /\.playtest-replay-actions/);
});

test("the playtest workspace owns a bounded grid row instead of covering the playable canvas", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /\(isPlaying \|\| playtestLedger\.sessions\.length > 0\) \? "has-playtest-observations"/);
  assert.match(styles, /\.stage-panel\.has-playtest-observations\s*\{[^}]*clamp\(180px, 32vh, 300px\)[^}]*\}/s);
  assert.match(styles, /\.stage-panel\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[^}]*\}/s);
  assert.match(styles, /\.workspace\.preview-focus \.stage-panel\.has-playtest-observations\s*\{[^}]*clamp\(180px, 32vh, 300px\)[^}]*\}/s);
  assert.match(styles, /\.playtest-observation-panel\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*auto;[^}]*\}/s);
});

test("browser-local observations never enter project JSON or the one-file game export", () => {
  const project = createTemplate("platformer");
  assert.equal(Object.prototype.hasOwnProperty.call(project, "playtestLedger"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(project, "playtestSessions"), false);

  const html = buildStandaloneHtml(project);
  for (const forbidden of [
    "looplab-playtest-ledger/v1",
    "looplab-playtest-session/v1",
    "looplab-playtest-session/v2",
    "PLAYTEST_LEDGER_STORAGE_KEY",
    "Human Play Sessions",
    "playtest-heatmap-overlay",
    "behavioralTasteInference",
  ]) assert.ok(!html.includes(forbidden), `${forbidden} leaked into exported HTML`);
});
