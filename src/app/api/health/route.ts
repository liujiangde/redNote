import { HeadBucketCommand } from "@aws-sdk/client-s3";

import { getConnectedRedisClient } from "@/lib/cache";
import { db } from "@/lib/db";
import { s3Client } from "@/lib/storage";

type HealthCheck = {
  configured: boolean;
  error?: string;
  latencyMs?: number;
  ok: boolean;
};

const HEALTH_CHECK_TIMEOUT_MS = 2500;

function summarizeHealthError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return String(error);
  }

  const name = "name" in error ? String(error.name) : "Error";
  const message = "message" in error ? String(error.message) : "Unknown failure";

  return `${name}: ${message}`;
}

async function withTimeout<T>(operation: Promise<T>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new Error(`Timed out after ${HEALTH_CHECK_TIMEOUT_MS}ms`));
        });
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function checkService(configured: boolean, check: () => Promise<void>): Promise<HealthCheck> {
  const startedAt = Date.now();

  if (!configured) {
    return {
      configured,
      error: "Not configured",
      ok: false,
    };
  }

  try {
    await withTimeout(check());

    return {
      configured,
      latencyMs: Date.now() - startedAt,
      ok: true,
    };
  } catch (error) {
    return {
      configured,
      error: summarizeHealthError(error),
      latencyMs: Date.now() - startedAt,
      ok: false,
    };
  }
}

export async function GET() {
  // 健康检查用于部署和本地排障：实际 ping 必需依赖，同时把 Redis/AI 等增强项
  // 暴露为可观测状态，避免缓存或外部服务异常时只能从业务请求里发现。
  const startedAt = Date.now();
  const [database, redis, storage] = await Promise.all([
    checkService(Boolean(process.env.DATABASE_URL), async () => {
      await db.$queryRaw`SELECT 1`;
    }),
    checkService(Boolean(process.env.REDIS_URL), async () => {
      const client = await getConnectedRedisClient();
      await client.ping();
    }),
    checkService(Boolean(process.env.S3_ENDPOINT), async () => {
      await s3Client.send(
        new HeadBucketCommand({
          Bucket: process.env.S3_BUCKET ?? "rednote-dev",
        }),
      );
    }),
  ]);

  const requiredServicesOk = database.ok && storage.ok;

  return Response.json(
    {
      app: "rednote",
      checkedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      services: {
        ai: {
          configured: Boolean(process.env.OPENAI_API_KEY),
          ok: Boolean(process.env.OPENAI_API_KEY),
        },
        database,
        redis,
        storage,
      },
      status: requiredServicesOk ? "ok" : "degraded",
    },
    {
      status: requiredServicesOk ? 200 : 503,
    },
  );
}
