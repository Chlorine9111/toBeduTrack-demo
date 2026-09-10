# 微信排版 - 文档上传 & 图片上传 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让教师可以上传参考文档和图片，AI 读取文档内容 + 识别图片后自动生成排版好的公众号文章。

**Architecture:** 前端新增两个上传区（文档 + 图片），暂存在 React state 中。点击生成时以 multipart/form-data 上传至 `/api/wechat/generate`，服务端解析文档提取文本、用 Claude Vision 识别图片，综合生成 HTML。

**Tech Stack:** mammoth (docx), xlsx (SheetJS), pdf-parse (PDF), jszip (pptx), Claude Vision API, Next.js App Router multipart form handling

---

### Task 1: 安装文档解析依赖

**Files:**
- Modify: `package.json`

**Step 1: 安装依赖**

```bash
cd /Users/mac/Documents/project/toBeduTrack-feat-wechat-ai-rich-editor-v2
pnpm add mammoth xlsx pdf-parse jszip
pnpm add -D @types/pdf-parse
```

**Step 2: 验证安装成功**

```bash
pnpm list mammoth xlsx pdf-parse jszip
```

Expected: 4 个包都列出版本号

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add document parsing dependencies (mammoth, xlsx, pdf-parse, jszip)"
```

---

### Task 2: 创建文档解析模块

**Files:**
- Create: `lib/wechat/document-parser.ts`

**Step 1: 创建文档解析模块**

创建 `lib/wechat/document-parser.ts`：

```typescript
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import pdfParse from "pdf-parse";
import JSZip from "jszip";

export interface ParsedDocument {
  fileName: string
  fileType: string
  textContent: string
}

const MAX_TEXT_LENGTH = 15000;

function truncateText(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return text.slice(0, MAX_TEXT_LENGTH) + "\n...(内容已截断)";
}

async function parseDocx(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
  const result = await mammoth.extractRawText({ buffer });
  return {
    fileName,
    fileType: "docx",
    textContent: truncateText(result.value.trim())
  };
}

async function parseXlsx(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const lines: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    lines.push(`[工作表: ${sheetName}]`);
    const csv = XLSX.utils.sheet_to_csv(sheet);
    lines.push(csv.trim());
    lines.push("");
  }

  return {
    fileName,
    fileType: "xlsx",
    textContent: truncateText(lines.join("\n").trim())
  };
}

async function parsePdf(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
  const result = await pdfParse(buffer);
  return {
    fileName,
    fileType: "pdf",
    textContent: truncateText(result.text.trim())
  };
}

async function parsePptx(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
  const zip = await JSZip.loadAsync(buffer);
  const slideTexts: string[] = [];

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort();

  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async("text");
    const texts = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    const slideContent = texts
      .map((t) => t.replace(/<\/?a:t>/g, "").trim())
      .filter(Boolean)
      .join(" ");
    if (slideContent) {
      const slideNum = slidePath.match(/slide(\d+)/)?.[1] || "?";
      slideTexts.push(`[幻灯片 ${slideNum}] ${slideContent}`);
    }
  }

  return {
    fileName,
    fileType: "pptx",
    textContent: truncateText(slideTexts.join("\n").trim() || "(未提取到文本内容)")
  };
}

function parsePlainText(buffer: Buffer, fileName: string, fileType: string): ParsedDocument {
  return {
    fileName,
    fileType,
    textContent: truncateText(buffer.toString("utf-8").trim())
  };
}

function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

const SUPPORTED_EXTENSIONS = new Set(["docx", "doc", "xlsx", "xls", "pdf", "pptx", "ppt", "txt", "md"]);

export function isSupportedDocument(fileName: string): boolean {
  return SUPPORTED_EXTENSIONS.has(getFileExtension(fileName));
}

export async function parseDocument(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
  const ext = getFileExtension(fileName);

  switch (ext) {
    case "docx":
    case "doc":
      return parseDocx(buffer, fileName);
    case "xlsx":
    case "xls":
      return parseXlsx(buffer, fileName);
    case "pdf":
      return parsePdf(buffer, fileName);
    case "pptx":
    case "ppt":
      return parsePptx(buffer, fileName);
    case "txt":
    case "md":
      return parsePlainText(buffer, fileName, ext);
    default:
      throw new Error(`不支持的文件格式: ${ext}`);
  }
}

export function formatDocumentsForPrompt(docs: ParsedDocument[]): string {
  if (docs.length === 0) return "";

  const sections = docs.map(
    (doc) => `--- ${doc.fileName} (${doc.fileType}) ---\n${doc.textContent}`
  );

  return `\n\n【参考文档内容】\n${sections.join("\n\n")}`;
}
```

**Step 2: 验证 TypeScript 编译无错**

```bash
npx tsc --noEmit lib/wechat/document-parser.ts 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add lib/wechat/document-parser.ts
git commit -m "feat(wechat): add document parser for docx/xlsx/pdf/pptx/txt/md"
```

---

### Task 3: 改造 API route 支持 multipart/form-data + 文档 + 图片

**Files:**
- Modify: `app/api/wechat/generate/route.ts`

**Step 1: 重写 route.ts**

将 `app/api/wechat/generate/route.ts` 完整替换为：

```typescript
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { parseDocument, formatDocumentsForPrompt, isSupportedDocument, type ParsedDocument } from "@/lib/wechat/document-parser";

const MAX_DOC_SIZE = 10 * 1024 * 1024;  // 10MB
const MAX_IMG_SIZE = 5 * 1024 * 1024;   // 5MB
const MAX_DOCS = 5;
const MAX_IMAGES = 10;

function sanitizeHtml(html: string) {
  return html
    .replace(/<\s*(script|iframe|object|embed|style|link|form|input|button)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|iframe|object|embed|style|link|form|input|button)\b[^>]*\/?\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, " $1=$2#$2")
    .replace(/\s(href|src)\s*=\s*javascript:[^\s>]+/gi, ' $1="#"');
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fallbackHtml(prompt: string, draft: string, action: string) {
  const heading = escapeHtml(prompt || "教学通知");
  const body = escapeHtml((draft || "请填写教学安排、任务清单与提交要求。").slice(0, 1200));

  if (action === "typeset") {
    return `<h1>${heading}</h1><p>${body.replace(/\n+/g, "</p><p>")}</p>`;
  }

  return [
    `<h1>${heading}</h1>`,
    "<h2>本次任务</h2>",
    "<ul><li>完成课堂学习任务</li><li>按要求提交作业</li><li>课前准备下节课材料</li></ul>",
    `<p>${body.replace(/\n+/g, "<br/>")}</p>`,
    "<blockquote>如有疑问请在班级群留言。</blockquote>"
  ].join("");
}

function getImageMediaType(mimeType: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  const mapping: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
    "image/gif": "image/gif",
    "image/webp": "image/webp"
  };
  return mapping[mimeType] || "image/jpeg";
}

interface GeneratePayload {
  action: string
  prompt: string
  draft: string
  htmlDraft: string
  documents: ParsedDocument[]
  imageBuffers: { data: Buffer; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; fileName: string }[]
}

async function generateWithAnthropic(payload: GeneratePayload) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"
  });

  const hasDocuments = payload.documents.length > 0;
  const hasImages = payload.imageBuffers.length > 0;

  const docContext = formatDocumentsForPrompt(payload.documents);

  let instruction: string;
  if (payload.action === "typeset") {
    instruction = "你是公众号排版助手。请将给定草稿排版为适合微信公众号发布的 HTML，仅输出 HTML，不要 markdown 代码块。";
  } else {
    instruction = [
      "你是教师公众号文案助手。请根据用户需求生成可发布到公众号的 HTML 内容，仅输出 HTML，不要 markdown 代码块。",
      "要求：结构清晰，包含标题、小标题、要点列表等。",
      hasDocuments ? "用户上传了参考文档，请准确引用文档中的数据（人名、成绩、奖项等），不得编造。如果用户没有提供明确的标题或主题，请根据文档内容自动判断文章主题。" : "",
      hasImages
        ? [
            `用户上传了 ${payload.imageBuffers.length} 张图片。`,
            "请在生成的 HTML 中，在与图片内容相关的段落之后插入 <img> 标签。",
            "图片标签格式：<img src=\"__IMAGE_N__\" alt=\"图片描述\" />，其中 N 从 1 开始。",
            "放置原则：图片应紧跟与其内容最相关的段落。例如获奖名单图片应放在提到获奖者的段落之后。"
          ].join(" ")
        : ""
    ].filter(Boolean).join("\n");
  }

  const userContentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

  // 添加图片 content blocks（Claude Vision）
  for (let i = 0; i < payload.imageBuffers.length; i++) {
    const img = payload.imageBuffers[i];
    userContentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mediaType,
        data: img.data.toString("base64")
      }
    });
    userContentBlocks.push({
      type: "text",
      text: `以上是用户上传的图片 ${i + 1}（文件名: ${img.fileName}），请识别其内容并在文章合适位置引用，使用占位符 __IMAGE_${i + 1}__。`
    });
  }

  // 添加文本 prompt
  const textParts = [
    `用户需求: ${payload.prompt || (hasDocuments ? "请根据上传的文档内容生成公众号文章" : "请生成教学通知")}`,
    payload.draft || payload.htmlDraft ? `已有草稿: ${payload.draft || payload.htmlDraft}` : "",
    docContext
  ].filter(Boolean);

  userContentBlocks.push({ type: "text", text: textParts.join("\n") });

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4000,
    messages: [{ role: "user", content: userContentBlocks }],
    system: instruction
  });

  let text = response.content
    .map((block) => ("text" in block ? block.text : ""))
    .join("\n")
    .replace(/^```html\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  // 替换图片占位符为 base64 data URL
  for (let i = 0; i < payload.imageBuffers.length; i++) {
    const img = payload.imageBuffers[i];
    const dataUrl = `data:${img.mediaType};base64,${img.data.toString("base64")}`;
    text = text.replace(new RegExp(`__IMAGE_${i + 1}__`, "g"), dataUrl);
  }

  return text;
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let action = "generate";
    let prompt = "";
    let draft = "";
    let htmlDraft = "";
    const documents: ParsedDocument[] = [];
    const imageBuffers: GeneratePayload["imageBuffers"] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();

      action = (formData.get("action") as string) || "generate";
      prompt = (formData.get("prompt") as string) || "";
      draft = (formData.get("draft") as string) || "";
      htmlDraft = (formData.get("htmlDraft") as string) || "";

      // 解析文档
      const docFiles = formData.getAll("documents") as File[];
      for (const file of docFiles.slice(0, MAX_DOCS)) {
        if (file.size > MAX_DOC_SIZE) continue;
        if (!isSupportedDocument(file.name)) continue;
        try {
          const buffer = Buffer.from(await file.arrayBuffer());
          const parsed = await parseDocument(buffer, file.name);
          documents.push(parsed);
        } catch {
          // 跳过解析失败的文档
        }
      }

      // 解析图片
      const imgFiles = formData.getAll("images") as File[];
      for (const file of imgFiles.slice(0, MAX_IMAGES)) {
        if (file.size > MAX_IMG_SIZE) continue;
        if (!file.type.startsWith("image/")) continue;
        const buffer = Buffer.from(await file.arrayBuffer());
        imageBuffers.push({
          data: buffer,
          mediaType: getImageMediaType(file.type),
          fileName: file.name
        });
      }
    } else {
      // 兼容旧的 JSON 格式
      const json = await req.json().catch(() => ({}));
      action = json.action || "generate";
      prompt = json.prompt || "";
      draft = json.draft || "";
      htmlDraft = json.htmlDraft || "";
    }

    if (!["generate", "typeset"].includes(action)) {
      return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 422 });
    }

    const generated = await generateWithAnthropic({
      action, prompt, draft, htmlDraft, documents, imageBuffers
    });

    const html = sanitizeHtml(generated || fallbackHtml(prompt, draft, action));
    return NextResponse.json({ ok: true, html });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "请求处理失败"
    }, { status: 500 });
  }
}
```

**Step 2: 验证编译**

```bash
npx tsc --noEmit 2>&1 | grep "wechat/generate" | head -10
```

**Step 3: Commit**

```bash
git add app/api/wechat/generate/route.ts
git commit -m "feat(wechat): support multipart upload with document parsing and image vision"
```

---

### Task 4: 创建 FileUploadZone 组件

**Files:**
- Create: `components/main/wechat/FileUploadZone.tsx`

**Step 1: 创建组件**

创建 `components/main/wechat/FileUploadZone.tsx`：

```tsx
"use client";

import { type DragEvent, useRef, useState } from "react";
import { FileText, FileSpreadsheet, FileImage, File, Presentation, X, Plus } from "lucide-react";

interface FileUploadZoneProps {
  files: File[]
  onChange: (files: File[]) => void
  accept: string
  maxFiles: number
  maxSizeMB: number
  label: string
  icon: React.ReactNode
}

const EXTENSION_ICONS: Record<string, React.ReactNode> = {
  docx: <FileText className="h-5 w-5 text-blue-600" />,
  doc: <FileText className="h-5 w-5 text-blue-600" />,
  xlsx: <FileSpreadsheet className="h-5 w-5 text-green-600" />,
  xls: <FileSpreadsheet className="h-5 w-5 text-green-600" />,
  pdf: <FileText className="h-5 w-5 text-red-600" />,
  pptx: <Presentation className="h-5 w-5 text-orange-500" />,
  ppt: <Presentation className="h-5 w-5 text-orange-500" />,
  txt: <File className="h-5 w-5 text-slate-500" />,
  md: <File className="h-5 w-5 text-slate-500" />,
  jpg: <FileImage className="h-5 w-5 text-purple-500" />,
  jpeg: <FileImage className="h-5 w-5 text-purple-500" />,
  png: <FileImage className="h-5 w-5 text-purple-500" />,
  gif: <FileImage className="h-5 w-5 text-purple-500" />,
  webp: <FileImage className="h-5 w-5 text-purple-500" />
};

function getFileIcon(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return EXTENSION_ICONS[ext] || <File className="h-5 w-5 text-slate-400" />;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileUploadZone({
  files,
  onChange,
  accept,
  maxFiles,
  maxSizeMB,
  label,
  icon
}: FileUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const addFiles = (incoming: File[]) => {
    const valid = incoming.filter(
      (f) => f.size <= maxSizeBytes
    );
    const merged = [...files, ...valid].slice(0, maxFiles);
    onChange(merged);
  };

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    addFiles(dropped);
  };

  return (
    <div className="flex-1 min-w-0">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        {icon}
        {label}
        <span className="text-xs text-slate-400">({files.length}/{maxFiles})</span>
      </div>

      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((file, idx) => (
            <div
              key={`${file.name}-${idx}`}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
            >
              {getFileIcon(file.name)}
              <div className="min-w-0">
                <div className="truncate max-w-[120px] font-medium text-slate-700">{file.name}</div>
                <div className="text-slate-400">{formatFileSize(file.size)}</div>
              </div>
              <button
                type="button"
                onClick={() => removeFile(idx)}
                className="ml-1 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-3 text-xs transition-colors ${
          dragOver
            ? "border-slate-400 bg-slate-100"
            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
        } ${files.length >= maxFiles ? "pointer-events-none opacity-50" : ""}`}
      >
        <Plus className="h-4 w-4 text-slate-400" />
        <span className="text-slate-500">
          拖放或点击上传（单个最大 {maxSizeMB}MB）
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => {
          const selected = Array.from(e.target.files || []);
          addFiles(selected);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}
```

**Step 2: 验证编译**

```bash
npx tsc --noEmit 2>&1 | grep "FileUploadZone" | head -5
```

**Step 3: Commit**

```bash
git add components/main/wechat/FileUploadZone.tsx
git commit -m "feat(wechat): add FileUploadZone reusable upload component"
```

---

### Task 5: 创建 ImageUploadZone 组件

**Files:**
- Create: `components/main/wechat/ImageUploadZone.tsx`

**Step 1: 创建组件**

创建 `components/main/wechat/ImageUploadZone.tsx`：

```tsx
"use client";

import { type DragEvent, useEffect, useRef, useState } from "react";
import { ImagePlus, X, Plus } from "lucide-react";

interface ImageUploadZoneProps {
  files: File[]
  onChange: (files: File[]) => void
  maxFiles: number
  maxSizeMB: number
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImageThumbnail({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200">
      {src && (
        <img
          src={src}
          alt={file.name}
          className="h-full w-full object-cover"
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
      <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
        <div className="truncate text-[10px] text-white">{file.name}</div>
      </div>
    </div>
  );
}

export default function ImageUploadZone({
  files,
  onChange,
  maxFiles,
  maxSizeMB
}: ImageUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const addFiles = (incoming: File[]) => {
    const valid = incoming.filter(
      (f) => f.type.startsWith("image/") && f.size <= maxSizeBytes
    );
    const merged = [...files, ...valid].slice(0, maxFiles);
    onChange(merged);
  };

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <div className="flex-1 min-w-0">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <ImagePlus className="h-4 w-4" />
        文章配图
        <span className="text-xs text-slate-400">({files.length}/{maxFiles})</span>
      </div>

      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((file, idx) => (
            <ImageThumbnail
              key={`${file.name}-${idx}`}
              file={file}
              onRemove={() => removeFile(idx)}
            />
          ))}
        </div>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-3 text-xs transition-colors ${
          dragOver
            ? "border-slate-400 bg-slate-100"
            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
        } ${files.length >= maxFiles ? "pointer-events-none opacity-50" : ""}`}
      >
        <Plus className="h-4 w-4 text-slate-400" />
        <span className="text-slate-500">
          拖放或点击上传图片（单张最大 {maxSizeMB}MB）
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(Array.from(e.target.files || []));
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/main/wechat/ImageUploadZone.tsx
git commit -m "feat(wechat): add ImageUploadZone with thumbnail preview"
```

---

### Task 6: 集成上传组件到 WeChatAIGeneratorPage

**Files:**
- Modify: `components/main/WeChatAIGeneratorPage.tsx`

**Step 1: 添加 imports 和 state**

在文件顶部添加 imports，在组件中添加文件 state。

在 import 行添加：
```typescript
import FileUploadZone from "@/components/main/wechat/FileUploadZone";
import ImageUploadZone from "@/components/main/wechat/ImageUploadZone";
import { Paperclip } from "lucide-react";
```

在 lucide-react import 中追加 `Paperclip`。

在组件内 `useState` 区域添加：
```typescript
const [docFiles, setDocFiles] = useState<File[]>([]);
const [imgFiles, setImgFiles] = useState<File[]>([]);
```

**Step 2: 修改 callAIGeneration 函数**

将 `callAIGeneration` 替换为使用 FormData：

```typescript
const callAIGeneration = async (action: AIAction) => {
  setLoading(true);
  setStatus(null);

  try {
    const formData = new FormData();
    formData.append("action", action);
    formData.append("prompt", prompt.trim());
    formData.append("draft", htmlToPlainText(editorHtml));
    formData.append("htmlDraft", editorHtml);

    for (const file of docFiles) {
      formData.append("documents", file);
    }
    for (const file of imgFiles) {
      formData.append("images", file);
    }

    const response = await fetch("/api/wechat/generate", {
      method: "POST",
      body: formData
    });

    const data = await response.json();
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "AI 生成失败");
    }

    if (typeof data.html === "string" && data.html.trim()) {
      setEditorHtml(data.html);
    }

    setStatus({ type: "success", message: action === "typeset" ? "AI 一键排版完成" : "AI 内容已生成" });
  } catch (error) {
    setStatus({ type: "error", message: error instanceof Error ? error.message : "请求失败" });
  } finally {
    setLoading(false);
  }
};
```

**Step 3: 在 JSX 中插入上传区域**

在 prompt 输入区的 `</section>` 之后、`<div className="grid gap-4 xl:grid-cols-...">` 之前插入：

```tsx
{/* 文件上传区 */}
<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs md:p-5">
  <div className="flex flex-col gap-4 md:flex-row">
    <FileUploadZone
      files={docFiles}
      onChange={setDocFiles}
      accept=".docx,.doc,.xlsx,.xls,.pdf,.pptx,.ppt,.txt,.md"
      maxFiles={5}
      maxSizeMB={10}
      label="参考文档"
      icon={<Paperclip className="h-4 w-4" />}
    />
    <ImageUploadZone
      files={imgFiles}
      onChange={setImgFiles}
      maxFiles={10}
      maxSizeMB={5}
    />
  </div>
  {(docFiles.length > 0 || imgFiles.length > 0) && (
    <p className="mt-2 text-xs text-slate-500">
      AI 将参考上传的文档内容生成文章，并将图片自动放置到相关段落。
    </p>
  )}
</section>
```

**Step 4: 验证编译 + 手动测试**

```bash
npx tsc --noEmit 2>&1 | head -20
```

然后在浏览器 http://localhost:3001/main/wechat 验证：
- 文档上传区显示正常
- 图片上传区显示缩略图
- 点击生成后 AI 能参考文档内容

**Step 5: Commit**

```bash
git add components/main/WeChatAIGeneratorPage.tsx
git commit -m "feat(wechat): integrate file and image upload zones into generator page"
```

---

### Task 7: 端到端验证

**Step 1: 启动开发服务器**

```bash
pnpm dev
```

**Step 2: 手动测试场景**

1. 打开 http://localhost:3001/main/wechat
2. 上传一个 .txt 文件（含人名列表），点击"对话生成内容"
3. 验证生成的文章包含文件中的人名
4. 上传一张图片，再次生成
5. 验证图片被插入到文章相关位置
6. 测试无文件时的旧流程仍然正常（JSON 兼容）

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(wechat): complete document upload and image upload for AI article generation"
```
