# PBL 规范映射索引

本索引将需求文档映射到当前实现位置，便于后续迭代。

## 1) 课标知识点清单收集指令
- 数据脚本：`scripts/pbl/collect-knowledgepoints.ts`
- 数据产物：`data/pbl/knowledgepoints.seed.json`
- 查询接口：`GET /api/pbl/curriculum`

## 2) 输出模板规范
- 核心 schema：`lib/pbl/schemas/project-overview.ts`
- 核心 schema：`lib/pbl/schemas/project-plan.ts`
- 方案展开：`lib/pbl/generator.ts`

## 3) 输入字段规范
- 输入 schema：`lib/pbl/schemas/generation-input.ts`
- 概览生成入口：`POST /api/pbl/generate` action=overview

## 4) 数据模型文档
- 逻辑存储：`lib/pbl/store.ts`
- 迁移草案：`supabase/migrations/20260305130000_pbl_v1.sql`
- 主题层迁移：`supabase/migrations/20260305230000_pbl_topics.sql`

## 5) PBL 素材来源网站清单
- 数据脚本：`scripts/pbl/collect-materials.ts`
- 主题回填：`scripts/pbl/derive-material-topics.ts`
- APCED 主题补齐：`scripts/pbl/backfill-apced-material-topics.ts`
- 入库脚本：`scripts/pbl/seed-supabase.ts`
- 数据产物：`data/pbl/materials.collected.json`
- 主题种子：`data/pbl/material-topics.seed.json`
- 索引文档：`docs/pbl/materials-catalog.md`

## 6) 项目化学习（PBL）素材收集指令
- 检索工具：`lib/pbl/tools/search-materials.ts`
- 上传接口：`POST /api/pbl/materials/upload`
- 检索接口：`GET /api/pbl/materials`

## 7) 系统架构文档
- API 路由：`app/api/pbl/**`
- 模型路由：`lib/ai/model-router.ts`
- 生成编排：`lib/pbl/generator.ts`

## 8) 项目化学习（PBL）设计标准指南
- 质量检查工具：`lib/pbl/tools/quality-check.ts`
- 质量结果字段：`projectPlan.qualityCheck`

## 9) 项目生成 Prompt
- Prompt 常量：`lib/pbl/prompts/*`
- 执行流程：`generate -> select -> expand -> export`
