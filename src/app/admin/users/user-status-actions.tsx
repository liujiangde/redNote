import { UserRole, UserStatus } from "@/generated/prisma/client";

import { Button } from "@/components/ui/button";
import { banAdminUser, unbanAdminUser } from "@/lib/moderation-actions";

export function UserStatusActions({
  currentUserId,
  currentUserRole,
  userId,
  userRole,
  userStatus,
}: {
  currentUserId: string;
  currentUserRole: string;
  userId: string;
  userRole: string;
  userStatus: string;
}) {
  const canManage =
    currentUserRole === UserRole.SUPER_ADMIN &&
    currentUserId !== userId &&
    userRole !== UserRole.SUPER_ADMIN;

  if (!canManage) {
    return <span className="text-xs text-slate-400">暂无封禁动作</span>;
  }

  if (userStatus === UserStatus.BANNED) {
    return (
      <form action={unbanAdminUser.bind(null, userId)}>
        <Button className="h-8 px-3 text-xs" type="submit" variant="secondary">
          解除封禁
        </Button>
      </form>
    );
  }

  return (
    <form action={banAdminUser.bind(null, userId)}>
      <Button className="h-8 px-3 text-xs" type="submit" variant="ghost">
        封禁账号
      </Button>
    </form>
  );
}
