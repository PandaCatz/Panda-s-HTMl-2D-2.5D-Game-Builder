#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runPlatformHarness } from "../lib/looplab-platform-harness.mjs";

function usage() {
  return `LoopLab hostile-platform harness

Usage:
  npm run harness:platform -- <game.html> [options]
  npm run harness:browser -- <game.html> [options]

Options:
  --frames <count>                 Exact deterministic frames (default 1200)
  --frame-ms <milliseconds>        Milliseconds per exact frame (default 16)
  --expected-source-digest <hash>  Reject a receipt for different authored truth
  --browser-channel <name>         Playwright channel, such as chrome or msedge
  --executable-path <path>         Explicit Chrome/Edge executable
  --visual                         Capture bounded DOM evidence plus initial/final PNGs
  --capture-dir <directory>        PNG directory (implies --visual)
  --out <receipt.json>             Save the full receipt in addition to stdout
  --help                           Show this help
`;
}

function parseArgs(argv) {
  const values = { positional: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      values.positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === "help" || key === "visual") {
      values[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (next == null || next.startsWith("--")) throw new Error(`Missing value for --${key}.`);
    values[key] = next;
    index += 1;
  }
  return values;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.positional.length === 0) {
    process.stdout.write(usage());
    process.exitCode = args.help ? 0 : 1;
  } else {
    const artifactPath = resolve(args.positional[0]);
    const html = await readFile(artifactPath, "utf8");
    const captureDirectory = args.visual || args["capture-dir"]
      ? resolve(args["capture-dir"] ?? `${artifactPath}.browser-harness`)
      : undefined;
    const receipt = await runPlatformHarness({
      html,
      frameCount: args.frames,
      frameMs: args["frame-ms"],
      expectedSourceDigest: args["expected-source-digest"],
      browserChannel: args["browser-channel"],
      executablePath: args["executable-path"] ? resolve(args["executable-path"]) : undefined,
      captureDirectory,
    });
    const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
    if (args.out) await writeFile(resolve(args.out), serialized, "utf8");
    process.stdout.write(serialized);
    process.exitCode = receipt.passed ? 0 : 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
