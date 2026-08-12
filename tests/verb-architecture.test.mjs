import test from "node:test";
import assert from "node:assert/strict";

import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { applyAgentCommand, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { inspectVerbArchitecture, LOOPLAB_VERB_ARCHITECTURE_POLICY, normalizeVerbArchitecture } from "../lib/looplab-verb-architecture.mjs";
import { composeDirectedGameBrief } from "../lib/looplab-game-director.mjs";
import { LOOPLAB_ACCEPTANCE_RUNNER } from "../lib/looplab-acceptance.mjs";

function fixtureProject() {
  const project = createTemplate("dimetric");
  project.acceptanceTests = [
    "test-orient", "test-bind", "test-peal",
    "test-orient-bind", "test-bind-peal", "test-orient-peal",
    "test-seed-upgrade",
    "test-pulse", "test-pulse-teach", "test-pulse-pressure",
    "test-tether", "test-tether-practice", "test-pulse-tether", "test-pulse-tether-teach",
    "test-loop-decide", "test-loop-act", "test-loop-feedback",
  ].map((id) => ({
    id,
    name: id,
    ownerId: id.replace(/^test-/, ""),
    assertion: "semantic-state-change",
    runner: LOOPLAB_ACCEPTANCE_RUNNER,
    driver: { tickRate: 60, tickCount: 1, startMapId: "map-main", inputs: [] },
    assertions: [{ id: `${id}-map`, target: "runtime-state", property: "activeMapId", operator: "equals", expected: "map-main" }],
  }));
  return project;
}

function completeArchitecture() {
  return {
    version: 1,
    status: "implemented",
    hypothesis: "Orientation, binding, and resonance create distinct navigation, puzzle, and recovery decisions without duplicating one another.",
    verbs: [
      { id: "orient", label: "Orient", category: "movement", status: "core", description: "Choose a height-aware route.", inputActionIds: ["move-up"], stateChanges: ["active route layer changes"], implementationIds: ["move-up", "ground-route"], testIds: ["test-orient"] },
      { id: "bind", label: "Bind", category: "interaction", status: "core", description: "Connect an authored route endpoint.", inputActionIds: ["interact"], stateChanges: ["route availability changes"], implementationIds: ["interact", "ground-passage-route"], testIds: ["test-bind"] },
      { id: "peal", label: "Peal", category: "world-state", status: "supporting", description: "Pulse nearby authored mechanisms.", inputActionIds: ["interact"], stateChanges: ["mechanism phase changes"], implementationIds: ["interact", "route-token-a"], testIds: ["test-peal"] },
      { id: "echo", label: "Echo", category: "utility", status: "cut", description: "Duplicated the Peal read and was removed.", inputActionIds: [], stateChanges: [], implementationIds: [], testIds: [] },
    ],
    pairEvaluations: [
      { id: "pair-orient-bind", verbIds: ["orient", "bind"], synergy: 9, redundancy: 1, readability: 8, implementationCost: 5, decision: "keep", rationale: "Binding changes which height-aware route is useful." },
      { id: "pair-bind-peal", verbIds: ["bind", "peal"], synergy: 8, redundancy: 2, readability: 7, implementationCost: 6, decision: "keep", rationale: "Pulses alter the mechanisms attached to authored connections." },
      { id: "pair-orient-peal", verbIds: ["orient", "peal"], synergy: 7, redundancy: 1, readability: 8, implementationCost: 4, decision: "keep", rationale: "Height determines which mechanisms receive the pulse." },
    ],
    combinations: [
      { id: "orient-bind-route", verbIds: ["orient", "bind"], contexts: ["traversal", "puzzle"], consequence: "A previously blocked elevated route becomes traversable.", introducedMapId: "map-main", masteryMapId: "map-main", implementationIds: ["ground-start-west"], testIds: ["test-orient-bind"] },
      { id: "bind-peal-phase", verbIds: ["bind", "peal"], contexts: ["puzzle", "progression"], consequence: "A connected mechanism advances to its next authored phase.", introducedMapId: "map-main", masteryMapId: "map-main", implementationIds: ["route-token-a"], testIds: ["test-bind-peal"] },
      { id: "orient-peal-recovery", verbIds: ["orient", "peal"], contexts: ["recovery", "expression"], consequence: "The pulse opens a safe recovery lane only on the matching elevation.", introducedMapId: "map-main", masteryMapId: "map-main", implementationIds: ["deck-line"], testIds: ["test-orient-peal"] },
    ],
    progression: [
      { id: "seed-upgrade", label: "Resonant seed", requiresIds: ["route-token-a"], unlocksVerbIds: ["peal"], modifiesVerbIds: ["bind"], implementationIds: ["goal"], testIds: ["test-seed-upgrade"] },
    ],
  };
}

function deepSingleVerbSystem() {
  return {
    version: 2,
    status: "implemented",
    hypothesis: "Reading a mechanism, pulsing it, seeing its state change, and recovering from a mistimed pulse creates a repeatable mastery loop without padding the game with extra buttons.",
    verbs: [
      {
        id: "pulse",
        label: "Pulse",
        category: "world-state",
        status: "core",
        description: "Advance one readable authored mechanism state.",
        purpose: "Turn spatial timing and target selection into the primary recurring decision.",
        role: "primary",
        activation: "press",
        standalone: true,
        dependsOnVerbIds: [],
        inputActionIds: ["interact"],
        affordanceIds: ["route-token-a"],
        stateChanges: ["the targeted mechanism advances one deterministic phase"],
        feedbackIds: ["route-token-b"],
        implementationIds: ["interact", "route-token-a"],
        testIds: ["test-pulse"],
      },
    ],
    pairEvaluations: [],
    combinations: [],
    relationships: [],
    applications: [
      {
        id: "pulse-teach",
        label: "Readable pulse lesson",
        mapId: "map-main",
        stage: "teach",
        verbIds: ["pulse"],
        relationshipIds: [],
        setup: "One mechanism telegraphs a safe timing window.",
        success: "The mechanism advances and opens the nearby route.",
        failure: "An early pulse leaves the route closed.",
        recovery: "The mechanism resets locally and immediately.",
        implementationIds: ["route-token-a"],
        testIds: ["test-pulse-teach"],
      },
      {
        id: "pulse-pressure",
        label: "Pulse under route pressure",
        mapId: "map-main",
        stage: "pressure",
        verbIds: ["pulse"],
        relationshipIds: [],
        setup: "Two readable targets compete for one timing window.",
        success: "The chosen target changes the next safe route.",
        failure: "The missed window closes only the chosen route.",
        recovery: "A nearby safe lane lets the player try the decision again.",
        implementationIds: ["route-token-b"],
        testIds: ["test-pulse-pressure"],
      },
    ],
    coreLoop: [
      { id: "loop-decide", phase: "decide", verbIds: ["pulse"], relationshipIds: [], stateChanges: [], implementationIds: ["route-token-a"], testIds: ["test-loop-decide"] },
      { id: "loop-act", phase: "act", verbIds: ["pulse"], relationshipIds: [], stateChanges: ["target phase advances"], implementationIds: ["interact"], testIds: ["test-loop-act"] },
      { id: "loop-feedback", phase: "feedback", verbIds: ["pulse"], relationshipIds: [], stateChanges: ["route readability updates"], implementationIds: ["route-token-b"], testIds: ["test-loop-feedback"] },
    ],
    resources: [],
    progression: [],
  };
}

function finaleOnlyRelationshipSystem() {
  const architecture = deepSingleVerbSystem();
  architecture.verbs.push({
    id: "tether",
    label: "Tether",
    category: "interaction",
    status: "supporting",
    description: "Bind one conductive authored target.",
    purpose: "Trade immediate movement freedom for persistent control of a target.",
    role: "supporting",
    activation: "hold",
    standalone: true,
    dependsOnVerbIds: [],
    inputActionIds: ["interact"],
    affordanceIds: ["route-token-b"],
    stateChanges: ["the target becomes conductively linked"],
    feedbackIds: ["route-token-a"],
    implementationIds: ["interact", "route-token-b"],
    testIds: ["test-tether"],
  });
  architecture.applications.push(
    {
      id: "tether-practice",
      label: "Independent tether practice",
      mapId: "map-main",
      stage: "practice",
      verbIds: ["tether"],
      relationshipIds: [],
      setup: "One target sits beside a safe release lane.",
      success: "The target remains linked while the input is held.",
      failure: "Releasing early drops the link.",
      recovery: "The target can be rebound without resetting the map.",
      implementationIds: ["route-token-b"],
      testIds: ["test-tether-practice"],
    },
    {
      id: "pulse-tether-finale",
      label: "Final pulse-tether gate",
      mapId: "map-main",
      stage: "mastery",
      verbIds: [],
      relationshipIds: ["pulse-tether"],
      setup: "The final gate asks for both learned actions.",
      success: "A tethered target carries the pulse into the gate.",
      failure: "The gate rejects an unlinked pulse.",
      recovery: "Both nearby targets reset for another attempt.",
      implementationIds: ["goal"],
      testIds: ["test-pulse-tether"],
    },
  );
  architecture.relationships.push({
    id: "pulse-tether",
    verbIds: ["pulse", "tether"],
    operator: "sequence",
    contexts: ["puzzle", "progression"],
    consequence: "A pulse travels through the currently tethered target.",
    cadence: "recurring",
    rationale: "Target choice changes where the next pulse resolves.",
    implementationIds: ["goal", "route-token-b"],
    testIds: ["test-pulse-tether"],
  });
  return architecture;
}

test("verb architecture normalizes and proves complete pair, runtime, and test coverage", () => {
  const project = fixtureProject();
  const architecture = normalizeVerbArchitecture(completeArchitecture());
  const inspection = inspectVerbArchitecture({ ...project, verbArchitecture: architecture });

  assert.equal(inspection.present, true);
  assert.equal(inspection.metrics.selectedVerbCount, 3);
  assert.equal(inspection.metrics.pairCoverage, 1);
  assert.equal(inspection.metrics.combinationCount, 3);
  assert.deepEqual(inspection.errors, []);
  assert.deepEqual(inspection.warnings, []);
  assert.deepEqual(inspection.implementationGaps, []);
  assert.deepEqual(inspection.testGaps, []);
});

test("verb-system v2 accepts one deep verb without a quota or pair matrix", () => {
  const project = fixtureProject();
  const architecture = normalizeVerbArchitecture(deepSingleVerbSystem());
  const inspection = inspectVerbArchitecture({ ...project, verbArchitecture: architecture });

  assert.equal(architecture.version, 2);
  assert.equal(inspection.metrics.activeVerbCount, 1);
  assert.equal(inspection.metrics.independentUseCoverage, 1);
  assert.equal(inspection.metrics.feedbackCoverage, 1);
  assert.equal(inspection.metrics.runtimeEvidenceCoverage, 1);
  assert.equal(inspection.metrics.testEvidenceCoverage, 1);
  assert.deepEqual(inspection.errors, []);
  assert.deepEqual(inspection.warnings, []);
  assert.deepEqual(inspection.missingPairs, []);
  assert.deepEqual(inspection.graph.edges, []);

  const authored = applyAgentCommand(project, { op: "set_verb_architecture", architecture });
  assert.equal(authored.result.architecture.version, 2);
  assert.equal(applyAgentCommand(authored.project, { op: "get_verb_architecture" }).result.metrics.activeVerbCount, 1);
});

test("verb-system v2 rejects a finale-only relationship until it recurs before mastery", () => {
  const project = fixtureProject();
  const finaleOnly = finaleOnlyRelationshipSystem();
  let inspection = inspectVerbArchitecture({ ...project, verbArchitecture: finaleOnly });

  assert.deepEqual(inspection.errors, []);
  assert.deepEqual(inspection.relationshipUseGaps, ["pulse-tether"]);
  assert.match(inspection.warnings.join(" "), /only at mastery\/finale/);

  project.qualityContracts = { ...(project.qualityContracts ?? {}), verbArchitectureRequired: true };
  project.verbArchitecture = finaleOnly;
  let report = analyzeProject(project, { profile: "production" });
  assert.equal(report.issues.some((issue) => issue.code === "verb-relationship-coverage" && issue.severity === "error"), true);

  finaleOnly.applications.push({
    id: "pulse-tether-teach",
    label: "Early linked pulse",
    mapId: "map-main",
    stage: "combine",
    verbIds: [],
    relationshipIds: ["pulse-tether"],
    setup: "A safe target visibly carries a pulse across one short gap.",
    success: "The linked target opens a nearby practice route.",
    failure: "An unlinked pulse dissipates without punishment.",
    recovery: "The target resets immediately beside the player.",
    implementationIds: ["route-token-a", "route-token-b"],
    testIds: ["test-pulse-tether-teach"],
  });
  inspection = inspectVerbArchitecture({ ...project, verbArchitecture: finaleOnly });
  assert.deepEqual(inspection.relationshipUseGaps, []);
  assert.deepEqual(inspection.warnings, []);

  project.verbArchitecture = finaleOnly;
  report = analyzeProject(project, { profile: "production" });
  assert.equal(report.issues.some((issue) => issue.code === "verb-relationship-coverage"), false);
});

test("headless commands expose verb architecture and reject invalid scoring", () => {
  const project = fixtureProject();
  const authored = applyAgentCommand(project, { op: "set_verb_architecture", architecture: completeArchitecture() });
  const inspected = applyAgentCommand(authored.project, { op: "get_verb_architecture" });

  assert.equal(authored.changed, true);
  assert.equal(inspected.result.metrics.pairCoverage, 1);
  assert.equal(inspected.result.architecture.status, "implemented");

  const invalid = completeArchitecture();
  invalid.pairEvaluations[0].synergy = 11;
  assert.throws(() => applyAgentCommand(project, { op: "set_verb_architecture", architecture: invalid }), /must be between 0 and 10/);
});

test("Project Doctor rejects promised or falsely verified prose-only mechanics", () => {
  const missing = fixtureProject();
  missing.qualityContracts = { ...(missing.qualityContracts ?? {}), verbArchitectureRequired: true };
  let report = analyzeProject(missing, { profile: "production" });
  assert.equal(report.issues.some((issue) => issue.code === "verb-architecture-missing" && issue.severity === "error"), true);

  const incomplete = completeArchitecture();
  incomplete.status = "verified";
  incomplete.verbs[0].implementationIds = ["runtime-that-does-not-exist"];
  const authored = applyAgentCommand(fixtureProject(), { op: "set_verb_architecture", architecture: incomplete }).project;
  report = analyzeProject(authored, { profile: "production" });
  assert.equal(report.issues.some((issue) => issue.code === "verb-runtime-evidence"), true);
  assert.equal(report.issues.some((issue) => issue.code === "verb-architecture-false-verification"), true);
});

test("Director and manifest describe a purpose-first verb system rather than a fixed count", () => {
  const brief = composeDirectedGameBrief({ userPrompt: "Invent a complex 2.5D action-adventure." });
  const manifest = getAgentManifest();

  assert.match(brief.composedPrompt, /VERB SYSTEM V2:/);
  assert.match(brief.composedPrompt, /There is no required mechanic count/i);
  assert.match(brief.composedPrompt, /one deep verb is valid/i);
  assert.match(brief.composedPrompt, /instead of saving them for one finale/i);
  assert.match(brief.composedPrompt, /prose record is a specification, not passing evidence/i);
  assert.deepEqual(manifest.gameDirector.verbArchitecture.policy, LOOPLAB_VERB_ARCHITECTURE_POLICY);
  assert.equal(manifest.commands.includes("set_verb_architecture"), true);
  assert.equal(manifest.protocolVersion, "1.100.0");
});

test("the neutral dimetric starter carries no skating semantics and Doctor requires adaptation", () => {
  const project = createTemplate("dimetric");
  const semanticText = [project.name, ...project.objects.map((object) => `${object.id} ${object.name}`), ...(project.traversalPaths ?? []).map((path) => `${path.id} ${path.name} ${path.kind}`)].join(" ");
  assert.doesNotMatch(semanticText, /skat|grind|rollerblad|courier/i);
  assert.equal(project.templateProvenance.adaptationStatus, "starter");

  project.designBrief = composeDirectedGameBrief({ userPrompt: "Invent a moss-grown resonance adventure." });
  let report = analyzeProject(project);
  assert.equal(report.issues.some((issue) => issue.code === "template-adaptation-pending"), true);
  assert.equal(report.issues.some((issue) => issue.code === "template-semantic-residue"), true);

  project.templateProvenance = { ...project.templateProvenance, adaptationStatus: "adapted" };
  for (const map of project.maps) {
    for (const object of map.objects) {
      if (object.id === "player") object.name = "Nym";
      if (object.id === "route-token-a") object.name = "Chord seed A";
      if (object.id === "route-token-b") object.name = "Chord seed B";
      if (object.id === "goal") object.name = "Moonroot chamber";
    }
    for (const path of map.traversalPaths ?? []) {
      if (path.id === "ground-passage-route") path.name = "Low-tide reedway";
      if (path.id === "raised-passage-route") path.name = "Crownroot causeway";
    }
  }
  report = analyzeProject(project);
  assert.equal(report.issues.some((issue) => issue.code.startsWith("template-")), false);
});
