const CODEX_EVENT_TYPES = new Set([
  "thread.started",
  "turn.started",
  "turn.completed",
  "turn.failed",
  "item.started",
  "item.updated",
  "item.completed",
  "error",
]);
const CODEX_ITEM_TYPES = new Set([
  "reasoning",
  "agent_message",
  "command_execution",
  "file_change",
  "mcp_tool_call",
  "web_search",
  "todo_list",
]);
const CLAUDE_EVENT_TYPES = new Set([
  "system",
  "assistant",
  "user",
  "result",
  "stream_event",
  "tool_progress",
  "tool_use_summary",
  "rate_limit_event",
  "auth_status",
]);
const CLAUDE_ITEM_TYPES = new Set([
  "init",
  "compact_boundary",
  "success",
  "error_max_turns",
  "error_max_budget_usd",
  "error_max_structured_output_retries",
  "message_start",
  "content_block_start",
  "content_block_delta",
  "content_block_stop",
  "message_delta",
  "message_stop",
  "text",
  "tool_use",
  "tool_result",
]);

function knownActivityLabel(value, allowed) {
  if (typeof value !== "string" || !value) return null;
  return allowed.has(value) ? value : "unknown";
}

export function codexActivityFromJsonLine(line) {
  if (typeof line !== "string" || !line.trim()) return null;
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  const eventType = knownActivityLabel(value?.type, CODEX_EVENT_TYPES);
  if (!eventType) return null;
  const itemType = knownActivityLabel(value?.item?.type, CODEX_ITEM_TYPES);
  return {
    provider: "codex",
    eventType,
    ...(itemType ? { itemType } : {}),
  };
}

export function claudeActivityFromJsonLine(line) {
  if (typeof line !== "string" || !line.trim()) return null;
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  const eventType = knownActivityLabel(value?.type, CLAUDE_EVENT_TYPES);
  if (!eventType) return null;
  const rawItemType = value?.type === "stream_event"
    ? value?.event?.type
    : value?.subtype ?? value?.message?.content?.find?.((content) => typeof content?.type === "string")?.type;
  const itemType = knownActivityLabel(rawItemType, CLAUDE_ITEM_TYPES);
  return {
    provider: "claude",
    eventType,
    ...(itemType ? { itemType } : {}),
  };
}

export function providerLivenessSnapshot(lastActivity, now = Date.now()) {
  const observedAt = Number(lastActivity?.observedAt);
  if (!Number.isFinite(observedAt)) {
    return {
      liveness: "process-only",
      lastProviderEventType: null,
      lastProviderItemType: null,
      providerActivityAgeSeconds: null,
    };
  }
  const eventTypes = lastActivity?.provider === "claude" ? CLAUDE_EVENT_TYPES : CODEX_EVENT_TYPES;
  const itemTypes = lastActivity?.provider === "claude" ? CLAUDE_ITEM_TYPES : CODEX_ITEM_TYPES;
  return {
    liveness: "provider-activity-observed",
    lastProviderEventType: knownActivityLabel(lastActivity.eventType, eventTypes),
    lastProviderItemType: knownActivityLabel(lastActivity.itemType, itemTypes),
    providerActivityAgeSeconds: Math.max(0, Math.round((Number(now) - observedAt) / 1_000)),
  };
}

export function providerProgressMessage({ provider, iteration, elapsedSeconds, liveness }) {
  const prefix = `${provider} iteration ${iteration}`;
  if (liveness?.liveness !== "provider-activity-observed") {
    return `${prefix} request is still pending; no provider activity event has been observed yet · ${elapsedSeconds}s elapsed`;
  }
  const item = liveness.lastProviderItemType ? ` / ${liveness.lastProviderItemType}` : "";
  return `${prefix} activity observed: ${liveness.lastProviderEventType ?? "unknown"}${item} · ${liveness.providerActivityAgeSeconds ?? 0}s ago · ${elapsedSeconds}s elapsed`;
}
