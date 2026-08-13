#!/usr/bin/env node

import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  applyAgentCommand,
  buildStandaloneHtml,
  summarizeProject,
  validateProject,
} from "../lib/looplab-agent-core.mjs";
import {
  compactLoopComparison,
  compactLoopEvaluation,
  compareProjects,
  evaluateProject,
  selectLoopEvaluationProfile,
} from "../lib/looplab-quality.mjs";
import {
  LOOPLAB_PROVIDER_CONTEXT_POLICY,
  buildProviderIterationContext,
  compactQualityReport,
  measureProviderIterationContext,
  planProviderPasses,
  preflightProviderIterationContext,
  providerGoalForPass,
  publicProviderPassPlan,
  selectProviderPass,
} from "../lib/looplab-provider-context.mjs";
import { assertProviderPayloadPrivacy } from "../lib/looplab-project-privacy.mjs";
import { buildOpenAiResponsesRequest, requireOpenAiStructuredResult } from "../lib/looplab-openai-request.mjs";
import { requestProviderJson } from "../lib/looplab-provider-http.mjs";
import { boundedProviderDiagnostic, parseProviderJson, runProviderProcess } from "../lib/looplab-provider-process.mjs";
import { generateSpritePixels, generateTilesetPixels } from "../lib/looplab-pixel-generator.mjs";
import { encodePng } from "../lib/png-node.mjs";
import { routeGameStudioWork } from "../lib/looplab-capability-router.mjs";
import { doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import { stageAtomicPortalCommand } from "../lib/looplab-iteration-command-staging.mjs";
import { authoredColliderForPlacement, visualBoundsForAsset } from "../lib/looplab-authored-collision.mjs";
import { runDeterministicPlaytest } from "../lib/looplab-verification.mjs";
import { summarizeLoopOutcome } from "../lib/looplab-loop-outcome.mjs";
import { appendLoopAttempt, appendLoopRun, nextLoopAttemptNumber, normalizeLoopHistory } from "../lib/looplab-loop-history.mjs";
import { claudeActivityFromJsonLine, codexActivityFromJsonLine, providerLivenessSnapshot, providerProgressMessage } from "../lib/looplab-provider-activity.mjs";
import { buildClaudeCliInvocation, inspectClaudeCliOutput, requireClaudeCliStructuredResult } from "../lib/looplab-claude-cli.mjs";
import { createProviderParityReceipt } from "../lib/looplab-provider-parity.mjs";
import { createProviderFailoverReceipt, isRetryableProviderPathFailure } from "../lib/looplab-provider-routing.mjs";
import { buildCodexCliInvocation, createProviderModelSelectionReceipt } from "../lib/looplab-provider-model-policy.mjs";
import { buildAnthropicMessagesRequest, requireAnthropicStructuredResult } from "../lib/looplab-anthropic-api.mjs";
import { artDirectionInstruction, normalizeArtDirectionPolicy } from "../lib/looplab-art-direction.mjs";
import { inspectVerbArchitecture, LOOPLAB_VERB_ARCHITECTURE_POLICY } from "../lib/looplab-verb-architecture.mjs";
import { inspectGameplayProgram, LOOPLAB_GAMEPLAY_RULE_POLICY } from "../lib/looplab-gameplay-rules.mjs";
import { inspectCombatProgram, LOOPLAB_COMBAT_POLICY } from "../lib/looplab-combat.mjs";
import { inspectActorProgram, LOOPLAB_ACTOR_POLICY } from "../lib/looplab-actors.mjs";
import { inspectNarrativeContract, LOOPLAB_NARRATIVE_CONTRACT_POLICY } from "../lib/looplab-narrative.mjs";
import { normalizeAppliedPreferenceContext } from "../lib/looplab-preference-memory.mjs";
import { LOOPLAB_VISUAL_IDENTITY_POLICY } from "../lib/looplab-visual-identity.mjs";
import {
  aggregateUsageReceipts,
  attachUsageReceipt,
  createUsageReceipt,
  usageFromCliOutput,
  usageReceiptSummary,
} from "../lib/looplab-provider-usage.mjs";

const argv = process.argv.slice(2);
function providerAuthMethod(provider) {
  return process.env[`LOOPLAB_PROVIDER_AUTH_METHOD_${String(provider).toUpperCase()}`] || process.env.LOOPLAB_PROVIDER_AUTH_METHOD || null;
}

function option(name, fallback = undefined) {
  const inline = argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : fallback;
}

function flag(name) {
  return argv.includes(name);
}

function emit(type, payload = {}) {
  process.stdout.write(`${JSON.stringify({ type, timestamp: new Date().toISOString(), ...payload })}\n`);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

const parseAgentJson = (value) => parseProviderJson(value, {
  invalidMessage: "The AI response did not contain a valid JSON iteration object.",
});

function normalizeIterationProposal(proposal) {
  if (!proposal || !Array.isArray(proposal.commands)) return proposal;
  return {
    ...proposal,
    commands: proposal.commands.map((command, index) => {
      if (!command || typeof command !== "object" || Array.isArray(command) || typeof command.op !== "string" || !command.op) {
        throw new Error(`AI command ${index + 1} must be an object with a non-empty op.`);
      }
      if (typeof command.argumentsJson !== "string") return command;
      let argumentsValue;
      try {
        argumentsValue = JSON.parse(command.argumentsJson);
      } catch {
        throw new Error(`AI command ${index + 1} argumentsJson is not valid JSON.`);
      }
      if (!argumentsValue || typeof argumentsValue !== "object" || Array.isArray(argumentsValue)) {
        throw new Error(`AI command ${index + 1} argumentsJson must decode to an object.`);
      }
      if (typeof argumentsValue.op === "string" && argumentsValue.op !== command.op) {
        throw new Error(`AI command ${index + 1} op does not match its argumentsJson payload.`);
      }
      const argumentsWithoutOp = { ...argumentsValue };
      delete argumentsWithoutOp.op;
      return { op: command.op, ...argumentsWithoutOp };
    }),
  };
}

const runProcess = (command, args, input, cwd, timeoutMs, onStdoutLine = null) => runProviderProcess({
  command,
  args,
  input,
  cwd,
  timeoutMs,
  timeoutLabel: "provider request",
  onStdoutLine,
});

const PROVIDER_PROGRESS_INTERVAL_MS = Math.max(5_000, Number(process.env.LOOPLAB_PROVIDER_PROGRESS_INTERVAL_MS ?? 30_000));

const ITERATION_PROMPT = `You are the improvement engine for a Looplab 2D HTML game.
Return only one JSON object matching the supplied output schema. Make one coherent, testable improvement pass.

Use the current project, quality report, prior attempts, and user goal supplied on stdin. Preserve working behavior. Prefer a small set of high-leverage commands over random churn. Do not return a full replacement project unless necessary.

PERMANENT CAPABILITY-HARVESTING RULE: When a hard problem exposes a repeatable builder failure, do not hide it with a project-only workaround or weaker acceptance gate. Use an existing reusable LoopLab capability when available. If the required command, schema, runtime, Doctor, UI/headless, provider-context, or agent-guidance capability is missing, identify that exact reusable gap honestly in the proposal summary or specialist review so the outer Codex loop can fix and regression-test the builder before replaying the candidate. Keep game-specific narrative, art direction, level content, and balance in the project rather than builder defaults.

The input includes artDirection. Objective quality conditions are outcome tests, not visual-style locks. Follow artDirection.instruction exactly: only explicit user locks may freeze a palette, setting, rendering style, material language, camera format, or character design.
The input also includes visualIdentity. Inherit its applicable directives, exclusions, and semantic reference notes by default. Only userAuthored=true directives may be locks. Never change the project identity implicitly: use set_visual_identity or remove_visual_identity explicitly, and keep provider output advisory until the outer visual review. Image-reference upload consent is handled per art job outside this game-iteration request; never assume stored references authorize upload.

The input may include preferenceContext. It contains only deliberate, context-matched user statements or source-bound candidate choices. Treat it as soft guidance, never as a score, hidden reward, hard acceptance condition, or automatic winner. The current user goal, current explicit style locks, and current authored project override it. Do not infer anything from missing preferences, reuse an entry outside its recorded context, or expose provenance IDs as game content.

The input includes capabilityRoute.agentPlan. Treat it as an ordered specialist review plan executed inside this provider request, not as a claim that separate model processes ran. Return one concise agentReviews receipt for every planned role with receiptRequired=true. Use verdict=block only when the proposed commands should not proceed; revise means you changed the proposal to resolve the role's concern. Never fabricate Playwright or Project Doctor results—the application runs those gates independently after your response.

The input includes capabilityRoute.runtimeSelection and capabilityRoute.productionPlan. They are LoopLab-owned deterministic policy, not an invitation to run another model or substitute a provider-specific engine preference. Follow selectedFramework for a new-game creation pass. During an existing-project improvement, preserve the current renderer unless explicitOverride=true; when migrationRequiresOptIn=true, report the recommendation without silently rewriting the engine. Phaser is optional and additive: use it when the receipt predicts a gameplay or maintainability benefit, keep simulation and authored collision renderer-independent, and inline the browser script build for a one-file project. Never treat single-file delivery alone as a reason to reject Phaser.

The input also includes capabilityRoute.context.narrative, capabilityRoute.productionPlan.narrative, and narrativeContract. When included=true, perform two ordered stages inside this same provider invocation. The Narrative Designer owns causal structure, continuity, choices, state bindings, and ending payoff. The Narrator & Dialogue Writer owns narrator voice, dialogue, barks, tutorial copy, and readable text equivalents. Use set_narrative_contract to bind required beats, lines, and endings to stable gameplay/map/feature IDs and acceptanceTestIds. Repair report findings instead of adding disconnected prose. When included=false, do not inflate a mechanics-first game with mandatory lore. These are staged roles, not extra provider calls or a second runtime state store.

The input also includes capabilityRoute.reuseGuide. Enforce its architecture and one-file adaptation. A routed capability means the builder can support it; it is not proof the current project implements it. Activate optional movement, chunk, animation, camera, effect, or streaming systems only by adding explicit authored data and acceptance coverage. Never add a service worker, runtime fetch, CDN, external sidecar, or multi-file PWA dependency to a one-file candidate.

The input includes verbArchitecture.policy and verbArchitecture.inspection. Author verbArchitecture version 2 from recurring player decisions, not a mechanic quota: one deep verb is valid and extra verbs must earn their input, attention, onboarding, implementation, and feedback cost. Give each active verb purpose, activation, standalone/dependency truth, semantic input, authored affordances, observable state changes, readable feedback, runtime IDs, and executable test IDs. Connect only intentional relationships with an explicit operator and cadence. Place independent uses and recurring relationships across authored teaching/practice plus pressure/mastery/recovery applications instead of saving them for a finale. Model the repeatable decide-act-feedback loop and any resource sources, sinks, pressure, and recovery. A named mechanic, score matrix, prose-only test, or finale checklist is not proof.

The input also includes gameplayProgram.policy and gameplayProgram.inspection. Implement sophisticated mechanics with set_gameplay_program so the deterministic editor preview, replay runner, and exported offline HTML execute the same typed variables and rules. Input triggers support phase=pressed|held|released (default pressed), and overlap triggers support edge=enter|stay|exit (default enter). Use these runtime phases directly; never approximate hold/release or exit with project-only latch variables. Prefer input, event, overlap, and state triggers with bounded effects over prose-only feature claims. Every verb implementationId should resolve to an actual input action, gameplay rule, object, path, or map—not a feature-contract description.

If project.templateProvenance.adaptationStatus is starter, replace its neutral sample labels and semantics with game-specific authored meaning before setting adaptationStatus to adapted. Do not carry a starter's genre, character, traversal verb, object names, palette, or setting into a different brief merely because its geometry is convenient.

Structured-output providers require each commands item to use {"op":"set_project","argumentsJson":"{\\"changes\\":{\\"background\\":\\"#242424\\"}}"}. argumentsJson must be valid JSON text for an object containing every command field except op. Providers without a structured-output schema may return the direct command objects shown below.

Supported project commands:
- set_project: {"op":"set_project","changes":{"name":"...","background":"#rrggbb","gravity":1500,"grid":20,"controlMode":"platformer","inputActions":[{"id":"action-id","label":"Action","bindings":["KeyJ"],"animationState":"action","onboarding":true,"replayEvent":true}]}}. inputActions is an atomic validated replacement; author it in the same command as a gameplay program only when all rule action IDs resolve against the replacement.
- set_runtime_profile: {"op":"set_runtime_profile","framework":"canvas|phaser","reason":"..."}. Use the exact capabilityRoute.runtimeSelection receipt. This atomically selects one primary adapter and its verified one-file delivery; never combine Phaser, Pixi, and melonJS as competing frame owners.
- set_gameplay_program: {"op":"set_gameplay_program","program":{"version":1,"variables":[{"id":"energy","label":"Energy","type":"number","initial":0,"min":0,"max":5,"visible":true}],"rules":[{"id":"channel-energy","name":"Channel energy while held","enabled":true,"trigger":{"type":"input","actionId":"channel","phase":"held","mapId":"map-1"},"conditions":[],"once":"never","effects":[{"type":"add-variable","variableId":"energy","value":1},{"type":"emit","event":"energy.changed"}]}]}}
- set_narrative_contract: {"op":"set_narrative_contract","contract":{"version":1,"status":"implemented","premise":"...","entryPageIds":["intro-page"],"characters":[{"id":"courier","name":"Courier","role":"player"}],"lines":[{"id":"line-intro","speakerId":"courier","voiceRole":"character","text":"...","delivery":"text","essential":true}],"beats":[{"id":"beat-intro","label":"Readable introduction","kind":"setup","required":true,"pageId":"intro-page","lineIds":["line-intro"],"acceptanceTestIds":["test-intro"]}],"endings":[{"id":"ending-route","label":"Route completed","kind":"success","choiceId":"finish-choice","acceptanceTestIds":["test-ending"]}]}}. Author gameplay pages/rules and acceptance tests first or in the same ordered proposal. Required beats may not be prose-only, and essential audio must have readable text.
- set_visual_identity: {"op":"set_visual_identity","identity":{"schemaVersion":"looplab-visual-identity/v1","revision":1,"status":"draft|adopted","intent":"...","directives":[{"id":"palette-dark-neutral","dimension":"palette","instruction":"...","appliesToRoles":["all"],"strength":"guide|lock","userAuthored":true}],"references":[{"id":"reference-style","assetId":"asset-id","purpose":"style|identity|structure|material|ui","appliesToRoles":["all"],"delivery":"semantic|image","note":"What to learn, not what content to copy."}],"exclusions":[{"id":"exclude-noise","instruction":"...","appliesToRoles":["all"]}]}}. Use remove_visual_identity only for an explicit user-requested removal. Do not convert quality conditions into aesthetic locks.
- set_verb_architecture: {"op":"set_verb_architecture","architecture":{"status":"implemented","hypothesis":"...","verbs":[{"id":"verb-id","label":"...","category":"movement|interaction|combat|world-state|resource|recovery|expression|utility","status":"core|supporting|cut","description":"...","inputActionIds":["action-id"],"stateChanges":["..."],"implementationIds":["runtime-id"],"testIds":["test-id"]}],"pairEvaluations":[{"id":"pair-a-b","verbIds":["a","b"],"synergy":8,"redundancy":2,"readability":8,"implementationCost":5,"decision":"keep|cut|defer","rationale":"..."}],"combinations":[{"id":"combo-id","verbIds":["a","b"],"contexts":["traversal"],"consequence":"...","introducedMapId":"map-1","masteryMapId":"map-3","implementationIds":["runtime-id"],"testIds":["test-id"]}],"progression":[]}}
- set_feature_contracts/upsert_feature_contract: author stable machine-readable links between visual, collision, inputAction, animationState, feedbackEvent, placementRules, responsiveRules, and non-empty acceptanceTests IDs. Example upsert: {"op":"upsert_feature_contract","contract":{"id":"feature-route-one","name":"Route one","visual":"route-one-art","collision":"route-one-path","inputAction":"interact","animationState":"traverse","feedbackEvent":"traversal.completed","placementRules":"authored run-up and recovery","responsiveRules":"below HUD-safe band","acceptanceTests":["test-route-one"]}}.
- set_acceptance_tests/upsert_acceptance_test: author stable acceptance specifications owned by featureId or ownerId. Deterministic cases may add runner="looplab-deterministic-runtime", a bounded fixed-tick driver using semantic inputs, and allowlisted assertions. Example upsert: {"op":"upsert_acceptance_test","test":{"id":"test-route-one","name":"Route one completes","featureId":"feature-route-one","assertion":"Fresh interaction completes the path and reaches its recovery zone.","runner":"looplab-deterministic-runtime","driver":{"tickRate":60,"tickCount":120,"inputs":[{"tick":0,"action":"interact","pressed":true},{"tick":1,"action":"interact","pressed":false}]},"assertions":[{"id":"route-completed","target":"event-emitted","targetId":"traversal.completed","operator":"greater-or-equal","expected":1}]}}. Specifications never claim a pass by themselves.
- get_acceptance_plan/run_acceptance_suite: inspect which referenced IDs are passed, failed, stale, missing, or specification-only, then execute the canonical fresh-state deterministic suite. Do not use arbitrary JavaScript, eval, DOM selectors, storage, network, shell commands, or provider self-attestation as test evidence.
- record_replay_case: {"op":"record_replay_case","id":"route-one-replay","name":"Route one deterministic traversal","revision":1,"tickCount":180,"startMapId":"map-1","startSpawnId":"spawn-1","inputs":[{"tick":0,"action":"move-right","pressed":true},{"tick":30,"action":"interact","pressed":true},{"tick":31,"action":"interact","pressed":false},{"tick":150,"action":"move-right","pressed":false}],"checkpointInterval":30}. Put this after the commands that author the referenced maps, spawns, inputs, paths, and gameplay rules; LoopLab records the actual hashes. Never invent expectedHash or checkpoints.
- add_object: {"op":"add_object","kind":"player|platform|coin|hazard|decor|spawn|portal|goal","object":{"id":"stable-id","name":"...","x":0,"y":0,"width":32,"height":32,"color":"#rrggbb","solid":false,"anchorMode":"ground","collisionOwner":"authored-map"}}
- update_object/remove_object/duplicate_object/reorder_object using an id selector
- add_traversal_path: {"op":"add_traversal_path","path":{"id":"stable-rail-id","name":"Readable rail name","kind":"rail|grind|zipline|route","collisionOwner":"authored-map","points":[{"x":100,"y":300,"z":0},{"x":420,"y":260,"z":0}],"entryRadius":28,"minimumEntrySpeed":80,"direction":"both|forward|reverse","maximumSpeed":520,"exitImpulse":{"x":0,"y":-120,"z":0},"transferPathIds":[],"bailBehavior":"drop"}}
- update_traversal_path/remove_traversal_path using a stable path id; path points are gameplay truth and rail art is only a visual reference
- add_map/update_map/switch_map for linked-map work; every portal needs a valid targetMapId and targetSpawnId
- generate_tiles: {"op":"generate_tiles","theme":"meadow|dungeon|desert|neon","tileSize":32,"seed":"...","place":true,"frame":0,"x":100,"y":100,"scale":2}
- generate_sprite: {"op":"generate_sprite","kind":"hero|enemy|pickup|prop","palette":"violet|ember|forest|mono","size":32,"seed":"...","place":true,"x":100,"y":100,"scale":2}
- update_asset: {"op":"update_asset","id":"stable-asset-id","changes":{"anchorY":31,"anchorMode":"ground"}} for precise visual metadata or embedded-image replacement; it preserves authored-only collision authority
- get_authored_route_document / set_authored_route_document for lossless route source documents
- update_authored_route_actor, update_authored_route_step, and update_authored_route_meeting for exact timings, waits, facing, depth, meetings, animation cues, and events; route edits deliberately stale preserved hashes
- verify_authored_route_document only after measured replay or render hashes exist; never invent or silently re-record a deterministic hash

Every object and traversal control point must remain inside the world. Keep exactly one controllable player unless the goal explicitly requires otherwise. Use stable, descriptive IDs. Generated art may suggest a footprint but authored map data is the sole collision owner. Preserve feature-contract links from art through acceptance tests. Do not add an interaction without readable setup, landing or recovery, and a next decision. Explain the improvement hypothesis and provide honest 0-10 scores.`;

async function invokeProvider({ provider, context, schemaPath, responseFile, responseSet, iteration, cwd, onProviderActivity }) {
  if (provider === "file") {
    const selected = Array.isArray(responseSet) ? responseSet[Math.min(iteration, responseSet.length - 1)] : responseSet;
    if (!selected) throw new Error("The file provider has no response for this iteration.");
    return { proposal: selected, receipt: createUsageReceipt({ provider: "file", model: "fixture", usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 }, source: "fixture" }) };
  }

  assertProviderPayloadPrivacy({ instructions: ITERATION_PROMPT, context }, {
    label: "game-iteration provider payload",
    sourceDigest: context?.sourceDigest ?? context?.project?.sourceDigest ?? null,
  });
  const input = JSON.stringify(context);
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured for the Looplab companion.");
    const schema = await readJson(schemaPath);
    const model = process.env.LOOPLAB_OPENAI_MODEL ?? "gpt-5.2";
    try {
      const { value } = await requestProviderJson({
        provider: "OpenAI",
        url: "https://api.openai.com/v1/responses",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: buildOpenAiResponsesRequest({ model, purpose: "game-iteration", developerPrompt: ITERATION_PROMPT, userInput: input, schema, schemaName: "looplab_iteration", strict: true }),
        onRetry: (detail) => emit("provider.http.retrying", detail),
      });
      const receipt = createUsageReceipt({ provider, model: value.model ?? model, usage: value.usage, source: "openai-responses-api" });
      try {
        return { proposal: requireOpenAiStructuredResult(value, "iteration output"), receipt };
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
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured for the Looplab companion.");
    const schema = await readJson(schemaPath);
    const model = process.env.LOOPLAB_ANTHROPIC_MODEL ?? "claude-sonnet-5";
    try {
      const { value } = await requestProviderJson({
        provider: "Anthropic",
        url: "https://api.anthropic.com/v1/messages",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: buildAnthropicMessagesRequest({ model, maxTokens: 20_000, system: ITERATION_PROMPT, userInput: input, schema }),
        onRetry: (detail) => emit("provider.http.retrying", detail),
      });
      const receipt = createUsageReceipt({ provider, model: value.model ?? model, usage: value.usage, source: "anthropic-messages-api-structured" });
      try {
        return { proposal: requireAnthropicStructuredResult(value, "iteration output"), receipt };
      } catch (error) {
        throw attachUsageReceipt(error, receipt);
      }
    } catch (error) {
      const value = error?.providerResponse ?? error?.responseBody;
      if (value?.usage && !error?.usageReceipt) throw attachUsageReceipt(error, createUsageReceipt({ provider, model: value.model ?? model, usage: value.usage, source: "anthropic-messages-api-structured" }));
      throw error;
    }
  }
  if (provider === "codex") {
    const invocation = buildCodexCliInvocation(["exec", "--json", "--skip-git-repo-check", "--ephemeral", "--output-schema", schemaPath, "-o", responseFile, ITERATION_PROMPT], { purpose: "game-iteration" });
    try {
      const result = await runProcess("codex", invocation.args, input, cwd, undefined, (line) => {
        const activity = codexActivityFromJsonLine(line);
        if (activity) onProviderActivity?.(activity);
      });
      const responseText = await readFile(responseFile, "utf8").catch(() => result.stdout);
      const measured = usageFromCliOutput(result.stdout, result.stderr);
      const model = measured.model ?? invocation.modelPolicy.model;
      return {
        proposal: parseAgentJson(responseText),
        receipt: createUsageReceipt({ provider, model, usage: measured.usage, source: "codex-cli-jsonl", authMethod: providerAuthMethod(provider), modelSelection: createProviderModelSelectionReceipt(invocation.modelPolicy, { providerReportedModel: measured.model }) }),
      };
    } catch (error) {
      const measured = usageFromCliOutput(error?.processResult?.stdout, error?.processResult?.stderr);
      const model = measured.model ?? invocation.modelPolicy.model;
      if (error && typeof error === "object") error.usageReceipt = createUsageReceipt({ provider, model, usage: measured.usage, source: "codex-cli-jsonl", authMethod: providerAuthMethod(provider), modelSelection: createProviderModelSelectionReceipt(invocation.modelPolicy, { providerReportedModel: measured.model }) });
      throw error;
    }
  }
  if (provider === "claude") {
    const invocation = buildClaudeCliInvocation({
      prompt: ITERATION_PROMPT,
      schema: await readJson(schemaPath),
      maxTurns: 5,
      tools: [],
      purpose: "game-iteration",
      maxBudgetUsd: process.env.LOOPLAB_CLAUDE_MAX_BUDGET_USD,
    });
    try {
      const result = await runProcess("claude", invocation.args, input, cwd, undefined, (line) => {
        const activity = claudeActivityFromJsonLine(line);
        if (activity) onProviderActivity?.(activity);
      });
      const structured = requireClaudeCliStructuredResult(result.stdout);
      const measured = usageFromCliOutput(result.stdout, result.stderr);
      const model = structured.model ?? measured.model ?? invocation.modelPolicy.model;
      return {
        proposal: structured.structuredOutput,
        receipt: createUsageReceipt({ provider, model, usage: structured.usage ?? measured.usage, source: "claude-code-cli-stream-json", providerReportedUsd: structured.providerReportedUsd, authMethod: providerAuthMethod(provider), modelSelection: createProviderModelSelectionReceipt(invocation.modelPolicy, { providerReportedModel: structured.model ?? measured.model }) }),
      };
    } catch (error) {
      const telemetry = error?.claudeTelemetry ?? inspectClaudeCliOutput(error?.processResult?.stdout);
      const measured = usageFromCliOutput(error?.processResult?.stdout, error?.processResult?.stderr);
      const model = telemetry.model ?? measured.model ?? invocation.modelPolicy.model;
      if (error && typeof error === "object") {
        error.usageReceipt = createUsageReceipt({ provider, model, usage: telemetry.usage ?? measured.usage, source: "claude-code-cli-stream-json", providerReportedUsd: telemetry.providerReportedUsd, authMethod: providerAuthMethod(provider), modelSelection: createProviderModelSelectionReceipt(invocation.modelPolicy, { providerReportedModel: telemetry.model ?? measured.model }) });
      }
      throw error;
    }
  }
  throw new Error(`Unknown provider: ${provider}. Use openai, anthropic, codex, claude, or file.`);
}

async function applyIterationCommands(project, commands, candidateNumber) {
  let current = project;
  const results = [];
  const generatedFiles = [];
  const deferredTraversalTransfers = [];
  const deferredPortalCommands = [];
  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    const portalStage = stageAtomicPortalCommand(command, { activeMapId: current.activeMapId });
    if (portalStage.defer) {
      const resultIndex = results.length;
      results.push({ op: command.op, result: null, deferred: true });
      deferredPortalCommands.push(...portalStage.deferredCommands.map((entry) => ({ ...entry, resultIndex, replaceResult: true })));
      continue;
    }
    const baseCommand = portalStage.stagedCommand;
    if (command.op !== "generate_tiles" && command.op !== "generate_sprite") {
      const transferPathIds = baseCommand.op === "add_traversal_path" && Array.isArray(baseCommand.path?.transferPathIds)
        ? [...new Set(baseCommand.path.transferPathIds.map((id) => String(id).trim()).filter(Boolean))]
        : [];
      const stagedCommand = transferPathIds.length
        ? { ...baseCommand, path: { ...baseCommand.path, transferPathIds: [] } }
        : baseCommand;
      const outcome = applyAgentCommand(current, stagedCommand);
      current = outcome.project;
      results.push({ op: command.op, result: outcome.result });
      deferredPortalCommands.push(...portalStage.deferredCommands.map((entry) => ({ ...entry, resultIndex: results.length - 1, replaceResult: false })));
      if (transferPathIds.length) {
        deferredTraversalTransfers.push({
          mapId: outcome.result.mapId,
          pathId: outcome.result.path.id,
          transferPathIds,
          resultIndex: results.length - 1,
        });
      }
      continue;
    }

    const isTiles = command.op === "generate_tiles";
    const generated = isTiles
      ? generateTilesetPixels({ theme: command.theme ?? "meadow", tileSize: Number(command.tileSize ?? 32), seed: command.seed ?? `iteration-${candidateNumber}` })
      : generateSpritePixels({ kind: command.kind ?? "hero", palette: command.palette ?? "violet", size: Number(command.size ?? 32), seed: command.seed ?? `iteration-${candidateNumber}` });
    const png = encodePng(generated);
    const assetId = command.id ?? `ai-v${candidateNumber}-asset-${index + 1}`;
    const label = command.name ?? (isTiles ? `${command.theme ?? "meadow"} tiles` : `${command.kind ?? "hero"} sprite`);
    const asset = {
      id: assetId,
      name: label,
      type: generated.kind,
      dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      width: generated.width,
      height: generated.height,
      frameWidth: generated.frameWidth,
      frameHeight: generated.frameHeight,
      frames: generated.frames,
      columns: generated.columns,
      anchorX: generated.anchorX,
      anchorY: generated.anchorY,
      opaqueBounds: generated.opaqueBounds,
      collisionPolicy: "authored-only",
      anchorMode: isTiles || !["effect", "ui"].includes(generated.spriteKind) ? "ground" : "center",
      invariants: isTiles ? undefined : { identityReference: command.seed ?? `iteration-${candidateNumber}`, palette: command.palette ?? "violet", facingDirection: "right", frameCount: generated.frames, sharedScale: true, groundAnchor: !["effect", "ui"].includes(generated.spriteKind), transparentBackground: true, maxSilhouetteDrift: 0.14, maxAnchorVariance: 1 },
      analysis: isTiles ? undefined : { silhouetteDrift: 0, anchorVariance: 0, characterCountMax: 1, haloPixelRatio: 0, failedInvariants: [] },
      generator: isTiles
        ? { theme: command.theme ?? "meadow", tileSize: generated.frameWidth, seed: generated.seed, seamless: generated.seamless ?? true }
        : { kind: command.kind ?? "hero", palette: command.palette ?? "violet", size: generated.frameWidth, seed: generated.seed },
    };
    current = applyAgentCommand(current, { op: "add_asset", asset }).project;
    let placedObject = null;
    if (command.place !== false) {
      const objectKind = isTiles ? (command.objectKind ?? "platform") : generated.spriteKind === "hero" ? "player" : generated.spriteKind === "enemy" ? "hazard" : generated.spriteKind === "pickup" ? "coin" : "decor";
      const objectScale = Number(command.scale ?? 2);
      const generatedRole = isTiles ? null : generated.spriteKind;
      const usesGroundAnchor = !["effect", "ui"].includes(generatedRole);
      const outcome = applyAgentCommand(current, {
        op: "add_object",
        kind: objectKind,
        object: {
          id: command.objectId ?? `ai-v${candidateNumber}-object-${index + 1}`,
          name: command.objectName ?? label,
          x: Number(command.x ?? 120),
          y: Number(command.y ?? 120),
          width: generated.frameWidth * objectScale,
          height: generated.frameHeight * objectScale,
          assetId,
          assetFrame: Number(command.frame ?? 0),
          anchorMode: usesGroundAnchor ? "ground" : "center",
          collisionOwner: "authored-map",
          role: ["prop", "effect", "ui"].includes(generatedRole) ? generatedRole : undefined,
          requiresSupport: generatedRole === "prop",
          groundAnchor: { offsetX: generated.anchorX <= 1 ? generated.anchorX * generated.frameWidth * objectScale : generated.anchorX * objectScale, offsetY: generated.anchorY <= 1 ? generated.anchorY * generated.frameHeight * objectScale : generated.anchorY * objectScale },
          visualBounds: visualBoundsForAsset(asset, generated.frameWidth * objectScale, generated.frameHeight * objectScale),
          collider: authoredColliderForPlacement({ kind: objectKind, role: generatedRole, width: generated.frameWidth * objectScale, height: generated.frameHeight * objectScale }),
        },
      });
      current = outcome.project;
      placedObject = outcome.result.object;
      if (generatedRole === "prop") {
        const attached = applyAgentCommand(current, { op: "attach_to_support", id: placedObject.id, mode: command.supportMode ?? "auto", surfaceId: command.supportSurfaceId, tolerance: command.supportTolerance ?? 2 });
        current = attached.project;
        placedObject = attached.result.object;
      }
    }
    generatedFiles.push({ filename: `v${String(candidateNumber).padStart(3, "0")}-asset-${index + 1}.png`, png });
    results.push({ op: command.op, asset: { ...asset, dataUrl: undefined }, object: placedObject });
  }

  // A provider may author cross-map portals or mutually linked traversal paths
  // before their destinations. Keep every intermediate project valid, then
  // restore those authored references only after the atomic candidate has created
  // all maps, spawns, and paths. Missing final references still fail ordinary
  // validation instead of being silently discarded or invented.
  const finalActiveMapId = current.activeMapId;
  for (const deferred of deferredPortalCommands) {
    if (deferred.mapId && current.activeMapId !== deferred.mapId) current = applyAgentCommand(current, { op: "switch_map", id: deferred.mapId }).project;
    const outcome = applyAgentCommand(current, deferred.command);
    current = outcome.project;
    if (deferred.replaceResult) {
      results[deferred.resultIndex] = { op: deferred.command.op, result: outcome.result, deferred: false, resolution: deferred.reason };
    } else {
      const owner = results[deferred.resultIndex] ?? { op: "map", result: null };
      results[deferred.resultIndex] = {
        ...owner,
        deferredPortalResults: [...(owner.deferredPortalResults ?? []), { reason: deferred.reason, result: outcome.result }],
      };
    }
  }
  for (const deferred of deferredTraversalTransfers) {
    if (current.activeMapId !== deferred.mapId) current = applyAgentCommand(current, { op: "switch_map", id: deferred.mapId }).project;
    const outcome = applyAgentCommand(current, {
      op: "update_traversal_path",
      id: deferred.pathId,
      changes: { transferPathIds: deferred.transferPathIds },
    });
    current = outcome.project;
    results[deferred.resultIndex] = {
      ...results[deferred.resultIndex],
      result: { ...results[deferred.resultIndex].result, path: outcome.result.path },
    };
  }
  if (current.activeMapId !== finalActiveMapId) current = applyAgentCommand(current, { op: "switch_map", id: finalActiveMapId }).project;
  return { project: current, results, generatedFiles };
}

async function main() {
  if (flag("--help") || flag("-h")) {
    emit("loop.help", {
      usage: "npm run loop -- --provider openai|anthropic|codex|claude --provider-fallbacks <pipe-separated ready paths> --project game.loop.json --iterations 3 --goal \"make it better\"",
      stopPolicy: "Single-pass loops stop before a provider call when the target score is met. Bounded condition/map plans require every planned scope; --iterations remains the hard provider-call cap.",
      options: ["--requested-provider <original path>", "--provider-mode fallback|strict", "--provider-fallbacks <pipe-separated verified ready paths>", "--versions-dir <path>", "--min-delta <number>", "--stop-score <number>", "--evaluation-profile auto|general|platformer|top-down|connected-world|systems", "--context-budget-tokens <8000-200000>", "--framework auto|canvas|phaser|pixi|melon", "--narrative auto|include|exclude", "--art-direction-mode explore|preserve|locked", "--style-locks <pipe-separated explicit locks>", "--preference-context <validated applied-context JSON>", "--provider file --response <json> (test/manual adapter)"],
    });
    return;
  }

  const projectValue = option("--project");
  if (!projectValue) throw new Error("--project is required.");
  const projectPath = resolve(projectValue);
  const provider = option("--provider", "codex");
  const requestedProvider = option("--requested-provider", provider);
  const providerMode = option("--provider-mode", "fallback") === "strict" ? "strict" : "fallback";
  const configuredProviderCandidates = String(option("--provider-fallbacks", provider)).split("|").map((value) => value.trim()).filter((value, index, values) => ["openai", "anthropic", "codex", "claude", "file"].includes(value) && values.indexOf(value) === index);
  const providerCandidates = providerMode === "strict" ? [provider] : configuredProviderCandidates.length ? configuredProviderCandidates : [provider];
  const requestedFramework = option("--framework", "auto");
  const runtimePreference = ["auto", "canvas", "phaser", "pixi", "melon"].includes(requestedFramework) ? requestedFramework : "auto";
  const requestedNarrativeMode = option("--narrative", "auto");
  const narrativeMode = ["auto", "include", "exclude"].includes(requestedNarrativeMode) ? requestedNarrativeMode : "auto";
  const iterations = Math.max(1, Math.min(20, Number(option("--iterations", 3))));
  const minimumDelta = Number(option("--min-delta", 0));
  const stopScore = Number(option("--stop-score", 95));
  const goal = option("--goal", "Improve playability, clarity, challenge, and visual cohesion without breaking existing behavior.");
  const strategy = ["improve", "explore", "cycle"].includes(option("--strategy", "improve")) ? option("--strategy", "improve") : "improve";
  const conditions = String(option("--conditions", "")).split("|").map((condition) => condition.trim()).filter(Boolean);
  const requestedContextBudget = Number(option("--context-budget-tokens", LOOPLAB_PROVIDER_CONTEXT_POLICY.defaultRoughTokenBudget));
  const contextBudgetTokens = Number.isFinite(requestedContextBudget)
    ? Math.max(LOOPLAB_PROVIDER_CONTEXT_POLICY.minimumRoughTokenBudget, Math.min(LOOPLAB_PROVIDER_CONTEXT_POLICY.maximumRoughTokenBudget, Math.floor(requestedContextBudget)))
    : LOOPLAB_PROVIDER_CONTEXT_POLICY.defaultRoughTokenBudget;
  const artDirection = normalizeArtDirectionPolicy({ mode: option("--art-direction-mode", "explore"), locks: String(option("--style-locks", "")).split("|") });
  const artInstruction = artDirectionInstruction(artDirection);
  const preferenceContextPath = option("--preference-context") ? resolve(option("--preference-context")) : null;
  const preferenceContext = preferenceContextPath ? normalizeAppliedPreferenceContext(await readJson(preferenceContextPath)) : null;
  const projectBase = basename(projectPath, extname(projectPath)).replace(/\.loop$/i, "");
  const versionsDirectory = resolve(option("--versions-dir", join(dirname(projectPath), `${projectBase}.versions`)));
  const historyPath = join(versionsDirectory, "history.json");
  const schemaPath = fileURLToPath(new URL("../agent/iteration-schema.json", import.meta.url));
  const responsePath = option("--response") ? resolve(option("--response")) : null;
  const responseSet = provider === "file" ? await readJson(responsePath) : null;
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "looplab-ai-loop-"));
  let history = normalizeLoopHistory(await exists(historyPath) ? await readJson(historyPath) : { protocolVersion: 1, projectPath, attempts: [] }, { projectPath });
  let project = await readJson(projectPath);
  if (/\bVERB ARCHITECTURE\b/i.test(goal) && (project.qualityContracts?.verbArchitectureRequired !== true || project.qualityContracts?.gameplayProgramRequired !== true)) {
    project = { ...project, qualityContracts: { ...(project.qualityContracts ?? {}), verbArchitectureRequired: true, gameplayProgramRequired: true } };
  }
  const initialIterationGoal = `${goal}\n\nART DIRECTION POLICY: ${artInstruction}`;
  const initialCapabilityRoute = routeGameStudioWork(project, { prompt: initialIterationGoal, track: option("--track", "gameplay"), framework: runtimePreference, narrativeMode });
  if (initialCapabilityRoute.context.narrative.included && project.qualityContracts?.narrativeContractRequired !== true) {
    project = { ...project, qualityContracts: { ...(project.qualityContracts ?? {}), narrativeContractRequired: true } };
  }
  const evaluationProfile = selectLoopEvaluationProfile(project, { requestedProfile: option("--evaluation-profile", "auto") });
  const runStartedAt = new Date().toISOString();
  const runUsageReceipts = [];
  const runAttempts = [];
  const disabledProviderPaths = new Set();
  const providerFailoverReceipts = [];
  let lastProvider = provider;
  const initialValidation = validateProject(project);
  if (!initialValidation.valid) throw new Error(`Project is invalid: ${initialValidation.errors.join(" ")}`);
  await mkdir(versionsDirectory, { recursive: true });

  const initialQuality = evaluateProject(project, { profile: evaluationProfile });
  emit("runtime.selection.locked", {
    frameworkPreference: initialCapabilityRoute.runtimeSelection.frameworkPreference,
    selectedFramework: initialCapabilityRoute.runtimeSelection.selectedFramework,
    recommendedFramework: initialCapabilityRoute.runtimeSelection.recommendedFramework,
    selectionSource: initialCapabilityRoute.runtimeSelection.selectionSource,
    confidence: initialCapabilityRoute.runtimeSelection.confidence,
    singleFileDelivery: initialCapabilityRoute.runtimeSelection.singleFile.delivery,
    migrationRequiresOptIn: initialCapabilityRoute.runtimeSelection.migrationRequiresOptIn,
    message: `${initialCapabilityRoute.runtimeSelection.selectedFramework} selected by ${initialCapabilityRoute.runtimeSelection.selectionSource}; Phaser remains optional and single-file compatible.`,
  });
  emit("narrative.selection.locked", {
    mode: initialCapabilityRoute.context.narrative.mode,
    included: initialCapabilityRoute.context.narrative.included,
    selectionSource: initialCapabilityRoute.context.narrative.selectionSource,
    signals: initialCapabilityRoute.context.narrative.signals.map((signal) => signal.id),
    message: initialCapabilityRoute.context.narrative.included
      ? `Narrative Designer and Narrator/Dialogue Writer included by ${initialCapabilityRoute.context.narrative.selectionSource}.`
      : "Narrative specialist omitted so this pass remains mechanics-first.",
  });
  const initialContext = buildProviderIterationContext({
    goal: initialIterationGoal,
    baseGoal: goal,
    strategy,
    condition: null,
    artDirection: { ...artDirection, instruction: artInstruction },
    iteration: nextLoopAttemptNumber(history),
    project,
    quality: initialQuality,
    gameplayProgram: { policy: LOOPLAB_GAMEPLAY_RULE_POLICY, inspection: inspectGameplayProgram(project) },
    combatProgram: { policy: LOOPLAB_COMBAT_POLICY, inspection: inspectCombatProgram(project) },
    actorProgram: { policy: LOOPLAB_ACTOR_POLICY, inspection: inspectActorProgram(project) },
    narrativeContract: { policy: LOOPLAB_NARRATIVE_CONTRACT_POLICY, report: inspectNarrativeContract(project, project.narrativeContract, { sourceDigest: initialQuality.doctor.sourceDigest, acceptancePlan: initialQuality.doctor.acceptancePlan }) },
    visualIdentity: { policy: LOOPLAB_VISUAL_IDENTITY_POLICY, report: initialQuality.doctor.visualIdentityReport },
    tuningContract: initialQuality.doctor.tuningReport,
    verbArchitecture: { policy: LOOPLAB_VERB_ARCHITECTURE_POLICY, inspection: inspectVerbArchitecture(project) },
    preferenceContext,
    capabilityRoute: initialCapabilityRoute,
    priorAttempts: history.attempts.slice(-5),
  });
  const initialContextMeasurement = measureProviderIterationContext(initialContext);
  const providerPassPlan = planProviderPasses({
    goal,
    conditions,
    project,
    measurement: initialContextMeasurement,
    sourceDigest: initialQuality.doctor.sourceDigest,
    roughTokenBudget: contextBudgetTokens,
    maximumPasses: Math.min(iterations, LOOPLAB_PROVIDER_CONTEXT_POLICY.maximumPasses),
  });
  const publicPassPlan = publicProviderPassPlan(providerPassPlan);
  let providerParity = createProviderParityReceipt({
    provider,
    operation: "game-loop",
    sourceDigest: initialQuality.doctor.sourceDigest,
    evaluationProfile,
    passPlanId: providerPassPlan.planId,
  });

  if (providerParity) emit("provider.parity.locked", { receipt: providerParity, message: `${provider} is bound to LoopLab's shared Codex/Claude loop contract ${providerParity.sharedContractDigest}.` });
  const preferenceReceipt = preferenceContext ? { enabled: preferenceContext.enabled, selectedEntryIds: preferenceContext.selectedEntryIds, excludedEntryIds: preferenceContext.excludedEntryIds, receiptDigest: preferenceContext.receiptDigest } : null;
  emit("provider.route.locked", { requestedProvider, provider, providerMode, providerCandidates, message: providerMode === "strict" ? `Strict provider route locked to ${provider}.` : `Provider route starts with ${provider}; verified fallbacks are ${providerCandidates.slice(1).join(", ") || "none"}.` });
  emit("loop.started", { requestedProvider, provider, providerMode, providerCandidates, iterations, objectiveDigest: providerPassPlan.objectiveDigest, goalLength: goal.length, strategy, conditionCount: conditions.length, stopScore, stopPolicy: providerPassPlan.completionPolicy, artDirection, preferenceReceipt, contextBudgetTokens, evaluationProfile, providerParity, project: summarizeProject(project), quality: compactQualityReport(initialQuality), versionsDirectory, historyRetention: history.retention });
  emit("provider.pass-plan.prepared", {
    plan: publicPassPlan,
    message: providerPassPlan.mode === "bounded"
      ? `Prepared ${providerPassPlan.passes.length} ordered provider passes under ${providerPassPlan.planId}.`
      : `Prepared one coherent provider pass under ${providerPassPlan.planId}.`,
  });
  try {
    let stopScoreDeferralEmitted = false;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const candidateNumber = nextLoopAttemptNumber(history);
      const activePass = selectProviderPass(providerPassPlan, history.attempts);
      if (!activePass) {
        emit("loop.stopped", { reason: "all-provider-passes-satisfied", planId: providerPassPlan.planId });
        break;
      }
      if (!providerCandidates.some((candidate) => !disabledProviderPaths.has(candidate))) {
        emit("loop.stopped", { reason: "provider-paths-exhausted", requestedProvider, failedProviders: [...disabledProviderPaths], message: "Every verified provider path failed; the protected project remains unchanged." });
        break;
      }
      const condition = activePass.kind === "condition" ? activePass.label : null;
      const qualityGoal = providerGoalForPass(goal, providerPassPlan, activePass);
      const iterationGoal = `${qualityGoal}\n\nART DIRECTION POLICY: ${artInstruction}`;
      const before = project;
      const beforeQuality = evaluateProject(before, { profile: evaluationProfile });
      if (beforeQuality.score >= stopScore) {
        if (providerPassPlan.mode === "single") {
          emit("loop.stopped", { reason: "target-score-reached", score: beforeQuality.score, stopScore, evaluationProfile: evaluationProfile.id, stopPolicy: providerPassPlan.completionPolicy });
          break;
        }
        if (!stopScoreDeferralEmitted) {
          const remainingPassIds = providerPassPlan.passes.filter((pass) => !history.attempts.some((attempt) => attempt.accepted && attempt.planId === providerPassPlan.planId && attempt.passId === pass.passId)).map((pass) => pass.passId);
          emit("loop.stop-score.deferred", {
            reason: "required-provider-passes-remain",
            score: beforeQuality.score,
            stopScore,
            remainingPassIds,
            maximumProviderCalls: iterations,
            stopPolicy: providerPassPlan.completionPolicy,
            message: `Target score ${stopScore} is already met, but ${remainingPassIds.length} required provider scope${remainingPassIds.length === 1 ? " remains" : "s remain"}. Max passes (${iterations}) is still the hard cost cap.`,
          });
          stopScoreDeferralEmitted = true;
        }
      }      emit("provider.pass.started", {
        iteration: candidateNumber,
        planId: providerPassPlan.planId,
        passId: activePass.passId,
        order: activePass.order,
        passCount: providerPassPlan.passes.length,
        label: activePass.label,
        message: `Running bounded scope ${activePass.order}/${providerPassPlan.passes.length}: ${activePass.label}`,
      });
      emit("iteration.started", { iteration: candidateNumber, score: beforeQuality.score, strategy, condition, planId: providerPassPlan.planId, passId: activePass.passId, goalLength: iterationGoal.length, evaluationProfile: evaluationProfile.id, dimensions: compactLoopEvaluation(beforeQuality).dimensions });
      const capabilityRoute = routeGameStudioWork(before, { prompt: iterationGoal, track: option("--track", "gameplay"), framework: runtimePreference, narrativeMode });
      const context = buildProviderIterationContext({
        goal: iterationGoal,
        baseGoal: goal,
        strategy,
        condition,
        artDirection: { ...artDirection, instruction: artInstruction },
        iteration: candidateNumber,
        project: before,
        quality: beforeQuality,
        gameplayProgram: { policy: LOOPLAB_GAMEPLAY_RULE_POLICY, inspection: inspectGameplayProgram(before) },
        combatProgram: { policy: LOOPLAB_COMBAT_POLICY, inspection: inspectCombatProgram(before) },
        actorProgram: { policy: LOOPLAB_ACTOR_POLICY, inspection: inspectActorProgram(before) },
        narrativeContract: { policy: LOOPLAB_NARRATIVE_CONTRACT_POLICY, report: inspectNarrativeContract(before, before.narrativeContract, { sourceDigest: beforeQuality.doctor.sourceDigest, acceptancePlan: beforeQuality.doctor.acceptancePlan }) },
        visualIdentity: { policy: LOOPLAB_VISUAL_IDENTITY_POLICY, report: beforeQuality.doctor.visualIdentityReport },
        tuningContract: beforeQuality.doctor.tuningReport,
        verbArchitecture: { policy: LOOPLAB_VERB_ARCHITECTURE_POLICY, inspection: inspectVerbArchitecture(before) },
        preferenceContext,
        capabilityRoute,
        priorAttempts: history.attempts.slice(-5),
        passPlan: providerPassPlan,
        activePass,
      });
      const contextPreflight = preflightProviderIterationContext(context, contextBudgetTokens);
      emit("provider.context.prepared", {
        iteration: candidateNumber,
        planId: providerPassPlan.planId,
        passId: activePass.passId,
        budgetRoughTokens: contextBudgetTokens,
        characters: contextPreflight.characters,
        roughTokenEstimate: contextPreflight.roughTokenEstimate,
        sectionCharacters: contextPreflight.sectionCharacters,
        message: "Prepared compact provider context; token estimate is a rough character-based planning number, not measured usage.",
      });
      if (!contextPreflight.allowed) {
        emit("provider.context.blocked", {
          iteration: candidateNumber,
          planId: providerPassPlan.planId,
          passId: activePass.passId,
          roughTokenEstimate: contextPreflight.roughTokenEstimate,
          budgetRoughTokens: contextBudgetTokens,
          largestSections: contextPreflight.largestSections,
          message: `Provider preflight blocked ${activePass.passId}: estimated ${contextPreflight.roughTokenEstimate} rough tokens exceeds the ${contextBudgetTokens} planning budget. No provider request was sent.`,
        });
        break;
      }
      const privacyPreflight = assertProviderPayloadPrivacy({ instructions: ITERATION_PROMPT, context }, {
        label: "game-iteration provider payload",
        sourceDigest: context?.sourceDigest ?? context?.project?.sourceDigest ?? null,
      });
      emit("provider.privacy.checked", {
        iteration: candidateNumber,
        sourceDigest: privacyPreflight.sourceDigest,
        reportDigest: privacyPreflight.digest,
        status: privacyPreflight.status,
        findingCount: privacyPreflight.findingCount,
        message: "The exact outbound iteration context passed LoopLab's value-free privacy preflight.",
      });
      emit("specialist.roster.planned", {
        iteration: candidateNumber,
        message: `Planned ${context.capabilityRoute.agentPlan.length} specialist role reviews inside one provider request; a transport failure may move the unchanged request to the next verified path`,
        executionMode: context.capabilityRoute.agentExecution.mode,
        agents: context.capabilityRoute.agentPlan.map(({ order, agentId, label, produces, executor, receiptRequired }) => ({ order, agentId, label, produces, executor, receiptRequired })),
      });
      const responseFile = join(temporaryDirectory, `response-${candidateNumber}.json`);
      let proposal;
      let applied;
      let comparison;
      let proposalChanged = false;
      let accepted = false;
      let rejectionReason = null;
      let runtimePlaytest = null;
      let usageReceipt = null;
      let actualProvider = providerCandidates.find((candidate) => !disabledProviderPaths.has(candidate)) ?? provider;
      let attemptProviderParity = null;
      let providerFailover = null;
      const providerPathAttempts = [];
      const iterationUsageReceipts = [];
      const candidateId = `iteration-${String(candidateNumber).padStart(3, "0")}`;
      try {
        let invoked = null;
        let terminalProviderError = null;
        const availableProviderPaths = providerCandidates.filter((candidate) => !disabledProviderPaths.has(candidate));
        for (let providerPathIndex = 0; providerPathIndex < availableProviderPaths.length; providerPathIndex += 1) {
          actualProvider = availableProviderPaths[providerPathIndex];
          lastProvider = actualProvider;
          await rm(responseFile, { force: true }).catch(() => {});
          emit("provider.requested", { iteration: candidateNumber, requestedProvider, provider: actualProvider, providerPathAttempt: providerPathIndex + 1, model: actualProvider === "openai" ? process.env.LOOPLAB_OPENAI_MODEL ?? "gpt-5.2" : actualProvider === "anthropic" ? process.env.LOOPLAB_ANTHROPIC_MODEL ?? "claude-sonnet-5" : actualProvider });
          const providerStartedAt = Date.now();
          let lastProviderActivity = null;
          const providerProgressTimer = setInterval(() => {
            const elapsedSeconds = Math.max(1, Math.round((Date.now() - providerStartedAt) / 1_000));
            const liveness = providerLivenessSnapshot(lastProviderActivity);
            emit("provider.progress", {
              iteration: candidateNumber,
              provider: actualProvider,
              providerPathAttempt: providerPathIndex + 1,
              elapsedSeconds,
              ...liveness,
              message: providerProgressMessage({ provider: actualProvider, iteration: candidateNumber, elapsedSeconds, liveness }),
            });
          }, PROVIDER_PROGRESS_INTERVAL_MS);
          providerProgressTimer.unref?.();
          try {
            invoked = await invokeProvider({
              provider: actualProvider,
              context,
              schemaPath,
              responseFile,
              responseSet,
              iteration,
              cwd: dirname(projectPath),
              onProviderActivity: (activity) => {
                const observedAt = Date.now();
                lastProviderActivity = { ...activity, observedAt };
                emit("provider.activity", {
                  iteration: candidateNumber,
                  provider: actualProvider,
                  providerPathAttempt: providerPathIndex + 1,
                  ...activity,
                  liveness: "provider-activity-observed",
                  observedAt: new Date(observedAt).toISOString(),
                  message: `${actualProvider} activity: ${activity.eventType}${activity.itemType ? ` / ${activity.itemType}` : ""}`,
                });
              },
            });
            const successfulReceipt = { ...invoked.receipt, iteration: candidateNumber, providerPathAttempt: providerPathIndex + 1 };
            iterationUsageReceipts.push(successfulReceipt);
            runUsageReceipts.push(successfulReceipt);
            emit("usage.completed", { iteration: candidateNumber, provider: actualProvider, providerPathAttempt: providerPathIndex + 1, receipt: successfulReceipt, message: usageReceiptSummary(successfulReceipt, `Iteration ${candidateNumber} · ${actualProvider} usage`) });
            providerPathAttempts.push({ provider: actualProvider, status: "completed", reason: null, usage: successfulReceipt });
            break;
          } catch (error) {
            terminalProviderError = error;
            const reason = boundedProviderDiagnostic(error instanceof Error ? error.message : String(error), "");
            const failedReceipt = error?.usageReceipt ? { ...error.usageReceipt, iteration: candidateNumber, providerPathAttempt: providerPathIndex + 1 } : null;
            if (failedReceipt) {
              iterationUsageReceipts.push(failedReceipt);
              runUsageReceipts.push(failedReceipt);
              emit("usage.completed", { iteration: candidateNumber, provider: actualProvider, providerPathAttempt: providerPathIndex + 1, failed: true, receipt: failedReceipt, message: usageReceiptSummary(failedReceipt, `Failed ${actualProvider} path usage`) });
            }
            providerPathAttempts.push({ provider: actualProvider, status: "failed", reason, usage: failedReceipt });
            const nextProvider = availableProviderPaths[providerPathIndex + 1] ?? null;
            const retryablePathFailure = isRetryableProviderPathFailure(reason);
            if (retryablePathFailure) disabledProviderPaths.add(actualProvider);
            if (providerMode === "strict" || !nextProvider || !retryablePathFailure) break;
            emit("provider.failover.started", { iteration: candidateNumber, requestedProvider, failedProvider: actualProvider, provider: nextProvider, reason, message: `${actualProvider} failed before any candidate mutation; retrying the unchanged request with ${nextProvider}.` });
          } finally {
            clearInterval(providerProgressTimer);
          }
        }
        providerFailover = createProviderFailoverReceipt({ requestedProvider, mode: providerMode, selectedProvider: invoked ? actualProvider : null, attempts: providerPathAttempts });
        providerFailoverReceipts.push(providerFailover);
        emit("provider.route.completed", { iteration: candidateNumber, requestedProvider, provider: invoked ? actualProvider : null, fallbackUsed: providerFailover.fallbackUsed, receipt: providerFailover, message: invoked ? `${actualProvider} completed the provider proposal${providerFailover.fallbackUsed ? ` after fallback from ${requestedProvider}` : ""}.` : "Every eligible provider path failed before candidate mutation." });
        usageReceipt = iterationUsageReceipts.length > 1
          ? aggregateUsageReceipts(iterationUsageReceipts, { provider: "mixed", model: "multiple", label: "iteration-provider-route-total" })
          : iterationUsageReceipts[0] ?? null;
        if (!invoked) throw terminalProviderError ?? new Error("Every eligible provider path failed before candidate mutation.");
        attemptProviderParity = createProviderParityReceipt({ provider: actualProvider, operation: "game-loop", sourceDigest: initialQuality.doctor.sourceDigest, evaluationProfile, passPlanId: providerPassPlan.planId });
        providerParity = attemptProviderParity;
        if (attemptProviderParity) emit("provider.parity.locked", { iteration: candidateNumber, receipt: attemptProviderParity, message: `${actualProvider} is bound to LoopLab's shared Codex/Claude loop contract ${attemptProviderParity.sharedContractDigest}.` });
        proposal = normalizeIterationProposal(invoked.proposal);
        const requiredAgentIds = context.capabilityRoute.agentPlan.filter((agent) => agent.receiptRequired).map((agent) => agent.agentId);
        const agentReviews = Array.isArray(proposal?.agentReviews) ? proposal.agentReviews.filter((review) => review && typeof review.agentId === "string" && ["proceed", "revise", "block"].includes(review.verdict) && typeof review.note === "string") : [];
        const receivedAgentIds = new Set(agentReviews.map((review) => review.agentId));
        const missingAgentIds = requiredAgentIds.filter((agentId) => !receivedAgentIds.has(agentId));
        emit("provider.responded", { iteration: candidateNumber, requestedProvider, provider: actualProvider, fallbackUsed: providerFailover.fallbackUsed, commandCount: proposal?.commands?.length ?? 0, specialistReceiptCount: agentReviews.length, missingSpecialistReceipts: missingAgentIds });
        for (const review of agentReviews) emit("specialist.covered", { iteration: candidateNumber, agentId: review.agentId, verdict: review.verdict, message: review.note });
        if (missingAgentIds.length) emit("specialist.coverage.missing", { iteration: candidateNumber, message: `Provider omitted ${missingAgentIds.length} planned specialist receipt(s)`, agentIds: missingAgentIds });
        if (agentReviews.some((review) => review.verdict === "block")) throw new Error(`Specialist review blocked the proposal: ${agentReviews.filter((review) => review.verdict === "block").map((review) => review.agentId).join(", ")}`);
        if (!proposal || !Array.isArray(proposal.commands) || proposal.commands.length === 0) throw new Error("AI proposal contains no commands.");
        applied = await applyIterationCommands(before, proposal.commands, candidateNumber);
        proposalChanged = doctorSourceDigest(before) !== doctorSourceDigest(applied.project);
        applied.project.iteration = { id: candidateId, parentId: before.iteration?.id ?? null, status: "candidate", track: option("--track", "gameplay"), objective: iterationGoal, condition, createdAt: new Date().toISOString(), readOnly: false };
        applied.project.build = {
          ...(before.build ?? {}),
          id: candidateId,
          sourceRevision: candidateId,
          generatedFromRevision: candidateId,
          sourceTimestamp: new Date().toISOString(),
          outputTimestamp: undefined,
          servedBuildId: candidateId,
        };
        comparison = compareProjects(before, applied.project, { profile: evaluationProfile });
        accepted = proposalChanged && comparison.after.valid && comparison.delta >= minimumDelta && comparison.regressionFree;
        if (!proposalChanged) rejectionReason = "Proposal made no authored game changes.";
        else if (!comparison.after.valid) rejectionReason = "Proposal failed project validation.";
        else if (!comparison.hardGatesPassed) rejectionReason = `Proposal failed hard gate(s): ${comparison.failedHardGates.map((entry) => entry.label).join(", ")}.`;
        else if (comparison.dimensionRegressions.length) rejectionReason = `Proposal regressed protected dimension(s): ${comparison.dimensionRegressions.map((entry) => `${entry.label} ${entry.delta}`).join(", ")}.`;
        else if (comparison.delta < minimumDelta) rejectionReason = `Profile score changed by ${comparison.delta} point(s), below the required ${minimumDelta >= 0 ? "+" : ""}${minimumDelta}.`;
        if (accepted) {
          runtimePlaytest = runDeterministicPlaytest(applied.project);
          if (!runtimePlaytest.passed) {
            accepted = false;
            rejectionReason = `Deterministic runtime playtest failed: ${runtimePlaytest.failures.map((check) => check.id).join(", ")}`;
          }
        }
      } catch (error) {
        accepted = false;
        if (!usageReceipt && error?.usageReceipt) {
          usageReceipt = { ...error.usageReceipt, iteration: candidateNumber };
          runUsageReceipts.push(usageReceipt);
          emit("usage.completed", { iteration: candidateNumber, receipt: usageReceipt, message: usageReceiptSummary(usageReceipt, `Iteration ${candidateNumber} usage`) });
        }
        rejectionReason = boundedProviderDiagnostic(error instanceof Error ? error.message : String(error), "");
      }

      const attempt = {
        iteration: candidateNumber,
        planId: providerPassPlan.planId,
        passId: activePass.passId,
        passOrder: activePass.order,
        requestedProvider,
        provider: actualProvider,
        providerFailover,
        preferenceReceipt,
        accepted,
        goal: iterationGoal,
        baseGoal: goal,
        strategy,
        condition,
        summary: proposal?.summary ?? null,
        hypothesis: proposal?.hypothesis ?? null,
        agentScores: proposal?.scores ?? null,
        agentReviews: proposal?.agentReviews ?? [],
        commands: proposal?.commands ?? [],
        evaluationProfile: evaluationProfile.id,
        quality: comparison ? { before: comparison.before.score, after: comparison.after.score, delta: comparison.delta, profile: evaluationProfile.id } : { before: beforeQuality.score, after: null, delta: null, profile: evaluationProfile.id },
        evaluation: comparison ? compactLoopEvaluation(comparison.after) : compactLoopEvaluation(beforeQuality),
        comparison: compactLoopComparison(comparison),
        providerParity: attemptProviderParity,
        verification: accepted ? { status: "pending-browser-evidence", runtimePlaytest } : null,
        rejectionReason,
        usage: usageReceipt,
        createdAt: new Date().toISOString(),
      };
      history = appendLoopAttempt(history, attempt);
      runAttempts.push(attempt);

      if (accepted) {
        project = {
          ...applied.project,
          build: { ...applied.project.build, outputTimestamp: new Date().toISOString() },
        };
        project = applyAgentCommand(project, {
          op: "checkpoint_iteration",
          id: candidateId,
          parentId: before.iteration?.id ?? null,
          status: "candidate",
          accepted: true,
          objective: iterationGoal,
          summary: proposal?.summary ?? "Accepted AI improvement pass",
          condition,
          provider: actualProvider,
          track: option("--track", "gameplay"),
          score: comparison.after.score,
          scoreKind: "quality",
          qualityDelta: comparison.delta,
          evaluation: compactLoopEvaluation(comparison.after),
          comparison: compactLoopComparison(comparison),
          providerParity: attemptProviderParity,
          doctorScore: comparison.after.doctor.score,
          errorCount: comparison.after.doctor.errorCount,
          warningCount: comparison.after.doctor.warningCount,
          doctorDigest: comparison.after.doctor.digest,
          sourceDigest: comparison.after.doctor.sourceDigest,
          doctorProfile: comparison.after.doctor.profile,
          createdAt: attempt.createdAt,
        }).project;
        const versionLabel = `v${String(candidateNumber).padStart(3, "0")}`;
        await writeJsonAtomic(projectPath, project);
        await writeJsonAtomic(join(versionsDirectory, `${versionLabel}.loop.json`), project);
        await writeJsonAtomic(join(versionsDirectory, `${versionLabel}.meta.json`), { ...attempt, evaluation: comparison.after, commandResults: applied.results });
        await writeFile(join(versionsDirectory, `${versionLabel}.html`), buildStandaloneHtml(project), "utf8");
        for (const generatedFile of applied.generatedFiles) await writeFile(join(versionsDirectory, generatedFile.filename), generatedFile.png);
        emit("iteration.accepted", { iteration: candidateNumber, planId: providerPassPlan.planId, passId: activePass.passId, summary: proposal.summary, score: comparison.after.score, delta: comparison.delta, evaluationProfile: evaluationProfile.id, dimensions: compactLoopComparison(comparison).dimensionComparisons, version: versionLabel, verificationStatus: "pending-browser-evidence", message: `${versionLabel} passed the ${evaluationProfile.label} profile, Doctor, and deterministic runtime checks; browser screenshot verification is still required.` });
      } else {
        const rejectedDoctor = comparison?.after?.doctor ?? beforeQuality.doctor;
        project = applyAgentCommand(project, {
          op: "record_iteration_attempt",
          id: `attempt-${String(candidateNumber).padStart(3, "0")}`,
          parentId: before.iteration?.id ?? null,
          status: "rejected",
          accepted: false,
          objective: iterationGoal,
          summary: proposal?.summary ?? "AI pass rejected by acceptance gates",
          reason: rejectionReason,
          condition,
          provider: actualProvider,
          track: option("--track", "gameplay"),
          score: comparison?.after?.score ?? beforeQuality.score,
          scoreKind: "quality",
          qualityDelta: comparison?.delta,
          evaluation: compactLoopEvaluation(comparison?.after ?? beforeQuality),
          comparison: compactLoopComparison(comparison),
          providerParity: attemptProviderParity,
          doctorScore: rejectedDoctor.score,
          errorCount: rejectedDoctor.errorCount,
          warningCount: rejectedDoctor.warningCount,
          doctorDigest: rejectedDoctor.digest,
          sourceDigest: rejectedDoctor.sourceDigest,
          doctorProfile: rejectedDoctor.profile,
          createdAt: attempt.createdAt,
        }).project;
        await writeJsonAtomic(join(versionsDirectory, `attempt-${String(candidateNumber).padStart(3, "0")}.rejected.json`), attempt);
        emit("iteration.rejected", {
          iteration: candidateNumber,
          planId: providerPassPlan.planId,
          passId: activePass.passId,
          reason: rejectionReason,
          score: beforeQuality.score,
          evaluationProfile: evaluationProfile.id,
          dimensionRegressions: comparison?.dimensionRegressions ?? [],
          failedHardGates: comparison?.failedHardGates ?? [],
          doctorErrors: (comparison?.newDoctorErrors ?? []).map((issue) => ({ code: issue.code, message: issue.message, mapId: issue.mapId ?? null, objectId: issue.objectId ?? null })),
        });
      }
      await writeJsonAtomic(historyPath, history);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  await writeJsonAtomic(projectPath, project);

  const loopOutcome = summarizeLoopOutcome(project, runAttempts);
  const remainingPassIds = providerPassPlan.passes.filter((pass) => !runAttempts.some((attempt) => attempt.accepted && attempt.planId === providerPassPlan.planId && attempt.passId === pass.passId)).map((pass) => pass.passId);
  const usedProviders = runUsageReceipts.map((receipt) => receipt.provider).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
  const loopProvider = usedProviders.length > 1 ? "mixed" : usedProviders[0] ?? lastProvider;
  const loopUsage = aggregateUsageReceipts(runUsageReceipts, { provider: loopProvider, model: runUsageReceipts.map((receipt) => receipt.model).filter(Boolean).filter((model, index, models) => models.indexOf(model) === index).join(", ") || lastProvider, label: "loop-total" });
  const providerFailover = createProviderFailoverReceipt({ requestedProvider, mode: providerMode, selectedProvider: lastProvider, attempts: providerFailoverReceipts.flatMap((receipt) => receipt.attempts) });
  history = appendLoopRun(history, {
    id: `run-${runStartedAt.replace(/[:.]/g, "-")}`,
    requestedProvider,
    provider: lastProvider,
    providerFailover,
    goal,
    strategy,
    conditions,
    artDirection,
    preferenceReceipt,
    evaluationProfile,
    providerParity,
    providerPassPlan: publicPassPlan,
    remainingPassIds,
    startedAt: runStartedAt,
    completedAt: new Date().toISOString(),
    accepted: loopOutcome.accepted,
    rejected: loopOutcome.rejected,
    usage: loopUsage,
  });
  await writeJsonAtomic(historyPath, history);
  emit("loop.completed", { project: summarizeProject(project), quality: compactQualityReport(evaluateProject(project, { profile: evaluationProfile })), historyPath, artDirection, preferenceReceipt, requestedProvider, provider: lastProvider, providerFailover, evaluationProfile, providerParity, providerPassPlan: publicPassPlan, passPlanStatus: remainingPassIds.length ? "incomplete" : "complete", remainingPassIds, usage: loopUsage, usageMessage: usageReceiptSummary(loopUsage, "Loop total"), ...loopOutcome });
}

main().catch((error) => {
  emit("loop.failed", { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
