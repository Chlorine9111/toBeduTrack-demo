# WeChat Publisher Redesign - Design Document

## 1. Overview

Redesign the WeChat article publisher branch into a standalone tool focused on two capabilities:
1. **AI Generate**: Input a prompt, AI generates publishable WeChat article HTML
2. **AI Restore** (core differentiator): Upload a design mockup (image/PDF/URL), AI extracts content and layout, outputs WeChat-compatible inline-style HTML

Target users: General WeChat Official Account operators (not limited to education).

This branch strips all education-specific features and becomes a dedicated WeChat publishing tool.

## 2. Architecture

### 2.1 Route Structure

```
app/
├── layout.tsx              # Simplified root layout (remove Figma script)
├── page.tsx                # Main page → renders WeChatEditor
├── globals.css             # Simplified styles
├── api/
│   ├── wechat/
│   │   └── generate/route.ts   # Existing: AI content generation + typesetting
│   ├── restore/
│   │   └── route.ts            # NEW: Core AI restore endpoint
│   └── screenshot/
│       └── route.ts            # NEW: URL → screenshot via Puppeteer
└── auth/
    └── callback/route.ts       # Keep Supabase auth callback
```

### 2.2 Retained Modules

```
lib/wechat/themes.ts       # Theme system (expand from 6 to 10+ themes)
lib/wechat/export.ts        # HTML download utility
lib/pdf-scan/mathpix.ts     # Mathpix OCR for PDF
lib/pdf-scan/ai-vision.ts   # Claude Vision for image analysis
lib/pdf-scan/pdf-render.ts  # PDF page rendering
lib/pdf-scan/types.ts       # Type definitions
lib/supabase/               # Auth + storage infrastructure
lib/auth/bypass.ts          # Auth bypass for dev
lib/teachers/               # User management
lib/api/client.ts           # Fetch wrapper
lib/api/response.ts         # API response helpers
lib/validation/api.ts       # Validation utilities
middleware.ts               # Supabase middleware
supabase/                   # DB migrations
```

### 2.3 Deleted Modules

Everything else: components/home/, components/landing/, components/dashboard/,
components/developer/, components/lesson-plan/, components/main/chatflow/,
components/main/ (except WeChatAIGeneratorPage as reference),
app/about/, app/blog/, app/pricing/, app/privacy/, app/terms/,
app/developer/, app/exercises/, app/lesson-plans/, app/lp/,
app/main/ (entire directory), app/api/ai/, app/api/chat/,
app/api/curriculum/, app/api/exercises/, app/api/rubrics/,
app/api/worksheets/, app/api/lesson-plans/, app/api/feedback/,
app/api/developer/, app/api/public/, app/api/pdf/ (all except scan-related),
lib/ai/, lib/chat/, lib/curriculum/, lib/exercise/, lib/feedback/,
lib/home/, lib/landing/, lib/lesson-plan/, lib/pdf/ (generator, not scanner),
lib/rubric/, lib/worksheet/, lib/api/adapters/ (all except pdf-scan),
lib/api/ndjson.ts, lib/api/rate-limit.ts, lib/api/request.ts,
lib/api/teacher-context.ts, lib/pdf-file-store.ts,
hooks/ (all), types/ (all), tests/, document/,
DESIGN_PROMPT.md, verify-features.mjs

## 3. Core Feature: AI Restore Engine

### 3.1 Input Formats

| Format | Processing Pipeline |
|--------|-------------------|
| Image (PNG/JPG/WebP) | → base64 → Claude Vision → structured JSON |
| PDF | → Mathpix OCR (text+LaTeX) + Claude Vision (layout) → merge → JSON |
| URL | → Puppeteer screenshot → same as image pipeline |

### 3.2 Processing Flow

```
Input → Claude Vision analysis (single API call)
  Output: DesignStructure JSON
    {
      title: string,
      sections: Section[],
      style: { tone, colorScheme, hasDecorations }
    }

DesignStructure + matched theme → deterministic HTML generation
  (No AI needed for HTML step — template-based, fast, predictable)

HTML → preview + editor → copy/export
```

### 3.3 Section Types

```typescript
type Section =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "blockquote"; text: string }
  | { type: "image"; description: string; position: "left" | "center" | "right" }
  | { type: "divider" }
  | { type: "code"; language?: string; content: string }
```

### 3.4 API: POST /api/restore

Request (multipart/form-data):
- type: "image" | "pdf" | "url"
- file?: File (for image/pdf)
- url?: string (for url type)
- themeId?: string (optional, auto-match if omitted)

Response:
```json
{
  "ok": true,
  "html": "<article style=\"...\">...</article>",
  "structure": { "title": "...", "sections": [...], "style": {...} },
  "matchedTheme": "minimal",
  "imageSlots": [
    { "index": 0, "description": "header banner image", "placeholder": true }
  ]
}
```

### 3.5 API: POST /api/screenshot

Request:
- url: string

Response:
- image: base64 PNG string
- width: number
- height: number

Uses Puppeteer to capture full-page screenshot at 1440px viewport.

## 4. Frontend Architecture

### 4.1 Component Tree

```
components/
├── wechat/
│   ├── WeChatEditor.tsx          # Main page container + state management
│   ├── TopBar.tsx                # Logo, theme selector, export buttons
│   ├── InputPanel.tsx            # Left panel: tab switching
│   │   ├── GenerateTab.tsx       # AI generate mode (prompt + buttons)
│   │   ├── RestoreTab.tsx        # AI restore mode (upload/URL + button)
│   │   └── RichEditor.tsx        # Tiptap-based rich text editor
│   ├── PreviewPanel.tsx          # Right panel: device switcher + preview
│   ├── UploadZone.tsx            # Drag-and-drop file upload component
│   ├── ImageSlotAlert.tsx        # Alert bar for image placeholders
│   └── CompatibilityBar.tsx      # Bottom compatibility warnings
└── ui/                           # Shadcn UI components (keep)
```

### 4.2 Page Layout

Single page, two-column layout:
- Left (50%): Input panel (generate/restore tabs) + rich text editor
- Right (50%): Real-time preview with device switching (mobile/tablet/desktop)
- Top bar: branding, theme selector, export actions
- Bottom: compatibility warnings

### 4.3 State Management

Single component manages state via useReducer:

```typescript
type State = {
  mode: "generate" | "restore"
  html: string
  structure: DesignStructure | null
  themeId: WechatThemeId
  previewDevice: "mobile" | "tablet" | "desktop"
  loading: boolean
  status: { type: "success" | "error"; message: string } | null
  imageSlots: ImageSlot[]
}
```

### 4.4 Rich Text Editor

Replace deprecated document.execCommand with Tiptap:
- @tiptap/react + @tiptap/starter-kit
- Custom extension for inline-style HTML output (WeChat compatible)
- Toolbar: bold, italic, headings, lists, blockquote, image insert, clear formatting
- Real-time sync: editor changes → update HTML → preview re-renders

## 5. Theme System

Expand existing 6 themes, add auto-matching based on Vision analysis:

```typescript
function matchTheme(style: DetectedStyle): WechatThemeId {
  if (style.tone === "formal" && style.colorScheme === "cool") return "academic"
  if (style.tone === "playful") return "vibrant"
  if (style.colorScheme === "warm") return "classic"
  // ... more rules
  return "minimal" // default
}
```

## 6. Dependencies Changes

### Add
- @tiptap/react, @tiptap/pm, @tiptap/starter-kit, @tiptap/extension-image

### Remove (unused after cleanup)
- @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
- @napi-rs/canvas
- @radix-ui/react-checkbox, @radix-ui/react-dropdown-menu, @radix-ui/react-label
- katex, @types/katex
- motion (framer-motion)
- openai
- pdfjs-dist (keep puppeteer for screenshots)

### Keep
- @anthropic-ai/sdk, @supabase/ssr, @supabase/supabase-js
- clsx, tailwind-merge, class-variance-authority
- lucide-react
- zod
- next, react, react-dom
- puppeteer (for URL screenshots)
- next-themes
- @radix-ui/react-slot (shadcn dependency)

## 7. Error Handling

- Claude Vision fails → show error + suggest retry or try different image
- Mathpix OCR fails → fallback to Claude Vision only (image-based)
- URL screenshot fails → show error + suggest uploading screenshot manually
- All API calls have 60s timeout with AbortController
- AI restore API returns partial result if possible (text without layout)

## 8. Security

- Sanitize all AI-generated HTML (existing sanitizeHtml function)
- Validate uploaded file types (magic bytes check for PDF, MIME type for images)
- Max file size: 10MB for images, 10MB for PDF
- URL screenshot: validate URL format, block private IPs (SSRF prevention)
- No user credentials stored client-side
