#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";

// Real installed-browser harnesses are intentionally kept out of Node's
// cross-file worker pool. On a two-core Windows CI host, launching Chrome while
// the remaining unit files compile/export large fixtures can starve the first
// browser test until its truthful 90-second deadline. Run these files after the
// ordinary batch, one at a time, without weakening their own timeouts.
const ISOLATED_TEST_FILES = new Set(["platform-harness.test.mjs"]);

async function discoverTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await discoverTests(path));
    else if (entry.isFile() && /\.test\.mjs$/i.test(entry.name)) paths.push(path);
  }
  return paths;
}

const roots = process.argv.slice(2);
if (!roots.length) throw new Error("run-tests requires at least one test directory.");
const files = (await Promise.all(roots.map((root) => discoverTests(resolve(root))))).flat().sort();
if (!files.length) throw new Error(`No .test.mjs files were found under: ${roots.join(", ")}`);

function runBatch(batchFiles, { isolated = false } = {}) {
  if (!batchFiles.length) return Promise.resolve(0);
  const args = ["--test"];
  if (isolated) args.push("--test-concurrency=1");
  args.push(...batchFiles);
  return new Promise((resolveBatch, rejectBatch) => {
    const child = spawn(process.execPath, args, { stdio: "inherit", shell: false, windowsHide: true });
    child.once("error", rejectBatch);
    child.once("close", (code, signal) => {
      if (signal) process.stderr.write(`Test runner stopped by ${signal}.\n`);
      resolveBatch(code ?? 1);
    });
  });
}

const ordinaryFiles = files.filter((file) => !ISOLATED_TEST_FILES.has(basename(file)));
const isolatedFiles = files.filter((file) => ISOLATED_TEST_FILES.has(basename(file)));

try {
  const ordinaryCode = await runBatch(ordinaryFiles);
  if (ordinaryCode !== 0) process.exitCode = ordinaryCode;
  else {
    for (const file of isolatedFiles) {
      const isolatedCode = await runBatch([file], { isolated: true });
      if (isolatedCode !== 0) {
        process.exitCode = isolatedCode;
        break;
      }
    }
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
