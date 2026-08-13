import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CC0_ASSET_PACKS } from "./looplab-cc0-assets.mjs";
import { analyzeEmbeddedAudioBytes } from "./looplab-audio-resources.mjs";

function ensureWithin(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Asset-library path escaped its allowed root.");
  }
  return resolved;
}

function libraryPaths(root = process.cwd()) {
  const publicRoot = path.resolve(root, "public");
  return {
    publicRoot,
    manifest: path.join(publicRoot, "asset-packs", "manifest.json"),
    indexes: path.join(publicRoot, "asset-packs", "index"),
    installed: path.join(publicRoot, "asset-packs", "installed"),
  };
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function readAssetPackManifest(options = {}) {
  return readJson(libraryPaths(options.root).manifest);
}

export async function readAssetPackIndex(packId, options = {}) {
  if (!CC0_ASSET_PACKS.some((pack) => pack.id === packId)) throw new Error(`Unknown asset pack: ${packId}`);
  const paths = libraryPaths(options.root);
  const indexPath = ensureWithin(paths.indexes, path.join(paths.indexes, `${packId}.json`));
  return readJson(indexPath);
}

export async function listInstalledAssetPacks(options = {}) {
  const manifest = await readAssetPackManifest(options);
  const category = typeof options.category === "string" ? options.category : null;
  const query = String(options.query ?? "").trim().toLowerCase();
  const packs = manifest.packs.filter((pack) =>
    (!category || pack.categories.includes(category)) &&
    (!query || `${pack.title} ${pack.author} ${pack.description} ${pack.categories.join(" ")}`.toLowerCase().includes(query)),
  );
  return { ...manifest, packCount: packs.length, installedAssetCount: packs.reduce((sum, pack) => sum + pack.installedAssetCount, 0), packs };
}

export async function listInstalledPackAssets(packId, options = {}) {
  const index = await readAssetPackIndex(packId, options);
  const query = String(options.query ?? "").trim().toLowerCase();
  const kind = typeof options.kind === "string" && options.kind !== "all" ? options.kind : null;
  const archiveId = typeof options.archiveId === "string" ? options.archiveId : null;
  const matching = index.assets.filter((asset) =>
    (!kind || asset.kind === kind) &&
    (!archiveId || asset.archiveId === archiveId) &&
    (!query || `${asset.name} ${asset.path} ${asset.directory} ${asset.kind}`.toLowerCase().includes(query)),
  );
  const limit = Math.max(1, Math.min(500, Number(options.limit ?? 120)));
  const offset = Math.max(0, Number(options.offset ?? 0));
  return { pack: index.pack, total: matching.length, offset, limit, assets: matching.slice(offset, offset + limit), archiveOnly: options.includeArchiveOnly ? index.archiveOnly.slice(0, 500) : undefined };
}

function sourceReference(index, asset) {
  return {
    packId: index.pack.id,
    assetId: asset.id,
    archiveId: asset.archiveId,
    path: asset.path,
    sourceUrl: index.pack.sourceUrl,
    license: "CC0-1.0",
    licenseUrl: index.pack.licenseUrl,
    verifiedAt: index.pack.verifiedAt,
  };
}

export async function loadInstalledPackAssets(packId, assetIds, options = {}) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) throw new Error("A non-empty asset id array is required.");
  if (assetIds.length > 50) throw new Error("Import at most 50 pack files per pass.");
  const index = await readAssetPackIndex(packId, options);
  const paths = libraryPaths(options.root);
  const records = assetIds.map((id) => index.assets.find((asset) => asset.id === id));
  if (records.some((asset) => !asset?.selectable)) throw new Error("One or more pack assets are missing or archive-only.");
  const assets = [];
  const resources = [];

  for (const record of records) {
    const file = ensureWithin(paths.installed, path.join(paths.installed, packId, record.archiveId, ...record.path.split("/")));
    const bytes = await readFile(file);
    const dataUrl = `data:${record.mimeType};base64,${bytes.toString("base64")}`;
    const source = sourceReference(index, record);
    if (record.kind !== "image") {
      const analysis = record.kind === "audio"
        ? analyzeEmbeddedAudioBytes(bytes, record.mimeType)
        : null;
      resources.push({
        id: `resource-${randomUUID()}`,
        name: record.name,
        kind: record.kind === "source" ? "document" : record.kind,
        mimeType: record.mimeType,
        dataUrl,
        bytes: record.bytes,
        ...(analysis ? { analysis } : {}),
        source,
      });
      continue;
    }

    const tileLike = index.pack.categories.some((category) => ["tileset", "textures"].includes(category));
    const role = index.pack.categories.includes("characters")
      ? "hero"
      : index.pack.categories.some((category) => ["icons", "user-interface"].includes(category))
        ? "ui"
        : index.pack.categories.includes("backgrounds")
          ? "effect"
          : "prop";
    const width = record.width ?? 1;
    const height = record.height ?? 1;
    const usesGroundAnchor = !["ui", "effect"].includes(role);
    const frameWidth = options.frameWidth == null ? width : Math.floor(Number(options.frameWidth));
    const frameHeight = options.frameHeight == null ? height : Math.floor(Number(options.frameHeight));
    if (frameWidth < 1 || frameHeight < 1 || width % frameWidth !== 0 || height % frameHeight !== 0) {
      throw new Error(`${record.name} cannot be sliced into exact ${frameWidth}×${frameHeight} frames.`);
    }
    const columns = width / frameWidth;
    const availableFrames = columns * (height / frameHeight);
    const frames = options.frames == null ? availableFrames : Math.max(1, Math.min(availableFrames, Math.floor(Number(options.frames))));
    const sliced = options.frameWidth != null || options.frameHeight != null;
    assets.push({
      id: `pack-${randomUUID()}`,
      name: record.name.replace(/\.[^.]+$/, ""),
      type: tileLike ? "tileset" : "sprite",
      dataUrl,
      width,
      height,
      frameWidth,
      frameHeight,
      frames,
      columns,
      anchorX: 0.5,
      anchorY: usesGroundAnchor ? 1 : 0.5,
      collisionPolicy: "authored-only",
      anchorMode: usesGroundAnchor ? "ground" : "center",
      invariants: { sourcePack: index.pack.id, paletteSourcePreserved: true, groundAnchor: usesGroundAnchor, authoredCollisionOnly: true, ...(sliced ? { frameCount: frames, sharedScale: true } : {}) },
      analysis: { decodedMemoryBytes: width * height * 4, sourceSha256: record.sha256, failedInvariants: [], ...(sliced ? { spriteSheetSliced: true } : {}) },
      generator: { kind: role, imported: true, packId: index.pack.id, archiveId: record.archiveId },
      source,
    });
  }

  return { index, records, assets, resources };
}
