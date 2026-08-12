import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runPublicAudit } from "../scripts/looplab-public-audit.mjs";

test("the publish set contains no tracked private state or unredacted secret-shaped content", () => {
  const report = runPublicAudit();
  assert.equal(report.ok, true, JSON.stringify(report.findings));
  assert.deepEqual(report.findings, []);
  assert.ok(report.historyCommitCount >= 1);
  assert.ok(report.historyCandidateFiles >= report.trackedFiles);
  assert.ok(report.historyScannedTextFiles >= 1);
  assert.deepEqual(report.binaryCredentialSignatureScan, { tracked: true, history: true, publishCandidates: true });
  assert.match(report.disclosurePolicy, /never printed/i);
});

test("the public worker refuses the unused image-optimizer surface", async () => {
  const [worker, config] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(worker, /vinext\/server\/image-optimization/);
  assert.match(worker, /url\.pathname === "\/_vinext\/image"[\s\S]*?status: 404/);
  assert.match(config, /images:\s*\{\s*unoptimized:\s*true\s*\}/);
  assert.match(config, /poweredByHeader:\s*false/);
});
