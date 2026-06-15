import { UserRole } from "@/generated/prisma/client";

import { Button } from "@/components/ui/button";
import { demoteAdminUser, promoteAdminUser } from "@/lib/moderation-actions";

export function UserRoleActions({
  currentUserId,
  currentUserRole,
  userId,
  userRole,
}: {
  currentUserId: string;
  currentUserRole: string;
  userId: string;
  userRole: string;
}) {
  const canManage = currentUserRole === UserRole.SUPER_ADMIN && currentUserId !== userId;

  if (!canManage || userRole === UserRole.SUPER_ADMIN) {
    return <span className="text-xs text-slate-400">暂无角色动作</span>;
  }

  if (userRole === UserRole.ADMIN) {
    return (
      <form action={demoteAdminUser.bind(null, userId)}>
        <Button className="h-8 px-3 text-xs" type="submit" variant="ghost">
          降为用户
        </Button>
      </form>
    );
  }

  return (
    <form action={promoteAdminUser.bind(null, userId)}>
      <Button className="h-8 px-3 text-xs" type="submit" variant="secondary">
        设为管理员
      </Button>
    </form>
  );
}
