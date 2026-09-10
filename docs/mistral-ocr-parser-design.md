# Mistral OCR 结构化解析方案

## 现状
Mistral OCR 返回的 markdown 已经高度结构化：
- 题号：`1.` `2.` `3.`
- 选项：`(A)` `(B)` `(C)` `(D)` `(E)`
- 图片：`![img-0.jpeg](img-0.jpeg)`（已持久化为 Storage URL）
- 表格：`[tbl-0.html](tbl-0.html)` 或内联 HTML
- 公式：LaTeX `$...$`

但当前用的是旧的通用正则解析器（`parseQuestionsFromText`），它不理解 Mistral 的格式，导致题目边界切割不准。

## 方案：不需要 LLM，写一个 Mistral markdown 专用解析器

### Mistral OCR 输出格式分析（基于真实测试）

```markdown
# Unit 3 Progress Check: MCQ              ← 标题（忽略）

A firm has only five possible...          ← 共享题干（跨多题）
![img-0.jpeg](img-0.jpeg)                ← 图片关联到下面的题

1. The firm's minimum efficient scale...  ← 题号开始新题
(A) SRATC₁                               ← 选项
(B) SRATC₂
...

2. Which of the following...              ← 下一题
(A) Q₁ to Q₂
...

AP Microeconomics                         ← 页脚（忽略）
```

### 解析规则
1. **题号识别**：`/^\d+\.\s/m` 开头的行 = 新题开始
2. **选项识别**：`/^\(([A-E])\)\s/m` 开头的行 = 选项
3. **图片关联**：`![...](...)` 在题号之前 = 共享给后面的题；在题号之后 = 属于当前题
4. **页脚过滤**：`/^AP\s+(Micro|Macro|Calculus|Biology|Chemistry|Management)/` = 忽略
5. **标题过滤**：`/^#\s/` 开头 = 忽略
6. **表格处理**：`[tbl-N.html]` 引用 = 保留在题干中

### 数据输出
```typescript
{
  questionNumber: 1,
  content: "A firm has only five...\n\n![img-0.jpeg](/api/pdf/scan-image?...)",
  questionType: "choice",
  options: { A: "SRATC₁", B: "SRATC₂", C: "SRATC₃", D: "SRATC₄", E: "SRATC₅" },
  confidence: 95,
  sourcePageNumber: 1
}
```

### 优势
- 零 LLM 调用
- 确定性解析（不依赖模型输出）
- 比正则解析器更准（专门为 Mistral 格式设计）
- 图片和选项边界不会混乱

### 改动量
- 新建 `lib/pdf-scan/mistral-markdown-parser.ts` (~150 行)
- 修改 `pipeline.ts` Mistral 分支，用新解析器替代 `parseQuestionsFromText`
