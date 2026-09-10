---
last_verified: 2026-03-05
owner: platform-harness
---

# Deskmate 编码约定

## 文件与目录命名
- API Route 固定：`app/api/<domain>/.../route.ts`。
- `lib` 下业务模块使用 kebab-case 文件名（如 `model-router.ts`、`rewrite-step.ts`）。
- React 组件使用 PascalCase 文件名（如 `AgentWorkspacePage.tsx`、`GradingPage.tsx`）。
- 共享类型优先放 `types/` 或各领域 `lib/<domain>/types.ts`。

## 组件/函数命名模式
- React 组件：`<Domain><Role>Page` / `<Domain><Role>Panel`。
- Hooks：`useXxx`（例如 `useLessonPlan`、`useIntent`）。
- API handler：`export async function GET/POST/...`。
- 领域动作函数：动词前缀（`generate*`, `create*`, `save*`, `append*`, `rewrite*`）。

## Import 组织
- 跨目录导入统一走 `@/` 别名，不使用相对路径。
- API Route 禁止导入 UI 层路径：`@/components/*`、`@/hooks/*`、`@/app/*`。
- API Route 内禁止运行时直接导入 Supabase SDK，改用：
  - `@/lib/supabase/server`
  - `@/lib/supabase/admin`
  - `@/lib/api/teacher-context`

## 错误处理与返回协议
- 入参先走 Zod；解析失败返回 `jsonError("VALIDATION_ERROR", ...)`。
- 未授权统一返回 `jsonError("UNAUTHORIZED", ...)`。
- 服务异常统一 `console.error("<中文上下文>", error)` 后返回 `jsonError("INTERNAL_ERROR", ...)`。
- 流式接口在错误分支也要落结构化事件或结构化 JSON，避免前端无法识别。

## 日志格式
- 推荐格式：`console.error("<模块动作失败>", error)`。
- 日志中避免输出敏感字段（token、cookie、完整个人隐私）。

## 计划文档约定
- 活跃计划存放在 `docs/plans/active/`。
- 计划模板见：
  - `docs/plans/templates/light-plan.md`
  - `docs/plans/templates/execution-plan.md`
