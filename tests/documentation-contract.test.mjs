import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getAgentManifest } from "../lib/looplab-agent-core.mjs";

test("both AI guides name the exported runtime version declared by the manifest", async () => {
  const expected = getAgentManifest().exportedRuntime.version.split(".").slice(0, 2).join(".");
  for (const path of ["docs/AI_AGENT_GUIDE.md", "public/AI_AGENT_GUIDE.md"]) {
    const guide = await readFile(path, "utf8");
    const versions = [...guide.matchAll(/runtime API\s+(\d+\.\d+)/gi)].map((match) => match[1]);
    assert.ok(versions.length > 0, `${path} must name the exported runtime API version`);
    assert.deepEqual([...new Set(versions)], [expected], `${path} must not advertise a stale runtime API`);
  }
});
