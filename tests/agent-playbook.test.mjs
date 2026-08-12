import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import {
  LOOPLAB_PROTOCOL_VERSION,
  applyAgentCommand,
  createTemplate,
  getAgentManifest,
} from "../lib/looplab-agent-core.mjs";
import {
  LOOPLAB_AGENT_PLAYBOOK_SCHEMA,
  LOOPLAB_AGENT_RECIPE_SCHEMA,
  getAgentPlaybook,
  getAgentRecipe,
  listAgentRecipes,
  matchAgentRecipes,
  validateAgentPlaybook,
} from "../lib/looplab-agent-playbook.mjs";
import { LOOPLAB_AGENT_COMMANDS } from "../lib/looplab-command-surfaces.mjs";
import { getLooplabCommandContracts } from "../lib/looplab-agent-contracts.mjs";

test("agent playbook is strict, digest-pinned, copy-safe, and command-valid", () => {
  const first = getAgentPlaybook();
  const second = getAgentPlaybook();
  const validation = validateAgentPlaybook();

  assert.equal(validation.valid, true);
  assert.equal(first.schemaVersion, LOOPLAB_AGENT_PLAYBOOK_SCHEMA);
  assert.equal(first.recipeSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(first.recipeSchema.$id, LOOPLAB_AGENT_RECIPE_SCHEMA.$id);
  assert.equal(first.count, 10);
  assert.match(first.registryDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.policy.readOnly, true);
  assert.equal(first.policy.autoExecution, false);
  const currentProtocol = LOOPLAB_PROTOCOL_VERSION.split(".").map(Number);
  assert.ok(first.recipes.every((recipe) => {
    const minimum = recipe.protocol.min.split(".").map(Number);
    return minimum[0] === currentProtocol[0] && (minimum[1] < currentProtocol[1] || (minimum[1] === currentProtocol[1] && minimum[2] <= currentProtocol[2]));
  }));
  assert.equal(first.recipes.find((recipe) => recipe.id === "coordinate-shared-agent-work").protocol.min, "1.51.0");
  assert.equal(first.recipes.find((recipe) => recipe.id === "resume-agent-session").protocol.min, "1.58.0");
  assert.equal(first.recipes.find((recipe) => recipe.id === "repair-doctor-mechanics").protocol.min, "1.59.0");
  assert.ok(first.recipes.every((recipe) => /^sha256:[a-f0-9]{64}$/.test(recipe.recipeDigest)));
  assert.ok(first.recipes.every((recipe) => recipe.steps.flatMap((step) => step.commands).every((op) => LOOPLAB_AGENT_COMMANDS.includes(op))));
  assert.deepEqual(first.recipes.flatMap((recipe) => recipe.references.filter((path) => !existsSync(path)).map((path) => ({ recipe: recipe.id, path }))), []);
  assert.ok(first.recipes.every((recipe) => !Object.hasOwn(recipe, "script") && !Object.hasOwn(recipe, "code") && !Object.hasOwn(recipe, "execute")));

  first.recipes[0].steps[0].commands.push("remove_object");
  first.recipes[0].title = "mutated caller copy";
  assert.notEqual(second.recipes[0].title, "mutated caller copy");
  assert.equal(second.recipes[0].steps[0].commands.includes("remove_object"), false);
});

test("agent recipe discovery is deterministic, bounded, and explainable", () => {
  const maps = listAgentRecipes({ query: "map transition", limit: 3 });
  assert.deepEqual(maps.recipes.map((recipe) => recipe.id), ["connect-maps-round-trip"]);
  assert.equal(maps.filters.query, "map transition");
  assert.equal(maps.policy.autoExecution, false);

  const collision = listAgentRecipes({ tag: "collision" });
  assert.deepEqual(collision.recipes.map((recipe) => recipe.id), ["repair-doctor-mechanics", "place-grounded-supported-prop"]);
  const coordination = listAgentRecipes({ query: "shared work" });
  assert.deepEqual(coordination.recipes.map((recipe) => recipe.id), ["coordinate-shared-agent-work"]);
  const resumed = listAgentRecipes({ query: "opaque cursor" });
  assert.deepEqual(resumed.recipes.map((recipe) => recipe.id), ["resume-agent-session"]);
  assert.throws(() => listAgentRecipes({ status: "invented" }), /status must be/);
  assert.throws(() => listAgentRecipes({ limit: 51 }), /between 1 and 50/);

  const ranked = matchAgentRecipes({
    issueCodes: ["replay-diverged"],
    states: ["release-candidate"],
    query: "map transition",
    limit: 3,
  });
  assert.deepEqual(ranked.matches.map((recipe) => recipe.id), ["diagnose-replay-divergence", "release-one-file-html", "connect-maps-round-trip"]);
  assert.deepEqual(ranked.matches[0].relevance.reasons, ["issue:replay-diverged"]);
  assert.equal(ranked.count, 3);
});

test("full recipe retrieval reports exact revision, safety boundaries, and evidence", () => {
  const result = getAgentRecipe("recover-stale-source");
  assert.equal(result.recipe.id, "recover-stale-source");
  assert.equal(result.recipe.revision, 2);
  assert.deepEqual(result.recipe.steps.flatMap((step) => step.commands).filter((command) => command.includes("batch")), ["preview_batch", "apply_previewed_batch"]);
  assert.equal(result.recipe.status, "active");
  assert.equal(result.warning, null);
  assert.ok(result.recipe.stopConditions.length > 0);
  assert.ok(result.recipe.evidence.length > 0);
  assert.equal(result.policy.readOnly, true);
  assert.throws(() => getAgentRecipe("not-real"), /Unknown agent recipe/);
});

test("canonical playbook commands and brief references remain read-only", () => {
  const project = createTemplate("platformer");
  const listed = applyAgentCommand(project, { op: "list_agent_recipes", query: "supported prop" });
  assert.equal(listed.changed, false);
  assert.deepEqual(listed.result.recipes.map((recipe) => recipe.id), ["place-grounded-supported-prop"]);

  const recipe = applyAgentCommand(project, { op: "get_agent_recipe", recipeId: "connect-maps-round-trip" });
  assert.equal(recipe.changed, false);
  assert.equal(recipe.result.recipe.id, "connect-maps-round-trip");

  const brief = applyAgentCommand(project, { op: "get_agent_brief", playbookQuery: "map transition", maxRecipes: 1 });
  assert.equal(brief.changed, false);
  assert.equal(brief.result.playbook.matches[0].id, "connect-maps-round-trip");
  assert.equal(brief.result.playbook.matches[0].steps, undefined, "briefs carry compact references rather than full recipe bodies");
  assert.match(brief.result.playbook.registryDigest, /^sha256:[a-f0-9]{64}$/);

  const contracts = getLooplabCommandContracts();
  for (const op of ["list_agent_recipes", "get_agent_recipe"]) {
    const contract = contracts.find((candidate) => candidate.op === op);
    assert.equal(contract.annotations.readOnlyHint, true);
    assert.equal(contract.annotations.openWorldHint, false);
    assert.deepEqual(contract.surfaces, ["core", "browser-session"]);
  }
});

test("manifest publishes the same compact playbook registry and MCP resource", () => {
  const manifest = getAgentManifest();
  const listed = listAgentRecipes({ status: "all", limit: 50 });
  assert.equal(manifest.agentPlaybook.registryDigest, listed.registryDigest);
  assert.deepEqual(manifest.agentPlaybook.recipes, listed.recipes);
  assert.deepEqual(manifest.agentPlaybook.commands, ["list_agent_recipes", "get_agent_recipe"]);
  assert.ok(manifest.mcpServer.resources.includes("looplab://agent-playbook"));
});
