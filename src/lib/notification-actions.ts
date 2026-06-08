"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AuthorizationError, requireUserSession } from "@/lib/auth-boundary";
import { db } from "@/lib/db";

function redirectToNotificationsLogin(): never {
  redirect(`/login?callbackUrl=${encodeURIComponent("/notifications")}`);
}

async function requireNotificationUser() {
  try {
    return await requireUserSession();
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401) {
      redirectToNotificationsLogin();
    }

    throw error;
  }
}

export async function markNotificationRead(notificationId: string) {
  const session = await requireNotificationUser();

  // 单条已读必须同时按 id 和 recipientId 过滤，防止用户通过表单提交修改他人通知。
  await db.notification.updateMany({
    where: {
      id: notificationId,
      recipientId: session.user.id,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });

  revalidatePath("/notifications");
}

export async function markAllNotificationsRead() {
  const session = await requireNotificationUser();

  // 全部已读只处理当前用户未读通知，已读记录保持原 readAt，便于后续统计阅读延迟。
  await db.notification.updateMany({
    where: {
      recipientId: session.user.id,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });

  revalidatePath("/notifications");
}
