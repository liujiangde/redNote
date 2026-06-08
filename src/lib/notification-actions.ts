"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AuthorizationError, requireUserSession } from "@/lib/auth-boundary";
import { db } from "@/lib/db";

// 通知已读写流程：
// 1. Web 页面通过 <form action={...}> 调用这里的 Server Action。
// 2. Server Action 可被直接 POST 调用，所以每个函数都必须重新校验登录态。
// 3. updateMany 始终带 recipientId，确保用户只能修改自己的通知。
function redirectToNotificationsLogin(): never {
  // 用户从通知中心触发动作但未登录时，登录后回到通知中心继续操作。
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
  // updateMany 即使没有命中也不会抛错，适合处理重复点击、已读通知再次提交等幂等场景。
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

  // 通知中心和导航徽标都依赖未读数，写入后刷新该路径让 UI 立即反映变化。
  revalidatePath("/notifications");
}

export async function markAllNotificationsRead() {
  const session = await requireNotificationUser();

  // 全部已读只处理当前用户未读通知，已读记录保持原 readAt，便于后续统计阅读延迟。
  // 这里不删除通知，保留历史记录供用户回看，也便于后续做通知中心分页。
  await db.notification.updateMany({
    where: {
      recipientId: session.user.id,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });

  // 当前只刷新通知中心；如果后续给全站布局加缓存标签，可改为 revalidateTag。
  revalidatePath("/notifications");
}
