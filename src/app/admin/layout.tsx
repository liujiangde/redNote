import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { AuthorizationError, requireAdminSession } from "@/lib/auth-boundary";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  try {
    // 管理后台所有页面统一在 layout 做角色保护；具体写操作仍要在 action/API 内
    // 再校验一次权限并写入 AdminAuditLog。
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401) {
      redirect("/login?callbackUrl=/admin");
    }

    if (error instanceof AuthorizationError) {
      redirect("/");
    }

    throw error;
  }

  return <AdminShell>{children}</AdminShell>;
}
