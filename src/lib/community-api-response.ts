import { apiError, apiErrorCodes } from "@/lib/api-contract";
import type { CommunityServiceError } from "@/lib/community-service";

export function communityApiError(error: CommunityServiceError) {
  // 服务层只表达业务失败类型，HTTP 状态码和 API error code 在 Route Handler 边界统一转换。
  // 这样 Web Server Action 可以继续静默处理重复提交，移动端则能拿到明确错误响应。
  switch (error.code) {
    case "NOT_FOUND":
      return apiError(apiErrorCodes.NOT_FOUND, error.message, {
        details: error.details,
        status: 404,
      });
    case "RATE_LIMITED":
      return apiError(apiErrorCodes.RATE_LIMITED, error.message, {
        details: error.details,
        status: 429,
      });
    case "VALIDATION_ERROR":
      return apiError(apiErrorCodes.VALIDATION_ERROR, error.message, {
        details: error.details,
        status: 400,
      });
  }
}
