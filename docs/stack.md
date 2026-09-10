---
last_verified: 2026-09-09
owner: platform-harness
---

# Deskmate 技术栈

## 运行时框架
- Next.js 15（App Router）
- React 19
- TypeScript（`strict: true`）

## 后端与数据
- Supabase（Postgres + Storage + RLS）；面试 Demo 的登录界面不调用 Supabase Auth，真实认证实现已由无状态 Demo 入口替代
- 关键封装：`lib/supabase/server.ts`、`lib/supabase/admin.ts`

## AI 与模型调用
- Vercel AI SDK（`ai`）
- 稳定流式基线：`streamText`、`createUIMessageStream`、`createUIMessageStreamResponse`
- 项目统一前端消费层：`lib/api/ui-message-stream.ts`（解析 `text/event-stream` 的 `text/tool/data-*` chunk）
- `lib/ai/provider-registry.ts` 会把 `qwen3-plus`、`qwen-3.6-plus` 等旧别名规范化到 `qwen-plus`
- Anthropic Provider（`@ai-sdk/anthropic`，Claude 官方 API）
- Google Provider（`@ai-sdk/google`，Gemini 官方 API）
- OpenRouter Provider（`@openrouter/ai-sdk-provider`，仅保留非 Claude 的兼容链路）
- Anthropic SDK（用于原生 web search / vision 等 Anthropic 特化能力）
- OpenAI Compatible Provider（Qwen / Moonshot 兼容接入）
- Google Gemini Embeddings 2（默认 `gemini-embedding-2-preview`，统一承载题库/内容库/知识库/长期记忆语义索引；无可用 key 时才回退 OpenRouter embedding）
- Gemini 3 系列（专项任务默认走 `gemini-3.1-pro-preview` / `gemini-3.1-flash-lite-preview`，主要用于意图判断、taxonomy 分类、图像理解、判卷与 PDF 结构化；旧 `gemini-3-pro-preview` 由 provider registry 自动升到 `3.1`）
- 教师内容生产链（`assistant_*` / `lesson_*` / `pbl_*` / `worksheet_curate`）采用 task-routed specialist 模式
- 模型分配：`lib/ai/model-router.ts`（Core/Aux/Tool）
- 题目 taxonomy 分类模型：`question_taxonomy` 任务固定优先走 Gemini Flash 线（当前默认 `gemini-3.1-flash-lite-preview`，由 `provider-registry` 自动优先切到 Google 官方 API）；如果环境里残留不存在的 `gemini-3.1-flash-preview`，运行时会规范化到官方当前可用的 `gemini-3.1-flash-lite-preview`，不要把题目 taxonomy 任务回退到 Moonshot/Kimi。
- 自动组卷编排模型：`worksheet_curate` 任务现在跟随教师主工作台主模型，默认也走 `anthropic/claude-sonnet-4.6`；只有 `intent` / taxonomy / 图像理解 / 判卷 / OCR / embedding 这类专项链路仍保留 Gemini / OCR 专用模型。
- 业务层统一入口：`lib/ai/gateway.ts`（统一文本、流式、结构化输出的 provider 选型、requestId、错误映射、日志元数据）
- 结构化输出封装：`lib/ai/structured-output.ts`（同步 `generateStructuredObject` + 支持 partial callback 的 `streamStructuredObject`）
- Provider Registry：`lib/ai/provider-registry.ts`（Infra 层 provider 创建、默认温度、headers/baseURL、metadata 归一化）
- OpenRouter 裸请求统一入口：`lib/ai/openrouter-client.ts`（仅供 Gateway 或专用 adapter 复用）
- Embedding 基础设施入口：`lib/ai/embeddings.ts`（统一 Google 官方 embedding 主路径与 OpenRouter 兼容降级）
- 工具调用统一入口：`lib/ai/gateway.ts` 的 `generateToolInputWithGateway(...)`；旧 `tool-adapter.ts` / `vercel-sdk-adapter.ts` / `kimi-client.ts` 已退役
- 供应商特化例外：Anthropic 原生 web search / vision、Mathpix、Supermemory 可保留专用 adapter，但业务模块仍应走内部封装，不应直接依赖第三方 SDK 或 endpoint。

## 前端 UI 与编辑
- Tailwind CSS + Radix UI
- Tiptap（微信编辑器）
- `/main/agent` 右侧 Canvas 的结构化文档引擎当前采用 `DocumentModel + 纯 React block renderer` 的阅读态实现，优先服务 worksheet / exercises / rubric / lesson-plan 这类文档型产物；导出优先复用当前浏览器渲染结果，不再默认回退到纯 Markdown 视图。TipTap 仍保留给真正需要富文本编辑的场景（如微信编辑器，或未来单独设计的文档编辑态），不再承担当前 Canvas 的只读拖选主链。
- Lucide Icons

## 文档/导出/OCR
- Typst Node Compiler（`@myriaddreamin/typst-ts-node-compiler`，worksheet PDF 主渲染链）
- Puppeteer（exam / rubric / lesson_plan PDF 与页面截图相关能力）
- jsPDF、KaTeX、xlsx、mammoth、pdftoppm（系统依赖，用于 PDF 页渲染）
- OCR 相关模块：`lib/ocr/*`、`lib/pdf-scan/*`
- PDF/教学资料 OCR 当前支持 Mathpix + Mistral OCR 双轨；PDF 文档优先经 `lib/pdf-scan/ocr-router.ts` 做 provider 路由，而不是在业务 Route 中直接写死单一第三方。
- worksheet Typst 渲染入口：`lib/typst/render-worksheet.ts`；题干中的 `/api/pdf/scan-image?...` 图片会直接解析 storage path 并用 admin storage 下载，再映射为 Typst shadow asset。
- 题库组卷编辑器（`/main/question-bank/builder`）的 PDF 导出不再走 Typst，而是走 `buildWorksheetPdfHtml(...) -> /api/doc/export-pdf` 的 HTML 打印链；这个页面的导出需求以“尽量贴近当前分页画布所见即所得”为先。Typst 仍保留给后台结构化 worksheet/exam 产物与独立 PDF 生成链。
- 新增 OCR 环境变量：`MISTRAL_API_KEY`（可选）；未配置时知识库上传与 PDF 扫描会按路由器策略回退到 Mathpix；若两者都不可用则直接报错。

## 测试与工程工具
- ESLint 9
- Playwright
- tsx（脚本执行）

## 关键依赖用法约束
- 业务接口入参校验统一使用 Zod。
- 模型选择优先走 `getModelForTask(...)`，避免路由内散落模型字符串。
- 业务层优先调用 `lib/ai/gateway.ts` 或对应领域 adapter，不要直接 `fetch("https://openrouter.ai/api/v1/...")`、不要直接创建厂商 provider，也不要自行维护第三方 headers/baseURL。
- `lib/ai/provider-registry.ts`、`lib/ai/openrouter-client.ts` 属于 Infra 复用层；Route 与领域服务除获批例外外不应直接依赖它们。
- Supabase 客户端创建统一走 `lib/supabase/*`，避免重复配置。
- Demo 登录输入不得写入 Supabase、日志、浏览器存储或其他外部服务；本地访问依赖开发环境 `AUTH_BYPASS`，生产环境默认禁用绕过。
