export const LOOPLAB_LOOP_HISTORY_POLICY = Object.freeze({
  schemaVersion: "looplab-loop-history-retention/v1",
  attemptLimit: 200,
  runLimit: 100,
  numbering: "monotonic-attempt-sequence",
});

function finiteSequence(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function attemptNumber(attempt) {
  return finiteSequence(attempt?.iteration);
}

export function normalizeLoopHistory(history = {}, options = {}) {
  const source = history && typeof history === "object" && !Array.isArray(history) ? history : {};
  const attempts = Array.isArray(source.attempts) ? source.attempts : [];
  const runs = Array.isArray(source.runs) ? source.runs : [];
  const attemptSequence = Math.max(finiteSequence(source.attemptSequence), ...attempts.map(attemptNumber));
  return {
    ...source,
    protocolVersion: finiteSequence(source.protocolVersion) || 1,
    ...(options.projectPath ? { projectPath: options.projectPath } : {}),
    retention: { ...LOOPLAB_LOOP_HISTORY_POLICY },
    attemptSequence,
    attempts: attempts.slice(-LOOPLAB_LOOP_HISTORY_POLICY.attemptLimit),
    runs: runs.slice(-LOOPLAB_LOOP_HISTORY_POLICY.runLimit),
  };
}

export function nextLoopAttemptNumber(history) {
  return normalizeLoopHistory(history).attemptSequence + 1;
}

export function appendLoopAttempt(history, attempt) {
  const normalized = normalizeLoopHistory(history);
  const expected = normalized.attemptSequence + 1;
  if (!attempt || typeof attempt !== "object" || Array.isArray(attempt)) throw new Error("Loop attempt must be an object.");
  if (attemptNumber(attempt) !== expected) throw new Error(`Loop attempt iteration must be the next monotonic sequence number (${expected}).`);
  return {
    ...normalized,
    attemptSequence: expected,
    attempts: [...normalized.attempts, attempt].slice(-LOOPLAB_LOOP_HISTORY_POLICY.attemptLimit),
  };
}

export function appendLoopRun(history, run) {
  const normalized = normalizeLoopHistory(history);
  if (!run || typeof run !== "object" || Array.isArray(run)) throw new Error("Loop run summary must be an object.");
  return {
    ...normalized,
    runs: [...normalized.runs, run].slice(-LOOPLAB_LOOP_HISTORY_POLICY.runLimit),
  };
}