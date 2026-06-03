export type RecommendationSignal = {
  semanticSimilarity: number;
  tagMatch: number;
  engagement: number;
  freshness: number;
  followedAuthor: number;
};

export function scoreRecommendation(signal: RecommendationSignal) {
  // 推荐流程的第一版排序口径：把语义、标签、互动、新鲜度和关注关系组合成
  // 一个可解释分数。不要在调用方直接写权重，后续 A/B 测试和后台调参都从这里演进。
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
