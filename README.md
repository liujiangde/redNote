# RedNote Lite

RedNote Lite 是一个面向作品集和后续扩展的 C 端社区项目骨架：图文笔记、Feed、搜索、推荐、后台审核和本地全栈开发环境。

## Tech Stack

- Next.js 16 App Router
- React 19 + TypeScript
- Tailwind CSS 4
- Prisma 7 + PostgreSQL + pgvector
- Redis
- MinIO/S3
- NextAuth Credentials

## Documentation

- [项目说明](./docs/PROJECT_GUIDE.md)：路由、目录、数据模型、本地服务和关键环境变量。
- [后续开发计划](./docs/DEVELOPMENT_PLAN.md)：从当前骨架到可用社区产品的阶段拆分和验收标准。

## Local Services

推荐使用 Docker Compose 一次性启动 PostgreSQL 16 + pgvector、Redis、MinIO：

```bash
pnpm services:up
```

如果之前已经手动创建过占用 `5432` 的 `rednote-postgres` 容器，需要先停止它，再使用 Compose：

```bash
docker stop rednote-postgres
pnpm services:up
```

验证数据库和 pgvector：

```bash
docker compose exec postgres psql -U rednote -d rednote \
  -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT extversion FROM pg_extension WHERE extname = 'vector';"
```

也可以使用 Homebrew 服务：

```bash
brew install postgresql@16 pgvector redis minio
brew services start postgresql@16
brew services start redis
brew services start minio
```

如果 `postgresql@16` 不在 PATH，可临时执行：

```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
```

## First-Time Setup

首次拉取项目后执行：

```bash
pnpm install
pnpm services:up
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

如果使用 Homebrew PostgreSQL，需要先执行 `pnpm db:setup` 创建本地数据库和用户。Docker 方案在 `docker run` 时已经创建了 `rednote` 用户和数据库，不需要执行 `pnpm db:setup`。

如果后续接入 MinIO 图片上传，再执行：

```bash
pnpm storage:bucket
```

## Daily Startup

日常启动项目：

```bash
pnpm services:up
cd /Users/liujiang/Desktop/xieyun/rednote
pnpm dev
```

确认数据库连接：

```bash
node --input-type=module -e "import 'dotenv/config'; import pg from 'pg'; const c=new pg.Client({connectionString:process.env.DATABASE_URL}); await c.connect(); const r=await c.query(\"select current_database() as db, current_user as user\"); const e=await c.query(\"select extversion from pg_extension where extname='vector'\"); console.log({connected:true,...r.rows[0], pgvector:e.rows[0]?.extversion}); await c.end();"
```

默认开发地址：

- App: http://localhost:3000
- MinIO API: http://127.0.0.1:9000
- MinIO Console: http://127.0.0.1:9001

种子账号：

- 管理员：`admin@rednote.local` / `rednote123`
- 用户：`alan@rednote.local` / `rednote123`
admin@rednote.local / rednote123
alan@rednote.local / rednote123
taro@rednote.local / rednote123
nanqiao@rednote.local / rednote123
## Scripts

- `pnpm dev` 启动开发服务
- `pnpm services:up` 启动 PostgreSQL + pgvector、Redis、MinIO
- `pnpm services:down` 停止本地 Docker Compose 服务
- `pnpm services:logs` 查看本地服务日志
- `pnpm run ci` 运行 migration 审查、ESLint 和 TypeScript 检查
- `pnpm lint` 运行 ESLint
- `pnpm typecheck` 生成 Prisma Client 并运行 TypeScript 检查
- `pnpm migration:check` 检查 pgvector 相关危险 migration
- `pnpm db:setup` 创建本地 `rednote` 数据库和用户
- `pnpm prisma:migrate` 执行 Prisma migration
- `pnpm storage:bucket` 创建 MinIO bucket
- `pnpm prisma:seed` 写入演示数据

## Current Status

当前项目已完成 M1、M1.5、M2、M3 基础版和 M3.1 通知中心/评论区/互动风控/移动端互动 API 基础版：Feed、搜索、笔记详情、用户主页和后台列表已切换到 Prisma 查询；跨端 API contract、i18n 字典、权限边界、Docker Compose、migration 审查和 CI 已落地；登录、注册、发布、预签名上传和 `/publish`、`/admin` 权限保护已接通；点赞、收藏、一级评论、二级回复、一级评论分页、关注、通知写入、通知中心页面/API、未读数、标记已读、互动限流、目标冷却、重复评论保护和 `/api/v1` 互动写接口已接通。下一步继续 M3.1，优先补评论治理、高级风控和屏蔽能力。

## Project Shape

- `src/app/(site)` C 端页面：Feed、搜索、发布、笔记详情、用户主页、通知中心
- `src/app/admin` 管理后台：数据看板、笔记、举报、用户
- `src/app/api/v1` 跨端 API：Feed、搜索、图片预签名上传、点赞、收藏、评论、关注、通知列表和已读
- `src/lib` 数据库、鉴权、缓存、对象存储、AI embedding、推荐评分
- `src/lib/api-contract.ts` 跨端 API envelope、错误码和分页结构
- `src/lib/i18n.ts` 国际化字典和基础格式化
- `prisma/schema.prisma` 社区业务模型和 `note_embeddings`
- `prisma/migrations/000001_init` PostgreSQL + pgvector 初始迁移
