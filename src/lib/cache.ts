import { createClient } from "redis";

let redisClient: ReturnType<typeof createClient> | undefined;
let redisConnectPromise: Promise<ReturnType<typeof getRedisClient>> | undefined;

export function getRedisClient() {
  if (!redisClient) {
    // Redis 是后续热门标签、Feed 候选、搜索热词、浏览量聚合和限流的共享入口。
    // 调用方负责在具体流程里 connect/disconnect，避免模块加载时就建立连接。
    // createClient is lazy; callers should connect once in the workflow that
    // first needs Redis and then reuse this module-level instance.
    redisClient = createClient({
      url: process.env.REDIS_URL ?? "redis://localhost:6379",
    });
    redisClient.on("error", () => {
      // Redis 在本项目里是缓存/限流增强层。连接失败由调用方降级处理，
      // 这里吸收客户端 error 事件，避免本地未启动 Redis 时触发未处理异常。
    });
  }

  return redisClient;
}

export async function getConnectedRedisClient() {
  const client = getRedisClient();

  if (client.isOpen) {
    return client;
  }

  // 多个请求同时首次使用 Redis 时，共用同一个 connect promise，避免重复建连。
  redisConnectPromise ??= client
    .connect()
    .then(() => client)
    .finally(() => {
      redisConnectPromise = undefined;
    });

  return redisConnectPromise;
}

export async function getOptionalRedisClient() {
  try {
    return await getConnectedRedisClient();
  } catch {
    // Redis 是缓存、限流、热词和候选池的增强层；本地 Redis 不可达时不阻断主流程。
    return null;
  }
}
