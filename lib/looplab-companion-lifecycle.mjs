export function companionLifecycleDecision(health, expectedProtocolVersion) {
  if (!health) return { action: "start", reason: "No companion responded." };
  if (health.name !== "Looplab AI Companion") return { action: "block", reason: "The configured port belongs to an unknown service." };
  if (health.protocolVersion === expectedProtocolVersion) return { action: "reuse", reason: "The companion protocol is current." };
  const activeCount = Number(health.activeJobs || 0) + Number(health.activeResearchJobs || 0) + Number(health.activeAssetJobs || 0) + Number(health.activeReleaseVerificationJobs || 0) + Number(health.activeLocalCopilotJobs || 0) + Number(health.activePromptGenerations || 0) + Number(health.activeConnections || 0);
  if (activeCount > 0) {
    return {
      action: "block",
      reason: `Companion protocol ${health.protocolVersion ?? "unknown"} is stale but owns ${activeCount} active operation(s).`,
    };
  }
  return {
    action: "replace",
    reason: `Companion protocol ${health.protocolVersion ?? "unknown"} is stale and idle.`,
  };
}
