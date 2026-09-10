# Exam Agent — 一键出卷设计规格

## 概述

为 AP 教师提供端到端的自动出卷体验。老师配置学科、单元、题数、难度后一键启动，Agent 在后台自主完成出卷全流程（分析大纲 → 制定蓝图 → 生成题目 → 验证审查 → 组装试卷），全程可视化 Pipeline 进度和 Agent 决策日志。

**核心差异**：不是对话式 Copilot，而是自主 Agent。老师不需要参与中间过程，但可以随时查看 Agent 在做什么。

## 用户故事

AP Statistics 老师想出一套 Unit 4 模考卷。她打开出卷页面，选择学科 "AP Statistics"、单元 "Unit 4"、25 题、MC+FR、中等难度，点击"开始出卷"。Agent 在后台运行，她可以切到别的页面做其他事，回来后看到 Pipeline 时间线显示已完成 17/25 题，正在验证第 18 题（发现答案歧义，触发修复）。5 分钟后全部完成，她预览试卷，对第 3 题不满意，点"去编辑器微调"跳转 Builder 调整，最后导出 PDF 打印。

## 页面位置

- 路由：`/main/exam-agent`
- 侧边栏新增导航项（IconSidebar），使用 `FileText` 或 `ClipboardList` 图标
- 位于题库导航之后

## 页面架构

### 布局：Master-Detail 双栏

```
┌──────────┬──────────────────────────────────────┐
│  Icon    │  Task List  │     Main Panel          │
│ Sidebar  │  (260px)    │     (flex-1)            │
│  (52px)  │             │                         │
│          │  [task 1]   │  根据任务状态切换：       │
│  ...     │  [task 2]   │  - 配置态：表单          │
│  [出卷]  │  [task 3]   │  - 运行态：Pipeline      │
│  ...     │             │  - 完成态：试卷预览       │
└──────────┴──────────────────────────────────────┘
```

### 左侧：任务列表（260px）

- 顶部：标题 "出卷任务" + "新建"按钮
- 任务卡片：HeroUI Card，显示学科名、配置摘要、进度条（HeroUI Progress）、状态标签（HeroUI Chip）
- 状态：运行中（紫色）、已完成（绿色）、已暂停（黄色）、失败（红色）
- 点击卡片切换右侧面板
- 容器：HeroUI ScrollShadow

### 右侧：主面板（flex-1），三种状态

#### 1. 配置态（新建任务）

表单字段：

| 字段 | HeroUI 组件 | 必填 | 说明 |
|------|-------------|------|------|
| 学科 | Select | 是 | AP 学科列表，数据来自 `lib/agent/exercise-curriculum.ts` |
| 单元 | Select（多选） | 是 | 根据学科动态加载单元列表 |
| 题数 | Input (type=number) | 是 | 默认 25，范围 5-50 |
| 题型 | CheckboxGroup | 是 | MC / FR，可同时勾选 |
| 难度偏好 | Slider | 是 | 三档：基础为主 / 均衡 / 高阶为主 |
| 试卷名称 | Input | 否 | 不填则 Agent 自动命名 |
| 语言 | ButtonGroup | 是 | 中文 / 英文，默认英文 |

底部：HeroUI Button (color="primary" size="lg") "开始出卷"

#### 2. 运行态（Pipeline 时间线）

顶部：任务标题 + 配置摘要 + 操作按钮（取消、预览试卷[禁用]、导出 PDF[禁用]）

Pipeline 阶段（垂直时间线）：

| 步骤 | 说明 | 可展开日志内容 |
|------|------|---------------|
| 1. 分析课程大纲 | 解析 CED 框架，识别知识点 | 课程名、单元名、知识点列表 |
| 2. 制定出卷蓝图 | 按 CED 权重分配题目 | 题型分配、难度曲线、Bloom 层级分布 |
| 3. 生成题目 | 分批生成（每批 5 题） | 当前批次、使用模型、Topic、修复事件 |
| 4. 验证与质量审查 | 答案验证 + 教师评分 + 难度校准 | 通过/拒绝数、修复轮次、质量评分 |
| 5. 组装试卷 | 排版编号 + 生成答案解析 | Section 划分、分值分配、评分标准 |

每个步骤的 UI 状态：
- **已完成**：绿色圆圈 ✓ + 日志面板（HeroUI Accordion 可折叠）
- **进行中**：紫色脉冲动画 + 实时日志（自动滚动）
- **待执行**：灰色圆圈 + 步骤编号，半透明

日志面板：monospace 字体，深色背景 Card，显示 Agent 的决策推理（如"Topic 4.3 权重 15% → 分配 4 题"、"题 #18 答案歧义 → 触发修复轮次 1"）。

#### 3. 完成态（试卷预览）

顶部操作栏：
- Pipeline 日志（HeroUI Button variant="flat"）— 回看完整决策过程
- 去编辑器微调（HeroUI Button variant="flat"）— 跳转 `/main/question-bank/builder/[id]`
- 导出 PDF（HeroUI Button color="primary"）— 分别导出试卷版和答案解析版

统计栏：
- 通过数 / 修复后通过数 / 平均质量分 / 知识点覆盖率
- HeroUI Tabs：试题 / 答案解析 切换

试卷预览：
- 按 Section 分组（Section I: MC, Section II: FR）
- 每题显示：编号、Topic、难度、Bloom 层级、验证状态（HeroUI Chip）、质量评分
- MC 题：四选项网格布局，正确答案绿色高亮
- FR 题：题干 + 子问题列表（带分值标注）
- 答案解析 Tab：每题展示正确答案、解题步骤、常见错误、评分标准

## 数据模型

### ExamTask（前端状态）

```typescript
type ExamTaskStatus = 'configuring' | 'running' | 'completed' | 'paused' | 'failed'

type ExamTaskConfig = {
  subject: string           // AP 学科 ID
  units: string[]           // 单元 ID 列表
  questionCount: number     // 题数
  questionTypes: ('MC' | 'FR')[]  // 题型
  difficultyPreference: 'easy' | 'balanced' | 'hard'  // 难度偏好
  language: '中文' | '英文'
  examName?: string         // 试卷名称（可选）
}

type PipelineStep = {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt?: number
  completedAt?: number
  logs: PipelineLogEntry[]
}

type PipelineLogEntry = {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'decision'
  message: string
}

type ExamTask = {
  id: string
  config: ExamTaskConfig
  status: ExamTaskStatus
  pipelineSteps: PipelineStep[]
  progress: { current: number; total: number }
  result?: ExamResult
  createdAt: number
  completedAt?: number
}
```

### ExamResult（出卷结果）

```typescript
type ExamResult = {
  examName: string
  sections: ExamSection[]
  stats: {
    totalQuestions: number
    passedCount: number
    repairedCount: number
    averageQuality: number
    topicCoverage: number  // 0-1
    totalTimeMs: number
  }
  pipelineOutput: ApExercisePipelineOutput  // 复用现有类型
}

type ExamSection = {
  title: string           // "Section I: Multiple Choice"
  questionType: 'MC' | 'FR'
  pointsPerQuestion: number
  totalPoints: number
  questions: ExamQuestion[]
}

type ExamQuestion = {
  index: number
  exercise: PipelineExercise       // 复用现有类型
  topicId: string
  topicName: string
  bloomLevel: string
  verificationStatus: 'passed' | 'repaired' | 'warning'
  qualityScore: number            // 0-10
}
```

## 后端架构

### API 路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/exam-agent/tasks` | POST | 创建出卷任务，返回 task ID |
| `/api/exam-agent/tasks` | GET | 获取当前用户的所有出卷任务 |
| `/api/exam-agent/tasks/[taskId]` | GET | 获取单个任务详情（含 pipeline 状态） |
| `/api/exam-agent/tasks/[taskId]` | DELETE | 取消/删除任务 |
| `/api/exam-agent/tasks/[taskId]/stream` | GET | SSE 流，实时推送 pipeline 进度和日志 |
| `/api/exam-agent/tasks/[taskId]/export` | POST | 导出 PDF（试卷版或答案解析版） |

### Agent 执行流程

创建任务后，后端启动异步 Agent 流程：

1. **分析课程大纲**：调用 `resolveCurriculumContext()` 解析 CED
2. **制定出卷蓝图**：调用 `heuristicBlueprint()` + AI 优化，按 CED 权重分配题型/难度/知识点
3. **分批生成题目**：调用 `runApExercisePipeline()` 分批生成（每批 5 题，复用现有 pipeline）
4. **验证与审查**：pipeline 内置的 solver 验证 + teacher review
5. **组装试卷**：按 Section 分组、编号、分配分值、生成答案解析

全程通过 SSE 流推送 `PipelineStep` 状态变更和 `PipelineLogEntry`。

### 复用现有模块

| 现有模块 | 用途 |
|---------|------|
| `lib/agent/exercise-pipeline.ts` | 核心生成 pipeline（生成→解析→验证→审查） |
| `lib/agent/exercise-pipeline-types.ts` | Blueprint、PipelineExercise 等类型 |
| `lib/agent/exercise-curriculum.ts` | AP CED 课程大纲解析 |
| `lib/worksheet/assemble.ts` | 组卷组装逻辑（可复用部分排版逻辑） |
| `lib/typst/render-exam.ts` | 考试卷 Typst PDF 渲染 |
| `lib/pdf/templates/exam-template.ts` | 考试卷 PDF 模板 |

### 新增模块

| 模块 | 说明 |
|------|------|
| `lib/exam-agent/orchestrator.ts` | 出卷 Agent 编排器（调度 5 个 pipeline 步骤） |
| `lib/exam-agent/blueprint-planner.ts` | 出卷蓝图规划（CED 权重 → 题目分配） |
| `lib/exam-agent/assembler.ts` | 试卷组装（分 Section、编号、分值、解析） |
| `lib/exam-agent/types.ts` | ExamTask、ExamResult 等类型定义 |
| `lib/exam-agent/store.ts` | 任务状态管理（内存 + 可选持久化） |

## 前端组件结构

```
app/main/(with-sidebar)/exam-agent/
  page.tsx                          # 页面入口
  layout.tsx                        # 布局（如果需要）

components/main/exam-agent/
  ExamAgentPage.tsx                 # 主页面（Master-Detail 双栏）
  TaskListPanel.tsx                 # 左侧任务列表面板
  TaskCard.tsx                      # 单个任务卡片
  ConfigForm.tsx                    # 新建出卷配置表单
  PipelineTimeline.tsx              # Pipeline 时间线（运行态）
  PipelineStep.tsx                  # 单个 Pipeline 步骤
  PipelineLogPanel.tsx              # 步骤日志面板
  ExamPreview.tsx                   # 试卷预览（完成态）
  ExamQuestionCard.tsx              # 单题卡片
  ExamStatsBar.tsx                  # 统计栏
  ExamExportButton.tsx              # 导出 PDF 按钮

hooks/
  use-exam-tasks.ts                 # 任务列表 CRUD
  use-exam-pipeline-stream.ts       # SSE 流订阅 pipeline 进度
```

## HeroUI 组件使用清单

| 场景 | HeroUI 组件 |
|------|-------------|
| 任务列表容器 | ScrollShadow |
| 任务卡片 | Card, CardBody |
| 任务进度条 | Progress |
| 任务状态标签 | Chip |
| 配置表单 - 学科/单元 | Select, SelectItem |
| 配置表单 - 题数/名称 | Input |
| 配置表单 - 题型 | CheckboxGroup, Checkbox |
| 配置表单 - 难度 | Slider |
| 配置表单 - 语言 | ButtonGroup, Button |
| 开始出卷 | Button (color="primary" size="lg") |
| 顶部操作按钮 | Button (variant="flat" / "solid") |
| Pipeline 步骤展开 | Accordion, AccordionItem |
| 统计栏 Tab | Tabs, Tab |
| 试题验证状态 | Chip (color variants) |
| 试题卡片 | Card, CardBody |
| Section 分隔 | Divider |
| 确认对话框 | Modal, ModalContent, ModalHeader, ModalBody, ModalFooter |
| 加载状态 | Spinner |

## 不在此版本范围内

- 试卷保存到数据库（V1 仅本地状态 + 导出 PDF）
- 试卷历史记录持久化
- 多用户协作出卷
- 自定义题目模板
- 从已有题库选题组卷（现有 Worksheet Builder 已覆盖）
