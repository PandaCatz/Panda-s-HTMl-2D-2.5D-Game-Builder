import assert from "node:assert/strict";
import test from "node:test";

import { createTemplate } from "../lib/looplab-agent-core.mjs";
import { doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import {
  LOOPLAB_SHARED_PROJECT_REBASE_SCHEMA,
  previewSharedProjectRebase,
  sharedProjectRevisionDigest,
} from "../lib/looplab-shared-project-rebase.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

test("shared revision digest covers complete project truth excluded from Doctor source", () => {
  const base = createTemplate("platformer");
  const changed = clone(base);
  changed.iteration.objective = "A coordination-only change that Doctor source excludes";
  assert.equal(doctorSourceDigest(changed), doctorSourceDigest(base));
  assert.notEqual(sharedProjectRevisionDigest(changed), sharedProjectRevisionDigest(base));
});

test("three-way rebase merges independent fields and stable-ID array edits", () => {
  const base = createTemplate("topdown");
  const local = clone(base);
  const remote = clone(base);
  local.name = "Local title";
  local.maps[0].objects.find((entry) => entry.kind === "player").x += 24;
  local.maps[0].objects.push({ id: "local-prop", kind: "decor", name: "Local prop", x: 160, y: 160, width: 32, height: 32, color: "#555555" });
  remote.background = "#30343b";
  remote.maps[0].objects.find((entry) => entry.kind === "goal").y -= 16;
  remote.maps[0].objects.push({ id: "remote-prop", kind: "decor", name: "Remote prop", x: 240, y: 160, width: 32, height: 32, color: "#777777" });

  const preview = previewSharedProjectRebase({ baseProject: base, localProject: local, remoteProject: remote });
  assert.equal(preview.schemaVersion, LOOPLAB_SHARED_PROJECT_REBASE_SCHEMA);
  assert.equal(preview.applicable, true);
  assert.equal(preview.conflicts.length, 0);
  assert.equal(preview.mergedProject.name, "Local title");
  assert.equal(preview.mergedProject.background, "#30343b");
  assert.equal(preview.mergedProject.maps[0].objects.find((entry) => entry.kind === "player").x, local.maps[0].objects.find((entry) => entry.kind === "player").x);
  assert.equal(preview.mergedProject.maps[0].objects.find((entry) => entry.kind === "goal").y, remote.maps[0].objects.find((entry) => entry.kind === "goal").y);
  assert.deepEqual(preview.mergedProject.maps[0].objects.filter((entry) => entry.id.endsWith("-prop")).map((entry) => entry.id), ["remote-prop", "local-prop"]);
  assert.match(preview.rebaseDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(preview.localChanges.join("\n"), /@local-prop/);
  assert.match(preview.remoteChanges.join("\n"), /@remote-prop/);
});

test("three-way rebase refuses same-field conflicts without choosing a winner", () => {
  const base = createTemplate("platformer");
  const local = clone(base);
  const remote = clone(base);
  local.name = "Local name";
  remote.name = "Remote name";
  const preview = previewSharedProjectRebase({ baseProject: base, localProject: local, remoteProject: remote });
  assert.equal(preview.applicable, false);
  assert.equal(preview.conflicts.length, 1);
  assert.deepEqual(preview.conflicts[0], {
    path: "/name",
    reason: "same-field-conflict",
    baseState: "string",
    localState: "string",
    remoteState: "string",
    repairAction: "Inspect the local and remote values and author one deliberate value; LoopLab will not choose either side automatically.",
  });
});

test("three-way rebase refuses stable-item deletion versus editing", () => {
  const base = createTemplate("platformer");
  const local = clone(base);
  const remote = clone(base);
  const object = base.maps[0].objects[0];
  local.maps[0].objects = local.maps[0].objects.filter((entry) => entry.id !== object.id);
  remote.maps[0].objects.find((entry) => entry.id === object.id).x += 12;
  const preview = previewSharedProjectRebase({ baseProject: base, localProject: local, remoteProject: remote });
  assert.equal(preview.applicable, false);
  assert.equal(preview.conflicts[0].reason, "delete-versus-edit");
  assert.match(preview.conflicts[0].path, new RegExp(`@${object.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
});

test("ordinary arrays stay atomic when both agents change them", () => {
  const base = createTemplate("systems");
  base.tags = ["base"];
  const local = clone(base);
  const remote = clone(base);
  local.tags.push("local");
  remote.tags.push("remote");
  const preview = previewSharedProjectRebase({ baseProject: base, localProject: local, remoteProject: remote });
  assert.equal(preview.applicable, false);
  assert.equal(preview.conflicts[0].path, "/tags");
  assert.equal(preview.conflicts[0].reason, "atomic-array-conflict");
});

test("three-way rebase validates exact supplied base and remote revisions", () => {
  const base = createTemplate("platformer");
  const local = clone(base);
  const remote = clone(base);
  remote.name = "Remote";
  assert.throws(() => previewSharedProjectRebase({
    baseProject: base,
    localProject: local,
    remoteProject: remote,
    baseRevisionDigest: `revision-${"0".repeat(64)}`,
  }), /base revision mismatch/);
  assert.throws(() => previewSharedProjectRebase({
    baseProject: base,
    localProject: local,
    remoteProject: remote,
    remoteRevisionDigest: `revision-${"0".repeat(64)}`,
  }), /remote revision mismatch/);
});
