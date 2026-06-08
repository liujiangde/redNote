import { NotificationType } from "@/generated/prisma/client";
import { createCursorPage, type CursorPage } from "@/lib/api-contract";
import { db } from "@/lib/db";

export const notificationTypes = [
  NotificationType.LIKE,
  NotificationType.COMMENT,
  NotificationType.FOLLOW,
  NotificationType.FAVORITE,
  NotificationType.SYSTEM,
  NotificationType.REPORT_UPDATE,
] as const;

export type NotificationReadFilter = "all" | "unread" | "read";
export type NotificationTypeFilter = (typeof notificationTypes)[number];

export type NotificationItemData = {
  id: string;
  type: NotificationType;
  typeLabel: string;
  title: string;
  body: string | null;
  href: string | null;
  isUnread: boolean;
  readAt: string | null;
  createdAt: string;
  actor: {
    name: string;
    handle: string;
    avatarUrl: string | null;
  } | null;
};

export type NotificationListData = {
  unreadCount: number;
  page: CursorPage<NotificationItemData>;
};

export const notificationTypeLabels: Record<NotificationType, string> = {
  [NotificationType.LIKE]: "点赞",
  [NotificationType.COMMENT]: "评论",
  [NotificationType.FOLLOW]: "关注",
  [NotificationType.FAVORITE]: "收藏",
  [NotificationType.SYSTEM]: "系统",
  [NotificationType.REPORT_UPDATE]: "审核",
};

function formatNotificationTime(value: Date) {
  return value.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toNotificationItem(notification: {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
  actor: {
    name: string;
    handle: string;
    avatarUrl: string | null;
  } | null;
}): NotificationItemData {
  return {
    id: notification.id,
    type: notification.type,
    typeLabel: notificationTypeLabels[notification.type],
    title: notification.title,
    body: notification.body,
    href: notification.href,
    isUnread: notification.readAt === null,
    readAt: notification.readAt ? formatNotificationTime(notification.readAt) : null,
    createdAt: formatNotificationTime(notification.createdAt),
    actor: notification.actor,
  };
}

export function parseNotificationReadFilter(value: string | null): NotificationReadFilter {
  if (value === "read" || value === "unread") {
    return value;
  }

  return "all";
}

export function parseNotificationTypeFilter(value: string | null) {
  if (notificationTypes.some((type) => type === value)) {
    return value as NotificationTypeFilter;
  }

  return undefined;
}

export async function getUnreadNotificationCount(userId: string) {
  try {
    return await db.notification.count({
      where: {
        recipientId: userId,
        readAt: null,
      },
    });
  } catch {
    // 导航徽标不应因为本地数据库短暂不可达拖垮整站；通知中心页面仍会暴露真实错误。
    return 0;
  }
}

export async function getNotificationsForUser({
  cursor,
  limit,
  read,
  type,
  userId,
}: {
  cursor?: string;
  limit: number;
  read?: NotificationReadFilter;
  type?: NotificationTypeFilter;
  userId: string;
}): Promise<NotificationListData> {
  // 通知列表按用户隔离，只允许读取当前 session 对应的 recipientId。
  // cursor 使用通知 id，排序固定为 createdAt/id 倒序，保证 Web 和 App 分页口径一致。
  const where = {
    recipientId: userId,
    ...(read === "unread" ? { readAt: null } : {}),
    ...(read === "read" ? { readAt: { not: null } } : {}),
    ...(type ? { type } : {}),
  };

  const [unreadCount, notifications] = await Promise.all([
    db.notification.count({
      where: {
        recipientId: userId,
        readAt: null,
      },
    }),
    db.notification.findMany({
      where,
      include: {
        actor: {
          select: {
            name: true,
            handle: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor
        ? {
            cursor: {
              id: cursor,
            },
            skip: 1,
          }
        : {}),
      take: limit + 1,
    }),
  ]);

  return {
    unreadCount,
    page: createCursorPage(notifications.map(toNotificationItem), {
      limit,
      getCursor: (notification) => notification.id,
    }),
  };
}
