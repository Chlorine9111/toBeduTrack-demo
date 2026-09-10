# Teacher Long-term Memory

## 目标

让系统具备对老师使用习惯和历史的持续记忆能力，而不是每次会话都从零开始。

## 存储策略

- 主存储：Supabase（`teacher_usage_memory` + `teacher_usage_events`）
- 冷记忆检索：`semantic_index_items(source_kind=memory_capsule)`
- 后台任务：`teacher_memory_jobs`
- 记忆审计：`teacher_memory_mutations`
- Supermemory：默认只做可选镜像，不再是主链依赖

## 数据模型

### 1) teacher_usage_memory

- `profile_key`：客户端持久身份标识（localStorage）
- `teacher_id`：登录用户可绑定
- `scope`：当前为 `wechat_editor`
- `preferences`：如 `lastTab`、`lastTemplateId`、`lastAiAction`、`lastTitle`
- `summary`：统计数据（tab/模板/AI 使用频次，会话数）
- `history`：最近行为历史（裁剪保留）

### 2) teacher_usage_events

记录行为事件明细，用于后续分析与推荐策略。

### 3) teacher_memory_jobs

- 用于把对话记忆形成从主回复链路中拆出来
- 先保存老师可见消息，再后台执行提炼与整合
- 支持失败重试与补跑

### 4) teacher_memory_mutations

- 记录每次长期记忆的 `ADD / UPDATE / CLOSE / DELETE / NOOP`
- 用于回溯记忆污染、确认关闭待办、后续支持老师可见记忆管理

## API

### GET /api/teacher-memory

Query:

- `profileKey` (required)
- `scope` (optional, default `wechat_editor`)
- `teacherId` (optional)

Response:

- `memory`
- `insights`（常用 tab/模板/AI动作、会话数、最近标题）

### POST /api/teacher-memory

Action:

- `init`
- `track`（记录事件）
- `preferences`（偏好 patch）

## 前端接入（WeChat Editor）

- 自动生成并持久化 `profileKey`
- 初始化时加载记忆上下文
- 自动记录事件：
  - `session_start`
  - `tab_switch`
  - `template_apply`
  - `insert_preset`
  - `insert_image`
  - `ai_action`
  - `copy_to_wechat`
  - `export_html`
  - `preview_toggle`

## 兼容与降级

- 当数据库不可用时，仍允许 `E2E_TEST=1` 下回退到进程内内存；正式主链默认依赖 Supabase。

## 后续可扩展

1. 增加老师可见的记忆查看/编辑界面
2. 增加 nightly maintenance：关闭过期 open loops、清理 episodicRecent、压缩重复记忆
3. 引入更强的后台 consolidation agent，用于跨会话反思
