import { apiError, apiErrorCodes, apiSuccess } from "@/lib/api-contract";
import { getApiSession } from "@/lib/api-session";
import { communityApiError } from "@/lib/community-api-response";
import { toggleNoteFavorite } from "@/lib/community-service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/v1/notes/[noteId]/favorite">,
) {
  // POST /api/v1/notes/:noteId/favorite 给移动端提供收藏 toggle 入口。
  // 返回 favorited 和最新计数，客户端可直接刷新按钮状态和角标。
  const session = await getApiSession();

  if (!session) {
    return apiError(apiErrorCodes.UNAUTHORIZED, "Authentication is required.", {
      status: 401,
    });
  }

  const { noteId } = await context.params;
  const result = await toggleNoteFavorite({
    actor: session.user,
    noteIdOrSlug: noteId,
  });

  if (!result.ok) {
    return communityApiError(result.error);
  }

  return apiSuccess({
    favoriteCount: result.data.favoriteCount,
    favorited: result.data.favorited,
    noteId: result.data.note.id,
    slug: result.data.note.slug,
  });
}
