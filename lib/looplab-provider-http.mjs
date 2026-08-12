import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504, 529]);
const RETRYABLE_NETWORK_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
]);
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

function finiteNonNegative(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function boundedAttempts(value) {
  return Math.max(1, Math.min(4, Math.floor(finiteNonNegative(value, DEFAULT_MAX_ATTEMPTS)) || DEFAULT_MAX_ATTEMPTS));
}

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const value = headers[String(name).toLowerCase()] ?? headers[name];
  return Array.isArray(value) ? value[0] : value ?? null;
}

function retryAfterMs(headers, now = Date.now()) {
  const value = String(headerValue(headers, "retry-after") ?? "").trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60_000, seconds * 1_000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.min(60_000, Math.max(0, timestamp - now)) : null;
}

function retryDelayMs(attempt, headers, random = Math.random) {
  const requested = retryAfterMs(headers);
  if (requested !== null) return requested;
  const jitter = Math.floor(Math.max(0, Math.min(1, Number(random()) || 0)) * 250);
  return Math.min(30_000, 750 * (2 ** Math.max(0, attempt - 1)) + jitter);
}

function responseMessage(value, text, fallback) {
  const message = value?.error?.message ?? value?.message;
  if (typeof message === "string" && message.trim()) return message.trim();
  const compact = String(text ?? "").replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, 1_000) : fallback;
}

function parseResponseJson(text) {
  if (!String(text ?? "").trim()) return { value: null, parseError: null };
  try {
    return { value: JSON.parse(text), parseError: null };
  } catch (error) {
    return { value: null, parseError: error };
  }
}

export class ProviderHttpError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = "ProviderHttpError";
    Object.assign(this, detail);
  }
}

export function providerTimeoutMs(env = process.env, specificName = null) {
  return finiteNonNegative(specificName ? env?.[specificName] ?? env?.LOOPLAB_PROVIDER_TIMEOUT_MS : env?.LOOPLAB_PROVIDER_TIMEOUT_MS, 0);
}

export function isRetryableProviderStatus(status) {
  return RETRYABLE_STATUS_CODES.has(Number(status));
}

export function isRetryableProviderNetworkError(error) {
  if (!error || error.name === "AbortError" || error.code === "LOOPLAB_PROVIDER_TIMEOUT") return false;
  return RETRYABLE_NETWORK_CODES.has(String(error.code ?? error.cause?.code ?? ""));
}

export function isUnsupportedCodexSearchOption(error) {
  const diagnostic = `${error?.processResult?.stderr ?? ""}\n${error?.processResult?.stdout ?? ""}\n${error?.message ?? ""}`;
  return /(?:unknown|unrecognized|unexpected|wasn['’]t expected|not recognized)[^\r\n]{0,160}--search|--search[^\r\n]{0,160}(?:unknown|unrecognized|unexpected|wasn['’]t expected|not recognized)/i.test(diagnostic);
}

export function nativeProviderTransport(url, {
  method = "POST",
  headers = {},
  body = "",
  timeoutMs = 0,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
} = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = (target.protocol === "http:" ? httpRequest : httpsRequest)(target, { method, headers }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxResponseBytes) {
          const error = new ProviderHttpError(`Provider response exceeded ${maxResponseBytes.toLocaleString("en-US")} bytes.`, {
            code: "LOOPLAB_PROVIDER_RESPONSE_TOO_LARGE",
            status: response.statusCode ?? null,
          });
          response.destroy(error);
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        status: response.statusCode ?? 0,
        statusText: response.statusMessage ?? "",
        headers: response.headers,
        text: Buffer.concat(chunks).toString("utf8"),
      }));
      response.on("error", reject);
    });
    request.on("error", reject);
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      request.setTimeout(Math.max(30_000, timeoutMs), () => {
        const boundedTimeoutMs = Math.max(30_000, timeoutMs);
        request.destroy(new ProviderHttpError(`Provider request timed out after ${Math.round(boundedTimeoutMs / 1_000)} seconds.`, {
          code: "LOOPLAB_PROVIDER_TIMEOUT",
          timeoutMs: boundedTimeoutMs,
        }));
      });
    }
    request.end(body);
  });
}

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function requestProviderJson({
  provider,
  url,
  method = "POST",
  headers = {},
  body,
  timeoutMs = providerTimeoutMs(),
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  transport = nativeProviderTransport,
  sleep = defaultSleep,
  random = Math.random,
  onRetry = null,
}) {
  const providerLabel = String(provider ?? "Provider").trim() || "Provider";
  const requestBody = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const requestHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(requestBody)),
    ...headers,
  };
  const attempts = boundedAttempts(maxAttempts);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await transport(url, { method, headers: requestHeaders, body: requestBody, timeoutMs, maxResponseBytes });
    } catch (cause) {
      const retryable = attempt < attempts && isRetryableProviderNetworkError(cause);
      if (!retryable) {
        if (cause?.code === "LOOPLAB_PROVIDER_TIMEOUT") {
          throw new ProviderHttpError(`${providerLabel} API timed out after ${Math.round(Number(cause.timeoutMs ?? timeoutMs) / 1_000)} seconds (LOOPLAB_PROVIDER_TIMEOUT_MS).`, {
            code: cause.code,
            timeoutMs: cause.timeoutMs ?? timeoutMs,
            cause,
            attempt,
          });
        }
        throw new ProviderHttpError(`${providerLabel} API network request failed: ${cause?.message ?? String(cause)}`, {
          code: cause?.code ?? cause?.cause?.code ?? "LOOPLAB_PROVIDER_NETWORK_ERROR",
          cause,
          attempt,
        });
      }
      const delayMs = retryDelayMs(attempt, null, random);
      onRetry?.({ provider: providerLabel, attempt, nextAttempt: attempt + 1, delayMs, reason: cause?.code ?? "network-error" });
      await sleep(delayMs);
      continue;
    }

    const parsed = parseResponseJson(response.text);
    const ok = response.status >= 200 && response.status < 300;
    if (!ok) {
      const retryable = attempt < attempts && isRetryableProviderStatus(response.status);
      if (retryable) {
        const delayMs = retryDelayMs(attempt, response.headers, random);
        onRetry?.({ provider: providerLabel, attempt, nextAttempt: attempt + 1, delayMs, reason: `http-${response.status}` });
        await sleep(delayMs);
        continue;
      }
      throw new ProviderHttpError(`${providerLabel} API ${response.status}: ${responseMessage(parsed.value, response.text, response.statusText || "request failed")}`, {
        status: response.status,
        statusText: response.statusText,
        responseBody: parsed.value,
        responseText: response.text,
        attempt,
      });
    }
    if (parsed.parseError) {
      throw new ProviderHttpError(`${providerLabel} API ${response.status} returned invalid JSON.`, {
        status: response.status,
        statusText: response.statusText,
        responseText: response.text,
        cause: parsed.parseError,
        attempt,
      });
    }
    if (parsed.value === null) {
      throw new ProviderHttpError(`${providerLabel} API ${response.status} returned an empty response.`, {
        status: response.status,
        statusText: response.statusText,
        responseText: response.text,
        attempt,
      });
    }
    return { value: parsed.value, status: response.status, headers: response.headers, attemptCount: attempt };
  }
  throw new ProviderHttpError(`${providerLabel} API request failed without a response.`, { code: "LOOPLAB_PROVIDER_UNKNOWN_ERROR" });
}
