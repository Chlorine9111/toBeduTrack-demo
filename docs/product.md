---
last_verified: 2026-09-09
owner: platform-harness
---

# Deskmate 产品上下文

## 一句话定义
Deskmate 是一个以教师为中心的 AI 教学工作台，提供课程内容生成、资源沉淀、教学执行与发布导出能力。

## 目标用户
- 主要用户：教师（API 与数据模型普遍以 `teacher_id` 作为权限边界）。
- 次要用户：公开访问者（可通过公开链接查看已发布教案，无需登录）。
- 运营/教研角色：[待确认]（代码中未见独立角色权限模型）。

## 核心功能模块

### 1) 自主 Agent 工作台
- **做什么**：围绕教师自然语言需求执行资料检索、工具调用，以及 worksheet / rubric / lesson plan / exam / PBL 等文档生成。
- **当前 Agent 文档工具**：除 worksheet / rubric / lesson plan / exam / PBL 外，`/main/agent` 还支持基于当前会话已有文档做 `难度调节（adapt_difficulty）`、为题类文档生成独立 `答案与解析（generate_answer_key）`，以及快速生成 `Exit Ticket`。
- **用户故事**：教师直接进入 `/main/agent`，输入任务或上传资料素材，由 Agent 在同一会话里完成问答、总结和文档生成。
- **核心交互**：左侧为对话流；资料问答、总结、翻译等结果留在左侧。文档型生成物只在消息流里留下摘要和引用块，右侧 Canvas 承载完整正文，并以顶部标签页管理同轮多个产物。
- **关键业务规则**：主链不再依赖独立 `/api/agent/preflight`；正式资料引用统一走 `contentAssetIds`。拆题 / 扫描 PDF 已迁出当前 Agent 页面，不再作为 `/main/agent` 的产品能力。
- **对应代码位置**：`components/main/AgentWorkspacePage.tsx`、`app/api/agent/chat/route.ts`、`components/main/agent/*`、`lib/agent/*`。

### 2) Lesson Plan 生成与发布
- **做什么**：生成、编辑、归档、恢复、发布与公开访问教案。
- **用户故事**：教师生成教案后发布，得到公开链接用于分享。
- **关键业务规则**：归档教案不能直接发布；公开访问仅针对已发布内容。
- **对应代码位置**：`app/api/lesson-plans/**`、`app/api/public/lesson-plans/[slug]/route.ts`、`app/lp/[slug]/page.tsx`、`lib/lesson-plan/*`。

### 3) 习题生成、验证与题库管理
- **做什么**：按课程上下文生成习题，做验证，保存到教师私有题库并支持改写。
- **用户故事**：教师批量出题并保存，后续复用或微调。
- **关键业务规则**：题目保存在教师维度；题型与难度受 schema 限制。
- **对应代码位置**：`app/api/ai/exercises/*`、`app/api/exercises/*`、`lib/ai/exercise-generator.ts`、`lib/validation/api.ts`。

### 4) Rubric 生成与维护
- **做什么**：生成 Rubric、编辑维度、维护草稿/发布状态。
- **用户故事**：教师先生成评分标准，再用于作业/判卷。
- **关键业务规则**：Rubric 与教师及课程绑定，维度/等级结构受约束。
- **对应代码位置**：`app/api/ai/rubric/route.ts`、`app/api/rubrics/*`、`lib/ai/rubric-generator.ts`。

### 5) Worksheet 与 PDF 导出
- **做什么**：将题目组织为试卷并导出 PDF（含模板选项）。
- **用户故事**：教师从题库组卷并导出打印版。
- **关键业务规则**：Worksheet 与 exercises 关联；PDF 生成请求受严格参数校验。
- **对应代码位置**：`app/api/worksheets/*`、`app/api/pdf/*`、`lib/pdf/*`、`lib/validation/api.ts`。

### 6) AI 判卷 + OCR
- **做什么**：创建判卷任务、上传题目卷自动推断答案键、上传答卷、OCR 提取答案、AI 评分、人工改分。
- **用户故事**：教师不必先手填答案键 JSON；上传题目卷后即可批量处理学生答卷并查看统计。
- **关键业务规则**：判卷数据按教师隔离；提交状态从 `pending` 到 `completed/failed`。
- **对应代码位置**：`app/api/grading/**`、`components/main/GradingPage.tsx`、`lib/grading/*`、`lib/ocr/*`。

### 7) 教师知识资料与 Agent
- **做什么**：上传教学资料、建立 `content_asset_chunks` 检索索引，并在 Agent 会话里基于这些资料做问答与生成。
- **用户故事**：教师上传教材或讲义后，在同一会话里继续让 Agent 总结资料或生成 worksheet / rubric。
- **关键业务规则**：资料上传完成并进入 `ready` 后才会自动挂入当前会话；Agent 主链默认只保留当前会话上下文，不再依赖教师长期记忆参与主聊天路由。
- **对应代码位置**：`app/api/content-assets/*`、`app/api/agent/chat/route.ts`、`lib/content-assets/*`、`lib/assistant/*`。

### 8) PBL 方案生成
- **做什么**：先生成候选概览，再扩展为完整项目方案。
- **用户故事**：教师快速比较 A/B/C 方案后选定展开。
- **关键业务规则**：`overview -> expand` 两段式流程，`optionLabel` 必须命中候选。
- **对应代码位置**：`app/api/pbl/*`、`app/main/pbl/*`、`components/pbl/*`、`lib/pbl/*`。

### 9) 排课（模拟退火）
- **做什么**：根据约束自动生成课表并输出冲突指标。
- **用户故事**：教师/教务设置请假与锁定课程后自动排课。
- **关键业务规则**：硬约束冲突（教师/班级/教室/锁定）优先级高于软约束。
- **对应代码位置**：`app/api/scheduler/generate/route.ts`、`components/main/SchedulerPage.tsx`、`lib/scheduler/*`。

### 10) 微信内容生产（单编辑入口）
- **做什么**：公众号内容生成、排版、模板化编辑与导出复制。
- **用户故事**：教师将教学/运营内容快速生成可发布的微信图文。
- **关键业务规则**：编辑器入口固定为 `/main/wechat-editor`；Demo 根路径 `/` 展示公开 Landing Page；编辑器支持文档/图片输入，导出前执行 HTML 清洗与复制策略。
- **对应代码位置**：`app/page.tsx`、`app/main/(with-sidebar)/wechat-editor/page.tsx`、`app/api/wechat-editor/*`、`components/wechat-editor/*`、`lib/wechat-editor/*`、`lib/wechat/document-parser.ts`、`lib/wechat/ai-vision.ts`。
- **兼容性说明**：`app/api/wechat/generate/route.ts` 已冻结，仅返回弃用提示，不再承担生成逻辑。

### 11) 教师内容库（规划中）
- **做什么**：将 Agent 对话中生成的 Rubric、Lesson Plan、习题等内容自动沉淀为可分类、可搜索、可复用的教师私有内容库。
- **用户故事**：教师不再翻聊天记录找旧产物，而是在内容库按类型、课程、单元直接定位并复用已有内容。
- **关键业务规则**：
  - 生成成功后自动保存，不依赖教师手动点击“保存”；
  - 内容库主视图按 `内容类型 -> 课程 -> 单元` 浏览，而不是按聊天时间线浏览；
  - 详情页展示必须与原生成体验一致；
  - 首版 MVP 包含搜索与批量操作，其中批量操作至少支持批量删除、批量修正课程/单元归类；
  - 需求基线见 `docs/plans/active/content-library-mvp.md`。
- **对应代码位置**：`[待实现]`。

## 交互范式
- 用户与 AI 交互方式：混合式（对话驱动 + 表单参数确认 + 可视化编辑）。
- AI 响应呈现方式：
  - Agent 工作台：左侧对话保留生成引用，右侧 Canvas 承载完整正文与多标签切换，交互范式对齐 Claude Artifact。
  - 流式：`/api/chat/route`（SSE）、`/api/agent/chat`（NDJSON）、`/api/lesson-plans/generate`（流式事件）、`/api/wechat-editor/generate`（文本流）。
  - 一次性 JSON：多数 CRUD 与生成确认接口（如 `/api/pbl/generate` 的 overview/expand）。
- follow-up 系统：
  - 意图识别后计算缺失参数并生成可选项；
  - 前端以确认卡片/选项问题形式让用户补全；
  - 补全后再进入生成执行。
  - 相关代码：`app/api/chat/intent/route.ts`、`lib/followup/*`、`components/main/chatflow/*`。

## 领域术语表

| 术语 | 含义 | 备注 |
|------|------|------|
| AP CED | AP 课程标准（Course and Exam Description）上下文数据 | 见 `courses/units/topics` 与 `learning_objectives` 字段 |
| Lesson Plan | 教案文档，含 section 与 block 结构 | `lesson_plans` + `lesson_plan_sections` + `lesson_plan_blocks` |
| Worksheet | 练习卷实体，关联多个 exercises | `worksheets` + `worksheet_exercises` |
| Rubric | 评分标准，含维度与等级 | `rubrics` + `rubric_dimensions` + `rubric_levels` |
| Grading Session | 判卷任务容器 | `grading_sessions` |
| Submission | 单份学生答卷记录 | `grading_submissions` |
| Core/Aux/Tool | 模型路由层级 | `lib/ai/model-router.ts` |
| Prompt Assembler | 教案/Rubric等提示词组装模块 | `lib/ai/prompt-assembler.ts` |
| Teacher Memory | 教师长期记忆与独立记忆域（不再参与 Agent 主聊天链） | `app/api/teacher-memory/route.ts` + `lib/teacher-memory/*` |
| PBL Overview / Expand | PBL 两阶段生成流程 | `app/api/pbl/generate/route.ts` |
| Track(ap/general) | 教学轨道区分字段 | 意图识别与生成参数中使用 |

## 模块间关系
- 共享数据机制：绝大多数业务模块通过 Supabase 表按 `teacher_id` 共享与隔离数据。
- 习题生成与题库关系：`/api/ai/exercises/generate` 产出可通过 `/api/exercises/save` 持久化到 `exercises` 表。
- Lesson Plan 与习题联动：当前主要经 `/main/agent` 中的工具链与工作流串联完成，旧 `/main/project` 仅保留兼容跳转。
- Agent 与内容库关系：[规划中] Agent 生成成功的结构化产物自动入库，后续对话可显式引用内容库条目继续改写。
- Worksheet 与题库关系：`worksheet_exercises` 显式关联 `exercises`，并可再走 PDF 导出链路。
- 判卷与题库关系：[待确认]（当前判卷 answer key 可手工输入，也支持来源字段，但代码未强制绑定题库）。
- 教师知识资料与 Agent 关系：资料上传进入 `content_assets/content_asset_chunks` 检索链，Agent 对话优先基于当前会话里显式选中的资料和最近消息作答；Teacher Memory 已降为独立能力，不再参与 Agent 主聊天首响路径。
- 公开访问关系：公开教案只通过 slug 读取，不走教师鉴权接口。
