import OpenAI from "openai";

export async function createEmbedding(input: string) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    // 本地 seed 和开发流程不能依赖外部账号，所以没有 API key 时返回稳定伪向量。
    // 生产搜索/推荐必须配置真实 embedding，否则语义召回结果没有业务意义。
    // Deterministic fallback keeps local seed/search flows runnable without
    // external credentials. It is not a substitute for production embeddings.
    return Array.from({ length: 1536 }, (_, index) => {
      const charCode = input.charCodeAt(index % Math.max(input.length, 1)) || 0;
      return (charCode % 17) / 17;
    });
  }

  // 真实语义向量用于 note_embeddings，后续发布/更新笔记时应在服务端统一触发。
  const client = new OpenAI({ apiKey });
  const response = await client.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    input,
  });

  return response.data[0]?.embedding ?? [];
}
