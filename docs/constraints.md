# 硬约束 — If X Then Y

> 所有约束均为机械执行规则。违反将导致运行时失败、构建失败或静默错误。
> 遇到问题时先查此表，再查代码。

## 依赖方向

```
Types → Lib → API Routes → Hooks → Adapters → Components → Pages
```

依赖只能向右，禁止反向引用。跨层访问仅通过 Providers（`lib/supabase`, `lib/ai`）。

## API 路由

| 如果你看到... | 说明 | 修复 |
|-------------|------|------|
| `export default function handler` | Pages Router 语法 | 改为 `export async function POST(req: NextRequest)` |
| `res.json()` | Pages Router 响应方式 | 改为 `NextResponse.json()` |
| `req.body` 直接访问 | Pages Router 模式 | 改为 `await request.json()` |
| API 路由没有 Zod 校验 | 缺少输入验证 | 用 Zod 校验后再执行业务逻辑，错误走 `jsonError(...)` |

## LLM 调用

| 如果你看到... | 说明 | 修复 |
|-------------|------|------|
| 业务代码直连 provider SDK | 绕过 Gateway/model-router | 走 `lib/ai/gateway.ts` 或对应领域 adapter |
| 业务层自行拼接 provider headers/baseURL | 绕过统一出口 | 走 `lib/ai/model-router.ts` 选型 |
| LLM 调用无 AbortController | 前端可能挂起 30s+ | 必须配超时，参照现有 Hook 实现 |
| OpenRouter structured schema 用了 `minItems > 1` 或 `maxItems` | Anthropic 路径会报 400 | schema 保持宽松，业务层本地做二次裁剪 |

## 超时预算（原则）

每个 LLM 调用**必须**配 `AbortController`。无超时 = 前端挂起。

设计新 Hook 时必须明确：这个 Hook 在失败时是 **fallback**（内部兜底）还是 **throw**（抛给调用方）。

- **fallback 模式**：Hook 内部 `catch` 返回默认值，调用方的 `try/catch` 捕获不到异常
- **throw 模式**：Hook 原样抛出，调用方自行处理

两者不可混用。参照现有 Hook 设计，新 Hook 在 JSDoc 里注明策略。

## 前端

| 如果你看到... | 说明 | 修复 |
|-------------|------|------|
| `obj.key = newValue` | 违反不可变原则 | `{ ...obj, key: newValue }` |
| 新组件直接 fetch `/api/*` 且已有对应 Hook | 跳过了 Hook/Adapter 层 | 通过对应 Hook 调用；如果确无现成 Hook 且场景简单，直接 fetch 可接受 |
| `console.log` 残留 | 调试代码未清理 | 删除（PostToolUse Hook 会自动警告） |
| fetch 调用无 AbortController | LLM 可能挂起 | 参照现有 Hook 添加超时 |

## PDF

| 如果你看到... | 说明 | 修复 |
|-------------|------|------|
| `pdftoppm -png -r <dpi> input.pdf prefix` | 服务端需要把 PDF 页渲染成图片供 Vision / 上传预处理复用 | 保证运行环境可执行 `pdftoppm`，并在临时目录中生成/清理页面 PNG |

## 认证

| 如果你看到... | 说明 | 修复 |
|-------------|------|------|
| 硬编码 `AUTH_BYPASS=true` 在非开发配置中 | 生产安全风险 | 仅在 `.env.local` 中设置 |
| middleware 重定向了 `/api/**` | API 会返回 HTML 而非 JSON | middleware matcher 显式排除 `/api/**` |
| 客户端组件导入 `@/lib/supabase` 聚合入口 | 会拉入 server helper 导致编译失败 | 只从 `@/lib/supabase/client` 导入 |
| middleware 用 `supabase.auth.getSession()` 验证用户 | `getSession` 不经 Auth 服务器验证，可被篡改 | 改为 `supabase.auth.getUser()`，它会向 Auth 服务器发真实校验请求 |

## 熵管理（定期清理信号）

以下信号表明代码库正在退化，需要主动干预：

| 信号 | 行动 |
|------|------|
| 单个组件超过 700 行 | 提取子组件或 Hook |
| Mock 数据在非 fallback 场景使用 | 替换为真实 API 调用 |
| 相同字段转换逻辑出现在 2+ 处 | 收敛到对应 Adapter |
| 未使用的导入或变量 | 删除（ESLint 会标记） |
| 类似的 3+ 行代码在多处重复 | 提取到 `lib/` 工具函数 |
| docs/ 中描述与代码行为不符 | 更新文档或修正代码 |
