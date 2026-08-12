const ANSI_SGR_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const SECRET_FIELD = /^(?:api[_-]?key|secret|password|passphrase|token|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|private[_-]?key|authorization)$/i;

const REDACTION_RULES = Object.freeze([
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/gi, "[private key redacted]"],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}\b/gi, "[secret redacted]"],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}\b/gi, "[secret redacted]"],
  [/\bgh[pousr]_[A-Za-z0-9]{12,}\b/gi, "[secret redacted]"],
  [/\bxox[baprs]-[A-Za-z0-9-]{12,}\b/gi, "[secret redacted]"],
  [/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[secret redacted]"],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[secret redacted]"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token redacted]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, "Bearer [secret redacted]"],
  [/\b((?:OPENAI|ANTHROPIC)_API_KEY\s*[=:]\s*)[^\s,;]+/gi, "$1[secret redacted]"],
  [/\b(LOOPLAB_COMPANION_TOKEN\s*[=:]\s*)[^\s,;]+/gi, "$1[secret redacted]"],
  [/(["']?(?:api[_-]?key|secret|password|passphrase|token|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|private[_-]?key|authorization)["']?\s*:\s*["'])[^"']+/gi, "$1[secret redacted]"],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email redacted]"],
  [/\b[A-Z]:\\[^\r\n`"'<>|]+/gi, "[local path redacted]"],
  [/(?:^|\s)\\\\[^\s`"'<>|]+/g, " [local path redacted]"],
  [/(?:^|\s)\/(?:Users|home)\/[^\s`"'<>|]+/g, " [local path redacted]"],
]);

export function sanitizePublicDiagnostic(value, { maximumLength = 4_000 } = {}) {
  let sanitized = String(value ?? "").replace(ANSI_SGR_PATTERN, "");
  for (const [pattern, replacement] of REDACTION_RULES) sanitized = sanitized.replace(pattern, replacement);
  return sanitized.trim().slice(0, Math.max(0, Number(maximumLength) || 0));
}

export function sanitizePublicDiagnosticValue(value, { depth = 0, maximumDepth = 6 } = {}) {
  if (typeof value === "string") return sanitizePublicDiagnostic(value);
  if (value === null || ["number", "boolean"].includes(typeof value)) return value;
  if (depth >= maximumDepth) return "[detail omitted]";
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => sanitizePublicDiagnosticValue(entry, { depth: depth + 1, maximumDepth }));
  if (!value || typeof value !== "object") return undefined;
  const sanitized = {};
  for (const [key, nested] of Object.entries(value).slice(0, 100)) {
    sanitized[key] = SECRET_FIELD.test(key) && typeof nested === "string"
      ? "[secret redacted]"
      : sanitizePublicDiagnosticValue(nested, { depth: depth + 1, maximumDepth });
  }
  return sanitized;
}
