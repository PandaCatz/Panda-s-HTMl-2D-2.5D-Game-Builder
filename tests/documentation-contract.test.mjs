import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { buildAgentGuideArtifacts } from "../lib/looplab-agent-guide-navigation.mjs";

const normalizeLineEndings = (value) => value.replace(/\r\n?/g, "\n");

test("both AI guides name the exported runtime version declared by the manifest", async () => {
  const expected = getAgentManifest().exportedRuntime.version.split(".").slice(0, 2).join(".");
  for (const path of ["docs/AI_AGENT_GUIDE.md", "public/AI_AGENT_GUIDE.md"]) {
    const guide = await readFile(path, "utf8");
    const versions = [...guide.matchAll(/runtime API\s+(\d+\.\d+)/gi)].map((match) => match[1]);
    assert.ok(versions.length > 0, `${path} must name the exported runtime API version`);
    assert.deepEqual([...new Set(versions)], [expected], `${path} must not advertise a stale runtime API`);
  }
});

test("the public and canonical AI Agent Guides contain the current generated navigation and recovery layers", async () => {
  const [canonical, publicGuide] = await Promise.all([
    readFile("docs/AI_AGENT_GUIDE.md", "utf8"),
    readFile("public/AI_AGENT_GUIDE.md", "utf8"),
  ]);
  const generated = buildAgentGuideArtifacts(canonical);
  const normalizedCanonical = normalizeLineEndings(canonical);
  assert.equal(normalizedCanonical, generated.documentMarkdown);
  assert.equal(normalizeLineEndings(publicGuide), normalizedCanonical);
  assert.match(normalizedCanonical, /LOOPLAB_AGENT_GUIDE_NAV_START[\s\S]*## Contents[\s\S]*## Collected invariants[\s\S]*## Standard pass at a glance[\s\S]*LOOPLAB_AGENT_GUIDE_NAV_END/);
  assert.match(
    normalizedCanonical,
    /<!-- LOOPLAB_AGENT_GUIDE_RECOVERY_START -->[\s\S]*## Failure modes and recovery[\s\S]*<!-- LOOPLAB_AGENT_GUIDE_RECOVERY_END -->\n\n## Completion response/,
  );
});
