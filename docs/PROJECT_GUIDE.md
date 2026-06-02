# RedNote 项目说明

本文档用于帮助后续开发者快速理解当前项目。更细的阶段计划见 [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md)。

## 项目定位

RedNote Lite 是一个小红书风格的内容社区项目骨架，覆盖前台内容消费、创作者发布、AI 搜索推荐和后台治理。当前重点是把产品主链路跑通，并为后续国际化、多地区运营和移动端 App 做好 API 与数据结构准备。

## 技术栈

- Next.js 16 App Router
- React 19 + TypeScript
- Tailwind CSS 4
- Prisma 7 + PostgreSQL + pgvector
- Redis
- MinIO/S3 兼容对象存储
- NextAuth Credentials
- OpenAI embeddings，可在本地无 API key 时使用确定性 fallback

## 后续扩展方向

- 国际化：优先支持 `zh-CN` 和 `en-US`，将页面文案、错误提示、后台状态文案抽出为统一字典。
- 移动端 App：建议采用 React Native + Expo，复用 TypeScript 类型、API contract、认证和上传协议。
- 跨端 API：Web 页面当前以 Server Components 直接读数据为主；移动端接入前需要补齐稳定的 Route Handler 或 BFF API。
- 跨端通知：站内通知、邮件和移动 Push 应共享通知模板和事件来源。
- 跨端埋点：Web/App 统一事件名和属性，方便后续分析推荐、搜索和发布转化。

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

本地开发推荐使用 Docker 启动数据库，也可以使用 Homebrew 安装服务：

- PostgreSQL 16：主数据库。
- pgvector：语义向量扩展。
- Redis：缓存和后续限流、推荐候选缓存。
- MinIO：S3 兼容对象存储。

默认连接信息在代码中有开发 fallback，生产环境必须使用环境变量覆盖。

## 启动项目

首次启动：

1. 启动 PostgreSQL 16 + pgvector：

   ```bash
   docker run --name rednote-postgres \
     -e POSTGRES_USER=rednote \
     -e POSTGRES_PASSWORD=rednote \
     -e POSTGRES_DB=rednote \
     -p 5432:5432 \
     -v rednote-postgres-data:/var/lib/postgresql/data \
     -d pgvector/pgvector:0.8.2-pg16
   ```

2. 安装依赖：

   ```bash
   pnpm install
   ```

3. 执行数据库迁移和 seed：

   ```bash
   pnpm prisma:migrate
   pnpm prisma:seed
   ```

4. 启动 Next.js：

   ```bash
   pnpm dev
   ```

日常启动：

```bash
docker start rednote-postgres
cd /Users/liujiang/Desktop/xieyun/rednote
pnpm dev
```

确认数据库连接：

```bash
node --input-type=module -e "import 'dotenv/config'; import pg from 'pg'; const c=new pg.Client({connectionString:process.env.DATABASE_URL}); await c.connect(); const r=await c.query(\"select current_database() as db, current_user as user\"); const e=await c.query(\"select extversion from pg_extension where extname='vector'\"); console.log({connected:true,...r.rows[0], pgvector:e.rows[0]?.extversion}); await c.end();"
```

如果数据库端口不可达，页面会临时回退到 fixture 数据，但这只用于避免开发期 500。要验证真实数据链路，必须先启动 PostgreSQL 容器。

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
2. 准备本地服务：PostgreSQL、pgvector，后续上传功能需要 Redis、MinIO。
3. Docker 数据库首次创建后直接执行迁移；Homebrew PostgreSQL 需要先运行 `pnpm db:setup`。
4. 执行迁移：`pnpm prisma:migrate`。
5. 写入演示数据：`pnpm prisma:seed`。
6. 启动应用：`pnpm dev`。
7. 提交前运行：`pnpm lint` 和 `pnpm typecheck`。

## 当前数据流

当前页面主流程已经切换到 `src/lib/content-data.ts`：

- Feed、搜索、详情页、用户主页读取 Prisma 数据。
- 后台指标、趋势标签、举报队列、笔记列表、用户列表读取真实表。

`src/lib/mock-data.ts` 作为 UI fixture 和开发兜底保留：当本地数据库端口不可达时，`content-data.ts` 会临时返回 fixture 数据，避免页面直接 500。数据库启动后会自动使用真实 Prisma 查询。后续新增页面应优先复用或扩展 `content-data.ts` 中的查询函数，避免页面组件直接堆叠复杂 Prisma include。

## 国际化规划

- 路由层建议预留 locale 段，例如 `/zh-CN`、`/en-US`。
- 静态文案不要继续硬编码到页面组件，后续应迁移到 message dictionary。
- 日期、数字、热度、粉丝数、相对时间统一走 locale-aware formatter。
- 内容模型后续需要补充语言字段或翻译表，支持同一笔记多语言展示或按语言过滤。
- SEO 需要为多语言页面补充 metadata、`hreflang` 和 sitemap 策略。

## 移动端 App 规划

- 技术路线建议：React Native + Expo。
- 后端需要补齐移动端可调用 API：Feed、详情、搜索、登录、注册、发布、上传、互动、通知。
- 移动端发布能力要支持图片选择、压缩、上传进度、失败重试和草稿本地保存。
- 认证不能依赖 Web-only session，需要明确 token 或移动端 session 策略。
- App 发布后 API 要保持向后兼容，数据库 migration 和接口变更需要版本意识。

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
