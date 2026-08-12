import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  SPRITE_KIND_NAMES,
  SPRITE_PALETTE_NAMES,
  TILE_THEME_NAMES,
  generateSpritePixels,
  generateTilesetPixels,
} from "../lib/looplab-pixel-generator.mjs";

const execFileAsync = promisify(execFile);

test("deterministic generator failures list every supported choice", () => {
  assert.throws(
    () => generateTilesetPixels({ theme: "industrial" }),
    new RegExp(`Choose one of: ${TILE_THEME_NAMES.join(", ")}\\.`),
  );
  assert.throws(
    () => generateSpritePixels({ kind: "vehicle" }),
    new RegExp(`Choose one of: ${SPRITE_KIND_NAMES.join(", ")}\\.`),
  );
  assert.throws(
    () => generateSpritePixels({ palette: "industrial" }),
    new RegExp(`Choose one of: ${SPRITE_PALETTE_NAMES.join(", ")}\\.`),
  );
});

test("headless CLI help advertises exact deterministic generator choices", async () => {
  const execution = await execFileAsync(process.execPath, [resolve("scripts/looplab-agent.mjs"), "help"], { cwd: resolve(".") });
  const help = JSON.parse(execution.stdout);
  assert.match(help.usage.generateTiles, new RegExp(`theme=${TILE_THEME_NAMES.join("\\|")}`));
  assert.match(help.usage.generateTiles, /size=16\|32\|48\|64/);
  assert.match(help.usage.generateSprite, new RegExp(`kind=${SPRITE_KIND_NAMES.join("\\|")}`));
  assert.match(help.usage.generateSprite, new RegExp(`palette=${SPRITE_PALETTE_NAMES.join("\\|")}`));
});
