# Deskmate / toBeduTrack

Deskmate 是一个面向教师的 AI 教学工作台。它以自然语言 Agent 为入口，把教学资料管理、内容生成、题库组卷、OCR 判卷和文档导出整合在同一个工作空间中。

当前分支是用于面试与代码评审的 Demo 版本：保留教师教学主线、核心架构和主要交互，但不创建真实账户，也不包含合作方负责的升学顾问、院校匹配、招生工作台、飞书 Bitable 与跨平台消息集成。

## 当前可展示内容

- **Landing Page**（`/`）：项目介绍和进入 Demo 的公开首页。
- **AI 教学 Agent**（`/main/agent`）：通过对话组织教案、练习题、Rubric、Worksheet、答案解析和 PBL 方案，并在右侧 Canvas 展示结构化产物。
- **教师内容库**（`/main/content-assets`）：上传和管理 PDF、Word 等教学资料，支持解析、检索与引用。
- **题库与自动组卷**（`/main/question-bank`、`/main/exam-agent`）：管理题目、按课程与知识点检索，并组织试卷。
- **AI 判卷与 OCR**（`/main/grading`）：识别学生答卷、推断答案键、自动评分，并保留教师人工修正入口。
- **PBL 与课程排期**（`/main/pbl`、`/main/scheduler`）：生成项目式学习方案和课程计划。
- **公众号内容编辑器**（`/main/wechat-editor`）：以画布方式编辑教学文章，提供 AI 文案、排版、模板和复制导出框架。

依赖外部模型、OCR、Supabase 数据或商业编辑器能力的功能，需要对应本地服务或环境变量才会完整运行。面试 Demo 的重点是展示产品结构、代码组织、状态流转与核心业务逻辑。

## Demo 登录

`/auth/login` 与 `/auth/register` 使用同一个无状态 Demo 入口：

- 邮箱和密码均为可选，可留空直接进入；
- 输入值只存在于当前 React 组件内；
- 不校验、不发送、不写入数据库或浏览器存储；
- 不提供 Google OAuth、邮箱验证或密码重置；
- 页面明确提示 `Demo won't record your email and password`。

本地开发通过 `.env.local` 中的 `AUTH_BYPASS=true` 和 `NEXT_PUBLIC_AUTH_BYPASS=true` 跳过真实认证。该绕过在生产环境默认禁用。

## 技术架构

- Next.js 15、React 19、TypeScript
- Supabase Postgres、Storage 与 RLS；Demo UI 不使用 Supabase Auth 登录
- Vercel AI SDK 与 provider-agnostic model router
- Claude、Gemini、Qwen、OpenRouter 等模型适配层
- Tiptap、Typst、Puppeteer、Mathpix/Mistral OCR
- Playwright、ESLint

## 本地运行

```bash
pnpm install
pnpm dev
```

默认运行地址是 `http://127.0.0.1:3001`：

- Landing Page：`/`
- Demo 登录：`/auth/login`
- 教师 Agent 工作台：`/main/agent`

复制 `.env.example` 为 `.env.local`，按实际需要配置本地 Supabase 和正在使用的 AI/OCR 服务。不要把 `.env.local`、生产密钥或个人数据提交到展示仓库。未配置商业 Tiptap Pro 服务时，项目使用本地占位适配层保留扩展与命令边界，详见 `docs/interview-demo-mode.md`。

## 数据与工程约定

- 教师私有数据按 `teacher_id` 隔离。
- API Route 负责鉴权、校验和编排，领域逻辑位于 `lib/*`。
- AI 调用统一经 `lib/ai/model-router.ts` 与 Gateway 层路由。
- Agent 生成物采用“左侧对话摘要 + 右侧 Canvas 完整内容”的交互方式。

## Demo 范围说明

本分支有意移除了不属于当前展示范围的合作方功能、相关数据库迁移、测试、脚本和内部设计文档。Tiptap Pro AI、商业 DOCX 导出等能力保留接口框架但不要求实际连通。完整取舍记录见 `docs/interview-demo-mode.md`。
