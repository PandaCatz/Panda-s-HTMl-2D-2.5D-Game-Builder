const TILE_THEMES = {
  meadow: {
    names: ["Grass", "Soil", "Stone", "Water", "Sand", "Brick"],
    colors: ["#69b957", "#3d7c44", "#b8e986", "#8a5838", "#5b3828", "#bb8261", "#7d8583", "#aeb6b0", "#4f5a58", "#4f9bd8", "#78c9ee", "#dff5ff", "#e7c96b", "#fff0a4", "#a95d48", "#d98762"],
  },
  dungeon: {
    names: ["Moss", "Earth", "Slate", "Lava", "Bone", "Masonry"],
    colors: ["#557a46", "#304a37", "#8aa060", "#4b352d", "#2a2222", "#725348", "#454b57", "#707989", "#292d36", "#c9462f", "#ff7b39", "#ffd15c", "#c7b894", "#eee1bd", "#563b49", "#87566a"],
  },
  desert: {
    names: ["Scrub", "Dune", "Rock", "Oasis", "Clay", "Ruins"],
    colors: ["#9eaa55", "#6e7c3f", "#d7c46d", "#c89455", "#8b5f3d", "#e1b56c", "#8a6b58", "#b08a68", "#5f493f", "#258ca0", "#51c8c3", "#b8f1d5", "#bf774c", "#edaa68", "#9b5f42", "#c97b4f"],
  },
  neon: {
    names: ["Circuit", "Void", "Alloy", "Plasma", "Glow", "Grid"],
    colors: ["#4d4eff", "#282a83", "#b8b8ff", "#19172c", "#090813", "#373353", "#62687f", "#9ca5bd", "#303443", "#d92f9a", "#ff56c6", "#ffd4ef", "#b9ff43", "#edff9b", "#3242a8", "#586aff"],
  },
};

const SPRITE_PALETTES = {
  violet: ["#24241e", "#5b5cf0", "#8f90ff", "#f4d2b8", "#ffffff", "#c8ff4d"],
  ember: ["#2a1d1b", "#e44f32", "#ff8b3d", "#f3c49a", "#fff2d1", "#ffd12f"],
  forest: ["#1b2c27", "#347d5a", "#64bd76", "#d9ad80", "#f6e3bd", "#a8e252"],
  mono: ["#141414", "#4b4b4b", "#878787", "#bdbdbd", "#ffffff", "#d7ff45"],
};

export const TILE_THEME_NAMES = Object.keys(TILE_THEMES);
export const SPRITE_KIND_NAMES = ["hero", "enemy", "pickup", "prop", "effect", "ui"];
export const SPRITE_PALETTE_NAMES = Object.keys(SPRITE_PALETTES);

function hashSeed(seed) {
  let hash = 2166136261;
  for (const character of String(seed)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function colorToRgba(color, alpha = 255) {
  const value = color.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    alpha,
  ];
}

function surface(width, height) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const fillRect = (x, y, rectangleWidth, rectangleHeight, color) => {
    const rgba = colorToRgba(color);
    const left = Math.max(0, Math.floor(x));
    const top = Math.max(0, Math.floor(y));
    const right = Math.min(width, Math.ceil(x + rectangleWidth));
    const bottom = Math.min(height, Math.ceil(y + rectangleHeight));
    for (let pixelY = top; pixelY < bottom; pixelY += 1) {
      for (let pixelX = left; pixelX < right; pixelX += 1) {
        const offset = (pixelY * width + pixelX) * 4;
        pixels[offset] = rgba[0];
        pixels[offset + 1] = rgba[1];
        pixels[offset + 2] = rgba[2];
        pixels[offset + 3] = rgba[3];
      }
    }
  };
  return { width, height, pixels, fillRect };
}

function sharedAlphaBounds(pixels, sheetWidth, frameWidth, frameHeight, frames, columns) {
  let minimumX = frameWidth;
  let minimumY = frameHeight;
  let maximumX = -1;
  let maximumY = -1;
  for (let frame = 0; frame < frames; frame += 1) {
    const frameColumn = frame % columns;
    const frameRow = Math.floor(frame / columns);
    for (let y = 0; y < frameHeight; y += 1) {
      for (let x = 0; x < frameWidth; x += 1) {
        const sheetX = frameColumn * frameWidth + x;
        const sheetY = frameRow * frameHeight + y;
        if (pixels[(sheetY * sheetWidth + sheetX) * 4 + 3] === 0) continue;
        minimumX = Math.min(minimumX, x);
        minimumY = Math.min(minimumY, y);
        maximumX = Math.max(maximumX, x);
        maximumY = Math.max(maximumY, y);
      }
    }
  }
  if (maximumX < minimumX || maximumY < minimumY) return { x: 0, y: 0, width: frameWidth, height: frameHeight };
  return { x: minimumX, y: minimumY, width: maximumX - minimumX + 1, height: maximumY - minimumY + 1 };
}

function sealTileEdges(target, tileX, tileY, tileSize) {
  const copyPixel = (sourceX, sourceY, targetX, targetY) => {
    const sourceOffset = (sourceY * target.width + sourceX) * 4;
    const targetOffset = (targetY * target.width + targetX) * 4;
    target.pixels[targetOffset] = target.pixels[sourceOffset];
    target.pixels[targetOffset + 1] = target.pixels[sourceOffset + 1];
    target.pixels[targetOffset + 2] = target.pixels[sourceOffset + 2];
    target.pixels[targetOffset + 3] = target.pixels[sourceOffset + 3];
  };
  for (let offset = 0; offset < tileSize; offset += 1) {
    copyPixel(tileX, tileY + offset, tileX + tileSize - 1, tileY + offset);
    copyPixel(tileX + offset, tileY, tileX + offset, tileY + tileSize - 1);
  }
}

function gridRect(target, tileX, tileY, unit, x, y, width, height, color) {
  target.fillRect(tileX + x * unit, tileY + y * unit, width * unit, height * unit, color);
}

function noisePixels(target, tileX, tileY, tileSize, random, color, count, sizes = [1, 2]) {
  const unit = tileSize / 16;
  for (let index = 0; index < count; index += 1) {
    const size = sizes[Math.floor(random() * sizes.length)];
    gridRect(target, tileX, tileY, unit, Math.floor(random() * (16 - size)), Math.floor(random() * (16 - size)), size, size, color);
  }
}

export function generateTilesetPixels({ theme = "meadow", tileSize = 32, seed = "looplab" } = {}) {
  if (!TILE_THEMES[theme]) throw new Error(`Unknown tile theme: ${theme}. Choose one of: ${TILE_THEME_NAMES.join(", ")}.`);
  if (![16, 32, 48, 64].includes(Number(tileSize))) throw new Error("tileSize must be 16, 32, 48, or 64.");
  tileSize = Number(tileSize);
  const random = mulberry32(hashSeed(`${seed}:${theme}:${tileSize}`));
  const target = surface(tileSize * 3, tileSize * 2);
  const palette = TILE_THEMES[theme].colors;
  const positions = Array.from({ length: 6 }, (_, index) => ({ x: (index % 3) * tileSize, y: Math.floor(index / 3) * tileSize }));
  const unit = tileSize / 16;

  // Ground / vegetation.
  target.fillRect(positions[0].x, positions[0].y, tileSize, tileSize, palette[0]);
  noisePixels(target, positions[0].x, positions[0].y, tileSize, random, palette[1], 24);
  for (let x = 0; x < 16; x += 3) gridRect(target, positions[0].x, positions[0].y, unit, x, 1 + Math.floor(random() * 3), 1, 3, palette[2]);

  // Earth / dune.
  target.fillRect(positions[1].x, positions[1].y, tileSize, tileSize, palette[3]);
  noisePixels(target, positions[1].x, positions[1].y, tileSize, random, palette[4], 30);
  noisePixels(target, positions[1].x, positions[1].y, tileSize, random, palette[5], 12, [1]);

  // Stone / alloy.
  target.fillRect(positions[2].x, positions[2].y, tileSize, tileSize, palette[6]);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const offset = row % 2 ? 1 : 0;
      gridRect(target, positions[2].x, positions[2].y, unit, column * 4 + offset, row * 4, 3, 3, (row + column) % 2 ? palette[7] : palette[8]);
    }
  }

  // Water / plasma.
  target.fillRect(positions[3].x, positions[3].y, tileSize, tileSize, palette[9]);
  for (let y = 2; y < 16; y += 4) {
    const offset = Math.floor(random() * 4);
    gridRect(target, positions[3].x, positions[3].y, unit, offset, y, 7, 1, palette[10]);
    gridRect(target, positions[3].x, positions[3].y, unit, (offset + 9) % 16, y + 1, 4, 1, palette[11]);
  }

  // Sand / accent.
  target.fillRect(positions[4].x, positions[4].y, tileSize, tileSize, palette[12]);
  noisePixels(target, positions[4].x, positions[4].y, tileSize, random, palette[13], 26, [1]);
  for (let y = 3; y < 16; y += 6) gridRect(target, positions[4].x, positions[4].y, unit, Math.floor(random() * 9), y, 6, 1, palette[13]);

  // Brick / grid.
  target.fillRect(positions[5].x, positions[5].y, tileSize, tileSize, palette[14]);
  for (let row = 0; row < 4; row += 1) {
    const shift = row % 2 ? -2 : 0;
    for (let column = 0; column < 4; column += 1) {
      gridRect(target, positions[5].x, positions[5].y, unit, column * 5 + shift, row * 4, 4, 3, palette[15]);
    }
  }

  for (const position of positions) sealTileEdges(target, position.x, position.y, tileSize);

  return {
    kind: "tileset",
    theme,
    seed: String(seed),
    width: target.width,
    height: target.height,
    frameWidth: tileSize,
    frameHeight: tileSize,
    frames: 6,
    columns: 3,
    rows: 2,
    names: TILE_THEMES[theme].names,
    anchorX: 0.5,
    anchorY: 1,
    opaqueBounds: { x: 0, y: 0, width: tileSize, height: tileSize },
    seamless: true,
    pixels: target.pixels,
  };
}

function drawHero(target, frameX, unit, colors, frame) {
  const bob = frame === 1 || frame === 3 ? 1 : 0;
  gridRect(target, frameX, 0, unit, 5, 2 + bob, 6, 5, colors[3]);
  gridRect(target, frameX, 0, unit, 4, 3 + bob, 1, 4, colors[0]);
  gridRect(target, frameX, 0, unit, 11, 3 + bob, 1, 4, colors[0]);
  gridRect(target, frameX, 0, unit, 6, 4 + bob, 1, 1, colors[0]);
  gridRect(target, frameX, 0, unit, 9, 4 + bob, 1, 1, colors[0]);
  gridRect(target, frameX, 0, unit, 4, 7 + bob, 8, 6, colors[1]);
  gridRect(target, frameX, 0, unit, 5, 8 + bob, 6, 2, colors[2]);
  gridRect(target, frameX, 0, unit, 3, 8 + bob, 1, 4, colors[3]);
  gridRect(target, frameX, 0, unit, 12, 8 + bob, 1, 4, colors[3]);
  if (frame % 2 === 0) {
    gridRect(target, frameX, 0, unit, 5, 13 + bob, 2, 3 - bob, colors[0]);
    gridRect(target, frameX, 0, unit, 9, 13 + bob, 2, 3 - bob, colors[0]);
  } else {
    gridRect(target, frameX, 0, unit, 4, 13 + bob, 3, 2 - bob, colors[0]);
    gridRect(target, frameX, 0, unit, 9, 13 + bob, 3, 2 - bob, colors[0]);
  }
}

function drawEnemy(target, frameX, unit, colors, frame) {
  const squish = frame === 1 || frame === 3;
  gridRect(target, frameX, 0, unit, squish ? 3 : 4, squish ? 8 : 6, squish ? 10 : 8, squish ? 6 : 8, colors[1]);
  gridRect(target, frameX, 0, unit, squish ? 4 : 5, squish ? 7 : 5, squish ? 8 : 6, 2, colors[2]);
  gridRect(target, frameX, 0, unit, 6, squish ? 10 : 9, 1, 2, colors[4]);
  gridRect(target, frameX, 0, unit, 10, squish ? 10 : 9, 1, 2, colors[4]);
  gridRect(target, frameX, 0, unit, 6, squish ? 11 : 10, 1, 1, colors[0]);
  gridRect(target, frameX, 0, unit, 10, squish ? 11 : 10, 1, 1, colors[0]);
  gridRect(target, frameX, 0, unit, 5, 14, 2, 2, colors[0]);
  gridRect(target, frameX, 0, unit, 10, 14, 2, 2, colors[0]);
}

function drawPickup(target, frameX, unit, colors, frame) {
  const widths = [8, 5, 2, 5];
  const width = widths[frame];
  const x = 8 - Math.ceil(width / 2);
  gridRect(target, frameX, 0, unit, x, 4, width, 9, colors[5]);
  gridRect(target, frameX, 0, unit, x + 1, 5, Math.max(1, width - 2), 7, colors[4]);
  if (width > 3) gridRect(target, frameX, 0, unit, x + 2, 6, 1, 4, colors[5]);
}

function drawProp(target, frameX, unit, colors, frame) {
  const bob = frame === 1 ? 1 : 0;
  gridRect(target, frameX, 0, unit, 3, 5 + bob, 10, 10 - bob, colors[0]);
  gridRect(target, frameX, 0, unit, 4, 6 + bob, 8, 8 - bob, colors[1]);
  gridRect(target, frameX, 0, unit, 5, 7 + bob, 6, 1, colors[2]);
  gridRect(target, frameX, 0, unit, 7, 8 + bob, 2, 5 - bob, colors[5]);
  gridRect(target, frameX, 0, unit, 4, 10 + bob, 8, 1, colors[0]);
}

function drawEffect(target, frameX, unit, colors, frame) {
  const radius = [2, 4, 6, 7][frame];
  const center = 8;
  gridRect(target, frameX, 0, unit, center - radius, center - 1, radius * 2, 2, colors[5]);
  gridRect(target, frameX, 0, unit, center - 1, center - radius, 2, radius * 2, colors[5]);
  if (radius >= 4) {
    gridRect(target, frameX, 0, unit, center - radius + 1, center - radius + 1, 2, 2, colors[2]);
    gridRect(target, frameX, 0, unit, center + radius - 2, center - radius + 1, 2, 2, colors[2]);
    gridRect(target, frameX, 0, unit, center - radius + 1, center + radius - 2, 2, 2, colors[1]);
    gridRect(target, frameX, 0, unit, center + radius - 2, center + radius - 2, 2, 2, colors[1]);
  }
  gridRect(target, frameX, 0, unit, 7, 7, 2, 2, colors[4]);
}

function drawUi(target, frameX, unit, colors, frame) {
  const inset = frame % 2;
  gridRect(target, frameX, 0, unit, 2 + inset, 3 + inset, 12 - inset * 2, 10 - inset * 2, colors[0]);
  gridRect(target, frameX, 0, unit, 3 + inset, 4 + inset, 10 - inset * 2, 8 - inset * 2, colors[1]);
  gridRect(target, frameX, 0, unit, 5, 7, 6, 2, colors[4]);
  gridRect(target, frameX, 0, unit, 7, 5, 2, 6, colors[4]);
  if (frame >= 2) gridRect(target, frameX, 0, unit, 12, 2, 2, 2, colors[5]);
}

export function generateSpritePixels({ kind = "hero", palette = "violet", size = 32, seed = "looplab" } = {}) {
  if (!SPRITE_KIND_NAMES.includes(kind)) throw new Error(`Unknown sprite kind: ${kind}. Choose one of: ${SPRITE_KIND_NAMES.join(", ")}.`);
  if (!SPRITE_PALETTES[palette]) throw new Error(`Unknown sprite palette: ${palette}. Choose one of: ${SPRITE_PALETTE_NAMES.join(", ")}.`);
  if (![16, 32, 48, 64].includes(Number(size))) throw new Error("size must be 16, 32, 48, or 64.");
  size = Number(size);
  const target = surface(size * 4, size);
  const colors = [...SPRITE_PALETTES[palette]];
  const random = mulberry32(hashSeed(`${seed}:${kind}:${palette}:${size}`));
  if (random() > 0.5) [colors[1], colors[2]] = [colors[2], colors[1]];
  const unit = size / 16;
  const drawer = kind === "hero" ? drawHero : kind === "enemy" ? drawEnemy : kind === "pickup" ? drawPickup : kind === "effect" ? drawEffect : kind === "ui" ? drawUi : drawProp;
  for (let frame = 0; frame < 4; frame += 1) drawer(target, frame * size, unit, colors, frame);
  const opaqueBounds = sharedAlphaBounds(target.pixels, target.width, size, size, 4, 4);
  return {
    kind: "sprite",
    spriteKind: kind,
    palette,
    seed: String(seed),
    width: target.width,
    height: target.height,
    frameWidth: size,
    frameHeight: size,
    frames: 4,
    columns: 4,
    rows: 1,
    anchorX: 0.5,
    anchorY: kind === "effect" || kind === "ui" ? 0.5 : 1,
    opaqueBounds,
    pixels: target.pixels,
  };
}
