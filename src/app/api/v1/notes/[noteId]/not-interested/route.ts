import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiErrorCodes, apiSuccess } from "@/lib/api-contract";
import { getApiSession } from "@/lib/api-session";
import { communityApiError } from "@/lib/community-api-response";
import { dismissNote } from "@/lib/community-service";

export const dynamic = "force-dynamic";

const notInterestedSchema = z.object({
  reason: z.string().trim().max(120).optional(),
});

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/v1/notes/[noteId]/not-interested">,
) {
  // POST /api/v1/notes/:noteId/not-interested 记录用户负反馈。
  // 它不会改动笔记本身，只影响该用户后续 Feed/Search/详情读取。
  // 这里作为移动端/BFF 边界只做认证、JSON 校验和响应包装，业务写入交给 dismissNote。
  const session = await getApiSession();

  if (!session) {
    return apiError(apiErrorCodes.UNAUTHORIZED, "Authentication is required.", {
      status: 401,
    });
  }

  const parsed = notInterestedSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    // reason 是可选字段，但一旦传入就限制长度，避免负反馈表被大文本污染。
    return apiError(apiErrorCodes.VALIDATION_ERROR, "Invalid not-interested payload.", {
      details: parsed.error.flatten(),
      status: 400,
    });
  }

  const { noteId } = await context.params;
  const result = await dismissNote({
    actor: session.user,
    noteIdOrSlug: noteId,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    return communityApiError(result.error);
  }

  return apiSuccess({
    dismissed: result.data.dismissed,
    noteId: result.data.note.id,
    slug: result.data.note.slug,
  });
}
