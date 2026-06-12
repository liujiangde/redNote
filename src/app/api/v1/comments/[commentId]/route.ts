import type { NextRequest } from "next/server";

import { apiError, apiErrorCodes, apiSuccess } from "@/lib/api-contract";
import { getApiSession } from "@/lib/api-session";
import { communityApiError } from "@/lib/community-api-response";
import { commentReportSchema, deleteComment, reportComment } from "@/lib/community-service";
import { invalidateFeedCandidateCache } from "@/lib/content-data";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/v1/comments/[commentId]">,
) {
  // DELETE /api/v1/comments/:commentId 只允许评论作者删除自己的可见评论。
  // 删除是软删除，公开读链路过滤非 VISIBLE 评论，后台仍能保留审计线索。
  const session = await getApiSession();

  if (!session) {
    return apiError(apiErrorCodes.UNAUTHORIZED, "Authentication is required.", {
      status: 401,
    });
  }

  const { commentId } = await context.params;
  const result = await deleteComment({
    actor: session.user,
    commentId,
  });

  if (!result.ok) {
    return communityApiError(result.error);
  }

  await invalidateFeedCandidateCache();

  return apiSuccess({
    commentId: result.data.commentId,
    deleted: true,
    noteId: result.data.note.id,
    slug: result.data.note.slug,
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/v1/comments/[commentId]">,
) {
  // POST /api/v1/comments/:commentId 创建评论举报，供移动端复用 Web 治理规则。
  // 举报不会直接隐藏评论，管理员在 /admin/reports 决定 review/reject/hide。
  const session = await getApiSession();

  if (!session) {
    return apiError(apiErrorCodes.UNAUTHORIZED, "Authentication is required.", {
      status: 401,
    });
  }

  const parsed = commentReportSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return apiError(apiErrorCodes.VALIDATION_ERROR, "Invalid report payload.", {
      details: parsed.error.flatten(),
      status: 400,
    });
  }

  const { commentId } = await context.params;
  const result = await reportComment({
    actor: session.user,
    commentId,
    detail: parsed.data.detail,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    return communityApiError(result.error);
  }

  return apiSuccess(
    {
      report: result.data.report,
    },
    {
      status: 201,
    },
  );
}
