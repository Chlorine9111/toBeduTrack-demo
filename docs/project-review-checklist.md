# new-start 项目全面检查清单

> 生成日期: 2026-03-17
> 目的: 按功能区域逐一检查，发现架构和体验问题
> 使用方式: 按优先级从高到低检查，每个条目标注 ✅/❌/⚠️

---

## 一、核心功能区域（影响用户体验最大）

### 1. AI Agent 工作空间

**前端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| AgentWorkspacePage 超大组件 | `components/main/AgentWorkspacePage.tsx` | 1337 | 需拆分：Artifact 渲染、工具栏、设置面板、消息列表应独立 |
| AgentWorkspaceActiveState | `components/main/agent/AgentWorkspaceActiveState.tsx` | 504 | 活跃状态管理，检查状态机是否完整 |
| ArtifactCanvas | `components/main/agent/ArtifactCanvas.tsx` | 566 | Tab 管理 + PDF 导出 + 保存，检查多 artifact 切换是否稳定 |
| ChatInput | `components/main/ChatInput.tsx` | 大 | 聊天输入，检查快捷标签、文件上传、发送状态 |
| Artifact 类型检测 | `components/main/agent/artifact-utils.ts` | - | 8 种类型的正则检测，检查是否有误判 |

**后端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| Agent 对话 API | `app/api/agent/chat/route.ts` | 690 | 需拆分。检查：上下文构建、Tool calling、流式响应、并发控制 |
| Agent preflight | `app/api/agent/preflight/route.ts` | - | 生成前参数确认，检查是否覆盖所有文档类型 |
| 意图识别 | `lib/chat/intent.ts` | - | 正则 + LLM 双重识别。检查：误识别率、追问逻辑 |

**前后端连接**

```
ChatInput → POST /api/agent/chat（流式）→ 意图识别 → 确认 → 调用生成 Hook → Artifact 渲染
```

检查重点：流式响应中断时的恢复、意图识别超时（INTENT_TIMEOUT_MS=9000）是否够用

---

### 2. 教案生成（Lesson Plan）

**前端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| LessonPlanView 超大 | `components/main/chatflow/LessonPlanView.tsx` | 1369 | 展示+编辑+AI重写+下载全在一个文件 |
| LessonPlanStudio 超大 | `components/lesson-plan/LessonPlanStudio.tsx` | 1107 | TipTap 集成+AI 调用+保存，需拆分 |
| LessonPlanBlockView | `components/main/chatflow/lesson-blocks/LessonPlanBlockView.tsx` | 934 | 教案块渲染，检查所有 block 类型是否覆盖 |
| BlockEditForm | `components/lesson-plan/blocks/BlockEditForm.tsx` | 727 | 块编辑表单，检查校验逻辑 |
| useLessonPlan Hook | `hooks/use-lesson-plan.ts` | 280+ | 流式消费，超时 300s，检查断流处理 |

**后端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| 生成主 API（最大路由） | `app/api/lesson-plans/generate/route.ts` | 730 | 需拆分。检查：材料处理、outline 生成、section 并发（硬编码 3）、超时 240s、数据库写入失败恢复 |
| AI 逻辑 | `lib/lesson-plan/ai.ts` | 700+ | outline + section 生成。检查：Prompt 质量、structured output schema、fallback |
| 块工厂 | `lib/lesson-plan/block-factory.ts` | 600+ | block 类型生成。检查：类型覆盖是否完整 |
| 块验证 | `lib/lesson-plan/block-validation.ts` | 300+ | 校验逻辑。检查：边界情况 |
| 意图路由 | `app/api/lesson-plans/intent/route.ts` | 50 | 轻量，应无问题 |
| 块重写 | `app/api/lesson-plans/[planId]/rewrite-block/route.ts` | - | AI 重写单个块。检查：是否有 Zod 验证 |

**已知性能数据**：outline ~5s, section ~19s（3 道题）, 整个教案 ~74s（6 节）

---

### 3. 习题生成（Exercises）

**前端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| ExerciseCard | `components/main/chatflow/ExerciseCard.tsx` | 460 | 单题展示。检查：MC/FRQ/Fill 各类型渲染是否正确 |
| useExercises Hook | `hooks/use-exercises.ts` | 140 | 流式消费。检查：逐题推送渲染、超时、abort |

**后端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| 生成 API | `app/api/ai/exercises/generate/route.ts` | - | 有 Zod 验证 ✅。检查：verify 重试逻辑、rate limit |
| 验证 API | `app/api/ai/exercises/verify/route.ts` | - | Gemini 校验习题质量。检查：验证规则是否合理 |
| 习题验证器 | `lib/ai/exercise-validator.ts` | 13K | 复杂验证逻辑。检查：误判率 |
| 保存 API | `app/api/exercises/save/route.ts` | - | 检查：去重、teacher_id 绑定 |
| 改写 API | `app/api/exercises/[id]/rewrite/route.ts` | - | AI 改写。检查：是否保留原题关联 |

---

### 4. Rubric 评分量表

**前端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| RubricTable | `components/main/chatflow/RubricTable.tsx` | 934 | 拖拽(@dnd-kit)+编辑+AI rewrite+PDF 导出。检查：维度增删、权重调整、拖拽稳定性 |
| ArtifactRubricView | `components/main/agent/ArtifactRubricView.tsx` | - | Markdown→表格解析。检查：单表/多表两种策略覆盖 |
| useRubric Hook | `hooks/use-rubric.ts` | 102+ | 流式 NDJSON。检查：onProgress 逐维度推送 |

**后端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| 生成 API | `app/api/ai/rubric/route.ts` | 395 | 有 Zod ✅，有 rate limit ✅。检查：AP/通用双轨逻辑、数据库保存 |
| 维度重写 | `app/api/rubrics/[rubricId]/rewrite-dimension/route.ts` | 166 | AI 重写单维度 |

---

### 5. 题库管理（Question Bank）

**前端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| QuestionBankPage 超大 | `components/main/question-bank/QuestionBankPage.tsx` | 948 | 列表+分类树+编辑+知识点。检查：大列表性能（有 @tanstack/react-virtual？） |
| QuestionList | `components/main/question-bank/QuestionList.tsx` | 924 | 题目列表渲染。检查：虚拟滚动、筛选性能 |

**后端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| 题库 CRUD | `app/api/question-bank/route.ts` | <150 | 检查：分页、搜索性能 |
| 批量操作 | `app/api/question-bank/bulk/route.ts` | - | ⚠️ 无 Zod 验证 |
| 材料批量 | `app/api/question-bank/materials/bulk/route.ts` | - | ⚠️ 无 Zod 验证 |
| 分类 API | `app/api/exercises/[id]/taxonomy/classify/route.ts` | - | Gemini Flash Lite 分类 |

---

### 6. 内容库（Content Library）

**前端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| ContentLibraryPage **最大组件** | `components/main/ContentLibraryPage.tsx` | **2320** | 🔴 必须拆分。含：列表+详情+搜索+筛选+分类+删除+导入，15+ 个 useState |

建议拆分为：
- ContentLibraryList.tsx（搜索+列表+筛选）
- ContentLibraryDetailPanel.tsx（详情侧边栏）
- ContentLibraryActions.tsx（批量操作）
- useContentLibraryFilters.ts（筛选逻辑 Hook）

**后端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| 列表/详情 | `app/api/content-library/route.ts` | 180 | 有 Zod ✅。检查：分页查询性能 |
| 保存 artifact | `app/api/content-library/save-artifact/route.ts` | - | 从 Agent 对话保存。检查：来源追踪 |
| 批量操作 | `app/api/content-library/bulk/route.ts` | - | 批量删除/移动 |

---

### 7. 判卷系统（Grading）

**前端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| GradingPage | `components/main/GradingPage.tsx` | 937 | 会话+学生+批改+OCR+报告。检查：OCR 失败回退、批改进度展示 |

**后端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| 会话管理 | `app/api/grading/sessions/*/route.ts` | 多个 | 检查：CRUD 完整性 |
| OCR 识别 | `app/api/grading/sessions/[id]/submissions/[id]/ocr/route.ts` | - | Gemini Vision。检查：图片质量差时的处理 |
| 自动批改 | `app/api/grading/sessions/[id]/submissions/auto-grade/route.ts` | - | Gemini 评分。检查：评分准确性 |
| 答案推断 | `app/api/grading/sessions/[sessionId]/answer-key/infer/route.ts` | - | 从标准答案推断 |

---

### 8. 工作表/组卷（Worksheets）

**前端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| 当前走 Markdown 渲染 | ArtifactMarkdownView | 29 | 🔴 不够专业，需迁移到文档引擎 |

**后端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| CRUD | `app/api/worksheets/[worksheetId]/route.ts` | 275 | 检查：更新逻辑 |
| 自动组卷 | `app/api/worksheets/assemble/route.ts` | - | 语义搜索+LLM 优化排序。检查：命中率 |
| 题目管理 | `app/api/worksheets/[worksheetId]/exercises/route.ts` | - | 添加/删除/去重 |
| 排序 | `app/api/worksheets/[worksheetId]/exercises/reorder/route.ts` | - | 拖拽排序 |

---

### 9. PDF 处理

**前端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| usePdfScan Hook | `hooks/use-pdf-scan.ts` | 215+ | 上传+扫描+处理三步流程 |
| ScanStructuredResult | `components/main/scan/ScanStructuredResult.tsx` | 566 | 扫描结果展示 |

**后端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| PDF 生成（大路由） | `app/api/pdf/generate/route.ts` | 571 | Typst 模板渲染。⚠️ 无 maxDuration |
| Markdown 导出 | `app/api/pdf/export-markdown/route.ts` | 378 | Markdown→Typst→PDF |
| 扫描上传 | `app/api/pdf/upload-scan/route.ts` | - | ⚠️ 无 body schema，无文件大小限制 |
| 扫描处理 | `app/api/pdf/process-scan/route.ts` | - | Gemini Vision OCR |
| 图片扫描 | `app/api/pdf/scan-image/route.ts` | - | Gemini 3.1 Pro |

---

### 10. PBL 项目式学习

**前端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| ProjectPlanView | `components/pbl/ProjectPlanView.tsx` | 738 | 项目计划视图 |
| PBL 相关组件 | `components/pbl/*.tsx` | 13 个 | 多数为轻量包装 |

**后端**

| 检查项 | 文件 | 行数 | 要点 |
|--------|------|------|------|
| 生成 | `app/api/pbl/generate/route.ts` | - | Claude 生成完整项目。检查：⚠️ 无 Zod |
| 项目 CRUD | `app/api/pbl/projects/[id]/*.ts` | 多个 | patch 233行。⚠️ 部分无 schema |
| Assistant | `app/api/pbl/assistant/route.ts` | - | PBL 专用 AI 对话 |
| 课程数据 | `app/api/pbl/curriculum/route.ts` | - | ⚠️ 无 schema |

---

## 二、基础设施（影响全局稳定性）

### 11. 认证系统

| 检查项 | 文件 | 要点 |
|--------|------|------|
| Auth Bypass | `lib/auth/bypass.ts` | 开发模式 AUTH_BYPASS=true。确认生产环境已关闭 |
| E2E Bypass | 同上 | E2E_TEST=1 绕过认证。确认不会泄露到生产 |
| Middleware 路由保护 | `middleware.ts` + `lib/supabase/middleware.ts` | 受保护: /main, /onboarding。API 路由不受中间件保护（各自检查） |
| Onboarding 流程 | `app/onboarding/` | 新用户注册→基本信息→学科选择→开始使用 |
| 密钥管理 | `.env.local` | 确认在 .gitignore 中；敏感 key 不暴露到 NEXT_PUBLIC_ |

### 12. AI 模型路由

| 检查项 | 文件 | 要点 |
|--------|------|------|
| 模型路由 | `lib/ai/model-router.ts` (19K) | 38 种任务→模型映射。检查：环境变量覆盖链是否正确 |
| 提供商注册 | `lib/ai/provider-registry.ts` (10K) | Anthropic/Google/OpenRouter/Moonshot 四家。检查：API key 降级逻辑 |
| AI 网关 | `lib/ai/gateway.ts` (27K) | 统一调用入口。检查：错误处理、重试 |
| Prompt 组装 | `lib/ai/prompt-assembler.ts` (32K) | 最复杂。检查：token 限制、上下文截断 |
| 质量评审 | `lib/ai/quality-review.ts` (46K) | **最大文件**。检查：评审规则是否过于严格导致重试过多 |

### 13. 数据库与 Supabase

| 检查项 | 文件 | 要点 |
|--------|------|------|
| RLS 策略 | Supabase Dashboard | ⚠️ 代码库中未找到 RLS 定义，需在 Dashboard 确认所有用户表的 RLS |
| 迁移文件 | `supabase/migrations/` (44 个) | 最新: 20260315160000_pbl_v2_redesign。检查：迁移是否都已应用 |
| Admin 客户端使用 | `lib/supabase/admin.ts` | 仅在 /curriculum/options(E2E) 和 /developer/verify 使用。确认无滥用 |

### 14. Rate Limiting

| 检查项 | 文件 | 要点 |
|--------|------|------|
| 实现 | `lib/api/rate-limit.ts` | **内存存储**，非持久化。服务器重启后重置 |
| 覆盖 | exercises/generate, rubric, lesson-plans/generate | 只有 3 个 AI API 有 rate limit，其他无 |
| 并发控制 | `lib/api/concurrency-limit.ts` | 仅 /agent/chat 使用 |

---

## 三、横切面问题（多处存在）

### 15. 超大组件（必须拆分）

| 组件 | 行数 | 优先级 |
|------|------|--------|
| ContentLibraryPage.tsx | **2320** | 🔴 P0 |
| LessonPlanView.tsx | 1369 | 🔴 P0 |
| AgentWorkspacePage.tsx | 1337 | 🔴 P0 |
| DocumentEngine.tsx | 1115 | 🔴 P0 |
| LessonPlanStudio.tsx | 1107 | 🔴 P0 |
| QuestionBankPage.tsx | 948 | 🟠 P1 |
| GradingPage.tsx | 937 | 🟠 P1 |
| RubricTable.tsx | 934 | 🟠 P1 |
| QuestionList.tsx | 924 | 🟠 P1 |
| LessonPlanPublicView.tsx | 918 | 🟠 P1 |
| WeChatEditorPage.tsx | 824 | 🟡 P2 |
| BlockEditForm.tsx | 727 | 🟡 P2 |

### 16. 缺少 Zod 输入验证的 API（14 个）

| API | 风险 |
|-----|------|
| `/api/chat/route.ts` | 接收用户消息，无验证 |
| `/api/knowledge/upload` | 文件上传，无大小限制 |
| `/api/pdf/upload-scan` | 文件上传，无大小限制 |
| `/api/pbl/curriculum` | 查询参数无验证 |
| `/api/pbl/materials` | 无验证 |
| `/api/pbl/logs` | 无验证 |
| `/api/pbl/projects/[id]/select` | 无验证 |
| `/api/question-bank/bulk` | 批量操作，无验证 |
| `/api/question-bank/materials` | 无验证 |
| `/api/doc/edit` | AI 编辑，无验证 |
| `/api/doc/generate` | 文档生成，无验证 |
| `/api/wechat-editor/templates/[id]` | 无验证 |
| `/api/wechat-editor/preview` | 无验证 |
| `/api/curriculum/options` | 手动解析 |

### 17. 缺少 maxDuration 的 API 路由

113 个 API 缺少 `export const maxDuration`。高风险的：

| API | 预估耗时 | 建议 maxDuration |
|-----|---------|-----------------|
| `/lesson-plans/generate` | 30-74s | 已有 240s ✅ |
| `/agent/chat` | 5-120s | 已有 120s ✅ |
| `/knowledge/upload` | 10-60s | 需设 120s |
| `/pdf/generate` | 5-30s | 需设 60s |
| `/ai/exercises/generate` | 10-30s | 需设 60s |
| `/ai/rubric` | 10-21s | 需设 60s |
| `/grading/*/auto-grade` | 5-30s | 需设 60s |
| `/pbl/generate` | 10-60s | 需设 120s |
| `/worksheets/assemble` | 5-20s | 需设 60s |

### 18. Console.log 残留（136 处）

主要集中在：
- `lesson-plans/generate` — 生成流程 debug
- `knowledge/upload` — 文件处理
- `pdf/generate` — 渲染过程
- `agent/chat` — 对话流程

建议迁移到结构化日志（pino/winston），或至少在生产环境条件输出。

### 19. 前端状态管理

**当前状态：无全局状态管理库**

- 所有数据通过 useState + props 传递
- 无缓存层（每次进入页面都重新 fetch）
- ContentLibraryPage 单组件 15+ 个 useState

建议（按优先级）：
1. 引入 SWR 或 React Query 做 API 缓存（避免重复请求）
2. 大组件改用 useReducer 合并状态
3. 评估是否需要 Zustand（跨组件共享状态场景不多，可能不需要）

### 20. 现有 TipTap 实例复用

项目已有微信编辑器的 TipTap 集成：
- `lib/wechat-editor/tiptap-extensions.ts`
- `components/wechat-editor/TiptapEditor.tsx`
- `components/wechat-editor/TiptapBubbleMenu.tsx`

新文档引擎也用 TipTap。建议检查：是否可以抽取共享配置层 `lib/tiptap-shared/`，避免两套维护。

---

## 四、辅助功能区域（影响较小但需覆盖）

### 21. 反馈系统

| 检查项 | 文件 | 要点 |
|--------|------|------|
| FeedbackPage | `components/main/FeedbackPage.tsx` (617) | 提交+附件+筛选 |
| DevFeedbackPage | `components/developer/DevFeedbackPage.tsx` (685) | 开发者回复管理 |
| 上传 API | `app/api/feedback/upload/route.ts` | 附件上传 |
| 回复 API | `app/api/feedback/[id]/reply/route.ts` | 服务端反馈管理员权限校验 |

### 22. 微信编辑器

| 检查项 | 文件 | 要点 |
|--------|------|------|
| WeChatEditorPage | `components/wechat-editor/WeChatEditorPage.tsx` (824) | TipTap+AI 布局+模板 |
| 生成 API | `app/api/wechat-editor/generate/route.ts` | 文章生成 |
| 布局 API | `app/api/wechat-editor/layout/route.ts` (353) | AI 布局 |

### 23. 课程规划（Scheduler）

| 检查项 | 文件 | 要点 |
|--------|------|------|
| SchedulerPage | `components/main/SchedulerPage.tsx` (427) | 课程计划 |
| 生成 API | `app/api/scheduler/generate/route.ts` | AI 生成计划 |

### 24. 知识库/RAG

| 检查项 | 文件 | 要点 |
|--------|------|------|
| 上传（大路由） | `app/api/knowledge/upload/route.ts` (698) | ⚠️ 无文件大小限制，无 Zod，无 maxDuration |
| 搜索 | `app/api/knowledge/search/route.ts` | 向量搜索 |
| Embedding | `lib/ai/google-embeddings.ts` | Google Embedding 2.0 |

### 25. 营销/落地页

| 检查项 | 文件 | 要点 |
|--------|------|------|
| ExamPanel | `components/landing/ExamPanel.tsx` (848) | 落地页考试演示 |
| RubricPanel | `components/landing/RubricPanel.tsx` (475) | 落地页 Rubric 演示 |
| WorksheetPanel | `components/landing/WorksheetPanel.tsx` (430) | 落地页工作表演示 |
| Pricing | `app/pricing/page.tsx` | 定价页 |

---

## 五、检查执行建议

### 按优先级排序的检查顺序

**第 1 轮：安全和稳定性（立即）**
1. [ ] 确认生产环境 AUTH_BYPASS=false
2. [ ] 检查 Supabase Dashboard 的 RLS 策略
3. [ ] 为 14 个 API 补充 Zod 验证
4. [ ] 为高风险 API 补充 maxDuration
5. [ ] 检查文件上传无大小限制的端点

**第 2 轮：核心体验（本周）**
6. [ ] 检查 Agent 工作空间全流程（输入→意图→生成→渲染→保存）
7. [ ] 检查教案生成全流程（含超时和断流）
8. [ ] 检查习题生成+验证+保存全流程
9. [ ] 检查判卷系统 OCR 和自动批改准确性
10. [ ] 检查题库搜索和大列表性能

**第 3 轮：代码质量（下周）**
11. [ ] 拆分 5 个超大组件（>1000 行）
12. [ ] 清理 136 处 console.log
13. [ ] 评估引入 SWR/React Query
14. [ ] 检查 TipTap 复用可能性

**第 4 轮：辅助功能（有空时）**
15. [ ] 检查反馈系统
16. [ ] 检查微信编辑器
17. [ ] 检查 PBL 系统
18. [ ] 检查知识库上传稳定性

---

## 六、项目数据概览

| 指标 | 数值 |
|------|------|
| 页面路由 | 30+ |
| API 路由 | 127 |
| React 组件 | 143 |
| 自定义 Hooks | 6 |
| Lib 文件 | 313 |
| AI 任务类型 | 38 |
| 数据库迁移 | 44 |
| 超大组件（>500 行） | 12 |
| 缺少 Zod 的 API | 14 |
| 缺少 maxDuration 的 API | 113 |
| Console.log 残留 | 136 |
