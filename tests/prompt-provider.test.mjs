import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { LOOPLAB_PROVIDER_PROMPT_MAX_CHARACTERS, validateProviderPromptDraft } from "../lib/looplab-game-director.mjs";

const execFileAsync = promisify(execFile);

const USER_VISION = "A courier crosses connected rooftops through expressive skating lines.";
const REQUIRED_CONSTRAINT = "Skating / trick action";
const VALID_PROMPT = `AI GAME DIRECTOR VARIATION — SIGNAL ROOFTOPS

USER VISION:
${USER_VISION}

DIRECTED CONSTRAINTS:
- ${REQUIRED_CONSTRAINT}

PLAYER EXPERIENCE:
Build a compact route-reading game where the courier converts observation into momentum. The player spots a landmark, commits to a line, transfers across authored rails, lands into a recovery lane, and chooses the next district without dead travel.

MAP AND SYSTEM PLAN:
Create linked rooftop, market, and transit maps with exact portal-to-spawn continuity. Keep every run-up, landing, and recovery zone clear. Author rail paths, collision footprints, ground anchors, support heights, and render depth as separate data. Treat all generated art as visual material only.

ART AND FEEDBACK:
Use a stable palette-locked courier silhouette, cohesive dark-grey architecture, readable route accents, grounded animation frames, distinct success and failure feedback, and restrained effects that do not hide hazards.

RELEASE GATES:
Run deterministic replay, real browser playtests, map-join evidence, responsive checks, and Project Doctor. Reject regressions without overwriting the base. Export one self-contained offline HTML file with its runtime and selected assets embedded.`;

test("provider prompt drafts have a measured efficiency ceiling", () => {
  assert.equal(LOOPLAB_PROVIDER_PROMPT_MAX_CHARACTERS, 20_000);
  const oversized = `${USER_VISION}\n${REQUIRED_CONSTRAINT}\n${"x".repeat(LOOPLAB_PROVIDER_PROMPT_MAX_CHARACTERS)}`;
  assert.match(validateProviderPromptDraft({ title: "Too long", summary: "Too long", prompt: oversized }, { userPrompt: USER_VISION, requiredConstraints: [REQUIRED_CONSTRAINT] }).join(" "), /20,000 character limit/);
});

test("prompt provider script validates and records a real provider-shaped draft", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-prompt-test-"));
  try {
    const inputPath = join(directory, "input.json");
    const responsePath = join(directory, "response.json");
    const outputPath = join(directory, "output.json");
    await writeFile(inputPath, JSON.stringify({ userPrompt: USER_VISION, basePrompt: "Prepared provider input with a different structure and complete requirements.", currentPrompt: "Current prompt that should be replaced.", requiredConstraints: [REQUIRED_CONSTRAINT], attempt: 2 }), "utf8");
    await writeFile(responsePath, JSON.stringify({ title: "Signal rooftops", summary: "A compact momentum-first linked-map direction.", prompt: VALID_PROMPT }), "utf8");
    const result = await execFileAsync(process.execPath, [resolve("scripts/looplab-prompt.mjs"), "--provider", "file", "--input", inputPath, "--output", outputPath, "--response", responsePath], { cwd: resolve(".") });
    assert.match(result.stdout, /prompt\.provider\.requested/);
    assert.match(result.stdout, /prompt\.provider\.completed/);
    const output = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(output.provider, "file");
    assert.equal(output.model, "fixture");
    assert.equal(output.prompt, VALID_PROMPT);
    assert.ok(output.similarityToPrevious < 0.94);
    assert.equal(output.usage.totalTokens, 0);
    assert.equal(output.usage.schemaVersion, "looplab-ai-usage/v1");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("prompt provider script rejects empty, unchanged, or vision-dropping output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-prompt-reject-"));
  try {
    const inputPath = join(directory, "input.json");
    const responsePath = join(directory, "response.json");
    const outputPath = join(directory, "output.json");
    await writeFile(inputPath, JSON.stringify({ userPrompt: USER_VISION, basePrompt: VALID_PROMPT, currentPrompt: VALID_PROMPT, requiredConstraints: [REQUIRED_CONSTRAINT], attempt: 3 }), "utf8");
    await writeFile(responsePath, JSON.stringify({ title: "No change", summary: "No meaningful change.", prompt: VALID_PROMPT }), "utf8");
    await assert.rejects(execFileAsync(process.execPath, [resolve("scripts/looplab-prompt.mjs"), "--provider", "file", "--input", inputPath, "--output", outputPath, "--response", responsePath], { cwd: resolve(".") }), /not materially different/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("UI and companion expose one provider-backed Retry Prompt path", async () => {
  const [page, companion, manifest] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/looplab-companion.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/agent-manifest.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.match(page, /companionFetch\(`\$\{COMPANION_URL\}\/prompt-drafts`/);
  assert.match(page, /command\.op === "retry_prompt".+requestAiPromptDraft/s);
  assert.match(page, /useState<AgentProvider>\("codex"\)/, "the Director should prefer ChatGPT-authenticated Codex CLI over credit-based API access");
  assert.doesNotMatch(page, /nextPromptVariant/);
  assert.match(page, /No local template was substituted/);
  assert.match(page, /directorBriefRef\.current/);
  assert.match(page, /brief\.provider-prompt\.locked/);
  assert.match(page, /verbArchitecture: \{ policy: LOOPLAB_VERB_ARCHITECTURE_POLICY, inspection: inspectVerbArchitecture\(currentProject\) \}/);
  assert.match(page, /preferenceContext: promptPreferenceContext/);
  assert.match(page, /const requestBaseline = syncActiveMap\(\{ \.\.\.projectRef\.current, designBrief \}\)/);
  assert.match(page, /AI job was not accepted; restored the project from before this request/);
  assert.match(page, /AI loop cancelled; restored the project from before this request/);
  assert.match(page, /id="looplab-director-state"/);
  assert.match(companion, /url\.pathname === "\/prompt-drafts"/);
  assert.match(companion, /promptGenerationActive/);
  assert.equal(manifest.companion.promptDrafts, "/prompt-drafts");
  assert.equal(manifest.gameDirector.headlessSuperset, true);
  assert.equal(manifest.usageReceipts.promptDraftField, "draft.usage");
  assert.equal(manifest.usageReceipts.loopTotalEvent, "loop.completed");
  assert.equal(manifest.protocolVersion, "1.110.0");
  assert.equal(manifest.commands.includes("set_verb_architecture"), true);
});

test("provider and loop prompts require purpose-first, recurring, runtime-proven verb systems", async () => {
  const [promptScript, loopScript, director] = await Promise.all([
    readFile(new URL("../scripts/looplab-prompt.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/looplab-loop.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/looplab-game-director.mjs", import.meta.url), "utf8"),
  ]);
  for (const source of [promptScript, loopScript]) {
    assert.match(source, /verbArchitecture version 2/);
    assert.match(source, /one deep verb is valid/i);
    assert.match(source, /feedback/);
    assert.match(source, /runtime IDs/);
    assert.match(source, /test IDs/);
    assert.match(source, /finale/);
  }
  assert.match(director, /LOOPLAB_VERB_ARCHITECTURE_POLICY.rule/);
  assert.match(director, /One deep verb is valid/);
  assert.match(director, /resource source.+sink pressure/);
  assert.match(loopScript, /set_verb_architecture/);
  assert.match(loopScript, /verbArchitecture: { policy: LOOPLAB_VERB_ARCHITECTURE_POLICY/);
});
