import assert from "node:assert/strict";
import test from "node:test";

import { sanitizePublicDiagnostic, sanitizePublicDiagnosticValue } from "../lib/looplab-public-diagnostics.mjs";

test("public diagnostics redact credentials, personal addresses, and local paths", () => {
  const secret = "sk-" + "proj-test-fixture-abcdefghijklmnopqrstuvwxyz123456";
  const email = "private.person" + "@" + "example.com";
  const localPath = "C:" + "\\Users\\private-user\\game\\source.json";
  const output = sanitizePublicDiagnostic(`OPENAI_API_KEY=${secret} ${email} ${localPath}`);
  assert.doesNotMatch(output, new RegExp(secret));
  assert.doesNotMatch(output, new RegExp(email));
  assert.doesNotMatch(output, /private-user/);
  assert.match(output, /secret redacted/);
  assert.match(output, /email redacted/);
  assert.match(output, /local path redacted/);
});

test("structured public diagnostics redact secret fields recursively", () => {
  const secret = "test-fixture-secret-value";
  const sanitized = sanitizePublicDiagnosticValue({ nested: { apiKey: secret, message: "safe diagnostic" } });
  assert.equal(sanitized.nested.apiKey, "[secret redacted]");
  assert.equal(sanitized.nested.message, "safe diagnostic");
  assert.doesNotMatch(JSON.stringify(sanitized), new RegExp(secret));
});
