export const LOOPLAB_AGENT_PRESENCE_SCHEMA = "looplab-agent-presence/v1";
export const LOOPLAB_AGENT_PRESENCE_CLIENT_KINDS = Object.freeze(["codex", "claude", "human", "automation", "other"]);
export const LOOPLAB_AGENT_PRESENCE_STATUSES = Object.freeze(["active", "idle", "reviewing", "blocked"]);

export const LOOPLAB_AGENT_PRESENCE_POLICY = Object.freeze({
  schemaVersion: LOOPLAB_AGENT_PRESENCE_SCHEMA,
  defaultTtlSeconds: 45,
  minimumTtlSeconds: 15,
  maximumTtlSeconds: 120,
  maximumPresences: 32,
  maximumWorkItemIds: 12,
  storage: "companion-memory-only",
  authentication: "loopback-companion-session",
  renewal: "server-time lease; heartbeat before one third of granted TTL",
  conflict: "An active presence ID may be renewed or left only with its opaque lease token. Expired IDs may register again.",
  privacy: {
    projectSource: false,
    providerContext: false,
    exportedHtml: false,
    verificationEvidence: false,
    credentials: false,
    prompts: false,
    filesystemPaths: false,
  },
  authority: "Presence reports current client liveness only. The project work ledger remains the durable ownership and handoff record.",
});

const PRESENCE_KEYS = new Set(["presenceId", "leaseToken", "clientKind", "displayName", "status", "projectId", "sourceDigest", "operation", "workItemIds", "ttlSeconds"]);
const LEAVE_KEYS = new Set(["presenceId", "leaseToken"]);
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const WORK_ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const SOURCE_DIGEST = /^(?:sha256:|source-)[a-f0-9]{32,128}$/;
const SENSITIVE_TEXT = /(?:\b(?:sk|sk-proj|sk-ant)-[A-Za-z0-9_-]{12,}\b|\b(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|LOOPLAB_COMPANION_TOKEN|x-looplab-session-token)\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b)/i;
const ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|\\\\|\/|file:\/\/)/i;

function presenceError(code, statusCode, message, details = {}) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  error.statusCode = statusCode;
  Object.assign(error, details);
  return error;
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw presenceError("invalid-presence", 400, `${label} must be an object.`);
}

function assertKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw presenceError("invalid-presence", 400, `${label} contains unsupported field(s): ${unknown.join(", ")}.`);
}

function cleanText(value, label, { required = false, maxLength = 160, pattern, rejectPath = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw presenceError("invalid-presence", 400, `${label} is required.`);
    return null;
  }
  if (typeof value !== "string") throw presenceError("invalid-presence", 400, `${label} must be a string.`);
  const text = value.trim();
  if (required && !text) throw presenceError("invalid-presence", 400, `${label} must not be empty.`);
  if (!text) return null;
  if (text.length > maxLength) throw presenceError("invalid-presence", 400, `${label} must not exceed ${maxLength} characters.`);
  if (SENSITIVE_TEXT.test(text)) throw presenceError("presence-private-data", 400, `${label} appears to contain credential or private-key material and cannot be published as presence.`);
  if (rejectPath && ABSOLUTE_PATH.test(text)) throw presenceError("presence-private-data", 400, `${label} must use a stable project identifier instead of a filesystem path.`);
  if (pattern && !pattern.test(text)) throw presenceError("invalid-presence", 400, `${label} has an unsupported format.`);
  return text;
}

function normalizeTtl(value) {
  if (value === undefined || value === null) return LOOPLAB_AGENT_PRESENCE_POLICY.defaultTtlSeconds;
  const ttl = Number(value);
  if (!Number.isInteger(ttl) || ttl < LOOPLAB_AGENT_PRESENCE_POLICY.minimumTtlSeconds || ttl > LOOPLAB_AGENT_PRESENCE_POLICY.maximumTtlSeconds) {
    throw presenceError("invalid-presence", 400, `ttlSeconds must be an integer from ${LOOPLAB_AGENT_PRESENCE_POLICY.minimumTtlSeconds} to ${LOOPLAB_AGENT_PRESENCE_POLICY.maximumTtlSeconds}.`);
  }
  return ttl;
}

function normalizeWorkItemIds(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw presenceError("invalid-presence", 400, "workItemIds must be an array.");
  if (value.length > LOOPLAB_AGENT_PRESENCE_POLICY.maximumWorkItemIds) throw presenceError("invalid-presence", 400, `workItemIds must contain at most ${LOOPLAB_AGENT_PRESENCE_POLICY.maximumWorkItemIds} entries.`);
  const ids = value.map((entry, index) => cleanText(entry, `workItemIds[${index}]`, { required: true, maxLength: 96, pattern: WORK_ITEM_ID }));
  if (new Set(ids).size !== ids.length) throw presenceError("invalid-presence", 400, "workItemIds must be unique.");
  return ids;
}

function publicPresence(entry) {
  return {
    presenceId: entry.presenceId,
    clientKind: entry.clientKind,
    displayName: entry.displayName,
    status: entry.status,
    projectId: entry.projectId,
    sourceDigest: entry.sourceDigest,
    operation: entry.operation,
    workItemIds: [...entry.workItemIds],
    joinedAt: entry.joinedAt,
    lastSeenAt: entry.lastSeenAt,
    expiresAt: entry.expiresAt,
    ttlSeconds: entry.ttlSeconds,
  };
}

function normalizeRegistration(input, generatedPresenceId) {
  assertObject(input, "Agent presence");
  assertKeys(input, PRESENCE_KEYS, "Agent presence");
  const presenceId = cleanText(input.presenceId ?? generatedPresenceId, "presenceId", { required: true, maxLength: 128, pattern: STABLE_ID });
  const clientKind = cleanText(input.clientKind, "clientKind", { required: true, maxLength: 24 });
  if (!LOOPLAB_AGENT_PRESENCE_CLIENT_KINDS.includes(clientKind)) throw presenceError("invalid-presence", 400, `clientKind must be one of: ${LOOPLAB_AGENT_PRESENCE_CLIENT_KINDS.join(", ")}.`);
  const status = cleanText(input.status ?? "active", "status", { required: true, maxLength: 24 });
  if (!LOOPLAB_AGENT_PRESENCE_STATUSES.includes(status)) throw presenceError("invalid-presence", 400, `status must be one of: ${LOOPLAB_AGENT_PRESENCE_STATUSES.join(", ")}.`);
  return {
    presenceId,
    leaseToken: cleanText(input.leaseToken, "leaseToken", { maxLength: 200 }),
    clientKind,
    displayName: cleanText(input.displayName, "displayName", { required: true, maxLength: 64 }),
    status,
    projectId: cleanText(input.projectId, "projectId", { maxLength: 128, pattern: STABLE_ID, rejectPath: true }),
    sourceDigest: cleanText(input.sourceDigest, "sourceDigest", { maxLength: 160, pattern: SOURCE_DIGEST }),
    operation: cleanText(input.operation, "operation", { maxLength: 200, rejectPath: true }),
    workItemIds: normalizeWorkItemIds(input.workItemIds),
    ttlSeconds: normalizeTtl(input.ttlSeconds),
  };
}

function opaqueId(randomId, label) {
  const value = cleanText(randomId(), label, { required: true, maxLength: 160 });
  return value;
}

export function createAgentPresenceRegistry({ now = () => Date.now(), randomId = () => globalThis.crypto.randomUUID() } = {}) {
  const entries = new Map();

  const currentTime = () => {
    const value = Number(now());
    if (!Number.isFinite(value)) throw new Error("Agent presence clock must return a finite millisecond timestamp.");
    return value;
  };

  const prune = () => {
    const timestamp = currentTime();
    let expired = 0;
    for (const [id, entry] of entries) {
      if (entry.expiresAtMs > timestamp) continue;
      entries.delete(id);
      expired += 1;
    }
    return expired;
  };

  const list = ({ projectId } = {}) => {
    const expired = prune();
    const filterId = projectId === undefined ? null : cleanText(projectId, "projectId", { maxLength: 128, pattern: STABLE_ID, rejectPath: true });
    const presences = [...entries.values()]
      .filter((entry) => !filterId || entry.projectId === filterId)
      .map(publicPresence)
      .sort((left, right) => left.clientKind.localeCompare(right.clientKind) || left.displayName.localeCompare(right.displayName) || left.presenceId.localeCompare(right.presenceId));
    return {
      schemaVersion: LOOPLAB_AGENT_PRESENCE_SCHEMA,
      generatedAt: new Date(currentTime()).toISOString(),
      count: presences.length,
      expiredPruned: expired,
      recommendedHeartbeatSeconds: Math.floor(LOOPLAB_AGENT_PRESENCE_POLICY.defaultTtlSeconds / 3),
      presences,
      policy: LOOPLAB_AGENT_PRESENCE_POLICY,
    };
  };

  const register = (input) => {
    prune();
    const normalized = normalizeRegistration(input, `presence-${opaqueId(randomId, "generated presence ID")}`);
    const timestamp = currentTime();
    const existing = entries.get(normalized.presenceId) ?? null;
    if (existing && normalized.leaseToken !== existing.leaseToken) {
      throw presenceError("presence-conflict", 409, `Presence ${normalized.presenceId} is owned by another active lease.`, {
        current: publicPresence(existing),
        repairAction: "Choose a distinct presenceId, renew with the returned leaseToken, or wait for the current lease to expire.",
      });
    }
    if (!existing && normalized.leaseToken) {
      throw presenceError("presence-lease-expired", 409, `Presence ${normalized.presenceId} is not active for the supplied lease token.`, {
        repairAction: "Register again without leaseToken to receive a new lease.",
      });
    }
    if (!existing && entries.size >= LOOPLAB_AGENT_PRESENCE_POLICY.maximumPresences) {
      throw presenceError("presence-capacity", 503, `The companion already has ${LOOPLAB_AGENT_PRESENCE_POLICY.maximumPresences} active presence leases.`, {
        retryAfterSeconds: LOOPLAB_AGENT_PRESENCE_POLICY.minimumTtlSeconds,
        repairAction: "Wait for an inactive lease to expire or explicitly leave an owned presence.",
      });
    }
    if (existing && (existing.clientKind !== normalized.clientKind || existing.displayName !== normalized.displayName)) {
      throw presenceError("presence-identity-conflict", 409, `Presence ${normalized.presenceId} cannot change client identity while its lease is active.`, {
        current: publicPresence(existing),
        repairAction: "Keep the original clientKind and displayName, or leave this lease and register a distinct presenceId.",
      });
    }
    const leaseToken = existing?.leaseToken ?? opaqueId(randomId, "generated lease token");
    const joinedAt = existing?.joinedAt ?? new Date(timestamp).toISOString();
    const expiresAtMs = timestamp + normalized.ttlSeconds * 1_000;
    const entry = {
      ...normalized,
      leaseToken,
      joinedAt,
      lastSeenAt: new Date(timestamp).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresAtMs,
    };
    entries.set(entry.presenceId, entry);
    return {
      schemaVersion: LOOPLAB_AGENT_PRESENCE_SCHEMA,
      created: !existing,
      renewed: Boolean(existing),
      presence: publicPresence(entry),
      leaseToken,
      heartbeatAfterSeconds: Math.max(5, Math.floor(entry.ttlSeconds / 3)),
      policy: LOOPLAB_AGENT_PRESENCE_POLICY,
    };
  };

  const leave = (input) => {
    assertObject(input, "Agent presence leave request");
    assertKeys(input, LEAVE_KEYS, "Agent presence leave request");
    prune();
    const presenceId = cleanText(input.presenceId, "presenceId", { required: true, maxLength: 128, pattern: STABLE_ID });
    const leaseToken = cleanText(input.leaseToken, "leaseToken", { required: true, maxLength: 200 });
    const existing = entries.get(presenceId);
    if (!existing) throw presenceError("presence-not-found", 404, `Presence ${presenceId} is not active.`, { repairAction: "Register a new presence if this client is still active." });
    if (existing.leaseToken !== leaseToken) {
      throw presenceError("presence-conflict", 409, `Presence ${presenceId} is owned by another active lease.`, {
        current: publicPresence(existing),
        repairAction: "Leave only with the leaseToken returned to this client, or wait for expiry.",
      });
    }
    entries.delete(presenceId);
    return { schemaVersion: LOOPLAB_AGENT_PRESENCE_SCHEMA, left: true, presenceId, presence: publicPresence(existing), policy: LOOPLAB_AGENT_PRESENCE_POLICY };
  };

  return Object.freeze({ list, register, leave, prune, size: () => { prune(); return entries.size; } });
}
