import type { NextRequest } from "next/server";

import {
  apiError,
  apiErrorCodes,
  apiSuccess,
  createCursorPage,
  parseCursorPagination,
} from "@/lib/api-contract";
import { getApiSession } from "@/lib/api-session";
import { recordSearchQuery, searchPublishedNotes } from "@/lib/content-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // 生活搜索 API 和 Web 搜索共用搜索读模型：
  // 这里只处理 API 参数和 envelope，关键词/语义混合召回与命中解释放在 content-data。
  const pagination = parseCursorPagination(request.nextUrl.searchParams);

  if (!pagination.ok) {
    return apiError(apiErrorCodes.VALIDATION_ERROR, "Invalid pagination parameters.", {
      status: 400,
      details: pagination.error,
    });
  }

  const session = await getApiSession();
  const query = request.nextUrl.searchParams.get("q") ?? undefined;

  await recordSearchQuery(query, session?.user.id);

  const notes = await searchPublishedNotes(query, {
    cursor: pagination.value.cursor,
    limit: pagination.value.limit + 1,
    viewerId: session?.user.id,
  });

  return apiSuccess(
    createCursorPage(notes, {
      limit: pagination.value.limit,
      getCursor: (note) => note.id,
    }),
  );
}
