import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { createTemplate } from "../lib/looplab-agent-core.mjs";
import { LOOPLAB_SESSION_HEADER } from "../lib/looplab-companion-session.mjs";
import { readLooplabProjectFile, writeLooplabProjectFile } from "../lib/looplab-project-file.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

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

async function waitForCompanion(child, stderrRef) {
  await new Promise((resolveReady, rejectReady) => {
    let stdout = "";
    const timer = setTimeout(() => rejectReady(new Error(`Companion startup timed out: ${stderrRef.value}`)), 10_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!stdout.includes('"type":"companion.ready"')) return;
      clearTimeout(timer);
      resolveReady();
    });
    child.once("exit", (code) => rejectReady(new Error(`Companion exited during startup (${code}): ${stderrRef.value}`)));
  });
}

async function runAgentCli(args, environment) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [resolve("scripts/looplab-agent.mjs"), ...args], {
      cwd: resolve("."),
      env: { ...process.env, ...environment },
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code !== 0) rejectRun(new Error(`Agent CLI exited ${code}: ${stderr || stdout}`));
      else {
        try { resolveRun(JSON.parse(stdout)); } catch { rejectRun(new Error(`Agent CLI returned non-JSON output: ${stdout}\n${stderr}`)); }
      }
    });
  });
}

test("real companion mounts one authenticated shared project store with strong stale-write arbitration", { timeout: 45_000 }, async () => {
  const workspace = await mkdtemp(join(tmpdir(), "looplab-shared-companion-"));
  const sessionFile = join(workspace, ".looplab", "companion-session.json");
  const storeRoot = join(workspace, ".looplab", "projects");
  const port = await availablePort();
  const token = "looplab-shared-store-session-token-0123456789";
  const child = spawn(process.execPath, [resolve("scripts/looplab-companion.mjs")], {
    cwd: resolve("."),
    env: {
      ...process.env,
      LOOPLAB_COMPANION_PORT: String(port),
      LOOPLAB_COMPANION_SESSION_FILE: sessionFile,
      LOOPLAB_COMPANION_SESSION_ID: "shared-project-store-test",
      LOOPLAB_COMPANION_TOKEN: token,
      LOOPLAB_SHARED_PROJECT_WORKSPACE: workspace,
      LOOPLAB_SHARED_PROJECT_STORE_ROOT: storeRoot,
    },
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stderrRef = { value: "" };
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderrRef.value += chunk; });
  const url = `http://127.0.0.1:${port}`;
  const auth = { [LOOPLAB_SESSION_HEADER]: token };
  const cliEnvironment = {
    LOOPLAB_COMPANION_URL: url,
    LOOPLAB_COMPANION_SESSION_FILE: sessionFile,
  };
  try {
    await waitForCompanion(child, stderrRef);

    const health = await fetch(`${url}/health`);
    assert.equal(health.status, 200);
    const healthValue = await health.json();
    assert.equal(healthValue.sharedProjectStore.mounted, true);
    assert.equal(healthValue.sharedProjectStore.relativeRoot, ".looplab/projects");

    const unauthorizedList = await fetch(`${url}/projects`);
    assert.equal(unauthorizedList.status, 401);

    const project = createTemplate("platformer");
    const createResponse = await fetch(`${url}/projects/companion-race`, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json", "If-None-Match": "*" },
      body: JSON.stringify({ project, createOnly: true, metadata: { origin: "local", sourceLabel: "Companion integration test" } }),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(created.created, true);
    assert.equal(createResponse.headers.get("etag"), `"${created.revisionDigest}"`);

    const listResponse = await fetch(`${url}/projects`, { headers: auth });
    assert.equal(listResponse.status, 200);
    const listed = await listResponse.json();
    assert.equal(listed.count, 1);
    assert.equal(listed.projects[0].id, "companion-race");
    assert.equal(listed.projects[0].revisionDigest, created.revisionDigest);
    assert.equal(listed.projects[0].iteration.id, project.iteration.id);
    assert.equal(Object.hasOwn(listed.projects[0].iteration, "objective"), false);

    const cliProjects = await runAgentCli(["projects"], cliEnvironment);
    assert.equal(cliProjects.ok, true);
    assert.equal(cliProjects.projects[0].id, "companion-race");
    assert.equal(cliProjects.projects[0].revisionDigest, created.revisionDigest);

    const cliSelected = await runAgentCli(["select-project", "companion-race", "--full"], cliEnvironment);
    assert.equal(cliSelected.ok, true);
    assert.equal(cliSelected.revisionDigest, created.revisionDigest);
    assert.equal(cliSelected.project.name, project.name);

    const cliSource = join(workspace, "cli-published.loop.json");
    const cliProject = createTemplate("topdown");
    await writeFile(cliSource, `${JSON.stringify(cliProject, null, 2)}\n`, "utf8");
    const cliPublished = await runAgentCli(["publish-project", cliSource, "--id=cli-published", "--create-only"], cliEnvironment);
    assert.equal(cliPublished.ok, true);
    assert.equal(cliPublished.created, true);
    assert.equal(cliPublished.summary.id, "cli-published");
    cliProject.name = "CLI conditional update";
    await writeFile(cliSource, `${JSON.stringify(cliProject, null, 2)}\n`, "utf8");
    const cliUpdated = await runAgentCli(["publish-project", cliSource, "--id=cli-published", `--revision-digest=${cliPublished.revisionDigest}`], cliEnvironment);
    assert.equal(cliUpdated.ok, true);
    assert.equal(cliUpdated.created, false);
    assert.equal(cliUpdated.summary.name, "CLI conditional update");

    const readResponse = await fetch(`${url}/projects/companion-race`, { headers: auth });
    assert.equal(readResponse.status, 200);
    const read = await readResponse.json();
    assert.equal(read.project.name, project.name);
    assert.equal(readResponse.headers.get("etag"), `"${created.revisionDigest}"`);

    const adapterProject = createTemplate("topdown");
    const adapterCreate = await fetch(`${url}/projects/core-adapter`, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json", "If-None-Match": "*" },
      body: JSON.stringify({ project: adapterProject, createOnly: true }),
    });
    assert.equal(adapterCreate.status, 201);
    const adapterCreated = await adapterCreate.json();
    const adapterPath = ".looplab/projects/core-adapter/project.loop.json";
    const adapterRead = await readLooplabProjectFile(adapterPath, { workspaceRoot: workspace });
    assert.equal(adapterRead.sharedProjectId, "core-adapter");
    assert.equal(adapterRead.revisionDigest, adapterCreated.revisionDigest);
    const adapterCandidate = clone(adapterRead.project);
    adapterCandidate.iteration.objective = "Advance authoring evidence without changing the Doctor gameplay projection.";
    await writeLooplabProjectFile(adapterPath, adapterCandidate, {
      workspaceRoot: workspace,
      expectedRevisionDigest: adapterRead.revisionDigest,
    });
    const adapterAdvanced = await readLooplabProjectFile(adapterPath, { workspaceRoot: workspace });
    assert.notEqual(adapterAdvanced.revisionDigest, adapterRead.revisionDigest);
    assert.equal(adapterAdvanced.sourceDigest, adapterRead.sourceDigest, "non-Doctor authoring state may retain gameplay source truth");
    const staleAdapterCandidate = clone(adapterRead.project);
    staleAdapterCandidate.name = "Stale core MCP writer";
    await assert.rejects(
      writeLooplabProjectFile(adapterPath, staleAdapterCandidate, {
        workspaceRoot: workspace,
        expectedRevisionDigest: adapterRead.revisionDigest,
      }),
      (error) => error?.code === "stale-revision" && error?.statusCode === 412,
    );

    const first = clone(project);
    first.name = "Companion writer A";
    const second = clone(project);
    second.name = "Companion writer B";
    const write = (candidate) => fetch(`${url}/projects/companion-race`, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json", "If-Match": `"${created.revisionDigest}"` },
      body: JSON.stringify({ project: candidate, expectedRevisionDigest: created.revisionDigest }),
    });
    const race = await Promise.all([write(first), write(second)]);
    assert.deepEqual(race.map((response) => response.status).sort((a, b) => a - b), [200, 412]);
    const winnerResponse = race.find((response) => response.status === 200);
    const staleResponse = race.find((response) => response.status === 412);
    const winner = await winnerResponse.json();
    const stale = await staleResponse.json();
    assert.equal(stale.code, "stale-revision");
    assert.equal(stale.got, winner.revisionDigest);
    assert.match(stale.repairAction, /rebase/i);

    const stored = await (await fetch(`${url}/projects/companion-race`, { headers: auth })).json();
    assert.equal(stored.revisionDigest, winner.revisionDigest);
    assert.equal(stored.project.name, winner.summary.name);
    const canonicalBytes = await readFile(join(storeRoot, "companion-race", "project.loop.json"), "utf8");
    assert.equal(JSON.parse(canonicalBytes).name, winner.summary.name);

    const invalidCondition = await fetch(`${url}/projects/companion-race`, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json", "If-Match": "not-a-digest" },
      body: JSON.stringify({ project: stored.project }),
    });
    assert.equal(invalidCondition.status, 400);
    assert.equal((await invalidCondition.json()).code, "shared-project-condition-invalid");
  } finally {
    if (child.exitCode === null) child.kill();
    await new Promise((resolveExit) => child.exitCode === null ? child.once("exit", resolveExit) : resolveExit());
    await rm(workspace, { recursive: true, force: true });
  }
});
