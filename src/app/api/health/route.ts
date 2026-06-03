export function GET() {
  // 健康检查只暴露配置是否存在，不在这里建立连接；真实可用性检查后续应
  // 扩展为数据库 ping、Redis ping、对象存储 bucket 检查和 AI provider 检查。
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
