import assert from "node:assert/strict";
import test from "node:test";

import { formatPgVector } from "./vector";

test("formatPgVector pads embeddings to the configured dimension", () => {
  assert.equal(formatPgVector([0.1, 0.2], 4), "[0.1,0.2,0,0]");
});

test("formatPgVector replaces non-finite values with zero", () => {
  assert.equal(formatPgVector([Number.NaN, Infinity, -Infinity, 1], 4), "[0,0,0,1]");
});

test("formatPgVector truncates values beyond the configured dimension", () => {
  assert.equal(formatPgVector([0.1, 0.2, 0.3], 2), "[0.1,0.2]");
});
