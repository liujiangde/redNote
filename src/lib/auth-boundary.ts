import { getServerSession } from "next-auth";

import { UserStatus } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export type AppRole = "USER" | "ADMIN" | "SUPER_ADMIN";

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

const adminRoles = new Set<AppRole>(["ADMIN", "SUPER_ADMIN"]);

// 权限边界集中在这里：页面、Route Handler 和未来移动端 BFF 不要各自散写
// session/role 判断。后续接入 token 鉴权时，也优先从这些函数扩展。
export async function getCurrentSession() {
  return getServerSession(authOptions);
}

export async function requireUserSession() {
  const session = await getCurrentSession();

  if (!session?.user) {
    throw new AuthorizationError("Authentication is required.", 401);
  }

  const user = await db.user.findUnique({
    where: {
      id: session.user.id,
    },
    select: {
      status: true,
    },
  });

  if (!user || user.status === UserStatus.BANNED) {
    throw new AuthorizationError("Account is not available.", 403);
  }

  return session;
}

export async function requireAdminSession() {
  const session = await requireUserSession();

  if (!adminRoles.has(session.user.role)) {
    throw new AuthorizationError("Admin permission is required.", 403);
  }

  return session;
}
