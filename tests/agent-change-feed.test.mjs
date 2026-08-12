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
  LOOPLAB_AGENT_CHANGE_FEED_LIMITS,
  LOOPLAB_AGENT_CHANGE_FEED_SCHEMA,
  getAgentChanges,
  recordAgentProjectChange,
  validateAgentChangeFeed,
} from "../lib/looplab-agent-change-feed.mjs";
import { getLooplabCommandContract } from "../lib/looplab-agent-contracts.mjs";
import { doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import { getAgentWorkLedger } from "../lib/looplab-agent-work-ledger.mjs";

const at = (seconds) => new Date(Date.parse("2026-08-10T12:00:00.000Z") + seconds * 1_000).toISOString();

function rename(project, name, seconds = 0) {
  return recordAgentProjectChange(project, { ...project, name }, { op: "set_project" }, { now: at(seconds), channel: "headless" });
}

test("an untouched project exposes a stable opaque bookmark without mutating project source", () => {
  const project = createTemplate("blank");
  const before = structuredClone(project);
  const first = getAgentChanges(project);
  const second = getAgentChanges(project);

  assert.equal(first.schemaVersion, LOOPLAB_AGENT_CHANGE_FEED_SCHEMA);
  assert.match(first.currentCursor, /^sha256:[a-f0-9]{64}$/);
  assert.equal(second.currentCursor, first.currentCursor);
  assert.equal(first.baselineStatus, "established");
  assert.equal(first.returnedEventCount, 0);
  assert.equal(first.resyncRequired, false);
  assert.deepEqual(project, before);
  assert.equal(project.authoring?.agentChangeFeed, undefined);
});

test("a successful headless mutation records one source-bound semantic event", () => {
  const project = createTemplate("blank");
  const origin = getAgentChanges(project).currentCursor;
  const platform = project.objects.find((object) => object.kind === "platform");
  assert.ok(platform);

  const outcome = applyAgentCommand(project, {
    op: "update_object",
    id: platform.id,
    changes: { color: "#3f4046" },
    expectedSourceDigest: doctorSourceDigest(project),
  });
  const resumed = getAgentChanges(outcome.project, { cursor: origin });

  assert.equal(outcome.changed, true);
  assert.equal(resumed.baselineStatus, "origin");
  assert.equal(resumed.returnedEventCount, 1);
  assert.equal(resumed.events[0].operation, "update_object");
  assert.equal(resumed.events[0].category, "authored");
  assert.equal(resumed.events[0].channel, "headless");
  assert.equal(resumed.events[0].sourceChanged, true);
  assert.equal(resumed.events[0].after.sourceDigest, doctorSourceDigest(outcome.project));
  assert.deepEqual(resumed.events[0].targets, [{ kind: "object", id: platform.id }]);
  assert.equal(validateProject(outcome.project).valid, true);
  assert.equal(validateAgentChangeFeed(outcome.project.authoring.agentChangeFeed).valid, true);
});

test("coordination changes are visible without pretending gameplay source changed", () => {
  const project = createTemplate("blank");
  const sourceDigest = doctorSourceDigest(project);
  const origin = getAgentChanges(project).currentCursor;
  const ledgerDigest = getAgentWorkLedger(project).ledgerDigest;
  const outcome = applyAgentCommand(project, {
    op: "add_work_item",
    expectedLedgerDigest: ledgerDigest,
    actor: "claude",
    item: {
      id: "resume-feed-review",
      title: "Review resume feed",
      summary: "Confirm that another agent can recover bounded semantic changes.",
      kind: "coordination",
      priority: "high",
      scope: ["lib", "tests"],
    },
  });
  const resumed = getAgentChanges(outcome.project, { cursor: origin });

  assert.equal(doctorSourceDigest(outcome.project), sourceDigest);
  assert.equal(resumed.events[0].category, "coordination");
  assert.equal(resumed.events[0].sourceChanged, false);
  assert.equal(resumed.events[0].ledgerChanged, true);
  assert.equal(resumed.events[0].actor, "claude");
});

test("preview remains side-effect free while exact batch apply coalesces to one event", () => {
  const project = createTemplate("blank");
  const origin = getAgentChanges(project).currentCursor;
  const platform = project.objects.find((object) => object.kind === "platform");
  const commands = [
    { op: "update_object", id: platform.id, changes: { color: "#45464c" } },
    { op: "set_project", changes: { name: "Reviewed change-feed batch" } },
  ];
  const previewOutcome = applyAgentCommand(project, {
    op: "preview_batch",
    commands,
    summary: "Review two exact authored changes as one transaction",
    expectedSourceDigest: doctorSourceDigest(project),
  });

  assert.equal(previewOutcome.changed, false);
  assert.equal(previewOutcome.project.authoring?.agentChangeFeed, undefined);
  const applied = applyAgentCommand(project, previewOutcome.result.applyCommand);
  const resumed = getAgentChanges(applied.project, { cursor: origin });

  assert.equal(resumed.returnedEventCount, 1);
  assert.equal(resumed.events[0].operation, "apply_previewed_batch");
  assert.equal(resumed.events[0].commandCount, 2);
  assert.deepEqual(resumed.events[0].operationCounts, { update_object: 1, set_project: 1 });
});

test("opaque cursors page exactly and stale or foreign cursors demand a warm resync", () => {
  let project = createTemplate("blank");
  const origin = getAgentChanges(project).currentCursor;
  project = rename(project, "Feed one", 1);
  project = rename(project, "Feed two", 2);
  project = rename(project, "Feed three", 3);

  const firstPage = getAgentChanges(project, { cursor: origin, limit: 2 });
  assert.equal(firstPage.returnedEventCount, 2);
  assert.equal(firstPage.availableEventCount, 3);
  assert.equal(firstPage.hasMore, true);
  const secondPage = getAgentChanges(project, { cursor: firstPage.nextCursor, limit: 2 });
  assert.equal(secondPage.returnedEventCount, 1);
  assert.equal(secondPage.hasMore, false);
  assert.equal(secondPage.nextCursor, project.authoring.agentChangeFeed.currentCursor);
  assert.equal(getAgentChanges(project, { cursor: secondPage.nextCursor }).baselineStatus, "current");

  const foreign = getAgentChanges(project, { cursor: `sha256:${"0".repeat(64)}` });
  assert.equal(foreign.resyncRequired, true);
  assert.equal(foreign.baselineStatus, "expired-or-foreign");
  assert.deepEqual(foreign.events, []);
  assert.deepEqual(foreign.resync.brief, { op: "get_agent_brief" });
});

test("bounded retention rejects a bookmark whose history was compacted", () => {
  let project = createTemplate("blank");
  const origin = getAgentChanges(project).currentCursor;
  for (let revision = 1; revision <= LOOPLAB_AGENT_CHANGE_FEED_LIMITS.retainedEvents + 1; revision += 1) {
    project = rename(project, `Retention revision ${revision}`, revision);
  }

  const view = getAgentChanges(project, { cursor: origin });
  assert.equal(view.retention.revision, LOOPLAB_AGENT_CHANGE_FEED_LIMITS.retainedEvents + 1);
  assert.equal(view.retention.retainedEventCount, LOOPLAB_AGENT_CHANGE_FEED_LIMITS.retainedEvents);
  assert.equal(view.retention.droppedEventCount, 1);
  assert.equal(view.resyncRequired, true);
  assert.equal(validateAgentChangeFeed(project.authoring.agentChangeFeed).valid, true);
});

test("journal content is privacy-bounded, strict, and excluded from runtime export", () => {
  const secret = "sk-proj-test-fixture-abcdefghijklmnop";
  const project = createTemplate("blank");
  const next = recordAgentProjectChange(project, { ...project, name: "Safe renamed project" }, {
    op: "set_project",
    actor: secret,
    id: secret,
    prompt: `Do not retain ${secret}`,
    changes: { name: `Do not retain ${secret}` },
  }, { now: at(1) });
  const serializedFeed = JSON.stringify(next.authoring.agentChangeFeed);

  assert.doesNotMatch(serializedFeed, /sk-proj-|prompt|changes/);
  assert.equal(next.authoring.agentChangeFeed.events[0].actor, undefined);
  assert.deepEqual(next.authoring.agentChangeFeed.events[0].targets, []);
  assert.equal(doctorSourceDigest(next), doctorSourceDigest({ ...next, authoring: { ...next.authoring, agentChangeFeed: undefined } }));
  assert.doesNotMatch(buildStandaloneHtml(next), /agentChangeFeed|looplab-agent-change-feed\/v1/);

  const poisoned = structuredClone(next.authoring.agentChangeFeed);
  poisoned.events[0].prompt = secret;
  poisoned.events[0].summary = secret;
  const validation = validateAgentChangeFeed(poisoned);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /unsupported field prompt/);
  assert.match(validation.errors.join("\n"), /credential or private-key material/);
});

test("manifest and strict command contract advertise resumable non-authoritative recovery", () => {
  const manifest = getAgentManifest();
  const contract = getLooplabCommandContract("get_agent_changes");

  assert.equal(manifest.agentChangeFeed.schemaVersion, LOOPLAB_AGENT_CHANGE_FEED_SCHEMA);
  assert.equal(manifest.agentChangeFeed.limits.retainedEvents, 128);
  assert.match(manifest.agentChangeFeed.authority, /orientation only/i);
  assert.deepEqual(contract.surfaces, ["core", "browser-session"]);
  assert.equal(contract.annotations.readOnlyHint, true);
  assert.equal(contract.inputSchema.properties.limit.maximum, 64);
  assert.equal(contract.inputSchema.additionalProperties, false);
  assert.equal(validateProject({ ...createTemplate("blank"), authoring: { agentChangeFeed: { prompt: "not a feed" } } }).valid, false);
});
