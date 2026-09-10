# AI 判卷 + OCR 增强（Gemini 主引擎）

## 功能概览

在 `feat/grading-ocr-gemini` 分支新增完整判卷主链路：

1. 创建判卷任务（session）
2. 上传题目卷，自动推断 provisional answer key
3. 如有需要，教师手动微调答案键 JSON
4. 上传学生答卷（图片/PDF）
5. OCR 提取作答内容（Gemini → 百度 OCR → Mathpix）
6. 一键智能判卷并生成题目级反馈
7. 汇总班级统计（均分、分布、薄弱知识点）

## 数据库迁移

- `supabase/migrations/20260303120000_grading_system.sql`

新增表：
- `grading_sessions`
- `grading_submissions`
- `grading_answers`

包含：
- 索引
- RLS 策略
- `updated_at` 触发器

## API 路由

### 任务
- `GET /api/grading/sessions`
- `POST /api/grading/sessions`
- `GET /api/grading/sessions/:sessionId`
- `PATCH /api/grading/sessions/:sessionId`
- `DELETE /api/grading/sessions/:sessionId`

### 答案键
- `POST /api/grading/sessions/:sessionId/answer-key`
- `POST /api/grading/sessions/:sessionId/answer-key/infer`

### 答卷
- `GET /api/grading/sessions/:sessionId/submissions`
- `POST /api/grading/sessions/:sessionId/submissions`
- `GET /api/grading/sessions/:sessionId/submissions/:submissionId`
- `DELETE /api/grading/sessions/:sessionId/submissions/:submissionId`
- `POST /api/grading/sessions/:sessionId/submissions/:submissionId/ocr`
- `POST /api/grading/sessions/:sessionId/submissions/:submissionId/grade`
- `POST /api/grading/sessions/:sessionId/submissions/:submissionId/auto-grade`

### 人工改分
- `POST /api/grading/sessions/:sessionId/answers/override`

## 前端入口

- 页面：`/main/grading`
- Sidebar 新增入口：`AI 判卷`

## OCR 引擎优先级

`lib/ocr/ocr-router.ts`

1. Gemini（Google 官方 API 优先；无 Google key 时才兼容 OpenRouter）
2. 百度 OCR
3. Mathpix

## 关键环境变量

### Gemini
- `GOOGLE_GENERATIVE_AI_API_KEY` 或 `GOOGLE_AI_API_KEY` 或 `GEMINI_API_KEY`
- `GEMINI_SCORING_MODEL`（可选，默认 `gemini-3.1-pro-preview`）
- `GEMINI_GRADING_EXTRACT_MODEL`（可选，控制题目卷 -> provisional answer key；默认 `gemini-3-flash-preview`）
- `GRADING_OCR_GEMINI_MODEL`（可选，未配置时回退到 `GEMINI_SCORING_MODEL`）
- `OPENROUTER_API_KEY`（可选，仅兼容降级）
- `OPENROUTER_OCR_MODEL`（可选，再次兜底）

### 百度 OCR（降级）
- `BAIDU_OCR_API_KEY`
- `BAIDU_OCR_SECRET_KEY`

### Mathpix（兜底）
- `MATHPIX_APP_ID`
- `MATHPIX_APP_KEY`

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 说明

- 2026-03-12 已完成真实架构验收：
  - `npm run check:all` 通过（当前仅剩历史 warning，不再有 lint/typecheck error）
  - `npm run build` 通过
  - L1 UX `scripts/ux/verify-grading-smart-ocr.mjs` 通过，产物目录：`document/ux-verification/20260312_224907_grading-smart-ocr-arch-rerun4/`
  - 关键结果：`analysis.totalQuestions = 2`、`infer 结果可见耗时 = 16429ms`、`auto-grade 结果可见耗时 = 17862ms`
- 2026-03-13 已完成判卷第二阶段收口：
  - `node --import tsx tests/followup/grading-answer-key-inference.spec.ts` 通过
  - `node --import tsx tests/followup/grading-quality-gates.spec.ts` 通过
  - L1 UX `scripts/ux/verify-grading-smart-ocr.mjs` 再次通过，产物目录：`document/ux-verification/20260313_100633_grading-smart-ocr-rerun3/`
  - 关键结果：`POST /answer-key/infer = 161ms`、`infer 结果可见耗时 = 11102ms`、`POST /auto-grade = 200ms`、`auto-grade 结果可见耗时 = 14068ms`
- 题目卷推断当前复用 `lib/pdf-scan/pipeline.ts` 先抽题，再用 Gemini 生成 provisional answer key；低置信或缺省答案会自动打 `reviewRecommended`。
- 题目卷 OCR 若出现 `# / ##` Markdown 标题（例如 `## 1. Multiple Choice`），必须先在 `lib/pdf-scan/question-parser.ts` 里归一化为普通题号，并剥离 `Multiple Choice / Free Response` 这类分区标题；否则会把一题的题干、选项和补充说明拆成多题，直接拖累判卷质量与耗时。
- 答案键推断会补齐题目元数据：`responseMode / subjectHint / languageHint / sourceQuestionType / knowledgePoints`，后续 OCR 与 grader prompt 会继续复用这些字段。
- OCR 当前默认不是固定中文模式；`lib/grading/ocr.ts` 会结合 `session.title + answerKey` 自动推断识别语言，并把题目上下文一并传给 Gemini OCR。
- 评分 prompt 现在按 `responseMode` 分层：`math` 检查公式和等价表达，`text` 检查论点与术语，`diagram` 保守给分并建议复核，`mixed` 同时检查文字与公式/图示一致性。
- 最终 AI 判分当前也必须走统一 `model-router + ai/gateway`，不再允许在 `lib/grading/grader.ts` 里直连 `callGeminiJson` 做评分。
- 判卷主路径已改为“题目卷 -> provisional answer key -> auto-grade”；手工 JSON 编辑保留为复核兜底，而不是唯一入口。
- Gemini 结构化返回在 OpenRouter 下允许出现顶层数组与稀疏 rubric 字段，网关与 normalize 层已做兼容，不要再假定模型一定严格回 `{ answerKey: [...] }`。
- `answer-key/infer` 与 `auto-grade` 当前都会带 `qualityGate` 结果：题量不一致、占位答案未消除、OCR 缺题时，会优先返回 `partial_result / manual_review_required` 提示，而不是继续把坏答案键送进自动判卷。
- 自动判卷前当前会再次校验 `session.answerKey`；如果答案键仍不完整，会直接返回冲突并要求老师先复核答案键，不再依赖“多重试几次模型”硬顶过去。
- 判卷异步 job 当前已拆成 `grading_answer_key_infer` 与 `grading_auto_grade` 两个 workflow，并带老师维度 admission；同一老师短时间重复点“智能生成答案键/一键智能判卷”时，可能收到 `429 RATE_LIMITED`，这属于保护系统与成本的正式行为。
- `scripts/ux/verify-grading-smart-ocr.mjs` 当前不只验证“有结果”，还会交叉验证 `analysis.totalQuestions`、`analysis.reviewRecommendedCount`、`analysis.qualityGate.status` 与前端指标卡文案是否一致。
