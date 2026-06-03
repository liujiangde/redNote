import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const migrationsDir = path.join(process.cwd(), "prisma", "migrations");

const riskyPatterns = [
  {
    pattern: /DROP\s+INDEX\b[\s\S]*(note_embeddings|embedding|vector)/i,
    reason: "可能删除 pgvector 或 note_embeddings 相关索引",
  },
  {
    pattern: /DROP\s+TABLE\b[\s\S]*note_embeddings/i,
    reason: "可能删除 note_embeddings 表",
  },
  {
    pattern: /DROP\s+EXTENSION\b[\s\S]*vector/i,
    reason: "可能删除 pgvector extension",
  },
];

function getMigrationSqlFiles() {
  if (!existsSync(migrationsDir)) {
    return [];
  }

  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(migrationsDir, entry.name, "migration.sql"))
    .filter((migrationPath) => existsSync(migrationPath));
}

const violations = [];

// Migration 审查脚本用于 CI 和本地提交前检查。Prisma 对 Unsupported vector
// 索引的理解有限，所以涉及 pgvector 的破坏性 SQL 必须人工确认后再提交。
for (const migrationPath of getMigrationSqlFiles()) {
  const sql = readFileSync(migrationPath, "utf8");

  for (const { pattern, reason } of riskyPatterns) {
    if (pattern.test(sql)) {
      violations.push({
        file: path.relative(process.cwd(), migrationPath),
        reason,
      });
    }
  }
}

if (violations.length) {
  console.error("检测到需要人工确认的 migration：");

  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.reason}`);
  }

  process.exit(1);
}

console.log("Migration safety check passed.");
