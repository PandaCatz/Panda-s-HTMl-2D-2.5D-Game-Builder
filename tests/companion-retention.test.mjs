import assert from "node:assert/strict";
import test from "node:test";

import {
  appendRetainedEvent,
  companionRetentionOptions,
  markResultDelivered,
  markTerminalRecord,
  reapCompanionRecords,
} from "../lib/looplab-companion-retention.mjs";

test("companion event history is a sequence-preserving ring buffer with a dropped-event receipt", () => {
  const record = { events: [] };
  const now = () => new Date("2026-08-09T12:00:00.000Z");
  for (let index = 0; index < 20; index += 1) appendRetainedEvent(record, { type: `event.${index}` }, { maximum: 16, now });
  assert.equal(record.events.length, 16);
  assert.equal(record.events[0].sequence, 5);
  assert.equal(record.events.at(-1).sequence, 20);
  assert.equal(record.events.at(-1).droppedEventsBefore, 4);
  assert.equal(record.droppedEventCount, 4);
});

test("delivered large results are released before terminal records are evicted", () => {
  const base = Date.parse("2026-08-09T12:00:00.000Z");
  const record = { id: "asset-1", status: "completed", createdAt: new Date(base).toISOString(), events: [], result: { image: "large-base64" } };
  markTerminalRecord(record, new Date(base));
  markResultDelivered(record, new Date(base + 1_000));
  const records = new Map([[record.id, record]]);

  assert.deepEqual(reapCompanionRecords([records], { nowMs: base + 61_000, deliveredResultTtlMs: 60_000, terminalTtlMs: 120_000 }), { evicted: 0, releasedResults: 1 });
  assert.equal(record.result, null);
  assert.ok(record.resultReleasedAt);
  assert.deepEqual(reapCompanionRecords([records], { nowMs: base + 121_000, deliveredResultTtlMs: 60_000, terminalTtlMs: 120_000 }), { evicted: 1, releasedResults: 0 });
  assert.equal(records.size, 0);
});

test("retention settings are bounded even when environment values are unsafe", () => {
  assert.deepEqual(companionRetentionOptions({
    LOOPLAB_COMPANION_EVENT_HISTORY: "1",
    LOOPLAB_COMPANION_TERMINAL_TTL_MS: "1",
    LOOPLAB_COMPANION_RESULT_TTL_MS: "9999999999",
  }), { eventHistory: 16, terminalTtlMs: 60_000, deliveredResultTtlMs: 3_600_000 });
});
