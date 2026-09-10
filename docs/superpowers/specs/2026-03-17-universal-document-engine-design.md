# Universal Document Engine — 设计文档

> 日期: 2026-03-17
> 状态: Draft
> 范围: worksheet, exam, rubric, lesson-plan, quiz 五种文档的统一渲染、AI 编辑、PDF 导出

---

## 1. 问题与目标

### 当前问题

- Worksheet/Quiz/Exam 生成后以 Markdown 文本展示，排版不专业
- Rubric 已有专用组件（RubricTable），但与其他文档类型割裂
- PDF 导出走 Typst 引擎，和浏览器预览是两套渲染，无法做到所见即所得
- 教师无法对生成结果进行局部修改，只能重新生成

### 目标

1. **统一文档引擎** — 一套 Block 模型 + 渲染组件服务 5 种文档
2. **所见即所得** — 右侧预览和 PDF 导出 100% 一致
3. **AI 局部编辑** — 教师选中内容 → 自然语言指令 → AI 只修改选中部分，其余不动
4. **流式生成** — 教师看到文档从上到下逐步渲染出来
5. **轻量稳定** — 最少依赖，最大稳定性

---

## 2. 技术选型

| 层 | 选型 | 理由 |
|----|------|------|
| 文档引擎 | **TipTap（开源层）** | Word 式选中体验、NodeView 自定义渲染、editor.commands 精确替换、Undo/Redo、Drag Handle |
| 分页 | **Paged.js** (~38KB) | W3C CSS Paged Media 官方 polyfill，解决 break-inside 浏览器兼容 |
| PDF 导出 | **Puppeteer（puppeteer-core + @sparticuz/chromium）** | 同一份 HTML/CSS 生成 PDF，所见即所得。@sparticuz/chromium 压缩后 ~50MB，兼容 Vercel Serverless |
| 数学公式 | **@tiptap/extension-mathematics**（KaTeX） | AP 数学/物理公式，点击可编辑 LaTeX |
| 流式传输 | **NDJSON**（复用现有模式） | 和 rubric/lesson-plan 生成同模式 |

### 新增依赖清单

| 包 | 体积 | 用途 |
|----|------|------|
| @tiptap/core | ~25KB | 编辑器核心 |
| @tiptap/react | ~8KB | React 绑定 |
| @tiptap/pm | ~50KB | ProseMirror 底层 |
| @tiptap/extension-mathematics | ~5KB | 数学公式节点 |
| @tiptap/extension-table（+ row/header/cell） | ~10KB | 表格 |
| @tiptap/extension-image | ~3KB | 图片节点 |
| @tiptap/extension-placeholder | ~2KB | 占位提示 |
| @tiptap/extension-horizontal-rule | ~2KB | 分隔线 |
| paged.js | ~38KB | CSS 分页（仅用于浏览器预览分页，需 dynamic import + ssr:false） |
| **总计** | **~143KB** | |

注意: 使用 `next/dynamic` 对文档引擎做动态导入，避免影响首屏加载。

### 不引入的

- 不用 TipTap Pro/Cloud（AI Extension、Comments、DOCX 导出、Drag Handle React 均为付费，用自建替代）
- 不用完整 Playwright/Chromium（130-400MB），改用 puppeteer-core + @sparticuz/chromium（~50MB）
- 不用 Plate.js（200KB+，功能重叠）
- 不用 @use-gesture（TipTap 原生选中已覆盖）
- 不用 Yjs 协同（V2 考虑）

---

## 3. 通用 Block 模型

### 3.1 文档结构

```
DocumentModel
├── id: string (UUID)
├── type: "worksheet" | "exam" | "rubric" | "lesson-plan" | "quiz"
├── title: string
├── meta
│   ├── courseName?: string
│   ├── unitName?: string
│   ├── teacherName?: string
│   ├── schoolLogo?: string
│   ├── date?: string
│   ├── totalPoints?: number
│   └── duration?: number (考试时长/分钟)
├── blocks: Block[] (有序列表)
└── layoutConfig
    ├── pageSize: "A4" | "Letter"
    ├── columns: 1 | 2
    ├── margins: { top, bottom, left, right }
    ├── headerText?: string
    ├── footerText?: string
    └── showPageNumbers: boolean
```

### 3.2 Block 类型（12 种）

| Block Type | 用途 | 主要字段 |
|------------|------|---------|
| **header** | 文档标题/副标题 | title, subtitle, level |
| **section-title** | 分区标题（"Part A: Multiple Choice"） | title, numbering |
| **instruction** | 说明文字 | text (rich text) |
| **question** | 题目 | number, stem, questionType (mc/frq/fill/tf), 按 questionType 使用 discriminated union（见下方说明） |
| **rubric-row** | Rubric 维度行 | dimension, weight, levels[{label, score, description}] |
| **lesson-step** | 教案步骤 | phase, title, duration, objectives[], activities[], materials[], teacherNotes |
| **table** | 通用表格 | headers[], rows[][], caption |
| **math** | 独立数学公式 | latex, displayMode |
| **image** | 图片 | src, alt, width, caption |
| **divider** | 分隔线 | style (solid/dashed/dotted) |
| **answer-space** | 答题空白区 | size (small/medium/large), lines |
| **page-break** | 强制分页 | (无额外字段) |

### 3.3 Question Block Discriminated Union

question block 按 questionType 区分，每种类型只包含有意义的字段:

| questionType | 专有字段 | 说明 |
|-------------|---------|------|
| mc（选择题） | options[{id, label, text}], correctAnswer: string | 选项 + 正确答案 ID |
| frq（自由回答） | answerSpace: small/medium/large, sampleAnswer?: string | 答题区大小 + 参考答案 |
| fill（填空题） | blanks[{position, answer}] | 空格位置 + 答案 |
| tf（判断题） | correctAnswer: boolean | True/False |

共有字段: number, stem, points?, difficulty?, explanation?

使用 Zod `z.discriminatedUnion("questionType", [...])` 校验，NodeView 内部按类型拆分子组件。

### 3.4 各文档类型的 Block 组合

| 文档类型 | 典型 Block 序列 |
|---------|----------------|
| **Worksheet** | header → section-title → question → answer-space → question → answer-space → ... |
| **Exam** | header → instruction → section-title → question × N → page-break → section-title → question × N |
| **Rubric** | header → table(表头) → rubric-row × N |
| **Lesson Plan** | header → lesson-step(warm-up) → lesson-step(instruction) → lesson-step(practice) → lesson-step(summary) |
| **Quiz** | header → instruction → question(mc) × N（无 answer-space，选择题为主） |

### 3.4 TipTap Schema 映射

每种 Block 注册为 TipTap 的 Custom Node：

- group: "block"
- 用 NodeView (React) 渲染
- attrs 存储 block data
- 不允许自由编辑内容结构（教师只能通过 AI 或点击编辑特定字段）

---

## 4. 渲染层

### 4.1 架构

```
TipTap Editor (editable: false by default)
└── NodeView: HeaderBlockView
└── NodeView: SectionTitleBlockView
└── NodeView: QuestionBlockView
    ├── 题号 + 分值
    ├── 题干（支持 KaTeX 内联公式）
    ├── 选项列表（MC 时显示）
    │   ├── 短选项 → 两列网格
    │   └── 长选项/含公式 → 单列
    └── 答题区（answer-space）
└── NodeView: RubricRowBlockView
    └── 维度名 + 等级表格行
└── NodeView: LessonStepBlockView
    ├── phase 标签（颜色区分）
    ├── 标题 + 时长
    ├── 目标列表
    └── 活动列表
└── ...
```

### 4.2 文件结构

```
lib/doc-engine/
├── schema/
│   ├── document-schema.ts       # Zod schema（验证 LLM 输出）
│   ├── tiptap-nodes.ts          # TipTap Custom Node 定义
│   └── block-types.ts           # TypeScript 类型定义
├── views/                       # React NodeView 组件
│   ├── HeaderBlockView.tsx
│   ├── SectionTitleBlockView.tsx
│   ├── QuestionBlockView.tsx
│   ├── RubricRowBlockView.tsx
│   ├── LessonStepBlockView.tsx
│   ├── TableBlockView.tsx
│   ├── MathBlockView.tsx
│   ├── ImageBlockView.tsx
│   ├── AnswerSpaceBlockView.tsx
│   ├── DividerBlockView.tsx
│   └── PageBreakBlockView.tsx
├── DocumentEngine.tsx           # 顶层组件（TipTap Editor + Paged.js）
├── DocumentToolbar.tsx          # Bubble Menu（AI 编辑入口）
├── styles/
│   ├── document.css             # 文档基础样式
│   └── print.css                # @page 规则 + 打印样式
├── hooks/
│   ├── useDocumentEngine.ts     # 初始化 TipTap Editor
│   ├── useDocumentStream.ts     # 流式生成消费
│   └── useDocumentAiEdit.ts     # AI 编辑管道
└── export/
    └── pdf-export.ts            # Playwright PDF 导出逻辑
```

### 4.3 CSS 打印布局

```
.doc-engine-page
├── 宽度固定（A4: 210mm / Letter: 8.5in）
├── 最小高度（A4: 297mm / Letter: 11in）
├── 白色背景 + 阴影（模拟纸张）
├── 内边距（模拟打印边距）
├── 字体: Times New Roman / Noto Serif SC, 11pt
└── 行高: 1.6

Paged.js 接管后:
├── 自动分页
├── break-inside: avoid（block 不被截断）
├── 页眉/页脚自动注入
└── 页码自动编号
```

---

## 5. 流式生成层

### 5.1 后端 API

新增统一生成端点: `POST /api/doc/generate`

请求参数:
```
{
  documentType: "worksheet" | "exam" | "rubric" | "lesson-plan" | "quiz"
  track: "ap" | "general"
  courseId?: string
  unitId?: string
  topic?: string
  sourcePrompt: string        // 用户的自然语言需求
  preferences?: {
    pageSize: "A4" | "Letter"
    columns: 1 | 2
    questionCount?: number
    difficulty?: 1 | 2 | 3
    duration?: number
    includeAnswerKey?: boolean
  }
}
```

响应: NDJSON 流

```
{"type":"meta","document":{"id":"...","type":"worksheet","title":"...","meta":{...},"layoutConfig":{...}}}
{"type":"block","block":{"id":"b1","type":"header","data":{...}}}
{"type":"block","block":{"id":"b2","type":"section-title","data":{...}}}
{"type":"block","block":{"id":"b3","type":"question","data":{...}}}
{"type":"block","block":{"id":"b4","type":"question","data":{...}}}
...
{"type":"progress","blocksGenerated":5,"estimatedTotal":12}
{"type":"error","message":"LLM rate limit exceeded","partial":true}
{"type":"complete","documentId":"..."}
```

事件类型说明:
- **meta**: 文档元数据（第一个事件）
- **block**: 单个 block 生成完成
- **progress**: 进度更新（已生成/预估总数）
- **error**: 生成出错（partial=true 表示已有部分结果可用）
- **complete**: 全部完成

前端在收到 error + partial=true 时，保留已渲染的 blocks，提示"生成中断，已完成 N 个部分，是否保留？"

### 5.2 前端 Hook

useDocumentStream 消费流:

1. 收到 "meta" 事件 → 初始化 TipTap Editor，设置空文档
2. 收到 "block" 事件 → 调用 editor.commands.insertContentAt(末尾, blockNode)
3. 每个 block 插入后立即渲染（教师看到文档逐步生长）
4. 收到 "complete" 事件 → 标记生成完成，启用交互

### 5.3 与现有系统的关系

- 不替代现有的 /api/ai/rubric、/api/lesson-plans/generate 等 API
- 新 API /api/doc/generate 是统一入口，内部根据 documentType 调用对应的现有生成逻辑
- 现有生成逻辑输出转换为 Block 格式后通过 NDJSON 流返回
- 渐进迁移: 先接入 worksheet/exam，再逐步迁移 rubric 和 lesson-plan

---

## 6. 选择层 + AI 编辑管道

### 6.1 交互流程

```
1. 教师在右侧文档上按住左键拖选（和 Word 一样）
   → TipTap 原生文本选择，蓝色高亮

2. 松手后，选区旁弹出 Bubble Menu
   → 一个 "AI 修改" 按钮 + 一个输入框

3. 教师输入指令（"把这道题改成关于导数的"、"难度降低"、"增加一个选项"）

4. 系统处理:
   a. 通过 editor.state.selection 获取选区范围
   b. 遍历选区内的 TipTap 节点，提取对应 block 的 JSON
   c. 构建 AI 请求: { selectedBlocks: [...], instruction: "...", documentContext: {...} }
   d. 调用 POST /api/doc/edit

5. AI 处理中:
   → 被选中的 block 显示"编辑中"状态（虚线边框 + 半透明）
   → 文档其余部分完全不动，教师可以继续浏览

6. AI 返回修改后的 blocks:
   → 通过 editor.chain() 精确替换目标节点
   → 被修改的内容短暂标绿（Decoration），表示"这里被改了"
   → 教师可以 Ctrl+Z 撤销
```

### 6.2 AI 编辑 API

新增端点: `POST /api/doc/edit`

请求:
```
{
  documentId: string
  selectedBlockIds: string[]        // 被选中的 block ID 列表
  selectedBlocks: Block[]           // 选中 block 的完整 JSON
  instruction: string               // 教师的修改指令（maxLength: 500）
  documentContext: {                 // 上下文（帮助 AI 理解整体）
    documentType: string
    title: string
    meta: DocumentMeta
    totalBlockCount: number
    surroundingBlocks?: Block[]     // 选区前后各 1-2 个 block
  }
}
```

响应:
```
{
  modifiedBlocks: Block[]           // 修改后的 block 列表（保持原 ID）
  summary: string                   // AI 简要说明改了什么
}
```

### 6.3 容错设计

**超时**: 前端 AbortController 30s 超时。后端 LLM 调用 25s 超时。超时后返回原 blocks 不变。

**校验**: AI 返回的 blocks 必须通过 Zod schema 校验。不合法的 block 跳过，保留原 block，前端提示"部分修改未生效"。

**并发锁**: 编辑进行中禁用再次编辑（前端用 loading 状态锁住 Bubble Menu）。避免两次编辑基于旧状态互相覆盖。

**失败回退**: 任何错误 → 返回 `{ error, fallbackBlocks: originalBlocks }`，前端不做任何替换，提示错误信息。

### 6.4 替换策略

- AI 返回的 blocks 保持原 ID → 通过 ID 找到文档中对应节点 → 原地替换
- 如果 AI 需要新增 block（比如"增加一个选项"），返回的 blocks 中会有新 ID 的 block
- 如果 AI 需要删除 block，返回的 blocks 列表中不包含该 block
- 替换操作包裹在一个 editor.chain() 事务中 → 整体作为一次 undo 步骤

---

## 7. PDF 导出层

### 7.1 方案: puppeteer-core + @sparticuz/chromium

使用 Serverless 专用的轻量 Chromium（@sparticuz/chromium，~50MB 压缩），配合 puppeteer-core。
同一份 HTML/CSS 生成 PDF，真正的所见即所得。

### 7.2 新增依赖

| 包 | 体积 | 说明 |
|----|------|------|
| puppeteer-core | ~3MB | Puppeteer 核心（不含 Chromium） |
| @sparticuz/chromium | ~50MB（压缩） | Serverless 专用 Chromium，npm 周下载 100 万+ |

### 7.3 流程

```
教师点击 "导出 PDF"
→ 前端将当前 TipTap 文档序列化为 HTML
→ POST /api/doc/export-pdf { html, layoutConfig }
→ 服务端:
  1. 启动 @sparticuz/chromium 实例
  2. 加载 HTML + 注入 print.css + Paged.js
  3. 等待 Paged.js 完成分页渲染
  4. page.pdf() 生成 PDF
  5. 关闭浏览器实例
  6. 返回 PDF 二进制流
→ 前端触发下载
```

### 7.4 API

端点: `POST /api/doc/export-pdf`

请求:
```
{
  html: string                      // TipTap 导出的 HTML
  layoutConfig: LayoutConfig        // 页面配置
  includeAnswerKey?: boolean        // 是否包含答案
}
```

响应: `application/pdf` 二进制流

### 7.5 Serverless 配置

- Vercel Serverless Function 需要配置 `maxDuration: 30`（Pro 版最高 300s）
- 函数内存建议 1024MB（Chromium 需要 ~200MB 运行内存）
- 首次冷启动 ~2-3s，后续复用实例 ~1s
- next.config.js 中需要排除 @sparticuz/chromium 的 webpack bundling

### 7.6 与现有 Typst 导出的关系

- 新引擎的 PDF 导出走 Puppeteer，实现真正的所见即所得
- 现有 Typst 导出保留，不删除，供尚未迁移的功能使用
- 迁移完成后，Typst 相关代码可按需保留或移除

---

## 8. TipTap 扩展使用清单

### MVP 阶段

| 扩展 | 包名 | 用途 |
|------|------|------|
| StarterKit | @tiptap/starter-kit | 基础文本编辑能力 |
| React NodeView | @tiptap/react | 自定义 React 组件渲染 |
| Bubble Menu | @tiptap/extension-bubble-menu | 选中后弹出 AI 编辑入口 |
| Mathematics | @tiptap/extension-mathematics | LaTeX 公式 |
| Table | @tiptap/extension-table + row/header/cell | Rubric 表格 |
| Image | @tiptap/extension-image | 题目配图 |
| Placeholder | @tiptap/extension-placeholder | 答题区提示文字 |
| Horizontal Rule | @tiptap/extension-horizontal-rule | 分隔线 |
| Drag Handle | 自建（基于 ProseMirror NodeView + HTML5 Drag API） | 拖拽排序（@tiptap/extension-drag-handle-react 是 Pro 付费，自建替代） |
| History | @tiptap/extension-history | Undo/Redo |
| Focus | @tiptap/extension-focus | 焦点高亮 |
| Character Count | @tiptap/extension-character-count | 字符统计（用于计费估算） |

### V2 阶段

| 扩展 | 用途 |
|------|------|
| Collaboration (Yjs) | AI 修改实时流式出现 |
| Comments | 教师批注 |
| Slash Commands (Suggestion) | 输入 / 插入新 block |
| Import/Export DOCX | Word 互通（需要评估是否用 Pro 或自建） |

---

## 9. 数据库变更

### 新增表: documents

```sql
create table documents (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id),
  type text not null check (type in ('worksheet','exam','rubric','lesson-plan','quiz')),
  title text not null,
  meta jsonb not null default '{}',
  blocks jsonb not null default '[]',
  layout_config jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  source_conversation_id text,
  pdf_url text,
  pdf_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table documents enable row level security;
create policy "teachers own documents"
  on documents for all
  using (teacher_id = auth.uid());

-- 索引
create index idx_documents_teacher on documents(teacher_id);
create index idx_documents_type on documents(teacher_id, type);
```

### 与现有表的关系

```
documents (新，source of truth)
  ├── → pdf_documents (现有，新增 FK document_id，记录 PDF 导出历史)
  ├── → content_library_items (现有，新增 FK document_id，内容库关联)
  └── 不关联 → worksheets / lesson_plans / rubrics (旧表，保留但不迁移数据)
```

**数据流向**:
- 新生成的文档 → 只存 documents 表
- PDF 导出时 → documents.id 写入 pdf_documents.document_id
- 保存到内容库 → documents.id 写入 content_library_items.document_id
- 旧数据（worksheets/lesson_plans/rubrics 表）不做迁移，旧功能入口仍读旧表
- 新文档引擎入口只读写 documents 表

**RLS policy** 与现有表保持一致风格（分离四条 policy）:

```sql
create policy "teachers select own documents" on documents for select using (teacher_id = auth.uid());
create policy "teachers insert own documents" on documents for insert with check (teacher_id = auth.uid());
create policy "teachers update own documents" on documents for update using (teacher_id = auth.uid());
create policy "teachers delete own documents" on documents for delete using (teacher_id = auth.uid());
```

---

## 10. 迁移策略

### Phase 1: 基础引擎（2-3 周）

- 实现 Block 模型 + Zod schema
- 实现 TipTap 自定义节点 + React NodeView
- 实现 CSS @page 布局 + Paged.js 分页
- 实现 Puppeteer PDF 导出（puppeteer-core + @sparticuz/chromium）
- 只做 Worksheet 文档类型作为验证

### Phase 2: AI 编辑（1-2 周）

- 实现 Bubble Menu + AI 编辑管道
- 实现 editor.commands 精确替换
- 实现 Decoration 变更高亮
- 实现 Undo/Redo 集成

### Phase 3: 流式生成（1 周）

- 实现 /api/doc/generate 统一生成 API
- 实现 useDocumentStream hook
- 接入现有 LLM 生成逻辑，输出转为 Block 格式

### Phase 4: 扩展文档类型（2 周）

- Exam（在 Worksheet 基础上增加计时、分页规则）
- Quiz（Worksheet 简化版，无答题区）
- Rubric（从现有 RubricTable 迁移）
- Lesson Plan（从现有 LessonPlanView 迁移）

### Phase 5: 收尾（1 周）

- Drag Handle 拖拽排序
- 数据库迁移脚本
- 内容库集成
- 旧组件兼容处理

---

## 11. 功能验证清单

| 需求 | 实现方式 | 验证标准 |
|------|---------|---------|
| 右侧渲染规范格式，不是 Markdown | TipTap + React NodeView + CSS @page | 看到 A4 纸张效果，题号/选项/答题区排版专业 |
| 教师看到逐步渲染过程 | NDJSON 逐 block 推送 + editor.commands.insertContentAt | 每收到一个 block 就出现在文档末尾 |
| 可以像 Word 一样选中内容 | TipTap 原生文本选择 | 按住左键拖选，蓝色高亮 |
| 选中后用自然语言修改 | Bubble Menu + /api/doc/edit | 选中后弹出输入框，输入指令，AI 返回修改结果 |
| 修改时右侧内容一直在，不消失 | 只替换选中 block，其余不动 | 编辑中 block 显示虚线边框，其他 block 纹丝不动 |
| 修改完看到变化 | editor.chain() 替换 + Decoration 标绿 | 修改后内容原地更新，改动部分短暂标绿 |
| PDF 导出格式规范 | puppeteer-core + @sparticuz/chromium（同一份 HTML/CSS） | 导出的 PDF 和预览 100% 一致 |
| 5 种文档类型都支持 | 通用 Block 模型 + 12 种 block 类型 | 同一个引擎渲染不同文档 |
| 轻量稳定 | TipTap 开源层 + Paged.js，~143KB 前端新增依赖 | 无 Pro 付费依赖，无重型框架 |
| 教师可以 undo | TipTap History 扩展 | Ctrl+Z 撤销 AI 修改 |
| 教师可以拖拽排序 | 自建 Drag Handle（ProseMirror + HTML5 Drag API） | 拖动题目/步骤调整顺序 |
| 数学公式支持 | @tiptap/extension-mathematics (KaTeX) | 题干和选项中的公式正确渲染 |
