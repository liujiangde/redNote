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

推荐使用 Docker 启动带 pgvector 的 PostgreSQL 16：

```bash
docker run --name rednote-postgres \
  -e POSTGRES_USER=rednote \
  -e POSTGRES_PASSWORD=rednote \
  -e POSTGRES_DB=rednote \
  -p 5432:5432 \
  -v rednote-postgres-data:/var/lib/postgresql/data \
  -d pgvector/pgvector:0.8.2-pg16
```

如果容器已经创建过，日常只需要启动它：

```bash
docker start rednote-postgres
```

验证数据库和 pgvector：

```bash
docker exec -it rednote-postgres psql -U rednote -d rednote \
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
docker start rednote-postgres
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

## Scripts

- `pnpm dev` 启动开发服务
- `pnpm lint` 运行 ESLint
- `pnpm typecheck` 生成 Prisma Client 并运行 TypeScript 检查
- `pnpm db:setup` 创建本地 `rednote` 数据库和用户
- `pnpm prisma:migrate` 执行 Prisma migration
- `pnpm storage:bucket` 创建 MinIO bucket
- `pnpm prisma:seed` 写入演示数据

## Current Status

当前项目已完成 M1 数据接入：Feed、搜索、笔记详情、用户主页和后台列表已切换到 Prisma 查询。开发环境数据库不可达时会临时回退到 `src/lib/mock-data.ts`，避免页面直接 500；数据库启动后自动使用真实数据。下一步优先接通登录、注册、发布和上传闭环。

## Project Shape

- `src/app/(site)` C 端页面：Feed、搜索、发布、笔记详情、用户主页
- `src/app/admin` 管理后台：数据看板、笔记、举报、用户
- `src/lib` 数据库、鉴权、缓存、对象存储、AI embedding、推荐评分
- `prisma/schema.prisma` 社区业务模型和 `note_embeddings`
- `prisma/migrations/000001_init` PostgreSQL + pgvector 初始迁移
