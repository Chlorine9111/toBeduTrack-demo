---
last_verified: 2026-03-11
owner: product
---

# PDF 渲染引擎迁移：Puppeteer → Typst
状态: IN_PROGRESS

## 当前进展（2026-03-11）

- 已完成 Typst Node 编译器接入：`lib/typst/compiler.ts`
- 已落地 worksheet 相关组件与模板骨架：`lib/typst/components/*`、`lib/typst/templates/worksheet-*.typ`
- `POST /api/pdf/generate` 的 worksheet 分支已切到 Typst
- 已验证真实带图题 worksheet 能生成有效 PDF（主链为 Typst + admin storage 题图映射）
- `exam / rubric / lesson_plan` 已在 `POST /api/pdf/generate` 中切到 Typst
- 已做真实导出烟测，`lesson_plan / exam / rubric / worksheet` 四类文档均能返回有效 PDF
- 旧 Puppeteer/HTML 模板与 `renderPdfBuffer` 仍保留给其他非主链导出路径复用，Phase 6 尚未完成

## 目标

将 PDF 导出的渲染引擎从 Puppeteer（HTML → 浏览器打印 → PDF）迁移到 Typst（排版源码 → 编译 → PDF），解决以下核心问题：

1. **分页质量差** — 浏览器按固定高度"切刀砍"，题目经常被从中间截断，作答空间跨页
2. **空间分配不智能** — 作答区域靠 `min-height: 220px` 硬编码，无法根据页面剩余空间自适应
3. **渲染速度慢** — 每次生成需启动 Chromium，耗时 2-5 秒
4. **依赖沉重** — Puppeteer 带 ~300MB Chromium，部署体积大
5. **模板维护困难** — 700+ 行手拼 HTML 字符串，迭代排版设计成本高

## 设计概要

- 保持 API 请求参数、响应格式、存储路径和前端下载入口不变，只替换后端 PDF 排版引擎。
- Typst 模板只负责排版，业务 JSON 到 Typst 源码的转换继续由 TypeScript 的 `render-*.ts` 负责，避免把业务规则塞进模板语言。
- 先迁 worksheet，再迁 exam、rubric、lesson plan；主链验证通过后再清理 Puppeteer/HTML 历史实现，避免一次性切断全部导出路径。
- 真实目标不是“所有旧文件立刻删光”，而是把老师主工作流先切到 Typst，并确保分页、题图、公式和下载链路都稳定。

## 为什么选 Typst

| 维度 | Puppeteer（现状） | Typst |
|------|-------------------|-------|
| 分页 | CSS 近似，`break-inside: avoid` 经常被忽略 | 原生精确，逐元素排版，知道页面剩余空间 |
| 数学公式 | KaTeX CDN，需网络，运行时渲染 | 原生 `$...$`，编译时渲染，无外部依赖 |
| 作答空间 | `min-height` 硬编码 | `1fr` 自动平分剩余空间 |
| 速度 | 2-5 秒 | 10-50 毫秒 |
| 安装体积 | ~300MB (Chromium) | ~30MB 单二进制 / WASM 无需安装 |
| 模板表达力 | HTML 字符串拼接 | 函数式编程语言，模板即代码 |

## 不变的部分

以下层不受此次迁移影响：

- **AI 内容生成层** — LLM 继续生成结构化 JSON（题目、选项、答案等）
- **API 路由层** — `POST /api/pdf/generate` 入口和参数校验不变
- **存储层** — Supabase Storage `pdfs` bucket、`pdf_documents` 表不变
- **下载层** — `GET /api/pdf/download/[recordId]` 不变
- **前端调用方** — 前端只关心 `downloadUrl`，不关心后端用什么渲染

## 迁移范围

### 覆盖的文档类型（4 种）

| 文档类型 | 当前模板变体 | 说明 |
|----------|-------------|------|
| **worksheet** | academic / friendly | 练习题，最高频使用 |
| **exam** | classic / modern | 考试卷，MC + FRQ + 答案 + 评分标准 |
| **rubric** | table / cards | 独立的评分标准文档 |
| **lesson_plan** | standard / compact | 教案导出 |

每种文档类型保留现有的 2 个模板变体。

### 参考标准

排版风格对标 **College Board 官方 AP 考试格式**：
- MC 部分：题号 + 题干 + 四选项（短选项两列、长选项单列）
- FRQ 部分：题号 + 题干 + 分 part + 作答空间自动分配
- 答案页：MC 答案紧凑排列 + FRQ 分步解析
- 学生信息栏：姓名/班级/日期/分数
- 页眉页脚：课程名 + 页码

---

## 阶段分解

### Phase 1: 基础设施搭建
目标：Typst 编译能力可用，能从 TypeScript 调用生成最简 PDF。

- [x] 安装 Typst（CLI 或 WASM 包 `@myriaddreamin/typst-ts-node-compiler`）
- [x] 创建 `lib/typst/compiler.ts` — 封装 Typst 编译调用（输入 .typ 源码字符串，输出 PDF Buffer）
- [x] 创建 `lib/typst/base.typ` — 全局设计变量（字体、颜色、间距、页面预设）
- [x] 编写冒烟测试 — 用一段硬编码的 Typst 源码验证能生成有效 PDF 文件
- [ ] 验证数学公式渲染 — 确认 `$integral_0^1 x^2 dx$` 等 LaTeX 语法正确编译

### Phase 2: 组件库开发
目标：可复用的排版组件，覆盖所有文档类型需要的元素。

- [x] `lib/typst/components/header.typ` — 试卷头（经典居中 / 现代左对齐两种风格）
- [x] `lib/typst/components/student-info.typ` — 学生信息栏（姓名/班级/日期/分数）
- [x] `lib/typst/components/mc-question.typ` — MC 选择题（自动判断两列/单列排列）
- [x] `lib/typst/components/frq-question.typ` — FRQ 简答题（分 part、作答空间 `1fr` 自适应）
- [x] `lib/typst/components/answer-key.typ` — 答案页（MC 紧凑排列 + FRQ 分步解析）
- [x] `lib/typst/components/rubric-table.typ` — 评分标准表格（自动重复表头跨页）
- [x] `lib/typst/components/section-banner.typ` — 分节标题栏（如 "Section I: Multiple Choice"）
- [ ] 每个组件编写独立的视觉测试（生成 PDF 人工比对）

### Phase 3: Worksheet 模板迁移（首个文档类型）
目标：worksheet 类型完全由 Typst 渲染，功能与现有 Puppeteer 输出一致。

- [x] 创建 `lib/typst/templates/worksheet-academic.typ` — 学术风格模板
- [x] 创建 `lib/typst/templates/worksheet-friendly.typ` — 轻松风格模板
- [x] 创建 `lib/typst/render-worksheet.ts` — TypeScript 层，将 `WorksheetRenderInput` JSON 转为 Typst 源码
- [x] 在 `POST /api/pdf/generate` 中 worksheet 分支接入 Typst 渲染，替换 Puppeteer 调用
- [ ] 对比测试 — 用相同数据分别生成 Puppeteer 版和 Typst 版，确认内容完整、分页合理
- [ ] 验证边界场景：
  - 0 道题（空 worksheet）
  - 1 道超长 FRQ 题（超过一页）
  - 30+ 道 MC 题（多页分页）
  - 含复杂数学公式的题目
  - 含 Answer Key + Rubric 的完整 worksheet
  - A4 / Letter 两种纸张

### Phase 4: Exam 模板迁移
目标：exam 类型完全由 Typst 渲染。

- [x] 创建 `lib/typst/templates/exam-classic.typ` — 经典考试风格
- [x] 创建 `lib/typst/templates/exam-modern.typ` — 现代考试风格
- [x] 创建 `lib/typst/render-exam.ts` — JSON → Typst 源码
- [x] 在 API route 中 exam 分支接入 Typst
- [x] 验证 MC Section + FRQ Section + Answer Key + Rubric 四部分的分页正确性
- [ ] 对比测试

### Phase 5: Rubric 和 Lesson Plan 模板迁移
目标：剩余两个文档类型迁移完成。

- [x] 创建 `lib/typst/templates/rubric-table.typ` + `rubric-cards.typ`
- [x] 创建 `lib/typst/render-rubric.ts`
- [x] 创建 `lib/typst/templates/lesson-plan-standard.typ` + `lesson-plan-compact.typ`
- [x] 创建 `lib/typst/render-lesson-plan.ts`
- [x] 在 API route 中接入
- [x] 验证表格跨页表头重复、教案多 section 分页

### Phase 6: 清理与收尾
目标：移除 Puppeteer 依赖，完成迁移。

- [x] 确认所有 4 种文档类型均通过 Typst 生成
- [ ] 移除 `lib/pdf/puppeteer-manager.ts`
- [ ] 移除 `lib/pdf/templates/presets/*.html`（8 个 HTML 模板文件）
- [ ] 移除 `lib/pdf/styles/*.css`（7 个 CSS 文件）
- [ ] 从 `package.json` 移除 `puppeteer` 依赖
- [ ] 更新 `lib/pdf/pdf-service.ts`，移除 `renderPdfBuffer` 等 Puppeteer 相关函数
- [ ] 保留 `pdf-storage.ts`、`pdf-service.ts` 中的存储/下载/工具函数
- [ ] 更新文档：`docs/product.md`、`docs/architecture.md`、`docs/stack.md`
- [ ] 运行完整 E2E 测试，确认无回归

## 决策日志

| 日期 | 决策 | 理由 |
|------|------|------|
| 2026-03-11 | 先把 worksheet / exam / rubric / lesson plan 四条主链切到 Typst，再清理 Puppeteer 历史文件 | 先保主工作流稳定，避免“一边迁一边删”导致导出能力断档 |
| 2026-03-11 | 保留 TypeScript `render-*.ts` 作为业务 JSON 到 Typst 的转换层 | 避免把业务逻辑塞进 Typst 模板，后续更容易维护与测试 |
| 2026-03-12 | Phase 6 只把“老师当前主工作流不再依赖 Puppeteer”作为短期目标，不要求一次性删除全部旧资产 | 当前收益最大的是主链收口，不是先追求仓库绝对整洁 |

---

## 文件变动概览

### 新增文件

```
lib/typst/
├── compiler.ts                    # Typst 编译器封装
├── base.typ                       # 全局设计变量
├── components/
│   ├── header.typ                 # 试卷头
│   ├── student-info.typ           # 学生信息栏
│   ├── mc-question.typ            # MC 题
│   ├── frq-question.typ           # FRQ 题
│   ├── answer-key.typ             # 答案页
│   ├── rubric-table.typ           # 评分标准表格
│   └── section-banner.typ         # 分节标题
├── templates/
│   ├── worksheet-academic.typ     # 练习题 - 学术风格
│   ├── worksheet-friendly.typ     # 练习题 - 轻松风格
│   ├── exam-classic.typ           # 考试 - 经典风格
│   ├── exam-modern.typ            # 考试 - 现代风格
│   ├── rubric-table.typ           # 评分标准 - 表格
│   ├── rubric-cards.typ           # 评分标准 - 卡片
│   ├── lesson-plan-standard.typ   # 教案 - 标准
│   └── lesson-plan-compact.typ    # 教案 - 紧凑
├── render-worksheet.ts            # JSON → Typst（worksheet）
├── render-exam.ts                 # JSON → Typst（exam）
├── render-rubric.ts               # JSON → Typst（rubric）
└── render-lesson-plan.ts          # JSON → Typst（lesson plan）
```

### 修改文件

```
app/api/pdf/generate/route.ts     # 替换 Puppeteer 调用为 Typst 调用
lib/pdf/pdf-service.ts             # 移除 renderPdfBuffer，保留存储工具函数
package.json                       # 添加 Typst WASM 包，移除 puppeteer
```

### 删除文件

```
lib/pdf/puppeteer-manager.ts                       # 浏览器池管理
lib/pdf/generator.ts                               # 旧 stub
lib/pdf/templates/presets/template-*.html (×8)      # HTML 模板
lib/pdf/styles/*.css (×7)                           # CSS 样式
lib/pdf/templates/preset-renderer.ts                # HTML 模板渲染器
lib/pdf/templates/exam-template.ts                  # HTML 拼接（迁移到 render-exam.ts）
lib/pdf/templates/worksheet-template.ts             # HTML 拼接（迁移到 render-worksheet.ts）
lib/pdf/templates/rubric-template.ts                # HTML 拼接（迁移到 render-rubric.ts）
lib/pdf/templates/lesson-plan-template.ts           # HTML 拼接（迁移到 render-lesson-plan.ts）
lib/pdf/renderers/exercise.ts                       # HTML 渲染器（职责并入 Typst 组件）
lib/pdf/renderers/rubric.ts                         # HTML 渲染器
lib/pdf/renderers/lesson-plan.ts                    # HTML 渲染器
lib/pdf/renderers/shared.ts                         # HTML 渲染工具
lib/pdf/templates/components/math-renderer.ts       # KaTeX 渲染（Typst 原生替代）
lib/pdf/templates/components/answer-key.ts          # HTML 答案组件
lib/pdf/templates/components/question-frq.ts        # HTML FRQ 组件
lib/pdf/templates/components/question-mc.ts         # HTML MC 组件
lib/pdf/templates/components/rubric-table.ts        # HTML Rubric 组件
lib/pdf/templates/components/page-layout.ts         # HTML 页面布局
```

---

## 设计约束

### 模板与内容分离
- Typst 模板只负责排版，不包含任何业务逻辑
- TypeScript 的 `render-*.ts` 负责将业务 JSON 转为 Typst 源码字符串
- AI 生成的内容格式（JSON schema）不做任何改动

### 排版规则
- 每道完整的题目（题干 + 选项/作答区）不得跨页截断
- 单道题如果超过一整页，允许跨页但从题干开始新页
- FRQ 作答空间使用 `1fr` 自动分配，同一页内多道 FRQ 均分剩余空间
- MC 选项：文字长度 < 36 字符用两列，否则单列
- 答案页、评分标准单独起新页
- 跨页表格自动重复表头

### 向后兼容
- API 请求参数和响应格式完全不变
- 前端无需任何改动
- 已生成的 PDF 不受影响（存在 Supabase Storage 中）
- `templateVariant` 参数继续支持现有选项

---

## 已知风险和依赖

| 风险 | 影响 | 缓解方案 |
|------|------|---------|
| Typst WASM 包可能不稳定 | 编译失败导致 PDF 无法生成 | 优先测试 CLI 方式；WASM 不行就回退到 CLI |
| 中文字体支持 | 中文标题/内容可能乱码 | Typst 支持系统字体，macOS 有宋体；部署时需配置字体 |
| 部署环境差异 | Vercel/Docker 中可能缺字体或 CLI | WASM 方式无需系统依赖；字体打包进项目 |
| 排版效果与现有 HTML 版本不同 | 老师已习惯现有样式 | 逐步迁移，Phase 3 先做 worksheet 收集反馈 |
| KaTeX → Typst 数学语法差异 | 部分 LaTeX 命令在 Typst 中写法不同 | 建立转换映射表，处理常见差异 |

## 完成标准

- [ ] 4 种文档类型 × 2 种模板变体 = 8 种 PDF 模板全部通过 Typst 渲染
- [ ] 每种模板用真实数据生成 PDF，人工确认排版质量不低于现有 Puppeteer 版本
- [ ] 数学公式在所有模板中正确渲染
- [ ] 分页行为正确：题目不跨页截断、作答空间自适应
- [ ] API 请求参数和响应格式无变化
- [ ] `puppeteer` 从 `package.json` 移除
- [ ] 生成速度 < 500ms（对比现有 2-5 秒）
- [ ] 所有现有前端调用方无需改动
