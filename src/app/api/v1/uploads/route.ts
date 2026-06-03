import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiErrorCodes, apiSuccess } from "@/lib/api-contract";
import { AuthorizationError, requireUserSession } from "@/lib/auth-boundary";
import { createObjectUrl, createUploadUrl } from "@/lib/storage";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

const uploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  contentType: z
    .string()
    .trim()
    .refine((value) => value.startsWith("image/"), "Only image uploads are supported."),
  size: z.number().int().positive().max(MAX_IMAGE_SIZE),
});

function safeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

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
  const parsed = uploadRequestSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(apiErrorCodes.VALIDATION_ERROR, "Invalid upload request.", {
      status: 400,
      details: parsed.error.flatten().fieldErrors,
    });
  }

  // 上传 key 带用户 id，后续可以按用户清理孤儿对象或做配额统计。
  const key = `uploads/${session.user.id}/${Date.now()}-${safeFileName(parsed.data.fileName) || "image"}`;
  const uploadUrl = await createUploadUrl(key, parsed.data.contentType);

  return apiSuccess({
    key,
    uploadUrl,
    publicUrl: createObjectUrl(key),
    expiresIn: 300,
  });
}
