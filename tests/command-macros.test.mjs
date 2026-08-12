import test from "node:test";
import assert from "node:assert/strict";
import { applyAgentCommand, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { canonicalJson } from "../lib/looplab-canonical-digest.mjs";
import { doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import { expandCommandMacro, listCommandMacros } from "../lib/looplab-command-macros.mjs";

const SUPPORTED_PROP_PARAMETERS = {
  mapId: "map-main",
  objectId: "vending-machine",
  name: "Vending machine",
  x: 650,
  y: 400,
  width: 32,
  height: 64,
  footprint: { offsetX: 6, offsetY: 48, width: 20, height: 16, collisionHeight: 1 },
  groundAnchor: { offsetX: 16, offsetY: 64 },
  supportMode: "auto",
  supportTolerance: 2,
  cullingPadding: 12,
};

function twoMapProject() {
  let project = createTemplate("blank");
  project = applyAgentCommand(project, {
    op: "add_map",
    map: {
      id: "map-two",
      name: "Second map",
      objects: [
        {
          id: "floor-two",
          kind: "platform",
          name: "Second floor",
          x: 0,
          y: 520,
          z: 0,
          supportZ: 0,
          width: 960,
          height: 20,
          color: "#444444",
          solid: true,
          anchorMode: "ground",
          collisionOwner: "authored-map",
          collider: { enabled: true, offsetX: 0, offsetY: 0, width: 960, height: 20, trigger: false, oneWay: true, zMin: 0, zMax: 1 },
        },
        {
          id: "spawn-two",
          kind: "spawn",
          name: "Second spawn",
          x: 86,
          y: 410,
          z: 0,
          supportZ: 0,
          width: 42,
          height: 64,
          color: "#ffffff",
          solid: false,
          anchorMode: "ground",
          collisionOwner: "authored-map",
          collider: { enabled: false, offsetX: 0, offsetY: 0, width: 42, height: 64, trigger: false, oneWay: false, zMin: 0, zMax: 1 },
        },
      ],
    },
  }).project;
  return project;
}

const ROUND_TRIP_PARAMETERS = {
  sourceMapId: "map-main",
  targetMapId: "map-two",
  forwardPortalId: "to-two",
  returnPortalId: "to-main",
  forwardTargetSpawnId: "spawn-two",
  returnTargetSpawnId: "spawn",
  transition: "fade",
};

test("command macro registry is typed, immutable-by-copy, and manifest-discoverable", () => {
  const first = listCommandMacros();
  const second = listCommandMacros();
  assert.equal(first.schemaVersion, "looplab-command-macro-registry/v1");
  assert.deepEqual(first.macros.map((macro) => macro.id), ["place-supported-prop", "connect-maps-round-trip", "protect-completion-witness"]);
  assert.ok(first.macros.every((macro) => macro.parameterSchema.$schema === "https://json-schema.org/draft/2020-12/schema"));
  assert.ok(first.macros.every((macro) => macro.parameterSchema.additionalProperties === false));
  first.macros[0].operations.push("remove_object");
  assert.deepEqual(second.macros[0].operations, ["add_object", "attach_to_support"]);
  assert.equal(getAgentManifest().commandMacros.count, 3);
});

test("macro expansion digest is canonical across parameter key order", () => {
  const project = createTemplate("blank");
  const first = expandCommandMacro(project, "place-supported-prop", SUPPORTED_PROP_PARAMETERS);
  const reordered = Object.fromEntries(Object.entries(SUPPORTED_PROP_PARAMETERS).reverse());
  reordered.footprint = Object.fromEntries(Object.entries(SUPPORTED_PROP_PARAMETERS.footprint).reverse());
  reordered.groundAnchor = Object.fromEntries(Object.entries(SUPPORTED_PROP_PARAMETERS.groundAnchor).reverse());
  const second = expandCommandMacro(project, "place-supported-prop", reordered);
  assert.match(first.expansionDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.expansionDigest, second.expansionDigest);
  assert.equal(canonicalJson(first.commands), canonicalJson(second.commands));
});

test("supported-prop preview is non-mutating and apply matches the exact canonical sequence", () => {
  const project = createTemplate("blank");
  const original = canonicalJson(project);
  const sourceDigest = doctorSourceDigest(project);
  const previewOutcome = applyAgentCommand(project, { op: "preview_command_macro", macroId: "place-supported-prop", parameters: SUPPORTED_PROP_PARAMETERS, invocationId: "preview-a" });
  const plan = previewOutcome.result;
  assert.equal(previewOutcome.changed, false);
  assert.equal(canonicalJson(project), original);
  assert.equal(plan.sourceDigest, sourceDigest);
  assert.equal(plan.invocationId, "preview-a");
  assert.equal(plan.applicable, true);
  assert.equal(plan.commands.length, 2);
  assert.equal(plan.doctor.newBlockers.length, 0);
  assert.equal("projectedProject" in plan, false);

  const applied = applyAgentCommand(project, {
    op: "apply_command_macro",
    macroId: "place-supported-prop",
    parameters: SUPPORTED_PROP_PARAMETERS,
    expectedSourceDigest: sourceDigest,
    expectedExpansionDigest: plan.expansionDigest,
    invocationId: "apply-a",
  });
  assert.equal(applied.changed, true);
  const object = applied.project.objects.find((candidate) => candidate.id === "vending-machine");
  assert.equal(object.anchorMode, "ground");
  assert.equal(object.collisionOwner, "authored-map");
  assert.equal(object.supportContact.mode, "surface");
  assert.equal(object.supportContact.surfaceId, "ground");
  assert.equal(object.collider.width, 20);
  assert.equal(object.visualBounds.width, 32);
  assert.equal(applied.result.invocationId, "apply-a");

  let explicit = project;
  for (const command of plan.commands) explicit = applyAgentCommand(explicit, command).project;
  const withoutChangeFeed = (candidate) => {
    const copy = structuredClone(candidate);
    if (copy.authoring) {
      delete copy.authoring.agentChangeFeed;
      if (!Object.keys(copy.authoring).length) delete copy.authoring;
    }
    return copy;
  };
  assert.equal(canonicalJson(withoutChangeFeed(applied.project)), canonicalJson(withoutChangeFeed(explicit)));
  assert.equal(applied.project.authoring.agentChangeFeed.events.length, 1, "macro apply must remain one resumable semantic change");
  assert.equal(explicit.authoring.agentChangeFeed.events.length, 2, "explicit commands remain separately attributable");
});

test("macro apply rejects stale source, plan drift, unknown inputs, and new Doctor blockers atomically", () => {
  const blank = createTemplate("blank");
  const preview = applyAgentCommand(blank, { op: "preview_command_macro", macroId: "place-supported-prop", parameters: SUPPORTED_PROP_PARAMETERS }).result;
  assert.throws(() => applyAgentCommand(blank, {
    op: "apply_command_macro",
    macroId: "place-supported-prop",
    parameters: { ...SUPPORTED_PROP_PARAMETERS, x: 700 },
    expectedSourceDigest: preview.sourceDigest,
    expectedExpansionDigest: preview.expansionDigest,
  }), /\[stale-macro-plan\]/);
  const changed = applyAgentCommand(blank, { op: "set_project", changes: { name: "Changed" } }).project;
  assert.throws(() => applyAgentCommand(changed, {
    op: "apply_command_macro",
    macroId: "place-supported-prop",
    parameters: SUPPORTED_PROP_PARAMETERS,
    expectedSourceDigest: preview.sourceDigest,
    expectedExpansionDigest: preview.expansionDigest,
  }), /\[stale-source\]/);
  assert.throws(() => applyAgentCommand(blank, { op: "preview_command_macro", macroId: "place-supported-prop", parameters: { ...SUPPORTED_PROP_PARAMETERS, typoWidth: 50 } }), /does not accept parameter: typoWidth/);
  assert.throws(() => applyAgentCommand(blank, { op: "preview_command_macro", macroId: "place-supported-prop", parameters: { ...SUPPORTED_PROP_PARAMETERS, footprint: undefined } }), /explicit footprint/);
  assert.throws(() => applyAgentCommand(blank, { op: "preview_command_macro", macroId: "place-supported-prop", parameters: { ...SUPPORTED_PROP_PARAMETERS, solid: "yes" } }), /solid must be a boolean/);
  assert.throws(() => applyAgentCommand(blank, { op: "preview_command_macro", macroId: "place-supported-prop", parameters: { ...SUPPORTED_PROP_PARAMETERS, visualBounds: { width: 32, height: 64, collisionHeight: 2 } } }), /visualBounds does not accept parameter: collisionHeight/);

  const protectedProject = createTemplate("platformer");
  const protectedOriginal = canonicalJson(protectedProject);
  const blockedPlan = applyAgentCommand(protectedProject, { op: "preview_command_macro", macroId: "place-supported-prop", parameters: SUPPORTED_PROP_PARAMETERS }).result;
  assert.equal(blockedPlan.applicable, false);
  assert.deepEqual(blockedPlan.doctor.newBlockers.map((issue) => issue.code), ["replay-diverged"]);
  assert.throws(() => applyAgentCommand(protectedProject, {
    op: "apply_command_macro",
    macroId: "place-supported-prop",
    parameters: SUPPORTED_PROP_PARAMETERS,
    expectedSourceDigest: blockedPlan.sourceDigest,
    expectedExpansionDigest: blockedPlan.expansionDigest,
  }), /Macro rejected: it introduces 1 new Project Doctor blocker/);
  assert.equal(canonicalJson(protectedProject), protectedOriginal);
});

test("round-trip map macro creates explicit stable portals and target spawns", () => {
  const project = twoMapProject();
  const sourceDigest = doctorSourceDigest(project);
  const plan = applyAgentCommand(project, { op: "preview_command_macro", macroId: "connect-maps-round-trip", parameters: ROUND_TRIP_PARAMETERS }).result;
  assert.equal(plan.applicable, true);
  assert.deepEqual(plan.commands.map((command) => command.op), ["connect_maps", "connect_maps"]);
  assert.deepEqual(plan.commands.map((command) => command.connectionRole), ["route-exit", "route-return"]);
  assert.ok(plan.doctor.after.errorCount < plan.doctor.before.errorCount);

  const applied = applyAgentCommand(project, {
    op: "apply_command_macro",
    macroId: "connect-maps-round-trip",
    parameters: ROUND_TRIP_PARAMETERS,
    expectedSourceDigest: sourceDigest,
    expectedExpansionDigest: plan.expansionDigest,
  }).project;
  const sourceMap = applied.maps.find((map) => map.id === "map-main");
  const targetMap = applied.maps.find((map) => map.id === "map-two");
  const forward = sourceMap.objects.find((object) => object.id === "to-two");
  const back = targetMap.objects.find((object) => object.id === "to-main");
  assert.equal(forward.targetMapId, "map-two");
  assert.equal(forward.targetSpawnId, "spawn-two");
  assert.equal(forward.runtimeJoin.enabled, true);
  assert.equal(back.targetMapId, "map-main");
  assert.equal(back.targetSpawnId, "spawn");
  assert.equal(back.role, "route-return");
});

test("completion witness macro derives, previews, and records the exact proven replay without silent replacement", () => {
  const project = createTemplate("kinetic");
  const original = canonicalJson(project);
  const completion = applyAgentCommand(project, { op: "get_completion_report", profile: "production" }).result;
  const productionBefore = applyAgentCommand(project, { op: "get_doctor", profile: "production" }).result;
  assert.equal(completion.status, "passed");
  assert.ok(completion.reproTape);
  assert.equal(productionBefore.issues.some((issue) => issue.code === "replay-fixtures-missing"), true);

  const preview = applyAgentCommand(project, { op: "preview_command_macro", macroId: "protect-completion-witness", parameters: {} });
  const plan = preview.result;
  assert.equal(preview.changed, false);
  assert.equal(canonicalJson(project), original);
  assert.equal(plan.applicable, true);
  assert.equal(plan.commands.length, 1);
  assert.equal(plan.commands[0].op, "record_replay_case");
  assert.equal(plan.commands[0].id, `completion-${completion.witnessId}`);
  assert.equal(plan.commands[0].tickRate, completion.reproTape.tickRate);
  assert.equal(plan.commands[0].tickCount, completion.reproTape.tickCount);
  assert.equal(plan.commands[0].startMapId, completion.reproTape.startMapId);
  assert.equal(plan.commands[0].startSpawnId, completion.reproTape.startSpawnId);
  assert.deepEqual(plan.commands[0].inputs, completion.reproTape.inputs);
  assert.equal(plan.commands[0].checkpointInterval, 1);
  assert.equal(plan.doctor.release.delta.warnings, -1);
  assert.equal(plan.doctor.release.newBlockers.length, 0);
  assert.equal(plan.operationResultDetail, "summary");
  assert.equal(plan.results[0].result.replayFixture.inputCount, completion.reproTape.inputs.length);
  assert.equal(plan.results[0].result.replayFixture.checkpointCount, completion.reproTape.tickCount);
  assert.equal(plan.results[0].result.replayFixture.expectedHash, completion.finalStateDigest);
  assert.equal(plan.results[0].result.replayResult.status, "passed");
  assert.equal("checkpoints" in plan.results[0].result.replayFixture, false);

  const fullPreview = applyAgentCommand(project, { op: "preview_command_macro", macroId: "protect-completion-witness", parameters: {}, detail: "full" }).result;
  assert.equal(fullPreview.operationResultDetail, "full");
  assert.equal(fullPreview.results[0].result.replayCase.checkpoints.length, completion.reproTape.tickCount);

  const applied = applyAgentCommand(project, {
    op: "apply_command_macro",
    macroId: "protect-completion-witness",
    parameters: {},
    expectedSourceDigest: plan.sourceDigest,
    expectedExpansionDigest: plan.expansionDigest,
  });
  assert.equal(applied.changed, true);
  assert.equal(applied.result.operationResultDetail, "summary");
  assert.equal(applied.result.results[0].result.replayResult.status, "passed");
  assert.equal(applied.result.results[0].result.replayFixture.expectedHash, completion.finalStateDigest);
  const suite = applyAgentCommand(applied.project, { op: "run_replay_suite" }).result;
  assert.equal(suite.status, "passed");
  assert.equal(suite.caseCount, 1);
  assert.equal(suite.cases[0].caseId, `completion-${completion.witnessId}`);
  const productionAfter = applyAgentCommand(applied.project, { op: "get_doctor", profile: "production" }).result;
  assert.equal(productionAfter.issues.some((issue) => issue.code === "replay-fixtures-missing"), false);

  assert.throws(
    () => applyAgentCommand(applied.project, { op: "preview_command_macro", macroId: "protect-completion-witness", parameters: {} }),
    /Replay fixture already exists/,
  );
  assert.throws(
    () => applyAgentCommand(createTemplate("blank"), { op: "preview_command_macro", macroId: "protect-completion-witness", parameters: {} }),
    /requires a passed deterministic completion report/,
  );
});
