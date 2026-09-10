# PDF 拆题两大问题分析

## 问题一：分类数据没写入数据库

### 现象
- PDF 上传 → OCR 成功 → 题目入库 → 但 `knowledge_cluster` 字段全是 null
- 前端知识树显示"未分类 200"，没有按知识点分组
- 数据库 `scan_result` JSON 里有 `knowledgePoint: "Absolute and Comparative Advantage"` 和 `subject: "Microeconomics"`，说明 OCR 阶段已经识别了学科和知识点，但这些信息没有传递到 exercises 表的分类字段

### 根因（已定位，2026-03-16 深度排查）

入库流程有两阶段分类：

```
阶段 1: Haiku 快速分类（taxonomy.ts）
  → ~1 秒/题，输出 knowledgeCluster + assessmentStyle
  → 对新类别（microeconomics）能正确输出

阶段 2: Gemini Flash Lite 细分分类（taxonomy-ai.ts）
  → ~2 秒/题，3 并发，用 gemini-3.1-flash-lite-preview
  → 输出 resolvedCluster + subskillKey + subskillLabel
  → 日志确认输出了正确的 "microeconomics" + "Opportunity Cost" 等
```

**两阶段都成功了，但结果在写入时被丢弃了。**

具体断点在 `taxonomy-ai.ts` 第 263-274 行：
```typescript
if (result.mode === "matched_existing") {
  const definition = getSubskillDefinition(finalCluster, result.subskillKey);
  if (!definition) {
    return fallbackDetailedTaxonomy(base, ["轻量模型未匹配到稳定的小类键..."]);
    // ↑ 对新类别 microeconomics，内置 subskill 定义不存在
    // ↑ 所以返回了 fallback → base.knowledgeCluster
    // ↑ 但 base 来自 Haiku，knowledgeCluster 应该有值
  }
}
```

`getSubskillDefinition("microeconomics", "opportunity_cost")` 返回 null，因为内置 subskill 只覆盖了 19 个老类别。二阶段分类走 fallback，丢弃了 LLM 正确输出的 `resolvedCluster: "microeconomics"`。

**已修复**（taxonomy-ai.ts）：当 `getSubskillDefinition` 对新类别返回 null 但 LLM 有 subskillLabel 时，直接用 LLM 输出的结果作为 `candidate_new`，不再 fallback。

### 补充排查（2026-03-16 深度追踪）

深度代码追踪后发现：
- `save-to-library.ts` 已经使用 `classifyExerciseTaxonomyQuickBatch`（Haiku，非 Gemini）
- Haiku prompt 已改为开放式（允许创建新 key）
- `normalizeCluster` 已改为保留任意 snake_case key
- DB 里 null 的那批数据（202 道）是旧代码执行时产生的遗留数据
  - `classification_reasons: ["taxonomy_needs_review"]` 和 `confidence: 0` 说明分类函数根本没被调用
  - 可能是 curl 超时中断后服务端的部分执行残留
- **当前代码逻辑已正确**，需要用新代码重新上传 PDF 验证

### 解决方案

**方案 A：入库时只用阶段 1 Haiku（推荐）**

改 `save-to-library.ts`，把 `classifyExerciseTaxonomyBatchWithAi`（慢，Gemini）替换为逐题调用 `classifyExerciseTaxonomy`（快，Haiku）。

```
改动前：100 道题 → Gemini Pro × 100 → 14 分钟
改动后：100 道题 → Haiku × 100（并发 5） → ~20 秒
```

Haiku 已经能输出 knowledgeCluster + subskillLabel + assessmentStyle，足够前端知识树分组。细分分类可以后台异步补充。

改动量：`save-to-library.ts` 改 ~15 行（替换分类函数调用）。

**方案 B：异步分类**

入库时不做分类，先存题。后台用定时任务或队列逐题分类，分类完更新 exercises 表。

优点：入库速度最快。缺点：题目入库后到分类完成之间，前端显示"未分类"。

**方案 C：保留二阶段但加超时保护**

给 `classifyExerciseTaxonomyBatchWithAi` 加总超时（如 60 秒），超时的题用阶段 1 Haiku 结果兜底。

复杂度较高，不推荐。

### 推荐：方案 A

理由：
1. Haiku 分类准确率已经够用（从测试看，能正确输出 `microeconomics`）
2. 速度从 14 分钟 → 20 秒
3. 改动量最小
4. 细分分类（subskill 匹配）可以后续异步补充，不阻塞入库

---

## 问题二：图片没有保留

### 现象
- AP 考试题目经常包含图表（供需曲线图、PPC 图、表格截图等）
- 当前 OCR 只提取了文字，图片被丢弃
- 前端显示的题目只有文本，缺少关键图表
- 有些题目的选项本身就是图片（如"下列哪张图正确描述了..."）

### 根因
OCR pipeline 的两种模式都不保留图片：

**文本模式（Mathpix/Mistral）：**
```
PDF → Mathpix API → 返回 MMD 文本 → 正则提取题目
                     ↑ 图片引用变成 ![](url) 但 url 是 Mathpix 临时链接
                     ↑ 临时链接过期后图片就没了
```

**Vision 模式（Claude/Gemini）：**
```
PDF → 渲染成 PNG → 发给 LLM → LLM 输出纯文本的题目结构
                                ↑ LLM 会描述图片内容但不会保留图片本身
```

两种模式都在"提取"阶段丢弃了图片。`ScannedQuestion` 类型有 `linkedFigures?: string[]` 字段，但实际上从来没有被填充过。

### 解决方案

**方案 A：PDF 页面截图关联（推荐，最轻量）**

不做复杂的图片提取，而是：
1. 把 PDF 每一页渲染成 PNG（`renderPdfPages()` 已经有这个能力）
2. 把页面 PNG 上传到 Supabase Storage
3. 每道题记录它来自哪一页 → 关联到页面截图
4. 前端展示题目时，显示对应页面的截图作为参考图

```
PDF 第 5 页 → 渲染 PNG → 存到 Storage → 路径存到 exercises.source_page_image_url
前端展开题目详情时 → 加载对应页面截图 → 显示在题干下方
```

优点：
- 不需要做复杂的图片提取/裁剪
- 老师能看到原始 PDF 页面，包括所有图表
- 改动量小（pipeline 加页面存储 + 前端加图片显示）

缺点：
- 显示的是整页截图，不是精确裁剪的图

改动量：
- `lib/pdf-scan/pipeline.ts`：渲染页面 PNG 并上传 Storage（~30 行）
- `save-to-library.ts`：exercises 表写入 `source_page_image_url`（~5 行）
- 数据库迁移：exercises 加 `source_page_image_url text` 列（~3 行）
- 前端 `QuestionList.tsx` ExpandedDetail：显示页面截图（~10 行）

**方案 B：精确图片提取**

从 PDF 中提取每张图片，关联到对应题目。

技术路线：
1. 用 `pdf-lib` 或 `pdfjs-dist` 提取 PDF 内嵌图片
2. 用 LLM Vision 判断每张图属于哪道题
3. 上传到 Storage，关联到 exercises

优点：精确。缺点：极其复杂，PDF 图片提取不稳定（有些图是矢量的、有些是内嵌位图、有些是多图拼接），LLM 关联也不一定准。

不推荐，投入产出比太低。

**方案 C：Mathpix 图片持久化**

Mathpix API 返回的 MMD 格式包含图片引用（`![](https://mathpix.com/...)`），但链接是临时的。可以在 OCR 完成后立即下载这些图片并存到 Supabase Storage，替换 URL。

优点：图片质量好，位置准确。缺点：只对 Mathpix 模式有效，Mistral 模式无图片。

### 推荐：方案 A（页面截图关联）

理由：
1. 最轻量 — 不需要复杂的图片提取逻辑
2. 信息完整 — 老师能看到原始 PDF 页面的全部内容
3. `renderPdfPages()` 已经存在 — 只需加一步"上传到 Storage"
4. 未来可以增量优化 — 先用页面截图，后续再做精确裁剪

---

## 优先级建议

| 问题 | 优先级 | 方案 | 预估改动量 | 预估耗时 |
|------|--------|------|-----------|---------|
| 分类数据没写入 | P0 | 方案 A：Haiku 替代 Gemini | ~15 行 | 30 分钟 |
| 图片没保留 | P1 | 方案 A：页面截图关联 | ~50 行 + 迁移 | 2-3 小时 |

---

## 补充稳定性问题（2026-03-17）

### 问题三：上传队列会把“仍在解析/入库中”的任务误判成完成

#### 现象

- 页面刷新后，某些 PDF 上传任务会直接显示“完成”，但题目实际上还没真正入库。
- 恢复中的前端队列会重复触发 `process-scan`，造成重复处理或状态错乱。

#### 根因

- `scan-status` 以前对“没有 Mathpix ID 的 pending/processing 任务”一律返回 `completed`。
- 这只适用于“尚未进入 `process-scan` 的本地 OCR 任务”，不适用于“已经在 `process-scan` 中”的任务。
- 同时，`process-scan` 在保存题库失败时仍返回 `200`，前端会把失败任务当成功完成。

#### 已修复

- `process-scan` 在真正开始处理前先把任务状态占用为 `processing`，避免恢复逻辑重复抢占。
- `scan-status` 现在区分：
  - `pending + !mathpix_id`：允许前端进入 `process-scan`
  - `processing + !mathpix_id`：表示仍在解析/入库中，继续返回 `processing`
- `process-scan` 在保存失败时改为返回非 2xx，并把数据库状态写成 `failed`，前端不再误报成功。
- 前端上传队列改为读取真实 `savedCount`，不再默认把 `stats.total` 当成“已成功入库数量”。
