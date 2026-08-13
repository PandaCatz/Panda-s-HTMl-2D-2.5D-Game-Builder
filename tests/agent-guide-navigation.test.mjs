import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  LOOPLAB_AGENT_GUIDE_INDEX_SCHEMA,
  buildAgentGuideArtifacts,
  extractAgentGuideHeadings,
  githubHeadingAnchor,
  queryAgentGuideIndex,
} from "../lib/looplab-agent-guide-navigation.mjs";
import { getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { getLooplabCommandContracts } from "../lib/looplab-agent-contracts.mjs";
import { LOOPLAB_AGENT_GUIDE_INDEX } from "../lib/generated/looplab-agent-guide-index.mjs";
import { LOOPLAB_BROWSER_SESSION_COMMANDS, LOOPLAB_CORE_COMMANDS } from "../lib/looplab-command-surfaces.mjs";

const normalizeLineEndings = (value) => value.replace(/\r\n?/g, "\n");

test("agent guide navigation artifacts are generated idempotently from one canonical body", async () => {
  const [guide, publicGuide, publicIndexText] = await Promise.all([
    readFile("docs/AI_AGENT_GUIDE.md", "utf8"),
    readFile("public/AI_AGENT_GUIDE.md", "utf8"),
    readFile("public/agent-guide-index.json", "utf8"),
  ]);
  const generated = buildAgentGuideArtifacts(guide);
  const publicIndex = JSON.parse(publicIndexText);

  assert.equal(generated.documentMarkdown, normalizeLineEndings(guide));
  assert.equal(normalizeLineEndings(publicGuide), normalizeLineEndings(guide));
  assert.deepEqual(generated.index, LOOPLAB_AGENT_GUIDE_INDEX);
  assert.deepEqual(publicIndex, LOOPLAB_AGENT_GUIDE_INDEX);
  assert.equal(LOOPLAB_AGENT_GUIDE_INDEX.schemaVersion, LOOPLAB_AGENT_GUIDE_INDEX_SCHEMA);
  assert.match(LOOPLAB_AGENT_GUIDE_INDEX.source.digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(LOOPLAB_AGENT_GUIDE_INDEX.indexDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(LOOPLAB_AGENT_GUIDE_INDEX.source.headingCount, LOOPLAB_AGENT_GUIDE_INDEX.sections.length);
  assert.equal(LOOPLAB_AGENT_GUIDE_INDEX.invariants.length, 16);
  assert.equal(LOOPLAB_AGENT_GUIDE_INDEX.lifecycle.length, 10);
  assert.ok(LOOPLAB_AGENT_GUIDE_INDEX.recoveries.length >= 20);
  assert.equal(LOOPLAB_AGENT_GUIDE_INDEX.policy.authority, "orientation-only");
  assert.equal(LOOPLAB_AGENT_GUIDE_INDEX.policy.mayExecute, false);
  assert.equal(LOOPLAB_AGENT_GUIDE_INDEX.policy.verificationEvidence, false);
});

test("agent guide generation is deterministic across LF and CRLF checkouts", async () => {
  const guide = normalizeLineEndings(await readFile("docs/AI_AGENT_GUIDE.md", "utf8"));
  const lf = buildAgentGuideArtifacts(guide);
  const crlf = buildAgentGuideArtifacts(guide.replace(/\n/g, "\r\n"));

  assert.equal(crlf.documentMarkdown, lf.documentMarkdown);
  assert.deepEqual(crlf.index, lf.index);
});

test("heading extraction matches the documented GitHub-compatible subset and ignores fenced pseudo-headings", () => {
  const markdown = "## Author 2.5D & maps\n\n```js\n## not a heading\n```\n\n### Recovery: source-bound!\n";
  const headings = extractAgentGuideHeadings(markdown);
  assert.deepEqual(headings.map(({ title, anchor, level }) => ({ title, anchor, level })), [
    { title: "Author 2.5D & maps", anchor: "author-25d--maps", level: 2 },
    { title: "Recovery: source-bound!", anchor: "recovery-source-bound", level: 3 },
  ]);
  assert.equal(githubHeadingAnchor("Author 2.5D & maps"), "author-25d--maps");
});

test("duplicate guide anchors fail generation instead of becoming order-sensitive navigation", async () => {
  const guide = await readFile("docs/AI_AGENT_GUIDE.md", "utf8");
  const duplicated = `${guide}\n## Discover and connect\n`;
  assert.throws(() => buildAgentGuideArtifacts(duplicated), /duplicate generated heading anchors/i);
});

test("bounded guide search finds exact recoveries and never returns authority", () => {
  const recovery = queryAgentGuideIndex(LOOPLAB_AGENT_GUIDE_INDEX, { query: "stale source", category: "recovery", limit: 3 });
  assert.equal(recovery.entries[0].id, "stale-source");
  assert.equal(recovery.entries[0].kind, "recovery");
  assert.match(recovery.entries[0].href, /AI_AGENT_GUIDE\.md#build-an-atomic-candidate$/);
  assert.equal(recovery.policy.mayMutate, false);
  assert.equal(recovery.returned <= 3, true);

  const collision = queryAgentGuideIndex(LOOPLAB_AGENT_GUIDE_INDEX, { query: "collision", category: "invariant", limit: 10 });
  assert.ok(collision.entries.some((entry) => entry.id === "authored-collision"));
  assert.throws(() => queryAgentGuideIndex(LOOPLAB_AGENT_GUIDE_INDEX, { category: "secret" }), /Unsupported agent guide category/);
});

test("manifest and contracts expose the guide index as browser-session navigation with MCP and CLI alternatives", () => {
  const manifest = getAgentManifest();
  const contract = getLooplabCommandContracts().find((entry) => entry.op === "get_agent_guide_index");
  assert.ok(contract);
  assert.deepEqual(contract.surfaces, ["browser-session"]);
  assert.equal(contract.annotations.readOnlyHint, true);
  assert.equal(contract.inputSchema.additionalProperties, false);
  assert.deepEqual(contract.inputSchema.properties.category.enum, ["all", "section", "invariant", "lifecycle", "recovery"]);
  assert.equal(LOOPLAB_BROWSER_SESSION_COMMANDS.includes("get_agent_guide_index"), true);
  assert.equal(LOOPLAB_CORE_COMMANDS.includes("get_agent_guide_index"), false);
  assert.equal(manifest.agentGuideNavigation.indexDigest, LOOPLAB_AGENT_GUIDE_INDEX.indexDigest);
  assert.equal(manifest.agentGuideNavigation.sourceDigest, LOOPLAB_AGENT_GUIDE_INDEX.source.digest);
  assert.ok(manifest.mcpServer.resources.includes("looplab://agent-guide-index"));
  assert.equal(manifest.transport.agentGuideNavigationSelector, "#looplab-agent-guide-navigation");
  assert.match(manifest.headlessResponses.agentGuideNavigationWorkflow, /orientation only/i);
});
