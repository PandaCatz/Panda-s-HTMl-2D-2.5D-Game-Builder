import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getCapabilityPack,
  getCapabilityPackRegistry,
  inspectCapabilityPackRefresh,
  listCapabilityPacks,
  queryCapabilityKnowledge,
  resealCapabilityPackCandidate,
  runCapabilityPackCalibrations,
  validateCapabilityPackRegistry,
} from "../lib/looplab-capability-packs.mjs";
import { GAME_STUDIO_CAPABILITIES } from "../lib/looplab-capability-router.mjs";
import { validateLooplabCommandInput } from "../lib/looplab-agent-contracts.mjs";
import { buildStandaloneArtifact, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";

test("capability packs cover every native capability exactly once with deterministic provenance and calibration", () => {
  const registry = getCapabilityPackRegistry();
  const validation = validateCapabilityPackRegistry(registry);
  const capabilityIds = registry.packs.flatMap((pack) => pack.capabilities.map((entry) => entry.id));

  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.equal(registry.schemaVersion, "looplab-capability-pack-registry/v1");
  assert.equal(registry.packCount, 6);
  assert.equal(registry.capabilityCount, 28);
  assert.deepEqual([...capabilityIds].sort(), GAME_STUDIO_CAPABILITIES.map((entry) => entry.id).sort());
  assert.equal(new Set(capabilityIds).size, capabilityIds.length);
  assert.equal(registry.calibration.valid, true);
  assert.equal(registry.calibration.passedCount, registry.calibration.caseCount);
  assert.match(registry.digest, /^sha256:[a-f0-9]{64}$/);
  for (const pack of registry.packs) {
    assert.equal(pack.policy.executable, false);
    assert.equal(pack.policy.autoDownload, false);
    assert.equal(pack.policy.projectMutation, false);
    assert.equal(pack.policy.collisionAuthority, false);
    assert.equal(pack.policy.evidenceAuthority, false);
    assert.equal(pack.policy.creativeWinnerAuthority, false);
    assert.equal(pack.provenance.kind, "unsigned-local-build");
    assert.match(pack.sources[0].sha256, /^[a-f0-9]{64}$/);
    assert.equal(pack.sources[0].licenseExpression, "NOASSERTION");
    assert.doesNotMatch(JSON.stringify(pack), /function\s*\(|=>\s*\{/);
  }
});

test("capability discovery is bounded, source-aware, and useful without a provider or project", () => {
  const list = listCapabilityPacks({ query: "Phaser physics", limit: 2 });
  assert.equal(list.mode, "pack-list");
  assert.deepEqual(list.packs.map((pack) => pack.id), ["runtime-renderers"]);
  assert.match(list.packs[0].digest, /^sha256:/);
  assert.deepEqual(list.packs[0].licenseExpressions, ["NOASSERTION"]);

  const query = queryCapabilityKnowledge({ query: "ground collision support", limit: 3 });
  assert.equal(query.mode, "knowledge-search");
  assert.ok(query.results.length <= 3);
  assert.ok(query.results.some((entry) => entry.capability.id === "collision-and-response-2d"));
  assert.equal(query.results.every((entry) => entry.source.licenseEvidenceUri.startsWith("https://github.com/")), true);

  const detail = getCapabilityPack("runtime-renderers");
  assert.equal(detail.validation.valid, true);
  assert.ok(detail.pack.capabilities.some((entry) => entry.id === "phaser-core" && /script-tag/.test(entry.guidance)));
  assert.ok(detail.pack.capabilities.some((entry) => entry.id === "pixijs-rendering" && /UMD\/IIFE/.test(entry.guidance)));
  assert.ok(detail.pack.capabilities.some((entry) => entry.id === "melonjs-engine" && /tree-shaken inline IIFE/.test(entry.guidance)));
  assert.equal(detail.authority.orientationOnly, true);
});

test("refresh inspection rejects rollback and equivocation and never installs a candidate", () => {
  const current = getCapabilityPackRegistry().packs.find((pack) => pack.id === "runtime-renderers");
  assert.ok(current);

  const same = inspectCapabilityPackRefresh(current);
  assert.equal(same.status, "current");
  assert.equal(same.noOp, true);
  assert.equal(same.mutationApplied, false);

  const rollback = resealCapabilityPackCandidate({ ...current, revision: 0 });
  const rollbackInspection = inspectCapabilityPackRefresh(rollback);
  assert.equal(rollbackInspection.status, "rollback-rejected");
  assert.equal(rollbackInspection.admissible, false);

  const equivocation = resealCapabilityPackCandidate({ ...current, label: `${current.label} altered` });
  const equivocationInspection = inspectCapabilityPackRefresh(equivocation);
  assert.equal(equivocationInspection.status, "equivocation-rejected");
  assert.equal(equivocationInspection.admissible, false);

  const newer = resealCapabilityPackCandidate({ ...current, revision: current.revision + 1 });
  const newerInspection = inspectCapabilityPackRefresh(newer);
  assert.equal(newerInspection.status, "reviewable-newer-revision");
  assert.equal(newerInspection.admissible, true);
  assert.equal(newerInspection.requiresExplicitInstall, true);
  assert.equal(newerInspection.mutationApplied, false);

  const broadened = resealCapabilityPackCandidate({ ...newer, policy: { ...newer.policy, executable: true } });
  const broadenedInspection = inspectCapabilityPackRefresh(broadened);
  assert.equal(broadenedInspection.admissible, false);
  assert.match(broadenedInspection.errors.join("\n"), /policy\.executable/);

  const foreignCapability = getCapabilityPackRegistry().packs.find((pack) => pack.id === "art-presentation").capabilities[0];
  const stolen = resealCapabilityPackCandidate({ ...newer, capabilities: [...newer.capabilities, foreignCapability] });
  const stolenInspection = inspectCapabilityPackRefresh(stolen);
  assert.equal(stolenInspection.admissible, false);
  assert.match(stolenInspection.errors.join("\n"), /move or duplicate a canonical capability/);
});

test("router calibration detects exact route drift instead of claiming game quality", () => {
  const calibration = runCapabilityPackCalibrations();
  assert.equal(calibration.valid, true);
  assert.equal(calibration.caseCount, 4);
  assert.equal(calibration.cases.every((entry) => entry.passed), true);
  assert.match(calibration.claimBoundary, /do not prove provider judgment, game quality, or runtime correctness/);
});

test("headless manifest and strict browser command schemas publish capability packs", async () => {
  const manifest = getAgentManifest();
  const operations = ["list_capability_packs", "get_capability_pack", "query_capability_knowledge", "inspect_capability_pack_refresh"];
  assert.equal(manifest.protocolVersion, "1.111.0");
  assert.equal(manifest.capabilityPacks.registryDigest, getCapabilityPackRegistry().digest);
  assert.equal(manifest.capabilityPacks.capabilityCount, 28);
  assert.deepEqual(manifest.capabilityPacks.commands, operations);
  assert.equal(manifest.installedSkills.capabilities.length, 28);
  for (const op of operations) assert.ok(manifest.commands.includes(op), `${op} missing from manifest commands`);
  assert.equal(validateLooplabCommandInput({ op: "get_capability_pack", packId: "runtime-renderers" }).valid, true);
  assert.equal(validateLooplabCommandInput({ op: "get_capability_pack" }).valid, false);
  assert.equal(validateLooplabCommandInput({ op: "inspect_capability_pack_refresh", candidate: {} }).valid, true);

  const appSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(appSource, /id="looplab-capability-pack-state"/);
  assert.match(appSource, /id="looplab-capability-pack-browser"/);
  for (const op of operations) assert.match(appSource, new RegExp(op));
});

test("the generated public registry is current and capability knowledge stays out of one-file games", async () => {
  const generated = JSON.parse(await readFile(new URL("../public/capability-packs.json", import.meta.url), "utf8"));
  const registry = getCapabilityPackRegistry();
  assert.deepEqual(generated, registry);

  const artifact = buildStandaloneArtifact(createTemplate("systems"), { filename: "capability-pack-boundary.html" });
  assert.doesNotMatch(artifact.html, /looplab-capability-pack\/v1/);
  assert.doesNotMatch(artifact.html, /looplab-capability-pack-registry\/v1/);
  assert.doesNotMatch(artifact.html, new RegExp(registry.digest));
});
