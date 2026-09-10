# Semantic Index Rollout

## 目标

把题库、内容库、知识库检索和老师长期记忆统一切到 `semantic_index_items`，默认使用 Google 官方 `gemini-embedding-2-preview`。

## 环境变量

- `GOOGLE_AI_API_KEY`
- `GOOGLE_EMBEDDING_MODEL=gemini-embedding-2-preview`
- `GOOGLE_EMBEDDING_DIMENSION=1536`
- `SUPERMEMORY_MIRROR=1`
  仅在需要把本地记忆镜像回 Supermemory 时开启；默认主链不依赖 Supermemory。
- `SUPERMEMORY_PRIMARY=1`
  仅在排查旧链路时临时开启；默认关闭。

## 本地迁移

新增迁移文件：

- `supabase/migrations/20260311173000_semantic_index_items.sql`

本地库如果 `supabase migration up --include-all` 被旧 migration 卡住，先看 `supabase migration list --local`。

当前已确认的本地坑：

- `20260311103000_question_taxonomy_nodes.sql` 可能因为历史 schema 漂移而在本地重复执行时报错。
- 如果 `20260311120000` 已在库里，但 `20260311103000` 仍显示未应用，可先执行：

```bash
supabase migration repair 20260311103000 --status applied --local
supabase migration up --include-all
```

## 回填

新增脚本：

- `scripts/semantic/backfill-semantic-index.ts`

常用命令：

```bash
node --env-file=.env.local --import tsx scripts/semantic/backfill-semantic-index.ts --dry-run
node --env-file=.env.local --import tsx scripts/semantic/backfill-semantic-index.ts
```

可选参数：

- `--teacher=<teacherId>`
- `--kinds=knowledge,exercise,content,memory`
- `--dry-run`

## 验证

后端/回归：

```bash
npm run typecheck
npm run knowledge:rag:regression
npm run context:regression
```

前端 L1：

- 题库：`scripts/ux/verify-question-bank-flow.mjs`
- 内容库：`scripts/ux/verify-content-library.mjs`

## 现状说明

- 知识库仍保留 `knowledge_document_chunks.embedding`，但主语义检索已经切到 `semantic_index_items`。
- 题库和内容库保留关键词检索作为 fallback，默认排序已改为“语义 + 关键词”混合。
- 老师长期记忆主链已改为本地 `teacher_usage_memory/events + teacher_memory_jobs + teacher_memory_mutations + semantic_index_items(memory_capsule)`；Supermemory 默认只做可选镜像。
