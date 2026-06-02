import { createClient } from "redis";

let redisClient: ReturnType<typeof createClient> | undefined;

export function getRedisClient() {
  if (!redisClient) {
    // createClient is lazy; callers should connect once in the workflow that
    // first needs Redis and then reuse this module-level instance.
    redisClient = createClient({
      url: process.env.REDIS_URL ?? "redis://localhost:6379",
    });
  }

  return redisClient;
}
