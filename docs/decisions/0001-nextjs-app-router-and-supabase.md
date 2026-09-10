---
last_verified: 2026-03-05
owner: platform-harness
---

# ADR-0001: 使用 Next.js App Router + Supabase 作为主应用底座

## 状态
Accepted

## 背景
项目同时需要页面渲染、API Route、鉴权、数据库与文件存储能力，并要求快速迭代。

## 备选方案
1. Next.js + Supabase
2. 前后端分离（React + 独立 Node 服务 + 自建 DB）
3. 纯托管低代码后端

## 决策
采用 Next.js App Router 承载前后端入口，Supabase 提供 Auth/Postgres/Storage。

## 决策理由
- 现有代码已大量依赖 App Router 与 `app/api/**/route.ts`。
- Supabase RLS 与 `teacher_id` 结合，天然支持教师数据隔离。
- 存储与数据库在同一平台，减少集成成本。

## 影响
- 正向影响：开发路径统一，部署与鉴权链路简化。
- 负向影响：部分 route 容易变胖，需要持续做薄层治理。
- 后续动作：通过架构检查限制 route 直接依赖范围。
