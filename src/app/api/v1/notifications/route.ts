import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  apiError,
  apiErrorCodes,
  apiSuccess,
  parseCursorPagination,
} from "@/lib/api-contract";
import { getCurrentSession } from "@/lib/auth-boundary";
import { db } from "@/lib/db";
import {
  getNotificationsForUser,
  parseNotificationReadFilter,
  parseNotificationTypeFilter,
} from "@/lib/notification-data";

export const dynamic = "force-dynamic";

// PATCH 请求体约定：
// - { all: true } 表示把当前用户所有未读通知设为已读。
// - { ids: ["..."] } 表示只处理指定通知。
// ids 最多 100 条，避免移动端一次提交过大 payload。
const markReadSchema = z
  .object({
    all: z.boolean().optional(),
    ids: z.array(z.string().trim().min(1)).max(100).optional(),
  })
  .refine((value) => value.all === true || Boolean(value.ids?.length), {
    message: "Provide all=true or at least one notification id.",
  });

async function getApiSession() {
  // 当前 M3.1 API 先复用 Web NextAuth session。
  // M8 移动端接入 token/session refresh 时，可以只替换这个认证入口。
  const session = await getCurrentSession();

  if (!session?.user) {
    return null;
  }

  return session;
}

export async function GET(request: NextRequest) {
  // GET /api/v1/notifications 是跨端通知列表入口：
  // Web、未来 App、测试脚本都应使用同一套 envelope、分页和筛选参数。
  const session = await getApiSession();

  if (!session) {
    return apiError(apiErrorCodes.UNAUTHORIZED, "Authentication is required.", {
      status: 401,
    });
  }

  // 通知 API 与 Web 通知中心共用 cursor、read、type 参数，移动端可以直接复用。
  const pagination = parseCursorPagination(request.nextUrl.searchParams);

  if (!pagination.ok) {
    return apiError(apiErrorCodes.VALIDATION_ERROR, "Invalid pagination parameters.", {
      status: 400,
      details: pagination.error,
    });
  }

  const read = parseNotificationReadFilter(request.nextUrl.searchParams.get("read"));
  const type = parseNotificationTypeFilter(request.nextUrl.searchParams.get("type"));
  // userId 只来自 session，不允许客户端传 recipientId，避免越权读取他人通知。
  const notifications = await getNotificationsForUser({
    cursor: pagination.value.cursor,
    limit: pagination.value.limit,
    read,
    type,
    userId: session.user.id,
  });

  return apiSuccess(notifications);
}

export async function PATCH(request: NextRequest) {
  // PATCH /api/v1/notifications 是跨端标记已读入口。
  // Web 页面也有 Server Action 版本，API 版本主要给移动端和外部 BFF 使用。
  const session = await getApiSession();

  if (!session) {
    return apiError(apiErrorCodes.UNAUTHORIZED, "Authentication is required.", {
      status: 401,
    });
  }

  // request.json() 解析失败时按 null 进入 zod 校验，统一返回 VALIDATION_ERROR。
  const parsed = markReadSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return apiError(apiErrorCodes.VALIDATION_ERROR, "Invalid notification payload.", {
      status: 400,
      details: parsed.error.flatten(),
    });
  }

  // 已读写入始终按 recipientId 限定，避免客户端传入他人的通知 id 越权修改。
  await db.notification.updateMany({
    where: {
      recipientId: session.user.id,
      readAt: null,
      ...(parsed.data.all
        ? {}
        : {
            id: {
              in: parsed.data.ids,
            },
          }),
    },
    data: {
      readAt: new Date(),
    },
  });

  const unreadCount = await db.notification.count({
    where: {
      recipientId: session.user.id,
      readAt: null,
    },
  });

  // 写入后返回新的未读数，移动端可以直接刷新角标，不必立刻再 GET 一次列表。
  return apiSuccess({
    unreadCount,
  });
}
