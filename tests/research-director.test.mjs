import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { applyAgentCommand, applyCollectedVerificationEvidence, createTemplate, getAgentManifest, promoteVerifiedIteration, validateProject } from "../lib/looplab-agent-core.mjs";
import { getLooplabCommandContract, validateLooplabCommandInput } from "../lib/looplab-agent-contracts.mjs";
import { authoredColliderForPlacement, visualBoundsForAsset } from "../lib/looplab-authored-collision.mjs";
import { composeDirectedGameBrief, composeProviderGeneratedGameBrief, directedGameSummary, reconcileDirectedGameBrief, validateDirectedGameBrief } from "../lib/looplab-game-director.mjs";
import { generateSpritePixels } from "../lib/looplab-pixel-generator.mjs";
import { CC0_ASSET_CATEGORIES, CC0_ASSET_PACKS, CC0_ASSET_POLICY } from "../lib/looplab-cc0-assets.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { createRuntimePlaytestEvidence, verificationCoverageRequirements } from "../lib/looplab-verification.mjs";

const execFileAsync = promisify(execFile);

test("directed selections strengthen rather than replace the free-text vision", () => {
  const brief = composeDirectedGameBrief({
    userPrompt: "A rooftop courier game about finding expressive shortcuts.",
    genre: "skating-tricks",
    coreLoop: "traverse-chain-score",
    format: "connected-rooms",
    progression: "score-attack",
    campaignScope: "three-connected-regions",
  });
  assert.match(brief.composedPrompt, /A rooftop courier game/);
  assert.match(brief.composedPrompt, /Skating \/ trick action/);
  assert.match(brief.composedPrompt, /Traverse → chain → score/);
  assert.match(brief.composedPrompt, /Three connected regions/);
  assert.match(brief.composedPrompt, /not as a replacement/);
  assert.deepEqual(validateDirectedGameBrief(brief), []);

  const project = applyAgentCommand(createTemplate("platformer"), { op: "set_game_brief", ...brief }).project;
  assert.equal(project.designBrief.composedPrompt, brief.composedPrompt);
  assert.equal(validateProject(project).valid, true);
  assert.throws(() => applyAgentCommand(project, { op: "queue_agent_request", prompt: "different", designBrief: brief }), /must match/);
});

test("headless Director contracts advertise canonical selection IDs and reject invented IDs instead of silently applying auto", () => {
  const contract = getLooplabCommandContract("configure_director");
  assert.ok(contract);
  const expectedSelections = {
    genre: "action-adventure",
    coreLoop: "solve-open-advance",
    movementTemplate: "top-down-action-rpg",
    format: "dimetric",
    progression: "narrative-objectives",
    campaignScope: "two-connected-maps",
  };
  for (const [field, value] of Object.entries(expectedSelections)) assert.ok(contract.inputSchema.properties[field].enum.includes(value));

  const invalid = validateLooplabCommandInput({ op: "configure_director", genre: "Systems action-puzzle exploration" });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /command\.genre must be one of/);

  const valid = validateLooplabCommandInput({ op: "configure_director", userPrompt: "Arbitrary design detail belongs here.", ...expectedSelections });
  assert.deepEqual(valid.errors, []);

  assert.equal(validateLooplabCommandInput({ op: "start_ai_build", contextBudgetTokens: 200_000 }).valid, true);
  assert.equal(validateLooplabCommandInput({ op: "start_ai_build", contextBudgetTokens: 200_001 }).valid, false);
  assert.equal(validateLooplabCommandInput({ op: "start_ai_build", provider: "claude" }).valid, true);
  assert.equal(validateLooplabCommandInput({ op: "start_ai_build", provider: "invented" }).valid, false);
});


test("prompt retry requires a materially different provider draft with provenance", () => {
  const original = composeDirectedGameBrief({
    userPrompt: "A rooftop courier game about expressive shortcuts.",
    genre: "skating-tricks",
    coreLoop: "traverse-chain-score",
    movementTemplate: "kinetic-runner",
    format: "connected-rooms",
    progression: "score-attack",
    campaignScope: "three-connected-regions",
  });
  const requiredConstraints = directedGameSummary(original);
  const generatedPrompt = `AI GAME DIRECTOR VARIATION — ROOFTOP MOMENTUM NETWORK

USER VISION:
${original.userPrompt}

DIRECTED CONSTRAINTS:
${requiredConstraints.map((constraint) => `- ${constraint}`).join("\n")}

PLAYER FANTASY AND VERBS:
Make the player a fast rooftop courier who reads skylines as a connected movement puzzle. The repeatable sequence is spot a line, commit, build speed, transfer, land, and immediately choose the next route. Prioritize expressive shortcuts over checklist traversal.

WORLD AND FLOW:
Build three compact connected districts with distinct silhouettes and exact portal-to-spawn continuity. Every authored line needs preview space, setup, interaction, landing, recovery, and a visible next decision. Remove filler travel and keep props outside run-ups.

IMPLEMENTATION CONTRACT:
Author collision, rail paths, support height, anchors, and depth independently from art. Give the courier a stable palette-locked sprite identity, grounded frames, readable anticipation, and impact feedback. Keep raised routes and underpasses independent. Run deterministic replay, browser QA, Project Doctor, and actual map-join checks. Preserve the best candidate and ship one complete offline HTML file with all selected assets inline.`;
  const draft = {
    id: "prompt-provider-1",
    provider: "openai",
    model: "fixture-model",
    generatedAt: "2026-08-08T12:00:00.000Z",
    title: "Rooftop momentum network",
    summary: "Reframes the game around compact route-reading and expressive linked shortcuts.",
    prompt: generatedPrompt,
    comparisonPrompt: original.composedPrompt,
    requiredConstraints,
  };
  const retried = composeProviderGeneratedGameBrief(original, draft);

  assert.equal(retried.userPrompt, original.userPrompt);
  for (const field of ["genre", "coreLoop", "movementTemplate", "format", "progression", "campaignScope"]) assert.equal(retried[field], original[field]);
  assert.notEqual(retried.composedPrompt, original.composedPrompt);
  assert.equal(retried.promptGeneration.provider, "openai");
  assert.equal(retried.promptGeneration.basePrompt, original.composedPrompt);
  assert.deepEqual(retried.promptGeneration.requiredConstraints, requiredConstraints);
  assert.deepEqual(validateDirectedGameBrief(retried), []);

  const project = applyAgentCommand(createTemplate("platformer"), { op: "set_game_brief", ...original }).project;
  assert.throws(() => applyAgentCommand(project, { op: "retry_prompt" }), /provider-generated draft/);
  assert.throws(() => composeProviderGeneratedGameBrief(original, { ...draft, id: "same", prompt: original.composedPrompt }), /not materially different/);
  assert.throws(() => composeProviderGeneratedGameBrief(original, { ...draft, id: "missing-vision", prompt: generatedPrompt.replace(original.userPrompt, "A summarized substitute") }), /exact description/);
  const outcome = applyAgentCommand(project, { op: "retry_prompt", draft });
  assert.equal(outcome.project.designBrief.userPrompt, original.userPrompt);
  assert.equal(outcome.project.designBrief.composedPrompt, generatedPrompt);
  assert.equal(outcome.result.providerGenerated, true);
  assert.equal(applyAgentCommand(outcome.project, { op: "get_prompt_draft" }).result.composedPrompt, outcome.project.designBrief.composedPrompt);
});

test("operational director changes preserve a current provider prompt until a design input changes", () => {
  const original = composeDirectedGameBrief({
    userPrompt: "A dimetric campaign about tuning a living bell network.",
    genre: "action-adventure",
    coreLoop: "explore-collect-unlock",
    movementTemplate: "top-down-action-rpg",
    format: "dimetric",
    progression: "persistent-unlocks",
    campaignScope: "three-connected-regions",
  });
  const requiredConstraints = directedGameSummary(original);
  const generated = composeProviderGeneratedGameBrief(original, {
    id: "prompt-preservation-fixture",
    provider: "codex",
    model: "fixture-model",
    generatedAt: "2026-08-08T12:00:00.000Z",
    title: "Living bell campaign",
    summary: "Turns the campaign into an authored network of deterministic state changes.",
    prompt: `${original.userPrompt}\n\n${requiredConstraints.join("\n")}\n\nImplement four deterministic verbs, three connected regions, and replay-bound state changes. Give every verb an authored input, a typed variable, a bounded rule effect, a stable runtime implementation ID, and an acceptance fixture. Build a clear opening lesson, a middle that combines systems across independent elevation layers, and a final region that asks the player to deliberately recombine everything learned. Preserve exact support heights, ground anchors, collision ownership, depth slices, portal targets, and deterministic replay hashes. Finish with browser captures, Project Doctor evidence, and one self-contained offline HTML artifact. This is a substantially different provider-authored implementation brief with concrete runtime evidence.`,
    comparisonPrompt: original.composedPrompt,
    requiredConstraints,
  });

  const operationallyReconfigured = reconcileDirectedGameBrief({
    ...generated,
    loop: { enabled: true, iterations: 5 },
    track: "creation",
  });
  assert.equal(operationallyReconfigured.composedPrompt, generated.composedPrompt);
  assert.equal(operationallyReconfigured.promptGeneration.id, generated.promptGeneration.id);

  const designChanged = reconcileDirectedGameBrief({ ...generated, format: "top-down" });
  assert.equal(designChanged.promptGeneration, undefined);
  assert.notEqual(designChanged.composedPrompt, generated.composedPrompt);
});

test("Project Doctor enforces structured world scope and ordered map connectivity", () => {
  const brief = composeDirectedGameBrief({
    userPrompt: "A bell keeper crosses three distinct regions in order.",
    genre: "action-adventure",
    coreLoop: "explore-collect-unlock",
    movementTemplate: "top-down-action-rpg",
    format: "connected-rooms",
    progression: "level-campaign",
    campaignScope: "three-connected-regions",
  });
  let project = applyAgentCommand(createTemplate("platformer"), { op: "set_game_brief", ...brief }).project;
  let report = analyzeProject(project);
  const scopeIssue = report.issues.find((issue) => issue.code === "campaign-map-count");
  assert.equal(scopeIssue?.severity, "warning");
  assert.equal(scopeIssue?.actualMapCount, 1);
  assert.equal(scopeIssue?.expectedMinMaps, 3);
  assert.match(scopeIssue?.action ?? "", /add_map.*connect_maps/);
  assert.deepEqual(scopeIssue?.evidenceRequired, ["project-doctor", "runtime-join-plan", "playtest"]);
  assert.equal(analyzeProject(project, { profile: "production" }).issues.find((issue) => issue.code === "campaign-map-count")?.severity, "error");

  project = applyAgentCommand(project, { op: "add_map", id: "map-two", name: "Map 2" }).project;
  project = applyAgentCommand(project, { op: "add_map", id: "map-three", name: "Map 3" }).project;
  project = applyAgentCommand(project, { op: "connect_maps", sourceMapId: "map-main", targetMapId: "map-two" }).project;
  project = applyAgentCommand(project, { op: "connect_maps", sourceMapId: "map-two", targetMapId: "map-three" }).project;
  report = analyzeProject(project);
  assert.equal(report.issues.some((issue) => issue.code === "campaign-map-count"), false);
  assert.equal(report.issues.some((issue) => issue.code === "map-route-gap" || issue.code === "map-unreachable"), false);
});

test("project variations clone a complete project into a renamed child without changing the base", () => {
  const base = createTemplate("dimetric");
  const before = JSON.stringify(base);
  const outcome = applyAgentCommand(base, { op: "create_variation", name: "Dimetric City — Variation 1", id: "dimetric-variation-v001" });

  assert.equal(JSON.stringify(base), before);
  assert.equal(outcome.project.name, "Dimetric City — Variation 1");
  assert.equal(outcome.project.iteration.id, "dimetric-variation-v001");
  assert.equal(outcome.project.iteration.parentId, base.iteration.id);
  assert.equal(outcome.project.iteration.status, "candidate");
  assert.deepEqual(outcome.project.maps.map((map) => map.id), base.maps.map((map) => map.id));
  assert.equal(validateProject(outcome.project).valid, true);
});

test("a completed project starts a protected child candidate when looped again", () => {
  let project = createTemplate("platformer");
  project = applyAgentCommand(project, { op: "begin_iteration", id: "completed-v1", objective: "First complete version" }).project;
  const report = analyzeProject(project);
  const createdAt = "2026-08-07T12:00:00.000Z";
  const requirements = verificationCoverageRequirements(project);
  const profiles = new Map(project.deviceProfiles.map((profile) => [profile.id, profile]));
  const evidenceRefs = [
    createRuntimePlaytestEvidence(project, { sourceDigest: report.sourceDigest, createdAt, runner: "node-test" }),
    ...requirements.requiredMapIds.flatMap((mapId) => requirements.requiredProfileIds.map((profileId, index) => {
      const profile = profiles.get(profileId);
      return { version: 2, type: "screenshot", id: `canvas:${mapId}:${profileId}`, status: "passed", sourceDigest: report.sourceDigest, createdAt, runner: "playwright-test-fixture", mapId, profileId, sha256: `sha256:${((index + 1) % 16).toString(16).repeat(64)}`, width: 960, height: 540, viewport: { width: 1440, height: 1000, devicePixelRatio: 1 }, targetViewport: { width: profile.width, height: profile.height, devicePixelRatio: profile.dpr ?? 1 }, renderedBounds: { width: Math.min(960, profile.width), height: 540 }, cleanPlay: true, editorOverlays: false, profileSimulation: "in-app-device-profile" };
    })),
    ...requirements.requiredProfileIds.map((profileId) => {
      const profile = profiles.get(profileId);
      return { version: 2, type: "responsive", id: `responsive:${profileId}`, status: "passed", sourceDigest: report.sourceDigest, createdAt, runner: "playwright-test-fixture", profileId, profileSimulation: "in-app-device-profile", targetViewport: { width: profile.width, height: profile.height, devicePixelRatio: profile.dpr ?? 1 }, viewport: { width: 1440, height: 1000, devicePixelRatio: 1 }, checks: [{ id: "layout-contained", status: "passed", detail: "Fixture layout is contained." }] };
    }),
  ];
  project = applyCollectedVerificationEvidence(project, evidenceRefs).project;
  project = promoteVerifiedIteration(project).project;
  assert.equal(project.iteration.status, "promoted");

  const child = applyAgentCommand(project, { op: "begin_iteration", id: "completed-v2", objective: "Improve the completed game" }).project;
  assert.equal(child.iteration.status, "candidate");
  assert.equal(child.iteration.parentId, "completed-v1");
  assert.equal(child.iteration.id, "completed-v2");
  assert.equal(child.iteration.readOnly, false);
});

test("generated pixels remain visual metadata while authored semantics own collision", () => {
  const firstAsset = { opaqueBounds: { x: 1, y: 2, width: 20, height: 24 }, frameWidth: 32, frameHeight: 32 };
  const secondAsset = { opaqueBounds: { x: 8, y: 6, width: 10, height: 18 }, frameWidth: 32, frameHeight: 32 };
  assert.notDeepEqual(visualBoundsForAsset(firstAsset, 64, 64), visualBoundsForAsset(secondAsset, 64, 64));
  assert.deepEqual(
    authoredColliderForPlacement({ kind: "decor", role: "prop", width: 64, height: 64, z: 0 }),
    authoredColliderForPlacement({ kind: "decor", role: "prop", width: 64, height: 64, z: 0 }),
  );
  const generated = generateSpritePixels({ kind: "prop", palette: "violet", size: 32, seed: "collision-proof" });
  assert.ok(generated.opaqueBounds);
  assert.equal("colliderBounds" in generated, false);
});

test("research file provider writes a cited JSON report and viewable Markdown", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-research-test-"));
  const inputPath = join(directory, "input.json");
  const responsePath = join(directory, "response.json");
  const outputPath = join(directory, "output.json");
  const reportDirectory = join(directory, "claudedocs");
  await writeFile(inputPath, JSON.stringify({ query: "Readable skating routes", depth: "quick", engine: "source-command-sc-research", preset: "map-flow", gameBrief: "A city skating game" }), "utf8");
  await writeFile(responsePath, JSON.stringify({
    title: "Readable skating routes",
    executiveSummary: "Readable lines need anticipation, interaction, landing, and recovery space.",
    confidence: "high",
    findings: [{ id: "finding-1", title: "Preserve route phases", summary: "Players need visible setup and recovery space around interactions.", confidence: "high", sourceIds: ["source-1"] }],
    suggestions: [{ id: "suggestion-1", title: "Author route clearance", rationale: "Clearance makes the intended line readable.", promptAddition: "Give every trick line setup, interaction, landing, and recovery zones.", category: "maps", confidence: "high", sourceIds: ["source-1"] }],
    sources: [{ id: "source-1", title: "Primary level-design guide", url: "https://example.com/level-design", publisher: "Example", publishedAt: null }],
    uncertainties: ["Validate spacing in a real playtest."],
  }), "utf8");

  const script = resolve("scripts/looplab-research.mjs");
  const result = await execFileAsync(process.execPath, [script, "--provider", "file", "--input", inputPath, "--output", outputPath, "--response", responsePath, "--report-dir", reportDirectory], { cwd: resolve(".") });
  assert.match(result.stdout, /research.completed/);
  const report = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(report.engine, "source-command-sc-research");
  assert.equal(report.sources.length, 1);
  assert.match(report.markdown, /## Findings/);
  assert.match(report.markdown, /https:\/\/example.com\/level-design/);
  assert.equal(report.usage.totalTokens, 0);
  assert.match(report.markdown, /Usage: 0 tokens/);
  const markdownName = report.reportFile.split("/").at(-1);
  assert.equal(await readFile(join(reportDirectory, markdownName), "utf8"), report.markdown);
});

test("agent manifest advertises directed generation and report-only research", () => {
  const manifest = getAgentManifest();
  assert.equal(manifest.protocolVersion, "1.103.0");
  assert.equal(manifest.verification.collectCommand, "collect_verification_evidence");
  assert.equal(manifest.verification.visualReviewCommand, "capture_visual_review");
  assert.deepEqual(manifest.verification.requiredEvidence, ["source-bound-deterministic-playtest", "clean-play-map-by-device-screenshot-matrix", "responsive-profile-checks", "actual-runtime-join-receipts-for-enabled-portals"]);
  assert.ok(manifest.commands.includes("collect_verification_evidence"));
  assert.ok(manifest.commands.includes("capture_visual_review"));
  assert.equal(manifest.commands.includes("set_game_brief"), true);
  assert.equal(manifest.commands.includes("retry_prompt"), true);
  assert.equal(manifest.commands.includes("start_ai_build"), true);
  assert.equal(manifest.commands.includes("create_variation"), true);
  assert.equal(manifest.commands.includes("get_verb_architecture"), true);
  assert.equal(manifest.commands.includes("set_verb_architecture"), true);
  assert.equal(manifest.gameDirector.verbArchitecture.policy.version, 2);
  assert.match(manifest.gameDirector.verbArchitecture.policy.rule, /Start from recurring player decisions/);
  assert.equal(manifest.gameDirector.promptEndpoint, "http://127.0.0.1:4317/prompt-drafts");
  assert.equal(manifest.gameDirector.headlessSuperset, true);
  assert.match(manifest.gameDirector.retryPolicy, /authenticated provider/);
  assert.equal(manifest.gameDirector.fields.campaignScope.some((choice) => choice.value === "three-connected-regions"), true);
  assert.match(manifest.gameDirector.campaignScopePolicy, /Project Doctor checks the authored map count/);
  assert.deepEqual(manifest.projectLibrary.browserCommands, ["list_projects", "select_project", "list_shared_projects", "mount_shared_project", "preview_shared_project_rebase", "apply_shared_project_rebase", "save_shared_project", "create_variation"]);
  assert.equal(manifest.research.engines.includes("source-command-sc-research"), true);
  assert.match(manifest.research.mutationPolicy, /report-only/);
  assert.equal(manifest.usageReceipts.researchReportField, "usage");
  assert.match(manifest.usageReceipts.loopAccountingPolicy, /accepted and rejected/);
});

test("commercial asset catalog admits only verified unrestricted CC0 packs", async () => {
  assert.equal(CC0_ASSET_CATEGORIES.length, 10);
  assert.equal(CC0_ASSET_PACKS.length >= 10, true);
  assert.equal(CC0_ASSET_POLICY.requires.commercialUse, true);
  for (const pack of CC0_ASSET_PACKS) {
    assert.equal(pack.license, "CC0-1.0");
    assert.equal(pack.rights.commercialUse, true);
    assert.equal(pack.rights.modification, true);
    assert.equal(pack.rights.redistribution, true);
    assert.equal(pack.rights.attributionRequired, false);
    assert.match(pack.sourceUrl, /^https:\/\//);
    assert.match(pack.licenseUrl, /creativecommons\.org\/publicdomain\/zero/);
    assert.ok(pack.licenseEvidence.length > 20);
  }
  const publicCatalog = JSON.parse(await readFile(resolve("public/cc0-asset-catalog.json"), "utf8"));
  assert.deepEqual(publicCatalog.categories.map((category) => category.id), CC0_ASSET_CATEGORIES.map((category) => category.id));
  assert.deepEqual(publicCatalog.packs.map((pack) => pack.id), CC0_ASSET_PACKS.map((pack) => pack.id));
});
