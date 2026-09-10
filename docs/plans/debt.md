---
last_verified: 2026-03-12
owner: platform-harness
---

# 技术债列表

## D-001 lib 反向依赖 UI 类型
- 现象：历史上 `lib/*` 依赖 `components/main/chatflow/types.ts`，形成 `lib -> components` 反向依赖。
- 风险：已消除；后续风险主要是回归。
- 建议：保持 `types/chatflow.ts` 作为稳定共享类型层，并通过 `check-architecture` 持续阻断回归。
- 状态：CLOSED

## D-002 超长 API Route 文件
- 现象：`app/api/agent/chat/route.ts` 已进一步降到约 369 行，PBL/教案/习题/组卷直连分支已统一收口到 dispatcher + workflow。
- 风险：已基本消除；后续主要风险是新功能再次回塞 route。
- 建议：保持 Route 只做认证、上下文准备、dispatcher 调用和通用 chat 主干；新增老师主任务一律先进 `lib/agent/chat-direct-dispatch.ts` 或 `lib/agent/workflows/*`。
- 状态：CLOSED

## D-004 主工作台与工作流热区仍偏厚
- 现象：`components/main/AgentWorkspacePage.tsx` 已降到约 1196 行，并继续拆出 `use-agent-workspace-lifecycle.ts`；`scan-workflow.ts` 已降到约 251 行并拆出 `format/types`；`worksheet-direct.ts` 已降为薄入口，但 `exercise-pipeline-generation.ts` 与页面本体仍是当前热区。
- 风险：前端状态污染、长链路难定位、任何改动都容易波及 follow-up/上传/Canvas/组卷。
- 建议：继续沿当前方向拆分为更小的 panel/client/helper，优先让“工作台页面本体”“习题 generation / rescue”“组卷共享 helper”继续独立。
- 状态：OPEN

## D-005 热区门禁刚建立，仍需持续收紧
- 现象：当前已接入 `check:file-budgets`，但本质还是“冻结现状 + 禁止回涨”，还不是全面达标。
- 风险：如果后续不持续拆分，热区会长期维持在高复杂度状态。
- 建议：每次触碰热点文件时都优先抽一段职责出去，并同步下调预算，不要把门禁当成永久豁免。
- 状态：OPEN

## D-006 后台任务失败仍以人工补救为主
- 现象：2026-03-21 起已补 `background_task_failures` replay 队列与 `npm run background-tasks:process` worker，并把覆盖面扩大到当前 `scheduleReliableAfterTask` 扫描到的全部业务任务；本地已完成 `pbl.project_sync`、`agent.lesson_plan_postprocess`、`agent.exercise_postprocess` 的 replay 验证。
- 风险：自动重放覆盖面已收口，但如果缺少高频失败查询视图和告警，故障发现仍会偏后置。
- 建议：下一阶段优先补 workflow / replay 的固定查询视图、阈值告警和 dead-letter 处理面板。
- 状态：OPEN

## D-003 文档 freshness 覆盖不足
- 现象：历史文档未统一 frontmatter。
- 风险：过期信息误导 agent。
- 建议：分批补 `last_verified` 与 owner，并纳入 `check-docs` 管理列表。
- 状态：OPEN
