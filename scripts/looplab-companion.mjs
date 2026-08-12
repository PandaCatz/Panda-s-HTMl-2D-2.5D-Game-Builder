#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateProject } from "../lib/looplab-agent-core.mjs";
import { createAgentPresenceRegistry } from "../lib/looplab-agent-presence.mjs";
import { createSharedProjectStore } from "../lib/looplab-shared-project-store.mjs";
import { LOOPLAB_COMPANION_VERSION, LOOPLAB_PROTOCOL_VERSION } from "../lib/looplab-versions.mjs";
import { normalizeArtDirectionPolicy } from "../lib/looplab-art-direction.mjs";
import { runExactReleaseVerification } from "../lib/looplab-release-verification-runner.mjs";
import { LOOPLAB_PROVIDER_CONTEXT_POLICY } from "../lib/looplab-provider-context.mjs";
import { aggregateUsageReceipts } from "../lib/looplab-provider-usage.mjs";
import {
  createProviderFailoverReceipt,
  findRunningProviderConnection,
  isRetryableProviderPathFailure,
  providerFamilyPaths,
  resolveProviderRoute,
} from "../lib/looplab-provider-routing.mjs";
import { LOOPLAB_LOOP_EVALUATION_PROFILE_IDS } from "../lib/looplab-quality.mjs";
import { normalizeAppliedPreferenceContext } from "../lib/looplab-preference-memory.mjs";
import { API_CREDENTIAL_NAMES, CLI_LOGIN_COMMANDS, inspectProviders, loadProviderEnvironment, resolveProviderInvocation, verifyProviderCredentialCandidate } from "../lib/looplab-provider-status.mjs";
import { createAiArtProviderRequest, createAiArtUsageReceipt, normalizeAiArtRequest, parseAiArtResponse, publicAiArtRequest } from "../lib/looplab-ai-art.mjs";
import { inspectLocalCopilot, normalizeLocalCopilotRequest, runLocalCopilot } from "../lib/looplab-local-copilot.mjs";
import { normalizeVisualCritiqueRequest, publicVisualCritiqueRequest } from "../lib/looplab-visual-critique.mjs";
import { terminateProcessTree } from "../lib/looplab-process-tree.mjs";
import { sanitizePublicDiagnostic, sanitizePublicDiagnosticValue } from "../lib/looplab-public-diagnostics.mjs";
import {
  appendRetainedEvent,
  companionRetentionOptions,
  markResultDelivered,
  markTerminalRecord,
  reapCompanionRecords,
} from "../lib/looplab-companion-retention.mjs";
import {
  LOOPLAB_SESSION_HEADER,
  createCompanionSession,
  defaultCompanionSessionFile,
  hasValidCompanionSession,
  isAllowedCompanionHost,
  writeCompanionSession,
} from "../lib/looplab-companion-session.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.LOOPLAB_COMPANION_PORT ?? 4317);
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const MAX_SECRET_BODY_BYTES = 64 * 1024;
const HOSTED_LOOPLAB_ORIGIN = "https://looplab-2d-workshop.imalevel9turtle.chatgpt.site";
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.LOOPLAB_ALLOW_HOSTED_ORIGIN === "1" ? [HOSTED_LOOPLAB_ORIGIN] : []),
  ...String(process.env.LOOPLAB_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean),
]);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = join(scriptDirectory, "..");
const companionUrl = `http://${HOST}:${PORT}`;
const companionSessionFile = process.env.LOOPLAB_COMPANION_SESSION_FILE ?? defaultCompanionSessionFile(projectDirectory);
const companionSession = process.env.LOOPLAB_COMPANION_TOKEN
  ? {
      schemaVersion: "looplab-companion-session/v1",
      sessionId: process.env.LOOPLAB_COMPANION_SESSION_ID || globalThis.crypto.randomUUID(),
      token: process.env.LOOPLAB_COMPANION_TOKEN,
      url: companionUrl,
      createdAt: new Date().toISOString(),
    }
  : createCompanionSession({ url: companionUrl });
await writeCompanionSession(companionSessionFile, companionSession);
const SESSION_TOKEN = companionSession.token;
const loopScript = join(scriptDirectory, "looplab-loop.mjs");
const promptScript = join(scriptDirectory, "looplab-prompt.mjs");
const researchScript = join(scriptDirectory, "looplab-research.mjs");
const visualCritiqueScript = join(scriptDirectory, "looplab-visual-critique.mjs");
const researchReportDirectory = join(scriptDirectory, "..", "claudedocs");
const credentialSetupScript = join(scriptDirectory, "looplab-set-api-key.ps1");
const jobs = new Map();
const researchJobs = new Map();
const visualCritiqueJobs = new Map();
const assetJobs = new Map();
const releaseVerificationJobs = new Map();
const localCopilotJobs = new Map();
const providerConnections = new Map();
const agentPresenceRegistry = createAgentPresenceRegistry();
const sharedProjectWorkspace = process.env.LOOPLAB_SHARED_PROJECT_WORKSPACE ?? projectDirectory;
const sharedProjectStore = createSharedProjectStore({
  workspaceRoot: sharedProjectWorkspace,
  rootDirectory: process.env.LOOPLAB_SHARED_PROJECT_STORE_ROOT,
});
const retention = companionRetentionOptions();
let providerScanCache = null;
let providerScanTime = 0;
let localCopilotScanCache = null;
let localCopilotScanTime = 0;
let localCopilotOperationActive = false;
let providerRuntimeEnv = { ...process.env };
let promptGenerationActive = false;
let activeAiOperation = null;
const LOOPBACK_BROWSER_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
const publicRequestErrors = new WeakMap();

function corsHeaders(request) {
  const origin = request.headers.origin;
  const allowed = !origin || ALLOWED_ORIGINS.has(origin) || LOOPBACK_BROWSER_ORIGIN.test(origin);
  return {
    allowed,
    headers: {
      "Access-Control-Allow-Origin": origin && allowed ? origin : "null",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
      "Access-Control-Allow-Headers": `Content-Type, If-Match, If-None-Match, ${LOOPLAB_SESSION_HEADER}`,
      "Access-Control-Expose-Headers": "ETag",
      "Access-Control-Allow-Private-Network": "true",
      "Cache-Control": "no-store",
      "Vary": "Origin",
    },
  };
}

function sendJson(response, status, value, headers = {}) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), ...headers });
  response.end(body);
}

function requestError(statusCode, message, details = {}) {
  const error = new Error("LoopLab request rejected.");
  error.statusCode = statusCode;
  Object.assign(error, details);
  publicRequestErrors.set(error, {
    statusCode,
    body: publicErrorBody(message, details),
  });
  return error;
}

function publicErrorBody(message, details = {}) {
  const safe = sanitizePublicDiagnosticValue(details) ?? {};
  return {
    ok: false,
    error: sanitizePublicDiagnostic(message) || "The request was rejected.",
    ...(typeof safe.code === "string" ? { code: safe.code } : {}),
    ...(typeof safe.path === "string" ? { path: safe.path } : {}),
    ...(safe.expected !== undefined && safe.expected !== null ? { expected: safe.expected } : {}),
    ...(safe.got !== undefined ? { got: safe.got } : {}),
    ...(typeof safe.repairAction === "string" ? { repairAction: safe.repairAction } : {}),
    ...(safe.current && typeof safe.current === "object" ? { current: safe.current } : {}),
    ...(safe.providerRoute && typeof safe.providerRoute === "object" ? { providerRoute: safe.providerRoute } : {}),
    ...(safe.providerFailover && typeof safe.providerFailover === "object" ? { providerFailover: safe.providerFailover } : {}),
    ...(safe.usage && typeof safe.usage === "object" ? { usage: safe.usage } : {}),
    ...(Number.isInteger(safe.retryAfterSeconds) && safe.retryAfterSeconds > 0 ? { retryAfterSeconds: safe.retryAfterSeconds } : {}),
  };
}

function conditionalRevisionDigest(value, field) {
  const header = String(value ?? "").trim();
  if (!header) return null;
  const match = /^"(revision-[a-f0-9]{64})"$/.exec(header);
  if (!match) {
    throw requestError(400, `${field} must contain one quoted LoopLab revision digest.`, {
      code: "shared-project-condition-invalid",
      path: `/headers/${field.toLowerCase()}`,
      got: header.slice(0, 160),
      repairAction: `Use ${field}: "revision-…" exactly as returned by the shared project endpoint.`,
    });
  }
  return match[1];
}

function reserveAiOperation(kind) {
  if (activeAiOperation) throw requestError(409, `An AI operation is already running (${activeAiOperation.kind}). Wait or cancel it first.`);
  const reservation = { id: globalThis.crypto.randomUUID(), kind, startedAt: new Date().toISOString() };
  activeAiOperation = reservation;
  return reservation;
}

function releaseAiOperation(reservation) {
  if (reservation && activeAiOperation?.id === reservation.id) activeAiOperation = null;
}

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request exceeds the 25 MiB local companion limit.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readProviderKeyBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_SECRET_BODY_BYTES) throw new Error("Credential request is too large.");
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (body && typeof body === "object") body.key = null;
  if (key.length < 20 || /\s/.test(key)) throw new Error("Paste the complete API key without spaces.");
  return key;
}

function pushEvent(job, event) {
  const normalized = appendRetainedEvent(job, sanitizeRetainedEvent(event), { maximum: retention.eventHistory });
  const line = `data: ${JSON.stringify(normalized)}\n\n`;
  for (const response of job.listeners) response.write(line);
}

function closeListeners(job) {
  markTerminalRecord(job);
  for (const response of job.listeners) response.end();
  job.listeners.clear();
}

async function cleanupJobDirectory(job) {
  if (!job?.jobDirectory || job.jobDirectoryCleaned) return;
  job.jobDirectoryCleaned = true;
  await rm(job.jobDirectory, { recursive: true, force: true }).catch(() => {});
}

async function getProviderScan({ force = false, allowStale = false } = {}) {
  if (!force && providerScanCache && (allowStale || Date.now() - providerScanTime < 30_000)) return providerScanCache;
  providerRuntimeEnv = await loadProviderEnvironment();
  providerScanCache = await inspectProviders({ env: providerRuntimeEnv });
  providerScanTime = Date.now();
  return providerScanCache;
}

function providerExecutionEnvironment(provider, scan = providerScanCache) {
  const environment = { ...providerRuntimeEnv };
  for (const id of ["codex", "openai", "claude", "anthropic"]) {
    const pathAuthMethod = scan?.providers?.[id]?.authMethod;
    const variable = `LOOPLAB_PROVIDER_AUTH_METHOD_${id.toUpperCase()}`;
    if (typeof pathAuthMethod === "string" && pathAuthMethod.trim()) environment[variable] = pathAuthMethod.trim();
    else delete environment[variable];
  }
  const authMethod = scan?.providers?.[provider]?.authMethod;
  if (typeof authMethod === "string" && authMethod.trim()) environment.LOOPLAB_PROVIDER_AUTH_METHOD = authMethod.trim();
  else delete environment.LOOPLAB_PROVIDER_AUTH_METHOD;
  return environment;
}

function providerRouteForPayload(payload, scan, { eligibleProviders = ["codex", "openai", "claude", "anthropic"], attemptedProviders = [] } = {}) {
  const requestedProvider = ["openai", "anthropic", "codex", "claude"].includes(payload?.requestedProvider)
    ? payload.requestedProvider
    : ["openai", "anthropic", "codex", "claude"].includes(payload?.provider)
      ? payload.provider
      : "auto";
  const route = resolveProviderRoute(scan, {
    requestedProvider,
    mode: payload?.providerMode,
    attemptedProviders,
    eligibleProviders,
  });
  if (!route.selectedProvider) {
    const states = route.candidates.map((candidate) => `${candidate.label}: ${candidate.state}${candidate.alreadyAttempted ? " (already attempted)" : ""}`).join("; ");
    throw requestError(503, `${route.selectionReason}${states ? ` ${states}.` : ""}`, {
      code: "provider-route-unavailable",
      providerRoute: route,
    });
  }
  return route;
}

function providerFailurePayload(error, provider) {
  const message = sanitizeConnectionLine(error instanceof Error ? error.message : String(error));
  const receipt = error?.usageReceipt && typeof error.usageReceipt === "object" ? error.usageReceipt : null;
  return { provider, status: "failed", reason: message || `${provider} failed without a diagnostic.`, usage: receipt };
}

function providerFailureFromProcessOutput(value) {
  const text = String(value ?? "").trim();
  if (!text) return { message: "", receipt: null };
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") return {
        message: sanitizeConnectionLine(parsed.error ?? parsed.message ?? text),
        receipt: parsed.receipt && typeof parsed.receipt === "object" ? parsed.receipt : null,
      };
    } catch { /* Keep looking for a structured terminal diagnostic. */ }
  }
  return { message: sanitizeConnectionLine(text), receipt: null };
}

function providerRouteFailureError(error, { requestedProvider, mode, route, attempts, usageReceipts, operation }) {
  const providerFailover = createProviderFailoverReceipt({ requestedProvider, mode, selectedProvider: null, attempts });
  const usage = usageReceipts.length > 1
    ? aggregateUsageReceipts(usageReceipts, { provider: "mixed", model: "multiple", label: `${operation}-failover-total` })
    : usageReceipts[0] ?? null;
  return requestError(502, error instanceof Error ? error.message : String(error), {
    code: "provider-route-failed",
    providerRoute: route,
    providerFailover,
    usage,
  });
}

function sanitizeConnectionLine(value) {
  return sanitizePublicDiagnostic(value);
}

function sanitizeRetainedEvent(event) {
  const sanitized = event && typeof event === "object" && !Array.isArray(event) ? { ...event } : { type: "companion.output", message: String(event ?? "") };
  for (const field of ["message", "error", "detail", "usageMessage", "url"]) {
    if (typeof sanitized[field] === "string") sanitized[field] = sanitizeConnectionLine(sanitized[field]);
  }
  return sanitized;
}

function connectionUrl(line) {
  return line.match(/https:\/\/[^\s<>"']+/)?.[0]?.replace(/[),.;]+$/, "");
}

function pushConnectionEvent(connection, event) {
  const normalized = appendRetainedEvent(connection, sanitizeRetainedEvent(event), { maximum: retention.eventHistory });
  const line = `data: ${JSON.stringify(normalized)}\n\n`;
  for (const response of connection.listeners) response.write(line);
}

function closeConnectionListeners(connection) {
  markTerminalRecord(connection);
  for (const response of connection.listeners) response.end();
  connection.listeners.clear();
}

function runningProviderConnection(provider = null) {
  return findRunningProviderConnection(providerConnections, provider);
}

async function startProviderConnection(provider) {
  const activeConnection = runningProviderConnection(provider);
  if (activeConnection) {
    pushConnectionEvent(activeConnection, { type: API_CREDENTIAL_NAMES[provider] ? "provider.key.resumed" : "provider.login.resumed", provider, message: `Reattached to the existing ${API_CREDENTIAL_NAMES[provider] ? "secure key setup" : "sign-in"} for this provider.` });
    return { connection: activeConnection, resumed: true };
  }
  if (API_CREDENTIAL_NAMES[provider]) return { connection: await startApiKeyConnection(provider), resumed: false };
  if (!CLI_LOGIN_COMMANDS[provider]) throw new Error("That provider connection method is not supported.");
  const scan = await getProviderScan({ force: true });
  const providerStatus = scan.providers[provider];
  if (providerStatus.ready) throw new Error(`${providerStatus.label} is already connected.`);
  if (!providerStatus.runnable) throw new Error(providerStatus.detail);

  const id = globalThis.crypto.randomUUID();
  const connection = { id, provider, status: "starting", createdAt: new Date().toISOString(), events: [], listeners: new Set(), child: null, timer: null, finished: false, stopReason: null, finish: null };
  providerConnections.set(id, connection);
  pushConnectionEvent(connection, { type: "provider.login.started", provider, message: `Starting the supported ${provider === "codex" ? "device-code" : "browser"} sign-in flow` });

  const login = CLI_LOGIN_COMMANDS[provider];
  const invocation = resolveProviderInvocation(login.command, login.args, { env: providerRuntimeEnv });
  const child = spawn(invocation.command, invocation.args, {
    windowsHide: false,
    shell: invocation.shell,
    stdio: ["ignore", "pipe", "pipe"],
  });
  connection.child = child;
  connection.status = "running";
  const buffers = { stdout: "", stderr: "" };

  const emitChunk = (channel, chunk) => {
    buffers[channel] += String(chunk);
    const lines = buffers[channel].split(/\r?\n/);
    buffers[channel] = lines.pop() ?? "";
    for (const rawLine of lines) {
      const message = sanitizeConnectionLine(rawLine);
      if (!message) continue;
      pushConnectionEvent(connection, { type: "provider.login.output", provider, channel, message, url: connectionUrl(message) });
    }
  };

  const finish = async (exitCode, launchError) => {
    if (connection.finished) return;
    connection.finished = true;
    clearTimeout(connection.timer);
    for (const [channel, remainder] of Object.entries(buffers)) {
      const message = sanitizeConnectionLine(remainder);
      if (message) pushConnectionEvent(connection, { type: "provider.login.output", provider, channel, message, url: connectionUrl(message) });
    }
    if (launchError) {
      connection.status = "failed";
      pushConnectionEvent(connection, { type: "provider.login.failed", provider, message: "The CLI sign-in process could not be launched." });
      closeConnectionListeners(connection);
      return;
    }
    if (connection.stopReason === "cancelled") {
      connection.status = "cancelled";
      pushConnectionEvent(connection, { type: "provider.login.cancelled", provider, message: "The provider sign-in was cancelled. You can start a fresh sign-in now." });
      closeConnectionListeners(connection);
      return;
    }
    const refreshed = await getProviderScan({ force: true });
    if (exitCode === 0 && refreshed.providers[provider].ready) {
      connection.status = "completed";
      pushConnectionEvent(connection, { type: "provider.login.completed", provider, message: `${refreshed.providers[provider].label} is authenticated and ready` });
    } else {
      connection.status = "failed";
      pushConnectionEvent(connection, { type: "provider.login.failed", provider, message: exitCode === null ? "The sign-in flow timed out." : "Sign-in ended, but an authenticated session was not detected." });
    }
    closeConnectionListeners(connection);
  };
  connection.finish = finish;

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => emitChunk("stdout", chunk));
  child.stderr?.on("data", (chunk) => emitChunk("stderr", chunk));
  child.on("error", (error) => { void finish(null, error); });
  child.on("close", (exitCode) => { void finish(exitCode, null); });
  connection.timer = setTimeout(() => {
    connection.stopReason = "timeout";
    void terminateProcessTree(child).finally(() => finish(null, null));
  }, 10 * 60 * 1_000);
  connection.timer.unref?.();
  return { connection, resumed: false };
}

async function cancelProviderConnection(connection) {
  if (!connection || connection.status !== "running") throw new Error("That provider sign-in is no longer running.");
  connection.stopReason = "cancelled";
  await terminateProcessTree(connection.child);
  await connection.finish?.(null, null);
  return connection;
}

async function startApiKeyConnection(provider) {
  if (!API_CREDENTIAL_NAMES[provider]) throw new Error("Only supported API providers can use native key setup.");
  if (process.platform !== "win32") throw new Error(`Native ${provider} key setup is currently available on Windows. Set ${API_CREDENTIAL_NAMES[provider]} in the companion environment, then scan again.`);
  const activeConnection = runningProviderConnection(provider);
  if (activeConnection) {
    pushConnectionEvent(activeConnection, { type: "provider.key.resumed", provider, message: "Reattached to the existing secure key setup for this provider." });
    return activeConnection;
  }
  const scan = await getProviderScan({ force: true });
  const providerStatus = scan.providers[provider];
  if (providerStatus.ready) throw new Error(`${providerStatus.label} is already connected.`);

  const id = globalThis.crypto.randomUUID();
  const setupDirectory = await mkdtemp(join(tmpdir(), "looplab-key-setup-"));
  const resultPath = join(setupDirectory, "result.json");
  const connection = { id, provider, status: "starting", createdAt: new Date().toISOString(), events: [], listeners: new Set(), child: null, timer: null, finished: false, setupDirectory };
  providerConnections.set(id, connection);
  pushConnectionEvent(connection, { type: "provider.key.started", provider, message: `Opening secure Windows setup for ${providerStatus.label}` });

  const child = spawn("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-STA",
    "-WindowStyle", "Hidden",
    "-ExecutionPolicy", "Bypass",
    "-File", credentialSetupScript,
    "-Provider", provider,
    "-ResultPath", resultPath,
  ], {
    // Let WinForms create a foreground window. PowerShell hides only its own
    // console via -WindowStyle; windowsHide also hides the secure key dialog.
    windowsHide: false,
    shell: false,
    stdio: "ignore",
  });
  connection.child = child;
  connection.status = "running";

  const finish = async (exitCode, launchError) => {
    if (connection.finished) return;
    connection.finished = true;
    clearTimeout(connection.timer);
    let result = null;
    if (!launchError) {
      try { result = JSON.parse((await readFile(resultPath, "utf8")).replace(/^\uFEFF/, "")); }
      catch { result = null; }
    }
    await rm(setupDirectory, { recursive: true, force: true }).catch(() => {});

    if (launchError || !result) {
      connection.status = "failed";
      pushConnectionEvent(connection, { type: "provider.key.failed", provider, message: "The secure Windows key prompt could not be launched or did not return a result." });
      closeConnectionListeners(connection);
      return;
    }
    if (result.cancelled) {
      connection.status = "failed";
      pushConnectionEvent(connection, { type: "provider.key.failed", provider, message: "API key setup was cancelled; no credential was changed." });
      closeConnectionListeners(connection);
      return;
    }
    if (exitCode !== 0 || !result.ok) {
      connection.status = "failed";
      pushConnectionEvent(connection, { type: "provider.key.failed", provider, message: result.error ?? "Windows could not save the API key securely." });
      closeConnectionListeners(connection);
      return;
    }

    pushConnectionEvent(connection, { type: "provider.key.saved", provider, message: `${providerStatus.label} key saved with Windows current-user encryption; verifying now` });
    const refreshed = await getProviderScan({ force: true });
    const refreshedStatus = refreshed.providers[provider];
    if (refreshedStatus.ready) {
      connection.status = "completed";
      pushConnectionEvent(connection, { type: "provider.key.completed", provider, message: `${refreshedStatus.label} is authenticated and ready` });
    } else {
      connection.status = "failed";
      pushConnectionEvent(connection, { type: "provider.key.failed", provider, message: `The key was saved, but verification did not pass: ${refreshedStatus.summary}.` });
    }
    closeConnectionListeners(connection);
  };

  child.on("error", (error) => { void finish(null, error); });
  child.on("close", (exitCode) => { void finish(exitCode, null); });
  connection.timer = setTimeout(() => {
    child.kill();
    void finish(null, null);
  }, 10 * 60 * 1_000);
  connection.timer.unref?.();
  return connection;
}

async function saveApiKeyFromBrowser(provider, inputKey) {
  if (!API_CREDENTIAL_NAMES[provider]) throw new Error("Only supported API providers can store a key.");
  if (process.platform !== "win32") throw new Error(`Secure ${provider} key storage is currently available on Windows.`);
  if (runningProviderConnection(provider)) throw requestError(409, `A ${provider} connection is already running. Resume or cancel that provider's setup before replacing its credential.`);
  await verifyProviderCredentialCandidate(provider, inputKey, { baseEnv: providerRuntimeEnv });
  const setupDirectory = await mkdtemp(join(tmpdir(), "looplab-key-input-"));
  const resultPath = join(setupDirectory, "result.json");
  let key = inputKey;
  try {
    const result = await new Promise((resolveResult, rejectResult) => {
      const child = spawn("powershell.exe", [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-File", credentialSetupScript,
        "-Provider", provider,
        "-ResultPath", resultPath,
        "-ReadFromStdin",
      ], { windowsHide: true, shell: false, stdio: ["pipe", "ignore", "ignore"] });
      let settled = false;
      const finish = async (exitCode, launchError = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (launchError) return rejectResult(new Error("Windows secure storage could not be launched."));
        let value = null;
        try { value = JSON.parse((await readFile(resultPath, "utf8")).replace(/^\uFEFF/, "")); }
        catch { value = null; }
        if (!value) return rejectResult(new Error("Windows secure storage did not return a result."));
        if (exitCode !== 0 || !value.ok) return rejectResult(new Error(value.error ?? "Windows could not save the API key securely."));
        resolveResult(value);
      };
      const timer = setTimeout(() => {
        child.kill();
        void finish(null, new Error("Secure storage timed out."));
      }, 30_000);
      child.on("error", (error) => { void finish(null, error); });
      child.on("close", (exitCode) => { void finish(exitCode); });
      child.stdin.on("error", () => {});
      child.stdin.end(key, "utf8");
      key = "";
    });
    providerScanCache = null;
    const refreshed = await getProviderScan({ force: true });
    const status = refreshed.providers[provider];
    if (!status.ready) throw new Error(`The key was encrypted, but provider verification did not pass: ${status.summary}.`);
    return { result, status };
  } finally {
    key = "";
    inputKey = "";
    await rm(setupDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

function runPromptProviderProcess({ provider, providerScan, jobDirectory, inputPath, outputPath }) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(process.execPath, [promptScript, "--provider", provider, "--input", inputPath, "--output", outputPath], {
      cwd: jobDirectory,
      env: providerExecutionEnvironment(provider, providerScan),
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectProcess(error);
      else resolveProcess(value);
    };
    const configuredPromptTimeoutMs = Number(providerRuntimeEnv.LOOPLAB_PROMPT_TIMEOUT_MS ?? providerRuntimeEnv.LOOPLAB_PROVIDER_TIMEOUT_MS ?? 0);
    const timer = Number.isFinite(configuredPromptTimeoutMs) && configuredPromptTimeoutMs > 0
      ? setTimeout(() => {
          void terminateProcessTree(child).finally(() => finish(new Error("AI prompt generation timed out.")));
        }, Math.max(30_000, configuredPromptTimeoutMs) + 15_000)
      : null;
    timer?.unref?.();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-100_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-100_000); });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code === 0) return finish(null, { stdout, stderr });
      const diagnostic = providerFailureFromProcessOutput(stderr || stdout);
      const error = new Error(diagnostic.message || `Prompt generation exited with code ${code}.`);
      if (diagnostic.receipt) error.usageReceipt = diagnostic.receipt;
      error.providerExitCode = code;
      return finish(error);
    });
  });
}

async function generatePromptDraft(payload) {
  const requestedProvider = ["openai", "anthropic", "codex", "claude"].includes(payload?.requestedProvider)
    ? payload.requestedProvider
    : ["openai", "anthropic", "codex", "claude"].includes(payload?.provider)
      ? payload.provider
      : payload?.provider === "auto"
        ? "auto"
        : null;
  if (!requestedProvider) throw new Error("provider must be auto, openai, anthropic, codex, or claude.");
  const reservation = reserveAiOperation("prompt-generation");
  promptGenerationActive = true;
  let jobDirectory = null;
  try {
    const providerScan = await getProviderScan({ force: true });
    let route = providerRouteForPayload({ ...payload, requestedProvider }, providerScan);
    const userPrompt = String(payload.userPrompt ?? "").trim().slice(0, 12_000);
    const basePrompt = String(payload.basePrompt ?? payload.designBrief?.composedPrompt ?? "").trim().slice(0, 40_000);
    const currentPrompt = String(payload.currentPrompt ?? basePrompt).trim().slice(0, 40_000);
    if (!basePrompt) throw new Error("basePrompt must contain the complete provider input.");
    const requiredConstraints = Array.isArray(payload.requiredConstraints)
      ? payload.requiredConstraints.map((constraint) => String(constraint).trim().slice(0, 300)).filter(Boolean).slice(0, 30)
      : [];
    let context = null;
    if (payload.context && typeof payload.context === "object" && !Array.isArray(payload.context)) {
      const serializedContext = JSON.stringify(payload.context);
      context = serializedContext.length <= 20_000 ? JSON.parse(serializedContext) : { summary: serializedContext.slice(0, 20_000) };
    }
    const attempt = Math.max(1, Math.min(1000, Number(payload.attempt ?? 1)));
    jobDirectory = await mkdtemp(join(tmpdir(), "looplab-prompt-"));
    const inputPath = join(jobDirectory, "prompt-input.json");
    const outputPath = join(jobDirectory, "prompt-output.json");
    await writeFile(inputPath, `${JSON.stringify({ userPrompt, basePrompt, currentPrompt, requiredConstraints, context, attempt }, null, 2)}\n`, "utf8");
    const attempts = [];
    const usageReceipts = [];
    const routeConsole = [{ type: "provider.route.selected", requestedProvider, provider: route.selectedProvider, fallbackUsed: route.fallbackUsed, message: route.selectionReason }];
    while (route.selectedProvider) {
      const provider = route.selectedProvider;
      try {
        await rm(outputPath, { force: true }).catch(() => {});
        const processResult = await runPromptProviderProcess({ provider, providerScan, jobDirectory, inputPath, outputPath });
        const generated = JSON.parse(await readFile(outputPath, "utf8"));
        if (generated.usage) usageReceipts.push(generated.usage);
        attempts.push({ provider, status: "completed", reason: null, usage: generated.usage ?? null });
        const usage = usageReceipts.length > 1
          ? aggregateUsageReceipts(usageReceipts, { provider: "mixed", model: "multiple", label: "prompt-failover-total" })
          : generated.usage ?? null;
        const failover = createProviderFailoverReceipt({ requestedProvider, mode: payload.providerMode, selectedProvider: provider, attempts });
        return {
          id: globalThis.crypto.randomUUID(),
          requestedProvider,
          provider,
          providerRoute: route,
          providerFailover: failover,
          model: generated.model ?? providerScan.providers[provider].model ?? null,
          generatedAt: generated.generatedAt ?? new Date().toISOString(),
          title: generated.title,
          summary: generated.summary,
          prompt: generated.prompt,
          similarityToPrevious: generated.similarityToPrevious,
          usage,
          basePrompt,
          requiredConstraints,
          console: [...routeConsole, ...String(processResult.stdout ?? "").trim().split(/\r?\n/).filter(Boolean).slice(-10).map((line) => {
            try { return JSON.parse(line); } catch { return { type: "prompt.output", message: sanitizeConnectionLine(line) }; }
          })].slice(-14),
        };
      } catch (error) {
        const failure = providerFailurePayload(error, provider);
        attempts.push(failure);
        if (failure.usage) usageReceipts.push(failure.usage);
        if (!isRetryableProviderPathFailure(failure.reason)) {
          throw providerRouteFailureError(error, { requestedProvider, mode: payload.providerMode, route, attempts, usageReceipts, operation: "prompt" });
        }
        const next = resolveProviderRoute(providerScan, {
          requestedProvider,
          mode: payload.providerMode,
          attemptedProviders: attempts.map((attemptEntry) => attemptEntry.provider),
        });
        if (!next.selectedProvider) {
          throw providerRouteFailureError(error, { requestedProvider, mode: payload.providerMode, route: next, attempts, usageReceipts, operation: "prompt" });
        }
        routeConsole.push({ type: "provider.failover.started", requestedProvider, failedProvider: provider, provider: next.selectedProvider, message: `${provider} failed before a prompt draft was accepted; retrying the same request with ${next.selectedProvider}.` });
        route = next;
      }
    }
    throw new Error("No provider path completed prompt generation.");
  } finally {
    promptGenerationActive = false;
    releaseAiOperation(reservation);
    if (jobDirectory) await rm(jobDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

async function startAssetJob(payload) {
  const reservation = reserveAiOperation("ai-art");
  try {
    return await startReservedAssetJob(payload, reservation);
  } catch (error) {
    releaseAiOperation(reservation);
    throw error;
  }
}

async function getLocalCopilotScan({ force = false, allowStale = false } = {}) {
  if (!force && localCopilotScanCache && (allowStale || Date.now() - localCopilotScanTime < 30_000)) return localCopilotScanCache;
  localCopilotScanCache = await inspectLocalCopilot({ env: providerRuntimeEnv });
  localCopilotScanTime = Date.now();
  return localCopilotScanCache;
}

function localVerificationUsage() {
  return {
    schemaVersion: "looplab-local-operation-usage/v1",
    provider: "none",
    source: "local-browser-harness",
    measured: true,
    totalTokens: 0,
    estimatedUsd: 0,
    actualChargeClaimed: false,
    note: "Exact release verification is local and does not call an AI provider.",
  };
}

async function startReleaseVerificationJob(payload) {
  const running = [...releaseVerificationJobs.values()].find((job) => job.status === "running");
  if (running) throw requestError(409, `Exact release verification ${running.id} is already running. Resume or cancel that job first.`);
  const project = payload?.project;
  const filenameValue = String(payload?.filename ?? "game.html").trim().split(/[\\/]/).at(-1) || "game.html";
  const filename = filenameValue.toLowerCase().endsWith(".html") ? filenameValue : `${filenameValue}.html`;
  const id = globalThis.crypto.randomUUID();
  const controller = new AbortController();
  const jobDirectory = await mkdtemp(join(tmpdir(), "looplab-release-verification-"));
  const captureDirectory = join(jobDirectory, "captures");
  const job = {
    id,
    kind: "release-verification",
    status: "running",
    createdAt: new Date().toISOString(),
    filename,
    events: [],
    listeners: new Set(),
    controller,
    result: null,
    usage: localVerificationUsage(),
    error: null,
  };
  releaseVerificationJobs.set(id, job);
  pushEvent(job, { type: "release.verification.job.started", filename, message: "Exact local release verification accepted; no AI provider will be called." });

  void (async () => {
    try {
      const outcome = await runExactReleaseVerification(project, {
        filename,
        captureDirectory,
        signal: controller.signal,
        onProgress: (event) => pushEvent(job, event),
      });
      if (job.status === "cancelled") return;
      job.result = {
        schemaVersion: "looplab-release-verification-result/v1",
        jobId: id,
        passed: outcome.ok,
        project: outcome.ok ? outcome.project : undefined,
        html: outcome.ok ? outcome.html : undefined,
        sourceDigest: outcome.sourceDigest,
        audit: outcome.audit,
        platformHarness: outcome.platformHarness,
        findings: outcome.findings,
        attestation: outcome.attestation ?? null,
        doctor: outcome.doctor ?? null,
        usage: job.usage,
      };
      if (!outcome.ok) {
        job.status = "failed";
        job.error = "The hostile-browser policy rejected the exact HTML subject; the current project is unchanged.";
        pushEvent(job, { type: "release.verification.job.failed", error: job.error, findingCount: outcome.findings.length, resultAvailable: true, message: job.error });
      } else {
        job.status = "completed";
        pushEvent(job, { type: "release.verification.job.completed", resultAvailable: true, artifactSha256: outcome.attestation.subject.digest.sha256, sourceDigest: outcome.sourceDigest, usage: job.usage, message: "Exact HTML bytes passed and the source-bound attestation is ready." });
      }
    } catch (error) {
      if (job.status === "cancelled" || error?.name === "AbortError") {
        job.status = "cancelled";
        pushEvent(job, { type: "release.verification.job.cancelled", message: "Exact release verification cancelled; the current project is unchanged." });
      } else {
        job.status = "failed";
        job.error = sanitizeConnectionLine(error instanceof Error ? error.message : String(error));
        pushEvent(job, { type: "release.verification.job.failed", error: job.error, message: "Exact release verification failed; the current project is unchanged." });
      }
    } finally {
      job.controller = null;
      await rm(jobDirectory, { recursive: true, force: true }).catch(() => {});
      closeListeners(job);
    }
  })();
  return job;
}

async function startReservedAssetJob(payload, reservation) {
  if (payload.provider !== undefined && payload.provider !== "openai") throw new Error("AI art generation currently uses the OpenAI Image API.");
  const providerScan = await getProviderScan({ force: true });
  if (!providerScan.providers.openai.ready) throw new Error(providerScan.providers.openai.detail);
  const apiKey = providerRuntimeEnv.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not available to the local companion.");
  const request = normalizeAiArtRequest(payload, providerRuntimeEnv);
  const id = globalThis.crypto.randomUUID();
  const controller = new AbortController();
  const job = {
    id,
    kind: "ai-art",
    provider: "openai",
    status: "running",
    createdAt: new Date().toISOString(),
    request: publicAiArtRequest(request),
    events: [],
    listeners: new Set(),
    controller,
    result: null,
    usage: null,
    error: null,
  };
  assetJobs.set(id, job);
  pushEvent(job, { type: "asset.job.started", provider: "openai", model: request.model, promptDigest: request.promptDigest, frameCount: request.frameCount, message: "AI art job accepted; one provider request will be submitted" });

  void (async () => {
    try {
      pushEvent(job, {
        type: "asset.provider.requested", provider: "openai", model: request.model, operation: request.providerOperation,
        quality: request.quality, size: "1024x1024", background: request.background,
        imageReferenceCount: request.visualIdentity.imageReferenceCount, imageReferenceBytes: request.visualIdentity.imageReferenceBytes,
        message: request.providerOperation === "edit" ? "Generating one complete game-art sheet with explicitly authorized project references" : "Generating one complete game-art sheet",
      });
      const providerRequest = createAiArtProviderRequest(request, apiKey);
      const response = await fetch(providerRequest.url, {
        ...providerRequest.init,
        signal: controller.signal,
      });
      let value;
      try { value = await response.json(); }
      catch { value = null; }
      if (!response.ok) {
        const code = value?.error?.code ?? value?.error?.type ?? `http_${response.status}`;
        throw new Error(`OpenAI Image API ${response.status} (${code}): ${value?.error?.message ?? response.statusText}`);
      }
      const image = parseAiArtResponse(value, request, { requestId: response.headers.get("x-request-id") });
      const usage = createAiArtUsageReceipt({ model: image.model, quality: request.quality, usage: image.usage, operation: request.providerOperation });
      job.result = { schemaVersion: "looplab-ai-art-result/v1", jobId: id, request: publicAiArtRequest(request), image: { ...image, usage: undefined }, usage };
      job.usage = usage;
      job.status = "completed";
      pushEvent(job, { type: "asset.job.completed", message: "AI art source is ready for deterministic Looplab normalization", resultAvailable: true, byteLength: image.byteLength, width: image.width, height: image.height, usage });
    } catch (error) {
      if (job.status === "cancelled" || error?.name === "AbortError") {
        job.status = "cancelled";
        pushEvent(job, { type: "asset.job.cancelled", message: "AI art job cancelled by user" });
      } else {
        job.status = "failed";
        job.error = sanitizeConnectionLine(error instanceof Error ? error.message : String(error));
        pushEvent(job, { type: "asset.job.failed", error: job.error, message: "AI art generation failed; the current project is unchanged" });
      }
    } finally {
      job.controller = null;
      releaseAiOperation(reservation);
      closeListeners(job);
    }
  })();

  return job;
}

async function startJob(payload) {
  const reservation = reserveAiOperation("game-loop");
  try {
    return await startReservedJob(payload, reservation);
  } catch (error) {
    releaseAiOperation(reservation);
    throw error;
  }
}

function isProtectedCompanionReadPath(pathname) {
  return /^\/(?:agent-presence|projects|jobs|research-jobs|visual-critique-jobs|asset-jobs|release-verification-jobs|local-copilot\/jobs)(?:\/|$)/.test(pathname);
}

async function startReservedJob(payload, reservation) {
  const requestedProvider = ["openai", "anthropic", "codex", "claude"].includes(payload?.requestedProvider)
    ? payload.requestedProvider
    : ["openai", "anthropic", "codex", "claude"].includes(payload?.provider)
      ? payload.provider
      : payload?.provider === "auto" || payload?.provider === undefined
        ? "auto"
        : null;
  if (!requestedProvider) throw new Error("provider must be auto, openai, anthropic, codex, or claude.");
  const providerScan = await getProviderScan({ force: true });
  const providerRoute = providerRouteForPayload({ ...payload, requestedProvider }, providerScan);
  const provider = providerRoute.selectedProvider;
  const providerCandidates = providerRoute.candidates.filter((candidate) => candidate.ready).map((candidate) => candidate.provider);
  const project = payload.project;
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(`Project is invalid: ${validation.errors.join(" ")}`);
  const goal = String(payload.goal ?? "Improve the current game.").trim().slice(0, 20_000);
  if (!goal) throw new Error("goal must not be empty.");
  const iterations = Math.max(1, Math.min(20, Number(payload.iterations ?? 5)));
  const stopScore = Math.max(0, Math.min(100, Number(payload.stopScore ?? 95)));
  const evaluationProfile = LOOPLAB_LOOP_EVALUATION_PROFILE_IDS.includes(payload.evaluationProfile) ? payload.evaluationProfile : "auto";
  const requestedFramework = String(payload.framework ?? payload.runtimePreference ?? "auto");
  const runtimePreference = ["auto", "canvas", "phaser", "pixi", "melon"].includes(requestedFramework) ? requestedFramework : "auto";
  const narrativeMode = ["auto", "include", "exclude"].includes(payload.narrativeMode) ? payload.narrativeMode : "auto";
  const strategy = ["improve", "explore", "cycle"].includes(payload.strategy) ? payload.strategy : "improve";
  const conditions = Array.isArray(payload.conditions) ? payload.conditions.map((condition) => String(condition).trim()).filter(Boolean).slice(0, 30) : [];
  const requestedContextBudget = Number(payload.contextBudgetTokens ?? LOOPLAB_PROVIDER_CONTEXT_POLICY.defaultRoughTokenBudget);
  const contextBudgetTokens = Number.isFinite(requestedContextBudget)
    ? Math.max(LOOPLAB_PROVIDER_CONTEXT_POLICY.minimumRoughTokenBudget, Math.min(LOOPLAB_PROVIDER_CONTEXT_POLICY.maximumRoughTokenBudget, Math.floor(requestedContextBudget)))
    : LOOPLAB_PROVIDER_CONTEXT_POLICY.defaultRoughTokenBudget;
  const artDirection = normalizeArtDirectionPolicy({ mode: payload.artDirectionMode ?? payload.artDirection?.mode, locks: payload.styleLocks ?? payload.artDirection?.locks });
  const preferenceContext = payload.preferenceContext ? normalizeAppliedPreferenceContext(payload.preferenceContext) : null;
  const jobDirectory = await mkdtemp(join(tmpdir(), "looplab-companion-"));
  const projectPath = join(jobDirectory, "candidate.loop.json");
  const preferenceContextPath = preferenceContext ? join(jobDirectory, "preference-context.json") : null;
  try {
    await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
    if (preferenceContextPath) await writeFile(preferenceContextPath, `${JSON.stringify(preferenceContext, null, 2)}\n`, "utf8");
  } catch (error) {
    await rm(jobDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  const id = globalThis.crypto.randomUUID();
  const preferenceReceipt = preferenceContext ? { enabled: preferenceContext.enabled, selectedEntryIds: preferenceContext.selectedEntryIds, excludedEntryIds: preferenceContext.excludedEntryIds, receiptDigest: preferenceContext.receiptDigest } : null;
  const job = { id, requestedProvider, provider, providerRoute, providerFailover: null, status: "starting", createdAt: new Date().toISOString(), projectPath, jobDirectory, contextBudgetTokens, evaluationProfile, runtimePreference, narrativeMode, preferenceReceipt, providerParity: null, passPlan: null, activePass: null, passPlanStatus: null, remainingPassIds: [], events: [], listeners: new Set(), child: null, result: null, usage: null, error: null };
  jobs.set(id, job);
  pushEvent(job, { type: "provider.route.selected", requestedProvider, provider, providerMode: providerRoute.mode, fallbackUsed: providerRoute.fallbackUsed, candidates: providerCandidates, message: providerRoute.selectionReason });
  pushEvent(job, { type: "companion.started", requestedProvider, provider, providerMode: providerRoute.mode, iterations, stopScore, strategy, conditions, artDirection, preferenceReceipt, contextBudgetTokens, evaluationProfile, runtimePreference, narrativeMode, message: `Starting ${provider} loop with ${evaluationProfile} evaluation, ${runtimePreference} runtime routing, and ${narrativeMode} narrative routing` });
  const argumentsForLoop = [
    loopScript,
    "--provider", provider,
    "--requested-provider", requestedProvider,
    "--provider-mode", providerRoute.mode,
    "--provider-fallbacks", providerCandidates.join("|"),
    "--project", projectPath,
    "--iterations", String(iterations),
    "--goal", goal,
    "--stop-score", String(stopScore),
    "--evaluation-profile", evaluationProfile,
    "--strategy", strategy,
    "--conditions", conditions.join("|"),
    "--context-budget-tokens", String(contextBudgetTokens),
    "--art-direction-mode", artDirection.mode,
    "--style-locks", artDirection.locks.join("|"),
    "--track", String(payload.track ?? "gameplay"),
    "--framework", runtimePreference,
    "--narrative", narrativeMode,
  ];
  if (preferenceContextPath) argumentsForLoop.push("--preference-context", preferenceContextPath);
  let child;
  try {
    child = spawn(process.execPath, argumentsForLoop, { cwd: jobDirectory, env: providerExecutionEnvironment(provider, providerScan), windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    await cleanupJobDirectory(job);
    throw error;
  }
  job.child = child;
  job.status = "running";
  let stdoutBuffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines.filter(Boolean)) {
      try {
        const event = JSON.parse(line);
        if (event.type === "loop.completed" && event.usage) job.usage = event.usage;
        if (event.type === "provider.requested" && event.provider) job.provider = event.provider;
        if (event.type === "provider.parity.locked") job.providerParity = event.receipt ?? null;
        if ((event.type === "provider.failover.started" || event.type === "provider.route.completed") && event.provider) job.provider = event.provider;
        if (event.type === "provider.pass-plan.prepared") job.passPlan = event.plan ?? null;
        if (event.type === "provider.pass.started") job.activePass = { planId: event.planId, passId: event.passId, order: event.order, passCount: event.passCount, label: event.label };
        if (event.type === "loop.completed") {
          if (event.provider) job.provider = event.provider;
          job.providerFailover = event.providerFailover ?? null;
          job.passPlanStatus = event.passPlanStatus ?? null;
          job.remainingPassIds = event.remainingPassIds ?? [];
        }
        pushEvent(job, event);
      }
      catch { pushEvent(job, { type: "agent.output", message: line }); }
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => pushEvent(job, { type: "agent.stderr", message: String(chunk).trim() }));
  child.on("error", (error) => {
    job.status = "failed";
    job.error = sanitizeConnectionLine(error.message);
    pushEvent(job, { type: "companion.failed", error: job.error });
    void cleanupJobDirectory(job);
    releaseAiOperation(reservation);
    closeListeners(job);
  });
  child.on("close", async (code) => {
    if (stdoutBuffer.trim()) {
      try {
        const event = JSON.parse(stdoutBuffer.trim());
        if (event.type === "loop.completed" && event.usage) job.usage = event.usage;
        if (event.type === "provider.requested" && event.provider) job.provider = event.provider;
        if (event.type === "provider.parity.locked") job.providerParity = event.receipt ?? null;
        if ((event.type === "provider.failover.started" || event.type === "provider.route.completed") && event.provider) job.provider = event.provider;
        if (event.type === "provider.pass-plan.prepared") job.passPlan = event.plan ?? null;
        if (event.type === "provider.pass.started") job.activePass = { planId: event.planId, passId: event.passId, order: event.order, passCount: event.passCount, label: event.label };
        if (event.type === "loop.completed") {
          if (event.provider) job.provider = event.provider;
          job.providerFailover = event.providerFailover ?? null;
          job.passPlanStatus = event.passPlanStatus ?? null;
          job.remainingPassIds = event.remainingPassIds ?? [];
        }
        pushEvent(job, event);
      }
      catch { pushEvent(job, { type: "agent.output", message: stdoutBuffer.trim() }); }
    }
    if (code === 0) {
      try {
        job.result = JSON.parse(await readFile(projectPath, "utf8"));
        job.status = "completed";
        const loopOutcome = [...job.events].reverse().find((event) => event.type === "loop.completed");
        job.usage = loopOutcome?.usage ?? job.usage;
        const lifecycleStatus = loopOutcome?.lifecycleStatus ?? job.result.iteration?.status ?? "candidate";
        const verified = lifecycleStatus === "verified" || lifecycleStatus === "promoted";
        const changed = loopOutcome?.changed !== false && Number(loopOutcome?.accepted ?? 0) > 0;
        const outcome = changed ? loopOutcome?.outcome ?? (verified ? "verified-candidate" : "candidate-awaiting-browser-evidence") : "no-accepted-candidate";
        pushEvent(job, {
          type: "companion.completed",
          message: changed ? (verified ? "A verified candidate is ready" : "An accepted candidate is ready for browser evidence and verification") : "No AI candidate passed; the project was not changed",
          outcome,
          changed,
          accepted: Number(loopOutcome?.accepted ?? 0),
          rejected: Number(loopOutcome?.rejected ?? 0),
          lifecycleStatus,
          verificationRequired: changed && !verified,
          nextRequiredAction: loopOutcome?.nextRequiredAction ?? (changed ? (verified ? "promote-or-export" : "run-browser-qa") : "none"),
          passPlanStatus: job.passPlanStatus,
          remainingPassIds: job.remainingPassIds,
          usage: job.usage,
          usageMessage: loopOutcome?.usageMessage ?? null,
          resultAvailable: true,
        });
      } catch (error) {
        job.status = "failed";
        job.error = sanitizeConnectionLine(error.message);
        pushEvent(job, { type: "companion.failed", error: job.error });
      }
    } else if (job.status !== "cancelled") {
      job.status = "failed";
      job.error = `AI loop exited with code ${code}`;
      pushEvent(job, { type: "companion.failed", error: job.error });
    }
    await cleanupJobDirectory(job);
    releaseAiOperation(reservation);
    closeListeners(job);
  });
  return job;
}

async function startResearchJob(payload) {
  const reservation = reserveAiOperation("research");
  try {
    return await startReservedResearchJob(payload, reservation);
  } catch (error) {
    releaseAiOperation(reservation);
    throw error;
  }
}

async function startReservedResearchJob(payload, reservation) {
  const requestedProvider = ["openai", "anthropic", "codex", "claude"].includes(payload?.requestedProvider)
    ? payload.requestedProvider
    : ["openai", "anthropic", "codex", "claude"].includes(payload?.provider)
      ? payload.provider
      : payload?.provider === "auto" || payload?.provider === undefined
        ? "auto"
        : null;
  if (!requestedProvider) throw new Error("provider must be auto, openai, anthropic, codex, or claude.");
  const providerScan = await getProviderScan({ force: true });
  const providerRoute = providerRouteForPayload({ ...payload, requestedProvider }, providerScan);
  const provider = providerRoute.selectedProvider;
  const query = String(payload.query ?? "").trim().slice(0, 5_000);
  if (!query) throw new Error("query must not be empty.");
  const depth = ["quick", "standard", "deep", "exhaustive"].includes(payload.depth) ? payload.depth : "standard";
  const engine = ["source-command-sc-research", "game-studio", "web-game-foundations", "openai-docs", "provider-native"].includes(payload.engine) ? payload.engine : "source-command-sc-research";
  const preset = String(payload.preset ?? "custom").trim().slice(0, 80) || "custom";
  const gameBrief = String(payload.gameBrief ?? "").trim().slice(0, 20_000);
  const jobDirectory = await mkdtemp(join(tmpdir(), "looplab-research-"));
  const inputPath = join(jobDirectory, "research-input.json");
  const outputPath = join(jobDirectory, "research-report.json");
  await writeFile(inputPath, `${JSON.stringify({ query, depth, engine, preset, gameBrief }, null, 2)}\n`, "utf8");
  const id = globalThis.crypto.randomUUID();
  const providerCandidates = providerRoute.candidates.filter((candidate) => candidate.ready).map((candidate) => candidate.provider);
  const job = { id, kind: "research", requestedProvider, provider, providerRoute, providerFailover: null, providerCandidates, providerAttempts: [], usageReceipts: [], status: "starting", createdAt: new Date().toISOString(), inputPath, outputPath, jobDirectory, events: [], listeners: new Set(), child: null, result: null, usage: null, error: null, finished: false };
  researchJobs.set(id, job);
  pushEvent(job, { type: "provider.route.selected", requestedProvider, provider, fallbackUsed: providerRoute.fallbackUsed, message: providerRoute.selectionReason });
  const finalizeResearchJob = async () => {
    if (job.finished) return;
    job.finished = true;
    await rm(jobDirectory, { recursive: true, force: true }).catch(() => {});
    releaseAiOperation(reservation);
    closeListeners(job);
  };
  const launchResearchAttempt = async (providerIndex) => {
    if (job.status === "cancelled") return finalizeResearchJob();
    const attemptProvider = providerCandidates[providerIndex];
    if (!attemptProvider) {
      job.status = "failed";
      job.error = "Every eligible research provider path failed.";
      pushEvent(job, { type: "companion.research.failed", error: job.error, providerFailover: job.providerFailover });
      return finalizeResearchJob();
    }
    job.provider = attemptProvider;
    job.status = "running";
    await rm(outputPath, { force: true }).catch(() => {});
    pushEvent(job, { type: "companion.research.started", requestedProvider, provider: attemptProvider, providerPathAttempt: providerIndex + 1, depth, engine, preset, message: `Starting ${engine} with ${attemptProvider}` });
    const child = spawn(process.execPath, [researchScript, "--provider", attemptProvider, "--input", inputPath, "--output", outputPath, "--report-dir", researchReportDirectory], { cwd: jobDirectory, env: providerExecutionEnvironment(attemptProvider, providerScan), windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    job.child = child;
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let attemptUsage = null;
    let settled = false;
    const consumeStdoutLine = (line) => {
      if (!line) return;
      try {
        const event = JSON.parse(line);
        if (event.receipt) attemptUsage = event.receipt;
        pushEvent(job, { ...event, provider: event.provider ?? attemptProvider, providerPathAttempt: providerIndex + 1 });
      } catch { pushEvent(job, { type: "research.output", provider: attemptProvider, providerPathAttempt: providerIndex + 1, message: line }); }
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) consumeStdoutLine(line);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderrBuffer = `${stderrBuffer}${chunk}`.slice(-100_000);
      const message = sanitizeConnectionLine(String(chunk).trim());
      if (message) pushEvent(job, { type: "research.stderr", provider: attemptProvider, providerPathAttempt: providerIndex + 1, message });
    });
    const finishAttempt = async (code, launchError = null) => {
      if (settled) return;
      settled = true;
      if (stdoutBuffer.trim()) consumeStdoutLine(stdoutBuffer.trim());
      if (job.status === "cancelled") return finalizeResearchJob();
      let result = null;
      let failureReason = launchError ? sanitizeConnectionLine(launchError.message) : "";
      if (!launchError && code === 0) {
        try { result = JSON.parse(await readFile(outputPath, "utf8")); }
        catch (error) { failureReason = sanitizeConnectionLine(`Research provider returned invalid JSON: ${error.message}`); }
      } else if (!failureReason) {
        const diagnostic = providerFailureFromProcessOutput(stderrBuffer || stdoutBuffer);
        failureReason = diagnostic.message || `Research exited with code ${code}`;
        attemptUsage = diagnostic.receipt ?? attemptUsage;
      }
      if (result && typeof result === "object" && !Array.isArray(result)) {
        const receipt = result.usage ?? attemptUsage;
        if (receipt) job.usageReceipts.push(receipt);
        job.providerAttempts.push({ provider: attemptProvider, status: "completed", reason: null, usage: receipt ?? null });
        job.providerFailover = createProviderFailoverReceipt({ requestedProvider, mode: providerRoute.mode, selectedProvider: attemptProvider, attempts: job.providerAttempts });
        job.result = { ...result, requestedProvider, provider: attemptProvider, providerFailover: job.providerFailover };
        job.usage = job.usageReceipts.length > 1 ? aggregateUsageReceipts(job.usageReceipts, { provider: "mixed", model: "multiple", label: "research-failover-total" }) : receipt ?? null;
        job.status = "completed";
        job.error = null;
        pushEvent(job, { type: "companion.research.completed", requestedProvider, provider: attemptProvider, fallbackUsed: job.providerFailover.fallbackUsed, message: "Research report and suggestions are ready", resultAvailable: true, reportId: job.result.id, usage: job.usage, providerFailover: job.providerFailover });
        return finalizeResearchJob();
      }
      if (!failureReason) failureReason = "Research provider returned an invalid structured result.";
      if (attemptUsage) job.usageReceipts.push(attemptUsage);
      job.providerAttempts.push({ provider: attemptProvider, status: "failed", reason: failureReason, usage: attemptUsage });
      job.providerFailover = createProviderFailoverReceipt({ requestedProvider, mode: providerRoute.mode, selectedProvider: null, attempts: job.providerAttempts });
      const nextProvider = providerCandidates[providerIndex + 1] ?? null;
      if (providerRoute.mode !== "strict" && nextProvider && isRetryableProviderPathFailure(failureReason)) {
        pushEvent(job, { type: "provider.failover.started", requestedProvider, failedProvider: attemptProvider, provider: nextProvider, reason: failureReason, message: `${attemptProvider} research failed before a report was accepted; retrying the unchanged request with ${nextProvider}.` });
        return launchResearchAttempt(providerIndex + 1);
      }
      job.usage = job.usageReceipts.length > 1 ? aggregateUsageReceipts(job.usageReceipts, { provider: "mixed", model: "multiple", label: "research-failover-total" }) : job.usageReceipts[0] ?? null;
      job.status = "failed";
      job.error = failureReason || `Research exited with code ${code}`;
      pushEvent(job, { type: "companion.research.failed", requestedProvider, provider: attemptProvider, error: job.error, usage: job.usage, providerFailover: job.providerFailover });
      return finalizeResearchJob();
    };
    child.on("error", (error) => { void finishAttempt(null, error); });
    child.on("close", (code) => { void finishAttempt(code); });
  };
  void launchResearchAttempt(0);
  return job;
}

async function startVisualCritiqueJob(payload) {
  const reservation = reserveAiOperation("visual-critique");
  let jobDirectory = null;
  try {
    const requestedProvider = ["openai", "anthropic", "codex", "claude"].includes(payload?.requestedProvider)
      ? payload.requestedProvider
      : ["openai", "anthropic", "codex", "claude"].includes(payload?.provider)
        ? payload.provider
        : null;
    if (!requestedProvider) throw new Error("visual critique provider must be openai, anthropic, codex, or claude so image consent names a provider family.");
    const providerScan = await getProviderScan({ force: true });
    const visualConsentProviders = providerFamilyPaths(requestedProvider);
    const providerRoute = providerRouteForPayload({ ...payload, requestedProvider }, providerScan, { eligibleProviders: visualConsentProviders });
    const provider = providerRoute.selectedProvider;
    const request = normalizeVisualCritiqueRequest(payload);
    jobDirectory = await mkdtemp(join(tmpdir(), "looplab-visual-critique-"));
    const inputPath = join(jobDirectory, "visual-critique-input.json");
    const outputPath = join(jobDirectory, "visual-critique-result.json");
    await writeFile(inputPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");
    const id = globalThis.crypto.randomUUID();
    const providerCandidates = providerRoute.candidates.filter((candidate) => candidate.ready).map((candidate) => candidate.provider);
    const job = {
      id,
      kind: "visual-critique",
      requestedProvider,
      provider,
      providerRoute,
      providerFailover: null,
      providerCandidates,
      providerAttempts: [],
      usageReceipts: [],
      status: "starting",
      createdAt: new Date().toISOString(),
      request: publicVisualCritiqueRequest(request),
      inputPath,
      outputPath,
      jobDirectory,
      events: [],
      listeners: new Set(),
      child: null,
      result: null,
      usage: null,
      error: null,
      finished: false,
    };
    visualCritiqueJobs.set(id, job);
    pushEvent(job, { type: "provider.route.selected", requestedProvider, provider, fallbackUsed: providerRoute.fallbackUsed, message: providerRoute.selectionReason });
    const finalizeVisualCritiqueJob = async () => {
      if (job.finished) return;
      job.finished = true;
      await rm(jobDirectory, { recursive: true, force: true }).catch(() => {});
      job.inputPath = null;
      job.outputPath = null;
      job.jobDirectory = null;
      job.child = null;
      releaseAiOperation(reservation);
      closeListeners(job);
    };
    const launchVisualCritiqueAttempt = async (providerIndex) => {
      if (job.status === "cancelled") return finalizeVisualCritiqueJob();
      const attemptProvider = providerCandidates[providerIndex];
      if (!attemptProvider) {
        job.status = "failed";
        job.error = "Every consent-compatible visual-critique provider path failed.";
        pushEvent(job, { type: "companion.visual-critique.failed", error: job.error, providerFailover: job.providerFailover });
        return finalizeVisualCritiqueJob();
      }
      job.provider = attemptProvider;
      job.status = "running";
      await rm(outputPath, { force: true }).catch(() => {});
      pushEvent(job, { type: "companion.visual-critique.started", requestedProvider, provider: attemptProvider, providerPathAttempt: providerIndex + 1, sourceDigest: request.sourceDigest, captureSetDigest: request.captureSetDigest, captureCount: request.captures.length, message: "Starting consent-bound visual critique" });
      const child = spawn(process.execPath, [visualCritiqueScript, "--provider", attemptProvider, "--input", inputPath, "--output", outputPath], {
        cwd: jobDirectory,
        env: providerExecutionEnvironment(attemptProvider, providerScan),
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      job.child = child;
      let stdoutBuffer = "";
      let stderrBuffer = "";
      let attemptUsage = null;
      let settled = false;
      const consumeStdoutLine = (line) => {
        if (!line) return;
        try {
          const event = JSON.parse(line);
          if (event.receipt) attemptUsage = event.receipt;
          pushEvent(job, { ...event, provider: event.provider ?? attemptProvider, providerPathAttempt: providerIndex + 1 });
        } catch { pushEvent(job, { type: "visual-critique.output", provider: attemptProvider, providerPathAttempt: providerIndex + 1, message: sanitizeConnectionLine(line) }); }
      };
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) consumeStdoutLine(line);
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderrBuffer = `${stderrBuffer}${chunk}`.slice(-100_000);
        const message = sanitizeConnectionLine(String(chunk).trim());
        if (message) pushEvent(job, { type: "visual-critique.stderr", provider: attemptProvider, providerPathAttempt: providerIndex + 1, message });
      });
      const finishAttempt = async (code, launchError = null) => {
        if (settled) return;
        settled = true;
        if (stdoutBuffer.trim()) consumeStdoutLine(stdoutBuffer.trim());
        if (job.status === "cancelled") return finalizeVisualCritiqueJob();
        let result = null;
        let failureReason = launchError ? sanitizeConnectionLine(launchError.message) : "";
        if (!launchError && code === 0) {
          try { result = JSON.parse(await readFile(outputPath, "utf8")); }
          catch (error) { failureReason = sanitizeConnectionLine(`Visual-critique provider returned invalid JSON: ${error.message}`); }
        } else if (!failureReason) {
          const diagnostic = providerFailureFromProcessOutput(stderrBuffer || stdoutBuffer);
          failureReason = diagnostic.message || `Visual critique exited with code ${code}`;
          attemptUsage = diagnostic.receipt ?? attemptUsage;
        }
        if (result && typeof result === "object" && !Array.isArray(result)) {
          const receipt = result.usage ?? attemptUsage;
          if (receipt) job.usageReceipts.push(receipt);
          job.providerAttempts.push({ provider: attemptProvider, status: "completed", reason: null, usage: receipt ?? null });
          job.providerFailover = createProviderFailoverReceipt({ requestedProvider, mode: providerRoute.mode, selectedProvider: attemptProvider, attempts: job.providerAttempts });
          job.result = { ...result, requestedProvider, provider: attemptProvider, providerFailover: job.providerFailover };
          job.usage = job.usageReceipts.length > 1 ? aggregateUsageReceipts(job.usageReceipts, { provider: "mixed", model: "multiple", label: "visual-critique-failover-total" }) : receipt ?? null;
          job.status = "completed";
          job.error = null;
          pushEvent(job, { type: "companion.visual-critique.completed", requestedProvider, provider: attemptProvider, fallbackUsed: job.providerFailover.fallbackUsed, message: "Grounded visual critique is ready; it remains advisory and non-verifying", resultAvailable: true, sourceDigest: job.result.sourceDigest, captureSetDigest: job.result.captureSetDigest, critiqueDigest: job.result.critiqueDigest, issueCount: job.result.issues?.length ?? 0, usage: job.usage, providerFailover: job.providerFailover });
          return finalizeVisualCritiqueJob();
        }
        if (!failureReason) failureReason = "Visual-critique provider returned an invalid structured result.";
        if (attemptUsage) job.usageReceipts.push(attemptUsage);
        job.providerAttempts.push({ provider: attemptProvider, status: "failed", reason: failureReason, usage: attemptUsage });
        job.providerFailover = createProviderFailoverReceipt({ requestedProvider, mode: providerRoute.mode, selectedProvider: null, attempts: job.providerAttempts });
        const nextProvider = providerCandidates[providerIndex + 1] ?? null;
        if (providerRoute.mode !== "strict" && nextProvider && isRetryableProviderPathFailure(failureReason)) {
          pushEvent(job, { type: "provider.failover.started", requestedProvider, failedProvider: attemptProvider, provider: nextProvider, reason: failureReason, consentBoundary: "same-provider-family-only", message: `${attemptProvider} visual critique failed before a result was accepted; retrying through the consent-compatible ${nextProvider} transport.` });
          return launchVisualCritiqueAttempt(providerIndex + 1);
        }
        job.usage = job.usageReceipts.length > 1 ? aggregateUsageReceipts(job.usageReceipts, { provider: "mixed", model: "multiple", label: "visual-critique-failover-total" }) : job.usageReceipts[0] ?? null;
        job.status = "failed";
        job.error = failureReason || `Visual critique exited with code ${code}`;
        pushEvent(job, { type: "companion.visual-critique.failed", requestedProvider, provider: attemptProvider, error: job.error, usage: job.usage, providerFailover: job.providerFailover });
        return finalizeVisualCritiqueJob();
      };
      child.on("error", (error) => { void finishAttempt(null, error); });
      child.on("close", (code) => { void finishAttempt(code); });
    };
    void launchVisualCritiqueAttempt(0);
    return job;
  } catch (error) {
    if (jobDirectory) await rm(jobDirectory, { recursive: true, force: true }).catch(() => {});
    releaseAiOperation(reservation);
    throw error;
  }
}

async function startLocalCopilotJob(payload) {
  if (localCopilotOperationActive) throw requestError(409, "A local copilot request is already starting or running. Wait for the original start response, then resume or cancel its durable job ID.");
  localCopilotOperationActive = true;
  try {
    const localCopilot = await getLocalCopilotScan({ force: true });
    if (!localCopilot.ready) throw new Error(localCopilot.detail);
    const request = normalizeLocalCopilotRequest(payload);
    const id = globalThis.crypto.randomUUID();
    const controller = new AbortController();
    const job = {
      id,
      kind: "local-copilot",
      status: "running",
      createdAt: new Date().toISOString(),
      request: { mode: request.mode, task: request.task, sourceDigest: request.sourceDigest, model: request.model, contextCharacters: request.contextCharacters },
      engine: localCopilot.engine,
      model: request.model ?? localCopilot.model,
      events: [],
      listeners: new Set(),
      controller,
      result: null,
      usage: null,
      error: null,
    };
    localCopilotJobs.set(id, job);
    pushEvent(job, { type: "local-copilot.job.started", engine: job.engine, model: job.model, mode: request.mode, message: "Bounded advisory work accepted; the selected game will not be mutated." });

    void (async () => {
      try {
        pushEvent(job, { type: "local-copilot.inference.started", message: "Local structured inference is running. Monitor this job ID instead of resubmitting it." });
        job.result = await runLocalCopilot(request, { status: localCopilot, env: providerRuntimeEnv, signal: controller.signal });
        if (job.status === "cancelled") return;
        job.usage = job.result.usage;
        job.status = "completed";
        pushEvent(job, { type: "local-copilot.job.completed", resultAvailable: true, taskDigest: job.result.taskDigest, usage: job.usage, message: "Local advisory result is ready; canonical LoopLab validation is still required." });
      } catch (error) {
        if (job.status === "cancelled" || error?.name === "AbortError") {
          job.status = "cancelled";
          pushEvent(job, { type: "local-copilot.job.cancelled", message: "Local advisory work was cancelled; the selected game is unchanged." });
        } else {
          job.status = "failed";
          job.error = sanitizeConnectionLine(error instanceof Error ? error.message : String(error));
          pushEvent(job, { type: "local-copilot.job.failed", error: job.error, message: "Local advisory work failed; the selected game is unchanged." });
        }
      } finally {
        job.controller = null;
        localCopilotOperationActive = false;
        closeListeners(job);
      }
    })();
    return job;
  } catch (error) {
    localCopilotOperationActive = false;
    throw error;
  }
}
const server = createServer(async (request, response) => {
  if (!isAllowedCompanionHost(request.headers, PORT)) return sendJson(response, 421, { ok: false, error: "Host is not a Looplab loopback companion address." });
  const cors = corsHeaders(request);
  if (!cors.allowed) return sendJson(response, 403, { ok: false, error: "Origin is not allowed by the local Looplab companion." }, cors.headers);
  if (request.method === "OPTIONS") {
    response.writeHead(204, cors.headers);
    response.end();
    return;
  }
  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  const mutationRequest = request.method === "POST" || request.method === "PUT" || request.method === "DELETE";
  const protectedRead = request.method === "GET" && isProtectedCompanionReadPath(url.pathname);
  if ((mutationRequest || protectedRead) && !hasValidCompanionSession(request.headers, SESSION_TOKEN)) {
    return sendJson(response, 401, { ok: false, error: `A valid ${LOOPLAB_SESSION_HEADER} header is required for companion mutations and protected job reads.` }, cors.headers);
  }
  try {
    if (request.method === "GET" && url.pathname === "/lifecycle/browser-bootstrap") {
      if (request.headers.origin || request.headers["x-looplab-bootstrap"] !== "server-layout") {
        return sendJson(response, 403, { ok: false, error: "Companion browser bootstrap is available only to the local Looplab server layout." }, cors.headers);
      }
      return sendJson(response, 200, { ok: true, url: companionUrl, sessionId: companionSession.sessionId, token: SESSION_TOKEN }, {
        ...cors.headers,
        "Content-Security-Policy": "default-src 'none'",
        "Cross-Origin-Resource-Policy": "same-site",
        "X-Content-Type-Options": "nosniff",
      });
    }
    if (request.method === "GET" && url.pathname === "/health") {
      // Health is polled frequently by the UI. Keep the last verified provider
      // state stable here; explicit Scan, login, key-save, and job-start paths
      // still force a fresh provider check.
      const [scan, localCopilot] = await Promise.all([
        getProviderScan({ allowStale: true }),
        getLocalCopilotScan({ allowStale: true }),
      ]);
      const activeProviderConnections = [...providerConnections.values()]
        .filter((connection) => connection.status === "running")
        .map((connection) => ({ id: connection.id, provider: connection.provider, status: connection.status, createdAt: connection.createdAt, eventsUrl: `/provider-connections/${connection.id}/events`, cancelUrl: `/provider-connections/${connection.id}/cancel` }));
      return sendJson(response, 200, { ok: true, name: "Looplab AI Companion", version: LOOPLAB_COMPANION_VERSION, protocolVersion: LOOPLAB_PROTOCOL_VERSION, sessionId: companionSession.sessionId, mutationAuth: { required: true, header: LOOPLAB_SESSION_HEADER }, sharedProjectStore: { schemaVersion: sharedProjectStore.schemaVersion, mounted: true, relativeRoot: sharedProjectStore.policy.relativeRoot, staleWritePolicy: sharedProjectStore.policy.concurrency }, ...scan, localCopilot, activeJobs: [...jobs.values()].filter((job) => job.status === "running").length, activeResearchJobs: [...researchJobs.values()].filter((job) => job.status === "running").length, activeVisualCritiqueJobs: [...visualCritiqueJobs.values()].filter((job) => job.status === "running").length, activeAssetJobs: [...assetJobs.values()].filter((job) => job.status === "running").length, activeReleaseVerificationJobs: [...releaseVerificationJobs.values()].filter((job) => job.status === "running").length, activeLocalCopilotJobs: Number(localCopilotOperationActive), activePromptGenerations: promptGenerationActive ? 1 : 0, activeAiOperations: activeAiOperation ? 1 : 0, activeAiOperation: activeAiOperation ? { kind: activeAiOperation.kind, startedAt: activeAiOperation.startedAt } : null, activeConnections: activeProviderConnections.length, activeProviderConnections, activeAgentPresences: agentPresenceRegistry.size() }, cors.headers);
    }
    if (request.method === "GET" && url.pathname === "/agent-presence") {
      return sendJson(response, 200, { ok: true, ...agentPresenceRegistry.list({ projectId: url.searchParams.get("projectId") ?? undefined }) }, cors.headers);
    }
    if (request.method === "POST" && url.pathname === "/agent-presence") {
      const presence = agentPresenceRegistry.register(await readJsonBody(request));
      return sendJson(response, presence.created ? 201 : 200, { ok: true, ...presence }, cors.headers);
    }
    const agentPresenceLeaveMatch = url.pathname.match(/^\/agent-presence\/([^/]+)\/leave$/);
    if (request.method === "POST" && agentPresenceLeaveMatch) {
      const payload = await readJsonBody(request);
      const left = agentPresenceRegistry.leave({ presenceId: decodeURIComponent(agentPresenceLeaveMatch[1]), leaseToken: payload.leaseToken });
      return sendJson(response, 200, { ok: true, ...left }, cors.headers);
    }
    if (request.method === "GET" && url.pathname === "/projects") {
      return sendJson(response, 200, { ok: true, ...(await sharedProjectStore.list()) }, cors.headers);
    }
    const sharedProjectMatch = url.pathname.match(/^\/projects\/([^/]+)$/);
    if (sharedProjectMatch && request.method === "GET") {
      const stored = await sharedProjectStore.get(decodeURIComponent(sharedProjectMatch[1]));
      return sendJson(response, 200, { ok: true, ...stored }, { ...cors.headers, ETag: `"${stored.revisionDigest}"` });
    }
    if (sharedProjectMatch && request.method === "PUT") {
      const payload = await readJsonBody(request);
      const headerExpected = conditionalRevisionDigest(request.headers["if-match"], "If-Match");
      const bodyExpected = payload?.expectedRevisionDigest ? String(payload.expectedRevisionDigest) : null;
      if (headerExpected && bodyExpected && headerExpected !== bodyExpected) {
        throw requestError(400, "If-Match and expectedRevisionDigest must identify the same shared revision.", {
          code: "shared-project-condition-mismatch",
          path: "/expectedRevisionDigest",
          expected: headerExpected,
          got: bodyExpected,
          repairAction: "Read the shared project again and send one unchanged revisionDigest through both surfaces.",
        });
      }
      const ifNoneMatch = String(request.headers["if-none-match"] ?? "").trim();
      if (ifNoneMatch && ifNoneMatch !== "*") {
        throw requestError(400, "If-None-Match supports only * for create-only shared project writes.", {
          code: "shared-project-condition-invalid",
          path: "/headers/if-none-match",
          got: ifNoneMatch.slice(0, 160),
          repairAction: "Use If-None-Match: * only when the stable project ID must not already exist.",
        });
      }
      const stored = await sharedProjectStore.put({ id: decodeURIComponent(sharedProjectMatch[1]), project: payload?.project, expectedRevisionDigest: headerExpected ?? bodyExpected, createOnly: payload?.createOnly === true || ifNoneMatch === "*", metadata: payload?.metadata });
      const result = { ok: true, schemaVersion: stored.schemaVersion, summary: stored.summary, sourceDigest: stored.sourceDigest, revisionDigest: stored.revisionDigest, validation: stored.validation, created: stored.created, changed: stored.changed, idempotent: stored.idempotent, encodedBytes: stored.encodedBytes };
      return sendJson(response, stored.created ? 201 : 200, result, { ...cors.headers, ETag: `"${stored.revisionDigest}"` });
    }
    if (request.method === "POST" && url.pathname === "/lifecycle/shutdown") {
      if (request.headers.origin) return sendJson(response, 403, { ok: false, error: "Companion lifecycle requests are launcher-only." }, cors.headers);
      const payload = await readJsonBody(request);
      const expectedProtocolVersion = String(payload.expectedProtocolVersion ?? "");
      if (!/^\d+\.\d+\.\d+$/.test(expectedProtocolVersion)) return sendJson(response, 400, { ok: false, error: "expectedProtocolVersion must be a semantic protocol version." }, cors.headers);
      const activeCount = Number(Boolean(activeAiOperation)) + [...providerConnections.values()].filter((connection) => connection.status === "running").length + [...releaseVerificationJobs.values()].filter((job) => job.status === "running").length + Number(localCopilotOperationActive);
      if (activeCount > 0) return sendJson(response, 409, { ok: false, error: "The companion cannot be replaced while an operation is active.", activeCount }, cors.headers);
      if (expectedProtocolVersion === LOOPLAB_PROTOCOL_VERSION) return sendJson(response, 409, { ok: false, error: "The companion protocol is already current." }, cors.headers);
      sendJson(response, 202, { ok: true, status: "shutting-down", protocolVersion: LOOPLAB_PROTOCOL_VERSION }, cors.headers);
      setTimeout(() => server.close(() => process.exit(0)), 25).unref();
      return;
    }
    if (request.method === "GET" && url.pathname === "/providers") {
      const force = url.searchParams.get("refresh") === "1";
      const [scan, localCopilot] = await Promise.all([getProviderScan({ force }), getLocalCopilotScan({ force })]);
      return sendJson(response, 200, { ok: true, ...scan, localCopilot }, cors.headers);
    }
    if (request.method === "GET" && url.pathname === "/local-copilot") {
      const localCopilot = await getLocalCopilotScan({ force: url.searchParams.get("refresh") === "1" });
      return sendJson(response, 200, { ok: true, localCopilot }, cors.headers);
    }
    const providerConnectMatch = url.pathname.match(/^\/providers\/(codex|claude|openai|anthropic)\/connect$/);
    if (request.method === "POST" && providerConnectMatch) {
      const started = await startProviderConnection(providerConnectMatch[1]);
      return sendJson(response, started.resumed ? 200 : 202, { ok: true, resumed: started.resumed, connectionId: started.connection.id, eventsUrl: `/provider-connections/${started.connection.id}/events`, cancelUrl: `/provider-connections/${started.connection.id}/cancel` }, cors.headers);
    }
    const providerKeyMatch = url.pathname.match(/^\/providers\/(openai|anthropic)\/key$/);
    if (request.method === "POST" && providerKeyMatch) {
      let key = await readProviderKeyBody(request);
      try {
        const saved = await saveApiKeyFromBrowser(providerKeyMatch[1], key);
        return sendJson(response, 200, { ok: true, provider: providerKeyMatch[1], state: saved.status.state, ready: saved.status.ready, summary: saved.status.summary }, cors.headers);
      } finally {
        key = "";
      }
    }
    const providerEventsMatch = url.pathname.match(/^\/provider-connections\/([^/]+)\/events$/);
    if (request.method === "GET" && providerEventsMatch) {
      const connection = providerConnections.get(providerEventsMatch[1]);
      if (!connection) return sendJson(response, 404, { ok: false, error: "Provider connection was not found." }, cors.headers);
      response.writeHead(200, { ...cors.headers, "Content-Type": "text/event-stream; charset=utf-8", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
      for (const event of connection.events) response.write(`data: ${JSON.stringify(event)}\n\n`);
      if (["completed", "failed", "cancelled"].includes(connection.status)) return response.end();
      connection.listeners.add(response);
      request.on("close", () => connection.listeners.delete(response));
      return;
    }
    const providerCancelMatch = url.pathname.match(/^\/provider-connections\/([^/]+)\/cancel$/);
    if (request.method === "POST" && providerCancelMatch) {
      const connection = providerConnections.get(providerCancelMatch[1]);
      if (!connection) return sendJson(response, 404, { ok: false, error: "Provider connection was not found." }, cors.headers);
      await cancelProviderConnection(connection);
      return sendJson(response, 200, { ok: true, connectionId: connection.id, provider: connection.provider, status: connection.status }, cors.headers);
    }
    if (request.method === "POST" && url.pathname === "/prompt-drafts") {
      const draft = await generatePromptDraft(await readJsonBody(request));
      return sendJson(response, 200, { ok: true, draft }, cors.headers);
    }
    if (request.method === "POST" && url.pathname === "/jobs") {
      if (activeAiOperation) return sendJson(response, 409, { ok: false, error: `An AI operation is already running (${activeAiOperation.kind}). Wait or cancel it first.` }, cors.headers);
      const job = await startJob(await readJsonBody(request));
      return sendJson(response, 202, { ok: true, protocolVersion: LOOPLAB_PROTOCOL_VERSION, jobId: job.id, requestedProvider: job.requestedProvider, provider: job.provider, providerRoute: job.providerRoute, status: job.status, contextBudgetTokens: job.contextBudgetTokens, evaluationProfile: job.evaluationProfile, runtimePreference: job.runtimePreference, narrativeMode: job.narrativeMode, preferenceReceipt: job.preferenceReceipt, eventsUrl: `/jobs/${job.id}/events`, statusUrl: `/jobs/${job.id}/status`, resultUrl: `/jobs/${job.id}/result`, cancelUrl: `/jobs/${job.id}/cancel` }, cors.headers);
    }
    if (request.method === "POST" && url.pathname === "/research-jobs") {
      if (activeAiOperation) return sendJson(response, 409, { ok: false, error: `An AI operation is already running (${activeAiOperation.kind}). Wait or cancel it first.` }, cors.headers);
      const job = await startResearchJob(await readJsonBody(request));
      return sendJson(response, 202, { ok: true, jobId: job.id, requestedProvider: job.requestedProvider, provider: job.provider, providerRoute: job.providerRoute, status: job.status, eventsUrl: `/research-jobs/${job.id}/events`, statusUrl: `/research-jobs/${job.id}/status`, resultUrl: `/research-jobs/${job.id}/result`, cancelUrl: `/research-jobs/${job.id}/cancel` }, cors.headers);
    }
    if (request.method === "POST" && url.pathname === "/visual-critique-jobs") {
      if (activeAiOperation) return sendJson(response, 409, { ok: false, error: `An AI operation is already running (${activeAiOperation.kind}). Wait or cancel it first.` }, cors.headers);
      const job = await startVisualCritiqueJob(await readJsonBody(request));
      return sendJson(response, 202, { ok: true, protocolVersion: LOOPLAB_PROTOCOL_VERSION, jobId: job.id, kind: job.kind, requestedProvider: job.requestedProvider, provider: job.provider, providerRoute: job.providerRoute, status: job.status, request: job.request, eventsUrl: `/visual-critique-jobs/${job.id}/events`, statusUrl: `/visual-critique-jobs/${job.id}/status`, resultUrl: `/visual-critique-jobs/${job.id}/result`, cancelUrl: `/visual-critique-jobs/${job.id}/cancel` }, cors.headers);
    }
    if (request.method === "POST" && url.pathname === "/local-copilot/jobs") {
      const job = await startLocalCopilotJob(await readJsonBody(request));
      return sendJson(response, 202, { ok: true, protocolVersion: LOOPLAB_PROTOCOL_VERSION, jobId: job.id, kind: job.kind, status: job.status, engine: job.engine, model: job.model, eventsUrl: `/local-copilot/jobs/${job.id}/events`, statusUrl: `/local-copilot/jobs/${job.id}/status`, resultUrl: `/local-copilot/jobs/${job.id}/result`, cancelUrl: `/local-copilot/jobs/${job.id}/cancel` }, cors.headers);
    }
    if (request.method === "POST" && url.pathname === "/asset-jobs") {
      if (activeAiOperation) return sendJson(response, 409, { ok: false, error: `An AI operation is already running (${activeAiOperation.kind}). Wait or cancel it first.` }, cors.headers);
      const job = await startAssetJob(await readJsonBody(request));
      return sendJson(response, 202, { ok: true, protocolVersion: LOOPLAB_PROTOCOL_VERSION, jobId: job.id, status: job.status, eventsUrl: `/asset-jobs/${job.id}/events`, statusUrl: `/asset-jobs/${job.id}/status`, resultUrl: `/asset-jobs/${job.id}/result`, cancelUrl: `/asset-jobs/${job.id}/cancel` }, cors.headers);
    }
    if (request.method === "POST" && url.pathname === "/release-verification-jobs") {
      const job = await startReleaseVerificationJob(await readJsonBody(request));
      return sendJson(response, 202, { ok: true, protocolVersion: LOOPLAB_PROTOCOL_VERSION, jobId: job.id, kind: job.kind, status: job.status, eventsUrl: `/release-verification-jobs/${job.id}/events`, statusUrl: `/release-verification-jobs/${job.id}/status`, resultUrl: `/release-verification-jobs/${job.id}/result`, cancelUrl: `/release-verification-jobs/${job.id}/cancel`, usage: job.usage }, cors.headers);
    }
    const releaseVerificationMatch = url.pathname.match(/^\/release-verification-jobs\/([^/]+)\/(events|status|result|cancel)$/);
    if (releaseVerificationMatch) {
      const job = releaseVerificationJobs.get(releaseVerificationMatch[1]);
      if (!job) return sendJson(response, 404, { ok: false, error: "Exact release-verification job was not found." }, cors.headers);
      if (request.method === "GET" && releaseVerificationMatch[2] === "status") return sendJson(response, 200, { ok: true, jobId: job.id, kind: job.kind, status: job.status, createdAt: job.createdAt, filename: job.filename, elapsedSeconds: Math.max(0, Math.round((Date.now() - Date.parse(job.createdAt)) / 1_000)), usage: job.usage, error: job.error, droppedEventCount: job.droppedEventCount ?? 0, resultRetained: Boolean(job.result), recentEvents: job.events.slice(-12) }, cors.headers);
      if (request.method === "GET" && releaseVerificationMatch[2] === "events") {
        response.writeHead(200, { ...cors.headers, "Content-Type": "text/event-stream; charset=utf-8", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
        for (const event of job.events) response.write(`data: ${JSON.stringify(event)}\n\n`);
        if (["completed", "failed", "cancelled"].includes(job.status)) return response.end();
        job.listeners.add(response);
        request.on("close", () => job.listeners.delete(response));
        return;
      }
      if (request.method === "GET" && releaseVerificationMatch[2] === "result") {
        if (job.resultReleasedAt) return sendJson(response, 410, { ok: false, status: job.status, error: "The delivered release-verification result expired from companion memory; run exact verification again if the browser did not retain it.", usage: job.usage }, cors.headers);
        // Exact release evidence may be inspected independently by the UI, Claude,
        // and Codex. Retain it for the full terminal-job TTL so one reader cannot
        // shorten the recovery window for another reader.
        return sendJson(response, job.result ? 200 : 202, { ok: job.result?.passed === true, status: job.status, result: job.result, usage: job.usage, error: job.error }, cors.headers);
      }
      if (request.method === "POST" && releaseVerificationMatch[2] === "cancel") {
        if (job.status === "running") {
          job.status = "cancelled";
          job.controller?.abort();
        }
        return sendJson(response, 200, { ok: true, jobId: job.id, status: job.status }, cors.headers);
      }
    }
    const assetMatch = url.pathname.match(/^\/asset-jobs\/([^/]+)\/(events|status|result|cancel)$/);
    if (assetMatch) {
      const job = assetJobs.get(assetMatch[1]);
      if (!job) return sendJson(response, 404, { ok: false, error: "AI art job was not found." }, cors.headers);
      if (request.method === "GET" && assetMatch[2] === "status") return sendJson(response, 200, { ok: true, jobId: job.id, kind: "ai-art", provider: job.provider, status: job.status, createdAt: job.createdAt, elapsedSeconds: Math.max(0, Math.round((Date.now() - Date.parse(job.createdAt)) / 1_000)), request: job.request, usage: job.usage, error: job.error, droppedEventCount: job.droppedEventCount ?? 0, resultRetained: Boolean(job.result), recentEvents: job.events.slice(-12) }, cors.headers);
      if (request.method === "GET" && assetMatch[2] === "events") {
        response.writeHead(200, { ...cors.headers, "Content-Type": "text/event-stream; charset=utf-8", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
        for (const event of job.events) response.write(`data: ${JSON.stringify(event)}\n\n`);
        if (["completed", "failed", "cancelled"].includes(job.status)) return response.end();
        job.listeners.add(response);
        request.on("close", () => job.listeners.delete(response));
        return;
      }
      if (request.method === "GET" && assetMatch[2] === "result") {
        if (job.resultReleasedAt) return sendJson(response, 410, { ok: false, status: job.status, error: "The delivered AI-art result expired from companion memory; run the asset job again if the browser did not retain it.", usage: job.usage }, cors.headers);
        markResultDelivered(job);
        return sendJson(response, job.result ? 200 : 202, { ok: Boolean(job.result), status: job.status, result: job.result, usage: job.usage, error: job.error }, cors.headers);
      }
      if (request.method === "POST" && assetMatch[2] === "cancel") {
        if (job.status === "running") {
          job.status = "cancelled";
          job.controller?.abort();
        }
        return sendJson(response, 200, { ok: true, jobId: job.id, status: job.status }, cors.headers);
      }
    }
    const researchMatch = url.pathname.match(/^\/research-jobs\/([^/]+)\/(events|status|result|cancel)$/);
    if (researchMatch) {
      const job = researchJobs.get(researchMatch[1]);
      if (!job) return sendJson(response, 404, { ok: false, error: "Research job was not found." }, cors.headers);
      if (request.method === "GET" && researchMatch[2] === "status") return sendJson(response, 200, { ok: true, jobId: job.id, kind: "research", requestedProvider: job.requestedProvider, provider: job.provider, providerRoute: job.providerRoute, providerFailover: job.providerFailover, status: job.status, createdAt: job.createdAt, elapsedSeconds: Math.max(0, Math.round((Date.now() - Date.parse(job.createdAt)) / 1_000)), usage: job.usage, error: job.error, droppedEventCount: job.droppedEventCount ?? 0, recentEvents: job.events.slice(-12) }, cors.headers);
      if (request.method === "GET" && researchMatch[2] === "events") {
        response.writeHead(200, { ...cors.headers, "Content-Type": "text/event-stream; charset=utf-8", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
        for (const event of job.events) response.write(`data: ${JSON.stringify(event)}\n\n`);
        if (["completed", "failed", "cancelled"].includes(job.status)) return response.end();
        job.listeners.add(response);
        request.on("close", () => job.listeners.delete(response));
        return;
      }
      if (request.method === "GET" && researchMatch[2] === "result") return sendJson(response, job.result ? 200 : 202, { ok: Boolean(job.result), status: job.status, requestedProvider: job.requestedProvider, provider: job.provider, providerRoute: job.providerRoute, providerFailover: job.providerFailover, report: job.result, usage: job.usage, error: job.error }, cors.headers);
      if (request.method === "POST" && researchMatch[2] === "cancel") {
        job.status = "cancelled";
        await terminateProcessTree(job.child);
        pushEvent(job, { type: "companion.research.cancelled", message: "Research cancelled by user" });
        closeListeners(job);
        return sendJson(response, 200, { ok: true, jobId: job.id, status: job.status }, cors.headers);
      }
    }
    const localCopilotMatch = url.pathname.match(/^\/local-copilot\/jobs\/([^/]+)\/(events|status|result|cancel)$/);
    if (localCopilotMatch) {
      const job = localCopilotJobs.get(localCopilotMatch[1]);
      if (!job) return sendJson(response, 404, { ok: false, error: "Local copilot job was not found." }, cors.headers);
      if (request.method === "GET" && localCopilotMatch[2] === "status") return sendJson(response, 200, { ok: true, jobId: job.id, kind: job.kind, status: job.status, createdAt: job.createdAt, elapsedSeconds: Math.max(0, Math.round((Date.now() - Date.parse(job.createdAt)) / 1_000)), request: job.request, engine: job.engine, model: job.model, usage: job.usage, error: job.error, droppedEventCount: job.droppedEventCount ?? 0, resultRetained: Boolean(job.result), recentEvents: job.events.slice(-12) }, cors.headers);
      if (request.method === "GET" && localCopilotMatch[2] === "events") {
        response.writeHead(200, { ...cors.headers, "Content-Type": "text/event-stream; charset=utf-8", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
        for (const event of job.events) response.write(`data: ${JSON.stringify(event)}\n\n`);
        if (["completed", "failed", "cancelled"].includes(job.status)) return response.end();
        job.listeners.add(response);
        request.on("close", () => job.listeners.delete(response));
        return;
      }
      if (request.method === "GET" && localCopilotMatch[2] === "result") return sendJson(response, job.result ? 200 : 202, { ok: Boolean(job.result), status: job.status, result: job.result, usage: job.usage, error: job.error }, cors.headers);
      if (request.method === "POST" && localCopilotMatch[2] === "cancel") {
        if (job.status === "running") {
          job.status = "cancelled";
          job.controller?.abort();
        }
        return sendJson(response, 200, { ok: true, jobId: job.id, status: job.status }, cors.headers);
      }
    }
    const visualCritiqueMatch = url.pathname.match(/^\/visual-critique-jobs\/([^/]+)\/(events|status|result|cancel)$/);
    if (visualCritiqueMatch) {
      const job = visualCritiqueJobs.get(visualCritiqueMatch[1]);
      if (!job) return sendJson(response, 404, { ok: false, error: "Visual-critique job was not found." }, cors.headers);
      if (request.method === "GET" && visualCritiqueMatch[2] === "status") return sendJson(response, 200, { ok: true, jobId: job.id, kind: job.kind, requestedProvider: job.requestedProvider, provider: job.provider, providerRoute: job.providerRoute, providerFailover: job.providerFailover, status: job.status, createdAt: job.createdAt, elapsedSeconds: Math.max(0, Math.round((Date.now() - Date.parse(job.createdAt)) / 1_000)), request: job.request, usage: job.usage, error: job.error, droppedEventCount: job.droppedEventCount ?? 0, resultRetained: Boolean(job.result), recentEvents: job.events.slice(-12) }, cors.headers);
      if (request.method === "GET" && visualCritiqueMatch[2] === "events") {
        response.writeHead(200, { ...cors.headers, "Content-Type": "text/event-stream; charset=utf-8", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
        for (const event of job.events) response.write(`data: ${JSON.stringify(event)}\n\n`);
        if (["completed", "failed", "cancelled"].includes(job.status)) return response.end();
        job.listeners.add(response);
        request.on("close", () => job.listeners.delete(response));
        return;
      }
      if (request.method === "GET" && visualCritiqueMatch[2] === "result") return sendJson(response, job.result ? 200 : 202, { ok: Boolean(job.result), status: job.status, requestedProvider: job.requestedProvider, provider: job.provider, providerRoute: job.providerRoute, providerFailover: job.providerFailover, result: job.result, usage: job.usage, error: job.error }, cors.headers);
      if (request.method === "POST" && visualCritiqueMatch[2] === "cancel") {
        if (["starting", "running"].includes(job.status)) {
          job.status = "cancelled";
          await terminateProcessTree(job.child);
          pushEvent(job, { type: "companion.visual-critique.cancelled", message: "Visual critique cancelled; temporary captures will be deleted and the selected project remains unchanged" });
          closeListeners(job);
        }
        return sendJson(response, 200, { ok: true, jobId: job.id, status: job.status }, cors.headers);
      }
    }
    const match = url.pathname.match(/^\/jobs\/([^/]+)\/(events|status|result|cancel)$/);
    if (match) {
      const job = jobs.get(match[1]);
      if (!job) return sendJson(response, 404, { ok: false, error: "Job was not found." }, cors.headers);
      if (request.method === "GET" && match[2] === "status") return sendJson(response, 200, { ok: true, jobId: job.id, kind: "game-loop", requestedProvider: job.requestedProvider, provider: job.provider, providerRoute: job.providerRoute, providerFailover: job.providerFailover, status: job.status, createdAt: job.createdAt, elapsedSeconds: Math.max(0, Math.round((Date.now() - Date.parse(job.createdAt)) / 1_000)), contextBudgetTokens: job.contextBudgetTokens, evaluationProfile: job.evaluationProfile, runtimePreference: job.runtimePreference, narrativeMode: job.narrativeMode, preferenceReceipt: job.preferenceReceipt, providerParity: job.providerParity, passPlan: job.passPlan, activePass: job.activePass, passPlanStatus: job.passPlanStatus, remainingPassIds: job.remainingPassIds, usage: job.usage, error: job.error, droppedEventCount: job.droppedEventCount ?? 0, resultRetained: Boolean(job.result), recentEvents: job.events.slice(-12) }, cors.headers);
      if (request.method === "GET" && match[2] === "events") {
        response.writeHead(200, { ...cors.headers, "Content-Type": "text/event-stream; charset=utf-8", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
        for (const event of job.events) response.write(`data: ${JSON.stringify(event)}\n\n`);
        if (["completed", "failed", "cancelled"].includes(job.status)) return response.end();
        job.listeners.add(response);
        request.on("close", () => job.listeners.delete(response));
        return;
      }
      if (request.method === "GET" && match[2] === "result") {
        if (job.resultReleasedAt) return sendJson(response, 410, { ok: false, status: job.status, error: "The delivered game-loop result expired from companion memory; resume from the persisted project or run a new loop.", usage: job.usage }, cors.headers);
        markResultDelivered(job);
        return sendJson(response, job.result ? 200 : 202, { ok: Boolean(job.result), status: job.status, requestedProvider: job.requestedProvider, provider: job.provider, providerRoute: job.providerRoute, providerFailover: job.providerFailover, project: job.result, contextBudgetTokens: job.contextBudgetTokens, evaluationProfile: job.evaluationProfile, runtimePreference: job.runtimePreference, narrativeMode: job.narrativeMode, preferenceReceipt: job.preferenceReceipt, providerParity: job.providerParity, passPlan: job.passPlan, passPlanStatus: job.passPlanStatus, remainingPassIds: job.remainingPassIds, usage: job.usage, error: job.error }, cors.headers);
      }
      if (request.method === "POST" && match[2] === "cancel") {
        job.status = "cancelled";
        await terminateProcessTree(job.child);
        pushEvent(job, { type: "companion.cancelled", message: "Loop cancelled by user" });
        closeListeners(job);
        return sendJson(response, 200, { ok: true, status: job.status }, cors.headers);
      }
    }
    return sendJson(response, 404, { ok: false, error: "Not found." }, cors.headers);
  } catch (error) {
    const prepared = publicRequestErrors.get(error);
    const statusCode = prepared?.statusCode
      ?? (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500);
    const body = prepared?.body ?? publicErrorBody(
      statusCode < 500 ? "The request was rejected." : "The local companion could not complete the request.",
      error && typeof error === "object" ? error : {},
    );
    const retryAfterSeconds = Number.isInteger(body.retryAfterSeconds) ? body.retryAfterSeconds : null;
    return sendJson(response, statusCode, body, { ...cors.headers, ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}) });
  }
});

await mkdir(tmpdir(), { recursive: true });
const retentionTimer = setInterval(() => {
  reapCompanionRecords([jobs, researchJobs, visualCritiqueJobs, assetJobs, releaseVerificationJobs, localCopilotJobs, providerConnections], retention);
  agentPresenceRegistry.prune();
}, Math.min(60_000, Math.max(15_000, Math.floor(retention.terminalTtlMs / 4))));
retentionTimer.unref?.();
server.listen(PORT, HOST, () => {
  process.stdout.write(`${JSON.stringify({ type: "companion.ready", url: companionUrl, sessionId: companionSession.sessionId, mutationAuth: { required: true, header: LOOPLAB_SESSION_HEADER }, allowedOrigins: [...ALLOWED_ORIGINS] })}\n`);
});
