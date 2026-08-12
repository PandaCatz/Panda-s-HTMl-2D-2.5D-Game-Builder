const finitePositive = (value, fallback = 1) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const rounded = (value, minimum = 0) => Math.max(minimum, Math.round(value));

/**
 * @param {{ kind?: string, width?: number, height?: number, role?: string, z?: number, collisionHeight?: number }} [placement]
 */
export function authoredColliderForPlacement({ kind, width, height, role, z = 0, collisionHeight = 1 } = {}) {
  const objectWidth = finitePositive(width);
  const objectHeight = finitePositive(height);
  const zMin = Number.isFinite(Number(z)) ? Number(z) : 0;
  const zMax = zMin + finitePositive(collisionHeight);
  const collider = {
    enabled: false,
    offsetX: 0,
    offsetY: 0,
    width: rounded(objectWidth, 1),
    height: rounded(objectHeight, 1),
    trigger: false,
    oneWay: false,
    zMin,
    zMax,
  };

  if (kind === "player") {
    const inset = Math.max(2, rounded(objectWidth * 0.14));
    return { ...collider, enabled: true, offsetX: inset, offsetY: 3, width: rounded(objectWidth - inset * 2, 1), height: rounded(objectHeight - 3, 1) };
  }
  if (kind === "platform") return { ...collider, enabled: true, oneWay: true };
  if (kind === "coin") return { ...collider, enabled: true, offsetX: 2, offsetY: 2, width: rounded(objectWidth - 4, 1), height: rounded(objectHeight - 4, 1), trigger: true };
  if (kind === "hazard") return { ...collider, enabled: true, trigger: true };
  if (kind === "portal" || kind === "goal") return { ...collider, enabled: true, offsetX: 4, offsetY: 4, width: rounded(objectWidth - 8, 1), height: rounded(objectHeight - 4, 1), trigger: true };
  if (kind === "decor" && role === "prop") {
    const inset = rounded(objectWidth * 0.15);
    const footprintHeight = Math.max(4, rounded(objectHeight * 0.32, 1));
    return {
      ...collider,
      enabled: true,
      offsetX: inset,
      offsetY: rounded(objectHeight - footprintHeight),
      width: rounded(objectWidth - inset * 2, 1),
      height: footprintHeight,
    };
  }
  return collider;
}

export function visualBoundsForAsset(asset, width, height) {
  const source = asset?.opaqueBounds ?? asset?.visualBounds ?? asset?.colliderBounds ?? { x: 0, y: 0, width: asset?.frameWidth ?? width, height: asset?.frameHeight ?? height };
  const frameWidth = finitePositive(asset?.frameWidth, finitePositive(width));
  const frameHeight = finitePositive(asset?.frameHeight, finitePositive(height));
  const scaleX = finitePositive(width) / frameWidth;
  const scaleY = finitePositive(height) / frameHeight;
  return {
    offsetX: rounded(Number(source.x ?? source.offsetX ?? 0) * scaleX),
    offsetY: rounded(Number(source.y ?? source.offsetY ?? 0) * scaleY),
    width: rounded(finitePositive(source.width, frameWidth) * scaleX, 1),
    height: rounded(finitePositive(source.height, frameHeight) * scaleY, 1),
  };
}
