import assert from "node:assert/strict";
import test from "node:test";

import {
  clampRecommendationSignal,
  normalizeRecommendationSignal,
  scoreRecommendation,
  type RecommendationSignal,
} from "./recommendation";

function expectScore(signal: RecommendationSignal, expected: number) {
  assert.equal(Number(scoreRecommendation(signal).toFixed(4)), expected);
}

test("scoreRecommendation applies the documented signal weights", () => {
  expectScore(
    {
      engagement: 0,
      followedAuthor: 0,
      freshness: 0,
      semanticSimilarity: 1,
      tagMatch: 0,
    },
    0.35,
  );

  expectScore(
    {
      engagement: 0,
      followedAuthor: 0,
      freshness: 0,
      semanticSimilarity: 0,
      tagMatch: 1,
    },
    0.2,
  );

  expectScore(
    {
      engagement: 0,
      followedAuthor: 0,
      freshness: 1,
      semanticSimilarity: 0,
      tagMatch: 0,
    },
    0.15,
  );
});

test("scoreRecommendation keeps normalized all-signal candidates at one", () => {
  expectScore(
    {
      engagement: 1,
      followedAuthor: 1,
      freshness: 1,
      semanticSimilarity: 1,
      tagMatch: 1,
    },
    1,
  );
});

test("clampRecommendationSignal keeps recall scores in the normalized range", () => {
  assert.equal(clampRecommendationSignal(-0.25), 0);
  assert.equal(clampRecommendationSignal(0.42), 0.42);
  assert.equal(clampRecommendationSignal(1.7), 1);
  assert.equal(clampRecommendationSignal(Number.NaN), 0);
  assert.equal(clampRecommendationSignal(Number.POSITIVE_INFINITY), 0);
});

test("normalizeRecommendationSignal clamps every ranking input", () => {
  assert.deepEqual(
    normalizeRecommendationSignal({
      engagement: 2,
      followedAuthor: -1,
      freshness: 0.5,
      semanticSimilarity: Number.NaN,
      tagMatch: 0.25,
    }),
    {
      engagement: 1,
      followedAuthor: 0,
      freshness: 0.5,
      semanticSimilarity: 0,
      tagMatch: 0.25,
    },
  );
});

test("scoreRecommendation clamps out-of-range signals before weighting", () => {
  expectScore(
    {
      engagement: 1.4,
      followedAuthor: 1,
      freshness: -0.4,
      semanticSimilarity: 1.8,
      tagMatch: Number.NaN,
    },
    0.65,
  );
});
