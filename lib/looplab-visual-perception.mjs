export const LOOPLAB_VISUAL_PERCEPTION_SCHEMA_VERSION = "looplab-visual-perception/v1";

const SEVERITY_ORDER = Object.freeze({ error: 0, warning: 1, info: 2 });

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value)));

function validateFrame(frame, label) {
  const width = Math.trunc(Number(frame?.width));
  const height = Math.trunc(Number(frame?.height));
  const pixels = frame?.pixels ?? frame?.data;
  if (width <= 0 || height <= 0 || !(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * 4) {
    throw new Error(`${label} must contain width × height RGBA pixels.`);
  }
  return { width, height, pixels };
}

function text(value, fallback) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function uniqueStrings(values, maximum = 24) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value ?? "").trim()).filter(Boolean))].slice(0, maximum);
}

function slug(value) {
  return text(value, "region").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "region";
}

export function normalizeVisualBounds(bounds, frameWidth, frameHeight) {
  const width = Math.max(1, Math.trunc(Number(frameWidth)));
  const height = Math.max(1, Math.trunc(Number(frameHeight)));
  const rawX = Number(bounds?.x ?? 0);
  const rawY = Number(bounds?.y ?? 0);
  const rawWidth = Math.max(0, Number(bounds?.width ?? 0));
  const rawHeight = Math.max(0, Number(bounds?.height ?? 0));
  if (![rawX, rawY, rawWidth, rawHeight].every(Number.isFinite) || rawWidth <= 0 || rawHeight <= 0) return null;
  const left = clamp(rawX, 0, width);
  const top = clamp(rawY, 0, height);
  const right = clamp(rawX + rawWidth, 0, width);
  const bottom = clamp(rawY + rawHeight, 0, height);
  if (right <= left || bottom <= top) return null;
  const normalized = {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.max(1, Math.round(right - left)),
    height: Math.max(1, Math.round(bottom - top)),
  };
  return {
    ...normalized,
    xRatio: normalized.x / width,
    yRatio: normalized.y / height,
    widthRatio: normalized.width / width,
    heightRatio: normalized.height / height,
  };
}

export function visualBoundsExtendBeyondFrame(bounds, frameWidth, frameHeight, tolerance = 1) {
  const width = Math.max(1, Number(frameWidth));
  const height = Math.max(1, Number(frameHeight));
  const allowed = Math.max(0, Number(tolerance));
  const x = Number(bounds?.x ?? 0);
  const y = Number(bounds?.y ?? 0);
  const boundsWidth = Number(bounds?.width ?? 0);
  const boundsHeight = Number(bounds?.height ?? 0);
  if (![width, height, allowed, x, y, boundsWidth, boundsHeight].every(Number.isFinite) || boundsWidth <= 0 || boundsHeight <= 0) return false;
  return x < -allowed || y < -allowed || x + boundsWidth > width + allowed || y + boundsHeight > height + allowed;
}

export function isHudVisualReviewTarget(object) {
  return Boolean(object)
    && object.allowHudOverlap !== true
    && object.role !== "ground-plane"
    && object.kind !== "spawn";
}

function changedPixel(first, second, offset, threshold) {
  return Math.abs(first[offset] - second[offset])
    + Math.abs(first[offset + 1] - second[offset + 1])
    + Math.abs(first[offset + 2] - second[offset + 2])
    + Math.abs(first[offset + 3] - second[offset + 3]) > threshold;
}

function changedComponents(current, baseline, options) {
  const pixelThreshold = Math.max(0, Math.trunc(Number(options.pixelThreshold ?? 36)));
  const cellSize = Math.max(2, Math.min(128, Math.trunc(Number(options.cellSize ?? 16))));
  const minimumCellChangedRatio = clamp(options.minimumCellChangedRatio ?? 0.08, 0, 1);
  const minimumRegionChangedPixels = Math.max(1, Math.trunc(Number(options.minimumRegionChangedPixels ?? 24)));
  const maximumRegions = Math.max(1, Math.min(64, Math.trunc(Number(options.maximumRegions ?? 12))));
  const columns = Math.ceil(current.width / cellSize);
  const rows = Math.ceil(current.height / cellSize);
  const changedByCell = new Uint32Array(columns * rows);
  const pixelsByCell = new Uint32Array(columns * rows);
  let changedPixelCount = 0;

  for (let y = 0; y < current.height; y += 1) for (let x = 0; x < current.width; x += 1) {
    const cellIndex = Math.floor(y / cellSize) * columns + Math.floor(x / cellSize);
    pixelsByCell[cellIndex] += 1;
    const offset = (y * current.width + x) * 4;
    if (changedPixel(current.pixels, baseline.pixels, offset, pixelThreshold)) {
      changedByCell[cellIndex] += 1;
      changedPixelCount += 1;
    }
  }

  const active = new Uint8Array(columns * rows);
  for (let index = 0; index < active.length; index += 1) {
    const ratio = pixelsByCell[index] ? changedByCell[index] / pixelsByCell[index] : 0;
    if (changedByCell[index] >= minimumRegionChangedPixels && ratio >= minimumCellChangedRatio) active[index] = 1;
  }

  const visited = new Uint8Array(active.length);
  const components = [];
  for (let start = 0; start < active.length; start += 1) {
    if (!active[start] || visited[start]) continue;
    const queue = [start];
    visited[start] = 1;
    let cursor = 0;
    let minimumColumn = columns;
    let maximumColumn = 0;
    let minimumRow = rows;
    let maximumRow = 0;
    let componentChangedPixels = 0;
    let componentPixels = 0;
    let changedCellCount = 0;
    while (cursor < queue.length) {
      const index = queue[cursor++];
      const row = Math.floor(index / columns);
      const column = index % columns;
      minimumColumn = Math.min(minimumColumn, column);
      maximumColumn = Math.max(maximumColumn, column);
      minimumRow = Math.min(minimumRow, row);
      maximumRow = Math.max(maximumRow, row);
      componentChangedPixels += changedByCell[index];
      componentPixels += pixelsByCell[index];
      changedCellCount += 1;
      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        if (rowOffset === 0 && columnOffset === 0) continue;
        const nextRow = row + rowOffset;
        const nextColumn = column + columnOffset;
        if (nextRow < 0 || nextRow >= rows || nextColumn < 0 || nextColumn >= columns) continue;
        const next = nextRow * columns + nextColumn;
        if (!active[next] || visited[next]) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    if (componentChangedPixels < minimumRegionChangedPixels) continue;
    components.push({
      bounds: normalizeVisualBounds({
        x: minimumColumn * cellSize,
        y: minimumRow * cellSize,
        width: (maximumColumn - minimumColumn + 1) * cellSize,
        height: (maximumRow - minimumRow + 1) * cellSize,
      }, current.width, current.height),
      changedPixelCount: componentChangedPixels,
      changedPixelRatio: componentPixels ? componentChangedPixels / componentPixels : 0,
      changedCellCount,
    });
  }

  components.sort((first, second) => second.changedPixelCount - first.changedPixelCount
    || first.bounds.y - second.bounds.y
    || first.bounds.x - second.bounds.x);
  return {
    pixelThreshold,
    cellSize,
    changedPixelCount,
    changedPixelRatio: changedPixelCount / (current.width * current.height),
    changedCellCount: active.reduce((total, value) => total + value, 0),
    components: components.slice(0, maximumRegions),
    truncatedRegionCount: Math.max(0, components.length - maximumRegions),
  };
}

function semanticAnnotations(targets, frame, maximumTargets) {
  return (Array.isArray(targets) ? targets : []).map((target) => {
    const bounds = normalizeVisualBounds(target?.bounds, frame.width, frame.height);
    if (!bounds) return null;
    return {
      kind: text(target?.kind, "review-target"),
      severity: Object.hasOwn(SEVERITY_ORDER, target?.severity) ? target.severity : "info",
      label: text(target?.label, "Review target"),
      detail: text(target?.detail, "Inspect this exact region in the clean full-frame capture."),
      source: "semantic",
      sourceEvidenceIds: uniqueStrings(target?.sourceEvidenceIds),
      affectedIds: uniqueStrings(target?.affectedIds),
      bounds,
      metrics: target?.metrics && typeof target.metrics === "object" && !Array.isArray(target.metrics) ? target.metrics : {},
    };
  }).filter(Boolean).sort((first, second) => SEVERITY_ORDER[first.severity] - SEVERITY_ORDER[second.severity]
    || first.bounds.y - second.bounds.y
    || first.bounds.x - second.bounds.x
    || first.kind.localeCompare(second.kind)
    || first.label.localeCompare(second.label)).slice(0, maximumTargets);
}

/**
 * @typedef {{ width: number, height: number, pixels?: Uint8Array | Uint8ClampedArray, data?: Uint8Array | Uint8ClampedArray }} VisualPixelFrame
 */

/**
 * @param {{ captureId?: unknown, sourceDigest?: unknown, frame?: VisualPixelFrame, baselineFrame?: VisualPixelFrame | null, baselineSha256?: unknown, semanticTargets?: any[], options?: Record<string, unknown> }} [input]
 */
export function analyzeVisualPerception({ captureId, sourceDigest, frame, baselineFrame = null, baselineSha256 = null, semanticTargets = [], options = {} } = {}) {
  const current = validateFrame(frame, "frame");
  const maximumSemanticTargets = Math.max(1, Math.min(128, Math.trunc(Number(options.maximumSemanticTargets ?? 32))));
  const semantics = semanticAnnotations(semanticTargets, current, maximumSemanticTargets);
  let comparison = null;
  let changes = [];
  if (baselineFrame) {
    const baseline = validateFrame(baselineFrame, "baselineFrame");
    if (baseline.width === current.width && baseline.height === current.height) {
      comparison = { status: "compared", sha256: baselineSha256 ? String(baselineSha256) : null, width: baseline.width, height: baseline.height };
      const result = changedComponents(current, baseline, options);
      comparison = { ...comparison, metrics: {
        pixelThreshold: result.pixelThreshold,
        cellSize: result.cellSize,
        changedPixelCount: result.changedPixelCount,
        changedPixelRatio: result.changedPixelRatio,
        changedCellCount: result.changedCellCount,
        truncatedRegionCount: result.truncatedRegionCount,
      } };
      changes = result.components.map((component, index) => ({
        kind: "changed-region",
        severity: "info",
        label: `Changed region ${index + 1}`,
        detail: `${(component.changedPixelRatio * 100).toFixed(1)}% of pixels changed inside this bounded region. This is evidence of change, not an automatic defect claim.`,
        source: "pixel-diff",
        sourceEvidenceIds: [],
        affectedIds: [],
        bounds: component.bounds,
        metrics: {
          changedPixelCount: component.changedPixelCount,
          changedPixelRatio: component.changedPixelRatio,
          changedCellCount: component.changedCellCount,
        },
      }));
    } else {
      comparison = { status: "dimension-mismatch", sha256: baselineSha256 ? String(baselineSha256) : null, width: baseline.width, height: baseline.height };
    }
  }

  const annotations = [...semantics, ...changes].map((annotation, index) => ({
    ...annotation,
    id: `${text(captureId, "capture")}:annotation:${index + 1}:${slug(annotation.kind)}`,
    number: index + 1,
  }));
  return {
    schemaVersion: LOOPLAB_VISUAL_PERCEPTION_SCHEMA_VERSION,
    captureId: text(captureId, "capture"),
    sourceDigest: text(sourceDigest, "unknown"),
    frame: { width: current.width, height: current.height },
    comparison,
    annotationCount: annotations.length,
    annotations,
    policy: {
      advisoryOnly: true,
      semanticGeometryPreferred: true,
      pixelDiffClaim: "changed-region-only",
      imageBytesEphemeral: true,
    },
  };
}
