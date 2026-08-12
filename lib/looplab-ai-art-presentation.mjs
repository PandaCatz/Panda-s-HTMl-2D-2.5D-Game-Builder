export function aiArtPresentationState(asset) {
  const normalized = asset?.generator?.source === "openai-image-api"
    && asset?.invariants?.providerNormalized === true
    && asset?.invariants?.sharedScale === true
    && asset?.invariants?.authoredCollisionOnly === true;
  const measured = asset?.analysis?.measured === true
    && typeof asset?.analysis?.measurementVersion === "string"
    && asset.analysis.measurementVersion !== "";
  const failedInvariants = Array.isArray(asset?.analysis?.failedInvariants) ? asset.analysis.failedInvariants.filter(Boolean) : [];
  const verified = normalized && measured && failedInvariants.length === 0;
  if (normalized && measured && failedInvariants.length) {
    return { verified: false, status: "rejected", failedInvariants, labels: [`Measured QA: ${failedInvariants.length} issue${failedInvariants.length === 1 ? "" : "s"}`, ...failedInvariants, "Collision remains authored"] };
  }
  return verified
    ? { verified: true, status: "verified", failedInvariants, labels: ["Pixels measured", "Sheet normalized", "Shared scale", "Palette locked", "Collision authored"] }
    : { verified: false, status: "pending", failedInvariants, labels: ["Provider sheet pending", "Then: measure + normalize + palette lock", "Collision remains authored"] };
}
