import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { applyAgentCommand, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { getLooplabCommandContract, validateLooplabCommandInput } from "../lib/looplab-agent-contracts.mjs";
import { LOOPLAB_BROWSER_SESSION_COMMANDS, LOOPLAB_CORE_COMMANDS } from "../lib/looplab-command-surfaces.mjs";
import { doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import {
  describeSemanticFrame,
  LOOPLAB_FRAME_DESCRIPTION_LIMITS,
  LOOPLAB_FRAME_DESCRIPTION_SCHEMA,
} from "../lib/looplab-frame-description.mjs";
import { normalizeProjection, worldToScreen } from "../lib/looplab-spatial.mjs";
import { LOOPLAB_PROTOCOL_VERSION } from "../lib/looplab-versions.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = join(projectRoot, "scripts", "looplab-agent.mjs");

test("orthographic semantic frame reports exact logical bounds, draw overlap, HUD intrusion, offscreen state, and optional collision", () => {
  let project = createTemplate("blank");
  project = applyAgentCommand(project, {
    op: "add_object",
    kind: "coin",
    object: { id: "overlap-coin", name: "Overlap coin", x: 120, y: 402, width: 30, height: 30 },
  }).project;
  project = applyAgentCommand(project, {
    op: "add_object",
    kind: "decor",
    object: { id: "offscreen-sign", name: "Offscreen sign", x: -100, y: 60, width: 40, height: 40 },
  }).project;
  project = applyAgentCommand(project, {
    op: "update_map",
    id: "map-main",
    changes: {
      hudSafeAreas: [{ id: "score-hud", name: "Score HUD", x: 100, y: 380, width: 120, height: 100 }],
    },
  }).project;

  const frame = describeSemanticFrame(project, {
    sourceDigest: doctorSourceDigest(project),
    includeCollision: true,
  });
  assert.equal(frame.schemaVersion, LOOPLAB_FRAME_DESCRIPTION_SCHEMA);
  assert.equal(frame.runtimeState, "deterministic-initial-frame");
  assert.deepEqual(frame.logicalCanvas, { x: 0, y: 0, width: 960, height: 540 });
  const player = frame.scene.entries.find((entry) => entry.objectId === "player");
  assert.deepEqual(player.screenBounds, { x: 120, y: 402, width: 44, height: 58 });
  assert.equal(player.visibility.status, "onscreen");
  assert.equal(player.collision.enabled, true);
  assert.equal(player.collision.owner, "authored-map");

  const offscreen = frame.scene.entries.find((entry) => entry.objectId === "offscreen-sign");
  assert.equal(offscreen.visibility.status, "offscreen");
  assert.equal(frame.overlapReport.overlaps.some((entry) =>
    [entry.behindObjectId, entry.frontObjectId].includes("player")
    && [entry.behindObjectId, entry.frontObjectId].includes("overlap-coin")), true);
  assert.equal(frame.hudReport.intrusions.some((entry) => entry.objectId === "player" && entry.safeAreaId === "score-hud"), true);
  assert.match(frame.overlapReport.policy, /not proof/i);
  assert.match(frame.unavailable.pixels, /capture_visual_review/);
  assert.match(frame.unavailable.responsiveLayout, /viewport\/DPR/);
  assert.match(frame.proofBoundary, /not visual, browser, acceptance, replay, or release evidence/i);
});

test("semantic frame uses canonical dimetric projection, depth slices, focus filters, and honest bounds", () => {
  const project = createTemplate("dimetric");
  const full = describeSemanticFrame(project, { includeCollision: true });
  const playerObject = project.maps[0].objects.find((object) => object.id === "player");
  const playerEntry = full.scene.entries.find((entry) => entry.objectId === "player");
  const projection = normalizeProjection(project.maps[0].projection ?? project.projection, project.maps[0]);
  const anchorX = playerObject.groundAnchor?.offsetX ?? playerObject.width / 2;
  const anchorY = playerObject.groundAnchor?.offsetY ?? playerObject.height;
  const expectedAnchor = worldToScreen({
    x: playerObject.x + anchorX,
    y: playerObject.y + anchorY,
    z: playerObject.z ?? 0,
  }, projection);
  assert.equal(playerEntry.anchor.screen.x, Number(expectedAnchor.x.toFixed(3)));
  assert.equal(playerEntry.anchor.screen.y, Number(expectedAnchor.y.toFixed(3)));

  const ground = full.scene.entries.find((entry) => entry.objectId === "world-ground");
  assert.equal(ground.primitive, "dimetric-platform");
  assert.ok(ground.screenPolygon.length >= 4);
  assert.equal(ground.collision.enabled, false);
  assert.equal(full.scene.entries.find((entry) => entry.objectId === "west-building").collision.enabled, true);
  assert.equal(full.scene.entries.every((entry, index) => index === 0 || full.scene.entries[index - 1].depth <= entry.depth), true);

  const focused = describeSemanticFrame(project, {
    objectIds: ["player", "missing-object"],
    maximumEntries: 8,
  });
  assert.equal(focused.scene.entries.every((entry) => entry.objectId === "player"), true);
  assert.deepEqual(focused.focus.missingObjectIds, ["missing-object"]);

  const truncated = describeSemanticFrame(project, { maximumEntries: 1, maximumOverlaps: 1, maximumHudIntrusions: 1 });
  assert.equal(truncated.scene.entryCount, 1);
  assert.ok(truncated.scene.truncatedEntryCount > 0);
});

test("describe_frame is a strict shared read-only command and the real CLI returns the bounded scene graph", async () => {
  const project = createTemplate("platformer");
  const outcome = applyAgentCommand(project, {
    op: "describe_frame",
    objectIds: ["player"],
    includeCollision: true,
  });
  assert.equal(outcome.changed, false);
  assert.equal(outcome.result.sourceDigest, doctorSourceDigest(project));
  assert.equal(outcome.result.scene.entries.every((entry) => entry.objectId === "player"), true);

  const contract = getLooplabCommandContract("describe_frame");
  assert.equal(contract.schemaPrecision, "declared");
  assert.equal(contract.annotations.readOnlyHint, true);
  assert.equal(contract.annotations.destructiveHint, false);
  assert.equal(validateLooplabCommandInput({ op: "describe_frame", maximumEntries: 12 }).valid, true);
  assert.equal(validateLooplabCommandInput({ op: "describe_frame", maximumEntries: LOOPLAB_FRAME_DESCRIPTION_LIMITS.maximumEntries + 1 }).valid, false);
  assert.equal(LOOPLAB_CORE_COMMANDS.includes("describe_frame"), true);
  assert.equal(LOOPLAB_BROWSER_SESSION_COMMANDS.includes("describe_frame"), true);
  assert.equal(LOOPLAB_PROTOCOL_VERSION, "1.112.0");

  const manifest = getAgentManifest();
  assert.equal(manifest.semanticFrameDescription.command, "describe_frame");
  assert.match(manifest.semanticFrameDescription.pixelBoundary, /never invent pixel statistics/i);

  const directory = await mkdtemp(join(tmpdir(), "looplab-frame-"));
  try {
    const projectPath = join(directory, "frame.loop.json");
    await writeFile(projectPath, JSON.stringify(project), "utf8");
    const { stdout } = await execFileAsync(process.execPath, [
      cli,
      "describe-frame",
      projectPath,
      "--objects=player",
      "--collision",
      "--max-entries=4",
    ], { cwd: projectRoot, windowsHide: true });
    const parsed = JSON.parse(stdout.trim());
    assert.equal(parsed.ok, true);
    assert.equal(parsed.frame.schemaVersion, LOOPLAB_FRAME_DESCRIPTION_SCHEMA);
    assert.equal(parsed.frame.scene.entries.every((entry) => entry.objectId === "player"), true);
    assert.equal(parsed.frame.scene.entries[0].collision.enabled, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
