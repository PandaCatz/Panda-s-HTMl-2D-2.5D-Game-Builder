import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  LOOPLAB_AGENT_PRESENCE_POLICY,
  createAgentPresenceRegistry,
} from "../lib/looplab-agent-presence.mjs";
import { LOOPLAB_SESSION_HEADER } from "../lib/looplab-companion-session.mjs";

function deterministicRegistry(start = Date.parse("2026-08-11T12:00:00.000Z")) {
  let timestamp = start;
  let sequence = 0;
  const registry = createAgentPresenceRegistry({
    now: () => timestamp,
    randomId: () => `fixture-${++sequence}`,
  });
  return { registry, advance: (milliseconds) => { timestamp += milliseconds; } };
}

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

async function waitForCompanion(child, stderr) {
  await new Promise((resolveReady, rejectReady) => {
    let stdout = "";
    const timer = setTimeout(() => rejectReady(new Error(`Companion startup timed out: ${stderr()}`)), 10_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!stdout.includes('"type":"companion.ready"')) return;
      clearTimeout(timer);
      resolveReady();
    });
    child.once("exit", (code) => rejectReady(new Error(`Companion exited during startup (${code}): ${stderr()}`)));
  });
}

test("presence leases register, renew, sort, leave, and expire without entering durable state", () => {
  const { registry, advance } = deterministicRegistry();
  const codex = registry.register({ presenceId: "codex-main", clientKind: "codex", displayName: "Codex", projectId: "kinetic-city", sourceDigest: `source-${"a".repeat(64)}`, operation: "Implementing agent presence", workItemIds: ["agent-presence"], ttlSeconds: 45 });
  assert.equal(codex.created, true);
  assert.equal(codex.heartbeatAfterSeconds, 15);
  assert.equal("leaseToken" in codex.presence, false);
  assert.equal(registry.list().count, 1);

  advance(10_000);
  const renewed = registry.register({ presenceId: "codex-main", leaseToken: codex.leaseToken, clientKind: "codex", displayName: "Codex", status: "reviewing", projectId: "kinetic-city", sourceDigest: `source-${"a".repeat(64)}`, operation: "Reviewing presence tests", workItemIds: ["agent-presence"], ttlSeconds: 60 });
  assert.equal(renewed.renewed, true);
  assert.equal(renewed.presence.joinedAt, codex.presence.joinedAt);
  assert.notEqual(renewed.presence.expiresAt, codex.presence.expiresAt);

  const claude = registry.register({ presenceId: "claude-main", clientKind: "claude", displayName: "Claude", status: "active" });
  assert.deepEqual(registry.list().presences.map((entry) => entry.clientKind), ["claude", "codex"]);
  assert.equal(registry.leave({ presenceId: "claude-main", leaseToken: claude.leaseToken }).left, true);
  assert.equal(registry.list().count, 1);

  advance(61_000);
  const expired = registry.list();
  assert.equal(expired.count, 0);
  assert.equal(expired.expiredPruned, 1);
  const rejoined = registry.register({ presenceId: "codex-main", clientKind: "codex", displayName: "Codex" });
  assert.notEqual(rejoined.leaseToken, codex.leaseToken);
});

test("presence leases reject conflicts, identity changes, secrets, paths, unknown fields, and invalid bounds", () => {
  const { registry } = deterministicRegistry();
  const current = registry.register({ presenceId: "codex-main", clientKind: "codex", displayName: "Codex" });
  assert.throws(
    () => registry.register({ presenceId: "codex-main", leaseToken: "wrong", clientKind: "codex", displayName: "Codex" }),
    (error) => error.code === "presence-conflict" && error.statusCode === 409 && error.current.presenceId === "codex-main" && !error.current.leaseToken,
  );
  assert.throws(
    () => registry.register({ presenceId: "codex-main", leaseToken: current.leaseToken, clientKind: "claude", displayName: "Claude" }),
    (error) => error.code === "presence-identity-conflict" && error.statusCode === 409,
  );
  assert.throws(() => registry.register({ presenceId: "secret", clientKind: "codex", displayName: "sk-proj-test-fixture-abcdefghijklmnopqrstuvwxyz" }), /credential/i);
  assert.throws(() => registry.register({ presenceId: "path", clientKind: "codex", displayName: "Codex", projectId: "C:\\private\\game" }), /filesystem path/i);
  assert.throws(() => registry.register({ presenceId: "extra", clientKind: "codex", displayName: "Codex", prompt: "hidden" }), /unsupported field/i);
  assert.throws(() => registry.register({ presenceId: "short", clientKind: "codex", displayName: "Codex", ttlSeconds: 14 }), /15 to 120/);
  assert.throws(() => registry.leave({ presenceId: "codex-main", leaseToken: "wrong" }), (error) => error.code === "presence-conflict" && error.statusCode === 409);
  assert.equal(LOOPLAB_AGENT_PRESENCE_POLICY.privacy.projectSource, false);
  assert.equal(LOOPLAB_AGENT_PRESENCE_POLICY.privacy.exportedHtml, false);
});

test("real companion presence endpoints require the session, expose structured conflicts, and stay out of project source", { timeout: 25_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-agent-presence-"));
  const sessionFile = join(directory, "session.json");
  const port = await availablePort();
  const token = "looplab-presence-session-token-0123456789abcdef";
  const child = spawn(process.execPath, [resolve("scripts/looplab-companion.mjs")], {
    cwd: resolve("."),
    env: {
      ...process.env,
      LOOPLAB_COMPANION_PORT: String(port),
      LOOPLAB_COMPANION_SESSION_FILE: sessionFile,
      LOOPLAB_COMPANION_SESSION_ID: "agent-presence-test",
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
    await waitForCompanion(child, () => stderr);
    const origin = `http://127.0.0.1:${port}`;
    const headers = { "Content-Type": "application/json", [LOOPLAB_SESSION_HEADER]: token };

    assert.equal((await fetch(`${origin}/agent-presence`)).status, 401);
    const createdResponse = await fetch(`${origin}/agent-presence`, { method: "POST", headers, body: JSON.stringify({ presenceId: "claude-test", clientKind: "claude", displayName: "Claude", projectId: "fixture-project", operation: "Testing live presence" }) });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.ok(created.leaseToken);
    assert.equal(created.presence.clientKind, "claude");

    const listedResponse = await fetch(`${origin}/agent-presence`, { headers });
    assert.equal(listedResponse.status, 200);
    const listed = await listedResponse.json();
    assert.equal(listed.count, 1);
    assert.equal("leaseToken" in listed.presences[0], false);

    const conflictResponse = await fetch(`${origin}/agent-presence`, { method: "POST", headers, body: JSON.stringify({ presenceId: "claude-test", leaseToken: "wrong", clientKind: "claude", displayName: "Claude" }) });
    assert.equal(conflictResponse.status, 409);
    const conflict = await conflictResponse.json();
    assert.equal(conflict.code, "presence-conflict");
    assert.match(conflict.repairAction, /distinct presenceId|leaseToken|expire/i);

    const health = await fetch(`${origin}/health`).then((response) => response.json());
    assert.equal(health.activeAgentPresences, 1);

    const leftResponse = await fetch(`${origin}/agent-presence/claude-test/leave`, { method: "POST", headers, body: JSON.stringify({ leaseToken: created.leaseToken }) });
    assert.equal(leftResponse.status, 200);
    assert.equal((await leftResponse.json()).left, true);
    assert.equal((await fetch(`${origin}/agent-presence`, { headers }).then((response) => response.json())).count, 0);

    const shutdown = await fetch(`${origin}/lifecycle/shutdown`, { method: "POST", headers, body: JSON.stringify({ expectedProtocolVersion: "0.0.0" }) });
    assert.equal(shutdown.status, 202);
    await new Promise((resolveExit) => child.once("exit", resolveExit));
  } finally {
    if (child.exitCode === null) child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});
