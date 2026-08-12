import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createAiArtProviderRequest,
  createAiArtUsageReceipt,
  modelSupportsTransparentBackground,
  normalizeAiArtRequest,
  parseAiArtResponse,
  publicAiArtRequest,
} from "../lib/looplab-ai-art.mjs";
import { aiArtPresentationState } from "../lib/looplab-ai-art-presentation.mjs";
import { analyzeFrameAlpha, analyzeSpriteFrames, opaqueBoundsForFrame, packSpriteAtlas, silhouetteDriftLimitForRole, sliceAtlasFrames } from "../lib/looplab-sprite-tools.mjs";
import { generateSpritePixels } from "../lib/looplab-pixel-generator.mjs";
import { createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function minimalPng(width = 1024, height = 1024) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  Buffer.from("IHDR").copy(bytes, 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function frame(width, height, rectangle, color) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) {
    for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
  return { width, height, pixels };
}

function frameWithRectangles(width, height, rectangles, color = [120, 80, 180]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (const rectangle of rectangles) {
    for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) {
      for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
        const offset = (y * width + x) * 4;
        pixels[offset] = color[0];
        pixels[offset + 1] = color[1];
        pixels[offset + 2] = color[2];
        pixels[offset + 3] = rectangle.alpha ?? 255;
      }
    }
  }
  return { width, height, pixels };
}

function atlasFrame(atlas, index) {
  const pixels = new Uint8ClampedArray(atlas.frameWidth * atlas.frameHeight * 4);
  const originX = (index % atlas.columns) * atlas.frameWidth;
  const originY = Math.floor(index / atlas.columns) * atlas.frameHeight;
  for (let y = 0; y < atlas.frameHeight; y += 1) {
    for (let x = 0; x < atlas.frameWidth; x += 1) {
      const sourceOffset = ((originY + y) * atlas.width + originX + x) * 4;
      const targetOffset = (y * atlas.frameWidth + x) * 4;
      pixels.set(atlas.pixels.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }
  return { width: atlas.frameWidth, height: atlas.frameHeight, pixels };
}

test("AI art request creates one complete ordered sheet instead of resolving to the local block generator", () => {
  const request = normalizeAiArtRequest({
    role: "character",
    prompt: "A readable courier with a dark-grey jacket and compact silhouette.",
    identity: "courier-v7",
    actions: ["idle", "push", "coast", "brake"],
    targetFrameSize: 48,
    quality: "medium",
  }, {});
  assert.equal(request.model, "gpt-image-1.5");
  assert.equal(request.providerPayload.background, "transparent");
  assert.equal(request.providerPayload.output_format, "png");
  assert.equal(request.providerPayload.n, 1);
  assert.deepEqual(request.actions, ["idle", "push", "coast", "brake"]);
  assert.equal(request.columns, 4);
  assert.equal(request.rows, 1);
  assert.match(request.providerPrompt, /one exact 4 columns by 1 rows contact sheet/i);
  assert.doesNotMatch(JSON.stringify(publicAiArtRequest(request)), /dark-grey jacket|providerPayload|providerPrompt/);
});

test("transparent background incompatibility blocks before a provider payload can be submitted", () => {
  assert.equal(modelSupportsTransparentBackground("gpt-image-2"), false);
  assert.equal(modelSupportsTransparentBackground("gpt-image-1.5"), true);
  assert.throws(() => normalizeAiArtRequest({ model: "gpt-image-2", background: "transparent", prompt: "A prop" }, {}), /does not support transparent backgrounds/i);
  const opaque = normalizeAiArtRequest({ model: "gpt-image-2", background: "light-neutral-gray", prompt: "A prop" }, {});
  assert.equal(opaque.providerPayload.background, "opaque");
  assert.match(opaque.providerPrompt, /#d9d9d9/);
});

test("AI art response retains exact PNG bytes, dimensions, job provenance, and measured usage", () => {
  const request = normalizeAiArtRequest({ prompt: "A floor-standing vending machine", role: "prop", quality: "low" }, {});
  const encoded = minimalPng(1024, 1024).toString("base64");
  const parsed = parseAiArtResponse({ created: 1_786_227_200, data: [{ b64_json: encoded }], usage: { input_tokens: 17, output_tokens: 272, total_tokens: 289 } }, request, { requestId: "req_image_123" });
  assert.equal(parsed.width, 1024);
  assert.equal(parsed.height, 1024);
  assert.equal(parsed.byteLength, 24);
  assert.equal(parsed.requestId, "req_image_123");
  assert.equal(parsed.dataUrl, `data:image/png;base64,${encoded}`);
  const receipt = createAiArtUsageReceipt({ model: "gpt-image-1.5", quality: "low", usage: parsed.usage });
  assert.equal(receipt.measured, true);
  assert.equal(receipt.totalTokens, 289);
  assert.equal(receipt.estimatedUsd, 0.009);
  assert.equal(receipt.estimateKind, "published-image-output-price");
});

test("shared-scale atlas normalization preserves relative silhouette size and locks one cross-frame palette", () => {
  const large = frame(20, 20, { x: 5, y: 10, width: 10, height: 10 }, [180, 30, 40]);
  const small = frame(20, 20, { x: 8, y: 15, width: 5, height: 5 }, [30, 70, 190]);
  const atlas = packSpriteAtlas([large, small], { frameWidth: 20, frameHeight: 20, columns: 2, maximumColors: 16 });
  const largeBounds = opaqueBoundsForFrame(atlasFrame(atlas, 0));
  const smallBounds = opaqueBoundsForFrame(atlasFrame(atlas, 1));
  assert.equal(largeBounds.width, 18);
  assert.equal(smallBounds.width, 9);
  assert.equal(largeBounds.y + largeBounds.height, 20);
  assert.equal(smallBounds.y + smallBounds.height, 20);
  assert.deepEqual(new Set(atlas.palette), new Set(["#b41e28", "#1e46be"]));
  assert.equal(atlas.analysis.sharedScale, true);
  assert.equal(atlas.analysis.measured, true);
  assert.equal(atlas.analysis.measurementVersion, "looplab-frame-analysis/v1");
  assert.equal(atlas.analysis.groundAnchorVariance, 0);
  assert.equal(atlas.analysis.failedInvariants.length, 0);
});

test("measured frame QA detects the former false-pass cases without applying sprite rules to tiles", () => {
  const valid = frameWithRectangles(32, 24, [{ x: 10, y: 5, width: 12, height: 19 }]);
  const validFrame = analyzeFrameAlpha(valid, { frameKind: "sprite", anchorMode: "ground" });
  assert.equal(validFrame.empty, false);
  assert.equal(validFrame.subjectClusterCount, 1);
  assert.equal(validFrame.forbiddenBorderOccupiedPixels, 0);

  const duplicate = frameWithRectangles(32, 24, [{ x: 2, y: 8, width: 7, height: 16 }, { x: 23, y: 8, width: 7, height: 16 }]);
  const cropped = frameWithRectangles(32, 24, [{ x: 0, y: 5, width: 12, height: 19 }]);
  const empty = frameWithRectangles(32, 24, []);
  const rejected = analyzeSpriteFrames([valid, duplicate, cropped, empty], { frameKind: "sprite", anchorMode: "ground" });
  assert.equal(rejected.measured, true);
  assert.equal(rejected.emptyFrameCount, 1);
  assert.equal(rejected.characterCountMax, 2);
  assert.ok(rejected.failedInvariants.includes("empty-frame"));
  assert.ok(rejected.failedInvariants.includes("multiple-distant-subjects"));
  assert.ok(rejected.failedInvariants.includes("sprite-border-leakage"));

  const tile = frameWithRectangles(16, 16, [{ x: 0, y: 0, width: 16, height: 16 }], [80, 90, 100]);
  const tileAnalysis = analyzeSpriteFrames([tile], { frameKind: "tile", requireTransparency: false });
  assert.deepEqual(tileAnalysis.failedInvariants, []);
  assert.equal(tileAnalysis.tileEdgeMismatchRatio, 0);
});

test("atlas slicing measures the exact packed pixels instead of trusting metadata", () => {
  const first = frameWithRectangles(12, 12, [{ x: 3, y: 3, width: 6, height: 9 }]);
  const second = frameWithRectangles(12, 12, [{ x: 4, y: 6, width: 4, height: 6 }]);
  const atlas = packSpriteAtlas([first, second], { frameWidth: 16, frameHeight: 16, columns: 2 });
  const sliced = sliceAtlasFrames(atlas);
  assert.equal(sliced.length, 2);
  const measured = analyzeSpriteFrames(sliced, { frameKind: "sprite", anchorMode: "ground" });
  assert.equal(measured.anchorVariance, 0);
  assert.equal(measured.emptyFrameCount, 0);
  assert.deepEqual(measured.failedInvariants, []);
});

test("center anchors and intentional effect expansion use calibrated measured limits", () => {
  const largeCentered = frameWithRectangles(20, 20, [{ x: 5, y: 5, width: 10, height: 10 }]);
  const smallCentered = frameWithRectangles(20, 20, [{ x: 7, y: 7, width: 6, height: 6 }]);
  const centered = analyzeSpriteFrames([largeCentered, smallCentered], { frameKind: "sprite", anchorMode: "center" });
  assert.equal(centered.anchorVariance, 0);
  assert.equal(centered.contactVariance, 0);

  for (const role of ["hero", "enemy", "pickup", "prop", "effect", "ui"]) {
    const generated = generateSpritePixels({ kind: role, palette: "violet", size: 32, seed: "measured-calibration" });
    const anchorMode = role === "effect" || role === "ui" ? "center" : "ground";
    const measured = analyzeSpriteFrames(sliceAtlasFrames(generated), { frameKind: "sprite", anchorMode, requireTransparency: true });
    assert.deepEqual(measured.failedInvariants, [], `${role} generated an invalid sheet`);
    assert.ok(measured.silhouetteDrift <= silhouetteDriftLimitForRole(role), `${role} exceeded its measured drift contract`);
  }
  assert.equal(silhouetteDriftLimitForRole("character"), 0.14);
  assert.equal(silhouetteDriftLimitForRole("ui"), 0.2);
  assert.equal(silhouetteDriftLimitForRole("effect"), 0.8);
});

test("AI-art UI never presents a local fallback sheet as verified provider output", () => {
  const local = aiArtPresentationState({ generator: { source: "local-pixel-generator" }, invariants: { providerNormalized: false } });
  assert.equal(local.verified, false);
  assert.deepEqual(local.labels, ["Provider sheet pending", "Then: measure + normalize + palette lock", "Collision remains authored"]);
  assert.equal(local.labels.some((label) => /edge sealed|seam checked/i.test(label)), false);

  const provider = aiArtPresentationState({
    generator: { source: "openai-image-api" },
    invariants: { providerNormalized: true, sharedScale: true, authoredCollisionOnly: true },
    analysis: { measured: true, measurementVersion: "looplab-frame-analysis/v1", failedInvariants: [] },
  });
  assert.equal(provider.verified, true);
  assert.deepEqual(provider.labels, ["Pixels measured", "Sheet normalized", "Shared scale", "Palette locked", "Collision authored"]);

  const falselyPerfect = aiArtPresentationState({
    generator: { source: "openai-image-api" },
    invariants: { providerNormalized: true, sharedScale: true, authoredCollisionOnly: true },
    analysis: { silhouetteDrift: 0, anchorVariance: 0, characterCountMax: 1, failedInvariants: [] },
  });
  assert.equal(falselyPerfect.verified, false);
  assert.equal(falselyPerfect.status, "pending");

  const rejected = aiArtPresentationState({
    generator: { source: "openai-image-api" },
    invariants: { providerNormalized: true, sharedScale: true, authoredCollisionOnly: true },
    analysis: { measured: true, measurementVersion: "looplab-frame-analysis/v1", failedInvariants: ["multiple-distant-subjects"] },
  });
  assert.equal(rejected.verified, false);
  assert.equal(rejected.status, "rejected");
});

test("Project Doctor accepts normalized provider art and replays the malformed-source failure as blockers", () => {
  const project = createTemplate("blank");
  const asset = {
    id: "ai-courier",
    name: "AI courier",
    type: "sprite",
    dataUrl: `data:image/png;base64,${minimalPng(128, 32).toString("base64")}`,
    width: 128,
    height: 32,
    frameWidth: 32,
    frameHeight: 32,
    frames: 4,
    columns: 4,
    anchorX: 16,
    anchorY: 31,
    collisionPolicy: "authored-only",
    anchorMode: "ground",
    invariants: { providerNormalized: true, transparentBackground: true, sharedScale: true, authoredCollisionOnly: true, analysisMeasured: true, actions: ["idle", "push", "coast", "brake"], palette: ["#303030"], maxSilhouetteDrift: 0.14, maxAnchorVariance: 1 },
    analysis: { measured: true, measurementVersion: "looplab-frame-analysis/v1", sharedScale: true, sourceEncodedBytes: 24, silhouetteDrift: 0, anchorVariance: 0, characterCountMax: 1, haloPixelRatio: 0, failedInvariants: [] },
    generator: { kind: "hero", source: "openai-image-api", model: "gpt-image-1.5", promptDigest: "a".repeat(64) },
  };
  const validReport = analyzeProject({ ...project, assets: [asset] });
  assert.deepEqual(validReport.issues.filter((issue) => issue.assetId === asset.id && issue.code.startsWith("ai-art-")), []);

  const malformed = { ...asset, invariants: { ...asset.invariants, providerNormalized: false, transparentBackground: false, sharedScale: false, analysisMeasured: false, actions: ["idle"] }, analysis: { ...asset.analysis, measured: false, measurementVersion: "", sharedScale: false }, generator: { ...asset.generator, promptDigest: "missing" } };
  const malformedReport = analyzeProject({ ...project, assets: [malformed] });
  const codes = new Set(malformedReport.issues.filter((issue) => issue.assetId === asset.id).map((issue) => issue.code));
  for (const code of ["ai-art-not-normalized", "ai-art-analysis-unmeasured", "ai-art-not-transparent", "ai-art-scale-unproven", "ai-art-provenance", "ai-art-frame-order"]) assert.ok(codes.has(code), `missing ${code}`);

  const expandingEffect = {
    ...asset,
    id: "ai-effect",
    name: "AI expanding effect",
    anchorMode: "center",
    invariants: { ...asset.invariants, maxSilhouetteDrift: silhouetteDriftLimitForRole("effect") },
    analysis: { ...asset.analysis, silhouetteDrift: 0.6 },
    generator: { ...asset.generator, kind: "effect" },
  };
  const calibratedEffectReport = analyzeProject({ ...project, assets: [expandingEffect] });
  assert.equal(calibratedEffectReport.issues.some((issue) => issue.assetId === expandingEffect.id && issue.code === "silhouette-drift"), false);
  const incorrectlyTightEffectReport = analyzeProject({ ...project, assets: [{ ...expandingEffect, invariants: { ...expandingEffect.invariants, maxSilhouetteDrift: 0.14 } }] });
  assert.equal(incorrectlyTightEffectReport.issues.some((issue) => issue.assetId === expandingEffect.id && issue.code === "silhouette-drift"), true);
});

test("companion and manifest expose durable headless AI-art jobs without a hidden local-generator substitution", async () => {
  const companion = await readFile(join(root, "scripts", "looplab-companion.mjs"), "utf8");
  const page = await readFile(join(root, "app", "page.tsx"), "utf8");
  assert.match(companion, /POST" && url\.pathname === "\/asset-jobs"/);
  assert.match(companion, /createAiArtProviderRequest\(request, apiKey\)/);
  assert.match(companion, /fetch\(providerRequest\.url/);
  assert.match(companion, /asset\.provider\.requested/);
  assert.match(companion, /job\.controller\?\.abort\(\)/);
  assert.doesNotMatch(companion, /generateSpritePixels\([^)]*payload|generateTilesetPixels\([^)]*payload/);
  const manifest = getAgentManifest();
  for (const command of ["generate_ai_asset", "get_ai_asset_job", "cancel_ai_asset_job"]) assert.ok(manifest.commands.includes(command));
  assert.equal(manifest.visualAuthoring.assetGeneration.providerArt.submitPolicy.includes("Submit exactly once"), true);
  assert.equal(manifest.visualAuthoring.assetGeneration.providerArt.collisionPolicy.includes("sole collision owner"), true);
  assert.equal(manifest.visualAuthoring.assetGeneration.providerArt.analysisContract.version, "looplab-frame-analysis/v1");
  assert.ok(manifest.visualAuthoring.assetGeneration.providerArt.analysisContract.metrics.includes("subject-clusters"));
  assert.match(manifest.visualAuthoring.assetGeneration.providerArt.rejectionPolicy, /cannot be attached, placed, or described as game-ready/i);
  assert.match(page, /asset\.measured\.rejected/);
  assert.match(page, /rejected: true, jobId: descriptor\.jobId, asset, failedInvariants/);
  const generation = normalizeAiArtRequest({ prompt: "One readable prop", role: "prop" }, {});
  const providerRequest = createAiArtProviderRequest(generation, "test-key");
  assert.equal(providerRequest.url, "https://api.openai.com/v1/images/generations");
  assert.equal(providerRequest.init.headers["Content-Type"], "application/json");
  assert.equal(JSON.parse(providerRequest.init.body).prompt, generation.providerPrompt);
  assert.equal(providerRequest.init.headers.Authorization, "Bearer test-key");
});
