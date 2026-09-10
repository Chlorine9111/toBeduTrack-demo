---
last_verified: 2026-03-06
owner: platform-harness
---

# Deskmate 业务领域地图

## 核心领域

### 教学内容生产域
- 范围：Lesson Plan、Exercises、Rubric、Worksheet。
- 主要模块：`lib/lesson-plan/*`、`lib/ai/*`、`lib/exercise/*`、`lib/rubric/*`、`app/api/lesson-plans/*`、`app/api/ai/*`、`app/api/exercises/*`、`app/api/rubrics/*`、`app/api/worksheets/*`。
- 边界：对外只暴露 API 协议，不暴露内部 prompt 与模型细节。

### 教学执行与评估域
- 范围：OCR 扫描、判卷、成绩反馈。
- 主要模块：`lib/grading/*`、`lib/ocr/*`、`app/api/grading/*`、`components/main/GradingPage.tsx`。
- 边界：判卷输入来自任务与提交记录，不直接依赖 UI 状态。

### 教师智能助手域
- 范围：Agent 对话、知识库上传检索、联网搜索、记忆。
- 主要模块：`lib/assistant/*`、`lib/teacher-memory/*`、`app/api/agent/*`、`app/api/chat/*`、`app/api/knowledge/*`、`app/api/search/*`、`app/api/teacher-memory/route.ts`。
- 边界：教师私有上下文优先；对外检索作为补充。

### 内容发布与传播域
- 范围：PDF 导出、公开教案、微信公众号编辑器。
- 主要模块：`lib/pdf/*`、`app/api/pdf/*`、`app/api/public/lesson-plans/*`、`lib/wechat-editor/*`、`app/api/wechat-editor/*`、`components/wechat-editor/*`、共享解析能力 `lib/wechat/document-parser.ts` 与 `lib/wechat/ai-vision.ts`。
- 边界：发布态内容与教师私有草稿隔离。

### 项目化学习与排课域
- 范围：PBL 两阶段生成、模拟退火排课。
- 主要模块：`lib/pbl/*`、`app/api/pbl/*`、`components/pbl/*`、`lib/scheduler/*`、`app/api/scheduler/generate/route.ts`。
- 边界：PBL 与排课独立运行，不直接耦合内容生成主链路。

## 横向公共能力
- 鉴权与上下文：`lib/api/teacher-context.ts`、`lib/teachers/ensure-teacher.ts`
- 请求/响应规范：`lib/api/request.ts`、`lib/api/response.ts`
- 统一类型：`types/*`

## 边界注意事项
- 当前存在 `lib -> components` 类型依赖（历史包袱），新增模块不要继续扩大该耦合。
- 新增跨域功能时，优先通过 API 协议连接，而不是直接跨域导入内部实现。
