import type { NextRequest } from "next/server";

import { apiError, apiErrorCodes, apiSuccess } from "@/lib/api-contract";
import { getApiSession } from "@/lib/api-session";
import { getSearchDiscovery } from "@/lib/content-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // 搜索发现 API 给 Web/App 共用：热搜、个人历史、输入建议和分类统计
  // 都在 content-data 里生成，Route Handler 只处理参数、鉴权上下文和 envelope。
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 8);

  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 20) {
    return apiError(apiErrorCodes.VALIDATION_ERROR, "Invalid discovery limit.", {
      status: 400,
    });
  }

  const session = await getApiSession();
  const discovery = await getSearchDiscovery({
    limit: rawLimit,
    query: request.nextUrl.searchParams.get("q") ?? undefined,
    viewerId: session?.user.id,
  });

  return apiSuccess(discovery);
}
