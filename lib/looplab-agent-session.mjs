import { canonicalSha256 } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_AGENT_SESSION_SCHEMA = "looplab-agent-session/v1";
export const LOOPLAB_AGENT_SESSION_RESULT_SCHEMA = "looplab-agent-session-result/v1";
export const LOOPLAB_AGENT_SESSION_SAVE_POLICIES = Object.freeze(["explicit", "on-mutation", "never"]);
export const LOOPLAB_AGENT_SESSION_LIMITS = Object.freeze({
  maximumLineCharacters: 2_000_000,
  maximumRequestIdCharacters: 120,
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeSavePolicy(value) {
  const policy = String(value ?? "").trim();
  if (!LOOPLAB_AGENT_SESSION_SAVE_POLICIES.includes(policy)) {
    throw new Error(`savePolicy must be one of: ${LOOPLAB_AGENT_SESSION_SAVE_POLICIES.join(", ")}.`);
  }
  return policy;
}

function errorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  const bracketed = /^\[([a-z0-9-]+)\]/i.exec(message);
  if (bracketed) return bracketed[1].toLowerCase();
  if (/unknown command op/i.test(message)) return "unknown-command";
  if (/browser-session command/i.test(message)) return "wrong-command-surface";
  if (/invalid|requires|must be|unknown fields/i.test(message)) return "invalid-command";
  return "session-command-failed";
}

function repairAction(code) {
  if (code === "stale-source") return "Read the current session sourceDigest, rebase the edit, and submit it once with that exact expectedSourceDigest.";
  if (code === "source-precondition-required") return "Read session status, copy its sourceDigest into expectedSourceDigest, and resubmit the mutation once.";
  if (code === "session-persist-failed") return "Do not retry the mutation. The in-memory change was applied; inspect status and issue one explicit save after the storage problem is fixed.";
  if (code === "session-closed") return "Start a new JSONL session for additional commands.";
  if (code === "invalid-jsonl-line") return "Send one valid JSON object on each input line.";
  if (code === "wrong-command-surface") return "Use the browser MCP or window.looplabAgent for browser-session-only commands.";
  return "Correct the command using the manifest contract, then submit a new line.";
}

function failure(sequence, requestId, code, message, detail = {}) {
  return {
    schemaVersion: LOOPLAB_AGENT_SESSION_RESULT_SCHEMA,
    sequence,
    requestId,
    ok: false,
    code,
    message,
    repairAction: repairAction(code),
    retrySafe: detail.retrySafe ?? true,
    ...detail,
  };
}

function parseLine(rawLine) {
  const line = String(rawLine ?? "");
  if (line.length > LOOPLAB_AGENT_SESSION_LIMITS.maximumLineCharacters) {
    throw new Error(`JSONL line exceeds ${LOOPLAB_AGENT_SESSION_LIMITS.maximumLineCharacters} characters.`);
  }
  if (!line.trim()) throw new Error("JSONL line is empty.");
  const parsed = JSON.parse(line);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSONL line must contain one object.");
  return parsed;
}

function requestEnvelope(parsed) {
  if (!Object.prototype.hasOwnProperty.call(parsed, "command")) return { requestId: null, command: parsed };
  const unknown = Object.keys(parsed).filter((key) => !["requestId", "command"].includes(key));
  if (unknown.length) throw new Error(`Session envelope contains unknown fields: ${unknown.join(", ")}.`);
  const requestId = parsed.requestId === undefined ? null : String(parsed.requestId);
  if (requestId !== null && (!requestId || requestId.length > LOOPLAB_AGENT_SESSION_LIMITS.maximumRequestIdCharacters)) {
    throw new Error(`requestId must contain 1 through ${LOOPLAB_AGENT_SESSION_LIMITS.maximumRequestIdCharacters} characters.`);
  }
  if (!parsed.command || typeof parsed.command !== "object" || Array.isArray(parsed.command)) throw new Error("command must be one object.");
  return { requestId, command: parsed.command };
}

export function createAgentJsonlSession({
  initialProject,
  savePolicy,
  applyCommand,
  getCommandContract,
  sourceDigest,
  persistProject,
}) {
  if (!initialProject || typeof initialProject !== "object" || Array.isArray(initialProject)) throw new Error("initialProject must be one object.");
  if (typeof applyCommand !== "function") throw new Error("applyCommand must be a function.");
  if (typeof getCommandContract !== "function") throw new Error("getCommandContract must be a function.");
  if (typeof sourceDigest !== "function") throw new Error("sourceDigest must be a function.");
  if (typeof persistProject !== "function") throw new Error("persistProject must be a function.");
  const policy = normalizeSavePolicy(savePolicy);
  let project = clone(initialProject);
  let sequence = 0;
  let dirty = false;
  let closed = false;
  let persistedDocumentDigest = canonicalSha256(project);

  const status = () => ({
    schemaVersion: LOOPLAB_AGENT_SESSION_SCHEMA,
    savePolicy: policy,
    sourceDigest: sourceDigest(project),
    documentDigest: canonicalSha256(project),
    persistedDocumentDigest,
    dirty,
    closed,
  });

  async function save() {
    if (policy === "never") throw new Error("[save-disabled] This session uses savePolicy=never.");
    await persistProject(clone(project));
    persistedDocumentDigest = canonicalSha256(project);
    dirty = false;
  }

  async function handleControl(command, requestId, currentSequence) {
    const unknown = Object.keys(command).filter((key) => !["sessionOp"].includes(key));
    if (unknown.length) return failure(currentSequence, requestId, "invalid-jsonl-line", `Session control contains unknown fields: ${unknown.join(", ")}.`);
    const operation = String(command.sessionOp ?? "").trim();
    if (operation === "status") {
      return {
        schemaVersion: LOOPLAB_AGENT_SESSION_RESULT_SCHEMA,
        sequence: currentSequence,
        requestId,
        ok: true,
        sessionOp: operation,
        session: status(),
      };
    }
    if (operation === "save") {
      try {
        await save();
        return {
          schemaVersion: LOOPLAB_AGENT_SESSION_RESULT_SCHEMA,
          sequence: currentSequence,
          requestId,
          ok: true,
          sessionOp: operation,
          persisted: true,
          session: status(),
        };
      } catch (error) {
        const code = errorCode(error);
        return failure(currentSequence, requestId, code, error instanceof Error ? error.message : String(error), {
          sourceDigest: sourceDigest(project),
          dirty,
          persisted: false,
        });
      }
    }
    if (operation === "close") {
      closed = true;
      return {
        schemaVersion: LOOPLAB_AGENT_SESSION_RESULT_SCHEMA,
        sequence: currentSequence,
        requestId,
        ok: true,
        sessionOp: operation,
        persisted: false,
        session: status(),
      };
    }
    return failure(currentSequence, requestId, "invalid-jsonl-line", `Unknown sessionOp: ${operation || "(empty)"}.`);
  }

  async function handleLine(rawLine) {
    sequence += 1;
    const currentSequence = sequence;
    if (closed) return failure(currentSequence, null, "session-closed", "The JSONL session is already closed.", { closed: true, retrySafe: false });

    let parsed;
    try {
      parsed = parseLine(rawLine);
    } catch (error) {
      return failure(currentSequence, null, "invalid-jsonl-line", error instanceof Error ? error.message : String(error));
    }

    let envelope;
    try {
      envelope = requestEnvelope(parsed);
    } catch (error) {
      return failure(currentSequence, null, "invalid-jsonl-line", error instanceof Error ? error.message : String(error));
    }
    const { requestId, command } = envelope;
    if (Object.prototype.hasOwnProperty.call(command, "sessionOp")) return handleControl(command, requestId, currentSequence);

    const operation = String(command.op ?? "").trim();
    const contract = operation ? getCommandContract(operation) : null;
    if (!contract) return failure(currentSequence, requestId, "unknown-command", `Unknown core command op: ${operation || "(empty)"}.`);
    if (!contract.surfaces?.includes("core")) {
      return failure(currentSequence, requestId, "wrong-command-surface", `${operation} is not available on the persistent core session.`);
    }
    if (contract.mutatesProject && !String(command.expectedSourceDigest ?? "").trim()) {
      return failure(currentSequence, requestId, "source-precondition-required", `${operation} requires expectedSourceDigest in a persistent session.`, {
        sourceDigest: sourceDigest(project),
      });
    }

    const effectiveCommand = Object.prototype.hasOwnProperty.call(command, "compact") ? command : { ...command, compact: true };
    let outcome;
    try {
      outcome = applyCommand(project, effectiveCommand);
    } catch (error) {
      const code = errorCode(error);
      return failure(currentSequence, requestId, code, error instanceof Error ? error.message : String(error), {
        op: operation,
        sourceDigest: sourceDigest(project),
      });
    }

    if (outcome.changed) {
      project = outcome.project;
      dirty = true;
    }
    let persisted = false;
    if (outcome.changed && policy === "on-mutation") {
      try {
        await save();
        persisted = true;
      } catch (error) {
        return failure(currentSequence, requestId, "session-persist-failed", error instanceof Error ? error.message : String(error), {
          op: operation,
          applied: true,
          changed: true,
          retrySafe: false,
          sourceDigest: sourceDigest(project),
          dirty,
          persisted: false,
          result: clone(outcome.result),
          validation: clone(outcome.validation),
        });
      }
    }

    return {
      schemaVersion: LOOPLAB_AGENT_SESSION_RESULT_SCHEMA,
      sequence: currentSequence,
      requestId,
      ok: true,
      op: operation,
      changed: Boolean(outcome.changed),
      persisted,
      sourceDigest: sourceDigest(project),
      dirty,
      retrySafe: !outcome.changed,
      result: clone(outcome.result),
      validation: clone(outcome.validation),
    };
  }

  return {
    handleLine,
    getProject: () => clone(project),
    getStatus: () => clone(status()),
  };
}
