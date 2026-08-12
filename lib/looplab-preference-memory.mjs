import { canonicalSha256 } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_PREFERENCE_MEMORY_SCHEMA = "looplab-preference-memory/v1";
export const LOOPLAB_APPLIED_PREFERENCE_CONTEXT_SCHEMA = "looplab-applied-preference-context/v1";

export const LOOPLAB_PREFERENCE_DIMENSIONS = Object.freeze([
  Object.freeze({ id: "visual-composition", label: "Visual composition" }),
  Object.freeze({ id: "player-clarity", label: "Player clarity" }),
  Object.freeze({ id: "game-feel", label: "Game feel" }),
  Object.freeze({ id: "pacing-flow", label: "Pacing & flow" }),
  Object.freeze({ id: "readability-accessibility", label: "Readability & accessibility" }),
  Object.freeze({ id: "art-direction", label: "Art direction" }),
  Object.freeze({ id: "overall-fit", label: "Overall fit" }),
]);

export const LOOPLAB_PREFERENCE_MEMORY_POLICY = Object.freeze({
  storage: "browser-local-builder-only",
  explicitSignalsOnly: true,
  inferredSignals: false,
  projectSource: false,
  providerProject: false,
  exportedHtml: false,
  replayState: false,
  screenshots: false,
  imageBytes: false,
  prompts: false,
  providerResponses: false,
  credentials: false,
  automaticWinner: false,
  precedence: Object.freeze(["current-user-brief", "explicit-style-locks", "current-project-authoring", "preference-memory-soft-prior"]),
});

const CONTEXT_KEYS = Object.freeze([
  "genres",
  "coreLoops",
  "movementTemplates",
  "formats",
  "progressionModes",
  "campaignScopes",
  "tags",
]);
const MEMORY_KEYS = new Set(["schemaVersion", "enabled", "revision", "updatedAt", "entries"]);
const COMMON_ENTRY_KEYS = new Set(["id", "kind", "source", "enabled", "dimensions", "context", "createdAt", "updatedAt"]);
const STATEMENT_ENTRY_KEYS = new Set([...COMMON_ENTRY_KEYS, "statement"]);
const PAIRWISE_ENTRY_KEYS = new Set([
  ...COMMON_ENTRY_KEYS,
  "preferredCandidateId",
  "otherCandidateId",
  "preferredSourceDigest",
  "otherSourceDigest",
  "comparisonDigest",
  "rationale",
]);
const DIMENSION_IDS = new Set(LOOPLAB_PREFERENCE_DIMENSIONS.map((dimension) => dimension.id));
const SENSITIVE_KEY = /(?:dataurl|image|screenshot|prompt|response|credential|api[_-]?key|secret|token)/i;
const MAX_ENTRIES = 100;
const MAX_APPLIED_ENTRIES = 12;
const APPLIED_CONTEXT_KEYS = new Set(["schemaVersion", "enabled", "memoryDigest", "activeContext", "selectedEntryIds", "excludedEntryIds", "entries", "instruction", "policy", "receiptDigest"]);
const APPLIED_ENTRY_KEYS = new Set(["id", "kind", "dimensions", "guidance", "context", "relevance", "provenance"]);
const APPLIED_RELEVANCE_KEYS = new Set(["reasons"]);
const APPLIED_PROVENANCE_KEYS = new Set(["source", "createdAt", "updatedAt"]);
const APPLIED_PAIRWISE_PROVENANCE_KEYS = new Set([...APPLIED_PROVENANCE_KEYS, "comparisonDigest", "preferredSourceDigest", "otherSourceDigest"]);
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const APPLIED_PREFERENCE_INSTRUCTION = "Treat these explicit, context-matched user preferences as soft guidance only. The current user brief, current explicit style locks, and current authored project override them. Do not infer additional taste, force a winner, or treat absence as dislike.";

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const cleanText = (value, maximum) => String(value ?? "").trim().slice(0, maximum);
const validDate = (value) => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));

function uniqueTextList(value, { maximumItems = 12, maximumLength = 80 } = {}) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).map((item) => cleanText(item, maximumLength)).filter((item) => {
    const key = item.toLowerCase();
    if (!item || seen.has(key) || seen.size >= maximumItems) return false;
    seen.add(key);
    return true;
  });
}

function normalizeDimensions(value) {
  const dimensions = uniqueTextList(value, { maximumItems: LOOPLAB_PREFERENCE_DIMENSIONS.length, maximumLength: 48 });
  return dimensions.filter((dimension) => DIMENSION_IDS.has(dimension));
}

export function normalizePreferenceContext(value = {}) {
  const context = {};
  for (const key of CONTEXT_KEYS) context[key] = uniqueTextList(value?.[key], { maximumItems: 12, maximumLength: 80 });
  return context;
}

function strictText(value, label, maximum) {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new Error(`${label} must be 1–${maximum} trimmed characters.`);
  return normalized;
}

function strictTextList(value, label, { maximumItems = 12, maximumLength = 80 } = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (value.length > maximumItems) throw new Error(`${label} may contain at most ${maximumItems} values.`);
  const normalized = value.map((item, index) => strictText(item, `${label}[${index}]`, maximumLength));
  const keys = normalized.map((item) => item.toLowerCase());
  if (new Set(keys).size !== keys.length) throw new Error(`${label} cannot contain duplicate values.`);
  return normalized;
}

function strictPreferenceContext(value = {}, { complete = false, label = "context" } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const unknown = Object.keys(value).filter((key) => !CONTEXT_KEYS.includes(key));
  if (unknown.length) throw new Error(`${label}.${unknown[0]} is not an allowed field.`);
  if (complete) {
    const missing = CONTEXT_KEYS.find((key) => !Object.prototype.hasOwnProperty.call(value, key));
    if (missing) throw new Error(`${label}.${missing} must be an array.`);
  }
  const normalized = {};
  for (const key of CONTEXT_KEYS) normalized[key] = Object.prototype.hasOwnProperty.call(value, key)
    ? strictTextList(value[key], `${label}.${key}`)
    : [];
  return normalized;
}

function hasPreferenceContext(context) {
  return CONTEXT_KEYS.some((key) => context[key].length > 0);
}

function unknownKeys(value, allowed, prefix, errors) {
  for (const key of Object.keys(value ?? {})) {
    if (!allowed.has(key)) errors.push(`${prefix}.${key} is not an allowed field.`);
  }
}

function findSensitiveKeys(value, prefix = "memory", errors = []) {
  if (!value || typeof value !== "object") return errors;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key) && child !== false && child !== null && child !== 0) errors.push(`${prefix}.${key} is prohibited; preference memory cannot store images, prompts, provider responses, credentials, or tokens.`);
    findSensitiveKeys(child, `${prefix}.${key}`, errors);
  }
  return errors;
}

export function validatePreferenceMemory(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, errors: ["Preference memory must be an object."] };
  findSensitiveKeys(value, "memory", errors);
  unknownKeys(value, MEMORY_KEYS, "memory", errors);
  if (value.schemaVersion !== LOOPLAB_PREFERENCE_MEMORY_SCHEMA) errors.push(`memory.schemaVersion must be ${LOOPLAB_PREFERENCE_MEMORY_SCHEMA}.`);
  if (typeof value.enabled !== "boolean") errors.push("memory.enabled must be a Boolean.");
  if (!Number.isInteger(value.revision) || value.revision < 0) errors.push("memory.revision must be a non-negative integer.");
  if (value.updatedAt !== null && !validDate(value.updatedAt)) errors.push("memory.updatedAt must be null or an ISO-compatible date.");
  if (!Array.isArray(value.entries)) errors.push("memory.entries must be an array.");
  if (Array.isArray(value.entries) && value.entries.length > MAX_ENTRIES) errors.push(`memory.entries cannot exceed ${MAX_ENTRIES} entries.`);
  const ids = new Set();
  for (const [index, entry] of (Array.isArray(value.entries) ? value.entries : []).entries()) {
    const prefix = `memory.entries[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${prefix} must be an object.`);
      continue;
    }
    const allowed = entry.kind === "statement" ? STATEMENT_ENTRY_KEYS : entry.kind === "pairwise" ? PAIRWISE_ENTRY_KEYS : COMMON_ENTRY_KEYS;
    unknownKeys(entry, allowed, prefix, errors);
    if (!/^[a-z0-9][a-z0-9-]{5,95}$/.test(String(entry.id ?? ""))) errors.push(`${prefix}.id must be a stable lowercase hyphenated ID.`);
    else if (ids.has(entry.id)) errors.push(`${prefix}.id duplicates ${entry.id}.`);
    else ids.add(entry.id);
    if (!['statement', 'pairwise'].includes(entry.kind)) errors.push(`${prefix}.kind must be statement or pairwise.`);
    if (entry.source !== "user-explicit") errors.push(`${prefix}.source must be user-explicit.`);
    if (typeof entry.enabled !== "boolean") errors.push(`${prefix}.enabled must be a Boolean.`);
    if (!validDate(entry.createdAt) || !validDate(entry.updatedAt)) errors.push(`${prefix} requires ISO-compatible createdAt and updatedAt dates.`);
    const dimensions = normalizeDimensions(entry.dimensions);
    if (!Array.isArray(entry.dimensions) || dimensions.length !== entry.dimensions.length || dimensions.length === 0) errors.push(`${prefix}.dimensions must contain one or more known dimensions without duplicates.`);
    if (!entry.context || typeof entry.context !== "object" || Array.isArray(entry.context)) errors.push(`${prefix}.context must be an object.`);
    else {
      unknownKeys(entry.context, new Set(CONTEXT_KEYS), `${prefix}.context`, errors);
      for (const key of CONTEXT_KEYS) {
        if (!Array.isArray(entry.context[key])) errors.push(`${prefix}.context.${key} must be an array.`);
        else {
          try {
            strictTextList(entry.context[key], `${prefix}.context.${key}`);
          } catch (error) {
            errors.push(error instanceof Error ? error.message : `${prefix}.context.${key} is invalid.`);
          }
        }
      }
    }
    if (entry.kind === "statement") {
      if (!cleanText(entry.statement, 600) || entry.statement !== cleanText(entry.statement, 600)) errors.push(`${prefix}.statement must be 1–600 trimmed characters.`);
    }
    if (entry.kind === "pairwise") {
      for (const key of ["preferredCandidateId", "otherCandidateId", "preferredSourceDigest", "otherSourceDigest", "comparisonDigest"]) {
        if (!cleanText(entry[key], 200) || entry[key] !== cleanText(entry[key], 200)) errors.push(`${prefix}.${key} must be a non-empty bounded string.`);
      }
      if (entry.preferredCandidateId === entry.otherCandidateId) errors.push(`${prefix} must compare two different candidates.`);
      if (!cleanText(entry.rationale, 600) || entry.rationale !== cleanText(entry.rationale, 600)) errors.push(`${prefix}.rationale must be 1–600 trimmed characters.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function createPreferenceMemory() {
  return { schemaVersion: LOOPLAB_PREFERENCE_MEMORY_SCHEMA, enabled: true, revision: 0, updatedAt: null, entries: [] };
}

export function parsePreferenceMemory(value) {
  const validation = validatePreferenceMemory(value);
  if (!validation.valid) throw new Error(`Preference memory is invalid: ${validation.errors.join(" ")}`);
  return clone(value);
}

function withMutation(memory, entries, now, changes = {}) {
  const current = parsePreferenceMemory(memory);
  const next = {
    ...current,
    ...changes,
    revision: current.revision + 1,
    updatedAt: now,
    entries: entries.slice(-MAX_ENTRIES),
  };
  return parsePreferenceMemory(next);
}

function entryId(kind, now, value) {
  return `pref-${kind}-${canonicalSha256({ kind, now, value }).slice(-16)}`;
}

function requireDimensions(value) {
  const dimensions = strictTextList(value, "Preference dimensions", {
    maximumItems: LOOPLAB_PREFERENCE_DIMENSIONS.length,
    maximumLength: 48,
  });
  if (dimensions.length === 0) throw new Error("Choose at least one known preference dimension.");
  const unknown = dimensions.find((dimension) => !DIMENSION_IDS.has(dimension));
  if (unknown) throw new Error(`Unknown preference dimension: ${unknown}`);
  return dimensions;
}

function optionalEntryId(value, kind, now, identity) {
  if (value === undefined || value === null) return entryId(kind, now, identity);
  const id = strictText(value, "Preference entry ID", 96);
  if (!/^[a-z0-9][a-z0-9-]{5,95}$/.test(id)) throw new Error("Preference entry ID must be a stable lowercase hyphenated ID.");
  return id;
}

export function addPreferenceStatement(memory, input = {}, options = {}) {
  const current = parsePreferenceMemory(memory);
  const now = options.now ?? new Date().toISOString();
  if (!validDate(now)) throw new Error("Preference timestamp must be an ISO-compatible date.");
  const statement = strictText(input.statement, "Preference statement", 600);
  const dimensions = requireDimensions(input.dimensions);
  const context = strictPreferenceContext(input.context ?? {});
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") throw new Error("Preference enabled must be a Boolean.");
  const id = optionalEntryId(input.id, "statement", now, { statement, dimensions, context });
  if (current.entries.some((entry) => entry.id === id)) throw new Error(`Preference entry already exists: ${id}`);
  const entry = { id, kind: "statement", source: "user-explicit", enabled: input.enabled !== false, dimensions, context, statement, createdAt: now, updatedAt: now };
  return withMutation(current, [...current.entries, entry], now);
}

export function recordPairwisePreference(memory, input = {}, options = {}) {
  const current = parsePreferenceMemory(memory);
  const now = options.now ?? new Date().toISOString();
  if (!validDate(now)) throw new Error("Preference timestamp must be an ISO-compatible date.");
  const dimensions = requireDimensions(input.dimensions);
  const context = strictPreferenceContext(input.context ?? {});
  const preferredCandidateId = strictText(input.preferredCandidateId, "Preferred candidate ID", 200);
  const otherCandidateId = strictText(input.otherCandidateId, "Other candidate ID", 200);
  const preferredSourceDigest = strictText(input.preferredSourceDigest, "Preferred source digest", 200);
  const otherSourceDigest = strictText(input.otherSourceDigest, "Other source digest", 200);
  const comparisonDigest = strictText(input.comparisonDigest, "Comparison digest", 200);
  if (typeof input.rationale !== "string" || !input.rationale.trim()) throw new Error("Explain why you prefer this candidate before recording the comparison.");
  const rationale = strictText(input.rationale, "Pairwise preference rationale", 600);
  if (preferredCandidateId === otherCandidateId) throw new Error("Pairwise preference requires two different candidate IDs.");
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") throw new Error("Preference enabled must be a Boolean.");
  const identity = { preferredCandidateId, otherCandidateId, preferredSourceDigest, otherSourceDigest, comparisonDigest, rationale, dimensions, context };
  const id = optionalEntryId(input.id, "pairwise", now, identity);
  if (current.entries.some((entry) => entry.id === id)) throw new Error(`Preference entry already exists: ${id}`);
  const entry = { id, kind: "pairwise", source: "user-explicit", enabled: input.enabled !== false, dimensions, context, ...identity, createdAt: now, updatedAt: now };
  return withMutation(current, [...current.entries, entry], now);
}

export function updatePreferenceEntry(memory, id, changes = {}, options = {}) {
  const current = parsePreferenceMemory(memory);
  const existing = current.entries.find((entry) => entry.id === id);
  if (!existing) throw new Error(`Preference entry was not found: ${id}`);
  const now = options.now ?? new Date().toISOString();
  if (!validDate(now)) throw new Error("Preference timestamp must be an ISO-compatible date.");
  const allowed = new Set(existing.kind === "statement" ? ["statement", "dimensions", "context", "enabled"] : ["rationale", "dimensions", "context", "enabled"]);
  for (const key of Object.keys(changes)) if (!allowed.has(key)) throw new Error(`Preference field cannot be edited: ${key}`);
  if (Object.prototype.hasOwnProperty.call(changes, "enabled") && typeof changes.enabled !== "boolean") throw new Error("Preference enabled must be a Boolean.");
  const nextEntry = {
    ...existing,
    ...(Object.prototype.hasOwnProperty.call(changes, "enabled") ? { enabled: changes.enabled } : {}),
    ...(changes.dimensions ? { dimensions: requireDimensions(changes.dimensions) } : {}),
    ...(changes.context ? { context: strictPreferenceContext(changes.context) } : {}),
    ...(existing.kind === "statement" && changes.statement !== undefined ? { statement: strictText(changes.statement, "Preference statement", 600) } : {}),
    ...(existing.kind === "pairwise" && changes.rationale !== undefined ? { rationale: strictText(changes.rationale, "Pairwise preference rationale", 600) } : {}),
    updatedAt: now,
  };
  if (existing.kind === "statement" && !nextEntry.statement) throw new Error("Preference statement must not be empty.");
  if (existing.kind === "pairwise" && !nextEntry.rationale) throw new Error("Pairwise preference rationale must not be empty.");
  return withMutation(current, current.entries.map((entry) => entry.id === id ? nextEntry : entry), now);
}

export function removePreferenceEntry(memory, id, options = {}) {
  const current = parsePreferenceMemory(memory);
  if (!current.entries.some((entry) => entry.id === id)) throw new Error(`Preference entry was not found: ${id}`);
  const now = options.now ?? new Date().toISOString();
  return withMutation(current, current.entries.filter((entry) => entry.id !== id), now);
}

export function clearPreferenceMemory(memory, options = {}) {
  const current = parsePreferenceMemory(memory);
  const now = options.now ?? new Date().toISOString();
  return withMutation(current, [], now);
}

export function setPreferenceMemoryEnabled(memory, enabled, options = {}) {
  const current = parsePreferenceMemory(memory);
  if (typeof enabled !== "boolean") throw new Error("Preference enabled must be a Boolean.");
  const now = options.now ?? new Date().toISOString();
  return withMutation(current, current.entries, now, { enabled });
}

export function preferenceContextForProject(brief = {}, project = {}, extraTags = []) {
  const value = (input) => {
    const text = cleanText(input, 80);
    return text && text !== "auto" ? [text] : [];
  };
  const projectionTypes = [...new Set((project.maps ?? []).map((map) => cleanText(map?.projection?.type, 80)).filter(Boolean))];
  return normalizePreferenceContext({
    genres: value(brief.genre),
    coreLoops: value(brief.coreLoop),
    movementTemplates: value(brief.movementTemplate),
    formats: value(brief.format),
    progressionModes: value(brief.progression),
    campaignScopes: value(brief.campaignScope),
    tags: [...extraTags, cleanText(project.runtimeProfile?.framework, 80), ...projectionTypes].filter(Boolean),
  });
}

function matchEntry(entry, activeContext) {
  if (!hasPreferenceContext(entry.context)) return { relevant: true, matchCount: 0, reasons: ["Applies generally; no game-context filter was recorded."] };
  let matchCount = 0;
  const reasons = [];
  for (const key of CONTEXT_KEYS) {
    const scoped = entry.context[key];
    if (scoped.length === 0) continue;
    const active = new Set(activeContext[key].map((item) => item.toLowerCase()));
    const matching = scoped.filter((item) => active.has(item.toLowerCase()));
    if (matching.length === 0) return { relevant: false, matchCount: 0, reasons: [] };
    matchCount += matching.length;
    reasons.push(`${key}: ${matching.join(", ")}`);
  }
  return { relevant: true, matchCount, reasons };
}

function appliedEntry(entry, relevance) {
  const guidance = entry.kind === "statement"
    ? entry.statement
    : `In an explicit prior comparison, the user preferred ${entry.preferredCandidateId} over ${entry.otherCandidateId}. Their reason was: ${entry.rationale}`;
  return {
    id: entry.id,
    kind: entry.kind,
    dimensions: clone(entry.dimensions),
    guidance,
    context: clone(entry.context),
    relevance: { reasons: clone(relevance.reasons) },
    provenance: {
      source: entry.source,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      ...(entry.kind === "pairwise" ? {
        comparisonDigest: entry.comparisonDigest,
        preferredSourceDigest: entry.preferredSourceDigest,
        otherSourceDigest: entry.otherSourceDigest,
      } : {}),
    },
  };
}

export function selectAppliedPreferenceContext(memory, activeContext = {}, options = {}) {
  const current = parsePreferenceMemory(memory);
  const context = strictPreferenceContext(activeContext);
  if (options.enabled !== undefined && typeof options.enabled !== "boolean") throw new Error("Applied preference selection enabled must be a Boolean.");
  const excludedEntryIds = strictTextList(options.excludeEntryIds ?? [], "Excluded preference entry IDs", { maximumItems: MAX_ENTRIES, maximumLength: 96 });
  const excluded = new Set(excludedEntryIds);
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > MAX_APPLIED_ENTRIES)) {
    throw new Error(`Applied preference selection limit must be an integer from 1 to ${MAX_APPLIED_ENTRIES}.`);
  }
  const limit = options.limit ?? 8;
  const enabled = current.enabled && options.enabled !== false;
  const ranked = enabled ? current.entries.flatMap((entry) => {
    if (!entry.enabled || excluded.has(entry.id)) return [];
    const relevance = matchEntry(entry, context);
    return relevance.relevant ? [{ entry, relevance }] : [];
  }).sort((first, second) => second.relevance.matchCount - first.relevance.matchCount
    || Date.parse(second.entry.updatedAt) - Date.parse(first.entry.updatedAt)
    || first.entry.id.localeCompare(second.entry.id)).slice(0, limit) : [];
  const result = {
    schemaVersion: LOOPLAB_APPLIED_PREFERENCE_CONTEXT_SCHEMA,
    enabled,
    memoryDigest: canonicalSha256(current),
    activeContext: context,
    selectedEntryIds: ranked.map(({ entry }) => entry.id),
    excludedEntryIds,
    entries: ranked.map(({ entry, relevance }) => appliedEntry(entry, relevance)),
    instruction: APPLIED_PREFERENCE_INSTRUCTION,
    policy: clone(LOOPLAB_PREFERENCE_MEMORY_POLICY),
  };
  return { ...result, receiptDigest: canonicalSha256(result) };
}

export function normalizeAppliedPreferenceContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Applied preference context must be an object.");
  findSensitiveKeys(value, "preferenceContext", []).forEach((error) => { throw new Error(error); });
  const unknown = Object.keys(value).filter((key) => !APPLIED_CONTEXT_KEYS.has(key));
  if (unknown.length) throw new Error(`preferenceContext.${unknown[0]} is not an allowed field.`);
  if (value.schemaVersion !== LOOPLAB_APPLIED_PREFERENCE_CONTEXT_SCHEMA) throw new Error(`Applied preference context schema must be ${LOOPLAB_APPLIED_PREFERENCE_CONTEXT_SCHEMA}.`);
  if (typeof value.enabled !== "boolean") throw new Error("Applied preference context enabled must be a Boolean.");
  if (!SHA256_PATTERN.test(String(value.memoryDigest ?? ""))) throw new Error("Applied preference context requires a canonical memory digest.");
  if (!SHA256_PATTERN.test(String(value.receiptDigest ?? ""))) throw new Error("Applied preference context requires its canonical receipt digest.");
  if (!Array.isArray(value.entries) || value.entries.length > MAX_APPLIED_ENTRIES) throw new Error(`Applied preference context may contain at most ${MAX_APPLIED_ENTRIES} entries.`);
  if (!value.enabled && value.entries.length) throw new Error("Disabled applied preference context cannot contain entries.");
  const seenIds = new Set();
  const entries = value.entries.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`Applied preference entry ${index + 1} must be an object.`);
    const entryUnknown = Object.keys(entry).filter((key) => !APPLIED_ENTRY_KEYS.has(key));
    if (entryUnknown.length) throw new Error(`preferenceContext.entries[${index}].${entryUnknown[0]} is not an allowed field.`);
    const guidance = strictText(entry.guidance, `Applied preference entry ${index + 1} guidance`, 800);
    const id = strictText(entry.id, `Applied preference entry ${index + 1} ID`, 96);
    if (!/^[a-z0-9][a-z0-9-]{5,95}$/.test(id) || seenIds.has(id) || !["statement", "pairwise"].includes(entry.kind)) throw new Error(`Applied preference entry ${index + 1} is invalid.`);
    seenIds.add(id);
    if (!entry.relevance || typeof entry.relevance !== "object" || Array.isArray(entry.relevance)) throw new Error(`Applied preference entry ${index + 1} relevance must be an object.`);
    const relevanceUnknown = Object.keys(entry.relevance).filter((key) => !APPLIED_RELEVANCE_KEYS.has(key));
    if (relevanceUnknown.length) throw new Error(`preferenceContext.entries[${index}].relevance.${relevanceUnknown[0]} is not an allowed field.`);
    if (!entry.provenance || typeof entry.provenance !== "object" || Array.isArray(entry.provenance)) throw new Error(`Applied preference entry ${index + 1} provenance must be an object.`);
    const provenanceKeys = entry.kind === "pairwise" ? APPLIED_PAIRWISE_PROVENANCE_KEYS : APPLIED_PROVENANCE_KEYS;
    const provenanceUnknown = Object.keys(entry.provenance).filter((key) => !provenanceKeys.has(key));
    if (provenanceUnknown.length) throw new Error(`preferenceContext.entries[${index}].provenance.${provenanceUnknown[0]} is not an allowed field.`);
    if (entry.provenance.source !== "user-explicit" || !validDate(entry.provenance.createdAt) || !validDate(entry.provenance.updatedAt)) throw new Error(`Applied preference entry ${index + 1} provenance is invalid.`);
    const provenance = {
      source: "user-explicit",
      createdAt: entry.provenance.createdAt,
      updatedAt: entry.provenance.updatedAt,
      ...(entry.kind === "pairwise" ? {
        comparisonDigest: strictText(entry.provenance.comparisonDigest, `Applied preference entry ${index + 1} comparison digest`, 200),
        preferredSourceDigest: strictText(entry.provenance.preferredSourceDigest, `Applied preference entry ${index + 1} preferred source digest`, 200),
        otherSourceDigest: strictText(entry.provenance.otherSourceDigest, `Applied preference entry ${index + 1} other source digest`, 200),
      } : {}),
    };
    return {
      id,
      kind: entry.kind,
      dimensions: requireDimensions(entry.dimensions),
      guidance,
      context: strictPreferenceContext(entry.context, { complete: true, label: `preferenceContext.entries[${index}].context` }),
      relevance: { reasons: strictTextList(entry.relevance.reasons, `preferenceContext.entries[${index}].relevance.reasons`, { maximumItems: 12, maximumLength: 160 }) },
      provenance,
    };
  });
  const selectedEntryIds = strictTextList(value.selectedEntryIds, "preferenceContext.selectedEntryIds", { maximumItems: MAX_APPLIED_ENTRIES, maximumLength: 96 });
  if (JSON.stringify(selectedEntryIds) !== JSON.stringify(entries.map((entry) => entry.id))) throw new Error("Applied preference context selectedEntryIds must exactly match its ordered entries.");
  const excludedEntryIds = strictTextList(value.excludedEntryIds, "preferenceContext.excludedEntryIds", { maximumItems: MAX_ENTRIES, maximumLength: 96 });
  if (excludedEntryIds.some((id) => seenIds.has(id))) throw new Error("Applied and excluded preference IDs cannot overlap.");
  if (value.instruction !== APPLIED_PREFERENCE_INSTRUCTION) throw new Error("Applied preference context instruction does not match LoopLab policy.");
  if (canonicalSha256(value.policy) !== canonicalSha256(LOOPLAB_PREFERENCE_MEMORY_POLICY)) throw new Error("Applied preference context policy does not match LoopLab policy.");
  const normalized = {
    schemaVersion: LOOPLAB_APPLIED_PREFERENCE_CONTEXT_SCHEMA,
    enabled: value.enabled,
    memoryDigest: value.memoryDigest,
    activeContext: strictPreferenceContext(value.activeContext, { complete: true, label: "preferenceContext.activeContext" }),
    selectedEntryIds,
    excludedEntryIds,
    entries,
    instruction: APPLIED_PREFERENCE_INSTRUCTION,
    policy: clone(LOOPLAB_PREFERENCE_MEMORY_POLICY),
  };
  const receiptDigest = canonicalSha256(normalized);
  if (value.receiptDigest !== receiptDigest) throw new Error("Applied preference context receipt digest does not match its canonical content.");
  return { ...normalized, receiptDigest };
}

export function preferenceMemoryView(memory) {
  const current = parsePreferenceMemory(memory);
  return {
    ...clone(current),
    entryCount: current.entries.length,
    enabledEntryCount: current.entries.filter((entry) => entry.enabled).length,
    digest: canonicalSha256(current),
    policy: clone(LOOPLAB_PREFERENCE_MEMORY_POLICY),
  };
}
