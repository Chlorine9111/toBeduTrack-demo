---
last_verified: 2026-03-31
owner: platform-harness
---

# Deskmate 前端现状清单

## 当前主入口
- 主工作台：`/main/agent`
- 教师内容资产与内容库：`/main/content-assets`
- 兼容跳转：`/main/project` 仅保留到 `/main/agent` 的 redirect
- 首页：`/main`
- 公众号编辑器：`/main/wechat-editor`
- 题库：`/main/question-bank`

## 正式主壳
- `/main/*` 当前正式布局：`app/main/(with-sidebar)/layout.tsx -> components/main/LovableSharedLayout.tsx -> components/main/AppSidebar.tsx`
- 旧壳/非正式入口：`components/main/Sidebar.tsx`、`HomeContent.tsx`、`CommunitySection.tsx`、`chatflow/DashboardView.tsx`
- 修主工作台时，优先看正式壳和真实 page route，不要先改旧组件
- `/main/*` 与 `/lesson-plans` 当前共用 `components/shells/ProductShell.tsx` 的轻量全局搜索入口；正式搜索组件是 `components/shells/SearchModal.tsx`，不要再回头改旧的 `components/main/SearchModal.tsx`

## 核心页面

| 页面/组件 | 职责 |
|------|------|
| `components/main/AgentWorkspacePage.tsx` | 主工作台，负责输入、资料上传/引用、流式回复、时间线与右侧 Canvas 协调 |
| `components/main/agent/AgentWorkspaceActiveState.tsx` | 主工作台活跃态，负责消息列表、长对话裁剪、引用块与右侧 Canvas 入口 |
| `components/main/agent/AgentWorkspaceIdleState.tsx` | 主工作台空态，负责欢迎语、快捷标签与首屏输入 |
| `components/main/agent/stream-runner.ts` | 主工作台流式事件消费层，负责把统一 UI stream 事件转成时间线、题块、产物引用 |
| `lib/api/ui-message-stream.ts` | AI SDK UI stream 解析层，负责把 `text/event-stream` chunk 还原成主工作台事件与 lesson data parts |
| `components/main/LovableSharedLayout.tsx` | `/main/*` 共享外壳，负责顶层布局、滚动边界与内容容器 |
| `components/main/AppSidebar.tsx` | 正式侧边栏（走 `LovableSharedLayout.tsx`），负责导航、recent 会话、账户信息与当前页禁用态，所有”工作台”入口收敛到 `/main/agent` |
| `components/main/HomeContent.tsx` | 首页，负责快速入口与将 prompt/PDF 导向 Agent；当前 `/main` 默认落到 `/main/agent` |
| `components/main/QuestionBankPage.tsx` | 题库与题目资料整理页，负责按课程/单元/知识簇/细分知识点/考察方式/来源查看题目，并回看原始资料 |
| `components/main/content-assets/ContentAssetsPage.tsx` | 教师内容资产与内容库统一入口，负责文件树、reference 资产、上传预览、旧 content-library renderer 详情与 AI 整理侧栏 |
| `components/main/Sidebar.tsx` | 旧版导航，不在正式主链路中 |
| `components/wechat-editor/*` | 公众号内容生成、排版、模板编辑与导出 |
| `components/main/GradingPage.tsx` | AI 判卷工作区 |
| `components/main/SchedulerPage.tsx` | 智能排课工作区 |

## Agent 前端数据流

```text
用户输入/上传
  -> AgentWorkspacePage.startAgentTask()
  -> /api/agent/chat (Vercel AI SDK UI stream)
  -> parseAgentStreamEvents()
  -> 左侧消息流 + 工具时间线 + 右侧 Canvas 产物
```

## 当前做薄基线
- `AgentWorkspacePage.tsx` 仍是主壳，但不再直接内联扫描上传轮询和底层 UI stream 解析细节。
- 扫描链和流式事件链已经抽到 `components/main/agent/*` 子模块；继续改主工作台时，优先扩展这些子模块，不要把实现重新并回页面壳。
- 2026-03-13 起，主工作台与教案链统一采用 Vercel AI SDK UI stream 稳定协议：服务端统一输出 `text/event-stream`，前端统一通过 `lib/api/ui-message-stream.ts` 读取 `text/tool/data-*` chunk；不要再新增页面内联 `parseNDJSON(...)` 聊天解析器。
- 主工作台当前仍未完成面板级完全拆分，因此 follow-up、历史记录、Canvas、上传链路的状态隔离仍在持续推进；新增状态时，优先收敛到局部 hook 或子模块，而不是继续给页面壳加新的大块状态。
- 2026-03-13 起，`AgentProgressPanel` 与 `ArtifactCanvas` 已改为按需动态加载；老师还没进入生成态、也没点开引用块前，不再首屏挂载这两个重组件。
- 2026-03-17 起，`ArtifactCanvas` 内的文档型产物开始走结构化 `DocumentEngine` 按需加载；当前阅读态主链已经切到 `DocumentModel -> 纯 React block renderer`，优先保证拖选、取消选区和右侧小面板的稳定性。历史 markdown 产物仍允许 fallback；若后续需要真正的文档内编辑，再单独引入编辑态引擎，不把阅读态重新绑回富文本编辑器。
- 主工作台空态/活跃态已拆到 `AgentWorkspaceIdleState.tsx` 与 `AgentWorkspaceActiveState.tsx`；继续做首屏或滚动性能优化时，优先在这两层隔离状态，不要再把所有逻辑回塞进页面壳。
- 长对话当前默认只挂载最近 18 条消息，老师主动展开后才加载完整历史；这是当前防止长流式对话拖慢滚动和输入响应的正式基线。
- 正在流式输出的最后一条 assistant 消息，当前先走轻量纯文本渲染，等流结束后再切回 `RichMarkdown`；如果后续再改 Markdown/LaTeX 渲染，不要破坏这个“流中轻、收尾重”的策略。
- 2026-03-28 起，`/main/agent` 主链不再依赖独立 `/api/agent/preflight`；首个可见反馈由 `/api/agent/chat` 的流式正文或右侧 Canvas 占位承担，不再维护单独的 preflight 进度态。
- 2026-03-29 起，`/main/agent` 左侧进度卡开始展示“Agent 工作笔记”：通过统一 `data-agent-run / data-agent-working-note / data-agent-process-summary` 流式事件展示程序化工作说明；这些笔记默认只在当前轮临时可见，右侧 Canvas 仍只负责文档型正文，不承担工作过程展示。

## 入口兼容规则
- 首页文本提交：跳转 `/main/agent?prompt=...`
- 首页若需要拆题，不再跳转 `/main/agent`；拆题能力已经迁出当前工作区，由独立页面/仓库承接。
- `/main/agent` 首次加载会消费 `prompt/action` 查询参数并自动发起任务
- `/main/project` 不再承载业务 UI，只保留兼容跳转
- 轻量全局搜索当前走两段式链路：`GET /api/search/bootstrap` 负责标题索引与 Recent 候选，`GET /api/search?q=...` 只做纯文本搜索补充；不要把 Cmd+K 直接接回题库/内容库现有的“语义 + 关键词混排”列表接口
- 搜索结果的只读临时预览统一走 `GET /api/search/peek?type=...&id=...`；前端不要直接按类型分叉去撞 5 套详情接口，Peek 与真正“全屏打开”的详情页读取要解耦

## 当前交互契约
- `/main/agent` 的正式主链已经收口成 `contentAssetIds + /api/agent/chat + 最小 tool calling / 资料问答快路径`；不要再把 follow question、任务理解或附件摘要拆成单独的 preflight 产品流程。
- follow question 的目标仍然是“只问一个最小必要问题”，但它应当内收进 `/api/agent/chat` 的服务端任务裁决，而不是恢复独立 preflight。
- 对普通生成习题请求来说，只要课程或单元已经明确，就不能因为没写更细的 `topic` 就整轮阻塞；显式单意图任务应直接命中正确工具。
- Chat 底部快捷标签是“填充 prompt + 高亮选中态”，不是一键发送。
- `/main/agent` 当前不再承担 `PDF 拆题 / 扫描试卷` 能力；聊天区只保留“资料上传到上下文”和“引用已有资料”两类入口。
- 首页纸夹按钮现在只负责打开 Agent 工作台；不再把 PDF 文件注入 `/main/agent?action=scan_pdf`。
- Sidebar / `assets` 上传的 PDF 默认只作为资料素材：先提取正文、分块并写入 embedding，供 Agent 引用与生成；不会自动同步成内容库条目或只读文档副本。
- `/main/agent` 输入框旁统一使用 `assets` 引用入口；老师可直接选文件原件或旧内容库条目映射出的 reference asset。发送后只传 `contentAssetIds`，不再要求前端同时维护 `contentReferenceIds` 双轨状态。
- `/main/agent` 中的 `worksheet` 不再等同于“题目卷”。当前正式语义分成两类：`题目型 worksheet` 继续走题库组卷 / 临时题池 / 上轮习题复用；`文档型 worksheet` 则直接生成学生课堂讲义、guided notes、活动单等可编辑文档。显式出现 `worksheet` 且带有“讲义 / guided notes / 活动单 / 不要组卷”这类信号时，必须优先命中文档型 worksheet，而不是被 `lesson-plan` 或习题链路抢走。
- `Artifact Canvas` 不是默认常驻双栏。左侧先只显示聊天与引用块，老师点击某个引用块后，右侧 Canvas 才展开正文；关闭全部标签后，Canvas 重新收起。
- 产物引用块首次出现后，前端会在空闲时预热 `ArtifactCanvas` 模块；目标不是抢首屏，而是缩短老师第一次点开 Canvas 的可见时间。
- 文档型 Canvas 当前的打印/导出优先复用已渲染 DOM 打开浏览器打印窗口，确保老师看到的结构化排版不会因为导出动作退回到旧 markdown 视图；仍有真实 PDF 下载地址的 worksheet，则继续优先打开后端已生成的 PDF。
- `/main/content-assets` 当前是教师私有内容的正式主入口：上传文件资产与旧 `content_library_items` 会统一映射到同一套 assets 视图与右侧详情区；其中 reference 里的文档型内容默认进入统一 Tiptap 文档编辑器，原件型文件继续走 PDF / DOCX / 图片 / 文本 viewer。右上角主操作已改为明确的“新建内容”菜单，固定承载 `新建文档 / 新建文件夹 / 上传文件` 三类入口，避免把单个 `+` 误解成仅支持建文件夹。`/main/content-library` 只做兼容跳转与旧链接承接，新的联调、搜索跳转与验收默认从 assets 页面开始。
- `/main/question-bank` 当前采用“题目优先、资料兜底”的双层视图：默认先展示标准化题目，按课程/单元聚合；题目列表会直接显示知识簇、细分知识点、主考察方式与分类状态；切到“资料”页时再查看原始 PDF/知识库文件及其已拆题数量。
- `/main/question-bank/builder` 的当前 PDF 导出主链已切到 `buildWorksheetPdfHtml(...) -> /api/doc/export-pdf` 的 HTML 打印路径，目标是让组卷编辑器导出的 PDF 更接近老师当前在分页画布里看到的排版与公式效果；不要再把这页导出问题默认归因为 Typst 模板链。
- Chat / 内容库的 assistant 正文统一按 Markdown + LaTeX 渲染。
- 内容库卡片不是终点；点击卡片后必须打开正式详情抽屉，老师要能继续查看正文、调整标题/备注，并修改课程与单元归类。
- 内容库中的 `question` 详情抽屉现在同时承担题目编辑入口：老师可以直接修改题干、选项、答案、解析，并手动保存 `大类 / 小类` taxonomy；需要重新识别时，再触发题目级 AI 重分类。
- `question` 列表筛选除了课程/单元外，还支持动态 `大类 / 小类` taxonomy 过滤；这些选项来自教师自己的 taxonomy 节点，不是前端写死枚举。
- recent 会话不是轮询刷新；一轮 Agent 对话成功后，前端要广播 `deskmate-agent-conversations-updated`。
- 公众号编辑器的正式入口是 `/main/wechat-editor`，根路径 `/` 不承担公众号工作台 UI。

## 当前前端约束
- 新增工作台类能力，默认接入 `/main/agent`，不要再新增 `/main/project` 风格页面。
- 需要 AI 输出的界面，优先复用 Agent 的流式与时间线交互模式。
- 需要长流程反馈的界面，优先复用“阶段事件 + 完整结果块”模式，不再新增只有 spinner、没有阶段说明的交互。
- `/main/agent` 的本地 intent 回归脚本是 `scripts/ux/verify-agent-intent-planner.mjs`；至少要覆盖“课程上下文不完整先问 action”和“topic follow-up 不再重复追问 Unit”两条真实链路。
- `/main/agent` 的性能回归脚本是 `scripts/ux/verify-agent-workspace-performance.mjs`；当前基线要求至少记录欢迎语可见时间、进度面板可见时间、引用块可见时间与 Canvas 展开时间，并把产物写入 `document/ux-verification/<timestamp>/`。
- 2026-03-13 的最近一次主工作台性能验收产物为 `document/ux-verification/20260313_104110_agent-workspace-ui-stream-phase12-rerun3/`；关键结果：`welcomeVisibleMs=1127`、`progressVisibleMs=812`、`artifactReferenceVisibleMs=27479`、`canvasVisibleMs=28334`，`POST /api/agent/preflight=2475ms`、`POST /api/agent/chat=815ms`，且 `404/console error/pageerror=0`。
- 若只是兼容历史链接，使用 redirect，不重新引入旧页面实现。
