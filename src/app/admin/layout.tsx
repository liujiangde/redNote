import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { AuthorizationError, requireAdminSession } from "@/lib/auth-boundary";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let redirectTo: string | null = null;

  try {
    // 管理后台所有页面统一在 layout 做角色保护；具体写操作仍要在 action/API 内
    // 再校验一次权限并写入 AdminAuditLog。
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401) {
      redirectTo = "/login?callbackUrl=/admin";
    } else if (error instanceof AuthorizationError) {
      redirectTo = "/";
    } else {
      throw error;
    }
  }

  if (redirectTo) {
    redirect(redirectTo);
  }

  return <AdminShell>{children}</AdminShell>;
}
