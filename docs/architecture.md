---
last_verified: 2026-09-09
owner: platform-harness
---

# Deskmate 架构总览

## 分层结构

`Types/Validation -> Infra Adapters -> Context Engineering -> Domain Services -> API Routes -> UI`

1. Types/Validation
- 位置：`types/*`、`lib/validation/*`
- 职责：统一类型与请求校验 schema。
- 基线：`types/chatflow.ts` 已成为稳定共享协议层；UI 侧 `components/main/chatflow/types.ts` 仅做 re-export。

2. Infra Adapters
- 位置：`lib/supabase/*`、`lib/ai/*`、`lib/ocr/*`、`lib/pdf/*`、`lib/api/client.ts`
- 职责：封装外部能力（数据库、模型、OCR、PDF、HTTP）。

3. Context Engineering
- 位置：`lib/context-engineering/*`、`lib/agent/runtime-context.ts`
- 职责：在运行时做上下文选取、压缩、隔离、重置与检索 query 增强；控制长期记忆、旧对话、上传材料、知识检索如何进入模型窗口。

4. Domain Services
- 位置：`lib/lesson-plan/*`、`lib/grading/*`、`lib/pbl/*`、`lib/assistant/*`、`lib/question-bank/*`、`lib/wechat*`
- 职责：实现业务规则与领域流程。

5. API Routes
- 位置：`app/api/**/route.ts`
- 职责：鉴权、入参校验、调用领域服务、返回协议。

6. UI
- 位置：`app/**`、`components/**`、`hooks/**`
- 职责：交互状态管理、展示、前端编排。

## 依赖方向（允许/禁止）

### 允许
- `UI -> API Client/Hooks -> API Routes`
- `API Routes -> Domain Services -> Infra Adapters`
- `Domain Services -> Types/Validation`
- `API Routes -> Types/Validation`

### 禁止
- `API Routes -> components/hooks/app`（后端不能依赖 UI）
- `API Routes` 内部相对导入（统一使用 `@/`）
- `API Routes` 运行时直连 `@supabase/supabase-js`/`@supabase/ssr`

### 已知例外（技术债）
- 部分 `lib/agent/*`、`lib/wechat-editor/*` 仍存在历史模型直连路径，尚未完全收口到统一 AI Gateway，属于待治理技术债。
- 当前仍待迁移的显式 legacy 入口包括 `lib/exam-agent/agent-orchestrator.ts` 等旧 Qwen 直连路径；已从 Demo 中删除的接口不再列为现存技术债。
- 记录见：`docs/plans/debt.md`。

## 横切关注点
- 鉴权与教师上下文：`lib/api/teacher-context.ts`、`lib/teachers/ensure-teacher.ts`
- 统一错误协议：`lib/api/response.ts#jsonError`
- 请求体解析：`lib/api/request.ts#parseJsonBody`
- 限流：`lib/api/rate-limit.ts`
- 模型路由：`lib/ai/model-router.ts`
- AI Gateway：`lib/ai/gateway.ts`
- 上下文工程：`lib/context-engineering/core.ts`、`lib/agent/runtime-context.ts`
- Provider Registry / 底层适配：`lib/ai/provider-registry.ts`、`lib/ai/openrouter-client.ts`
- Runtime 稳定性内核：`lib/runtime/app-error.ts`、`lib/runtime/deadline.ts`、`lib/runtime/retry.ts`、`lib/runtime/background-task.ts`、`lib/runtime/feature-flags.ts`、`lib/runtime/workflow-telemetry.ts`、`lib/runtime/workflow-profiles.ts`

## AI 调用层级

1. 业务层首选入口
- `API Routes` 与 `Domain Services` 需要模型能力时，先通过 `lib/ai/model-router.ts` 选型，再调用 `lib/ai/gateway.ts` 或 `lib/ai/structured-output.ts`。
- 业务层不应直接创建 provider、拼接第三方 headers/baseURL，或在模块内部散落重试、超时、错误码映射逻辑。
- 判卷链里的答案键推断与最终 AI 判分同样属于这条基线：`lib/grading/answer-key-inference.ts`、`lib/grading/grader.ts` 必须走 `model-router + gateway`，不要再在业务层直接调用 provider JSON 接口。

2. Gateway 职责
- 统一文本生成、流式输出、结构化输出的调用入口。
- `lib/ai/structured-output.ts` 作为业务层薄封装，当前同时提供同步结构化输出与 partial callback 驱动的结构化流式输出。
- 统一 requestId、provider/model 元数据、默认温度、错误映射、日志脱敏和 fallback 编排。
- 将上层业务与 OpenRouter、Moonshot、Anthropic 等底层 provider 解耦。

2.5 Context Engineering 职责
- 统一做“Write / Select / Compress / Isolate”四类操作：长期记忆、最近对话、上传材料、知识库、联网结果都不再在 Route 里随意拼接。
- 对“重新开始 / 忽略前文”这类 reset 指令做显式抑制，避免旧记忆和旧产物继续污染新任务。
- 对聊天历史做 relevance selection，只保留当前步骤所需片段，避免上下文膨胀与分心。
- 对检索 query 做增强，允许最近用户意图和稳定主题进入检索，但在 reset 模式下自动切断旧上下文。
- `lib/agent/task-state.ts` 负责把当前请求压成统一任务状态（教案 / 习题 / Rubric / 检索 / 摘要 / 通用），并给出来源优先级、上下文模式（新任务 / 延续）与可用工具集合；Route 和工具层不再各自猜任务。
- “从题库/现成题/我上传的题里找题”当前被视为独立的题目调取意图：正式 `/api/agent/chat` 只开放 `search_question_bank`，优先返回现成题与来源信息，而不是把这类请求误导向重新生成题目。
- `taskContext` 已降级为兼容字段；正式任务裁决以 `/api/agent/chat` 服务端当前 prompt、最近会话和 `contentAssetIds` 为准，不再依赖独立 preflight 先产出任务快照。
- `lib/agent/material-context.ts` 负责上传材料的任务感知压缩：同一份材料在教案、习题、Rubric、摘要场景下必须抽取不同重点，禁止把原文整段长文本直接塞进模型窗口。
- `/main/agent` 主聊天链当前只保留“当前输入 + 当前会话最近消息 + 当前资料索引”三层上下文；长期记忆能力不再进入主发送路径，避免额外首响负担。
- 教师知识库上传链路现在采用“原文档 + 分块索引”双轨：`app/api/knowledge/upload/route.ts` 在保存 `knowledge_documents` 后，会额外生成 `knowledge_document_chunks`；若 `OPENROUTER_API_KEY` 可用则写入 embedding 做语义检索，否则自动降级为关键词索引，上传本身不能因为 embedding 不可用而失败。
- 题目型知识库 PDF 当前会在上传成功后继续进入后台自动拆题：系统先保留原始 `knowledge_documents` 作为资料层，再在 `after()` 中复用 PDF 拆题 pipeline 抽出题目，写入 `exercises + exercise_import_batches` 作为题库层；资料页通过 `knowledge_documents.metadata.questionBank` 回看自动拆题状态、批次与待审核信息。
- 题库分类当前已进入“规则大类 + 轻量模型细分小类”的第二阶段：保存题目时先做规则型大类/主考察方式归类，再调用轻量模型把题目匹配到已有细分知识点，或提出候选新小类。正式字段除了 `knowledge_cluster / knowledge_tags / assessment_style / assessment_tags / classification_confidence / classification_status / classification_reasons` 之外，还会写入 `knowledge_subskill_key / knowledge_subskill_label / subskill_confidence / subskill_match_mode / subskill_reasons`。目标不是只区分“选择/填空/问答”，而是让题库开始围绕“考什么知识、怎么考”来自动整理。
- 教师知识库查询不再是“一次召回就结束”。`lib/assistant/knowledge-rag.ts` 现在会先执行 primary hybrid 检索（语义 + 关键词），随后做命中质量评估；当命中数量、关键词覆盖或语义强度偏低时，会自动生成更聚焦的 corrective query 再检一次，并把最终检索置信度、是否触发纠错和每次尝试的原因一起带回上层。

3. Infra 层职责
- `lib/ai/provider-registry.ts` 负责 provider 创建与公共元数据收口。
- `lib/ai/openrouter-client.ts` 负责 OpenRouter 裸请求适配，只供 Gateway 或专用 adapter 复用。
- 常规文本、流式、结构化输出与工具调用统一由 `lib/ai/gateway.ts` 收口；旧 `tool-adapter/vercel-sdk-adapter` 已退役，不再作为架构组成部分。
- 这些 Infra 文件不是业务层首选入口，避免让 Route 或领域服务直接依赖底层 provider 细节。

4. 允许的例外能力
- Anthropic 原生 web search / vision、Mathpix OCR、Supermemory 等专用外部能力，可保留独立 adapter。
- 即使属于例外能力，也必须通过项目内封装暴露给业务层，不能让业务模块直接请求第三方服务。

## 数据流（主链路）

1. 对话生成链路
- UI(`AgentWorkspacePage`) -> `/api/agent/chat` -> 服务端任务裁决/最小工具集/资料问答快路径 -> UI 左侧消息流写入摘要或问答，右侧 `ArtifactCanvas` 在文档型 tool-call 时自动展开完整正文与标签页。

2. 教案发布链路
- 生成/编辑 -> `/api/lesson-plans/[planId]/publish` -> 返回 `slug` -> 公共访问 `/lp/[slug]` 与 `/api/public/lesson-plans/[slug]`。

3. 判卷链路
- 创建 session -> 上传 submission -> OCR -> grade -> 人工 override -> 聚合统计。
- 题目卷进入答案键推断前，必须先做 OCR 文本归一化：保留题号、清除 Markdown heading 前缀（如 `## 1. Multiple Choice`），并剥离 `Multiple Choice / Free Response` 这类分区标题，避免把 2 题误拆成 4 题，连带放大评分 prompt 和超时风险。
- 判卷链的质量闸门不只看 SLA，也要看题量与语义是否正确：`answer-key/infer.analysis.totalQuestions` 必须和题目卷实际题量一致，再决定是否讨论 OCR / grading budget。
- `answer-key/infer` 与 `auto-grade` 现在共享 `lib/grading/quality-gates.ts` 的质量判断；答案键不完整、占位答案未消除或 OCR 缺题时，应优先降级成 `partial_result / manual_review_required`，而不是继续盲目扩大模型预算。
- 判卷异步 job 当前已经按职责拆成真实 workflow：`grading_answer_key_infer`、`grading_auto_grade`。观测、预算和并发保护都应围绕这两个 workflow 展开，而不是继续把所有判卷步骤混看成一个黑盒。

4. 微信内容链路
- 单一产品入口：`/main/wechat-editor`；根路径 `/` 是公开 Landing Page。
- 编辑器输入（文本/文档/图片）-> `/api/wechat-editor/*` -> HTML 清洗 -> 复制/导出。
- 兼容性说明：`/api/wechat/generate` 已冻结，仅返回弃用提示与迁移目标，不再承担生成逻辑。

## API Route Layer
- Route 层应保持“薄层编排”：鉴权 + 校验 + 调服务 + 协议映射。
- 业务计算（提示词拼装、评分、模板展开）应在 `lib/*` 领域层完成。
- `/api/agent/chat` 已进入“做薄后第二阶段”基线：Route 只保留认证、上下文准备、一次 direct dispatcher 分发和通用 chat 主干；PBL、教案、习题、组卷直连分支已抽到 `lib/agent/chat-direct-dispatch.ts` 与 `lib/agent/workflows/*`，Route 不再自己同时承担工作流细节、流式拼装和全部后置副作用。
- `/api/agent/chat`、`/api/lesson-plans/generate`、`/api/lesson-plans/[planId]/resume` 当前统一采用 Vercel AI SDK 的稳定 UI stream：服务端统一输出 `text/event-stream`，正式协议由原生 `text/tool/start-step/finish` chunk 与项目自定义 `data-agent-*` / `data-lesson-*` parts 组成；后续不要再新增自定义 NDJSON 聊天协议。
- `lib/agent/chat-stream.ts` 当前已从自定义 NDJSON 写流层切到 UI stream 封装；通用 chat、教案直出、习题直出、组卷与 PBL 直出都统一在这里写 `data-agent-*` 与原生 tool/text chunk，前端消费层收敛到 `lib/api/ui-message-stream.ts`，不要再在页面壳或新 Route 里手写新的流协议解析。
- `lib/agent/exercise-pipeline.ts` 已瘦为 297 行编排入口，具体实现拆到：
  - `lib/agent/exercise-pipeline-types.ts`
  - `lib/agent/exercise-pipeline-helpers.ts`
  - `lib/agent/exercise-pipeline-generation.ts`
  - `lib/agent/exercise-pipeline-verification.ts`
  - `lib/agent/exercise-pipeline-review.ts`
- 主工作流的后台副作用应继续沿用 `after()` / 任务排队处理：taxonomy、语义索引、内容库同步等后置任务不再阻塞老师先看到结果。
- Agent 正式主链只保留 `/api/agent/chat`；独立 `/api/agent/preflight` 已退役，不再参与产品主流程。
- Agent 主链的性能与 telemetry 当前以 `agent_chat` 为唯一正式预算：
  - 至少记录 `stream_first_visible`（老师第一次看到可见反馈的 TTFT）和 `stream_complete`（总耗时、toolNames、finish reason、预算状态）。
  - 这类预算与并发阈值统一收敛到 `lib/runtime/workflow-profiles.ts`，不要在 Route 里继续散落 magic number。
- `/api/agent/chat` 当前新增老师维度的轻量并发门槛：默认同一老师最多同时运行 2 条 Agent 主任务；超过后直接返回 `RATE_LIMITED`，优先保护主生成链和成本。

## 主工作台做薄基线
- `components/main/AgentWorkspacePage.tsx` 仍是当前前端热点，但资料上传与 UI stream 事件处理已经继续下沉；拆题/扫描流程不再属于 `/main/agent` 产品面。
- 主工作台空态/活跃态已拆到：
  - `components/main/agent/AgentWorkspaceIdleState.tsx`
  - `components/main/agent/AgentWorkspaceActiveState.tsx`
- 主工作台状态已继续下沉到：
  - `components/main/agent/use-agent-workspace-stream-state.ts`
  - `components/main/agent/use-agent-workspace-files.ts`
  - `components/main/agent/use-agent-workspace-history.ts`
  - `components/main/agent/use-agent-workspace-lifecycle.ts`
- 继续演进时，优先把“资料上传/引用”和“流式事件消费”留在专用 hooks 与侧栏组件里，不要再把实现回塞进 `AgentWorkspacePage.tsx`。
- 教案链的前端流式消费当前分两层：正式页面与新链路优先走 `lib/api/ui-message-stream.ts` 的 `parseLessonUiParts(...)`，旧 Hook / 适配器仍可通过 `lib/api/ndjson.ts` 的 `parseLessonStream(...)` 读取兼容后的 lesson 事件；新增代码优先接前者，不要再扩张旧兼容层。
- `AgentProgressPanel` 与 `ArtifactCanvas` 当前已经改成按需动态加载；老师没进入活跃态、也没点开引用块时，不应首屏提前挂载它们。
- 长对话默认只挂最近 18 条消息；流中的最后一条 assistant 消息先走轻量文本渲染，流结束后再切回 `RichMarkdown`。这两条目前都是 `/main/agent` 的正式性能基线。
- 教案、习题、组卷的直接工作流已经在 `lib/agent/workflows/*` 中独立承载；其中组卷已进一步拆为：
  - `lib/agent/workflows/worksheet-temp-pool.ts`
  - `lib/agent/workflows/worksheet-question-bank.ts`
  - `lib/agent/workflows/worksheet-direct.ts`（薄入口）
- 新增老师主任务时，优先新增 workflow handler，而不是继续把分支堆回 `/api/agent/chat/route.ts`。

## 流式协议基线
- 面向老师的长流程统一采用“阶段事件 + 完整结果块”：
  - `stage`
  - `tool-call`
  - `tool-result`
  - `question_block / artifact 引用块`
- 不再把多阶段流程压成单一 spinner；老师必须能先看到进度，再看到完整题块或正文块。

## 稳定性与后台任务基线
- 外部调用默认按“会失败”设计：typed error、deadline、retry、telemetry 统一经 `lib/runtime/*` 收口，不再在业务文件里散落实现。
- 用户可见长链同步流式；超长链路走后台 job：
  - 教案、习题、组卷：同步流式返回
  - 判卷、超长 PDF 处理：优先走异步 job / 轮询
- 主工作流的后台副作用默认使用 `scheduleReliableAfterTask(...)`，不再直接裸用 `after()` 做关键写入。
- 后台任务失败统一写入 `background_task_failures`，页面成功但数据刷新后缺失时，必须优先检查这张表。
- 判卷当前已经有独立 job 层：
  - 表：`grading_jobs`
  - 服务：`lib/grading/jobs.ts`
  - 查询接口：`/api/grading/jobs/:jobId`
  - 手动处理脚本：`scripts/grading/process-jobs.ts`
- Feature flag / kill switch 当前统一经 `lib/runtime/feature-flags.ts`，优先使用环境变量，数据库表 `app_feature_flags` 作为运行时兜底。

## Data Access Layer
- 统一由 `lib/supabase/*` 创建客户端；Route 通过上下文传入 service。
- 教师私有数据依赖 `teacher_id` 做隔离，公开内容通过显式发布状态/slug 输出。
- 教师知识库检索优先走 `knowledge_document_chunks` 的 chunk 级检索与页码引用，再回退到 Supermemory 文档搜索；不要再把整份 PDF 文本当成唯一检索单元。当前检索策略已接近 corrective RAG：先 hybrid 检索，再做质量评估，低质量时自动纠错重检，最后才决定把哪些证据交给生成链。
- 题目资料整理当前拆成两层：`knowledge_documents/pdf_scan_uploads` 负责资料层，`exercises + exercise_import_batches` 负责题库层。老师查题时应优先走题库结构化筛选与题干搜索，只有题库不足时才回退到资料层检索，避免把原始 PDF 块和标准化题目混成同一种索引。
- 旧题库在新增分类字段或细分知识点能力后，需要运行 `npm run question-bank:taxonomy` 做一次本地/环境内回填，否则页面会出现“只有大类、没有细分知识点”与筛选不一致的历史残留；后续新入库题目会在保存时自动写入大类和细分小类，不需要再额外补跑。
- Agent 聊天层已经接入题库检索工具：老师在 chatbox 中提出“找现成题”时，先通过 `search_question_bank` 从 `exercises` 里按题型、来源、题干与来源文件名检索；只有题库结果不足时，才由 Agent 继续建议老师补条件或改为生成新题。
- 业务层 AI 调用应先走统一 Gateway/Adapter，再触达 OpenRouter、Moonshot、Anthropic 等 provider，避免在业务模块散落 endpoint、headers、重试与错误处理。
- 例外能力（如 Anthropic 原生 web search / vision、Mathpix OCR、Supermemory）允许保留专用 adapter，但仍应通过统一的内部封装暴露，不要让业务模块直接拼接第三方请求。

## 代码实体清单（供 check-docs 校验）
- `app/api`
- `app/main`
- `components/main`
- `components/wechat-editor`
- `components/pbl`
- `hooks`
- `lib/ai`
- `lib/api`
- `lib/assistant`
- `lib/lesson-plan`
- `lib/grading`
- `lib/pbl`
- `lib/pdf`
- `lib/pdf-scan`
- `lib/wechat`
- `lib/wechat-editor`
- `lib/supabase`
- `types`
- `scripts`
