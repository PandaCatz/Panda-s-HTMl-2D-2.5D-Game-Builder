import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyAgentCommand, buildStandaloneArtifact, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { analyzeProject } from "../lib/looplab-doctor.mjs";
import {
  buildPlatformHarnessDocument,
  LOOPLAB_PLATFORM_HARNESS_DEFAULTS,
  LOOPLAB_PLATFORM_HARNESS_SCHEMA,
  runPlatformHarness,
} from "../lib/looplab-platform-harness.mjs";

test("platform wrapper preserves a scripts-only opaque sandbox", () => {
  const wrapper = buildPlatformHarnessDocument("<!doctype html><html><head></head><body><script>window.ready=true</script></body></html>");
  assert.match(wrapper, /sandbox="allow-scripts"/);
  assert.doesNotMatch(wrapper, /allow-same-origin/);
  assert.match(wrapper, /Content-Security-Policy/);
  assert.match(wrapper, /connect-src 'none'/);
  assert.match(wrapper, /img-src data: blob:/);
  assert.match(wrapper, /&lt;!doctype html&gt;/);
  const recorderIndex = wrapper.indexOf("__looplabPlatformInstrumentation");
  const artifactScriptIndex = wrapper.indexOf("window.ready=true");
  assert.ok(recorderIndex >= 0, "the sandboxed artifact must carry its own early instrumentation bootstrap");
  assert.ok(recorderIndex < artifactScriptIndex, "the instrumentation bootstrap must execute before artifact scripts");
  assert.deepEqual(LOOPLAB_PLATFORM_HARNESS_DEFAULTS, { frameCount: 1_200, frameMs: 16, malformedInputInterval: 8 });
  const manifest = getAgentManifest();
  assert.equal(manifest.protocolVersion, "1.99.0");
  assert.equal(manifest.platformHarness.schemaVersion, LOOPLAB_PLATFORM_HARNESS_SCHEMA);
  assert.equal(manifest.platformHarness.environment.exactFrameCount, 1_200);
  assert.equal(manifest.platformHarness.cli.operation, "platform-harness");
  assert.equal(manifest.platformHarness.cli.browserOperation, "browser-harness");
  assert.ok(manifest.exportedRuntime.methods.includes("getSourceDigest"));
  assert.ok(manifest.exportedRuntime.commands.includes("get_source_digest"));
  assert.ok(manifest.exportedRuntime.methods.includes("getCompletionReport"));
  assert.ok(manifest.exportedRuntime.commands.includes("get_completion_report"));
  assert.ok(manifest.platformHarness.checks.includes("completion-witness"));
  assert.ok(manifest.platformHarness.checks.includes("portable-save-roundtrip"));
  assert.ok(manifest.platformHarness.checks.includes("game-shell-lifecycle"));
});

test("platform harness cancellation is truthful and does not return a failed receipt as a pass", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runPlatformHarness({ html: "<!doctype html><html><head></head><body><script>window.ready=true</script></body></html>", signal: controller.signal }),
    (error) => error?.name === "AbortError" && /cancelled/i.test(error.message),
  );
});

test("Kinetic City keeps embedded data artwork and counts only executable acceptance evidence", { timeout: 90_000 }, async () => {
  let project = createTemplate("kinetic");
  project = applyAgentCommand(project, {
    op: "record_replay_case",
    id: "release-startup",
    name: "Release startup remains deterministic",
    tickCount: 1,
    inputs: [],
    checkpointInterval: 1,
  }).project;
  const doctor = analyzeProject(project);
  const artifact = buildStandaloneArtifact(project, { filename: "kinetic-city.html" });
  const receipt = await runPlatformHarness({ html: artifact.html, expectedSourceDigest: doctor.sourceDigest, frameCount: 48 });

  assert.equal(receipt.status, "passed", JSON.stringify(receipt, null, 2));
  assert.equal(receipt.checks.find((check) => check.id === "no-unhandled-errors")?.status, "passed");
  const acceptance = receipt.checks.find((check) => check.id === "acceptance-suite");
  assert.equal(acceptance?.status, "passed");
  assert.equal(acceptance?.data?.executableCount, 1);
  assert.equal(acceptance?.data?.passedCount, 1);
  assert.equal(acceptance?.data?.specifiedCount, 4);
});

test("Pocket Platformer passes the real hostile-platform harness", { timeout: 90_000 }, async () => {
  const project = createTemplate("platformer");
  const doctor = analyzeProject(project);
  const artifact = buildStandaloneArtifact(project, { filename: "pocket-platformer.html" });
  const receipt = await runPlatformHarness({ html: artifact.html, expectedSourceDigest: doctor.sourceDigest, frameCount: 48 });

  assert.equal(receipt.schemaVersion, LOOPLAB_PLATFORM_HARNESS_SCHEMA);
  assert.equal(receipt.status, "passed", JSON.stringify(receipt, null, 2));
  assert.equal(receipt.sourceDigest, doctor.sourceDigest);
  assert.match(receipt.artifactSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(receipt.environment.sandbox, ["allow-scripts"]);
  assert.equal(receipt.environment.opaqueOriginRequired, true);
  assert.equal(receipt.runtimeVersion, "2.27.0");
  for (const id of ["sandbox-opaque-origin", "source-digest", "game-shell-lifecycle", "portable-save-roundtrip", "input-action-liveness", "real-keyboard-input", "blur-clears-input", "semantic-input", "audio-failure-isolated", "presentation-runtime-isolated", "no-external-requests", "no-unhandled-errors", "frame-soak", "replay-suite", "acceptance-suite", "completion-witness", "terminal-state"]) {
    assert.equal(receipt.checks.find((check) => check.id === id)?.status, "passed", `${id} should pass`);
  }
  assert.equal(receipt.runtime.save.inspection.valid, true);
  assert.equal(receipt.runtime.save.inspection.sourceDigest, doctor.sourceDigest);
  assert.equal(receipt.runtime.save.identicalCode, true);
  assert.equal(receipt.runtime.acceptance.passed, true);
  assert.equal(receipt.runtime.replay.passed, true);
  assert.equal(receipt.runtime.completion.status, "passed");
  assert.equal(receipt.runtime.completionWitness.reachedTerminal, true);
  assert.equal(receipt.checks.find((check) => check.id === "semantic-input")?.data?.actions?.length, project.inputActions.length);
  assert.equal(receipt.runtime.presentationStatus.simulationIndependent, true);
  assert.equal(receipt.runtime.presentationStatus.audio.state, "failed");
  assert.match(receipt.runtime.presentationStatus.audio.error, /platform harness rejected AudioContext\.resume/i);
});

test("a Phaser-selected game boots its pinned inline adapter in the real hostile-platform harness", { timeout: 90_000 }, async () => {
  const project = applyAgentCommand(createTemplate("platformer"), { op: "set_runtime_profile", framework: "phaser", reason: "Use the mature scene and frame lifecycle." }).project;
  const doctor = analyzeProject(project);
  const artifact = buildStandaloneArtifact(project, { filename: "pocket-platformer-phaser.html" });
  const receipt = await runPlatformHarness({ html: artifact.html, expectedSourceDigest: doctor.sourceDigest, frameCount: 48 });

  assert.equal(receipt.status, "passed", JSON.stringify(receipt, null, 2));
  assert.equal(receipt.runtime.runtimeAdapter.framework, "phaser");
  assert.equal(receipt.runtime.runtimeAdapter.primaryFrameOwner, "phaser");
  assert.equal(receipt.runtime.runtimeAdapter.vendor.version, "3.90.0");
  assert.equal(receipt.runtime.runtimeAdapter.vendor.loadedVersion, "3.90.0");
  assert.match(receipt.runtime.runtimeAdapter.vendor.sha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.checks.find((check) => check.id === "no-external-requests")?.status, "passed");
  assert.equal(receipt.checks.find((check) => check.id === "no-unhandled-errors")?.status, "passed");
});

test("playerless systems games pass the real browser harness with visual evidence through their active choice surface", { timeout: 90_000 }, async (t) => {
  const project = createTemplate("systems");
  const doctor = analyzeProject(project);
  const artifact = buildStandaloneArtifact(project, { filename: "lantern-market-ledger.html" });
  const captureDirectory = await mkdtemp(join(tmpdir(), "looplab-browser-harness-"));
  t.after(() => rm(captureDirectory, { recursive: true, force: true }));
  const receipt = await runPlatformHarness({ html: artifact.html, expectedSourceDigest: doctor.sourceDigest, frameCount: 48, captureDirectory });

  assert.equal(receipt.status, "passed", JSON.stringify(receipt, null, 2));
  assert.equal(receipt.runtime.initialState.player, null);
  assert.equal(receipt.checks.find((check) => check.id === "real-keyboard-input")?.data?.focusTarget?.kind, "choice");
  assert.equal(receipt.checks.find((check) => check.id === "acceptance-suite")?.status, "passed");
  assert.equal(receipt.checks.find((check) => check.id === "terminal-state")?.status, "passed");
  assert.equal(receipt.checks.find((check) => check.id === "visual-capture")?.status, "passed");
  assert.match(receipt.visualEvidence.initial.dom.bodyText, /Lantern Market Ledger/i);
  assert.ok(receipt.visualEvidence.initial.dom.controls.some((control) => /lanterns/i.test(control.name)));
  for (const phase of ["initial", "final"]) {
    const expectedPath = join(captureDirectory, `${phase}.png`);
    assert.equal(receipt.visualEvidence[phase].screenshot.path, expectedPath);
    assert.match(receipt.visualEvidence[phase].screenshot.sha256, /^[a-f0-9]{64}$/);
    assert.equal((await readFile(expectedPath)).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  }
});

function networkAttemptArtifact() {
  const project = {
    inputActions: [{ id: "move-right", label: "Move right", bindings: ["ArrowRight"] }],
  };
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
    <script id="looplab-project-data" type="application/json">${JSON.stringify(project)}</script>
    <canvas id="game" width="64" height="64" tabindex="0"></canvas>
    <div id="looplab-runtime-bridge" data-ready="false"></div>
    <script>
      const deterministicState={activeInputCodes:[],activeActionIds:[],overlapContactIds:[]};
      let fixedStepCount=0;
      function setInput(code,pressed){deterministicState.activeInputCodes=pressed?['right']:[];deterministicState.activeActionIds=pressed?['move-right']:[]}
      function state(){return {activeMapId:'map-main',won:true,deterministicState:JSON.parse(JSON.stringify(deterministicState)),player:{x:0,y:0}}}
      const terminal={id:'terminal',assertions:[{target:'runtime-state',property:'won',operator:'equals',expected:true}]};
      const terminalResult={testId:'terminal',status:'passed',passed:true};
      window.looplabRuntime={version:'fixture',getSourceDigest:()=> 'fixture-source',getState:state,getPerformance:()=>({fixedStepCount}),getAcceptanceTests:()=>[terminal],getReplayCases:()=>[],runReplaySuite:()=>({status:'no-fixtures',passed:false,caseCount:0}),runAcceptanceSuite:()=>({status:'passed',passed:true,testCount:1,passedCount:1,tests:[terminalResult]}),setInput,step:()=>{fixedStepCount+=1;return {events:[],state:state(),performance:{fixedStepCount}}},pause:()=>{}};
      addEventListener('keydown',event=>setInput(event.code,true));addEventListener('keyup',event=>setInput(event.code,false));addEventListener('blur',()=>setInput('',false));
      document.getElementById('looplab-runtime-bridge').dataset.ready='true';
      fetch('https://example.invalid/runtime.json').catch(()=>{});
    </script>
  </body></html>`;
}

test("platform harness records a dynamic external request as an actionable failure", { timeout: 90_000 }, async () => {
  const receipt = await runPlatformHarness({ html: networkAttemptArtifact(), expectedSourceDigest: "fixture-source", frameCount: 8 });
  assert.equal(receipt.status, "failed");
  const requestCheck = receipt.checks.find((check) => check.id === "no-external-requests");
  assert.equal(requestCheck?.status, "failed");
  assert.match(JSON.stringify(requestCheck?.data), /example\.invalid/);
  const finding = receipt.findings.find((entry) => entry.code === "platform-external-request");
  assert.equal(finding?.nextAction.subsystem, "exported-runtime");
  assert.deepEqual(finding?.nextAction.evidenceRequired, [LOOPLAB_PLATFORM_HARNESS_SCHEMA]);
});
