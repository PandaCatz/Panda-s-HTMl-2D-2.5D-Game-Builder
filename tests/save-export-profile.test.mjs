import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { applyAgentCommand, buildStandaloneArtifact, createTemplate, validateProject } from "../lib/looplab-agent-core.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { createRuntimeModel } from "../lib/looplab-runtime-model.mjs";
import {
  createSaveCodeRuntime,
  inspectSaveProgram,
  LOOPLAB_HOSTED_STORAGE_WRAPPER_SCHEMA,
  LOOPLAB_HOSTED_STORAGE_WRAPPER_SHA256,
  LOOPLAB_HOSTED_STORAGE_WRAPPER_SOURCE,
  LOOPLAB_HOSTED_STORAGE_WRAPPER_VERSION,
} from "../lib/looplab-save-state.mjs";
import { auditStandaloneHtml } from "../lib/looplab-single-file-audit.mjs";

function transition(project, profile, options = {}) {
  return applyAgentCommand(project, {
    op: "set_export_profile",
    profile,
    portableSaves: options.portableSaves !== false,
    autoSave: options.autoSave !== false,
    restoreOnBoot: options.restoreOnBoot !== false,
    expectedSourceDigest: analyzeProject(project).sourceDigest,
  }).project;
}

test("new games expose portable save codes while strict and hosted profiles remain explicit canonical transitions", () => {
  const strict = createTemplate("platformer");
  assert.equal(strict.release.exportProfile, "strict");
  assert.equal(strict.release.storageFree, true);
  assert.equal(strict.release.allowStorage, false);
  assert.equal(strict.saveProgram.portableCodes, true);
  assert.equal(inspectSaveProgram(strict).status, "ready");
  assert.deepEqual(validateProject(strict).errors, []);

  const hosted = transition(strict, "hosted");
  assert.equal(hosted.release.exportProfile, "hosted");
  assert.equal(hosted.release.storageFree, false);
  assert.equal(hosted.release.allowStorage, true);
  assert.equal(hosted.release.storageWrapper, LOOPLAB_HOSTED_STORAGE_WRAPPER_SCHEMA);
  assert.equal(hosted.saveProgram.hosted.autoSave, true);
  assert.equal(hosted.saveProgram.hosted.restoreOnBoot, true);
  assert.equal(inspectSaveProgram(hosted).status, "ready");
  assert.deepEqual(validateProject(hosted).errors, []);

  const returned = transition(hosted, "strict");
  assert.equal(returned.release.exportProfile, "strict");
  assert.equal("storageWrapper" in returned.release, false);
  assert.equal(returned.saveProgram.portableCodes, true);
  assert.equal(returned.saveProgram.hosted.autoSave, false);
  assert.equal(returned.saveProgram.hosted.restoreOnBoot, false);
  assert.deepEqual(validateProject(returned).errors, []);
});

test("runtime save state round-trips deterministic gameplay and rejects invalid state atomically", () => {
  const runtime = createRuntimeModel(createTemplate("platformer"));
  runtime.setInput("move-right", true);
  for (let index = 0; index < 12; index += 1) runtime.update(1 / 60);
  runtime.setInput("move-right", false);
  const saved = runtime.exportSaveState();
  const savedX = saved.player.x;

  runtime.setInput("move-right", true);
  for (let index = 0; index < 12; index += 1) runtime.update(1 / 60);
  runtime.setInput("move-right", false);
  assert.notEqual(runtime.getState().player.x, savedX);

  const restored = runtime.restoreSaveState(saved);
  assert.equal(restored.ok, true);
  assert.equal(runtime.getState().player.x, savedX);
  assert.deepEqual(runtime.drainEvents().map((event) => event.type), ["save.restored"]);

  const beforeInvalid = runtime.exportSaveState();
  const invalid = { ...beforeInvalid, activeMapId: "missing-map" };
  const rejected = runtime.restoreSaveState(invalid);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /activeMapId/i);
  assert.deepEqual(runtime.exportSaveState(), beforeInvalid, "rejected input must not partially mutate runtime state");
  assert.deepEqual(runtime.drainEvents(), []);
});

test("portable save codes are deterministic, source-bound, corruption-detecting, and restore the exact state", () => {
  const project = createTemplate("platformer");
  const sourceDigest = analyzeProject(project).sourceDigest;
  const runtime = createRuntimeModel(project);
  const codec = createSaveCodeRuntime(runtime, { sourceDigest, profile: "strict", program: project.saveProgram });
  runtime.setInput("move-right", true);
  for (let index = 0; index < 8; index += 1) runtime.update(1 / 60);
  runtime.setInput("move-right", false);
  const code = codec.exportCode();
  assert.match(code, /^LL1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
  assert.equal(codec.exportCode(), code);
  assert.equal(codec.inspectCode(code).valid, true);

  const savedX = runtime.getState().player.x;
  runtime.setInput("move-right", true);
  for (let index = 0; index < 8; index += 1) runtime.update(1 / 60);
  runtime.setInput("move-right", false);
  assert.equal(codec.importCode(code).ok, true);
  assert.equal(runtime.getState().player.x, savedX);

  const damaged = `${code.slice(0, -1)}${code.endsWith("0") ? "1" : "0"}`;
  assert.equal(codec.inspectCode(damaged).valid, false);
  assert.match(codec.inspectCode(damaged).errors.join(" "), /checksum/i);

  const wrongSource = createSaveCodeRuntime(createRuntimeModel(project), { sourceDigest: "source-other", profile: "strict", program: project.saveProgram });
  assert.equal(wrongSource.inspectCode(code).valid, false);
  assert.match(wrongSource.inspectCode(code).errors.join(" "), /different exported game revision/i);
});

test("strict artifacts contain no storage capability while hosted artifacts contain exactly one authenticated wrapper", () => {
  const strictArtifact = buildStandaloneArtifact(createTemplate("platformer"));
  assert.equal(strictArtifact.audit.valid, true);
  assert.equal(strictArtifact.receipt.schemaVersion, "looplab-export-receipt/v5");
  assert.equal(strictArtifact.receipt.release.exportProfile, "strict");
  assert.equal(strictArtifact.receipt.release.persistence.portableCodes, true);
  assert.deepEqual(strictArtifact.audit.runtimeCapabilities, []);
  assert.doesNotMatch(strictArtifact.html, /\blocalStorage\b/);

  const hosted = transition(createTemplate("platformer"), "hosted");
  const hostedArtifact = buildStandaloneArtifact(hosted);
  assert.equal(hostedArtifact.audit.valid, true);
  assert.equal(hostedArtifact.receipt.release.exportProfile, "hosted");
  assert.equal(hostedArtifact.receipt.release.persistence.automaticStorage, true);
  assert.deepEqual(hostedArtifact.audit.runtimeCapabilities, [{
    capability: LOOPLAB_HOSTED_STORAGE_WRAPPER_SCHEMA,
    version: LOOPLAB_HOSTED_STORAGE_WRAPPER_VERSION,
    declaredSha256: LOOPLAB_HOSTED_STORAGE_WRAPPER_SHA256,
    actualSha256: LOOPLAB_HOSTED_STORAGE_WRAPPER_SHA256,
    trusted: true,
  }]);

  const tampered = hostedArtifact.html.replace(LOOPLAB_HOSTED_STORAGE_WRAPPER_SOURCE, `${LOOPLAB_HOSTED_STORAGE_WRAPPER_SOURCE} `);
  const tamperedAudit = auditStandaloneHtml(tampered);
  assert.equal(tamperedAudit.valid, false);
  assert.ok(tamperedAudit.errors.some((issue) => issue.code === "runtime-capability-integrity"));

  const wrapperTag = hostedArtifact.html.match(/<script data-looplab-capability="looplab-hosted-storage\/v1"[\s\S]*?<\/script>/)?.[0];
  assert.ok(wrapperTag);
  const duplicateAudit = auditStandaloneHtml(hostedArtifact.html.replace("</body>", `${wrapperTag}</body>`));
  assert.equal(duplicateAudit.valid, false);
  assert.ok(duplicateAudit.errors.some((issue) => issue.code === "hosted-storage-wrapper-count"));
});

test("the exact hosted wrapper converts opaque-origin SecurityError into a portable-save fallback", () => {
  const sandbox = {};
  runInNewContext(`Object.defineProperty(globalThis,'localStorage',{configurable:true,get:function(){const error=new Error('opaque origin');error.name='SecurityError';throw error}});${LOOPLAB_HOSTED_STORAGE_WRAPPER_SOURCE};globalThis.result=globalThis.__looplabHostedStorage.get('looplab-save:source1234');`, sandbox, { timeout: 1_000 });
  const result = sandbox.result;
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: false, state: "unavailable", error: "SecurityError" });
});
