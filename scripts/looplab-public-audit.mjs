#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LOOPLAB_PUBLIC_AUDIT_SCHEMA = "looplab-public-audit/v1";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const textExtensions = new Set([
  ".cjs", ".cmd", ".conf", ".css", ".html", ".ini", ".js", ".json", ".lock",
  ".md", ".mjs", ".ps1", ".sh", ".svg", ".toml", ".ts", ".tsx", ".txt", ".xml",
  ".yaml", ".yml",
]);
const textNames = new Set([".gitignore", ".npmrc", "Dockerfile", "LICENSE", "Makefile", "README"]);
const syntheticKeyMarker = /(?:dummy|example|fake|fixture|never|not-a-real|secret-value|test)/i;

function allowPortableWindowsPath(value, path) {
  if (path === "scripts/looplab-public-audit.mjs") return true;
  const normalized = value.replaceAll("\\\\", "\\");
  if (/^[A-Z]:\\(?:games(?:-root)?|path\\to)(?:\\|$)/i.test(normalized)) return true;
  if (/^C:\\Program Files(?: \(x86\))?\\/i.test(normalized)) return true;
  return path.startsWith("tests/") && /^(?:C:\\Users\\tester\\|C:\\private\\|H:\\stale(?:\\|$))/i.test(normalized);
}

const contentRules = Object.freeze([
  { id: "openai-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/gi, allow: (value, path) => path.startsWith("tests/") && syntheticKeyMarker.test(value) },
  { id: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/gi },
  { id: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/gi },
  { id: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/gi },
  { id: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { id: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { id: "bearer-token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi },
  { id: "email-address", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { id: "windows-user-path", pattern: /C:\\Users\\[^\\\s"']+/gi, allow: allowPortableWindowsPath },
  { id: "absolute-local-path", pattern: /\b[A-Z]:\\[^\r\n`"']+/gi, allow: allowPortableWindowsPath },
]);

const forbiddenTrackedPathRules = Object.freeze([
  { id: "private-handoff", pattern: /^(?:claudedocs|\.looplab|\.codex)(?:\/|$)/i },
  { id: "provider-environment", pattern: /^(?:\.env(?:\.|$)|.*\/\.env(?:\.|$))/i },
  { id: "local-hosting-binding", pattern: /^\.openai\/hosting\.json$/i },
  { id: "local-agent-settings", pattern: /^(?:\.mcp\.json|\.claude\/settings\.local\.json)$/i },
  { id: "credential-file", pattern: /(?:^|\/)(?:id_rsa|id_ed25519|[^/]+\.(?:dpapi|key|p12|pfx|pem))$/i },
]);

function gitFiles(args) {
  return execFileSync("git", args, { cwd: root, encoding: "buffer", maxBuffer: 64 * 1024 * 1024, windowsHide: true })
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((path) => path.replaceAll("\\", "/"));
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) if (text.charCodeAt(cursor) === 10) line += 1;
  return line;
}

export function runPublicAudit() {
  const tracked = new Set(gitFiles(["ls-files", "-z"]));
  const candidates = gitFiles(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  const findings = [];
  let scannedTextFiles = 0;
  let skippedBinaryFiles = 0;

  for (const path of tracked) {
    for (const rule of forbiddenTrackedPathRules) {
      if (rule.pattern.test(path)) findings.push({ category: rule.id, path, line: null });
    }
  }

  for (const path of candidates) {
    const name = path.split("/").at(-1) ?? path;
    if (!textExtensions.has(extname(path).toLowerCase()) && !textNames.has(name)) {
      skippedBinaryFiles += 1;
      continue;
    }
    const absolutePath = resolve(root, path);
    let stat;
    try {
      stat = lstatSync(absolutePath);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    if (stat.size > 12_000_000) {
      findings.push({ category: "unscanned-large-text", path, line: null });
      continue;
    }
    const buffer = readFileSync(absolutePath);
    if (buffer.includes(0)) {
      skippedBinaryFiles += 1;
      continue;
    }
    const text = buffer.toString("utf8");
    scannedTextFiles += 1;
    for (const rule of contentRules) {
      rule.pattern.lastIndex = 0;
      for (const match of text.matchAll(rule.pattern)) {
        if (rule.allow?.(match[0], path)) continue;
        findings.push({ category: rule.id, path, line: lineNumberAt(text, match.index ?? 0) });
      }
    }
  }

  const uniqueFindings = [...new Map(findings.map((finding) => [`${finding.category}:${finding.path}:${finding.line ?? "file"}`, finding])).values()]
    .sort((a, b) => a.path.localeCompare(b.path) || a.category.localeCompare(b.category) || (a.line ?? 0) - (b.line ?? 0));
  return {
    schemaVersion: LOOPLAB_PUBLIC_AUDIT_SCHEMA,
    ok: uniqueFindings.length === 0,
    candidateFiles: candidates.length,
    trackedFiles: tracked.size,
    scannedTextFiles,
    skippedBinaryFiles,
    findings: uniqueFindings,
    disclosurePolicy: "Findings contain category, path, and line only; suspected secret values are never printed.",
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = runPublicAudit();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.ok) process.exitCode = 1;
}
