import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

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
