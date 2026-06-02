export type RecommendationSignal = {
  semanticSimilarity: number;
  tagMatch: number;
  engagement: number;
  freshness: number;
  followedAuthor: number;
};

export function scoreRecommendation(signal: RecommendationSignal) {
  // First-pass explainable weights. Keep each signal normalized to 0..1 before
  // calling this helper so scores remain comparable across ranking strategies.
  return (
    signal.semanticSimilarity * 0.35 +
    signal.tagMatch * 0.2 +
    signal.engagement * 0.2 +
    signal.freshness * 0.15 +
    signal.followedAuthor * 0.1
  );
}
