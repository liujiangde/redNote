<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Git 提交规范

项目提交信息使用 Conventional Commits：

```text
type(scope): summary
```

- `type` 常用值：`feat`、`fix`、`docs`、`refactor`、`test`、`chore`、`build`、`style`
- `scope` 可选，用于标明影响范围，例如 `auth`、`feed`、`prisma`
- `summary` 使用简短中文描述，说明本次提交做了什么

示例：

```text
feat(auth): 接入账号密码登录流程
fix(feed): 避免浏览量重复累加
docs: 更新项目开发指南
chore: 更新 Prisma seed 数据
```

提交前运行：

```bash
pnpm lint
pnpm typecheck
```

涉及 Prisma migration 时，必须先人工检查生成的 SQL，尤其关注 `note_embeddings`、pgvector 索引和 `DROP INDEX` 相关变更。
