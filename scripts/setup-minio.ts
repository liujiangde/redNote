import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

import { s3Client } from "../src/lib/storage";

const bucket = process.env.S3_BUCKET ?? "rednote-dev";

async function main() {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

