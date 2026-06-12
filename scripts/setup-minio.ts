import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const bucket = process.env.S3_BUCKET ?? "rednote-dev";
const defaultCorsOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
];

function parseCorsOrigins() {
  const configured = process.env.S3_CORS_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured?.length ? configured : defaultCorsOrigins;
}

function isCorsNotImplemented(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = "Code" in error ? String(error.Code) : "";
  const status =
    "$metadata" in error &&
    typeof error.$metadata === "object" &&
    error.$metadata !== null &&
    "httpStatusCode" in error.$metadata
      ? Number(error.$metadata.httpStatusCode)
      : undefined;

  return code === "NotImplemented" || status === 501;
}

async function ensureBucket(client: S3Client) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

async function configureCors(client: S3Client) {
  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ["*"],
              AllowedMethods: ["GET", "HEAD", "PUT"],
              AllowedOrigins: parseCorsOrigins(),
              ExposeHeaders: ["ETag"],
              MaxAgeSeconds: 3000,
            },
          ],
        },
      }),
    );
  } catch (error) {
    if (isCorsNotImplemented(error)) {
      console.warn(
        "Bucket CORS API is not implemented by this S3 endpoint. Local MinIO uses MINIO_API_CORS_ALLOW_ORIGIN from docker-compose.yml.",
      );
      return;
    }

    throw error;
  }
}

async function main() {
  const { s3Client } = await import("../src/lib/storage");

  await ensureBucket(s3Client);
  await configureCors(s3Client);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
