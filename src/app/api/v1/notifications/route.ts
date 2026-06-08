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

const markReadSchema = z
  .object({
    all: z.boolean().optional(),
    ids: z.array(z.string().trim().min(1)).max(100).optional(),
  })
  .refine((value) => value.all === true || Boolean(value.ids?.length), {
    message: "Provide all=true or at least one notification id.",
  });

async function getApiSession() {
  const session = await getCurrentSession();

  if (!session?.user) {
    return null;
  }

  return session;
}

export async function GET(request: NextRequest) {
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
  const session = await getApiSession();

  if (!session) {
    return apiError(apiErrorCodes.UNAUTHORIZED, "Authentication is required.", {
      status: 401,
    });
  }

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

  return apiSuccess({
    unreadCount,
  });
}
