import { createClient } from "redis";

let redisClient: ReturnType<typeof createClient> | undefined;

export function getRedisClient() {
  if (!redisClient) {
    // Redis 是后续热门标签、Feed 候选、搜索热词、浏览量聚合和限流的共享入口。
    // 调用方负责在具体流程里 connect/disconnect，避免模块加载时就建立连接。
    // createClient is lazy; callers should connect once in the workflow that
    // first needs Redis and then reuse this module-level instance.
    redisClient = createClient({
      url: process.env.REDIS_URL ?? "redis://localhost:6379",
    });
  }

  return redisClient;
}
