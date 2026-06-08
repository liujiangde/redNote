import Link from "next/link";
import { Bell, Compass, Plus, Search, ShieldCheck } from "lucide-react";

import { getCurrentSession } from "@/lib/auth-boundary";
import { getUnreadNotificationCount } from "@/lib/notification-data";

export async function SiteShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getCurrentSession();
  const unreadCount = session?.user ? await getUnreadNotificationCount(session.user.id) : 0;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:gap-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2 text-lg font-bold text-rose-700">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-rose-600 text-white">
              R
            </span>
            <span className="hidden sm:inline">RedNote</span>
          </Link>
          <form className="relative hidden flex-1 sm:block" action="/search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
              name="q"
              placeholder="搜索旅行、穿搭、咖啡、周末灵感"
            />
          </form>
          <nav className="ml-auto flex shrink-0 items-center gap-1 text-sm font-medium text-slate-600">
            <Link
              aria-label="发现"
              className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-lg hover:bg-slate-100 md:w-auto md:px-3"
              href="/"
              title="发现"
            >
              <Compass className="h-4 w-4" />
              <span className="hidden md:inline">发现</span>
            </Link>
            <Link
              aria-label="发布"
              className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-lg hover:bg-slate-100 md:w-auto md:px-3"
              href="/publish"
              title="发布"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden md:inline">发布</span>
            </Link>
            <Link
              aria-label="后台"
              className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-lg hover:bg-slate-100 md:w-auto md:px-3"
              href="/admin"
              title="后台"
            >
              <ShieldCheck className="h-4 w-4" />
              <span className="hidden md:inline">后台</span>
            </Link>
            <Link
              aria-label="通知"
              className="relative grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-100"
              href="/notifications"
              title="通知"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
