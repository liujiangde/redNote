# RedNote Deployment Guide

本文档记录当前 MVP 的生产部署顺序。目标是让发布流程可重复，并确保配置、migration 和健康检查在上线前都可验证。

## 发布前检查

1. 安装依赖：`pnpm install --frozen-lockfile`
2. 校验环境变量：`pnpm env:check:production`
3. 运行质量门禁：`pnpm run ci`
4. 生成 Prisma Client：`pnpm prisma:generate`
5. 构建应用：`pnpm build`

生产环境必须配置真实的 `DATABASE_URL`、`NEXTAUTH_SECRET`、`NEXTAUTH_URL`、`REDIS_URL`、`S3_ENDPOINT`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`S3_BUCKET` 和 `OPENAI_API_KEY`，并避免继续使用本地默认对象存储密钥。

## 数据库迁移

当前项目使用 Prisma migration 管理数据库结构，但 `note_embeddings.embedding` 是 `Unsupported("vector(1536)")`，涉及 pgvector 的 migration 必须先跑审查：

```bash
pnpm migration:check
pnpm prisma migrate deploy
```

上线前确认目标数据库已安装 `vector` 扩展。新环境可以先执行：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

迁移执行后再启动应用实例，避免新代码读取不存在的列或枚举值。涉及用户状态、内容治理、向量索引等 migration 时，先在预发环境跑一次完整 `pnpm run ci` 和核心页面 smoke test。

## 服务依赖

- PostgreSQL + pgvector：主业务库和语义向量。
- Redis：互动限流、搜索热词、个人历史和推荐候选缓存。
- S3/MinIO：图片对象存储；生产环境建议接入 CDN，并把 `S3_ENDPOINT` 配置成可信图片域名。
- OpenAI embedding：生产搜索/推荐需要真实 embedding，未配置时本地会使用确定性伪向量。

## 上线后验证

部署完成后检查：

```bash
pnpm smoke:routes -- --base-url https://<host>
curl -f https://<host>/api/health
```

`/api/health` 会检查数据库、Redis 和对象存储 bucket。数据库或对象存储异常会返回 `503` 和 `degraded`，Redis 或 AI 未配置会在响应体中展示对应状态，便于排障。

`pnpm smoke:routes` 会检查首页、搜索、登录、注册、健康检查和后台登录跳转。脚本默认使用 `http://localhost:3000`，生产或预发环境需要通过 `--base-url` 指向目标域名。

记录第一版容量基线：

```bash
pnpm baseline:routes -- --base-url https://<host> --requests 30 --concurrency 3
```

`pnpm baseline:routes` 会输出每个核心路由的 RPS、平均耗时、P50、P95、P99、最大耗时和错误率。这个脚本用于轻量回归和容量起点记录；正式压测仍需要在隔离环境中扩大请求量，并结合数据库连接数、慢查询、Redis 状态和应用日志一起判断瓶颈。

继续人工验证：

- 打开首页、搜索页、通知页和后台首页。
- 登录普通用户，发布一篇草稿和一篇公开笔记。
- 上传一张图片并确认公开详情页可渲染。
- 执行点赞、收藏、评论、关注和举报。
- 使用管理员账号处理举报、隐藏/恢复笔记、封禁/解封测试用户。

## 回滚策略

应用代码可以按平台发布机制回滚；数据库 migration 回滚需要单独评估。对不可逆或高风险 migration，先补充手写回滚 SQL 和数据备份策略，不要依赖 `git revert` 自动处理线上数据结构。
