export const LOOPLAB_AGENT_READINESS_SCHEMA = "looplab-agent-readiness/v1";

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function issueIdentity(issue) {
  return [
    issue?.severity ?? "",
    issue?.code ?? "",
    issue?.category ?? "",
    issue?.mapId ?? "",
    issue?.objectId ?? "",
    issue?.assetId ?? "",
    issue?.featureId ?? "",
  ].join("|");
}

function compactFinding(issue) {
  const evidenceRequired = Array.isArray(issue?.nextAction?.evidenceRequired)
    ? issue.nextAction.evidenceRequired
    : Array.isArray(issue?.evidenceRequired)
      ? issue.evidenceRequired
      : [];
  return {
    severity: issue?.severity ?? null,
    code: issue?.code ?? null,
    category: issue?.category ?? null,
    mapId: issue?.mapId ?? null,
    objectId: issue?.objectId ?? null,
    assetId: issue?.assetId ?? null,
    featureId: issue?.featureId ?? null,
    message: issue?.message ?? null,
    action: issue?.nextAction?.repairAction ?? issue?.action ?? null,
    evidenceRequired: evidenceRequired.slice(0, 12),
  };
}

function doctorSummary(doctor, semantics) {
  return {
    profile: doctor?.profile ?? null,
    semantics,
    score: numberOrNull(doctor?.score),
    grade: doctor?.grade ?? null,
    technicalStatus: doctor?.technicalStatus ?? null,
    errorCount: numberOrNull(doctor?.errorCount),
    warningCount: numberOrNull(doctor?.warningCount),
    digest: doctor?.digest ?? null,
    sourceDigest: doctor?.sourceDigest ?? null,
    blocking: doctor?.gate?.blocking === true,
    canPromote: doctor?.canPromote === true,
    acceptanceStatus: doctor?.acceptanceResults?.status ?? null,
    completionStatus: doctor?.completionReport?.status ?? null,
    replayStatus: doctor?.replayResults?.status ?? null,
    visualStatus: doctor?.visualReadiness?.status ?? null,
  };
}

export function buildAgentReadiness(currentDoctor, releaseDoctor, { maxReleaseFindings = 8 } = {}) {
  if (!currentDoctor?.sourceDigest || !releaseDoctor?.sourceDigest) throw new Error("Agent readiness requires source-bound current and release Doctor reports.");
  if (currentDoctor.sourceDigest !== releaseDoctor.sourceDigest) throw new Error("Agent readiness cannot compare Doctor reports from different source digests.");
  if (!Number.isInteger(maxReleaseFindings) || maxReleaseFindings < 1 || maxReleaseFindings > 20) throw new Error("Agent readiness maxReleaseFindings must be an integer from 1 to 20.");

  const currentIssues = (currentDoctor.issues ?? []).filter((issue) => ["error", "warning"].includes(issue?.severity));
  const releaseIssues = (releaseDoctor.issues ?? []).filter((issue) => ["error", "warning"].includes(issue?.severity));
  const currentKeys = new Set(currentIssues.map(issueIdentity));
  const additionalReleaseIssues = releaseIssues.filter((issue) => !currentKeys.has(issueIdentity(issue)));
  const current = doctorSummary(currentDoctor, "active-authoring-gate");
  const release = doctorSummary(releaseDoctor, "one-file-release-target");

  return {
    schemaVersion: LOOPLAB_AGENT_READINESS_SCHEMA,
    sourceDigest: currentDoctor.sourceDigest,
    current,
    release,
    releaseDelta: {
      profile: release.profile,
      blockingOnlyAtRelease: current.blocking === false && release.blocking === true,
      scoreDelta: current.score === null || release.score === null ? null : release.score - current.score,
      additionalErrorCount: Math.max(0, (release.errorCount ?? 0) - (current.errorCount ?? 0)),
      additionalWarningCount: Math.max(0, (release.warningCount ?? 0) - (current.warningCount ?? 0)),
      findingCount: additionalReleaseIssues.length,
      findingsTruncated: additionalReleaseIssues.length > maxReleaseFindings,
      findings: additionalReleaseIssues.slice(0, maxReleaseFindings).map(compactFinding),
    },
    interpretation: "Current reports the active authoring profile and may protect a verified iteration. Release reports the production target on the same source. A current-profile pass is not release readiness; production blocking and source-bound evidence govern a release-ready one-file export. Prototype exports remain drafts.",
  };
}
