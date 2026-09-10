# 教案生成质量优化 — 实施指令

> 本文档是给 coding AI 的实施 prompt，涵盖教案（Lesson Plan）生成流程的 8 项质量优化。
> 按 P0 → P3 优先级排列，每项说明目标、当前问题、推荐方案、涉及文件和验收标准。
> **不包含具体代码**，由你根据项目现有架构和风格自行实现。

---

## 项目上下文

- **项目路径**: `/Users/mac/Documents/toBeduTrack`
- **技术栈**: Next.js (App Router) + TypeScript + Supabase + Kimi (Moonshot) + DeepSeek
- **教案生成核心文件**:
  - `lib/lesson-plan/ai.ts` — AI 生成函数（outline、section blocks、rewrite）
  - `lib/lesson-plan/types.ts` — 所有类型定义
  - `lib/lesson-plan/templates.ts` — 4 种教学模板
  - `lib/lesson-plan/block-factory.ts` — block 工厂和 fallback
  - `lib/lesson-plan/intent.ts` — 意图解析、偏好提取
  - `lib/lesson-plan/defaults.ts` — 默认偏好值
  - `lib/ai/quality-review.ts` — 双层质量审查（rule-based + DeepSeek）
  - `lib/ai/gateway.ts` — 统一文本/结构化/tool calling 收口
  - `lib/ai/model-router.ts` — 模型路由
  - `lib/ai/prompts/system.md` — AP Calculus 系统 prompt
  - `app/api/lesson-plans/generate/route.ts` — 流式生成主入口
  - `lib/validation/lesson-plan.ts` — Zod 请求验证

---

## P0-1: Block Content 强类型 Schema

### 当前问题

`lib/lesson-plan/ai.ts` 中的 `blockSchema` 对 `content` 字段使用 `z.record(z.string(), z.unknown())`，不做任何结构验证。LLM 输出结构不完整的 block（如 quiz 缺少 explanation、math 缺少 latex）时，代码照单全收，直接写入数据库。

### 目标

对每种 block type 的 content 做精确结构验证，在解析阶段就拦截结构性废品。

### 实施方案

1. **在 `lib/lesson-plan/types.ts` 中定义每种 block type 的 content 类型**：
   - `heading`: 必须有 `level`（"h2" | "h3"）和 `text`（非空字符串）
   - `paragraph`: 必须有 `text`（非空字符串）
   - `math`: 必须有 `latex`（非空字符串）和 `displayMode`（布尔值）
   - `image`: 必须有 `url`（字符串）和 `alt`（字符串）
   - `callout`: 必须有 `title`（字符串）和 `text`（非空字符串）
   - `divider`: 空对象即可
   - `definition`: 必须有 `term`（非空字符串）和 `explanation`（非空字符串）
   - `example`: 必须有 `prompt`（非空字符串）和 `steps`（非空字符串数组，至少 1 步）
   - `steps`: 必须有 `title`（字符串）和 `items`（非空字符串数组，至少 1 项）
   - `quiz`: 必须有 `question`（非空字符串）、`options`（至少 2 项，每项有 id 和 text）、`correctOptionId`（非空字符串）、`explanation`（非空字符串）
   - `poll`: 必须有 `question`（非空字符串）和 `options`（至少 2 项，每项有 id 和 text）

   参考 `lib/lesson-plan/block-factory.ts` 中 `createBlock` 函数的默认值结构——那就是每种 type 应有的标准字段。

2. **在 `lib/lesson-plan/ai.ts` 中用 Zod discriminated union 替换当前的宽松 `blockSchema`**：
   - 使用 `z.discriminatedUnion("type", [...])` 按 type 字段路由到对应的严格 schema
   - 如果 LLM 输出无法通过严格验证，对该单个 block 做降级处理（使用 `block-factory.ts` 中的 `createBlock` 生成同 type 的默认 block），而不是丢弃整个 section

3. **同步更新 `LessonPlanBlock` 类型**：
   - 将 `content: Record<string, unknown>` 改为 discriminated union 类型
   - 确保 `block-factory.ts` 的 `createBlock` 和 `buildFallbackSectionBlocks` 与新类型兼容

4. **同步更新 tool schema 中的 content 描述**：
   - 在 `generateSectionBlocksWithAi` 和 `rewriteBlockWithAi` 的 tool definition 中，为 `content` 字段的 `description` 加入每种 type 的必填字段说明
   - 这样 LLM 在 tool-calling 时就知道应该输出什么结构，而不是靠 system prompt 文字说明

### 涉及文件

- `lib/lesson-plan/types.ts`（新增 content 联合类型）
- `lib/lesson-plan/ai.ts`（替换 blockSchema，更新 tool definition）
- `lib/lesson-plan/block-factory.ts`（确保类型兼容）
- `lib/validation/lesson-plan.ts`（如有相关验证也需更新）

### 验收标准

- LLM 输出缺少 quiz explanation 时，该 block 被替换为默认 quiz block，不会写入空 explanation
- LLM 输出 math block 没有 latex 字段时，被替换为默认 math block
- 已有的 E2E 测试和 fallback 逻辑不受影响
- TypeScript 编译通过，无类型错误

---

## P0-2: 逐 Section 快速校验 + 重试机制

### 当前问题

`app/api/lesson-plans/generate/route.ts` 的生成循环中，每个 section 生成后直接写入数据库并流式推送，**没有任何质量校验**。质量审查只在所有 section 全部生成完毕后才运行，此时低质量内容已经落库。

### 目标

在每个 section 生成后立即做轻量级 rule-based 校验，不过关则重试一次，重试仍不过关则使用 fallback。

### 实施方案

1. **在 `lib/lesson-plan/ai.ts` 中新增一个函数 `validateSectionBlocks`**：
   - 输入：生成的 blocks 数组、section 信息、preferences
   - 输出：`{ valid: boolean; issues: string[] }`
   - 校验规则（全部为纯规则检查，不调用 LLM，耗时 < 5ms）：
     - block 数量 >= 2
     - 每个 block 都通过了 P0-1 的强类型 schema（意味着 content 结构完整）
     - 至少有 1 个 block 带 cedCode
     - 如果 preferences.quizDensity 不是 "low"，且 section 标题含"检验/quiz/模拟"，则必须有 quiz 或 poll block
     - 如果 preferences.includeTeacherNotes 为 true，至少有 1 个 block 有 teacherNote
   - 不需要检查内容语义，只检查结构完整性

2. **在 `generateSectionBlocksWithAi` 函数中加入重试逻辑**：
   - 第一次生成后调用 `validateSectionBlocks`
   - 如果不过关，**重试一次**，在重试的 userPrompt 末尾追加具体失败原因，例如："上一次生成失败，原因：缺少 quiz block、2 个 block 的 content 结构不完整。请修正。"
   - 重试仍不过关则使用 `buildFallbackSectionBlocks` 返回 fallback blocks
   - 最多重试 1 次，避免无限循环
   - 重试时使用相同的 model 和 temperature

3. **在流式输出中增加 `section_warning` 事件（可选增强）**：
   - 当 section 经过重试后仍使用 fallback 时，在 NDJSON 流中发送：`{"type": "section_warning", "sectionIndex": N, "issues": [...]}`
   - 前端收到后可以高亮该 section，提示教师关注

### 涉及文件

- `lib/lesson-plan/ai.ts`（新增 validateSectionBlocks，修改 generateSectionBlocksWithAi）
- `app/api/lesson-plans/generate/route.ts`（可选：增加 section_warning 事件）

### 验收标准

- 当 LLM 首次输出的 section blocks 缺少 cedCode 时，能触发重试
- 重试的 prompt 包含具体失败原因
- 重试成功则使用重试结果，重试仍失败则使用 fallback
- 总延迟增加 < 3 秒（仅在重试时有额外开销）
- 正常情况下（首次就过关）无任何额外开销

---

## P1-1: Section 间上下文传递

### 当前问题

`lib/lesson-plan/ai.ts` 的 `generateSectionBlocksWithAi` 只接收 outline 阶段的 `previousSummary` 和 `nextSummary`，看不到前一个 section 已经生成的**具体 blocks 内容**。导致重复例子、断裂的概念衔接。

### 目标

让每个 section 的生成能感知前序 section 的关键内容，实现去重和语义衔接。

### 实施方案

采用"压缩摘要 + 内容注册表"双机制：

1. **新增一个函数 `extractSectionDigest`**（放在 `lib/lesson-plan/ai.ts` 中）：
   - 输入：已生成的 `LessonPlanSection`
   - 输出：一段 3-5 行的纯文本摘要
   - 纯规则提取，不调用 LLM，逻辑如下：
     - 提取 heading blocks 的 text → "标题"
     - 提取 definition blocks 的 term → "定义了：[term1, term2]"
     - 提取 example blocks 的 prompt 前 50 字 → "例题概要：[...]"
     - 提取 quiz/poll blocks 的 question 前 50 字 → "检测题：[...]"
     - 提取 math blocks 的 latex 前 40 字 → "涉及公式：[...]"
     - 提取 callout blocks 的 title → "提示：[...]"
   - 输出格式示例：
     ```
     Section "导入情境"(8min): 定义了 derivative；用抛物线运动例子引入；公式 f'(x)=lim...
     ```

2. **新增一个 `ContentRegistry` 结构**（放在 `lib/lesson-plan/ai.ts` 中）：
   - 维护已使用内容的去重列表：
     - `usedExamples: string[]` — 已用例题 prompt 摘要
     - `definedConcepts: string[]` — 已定义术语
     - `quizQuestions: string[]` — 已出现检测题
     - `usedFormulas: string[]` — 已出现公式
   - 每生成完一个 section，调用一个 `updateRegistry` 函数更新注册表
   - 纯规则提取，不调用 LLM

3. **修改 `generateSectionBlocksWithAi` 的参数和 prompt**：
   - 新增可选参数：`previousDigests?: string[]`（前序 section 的摘要列表）和 `contentRegistry?: ContentRegistry`
   - 在 userPrompt 中追加两段上下文：
     - "已生成章节摘要：\n[各 section digest]"
     - "请避免重复以下内容：\n- 已用例题：[...]\n- 已定义概念：[...]\n- 已出检测题：[...]"

4. **修改 `app/api/lesson-plans/generate/route.ts` 的生成循环**：
   - 在循环中维护 `digests: string[]` 和 `registry: ContentRegistry`
   - 每生成完一个 section，用 `extractSectionDigest` 提取摘要，用 `updateRegistry` 更新注册表
   - 将它们传入下一个 section 的生成调用

### 涉及文件

- `lib/lesson-plan/ai.ts`（新增 extractSectionDigest、ContentRegistry、updateRegistry；修改 generateSectionBlocksWithAi 参数和 prompt）
- `app/api/lesson-plans/generate/route.ts`（生成循环中维护和传递上下文）

### 验收标准

- 当第 1 节用了"抛物线运动"例子时，第 2 节的 prompt 中能看到"已用例题：抛物线运动..."
- 当第 1 节定义了"derivative"时，第 2 节的 prompt 中能看到"已定义概念：derivative"
- digest 提取和 registry 更新均为纯规则操作，不额外调用 LLM
- 每个 section 的 prompt 额外增加的 token 量 < 300 tokens

---

## P1-2: 学生水平差异化策略

### 当前问题

`lib/lesson-plan/ai.ts` 的 `renderPreferences` 只输出 `学生水平：basic/medium/advanced` 一行文字，没有给 LLM 具体的差异化生成策略。3 个水平生成出来的教案几乎没有区别。

### 目标

让不同学生水平的教案在内容深度、脚手架密度、题目难度上有明显差异。

### 实施方案

1. **在 `lib/lesson-plan/ai.ts` 中新增一个函数 `renderLevelStrategy`**：
   - 输入：`studentLevel: LessonPlanStudentLevel`
   - 输出：一段水平策略文本，将被拼入 section 生成的 systemPrompt
   - 三个水平的策略定义：

   **basic（基础）**：
   - 每个新概念必须先给 definition block，紧跟 example block 做示范
   - steps block 的每一步只包含单一操作，不合并步骤
   - quiz 只考单一知识点，不做跨知识点综合
   - 必须包含至少 1 个 misconception callout（预判常错点）
   - 语言优先使用具象类比和生活化表达
   - 避免出现未经解释的术语和符号

   **medium（中等）**：
   - 概念引入可以更紧凑，但仍需 example 做支撑
   - quiz 可以综合 2 个知识点
   - 适当引入"为什么会这样"类的引导性问题（think callout）
   - 例题中适度包含分步推导

   **advanced（进阶）**：
   - 概念引入更快，减少 scaffolding
   - 必须包含至少 1 个 think callout（引导深层反思）
   - quiz 考跨知识点综合能力，可包含多步推理题
   - 鼓励包含 connection callout（联系其他单元或数学分支）
   - 例题可包含证明思路或开放性问题
   - 可引入未解决问题或拓展方向

2. **修改 `generateSectionBlocksWithAi` 的 systemPrompt**：
   - 在现有系统提示后追加 `renderLevelStrategy(preferences.studentLevel)` 的输出
   - 同样修改 `generateOutlineWithAi` 和 `rewriteBlockWithAi` 的 systemPrompt

3. **在 `lib/ai/quality-review.ts` 的 `reviewLessonRule` 中增加水平维度检查**：
   - basic 教案若无 definition block → 扣 5 分，issues 记录"基础水平教案缺少明确概念定义"
   - basic 教案若无 misconception/warning callout → 扣 3 分
   - advanced 教案若无 think 或 connection callout → 扣 4 分，issues 记录"进阶教案缺少深层思考引导"
   - 这些检查加在 `reviewLessonRule` 函数现有打分逻辑的后面，作为额外的水平维度加减分

### 涉及文件

- `lib/lesson-plan/ai.ts`（新增 renderLevelStrategy；修改 3 个生成函数的 systemPrompt）
- `lib/ai/quality-review.ts`（在 reviewLessonRule 中增加水平维度检查）

### 验收标准

- basic 水平的教案比 medium 多出明显的 definition 和 misconception blocks
- advanced 水平的教案包含 think/connection callout
- rule-based review 能准确检测并扣分
- 3 个水平的教案在结构上有可辨识的差异

---

## P2-1: maxTokens 动态调整

### 当前问题

`lib/lesson-plan/ai.ts` 中 `generateSectionBlocksWithAi` 写死了 `maxTokens: 2400`。对 5 分钟的小节浪费 token，对 30+ 分钟的大节不够用导致输出被截断。

### 目标

根据 section 时长动态调整 maxTokens，在成本和质量之间取得平衡。

### 实施方案

1. **在 `lib/lesson-plan/ai.ts` 中新增一个函数 `calculateMaxTokens`**：
   - 输入：`durationMinutes: number`
   - 输出：`number`
   - 计算公式：`baseTokens(1200) + durationMinutes * tokensPerMinute(80)`
   - 下限 1400，上限 4800
   - 这意味着：
     - 5 分钟 → 1600 tokens
     - 10 分钟 → 2000 tokens
     - 15 分钟 → 2400 tokens（和当前一样）
     - 30 分钟 → 3600 tokens
     - 45 分钟 → 4800 tokens

2. **修改 `generateSectionBlocksWithAi` 的 `callTool` 调用**：
   - 将硬编码的 `maxTokens: 2400` 替换为 `calculateMaxTokens(params.section.durationMinutes)`

3. **同步调整 block 数量上限**：
   - 当前 `blockArraySchema` 写死了 `max(10)`
   - 对于 30+ 分钟的 section，可能需要 12-15 个 blocks
   - 新增一个函数 `calculateMaxBlocks`：`Math.min(15, Math.max(3, Math.floor(durationMinutes / 3)))`
   - 在构建 tool schema 时动态设置 `maxItems`

### 涉及文件

- `lib/lesson-plan/ai.ts`（新增 calculateMaxTokens、calculateMaxBlocks；修改 generateSectionBlocksWithAi）

### 验收标准

- 5 分钟的 section 调用时 maxTokens 为 1600
- 30 分钟的 section 调用时 maxTokens 为 3600
- 大 section 的 block 数量上限随之放宽
- 现有测试不受影响

---

## P2-2: 模板约束式 Outline 生成

### 当前问题

`lib/lesson-plan/ai.ts` 的 `generateOutlineWithAi` 给 LLM 完全的自由度生成 outline 结构，可能完全忽略 `templates.ts` 中定义的教学框架（如 concept 模板的"导入→定义→展开→例题→检验→小结"递进结构）。模板的教学设计智慧（Bloom's taxonomy 递进）在 AI 生成模式下被浪费。

### 目标

让 AI 在模板框架内填充创造性内容，而不是推翻框架。

### 实施方案

1. **在 `lib/lesson-plan/ai.ts` 中新增一个函数 `renderTemplateConstraint`**：
   - 输入：`templateKind: LessonPlanTemplateKind`、`totalMinutes: number`
   - 输出：一段模板约束文本，描述必须遵守的章节结构
   - 基于 `templates.ts` 中的 `TEMPLATE_SECTIONS` 定义，为每种模板生成约束文本
   - 每种模板的约束文本应包含：
     - 必须有的章节功能（如"必须有导入环节、概念定义环节、检验环节"）
     - 章节的教学目的说明（如"导入情境：用贴近学生经验的问题激活前置知识"）
     - 建议的时间分配比例
   - 明确告诉 LLM：**可以调整具体标题和细节，但必须保持各环节的功能和先后顺序**

2. **修改 `generateOutlineWithAi` 的 userPrompt**：
   - 在现有 prompt 的"请生成完整大纲"指令前，插入 `renderTemplateConstraint` 的输出
   - 调整措辞为："请基于以下教学框架生成大纲，你可以调整每节的标题、摘要和时长分配，但必须保持框架中各环节的教学功能和逻辑顺序。"

3. **不需要修改 templates.ts 本身**，只是读取它的数据来构建 prompt 约束。

### 涉及文件

- `lib/lesson-plan/ai.ts`（新增 renderTemplateConstraint；修改 generateOutlineWithAi 的 prompt）
- `lib/lesson-plan/templates.ts`（不修改，只读取）

### 验收标准

- concept 模板生成的 outline 必然包含"概念定义"和"检验"功能的 section
- sprint 模板生成的 outline 必然包含"限时练习"功能的 section
- AI 的创造性体现在标题措辞和具体内容上，而非结构推翻
- outline 的 section 数量仍在 3-8 范围内

---

## P3-1: CED 对齐语义验证

### 当前问题

`lib/ai/quality-review.ts` 的 `reviewLessonRule` 只统计 block 上标注的 `cedCodes` 覆盖率。但 LLM 可以随意标注 cedCode 而实际内容不涉及对应知识点（"标签挂靠"现象）。

### 目标

在 DeepSeek 审查阶段增加对 CED 对齐真实性的检测。

### 实施方案

1. **修改 `lib/ai/quality-review.ts` 中的 `LESSON_REVIEW_CRITERIA` 常量**：
   - 在现有评分标准后追加一段 CED 对齐验证要求：
     - 要求审查模型逐一检查标注了 cedCode 的 block，判断其内容是否真正涉及该 LO/EK 描述的能力
     - 如果发现"标签挂靠"（标了 code 但内容无关），在 issues 中明确标注
     - CED 对齐真实性占总评分的权重约 10-15%

2. **修改 `composeAuditPrompt` 函数**：
   - 在传给 DeepSeek 的 prompt 中，增加 LO/EK 的完整描述文本（不只是 code），让审查模型有足够信息判断对齐真实性
   - 当前 `referenceText` 已经包含了 LO/EK codes，需要扩展为包含 description

3. **在 `reviewLessonRule` 的 rule-based 层面增加一个粗粒度检查**：
   - 对标注了 cedCode 的 block，检查其 content 的文本（用 collectText 提取）是否包含对应 LO/EK description 中的关键词
   - 这是一个低成本的文本匹配检查，不需要 LLM
   - 如果某个 block 标了 cedCode 但文本中无任何对应关键词，标记为 "可疑对齐"

### 涉及文件

- `lib/ai/quality-review.ts`（修改 LESSON_REVIEW_CRITERIA、composeAuditPrompt、reviewLessonRule）

### 验收标准

- 一个标了 FUN-3.C（Chain Rule）但内容只是纯文本描述没有任何链式法则相关内容的 block，能被标记为可疑
- DeepSeek 审查报告中出现 CED 对齐真实性的具体 issue 描述
- 不影响没有标注 cedCode 的 block 的评分

---

## P3-2: DeepSeek 审查评分锚定

### 当前问题

DeepSeek 审查模型没有评分参照物，可能出现系统性偏高或偏低。`mergeReviews` 中的加权系数（0.45/0.55、0.35/0.65）未经校准。

### 目标

通过 few-shot 示例锚定 DeepSeek 的评分尺度，减少跨模型评分偏差。

### 实施方案

1. **在 `lib/ai/quality-review.ts` 中新增一个常量 `LESSON_SCORING_ANCHORS`**：
   - 包含 3 个评分锚定示例，分别代表优秀（90+）、良好（75-85）、不及格（<60）
   - 每个示例包含：简短的教案摘要（约 3-5 行描述结构和内容特点）、标准分数、评分理由（1-2 句）
   - 示例内容应覆盖 AP Calculus 的典型教案场景
   - 注意示例要精炼，3 个锚定示例总计不超过 400 tokens

2. **修改 `composeAuditPrompt` 函数**：
   - 在 prompt 开头（评分标准之后、待评内容之前）插入锚定示例
   - 措辞："以下是 3 个已标定的评分参照——请据此校准你的评分尺度："
   - 锚定示例之后再给出待评内容

3. **对 exercise 和 rubric 域也分别新增对应的锚定示例**（EXERCISE_SCORING_ANCHORS、RUBRIC_SCORING_ANCHORS），格式相同。

### 涉及文件

- `lib/ai/quality-review.ts`（新增 3 组锚定常量；修改 composeAuditPrompt）

### 验收标准

- DeepSeek 审查的 prompt 中包含 3 个评分参照示例
- 对同一份教案，加入锚定前后的评分差异应缩小（可通过手动对比验证）
- 总 prompt token 增加 < 500 tokens

---

## 实施顺序总结

```
Phase 1 (P0): 先做 P0-1 和 P0-2，这两个是质量底线保障
  P0-1 Block Schema → P0-2 Section 校验（P0-2 依赖 P0-1 的 schema 验证）

Phase 2 (P1): 再做 P1-1 和 P1-2，这两个提升内容质量上限
  P1-1 上下文传递 和 P1-2 水平差异化 可以并行

Phase 3 (P2): 然后做 P2-1 和 P2-2
  P2-1 动态 maxTokens（改动最小，1 个函数）
  P2-2 模板约束（改 prompt 即可）

Phase 4 (P3): 最后做 P3-1 和 P3-2
  P3-1 CED 语义验证
  P3-2 评分锚定
```

## 通用约束

- **保持 immutability 原则**：不要 mutate 已有对象，创建新对象
- **文件大小控制**：如果某个文件因改动变得超过 400 行，考虑拆分为独立模块
- **每个 Phase 完成后运行 `npx tsc --noEmit` 确保类型安全**
- **新增函数必须有对应的单元测试**
- **不要修改数据库 schema**，所有优化都在应用层完成
- **不要变更 NDJSON 流式协议的现有事件格式**（meta/section/complete/error），只允许新增事件类型
- **保持向后兼容**：前端消费流式数据的代码不应因为这些改动而 break
