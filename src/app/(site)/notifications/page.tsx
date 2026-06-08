import Link from "next/link";
import { Bell, CheckCheck, Inbox, MessageCircle } from "lucide-react";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentSession } from "@/lib/auth-boundary";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notification-actions";
import {
  getNotificationsForUser,
  notificationTypeLabels,
  notificationTypes,
  parseNotificationReadFilter,
  parseNotificationTypeFilter,
  type NotificationReadFilter,
  type NotificationTypeFilter,
} from "@/lib/notification-data";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

// 顶部状态筛选只影响列表内容，不影响未读总数。
// 未读总数始终展示当前用户全部未读通知，便于用户知道还有多少待处理消息。
const readFilters: Array<{
  label: string;
  value: NotificationReadFilter;
}> = [
  { label: "全部", value: "all" },
  { label: "未读", value: "unread" },
  { label: "已读", value: "read" },
];

function buildNotificationsHref(options: {
  cursor?: string | null;
  read?: NotificationReadFilter;
  type?: NotificationTypeFilter;
}) {
  // 通知中心用 URL query 保存筛选和分页状态：
  // 1. 链接可复制、刷新不丢状态。
  // 2. 不需要客户端状态管理，保持 Server Component 简单。
  // 3. all 是默认筛选，不写进 URL，避免地址变长。
  const params = new URLSearchParams();

  if (options.read && options.read !== "all") {
    params.set("read", options.read);
  }

  if (options.type) {
    params.set("type", options.type);
  }

  if (options.cursor) {
    params.set("cursor", options.cursor);
  }

  const query = params.toString();

  return query ? `/notifications?${query}` : "/notifications";
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    cursor?: string;
    read?: string;
    type?: string;
  }>;
}) {
  const session = await getCurrentSession();

  if (!session?.user) {
    // 通知是用户私有数据，未登录必须先去登录页，并在登录后回到通知中心。
    redirect(`/login?callbackUrl=${encodeURIComponent("/notifications")}`);
  }

  const { cursor, read: rawRead, type: rawType } = await searchParams;
  // URL 入参先做白名单归一化，非法 read/type 不抛 500，而是回退到安全默认值。
  const read = parseNotificationReadFilter(rawRead ?? null);
  const type = parseNotificationTypeFilter(rawType ?? null);
  // 页面只传当前 session 的 userId，不能从 URL 读取用户 id，防止越权查询。
  const notifications = await getNotificationsForUser({
    cursor,
    limit: PAGE_SIZE,
    read,
    type,
    userId: session.user.id,
  });

  return (
    <section className="space-y-6">
      {/* 顶部操作区：展示全局未读数，并提供“全部已读”的批量入口。 */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-rose-50 text-rose-700">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-950">通知中心</h1>
              <p className="mt-1 text-sm text-slate-500">
                {notifications.unreadCount > 0
                  ? `${notifications.unreadCount} 条未读通知`
                  : "所有通知都已读"}
              </p>
            </div>
          </div>
          <form action={markAllNotificationsRead}>
            <Button
              disabled={notifications.unreadCount === 0}
              type="submit"
              variant="secondary"
            >
              <CheckCheck className="h-4 w-4" />
              全部标为已读
            </Button>
          </form>
        </div>
        {/* read 筛选用于用户快速收敛到未处理消息或回看已读消息。 */}
        <div className="mt-5 flex flex-wrap gap-2">
          {readFilters.map((filter) => (
            <Link
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-semibold",
                read === filter.value
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
              href={buildNotificationsHref({ read: filter.value, type })}
              key={filter.value}
            >
              {filter.label}
            </Link>
          ))}
        </div>
        {/* type 筛选复用 Prisma 通知枚举，后续新增通知类型只需扩展 notification-data。 */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            className={cn(
              "rounded-lg border px-3 py-2 text-sm font-semibold",
              !type
                ? "border-teal-200 bg-teal-50 text-teal-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
            href={buildNotificationsHref({ read })}
          >
            全部类型
          </Link>
          {notificationTypes.map((item) => (
            <Link
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-semibold",
                type === item
                  ? "border-teal-200 bg-teal-50 text-teal-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
              href={buildNotificationsHref({ read, type: item })}
              key={item}
            >
              {notificationTypeLabels[item]}
            </Link>
          ))}
        </div>
      </div>

      {notifications.page.items.length ? (
        // 列表中的“查看”和“标为已读”分开：用户可以先处理通知，也可以只清理未读状态。
        <div className="space-y-3">
          {notifications.page.items.map((notification) => (
            <article
              className={cn(
                "rounded-lg border bg-white p-4 shadow-sm",
                notification.isUnread ? "border-rose-200" : "border-slate-200",
              )}
              key={notification.id}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className={
                        notification.isUnread
                          ? undefined
                          : "border-slate-200 bg-slate-50 text-slate-500"
                      }
                    >
                      {notification.typeLabel}
                    </Badge>
                    {notification.isUnread && (
                      <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white">
                        未读
                      </span>
                    )}
                    <span className="text-xs text-slate-400">{notification.createdAt}</span>
                  </div>
                  <h2 className="mt-3 text-base font-semibold text-slate-950">
                    {notification.href ? (
                      <Link className="hover:text-rose-700" href={notification.href}>
                        {notification.title}
                      </Link>
                    ) : (
                      notification.title
                    )}
                  </h2>
                  {notification.body && (
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                      {notification.body}
                    </p>
                  )}
                  {notification.actor && (
                    // actor 可能为空：系统通知、被删除用户或后续运营通知都可能没有触发者。
                    <p className="mt-2 text-xs text-slate-400">
                      来自 @{notification.actor.handle}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {notification.href && (
                    <Link
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                      href={notification.href}
                    >
                      <MessageCircle className="h-4 w-4" />
                      查看
                    </Link>
                  )}
                  {notification.isUnread && (
                    <form action={markNotificationRead.bind(null, notification.id)}>
                      <Button type="submit" variant="ghost">
                        标为已读
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <Inbox className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm text-slate-500">当前筛选下没有通知。</p>
        </div>
      )}

      {notifications.page.pageInfo.hasNextPage && (
        // 下一页沿用当前筛选条件，仅追加 cursor，保证分页不会丢筛选上下文。
        <div className="flex justify-center">
          <Link
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            href={buildNotificationsHref({
              cursor: notifications.page.pageInfo.nextCursor,
              read,
              type,
            })}
          >
            下一页
          </Link>
        </div>
      )}
    </section>
  );
}
