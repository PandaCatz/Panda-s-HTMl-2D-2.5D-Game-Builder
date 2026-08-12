import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { npmArgumentForwardingGuidance, recoverLooplabNpmArguments } from "../lib/looplab-cli-args.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("recovers allowlisted flags that npm 10 moved into npm_config values", () => {
  const result = recoverLooplabNpmArguments(["project.loop.json"], {
    npm_lifecycle_event: "agent",
    npm_config_attach: "true",
    npm_config_frame_width: "32",
    npm_config_registry: "https://registry.invalid/",
  });
  assert.deepEqual(result.args, ["project.loop.json", "--attach", "--frame-width=32"]);
  assert.deepEqual(result.recovered, ["--attach", "--frame-width=32"]);
  assert.deepEqual(result.rejected, []);
});

test("keeps explicit arguments authoritative and ignores npm state outside the agent lifecycle", () => {
  const explicit = recoverLooplabNpmArguments(["--attach", "--frame-width=48"], {
    npm_lifecycle_event: "agent",
    npm_config_attach: "true",
    npm_config_frame_width: "32",
  });
  assert.deepEqual(explicit.args, ["--attach", "--frame-width=48"]);
  assert.deepEqual(explicit.recovered, []);

  const direct = recoverLooplabNpmArguments([], { npm_config_attach: "true" });
  assert.deepEqual(direct, { args: [], recovered: [], rejected: [] });
});

test("requires an explicit second separator for force and repeatable pointer options", () => {
  const result = recoverLooplabNpmArguments([], {
    npm_lifecycle_event: "agent",
    npm_config_force: "true",
    npm_config_pointer: "/maps/0/name",
  });
  assert.deepEqual(result.args, []);
  assert.deepEqual(result.rejected, ["--force", "--pointer"]);
  assert.match(npmArgumentForwardingGuidance(result).guidance, /extra --/);
});

test("CLI help exposes a flag recovered from npm's lifecycle environment", async () => {
  const { stdout } = await execFileAsync(process.execPath, [resolve(repositoryRoot, "scripts", "looplab-agent.mjs"), "help"], {
    cwd: repositoryRoot,
    env: { ...process.env, npm_lifecycle_event: "agent", npm_config_attach: "true" },
    maxBuffer: 2 * 1024 * 1024,
  });
  const jsonLine = stdout.trim().split(/\r?\n/).findLast((line) => line.trim().startsWith("{"));
  assert.ok(jsonLine, stdout);
  const help = JSON.parse(jsonLine);
  assert.deepEqual(help.argumentForwarding.recovered, ["--attach"]);
});

test("a consumed attach flag still attaches the generated tileset", async () => {
  const directory = await mkdtemp(join(tmpdir(), "looplab-npm-args-"));
  const script = resolve(repositoryRoot, "scripts", "looplab-agent.mjs");
  const projectPath = join(directory, "fixture.loop.json");
  const pngPath = join(directory, "tiles.png");
  try {
    await execFileAsync(process.execPath, [script, "init", projectPath, "blank"], { cwd: repositoryRoot });
    const { stdout } = await execFileAsync(process.execPath, [script, "generate-tiles", projectPath, pngPath, "neon", "16", "99"], {
      cwd: repositoryRoot,
      env: { ...process.env, npm_lifecycle_event: "agent", npm_config_attach: "true" },
      maxBuffer: 2 * 1024 * 1024,
    });
    const generated = JSON.parse(stdout.trim());
    const project = JSON.parse(await readFile(projectPath, "utf8"));
    assert.equal(generated.attached, true);
    assert.deepEqual(generated.argumentForwarding.recovered, ["--attach"]);
    assert.equal(project.assets.length, 1);
    assert.equal(project.assets[0].type, "tileset");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
