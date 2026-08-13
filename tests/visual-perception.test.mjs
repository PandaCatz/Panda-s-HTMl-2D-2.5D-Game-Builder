import assert from "node:assert/strict";
import test from "node:test";

import { analyzeVisualPerception, isHudVisualReviewTarget, LOOPLAB_VISUAL_PERCEPTION_SCHEMA_VERSION, normalizeVisualBounds, visualBoundsExtendBeyondFrame } from "../lib/looplab-visual-perception.mjs";
import { LOOPLAB_COLOR_ACCESSIBILITY_SCHEMA_VERSION } from "../lib/looplab-color-accessibility.mjs";
import { getLooplabCommandContract } from "../lib/looplab-agent-contracts.mjs";
import { getAgentManifest } from "../lib/looplab-agent-core.mjs";

function frame(width, height, paint = () => [20, 20, 24, 255]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const color = paint(x, y);
    const offset = (y * width + x) * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3] ?? 255;
  }
  return { width, height, pixels };
}

test("identical frames produce a source-bound empty comparison", () => {
  const current = frame(8, 8);
  const result = analyzeVisualPerception({ captureId: "capture-a", sourceDigest: "digest-a", frame: current, baselineFrame: current, baselineSha256: "sha256:old", options: { cellSize: 2, minimumRegionChangedPixels: 1 } });
  assert.equal(result.schemaVersion, LOOPLAB_VISUAL_PERCEPTION_SCHEMA_VERSION);
  assert.equal(result.sourceDigest, "digest-a");
  assert.equal(result.comparison.status, "compared");
  assert.equal(result.comparison.metrics.changedPixelCount, 0);
  assert.equal(result.annotationCount, 0);
  assert.equal(result.policy.pixelDiffClaim, "changed-region-only");
});

test("disconnected pixel changes become deterministic bounded review regions", () => {
  const baseline = frame(12, 8);
  const current = frame(12, 8, (x, y) => (x < 2 && y < 2) || (x >= 8 && y >= 4) ? [220, 80, 90, 255] : [20, 20, 24, 255]);
  const result = analyzeVisualPerception({
    captureId: "capture-b",
    sourceDigest: "digest-b",
    frame: current,
    baselineFrame: baseline,
    options: { cellSize: 2, pixelThreshold: 1, minimumCellChangedRatio: 0.1, minimumRegionChangedPixels: 1 },
  });
  assert.equal(result.annotationCount, 2);
  assert.deepEqual(result.annotations.map((annotation) => annotation.bounds), [
    { x: 8, y: 4, width: 4, height: 4, xRatio: 2 / 3, yRatio: 1 / 2, widthRatio: 1 / 3, heightRatio: 1 / 2 },
    { x: 0, y: 0, width: 2, height: 2, xRatio: 0, yRatio: 0, widthRatio: 1 / 6, heightRatio: 1 / 4 },
  ]);
  assert.ok(result.annotations.every((annotation) => annotation.kind === "changed-region" && annotation.source === "pixel-diff"));
  assert.match(result.annotations[0].detail, /not an automatic defect claim/);
});

test("changed-region count is bounded and reports truncation", () => {
  const baseline = frame(20, 2);
  const current = frame(20, 2, (x) => x % 4 < 2 ? [255, 255, 255, 255] : [20, 20, 24, 255]);
  const result = analyzeVisualPerception({ captureId: "bounded", sourceDigest: "digest", frame: current, baselineFrame: baseline, options: { cellSize: 2, pixelThreshold: 1, minimumCellChangedRatio: 0.1, minimumRegionChangedPixels: 1, maximumRegions: 2 } });
  assert.equal(result.annotationCount, 2);
  assert.equal(result.comparison.metrics.truncatedRegionCount, 3);
});

test("semantic targets are clipped, normalized, labelled, and ordered before pixel evidence", () => {
  const current = frame(100, 50);
  const result = analyzeVisualPerception({
    captureId: "semantic",
    sourceDigest: "digest",
    frame: current,
    baselineFrame: current,
    semanticTargets: [
      { kind: "hud-content-overlap", severity: "warning", label: "HUD crosses kiosk", detail: "Known DOM and object rectangles intersect.", bounds: { x: 80, y: -10, width: 40, height: 30 }, affectedIds: ["kiosk", "kiosk"] },
      { kind: "doctor-finding", severity: "error", label: "support-z", bounds: { x: 10, y: 10, width: 20, height: 10 }, sourceEvidenceIds: ["support-z"] },
    ],
  });
  assert.equal(result.annotationCount, 2);
  assert.equal(result.annotations[0].severity, "error");
  assert.equal(result.annotations[1].kind, "hud-content-overlap");
  assert.deepEqual(result.annotations[1].bounds, { x: 80, y: 0, width: 20, height: 20, xRatio: 0.8, yRatio: 0, widthRatio: 0.2, heightRatio: 0.4 });
  assert.deepEqual(result.annotations[1].affectedIds, ["kiosk"]);
  assert.equal(result.annotations[1].number, 2);
});

test("a baseline with another size is reported but never stretched into a false diff", () => {
  const result = analyzeVisualPerception({ captureId: "mismatch", sourceDigest: "digest", frame: frame(8, 8), baselineFrame: frame(4, 4) });
  assert.equal(result.comparison.status, "dimension-mismatch");
  assert.equal(result.annotationCount, 0);
});

test("visual bounds reject empty regions and clip partial frame intersections", () => {
  assert.equal(normalizeVisualBounds({ x: 1, y: 1, width: 0, height: 4 }, 10, 10), null);
  assert.equal(normalizeVisualBounds({ x: 20, y: 20, width: 2, height: 2 }, 10, 10), null);
  assert.deepEqual(normalizeVisualBounds({ x: -2, y: 8, width: 6, height: 6 }, 10, 10), { x: 0, y: 8, width: 4, height: 2, xRatio: 0, yRatio: 0.8, widthRatio: 0.4, heightRatio: 0.2 });
});

test("edge clipping ignores subpixel scaling noise but reports material overflow", () => {
  assert.equal(visualBoundsExtendBeyondFrame({ x: 0, y: 684 / 720 * 221, width: 390, height: 36 / 720 * 221 }, 390, 221, 1), false);
  assert.equal(visualBoundsExtendBeyondFrame({ x: -0.25, y: 0, width: 390.5, height: 221.00001 }, 390, 221, 1), false);
  assert.equal(visualBoundsExtendBeyondFrame({ x: -2, y: 0, width: 392, height: 221 }, 390, 221, 1), true);
});

test("HUD review respects authored overlap exceptions and excludes non-landmark scaffolding", () => {
  assert.equal(isHudVisualReviewTarget({ id: "backdrop", kind: "decor", allowHudOverlap: true }), false);
  assert.equal(isHudVisualReviewTarget({ id: "ground", kind: "platform", role: "ground-plane" }), false);
  assert.equal(isHudVisualReviewTarget({ id: "spawn", kind: "spawn" }), false);
  assert.equal(isHudVisualReviewTarget({ id: "goal", kind: "goal" }), true);
  assert.equal(isHudVisualReviewTarget({ id: "rail", kind: "decor", role: "rail" }), true);
});

test("visual perception carries exact color receipts and bounded color issues into annotations", () => {
  const result = analyzeVisualPerception({
    captureId: "color-review",
    sourceDigest: "digest-color",
    frame: frame(12, 12, (x, y) => x >= 3 && x < 9 && y >= 3 && y < 9 ? [80, 80, 80, 255] : [90, 90, 90, 255]),
    colorTargets: [{ id: "player", label: "Player", kind: "gameplay-cue", source: "captured-gameplay-color", foreground: "#505050", background: "#5a5a5a", bounds: { x: 3, y: 3, width: 6, height: 6 }, essential: true, redundantCue: "silhouette" }],
  });
  assert.equal(result.colorAccessibility.schemaVersion, LOOPLAB_COLOR_ACCESSIBILITY_SCHEMA_VERSION);
  assert.equal(result.colorAccessibility.summary.contrast, 1);
  assert.equal(result.annotations.length, 1);
  assert.equal(result.annotations[0].source, "color-accessibility");
  assert.equal(result.annotations[0].kind, "color-contrast");
  assert.deepEqual(result.annotations[0].bounds, { x: 3, y: 3, width: 6, height: 6, xRatio: 0.25, yRatio: 0.25, widthRatio: 0.5, heightRatio: 0.5 });
});

test("the published browser contracts expose truthful, opt-in visual payload controls", () => {
  const capture = getLooplabCommandContract("capture_visual_review");
  assert.equal(capture.inputSchema.additionalProperties, false);
  assert.equal(Object.hasOwn(capture.inputSchema.properties, "imageDataUrl"), false);

  const read = getLooplabCommandContract("get_visual_review");
  assert.deepEqual(Object.keys(read.inputSchema.properties).filter((key) => key.startsWith("include")), ["includeThumbnails", "includeAnnotatedImages", "includeCrops"]);

  const select = getLooplabCommandContract("select_visual_review_capture");
  assert.deepEqual(select.inputSchema.anyOf, [{ required: ["id"] }, { required: ["captureId"] }]);
  assert.equal(select.inputSchema.properties.includeAnnotatedImage.type, "boolean");

  const manifest = getAgentManifest();
  assert.equal(manifest.protocolVersion, "1.105.0");
  assert.equal(manifest.verification.visualPerception.schemaVersion, LOOPLAB_VISUAL_PERCEPTION_SCHEMA_VERSION);
  assert.equal(manifest.verification.visualPerception.colorAccessibility.schemaVersion, LOOPLAB_COLOR_ACCESSIBILITY_SCHEMA_VERSION);
  assert.match(manifest.verification.visualPerception.claimBoundary, /only identifies changed regions/);
  assert.match(manifest.verification.visualPerception.colorAccessibility.claimBoundary, /never claim taste/);
  assert.match(manifest.verification.visualPerception.visualOnlyPolicy, /collect_verification_evidence remains strict/);
});
