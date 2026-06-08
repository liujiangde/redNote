import { NotificationType } from "@/generated/prisma/client";
import { createCursorPage, type CursorPage } from "@/lib/api-contract";
import { db } from "@/lib/db";

// 通知读模型层：
// 1. Web 通知中心和 /api/v1/notifications 都复用这里的查询和 DTO。
// 2. 页面/API 不直接拼 Prisma include，避免通知类型、未读状态、分页口径分叉。
// 3. 后续接入移动端 Push、邮件通知或队列消费时，也优先保持这里的输出结构稳定。
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

// 通知中心对外展示的最小 DTO。这里故意不暴露 recipientId，避免页面和移动端
// 误用用户 id 做权限判断；权限只在服务层/API 边界处理。
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

// 枚举到中文标签的映射集中在这里。后续国际化时可以替换为 i18n dictionary，
// 页面不用关心数据库枚举值和文案的转换关系。
export const notificationTypeLabels: Record<NotificationType, string> = {
  [NotificationType.LIKE]: "点赞",
  [NotificationType.COMMENT]: "评论",
  [NotificationType.FOLLOW]: "关注",
  [NotificationType.FAVORITE]: "收藏",
  [NotificationType.SYSTEM]: "系统",
  [NotificationType.REPORT_UPDATE]: "审核",
};

function formatNotificationTime(value: Date) {
  // 通知列表使用紧凑时间即可；完整审计时间后续应放到后台或详情页。
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
  // Prisma 记录到页面 DTO 的转换只在这里做一次：
  // readAt === null 表示未读，actor 可能因为用户删除或系统通知为空。
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
  // URL/API 入参只接受明确的 read/unread；其他值回退为 all，避免无效筛选导致 500。
  if (value === "read" || value === "unread") {
    return value;
  }

  return "all";
}

export function parseNotificationTypeFilter(value: string | null) {
  // 类型筛选必须来自 Prisma 枚举白名单。未知类型直接忽略，保持页面可访问。
  if (notificationTypes.some((type) => type === value)) {
    return value as NotificationTypeFilter;
  }

  return undefined;
}

export async function getUnreadNotificationCount(userId: string) {
  try {
    // 导航只需要未读数量，所以使用轻量 count，不拉通知列表和 actor 信息。
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
  // 注意：调用方必须传入当前登录用户 id，不允许前端从 URL/body 传 userId。
  const where = {
    recipientId: userId,
    ...(read === "unread" ? { readAt: null } : {}),
    ...(read === "read" ? { readAt: { not: null } } : {}),
    ...(type ? { type } : {}),
  };

  const [unreadCount, notifications] = await Promise.all([
    // 未读数不受当前 read/type 筛选影响，用于顶部徽标展示“全局未读”。
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
      // cursor 命中后 skip 1，避免下一页重复展示上一页最后一条通知。
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
