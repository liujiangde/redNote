import Link from "next/link";
import { BarChart3, Flag, NotebookText, ShieldCheck, Users } from "lucide-react";

const adminLinks = [
  { href: "/admin", label: "数据看板", icon: BarChart3 },
  { href: "/admin/notes", label: "笔记管理", icon: NotebookText },
  { href: "/admin/reports", label: "举报管理", icon: Flag },
  { href: "/admin/users", label: "用户管理", icon: Users },
  { href: "/admin/safety", label: "内容安全", icon: ShieldCheck },
];

export function AdminShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white p-5 lg:block">
        <Link href="/" className="text-lg font-bold text-rose-700">
          RedNote Admin
        </Link>
        <nav className="mt-8 space-y-1">
          {adminLinks.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                href={item.href}
                key={item.href}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="min-h-screen px-4 py-6 lg:ml-64 lg:px-8">{children}</main>
    </div>
  );
}
