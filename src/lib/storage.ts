import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const s3Client = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "rednote",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "rednote-secret",
  },
});

export async function createUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET ?? "rednote-dev",
    Key: key,
    ContentType: contentType,
  });

  // The client uploads directly to MinIO/S3 with this short-lived URL; object
  // metadata should still be persisted by the server after upload succeeds.
  return getSignedUrl(s3Client, command, { expiresIn: 300 });
}
