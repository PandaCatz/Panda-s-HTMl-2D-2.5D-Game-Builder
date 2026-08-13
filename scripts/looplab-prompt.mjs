#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { LOOPLAB_PROVIDER_PROMPT_MAX_CHARACTERS, promptMaterialSimilarity, validateProviderPromptDraft } from "../lib/looplab-game-director.mjs";
import { buildAnthropicMessagesRequest, requireAnthropicStructuredResult } from "../lib/looplab-anthropic-api.mjs";
import { buildClaudeCliInvocation, inspectClaudeCliOutput, requireClaudeCliStructuredResult } from "../lib/looplab-claude-cli.mjs";
import { buildOpenAiResponsesRequest, requireOpenAiStructuredResult } from "../lib/looplab-openai-request.mjs";
import { requestProviderJson } from "../lib/looplab-provider-http.mjs";
import { assertProviderPayloadPrivacy } from "../lib/looplab-project-privacy.mjs";
import { parseProviderJson, runProviderProcess } from "../lib/looplab-provider-process.mjs";
import { buildCodexCliInvocation, createProviderModelSelectionReceipt } from "../lib/looplab-provider-model-policy.mjs";
import { attachUsageReceipt, createUsageReceipt, usageFromCliOutput, usageReceiptSummary } from "../lib/looplab-provider-usage.mjs";

const argv = process.argv.slice(2);
const PROMPT_TIMEOUT_MS = Number(process.env.LOOPLAB_PROMPT_TIMEOUT_MS ?? process.env.LOOPLAB_PROVIDER_TIMEOUT_MS ?? 0);
const PROVIDER_AUTH_METHOD = process.env.LOOPLAB_PROVIDER_AUTH_METHOD || null;

function option(name, fallback = undefined) {
  const inline = argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : fallback;
}

function emit(type, payload = {}) {
  process.stdout.write(`${JSON.stringify({ type, timestamp: new Date().toISOString(), ...payload })}\n`);
}

const parseAgentJson = (value) => parseProviderJson(value, { invalidMessage: "The AI response did not contain a valid JSON prompt draft." });

const runProcess = (command, args, input, cwd, timeoutMs = PROMPT_TIMEOUT_MS) => runProviderProcess({
  command,
  args,
  input,
  cwd,
  timeoutMs,
  timeoutLabel: "prompt generation",
});

const PROMPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "prompt"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 160 },
    summary: { type: "string", minLength: 1, maxLength: 600 },
    prompt: { type: "string", minLength: 400, maxLength: LOOPLAB_PROVIDER_PROMPT_MAX_CHARACTERS },
  },
};

const DIRECTOR_PROMPT = `You are Looplab's AI Game Director. Generate a substantially different, production-useful build prompt for another AI that will create or improve a 2D HTML game.

Return only one JSON object with exactly title, summary, and prompt.

Rules:
- Preserve input.userPrompt verbatim inside a clearly labeled USER VISION section. Do not summarize, replace, or reinterpret those exact words.
- Preserve every string in input.requiredConstraints verbatim inside a clearly labeled DIRECTED CONSTRAINTS section.
- Use input.basePrompt as the complete requirements baseline, but rewrite and reorganize it into a genuinely different creative and technical direction.
- Make the new prompt materially different from input.currentPrompt. Change the design hypothesis, priorities, structure, and concrete implementation guidance—not just a heading or a few adjectives.
- Keep the user's intent in charge. Add a concrete verb architecture, game loop, map flow, art direction, character/sprite direction, collision/anchor/depth rules, feedback, progression, accessibility, browser QA, and one-file HTML release criteria when relevant.
- If input.context.preferenceContext is present, use only its listed explicit, context-matched entries as soft guidance. The current USER VISION, directed constraints, and explicit style locks override it. Do not infer unrecorded taste, turn a prior pairwise choice into a universal rule, or expose preference provenance as game content.
- Do not choose a target mechanic count or require an all-pairs score matrix. Start from recurring player decisions; one deep verb is valid, and every additional verb must earn its input, attention, onboarding, implementation, and feedback cost.
- Author verbArchitecture version 2. For every active verb, record purpose, role, activation, standalone/dependency truth, semantic input, affordances, state changes, feedback, stable runtime IDs, and executable test IDs. Give meaningful relationships an operator and cadence, then exercise independent uses and recurring relationships across teaching/practice and pressure/mastery/recovery applications instead of one finale. Model the decide-act-feedback core loop and any resource sources, sinks, pressure, and recovery. A prose test record is a specification, not proof.
- Require a deterministic gameplay program for nontrivial mechanics: typed variables plus input, event, overlap, or state-triggered rules whose effects execute identically in preview, replay, and the exported offline HTML. Feature-contract prose is not a runtime implementation ID.
- If input.context reports a neutral starter, require its sample character, paths, markers, goal, genre, and setting to be replaced or deliberately repurposed; useful geometry is not permission to inherit an unrelated game's semantics.
- Treat generated art as visual input only. Authored map geometry remains the sole collision owner.
- Do not claim that code, art, research, playtests, Project Doctor checks, or exports have already run.
- Do not include API keys, secrets, local credential paths, or instructions to bypass Looplab's provider boundary.
- The prompt must be complete enough to send directly to the selected game-building provider.
- Target 8,000–14,000 characters and never exceed ${LOOPLAB_PROVIDER_PROMPT_MAX_CHARACTERS.toLocaleString("en-US")} characters. Prefer compact tables, stable IDs, measurable gates, and references to shared LoopLab contracts over repetitive prose.`;

async function invokeProvider(provider, input, schemaPath, responsePath, responseFixturePath) {
  if (provider === "file") {
    if (!responseFixturePath) throw new Error("The file provider requires --response.");
    return { value: parseAgentJson(await readFile(responseFixturePath, "utf8")), model: "fixture", receipt: createUsageReceipt({ provider: "file", model: "fixture", usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 }, source: "fixture" }) };
  }
  assertProviderPayloadPrivacy({ instructions: DIRECTOR_PROMPT, request: input }, {
    label: "prompt-drafting provider payload",
    sourceDigest: input?.context?.sourceDigest ?? input?.sourceDigest ?? null,
  });
  const serializedInput = JSON.stringify(input);
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured for the Looplab companion.");
    const model = process.env.LOOPLAB_OPENAI_MODEL ?? "gpt-5.2";
    try {
      const { value: body } = await requestProviderJson({
        provider: "OpenAI",
        url: "https://api.openai.com/v1/responses",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: buildOpenAiResponsesRequest({
          model,
          purpose: "prompt-draft",
          developerPrompt: DIRECTOR_PROMPT,
          userInput: serializedInput,
          schema: PROMPT_SCHEMA,
          schemaName: "looplab_prompt_draft",
          strict: true,
        }),
        timeoutMs: PROMPT_TIMEOUT_MS,
        onRetry: (detail) => emit("provider.http.retrying", detail),
      });
      const receipt = createUsageReceipt({ provider, model: body.model ?? model, usage: body.usage, source: "openai-responses-api" });
      try {
        return { value: requireOpenAiStructuredResult(body, "prompt output"), model, receipt };
      } catch (error) {
        throw attachUsageReceipt(error, receipt);
      }
    } catch (error) {
      const body = error?.providerResponse ?? error?.responseBody;
      if (body?.usage && !error?.usageReceipt) throw attachUsageReceipt(error, createUsageReceipt({ provider, model: body.model ?? model, usage: body.usage, source: "openai-responses-api" }));
      throw error;
    }
  }
  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured for the Looplab companion.");
    const model = process.env.LOOPLAB_ANTHROPIC_MODEL ?? "claude-sonnet-5";
    try {
      const { value: body } = await requestProviderJson({
        provider: "Anthropic",
        url: "https://api.anthropic.com/v1/messages",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: buildAnthropicMessagesRequest({ model, maxTokens: 10_000, system: DIRECTOR_PROMPT, userInput: serializedInput, schema: PROMPT_SCHEMA }),
        timeoutMs: PROMPT_TIMEOUT_MS,
        onRetry: (detail) => emit("provider.http.retrying", detail),
      });
      const receipt = createUsageReceipt({ provider, model: body.model ?? model, usage: body.usage, source: "anthropic-messages-api-structured" });
      try {
        return { value: requireAnthropicStructuredResult(body, "prompt output"), model, receipt };
      } catch (error) {
        throw attachUsageReceipt(error, receipt);
      }
    } catch (error) {
      const body = error?.providerResponse ?? error?.responseBody;
      if (body?.usage && !error?.usageReceipt) throw attachUsageReceipt(error, createUsageReceipt({ provider, model: body.model ?? model, usage: body.usage, source: "anthropic-messages-api-structured" }));
      throw error;
    }
  }
  if (provider === "codex") {
    const invocation = buildCodexCliInvocation(["exec", "--json", "--skip-git-repo-check", "--ephemeral", "--output-schema", schemaPath, "-o", responsePath, DIRECTOR_PROMPT], { purpose: "prompt-draft" });
    const result = await runProcess("codex", invocation.args, serializedInput, dirname(responsePath));
    const responseText = await readFile(responsePath, "utf8").catch(() => result.stdout);
    const measured = usageFromCliOutput(result.stdout, result.stderr);
    const model = measured.model ?? invocation.modelPolicy.model;
    return { value: parseAgentJson(responseText), model, receipt: createUsageReceipt({ provider, model, usage: measured.usage, source: "codex-cli-jsonl", authMethod: PROVIDER_AUTH_METHOD, modelSelection: createProviderModelSelectionReceipt(invocation.modelPolicy, { providerReportedModel: measured.model }) }) };
  }
  if (provider === "claude") {
    const invocation = buildClaudeCliInvocation({
      prompt: DIRECTOR_PROMPT,
      schema: PROMPT_SCHEMA,
      maxTurns: 2,
      tools: [],
      purpose: "prompt-draft",
      maxBudgetUsd: process.env.LOOPLAB_CLAUDE_MAX_BUDGET_USD,
    });
    try {
      const result = await runProcess("claude", invocation.args, serializedInput, dirname(responsePath));
      const structured = requireClaudeCliStructuredResult(result.stdout);
      const measured = usageFromCliOutput(result.stdout, result.stderr);
      const model = structured.model ?? measured.model ?? invocation.modelPolicy.model;
      return {
        value: structured.structuredOutput,
        model,
        receipt: createUsageReceipt({ provider, model, usage: structured.usage ?? measured.usage, source: "claude-code-cli-stream-json", providerReportedUsd: structured.providerReportedUsd, authMethod: PROVIDER_AUTH_METHOD, modelSelection: createProviderModelSelectionReceipt(invocation.modelPolicy, { providerReportedModel: structured.model ?? measured.model }) }),
      };
    } catch (error) {
      const telemetry = error?.claudeTelemetry ?? inspectClaudeCliOutput(error?.processResult?.stdout);
      const measured = usageFromCliOutput(error?.processResult?.stdout, error?.processResult?.stderr);
      const model = telemetry.model ?? measured.model ?? invocation.modelPolicy.model;
      if (error && typeof error === "object") error.usageReceipt = createUsageReceipt({ provider, model, usage: telemetry.usage ?? measured.usage, source: "claude-code-cli-stream-json", providerReportedUsd: telemetry.providerReportedUsd, authMethod: PROVIDER_AUTH_METHOD, modelSelection: createProviderModelSelectionReceipt(invocation.modelPolicy, { providerReportedModel: telemetry.model ?? measured.model }) });
      throw error;
    }
  }
  throw new Error(`Unknown provider: ${provider}.`);
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function main() {
  const provider = option("--provider");
  const inputPath = option("--input");
  const outputPath = option("--output");
  const responseFixturePath = option("--response");
  if (!provider || !inputPath || !outputPath) throw new Error("looplab-prompt requires --provider, --input, and --output.");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const schemaPath = join(dirname(outputPath), "looplab-prompt-schema.json");
  const providerResponsePath = join(dirname(outputPath), "looplab-provider-prompt.json");
  await writeFile(schemaPath, `${JSON.stringify(PROMPT_SCHEMA, null, 2)}\n`, "utf8");
  const privacyPreflight = provider === "file" ? null : assertProviderPayloadPrivacy({ instructions: DIRECTOR_PROMPT, request: input }, {
    label: "prompt-drafting provider payload",
    sourceDigest: input?.context?.sourceDigest ?? input?.sourceDigest ?? null,
  });
  if (privacyPreflight) emit("prompt.privacy.checked", { reportDigest: privacyPreflight.digest, status: privacyPreflight.status, findingCount: privacyPreflight.findingCount });
  emit("prompt.provider.requested", { provider, attempt: Number(input.attempt ?? 1) });
  const response = await invokeProvider(provider, input, schemaPath, providerResponsePath, responseFixturePath);
  const errors = validateProviderPromptDraft(response.value, {
    userPrompt: input.userPrompt,
    basePrompt: input.basePrompt,
    comparisonPrompt: input.currentPrompt,
    requiredConstraints: input.requiredConstraints,
  });
  if (errors.length) throw new Error(errors.join(" "));
  const prompt = response.value.prompt.trim();
  const output = {
    provider,
    model: response.model,
    generatedAt: new Date().toISOString(),
    title: response.value.title.trim().slice(0, 160),
    summary: response.value.summary.trim().slice(0, 600),
    prompt,
    similarityToPrevious: Number(promptMaterialSimilarity(prompt, input.currentPrompt).toFixed(4)),
    usage: response.receipt,
  };
  await writeJsonAtomic(outputPath, output);
  emit("prompt.provider.completed", { provider, model: response.model, characters: prompt.length, similarityToPrevious: output.similarityToPrevious, receipt: response.receipt, message: usageReceiptSummary(response.receipt, "Prompt run usage") });
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ type: "prompt.provider.failed", error: error instanceof Error ? error.message : String(error), ...(error?.usageReceipt ? { receipt: error.usageReceipt, message: usageReceiptSummary(error.usageReceipt, "Failed prompt run usage") } : {}) })}\n`);
  process.exitCode = 1;
});
