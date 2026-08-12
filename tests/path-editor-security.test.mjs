import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Path Editor isolates imported HTML from the app and the network", async () => {
  const source = await readFile(new URL("../public/path-editor/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(source, /allow-scripts allow-same-origin/);
  assert.match(source, /measureWith\('allow-same-origin', render\)/);
  assert.match(source, /makeBackdropFrame\('allow-scripts'\)/);
  assert.match(source, /Content-Security-Policy/);
  assert.match(source, /connect-src 'none'/);
  assert.match(source, /worker-src 'none'/);
  assert.match(source, /frame-src 'none'/);
  assert.match(source, /form-action 'none'/);
  assert.match(source, /referrerpolicy/);
  assert.match(source, /new Blob\(\[isolated\]/);
});
