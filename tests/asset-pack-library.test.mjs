import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import {
  listInstalledAssetPacks,
  listInstalledPackAssets,
  loadInstalledPackAssets,
  readAssetPackIndex,
  readAssetPackManifest,
} from "../lib/looplab-asset-library-node.mjs";
import { routeGameStudioWork } from "../lib/looplab-capability-router.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";

test("installed pack manifest exposes only verified commercial-use CC0 packs", async () => {
  const manifest = await readAssetPackManifest();
  assert.equal(manifest.schemaVersion, "1.0.0");
  assert.equal(manifest.packCount, 11);
  assert.equal(manifest.installedAssetCount, 15_896);
  assert.equal(manifest.packs.length, 11);
  for (const pack of manifest.packs) {
    assert.equal(pack.installed, true);
    assert.equal(pack.license, "CC0-1.0");
    assert.equal(pack.rights.commercialUse, true);
    assert.equal(pack.rights.modification, true);
    assert.equal(pack.rights.redistribution, true);
    assert.equal(pack.rights.attributionRequired, false);
    assert.ok(pack.indexUrl.startsWith("/asset-packs/index/"));
  }
});
test("headless pack browsing filters, paginates, and returns real files", async () => {
  const packs = await listInstalledAssetPacks({ category: "tileset" });
  assert.equal(packs.packCount, 2);
  assert.ok(packs.packs.every((pack) => pack.categories.includes("tileset")));

  const page = await listInstalledPackAssets("tiny-platformer-pack", { kind: "image", query: "colored-blue", limit: 2, offset: 1 });
  assert.equal(page.limit, 2);
  assert.equal(page.offset, 1);
  assert.equal(page.assets.length, 2);
  assert.ok(page.total > page.assets.length);
  assert.ok(page.assets.every((asset) => asset.kind === "image" && asset.selectable && asset.url));
});

test("selected pack files embed with provenance and authored-only collision", async () => {
  const index = await readAssetPackIndex("tiny-platformer-pack");
  const record = index.assets.find((asset) => asset.kind === "image" && asset.width === 32 && asset.height === 32);
  assert.ok(record, "expected a selectable 32×32 tile");
  const imported = await loadInstalledPackAssets("tiny-platformer-pack", [record.id]);
  assert.equal(imported.assets.length, 1);
  const asset = imported.assets[0];
  assert.equal(asset.collisionPolicy, "authored-only");
  assert.equal(asset.invariants.paletteSourcePreserved, true);
  assert.equal(asset.invariants.paletteLocked, undefined);
  assert.equal(asset.source.assetId, record.id);
  assert.equal(asset.source.license, "CC0-1.0");
  assert.equal(asset.analysis.decodedMemoryBytes, 32 * 32 * 4);
  const embeddedBytes = Buffer.from(asset.dataUrl.split(",")[1], "base64");
  assert.equal(createHash("sha256").update(embeddedBytes).digest("hex"), record.sha256);
});

test("sprite-sheet slicing is exact and reports frame metadata", async () => {
  const index = await readAssetPackIndex("tiny-platformer-pack");
  const record = index.assets.find((asset) => asset.kind === "image" && asset.width === 32 && asset.height === 32);
  const sliced = await loadInstalledPackAssets("tiny-platformer-pack", [record.id], { frameWidth: 16, frameHeight: 16 });
  assert.equal(sliced.assets[0].columns, 2);
  assert.equal(sliced.assets[0].frames, 4);
  assert.equal(sliced.assets[0].invariants.frameCount, 4);
  assert.equal(sliced.assets[0].analysis.spriteSheetSliced, true);
  await assert.rejects(() => loadInstalledPackAssets("tiny-platformer-pack", [record.id], { frameWidth: 15, frameHeight: 16 }), /cannot be sliced into exact/);
});

test("non-image pack files embed as project resources", async () => {
  const index = await readAssetPackIndex("interface-sfx-pack-1");
  const record = index.assets.find((asset) => asset.kind === "audio" && asset.selectable);
  assert.ok(record, "expected a browser-ready audio resource");
  const imported = await loadInstalledPackAssets("interface-sfx-pack-1", [record.id]);
  assert.equal(imported.assets.length, 0);
  assert.equal(imported.resources.length, 1);
  assert.equal(imported.resources[0].source.assetId, record.id);
  assert.match(imported.resources[0].dataUrl, /^data:audio\//);
});

test("2D routing defaults to the compact one-file Canvas path and never includes hbg-loop", () => {
  const project = createTemplate("platformer");
  const route = routeGameStudioWork(project, { track: "gameplay", prompt: "Improve collision and input feel" });
  const ids = route.route.map((step) => step.capabilityId);
  assert.equal(route.context.framework, "canvas");
  assert.equal(ids[0], "web-game-foundations");
  assert.ok(ids.includes("single-file-html-games"));
  assert.ok(ids.includes("canvas-2d-performance"));
  assert.ok(ids.includes("collision-and-response-2d"));
  assert.ok(ids.includes("input-and-mobile-viewport"));
  assert.ok(ids.includes("verification-gates"));
  assert.equal(ids.at(-1), "game-playtest");
  assert.equal(ids.includes("hbg-loop"), false);
  assert.match(route.boundaries.packaging, /one offline HTML file/i);
});

test("melonJS routes through its pinned release-ready standalone adapter", () => {
  const route = routeGameStudioWork(createTemplate("platformer"), { framework: "melon", track: "maps", prompt: "Use melonJS and Tiled maps" });
  assert.ok(route.route.some((step) => step.capabilityId === "melonjs-engine"));
  assert.equal(route.runtimeSelection.requestedUnavailableFramework, null);
  assert.equal(route.runtimeSelection.selectedFramework, "melon");
  assert.match(route.route.find((step) => step.capabilityId === "melonjs-engine").label, /inline IIFE/i);
  assert.match(route.runtimeSelection.reasons.join(" "), /selected explicitly/i);
  assert.deepEqual(getAgentManifest().installedSkills.oneFileRuntimePolicy.melon, {
    status: "release-ready",
    delivery: "tree-shaken-inline-iife",
    pinnedVersion: "17.4.0",
    sha256: getAgentManifest().installedSkills.oneFileRuntimePolicy.melon.sha256,
    integration: "standalone-application-explicit-camera",
  });
  assert.match(getAgentManifest().installedSkills.oneFileRuntimePolicy.melon.sha256, /^[a-f0-9]{64}$/);
});

test("Project Doctor blocks runtime and module dependencies that violate one-file export", () => {
  const project = createTemplate("platformer");
  const clean = analyzeProject(project, { profile: "prototype" });
  assert.equal(clean.issues.some((issue) => issue.code === "browser-2d-contracts"), false);
  const broken = analyzeProject({
    ...project,
    runtimeProfile: { dimension: "2d", framework: "phaser" },
    release: { ...project.release, runtimeBundleEmbedded: false, engineDelivery: "external-module", moduleImports: ["https://cdn.example/phaser.js"] },
    qualityContracts: { ...project.qualityContracts, inputViewport: { ...project.qualityContracts.inputViewport, tickSnapshots: false } },
  }, { profile: "prototype" });
  const codes = new Set(broken.issues.filter((issue) => issue.severity === "error").map((issue) => issue.code));
  assert.ok(codes.has("runtime-not-embedded"));
  assert.ok(codes.has("external-module-import"));
  assert.ok(codes.has("engine-delivery"));
  assert.ok(codes.has("input-snapshot"));
});
// End of asset-pack library coverage.
