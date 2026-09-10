---
last_verified: 2026-03-21
owner: agent-workspace
---

# Agent Streaming Render Stability
状态: IN_PROGRESS

## 当前进度

### 已落地（2026-03-21）
- `Phase 1` 已开始落地，优先解决“卡”和“闪”：
  - [stream-runner.ts](/Users/martin/Documents/个人项目/official-start/components/main/agent/stream-runner.ts) 已把左侧 assistant 文本与右侧 artifact 文本从“每个 delta 直接提交”改为批量提交，并通过 `startTransition` 降低重渲染优先级。
  - [use-agent-workspace-stream-state.ts](/Users/martin/Documents/个人项目/official-start/components/main/agent/use-agent-workspace-stream-state.ts) 已增加 preview -> persisted 的稳定 display id 绑定，避免右侧标签和正文因 id 切换整块重挂。
  - [ArtifactDocumentView.tsx](/Users/martin/Documents/个人项目/official-start/components/main/agent/ArtifactDocumentView.tsx) 已去掉对 `artifact.summary/title` 抖动的重复接管触发，减少 preview 与统一文档之间的频繁重连。
- `Phase 2` 的 lesson-plan 首版已经落地：
  - [lesson-plan-direct.ts](/Users/martin/Documents/个人项目/official-start/lib/agent/workflows/lesson-plan-direct.ts) 已改为发送 `outline-solid + node-patch`，右侧 Canvas 可先起结构骨架，再持续补正文。
  - [markdown-outline-streaming.ts](/Users/martin/Documents/个人项目/official-start/lib/agent/markdown-outline-streaming.ts) 已切到“模型决定 outline，前端只负责 projector”的协议，不再依赖固定七段式章节。
  - `2026-03-21` 已补齐 `微课 / mini lesson / micro lesson / 课堂流程 / 课时安排` 的 lesson-plan 识别与分流，避免自由结构 prompt 落回普通聊天文本，确保 `/main/agent` 可以直接起 Canvas 流式正文。

### 已落地（2026-03-22）
- `Phase 3` 已开始按“统一 render snapshot”收口完成态接管：
  - [artifact-render-snapshot.ts](/Users/martin/Documents/个人项目/official-start/lib/agent/artifact-render-snapshot.ts) 新增统一 `DocumentModel + htmlContent` snapshot helper，不改 prompt，也不限制模型自由结构。
  - `lesson-plan / exercises / worksheet / exam / rubric` 的 workflow complete chunk 与 embedded payload 已开始统一写入 `document + htmlContent + renderVersion`，不再只靠 `rawContent`。
  - [artifact-utils.ts](/Users/martin/Documents/个人项目/official-start/components/main/agent/artifact-utils.ts) 派生 persisted artifact 时，已优先消费 embedded snapshot；`rawContent` 回退降级为 legacy-only。
  - [ArtifactDocumentView.tsx](/Users/martin/Documents/个人项目/official-start/components/main/agent/ArtifactDocumentView.tsx) 的 preview/readonly 接管已改为优先使用 canonical `htmlContent`，减少“生成中正常、完成后布局换一套”的漂移。

### 仍待完成
- `Phase 2` 仍未完全收口：lesson-plan 已有 outline projector，但还需要继续压缩 preview/persisted 接管时的编辑器抖动，并补更系统的弱网/长文回归。
- `Phase 3` 仍未完全收口：`exercises / worksheet / exam / rubric` 的完成态 snapshot 已开始统一，但 streaming projector、内容库细节链和整套 L2 验收还要继续补齐。

## 目标
把 `/main/agent` 右侧 Canvas 的流式生成体验收成一套稳定、轻量、可扩展的文档预览基础设施，重点解决以下问题：

- 右侧正文流式渲染卡顿
- 只有第一个 section 像在流，后续 section 整块弹出
- preview 切到正式文档时频繁闪烁
- 同类问题在 `lesson-plan / exercises / worksheet / exam / rubric` 上重复出现

## 当前问题

### 1. 流式提交太碎
- 客户端当前会把 artifact 文本拆成极小步进，并以接近 `10-14ms` 的频率推进可见内容。
- 每次推进都会触发右侧预览状态更新，导致 Canvas 高频重渲染。
- 左侧 assistant 文本也在每个 `text-delta` 上更新并触发滚动，进一步争抢主线程。

### 2. 右侧预览是“全文重建”，不是“增量补丁”
- 当前 streaming preview 主要基于 `rawContent -> fallback document/html` 的全量重建。
- markdown 每增加一点，都可能触发整份文档重新解析、重组装、重渲染。
- 文档越长，抖动和卡顿越明显。

### 3. lesson-plan 的流式协议过于扁平
- 现在教案主链流的是整份 markdown 文本，而不是“section 骨架 + section patch”。
- 前端不知道后面还有几个章节，只能等 markdown 标题和正文自然长出来。
- 结果就是第一个 section 看起来在流，后面的 section 往往一整段才出现。

### 4. preview 与 persisted document 接管不稳定
- 流式 preview 使用临时 id。
- 正式 artifact / document 落盘后，会切换到新的 persisted id。
- 这个切换会引发 tab 选中态、文档连接态、编辑器挂载态的重置，导致闪烁。

## 设计原则

### 1. 保留统一流式主链，不推翻现有 Vercel AI SDK 方案
- 服务端继续使用 `createUIMessageStream` / `createUIMessageStreamResponse`。
- 不回退到自定义 ndjson 聊天协议。
- 优先把问题解决在“事件粒度、数据结构、前端提交策略”上。

### 2. 生成中显示“排版中的文档”，不是原始文本
- 右侧 Canvas 的目标不是展示 token 本身，而是展示“正在成形的文档”。
- 生成阶段优先保持只读预览；正式完成后再接统一文档编辑器。

### 3. 先做通用底座，再扩到各类型
- 先收口“提交节流 + 无闪接管 + lesson-plan 骨架协议”。
- 跑稳后再扩到 `exercises / worksheet / exam / rubric`。
- 不一次性重构全部类型，避免回归面过大。

## 推荐方案

### Phase 1: 提交流式节流与无闪接管
目标：先解决“卡”和“闪”。

状态：已开始，核心止血补丁已落地；仍需继续做真实页面验收与量化。

#### 做法
- 客户端流式内容先写入 buffer/ref，不直接每个 delta 都触发 React 提交。
- 右侧可见状态改为按 `requestAnimationFrame` 或 `60-120ms` 节流批量提交。
- 右侧 preview 更新用 `startTransition` 标记为非紧急更新。
- 左侧 assistant 文本与自动滚动同步降频，不再和右侧一起抢主线程。
- preview 命中 persisted artifact 后，保持稳定的 display identity，避免因 id 切换卸载重挂。

#### 预期收益
- 右侧卡顿显著下降
- 页面闪动明显减少
- 主线程压力下降
- 不改变现有模型调用和业务语义

### Phase 2: lesson-plan 改为 section 骨架 + patch 协议
目标：解决“只有第一个 section 在流”的假流式问题。

#### 做法
- lesson-plan 在生成开始时先发送 outline / section shell。
- 右侧先渲染完整章节骨架，每个章节有 `loading` 状态。
- 后续正文按 `sectionId` 发送 patch，而不是只流整份 markdown。
- 当前章节正文按 token/短文本 patch 累积；已完成章节标记为 `complete`。
- 生成结束时，再合成正式 `DocumentModel` 和 persisted artifact。

#### 预期收益
- 用户一开始就知道整份教案结构
- 后续章节不再整块弹出
- 流式体验从“局部像流”提升为“整份文档都在逐步成形”

### Phase 3: 抽象统一 projector，扩到其他类型
目标：让 `lesson-plan / exercises / worksheet / exam / rubric` 共用一套流式文档预览模型。

#### 做法
- 抽象统一接口：`createStreamingProjector(kind)`。
- 每个 projector 维护自己的 preview state：
  - `lesson-plan`: `title + sections + currentSectionBuffer`
  - `exercises`: `title + questions + currentQuestionBuffer`
  - `worksheet/exam`: `title + groups + currentQuestionBuffer`
  - `rubric`: `title + rows + currentRowBuffer`
- projector 只输出轻量 preview state，不在热路径里反复构建完整 persisted document。
- 完成态再统一转换成 `DocumentModel` / `htmlContent`。

#### 预期收益
- 后续新类型接入成本下降
- “每个 artifact 各自流式修补”的重复劳动减少
- Agent 右侧 Canvas 更接近统一平台能力

## 明确不做

- 暂不一次性把全部 artifact 类型协议重写
- 暂不引入 Web Worker 作为第一轮主解法
- 暂不通过继续调模型参数来掩盖渲染问题
- 暂不在流式阶段直接挂载 Tiptap 可编辑态
- 暂不把 PDF 导出链一起混进本计划

## 实施顺序

1. `Phase 1`
2. `Phase 2`
3. `Phase 3`

原因：
- `Phase 1` 改动最小，能最快止血
- `Phase 2` 直接修正 lesson 假流式
- `Phase 3` 再做平台化扩展，避免过早抽象

## 步骤

- [x] `Phase 1` 收口流式提交频率，把左右两侧从“每个 delta 直接提交”改成批量提交，并补齐 preview -> persisted 的稳定 display id。
- [x] `Phase 2` 为 lesson-plan 接入 `outline-solid + node-patch` 协议，允许模型决定结构，前端只负责 projector 和骨架渲染。
- [ ] 继续压缩 lesson-plan 在弱网、长文下的 preview/persisted 接管抖动，并补齐对应真实回归。
- [~] 为 `exercises / worksheet / exam / rubric` 抽象统一 projector，去掉当前基于全文重建的流式预览。
- [x] 为 `lesson-plan / exercises / worksheet / exam / rubric` 的完成态建立统一 `document + htmlContent` render snapshot 契约，禁止新主路径只写 `rawContent`。
- [ ] 按类型补一轮真实 Agent 主路径验收，确认 Canvas、统一编辑器接管和导出链在新协议下仍正常。

## 完成标准

- `/main/agent` 的 lesson-plan、exercises、worksheet、exam、rubric 都使用“模型决定结构 + projector 逐块补丁”的统一流式预览协议。
- 右侧 Canvas 在生成过程中能先显示结构骨架，再持续补正文，不再依赖全文 markdown 重建。
- preview -> persisted -> 统一编辑器三段切换无白屏、无明显闪烁、无重复挂载。
- 真实验收中 `console error / pageerror / 静态资源 404 = 0`，关键生成接口单次耗时均满足项目基线。

## 验收标准

### Phase 1 验收
- 右侧 Canvas 流式时不再明显卡顿
- preview -> persisted 接管无白屏、无明显闪烁
- `console error / pageerror / 静态资源 404 = 0`

### Phase 2 验收
- lesson-plan 在 Agent 页面上，一开始即可见章节骨架
- 后续 section 逐步填充，不再整块跳出
- 首个 section、后续 section 都能被用户感知为“持续生成中”

### Phase 3 验收
- `exercises / worksheet / exam / rubric` 至少各完成 1 条 Agent 主路径真实验证
- 各类型均使用统一流式预览模型，而不是继续全文重建
- 统一文档接管与导出链不被破坏

## 风险与控制

### 风险 1：projector 越做越散
- 控制方式：先只做 lesson-plan，跑稳后再抽象公共接口。

### 风险 2：preview 与 persisted 状态错位
- 控制方式：增加稳定 display id；正式接管前不销毁 preview 视图。

### 风险 3：改动过大影响现有主链
- 控制方式：严格按阶段推进，每阶段只改一层问题，不做全量翻修。

## 预估收益

- 右侧流式提交频率显著下降，主线程压力预计下降 `30% - 60%`
- lesson-plan 的后续章节“整块弹出”问题预计基本消失
- preview / persisted 接管闪烁预计显著下降
- 对总模型生成时间影响有限，但对“可见速度”和“流式平滑度”的体感提升非常明显
