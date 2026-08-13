import test from "node:test";
import assert from "node:assert/strict";

import { applyAgentCommand, buildStandaloneHtml, createTemplate, getAgentManifest, validateProject } from "../lib/looplab-agent-core.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";
import { runDeterministicPlaytest } from "../lib/looplab-verification.mjs";

test("Kinetic City is a headless, connected, contract-complete starter", () => {
  const project = createTemplate("kinetic");
  const validation = validateProject(project);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.equal(project.name, "Kinetic City: Night Route");
  assert.deepEqual(project.maps.map((map) => map.id), ["map-plaza", "map-river"]);
  assert.equal(project.startMapId, "map-plaza");
  assert.equal(project.maps[0].objects.find((object) => object.id === "plaza-to-river")?.targetSpawnId, "river-spawn");
  assert.ok(project.assets.length >= 9);
  assert.ok(project.assets.every((asset) => asset.dataUrl.startsWith("data:image/") && asset.collisionPolicy === "authored-only"));
  assert.equal(project.scaffold.version, "2.1.0");
  assert.equal(project.scaffold.artDirection.generationMatte.color, "#d9d9d9");
  assert.equal(project.scaffold.artDirection.generationMatte.name, "light-neutral-gray");
  assert.deepEqual(project.scaffold.artDirection.generationMatte.use, ["game-art-review", "background-keying"]);
  assert.equal(project.scaffold.artDirection.generationMatte.finalOutput, "transparent");
  assert.deepEqual(project.scaffold.artDirection.generationMatte.forbiddenMattes, ["green", "#00ff00"]);
  assert.equal(project.scaffold.artDirection.gameplayColors.hazard, "#ff5d73");
  assert.equal(project.scaffold.artDirection.gameplayColors.playerPrimary, "#8b5cf6");
  const courier = project.assets.find((asset) => asset.id === "kinetic-skater");
  assert.ok(courier.dataUrl.startsWith("data:image/png;base64,"));
  assert.equal(courier.generator.kind, "imagegen-normalized");
  // This checked-in atlas predates the new default; its provenance must remain truthful.
  assert.equal(courier.generator.generationMatte.color, "#3a3a3a");
  assert.equal(courier.generator.generationMatte.finalOutput, "transparent");
  assert.equal(project.assets.find((asset) => asset.id === "kinetic-backdrop-plaza").generator.generationMatte.color, "#d9d9d9");
  assert.equal(courier.analysis.onPalette, true);
  assert.equal(courier.analysis.anchorVariance, 0);
  assert.equal(courier.frameWidth, 80);
  assert.equal(courier.frameHeight, 90);
  assert.equal(courier.anchorX, 40);
  assert.equal(courier.anchorY, 89);
  assert.equal(courier.analysis.encodedBytes, 11460);
  assert.equal(courier.analysis.decodedRgbaBytes, 115200);
  assert.equal(courier.analysis.sourceSha256, "484579362856ba804dc7f022c06aeb99fb36dafb38c432c5f86a7e2ffd6e1019");
  assert.equal(courier.analysis.outlineColor, "#b8b7ff");
  assert.equal(courier.analysis.minimumComponentPixels, 6);
  assert.equal(courier.analysis.removedSpeckPixels, 2);
  assert.equal(Object.hasOwn(courier.analysis, "silhouetteDrift"), false);
  assert.equal(Object.hasOwn(courier.analysis, "haloPixelRatio"), false);
  assert.equal(Object.hasOwn(courier.analysis, "failedInvariants"), false);
  assert.equal(project.assets.find((asset) => asset.id === "kinetic-token").analysis, null);
  assert.ok(!courier.invariants.palette.includes("#ff5d73"), "The hazard color leaked into the hero palette.");
  assert.ok(!courier.invariants.palette.includes("#c8ff4d"), "The pickup color leaked into the hero palette.");
  assert.ok(project.maps.flatMap((map) => map.objects).filter((object) => object.kind === "player").every((object) => object.color === "#8b5cf6"));
  assert.ok(project.maps.flatMap((map) => map.objects).filter((object) => object.kind === "player").every((object) => object.width === 80 && object.height === 90 && object.collider.width === 40 && object.collider.height === 68));
  assert.ok(project.featureContracts.length >= 5);
  for (const contract of project.featureContracts) {
    for (const link of ["visual", "collision", "inputAction", "animationState", "feedbackEvent", "placementRules", "responsiveRules", "acceptanceTests"]) assert.notEqual(contract[link], undefined, `${contract.id} is missing ${link}`);
  }
  for (const map of project.maps) for (const path of map.traversalPaths ?? []) assert.ok(project.acceptanceTests.some((acceptance) => acceptance.id === path.acceptanceTestId));

  const manifest = getAgentManifest();
  assert.equal(manifest.protocolVersion, "1.107.0");
  assert.ok(manifest.templates.includes("kinetic"));
  assert.ok(manifest.commands.includes("load_template"));
});

test("Kinetic City clears authored gameplay gates and leaves offline evidence honest", () => {
  const project = applyAgentCommand(createTemplate("kinetic"), {
    op: "record_replay_case",
    id: "kinetic-startup",
    name: "Kinetic City startup remains deterministic",
    tickCount: 1,
    inputs: [],
    checkpointInterval: 1,
  }).project;
  const doctor = analyzeProject({ ...project, doctorProfile: "production" });
  assert.equal(doctor.errorCount, 0, JSON.stringify(doctor.issues, null, 2));
  assert.deepEqual(doctor.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.code), ["offline-unverified"]);

  const playtest = runDeterministicPlaytest(project);
  assert.equal(playtest.passed, true, JSON.stringify(playtest.failures, null, 2));
  assert.equal(playtest.transitionCount, 1);

  const html = buildStandaloneHtml(project);
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /data:image\/svg\+xml;base64,/);
  assert.match(html, /data:image\/png;base64,/);
  assert.match(html, /Kinetic City: Night Route/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /https?:\/\//i);
});

function narrowPlatformProject() {
  const project = createTemplate("blank");
  const sourcePlayer = project.objects.find((object) => object.kind === "player");
  const sourceGround = project.objects.find((object) => object.kind === "platform");
  const sourceSpawn = project.objects.find((object) => object.kind === "spawn");
  const objects = [
    { ...sourcePlayer, id: "feel-player", x: 90, y: 458 },
    { ...sourceGround, id: "feel-ground", x: 0, y: 520, width: 180, height: 20, collider: { ...sourceGround.collider, width: 180, height: 20 } },
    { ...sourceSpawn, id: "feel-spawn", x: 72, y: 456 },
  ];
  return {
    ...project,
    objects,
    maps: [{ ...project.maps[0], id: "feel-map", objects }],
    activeMapId: "feel-map",
    startMapId: "feel-map",
  };
}

test("platformer feel supports acceleration, jump cut, coyote time, and buffered jumps", () => {
  const accelerationEngine = createRuntimeModel(narrowPlatformProject());
  accelerationEngine.drainEvents();
  for (let step = 0; step < 3; step += 1) accelerationEngine.update(1 / 60);
  accelerationEngine.setInput("right", true);
  accelerationEngine.update(1 / 60);
  const accelerated = accelerationEngine.getObjects().find((object) => object.kind === "player");
  assert.ok(accelerated.vx > 0 && accelerated.vx < 260, `Expected acceleration below max speed; received ${accelerated.vx}`);
  accelerationEngine.setInput("jump", true);
  const jumpEvents = accelerationEngine.update(1 / 60);
  assert.ok(jumpEvents.some((event) => event.type === "player.jumped"));
  const fullJumpVelocity = accelerated.vy;
  accelerationEngine.setInput("jump", false);
  accelerationEngine.update(1 / 60);
  assert.ok(accelerated.vy > fullJumpVelocity + 200, `Expected jump release to cut upward speed; ${fullJumpVelocity} -> ${accelerated.vy}`);

  const coyoteEngine = createRuntimeModel(narrowPlatformProject());
  coyoteEngine.drainEvents();
  for (let step = 0; step < 3; step += 1) coyoteEngine.update(1 / 60);
  coyoteEngine.setInput("right", true);
  let leftGround = false;
  for (let step = 0; step < 90; step += 1) {
    coyoteEngine.update(1 / 60);
    const player = coyoteEngine.getObjects().find((object) => object.kind === "player");
    if (!player.grounded && player.x > 140) { leftGround = true; break; }
  }
  assert.equal(leftGround, true, "Player never left the narrow platform.");
  coyoteEngine.setInput("jump", true);
  const coyoteEvents = coyoteEngine.update(1 / 60);
  assert.ok(coyoteEvents.some((event) => event.type === "player.jumped"), "Jump did not consume the coyote window.");

  const bufferEngine = createRuntimeModel(narrowPlatformProject());
  bufferEngine.drainEvents();
  const bufferedPlayer = bufferEngine.getObjects().find((object) => object.kind === "player");
  bufferedPlayer.y = 452;
  bufferedPlayer.grounded = false;
  bufferEngine.setInput("jump", true);
  let bufferedJump = false;
  for (let step = 0; step < 10; step += 1) {
    const events = bufferEngine.update(1 / 60);
    if (events.some((event) => event.type === "player.jumped")) { bufferedJump = true; break; }
  }
  assert.equal(bufferedJump, true, "A pre-landing jump press was not buffered through landing.");
});
