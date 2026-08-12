import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { applyAgentCommand, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { getLooplabCommandContract } from "../lib/looplab-agent-contracts.mjs";
import {
  createAgentJsonlSession,
  LOOPLAB_AGENT_SESSION_RESULT_SCHEMA,
  LOOPLAB_AGENT_SESSION_SCHEMA,
} from "../lib/looplab-agent-session.mjs";
import { doctorSourceDigest } from "../lib/looplab-doctor.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = join(projectRoot, "scripts", "looplab-agent.mjs");

function player(project) {
  const maps = project.maps?.length ? project.maps : [{ objects: project.objects }];
  return maps.flatMap((map) => map.objects ?? []).find((object) => object.kind === "player");
}

function createSession(project, savePolicy, persistProject) {
  return createAgentJsonlSession({
    initialProject: project,
    savePolicy,
    applyCommand: applyAgentCommand,
    getCommandContract: getLooplabCommandContract,
    sourceDigest: doctorSourceDigest,
    persistProject,
  });
}

function runCliSession(projectPath, lines, savePolicy = "explicit") {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, "session", projectPath, `--save-policy=${savePolicy}`], {
      cwd: projectRoot,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`Session CLI exited ${code}: ${stderr}`));
      else resolvePromise(stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)));
    });
    child.stdin.end(`${lines.join("\n")}\n`);
  });
}

test("explicit JSONL session preserves one in-memory project and requires source preconditions", async () => {
  const initial = createTemplate("platformer");
  const original = JSON.stringify(initial);
  const initialDigest = doctorSourceDigest(initial);
  const selectedPlayer = player(initial);
  const writes = [];
  const session = createSession(initial, "explicit", async (project) => { writes.push(project); });

  const status = await session.handleLine('{"sessionOp":"status"}');
  assert.equal(status.schemaVersion, LOOPLAB_AGENT_SESSION_RESULT_SCHEMA);
  assert.equal(status.sequence, 1);
  assert.equal(status.session.schemaVersion, LOOPLAB_AGENT_SESSION_SCHEMA);
  assert.equal(status.session.sourceDigest, initialDigest);
  assert.equal(status.session.dirty, false);

  const read = await session.handleLine('{"requestId":"read-1","command":{"op":"get_project","compact":true}}');
  assert.equal(read.ok, true);
  assert.equal(read.requestId, "read-1");
  assert.equal(read.changed, false);
  assert.equal(read.retrySafe, true);

  const missing = await session.handleLine(JSON.stringify({
    op: "update_object",
    id: selectedPlayer.id,
    changes: { x: selectedPlayer.x + 5 },
  }));
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "source-precondition-required");
  assert.equal(missing.sourceDigest, initialDigest);

  const stale = await session.handleLine(JSON.stringify({
    op: "update_object",
    id: selectedPlayer.id,
    changes: { x: selectedPlayer.x + 5 },
    expectedSourceDigest: "source-stale",
  }));
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "stale-source");

  const applied = await session.handleLine(JSON.stringify({
    op: "update_object",
    id: selectedPlayer.id,
    changes: { x: selectedPlayer.x + 5 },
    expectedSourceDigest: initialDigest,
  }));
  assert.equal(applied.ok, true);
  assert.equal(applied.changed, true);
  assert.equal(applied.persisted, false);
  assert.equal(applied.retrySafe, false);
  assert.notEqual(applied.sourceDigest, initialDigest);
  assert.equal(session.getStatus().dirty, true);
  assert.equal(writes.length, 0);
  assert.equal(JSON.stringify(initial), original);

  const saved = await session.handleLine('{"sessionOp":"save"}');
  assert.equal(saved.ok, true);
  assert.equal(saved.persisted, true);
  assert.equal(saved.session.dirty, false);
  assert.equal(writes.length, 1);
  assert.equal(player(writes[0]).x, selectedPlayer.x + 5);

  const closed = await session.handleLine('{"sessionOp":"close"}');
  assert.equal(closed.ok, true);
  assert.equal(closed.session.closed, true);
  const afterClose = await session.handleLine('{"sessionOp":"status"}');
  assert.equal(afterClose.ok, false);
  assert.equal(afterClose.code, "session-closed");
  assert.equal(afterClose.retrySafe, false);
  assert.equal(afterClose.sequence, 8);
});

test("on-mutation and never policies make persistence behavior explicit and failure receipts non-retryable", async () => {
  const initial = createTemplate("topdown");
  const selectedPlayer = player(initial);
  const initialDigest = doctorSourceDigest(initial);
  const writes = [];
  const automatic = createSession(initial, "on-mutation", async (project) => { writes.push(project); });
  const applied = await automatic.handleLine(JSON.stringify({
    op: "update_object",
    id: selectedPlayer.id,
    changes: { x: selectedPlayer.x + 1 },
    expectedSourceDigest: initialDigest,
  }));
  assert.equal(applied.ok, true);
  assert.equal(applied.persisted, true);
  assert.equal(applied.dirty, false);
  assert.equal(writes.length, 1);

  const never = createSession(initial, "never", async () => { throw new Error("must not write"); });
  const disabled = await never.handleLine('{"sessionOp":"save"}');
  assert.equal(disabled.ok, false);
  assert.equal(disabled.code, "save-disabled");
  assert.equal(disabled.persisted, false);

  const failing = createSession(initial, "on-mutation", async () => { throw new Error("disk unavailable"); });
  const failed = await failing.handleLine(JSON.stringify({
    op: "update_object",
    id: selectedPlayer.id,
    changes: { x: selectedPlayer.x + 2 },
    expectedSourceDigest: initialDigest,
  }));
  assert.equal(failed.ok, false);
  assert.equal(failed.code, "session-persist-failed");
  assert.equal(failed.applied, true);
  assert.equal(failed.retrySafe, false);
  assert.equal(failed.dirty, true);
  assert.equal(player(failing.getProject()).x, selectedPlayer.x + 2);
});

test("every JSONL input line gets one structured result without terminating the session", async () => {
  const initial = createTemplate("blank");
  const session = createSession(initial, "never", async () => {});
  const results = [];
  results.push(await session.handleLine(""));
  results.push(await session.handleLine("not-json"));
  results.push(await session.handleLine("[]"));
  results.push(await session.handleLine('{"op":"missing-command"}'));
  results.push(await session.handleLine('{"sessionOp":"status"}'));
  assert.equal(results.length, 5);
  assert.deepEqual(results.map((result) => result.sequence), [1, 2, 3, 4, 5]);
  assert.equal(results.slice(0, 4).every((result) => result.ok === false), true);
  assert.equal(results[4].ok, true);
});

test("CLI session keeps changes in memory and writes only after an explicit save control", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-session-"));
  try {
    const projectPath = join(directory, "session.loop.json");
    const initial = createTemplate("platformer");
    const selectedPlayer = player(initial);
    const initialDigest = doctorSourceDigest(initial);
    await writeFile(projectPath, JSON.stringify(initial), "utf8");
    const results = await runCliSession(projectPath, [
      JSON.stringify({ sessionOp: "status" }),
      JSON.stringify({
        requestId: "move-player",
        command: {
          op: "update_object",
          id: selectedPlayer.id,
          changes: { x: selectedPlayer.x + 7 },
          expectedSourceDigest: initialDigest,
        },
      }),
      JSON.stringify({ sessionOp: "save" }),
      JSON.stringify({ sessionOp: "status" }),
    ]);
    assert.equal(results.length, 4);
    assert.equal(results[0].session.sourceDigest, initialDigest);
    assert.equal(results[1].requestId, "move-player");
    assert.equal(results[1].changed, true);
    assert.equal(results[1].persisted, false);
    assert.equal(results[2].persisted, true);
    assert.equal(results[3].session.dirty, false);
    const saved = JSON.parse(await readFile(projectPath, "utf8"));
    assert.equal(player(saved).x, selectedPlayer.x + 7);

    const manifest = getAgentManifest();
    assert.equal(manifest.agentJsonlSession.schemaVersion, LOOPLAB_AGENT_SESSION_SCHEMA);
    assert.match(manifest.agentJsonlSession.mutationPrecondition, /expectedSourceDigest/);
    assert.deepEqual(manifest.agentJsonlSession.savePolicies, ["explicit", "on-mutation", "never"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
