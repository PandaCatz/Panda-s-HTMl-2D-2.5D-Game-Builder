import assert from "node:assert/strict";
import test from "node:test";
import { buildStandaloneArtifact, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { startBrowserPreviewServer } from "../lib/looplab-browser-preview.mjs";

test("browser preview serves exact exported bytes and a constrained harness on an ephemeral loopback URL", async (t) => {
  const artifact = buildStandaloneArtifact(createTemplate("systems"), { filename: "lantern-market-ledger.html" });
  const preview = await startBrowserPreviewServer({ html: artifact.html });
  t.after(() => preview.close());

  assert.equal(preview.schemaVersion, "looplab-browser-preview/v1");
  assert.equal(preview.host, "127.0.0.1");
  assert.ok(preview.port > 0);
  assert.match(preview.gameUrl, /^http:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]+\/game\.html$/);

  const gameResponse = await fetch(preview.gameUrl);
  assert.equal(gameResponse.status, 200);
  assert.equal(gameResponse.headers.get("cache-control"), "no-store, max-age=0");
  assert.match(gameResponse.headers.get("content-security-policy") ?? "", /connect-src 'none'/);
  assert.equal(await gameResponse.text(), artifact.html);

  const harnessResponse = await fetch(preview.harnessUrl);
  const harnessHtml = await harnessResponse.text();
  assert.equal(harnessResponse.status, 200);
  assert.match(harnessHtml, /sandbox="allow-scripts"/);
  assert.doesNotMatch(harnessHtml, /allow-same-origin/);

  const status = await (await fetch(preview.statusUrl)).json();
  assert.equal(status.schemaVersion, "looplab-browser-preview/v1");
  assert.equal(status.artifactSha256, preview.artifactSha256);

  const manifest = getAgentManifest();
  assert.equal(manifest.protocolVersion, "1.108.0");
  assert.equal(manifest.browserHarness.schemaVersion, "looplab-browser-preview/v1");
  assert.match(manifest.browserHarness.automatedCommand, /browser-harness/);
  assert.match(manifest.browserHarness.interactiveCommand, /preview:browser/);
});

test("browser preview refuses non-loopback binding", async () => {
  await assert.rejects(
    () => startBrowserPreviewServer({ html: "<!doctype html><html></html>", host: "0.0.0.0" }),
    /bind only to 127\.0\.0\.1 or localhost/,
  );
});
