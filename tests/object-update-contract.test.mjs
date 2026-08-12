import assert from "node:assert/strict";
import test from "node:test";

import { applyAgentCommand, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { getLooplabCommandContract, validateLooplabCommandInput } from "../lib/looplab-agent-contracts.mjs";
import { doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import { LOOPLAB_OBJECT_UPDATE_FIELDS, LOOPLAB_OBJECT_UPDATE_POLICY } from "../lib/looplab-object-fields.mjs";

test("update_object publishes and enforces one strict nested field contract", () => {
  const contract = getLooplabCommandContract("update_object");
  assert.equal(contract.inputSchema.properties.changes.additionalProperties, false);
  assert.equal(contract.inputSchema.properties.changes.minProperties, 1);
  assert.deepEqual(Object.keys(contract.inputSchema.properties.changes.properties), [...LOOPLAB_OBJECT_UPDATE_FIELDS]);

  const project = createTemplate("blank");
  const object = project.objects.find((candidate) => candidate.kind === "platform");
  const sourceDigest = doctorSourceDigest(project);
  const invalid = validateLooplabCommandInput({
    op: "update_object",
    id: object.id,
    expectedSourceDigest: sourceDigest,
    changes: { inventedGameplayGeometry: true },
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => /changes\.inventedGameplayGeometry is an unsupported additional property/.test(error)));

  const manifest = getAgentManifest();
  assert.deepEqual(manifest.objectAuthoring, LOOPLAB_OBJECT_UPDATE_POLICY);
});

test("the canonical core rejects arbitrary and protected object keys without mutating source", () => {
  const project = createTemplate("blank");
  const object = project.objects.find((candidate) => candidate.kind === "platform");
  const before = JSON.stringify(project);

  assert.throws(() => applyAgentCommand(project, { op: "update_object", id: object.id, changes: { typoField: 12 } }), /unsupported field: typoField/);
  assert.throws(() => applyAgentCommand(project, { op: "update_object", id: object.id, changes: { id: "renamed" } }), /cannot change id/);
  assert.throws(() => applyAgentCommand(project, { op: "update_object", id: object.id, changes: { kind: "hazard" } }), /cannot change kind/);
  assert.throws(() => applyAgentCommand(project, { op: "update_object", id: object.id, changes: { motionBody: {} } }), /use set_motion_body/);
  assert.throws(() => applyAgentCommand(project, { op: "update_object", id: object.id, changes: { collisionOwner: "generated-art" } }), /except authored-map/);
  assert.equal(JSON.stringify(project), before);
});

test("declared visual, spatial, culling, and gameplay-state fields remain authorable", () => {
  const project = createTemplate("blank");
  const object = project.objects.find((candidate) => candidate.kind === "platform");
  const outcome = applyAgentCommand(project, {
    op: "update_object",
    id: object.id,
    changes: { x: object.x + 12, color: "#414247", hidden: false, role: "terrain", cullingPadding: 96, active: true },
  });
  const updated = outcome.project.objects.find((candidate) => candidate.id === object.id);
  assert.equal(updated.x, object.x + 12);
  assert.equal(updated.color, "#414247");
  assert.equal(updated.cullingPadding, 96);
  assert.equal(updated.active, true);
  assert.deepEqual(outcome.result.changedFields, ["x", "color", "hidden", "role", "cullingPadding", "active"]);
});