# 两大优化方案：图片归属 + 加载性能

## 一、图片归属修复

### 根因

Mistral OCR 的图片位置是准的，问题在解析器。三种图片位置模式：

```
模式 A（共享图）：图在题号之前
  Page 1: [上下文文本] → [img-0] → Q1 → Q2
  图应该属于 Q1 和 Q2（两题共享同一张图）

模式 B（专属图）：图在题号之后
  Page 5: Q12 → [img-2] → [选项]
  Page 7: Q19 → [img-3] → [选项]
  图只属于该题

模式 C（无图）：纯文本题
```

当前解析器把模式 A 的共享图只给了 Q1，Q2 没拿到。

### 修复方案

改 `parseMistralOcrMarkdown` 的共享上下文逻辑：

1. **模式 B 不需要改** — 图在题号和选项之间，自然属于当前题干
2. **模式 A 需要改** — 检测"图在题号之前"的情况，把图和上下文文本分发给该组所有连续题

具体规则：
```
扫描每页 markdown：
  - 遇到图片/文本（不是题号也不是选项）→ 存入 pendingContext
  - 遇到题号 → 把 pendingContext 附加到该题的 stem 前面
  - 关键改动：pendingContext 不清空，直到遇到新的 pendingContext
  - 这样同组连续题都能继承共享的图和上下文
```

改动量：`mistral-markdown-parser.ts` ~20 行

### 验证方法

Page 1 的 img-0 应该同时出现在 Q1 和 Q2 的 content 里。
Page 3 的 img-1 应该同时出现在 Q5 和 Q6 的 content 里。

---

## 二、加载性能优化

### 当前瓶颈分析

```
用户打开题库页面
  → GET /api/question-bank?limit=200
  → SQL: SELECT * FROM exercises
         JOIN courses ON ...
         JOIN units ON ...
         JOIN import_batches ON ...
         JOIN taxonomy_nodes ON ... (× 2)
  → 返回 200 条完整记录（每条含 question_text 全文、options JSON、classification_reasons 等）
  → 前端一次性渲染 200 个 DOM 节点
```

### 优化方案（三层）

#### 第一层：SQL 精简（立即见效，改动最小）

列表页不需要完整数据。分成两个查询粒度：

**列表查询**（首屏加载）：
```sql
SELECT
  id,
  exercise_type,
  difficulty,
  substring(question_text, 1, 80) as title,  -- 只要前 80 字符
  knowledge_cluster,
  knowledge_subskill_key,
  knowledge_subskill_label,
  source_kind,
  source_file_name,
  source_page_start
FROM exercises
WHERE teacher_id = $1
ORDER BY created_at DESC
LIMIT 200
```

去掉：question_text 全文、options、correct_answer、solution_steps、classification_reasons、subskill_reasons、所有 JOIN。

**详情查询**（点击展开时）：
```sql
SELECT * FROM exercises WHERE id = $1
```

已有的 `/api/question-bank/{questionId}` 详情 API 可以直接用。

预估效果：响应体积从 ~500KB 降到 ~30KB，SQL 执行时间从 ~200ms 降到 ~20ms。

改动量：`lib/question-bank/store.ts` 新增一个轻量 select 语句 ~15 行，`app/api/question-bank/route.ts` 切换到轻量查询。

#### 第二层：知识树按需加载（中等改动）

首屏只加载知识树统计：
```sql
SELECT
  knowledge_cluster,
  knowledge_subskill_key,
  count(*) as count
FROM exercises
WHERE teacher_id = $1
GROUP BY knowledge_cluster, knowledge_subskill_key
```

用户点开某个 unit 后，再加载该 unit 的题目列表。

预估效果：首屏从加载 200 条题目 → 只加载 ~10 行统计数据。

改动量：新 API + 前端侧边栏改为按需加载 ~50 行。

#### 第三层：虚拟滚动（大数据量保险）

当某个分组超过 50 道题时，用 `@tanstack/react-virtual` 只渲染可见的行。

预估效果：DOM 节点从 N 个 → 固定 25 个，滚动流畅不卡。

改动量：需要安装依赖 + QuestionList.tsx 改用虚拟列表 ~40 行。

### 推荐实施顺序

1. **SQL 精简**（5 分钟，立竿见影） — 列表不返回 question_text 全文
2. **图片归属修复**（10 分钟） — 共享上下文分发
3. **知识树按需加载**（30 分钟） — 首屏只加载统计
4. **虚拟滚动**（后续） — 题量超 500 时再加
