import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";

import {
  LOOPLAB_MCP_SERVER_VERSION,
  getLooplabCommandContracts,
  validateLooplabCommandContracts,
} from "./looplab-agent-contracts.mjs";
import {
  LOOPLAB_PROTOCOL_VERSION,
  applyAgentCommand,
  getPublicAgentManifest,
  summarizeProject,
} from "./looplab-agent-core.mjs";
import { doctorSourceDigest } from "./looplab-doctor.mjs";
import { getAgentPlaybook } from "./looplab-agent-playbook.mjs";
import { LOOPLAB_AGENT_GUIDE_INDEX } from "./generated/looplab-agent-guide-index.mjs";
import { LooplabBrowserAgentSession } from "./looplab-browser-agent-session.mjs";
import { readLooplabProjectFile, writeLooplabProjectFile } from "./looplab-project-file.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    ok: { type: "boolean" },
    op: { type: "string" },
    transport: { type: "string", enum: ["core-file", "browser-session"] },
    protocolVersion: { type: "string" },
  },
  required: ["ok", "op", "transport", "protocolVersion"],
  additionalProperties: true,
};

function coreToolSchema(contract) {
  const source = contract.inputSchema;
  const properties = {
    projectPath: {
      type: "string",
      minLength: 1,
      description: "Workspace-relative path to the editable .loop.json project.",
    },
    includeProject: {
      type: "boolean",
      description: "Include the complete updated project in this response. Defaults to false to protect agent context.",
    },
    ...source.properties,
  };
  const required = new Set(["projectPath", ...(source.required ?? [])]);
  if (contract.requiresSourceDigestInMcp) required.add("expectedSourceDigest");
  return {
    ...source,
    properties,
    required: [...required],
  };
}

function browserToolSchema(contract) {
  if (!contract.requiresSourceDigestInMcp || contract.inputSchema.required?.includes("expectedSourceDigest")) return contract.inputSchema;
  return {
    ...contract.inputSchema,
    required: [...(contract.inputSchema.required ?? []), "expectedSourceDigest"],
  };
}

function compactJson(value) {
  return JSON.stringify(value);
}

function redactError(value) {
  return String(value ?? "Unknown LoopLab MCP failure")
    .replace(/\b(?:sk|sk-proj|sk-ant)-[A-Za-z0-9_-]{12,}\b/g, "[redacted-provider-key]")
    .replace(/(OPENAI_API_KEY|ANTHROPIC_API_KEY|x-looplab-session-token)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/data:[^;,\s]+;base64,[A-Za-z0-9+/=]{64,}/g, "[embedded-data-redacted]")
    .slice(0, 4_000);
}

function toolResult(payload) {
  return {
    content: [{ type: "text", text: compactJson(payload) }],
    structuredContent: payload,
  };
}

function toolFailure({ op, transport, error }) {
  const payload = {
    ok: false,
    op,
    transport,
    protocolVersion: LOOPLAB_PROTOCOL_VERSION,
    error: redactError(error instanceof Error ? error.message : error),
  };
  return {
    ...toolResult(payload),
    isError: true,
  };
}

async function readResource(path, mimeType, uri) {
  const text = await readFile(path, "utf8");
  return { contents: [{ uri: uri.href, mimeType, text }] };
}

function registerResources(server) {
  server.registerResource(
    "looplab-agent-manifest",
    "looplab://manifest",
    { title: "LoopLab Agent Manifest", description: "Current generated protocol, command schemas, surfaces, and product invariants.", mimeType: "application/json" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: `${JSON.stringify(getPublicAgentManifest(), null, 2)}\n` }] }),
  );
  server.registerResource(
    "looplab-agent-playbook",
    "looplab://agent-playbook",
    { title: "LoopLab Agent Playbook", description: "Versioned, evidence-backed, read-only operating recipes for Codex and Claude. Recipes never execute commands.", mimeType: "application/json" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: `${JSON.stringify(getAgentPlaybook(), null, 2)}\n` }] }),
  );
  server.registerResource(
    "looplab-agent-guide",
    "looplab://agent-guide",
    { title: "LoopLab AI Agent Guide", description: "Complete authoritative operational guide for Codex and Claude. Use the generated index resource for bounded discovery.", mimeType: "text/markdown", annotations: { audience: ["assistant"], priority: 1 } },
    async (uri) => readResource(resolve(projectRoot, "docs", "AI_AGENT_GUIDE.md"), "text/markdown", uri),
  );
  server.registerResource(
    "looplab-agent-guide-index",
    "looplab://agent-guide-index",
    { title: "LoopLab AI Agent Guide Index", description: "Generated source-bound section, invariant, lifecycle, and failure-recovery navigation. Orientation only; the complete guide remains authoritative.", mimeType: "application/json", annotations: { audience: ["assistant"], priority: 0.95 } },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: `${JSON.stringify(LOOPLAB_AGENT_GUIDE_INDEX, null, 2)}\n` }] }),
  );
  server.registerResource(
    "looplab-mcp-setup",
    "looplab://mcp-setup",
    { title: "LoopLab MCP Setup", description: "Local Codex and Claude configuration plus safety boundaries.", mimeType: "text/markdown" },
    async (uri) => readResource(resolve(projectRoot, "docs", "MCP_AGENT_SETUP.md"), "text/markdown", uri),
  );
}

async function executeCoreTool({ contract, args, workspaceRoot }) {
  const { projectPath, includeProject = false, ...commandArgs } = args;
  const loaded = await readLooplabProjectFile(projectPath, { workspaceRoot });
  const outcome = applyAgentCommand(loaded.project, { op: contract.op, ...commandArgs });
  if (outcome.changed) await writeLooplabProjectFile(projectPath, outcome.project, { workspaceRoot, expectedRevisionDigest: loaded.revisionDigest });
  const sourceDigest = doctorSourceDigest(outcome.project);
  return {
    ok: true,
    op: contract.op,
    transport: "core-file",
    protocolVersion: LOOPLAB_PROTOCOL_VERSION,
    projectPath: loaded.path,
    changed: outcome.changed,
    sourceDigest,
    result: outcome.result,
    validation: outcome.validation,
    summary: summarizeProject(outcome.project),
    ...(includeProject && contract.op !== "get_project" ? { project: outcome.project } : {}),
  };
}

export function prepareBrowserMcpCommand(contract, args = {}) {
  const command = { op: contract.op, ...args };
  if (command.compact === undefined) command.compact = true;
  return command;
}

async function executeBrowserTool({ contract, args, browserSession }) {
  const command = prepareBrowserMcpCommand(contract, args);
  let response = await browserSession.run(command);
  if (command.compact === true && response?.project) {
    response = { ...response };
    delete response.project;
  }
  if (contract.op === "get_agent_brief") {
    const director = await browserSession.run({ op: "get_director_state", compact: true });
    const directorState = director?.state ?? director;
    if (response?.result && directorState?.ok === true) {
      response.result.provider = {
        source: "live-director-state",
        selected: directorState.provider ?? null,
        ready: directorState.providerReady === true,
        track: directorState.track ?? null,
        headlessSuperset: directorState.headlessSuperset === true,
      };
    }
  }
  return {
    ok: true,
    op: contract.op,
    transport: "browser-session",
    protocolVersion: LOOPLAB_PROTOCOL_VERSION,
    browser: browserSession.describe(),
    response,
  };
}

export function createLooplabMcpServer({
  surface = "core",
  workspaceRoot = process.cwd(),
  appUrl = "http://127.0.0.1:3000/",
  browserChannel,
  executablePath,
  timeoutMs,
  toolAllowlist = null,
} = {}) {
  if (!["core", "browser"].includes(surface)) throw new Error("LoopLab MCP surface must be core or browser.");
  const contractValidation = validateLooplabCommandContracts();
  if (!contractValidation.valid) throw new Error(`LoopLab command contracts are invalid: ${contractValidation.errors.join(" ")}`);
  const surfaceContracts = getLooplabCommandContracts().filter((contract) => surface === "core" ? contract.surfaces.includes("core") : contract.surfaces.includes("browser-session"));
  let contracts = surfaceContracts;
  if (toolAllowlist !== null && toolAllowlist !== undefined) {
    if (!Array.isArray(toolAllowlist)) throw new Error("LoopLab MCP tool allowlist must be an array of command names.");
    const requested = [...new Set(toolAllowlist.map((entry) => String(entry ?? "").trim()).filter(Boolean))];
    if (!requested.length) throw new Error("LoopLab MCP tool allowlist cannot be empty.");
    const available = new Set(surfaceContracts.map((contract) => contract.op));
    const unavailable = requested.filter((name) => !available.has(name));
    if (unavailable.length) throw new Error(`LoopLab MCP ${surface} surface does not expose allowed tool(s): ${unavailable.join(", ")}.`);
    const requestedSet = new Set(requested);
    contracts = surfaceContracts.filter((contract) => requestedSet.has(contract.op));
  }
  const browserSession = surface === "browser" ? new LooplabBrowserAgentSession({ appUrl, protocolVersion: LOOPLAB_PROTOCOL_VERSION, browserChannel, executablePath, timeoutMs }) : null;
  const server = new McpServer(
    { name: `looplab-${surface}`, version: LOOPLAB_MCP_SERVER_VERSION },
    {
      instructions: surface === "core"
        ? "Begin with get_agent_brief, then read get_work_ledger when shared work is active. Preview nontrivial authored batches with preview_batch, then apply only the exact reviewed receipt through apply_previewed_batch. Game mutations require Project Doctor's current expectedSourceDigest; a companion-owned shared file is additionally written against the exact revisionDigest read by this operation. Ledger mutations require the independent current expectedLedgerDigest. Use a variation before risky experiments. Generated art never owns collision. Exported games remain one offline HTML file."
        : "Begin with list_shared_projects, explicitly mount_shared_project, reconcile with list_projects, and read get_agent_brief. Companion bytes are authoritative and browser storage is only a cache. Use draft_agent_plan coverage and ordered phases as the authoritative workflow. Browser MCP defaults every command to compact responses; request full data only when the operation genuinely requires it. Preview nontrivial authored batches with preview_batch, then apply only the exact reviewed receipt through apply_previewed_batch; legacy apply_batch remains available. Use the independent ledgerDigest for claim and handoff mutations. On a stale shared revision, preserve the draft and use the exact preview/apply rebase receipt before gates and an explicit save. Monitor durable provider jobs by ID instead of resubmitting. Use visual browser evidence for rendered claims.",
    },
  );
  registerResources(server);
  for (const contract of contracts) {
    const inputSchema = surface === "core" ? coreToolSchema(contract) : browserToolSchema(contract);
    server.registerTool(
      contract.op,
      {
        title: contract.title,
        description: contract.description,
        inputSchema: fromJsonSchema(inputSchema),
        outputSchema: fromJsonSchema(OUTPUT_SCHEMA),
        annotations: contract.annotations,
      },
      async (args) => {
        try {
          const payload = surface === "core"
            ? await executeCoreTool({ contract, args, workspaceRoot })
            : await executeBrowserTool({ contract, args, browserSession });
          return toolResult(payload);
        } catch (error) {
          return toolFailure({ op: contract.op, transport: surface === "core" ? "core-file" : "browser-session", error });
        }
      },
    );
  }
  const originalClose = server.close.bind(server);
  server.close = async () => {
    if (browserSession) await browserSession.close();
    await originalClose();
  };
  return server;
}
