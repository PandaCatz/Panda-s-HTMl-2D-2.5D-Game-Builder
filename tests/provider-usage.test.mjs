import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  aggregateUsageReceipts,
  attachUsageReceipt,
  createUsageReceipt,
  readCodexConfiguredModel,
  usageFromCliOutput,
  usageReceiptSummary,
} from "../lib/looplab-provider-usage.mjs";

test("OpenAI receipts separate cached input and do not double-bill reasoning tokens", () => {
  const receipt = createUsageReceipt({
    provider: "openai",
    model: "gpt-5.6-sol",
    source: "test",
    usage: {
      input_tokens: 1_000,
      input_tokens_details: { cached_tokens: 400 },
      output_tokens: 200,
      output_tokens_details: { reasoning_tokens: 50 },
      total_tokens: 1_200,
    },
  });

  assert.equal(receipt.inputTokens, 1_000);
  assert.equal(receipt.cachedInputTokens, 400);
  assert.equal(receipt.outputTokens, 200);
  assert.equal(receipt.reasoningTokens, 50);
  assert.equal(receipt.totalTokens, 1_200);
  assert.equal(receipt.estimatedUsd, 0.0092);
  assert.equal(receipt.pricing.canonicalModel, "gpt-5.6-sol");
  assert.match(receipt.note, /separate tool-call/i);
});

test("Codex JSONL usage becomes a subscription receipt with an API-rate equivalent", () => {
  const stdout = [
    JSON.stringify({ type: "thread.started", model: "gpt-5.6-sol" }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 2_500, cached_input_tokens: 1_000, cache_write_input_tokens: 200, output_tokens: 300, reasoning_output_tokens: 120 } }),
  ].join("\n");
  const parsed = usageFromCliOutput(stdout);
  const receipt = createUsageReceipt({ provider: "codex", model: parsed.model, usage: parsed.usage, source: "codex-cli-jsonl", authMethod: "ChatGPT" });

  assert.equal(parsed.model, "gpt-5.6-sol");
  assert.equal(receipt.totalTokens, 2_800);
  assert.equal(receipt.promptTokens, 2_500);
  assert.equal(receipt.cacheWriteTokens, 200);
  assert.equal(receipt.reasoningTokens, 120);
  assert.equal(receipt.billingMode, "subscription");
  assert.equal(receipt.estimateKind, "api-rate-equivalent");
  assert.equal(receipt.estimatedUsd, 0.01725);
  assert.match(receipt.note, /not an additional CLI charge/i);
});

test("Claude cache reads and writes count toward comparable prompt and total tokens", () => {
  const receipt = createUsageReceipt({
    provider: "claude",
    model: "claude-sonnet-5",
    source: "claude-code-cli-stream-json",
    authMethod: "API key",
    usage: {
      input_tokens: 120,
      cache_read_input_tokens: 20,
      cache_creation_input_tokens: 10,
      output_tokens: 30,
    },
  });

  assert.equal(receipt.inputTokens, 120);
  assert.equal(receipt.promptTokens, 150);
  assert.equal(receipt.totalTokens, 180);
  assert.equal(receipt.billingMode, "api");
  assert.equal(receipt.authMethod, "API key");
  assert.doesNotMatch(receipt.note, /subscription run/i);
});

test("CLI API-key authentication is never mislabeled as subscription billing", () => {
  const receipt = createUsageReceipt({
    provider: "codex",
    model: "gpt-5.6-sol",
    authMethod: "API key",
    usage: { input_tokens: 1_000, output_tokens: 100 },
  });
  assert.equal(receipt.billingMode, "api");
  assert.equal(receipt.estimateKind, "standard-api-rate-estimate");
  assert.match(receipt.note, /standard API rates/i);
  assert.doesNotMatch(receipt.note, /not an additional CLI charge/i);
});

test("loop totals include every attempt and expose partial pricing honestly", () => {
  const priced = createUsageReceipt({ provider: "codex", model: "gpt-5.6-sol", usage: { input_tokens: 1_000, output_tokens: 100 } });
  const unpriced = createUsageReceipt({ provider: "claude", model: "unknown-claude", usage: { input_tokens: 800, output_tokens: 200 } });
  const total = aggregateUsageReceipts([{ ...priced, accepted: false }, { ...unpriced, accepted: true }], { label: "loop-total" });

  assert.equal(total.runCount, 2);
  assert.equal(total.totalTokens, 2_100);
  assert.equal(total.inputTokens, 1_800);
  assert.equal(total.promptTokens, 1_800);
  assert.equal(total.outputTokens, 300);
  assert.equal(total.pricedRuns, 1);
  assert.equal(total.unpricedRuns, 1);
  assert.equal(total.estimateKind, "partial-aggregate");
  assert.match(usageReceiptSummary(total, "Loop total"), /2,100 tokens across 2 runs/);
});

test("unknown model pricing stays null instead of inventing a dollar amount", () => {
  const receipt = createUsageReceipt({ provider: "openai", model: "future-model", usage: { input_tokens: 10, output_tokens: 10 } });
  assert.equal(receipt.measured, true);
  assert.equal(receipt.estimatedUsd, null);
  assert.equal(receipt.estimateKind, "unavailable");
});

test("post-response provider failures retain their measured usage receipt", () => {
  const receipt = createUsageReceipt({ provider: "openai", model: "gpt-5.2", usage: { input_tokens: 100, output_tokens: 20 } });
  const error = attachUsageReceipt(new Error("structured output was incomplete"), receipt);
  assert.equal(error.usageReceipt.totalTokens, 120);
  assert.equal(error.usageReceipt.billingMode, "api");
});

test("configured Codex model can be read without loading credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-codex-model-"));
  await mkdir(join(directory, "codex"), { recursive: true });
  await writeFile(join(directory, "codex", "config.toml"), 'model = "gpt-5.6-sol"\nmodel_reasoning_effort = "max"\n', "utf8");
  assert.equal(await readCodexConfiguredModel({ env: { CODEX_HOME: join(directory, "codex") }, homeDirectory: directory }), "gpt-5.6-sol");
});
