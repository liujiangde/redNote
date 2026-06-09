import { apiError, apiErrorCodes, apiSuccess } from "@/lib/api-contract";
import { getApiSession } from "@/lib/api-session";
import { communityApiError } from "@/lib/community-api-response";
import { toggleUserFollow } from "@/lib/community-service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/v1/users/[handle]/follow">,
) {
  // POST /api/v1/users/:handle/follow 给移动端提供关注 toggle 入口。
  // 不能关注自己、目标用户不存在、频控命中等分支都由 service 返回明确业务错误。
  const session = await getApiSession();

  if (!session) {
    return apiError(apiErrorCodes.UNAUTHORIZED, "Authentication is required.", {
      status: 401,
    });
  }

  const { handle } = await context.params;
  const result = await toggleUserFollow({
    actor: session.user,
    handle,
  });

  if (!result.ok) {
    return communityApiError(result.error);
  }

  return apiSuccess({
    followerCount: result.data.followerCount,
    following: result.data.following,
    targetUser: {
      handle: result.data.targetUser.handle,
      id: result.data.targetUser.id,
      name: result.data.targetUser.name,
    },
  });
}
