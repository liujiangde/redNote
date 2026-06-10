export function formatPgVector(embedding: number[], dimensions = 1536) {
  // pgvector 在 Prisma 中是 Unsupported 类型，写入和查询都需要传 PostgreSQL vector 字符串。
  // 这里统一维度和 NaN/Infinity 兜底，避免发布、seed、语义搜索各自拼接不同格式。
  const values = Array.from({ length: dimensions }, (_, index) => {
    const value = embedding[index] ?? 0;

    return Number.isFinite(value) ? value : 0;
  });

  return `[${values.join(",")}]`;
}
