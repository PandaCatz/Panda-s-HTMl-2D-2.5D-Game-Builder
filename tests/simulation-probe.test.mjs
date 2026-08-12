import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { applyAgentCommand, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";
import { getLooplabCommandContract, validateLooplabCommandInput } from "../lib/looplab-agent-contracts.mjs";
import { LOOPLAB_BROWSER_SESSION_COMMANDS, LOOPLAB_CORE_COMMANDS } from "../lib/looplab-command-surfaces.mjs";
import { doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import { runReplayCase } from "../lib/looplab-replay.mjs";
import {
  LOOPLAB_SIMULATION_LIMITS,
  LOOPLAB_SIMULATION_PROBE_SCHEMA,
  runSimulationProbe,
} from "../lib/looplab-simulation-probe.mjs";
import { LOOPLAB_PROTOCOL_VERSION } from "../lib/looplab-versions.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = join(projectRoot, "scripts", "looplab-agent.mjs");

function inputTape() {
  return [
    { tick: 0, action: "move-right", pressed: true },
    { tick: 45, action: "move-right", pressed: false },
  ];
}

test("simulation probe is deterministic, bounded, read-only, and graduates to an ordinary replay candidate", () => {
  const project = createTemplate("platformer");
  const before = JSON.stringify(project);
  const options = {
    tickCount: 90,
    tickRate: 60,
    inputs: inputTape(),
    emit: ["state", "events", "positions"],
    maximumPositionSamples: 10,
    includeFixtureCandidate: true,
    sourceDigest: doctorSourceDigest(project),
  };

  const first = runSimulationProbe(project, options);
  const second = runSimulationProbe(project, options);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(project), before);
  assert.equal(first.schemaVersion, LOOPLAB_SIMULATION_PROBE_SCHEMA);
  assert.equal(first.readOnly, true);
  assert.match(first.proofBoundary, /not browser, visual, acceptance, replay-fixture, or release evidence/i);
  assert.equal(first.configuration.tickCount, 90);
  assert.equal(first.configuration.transitionCount, 2);
  assert.ok(first.positions.length <= 10);
  assert.equal(first.positions[0].tick, 0);
  assert.equal(first.positions.at(-1).tick, 90);
  assert.ok(first.positions.at(-1).player.x > first.positions[0].player.x);
  assert.equal(first.outputBounds.returnedPositionSamples, first.positions.length);
  assert.equal(first.events.length, first.outputBounds.returnedEvents);
  assert.match(first.finalHash, /^replay-sha256-[a-f0-9]{64}$/);
  assert.match(first.fixtureCandidateDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.fixtureCandidate.expectedHash, first.finalHash);

  const replay = runReplayCase(project, first.fixtureCandidate);
  assert.equal(replay.status, "passed");
  assert.equal(replay.passed, true);
  assert.equal(replay.finalHash, first.finalHash);
});

test("simulation probe returns only requested channels and reports honest sampling bounds", () => {
  const project = createTemplate("topdown");
  const eventsOnly = runSimulationProbe(project, {
    tickCount: 30,
    inputs: [{ tick: 0, action: "move-right", pressed: true }],
    emit: ["events"],
  });
  assert.equal("state" in eventsOnly, false);
  assert.equal("positions" in eventsOnly, false);
  assert.equal(Array.isArray(eventsOnly.events), true);
  assert.equal(eventsOnly.fixtureCandidate, null);
  assert.equal(eventsOnly.outputBounds.returnedPositionSamples, 0);

  const positions = runSimulationProbe(project, {
    tickCount: 1_000,
    inputs: [],
    emit: ["positions"],
    maximumPositionSamples: 8,
    sampleEvery: 1,
  });
  assert.ok(positions.outputBounds.effectiveSampleEvery > positions.outputBounds.requestedSampleEvery);
  assert.ok(positions.positions.length <= 8);
  assert.equal(positions.positions.at(-1).tick, 1_000);
  assert.equal("events" in positions, false);
});

test("simulation probe rejects ambiguous or unbounded input before running", () => {
  const project = createTemplate("platformer");
  assert.throws(() => runSimulationProbe(project, { tickCount: 0 }), /tickCount/);
  assert.throws(() => runSimulationProbe(project, { tickCount: LOOPLAB_SIMULATION_LIMITS.maximumTicks + 1 }), /tickCount/);
  assert.throws(() => runSimulationProbe(project, { tickCount: 10, emit: ["pixels"] }), /unsupported/);
  assert.throws(() => runSimulationProbe(project, {
    tickCount: 10,
    inputs: [
      { tick: 0, action: "jump", pressed: true },
      { tick: 0, action: "jump", pressed: false },
    ],
  }), /duplicates another transition/);
  assert.throws(() => runSimulationProbe(project, { tickCount: 10, startSpawnId: "spawn-a" }), /requires startMapId/);
  assert.throws(() => runSimulationProbe(project, {
    tickCount: 10,
    inputs: [{ tick: 0, action: "jump", code: "Space", pressed: true }],
  }), /exactly one/);
});

test("simulate is one strict read-only core contract shared by Codex, Claude, MCP, browser, and CLI", async () => {
  const project = createTemplate("platformer");
  const outcome = applyAgentCommand(project, {
    op: "simulate",
    tickCount: 20,
    inputs: [{ tick: 0, action: "move-right", pressed: true }],
    emit: ["state"],
  });
  assert.equal(outcome.changed, false);
  assert.equal(outcome.result.sourceDigest, doctorSourceDigest(project));

  const contract = getLooplabCommandContract("simulate");
  assert.equal(contract.schemaPrecision, "declared");
  assert.equal(contract.annotations.readOnlyHint, true);
  assert.equal(contract.annotations.destructiveHint, false);
  assert.equal(validateLooplabCommandInput({ op: "simulate", tickCount: 20, emit: ["state"] }).valid, true);
  assert.equal(validateLooplabCommandInput({ op: "simulate", tickCount: 20, emit: ["pixels"] }).valid, false);
  assert.equal(LOOPLAB_CORE_COMMANDS.includes("simulate"), true);
  assert.equal(LOOPLAB_BROWSER_SESSION_COMMANDS.includes("simulate"), true);

  const manifest = getAgentManifest();
  assert.equal(LOOPLAB_PROTOCOL_VERSION, "1.99.0");
  assert.equal(manifest.simulationProbe.command, "simulate");
  assert.equal(manifest.simulationProbe.limits.maximumTicks, LOOPLAB_SIMULATION_LIMITS.maximumTicks);
  assert.match(manifest.simulationProbe.fixtureWorkflow, /explicitly record and rerun/i);

  const directory = await mkdtemp(join(tmpdir(), "looplab-simulate-"));
  try {
    const projectPath = join(directory, "probe.loop.json");
    await writeFile(projectPath, JSON.stringify(project), "utf8");
    const { stdout } = await execFileAsync(process.execPath, [
      cli,
      "simulate",
      projectPath,
      "--ticks=30",
      '--inputs=[{"tick":0,"action":"move-right","pressed":true}]',
      "--emit=state,positions",
      "--max-position-samples=4",
      "--fixture",
    ], { cwd: projectRoot, windowsHide: true });
    const parsed = JSON.parse(stdout.trim());
    assert.equal(parsed.ok, true);
    assert.equal(parsed.simulation.readOnly, true);
    assert.ok(parsed.simulation.positions.length <= 4);
    assert.equal(parsed.simulation.fixtureCandidate.expectedHash, parsed.simulation.finalHash);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
