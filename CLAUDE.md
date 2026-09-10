# Deskmate

AP 教师 AI 教学工具台。Next.js 15.3 + TypeScript + Tailwind CSS 4 + Supabase + Anthropic/Kimi。

---

## 去哪找什么

| 我需要... | 去这里... |
|-----------|----------|
| 颜色、字体、间距、圆角值 | `docs/frontend-design/design-system/design-tokens.md` |
| 按钮、卡片、输入框、标签 CSS | `docs/frontend-design/design-system/component-specs.md` |
| 产品侧边栏 + 主区域布局 | `docs/frontend-design/design-system/layout-shell.md` |
| 营销页导航栏 + 页脚 | `docs/frontend-design/design-system/marketing-shell.md` |
| 搜索弹窗、Toast、导出菜单、确认对话框 | `docs/frontend-design/design-system/shared-overlays.md` |
| 路由树、页面嵌套关系、跨页依赖 | `docs/frontend-design/page-map.md` + `page-structure.md` |
| 某个页面的 HTML 设计参考 | `docs/frontend-design/clipboard/{page-name}.html` |
| 某个页面的详细设计（Stitch 在线） | **Stitch MCP** → `list_screens` / `get_screen` |
| Stitch 导出的代码 | `docs/frontend-design/clipboard/` 或 **Stitch MCP** |
| PRD 模板 | `docs/frontend-design/prd/templates/` |
| CB 出题模式（习题生成参考） | `docs/cb-exam-patterns/00-cross-subject-master-guide.md` |
| 第三方库最新 API | **Context7 MCP** → `query-docs` |

---

## 工作流程

### 写代码前
1. 涉及第三方库 → **Context7 MCP** 查文档，不凭记忆写

### 做组件
2. 读 `design-system/component-specs.md` → 复制精确 CSS，不要自创样式

### 做页面
3. 查 `page-map.md` 确认路由和 shell 类型
4. 读对应 shell 文件（`layout-shell.md` / `marketing-shell.md`）
5. 读 `clipboard/{page-name}.html` 获取设计参考
6. 如果需要更细节 → **Stitch MCP** `get_screen` 拉在线设计
7. 用到全局弹层 → 读 `shared-overlays.md`

### 做习题生成
8. 按学科读 `docs/cb-exam-patterns/{subject}.md` 获取出题模式

---

## Stitch MCP 使用

Stitch 项目 ID: `886420668503916957`（Deskmate Design System PRD）

```
# 列出所有页面设计
mcp__stitch__list_screens(projectId: "886420668503916957")

# 获取某个页面的详细设计
mcp__stitch__get_screen(name: "projects/886420668503916957/screens/{screenId}", ...)

# 生成新页面设计
mcp__stitch__generate_screen_from_text(projectId: "886420668503916957", prompt: "...")

# 修改现有设计
mcp__stitch__edit_screens(projectId: "886420668503916957", ...)
```

---

## 设计规范

使用 HeroUI 组件库默认样式。不手写硬编码颜色/间距/圆角，优先用 HeroUI 组件 + Tailwind CSS 4 utility classes。

---

## 技术栈

- **框架**: Next.js 15.3 (App Router) + React 19
- **样式**: Tailwind CSS 4 + shadcn/ui
- **字体**: Inter (英文) + Noto Sans SC (中文)
- **数据库**: Supabase (PostgreSQL + pgvector)
- **AI**: Anthropic (Haiku/Sonnet) + Kimi K2 + Google Embedding 2.0
- **测试**: Vitest
- **端口**: PORT=3001
- **认证**: 开发模式 AUTH_BYPASS=true

## 数据库迁移安全规范

- 迁移中禁止直接 `DELETE FROM` 或 `DROP TABLE` 大批量用户数据
- 如需清理数据，分两步：第一个迁移加 `deprecated_at` 标记，30 天后第二个迁移再真正删除
- 包含 DELETE/DROP 的迁移文件名必须含 `_destructive_` 标记（如 `20260401_destructive_cleanup_old_exercises.sql`）
- 删除前必须在同一迁移中创建备份表或确认无用户依赖

## Context7 强制查询

涉及以下库时必须先查 Context7，不凭记忆写：

| 库 | Context7 ID |
|----|-------------|
| Next.js | /vercel/next.js |
| React | /facebook/react |
| Supabase | /supabase/supabase |
| Tailwind CSS | /tailwindlabs/tailwindcss |
| shadcn/ui | /shadcn-ui/ui |
| Zod | /colinhacks/zod |
| Vitest | /vitest-dev/vitest |
| Anthropic SDK | /anthropic/anthropic-sdk-typescript |
| OpenAI SDK | /openai/openai-node |
| Vercel AI SDK | /vercel/ai |

## CLI 工具偏好

Bash 场景下优先使用以下高性能工具：

| 场景 | 用这个 | 不用这个 |
|------|--------|---------|
| 文本搜索 | `rg` | `grep` |
| 文件查找 | `fd` | `find` |
| 文本替换 | `sd 'old' 'new' file` | `sed -i` |
| 运行脚本 | `bun` | `node` / `npm run` |
| JSON 处理 | `jq` | 手写脚本解析 |
| 模糊搜索 | `fzf` | 手动遍历 |

注意：内置工具（Grep、Glob、Read、Edit、Write）优先于任何 Bash 命令。以上仅在必须用 Bash 时生效。

## 意图识别原则

- 不用正则表达式判断用户意图或决定工具路由
- 所有工具始终可用，让 AI 根据 tool description 和上下文自主选择
- 正则只允许用于文本格式化、输入校验等非意图判断场景

## 已知问题

- Kimi K2 必须 `temperature=1`（temp=0 时 tool calling 失败）
- `moonshot-v1-128k` 不支持 JSON Schema union type → 用 `nullable: true`
- API 路由用 `export async function GET/POST`（App Router，非 Pages Router）
