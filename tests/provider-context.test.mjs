import assert from "node:assert/strict";
import test from "node:test";

import { createTemplate, summarizeProject } from "../lib/looplab-agent-core.mjs";
import { routeGameStudioWork } from "../lib/looplab-capability-router.mjs";
import {
  LOOPLAB_PROVIDER_CONTEXT_POLICY,
  buildProviderIterationContext,
  compactPriorAttempts,
  compactProviderProject,
  measureProviderIterationContext,
  planProviderPasses,
  preflightProviderIterationContext,
  providerGoalForPass,
  publicProviderPassPlan,
  selectProviderPass,
} from "../lib/looplab-provider-context.mjs";
import {
  buildOpenAiResponsesRequest,
  openAiPromptCacheKey,
  openAiSupportsExplicitPromptCacheBreakpoints,
  requireOpenAiStructuredResult,
} from "../lib/looplab-openai-request.mjs";

test("provider context omits snapshots, old requests, embedded pixels, and duplicate composed prompts", () => {
  const project = createTemplate("dimetric");
  project.iterationArchive = { snapshots: [{ id: "snapshot", project: "archive-body-".repeat(20_000) }] };
  project.agentRequests = [{ id: "request", prompt: "old-request-body-".repeat(12_000), status: "failed" }];
  project.iterationHistory = [{ id: "history", summary: "old-history-body-".repeat(4_000) }];
  project.iteration = { ...project.iteration, objective: "old-objective-".repeat(5_000), route: { large: "route-body-".repeat(3_000) } };
  project.designBrief = {
    description: "Build the exact user-approved resonance campaign.",
    genre: "action-adventure",
    composedPrompt: "full-composed-prompt-".repeat(5_000),
    promptGeneration: {
      id: "prompt-1",
      title: "Resonance campaign",
      summary: "Four verbs across three connected regions.",
      basePrompt: "generated-base-prompt-".repeat(5_000),
      requiredConstraints: ["2.5D", "offline HTML"],
    },
  };
  project.assets = [{
    id: "asset-1",
    name: "Hero",
    type: "sprite",
    dataUrl: `data:image/png;base64,${"A".repeat(100_000)}`,
    width: 32,
    height: 32,
    frameWidth: 32,
    frameHeight: 32,
    frames: 1,
    columns: 1,
  }];
  project.gameplayProgram = { rules: [{ id: "duplicate-runtime", body: "gameplay-body-".repeat(10_000) }] };
  project.verbArchitecture = { verbs: [{ id: "duplicate-verb", body: "verb-body-".repeat(10_000) }] };

  const compact = compactProviderProject(project);
  assert.equal(compact.iterationArchive, undefined);
  assert.equal(compact.agentRequests, undefined);
  assert.equal(compact.iterationHistory, undefined);
  assert.equal(compact.objects, undefined);
  assert.equal(compact.navigation, undefined);
  assert.equal(compact.traversalPaths, undefined);
  assert.equal(compact.gameplayProgram, undefined);
  assert.equal(compact.verbArchitecture, undefined);
  assert.equal(compact.designBrief.composedPrompt, undefined);
  assert.equal(compact.designBrief.promptGeneration.basePrompt, undefined);
  assert.equal(compact.designBrief.promptGeneration.summary, "Four verbs across three connected regions.");
  assert.match(compact.assets[0].dataUrl, /embedded image omitted/);
  assert.equal(JSON.stringify(compact.maps), JSON.stringify(project.maps));
  assert.deepEqual(compact.inputActions, project.inputActions);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(project).length * 0.2);
  assert.ok(compact.providerContext.omittedBytes["activeMapMirror.objects"] > 0);
});

test("active-map mirrors are omitted without changing authoritative maps", () => {
  const project = createTemplate("dimetric");
  const compact = compactProviderProject(project);
  assert.equal(compact.width, undefined);
  assert.equal(compact.height, undefined);
  assert.equal(compact.projection, undefined);
  assert.equal(compact.activeMapId, project.activeMapId);
  assert.equal(JSON.stringify(compact.maps), JSON.stringify(project.maps));
  assert.equal(compact.providerContext.mapIndex[0].objectCount, project.maps[0].objects.length);
});

test("retry context keeps exact diagnostics and command order without resending command bodies", () => {
  const attempts = [{
    iteration: 2,
    accepted: false,
    strategy: "improve",
    summary: "Authored the proof garden.",
    hypothesis: "The four verbs form a stable base.",
    rejectionReason: "movementTuning.jumpVelocity must be a non-negative finite number.",
    quality: { before: 72, after: null, delta: null },
    commands: [
      { op: "set_project", changes: { huge: "do-not-resend-".repeat(10_000) } },
      { op: "set_gameplay_program", program: { huge: "do-not-resend-either-".repeat(10_000) } },
    ],
    agentReviews: [{ agentId: "gameplay-engineer", verdict: "revise", note: "Complete every required tuning field." }],
  }];

  const compact = compactPriorAttempts(attempts);
  const serialized = JSON.stringify(compact);
  assert.deepEqual(compact[0].commandOps, ["set_project", "set_gameplay_program"]);
  assert.equal(compact[0].commandCount, 2);
  assert.match(compact[0].rejectionReason, /jumpVelocity/);
  assert.doesNotMatch(serialized, /do-not-resend/);
});

test("iteration context preserves the current goal and specialist receipts within a bounded payload", () => {
  const project = createTemplate("topdown");
  project.agentRequests = [{ prompt: "duplicate-".repeat(50_000) }];
  project.iterationArchive = { snapshots: [{ project: "snapshot-".repeat(50_000) }] };
  project.actorProgram = { schemaVersion: "looplab-actor-program/v1", enabled: true, actors: [{ payload: "duplicate-".repeat(20_000) }], acceptanceTestIds: [] };
  const goal = "Build the current authored game and satisfy its exact acceptance conditions.";
  const context = buildProviderIterationContext({
    goal,
    baseGoal: goal,
    strategy: "improve",
    condition: "Doctor blockers are zero",
    artDirection: { mode: "explore", locks: [], instruction: "Choose a cohesive identity." },
    iteration: 3,
    project,
    quality: { score: 72, doctor: { errorCount: 1, warningCount: 2, issues: [{ severity: "error", code: "support-missing", message: "Attach the prop." }] } },
    gameplayProgram: { policy: {}, inspection: { present: false } },
    actorProgram: { policy: { simulation: "fixed tick" }, inspection: { present: true, actorCount: 1 } },
    verbArchitecture: { policy: {}, inspection: { present: false } },
    capabilityRoute: {
      productScope: { dimension: "2d" },
      context: { prompt: "duplicate route prompt" },
      route: [{ order: 1, capabilityId: "web-game-foundations", label: "Architecture", owns: ["simulation"], gate: "implementation" }],
      agentPlan: [{ order: 1, agentId: "technical-architect", label: "Technical Architect", owns: ["simulation"], produces: "review", instruction: "Keep simulation deterministic.", executor: "selected-provider", receiptRequired: true }],
      agentExecution: { mode: "single-provider-staged-review" },
      boundaries: { simulation: "fixed tick" },
    },
    priorAttempts: [],
  });

  const serialized = JSON.stringify(context);
  assert.equal(context.goal, goal);
  assert.equal(context.baseGoal, "[same as goal]");
  assert.equal(context.capabilityRoute.agentPlan[0].agentId, "technical-architect");
  assert.match(serialized, /support-missing/);
  assert.doesNotMatch(serialized, /duplicate route prompt/);
  assert.equal(context.project.actorProgram, undefined);
  assert.equal(context.actorProgram.inspection.actorCount, 1);
  assert.ok(serialized.length < 40_000, `compact context was ${serialized.length} characters`);
  const measurement = measureProviderIterationContext(context);
  assert.equal(measurement.characters, serialized.length);
  assert.equal(measurement.roughTokenEstimate, Math.ceil(serialized.length / 4));
  assert.ok(measurement.sectionCharacters.project > 0);
});

test("provider context gives Codex and Claude the same native runtime-selection plan", () => {
  const project = createTemplate("platformer");
  const goal = "Create a tilemap platformer with multiple scenes, camera follow, and animated sprite atlases.";
  const capabilityRoute = routeGameStudioWork(project, { prompt: goal, track: "creation", framework: "auto" });
  const context = buildProviderIterationContext({
    goal,
    baseGoal: goal,
    strategy: "improve",
    condition: null,
    artDirection: { mode: "explore", locks: [], instruction: "Choose a cohesive identity." },
    iteration: 1,
    project,
    quality: { score: 70, doctor: { errorCount: 0, warningCount: 0, issues: [] } },
    gameplayProgram: { policy: {}, inspection: { present: false } },
    verbArchitecture: { policy: {}, inspection: { present: false } },
    capabilityRoute,
    priorAttempts: [],
  });
  assert.equal(context.capabilityRoute.runtimeSelection.selectedFramework, "phaser");
  assert.equal(context.capabilityRoute.runtimeSelection.singleFile.delivery, "inline-script-tag");
  assert.equal(context.capabilityRoute.productionPlan.programOwned, true);
  assert.equal(context.capabilityRoute.productionPlan.externalSkillRequired, false);
  assert.equal(context.capabilityRoute.productionPlan.architecture.phaserScenePolicy.includes("never own gameplay truth"), true);
  assert.equal(context.capabilityRoute.productionPlan.playtest.executor, "playwright");
});

test("provider context carries the same conditional narrative role without a second provider call", () => {
  const project = createTemplate("topdown");
  const goal = "Create a story-driven adventure with NPC dialogue, quests, lore, and an implemented ending payoff.";
  const capabilityRoute = routeGameStudioWork(project, { prompt: goal, track: "creation" });
  const context = buildProviderIterationContext({
    goal,
    baseGoal: goal,
    strategy: "improve",
    condition: null,
    artDirection: { mode: "explore", locks: [], instruction: "Choose a cohesive identity." },
    iteration: 1,
    project,
    quality: { score: 70, doctor: { errorCount: 0, warningCount: 0, issues: [] } },
    gameplayProgram: { policy: {}, inspection: { present: false } },
    verbArchitecture: { policy: {}, inspection: { present: false } },
    capabilityRoute,
    priorAttempts: [],
  });
  assert.equal(context.capabilityRoute.context.narrative.included, true);
  assert.ok(context.capabilityRoute.agentPlan.some((agent) => agent.agentId === "narrative-designer"));
  assert.equal(context.capabilityRoute.agentExecution.providerInvocationsPerIteration, 1);
  assert.match(context.capabilityRoute.productionPlan.narrative.boundary, /Prose-only lore cannot masquerade/i);
});

test("console project summaries expose iteration identity without echoing its full prompt", () => {
  const project = createTemplate("dimetric");
  project.iteration = {
    id: "iteration-7",
    parentId: "iteration-6",
    status: "candidate",
    track: "gameplay",
    objective: "large-provider-objective-".repeat(10_000),
    createdAt: "2026-08-09T00:00:00.000Z",
    readOnly: false,
  };
  const summary = summarizeProject(project);
  assert.equal(summary.iteration.id, "iteration-7");
  assert.equal(summary.iteration.objectiveLength, project.iteration.objective.length);
  assert.equal(summary.iteration.objective, undefined);
  assert.ok(JSON.stringify(summary).length < 2_000);
});

test("oversized multi-map work becomes stable ordered passes with content-light public receipts", () => {
  const project = createTemplate("dimetric");
  const secondMap = structuredClone(project.maps[0]);
  secondMap.id = "map-second";
  secondMap.name = "Second district";
  secondMap.objects = secondMap.objects.map((object) => ({ ...object, id: `second-${object.id}` }));
  project.maps.push(secondMap);
  const input = {
    goal: "Build two connected districts and then validate their exact runtime transition.",
    project,
    measurement: { characters: 200_000, roughTokenEstimate: 50_000, sectionCharacters: { project: 180_000, goal: 20_000 } },
    sourceDigest: "source-test",
    roughTokenBudget: 8_000,
    maximumPasses: 3,
  };
  const first = planProviderPasses(input);
  const second = planProviderPasses(input);
  assert.equal(first.planId, second.planId);
  assert.equal(first.mode, "bounded");
  assert.equal(first.completionPolicy.targetScoreBehavior, "deferred-until-required-passes-complete");
  assert.equal(first.completionPolicy.requiredAcceptedPasses, 3);
  assert.equal(first.completionPolicy.providerCallCap, "iterations");
  assert.equal(first.passes.length, 3);
  assert.deepEqual(first.passes[1].dependsOn, [first.passes[0].passId]);
  assert.equal(first.passes.at(-1).kind, "integration");
  assert.equal(first.passes.at(-1).projectionMode, "runtime-joins");
  const publicPlan = publicProviderPassPlan(first);
  assert.equal(publicPlan.passes[0].objectiveText, undefined);
  assert.ok(publicPlan.passes[0].objectiveCharacters > 0);
  assert.equal(selectProviderPass(first, [{ planId: first.planId, passId: first.passes[0].passId, accepted: false }]).passId, first.passes[0].passId);
  assert.equal(selectProviderPass(first, [{ planId: first.planId, passId: first.passes[0].passId, accepted: true }]).passId, first.passes[1].passId);
  const passGoal = providerGoalForPass(input.goal, first, first.passes[0]);
  assert.match(passGoal, new RegExp(first.passes[0].passId));
  assert.match(passGoal, /Work only inside this scope/);
});

test("bounded passes preserve the complete exact objective instead of silently truncating it", () => {
  const exactObjective = `BEGIN-EXACT\n${"authored requirement ".repeat(700)}\nEND-EXACT`;
  const project = createTemplate("platformer");
  const plan = planProviderPasses({
    goal: exactObjective,
    conditions: ["first proof", "second proof"],
    project,
    measurement: { characters: 80_000, roughTokenEstimate: 20_000, sectionCharacters: { project: 60_000, goal: 20_000 } },
    roughTokenBudget: 8_000,
    maximumPasses: 2,
  });
  const passGoal = providerGoalForPass(exactObjective, plan, plan.passes[0]);
  assert.ok(passGoal.startsWith(exactObjective));
  assert.match(passGoal, /END-EXACT/);
});

test("every explicit condition survives deterministic grouping when the call cap is smaller", () => {
  const project = createTemplate("platformer");
  const conditions = ["movement", "collision", "art", "accessibility", "offline export"];
  const plan = planProviderPasses({
    goal: "Polish the game.",
    conditions,
    project,
    measurement: { characters: 1_000, roughTokenEstimate: 250, sectionCharacters: { project: 900, goal: 100 } },
    roughTokenBudget: 8_000,
    maximumPasses: 2,
  });
  assert.equal(plan.passes.length, 2);
  const combined = plan.passes.map((pass) => pass.objectiveText).join("\n");
  for (const condition of conditions) assert.match(combined, new RegExp(condition));
});
test("complex generation gets a larger bounded provider context without becoming unbounded", () => {
  assert.equal(LOOPLAB_PROVIDER_CONTEXT_POLICY.defaultRoughTokenBudget, 96_000);
  assert.equal(LOOPLAB_PROVIDER_CONTEXT_POLICY.maximumRoughTokenBudget, 200_000);
  assert.ok(LOOPLAB_PROVIDER_CONTEXT_POLICY.defaultRoughTokenBudget < LOOPLAB_PROVIDER_CONTEXT_POLICY.maximumRoughTokenBudget);
});


test("provider preflight blocks oversized context without silently raising the configured budget", () => {
  const context = { goal: "small", project: { authoredTruth: "X".repeat(80_000) } };
  const result = preflightProviderIterationContext(context, 8_000);
  assert.equal(result.allowed, false);
  assert.equal(result.budgetRoughTokens, LOOPLAB_PROVIDER_CONTEXT_POLICY.minimumRoughTokenBudget);
  assert.equal(result.largestSections[0][0], "project");
  assert.ok(result.roughTokenEstimate > result.budgetRoughTokens);
});

test("OpenAI cache keys use only the stable developer prefix and gate explicit breakpoints by model", () => {
  const developerPrompt = "Stable LoopLab instructions";
  const first = buildOpenAiResponsesRequest({
    model: "gpt-5.2",
    purpose: "game-iteration",
    developerPrompt,
    userInput: "private-project-alpha",
    schema: { type: "object" },
    schemaName: "test",
    strict: false,
  });
  const second = buildOpenAiResponsesRequest({
    model: "gpt-5.2",
    purpose: "game-iteration",
    developerPrompt,
    userInput: "private-project-beta",
    schema: { type: "object" },
    schemaName: "test",
    strict: false,
  });
  assert.equal(first.prompt_cache_key, second.prompt_cache_key);
  assert.equal(first.prompt_cache_key, openAiPromptCacheKey({ purpose: "game-iteration", developerPrompt }));
  assert.doesNotMatch(first.prompt_cache_key, /private-project/);
  assert.equal(first.prompt_cache_options, undefined);
  assert.equal(first.input[0].content, developerPrompt);
  assert.equal(openAiSupportsExplicitPromptCacheBreakpoints("gpt-5.2"), false);

  const explicit = buildOpenAiResponsesRequest({ model: "gpt-5.6", purpose: "game-iteration", developerPrompt, userInput: "changing" });
  assert.equal(openAiSupportsExplicitPromptCacheBreakpoints("gpt-5.6"), true);
  assert.deepEqual(explicit.prompt_cache_options, { mode: "explicit" });
  assert.deepEqual(explicit.input[0].content[0].prompt_cache_breakpoint, { mode: "explicit" });
  assert.equal(explicit.input[0].content[0].text, developerPrompt);
});

test("OpenAI structured responses reject incomplete, refused, missing, and malformed output", () => {
  const completed = {
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: '{"answer":"ok"}' }] }],
  };
  assert.deepEqual(requireOpenAiStructuredResult(completed, "test output"), { answer: "ok" });
  assert.throws(
    () => requireOpenAiStructuredResult({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }, "test output"),
    /incomplete test output \(max_output_tokens\)/,
  );
  assert.throws(
    () => requireOpenAiStructuredResult({ status: "completed", output: [{ content: [{ type: "refusal", refusal: "No" }] }] }, "test output"),
    /refused the test output/,
  );
  assert.throws(() => requireOpenAiStructuredResult({ status: "completed", output: [] }, "test output"), /no structured test output/);
  assert.throws(
    () => requireOpenAiStructuredResult({ status: "completed", output: [{ content: [{ type: "output_text", text: "not-json" }] }] }, "test output"),
    /invalid structured JSON/,
  );
  assert.throws(
    () => requireOpenAiStructuredResult({ status: "completed", output_text: "[]" }, "test output"),
    /non-object test output/,
  );
});
