---
last_verified: 2026-04-01
owner: agent-platform
---

# Agent Backend Triage And Workflow Upgrade
状态: IN_PROGRESS

## 目标
把 Deskmate 当前分散的 Agent / Assistant 后端收口成一条统一的 `triage -> execution plan -> workflow -> tool loop -> stream` 主链，重点解决以下问题：

- `/api/chat` 与 `/api/agent/chat` 两条聊天链长期分叉
- `lib/assistant/intent-router.ts` 与 `lib/chat/intent.ts` 两套意图识别并存
- Route 层仍承担过多运行时裁决逻辑，难以继续扩展
- 意图识别、工作流切换、工具暴露、流式协议之间缺少统一契约
- 新增主任务时，容易继续把分支堆回 Route，而不是注册成稳定 workflow

## 设计依据

### Context7 最新实践摘要
- Vercel AI SDK 当前更适合用作“有边界的多步工具执行层”：`streamText + typed tools + bounded step loop`，而不是把全部业务判断塞进单个大 agent。
- OpenAI 当前更推荐“triage/router -> specialized workflows or agents”的 handoff 架构；意图分类、工具参数和交接上下文都应结构化。
- 已知边界清楚的业务请求，优先走“规则 fast-path + 小模型结构化分类 fallback”，不要默认进入大模型自主规划。

### 本仓库现状
- 正式主链已经在 [`app/api/agent/chat/route.ts`](../../../app/api/agent/chat/route.ts)。
- 旧聊天链仍存在于 [`app/api/chat/route.ts`](../../../app/api/chat/route.ts)。
- 正式任务识别、路由与执行计划已分布在：
  - [`lib/chat/intent.ts`](../../../lib/chat/intent.ts)
  - [`lib/agent/task-state.ts`](../../../lib/agent/task-state.ts)
  - [`lib/agent/request-routing.ts`](../../../lib/agent/request-routing.ts)
  - [`lib/agent/execution-plan.ts`](../../../lib/agent/execution-plan.ts)
  - [`lib/agent/chat-tools.ts`](../../../lib/agent/chat-tools.ts)
- 旧 assistant 仍有独立意图路由：
  - [`lib/assistant/intent-router.ts`](../../../lib/assistant/intent-router.ts)
  - [`lib/assistant/chat.ts`](../../../lib/assistant/chat.ts)

## 当前问题

### 1. 两条聊天后端长期并存
- `/api/agent/chat` 已经拥有任务态、执行计划、工具编排、并发控制和 telemetry。
- `/api/chat` 仍保留旧式 assistant intent + 自定义 SSE 输出。
- 结果是同一个老师的“聊天”与“Agent 主任务”能力边界不一致，后续升级要改两遍。

### 2. 意图识别存在双轨
- `lib/chat/intent.ts` 更接近正式工作流裁决。
- `lib/assistant/intent-router.ts` 是较早期的轻量规则路由。
- 两者在课程识别、追问策略、联网策略和任务边界上没有统一契约。

### 3. Route 层仍偏重
- `app/api/agent/chat/route.ts` 虽然已经做薄，但仍承担大量运行时拼装和裁决衔接。
- 新需求继续叠加时，容易回到“大 Route + 多分支 + 局部补丁”的模式。

### 4. 缺少正式 handoff 协议
- 当前已经有“任务态 -> plan -> tools”的雏形。
- 但“从 triage 切到 specialized workflow”的交接信息，还没有成为稳定的后端 contract。
- 这会导致 follow-up、recent artifact、retrieval primer、document workflow 之间的切换依赖隐式规则。

### 5. 评估面还不够标准化
- 已有 workflow telemetry，但缺少“为什么选了这个 workflow / 为什么进入 follow-up / 为什么触发 tool override”这类 decision 级观测。
- 没有一套专门覆盖 triage 质量的黄金样例集与回归指标。

## 设计概要
升级后的后端不追求“一个全能 agent 自行决定一切”，而是把现有主链收敛为：

- 统一聊天入口
- 统一 triage contract
- 统一 workflow registry
- 按 plan 裁剪的最小工具集
- 可观测、可回归的 handoff 与 stream contract

核心思路是：让“分类和交接”从正文生成中解耦，先稳定 `decision -> plan -> workflow`，再让 specialized workflows 各自演进。

## 升级目标架构

```text
UI / API caller
  -> Unified Chat Entry
  -> Triage Engine
     -> Rules Fast-Path
     -> Structured Classifier Fallback
  -> Execution Plan
  -> Workflow Registry
     -> retrieval
     -> lesson-plan
     -> exercises
     -> worksheet
     -> rubric
     -> pbl
     -> general-chat
  -> Minimal Tool Set
  -> Stable Stream Contract
  -> Persistence / Telemetry / Evaluation
```

## 目标设计

### 1. 统一 Triage Contract
新增统一的 `AgentIntentDecision` 契约，作为所有聊天入口的第一层输出。

建议字段：
- `workflow`: `general_chat | retrieval | lesson_plan | exercises | worksheet | rubric | pbl | question_bank`
- `mode`: `chat_answer | retrieval_only | document_artifact | retrieval_then_document`
- `needsFollowUp`: boolean
- `requiredFields`: `action | course | unit | topic | count | difficulty | artifact_reference` 的缺失集合
- `retrievalSources`: `none | knowledge | web | question_bank | mixed`
- `continuationMode`: `new_task | continuation | artifact_followup`
- `artifactIntent`: `none | single_primary | primary_plus_auxiliary`
- `confidence`: `high | medium | low`
- `reasonCodes`: 仅短标签，供 telemetry 和调试使用

要求：
- 规则 fast-path 与模型分类都必须产出同一份结构。
- 后续 task-state、execution-plan、tool loop 都只消费这份结构，不再各自猜测。

### 2. Triage 分两段执行

#### Rules Fast-Path
适合处理边界清晰、成本低、可直接命中的请求：
- 明确的 `rubric / worksheet / lesson plan / pbl`
- 明确的“找现成题 / 从题库抽题 / 保存到题库”
- 明确的 `exit ticket / answer key / adapt difficulty`
- 明确 continuation，如“继续上一版”“把刚才那份改成更简单”

#### Structured Classifier Fallback
仅在以下情况触发：
- prompt 同时带多种动作，规则无法稳定裁决
- 课程 / topic / artifact follow-up 关系较复杂
- 请求在“直接回答 / 检索 / 生成文档”之间存在歧义

实现原则：
- 使用轻量模型，经由 [`lib/ai/structured-output.ts`](../../../lib/ai/structured-output.ts) 输出严格 schema。
- 模型只做分类与参数抽取，不直接生成正文。
- 低置信时优先进入 follow-up，而不是冒险选错 workflow。

### 3. Workflow Registry 正式化
把“支持哪些 workflow、每个 workflow 的 allowed tools、artifact policy、stream profile、follow-up policy”收口成注册表，而不是散落在 Route 和工具构建逻辑里。

建议新增：
- `lib/agent/workflow-registry.ts`
- `lib/agent/triage/types.ts`
- `lib/agent/triage/engine.ts`

每个 workflow 至少声明：
- `id`
- `accepts(decision)`
- `allowedTools`
- `artifactPolicy`
- `streamProfile`
- `buildWorkingNote`
- `run` 或 `resolveHandler`

### 4. Tool 暴露改为“按 plan 裁剪”
延续当前最小工具集思路，但把裁剪逻辑挂到 execution plan，而不是在 Route 和工具工厂里分散判断。

目标：
- `general_chat` 只暴露检索类或零工具
- `retrieval_then_document` 先暴露 primer tools，再进入文档 tool
- `question_bank` 不误触发“重新生成”
- `worksheet + answer_key` 保持“单主文档 + 附属产物”策略

### 5. 统一聊天入口
目标不是立刻删除 `/api/chat`，而是先让它变成 `/api/agent/chat` 主链的兼容壳。

目标状态：
- `/api/agent/chat` 是唯一正式后端能力入口
- `/api/chat` 仅做兼容协议转换，或逐步下线
- `lib/assistant/intent-router.ts` 不再拥有独立裁决逻辑，最终退化为 adapter 或删除

### 6. 统一 Stream/Handoff Contract
把“triage 选了什么、当前进入哪个 workflow、是否发生 handoff、为什么要求 follow-up”变成正式流事件。

建议标准事件：
- `data-agent-meta`
- `data-agent-decision`
- `data-agent-handoff`
- `data-agent-stage`
- `data-agent-finish`

要求：
- 老师可以感知当前是“检索中 / 进入 worksheet workflow / 等待补参 / 生成主文档 / 生成附属答案”
- 前端不再依赖隐式文本判断当前状态

### 7. 建立 Decision Telemetry + Eval
在现有 workflow telemetry 基础上，补 decision 级指标：
- triage 选中的 workflow
- 触发 fast-path 还是 classifier fallback
- classifier 置信度
- 是否因 runtime override 改写原计划
- follow-up 率
- handoff 次数
- tool sequence 偏离率

并建立黄金样例集，覆盖：
- 新任务
- continuation
- artifact follow-up
- question-bank retrieval
- retrieval_then_document
- ambiguous mixed prompt

## 阶段分解

### Phase 1: 收口 Triage Contract 与 Registry
目标：先把“路由和执行的边界”做出来，不急着大改业务行为。

- [x] 新增统一 triage types，定义 `AgentIntentDecision`
- [x] 提取 rules fast-path，收口当前 `parseIntentFromText + request-routing + execution-plan` 的重叠判断
- [x] 新增 workflow registry，明确每个 workflow 的 `allowedTools / artifactPolicy / streamProfile`
- [x] 保持现有行为不变前提下，让 `app/api/agent/chat/route.ts` 优先消费 registry + decision，而不是直接散落判断

建议涉及文件：
- 新增 `lib/agent/triage/types.ts`
- 新增 `lib/agent/triage/engine.ts`
- 新增 `lib/agent/workflow-registry.ts`
- 修改 `lib/agent/request-routing.ts`
- 修改 `lib/agent/execution-plan.ts`
- 修改 `app/api/agent/chat/route.ts`

### Phase 2: 上线结构化 Classifier Fallback
目标：把“模糊请求”从规则误判，升级为低成本的结构化分类。

- [x] 为 triage 增加小模型分类 fallback
- [x] 输出与 rules fast-path 完全一致的 `AgentIntentDecision`
- [x] 明确 low-confidence -> follow-up 的策略，避免错误直达工作流
- [x] 将 classifier model 注册到 [`lib/ai/model-router.ts`](../../../lib/ai/model-router.ts)

建议涉及文件：
- 新增 `lib/agent/triage/classifier.ts`
- 修改 `lib/ai/model-router.ts`
- 修改 `lib/ai/structured-output.ts`
- 修改 `tests/followup/agent-request-routing.spec.ts`
- 新增 `tests/followup/agent-triage-classifier.spec.ts`

### Phase 3: 收口两条聊天链
目标：消除 `/api/chat` 和 `/api/agent/chat` 的能力分叉。

- [x] 让 `/api/chat` 复用统一 triage + workflow 主链
- [x] 兼容保留旧 SSE 响应格式，但后端裁决逻辑不再双写
- [x] `lib/assistant/intent-router.ts` 降级为 adapter，逐步退役
- [x] `lib/assistant/chat.ts` 只负责旧入口的协议兼容与 memory 收尾，不再独立决定 workflow

建议涉及文件：
- 修改 `app/api/chat/route.ts`
- 修改 `lib/assistant/chat.ts`
- 修改 `lib/assistant/intent-router.ts`
- 修改 `lib/assistant/context-builder.ts`

### Phase 4: Workflow Handoff 正式化
目标：让 specialized workflow 真正成为稳定后端单元，而不是 route 内隐式跳转。

- [ ] 为 `lesson-plan / exercises / worksheet / rubric / pbl / retrieval` 建立统一 handler 接口
- [x] 统一记录 handoff reason、handoff context、selected workflow
- [ ] 把 retrieval primer 和 document generation 的边界写成显式 stage，而不是只靠工具顺序推断
- [x] 新增 `data-agent-handoff` / `data-agent-phase` 事件消费

建议涉及文件：
- 修改 `lib/agent/workflows/*`
- 修改 `lib/agent/chat-tools.ts`
- 修改 `lib/agent/chat-stream.ts`
- 修改前端 stream consumer

### Phase 5: 建立 Triage Eval 与灰度发布
目标：确保这次升级不是“看起来更优雅”，而是真能降低误路由和返工。

- [x] 建立 triage regression fixtures
- [x] 为高频请求建立 golden prompts
- [x] 在 workflow telemetry 中记录新 decision 字段
- [x] 用 feature flag 灰度发布 `triage_v2`
- [ ] 对比 follow-up 率、误路由率、人工回退率、TTFT 和完成率

说明（2026-04-01 首轮实测）：
- `scripts/runtime/report-agent-triage-metrics.ts --days=3 --baseline-days=3` 已可直接读取 Supabase 数据。
- 当前窗口拿到 `stream_first_visible/stream_complete`，但 `triage_prompt/triage_runtime` 计数仍为 0，说明生产 telemetry 中 triage 步骤命名或上报路径仍需对齐，导致 follow-up / misroute 指标暂不可计算。

建议涉及文件：
- 新增 `tests/followup/agent-triage-regression.spec.ts`
- 修改 `lib/runtime/workflow-telemetry.ts`
- 修改 `lib/runtime/workflow-profiles.ts`
- 修改相关 dashboard / query 文档

## 决策日志
| 日期 | 决策 | 理由 |
|------|------|------|
| 2026-03-31 | 不直接引入“多 agent 并行”作为第一阶段主解法 | 当前主要瓶颈是路由分叉与契约缺失，不是 agent 数量不足 |
| 2026-03-31 | 先统一 triage contract，再统一聊天入口 | 先稳定后端边界，能降低后续迁移风险 |
| 2026-03-31 | 模糊请求走结构化 classifier，不让 planner 直接生成正文 | 分类问题应低成本、可测、可回归，不应和正文生成耦合 |
| 2026-03-31 | 采用 `prompt triage -> runtime triage` 的显式 handoff 事件 | 让运行时改写可观测，降低“为什么改路由”的排障成本 |

## 已知风险和依赖
- [ ] `app/api/agent/chat/route.ts` 当前已较复杂，Phase 1 抽取时容易出现“逻辑位置变化但行为微回归”。
- [ ] `lib/chat/intent.ts` 仍承担不少历史默认值补齐逻辑，重构时要防止把兼容行为一起删掉。
- [ ] `/api/chat` 有自己的流式协议与 memory 收尾，迁移时需要保持兼容。
- [ ] 前端部分状态仍可能隐式依赖某些文本或 tool 名称，Phase 4 前不能贸然删事件。

## 完成标准
- 所有聊天入口都先进入统一 triage contract，再进入 execution plan 与 workflow registry。
- `/api/agent/chat` 成为唯一正式主链；`/api/chat` 仅保留兼容壳或明确退役。
- 新增主任务时，默认通过注册 workflow 接入，而不是回到 Route 内加分支。
- triage decision、handoff、tool sequence、follow-up 都能被 telemetry 与 regression fixtures 观测。

## 验收标准

### 架构完成标准
- 所有聊天入口都先产出统一 `AgentIntentDecision`，再进入 execution plan。
- `/api/agent/chat` 成为唯一正式后端主链；`/api/chat` 只保留兼容层或明确下线。
- workflow 选择、tool 暴露、artifact policy、stream profile 都从 registry 获取，不再散落在 Route 中。
- `lib/assistant/intent-router.ts` 不再拥有独立的工作流裁决责任。

### 质量完成标准
- triage regression fixtures 覆盖高频主请求、continuation、artifact follow-up、question bank、retrieval_then_document。
- 低置信请求优先 follow-up，而不是误进错误 workflow。
- 新旧主链灰度期间，误路由率与人工返工率下降。
- `console error / pageerror / 静态资源 404 = 0` 维持项目现有主链验收基线。

### 性能完成标准
- rules fast-path 请求不新增额外模型调用。
- classifier fallback 只覆盖模糊 prompt，不影响清晰请求的 TTFT。
- retrieval_then_document 的 tool sequence 稳定，避免只停在左侧文本回答。
