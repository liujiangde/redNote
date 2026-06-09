import { apiError, apiErrorCodes, apiSuccess } from "@/lib/api-contract";
import { getApiSession } from "@/lib/api-session";
import { communityApiError } from "@/lib/community-api-response";
import { toggleUserBlock } from "@/lib/community-service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/v1/users/[handle]/block">,
) {
  // POST /api/v1/users/:handle/block 是屏蔽 toggle：未屏蔽则屏蔽，已屏蔽则取消屏蔽。
  // 创建屏蔽时会自动切断双方关注关系，避免社交图谱继续连接。
  // 这个接口不接受 body，目标用户完全由 URL handle 决定，避免客户端伪造 blockedId。
  const session = await getApiSession();

  if (!session) {
    return apiError(apiErrorCodes.UNAUTHORIZED, "Authentication is required.", {
      status: 401,
    });
  }

  const { handle } = await context.params;
  const result = await toggleUserBlock({
    actor: session.user,
    handle,
  });

  if (!result.ok) {
    return communityApiError(result.error);
  }

  return apiSuccess({
    blocked: result.data.blocked,
    targetUser: {
      handle: result.data.targetUser.handle,
      id: result.data.targetUser.id,
      name: result.data.targetUser.name,
    },
  });
}
