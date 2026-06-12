import assert from "node:assert/strict";
import test from "node:test";

import {
  createUploadObjectKey,
  MAX_UPLOAD_IMAGE_SIZE_BYTES,
  sanitizeUploadFileName,
  validateUploadRequest,
} from "./upload-policy";

test("validateUploadRequest accepts supported image metadata", () => {
  const result = validateUploadRequest({
    contentType: " image/PNG ",
    fileName: " Weekend.png ",
    size: 1024,
  });

  assert.deepEqual(result, {
    data: {
      contentType: "image/png",
      fileName: "Weekend.png",
      size: 1024,
    },
    ok: true,
  });
});

test("validateUploadRequest rejects unsafe image types", () => {
  const result = validateUploadRequest({
    contentType: "image/svg+xml",
    fileName: "icon.svg",
    size: 1024,
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.deepEqual(result.fieldErrors.contentType, [
      "Only JPEG, PNG, WebP, and GIF images are supported.",
    ]);
  }
});

test("validateUploadRequest rejects oversized files and empty names", () => {
  const result = validateUploadRequest({
    contentType: "image/jpeg",
    fileName: "  ",
    size: MAX_UPLOAD_IMAGE_SIZE_BYTES + 1,
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.deepEqual(result.fieldErrors.fileName, ["File name is required."]);
    assert.deepEqual(result.fieldErrors.size, ["File size must be at most 8 MB."]);
  }
});

test("sanitizeUploadFileName strips path separators and unsafe characters", () => {
  assert.equal(sanitizeUploadFileName("../Summer Trip!!.JPG"), "summer-trip.jpg");
  assert.equal(sanitizeUploadFileName("照片"), "image");
});

test("createUploadObjectKey scopes uploads by user and timestamp", () => {
  assert.equal(
    createUploadObjectKey("user_123", "../Summer Trip!!.JPG", 1710000000000),
    "uploads/user_123/1710000000000-summer-trip.jpg",
  );
});
