import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { applyAgentCommand, createTemplate } from "../lib/looplab-agent-core.mjs";
import { summarizeLoopOutcome } from "../lib/looplab-loop-outcome.mjs";

const execFileAsync = promisify(execFile);

test("zero accepted passes never claim a ready or verified candidate", () => {
  const outcome = summarizeLoopOutcome({ iteration: { status: "verified" } }, [{ accepted: false }]);
  assert.equal(outcome.outcome, "no-accepted-candidate");
  assert.equal(outcome.changed, false);
  assert.equal(outcome.accepted, 0);
  assert.equal(outcome.verificationRequired, false);
  assert.equal(outcome.nextRequiredAction, "none");
  assert.match(outcome.message, /remains unchanged/i);
});

test("an accepted candidate remains pending real browser evidence", () => {
  const outcome = summarizeLoopOutcome({ iteration: { status: "candidate" } }, [{ accepted: true }]);
  assert.equal(outcome.outcome, "candidate-awaiting-browser-evidence");
  assert.equal(outcome.changed, true);
  assert.equal(outcome.verificationRequired, true);
  assert.equal(outcome.nextRequiredAction, "run-browser-qa");
  assert.doesNotMatch(outcome.message, /verified candidate/i);
});

test("verified completion requires both an accepted pass and verified lifecycle", () => {
  const outcome = summarizeLoopOutcome({ iteration: { status: "verified" } }, [{ accepted: true }]);
  assert.equal(outcome.outcome, "verified-candidate");
  assert.equal(outcome.changed, true);
  assert.equal(outcome.verificationRequired, false);
  assert.equal(outcome.nextRequiredAction, "promote-or-export");
});

test("companion completion forwards the machine-readable next action", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../scripts/looplab-companion.mjs", import.meta.url), "utf8"));
  assert.match(source, /nextRequiredAction: loopOutcome\?\.nextRequiredAction/);
  assert.match(source, /"run-browser-qa"/);
});

test("OpenAI response format strictly enforces the iteration command envelope", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../scripts/looplab-loop.mjs", import.meta.url), "utf8"));
  assert.match(source, /schemaName: "looplab_iteration"/);
  assert.match(source, /strict: true/);
  assert.match(source, /summarizeLoopOutcome\(project, runAttempts\)/);
  assert.match(source, /loop\.stop-score\.deferred/);
  assert.match(source, /Max passes.*hard cost cap/);
});

test("condition cycles execute as stable ordered provider passes with one cumulative receipt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-bounded-passes-"));
  const projectPath = join(directory, "project.loop.json");
  const responsePath = join(directory, "responses.json");
  const versionsDirectory = join(directory, "versions");
  try {
    await writeFile(projectPath, JSON.stringify(createTemplate("platformer")), "utf8");
    await writeFile(responsePath, JSON.stringify([
      {
        summary: "Complete movement pass.", hypothesis: "The first condition is independently gated.", agentReviews: [],
        commands: [{ op: "set_project", changes: { name: "Bounded Pass One" } }],
        scores: { playability: 8, clarity: 8, variety: 7, visual_cohesion: 8 },
      },
      {
        summary: "Complete collision pass.", hypothesis: "The dependent condition uses the accepted first pass.", agentReviews: [],
        commands: [{ op: "set_project", changes: { name: "Bounded Pass Two" } }],
        scores: { playability: 8, clarity: 8, variety: 7, visual_cohesion: 8 },
      },
    ]), "utf8");
    const execution = await execFileAsync(process.execPath, [
      resolve("scripts/looplab-loop.mjs"),
      "--provider", "file",
      "--project", projectPath,
      "--response", responsePath,
      "--versions-dir", versionsDirectory,
      "--iterations", "2",
      "--conditions", "movement|collision",
      "--strategy", "cycle",
      "--stop-score", "1",
      "--min-delta", "-100",
    ], { cwd: resolve(".") });
    const events = execution.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const planEvent = events.find((event) => event.type === "provider.pass-plan.prepared");
    const deferredStop = events.find((event) => event.type === "loop.stop-score.deferred");
    const passEvents = events.filter((event) => event.type === "provider.pass.started");
    const completed = events.find((event) => event.type === "loop.completed");
    assert.equal(planEvent.plan.passes.length, 2);
    assert.equal(planEvent.plan.completionPolicy.id, "required-passes-before-target-score");
    assert.equal(planEvent.plan.completionPolicy.providerCallCap, "iterations");
    assert.equal(deferredStop.reason, "required-provider-passes-remain");
    assert.equal(deferredStop.remainingPassIds.length, 2);
    assert.equal(deferredStop.maximumProviderCalls, 2);
    assert.equal(passEvents.length, 2);
    assert.notEqual(passEvents[0].passId, passEvents[1].passId);
    assert.equal(completed.passPlanStatus, "complete", JSON.stringify(events, null, 2));
    assert.deepEqual(completed.remainingPassIds, []);
    assert.equal(completed.usage.runCount, 2);
    const history = JSON.parse(await readFile(join(versionsDirectory, "history.json"), "utf8"));
    assert.equal(history.attempts.length, 2);
    assert.equal(history.attempts[0].planId, history.attempts[1].planId);
    assert.notEqual(history.attempts[0].passId, history.attempts[1].passId);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("oversized authored truth is blocked before the provider and remains unchanged", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-context-preflight-"));
  const projectPath = join(directory, "project.loop.json");
  const responsePath = join(directory, "response.json");
  const versionsDirectory = join(directory, "versions");
  const exactVision = `BEGIN-AUTHORED-TRUTH\n${"exact requirement ".repeat(4_000)}\nEND-AUTHORED-TRUTH`;
  const project = applyAgentCommand(createTemplate("platformer"), {
    op: "set_game_brief",
    userPrompt: exactVision,
    genre: "skating-tricks",
    coreLoop: "traverse-chain-score",
    movementTemplate: "kinetic-runner",
    format: "connected-rooms",
    progression: "score-attack",
  }).project;
  try {
    await writeFile(projectPath, JSON.stringify(project), "utf8");
    await writeFile(responsePath, JSON.stringify({ commands: [] }), "utf8");
    let execution;
    try {
      execution = await execFileAsync(process.execPath, [
        resolve("scripts/looplab-loop.mjs"),
        "--provider", "file",
        "--project", projectPath,
        "--response", responsePath,
        "--versions-dir", versionsDirectory,
        "--iterations", "1",
        "--context-budget-tokens", "8000",
        "--stop-score", "101",
      ], { cwd: resolve(".") });
    } catch (error) {
      execution = { stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
    }
    const events = execution.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.ok(events.some((event) => event.type === "provider.context.blocked"), execution.stderr || JSON.stringify(events, null, 2));
    assert.equal(events.some((event) => event.type === "provider.requested"), false);
    assert.equal(events.some((event) => event.type === "usage.completed"), false);
    const completed = events.find((event) => event.type === "loop.completed");
    assert.equal(completed.usage.runCount, 0);
    assert.equal(completed.usage.totalTokens, 0);
    const persisted = JSON.parse(await readFile(projectPath, "utf8"));
    assert.equal(persisted.designBrief.userPrompt, exactVision);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("structured providers can request replay recording and canonical evidence authoring", async () => {
  const [schema, source] = await Promise.all([
    readFile(new URL("../agent/iteration-schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../scripts/looplab-loop.mjs", import.meta.url), "utf8"),
  ]);
  const operations = new Set(schema.properties.commands.items.properties.op.enum);
  for (const operation of [
    "record_replay_case",
    "set_feature_contracts",
    "upsert_feature_contract",
    "remove_feature_contract",
    "set_acceptance_tests",
    "upsert_acceptance_test",
    "remove_acceptance_test",
  ]) assert.ok(operations.has(operation), `iteration schema is missing ${operation}`);
  assert.equal(operations.has("remove_replay_case"), false, "providers must not be able to delete pinned replay evidence");
  assert.match(source, /record_replay_case:[\s\S]*LoopLab records the actual hashes/);
  assert.match(source, /upsert_feature_contract/);
  assert.match(source, /upsert_acceptance_test/);
});

test("strict provider command envelopes decode into authored LoopLab commands", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-command-envelope-"));
  const projectPath = join(directory, "project.loop.json");
  const responsePath = join(directory, "response.json");
  const versionsDirectory = join(directory, "versions");
  try {
    await writeFile(projectPath, JSON.stringify(createTemplate("platformer")), "utf8");
    await writeFile(responsePath, JSON.stringify({
      summary: "Use a darker authored presentation base.",
      hypothesis: "A neutral dark background increases gameplay contrast.",
      agentReviews: [],
      commands: [{ op: "set_project", argumentsJson: JSON.stringify({ changes: { background: "#242424" } }) }],
      scores: { playability: 8, clarity: 8, variety: 7, visual_cohesion: 8 },
    }), "utf8");

    const execution = await execFileAsync(process.execPath, [
      resolve("scripts/looplab-loop.mjs"),
      "--provider", "file",
      "--project", projectPath,
      "--response", responsePath,
      "--versions-dir", versionsDirectory,
      "--iterations", "1",
      "--stop-score", "101",
    ], { cwd: resolve(".") });

    assert.match(execution.stdout, /iteration\.accepted/);
    const events = execution.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const iterationUsage = events.find((event) => event.type === "usage.completed");
    const loopCompleted = events.find((event) => event.type === "loop.completed");
    assert.equal(iterationUsage.receipt.totalTokens, 0);
    assert.equal(loopCompleted.usage.runCount, 1);
    assert.equal(loopCompleted.usage.totalTokens, 0);
    const project = JSON.parse(await readFile(projectPath, "utf8"));
    assert.equal(project.background, "#242424");
    const history = JSON.parse(await readFile(join(versionsDirectory, "history.json"), "utf8"));
    assert.deepEqual(history.attempts[0].commands, [{ op: "set_project", changes: { background: "#242424" } }]);
    assert.equal(history.runs.at(-1).usage.runCount, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("atomic loop candidates resolve traversal transfer forward references after all paths exist", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-traversal-forward-reference-"));
  const projectPath = join(directory, "project.loop.json");
  const responsePath = join(directory, "response.json");
  const versionsDirectory = join(directory, "versions");
  const makePath = (id, transferPathIds, x) => ({
    id,
    name: id,
    kind: "route",
    points: [{ x, y: 260, z: 0 }, { x: x + 120, y: 220, z: 0 }],
    entryRadius: 28,
    entryZTolerance: 1,
    minimumEntrySpeed: 0,
    direction: "both",
    acceleration: 180,
    maximumSpeed: 320,
    exitImpulse: { x: 0, y: 0, z: 0 },
    transferPathIds,
    bailBehavior: "drop",
    routeLayer: "ground",
    acceptanceTestId: `accept-${id}`,
  });
  try {
    await writeFile(projectPath, JSON.stringify(createTemplate("platformer")), "utf8");
    await writeFile(responsePath, JSON.stringify({
      summary: "Author a mutually connected traversal pair in one atomic pass.",
      hypothesis: "Forward references should resolve against the complete candidate, not an invalid intermediate state.",
      agentReviews: [],
      commands: [
        { op: "add_traversal_path", path: makePath("forward-path-a", ["forward-path-b"], 180) },
        { op: "add_traversal_path", path: makePath("forward-path-b", ["forward-path-a"], 460) },
      ],
      scores: { playability: 8, clarity: 8, variety: 8, visual_cohesion: 8 },
    }), "utf8");

    let execution;
    try {
      execution = await execFileAsync(process.execPath, [
        resolve("scripts/looplab-loop.mjs"),
        "--provider", "file",
        "--project", projectPath,
        "--response", responsePath,
        "--versions-dir", versionsDirectory,
        "--iterations", "1",
        "--stop-score", "101",
        "--min-delta", "-100",
      ], { cwd: resolve(".") });
    } catch (error) {
      execution = { stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
    }

    const events = execution.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const iteration = events.find((event) => event.type === "iteration.accepted" || event.type === "iteration.rejected" || event.type === "loop.failed");
    assert.ok(iteration, execution.stderr || JSON.stringify(events, null, 2));
    assert.doesNotMatch(iteration.reason ?? iteration.error ?? "", /references missing path/);
    if (iteration.type === "iteration.accepted") {
      const project = JSON.parse(await readFile(projectPath, "utf8"));
      const pathA = project.traversalPaths.find((path) => path.id === "forward-path-a");
      const pathB = project.traversalPaths.find((path) => path.id === "forward-path-b");
      assert.deepEqual(pathA.transferPathIds, ["forward-path-b"]);
      assert.deepEqual(pathB.transferPathIds, ["forward-path-a"]);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("atomic loop candidates resolve portal targets after later maps and spawns exist", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-portal-forward-reference-"));
  const projectPath = join(directory, "project.loop.json");
  const responsePath = join(directory, "response.json");
  const versionsDirectory = join(directory, "versions");
  try {
    await writeFile(projectPath, JSON.stringify(createTemplate("platformer")), "utf8");
    await writeFile(responsePath, JSON.stringify({
      summary: "Connect a later-authored map without exposing an invalid intermediate portal.",
      hypothesis: "The atomic candidate should resolve the exact portal target after all maps and spawns exist.",
      agentReviews: [],
      commands: [
        {
          op: "add_object",
          kind: "portal",
          object: { id: "portal-main-two", name: "Enter map two", x: 560, y: 250, width: 52, height: 76, targetMapId: "map-two", targetSpawnId: "spawn-two", transition: "fade" },
        },
        {
          op: "add_map",
          map: {
            id: "map-two", name: "Map Two", width: 640, height: 360, background: "#343434", gravity: 1500, grid: 20, controlMode: "platformer",
            objects: [
              { id: "spawn-two", kind: "spawn", name: "Map two entry", x: 64, y: 250, width: 28, height: 44, color: "#777777", solid: false },
              { id: "floor-two", kind: "platform", name: "Map two floor", x: 0, y: 320, width: 640, height: 40, color: "#555555", solid: true },
              { id: "goal-two", kind: "goal", name: "Map two goal", x: 540, y: 250, width: 36, height: 70, color: "#aaaaaa", solid: false },
            ],
            traversalPaths: [],
          },
          activate: false,
        },
      ],
      scores: { playability: 8, clarity: 8, variety: 8, visual_cohesion: 8 },
    }), "utf8");

    let execution;
    try {
      execution = await execFileAsync(process.execPath, [
        resolve("scripts/looplab-loop.mjs"),
        "--provider", "file",
        "--project", projectPath,
        "--response", responsePath,
        "--versions-dir", versionsDirectory,
        "--iterations", "1",
        "--stop-score", "101",
        "--min-delta", "-100",
      ], { cwd: resolve(".") });
    } catch (error) {
      execution = { stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
    }

    const events = execution.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const iteration = events.find((event) => event.type === "iteration.accepted" || event.type === "iteration.rejected" || event.type === "loop.failed");
    assert.ok(iteration, execution.stderr || JSON.stringify(events, null, 2));
    assert.doesNotMatch(iteration.reason ?? iteration.error ?? "", /must reference an existing targetMapId/);
    if (iteration.type === "iteration.accepted") {
      const project = JSON.parse(await readFile(projectPath, "utf8"));
      const portal = project.maps.find((map) => map.id === "map-main").objects.find((object) => object.id === "portal-main-two");
      assert.equal(portal.targetMapId, "map-two");
      assert.equal(portal.targetSpawnId, "spawn-two");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("loop runner uses Windows-safe file URL conversion for its iteration schema", async () => {
  const source = await readFile(new URL("../scripts/looplab-loop.mjs", import.meta.url), "utf8");
  assert.match(source, /import \{ fileURLToPath \} from "node:url"/);
  assert.match(source, /fileURLToPath\(new URL\("\.\.\/agent\/iteration-schema\.json", import\.meta\.url\)\)/);
  assert.doesNotMatch(source, /\.pathname\.replace\(/);
});
