import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiErrorCodes, apiSuccess } from "@/lib/api-contract";
import { getApiSession } from "@/lib/api-session";
import { communityApiError } from "@/lib/community-api-response";
import { commentSchema, createNoteComment } from "@/lib/community-service";

export const dynamic = "force-dynamic";

const commentRequestSchema = commentSchema.extend({
  parentId: z.string().trim().min(1).optional(),
});

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/v1/notes/[noteId]/comments">,
) {
  // POST /api/v1/notes/:noteId/comments 是移动端评论/回复写入口。
  // parentId 为空时创建一级评论；传入 parentId 时 service 会校验父评论归属和层级。
  // 敏感词、屏蔽关系、风控和通知都在 createNoteComment 中完成，这里不重复实现业务规则。
  const session = await getApiSession();

  if (!session) {
    return apiError(apiErrorCodes.UNAUTHORIZED, "Authentication is required.", {
      status: 401,
    });
  }

  // request.json() 解析失败时按 null 进入 zod 校验，统一返回 VALIDATION_ERROR。
  const parsed = commentRequestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return apiError(apiErrorCodes.VALIDATION_ERROR, "Invalid comment payload.", {
      details: parsed.error.flatten(),
      status: 400,
    });
  }

  const { noteId } = await context.params;
  const result = await createNoteComment({
    actor: session.user,
    content: parsed.data.content,
    noteIdOrSlug: noteId,
    parentId: parsed.data.parentId,
  });

  if (!result.ok) {
    return communityApiError(result.error);
  }

  return apiSuccess(
    {
      comment: {
        content: result.data.comment.content,
        createdAt: result.data.comment.createdAt.toISOString(),
        id: result.data.comment.id,
        parentId: result.data.comment.parentId,
      },
      commentCount: result.data.commentCount,
      noteId: result.data.note.id,
      slug: result.data.note.slug,
    },
    {
      status: 201,
    },
  );
}
