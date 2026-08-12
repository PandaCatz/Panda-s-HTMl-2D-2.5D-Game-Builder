import { canonicalSha256 } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_VISUAL_IDENTITY_SCHEMA = "looplab-visual-identity/v1";
export const LOOPLAB_VISUAL_IDENTITY_REPORT_SCHEMA = "looplab-visual-identity-report/v1";
export const LOOPLAB_VISUAL_IDENTITY_CONTEXT_SCHEMA = "looplab-visual-identity-context/v1";

export const LOOPLAB_VISUAL_IDENTITY_DIMENSIONS = Object.freeze([
  "palette", "value", "shape", "outline", "lighting", "material", "texture",
  "projection", "proportion", "scale", "motion", "ui",
]);
export const LOOPLAB_VISUAL_IDENTITY_ASSET_ROLES = Object.freeze([
  "character", "enemy", "pickup", "prop", "effect", "ui", "tileset", "environment",
]);
export const LOOPLAB_VISUAL_IDENTITY_ROLES = Object.freeze(["all", ...LOOPLAB_VISUAL_IDENTITY_ASSET_ROLES]);
export const LOOPLAB_VISUAL_REFERENCE_PURPOSES = Object.freeze(["style", "identity", "structure", "material", "ui"]);

export const LOOPLAB_VISUAL_IDENTITY_LIMITS = Object.freeze({
  maximumDirectives: 32,
  maximumReferences: 16,
  maximumExclusions: 16,
  maximumRolesPerEntry: LOOPLAB_VISUAL_IDENTITY_ROLES.length,
  maximumInstructionCharacters: 1_200,
  maximumIntentCharacters: 2_000,
  maximumImageReferencesPerJob: 4,
  maximumReferenceBytesPerJob: 16 * 1024 * 1024,
});

export const LOOPLAB_VISUAL_IDENTITY_POLICY = Object.freeze({
  sourceField: "visualIdentity",
  schemaVersion: LOOPLAB_VISUAL_IDENTITY_SCHEMA,
  reportSchemaVersion: LOOPLAB_VISUAL_IDENTITY_REPORT_SCHEMA,
  defaultInheritance: true,
  uploadConsent: "Selecting a project reference never authorizes a provider upload. Every job with delivery=image requires explicit referenceConsent=true.",
  creativeAuthority: "Only explicit user-authored directives may be locks. Provider output never adopts, removes, or rewrites the project identity implicitly.",
  geometryBoundary: "Visual identity and generated pixels cannot own collision, support, traversal, navigation, depth, completion, acceptance, or replay state.",
  judgmentBoundary: "Schema, reference resolution, provenance evidence, and receipt consistency do not prove beauty, originality, legal clearance, or faithful provider adherence. Visual review and explicit human or agent judgment remain required.",
});

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const STATUS = new Set(["draft", "adopted"]);
const DIMENSIONS = new Set(LOOPLAB_VISUAL_IDENTITY_DIMENSIONS);
const ROLES = new Set(LOOPLAB_VISUAL_IDENTITY_ROLES);
const PURPOSES = new Set(LOOPLAB_VISUAL_REFERENCE_PURPOSES);
const STRENGTHS = new Set(["guide", "lock"]);
const DELIVERY = new Set(["semantic", "image"]);
const ROOT_KEYS = new Set(["schemaVersion", "revision", "status", "intent", "directives", "references", "exclusions"]);
const DIRECTIVE_KEYS = new Set(["id", "dimension", "instruction", "appliesToRoles", "strength", "userAuthored"]);
const REFERENCE_KEYS = new Set(["id", "assetId", "purpose", "appliesToRoles", "delivery", "note"]);
const EXCLUSION_KEYS = new Set(["id", "instruction", "appliesToRoles"]);

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const clean = (value, maximum = LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumInstructionCharacters) => String(value ?? "").trim().slice(0, maximum);
const sourceArray = (value) => Array.isArray(value) ? value : [];

function normalizeRoles(value) {
  const roles = [...new Set(sourceArray(value).map((role) => clean(role, 40)).filter((role) => ROLES.has(role)))];
  return roles.length ? roles : ["all"];
}

function normalizeDirective(value = {}) {
  return {
    id: clean(value.id, 120),
    dimension: DIMENSIONS.has(value.dimension) ? value.dimension : "shape",
    instruction: clean(value.instruction),
    appliesToRoles: normalizeRoles(value.appliesToRoles),
    strength: STRENGTHS.has(value.strength) ? value.strength : "guide",
    userAuthored: value.userAuthored === true,
  };
}

function normalizeReference(value = {}) {
  return {
    id: clean(value.id, 120),
    assetId: clean(value.assetId, 160),
    purpose: PURPOSES.has(value.purpose) ? value.purpose : "style",
    appliesToRoles: normalizeRoles(value.appliesToRoles),
    delivery: DELIVERY.has(value.delivery) ? value.delivery : "semantic",
    note: clean(value.note),
  };
}

function normalizeExclusion(value = {}) {
  return {
    id: clean(value.id, 120),
    instruction: clean(value.instruction),
    appliesToRoles: normalizeRoles(value.appliesToRoles),
  };
}

export function normalizeVisualIdentity(input = {}) {
  return {
    schemaVersion: LOOPLAB_VISUAL_IDENTITY_SCHEMA,
    revision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 1,
    status: STATUS.has(input.status) ? input.status : "draft",
    intent: clean(input.intent, LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumIntentCharacters),
    directives: sourceArray(input.directives).slice(0, LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumDirectives).map(normalizeDirective),
    references: sourceArray(input.references).slice(0, LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumReferences).map(normalizeReference),
    exclusions: sourceArray(input.exclusions).slice(0, LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumExclusions).map(normalizeExclusion),
  };
}

function addIssue(issues, severity, code, message, context = {}) {
  issues.push({ severity, code, message, ...context });
}

function unknownKeys(value, allowed, path, issues) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) if (!allowed.has(key)) {
    addIssue(issues, "error", "visual-identity-field-unknown", `${path}.${key} is not an allowed visual-identity field.`, { path: `${path}.${key}` });
  }
}

function validateStableIds(values, field, issues) {
  const ids = new Set();
  for (const [index, value] of values.entries()) {
    if (!STABLE_ID.test(value?.id ?? "")) addIssue(issues, "error", "visual-identity-id-invalid", `${field}[${index}].id must be a stable non-empty ID.`, { path: `${field}[${index}].id`, index });
    else if (ids.has(value.id)) addIssue(issues, "error", "visual-identity-id-duplicate", `${field}[${index}].id duplicates ${value.id}.`, { path: `${field}[${index}].id`, id: value.id, index });
    else ids.add(value.id);
  }
}

function validateRoles(value, path, issues) {
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, "error", "visual-identity-roles", `${path} must contain at least one explicit role.`, { path });
    return;
  }
  if (value.length > LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumRolesPerEntry) addIssue(issues, "error", "visual-identity-role-limit", `${path} contains too many roles.`, { path });
  const seen = new Set();
  for (const role of value) {
    if (!ROLES.has(role)) addIssue(issues, "error", "visual-identity-role-unsupported", `${path} contains unsupported role ${String(role)}.`, { path, role });
    else if (seen.has(role)) addIssue(issues, "error", "visual-identity-role-duplicate", `${path} duplicates role ${role}.`, { path, role });
    seen.add(role);
  }
  if (seen.has("all") && seen.size > 1) addIssue(issues, "warning", "visual-identity-role-redundant", `${path} includes all, so its other roles are redundant.`, { path });
}

function rolesOverlap(first, second) {
  return first.includes("all") || second.includes("all") || first.some((role) => second.includes(role));
}

function embeddedPngBytes(asset) {
  const dataUrl = typeof asset?.dataUrl === "string" ? asset.dataUrl : "";
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match) return null;
  const base64 = match[1].replace(/\s+/g, "");
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
}

function assetProvenance(asset) {
  const source = asset?.source;
  if (source?.license && source?.licenseUrl && source?.sourceUrl) return {
    kind: "licensed-source",
    complete: true,
    license: source.license,
    licenseUrl: source.licenseUrl,
    sourceUrl: source.sourceUrl,
  };
  if (asset?.generator?.provider || asset?.generator?.source === "openai-image-api") return {
    kind: "generated",
    complete: true,
    provider: asset.generator.provider ?? "openai",
    model: asset.generator.model ?? null,
    promptDigest: asset.generator.promptDigest ?? null,
  };
  if (asset?.license?.id || asset?.license?.url) return {
    kind: "declared-license",
    complete: Boolean(asset.license.id && asset.license.url),
    license: asset.license.id ?? null,
    licenseUrl: asset.license.url ?? null,
  };
  return { kind: "unknown", complete: false };
}

export function inspectVisualIdentity(project, input = project?.visualIdentity, options = {}) {
  const sourceDigest = options.sourceDigest ?? null;
  const required = project?.qualityContracts?.visualIdentityRequired === true;
  if (!input || typeof input !== "object" || Array.isArray(input)) return {
    schemaVersion: LOOPLAB_VISUAL_IDENTITY_REPORT_SCHEMA,
    identitySchemaVersion: LOOPLAB_VISUAL_IDENTITY_SCHEMA,
    present: false,
    required,
    status: required ? "missing" : "absent",
    sourceDigest,
    identityDigest: null,
    identity: null,
    metrics: { directiveCount: 0, referenceCount: 0, imageReferenceCount: 0, exclusionCount: 0, unresolvedReferenceCount: 0, provenanceUnknownCount: 0 },
    referenceEvidence: [],
    errors: required ? ["A project visual identity is required but missing."] : [],
    warnings: [],
    issues: required ? [{ severity: "error", code: "visual-identity-missing", message: "A project visual identity is required but missing." }] : [],
    proofBoundary: LOOPLAB_VISUAL_IDENTITY_POLICY.judgmentBoundary,
  };

  const issues = [];
  unknownKeys(input, ROOT_KEYS, "visualIdentity", issues);
  if (input.schemaVersion !== LOOPLAB_VISUAL_IDENTITY_SCHEMA) addIssue(issues, "error", "visual-identity-schema", `visualIdentity.schemaVersion must be ${LOOPLAB_VISUAL_IDENTITY_SCHEMA}.`, { path: "visualIdentity.schemaVersion" });
  if (!Number.isInteger(input.revision) || input.revision < 1) addIssue(issues, "error", "visual-identity-revision", "visualIdentity.revision must be a positive integer.", { path: "visualIdentity.revision" });
  if (!STATUS.has(input.status)) addIssue(issues, "error", "visual-identity-status", "visualIdentity.status must be draft or adopted.", { path: "visualIdentity.status" });
  if (typeof input.intent !== "string" || !input.intent.trim()) addIssue(issues, "error", "visual-identity-intent", "visualIdentity.intent must be a non-empty authored description.", { path: "visualIdentity.intent" });
  else if (input.intent.length > LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumIntentCharacters) addIssue(issues, "error", "visual-identity-intent-limit", `visualIdentity.intent may contain at most ${LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumIntentCharacters} characters.`, { path: "visualIdentity.intent" });
  for (const field of ["directives", "references", "exclusions"]) if (!Array.isArray(input[field])) addIssue(issues, "error", "visual-identity-array", `visualIdentity.${field} must be an array.`, { path: `visualIdentity.${field}` });
  if ((input.directives?.length ?? 0) > LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumDirectives) addIssue(issues, "error", "visual-identity-directive-limit", `visualIdentity.directives may contain at most ${LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumDirectives} entries.`);
  if ((input.references?.length ?? 0) > LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumReferences) addIssue(issues, "error", "visual-identity-reference-limit", `visualIdentity.references may contain at most ${LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumReferences} entries.`);
  if ((input.exclusions?.length ?? 0) > LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumExclusions) addIssue(issues, "error", "visual-identity-exclusion-limit", `visualIdentity.exclusions may contain at most ${LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumExclusions} entries.`);

  for (const [index, directive] of sourceArray(input.directives).entries()) {
    const path = `visualIdentity.directives[${index}]`;
    unknownKeys(directive, DIRECTIVE_KEYS, path, issues);
    if (!DIMENSIONS.has(directive?.dimension)) addIssue(issues, "error", "visual-identity-dimension", `${path}.dimension is unsupported.`, { path: `${path}.dimension`, directiveId: directive?.id });
    if (typeof directive?.instruction !== "string" || !directive.instruction.trim()) addIssue(issues, "error", "visual-identity-instruction", `${path}.instruction must be non-empty.`, { path: `${path}.instruction`, directiveId: directive?.id });
    else if (directive.instruction.length > LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumInstructionCharacters) addIssue(issues, "error", "visual-identity-instruction-limit", `${path}.instruction is too long.`, { path: `${path}.instruction`, directiveId: directive?.id });
    validateRoles(directive?.appliesToRoles, `${path}.appliesToRoles`, issues);
    if (!STRENGTHS.has(directive?.strength)) addIssue(issues, "error", "visual-identity-strength", `${path}.strength must be guide or lock.`, { path: `${path}.strength`, directiveId: directive?.id });
    if (typeof directive?.userAuthored !== "boolean") addIssue(issues, "error", "visual-identity-authorship", `${path}.userAuthored must be boolean.`, { path: `${path}.userAuthored`, directiveId: directive?.id });
    if (directive?.strength === "lock" && directive?.userAuthored !== true) addIssue(issues, "error", "visual-identity-ai-lock", `${path} cannot be a lock unless userAuthored is true.`, { path, directiveId: directive?.id });
  }
  for (const [index, reference] of sourceArray(input.references).entries()) {
    const path = `visualIdentity.references[${index}]`;
    unknownKeys(reference, REFERENCE_KEYS, path, issues);
    if (typeof reference?.assetId !== "string" || !reference.assetId.trim()) addIssue(issues, "error", "visual-identity-reference-asset", `${path}.assetId must name one project asset.`, { path: `${path}.assetId`, referenceId: reference?.id });
    if (!PURPOSES.has(reference?.purpose)) addIssue(issues, "error", "visual-identity-reference-purpose", `${path}.purpose is unsupported.`, { path: `${path}.purpose`, referenceId: reference?.id });
    validateRoles(reference?.appliesToRoles, `${path}.appliesToRoles`, issues);
    if (!DELIVERY.has(reference?.delivery)) addIssue(issues, "error", "visual-identity-reference-delivery", `${path}.delivery must be semantic or image.`, { path: `${path}.delivery`, referenceId: reference?.id });
    if (typeof reference?.note !== "string" || !reference.note.trim()) addIssue(issues, "error", "visual-identity-reference-note", `${path}.note must explain what to learn from the asset.`, { path: `${path}.note`, referenceId: reference?.id });
  }
  for (const [index, exclusion] of sourceArray(input.exclusions).entries()) {
    const path = `visualIdentity.exclusions[${index}]`;
    unknownKeys(exclusion, EXCLUSION_KEYS, path, issues);
    if (typeof exclusion?.instruction !== "string" || !exclusion.instruction.trim()) addIssue(issues, "error", "visual-identity-exclusion", `${path}.instruction must be non-empty.`, { path: `${path}.instruction`, exclusionId: exclusion?.id });
    validateRoles(exclusion?.appliesToRoles, `${path}.appliesToRoles`, issues);
  }

  validateStableIds(sourceArray(input.directives), "visualIdentity.directives", issues);
  validateStableIds(sourceArray(input.references), "visualIdentity.references", issues);
  validateStableIds(sourceArray(input.exclusions), "visualIdentity.exclusions", issues);
  const normalized = normalizeVisualIdentity(input);
  const allIds = [...normalized.directives, ...normalized.references, ...normalized.exclusions].map((entry) => entry.id);
  const globalSeen = new Set();
  for (const id of allIds) {
    if (globalSeen.has(id)) addIssue(issues, "error", "visual-identity-global-id-duplicate", `Visual identity ID ${id} is reused across entry types.`, { id });
    globalSeen.add(id);
  }

  const locked = normalized.directives.filter((directive) => directive.strength === "lock");
  for (let firstIndex = 0; firstIndex < locked.length; firstIndex += 1) for (let secondIndex = firstIndex + 1; secondIndex < locked.length; secondIndex += 1) {
    const first = locked[firstIndex];
    const second = locked[secondIndex];
    if (first.dimension === second.dimension && rolesOverlap(first.appliesToRoles, second.appliesToRoles) && first.instruction.toLowerCase() !== second.instruction.toLowerCase()) {
      addIssue(issues, "error", "visual-identity-lock-conflict", `Locked directives ${first.id} and ${second.id} conflict on ${first.dimension} for overlapping roles.`, { directiveIds: [first.id, second.id], dimension: first.dimension });
    }
  }

  const assets = Array.isArray(project?.assets) ? project.assets : [];
  const assetById = new Map(assets.map((asset) => [asset?.id, asset]));
  const referenceEvidence = normalized.references.map((reference) => {
    const asset = assetById.get(reference.assetId) ?? null;
    const provenance = assetProvenance(asset);
    const byteLength = asset ? embeddedPngBytes(asset) : null;
    if (!asset) addIssue(issues, "error", "visual-identity-reference-unresolved", `Reference ${reference.id} points to missing project asset ${reference.assetId}.`, { referenceId: reference.id, assetId: reference.assetId });
    else {
      if (reference.delivery === "image" && byteLength === null) addIssue(issues, "error", "visual-identity-reference-image", `Image-delivery reference ${reference.id} must resolve to an embedded PNG asset.`, { referenceId: reference.id, assetId: reference.assetId });
      if (!provenance.complete) addIssue(issues, "warning", "visual-identity-reference-provenance", `Reference ${reference.id} has no complete stored source-license or generator provenance.`, { referenceId: reference.id, assetId: reference.assetId });
    }
    return {
      referenceId: reference.id,
      assetId: reference.assetId,
      assetName: asset?.name ?? null,
      purpose: reference.purpose,
      delivery: reference.delivery,
      resolved: Boolean(asset),
      mimeType: byteLength === null ? null : "image/png",
      byteLength,
      provenance,
    };
  });
  const purposesByAsset = new Map();
  for (const reference of normalized.references) {
    const purposes = purposesByAsset.get(reference.assetId) ?? new Set();
    purposes.add(reference.purpose);
    purposesByAsset.set(reference.assetId, purposes);
  }
  for (const [assetId, purposes] of purposesByAsset) if (purposes.has("style") && purposes.has("identity")) {
    addIssue(issues, "warning", "visual-identity-content-leak-risk", `Asset ${assetId} is used as both style and identity guidance; review outputs for copied content or concept collapse.`, { assetId });
  }
  if (normalized.status === "adopted" && normalized.directives.length + normalized.references.length === 0) addIssue(issues, "warning", "visual-identity-adopted-empty", "The project identity is adopted but contains no directives or references.");

  const errors = issues.filter((issue) => issue.severity === "error").map((issue) => issue.message);
  const warnings = issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message);
  const identityDigest = canonicalSha256(normalized);
  return {
    schemaVersion: LOOPLAB_VISUAL_IDENTITY_REPORT_SCHEMA,
    identitySchemaVersion: LOOPLAB_VISUAL_IDENTITY_SCHEMA,
    present: true,
    required,
    status: errors.length ? "invalid" : warnings.length ? "review" : normalized.status,
    sourceDigest,
    identityDigest,
    identity: normalized,
    metrics: {
      directiveCount: normalized.directives.length,
      lockCount: normalized.directives.filter((directive) => directive.strength === "lock").length,
      referenceCount: normalized.references.length,
      imageReferenceCount: normalized.references.filter((reference) => reference.delivery === "image").length,
      exclusionCount: normalized.exclusions.length,
      unresolvedReferenceCount: referenceEvidence.filter((entry) => !entry.resolved).length,
      provenanceUnknownCount: referenceEvidence.filter((entry) => !entry.provenance.complete).length,
    },
    referenceEvidence,
    errors,
    warnings,
    issues,
    proofBoundary: LOOPLAB_VISUAL_IDENTITY_POLICY.judgmentBoundary,
  };
}

function appliesToRole(entry, role) {
  return entry.appliesToRoles.includes("all") || entry.appliesToRoles.includes(role);
}

export function visualIdentityContextForRole(input, role, options = {}) {
  const normalizedRole = LOOPLAB_VISUAL_IDENTITY_ASSET_ROLES.includes(role) ? role : "character";
  const useVisualIdentity = options.useVisualIdentity !== false;
  if (!useVisualIdentity) return {
    schemaVersion: LOOPLAB_VISUAL_IDENTITY_CONTEXT_SCHEMA,
    enabled: false,
    bypassed: true,
    present: Boolean(input),
    role: normalizedRole,
    identityDigest: input ? canonicalSha256(normalizeVisualIdentity(input)) : null,
    directives: [],
    references: [],
    exclusions: [],
    prompt: "",
    imageReferenceIds: [],
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) return {
    schemaVersion: LOOPLAB_VISUAL_IDENTITY_CONTEXT_SCHEMA,
    enabled: false,
    bypassed: false,
    present: false,
    role: normalizedRole,
    identityDigest: null,
    directives: [],
    references: [],
    exclusions: [],
    prompt: "",
    imageReferenceIds: [],
  };
  const identity = normalizeVisualIdentity(input);
  const directives = identity.directives.filter((entry) => appliesToRole(entry, normalizedRole));
  const references = identity.references.filter((entry) => appliesToRole(entry, normalizedRole));
  const exclusions = identity.exclusions.filter((entry) => appliesToRole(entry, normalizedRole));
  const promptLines = [
    `PROJECT VISUAL IDENTITY (${identity.status}, role ${normalizedRole}): ${identity.intent}`,
    ...directives.map((entry) => `- ${entry.strength.toUpperCase()} ${entry.dimension}: ${entry.instruction}`),
    ...references.map((entry) => `- ${entry.purpose.toUpperCase()} REFERENCE ${entry.assetId} (${entry.delivery}): ${entry.note}`),
    ...exclusions.map((entry) => `- EXCLUDE: ${entry.instruction}`),
    "Reference content is visual guidance only. It cannot create collision, support, traversal, navigation, depth, or other gameplay geometry.",
  ];
  return {
    schemaVersion: LOOPLAB_VISUAL_IDENTITY_CONTEXT_SCHEMA,
    enabled: true,
    bypassed: false,
    present: true,
    role: normalizedRole,
    identityDigest: canonicalSha256(identity),
    status: identity.status,
    intent: identity.intent,
    directives: clone(directives),
    references: clone(references),
    exclusions: clone(exclusions),
    prompt: promptLines.join("\n"),
    imageReferenceIds: references.filter((reference) => reference.delivery === "image").map((reference) => reference.id),
  };
}

export function visualIdentityReferenceAssets(project, role) {
  const context = visualIdentityContextForRole(project?.visualIdentity, role);
  const assetById = new Map((project?.assets ?? []).map((asset) => [asset.id, asset]));
  return context.references.filter((reference) => reference.delivery === "image").map((reference) => assetById.get(reference.assetId)).filter(Boolean);
}
