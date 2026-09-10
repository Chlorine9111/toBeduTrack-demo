# 判卷系统 P0/P1 修复任务

> 三个任务互不冲突，可并行执行。每个任务只修改指定文件。

---

## 任务 1：修复评分截断与推理力度

**修改文件**：`lib/grading/grader.ts`（仅此一个文件）

### 问题描述

1. `scoreAllWithAi()`（第 122 行）将所有题目拼成一个 prompt 发给 Gemini，`maxTokens: 1200`。一道题的 JSON 输出约 80-120 tokens，超过 12 题时后面的题目评分被截断，fallback 到规则评分（MC 满分、非 MC 零分），导致错误分数。

2. `effort: "low"`（第 170 行）告诉 Gemini 用最低推理力度评分。评分是最关键环节，不应该用最低力度。

3. `extractAnswersFromOCR()`（第 56 行）补全缺失答案时，把完整 OCR JSON 全部塞进 prompt，浪费 tokens 且引入噪声。

### 修复要求

#### 1) 分 chunk 评分（核心修复）

将 `scoreAllWithAi()` 改为分组调用：

```typescript
// 伪代码
const CHUNK_SIZE = 8; // 每组最多 8 题
const chunks = splitIntoChunks(questions, CHUNK_SIZE);
const mergedScoreMap = new Map();

for (const chunk of chunks) {
  const chunkMaxTokens = Math.max(800, chunk.length * 160);
  const chunkResult = await callGeminiJson({
    // ...现有 prompt 逻辑不变，只是 questions 换成 chunk
    maxTokens: chunkMaxTokens,
    effort: "medium",
  });
  // 合并到 mergedScoreMap
}
```

**约束**：
- 每 chunk 最多 8 题
- `maxTokens` 按 `chunk.length * 160` 动态计算，下限 800
- chunk 之间串行调用（避免并发打爆 rate limit）
- 如果某个 chunk 调用失败，该 chunk 的题目 fallback 到规则评分，不影响其他 chunk
- 合并逻辑：所有 chunk 的 scoreMap 合并后返回

#### 2) effort 提升

- 将 `effort: "low"` 改为 `effort: "medium"`
- 系统 prompt 不变

#### 3) OCR 补全精简

在 `extractAnswersFromOCR()` 中，将第 56 行的 `JSON.stringify(ocr)` 改为只发送：
- 缺失题号附近 ±2 题的已识别内容
- 每页仅保留 questions 数组，去掉 pageNumber 之外的冗余字段

```typescript
// 只提取有用的 OCR 上下文
const relevantOcr = {
  pages: ocr.pages.map(page => ({
    pageNumber: page.pageNumber,
    questions: page.questions.map(q => ({
      questionNumber: q.questionNumber,
      studentAnswer: q.studentAnswer,
    })),
  })),
};
```

### 不要修改的部分

- `gradeSubmissionByAI()` 的整体流程不变
- `normalizeBreakdown()` 不变
- `buildQuestionPromptPayload()` 不变
- `flattenOcrAnswers()` 不变
- 不要修改其他文件

### 验证方式

```bash
cd /Users/martin/toBeduTrack-main-verify-20260309
npx tsc --noEmit
```

确保类型检查通过，无新增 lint 错误。

---

## 任务 2：修复答案匹配逻辑

**修改文件**：`lib/grading/answer-matcher.ts`（仅此一个文件）

### 问题描述

`lengthSimilarity()`（第 25-29 行）只比较字符串长度，不比较内容。"x=5" 和 "y=3" 长度相同，similarity = 1.0，会被误判为正确答案（confidence 0.86）。

```typescript
// 当前实现（有缺陷）
function lengthSimilarity(a: string, b: string) {
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  const delta = Math.abs(a.length - b.length);
  return Math.max(0, 1 - delta / max);
}
```

### 修复要求

#### 1) 用编辑距离替换长度相似度

实现 Levenshtein 距离计算，替换 `lengthSimilarity`：

```typescript
function levenshteinDistance(a: string, b: string): number {
  // 标准动态规划实现
  // 空间优化：只用两行数组（O(min(m,n)) 空间）
  // 短路优化：如果其中一个是空字符串，直接返回另一个的长度
}

function contentSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return Math.max(0, 1 - distance / maxLen);
}
```

#### 2) 调整阈值和置信度

原来 `lengthSimilarity >= 0.96` 判为正确，confidence 0.86。改为：

```typescript
const similarity = contentSimilarity(normalizedStudent, normalizedCorrect);
if (similarity >= 0.85) {
  return {
    isCorrect: true,
    confidence: 0.75 + similarity * 0.15, // 0.85相似度 → confidence 0.88
    reason: `答案内容高度相似（相似度 ${(similarity * 100).toFixed(0)}%）`,
  };
}
```

- 阈值从 0.96 降到 0.85（因为编辑距离比长度比较更严格）
- confidence 动态计算，不再是固定值

#### 3) 加上长度保护

对于非常短的答案（< 4 字符），编辑距离容易误判，加保护：

```typescript
// 短答案（如 "B", "42", "x=5"）不走相似度，直接走 AI 等价判断
if (normalizedStudent.length < 4 || normalizedCorrect.length < 4) {
  // 跳过相似度检查，直接到 disableAi 判断分支
}
```

### 不要修改的部分

- `mcNormalize()` 和 MC 题的判断逻辑不变
- `normalizeText()` 不变
- `matchAnswer()` 的函数签名和返回类型不变
- `checkAnswerEquivalence` 的 AI 调用逻辑不变
- 不要修改其他文件
- 不要引入任何外部依赖（纯手写 Levenshtein）

### 验证方式

```bash
cd /Users/martin/toBeduTrack-main-verify-20260309
npx tsc --noEmit
```

---

## 任务 3：修复非原子写入与改分统计

**修改文件**：`lib/grading/store.ts`（仅此一个文件）

### 问题描述

1. `replaceSubmissionAnswers()`（第 432-470 行）先 DELETE 所有旧答案再 INSERT 新答案。如果 INSERT 失败（网络抖动、校验失败），旧答案永久丢失。

2. `overrideGradingAnswer()`（第 523-578 行）教师改分后只更新了单条 answer，没有触发 session stats 重算。教师改完分，班级平均分、正确率、薄弱知识点仍是旧数据。

### 修复要求

#### 1) replaceSubmissionAnswers 改为安全写入

策略：先插入新答案（用新的 submission_id 关联），确认成功后再删除旧答案。

```typescript
export async function replaceSubmissionAnswers(
  context: LessonPlanContext,
  submissionId: string,
  answers: Omit<GradingAnswer, "id" | "createdAt">[],
) {
  if (shouldUseMockStore(context)) {
    // mock 逻辑不变
  }

  if (answers.length === 0) {
    // 空答案时才直接删除
    await context.supabase!.from("grading_answers").delete().eq("submission_id", submissionId);
    return [];
  }

  const payload = answers.map((item) => ({
    submission_id: submissionId,
    question_number: item.questionNumber,
    // ... 其余字段同现有实现
  }));

  // 先插入新答案
  const { data, error } = await context.supabase!
    .from("grading_answers")
    .insert(payload)
    .select("*");

  if (error) throw new Error("写入判卷结果失败");

  // 插入成功后，删除旧答案（不属于本次插入的）
  const newIds = (data ?? []).map((row) => row.id);
  if (newIds.length > 0) {
    await context.supabase!
      .from("grading_answers")
      .delete()
      .eq("submission_id", submissionId)
      .not("id", "in", `(${newIds.join(",")})`);
  }

  return (data ?? []).map((row) => toAnswer(row));
}
```

**关键**：grading_answers 表允许同一个 submission_id + question_number 有多条记录（因为没有 unique constraint），所以先插后删是安全的。如果表有 unique constraint，需要先确认 schema。

#### 2) overrideGradingAnswer 触发统计重算

在 `overrideGradingAnswer` 末尾，改分成功后自动重算 session stats：

```typescript
export async function overrideGradingAnswer(
  context: LessonPlanContext,
  answerId: string,
  payload: { score: number; feedback?: string },
) {
  // ... 现有改分逻辑不变 ...

  if (!data) return null;
  const answer = toAnswer(data);

  // 改分成功后，触发该 session 的统计重算
  await recalculateSessionStatsForSubmission(context, answer.submissionId);

  return answer;
}
```

新增一个内部辅助函数：

```typescript
async function recalculateSessionStatsForSubmission(
  context: LessonPlanContext,
  submissionId: string,
) {
  // 1. 根据 submissionId 查到 sessionId
  // 2. 查该 session 的 answerKey
  // 3. 查该 session 所有已完成的 submissions
  // 4. 查所有 submissions 的 answers
  // 5. 调用 buildSessionStats() 重算
  // 6. 调用 setSessionStats() 写回

  // 注意：这里需要 import buildSessionStats from "@/lib/grading/report-builder"
  // 这是该文件唯一新增的 import
}
```

**约束**：
- 只在 Supabase 模式下执行重算（mock 模式也应该重算但简化处理）
- 重算失败不应阻塞改分结果返回（catch 并 console.warn）
- 新增 `import { buildSessionStats } from "@/lib/grading/report-builder"` 到文件顶部

### 不要修改的部分

- 所有其他函数（listGradingSessions, createGradingSession, getGradingSession 等）不变
- toSession / toSubmission / toAnswer 映射函数不变
- MockStore 类型定义不变
- 不要修改其他文件

### 验证方式

```bash
cd /Users/martin/toBeduTrack-main-verify-20260309
npx tsc --noEmit
```

---

## 并行安全说明

| 任务 | 修改文件 | 读取（不修改）的文件 |
|------|---------|-------------------|
| 1 | `lib/grading/grader.ts` | `lib/ai/gemini-openrouter.ts`, `lib/grading/strategy-router.ts`, `lib/grading/types.ts` |
| 2 | `lib/grading/answer-matcher.ts` | `lib/ai/exercise-validator.ts`, `lib/grading/types.ts` |
| 3 | `lib/grading/store.ts` | `lib/grading/report-builder.ts`, `lib/grading/types.ts` |

**三个任务的修改文件完全不重叠**，可安全并行执行。

共同依赖的 `types.ts` 和 `report-builder.ts` 都是只读引用，不做修改。
