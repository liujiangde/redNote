import type { NextRequest } from "next/server";

import {
  apiError,
  apiErrorCodes,
  apiSuccess,
  createCursorPage,
  parseCursorPagination,
} from "@/lib/api-contract";
import { getApiSession } from "@/lib/api-session";
import { getHomeFeedNotes } from "@/lib/content-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // 移动端和 Web BFF 共用 Feed 数据入口：
  // 这里负责解析跨端 API 的 cursor/limit，推荐排序、屏蔽过滤和兜底数据由 content-data 处理。
  const pagination = parseCursorPagination(request.nextUrl.searchParams);

  if (!pagination.ok) {
    return apiError(apiErrorCodes.VALIDATION_ERROR, "Invalid pagination parameters.", {
      status: 400,
      details: pagination.error,
    });
  }

  const session = await getApiSession();
  const notes = await getHomeFeedNotes({
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
