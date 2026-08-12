import { canonicalSha256 } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_PROJECT_PRIVACY_REPORT_SCHEMA = "looplab-project-privacy-report/v1";

const MAX_VISITED_VALUES = 120_000;
const MAX_DEPTH = 64;
const MAX_SCANNED_CHARACTERS = 2_000_000;
const MAX_ARTIFACT_CHARACTERS = 4_000_000;
const REDACTED_VALUE = /^\s*(?:\[?(?:redacted|removed|omitted|not configured)\]?|none|null|undefined)\s*$/i;
const HARD_SENSITIVE_FIELD = /^(?:api[_-]?key|password|passphrase|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|private[_-]?key|authorization|connection[_-]?string)$/i;
const CONTEXTUAL_SENSITIVE_FIELD = /^(?:secret|token)$/i;
const AUTH_CONTEXT = /(?:auth|credential|provider|connection|session|header|bearer|oauth|api)/i;
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-]{1,80}$/;
const RESERVED_EMAIL_DOMAINS = new Set(["example.com", "example.org", "example.net", "invalid", "localhost", "test"]);

const HIGH_CONFIDENCE_PATTERNS = Object.freeze([
  { code: "privacy-private-key", kind: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i },
  { code: "privacy-openai-key", kind: "credential", pattern: /\bsk-(?!ant-)(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/ },
  { code: "privacy-anthropic-key", kind: "credential", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { code: "privacy-github-token", kind: "credential", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { code: "privacy-slack-token", kind: "credential", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { code: "privacy-google-api-key", kind: "credential", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { code: "privacy-aws-access-key", kind: "credential", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { code: "privacy-bearer-token", kind: "credential", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/i },
  { code: "privacy-jwt", kind: "credential", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
]);

const ABSOLUTE_PATH_PATTERNS = Object.freeze([
  /\b[A-Za-z]:[\\/](?:[^\r\n`"'<>|]|\s(?!\s)){1,}/,
  /\bfile:\/{2,3}[A-Za-z]:[\\/][^\r\n`"'<>|]+/i,
  /(?:^|[\s"'(])\\\\[^\\\s`"'<>|]+\\[^\r\n`"'<>|]+/,
  /(?:^|[\s"'(])\/(?:Users|home)\/[^/\s`"'<>|]+(?:\/[^\r\n`"'<>|]*)?/,
]);

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,}|localhost|invalid|test)\b/gi;

function sanitizedPathSegment(key) {
  if (!SAFE_PATH_SEGMENT.test(key)) return "<redacted-key>";
  if (HIGH_CONFIDENCE_PATTERNS.some((entry) => entry.pattern.test(key))) return "<redacted-key>";
  if (containsNonReservedEmail(key) || ABSOLUTE_PATH_PATTERNS.some((pattern) => pattern.test(key))) return "<redacted-key>";
  return key;
}

function childPath(path, key) {
  if (typeof key === "number") return `${path}[${key}]`;
  return `${path}.${sanitizedPathSegment(String(key))}`;
}

function isOpaquePayload(key, value) {
  if (typeof value !== "string") return false;
  if (/^data:/i.test(value)) return true;
  return /^(?:dataUrl|blob|base64|bytes|imageData|audioData)$/i.test(String(key)) && value.length > 512;
}

function containsNonReservedEmail(value) {
  EMAIL_PATTERN.lastIndex = 0;
  for (const match of value.matchAll(EMAIL_PATTERN)) {
    const domain = String(match[1] ?? "").toLowerCase();
    if (!RESERVED_EMAIL_DOMAINS.has(domain) && !domain.endsWith(".invalid") && !domain.endsWith(".test")) return true;
  }
  return false;
}

function findingFor(code, kind, severity, path) {
  const descriptions = {
    credential: "A credential-shaped value is present in authored or generated content.",
    "private-key": "Private-key material is present in authored or generated content.",
    email: "A non-example email address is present in authored or generated content.",
    "local-path": "An absolute local filesystem path is present in authored or generated content.",
    "credential-field": "A credential-named field contains a non-redacted value.",
    coverage: "The bounded privacy scan could not inspect the complete value graph.",
  };
  const actions = {
    credential: "Remove the credential, rotate it if it was real, and keep provider authentication in LoopLab's secure local companion only.",
    "private-key": "Remove the private key, rotate or revoke it if necessary, and keep key material outside projects, exports, prompts, and logs.",
    email: "Remove or replace the address with a reserved example-domain address before publishing or exporting.",
    "local-path": "Replace the machine-specific path with a project-relative label or omit it before publishing or exporting.",
    "credential-field": "Remove the field value and configure the provider through LoopLab's secure local connection flow instead.",
    coverage: "Reduce or split the oversized authored value, then rerun the privacy preflight until coverage is complete.",
  };
  return { severity, code, kind, path, message: descriptions[kind], action: actions[kind] };
}

function textFindings(value, path) {
  const findings = [];
  for (const entry of HIGH_CONFIDENCE_PATTERNS) {
    if (entry.pattern.test(value)) findings.push(findingFor(entry.code, entry.kind, "error", path));
  }
  if (containsNonReservedEmail(value)) findings.push(findingFor("privacy-email-address", "email", "warning", path));
  if (ABSOLUTE_PATH_PATTERNS.some((pattern) => pattern.test(value))) findings.push(findingFor("privacy-local-path", "local-path", "warning", path));
  return findings;
}

function uniqueFindings(findings) {
  return [...new Map(findings.map((finding) => [`${finding.code}:${finding.path}`, finding])).values()]
    .sort((first, second) => `${first.severity}:${first.code}:${first.path}`.localeCompare(`${second.severity}:${second.code}:${second.path}`));
}

export function inspectProjectPrivacy(project, options = {}) {
  const sourceDigest = typeof options.sourceDigest === "string" && options.sourceDigest ? options.sourceDigest : null;
  const findings = [];
  const seen = new WeakSet();
  const active = new WeakSet();
  const metrics = { visitedValues: 0, scannedStrings: 0, scannedCharacters: 0, skippedOpaquePayloads: 0, truncatedStrings: 0, cycleCount: 0, sharedReferenceCount: 0 };
  let coverageFindingAdded = false;

  const addCoverageFinding = (path) => {
    if (coverageFindingAdded) return;
    coverageFindingAdded = true;
    findings.push(findingFor("privacy-scan-incomplete", "coverage", "warning", path));
  };

  const inspectString = (value, path) => {
    metrics.scannedStrings += 1;
    const remainingCharacters = Math.max(0, MAX_SCANNED_CHARACTERS - metrics.scannedCharacters);
    const inspected = remainingCharacters > 0 ? value.slice(0, remainingCharacters) : "";
    metrics.scannedCharacters += inspected.length;
    if (inspected.length !== value.length) {
      metrics.truncatedStrings += 1;
      addCoverageFinding(path);
    }
    if (inspected) findings.push(...textFindings(inspected, path));
  };

  const visit = (value, path = "project", depth = 0, parentKey = "") => {
    metrics.visitedValues += 1;
    if (metrics.visitedValues > MAX_VISITED_VALUES || depth > MAX_DEPTH) {
      addCoverageFinding(path);
      return;
    }
    if (typeof value === "string") {
      inspectString(value, path);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (active.has(value)) {
      metrics.cycleCount += 1;
      addCoverageFinding(path);
      return;
    }
    if (seen.has(value)) metrics.sharedReferenceCount += 1;
    else seen.add(value);
    active.add(value);
    try {
      const entries = Array.isArray(value) ? value.map((nested, index) => [index, nested]) : Object.entries(value);
      for (const [rawKey, nested] of entries) {
        const key = String(rawKey);
        const nestedPath = childPath(path, typeof rawKey === "number" ? rawKey : key);
        if (typeof rawKey !== "number") inspectString(key, nestedPath);
        if (isOpaquePayload(key, nested)) {
          metrics.skippedOpaquePayloads += 1;
          continue;
        }
        if (typeof nested === "string" && nested.trim() && !REDACTED_VALUE.test(nested)) {
          const hardSensitive = HARD_SENSITIVE_FIELD.test(key);
          const contextualSensitive = CONTEXTUAL_SENSITIVE_FIELD.test(key) && AUTH_CONTEXT.test(`${parentKey}.${path}`);
          if (hardSensitive || contextualSensitive) findings.push(findingFor("privacy-credential-field", "credential-field", "error", nestedPath));
        }
        visit(nested, nestedPath, depth + 1, key);
      }
    } finally {
      active.delete(value);
    }
  };

  visit(project);
  const issues = uniqueFindings(findings);
  const errorCount = issues.filter((finding) => finding.severity === "error").length;
  const warningCount = issues.filter((finding) => finding.severity === "warning").length;
  const status = errorCount > 0 ? "blocked" : warningCount > 0 ? "review-required" : "clear";
  const digest = canonicalSha256({ schemaVersion: LOOPLAB_PROJECT_PRIVACY_REPORT_SCHEMA, sourceDigest, status, issues, metrics });
  return {
    schemaVersion: LOOPLAB_PROJECT_PRIVACY_REPORT_SCHEMA,
    sourceDigest,
    digest,
    status,
    clear: issues.length === 0,
    errorCount,
    warningCount,
    findingCount: issues.length,
    issues,
    metrics,
    policy: {
      providerCalls: false,
      matchedValuesReturned: false,
      opaquePayloadsDecoded: false,
      productionBlocking: ["credentials", "private keys", "non-example email addresses", "absolute local filesystem paths", "incomplete scan coverage"],
    },
    proofBoundary: "A clear heuristic report does not prove that no private or identifying information exists. It proves only that this bounded local scan found none of its declared high-confidence patterns or review categories, without returning matched values.",
  };
}

export function assertProviderPayloadPrivacy(payload, options = {}) {
  const label = typeof options.label === "string" && options.label.trim()
    ? options.label.trim().slice(0, 120)
    : "AI provider payload";
  const report = inspectProjectPrivacy(payload, { sourceDigest: options.sourceDigest ?? null });
  if (report.clear) return report;
  const structuralSummary = report.issues
    .slice(0, 6)
    .map((issue) => `${issue.code} at ${issue.path}`)
    .join("; ");
  const error = new Error(`Privacy preflight blocked ${label}: ${report.findingCount} finding(s)${structuralSummary ? ` (${structuralSummary})` : ""}. Matched values are intentionally omitted.`);
  error.code = "privacy-preflight-blocked";
  error.privacyReport = report;
  throw error;
}

export function inspectStandaloneArtifactPrivacy(html, project, options = {}) {
  let scannableHtml = String(html ?? "");
  for (const record of [...(project?.assets ?? []), ...(project?.resources ?? [])]) {
    if (typeof record?.dataUrl === "string" && record.dataUrl.startsWith("data:")) scannableHtml = scannableHtml.replaceAll(record.dataUrl, "data:[embedded-payload]");
  }
  const projectReport = inspectProjectPrivacy(project, { sourceDigest: options.sourceDigest ?? null });
  const inspectedHtml = scannableHtml.slice(0, MAX_ARTIFACT_CHARACTERS);
  const artifactIssues = textFindings(inspectedHtml, "artifact");
  if (inspectedHtml.length !== scannableHtml.length) artifactIssues.push(findingFor("privacy-scan-incomplete", "coverage", "warning", "artifact"));
  const issues = uniqueFindings([...projectReport.issues, ...artifactIssues]);
  const errorCount = issues.filter((finding) => finding.severity === "error").length;
  const warningCount = issues.filter((finding) => finding.severity === "warning").length;
  const status = errorCount > 0 ? "blocked" : warningCount > 0 ? "review-required" : "clear";
  const metrics = { ...projectReport.metrics, artifactCharacters: scannableHtml.length, scannedArtifactCharacters: inspectedHtml.length };
  const schemaVersion = "looplab-standalone-privacy-report/v1";
  const digest = canonicalSha256({ schemaVersion, sourceDigest: projectReport.sourceDigest, status, issues, metrics });
  return {
    schemaVersion,
    sourceDigest: projectReport.sourceDigest,
    digest,
    status,
    clear: issues.length === 0,
    errorCount,
    warningCount,
    findingCount: issues.length,
    issues,
    metrics,
    matchedValuesReturned: false,
    proofBoundary: projectReport.proofBoundary,
  };
}
