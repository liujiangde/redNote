# RedNote 项目说明

本文档用于帮助后续开发者快速理解当前项目。更细的阶段计划见 [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md)。

## 项目定位

RedNote Lite 是一个小红书风格的内容社区项目骨架，覆盖前台内容消费、创作者发布、AI 搜索推荐和后台治理。当前重点是把产品主链路跑通，而不是复制完整商业平台的全部能力。

## 技术栈

- Next.js 16 App Router
- React 19 + TypeScript
- Tailwind CSS 4
- Prisma 7 + PostgreSQL + pgvector
- Redis
- MinIO/S3 兼容对象存储
- NextAuth Credentials
- OpenAI embeddings，可在本地无 API key 时使用确定性 fallback

## 路由结构

| 路由 | 文件 | 说明 |
| --- | --- | --- |
| `/` | `src/app/(site)/page.tsx` | 推荐 Feed 和趋势话题 |
| `/search` | `src/app/(site)/search/page.tsx` | 搜索结果页，目前展示 mock 数据 |
| `/publish` | `src/app/(site)/publish/page.tsx` | 发布表单骨架 |
| `/notes/[noteId]` | `src/app/(site)/notes/[noteId]/page.tsx` | 笔记详情页 |
| `/users/[handle]` | `src/app/(site)/users/[handle]/page.tsx` | 用户主页 |
| `/login` | `src/app/(auth)/login/page.tsx` | 登录页 UI |
| `/register` | `src/app/(auth)/register/page.tsx` | 注册页 UI |
| `/admin` | `src/app/admin/page.tsx` | 管理后台数据看板 |
| `/admin/notes` | `src/app/admin/notes/page.tsx` | 笔记管理 |
| `/admin/reports` | `src/app/admin/reports/page.tsx` | 举报管理 |
| `/admin/users` | `src/app/admin/users/page.tsx` | 用户管理 |
| `/api/auth/[...nextauth]` | `src/app/api/auth/[...nextauth]/route.ts` | NextAuth handler |
| `/api/health` | `src/app/api/health/route.ts` | 环境状态检查 |

`(site)` 和 `(auth)` 是 App Router route group，不会出现在 URL 中。页面和布局默认是 Server Components，需要浏览器状态或事件处理时再添加 `"use client"`。

## 目录说明

| 路径 | 说明 |
| --- | --- |
| `src/app` | App Router 页面、布局和 Route Handlers |
| `src/components` | 前台、后台和基础 UI 组件 |
| `src/lib` | 数据库、鉴权、缓存、对象存储、推荐、AI embedding 等共享逻辑 |
| `src/types` | NextAuth 类型扩展 |
| `prisma/schema.prisma` | 业务数据模型 |
| `prisma/migrations` | 数据库迁移 |
| `prisma/seed.ts` | 演示数据和 pgvector seed |
| `scripts` | 本地数据库和对象存储初始化脚本 |
| `docs` | 开发计划和项目说明 |

## 数据模型概览

核心模型包括：

- `User`：账号、角色、资料、关注关系入口。
- `Note`：图文笔记主体，包含状态、浏览量、发布时间。
- `NoteImage`：笔记图片，后续由 MinIO/S3 上传结果写入。
- `Tag` 和 `NoteTag`：标签和笔记标签关系。
- `Like`、`Favorite`、`Comment`、`Follow`：社区互动。
- `Notification`：站内通知。
- `Report`：内容、评论、用户举报。
- `AdminAuditLog`：后台操作审计。
- `NoteEmbedding`：笔记语义向量，用于语义搜索和推荐。

## 本地服务

本地开发默认使用 Homebrew 安装的服务：

- PostgreSQL 16：主数据库。
- pgvector：语义向量扩展。
- Redis：缓存和后续限流、推荐候选缓存。
- MinIO：S3 兼容对象存储。

默认连接信息在代码中有开发 fallback，生产环境必须使用环境变量覆盖。

## 关键环境变量

| 变量 | 用途 | 本地默认 |
| --- | --- | --- |
| `DATABASE_URL` | Prisma/Postgres 连接 | `postgresql://rednote:rednote@localhost:5432/rednote?schema=public` |
| `POSTGRES_ADMIN_URL` | 初始化数据库和角色 | 当前系统用户连接本地 `postgres` 库 |
| `REDIS_URL` | Redis 连接 | `redis://localhost:6379` |
| `S3_REGION` | S3 region | `us-east-1` |
| `S3_ENDPOINT` | MinIO/S3 endpoint | 无，需要本地配置 |
| `S3_FORCE_PATH_STYLE` | MinIO 通常需要 path-style | 非 `"false"` 时启用 |
| `S3_ACCESS_KEY_ID` | 对象存储 access key | `rednote` |
| `S3_SECRET_ACCESS_KEY` | 对象存储 secret | `rednote-secret` |
| `S3_BUCKET` | 上传 bucket | `rednote-dev` |
| `OPENAI_API_KEY` | 真实 embedding 调用 | 无 |
| `OPENAI_EMBEDDING_MODEL` | embedding 模型 | `text-embedding-3-small` |
| `NEXTAUTH_SECRET` | NextAuth 会话签名 | 生产环境必须设置 |
| `NEXTAUTH_URL` | NextAuth 回调 URL | 本地通常是 `http://localhost:3000` |

## 开发流程

1. 安装依赖：`pnpm install`。
2. 准备本地服务：PostgreSQL、pgvector、Redis、MinIO。
3. 创建本地数据库和账号：`pnpm db:setup`。
4. 执行迁移：`pnpm prisma:migrate`。
5. 创建对象存储 bucket：`pnpm storage:bucket`。
6. 写入演示数据：`pnpm prisma:seed`。
7. 启动应用：`pnpm dev`。
8. 提交前运行：`pnpm lint` 和 `pnpm typecheck`。

## 当前数据流

当前页面多处仍使用 `src/lib/mock-data.ts`：

- Feed、搜索、详情页、用户主页使用 `demoNotes`。
- 后台指标、趋势标签、举报队列使用 mock 数组。

数据库和 seed 已经准备好，后续应逐步把这些页面切到 Prisma 查询。迁移时建议先保留 mock 数据作为 UI fixture，再新增真实数据服务函数，最后删除页面对 mock 的直接依赖。

## AI 搜索和推荐

`src/lib/ai/embeddings.ts` 负责生成向量。本地没有 `OPENAI_API_KEY` 时会返回确定性伪向量，目的是让 seed 和开发流程不被外部服务阻塞，不代表真实语义效果。

`src/lib/recommendation.ts` 保存第一版推荐权重：

- 语义相似度：0.35
- 标签匹配：0.20
- 互动：0.20
- 新鲜度：0.15
- 关注作者：0.10

后续推荐服务应把每个信号归一化到 0 到 1，并保留排序解释，方便调试和后台观察。

## 后台治理

后台当前是演示 UI，目标能力包括：

- 内容审核和笔记状态流转。
- 举报处理和处理记录。
- 用户角色、封禁和风险状态管理。
- 审计日志追踪所有管理员修改行为。

任何后台写操作都应同步写入 `AdminAuditLog`。
