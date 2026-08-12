import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

import {
  canonicalSha256,
  canonicalSha256Async,
  sha256Hex,
  sha256HexAsync,
} from "../lib/looplab-canonical-digest.mjs";

test("native async SHA-256 stays byte-identical to the standalone synchronous implementation", async () => {
  const payload = "LoopLab native digest parity • ".repeat(80_000);
  const expected = sha256Hex(payload);
  assert.equal(await sha256HexAsync(payload, { cryptoImplementation: webcrypto }), expected);
  assert.equal(await sha256HexAsync(payload, { cryptoImplementation: null }), expected);
});

test("canonical async digest preserves sorted-object identity", async () => {
  const left = { z: [3, { b: 2, a: 1 }], a: "first" };
  const right = { a: "first", z: [3, { a: 1, b: 2 }] };
  const expected = canonicalSha256(left);
  assert.equal(await canonicalSha256Async(left, { cryptoImplementation: webcrypto }), expected);
  assert.equal(await canonicalSha256Async(right, { cryptoImplementation: webcrypto }), expected);
});
