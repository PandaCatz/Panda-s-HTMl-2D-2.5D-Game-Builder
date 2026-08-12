import { canonicalJson, canonicalSha256, sha256Hex, sha256HexAsync } from "./looplab-canonical-digest.mjs";
import {
  LOOPLAB_PLATFORM_HARNESS_CSP,
  LOOPLAB_PLATFORM_HARNESS_DEFAULTS,
  LOOPLAB_PLATFORM_HARNESS_SCHEMA,
  LOOPLAB_PLATFORM_HARNESS_VERSION,
} from "./looplab-platform-harness-contract.mjs";
import { LOOPLAB_EXPORTED_RUNTIME_VERSION } from "./looplab-versions.mjs";

export const LOOPLAB_RELEASE_VERIFICATION_SCHEMA = "looplab-release-verification/v1";
export const LOOPLAB_RELEASE_VERIFICATION_POLICY_ID = "https://looplab.local/policies/offline-one-file-release/v2";
export const LOOPLAB_RELEASE_VERIFIER_ID = "https://looplab.local/verifiers/platform-harness";

const REQUIRED_CHECKS = Object.freeze([
  { id: "browser-available", allowedStatuses: ["passed"] },
  { id: "runtime-ready", allowedStatuses: ["passed"] },
  { id: "sandbox-opaque-origin", allowedStatuses: ["passed"] },
  { id: "source-digest", allowedStatuses: ["passed"] },
  { id: "portable-save-roundtrip", allowedStatuses: ["passed", "not-applicable"] },
  { id: "input-action-liveness", allowedStatuses: ["passed"] },
  { id: "real-keyboard-input", allowedStatuses: ["passed"] },
  { id: "blur-clears-input", allowedStatuses: ["passed"] },
  { id: "semantic-input", allowedStatuses: ["passed"] },
  { id: "audio-failure-isolated", allowedStatuses: ["passed"] },
  { id: "presentation-runtime-isolated", allowedStatuses: ["passed", "not-applicable"] },
  { id: "game-shell-lifecycle", allowedStatuses: ["passed", "not-applicable"] },
  { id: "frame-soak", allowedStatuses: ["passed"] },
  { id: "replay-suite", allowedStatuses: ["passed"] },
  { id: "acceptance-suite", allowedStatuses: ["passed"] },
  { id: "completion-witness", allowedStatuses: ["passed", "not-applicable"] },
  { id: "terminal-state", allowedStatuses: ["passed"] },
  { id: "no-external-requests", allowedStatuses: ["passed"] },
  { id: "no-unhandled-errors", allowedStatuses: ["passed"] },
  { id: "visual-capture", allowedStatuses: ["passed"] },
]);

const POLICY_BASE = Object.freeze({
  id: LOOPLAB_RELEASE_VERIFICATION_POLICY_ID,
  version: 2,
  subject: "one-self-contained-html",
  verifierId: LOOPLAB_RELEASE_VERIFIER_ID,
  harnessSchemaVersion: LOOPLAB_PLATFORM_HARNESS_SCHEMA,
  harnessRunner: "playwright-core",
  harnessRunnerVersion: LOOPLAB_PLATFORM_HARNESS_VERSION,
  runtimeVersion: LOOPLAB_EXPORTED_RUNTIME_VERSION,
  environment: {
    sandbox: ["allow-scripts"],
    opaqueOriginRequired: true,
    csp: LOOPLAB_PLATFORM_HARNESS_CSP,
    frameCount: LOOPLAB_PLATFORM_HARNESS_DEFAULTS.frameCount,
    frameMs: LOOPLAB_PLATFORM_HARNESS_DEFAULTS.frameMs,
    malformedInputInterval: LOOPLAB_PLATFORM_HARNESS_DEFAULTS.malformedInputInterval,
    hostileAudioResume: true,
  },
  requiredChecks: REQUIRED_CHECKS,
  unexpectedCheckPolicy: "reject",
  visualCaptureRequired: true,
});

export const LOOPLAB_RELEASE_VERIFICATION_POLICY_DIGEST = canonicalSha256(POLICY_BASE);

const POLICY = Object.freeze({
  ...POLICY_BASE,
  digest: LOOPLAB_RELEASE_VERIFICATION_POLICY_DIGEST,
});

const objectValue = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const sha256Digest = (value) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const sha256HexDigest = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const clone = (value) => JSON.parse(JSON.stringify(value));
const utf8Bytes = (value) => new TextEncoder().encode(String(value)).byteLength;

function attestationProjection(attestation) {
  const projected = clone(attestation);
  delete projected.attestationDigest;
  return projected;
}

function validatePolicy(policy, errors) {
  if (canonicalJson(policy) !== canonicalJson(POLICY)) errors.push("The release-verification policy does not match the current LoopLab policy.");
}

function validateChecks(checks, errors) {
  if (!Array.isArray(checks)) {
    errors.push("Release verification checks must be an array.");
    return;
  }
  const requiredById = new Map(REQUIRED_CHECKS.map((check) => [check.id, check]));
  const seen = new Set();
  for (const check of checks) {
    if (!objectValue(check) || typeof check.id !== "string" || typeof check.status !== "string") {
      errors.push("Every release-verification check must contain an id and status.");
      continue;
    }
    if (seen.has(check.id)) errors.push(`Release-verification check ${check.id} is duplicated.`);
    seen.add(check.id);
    const requirement = requiredById.get(check.id);
    if (!requirement) {
      errors.push(`Unexpected release-verification check ${check.id}.`);
      continue;
    }
    if (!requirement.allowedStatuses.includes(check.status)) errors.push(`Release-verification check ${check.id} has disallowed status ${check.status}.`);
  }
  for (const requirement of REQUIRED_CHECKS) if (!seen.has(requirement.id)) errors.push(`Required release-verification check ${requirement.id} is missing.`);
  if (checks.length !== REQUIRED_CHECKS.length) errors.push(`Release verification must contain exactly ${REQUIRED_CHECKS.length} policy checks.`);
}

function compactChecks(receipt) {
  return receipt.checks.map((check) => ({ id: check.id, status: check.status }));
}

export function getReleaseVerificationPolicy() {
  return clone(POLICY);
}

export function summarizePlatformHarnessReceipt(receipt) {
  return {
    schemaVersion: receipt?.schemaVersion ?? null,
    runner: receipt?.runner ?? null,
    runnerVersion: receipt?.runnerVersion ?? null,
    status: receipt?.status ?? null,
    passed: receipt?.passed === true,
    sourceDigest: receipt?.sourceDigest ?? null,
    expectedSourceDigest: receipt?.expectedSourceDigest ?? null,
    artifactSha256: receipt?.artifactSha256 ?? null,
    runtimeVersion: receipt?.runtimeVersion ?? null,
    startedAt: receipt?.startedAt ?? null,
    completedAt: receipt?.completedAt ?? null,
    browser: receipt?.environment?.browser ?? null,
    viewport: receipt?.environment?.viewport ?? null,
    frameCount: receipt?.environment?.frameCount ?? null,
    checks: Array.isArray(receipt?.checks) ? compactChecks(receipt) : [],
    findingCount: Array.isArray(receipt?.findings) ? receipt.findings.length : null,
    captures: {
      initial: receipt?.visualEvidence?.initial?.screenshot ? {
        sha256: receipt.visualEvidence.initial.screenshot.sha256 ?? null,
        byteLength: receipt.visualEvidence.initial.screenshot.byteLength ?? null,
      } : null,
      final: receipt?.visualEvidence?.final?.screenshot ? {
        sha256: receipt.visualEvidence.final.screenshot.sha256 ?? null,
        byteLength: receipt.visualEvidence.final.screenshot.byteLength ?? null,
      } : null,
    },
  };
}

function createReleaseVerificationAttestationWithDigest({ project, sourceDigest, html, audit, platformReceipt, filename, verifiedAt, artifactDigest } = {}) {
  const errors = [];
  const projectValue = objectValue(project) ?? {};
  const receipt = objectValue(platformReceipt);
  const auditValue = objectValue(audit);
  const artifactHtml = typeof html === "string" ? html : "";
  const artifactByteLength = utf8Bytes(artifactHtml);
  if (!sha256HexDigest(artifactDigest)) errors.push("The exact standalone HTML digest is invalid.");
  if (!/^source-[a-f0-9]{64}$/.test(String(sourceDigest ?? ""))) errors.push("A canonical Project Doctor source digest is required.");
  if (projectValue.doctorProfile !== "production") errors.push("Release verification requires the project's production Doctor profile.");
  if (projectValue.iteration?.status !== "candidate") errors.push("Release verification requires an editable candidate iteration.");
  if (!artifactHtml.trim()) errors.push("The exact standalone HTML subject is required.");
  if (!auditValue?.valid) errors.push("The standalone HTML audit did not pass.");
  if (Number(auditValue?.byteLength) !== artifactByteLength) errors.push("The standalone HTML audit byte count does not match the exact subject.");
  if (!receipt) errors.push("A structured platform-harness receipt is required.");
  if (receipt?.schemaVersion !== LOOPLAB_PLATFORM_HARNESS_SCHEMA) errors.push("The platform-harness receipt schema is not supported.");
  if (receipt?.runner !== "playwright-core" || receipt?.runnerVersion !== LOOPLAB_PLATFORM_HARNESS_VERSION) errors.push("The platform-harness verifier identity or version does not match policy.");
  if (receipt?.runtimeVersion !== LOOPLAB_EXPORTED_RUNTIME_VERSION) errors.push("The platform-harness receipt was produced by a different exported runtime version.");
  if (receipt?.status !== "passed" || receipt?.passed !== true || (receipt?.findings?.length ?? 0) !== 0) errors.push("The platform-harness receipt is not an unqualified pass.");
  if (receipt?.sourceDigest !== sourceDigest || receipt?.expectedSourceDigest !== sourceDigest) errors.push("The platform-harness receipt is not bound to the exact current Project Doctor source digest.");
  if (receipt?.artifactSha256 !== artifactDigest) errors.push("The platform-harness receipt is not bound to the exact HTML subject bytes.");
  if (canonicalJson(receipt?.environment?.sandbox) !== canonicalJson(POLICY.environment.sandbox)
    || receipt?.environment?.opaqueOriginRequired !== true
    || receipt?.environment?.csp !== POLICY.environment.csp
    || receipt?.environment?.hostileAudioResume !== true
    || Number(receipt?.environment?.frameCount) !== POLICY.environment.frameCount
    || Number(receipt?.environment?.frameMs) !== POLICY.environment.frameMs
    || Number(receipt?.environment?.malformedInputInterval) !== POLICY.environment.malformedInputInterval) {
    errors.push("The platform-harness hostile environment does not match the release policy.");
  }
  if (typeof receipt?.environment?.browser?.version !== "string" || !receipt.environment.browser.version.trim()) errors.push("The platform-harness receipt does not identify the browser version.");
  if (!Number.isFinite(Date.parse(receipt?.startedAt)) || !Number.isFinite(Date.parse(receipt?.completedAt))) errors.push("The platform-harness receipt timestamps are invalid.");
  validateChecks(receipt?.checks, errors);
  for (const phase of ["initial", "final"]) {
    const screenshot = receipt?.visualEvidence?.[phase]?.screenshot;
    if (!sha256HexDigest(screenshot?.sha256) || !Number.isInteger(screenshot?.byteLength) || screenshot.byteLength <= 0) errors.push(`The ${phase} visual capture receipt is missing its PNG digest or byte count.`);
  }
  if (errors.length) throw new Error(`Release verification rejected: ${errors.join(" ")}`);

  const timestamp = typeof verifiedAt === "string" && Number.isFinite(Date.parse(verifiedAt)) ? verifiedAt : new Date().toISOString();
  const attestation = {
    schemaVersion: LOOPLAB_RELEASE_VERIFICATION_SCHEMA,
    subject: {
      name: typeof filename === "string" && filename.trim() ? filename.trim() : "game.html",
      mediaType: "text/html; charset=utf-8",
      digest: { sha256: artifactDigest },
      byteLength: artifactByteLength,
    },
    source: {
      sourceDigest,
      projectName: String(projectValue.name ?? "Untitled game"),
      projectSchemaVersion: projectValue.schemaVersion ?? null,
      buildId: projectValue.build?.id ?? null,
      sourceRevision: projectValue.build?.sourceRevision ?? null,
      runtimeVersion: LOOPLAB_EXPORTED_RUNTIME_VERSION,
    },
    verifier: {
      id: LOOPLAB_RELEASE_VERIFIER_ID,
      schemaVersion: LOOPLAB_PLATFORM_HARNESS_SCHEMA,
      runner: "playwright-core",
      runnerVersion: LOOPLAB_PLATFORM_HARNESS_VERSION,
    },
    policy: getReleaseVerificationPolicy(),
    inputs: {
      standaloneAudit: { digest: canonicalSha256(auditValue) },
      platformHarness: { digest: canonicalSha256(receipt) },
    },
    verificationResult: "PASSED",
    checks: compactChecks(receipt),
    verifiedAt: timestamp,
  };
  return { ...attestation, attestationDigest: canonicalSha256(attestation) };
}

export function createReleaseVerificationAttestation(options = {}) {
  const artifactHtml = typeof options.html === "string" ? options.html : "";
  return createReleaseVerificationAttestationWithDigest({ ...options, artifactDigest: sha256Hex(artifactHtml) });
}

export async function createReleaseVerificationAttestationAsync(options = {}) {
  const artifactHtml = typeof options.html === "string" ? options.html : "";
  return createReleaseVerificationAttestationWithDigest({ ...options, artifactDigest: await sha256HexAsync(artifactHtml) });
}

export function validateReleaseVerification(attestation, { sourceDigest, runtimeVersion = LOOPLAB_EXPORTED_RUNTIME_VERSION } = {}) {
  const errors = [];
  const value = objectValue(attestation);
  if (!value) return { valid: false, current: false, errors: ["No structured release-verification attestation is recorded."], attestation: null };
  if (value.schemaVersion !== LOOPLAB_RELEASE_VERIFICATION_SCHEMA) errors.push("The release-verification schema is not supported.");
  if (!objectValue(value.subject) || value.subject.mediaType !== "text/html; charset=utf-8" || !sha256HexDigest(value.subject?.digest?.sha256) || !Number.isInteger(value.subject?.byteLength) || value.subject.byteLength <= 0) errors.push("The release-verification subject is invalid.");
  if (!objectValue(value.source) || !/^source-[a-f0-9]{64}$/.test(String(value.source?.sourceDigest ?? ""))) errors.push("The release-verification source binding is invalid.");
  if (sourceDigest && value.source?.sourceDigest !== sourceDigest) errors.push("The release-verification source digest is stale.");
  if (value.source?.runtimeVersion !== runtimeVersion) errors.push("The release-verification runtime version is stale.");
  if (value.verifier?.id !== LOOPLAB_RELEASE_VERIFIER_ID || value.verifier?.schemaVersion !== LOOPLAB_PLATFORM_HARNESS_SCHEMA || value.verifier?.runner !== "playwright-core" || value.verifier?.runnerVersion !== LOOPLAB_PLATFORM_HARNESS_VERSION) errors.push("The release-verification verifier identity or version is invalid.");
  validatePolicy(value.policy, errors);
  if (!sha256Digest(value.inputs?.standaloneAudit?.digest) || !sha256Digest(value.inputs?.platformHarness?.digest)) errors.push("The release-verification input digests are invalid.");
  if (value.verificationResult !== "PASSED") errors.push("The release-verification result is not PASSED.");
  validateChecks(value.checks, errors);
  if (typeof value.verifiedAt !== "string" || !Number.isFinite(Date.parse(value.verifiedAt))) errors.push("The release-verification timestamp is invalid.");
  if (!sha256Digest(value.attestationDigest) || canonicalSha256(attestationProjection(value)) !== value.attestationDigest) errors.push("The release-verification attestation digest is invalid.");
  return {
    valid: errors.length === 0,
    current: errors.length === 0,
    errors,
    attestation: value,
    subjectSha256: value.subject?.digest?.sha256 ?? null,
    sourceDigest: value.source?.sourceDigest ?? null,
    attestationDigest: value.attestationDigest ?? null,
  };
}

export function recordReleaseVerification(project, attestation, options = {}) {
  const validation = validateReleaseVerification(attestation, options);
  if (!validation.valid) throw new Error(`Release verification rejected: ${validation.errors.join(" ")}`);
  return { ...clone(project), releaseVerification: clone(attestation) };
}

export function releaseVerificationMatchesHtml(attestation, html) {
  const validation = validateReleaseVerification(attestation);
  const artifactSha256 = sha256Hex(String(html ?? ""));
  return {
    valid: validation.valid && validation.subjectSha256 === artifactSha256,
    artifactSha256,
    expectedArtifactSha256: validation.subjectSha256,
    attestationValid: validation.valid,
    errors: validation.errors,
  };
}
