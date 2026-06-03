import type { NextRequest } from "next/server";

import {
  apiError,
  apiErrorCodes,
  apiSuccess,
  createCursorPage,
  parseCursorPagination,
} from "@/lib/api-contract";
import { getHomeFeedNotes } from "@/lib/content-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // 移动端和 Web BFF 的 Feed API 预留入口：响应 envelope、错误码和分页结构
  // 已固定；真正的 cursor 推荐流会在 M4/M8 接入。
  const pagination = parseCursorPagination(request.nextUrl.searchParams);

  if (!pagination.ok) {
    return apiError(apiErrorCodes.VALIDATION_ERROR, "Invalid pagination parameters.", {
      status: 400,
      details: pagination.error,
    });
  }

  if (pagination.value.cursor) {
    return apiError(apiErrorCodes.BAD_REQUEST, "Cursor pagination is reserved for M4.", {
      status: 400,
    });
  }

  const notes = await getHomeFeedNotes({ limit: pagination.value.limit + 1 });

  return apiSuccess(
    createCursorPage(notes, {
      limit: pagination.value.limit,
      getCursor: (note) => note.id,
    }),
  );
}
