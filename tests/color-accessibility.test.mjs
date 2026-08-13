import assert from "node:assert/strict";
import test from "node:test";

import {
  LOOPLAB_COLOR_ACCESSIBILITY_SCHEMA_VERSION,
  analyzeColorAccessibility,
  contrastRatio,
  deltaE76,
  parseCssColor,
  simulateColorVisionDeficiency,
} from "../lib/looplab-color-accessibility.mjs";

function frame(width, height, paint = () => [255, 255, 255, 255]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const color = paint(x, y);
    const offset = (y * width + x) * 4;
    pixels.set(color, offset);
  }
  return { width, height, pixels };
}

test("WCAG sRGB contrast primitives are deterministic", () => {
  assert.deepEqual(parseCssColor("rgba(255 0 128 / 50%)"), { r: 255, g: 0, b: 128, a: 0.5 });
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.ok(Math.abs(contrastRatio("#777777", "#ffffff") - 4.478089453577214) < 1e-12);
});

test("normal and large text use their declared WCAG 2.2 thresholds", () => {
  const result = analyzeColorAccessibility({
    captureId: "contrast",
    sourceDigest: "digest",
    frame: frame(4, 4),
    targets: [
      { id: "normal", label: "Normal copy", kind: "text", source: "authored-color-pair", foreground: "#777777", background: "#ffffff" },
      { id: "large", label: "Large copy", kind: "text", source: "authored-color-pair", foreground: "#777777", background: "#ffffff", largeText: true },
    ],
  });
  assert.equal(result.schemaVersion, LOOPLAB_COLOR_ACCESSIBILITY_SCHEMA_VERSION);
  assert.equal(result.targets[0].contrast.threshold, 4.5);
  assert.equal(result.targets[0].contrast.result, "review");
  assert.equal(result.targets[1].contrast.threshold, 3);
  assert.equal(result.targets[1].contrast.result, "passed");
  assert.equal(result.summary.contrast, 1);
});

test("translucent HUD contrast is composited over exact underlying capture pixels", () => {
  const result = analyzeColorAccessibility({
    captureId: "translucent",
    sourceDigest: "digest",
    frame: frame(8, 2, (x) => x < 4 ? [255, 255, 255, 255] : [0, 0, 0, 255]),
    targets: [{
      id: "hud-label",
      label: "HUD label",
      kind: "text",
      source: "computed-style-over-captured-pixels",
      foreground: "#ffffff",
      backgroundLayers: ["rgba(0, 0, 0, 0.5)"],
      bounds: { x: 0, y: 0, width: 8, height: 2 },
    }],
  });
  const contrast = result.targets[0].contrast;
  assert.equal(result.targets[0].observation.sampleCount, 16);
  assert.ok(contrast.minimum < contrast.maximum);
  assert.equal(contrast.result, "review");
});

test("an absent authored gameplay color remains unobserved without a false verdict", () => {
  const result = analyzeColorAccessibility({
    captureId: "absent",
    sourceDigest: "digest",
    frame: frame(12, 12, () => [20, 20, 20, 255]),
    targets: [{ id: "goal", label: "Goal", kind: "gameplay-cue", source: "captured-gameplay-color", foreground: "#ff00ff", background: "#141414", bounds: { x: 2, y: 2, width: 6, height: 6 } }],
  });
  assert.equal(result.targets[0].status, "unobserved-authored-color");
  assert.equal(result.targets[0].contrast.result, "unmeasured");
  assert.equal(result.summary.unobservedCount, 1);
  assert.equal(result.summary.contrast, 0);
});

test("captured gameplay colors are measured against adjacent exact pixels", () => {
  const result = analyzeColorAccessibility({
    captureId: "observed",
    sourceDigest: "digest",
    frame: frame(12, 12, (x, y) => x >= 3 && x < 9 && y >= 3 && y < 9 ? [80, 80, 80, 255] : [90, 90, 90, 255]),
    targets: [{ id: "player", label: "Player", kind: "gameplay-cue", source: "captured-gameplay-color", foreground: "#505050", background: "#5a5a5a", bounds: { x: 3, y: 3, width: 6, height: 6 }, essential: true, redundantCue: "silhouette" }],
  });
  assert.equal(result.targets[0].status, "measured");
  assert.equal(result.targets[0].contrast.result, "review");
  assert.ok(result.targets[0].observation.foregroundPixelCount >= 3);
  assert.ok(result.targets[0].observation.adjacentPixelCount > 0);
});

test("Machado full-severity simulations are pinned diagnostics", () => {
  const protan = simulateColorVisionDeficiency("#ff0000", "protan");
  const deutan = simulateColorVisionDeficiency("#00ff00", "deutan");
  const tritan = simulateColorVisionDeficiency("#0000ff", "tritan");
  assert.deepEqual([protan.r, protan.g, protan.b].map((value) => Math.round(value * 1e6) / 1e6), [108.78516, 95.026841, 0]);
  assert.deepEqual([deutan.r, deutan.g, deutan.b].map((value) => Math.round(value * 1e6) / 1e6), [238.693017, 214.008173, 58.443926]);
  assert.deepEqual([tritan.r, tritan.g, tritan.b].map((value) => Math.round(value * 1e6) / 1e6), [0, 107.196897, 149.756093]);
  assert.ok(deltaE76("#ff0000", "#00ff00") > 100);
});

test("authored color-only meaning requires a redundant cue declaration", () => {
  const result = analyzeColorAccessibility({
    captureId: "meaning",
    sourceDigest: "digest",
    frame: frame(2, 2),
    targets: [{ id: "state", label: "Danger state", kind: "semantic-pair", source: "authored-color-pair", foreground: "#ff0000", background: "#ffffff", conveysMeaningByColor: true }],
  });
  assert.equal(result.summary.colorOnly, 1);
  assert.equal(result.status, "review-required");
  assert.match(result.issues.find((entry) => entry.kind === "color-only-meaning").detail, /does not declare text, shape/);
  assert.equal(result.policy.noConformanceClaim, true);
  assert.equal(result.policy.simulationIsNotUserTesting, true);
});
