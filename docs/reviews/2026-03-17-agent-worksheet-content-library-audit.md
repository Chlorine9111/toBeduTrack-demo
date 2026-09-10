# Agent 组卷 / 内容库 / 题库 / 对话续写链路审查

审查时间：2026-03-17

## 范围

本次只审查以下链路：

1. 前端组卷链路
2. 前端把产物保存到用户内容库 / 题库
3. 同一对话是否能引用上次生成结果继续生成下一步内容

本次以静态代码审查 + 现有回归脚本/测试为主，未重跑完整浏览器 L1 UX 验收。

## 已核对的证据

- 代码主线：
  - `components/main/AgentWorkspacePage.tsx`
  - `components/main/agent/ArtifactCanvas.tsx`
  - `app/api/agent/chat/route.ts`
  - `lib/agent/chat-direct-dispatch.ts`
  - `lib/agent/workflows/exercise-direct.ts`
  - `lib/agent/workflows/exercise-save-followup.ts`
  - `lib/agent/workflows/worksheet-question-bank.ts`
  - `lib/agent/workflows/worksheet-temp-pool.ts`
  - `app/api/content-library/save-artifact/route.ts`
  - `lib/exercises/save-service.ts`
  - `components/main/content-library/ContentLibraryRenderers.tsx`
  - `lib/agent/workflows/rubric-direct.ts`
  - `lib/agent/material-context.ts`
- 已运行测试：
  - `node --import tsx tests/followup/agent-preflight.spec.ts`：通过
  - `node --import tsx tests/followup/exercise-save-followup.spec.ts`：通过
  - `node --import tsx tests/followup/worksheet-shared.spec.ts`：通过
  - `node --import tsx tests/followup/task-context.spec.ts`：通过
  - `node --import tsx tests/followup/chat-direct-dispatch.spec.ts`：通过
  - `npm run context:regression`：失败

## 结论摘要

结论不是“整条链都坏了”，而是：

- 组卷主链本身没有看到立刻会阻断的致命问题，且已有 question-bank / temp-pool / preflight / save-follow-up 的专项测试与脚本。
- 但“保存到内容库”与“引用上一轮结果继续做下一步”这两块目前是分场景成立、不是统一成立。
- 其中有 2 个高优先级问题会直接导致用户感知与文档基线不一致。

## 高优先级问题

### 1. 习题保存到题库后，没有真正同步进入内容库

状态：确认存在

证据：

- 运行基线明确要求习题链路应走 `runApExercisePipeline -> saveExercises -> syncExerciseContentLibraryItem`：
  - `docs/runbooks/runtime-baselines.md:105`
  - `docs/error-patterns.md:68-72`
- 但实际习题主链在保存时显式传了 `syncToContentLibrary: false`：
  - `lib/agent/workflows/exercise-direct.ts:331-337`
  - `lib/agent/workflows/exercise-save-followup.ts:748-757`
- 后置分类阶段也继续传 `syncContentLibrary: false`：
  - `lib/agent/workflows/exercise-direct.ts:476-495`
  - `lib/agent/workflows/exercise-save-followup.ts:840-854`
- `saveExercises` 虽然声明了 `syncToContentLibrary?: boolean`，但函数体里并没有任何真正消费这个参数、也没有调用 `syncExerciseContentLibraryItem(...)`：
  - `lib/exercises/save-service.ts:12-19`
  - `lib/exercises/save-service.ts:26-352`
- 全仓检索 `syncExerciseContentLibraryItem(` 只有定义，没有实际调用点。

影响：

- 老师在聊天里看到“已保存到题库”，并不等于能在内容库里看到对应 question 项。
- 这和项目文档里“题库/内容库同步”基线直接冲突。
- 后续如果老师从内容库而不是题库入口回看，会出现“题目已经有了，但内容库没有”。

建议：

1. 把 `syncExerciseContentLibraryItem(...)` 放到 `saveExercises` 后置副作用里统一收口。
2. 保留主链“先写 exercises，再异步补 taxonomy / semantic / content library”，不要把内容库同步重新塞回主响应阻塞。

### 2. Canvas 的“保存到内容库”会把大部分结构化产物降级成普通文本，内容库详情页还按纯文本直出

状态：确认存在

证据：

- 前端保存按钮统一把 `artifact.rawContent` 当 `markdown` 发给 `/api/content-library/save-artifact`：
  - `components/main/agent/ArtifactCanvas.tsx:157-173`
- 服务端除了 `lesson-plan` 外，worksheet / exercises / rubric / research / notes 全都落成 `rendererType: "markdown"`，快照也统一写成 `{ kind: "markdown", markdown: ... }`：
  - `app/api/content-library/save-artifact/route.ts:19-62`
  - `app/api/content-library/save-artifact/route.ts:104-128`
- 内容库详情页对 `snapshot.kind === "markdown"` 并没有走 `RichMarkdown` 或文档引擎，而是直接 `whitespace-pre-wrap` 纯文本渲染：
  - `components/main/content-library/ContentLibraryRenderers.tsx:368-375`

影响：

- worksheet / rubric 等在 Canvas 里是结构化文档，保存后进入内容库会退化成纯文本。
- 如果 `artifact.rawContent` 里是文档型 HTML 或 markdown，用户在内容库看到的会和 Canvas 完全不是一套呈现。
- 这条链路对“保存成功”是成立的，对“保存后仍可正常阅读/复用”不成立。

建议：

1. `save-artifact` 不要把所有非 lesson plan 都压成 `markdown`。
2. 至少应区分：
   - 文档型产物：保存 `document` 或统一 `document_id`
   - 真 markdown 产物：再走 markdown renderer
3. 在内容库详情页里，`snapshot.kind === "markdown"` 至少先改成 `RichMarkdown`，避免当前纯文本退化。

## 中优先级问题

### 3. “基于上一版继续生成”目前只在部分产物上成立，Rubric refine 实际没有引用上一版内容

状态：确认存在

证据：

- dispatch 层确实把“上一版 rubric 微调”识别成 rubric 请求：
  - `lib/agent/chat-direct-dispatch.ts:341-349`
- 但真正的 `handleRubricRequest` 只接收当前 prompt、taskContext、上传材料摘要；没有接收上一版 rubric 内容，也没有读取 `latestAssistantArtifact`：
  - `lib/agent/workflows/rubric-direct.ts:43-70`
  - `lib/agent/workflows/rubric-direct.ts:89-177`
- 对比之下，教案 refine 明确把上一版正文和上下文传进去了：
  - `lib/agent/chat-direct-dispatch.ts:306-338`
  - `lib/agent/workflows/lesson-plan-direct.ts:62-119`

影响：

- 用户说“按上一版 rubric 调整一下维度/权重”时，前端和 preflight 看起来像支持续写，但实际生成更像“按当前 prompt 重新生成一版”。
- 这会造成“同一对话续写”的错觉，尤其是用户以为自己在 edit previous artifact，实际上只是在 new generation。

建议：

1. 给 rubric 直连链补 `previousRubric` / `latestAssistantArtifact` 输入。
2. 与 lesson plan 一样，区分 fresh / continuation / reset。

### 4. “把刚生成的题继续组成 worksheet”没有真正复用上一轮题目结果，只会沿用用户文本上下文

状态：确认存在

证据：

- 只要 `taskContext.action === "create_worksheet"` 且是 continuation，就会继续走 exercise direct path：
  - `lib/agent/workflows/exercise-followup-routing.ts:56-63`
- `handleExerciseRequest` 会把最近用户消息拼成 `exerciseRequestText`，然后再次走 `resolveApExerciseCurriculum -> runApExercisePipeline`，没有读取上一轮 assistant 题目块：
  - `lib/agent/workflows/exercise-direct.ts:75-101`
  - `lib/agent/workflows/exercise-direct.ts:178-206`
- 仓内只有 `exercise-save-followup.ts` 会反解上一轮 assistant 题目正文：
  - `lib/agent/workflows/exercise-save-followup.ts:320-358`
- 也就是说，目前“上一轮题 -> 继续保存到题库”是实现了的，但“上一轮题 -> 直接组 worksheet”没有对应实现。

影响：

- 用户说“把刚才那几道题直接组一套卷子”时，很可能会重新生成题，而不是基于上一轮已生成题做组卷。
- 这不符合“引用上次生成结果继续做下一步”的用户预期。

建议：

1. 仿照 `findLatestExerciseArtifact()` 增加“从上一轮题目正文提取题块 -> 组 worksheet”的直连链。
2. 或者显式限制产品语义，把这类请求转成“先保存到题库，再从题库组卷”，避免误导用户。

## 低优先级问题 / 回归信号

### 5. 上下文工程回归脚本当前失败，材料上下文已经退化成“整段拼接”，丢了任务感知标签

状态：确认存在

证据：

- `npm run context:regression` 当前失败。
- 失败断言要求教案/习题材料上下文保留任务感知文案：
  - `scripts/context/context-engineering-regression.ts:214-233`
- 但当前 `buildTaskAwareMaterialContext()` 已退化成把全文直接拼起来，不再按任务类型输出“可用于教案的材料摘录 / 可用于出题的材料摘录”：
  - `lib/agent/material-context.ts:17-57`

影响：

- 这会降低“根据上传材料继续生成”的可控性。
- 对“基于刚才那份讲义继续做下一步”的链路尤其不利，因为材料上下文没有任务提示层。

建议：

1. 先修回归，让 `context:regression` 重新通过。
2. 即使维持“全文进入大上下文”的策略，也要保留 task-aware 前缀和最小摘要层。

## 当前哪些场景是成立的

以下能力我认为目前是“基本成立”的：

- 题库组卷主链：
  - `question-bank worksheet`
  - `temp-pool worksheet`
- 习题生成后 follow-up 保存到题库
- 教案在同一对话中的 refine / continuation
- PBL 在同一对话中的 continuation

支撑证据：

- `tests/followup/agent-preflight.spec.ts` 通过
- `tests/followup/exercise-save-followup.spec.ts` 通过
- `tests/followup/worksheet-shared.spec.ts` 通过
- `tests/followup/task-context.spec.ts` 通过
- `tests/followup/chat-direct-dispatch.spec.ts` 通过

## 当前哪些场景不应宣称“已支持”

以下能力不建议对外宣称“已经稳定支持”：

- rubric 基于上一版继续微调
- 把上一轮生成的题直接组成 worksheet
- worksheet / rubric / exercises 从 Canvas 保存到内容库后仍保持结构化阅读体验
- “保存到题库后，内容库一定同步可见”

## 测试覆盖缺口

当前仓里已有验证：

- `save-artifact` 只看到 lesson plan 场景的 UX 脚本：
  - `scripts/ux/verify-agent-lesson-plan-speed.mjs`

但没有看到专项覆盖：

- rubric continuation / refine
- “上一轮 exercises -> worksheet”
- worksheet / rubric / exercises 的 `save-artifact` 后内容库详情渲染

这意味着即使主链看起来能点通，上述回归也很容易再次发生。

## 建议修复顺序

1. 先修“题库保存后不同步内容库”
2. 再修“save-artifact 保存后内容库渲染退化”
3. 再补“exercise -> worksheet follow-up”与“rubric refine”两条真实 continuation 能力
4. 最后补对应 UX / follow-up 回归脚本

## 一句话判断

如果问题是：

- “现在前端组卷能不能基本跑通？”答案是：大体能。
- “保存到题库后会不会同时体面地进入内容库？”答案是：当前不可靠，且代码上已能确认存在缺口。
- “一次对话能不能统一地引用上次生成结果继续生成下一步？”答案是：只在教案、PBL、习题保存 follow-up 等部分场景成立，不是统一成立。
