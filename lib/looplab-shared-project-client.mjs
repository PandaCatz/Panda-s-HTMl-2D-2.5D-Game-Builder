import { isAbsolute, relative, resolve } from "node:path";

import {
  LOOPLAB_SESSION_HEADER,
  companionSessionHeaders,
  defaultCompanionSessionFile,
  readCompanionSession,
} from "./looplab-companion-session.mjs";

const DEFAULT_COMPANION_URL = "http://127.0.0.1:4317";
const SHARED_PROJECT_PATH_PATTERN = /^\.looplab\/projects\/([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)\/project\.loop\.json$/;

export class SharedProjectClientError extends Error {
  constructor(message, response = {}) {
    super(message);
    this.name = "SharedProjectClientError";
    this.statusCode = response.statusCode ?? 400;
    this.code = response.code ?? "shared-project-request-failed";
    this.path = response.path ?? null;
    this.expected = response.expected ?? null;
    this.got = response.got ?? null;
    this.current = response.current ?? null;
    this.repairAction = response.repairAction ?? null;
  }
}

export function sharedProjectIdFromPath(projectPath, { workspaceRoot = process.cwd() } = {}) {
  const root = resolve(workspaceRoot);
  const target = resolve(root, String(projectPath ?? ""));
  const relation = relative(root, target);
  if (!relation || relation === ".." || relation.startsWith("..\\") || relation.startsWith("../") || isAbsolute(relation)) return null;
  return relation.replace(/\\/g, "/").match(SHARED_PROJECT_PATH_PATTERN)?.[1] ?? null;
}

async function sessionFor({ workspaceRoot, sessionFile, token, companionUrl }) {
  if (typeof token === "string" && token.trim()) return { token: token.trim(), url: companionUrl ?? DEFAULT_COMPANION_URL };
  const session = await readCompanionSession(sessionFile ?? defaultCompanionSessionFile(workspaceRoot));
  if (!session?.token) {
    throw new SharedProjectClientError("The LoopLab companion session is unavailable. Start the Windows launcher, then retry the shared-project operation.", {
      statusCode: 503,
      code: "shared-project-companion-unavailable",
      repairAction: "Start LoopLab with npm run dev or npm start so the app and companion share one current protocol.",
    });
  }
  return session;
}

async function request(path, { method = "GET", body, expectedRevisionDigest, createOnly = false, workspaceRoot = process.cwd(), sessionFile, token, companionUrl } = {}) {
  const session = await sessionFor({ workspaceRoot, sessionFile, token, companionUrl });
  const headers = new Headers(companionSessionHeaders(session));
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (expectedRevisionDigest) headers.set("If-Match", `"${expectedRevisionDigest}"`);
  if (createOnly) headers.set("If-None-Match", "*");
  const response = await fetch(`${companionUrl ?? session.url ?? DEFAULT_COMPANION_URL}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let value;
  try {
    value = await response.json();
  } catch {
    value = null;
  }
  if (!response.ok || !value?.ok) {
    throw new SharedProjectClientError(value?.error ?? `LoopLab companion returned HTTP ${response.status}.`, {
      ...value,
      statusCode: response.status,
    });
  }
  return { ...value, etag: response.headers.get("etag") };
}

export function listSharedProjects(options = {}) {
  return request("/projects", options);
}

export function getSharedProject(id, options = {}) {
  return request(`/projects/${encodeURIComponent(String(id ?? ""))}`, options);
}

export function putSharedProject(id, project, { expectedRevisionDigest, createOnly = false, metadata, ...options } = {}) {
  return request(`/projects/${encodeURIComponent(String(id ?? ""))}`, {
    ...options,
    method: "PUT",
    expectedRevisionDigest,
    createOnly,
    body: {
      project,
      ...(expectedRevisionDigest ? { expectedRevisionDigest } : {}),
      ...(createOnly ? { createOnly: true } : {}),
      ...(metadata ? { metadata } : {}),
    },
  });
}

export { LOOPLAB_SESSION_HEADER };
