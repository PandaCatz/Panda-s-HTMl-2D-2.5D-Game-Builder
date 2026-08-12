import assert from "node:assert/strict";
import test from "node:test";

import {
  ProviderHttpError,
  isUnsupportedCodexSearchOption,
  isRetryableProviderNetworkError,
  providerTimeoutMs,
  requestProviderJson,
} from "../lib/looplab-provider-http.mjs";

const response = (status, body, headers = {}) => ({ status, statusText: status === 200 ? "OK" : "Error", headers, text: body });

test("provider HTTP retries transient statuses, honors Retry-After, and returns parsed JSON", async () => {
  const queue = [response(429, "rate limited", { "retry-after": "2" }), response(529, '{"error":{"message":"overloaded"}}'), response(200, '{"answer":"ok"}')];
  const delays = [];
  const retries = [];
  const result = await requestProviderJson({
    provider: "OpenAI",
    url: "https://example.test/v1/responses",
    body: { prompt: "test" },
    transport: async () => queue.shift(),
    sleep: async (delay) => { delays.push(delay); },
    random: () => 0,
    onRetry: (event) => retries.push(event),
  });
  assert.deepEqual(result.value, { answer: "ok" });
  assert.equal(result.attemptCount, 3);
  assert.deepEqual(delays, [2_000, 1_500]);
  assert.deepEqual(retries.map((event) => event.reason), ["http-429", "http-529"]);
});

test("provider HTTP does not retry ordinary 4xx and preserves non-JSON status diagnostics", async () => {
  let calls = 0;
  await assert.rejects(
    requestProviderJson({
      provider: "Anthropic",
      url: "https://example.test/v1/messages",
      body: {},
      transport: async () => { calls += 1; return response(401, "credential rejected"); },
      sleep: async () => { throw new Error("must not sleep"); },
    }),
    (error) => error instanceof ProviderHttpError && error.status === 401 && /credential rejected/.test(error.message),
  );
  assert.equal(calls, 1);
});

test("provider HTTP reports invalid success JSON with its HTTP status", async () => {
  await assert.rejects(
    requestProviderJson({ provider: "OpenAI", url: "https://example.test", body: {}, transport: async () => response(200, "not-json") }),
    (error) => error instanceof ProviderHttpError && error.status === 200 && /invalid JSON/.test(error.message),
  );
});

test("provider timeouts are opt-in, named, and never retried", async () => {
  assert.equal(providerTimeoutMs({}), 0);
  assert.equal(providerTimeoutMs({ LOOPLAB_PROVIDER_TIMEOUT_MS: "90000" }), 90_000);
  let calls = 0;
  await assert.rejects(
    requestProviderJson({
      provider: "OpenAI",
      url: "https://example.test",
      body: {},
      timeoutMs: 60_000,
      transport: async () => {
        calls += 1;
        throw Object.assign(new Error("socket timer"), { code: "LOOPLAB_PROVIDER_TIMEOUT", timeoutMs: 60_000 });
      },
    }),
    /OpenAI API timed out after 60 seconds \(LOOPLAB_PROVIDER_TIMEOUT_MS\)/,
  );
  assert.equal(calls, 1);
});

test("only clearly pre-response network failures are retried", () => {
  assert.equal(isRetryableProviderNetworkError(Object.assign(new Error("dns"), { code: "ENOTFOUND" })), true);
  assert.equal(isRetryableProviderNetworkError(Object.assign(new Error("reset"), { code: "ECONNRESET" })), false);
  assert.equal(isRetryableProviderNetworkError(Object.assign(new Error("aborted"), { name: "AbortError" })), false);
});

test("Codex research fallback is limited to explicit --search option rejection", () => {
  const unknown = Object.assign(new Error("codex exited"), { processResult: { stderr: "error: unexpected argument '--search' found", stdout: "" } });
  const billedFailure = Object.assign(new Error("provider generation failed"), { processResult: { stderr: "", stdout: '{"type":"turn.completed","usage":{"input_tokens":900}}' } });
  assert.equal(isUnsupportedCodexSearchOption(unknown), true);
  assert.equal(isUnsupportedCodexSearchOption(billedFailure), false);
});
