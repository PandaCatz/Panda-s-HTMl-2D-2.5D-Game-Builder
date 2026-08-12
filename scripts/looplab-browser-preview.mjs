#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startBrowserPreviewServer } from "../lib/looplab-browser-preview.mjs";

function usage() {
  return `LoopLab browser preview server

Usage:
  npm run preview:browser -- <game.html> [--port=0] [--host=127.0.0.1]

The server binds only to loopback, uses an unguessable per-run URL, disables
network access in the game CSP, and stays active until Ctrl+C. The first JSON
line contains gameUrl and harnessUrl for Codex, Claude, or a human browser.
`;
}

function parseArgs(argv) {
  const values = { positional: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      values.positional.push(argument);
      continue;
    }
    const [rawKey, inlineValue] = argument.slice(2).split("=", 2);
    if (rawKey === "help") {
      values.help = true;
      continue;
    }
    const value = inlineValue ?? argv[index + 1];
    if (value == null || (inlineValue == null && value.startsWith("--"))) throw new Error(`Missing value for --${rawKey}.`);
    values[rawKey] = value;
    if (inlineValue == null) index += 1;
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
    const preview = await startBrowserPreviewServer({
      html: await readFile(artifactPath, "utf8"),
      host: args.host,
      port: args.port,
    });
    const { close, ...descriptor } = preview;
    process.stdout.write(`${JSON.stringify({ ok: true, artifactPath, ...descriptor })}\n`);
    const signal = await new Promise((resolveSignal) => {
      process.once("SIGINT", () => resolveSignal("SIGINT"));
      process.once("SIGTERM", () => resolveSignal("SIGTERM"));
    });
    await close();
    process.stdout.write(`${JSON.stringify({ ok: true, stopped: true, signal })}\n`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
