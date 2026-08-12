import { canonicalSha256, sha256Hex } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_VISUAL_CRITIQUE_REQUEST_VERSION = "looplab-visual-critique-request/v1";
export const LOOPLAB_VISUAL_CRITIQUE_VERSION = "looplab-visual-critique/v1";
export const LOOPLAB_VISUAL_CRITIQUE_DIMENSIONS = Object.freeze([
  "gameplay-readability",
  "brief-alignment",
  "visual-hierarchy",
  "style-cohesion",
  "character-environment-fit",
  "depth-legibility",
  "hud-obstruction",
]);
export const LOOPLAB_VISUAL_CRITIQUE_LIMITS = Object.freeze({
  maximumCaptures: 8,
  maximumCaptureBytes: 4 * 1024 * 1024,
  maximumTotalBytes: 16 * 1024 * 1024,
  maximumDimension: 4096,
  maximumVisualIdentityCharacters: 16_000,
});

const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
const SOURCE_DIGEST_PATTERN = /^source-[a-f0-9]{64}$/;
const SHA256_PATTERN = /^(?:sha256:)?([a-f0-9]{64})$/;
const CONFIDENCE = new Set(["high", "medium", "low"]);
const SEVERITY = new Set(["high", "medium", "low"]);

function fail(message) {
  throw new Error(`Visual critique request is invalid: ${message}`);
}

function text(value, maximum, label, { required = false } = {}) {
  const normalized = String(value ?? "").trim();
  if (required && !normalized) fail(`${label} is required.`);
  if (normalized.length > maximum) fail(`${label} exceeds ${maximum} characters.`);
  return normalized;
}
function boundedJsonContext(value, label, maximum) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object when provided.`);
  const serialized = JSON.stringify(value);
  if (serialized.length > maximum) fail(`${label} exceeds ${maximum} serialized characters.`);
  if (/data:(?:image|audio|font)|;base64,|api[_-]?key|authorization/i.test(serialized)) fail(`${label} must not contain embedded bytes or credentials.`);
  return JSON.parse(serialized);
}

function boundedInteger(value, label, minimum = 1, maximum = LOOPLAB_VISUAL_CRITIQUE_LIMITS.maximumDimension) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < minimum || normalized > maximum) fail(`${label} must be an integer from ${minimum} through ${maximum}.`);
  return normalized;
}

function optionalViewport(value, label) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object when provided.`);
  const width = boundedInteger(value.width, `${label}.width`);
  const height = boundedInteger(value.height, `${label}.height`);
  const devicePixelRatio = Number(value.devicePixelRatio ?? 1);
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0 || devicePixelRatio > 8) fail(`${label}.devicePixelRatio must be greater than zero and no more than 8.`);
  return { width, height, devicePixelRatio };
}

function optionalBounds(value, label) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object when provided.`);
  return { width: boundedInteger(value.width, `${label}.width`), height: boundedInteger(value.height, `${label}.height`) };
}

function mimeMatchesBytes(mimeType, bytes) {
  if (mimeType === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/webp") return bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP";
  return false;
}

export function decodeVisualCritiqueCaptureDataUrl(dataUrl, label = "capture.dataUrl") {
  const match = String(dataUrl ?? "").match(DATA_URL_PATTERN);
  if (!match || match[2].length % 4 !== 0) fail(`${label} must be one base64 PNG, JPEG, or WebP data URL.`);
  const mimeType = match[1];
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || Buffer.from(bytes).toString("base64").replace(/=+$/, "") !== match[2].replace(/=+$/, "")) fail(`${label} contains invalid base64.`);
  if (!mimeMatchesBytes(mimeType, bytes)) fail(`${label} MIME type does not match its decoded bytes.`);
  return { mimeType, bytes, encoded: match[2] };
}

function normalizeCapture(capture, index) {
  if (!capture || typeof capture !== "object" || Array.isArray(capture)) fail(`captures[${index}] must be an object.`);
  const id = text(capture.id, 200, `captures[${index}].id`, { required: true });
  const decoded = decodeVisualCritiqueCaptureDataUrl(capture.dataUrl, `captures[${index}].dataUrl`);
  if (decoded.bytes.length > LOOPLAB_VISUAL_CRITIQUE_LIMITS.maximumCaptureBytes) fail(`captures[${index}] exceeds the 4 MiB decoded-image limit.`);
  const suppliedHash = String(capture.sha256 ?? "").trim().toLowerCase().match(SHA256_PATTERN)?.[1];
  if (!suppliedHash) fail(`captures[${index}].sha256 must contain one SHA-256 digest.`);
  const measuredHash = sha256Hex(decoded.bytes);
  if (suppliedHash !== measuredHash) fail(`captures[${index}].sha256 does not match the decoded image.`);
  return {
    id,
    mapId: text(capture.mapId, 200, `captures[${index}].mapId`, { required: true }),
    mapName: text(capture.mapName ?? capture.mapId, 240, `captures[${index}].mapName`, { required: true }),
    profileId: text(capture.profileId, 120, `captures[${index}].profileId`, { required: true }),
    profileName: text(capture.profileName ?? capture.profileId, 160, `captures[${index}].profileName`, { required: true }),
    width: boundedInteger(capture.width, `captures[${index}].width`),
    height: boundedInteger(capture.height, `captures[${index}].height`),
    renderedBounds: optionalBounds(capture.renderedBounds, `captures[${index}].renderedBounds`),
    targetViewport: optionalViewport(capture.targetViewport, `captures[${index}].targetViewport`),
    actualViewport: optionalViewport(capture.actualViewport, `captures[${index}].actualViewport`),
    annotationSummary: (Array.isArray(capture.annotationSummary) ? capture.annotationSummary : [])
      .map((entry, annotationIndex) => text(entry, 500, `captures[${index}].annotationSummary[${annotationIndex}]`))
      .filter(Boolean)
      .slice(0, 24),
    mimeType: decoded.mimeType,
    byteLength: decoded.bytes.length,
    sha256: `sha256:${measuredHash}`,
    dataUrl: String(capture.dataUrl),
  };
}

export function publicVisualCritiqueCapture(capture) {
  const publicCapture = { ...capture };
  delete publicCapture.dataUrl;
  return publicCapture;
}

export function publicVisualCritiqueRequest(request) {
  return {
    schemaVersion: request.schemaVersion,
    sourceDigest: request.sourceDigest,
    captureSetDigest: request.captureSetDigest,
    requestDigest: request.requestDigest,
    gameBrief: request.gameBrief,
    visualIdentity: request.visualIdentity,
    artDirection: request.artDirection,
    captureCount: request.captures.length,
    totalDecodedBytes: request.totalDecodedBytes,
    captures: request.captures.map(publicVisualCritiqueCapture),
    consent: true,
  };
}

export function normalizeVisualCritiqueRequest(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("the request must be an object.");
  if (input.consent !== true) fail("consent:true is required for every image submission.");
  const sourceDigest = String(input.sourceDigest ?? "").trim().toLowerCase();
  if (!SOURCE_DIGEST_PATTERN.test(sourceDigest)) fail("sourceDigest must be one canonical LoopLab source digest.");
  if (!Array.isArray(input.captures) || !input.captures.length) fail("at least one capture is required.");
  if (input.captures.length > LOOPLAB_VISUAL_CRITIQUE_LIMITS.maximumCaptures) fail(`no more than ${LOOPLAB_VISUAL_CRITIQUE_LIMITS.maximumCaptures} captures may be submitted.`);
  const captures = input.captures.map(normalizeCapture);
  const ids = new Set();
  for (const capture of captures) {
    if (ids.has(capture.id)) fail(`capture ID ${capture.id} is duplicated.`);
    ids.add(capture.id);
  }
  const totalDecodedBytes = captures.reduce((total, capture) => total + capture.byteLength, 0);
  if (totalDecodedBytes > LOOPLAB_VISUAL_CRITIQUE_LIMITS.maximumTotalBytes) fail("captures exceed the 16 MiB total decoded-image limit.");
  const request = {
    schemaVersion: LOOPLAB_VISUAL_CRITIQUE_REQUEST_VERSION,
    consent: true,
    sourceDigest,
    gameBrief: text(input.gameBrief ?? input.brief, 20_000, "gameBrief"),
    visualIdentity: boundedJsonContext(input.visualIdentity, "visualIdentity", LOOPLAB_VISUAL_CRITIQUE_LIMITS.maximumVisualIdentityCharacters),
    artDirection: text(input.artDirection, 8_000, "artDirection"),
    captures,
    captureSetDigest: canonicalSha256({ sourceDigest, captures: captures.map(publicVisualCritiqueCapture).sort((left, right) => left.id.localeCompare(right.id)) }),
    totalDecodedBytes,
  };
  return { ...request, requestDigest: canonicalSha256(publicVisualCritiqueRequest({ ...request, requestDigest: null })) };
}

function validCaptureIds(values, captureIds, label) {
  if (!Array.isArray(values)) fail(`${label} must be an array of capture IDs.`);
  const normalized = [...new Set(values.map((value) => text(value, 200, label)).filter(Boolean))];
  if (!normalized.length) fail(`${label} must reference at least one capture.`);
  for (const id of normalized) if (!captureIds.has(id)) fail(`${label} references unknown capture ${id}.`);
  return normalized;
}

function normalizeConfidence(value, label) {
  if (!CONFIDENCE.has(value)) fail(`${label} must be high, medium, or low.`);
  return value;
}

export function normalizeVisualCritiqueProviderOutput(raw, { request, provider, model, usage = null, generatedAt = new Date().toISOString() } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("provider output must be one object.");
  const normalizedRequest = request?.schemaVersion === LOOPLAB_VISUAL_CRITIQUE_REQUEST_VERSION ? request : normalizeVisualCritiqueRequest(request);
  const captureIds = new Set(normalizedRequest.captures.map((capture) => capture.id));
  if (!Array.isArray(raw.observations) || raw.observations.length !== captureIds.size) fail("provider output must contain exactly one observation for every submitted capture.");
  const observations = raw.observations.map((observation, index) => {
    const captureId = text(observation?.captureId, 200, `observations[${index}].captureId`, { required: true });
    if (!captureIds.has(captureId)) fail(`observations[${index}] references unknown capture ${captureId}.`);
    const groundedObservations = (Array.isArray(observation?.groundedObservations) ? observation.groundedObservations : []).map((entry, entryIndex) => ({
      region: text(entry?.region, 240, `observations[${index}].groundedObservations[${entryIndex}].region`, { required: true }),
      observation: text(entry?.observation, 1200, `observations[${index}].groundedObservations[${entryIndex}].observation`, { required: true }),
      confidence: normalizeConfidence(entry?.confidence, `observations[${index}].groundedObservations[${entryIndex}].confidence`),
    })).slice(0, 16);
    if (!groundedObservations.length) fail(`observations[${index}] must contain at least one grounded observation.`);
    return { captureId, sceneSummary: text(observation?.sceneSummary, 1800, `observations[${index}].sceneSummary`, { required: true }), groundedObservations };
  });
  if (new Set(observations.map((observation) => observation.captureId)).size !== captureIds.size) fail("provider observations contain duplicate or missing capture IDs.");

  if (!Array.isArray(raw.dimensions) || raw.dimensions.length !== LOOPLAB_VISUAL_CRITIQUE_DIMENSIONS.length) fail(`provider output must contain exactly ${LOOPLAB_VISUAL_CRITIQUE_DIMENSIONS.length} critique dimensions.`);
  const dimensions = raw.dimensions.map((dimension, index) => {
    const id = text(dimension?.id, 80, `dimensions[${index}].id`, { required: true });
    if (!LOOPLAB_VISUAL_CRITIQUE_DIMENSIONS.includes(id)) fail(`dimensions[${index}].id is not supported.`);
    const score = Number(dimension?.score);
    if (!Number.isInteger(score) || score < 0 || score > 100) fail(`dimensions[${index}].score must be an integer from 0 through 100.`);
    return {
      id,
      score,
      confidence: normalizeConfidence(dimension?.confidence, `dimensions[${index}].confidence`),
      evidenceCaptureIds: validCaptureIds(dimension?.evidenceCaptureIds, captureIds, `dimensions[${index}].evidenceCaptureIds`),
      rationale: text(dimension?.rationale, 1600, `dimensions[${index}].rationale`, { required: true }),
      nextAction: text(dimension?.nextAction, 1200, `dimensions[${index}].nextAction`, { required: true }),
    };
  });
  if (new Set(dimensions.map((dimension) => dimension.id)).size !== LOOPLAB_VISUAL_CRITIQUE_DIMENSIONS.length) fail("provider dimensions contain duplicate or missing IDs.");

  const strengths = (Array.isArray(raw.strengths) ? raw.strengths : []).map((strength, index) => ({
    id: text(strength?.id || `strength-${index + 1}`, 100, `strengths[${index}].id`, { required: true }),
    title: text(strength?.title, 240, `strengths[${index}].title`, { required: true }),
    summary: text(strength?.summary, 1400, `strengths[${index}].summary`, { required: true }),
    evidenceCaptureIds: validCaptureIds(strength?.evidenceCaptureIds, captureIds, `strengths[${index}].evidenceCaptureIds`),
  })).slice(0, 12);
  const issues = (Array.isArray(raw.issues) ? raw.issues : []).map((issue, index) => {
    if (!SEVERITY.has(issue?.severity)) fail(`issues[${index}].severity must be high, medium, or low.`);
    return {
      id: text(issue?.id || `issue-${index + 1}`, 100, `issues[${index}].id`, { required: true }),
      severity: issue.severity,
      title: text(issue?.title, 240, `issues[${index}].title`, { required: true }),
      problem: text(issue?.problem, 1800, `issues[${index}].problem`, { required: true }),
      impact: text(issue?.impact, 1400, `issues[${index}].impact`, { required: true }),
      suggestedChange: text(issue?.suggestedChange, 1800, `issues[${index}].suggestedChange`, { required: true }),
      evidenceCaptureIds: validCaptureIds(issue?.evidenceCaptureIds, captureIds, `issues[${index}].evidenceCaptureIds`),
    };
  }).slice(0, 20);
  if (!strengths.length && !issues.length) fail("provider output must contain at least one grounded strength or issue.");
  const limitations = (Array.isArray(raw.limitations) ? raw.limitations : []).map((value, index) => text(value, 1000, `limitations[${index}]`)).filter(Boolean).slice(0, 12);
  if (!limitations.length) fail("provider output must state at least one limitation.");

  const result = {
    schemaVersion: LOOPLAB_VISUAL_CRITIQUE_VERSION,
    sourceDigest: normalizedRequest.sourceDigest,
    captureSetDigest: normalizedRequest.captureSetDigest,
    requestDigest: normalizedRequest.requestDigest,
    generatedAt,
    provider: text(provider, 80, "provider", { required: true }),
    model: text(model, 160, "model", { required: true }),
    summary: text(raw.summary, 4000, "summary", { required: true }),
    observations,
    dimensions: dimensions.sort((left, right) => LOOPLAB_VISUAL_CRITIQUE_DIMENSIONS.indexOf(left.id) - LOOPLAB_VISUAL_CRITIQUE_DIMENSIONS.indexOf(right.id)),
    strengths,
    issues,
    limitations,
    usage,
    policy: {
      advisoryOnly: true,
      mutatesProject: false,
      verificationEvidence: false,
      automaticWinner: null,
      aestheticApproval: "not-proven",
      retention: { submission: "explicit-consent-per-job", requestImages: "isolated-temporary-job-files", resultIncludesImages: false, projectStorage: false },
    },
  };
  return { ...result, critiqueDigest: canonicalSha256(result) };
}

export function visualCritiqueProviderContext(request) {
  const publicRequest = publicVisualCritiqueRequest(request);
  return JSON.stringify({
    sourceDigest: publicRequest.sourceDigest,
    captureSetDigest: publicRequest.captureSetDigest,
    gameBrief: publicRequest.gameBrief,
    visualIdentity: publicRequest.visualIdentity,
    artDirection: publicRequest.artDirection,
    captures: publicRequest.captures,
    requiredDimensions: LOOPLAB_VISUAL_CRITIQUE_DIMENSIONS,
    judgmentBoundary: "Observe exact pixels before evaluating. This is advisory art/design critique, not verification, release evidence, collision truth, or an automatic winner.",
  }, null, 2);
}
