#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenAiResponsesRequest, requireOpenAiStructuredResult } from "../lib/looplab-openai-request.mjs";
import { isUnsupportedCodexSearchOption, requestProviderJson } from "../lib/looplab-provider-http.mjs";
import { parseProviderJson, runProviderProcess } from "../lib/looplab-provider-process.mjs";
import { buildClaudeCliArgs, inspectClaudeCliOutput, requireClaudeCliStructuredResult } from "../lib/looplab-claude-cli.mjs";
import { attachUsageReceipt, createUsageReceipt, readCodexConfiguredModel, usageFromCliOutput, usageReceiptSummary } from "../lib/looplab-provider-usage.mjs";

const args = process.argv.slice(2);
const PROVIDER_AUTH_METHOD = process.env.LOOPLAB_PROVIDER_AUTH_METHOD || null;
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
};
const emit = (type, detail = {}) => process.stdout.write(`${JSON.stringify({ type, ...detail })}\n`);
const clampText = (value, max = 5000) => String(value ?? "").trim().slice(0, max);
const confidence = (value) => ["high", "medium", "low"].includes(value) ? value : "medium";

const parseAgentJson = (value) => parseProviderJson(value, {
  emptyMessage: "The research provider returned no report.",
  invalidMessage: "The research provider did not return valid JSON.",
});

const runProcess = (command, processArgs, input, cwd, timeoutMs) => runProviderProcess({
  command,
  args: processArgs,
  input,
  cwd,
  timeoutMs,
  timeoutLabel: "research request",
});

function safeSource(source, fallbackId) {
  try {
    const url = new URL(String(source?.url ?? ""));
    if (!new Set(["http:", "https:"]).has(url.protocol)) return null;
    return {
      id: clampText(source?.id || fallbackId, 80),
      title: clampText(source?.title || url.hostname, 300),
      url: url.toString(),
      publisher: clampText(source?.publisher || url.hostname.replace(/^www\./, ""), 180),
      publishedAt: source?.publishedAt ? clampText(source.publishedAt, 80) : null,
    };
  } catch {
    return null;
  }
}

function openAiSources(value) {
  const found = [];
  for (const item of value?.output ?? []) {
    for (const source of item?.action?.sources ?? []) found.push(source);
    for (const content of item?.content ?? []) {
      for (const annotation of content?.annotations ?? []) {
        const citation = annotation?.url_citation ?? annotation;
        if (citation?.url) found.push(citation);
      }
    }
  }
  return found;
}

const DEPTH_RULES = {
  quick: { hops: "one focused search hop", maxUses: 3, context: "low", turns: 2 },
  standard: { hops: "two to three search and validation hops", maxUses: 6, context: "medium", turns: 4 },
  deep: { hops: "three to four search and verification hops", maxUses: 10, context: "high", turns: 6 },
  exhaustive: { hops: "up to five search, contradiction, and gap-resolution hops", maxUses: 15, context: "high", turns: 8 },
};

const ENGINE_RULES = {
  "source-command-sc-research": "Use the SuperClaude research workflow: understand, decompose, parallelize independent searches, follow multi-hop evidence chains, track confidence, resolve contradictions, validate coverage, and stop at a research report.",
  "game-studio": "Use the Game Studio plugin lens: prioritize browser-game mechanics, player experience, visual direction, implementation fit, and recommendations that could be evaluated in a real playtest.",
  "web-game-foundations": "Use the Web Game Foundations plugin-skill lens: prioritize simulation/render separation, input architecture, assets, saves, debugging, accessibility, performance budgets, and browser/runtime constraints.",
  "openai-docs": "Use an official-technical-docs workflow: prefer primary specifications, standards bodies, engine documentation, and official vendor docs. Avoid secondary claims when a primary source exists.",
  "provider-native": "Use the selected provider's native web research directly: answer the focused question efficiently, while retaining citations, uncertainty, and the report-only boundary.",
};

const RESEARCH_PROMPT = `You are Looplab Research Desk, an evidence-first research agent for 2D HTML game design.

Follow this workflow: understand the question and success criteria; plan independent searches; execute searches in parallel when possible; follow necessary evidence chains; track sources and confidence; validate claims, contradictions, and gaps; then produce a research report only.

CRITICAL BOUNDARY: do not modify code, project data, maps, assets, or architecture. Do not claim that a suggestion has been implemented. Your output is research and optional recommendations for a human to choose.

Use current web research. Prefer primary sources, official documentation, developer postmortems, research papers, platform-holder accessibility guidance, and direct game documentation. Avoid unsupported listicles. Every finding and suggestion must cite one or more source IDs that exist in sources. State uncertainty rather than inventing evidence.

Return only one JSON object matching the supplied schema. Suggestions must include a concise promptAddition that can be explicitly added to a later Looplab game-generation brief.`;

async function invokeProvider({ provider, input, schema, schemaPath, responseFile, responsePath, cwd }) {
  const payload = JSON.stringify(input);
  const providerPrompt = `${RESEARCH_PROMPT}\n\nSELECTED RESEARCH SKILL / PLUGIN:\n${input.engine}\n${input.engineRule}`;
  if (provider === "file") {
    if (!responsePath) throw new Error("The file research provider requires --response.");
    return { report: JSON.parse(await readFile(resolve(responsePath), "utf8")), sources: [], receipt: createUsageReceipt({ provider: "file", model: "fixture", usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 }, source: "fixture" }) };
  }
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured for research.");
    const model = process.env.LOOPLAB_OPENAI_RESEARCH_MODEL ?? process.env.LOOPLAB_OPENAI_MODEL ?? "gpt-5.2";
    try {
      const { value } = await requestProviderJson({
        provider: "OpenAI",
        url: "https://api.openai.com/v1/responses",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: buildOpenAiResponsesRequest({ model, purpose: `research-${input.engine}`, developerPrompt: providerPrompt, userInput: payload, schema, schemaName: "looplab_research", strict: true, tools: [{ type: "web_search" }] }),
        onRetry: (detail) => emit("provider.http.retrying", detail),
      });
      const receipt = createUsageReceipt({ provider, model: value.model ?? model, usage: value.usage, source: "openai-responses-api" });
      try {
        return { report: requireOpenAiStructuredResult(value, "research report"), sources: openAiSources(value), receipt };
      } catch (error) {
        throw attachUsageReceipt(error, receipt);
      }
    } catch (error) {
      const value = error?.providerResponse ?? error?.responseBody;
      if (value?.usage && !error?.usageReceipt) throw attachUsageReceipt(error, createUsageReceipt({ provider, model: value.model ?? model, usage: value.usage, source: "openai-responses-api" }));
      throw error;
    }
  }
  if (provider === "anthropic") {
    throw new Error("Anthropic API research is disabled because cited web-search output cannot be combined safely with schema-constrained JSON. Select Claude Code CLI for subscription-backed, schema-bound research.");
  }
  if (provider === "codex") {
    let result;
    try {
      result = await runProcess("codex", ["--search", "exec", "--json", "--skip-git-repo-check", "--ephemeral", "--output-schema", schemaPath, "-o", responseFile, providerPrompt], payload, cwd);
    } catch (error) {
      if (!isUnsupportedCodexSearchOption(error)) throw error;
      emit("research.search-fallback", { message: "Codex --search was unavailable; retrying with the installed agent toolset.", detail: error.message });
      result = await runProcess("codex", ["exec", "--json", "--skip-git-repo-check", "--ephemeral", "--output-schema", schemaPath, "-o", responseFile, providerPrompt], payload, cwd);
    }
    const responseText = await readFile(responseFile, "utf8").catch(() => result.stdout);
    const measured = usageFromCliOutput(result.stdout, result.stderr);
    const model = measured.model ?? process.env.LOOPLAB_CODEX_MODEL ?? await readCodexConfiguredModel() ?? "codex-cli";
    return { report: parseAgentJson(responseText), sources: [], receipt: createUsageReceipt({ provider, model, usage: measured.usage, source: "codex-cli-jsonl", authMethod: PROVIDER_AUTH_METHOD }) };
  }
  if (provider === "claude") {
    try {
      const result = await runProcess("claude", buildClaudeCliArgs({
        prompt: providerPrompt,
        schema,
        maxTurns: DEPTH_RULES[input.depth].turns,
        tools: ["WebSearch", "WebFetch"],
        model: process.env.LOOPLAB_CLAUDE_RESEARCH_MODEL ?? process.env.LOOPLAB_CLAUDE_MODEL,
        effort: process.env.LOOPLAB_CLAUDE_EFFORT,
        maxBudgetUsd: process.env.LOOPLAB_CLAUDE_MAX_BUDGET_USD,
      }), payload, cwd);
      const structured = requireClaudeCliStructuredResult(result.stdout);
      const measured = usageFromCliOutput(result.stdout, result.stderr);
      const model = structured.model ?? measured.model ?? process.env.LOOPLAB_CLAUDE_RESEARCH_MODEL ?? process.env.LOOPLAB_CLAUDE_MODEL ?? "claude-code-cli";
      return {
        report: structured.structuredOutput,
        sources: [],
        receipt: createUsageReceipt({ provider, model, usage: structured.usage ?? measured.usage, source: "claude-code-cli-stream-json", providerReportedUsd: structured.providerReportedUsd, authMethod: PROVIDER_AUTH_METHOD }),
      };
    } catch (error) {
      const telemetry = error?.claudeTelemetry ?? inspectClaudeCliOutput(error?.processResult?.stdout);
      const measured = usageFromCliOutput(error?.processResult?.stdout, error?.processResult?.stderr);
      const model = telemetry.model ?? measured.model ?? process.env.LOOPLAB_CLAUDE_RESEARCH_MODEL ?? process.env.LOOPLAB_CLAUDE_MODEL ?? "claude-code-cli";
      if (error && typeof error === "object") error.usageReceipt = createUsageReceipt({ provider, model, usage: telemetry.usage ?? measured.usage, source: "claude-code-cli-stream-json", providerReportedUsd: telemetry.providerReportedUsd, authMethod: PROVIDER_AUTH_METHOD });
      throw error;
    }
  }
  throw new Error(`Unknown research provider: ${provider}.`);
}

function normalizeReport(raw, discoveredSources, metadata) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Research report must be an object.");
  const merged = [...(Array.isArray(raw.sources) ? raw.sources : []), ...discoveredSources];
  const sources = [];
  const byUrl = new Map();
  const aliases = new Map();
  for (const source of merged) {
    const normalized = safeSource(source, `source-${sources.length + 1}`);
    if (!normalized) continue;
    const existing = byUrl.get(normalized.url);
    if (existing) {
      if (source?.id) aliases.set(String(source.id), existing.id);
      continue;
    }
    if (sources.some((candidate) => candidate.id === normalized.id)) normalized.id = `source-${sources.length + 1}`;
    sources.push(normalized);
    byUrl.set(normalized.url, normalized);
    aliases.set(String(source?.id ?? normalized.id), normalized.id);
    aliases.set(normalized.url, normalized.id);
  }
  if (!sources.length) throw new Error("Research produced no verifiable web sources, so Looplab refused to present it as evidence-backed.");
  const resolveIds = (values) => [...new Set((Array.isArray(values) ? values : []).map((value) => aliases.get(String(value)) ?? String(value)).filter((value) => sources.some((source) => source.id === value)))];
  const findings = (Array.isArray(raw.findings) ? raw.findings : []).map((finding, index) => ({
    id: clampText(finding?.id || `finding-${index + 1}`, 80), title: clampText(finding?.title, 180), summary: clampText(finding?.summary, 3000), confidence: confidence(finding?.confidence), sourceIds: resolveIds(finding?.sourceIds),
  })).filter((finding) => finding.title && finding.summary && finding.sourceIds.length);
  const suggestions = (Array.isArray(raw.suggestions) ? raw.suggestions : []).map((suggestion, index) => ({
    id: clampText(suggestion?.id || `suggestion-${index + 1}`, 80), title: clampText(suggestion?.title, 180), rationale: clampText(suggestion?.rationale, 2000), promptAddition: clampText(suggestion?.promptAddition, 2000), category: ["gameplay", "maps", "controls", "art", "audience", "accessibility", "performance", "release"].includes(suggestion?.category) ? suggestion.category : "gameplay", confidence: confidence(suggestion?.confidence), sourceIds: resolveIds(suggestion?.sourceIds),
  })).filter((suggestion) => suggestion.title && suggestion.rationale && suggestion.promptAddition && suggestion.sourceIds.length);
  if (!findings.length) throw new Error("Research findings were not tied to valid sources.");
  if (!suggestions.length) throw new Error("Research suggestions were not tied to valid sources.");
  return {
    id: globalThis.crypto.randomUUID(),
    query: metadata.query,
    preset: metadata.preset,
    depth: metadata.depth,
    engine: metadata.engine,
    provider: metadata.provider,
    createdAt: new Date().toISOString(),
    title: clampText(raw.title || metadata.query, 180),
    executiveSummary: clampText(raw.executiveSummary, 5000),
    confidence: confidence(raw.confidence),
    findings,
    suggestions,
    sources,
    uncertainties: (Array.isArray(raw.uncertainties) ? raw.uncertainties : []).map((value) => clampText(value, 1000)).filter(Boolean).slice(0, 12),
  };
}

function reportMarkdown(report) {
  const sourceMap = new Map(report.sources.map((source) => [source.id, source]));
  const citations = (ids) => ids.map((id) => sourceMap.get(id)).filter(Boolean).map((source) => `[${source.title}](${source.url})`).join(", ");
  return [
    `# ${report.title}`,
    "",
    `- Query: ${report.query}`,
    `- Depth: ${report.depth}`,
    `- Research workflow: ${report.engine}`,
    `- Provider: ${report.provider}`,
    `- ${usageReceiptSummary(report.usage, "Usage")}`,
    `- Confidence: ${report.confidence}`,
    `- Created: ${report.createdAt}`,
    "",
    "## Executive summary",
    "",
    report.executiveSummary,
    "",
    "## Findings",
    "",
    ...report.findings.flatMap((finding) => [`### ${finding.title} (${finding.confidence})`, "", finding.summary, "", `Sources: ${citations(finding.sourceIds)}`, ""]),
    "## Suggestions for human review",
    "",
    ...report.suggestions.flatMap((suggestion) => [`### ${suggestion.title} (${suggestion.confidence})`, "", suggestion.rationale, "", `Suggested prompt addition: ${suggestion.promptAddition}`, "", `Sources: ${citations(suggestion.sourceIds)}`, ""]),
    "## Uncertainties",
    "",
    ...(report.uncertainties.length ? report.uncertainties.map((item) => `- ${item}`) : ["- None reported."]),
    "",
    "## Sources",
    "",
    ...report.sources.map((source) => `- [${source.title}](${source.url}) — ${source.publisher}${source.publishedAt ? ` (${source.publishedAt})` : ""}`),
    "",
  ].join("\n");
}

async function main() {
  const provider = option("--provider");
  const inputPath = resolve(option("--input") ?? "");
  const outputPath = resolve(option("--output") ?? "");
  const reportDirectory = resolve(option("--report-dir") ?? join(process.cwd(), "claudedocs"));
  const responsePath = option("--response");
  if (!provider || !inputPath || !outputPath) throw new Error("--provider, --input, and --output are required.");
  const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "agent", "research-schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const depth = Object.hasOwn(DEPTH_RULES, input.depth) ? input.depth : "standard";
  const engine = Object.hasOwn(ENGINE_RULES, input.engine) ? input.engine : "source-command-sc-research";
  const query = clampText(input.query, 5000);
  if (!query) throw new Error("Research query must not be empty.");
  const context = {
    query,
    preset: clampText(input.preset || "custom", 80),
    depth,
    engine,
    engineRule: ENGINE_RULES[engine],
    depthRule: DEPTH_RULES[depth].hops,
    gameBrief: clampText(input.gameBrief, 20_000),
    successCriteria: "Return current, game-design-relevant evidence; verify contradictions; make implementation-neutral suggestions; cite every claim.",
  };
  emit("research.started", { provider, depth, preset: context.preset, message: `Researching ${query}` });
  emit("research.planned", { message: `Adaptive ${depth} plan ready`, detail: DEPTH_RULES[depth].hops });
  emit("research.searching", { message: "Searching and following evidence chains" });
  const responseFile = join(dirname(outputPath), "provider-research-response.json");
  const invoked = await invokeProvider({ provider, input: context, schema, schemaPath, responseFile, responsePath, cwd: dirname(inputPath) });
  emit("research.validating", { message: "Checking citations, contradictions, and source coverage" });
  const report = normalizeReport(invoked.report, invoked.sources, { query, preset: context.preset, depth, engine, provider });
  report.usage = invoked.receipt;
  await mkdir(reportDirectory, { recursive: true });
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "game-research";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const markdownPath = join(reportDirectory, `research_${slug}_${timestamp}.md`);
  report.reportFile = relative(dirname(reportDirectory), markdownPath).replaceAll("\\", "/");
  report.markdown = reportMarkdown(report);
  await writeFile(markdownPath, report.markdown, "utf8");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  emit("research.usage.completed", { message: usageReceiptSummary(report.usage, "Research usage"), receipt: report.usage });
  emit("research.completed", { message: "Evidence-backed research report is ready", reportId: report.id, sourceCount: report.sources.length, suggestionCount: report.suggestions.length, reportFile: report.reportFile, receipt: report.usage });
}

main().catch((error) => {
  emit("research.failed", { error: error instanceof Error ? error.message : String(error), ...(error?.usageReceipt ? { receipt: error.usageReceipt, message: usageReceiptSummary(error.usageReceipt, "Failed research usage") } : {}) });
  process.exitCode = 1;
});
