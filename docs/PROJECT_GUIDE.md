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
- 平台化能力：如果目标是接近小红书级 App，还需要逐步补齐视频、直播、电商、私信、创作者工具、商家后台、风控、合规和数据平台。

## 小红书级 App 能力缺口

当前项目更接近“小红书 Lite”内容社区骨架。要演进成完整 App，需要在现有 M1-M9 基础上继续补这些能力：

- 内容发现：推荐瀑布流、关注流、同城/附近、话题、地点、榜单、运营活动和专题页。
- 原生 App 体验：底部导航、沉浸式详情、评论抽屉、下拉刷新、无限滚动、缓存、弱网恢复。
- 创作工具：多图、视频、封面、裁剪、滤镜、贴纸、文字、话题、地点、草稿箱、自动保存、上传进度。
- 生活搜索：搜索建议、热搜、历史搜索、图文/视频/用户/话题/商品分栏、个性化推荐、相似笔记推荐。
- 社交消息：私信、会话、已读未读、@ 提及、分享、收藏夹分组、拉黑、屏蔽、不感兴趣。
- 创作者运营：创作者中心、内容表现分析、粉丝增长、发布转化、达人认证、创作者等级和商业合作入口。
- 电商交易：商品卡片、商品详情、店铺、购物车、订单、支付、退款、售后、优惠券、佣金结算。
- 直播和活动：直播间、弹幕/评论、直播商品橱窗、直播预约、开播通知、专题页、榜单、任务活动。
- 平台治理：文本/图片/视频审核、举报申诉、处罚记录、账号风控、刷量识别、设备/IP 风险。
- 合规和安全：隐私权限、账号注销、数据导出、未成年人保护、内容分级、审计日志。
- 数据基础设施：曝光、点击、停留、完播、搜索、交易、审核事件；Feature Flag、A/B 测试、Crash 和性能监控。

这些能力不适合一次性塞进当前 MVP。推荐顺序是先完成 M1.5-M6，把认证、发布、互动、搜索推荐、治理、测试和 API contract 做稳，再推进 M10-M12 的平台化能力。

对标时要遵守两个边界：只参考公开产品能力和业务结构，不复刻品牌、UI 资产、专有算法和具体运营内容；先把社区可信度、创作体验和搜索发现做稳，再做电商、直播和复杂商业化。

公开参考来源：

- [小红书 App Store 页面](https://apps.apple.com/cn/app/%E5%B0%8F%E7%BA%A2%E4%B9%A6-%E4%B8%96%E7%95%8C%E6%9D%AF%E7%9B%B4%E6%92%AD/id741292507)：生活兴趣社区、发现、同好互动、记录分享、好物和线下活动。
- [小红书创作服务平台](https://creator.xiaohongshu.com/)：创作者发布、数据分析和商业变现。
- [小红书本地生活](https://life.xiaohongshu.com/zhaoshang)：本地生活、商品笔记、探店合作、直播带货和商家经营工具。
- [小红书蒲公英](https://pgy.xiaohongshu.com/)：博主合作、种草转化数据和品牌商销合作。
- [小红书灵犀](https://idea.xiaohongshu.com/)：内容洞察、人群洞察、趋势分析和生意度量。

## 近期查漏补缺

M1 已把主要页面切到 Prisma 数据源。进入 M2 前建议先完成 M1.5，避免登录、发布、上传、互动和移动端 API 后续返工：

- 抽出 Web/App 共用 API contract，统一 DTO、错误码、分页格式和版本策略。
- 明确 Web session、移动端 token/session、管理员 RBAC 的边界。
- 建立 message dictionary 和 locale-aware formatter，新增页面文案不要继续硬编码到组件。
- 统一本地服务启动方式，后续补 `docker-compose.yml` 或 `pnpm services:up` 同时启动 PostgreSQL + pgvector、Redis、MinIO。
- 为上传链路补齐文件类型、大小、尺寸校验，上传完成后写入 `note_images`，并规划孤儿对象清理。
- 为 Feed、搜索、后台列表补稳定分页和索引检查。
- 建立最小 CI，至少运行 `pnpm lint` 和 `pnpm typecheck`。
- 审查 pgvector 相关 migration，涉及 `note_embeddings`、向量索引或 `DROP INDEX` 时必须人工确认。
- 高并发能力先做架构预留：服务分层、统一 API contract、列表分页、计数事件入口、上传边界和权限边界现在要定好；读写分离、分库分表、复杂缓存、队列和 CDN 优化可以等到 M6 以后结合压测数据推进。

M1.5 基础版已经落地：

- `src/lib/api-contract.ts`：统一 API envelope、错误码和 cursor pagination 结构。
- `src/app/api/v1/feed/route.ts`、`src/app/api/v1/search/route.ts`：移动端/BFF API 预留入口。
- `src/lib/auth-boundary.ts`：用户和管理员权限边界。
- `src/lib/i18n.ts`：`zh-CN`、`en-US` message dictionary 和基础 formatter。
- `docker-compose.yml`、`pnpm services:up`：PostgreSQL + pgvector、Redis、MinIO 一组命令启动。
- `scripts/check-migrations.ts`、`pnpm migration:check`：pgvector 相关破坏性 migration 审查。
- `.github/workflows/ci.yml`：GitHub Actions 运行 migration check、lint、typecheck。

## 并发和容量策略

当前项目是 MVP/小规模试用状态，不能按小红书级并发设计。开发阶段的策略是先避免扩展硬伤，再基于压测和真实流量做重型优化。

现在必须坚持：

- 页面和组件不要直接堆复杂 Prisma 查询，优先通过 `src/lib` 服务层或未来 Route Handler/BFF API 获取数据。
- Feed、搜索、用户主页、后台列表默认要有分页能力，避免后续数据量增长后重写接口。
- 浏览量、曝光、点赞、收藏、搜索日志等计数和行为事件要通过统一入口写入，未来可替换为 Redis 聚合或队列异步消费。
- 搜索 UI 和接口不要绑定单一查询实现，后续可以从关键词检索切换到全文索引、pgvector 或独立搜索服务。
- 图片、视频和附件坚持对象存储/预签名 URL，不把上传资源写进应用本地目录。
- 权限判断集中在服务/API 边界，避免后续加缓存或移动端 API 时出现越权风险。

可以后置到 M6/M9/M12 再做：

- Redis 大规模缓存策略、PgBouncer、读写分离、队列系统、CDN 优化、分布式部署、A/B 实验和必要时的分库分表。
- 生产压测和容量评估应使用 `pnpm build && pnpm start` 的生产构建，而不是 `pnpm dev`。
- 容量优化要基于 RPS、P95/P99、错误率、数据库连接数、慢查询、缓存命中率和队列积压数据推进。

## 路由结构

| 路由 | 文件 | 说明 |
| --- | --- | --- |
| `/` | `src/app/(site)/page.tsx` | 推荐 Feed 和趋势话题，Feed 已接入轻量推荐排序 |
| `/search` | `src/app/(site)/search/page.tsx` | 搜索结果页，展示关键词/语义召回后的命中原因 |
| `/publish` | `src/app/(site)/publish/page.tsx` | 发布表单骨架 |
| `/notes/[noteId]` | `src/app/(site)/notes/[noteId]/page.tsx` | 笔记详情页，支持点赞、收藏、评论、回复、删除和举报 |
| `/users/[handle]` | `src/app/(site)/users/[handle]/page.tsx` | 用户主页，支持关注和取消关注 |
| `/notifications` | `src/app/(site)/notifications/page.tsx` | 通知中心，支持未读数、筛选、分页和标记已读 |
| `/login` | `src/app/(auth)/login/page.tsx` | 登录页 UI |
| `/register` | `src/app/(auth)/register/page.tsx` | 注册页 UI |
| `/admin` | `src/app/admin/page.tsx` | 管理后台数据看板 |
| `/admin/notes` | `src/app/admin/notes/page.tsx` | 笔记管理 |
| `/admin/reports` | `src/app/admin/reports/page.tsx` | 举报管理 |
| `/admin/users` | `src/app/admin/users/page.tsx` | 用户管理 |
| `/api/auth/[...nextauth]` | `src/app/api/auth/[...nextauth]/route.ts` | NextAuth handler |
| `/api/health` | `src/app/api/health/route.ts` | 环境状态检查 |
| `/api/v1/feed` | `src/app/api/v1/feed/route.ts` | 跨端 Feed API，支持 cursor/limit 和推荐原因 |
| `/api/v1/search` | `src/app/api/v1/search/route.ts` | 跨端搜索 API，支持 cursor/limit、混合召回和命中原因 |
| `/api/v1/uploads` | `src/app/api/v1/uploads/route.ts` | 登录用户图片预签名上传 |
| `/api/v1/notes/[noteId]/like` | `src/app/api/v1/notes/[noteId]/like/route.ts` | 移动端点赞/取消点赞 toggle |
| `/api/v1/notes/[noteId]/favorite` | `src/app/api/v1/notes/[noteId]/favorite/route.ts` | 移动端收藏/取消收藏 toggle |
| `/api/v1/notes/[noteId]/comments` | `src/app/api/v1/notes/[noteId]/comments/route.ts` | 移动端创建一级评论或回复 |
| `/api/v1/notes/[noteId]/not-interested` | `src/app/api/v1/notes/[noteId]/not-interested/route.ts` | 移动端标记笔记不感兴趣 |
| `/api/v1/comments/[commentId]` | `src/app/api/v1/comments/[commentId]/route.ts` | 移动端删除自己的评论或举报评论 |
| `/api/v1/users/[handle]/follow` | `src/app/api/v1/users/[handle]/follow/route.ts` | 移动端关注/取消关注 toggle |
| `/api/v1/users/[handle]/block` | `src/app/api/v1/users/[handle]/block/route.ts` | 移动端屏蔽/取消屏蔽用户 |
| `/api/v1/notifications` | `src/app/api/v1/notifications/route.ts` | 跨端通知 API，支持列表和标记已读 |

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
- `UserBlock`、`NoteDismissal`：用户屏蔽关系和不感兴趣负反馈。
- `Notification`：站内通知。
- `Report`：内容、评论、用户举报。
- `AdminAuditLog`：后台操作审计。
- `NoteEmbedding`：笔记语义向量，用于语义搜索和推荐。

长期对标完整 App 时，数据模型还需要扩展到更多业务域，例如：

- `MediaAsset`：统一管理图片、视频、封面、转码状态和对象存储 key。
- `Topic`、`Location`、`Campaign`：话题、地点、运营专题和活动。
- `Conversation`、`Message`：私信和会话。
- `DeviceToken`：移动端 Push 和设备维度风控。
- `Product`、`Shop`、`CartItem`、`Order`、`Payment`、`Refund`：电商交易。
- `Coupon`、`Promotion`、`CreatorPayout`：优惠券、营销投放和达人结算。
- `LiveRoom`、`LiveMessage`、`LiveProduct`：直播和直播带货。
- `ModerationCase`、`Appeal`、`RiskSignal`：审核、申诉和风控。
- `AnalyticsEvent`：曝光、点击、停留、搜索、互动、交易和审核事件。
- `CreatorProfile`、`CreatorMetric`、`CreatorLevel`：创作者资料、数据看板和成长等级。

## 本地服务

本地开发推荐使用 Docker 启动数据库，也可以使用 Homebrew 安装服务：

- PostgreSQL 16：主数据库。
- pgvector：语义向量扩展。
- Redis：缓存和后续限流、推荐候选缓存。
- MinIO：S3 兼容对象存储。

默认连接信息在代码中有开发 fallback，生产环境必须使用环境变量覆盖。

本地服务已收敛到 `docker-compose.yml` 和 `pnpm services:up`。这样 M2 的上传、M3 的限流/通知、M4 的推荐缓存都可以在同一套本地环境里验证。

## 启动项目

首次启动：

1. 启动 PostgreSQL 16 + pgvector、Redis、MinIO：

   ```bash
   pnpm services:up
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
pnpm services:up
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
7. 提交前运行：`pnpm run ci`。

涉及 Prisma migration 时，先运行 `pnpm migration:check` 并检查生成的 SQL 再提交。尤其是 `note_embeddings`、pgvector 索引、`DROP INDEX` 相关变更，不能只因为 Prisma 自动生成就直接入库。

涉及高并发相关实现时，不要在当前阶段过早引入重型架构；优先保证接口可分页、可缓存、可异步化，等 M6 的压测结果出来后再决定是否需要连接池、读写分离、队列或 CDN 方案。

## 当前数据流

当前页面主流程已经切换到 `src/lib/content-data.ts`：

- Feed、搜索、详情页、用户主页读取 Prisma 数据。
- 后台指标、趋势标签、举报队列、笔记列表、用户列表读取真实表。

M3 互动写流程集中在 `src/lib/community-service.ts`，Web 页面和移动端 API 复用同一套业务规则：

- 服务层：`toggleNoteLike`、`toggleNoteFavorite`、`createNoteComment`、`deleteComment`、`reportComment`、`dismissNote`、`toggleUserFollow`、`toggleUserBlock` 统一处理已发布笔记校验、父评论归属校验、敏感词拦截、不能关注/屏蔽自己、风控、数据库写入和通知写入。
- Web 页面：`src/lib/community-actions.ts` 只负责登录跳转、表单参数适配和 `revalidatePath` 刷新，保持无 JS 表单仍可提交。
- 移动端 API：`src/app/api/v1/notes/[noteId]/*`、`src/app/api/v1/comments/[commentId]` 和 `src/app/api/v1/users/[handle]/*` 只负责 session 认证、JSON 校验和统一响应 envelope。
- 点赞/收藏/关注：都是 toggle 语义，已存在则取消，不存在则创建；响应返回最新状态和计数，方便 App 立即刷新按钮。
- 评论/回复：正文限制 1-1000 字；`parentId` 为空创建一级评论，传入一级评论 id 时创建二级回复；服务端不会信任客户端传来的跨笔记 parentId。
- 删除/举报：评论作者可以把自己的评论软删除为 `DELETED`，其他用户可以举报可见评论并写入 `Report`。
- 屏蔽/不感兴趣：用户屏蔽其他用户会切断双方关注关系；用户对笔记标记不感兴趣后，Feed、搜索、详情和用户主页读链路会按 viewer 过滤。
- 刷新：Web 互动完成后刷新首页、搜索页、笔记详情页和相关用户主页，保证计数、按钮状态和评论列表刷新后保持一致。

M3.1 通知中心流程：

- 入口：`src/components/site-shell.tsx` 在登录态读取未读通知数，并在导航铃铛上显示徽标。
- 读模型：`src/lib/notification-data.ts` 统一处理通知列表、未读数、类型文案、read/type 筛选和 cursor page。
- Web 页面：`/notifications` 支持全部/未读/已读、类型筛选、下一页、单条标为已读和全部标为已读。
- 跨端 API：`GET /api/v1/notifications` 返回统一 API envelope，`PATCH /api/v1/notifications` 支持按 ids 或 all 标记已读。
- 权限：通知读取和已读写入都按当前 session 的 `recipientId` 限定，不能读取或修改他人通知。

当前通知中心已覆盖站内通知基础版；移动端 Push、邮件通知、通知模板和通知队列会在 M8/M9 继续实现。

M3.1 评论区基础增强：

- 读模型：`src/lib/content-data.ts` 的详情查询按 `commentCursor` 拉取一级评论，每页默认 10 条，最多 50 条。
- 回复预览：每条一级评论只展示最近 3 条回复，避免一次展开完整楼中楼；回复量很大时后续应增加单条评论的 replies cursor API。
- Web 页面：`/notes/[noteId]?commentCursor=...` 支持评论翻页，登录用户可在一级评论下直接回复。
- 权限：回复写入不会信任前端传来的 `parentId`，服务端会验证父评论必须属于当前已发布笔记且必须是一级评论。
- 通知：一级评论通知笔记作者；二级回复通知被回复评论作者；自己回复自己的内容不会创建自通知。

M3.1 评论治理基础版：

- 数据模型：`CommentStatus` 区分 `VISIBLE`、`HIDDEN`、`DELETED`；公开详情页只读取 `VISIBLE` 评论和回复。
- 作者删除：详情页删除按钮和 `DELETE /api/v1/comments/[commentId]` 都只允许评论作者软删除自己的可见评论。
- 评论举报：详情页举报按钮和 `POST /api/v1/comments/[commentId]` 都只允许举报可见评论，会写入 `ReportTargetType.COMMENT` 举报。
- 后台处理：`/admin/reports` 对评论举报支持标记处理中、隐藏评论并解决、驳回举报；处理动作写入 `AdminAuditLog`，并给举报人写入 `REPORT_UPDATE` 通知。
- 审核隐藏：管理员隐藏一级评论时会同步隐藏其回复，避免回复脱离上下文；普通读链路不展示 `HIDDEN` 或 `DELETED` 评论。
- 敏感词：评论写入前会经过 `src/lib/content-safety.ts` 的基础敏感词检查；命中时返回 `VALIDATION_ERROR`，不会写入评论。

当前评论恢复、批量处理、举报详情页、敏感词词库运营和移动端举报列表不再放入 M3.1，会在 M5 治理阶段继续补齐。

M3.1 互动风控基础版：

- 统一入口：`src/lib/interaction-guard.ts` 为点赞、收藏、关注、评论/回复提供统一前置保护。
- Redis 优先：Redis 可用时使用 Redis key 做跨进程限流、目标冷却和重复评论保护。
- 本地兜底：Redis 不可用时自动降级到进程内内存保护，保证本地开发不会因为 Redis 未启动而无法互动。
- 限流口径：按用户和互动类型限制单位时间操作数量，降低刷赞、刷收藏、刷关注和刷评论风险。
- 目标冷却：按用户+目标短时间锁定，防止双击或重复 POST 把点赞/收藏/关注 toggle 状态来回翻转。
- 重复内容：评论/回复额外按用户+目标+正文 hash 做短期去重，减少网络重试或恶意刷相同内容。

M3.1 屏蔽和负反馈收尾：

- 数据模型：`UserBlock` 存储用户屏蔽关系；`NoteDismissal` 存储用户对单篇笔记的不感兴趣反馈。
- 屏蔽规则：屏蔽会切断双方关注关系；你屏蔽的人不会出现在 Feed/Search；对方屏蔽你时，你不能查看对方主页或继续互动。
- 负反馈规则：不感兴趣不会修改笔记状态，只在当前用户的 Feed、搜索、详情和用户主页作品列表里过滤该笔记。
- API：`POST /api/v1/users/[handle]/block` 提供屏蔽 toggle；`POST /api/v1/notes/[noteId]/not-interested` 记录不感兴趣。

当前风控仍是基础版，尚未覆盖设备/IP 风险、黑名单运营、举报联动和异常行为评分。这些会在 M5 治理阶段继续补齐。

M3.1 移动端互动 API：

- 认证：当前复用 Web NextAuth session，认证入口集中在 `src/lib/api-session.ts`；M8 原生 App 接入前需要替换或扩展为 token/session refresh。
- 点赞：`POST /api/v1/notes/[noteId]/like`，返回 `liked`、`likeCount`、真实 `noteId` 和 `slug`。
- 收藏：`POST /api/v1/notes/[noteId]/favorite`，返回 `favorited`、`favoriteCount`、真实 `noteId` 和 `slug`。
- 评论：`POST /api/v1/notes/[noteId]/comments`，请求体为 `{ "content": "...", "parentId": "可选一级评论 id" }`，返回新评论、评论总数和笔记标识。
- 不感兴趣：`POST /api/v1/notes/[noteId]/not-interested`，请求体可选 `{ "reason": "..." }`，返回 `dismissed`、真实 `noteId` 和 `slug`。
- 评论治理：`DELETE /api/v1/comments/[commentId]` 删除自己的评论；`POST /api/v1/comments/[commentId]` 用 `{ "reason": "...", "detail": "可选说明" }` 举报评论。
- 关注：`POST /api/v1/users/[handle]/follow`，返回 `following`、`followerCount` 和目标用户基础信息。
- 屏蔽：`POST /api/v1/users/[handle]/block`，返回 `blocked` 和目标用户基础信息。
- 错误：未登录返回 `UNAUTHORIZED/401`，频控命中返回 `RATE_LIMITED/429`，参数错误返回 `VALIDATION_ERROR/400`，目标不存在返回 `NOT_FOUND/404`。

`src/lib/mock-data.ts` 作为 UI fixture 和开发兜底保留：当本地数据库端口不可达时，`content-data.ts` 会临时返回 fixture 数据，避免页面直接 500。数据库启动后会自动使用真实 Prisma 查询。后续新增页面应优先复用或扩展 `content-data.ts` 中的查询函数，避免页面组件直接堆叠复杂 Prisma include。

当前核心读链路还没有正式缓存，详情页浏览量仍是同步数据库递增，Feed 推荐候选和搜索热词也还没有进入 Redis。这些实现适合 MVP，不适合大流量公开访问；后续优化时应优先处理缓存、浏览量聚合、推荐候选池、搜索热词和搜索索引。

跨端 API 基础约定已经在 `src/lib/api-contract.ts` 中定义。当前 `/api/v1/feed`、`/api/v1/search`、`/api/v1/uploads`、`/api/v1/notifications` 和 `/api/v1` 互动写接口返回统一 `ok/version/data` envelope。Feed/Search 已支持 `cursor` 和 `limit`，通知列表使用通知 id 做 cursor 分页；后续移动端接入时应继续沿用这套 `pageInfo` 结构。

## 当前写入流程

M2 基础版已经接通：

- 登录：`src/app/(auth)/login/login-form.tsx` 调用 NextAuth Credentials，服务端在 `src/lib/auth.ts` 校验密码并写入 session。
- 注册：`src/app/(auth)/register/actions.ts` 使用 Server Action 校验邮箱、用户名和密码，创建用户后跳转登录。
- 发布：`src/app/(site)/publish/actions.ts` 使用 Server Action 校验登录态和表单字段，写入 `Note`、`NoteImage`、`Tag` 和 `note_embeddings`。
- 上传：`src/app/api/v1/uploads/route.ts` 为登录用户签发短期上传 URL，客户端直传 MinIO/S3，发布提交时再保存图片 URL。
- 权限：`src/lib/auth-boundary.ts` 集中处理用户和管理员 session；`/publish` 要求登录，`/admin` 要求管理员角色。

后续增强点：MinIO CORS、孤儿对象清理、上传进度恢复、移动端 token/session、发布草稿列表和图片 metadata 尺寸识别。

## 国际化规划

- 路由层建议预留 locale 段，例如 `/zh-CN`、`/en-US`。
- 静态文案不要继续硬编码到页面组件，后续应迁移到 message dictionary。
- 日期、数字、热度、粉丝数、相对时间统一走 locale-aware formatter。
- 内容模型后续需要补充语言字段或翻译表，支持同一笔记多语言展示或按语言过滤。
- SEO 需要为多语言页面补充 metadata、`hreflang` 和 sitemap 策略。

## 移动端 App 规划

- 技术路线建议：React Native + Expo。
- 后端需要补齐移动端可调用 API：Feed、详情、搜索、登录、注册、发布、上传、互动、通知。
- 移动端接入前先定义统一 API contract：响应 envelope、错误码、分页 cursor、认证头、版本字段和 DTO 类型。
- 移动端发布能力要支持图片选择、压缩、上传进度、失败重试和草稿本地保存。
- 认证不能依赖 Web-only session，需要明确 token 或移动端 session 策略。
- App 发布后 API 要保持向后兼容，数据库 migration 和接口变更需要版本意识。
- 如果继续对标完整 App，移动端还要补视频播放/发布、原生 Push、私信、直播、购物车、订单、支付、客服反馈和 Crash 监控。

## AI 搜索和推荐

`src/lib/ai/embeddings.ts` 负责生成向量。本地没有 `OPENAI_API_KEY` 时会返回确定性伪向量，目的是让 seed 和开发流程不被外部服务阻塞，不代表真实语义效果。

M4.1 基础版的数据流如下：

- 发布笔记时 `src/app/(site)/publish/actions.ts` 生成 embedding，并通过 `src/lib/vector.ts` 格式化为 pgvector 字符串写入 `note_embeddings`。
- Feed 读取走 `src/lib/content-data.ts` 的 `getHomeFeedNotes`：先过滤屏蔽用户和不感兴趣笔记，再按关注作者、兴趣标签、互动热度和新鲜度计算推荐分，最后按 cursor 截取页面。
- 搜索读取走 `searchPublishedNotes`：关键词召回覆盖标题、正文、作者和标签；语义召回读取 `note_embeddings`，用 pgvector 距离补充候选；排序后返回 `matchReasons` 和 `recommendationReason`。
- `/api/v1/feed` 和 `/api/v1/search` 只负责解析 `cursor/limit`、读取 session 和包统一响应，不重复实现排序业务。
- pgvector、数据库或 embedding 服务不可用时，搜索会保留关键词召回；数据库端口不可达时才回退到 `src/lib/mock-data.ts` fixture。

`src/lib/recommendation.ts` 保存第一版推荐权重：

- 语义相似度：0.35
- 标签匹配：0.20
- 互动：0.20
- 新鲜度：0.15
- 关注作者：0.10

后续推荐服务应继续把每个信号归一化到 0 到 1，并保留排序解释，方便调试和后台观察。下一步重点是把热门标签、推荐候选和搜索热词放入 Redis，并为排序规则补测试和基础监控。

## 后台治理

后台当前是演示 UI，目标能力包括：

- 内容审核和笔记状态流转。
- 举报处理和处理记录。
- 用户角色、封禁和风险状态管理。
- 审计日志追踪所有管理员修改行为。

任何后台写操作都应同步写入 `AdminAuditLog`。
