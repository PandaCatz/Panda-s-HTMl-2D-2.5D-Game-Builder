import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { buildAnthropicMessagesRequest } from "../lib/looplab-anthropic-api.mjs";
import { getLooplabCommandContracts, validateLooplabCommandContracts } from "../lib/looplab-agent-contracts.mjs";
import { getAgentManifest, getPublicAgentManifest } from "../lib/looplab-agent-core.mjs";
import { sha256Hex } from "../lib/looplab-canonical-digest.mjs";
import { LOOPLAB_BROWSER_SESSION_COMMANDS, LOOPLAB_CORE_COMMANDS } from "../lib/looplab-command-surfaces.mjs";
import { buildOpenAiResponsesRequest } from "../lib/looplab-openai-request.mjs";
import { isVisualCritiqueFresh, visualCritiqueFreshnessReason } from "../lib/looplab-visual-critique-freshness.mjs";
import {
  LOOPLAB_VISUAL_CRITIQUE_DIMENSIONS,
  normalizeVisualCritiqueProviderOutput,
  normalizeVisualCritiqueRequest,
  publicVisualCritiqueRequest,
  visualCritiqueProviderContext,
} from "../lib/looplab-visual-critique.mjs";

const execFileAsync = promisify(execFile);

function pngBytes(label = "capture") {
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from(label, "utf8")]);
}

function capture(id = "capture-main", label = id) {
  const bytes = pngBytes(label);
  return {
    id,
    mapId: "map-main",
    mapName: "Main route",
    profileId: "desktop",
    profileName: "Desktop",
    width: 320,
    height: 180,
    sha256: sha256Hex(bytes),
    dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
    renderedBounds: { width: 320, height: 180 },
    targetViewport: { width: 1280, height: 720, devicePixelRatio: 1 },
    actualViewport: { width: 1280, height: 720, devicePixelRatio: 1 },
    annotationSummary: ["HUD overlaps the upper-right landmark"],
  };
}

function requestInput(overrides = {}) {
  return {
    consent: true,
    sourceDigest: `source-${"a".repeat(64)}`,
    gameBrief: "A readable connected 2D courier game.",
    artDirection: "Cohesive dark architecture with a readable player silhouette.",
    visualIdentity: { schemaVersion: "looplab-visual-identity-critique-context/v1", identityDigest: `sha256:${"b".repeat(64)}`, status: "adopted", intent: "Keep the selected project's authored visual language.", directives: [{ id: "readability", dimension: "value", instruction: "Keep the player readable.", appliesToRoles: ["character"], strength: "guide", userAuthored: true }], references: [], exclusions: [], proofBoundary: "Advisory review does not prove beauty or originality." },
    captures: [capture()],
    ...overrides,
  };
}

function providerOutput(captureIds = ["capture-main"]) {
  return {
    summary: "The route is readable, but the upper-right landmark competes with the HUD.",
    observations: captureIds.map((captureId) => ({
      captureId,
      sceneSummary: "A side-view route with a player, platforms, background architecture, and a HUD.",
      groundedObservations: [{ region: "upper-right", observation: "The HUD overlaps a high-contrast landmark.", confidence: "high" }],
    })),
    dimensions: LOOPLAB_VISUAL_CRITIQUE_DIMENSIONS.map((id, index) => ({
      id,
      score: 70 + index,
      confidence: "medium",
      evidenceCaptureIds: captureIds,
      rationale: `The visible ${id} evidence is understandable but has room to improve.`,
      nextAction: `Make one bounded ${id} improvement and recapture the same profile.`,
    })),
    strengths: [{ id: "strength-1", title: "Readable route", summary: "The main traversal line remains visually distinct.", evidenceCaptureIds: captureIds }],
    issues: [{ id: "issue-1", severity: "medium", title: "HUD competition", problem: "The HUD crosses a landmark.", impact: "The landmark is harder to read.", suggestedChange: "Move or reduce the landmark contrast under the HUD safe area.", evidenceCaptureIds: captureIds }],
    limitations: ["A still capture cannot prove animation, controls, collision, game feel, or off-screen continuity."],
  };
}

test("visual critique requires explicit consent and exact re-hashed image bytes", () => {
  assert.throws(() => normalizeVisualCritiqueRequest(requestInput({ consent: false })), /consent:true/i);
  assert.throws(() => normalizeVisualCritiqueRequest(requestInput({ captures: [{ ...capture(), sha256: "0".repeat(64) }] })), /does not match/i);
  const wrongMime = capture();
  wrongMime.dataUrl = wrongMime.dataUrl.replace("image/png", "image/jpeg");
  assert.throws(() => normalizeVisualCritiqueRequest(requestInput({ captures: [wrongMime] })), /MIME type/i);
  assert.throws(() => normalizeVisualCritiqueRequest(requestInput({ captures: Array.from({ length: 9 }, (_, index) => capture(`capture-${index}`, `bytes-${index}`)) })), /no more than 8/i);
  assert.throws(() => normalizeVisualCritiqueRequest(requestInput({ visualIdentity: { note: capture().dataUrl } })), /embedded bytes or credentials/i);
});

test("public request strips every image while preserving source and capture-set identity", () => {
  const request = normalizeVisualCritiqueRequest(requestInput());
  const publicRequest = publicVisualCritiqueRequest(request);
  assert.match(request.captureSetDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(request.requestDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(publicRequest.captureCount, 1);
  assert.equal(publicRequest.captures[0].sha256, `sha256:${capture().sha256}`);
  assert.doesNotMatch(JSON.stringify(publicRequest), /data:image|base64,/i);
  assert.equal(publicRequest.visualIdentity.identityDigest, `sha256:${"b".repeat(64)}`);
  const providerContext = JSON.parse(visualCritiqueProviderContext(request));
  assert.equal(providerContext.visualIdentity.intent, requestInput().visualIdentity.intent);
});

test("visual critique freshness fails closed when source identity or exact capture bytes change", () => {
  const normalized = normalizeVisualCritiqueRequest(requestInput());
  const critique = normalizeVisualCritiqueProviderOutput(providerOutput(), { request: normalized, provider: "file", model: "fixture" });
  const request = publicVisualCritiqueRequest(normalized);
  const visualReview = { sourceDigest: normalized.sourceDigest, captures: [{ id: "capture-main", sha256: capture().sha256 }] };
  const current = { critique, request, currentSourceDigest: normalized.sourceDigest, visualReview };
  assert.equal(isVisualCritiqueFresh(current), true);
  assert.equal(visualCritiqueFreshnessReason(current), null);
  assert.equal(isVisualCritiqueFresh({ ...current, currentSourceDigest: `source-${"b".repeat(64)}` }), false);
  assert.equal(visualCritiqueFreshnessReason({ ...current, currentSourceDigest: `source-${"b".repeat(64)}` }), "source-changed");
  const changedBytes = { ...visualReview, captures: [{ id: "capture-main", sha256: "c".repeat(64) }] };
  assert.equal(isVisualCritiqueFresh({ ...current, visualReview: changedBytes }), false);
  assert.equal(visualCritiqueFreshnessReason({ ...current, visualReview: changedBytes }), "capture-bytes-changed");
  assert.equal(isVisualCritiqueFresh({ ...current, request: { ...request, captureSetDigest: `sha256:${"d".repeat(64)}` } }), false);
  assert.equal(visualCritiqueFreshnessReason({ ...current, request: { ...request, captureSetDigest: `sha256:${"d".repeat(64)}` } }), "capture-set-changed");
});

test("manifest, command contracts, and companion source preserve visual critique authority boundaries", async () => {
  const manifest = getAgentManifest();
  const publicManifest = getPublicAgentManifest();
  const contracts = getLooplabCommandContracts();
  const validation = validateLooplabCommandContracts();
  const start = contracts.find((contract) => contract.op === "start_visual_critique");
  const getJob = contracts.find((contract) => contract.op === "get_visual_critique_job");
  const cancel = contracts.find((contract) => contract.op === "cancel_visual_critique_job");
  const getCurrent = contracts.find((contract) => contract.op === "get_visual_critique");

  assert.equal(manifest.protocolVersion, "1.104.0");
  assert.equal(LOOPLAB_CORE_COMMANDS.length, 185);
  assert.equal(LOOPLAB_BROWSER_SESSION_COMMANDS.length, 266);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.deepEqual(start.surfaces, ["browser-session"]);
  assert.equal(start.mutatesProject, false);
  assert.equal(start.mutatesBuilderState, true);
  assert.equal(start.annotations.openWorldHint, true);
  assert.deepEqual(start.inputSchema.required, ["provider", "consent"]);
  assert.equal(start.inputSchema.properties.captureIds.maxItems, 8);
  assert.equal(getJob.mutatesProject, false);
  assert.equal(getJob.annotations.openWorldHint, true);
  assert.equal(cancel.mutatesProject, false);
  assert.equal(cancel.mutatesBuilderState, true);
  assert.equal(getCurrent.annotations.readOnlyHint, true);
  assert.deepEqual(manifest.visualCritique.dimensions, LOOPLAB_VISUAL_CRITIQUE_DIMENSIONS);
  assert.equal(manifest.visualCritique.limits.maximumCaptures, 8);
  assert.match(manifest.visualCritique.consent, /every image submission/i);
  assert.match(manifest.visualCritique.storage, /returns no image bytes/i);
  assert.match(manifest.visualCritique.authorityBoundary, /advisory only/i);
  assert.equal(publicManifest.companion.visualCritiqueJobs, "/visual-critique-jobs");
  assert.match(publicManifest.companion.visualCritiquePolicy, /explicit image-submission consent/i);

  const companionSource = await readFile(resolve("scripts/looplab-companion.mjs"), "utf8");
  const startIndex = companionSource.indexOf("async function startVisualCritiqueJob");
  const endIndex = companionSource.indexOf("\nasync function", startIndex + 20);
  const visualJobSource = companionSource.slice(startIndex, endIndex);
  assert.match(visualJobSource, /let jobDirectory = null/);
  assert.match(visualJobSource, /request: publicVisualCritiqueRequest\(request\)/);
  assert.match(visualJobSource, /await rm\(jobDirectory, \{ recursive: true, force: true \}\)/);
  assert.match(visualJobSource, /catch \(error\) \{\s*if \(jobDirectory\) await rm\(jobDirectory, \{ recursive: true, force: true \}\)\.catch/);
  assert.match(visualJobSource, /job\.inputPath = null/);
  assert.match(visualJobSource, /job\.outputPath = null/);
  assert.match(visualJobSource, /providerFamilyPaths\(requestedProvider\)/);
  assert.match(visualJobSource, /eligibleProviders: visualConsentProviders/);
  assert.match(visualJobSource, /provider\.failover\.started/);
  assert.match(visualJobSource, /same-provider-family-only/);
  assert.doesNotMatch(visualJobSource, /job\.result\s*=\s*request/);

  const pageSource = await readFile(resolve("app/page.tsx"), "utf8");
  assert.match(pageSource, /looplab-visual-critique-state/);
  assert.match(pageSource, /command\.op === "start_visual_critique"/);
  assert.match(pageSource, /command\.op === "get_visual_critique_job"/);
  assert.match(pageSource, /command\.op === "cancel_visual_critique_job"/);
  assert.match(pageSource, /command\.op === "get_visual_critique"/);
  assert.match(pageSource, /visualCritiqueFresh/);
  assert.match(pageSource, /providerFamilyPaths\(provider\)/);
  assert.match(pageSource, /eligibleProviders: visualEligibleProviders/);
});

test("provider result must cover every capture and every dimension with valid evidence references", () => {
  const request = normalizeVisualCritiqueRequest(requestInput());
  const result = normalizeVisualCritiqueProviderOutput(providerOutput(), { request, provider: "file", model: "fixture", usage: { totalTokens: 0 } });
  assert.equal(result.policy.advisoryOnly, true);
  assert.equal(result.policy.verificationEvidence, false);
  assert.equal(result.policy.automaticWinner, null);
  assert.equal(result.policy.aestheticApproval, "not-proven");
  assert.deepEqual(result.dimensions.map((dimension) => dimension.id), LOOPLAB_VISUAL_CRITIQUE_DIMENSIONS);
  assert.doesNotMatch(JSON.stringify(result), /data:image|base64,/i);
  const missingDimension = providerOutput();
  missingDimension.dimensions.pop();
  assert.throws(() => normalizeVisualCritiqueProviderOutput(missingDimension, { request, provider: "file", model: "fixture" }), /exactly 7/i);
  const unknownCapture = providerOutput();
  unknownCapture.issues[0].evidenceCaptureIds = ["missing-capture"];
  assert.throws(() => normalizeVisualCritiqueProviderOutput(unknownCapture, { request, provider: "file", model: "fixture" }), /unknown capture/i);
});

test("OpenAI and Anthropic structured requests preserve multimodal user content without weakening schemas", () => {
  const schema = { type: "object", additionalProperties: false, required: ["summary"], properties: { summary: { type: "string" } } };
  const openAiContent = [{ type: "input_text", text: "metadata" }, { type: "input_image", image_url: capture().dataUrl, detail: "high" }];
  const openAi = buildOpenAiResponsesRequest({ model: "gpt-5.2", purpose: "visual-critique", developerPrompt: "review", userContent: openAiContent, schema, schemaName: "critique" });
  assert.deepEqual(openAi.input[1].content, openAiContent);
  assert.equal(openAi.store, false);
  assert.equal(openAi.text.format.strict, true);
  const anthropicContent = [{ type: "text", text: "metadata" }, { type: "image", source: { type: "base64", media_type: "image/png", data: "abc=" } }];
  const anthropic = buildAnthropicMessagesRequest({ model: "claude-sonnet-4-5", maxTokens: 1000, system: "review", userInput: anthropicContent, schema });
  assert.deepEqual(anthropic.messages[0].content, anthropicContent);
  assert.equal(anthropic.output_config.format.type, "json_schema");
});

test("fixture provider executes the real runner and writes a byte-free stamped result", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-visual-critique-test-"));
  const inputPath = join(directory, "input.json");
  const responsePath = join(directory, "response.json");
  const outputPath = join(directory, "output.json");
  await writeFile(inputPath, JSON.stringify(requestInput()), "utf8");
  await writeFile(responsePath, JSON.stringify(providerOutput()), "utf8");
  const result = await execFileAsync(process.execPath, [resolve("scripts/looplab-visual-critique.mjs"), "--provider", "file", "--input", inputPath, "--output", outputPath, "--response", responsePath], { cwd: resolve(".") });
  assert.match(result.stdout, /visual-critique.completed/);
  assert.doesNotMatch(result.stdout, /data:image|base64,/i);
  const critique = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(critique.schemaVersion, "looplab-visual-critique/v1");
  assert.equal(critique.provider, "file");
  assert.equal(critique.usage.totalTokens, 0);
  assert.doesNotMatch(JSON.stringify(critique), /data:image|base64,/i);
});
