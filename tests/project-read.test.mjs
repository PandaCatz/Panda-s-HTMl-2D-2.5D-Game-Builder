import assert from "node:assert/strict";
import test from "node:test";

import { applyAgentCommand, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { getLooplabCommandContract, validateLooplabCommandInput } from "../lib/looplab-agent-contracts.mjs";

test("compact get_project hides embedded payloads and reports exactly what was omitted", () => {
  const project = createTemplate("kinetic");
  const result = applyAgentCommand(project, { op: "get_project", compact: true }).result;
  const serialized = JSON.stringify(result);
  assert.equal(result.mode, "full");
  assert.equal(result.compact, true);
  assert.match(result.sourceDigest, /^source-[0-9a-f]{64}$/);
  assert.doesNotMatch(serialized, /data:image\//);
  assert.match(result.project.assets[0].dataUrl, /^\[embedded image omitted: [0-9]+ characters\]$/);
  assert.equal(result.project.providerContext.compact, true);
  assert.ok(Object.keys(result.project.providerContext.omittedBytes).length > 0);
});

test("query_project supports strict filtered selectors and exact JSON Pointers with compact-by-default assets", () => {
  const project = createTemplate("kinetic");
  const selected = applyAgentCommand(project, {
    op: "query_project",
    select: "maps[0].objects[kind=portal]",
  }).result;
  assert.equal(selected.mode, "selector");
  assert.equal(selected.compact, true);
  assert.ok(selected.matchCount >= 1);
  assert.equal(Array.isArray(selected.value) ? selected.value[0].kind : selected.value.kind, "portal");

  const pointers = applyAgentCommand(project, {
    op: "query_project",
    pointers: ["/maps/0/name", "/assets/0/dataUrl", "/maps/99/name"],
  }).result;
  assert.deepEqual(pointers.pointers.map((entry) => entry.found), [true, true, false]);
  assert.equal(pointers.pointers[0].value, project.maps[0].name);
  assert.match(pointers.pointers[1].value, /^\[embedded image omitted:/);
  assert.equal(pointers.pointers[2].value, null);
});

test("get_project sinceDigest returns a small authored-source patch from a real archived checkpoint", () => {
  let project = createTemplate("platformer");
  const checkpoint = applyAgentCommand(project, { op: "checkpoint_iteration", summary: "A3 diff baseline" });
  project = checkpoint.project;
  const sinceDigest = checkpoint.result.entry.sourceDigest;
  const player = project.objects.find((object) => object.kind === "player");
  const playerIndex = project.maps[0].objects.findIndex((object) => object.id === player.id);
  project = applyAgentCommand(project, { op: "update_object", id: player.id, changes: { x: player.x + 7 } }).project;

  const result = applyAgentCommand(project, { op: "get_project", compact: true, sinceDigest }).result;
  assert.equal(result.mode, "patch");
  assert.equal(result.changed, true);
  assert.notEqual(result.sourceDigest, sinceDigest);
  assert.deepEqual(result.patch, [{ op: "replace", path: `/maps/0/objects/${playerIndex}/x`, value: player.x + 7 }]);

  const unchanged = applyAgentCommand(project, { op: "get_project", compact: true, sinceDigest: result.sourceDigest }).result;
  assert.equal(unchanged.changed, false);
  assert.deepEqual(unchanged.patch, []);
  assert.throws(
    () => applyAgentCommand(project, { op: "get_project", compact: true, sinceDigest: `source-${"0".repeat(64)}` }),
    /source-digest-not-found/,
  );
});

test("project read contracts are strict, discoverable, and source-bound", () => {
  const queryContract = getLooplabCommandContract("query_project");
  assert.deepEqual(queryContract.surfaces, ["core", "browser-session"]);
  assert.equal(queryContract.annotations.readOnlyHint, true);
  assert.equal(queryContract.inputSchema.properties.pointers.maxItems, 32);
  assert.equal(validateLooplabCommandInput({ op: "query_project", select: "maps[0].name" }).valid, true);
  assert.equal(validateLooplabCommandInput({ op: "query_project", select: 42 }).valid, false);
  const project = createTemplate("kinetic");
  assert.throws(() => applyAgentCommand(project, { op: "query_project" }), /exactly one/);
  assert.throws(() => applyAgentCommand(project, { op: "query_project", select: "maps", pointers: ["/maps"] }), /exactly one/);

  const manifest = getAgentManifest();
  assert.equal(manifest.protocolVersion, "1.107.0");
  assert.deepEqual(manifest.agentProjectReads.commands, ["get_project", "query_project"]);
  assert.match(manifest.agentProjectReads.sourceBoundary, /Doctor-authored source projections/);
});
