#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const configPath = path.resolve(process.argv[2] ?? "");
const concurrency = Math.max(1, Math.min(3, Number(process.argv[3] ?? 2)));

if (!process.argv[2]) {
  throw new Error("Usage: node scripts/fetch-itch-batch.mjs <config.json> [concurrency]");
}

const config = JSON.parse(await readFile(configPath, "utf8"));
if (!Array.isArray(config.downloads) || config.downloads.length === 0) {
  throw new Error("The batch config must contain a non-empty downloads array.");
}

let cursor = 0;
let failed = false;

async function runOne(item, index) {
  const output = path.resolve("public", "asset-packs", "archives", item.output);
  try {
    const existing = await stat(output);
    if (existing.isFile() && existing.size > 0) {
      process.stdout.write(`[${index + 1}/${config.downloads.length}] ${item.packId}: already installed (${existing.size} bytes)\n`);
      return;
    }
  } catch {
    // Missing files continue through the normal verified download path.
  }
  const args = [
    path.resolve("scripts", "fetch-itch-upload.mjs"),
    "--origin",
    item.origin,
    "--slug",
    item.slug,
    "--upload-id",
    item.uploadId,
    "--csrf",
    config.csrf,
    "--output",
    output,
  ];
  process.stdout.write(`[${index + 1}/${config.downloads.length}] ${item.packId}: ${item.output}\n`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Download exited with code ${code}.`))));
  });
}

async function worker() {
  while (!failed) {
    const index = cursor;
    cursor += 1;
    if (index >= config.downloads.length) return;
    try {
      await runOne(config.downloads[index], index);
    } catch (error) {
      failed = true;
      throw error;
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, config.downloads.length) }, () => worker()));
process.stdout.write(`Downloaded ${config.downloads.length} verified creator archives.\n`);
