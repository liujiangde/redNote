import type { NextRequest } from "next/server";

import {
  apiError,
  apiErrorCodes,
  apiSuccess,
  createCursorPage,
  parseCursorPagination,
} from "@/lib/api-contract";
import { getApiSession } from "@/lib/api-session";
import { searchPublishedNotes } from "@/lib/content-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // 生活搜索 API 预留入口：先复用 Web 关键词搜索，后续可替换为全文索引、
  // pgvector 或独立搜索服务，同时保持响应结构不变。
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

  const session = await getApiSession();
  const notes = await searchPublishedNotes(request.nextUrl.searchParams.get("q") ?? undefined, {
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
