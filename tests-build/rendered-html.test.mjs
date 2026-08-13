import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Looplab game workshop", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Looplab — 2D Game Workshop<\/title>/i);
  assert.match(html, /LOOPLAB/);
  assert.match(html, /2D game workshop/);
  assert.match(html, /Kinetic City/);
  assert.match(html, /Export HTML/);
  assert.match(html, /Generate game/);
  assert.match(html, /Editable 2D game scene/);
  assert.match(html, /Game Director/);
  assert.match(html, /Map Studio/);
  assert.match(html, /Prepared provider input/);
  assert.match(html, /Retry prompt/);
  assert.match(html, /Project being looped/);
  assert.match(html, /Create variation/);
  assert.doesNotMatch(html, /Start OpenAI from the polished Kinetic City scaffold/);
  assert.match(html, /Connection center/);
  assert.match(html, /id="looplab-project-state"/);
  assert.match(html, /id="looplab-project-library-state"/);
  assert.match(html, /id="looplab-research-state"/);
  assert.match(html, /id="looplab-asset-catalog-state"/);
  assert.match(html, /id="looplab-visual-review-state"/);
  assert.match(html, /id="looplab-visual-critique-state"/);
  const visualCritiqueStateMatch = html.match(/<script id="looplab-visual-critique-state"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(visualCritiqueStateMatch);
  const visualCritiqueState = JSON.parse(visualCritiqueStateMatch[1]);
  assert.equal(visualCritiqueState.running, false);
  assert.equal(visualCritiqueState.critique, null);
  assert.equal(visualCritiqueState.authority.verificationEvidence, false);
  assert.doesNotMatch(JSON.stringify(visualCritiqueState), /data:image|base64,/i);
  assert.match(html, /id="looplab-agent-bridge"/);
  assert.match(html, /id="looplab-agent-command"/);
  assert.match(html, /id="looplab-agent-result"/);
  assert.match(html, /id="looplab-agent-macro"/);
  assert.match(html, /id="looplab-agent-macro-parameters"/);
  assert.match(html, /Proven command macro/);
  assert.match(html, /Apply exact plan/);
  assert.match(html, /id="looplab-agent-batch-preview"/);
  assert.match(html, /id="looplab-agent-batch-commands"/);
  assert.match(html, /Review arbitrary command batch/);
  assert.match(html, /Apply exact reviewed batch/);
  assert.match(html, /id="looplab-agent-mechanical-repair"/);
  assert.match(html, /Mechanical Doctor repair/);
  assert.match(html, /Preview safe repairs/);
  assert.match(html, /Preview bounded converge/);
  assert.match(html, /id="looplab-agent-builder-benchmark"/);
  assert.match(html, /id="looplab-agent-builder-benchmark-select"/);
  assert.match(html, /Golden brief benchmark/);
  assert.match(html, /Load into Director/);
  assert.match(html, /Evaluate current/);
  assert.match(html, /id="looplab-agent-playbook"/);
  assert.match(html, /id="looplab-agent-recipe-query"/);
  assert.match(html, /id="looplab-agent-recipe"/);
  assert.match(html, /Agent playbook/);
  assert.match(html, /Read-only proven operating recipes/);
  assert.match(html, /id="looplab-agent-guide-navigation"/);
  assert.match(html, /id="looplab-agent-guide-query"/);
  assert.match(html, /id="looplab-agent-guide-category"/);
  assert.match(html, /Agent guide navigator/);
  assert.match(html, /Source-bound rules and failure recovery without loading the full guide/);
  assert.match(html, /id="looplab-agent-context-pack"/);
  assert.match(html, /id="looplab-agent-context-view"/);
  assert.match(html, /Agent context pack/);
  assert.match(html, /Campaign truth without the embedded payload/);
  assert.match(html, /id="looplab-agent-plan"/);
  assert.match(html, /id="looplab-agent-plan-intent"/);
  assert.match(html, /Local agent planner/);
  assert.match(html, /Draft source-bound plan/);
  assert.match(html, /0 provider tokens/);
  assert.match(html, /id="looplab-agent-work-ledger"/);
  assert.match(html, /id="looplab-agent-work-actor"/);
  assert.match(html, /id="looplab-agent-work-status"/);
  assert.match(html, /Shared Codex [+] Claude work/);
  assert.match(html, /Claim once · renew · hand off with evidence/);
  assert.match(html, /id="looplab-director-state"/);
  assert.match(html, /id="looplab-preference-memory-state"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps the create-preview-export loop in the product source", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Exact selected-map truth without unrelated map documents/);
  assert.match(page, /agent-context-map-detail/);

  assert.match(page, /const STORAGE_KEY = "looplab-project-v1"/);
  assert.match(page, /window\.localStorage\.setItem/);
  assert.match(page, /requestAnimationFrame\(frame\)/);
  assert.match(page, /createRuntimeModel\(syncActiveMap\(project\)\)/);
  assert.match(page, /runtimeEngineRef\.current\.renderEntries\(\)/);
  assert.match(page, /const fixedStep = 1 \/ 60/);
  assert.match(page, /const maximumCatchUpSteps = 5/);
  assert.match(page, /engine\.update\(fixedStep\)/);
  assert.match(page, /droppedCatchUpEvents/);
  assert.doesNotMatch(page, /const solids = objects\.filter/);
  assert.match(page, /document\.addEventListener\("looplab:agent-command"/);
  assert.match(page, /document\.dispatchEvent\(new CustomEvent\("looplab:agent-response"/);
  assert.match(page, /id="looplab-project-state"/);
  assert.match(page, /id="looplab-research-state"/);
  assert.match(page, /id="looplab-asset-catalog-state"/);
  assert.match(page, /id="looplab-visual-review-state"/);
  assert.match(page, /id="looplab-visual-critique-state"/);
  assert.match(page, /Map width/);
  assert.match(page, /Map height/);
  assert.match(page, /Apply map size/);
  assert.match(page, /First map the player experiences/);
  assert.match(page, /Full game creation/);
  assert.match(page, /Story & narrative/);
  assert.match(page, /Specialist build roster/);
  assert.match(page, /Narrative Designer \+ Narrator\/Dialogue Writer/);
  assert.match(page, /Narrative Report/);
  assert.match(page, /NOT INDEPENDENT PROCESSES/);
  assert.match(page, /Connect maps/);
  assert.match(page, /Map Studio/);
  assert.match(page, /New 2\.5D map/);
  assert.match(page, /Export Path Editor JSON/);
  assert.match(page, /Open full Path Editor/);
  assert.match(page, /Timed authored routes/);
  assert.match(page, /Export route \+ receipts/);
  assert.match(page, /Objective quality targets/);
  assert.match(page, /Art direction policy/);
  assert.match(page, /Dimetric City/);
  assert.match(page, /command\.template === "dimetric" \? createTemplate\("dimetric"\)/);
  assert.match(page, /command\.op === "list_projects"/);
  assert.match(page, /command\.op === "select_project"/);
  assert.match(page, /command\.op === "create_variation"/);
  assert.match(page, /readProjectLibraryEntries/);
  assert.match(page, /persistProjectLibraryEntry/);
  assert.doesNotMatch(page, /nextPromptVariant/);
  assert.match(page, /requestAiPromptDraft/);
  assert.match(page, /\/prompt-drafts/);
  assert.match(page, /command\.op === "get_director_state"/);
  assert.match(page, /command\.op === "configure_director"/);
  assert.match(page, /command\.op === "start_ai_build"/);
  assert.match(page, /AI job was not accepted; restored the project from before this request/);
  assert.match(page, /AI loop cancelled; restored the project from before this request/);
  assert.match(page, /command\.op === "start_research"/);
  assert.match(page, /map-studio-toolbar/);
  assert.match(page, /pointInsidePolygon/);
  assert.match(page, /object\.depthSlices\?\.length/);
  assert.match(page, /Commercial use, modification, and redistribution allowed/);
  assert.match(page, /Browse & select pack/);
  assert.match(page, /command\.op === "preview_pause"/);
  assert.match(page, /command\.op === "preview_step"/);
  assert.match(page, /command\.op === "capture_visual_review"/);
  assert.match(page, /command\.op === "get_visual_review"/);
  assert.match(page, /command\.op === "select_visual_review_capture"/);
  assert.match(page, /Pre-annotated perception/);
  assert.match(page, /includeAnnotatedImages/);
  assert.match(page, /changed-region-only/);
  assert.match(page, /command\.op === "run_post_generation_qa"/);
  assert.match(page, /command\.op === "get_visual_readiness"/);
  assert.match(page, /op: "preview_batch"/);
  assert.match(page, /op: "apply_previewed_batch"/);
  assert.match(page, /verification\.automatic\.started/);
  assert.match(page, /verification\.automatic\.completed/);
  assert.match(page, /verification\.automatic\.failed/);
  assert.match(page, /verification\.automatic\.started[\s\S]+await waitForAnimationFrames\(3\)[\s\S]+postGenerationVerificationRef\.current/);
  assert.match(page, /Accepted candidates automatically enter browser QA and verification/);
  assert.match(page, /Testing candidate…/);
  assert.match(page, /Measured visual readiness/);
  assert.match(page, /Coverage and pipeline proof only — not an aesthetic approval/);
  assert.match(page, /Technical regression gate/);
  assert.match(page, /replay fixtures pass/);
  assert.match(page, /Visual QA matrix/);
  assert.match(page, /AI visual critique/);
  assert.match(page, /Send these exact captures once/);
  assert.match(page, /Advisory only/);
  assert.match(page, /command\.op === "start_visual_critique"/);
  assert.match(page, /command\.op === "get_visual_critique_job"/);
  assert.match(page, /command\.op === "cancel_visual_critique_job"/);
  assert.match(page, /command\.op === "get_visual_critique"/);
  assert.match(page, /Actual runtime joins/);
  assert.match(page, /next unique content measured/);
  assert.match(page, /profileSimulation: "in-app-device-profile"/);
  assert.match(page, /Pause the preview before deterministic stepping/);
  assert.match(page, /buildStandaloneArtifact/);
  assert.match(page, /buildStandaloneHtml as buildHeadlessHtml/);
  assert.match(page, /command\.op === "prepare_export"/);
  assert.match(page, /const enteringHosted = changes\.profile === "hosted"/);
  assert.match(page, /autoSave: changes\.autoSave \?\? \(enteringHosted \? true/);
  assert.match(page, /restoreOnBoot: changes\.restoreOnBoot \?\? \(enteringHosted \? true/);
  assert.match(page, /Open exact build/);
  assert.match(page, /export\.receipt\.completed/);
  assert.match(page, /Auditable one-file draft/);
  assert.match(page, /Release-ready one-file HTML/);
  assert.doesNotMatch(page, /Ready to share\?/);
  assert.match(page, /sandbox="allow-scripts"/);
  assert.match(page, /Exact audited artifact/);
  assert.doesNotMatch(page, /window\.open\(url/);
  assert.doesNotMatch(page, /function buildStandaloneHtml/);
  assert.match(page, /new Blob\(\[contents\]/);
  assert.match(page, /const contents = await file\.text\(\)/);
  assert.match(page, /extractProjectFromHtml\(contents\)/);
  assert.match(page, /setMode\("play"\)/);
  assert.match(page, /Codex \+ Claude checks/);
  assert.match(page, /\/providers\?refresh=1/);
  assert.match(page, /Touch coin/i);
  assert.match(page, /Respawn/i);
  assert.match(layout, /Looplab — 2D Game Workshop/);
  assert.match(packageJson, /"name": "looplab-game-builder"/);
  assert.match(packageJson, /"companion": "node scripts\/looplab-companion\.mjs"/);
  assert.match(packageJson, /"dev": "node scripts\/looplab-launch\.mjs dev"/);
  assert.match(packageJson, /"start": "node scripts\/looplab-launch\.mjs start"/);
  assert.doesNotMatch(page, /Start the companion, then scan/);
  assert.match(page, /managed companion starts with Looplab and scans automatically/i);
  assert.match(packageJson, /"providers:check": "node scripts\/looplab-providers\.mjs"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await access(new URL("../dist/server/index.js", import.meta.url));
  const localHostingBinding = await access(new URL("../.openai/hosting.json", import.meta.url)).then(
    () => true,
    (error) => {
      if (error?.code === "ENOENT") return false;
      throw error;
    },
  );
  if (localHostingBinding) {
    await access(new URL("../dist/.openai/hosting.json", import.meta.url));
  } else {
    await assert.rejects(
      access(new URL("../dist/.openai/hosting.json", import.meta.url)),
      (error) => error?.code === "ENOENT",
      "a clean public build must not invent or package a deployment binding",
    );
  }
  await access(new URL("../public/path-editor/index.html", import.meta.url));
  await access(new URL("../public/path-editor/navpath.js", import.meta.url));
});

test("ships responsive and accessible editor controls", async () => {
  const [page, exchangePanel, css, manifestSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/community-exchange-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/agent-manifest.json", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource);

  assert.equal(manifest.protocolVersion, "1.111.0");
  assert.equal(manifest.agentOperatingModel.headlessFirst, true);
  assert.match(manifest.agentOperatingModel.primarySurface, /canonical product surface/);
  assert.match(manifest.agentOperatingModel.humanUiRole, /secondary inspection/);
  assert.equal(manifest.domBridge.form.compactOnly, true);
  assert.equal(manifest.domBridge.form.responseSchema, "looplab-bounded-agent-response/v1");
  assert.equal(manifest.domBridge.form.responseLimitCharacters, 128_000);
  assert.match(manifest.domBridge.form.overflowPolicy, /parseable JSON.*retrySafe=false/i);
  assert.match(manifest.headlessResponses.boundedFormTransport, /never character-slices JSON/i);
  assert.match(page, /normalizeAgentFormCommand\(parsed\)/);
  assert.match(page, /prepareBoundedAgentFormResponse\(command, result/);
  assert.equal(manifest.agentIntentPlanning.command, "draft_agent_plan");
  assert.equal(manifest.agentIntentPlanning.nonExecuting, true);
  assert.equal(manifest.agentIntentPlanning.providerFree, true);
  assert.equal(manifest.agentBatchPreview.schemaVersion, "looplab-agent-batch-preview/v1");
  assert.equal(manifest.agentBatchPreview.previewCommand, "preview_batch");
  assert.equal(manifest.agentBatchPreview.applyCommand, "apply_previewed_batch");
  assert.equal(manifest.mechanicalRepair.previewCommand, "auto_repair");
  assert.equal(manifest.mechanicalRepair.convergenceCommand, "converge");
  assert.equal(manifest.mechanicalRepair.providerFree, true);
  assert.equal(manifest.communityExchange.schemaVersion, "looplab-community-exchange/v1");
  assert.deepEqual(manifest.communityExchange.commands, ["list_community_exchanges", "get_community_exchange_report", "preview_tiled_import", "apply_tiled_import", "preview_aseprite_import", "apply_aseprite_import", "export_community_exchange"]);
  assert.match(manifest.communityExchange.policy.collisionAuthority, /preserved byte-for-byte/i);
  assert.match(manifest.communityExchange.workflow, /both Doctor profiles.*expectedSourceDigest.*expectedPreviewDigest/i);
  assert.equal(manifest.communityExchange.headlessSuperset, true);
  assert.equal(manifest.builderBenchmark.schemaVersion, "looplab-builder-benchmark-suite/v1");
  assert.equal(manifest.builderBenchmark.taskCount, 4);
  assert.equal(manifest.builderBenchmark.providerFreeEvaluation, true);
  assert.deepEqual(manifest.builderBenchmark.commands, ["list_builder_benchmarks", "evaluate_builder_benchmark", "compare_builder_benchmark_runs"]);
  assert.equal(manifest.spatialLayoutSearch.contractSchema, "looplab-spatial-layout-contract/v1");
  assert.equal(manifest.spatialLayoutSearch.searchSchema, "looplab-spatial-layout-search/v1");
  assert.deepEqual(manifest.spatialLayoutSearch.families, ["sideview-route", "topdown-route", "dimetric-layered-route"]);
  assert.match(manifest.spatialLayoutSearch.selectionPolicy, /automaticWinner is always null/i);
  assert.match(manifest.spatialLayoutSearch.applicationPolicy, /ordinary source-bound update_map preview batch/i);
  assert.equal(manifest.providerParity.schemaVersion, "looplab-provider-parity/v2");
  assert.deepEqual(manifest.providerParity.providers, ["codex", "claude"]);
  assert.match(manifest.providerParity.sharedContractDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(manifest.providerParity.parityBoundary, /creativity.*not claimed to be identical/i);
  assert.match(manifest.agentOperatingModel.purpose, /capability amplifier/i);
  assert.equal(manifest.preferenceMemory.schemaVersion, "looplab-preference-memory/v1");
  assert.equal(manifest.transport.preferenceMemoryStateSelector, "#looplab-preference-memory-state");
  assert.equal(manifest.productScope.dimension, "2d");
  assert.ok(manifest.productScope.includes.includes("dimetric/isometric 2.5D"));
  assert.ok(manifest.productScope.excludes.includes("3D engine"));
  assert.ok(manifest.templates.includes("systems"));
  assert.equal(manifest.agentReadiness.schemaVersion, "looplab-agent-readiness/v1");
  assert.match(manifest.agentReadiness.policy, /passing current profile may protect a verified iteration but is not release readiness/i);
  assert.match(manifest.agentReadiness.policy, /prototype exports remain drafts/i);

  assert.match(page, /aria-label="Project name"/);
  assert.match(page, /role="tablist"/);
  assert.match(page, /aria-modal="true"/);
  assert.match(page, /onPointerCancel=\{onCanvasPointerUp\}/);
  assert.match(page, /aria-label="Preview touch controls"/);
  assert.match(page, /action="interact"/);
  assert.match(page, /startProjectTemplate\("systems"\)/);
  assert.match(page, /preview-choice-layer/);
  assert.match(page, /Readiness by profile/);
  assert.match(page, /One-file release target/);
  assert.match(page, /release-only finding/);
  assert.match(page, /id="looplab-agent-plan"/);
  assert.match(page, /id="looplab-agent-change-feed"/);
  assert.match(page, /<CommunityExchangePanel/);
  assert.match(exchangePanel, /id="looplab-community-exchange"/);
  assert.match(exchangePanel, /Preview Tiled import/);
  assert.match(exchangePanel, /Preview Aseprite import/);
  assert.match(exchangePanel, /Apply exact reviewed import/);
  assert.match(exchangePanel, /View stale original/);
  assert.match(exchangePanel, /Object layers and generated pixels are advisory/);
  assert.match(page, /id="looplab-agent-builder-benchmark"/);
  assert.match(page, /id="looplab-director-state"/);
  assert.match(page, /id="looplab-spatial-layout-search"/);
  assert.match(page, /Spatial route explorer/);
  assert.match(page, /SpatialLayoutMiniMap/);
  assert.match(page, /Create protected variation/);
  assert.match(page, /id="looplab-preference-memory-state"/);
  assert.match(page, /Studio preference memory/);
  assert.match(page, /providerParity:/);
  assert.match(page, /className="provider-parity-contract"/);
  assert.match(page, /Shared loop contract/);
  assert.match(page, /Codex ↔ Claude/);
  assert.match(page, /No automatic winner/);
  assert.match(page, /Review both in play before choosing/);
  assert.match(page, /Hard-gate evidence incomplete/);
  assert.match(page, /data-relation=/);
  assert.equal(manifest.iterationLedger.structuralDiffSchema, "looplab-structural-iteration-diff/v1");
  assert.match(manifest.iterationLedger.structuralDiffPolicy, /authored world space/i);
  assert.match(page, /StructuralIterationOverlay/);
  assert.match(page, /Stable-ID world-space evidence/);
  assert.match(page, /change-focused world crop/);
  assert.match(page, /Dashed · before \/ removed/);
  assert.match(page, /Solid · after \/ added/);
  assert.match(page, /Evidence, not a verdict/);
  assert.match(page, /import \{ flushSync \} from "react-dom"/);
  assert.match(page, /flushSync\(\(\) => setProject\(syncedNext\)\);\s*projectRef\.current = syncedNext;/);
  assert.match(css, /\.iteration-structural-diff\s*\{[^}]*min-width:\s*0/s, "structural comparison must shrink inside the Director column");
  assert.match(css, /\.structural-chain\.before\s*\{[^}]*stroke-dasharray/s, "before collision chains must remain distinguishable without color");
  assert.match(css, /\.structural-chain\.after\s*\{/);
  assert.match(page, /Resume agent memory/);
  assert.match(page, /Local agent planner/);
  assert.match(page, /Draft source-bound plan/);
  assert.match(css, /@media \(max-width: 920px\)/);
  assert.match(page, /className="inspector-scroll-area"/);
  assert.match(css, /\.inspector-scroll-area\s*\{[^}]*flex:\s*1 1 0[^}]*overflow:\s*auto/s, "the Inspector controls and asset tools must share one usable growing scroll region");
  assert.match(css, /\.preview-touch-controls/);
  assert.match(css, /\.preview-systems-hud/);
  assert.match(css, /\.statusbar \.agent-bridge-console form \.agent-context-pack button,\s*\.statusbar \.agent-bridge-console form \.agent-change-feed button\s*\{[^}]*background: #3a3a37/s, "context and change-feed controls must override the generic lime Agent API button rule");
  assert.match(css, /\.agent-readiness-card\[data-release-blocking="true"\]/);
  assert.match(css, /\.agent-intent-plan-result/);
  assert.match(css, /\.agent-community-exchange/);
  assert.match(css, /\.agent-guide-navigation/);
  assert.match(css, /\.agent-guide-results article\[data-guide-kind="recovery"\]/);
  assert.match(css, /\.statusbar \.agent-bridge-console form \.agent-guide-actions button\s*\{[^}]*background: #3a3a37/s, "guide controls must override the generic lime Agent API button rule");
  assert.match(css, /\.community-exchange-preview\.is-ready/);
  assert.match(css, /\.provider-parity-contract/);
  assert.match(css, /background: #e8e7e2/);
  assert.match(css, /spatial-candidate-grid/);
  assert.match(css, /spatial-layout-preview/);
  assert.match(css, /spatial-preview-route\.primary/);
  assert.match(css, /\.doctor-modal\s*\{[^}]*width:\s*min\(900px,100%\)/s, "Project Doctor must fit inside the already padded mobile backdrop");
  assert.match(css, /\.statusbar \.agent-bridge-console form \.agent-builder-benchmark button\s*\{[^}]*background: #3a3a37/s, "benchmark controls must override the generic lime Agent API button rule");
  assert.doesNotMatch(css, /@media \(pointer: coarse\)/, "desktop touch hardware must not force mobile controls into the editor");
  assert.match(css, /viewport-portrait-390x844 \.preview-touch-controls/);
  assert.match(css, /\.stage-viewport\.profile-touch \.preview-touch-controls/);
  assert.doesNotMatch(css, /\.stage-viewport\.playing \.preview-touch-controls \{ display: grid; \}/, "desktop profiles must keep touch controls hidden even in a narrow editor window");
  assert.match(css, /viewport-portrait-390x844 \.canvas-wrap[\s\S]+max-width: 390px/);
  assert.match(css, /min-width: 48px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /button:focus-visible/);
  assert.match(page, /data-preview-focus=/);
  assert.match(page, /Focus playtest/);
  assert.match(page, /command\.focus !== false/);
  assert.match(page, /workspace: \{ focused: previewFocusRef\.current, viewportPreset \}/);
  assert.match(css, /\.workspace\.preview-focus/);
  assert.match(css, /\.workspace\.map-studio-layout/);
  assert.match(css, /\.map-studio-toolbar/);
  assert.match(css, /\.workspace\.preview-focus \.scene-panel[\s\S]+display: none/);
  assert.equal(manifest.editorPreview.defaultFocused, true);
  assert.equal(manifest.editorPreview.headlessState, "get_preview_state.workspace");
  assert.equal(manifest.exportReceipt.prepareCommand, "prepare_export");
  assert.equal(manifest.exportReceipt.sourceBinding, "receipt.source.sourceDigest must equal the current Project Doctor sourceDigest");
  assert.equal(manifest.visualReviewStateSelector, "#looplab-visual-review-state");
  assert.equal(manifest.visualCritiqueStateSelector, "#looplab-visual-critique-state");
  assert.equal(manifest.verification.visualReviewCommand, "capture_visual_review");
  assert.equal(manifest.verification.visualPerception.colorAccessibility.schemaVersion, "looplab-color-accessibility/v1");
  assert.match(manifest.verification.visualPerception.colorAccessibility.claimBoundary, /never claim taste/);
  assert.match(page, /Exact-pixel color accessibility/);
  assert.match(page, /Machado simulations are diagnostic/);
  assert.match(css, /\.visual-review-body\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*min-width:\s*0/s, "Visual QA must shrink inside the Director column instead of extending beneath the stage canvas");
  assert.match(css, /\.visual-review-body\s*>\s*\*\s*\{[^}]*min-width:\s*0/s, "every Visual QA child must be allowed to shrink with its sidebar");
  assert.match(css, /\.director-scroll \.visual-critique-controls\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s, "provider critique controls must stack inside the Director sidebar");
  assert.equal(manifest.verification.automatedBrowserCommand, "run_post_generation_qa");
  assert.equal(manifest.verification.automaticAfterAcceptedBrowserGeneration, true);
  assert.match(manifest.verification.automaticFailurePolicy, /Preserve the accepted candidate as unverified/);
  assert.match(manifest.verification.promotionPolicy, /promotion remains an explicit release decision/i);
  assert.ok(manifest.commands.includes("run_post_generation_qa"));
  assert.ok(manifest.commands.includes("get_visual_readiness"));
  assert.ok(manifest.commands.includes("start_visual_critique"));
  assert.ok(manifest.commands.includes("get_visual_critique_job"));
  assert.ok(manifest.commands.includes("cancel_visual_critique_job"));
  assert.ok(manifest.commands.includes("get_visual_critique"));
  assert.ok(manifest.commands.includes("record_replay_case"));
  assert.ok(manifest.commands.includes("run_replay_suite"));
  assert.ok(manifest.commands.includes("export_path_editor_navigation"));
  assert.ok(manifest.commands.includes("add_dimetric_map"));
  assert.ok(manifest.commands.includes("update_asset"));
  assert.ok(manifest.commands.includes("get_authored_route_document"));
  assert.ok(manifest.commands.includes("set_authored_route_document"));
  assert.ok(manifest.commands.includes("update_authored_route_actor"));
  assert.ok(manifest.commands.includes("update_authored_route_step"));
  assert.ok(manifest.commands.includes("update_authored_route_meeting"));
  assert.ok(manifest.commands.includes("verify_authored_route_document"));
  assert.ok(manifest.commands.includes("list_command_macros"));
  assert.ok(manifest.commands.includes("preview_command_macro"));
  assert.ok(manifest.commands.includes("apply_command_macro"));
  assert.ok(manifest.commands.includes("list_agent_recipes"));
  assert.ok(manifest.commands.includes("get_agent_recipe"));
  assert.ok(manifest.commands.includes("get_work_ledger"));
  assert.ok(manifest.commands.includes("get_project_context"));
  assert.ok(manifest.commands.includes("get_agent_changes"));
  assert.ok(manifest.commands.includes("list_builder_benchmarks"));
  assert.ok(manifest.commands.includes("evaluate_builder_benchmark"));
  assert.ok(manifest.commands.includes("compare_builder_benchmark_runs"));
  assert.ok(manifest.commands.includes("add_work_item"));
  assert.ok(manifest.commands.includes("claim_work_item"));
  assert.ok(manifest.commands.includes("update_work_item"));
  assert.ok(manifest.commands.includes("release_work_item"));
  for (const operation of ["get_spatial_layout_contract", "suggest_spatial_layout_contract", "set_spatial_layout_contract", "remove_spatial_layout_contract", "run_spatial_layout_search", "materialize_spatial_layout"]) {
    assert.ok(manifest.commands.includes(operation));
  }
  assert.deepEqual(manifest.commandMacros.macros.map((macro) => macro.id), ["place-supported-prop", "connect-maps-round-trip", "protect-completion-witness"]);
  assert.equal(manifest.commandMacros.policy.builtInOnly, true);
  assert.equal(manifest.commandMacros.policy.nestedMacros, false);
  assert.match(manifest.headlessResponses.commandMacroWorkflow, /preview_command_macro.*apply_command_macro/i);
  assert.equal(manifest.agentPlaybook.schemaVersion, "looplab-agent-playbook/v1");
  assert.equal(manifest.agentPlaybook.count, 10);
  assert.equal(manifest.agentPlaybook.policy.autoExecution, false);
  assert.deepEqual(manifest.agentPlaybook.commands, ["list_agent_recipes", "get_agent_recipe"]);
  assert.match(manifest.agentPlaybook.registryDigest, /^sha256:[a-f0-9]{64}$/);
  assert.ok(manifest.mcpServer.resources.includes("looplab://agent-playbook"));
  assert.match(manifest.headlessResponses.agentPlaybookWorkflow, /read-only context.*never execute/i);
  assert.equal(manifest.agentGuideNavigation.schemaVersion, "looplab-agent-guide-index/v1");
  assert.equal(manifest.agentGuideNavigation.counts.invariants, 16);
  assert.equal(manifest.agentGuideNavigation.counts.lifecycle, 10);
  assert.match(manifest.agentGuideNavigation.indexDigest, /^sha256:[a-f0-9]{64}$/);
  assert.ok(manifest.commands.includes("get_agent_guide_index"));
  assert.ok(manifest.mcpServer.resources.includes("looplab://agent-guide-index"));
  assert.equal(manifest.transport.agentGuideNavigationSelector, "#looplab-agent-guide-navigation");
  assert.match(manifest.headlessResponses.agentGuideNavigationWorkflow, /orientation only/i);
  assert.equal(manifest.agentWorkLedger.schemaVersion, "looplab-agent-work-ledger/v1");
  assert.equal(manifest.agentWorkLedger.privacy.exportedHtml, false);
  assert.equal(manifest.agentWorkLedger.privacy.providerContext, false);
  assert.match(manifest.headlessResponses.sharedWorkLedgerWorkflow, /expectedLedgerDigest/);
  assert.equal(manifest.agentChangeFeed.schemaVersion, "looplab-agent-change-feed/v1");
  assert.equal(manifest.agentChangeFeed.limits.retainedEvents, 128);
  assert.match(manifest.headlessResponses.agentChangeFeedWorkflow, /resyncRequired/);
  assert.equal(manifest.transport.changeFeedSelector, "#looplab-agent-change-feed");
  assert.equal(manifest.transport.agentChangeRecordedEvent, "looplab:agent-change-recorded");
  assert.equal(manifest.transport.workLedgerSelector, "#looplab-agent-work-ledger");
  assert.equal(manifest.transport.projectContextSelector, "#looplab-agent-context-pack");
  assert.equal(manifest.transport.workLedgerChangeEvent, "looplab:work-ledger-changed");
  assert.equal(manifest.agentProjectContext.schemaVersion, "looplab-agent-project-context/v1");
  assert.deepEqual(manifest.agentProjectContext.views, ["campaign", "map"]);
  assert.match(manifest.headlessResponses.agentProjectContextWorkflow, /never mutation input or verification evidence/i);
  assert.match(page, /command\.compact === true/);
  assert.match(page, /\["get_agent_changes", "get_work_ledger", "get_project_context"\]\.includes/);
  assert.match(page, /apply_batch requires expectedSourceDigest from the Project Doctor report/);
  assert.match(manifest.headlessResponses.mutationPrecondition, /expectedSourceDigest/);
  assert.match(manifest.headlessResponses.collisionPolicy, /authored-only/);
  assert.ok(manifest.templates.includes("dimetric"));
  assert.equal(manifest.visualAuthoring.dimetricMapEditor.starterTemplate, "dimetric");
  assert.equal(manifest.visualAuthoring.navigationGraph.pathEditorRoundTrip.extension, "looplab-rich-route-v2");
  assert.equal(manifest.visualAuthoring.navigationGraph.authoredRouteEnvelope.digestAlgorithm, "sha256-jcs-v1");
  assert.equal(manifest.gameDirector.artDirectionPolicy.default, "explore");
  assert.match(manifest.gameDirector.artDirectionPolicy.qualityBoundary, /do not silently become palette/i);
  assert.ok(manifest.requiredWorkflow.includes("run_replay_suite"));
  assert.deepEqual(manifest.deterministicReplay.commands, ["preview_playtest_replay", "promote_playtest_replay", "record_replay_case", "run_replay_suite", "remove_replay_case"]);
  assert.equal(manifest.deterministicReplay.playtestPromotion.sessionSchemaVersion, "looplab-playtest-session/v2");
  assert.equal(manifest.deterministicReplay.playtestPromotion.previewCommand, "preview_playtest_replay");
  assert.equal(manifest.deterministicReplay.playtestPromotion.applyCommand, "promote_playtest_replay");
  assert.match(manifest.deterministicReplay.playtestPromotion.exactness, /exact completed fixed-step boundaries/i);
  assert.match(manifest.deterministicReplay.rerecordPolicy, /higher revision/);
  assert.equal(manifest.visualReadiness.command, "get_visual_readiness");
  assert.deepEqual(manifest.visualReadiness.checks, ["primary-art-coverage", "player-animation-identity", "art-direction-cohesion", "sprite-pipeline-proof"]);
  assert.match(manifest.visualReadiness.truthPolicy, /never claims to judge taste/i);
  assert.match(css, /\.visual-readiness-card/);
  assert.match(manifest.verification.viewportTruthPolicy, /targetViewport separately from the actual browser viewport/);
  assert.match(manifest.verification.imageStoragePolicy, /never screenshot data URLs/);
  assert.match(css, /\.export-receipt\.is-stale/);
  assert.match(css, /\.export-receipt dl/);
  assert.match(css, /\.export-preview-modal/);
  assert.match(css, /\.export-preview-frame/);
});

test("Path Editor preserves elevation, stable identities, and the complete rich-route extension", async () => {
  const editor = await readFile(new URL("../public/path-editor/index.html", import.meta.url), "utf8");

  assert.match(editor, /if \(doc\.looplab && typeof doc\.looplab === 'object'\) output\.looplab = clone\(doc\.looplab\)/);
  assert.match(editor, /looplab: data\.looplab && typeof data\.looplab === 'object'/);
  assert.match(editor, /rich timed route preserved/);
  assert.match(editor, /if \(l\.locked\) o\.locked = true/);
  assert.match(editor, /if \(Number\.isFinite\(n\.z\)\) o\.z = n\.z/);
  assert.match(editor, /if \(e\.id\) o\.id = e\.id/);
  assert.match(editor, /if \(a\.name\) o\.name = a\.name/);
  assert.match(editor, /Number\.isFinite\(p\[2\]\)/);
});

test("uses a light-grey review and keying matte for new game artwork", async () => {
  const [scaffold, normalizer, guide, css] = await Promise.all([
    readFile(new URL("../lib/looplab-directed-scaffold.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/normalize-light-gray-sprite-strip.py", import.meta.url), "utf8"),
    readFile(new URL("../public/AI_AGENT_GUIDE.md", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(scaffold, /color: "#d9d9d9"/);
  assert.match(scaffold, /use: \["game-art-review", "background-keying"\]/);
  assert.match(scaffold, /finalOutput: "transparent"/);
  assert.match(normalizer, /--key-min", "170"/);
  assert.match(normalizer, /--key-max", "245"/);
  assert.match(normalizer, /border-connected-light-neutral-gray/);
  assert.match(guide, /light neutral grey `#d9d9d9`/i);
  assert.match(guide, /must end with transparent alpha where no artwork exists/i);
  assert.match(guide, /preview_command_macro/);
  assert.match(guide, /expectedExpansionDigest/);
  assert.match(css, /--art-review-light: #d9d9d9/);
  assert.match(css, /\.pixel-preview[^}]+background-color: var\(--art-review-light\)/);
  assert.match(css, /\.pack-preview-media[^}]+background-color: var\(--art-review-light\)/);
});

test("routes verification through game-playtest with Playwright automation", async () => {
  const { routeGameStudioWork } = await import(new URL("../lib/looplab-capability-router.mjs", import.meta.url).href);
  const route = routeGameStudioWork({ runtimeProfile: { dimension: "2d", framework: "phaser" } }, { track: "gameplay", prompt: "Improve map flow" });
  const verification = route.route.at(-1);

  assert.equal(verification.capabilityId, "game-playtest");
  assert.match(verification.label, /Playtest & QA.*Playwright/i);
  assert.ok(verification.owns.includes("playwright-browser-automation"));
  assert.equal(verification.gate, "evidence-required");
  assert.match(route.boundaries.verification, /Playwright browser input/i);
});

test("keeps the in-app API-key field transient and stores only a Windows-encrypted credential", async () => {
  const [page, companion, nativePrompt, manifestSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/looplab-companion.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/looplab-set-api-key.ps1", import.meta.url), "utf8"),
    readFile(new URL("../public/agent-manifest.json", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource);
  const nativeKeyLauncher = companion.slice(
    companion.indexOf("async function startApiKeyConnection"),
    companion.indexOf("async function saveApiKeyFromBrowser"),
  );
  const browserKeySaver = companion.slice(
    companion.indexOf("async function saveApiKeyFromBrowser"),
    companion.indexOf("async function startJob"),
  );

  assert.match(page, /action\.kind === "native-key"/);
  assert.match(page, /type="password"/i);
  assert.match(page, /setProviderKeyDraft\(""\)/);
  assert.match(page, /127\.0\.0\.1/);
  assert.match(page, /never placed in game data or console output/i);
  assert.match(companion, /providers\\\/\(codex\|claude\|openai\|anthropic\)/);
  assert.match(companion, /providers\\\/\(openai\|anthropic\)\\\/key/);
  assert.match(nativeKeyLauncher, /"-WindowStyle", "Hidden"/);
  assert.match(nativeKeyLauncher, /windowsHide: false/);
  assert.doesNotMatch(nativeKeyLauncher, /windowsHide: true/);
  assert.match(browserKeySaver, /"-ReadFromStdin"/);
  assert.match(browserKeySaver, /windowsHide: true/);
  assert.match(browserKeySaver, /child\.stdin\.end\(key, "utf8"\)/);
  assert.doesNotMatch(browserKeySaver, /ArgumentList.*key|console\.log\(key|process\.env\[[^\]]+\] = key/s);
  assert.match(nativePrompt, /UseSystemPasswordChar = \$true/);
  assert.match(nativePrompt, /\[Console\]::In\.ReadToEnd\(\)/);
  assert.match(nativePrompt, /ShowInTaskbar = \$true/);
  assert.match(nativePrompt, /SetForegroundWindow/);
  assert.match(nativePrompt, /BringToFront/);
  assert.match(nativePrompt, /ProtectedData\]::Protect/);
  assert.match(nativePrompt, /looplab-dpapi-v1:/);
  assert.match(nativePrompt, /Array\]::Clear\(\$keyBytes/);
  assert.match(nativePrompt, /\$stage = "prepare-vault"/);
  assert.match(nativePrompt, /\.new-\$PID-/);
  assert.match(nativePrompt, /secure-key-save-failed/);
  assert.doesNotMatch(nativePrompt, /\$_\.Exception\.Message/);
  assert.equal(manifest.companion.browserReceivesApiKey, "transient-masked-field-only");
  assert.ok(manifest.companion.apiKeyBoundaries.includes("no-project-storage"));
  assert.ok(manifest.companion.apiKeyStorage.includes("windows-current-user-dpapi-vault"));
  assert.equal(manifest.domBridge.commandEvent, "looplab:agent-command");
  assert.equal(manifest.domBridge.responseEvent, "looplab:agent-response");
  assert.equal(manifest.domBridge.form.commandInput, "#looplab-agent-command");
  assert.equal(manifest.domBridge.form.result, "#looplab-agent-result");
});

test("provider-scoped connections resume or cancel independently", async () => {
  const [page, companion, processTree, manifestSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/looplab-companion.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/looplab-process-tree.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/agent-manifest.json", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource);
  assert.match(companion, /function runningProviderConnection\(provider = null\)/);
  assert.match(companion, /findRunningProviderConnection\(providerConnections, provider\)/);
  assert.match(companion, /const activeConnection = runningProviderConnection\(provider\)/);
  assert.doesNotMatch(companion, /A provider connection is already running/);
  assert.match(companion, /provider\.login\.resumed/);
  assert.match(companion, /activeProviderConnections/);
  assert.match(companion, /provider-connections\\\/\(\[\^\/\]\+\)\\\/cancel/);
  assert.match(companion, /terminateProcessTree/);
  assert.match(processTree, /taskkill\.exe/);
  assert.match(page, /Resume sign-in/);
  assert.match(page, /Cancel sign-in/);
  assert.match(page, /type\.endsWith\("cancelled"\)/);
  assert.equal(manifest.companion.providerConnectionCancel, "/provider-connections/{id}/cancel");
  assert.match(manifest.companion.providerConnectionResume, /existing connection/i);
  assert.equal(manifest.providerRouting.defaultMode, "fallback");
  assert.match(manifest.providerRouting.isolation, /independent/i);
});
