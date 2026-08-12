import { canonicalSha256 } from "./looplab-canonical-digest.mjs";
import { doctorSourceDigest } from "./looplab-doctor.mjs";
import { getAgentWorkLedger } from "./looplab-agent-work-ledger.mjs";

export const LOOPLAB_AGENT_CHANGE_FEED_SCHEMA = "looplab-agent-change-feed/v1";
export const LOOPLAB_AGENT_CHANGE_FEED_LIMITS = Object.freeze({ retainedEvents: 128, defaultPageSize: 32, maximumPageSize: 64, maximumTargets: 16 });

const SENSITIVE_TEXT = /(?:\b(?:sk|sk-proj|sk-ant)-[A-Za-z0-9_-]{12,}\b|OPENAI_API_KEY|ANTHROPIC_API_KEY|x-looplab-session-token|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY)/i;
const FEED_FIELDS = new Set(["schemaVersion", "feedId", "revision", "droppedEventCount", "originCursor", "currentCursor", "events"]);
const EVENT_FIELDS = new Set(["schemaVersion", "id", "revision", "cursor", "occurredAt", "category", "channel", "operation", "summary", "actor", "commandCount", "operationCounts", "targets", "before", "after", "sourceChanged", "ledgerChanged"]);
const TARGET_VALUE_FIELDS = new Set(["kind", "id"]);
const DIGEST_BINDING_FIELDS = new Set(["sourceDigest", "ledgerDigest"]);

const TARGET_FIELDS = Object.freeze([
  ["mapId", "map"], ["id", "id"], ["objectId", "object"], ["assetId", "asset"], ["pathId", "path"],
  ["nodeId", "navigation-node"], ["linkId", "navigation-link"], ["areaId", "navigation-area"],
  ["pageId", "choice-page"], ["testId", "acceptance-test"], ["caseId", "replay-case"],
  ["macroId", "command-macro"], ["recipeId", "agent-recipe"], ["workItemId", "work-item"],
]);

const COORDINATION_OPERATIONS = new Set(["add_work_item", "claim_work_item", "update_work_item", "release_work_item"]);
const LIFECYCLE_OPERATIONS = new Set([
  "begin_iteration", "create_variation", "verify_iteration", "promote_iteration", "checkpoint_iteration",
  "record_iteration_attempt", "restore_iteration", "complete_agent_request",
]);

function safeText(value, maximum = 128) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function isBoundedText(value, maximum = 128) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximum;
}

function safeMetadataText(value, maximum = 128) {
  const text = safeText(value, maximum);
  return text && !SENSITIVE_TEXT.test(text) ? text : "";
}

function unsupportedFields(value, supported) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value).filter((field) => !supported.has(field))
    : [];
}

function feedCursor(feedId, revision) {
  return canonicalSha256({ schemaVersion: LOOPLAB_AGENT_CHANGE_FEED_SCHEMA, feedId, revision });
}

function createFeed(project, options = {}) {
  const feedId = canonicalSha256({
    schemaVersion: LOOPLAB_AGENT_CHANGE_FEED_SCHEMA,
    projectId: safeText(project?.id ?? project?.name ?? "looplab-project", 160),
    seed: safeText(options.seed ?? doctorSourceDigest(project), 160),
  });
  const originCursor = feedCursor(feedId, 0);
  return {
    schemaVersion: LOOPLAB_AGENT_CHANGE_FEED_SCHEMA,
    feedId,
    revision: 0,
    droppedEventCount: 0,
    originCursor,
    currentCursor: originCursor,
    events: [],
  };
}

function normalizeFeed(project, options = {}) {
  const raw = project?.authoring?.agentChangeFeed;
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.schemaVersion !== LOOPLAB_AGENT_CHANGE_FEED_SCHEMA) return createFeed(project, options);
  const revision = Number.isInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0;
  const feedId = safeText(raw.feedId, 160) || createFeed(project, options).feedId;
  const originCursor = safeText(raw.originCursor, 160) || feedCursor(feedId, 0);
  const events = Array.isArray(raw.events) ? raw.events.slice(-LOOPLAB_AGENT_CHANGE_FEED_LIMITS.retainedEvents) : [];
  return {
    schemaVersion: LOOPLAB_AGENT_CHANGE_FEED_SCHEMA,
    feedId,
    revision,
    droppedEventCount: Number.isInteger(raw.droppedEventCount) && raw.droppedEventCount >= 0 ? raw.droppedEventCount : 0,
    originCursor,
    currentCursor: safeText(raw.currentCursor, 160) || events.at(-1)?.cursor || feedCursor(feedId, revision),
    events,
  };
}

function ledgerDigest(project) {
  return getAgentWorkLedger(project, { limit: 1, eventLimit: 0 }).ledgerDigest;
}

function operationCounts(command) {
  const operations = Array.isArray(command?.commands) ? command.commands.map((entry) => safeMetadataText(entry?.op, 96)).filter(Boolean) : [];
  if (!operations.length) return undefined;
  const counts = {};
  for (const operation of operations) counts[operation] = (counts[operation] ?? 0) + 1;
  return counts;
}

function collectTargets(command) {
  const targets = [];
  const seen = new Set();
  const visit = (candidate, nested = false) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;
    const operation = safeMetadataText(candidate.op, 96);
    for (const [field, kind] of TARGET_FIELDS) {
      const id = safeMetadataText(candidate[field], 160);
      if (!id) continue;
      const resolvedKind = field === "id" && operation ? operation.replace(/^(get|set|add|update|remove|select|switch|verify|record|complete|claim|release|duplicate|reorder)_/, "") : kind;
      const key = `${resolvedKind}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ kind: resolvedKind || (nested ? "nested-target" : "target"), id });
      if (targets.length >= LOOPLAB_AGENT_CHANGE_FEED_LIMITS.maximumTargets) return;
    }
  };
  visit(command);
  for (const nested of Array.isArray(command?.commands) ? command.commands : []) {
    if (targets.length >= LOOPLAB_AGENT_CHANGE_FEED_LIMITS.maximumTargets) break;
    visit(nested, true);
  }
  return targets;
}

function classifyChange(command, beforeSourceDigest, afterSourceDigest, beforeLedgerDigest, afterLedgerDigest, requestedCategory) {
  if (["authored", "coordination", "lifecycle", "metadata", "history"].includes(requestedCategory)) return requestedCategory;
  if (beforeSourceDigest !== afterSourceDigest) return "authored";
  if (beforeLedgerDigest !== afterLedgerDigest || COORDINATION_OPERATIONS.has(command?.op)) return "coordination";
  if (LIFECYCLE_OPERATIONS.has(command?.op)) return "lifecycle";
  return "metadata";
}

function eventMatchesTransition(event, transition) {
  return event?.before?.sourceDigest === transition.beforeSourceDigest
    && event?.after?.sourceDigest === transition.afterSourceDigest
    && event?.before?.ledgerDigest === transition.beforeLedgerDigest
    && event?.after?.ledgerDigest === transition.afterLedgerDigest;
}

export function recordAgentProjectChange(previousProject, nextProject, command = {}, options = {}) {
  const beforeSourceDigest = doctorSourceDigest(previousProject);
  const afterSourceDigest = doctorSourceDigest(nextProject);
  const beforeLedgerDigest = ledgerDigest(previousProject);
  const afterLedgerDigest = ledgerDigest(nextProject);
  const transition = { beforeSourceDigest, afterSourceDigest, beforeLedgerDigest, afterLedgerDigest };
  const previousFeed = normalizeFeed(previousProject, { now: options.now, seed: beforeSourceDigest });
  const candidateFeed = normalizeFeed(nextProject, { now: options.now, seed: beforeSourceDigest });

  if (candidateFeed.revision > previousFeed.revision && eventMatchesTransition(candidateFeed.events.at(-1), transition)) return nextProject;

  const occurredAt = options.now ?? new Date().toISOString();
  const revision = previousFeed.revision + 1;
  const cursor = feedCursor(previousFeed.feedId, revision);
  const op = safeMetadataText(command?.op, 96) || safeMetadataText(options.op, 96) || "project_edit";
  const category = classifyChange(command, beforeSourceDigest, afterSourceDigest, beforeLedgerDigest, afterLedgerDigest, options.category);
  const nestedCounts = operationCounts(command);
  const event = {
    schemaVersion: LOOPLAB_AGENT_CHANGE_FEED_SCHEMA,
    id: `${previousFeed.feedId.slice(7, 19)}-${revision}`,
    revision,
    cursor,
    occurredAt,
    category,
    channel: ["headless", "mouse", "provider", "history", "system"].includes(options.channel) ? options.channel : "headless",
    operation: op,
    summary: `${op} completed as one ${category} change`,
    ...(safeMetadataText(command?.actor, 64) ? { actor: safeMetadataText(command.actor, 64) } : {}),
    ...(nestedCounts ? { commandCount: Object.values(nestedCounts).reduce((total, count) => total + count, 0), operationCounts: nestedCounts } : {}),
    targets: collectTargets(command),
    before: { sourceDigest: beforeSourceDigest, ledgerDigest: beforeLedgerDigest },
    after: { sourceDigest: afterSourceDigest, ledgerDigest: afterLedgerDigest },
    sourceChanged: beforeSourceDigest !== afterSourceDigest,
    ledgerChanged: beforeLedgerDigest !== afterLedgerDigest,
  };
  const appended = [...previousFeed.events, event];
  const overflow = Math.max(0, appended.length - LOOPLAB_AGENT_CHANGE_FEED_LIMITS.retainedEvents);
  const feed = {
    ...previousFeed,
    revision,
    droppedEventCount: previousFeed.droppedEventCount + overflow,
    currentCursor: cursor,
    events: appended.slice(overflow),
  };
  return {
    ...nextProject,
    authoring: {
      ...(nextProject.authoring ?? {}),
      agentChangeFeed: feed,
    },
  };
}

export function getAgentChanges(project, options = {}) {
  const feed = normalizeFeed(project);
  const requestedCursor = safeText(options.cursor, 160) || null;
  const requestedPageSize = Number(options.limit);
  const pageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0
    ? Math.min(LOOPLAB_AGENT_CHANGE_FEED_LIMITS.maximumPageSize, requestedPageSize)
    : LOOPLAB_AGENT_CHANGE_FEED_LIMITS.defaultPageSize;
  const sourceDigest = doctorSourceDigest(project);
  const currentLedgerDigest = ledgerDigest(project);
  let baselineStatus = "established";
  let startIndex = feed.events.length;
  let resyncRequired = false;

  if (requestedCursor) {
    if (requestedCursor === feed.currentCursor) baselineStatus = "current";
    else if (requestedCursor === feed.originCursor && feed.droppedEventCount === 0) {
      baselineStatus = "origin";
      startIndex = 0;
    } else {
      const index = feed.events.findIndex((event) => event?.cursor === requestedCursor);
      if (index >= 0) {
        baselineStatus = "retained";
        startIndex = index + 1;
      } else {
        baselineStatus = "expired-or-foreign";
        resyncRequired = true;
      }
    }
  }

  const remaining = resyncRequired ? [] : feed.events.slice(startIndex);
  const events = remaining.slice(0, pageSize);
  const hasMore = remaining.length > events.length;
  const nextCursor = events.at(-1)?.cursor ?? feed.currentCursor;
  const categoryCounts = {};
  for (const event of events) categoryCounts[event.category] = (categoryCounts[event.category] ?? 0) + 1;
  return {
    schemaVersion: LOOPLAB_AGENT_CHANGE_FEED_SCHEMA,
    sourceDigest,
    ledgerDigest: currentLedgerDigest,
    requestedCursor,
    baselineStatus,
    resyncRequired,
    resyncReason: resyncRequired ? "The cursor is not in this feed's retained history. Re-read the warm brief and bounded project context before continuing." : null,
    currentCursor: feed.currentCursor,
    nextCursor,
    hasMore,
    returnedEventCount: events.length,
    availableEventCount: remaining.length,
    categoryCounts,
    events,
    retention: {
      revision: feed.revision,
      retainedEventCount: feed.events.length,
      retainedEventLimit: LOOPLAB_AGENT_CHANGE_FEED_LIMITS.retainedEvents,
      droppedEventCount: feed.droppedEventCount,
    },
    authority: {
      mutationAuthority: false,
      verificationAuthority: false,
      notificationsAreHints: true,
      policy: "This compact semantic feed helps agents resume. Canonical project/context reads, source-bound commands, Project Doctor, and exact evidence remain authoritative.",
    },
    resync: {
      brief: { op: "get_agent_brief" },
      campaignContext: { op: "get_project_context", view: "campaign" },
    },
  };
}

export function validateAgentChangeFeed(value) {
  const errors = [];
  const warnings = [];
  if (value === undefined) return { valid: true, errors, warnings };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, errors: ["authoring.agentChangeFeed must be an object when provided."], warnings };
  for (const field of unsupportedFields(value, FEED_FIELDS)) errors.push(`authoring.agentChangeFeed contains unsupported field ${field}.`);
  if (value.schemaVersion !== LOOPLAB_AGENT_CHANGE_FEED_SCHEMA) errors.push(`authoring.agentChangeFeed.schemaVersion must be ${LOOPLAB_AGENT_CHANGE_FEED_SCHEMA}.`);
  if (!isBoundedText(value.feedId, 160)) errors.push("authoring.agentChangeFeed.feedId must be a non-empty bounded string.");
  if (!Number.isInteger(value.revision) || value.revision < 0) errors.push("authoring.agentChangeFeed.revision must be a non-negative integer.");
  if (!Number.isInteger(value.droppedEventCount) || value.droppedEventCount < 0) errors.push("authoring.agentChangeFeed.droppedEventCount must be a non-negative integer.");
  if (!isBoundedText(value.originCursor, 160) || !isBoundedText(value.currentCursor, 160)) errors.push("authoring.agentChangeFeed originCursor and currentCursor must be non-empty bounded strings.");
  if (isBoundedText(value.feedId, 160) && value.originCursor !== feedCursor(value.feedId, 0)) errors.push("authoring.agentChangeFeed.originCursor must match revision zero for this feed.");
  if (isBoundedText(value.feedId, 160) && Number.isInteger(value.revision) && value.revision >= 0 && value.currentCursor !== feedCursor(value.feedId, value.revision)) errors.push("authoring.agentChangeFeed.currentCursor must match the declared revision.");
  if (!Array.isArray(value.events)) errors.push("authoring.agentChangeFeed.events must be an array.");
  else {
    if (value.events.length > LOOPLAB_AGENT_CHANGE_FEED_LIMITS.retainedEvents) errors.push(`authoring.agentChangeFeed.events must contain at most ${LOOPLAB_AGENT_CHANGE_FEED_LIMITS.retainedEvents} events.`);
    if (Number.isInteger(value.revision) && Number.isInteger(value.droppedEventCount) && value.revision !== value.droppedEventCount + value.events.length) errors.push("authoring.agentChangeFeed.revision must equal dropped plus retained event counts.");
    let previousRevision = Math.max(0, Number(value.revision) - value.events.length);
    for (const [index, event] of value.events.entries()) {
      const prefix = `authoring.agentChangeFeed.events[${index}]`;
      if (!event || typeof event !== "object" || Array.isArray(event)) { errors.push(`${prefix} must be an object.`); continue; }
      for (const field of unsupportedFields(event, EVENT_FIELDS)) errors.push(`${prefix} contains unsupported field ${field}.`);
      if (event.schemaVersion !== LOOPLAB_AGENT_CHANGE_FEED_SCHEMA) errors.push(`${prefix}.schemaVersion must be ${LOOPLAB_AGENT_CHANGE_FEED_SCHEMA}.`);
      if (!Number.isInteger(event.revision) || event.revision !== previousRevision + 1) errors.push(`${prefix}.revision must increase consecutively.`);
      else previousRevision = event.revision;
      for (const field of ["id", "cursor", "occurredAt", "category", "channel", "operation", "summary"]) if (!isBoundedText(event[field], field === "summary" ? 240 : 160)) errors.push(`${prefix}.${field} must be a non-empty bounded string.`);
      for (const field of ["id", "operation", "summary", "actor"]) if (typeof event[field] === "string" && SENSITIVE_TEXT.test(event[field])) errors.push(`${prefix}.${field} must not contain credential or private-key material.`);
      if (!(["authored", "coordination", "lifecycle", "metadata", "history"].includes(event.category))) errors.push(`${prefix}.category is not supported.`);
      if (!(["headless", "mouse", "provider", "history", "system"].includes(event.channel))) errors.push(`${prefix}.channel is not supported.`);
      if (event.actor !== undefined && !isBoundedText(event.actor, 64)) errors.push(`${prefix}.actor must be a non-empty bounded string when provided.`);
      if (isBoundedText(value.feedId, 160) && Number.isInteger(event.revision) && event.cursor !== feedCursor(value.feedId, event.revision)) errors.push(`${prefix}.cursor must match its feed revision.`);
      if (!Array.isArray(event.targets) || event.targets.length > LOOPLAB_AGENT_CHANGE_FEED_LIMITS.maximumTargets) errors.push(`${prefix}.targets must be a bounded array.`);
      else for (const [targetIndex, target] of event.targets.entries()) {
        if (!target || typeof target !== "object" || Array.isArray(target) || !isBoundedText(target.kind, 160) || !isBoundedText(target.id, 160)) errors.push(`${prefix}.targets[${targetIndex}] must contain bounded kind and id strings.`);
        else {
          for (const field of unsupportedFields(target, TARGET_VALUE_FIELDS)) errors.push(`${prefix}.targets[${targetIndex}] contains unsupported field ${field}.`);
          if (SENSITIVE_TEXT.test(target.kind) || SENSITIVE_TEXT.test(target.id)) errors.push(`${prefix}.targets[${targetIndex}] must not contain credential or private-key material.`);
        }
      }
      if (!event.before || !event.after || !isBoundedText(event.before.sourceDigest, 160) || !isBoundedText(event.after.sourceDigest, 160) || !isBoundedText(event.before.ledgerDigest, 160) || !isBoundedText(event.after.ledgerDigest, 160)) errors.push(`${prefix} must bind before/after source and ledger digests.`);
      else {
        for (const field of unsupportedFields(event.before, DIGEST_BINDING_FIELDS)) errors.push(`${prefix}.before contains unsupported field ${field}.`);
        for (const field of unsupportedFields(event.after, DIGEST_BINDING_FIELDS)) errors.push(`${prefix}.after contains unsupported field ${field}.`);
      }
      if (typeof event.sourceChanged !== "boolean" || typeof event.ledgerChanged !== "boolean") errors.push(`${prefix} must declare sourceChanged and ledgerChanged booleans.`);
      if (event.commandCount !== undefined && (!Number.isInteger(event.commandCount) || event.commandCount < 1 || event.commandCount > 64)) errors.push(`${prefix}.commandCount must be an integer from 1 to 64 when provided.`);
      if (event.operationCounts !== undefined) {
        if (!event.operationCounts || typeof event.operationCounts !== "object" || Array.isArray(event.operationCounts) || Object.keys(event.operationCounts).length > 64) errors.push(`${prefix}.operationCounts must be a bounded object when provided.`);
        else for (const [operation, count] of Object.entries(event.operationCounts)) if (!isBoundedText(operation, 96) || SENSITIVE_TEXT.test(operation) || !Number.isInteger(count) || count < 1 || count > 64) errors.push(`${prefix}.operationCounts entries must use safe operation names and counts from 1 to 64.`);
      }
    }
    if (value.events.length && value.events.at(-1)?.cursor !== value.currentCursor) errors.push("authoring.agentChangeFeed.currentCursor must match the newest retained event.");
    if (value.events.length && value.events.at(-1)?.revision !== value.revision) errors.push("authoring.agentChangeFeed.revision must match the newest retained event.");
    if (!value.events.length && value.revision === 0 && value.currentCursor !== value.originCursor) errors.push("authoring.agentChangeFeed.currentCursor must equal originCursor before the first change.");
  }
  return { valid: errors.length === 0, errors, warnings };
}
