import assert from "node:assert/strict";
import test from "node:test";

import { scoreRecommendation, type RecommendationSignal } from "./recommendation";

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
