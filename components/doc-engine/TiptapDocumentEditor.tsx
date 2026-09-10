"use client";

import {
  EditorContent,
  useEditor,
  type Editor,
} from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import { DOMSerializer } from "@tiptap/pm/model";
import {
  Bold,
  Download,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  LoaderCircle,
  Plus,
  Redo2,
  Table2,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
  WandSparkles,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  extractArticleBodyHtml,
  extractArticleDocumentType,
} from "@/lib/doc-engine/document-article-html";
import { DEFAULT_DOCUMENT_LAYOUT } from "@/lib/doc-engine/block-types";
import type { DocumentModel } from "@/lib/doc-engine/block-types";
import { normalizeDocumentBodyHtml } from "@/lib/doc-engine/editor-html";
import { createDocEditorExtensions } from "@/lib/doc-engine/tiptap-extensions";
import { sanitizeDocHtml } from "@/lib/doc-engine/sanitize";
import {
  countMeaningfulSelectionChars,
  hasMeaningfulSelectionText,
  MIN_MEANINGFUL_SELECTION_CHARS,
} from "@/lib/doc-engine/selection-utils";
import type { MathNodeEditRequest } from "@/shared/doc-engine/TiptapMathNodeViews";
import { cn } from "@/lib/utils";
import { exportDocumentPdfBlob } from "@/lib/doc-engine/client-pdf-export";

import "@/lib/doc-engine/academic-print.css";

const REQUEST_TIMEOUT_MS = 50_000;
const MAX_INSTRUCTION_LENGTH = 500;
const CONTEXT_HTML_LIMIT = 12_000;
const TARGET_HTML_LIMIT = 80_000;
const FULL_DOCUMENT_HTML_LIMIT = 240_000;
const SELECTION_BUBBLE_PLUGIN_KEY = "doc-selection-menu";
const INSERTION_FLOATING_PLUGIN_KEY = "doc-insertion-menu";
const SELECTION_PREVIEW_HIGHLIGHT_KEY = "doc-engine-selection-preview";
const CONTENT_SHELL_SELECTOR =
  "td,th,li,p,blockquote,h1,h2,h3,h4,section[data-section],div[data-question],ol[data-options],div[data-answer-space]";
const STRUCTURE_TARGET_SELECTOR =
  "table,div[data-question],ol[data-options],div[data-answer-space],section[data-section],p,li,blockquote,h1,h2,h3,h4";

type EditMode = "content_edit" | "structure_edit";
type SaveState = "idle" | "saving" | "saved" | "error";
type DocxExportOptions = {
  fileName?: string;
};

type DomRangeSnapshot = {
  startPath: number[];
  startOffset: number;
  endPath: number[];
  endOffset: number;
};

type EditorViewSnapshot = {
  from: number;
  to: number;
  hadFocus: boolean;
  scrollTop: number | null;
  scrollContainer: HTMLElement | null;
};

type TiptapDocumentEditorProps = {
  html: string;
  className?: string;
  editable?: boolean;
  readOnly?: boolean;
  autoFocusBody?: boolean;
  documentModel?: DocumentModel | null;
  documentMeta?: Record<string, string | undefined>;
  onHtmlChange?: (html: string) => void;
  onExportDocxReady?: (handler: ((options?: DocxExportOptions) => Promise<boolean>) | null) => void;
  onExportPdfReady?: (handler: (() => Promise<boolean>) | null) => void;
  onSave?: (html: string) => Promise<void> | void;
  saveState?: SaveState;
  saveLabel?: string;
};

type SelectionContext = {
  selectedHtml: string;
  documentType: string;
  contextTag?: string;
  contextHtml?: string;
  contentTargetLabel?: string;
  structureTargetLabel?: string;
  contentTargetTag?: string;
  structureTargetTag?: string;
  contentTargetHtml?: string;
  structureTargetHtml?: string;
  contentTargetPath?: number[];
  structureTargetPath?: number[];
  deleteTargetTag?: string;
  deleteTargetPath?: number[];
  domRange?: DomRangeSnapshot;
  canStructureEdit: boolean;
  canDelete: boolean;
  range: { from: number; to: number };
};

type TiptapJwtResponse = {
  token: string;
  convertToken: string | null;
  appId: string | null;
  expiresAt: number;
};

type TiptapProAuth = {
  token: string;
  convertToken?: string | null;
  appId: string;
  expiresAt: number;
  refreshKey: number;
};

type AiEditSession = {
  selectionContext: SelectionContext;
  fullDocumentHtml: string;
};

type AiPreviewState = {
  html: string;
  editMode: EditMode;
  selectionContext: SelectionContext;
};

type MathDialogState = MathNodeEditRequest & {
  scrollContainer: HTMLElement | null;
  scrollTop: number | null;
};

function extractArticleEnvelope(html: string) {
  return {
    documentType: extractArticleDocumentType(html),
    bodyHtml: extractArticleBodyHtml(html),
  };
}

function ensureDocumentHtml(documentType: string, bodyHtml: string) {
  const normalizedBody = normalizeDocumentBodyHtml(documentType, bodyHtml);
  return `<article data-doc-type="${documentType}">${normalizedBody}</article>`;
}

function rangeFullyCoversNodeContents(range: Range, element: HTMLElement) {
  const contentRange = document.createRange();
  contentRange.selectNodeContents(element);
  return (
    range.compareBoundaryPoints(Range.START_TO_START, contentRange) <= 0 &&
    range.compareBoundaryPoints(Range.END_TO_END, contentRange) >= 0
  );
}

function findClosestContainer(root: HTMLElement, start: Element | null, selector: string) {
  let current: Element | null = start;
  while (current && root.contains(current)) {
    if (current instanceof HTMLElement && current.matches(selector)) return current;
    current = current.parentElement;
  }
  return null;
}

function findClosestFullyCoveredContainer(
  root: HTMLElement,
  start: Element | null,
  range: Range,
  selector: string,
) {
  let current: Element | null = start;
  while (current && root.contains(current)) {
    if (
      current instanceof HTMLElement &&
      current.matches(selector) &&
      rangeFullyCoversNodeContents(range, current)
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function describeElementLabel(element: HTMLElement | null) {
  if (!element) return undefined;
  if (element.matches("table[data-rubric]")) return "评分表格";
  if (element.matches("table")) return "表格";
  if (element.matches("section[data-section]")) return "章节";
  if (element.matches("div[data-question]")) return "题目块";
  if (element.matches("ol[data-options]")) return "选项块";
  if (element.matches("div[data-answer-space]")) return "作答区";
  if (element.matches("td")) return "表格单元格";
  if (element.matches("th")) return "表头单元格";
  if (element.matches("li")) return "列表项";
  if (element.matches("blockquote")) return "引用块";
  if (element.matches("p")) return "段落";
  if (element.matches("h1,h2,h3,h4")) return "标题块";
  return element.tagName.toLowerCase();
}

function getElementPath(root: HTMLElement, element: HTMLElement) {
  const path: number[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== root) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) return null;
    const index = Array.from(parent.children).indexOf(current);
    if (index < 0) return null;
    path.unshift(index);
    current = parent;
  }

  return current === root ? path : null;
}

function resolveElementPath(root: HTMLElement, path?: number[] | null) {
  if (!path?.length) return null;
  let current: Element = root;

  for (const index of path) {
    const next = current.children.item(index);
    if (!next) return null;
    current = next;
  }

  return current instanceof HTMLElement ? current : null;
}

function getDomNodePath(root: Node, node: Node) {
  const path: number[] = [];
  let current: Node | null = node;

  while (current && current !== root) {
    const parent: Node | null = current.parentNode;
    if (!parent) return null;
    const index = Array.prototype.indexOf.call(parent.childNodes, current) as number;
    if (index < 0) return null;
    path.unshift(index);
    current = parent;
  }

  return current === root ? path : null;
}

function findNearestScrollContainer(element: HTMLElement | null) {
  let current = element;

  while (current) {
    const { overflowY } = window.getComputedStyle(current);
    if (
      current.scrollHeight > current.clientHeight + 4 &&
      (overflowY === "auto" || overflowY === "scroll")
    ) {
      return current;
    }
    current = current.parentElement;
  }

  return document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : null;
}

function clampSelectionPosition(position: number, maxPosition: number) {
  if (!Number.isFinite(position)) {
    return 0;
  }

  return Math.max(0, Math.min(position, maxPosition));
}

function captureEditorViewSnapshot(editor: Editor): EditorViewSnapshot {
  const editorDom = editor.view.dom as HTMLElement;
  const scrollContainer = findNearestScrollContainer(editorDom);

  return {
    from: editor.state.selection.from,
    to: editor.state.selection.to,
    hadFocus: editor.isFocused,
    scrollTop: scrollContainer?.scrollTop ?? null,
    scrollContainer,
  };
}

function restoreEditorViewSnapshot(
  editor: Editor,
  snapshot: EditorViewSnapshot | null,
) {
  if (!snapshot) return;

  requestAnimationFrame(() => {
    if (editor.isDestroyed) return;

    if (snapshot.hadFocus) {
      const maxPosition = Math.max(0, editor.state.doc.content.size);
      const from = clampSelectionPosition(snapshot.from, maxPosition);
      const to = clampSelectionPosition(snapshot.to, maxPosition);
      const selection =
        from === to
          ? from
          : {
              from: Math.min(from, to),
              to: Math.max(from, to),
            };

      editor.chain().focus().setTextSelection(selection).run();
    }

    if (snapshot.scrollContainer && snapshot.scrollTop != null) {
      snapshot.scrollContainer.scrollTop = snapshot.scrollTop;
    }
  });
}

function serializeDomRangeSnapshot(root: HTMLElement, range: Range): DomRangeSnapshot | null {
  const startPath = getDomNodePath(root, range.startContainer);
  const endPath = getDomNodePath(root, range.endContainer);
  if (!startPath || !endPath) return null;

  return {
    startPath,
    startOffset: range.startOffset,
    endPath,
    endOffset: range.endOffset,
  };
}

function normalizeContentReplacementHtml(targetTag: string | undefined, html: string) {
  const sanitized = sanitizeDocHtml(html);
  if (!targetTag) return sanitized;

  const tempRoot = document.createElement("div");
  tempRoot.innerHTML = sanitized;
  if (tempRoot.childElementCount !== 1) return sanitized;

  const onlyChild = tempRoot.firstElementChild;
  if (
    onlyChild instanceof HTMLElement &&
    onlyChild.tagName.toLowerCase() === targetTag.toLowerCase()
  ) {
    return onlyChild.innerHTML;
  }

  return sanitized;
}

function buildPreviewHtml(preview: AiPreviewState) {
  const sanitized = sanitizeDocHtml(preview.html);

  if (preview.editMode === "structure_edit") {
    return sanitized;
  }

  const targetTag = preview.selectionContext.contentTargetTag;
  const normalized = normalizeContentReplacementHtml(targetTag, sanitized);
  if (!targetTag) {
    return `<p>${normalized}</p>`;
  }

  if (targetTag === "td" || targetTag === "th") {
    return `<table><tbody><tr><${targetTag}>${normalized}</${targetTag}></tr></tbody></table>`;
  }

  if (/^(p|li|blockquote|h1|h2|h3|h4)$/i.test(targetTag)) {
    return `<${targetTag}>${normalized}</${targetTag}>`;
  }

  return normalized;
}

function getCssHighlightsRegistry() {
  if (typeof CSS === "undefined") return null;
  return (CSS as typeof CSS & {
    highlights?: {
      set: (name: string, highlight: unknown) => void;
      delete: (name: string) => void;
    };
  }).highlights ?? null;
}

function setSelectionPreviewHighlight(range: Range | null) {
  if (typeof window === "undefined") return;
  const registry = getCssHighlightsRegistry();
  if (!registry) return;

  registry.delete(SELECTION_PREVIEW_HIGHLIGHT_KEY);
  if (!range) return;

  const HighlightConstructor = (
    window as Window & {
      Highlight?: new (...ranges: Range[]) => unknown;
    }
  ).Highlight;
  if (typeof HighlightConstructor !== "function") return;

  registry.set(SELECTION_PREVIEW_HIGHLIGHT_KEY, new HighlightConstructor(range));
}

function cloneCurrentDomSelectionRange() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  return selection.getRangeAt(0).cloneRange();
}

function getEditorSelectionTextLength(
  editor: Editor,
  range: { from: number; to: number },
) {
  if (range.to <= range.from) return 0;
  return countMeaningfulSelectionChars(
    editor.state.doc.textBetween(range.from, range.to, " ", " "),
  );
}

function getDomSelectionSnapshot(editor: Editor) {
  if (!editor.view?.dom) return null;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (!anchorNode || !focusNode) return null;

  if (!(editor.view.dom.contains(anchorNode) && editor.view.dom.contains(focusNode))) {
    return null;
  }

  const text = selection.toString().trim();
  if (!hasMeaningfulSelectionText(text)) {
    return null;
  }

  return {
    text,
    range: selection.getRangeAt(0).cloneRange(),
  };
}

function hasDomTextSelectionWithinEditor(editor: Editor) {
  return Boolean(getDomSelectionSnapshot(editor));
}

function isLikelyStructureEditInstruction(instruction: string) {
  const normalized = instruction.trim().toLowerCase();
  if (!normalized) return false;

  return /删除(这个|该)?(表格|块|章节|题目)|删掉|去掉|移除|改成(列表|表格|段落|章节|题目)|改为(列表|表格|段落|章节|题目)|转换成|转换为|增加(一)?(行|列)|新增(一)?(行|列)|减少(一)?(行|列)|删除(一)?(行|列)|合并单元格|拆分单元格|调整结构|重做结构|改成\d+列|改为\d+列|change.*structure|convert.*table|convert.*list|remove.*table|delete.*block|add.*column|delete.*column|add.*row|delete.*row/.test(
    normalized,
  );
}

function serializeSelectionHtml(
  editor: Editor,
  range?: { from: number; to: number } | null,
) {
  const fallbackRange = editor.state.selection.empty
    ? null
    : {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      };
  const resolvedRange = range ?? fallbackRange;
  if (!resolvedRange || resolvedRange.to <= resolvedRange.from) return "";
  const slice = editor.state.doc.slice(resolvedRange.from, resolvedRange.to);
  const serializer = DOMSerializer.fromSchema(editor.schema);
  const fragment = serializer.serializeFragment(slice.content);
  const div = document.createElement("div");
  div.appendChild(fragment);
  return div.innerHTML;
}

function resolveEditorRangeFromDomSelection(editor: Editor, range: Range) {
  try {
    const rawFrom = editor.view.posAtDOM(range.startContainer, range.startOffset);
    const rawTo = editor.view.posAtDOM(range.endContainer, range.endOffset);
    if (rawFrom === rawTo) return null;
    return {
      from: Math.min(rawFrom, rawTo),
      to: Math.max(rawFrom, rawTo),
    };
  } catch {
    return null;
  }
}

function resolveSelectionContext(editor: Editor, documentType: string) {
  if (!editor.view?.dom) return null;
  const viewDom = editor.view.dom as HTMLElement;
  const browserSelection = window.getSelection();
  if (!browserSelection || browserSelection.isCollapsed || browserSelection.rangeCount === 0) {
    return null;
  }

  const range = browserSelection.getRangeAt(0);
  if (!viewDom.contains(range.commonAncestorContainer)) {
    return null;
  }

  const selectedText = browserSelection.toString().trim();
  if (!hasMeaningfulSelectionText(selectedText)) {
    return null;
  }

  const editorRange = resolveEditorRangeFromDomSelection(editor, range);
  if (!editorRange || editorRange.to - editorRange.from < 1) {
    return null;
  }

  if (
    getEditorSelectionTextLength(editor, editorRange) <
    MIN_MEANINGFUL_SELECTION_CHARS
  ) {
    return null;
  }

  const selectedHtml = serializeSelectionHtml(editor, editorRange);
  if (!selectedHtml.trim()) {
    return null;
  }

  const containerElement =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

  const semanticContainer = containerElement?.closest(
    "td,th,li,p,blockquote,h1,h2,h3,h4",
  );
  const contentTarget = containerElement
    ? findClosestFullyCoveredContainer(viewDom, containerElement, range, CONTENT_SHELL_SELECTOR)
    : null;
  const structureTarget = containerElement
    ? findClosestFullyCoveredContainer(viewDom, containerElement, range, STRUCTURE_TARGET_SELECTOR)
    : null;
  const deleteTarget = containerElement
    ? findClosestContainer(viewDom, containerElement, STRUCTURE_TARGET_SELECTOR)
    : null;
  const domRange = serializeDomRangeSnapshot(viewDom, range) ?? undefined;

  return {
    selectedHtml,
    documentType,
    contextTag: semanticContainer?.tagName.toLowerCase(),
    contextHtml: semanticContainer?.outerHTML
      ? semanticContainer.outerHTML.slice(0, CONTEXT_HTML_LIMIT)
      : undefined,
    contentTargetLabel: describeElementLabel(contentTarget),
    structureTargetLabel: describeElementLabel(structureTarget),
    contentTargetTag: contentTarget?.tagName.toLowerCase(),
    structureTargetTag: structureTarget?.tagName.toLowerCase(),
    contentTargetHtml: contentTarget?.outerHTML
      ? contentTarget.outerHTML.slice(0, TARGET_HTML_LIMIT)
      : undefined,
    structureTargetHtml: structureTarget?.outerHTML
      ? structureTarget.outerHTML.slice(0, TARGET_HTML_LIMIT)
      : undefined,
    contentTargetPath: contentTarget ? getElementPath(viewDom, contentTarget) ?? undefined : undefined,
    structureTargetPath: structureTarget
      ? getElementPath(viewDom, structureTarget) ?? undefined
      : undefined,
    deleteTargetTag: deleteTarget?.tagName.toLowerCase(),
    deleteTargetPath: deleteTarget
      ? getElementPath(viewDom, deleteTarget) ?? undefined
      : undefined,
    domRange,
    canStructureEdit: Boolean(structureTarget),
    canDelete: Boolean(deleteTarget),
    range: editorRange,
  } satisfies SelectionContext;
}

function requestMenuPositionUpdate(editor: Editor, pluginKey: string) {
  editor.view.dispatch(editor.state.tr.setMeta(pluginKey, "updatePosition"));
}


// ── 格式化工具条的图标按钮 ──────────────────────────────
function FormatButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150",
        active
          ? "bg-neutral-800 text-white shadow-xs"
          : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800",
        disabled && "pointer-events-none opacity-30",
      )}
    >
      {children}
    </button>
  );
}

// ── 固定工具栏组件（顶部编辑栏用） ─────────────────────────
function ToolbarButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs transition",
        active
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {children}
    </button>
  );
}

function ToolbarGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-2xl border border-neutral-200 bg-white p-1 shadow-xs",
        className,
      )}
    >
      {children}
    </div>
  );
}

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px bg-neutral-200" />;
}

function MathEditDialog({
  state,
  onLatexChange,
  onClose,
  onSave,
}: {
  state: MathDialogState | null;
  onLatexChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!state) return;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    });
  }, [state]);

  if (!state) return null;

  const title = state.displayMode ? "编辑块级公式" : "编辑行内公式";

  return (
    <div className="absolute right-4 top-20 z-30 w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-neutral-900">{title}</p>
          <p className="mt-1 text-xs text-neutral-500">
            保存后仍以语义数学节点写回文档，不落库 KaTeX HTML。
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 items-center rounded-lg px-2 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
        >
          关闭
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={state.latex}
        onChange={(event) => onLatexChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSave();
          }
        }}
        className="mt-4 h-40 w-full resize-none rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 font-mono text-sm leading-6 text-neutral-900 outline-hidden transition focus:border-neutral-400 focus:bg-white"
        placeholder={state.displayMode ? "\\frac{a}{b}" : "x^2 + y^2"}
      />

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center rounded-lg border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!state.latex.trim()}
          className="inline-flex h-9 items-center rounded-lg bg-neutral-900 px-3 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          保存公式
        </button>
      </div>
    </div>
  );
}

function SelectionBubbleMenu({
  editor,
  onOpenAi,
  onCloseAi,
  onDeleteBlock,
  onApplyPreview,
  onDiscardPreview,
  onAiSubmit,
  aiInstruction,
  onAiInstructionChange,
  isAiComposerOpen,
  isAiLoading,
  aiError,
  aiPreview,
  selectionContext,
}: {
  editor: Editor;
  onOpenAi: () => void;
  onCloseAi: () => void;
  onDeleteBlock: () => void;
  onApplyPreview: () => void;
  onDiscardPreview: () => void;
  onAiSubmit: () => void;
  aiInstruction: string;
  onAiInstructionChange: (value: string) => void;
  isAiComposerOpen: boolean;
  isAiLoading: boolean;
  aiError: string;
  aiPreview: AiPreviewState | null;
  selectionContext: SelectionContext | null;
}) {
  return (
    <BubbleMenu
      editor={editor}
      pluginKey={SELECTION_BUBBLE_PLUGIN_KEY}
      updateDelay={0}
      shouldShow={({ editor: currentEditor, element, view, state, from, to }) => {
        const isChildOfMenu = element.contains(document.activeElement);
        const hasDomSelection = hasDomTextSelectionWithinEditor(currentEditor);
        const hasEditorFocus = view.hasFocus() || hasDomSelection || isChildOfMenu || isAiComposerOpen;
        const hasTextSelection =
          !state.selection.empty &&
          getEditorSelectionTextLength(currentEditor, { from, to }) >=
            MIN_MEANINGFUL_SELECTION_CHARS;
        const hasStableSelection = Boolean(selectionContext);
        return (
          currentEditor.isEditable &&
          (hasEditorFocus || hasStableSelection) &&
          (isAiComposerOpen
            ? hasStableSelection
            : hasTextSelection || hasDomSelection || hasStableSelection)
        );
      }}
      options={{
        placement: "top",
        offset: 10,
        shift: { padding: 12 },
        flip: { padding: 12 },
      }}
      appendTo={() => editor.view.dom.parentElement ?? document.body}
      className="flex flex-col items-center gap-2"
    >
      {/* ── Layer 1: 格式化工具条 ── 始终可见 ── */}
      <div
        onMouseDown={(event) => event.preventDefault()}
        className="flex items-center gap-0.5 rounded-full bg-white/95 p-1 shadow-md backdrop-blur-xl"
      >
        <FormatButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="粗体"
        >
          <Bold className="h-4 w-4" />
        </FormatButton>
        <FormatButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="斜体"
        >
          <Italic className="h-4 w-4" />
        </FormatButton>
        <FormatButton
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="下划线"
        >
          <UnderlineIcon className="h-4 w-4" />
        </FormatButton>
        <FormatButton
          active={editor.isActive("highlight")}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          title="高亮"
        >
          <Highlighter className="h-4 w-4" />
        </FormatButton>

        {/* 分隔线 */}
        <div className="mx-0.5 h-4 w-px bg-neutral-200" />

        {/* AI 触发按钮 */}
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => (isAiComposerOpen ? onCloseAi() : onOpenAi())}
          title="AI 修改"
          data-testid="tiptap-selection-ai-trigger"
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium transition-all duration-150",
            isAiComposerOpen
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-indigo-600 hover:bg-indigo-50",
          )}
        >
          <WandSparkles className="h-3.5 w-3.5" />
          <span>AI</span>
        </button>

        {/* 删除块按钮（仅当可删除时显示） */}
        {selectionContext?.canDelete ? (
          <>
            <div className="mx-0.5 h-4 w-px bg-neutral-200" />
            <FormatButton
              onClick={onDeleteBlock}
              title="删除块"
            >
              <Trash2 className="h-4 w-4" />
            </FormatButton>
          </>
        ) : null}
      </div>

      {/* ── Layer 2: AI 输入框 ── 点击 AI 后展开 ── */}
      {isAiComposerOpen ? (
        <div
          onMouseDown={(event) => event.preventDefault()}
          className="w-[300px] animate-[slideDown_150ms_ease-out] rounded-xl bg-white shadow-xl"
        >
          {/* 输入区 */}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <WandSparkles className="h-4 w-4 shrink-0 text-indigo-500" />
            <input
              type="text"
              autoFocus
              data-testid="tiptap-selection-ai-input"
              value={aiInstruction}
              onChange={(event) => onAiInstructionChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  onAiSubmit();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCloseAi();
                }
              }}
              maxLength={MAX_INSTRUCTION_LENGTH}
              placeholder="告诉 AI 怎么修改..."
              disabled={isAiLoading}
              className="h-7 min-w-0 flex-1 border-0 bg-transparent text-[13px] text-neutral-800 outline-hidden placeholder:text-neutral-300"
            />
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onAiSubmit}
              data-testid="tiptap-selection-ai-submit"
              disabled={!aiInstruction.trim() || isAiLoading}
              className={cn(
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-150",
                isAiLoading
                  ? "text-indigo-400"
                  : aiInstruction.trim()
                    ? "bg-indigo-600 text-white shadow-xs hover:bg-indigo-700"
                    : "text-neutral-300",
              )}
              title={aiPreview ? "重新生成预览" : "生成预览"}
            >
              {isAiLoading ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <WandSparkles className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {aiPreview ? (
            <div className="border-t border-neutral-100 px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-400">
                  改写预览
                </p>
                <p className="text-[11px] text-neutral-500">
                  {aiPreview.editMode === "structure_edit" ? "整块替换" : "仅替换选区"}
                </p>
              </div>
              <div
                className="prose prose-sm max-h-48 overflow-auto rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-700"
                data-testid="tiptap-selection-ai-preview"
                dangerouslySetInnerHTML={{ __html: buildPreviewHtml(aiPreview) }}
              />
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onDiscardPreview}
                  className="inline-flex h-8 items-center rounded-lg border border-neutral-200 px-3 text-[12px] font-medium text-neutral-600 transition hover:bg-neutral-50"
                >
                  放弃
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onApplyPreview}
                  data-testid="tiptap-selection-ai-apply"
                  className="inline-flex h-8 items-center rounded-lg bg-neutral-900 px-3 text-[12px] font-medium text-white transition hover:bg-neutral-800"
                >
                  应用结果
                </button>
              </div>
            </div>
          ) : null}

          {/* 错误信息 */}
          {aiError ? (
            <div className="border-t border-red-100 bg-red-50/50 px-3 py-2">
              <p className="text-[12px] text-red-600">{aiError}</p>
            </div>
          ) : null}

          {!aiPreview ? (
            <div className="border-t border-neutral-100 px-3 py-2">
              <p className="text-[11px] leading-tight text-neutral-500">
                先生成预览，再决定是否应用。应用阶段不会再次调用 AI。
              </p>
            </div>
          ) : null}

          {selectionContext?.canStructureEdit ? (
            <div className="border-t border-neutral-100 px-3 py-2">
              <p className="text-[11px] leading-tight text-neutral-500">
                如果你要求改表格结构、改成列表，或重写整块内容，系统会自动切到结构修改。
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </BubbleMenu>
  );
}

function InsertionFloatingMenu({
  editor,
}: {
  editor: Editor;
}) {
  return (
    <FloatingMenu
      editor={editor}
      pluginKey={INSERTION_FLOATING_PLUGIN_KEY}
      updateDelay={0}
      shouldShow={({ editor: currentEditor, view, state }) => {
        const parent = state.selection.$from.parent;
        const isEmptyParagraph =
          state.selection.empty &&
          parent.type.name === "paragraph" &&
          parent.textContent.trim().length === 0;
        return currentEditor.isEditable && view.hasFocus() && isEmptyParagraph;
      }}
      options={{
        placement: "left-start",
        offset: 12,
        shift: {
          padding: 12,
        },
      }}
      appendTo={() => editor.view.dom.parentElement ?? document.body}
      className="flex items-center gap-1 rounded-2xl border border-neutral-200 bg-white/95 p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.12)] backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className="inline-flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
      >
        <Plus className="h-3.5 w-3.5" />
        标题
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className="inline-flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
      >
        <List className="h-3.5 w-3.5" />
        列表
      </button>
      <button
        type="button"
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 4, withHeaderRow: true }).run()
        }
        className="inline-flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
      >
        <Table2 className="h-3.5 w-3.5" />
        表格
      </button>
    </FloatingMenu>
  );
}

export default function TiptapDocumentEditor({
  html,
  className,
  editable = true,
  readOnly = false,
  autoFocusBody = false,
  documentModel,
  documentMeta,
  onHtmlChange,
  onExportDocxReady,
  onExportPdfReady,
  onSave,
  saveState = "idle",
  saveLabel,
}: TiptapDocumentEditorProps) {
  const envelope = useMemo(() => extractArticleEnvelope(html), [html]);
  // 初始加载也要走 normalize，确保 data-rubric 等属性被补全
  const normalizedBodyHtml = useMemo(
    () => normalizeDocumentBodyHtml(envelope.documentType, envelope.bodyHtml),
    [envelope.documentType, envelope.bodyHtml],
  );
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const latestSelectionRef = useRef<SelectionContext | null>(null);
  const lastLocalExternalBodyHtmlRef = useRef<string>("");
  const didAutoFocusBodyRef = useRef(false);
  const selectionPreviewRangeRef = useRef<Range | null>(null);
  const selectionSyncFrameRef = useRef<number | null>(null);
  const selectionSyncRetryCountRef = useRef(0);
  const tokenRefreshPromiseRef = useRef<Promise<TiptapProAuth | null> | null>(null);
  const editorValueRef = useRef(normalizedBodyHtml);
  const [panelSelectionContext, setPanelSelectionContext] = useState<SelectionContext | null>(null);
  const [selectionContext, setSelectionContext] = useState<SelectionContext | null>(null);
  const [isAiComposerOpen, setIsAiComposerOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSession, setAiSession] = useState<AiEditSession | null>(null);
  const [aiPreview, setAiPreview] = useState<AiPreviewState | null>(null);
  const [proAuth, setProAuth] = useState<TiptapProAuth | null>(null);
  const [mathDialogState, setMathDialogState] = useState<MathDialogState | null>(null);
  const effectiveSelectionContext = panelSelectionContext ?? selectionContext;
  const shouldLoadTiptapProAuth = Boolean(onExportDocxReady);

  const handleRequestMathEdit = useCallback((request: MathNodeEditRequest) => {
    const editorDom = editorShellRef.current?.querySelector(".ProseMirror") as HTMLElement | null;
    const scrollContainer = findNearestScrollContainer(editorDom);
    setMathDialogState({
      ...request,
      scrollContainer,
      scrollTop: scrollContainer?.scrollTop ?? null,
    });
  }, []);

  const loadTiptapJwt = useCallback(async () => {
    if (tokenRefreshPromiseRef.current) {
      return tokenRefreshPromiseRef.current;
    }

    const nextPromise = (async () => {
      const response = await fetch("/api/tiptap/jwt", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as TiptapJwtResponse;
      if (!payload.token || !payload.appId) {
        return null;
      }

      const nextAuth = {
        token: payload.token,
        convertToken: payload.convertToken,
        appId: payload.appId,
        expiresAt: payload.expiresAt,
        refreshKey: Date.now(),
      } satisfies TiptapProAuth;

      setProAuth(nextAuth);
      return nextAuth;
    })().finally(() => {
      tokenRefreshPromiseRef.current = null;
    });

    tokenRefreshPromiseRef.current = nextPromise;
    return nextPromise;
  }, []);

  // 追踪 IME composition 状态，避免 composition 期间回灌内容导致输入中断
  const isComposingRef = useRef(false);

  const editor = useEditor({
    extensions: createDocEditorExtensions({
      placeholderText: "开始编辑这份文档...",
      documentType: envelope.documentType,
      proAuth,
      onRequestMathEdit: handleRequestMathEdit,
    }),
    content: normalizedBodyHtml,
    editable: editable && !readOnly,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class:
          "ProseMirror min-h-[720px] px-8 py-8 outline-hidden text-[15px] leading-7",
        // 将 data-doc-type 设置到编辑器根元素，让 academic-print.css 的
        // [data-doc-type] 和 [data-doc-type="rubric"] 选择器生效
        "data-doc-type": envelope.documentType,
      },
      handleDOMEvents: {
        compositionstart: () => {
          isComposingRef.current = true;
          return false;
        },
        compositionend: () => {
          isComposingRef.current = false;
          return false;
        },
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      // IME composition 期间不触发外部回调，避免 React re-render 打断输入
      if (isComposingRef.current) return;

      const nextBodyHtml = currentEditor.getHTML();
      lastLocalExternalBodyHtmlRef.current = nextBodyHtml;
      editorValueRef.current = nextBodyHtml;
      onHtmlChange?.(
        `<article data-doc-type="${envelope.documentType}">${nextBodyHtml}</article>`,
      );
    },
  }, [
    editable,
    envelope.documentType,
    handleRequestMathEdit,
    proAuth?.appId,
    proAuth?.token,
    readOnly,
  ]);

  useEffect(() => {
    if (!shouldLoadTiptapProAuth) {
      return;
    }

    let cancelled = false;

    async function loadInitialTiptapJwt() {
      try {
        const nextAuth = await loadTiptapJwt();
        if (!nextAuth || cancelled) return;
      } catch {
        // Pro 鉴权失败时退回本地编辑能力
      }
    }

    void loadInitialTiptapJwt();

    return () => {
      cancelled = true;
    };
  }, [loadTiptapJwt, shouldLoadTiptapProAuth]);

  useEffect(() => {
    if (!editor) {
      editorValueRef.current = normalizedBodyHtml;
      return;
    }

    // IME composition 期间绝不回灌，否则会杀死输入法 session
    if (isComposingRef.current) return;

    const nextHtml = normalizedBodyHtml.trim();
    if (lastLocalExternalBodyHtmlRef.current === nextHtml) {
      return;
    }

    const currentHtml = normalizeDocumentBodyHtml(
      envelope.documentType,
      editor.getHTML(),
    ).trim();

    if (currentHtml === nextHtml) {
      lastLocalExternalBodyHtmlRef.current = nextHtml;
      editorValueRef.current = normalizedBodyHtml;
      return;
    }

    // 外部 html 真要回灌时，先保住当前 selection/scroll。
    // 否则 autosave 或父层状态回声会把光标和滚动直接送到文末。
    const viewSnapshot = captureEditorViewSnapshot(editor);
    lastLocalExternalBodyHtmlRef.current = nextHtml;
    editorValueRef.current = normalizedBodyHtml;
    editor.commands.setContent(nextHtml, { emitUpdate: false });
    restoreEditorViewSnapshot(editor, viewSnapshot);
  }, [editor, envelope.documentType, normalizedBodyHtml]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable && !readOnly);
  }, [editable, editor, readOnly]);

  useEffect(() => {
    didAutoFocusBodyRef.current = false;
  }, [editor]);

  useEffect(() => {
    if (!editor || !autoFocusBody || !editable || readOnly || didAutoFocusBodyRef.current) {
      return;
    }

    didAutoFocusBodyRef.current = true;
    let remainingAttempts = 180;
    let focusFrame = 0;

    const attemptFocus = () => {
      if (editor.isDestroyed) return;
      const editorDom = editor.view.dom as HTMLElement | null;
      if (!editorDom || !editorDom.isConnected) {
        if (remainingAttempts > 0) {
          remainingAttempts -= 1;
          focusFrame = requestAnimationFrame(attemptFocus);
        }
        return;
      }
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && editorDom.contains(activeElement)) {
        return;
      }
      editorDom.focus({ preventScroll: true });
      editor.commands.focus("start");
      if (
        !(document.activeElement instanceof HTMLElement) ||
        !editorDom.contains(document.activeElement)
      ) {
        if (remainingAttempts > 0) {
          remainingAttempts -= 1;
          focusFrame = requestAnimationFrame(attemptFocus);
        }
      }
    };

    focusFrame = requestAnimationFrame(attemptFocus);

    return () => {
      cancelAnimationFrame(focusFrame);
    };
  }, [autoFocusBody, editable, editor, readOnly]);

  useEffect(() => {
    return () => {
      if (selectionSyncFrameRef.current != null) {
        cancelAnimationFrame(selectionSyncFrameRef.current);
      }
      setSelectionPreviewHighlight(null);
    };
  }, []);

  const syncSelectionContext = useCallback((currentEditor: Editor) => {
    const domSelection = getDomSelectionSnapshot(currentEditor);
    const nextContext = resolveSelectionContext(currentEditor, envelope.documentType);

    if (!nextContext) {
      if (domSelection && selectionSyncRetryCountRef.current < 2) {
        selectionSyncRetryCountRef.current += 1;
        selectionPreviewRangeRef.current = domSelection.range;
        setSelectionPreviewHighlight(domSelection.range);
        if (selectionSyncFrameRef.current != null) {
          cancelAnimationFrame(selectionSyncFrameRef.current);
        }
        selectionSyncFrameRef.current = requestAnimationFrame(() => {
          selectionSyncFrameRef.current = null;
          syncSelectionContext(currentEditor);
        });
        return;
      }

      selectionSyncRetryCountRef.current = 0;
      if (!isAiComposerOpen) {
        selectionPreviewRangeRef.current = null;
        setSelectionPreviewHighlight(null);
      }
      latestSelectionRef.current = null;
      setSelectionContext(null);
      if (!isAiComposerOpen) {
        setPanelSelectionContext(null);
      }
      return;
    }

    selectionSyncRetryCountRef.current = 0;
    if (selectionSyncFrameRef.current != null) {
      cancelAnimationFrame(selectionSyncFrameRef.current);
      selectionSyncFrameRef.current = null;
    }

    const nextSelectionRange = domSelection?.range ?? cloneCurrentDomSelectionRange();
    if (nextSelectionRange) {
      selectionPreviewRangeRef.current = nextSelectionRange;
      setSelectionPreviewHighlight(nextSelectionRange);
    }
    latestSelectionRef.current = nextContext;
    setSelectionContext(nextContext);
    setPanelSelectionContext(nextContext);
  }, [envelope.documentType, isAiComposerOpen]);

  const scheduleSelectionContextSync = useCallback(
    (currentEditor: Editor, settleFrames = 1) => {
      if (selectionSyncFrameRef.current != null) {
        cancelAnimationFrame(selectionSyncFrameRef.current);
      }

      const run = () => {
        if (settleFrames > 0) {
          settleFrames -= 1;
          selectionSyncFrameRef.current = requestAnimationFrame(run);
          return;
        }

        selectionSyncFrameRef.current = null;
        syncSelectionContext(currentEditor);
        requestMenuPositionUpdate(currentEditor, SELECTION_BUBBLE_PLUGIN_KEY);
      };

      selectionSyncFrameRef.current = requestAnimationFrame(run);
    },
    [syncSelectionContext],
  );

  useEffect(() => {
    if (!editor) return;

    const handleEditorSelectionUpdate = ({
      editor: currentEditor,
    }: {
      editor: Editor;
    }) => {
      scheduleSelectionContextSync(currentEditor, 0);
    };

    editor.on("selectionUpdate", handleEditorSelectionUpdate);
    scheduleSelectionContextSync(editor, 0);
    return () => {
      editor.off("selectionUpdate", handleEditorSelectionUpdate);
    };
  }, [editor, scheduleSelectionContextSync]);

  useEffect(() => {
    if (!editor) return;

    const handleDocumentSelectionChange = () => {
      scheduleSelectionContextSync(editor, 1);
    };

    document.addEventListener("selectionchange", handleDocumentSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleDocumentSelectionChange);
    };
  }, [editor, scheduleSelectionContextSync]);

  useEffect(() => {
    if (!editor) return;

    const editorDom = editor.view.dom as HTMLElement;
    const handlePointerOrKeyEnd = () => {
      scheduleSelectionContextSync(editor, 2);
    };

    editorDom.addEventListener("pointerup", handlePointerOrKeyEnd);
    editorDom.addEventListener("keyup", handlePointerOrKeyEnd);

    return () => {
      editorDom.removeEventListener("pointerup", handlePointerOrKeyEnd);
      editorDom.removeEventListener("keyup", handlePointerOrKeyEnd);
    };
  }, [editor, scheduleSelectionContextSync]);

  useEffect(() => {
    if (!editor) return;
    requestAnimationFrame(() => {
      requestMenuPositionUpdate(editor, SELECTION_BUBBLE_PLUGIN_KEY);
    });
  }, [editor, isAiComposerOpen, aiError, isAiLoading]);

  const openAiComposer = useCallback((nextSelectionContext?: SelectionContext | null) => {
    if (!editor) return;
    const resolvedSelectionContext = nextSelectionContext ?? effectiveSelectionContext;
    if (!resolvedSelectionContext) return;
    const fullDocumentHtml = ensureDocumentHtml(
      envelope.documentType,
      (editor.view.dom as HTMLElement).innerHTML.slice(0, FULL_DOCUMENT_HTML_LIMIT),
    );
    setIsAiComposerOpen(true);
    setAiInstruction("");
    setAiError("");
    setAiPreview(null);
    setAiSession({
      selectionContext: resolvedSelectionContext,
      fullDocumentHtml,
    });
    setPanelSelectionContext(resolvedSelectionContext);
  }, [editor, effectiveSelectionContext, envelope.documentType]);

  const handleOpenAi = useCallback(() => {
    openAiComposer();
  }, [openAiComposer]);

  useEffect(() => {
    if (!editor || process.env.NODE_ENV === "production") return;

    const handleOpenAiForTesting = () => {
      const nextSelectionContext = resolveSelectionContext(editor, envelope.documentType);
      if (!nextSelectionContext) return;
      openAiComposer(nextSelectionContext);
    };

    window.addEventListener("deskmate:open-selection-ai", handleOpenAiForTesting);
    return () => {
      window.removeEventListener("deskmate:open-selection-ai", handleOpenAiForTesting);
    };
  }, [editor, envelope.documentType, openAiComposer]);

  const handleAiInstructionChange = useCallback((value: string) => {
    setAiInstruction(value);
    setAiError("");
    setAiPreview(null);
  }, []);

  const clearAiPanel = useCallback(() => {
    setIsAiComposerOpen(false);
    setAiInstruction("");
    setAiError("");
    setIsAiLoading(false);
    setAiSession(null);
    setAiPreview(null);
    latestSelectionRef.current = null;
    setSelectionContext(null);
    setPanelSelectionContext(null);
    selectionPreviewRangeRef.current = null;
    setSelectionPreviewHighlight(null);
  }, []);

  const handleDeleteBlock = useCallback(() => {
    if (!editor || !effectiveSelectionContext?.deleteTargetPath) return;
    const viewSnapshot = captureEditorViewSnapshot(editor);
    const viewDom = editor.view.dom as HTMLElement;
    const actualTarget =
      resolveElementPath(viewDom, effectiveSelectionContext.deleteTargetPath) ??
      (effectiveSelectionContext.deleteTargetTag === "table"
        ? (viewDom.querySelector("table") as HTMLElement | null)
        : null);

    if (!actualTarget) return;

    actualTarget.setAttribute("data-doc-edit-target", "true");
    const tempRoot = document.createElement("div");
    tempRoot.innerHTML = viewDom.innerHTML;
    const targetInClone = tempRoot.querySelector("[data-doc-edit-target='true']");
    actualTarget.removeAttribute("data-doc-edit-target");

    if (!(targetInClone instanceof HTMLElement)) return;
    targetInClone.remove();
    editor.commands.setContent(tempRoot.innerHTML, { emitUpdate: true });
    restoreEditorViewSnapshot(editor, viewSnapshot);
    clearAiPanel();
  }, [clearAiPanel, editor, effectiveSelectionContext]);

  const handleDiscardPreview = useCallback(() => {
    setAiPreview(null);
    setAiError("");
  }, []);

  const handleApplyPreview = useCallback(() => {
    if (!editor || !aiPreview) return;
    const viewSnapshot = captureEditorViewSnapshot(editor);

    if (aiPreview.editMode === "structure_edit") {
      const viewDom = editor.view.dom as HTMLElement;
      const target =
        resolveElementPath(viewDom, aiPreview.selectionContext.structureTargetPath) ?? null;
      if (!target) {
        setAiError("未找到可替换的结构块，请重新选择。");
        return;
      }

      target.setAttribute("data-doc-edit-target", "true");
      const tempRoot = document.createElement("div");
      tempRoot.innerHTML = viewDom.innerHTML;
      const targetInClone = tempRoot.querySelector("[data-doc-edit-target='true']");
      target.removeAttribute("data-doc-edit-target");

      if (!(targetInClone instanceof HTMLElement)) {
        setAiError("未找到可替换的结构块，请重新选择。");
        return;
      }

      targetInClone.outerHTML = sanitizeDocHtml(aiPreview.html);
      editor.commands.setContent(tempRoot.innerHTML, { emitUpdate: true });
      restoreEditorViewSnapshot(editor, viewSnapshot);
    } else {
      const replacementHtml = normalizeContentReplacementHtml(
        aiPreview.selectionContext.contentTargetTag,
        aiPreview.html,
      );
      editor
        .chain()
        .insertContentAt(
          aiPreview.selectionContext.range,
          sanitizeDocHtml(replacementHtml),
        )
        .run();
      restoreEditorViewSnapshot(editor, viewSnapshot);
    }

    clearAiPanel();
  }, [aiPreview, clearAiPanel, editor]);

  const handleAiSubmit = useCallback(async () => {
    if (!editor || !effectiveSelectionContext || !aiInstruction.trim()) return;
    const session =
      aiSession ??
      {
        selectionContext: effectiveSelectionContext,
        fullDocumentHtml: ensureDocumentHtml(
          envelope.documentType,
          (editor.view.dom as HTMLElement).innerHTML.slice(0, FULL_DOCUMENT_HTML_LIMIT),
        ),
      };
    const resolvedEditMode: EditMode =
      session.selectionContext.canStructureEdit &&
      isLikelyStructureEditInstruction(aiInstruction)
        ? "structure_edit"
        : "content_edit";

    setIsAiLoading(true);
    setAiError("");
    if (!aiSession) {
      setAiSession(session);
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch("/api/doc/edit-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          editMode: resolvedEditMode,
          selectedHtml: session.selectionContext.selectedHtml,
          instruction: aiInstruction.trim(),
          documentType: session.selectionContext.documentType,
          contextTag: session.selectionContext.contextTag,
          contextHtml: session.selectionContext.contextHtml,
          targetContainerTag:
            resolvedEditMode === "structure_edit"
              ? session.selectionContext.structureTargetTag
              : session.selectionContext.contentTargetTag,
          targetContainerHtml:
            resolvedEditMode === "structure_edit"
              ? session.selectionContext.structureTargetHtml
              : session.selectionContext.contentTargetHtml,
          fullDocumentHtml: session.fullDocumentHtml,
          documentMeta,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || "文档编辑接口调用失败。");
      }

      const payload = (await response.json()) as { html?: string; modifiedHtml?: string };
      const nextHtml = (payload.modifiedHtml ?? payload.html ?? "").trim();
      if (!nextHtml) {
        throw new Error("文档编辑接口返回内容为空。");
      }
      setAiPreview({
        html: nextHtml,
        editMode: resolvedEditMode,
        selectionContext: session.selectionContext,
      });
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.name === "AbortError"
            ? "文档编辑超时，请重试。"
            : error.message
          : "文档编辑失败。",
      );
    } finally {
      window.clearTimeout(timeoutId);
      setIsAiLoading(false);
    }
  }, [
    aiInstruction,
    clearAiPanel,
    documentMeta,
    editor,
    envelope.documentType,
    effectiveSelectionContext,
    aiSession,
  ]);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    const nextBodyHtml = editor?.getHTML() ?? editorValueRef.current;
    await onSave(ensureDocumentHtml(envelope.documentType, nextBodyHtml));
  }, [editor, envelope.documentType, onSave]);

  const handleMathDialogLatexChange = useCallback((value: string) => {
    setMathDialogState((currentState) =>
      currentState
        ? {
            ...currentState,
            latex: value,
          }
        : currentState,
    );
  }, []);

  const handleCloseMathDialog = useCallback(() => {
    setMathDialogState(null);
  }, []);

  const handleApplyMathDialog = useCallback(() => {
    if (!mathDialogState) return;
    const nextLatex = mathDialogState.latex.trim();
    if (!nextLatex) return;

    mathDialogState.applyLatex(nextLatex);
    mathDialogState.focusEditor();

    requestAnimationFrame(() => {
      if (mathDialogState.scrollContainer && mathDialogState.scrollTop != null) {
        mathDialogState.scrollContainer.scrollTop = mathDialogState.scrollTop;
      }
    });

    setMathDialogState(null);
  }, [mathDialogState]);

  // 基于 Context7 文档核对后，官方 ExportPdf 命令本身没有问题；
  // 但对当前自定义文档节点（题目块、章节块等）的导出兼容性不稳定。
  // 统一改为导出当前编辑器 HTML，保证 PDF 与右侧渲染保持一致。
  const handleExportPdf = useCallback(async () => {
    if (!editor) return false;

    try {
      const html = ensureDocumentHtml(envelope.documentType, editor.getHTML());
      await exportDocumentPdfBlob({
        html,
        title:
          documentMeta?.artifactTitle?.trim() ||
          documentMeta?.title?.trim() ||
          envelope.documentType ||
          "document",
        layoutConfig: documentModel?.layoutConfig ?? DEFAULT_DOCUMENT_LAYOUT,
      });
      return true;
    } catch {
      return false;
    }
  }, [documentMeta?.artifactTitle, documentMeta?.title, documentModel, editor, envelope.documentType]);

  const handleExportDocx = useCallback(async (options?: DocxExportOptions) => {
    if (!editor || !proAuth?.appId || !proAuth.token) return false;

    return await new Promise<boolean>((resolve) => {
      const timeoutId = window.setTimeout(() => resolve(false), 45_000);
      const started = editor
        .chain()
        .focus()
        .exportDocx({
          customNodes: [],
          styleOverrides: {},
          exportType: "blob",
          onCompleteExport(result) {
            window.clearTimeout(timeoutId);
            if (!(result instanceof Blob)) {
              resolve(false);
              return;
            }
            const url = URL.createObjectURL(result);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download =
              options?.fileName?.trim() || `${envelope.documentType || "document"}.docx`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
            resolve(true);
          },
        })
        .run();

      if (!started) {
        window.clearTimeout(timeoutId);
        resolve(false);
      }
    });
  }, [editor, envelope.documentType, proAuth?.appId, proAuth?.token]);

  useEffect(() => {
    if (!onExportDocxReady) return;

    if (editor && proAuth?.appId && proAuth.token) {
      onExportDocxReady(() => {
        return handleExportDocx();
      });
      return () => {
        onExportDocxReady(null);
      };
    }

    onExportDocxReady(null);
    return () => {
      onExportDocxReady(null);
    };
  }, [editor, handleExportDocx, onExportDocxReady, proAuth?.appId, proAuth?.token]);

  useEffect(() => {
    if (!onExportPdfReady) return;

    if (editor) {
      onExportPdfReady(() => {
        return handleExportPdf();
      });
      return () => {
        onExportPdfReady(null);
      };
    }

    onExportPdfReady(null);
    return () => {
      onExportPdfReady(null);
    };
  }, [editor, handleExportPdf, onExportPdfReady]);

  const resolvedSaveLabel =
    saveState === "saving"
      ? saveLabel || "正在保存..."
      : saveState === "saved"
        ? saveLabel || "已保存"
        : saveState === "error"
          ? saveLabel || "保存失败"
          : saveLabel || "保存";

  return (
    <div className={cn(className, "overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-xs")}>
      {editor && editable && !readOnly && onSave ? (
        <div className="sticky top-0 z-20 flex items-center justify-end border-b border-neutral-200 bg-white/95 px-4 py-2 backdrop-blur-sm">
          <button
            type="button"
            data-testid="tiptap-editor-save"
            onClick={() => void handleSave()}
            disabled={saveState === "saving"}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition",
              saveState === "saved"
                ? "bg-emerald-600 text-white"
                : saveState === "error"
                  ? "bg-red-600 text-white"
                  : "bg-neutral-900 text-white hover:bg-neutral-800",
              saveState === "saving" && "opacity-70",
            )}
          >
            {saveState === "saving" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
            {resolvedSaveLabel}
          </button>
        </div>
      ) : null}

      <div
        ref={editorShellRef}
        data-doc-type={envelope.documentType}
        className="tiptap relative bg-white"
      >
        <MathEditDialog
          state={mathDialogState}
          onLatexChange={handleMathDialogLatexChange}
          onClose={handleCloseMathDialog}
          onSave={handleApplyMathDialog}
        />
        {editor ? (
          <>
            <InsertionFloatingMenu editor={editor} />
            <SelectionBubbleMenu
              editor={editor}
              onOpenAi={handleOpenAi}
              onCloseAi={clearAiPanel}
              onDeleteBlock={handleDeleteBlock}
              onApplyPreview={handleApplyPreview}
              onDiscardPreview={handleDiscardPreview}
              onAiSubmit={() => void handleAiSubmit()}
              aiInstruction={aiInstruction}
              onAiInstructionChange={handleAiInstructionChange}
              isAiComposerOpen={isAiComposerOpen}
              isAiLoading={isAiLoading}
              aiError={aiError}
              aiPreview={aiPreview}
              selectionContext={effectiveSelectionContext}
            />
            <EditorContent editor={editor} />
          </>
        ) : (
          <div className="flex min-h-[420px] items-center justify-center text-sm text-neutral-500">
            正在加载编辑器...
          </div>
        )}
      </div>

    </div>
  );
}
