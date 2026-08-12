#!/usr/bin/env node

import { resolve } from "node:path";

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createLooplabMcpServer } from "../lib/looplab-mcp-server.mjs";

function option(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((entry) => entry.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

function usage() {
  return [
    "LoopLab MCP stdio server",
    "",
    "node scripts/looplab-mcp.mjs --surface=core --workspace=<project-root>",
    "node scripts/looplab-mcp.mjs --surface=browser --app-url=http://127.0.0.1:3000/",
    "",
    "Options:",
    "  --surface=core|browser",
    "  --workspace=<directory>       File boundary for core .loop.json tools",
    "  --app-url=<loopback-url>      Running LoopLab app for browser tools",
    "  --browser-channel=chrome|msedge",
    "  --executable-path=<path>",
    "  --timeout-ms=<1000..120000>",
    "  --only-tools=<name,...>      Advertise only an exact non-empty subset of this surface",
  ].join("\n");
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stderr.write(`${usage()}\n`);
  process.exit(0);
}

const surface = option("surface", "core");
const workspaceRoot = resolve(option("workspace", process.cwd()));
const appUrl = option("app-url", "http://127.0.0.1:3000/");
const browserChannel = option("browser-channel");
const executablePath = option("executable-path");
const timeoutMs = Number(option("timeout-ms", 30_000));
const onlyToolsValue = option("only-tools");
const toolAllowlist = onlyToolsValue === undefined
  ? null
  : onlyToolsValue.split(",").map((entry) => entry.trim()).filter(Boolean);
if (onlyToolsValue !== undefined && !toolAllowlist.length) throw new Error("--only-tools requires at least one command name.");

const handle = serveStdio(
  () => createLooplabMcpServer({ surface, workspaceRoot, appUrl, browserChannel, executablePath, timeoutMs, toolAllowlist }),
  { onerror: (error) => process.stderr.write(`[looplab-mcp] ${error instanceof Error ? error.message : String(error)}\n`) },
);

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await handle.close();
}

process.once("SIGINT", () => void close().finally(() => process.exit(0)));
process.once("SIGTERM", () => void close().finally(() => process.exit(0)));
