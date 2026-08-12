const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

export function appendRetainedEvent(record, event, { maximum = 256, now = () => new Date() } = {}) {
  const timestamp = now().toISOString();
  const sequence = Number(record.nextEventSequence ?? record.events?.at(-1)?.sequence ?? 0) + 1;
  record.nextEventSequence = sequence;
  record.updatedAt = timestamp;
  const normalized = { sequence, timestamp, ...event };
  record.events ??= [];
  record.events.push(normalized);
  const boundedMaximum = Math.max(16, Math.floor(Number(maximum) || 256));
  if (record.events.length > boundedMaximum) {
    const overflow = record.events.length - boundedMaximum;
    record.events.splice(0, overflow);
    record.droppedEventCount = Number(record.droppedEventCount ?? 0) + overflow;
  }
  if (record.droppedEventCount) normalized.droppedEventsBefore = record.droppedEventCount;
  return normalized;
}

export function markTerminalRecord(record, now = new Date()) {
  if (!record || !TERMINAL_STATUSES.has(record.status)) return record;
  record.terminalAt ??= now.toISOString();
  return record;
}

export function markResultDelivered(record, now = new Date()) {
  if (record?.result) record.resultDeliveredAt ??= now.toISOString();
  return record;
}

export function reapCompanionRecords(collections, {
  nowMs = Date.now(),
  terminalTtlMs = 30 * 60 * 1_000,
  deliveredResultTtlMs = 5 * 60 * 1_000,
} = {}) {
  let evicted = 0;
  let releasedResults = 0;
  for (const collection of collections) {
    for (const [id, record] of collection) {
      const deliveredAt = Date.parse(record.resultDeliveredAt ?? "");
      if (record.result && Number.isFinite(deliveredAt) && nowMs - deliveredAt >= deliveredResultTtlMs) {
        record.result = null;
        record.resultReleasedAt = new Date(nowMs).toISOString();
        releasedResults += 1;
      }
      if (!TERMINAL_STATUSES.has(record.status)) continue;
      const terminalAt = Date.parse(record.terminalAt ?? record.updatedAt ?? record.createdAt ?? "");
      if (Number.isFinite(terminalAt) && nowMs - terminalAt >= terminalTtlMs) {
        collection.delete(id);
        evicted += 1;
      }
    }
  }
  return { evicted, releasedResults };
}

export function companionRetentionOptions(env = process.env) {
  const eventHistory = Math.min(2_048, Math.max(16, Number(env.LOOPLAB_COMPANION_EVENT_HISTORY ?? 256) || 256));
  const terminalTtlMs = Math.min(24 * 60 * 60 * 1_000, Math.max(60_000, Number(env.LOOPLAB_COMPANION_TERMINAL_TTL_MS ?? 30 * 60 * 1_000) || 30 * 60 * 1_000));
  const deliveredResultTtlMs = Math.min(60 * 60 * 1_000, Math.max(30_000, Number(env.LOOPLAB_COMPANION_RESULT_TTL_MS ?? 5 * 60 * 1_000) || 5 * 60 * 1_000));
  return { eventHistory, terminalTtlMs, deliveredResultTtlMs };
}
