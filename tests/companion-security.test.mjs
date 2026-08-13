import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { createTemplate } from "../lib/looplab-agent-core.mjs";
import { LOOPLAB_COMPANION_VERSION } from "../lib/looplab-versions.mjs";

import {
  LOOPLAB_SESSION_HEADER,
  companionSessionHeaders,
  createCompanionSession,
  hasValidCompanionSession,
  isAllowedCompanionHost,
  readCompanionSession,
  writeCompanionSession,
} from "../lib/looplab-companion-session.mjs";

async function availablePort() {
  const probe = createServer();
  await new Promise((resolveListen, rejectListen) => {
    probe.once("error", rejectListen);
    probe.listen(0, "127.0.0.1", resolveListen);
  });
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolveClose) => probe.close(resolveClose));
  return port;
}

async function rawRequest({ port, path, host }) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpRequest({ hostname: "127.0.0.1", port, path, headers: { Host: host } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolveRequest({ status: response.statusCode, body }));
    });
    request.once("error", rejectRequest);
    request.end();
  });
}

test("companion session descriptors are private, reusable by headless clients, and constant-time checked", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-session-test-"));
  const path = join(directory, "session.json");
  try {
    const session = createCompanionSession({ url: "http://127.0.0.1:4317", now: new Date("2026-08-09T12:00:00.000Z") });
    await writeCompanionSession(path, session);
    assert.deepEqual(await readCompanionSession(path), session);
    assert.equal(hasValidCompanionSession(companionSessionHeaders(session), session.token), true);
    assert.equal(hasValidCompanionSession({ [LOOPLAB_SESSION_HEADER]: `${session.token}x` }, session.token), false);
    assert.equal(isAllowedCompanionHost({ host: "127.0.0.1:4317" }, 4317), true);
    assert.equal(isAllowedCompanionHost({ host: "attacker.example" }, 4317), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("browser and CLI mutation clients share the launcher-owned companion session", async () => {
  const [layout, page, agent, launcher, manifestSource, companion] = await Promise.all([
    readFile(resolve("app/layout.tsx"), "utf8"),
    readFile(resolve("app/page.tsx"), "utf8"),
    readFile(resolve("scripts/looplab-agent.mjs"), "utf8"),
    readFile(resolve("scripts/looplab-launch.mjs"), "utf8"),
    readFile(resolve("lib/looplab-agent-core.mjs"), "utf8"),
    readFile(resolve("scripts/looplab-companion.mjs"), "utf8"),
  ]);
  assert.match(layout, /LOOPLAB_COMPANION_TOKEN/);
  assert.match(layout, /LOOPLAB_COMPANION_URL/);
  assert.match(layout, /dynamic = "force-dynamic"/);
  assert.match(layout, /\/lifecycle\/browser-bootstrap/);
  assert.match(layout, /"x-looplab-bootstrap": "server-layout"/);
  assert.doesNotMatch(launcher, /NEXT_PUBLIC_LOOPLAB_COMPANION_TOKEN/);
  assert.match(launcher, /NEXT_PUBLIC_LOOPLAB_COMPANION_URL/);
  assert.match(page, /const companionFetch/);
  assert.match(page, /__LOOPLAB_COMPANION_URL__/);
  assert.doesNotMatch(page, /\bfetch\(`\$\{COMPANION_URL\}/, "companion calls must not bypass the authenticated browser helper");
  assert.match(agent, /readCompanionSession/);
  assert.match(agent, /companionMutationHeaders/);
  assert.match(launcher, /writeCompanionSession/);
  assert.match(manifestSource, /mutationAuthentication/);
  assert.match(page, /function openCompanionEventStream[\s\S]*?companionFetch\(/);
  assert.doesNotMatch(page, /new EventSource\(/, "protected streams must carry the launcher-owned session header instead of putting a token in a URL");
  assert.match(companion, /LOOPLAB_ALLOW_HOSTED_ORIGIN === "1"/);
  assert.match(companion, /appendRetainedEvent\(job, sanitizeRetainedEvent\(event\)/);
  assert.match(companion, /appendRetainedEvent\(connection, sanitizeRetainedEvent\(event\)/);
  assert.match(companion, /for \(const field of \["message", "error", "detail", "usageMessage", "url"\]\)/);
  assert.match(companion, /isProtectedCompanionReadPath[\s\S]*?protectedRead[\s\S]*?hasValidCompanionSession/);
  assert.match(companion, /cleanupJobDirectory\(job\)[\s\S]*?releaseAiOperation\(reservation\)/);
  assert.match(companion, /match\[2\] === "result"[\s\S]*?markResultDelivered\(job\)/);
});

test("real companion HTTP rejects bad hosts and unauthenticated mutations while keeping shutdown launcher-only", { timeout: 20_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-companion-http-"));
  const sessionFile = join(directory, "session.json");
  const port = await availablePort();
  const token = "looplab-test-session-token-0123456789abcdef";
  const child = spawn(process.execPath, [resolve("scripts/looplab-companion.mjs")], {
    cwd: resolve("."),
    env: {
      ...process.env,
      LOOPLAB_COMPANION_PORT: String(port),
      LOOPLAB_COMPANION_SESSION_FILE: sessionFile,
      LOOPLAB_COMPANION_SESSION_ID: "companion-http-test",
      LOOPLAB_COMPANION_TOKEN: token,
    },
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    await new Promise((resolveReady, rejectReady) => {
      let stdout = "";
      const timer = setTimeout(() => rejectReady(new Error(`Companion startup timed out: ${stderr}`)), 10_000);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (!stdout.includes('"type":"companion.ready"')) return;
        clearTimeout(timer);
        resolveReady();
      });
      child.once("exit", (code) => rejectReady(new Error(`Companion exited during startup (${code}): ${stderr}`)));
    });

    const badHost = await rawRequest({ port, path: "/not-found", host: "attacker.example" });
    assert.equal(badHost.status, 421);

    const unauthorized = await fetch(`http://127.0.0.1:${port}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "codex" }),
    });
    assert.equal(unauthorized.status, 401);

    const hostedOrigin = "https://looplab-2d-workshop.imalevel9turtle.chatgpt.site";
    const defaultHostedRequest = await fetch(`http://127.0.0.1:${port}/health`, { headers: { Origin: hostedOrigin } });
    assert.equal(defaultHostedRequest.status, 403);

    const alternateLoopbackOrigin = "http://localhost:45678";
    const alternateHealth = await fetch(`http://127.0.0.1:${port}/health`, { headers: { Origin: alternateLoopbackOrigin } });
    assert.equal(alternateHealth.status, 200);
    assert.equal(alternateHealth.headers.get("access-control-allow-origin"), alternateLoopbackOrigin);
    const alternateHealthPayload = await alternateHealth.json();
    assert.equal(alternateHealthPayload.version, LOOPLAB_COMPANION_VERSION);
    assert.equal(alternateHealthPayload.protocolVersion, "1.111.0");
    const alternateUnauthorized = await fetch(`http://127.0.0.1:${port}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: alternateLoopbackOrigin },
      body: JSON.stringify({ provider: "codex" }),
    });
    assert.equal(alternateUnauthorized.status, 401);

    const missingBootstrapProof = await fetch(`http://127.0.0.1:${port}/lifecycle/browser-bootstrap`);
    assert.equal(missingBootstrapProof.status, 403);
    const browserBootstrap = await fetch(`http://127.0.0.1:${port}/lifecycle/browser-bootstrap`, {
      headers: { Origin: "http://localhost:3000", "x-looplab-bootstrap": "server-layout" },
    });
    assert.equal(browserBootstrap.status, 403);
    const serverBootstrap = await fetch(`http://127.0.0.1:${port}/lifecycle/browser-bootstrap`, {
      headers: { "x-looplab-bootstrap": "server-layout" },
    });
    assert.equal(serverBootstrap.status, 200);
    assert.equal(serverBootstrap.headers.get("cache-control"), "no-store");
    const serverBootstrapValue = await serverBootstrap.json();
    assert.equal(serverBootstrapValue.token, token);
    assert.equal(serverBootstrapValue.url, `http://127.0.0.1:${port}`);

    const browserShutdown = await fetch(`http://127.0.0.1:${port}/lifecycle/shutdown`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", [LOOPLAB_SESSION_HEADER]: token },
      body: JSON.stringify({ expectedProtocolVersion: "0.0.0" }),
    });
    assert.equal(browserShutdown.status, 403);

    const launcherShutdown = await fetch(`http://127.0.0.1:${port}/lifecycle/shutdown`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [LOOPLAB_SESSION_HEADER]: token },
      body: JSON.stringify({ expectedProtocolVersion: "0.0.0" }),
    });
    assert.equal(launcherShutdown.status, 202);
    await new Promise((resolveExit) => child.once("exit", resolveExit));
    const persisted = JSON.parse(await readFile(sessionFile, "utf8"));
    assert.equal(persisted.sessionId, "companion-http-test");
    assert.equal(persisted.token, token);
  } finally {
    if (child.exitCode === null) child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});

test("real companion HTTP atomically admits only one AI job", { timeout: 45_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-companion-mutex-"));
  const sessionFile = join(directory, "session.json");
  const fakeCliEntry = join(directory, "fake-provider.mjs");
  const port = await availablePort();
  const token = "looplab-mutex-session-token-0123456789abcdef";
  await writeFile(fakeCliEntry, [
    "const args = process.argv.slice(2);",
    "if (args.includes('--version')) { console.log('2.1.224 (LoopLab test CLI)'); process.exit(0); }",
    "if ((args[0] === 'auth' || args[0] === 'login') && args[1] === 'status') { console.log('Authenticated with API key'); process.exit(0); }",
    "if (args.includes('-p')) {",
    "  console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'looplab-test-model' }));",
    "  setTimeout(() => process.exit(2), 30000);",
    "} else { process.exit(1); }",
  ].join("\n"), "utf8");

  const child = spawn(process.execPath, [resolve("scripts/looplab-companion.mjs")], {
    cwd: resolve("."),
    env: {
      ...process.env,
      APPDATA: directory,
      LOCALAPPDATA: directory,
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      LOOPLAB_CODEX_CLI_ENTRY: fakeCliEntry,
      LOOPLAB_CLAUDE_CLI_ENTRY: fakeCliEntry,
      LOOPLAB_COMPANION_PORT: String(port),
      LOOPLAB_COMPANION_SESSION_FILE: sessionFile,
      LOOPLAB_COMPANION_SESSION_ID: "companion-mutex-test",
      LOOPLAB_COMPANION_TOKEN: token,
      TEMP: directory,
      TMP: directory,
    },
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    await new Promise((resolveReady, rejectReady) => {
      let stdout = "";
      const timer = setTimeout(() => rejectReady(new Error(`Companion startup timed out: ${stderr}`)), 10_000);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (!stdout.includes('"type":"companion.ready"')) return;
        clearTimeout(timer);
        resolveReady();
      });
      child.once("exit", (code) => rejectReady(new Error(`Companion exited during startup (${code}): ${stderr}`)));
    });

    const headers = { "Content-Type": "application/json", [LOOPLAB_SESSION_HEADER]: token };
    const body = JSON.stringify({ provider: "claude", project: createTemplate("platformer"), goal: "Hold one zero-cost mutex fixture.", iterations: 1 });
    const responses = await Promise.all([
      fetch(`http://127.0.0.1:${port}/jobs`, { method: "POST", headers, body }),
      fetch(`http://127.0.0.1:${port}/jobs`, { method: "POST", headers, body }),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort((left, right) => left - right), [202, 409]);
    const payloads = await Promise.all(responses.map((response) => response.json()));
    const accepted = payloads[responses.findIndex((response) => response.status === 202)];
    const rejected = payloads[responses.findIndex((response) => response.status === 409)];
    assert.ok(accepted.jobId);
    assert.match(rejected.error, /already running/i);
    const unauthenticatedStatus = await fetch(`http://127.0.0.1:${port}${accepted.statusUrl}`);
    assert.equal(unauthenticatedStatus.status, 401);
    const authenticatedStatus = await fetch(`http://127.0.0.1:${port}${accepted.statusUrl}`, { headers });
    assert.equal(authenticatedStatus.status, 200);

    const cancel = await fetch(`http://127.0.0.1:${port}${accepted.cancelUrl}`, { method: "POST", headers, body: "{}" });
    assert.equal(cancel.status, 200);
    let health = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      health = await response.json();
      if (health.activeAiOperations === 0) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    assert.equal(health?.activeAiOperations, 0);
    assert.deepEqual((await readdir(directory)).filter((name) => name.startsWith("looplab-companion-")), [], "terminal and cancelled game-loop jobs must delete their private temporary directories");

    const shutdown = await fetch(`http://127.0.0.1:${port}/lifecycle/shutdown`, {
      method: "POST",
      headers,
      body: JSON.stringify({ expectedProtocolVersion: "0.0.0" }),
    });
    assert.equal(shutdown.status, 202);
    await new Promise((resolveExit) => child.once("exit", resolveExit));
  } finally {
    if (child.exitCode === null) child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});
