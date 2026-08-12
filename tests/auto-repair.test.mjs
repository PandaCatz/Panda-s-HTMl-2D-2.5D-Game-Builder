import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyAgentCommand,
  buildStandaloneHtml,
  createTemplate,
  getAgentManifest,
  validateProject,
} from "../lib/looplab-agent-core.mjs";
import {
  LOOPLAB_AUTO_REPAIR_LIMITS,
  LOOPLAB_AUTO_REPAIR_SCHEMA,
  LOOPLAB_CONVERGENCE_SCHEMA,
} from "../lib/looplab-auto-repair.mjs";
import { canonicalJson } from "../lib/looplab-canonical-digest.mjs";
import { getLooplabCommandContract, validateLooplabCommandInput } from "../lib/looplab-agent-contracts.mjs";
import { analyzeProject, doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import { getAgentChanges } from "../lib/looplab-agent-change-feed.mjs";

function updateEveryActiveCopy(project, objectId, update) {
  const rootObject = project.objects.find((object) => object.id === objectId);
  assert.ok(rootObject);
  Object.assign(rootObject, structuredClone(update));
  const activeMap = project.maps.find((map) => map.id === project.activeMapId);
  const mapObject = activeMap.objects.find((object) => object.id === objectId);
  assert.ok(mapObject);
  Object.assign(mapObject, structuredClone(update));
}

function repairableBlankProject() {
  let project = createTemplate("blank");
  project = applyAgentCommand(project, {
    op: "add_object",
    kind: "decor",
    object: {
      id: "floor-vending-machine",
      name: "Floor vending machine",
      role: "vending-machine",
      x: -36,
      y: 380,
      width: 44,
      height: 88,
      color: "#3f4046",
      solid: false,
      anchorMode: "ground",
      collisionOwner: "authored-map",
      requiresSupport: true,
      visualBounds: { offsetX: 0, offsetY: 0, width: 44, height: 88 },
      collider: { enabled: false, offsetX: 0, offsetY: 0, width: 44, height: 88, trigger: false, oneWay: false, zMin: 0, zMax: 1 },
    },
  }).project;
  updateEveryActiveCopy(project, "floor-vending-machine", { collisionOwner: "generated-art" });
  const activeMap = project.maps.find((map) => map.id === project.activeMapId);
  activeMap.clearanceZones = [{ id: "authored-run-up", x: 0, y: 500, width: 960, height: 40, phase: "run-up", routeId: "main-route" }];
  project.clearanceZones = structuredClone(activeMap.clearanceZones);
  return project;
}

test("mechanical repair contracts are strict, source-bound, provider-free, and manifest-discoverable", () => {
  const repair = getLooplabCommandContract("auto_repair");
  const converge = getLooplabCommandContract("converge");
  assert.deepEqual(repair.surfaces, ["core", "browser-session"]);
  assert.equal(repair.mutatesProject, true);
  assert.equal(repair.requiresSourceDigestInMcp, true);
  assert.equal(repair.annotations.destructiveHint, true);
  assert.deepEqual(repair.inputSchema.required, ["expectedSourceDigest"]);
  assert.equal(repair.inputSchema.properties.maxRepairs.maximum, LOOPLAB_AUTO_REPAIR_LIMITS.maximumRepairs);
  assert.equal(converge.inputSchema.properties.maxPasses.maximum, LOOPLAB_AUTO_REPAIR_LIMITS.maximumPasses);
  assert.equal(validateLooplabCommandInput({ op: "auto_repair", expectedSourceDigest: "source-test", typo: true }).valid, false);
  const manifest = getAgentManifest();
  assert.equal(manifest.mechanicalRepair.repairSchemaVersion, LOOPLAB_AUTO_REPAIR_SCHEMA);
  assert.equal(manifest.mechanicalRepair.convergenceSchemaVersion, LOOPLAB_CONVERGENCE_SCHEMA);
  assert.equal(manifest.mechanicalRepair.providerFree, true);
  assert.match(manifest.mechanicalRepair.judgmentBoundary, /route design/i);
});

test("auto_repair is a non-mutating dry run with an exact digest and explicit judgment residue", () => {
  const project = repairableBlankProject();
  const before = canonicalJson(project);
  const sourceDigest = doctorSourceDigest(project);
  const outcome = applyAgentCommand(project, { op: "auto_repair", expectedSourceDigest: sourceDigest });
  const plan = outcome.result;

  assert.equal(outcome.changed, false);
  assert.equal(canonicalJson(project), before);
  assert.equal(plan.schemaVersion, LOOPLAB_AUTO_REPAIR_SCHEMA);
  assert.equal(plan.sourceDigest, sourceDigest);
  assert.match(plan.repairDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(plan.applied, false);
  assert.equal(plan.applicable, true);
  assert.equal(plan.authority.providerUsed, false);
  assert.equal(plan.authority.persistsProject, false);
  assert.equal("projectedProject" in plan, false);
  assert.ok(plan.repairs.some((repair) => repair.findingCodes.includes("object-clipped-by-map")));
  assert.ok(plan.repairs.some((repair) => repair.findingCodes.includes("collision-owner")));
  assert.ok(plan.repairs.some((repair) => repair.findingCodes.includes("support-missing")));
  assert.ok(plan.residue.some((issue) => issue.code === "route-clearance" && /level flow/i.test(issue.reason)));
  assert.equal(plan.applyCommand.expectedRepairDigest, plan.repairDigest);
});

test("auto_repair exact apply resolves safe findings, emits one coalesced event, and reaches an idempotent fixed point", () => {
  const project = repairableBlankProject();
  const origin = getAgentChanges(project).currentCursor;
  const preview = applyAgentCommand(project, { op: "auto_repair", expectedSourceDigest: doctorSourceDigest(project) }).result;

  assert.throws(() => applyAgentCommand(project, { ...preview.applyCommand, expectedRepairDigest: `sha256:${"0".repeat(64)}` }), /\[stale-repair-plan\]/);
  const applied = applyAgentCommand(project, preview.applyCommand);
  const vending = applied.project.objects.find((object) => object.id === "floor-vending-machine");
  assert.equal(applied.changed, true);
  assert.equal(applied.result.applied, true);
  assert.equal(vending.x, 0);
  assert.equal(vending.collisionOwner, "authored-map");
  assert.ok(["floor", "surface"].includes(vending.supportContact.mode));
  assert.equal(validateProject(applied.project).valid, true);
  const repairedCodes = new Set(analyzeProject(applied.project).issues.map((issue) => issue.code));
  assert.equal(repairedCodes.has("object-clipped-by-map"), false);
  assert.equal(repairedCodes.has("collision-owner"), false);
  assert.equal(repairedCodes.has("support-missing"), false);
  assert.equal(repairedCodes.has("route-clearance"), true);

  const resumed = getAgentChanges(applied.project, { cursor: origin });
  assert.equal(resumed.returnedEventCount, 1);
  assert.equal(resumed.events[0].operation, "auto_repair");
  assert.ok(resumed.events[0].commandCount >= 2);
  assert.equal(resumed.events[0].operationCounts.update_object, 1);
  assert.equal(resumed.events[0].operationCounts.attach_to_support, 1);

  const again = applyAgentCommand(applied.project, { op: "auto_repair", expectedSourceDigest: doctorSourceDigest(applied.project) }).result;
  assert.equal(again.safeRepairCount, 0);
  assert.equal(again.changed, false);
  assert.equal(again.applicable, false);
  assert.ok(again.residue.some((issue) => issue.code === "route-clearance"));
  assert.doesNotMatch(buildStandaloneHtml(applied.project), /looplab-auto-repair|expectedRepairDigest|agentChangeFeed/);
});

test("multi-map repair restores asset/traversal authority, clamps points, and preserves the selected map", () => {
  const project = createTemplate("kinetic");
  const originalActiveMapId = project.activeMapId;
  project.assets[0].collisionPolicy = "generated-art";
  const secondMap = project.maps[1];
  secondMap.traversalPaths[0].collisionOwner = "generated-art";
  secondMap.traversalPaths[0].points[0].x = -80;
  const sourceDigest = applyAgentCommand(project, { op: "get_doctor" }).result.sourceDigest;
  const preview = applyAgentCommand(project, { op: "auto_repair", expectedSourceDigest: sourceDigest, maxRepairs: 8 }).result;

  assert.ok(preview.repairs.some((repair) => repair.findingCodes.includes("asset-collision-policy")));
  assert.ok(preview.repairs.some((repair) => repair.findingCodes.includes("traversal-authority")));
  assert.ok(preview.repairs.some((repair) => repair.findingCodes.includes("traversal-point-bounds")));
  assert.ok(preview.commands.some((command) => command.op === "switch_map" && command.id === secondMap.id));
  assert.equal(preview.commands.at(-1).op, "switch_map");
  assert.equal(preview.commands.at(-1).id, originalActiveMapId);

  const applied = applyAgentCommand(project, preview.applyCommand);
  assert.equal(applied.project.activeMapId, originalActiveMapId);
  assert.equal(applied.project.assets[0].collisionPolicy, "authored-only");
  const repairedPath = applied.project.maps[1].traversalPaths[0];
  assert.equal(repairedPath.collisionOwner, "authored-map");
  assert.equal(repairedPath.points[0].x, 0);
  assert.equal(validateProject(applied.project).valid, true);
});

test("converge performs bounded repeated passes, preserves residue, and exact apply rejects drift", () => {
  const project = repairableBlankProject();
  const sourceDigest = doctorSourceDigest(project);
  const preview = applyAgentCommand(project, {
    op: "converge",
    expectedSourceDigest: sourceDigest,
    maxRepairs: 1,
    maxPasses: 4,
  }).result;

  assert.equal(preview.schemaVersion, LOOPLAB_CONVERGENCE_SCHEMA);
  assert.match(preview.convergenceDigest, /^sha256:[a-f0-9]{64}$/);
  assert.ok(preview.passCount >= 2);
  assert.equal(preview.totalRepairCount >= 2, true);
  assert.equal(preview.stopReason, "judgment-residue");
  assert.equal(preview.applicable, true);
  const initialDoctor = analyzeProject(project);
  assert.equal(preview.initialDoctor.score, initialDoctor.score);
  assert.equal(preview.initialDoctor.errorCount, initialDoctor.errorCount);
  assert.equal(preview.initialDoctor.warningCount, initialDoctor.warningCount);
  const initialReleaseDoctor = analyzeProject(project, { profile: "production" });
  assert.equal(preview.initialReleaseDoctor.score, initialReleaseDoctor.score);
  assert.equal(preview.initialReleaseDoctor.errorCount, initialReleaseDoctor.errorCount);
  assert.equal(preview.initialReleaseDoctor.warningCount, initialReleaseDoctor.warningCount);
  assert.ok(preview.residue.some((issue) => issue.code === "route-clearance"));
  assert.equal(preview.authority.cycleDetection, true);
  assert.throws(() => applyAgentCommand(project, { ...preview.applyCommand, maxPasses: 3 }), /\[stale-convergence-plan\]/);

  const applied = applyAgentCommand(project, preview.applyCommand);
  assert.equal(applied.changed, true);
  assert.equal(applied.result.applied, true);
  const after = applyAgentCommand(applied.project, { op: "converge", expectedSourceDigest: doctorSourceDigest(applied.project), maxRepairs: 1, maxPasses: 4 }).result;
  assert.equal(after.passCount, 0);
  assert.equal(after.stopReason, "judgment-residue");
});

test("Agent API exposes mouse controls for the same repair and convergence commands", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /id="looplab-agent-mechanical-repair"/);
  assert.match(page, /Preview safe repairs/);
  assert.match(page, /Apply exact repairs/);
  assert.match(page, /Preview bounded converge/);
  assert.match(page, /expectedRepairDigest: agentRepairPlan\.repairDigest/);
  assert.match(page, /expectedConvergenceDigest: agentConvergencePlan\.convergenceDigest/);
  assert.match(page, /Release \{agentConvergencePlan\.initialReleaseDoctor\?\.score \?\? agentConvergencePlan\.finalReleaseDoctor\.score\} → \{agentConvergencePlan\.finalReleaseDoctor\.score\}/);
  assert.match(css, /\.agent-repair-plan\.is-ready/);
  assert.match(css, /background: #292a29/);
});
