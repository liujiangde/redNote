import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// 所有业务查询统一复用这个 Prisma Client。页面、服务和 Route Handler 不要各自
// new PrismaClient，否则本地热更新和生产多实例都会更容易耗尽数据库连接。
// Next dev reloads modules often; keeping one Prisma client avoids exhausting
// local PostgreSQL connections during iterative development.
const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://rednote:rednote@localhost:5432/rednote?schema=public",
});

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
