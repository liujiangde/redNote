import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// 上传链路的服务端边界：
// 客户端只拿短期预签名 URL 直传对象存储，服务端负责签名、校验 key/contentType，
// 上传完成后再把图片元数据写入 note_images，避免把 S3/MinIO 密钥暴露到浏览器。
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
  // 当前只生成 PutObject URL。M2 接入真实发布时，需要在调用前校验文件类型、
  // 大小、归属用户和对象 key 前缀，并在上传完成后处理孤儿对象清理。
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET ?? "rednote-dev",
    Key: key,
    ContentType: contentType,
  });

  // The client uploads directly to MinIO/S3 with this short-lived URL; object
  // metadata should still be persisted by the server after upload succeeds.
  return getSignedUrl(s3Client, command, { expiresIn: 300 });
}
