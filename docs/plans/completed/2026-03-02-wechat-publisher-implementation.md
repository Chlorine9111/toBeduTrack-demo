# WeChat Publisher Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Deskmate 教育分支裁剪为独立的微信公众号 AI 排版工具，保留 AI 生成 + 设计稿还原核心功能，剔除所有教育相关模块。

**Architecture:** 基于现有 Next.js 15 App Router 项目，删除教育模块（约 80% 代码），将 WeChat 编辑器提升为首页，用 Tiptap 替换已弃用的 contentEditable + document.execCommand，新增 URL 截图 API。保持与主项目的 Supabase 认证、Git 结构兼容。

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Tiptap (rich editor), Anthropic Claude API (Vision + text), Puppeteer (URL screenshots), Supabase (auth)

---

## 已有功能清单（无需重建）

以下核心功能已在代码库中完整实现：

| 功能 | 文件 | 状态 |
|------|------|------|
| AI 生成 + 排版 + 转换 API | `app/api/wechat/generate/route.ts` (512行) | ✅ 完整 |
| 设计稿→HTML（Claude Vision） | `lib/wechat/canva-converter.ts` | ✅ 完整 |
| 多格式文档解析 | `lib/wechat/document-parser.ts` | ✅ 完整 |
| URL 内容抓取 | `lib/wechat/url-fetcher.ts` | ✅ 完整 |
| PDF 图片提取 | `lib/wechat/pdf-image-extractor.ts` | ✅ 完整 |
| 主题系统（6套） | `lib/wechat/themes.ts` | ✅ 完整 |
| HTML 导出 | `lib/wechat/export.ts` | ✅ 完整 |
| Claude Vision 封装 | `lib/pdf-scan/ai-vision.ts` | ✅ 完整 |
| 文件上传组件 | `components/main/wechat/FileUploadZone.tsx` | ✅ 完整 |
| 图片上传组件 | `components/main/wechat/ImageUploadZone.tsx` | ✅ 完整 |

---

## Task 1: 删除教育相关模块（后端 API + lib）

**Files:**
- Delete: `app/api/ai/` (entire directory)
- Delete: `app/api/chat/` (entire directory)
- Delete: `app/api/curriculum/` (entire directory)
- Delete: `app/api/exercises/` (entire directory)
- Delete: `app/api/rubrics/` (entire directory)
- Delete: `app/api/worksheets/` (entire directory)
- Delete: `app/api/lesson-plans/` (entire directory)
- Delete: `app/api/feedback/` (entire directory)
- Delete: `app/api/developer/` (entire directory)
- Delete: `app/api/public/` (entire directory)
- Delete: `app/api/pdf/` (entire directory — pdf-scan functionality lives in `lib/pdf-scan/`, not here)
- Delete: `lib/ai/` (entire directory)
- Delete: `lib/chat/` (entire directory)
- Delete: `lib/curriculum/` (entire directory)
- Delete: `lib/exercise/` (entire directory)
- Delete: `lib/feedback/` (entire directory)
- Delete: `lib/home/` (entire directory)
- Delete: `lib/landing/` (entire directory)
- Delete: `lib/lesson-plan/` (entire directory)
- Delete: `lib/rubric/` (entire directory)
- Delete: `lib/worksheet/` (if exists)
- Delete: `lib/pdf/` (entire directory — PDF generator, not the scanner)
- Delete: `lib/pdf-file-store.ts` (if exists)
- Delete: `lib/api/adapters/` (除 pdf-scan 相关，检查后决定)
- Delete: `lib/api/ndjson.ts`, `lib/api/rate-limit.ts`, `lib/api/request.ts`, `lib/api/teacher-context.ts` (if exist)

**Step 1: 确认要删除的目录列表**

```bash
ls -la app/api/ | grep -v wechat | grep -v restore | grep -v screenshot | grep -v auth
ls -la lib/ | grep -v wechat | grep -v pdf-scan | grep -v supabase | grep -v auth | grep -v teachers | grep -v api | grep -v validation
```

Expected: 列出所有教育相关目录

**Step 2: 删除后端 API 教育模块**

```bash
cd /Users/mac/Documents/project/toBeduTrack-feat-wechat-ai-rich-editor-v2
rm -rf app/api/ai app/api/chat app/api/curriculum app/api/exercises app/api/rubrics app/api/worksheets app/api/lesson-plans app/api/feedback app/api/developer app/api/public app/api/pdf
```

**Step 3: 删除 lib 教育模块**

```bash
rm -rf lib/ai lib/chat lib/curriculum lib/exercise lib/feedback lib/home lib/landing lib/lesson-plan lib/rubric lib/worksheet lib/pdf
```

**Step 4: 清理 lib/api 中不需要的文件**

先检查存在哪些文件：
```bash
ls lib/api/
```

保留 `client.ts`、`response.ts`；删除 `adapters/`（如果存在且不被 wechat/pdf-scan 引用）、`ndjson.ts`、`rate-limit.ts`、`request.ts`、`teacher-context.ts`

**Step 5: 验证无 import 错误**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Expected: 可能有错误（后续 task 修复），但被删除模块不应被 wechat 核心代码引用

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove education API routes and lib modules"
```

---

## Task 2: 删除教育相关前端模块

**Files:**
- Delete: `app/about/` (entire directory)
- Delete: `app/blog/` (entire directory)
- Delete: `app/pricing/` (entire directory)
- Delete: `app/privacy/` (entire directory)
- Delete: `app/terms/` (entire directory)
- Delete: `app/developer/` (entire directory)
- Delete: `app/exercises/` (entire directory)
- Delete: `app/lesson-plans/` (entire directory)
- Delete: `app/lp/` (entire directory)
- Delete: `app/main/` (entire directory — WeChat page will move to root)
- Delete: `components/home/` (entire directory — LandingPage)
- Delete: `components/landing/` (entire directory)
- Delete: `components/dashboard/` (if exists)
- Delete: `components/developer/` (entire directory)
- Delete: `components/lesson-plan/` (if exists)
- Delete: `components/main/chatflow/` (entire directory)
- Delete: `components/main/ProjectView.tsx`, `ProjectsPage.tsx`, `SearchModal.tsx`, `Sidebar.tsx`, `TemplateGrid.tsx`, `TemplatesPage.tsx`, `HomeContent.tsx`, `DiscoverPage.tsx` etc
- Keep: `components/main/WeChatAIGeneratorPage.tsx` (will refactor later)
- Keep: `components/main/wechat/` (FileUploadZone, ImageUploadZone)
- Keep: `components/ui/` (Shadcn primitives)
- Delete: `hooks/` (entire directory — all education-specific hooks)
- Delete: `types/` (entire directory — all education-specific types)
- Delete: `tests/` (if exists — education tests)
- Delete: `document/` (if exists)
- Delete: `DESIGN_PROMPT.md`, `verify-features.mjs` (if exist)

**Step 1: 删除前端页面路由**

```bash
cd /Users/mac/Documents/project/toBeduTrack-feat-wechat-ai-rich-editor-v2
rm -rf app/about app/blog app/pricing app/privacy app/terms app/developer app/exercises app/lesson-plans app/lp app/main
```

**Step 2: 删除前端组件**

```bash
rm -rf components/home components/landing components/dashboard components/developer components/lesson-plan
rm -rf components/main/chatflow
```

删除 `components/main/` 中除 WeChat 相关外的所有文件：

```bash
# 保留 WeChatAIGeneratorPage.tsx 和 wechat/ 目录
cd components/main
ls | grep -v WeChatAIGeneratorPage | grep -v wechat | xargs rm -rf
cd ../..
```

**Step 3: 删除 hooks、types、tests**

```bash
rm -rf hooks types tests document
rm -f DESIGN_PROMPT.md verify-features.mjs
```

**Step 4: 验证保留的文件完整**

```bash
ls components/main/
ls components/main/wechat/
ls components/ui/
```

Expected: `WeChatAIGeneratorPage.tsx`, `wechat/FileUploadZone.tsx`, `wechat/ImageUploadZone.tsx`, and shadcn ui components

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove education frontend modules, hooks, types"
```

---

## Task 3: 重构路由——WeChat 编辑器提升为首页

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`
- Delete: `app/globals.css` 中教育相关样式（如果有）

**Step 1: 更新 app/page.tsx 渲染 WeChat 编辑器**

```typescript
// app/page.tsx
import type { Metadata } from "next";
import WeChatAIGeneratorPage from "@/components/main/WeChatAIGeneratorPage";

export const metadata: Metadata = {
  title: "微信公众号 AI 排版工具",
  description:
    "上传设计稿或使用 AI 生成微信公众号推文，一键转换为可发布的 HTML 格式。",
};

export default function HomePage() {
  return <WeChatAIGeneratorPage />;
}
```

**Step 2: 清理 app/layout.tsx**

移除 Figma script、更新 metadata、更新 lang 为 zh-CN、移除 katex CSS import：

```typescript
// app/layout.tsx
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "微信公众号 AI 排版工具",
  description: "上传设计稿或使用 AI 生成微信公众号推文，一键转换为可发布的格式。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <div className="min-h-screen bg-white text-neutral-900">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

注意：移除了 `DM_Sans` / `Sora` 字体 import（可选保留），移除了 `katex/dist/katex.min.css` import，移除了 Figma capture script。

**Step 3: 验证首页渲染**

```bash
npm run dev &
sleep 5
curl -s http://localhost:3001 | head -20
```

Expected: HTML 中包含 "公众号 AI 一键排版" 相关内容

**Step 4: 运行 TypeScript 检查**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Expected: 无错误或仅有与已删除模块相关的 import 错误（需修复）

**Step 5: Commit**

```bash
git add app/page.tsx app/layout.tsx
git commit -m "feat: promote WeChat editor to root route, clean up layout"
```

---

## Task 4: 修复删除后的 import 错误和构建问题

**Files:**
- Modify: various files with broken imports
- Modify: `middleware.ts` (if it references deleted routes)
- Modify: `app/globals.css` (clean up unused styles)

**Step 1: 运行 TypeScript 检查找出所有错误**

```bash
npx tsc --noEmit 2>&1
```

**Step 2: 逐一修复 import 错误**

对每个错误：检查引用路径，如果引用已删除模块则移除该 import。如果是 wechat 核心代码引用了被误删的文件，则恢复该文件。

**Step 3: 检查 middleware.ts**

确保 middleware 不引用已删除的路由。如果 middleware 只做 Supabase auth 处理，保持不变。

**Step 4: 验证构建成功**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build successful

**Step 5: Commit**

```bash
git add -A
git commit -m "fix: resolve import errors after module cleanup"
```

---

## Task 5: 清理教育相关文案

**Files:**
- Modify: `components/main/WeChatAIGeneratorPage.tsx` — 移除 "AP 化学" 等教育文案
- Modify: `app/api/wechat/generate/route.ts` — 检查 prompt 中的教育术语

**Step 1: 更新 WeChatAIGeneratorPage.tsx 中的占位文案**

将以下教育相关文案替换为通用文案：

- 第 16-25 行 `DEFAULT_HTML`: 将 "本周化学作业通知" 改为通用示例
- 第 405 行 `placeholder`: 将 "AP 化学作业通知" 改为通用示例
- 第 454 行 URL placeholder: 更新为通用示例

新的 `DEFAULT_HTML`:
```html
<h1>本周活动通知</h1>
<p>各位读者好，本周我们将为大家分享最新活动资讯和精彩内容。</p>
<h2>本期内容</h2>
<ul>
  <li>活动预告与报名入口</li>
  <li>上期精彩回顾</li>
  <li>读者互动问答</li>
</ul>
<blockquote>关注我们，获取更多精彩内容。</blockquote>
```

新的 prompt placeholder:
```
例如：生成一篇公众号推文，介绍春季新品发布会，语气活泼，含活动流程和报名方式
```

新的 URL placeholder:
```
https://example.com/news/product-launch
https://example.com/events/spring-2026
```

**Step 2: 检查 API route 中的教育术语**

读取 `app/api/wechat/generate/route.ts`，检查 system prompt 中是否有教育特定文案。如果有，替换为通用公众号排版指令。

**Step 3: 验证页面显示**

```bash
curl -s http://localhost:3001 | grep -i "化学\|AP\|教师\|作业\|Deskmate"
```

Expected: 无教育相关文案

**Step 4: Commit**

```bash
git add components/main/WeChatAIGeneratorPage.tsx app/api/wechat/generate/route.ts
git commit -m "feat: replace education-specific copy with generic WeChat publisher content"
```

---

## Task 6: 安装 Tiptap 并替换 document.execCommand 编辑器

**Files:**
- Create: `components/wechat/RichEditor.tsx` — Tiptap 编辑器组件
- Modify: `components/main/WeChatAIGeneratorPage.tsx` — 用 RichEditor 替换 contentEditable div
- Modify: `package.json` — 新增 Tiptap 依赖

**Step 1: 安装 Tiptap 依赖**

```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-image
```

**Step 2: 查询 Tiptap 最新文档**

使用 Context7 查询 @tiptap/react 的最新用法（useEditor hook, EditorContent 组件, getHTML 方法）。

**Step 3: 创建 RichEditor 组件**

创建 `components/wechat/RichEditor.tsx`：

```typescript
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { useEffect, useCallback } from "react";
import {
  Bold, Italic, Heading2, List, Quote, ImagePlus, RemoveFormatting,
} from "lucide-react";

interface RichEditorProps {
  content: string;
  onUpdate: (html: string) => void;
  className?: string;
}

export default function RichEditor({ content, onUpdate, className }: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onUpdate(editor.getHTML());
    },
  });

  // 外部内容变化时同步到编辑器（如 AI 生成后）
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== content) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  const insertImage = useCallback((src: string, alt?: string) => {
    editor?.chain().focus().setImage({ src, alt: alt ?? "image" }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className={className}>
      {/* 工具栏 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`rounded border px-2 py-1 text-xs ${editor.isActive("bold") ? "bg-slate-200" : ""}`}
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`rounded border px-2 py-1 text-xs ${editor.isActive("italic") ? "bg-slate-200" : ""}`}
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`rounded border px-2 py-1 text-xs ${editor.isActive("heading", { level: 2 }) ? "bg-slate-200" : ""}`}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`rounded border px-2 py-1 text-xs ${editor.isActive("bulletList") ? "bg-slate-200" : ""}`}
        >
          <List className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`rounded border px-2 py-1 text-xs ${editor.isActive("blockquote") ? "bg-slate-200" : ""}`}
        >
          <Quote className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          className="rounded border px-2 py-1 text-xs"
        >
          <RemoveFormatting className="h-3.5 w-3.5" />
        </button>
        {/* 图片插入按钮通过 props 回调处理 */}
      </div>

      {/* 编辑器内容 */}
      <EditorContent
        editor={editor}
        className="min-h-[520px] rounded-lg border border-slate-300 p-3 text-sm leading-7 outline-hidden prose prose-sm max-w-none"
      />
    </div>
  );
}
```

**Step 4: 在 WeChatAIGeneratorPage 中替换编辑器**

替换 contentEditable div 和 `runCommand` / `insertHtmlAtCursor` 逻辑：

- 移除 `editorRef`、`runCommand`、`insertHtmlAtCursor`、`handleDrop`（编辑器层面）、`handlePaste`
- 用 `<RichEditor content={editorHtml} onUpdate={setEditorHtml} />` 替换
- 保留图片插入按钮（通过 RichEditor 的 insertImage 方法）
- 调整 preview dirty 逻辑

**Step 5: 验证编辑器功能**

在浏览器中测试：
1. 能正常编辑文本
2. 加粗、斜体、标题、列表、引用功能正常
3. 可以插入图片（拖拽 / 粘贴）
4. AI 生成后编辑器内容自动更新
5. 预览同步正确

**Step 6: Commit**

```bash
git add components/wechat/RichEditor.tsx components/main/WeChatAIGeneratorPage.tsx package.json package-lock.json
git commit -m "feat: replace deprecated document.execCommand with Tiptap rich editor"
```

---

## Task 7: 新增 URL 截图 API

**Files:**
- Create: `app/api/screenshot/route.ts` — Puppeteer URL 截图端点
- Modify: `components/main/WeChatAIGeneratorPage.tsx` — 添加 URL 输入→截图→转换流程

**Step 1: 创建截图 API**

创建 `app/api/screenshot/route.ts`：

```typescript
import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

const BLOCKED_HOSTS = ["127.0.0.1", "localhost", "0.0.0.0", "169.254.169.254", "metadata.google.internal"];

function isPrivateIP(hostname: string): boolean {
  // Block private IP ranges: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = typeof body.url === "string" ? body.url.trim() : "";

    if (!url) {
      return NextResponse.json({ ok: false, error: "URL 不能为空" }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ ok: false, error: "URL 格式无效" }, { status: 400 });
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ ok: false, error: "仅支持 http/https 协议" }, { status: 400 });
    }

    if (BLOCKED_HOSTS.includes(parsed.hostname) || isPrivateIP(parsed.hostname)) {
      return NextResponse.json({ ok: false, error: "不允许访问内网地址" }, { status: 403 });
    }

    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    const screenshot = await page.screenshot({ fullPage: true, encoding: "base64", type: "png" });
    const viewport = page.viewport();

    await browser.close();

    return NextResponse.json({
      ok: true,
      image: screenshot,
      width: viewport?.width ?? 1440,
      height: viewport?.height ?? 900,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "截图失败" },
      { status: 500 }
    );
  }
}
```

**Step 2: 在前端添加 URL→截图→转换流程**

在 WeChatAIGeneratorPage 的 "Canva 设计稿转微信排版" 区域下方增加一个 URL 输入框：

- 用户输入 URL → 点击"截图并转换"
- 前端调用 `/api/screenshot` 获取 base64 图片
- 将图片作为设计稿发送给 `/api/wechat/generate` 的 `convert` action

**Step 3: SSRF 防护验证**

```bash
curl -X POST http://localhost:3001/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{"url": "http://127.0.0.1:3001"}'
```

Expected: `{"ok":false,"error":"不允许访问内网地址"}`

**Step 4: Commit**

```bash
git add app/api/screenshot/route.ts components/main/WeChatAIGeneratorPage.tsx
git commit -m "feat: add URL screenshot API with SSRF protection"
```

---

## Task 8: 清理 package.json 依赖

**Files:**
- Modify: `package.json`

**Step 1: 移除不再需要的依赖**

```bash
npm uninstall @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities katex @types/katex motion openai jspdf date-fns html2canvas pdf-parse @types/pdf-parse
```

保留的依赖：
- `@anthropic-ai/sdk` — Claude API
- `@napi-rs/canvas` — PDF 图片提取需要
- `@radix-ui/react-slot` — shadcn 依赖
- `@supabase/ssr`, `@supabase/supabase-js` — 认证
- `class-variance-authority`, `clsx`, `tailwind-merge` — 样式工具
- `lucide-react` — 图标
- `mammoth` — DOCX 解析（document-parser 使用）
- `next`, `react`, `react-dom` — 框架
- `next-themes` — 主题
- `pdfjs-dist` — PDF 解析
- `puppeteer` — 截图
- `xlsx` — Excel 解析
- `jszip` — PPTX 解析
- `zod` — 验证
- `@tiptap/*` — 新增的编辑器

移除检查：检查 `@radix-ui/react-checkbox`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-label` 是否被 shadcn ui 组件使用。如果不被使用则移除。

**Step 2: 检查 pdfjs-dist 是否仍被使用**

```bash
grep -r "pdfjs-dist" lib/ --include="*.ts" --include="*.tsx"
```

Expected: `lib/wechat/pdf-image-extractor.ts` 和可能的 `lib/wechat/document-parser.ts` 引用它。保留。

**Step 3: 验证构建**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build successful

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove unused dependencies after education module cleanup"
```

---

## Task 9: 清理 Radix UI / Shadcn 未使用组件

**Files:**
- Check: `components/ui/` — 确认哪些 shadcn 组件被使用
- Delete: 未使用的 ui 组件

**Step 1: 检查每个 ui 组件的引用**

```bash
for file in components/ui/*.tsx; do
  name=$(basename "$file" .tsx)
  count=$(grep -r "$name" components/ lib/ app/ --include="*.tsx" --include="*.ts" -l | wc -l)
  echo "$name: $count references"
done
```

**Step 2: 删除未被引用的组件**

仅保留被 WeChatAIGeneratorPage 或其他保留代码引用的组件。

**Step 3: 移除对应的 Radix 依赖（如果组件被删除）**

```bash
# 示例：如果 checkbox 组件被删除
npm uninstall @radix-ui/react-checkbox
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove unused Shadcn UI components and Radix dependencies"
```

---

## Task 10: 最终验证和清理

**Files:**
- Check: all remaining files

**Step 1: 完整构建测试**

```bash
npm run build
```

Expected: Build successful, no errors

**Step 2: 运行 lint**

```bash
npm run lint 2>&1 | tail -20
```

修复任何 lint 错误。

**Step 3: 手动功能验证**

启动 dev server 并测试：

1. 首页加载 → 显示微信公众号 AI 排版工具
2. 上传设计稿（图片）→ AI 转换成功
3. AI 对话生成内容 → 成功
4. AI 一键排版 → 成功
5. 切换主题 → 预览更新
6. 复制到公众号 → 剪贴板包含 HTML
7. 导出 HTML → 文件下载
8. Tiptap 编辑器正常工作（加粗、斜体、标题、列表、引用、图片）
9. 设备预览切换（mobile/tablet/desktop）
10. URL 截图 → 转换成功（如果 Puppeteer 可用）

**Step 4: 清理临时文件**

```bash
rm -f /tmp/smoke.png /tmp/std-*.png
```

**Step 5: 最终 Commit**

```bash
git add -A
git commit -m "chore: final cleanup and verification for WeChat publisher standalone"
```

---

## 执行顺序

```
Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9 → Task 10
 (删除后端)  (删除前端)  (改路由)  (修 import) (改文案) (Tiptap) (截图API) (依赖) (UI清理) (验证)
```

所有 task 严格顺序执行，因为前一个 task 的删除/修改会影响后续 task 的操作。

---

## 风险点

| 风险 | 缓解措施 |
|------|---------|
| 删除代码后有隐藏依赖 | Task 4 专门修复 import 错误 |
| Tiptap 输出的 HTML 格式与微信不兼容 | 保留 `styleRichHtml` 函数做后处理 |
| Puppeteer 在某些环境无法运行 | URL 截图为可选功能，不阻塞核心流程 |
| `@napi-rs/canvas` 在某些平台不可用 | PDF 图片提取降级为跳过，不影响图片直传 |
| shadcn 组件被意外删除 | Task 9 先检查引用再删除 |
