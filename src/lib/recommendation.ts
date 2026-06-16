export type RecommendationSignal = {
  semanticSimilarity: number;
  tagMatch: number;
  engagement: number;
  freshness: number;
  followedAuthor: number;
};

export function clampRecommendationSignal(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

export function normalizeRecommendationSignal(signal: RecommendationSignal): RecommendationSignal {
  return {
    engagement: clampRecommendationSignal(signal.engagement),
    followedAuthor: clampRecommendationSignal(signal.followedAuthor),
    freshness: clampRecommendationSignal(signal.freshness),
    semanticSimilarity: clampRecommendationSignal(signal.semanticSimilarity),
    tagMatch: clampRecommendationSignal(signal.tagMatch),
  };
}

export function scoreRecommendation(signal: RecommendationSignal) {
  // 推荐流程的第一版排序口径：把语义、标签、互动、新鲜度和关注关系组合成
  // 一个可解释分数。不要在调用方直接写权重，后续 A/B 测试和后台调参都从这里演进。
  // 调用方仍应尽量传入 0..1 信号；这里做最后兜底，避免外部召回分异常污染排序。
  const normalizedSignal = normalizeRecommendationSignal(signal);

  return (
    normalizedSignal.semanticSimilarity * 0.35 +
    normalizedSignal.tagMatch * 0.2 +
    normalizedSignal.engagement * 0.2 +
    normalizedSignal.freshness * 0.15 +
    normalizedSignal.followedAuthor * 0.1
  );
}
