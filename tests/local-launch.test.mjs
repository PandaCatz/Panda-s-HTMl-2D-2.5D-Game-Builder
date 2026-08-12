import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_LOOPLAB_WEB_URL,
  localBrowserLaunchSpec,
  loopLabWebServerArguments,
  normalizeLoopLabWebUrl,
  waitForLoopLabWeb,
} from "../lib/looplab-local-launch.mjs";

test("one-click startup opens only the verified local LoopLab surface", async () => {
  assert.equal(DEFAULT_LOOPLAB_WEB_URL, "http://127.0.0.1:3000/");
  assert.deepEqual(loopLabWebServerArguments(), ["dev", "--hostname", "127.0.0.1", "--port", "3000"]);
  assert.deepEqual(loopLabWebServerArguments("start", "http://127.0.0.1:4318/"), [
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "4318",
  ]);
  assert.throws(() => loopLabWebServerArguments("preview"), /mode must be dev or start/);
  assert.equal(normalizeLoopLabWebUrl("http://localhost:3000"), "http://localhost:3000/");
  assert.equal(normalizeLoopLabWebUrl("http://localhost:3000/stale/path?query=ignored#fragment"), "http://localhost:3000/");
  assert.throws(() => normalizeLoopLabWebUrl("https://example.com"), /HTTP loopback URL/);
  assert.deepEqual(localBrowserLaunchSpec("http://localhost:3000/", "win32"), {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", "start", "", "http://localhost:3000/"],
    url: "http://localhost:3000/",
  });
  assert.equal(localBrowserLaunchSpec("http://127.0.0.1:3000/", "darwin").command, "open");
  assert.equal(localBrowserLaunchSpec("http://[::1]:3000/", "linux").command, "xdg-open");

  let requestCount = 0;
  const ready = await waitForLoopLabWeb({
    url: "http://localhost:3000/",
    protocolVersion: "1.96.0",
    attempts: 3,
    intervalMs: 0,
    fetchImpl: async () => {
      requestCount += 1;
      if (requestCount === 1) throw new Error("starting");
      return new Response(JSON.stringify({ protocolVersion: "1.96.0" }), { status: 200 });
    },
  });
  assert.equal(requestCount, 2);
  assert.equal(ready.protocolVersion, "1.96.0");
});

test("one-click startup is discoverable and retains the managed launcher", async () => {
  const [packageSource, launcherSource, shortcutSource] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/looplab-launch.mjs", import.meta.url), "utf8"),
    readFile(new URL("../Launch LoopLab.cmd", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);
  assert.equal(packageJson.scripts.open, "node scripts/looplab-launch.mjs dev --open");
  assert.match(launcherSource, /waitForLoopLabWeb/);
  assert.match(launcherSource, /loopLabWebServerArguments/);
  assert.match(launcherSource, /openLoopLabWeb/);
  assert.match(launcherSource, /web\.reused/);
  assert.match(shortcutSource, /npm run open/);
  assert.match(shortcutSource, /managed AI companion/i);
});
