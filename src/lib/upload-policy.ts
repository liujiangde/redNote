export const MAX_UPLOAD_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_IMAGE_SIZE_MB = MAX_UPLOAD_IMAGE_SIZE_BYTES / 1024 / 1024;
export const allowedUploadImageContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export const uploadImageAccept = allowedUploadImageContentTypes.join(",");

type UploadRequest = {
  contentType: string;
  fileName: string;
  size: number;
};

type UploadValidationResult =
  | { ok: true; data: UploadRequest }
  | { ok: false; fieldErrors: Record<string, string[]> };

function addFieldError(
  fieldErrors: Record<string, string[]>,
  field: keyof UploadRequest,
  message: string,
) {
  fieldErrors[field] = [...(fieldErrors[field] ?? []), message];
}

export function isAllowedUploadImageContentType(contentType: string) {
  return allowedUploadImageContentTypes.includes(
    contentType.trim().toLowerCase() as (typeof allowedUploadImageContentTypes)[number],
  );
}

export function sanitizeUploadFileName(fileName: string) {
  const safeName = fileName
    .toLowerCase()
    .replace(/[/\\]+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+\./g, ".")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 120);

  return safeName || "image";
}

export function createUploadObjectKey(userId: string, fileName: string, timestamp = Date.now()) {
  return `uploads/${userId}/${timestamp}-${sanitizeUploadFileName(fileName)}`;
}

export function validateUploadRequest(input: unknown): UploadValidationResult {
  const fieldErrors: Record<string, string[]> = {};
  const value = typeof input === "object" && input !== null ? input : {};
  const request = value as Partial<Record<keyof UploadRequest, unknown>>;
  const fileName = typeof request.fileName === "string" ? request.fileName.trim() : "";
  const contentType =
    typeof request.contentType === "string" ? request.contentType.trim().toLowerCase() : "";
  const rawSize = request.size;
  let size: number | undefined;

  if (!fileName) {
    addFieldError(fieldErrors, "fileName", "File name is required.");
  } else if (fileName.length > 180) {
    addFieldError(fieldErrors, "fileName", "File name must be at most 180 characters.");
  }

  if (!contentType) {
    addFieldError(fieldErrors, "contentType", "Content type is required.");
  } else if (!isAllowedUploadImageContentType(contentType)) {
    addFieldError(fieldErrors, "contentType", "Only JPEG, PNG, WebP, and GIF images are supported.");
  }

  if (typeof rawSize !== "number" || !Number.isInteger(rawSize)) {
    addFieldError(fieldErrors, "size", "File size must be an integer.");
  } else if (rawSize <= 0) {
    addFieldError(fieldErrors, "size", "File size must be positive.");
  } else if (rawSize > MAX_UPLOAD_IMAGE_SIZE_BYTES) {
    addFieldError(fieldErrors, "size", `File size must be at most ${MAX_UPLOAD_IMAGE_SIZE_MB} MB.`);
  } else {
    size = rawSize;
  }

  if (Object.keys(fieldErrors).length) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      contentType,
      fileName,
      size: size ?? 0,
    },
  };
}
