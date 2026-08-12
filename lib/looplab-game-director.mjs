import { LOOPLAB_MOVEMENT_TEMPLATES } from "./looplab-reuse-guide.mjs";
import { LOOPLAB_VERB_ARCHITECTURE_POLICY } from "./looplab-verb-architecture.mjs";
import { LOOPLAB_GAMEPLAY_RULE_POLICY } from "./looplab-gameplay-rules.mjs";

const AUTO_CHOICE = Object.freeze({ value: "auto", label: "Let AI decide", direction: "" });
const PROVIDER_IDS = Object.freeze(["openai", "anthropic", "codex", "claude"]);
export const LOOPLAB_PROVIDER_PROMPT_MAX_CHARACTERS = 20_000;

const freezeChoices = (choices) => Object.freeze([AUTO_CHOICE, ...choices.map((choice) => Object.freeze(choice))]);

export const LOOPLAB_PROMPT_LENSES = Object.freeze([
  Object.freeze({
    value: "feel-and-feedback",
    label: "Feel & feedback",
    direction: "Reframe the game around the player's verbs, responsiveness, readable anticipation, impact feedback, recovery, and the moment-to-moment reasons play feels satisfying.",
    priorities: ["Define the smallest satisfying repeatable action chain and make every input legible.", "Tune acceleration, buffering, forgiveness, momentum, impact, recovery, camera response, and audiovisual confirmation as one feel system.", "Teach through safe play, then escalate timing and combination demands without surprise punishment.", "Keep failure fair and recovery fast enough that experimentation remains inviting."],
    acceptanceTargets: ["The primary verb feels responsive within the first ten seconds of play.", "Every success, miss, damage event, landing, and interaction has distinct readable feedback.", "A failed attempt can restart or recover without dead time or lost context."],
  }),
  Object.freeze({
    value: "map-and-flow",
    label: "Map & flow",
    direction: "Reframe the game around readable routes, setup and landing space, meaningful density, map-to-map continuity, landmarks, and uninterrupted player flow.",
    priorities: ["Build each interaction as preview → setup → action → landing → recovery → next decision.", "Protect run-up, landing, recovery, sightline, and HUD-safe space before decorating the map.", "Use landmarks, route hierarchy, and authored transitions so connected maps feel like one intentional journey.", "Remove dead travel and resolve collision, anchor, support-height, depth, and portal seams along every critical route."],
    acceptanceTargets: ["The intended first route is readable without trial-and-error wandering.", "No required line is blocked by props, invisible footprints, bad anchors, or mismatched z layers.", "Every map exit lands at an exact clear spawn that visually continues the journey."],
  }),
  Object.freeze({
    value: "art-and-identity",
    label: "Art & identity",
    direction: "Reframe the game around a cohesive visual language, strong silhouettes, stable scale and palette, grounded assets, environmental storytelling, and a memorable character identity.",
    priorities: ["Name a specific art direction with shape language, value hierarchy, palette roles, material rules, and reference-quality targets.", "Give the player a recognizable silhouette and stable identity across every animation frame.", "Make environments communicate route, danger, reward, depth, and world story before relying on labels.", "Keep sprites, tiles, props, UI, effects, projection, anchors, and depth sorting visually consistent while authored data remains collision truth."],
    acceptanceTargets: ["Player, goals, hazards, traversable surfaces, and background layers separate clearly at gameplay scale.", "Animation frames share palette, proportions, scale, and ground contact without flicker or drift.", "Repeated tiles and modular props avoid seams, doubled geometry, noisy repetition, and style mismatch."],
  }),
  Object.freeze({
    value: "systems-and-replay",
    label: "Systems & replay",
    direction: "Reframe the game around interacting systems, mastery, variation, escalating decisions, fair failure, fast retry, progression, and reasons to replay.",
    priorities: ["Define how the core loop creates short-term choices, medium-term goals, and long-term mastery.", "Choose verbs by the recurring decisions they create, not by a target count; one deep verb can outperform several shallow ones.", "Author intentional sequence, simultaneous, modifier, state-gate, resource-loop, counterplay, or substitution relationships and reuse them before the finale.", "Make every interaction close a decision → action → simulation → feedback loop with fair failure and recovery.", "Make scoring, resources, upgrades, risk, route choice, and failure consequences reinforce the same player fantasy.", "Support fast comparison between attempts with clear feedback, records, unlocks, or newly understood routes."],
    acceptanceTargets: ["One complete run exposes the full core loop and at least one meaningful strategic choice.", "Every selected verb and retained combination resolves to existing runtime IDs plus passing executable acceptance, replay, or source-bound browser evidence.", "A second run can differ through player decisions, mastery, route choice, or deterministic variation.", "Progress and failure states are explicit, testable, and never corrupt the best verified candidate."],
  }),
  Object.freeze({
    value: "ship-and-accessibility",
    label: "Ship & accessibility",
    direction: "Reframe the game around complete onboarding, accessible controls and feedback, responsive layouts, stable performance, deterministic QA, and one-file offline delivery.",
    priorities: ["Make the game understandable from launch through completion with concise onboarding and an always-readable objective.", "Support keyboard and gamepad on desktop; add touch only for touch profiles and protect the playfield from HUD overlap.", "Respect reduced motion, pause/blur lifecycle, contrast, readable type, forgiving input, and semantic canvas descriptions.", "Meet fixed-step performance, deterministic replay, Project Doctor, browser playtest, package-memory, and one-file offline gates."],
    acceptanceTargets: ["A first-time player can discover controls, objective, progress, failure, and completion without external instructions.", "Configured device profiles contain the game, HUD, menus, and appropriate controls without clipping or obstruction.", "The exported artifact is one complete offline HTML file with no external runtime, asset, network, or storage dependency."],
  }),
]);

const BALANCED_PROMPT_LENS = Object.freeze({
  value: "balanced",
  label: "Balanced",
  direction: "Turn the user's vision into a complete, cohesive, playable 2D HTML game whose mechanics, map flow, art, feedback, and release quality reinforce one another.",
  priorities: ["Identify the clearest player fantasy and express it through a compact repeatable core loop.", "Build the smallest purpose-earned verb system that sustains recurring decisions, independent uses, and relationships reused across teaching, pressure, recovery, and mastery.", "Build a readable beginning, escalating middle, and satisfying finish with fair collision and route flow.", "Use cohesive game-ready art, stable character identity, authored anchors, and gameplay-owned collision.", "Test the real runtime, preserve the best candidate, and ship one self-contained offline HTML file."],
  acceptanceTargets: ["The game is understandable, playable, and enjoyable from start through a clear finish.", "Mechanics, maps, art, UI, input, feedback, and progression feel like one intentional design.", "Project Doctor and browser playtest find no release-blocking failure."],
});

export function promptLens(value) {
  return LOOPLAB_PROMPT_LENSES.find((lens) => lens.value === value) ?? null;
}

export function nextPromptVariant(current) {
  const currentIndex = LOOPLAB_PROMPT_LENSES.findIndex((lens) => lens.value === current);
  return LOOPLAB_PROMPT_LENSES[(currentIndex + 1) % LOOPLAB_PROMPT_LENSES.length].value;
}

export function promptVariantLabel(value) {
  return promptLens(value)?.label ?? "Balanced";
}

const normalizedPromptTokens = (value) => String(value ?? "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

export function promptMaterialSimilarity(first, second) {
  const firstTokens = normalizedPromptTokens(first);
  const secondTokens = normalizedPromptTokens(second);
  const shingles = (tokens) => {
    if (tokens.length < 2) return new Set(tokens);
    return new Set(tokens.slice(0, -1).map((token, index) => `${token} ${tokens[index + 1]}`));
  };
  const left = shingles(firstTokens);
  const right = shingles(secondTokens);
  if (!left.size && !right.size) return 1;
  const intersection = [...left].filter((entry) => right.has(entry)).length;
  return intersection / Math.max(1, new Set([...left, ...right]).size);
}

export function validateProviderPromptDraft(draft, context = {}) {
  const errors = [];
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return ["Provider prompt draft must be an object."];
  const prompt = typeof draft.prompt === "string" ? draft.prompt.trim() : "";
  const userPrompt = typeof context.userPrompt === "string" ? context.userPrompt.trim() : "";
  const basePrompt = typeof context.basePrompt === "string" ? context.basePrompt.trim() : "";
  const comparisonPrompt = typeof context.comparisonPrompt === "string" ? context.comparisonPrompt.trim() : "";
  const requiredConstraints = Array.isArray(context.requiredConstraints) ? context.requiredConstraints.map((value) => String(value).trim()).filter(Boolean) : [];
  if (typeof draft.title !== "string" || !draft.title.trim()) errors.push("Provider prompt draft title must be non-empty.");
  if (typeof draft.summary !== "string" || !draft.summary.trim()) errors.push("Provider prompt draft summary must be non-empty.");
  if (prompt.length < 400) errors.push("Provider prompt draft must contain a complete build prompt of at least 400 characters.");
  if (prompt.length > LOOPLAB_PROVIDER_PROMPT_MAX_CHARACTERS) errors.push(`Provider prompt draft exceeds the ${LOOPLAB_PROVIDER_PROMPT_MAX_CHARACTERS.toLocaleString("en-US")} character limit.`);
  if (userPrompt && !prompt.includes(userPrompt)) errors.push("Provider prompt draft must preserve the user's exact description verbatim.");
  const lowerPrompt = prompt.toLowerCase();
  for (const constraint of requiredConstraints) {
    if (!lowerPrompt.includes(constraint.toLowerCase())) errors.push(`Provider prompt draft must preserve the directed constraint: ${constraint}.`);
  }
  if (basePrompt && promptMaterialSimilarity(prompt, basePrompt) >= 0.96) errors.push("Provider prompt draft is not materially different from the prepared provider input.");
  if (comparisonPrompt && promptMaterialSimilarity(prompt, comparisonPrompt) >= 0.94) errors.push("Provider prompt draft is not materially different from the current prompt.");
  return errors;
}

export function composeProviderGeneratedGameBrief(input = {}, draft = {}) {
  const base = composeDirectedGameBrief(input);
  const requiredConstraints = Array.isArray(draft.requiredConstraints) ? draft.requiredConstraints.map((value) => String(value).trim()).filter(Boolean) : [];
  const errors = validateProviderPromptDraft(draft, {
    userPrompt: base.userPrompt,
    basePrompt: base.composedPrompt,
    comparisonPrompt: draft.comparisonPrompt,
    requiredConstraints,
  });
  if (errors.length) throw new Error(errors.join(" "));
  if (typeof draft.id !== "string" || !draft.id.trim()) throw new Error("Provider prompt draft requires an id.");
  if (!PROVIDER_IDS.includes(draft.provider)) throw new Error("Provider prompt draft requires a supported authenticated provider.");
  if (typeof draft.generatedAt !== "string" || !draft.generatedAt.trim()) throw new Error("Provider prompt draft requires a generation timestamp.");
  const promptGeneration = {
    id: draft.id.trim(),
    provider: draft.provider,
    generatedAt: draft.generatedAt,
    title: draft.title.trim().slice(0, 160),
    summary: draft.summary.trim().slice(0, 600),
    ...(typeof draft.model === "string" && draft.model.trim() ? { model: draft.model.trim().slice(0, 160) } : {}),
    basePrompt: base.composedPrompt,
    requiredConstraints,
  };
  return { ...base, composedPrompt: draft.prompt.trim(), promptGeneration };
}

export const LOOPLAB_GAME_DIRECTOR = Object.freeze({
  genres: freezeChoices([
    { value: "skating-tricks", label: "Skating / trick action", direction: "Build momentum, readable skating lines, transfers, grinds, trick chains, landings, and recovery choices." },
    { value: "platformer", label: "Platformer", direction: "Build precise movement, readable platforms, fair hazards, secrets, checkpoints, and satisfying traversal mastery." },
    { value: "action-adventure", label: "Action adventure", direction: "Combine exploration, encounters, environmental interaction, objectives, and memorable connected locations." },
    { value: "metroidvania", label: "Metroidvania", direction: "Use ability-gated routes, shortcuts, backtracking payoffs, landmarks, and a coherent connected world." },
    { value: "puzzle", label: "Puzzle", direction: "Teach a compact rule set, escalate combinations, provide readable feedback, and avoid trial-and-error ambiguity." },
    { value: "roguelite", label: "Roguelite", direction: "Create short replayable runs, meaningful build choices, procedural variety, risk/reward, and clear run resets." },
    { value: "survival", label: "Survival", direction: "Balance gathering, pressure, safe planning windows, escalating threats, and resilient recovery systems." },
    { value: "tower-defense", label: "Tower defense", direction: "Make routes, waves, placement tradeoffs, counters, upgrades, and battlefield readability central." },
    { value: "racing", label: "Racing / time trial", direction: "Prioritize route mastery, speed readability, checkpoints, clean retries, rival times, and skillful shortcuts." },
    { value: "stealth", label: "Stealth", direction: "Use observation, patrol readability, cover, distraction, detection feedback, and multiple recovery paths." },
    { value: "rhythm", label: "Rhythm / timing", direction: "Align input windows, audiovisual feedback, readable patterns, combo growth, and forgiving recovery to a stable beat." },
    { value: "cozy", label: "Cozy collection", direction: "Focus on low-pressure exploration, collection, expressive customization, gentle goals, and a welcoming environment." },
  ]),
  coreLoops: freezeChoices([
    { value: "traverse-chain-score", label: "Traverse → chain → score", direction: "The repeatable loop is spotting a line, building momentum, chaining interactions, landing cleanly, scoring, and choosing the next line." },
    { value: "explore-collect-unlock", label: "Explore → collect → unlock", direction: "The repeatable loop is exploring landmarks, collecting useful rewards, unlocking access or abilities, and revisiting changed routes." },
    { value: "fight-loot-upgrade", label: "Fight → loot → upgrade", direction: "The repeatable loop is reading an encounter, fighting, collecting rewards, choosing upgrades, and testing the new build." },
    { value: "solve-open-advance", label: "Observe → solve → advance", direction: "The repeatable loop is learning a rule, forming a plan, testing it, receiving exact feedback, and opening the next challenge." },
    { value: "gather-build-survive", label: "Gather → build → survive", direction: "The repeatable loop is gathering under pressure, improving a safe position, surviving escalation, and expanding capability." },
    { value: "defend-upgrade-waves", label: "Place → defend → upgrade", direction: "The repeatable loop is reading the next wave, placing counters, defending, evaluating leaks, and upgrading intentionally." },
    { value: "practice-race-improve", label: "Practice → race → improve", direction: "The repeatable loop is learning the route, attempting a run, comparing split feedback, and immediately retrying smarter." },
    { value: "observe-sneak-escape", label: "Observe → sneak → escape", direction: "The repeatable loop is observing patterns, choosing a route, executing quietly, adapting to detection, and reaching safety." },
    { value: "create-test-optimize", label: "Create → test → optimize", direction: "The repeatable loop is building a solution, testing its behavior, reading bottlenecks, and refining it." },
    { value: "listen-react-combo", label: "Listen → react → combo", direction: "The repeatable loop is reading rhythmic cues, responding on time, sustaining a combo, and recovering without losing clarity." },
  ]),
  movementTemplates: freezeChoices(LOOPLAB_MOVEMENT_TEMPLATES),
  formats: freezeChoices([
    { value: "side-scroll", label: "Side-scrolling", direction: "Use a side-on camera with authored verticality, anticipation space, landing visibility, and controlled screen transitions." },
    { value: "top-down", label: "Top-down", direction: "Use top-down navigation with readable silhouettes, spatial tactics, clear walkable footprints, and stable camera framing." },
    { value: "dimetric", label: "2:1 dimetric", direction: "Use exact 2:1 dimetric projection, explicit support height, independent z routes, ground anchors, and deterministic depth slices." },
    { value: "single-screen", label: "Single-screen arcade", direction: "Keep the complete decision space visible, minimize downtime, and make rapid restarts and score feedback immediate." },
    { value: "connected-rooms", label: "Connected rooms / maps", direction: "Use multiple authored maps with memorable exits, target spawns, continuity landmarks, and seamless-feeling transitions." },
    { value: "endless", label: "Endless / scrolling", direction: "Use deterministic chunk rules, readable forward threats, fair spawning, escalating intensity, and clean score-driven restarts." },
  ]),
  progressions: freezeChoices([
    { value: "score-attack", label: "Score attack", direction: "Make score sources legible, reward expressive mastery, support combos and multipliers, and enable instant retry comparison." },
    { value: "level-campaign", label: "Level campaign", direction: "Structure authored stages with teaching, escalation, checkpoints, goals, and a clear finish." },
    { value: "run-based", label: "Run-based upgrades", direction: "Use run-local choices, escalating encounters, meaningful build variety, and a clear reset loop." },
    { value: "persistent-unlocks", label: "Persistent unlocks", direction: "Let completed goals unlock durable abilities, routes, cosmetics, or tools without erasing skill-based challenge." },
    { value: "narrative-objectives", label: "Narrative objectives", direction: "Tie mechanics to readable objectives, environmental storytelling, character motivation, and consequential milestones." },
    { value: "sandbox-mastery", label: "Sandbox mastery", direction: "Provide expressive systems, self-directed challenges, reusable spaces, records, and reasons to experiment." },
  ]),
  campaignScopes: freezeChoices([
    { value: "single-map", label: "One focused map", direction: "Deliver one authored map whose opening, escalation, climax, and finish all fit a coherent playable route.", minMaps: 1, maxMaps: 1, requiresConnected: false },
    { value: "two-connected-maps", label: "Two connected maps", direction: "Deliver exactly two authored maps in player-experience order with a real portal-to-spawn transition between them.", minMaps: 2, maxMaps: 2, requiresConnected: true },
    { value: "three-connected-regions", label: "Three connected regions", direction: "Deliver exactly three distinct authored regions in player-experience order, connected by exact portal-to-spawn transitions.", minMaps: 3, maxMaps: 3, requiresConnected: true },
    { value: "four-to-six-map-campaign", label: "Four–six map campaign", direction: "Deliver a compact authored campaign of four to six maps with ordered progression, memorable transitions, and no unreachable region.", minMaps: 4, maxMaps: 6, requiresConnected: true },
  ]),
});

const GROUPS = Object.freeze([
  ["genre", "Genre", LOOPLAB_GAME_DIRECTOR.genres],
  ["coreLoop", "Core gameplay loop", LOOPLAB_GAME_DIRECTOR.coreLoops],
  ["movementTemplate", "Movement / rules template", LOOPLAB_GAME_DIRECTOR.movementTemplates],
  ["format", "Camera / world format", LOOPLAB_GAME_DIRECTOR.formats],
  ["progression", "Progression", LOOPLAB_GAME_DIRECTOR.progressions],
  ["campaignScope", "World scope", LOOPLAB_GAME_DIRECTOR.campaignScopes],
]);

export function campaignScopeRequirement(value) {
  const choice = LOOPLAB_GAME_DIRECTOR.campaignScopes.find((option) => option.value === value);
  if (!choice || !Number.isInteger(choice.minMaps)) return null;
  return Object.freeze({
    value: choice.value,
    label: choice.label,
    minMaps: choice.minMaps,
    maxMaps: Number.isInteger(choice.maxMaps) ? choice.maxMaps : null,
    requiresConnected: choice.requiresConnected === true,
  });
}

export function directorChoice(options, value) {
  return options.find((option) => option.value === value) ?? options[0];
}

export function composeDirectedGameBrief(input = {}) {
  const userPrompt = typeof input.userPrompt === "string" ? input.userPrompt.trim() : "";
  const includeCampaignScope = Object.prototype.hasOwnProperty.call(input, "campaignScope");
  const activeGroups = GROUPS.filter(([field]) => field !== "campaignScope" || includeCampaignScope);
  const selections = Object.fromEntries(activeGroups.map(([field, , options]) => [field, directorChoice(options, input[field]).value]));
  const selectedLens = promptLens(input.promptVariant);
  const promptVariant = selectedLens?.value ?? "";
  const draftLens = selectedLens ?? BALANCED_PROMPT_LENS;
  const selected = activeGroups
    .map(([field, label, options]) => [label, directorChoice(options, selections[field])])
    .filter(([, option]) => option.value !== "auto");
  const vision = userPrompt || "Create an original, polished 2D HTML game from the selected design direction.";
  const composedPrompt = [
    `LOOPLAB GAME BUILD PROMPT — ${draftLens.label.toUpperCase()} DRAFT`,
    `CREATIVE MANDATE:\n${draftLens.direction}`,
    `USER VISION — PRESERVE THIS INTENT:\n${vision}`,
    selected.length
      ? `DIRECTED GAME DESIGN:\n${selected.map(([label, option]) => `- ${label}: ${option.label}. ${option.direction}`).join("\n")}`
      : includeCampaignScope
        ? "DIRECTED GAME DESIGN:\n- Infer the strongest genre, loop, movement template, format, progression, and world scope from the user vision."
        : "DIRECTED GAME DESIGN:\n- Infer the strongest genre, loop, movement template, format, and progression from the user vision.",
    `VERB SYSTEM V2:\n${LOOPLAB_VERB_ARCHITECTURE_POLICY.rule}\nAuthor verbArchitecture version 2. There is no required mechanic count and no mandatory all-pairs score matrix. One deep verb is valid; every additional verb must earn its input, attention, onboarding, implementation, and feedback cost. For each active verb, record purpose, role, activation, standalone/dependency truth, input actions, affordances, state changes, feedback IDs, runtime IDs, and test IDs. Connect only meaningful multi-verb relationships with an explicit operator and cadence. Distribute recurring relationships across authored teaching/practice and pressure/mastery/recovery applications instead of saving them for one finale. Model the repeatable core loop and any resource source/sink pressure. A prose record is a specification, not passing evidence.`,
    `EXECUTABLE GAMEPLAY PROGRAM:\n${LOOPLAB_GAMEPLAY_RULE_POLICY.rule}\nUse stable gameplay rule IDs as implementation evidence only when those rules change real runtime state in preview, replay, and the exported offline HTML.`,
    `DESIGN PRIORITIES FOR THIS DRAFT:\n${draftLens.priorities.map((priority, index) => `${index + 1}. ${priority}`).join("\n")}`,
    "BUILD ORDER:\n1. State the player fantasy and desired dynamics, remove or repurpose inherited starter semantics, then identify the smallest set of recurring player decisions that can sustain the game.\n2. Implement each retained action as typed deterministic state change with semantic input, target affordance, readable feedback, failure/recovery, stable runtime IDs, and executable acceptance or replay proof.\n3. Author only relationships that create a new decision; place independent uses plus repeated teaching, practice, pressure, recovery, and mastery applications throughout the game—not only in the finale.\n4. Model the repeatable decide-act-feedback loop, progression dependencies, and any resource sources, sinks, pressure, and recovery.\n5. Run get_acceptance_plan and run_acceptance_suite; never claim a prose specification passed.\n6. Author map routes, collision, supports, traversal, joins, state changes, and progression before decorative polish.\n7. Create cohesive game-ready art and playtest the browser runtime; remove inert or shallow promises, fix the highest-impact failure, rerun gates, and export one self-contained offline HTML file.",
    `ACCEPTANCE TARGETS:\n${draftLens.acceptanceTargets.map((target) => `- ${target}`).join("\n")}`,
    "INTEGRATION RULE: Treat the selections as constraints that clarify and strengthen the user's vision, not as a replacement for it. Produce a genuinely new complete implementation brief for this draft, build the playable game directly in the selected Looplab library project, keep generated art separate from authored collision, and verify the full create-preview-adjust-export loop.",
  ].join("\n\n");

  return { ...selections, userPrompt, ...(promptVariant ? { promptVariant } : {}), composedPrompt };
}

export function reconcileDirectedGameBrief(input = {}) {
  const prepared = composeDirectedGameBrief(input);
  const generation = input?.promptGeneration;
  if (!generation || generation.basePrompt !== prepared.composedPrompt) return prepared;

  const candidate = {
    ...prepared,
    composedPrompt: input.composedPrompt,
    promptGeneration: { ...generation },
  };
  return validateDirectedGameBrief(candidate).length ? prepared : candidate;
}

export function validateDirectedGameBrief(brief, prefix = "designBrief") {
  const errors = [];
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) return [`${prefix} must be an object.`];
  for (const [field, , options] of GROUPS) {
    if ((field === "movementTemplate" || field === "campaignScope") && brief[field] === undefined) continue;
    if (typeof brief[field] !== "string" || !options.some((option) => option.value === brief[field])) {
      errors.push(`${prefix}.${field} is not a supported choice.`);
    }
  }
  if (brief.promptVariant !== undefined && (typeof brief.promptVariant !== "string" || !promptLens(brief.promptVariant))) {
    errors.push(`${prefix}.promptVariant is not a supported prompt draft lens.`);
  }
  if (typeof brief.userPrompt !== "string") errors.push(`${prefix}.userPrompt must be a string.`);
  if (typeof brief.composedPrompt !== "string" || !brief.composedPrompt.trim()) errors.push(`${prefix}.composedPrompt must be a non-empty string.`);
  else {
    const expected = composeDirectedGameBrief(brief).composedPrompt;
    const legacyExpected = expected.replace("genre, loop, movement template, format, and progression", "genre, loop, format, and progression");
    if (brief.promptGeneration !== undefined) {
      const generation = brief.promptGeneration;
      if (!generation || typeof generation !== "object" || Array.isArray(generation)) errors.push(`${prefix}.promptGeneration must be an object.`);
      else {
        if (typeof generation.id !== "string" || !generation.id.trim()) errors.push(`${prefix}.promptGeneration.id must be non-empty.`);
        if (!PROVIDER_IDS.includes(generation.provider)) errors.push(`${prefix}.promptGeneration.provider is not supported.`);
        if (typeof generation.generatedAt !== "string" || !generation.generatedAt.trim()) errors.push(`${prefix}.promptGeneration.generatedAt must be non-empty.`);
        if (typeof generation.title !== "string" || !generation.title.trim()) errors.push(`${prefix}.promptGeneration.title must be non-empty.`);
        if (typeof generation.summary !== "string" || !generation.summary.trim()) errors.push(`${prefix}.promptGeneration.summary must be non-empty.`);
        if (generation.model !== undefined && (typeof generation.model !== "string" || !generation.model.trim())) errors.push(`${prefix}.promptGeneration.model must be a non-empty string when provided.`);
        if (generation.basePrompt !== expected) errors.push(`${prefix}.promptGeneration.basePrompt must match the deterministic provider input for these selections.`);
        const requiredConstraints = Array.isArray(generation.requiredConstraints) ? generation.requiredConstraints : [];
        if (!Array.isArray(generation.requiredConstraints) || requiredConstraints.some((value) => typeof value !== "string" || !value.trim())) errors.push(`${prefix}.promptGeneration.requiredConstraints must be an array of non-empty strings.`);
        for (const message of validateProviderPromptDraft({ title: generation.title, summary: generation.summary, prompt: brief.composedPrompt }, { userPrompt: brief.userPrompt, basePrompt: expected, requiredConstraints })) errors.push(`${prefix}.${message}`);
      }
    } else if (brief.composedPrompt !== expected && !(brief.movementTemplate === undefined && brief.composedPrompt === legacyExpected)) errors.push(`${prefix}.composedPrompt must match the selected direction and user prompt.`);
  }
  return errors;
}

export function directedGameSummary(brief) {
  return GROUPS
    .map(([field, , options]) => directorChoice(options, brief?.[field]))
    .filter((option) => option.value !== "auto")
    .map((option) => option.label);
}
