import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createTemplate } from "../lib/looplab-agent-core.mjs";
import { doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import {
  LOOPLAB_SHARED_PROJECT_STORE_POLICY,
  createSharedProjectStore,
  normalizeSharedProjectId,
} from "../lib/looplab-shared-project-store.mjs";
import { sharedProjectRevisionDigest } from "../lib/looplab-shared-project-rebase.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

async function withStore(run) {
  const workspace = await mkdtemp(join(tmpdir(), "looplab-shared-project-store-"));
  const store = createSharedProjectStore({ workspaceRoot: workspace });
  try {
    await run({ workspace, store });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

test("shared project store creates, lists, reads, and updates validated projects", async () => {
  await withStore(async ({ store }) => {
    const project = createTemplate("platformer");
    const created = await store.put({
      id: "courier-foundry",
      project,
      createOnly: true,
      metadata: { origin: "folder", sourceLabel: "Games/Courier/project.loop.json", folderName: "Courier" },
    });
    assert.equal(created.created, true);
    assert.equal(created.changed, true);
    assert.equal(created.idempotent, false);
    assert.equal(created.sourceDigest, doctorSourceDigest(project));
    assert.equal(created.revisionDigest, sharedProjectRevisionDigest(project));
    assert.equal(created.summary.projectPath, ".looplab/projects/courier-foundry/project.loop.json");
    assert.equal(created.summary.folderName, "Courier");

    const listed = await store.list();
    assert.equal(listed.count, 1);
    assert.equal(listed.invalidCount, 0);
    assert.equal(listed.projects[0].id, "courier-foundry");
    assert.equal(listed.projects[0].revisionDigest, created.revisionDigest);

    const changed = clone(project);
    changed.name = "Courier Foundry — Shared";
    const updated = await store.put({ id: "courier-foundry", project: changed, expectedRevisionDigest: created.revisionDigest });
    assert.equal(updated.created, false);
    assert.equal(updated.changed, true);
    assert.equal(updated.project.name, changed.name);
    assert.notEqual(updated.sourceDigest, created.sourceDigest);
    assert.equal((await store.get("courier-foundry")).revisionDigest, updated.revisionDigest);
  });
});
test("same-content retries are idempotent without rewriting the canonical project", async () => {
  await withStore(async ({ store }) => {
    const project = createTemplate("topdown");
    const created = await store.put({ id: "same-content", project, createOnly: true });
    const before = await readFile(store.resolvePaths("same-content").project, "utf8");
    const retried = await store.put({ id: "same-content", project, expectedRevisionDigest: "revision-" + "0".repeat(64) });
    const after = await readFile(store.resolvePaths("same-content").project, "utf8");
    assert.equal(retried.idempotent, true);
    assert.equal(retried.changed, false);
    assert.equal(retried.revisionDigest, created.revisionDigest);
    assert.equal(after, before);
  });
});

test("concurrent writers using one revision digest produce one winner and one stale-revision rejection", async () => {
  await withStore(async ({ store }) => {
    const project = createTemplate("platformer");
    const created = await store.put({ id: "race", project, createOnly: true });
    const first = clone(project);
    first.name = "Race winner A";
    const second = clone(project);
    second.name = "Race winner B";
    const outcomes = await Promise.allSettled([
      store.put({ id: "race", project: first, expectedRevisionDigest: created.revisionDigest }),
      store.put({ id: "race", project: second, expectedRevisionDigest: created.revisionDigest }),
    ]);
    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.statusCode, 412);
    assert.equal(rejected[0].reason.code, "stale-revision");
    const stored = await store.get("race");
    assert.equal(stored.revisionDigest, fulfilled[0].value.revisionDigest);
    assert.equal(stored.project.name, fulfilled[0].value.project.name);
  });
});

test("non-Doctor project changes still advance the strong revision and reject stale writers", async () => {
  await withStore(async ({ store }) => {
    const project = createTemplate("platformer");
    const created = await store.put({ id: "evidence-race", project, createOnly: true });
    const first = clone(project);
    first.iteration = { ...first.iteration, objective: "First agent evidence pass" };
    const second = clone(project);
    second.iteration = { ...second.iteration, objective: "Second agent evidence pass" };
    assert.equal(doctorSourceDigest(first), created.sourceDigest, "iteration metadata is deliberately outside Doctor gameplay truth");
    assert.equal(doctorSourceDigest(second), created.sourceDigest);
    const updated = await store.put({ id: "evidence-race", project: first, expectedRevisionDigest: created.revisionDigest });
    assert.equal(updated.sourceDigest, created.sourceDigest);
    assert.notEqual(updated.revisionDigest, created.revisionDigest);
    await assert.rejects(
      store.put({ id: "evidence-race", project: second, expectedRevisionDigest: created.revisionDigest }),
      (error) => error.statusCode === 412 && error.code === "stale-revision",
    );
    assert.equal((await store.get("evidence-race")).project.iteration.objective, "First agent evidence pass");
  });
});

test("create-only collisions, missing update preconditions, unsafe IDs, and invalid sources cannot mutate the store", async () => {
  await withStore(async ({ store }) => {
    const project = createTemplate("systems");
    const created = await store.put({ id: "protected", project, createOnly: true });
    const changed = clone(project);
    changed.name = "Different candidate";

    await assert.rejects(store.put({ id: "protected", project: changed, createOnly: true }), (error) => error.statusCode === 412 && error.code === "shared-project-create-conflict");
    await assert.rejects(store.put({ id: "protected", project: changed }), (error) => error.statusCode === 428 && error.code === "shared-project-precondition-required");
    await assert.rejects(store.put({ id: "../escape", project, createOnly: true }), /character slug/);
    await assert.rejects(store.put({ id: "invalid", project: { name: "broken" }, createOnly: true }), /Shared project is invalid/);
    assert.equal((await store.get("protected")).sourceDigest, created.sourceDigest);
    assert.equal((await store.list()).count, 1);
  });
});

test("invalid and temporary filesystem entries never become listed projects", async () => {
  await withStore(async ({ workspace, store }) => {
    const project = createTemplate("platformer");
    await store.put({ id: "valid", project, createOnly: true });
    const invalidPaths = store.resolvePaths("invalid-json");
    await writeFile(join(workspace, ".looplab", "projects", "stray.tmp"), "ignored", "utf8");
    await writeFile(`${store.resolvePaths("valid").project}.tmp-orphan`, "ignored", "utf8");
    await writeFile(invalidPaths.project, "{", { encoding: "utf8", flag: "w" }).catch(async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(invalidPaths.directory, { recursive: true });
      await writeFile(invalidPaths.project, "{", "utf8");
    });
    const listed = await store.list();
    assert.equal(listed.count, 1);
    assert.equal(listed.invalidCount, 1);
    assert.equal(listed.projects[0].id, "valid");
  });
});

test("store policy and ID normalization stay bounded and path-free", () => {
  assert.equal(normalizeSharedProjectId("Courier-Foundry"), "courier-foundry");
  assert.throws(() => normalizeSharedProjectId("a/b"), /character slug/);
  assert.throws(() => normalizeSharedProjectId("a".repeat(65)), /character slug/);
  assert.equal(LOOPLAB_SHARED_PROJECT_STORE_POLICY.relativeRoot, ".looplab/projects");
  assert.equal(LOOPLAB_SHARED_PROJECT_STORE_POLICY.maximumProjects, 256);
});
