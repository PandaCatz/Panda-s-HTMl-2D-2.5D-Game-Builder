import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { artDirectionInstruction, normalizeArtDirectionPolicy } from "../lib/looplab-art-direction.mjs";

test("art direction defaults to open exploration without inheriting prior visual constraints", () => {
  const policy = normalizeArtDirectionPolicy();
  assert.deepEqual(policy, { mode: "explore", locks: [], requestedMode: "explore", fallbackApplied: false });
  const instruction = artDirectionInstruction(policy);
  assert.match(instruction, /intentionally open/i);
  assert.match(instruction, /creative brief/i);
  assert.doesNotMatch(instruction, /dark grey|bright green|foundry|courier/i);
});

test("locked mode requires explicit unique user-authored style locks", () => {
  const fallback = normalizeArtDirectionPolicy({ mode: "locked", locks: ["", "  "] });
  assert.equal(fallback.mode, "explore");
  assert.equal(fallback.fallbackApplied, true);

  const locked = normalizeArtDirectionPolicy({ mode: "locked", locks: ["Ink silhouettes", "Ink silhouettes", "Warm paper palette"] });
  assert.deepEqual(locked.locks, ["Ink silhouettes", "Warm paper palette"]);
  const instruction = artDirectionInstruction(locked);
  assert.match(instruction, /Only these user-authored visual constraints are locked/);
  assert.match(instruction, /Everything else.+remains open/i);
});

test("quality targets never silently become palette, setting, camera, or character-design locks", () => {
  for (const mode of ["explore", "preserve", "locked"]) {
    const instruction = artDirectionInstruction({ mode, locks: mode === "locked" ? ["Hand-painted watercolor"] : [] });
    assert.match(instruction, /must not silently imply a palette, setting, rendering style, material language, camera format, or character design/i);
  }
  assert.deepEqual(normalizeArtDirectionPolicy({ mode: "preserve", locks: ["ignored lock"] }).locks, []);
});

test("CLI and companion expose the same art-direction policy inputs", async () => {
  const [loopSource, companionSource] = await Promise.all([
    readFile(new URL("../scripts/looplab-loop.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/looplab-companion.mjs", import.meta.url), "utf8"),
  ]);
  for (const source of [loopSource, companionSource]) {
    assert.match(source, /artDirectionMode|--art-direction-mode/);
    assert.match(source, /styleLocks|--style-locks/);
  }
  assert.match(loopSource, /objective quality conditions/i);
  assert.match(loopSource, /only explicit user locks may freeze/i);
});
