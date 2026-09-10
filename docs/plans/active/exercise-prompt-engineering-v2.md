---
last_verified: 2026-03-12
owner: ai-quality
---

# 习题生成 Prompt 工程改进方案 v2
状态: IN_PROGRESS

> 状态：部分实施（更新于 2026-03-11）
> 优先级：P0 → P3
> 影响范围：`lib/ai/prompts/`、`lib/ai/prompt-assembler.ts`、`lib/ai/exercise-generator.ts`

## 目标

在不重写整条习题生成链的前提下，补齐 prompt 工程的薄弱环节，让不同学科、不同题型、不同难度下的生成稳定性更高，减少冷启动格式漂移、学科规则偏差和答案校验缺口。

## 步骤

- [x] 梳理当前 system/user prompt 组装路径，识别 AP 轨道学科提示缺失、few-shot 冷启动为空、MCQ/FRQ 学科规则过于偏数学等核心问题。
- [x] 明确 P0/P1/P2/P3 的落地顺序，优先补学科 prompt 注入、MCQ/FRQ 多学科规则和静态 fallback 示例。
- [ ] 补齐 `5 学科 × 2 题型 × 3 难度` 的静态 fallback 示例矩阵，减少新主题/新课程的冷启动漂移。
- [ ] 收紧 self-check、负面约束与答案验证策略，降低“格式对了但题目质量不稳”的漏网问题。
- [ ] 结合真实生成失败样本补 eval 数据集，把 prompt 调整和可回归验证绑定起来。

## 实施状态更新（2026-03-11）

已完成：
- AP 轨道学科 prompt 注入
- `anti-patterns.md` 注入 system prompt
- `self-check.md` 升级为 7 项检查
- `exercise.md` 增加 Thinking Order / Diversity Instruction / Output Field Order
- MCQ 学科干扰项规则与 FRQ 学科 rubric 规则装配
- 难度定义量化
- `loadExerciseExamples()` 静态 fallback 链
- 动态 temperature 策略
- diversity seed 注入
- 首批静态 fallback 示例：5 学科 × 2 题型

未完成：
- 静态 fallback 示例尚未补齐 `5 学科 × 2 题型 × 3 难度` 全矩阵，目前仍缺更多 easy/hard 分层样例

---

## 一、现状诊断

### 当前 Prompt 组装流程

```
System Prompt = identity.md
              + curriculum-rules.md
              + (AP轨道: 空 | 通用轨道: subject-hint-chinese/english)  ← 问题1
              + mcq-rules.md 或 frq-rules.md                          ← 问题2
              + latex-standards.md
              + self-check.md                                          ← 问题6

User Prompt   = exercise.md 模板
              + CED 数据（课程/单元/主题/LO/EK）
              + 难度定义                                                ← 问题5
              + Few-shot 示例（可能为空）                                ← 问题3
              + 教师自定义请求
              + 生成指令
```

### 已识别的 9 个问题

| # | 问题 | 优先级 | 影响 |
|---|------|--------|------|
| 1 | AP 轨道学科 Prompt 缺失 | P0 | 所有 AP 学科质量无学科特定指导 |
| 2 | MCQ/FRQ 规则偏向微积分 | P0 | 非数学学科题目质量差 |
| 3 | Few-shot 冷启动为空 | P1 | 新课程输出格式不稳定 |
| 4 | 缺少负面约束 | P2 | 偶发超纲/歧义/重复 |
| 5 | 难度定义过于抽象 | P2 | 难度控制不精确 |
| 6 | Self-check 太弱 | P2 | 漏网的质量问题 |
| 7 | 缺少 CoT 答案验证 | P1 | 答案正确率低 |
| 8 | Temperature=0 限制多样性 | P3 | 重复生成时题目雷同 |
| 9 | 缺少字段顺序指导 | P3 | 偶发逻辑倒置 |

---

## 二、P0 修复：AP 轨道学科 Prompt 注入

### 问题代码

```typescript
// lib/ai/prompt-assembler.ts:784
track === "general" ? loadGeneralSubjectHint(subjectCategory) : Promise.resolve("")
//                                                               ^^^^^^^^^^^^^^^^^^
// AP 轨道硬编码返回空字符串
```

### 修复方案

```typescript
// 改为：AP 轨道也加载学科 Prompt
track === "general"
  ? loadGeneralSubjectHint(subjectCategory)
  : loadSubjectHintFromContext(context)  // 新函数：根据 courseName 自动检测学科
```

## 完成标准

- AP 轨道与通用轨道都能稳定拿到正确的学科提示，不再出现 AP 轨道学科 prompt 为空。
- MCQ / FRQ 的学科规则至少覆盖数学、历史、经济、英语、科学五大类，不再默认按微积分题思路生成所有学科。
- 冷启动时能从静态 fallback 示例里拿到稳定格式参考，减少输出结构漂移。
- Prompt 调整后有对应的 eval 或真实回归样本，不再只靠肉眼抽查判断效果。

新增辅助函数：

```typescript
async function loadSubjectHintFromContext(context: SystemPromptContext): Promise<string> {
  const subject = detectSubjectCategory(context.courseName);
  if (!subject) return "";
  return loadSubjectHint(subject);
}
```

### 学科检测覆盖表（确认 `detectSubjectCategory` 已覆盖）

| courseName 关键词 | 映射到 | Prompt 文件 |
|------------------|--------|-------------|
| Calculus, Statistics, Precalculus | math | subject-hint-math.md |
| English Language, English Literature | english | subject-hint-english.md |
| US History, World History, Government | history | subject-hint-history.md |
| Macroeconomics, Microeconomics | economics | subject-hint-economics.md |
| Physics, Chemistry, Biology | science | subject-hint-science.md |
| Psychology | 🚫 缺失 | 需新建 |
| Computer Science | 🚫 缺失 | 需新建 |
| Environmental Science | 🚫 缺失 | 可复用 science |

---

## 三、P0 修复：MCQ/FRQ 规则多学科化

### 现状问题

`mcq-rules.md` 干扰项示例全是微积分：

```markdown
Sign/arithmetic error → "Dropping a negative sign during chain rule"
Incomplete procedure → "Applying power rule but forgetting inner derivative"
```

AP History / Economics / English 生成 MCQ 时，这些示例毫无参考价值。

### 方案：分学科干扰项规则

#### 文件结构

```
lib/ai/prompts/tasks/
├── mcq-rules.md                    # 通用 MCQ 结构规则（保留）
├── mcq-distractors-math.md         # 数学干扰项规则（新建）
├── mcq-distractors-history.md      # 历史干扰项规则（新建）
├── mcq-distractors-economics.md    # 经济干扰项规则（新建）
├── mcq-distractors-english.md      # 英语干扰项规则（新建）
├── mcq-distractors-science.md      # 科学干扰项规则（新建）
├── frq-rules.md                    # 通用 FRQ 结构规则（保留）
├── frq-rubric-math.md              # 数学 FRQ 评分规则（新建）
├── frq-rubric-history.md           # 历史 FRQ 评分规则（新建）
└── ...
```

#### 各学科 MCQ 干扰项设计规则

**数学（保留现有 + 补充）**：

```markdown
| 类别 | 示例 |
|------|------|
| 符号/算术错误 | Chain rule 漏乘内层导数；积分符号错误 |
| 步骤遗漏 | 只做了求导没有代入求值 |
| 概念混淆 | 混淆 f'(a) 与 f(a)；用平均变化率代替瞬时变化率 |
| 公式记错 | $\frac{d}{dx}[\sin x] = -\cos x$ |
| 边界错误 | IVT 区间端点写反 |
```

**历史（新建）**：

```markdown
| 类别 | 示例 |
|------|------|
| 时间错位 | 将二战后事件归因到一战时期政策 |
| 因果倒置 | 将结果当成原因（工业化导致城市化 vs 城市化导致工业化） |
| 相似事件混淆 | 混淆 Monroe Doctrine 与 Roosevelt Corollary |
| 过度概括 | "所有殖民地都反对英国统治"（忽略 Loyalists） |
| 史料误读 | 将作者的反讽当作字面意思 |
| 视角单一 | 只从统治者视角理解事件，忽略被压迫者立场 |
```

**经济学（新建）**：

```markdown
| 类别 | 示例 |
|------|------|
| 曲线方向错误 | 供给减少时画成需求左移 |
| 因果传导链断裂 | 跳过中间环节（利率↑ 直接导致 GDP↓，省略投资↓） |
| 短期/长期混淆 | 用短期 Phillips Curve 结论套长期 |
| 名义/实际混淆 | 混淆名义 GDP 与实际 GDP 的变动方向 |
| 局部/全局混淆 | 单个市场的供需分析套用到宏观经济 |
| 政策效果反转 | 紧缩性财政政策说成扩张效果 |
```

**英语（新建）**：

```markdown
| 类别 | 示例 |
|------|------|
| 修辞手法误认 | 将 metaphor 错认为 simile（缺少 like/as） |
| 作者意图过读 | 将描述性段落解读为论证性段落 |
| 论证结构误判 | 混淆 concession 与 refutation |
| 证据范围错误 | 选项引用了文本以外的"常识"作为推理依据 |
| 语气误读 | 将 ironic tone 误认为 sincere praise |
| 因果 vs 并列 | 将时间上相邻的事件误解为因果关系 |
```

**科学（新建）**：

```markdown
| 类别 | 示例 |
|------|------|
| 单位错误 | 混淆 N 与 kg（力与质量）；mol 与 g |
| 变量控制错误 | 混淆自变量和因变量 |
| 公式误用 | 在非匀速运动中使用 $v = d/t$ |
| 实验设计缺陷 | 没有对照组的结论当作有效推断 |
| 微观/宏观混淆 | 用分子行为直接解释宏观现象（无桥接） |
| 数量级错误 | 计算正确但小数点位置错误 |
```

### 装配方式

```typescript
// renderSystemPrompt() 中，根据学科加载对应的干扰项规则
if (taskType === "mc_exercise") {
  taskModule = await loadTaskModule("mcq-rules");
  const subject = detectSubjectCategory(context.courseName);
  if (subject) {
    const distractorRules = await tryLoadTaskModule(`mcq-distractors-${subject}`);
    if (distractorRules) {
      taskModule += "\n\n" + distractorRules;
    }
  }
}
```

---

## 四、P1 修复：Few-shot 静态 Fallback

### 现状

```typescript
// exercise.md 模板
"If no reference exercises are provided above, follow the task rules strictly..."
// → 数据库为空时 LLM 没有任何格式参考
```

### 方案：Hardcoded Static Examples

```
lib/ai/prompts/examples/
├── exercise-mc-math-easy.json
├── exercise-mc-math-medium.json
├── exercise-mc-math-hard.json
├── exercise-fr-math-easy.json
├── exercise-mc-history-medium.json
├── exercise-mc-economics-medium.json
├── exercise-mc-english-medium.json
├── exercise-mc-science-medium.json
└── ...
```

每个文件包含 1-2 个高质量手工标注的范例题目（从真实 AP 考试改编）。

### 加载逻辑

```typescript
// lib/curriculum/loader.ts - loadExerciseExamples() 末尾追加
if (results.length === 0) {
  // 数据库没有示例 → 加载静态 fallback
  const subject = await detectSubjectFromCourse(courseId);
  const fallback = await loadStaticExerciseExample(subject, exerciseType, difficulty);
  if (fallback) results.push(fallback);
}
```

### 优先级链

```
数据库精确匹配（课程+题型+难度） → 数据库邻近难度 → 静态学科示例 → 空
```

---

## 五、P1 修复：Chain-of-Thought 答案验证

### 现状问题

```typescript
// exercise-generator.ts:84-90
const raw = await generateStructuredObject({
  // ... 直接生成完整 JSON
  temperature: 0,
});
```

LLM 在生成结构化 JSON 时推理能力受限，容易出现：
- `correctAnswer` 写 "B" 但 `options` 里 B 不是正确答案
- `solutionSteps` 推导出的结果与 `correctAnswer` 不一致

### 方案 A：Prompt 内 CoT（低改动，推荐先行）

在 `exercise.md` 模板中增加字段顺序指令：

```markdown
## Thinking Order (CRITICAL)

For each exercise, you MUST think in this exact order:

1. **Pick the target LO/EK** — decide which knowledge point to test
2. **Design the scenario** — create a concrete context (numbers, data, text passage)
3. **Solve it yourself** — work through the full solution step by step
4. **Write questionText** — now formulate the question stem
5. **Write solutionSteps** — document your full solution from step 3
6. **Write correctAnswer** — extract the final answer from your solution
7. **Design distractors** — for MC: create wrong answers from real student errors
8. **Self-verify** — re-solve from scratch; if answer differs, revise

NEVER decide the correct answer before solving the problem.
NEVER copy-paste between exercises — each must be independently solved.
```

### 方案 B：两阶段生成（大改动，后续考虑）

```typescript
// 阶段1：自由推理，生成文本解题过程
const reasoning = await generateText({
  systemPrompt: "You are an AP exam item writer. Solve the following problem step by step.",
  userPrompt: `Design a ${difficulty} ${exerciseType} question about: ${topicContext}`,
  temperature: 0,
});

// 阶段2：结构化提取
const structured = await generateStructuredObject({
  systemPrompt: "Extract the exercise from the reasoning below into the required JSON schema.",
  userPrompt: reasoning.text,
  schema: exerciseAIOutputSchema,
});
```

**方案 B 优点**：推理质量高、答案更准确
**方案 B 缺点**：延迟翻倍、token 消耗翻倍

**建议**：先实施方案 A，收集质量数据后再决定是否需要方案 B。

---

## 六、P2 修复：难度定义量化

### 现状

```
Level 1 (Easy):
- Direct application of a single Essential Knowledge statement.
- One-step computation or direct recall of a definition/theorem.
```

### 改进为量化标准

```markdown
## Difficulty Tier: Easy (Level 1)

**Cognitive demand**: Recall / Direct Application (Bloom's Level 1-2)

**Quantitative constraints**:
- Stem: ≤ 2 sentences (excluding given information)
- Solution: 1-2 steps, involving exactly 1 LO/EK
- MC distractors: based on single-point errors (one sign flip, one formula swap)
- No multi-concept synthesis required
- Student should solve in < 90 seconds

**AP exam equivalent**: Straightforward MC items; FRQ part (a)

**What NOT to do at this level**:
- Do not require combining knowledge from multiple EKs
- Do not embed the question in a complex real-world scenario
- Do not require justification or proof — only computation or identification

---

## Difficulty Tier: Medium (Level 2-3)

**Cognitive demand**: Application / Analysis (Bloom's Level 3-4)

**Quantitative constraints**:
- Stem: 2-4 sentences, may include a scenario or data table
- Solution: 3-5 steps, involving 2-3 LOs/EKs from the same unit
- MC distractors: based on procedural errors (incomplete process, wrong method selection)
- Requires selecting and applying the correct method
- Student should solve in 2-4 minutes

**AP exam equivalent**: Standard MC items; FRQ parts (b)-(c)

**What NOT to do at this level**:
- Do not require cross-unit synthesis
- Do not require original proof construction
- Do not reduce to a single-step lookup (that's Easy)

---

## Difficulty Tier: Hard (Level 4)

**Cognitive demand**: Synthesis / Evaluation (Bloom's Level 5-6)

**Quantitative constraints**:
- Stem: may include extended scenario, data set, or passage (3-6 sentences)
- Solution: ≥ 5 steps, involving cross-topic or cross-unit connections
- MC distractors: based on deep conceptual errors (wrong model selection, flawed reasoning chain)
- Requires justification, proof, or multi-step strategic reasoning
- Student should solve in 4-8 minutes

**AP exam equivalent**: Challenging MC items; FRQ parts (c)-(d)

**What NOT to do at this level**:
- Do not make it hard by adding irrelevant complexity (long numbers, unnecessary context)
- Do not go beyond the CED scope — difficulty comes from depth, not breadth
- Do not require knowledge not listed in the provided EKs
```

---

## 七、P2 修复：负面约束清单

新建文件 `lib/ai/prompts/system/anti-patterns.md`：

```markdown
## Anti-patterns (NEVER do these)

### Content errors
- NEVER introduce concepts, formulas, or theorems not covered by the provided LOs/EKs
- NEVER create a question whose correct answer requires knowledge from a later unit
- NEVER fabricate data that contradicts real-world facts (e.g., negative population)

### Ambiguity errors
- NEVER write a question where 2+ options could be argued as correct
- NEVER use vague qualifiers ("sometimes", "often", "generally") in the correct answer
- NEVER write a stem that can be interpreted in multiple valid ways

### Duplication errors
- NEVER produce two exercises that test the same concept with only surface-level changes
  (e.g., changing numbers but keeping identical structure)
- NEVER reuse a stem structure from the provided few-shot examples

### Difficulty inflation
- NEVER make an Easy question artificially complex by adding unnecessary steps
- NEVER make a Hard question by simply combining two Easy questions

### Format errors
- NEVER use placeholder text: "TBD", "to be determined", "example answer"
- NEVER reference external resources: "as shown in the textbook", "see figure 3"
- NEVER include meta-commentary: "this is a good question because..."
```

### 注入位置

在 `renderSystemPrompt()` 中，追加到 `curriculum-rules.md` 之后：

```typescript
const sections = [
  identityModule.trim(),
  buildCurriculumBlock(context),
  rulesModule.trim(),
  antiPatternsModule.trim(),    // ← 新增
  // ...
];
```

---

## 八、P2 修复：Self-check 增强

### 现状

```markdown
Before returning any output:
1. Scope — Does every element align to the provided LOs/EKs?
2. Format — Are all math expressions in valid LaTeX?
3. Schema — Does the output match the required tool schema?
```

### 改进为 7 项检查

```markdown
## Pre-submission Checklist (MUST complete before returning)

### Correctness checks
1. **Re-solve**: For each exercise, re-derive the answer from scratch using a different
   method if possible. If your re-derived answer differs from `correctAnswer`, revise.
2. **Distractor validity** (MC only): Verify no distractor could be argued as correct.
   For each distractor, confirm it maps to a specific, named student error.

### Scope checks
3. **CED alignment**: Does every exercise test ONLY the provided LOs/EKs? If you referenced
   knowledge from outside the provided context, remove it.
4. **Difficulty match**: Re-read the difficulty definition. Does the cognitive demand of
   each exercise match the requested tier? Count the solution steps — do they fall within
   the specified range?

### Format checks
5. **LaTeX**: Are all math expressions in valid LaTeX with balanced `$` delimiters?
   Check that no bare math appears outside LaTeX.
6. **Schema completeness**: Are all required fields populated? No empty strings, no "TBD"?
7. **Uniqueness**: Are all exercises substantively different from each other AND from
   the provided few-shot examples?
```

---

## 九、P3 修复：Temperature 策略

### 方案

```typescript
// exercise-generator.ts
function resolveTemperature(input: ExercisePromptInput): number {
  // 单题 → 确保正确性
  if (input.count === 1) return 0;

  // 批量生成 → 适度多样性
  if (input.count <= 3) return 0.3;

  // 大批量 → 更高多样性
  return 0.5;
}
```

### 配合 Prompt 多样性种子

在 `exercise.md` 模板中追加：

```markdown
## Diversity Instruction
{{#if DIVERSITY_SEED}}
Variation seed: "{{DIVERSITY_SEED}}"
Use this seed to guide your creative choices — select different scenarios, contexts,
and problem structures than you would by default. Do NOT repeat patterns from the
few-shot examples.
{{/if}}
```

在 `buildExercisePrompt()` 中注入随机情境关键词：

```typescript
const diversitySeeds = [
  "real-world application", "graphical interpretation", "data table analysis",
  "common misconception", "historical context", "experimental design",
  "comparison between models", "edge case exploration", "visual reasoning",
];
const seed = diversitySeeds[Math.floor(Math.random() * diversitySeeds.length)];
```

---

## 十、P3 修复：字段顺序指导

在 `exercise.md` 尾部追加：

```markdown
## Output Field Order (IMPORTANT)

When generating each exercise in the JSON output, populate fields in this exact order:

1. `topicId` — anchor to curriculum
2. `type` — MC or FR
3. `difficulty` — match the requested tier
4. `questionText` / `stem` — write the full question stem
5. `options` (MC only) — write all 4 options with labels A-D
6. `solutionSteps` — write the complete solution BEFORE deciding the answer
7. `correctAnswer` — extract from your solution (MUST match an option label for MC)
8. `distractor_rationale` (MC only) — explain each wrong option's error source
9. `loIds`, `ekIds` — tag with curriculum codes

This order ensures you solve before answering, preventing answer-first bias.
```

---

## 十一、改进后的完整 Prompt 组装流程

```
System Prompt (改进后):
  ├── identity.md                           (不变)
  ├── buildCurriculumBlock()                (不变)
  ├── curriculum-rules.md                   (不变)
  ├── anti-patterns.md                      (新增 §七)
  ├── subject-hint-{学科}.md               (修复 §二：AP轨道也加载)
  ├── mcq-rules.md + mcq-distractors-{学科}.md  (修复 §三)
  │   或 frq-rules.md + frq-rubric-{学科}.md
  ├── latex-standards.md                    (不变)
  └── self-check.md                         (增强 §八)

User Prompt (改进后):
  ├── Curriculum Context (CED 数据)         (不变)
  ├── Difficulty Definition (量化版)         (改进 §六)
  ├── AP Command Verbs Reference            (不变)
  ├── Few-shot Examples (含 static fallback) (改进 §四)
  ├── Teacher Request                       (不变)
  ├── Thinking Order (CoT 指令)             (新增 §五)
  ├── Diversity Instruction                 (新增 §九)
  ├── Generation Instructions               (不变)
  ├── Output Field Order                    (新增 §十)
  └── Pre-submission Checklist (7项)        (增强 §八)
```

---

## 十二、实施路线图

### Phase 1：Quick Wins（1-2 天）

- [ ] 修复 `renderSystemPrompt()` 让 AP 轨道加载学科 Prompt
- [ ] 增强 `self-check.md` 为 7 项检查
- [ ] 新建 `anti-patterns.md` 并注入 system prompt
- [ ] 在 `exercise.md` 中增加 Thinking Order 和 Output Field Order

### Phase 2：学科规则（3-5 天）

- [ ] 新建 5 个 `mcq-distractors-{学科}.md`
- [ ] 新建 5 个 `frq-rubric-{学科}.md`
- [ ] 修改 `renderSystemPrompt()` 按学科加载对应规则
- [ ] 改进难度定义为量化标准

### Phase 3：示例与多样性（3-5 天）

- [ ] 为 5 个学科 × 2 题型 × 3 难度准备 static fallback 示例
- [ ] 修改 `loadExerciseExamples()` 增加 fallback 链
- [ ] 实现 temperature 动态策略
- [ ] 实现 diversity seed 注入

### Phase 4：验证与调优（持续）

- [ ] 对比改进前后的习题质量（人工评分 + LLM 评分）
- [ ] 收集各学科生成失败率数据
- [ ] 根据数据决定是否需要两阶段生成（方案 B）

---

## 十三、验收标准

| 指标 | 当前估计 | 目标 |
|------|---------|------|
| AP 数学题答案正确率 | ~85% | ≥ 95% |
| AP 非数学题格式合规率 | ~60% | ≥ 90% |
| 干扰项可追溯率（每个干扰项对应具体错误） | ~40% | ≥ 90% |
| 难度一致性（请求难度 vs 实际难度） | ~70% | ≥ 85% |
| 冷启动课程首次生成成功率 | ~75% | ≥ 95% |
| 批量 5 题去重率（无重复结构） | ~60% | ≥ 90% |
