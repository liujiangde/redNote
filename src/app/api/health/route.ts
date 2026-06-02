export function GET() {
  return Response.json({
    app: "rednote",
    status: "ok",
    services: {
      database: Boolean(process.env.DATABASE_URL),
      redis: Boolean(process.env.REDIS_URL),
      storage: Boolean(process.env.S3_ENDPOINT),
      ai: Boolean(process.env.OPENAI_API_KEY),
    },
  });
}

