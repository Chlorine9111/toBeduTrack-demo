---
last_verified: 2026-03-31
owner: platform-harness
---

# Agent 常见错误模式

## 模式 55: Typst 导出本地正常、Vercel 线上 500，根因其实是动态 `readdir` 读取模板导致 output tracing 漏打包
- **症状**:
  - 组卷、Exam、Worksheet、Lesson Plan 一类走 Typst 的 PDF 导出在本地开发环境可用，但部署到 Vercel 后直接失败。
  - 常见接口包括 `/api/doc/export-document-typst-pdf`，以及会在组卷工作流内触发 Typst 编译的 `/api/agent/chat`。
  - `2026-03-31` 起，`/main/question-bank/builder` 的 PDF 导出已经改走 HTML 打印链 `buildWorksheetPdfHtml(...) -> /api/doc/export-pdf`，排查这页导出问题时不要再默认按 Typst 故障处理。
  - Vercel 函数日志通常只会看到 `ENOENT`、Typst compile failed，或统一的“导出 PDF 失败”，表面上像是编译器坏了，实际是模板文件没进函数包。
- **根因**:
  - `lib/typst/compiler.ts` 运行时通过 `readdir(process.cwd()/lib/typst)` 动态扫描 `.typ` 模板。
  - Next/Vercel 的 output tracing 对这种运行时文件系统扫描不稳定，`.nft.json` 里不会自动包含 `lib/typst/**/*.typ`，导致线上函数里缺模板，但本地源码目录还在，所以只会线上坏。
- **正确做法**:
  - 在 `next.config.ts` 里用 `outputFileTracingIncludes` 显式把 `./lib/typst/**/*.typ` 加到所有会触发 Typst 编译的路由。
  - 当前至少要覆盖：
    - `/api/agent/chat`
    - `/api/doc/export-document-typst-pdf`
    - `/api/doc/export-lesson-typst-pdf`
    - `/api/pdf/export-markdown`
    - `/api/question-bank/builder/export-preview`
- **后续避免**:
  - 只要服务端代码仍依赖 `fs/readdir/readFile` 动态读取非 JS 资源，就不要假设 Vercel 会自动带上这些文件；先检查对应路由的 `.nft.json`。
  - 新增 Typst 模板、字体、CSS、词典、JSON 配置等运行时资源时，同步评估是否要补 `outputFileTracingIncludes`。
  - 验收“本地可用、线上失败”的导出问题时，先看函数 trace 清单里有没有资源文件，不要先怀疑业务 schema 或教师权限。
  - 重新部署修复时，必须从真实项目根目录执行 `vercel deploy --prod`，并确认 CLI 输出的目标项目是当前正式站所属项目；如果部署到了误建的新项目，`Ready` 也不会接管 `www.deskmate.pro`。
- **状态**: 已修复

## 模式 54: `retrieval_then_document` 遇到联网失败时静默降级成本地文档生成，表面上像“用了 Web Search”，实际上上下文根本没注入
- **症状**:
  - 教师明确要求“联网搜索后生成 worksheet / rubric / lesson plan”等文档。
  - 右侧 Canvas 可能已经打开，甚至开始流式出正文，但内容并没有体现最新联网结果。
  - dev 日志里会看到 `retrieval_then_document search fallback` 或 4xx 搜索错误，随后仍继续走文档工具。
- **根因**:
  - 服务端把“检索失败”当成了可接受 fallback，直接拿原始 prompt 继续生成文档。
  - 结果用户感知上像是“联网 + 文档”成功了，但实际上检索上下文没有真正进入 `teacherRequest`。
- **正确做法**:
  - `retrieval_then_document` 必须 fail-closed：检索成功后再继续文档工具；检索失败则明确报错，不继续生成最终文档。
  - 只有当检索摘要或来源至少有一项可用时，才允许把检索结果拼进文档工具输入。
- **后续避免**:
  - 任何改 `searchWebWithClaude`、`/api/agent/chat` 的检索后直达分支时，都要验证“搜索失败不会继续生成文档”。
  - 排查“联网文档质量不对”时，先确认检索结果是否真的成功进入文档工具输入，不要只看 UI 上有没有打开 Canvas。
- **状态**: 已修复

## 模式 53: “先联网再生成文档”没有把最终文档工具跑完，左侧只剩普通文本，右侧 Canvas 永远不出现
- **症状**:
  - 教师请求同时包含“联网/搜索”和“worksheet / rubric / lesson plan / exam”等文档目标。
  - 页面会出现左侧回答或检索结果，但没有统一 artifact 引用块，右侧 Canvas 也不展开。
- **根因**:
  - 服务端虽然把请求判成了 `retrieval_then_document`，但工具循环没有强制执行“检索 -> 文档工具”顺序。
  - 结果模型在 `web_search` 之后直接用普通文本收口，没有真正调用 `generate_worksheet / generate_rubric / ...`，前端自然拿不到 artifact 事件。
- **正确做法**:
  - 只要执行模式仍然是“文档型产物”，就必须保证最终落到对应文档工具，让左侧引用块和右侧 Canvas 统一接管。
  - `retrieval_then_document` 应至少强制执行：检索工具 -> 主文档工具；若还有答案页等附属文档，再按顺序继续执行。
- **后续避免**:
  - 任何改 `execution-plan`、`/api/agent/chat` 工具循环或 `preferredTools` 顺序的提交后，至少跑一次 `tests/followup/agent-execution-plan.spec.ts`。
  - 出现“用户明明要文档，但只看到左侧纯文本”的现象时，先查工具循环是否真的跑到了文档工具，不要先怀疑前端 Canvas 渲染。
- **状态**: 已修复

## 模式 52: `next dev` 热更新后浏览器还握着旧动态 chunk，`AgentContextSidebar` 一类核心子树会直接报 `ChunkLoadError`
- **症状**:
  - `/main/agent` 打开时直接进 `app/main/(with-sidebar)/error.tsx`。
  - 控制台报 `ChunkLoadError` 或 `Loading chunk ...AgentContextSidebar... failed`，请求的 `_next/static/chunks/...js` 返回 404。
- **根因**:
  - `next dev` / HMR 重新编译后，浏览器里的旧 runtime 仍引用了上一版动态 chunk 文件名。
  - `AgentContextSidebar` 这类高频改动且属于主工作台核心子树的组件，如果继续用 `dynamic(...)` 单独切 chunk，更容易在开发态撞上“旧 chunk 名已失效、当前服务端只认新 chunk”。
- **正确做法**:
  - 对主工作台核心子树优先使用静态导入，避免再拆成独立动态 chunk。
  - 路由级错误边界要识别 `ChunkLoadError`，并做一次性自动刷新，帮助浏览器重新拿最新 runtime。
- **后续避免**:
  - 频繁改动 `/main/agent` 主壳或其核心子树后，如果出现只在本地 dev 复现的 404 chunk，先怀疑 HMR/runtime 漂移，不要先重写业务逻辑。
  - 对非关键面板可继续 `dynamic(...)`，但高频核心子树优先静态导入。
- **状态**: 已修复

## 模式 51: 删除 reference 资产时先删 `content_library_items`，会被 `content_assets` 的 FK + consistency check 组合直接打爆
- **症状**:
  - `/main/content-assets` 删除某些 reference 资料时，前端直接报 `删除内容索引失败`。
  - 堆栈通常落在 `deleteContentLibraryItems(...)`，看起来像删内容库条目失败，但真正触发点在关联的 `content_assets`。
- **根因**:
  - `content_assets.content_library_item_id` 虽然是 `on delete set null`，但 reference 行同时还有 `content_assets_content_library_reference_consistency_check`，要求 `ref_entity_type = content_library_item` 时 `content_library_item_id` 不能为空且必须等于 `ref_entity_id`。
  - 如果先删 `content_library_items`，数据库会先把 linked reference 资产的 `content_library_item_id` 置空，再立即撞上这条 check，最终整次删除在数据库层失败。
- **正确做法**:
  - 删除顺序必须固定为：
    1. 先删 linked reference `content_assets`
    2. 再把 uploaded `content_assets` 的 `content_library_item_id` 解绑
    3. 最后删 `content_library_items`
  - 不要再把“删父表，再依赖 FK 自动清理子表”当成安全路径。
- **后续避免**:
  - 任何涉及 `content_library_items <-> content_assets(reference)` 的删除逻辑，先查 FK 行为，再查附加 `check constraint`，不要只看 `on delete set null`。
  - 回归至少覆盖一次“删除 reference 资产 / 删除 content-library item”路径，确认顺序仍是先清 linked assets 再删内容项。
- **状态**: 已修复

## 模式 50: streaming artifact 切到 persisted 产物时过早清空 `open/active`，右侧 Canvas 会短暂出现后又回到空态
- **症状**:
  - `/main/agent` 里文档型任务已经开始流式生成，右侧 Canvas 容器也出现了，但标题 `agent-canvas-title` 一直等不到。
  - 真实页面常见表现是：右侧先像是要打开文档，随后又掉回空白提示或“最近执行”面板，用户会误以为 artifact 没生成。
- **根因**:
  - `use-agent-workspace-stream-state.ts` 在 `streaming -> persisted` 交接时，会先按当前 `artifacts` 做一次 `openArtifactIds/activeArtifactId` 清理。
  - 如果 persisted artifact 还没来得及接管 display id，或者中间有一帧 `artifacts=[]`，就会把当前打开态提前清空；之后即使正式 artifact 落盘，也不会自动重新打开。
- **正确做法**:
  - 清理 `openArtifactIds` 时必须保守：
    - streaming 期间不清
    - 非 streaming 时如果已有最新 artifact，但 `openArtifactIds` 暂时失效，默认回退到最新 artifact，而不是直接清成空
  - persisted artifact 出现后，如果当前没有 active/open，应该自动接回最新文档型产物，保证右侧 Canvas 标题和正文持续可见。
- **后续避免**:
  - 任何修改 `streamingArtifactPreview / artifactDisplayBindings / openArtifactIds / activeArtifactId` 的提交后，至少重跑一次 `scripts/ux/verify-agent-rubric-routing.mjs`。
  - 遇到“Canvas 容器可见，但标题一直不出现”的现象，优先排查状态机清理时机，不要先怀疑 tool 本身没生成正文。
- **状态**: 已修复

## 模式 48: 资料型 PDF 出卷被 preflight 一刀切打成 `scan_pool_worksheet`，导致题池路径误接管
- **症状**:
  - `/main/agent` 里明明贴入的是普通 PDF 资料，前几轮 `worksheet / rubric / lesson plan` 都正常，但到了 `exam` 这轮突然没有新的引用块。
  - 浏览器里抓到的 `chat-payloads.json` 会显示：
    - `contentAssetIds` 仍然在
    - `taskContext.attachmentMode = "scan_pool_worksheet"`
    - `attachmentsSummary = "1 文件, 0 题"`
- **根因**:
  - `lib/agent/preflight.ts` 里 `buildTaskContext(...)` 过去只要 `action === create_worksheet` 且有附件，就直接把附件模式写成 `scan_pool_worksheet`，完全不看这批附件是不是题池/扫描结果。
  - 结果“基于资料出卷”会被错误送到扫描题池 worksheet 路由，后续 artifact 行为和 UI 预期都跑偏。
- **正确做法**:
  - `scan_pool_worksheet` 只能在附件确实带题池信号时启用，例如：
    - `totalQuestions > 0`
    - `questionFileCount > 0`
    - `contentKinds` 包含 `question_set` 或 `mixed`
  - 只有普通资料文件、`0 题` 的场景，必须保持 `attachmentMode = material_reference`。
- **后续避免**:
  - 任何改 `create_worksheet` / `exam` preflight 的提交后，都先跑 `pnpm exec tsx tests/followup/agent-preflight.spec.ts`。
  - 浏览器联调如果出现“接口 200 但 exam 没引用块”，优先先看 `chat-payloads.json` 里的 `attachmentMode`，不要先怀疑 contentAssetIds 丢了。
- **状态**: 已修复

## 模式 49: Agent UX 脚本只等 2xx，会把真实 403 额度失败误报成 artifact 超时
- **症状**:
  - `scripts/ux/verify-agent-material-multi-artifacts.mjs` 一开始看起来像是“等待 artifact 超时”。
  - 但浏览器 console 实际已经出现 `/api/agent/chat 403`，只是脚本没有把响应体抓出来。
- **根因**:
  - 脚本里的 `page.waitForResponse(...)` 过去只接受 `status 200~299`，导致 4xx/5xx 被直接漏掉。
  - 本地真实联调里，最常见的非 2xx 不是前端状态问题，而是 `QUOTA_EXHAUSTED`。
- **正确做法**:
  - UX 脚本要等待任意 `/api/agent/chat` 响应，再显式读取 `response.ok()`、headers 和 body。
  - 非 2xx 时，把完整信息写进 `errors.json.apiFailures`，不要继续假装等待 artifact。
- **后续避免**:
  - 本地跑真实 Agent 生成前，先确认测试教师额度足够；必要时直接用 service-role 更新当前 `AUTH_BYPASS_USER_ID` 的 `quota_accounts`。
  - 出现 403 时先看 `errors.json.apiFailures` 与 `X-Quota-*` headers，不要先怀疑前端没把资料贴上去。
- **状态**: 已修复

## 模式 47: 迁移脚本按代码想象把 `uuid` 字段当 `text` 比较，结果远端 `db push` 才暴露 SQL 类型错误
- **症状**:
  - `supabase db push --include-all` 在应用 migration 时直接失败，报 `operator does not exist: uuid = text (SQLSTATE 42883)`。
  - 常见现场是 migration 本地已经写好、页面功能也基本能跑，但一到远端落库才发现脚本里某个 `check` 或 `update` 条件类型不匹配。
- **根因**:
  - 迁移脚本按业务代码里的字符串视角去写条件，忽略了数据库真实列类型。
  - 这次具体是 `content_assets.ref_entity_id` 在库里是 `uuid`，migration 却写成了 `ref_entity_id = content_library_item_id::text`。
- **正确做法**:
  - 写 migration 时优先以 schema 为准，而不是以前端/TypeScript 的字符串表示为准。
  - 任何涉及约束、比较、联结条件的列，都先核对原始 migration 或数据库 schema 里的真实类型，再写 SQL。
- **后续避免**:
  - 每次新增 migration，至少做一次 `supabase db push --dry-run`；涉及历史漂移时，再做一次 `--include-all --dry-run`。
  - 如果 migration 里出现 `::text`、`::uuid` 之类显式 cast，先自查是不是在掩盖类型判断错误，而不是在解决问题。
- **状态**: 已修复

## 模式 46: 只在前台读写链兼容 `content_library_items.document_id`，却漏掉后台 `document_source_projection_sync`
- **症状**:
  - 页面手动新建文档、打开 reference 编辑器表面上已经恢复，但保存后后台仍反复打印 `document_source_projection_sync 后台任务失败`。
  - 常见日志会落在 `lib/documents/source-sync.ts`，报错是“读取内容库文档来源失败”或“更新内容库文档投影失败”。
- **根因**:
  - 前台 `content-library` 读链和 manual document 写链已经做了 `document_id` 列缺失回退，但后台 projection 同步仍直接：
    - `.select("id,document_id,metadata")`
    - `.update({ document_id: ..., ... })`
  - 在远端 migration 尚未落完时，后台 after task 仍会被 schema drift 打穿。
- **正确做法**:
  - 任何接触 `content_library_items.document_id` 的链路都必须成套兼容，不能只修用户可见入口。
  - `lib/documents/source-sync.ts` 必须：
    - 读取时对缺列环境退回 `select("id,metadata")`
    - 更新时优先写 `document_id`，若缺列则退回只更新 `metadata.documentId/documentHtml/sourceDocumentVersion`
- **后续避免**:
  - 每次做 schema 漂移兼容时，按“前台读 / 前台写 / 后台任务 / replay handler”四类逐项检查，不要只盯页面链路。
  - 验收除了点页面，还要看 dev server 日志里有没有 after task 持续报错。
- **状态**: 已修复

## 模式 45: 远端仍保留旧 `renderer_type` check constraint 时，manual document 写入 `html` 会直接 500
- **症状**:
  - `/api/content-assets/documents` 点击“新建文档”直接 500。
  - 数据库错误通常是 `new row for relation "content_library_items" violates check constraint "content_library_items_renderer_type_check"`。
- **根因**:
  - 本地代码把 manual document 当作 HTML 文档写入 `renderer_type: "html"`，但当前远端约束仍只放行 `markdown / rubric / lesson_plan_markdown / ...` 这些旧集合。
  - 也就是说“snapshot.kind = html”可以存在，但 `renderer_type = html` 在旧远端并不合法。
- **正确做法**:
  - manual document 的存储兼容层应使用远端已放行的 `renderer_type`，例如 `markdown`，而正文展示继续由 `snapshot.kind` 和统一文档编辑器决定。
  - 只要远端 schema 还没彻底拉平，就不能把新的枚举值直接写进受约束列。
- **后续避免**:
  - 每次新增 enum / check constraint 取值前，都先核对远端真实 migration 状态，不要只看本地类型或代码意图。
  - 真实验收要包含一次“手动新建文档 -> 打开编辑器 -> autosave”，否则这类插入期错误很容易漏掉。
- **状态**: 已修复

## 模式 44: `Server-Timing` header 直接写中文描述，导致路由本身再抛 `ByteString` 异常
- **症状**:
  - 某些 API 原本只是业务异常，但最终在控制台看到 `TypeError: Cannot convert argument to a ByteString...`。
  - 常见堆栈会落在 `appendServerTimingHeader(...)`，随后把原始 4xx/5xx 覆盖成新的 500。
- **根因**:
  - `Server-Timing` 是 HTTP header，值必须是 ASCII / Latin-1 安全字符。
  - 如果直接把中文描述塞进 `desc="..."`，Node 的 `Headers.set(...)` 会在运行时拒绝这个 header。
- **正确做法**:
  - `lib/api/server-timing.ts` 的 metric `description` 必须先做 ASCII 清洗；非 ASCII 字符统一移除或降级为空格。
  - 业务错误信息可以继续保留中文，但不要直接透传进 header。
- **后续避免**:
  - 新增 `Server-Timing` 埋点时，默认只写英文 token；如果要写 `description`，先确认已经经过统一 sanitize。
  - 遇到“业务错误 + ByteString”双重报错时，先检查是不是 header 描述非法，而不是先怀疑路由主逻辑。
- **状态**: 已修复

## 模式 43: 数据库 migration 未落时，内容库读链直接显式选择新列 `document_id`，导致 `/main/content-assets` 首屏 500
- **症状**:
  - `/main/content-assets` 或 `/api/content-assets/bootstrap` 打开即报“读取内容列表失败”。
  - 常见链路是 `readContentLibraryListRowsByIds -> resolveReferenceListItems -> loadContentAssetsBootstrap`。
- **根因**:
  - 代码已经切到 `content_library_items.document_id`，但当前数据库环境还没应用对应 migration。
  - 读链如果显式 `.select("document_id,...")`，而不是兼容旧 schema，就会在 PostgREST 层直接失败。
- **正确做法**:
  - `content-library` 的读链和 manual document 写链都要对 `document_id` 做能力探测：
    - 新 schema 可用时，正常读写 `document_id`
    - 旧 schema 时，自动降级到 legacy select，并从 `metadata.documentId` 回读
  - 新字段作为优化路径可以存在，但不能让主页面因为 migration 漂移完全不可用。
- **后续避免**:
  - 每次引入新列且存在环境漂移风险时，都优先设计“新列可用则走新路径，不可用则退回 metadata/legacy path”的兼容层。
  - 出现“页面 500 + 新列刚上线”的组合时，先怀疑 schema drift，而不是先重写整条业务链。
- **状态**: 已修复

## 模式 42: Content Assets 把 orphan reference 误当成 PDF / Word 原件打开，最终报“该资产没有关联的存储文件”
- **症状**:
  - 在 `/main/content-assets` 点开某些历史内容后，右侧先尝试走 PDF / Word 原件预览，随后报错“该资产没有关联的存储文件”。
  - 常见于内容库整合后的旧 reference 记录，尤其是 `ref_entity_type = null / document` 或缺少 `content_library_item_id` 的资产。
- **根因**:
  - `content_assets` 里的 orphan reference 解析不到 `content_library_items`，但详情桥接层把它错误降级成了 `uploaded`。
  - 前端随后继续调用 `/api/content-assets/:id/signed-url` 或 `/docx-preview`，而 reference 资产本来就不应有 storage 文件。
  - 早期 `createReferenceAsset` 还会因为 `storage_bucket` 默认值，把 reference 行写得像“半个文件资产”。
- **正确做法**:
  - reference 详情解析失败时，必须保留 `detailKind = reference`，并显式标记 `referenceStatus = orphan`。
  - `signed-url` / `docx-preview` 只允许 file-backed uploaded 资产进入；reference 一律返回稳定业务错误。
  - 历史坏数据通过 `node --env-file=.env.local --import tsx scripts/content-assets/repair-reference-assets.ts --write` 修复；可映射的改成 canonical `content_library_item` 引用，不可映射的直接删除。
- **后续避免**:
  - 任何新增 reference 写链路都必须显式写入 `storage_path = null`、`storage_bucket = null`，并优先 canonical 到 `content_library_item_id`。
  - 回归至少覆盖两条：`uploaded PDF -> 右侧 Canvas 预览`、`reference 文档 -> 右侧内容库/Tiptap 视图`，确认 reference 不再发 `signed-url`。
- **状态**: 已修复

## 模式 41: `npm run typecheck` 在 Next.js 工程里偶发整屏 `.next/types/... not found`
- **症状**:
  - 本地或 CI 跑 `npm run typecheck` 时，突然出现大量 `TS6053`。
  - 报错路径集中在 `.next/types/app/**/page.ts`、`.next/types/app/api/**/route.ts` 一类 Next 自动生成文件。
  - 业务代码本身没有对应改动，重跑一次有时又会消失。
- **根因**:
  - `tsconfig.json` 显式包含了 `.next/types/**/*.ts`，但在还没做类型生成、或 `.next/types` 正在被 Next 刷新时，`tsc` 会读到不完整的生成目录。
  - 这类错误通常不是业务类型问题，而是 Next 类型生成时机不稳定。
- **正确做法**:
  - `typecheck` 脚本必须先执行 `next typegen`，再执行 `tsc --noEmit`。
  - 不要把 `tsc` 和 `next build` 并发跑来判断类型状态，避免读到半成品 `.next/types`。
- **后续避免**:
  - 本地和 CI 一律通过 `npm run typecheck` 入口做类型检查，不要手工跳过 `next typegen`。
  - 如果再次看到成片 `TS6053`，先确认是不是脚本顺序或并发问题，再去怀疑业务代码。
- **状态**: 已修复

## 模式 40: Exam 虽然上层 tab 已切成试卷，但流式预览正文仍掉回 `EXERCISES`
- **症状**:
  - Agent 右侧标签、按钮文案已经显示“试卷 / 正式试卷”，但正文预览眉题还是 `EXERCISES`。
  - 导出或统一文档接管后 `documentKind` 可能是 `exam`，可用户在流式阶段看到的仍像习题列表。
- **根因**:
  - `worksheet-question-bank` 的生成式 fallback 在流式 `onTextDelta` 阶段仍直接调用 `buildExercisesDocumentFromMarkdown(...)`。
  - 这样会把 markdown 先投影成 `exercises` 文档，后面即使外层 `artifactKind = exam`，正文头部和文档类型也已经偏掉。
- **正确做法**:
  - Assessment 类流式 preview 必须跟最终 `outputKind` 一致：
    - `exam -> buildExamDocumentFromMarkdown(...)`
    - `worksheet -> buildWorksheetDocumentFromMarkdown(...)`
  - 同时保证 markdown builder 会把 header eyebrow 改成 `Exam / Worksheet`，不能继续沿用 `Exercises`。
- **后续避免**:
  - 任何新增 `worksheet/exam` 入口时，都检查流式 preview 与最终 complete document 是否共用同一种 `DocumentModel.type`。
  - 验收至少覆盖：`/main/agent -> 生成试卷 -> 右侧流式正文眉题`，确认可见文本是 `EXAM` 而不是 `EXERCISES`。
- **状态**: 已修复

## 模式 39: Worksheet/Exam 的 Typst 数学导出把 `\times`、`\cdot` 一类词式运算符粘成 `times10` / `dot100`
- **症状**:
  - Agent 右侧 Worksheet / 试卷点击 `Export -> PDF` 后直接 500。
  - 后端 Typst 编译错误里常见 `unknown variable: times10`、`unknown variable: dot100`。
  - 常发生在题干或解析里包含 `5.0 \\times 10^{-3}`、`n \\cdot 100` 这类物理/数学表达式时。
- **根因**:
  - LaTeX 到 Typst 的转换层虽然认识 `\\times`、`\\cdot`，但在把 fragment 拼接回字符串时，没有给“词式运算符”和前后数字/变量留白。
  - 结果 `5.0 \\times 10^{-3}` 被拼成 `5.0times10^(-3)`，Typst 会把它当成未定义标识符。
- **正确做法**:
  - 在 `lib/typst/math.ts` 的 fragment 合并阶段，把词式运算符（如 `times`、`dot`、`approx`、`plus.minus`）视作需要显式分隔的节点。
  - 只修 Typst 数学转换层，不要为了这个问题去改 Agent 文本流、Canvas、题目生成 prompt 或普通 HTML PDF。
- **后续避免**:
  - 每次改 `lib/typst/math.ts` 后，都先跑 `node --import tsx tests/followup/typst-math-conversion.spec.ts`。
  - 验收至少补一条真实链路：`/main/agent -> Worksheet/Exam 标签 -> Export -> PDF`，确认 `POST /api/doc/export-document-typst-pdf = 200`。
- **状态**: 已修复

## 模式 39A: Typst 数学导出漏转 `\dfrac` / 版式命令，导致 Exam PDF 在真实链路里直接 500
- **症状**:
  - Agent 右侧 Exam 点击 `Export -> PDF` 后，页面直接显示 `PDF_RENDER_FAILED`。
  - Typst 编译错误里常见 `unknown variable: dfrac`，有时还会带出 `displaystyle`、`textstyle` 一类版式命令残留。
- **根因**:
  - LaTeX 到 Typst 的转换层只处理了 `\\frac`，但真实题干/解析里经常会出现 `\\dfrac`、`\\tfrac`、`\\displaystyle` 这类写法。
  - 这些命令如果不在转换层消化，Typst 会把它们当普通标识符，直接编译失败。
- **正确做法**:
  - 在 `lib/typst/math.ts` 里把 `frac/dfrac/tfrac/cfrac` 统一收口到同一套分数转换。
  - 常见版式命令如 `\\displaystyle`、`\\textstyle`、`\\scriptstyle`、`\\bigl`/`\\bigr` 等只作为布局提示，应在转换层安全忽略。
- **后续避免**:
  - 改数学转换后固定跑 `node --import tsx tests/followup/typst-math-conversion.spec.ts`，至少包含 `\\dfrac` 编译通过的断言。
  - 真实验收固定补一条 `Agent -> Exam -> Export -> PDF`，确认 `POST /api/doc/export-document-typst-pdf = 200`。
- **状态**: 已修复

## 模式 38: Typst 数学导出把隐式乘法和多字母文本直接拼接，导致 Lesson PDF 在公式页编译失败或观感发怪
- **症状**:
  - Agent 右侧 Lesson 点击 `Export -> PDF` 后提示 `Lesson PDF 生成失败`。
  - 后端 Typst 编译错误里常见 `unknown variable: kx`，或多字母下标、`KE + PE` 这类缩写被当成未定义变量。
  - 即使没直接 500，导出的数学页也会出现公式发紧、词组像变量连写、物理量缩写不易读。
- **根因**:
  - LaTeX 到 Typst 的转换层把 `F=-kx`、`2\\pi f`、`kA^2` 这类隐式乘法原样拼接，Typst 会把它当成多字母标识符。
  - `E_{total}`、`KE`、`PE` 这类本应显示为文本的多字母片段，没有在数学模式里转成引号文本。
- **正确做法**:
  - 隐式乘法必须在转换层显式拆开成带空格的 `k x`、`2 pi f`、`k A^2`。
  - 多字母文本下标与物理量缩写应转成 Typst 数学文本，例如 `E_(\"total\")`、`\"KE\"`、`\"PE\"`。
  - 修复范围只限制在 `lib/typst/math.ts` 这层，不要为了数学导出去改右侧 Canvas、统一编辑器或普通 HTML PDF 主链。
- **后续避免**:
  - 改 Typst 数学导出前，先跑 `node --import tsx tests/followup/typst-math-conversion.spec.ts`。
  - 验收固定包含真实链路：`/main/agent -> Lesson 引用块 -> Export -> PDF`，并确认 `POST /api/doc/export-lesson-typst-pdf = 200`。
- **状态**: 已修复

## 模式 37: 文档库与内容库路由语义混用，导致搜索/Peek 打开详情后落错页面
- **症状**:
  - 全局搜索或 Peek 点“打开详情”后，URL 变成了带 `itemId` 的 `/main/library?...`，但页面仍停留在文档库列表，看不到内容库详情抽屉。
  - PBL 详情页或 Agent 里的“在内容库打开”链接也会落到文档库页，老师感觉像“点击没反应”或“打开错地方”。
- **根因**:
  - 合并后 `/main/library` 已经承载统一文档库，但旧的内容库跳转仍然沿用 `/main/library`。
  - 缺少独立的 `/main/content-library` 正式入口，导致搜索、Peek、PBL、Agent 几条链路都把“内容库项详情”错误地指向了文档库页面。
- **正确做法**:
  - 统一文档库固定使用 `/main/library`。
  - 内容库固定使用 `/main/content-library`，详情继续走 `?itemId=...` 抽屉模式。
  - 全局搜索、Peek、PBL、Agent 里所有指向内容库项的 `route` / `href` 必须统一映射到 `/main/content-library`。
- **后续避免**:
  - 任何新入口接入内容库时，先核对“目标是文档 document 还是内容库 item”，不要共用 `/main/library`。
  - 合并分支后优先重跑一条真实链路：`Cmd+K -> 搜索结果 -> Peek -> 打开详情`，确认 URL 与最终页面壳层一致。
- **状态**: 已修复

## 模式 36: Agent 右侧统一文档引导请求在开发态重复触发，导致无意义的双 POST /api/documents
- **症状**:
  - 点击 Agent 引用块打开右侧文档时，网络面板里会连续出现两次 `POST /api/documents`。
  - 页面虽能正常打开编辑器，但会造成多余请求、状态抖动，首屏更容易短暂显示“有未保存修改”。
- **根因**:
  - `ArtifactDocumentView` 的“确保 backing document 存在”逻辑直接放在 effect 里，缺少同一 `sourceMessageId` 级别的 in-flight 去重。
  - 开发态 React 严格模式 / 重挂载时，同一初始化流程被执行两次。
- **正确做法**:
  - 对 `sourceMessageId` 维度的引导请求做前端 in-flight promise 复用，并加短 TTL 结果缓存，避免同一轮挂载内重复 POST。
  - 文档初次回填到编辑器时，要跳过一次本地 HTML 回声保存，避免刚加载就误判为脏状态。
- **后续避免**:
  - 改 Agent 右侧 Canvas 与统一文档桥接逻辑后，必须检查首轮打开是否只出现一次 `POST /api/documents`。
  - 回归基线固定包含：`Agent 引用块 -> 右侧编辑器 -> autosave -> 内容库回读`。
- **状态**: 已修复

## 模式 35: TipTap 本地输入被父层 html 回声重新喂回，导致打一字就失焦或滚动乱跳
- **症状**:
  - 老师在文档里连续输入时，经常只能打进一个字符，随后焦点掉回页面或必须重新点击才能继续输入。
  - 有时不会回到顶部，而是直接把滚动送到文档底部，本质上仍然是同一条问题链。
- **根因**:
  - `TiptapDocumentEditor` 把 `html` 内容本身放进 `useEditor(...)` 的重建依赖，或在 `onUpdate -> onHtmlChange -> 父层 state -> html prop` 的本地回声里再次执行 `editor.commands.setContent(...)`。
  - 如果回声前后采用了不同的规范化口径（例如本地 `editor.getHTML()` 含 TipTap 表格包装，而父层状态先做 `sanitize`），编辑器会把自己的本地输入误判成“外部新内容”，然后重置 selection / scroll。
- **正确做法**:
  - 不要用 `html` 内容本身作为 `useEditor` 的重建依赖。
  - 本地输入回声必须通过 `lastLocalExternalBodyHtmlRef` 一类机制短路，确认这是本地刚刚发出的内容时，禁止再次 `setContent(...)`。
  - 比较当前编辑器内容与外部 `html` prop 时，必须使用同一套规范化函数，而不是一边 raw HTML、一边 sanitize 后的 HTML。
  - 如果确实需要因为远端更新执行一次 `editor.commands.setContent(...)`，要先快照当前 selection 与滚动容器的 `scrollTop`，回灌后再恢复；否则 autosave / 父层回声很容易把光标送到文末或后续章节。
- **后续避免**:
  - 修改 `TiptapDocumentEditor` 的受控/半受控逻辑后，必须重跑 `scripts/ux/verify-tiptap-edit-focus.mjs`。
  - 验收至少覆盖两类场景：顶部连续输入不跳底、保存后内容库回读包含新文本。
- **状态**: 已固化为验收基线

## 模式 34: TipTap 菜单验收误把“原生选区变化”当成“功能失效”
- **症状**:
  - 点击粗体/斜体/下划线/高亮后，自动化读取 `window.getSelection()` 发现选区已折叠，于是误判按钮没生效。
  - Content AI 快捷改写点“放弃”后，脚本或人工又点一次 `AI 修改`，结果把已经打开的面板关掉，再误判成输入框/执行按钮消失。
- **根因**:
  - TipTap 的格式命令生效后，浏览器原生选区可能立即折叠，但 DOM 已经完成 `<strong>/<em>/<u>/<mark>` 包裹；继续用“点击后马上读取原生选区 HTML”做断言会误报。
  - 当前 BubbleMenu 的 `AI 修改` 按钮是 toggle 行为；放弃预览只会清掉 AI 结果，不会自动关闭面板。
- **正确做法**:
  - 验收格式按钮时，直接检查 `.ProseMirror` 里目标短语是否被对应标签包裹，不要依赖点击后的原生选区片段。
  - 验收 Content AI 时，先判断输入框是否仍可见；若已可见，直接复用当前面板继续输入，不要再次点击 `AI 修改`。
  - `改内容` 的官方链路应以 `POST https://api.tiptap.dev/v1/ai/*` 为准；`改结构` 仍是本地 `/api/doc/edit-html`，两者不要混判。
- **后续避免**:
  - TipTap 菜单回归优先复用 `scripts/ux/verify-tiptap-menu-actions.mjs` 的判定方式。
  - 任何新菜单动作接入后，都按“格式按钮 -> Content AI 快捷动作 -> 自定义提示 -> 结构编辑 -> 删除块 -> 保存”的顺序跑一遍真实 L1。
- **状态**: 已固化为验收基线

## 模式 33: 通用文档 Skill prompt 误用 worksheet 模板，导致 Rubric 长成题单
- **症状**: 老师明明要生成 Rubric，但模型输出里混入题号、题干、答案区，或者右侧看起来像 worksheet / 四道习题而不是评分矩阵。
- **根因**: `/api/agent/chat` 在文档类 tool 后补注入 HTML Skill prompt 时，错误地把所有文档都套成 `worksheet` 规则，没有按当前任务选择 `rubric / lesson-plan / exercises / exam` 对应模板。
- **正确做法**: 文档 Skill prompt 必须根据当前意图或刚刚调用过的 tool 动态选择文档类型；Rubric 还需要额外约束“只输出评分矩阵，不输出题目、答案键或答题区”。
- **后续避免**:
  - 修改通用 Agent system prompt 时，先核对当前注入的是哪一类 `data-doc-type` 规则，而不是默认沿用旧模板。
  - 文档类产物新增或重构后，至少重跑一次 `/main/agent` 的真实 Rubric 生成与右侧 Canvas 验收，确认“生成物类型 -> skill prompt -> 右侧视图”三者一致。
- **状态**: 已修复

## 模式 1: API Route 引入 UI 层代码
- **症状**: 在 `app/api/**/route.ts` 里导入 `@/components/*` 或 `@/hooks/*`。
- **根因**: 把前端状态/展示逻辑误带入后端。
- **harness 修复**: `scripts/check-architecture.ts` 增加静态扫描并阻断。
- **状态**: 已修复

## 模式 2: API Route 使用相对路径导入
- **症状**: `app/api/**` 出现 `../` 或 `./` 导入。
- **根因**: 快速改动导致路径漂移，重构后易断。
- **harness 修复**: 强制 API Route 使用 `@/` 别名。
- **状态**: 已修复

## 模式 3: API Route 直接运行时导入 Supabase SDK
- **症状**: Route 内直接 `import { createClient } from "@supabase/supabase-js"`。
- **根因**: 跳过统一上下文封装，出现权限与 cookie 处理不一致。
- **harness 修复**: 架构检查脚本限制为 `lib/supabase/*` 入口。
- **状态**: 已修复

## 模式 4: 领域层反向依赖 UI 类型
- **症状**: `lib/*` 直接引用 `components/*/types`。
- **根因**: 历史上以页面类型为中心迭代，未抽离共享类型层。
- **harness 修复**: `chatflow` 共享类型已提升到 `types/chatflow.ts`，UI 侧只做 re-export；`scripts/check-architecture.ts` 已新增 `lib -> components` 静态阻断。
- **状态**: 已修复

## 模式 5: Onboarding middleware 把 API 一起重定向
- **症状**: 前端请求 `/api/account/onboarding` 收到 HTML，客户端再报 `Cannot read properties of undefined`。
- **根因**: 页面级 onboarding gate 没有排除 `/api/**`。
- **harness 修复**: `middleware` 与 `lib/supabase/middleware.ts` 显式排除 `/api/**`，API 自己返回 JSON。
- **状态**: 已修复

## 模式 6: 退出登录打断中的请求导致 401 console error
- **症状**: 退出后偶发 `GET /api/account/profile`、`GET /api/curriculum/options` 401，UX 验证失败。
- **根因**: 客户端仍在发请求，同时 `router.replace()` + `router.refresh()` 打断跳转。
- **harness 修复**: 登出前广播 `deskmate-auth-signing-out` 中止请求，最后使用硬跳转。
- **状态**: 已修复

## 模式 7: 认证成功的 303 被误判成失败
- **症状**: 邮箱验证脚本把成功当失败。
- **根因**: `/auth/v1/verify` 的成功语义是 303 跳转，不是 2xx。
- **harness 修复**: 验收脚本按接口语义接受 303。
- **状态**: 已修复

## 模式 8: 登录页 hydration 前原生提交造成假性 404
- **症状**: 自动化点登录时偶发 `/auth/login` 404 console error。
- **根因**: React hydration 完成前触发了原生表单提交。
- **harness 修复**: 登录/注册页增加 `form[data-auth-ready=\"true\"]`，验收脚本先等 ready 再交互。
- **状态**: 已修复

## 模式 9: Next.js HMR 污染导致多 API 同时 500
- **症状**: `/api/chat/conversations`、`/api/teacher-memory` 等突然同时 500，栈里是 `__webpack_modules__[moduleId] is not a function`。
- **根因**: 开发态连续热更新把 dev bundle 弄脏。
- **harness 修复**: 排障时先完整重启 `npm run dev`，不要把它误判成数据库或业务逻辑故障。
- **状态**: 已固化为排障基线

## 模式 9.1: 顶层常量初始化顺序修好后，旧 HMR 会话仍然继续白屏
- **症状**: 页面一开始报 `ReferenceError: Cannot access '<const>' before initialization`，代码顺序修好后，现有浏览器标签页仍显示“主工作区加载失败”或统一编辑器白屏。
- **根因**: 顶层模块初始化错误已经进入当前 HMR 会话，修复源码后，旧标签页仍可能保留损坏的模块状态。
- **harness 修复**: 先修正源码里的顶层声明顺序，再对现有标签页执行强制刷新；如果仍复现，再完整重启 `npm run dev`。不要把修复后的残留白屏误判成“代码仍未生效”。
- **状态**: 已固化为排障基线

## 模式 10: OpenRouter 结构化 / tool 调用误走原生 Anthropic
- **症状**: PBL 概览报 `output_config.format.schema` 400，随后错误回退到原生 Anthropic / Moonshot。
- **根因**: 业务最终约束直接塞进 provider schema，且旧版 `callTool` 会让 Claude 工具调用绕过统一 AI SDK 管道。
- **harness 修复**: provider schema 放宽，业务层本地二次裁剪；Claude/OpenRouter/Moonshot 常规 tool calling 统一收口到 Vercel AI SDK，Kimi 只保留兼容回退。
- **状态**: 已修复

## 模式 11: UI 看起来生成了习题，但数据库没有落库
- **症状**: 聊天里已经显示题目，`public.exercises` 与 `content_library_items` 仍是 0。
- **根因**: 只是模型自由输出文本，没有显式走 exercises save pipeline。
- **harness 修复**: 识别到题目生成意图时必须显式执行 `runApExercisePipeline -> saveExercises -> syncExerciseContentLibraryItem`。
- **状态**: 已修复

## 模式 12: Lesson Plan 质量审查成为单点故障
- **症状**: Agent 里偶发 500，报“教案质量审查失败，请重试”。
- **根因**: 结构化质量审查结果被当成主流程前置条件。
- **harness 修复**: 审查失败时回退到文本解析或本地规则审查，正文与归档继续完成。
- **状态**: 已修复

## 模式 13: PBL 生成没有时间预算
- **症状**: 概览或展开卡 90 秒到 200 秒，前端长期 loading。
- **根因**: 大模型结构化生成与 legacy fallback 都没有 SLA 约束。
- **harness 修复**: 概览/展开设置明确超时，超时后回退到真实模板骨架继续落库。
- **状态**: 已修复

## 模式 14: 素材上传表面成功，后端实际拿不到 prompt
- **症状**: 文件看起来上传了，但后端没有拿到 prompt，chatbox 里也看不到已选附件。
- **根因**: 前端发的是 `payload` JSON，后端只读散落字段；UI 没展示附件 chip。
- **harness 修复**: multipart 统一优先解析 `payload`，并强制在 chatbox 上方显示附件 chip。
- **状态**: 已修复

## 模式 15: 附件反客为主，覆盖用户真实任务类型
- **症状**: 素材上传后直接发送，系统默认走教案或 preflight 误追问。
- **根因**: 前端把“有附件”等同于“可直接发”，后端又把附件当成任务主信号。
- **harness 修复**: prompt 决定任务类型，附件只作为上下文增强。
- **状态**: 已修复

## 模式 16: DevTools MCP 不稳定时误判页面故障
- **症状**: CDP `Transport closed`，验收中断。
- **根因**: 本地 DevTools MCP 连接不稳定，不属于业务代码问题。
- **harness 修复**: 真实联调改用 Playwright + 数据库核查，报告里明确替代方案。
- **状态**: 已固化为验收基线

## 模式 17: 视觉链路只认 `ANTHROPIC_API_KEY`
- **症状**: 本地只有 OpenRouter 时，PDF 拆题或微信图片分析退回低质量路径，甚至直接提示未启用。
- **根因**: 业务层直接判断 `ANTHROPIC_API_KEY` 或直接绑 `getAnthropicProvider()`。
- **harness 修复**: 统一通过领域 adapter 判断视觉能力；只要 `resolveLanguageModel(...)` 可解析，就视为可用。
- **状态**: 已修复

## 模式 18: Vision 文本里有 `[IMAGE]`，页面却仍然没有真实图片
- **症状**: 模型描述里提到了题图或图表，但前端无法渲染图片。
- **根因**: 没有把 PDF 页面中的 figure/option 区域裁成图片并存储成 URL。
- **harness 修复**: 版面检测后裁切区域，写入 bucket，并把 URL 回填到 `linkedFigures` 或选项 markdown image。
- **状态**: 已修复

## 模式 19: 表单页 hydration mismatch 被误当成业务错误
- **症状**: `/main/scheduler` 或 `/main/wechat-editor` 首屏出现 hydration mismatch console error。
- **根因**: 开发态 SSR 与客户端接管时，浏览器注入属性或 textarea/input 非业务差异导致 mismatch。
- **harness 修复**: 对已确认的非业务属性差异显式加 `suppressHydrationWarning`。
- **补充约束**:
  - 像 `DocumentSectionNav` 这种“从 HTML 字符串派生导航结构”的组件，不能只在浏览器里依赖 `DOMParser` 或 `document` 才能算出结果。
  - 这类派生数据必须在服务端与客户端共享同一套纯字符串解析逻辑，否则服务端先渲染成 `null`、客户端再补出完整导航，开发态会稳定报 hydration mismatch。
- **状态**: 已修复

## 模式 20: AGENTS.md 漂移成运行手册
- **症状**: `AGENTS.md` 累积大量运行基线、页面细节、回归台账，阅读成本不断升高。
- **根因**: 把所有项目知识都继续堆进 AGENTS，而不是回流到 `docs/*`。
- **harness 修复**: 恢复 AGENTS 为轻量地图；运行基线、前端现状、错误飞轮分别沉淀到 `docs/runbooks/runtime-baselines.md`、`docs/frontend-overview.md`、`docs/error-patterns.md`。
- **状态**: 已修复

## 模式 21: 旧自动化教师账号失效，导致移动端 UX 脚本卡在登录后跳转
- **症状**: `verify-mobile-shell-navigation.mjs` 停在 `waitForURL('/main/agent')`，表面像主壳没跳转。
- **根因**: 脚本默认账号已经失效或状态漂移，登录请求没有真正进入已完成引导的教师工作台。
- **harness 修复**: 默认回归账号统一切到当前可用的教师账号；排障时先验证账号是否仍可登录，不要先改页面跳转逻辑。
- **状态**: 已固化为验收基线

## 模式 22: AUTH_BYPASS 看起来已登录，但真实写库阶段因教师身份缺失而 500
- **症状**: `/main/agent`、内容生成或记忆写入在 bypass 环境里偶发 500，日志里出现 bypass 教师不存在、外键失败或找不到 `auth.users/public.teachers` 记录。
- **根因**: 只有 `AUTH_BYPASS_USER_ID`，但本地 `auth.users` / `public.teachers` 没有对应记录；页面表面”像是登录了”，真实写库时仍会失败。
- **harness 修复**: 在 bypass 模式统一先通过 `lib/teachers/ensure-teacher.ts` 自动 provision auth 用户与教师记录，再进入真实写库链路。
- **状态**: 已修复

## 模式 23: 内容库表缺失把 Agent 主生成链路误打成 500
- **症状**: Agent 已经成功生成并保存 exercises，但内容库同步阶段把整条 `/api/agent/chat` 打成 500。
- **根因**: 本地环境缺少 `content_library_items` 表，或 PostgREST schema cache 未刷新；附属归档链路被当成主链路硬依赖。
- **harness 修复**: 习题主链路先保证 assistant 文本与 `public.exercises` 落库成功；若检测到内容库表不可用，仅记录 warning 并跳过同步。
- **状态**: 已修复

## 模式 24: assistant store schema cache 缺失导致聊天主链路提前 500
- **症状**: `/api/chat/conversations`、`/api/agent/chat` 在进入真实生成前就报 500，日志里是 `assistant_conversations` / `assistant_messages` 的 `PGRST205`。
- **根因**: 当前环境的 PostgREST schema cache 缺少 assistant store 这组表；会话存储属于附属链路，却被当成主链路硬依赖。
- **harness 修复**: 仅在确认是 assistant store 的 schema cache 缺失时，降级到 `tmp/assistant-store.json` 本地 fallback，保证 `preflight -> chat -> exercises` 继续执行；其他数据库错误保持原样抛出。
- **状态**: 已修复

## 模式 25: follow-up 已明确 topic，却仍重复追问 Unit
- **症状**: 老师先说”帮我出 5 道 AP Calculus 选择题”，系统先追问 `Unit`；再补一句”Chain rule 习题”后，系统仍继续重复问 `Unit`。
- **根因**: curriculum resolver 只能识别显式 `Unit` 或”当前 Unit 内的 topic”，不会做 `topic -> unit` 的反推，所以明明已经识别到 `The Chain Rule`，仍把 `unit` 视作缺失。
- **harness 修复**: 在 `lib/agent/exercise-curriculum.ts` 中先对 course 下所有 topics 做排序命中，并在命中 topic 时反推出所属 unit；本地回归脚本 `tests/followup/agent-preflight.spec.ts` 与 `scripts/ux/verify-agent-intent-planner.mjs` 必须覆盖 `Chain rule -> Unit 3` 场景。
- **状态**: 已修复

## 模式 26: 习题直出链路功能正确，但 `/api/agent/chat` 慢到 60s+
- **症状**: 页面上最终能生成并保存 3 道题，`topic -> course/unit` 也推断正确，但 UX 报告仍 FAIL，关键原因是 `POST /api/agent/chat` 长时间停在 60-70s。
- **根因**:
  - 习题流水线误复用了主聊天模型 `claude-sonnet-4.6`，而不是 `assistant_exercises` 对应的 task model。
  - 内容库同步与 teacher memory 写入被串行放在响应前，老师必须等这些附加副作用完成后才能看到结果。
- **harness 修复**:
  - `runApExercisePipeline` 的调用方统一改走 `assistant_exercises` task model，不再直接复用 agent chat 主模型。
  - `/api/agent/chat` 里习题分支的内容库同步与 memory tracking 统一下沉到 `after()`，主链路只保留”生成 -> 真写 exercises -> assistant message”。
  - L1 脚本 `scripts/ux/verify-agent-intent-planner.mjs` 必须同时断言功能正确与 `POST /api/agent/chat <= 30s`。
- **状态**: 已修复

## 模式 27: 教案生成其实走“引用块 + Canvas”，却被误按聊天正文长度判失败
- **症状**: `/main/agent` 里教案已经成功生成，但 UX 脚本仍然判 FAIL，报告里表现为“聊天气泡正文太短”或“没有出现完整教案正文”。
- **根因**: 主工作台的正式交互约定是“左侧聊天只显示产物引用块预览，完整正文在右侧 Canvas 打开”；如果验收脚本仍拿聊天气泡正文做最终 DOM 断言，就会误把正确行为判成失败。
- **harness 修复**:
  - 教案回归脚本 `scripts/ux/verify-agent-lesson-plan-speed.mjs` 必须改成验证“引用块可见 -> 点击后 Canvas 标题与正文可见”。
  - 数据流交叉验证应以 `/api/agent/chat` 的 markdown 片段对 Canvas 正文做校验，而不是对聊天预览文本做校验。
- **状态**: 已修复

## 模式 28: 聊天消息区用整块贴底布局，进入对话态后可拖出大片空白
- **症状**: `/main/agent` 一进入对话态，页面或消息区仍然能继续向下拖很长，底部出现明显空白。
- **根因**: 聊天滚动容器内部用了整块 `min-h-full + justify-end` 的贴底布局，短对话场景下容易制造假的滚动空间；同时 `overscroll` 控制过松时，会把这种空白感放大。
- **harness 修复**:

## 模式 29: 问候语被误判成自定义任务，直接进入执行态
- **症状**: 老师只输入 `hi / hello / 你好`，`/api/agent/preflight` 却返回 `ready`，并生成“已补全关键偏好：按自定义目标处理...”这类执行文案，甚至继续触发正式 `/api/agent/chat`。
- **根因**:
  - greeting-only 输入被当成短 follow-up，错误继承了上一轮的课程/数量上下文。
  - planner / fallback 对 `custom` 动作清洗不够，导致 `hi` 这类文本被当成可执行 action。
- **harness 修复**:
  - 在 `lib/agent/preflight.ts` 中对 greeting-only 输入提前短路成 `needs_info`，统一回到 action 选择引导。
  - `extractConversationCarryForwardAnswers(...)` 对纯问候语禁用上下文继承。
  - `sanitizePlannerInferredAnswers(...)` 对无真实任务信号的 `custom` action 做清洗。
  - 回归至少覆盖 `tests/followup/agent-preflight.spec.ts` 与 `scripts/ux/verify-agent-greeting-memory.mjs`。
- **状态**: 已修复

## 模式 30: teacher_memory_jobs 代码已接入，但本地数据库没打迁移
- **症状**: 正常聊天时页面提示 `Could not find the table 'public.teacher_memory_jobs' in the schema cache`，老师看起来像是“记忆功能坏了”。
- **根因**: 代码已经开始写 `teacher_memory_jobs / teacher_memory_mutations`，但本地 Supabase 仍停留在旧 schema，PostgREST schema cache 里根本没有这两张表。
- **harness 修复**:
  - 新迁移 `supabase/migrations/20260312123000_teacher_memory_jobs_and_mutations.sql` 必须与代码一同应用。
  - 交付前固定执行 `supabase migration list --local`，确认本地/远端 migration 对齐。
  - 真实回归需额外核对 `teacher_memory_jobs` 与 `teacher_memory_mutations` 至少各有一条新记录，不只看前端不报错。
- **状态**: 已修复
  - 消息滚动容器强制 `min-h-0 + overscroll-none`，内部改为普通纵向流布局，再用内层 `mt-auto` 负责贴底。
  - 新增 UX 回归脚本 `scripts/ux/verify-agent-chat-scroll-lock.mjs`，同时校验页面根节点滚动、消息区额外滚动高度和结果可见性。
- **状态**: 已修复

## 模式 29: PDF 主工作台真实上传链路已通，但自动化一直卡在隐藏 file input
- **症状**: `/main/agent` 里手动上传 PDF 能正常拆题，但自动化脚本用 `setInputFiles`、`filechooser` 甚至 CDP 设置文件后，页面仍看不到待上传文件，导致误判成上传失败。
- **根因**:
  - 当前主工作台的扫描上传入口是隐藏 file input，浏览器自动化对这类 input 的驱动在本项目开发态不稳定。
  - 同时主工作台的最终结果不在聊天气泡正文里，而是在“引用块 -> 右侧 Canvas”的正式产物交互里；如果脚本仍等待聊天区直接出现结构化题目卡片，会进一步误判。
- **harness 修复**:
  - 先重试 `chrome-devtools`；若 MCP 仍是 `Transport closed`，回退到 Playwright 真浏览器。
  - 开发态允许通过 `deskmate-agent-inject-scan-file` 事件把 PDF 放入待上传状态，再点击发送；但后续仍必须真实走 `/api/pdf/upload-scan -> /api/pdf/scan-status -> /api/pdf/process-scan -> /api/pdf/save-scan-questions`。
  - 最终 DOM 验证必须改成“聊天里出现产物引用块 -> 点击 -> 右侧 Canvas 的 `ScanStructuredResult` 可见”，并用 `stats.total` / `questions[0].content` 对 Canvas 文本做交叉验证。
- **状态**: 已修复

## 模式 30: OpenRouter Gemini 结构化返回比 schema 松，答案键推断 500
- **症状**: `/api/grading/sessions/:id/answer-key/infer` 命中 Gemini 后返回 500；日志里常见 `INVALID_ARGUMENT`、`expected object, received array`，或者 Gemini 明明回答了答案键却因为 `questionText`/rubric 字段不完整被 Zod 拒绝。
- **根因**:
  - OpenRouter + Gemini 在结构化模式下不总是严格遵守 `Output.object(...)`，常见返回是顶层数组而不是 `{ answerKey: [...] }`。

## 模式 31: 意图解析默认值被误当成检索硬过滤，导致题库/组卷候选题被筛空
- **症状**: 老师只是说“从题库里组一套 worksheet”或“从我的题库里找现成题”，并没有明确要求题型/难度，但后端检索仍偷偷带上 `MC` 或 `difficulty=2`，最终报“没有找到可用于组卷的候选题”。
- **根因**:
  - `parseIntentFromText(...)` 会给习题场景补默认值（例如 `exerciseType=MC`、`difficulty=2`）。
  - 这些默认值适合“生成新题蓝图”，不适合“检索现成题/自动组卷”的结构化过滤。
  - 一旦把默认值直接传给题库检索或 worksheet 组卷，真实候选题会被过度筛掉。
- **正确做法**:
  - 检索型链路只使用“用户明确提到”的题型/难度作为硬过滤。
  - 显式题源文件名（如 `xxx.pdf`）要高优先级精确召回；宁可题量不足，也不要混入其他来源补齐。
  - 当前基线实现见：
    - `lib/chat/intent.ts` 的 `inferExplicitExerciseType* / inferExplicitDifficulty*`
    - `app/api/agent/chat/route.ts` 的 worksheet 直通路径
    - `lib/agent/chat-tools.ts` 的 `search_question_bank`
    - `lib/worksheet/assemble.ts` 的显式题源召回
- **后续避免**:
  - 凡是“从题库调题 / 自动组卷 / 相似题检索”这类 retrieval flow，优先检查是否误用了 parser 默认值。
  - 回归至少重跑 `scripts/ux/verify-agent-question-bank-retrieval.mjs` 与 `scripts/ux/verify-agent-question-bank-worksheet.mjs`。
- **状态**: 已修复
  - rubric 维度可能只回 `dimension/weight`，不回 `name/description`；`questionText` 也可能依赖上游题干 hint 而被省略。
- **harness 修复**:
  - `lib/ai/gateway.ts` 对 OpenRouter Gemini 的 structured 输出走 JSON object 兼容分支，并允许“单字段对象 + 顶层数组”的自动包裹。
  - `lib/grading/answer-key-inference.ts` 的推断 schema 放宽到可接受缺省 `questionText`、稀疏 rubric 字段，再由 normalize 阶段回填默认值。
  - 回归必须覆盖 `scripts/ux/verify-grading-smart-ocr.mjs`，确认 `POST /answer-key/infer` 在 30s 内成功并渲染题目数/复核数。
- **状态**: 已修复

## 模式 31: 判卷 OCR 固定中文提取，跨学科/英文题识别质量下滑
- **症状**: 生物、历史、数学英文答卷上传后，OCR 经常漏题号、公式被改写成口语，或者把图示题硬识别成普通文本。
- **根因**: `lib/grading/ocr.ts` 过去固定传 `zh-CN`，且 Gemini OCR prompt 没有带题目上下文，导致模型只能盲猜语言、题型和题号映射。
- **harness 修复**:
  - 从答案键推断阶段开始补齐 `responseMode / subjectHint / languageHint / sourceQuestionType / knowledgePoints`。
  - OCR 调用统一把 `sessionTitle + answerKey questionContext` 传入 Gemini，并根据答案键自动推断识别语言。
  - 图示题要求保守描述关键结构，数学题要求保留公式原样。
- **状态**: 已修复

## 模式 32: 智能判卷功能正确，但 `POST /answer-key/infer` 超过 30s
- **症状**: 页面最终能成功生成答案键并完成判卷，但 L1 UX 报告因为 `POST /api/grading/sessions/:id/answer-key/infer` 超过 30 秒而 FAIL。
- **根因**: 题目卷到 provisional answer key 的结构化推断默认走了较重的 Gemini Pro 档位，且 token 预算偏大；对 1-2 页题目卷属于过度配置。
- **harness 修复**:
  - `grading_extract_answer` 默认切到 `gemini-3-flash-preview`，并由 `provider-registry` 优先路由到 Google 官方 API；旧 `gemini-3-pro-preview` 会自动升到 `gemini-3.1-pro-preview`，不存在的 `gemini-3.1-flash-preview` 会规范化到 `gemini-3.1-flash-lite-preview`。

## 模式 33: OCR Markdown 标题把 2 题误拆成 4 题，预算越调越坏
- **症状**:
  - `verify-grading-smart-ocr.mjs` 里明明只上传了 2 题题目卷，但 `answer-key/infer.analysis.totalQuestions` 变成 4。
  - 题干、选项、补充说明被拆成多题，随后 `auto-grade` 变慢甚至超时。
- **根因**:
  - Mistral OCR 会把题号写成 `## 1. Multiple Choice`、`## 2. Free Response` 这类 Markdown 标题。
  - `lib/pdf-scan/question-parser.ts` 过去没有先去掉 `# / ##` 前缀，也没有剥离 `Multiple Choice / Free Response` 这样的分区标题。
  - 结果题号识别退化为按段落兜底分割，把“题干 / 选项 / 同题补充说明”拆成多题。
- **正确做法**:
  - 先在 `sanitizeOcrQuestionText(...)` 里归一化 Markdown heading，再在 `normalizeQuestionBody(...)` 里剥离分区标题。
  - 先保证题量和题型语义正确，再讨论 `ocrMs / gradingMs` 预算；不要用加超时掩盖解析质量问题。
  - 回归至少覆盖 `tests/followup/pdf-question-parser.spec.ts` 和 `scripts/ux/verify-grading-smart-ocr.mjs`。
- **状态**: 已修复

## 模式 34: `npm run build` 覆盖 dev 产物后，登录页看起来正常但静态资源 404
- **症状**:
  - `/auth/login` 返回 HTML 正常，但浏览器里 `/_next/static/*` 持续 404。
  - `form[data-auth-ready="true"]` 一直不出现，自动化脚本卡死在 hydration ready。
- **根因**:
  - 正在运行的 `next dev` 进程和磁盘上的 `.next` 产物错位，常见于开发服务运行中又直接执行了 `npm run build`。
  - 这时页面骨架能返回，但 hydration 所需的 dev chunk 已失配。
- **正确做法**:
  - 不要先改登录页或认证逻辑，先重启 `npm run dev`。
  - 需要做生产构建时，先结束正在监听的 `3001` 开发进程；构建完成后再恢复 `npm run dev`。
  - UX 验收如果看到“HTML 正常 + 静态资源 404 + ready 标记不出现”的组合信号，优先按这个模式排查。
- **状态**: 已修复 / 已固化为运行基线
 - **状态**: 已修复

## 模式 33: 页面显示成功，但 `after()` 后台写入静默失败
- **症状**: 聊天里已经看到教案/习题/组卷结果，但刷新后内容库、长期记忆或附属记录缺失，前端没有明显报错。
- **根因**: 过去直接裸用 `after()`，后台副作用失败时只在日志里丢失，没有统一失败记录与补救入口。
- **harness 修复**:
  - 关键后台副作用统一改走 `scheduleReliableAfterTask(...)`。
  - 失败必须落库到 `background_task_failures`，不能只留 `console.error`。
  - 排障顺序固定为：先看主表是否已写，再查 `background_task_failures`，最后才看 UI。
- **状态**: 已修复

## 模式 34: 判卷超过 30 秒时前台像卡死，老师不知道系统是否还活着
- **症状**: `/main/grading` 点击“智能生成答案键”或“一键智能判卷”后长时间无响应；用户只能看到 loading，分不清是慢还是已经挂了。
- **根因**: 长判卷链过去完全绑在一个前台请求里，没有 job 层和明确的异步状态出口。
- **harness 修复**:
  - 判卷链已支持返回 `202 + job`，前端继续轮询 `/api/grading/jobs/:jobId`。
  - 后台 job 统一落 `grading_jobs`，并通过 `workflow_runs / workflow_run_steps` 记录处理步骤。
  - 本地可手动执行 `npm run grading:jobs:process` 推进 job，避免调试时误判为整条链路坏掉。
- **状态**: 已修复
  - `lib/grading/answer-key-inference.ts` 下调结构化输出 token 预算，继续保持 normalize 兜底。
  - 回归必须跑 `scripts/ux/verify-grading-smart-ocr.mjs`，同时断言 `POST /answer-key/infer <= 30s` 与 `POST /auto-grade <= 30s`。
- **状态**: 已修复

## 模式 33: UX 验证脚本指向错端口或盲等 `networkidle`，把真实可用链路误判成失败
- **症状**:
  - 页面实际可用，但脚本卡死在登录页 `form[data-auth-ready="true"]`，或大量静态资源报 `400/404`。
  - `/main/agent` 已经能看到题库结果，但脚本还在等待，最后报“数据流交叉验证失败”。
- **根因**:
  - 脚本默认 `UX_BASE_URL` 写成了历史端口 `3003`，而当前本地真实基线是 `3001`。
  - 主工作台存在持续请求，`/main/agent` 进入后硬等 `networkidle` 会造成假性超时。
  - 流式结果在“来源文件名已出现，但题干摘要和生成态尚未收尾”时就开始断言，导致把半成品误判成失败。
- **harness 修复**:
  - 所有本地 UX 脚本默认 `UX_BASE_URL` 必须与当前 runbook 基线一致；不能继续沿用旧端口。
  - `/main/agent` 与类似长连接页面，进入后统一改为等待业务元素可见，如 `agent-composer`、引用块、Canvas 标题，不再把 `networkidle` 当主等待条件。
  - 题库调题等流式场景必须等待“来源文件名 + 任一命中题干摘要/标题已可见，且生成提示消失”后再截图和做数据流交叉验证。
- **状态**: 已修复

## 模式 34: 题目生成被“题库归档课程必填”反向绑死，导致无意义 follow-up
- **症状**:
  - 老师输入“帮我生成三道chainrule习题”之类已经有明确知识点和题量的请求，页面却先追问“这套题对应哪门 AP 课程和哪个 Unit？”。
  - 实际上老师当前只想先看到题目，不是立刻决定题库归档课程。
- **根因**:
  - 旧链路把“能否先生成”与“能否立即写入 `exercises.course_id`”绑成了一件事。
  - `resolveApExerciseCurriculum()` 在 `track=general` 时直接硬返回缺课程/Unit，AI 轻量判断根本没有获得“当前是否足够执行”的决策权。
- **正确做法**:
  - 先让轻量模型判断：当前信息是否已经足够生成题目。
  - 只要知识点/题量/题型足以执行，就先生成；课程归属只影响“是否立即入库”。
  - 无法确定课程时，把保存模式降级成 `defer_until_curriculum`，文案明确提示“先生成，后归档”。
- **后续避免**:
  - 所有 follow-up 都要区分 `missing_for_execution` 和 `missing_for_save`，不能再让数据库必填字段直接反向支配对话层。
  - 回归至少覆盖 `帮我生成三道chainrule习题` 这种无课程但有明确 topic 的场景。
- **状态**: 已修复

## 模式 35A: 判卷接口已经成功，但 UX 脚本过早读取指标卡，误判成题量为 0
- **症状**:
  - `scripts/ux/verify-grading-smart-ocr.mjs` 里 `answer-key/infer` 已成功返回 `analysis.totalQuestions = 2`，但脚本读取页面卡片时还是 `0`，随后整条 L1 被误判为失败。
  - 页面几百毫秒后其实会刷新成正确值，属于“接口成功、UI 也会成功，但脚本断言太早”。
- **根因**:
  - 脚本过去直接在 job 完成后立刻读普通文本，没有绑定 React 状态真正落到 DOM 的时机。
  - 指标卡又没有稳定选择器，脚本只能模糊读 `p` 文本，容易在异步刷新窗口期拿到旧值。
- **正确做法**:
  - 给题量、复核数、质量状态提供稳定 `data-testid`，例如 `grading-metric-total-questions`、`grading-metric-review-count`、`grading-quality-status`。
  - UX 脚本拿到 API 响应后，先用 `waitForFunction(...)` 等待 DOM 指标值和 API 字段一致，再继续截图和交叉验证。
  - 交叉验证不要只看题量，还要一起验证 `analysis.qualityGate.status`，避免“题量对了但质量状态没更新”继续漏报。
- **后续避免**:
  - 所有异步 job 轮询页，凡是 UI 最终值来自二次 state flush，都不要在接口返回后立刻读 DOM。
  - 优先做“API 字段 -> 指标卡 `data-testid`”的定点交叉验证，不要用模糊文本搜索替代。
- **状态**: 已修复

## 模式 35: 删掉 Puppeteer 旧文件后，Next dev 仍拿旧依赖图导致 `/api/agent/chat` 500
- **症状**:
  - 磁盘上的 `lib/pdf/pdf-service.ts` 已经不再引用 `lib/pdf/puppeteer-manager.ts`，但浏览器里调用 `/api/agent/chat` 仍直接 500。
  - console/import trace 还在报 `Failed to read source code from .../lib/pdf/puppeteer-manager.ts`。
- **根因**:
  - 本地 `next dev` 进程仍持有旧的模块依赖图，删文件后热更新没有完全清掉缓存。
- **正确做法**:
  - 先确认磁盘上的 import 已经干净，再直接重启 `npm run dev`。
  - 不要在这种“幽灵 import”状态下继续误判业务逻辑；先清 dev server 再继续验收。
- **后续避免**:
  - 只要涉及删除/重命名底层模块文件，尤其是 `lib/pdf/*`、`lib/typst/*` 这类被 App Router 广泛引用的模块，改完后优先重启一次本地 dev server。
- **状态**: 已修复

## 模式 36: Workflow 关键状态没有写回 `tool-result`，老师和验收都分不清“已保存”还是“仅临时”
- **症状**:
  - 页面已经出现题目或 worksheet 结果，但老师无法判断本轮到底有没有入题库。
  - UX 脚本拿到正确正文后，仍因为缺少 `saveMode / saveHint / courseId / unitId` 这类关键信号而把链路判成 FAIL。
- **根因**:
  - workflow 只回正文或题块，不回“是否已保存、保存条件、课程归属”等结果级元信息。
  - 对话态、题库态、临时题池态因此在 UI 与验收层都失去边界。
- **正确做法**:
  - 直出链路的 `tool-result` 必须带足够的状态字段，至少包括：
    - `saveMode`
    - `saveHint`
    - `courseId`
    - `unitId`
  - 当前基线实现见 `lib/agent/workflows/exercise-direct.ts`。
- **后续避免**:
  - 任何“先生成再决定是否归档”的链路，都不能只看正文成功与否；必须同时验证状态字段是否完整回写。
  - 回归脚本要优先对这些状态字段做交叉验证，而不是只盯聊天文本。
- **状态**: 已修复

## 模式 37: 组卷 structured output schema 上限过紧，成功路径被 Zod `too_big` 直接打断
- **症状**:
  - `/api/agent/chat` 已经完成题目挑选和 PDF 导出，但前端始终看不到 artifact 引用块。
  - 真实 NDJSON 里出现 `summary`、`selectionReasons[*]`、`sections[*].rationale` 的 `too_big` 错误，页面最后停在“正在思考”或只剩阶段面板。
- **根因**:
  - 组卷 structured output 的字段长度上限按理想样例设得过紧。
  - 当模型正常生成更完整的分组说明或选题理由时，反而被 schema 当成非法结果整体拒绝。
- **正确做法**:
  - 放宽 worksheet assemble schema：
    - `summary: 240 -> 480`
    - `selectionReasons[*]: 120 -> 220`
    - `sections[*].rationale: 160 -> 220`
  - 当前基线实现见：
    - `lib/worksheet/assemble.ts`
    - `lib/worksheet/assemble-temp-pool.ts`
- **后续避免**:
  - 题库组卷与临时题池组卷的验收必须按“引用块 -> 右侧 Canvas -> PDF 下载”验证，不再假定下载链接直接出现在聊天正文。
  - 遇到“响应 200 但页面一直没有 artifact 引用块”的现象，优先检查 structured output schema 是否把成功结果打成了 validation error。
- **状态**: 已修复

## 模式 38: 课程已明确的出题请求被 planner 误判成“还缺 topic”，导致每轮都弹 follow-up
- **症状**:
  - 老师输入“帮我出 5 道 AP Calculus 选择题”这类已经明确课程、数量、任务类型的请求，`/main/agent` 仍先弹追问卡，继续问“具体知识点是什么”。
  - 体感上就像“每次对话都会先 follow-up 一次”，显著拖慢进入正式生成的时间。
- **根因**:
  - `intent-planner` 虽然规则里强调“能推断就不要打断”，但没有把“普通出题时课程/单元已知就足够开始执行”写成更硬的约束。
  - `lib/agent/preflight.ts` 的 planner clarify 兜底只忽略了 `curriculum / count / duration` 这类过度追问，没有兜住“已知课程却继续追问 topic”这条误判链。
- **正确做法**:
  - 在 `lib/agent/intent-planner.ts` 的系统提示词里明确：普通生成习题请求只要课程/单元已知，就不要因为没写更细的 topic 继续追问。
  - 在 `lib/agent/preflight.ts` 增加安全阀：当动作是 `generate_exercises` 且消息/上下文里已经有课程、单元或前一轮延续锚点时，直接忽略 planner 返回的 `topic` clarify，改为 `ready` 继续执行。
  - 同时保留真正模糊场景的追问，例如“帮我出题”这种既没学科也没主题的请求，仍然要追问 topic。
- **后续避免**:
  - 所有 follow-up 判断都要区分“执行所必需的信息”和“能提升质量但不是硬前置的信息”；`topic` 对普通出题请求属于后者，不要再作为默认硬门槛。
  - 浏览器验收如果要验证“泛化请求仍会追问”，必须先清掉 `agent_workspace_conversation_id` 相关本地会话键，再发新 prompt；否则上一轮课程上下文会被恢复，造成假性通过。
  - 回归至少覆盖两条链路：
    - “帮我出 5 道 AP Calculus 选择题” -> `ready`
    - “帮我出题” -> `needs_info`
- **状态**: 已修复

## 模式 39: 明明写了“先不要入库”，首轮生成仍被提前写进题库，导致 follow-up 保存链失真
- **症状**:
  - 老师首轮明明说“先不要入库”或“先生成给我看”，页面却直接出现“已真实保存 N 道题到数据库”。
  - 后续再回复“保存到题库”时，要么变成重复保存，要么因为上一轮已经入库而看起来像“保存 follow-up 没有意义”。
- **根因**:
  - `preflight` 虽然有 `taskContext.savePreference`，但习题直连工作流过去根本没有消费这个字段。
  - `handleExerciseRequest()` 只要发现 `resolveApExerciseCurriculum()` 返回 `save_now`，就会直接写库；“先不要入库/先看再保存”只停留在 prompt 文案里，没有真正生效。
  - 旧的 `scripts/ux/verify-agent-exercise-save-followup.mjs` 还写死了本地不存在的 `AP Calculus BC Unit 3`，并且没有先验证“首轮确实未入库”，容易把脚本问题和业务问题混成一个 FAIL。
- **正确做法**:
  - 在 `preflight` 明确识别保存偏好：
    - 明确说“先不要入库/先看再保存” -> `savePreference=temp_only`
    - 明确说“并保存到题库” -> `savePreference=default`
    - 普通出题未提保存 -> `savePreference=save_after_confirm`
  - 习题直连工作流必须消费这个偏好：即使课程和 Unit 已经可解析，只要偏好不是“立即保存”，首轮也只能生成题块，不得真实写库。
  - follow-up 验收必须先断言首轮 `GET /api/question-bank?sourceKind=agent_generated` 命中数仍为 `0`，再发第二轮保存请求。
- **后续避免**:
  - 以后凡是“先生成、后确认是否归档”的链路，都不能只看 `curriculum.saveMode`；还要同时看用户显式保存偏好。
  - 本地题库保存类 UX 脚本不要再写死超出 seed 的课程；当前基线应优先复用 `AP Biology Unit 3`。
  - 相关回归至少要跑：
    - `node --import tsx tests/followup/exercise-save-preference.spec.ts`
    - `scripts/ux/verify-agent-exercise-save-followup.mjs`
- **状态**: 已修复

## 模式 40: 题目已成功写入 exercises，但 taxonomy 节点创建仍按旧 schema 写 `cluster_key`，导致分类静默回退
- **症状**:
  - 页面能看到“已真实保存 N 道题到数据库”，题库里也能搜到题目，但 `knowledge_cluster / knowledge_subskill_label` 长时间为空。
  - 手动触发 `reclassifyExerciseTaxonomyWithAi(...)` 时，日志会先出现结构化输出成功，随后在创建 taxonomy 节点时报 `PGRST204` 或“创建 taxonomy 节点失败”。
- **根因**:
  - `lib/exercises/taxonomy.ts` 仍然按早期 schema 往 `question_taxonomy_nodes`、`question_taxonomy_aliases`、`exercise_taxonomy_links` 写 `cluster_key / alias_key / assessment_style` 等字段。
  - 当前真实本地 schema 以 `supabase/migrations/20260311120000_exercise_taxonomy.sql` 为准，这三个表已经没有上述列；同时 `types/database.ts` 也漂移成了旧结构，导致代码编译通过但运行时报错。
- **正确做法**:
  - 以最新 migration 和真实 `select('*')` 返回字段为准修正落库逻辑：
    - `question_taxonomy_nodes` 只写 `teacher_id / parent_node_id / node_type / canonical_key / canonical_label / normalized_label / status / created_by`
    - `question_taxonomy_aliases` 只写 `teacher_id / node_id / alias_label / normalized_label`
    - `exercise_taxonomy_links` 只写 `cluster_node_id / subskill_node_id / match_mode / confidence / reasons / raw_*`
  - 同步修 `types/database.ts`，避免以后再出现“类型允许、真实库不允许”的假安全感。
- **后续避免**:
  - 以后只要 taxonomy 表结构变更，必须同时检查：
    - `lib/exercises/taxonomy.ts`
    - `types/database.ts`
    - 至少一次本地 `select('*')` 实表核验
  - 不要再把 `cluster_key` 当作 taxonomy 新表的通用字段。
- **状态**: 已修复

## 模式 41: 短 prompt 被默认当成 continuation，导致新教案 / 组卷偷偷沿用上一轮课程与主题
- **症状**:
  - 第二次生成教案时，正文里混入上一轮的 `chain rule`、旧课程或旧 unit。
  - 输入 `语文教案`、`组一套卷子` 这类短请求时，系统没有先澄清，而是直接沿用上一轮上下文。
- **根因**:
  - `lib/agent/preflight.ts` 和 `lib/agent/workflows/worksheet-shared.ts` 过去把“短于 18 个字符”直接当成 carryover 信号。
  - `lib/context-engineering/core.ts` 对 `artifact/history` 的零重合旧上下文惩罚不够，fresh 任务也可能把旧产物选进运行时上下文。
  - `lesson-plan-direct` 在 fresh 任务里仍然把 `retrievalHint` 传进 workflow，进一步把旧检索 query 带进新教案。
- **正确做法**:
  - carryover 只能在显式 continuation 词命中时启用；短 prompt 本身不再视为延续。
  - `全新/换个/新的主题/不要沿用` 这类词必须命中统一 reset 词表，且 reset 优先级高于 continuation。
  - fresh 任务下，`artifact/history/memory` 零重合片段不能再进入 runtime context；lesson plan fresh 请求也不要再传旧 `retrievalHint`。
- **后续避免**:
  - 任何新加的 follow-up/carryover 规则，都要同时补“短 fresh prompt 不继承旧上下文”的回归。
  - 教案与组卷的 UX 验收必须至少覆盖一条“上一轮是 A，这一轮切到 B” 的隔离场景。
- **状态**: 已修复

## 模式 42: 习题链为了交互速度进入 `interactive_low_latency`，导致质量与文案一起失真
- **症状**:
  - 习题回复里出现“降级生成流程 / interactive_low_latency”。
  - 同一轮里题目质量不稳定，且聊天正文混入大量“先不入库 / 低延迟”说明，老师真正要看的题目反而被稀释。
- **根因**:
  - `lib/agent/exercise-pipeline.ts` 允许 `maxRepairRounds=0` 触发低延迟 rescue 分支。
  - 前端卡片默认只展示题干和选项，用户容易误以为“只生成了题干”。
- **正确做法**:
  - Agent 主习题链默认禁用低质量快速分支，保持 Sonnet 4.6 + 正常校验/修补流程。
  - 习题卡片至少显示 `答案` 与 `解析`，不要只留题干。
  - 非显式“保存到题库”请求不要再把保存提示和其它元信息塞进主回答正文。
- **后续避免**:
  - 新增任何快路径前，先确认是否真的不影响 `assistant_exercises` 主链质量；不能再默认拿质量换 TTFT。
  - 习题类回归要同时核对：题块可见、答案/解析可见、以及是否误入库。
- **状态**: 已修复

## 模式 41: taxonomy 后台分类已经完成，但题库页仍显示“未归类/0%”，把旧占位值误当成真实最终结果
- **症状**:
  - 题库详情里同时出现“细分知识点已归到已有小类/候选新小类”和“分类状态未归类、分类置信度 0%”。
  - 习题直存的 UX 脚本如果在 `/api/agent/chat` 后立即读题库，很容易误报“已入库但没分类”。
- **根因**:
  - 习题保存链用了 `deferPostProcessing=true`，先把 `classification_status=unreviewed` 占位写入 `exercises`，再由后台补跑 taxonomy。
  - `writeExerciseTaxonomy()` 过去只更新 `knowledge_cluster / knowledge_subskill_* / subskill_*`，没有把 `classification_confidence / classification_status / classification_reasons` 一起刷新，导致 UI 读到的是新旧两套状态拼在一起的结果。
  - 旧验收脚本也把“接口刚返回”当成最终状态，没有等待后台分类完成。
- **正确做法**:
  - taxonomy 最终写回时，统一同步刷新：
    - `classification_confidence`
    - `classification_status`
    - `classification_reasons`
  - 规则基线：
    - `matched_existing` 且高置信度 -> `auto_confirmed`
    - `candidate_new / needs_review` -> `needs_review`
    - 教师手动确认 -> `teacher_confirmed`
  - UX 验收必须轮询到题库读回结果出现 `knowledgeCluster + knowledgeSubskillLabel`，再截图和断言。
- **后续避免**:
  - 不要再把“首个保存成功响应”当成最终分类完成信号。
  - 任何题库/分类相关前端脚本都要把“最终读回状态”作为通过标准，而不是只看保存按钮和 toast。
- **状态**: 已修复

## 模式 43: `Earth Systems and Resources` 被 `source/resources` 子串误判，导致教案错误进入 research / web search 分支
- **症状**:
  - `AP Environmental Science Unit 1` 这类教案请求会被 preflight 判成 `research`，或者 lesson workflow 无故开启联网检索。
  - 对话里没有继续追问，但教案链明显变慢，甚至因为走错工具分支导致超时。
- **根因**:
  - `lib/agent/preflight.ts`、`lib/agent/task-state.ts`、`lib/agent/lesson-plan-workflow.ts` 过去直接用裸 `source|reference` 正则。
  - `Resources` 会包含 `source` 子串，像 `Earth Systems and Resources` 这种合法课题会被误命中。
- **正确做法**:
  - 英文检索词必须使用词边界：
    - `\\breferences?\\b`
    - `\\bsources?\\b`
  - lesson plan / research 分流里不能再用裸 `source` 作为命中条件。
- **后续避免**:
  - 以后任何英文意图词正则，如果可能命中正常课程名或章节名，必须先做词边界检查。
  - 新增 AP 科目后，至少补一条“课程名里含 `resource/source` 近似子串”的回归。
- **状态**: 已修复

## 模式 44: 教案验收仍按“聊天正文必须直接出现完整内容”假设等待，导致 artifact 模式下脚本假性卡死
- **症状**:
  - UI 实际已经出现教案 artifact 引用块，右侧 Canvas 也能正常展开，但 UX 脚本一直等不到 `教学目标/课时安排/导入活动` 出现在聊天正文。
  - 验收目录里只留下 `verify-1-loaded.png` 和 `verify-2-after-action.png`，第三张结果图迟迟不产出。
- **根因**:
  - `scripts/ux/verify-agent-lesson-plan-context-isolation.mjs` 假设完整教案一定会直接流进 assistant message。
  - 当前主工作台已经改成“先出 artifact 引用块，再在右侧 Canvas 看正文”的真实产品路径。
- **正确做法**:
  - 教案类 L1 验收应先等待：
    - 聊天正文出现完整教案关键字，或
    - artifact 引用块可见
  - 如果出现 artifact 引用块，应点击后再在 Canvas 中校验 `教学目标 / 课时安排 / 导入活动`。
- **后续避免**:
  - 任何基于 `/main/agent` 的验收脚本，都不能再把“正文直出”当成唯一完成信号。
  - 凡是 artifact-first 的功能，都要把“引用块 -> Canvas 正文”纳入主验证路径。
- **状态**: 已修复

## 模式 45: worksheet PDF 已真实生成，但最后一步把 `worksheets.status` 写成旧值 `ready`，导致整条链在收尾阶段失败
- **症状**:
  - Agent 题库组卷或临时题池组卷已经完成选题和 PDF 导出，但聊天里最终报“更新试卷 PDF 信息失败”。
  - 数据库里能看到 `pdf_documents` 记录或 storage 文件痕迹，但页面没有稳定出现可下载 worksheet 结果。
- **根因**:
  - `lib/pdf/pdf-storage.ts` 在 worksheet 分支里仍按旧约定回写 `worksheets.status = "ready"`。
  - 当前数据库 schema 只接受 `draft | published`，所以真正失败点不在组卷逻辑，而在 PDF 持久化后的状态回写。
- **正确做法**:
  - worksheet PDF 成功入库后，统一回写 `worksheets.status = "published"`，并同时更新 `pdf_url / pdf_path / pdf_generated_at`。
  - 如果页面上已经走到“可下载 PDF”前夕却最终报错，优先检查这层状态值漂移，不要先重写 worksheet 组卷器。
- **后续避免**:
  - 任何写业务状态枚举的代码，都必须先对齐 migration / `types/database.ts`，不能沿用历史魔法字符串。
  - worksheet 真回归除了看 `/api/agent/chat` 成功，还要补一层 `GET /api/pdf/download/:id -> %PDF-` 验证。
- **状态**: 已修复

## 模式 46: worksheet 结果已经返回，但 artifact 检测和 UX 脚本仍按旧协议，导致页面与验收同时“看起来失败”
- **症状**:
  - Assistant 文本里已经出现“已从题库组好一套试卷”或“已根据上传 PDF 临时组好一套试卷”，但左侧没有 artifact 引用块，右侧 Canvas 也打不开。
  - UX 脚本只拿到 `tool-output-available` / `data-agent-phase` 的 SSE chunk，却因为仍按旧 NDJSON 或旧 `tool-result` 解析而判定 FAIL。
- **根因**:
  - `components/main/agent/artifact-utils.ts` 过去没有把 worksheet 文本识别成正式 artifact kind。
  - `scripts/ux/verify-agent-question-bank-worksheet.mjs`、`scripts/ux/verify-agent-temp-pool-worksheet.mjs` 仍按旧协议读取，漏掉了 UI stream 的 `data:` 前缀、`toolCallId -> toolName` 回填和 `tool-output-available` 事件。
- **正确做法**:
  - worksheet 类 assistant 文本必须显式识别为 `worksheet` artifact，并在内容库保存路由里接入对应 kind。
  - `/main/agent` 相关 UX 脚本统一按 Vercel AI SDK UI stream 解析 SSE：先剥 `data:`，忽略 `[DONE]`，再处理 `tool-output-available` 与 `data-*` parts。
- **后续避免**:
  - 新增 artifact 类型时，必须同时更新三处：artifact 检测、内容库 kind 映射、对应 UX 脚本断言。
  - 新脚本不要再手写只支持 NDJSON 的 reader，优先复用现有 UI stream 解析逻辑。
- **状态**: 已修复

## 模式 47: TipTap Content AI 出现 `401 Invalid token. It's either expired or malformed.`，但根因不在 OpenAI，而在 JWT 生命周期与缓存链
- **症状**:
  - 老师点击 `润色`、`改写` 等 Content AI 动作时，右侧编辑器直接弹出 `401 Invalid token. It's either expired or malformed.`。
  - 同一页面刷新前能正常编辑文本，但 AI 修改突然全部失效，容易被误判成 OpenAI key、模型、prompt 或内容本身的问题。
- **根因**:
  - TipTap Content AI 走的是官方 `HS256 JWT + App ID` 鉴权，不是 OpenAI API Key。
  - 过去前端刷新 `/api/tiptap/jwt` 时没有显式 `no-store`，服务端路由也没禁止缓存，存在拿回旧 JWT 的风险。
  - 自动重试逻辑如果只比较 `token` 字符串是否变化，在“同一秒内重新签发”时可能得到完全相同的 JWT，导致刷新后仍不触发重试。
- **正确做法**:
  - `/api/tiptap/jwt` 路由必须 `force-dynamic + no-store`，前端请求也要显式 `cache: "no-store"`。
  - 编辑器侧把 Content AI 的当前命令、待重试命令和 JWT 刷新过程显式建模：
    - 收到 `invalid token / expired / malformed` 后，先刷新 JWT
    - JWT 刷新完成后自动重试一次，不要要求老师手动再点第二次
  - 刷新判定不要只看 token 字符串，必须有本地 `refreshKey` 之类的单调变化标记。
- **后续避免**:
  - 以后再看到 TipTap AI 的 401，先查 `/api/tiptap/jwt` 的缓存头、前端 `cache` 配置和自动重试状态，不要先去改 OpenAI 配置。
  - TipTap 相关故障验收除了正常成功路径，还应补一条“注入一次 401 后能自动恢复”的故障注入脚本。
- **状态**: 已修复

## 模式 48: TipTap 文本已选中，但高光很快消失，根因不是单纯 CSS，而是菜单按钮抢焦点 + 缺少持久选区预览
- **症状**:
  - 老师在右侧编辑器里左键拖选一段文字后，高光会很快消失，像“闪掉”一样。
  - 尤其是在 BubbleMenu 刚出现、或准备点 `AI 修改` 这类菜单按钮时，选区更容易瞬间丢失。
- **根因**:
  - 原生浏览器选区在按钮或输入框抢到焦点后，不会继续稳定显示。
  - 过去 BubbleMenu 上的按钮没有拦住 `mousedown`，浏览器会先把焦点交给按钮，再让编辑器失焦。
  - 前端虽然有 `::highlight(doc-engine-selection-preview)` 的样式，但之前并没有真正注册 `CSS.highlights` 里的持久选区高光。
  - BubbleMenu 显示条件过度依赖 `view.hasFocus()`，真实拖选后就算 DOM 内已有有效选区，也可能被误判为“不该显示菜单”。
- **正确做法**:
  - 在捕获选区时同步克隆 DOM Range，并注册到 `CSS.highlights`，作为持久选区预览层。
  - BubbleMenu 和其按钮需要拦截 `mousedown`，避免点击菜单时先把选区打掉。
  - BubbleMenu 的 `shouldShow` 不能只看编辑器 focus，还要允许“编辑器 DOM 内存在真实文本选区”作为显示条件。
- **后续避免**:
  - 再出现“选中了但高光没了”，优先检查：
    - 是否真的注册了 `CSS.highlights`
    - BubbleMenu 按钮有没有 `mousedown.preventDefault()`
    - `shouldShow` 是否过度依赖 `view.hasFocus()`
  - 这类问题的 UX 验收应至少覆盖“拖选后 800ms 内高光仍存在”的最短关键路径。
- **状态**: 已修复

## 模式 49: 右侧编辑器拖选后菜单不灵敏，且偶发高光残留，根因是 TipTap `selectionUpdate` 与浏览器原生 `selectionchange` 不同步
- **症状**:
  - 老师拖选一段文字后，BubbleMenu 有时不出现，或者要反复拖选才弹出来。
  - 另一类相反现象是：选区其实已经没了，但橙色预览高光还残留在页面上，像“拖影”一样。
- **根因**:
  - 过去前端主要依赖 TipTap / ProseMirror 的 `selectionUpdate` 更新选区状态。
  - 真实拖选结束时，浏览器原生 `selectionchange` 和 ProseMirror `selectionUpdate` 不是严格同一拍；在 race 条件下会出现：
    - DOM 里已经有选区，但编辑器状态还没跟上，于是菜单判定为“无选区”
    - DOM 选区已经清掉，但前端没有及时收到对应更新，于是持久高光没有清理
- **正确做法**:
  - 选区状态要双轨同步：
    - 继续监听 TipTap 的 `selectionUpdate`
    - 同时监听浏览器原生 `selectionchange`
  - 当 DOM 里存在有效选区但 `resolveSelectionContext()` 暂时返回空时，允许下一帧做有限次数重试，而不是立即清空状态。
  - 当浏览器原生选区消失，且 AI 面板未展开时，必须同步清掉：
    - `selectionContext`
    - `panelSelectionContext`
    - `selectionPreviewRangeRef`
    - `CSS.highlights` 里的 `doc-engine-selection-preview`
- **后续避免**:
  - 以后再改 BubbleMenu / 选区逻辑，不能只测点击按钮，要补“真实拖选后菜单是否出现”和“选区消失后高光是否清掉”两条回归。
  - 如果看到“菜单不出来”和“高光残留”同时出现，优先怀疑选区同步 race，不要先去调样式值。
- **状态**: 已修复

## 模式 50: Agent“修改上一版”跨类型误路由，明明点名改习题，却被最近的 Rubric / Worksheet 抢走
- **症状**:
  - 老师在 Agent 页明确输入“把某份 Exercise 改成 4 道题”或“把某份习题改一下”，右侧却起了 Rubric / Worksheet tab。
  - 这种问题最容易出现在最近一个 artifact 不是习题，而提示里又带了“4 道题/选择题/简答题”时。
- **根因**:
  - `lib/agent/chat-direct-dispatch.ts` 里为了解决“worksheet 改成 4 道题”被误判成 exercises，增加了“优先沿用最近 artifact workflow”的保护。
  - 这层保护如果只看“最近 artifact 是什么”，不看当前提示本身更像在点名哪一类产物，就会把真正想改的 Exercise 错拉回最近的 Rubric / Worksheet。
- **正确做法**:
  - 继续保留“最近 artifact workflow 兜底”，但只能在当前提示没有明确暴露其它产物类型时生效。
  - 分流前必须先做一层 `prompt workflow hint`：
    - `worksheet / 试卷 / 组卷` 优先归 `worksheet`
    - `rubric / 评分量表 / 评分标准` 优先归 `rubric`
    - `教案 / lesson plan / 微课` 优先归 `lesson-plan`
    - `exercise / 习题 / 试题 / 选择题 / 简答题` 优先归 `exercises`
  - 只有当当前提示没有明确 hint，且确实像“修改上一版”时，才允许用最近 artifact workflow 覆盖误判成的 exercises。
- **后续避免**:
  - 以后再加 continuation 路由保护时，不能只验证“上一版 worksheet 改题数”这一条，还要补“最近 artifact 是 Rubric，但老师明确点名改 Exercise”这类反例。
  - Agent 页的跨类型 follow-up 验收至少要覆盖：
    - `最近是 rubric，修改 exercise`
    - `最近是 exercise，整理 worksheet`
    - `最近是 worksheet，继续改 worksheet`
- **状态**: 已修复

## 模式 51: 右侧 Canvas 已能把习题 Markdown 渲染出来，但 AP 习题流水线仍判“解析失败”
- **症状**:
  - Agent 页里右侧 Canvas 已经能看到题目一题题流出来，甚至正文已经排版可读。
  - 但后端流水线最后仍抛出 `AP 习题流水线失败：Expected property name or '}' in JSON ...`，导致本轮无法落库或写回正式 artifact。
- **根因**:
  - 习题流水线的 `parseMarkdownExercisesFromText()` 与前端/文档引擎正在使用的 `buildExercisesDocumentFromMarkdown()` 不是同一套规则。
  - 一旦模型输出里混入了更自由的 Markdown 结构、块引用或修正说明，Canvas 还能靠文档引擎把内容渲染出来，但流水线自己的解析器会返回空数组，随后错误地回退到 JSON 解析并报错。
- **正确做法**:
  - 不要继续叠加第三套 / 第四套解析规则。
  - 当流水线自己的 Markdown 解析失败时，优先复用文档引擎已验证过的 `buildExercisesDocumentFromMarkdown()`，再把 question blocks 映射回 `PipelineExercise`。
  - 这样“右侧能渲染”和“后端能落地”会共享同一套 Markdown 理解方式，避免前后不一致。
- **后续避免**:
  - 以后凡是 Agent 右侧已经有可渲染预览的文档型产物，后端落地前应优先考虑复用同一套文档解析，而不是再手写一份平行 parser。
  - 如果再次出现“页面能看见内容，但流水线说解析失败”，优先排查 parser 分叉，不要先去追模型输出或 JSON fallback。
- **状态**: 已修复

## 模式 52: 首页/主工作台把浏览器原始 `Failed to fetch` 直接渲染给老师
- **症状**:
  - `/main/agent`、`/main/library`、题库等首屏页面在请求失败时，页面直接出现英文原始报错 `Failed to fetch` / `fetch failed` / `Load failed`。
  - 这类错误通常不是业务语义错误，而是浏览器层的网络失败或请求被中断。
- **根因**:
  - 多个前端页面在 `catch` 里直接把 `error.message` 显示到 UI。
  - 不同页面又各自写了一份 fetch 包装，导致有的地方会翻译，有的地方会把浏览器原始文案直接透传出来。
- **正确做法**:
  - 客户端请求层必须统一收口网络错误：
    - `Failed to fetch`
    - `fetch failed`
    - `Load failed`
    - `network request failed`
  - 这些浏览器层错误一律映射成中文可操作提示，例如“网络请求失败，请检查连接后重试”。
  - `AbortError` 要单独映射成“请求超时，请重试”，不要混成普通失败。
  - 业务接口自己的中文错误仍保留，不要被统一文案覆盖。
- **后续避免**:
  - 新增前端请求封装时，不能再直接 `throw error` 或直接渲染 `error.message`，必须先经过统一的客户端错误归一化。
  - 回归时要补一条“模拟 fetch 失败后 UI 不出现裸英文原始报错”的验证。
- **状态**: 已修复

## 模式 53: Gemini Embedding 2 官方博客已支持多模态，但 API/SDK 文档仍容易让人误判成 text-only
- **症状**:
  - 研发按 `ai.google.dev/api/embeddings` 或 `@google/genai` 的现有文档阅读后，会得出“embedding 只能喂文本”的结论。
  - 结果继续把 PDF / 图片先 OCR、先抽文本、再做 embedding，错过了 `gemini-embedding-2-preview` 已经开放的多模态直嵌入能力。
- **根因**:
  - Google 在 2026 年 3 月发布的博客明确说明 `Gemini Embedding 2` 支持 `text / image / audio / video / PDF`，且支持交错多模态输入。
  - 但当前 API/SDK 文档与类型示例仍大量沿用 text-only 描述，尤其是 `embedContent` / `batchEmbedContents` 文档，没有把 `fileData` 场景讲清楚。
- **正确做法**:
  - 任何 Gemini Embedding 2 改造都必须先做一次真实 API smoke，不要只看文档字面。
  - 当前项目的结论已经验证过：
    - `PNG / JPEG / PDF` 可以通过 `batchEmbedContents + fileData` 直接拿到向量
    - `DOCX` 仍会被接口拒绝，必须回退到文本解析
  - 在服务端实现上，优先走“真实多模态成功才启用，失败自动回退文本 embedding”的双轨策略。
- **后续避免**:
  - 以后凡是要接 Google 新 preview 能力，不能只依赖 SDK 类型或旧 API 文档，必须同时核对官方博客 / changelog / 一次真实请求结果。
  - 若能力边界和文档不一致，先把真实探测结果沉淀进项目文档，再改生产链路。
- **状态**: 已修复

## 模式 54: Supabase 显式字段投影后，TypeScript 把查询结果退化成 `GenericStringError`，导致“优化查询”本身先把类型检查打爆
- **症状**:
  - 把热点查询从 `select("*")` 改成显式字段列表后，`tsc` 开始在 `toSession(...)`、`toDocument(...)`、`mapFolderRow(...)` 之类映射函数上报错：
    - `Argument of type 'GenericStringError' is not assignable ...`
    - `Conversion of type 'GenericStringError[]' may be a mistake ...`
  - 运行时逻辑其实没坏，但一改投影就出现成片类型错误，容易让人误以为“这个表不能做字段精选”。
- **根因**:
  - 当前项目里多处 Supabase 查询依赖字符串形式的 `.select("a, b, c")`，一旦字段串较长或带 join，生成类型有时会退化成 `GenericStringError`。
  - 如果直接把 `data as RowType` 或 `(data ?? []) as RowType[]` 写在调用点，TypeScript 会继续把这个退化类型往上映射，最终在 mapper 参数处爆炸。
- **正确做法**:
  - 保留显式字段投影，不要因为类型推断退化就回退到 `select("*")`。
  - 在查询结果边界统一收口一次：
    - 单行结果走 `asRow(value: unknown): RowType`
    - 多行结果走 `asRows(value: unknown[] | null | undefined): RowType[]`
  - 之后再把收口后的强类型 row 传给 `toSession / toSubmission / toDocument / mapFolderRow` 这类 mapper。
  - 新增或重构 store 时，优先把 `SELECT` 常量和 `asRow/asRows` 辅助一起落下，避免每次都在调用点零散补 cast。
- **后续避免**:
  - 以后做 `select("*") -> 精选字段` 优化时，默认预留一次 `tsc` 修边界，不要把“类型报错”误判成“查询改坏了”。
  - 若一个 store 已经开始使用显式投影，就继续沿用统一的 `SELECT 常量 + asRow/asRows + mapper` 模式，不要混用裸 cast。
- **状态**: 已修复

## 模式 55: 单独新增 pgvector RPC migration 时，沿用 `extensions.vector` 容易在远端 `db push` 阶段报 `<=>` 操作符不存在
- **症状**:
  - `supabase db push` 应用新 migration 时直接失败，报：
    - `operator does not exist: extensions.vector <=> extensions.vector (SQLSTATE 42883)`
  - 常见现场是表字段本身已经是 `extensions.vector(1536)`，看起来沿用同样的类型最“统一”，但函数体里一写 `embedding <=> query_embedding` 就在远端解析失败。
- **根因**:
  - 这类独立 migration 没有显式设置 `search_path`，而 `<=>` 操作符解析又依赖 pgvector 的可见性。
  - 项目里较早那批稳定工作的向量 RPC 已经采用了更安全的写法：先 `set search_path = public, extensions;`，函数参数用未限定的 `vector(1536)`。
  - 如果后续单独新建 migration 时忘了沿用这套范式，就会出现“列是 `extensions.vector`，但函数定义阶段解析不到 `<=>` 操作符”的远端落库失败。
- **正确做法**:
  - 新增 pgvector RPC 时，优先复用项目内已经验证过的范式：
    - migration 顶部显式 `set search_path = public, extensions;`
    - 函数参数写 `vector(1536)`，不要机械沿用 `extensions.vector(1536)`
  - 真正参与比较的列继续保留原表定义，不需要为了函数参数再改表结构。
- **后续避免**:
  - 以后凡是新增或改写向量检索 RPC，先对照 `knowledge_document_rag` 那批已落远端的 migration 写法，不要只复制最近表定义里的 `extensions.vector`。
  - `supabase db push` 第一次报 `<=>` 操作符不存在时，优先排查 `search_path` 和函数参数类型写法，不要先怀疑索引或扩展没装好。
- **状态**: 已修复

## 模式 56: Agent 资料问答快路径如果把材料摘要也一起跳掉，会出现“更快但总结跑偏”
- **症状**:
  - `/api/agent/chat` 在显式引用 `contentAssetIds / contentReferenceIds` 后，`preflight` 和 `direct_dispatch` 的耗时明显下降了。
  - 但老师改问“这份资料主要讲了什么”这类概述题时，答案开始只抓住零散 chunk，甚至被文件标题关键词带偏。
- **根因**:
  - 快路径为了省时跳过了 teacher memory 和 direct dispatch，本来没问题。
  - 真正的问题是把 `uploadedMaterialSummary / runtimeContextText` 也一起清空了，模型只剩分段材料，却失去了“这些段落拼起来到底在讲什么”的压缩锚点。
- **正确做法**:
  - 轻量快路径可以只保留：
    - 当前会话上下文
    - `buildTaskAwareMaterialPreview(...)` 生成的材料摘要
  - 但不要把材料摘要上下文一并删掉；仍然要继续写入 `runtimeContextText`，并保留 `buildUploadedMaterialConversationSources(...)` 的来源描述。
- **后续避免**:
  - 做 Agent 资料问答提速时，验收不能只看 `Server-Timing`，还要至少抽查一条“总结文档主线/核心冲突”的问题。
  - 如果事实题变快了，但概述题明显偏题，优先检查是不是快路径把材料摘要一起跳掉了。
- **状态**: 已修复

## 模式 57: Agent 主链已经切到 `/api/agent/chat`，但旧入口/旧脚本还在继续调用 `/api/agent/preflight`
- **症状**:
  - 浏览器里仍能看到 `/api/agent/preflight` 请求，或者首页纸夹按钮还把用户导向 `/main/agent?action=scan_pdf`。
  - 主工作台表现为“多了一跳”“先空等再生成”，甚至继续出现 scan / preflight 的旧文案。
- **根因**:
  - 历史兼容代码没有从产品入口、脚本和文档里一起清掉，只是后端主逻辑已经绕开了它。
- **正确做法**:
  - Agent 正式发送链只保留 `/api/agent/chat`。
  - `/api/agent/preflight` 只保留 tombstone 退役响应，不再参与主流程。
  - 首页纸夹按钮只负责打开 Agent 工作台，不再注入 `scan_pdf` 动作。
- **后续避免**:
  - 以后凡是重构 Agent 主链，除了改后端逻辑，还要同步 grep 清理 `preflight / scan_pdf / contentReferenceIds` 在入口、脚本和 runbook 里的残留。
- **状态**: 已修复

## 模式 58: Canvas 反复出现长串反斜杠时，只修单个 workflow 没用，必须同时修“源头 + 流式组装 + 持久化回放 + 渲染兜底”
- **症状**:
  - 右侧 Canvas 偶发出现整段 `\\\\\\\\...`、`\\n`、`\\\\[` 这类内容，严重时 markdown 根本不可读，甚至像“无法渲染”。
  - 常见现场是 streaming 过程中已经坏，刷新页面后 completed / persisted 产物依旧坏，说明不是单纯前端瞬时态问题。
- **根因**:
  - 某些 artifact workflow 会把被 `JSON.stringify` 过或双重转义过的 markdown/raw text 写进 `rawContent / markdown / content / text`。
  - 另一类高频变体是 worksheet / notes 在生成 `htmlContent` 时把 `\_` 空格线误当成 markdown 斜体边界，落库后会出现 `\<em>\</em>` 连串噪音，Canvas 视觉上就会变成 `f′(x)= \\\\\\` 这类“公式后只剩反斜杠”的假坏数学。
  - 旧链路里 `stream-runner`、workspace preview、legacy fallback document、`ArtifactMarkdownView` 都默认把这类字符串当“正常 markdown”处理，没有统一规范化层。
  - 结果就是同一份脏内容在“流式预览”和“完成态回放”两条链上同时复现。
- **正确做法**:
  - 修这类问题时，至少同时检查四层：
    - artifact 文本写入点是否发生了二次序列化
    - `buildDocumentArticleHtml(...)` 这类 markdown -> html 生成器有没有把被反斜杠转义的下划线/强调符重新当成 markdown 语法
    - streaming chunk 组装是否直接拼接脏 `rawContent`
    - persisted artifact / legacy fallback 是否复用了同一套文本规范化
    - markdown 渲染层是否提供纯文本兜底
  - 项目当前正确范式是：
    - artifact 纯文本链统一走 `normalizeArtifactRenderableContent(...)`，只在高置信场景下解开 `JSON.stringify` / 双重转义，并在无法安全修复时退回纯文本显示；
    - 文档 HTML 链在 `normalizeDocumentHtml(...)` 中额外修复历史遗留的 `\<em>\</em>` / `&amp;nbsp;` 噪音，并在源头 `applyInlineFormatting(...)` 保留被转义的下划线空格线。
- **后续避免**:
  - 以后只要 Canvas 出现反斜杠噪音，先沿“源头写入 -> stream-runner -> artifact snapshot -> markdown view”整条链排查，不要只改某个 workflow 的 prompt 或某个组件样式。
  - 回归至少覆盖三类输入：
    - 被整体 `JSON.stringify` 的 markdown
    - 双重转义的 LaTeX 分隔符
    - 纯反斜杠噪音文本
- **状态**: 已修复

## 模式 58: 用子组件本地 effect 维护父层“处理中”门禁，侧边栏一关闭就会把状态卡死
- **症状**:
  - Agent 右侧侧边栏上传 PDF 后，主聊天区会显示“`xxx.pdf is still processing and will be attached automatically when ready.`”。
  - 用户把侧边栏关掉甚至退出当前操作后，这条提示还会一直挂着，发送按钮长期不可用，直到刷新页面。
- **根因**:
  - 上传与轮询逻辑放在 `AgentContextSidebar` 里，但父层的 `referenceUploadState` 只靠子组件 `useEffect(uploadingFiles)` 同步。
  - 一旦侧边栏关闭，组件卸载，后续“ready / failed / 完成清理”的异步结果仍会继续跑，但已经没有渲染 effect 去把父层状态改回 `pending=false`。
  - 结果就是父层门禁停留在旧值，形成假锁死。
- **正确做法**:
  - 涉及上传、轮询、后台任务这类跨组件生命周期的异步状态，不能只靠子组件渲染副作用向父层同步。
  - 正确模式是：
    - 由上传流程本身在每次状态迁移时显式调用父层回调；
    - 即使组件已经卸载，也要继续把“完成 / 失败 / 清空队列”的结果回报给父层；
    - 本地展示 state 可以是组件级，但门禁状态必须独立于组件是否还挂载。
- **后续避免**:
  - 以后凡是“子组件关闭后，父层按钮还要继续受后台任务约束”的场景，都不要只写 `useEffect(() => onChange(localState), [localState])`。
  - 至少补一条真实浏览器回归：触发上传后立刻关闭面板，等待任务完成，再确认父层提示和禁用状态能自动恢复。
- **状态**: 已修复

## 模式 59: Canvas 预览和 PDF 导出如果各自维护一套数学公式渲染链，导出就会悄悄退回浏览器默认数学表现
- **症状**:
  - 右侧 Canvas 里的公式看起来是正常的，但点“导出 PDF”后，部分 Markdown 产物里的数学公式观感明显变差。
  - 常见表象是导出结果像在吃浏览器默认 MathML，而不是稳定的 KaTeX 排版；有时预览正常，导出却发虚、发紧或结构不一致。
- **根因**:
  - 文档型产物已经走 `normalizeDocumentHtml(...) -> expandHtmlMathMarkup(...) -> katex.renderToString(output: "html")`。
  - 但 Markdown 型产物如果还保留另一套 `Marked.parse(...) -> 手扫 $...$ -> katex.renderToString(output: "htmlAndMathml")`，就会造成：
    - 预览链和导出链最终 HTML 不一致；
    - 导出里继续混入 `katex-mathml` / MathML 回退分支；
    - 不同格式转换之间重复处理公式，出现“预览正常，导出发怪”的假象。
- **正确做法**:
  - Markdown 型产物不要再维护独立数学渲染器。
  - 正确范式是：
    - 先用 `Marked` 产出基础 HTML；
    - 用 `DOMPurify.sanitize(...)` 做白名单清洗；
    - 再统一走 `normalizeMathHtml(...) -> expandHtmlMathMarkup(...)`；
    - 最终只输出 KaTeX HTML，不再使用 `htmlAndMathml`。
  - Agent Canvas 导出也应复用这同一条 `renderRichMarkdown(...)` 链，避免“右侧看的是 A，导出时又临时重跑成 B”。
- **后续避免**:
  - 以后凡是改公式导出，先分清楚问题发生在：
    - 文档型产物链
    - Markdown fallback 链
  - 回归至少覆盖两层：
    - `node --import tsx tests/followup/doc-engine-document-article-html.spec.ts`
    - `node --import tsx tests/followup/rich-markdown-math.spec.ts`
  - 验收时不要只看页面预览，还要确认导出前的 HTML 不包含：
    - `katex-mathml`
    - 原生 `<math>`
    - 裸 `$...$`
- **状态**: 已修复

## 模式 60: 题目预览如果只给裸 TeX 里的局部 `x^2 / x_1` 打补丁，结构化命令会裂成“半个 KaTeX + 半段原始反斜杠”
- **症状**:
  - 左侧题库卡片或右侧组卷预览里，题干原文类似 `\frac{x^3+\sin x}{x^2+2}`。
  - 页面上却会显示成 `\frac{`、`+\sin x}{` 这类原始文本，中间只有 `x^3`、`x^2` 被渲染成了 KaTeX 上下标。
  - 用户会误以为“导出才坏了”，但实际上预览链本身已经先把公式拆坏。
- **根因**:
  - `normalizeMathText(...)` 先跑“裸上下标兜底”，把 `x^3`、`x^2` 单独包成了 `math-inline`。
  - 但更外层的结构化裸 TeX（如 `\frac` / `\sqrt` / `\sum` / `\int`）如果没有先整体收口，就会残留一半命令文本、一半 KaTeX HTML。
  - 另一类隐蔽变体是结构化裸 TeX 后面紧跟普通题干句子，若“去数学噪声”逻辑写得太激进，还会把公式后的 `If H(5)=...` 之类正文一起吞掉。
- **正确做法**:
  - 先识别并整体收口结构化裸 TeX，再做局部上下标补丁；顺序不能反过来。
  - 对结构化裸 TeX 要做两步：
    - 找到“真正可渲染的最长前缀”，避免把后面的普通句子一起吃进公式；
    - 只有当左右噪声与渲染结果真实重叠时，才允许裁掉相邻噪声，不要因为是数学命令就顺手吞掉后文。
  - 当前项目里，这层修复在 `lib/doc-engine/math-core.ts`。
- **后续避免**:
  - 以后只要看到页面里出现“`\frac{` 还在、但 `x^2` 已经变成上标”的现场，优先检查 `normalizeMathText(...)`，不要先去改 KaTeX CSS、PDF 打印样式或导出接口。
  - 回归至少覆盖：
    - `node --import tsx tests/followup/doc-engine-document-article-html.spec.ts`
    - 一条题干句中裸 TeX 分式的断言，确认：
      - 预览 HTML 会生成单个 `math-inline`
      - 展开后不再残留 `\frac` / `\sin`
      - 公式后面的普通句子仍然保留
- **状态**: 已修复

## 模式 61: PDF 导出本地公式正常、Vercel 线上分式塌成 `x2+2x3+sin x`，根因通常是 KaTeX 打印资源没进函数包
- **症状**:
  - 页面预览里的公式已经是正常 KaTeX，右侧 Canvas 看起来没问题。
  - 但线上导出的 PDF 里，分式、根式、上下标会塌成线性文本，例如 `\frac{x^3+\sin x}{x^2+2}` 视觉上变成 `x2+2x3+sin x`。
  - 这类 PDF 往往不会残留原始 `\frac`，而是“有公式内容、没公式版式”，很容易被误判成浏览器默认数学渲染。
- **根因**:
  - `lib/doc-engine/export-pdf.ts` 在运行时用 `readFileSync(process.cwd()/...)` 读取：
    - `lib/doc-engine/academic-print.css`
    - `node_modules/katex/dist/katex.min.css`
    - `node_modules/katex/dist/fonts/*`
  - 本地源码和 `node_modules` 都在磁盘上，所以打印正常。
  - 但 Vercel / Next 的 output tracing 不会稳定自动收进这种运行时文件系统依赖，导致线上函数能生成 KaTeX DOM，却拿不到配套 CSS / 字体，最终 PDF 视觉只剩线性文本。
- **正确做法**:
  - 所有调用 `renderDocumentPdf(...)` 的路由都要在 `next.config.ts` 的 `outputFileTracingIncludes` 显式补进 PDF 打印资源。
  - 当前项目最少要覆盖：
    - `/api/doc/export-pdf`
    - `/api/doc/export-rubric-pdf`
    - `/api/pdf/generate`
  - 并显式包含：
    - `./lib/doc-engine/academic-print.css`
    - `./node_modules/katex/dist/katex.min.css`
    - `./node_modules/katex/dist/fonts/**/*`
- **后续避免**:
  - 以后凡是服务端打印链里出现 `readFileSync(process.cwd()/...)` 读取样式、模板、字体、字典文件，都默认检查对应 route 的 `.nft.json`，不要只看 `npm run build` 是否成功。
  - 验证时至少做两步：
    - 查 `.next/server/app/api/.../route.js.nft.json`，确认资源真的在 trace 清单里；
    - 把线上实际下载的 PDF 转成 PNG 看视觉，不要只看 `pdftotext` 或复制出的文本。
- **状态**: 已修复
