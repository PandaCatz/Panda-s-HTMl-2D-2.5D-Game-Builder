import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { getAgentManifest, getPublicAgentManifest } from "../lib/looplab-agent-core.mjs";
import { getLooplabCommandContract, validateLooplabCommandContracts } from "../lib/looplab-agent-contracts.mjs";
import { companionLifecycleDecision } from "../lib/looplab-companion-lifecycle.mjs";
import {
  LOOPLAB_LOCAL_COPILOT_ADVICE_SCHEMA,
  LOOPLAB_LOCAL_COPILOT_POLICY,
  inspectLocalCopilot,
  normalizeLocalCopilotOrigin,
  normalizeLocalCopilotRequest,
  runLocalCopilot,
  validateLocalCopilotAdvice,
} from "../lib/looplab-local-copilot.mjs";

const VALID_ADVICE = {
  summary: "The supplied plan is coherent but needs exact evidence boundaries.",
  observations: [{ title: "Evidence gap", detail: "The context reports a production warning without a current browser receipt.", confidence: "high" }],
  suggestions: [{ title: "Inspect before editing", rationale: "A fresh source-bound brief prevents stale assumptions.", priority: "high", proposedIntent: "Inspect the current production finding and prepare a review-only correction plan." }],
  uncertainties: ["No rendered image was supplied."],
};

test("local copilot origins are literal loopback-only and contain no URL authority tricks", () => {
  assert.equal(normalizeLocalCopilotOrigin("http://localhost:11434"), "http://127.0.0.1:11434");
  assert.equal(normalizeLocalCopilotOrigin("http://127.0.0.1:1234"), "http://127.0.0.1:1234");
  assert.equal(normalizeLocalCopilotOrigin("http://[::1]:52495"), "http://[::1]:52495");
  assert.throws(() => normalizeLocalCopilotOrigin("https://127.0.0.1:1234"), /loopback HTTP/);
  assert.throws(() => normalizeLocalCopilotOrigin("http://example.com:1234"), /literal loopback/);
  assert.throws(() => normalizeLocalCopilotOrigin("http://user:secret@127.0.0.1:1234"), /URL credentials/);
  assert.throws(() => normalizeLocalCopilotOrigin("http://127.0.0.1:1234/v1"), /must not contain an endpoint path/);
});

test("invalid optional local AI configuration stays isolated from the main companion", async () => {
  let calls = 0;
  const status = await inspectLocalCopilot({
    env: { LOOPLAB_LOCAL_AI_URL: "https://remote.example:1234" },
    fetcher: async () => { calls += 1; throw new Error("must not scan"); },
  });
  assert.equal(status.state, "blocked");
  assert.equal(status.ready, false);
  assert.equal(status.summary, "Local AI configuration is invalid");
  assert.match(status.detail, /loopback HTTP/);
  assert.equal(calls, 0);
});
test("passive local copilot discovery lists models without invoking or loading one", async () => {
  const calls = [];
  const status = await inspectLocalCopilot({
    env: {},
    fetcher: async (url, options) => {
      calls.push({ url, options });
      if (url === "http://127.0.0.1:11434/v1/models") return new Response(JSON.stringify({ data: [{ id: "qwen-local" }, { id: "qwen-local" }] }), { status: 200 });
      throw new Error("offline");
    },
  });

  assert.equal(status.ready, true);
  assert.equal(status.engine, "ollama");
  assert.equal(status.model, "qwen-local");
  assert.deepEqual(status.availableModels, ["qwen-local"]);
  assert.equal(status.policy.mutatesProject, false);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.url.endsWith("/v1/models")));
  assert.ok(calls.every((call) => call.options.method === "GET"));
});

test("local model discovery reports authentication failures as blocked rather than missing-model", async () => {
  const status = await inspectLocalCopilot({
    env: {},
    fetcher: async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
  });
  assert.equal(status.state, "blocked");
  assert.equal(status.ready, false);
  assert.match(status.summary, /rejected model discovery/i);
  assert.match(status.detail, /access policy/i);
});

test("explicit compatible endpoints stay loopback-only and local access tokens are never returned", async () => {
  let authorization = null;
  const secret = "local-access-secret";
  const status = await inspectLocalCopilot({
    env: {
      LOOPLAB_LOCAL_AI_URL: "http://127.0.0.1:52495",
      LOOPLAB_LOCAL_AI_ENGINE: "foundry-local",
      LOOPLAB_LOCAL_AI_MODEL: "phi-local",
      LOOPLAB_LOCAL_AI_TOKEN: secret,
    },
    fetcher: async (_url, options) => {
      authorization = options.headers.Authorization;
      return new Response(JSON.stringify({ data: [{ id: "phi-local" }] }), { status: 200 });
    },
  });
  assert.equal(status.engine, "foundry-local");
  assert.equal(status.model, "phi-local");
  assert.equal(status.authenticated, true);
  assert.equal(authorization, `Bearer ${secret}`);
  assert.doesNotMatch(JSON.stringify(status), new RegExp(secret));
});

test("local copilot request context is bounded and rejects embedded image bytes", () => {
  const request = normalizeLocalCopilotRequest({ task: "Critique this plan", mode: "critique-plan", sourceDigest: "source-abc", context: { plan: ["inspect", "preview"] } });
  assert.equal(request.mode, "critique-plan");
  assert.equal(request.sourceDigest, "source-abc");
  assert.ok(request.contextCharacters > 0);
  assert.throws(() => normalizeLocalCopilotRequest({ task: "x", mode: "critque-plan", context: {} }), /mode must be one of/);
  assert.throws(() => normalizeLocalCopilotRequest({ task: "x", context: [] }), /one JSON object/);
  assert.throws(() => normalizeLocalCopilotRequest({ task: "x", context: { screenshot: "data:image/png;base64,AAAA" } }), /image data URLs/);
  assert.throws(() => normalizeLocalCopilotRequest({ task: "x", context: { large: "z".repeat(40_100) } }), /40,000 character limit/);
});

test("local copilot inference is stateless, tool-free, schema-constrained, and independently validated", async () => {
  let outbound = null;
  const status = {
    ready: true,
    origin: "http://127.0.0.1:11434",
    engine: "ollama",
    model: "qwen-local",
    availableModels: ["qwen-local"],
  };
  const result = await runLocalCopilot({ task: "Find the highest-risk gap", mode: "identify-risks", sourceDigest: "source-current", context: { doctor: { warnings: 1 } } }, {
    status,
    env: {},
    fetcher: async (_url, options) => {
      outbound = JSON.parse(options.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(VALID_ADVICE) } }], usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 } }), { status: 200 });
    },
  });

  assert.equal(outbound.stream, false);
  assert.equal(outbound.response_format.type, "json_schema");
  assert.equal(outbound.response_format.json_schema.strict, true);
  assert.equal(Object.hasOwn(outbound, "tools"), false);
  assert.equal(Object.hasOwn(outbound, "integrations"), false);
  assert.equal(result.schemaVersion, LOOPLAB_LOCAL_COPILOT_ADVICE_SCHEMA);
  assert.equal(result.sourceDigest, "source-current");
  assert.match(result.taskDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.usage.totalTokens, 200);
  assert.equal(result.usage.estimatedUsd, 0);
  assert.equal(result.usage.billingMode, "local");
  assert.deepEqual(result.policy, LOOPLAB_LOCAL_COPILOT_POLICY);
});

test("local copilot privacy preflight stops inference before the loopback fetch", async () => {
  let calls = 0;
  const privateAddress = ["private.builder", "private-studio.dev"].join("@");
  const status = { ready: true, origin: "http://127.0.0.1:11434", engine: "ollama", model: "qwen-local", availableModels: ["qwen-local"] };
  await assert.rejects(
    runLocalCopilot({ task: `Summarize ${privateAddress}`, context: {} }, { status, fetcher: async () => { calls += 1; throw new Error("must not fetch"); } }),
    (error) => error?.code === "privacy-preflight-blocked" && !error.message.includes(privateAddress),
  );
  assert.equal(calls, 0);
});

test("malformed or expanded local-model output fails closed", async () => {
  assert.throws(() => validateLocalCopilotAdvice({ ...VALID_ADVICE, commands: [{ op: "set_project" }] }), /strict local-copilot output schema/);
  const status = { ready: true, origin: "http://127.0.0.1:1234", engine: "lm-studio", model: "model", availableModels: ["model"] };
  await assert.rejects(
    runLocalCopilot({ task: "Critique", context: {} }, { status, fetcher: async () => new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), { status: 200 }) }),
    /did not return valid JSON/,
  );
});

test("local copilot is a browser-session advisory capability, not a project-mutating provider", async () => {
  const validation = validateLooplabCommandContracts();
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  const statusContract = getLooplabCommandContract("get_local_copilot_status");
  const startContract = getLooplabCommandContract("start_local_copilot");
  assert.deepEqual(statusContract.surfaces, ["browser-session"]);
  assert.equal(statusContract.annotations.readOnlyHint, true);
  assert.equal(startContract.mutatesProject, false);
  assert.equal(startContract.mutatesBuilderState, true);
  assert.equal(startContract.annotations.openWorldHint, false);
  assert.deepEqual(startContract.inputSchema.required, ["task"]);

  const manifest = getAgentManifest();
  assert.deepEqual(manifest.localCopilot.commands, ["get_local_copilot_status", "start_local_copilot", "get_local_copilot_job", "cancel_local_copilot_job"]);
  assert.equal(manifest.localCopilot.policy.providerReplacement, false);
  assert.match(manifest.localCopilot.configuration.url, /LOOPLAB_LOCAL_AI_URL/);
  assert.match(manifest.localCopilot.configuration.token, /never returned/);
  assert.equal(getPublicAgentManifest().companion.localCopilotJobs, "/local-copilot/jobs");

  const companionSource = await readFile(new URL("../scripts/looplab-companion.mjs", import.meta.url), "utf8");
  assert.match(companionSource, /pathname === "\/local-copilot"/);
  assert.match(companionSource, /pathname === "\/local-copilot\/jobs"/);
  assert.match(companionSource, /Monitor this job ID instead of resubmitting it/);
  assert.doesNotMatch(companionSource.match(/async function startLocalCopilotJob[\s\S]*?(?=const server)/)?.[0] ?? "", /setTimeout\(/);
  assert.equal(companionLifecycleDecision({ name: "Looplab AI Companion", protocolVersion: "old", activeLocalCopilotJobs: 1 }, "new").action, "block");
});
test("real companion completes a source-bound local copilot job without exposing its local access token", { timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-local-copilot-http-"));
  const sessionFile = join(directory, "session.json");
  const token = "looplab-local-copilot-session-0123456789abcdef";
  const localAccessToken = "local-model-test-secret";
  let inferenceBody = null;
  let inferenceAuthorization = null;
  const localServer = createHttpServer((request, response) => {
    const send = (statusCode, value) => {
      response.writeHead(statusCode, { "Content-Type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (request.method === "GET" && request.url === "/v1/models") {
      inferenceAuthorization = request.headers.authorization ?? null;
      send(200, { data: [{ id: "looplab-fixture-model" }] });
      return;
    }
    if (request.method === "POST" && request.url === "/v1/chat/completions") {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        inferenceAuthorization = request.headers.authorization ?? null;
        inferenceBody = JSON.parse(body);
        setTimeout(() => send(200, {
          choices: [{ message: { content: JSON.stringify(VALID_ADVICE) } }],
          usage: { prompt_tokens: 14, completion_tokens: 6, total_tokens: 20 },
        }), 400);
      });
      return;
    }
    send(404, { error: "fixture route not found" });
  });
  await new Promise((resolveListen, rejectListen) => {
    localServer.once("error", rejectListen);
    localServer.listen(0, "127.0.0.1", resolveListen);
  });
  const localAddress = localServer.address();
  const localPort = typeof localAddress === "object" && localAddress ? localAddress.port : 0;
  const portProbe = createHttpServer();
  await new Promise((resolveListen, rejectListen) => {
    portProbe.once("error", rejectListen);
    portProbe.listen(0, "127.0.0.1", resolveListen);
  });
  const probeAddress = portProbe.address();
  const companionPort = typeof probeAddress === "object" && probeAddress ? probeAddress.port : 0;
  await new Promise((resolveClose) => portProbe.close(resolveClose));

  const child = spawn(process.execPath, [resolve("scripts/looplab-companion.mjs")], {
    cwd: resolve("."),
    env: {
      ...process.env,
      LOOPLAB_COMPANION_PORT: String(companionPort),
      LOOPLAB_COMPANION_SESSION_FILE: sessionFile,
      LOOPLAB_COMPANION_SESSION_ID: "local-copilot-http-test",
      LOOPLAB_COMPANION_TOKEN: token,
      LOOPLAB_LOCAL_AI_URL: `http://127.0.0.1:${localPort}`,
      LOOPLAB_LOCAL_AI_ENGINE: "fixture-local",
      LOOPLAB_LOCAL_AI_MODEL: "looplab-fixture-model",
      LOOPLAB_LOCAL_AI_TOKEN: localAccessToken,
    },
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    await new Promise((resolveReady, rejectReady) => {
      let stdout = "";
      const timer = setTimeout(() => rejectReady(new Error(`Companion startup timed out: ${stderr}`)), 10_000);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (!stdout.includes('"type":"companion.ready"')) return;
        clearTimeout(timer);
        resolveReady();
      });
      child.once("exit", (code) => rejectReady(new Error(`Companion exited during startup (${code}): ${stderr}`)));
    });

    const origin = `http://127.0.0.1:${companionPort}`;
    const headers = { "Content-Type": "application/json", "x-looplab-session-token": token };
    const discoveryResponse = await fetch(`${origin}/local-copilot?refresh=1`);
    const discovery = await discoveryResponse.json();
    assert.equal(discoveryResponse.status, 200);
    assert.equal(discovery.localCopilot.ready, true);
    assert.equal(discovery.localCopilot.model, "looplab-fixture-model");
    assert.doesNotMatch(JSON.stringify(discovery), new RegExp(localAccessToken));

    const startOptions = {
      method: "POST",
      headers,
      body: JSON.stringify({ task: "Identify the highest-risk authoring gap.", mode: "identify-risks", sourceDigest: "source-fixture", context: { doctor: { warnings: 1 } } }),
    };
    const startResponses = await Promise.all([
      fetch(`${origin}/local-copilot/jobs`, startOptions),
      fetch(`${origin}/local-copilot/jobs`, startOptions),
    ]);
    assert.deepEqual(startResponses.map((response) => response.status).sort((left, right) => left - right), [202, 409]);
    const startEnvelopes = await Promise.all(startResponses.map((response) => response.json()));
    const started = startEnvelopes.find((value) => value.jobId);
    const rejected = startEnvelopes.find((value) => value.error);
    assert.match(started.jobId, /^[0-9a-f-]{36}$/);
    assert.match(rejected.error, /already starting or running/i);

    const runningResponse = await fetch(`${origin}${started.statusUrl}`, { headers });
    const running = await runningResponse.json();
    assert.equal(running.status, "running");
    assert.equal(running.request.sourceDigest, "source-fixture");

    const protectedShutdown = await fetch(`${origin}/lifecycle/shutdown`, {
      method: "POST",
      headers,
      body: JSON.stringify({ expectedProtocolVersion: "0.0.0" }),
    });
    assert.equal(protectedShutdown.status, 409);

    let terminal = running;
    for (let attempt = 0; attempt < 100 && terminal.status === "running"; attempt += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 25));
      terminal = await (await fetch(`${origin}${started.statusUrl}`, { headers })).json();
    }
    assert.equal(terminal.status, "completed", stderr);
    const eventsText = await (await fetch(`${origin}${started.eventsUrl}`, { headers })).text();
    assert.match(eventsText, /local-copilot\.job\.started/);
    assert.match(eventsText, /local-copilot\.job\.completed/);

    const resultResponse = await fetch(`${origin}${started.resultUrl}`, { headers });
    const resultEnvelope = await resultResponse.json();
    assert.equal(resultResponse.status, 200);
    assert.equal(resultEnvelope.result.schemaVersion, LOOPLAB_LOCAL_COPILOT_ADVICE_SCHEMA);
    assert.equal(resultEnvelope.result.sourceDigest, "source-fixture");
    assert.equal(resultEnvelope.usage.totalTokens, 20);
    assert.equal(resultEnvelope.usage.estimatedUsd, 0);
    assert.equal(resultEnvelope.result.policy.mutatesProject, false);
    assert.doesNotMatch(JSON.stringify(resultEnvelope), new RegExp(localAccessToken));
    assert.equal(inferenceAuthorization, `Bearer ${localAccessToken}`);
    assert.equal(inferenceBody.response_format.json_schema.strict, true);
    assert.equal(Object.hasOwn(inferenceBody, "tools"), false);

    const shutdown = await fetch(`${origin}/lifecycle/shutdown`, {
      method: "POST",
      headers,
      body: JSON.stringify({ expectedProtocolVersion: "0.0.0" }),
    });
    assert.equal(shutdown.status, 202);
    await new Promise((resolveExit) => child.once("exit", resolveExit));
  } finally {
    if (child.exitCode === null) child.kill();
    await new Promise((resolveClose) => localServer.close(resolveClose));
    await rm(directory, { recursive: true, force: true });
  }
});
