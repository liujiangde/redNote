import { apiError, apiErrorCodes, apiSuccess } from "@/lib/api-contract";
import { getApiSession } from "@/lib/api-session";
import { communityApiError } from "@/lib/community-api-response";
import { toggleNoteLike } from "@/lib/community-service";
import { invalidateFeedCandidateCache } from "@/lib/content-data";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/v1/notes/[noteId]/like">,
) {
  // POST /api/v1/notes/:noteId/like 给移动端提供点赞 toggle 入口。
  // noteId 可以是笔记 id 或 slug，实际归属和发布状态在 service 层统一校验。
  const session = await getApiSession();

  if (!session) {
    return apiError(apiErrorCodes.UNAUTHORIZED, "Authentication is required.", {
      status: 401,
    });
  }

  const { noteId } = await context.params;
  const result = await toggleNoteLike({
    actor: session.user,
    noteIdOrSlug: noteId,
  });

  if (!result.ok) {
    return communityApiError(result.error);
  }

  await invalidateFeedCandidateCache();

  return apiSuccess({
    likeCount: result.data.likeCount,
    liked: result.data.liked,
    noteId: result.data.note.id,
    slug: result.data.note.slug,
  });
}
