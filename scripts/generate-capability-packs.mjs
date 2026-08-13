#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getCapabilityPackRegistry, validateCapabilityPackRegistry } from "../lib/looplab-capability-packs.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, "public", "capability-packs.json");
const check = process.argv.includes("--check");
const registry = getCapabilityPackRegistry();
const validation = validateCapabilityPackRegistry(registry);
if (!validation.valid) throw new Error(`Capability-pack registry is invalid: ${validation.errors.join(" ")}`);
const expected = `${JSON.stringify(registry, null, 2)}\n`;

if (check) {
  let current = "";
  try { current = await readFile(outputPath, "utf8"); }
  catch { throw new Error("public/capability-packs.json is missing. Run npm run capability-packs:generate."); }
  if (current.replace(/\r\n/g, "\n") !== expected.replace(/\r\n/g, "\n")) {
    throw new Error("public/capability-packs.json is stale. Run npm run capability-packs:generate and commit the result.");
  }
  process.stdout.write(`${JSON.stringify({ ok: true, checked: true, outputPath, registryDigest: registry.digest, packCount: registry.packCount, capabilityCount: registry.capabilityCount })}\n`);
} else {
  await writeFile(outputPath, expected, "utf8");
  process.stdout.write(`${JSON.stringify({ ok: true, generated: true, outputPath, registryDigest: registry.digest, packCount: registry.packCount, capabilityCount: registry.capabilityCount })}\n`);
}
