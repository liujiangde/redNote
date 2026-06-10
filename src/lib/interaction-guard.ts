import { createHash } from "node:crypto";

import { getConnectedRedisClient } from "@/lib/cache";

export type InteractionKind = "comment" | "favorite" | "follow" | "like";

type GuardPolicy = {
  windowSeconds: number;
  maxInWindow: number;
  targetCooldownSeconds: number;
  duplicateContentSeconds?: number;
};

type GuardInput = {
  kind: InteractionKind;
  userId: string;
  targetId: string;
  content?: string;
};

type MemoryCounter = {
  expiresAt: number;
  value: number;
};

const policies: Record<InteractionKind, GuardPolicy> = {
  // 点赞/收藏/关注是 toggle 行为，重点防止用户双击或重复提交导致状态被来回翻转。
  like: {
    windowSeconds: 10,
    maxInWindow: 8,
    targetCooldownSeconds: 2,
  },
  favorite: {
    windowSeconds: 10,
    maxInWindow: 8,
    targetCooldownSeconds: 2,
  },
  follow: {
    windowSeconds: 60,
    maxInWindow: 20,
    targetCooldownSeconds: 3,
  },
  // 评论写入成本更高，也更容易被刷屏；除频率限制外，还检查同一位置的重复内容。
  comment: {
    windowSeconds: 60,
    maxInWindow: 8,
    targetCooldownSeconds: 3,
    duplicateContentSeconds: 60,
  },
};

const memoryCounters = new Map<string, MemoryCounter>();
const memoryLocks = new Map<string, number>();

function normalizeContent(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase();
}

function hashContent(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function getWindowKey(input: GuardInput) {
  return `rednote:guard:${input.kind}:user:${input.userId}:window`;
}

function getTargetCooldownKey(input: GuardInput) {
  return `rednote:guard:${input.kind}:user:${input.userId}:target:${input.targetId}`;
}

function getDuplicateContentKey(input: GuardInput) {
  const normalized = normalizeContent(input.content);

  if (!normalized) {
    return undefined;
  }

  return `rednote:guard:${input.kind}:user:${input.userId}:content:${input.targetId}:${hashContent(normalized)}`;
}

async function setRedisLock(key: string, ttlSeconds: number) {
  const client = await getConnectedRedisClient();
  const result = await client.set(key, "1", {
    EX: ttlSeconds,
    NX: true,
  });

  return result === "OK";
}

async function incrementRedisWindow(key: string, policy: GuardPolicy) {
  const client = await getConnectedRedisClient();
  const value = await client.incr(key);

  if (value === 1) {
    await client.expire(key, policy.windowSeconds);
  }

  return value <= policy.maxInWindow;
}

function setMemoryLock(key: string, ttlSeconds: number) {
  const now = Date.now();
  const existingExpiresAt = memoryLocks.get(key);

  if (existingExpiresAt && existingExpiresAt > now) {
    return false;
  }

  memoryLocks.set(key, now + ttlSeconds * 1000);
  return true;
}

function incrementMemoryWindow(key: string, policy: GuardPolicy) {
  const now = Date.now();
  const existing = memoryCounters.get(key);

  if (!existing || existing.expiresAt <= now) {
    memoryCounters.set(key, {
      expiresAt: now + policy.windowSeconds * 1000,
      value: 1,
    });
    return true;
  }

  existing.value += 1;
  return existing.value <= policy.maxInWindow;
}

function cleanupMemoryGuards() {
  const now = Date.now();

  for (const [key, counter] of memoryCounters) {
    if (counter.expiresAt <= now) {
      memoryCounters.delete(key);
    }
  }

  for (const [key, expiresAt] of memoryLocks) {
    if (expiresAt <= now) {
      memoryLocks.delete(key);
    }
  }
}

async function enforceWithRedis(input: GuardInput, policy: GuardPolicy) {
  if (!(await incrementRedisWindow(getWindowKey(input), policy))) {
    return false;
  }

  if (!(await setRedisLock(getTargetCooldownKey(input), policy.targetCooldownSeconds))) {
    return false;
  }

  const duplicateContentKey = getDuplicateContentKey(input);

  if (
    duplicateContentKey &&
    policy.duplicateContentSeconds &&
    !(await setRedisLock(duplicateContentKey, policy.duplicateContentSeconds))
  ) {
    return false;
  }

  return true;
}

function enforceWithMemory(input: GuardInput, policy: GuardPolicy) {
  cleanupMemoryGuards();

  if (!incrementMemoryWindow(getWindowKey(input), policy)) {
    return false;
  }

  if (!setMemoryLock(getTargetCooldownKey(input), policy.targetCooldownSeconds)) {
    return false;
  }

  const duplicateContentKey = getDuplicateContentKey(input);

  if (
    duplicateContentKey &&
    policy.duplicateContentSeconds &&
    !setMemoryLock(duplicateContentKey, policy.duplicateContentSeconds)
  ) {
    return false;
  }

  return true;
}

export async function enforceInteractionGuard(input: GuardInput) {
  const policy = policies[input.kind];

  // 互动风控是写入口的前置保护：
  // 1. window 限制同一用户单位时间内的总操作数。
  // 2. target cooldown 防止双击/重复提交导致 toggle 状态来回翻转。
  // 3. duplicate content 防止同一位置短时间刷同样评论。
  // Redis 可用时跨进程生效；本地 Redis 不可用时退回内存保护，避免开发期阻塞主流程。
  try {
    return await enforceWithRedis(input, policy);
  } catch {
    return enforceWithMemory(input, policy);
  }
}
