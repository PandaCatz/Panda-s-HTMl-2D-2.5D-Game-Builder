import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const LOOPLAB_SESSION_HEADER = "x-looplab-session-token";

export function defaultCompanionSessionFile(projectDirectory) {
  return join(projectDirectory, ".looplab", "companion-session.json");
}

export function createCompanionSession({ url, now = new Date() } = {}) {
  return {
    schemaVersion: "looplab-companion-session/v1",
    sessionId: globalThis.crypto.randomUUID(),
    token: randomBytes(32).toString("base64url"),
    url: String(url ?? "http://127.0.0.1:4317"),
    createdAt: now.toISOString(),
  };
}

export async function readCompanionSession(path) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (value?.schemaVersion !== "looplab-companion-session/v1") return null;
    if (typeof value.sessionId !== "string" || typeof value.token !== "string" || value.token.length < 32) return null;
    return value;
  } catch {
    return null;
  }
}

export async function writeCompanionSession(path, session) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
  await chmod(path, 0o600).catch(() => {});
  return session;
}

function headerValue(headers, name) {
  if (typeof headers?.get === "function") return headers.get(name) ?? "";
  const value = headers?.[name] ?? headers?.[name.toLowerCase()] ?? "";
  return Array.isArray(value) ? value[0] ?? "" : String(value);
}

export function hasValidCompanionSession(headers, expectedToken) {
  const supplied = Buffer.from(headerValue(headers, LOOPLAB_SESSION_HEADER));
  const expected = Buffer.from(String(expectedToken ?? ""));
  return supplied.length > 0 && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function isAllowedCompanionHost(headers, port) {
  const host = headerValue(headers, "host").trim().toLowerCase();
  const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  return allowed.has(host);
}

export function companionSessionHeaders(session) {
  return session?.token ? { [LOOPLAB_SESSION_HEADER]: session.token } : {};
}
