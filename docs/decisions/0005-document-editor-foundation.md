# 0005 文档编辑器后端基础层

- 状态: Accepted
- 日期: 2026-03-20

## 背景

新的 Notion 风格编辑器已经有前端壳层，但仓库里还没有统一的文档读写底座。现有内容散落在内容库快照、Agent artifact、旧教案/题库表中，直接把编辑器绑到任一旧表上，都会让后续 block 文档引擎和版本历史变得更难演进。

## 决策

先引入独立的 `documents` / `document_versions` 作为编辑器后端基础层：

- `documents` 作为当前 source of truth，服务 HTML 编辑器。
- 同时保留 `document_model`、`editor_kind`、`source_type/source_id`，为未来 block 文档和来源同步预留扩展位。
- 自动保存与历史恢复通过数据库函数 `autosave_document`、`restore_document_version` 原子执行，避免应用层双写造成版本不一致。
- 前端统一对接 `/api/documents/*`，不直接拼装旧领域接口。

## 当前范围

已落地：

- `POST /api/documents`
- `GET /api/documents/[id]`
- `PUT /api/documents/[id]/autosave`
- `GET /api/documents/[id]/properties`
- `PUT /api/documents/[id]/properties`
- `GET /api/documents/[id]/history`
- `GET /api/documents/[id]/history/[versionId]`
- `POST /api/documents/[id]/history/[versionId]/restore`

## 刻意不做

本阶段不把以下能力硬塞进同一轮：

- 不先做 Slash AI 生成 / Suggest 接口
- 不先把内容库详情页直接切到 `documents`
- 不先把 Agent artifact 持久化链路改成双写 `documents`

这些同步点后续基于 `source_type/source_id` 渐进接入，避免第一版同时改三条存储链路。

## 影响

- 编辑器已经有稳定的读写、版本历史、乐观锁和幂等保存语义。
- 未来如果要接内容库、Canvas、block 文档，只需要补同步桥，而不是重做底层表结构。
