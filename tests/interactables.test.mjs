import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { applyAgentCommand, buildStandaloneHtml, createTemplate } from "../lib/looplab-agent-core.mjs";
import { buildAgentProjectContext } from "../lib/looplab-agent-context.mjs";
import { analyzeProject, doctorSourceDigest } from "../lib/looplab-doctor.mjs";

import {
  LOOPLAB_INTERACTABLE_INSTANCE_SCHEMA,
  LOOPLAB_INTERACTABLE_KINDS,
  LOOPLAB_INTERACTABLE_TEMPLATE_REGISTRY,
  assertInteractablePreview,
  getInteractableTemplate,
  inspectInteractables,
  listInteractableTemplates,
  materializeInteractableTemplate,
  resolveInteractableParameters,
} from "../lib/looplab-interactables.mjs";

function projectWithPreview(preview, controlMode = "platformer") {
  return {
    name: "Interactable fixture",
    activeMapId: "map-main",
    startMapId: "map-main",
    controlMode,
    objects: preview.objects,
    maps: [{ id: "map-main", name: "Main", width: 960, height: 540, gravity: controlMode === "platformer" ? 1500 : 0, grid: 20, background: "#dddddd", controlMode, objects: preview.objects }],
  };
}

test("the native interactable registry ships seven complete, digested authored templates", () => {
  assert.equal(LOOPLAB_INTERACTABLE_TEMPLATE_REGISTRY.templates.length, 7);
  assert.match(LOOPLAB_INTERACTABLE_TEMPLATE_REGISTRY.digest, /^sha256:[a-f0-9]{64}$/);
  const ids = LOOPLAB_INTERACTABLE_TEMPLATE_REGISTRY.templates.map((entry) => entry.id);
  assert.deepEqual(ids, ["spring", "ladder", "conveyor", "crumble-platform", "key-door", "pressure-plate", "one-way-platform"]);
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of LOOPLAB_INTERACTABLE_TEMPLATE_REGISTRY.templates) {
    assert.match(entry.digest, /^sha256:[a-f0-9]{64}$/);
    assert.ok(entry.objectPlan.length > 0);
    assert.ok(entry.events.length > 0);
    assert.ok(entry.featureContract.acceptanceTests.length > 0);
    assert.ok(entry.fixtures.acceptance.requirements.length > 0);
    assert.equal(entry.fixtures.replay.requiredEvent, entry.events.find((event) => event === entry.fixtures.replay.requiredEvent));
    assert.equal(entry.authority.artAuthority, false);
    assert.equal(entry.authority.collisionOwner, "authored-map");
  }
  assert.deepEqual(new Set(LOOPLAB_INTERACTABLE_KINDS), new Set(["spring", "ladder", "conveyor", "crumble-platform", "key", "door", "pressure-plate", "one-way-platform"]));
});

test("template discovery is bounded and exposes exact parameter and evidence contracts", () => {
  const platformer = listInteractableTemplates({ controlMode: "platformer", query: "support", limit: 2 });
  assert.ok(platformer.templates.length <= 2);
  assert.ok(platformer.templates.some((entry) => entry.id === "conveyor"));
  const detail = getInteractableTemplate("ladder");
  assert.equal(detail.template.parameters.requireFreshInteract.default, true);
  assert.match(detail.template.featureContract.placementRules, /explicit/i);
  assert.equal(detail.template.fixtures.replay.requiredEvent, "ladder.entered");
  assert.throws(() => getInteractableTemplate("missing"), /Unknown interactable template/);
});

test("materialization records explicit overrides while preserving versioned defaults", () => {
  const sourceDigest = `source-${"a".repeat(64)}`;
  const preview = materializeInteractableTemplate({
    templateId: "spring",
    instanceId: "launch-west",
    mapId: "map-main",
    sourceDigest,
    x: 100,
    y: 400,
    parameters: { impulseY: -900 },
  });
  assert.equal(preview.parameters.impulseY, -900);
  assert.equal(preview.parameters.cooldownTicks, 8);
  assert.deepEqual(preview.overrides, { impulseY: -900 });
  assert.equal(preview.objects[0].interactable.schemaVersion, LOOPLAB_INTERACTABLE_INSTANCE_SCHEMA);
  assert.equal(preview.objects[0].interactable.templateDigest, preview.templateDigest);
  assert.equal(preview.objects[0].collisionOwner, "authored-map");
  assert.equal(preview.objects[0].collider.trigger, true);
  assert.equal(preview.objects[0].x + preview.objects[0].groundAnchor.offsetX, 100);
  assert.equal(preview.objects[0].y + preview.objects[0].groundAnchor.offsetY, 400);
  assert.doesNotThrow(() => assertInteractablePreview(preview, { sourceDigest, templateDigest: preview.templateDigest, previewDigest: preview.previewDigest }));
  assert.throws(() => assertInteractablePreview(preview, { sourceDigest: `source-${"b".repeat(64)}` }), /stale-source/);
  assert.throws(() => assertInteractablePreview({ ...preview, previewDigest: `sha256:${"0".repeat(64)}` }), /preview digest/);
});

test("multi-object templates preserve exact ground-anchor offsets", () => {
  const preview = materializeInteractableTemplate({
    templateId: "key-door",
    instanceId: "anchored-lock",
    mapId: "map-main",
    sourceDigest: `source-${"e".repeat(64)}`,
    x: 160,
    y: 420,
    parameters: { doorOffsetX: 140, doorOffsetY: -24 },
  });
  const [key, door] = preview.objects;
  assert.deepEqual(
    { x: key.x + key.groundAnchor.offsetX, y: key.y + key.groundAnchor.offsetY },
    { x: 160, y: 420 },
  );
  assert.deepEqual(
    { x: door.x + door.groundAnchor.offsetX, y: door.y + door.groundAnchor.offsetY },
    { x: 300, y: 396 },
  );
});

test("parameter validation rejects unknown, unstable, and unbounded values", () => {
  assert.throws(() => resolveInteractableParameters("spring", { madeUp: true }), /Unknown spring parameter/);
  assert.throws(() => resolveInteractableParameters("spring", { impulseY: Infinity }), /finite number/);
  assert.throws(() => resolveInteractableParameters("ladder", { climbSpeed: 0 }), /20 through 1200/);
  assert.throws(() => resolveInteractableParameters("key-door", { keyId: "bad key id" }), /stable ID/);
  assert.throws(() => materializeInteractableTemplate({ templateId: "spring", instanceId: "bad id", x: 0, y: 0 }), /instanceId/);
});

test("all seven bundles pass strict role, collider, digest, and reference inspection", () => {
  for (const [index, template] of LOOPLAB_INTERACTABLE_TEMPLATE_REGISTRY.templates.entries()) {
    const controlMode = template.controlModes[0];
    const preview = materializeInteractableTemplate({ templateId: template.id, instanceId: `fixture-${index}`, mapId: "map-main", sourceDigest: `source-${"c".repeat(64)}`, x: 64, y: 256 });
    const report = inspectInteractables(projectWithPreview(preview, controlMode));
    assert.equal(report.valid, true, `${template.id}: ${report.errors.join("\n")}`);
    assert.equal(report.instanceCount, 1);
    assert.equal(report.objectCount, template.objectPlan.length);
  }
});

test("inspection rejects detached roles, changed template bytes, sensor/solid drift, and broken plate targets", () => {
  const preview = materializeInteractableTemplate({ templateId: "pressure-plate", instanceId: "plate-a", mapId: "map-main", sourceDigest: `source-${"d".repeat(64)}`, x: 32, y: 400 });
  const project = projectWithPreview(preview);
  project.maps[0].objects[0].interactable.templateDigest = `sha256:${"0".repeat(64)}`;
  project.maps[0].objects[0].collider.trigger = false;
  project.maps[0].objects[0].interactable.parameters.targetObjectIds = ["missing-gate"];
  project.maps[0].objects.pop();
  const report = inspectInteractables(project);
  assert.equal(report.valid, false);
  assert.match(report.errors.join("\n"), /templateDigest/);
  assert.match(report.errors.join("\n"), /sensor role/);
  assert.match(report.errors.join("\n"), /exact roles/);
  assert.match(report.errors.join("\n"), /missing target/);
});

test("canonical preview/apply is source-bound and visible to Doctor and bounded agent context", () => {
  const project = createTemplate("platformer");
  const previewOutcome = applyAgentCommand(project, {
    op: "preview_interactable_template",
    templateId: "spring",
    instanceId: "command-pad",
    mapId: project.activeMapId,
    x: 240,
    y: 480,
    parameters: { impulseY: -840 },
  });
  assert.equal(previewOutcome.changed, false);
  const preview = previewOutcome.result;
  assert.equal(preview.sourceDigest, doctorSourceDigest(project));
  assert.equal(preview.applicable, true);
  assert.throws(() => applyAgentCommand(project, {
    op: "apply_interactable_template",
    templateId: "spring",
    instanceId: "command-pad",
    mapId: project.activeMapId,
    x: 240,
    y: 480,
    parameters: { impulseY: -840 },
    expectedSourceDigest: `source-${"0".repeat(64)}`,
    templateDigest: preview.templateDigest,
    previewDigest: preview.previewDigest,
  }), /stale-source/);
  const applied = applyAgentCommand(project, {
    op: "apply_interactable_template",
    templateId: "spring",
    instanceId: "command-pad",
    mapId: project.activeMapId,
    x: 240,
    y: 480,
    parameters: { impulseY: -840 },
    expectedSourceDigest: preview.sourceDigest,
    templateDigest: preview.templateDigest,
    previewDigest: preview.previewDigest,
  });
  assert.equal(applied.changed, true);
  const report = applyAgentCommand(applied.project, { op: "get_interactable_report" }).result;
  assert.equal(report.valid, true);
  assert.equal(report.instanceCount, 1);
  const doctor = analyzeProject(applied.project, { profile: "production" });
  assert.equal(doctor.interactableReport.instanceCount, 1);
  assert.ok(doctor.issues.some((issue) => issue.code === "interactable-evidence-missing"));
  const context = buildAgentProjectContext(applied.project, { sourceDigest: doctor.sourceDigest, doctor, view: "campaign" });
  assert.equal(context.authoring.interactables.instanceCount, 1);
  assert.equal(context.authoring.interactables.registryDigest, LOOPLAB_INTERACTABLE_TEMPLATE_REGISTRY.digest);
  assert.ok(context.maps.entries.some((entry) => entry.interactables.instanceIds.includes("command-pad")));
});

test("the complete native interactable vocabulary survives every release-ready one-file renderer adapter", () => {
  let project = createTemplate("blank");
  const instanceIds = [];
  for (const [index, template] of LOOPLAB_INTERACTABLE_TEMPLATE_REGISTRY.templates.entries()) {
    const instanceId = `adapter-${template.id}`;
    instanceIds.push(instanceId);
    const specification = {
      op: "preview_interactable_template",
      templateId: template.id,
      instanceId,
      mapId: project.activeMapId,
      x: 100 + index * 100,
      y: 480,
      parameters: {},
    };
    const preview = applyAgentCommand(project, specification).result;
    project = applyAgentCommand(project, {
      ...specification,
      op: "apply_interactable_template",
      expectedSourceDigest: preview.sourceDigest,
      templateDigest: preview.templateDigest,
      previewDigest: preview.previewDigest,
    }).project;
  }

  for (const framework of ["canvas", "phaser", "pixi", "melon"]) {
    const routed = applyAgentCommand(project, { op: "set_runtime_profile", framework, reason: "Prove interactable adapter parity." }).project;
    const html = buildStandaloneHtml(routed);
    assert.match(html, new RegExp(`const runtimeFramework=${JSON.stringify(framework)}`), framework);
    for (const instanceId of instanceIds) assert.match(html, new RegExp(instanceId), `${framework}:${instanceId}`);
  }
});

test("the mouse and keyboard editor cannot detach one role from a native interactable instance", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /if \(selected\.interactable\?\.instanceId\) \{\s*removeInteractableInstance\(selected\.interactable\.instanceId\);/);
  assert.match(page, /Individual roles cannot be duplicated or deleted\./);
  assert.match(page, /Remove complete \{selected\.interactable\.instanceId\} instance/);
  assert.match(page, /Native mechanics must be copied as a complete instance from the template preview\./);
});
