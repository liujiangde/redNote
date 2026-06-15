import type { NextConfig } from "next";

type ImageRemotePattern = NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]>[number];

const isProduction = process.env.NODE_ENV === "production";

function getStorageRemotePattern(): ImageRemotePattern | null {
  const endpoint = process.env.S3_ENDPOINT;

  if (!endpoint) {
    return null;
  }

  try {
    const url = new URL(endpoint);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return {
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
      protocol: url.protocol === "https:" ? "https" : "http",
    };
  } catch {
    return null;
  }
}

const storageRemotePattern = getStorageRemotePattern();

const nextConfig: NextConfig = {
  images: {
    // 本地 MinIO 和开发默认图允许跳过优化；生产环境启用 Next Image optimizer。
    unoptimized: !isProduction,
    remotePatterns: [
      // 本地发布流程会把 MinIO publicUrl 写入 note_images，开发期需要允许渲染。
      ...(isProduction
        ? []
        : [
            {
              protocol: "http" as const,
              hostname: "127.0.0.1",
              port: "9000",
            },
            {
              protocol: "http" as const,
              hostname: "localhost",
              port: "9000",
            },
          ]),
      ...(storageRemotePattern ? [storageRemotePattern] : []),
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
