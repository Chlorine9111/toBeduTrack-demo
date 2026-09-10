---
last_verified: 2026-03-13
owner: platform-harness
---

# Deskmate 稳定性与性能运行手册

## 适用范围
- 老师主工作台的生成链路稳定性
- 判卷异步 job、可靠后台任务与失败补救
- feature flag / kill switch 的运行时控制
- LLM / OCR / PDF 长链路的超时、重试、观测与排障

## 当前稳定性内核

### Runtime 基础层
统一放在 `lib/runtime/*`：

- `app-error.ts`
  - Typed error 基类与映射
  - 统一错误码、可重试性、附加 metadata
- `deadline.ts`
  - 单步 deadline / timeout budget
  - 通过 `AbortController` 给外部调用设置时间片
- `retry.ts`
  - 有界重试与退避
  - 只用于被判定为 retryable 的错误
- `background-task.ts`
  - `scheduleReliableAfterTask(...)`
  - `runReliableBackgroundTaskNow(...)`
  - `background_task_failures` 失败落库
- `feature-flags.ts`
  - 环境变量优先
  - `app_feature_flags` 表兜底
  - 30 秒本地缓存
- `workflow-telemetry.ts`
  - `workflow_runs`
  - `workflow_run_steps`
  - 记录 workflow、step、模型、耗时、状态

### 当前原则
- 用户可见长链路优先同步流式返回
- 不直接阻塞老师眼前结果的工作统一后置
- 外部调用默认按“会失败”设计，而不是按“总会成功”设计
- typed error、deadline、retry、telemetry 必须统一走 runtime 层，不再在业务文件里散落实现
- 性能排障优先级固定为：先看 `Server-Timing` 的单请求阶段耗时，再看 `workflow_runs / workflow_run_steps` 的服务端长链步骤，最后看 `frontend_web_vitals` 的真实页面指标；不要直接跳回“感觉页面很慢”的主观判断。

## 数据表与迁移

本轮稳定性内核依赖：

- `app_feature_flags`
- `workflow_runs`
- `workflow_run_steps`
- `background_task_failures`
- `frontend_web_vitals`
- `grading_jobs`
- `20260321140000_content_library_query_perf.sql`
- `20260321141000_background_task_replay_queue.sql`

本地联调前先确认：

```bash
supabase migration list --local
```

至少应包含：

- `20260312123000_teacher_memory_jobs_and_mutations.sql`
- `20260312193000_stability_performance_runtime.sql`

如果 schema cache 缺少这些表，前台看起来像“功能坏了”，但根因往往是迁移未应用。

## 判卷异步 Job 基线

### 当前模式
判卷链已经支持同步/异步双模式，但默认基线是：

- `grading.answer_key_inference.enabled`
- `grading.auto_grade.enabled`
- `grading.async_jobs`

当 `grading.async_jobs` 打开时：

- `POST /api/grading/sessions/:sessionId/answer-key/infer`
- `POST /api/grading/sessions/:sessionId/submissions/:submissionId/auto-grade`
- `POST /api/grading/sessions/:sessionId/submissions/auto-grade`

都会返回：

```json
{
  "async": true,
  "job": { "...": "..." }
}
```

前端随后轮询：

- `GET /api/grading/jobs/:jobId`

### 当前 job 服务
- 入口：`lib/grading/jobs.ts`
- 脚本：`scripts/grading/process-jobs.ts`
- npm 命令：

```bash
npm run grading:jobs:process
```

### Admission / 并发保护
- 判卷链当前不再只靠前端按钮禁用；`answer-key/infer`、单份 `auto-grade`、批量 `auto-grade` 在异步 job 模式下都会先通过 `getGradingJobAdmission(...)` 做老师维度 admission。
- admission 当前基于 `grading_jobs` 中同一老师处于 `queued/running` 的任务数判断，属于共享状态保护；命中后直接返回 `429 RATE_LIMITED`，并带 `Retry-After` 与 `X-Concurrency-*` header。
- 如果 feature flag 关闭异步 job、走同步 fallback，Route 仍会使用 `acquireConcurrencySlot(...)` 做进程内保护，避免本地/单实例调试时被重复点击拖死。

### 排障顺序
1. 先看前台是否收到 `202 + job.id`
2. 再看 `grading_jobs.status`
3. 再看 `workflow_runs / workflow_run_steps`
4. 如果异步后处理失败，再看 `background_task_failures`
5. 如果一开始就收到 `429 RATE_LIMITED`，先看当前老师是否已经有未结束的 `grading_jobs`，不要先怀疑鉴权或 OCR provider。

### 幂等键
判卷异步 job 当前必须带幂等键：

- 答案键推断：由题目卷文件名/大小/修改时间推导
- 单份答卷判卷：由 `sessionId + submissionId` 推导
- 批量判卷：由 `sessionId + submissionIds[]` 推导

出现“重复点击 / 重试后重复创建 job”时，优先检查幂等键生成，而不是先怀疑前端轮询。

### 质量闸门
- 答案键推断完成后，必须统一走 `lib/grading/quality-gates.ts`：
  - `evaluateAnswerKeyQuality(...)`
  - `evaluateSubmissionQuality(...)`
- 自动判卷前先检查答案键质量；如果存在缺题、占位答案或题号不一致，当前正式基线是直接阻止自动判卷并返回明确冲突，不再放任模型继续烧预算。
- 批量自动判卷不再因为单份答卷异常整批失败；`processAutoGradeBatchJob(...)` 现在会返回逐份 `completed / partial_result / manual_review_required / failed`，由前端或后续人工复核继续处理。

## Reliable After 基线

### 当前统一入口
所有主工作流的后台副作用优先使用：

```ts
scheduleReliableAfterTask(...)
```

不要再直接裸用 `after()` 做关键写入。

### 已纳入可靠后置的链路
- teacher memory formation
- 习题生成后处理
- 教案生成后处理
- 临时题池组卷后处理
- 知识库自动抽题
- PBL 后处理

### 背景任务失败后的处理
- 失败必须写入 `background_task_failures`
- 前台成功不代表后台一定成功
- 页面显示成功但刷新后结果缺失，优先查这张表
- 2026-03-21 起，`background_task_failures` 已带 `replay_status / replay_attempts / replay_available_at / replay_handler`
- 首批已接入自动重放的任务类型：
  - `agent.memory_formation`
  - `agent.lesson_plan_postprocess`
  - `agent.exercise_postprocess`
  - `agent.exercise_save_followup_postprocess`
  - `agent.pbl_postprocess`
  - `agent.conversation_exercise_worksheet_postprocess`
  - `agent.temp_pool_worksheet_postprocess`
  - `agent.temp_pool_missing_notice`
  - `grading.infer_answer_key`
  - `grading.auto_grade_submission`
  - `grading.auto_grade_batch`
  - `knowledge.auto_import`
  - `pbl.project_sync`
  - `pbl.generate_v2_postprocess`
- worker 入口：

```bash
npm run background-tasks:process
```

- 2026-03-21 本地已完成两条真实 replay 验证：
  - 现有 `pbl.project_sync` failure -> replay `resolved`，内容库同步成功
  - 合成 `agent.lesson_plan_postprocess` failure -> replay `resolved`，内容库写入成功，memory job 状态为 `processed`
- 2026-03-21 追加完成一条合成 exercise 验证：`agent.exercise_postprocess` failure -> replay `resolved`，memory job 状态为 `processed`，exercise taxonomy 字段已更新。
- 截至当前 `scheduleReliableAfterTask` 扫描到的业务任务已全部接入 replay handler；若后续新增 task type，必须同步补 replay 与验证，不要重新把 eventual consistency 风险留给人工补救。

## Feature Flag / Kill Switch 基线

### 当前来源
优先级：

1. 环境变量
2. `app_feature_flags`
3. 默认值

### 适合接 kill switch 的能力
- grading async jobs
- auto-grade
- answer key inference
- follow-up suggestions
- 自动分类 / 自动同步等附属能力

### 原则
- 出问题时先关非核心 AI 能力，保留老师主工作流
- 不要为了小问题让整个主聊天或整个判卷页全部不可用

## 观测基线

### workflow telemetry
关键 workflow 应至少记录：

- `workflow`
- `step`
- `status`
- `duration_ms`
- `teacher_id`
- `conversation_id`
- `request_id`
- `artifact_id`

当前主工作台新增最小基线：

- `agent_preflight`
  - 记录 `resolve`
  - 预算：`targetTotalMs=800 / maxTotalMs=1500`
- `agent_chat`
  - 记录 `stream_first_visible`，用于判断老师第一次看到阶段反馈 / 工具调用 / 文本片段的 TTFT
  - 记录 `stream_complete`，至少带 `toolNames / finishReason / budget`
  - 预算：`targetTtftMs=2000 / maxTotalMs=30000`
- `grading_answer_key_infer` / `grading_auto_grade`
  - 当前预算档位统一保留在 `maxTotalMs=30000`
  - `grading_answer_key_infer` 至少记录答案键推断阶段和最终结果的预算状态
  - `grading_auto_grade` 至少记录评分阶段、质量闸门结果与最终预算状态
  - 后续继续沿用 workflow profile，而不是在业务路由里重复写阈值

### Agent 主链路并发保护

- `/api/agent/chat` 当前新增老师维度的轻量并发闸门：默认同一老师最多 2 条进行中的 Agent 主任务。
- 命中后返回 `429 RATE_LIMITED`，并带 `X-Concurrency-Limit / X-Concurrency-Active`。
- 这属于首期保护，不等价于跨实例全局 load shedder；如果后续线上出现多实例并发失真，再升级为共享状态实现。

### 判卷链路结果态基线

- 判卷链当前对老师可见的结果态不再只分“成功/失败”：
  - `completed`
  - `partial_result`
  - `manual_review_required`
  - `failed`
- 如果答案键或 OCR 明显不完整，优先返回 `partial_result` 或 `manual_review_required`，并把原因写入 metadata / 前端提示；不要继续以“再重试一次模型”代替降级策略。

### 最重要的排障问题
排一条慢链时，先回答这 4 个问题：

1. 卡在前台主链，还是后台副作用？
2. 是模型/OCR/PDF 超时，还是数据库写入慢？
3. 是 retry 在兜底，还是 fallback 已经常态化？
4. 用户看到的“成功”到底有没有真实落库？

## 现在先不要做的事
- 不要先上全局 circuit breaker 平台
- 不要现在就做多 provider 自动 failover
- 不要立刻引入外部队列/任务系统
- 不要把所有同步链都强行改成后台 job

当前更值的是：先把 runtime 内核、判卷 job、可靠后置与观测统一起来。

## 常见症状与优先排查点

### 页面显示成功，但刷新后没数据
先查：
- `background_task_failures`
- 相关主表是否真的写入

### 判卷一直显示处理中
先查：
- `grading_jobs.status`
- `workflow_run_steps`
- 是否本地没有执行 `npm run grading:jobs:process`

### 判卷接口成功了，但页面指标卡还是旧值
先查：
- 前端是否通过稳定 `data-testid` 读取 `totalQuestions / reviewCount / qualityStatus`
- UX 脚本是否在 API 返回后立刻读 DOM，未等待 React 状态落到页面
- `waitForFunction(...)` 是否已绑定到 API 返回值，而不是模糊等待普通文本出现

### 同一个请求重复写多次
先查：
- 幂等键是否稳定
- 是否错误绕过 `enqueueGradingJob(...)`

### 某个能力突然集体报错
先查：
- `app_feature_flags`
- 环境变量开关
- `workflow_runs` 是否显示单一 step 大面积失败
