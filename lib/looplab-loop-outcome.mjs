export function summarizeLoopOutcome(project, attempts = []) {
  const accepted = attempts.filter((attempt) => attempt?.accepted).length;
  const rejected = attempts.length - accepted;
  const lifecycleStatus = project?.iteration?.status ?? "candidate";
  const verified = lifecycleStatus === "verified" || lifecycleStatus === "promoted";
  if (accepted === 0) {
    return {
      outcome: "no-accepted-candidate",
      changed: false,
      accepted,
      rejected,
      lifecycleStatus,
      verificationRequired: false,
      nextRequiredAction: "none",
      message: "No AI candidate passed the acceptance gates; the project remains unchanged.",
    };
  }
  return {
    outcome: verified ? "verified-candidate" : "candidate-awaiting-browser-evidence",
    changed: true,
    accepted,
    rejected,
    lifecycleStatus,
    verificationRequired: !verified,
    nextRequiredAction: verified ? "promote-or-export" : "run-browser-qa",
    message: verified ? "A verified candidate is ready." : "An accepted candidate is ready for browser evidence and verification.",
  };
}
