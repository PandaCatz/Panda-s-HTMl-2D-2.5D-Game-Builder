#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, open, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ASSET_PACK_ARCHIVES } from "../lib/looplab-asset-pack-installation.mjs";
import { CC0_ASSET_PACKS, CC0_ASSET_POLICY } from "../lib/looplab-cc0-assets.mjs";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const ARCHIVE_ROOT = path.resolve(ROOT, "public", "asset-packs", "archives");
const INSTALLED_ROOT = path.resolve(ROOT, "public", "asset-packs", "installed");
const INDEX_ROOT = path.resolve(ROOT, "public", "asset-packs", "index");
const LIST_ROOT = path.resolve(ROOT, "work", "asset-pack-lists");
const MAX_ARCHIVE_ENTRIES = 20_000;
const MAX_INDEXED_FILE_BYTES = 1_000_000_000;

const MIME_TYPES = new Map([
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".webp", "image/webp"], [".gif", "image/gif"],
  [".mp3", "audio/mpeg"], [".ogg", "audio/ogg"], [".wav", "audio/wav"], [".flac", "audio/flac"], [".mid", "audio/midi"], [".midi", "audio/midi"],
  [".ttf", "font/ttf"], [".otf", "font/otf"], [".woff", "font/woff"], [".woff2", "font/woff2"],
  [".tmx", "application/xml"], [".tsx", "application/xml"], [".xml", "application/xml"], [".json", "application/json"], [".txt", "text/plain"], [".md", "text/markdown"],
  [".svg", "image/svg+xml"], [".ase", "application/octet-stream"], [".aseprite", "application/octet-stream"],
]);

const SAFE_ARCHIVE_EXTENSIONS = new Set([...MIME_TYPES.keys(), ".license", ".csv"]);

function ensureWithin(root, candidate, label) {
  const resolved = path.resolve(candidate);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escaped its allowed root.`);
  }
  return resolved;
}

function normalizeEntry(rawEntry) {
  if (!rawEntry || /[\0\r\n]/.test(rawEntry)) throw new Error("Archive contains an empty or control-character path.");
  const normalized = rawEntry.replaceAll("\\", "/").replace(/^\.\//, "");
  if (normalized.startsWith("/") || /^[a-z]:/i.test(normalized) || normalized.includes(":")) {
    throw new Error(`Archive contains an absolute or device path: ${rawEntry}`);
  }
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`Archive contains path traversal: ${rawEntry}`);
  }
  return segments.join("/");
}

function classify(extension) {
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension)) return "image";
  if ([".mp3", ".ogg", ".wav", ".flac", ".mid", ".midi"].includes(extension)) return "audio";
  if ([".ttf", ".otf", ".woff", ".woff2"].includes(extension)) return "font";
  if ([".tmx", ".tsx", ".xml", ".json"].includes(extension)) return "map-data";
  if ([".svg", ".ase", ".aseprite"].includes(extension)) return "source";
  return "document";
}

function publicUrl(...segments) {
  return `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

async function sha256(file) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  return hash.digest("hex");
}

async function pngDimensions(file) {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(24);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead < 24 || buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  } finally {
    await handle.close();
  }
}

async function walkFiles(root) {
  const found = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Extracted symbolic link is not allowed: ${absolute}`);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) found.push(absolute);
      else throw new Error(`Unsupported extracted filesystem entry: ${absolute}`);
    }
  }
  await visit(root);
  return found;
}

async function archiveEntries(archivePath) {
  const [{ stdout: names }, { stdout: verbose }] = await Promise.all([
    execFileAsync("tar", ["-tf", archivePath], { maxBuffer: 64 * 1024 * 1024 }),
    execFileAsync("tar", ["-tvf", archivePath], { maxBuffer: 128 * 1024 * 1024 }),
  ]);
  const rawEntries = names.split(/\r?\n/).filter(Boolean);
  const verboseRows = verbose.split(/\r?\n/).filter(Boolean);
  if (rawEntries.length > MAX_ARCHIVE_ENTRIES) throw new Error(`Archive has ${rawEntries.length} entries; limit is ${MAX_ARCHIVE_ENTRIES}.`);
  if (verboseRows.some((row) => !row.startsWith("-") && !row.startsWith("d"))) {
    throw new Error("Archive contains links or another unsupported entry type.");
  }
  return rawEntries.map((raw) => ({ raw, path: normalizeEntry(raw), directory: raw.endsWith("/") }));
}

async function installArchive(pack, archive) {
  const archivePath = ensureWithin(ARCHIVE_ROOT, path.join(ARCHIVE_ROOT, archive.file), "Archive path");
  const archiveStats = await stat(archivePath);
  if (!archiveStats.isFile() || archiveStats.size <= 0) throw new Error(`Missing archive ${archive.file}.`);
  if (archiveStats.size > MAX_INDEXED_FILE_BYTES) throw new Error(`Archive ${archive.file} exceeds the safety limit.`);
  const archiveHash = await sha256(archivePath);
  const entries = await archiveEntries(archivePath);
  const requestedExtensions = new Set(archive.includeExtensions.map((extension) => extension.toLowerCase()));
  const selected = [];
  const archiveOnly = [];

  for (const entry of entries) {
    if (entry.directory) continue;
    const extension = path.posix.extname(entry.path).toLowerCase();
    if (!SAFE_ARCHIVE_EXTENSIONS.has(extension)) {
      archiveOnly.push({ path: entry.path, reason: "unsupported-file-type", kind: "unsupported", extension });
      continue;
    }
    if (requestedExtensions.has(extension)) selected.push(entry);
    else archiveOnly.push({ path: entry.path, reason: "source-or-duplicate-format", kind: classify(extension), extension });
  }

  const target = ensureWithin(INSTALLED_ROOT, path.join(INSTALLED_ROOT, pack.id, archive.id), "Installation path");
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  if (selected.length) {
    const listFile = ensureWithin(LIST_ROOT, path.join(LIST_ROOT, `${pack.id}-${archive.id}.txt`), "Archive list path");
    await mkdir(path.dirname(listFile), { recursive: true });
    await writeFile(listFile, `${selected.map((entry) => entry.raw).join("\n")}\n`, "utf8");
    await execFileAsync("tar", ["-xf", archivePath, "-C", target, "-T", listFile], { maxBuffer: 16 * 1024 * 1024 });
  }

  const assets = [];
  for (const file of await walkFiles(target)) {
    const relative = path.relative(target, file).split(path.sep).join("/");
    const extension = path.extname(file).toLowerCase();
    const fileStats = await stat(file);
    if (fileStats.size > MAX_INDEXED_FILE_BYTES) throw new Error(`Extracted file is too large: ${relative}`);
    const dimensions = extension === ".png" ? await pngDimensions(file) : null;
    const id = createHash("sha256").update(`${pack.id}\0${archive.id}\0${relative}`).digest("hex").slice(0, 24);
    assets.push({
      id: `${pack.id}:${id}`,
      packId: pack.id,
      archiveId: archive.id,
      path: relative,
      name: path.basename(relative),
      directory: path.posix.dirname(relative) === "." ? "" : path.posix.dirname(relative),
      extension,
      kind: classify(extension),
      mimeType: MIME_TYPES.get(extension) ?? "application/octet-stream",
      bytes: fileStats.size,
      sha256: await sha256(file),
      url: publicUrl("asset-packs", "installed", pack.id, archive.id, ...relative.split("/")),
      selectable: true,
      previewable: ["image", "audio", "font"].includes(classify(extension)),
      ...(dimensions ?? {}),
    });
  }

  return {
    id: archive.id,
    label: archive.label,
    file: archive.file,
    uploadId: archive.uploadId,
    bytes: archiveStats.size,
    sha256: archiveHash,
    installedAssetCount: assets.length,
    archiveOnlyAssetCount: archiveOnly.length,
    archiveOnly,
    assets,
  };
}

function archiveSummary(archive) {
  const summary = { ...archive };
  delete summary.assets;
  delete summary.archiveOnly;
  return summary;
}

await mkdir(INSTALLED_ROOT, { recursive: true });
await mkdir(INDEX_ROOT, { recursive: true });
const manifestPacks = [];

for (const definition of ASSET_PACK_ARCHIVES) {
  const pack = CC0_ASSET_PACKS.find((candidate) => candidate.id === definition.packId);
  if (!pack) throw new Error(`Unknown catalog pack ${definition.packId}.`);
  process.stdout.write(`Installing ${pack.title}…\n`);
  const archives = [];
  for (const archive of definition.archives) archives.push(await installArchive(pack, archive));
  const assets = archives.flatMap((archive) => archive.assets).sort((a, b) => a.path.localeCompare(b.path));
  const archiveOnly = archives.flatMap((archive) => archive.archiveOnly.map((entry) => ({ ...entry, archiveId: archive.id })));
  const packIndex = {
    schemaVersion: "1.0.0",
    pack: { ...pack, installed: true },
    installedAssetCount: assets.length,
    archiveOnlyAssetCount: archiveOnly.length,
    archives: archives.map(archiveSummary),
    assets,
    archiveOnly,
  };
  await writeFile(path.join(INDEX_ROOT, `${pack.id}.json`), `${JSON.stringify(packIndex)}\n`, "utf8");
  manifestPacks.push({
    ...pack,
    installed: true,
    installedAssetCount: assets.length,
    archiveOnlyAssetCount: archiveOnly.length,
    indexUrl: publicUrl("asset-packs", "index", `${pack.id}.json`),
    archiveBytes: archives.reduce((sum, archive) => sum + archive.bytes, 0),
    archives: archives.map(archiveSummary),
  });
  process.stdout.write(`  ${assets.length} browseable assets, ${archiveOnly.length} archive-only files.\n`);
}

const manifest = {
  schemaVersion: "1.0.0",
  generatedAt: new Date().toISOString(),
  policy: CC0_ASSET_POLICY,
  packCount: manifestPacks.length,
  installedAssetCount: manifestPacks.reduce((sum, pack) => sum + pack.installedAssetCount, 0),
  packs: manifestPacks,
};
await writeFile(path.join(path.dirname(INSTALLED_ROOT), "manifest.json"), `${JSON.stringify(manifest)}\n`, "utf8");
process.stdout.write(`Installed ${manifest.packCount} packs with ${manifest.installedAssetCount} browseable assets.\n`);
