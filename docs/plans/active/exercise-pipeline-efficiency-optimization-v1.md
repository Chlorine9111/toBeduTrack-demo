---
last_verified: 2026-03-13
owner: ai-quality
---

# 习题生成链路效率优化方案 v1
状态: IN_PROGRESS

## 目标

在不明显牺牲习题质量的前提下，降低 `runApExercisePipeline` 主链的模型调用次数、token 消耗与老师主等待时长。

本方案是“保守版”优化：
- 优先删除重复解析、重复重试、低性价比验证。
- 保留 FR / 高难 / 带材料题的重验证能力。
- 不把 `rescue` 重新升回主路径。
- 不回退到“自由聊天工具随意出题”模式。

## 与现有计划的关系

- `docs/plans/active/exercise-prompt-engineering-v2.md`
  - 负责题目质量侧的 prompt 工程、few-shot、学科规则。
- 本计划
  - 负责主链路的 token 预算、验证分层、批量策略和重试收敛。

两者互补，不互相替代。

## Context7 外部结论

- Vercel AI SDK 6 的结构化输出最佳实践是优先直接走 schema/object 输出，避免“文本输出 -> 手工 parse -> repair”多段往返；多步骤调用应只保留真正增益明显的那几步。
- Anthropic 的成本优化建议重点是：减少重复上下文、只在第二次调用明显提升质量时保留链式调用、长而稳定的上下文优先做缓存。

本计划不立即引入 provider 级 prompt caching 改造；Phase 1 先处理当前主链内部的重复调用和过度验证。

## 当前热点与问题

### 1. 上游已推断字段，流水线内又重新做蓝图解析

- 上游 `handleExerciseRequest()` 已推断 `count / exerciseType / language`
- 下游 `resolveBlueprint()` 又重新做结构化蓝图解析

热点文件：
- `lib/agent/workflows/exercise-direct.ts`
- `lib/agent/exercise-pipeline-generation.ts`

问题：
- 同一请求被重复理解
- 简短教师请求也要多一次模型调用

### 2. 候选题有“过量生成 + 全量深度处理”倾向

- 当前 `count > 2` 时默认生成 `count + 1` 候选
- 候选题随后继续进入验证 / 修补链

热点文件：
- `lib/agent/exercise-pipeline.ts`

问题：
- 常见 3 题请求会直接多出 1 题生成与后续处理成本
- 备用题也消耗和正式题近似的验证预算

### 3. 生成阶段存在重试叠层

- 外层批次重试
- 内层 `callStructured()` 还会做多轮 structured/text-json/reapir fallback

热点文件：
- `lib/agent/exercise-pipeline.ts`
- `lib/agent/exercise-pipeline-generation.ts`

问题：
- 最坏情况下生成阶段模型调用会被放大
- 对老师来说主要体感是“慢”，不一定对应质量提升

### 4. verifier 不是盲验

- 当前 `verifyExercise()` 在“独立解题”前就看到了标准答案和标准解析

热点文件：
- `lib/agent/exercise-pipeline-verification.ts`

问题：
- token 偏高
- 验证可信度下降，容易变成“带答案复述”

### 5. 当前验证策略对数量扩展不友好

- 小量题可接受逐题深验
- 题目数增大后，逐题 solver / equivalence 成本线性放大

热点文件：
- `lib/agent/exercise-pipeline-helpers.ts`

问题：
- 现有策略更适合 `1-6` 的小批量高质量链
- 对未来 `>6` 的批量请求缺少明确策略

## 不动的质量基线

- `FR` 题保留答案等价性判定，不直接降为纯规则校验。
- 高难度题和带材料题保留更重验证，不裸放行。
- `generateRescueExercises()` 仍只作为兜底，不重新成为主路径。
- 习题请求继续显式走 `runApExercisePipeline -> saveExercises -> 后处理` 主链。

## 设计原则

1. 先复用已有理解结果，再决定是否追加 AI 解析。
2. 先按风险和规模分配验证预算，再决定逐题深验范围。
3. 先删重复重试，再考虑提示词瘦身。
4. 先保证老师尽快拿到够用结果，再把高风险复核留给少量题目。
5. `count` 只作为一个信号，不单独决定全部策略。

## 步骤

- [x] Phase 1：完成低风险降本，包括蓝图复用、候选收紧、重试收敛、盲验优先与 review 输入压缩。
- [x] Phase 2：完成动态验证预算改造，按 `count / 题型 / 难度 / 材料` 分配验证成本。
- [x] Phase 3：完成修补分流，区分结构失败与逻辑失败的复检路径。
- [x] Phase 4：补大批量模式设计与占位实现，避免未来直接放大小批量高质量链。
- [ ] 补齐测试、基准观测与真实链路回归，确认效率优化没有破坏题块、保存和质量标签契约。

## 动态策略模型

### 风险因子

- 题型：`FR` 风险高于 `MC`
- 难度：`高阶分析` 高于 `中等应用`，高于 `基础巩固`
- 上下文：带上传材料高于纯自然语言主题
- 题量：题量越大，越不适合逐题深验

### 规模分层

#### S1: 小批量
- `count <= 3`
- 可承受更重验证

#### S2: 中批量
- `4 <= count <= 6`
- 默认不做全量逐题 solver

#### S3: 大批量
- `count > 6`
- 不再视为单批高质量链
- 必须拆批处理

## 保守版策略表

| 条件 | 生成策略 | 验证策略 | 修补策略 |
|------|----------|----------|----------|
| `MC` + `基础巩固` + 无材料 | 直接生成请求数量 | 本地规则校验 | 结构失败才修补，修补后本地复检 |
| `MC` + `中等应用` + `count <= 3` + 无材料 | 直接生成请求数量 | 批量轻审或抽样 1 题 solver，其余规则校验 | 结构失败本地复检；逻辑失败才轻量复验 |
| `MC` + `中等应用` + `count >= 4` | 直接生成请求数量 | 批量轻审，不逐题 solver | 只修补被标红题 |
| `MC` + 高难或带材料 | 可保留少量备用候选 | 轻审 + 定点 solver | 逻辑失败题修补后轻量复验 |
| `FR` + `count <= 3` | 可保留少量备用候选 | 保留 solver + equivalence | 保留修补后轻量复验 |
| `FR` + `count >= 4` | 拆成小批或降低单题验证覆盖率 | 批量轻审 + 定点 solver | 只修补明确失败题 |
| `count > 6` 任意题型 | 按批次拆分 | 每批按对应风险策略处理 | 每批局部修补，不做整批重跑 |

## `count > 6` 的处理原则

旧链路内部多处把题量限制在 `6`。本轮实现已把总请求上限放宽到 `20`，并对 `>6` 的请求改为拆批执行，因此不再简单放大现有单批链路：

1. 将请求拆成多批
   - 例如 `10 -> 5 + 5`
   - 或 `10 -> 4 + 4 + 2`
2. 每批只保留该批需要的验证预算
3. 汇总所有批次结果后统一返回
4. 对大批量结果显式标注“建议抽查”

当前实现采用保守拆批：默认按 `5` 题左右一批切分，大批量结果汇总后统一返回，并在 summary 中保留按批次动态分配验证预算的说明。

## Phase 1: 低风险降本

目标：先减少最明显的重复调用和低性价比 token 消耗，不改变主要产品契约。

- [x] 复用 `exercise-direct` 已推断的 `count / exerciseType / language`，把 `resolveBlueprint()` 改成“本地优先，AI 兜底”
- [x] 将备用候选从“默认 `count + 1`”改为“仅高风险请求才保留”
- [x] 外层批次重试从 `3` 收紧到 `2`
- [x] 生成阶段的结构化 fallback 收敛，减少无意义 repair
- [x] `verifyExercise()` 改为盲验优先：首轮不直接喂标准答案和完整解析
- [x] teacher review 输入压缩，避免把每题长解析全文重复送审

预期收益：
- 常见小量 MC 请求显著降时延
- 总模型调用次数下降
- 不改变保存、后处理和前端呈现契约

## Phase 2: 动态验证预算

目标：把“按请求风险分层验证”替换当前偏静态的策略分支。

- [x] 重写 `buildExercisePipelineStrategy()`，把 `count / 题型 / 难度 / 材料` 纳入统一决策
- [x] 小量 `MC` 从“逐题 solver”降为“批量轻审或抽样 solver”
- [x] `4-6` 题请求默认不做全量逐题 solver
- [x] `FR` 与高风险题继续保留更重验证
- [x] 备用候选只在正式题通过数不足时再进入深验

预期收益：
- 中等风险请求不再被过度验证
- 大部分 token 消耗从“每题线性增长”改成“按风险有上限增长”

## Phase 3: 修补分流

目标：把“所有失败题都走同一修补/复验路径”改成按失败原因分流。

- [x] 结构性失败
  - 仅做定向修补
  - 修补后只做本地结构复检
- [x] 逻辑性失败
  - 保留轻量复验
  - 不直接取消所有二次验证
- [x] 将 `maxRepairRounds` 统一稳定在保守上限 `1`

预期收益：
- 降低失败题的二次调用膨胀
- 避免“格式问题也走完整 solver 链”

## Phase 4: 大批量模式

目标：让 `>6` 题请求进入拆批编排，而不是继续放大小批量高质量链。

- [x] 把单批 `count<=6` 限制显式化到策略层，而不是仅靠 schema/`clamp`
- [x] 设计 `splitIntoExerciseBatches()` 之类的批处理编排
- [x] 明确每批的验证预算上限
- [x] 明确大批量结果的 UI 文案与质量标签

预期收益：
- 未来支持 `10` 题、`12` 题时，不会直接把当前主链放大到不可控

## 验收标准

### 效率

- 常见 `MC / 中等应用 / 1-3 题 / 无材料` 请求：
  - 总模型调用次数明显下降
  - 主等待时长下降
- `4-6` 题请求：
  - 不再默认全量逐题 solver
- 生成阶段：
  - 批次重试收紧后，fallback 仍稳定可用

### 质量

- `FR` 题仍保留答案等价性判定
- 高难或带材料题不出现明显质量回退
- 题块仍同时包含题干、答案、解析
- 直接入库时，质量标签与当前契约兼容

### 稳定性

- 现有 Agent 习题流式回归脚本继续通过
- 不引入“生成成功但没有题块”或“保存链断裂”回归

## 需要补的回归与观测

- [ ] 补 `exercise-pipeline` 策略矩阵测试：
  - 小量 MC
  - 中批量 MC
  - 小量 FR
  - 带材料题
  - 大批量占位策略
- [ ] 增加 pipeline metrics 对比：
  - `totalModelCalls`
  - `verificationMode`
  - `teacherReviewMs`
  - `verificationMs`
  - `repairMs`
- [ ] 对 `3 道 MC` 与 `4-6 道 MC` 增加基准样本，记录优化前后差异

## 文件范围

核心改动预计集中在：

- `lib/agent/exercise-pipeline.ts`
- `lib/agent/exercise-pipeline-helpers.ts`
- `lib/agent/exercise-pipeline-generation.ts`
- `lib/agent/exercise-pipeline-verification.ts`
- `lib/agent/exercise-pipeline-review.ts`
- `lib/agent/workflows/exercise-direct.ts`
- `tests/followup/exercise-pipeline-strategy.spec.ts`
- `scripts/agent/exercise-pipeline-regression.ts`

## 完成标准

- 已形成按风险与规模动态分配验证预算的策略，不再默认把所有请求推入同样重的质量链。
- 常见小量 MC 请求的 token 与时延明显下降，且不引入显著质量回退。
- FR / 高风险 / 带材料题的质量基线仍被保留。
- 为未来 `>6` 题请求预留可扩展的大批量模式，而不是继续放大当前单批链路。
