#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LOOPLAB_PUBLIC_AUDIT_SCHEMA = "looplab-public-audit/v2";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const textExtensions = new Set([
  ".cjs", ".cmd", ".conf", ".css", ".html", ".ini", ".js", ".json", ".lock",
  ".md", ".mjs", ".ps1", ".sh", ".svg", ".toml", ".ts", ".tsx", ".txt", ".xml",
  ".yaml", ".yml",
]);
const textNames = new Set([".gitignore", ".npmrc", "Dockerfile", "LICENSE", "Makefile", "README"]);
const syntheticKeyMarker = /(?:dummy|example|fake|fixture|never|not-a-real|secret-value|test)/i;
const binaryCredentialPattern = "(sk-(proj-)?[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|(AKIA|ASIA)[A-Z0-9]{16}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----)";

function allowPublicNoreplyEmail(value) {
  return /^(?:noreply@github\.com|[^@\s]+@users\.noreply\.github\.com)$/i.test(String(value).trim());
}

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
  { id: "email-address", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, allow: allowPublicNoreplyEmail },
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

function gitBuffer(args, options = {}) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
    ...options,
  });
}

function isTextPath(path) {
  const name = path.split("/").at(-1) ?? path;
  return textExtensions.has(extname(path).toLowerCase()) || textNames.has(name);
}

function batchGitObjects(objectIds) {
  const ids = [...new Set(objectIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const output = gitBuffer(["cat-file", "--batch"], { input: Buffer.from(`${ids.join("\n")}\n`, "utf8") });
  const objects = new Map();
  let offset = 0;
  while (offset < output.length) {
    const headerEnd = output.indexOf(10, offset);
    if (headerEnd < 0) throw new Error("git cat-file returned an incomplete object header.");
    const header = output.subarray(offset, headerEnd).toString("utf8");
    offset = headerEnd + 1;
    const [objectId, type, sizeText] = header.split(" ");
    if (type === "missing") throw new Error(`git cat-file could not read object ${String(objectId).slice(0, 12)}.`);
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size) || size < 0 || offset + size > output.length) throw new Error("git cat-file returned an invalid object size.");
    objects.set(objectId, output.subarray(offset, offset + size));
    offset += size + 1;
  }
  return objects;
}

function gitGrepPaths(pattern, revisions = []) {
  let output;
  try {
    output = gitBuffer(["grep", "-a", "-l", "-z", "-E", pattern, ...revisions, "--"]);
  } catch (error) {
    if (error?.status !== 1) throw error;
    output = Buffer.isBuffer(error.stdout) ? error.stdout : Buffer.alloc(0);
  }
  return output.toString("utf8").split("\0").map((value) => value.trim()).filter(Boolean);
}

function historicalGrepLocation(value) {
  const match = /^([a-f0-9]{40}):(.*)$/i.exec(value);
  return match
    ? { revision: match[1].slice(0, 12), path: match[2].replaceAll("\\", "/") }
    : { revision: null, path: value.replaceAll("\\", "/") };
}

function historyInventory() {
  const commits = gitBuffer(["rev-list", "--all"])
    .toString("utf8")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  const entries = new Map();
  for (const commit of commits) {
    const tree = gitBuffer(["ls-tree", "-r", "-z", "--full-tree", commit]).toString("utf8");
    for (const record of tree.split("\0").filter(Boolean)) {
      const separator = record.indexOf("\t");
      if (separator < 0) continue;
      const [mode, type, objectId] = record.slice(0, separator).split(/\s+/);
      if (type !== "blob" || !objectId || !mode) continue;
      const path = record.slice(separator + 1).replaceAll("\\", "/");
      const key = `${objectId}\0${path}`;
      if (!entries.has(key)) entries.set(key, { objectId, path, revision: commit.slice(0, 12) });
    }
  }
  return { commits, entries: [...entries.values()] };
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) if (text.charCodeAt(cursor) === 10) line += 1;
  return line;
}

function dependabotBodyStart(text) {
  const headerEnd = text.indexOf("\n\n");
  if (headerEnd < 0) return null;
  const headers = text.slice(0, headerEnd);
  return /^author\s+dependabot\[bot\]\s+<[^>]+@users\.noreply\.github\.com>\s+/mi.test(headers) ? headerEnd + 2 : null;
}

function scanText({ text, path, findings, revision = null, allowedEmailBodyStart = null }) {
  for (const rule of contentRules) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      if (rule.allow?.(match[0], path)) continue;
      if (rule.id === "email-address" && Number.isInteger(allowedEmailBodyStart) && (match.index ?? -1) >= allowedEmailBodyStart) continue;
      findings.push({ category: rule.id, path, line: lineNumberAt(text, match.index ?? 0), ...(revision ? { revision } : {}) });
    }
  }
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
    if (!isTextPath(path)) {
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
    scanText({ text, path, findings });
  }

  const history = historyInventory();
  const historyTextEntries = history.entries.filter((entry) => isTextPath(entry.path));
  const historyObjects = batchGitObjects([
    ...history.commits,
    ...historyTextEntries.map((entry) => entry.objectId),
  ]);
  let historyScannedTextFiles = 0;
  let historySkippedBinaryFiles = history.entries.length - historyTextEntries.length;

  for (const entry of history.entries) {
    for (const rule of forbiddenTrackedPathRules) {
      if (rule.pattern.test(entry.path)) findings.push({ category: rule.id, path: entry.path, line: null, revision: entry.revision });
    }
  }

  for (const entry of historyTextEntries) {
    const buffer = historyObjects.get(entry.objectId);
    if (!buffer || buffer.includes(0)) {
      historySkippedBinaryFiles += 1;
      continue;
    }
    if (buffer.length > 12_000_000) {
      findings.push({ category: "unscanned-large-text", path: entry.path, line: null, revision: entry.revision });
      continue;
    }
    historyScannedTextFiles += 1;
    scanText({ text: buffer.toString("utf8"), path: entry.path, findings, revision: entry.revision });
  }

  for (const commit of history.commits) {
    const buffer = historyObjects.get(commit);
    if (!buffer) continue;
    const text = buffer.toString("utf8");
    scanText({
      text,
      path: `git/commits/${commit.slice(0, 12)}.txt`,
      findings,
      revision: commit.slice(0, 12),
      allowedEmailBodyStart: dependabotBodyStart(text),
    });
  }

  for (const rawPath of gitGrepPaths(binaryCredentialPattern)) {
    const path = rawPath.replaceAll("\\", "/");
    if (!isTextPath(path)) findings.push({ category: "binary-credential-signature", path, line: null });
  }
  for (const rawLocation of gitGrepPaths(binaryCredentialPattern, history.commits)) {
    const location = historicalGrepLocation(rawLocation);
    if (!isTextPath(location.path)) findings.push({ category: "binary-credential-signature", path: location.path, line: null, ...(location.revision ? { revision: location.revision } : {}) });
  }

  for (const path of candidates) {
    if (tracked.has(path) || isTextPath(path)) continue;
    let buffer;
    try { buffer = readFileSync(resolve(root, path)); } catch { continue; }
    const printable = buffer.toString("latin1");
    if (new RegExp(binaryCredentialPattern, "i").test(printable)) findings.push({ category: "binary-credential-signature", path, line: null });
  }

  const uniqueFindings = [...new Map(findings.map((finding) => [`${finding.category}:${finding.path}:${finding.line ?? "file"}:${finding.revision ?? "working-tree"}`, finding])).values()]
    .sort((a, b) => a.path.localeCompare(b.path) || String(a.revision ?? "").localeCompare(String(b.revision ?? "")) || a.category.localeCompare(b.category) || (a.line ?? 0) - (b.line ?? 0));
  return {
    schemaVersion: LOOPLAB_PUBLIC_AUDIT_SCHEMA,
    ok: uniqueFindings.length === 0,
    candidateFiles: candidates.length,
    trackedFiles: tracked.size,
    scannedTextFiles,
    skippedBinaryFiles,
    historyCommitCount: history.commits.length,
    historyCandidateFiles: history.entries.length,
    historyScannedTextFiles,
    historySkippedBinaryFiles,
    binaryCredentialSignatureScan: { tracked: true, history: true, publishCandidates: true },
    findings: uniqueFindings,
    disclosurePolicy: "Findings contain category, path, line, and an abbreviated revision only; suspected secret values are never printed.",
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = runPublicAudit();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.ok) process.exitCode = 1;
}
