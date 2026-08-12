import assert from "node:assert/strict";
import test from "node:test";

import {
  LOOPLAB_AGENT_FORM_RESPONSE_LIMIT_CHARACTERS,
  LOOPLAB_BOUNDED_AGENT_RESPONSE_SCHEMA,
  normalizeAgentFormCommand,
  prepareBoundedAgentFormResponse,
} from "../lib/looplab-bounded-agent-response.mjs";

test("browser form commands are compact-only even when a caller requests a full response", () => {
  assert.deepEqual(normalizeAgentFormCommand({ op: "select_project", id: "project-a", compact: false }), {
    op: "select_project",
    id: "project-a",
    compact: true,
  });
});

test("small browser form responses remain unchanged", () => {
  const response = { ok: true, projects: [{ id: "project-a", name: "Project A" }] };
  const prepared = prepareBoundedAgentFormResponse({ op: "list_projects", compact: true }, response);
  assert.equal(prepared.bounded, false);
  assert.deepEqual(JSON.parse(prepared.serialized), response);
});

test("an oversized successful mutation returns a parseable applied receipt and forbids retry", () => {
  const response = {
    ok: true,
    activeProjectId: "variation-a",
    project: { name: "Variation A", embedded: "x".repeat(220_000) },
    validation: { valid: true, errors: [], warnings: [] },
  };
  const prepared = prepareBoundedAgentFormResponse(
    { op: "create_variation", compact: true },
    response,
    {
      requestedCompact: false,
      responseDigest: `sha256:${"a".repeat(64)}`,
      sourceDigest: `source-${"b".repeat(64)}`,
      projectSummary: { name: "Variation A", mapCount: 2, assetCount: 9 },
      doctorSummary: { profile: "prototype", score: 100, errorCount: 0, warningCount: 0 },
    },
  );
  const parsed = JSON.parse(prepared.serialized);
  assert.equal(prepared.bounded, true);
  assert.ok(prepared.serialized.length < LOOPLAB_AGENT_FORM_RESPONSE_LIMIT_CHARACTERS);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.activeProjectId, "variation-a");
  assert.equal(parsed.result.transport.schemaVersion, LOOPLAB_BOUNDED_AGENT_RESPONSE_SCHEMA);
  assert.equal(parsed.result.transport.mutationApplied, true);
  assert.equal(parsed.result.transport.retrySafe, false);
  assert.equal(parsed.result.transport.completeEnvelope, true);
  assert.equal(parsed.result.context.project.name, "Variation A");
  assert.doesNotMatch(prepared.serialized, /x{1000}/);
});

test("an oversized read-only response returns a structured recovery problem", () => {
  const prepared = prepareBoundedAgentFormResponse(
    { op: "get_project", compact: true },
    { ok: true, project: { embedded: "z".repeat(220_000) } },
    { sourceDigest: `source-${"c".repeat(64)}`, projectSummary: { name: "Large project", mapCount: 3 } },
  );
  const parsed = JSON.parse(prepared.serialized);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "agent-form-response-too-large");
  assert.equal(parsed.problem.transport.mutationApplied, false);
  assert.equal(parsed.problem.transport.completeEnvelope, true);
  assert.deepEqual(parsed.problem.recovery.nextCommands, [{ op: "get_project_context", view: "campaign", compact: true }]);
  assert.ok(prepared.serialized.length < LOOPLAB_AGENT_FORM_RESPONSE_LIMIT_CHARACTERS);
});
