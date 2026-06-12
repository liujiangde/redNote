import type { NextRequest } from "next/server";

import { apiError, apiErrorCodes, apiSuccess } from "@/lib/api-contract";
import { AuthorizationError, requireUserSession } from "@/lib/auth-boundary";
import { createObjectUrl, createUploadUrl } from "@/lib/storage";
import { createUploadObjectKey, validateUploadRequest } from "@/lib/upload-policy";

export async function POST(request: NextRequest) {
  let session;

  try {
    session = await requireUserSession();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return apiError(apiErrorCodes.UNAUTHORIZED, error.message, { status: error.status });
    }

    throw error;
  }

  const body = await request.json().catch(() => null);
  const parsed = validateUploadRequest(body);

  if (!parsed.ok) {
    return apiError(apiErrorCodes.VALIDATION_ERROR, "Invalid upload request.", {
      status: 400,
      details: parsed.fieldErrors,
    });
  }

  // 上传 key 带用户 id，后续可以按用户清理孤儿对象或做配额统计。
  const key = createUploadObjectKey(session.user.id, parsed.data.fileName);
  const uploadUrl = await createUploadUrl(key, parsed.data.contentType);

  return apiSuccess({
    key,
    uploadUrl,
    publicUrl: createObjectUrl(key),
    expiresIn: 300,
  });
}
