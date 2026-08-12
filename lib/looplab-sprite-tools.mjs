const rgbaKey = (red, green, blue, alpha = 255) => `${red},${green},${blue},${alpha}`;
const parseKey = (key) => key.split(",").map(Number);
const toHex = (value) => `#${value.slice(0, 3).map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
export const LOOPLAB_FRAME_ANALYSIS_VERSION = "looplab-frame-analysis/v1";

export function silhouetteDriftLimitForRole(role) {
  const normalizedRole = String(role ?? "").trim().toLowerCase();
  if (normalizedRole === "effect" || normalizedRole === "environment") return 0.8;
  if (normalizedRole === "ui") return 0.2;
  return 0.14;
}

export function extractPalette(pixels, maximumColors = 16) {
  const counts = new Map();
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 16) continue;
    const key = rgbaKey(pixels[index], pixels[index + 1], pixels[index + 2]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, maximumColors)
    .map(([key]) => toHex(parseKey(key)));
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)];
}

export function lockPalette(pixels, palette) {
  const colors = palette.map(hexToRgb);
  const output = new Uint8ClampedArray(pixels.length);
  let changedPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 16) continue;
    let best = colors[0] ?? [pixels[index], pixels[index + 1], pixels[index + 2]];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const color of colors) {
      const red = pixels[index] - color[0];
      const green = pixels[index + 1] - color[1];
      const blue = pixels[index + 2] - color[2];
      const distance = red * red + green * green + blue * blue;
      if (distance < bestDistance) { best = color; bestDistance = distance; }
    }
    output[index] = best[0];
    output[index + 1] = best[1];
    output[index + 2] = best[2];
    output[index + 3] = alpha;
    if (best[0] !== pixels[index] || best[1] !== pixels[index + 1] || best[2] !== pixels[index + 2]) changedPixels += 1;
  }
  return { pixels: output, changedPixels };
}

export function normalizeFrameNearest(frame, targetWidth, targetHeight) {
  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const scale = Math.min(targetWidth / frame.width, targetHeight / frame.height);
  const drawWidth = Math.max(1, Math.round(frame.width * scale));
  const drawHeight = Math.max(1, Math.round(frame.height * scale));
  const offsetX = Math.floor((targetWidth - drawWidth) / 2);
  const offsetY = targetHeight - drawHeight;
  for (let targetY = 0; targetY < drawHeight; targetY += 1) {
    const sourceY = Math.min(frame.height - 1, Math.floor(targetY / scale));
    for (let targetX = 0; targetX < drawWidth; targetX += 1) {
      const sourceX = Math.min(frame.width - 1, Math.floor(targetX / scale));
      const sourceOffset = (sourceY * frame.width + sourceX) * 4;
      const targetOffset = ((offsetY + targetY) * targetWidth + offsetX + targetX) * 4;
      output[targetOffset] = frame.pixels[sourceOffset];
      output[targetOffset + 1] = frame.pixels[sourceOffset + 1];
      output[targetOffset + 2] = frame.pixels[sourceOffset + 2];
      output[targetOffset + 3] = frame.pixels[sourceOffset + 3];
    }
  }
  return { width: targetWidth, height: targetHeight, pixels: output, anchorX: Math.floor(targetWidth / 2), anchorY: targetHeight - 1 };
}

export function opaqueBoundsForFrame(frame, alphaThreshold = 16) {
  let minimumX = frame.width;
  let minimumY = frame.height;
  let maximumX = -1;
  let maximumY = -1;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      if (frame.pixels[(y * frame.width + x) * 4 + 3] < alphaThreshold) continue;
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
    }
  }
  if (maximumX < minimumX || maximumY < minimumY) return { x: 0, y: 0, width: frame.width, height: frame.height, empty: true };
  return { x: minimumX, y: minimumY, width: maximumX - minimumX + 1, height: maximumY - minimumY + 1, empty: false };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function componentGap(first, second) {
  const firstRight = first.x + first.width - 1;
  const firstBottom = first.y + first.height - 1;
  const secondRight = second.x + second.width - 1;
  const secondBottom = second.y + second.height - 1;
  const horizontal = Math.max(0, first.x - secondRight - 1, second.x - firstRight - 1);
  const vertical = Math.max(0, first.y - secondBottom - 1, second.y - firstBottom - 1);
  return Math.hypot(horizontal, vertical);
}

function opposingEdgeMismatchRatio(frame, channelTolerance = 16) {
  const mismatched = (firstOffset, secondOffset) => (
    Math.abs(frame.pixels[firstOffset] - frame.pixels[secondOffset]) > channelTolerance
    || Math.abs(frame.pixels[firstOffset + 1] - frame.pixels[secondOffset + 1]) > channelTolerance
    || Math.abs(frame.pixels[firstOffset + 2] - frame.pixels[secondOffset + 2]) > channelTolerance
    || Math.abs(frame.pixels[firstOffset + 3] - frame.pixels[secondOffset + 3]) > channelTolerance
  );
  let mismatches = 0;
  let comparisons = 0;
  for (let y = 0; y < frame.height; y += 1) {
    comparisons += 1;
    if (mismatched((y * frame.width) * 4, (y * frame.width + frame.width - 1) * 4)) mismatches += 1;
  }
  for (let x = 0; x < frame.width; x += 1) {
    comparisons += 1;
    if (mismatched(x * 4, ((frame.height - 1) * frame.width + x) * 4)) mismatches += 1;
  }
  return comparisons ? mismatches / comparisons : 0;
}

export function analyzeFrameAlpha(frame, options = {}) {
  const width = Math.floor(Number(frame?.width));
  const height = Math.floor(Number(frame?.height));
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) throw new Error("Frame analysis requires positive integer dimensions.");
  if (!frame?.pixels || frame.pixels.length !== width * height * 4) throw new Error("Frame analysis requires one RGBA value per pixel.");
  const alphaThreshold = Math.max(1, Math.min(255, Math.floor(Number(options.alphaThreshold ?? 16))));
  const connectivity = options.connectivity === 4 ? 4 : 8;
  const anchorMode = options.anchorMode === "center" ? "center" : "ground";
  const frameKind = options.frameKind === "tile" ? "tile" : "sprite";
  const pixelCount = width * height;
  const occupiedMask = new Uint8Array(pixelCount);
  let exactAlphaPixels = 0;
  let occupiedPixels = 0;
  let partialAlphaPixels = 0;
  let lowAlphaPixels = 0;
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const alpha = frame.pixels[pixelIndex * 4 + 3];
    if (alpha > 0) exactAlphaPixels += 1;
    if (alpha > 0 && alpha < 255) partialAlphaPixels += 1;
    if (alpha > 0 && alpha < alphaThreshold) lowAlphaPixels += 1;
    if (alpha >= alphaThreshold) { occupiedMask[pixelIndex] = 1; occupiedPixels += 1; }
  }
  const bounds = opaqueBoundsForFrame(frame, alphaThreshold);
  const borderOccupied = { top: 0, right: 0, bottom: 0, left: 0 };
  let forbiddenBorderOccupiedPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      if (!occupiedMask[pixelIndex]) continue;
      if (y === 0) borderOccupied.top += 1;
      if (x === width - 1) borderOccupied.right += 1;
      if (y === height - 1) borderOccupied.bottom += 1;
      if (x === 0) borderOccupied.left += 1;
      const forbidden = frameKind === "sprite" && (y === 0 || x === 0 || x === width - 1 || (anchorMode === "center" && y === height - 1));
      if (forbidden) forbiddenBorderOccupiedPixels += 1;
    }
  }

  const visited = new Uint8Array(pixelCount);
  const components = [];
  const directions = connectivity === 4
    ? [[-1, 0], [1, 0], [0, -1], [0, 1]]
    : [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (let start = 0; start < pixelCount; start += 1) {
    if (!occupiedMask[start] || visited[start]) continue;
    const stack = [start];
    visited[start] = 1;
    let area = 0;
    let minimumX = width;
    let minimumY = height;
    let maximumX = -1;
    let maximumY = -1;
    let totalX = 0;
    let totalY = 0;
    while (stack.length) {
      const current = stack.pop();
      const x = current % width;
      const y = Math.floor(current / width);
      area += 1;
      totalX += x;
      totalY += y;
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
      for (const [offsetX, offsetY] of directions) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (!occupiedMask[next] || visited[next]) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }
    components.push({
      area,
      x: minimumX,
      y: minimumY,
      width: maximumX - minimumX + 1,
      height: maximumY - minimumY + 1,
      centroidX: totalX / area,
      centroidY: totalY / area,
      touchesBorder: minimumX === 0 || minimumY === 0 || maximumX === width - 1 || maximumY === height - 1,
    });
  }
  components.sort((first, second) => second.area - first.area || first.y - second.y || first.x - second.x);
  const dustThresholdPixels = Math.max(2, Math.ceil(occupiedPixels * Number(options.dustAreaRatio ?? 0.0025)));
  const meaningfulComponents = components.filter((component) => component.area >= dustThresholdPixels);
  const subjectAreaThreshold = Math.max(dustThresholdPixels, Math.ceil(occupiedPixels * Number(options.subjectAreaRatio ?? 0.125)));
  const subjectComponents = meaningfulComponents.filter((component) => component.area >= subjectAreaThreshold);
  if (!subjectComponents.length && meaningfulComponents.length) subjectComponents.push(meaningfulComponents[0]);
  const proximityPixels = Math.max(1, Math.round(Number(options.subjectProximityPixels ?? Math.min(width, height) * 0.08)));
  const parents = subjectComponents.map((_, index) => index);
  const find = (index) => { let current = index; while (parents[current] !== current) current = parents[current]; return current; };
  const join = (first, second) => { const firstRoot = find(first); const secondRoot = find(second); if (firstRoot !== secondRoot) parents[secondRoot] = firstRoot; };
  for (let first = 0; first < subjectComponents.length; first += 1) {
    for (let second = first + 1; second < subjectComponents.length; second += 1) {
      if (componentGap(subjectComponents[first], subjectComponents[second]) <= proximityPixels) join(first, second);
    }
  }
  const subjectGroups = new Map();
  subjectComponents.forEach((component, index) => {
    const root = find(index);
    subjectGroups.set(root, (subjectGroups.get(root) ?? 0) + component.area);
  });
  const subjectAreas = [...subjectGroups.values()].sort((first, second) => second - first);
  const subjectClusterCount = bounds.empty ? 0 : Math.max(1, subjectAreas.length);
  const distantSecondaryComponentRatio = occupiedPixels ? subjectAreas.slice(1).reduce((total, area) => total + area, 0) / occupiedPixels : 0;

  let contactCenterX = null;
  if (!bounds.empty) {
    const bottom = bounds.y + bounds.height - 1;
    let contactTotal = 0;
    let contactCount = 0;
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      if (!occupiedMask[bottom * width + x]) continue;
      contactTotal += x;
      contactCount += 1;
    }
    contactCenterX = contactCount ? contactTotal / contactCount : bounds.x + (bounds.width - 1) / 2;
  }

  let matteResiduePixels = 0;
  const matte = typeof options.matteColor === "string" && /^#[0-9a-f]{6}$/i.test(options.matteColor) ? hexToRgb(options.matteColor) : null;
  if (matte) {
    const matteToleranceSquared = Number(options.matteTolerance ?? 24) ** 2;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = y * width + x;
        const offset = pixelIndex * 4;
        const alpha = frame.pixels[offset + 3];
        if (alpha < alphaThreshold || alpha >= 250) continue;
        const red = frame.pixels[offset] - matte[0];
        const green = frame.pixels[offset + 1] - matte[1];
        const blue = frame.pixels[offset + 2] - matte[2];
        if (red * red + green * green + blue * blue > matteToleranceSquared) continue;
        let besideTransparency = false;
        for (const [offsetX, offsetY] of directions) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) { besideTransparency = true; break; }
          if (frame.pixels[(nextY * width + nextX) * 4 + 3] < alphaThreshold) { besideTransparency = true; break; }
        }
        if (besideTransparency) matteResiduePixels += 1;
      }
    }
  }

  return {
    measured: true,
    measurementVersion: LOOPLAB_FRAME_ANALYSIS_VERSION,
    width,
    height,
    alphaThreshold,
    connectivity,
    empty: bounds.empty,
    bounds,
    exactAlphaPixels,
    occupiedPixels,
    transparentPixels: pixelCount - exactAlphaPixels,
    transparentPixelRatio: (pixelCount - exactAlphaPixels) / pixelCount,
    partialAlphaPixels,
    partialAlphaRatio: exactAlphaPixels ? partialAlphaPixels / exactAlphaPixels : 0,
    lowAlphaPixels,
    lowAlphaRatio: exactAlphaPixels ? lowAlphaPixels / exactAlphaPixels : 0,
    baselineY: bounds.empty ? null : bounds.y + bounds.height - 1,
    contactCenterX,
    borderOccupied,
    forbiddenBorderOccupiedPixels,
    edgeLeakageRatio: occupiedPixels ? forbiddenBorderOccupiedPixels / occupiedPixels : 0,
    components,
    meaningfulComponentCount: meaningfulComponents.length,
    subjectClusterCount,
    dominantComponentRatio: occupiedPixels && components.length ? components[0].area / occupiedPixels : 0,
    distantSecondaryComponentRatio,
    dustPixels: components.filter((component) => component.area < dustThresholdPixels).reduce((total, component) => total + component.area, 0),
    matteResiduePixels,
    matteResidueRatio: occupiedPixels ? matteResiduePixels / occupiedPixels : 0,
    opposingEdgeMismatchRatio: frameKind === "tile" ? opposingEdgeMismatchRatio(frame) : null,
  };
}

export function analyzeSpriteFrames(frames, options = {}) {
  if (!Array.isArray(frames) || !frames.length) throw new Error("At least one frame is required for measured analysis.");
  const frameKind = options.frameKind === "tile" ? "tile" : "sprite";
  const anchorMode = options.anchorMode === "center" ? "center" : "ground";
  const frameAnalyses = frames.map((frame) => analyzeFrameAlpha(frame, { ...options, frameKind, anchorMode }));
  const occupied = frameAnalyses.filter((frame) => !frame.empty);
  const scaleValues = occupied.map((frame) => Math.max(frame.bounds.width / frame.width, frame.bounds.height / frame.height));
  const medianScale = median(scaleValues);
  const silhouetteDrift = medianScale ? Math.max(0, ...scaleValues.map((value) => Math.abs(value / medianScale - 1))) : 0;
  const proportions = occupied.map((frame) => frame.bounds.width / Math.max(1, frame.bounds.height));
  const medianProportion = median(proportions);
  const proportionDrift = medianProportion ? Math.max(0, ...proportions.map((value) => Math.abs(value / medianProportion - 1))) : 0;
  const normalizedAnchors = occupied.map((frame) => anchorMode === "center"
    ? (frame.bounds.y + (frame.bounds.height - 1) / 2) / frame.height
    : frame.baselineY / frame.height);
  const anchorVariance = normalizedAnchors.length ? (Math.max(...normalizedAnchors) - Math.min(...normalizedAnchors)) * median(occupied.map((frame) => frame.height)) : 0;
  const normalizedContacts = occupied.filter((frame) => frame.contactCenterX !== null).map((frame) => anchorMode === "center"
    ? (frame.bounds.x + (frame.bounds.width - 1) / 2) / frame.width
    : frame.contactCenterX / frame.width);
  const contactVariance = normalizedContacts.length ? (Math.max(...normalizedContacts) - Math.min(...normalizedContacts)) * median(occupied.map((frame) => frame.width)) : 0;
  const emptyFrameCount = frameAnalyses.filter((frame) => frame.empty).length;
  const characterCountMax = Math.max(0, ...frameAnalyses.map((frame) => frame.subjectClusterCount));
  const haloPixelRatio = Math.max(0, ...frameAnalyses.map((frame) => frame.matteResidueRatio));
  const edgeLeakageRatio = Math.max(0, ...frameAnalyses.map((frame) => frame.edgeLeakageRatio));
  const tileEdgeMismatchRatio = frameKind === "tile" ? Math.max(0, ...frameAnalyses.map((frame) => frame.opposingEdgeMismatchRatio ?? 0)) : null;
  const failedInvariants = [];
  if (emptyFrameCount) failedInvariants.push("empty-frame");
  if (frameKind === "sprite" && options.requireTransparency !== false && frameAnalyses.some((frame) => frame.transparentPixels === 0)) failedInvariants.push("missing-transparent-border");
  if (frameKind === "sprite" && options.enforceBorder !== false && frameAnalyses.some((frame) => frame.forbiddenBorderOccupiedPixels > 0)) failedInvariants.push("sprite-border-leakage");
  if (characterCountMax > 1) failedInvariants.push("multiple-distant-subjects");
  if (haloPixelRatio > Number(options.maxHaloPixelRatio ?? 0.01)) failedInvariants.push("alpha-halo-review");
  return {
    measured: true,
    measurementVersion: LOOPLAB_FRAME_ANALYSIS_VERSION,
    frameKind,
    anchorMode,
    frameCount: frames.length,
    frameAnalyses,
    silhouetteDrift,
    proportionDrift,
    anchorVariance,
    contactVariance,
    emptyFrameCount,
    characterCountMax,
    haloPixelRatio,
    edgeLeakageRatio,
    tileEdgeMismatchRatio,
    failedInvariants,
    thresholds: {
      alpha: frameAnalyses[0].alphaThreshold,
      connectivity: frameAnalyses[0].connectivity,
      dustAreaRatio: Number(options.dustAreaRatio ?? 0.0025),
      subjectAreaRatio: Number(options.subjectAreaRatio ?? 0.125),
      maxHaloPixelRatio: Number(options.maxHaloPixelRatio ?? 0.01),
    },
  };
}

export function sliceAtlasFrames(atlas) {
  const width = Math.floor(Number(atlas?.width));
  const height = Math.floor(Number(atlas?.height));
  const frameWidth = Math.floor(Number(atlas?.frameWidth));
  const frameHeight = Math.floor(Number(atlas?.frameHeight));
  const frameCount = Math.floor(Number(atlas?.frames));
  const columns = Math.max(1, Math.floor(Number(atlas?.columns)));
  if (![width, height, frameWidth, frameHeight, frameCount, columns].every((value) => Number.isInteger(value) && value > 0)) throw new Error("Atlas slicing requires positive integer dimensions, frame count, and columns.");
  if (!atlas?.pixels || atlas.pixels.length !== width * height * 4) throw new Error("Atlas slicing requires one RGBA value per atlas pixel.");
  const frames = [];
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const pixels = new Uint8ClampedArray(frameWidth * frameHeight * 4);
    const originX = (frameIndex % columns) * frameWidth;
    const originY = Math.floor(frameIndex / columns) * frameHeight;
    if (originX + frameWidth > width || originY + frameHeight > height) throw new Error(`Atlas frame ${frameIndex} exceeds the atlas bounds.`);
    for (let y = 0; y < frameHeight; y += 1) {
      const sourceStart = ((originY + y) * width + originX) * 4;
      pixels.set(atlas.pixels.subarray(sourceStart, sourceStart + frameWidth * 4), y * frameWidth * 4);
    }
    frames.push({ width: frameWidth, height: frameHeight, pixels });
  }
  return frames;
}

export function normalizeFramesSharedScale(frames, targetWidth, targetHeight, { anchorMode = "ground", padding = 0 } = {}) {
  if (!frames.length) throw new Error("At least one frame is required.");
  const bounds = frames.map((frame) => opaqueBoundsForFrame(frame));
  const maximumWidth = Math.max(1, ...bounds.map((value) => value.width));
  const maximumHeight = Math.max(1, ...bounds.map((value) => value.height));
  const safePadding = Math.max(0, Math.floor(Number(padding) || 0));
  const usableWidth = Math.max(1, targetWidth - safePadding * 2);
  const usableHeight = Math.max(1, targetHeight - safePadding * (anchorMode === "center" ? 2 : 1));
  const scale = Math.min(usableWidth / maximumWidth, usableHeight / maximumHeight);
  const normalized = frames.map((frame, frameIndex) => {
    const sourceBounds = bounds[frameIndex];
    const drawWidth = Math.max(1, Math.round(sourceBounds.width * scale));
    const drawHeight = Math.max(1, Math.round(sourceBounds.height * scale));
    const offsetX = safePadding + Math.floor((usableWidth - drawWidth) / 2);
    const offsetY = anchorMode === "center" ? safePadding + Math.floor((usableHeight - drawHeight) / 2) : targetHeight - drawHeight;
    const pixels = new Uint8ClampedArray(targetWidth * targetHeight * 4);
    for (let targetY = 0; targetY < drawHeight; targetY += 1) {
      const sourceY = sourceBounds.y + Math.min(sourceBounds.height - 1, Math.floor(targetY / scale));
      for (let targetX = 0; targetX < drawWidth; targetX += 1) {
        const sourceX = sourceBounds.x + Math.min(sourceBounds.width - 1, Math.floor(targetX / scale));
        const sourceOffset = (sourceY * frame.width + sourceX) * 4;
        const targetOffset = ((offsetY + targetY) * targetWidth + offsetX + targetX) * 4;
        pixels[targetOffset] = frame.pixels[sourceOffset];
        pixels[targetOffset + 1] = frame.pixels[sourceOffset + 1];
        pixels[targetOffset + 2] = frame.pixels[sourceOffset + 2];
        pixels[targetOffset + 3] = frame.pixels[sourceOffset + 3];
      }
    }
    return { width: targetWidth, height: targetHeight, pixels };
  });
  return { frames: normalized, sourceBounds: bounds, sharedScale: scale, maximumSourceWidth: maximumWidth, maximumSourceHeight: maximumHeight, padding: safePadding };
}

function extractSharedPalette(frames, maximumColors) {
  const counts = new Map();
  for (const frame of frames) {
    for (let index = 0; index < frame.pixels.length; index += 4) {
      if (frame.pixels[index + 3] < 16) continue;
      const key = rgbaKey(frame.pixels[index], frame.pixels[index + 1], frame.pixels[index + 2]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((first, second) => second[1] - first[1]).slice(0, maximumColors).map(([key]) => toHex(parseKey(key)));
}

export function packSpriteAtlas(frames, options = {}) {
  if (!frames.length) throw new Error("At least one frame is required.");
  const frameWidth = options.frameWidth ?? Math.max(...frames.map((frame) => frame.width));
  const frameHeight = options.frameHeight ?? Math.max(...frames.map((frame) => frame.height));
  const columns = Math.max(1, Math.min(options.columns ?? frames.length, frames.length));
  const rows = Math.ceil(frames.length / columns);
  const frameKind = options.frameKind === "tile" ? "tile" : "sprite";
  const anchorMode = options.anchorMode ?? "ground";
  const padding = options.padding ?? (frameKind === "sprite" ? 1 : 0);
  const palette = options.palette?.length ? options.palette : extractSharedPalette(frames, options.maximumColors ?? 16);
  const width = columns * frameWidth;
  const height = rows * frameHeight;
  const pixels = new Uint8ClampedArray(width * height * 4);
  let changedPixels = 0;
  const framePalettes = [];
  const sourceAnalysis = analyzeSpriteFrames(frames, { ...options, frameKind, anchorMode, enforceBorder: false });
  const normalizedSet = normalizeFramesSharedScale(frames, frameWidth, frameHeight, { anchorMode, padding });
  const lockedFrames = [];
  frames.forEach((sourceFrame, frameIndex) => {
    framePalettes.push(extractPalette(sourceFrame.pixels, options.maximumColors ?? 16));
    const normalized = normalizedSet.frames[frameIndex];
    const locked = lockPalette(normalized.pixels, palette);
    lockedFrames.push({ width: frameWidth, height: frameHeight, pixels: locked.pixels });
    changedPixels += locked.changedPixels;
    const originX = (frameIndex % columns) * frameWidth;
    const originY = Math.floor(frameIndex / columns) * frameHeight;
    for (let y = 0; y < frameHeight; y += 1) {
      for (let x = 0; x < frameWidth; x += 1) {
        const sourceOffset = (y * frameWidth + x) * 4;
        const targetOffset = ((originY + y) * width + originX + x) * 4;
        pixels[targetOffset] = locked.pixels[sourceOffset];
        pixels[targetOffset + 1] = locked.pixels[sourceOffset + 1];
        pixels[targetOffset + 2] = locked.pixels[sourceOffset + 2];
        pixels[targetOffset + 3] = locked.pixels[sourceOffset + 3];
      }
    }
  });
  const paletteSets = framePalettes.map((framePalette) => new Set(framePalette));
  const reference = new Set(framePalettes[0] ?? []);
  const maximumPaletteDrift = paletteSets.reduce((maximum, current) => {
    const unexpected = [...current].filter((color) => !reference.has(color)).length;
    return Math.max(maximum, unexpected / Math.max(1, current.size));
  }, 0);
  const packedAnalysis = analyzeSpriteFrames(lockedFrames, { ...options, frameKind, anchorMode, enforceBorder: frameKind === "sprite" });
  const failedInvariants = [...new Set([...sourceAnalysis.failedInvariants, ...packedAnalysis.failedInvariants])];
  return {
    kind: "sprite",
    width,
    height,
    pixels,
    frameWidth,
    frameHeight,
    frames: frames.length,
    columns,
    rows,
    anchorX: Math.floor(frameWidth / 2),
    anchorY: frameHeight - 1,
    palette,
    analysis: {
      measured: true,
      measurementVersion: LOOPLAB_FRAME_ANALYSIS_VERSION,
      paletteDriftBeforeLock: maximumPaletteDrift,
      paletteChangedPixels: changedPixels,
      onPalette: true,
      decodedMemoryBytes: width * height * 4,
      frameDecodedMemoryBytes: frameWidth * frameHeight * 4,
      sharedScale: true,
      sharedScaleFactor: normalizedSet.sharedScale,
      normalizationPadding: normalizedSet.padding,
      sourceBoundsByFrame: normalizedSet.sourceBounds,
      sourceFrameAnalysis: sourceAnalysis,
      packedFrameAnalysis: packedAnalysis,
      silhouetteDrift: sourceAnalysis.silhouetteDrift,
      proportionDrift: sourceAnalysis.proportionDrift,
      sourceAnchorVariance: sourceAnalysis.anchorVariance,
      anchorVariance: packedAnalysis.anchorVariance,
      groundAnchorVariance: packedAnalysis.anchorVariance,
      contactVariance: packedAnalysis.contactVariance,
      characterCountMax: Math.max(sourceAnalysis.characterCountMax, packedAnalysis.characterCountMax),
      haloPixelRatio: Math.max(sourceAnalysis.haloPixelRatio, packedAnalysis.haloPixelRatio),
      edgeLeakageRatio: packedAnalysis.edgeLeakageRatio,
      tileEdgeMismatchRatio: packedAnalysis.tileEdgeMismatchRatio,
      emptyFrameCount: packedAnalysis.emptyFrameCount,
      failedInvariants,
      thresholds: packedAnalysis.thresholds,
    },
  };
}

export function decodedMemoryLedger(assets) {
  const entries = assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    encodedBytes: typeof asset.dataUrl === "string" ? Math.floor((asset.dataUrl.split(",")[1] ?? "").length * 0.75) : 0,
    decodedBytes: Number(asset.width ?? 0) * Number(asset.height ?? 0) * 4,
  }));
  return { entries, encodedBytes: entries.reduce((total, entry) => total + entry.encodedBytes, 0), decodedBytes: entries.reduce((total, entry) => total + entry.decodedBytes, 0) };
}
