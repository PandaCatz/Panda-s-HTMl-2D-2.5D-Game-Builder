export const LOOPLAB_COLOR_ACCESSIBILITY_SCHEMA_VERSION = "looplab-color-accessibility/v1";

export const LOOPLAB_CVD_MODEL = Object.freeze({
  id: "machado-oliveira-fernandes-2009",
  severity: 1,
  matrixSource: "Machado 2010 Appendix A",
  colorSpace: "linear-srgb",
});

export const LOOPLAB_CVD_MATRICES = Object.freeze({
  protan: Object.freeze([
    Object.freeze([0.152286, 1.052583, -0.204868]),
    Object.freeze([0.114503, 0.786281, 0.099216]),
    Object.freeze([-0.003882, -0.048116, 1.051998]),
  ]),
  deutan: Object.freeze([
    Object.freeze([0.367322, 0.860646, -0.227968]),
    Object.freeze([0.280085, 0.672501, 0.047413]),
    Object.freeze([-0.011820, 0.042940, 0.968881]),
  ]),
  tritan: Object.freeze([
    Object.freeze([1.255528, -0.076749, -0.178779]),
    Object.freeze([-0.078411, 0.930809, 0.147602]),
    Object.freeze([0.004733, 0.691367, 0.303900]),
  ]),
});

const CVD_TYPES = Object.freeze(Object.keys(LOOPLAB_CVD_MATRICES));
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value)));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, places = 4) => Number(Number(value).toFixed(places));
const cleanText = (value, fallback) => String(value ?? "").trim() || fallback;

function validateFrame(frame) {
  const width = Math.trunc(Number(frame?.width));
  const height = Math.trunc(Number(frame?.height));
  const pixels = frame?.pixels ?? frame?.data;
  if (width <= 0 || height <= 0 || !(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * 4) {
    throw new Error("Color accessibility requires width × height RGBA capture pixels.");
  }
  return { width, height, pixels };
}

function parseChannel(value) {
  const source = String(value ?? "").trim();
  if (source.endsWith("%")) return clamp(Number.parseFloat(source) * 2.55, 0, 255);
  return clamp(Number.parseFloat(source), 0, 255);
}

function parseAlpha(value) {
  const source = String(value ?? "").trim();
  if (!source) return 1;
  if (source.endsWith("%")) return clamp(Number.parseFloat(source) / 100, 0, 1);
  return clamp(Number.parseFloat(source), 0, 1);
}

export function parseCssColor(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const r = Number(value.r);
    const g = Number(value.g);
    const b = Number(value.b);
    const a = value.a == null ? 1 : Number(value.a);
    if ([r, g, b, a].every(Number.isFinite)) return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: clamp(a, 0, 1) };
  }
  const source = String(value ?? "").trim().toLowerCase();
  if (!source) return null;
  if (source === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = source.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex) {
    if (hex.length === 3 || hex.length === 4) return {
      r: Number.parseInt(hex[0] + hex[0], 16),
      g: Number.parseInt(hex[1] + hex[1], 16),
      b: Number.parseInt(hex[2] + hex[2], 16),
      a: hex.length === 4 ? Number.parseInt(hex[3] + hex[3], 16) / 255 : 1,
    };
    if (hex.length === 6 || hex.length === 8) return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }
  const functional = source.match(/^rgba?\((.*)\)$/i)?.[1];
  if (!functional) return null;
  const slashParts = functional.split("/").map((part) => part.trim());
  const components = slashParts[0].replaceAll(",", " ").split(/\s+/).filter(Boolean);
  let alpha = slashParts[1] ?? null;
  if (components.length === 4 && alpha == null) alpha = components.pop();
  if (components.length !== 3) return null;
  const parsed = { r: parseChannel(components[0]), g: parseChannel(components[1]), b: parseChannel(components[2]), a: parseAlpha(alpha) };
  return Object.values(parsed).every(Number.isFinite) ? parsed : null;
}

export function compositeCssColors(foreground, background) {
  const front = parseCssColor(foreground);
  const back = parseCssColor(background);
  if (!front || !back) return null;
  const alpha = front.a + back.a * (1 - front.a);
  if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (front.r * front.a + back.r * back.a * (1 - front.a)) / alpha,
    g: (front.g * front.a + back.g * back.a * (1 - front.a)) / alpha,
    b: (front.b * front.a + back.b * back.a * (1 - front.a)) / alpha,
    a: alpha,
  };
}

const srgbToLinear = (value) => {
  const normalized = clamp(value, 0, 255) / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};

const linearToSrgb = (value) => {
  const normalized = clamp(value, 0, 1);
  return 255 * (normalized <= 0.0031308 ? normalized * 12.92 : 1.055 * normalized ** (1 / 2.4) - 0.055);
};

export function relativeLuminance(color) {
  const parsed = parseCssColor(color);
  if (!parsed) return null;
  return 0.2126 * srgbToLinear(parsed.r) + 0.7152 * srgbToLinear(parsed.g) + 0.0722 * srgbToLinear(parsed.b);
}

export function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  if (firstLuminance == null || secondLuminance == null) return null;
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function opaqueOverWhite(color) {
  const parsed = parseCssColor(color);
  if (!parsed) return null;
  return parsed.a >= 1 ? parsed : compositeCssColors(parsed, { r: 255, g: 255, b: 255, a: 1 });
}

export function simulateColorVisionDeficiency(color, type) {
  const parsed = opaqueOverWhite(color);
  const matrix = LOOPLAB_CVD_MATRICES[type];
  if (!parsed || !matrix) return null;
  const source = [srgbToLinear(parsed.r), srgbToLinear(parsed.g), srgbToLinear(parsed.b)];
  const result = matrix.map((row) => row[0] * source[0] + row[1] * source[1] + row[2] * source[2]);
  return { r: linearToSrgb(result[0]), g: linearToSrgb(result[1]), b: linearToSrgb(result[2]), a: parsed.a };
}

function colorToLab(color) {
  const parsed = opaqueOverWhite(color);
  if (!parsed) return null;
  const r = srgbToLinear(parsed.r);
  const g = srgbToLinear(parsed.g);
  const b = srgbToLinear(parsed.b);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const transform = (value) => value > 216 / 24389 ? Math.cbrt(value) : (841 / 108) * value + 4 / 29;
  const fx = transform(x);
  const fy = transform(y);
  const fz = transform(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function deltaE76(first, second) {
  const a = colorToLab(first);
  const b = colorToLab(second);
  if (!a || !b) return null;
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

function colorHex(color) {
  const parsed = parseCssColor(color);
  if (!parsed) return null;
  return `#${[parsed.r, parsed.g, parsed.b].map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
}

function normalizeBounds(bounds, frame) {
  const x = Math.max(0, Math.floor(finite(bounds?.x)));
  const y = Math.max(0, Math.floor(finite(bounds?.y)));
  const right = Math.min(frame.width, Math.ceil(finite(bounds?.x) + finite(bounds?.width)));
  const bottom = Math.min(frame.height, Math.ceil(finite(bounds?.y) + finite(bounds?.height)));
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function pixelsInBounds(frame, bounds, maximumSamples = 4096) {
  const normalized = normalizeBounds(bounds, frame);
  if (!normalized) return [];
  const area = normalized.width * normalized.height;
  const stride = Math.max(1, Math.ceil(Math.sqrt(area / Math.max(1, maximumSamples))));
  const result = [];
  for (let y = normalized.y; y < normalized.y + normalized.height; y += stride) for (let x = normalized.x; x < normalized.x + normalized.width; x += stride) {
    const offset = (y * frame.width + x) * 4;
    result.push({ r: frame.pixels[offset], g: frame.pixels[offset + 1], b: frame.pixels[offset + 2], a: frame.pixels[offset + 3] / 255, x, y });
  }
  return result;
}

function ringPixels(frame, bounds, thickness = 3, maximumSamples = 4096) {
  const normalized = normalizeBounds(bounds, frame);
  if (!normalized) return [];
  const outer = normalizeBounds({ x: normalized.x - thickness, y: normalized.y - thickness, width: normalized.width + thickness * 2, height: normalized.height + thickness * 2 }, frame);
  if (!outer) return [];
  return pixelsInBounds(frame, outer, maximumSamples).filter((pixel) => pixel.x < normalized.x || pixel.x >= normalized.x + normalized.width || pixel.y < normalized.y || pixel.y >= normalized.y + normalized.height);
}

function colorDistance(first, second) {
  return Math.hypot(first.r - second.r, first.g - second.g, first.b - second.b);
}

function averageColor(colors) {
  if (!colors.length) return null;
  const total = colors.reduce((sum, color) => ({ r: sum.r + color.r, g: sum.g + color.g, b: sum.b + color.b, a: sum.a + color.a }), { r: 0, g: 0, b: 0, a: 0 });
  return { r: total.r / colors.length, g: total.g / colors.length, b: total.b / colors.length, a: total.a / colors.length };
}

function dominantColor(colors) {
  if (!colors.length) return null;
  const buckets = new Map();
  for (const color of colors) {
    const key = `${Math.round(color.r / 16)}:${Math.round(color.g / 16)}:${Math.round(color.b / 16)}`;
    const entry = buckets.get(key) ?? { colors: [], count: 0 };
    entry.colors.push(color);
    entry.count += 1;
    buckets.set(key, entry);
  }
  const selected = [...buckets.entries()].sort((first, second) => second[1].count - first[1].count || first[0].localeCompare(second[0]))[0]?.[1];
  return selected ? averageColor(selected.colors) : null;
}

function contrastThreshold(target) {
  if (target.kind === "text") return target.largeText === true ? 3 : 4.5;
  if (target.kind === "essential-non-text" || target.kind === "gameplay-cue") return target.essential === false ? null : 3;
  return null;
}

function cvdMeasurements(foreground, background) {
  const normalDeltaE76 = deltaE76(foreground, background);
  const simulations = CVD_TYPES.map((type) => {
    const simulatedForeground = simulateColorVisionDeficiency(foreground, type);
    const simulatedBackground = simulateColorVisionDeficiency(background, type);
    const simulatedDelta = deltaE76(simulatedForeground, simulatedBackground);
    return {
      type,
      foreground: colorHex(simulatedForeground),
      background: colorHex(simulatedBackground),
      deltaE76: round(simulatedDelta ?? 0),
      retainedSeparation: normalDeltaE76 && simulatedDelta != null ? round(simulatedDelta / normalDeltaE76) : null,
    };
  });
  return { model: LOOPLAB_CVD_MODEL, normalDeltaE76: round(normalDeltaE76 ?? 0), simulations };
}

function issue({ target, kind, label, detail, metrics = {} }) {
  return {
    id: `${cleanText(target.id, "color-target")}:${kind}`,
    targetId: cleanText(target.id, "color-target"),
    kind,
    severity: "warning",
    label,
    detail,
    bounds: target.bounds ?? null,
    metrics,
  };
}

function analyzeComputedSurface(target, frame, options) {
  const foreground = parseCssColor(target.foreground);
  const layers = (Array.isArray(target.backgroundLayers) && target.backgroundLayers.length ? target.backgroundLayers : [target.background]).map(parseCssColor).filter(Boolean);
  const samples = pixelsInBounds(frame, target.bounds, options.maximumSamplesPerTarget);
  if (!foreground || !layers.length || !samples.length) return { status: "unmeasured", reason: "The computed foreground, background layers, or exact capture region is unavailable.", sampleCount: samples.length };
  const rows = samples.map((underlay) => {
    let background = underlay.a >= 1 ? underlay : compositeCssColors(underlay, { r: 255, g: 255, b: 255, a: 1 });
    for (const layer of layers) background = compositeCssColors(layer, background);
    const effectiveForeground = compositeCssColors(foreground, background);
    return { ratio: contrastRatio(effectiveForeground, background), foreground: effectiveForeground, background };
  }).filter((entry) => entry.ratio != null).sort((first, second) => first.ratio - second.ratio);
  if (!rows.length) return { status: "unmeasured", reason: "No composited pixel pair could be measured.", sampleCount: 0 };
  const minimum = rows[0];
  const p05 = rows[Math.min(rows.length - 1, Math.floor((rows.length - 1) * 0.05))];
  const median = rows[Math.floor((rows.length - 1) * 0.5)];
  const maximum = rows[rows.length - 1];
  return {
    status: "measured",
    sampleCount: rows.length,
    foreground: minimum.foreground,
    background: minimum.background,
    contrastRatios: { minimum: round(minimum.ratio), p05: round(p05.ratio), median: round(median.ratio), maximum: round(maximum.ratio) },
  };
}

function analyzeCapturedGameplayColor(target, frame, options) {
  const authored = parseCssColor(target.foreground);
  const samples = pixelsInBounds(frame, target.bounds, options.maximumSamplesPerTarget);
  if (!authored || !samples.length) return { status: "unmeasured", reason: "The authored foreground or exact capture region is unavailable.", sampleCount: samples.length };
  const matches = samples.filter((pixel) => colorDistance(pixel, authored) <= options.authoredColorTolerance);
  const minimumObservedPixels = Math.min(samples.length, options.minimumObservedPixels);
  if (matches.length < minimumObservedPixels) return {
    status: "unobserved-authored-color",
    reason: "The authored gameplay color was not observed often enough inside its exact capture bounds; no contrast verdict was invented.",
    sampleCount: samples.length,
    foregroundPixelCount: matches.length,
    foregroundPixelRatio: round(matches.length / samples.length),
  };
  const foreground = averageColor(matches);
  const ring = ringPixels(frame, target.bounds, options.ringThickness, options.maximumSamplesPerTarget);
  const background = dominantColor(ring) ?? parseCssColor(target.background);
  if (!foreground || !background) return { status: "unmeasured", reason: "No adjacent captured background color was available.", sampleCount: samples.length, foregroundPixelCount: matches.length };
  const ratio = contrastRatio(foreground, background);
  return {
    status: "measured",
    sampleCount: samples.length,
    foregroundPixelCount: matches.length,
    foregroundPixelRatio: round(matches.length / samples.length),
    adjacentPixelCount: ring.length,
    foreground,
    background,
    contrastRatios: { minimum: round(ratio ?? 0), p05: round(ratio ?? 0), median: round(ratio ?? 0), maximum: round(ratio ?? 0) },
  };
}

function analyzeAuthoredPair(target) {
  const foreground = parseCssColor(target.foreground);
  const background = parseCssColor(target.background);
  if (!foreground || !background) return { status: "unmeasured", reason: "The authored color pair is invalid.", sampleCount: 0 };
  const effectiveBackground = opaqueOverWhite(background);
  const effectiveForeground = compositeCssColors(foreground, effectiveBackground);
  const ratio = contrastRatio(effectiveForeground, effectiveBackground);
  return {
    status: "measured",
    sampleCount: 1,
    foreground: effectiveForeground,
    background: effectiveBackground,
    contrastRatios: { minimum: round(ratio ?? 0), p05: round(ratio ?? 0), median: round(ratio ?? 0), maximum: round(ratio ?? 0) },
  };
}

/**
 * Measures declared visual color pairs. Results are advisory evidence, never a
 * taste score, legal/conformance decision, diagnosis, or substitute for users.
 *
 * @param {{ captureId?: unknown, sourceDigest?: unknown, frame?: unknown, targets?: any[], options?: Record<string, unknown> }} [input]
 */
export function analyzeColorAccessibility({ captureId, sourceDigest, frame, targets = [], options = {} } = {}) {
  const current = validateFrame(frame);
  const settings = {
    maximumTargets: Math.max(1, Math.min(128, Math.trunc(finite(options.maximumTargets, 48)))),
    maximumSamplesPerTarget: Math.max(16, Math.min(16384, Math.trunc(finite(options.maximumSamplesPerTarget, 4096)))),
    authoredColorTolerance: clamp(finite(options.authoredColorTolerance, 24), 0, 128),
    minimumObservedPixels: Math.max(1, Math.min(64, Math.trunc(finite(options.minimumObservedPixels, 3)))),
    ringThickness: Math.max(1, Math.min(16, Math.trunc(finite(options.ringThickness, 3)))),
    cvdDeltaE76ReviewThreshold: clamp(finite(options.cvdDeltaE76ReviewThreshold, 10), 0, 100),
    cvdRetainedSeparationThreshold: clamp(finite(options.cvdRetainedSeparationThreshold, 0.25), 0, 1),
  };
  const normalizedTargets = (Array.isArray(targets) ? targets : []).slice(0, settings.maximumTargets).map((target, index) => ({
    ...target,
    id: cleanText(target?.id, `color-target-${index + 1}`),
    label: cleanText(target?.label, `Color target ${index + 1}`),
    kind: ["text", "essential-non-text", "gameplay-cue", "semantic-pair"].includes(target?.kind) ? target.kind : "semantic-pair",
    source: ["computed-style-over-captured-pixels", "captured-gameplay-color", "authored-color-pair"].includes(target?.source) ? target.source : "authored-color-pair",
    bounds: normalizeBounds(target?.bounds, current),
  }));
  const issues = [];
  const results = normalizedTargets.map((target) => {
    const measurement = target.source === "computed-style-over-captured-pixels"
      ? analyzeComputedSurface(target, current, settings)
      : target.source === "captured-gameplay-color"
        ? analyzeCapturedGameplayColor(target, current, settings)
        : analyzeAuthoredPair(target);
    const threshold = contrastThreshold(target);
    const contrast = measurement.status === "measured" && threshold != null ? {
      ...measurement.contrastRatios,
      threshold,
      result: measurement.contrastRatios.minimum + 1e-9 >= threshold ? "passed" : "review",
    } : { ...(measurement.contrastRatios ?? {}), threshold, result: "unmeasured" };
    const cvd = measurement.status === "measured" ? cvdMeasurements(measurement.foreground, measurement.background) : null;
    if (contrast.result === "review") issues.push(issue({
      target,
      kind: "color-contrast",
      label: `Low contrast: ${target.label}`,
      detail: `Measured minimum contrast ${contrast.minimum.toFixed(2)}:1; this declared ${target.kind.replaceAll("-", " ")} target requires ${threshold.toFixed(1)}:1 for the selected WCAG 2.2 review threshold.`,
      metrics: { minimumContrast: contrast.minimum, threshold, source: target.source },
    }));
    if (target.conveysMeaningByColor === true && !target.redundantCue) issues.push(issue({
      target,
      kind: "color-only-meaning",
      label: `Color-only cue: ${target.label}`,
      detail: "This authored cue says color conveys meaning but does not declare text, shape, outline, pattern, motion, or another redundant visual signal. Exact pixels cannot prove a missing cue is harmless.",
      metrics: { wcagCriterion: "1.4.1", source: target.source },
    }));
    if (cvd && target.cvdRelevant !== false) {
      const vulnerable = cvd.simulations.filter((entry) => (cvd.normalDeltaE76 >= settings.cvdDeltaE76ReviewThreshold && entry.deltaE76 < settings.cvdDeltaE76ReviewThreshold)
        || (entry.retainedSeparation != null && cvd.normalDeltaE76 >= settings.cvdDeltaE76ReviewThreshold && entry.retainedSeparation < settings.cvdRetainedSeparationThreshold));
      if (vulnerable.length) issues.push(issue({
        target,
        kind: "cvd-separation-risk",
        label: `CVD separation risk: ${target.label}`,
        detail: `The Machado full-severity simulation substantially reduces this pair under ${vulnerable.map((entry) => entry.type).join(", ")}. This is a LoopLab review heuristic, not a WCAG threshold or user-test result.`,
        metrics: { normalDeltaE76: cvd.normalDeltaE76, simulations: vulnerable },
      }));
    }
    return {
      id: target.id,
      label: target.label,
      kind: target.kind,
      source: target.source,
      bounds: target.bounds,
      status: measurement.status,
      reason: measurement.reason ?? null,
      colors: measurement.status === "measured" ? { foreground: colorHex(measurement.foreground), background: colorHex(measurement.background), authoredForeground: colorHex(target.foreground), authoredBackground: colorHex(target.background) } : { authoredForeground: colorHex(target.foreground), authoredBackground: colorHex(target.background) },
      observation: {
        sampleCount: measurement.sampleCount ?? 0,
        foregroundPixelCount: measurement.foregroundPixelCount ?? null,
        foregroundPixelRatio: measurement.foregroundPixelRatio ?? null,
        adjacentPixelCount: measurement.adjacentPixelCount ?? null,
      },
      contrast,
      cvd,
      semantics: {
        essential: target.essential !== false,
        largeText: target.largeText === true,
        conveysMeaningByColor: target.conveysMeaningByColor === true,
        redundantCue: cleanText(target.redundantCue, "") || null,
      },
    };
  });
  const issueCounts = {
    contrast: issues.filter((entry) => entry.kind === "color-contrast").length,
    cvd: issues.filter((entry) => entry.kind === "cvd-separation-risk").length,
    colorOnly: issues.filter((entry) => entry.kind === "color-only-meaning").length,
  };
  return {
    schemaVersion: LOOPLAB_COLOR_ACCESSIBILITY_SCHEMA_VERSION,
    captureId: cleanText(captureId, "capture"),
    sourceDigest: cleanText(sourceDigest, "unknown"),
    frame: { width: current.width, height: current.height },
    status: issues.length ? "review-required" : "measured",
    summary: {
      targetCount: results.length,
      measuredCount: results.filter((entry) => entry.status === "measured").length,
      unobservedCount: results.filter((entry) => entry.status === "unobserved-authored-color").length,
      unmeasuredCount: results.filter((entry) => entry.status === "unmeasured").length,
      issueCount: issues.length,
      ...issueCounts,
    },
    targets: results,
    issues,
    policy: {
      advisoryOnly: true,
      noTasteClaim: true,
      noConformanceClaim: true,
      simulationIsNotUserTesting: true,
      cvdThresholdKind: "looplab-review-heuristic",
      useOfColorRequiresAuthoredSemantics: true,
      exactPixelRequirement: "Translucent computed HUD surfaces are composited over capture pixels; authored gameplay colors are measured only when observed inside bounded capture geometry.",
    },
  };
}
