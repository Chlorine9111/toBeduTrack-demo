# Export Dropdown 重设计 + 前后端打通

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按照参考 HTML 深度复刻 ExportDropdown 组件（Format + Version + Settings 三段式），集成到 ArtifactCanvas 导出流，确保 Agent 生成内容可真实导出 PDF。

**Architecture:** 重写 `ExportDropdown.tsx`，新增 `ExportVersion` 类型和 `version` 回调参数。在 `ArtifactCanvas.tsx` 的 `ArtifactActionBar` 中将简单按钮替换为 trigger+dropdown 模式，通过现有 `/api/pdf/export-markdown` 和 `/api/doc/export-pdf` API 实现真实 PDF 导出。

**Tech Stack:** React 19, Tailwind CSS 4, Lucide Icons, Next.js 15.3 App Router

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 重写 | `components/shells/ExportDropdown.tsx` | 全新三段式下拉菜单组件 |
| 修改 | `components/shells/index.ts` | 导出新增类型 |
| 修改 | `components/main/agent/ArtifactCanvas.tsx` | ArtifactActionBar 集成新下拉菜单 |

---

### Task 1: 重写 ExportDropdown 组件

**Files:**
- 重写: `components/shells/ExportDropdown.tsx`

- [ ] **Step 1: 重写 ExportDropdown 类型定义和 props**

新增 `ExportVersion` 类型（`"teacher" | "student" | "classroom"`），扩展 `onExport` 回调签名为 `(format, options: { paper, layout, version })`.

```typescript
export type ExportFormat = "pdf" | "docx" | "print" | "clipboard";
export type PaperSize = "a4" | "letter";
export type ExportLayout = "standard" | "compact";
export type ExportVersion = "teacher" | "student" | "classroom";

export type ExportOptions = {
  paper: PaperSize;
  layout: ExportLayout;
  version: ExportVersion;
};

type ExportDropdownProps = {
  open: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat, options: ExportOptions) => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
};
```

- [ ] **Step 2: 重写 ExportDropdown 组件 JSX——完全按参考 HTML 复刻**

参考布局（240px 宽，白底，cloud-shadow + ghost-border）：

1. **Format 区**: section label `FORMAT`（10px 大写），四个选项行（icon + label + 蓝色勾 ✓）
2. **分隔线**
3. **Version 区**: section label `VERSION`，三个选项行（Teacher/Student/Classroom，选中显示蓝色勾）
4. **分隔线**
5. **Settings 区**: section label `SETTINGS`
   - Paper Size: 标签 + 分段控件（A4/Letter，选中项白底+shadow）
   - Layout: 标签 + 分段控件（Standard/Compact，选中项白底+shadow）
6. **底部 CTA**: 全宽深色 Export 按钮（download icon + "Export"）

关键 CSS class 对齐参考：
- 容器: `w-[240px] bg-white rounded-lg p-1` + `box-shadow: 0px 4px 20px rgba(55,53,47,0.04)` + `border: 1px solid rgba(55,53,47,0.08)`
- Section label: `text-[10px] font-bold uppercase tracking-wider text-[rgba(55,53,47,0.35)]`
- 选项行: `px-2 py-1.5 text-sm hover:bg-[rgba(55,53,47,0.04)] rounded`
- 分段控件容器: `p-0.5 bg-[rgba(55,53,47,0.06)] rounded-lg`
- 分段控件选中: `bg-white rounded-md shadow-xs`
- 底部按钮: `bg-[#37352F] text-white rounded-lg text-sm font-semibold`

- [ ] **Step 3: 保留 click-outside 关闭逻辑**

复用现有的 `useEffect` + `mousedown` 监听逻辑，确保点击外部关闭。

- [ ] **Step 4: 验证类型导出**

确保 `components/shells/index.ts` 导出新类型：

```typescript
export { default as ExportDropdown } from "./ExportDropdown";
export type { ExportFormat, PaperSize, ExportLayout, ExportVersion, ExportOptions } from "./ExportDropdown";
```

---

### Task 2: 集成到 ArtifactCanvas

**Files:**
- 修改: `components/main/agent/ArtifactCanvas.tsx`

- [ ] **Step 1: 在 ArtifactActionBar 中添加 ExportDropdown 状态和 ref**

```typescript
const [exportOpen, setExportOpen] = useState(false);
const exportBtnRef = useRef<HTMLButtonElement>(null);
```

- [ ] **Step 2: 替换简单 "Export PDF" 按钮为 trigger + dropdown**

将现有的 `handleExportPdf` 按钮替换为：
- 一个 "Export" trigger 按钮（带 `ChevronDown` icon），点击切换 `exportOpen`
- `ExportDropdown` 组件挂载在 trigger 下方

trigger 按钮样式参考 HTML：
```
inline-flex items-center gap-2 px-3 py-1.5 bg-[#37352F] text-white rounded-lg text-xs font-medium
```

dropdown 用 `absolute right-0 mt-2 z-50` 定位。

- [ ] **Step 3: 实现 handleExport 回调分发**

根据 `format` 分发：

```typescript
const handleExport = useCallback(async (format: ExportFormat, options: ExportOptions) => {
  setExportOpen(false);

  if (format === "clipboard") {
    await navigator.clipboard.writeText(artifact.rawContent);
    // show success toast
    return;
  }

  if (format === "print") {
    window.print();
    return;
  }

  if (format === "docx") {
    // Tiptap artifact → officialDocxExporter
    // 非 Tiptap → 降级 Markdown 下载
    handleExportMarkdown();
    return;
  }

  // format === "pdf"
  // 复用现有 handleExportPdf 逻辑，但传入 options.paper
  await exportPdfWithOptions(options);
}, [...]);
```

- [ ] **Step 4: 修改 PDF 导出逻辑，传入 pageSize**

当前 `handleExportPdf` 硬编码 `pageSize: "A4"`。改为从 `options.paper` 读取：

```typescript
body: JSON.stringify({
  markdown: artifact.rawContent,
  title: artifact.title,
  pageSize: options.paper === "letter" ? "Letter" : "A4",
}),
```

- [ ] **Step 5: 保留 "Save to Library" 按钮**

Export trigger + dropdown 替换 "Export PDF" 按钮，但 "保存到内容库" 按钮保留原位不变。

---

### Task 3: Chrome CDP 测试导出

- [ ] **Step 1: 启动 dev server**

```bash
cd /Users/martin/Documents/个人项目/new-start && npm run dev
```

确认 `http://localhost:3001` 可访问。

- [ ] **Step 2: 导航到 Agent 页面**

打开 `http://localhost:3001/main/project` 或 Agent 路由。

- [ ] **Step 3: 生成一个 artifact**

在 Agent 对话中输入请求生成内容（如教案或习题），等待 artifact 出现在 Canvas。

- [ ] **Step 4: 打开 Export dropdown**

点击 Export trigger 按钮，截图验证：
- 三段式布局正确显示
- Format/Version/Settings 各选项可点击切换
- 样式与参考 HTML 一致

- [ ] **Step 5: 执行 PDF 导出**

选择 PDF + A4 + Standard，点击 Export，验证：
- 浏览器触发文件下载
- 下载的 PDF 文件可正常打开
- 内容与 Canvas 中显示的一致

---

## 验证清单

- [ ] ExportDropdown 视觉与参考 HTML 一致（三段式、分段控件、cloud-shadow）
- [ ] Format 四个选项可切换，选中显示蓝色勾
- [ ] Version 三个选项可切换，选中显示蓝色勾
- [ ] Paper Size / Layout 分段控件正常工作
- [ ] 点击外部关闭 dropdown
- [ ] PDF 导出实际下载文件
- [ ] Clipboard 复制实际写入剪贴板
- [ ] Print 调用浏览器打印
- [ ] TypeScript 类型检查通过
