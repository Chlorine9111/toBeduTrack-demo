# 教案生成 Pipeline 优化方案

> 日期：2026-03-11
> 范围：后端 pipeline 重构 + Vercel AI SDK 流式协议 + Prompt 工程优化
> 策略：一步到位（拆文件 + 并行化 + 流式切换 + 超时 + 开关 + 修复 + prompt 优化）

---

## 1. 模块拆分

当前 `app/api/lesson-plans/generate/route.ts` 共 957 行，违反 AGENTS.md 硬约束 #1「route.ts 只做请求编排」。

### 拆分目标

```
app/api/lesson-plans/generate/
  └─ route.ts                (~250 行，请求编排 + 流式推送)

lib/lesson-plan/
  ├─ ai.ts                   (已有，不动)
  ├─ material-parser.ts      (新，~80 行)
  ├─ material-digest.ts      (新，~70 行)
  ├─ web-enrichment.ts       (新，~60 行)
  └─ prompt-builder.ts       (新，~80 行)
```

### material-parser.ts

从 route.ts 提取：

```typescript
// lib/lesson-plan/material-parser.ts

export interface UploadedMaterial {
  fileName: string
  fileType: string
  textContent: string
}

const MAX_MATERIAL_TEXT = 8000
const MAX_MATERIAL_FILES = 5

export function sanitizeFileName(name: string): string {
  const baseName = name.split(/[/\\]/).pop() || "upload"
  // 保留中文字符（修复原 bug）
  return baseName.replace(/[^\w\u4e00-\u9fff._-]/g, "_").slice(0, 200)
}

export function trimText(text: string, max = MAX_MATERIAL_TEXT): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n...(内容已截断)`
}

export async function parseMaterialFile(file: File): Promise<UploadedMaterial> {
  // 从 route.ts L347-370 迁移，逻辑不变
}

export async function extractUploadedMaterials(files: File[]): Promise<{
  materials: UploadedMaterial[]
  warnings: string[]
}> {
  // 从 route.ts L372-384 迁移，逻辑不变
}
```

**变更点**：`sanitizeFileName` 正则从 `/[^a-zA-Z0-9._-]/g` 改为 `/[^\w\u4e00-\u9fff._-]/g`，保留中文。

### material-digest.ts

```typescript
// lib/lesson-plan/material-digest.ts

import { z } from "zod"
import { generateStructuredObject } from "@/lib/ai/structured-output"
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router"
import type { UploadedMaterial } from "./material-parser"
import { trimText } from "./material-parser"

export const materialDigestSchema = z.object({
  // 从 route.ts 迁移，schema 不变
  titleHint: z.string().optional(),
  keyKnowledgePoints: z.array(z.string()).min(3).max(10),
  classroomGoals: z.array(z.string()).min(1).max(5),
  misconceptions: z.array(z.string()).max(5),
  differentiatedSupport: z.array(z.string()).max(5),
  suggestedQueries: z.array(z.string()).max(3),
  materialHighlights: z.array(z.object({
    source: z.string(),
    snippet: z.string(),
    whyImportant: z.string(),
  })).max(5),
})

export type MaterialDigest = z.infer<typeof materialDigestSchema>

export async function buildMaterialDigest(
  materials: UploadedMaterial[],
  sourcePrompt: string,
): Promise<MaterialDigest | null> {
  if (materials.length === 0) return null

  const model = getResolvedLanguageModelForTask("lesson_outline")
  const materialText = materials
    .map((item, index) => `【材料${index + 1}】${item.fileName}\n${trimText(item.textContent, 3600)}`)
    .join("\n\n")

  // 只保留主路径 generateStructuredObject，砍掉 gateway fallback
  return generateStructuredObject({
    model,
    schema: materialDigestSchema,
    systemPrompt: [
      "你是教学材料提炼 agent。",
      "任务：从教师上传材料中提炼可直接用于上课的结构化信息。",
      "要求：输出必须具体、可执行、避免空话。",
    ].join("\n"),
    userPrompt: [
      `教师需求：${sourcePrompt}`,
      "请结合以下材料提炼：关键知识点、课堂目标、分层支持、建议联网检索问题。",
      materialText,
    ].join("\n\n"),
    maxTokens: 1800,
    temperature: 0.2,
  })
}
```

**变更点**：砍掉 `generateToolInputWithGateway` fallback（~60 行手写重复 schema）。如果 `generateStructuredObject` 失败，直接抛错让 pipeline catch 处理。

### web-enrichment.ts

```typescript
// lib/lesson-plan/web-enrichment.ts

import { searchWebWithClaude } from "@/lib/assistant/claude-web-search"
import { trimText } from "./material-parser"

export interface WebEnrichmentResult {
  summary: string
  queries: string[]
  references: Array<{ title: string; url: string; snippet: string }>
}

function dedupeQueries(queries: string[]): string[] {
  // 从 route.ts L494-505 迁移，不变
}

export async function runWebEnrichment(params: {
  sourcePrompt: string
  confirmation: { subject: { name: string }; unit: { title: string } }
}): Promise<WebEnrichmentResult | null> {
  // 从 route.ts L507-565 迁移
  // 变更：去掉 digest 参数依赖（解耦，支持并行）
  const queryCandidates = dedupeQueries([
    `${params.confirmation.subject.name} ${params.confirmation.unit.title} 最新课堂案例`,
    `${params.confirmation.subject.name} ${params.confirmation.unit.title} formative assessment strategy`,
  ]).slice(0, 1)

  // 其余逻辑不变
}
```

**变更点**：
1. 移除 `digest` 参数 → 不再依赖 `materialDigest` 的 `suggestedQueries`，解耦后可与 digest 并行。
2. 固定使用学科+单元拼接的 query。

### prompt-builder.ts

```typescript
// lib/lesson-plan/prompt-builder.ts

import type { UploadedMaterial } from "./material-parser"
import type { MaterialDigest } from "./material-digest"
import type { WebEnrichmentResult } from "./web-enrichment"
import type { CedObjective, CedTopicMatch } from "./types"

export function buildAugmentedSourcePrompt(params: {
  sourcePrompt: string
  materials: UploadedMaterial[]
  digest: MaterialDigest | null
  web: WebEnrichmentResult | null
}): string {
  // 从 route.ts L567-628 迁移，逻辑不变
}

export function buildQuickTopic(unitNumber: string, unitId?: string): CedTopicMatch {
  // 从 route.ts L152-182 迁移，不变
}

export function toCedTopicFromCurriculum(topic: ...): CedTopicMatch {
  // 从 route.ts L184-... 迁移，不变
}
```

---

## 2. 并行化：digest + web enrichment

### 当前（串行）

```
[5] buildMaterialDigest ──等完──→ [6] runWebEnrichment ──等完──→ [7] 拼 prompt
         ~5s                            ~5s                       瞬时
                              总计: ~10s
```

### 优化后（并行）

```
[5] buildMaterialDigest ──┐
                          ├──→ [7] 拼 prompt
[6] runWebEnrichment ─────┘
         max(~5s, ~5s) = ~5s
                              总计: ~5s (省 ~5s)
```

route.ts 中的代码变更：

```typescript
// Before (串行)
const materialDigest = await buildMaterialDigest(uploadedMaterials, body.sourcePrompt)
const webEnrichment = await runWebEnrichment({ sourcePrompt, digest: materialDigest, confirmation })

// After (并行)
const [materialDigest, webEnrichment] = await Promise.all([
  buildMaterialDigest(uploadedMaterials, body.sourcePrompt),
  enableWebSearch
    ? runWebEnrichment({ sourcePrompt: body.sourcePrompt, confirmation: body.confirmation })
    : Promise.resolve(null),
])
```

---

## 3. Vercel AI SDK 流式协议

### 从 NDJSON 切换到 `createUIMessageStream`

#### 后端（route.ts）

```typescript
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai"

export async function POST(request: Request) {
  // ... 参数解析、校验 ...

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // [4] 材料解析
      const { materials, warnings } = await extractUploadedMaterials(materialFiles)

      // [5+6] 并行：材料提炼 + 联网搜索
      const [materialDigest, webEnrichment] = await Promise.all([
        buildMaterialDigest(materials, body.sourcePrompt),
        enableWebSearch
          ? runWebEnrichment({ sourcePrompt: body.sourcePrompt, confirmation: body.confirmation })
          : Promise.resolve(null),
      ])

      // [7] prompt 增强
      const effectiveSourcePrompt = buildAugmentedSourcePrompt({ ... })

      // [8] 大纲（有材料时重新生成）
      const effectiveOutline = await maybeRegenerateOutline(...)

      // [9] 持久化外壳
      const planId = await createLessonPlanShell(...)

      // >>> 发送 meta 事件
      writer.write({
        type: "data-lesson-meta",
        data: { planId, title, courseName, unitName, totalMinutes, level, materialCount },
      })

      if (warnings.length > 0) {
        writer.write({
          type: "data-lesson-warning",
          data: { message: `部分材料未解析成功：${warnings.join("；")}` },
          transient: true,
        })
      }

      // [10] 并发章节生成
      for (let batchStart = 0; batchStart < sections.length; batchStart += SECTION_CONCURRENCY) {
        const batch = sections.slice(batchStart, batchStart + SECTION_CONCURRENCY)
        const results = await Promise.all(batch.map((s, offset) => generateSection(s, batchStart + offset)))

        for (const result of results.sort((a, b) => a.index - b.index)) {
          writer.write({
            type: "data-lesson-section",
            id: result.sectionId,
            data: { section: result.sectionModel, progress },
          })

          if (result.warnings.length > 0) {
            writer.write({
              type: "data-lesson-section-warning",
              data: { sectionIndex: result.index, sectionId: result.sectionId, issues: result.warnings },
              transient: true,
            })
          }
        }
      }

      // [11] 故障修复（如有章节写入失败）
      if (sectionPersistFailed) {
        await replaceLessonPlan(...)
      }

      // >>> pipeline 统计
      writer.write({
        type: "data-lesson-pipeline",
        data: { materialCount, webQueryCount, webReferenceCount, timingsMs },
        transient: true,
      })

      // >>> 内容库同步
      await syncLessonPlanContentLibraryItem(...)

      // >>> 完成
      writer.write({
        type: "data-lesson-complete",
        data: { planId },
      })
    },
  })

  return createUIMessageStreamResponse({ stream })
}
```

#### 事件类型映射

| 旧 NDJSON type | 新 Vercel data type | transient |
|----------------|---------------------|-----------|
| `meta` | `data-lesson-meta` | false |
| `section` | `data-lesson-section` | false |
| `section_warning` | `data-lesson-section-warning` | true |
| `warning` | `data-lesson-warning` | true |
| `pipeline` | `data-lesson-pipeline` | true |
| `complete` | `data-lesson-complete` | false |
| `error` | 由 `createUIMessageStream` 自动处理 | — |

#### 前端消费方式

前端需要从 `parseNDJSON` 切换到 SSE 解析。两种选择：

**选项 1：用 `useChat` 的 `onDataStreamPart`**（如果教案走聊天流）

```typescript
const { messages } = useChat({
  api: "/api/lesson-plans/generate",
  onDataStreamPart: (part) => {
    if (part.type === "data-lesson-meta") { /* 处理 meta */ }
    if (part.type === "data-lesson-section") { /* 追加章节 */ }
    if (part.type === "data-lesson-complete") { /* 标记完成 */ }
  },
})
```

**选项 2：手动 SSE 消费**（如果教案独立于聊天，推荐）

```typescript
// lib/api/lesson-stream.ts
export async function* parseLessonStream(response: Response) {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const payload = line.slice(6)
      if (payload === "[DONE]") return
      yield JSON.parse(payload)
    }
  }
}
```

前端选择由你决定，后端协议是标准 SSE `data: {...}\n\n` 格式。

---

## 4. 全局超时保护

当前问题：后端无全局超时，前端 300 秒断开后后端可能继续空跑。

```typescript
export async function POST(request: Request) {
  const PIPELINE_TIMEOUT_MS = 240_000 // 240 秒，留 60 秒余量给前端 300 秒超时

  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), PIPELINE_TIMEOUT_MS)

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        const signal = abortController.signal

        // 在每个 await 步骤前检查
        if (signal.aborted) throw new Error("生成超时，请重试")

        // 传递 signal 给 LLM 调用
        const materialDigest = await buildMaterialDigest(materials, sourcePrompt, { signal })
        // ...
      } catch (error) {
        if (abortController.signal.aborted) {
          writer.write({
            type: "data-lesson-warning",
            data: { message: "教案生成超时（超过 4 分钟），已中止。请缩短材料或简化需求后重试。" },
            transient: true,
          })
        }
        throw error
      } finally {
        clearTimeout(timeout)
      }
    },
  })

  return createUIMessageStreamResponse({ stream })
}
```

---

## 5. 联网搜索开关

### 参数扩展

在 `lessonGenerateRequestSchema` 和 `quickLessonGenerateRequestSchema` 中添加：

```typescript
enableWebSearch: z.boolean().optional().default(false)
```

### pipeline 中使用

```typescript
const enableWebSearch = body.enableWebSearch ?? false

const [materialDigest, webEnrichment] = await Promise.all([
  buildMaterialDigest(materials, body.sourcePrompt),
  enableWebSearch
    ? runWebEnrichment({ sourcePrompt: body.sourcePrompt, confirmation: body.confirmation })
    : Promise.resolve(null),
])
```

### 前端

`preferences` 中增加 `enableWebSearch` toggle，默认关闭。由你自行实现。

---

## 6. 其他修复

### 6a. 中文文件名保留

`material-parser.ts` 中 `sanitizeFileName`：

```typescript
// Before
baseName.replace(/[^a-zA-Z0-9._-]/g, "_")

// After
baseName.replace(/[^\w\u4e00-\u9fff._-]/g, "_")
```

### 6b. 砍掉 material-digest fallback

删除 `buildMaterialDigest` 中的 `generateToolInputWithGateway` fallback（~60 行手写 JSON Schema）。只保留 `generateStructuredObject` 主路径。失败直接抛错，由 pipeline 级 catch 处理并发送 warning。

### 6c. 移除冗余排序

```typescript
// Before
batchResults.sort((left, right) => left.index - right.index).forEach(...)

// After — Promise.all 保持输入顺序，无需排序
batchResults.forEach(...)
```

---

## 7. 改动文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| **新建** | `lib/lesson-plan/material-parser.ts` | 文件解析 + 文本提取 |
| **新建** | `lib/lesson-plan/material-digest.ts` | LLM 材料提炼 |
| **新建** | `lib/lesson-plan/web-enrichment.ts` | 联网搜索 |
| **新建** | `lib/lesson-plan/prompt-builder.ts` | prompt 拼装 + 辅助函数 |
| **重写** | `app/api/lesson-plans/generate/route.ts` | 957 行 → ~250 行，切换 createUIMessageStream |
| **修改** | `lib/validation/lesson-plan.ts` | schema 增加 `enableWebSearch` 字段 |
| **修改** | `hooks/use-lesson-plan.ts` | 前端流式消费从 NDJSON → SSE 解析 |
| **修改** | `lib/api/ndjson.ts` | 新增 `parseLessonStream` 或复用改造 |
| **修改** | `components/lesson-plan/LessonPlanStudio.tsx` | 流式消费适配（由你做前端） |

**不动的文件**：
- `lib/lesson-plan/ai.ts` — 大纲/章节/改写 AI 函数不变
- `lib/lesson-plan/store.ts` — 持久化逻辑不变
- `lib/lesson-plan/types.ts` — 类型不变
- `lib/ai/model-router.ts` — 模型选择不变

---

## 8. 预期收益

| 指标 | 当前 | 优化后 |
|------|------|--------|
| route.ts 行数 | 957 | ~250 |
| 材料提炼+联网 耗时 | ~10s（串行） | ~5s（并行） |
| 无材料无联网 耗时 | 不变 | 不变（跳过两步） |
| 联网搜索 | 每次都跑 8s | 默认关闭，教师选择开启 |
| 后端超时保护 | 无 | 240s AbortController |
| 流式协议 | 自建 NDJSON | Vercel AI SDK SSE |
| 中文文件名 | 全部变 `___` | 保留中文 |

---

## 9. 风险与注意事项

1. **`createUIMessageStream` 错误处理**：execute 内抛错会自动发送 error 事件并关闭流，不需要手动 catch-and-sendLine。但要确保 `finally` 中清理 timeout。
2. **前后端必须同步切换**：NDJSON → SSE 协议不兼容，不能灰度。
3. **`generateStructuredObject` 去掉 fallback 后**：如果该函数在某些 provider 上不稳定，需要先确认当前使用的 model 是否可靠。
4. **multipart/form-data**：`createUIMessageStreamResponse` 返回 SSE 格式，但请求仍可以是 multipart。请求格式不受影响。

---

## 10. Prompt 工程优化

### 10a. 工程约束从 prompt 移到代码验证层

**问题**：`lesson-section.md` 的 Block 质量要求（L27-38）混入了字数约束（paragraph≥80 字、example≥5 步、definition≥100 字）。LLM 不擅长精确计数，这些约束占用了注意力，挤压了对语义质量的关注。

**改法**：

`lesson-section.md` Block 质量要求改为只保留语义规则：

```markdown
## Block 质量要求
1) heading：文本必须含时间信息，如"（8 分钟）"。
2) paragraph：使用 Teacher:/Student:/Key:/Note: 脚本标记，包含具体教师话术或学生活动。聚焦正面教学动作，不得包含错误分析。
3) example：每步写清"做什么 + 为什么 + 预期结果"。steps 聚焦解题推理，不要在每步加错误预防。
4) definition：覆盖正式定义 + 直觉解释 + 数值验证小例子。不嵌入错误分析。
5) steps：格式为 [X 分钟] 教师动作 + 学生反应。聚焦教学活动本身。
6) callout(misconception)：仅在学生最容易出错的 1-2 个核心概念处，整份教案最多 2 个。
7) quiz：选项必须包含真实干扰项，explanation 解释正确选项的推理。
8) math：使用 latex 字段。
9) 每个 section 至少 1 个 example block 和 1 个可检验问题（quiz/poll/think）。
```

`validateSectionBlocks()` 代码中增加字数检查：
```typescript
if (paragraph.text.length < 80) warnings.push("paragraph 内容过短")
if (example.steps.length < 5) warnings.push("example 推导步骤不足")
if (definition.explanation.length < 100) warnings.push("definition 解释过短")
```

不达标 → 标记 warning → 触发重试（现有机制）。

### 10b. 消除规则重复

**问题**：同一条规则出现 2-3 次（泛化词禁止 ×3、错误分析限制 ×2），分散 LLM 注意力。

**改法**：新建 `lib/ai/prompts/fragments/lesson-shared-rules.md`：

```markdown
### 教案通用规则

1. **禁止泛化词**：{{BANNED_WORDS}}。替换为可执行动作（提问、板书、分组任务、当堂反馈）。
2. **错误分析限制**：错误分析仅限 callout(misconception) block，整份教案最多 2 个。其他 block 聚焦正面教学。
3. **LaTeX**：所有数学表达式使用 LaTeX。
4. **Scope lock**：严格基于提供的 CED 节点，不引入未列出的知识点。
5. **输出**：必须符合工具结构。
```

`lesson-outline-rules.md` 和 `lesson-section-rules.md` 中删除重复条目，改为引用 `{{SHARED_RULES}}`，只保留各自特有的规则。

### 10c. 加入反例 Few-shot

**问题**：所有 few-shot 示例都是正例。LLM 看到"什么不该做"比被告知"不要做"更有效。

**改法**：在每个 `lesson-section-blocks-{subject}.json` 末尾加 1-2 个反例：

```json
{
  "label": "❌ 反例：paragraph 泛化空谈（常见生成错误）",
  "isNegativeExample": true,
  "block": {
    "type": "paragraph",
    "content": {
      "text": "Teacher: 讲解导数的定义，帮助学生理解极限的概念。Student: 通过练习加深对导数的理解，掌握基本的求导方法。"
    }
  },
  "issue": "全是泛化词（讲解、理解、掌握、加深），没有具体的板书内容、教师话术或学生动作。",
  "correctedLabel": "✅ 同一主题的正确写法见上方示例"
}
```

`loadJsonExamples()` 中适配：对 `isNegativeExample: true` 的示例加前缀标记。

### 10d. 关键术语精确定义

**问题**：prompt 要求"可观察产出""可执行动作"但从未定义，LLM 每次理解不同。

**改法**：在 `lesson-shared-rules.md` 中添加：

```markdown
### 术语定义

**可执行动作**（替换泛化词）：
- ✅ 提问、板书公式、展示图表、分组讨论、计时独立计算、同桌互讲、当堂反馈、举手表决
- ❌ 讲解、理解、掌握、巩固、学习（不知道教师具体做什么）

**可观察产出**（用于 section summary）：
- ✅ 学生在草稿纸上写出 3 步推导 / 举手回答定义 / 完成工作表第 1-4 题
- ❌ 学生理解了概念 / 学生掌握了方法（不可观察）

**具体**（底线标准）：
- 数学 = 有数字、有公式、有推导步骤
- 英语 = 有原文引用、有修辞手法名称、有效果分析
- 历史 = 有史料来源、有年份、有因果链
```

### 10e. CoT 引导性问题

**问题**：当前 prompt 直接要求输出 JSON，LLM 没有思考空间。但因使用结构化输出，不能让 LLM 先输出推理文本。

**改法**：在 `lesson-section.md` 的 `## 当前章节` 和 `## Block 质量要求` 之间插入：

```markdown
## 生成前内部检查（据此决定内容，不需要输出）

- 当前章节《{{SECTION_TITLE}}》的核心教学目标是什么？→ 决定 block 选择
- 学生水平是 {{STUDENT_LEVEL}}，example 推导步骤应拆到什么粒度？
- 前文已讲 {{PREVIOUS_SUMMARY}}，当前章节从哪里衔接？
- 学生最可能在哪一步卡住？→ 决定 misconception callout 位置
```

不增加输出 token，只引导 LLM 的注意力方向。

---

## 11. 完整改动文件清单（含 prompt 优化）

| 操作 | 文件 | 说明 |
|------|------|------|
| **新建** | `lib/lesson-plan/material-parser.ts` | 文件解析 + 文本提取 |
| **新建** | `lib/lesson-plan/material-digest.ts` | LLM 材料提炼 |
| **新建** | `lib/lesson-plan/web-enrichment.ts` | 联网搜索 |
| **新建** | `lib/lesson-plan/prompt-builder.ts` | prompt 拼装 + 辅助函数 |
| **新建** | `lib/ai/prompts/fragments/lesson-shared-rules.md` | 共享规则（去重） |
| **重写** | `app/api/lesson-plans/generate/route.ts` | 957→~250 行，切换 createUIMessageStream |
| **修改** | `lib/validation/lesson-plan.ts` | 增加 `enableWebSearch` 字段 |
| **修改** | `lib/ai/prompts/lesson-section.md` | 字数约束移除 + 加 CoT 引导段 |
| **修改** | `lib/ai/prompts/tasks/lesson-outline-rules.md` | 删除重复规则，引用 shared-rules |
| **修改** | `lib/ai/prompts/tasks/lesson-section-rules.md` | 删除重复规则，引用 shared-rules |
| **修改** | `lib/ai/prompt-assembler.ts` | 加载 shared-rules + 反例标记处理 |
| **修改** | `lib/lesson-plan/ai.ts` 的 `validateSectionBlocks` | 增加字数检查逻辑 |
| **修改** | `lib/ai/prompts/examples/lesson-section-blocks-*.json` ×6 | 各加 1-2 个反例 |
| **修改** | `hooks/use-lesson-plan.ts` | 前端流式消费从 NDJSON → SSE |
| **修改** | `lib/api/ndjson.ts` | 新增 `parseLessonStream` 或复用 |
| **修改** | `components/lesson-plan/LessonPlanStudio.tsx` | 流式消费适配（由你做前端） |

---

## 12. 预期收益（含 prompt 优化）

| 指标 | 当前 | 优化后 |
|------|------|--------|
| route.ts 行数 | 957 | ~250 |
| 材料提炼+联网 耗时 | ~10s（串行） | ~5s（并行） |
| 联网搜索 | 每次都跑 8s | 默认关闭 |
| 后端超时保护 | 无 | 240s AbortController |
| 流式协议 | 自建 NDJSON | Vercel AI SDK SSE |
| 中文文件名 | 全部变 `___` | 保留中文 |
| prompt 规则重复 | 3 处 | 1 处（shared-rules） |
| prompt token 量 | ~2800 token | ~2400 token（减 ~15%） |
| 生成质量约束 | 靠 LLM 数字数 | 代码精确验证 + 重试 |
| few-shot 反例 | 无 | 每学科 1-2 个 |

---

## 13. 风险与注意事项

1. **`createUIMessageStream` 错误处理**：execute 内抛错自动发送 error 事件并关闭流。确保 `finally` 中清理 timeout。
2. **前后端必须同步切换**：NDJSON → SSE 协议不兼容，不能灰度。
3. **`generateStructuredObject` 去掉 fallback 后**：确认当前 model 在该函数上稳定。
4. **multipart/form-data**：请求格式不受 SSE 响应影响。
5. **反例 few-shot**：`loadJsonExamples()` 需要过滤 `isNegativeExample` 并加"❌ 反例"前缀，避免 LLM 误学反例格式。
6. **字数检查移到验证层后**：首轮生成可能出现更多不达标 block，重试次数可能上升。观察重试率，必要时微调阈值。
