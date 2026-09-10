---
last_verified: 2026-03-12
owner: platform-harness
---

# Deskmate 质量现状

## 评级说明
- A：结构清晰、边界稳定、可维护性高
- B：可维护，但存在局部耦合或实现冗长
- C：存在明显架构或可维护性风险

## 模块评级

| 模块 | 评级 | 依据 |
|------|------|------|
| Lesson Plan（`lib/lesson-plan` + `app/api/lesson-plans`） | B+ | 业务完整（生成/发布/归档），但 route 与 store 文件体量偏大 |
| 判卷与 OCR（`lib/grading`/`lib/ocr`） | B | 流程清晰，前后端链路完整；仍有复杂分支待拆分 |
| PBL（`lib/pbl` + `app/api/pbl`） | B- | 两阶段流程明确，但页面端仍较轻量 |
| AI 助手（`lib/assistant` + `app/api/agent`） | A- | 主链已进一步做薄：主聊天 route 已切到 dispatcher + 通用 chat 主干，教案/习题/PBL/组卷 workflow 已独立，习题 pipeline 已拆出 review 层，主工作台 stream/files/history/lifecycle hooks 已抽离；剩余热点主要集中在 workspace 页面与少数 pipeline 子模块 |
| 微信编辑器（`components/wechat-editor` + `app/api/wechat-editor*`） | B- | 已收敛为单入口与单条 API 主线，结构更清晰；排版与模板链路仍偏复杂 |
| API 基础层（`lib/api`） | B+ | 有统一请求/错误/限流抽象，但并非所有路由都完全对齐 |
| 类型边界（`types` 与 `components/main/chatflow/types.ts`） | B+ | `chatflow` 共享类型已提升到 `types/chatflow.ts`，UI 仅做 re-export；`check-architecture` 已阻断 `lib -> components` 反向依赖 |
| Runtime 稳定性内核（`lib/runtime/*`） | A- | typed error、deadline、retry、feature flag、workflow telemetry、可靠 after 已集中收口；2026-03-21 起已把 replay 覆盖扩大到 memory、grading、knowledge、PBL、lesson-plan、exercise 与消息型 worksheet 后处理，并完成本地真实 replay 验证，下一步重点转为补查询视图与告警 |
| 文档与计划体系 | B（本次建设后） | 已建立结构化文档与检查脚本，后续需持续更新 |

## 当前通过基线（2026-03-12）
- ROI 1/2/3/4 相关主链已完成真实前端验收：
  - 习题生成流式：PASS
  - 教案生成：PASS
  - 题库组卷并导出 PDF：PASS
  - 上传 PDF -> 临时拆题池 -> 组卷并导出 PDF：PASS
- 当前通过的关键证据目录：
  - `document/ux-verification/20260312_190500_roi1234/04-question-bank-worksheet-rerun4`
  - `document/ux-verification/20260312_190500_roi1234/05-temp-pool-worksheet-rerun3`
  - `document/ux-verification/20260312_190500_roi1234/06-exercise-streaming-regression`
  - `document/ux-verification/20260312_190500_roi1234/07-lesson-plan-regression`

## 已知问题
1. 个别热点文件仍明显过长：`components/main/AgentWorkspacePage.tsx` 约 1465 行；`exercise-pipeline-generation.ts` 约 931 行。
2. `lib/agent/chat-direct-dispatch.ts` 已在 2026-03-21 继续瘦身到约 289 行，并把 workflow 判定下沉到 `chat-direct-routing.ts`；但 `app/api/agent/chat/route.ts` 仍约 676 行，`worksheet-temp-pool.ts` / `worksheet-question-bank.ts` 仍需继续压回 500 行内。
3. 历史计划文档分散，已归档但尚未全部补齐 frontmatter。
4. API 错误返回虽有统一工具，但仍存在少量自定义返回风格。
5. 主工作台已拆出 `use-agent-workspace-stream-state.ts`、`use-agent-workspace-files.ts`、`use-agent-workspace-history.ts` 与 `use-agent-workspace-lifecycle.ts`，但 clarification / task dispatch 逻辑仍集中在页面本体。
6. 后台任务自动重放已覆盖当前 `scheduleReliableAfterTask` 扫描到的全部业务任务，但运行面板与告警仍未补齐，故障发现仍偏被动。

## 优先改进建议
1. 继续拆分 `AgentWorkspacePage.tsx`，优先把 clarification / task dispatch / canvas 交互再下沉一层，避免页面继续承担协调器角色。
2. 继续把 `exercise-pipeline-generation.ts` 按 generation / rescue / compact-output 再拆一层，避免新逻辑重新回流主入口。
3. 保持“热区不增长”门禁：`check:file-budgets` 与 `check:architecture` 必须跟随 `check:all` 一起跑，新的 agent/workflow 子模块默认控制在 500 行以内。
4. 稳定性层下一步优先把 workflow telemetry 做成固定查询视图与告警，再考虑更重的多 provider 容灾框架。
