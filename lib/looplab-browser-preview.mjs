import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { buildPlatformHarnessDocument, LOOPLAB_PLATFORM_HARNESS_CSP } from "./looplab-platform-harness.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);
const HARNESS_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src about:; base-uri 'none'; form-action 'none'";

function htmlHeaders(csp, byteLength) {
  return {
    "cache-control": "no-store, max-age=0",
    "content-length": String(byteLength),
    "content-security-policy": csp,
    "content-type": "text/html; charset=utf-8",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  };
}

function send(response, statusCode, body, headers = {}) {
  const bytes = Buffer.from(body);
  response.writeHead(statusCode, { "content-length": String(bytes.byteLength), ...headers });
  response.end(bytes);
}

export async function startBrowserPreviewServer(options = {}) {
  const html = String(options.html ?? "");
  if (!/^\s*<!doctype html>/i.test(html)) throw new Error("Browser preview requires a complete standalone HTML artifact.");
  const host = String(options.host ?? "127.0.0.1").trim().toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) throw new Error("Browser preview may bind only to 127.0.0.1 or localhost.");
  const requestedPort = Number(options.port ?? 0);
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) throw new Error("Browser preview port must be an integer from 0 through 65535.");

  const token = randomBytes(18).toString("base64url");
  const artifactSha256 = createHash("sha256").update(html).digest("hex");
  const harnessHtml = buildPlatformHarnessDocument(html);
  const gameBytes = Buffer.from(html);
  const harnessBytes = Buffer.from(harnessHtml);
  const allowedHosts = new Set();
  let closed = false;

  const server = createServer((request, response) => {
    const method = String(request.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      send(response, 405, "Method not allowed", { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" });
      return;
    }
    const requestHost = String(request.headers.host ?? "").toLowerCase();
    if (!allowedHosts.has(requestHost)) {
      send(response, 403, "Loopback host required", { "content-type": "text/plain; charset=utf-8" });
      return;
    }
    const pathname = new URL(request.url ?? "/", `http://${requestHost}`).pathname;
    const gamePath = `/${token}/game.html`;
    const harnessPath = `/${token}/harness.html`;
    const statusPath = `/${token}/status.json`;
    if (pathname === gamePath || pathname === harnessPath) {
      const bytes = pathname === gamePath ? gameBytes : harnessBytes;
      const csp = pathname === gamePath ? LOOPLAB_PLATFORM_HARNESS_CSP : HARNESS_CSP;
      response.writeHead(200, htmlHeaders(csp, bytes.byteLength));
      response.end(method === "HEAD" ? undefined : bytes);
      return;
    }
    if (pathname === statusPath) {
      const body = JSON.stringify({ ok: true, schemaVersion: "looplab-browser-preview/v1", artifactSha256 });
      send(response, 200, method === "HEAD" ? "" : body, { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" });
      return;
    }
    send(response, 404, "Not found", { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" });
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(requestedPort, host);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Browser preview did not receive a TCP address.");
  }
  const publicHost = host === "localhost" ? "localhost" : "127.0.0.1";
  allowedHosts.add(`${publicHost}:${address.port}`);
  allowedHosts.add(`localhost:${address.port}`);
  allowedHosts.add(`127.0.0.1:${address.port}`);
  const baseUrl = `http://${publicHost}:${address.port}/${token}`;

  return {
    schemaVersion: "looplab-browser-preview/v1",
    host: publicHost,
    port: address.port,
    artifactSha256,
    gameUrl: `${baseUrl}/game.html`,
    harnessUrl: `${baseUrl}/harness.html`,
    statusUrl: `${baseUrl}/status.json`,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
