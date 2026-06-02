import OpenAI from "openai";

export async function createEmbedding(input: string) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    // Deterministic fallback keeps local seed/search flows runnable without
    // external credentials. It is not a substitute for production embeddings.
    return Array.from({ length: 1536 }, (_, index) => {
      const charCode = input.charCodeAt(index % Math.max(input.length, 1)) || 0;
      return (charCode % 17) / 17;
    });
  }

  const client = new OpenAI({ apiKey });
  const response = await client.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    input,
  });

  return response.data[0]?.embedding ?? [];
}
