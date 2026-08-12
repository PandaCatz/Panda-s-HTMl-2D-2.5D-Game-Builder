import assert from "node:assert/strict";
import test from "node:test";

import {
  LOOPLAB_LOOP_HISTORY_POLICY,
  appendLoopAttempt,
  appendLoopRun,
  nextLoopAttemptNumber,
  normalizeLoopHistory,
} from "../lib/looplab-loop-history.mjs";

test("loop history caps full attempts and run summaries without reusing version numbers", () => {
  const attempts = Array.from({ length: 245 }, (_, index) => ({
    iteration: index + 1,
    commands: [{ op: "set_project", changes: { name: `Candidate ${index + 1}` } }],
  }));
  const runs = Array.from({ length: 105 }, (_, index) => ({ id: `run-${index + 1}`, usage: { totalTokens: index } }));
  const history = normalizeLoopHistory({ protocolVersion: 1, attempts, runs }, { projectPath: "game.loop.json" });

  assert.equal(history.retention.schemaVersion, "looplab-loop-history-retention/v1");
  assert.equal(history.attempts.length, LOOPLAB_LOOP_HISTORY_POLICY.attemptLimit);
  assert.equal(history.attempts[0].iteration, 46);
  assert.equal(history.runs.length, LOOPLAB_LOOP_HISTORY_POLICY.runLimit);
  assert.equal(history.runs[0].id, "run-6");
  assert.equal(history.attemptSequence, 245);
  assert.equal(nextLoopAttemptNumber(history), 246);

  const withAttempt = appendLoopAttempt(history, { iteration: 246, commands: [{ op: "set_project", changes: { name: "Candidate 246" } }] });
  assert.equal(withAttempt.attempts.length, LOOPLAB_LOOP_HISTORY_POLICY.attemptLimit);
  assert.equal(withAttempt.attempts[0].iteration, 47);
  assert.equal(withAttempt.attempts.at(-1).iteration, 246);
  assert.equal(withAttempt.attemptSequence, 246);
  assert.throws(() => appendLoopAttempt(withAttempt, { iteration: 246 }), /next monotonic sequence number \(247\)/);

  const withRun = appendLoopRun(withAttempt, { id: "run-106", usage: { totalTokens: 1 } });
  assert.equal(withRun.runs.length, LOOPLAB_LOOP_HISTORY_POLICY.runLimit);
  assert.equal(withRun.runs[0].id, "run-7");
  assert.equal(withRun.runs.at(-1).id, "run-106");
  assert.equal(withRun.attemptSequence, 246);
});

test("legacy unbounded history derives its sequence before pruning", () => {
  const history = normalizeLoopHistory({ attempts: [{ iteration: 900 }, { iteration: 12 }], runs: [] });
  assert.equal(history.attemptSequence, 900);
  assert.equal(nextLoopAttemptNumber(history), 901);
});