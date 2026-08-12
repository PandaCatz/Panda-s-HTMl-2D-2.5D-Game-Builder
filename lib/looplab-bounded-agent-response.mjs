import { getLooplabCommandContract } from "./looplab-agent-contracts.mjs";

export const LOOPLAB_BOUNDED_AGENT_RESPONSE_SCHEMA = "looplab-bounded-agent-response/v1";
export const LOOPLAB_AGENT_FORM_RESPONSE_LIMIT_CHARACTERS = 128_000;

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

function boundedValue(value, maxCharacters = 12_000) {
  if (value == null) return null;
  try {
    return JSON.stringify(value).length <= maxCharacters ? clone(value) : null;
  } catch {
    return null;
  }
}

function boundedText(value, maxCharacters = 512) {
  if (typeof value !== "string") return null;
  return value.length <= maxCharacters ? value : `${value.slice(0, Math.max(0, maxCharacters - 1))}…`;
}

function validationSummary(validation) {
  if (!validation || typeof validation !== "object" || Array.isArray(validation)) return null;
  const errors = Array.isArray(validation.errors) ? validation.errors : [];
  const warnings = Array.isArray(validation.warnings) ? validation.warnings : [];
  return {
    valid: validation.valid === true,
    errorCount: errors.length,
    warningCount: warnings.length,
    errors: errors.slice(0, 3).map((entry) => boundedText(typeof entry === "string" ? entry : entry?.message, 320)).filter(Boolean),
    warnings: warnings.slice(0, 3).map((entry) => boundedText(typeof entry === "string" ? entry : entry?.message, 320)).filter(Boolean),
    truncated: errors.length > 3 || warnings.length > 3,
  };
}

function commandMutationKind(op) {
  const contract = getLooplabCommandContract(op);
  if (contract?.mutatesProject) return "project";
  if (contract?.mutatesBuilderState) return "builder";
  return null;
}

function recoveryFor(operation, mutationApplied) {
  if (mutationApplied) {
    return {
      instruction: "Do not repeat the completed mutation. Refresh compact source and library state through the commands below.",
      sameTransportRetryUseful: false,
      nextCommands: [
        { op: "list_projects", compact: true },
        { op: "get_agent_brief", compact: true },
        { op: "get_doctor", profile: "prototype", compact: true },
      ],
      fullResultSurfaces: ["core MCP", "browser MCP with a client-managed result budget", "project-file CLI"],
    };
  }
  return {
    instruction: operation === "get_project"
      ? "Use bounded campaign/map context for orientation or retrieve the complete source through core MCP or the project-file CLI."
      : "Use a paginated or compact command, an MCP resource, or a client-managed full-result surface.",
    sameTransportRetryUseful: false,
    nextCommands: operation === "get_project"
      ? [{ op: "get_project_context", view: "campaign", compact: true }]
      : operation === "get_manifest"
        ? [{ op: "get_manifest", compact: true }]
        : [],
    fullResultSurfaces: ["static agent manifest or MCP resource", "core MCP", "project-file CLI"],
  };
}

export function normalizeAgentFormCommand(command) {
  if (!command || typeof command !== "object" || Array.isArray(command)) throw new Error("Agent form command must be one JSON object.");
  return { ...command, compact: true };
}

export function prepareBoundedAgentFormResponse(command, response, options = {}) {
  const limitCharacters = Number.isInteger(options.limitCharacters) && options.limitCharacters >= 2_000
    ? options.limitCharacters
    : LOOPLAB_AGENT_FORM_RESPONSE_LIMIT_CHARACTERS;
  const serializedFull = JSON.stringify(response, null, 2);
  if (serializedFull.length <= limitCharacters) {
    return {
      schemaVersion: LOOPLAB_BOUNDED_AGENT_RESPONSE_SCHEMA,
      bounded: false,
      originalCharacters: serializedFull.length,
      limitCharacters,
      value: response,
      serialized: serializedFull,
    };
  }

  const operation = boundedText(command?.op, 128) ?? "unknown";
  const mutationKind = commandMutationKind(operation);
  const commandSucceeded = response?.ok === true;
  const mutationApplied = Boolean(commandSucceeded && mutationKind);
  const transport = {
    schemaVersion: LOOPLAB_BOUNDED_AGENT_RESPONSE_SCHEMA,
    code: "agent-form-response-too-large",
    status: "complete-result-omitted",
    transport: "browser-form",
    operation,
    completeEnvelope: true,
    originalCharacters: serializedFull.length,
    limitCharacters,
    responseDigest: /^sha256:[a-f0-9]{64}$/.test(String(options.responseDigest ?? "")) ? options.responseDigest : null,
    requestedCompact: typeof options.requestedCompact === "boolean" ? options.requestedCompact : null,
    enforcedCompact: true,
    commandCompleted: true,
    mutationKind,
    mutationApplied,
    retrySafe: mutationApplied ? false : true,
  };
  const context = {
    sourceDigest: boundedText(options.sourceDigest, 160),
    activeProjectId: boundedText(response?.activeProjectId ?? options.activeProjectId, 160),
    project: boundedValue(options.projectSummary),
    doctor: boundedValue(options.doctorSummary, 8_000),
  };
  const recovery = recoveryFor(operation, mutationApplied);
  const validation = validationSummary(response?.validation);

  const value = mutationApplied
    ? {
      ok: true,
      changed: response?.changed !== false,
      activeProjectId: context.activeProjectId,
      result: {
        transport,
        context,
        recovery,
        message: "The command completed, but its full result was too large for the bounded browser form. Do not retry the mutation.",
      },
      ...(validation ? { validation } : {}),
    }
    : {
      ok: false,
      error: "agent-form-response-too-large",
      problem: {
        transport,
        context,
        recovery,
        message: "The command completed without changing project state, but its full result was too large for the bounded browser form.",
      },
      ...(validation ? { validation } : {}),
    };

  let serialized = JSON.stringify(value, null, 2);
  if (serialized.length > limitCharacters) {
    const minimal = mutationApplied
      ? { ok: true, changed: true, result: { transport, recovery: recoveryFor(operation, true), message: "Mutation completed; full result omitted. Do not retry." } }
      : { ok: false, error: "agent-form-response-too-large", problem: { transport, recovery: recoveryFor(operation, false) } };
    serialized = JSON.stringify(minimal, null, 2);
    return { schemaVersion: LOOPLAB_BOUNDED_AGENT_RESPONSE_SCHEMA, bounded: true, originalCharacters: serializedFull.length, limitCharacters, value: minimal, serialized };
  }
  return { schemaVersion: LOOPLAB_BOUNDED_AGENT_RESPONSE_SCHEMA, bounded: true, originalCharacters: serializedFull.length, limitCharacters, value, serialized };
}
