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

本机开发默认使用 Homebrew 服务，不依赖 Docker。

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

## Setup

```bash
pnpm install
pnpm db:setup
pnpm prisma:migrate
pnpm storage:bucket
pnpm prisma:seed
pnpm dev
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

当前项目是 MVP 骨架：数据库模型、seed、本地服务脚本、前台页面和后台页面已经就位，但多数页面仍使用 `src/lib/mock-data.ts`。下一步优先把 Feed、详情页、用户页、后台列表切换到 Prisma 查询，再接通登录、注册、发布和上传闭环。

## Project Shape

- `src/app/(site)` C 端页面：Feed、搜索、发布、笔记详情、用户主页
- `src/app/admin` 管理后台：数据看板、笔记、举报、用户
- `src/lib` 数据库、鉴权、缓存、对象存储、AI embedding、推荐评分
- `prisma/schema.prisma` 社区业务模型和 `note_embeddings`
- `prisma/migrations/000001_init` PostgreSQL + pgvector 初始迁移
