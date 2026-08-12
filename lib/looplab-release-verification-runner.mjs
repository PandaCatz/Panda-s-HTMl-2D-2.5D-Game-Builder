import { buildVerificationHtml, validateProject } from "./looplab-agent-core.mjs";
import { analyzeProject } from "./looplab-doctor.mjs";
import { collectExactArtifactVerificationEvidence } from "./looplab-exact-artifact-evidence.mjs";
import { runPlatformHarness } from "./looplab-platform-harness.mjs";
import { auditStandaloneHtml } from "./looplab-single-file-audit.mjs";
import {
  createReleaseVerificationAttestationAsync,
  getReleaseVerificationPolicy,
  recordReleaseVerification,
  summarizePlatformHarnessReceipt,
} from "./looplab-release-verification.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

export function prepareExactVerificationSubject(project, options = {}) {
  const subject = clone(project);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const iterationId = subject.iteration?.id ?? null;
  const buildId = subject.build?.id ?? iterationId;
  const sourceRevision = subject.build?.sourceRevision ?? iterationId;
  if (!buildId || !sourceRevision) return subject;
  subject.build = {
    ...(subject.build ?? {}),
    id: buildId,
    sourceRevision,
    generatedFromRevision: sourceRevision,
    sourceTimestamp: subject.build?.sourceTimestamp ?? subject.iteration?.createdAt ?? generatedAt,
    outputTimestamp: generatedAt,
    servedBuildId: buildId,
  };
  return subject;
}

function reportProgress(options, event) {
  if (typeof options.onProgress === "function") options.onProgress({ ...event, at: new Date().toISOString() });
}

export async function runExactReleaseVerification(project, options = {}) {
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(`Project is invalid: ${validation.errors.join(" ")}`);
  const policy = getReleaseVerificationPolicy();
  const frameCount = Number(options.frameCount ?? policy.environment.frameCount);
  const frameMs = Number(options.frameMs ?? policy.environment.frameMs);
  if (frameCount !== policy.environment.frameCount || frameMs !== policy.environment.frameMs) {
    throw new Error(`Exact release verification requires ${policy.environment.frameCount} frames at ${policy.environment.frameMs} ms.`);
  }

  const inputSourceDigest = analyzeProject(project).sourceDigest;
  const authoredProject = prepareExactVerificationSubject(project, { generatedAt: options.generatedAt });
  reportProgress(options, { type: "release.verification.build.started", message: "Building the exact one-file verification subject." });
  const doctorBefore = analyzeProject(authoredProject);
  if (doctorBefore.sourceDigest !== inputSourceDigest) {
    throw new Error("Preparing the exact verification subject changed authored source truth.");
  }
  const html = buildVerificationHtml(authoredProject);
  const audit = auditStandaloneHtml(html);
  reportProgress(options, { type: "release.verification.audit.completed", passed: audit.valid, byteLength: audit.byteLength, sourceDigest: doctorBefore.sourceDigest, message: audit.valid ? "Static one-file audit passed." : "Static one-file audit failed." });
  reportProgress(options, { type: "release.verification.browser.started", frameCount, frameMs, message: "Starting hostile-browser verification of the exact HTML bytes." });
  const platformReceipt = await runPlatformHarness({
    html,
    expectedSourceDigest: doctorBefore.sourceDigest,
    frameCount,
    frameMs,
    browserChannel: options.browserChannel,
    executablePath: options.executablePath,
    captureDirectory: options.captureDirectory,
    signal: options.signal,
  });
  const platformHarness = summarizePlatformHarnessReceipt(platformReceipt);
  reportProgress(options, { type: "release.verification.browser.completed", passed: platformReceipt.passed, artifactSha256: platformReceipt.artifactSha256, findingCount: platformReceipt.findings?.length ?? 0, message: platformReceipt.passed ? "Hostile-browser verification passed." : "Hostile-browser verification rejected the exact HTML subject." });
  if (!platformReceipt.passed) {
    return {
      ok: false,
      project: authoredProject,
      html: null,
      sourceDigest: doctorBefore.sourceDigest,
      audit,
      platformReceipt,
      platformHarness,
      findings: platformReceipt.findings ?? [],
    };
  }

  let verificationEvidence = null;
  if (options.collectVerificationEvidence === true) {
    reportProgress(options, { type: "release.verification.matrix.started", message: "Collecting the exact artifact map × profile and visible runtime-join evidence matrix." });
    verificationEvidence = await collectExactArtifactVerificationEvidence({
      html,
      project: authoredProject,
      sourceDigest: doctorBefore.sourceDigest,
      captureDirectory: options.evidenceCaptureDirectory ?? options.captureDirectory,
      browserChannel: options.browserChannel,
      executablePath: options.executablePath,
      signal: options.signal,
    });
    reportProgress(options, {
      type: "release.verification.matrix.completed",
      passed: verificationEvidence.passed,
      captureCount: verificationEvidence.captures.length,
      evidenceCount: verificationEvidence.evidenceRefs.length,
      message: verificationEvidence.passed ? "Exact artifact evidence matrix passed." : "Exact artifact evidence matrix rejected the artifact.",
    });
    if (!verificationEvidence.passed) {
      return {
        ok: false,
        project: authoredProject,
        html: null,
        sourceDigest: doctorBefore.sourceDigest,
        audit,
        platformReceipt,
        platformHarness,
        verificationEvidence,
        findings: verificationEvidence.validation.errors.map((message, index) => ({
          code: `exact-artifact-evidence-${index + 1}`,
          severity: "error",
          message,
          nextAction: { subsystem: "exact-artifact-evidence", evidenceRequired: [verificationEvidence.schemaVersion] },
        })),
      };
    }
  }

  const attestation = await createReleaseVerificationAttestationAsync({
    project: authoredProject,
    sourceDigest: doctorBefore.sourceDigest,
    html,
    audit,
    platformReceipt,
    filename: options.filename,
    verifiedAt: options.verifiedAt,
  });
  const verifiedProject = recordReleaseVerification(authoredProject, attestation, { sourceDigest: doctorBefore.sourceDigest });
  const doctorAfter = analyzeProject(verifiedProject);
  if (doctorAfter.errorCount !== 0 || doctorAfter.warningCount !== 0) {
    const codes = doctorAfter.issues.filter((issue) => issue.severity !== "info").map((issue) => issue.code).join(", ");
    throw new Error(`Release verification was recorded but production Doctor is not clean: ${codes}.`);
  }
  reportProgress(options, { type: "release.verification.attestation.completed", attestationDigest: attestation.attestationDigest, artifactSha256: attestation.subject.digest.sha256, message: "Recorded a current source- and exact-artifact-bound release attestation." });
  return {
    ok: true,
    project: verifiedProject,
    html,
    sourceDigest: doctorAfter.sourceDigest,
    audit,
    platformReceipt,
    platformHarness,
    verificationEvidence,
    findings: [],
    attestation,
    doctor: {
      profile: doctorAfter.profile,
      score: doctorAfter.score,
      errorCount: doctorAfter.errorCount,
      warningCount: doctorAfter.warningCount,
      digest: doctorAfter.digest,
      sourceDigest: doctorAfter.sourceDigest,
    },
  };
}
