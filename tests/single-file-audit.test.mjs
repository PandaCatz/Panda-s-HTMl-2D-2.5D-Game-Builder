import assert from "node:assert/strict";
import test from "node:test";

import { applyAgentCommand, buildStandaloneHtml, createTemplate } from "../lib/looplab-agent-core.mjs";
import { assertStandaloneHtml, auditStandaloneHtml } from "../lib/looplab-single-file-audit.mjs";

function validArtifact() {
  const project = createTemplate("platformer");
  project.assets = [{
    id: "pixel",
    name: "Embedded pixel",
    type: "sprite",
    dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1zGkwAAAABJRU5ErkJggg==",
    width: 1,
    height: 1,
    frameWidth: 1,
    frameHeight: 1,
    frames: 1,
    columns: 1,
    anchorX: 0.5,
    anchorY: 1,
    anchorMode: "ground",
    collisionPolicy: "authored-only",
    generator: { kind: "test" },
  }];
  return buildStandaloneHtml(project);
}

test("artifact audit proves the generated game is one complete offline HTML", () => {
  const audit = auditStandaloneHtml(validArtifact());
  assert.equal(audit.valid, true);
  assert.equal(audit.uploadFileCount, 1);
  assert.equal(audit.embeddedResourceCount, 1);
  assert.equal(audit.decodedImageMemoryBytes, 4);
  assert.ok(audit.byteLength > audit.embeddedPayloadBytes);
  assert.ok(audit.checks.every((check) => check.passed));
});

test("Phaser projects inline one pinned browser bundle and pass the same one-file audit", () => {
  const project = applyAgentCommand(createTemplate("platformer"), { op: "set_runtime_profile", framework: "phaser", reason: "Scene and camera tooling improve this game." }).project;
  const html = buildStandaloneHtml(project);
  const audit = auditStandaloneHtml(html);
  assert.equal(audit.valid, true);
  assert.equal(audit.runtimeVendors.length, 1);
  assert.deepEqual(audit.runtimeVendors.map(({ vendor, version, trusted }) => ({ vendor, version, trusted })), [{ vendor: "phaser", version: "3.90.0", trusted: true }]);
  assert.match(html, /data-looplab-vendor="phaser"/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
});

test("the artifact gate rejects a modified or falsely labeled Phaser vendor bundle", () => {
  const project = applyAgentCommand(createTemplate("platformer"), { op: "set_runtime_profile", framework: "phaser" }).project;
  const html = buildStandaloneHtml(project);
  const tampered = html.replace(/(<script data-looplab-vendor="phaser"[^>]*>)/, "$1 ");
  const audit = auditStandaloneHtml(tampered);
  assert.equal(audit.valid, false);
  assert.ok(audit.errors.some((issue) => issue.code === "runtime-vendor-integrity"));
});

test("artifact audit rejects linked scripts, modules, network calls, and browser storage", () => {
  const html = validArtifact().replace(
    "</body>",
    '<script src="https://cdn.example/engine.js"></script><script type="module">import "./game.js";</script><script>fetch("/level.json");localStorage.setItem("save","1")</script></body>',
  );
  const audit = auditStandaloneHtml(html);
  const codes = new Set(audit.errors.map((issue) => issue.code));
  assert.equal(audit.valid, false);
  assert.ok(codes.has("external-script"));
  assert.ok(codes.has("module-script"));
  assert.ok(codes.has("network-fetch"));
  assert.ok(codes.has("persistent-storage"));
  assert.throws(() => assertStandaloneHtml(html), /Single-file artifact gate blocked HTML export/);
});

test("malformed closing script tags cannot evade one-file inspection", () => {
  const html = validArtifact().replace("</body>", '<script>fetch("https://example.com/private")</script\n data-evasion></body>');
  const audit = auditStandaloneHtml(html);
  const codes = new Set(audit.errors.map((issue) => issue.code));
  assert.equal(audit.valid, false);
  assert.ok(codes.has("malformed-script-close-tag"));
  assert.ok(codes.has("network-fetch"));
});

test("artifact audit rejects service workers and Cache API dependencies", () => {
  const html = validArtifact().replace(
    "</body>",
    '<script>navigator.serviceWorker.register("sw.js");caches.open("game-v1")</script></body>',
  );
  const audit = auditStandaloneHtml(html);
  const codes = new Set(audit.errors.map((issue) => issue.code));
  assert.equal(audit.valid, false);
  assert.ok(codes.has("service-worker"));
  assert.ok(codes.has("cache-api"));
});

test("artifact audit rejects nested execution contexts and unscanned resource attributes", () => {
  const html = validArtifact().replace(
    "</body>",
    '<iframe srcdoc="<script>fetch(1)</script>"></iframe><iframe src="data:text/html,%3Cscript%3Efetch(1)%3C/script%3E"></iframe><object data="data:text/html,hello"></object><img src="data:image/png;base64,AA==" srcset="https://example.com/two.png 2x"><video poster="https://example.com/poster.png"></video><div style="background:url(https://example.com/texture.png)"></div></body>',
  );
  const audit = auditStandaloneHtml(html);
  const codes = new Set(audit.errors.map((issue) => issue.code));
  assert.equal(audit.valid, false);
  assert.ok(codes.has("embedded-execution-context"));
  assert.ok(codes.has("iframe-srcdoc"));
  assert.ok(codes.has("unsupported-srcset"));
  assert.ok(codes.has("external-media-resource"));
  assert.ok(codes.has("external-css-resource"));
});

test("artifact audit rejects active data scripts, workers, WebRTC, WebTransport, cookies, and navigation side channels", () => {
  const html = validArtifact().replace(
    "</body>",
    '<script type="speculationrules">{"prefetch":[{"urls":["https://example.com"]}]}</script><script>new Worker("data:text/javascript,");new SharedWorker("worker.js");new RTCPeerConnection();new WebTransport("https://example.com");document.cookie="save=1"</script><link rel="modulepreload" href="data:text/javascript,export default 1"><meta http-equiv="refresh" content="0;url=https://example.com"><base href="https://example.com/"><form action="https://example.com/save"></form><a ping="https://example.com/ping">Ping</a><svg><image href="https://example.com/art.png"></image></svg></body>',
  );
  const audit = auditStandaloneHtml(html);
  const codes = new Set(audit.errors.map((issue) => issue.code));
  assert.equal(audit.valid, false);
  for (const code of ["active-data-script", "worker-runtime", "network-webrtc", "network-webtransport", "persistent-storage", "active-link-resource", "navigation-refresh", "navigation-base", "navigation-form", "network-ping", "external-svg-resource"]) assert.ok(codes.has(code), `missing ${code}`);
});

test("artifact audit rejects credential-shaped values even when hidden in project metadata", () => {
  const leaked = validArtifact().replace(
    /(<script id="looplab-project-data" type="application\/json">)\{/,
    '$1{"apiKey":"sk-proj-test-fixture-abcdefghijklmnopqrstuvwxyz123456",',
  );
  const audit = auditStandaloneHtml(leaked);
  assert.equal(audit.valid, false);
  assert.ok(audit.errors.some((issue) => issue.code === "embedded-credential"));
});

test("artifact credential scanning ignores opaque embedded payload bytes", () => {
  const originalPayload = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1zGkwAAAABJRU5ErkJggg==";
  const credentialLikePayload = Buffer.from("sk-proj-test-fixture-abcdefghijklmnopqrstuvwxyz123456").toString("base64");
  const html = validArtifact().replace(originalPayload, credentialLikePayload);
  const audit = auditStandaloneHtml(html);
  assert.equal(audit.errors.some((issue) => issue.code === "embedded-credential"), false);
});

test("artifact audit ignores words such as fetch inside harmless runtime strings", () => {
  const html = validArtifact().replace("</body>", '<script>const instructions="never call fetch() or localStorage";</script></body>');
  const audit = auditStandaloneHtml(html);
  assert.equal(audit.valid, true);
});
test("computed global members cannot bypass the one-file runtime I/O policy", () => {
  const fixtures = [
    ['window["localStorage"].setItem("save", "1")', "persistent-storage"],
    ['window["local" + "Storage"].setItem("save", "1")', "persistent-storage"],
    ['globalThis["fetch"]("https://example.com/game.json")', "network-fetch"],
    ['globalThis["\\x66etch"]("https://example.com/game.json")', "network-fetch"],
  ];
  for (const [source, expectedCode] of fixtures) {
    const html = validArtifact().replace("</body>", `<script>${source}</script></body>`);
    const audit = auditStandaloneHtml(html);
    assert.equal(audit.valid, false, source);
    assert.ok(audit.errors.some((issue) => issue.code === expectedCode), `${source} did not produce ${expectedCode}`);
  }
});

test("runtime code construction is forbidden even when the payload is stored in a string", () => {
  const html = validArtifact().replace(
    "</body>",
    '<script>eval("fetch(\\"https://example.com\\")");new Function("return localStorage")();globalThis["eval"]("1")</script></body>',
  );
  const audit = auditStandaloneHtml(html);
  assert.equal(audit.valid, false);
  assert.ok(audit.errors.some((issue) => issue.code === "dynamic-code"));
});

test("static and dynamic imports are inspected separately from import target literals", () => {
  const dynamicHtml = validArtifact().replace(
    "</body>",
    '<script>const load=()=>import(`./chunk.js`);const nested=`${import("./nested.js")}`;</script></body>',
  );
  const dynamicAudit = auditStandaloneHtml(dynamicHtml);
  assert.equal(dynamicAudit.valid, false);
  assert.ok(dynamicAudit.errors.some((issue) => issue.code === "dynamic-import"));

  const staticHtml = validArtifact().replace("</body>", '<script>import value from "./chunk.js";</script></body>');
  const staticAudit = auditStandaloneHtml(staticHtml);
  assert.equal(staticAudit.valid, false);
  assert.ok(staticAudit.errors.some((issue) => issue.code === "static-import"));
  assert.ok(staticAudit.errors.some((issue) => issue.code === "script-parse"));
});

test("comments are masked without hiding computed members or flagging harmless prose strings", () => {
  const html = validArtifact().replace(
    "</body>",
    '<script>// globalThis["fetch"]("https://example.com")\n/* window["localStorage"] */\nconst instructions="never call fetch() or localStorage or import()";</script></body>',
  );
  const audit = auditStandaloneHtml(html);
  assert.equal(audit.valid, true);
});
