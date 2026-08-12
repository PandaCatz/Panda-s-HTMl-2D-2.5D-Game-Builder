import { canonicalSha256 } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_AGENT_WORK_LEDGER_SCHEMA = "looplab-agent-work-ledger/v1";
export const LOOPLAB_AGENT_WORK_LEDGER_VIEW_SCHEMA = "looplab-agent-work-ledger-view/v1";
export const LOOPLAB_AGENT_WORK_ITEM_STATUSES = Object.freeze(["open", "in-progress", "blocked", "landed", "rejected"]);
export const LOOPLAB_AGENT_WORK_ITEM_KINDS = Object.freeze(["bug", "feature", "research", "documentation", "coordination"]);
export const LOOPLAB_AGENT_WORK_ITEM_PRIORITIES = Object.freeze(["critical", "high", "medium", "low"]);
export const LOOPLAB_AGENT_WORK_LEDGER_MUTATIONS = Object.freeze(["add_work_item", "claim_work_item", "update_work_item", "release_work_item"]);

const STABLE_ID = /^[a-z0-9][a-z0-9-]*$/;
const ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const MAX_ITEMS = 256;
const MAX_EVENTS = 512;
const DEFAULT_LEASE_SECONDS = 7_200;
const MIN_LEASE_SECONDS = 300;
const MAX_LEASE_SECONDS = 86_400;
const TERMINAL_STATUSES = new Set(["landed", "rejected"]);
const PRIORITY_ORDER = new Map(LOOPLAB_AGENT_WORK_ITEM_PRIORITIES.map((priority, index) => [priority, index]));
const SENSITIVE_TEXT = /(?:\b(?:sk|sk-proj|sk-ant)-[A-Za-z0-9_-]{12,}\b|OPENAI_API_KEY|ANTHROPIC_API_KEY|x-looplab-session-token|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY)/i;

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function assertAllowedKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} contains unsupported field(s): ${unknown.join(", ")}.`);
}

function requiredText(value, label, maximum) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  const text = value.trim();
  if (text.length > maximum) throw new Error(`${label} must contain at most ${maximum} characters.`);
  if (SENSITIVE_TEXT.test(text)) throw new Error(`${label} appears to contain credential or private-key material and cannot be stored in the work ledger.`);
  return text;
}

function optionalText(value, label, maximum) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, label, maximum);
}

function textList(value, label, { maximumItems, maximumLength }) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (value.length > maximumItems) throw new Error(`${label} must contain at most ${maximumItems} entries.`);
  const entries = value.map((entry, index) => requiredText(entry, `${label}[${index}]`, maximumLength));
  if (new Set(entries).size !== entries.length) throw new Error(`${label} must not contain duplicates.`);
  return entries;
}

function actorId(value, label = "actor") {
  const actor = requiredText(value, label, 64);
  if (!ACTOR_ID.test(actor)) throw new Error(`${label} must use only letters, numbers, dot, underscore, colon, or hyphen.`);
  return actor;
}

function stableId(value, label) {
  const id = requiredText(value, label, 96);
  if (!STABLE_ID.test(id)) throw new Error(`${label} must be a stable lowercase hyphenated ID.`);
  return id;
}

function isoInstant(value, label) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp.`);
  return new Date(value).toISOString();
}

function normalizedNow(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Ledger mutation time must be valid.");
  return date.toISOString();
}

function emptyLedger() {
  return {
    schemaVersion: LOOPLAB_AGENT_WORK_LEDGER_SCHEMA,
    revision: 0,
    droppedEventCount: 0,
    items: [],
    events: [],
  };
}

export function normalizeAgentWorkLedger(input) {
  if (input === undefined || input === null) return emptyLedger();
  const ledger = assertObject(clone(input), "agentWorkLedger");
  return {
    schemaVersion: ledger.schemaVersion ?? LOOPLAB_AGENT_WORK_LEDGER_SCHEMA,
    revision: ledger.revision ?? 0,
    droppedEventCount: ledger.droppedEventCount ?? 0,
    items: Array.isArray(ledger.items) ? ledger.items : [],
    events: Array.isArray(ledger.events) ? ledger.events : [],
  };
}

function validateClaim(claim, prefix, errors) {
  if (claim === undefined || claim === null) return;
  if (!claim || typeof claim !== "object" || Array.isArray(claim)) {
    errors.push(`${prefix} must be an object or null.`);
    return;
  }
  const allowed = new Set(["holder", "acquiredAt", "renewedAt", "expiresAt", "transition"]);
  const unknown = Object.keys(claim).filter((key) => !allowed.has(key));
  if (unknown.length) errors.push(`${prefix} contains unsupported field(s): ${unknown.join(", ")}.`);
  try { actorId(claim.holder, `${prefix}.holder`); } catch (error) { errors.push(error.message); }
  for (const field of ["acquiredAt", "renewedAt", "expiresAt"]) {
    try { isoInstant(claim[field], `${prefix}.${field}`); } catch (error) { errors.push(error.message); }
  }
  if (!Number.isInteger(claim.transition) || claim.transition < 1) errors.push(`${prefix}.transition must be a positive integer.`);
  if (typeof claim.acquiredAt === "string" && typeof claim.renewedAt === "string" && Date.parse(claim.renewedAt) < Date.parse(claim.acquiredAt)) errors.push(`${prefix}.renewedAt cannot precede acquiredAt.`);
  if (typeof claim.renewedAt === "string" && typeof claim.expiresAt === "string" && Date.parse(claim.expiresAt) <= Date.parse(claim.renewedAt)) errors.push(`${prefix}.expiresAt must follow renewedAt.`);
}

function validateWorkItem(item, prefix, errors) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  const allowed = new Set(["id", "title", "summary", "kind", "priority", "status", "scope", "blockers", "evidenceRefs", "resultSummary", "observedSourceDigest", "createdAt", "createdBy", "updatedAt", "updatedBy", "claim"]);
  const unknown = Object.keys(item).filter((key) => !allowed.has(key));
  if (unknown.length) errors.push(`${prefix} contains unsupported field(s): ${unknown.join(", ")}.`);
  try { stableId(item.id, `${prefix}.id`); } catch (error) { errors.push(error.message); }
  try { requiredText(item.title, `${prefix}.title`, 160); } catch (error) { errors.push(error.message); }
  try { requiredText(item.summary, `${prefix}.summary`, 1_200); } catch (error) { errors.push(error.message); }
  if (!LOOPLAB_AGENT_WORK_ITEM_KINDS.includes(item.kind)) errors.push(`${prefix}.kind must be ${LOOPLAB_AGENT_WORK_ITEM_KINDS.join(", ")}.`);
  if (!LOOPLAB_AGENT_WORK_ITEM_PRIORITIES.includes(item.priority)) errors.push(`${prefix}.priority must be ${LOOPLAB_AGENT_WORK_ITEM_PRIORITIES.join(", ")}.`);
  if (!LOOPLAB_AGENT_WORK_ITEM_STATUSES.includes(item.status)) errors.push(`${prefix}.status must be ${LOOPLAB_AGENT_WORK_ITEM_STATUSES.join(", ")}.`);
  for (const [field, settings] of Object.entries({ scope: [16, 160], blockers: [16, 400], evidenceRefs: [24, 240] })) {
    try { textList(item[field], `${prefix}.${field}`, { maximumItems: settings[0], maximumLength: settings[1] }); } catch (error) { errors.push(error.message); }
  }
  try { optionalText(item.resultSummary, `${prefix}.resultSummary`, 1_200); } catch (error) { errors.push(error.message); }
  try { optionalText(item.observedSourceDigest, `${prefix}.observedSourceDigest`, 100); } catch (error) { errors.push(error.message); }
  for (const field of ["createdAt", "updatedAt"]) {
    try { isoInstant(item[field], `${prefix}.${field}`); } catch (error) { errors.push(error.message); }
  }
  for (const field of ["createdBy", "updatedBy"]) {
    try { actorId(item[field], `${prefix}.${field}`); } catch (error) { errors.push(error.message); }
  }
  validateClaim(item.claim, `${prefix}.claim`, errors);
  if (item.status === "landed" && (!item.resultSummary || !(item.evidenceRefs?.length))) errors.push(`${prefix} with status landed requires resultSummary and at least one evidenceRefs entry.`);
  if (item.status === "rejected" && !item.resultSummary) errors.push(`${prefix} with status rejected requires resultSummary.`);
  if (item.status === "blocked" && !(item.blockers?.length)) errors.push(`${prefix} with status blocked requires at least one blocker.`);
  if (TERMINAL_STATUSES.has(item.status) && item.claim) errors.push(`${prefix} cannot retain a claim after reaching ${item.status}.`);
}

function validateLedgerEvent(event, prefix, errors) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  const allowed = new Set(["id", "revision", "itemId", "type", "actor", "at", "summary", "sourceDigest"]);
  const unknown = Object.keys(event).filter((key) => !allowed.has(key));
  if (unknown.length) errors.push(`${prefix} contains unsupported field(s): ${unknown.join(", ")}.`);
  try { stableId(event.id, `${prefix}.id`); } catch (error) { errors.push(error.message); }
  if (!Number.isInteger(event.revision) || event.revision < 1) errors.push(`${prefix}.revision must be a positive integer.`);
  try { stableId(event.itemId, `${prefix}.itemId`); } catch (error) { errors.push(error.message); }
  if (!["created", "claimed", "renewed", "taken-over", "released", "force-released", "updated", "blocked", "landed", "rejected", "reopened"].includes(event.type)) errors.push(`${prefix}.type is not supported.`);
  try { actorId(event.actor, `${prefix}.actor`); } catch (error) { errors.push(error.message); }
  try { isoInstant(event.at, `${prefix}.at`); } catch (error) { errors.push(error.message); }
  try { requiredText(event.summary, `${prefix}.summary`, 400); } catch (error) { errors.push(error.message); }
  try { optionalText(event.sourceDigest, `${prefix}.sourceDigest`, 100); } catch (error) { errors.push(error.message); }
}

export function validateAgentWorkLedger(input) {
  if (input === undefined || input === null) return { valid: true, errors: [], warnings: [] };
  const errors = [];
  const warnings = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { valid: false, errors: ["agentWorkLedger must be an object."], warnings };
  const allowed = new Set(["schemaVersion", "revision", "droppedEventCount", "items", "events"]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) errors.push(`agentWorkLedger contains unsupported field(s): ${unknown.join(", ")}.`);
  if (input.schemaVersion !== LOOPLAB_AGENT_WORK_LEDGER_SCHEMA) errors.push(`agentWorkLedger.schemaVersion must be ${LOOPLAB_AGENT_WORK_LEDGER_SCHEMA}.`);
  if (!Number.isInteger(input.revision) || input.revision < 0) errors.push("agentWorkLedger.revision must be a non-negative integer.");
  if (!Number.isInteger(input.droppedEventCount) || input.droppedEventCount < 0) errors.push("agentWorkLedger.droppedEventCount must be a non-negative integer.");
  if (!Array.isArray(input.items)) errors.push("agentWorkLedger.items must be an array.");
  else {
    if (input.items.length > MAX_ITEMS) errors.push(`agentWorkLedger.items must contain at most ${MAX_ITEMS} entries.`);
    const ids = new Set();
    for (const [index, item] of input.items.entries()) {
      validateWorkItem(item, `agentWorkLedger.items[${index}]`, errors);
      if (typeof item?.id === "string") {
        if (ids.has(item.id)) errors.push(`agentWorkLedger.items[${index}].id duplicates ${item.id}.`);
        ids.add(item.id);
      }
    }
  }
  if (!Array.isArray(input.events)) errors.push("agentWorkLedger.events must be an array.");
  else {
    if (input.events.length > MAX_EVENTS) errors.push(`agentWorkLedger.events must contain at most ${MAX_EVENTS} entries.`);
    const eventIds = new Set();
    for (const [index, event] of input.events.entries()) {
      validateLedgerEvent(event, `agentWorkLedger.events[${index}]`, errors);
      if (typeof event?.id === "string") {
        if (eventIds.has(event.id)) errors.push(`agentWorkLedger.events[${index}].id duplicates ${event.id}.`);
        eventIds.add(event.id);
      }
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function agentWorkLedgerDigest(input) {
  const ledger = normalizeAgentWorkLedger(input);
  const validation = validateAgentWorkLedger(ledger);
  if (!validation.valid) throw new Error(`Agent work ledger is invalid: ${validation.errors.join(" ")}`);
  return canonicalSha256(ledger);
}

function claimState(claim, nowMs) {
  if (!claim) return "unclaimed";
  return Date.parse(claim.expiresAt) > nowMs ? "active" : "expired";
}

function itemView(item, nowMs) {
  const state = claimState(item.claim, nowMs);
  return {
    ...clone(item),
    claimState: state,
    claimRemainingSeconds: state === "active" ? Math.max(0, Math.ceil((Date.parse(item.claim.expiresAt) - nowMs) / 1_000)) : 0,
  };
}

export function getAgentWorkLedger(projectOrLedger, options = {}) {
  const looksLikeLedger = projectOrLedger?.schemaVersion === LOOPLAB_AGENT_WORK_LEDGER_SCHEMA
    || (Array.isArray(projectOrLedger?.items) && Array.isArray(projectOrLedger?.events) && Number.isInteger(projectOrLedger?.revision));
  const ledger = normalizeAgentWorkLedger(looksLikeLedger ? projectOrLedger : projectOrLedger?.agentWorkLedger);
  const validation = validateAgentWorkLedger(ledger);
  if (!validation.valid) throw new Error(`Agent work ledger is invalid: ${validation.errors.join(" ")}`);
  const now = normalizedNow(options.now);
  const nowMs = Date.parse(now);
  const statuses = options.status === undefined || options.status === "all" ? null : new Set(Array.isArray(options.status) ? options.status : [options.status]);
  const kinds = options.kind === undefined || options.kind === "all" ? null : new Set(Array.isArray(options.kind) ? options.kind : [options.kind]);
  const owner = String(options.owner ?? "").trim().toLowerCase();
  const query = String(options.query ?? "").trim().toLowerCase().slice(0, 240);
  const limit = Math.max(1, Math.min(100, Number(options.limit ?? 50)));
  const eventLimit = Math.max(0, Math.min(50, Number(options.eventLimit ?? 20)));
  const matched = ledger.items.filter((item) => {
    if (statuses && !statuses.has(item.status)) return false;
    if (kinds && !kinds.has(item.kind)) return false;
    if (owner && String(item.claim?.holder ?? "").toLowerCase() !== owner) return false;
    if (query && ![item.id, item.title, item.summary, item.kind, item.priority, ...(item.scope ?? []), ...(item.blockers ?? [])].join(" ").toLowerCase().includes(query)) return false;
    return true;
  }).sort((left, right) => (PRIORITY_ORDER.get(left.priority) ?? 99) - (PRIORITY_ORDER.get(right.priority) ?? 99) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.id.localeCompare(right.id));
  const counts = Object.fromEntries(LOOPLAB_AGENT_WORK_ITEM_STATUSES.map((status) => [status, ledger.items.filter((item) => item.status === status).length]));
  return clone({
    schemaVersion: LOOPLAB_AGENT_WORK_LEDGER_VIEW_SCHEMA,
    ledgerSchemaVersion: ledger.schemaVersion,
    ledgerDigest: agentWorkLedgerDigest(ledger),
    revision: ledger.revision,
    now,
    count: Math.min(limit, matched.length),
    total: ledger.items.length,
    truncated: matched.length > limit,
    counts,
    activeClaims: ledger.items.filter((item) => claimState(item.claim, nowMs) === "active").length,
    expiredClaims: ledger.items.filter((item) => claimState(item.claim, nowMs) === "expired").length,
    droppedEventCount: ledger.droppedEventCount,
    items: matched.slice(0, limit).map((item) => itemView(item, nowMs)),
    recentEvents: options.includeEvents === false || eventLimit === 0 ? [] : ledger.events.slice(-eventLimit).reverse(),
    policy: {
      separateFromGameSourceDigest: true,
      exported: false,
      providerContext: false,
      autoExecution: false,
      defaultLeaseSeconds: DEFAULT_LEASE_SECONDS,
      minimumLeaseSeconds: MIN_LEASE_SECONDS,
      maximumLeaseSeconds: MAX_LEASE_SECONDS,
    },
  });
}

function requireLedgerDigest(ledger, command) {
  const expected = requiredText(command.expectedLedgerDigest, "expectedLedgerDigest", 100);
  const actual = agentWorkLedgerDigest(ledger);
  if (expected !== actual) throw new Error(`[stale-ledger] Command expected ${expected}, but the shared work ledger is now ${actual}. Read get_work_ledger and rebase the coordination update.`);
  return actual;
}

function appendEvent(ledger, event) {
  const events = [...ledger.events, event];
  if (events.length <= MAX_EVENTS) return { ...ledger, events };
  const overflow = events.length - MAX_EVENTS;
  return { ...ledger, events: events.slice(overflow), droppedEventCount: ledger.droppedEventCount + overflow };
}

function eventFor({ ledger, item, type, actor, at, summary, sourceDigest }) {
  return {
    id: `${item.id}-event-${ledger.revision}`,
    revision: ledger.revision,
    itemId: item.id,
    type,
    actor,
    at,
    summary,
    sourceDigest: sourceDigest ?? null,
  };
}

function activeClaim(item, nowMs) {
  return item.claim && Date.parse(item.claim.expiresAt) > nowMs ? item.claim : null;
}

function commandKeys(command, fields) {
  assertAllowedKeys(command, new Set(["op", "expectedLedgerDigest", "expectedSourceDigest", "compact", ...fields]), command.op);
}

export function applyAgentWorkLedgerCommand(inputProject, command, options = {}) {
  const project = clone(inputProject);
  let ledger = normalizeAgentWorkLedger(project.agentWorkLedger);
  requireLedgerDigest(ledger, command);
  const at = normalizedNow(options.now);
  const nowMs = Date.parse(at);
  const sourceDigest = options.sourceDigest ?? null;
  const nextRevision = ledger.revision + 1;
  let resultItem;
  let event;

  if (command.op === "add_work_item") {
    commandKeys(command, ["item", "actor"]);
    if (ledger.items.length >= MAX_ITEMS) throw new Error(`The shared work ledger already contains the maximum ${MAX_ITEMS} items.`);
    const actor = actorId(command.actor, "actor");
    const input = assertObject(command.item, "item");
    assertAllowedKeys(input, new Set(["id", "title", "summary", "kind", "priority", "scope", "blockers", "evidenceRefs"]), "item");
    const id = stableId(input.id, "item.id");
    if (ledger.items.some((item) => item.id === id)) throw new Error(`Work item already exists: ${id}.`);
    if (input.kind !== undefined && !LOOPLAB_AGENT_WORK_ITEM_KINDS.includes(input.kind)) throw new Error(`item.kind must be ${LOOPLAB_AGENT_WORK_ITEM_KINDS.join(", ")}.`);
    if (input.priority !== undefined && !LOOPLAB_AGENT_WORK_ITEM_PRIORITIES.includes(input.priority)) throw new Error(`item.priority must be ${LOOPLAB_AGENT_WORK_ITEM_PRIORITIES.join(", ")}.`);
    resultItem = {
      id,
      title: requiredText(input.title, "item.title", 160),
      summary: requiredText(input.summary, "item.summary", 1_200),
      kind: input.kind ?? "coordination",
      priority: input.priority ?? "medium",
      status: "open",
      scope: textList(input.scope, "item.scope", { maximumItems: 16, maximumLength: 160 }),
      blockers: textList(input.blockers, "item.blockers", { maximumItems: 16, maximumLength: 400 }),
      evidenceRefs: textList(input.evidenceRefs, "item.evidenceRefs", { maximumItems: 24, maximumLength: 240 }),
      resultSummary: null,
      observedSourceDigest: sourceDigest,
      createdAt: at,
      createdBy: actor,
      updatedAt: at,
      updatedBy: actor,
      claim: null,
    };
    ledger = { ...ledger, revision: nextRevision, items: [...ledger.items, resultItem] };
    event = eventFor({ ledger, item: resultItem, type: "created", actor, at, summary: `Created ${resultItem.kind} work item: ${resultItem.title}`, sourceDigest });
  } else if (command.op === "claim_work_item") {
    commandKeys(command, ["id", "actor", "leaseSeconds", "takeover", "takeoverReason"]);
    const id = stableId(command.id, "id");
    const actor = actorId(command.actor, "actor");
    const index = ledger.items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`Work item was not found: ${id}.`);
    const current = ledger.items[index];
    if (TERMINAL_STATUSES.has(current.status)) throw new Error(`Cannot claim ${current.status} work item ${id}. Reopen it explicitly first.`);
    const requestedLease = command.leaseSeconds === undefined ? DEFAULT_LEASE_SECONDS : Number(command.leaseSeconds);
    if (!Number.isInteger(requestedLease) || requestedLease < MIN_LEASE_SECONDS || requestedLease > MAX_LEASE_SECONDS) throw new Error(`leaseSeconds must be an integer from ${MIN_LEASE_SECONDS} to ${MAX_LEASE_SECONDS}.`);
    const existing = activeClaim(current, nowMs);
    const sameHolder = existing?.holder === actor;
    const takeover = Boolean(existing && !sameHolder);
    const takeoverReason = takeover ? optionalText(command.takeoverReason, "takeoverReason", 400) : null;
    if (takeover && command.takeover !== true) throw new Error(`Work item ${id} is actively claimed by ${existing.holder} until ${existing.expiresAt}. Set takeover:true with a reason only when intentional.`);
    if (takeover && (!takeoverReason || takeoverReason.length < 10)) throw new Error("An active claim takeover requires takeoverReason with at least 10 characters.");
    const transition = sameHolder ? existing.transition : Number(current.claim?.transition ?? 0) + 1;
    const claim = {
      holder: actor,
      acquiredAt: sameHolder ? existing.acquiredAt : at,
      renewedAt: at,
      expiresAt: new Date(nowMs + requestedLease * 1_000).toISOString(),
      transition,
    };
    resultItem = { ...current, status: "in-progress", updatedAt: at, updatedBy: actor, observedSourceDigest: sourceDigest ?? current.observedSourceDigest, claim };
    ledger = { ...ledger, revision: nextRevision, items: ledger.items.map((item, itemIndex) => itemIndex === index ? resultItem : item) };
    const type = sameHolder ? "renewed" : takeover ? "taken-over" : "claimed";
    const summary = sameHolder ? `Renewed claim until ${claim.expiresAt}.` : takeover ? `Took over active claim from ${existing.holder}: ${takeoverReason}` : `Claimed work until ${claim.expiresAt}.`;
    event = eventFor({ ledger, item: resultItem, type, actor, at, summary, sourceDigest });
  } else if (command.op === "release_work_item") {
    commandKeys(command, ["id", "actor", "overrideReason"]);
    const id = stableId(command.id, "id");
    const actor = actorId(command.actor, "actor");
    const index = ledger.items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`Work item was not found: ${id}.`);
    const current = ledger.items[index];
    if (!current.claim) throw new Error(`Work item ${id} has no claim to release.`);
    const active = activeClaim(current, nowMs);
    const override = active && active.holder !== actor;
    const overrideReason = override ? optionalText(command.overrideReason, "overrideReason", 400) : null;
    if (override && (!overrideReason || overrideReason.length < 10)) throw new Error(`Only ${active.holder} may release its active claim. Another actor requires overrideReason with at least 10 characters.`);
    resultItem = { ...current, status: current.status === "in-progress" ? "open" : current.status, updatedAt: at, updatedBy: actor, observedSourceDigest: sourceDigest ?? current.observedSourceDigest, claim: null };
    ledger = { ...ledger, revision: nextRevision, items: ledger.items.map((item, itemIndex) => itemIndex === index ? resultItem : item) };
    const type = override ? "force-released" : "released";
    const summary = override ? `Released ${active.holder}'s active claim: ${overrideReason}` : active ? "Released claim." : "Cleared expired claim.";
    event = eventFor({ ledger, item: resultItem, type, actor, at, summary, sourceDigest });
  } else if (command.op === "update_work_item") {
    commandKeys(command, ["id", "actor", "changes", "overrideReason"]);
    const id = stableId(command.id, "id");
    const actor = actorId(command.actor, "actor");
    const index = ledger.items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`Work item was not found: ${id}.`);
    const current = ledger.items[index];
    const claim = activeClaim(current, nowMs);
    const override = claim && claim.holder !== actor;
    const overrideReason = override ? optionalText(command.overrideReason, "overrideReason", 400) : null;
    if (override && (!overrideReason || overrideReason.length < 10)) throw new Error(`Work item ${id} is actively claimed by ${claim.holder}. Another actor requires overrideReason with at least 10 characters.`);
    const changes = assertObject(command.changes, "changes");
    assertAllowedKeys(changes, new Set(["title", "summary", "kind", "priority", "status", "scope", "blockers", "evidenceRefs", "resultSummary"]), "changes");
    if (!Object.keys(changes).length) throw new Error("changes must contain at least one supported field.");
    const next = { ...current };
    if (changes.title !== undefined) next.title = requiredText(changes.title, "changes.title", 160);
    if (changes.summary !== undefined) next.summary = requiredText(changes.summary, "changes.summary", 1_200);
    if (changes.kind !== undefined) {
      if (!LOOPLAB_AGENT_WORK_ITEM_KINDS.includes(changes.kind)) throw new Error(`changes.kind must be ${LOOPLAB_AGENT_WORK_ITEM_KINDS.join(", ")}.`);
      next.kind = changes.kind;
    }
    if (changes.priority !== undefined) {
      if (!LOOPLAB_AGENT_WORK_ITEM_PRIORITIES.includes(changes.priority)) throw new Error(`changes.priority must be ${LOOPLAB_AGENT_WORK_ITEM_PRIORITIES.join(", ")}.`);
      next.priority = changes.priority;
    }
    if (changes.status !== undefined) {
      if (!LOOPLAB_AGENT_WORK_ITEM_STATUSES.includes(changes.status)) throw new Error(`changes.status must be ${LOOPLAB_AGENT_WORK_ITEM_STATUSES.join(", ")}.`);
      if (changes.status === "in-progress" && (!claim || (claim.holder !== actor && !override))) throw new Error("Set status in-progress by claiming the item with claim_work_item.");
      next.status = changes.status;
    }
    if (changes.scope !== undefined) next.scope = textList(changes.scope, "changes.scope", { maximumItems: 16, maximumLength: 160 });
    if (changes.blockers !== undefined) next.blockers = textList(changes.blockers, "changes.blockers", { maximumItems: 16, maximumLength: 400 });
    if (changes.evidenceRefs !== undefined) next.evidenceRefs = textList(changes.evidenceRefs, "changes.evidenceRefs", { maximumItems: 24, maximumLength: 240 });
    if (changes.resultSummary !== undefined) next.resultSummary = optionalText(changes.resultSummary, "changes.resultSummary", 1_200);
    if (next.status === "blocked" && !next.blockers.length) throw new Error("A blocked work item requires at least one blocker.");
    if (next.status === "landed" && (!next.resultSummary || !next.evidenceRefs.length)) throw new Error("A landed work item requires resultSummary and at least one evidenceRefs entry.");
    if (next.status === "rejected" && !next.resultSummary) throw new Error("A rejected work item requires resultSummary.");
    if (TERMINAL_STATUSES.has(next.status) || next.status === "open") next.claim = null;
    next.updatedAt = at;
    next.updatedBy = actor;
    next.observedSourceDigest = sourceDigest ?? current.observedSourceDigest;
    resultItem = next;
    ledger = { ...ledger, revision: nextRevision, items: ledger.items.map((item, itemIndex) => itemIndex === index ? resultItem : item) };
    const statusChanged = next.status !== current.status;
    const type = !statusChanged ? "updated" : next.status === "blocked" ? "blocked" : next.status === "landed" ? "landed" : next.status === "rejected" ? "rejected" : next.status === "open" ? "reopened" : "updated";
    const summary = override ? `Updated with override of ${claim.holder}'s active claim: ${overrideReason}` : statusChanged ? `Changed status from ${current.status} to ${next.status}.` : "Updated structured work-item fields.";
    event = eventFor({ ledger, item: resultItem, type, actor, at, summary, sourceDigest });
  } else {
    throw new Error(`Unsupported work-ledger command: ${command.op}.`);
  }

  ledger = appendEvent(ledger, event);
  const validation = validateAgentWorkLedger(ledger);
  if (!validation.valid) throw new Error(`Work-ledger command produced invalid state: ${validation.errors.join(" ")}`);
  project.agentWorkLedger = ledger;
  return {
    project,
    result: {
      item: itemView(resultItem, nowMs),
      event: clone(event),
      ledgerDigest: agentWorkLedgerDigest(ledger),
      revision: ledger.revision,
      sourceDigestUnchanged: true,
    },
  };
}
