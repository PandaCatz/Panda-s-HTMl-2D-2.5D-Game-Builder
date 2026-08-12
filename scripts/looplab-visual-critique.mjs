#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildAnthropicMessagesRequest, requireAnthropicStructuredResult } from "../lib/looplab-anthropic-api.mjs";
import { buildClaudeCliArgs, inspectClaudeCliOutput, requireClaudeCliStructuredResult } from "../lib/looplab-claude-cli.mjs";
import { buildOpenAiResponsesRequest, requireOpenAiStructuredResult } from "../lib/looplab-openai-request.mjs";
import { requestProviderJson } from "../lib/looplab-provider-http.mjs";
import { parseProviderJson, runProviderProcess } from "../lib/looplab-provider-process.mjs";
import { attachUsageReceipt, createUsageReceipt, readCodexConfiguredModel, usageFromCliOutput, usageReceiptSummary } from "../lib/looplab-provider-usage.mjs";
import {
  decodeVisualCritiqueCaptureDataUrl,
  normalizeVisualCritiqueProviderOutput,
  normalizeVisualCritiqueRequest,
  visualCritiqueProviderContext,
} from "../lib/looplab-visual-critique.mjs";

const args = process.argv.slice(2);
const PROVIDER_AUTH_METHOD = process.env.LOOPLAB_PROVIDER_AUTH_METHOD || null;
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
};
const emit = (type, detail = {}) => process.stdout.write(`${JSON.stringify({ type, ...detail })}\n`);

const SYSTEM_PROMPT = `You are LoopLab Visual Critic, an evidence-grounded reviewer of exact 2D and sprite-based 2.5D HTML game captures.

First describe only what is visibly present in every capture and where it appears. Then evaluate the required dimensions. Tie every evaluation, strength, and issue to exact capture IDs. Do not infer collision, controls, deterministic behavior, implementation quality, or off-screen content from pixels. Do not call a game verified, release-ready, fun, original, or aesthetically approved. Do not select an automatic winner.

Prioritize gameplay readability, visual hierarchy, consistent art direction, character/environment fit, depth legibility, HUD obstruction, and alignment with the supplied brief. Suggested changes must be concrete enough for an agent or user to implement while remaining advisory. Always state limitations. Return only the schema-bound JSON object.`;

function providerImageContent(request, provider) {
  const context = visualCritiqueProviderContext(request);
  if (provider === "openai") {
    return [
      { type: "input_text", text: context },
      ...request.captures.flatMap((capture) => [
        { type: "input_text", text: `CAPTURE ${capture.id} — ${capture.mapName} / ${capture.profileName}` },
        { type: "input_image", image_url: capture.dataUrl, detail: "high" },
      ]),
    ];
  }
  return [
    { type: "text", text: context },
    ...request.captures.flatMap((capture) => {
      const decoded = decodeVisualCritiqueCaptureDataUrl(capture.dataUrl);
      return [
        { type: "text", text: `CAPTURE ${capture.id} — ${capture.mapName} / ${capture.profileName}` },
        { type: "image", source: { type: "base64", media_type: decoded.mimeType, data: decoded.encoded } },
      ];
    }),
  ];
}

async function materializeCaptureFiles(request, directory) {
  const extension = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };
  const files = [];
  for (let index = 0; index < request.captures.length; index += 1) {
    const capture = request.captures[index];
    const decoded = decodeVisualCritiqueCaptureDataUrl(capture.dataUrl);
    const file = join(directory, `capture-${String(index + 1).padStart(2, "0")}${extension[decoded.mimeType]}`);
    await writeFile(file, decoded.bytes);
    files.push({ captureId: capture.id, file, filename: file.slice(directory.length + 1) });
  }
  return files;
}

async function invokeProvider({ provider, request, schema, schemaPath, responseFile, responsePath, cwd }) {
  if (provider === "file") {
    if (!responsePath) throw new Error("The file visual-critique provider requires --response.");
    return { output: JSON.parse(await readFile(resolve(responsePath), "utf8")), model: "fixture", receipt: createUsageReceipt({ provider: "file", model: "fixture", usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 }, source: "fixture" }) };
  }
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured for visual critique.");
    const model = process.env.LOOPLAB_OPENAI_VISION_MODEL ?? process.env.LOOPLAB_OPENAI_MODEL ?? "gpt-5.2";
    try {
      const { value } = await requestProviderJson({
        provider: "OpenAI",
        url: "https://api.openai.com/v1/responses",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: buildOpenAiResponsesRequest({ model, purpose: "visual-critique", developerPrompt: SYSTEM_PROMPT, userContent: providerImageContent(request, "openai"), schema, schemaName: "looplab_visual_critique", strict: true }),
        onRetry: (detail) => emit("provider.http.retrying", detail),
      });
      const receipt = createUsageReceipt({ provider, model: value.model ?? model, usage: value.usage, source: "openai-responses-api", authMethod: PROVIDER_AUTH_METHOD });
      try { return { output: requireOpenAiStructuredResult(value, "visual critique"), model: value.model ?? model, receipt }; }
      catch (error) { throw attachUsageReceipt(error, receipt); }
    } catch (error) {
      const value = error?.providerResponse ?? error?.responseBody;
      if (value?.usage && !error?.usageReceipt) throw attachUsageReceipt(error, createUsageReceipt({ provider, model: value.model ?? model, usage: value.usage, source: "openai-responses-api", authMethod: PROVIDER_AUTH_METHOD }));
      throw error;
    }
  }
  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured for visual critique.");
    const model = process.env.LOOPLAB_ANTHROPIC_VISION_MODEL ?? process.env.LOOPLAB_ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
    try {
      const { value } = await requestProviderJson({
        provider: "Anthropic",
        url: "https://api.anthropic.com/v1/messages",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: buildAnthropicMessagesRequest({ model, maxTokens: 10_000, system: SYSTEM_PROMPT, userInput: providerImageContent(request, "anthropic"), schema }),
        onRetry: (detail) => emit("provider.http.retrying", detail),
      });
      const receipt = createUsageReceipt({ provider, model: value.model ?? model, usage: value.usage, source: "anthropic-messages-api", authMethod: PROVIDER_AUTH_METHOD });
      try { return { output: requireAnthropicStructuredResult(value, "visual critique"), model: value.model ?? model, receipt }; }
      catch (error) { throw attachUsageReceipt(error, receipt); }
    } catch (error) {
      const value = error?.providerResponse ?? error?.responseBody;
      if (value?.usage && !error?.usageReceipt) throw attachUsageReceipt(error, createUsageReceipt({ provider, model: value.model ?? model, usage: value.usage, source: "anthropic-messages-api", authMethod: PROVIDER_AUTH_METHOD }));
      throw error;
    }
  }

  const captureFiles = await materializeCaptureFiles(request, cwd);
  const fileIndex = captureFiles.map((entry) => `${entry.captureId}: ${entry.filename}`).join("\n");
  const prompt = `${SYSTEM_PROMPT}\n\nRead these exact local image files before returning the critique:\n${fileIndex}\n\nCAPTURE METADATA:\n${visualCritiqueProviderContext(request)}`;
  if (provider === "codex") {
    const imageArgs = captureFiles.flatMap((entry) => ["-i", entry.file]);
    const result = await runProviderProcess({
      command: "codex",
      args: ["exec", "--json", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", "--output-schema", schemaPath, "-o", responseFile, ...imageArgs, prompt],
      cwd,
      timeoutLabel: "visual critique",
    });
    const responseText = await readFile(responseFile, "utf8").catch(() => result.stdout);
    const measured = usageFromCliOutput(result.stdout, result.stderr);
    const model = measured.model ?? process.env.LOOPLAB_CODEX_MODEL ?? await readCodexConfiguredModel() ?? "codex-cli";
    return { output: parseProviderJson(responseText, { emptyMessage: "Codex returned no visual critique.", invalidMessage: "Codex returned invalid visual-critique JSON." }), model, receipt: createUsageReceipt({ provider, model, usage: measured.usage, source: "codex-cli-jsonl", authMethod: PROVIDER_AUTH_METHOD }) };
  }
  if (provider === "claude") {
    try {
      const result = await runProviderProcess({
        command: "claude",
        args: buildClaudeCliArgs({ prompt, schema, maxTurns: 4, tools: ["Read"], model: process.env.LOOPLAB_CLAUDE_VISION_MODEL ?? process.env.LOOPLAB_CLAUDE_MODEL, effort: process.env.LOOPLAB_CLAUDE_EFFORT, maxBudgetUsd: process.env.LOOPLAB_CLAUDE_MAX_BUDGET_USD }),
        input: visualCritiqueProviderContext(request),
        cwd,
        timeoutLabel: "visual critique",
      });
      const structured = requireClaudeCliStructuredResult(result.stdout);
      const measured = usageFromCliOutput(result.stdout, result.stderr);
      const model = structured.model ?? measured.model ?? process.env.LOOPLAB_CLAUDE_VISION_MODEL ?? process.env.LOOPLAB_CLAUDE_MODEL ?? "claude-code-cli";
      return { output: structured.structuredOutput, model, receipt: createUsageReceipt({ provider, model, usage: structured.usage ?? measured.usage, source: "claude-code-cli-stream-json", providerReportedUsd: structured.providerReportedUsd, authMethod: PROVIDER_AUTH_METHOD }) };
    } catch (error) {
      const telemetry = error?.claudeTelemetry ?? inspectClaudeCliOutput(error?.processResult?.stdout);
      const measured = usageFromCliOutput(error?.processResult?.stdout, error?.processResult?.stderr);
      const model = telemetry.model ?? measured.model ?? process.env.LOOPLAB_CLAUDE_VISION_MODEL ?? process.env.LOOPLAB_CLAUDE_MODEL ?? "claude-code-cli";
      if (error && typeof error === "object") error.usageReceipt = createUsageReceipt({ provider, model, usage: telemetry.usage ?? measured.usage, source: "claude-code-cli-stream-json", providerReportedUsd: telemetry.providerReportedUsd, authMethod: PROVIDER_AUTH_METHOD });
      throw error;
    }
  }
  throw new Error(`Unknown visual-critique provider: ${provider}.`);
}

async function main() {
  const provider = option("--provider");
  const inputPath = resolve(option("--input") ?? "");
  const outputPath = resolve(option("--output") ?? "");
  const responsePath = option("--response");
  if (!provider || !inputPath || !outputPath) throw new Error("--provider, --input, and --output are required.");
  const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "agent", "visual-critique-schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const request = normalizeVisualCritiqueRequest(JSON.parse(await readFile(inputPath, "utf8")));
  emit("visual-critique.started", { provider, sourceDigest: request.sourceDigest, captureSetDigest: request.captureSetDigest, captureCount: request.captures.length, message: `Submitting ${request.captures.length} consented capture(s) for grounded visual critique` });
  const responseFile = join(dirname(outputPath), "provider-visual-critique-response.json");
  const invoked = await invokeProvider({ provider, request, schema, schemaPath, responseFile, responsePath, cwd: dirname(inputPath) });
  emit("visual-critique.validating", { message: "Validating capture references, dimensions, authority boundaries, and byte-free result" });
  const result = normalizeVisualCritiqueProviderOutput(invoked.output, { request, provider, model: invoked.model, usage: invoked.receipt });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  emit("visual-critique.usage.completed", { message: usageReceiptSummary(invoked.receipt, "Visual critique usage"), receipt: invoked.receipt });
  emit("visual-critique.completed", { sourceDigest: result.sourceDigest, captureSetDigest: result.captureSetDigest, critiqueDigest: result.critiqueDigest, issueCount: result.issues.length, resultAvailable: true, receipt: invoked.receipt, message: "Grounded advisory visual critique is ready" });
}

main().catch((error) => {
  emit("visual-critique.failed", { error: error instanceof Error ? error.message : String(error), ...(error?.usageReceipt ? { receipt: error.usageReceipt, message: usageReceiptSummary(error.usageReceipt, "Failed visual critique usage") } : {}) });
  process.exitCode = 1;
});
