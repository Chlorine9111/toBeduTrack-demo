# Deskmate Agent Map

Deskmate 是一个面向教师的 AI 教学工作台，覆盖教案、习题、Rubric、判卷、PBL、排课与公众号内容生产。  
技术栈：Next.js App Router、React 19、TypeScript、Supabase、Zod、Vercel AI SDK、Playwright。

## Hard Constraints
1. `app/api/**/route.ts` 只做请求编排，不直接依赖 UI 组件与 Hooks。
2. API Route 中禁止使用相对路径导入（统一使用 `@/` 别名）。
3. API Route 不直接运行时导入 `@supabase/supabase-js` / `@supabase/ssr`，统一走 `lib/supabase/*`。
4. 新增 AI 调用优先通过 `lib/ai/model-router.ts` 选型，并由业务层统一走 `lib/ai/gateway.ts` / `lib/ai/structured-output.ts`；业务层禁止直连 provider SDK、裸 OpenRouter endpoint，或自行拼接 provider headers/baseURL。结构化输出统一使用 AI SDK 6 的 `generateText/streamText + Output.object(...)` 经由 gateway 收口，禁止再新增 `generateObject/streamObject`、手写 schema 级 JSON parse，或恢复已退役的 `tool-adapter.ts` / `vercel-sdk-adapter.ts` 双轨调用。`lib/ai/provider-registry.ts`、`lib/ai/openrouter-client.ts` 仅供 Gateway/Infra 层复用，不作为业务层首选入口。
5. 输入参数先 Zod 校验，再执行业务逻辑；错误优先返回 `jsonError(...)` 统一结构。
6. 任何教师私有数据接口必须经过教师上下文校验（`getTeacherContext` 或同等机制）。
7. 保持类型来源稳定：共享类型优先放 `types/` 或对应 `lib/<domain>/types.ts`，避免重复定义。
8. `main/agent` 是当前唯一主工作台。生成物交互固定为“左侧对话留引用块，右侧 Canvas 仅在点击引用块后展开完整正文，多份产物走顶部标签切换”；不要把完整产物重新塞回聊天长正文，也不要把新工作流导回旧 `/main/project`。
9. 新增 AI 流式接口统一使用 Vercel AI SDK 稳定 UI stream（`streamText` / `createUIMessageStream` / `createUIMessageStreamResponse` + `data-*` parts）；不要再新增自定义 `application/x-ndjson` 聊天协议。
10. 调用 subagents 时，探索/摸底/只读分析类任务允许使用更轻模型；但任何实际编码、重构、修 bug、写测试或改文件的编程任务，统一使用 `gpt-5.4`，且推理强度至少 `high`，复杂或高耦合任务直接使用 `xhigh`。

## AGENTS 使用边界
- `AGENTS.md` 只保留轻量导航、硬约束和阅读顺序。
- 运行基线、页面结构、联调约定、犯错记录、排障经验一律沉淀到 `docs/*`。
- 当项目信息变多时，优先补充或新建 `docs/*`，不要继续把 `AGENTS.md` 扩成运行手册。

## 阅读顺序
- [docs/product.md](docs/product.md) - 产品定义、功能模块、业务规则、领域术语
- [docs/constraints.md](docs/constraints.md) - 硬约束表、超时预算、Hook 错误边界、熵管理
- [docs/architecture.md](docs/architecture.md) - 技术分层、依赖方向、数据流
- [docs/conventions.md](docs/conventions.md) - 命名、导入、错误处理、日志约定
- [docs/domain-map.md](docs/domain-map.md) - 业务域边界与模块职责
- [docs/frontend-overview.md](docs/frontend-overview.md) - 前端正式入口、主壳、页面职责与交互基线
- [docs/runbooks/runtime-baselines.md](docs/runbooks/runtime-baselines.md) - 本地真实联调、Auth、主工作台、真实数据与验收脚本基线
- [docs/runbooks/stability-performance.md](docs/runbooks/stability-performance.md) - 稳定性内核、后台任务、kill switch 与判卷 job 运行手册
- [docs/stack.md](docs/stack.md) - 技术栈与关键依赖用法
- [docs/quality.md](docs/quality.md) - 模块质量评级与已知问题
- [docs/plans/debt.md](docs/plans/debt.md) - 已知技术债务
- [docs/error-patterns.md](docs/error-patterns.md) - Agent 常见错误、返工模式与 harness 修复
- [docs/decisions/](docs/decisions) - ADR 决策记录
- [docs/plans/active/](docs/plans/active) - 当前执行中的计划

## 当前活跃计划
- [docs/plans/active/harness-engineering-bootstrap.md](docs/plans/active/harness-engineering-bootstrap.md)
- [docs/plans/active/content-library-mvp.md](docs/plans/active/content-library-mvp.md)
- [docs/plans/active/agent-streaming-render-stability.md](docs/plans/active/agent-streaming-render-stability.md)
- [docs/plans/active/agent-backend-triage-workflow-upgrade.md](docs/plans/active/agent-backend-triage-workflow-upgrade.md)

## 常见任务指针
- 做本地真实联调、认证、Mailpit、UX 验证脚本时，先看 [docs/runbooks/runtime-baselines.md](docs/runbooks/runtime-baselines.md)。
- 修 `/main/*` 主工作台、公众号编辑器、正式前端入口时，先看 [docs/frontend-overview.md](docs/frontend-overview.md)。
- 改 `/main/grading` 智能判卷时，先看 [docs/grading-ocr-gemini.md](docs/grading-ocr-gemini.md) 和 [docs/runbooks/runtime-baselines.md](docs/runbooks/runtime-baselines.md)；判卷链路的模型分工、OCR 上下文透传和 30s SLA 都以这两处为准。
- 做超时、后台任务、after 后置、副作用可靠性和 kill switch 相关改造时，先看 [docs/runbooks/stability-performance.md](docs/runbooks/stability-performance.md)。
- 处理回归、HMR 污染、Hydration、假打通、Provider 回退等问题时，先看 [docs/error-patterns.md](docs/error-patterns.md)。
