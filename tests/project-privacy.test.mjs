import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { applyAgentCommand, buildStandaloneArtifact, buildStandaloneHtml, createTemplate } from "../lib/looplab-agent-core.mjs";
import { createAiArtProviderRequest, normalizeAiArtRequest } from "../lib/looplab-ai-art.mjs";
import { sha256Hex } from "../lib/looplab-canonical-digest.mjs";
import { assertProviderPayloadPrivacy, inspectProjectPrivacy } from "../lib/looplab-project-privacy.mjs";
import { auditStandaloneHtml } from "../lib/looplab-single-file-audit.mjs";

const privateFixtures = () => ({
  credential: ["sk", "proj", "fixture", "a".repeat(32)].join("-"),
  email: ["private.builder", "private-studio.dev"].join("@"),
  localPath: ["C:", "Users", "private-user", "unpublished-game"].join("\\"),
});

function projectWithPrivateValues() {
  const values = privateFixtures();
  const project = createTemplate("platformer");
  project.name = `Private fixture: ${values.email}; ${values.localPath}; ${values.credential}`;
  project.providerConnection = { secret: "non-redacted-provider-fixture" };
  return { project, values };
}

test("project privacy preflight reports structural locations without returning matched values", () => {
  const { project, values } = projectWithPrivateValues();
  const report = inspectProjectPrivacy(project, { sourceDigest: "source-fixture" });
  const serialized = JSON.stringify(report);

  assert.equal(report.status, "blocked");
  assert.equal(report.sourceDigest, "source-fixture");
  assert.equal(report.policy.matchedValuesReturned, false);
  assert.ok(report.issues.some((issue) => issue.code === "privacy-openai-key"));
  assert.ok(report.issues.some((issue) => issue.code === "privacy-email-address"));
  assert.ok(report.issues.some((issue) => issue.code === "privacy-local-path"));
  assert.ok(report.issues.some((issue) => issue.code === "privacy-credential-field"));
  for (const value of Object.values(values)) assert.equal(serialized.includes(value), false);
  assert.equal(serialized.includes("non-redacted-provider-fixture"), false);
});

test("provider-boundary failures expose only sanitized structural evidence", () => {
  const values = privateFixtures();
  const privateKeyName = values.credential;
  let error;
  try {
    assertProviderPayloadPrivacy({ request: { [privateKeyName]: values.email, output: values.localPath } }, { label: "test provider payload" });
  } catch (caught) {
    error = caught;
  }
  assert.equal(error?.code, "privacy-preflight-blocked");
  assert.equal(error?.privacyReport?.status, "blocked");
  const publicFailure = JSON.stringify({ message: error?.message, report: error?.privacyReport });
  assert.match(publicFailure, /<redacted-key>/);
  assert.match(publicFailure, /Matched values are intentionally omitted/);
  for (const value of Object.values(values)) assert.equal(publicFailure.includes(value), false);
});

test("AI-art request construction blocks private prompt text before creating an authenticated fetch", () => {
  const values = privateFixtures();
  const request = normalizeAiArtRequest({ prompt: `Create a prop for ${values.email}`, role: "prop" }, {});
  assert.throws(
    () => createAiArtProviderRequest(request, "provider-authentication-is-not-scanned"),
    (error) => error?.code === "privacy-preflight-blocked" && !error.message.includes(values.email),
  );
});

test("Doctor and the headless privacy command share one source-bound report", () => {
  const { project, values } = projectWithPrivateValues();
  const doctor = applyAgentCommand(project, { op: "get_doctor", profile: "production" }).result;
  const command = applyAgentCommand(project, { op: "get_privacy_report", profile: "production" }).result;

  assert.equal(doctor.privacyReport.digest, command.digest);
  assert.equal(doctor.privacyReport.sourceDigest, doctor.sourceDigest);
  assert.equal(doctor.gate.blocking, true);
  assert.ok(doctor.issues.some((issue) => issue.category === "privacy"));
  const serialized = JSON.stringify({ doctor: doctor.privacyReport, command });
  for (const value of Object.values(values)) assert.equal(serialized.includes(value), false);
});

test("the agent CLI exposes the same value-free privacy report and a blocking exit code", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-privacy-"));
  const projectPath = join(directory, "private.loop.json");
  const { project, values } = projectWithPrivateValues();
  try {
    await writeFile(projectPath, `${JSON.stringify(project)}\n`, "utf8");
    const child = spawnSync(process.execPath, [resolve("scripts/looplab-agent.mjs"), "privacy", projectPath, "production"], { cwd: resolve("."), encoding: "utf8", windowsHide: true });
    assert.equal(child.status, 2, child.stderr);
    const response = JSON.parse(child.stdout.trim());
    assert.equal(response.ok, false);
    assert.equal(response.operation, "privacy");
    assert.equal(response.privacy.status, "blocked");
    assert.equal(response.privacy.policy.matchedValuesReturned, false);
    for (const value of Object.values(values)) assert.equal(child.stdout.includes(value), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("opaque data URLs are counted but not decoded or scanned as credentials", () => {
  const project = createTemplate("platformer");
  const encodedCredential = Buffer.from(privateFixtures().credential).toString("base64");
  project.visualReferences = [{ id: "opaque-fixture", dataUrl: `data:text/plain;base64,${encodedCredential}` }];
  const report = inspectProjectPrivacy(project);

  assert.equal(report.status, "clear");
  assert.equal(report.metrics.skippedOpaquePayloads, 1);
  assert.equal(report.policy.opaquePayloadsDecoded, false);
});

test("gameplay use of a secret field is not treated as provider authentication", () => {
  const project = createTemplate("platformer");
  project.story = { secret: "A hidden room rewards exploration." };
  const report = inspectProjectPrivacy(project);
  assert.equal(report.status, "clear");
});

test("shared authored references are fully scanned without becoming false cycles", () => {
  const projection = { kind: "orthographic", tileWidth: 32, tileHeight: 32 };
  const project = { name: "Shared reference fixture", projection, maps: [{ id: "map-main", projection }] };
  const report = inspectProjectPrivacy(project);

  assert.equal(report.status, "clear");
  assert.equal(report.metrics.cycleCount, 0);
  assert.equal(report.metrics.sharedReferenceCount, 1);
  assert.equal(report.issues.some((issue) => issue.code === "privacy-scan-incomplete"), false);
});

test("true recursive project graphs remain an incomplete-scan warning", () => {
  const project = { name: "Recursive fixture" };
  project.self = project;
  const report = inspectProjectPrivacy(project);

  assert.equal(report.status, "review-required");
  assert.equal(report.metrics.cycleCount, 1);
  assert.equal(report.metrics.sharedReferenceCount, 0);
  assert.ok(report.issues.some((issue) => issue.code === "privacy-scan-incomplete"));
});

test("the one-file audit rejects private artifact text without echoing it", () => {
  const values = privateFixtures();
  const html = buildStandaloneHtml(createTemplate("platformer")).replace("</body>", `<aside>${values.email} · ${values.localPath}</aside></body>`);
  const audit = auditStandaloneHtml(html);
  const serialized = JSON.stringify(audit);

  assert.equal(audit.valid, false);
  assert.equal(audit.privacy.status, "review-required");
  assert.ok(audit.errors.some((issue) => issue.code === "embedded-private-data"));
  assert.ok(audit.checks.some((check) => check.id === "no-private-data" && check.passed === false));
  assert.equal(audit.privacy.matchedValuesReturned, false);
  assert.equal(serialized.includes(values.email), false);
  assert.equal(serialized.includes(values.localPath), false);
});

test("export is blocked before private authored values can enter a standalone artifact", () => {
  const { project } = projectWithPrivateValues();
  assert.throws(() => buildStandaloneArtifact(project), /Project Doctor blocked HTML export/);

  const cleanProject = createTemplate("platformer");
  const cleanDoctor = applyAgentCommand(cleanProject, { op: "get_doctor", profile: cleanProject.doctorProfile ?? "prototype" }).result;
  const artifact = buildStandaloneArtifact(cleanProject, { generatedAt: "2026-08-12T12:00:00.000Z" });
  assert.equal(artifact.receipt.schemaVersion, "looplab-export-receipt/v5");
  assert.equal(artifact.receipt.privacy.status, "clear");
  assert.equal(artifact.receipt.privacy.sourceDigest, artifact.receipt.source.sourceDigest);
  assert.equal(artifact.receipt.privacy.sourceReportDigest, cleanDoctor.privacyReport.digest);
  assert.equal(artifact.receipt.privacy.artifactReportDigest, artifact.audit.privacy.digest);
  assert.equal(artifact.receipt.privacy.matchedValuesReturned, false);
});

test("creative subprocesses fail before API or CLI inference and never echo blocked values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-provider-privacy-"));
  const values = privateFixtures();
  const env = { ...process.env, OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", LOOPLAB_PROVIDER_TIMEOUT_MS: "250" };
  const assertBlocked = (child, label) => {
    const output = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
    assert.equal(child.status, 1, `${label}\n${output}`);
    assert.match(output, /Privacy preflight blocked/i, label);
    assert.doesNotMatch(output, /API_KEY is not configured|provider request timed out|ECONNREFUSED/i, label);
    for (const value of Object.values(values)) assert.equal(output.includes(value), false, `${label} echoed a blocked value`);
  };
  try {
    const promptInput = join(directory, "prompt-input.json");
    const promptOutput = join(directory, "prompt-output.json");
    await writeFile(promptInput, JSON.stringify({ attempt: 1, userPrompt: `Build for ${values.email}`, basePrompt: "", currentPrompt: "", requiredConstraints: [], context: {} }), "utf8");
    assertBlocked(spawnSync(process.execPath, [resolve("scripts/looplab-prompt.mjs"), "--provider", "openai", "--input", promptInput, "--output", promptOutput], { cwd: resolve("."), env, encoding: "utf8", windowsHide: true }), "prompt drafting");

    const researchInput = join(directory, "research-input.json");
    const researchOutput = join(directory, "research-output.json");
    await writeFile(researchInput, JSON.stringify({ query: `Research ${values.localPath}`, depth: "quick", engine: "source-command-sc-research", gameBrief: "2D HTML game" }), "utf8");
    assertBlocked(spawnSync(process.execPath, [resolve("scripts/looplab-research.mjs"), "--provider", "openai", "--input", researchInput, "--output", researchOutput, "--report-dir", directory], { cwd: resolve("."), env, encoding: "utf8", windowsHide: true }), "research");

    const projectPath = join(directory, "project.loop.json");
    await writeFile(projectPath, JSON.stringify(createTemplate("platformer")), "utf8");
    assertBlocked(spawnSync(process.execPath, [resolve("scripts/looplab-loop.mjs"), "--provider", "openai", "--provider-mode", "strict", "--provider-fallbacks", "openai", "--project", projectPath, "--versions-dir", join(directory, "versions"), "--iterations", "1", "--stop-score", "101", "--goal", `Improve the game for ${values.email}`], { cwd: resolve("."), env, encoding: "utf8", windowsHide: true }), "game iteration");

    const captureBytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("privacy-capture")]);
    const visualInput = join(directory, "visual-input.json");
    const visualOutput = join(directory, "visual-output.json");
    await writeFile(visualInput, JSON.stringify({
      consent: true,
      sourceDigest: `source-${"a".repeat(64)}`,
      gameBrief: `Review the scene for ${values.email}`,
      artDirection: "Readable dark-gray 2D art.",
      captures: [{
        id: "capture-main", mapId: "map-main", mapName: "Main", profileId: "desktop", profileName: "Desktop",
        width: 320, height: 180, sha256: sha256Hex(captureBytes), dataUrl: `data:image/png;base64,${captureBytes.toString("base64")}`,
        renderedBounds: { width: 320, height: 180 }, targetViewport: { width: 1280, height: 720, devicePixelRatio: 1 }, actualViewport: { width: 1280, height: 720, devicePixelRatio: 1 }, annotationSummary: [],
      }],
    }), "utf8");
    assertBlocked(spawnSync(process.execPath, [resolve("scripts/looplab-visual-critique.mjs"), "--provider", "openai", "--input", visualInput, "--output", visualOutput], { cwd: resolve("."), env, encoding: "utf8", windowsHide: true }), "visual critique");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
