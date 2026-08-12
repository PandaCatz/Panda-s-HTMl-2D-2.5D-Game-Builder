import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("CI treats Windows as the supported builder host with enough heap for the complete lint surface", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

  assert.match(workflow, /name:\s*windows-latest\s+runs-on:\s*windows-latest/);
  assert.doesNotMatch(workflow, /ubuntu-latest/);
  assert.match(workflow, /- name: Lint\s+env:\s+NODE_OPTIONS: --max-old-space-size=4096\s+run: npm run lint/);
  assert.match(workflow, /- name: Run unit and rendered verification\s+run: npm test/);
});

test("real installed-browser harness tests run outside the cross-file unit worker pool", () => {
  const runner = readFileSync(new URL("../scripts/run-tests.mjs", import.meta.url), "utf8");

  assert.match(runner, /ISOLATED_TEST_FILES\s*=\s*new Set\(\["platform-harness\.test\.mjs"\]\)/);
  assert.match(runner, /ordinaryFiles\s*=\s*files\.filter/);
  assert.match(runner, /isolatedFiles\s*=\s*files\.filter/);
  assert.match(runner, /--test-concurrency=1/);
  assert.match(runner, /await runBatch\(ordinaryFiles\)/);
  assert.match(runner, /await runBatch\(\[file\], \{ isolated: true \}\)/);
});
