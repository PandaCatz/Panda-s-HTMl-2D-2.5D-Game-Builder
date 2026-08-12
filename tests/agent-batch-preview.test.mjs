import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  LOOPLAB_AGENT_BATCH_PREVIEW_SCHEMA,
  applyAgentCommand,
  createTemplate,
  getAgentManifest,
} from "../lib/looplab-agent-core.mjs";
import { canonicalJson } from "../lib/looplab-canonical-digest.mjs";
import { getLooplabCommandContract, validateLooplabCommandInput } from "../lib/looplab-agent-contracts.mjs";
import { doctorSourceDigest } from "../lib/looplab-doctor.mjs";

function safeColorBatch(project, color = "#3f4046") {
  const platform = project.objects.find((object) => object.kind === "platform");
  assert.ok(platform);
  return [{ op: "update_object", id: platform.id, changes: { color } }];
}

test("batch preview contracts are typed, source-bound, and manifest-discoverable", () => {
  const preview = getLooplabCommandContract("preview_batch");
  const apply = getLooplabCommandContract("apply_previewed_batch");
  assert.deepEqual(preview.surfaces, ["core", "browser-session"]);
  assert.equal(preview.mutatesProject, false);
  assert.equal(preview.annotations.readOnlyHint, true);
  assert.deepEqual(preview.inputSchema.required, ["commands", "summary", "expectedSourceDigest"]);
  assert.equal(preview.inputSchema.properties.commands.maxItems, 64);
  assert.equal(apply.mutatesProject, true);
  assert.equal(apply.requiresSourceDigestInMcp, true);
  assert.equal(apply.annotations.destructiveHint, true);
  assert.deepEqual(apply.inputSchema.required, ["commands", "summary", "expectedSourceDigest", "expectedPreviewDigest"]);
  assert.equal(getAgentManifest().agentBatchPreview.schemaVersion, LOOPLAB_AGENT_BATCH_PREVIEW_SCHEMA);
});

test("preview_batch clone-executes without mutation and exact apply persists only the reviewed projection", () => {
  const project = createTemplate("blank");
  const original = canonicalJson(project);
  const sourceDigest = doctorSourceDigest(project);
  const commands = safeColorBatch(project);
  const previewOutcome = applyAgentCommand(project, {
    op: "preview_batch",
    commands,
    summary: "Use the neutral architecture color",
    expectedSourceDigest: sourceDigest,
  });
  const preview = previewOutcome.result;
  assert.equal(previewOutcome.changed, false);
  assert.equal(canonicalJson(project), original);
  assert.equal(preview.schemaVersion, LOOPLAB_AGENT_BATCH_PREVIEW_SCHEMA);
  assert.equal(preview.sourceDigest, sourceDigest);
  assert.notEqual(preview.projectedSourceDigest, sourceDigest);
  assert.match(preview.previewDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(preview.applicable, true);
  assert.equal(preview.changed, true);
  assert.equal(preview.commandErrors.length, 0);
  assert.equal(preview.doctor.newBlockers.length, 0);
  assert.equal(preview.authority.persistsProject, false);
  assert.equal(preview.authority.grantsMutationAuthority, false);
  assert.equal("projectedProject" in preview, false);
  assert.equal(preview.applyCommand.expectedPreviewDigest, preview.previewDigest);

  const applied = applyAgentCommand(project, {
    ...preview.applyCommand,
    detail: "summary",
  });
  assert.equal(applied.changed, true);
  assert.equal(applied.result.applied, true);
  assert.equal(applied.result.previewDigest, preview.previewDigest);
  const platformId = commands[0].id;
  assert.equal(applied.project.objects.find((object) => object.id === platformId).color, "#3f4046");
});

test("CLI apply preserves a preview_batch envelope instead of unwrapping and applying its inner commands", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-preview-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const projectPath = join(directory, "preview.loop.json");
  const project = createTemplate("blank");
  const original = JSON.stringify(project, null, 2) + "\n";
  await writeFile(projectPath, original, "utf8");
  const command = {
    op: "preview_batch",
    commands: safeColorBatch(project, "#4a4b50"),
    summary: "Exercise the CLI preview envelope without applying it",
    expectedSourceDigest: doctorSourceDigest(project),
  };
  const child = spawnSync(process.execPath, [resolve("scripts/looplab-agent.mjs"), "apply", projectPath], {
    cwd: resolve("."),
    input: JSON.stringify(command),
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  const output = JSON.parse(child.stdout);
  assert.equal(output.changed, false);
  assert.equal(output.commandCount, 1);
  assert.equal(output.results[0].op, "preview_batch");
  assert.equal(output.results[0].changed, false);
  assert.equal(output.results[0].result.applicable, true);
  assert.equal(await readFile(projectPath, "utf8"), original);
});

test("apply_previewed_batch rejects stale source and any reviewed-command or summary drift", () => {
  const project = createTemplate("blank");
  const sourceDigest = doctorSourceDigest(project);
  const commands = safeColorBatch(project, "#424349");
  const preview = applyAgentCommand(project, { op: "preview_batch", commands, summary: "Reviewed color change", expectedSourceDigest: sourceDigest }).result;

  const changedProject = applyAgentCommand(project, { op: "set_project", changes: { name: "Concurrent edit" }, expectedSourceDigest: sourceDigest }).project;
  assert.throws(() => applyAgentCommand(changedProject, { ...preview.applyCommand }), /\[stale-source\]/);
  assert.throws(() => applyAgentCommand(project, { ...preview.applyCommand, commands: safeColorBatch(project, "#55565b") }), /\[stale-batch-preview\]/);
  assert.throws(() => applyAgentCommand(project, { ...preview.applyCommand, summary: "Different summary" }), /\[stale-batch-preview\]/);
});

test("preview_batch reports strict nested schemas and atomically rolls back semantic failures", () => {
  const project = createTemplate("blank");
  const sourceDigest = doctorSourceDigest(project);
  const platform = project.objects.find((object) => object.kind === "platform");
  const strict = applyAgentCommand(project, {
    op: "preview_batch",
    expectedSourceDigest: sourceDigest,
    summary: "Reject an unknown nested field",
    commands: [{ op: "update_object", id: platform.id, changes: { color: "#444" }, typo: true }],
  }).result;
  assert.equal(strict.applicable, false);
  assert.equal(strict.changed, false);
  assert.equal(strict.rolledBack, true);
  assert.equal(strict.commandErrors[0].stage, "schema");
  assert.match(strict.commandErrors[0].message, /unsupported additional property/);

  const semantic = applyAgentCommand(project, {
    op: "preview_batch",
    expectedSourceDigest: sourceDigest,
    summary: "Second command fails after a valid first command",
    commands: [
      { op: "update_object", id: platform.id, changes: { color: "#555555" } },
      { op: "update_object", id: "missing-object", changes: { x: 12 } },
    ],
  }).result;
  assert.equal(semantic.applicable, false);
  assert.equal(semantic.changed, false);
  assert.equal(semantic.rolledBack, true);
  assert.equal(semantic.commandErrors[0].index, 1);
  assert.equal(semantic.commandErrors[0].stage, "execution");
  assert.match(semantic.commandErrors[0].message, /not found/);
  assert.equal(semantic.projectedSourceDigest, sourceDigest);

  const envelope = validateLooplabCommandInput({ op: "update_object", id: platform.id, changes: { x: 1 }, expectedSourceDigest: sourceDigest }, { rejectTransportEnvelope: true });
  assert.equal(envelope.valid, false);
  assert.match(envelope.errors.join(" "), /belongs on the batch envelope/);
});

test("preview_batch requires stable authored identities and rejects newly introduced blockers in either Doctor profile", () => {
  const project = createTemplate("blank");
  const sourceDigest = doctorSourceDigest(project);
  const unstable = applyAgentCommand(project, {
    op: "preview_batch",
    expectedSourceDigest: sourceDigest,
    summary: "Do not generate an identity between preview and apply",
    commands: [{ op: "add_object", kind: "decor", object: { name: "Missing stable id", x: 40, y: 40, width: 20, height: 20 } }],
  }).result;
  assert.equal(unstable.applicable, false);
  assert.equal(unstable.commandErrors.some((entry) => entry.stage === "stability"), true);

  const blocked = applyAgentCommand(project, {
    op: "preview_batch",
    expectedSourceDigest: sourceDigest,
    summary: "A floating floor prop must be rejected",
    commands: [{
      op: "add_object",
      kind: "decor",
      object: {
        id: "floating-vending-machine",
        name: "Floating vending machine",
        x: 320,
        y: 120,
        width: 40,
        height: 72,
        role: "prop",
        requiresSupport: true,
        anchorMode: "ground",
        collisionOwner: "authored-map",
        groundAnchor: { offsetX: 20, offsetY: 72 },
        visualBounds: { offsetX: 0, offsetY: 0, width: 40, height: 72 },
        collider: { enabled: true, offsetX: 6, offsetY: 54, width: 28, height: 18, trigger: false, oneWay: false, zMin: 0, zMax: 1 },
      },
    }],
  }).result;
  assert.equal(blocked.applicable, false);
  assert.equal(blocked.doctor.newBlockers.some((issue) => issue.code === "support-missing"), true);
  assert.throws(() => applyAgentCommand(project, { ...blocked.applyCommand, op: "apply_previewed_batch" }), /expectedPreviewDigest/);
});
