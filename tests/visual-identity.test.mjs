import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentProjectContext } from "../lib/looplab-agent-context.mjs";
import {
  applyAgentCommand,
  createTemplate,
  getAgentManifest,
  projectForStandaloneRuntime,
  validateProject,
} from "../lib/looplab-agent-core.mjs";
import {
  createAiArtProviderRequest,
  normalizeAiArtRequest,
  publicAiArtRequest,
} from "../lib/looplab-ai-art.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import { buildProviderIterationContext } from "../lib/looplab-provider-context.mjs";
import {
  LOOPLAB_VISUAL_IDENTITY_LIMITS,
  LOOPLAB_VISUAL_IDENTITY_POLICY,
  LOOPLAB_VISUAL_IDENTITY_SCHEMA,
  inspectVisualIdentity,
  visualIdentityContextForRole,
} from "../lib/looplab-visual-identity.mjs";

function minimalPng(width = 32, height = 32) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  Buffer.from("IHDR").copy(bytes, 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function referenceAsset(id) {
  return {
    id,
    name: `Reference ${id}`,
    type: "sprite",
    width: 32,
    height: 32,
    frameWidth: 32,
    frameHeight: 32,
    frames: 1,
    columns: 1,
    anchorX: 16,
    anchorY: 31,
    collisionPolicy: "authored-only",
    dataUrl: `data:image/png;base64,${minimalPng().toString("base64")}`,
    source: {
      license: "CC0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      sourceUrl: `https://example.invalid/${id}`,
    },
  };
}

function visualIdentity({ imageReference = true } = {}) {
  return {
    schemaVersion: LOOPLAB_VISUAL_IDENTITY_SCHEMA,
    revision: 1,
    status: "adopted",
    intent: "A coherent authored visual language without prescribing one universal aesthetic.",
    directives: [
      {
        id: "shape-language",
        dimension: "shape",
        instruction: "Keep interactive silhouettes readable at gameplay scale.",
        appliesToRoles: ["all"],
        strength: "guide",
        userAuthored: true,
      },
      {
        id: "character-value-lock",
        dimension: "value",
        instruction: "Keep the player separated from the environment by value grouping.",
        appliesToRoles: ["character"],
        strength: "lock",
        userAuthored: true,
      },
    ],
    references: [
      {
        id: "world-style",
        assetId: "reference-style",
        purpose: "style",
        appliesToRoles: ["all"],
        delivery: "semantic",
        note: "Reuse its restrained material hierarchy, not its depicted content.",
      },
      ...(imageReference ? [{
        id: "hero-identity",
        assetId: "reference-hero",
        purpose: "identity",
        appliesToRoles: ["character"],
        delivery: "image",
        note: "Preserve the protagonist's recognizable equipment and proportions.",
      }] : []),
    ],
    exclusions: [{
      id: "avoid-noise",
      instruction: "Avoid high-frequency detail that collapses at gameplay scale.",
      appliesToRoles: ["all"],
    }],
  };
}

function projectWithIdentity(options = {}) {
  const project = createTemplate("blank");
  project.assets = [referenceAsset("reference-style", { withPixels: false }), referenceAsset("reference-hero")];
  project.visualIdentity = visualIdentity(options);
  return project;
}

test("visual identity is optional, strict when present, and honest about its proof boundary", () => {
  const absent = inspectVisualIdentity(createTemplate("blank"));
  assert.equal(absent.present, false);
  assert.equal(absent.status, "absent");
  assert.deepEqual(absent.errors, []);

  const project = projectWithIdentity();
  const report = inspectVisualIdentity(project);
  assert.equal(report.present, true);
  assert.equal(report.status, "adopted");
  assert.equal(report.metrics.referenceCount, 2);
  assert.equal(report.metrics.imageReferenceCount, 1);
  assert.equal(report.metrics.unresolvedReferenceCount, 0);
  assert.deepEqual(report.errors, []);
  assert.match(report.proofBoundary, /do not prove beauty, originality, legal clearance/i);
  assert.equal(validateProject(project).errors.some((message) => /visual identity/i.test(message)), false);
});

test("visual identity rejects invented locks, conflicting locks, unknown fields, and unresolved references", () => {
  const project = projectWithIdentity({ imageReference: false });
  project.visualIdentity.unexpected = true;
  project.visualIdentity.directives.push(
    {
      id: "provider-lock",
      dimension: "palette",
      instruction: "Use one palette.",
      appliesToRoles: ["all"],
      strength: "lock",
      userAuthored: false,
    },
    {
      id: "conflict-a",
      dimension: "lighting",
      instruction: "Flat lighting.",
      appliesToRoles: ["character"],
      strength: "lock",
      userAuthored: true,
    },
    {
      id: "conflict-b",
      dimension: "lighting",
      instruction: "Dramatic rim lighting.",
      appliesToRoles: ["all"],
      strength: "lock",
      userAuthored: true,
    },
  );
  project.visualIdentity.references.push({
    id: "missing-reference",
    assetId: "not-an-asset",
    purpose: "material",
    appliesToRoles: ["environment"],
    delivery: "semantic",
    note: "Missing on purpose.",
  });
  const report = inspectVisualIdentity(project);
  const codes = new Set(report.issues.map((issue) => issue.code));
  for (const code of ["visual-identity-field-unknown", "visual-identity-ai-lock", "visual-identity-lock-conflict", "visual-identity-reference-unresolved"]) {
    assert.ok(codes.has(code), `missing ${code}`);
  }
  assert.equal(report.status, "invalid");
});

test("Codex, Claude, CLI, MCP, and the browser share canonical headless identity commands", () => {
  const base = createTemplate("blank");
  base.assets = [referenceAsset("reference-style", { withPixels: false }), referenceAsset("reference-hero")];
  const saved = applyAgentCommand(base, { op: "set_visual_identity", identity: visualIdentity() });
  assert.equal(saved.changed, true);
  assert.equal(saved.result.report.status, "adopted");
  const read = applyAgentCommand(saved.project, { op: "get_visual_identity" }).result;
  assert.equal(read.identity.intent, visualIdentity().intent);
  assert.equal(read.report.identityDigest, saved.result.report.identityDigest);
  const report = applyAgentCommand(saved.project, { op: "get_visual_identity_report" }).result;
  assert.equal(report.metrics.imageReferenceCount, 1);
  const removed = applyAgentCommand(saved.project, { op: "remove_visual_identity" });
  assert.equal(removed.changed, true);
  assert.equal("visualIdentity" in removed.project, false);

  const manifest = getAgentManifest();
  for (const command of ["get_visual_identity", "get_visual_identity_report", "set_visual_identity", "remove_visual_identity"]) {
    assert.ok(manifest.commandSurfaces.core.includes(command));
    assert.ok(manifest.commandSurfaces.browserSession.includes(command));
  }
  assert.equal(manifest.commandSurfaces.core.length, 196);
  assert.equal(manifest.commandSurfaces.browserSession.length, 277);
  assert.equal(manifest.visualIdentityRules.defaultInheritance, true);
  assert.match(manifest.visualIdentityRules.imageReferenceConsent, /every individual provider-art job/i);
});

test("role context inherits by default, can be explicitly bypassed, and never claims gameplay geometry", () => {
  const identity = visualIdentity();
  const character = visualIdentityContextForRole(identity, "character");
  assert.equal(character.enabled, true);
  assert.deepEqual(character.referenceIds, undefined);
  assert.deepEqual(character.imageReferenceIds, ["hero-identity"]);
  assert.match(character.prompt, /PROJECT VISUAL IDENTITY/);
  assert.match(character.prompt, /cannot create collision, support, traversal/i);
  const environment = visualIdentityContextForRole(identity, "environment");
  assert.deepEqual(environment.imageReferenceIds, []);
  const bypassed = visualIdentityContextForRole(identity, "character", { useVisualIdentity: false });
  assert.equal(bypassed.enabled, false);
  assert.equal(bypassed.bypassed, true);
  assert.equal(bypassed.prompt, "");
});

test("provider image references require fresh consent and use OpenAI multipart edits without leaking bytes", () => {
  const project = projectWithIdentity();
  const base = {
    prompt: "Create a readable courier sprite sheet.",
    role: "character",
    background: "light-neutral-gray",
    visualIdentity: project.visualIdentity,
    referenceAssets: project.assets,
  };
  assert.throws(() => normalizeAiArtRequest(base, {}), /referenceConsent=true/i);
  const request = normalizeAiArtRequest({ ...base, referenceConsent: true }, {});
  assert.equal(request.providerOperation, "edit");
  assert.equal(request.visualIdentity.inherited, true);
  assert.equal(request.visualIdentity.imageReferenceCount, 1);
  assert.equal(request.providerPayload.input_fidelity, "high");
  const providerRequest = createAiArtProviderRequest(request, "local-test-key");
  assert.equal(providerRequest.url, "https://api.openai.com/v1/images/edits");
  assert.equal(providerRequest.init.headers.Authorization, "Bearer local-test-key");
  assert.equal("Content-Type" in providerRequest.init.headers, false);
  assert.equal(providerRequest.init.body instanceof FormData, true);
  assert.equal(providerRequest.init.body.getAll("image[]").length, 1);
  assert.equal(providerRequest.init.body.get("input_fidelity"), "high");
  const publicRequest = publicAiArtRequest(request);
  assert.equal("referenceImages" in publicRequest, false);
  assert.doesNotMatch(JSON.stringify(publicRequest), /data:image|local-test-key/);

  const image2 = normalizeAiArtRequest({ ...base, model: "gpt-image-2", referenceConsent: true }, {});
  assert.equal(image2.providerOperation, "edit");
  assert.equal("input_fidelity" in image2.providerPayload, false);
});

test("AI-art reference limits fail before provider submission", () => {
  const project = createTemplate("blank");
  project.assets = [];
  const identity = visualIdentity({ imageReference: false });
  identity.references = [];
  for (let index = 0; index < LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumImageReferencesPerJob + 1; index += 1) {
    const id = `reference-${index}`;
    project.assets.push(referenceAsset(id));
    identity.references.push({
      id: `identity-${index}`,
      assetId: id,
      purpose: "style",
      appliesToRoles: ["character"],
      delivery: "image",
      note: `Reference ${index}`,
    });
  }
  assert.throws(() => normalizeAiArtRequest({
    prompt: "A character sheet",
    role: "character",
    background: "light-neutral-gray",
    visualIdentity: identity,
    referenceAssets: project.assets,
    referenceConsent: true,
  }, {}), /at most 4 project image references/i);
});

test("agent and provider context remain byte-free while standalone HTML omits authoring identity", () => {
  const project = projectWithIdentity();
  const doctor = analyzeProject(project);
  assert.equal(doctor.visualIdentityReport.identityDigest, inspectVisualIdentity(project).identityDigest);
  assert.equal(doctor.issues.some((issue) => issue.code === "visual-identity-reference-unresolved"), false);
  const agentContext = buildAgentProjectContext(project, { doctor, protocolVersion: "1.96.0" });
  assert.equal(agentContext.authoring.visualIdentity.intent, project.visualIdentity.intent);
  assert.equal(agentContext.evidenceIndex.visualIdentity.identityDigest, doctor.visualIdentityReport.identityDigest);
  assert.doesNotMatch(JSON.stringify(agentContext), /data:image\/png;base64/);

  const providerContext = buildProviderIterationContext({
    goal: "Improve the game without replacing its authored identity.",
    baseGoal: "Improve the game without replacing its authored identity.",
    iteration: 1,
    project,
    quality: doctor,
    visualIdentity: {
      policy: LOOPLAB_VISUAL_IDENTITY_POLICY,
      report: doctor.visualIdentityReport,
      contract: project.visualIdentity,
    },
  });
  assert.equal(providerContext.visualIdentity.report.identityDigest, doctor.visualIdentityReport.identityDigest);
  assert.doesNotMatch(JSON.stringify(providerContext), /data:image\/png;base64/);

  const runtime = projectForStandaloneRuntime(project);
  assert.equal("visualIdentity" in runtime, false);
  assert.equal(runtime.assets.some((asset) => asset.id === "reference-hero"), true);
});
