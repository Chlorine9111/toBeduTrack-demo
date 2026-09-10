# 题目内容生成速度优化 - 实施指令

## 项目背景

本项目 (toBeduTrack) 是 AP Calculus 教师 AI 教学助手，核心功能之一是通过 Kimi (Moonshot AI) 生成练习题。当前生成 5 道 MC 题的完整流程耗时约 20-35 秒，需要优化到用户可接受的体验。

## 技术栈

- Next.js 15.3.1 (App Router)、React 19、TypeScript
- Kimi API (OpenAI 兼容格式)，模型 kimi-k2-turbo-preview
- DeepSeek API (质量审查)
- Supabase (PostgreSQL + Auth)
- NDJSON 流式响应

## 当前瓶颈分析

生成 5 道题的完整链路（非流式模式）：

```
数据加载 (~200ms)
→ Prompt 组装 (~50ms)
→ AI 生成 (~5-8s)
→ AI 验证 × N题 (~3-8s/题，总 ~15-25s)
→ 验证失败重试 (0-2 轮，每轮 ~8-15s)
→ 质量审查 DeepSeek Chat (~2-4s)
→ 质量审查 DeepSeek Reasoner (~3-6s，条件触发)
→ 返回结果
```

Progressive Streaming 模式下首题 ~7s 可见，但全流程仍阻塞在验证和审查环节。

## 优化目标

- 首题可见时间：7s → 5s 以内
- 全部完成时间：20-35s → 10-15s
- 质量不降级：规则审查分数不低于当前水平
- 零架构大改：不引入消息队列、不拆微服务

---

## 优化 1：按难度分层验证策略 [P0]

### 涉及文件

- `app/api/ai/exercises/generate/route.ts` — 主路由，验证调用入口
- `lib/ai/exercise-validator.ts` — 验证逻辑

### 当前行为

所有难度的题目统一执行 AI 验证 (`regenerateOnFailure`)，包括 Level 1 (Easy) 的单步计算题。全局开关 `EXERCISE_SKIP_VERIFY` 只能全开或全关。

### 目标行为

根据题目难度动态决定验证策略：

| 难度 | 验证策略 | 理由 |
|------|---------|------|
| Level 1 (Easy) | 跳过 AI 验证，仅做本地规则校验 | 单步计算，AI 生成准确率高 |
| Level 2 (Medium) | 跳过 AI 验证，仅做本地规则校验 | 2-3 步计算，system prompt 已要求自检 |
| Level 3 (Hard) | AI 验证，不重试 | 多步推理有出错可能，但重试成本过高 |
| Level 4 (Hard+) | AI 验证 + 最多重试 1 次 | 复杂题验证价值最高 |

### 实施要点

1. 新增一个函数（如 `getVerificationStrategy`），接收 `difficulty` 参数，返回 `{ shouldVerify: boolean, maxRetries: number }`
2. 在 `route.ts` 中替换当前的 `skipVerification` 全局判断，改为按题目难度逐题判断
3. 对跳过 AI 验证的题目，仍需做本地规则校验：
   - MC 题：检查 options 有 4 个、correctAnswer 在 A-D 中、有 solutionSteps
   - FR 题：检查 correctAnswer 和 solutionSteps 非空
4. 跳过验证的题目 `verificationStatus` 设为 `"rule_checked"`（新增状态值），与 `"pending"` 和 `"verified"` 区分
5. 保留 `EXERCISE_SKIP_VERIFY` 环境变量作为全局覆盖（向后兼容）
6. Progressive Streaming 模式中同样适用此策略

### 验收标准

- Level 1-2 的题目不再触发任何 AI 验证调用
- Level 3-4 的题目验证行为不变（Level 3 重试次数降为 0）
- 现有测试通过，新增测试覆盖分层策略逻辑

---

## 优化 2：质量审查异步化 [P0]

### 涉及文件

- `app/api/ai/exercises/generate/route.ts` — `reviewGeneratedExercises` 调用点
- `lib/ai/quality-review.ts` — 审查逻辑
- `hooks/use-exercises.ts` — 前端 stream 事件处理

### 当前行为

在 `createProgressiveStreamResponse` 中，所有题目生成完毕后，同步调用 `reviewGeneratedExercises`（可能触发 DeepSeek Chat + Reasoner），完成后才发送 `type: "complete"` 事件。

### 目标行为

将审查分为同步和异步两部分：

**同步部分（阻塞流响应）**：
- 仅执行 `reviewExerciseRule`（纯本地规则评分，< 1ms）
- 将规则审查结果附在 `type: "complete"` 事件中

**异步部分（不阻塞流响应）**：
- 利用 Next.js 15 的 `after()` API（从 `next/server` 导入）在响应发送后执行 DeepSeek 审查
- DeepSeek 审查完成后，将完整评分结果存入 Supabase（新建表或复用现有字段）
- 前端可通过独立 API 端点查询最终审查结果（可选实现，不阻塞本次优化）

### 实施要点

1. 从 `quality-review.ts` 中将 `reviewExerciseRule` 导出为独立可调用函数（当前已包含在 `reviewExerciseGeneration` 内部），使路由层可以单独调用规则审查
2. 在 `route.ts` 的 `createProgressiveStreamResponse` 中：
   - 替换 `reviewGeneratedExercises` 调用为仅 `reviewExerciseRule`
   - 在流关闭前（或使用 `after()`）安排异步执行完整 `reviewExerciseGeneration`
3. 修改 `type: "complete"` 事件结构，增加 `qualityReviewMode` 字段标识 `"rule_only"` 或 `"full"`
4. 前端 `use-exercises.ts` 兼容新的 `qualityReviewMode` 字段，`"rule_only"` 时可选显示提示"详细评估进行中"
5. 非流式模式也应用相同策略：先返回规则审查结果，完整审查异步执行

### 关于 `after()` API

Next.js 15 支持 `after()` 用于在响应发送后执行异步任务。使用前查询 Context7 确认 Next.js 15.3 的 `after()` 最新用法和导入路径。

### 验收标准

- `type: "complete"` 事件中包含规则审查结果
- 流响应不再等待 DeepSeek API 返回
- DeepSeek 审查失败不影响用户收到生成结果
- 非 DeepSeek 环境（未配置 DEEPSEEK_API_KEY）行为与之前完全一致

---

## 优化 3：System Prompt 按题型分层加载 [P1]

### 涉及文件

- `lib/ai/prompts/system.md` — 当前的单一系统提示词（245 行）
- `lib/ai/prompt-assembler.ts` — `renderSystemPrompt` 函数

### 当前行为

无论生成 MC 还是 FR 题，都加载完整的 245 行 system prompt，包含 MCQ 规则、FRQ 规则、Rubric 规则、AP 命令动词表等全部内容。

### 目标行为

将 `system.md` 拆分为模块化片段，按 `exerciseType` 按需组合：

```
system-base.md     → 通用规则：角色定义、Curriculum-locked、数学正确性、LaTeX 标准、自检清单
system-mc.md       → MC 专用：4 选项结构、干扰项设计、干扰项 anti-patterns
system-fr.md       → FR 专用：多部分结构 (a)-(d)、评分标准、解析完整性要求
```

### 实施要点

1. 拆分 `system.md` 为三个文件，放在同一目录 `lib/ai/prompts/`
2. 通用部分包含：Section 1 (Curriculum Context Injection)、Section 2 (Difficulty Calibration)、Section 7 (LaTeX Standards)、Section 8 (Self-Verification Checklist)、Section 10 (What NOT to Do)
3. MC 部分包含：Section 3 (MCQ Rules)、Section 9 的 MCQ Output 示例
4. FR 部分包含：Section 4 (FRQ Rules)、Section 9 的 FRQ Output 示例
5. Section 5 (Rubric Generation Rules) 从题目生成 prompt 中移除（题目生成时不需要 rubric 规则）
6. Section 6 (AP Command Verbs Reference) 放入通用部分
7. 修改 `renderSystemPrompt` 函数，接收 `exerciseType` 参数，读取 base + 对应类型的文件并拼接
8. 利用现有的 `readPromptTemplateCached` 缓存机制，新文件自动被缓存
9. 保持 `{{course_name}}` 等模板变量替换逻辑不变

### 验收标准

- MC 生成时 system prompt 不包含 FRQ/Rubric 相关内容
- FR 生成时 system prompt 不包含 MCQ 干扰项设计内容
- Prompt 模板变量替换功能正常
- 生成质量不退化（通过对比同参数生成结果的规则审查分数验证）

---

## 优化 4：MC/FR 差异化 maxTokens [P1]

### 涉及文件

- `lib/ai/exercise-generator.ts` — `callTool` 调用处

### 当前行为

所有调用统一 `maxTokens: 8000`，无论题型和数量。

### 目标行为

根据题型和请求数量动态计算 `maxTokens`：

| 场景 | maxTokens |
|------|-----------|
| MC 单题 (count=1) | 2500 |
| FR 单题 (count=1) | 4000 |
| MC 多题 (count=2-3) | 5000 |
| FR 多题 (count=2-3) | 8000 |
| 混合/更多题 | 8000 (保持现状) |

### 实施要点

1. 在 `exercise-generator.ts` 的 `generateExercises` 函数中，基于 `input.exerciseType` 和 `input.count` 计算 `maxTokens`
2. 新增一个函数（如 `calculateMaxTokens`）封装此逻辑
3. 如果返回被截断（统一由 `lib/ai/gateway.ts` 的工具调用失败重试处理），当前重试逻辑会自动处理，无需额外改动
4. 保留一个最小值保护，确保 `maxTokens >= 2000`

### 验收标准

- MC 单题调用的 maxTokens 降至 2500
- 截断重试机制仍然正常工作
- 不影响生成内容的完整性

---

## 优化 5：Prompt 组装结果缓存 [P1]

### 涉及文件

- `app/api/ai/exercises/generate/route.ts` — `createProgressiveStreamResponse`
- `lib/ai/prompt-assembler.ts` — `buildExercisePrompt`、`renderSystemPrompt`

### 当前行为

在 Progressive Streaming 模式中，每个并发的单题生成都独立调用 `buildExercisePrompt` + `renderSystemPrompt`。虽然模板文件有缓存 (`promptTemplateCache`)，但 curriculum context 格式化、LO/EK 拼接等工作每次都重新执行。对于同一次请求的 5 个并发调用，输入完全相同（除了 count），prompt 组装结果也完全相同。

### 目标行为

在 `createProgressiveStreamResponse` 入口处预先组装一次 prompt，将结果传递给并发的生成调用，避免重复计算。

### 实施要点

1. 在 `createProgressiveStreamResponse` 函数开头，调用 `buildExercisePrompt` 和 `renderSystemPrompt` 各一次，得到 `{ prompt, systemPrompt }`
2. 修改 `generateExercises` 函数签名，增加可选的 `prebuiltPrompt` 参数，接收预组装好的 prompt 和 systemPrompt
3. 当 `prebuiltPrompt` 存在时跳过重新组装，直接使用传入的值
4. 对 prompt 中与 count 相关的指令（如 "You MUST return exactly N exercises"），在传入前替换为 count=1
5. 非流式模式（单次批量生成）不需要此优化，保持现有逻辑

### 验收标准

- Progressive Streaming 模式中 `buildExercisePrompt` 只被调用 1 次（而非 N 次）
- 传递给 AI 的 prompt 内容与优化前完全一致
- 非流式模式行为不变

---

## 优化 6：前端骨架屏即时反馈 [P1]

### 涉及文件

- `hooks/use-exercises.ts` — stream 事件处理
- 显示题目列表的前端组件（需定位具体组件文件）

### 当前行为

用户点击生成后，等待 `type: "meta"` 事件到达才有第一次 UI 更新。在此之前（~2-5 秒）没有任何视觉反馈。

### 目标行为

1. 用户点击"生成"后 **立即** 显示 N 个骨架卡片（N = 请求的 count），每个卡片显示：
   - 题号占位
   - 题型标签 (MC/FR)
   - 难度星级
   - 加载动画 (skeleton shimmer)

2. 收到 `type: "exercise"` 事件时，对应位置的骨架卡片替换为真实题目内容

3. 收到 `type: "complete"` 事件时，移除所有剩余骨架（处理部分生成失败的情况）

### 实施要点

1. 在 `use-exercises.ts` 的 `generate` 函数中，在发起 API 请求之前，立即通过 `onProgress` 回调推送一个 "skeleton" 状态（包含 count、exerciseType、difficulty 等元信息）
2. 在 `ExerciseStreamProgress` 类型中新增一个可选的 `phase` 字段：`"skeleton" | "streaming" | "complete"`
3. 前端组件根据 `phase` 渲染不同的 UI：
   - `skeleton`：骨架卡片
   - `streaming`：已到达的真实卡片 + 剩余骨架
   - `complete`：全部真实卡片 + 质量评分
4. 骨架卡片的设计保持与真实卡片相同的尺寸和布局，避免内容到达时的布局跳动

### 验收标准

- 点击生成后 < 100ms 出现骨架卡片
- 骨架到真实内容的过渡平滑，无布局跳动
- 生成失败时骨架卡片正确清除并显示错误状态

---

## 优化 7：Next.js after() 分离后台任务 [P2]

### 涉及文件

- `app/api/ai/exercises/generate/route.ts` — POST handler

### 说明

此优化是优化 2（质量审查异步化）的延伸。除了质量审查，AI 验证也可以通过 `after()` 后台执行。

### 目标行为

对于 Level 1-2 的题目（已通过优化 1 跳过验证），无额外操作。
对于 Level 3-4 的题目，验证改为后台执行：

```
响应流程：生成 → 规则校验 → 推送给用户（verificationStatus: "pending"）
后台流程：after() → AI 验证 → 更新 Supabase exercises 表的 verification_status
```

### 实施要点

1. 在 Progressive Streaming 模式中，题目生成后立即推送（不等验证）
2. 使用 `after()` 在响应关闭后执行验证
3. 验证结果写入数据库（需要先有 exercises 记录 — 如果题目尚未保存到数据库，可以在 `after()` 中先保存再验证，或者将验证状态存入临时缓存）
4. 前端可选：提供一个轮询接口查询验证状态，或在题目详情页显示验证进度

### 注意事项

- `after()` 中的错误不会影响已发送的响应，但需要有错误日志记录
- 确保 `after()` 中的 Supabase client 有正确的权限（可能需要 service role key）
- 这是一个可选优化，依赖优化 2 的 `after()` 基础设施

### 验收标准

- 用户在题目生成完成时立即收到所有题目
- 验证在后台静默执行
- 验证失败的题目在数据库中被正确标记

---

## 实施顺序

按以下顺序实施，每完成一步做回归测试：

```
Step 1: 优化 4 (maxTokens 差异化)     ← 改动最小，立即见效
Step 2: 优化 5 (Prompt 组装缓存)      ← 改动小，减少重复计算
Step 3: 优化 3 (System Prompt 分层)   ← 需要拆分文件，token 节省明显
Step 4: 优化 1 (分层验证策略)          ← 核心优化，大幅减少 AI 调用
Step 5: 优化 2 (质量审查异步化)        ← 需要引入 after()，有一定复杂度
Step 6: 优化 6 (前端骨架屏)           ← 纯前端改动，独立实施
Step 7: 优化 7 (after() 分离验证)     ← 在优化 2 基础上扩展
```

## 约束和禁令

1. **不引入新的运行时依赖**（不加 Redis、BullMQ 等）
2. **不改变 NDJSON 流式协议的基本结构**（`meta` / `exercise` / `complete` / `error` 四种事件类型保持兼容，可以新增字段但不删除现有字段）
3. **不降低现有测试覆盖率**
4. **不修改数据库 schema**（优化 7 除外，如需要可新增字段）
5. **环境变量向后兼容**（现有的 `EXERCISE_SKIP_VERIFY` 等开关继续生效）
6. **每个优化完成后必须能独立运行**（不存在"必须同时完成优化 A 和 B 才能工作"的情况）
