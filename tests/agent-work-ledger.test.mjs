import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAgentCommand,
  buildStandaloneHtml,
  createTemplate,
  getAgentManifest,
  validateProject,
} from "../lib/looplab-agent-core.mjs";
import {
  agentWorkLedgerDigest,
  applyAgentWorkLedgerCommand,
  getAgentWorkLedger,
  LOOPLAB_AGENT_WORK_LEDGER_SCHEMA,
  validateAgentWorkLedger,
} from "../lib/looplab-agent-work-ledger.mjs";
import { doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import { compactProviderProject } from "../lib/looplab-provider-context.mjs";

const at = (seconds) => new Date(Date.parse("2026-08-09T12:00:00.000Z") + seconds * 1_000);

function addWork(project, item = {}, options = {}) {
  const view = getAgentWorkLedger(project, { now: options.now ?? at(0), eventLimit: 0 });
  return applyAgentWorkLedgerCommand(project, {
    op: "add_work_item",
    expectedLedgerDigest: view.ledgerDigest,
    actor: options.actor ?? "codex",
    item: {
      id: "shared-ledger",
      title: "Shared agent ledger",
      summary: "Coordinate Claude and Codex without changing game source truth.",
      kind: "feature",
      priority: "high",
      scope: ["lib", "tests"],
      ...item,
    },
  }, { now: options.now ?? at(0), sourceDigest: doctorSourceDigest(project) });
}

test("empty work ledger is canonical, bounded, and copy-safe", () => {
  const project = createTemplate("platformer");
  const view = getAgentWorkLedger(project, { eventLimit: 0 });
  assert.equal(view.ledgerSchemaVersion, LOOPLAB_AGENT_WORK_LEDGER_SCHEMA);
  assert.equal(view.total, 0);
  assert.deepEqual(view.recentEvents, []);
  assert.match(view.ledgerDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(view.ledgerDigest, agentWorkLedgerDigest(undefined));
  view.counts.open = 99;
  assert.equal(getAgentWorkLedger(project).counts.open, 0);
});

test("ledger mutations use their own digest and never invalidate gameplay source truth", () => {
  const project = createTemplate("platformer");
  const sourceDigest = doctorSourceDigest(project);
  const added = addWork(project);
  assert.equal(doctorSourceDigest(added.project), sourceDigest);
  assert.equal(added.result.sourceDigestUnchanged, true);
  assert.equal(validateProject(added.project).valid, true);
  assert.equal(validateAgentWorkLedger(added.project.agentWorkLedger).valid, true);

  assert.throws(() => applyAgentWorkLedgerCommand(added.project, {
    op: "add_work_item",
    expectedLedgerDigest: agentWorkLedgerDigest(undefined),
    actor: "claude",
    item: { id: "stale-writer", title: "Stale writer", summary: "This must not land." },
  }, { now: at(1), sourceDigest }), /stale-ledger/);
  assert.equal(added.project.agentWorkLedger.items.some((item) => item.id === "stale-writer"), false);
});

test("claims are renewable expiring leases with deliberate takeover and release rules", () => {
  const source = addWork(createTemplate("platformer")).project;
  const digest0 = agentWorkLedgerDigest(source.agentWorkLedger);
  const claimed = applyAgentWorkLedgerCommand(source, {
    op: "claim_work_item",
    expectedLedgerDigest: digest0,
    id: "shared-ledger",
    actor: "codex",
    leaseSeconds: 300,
  }, { now: at(10), sourceDigest: doctorSourceDigest(source) });
  assert.equal(claimed.result.item.claim.holder, "codex");
  assert.equal(claimed.result.item.claimState, "active");

  assert.throws(() => applyAgentWorkLedgerCommand(claimed.project, {
    op: "claim_work_item",
    expectedLedgerDigest: claimed.result.ledgerDigest,
    id: "shared-ledger",
    actor: "claude",
    leaseSeconds: 300,
  }, { now: at(20) }), /actively claimed by codex/);

  const taken = applyAgentWorkLedgerCommand(claimed.project, {
    op: "claim_work_item",
    expectedLedgerDigest: claimed.result.ledgerDigest,
    id: "shared-ledger",
    actor: "claude",
    leaseSeconds: 600,
    takeover: true,
    takeoverReason: "Codex explicitly handed this subsystem to Claude.",
  }, { now: at(20) });
  assert.equal(taken.result.event.type, "taken-over");
  assert.equal(taken.result.item.claim.holder, "claude");
  assert.equal(taken.result.item.claim.transition, 2);

  const renewed = applyAgentWorkLedgerCommand(taken.project, {
    op: "claim_work_item",
    expectedLedgerDigest: taken.result.ledgerDigest,
    id: "shared-ledger",
    actor: "claude",
    leaseSeconds: 600,
  }, { now: at(30) });
  assert.equal(renewed.result.event.type, "renewed");
  assert.equal(renewed.result.item.claim.transition, 2);

  assert.throws(() => applyAgentWorkLedgerCommand(renewed.project, {
    op: "release_work_item",
    expectedLedgerDigest: renewed.result.ledgerDigest,
    id: "shared-ledger",
    actor: "codex",
  }, { now: at(40) }), /requires overrideReason/);

  const expiredClaim = applyAgentWorkLedgerCommand(claimed.project, {
    op: "claim_work_item",
    expectedLedgerDigest: claimed.result.ledgerDigest,
    id: "shared-ledger",
    actor: "claude",
    leaseSeconds: 300,
  }, { now: at(311) });
  assert.equal(expiredClaim.result.item.claim.holder, "claude");
  assert.equal(expiredClaim.result.event.type, "claimed");
});

test("terminal and blocked states require concrete evidence fields", () => {
  let project = addWork(createTemplate("platformer")).project;
  let digest = agentWorkLedgerDigest(project.agentWorkLedger);
  assert.throws(() => applyAgentWorkLedgerCommand(project, {
    op: "update_work_item", expectedLedgerDigest: digest, id: "shared-ledger", actor: "codex", changes: { status: "blocked" },
  }, { now: at(5) }), /requires at least one blocker/);

  let outcome = applyAgentWorkLedgerCommand(project, {
    op: "update_work_item", expectedLedgerDigest: digest, id: "shared-ledger", actor: "codex", changes: { status: "blocked", blockers: ["Waiting for exact browser evidence."] },
  }, { now: at(5) });
  project = outcome.project;
  digest = outcome.result.ledgerDigest;
  assert.throws(() => applyAgentWorkLedgerCommand(project, {
    op: "update_work_item", expectedLedgerDigest: digest, id: "shared-ledger", actor: "codex", changes: { status: "landed", resultSummary: "Implemented." },
  }, { now: at(6) }), /requires resultSummary and at least one evidenceRefs/);

  outcome = applyAgentWorkLedgerCommand(project, {
    op: "update_work_item",
    expectedLedgerDigest: digest,
    id: "shared-ledger",
    actor: "codex",
    changes: { status: "landed", resultSummary: "Implemented and verified.", evidenceRefs: ["tests/agent-work-ledger.test.mjs"] },
  }, { now: at(7) });
  assert.equal(outcome.result.item.status, "landed");
  assert.equal(outcome.result.item.claim, null);
});

test("strict ledger rejects unknown fields, invalid enums, and credential material", () => {
  const project = createTemplate("platformer");
  const digest = getAgentWorkLedger(project).ledgerDigest;
  assert.throws(() => applyAgentWorkLedgerCommand(project, {
    op: "add_work_item", expectedLedgerDigest: digest, actor: "codex", item: { id: "bad-kind", title: "Bad kind", summary: "Rejected.", kind: "platformer" },
  }), /item.kind must be/);
  assert.throws(() => applyAgentWorkLedgerCommand(project, {
    op: "add_work_item", expectedLedgerDigest: digest, actor: "codex", item: { id: "unknown-field", title: "Unknown", summary: "Rejected.", prompt: "run everything" },
  }), /unsupported field/);
  assert.throws(() => applyAgentWorkLedgerCommand(project, {
    op: "add_work_item", expectedLedgerDigest: digest, actor: "codex", item: { id: "secret", title: "Secret", summary: "OPENAI_API_KEY=sk-proj-test-fixture-abcdefghijklmnop" },
  }), /credential or private-key material/);
});

test("brief exposes bounded shared work while provider context and exported HTML omit it", () => {
  const marker = "PRIVATE-COORDINATION-MARKER-DO-NOT-EXPORT";
  const added = addWork(createTemplate("platformer"), { summary: marker });
  const project = added.project;
  const sourceDigest = doctorSourceDigest(project);
  const brief = applyAgentCommand(project, { op: "get_agent_brief", maxNextActions: 10 }).result;
  assert.equal(brief.sourceDigest, sourceDigest);
  assert.equal(brief.workLedger.items[0].id, "shared-ledger");
  assert.ok(brief.nextActions.some((action) => action.op === "get_work_ledger"));
  assert.ok(brief.playbook.matches.some((recipe) => recipe.id === "coordinate-shared-agent-work"));

  const compact = compactProviderProject(project);
  assert.equal("agentWorkLedger" in compact, false);
  assert.doesNotMatch(JSON.stringify(compact), new RegExp(marker));

  const html = buildStandaloneHtml(project);
  assert.doesNotMatch(html, /agentWorkLedger/);
  assert.doesNotMatch(html, new RegExp(marker));

  const manifest = getAgentManifest();
  assert.deepEqual(manifest.agentWorkLedger.commands, ["get_work_ledger", "add_work_item", "claim_work_item", "update_work_item", "release_work_item"]);
  assert.equal(manifest.agentWorkLedger.privacy.exportedHtml, false);
  assert.equal(manifest.agentWorkLedger.privacy.providerContext, false);
});
