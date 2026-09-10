"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Check, Clipboard, LoaderCircle, WandSparkles, XCircle } from "lucide-react";
import DocumentBlockRenderer from "@/components/doc-engine/DocumentBlockRenderer";
import { serializeDocumentToMarkdown } from "@/lib/doc-engine/adapters";
import type { DocumentBlock, DocumentModel, HeaderBlock } from "@/lib/doc-engine/block-types";
import { parseDocumentModel } from "@/lib/doc-engine/document-schema";
import { cn } from "@/lib/utils";

type DocumentEngineProps = {
  document: DocumentModel;
  onDocumentChange?: (nextDocument: DocumentModel) => void;
};

type MenuRect = {
  top: number;
  left: number;
};

type SerializedRange = {
  startPath: number[];
  startOffset: number;
  endPath: number[];
  endOffset: number;
};

type BlockSelectionState = {
  blockIds: string[];
  text: string;
  rect: MenuRect;
  nativeRange: SerializedRange | null;
};

type ResultBanner =
  | {
      kind: "success";
      text: string;
    }
  | {
      kind: "error";
      text: string;
    };

const CHANGE_HIGHLIGHT_MS = 2200;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_INSTRUCTION_LENGTH = 500;
const DOCUMENT_ENGINE_CSS = `
  .doc-engine-page[data-doc-columns="2"] .doc-engine-body {
    column-count: 2;
    column-gap: 24px;
  }

  .doc-engine-page .doc-engine-node,
  .doc-engine-page .doc-engine-node * {
    user-select: text;
    -webkit-user-select: text;
  }

  .doc-engine-page .doc-engine-node {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .doc-engine-page .doc-engine-node--selected {
    border-color: rgba(59, 130, 246, 0.35) !important;
    background: rgba(239, 246, 255, 0.9) !important;
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.14);
  }

  .doc-engine-page .doc-engine-node--editing {
    opacity: 0.58;
    border-style: dashed !important;
    border-color: rgba(217, 119, 6, 0.55) !important;
    background: rgba(254, 243, 199, 0.6) !important;
  }

  .doc-engine-page .doc-engine-node--changed {
    border-color: rgba(34, 197, 94, 0.45) !important;
    background: rgba(220, 252, 231, 0.68) !important;
    box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.18);
  }

  .doc-engine-page *::selection {
    background: rgba(59, 130, 246, 0.24);
    color: inherit;
  }

  .doc-engine-page *::-moz-selection {
    background: rgba(59, 130, 246, 0.24);
    color: inherit;
  }

  .doc-engine-page [data-doc-page-break="true"] {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .doc-engine-page [data-doc-page-break="true"] .doc-engine-page-break-marker {
    display: flex;
  }

  @media print {
    .doc-engine-page [data-doc-page-break="true"] {
      break-before: page;
      page-break-before: always;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    .doc-engine-page [data-doc-page-break="true"] .doc-engine-page-break-marker {
      display: none !important;
    }
  }
`;

function getPageMetrics(pageSize: DocumentModel["layoutConfig"]["pageSize"]) {
  if (pageSize === "Letter") {
    return {
      width: "8.5in",
      minHeight: "11in",
    };
  }

  return {
    width: "210mm",
    minHeight: "297mm",
  };
}

function cloneRangeRect(range: Range, root: HTMLElement) {
  const rangeRect = range.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const maxWidth = Math.max(root.clientWidth - 28, 28);

  return {
    top: Math.max(rangeRect.top - rootRect.top - 16, 20),
    left: Math.min(
      Math.max(rangeRect.left - rootRect.left + rangeRect.width / 2, 28),
      maxWidth,
    ),
  };
}

function getNodePath(root: Node, target: Node): number[] | null {
  const path: number[] = [];
  let current: Node | null = target;

  while (current && current !== root) {
    const parent: Node | null = current.parentNode;
    if (!parent) return null;
    const index = Array.prototype.indexOf.call(parent.childNodes, current);
    if (index < 0) return null;
    path.unshift(index);
    current = parent;
  }

  return current === root ? path : null;
}

function getNodeByPath(root: Node, path: number[]): Node | null {
  let current: Node | null = root;

  for (const index of path) {
    current = current?.childNodes[index] ?? null;
    if (!current) return null;
  }

  return current;
}

function serializeRange(root: HTMLElement, range: Range): SerializedRange | null {
  const startPath = getNodePath(root, range.startContainer);
  const endPath = getNodePath(root, range.endContainer);
  if (!startPath || !endPath) return null;

  return {
    startPath,
    startOffset: range.startOffset,
    endPath,
    endOffset: range.endOffset,
  };
}

function deserializeRange(root: HTMLElement, serializedRange: SerializedRange) {
  const startNode = getNodeByPath(root, serializedRange.startPath);
  const endNode = getNodeByPath(root, serializedRange.endPath);
  if (!startNode || !endNode) return null;

  const range = document.createRange();
  range.setStart(
    startNode,
    Math.min(serializedRange.startOffset, startNode.nodeType === Node.TEXT_NODE ? startNode.nodeValue?.length ?? 0 : startNode.childNodes.length),
  );
  range.setEnd(
    endNode,
    Math.min(serializedRange.endOffset, endNode.nodeType === Node.TEXT_NODE ? endNode.nodeValue?.length ?? 0 : endNode.childNodes.length),
  );
  return range;
}

function samePath(a: number[], b: number[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function isSerializedRangeEqual(a: SerializedRange | null, b: SerializedRange | null) {
  if (!a || !b) return a === b;
  return (
    samePath(a.startPath, b.startPath) &&
    samePath(a.endPath, b.endPath) &&
    a.startOffset === b.startOffset &&
    a.endOffset === b.endOffset
  );
}

function findSelectedBlockIds(root: HTMLElement, range: Range) {
  const blockIds = Array.from(root.querySelectorAll<HTMLElement>("[data-doc-block-id]"))
    .filter((element) => {
      try {
        return range.intersectsNode(element);
      } catch {
        return false;
      }
    })
    .map((element) => element.dataset.docBlockId?.trim() || "")
    .filter(Boolean);

  return Array.from(new Set(blockIds));
}

function getBlockIndexRange(document: DocumentModel, selectedIds: string[]) {
  const idSet = new Set(selectedIds);
  const indexes = document.blocks
    .map((block, index) => (idSet.has(block.id) ? index : -1))
    .filter((index) => index >= 0);

  if (indexes.length === 0) return null;
  return {
    startIndex: indexes[0],
    endIndex: indexes[indexes.length - 1],
  };
}

function getSelectedBlocks(document: DocumentModel, blockIds: string[]) {
  const idSet = new Set(blockIds);
  return document.blocks.filter((block) => idSet.has(block.id));
}

function getSurroundingBlocks(document: DocumentModel, blockIds: string[]) {
  const range = getBlockIndexRange(document, blockIds);
  if (!range) return [];

  return document.blocks.filter((_, index) => {
    if (index >= range.startIndex && index <= range.endIndex) return false;
    return (
      index >= Math.max(range.startIndex - 2, 0) &&
      index <= Math.min(range.endIndex + 2, document.blocks.length - 1)
    );
  });
}

function buildBlockSelectionPreview(root: HTMLElement, blockIds: string[]) {
  return blockIds
    .map((blockId) =>
      root
        .querySelector<HTMLElement>(`[data-doc-block-id="${CSS.escape(blockId)}"]`)
        ?.innerText.replace(/\s+/g, " ")
        .trim() || "",
    )
    .filter(Boolean)
    .join("\n");
}

function buildBlockSelectionRect(root: HTMLElement, blockIds: string[]) {
  const firstElement = root.querySelector<HTMLElement>(
    `[data-doc-block-id="${CSS.escape(blockIds[0] ?? "")}"]`,
  );
  const lastElement = root.querySelector<HTMLElement>(
    `[data-doc-block-id="${CSS.escape(blockIds[blockIds.length - 1] ?? "")}"]`,
  );
  if (!firstElement || !lastElement) return null;

  const firstRect = firstElement.getBoundingClientRect();
  const lastRect = lastElement.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();

  return {
    top: Math.max(Math.min(firstRect.top, lastRect.top) - rootRect.top - 12, 20),
    left: Math.min(
      Math.max(
        (Math.min(firstRect.left, lastRect.left) +
          Math.max(firstRect.right, lastRect.right)) /
          2 -
          rootRect.left,
        28,
      ),
      Math.max(root.clientWidth - 28, 28),
    ),
  };
}

function deriveDocumentTitle(blocks: DocumentBlock[], fallbackTitle: string) {
  const headerBlock = blocks.find((block): block is HeaderBlock => block.type === "header");
  return headerBlock?.data.title?.trim() || fallbackTitle;
}

function replaceBlocksInDocument(
  baseDocument: DocumentModel,
  selectedIds: string[],
  modifiedBlocks: DocumentBlock[],
) {
  const range = getBlockIndexRange(baseDocument, selectedIds);
  if (!range) return null;

  const nextBlocks = [
    ...baseDocument.blocks.slice(0, range.startIndex),
    ...modifiedBlocks,
    ...baseDocument.blocks.slice(range.endIndex + 1),
  ];

  const ids = nextBlocks.map((block) => block.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("AI 返回了重复的 block ID，已取消本次替换。");
  }

  return (
    parseDocumentModel({
      ...baseDocument,
      title: deriveDocumentTitle(nextBlocks, baseDocument.title),
      blocks: nextBlocks,
    }) ?? null
  );
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export default function DocumentEngine({ document, onDocumentChange }: DocumentEngineProps) {
  const [currentDocument, setCurrentDocument] = useState(document);
  const [selection, setSelection] = useState<BlockSelectionState | null>(null);
  const [selectionMenuMode, setSelectionMenuMode] = useState<"compact" | "edit">("compact");
  const [instruction, setInstruction] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [banner, setBanner] = useState<ResultBanner | null>(null);
  const [editingIds, setEditingIds] = useState<string[]>([]);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const instructionRef = useRef<HTMLTextAreaElement | null>(null);
  const documentRef = useRef(currentDocument);
  const propSignatureRef = useRef("");
  const highlightTimerRef = useRef<number | null>(null);
  const bannerTimerRef = useRef<number | null>(null);
  const isPointerSelectingRef = useRef(false);
  const hadSelectionOnPointerDownRef = useRef(false);
  const historyPastRef = useRef<DocumentModel[]>([]);
  const historyFutureRef = useRef<DocumentModel[]>([]);
  const isRestoringSelectionRef = useRef(false);
  const isClearingSelectionRef = useRef(false);

  const pageMetrics = getPageMetrics(currentDocument.layoutConfig.pageSize);

  const publishDocument = useCallback(
    (nextDocument: DocumentModel) => {
      const nextSignature = JSON.stringify(nextDocument);
      propSignatureRef.current = nextSignature;
      documentRef.current = nextDocument;
      setCurrentDocument(nextDocument);
      onDocumentChange?.(nextDocument);
    },
    [onDocumentChange],
  );

  const clearBanner = useCallback(() => {
    if (bannerTimerRef.current) {
      window.clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
  }, []);

  const showBanner = useCallback(
    (nextBanner: ResultBanner) => {
      clearBanner();
      setBanner(nextBanner);
      bannerTimerRef.current = window.setTimeout(() => {
        setBanner(null);
        bannerTimerRef.current = null;
      }, nextBanner.kind === "error" ? 5000 : 2400);
    },
    [clearBanner],
  );

  const clearSelection = useCallback((clearNativeSelection = false) => {
    setSelection(null);
    setSelectionMenuMode("compact");
    setInstruction("");

    if (clearNativeSelection) {
      isClearingSelectionRef.current = true;
      const selectionApi = window.getSelection();
      selectionApi?.removeAllRanges();
      window.requestAnimationFrame(() => {
        isClearingSelectionRef.current = false;
      });
    }
  }, []);

  const scheduleHighlightClear = useCallback(() => {
    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }

    highlightTimerRef.current = window.setTimeout(() => {
      setEditingIds([]);
      setHighlightIds([]);
      highlightTimerRef.current = null;
    }, CHANGE_HIGHLIGHT_MS);
  }, []);

  const resetTransientState = useCallback(
    (clearNativeSelection = false) => {
      clearSelection(clearNativeSelection);
      setEditingIds([]);
      setHighlightIds([]);
    },
    [clearSelection],
  );

  const refreshSelectionFromDom = useCallback(() => {
    const page = pageRef.current;
    if (!page || isEditing) return;

    const nativeSelection = window.getSelection();
    if (!nativeSelection || nativeSelection.rangeCount === 0 || nativeSelection.isCollapsed) {
      return;
    }

    const text = nativeSelection.toString().replace(/\s+/g, " ").trim();
    if (!text) return;

    const range = nativeSelection.getRangeAt(0);
    if (!page.contains(range.commonAncestorContainer)) return;

    const blockIds = findSelectedBlockIds(page, range);
    if (blockIds.length === 0) return;
    const nativeRange = serializeRange(page, range);

    setSelection((previous) => {
      const isSameSelection = Boolean(
        previous &&
          previous.text === text &&
          previous.blockIds.length === blockIds.length &&
          previous.blockIds.every((blockId, index) => blockId === blockIds[index]) &&
          isSerializedRangeEqual(previous.nativeRange, nativeRange),
      );

      if (!isSameSelection) {
        setSelectionMenuMode("compact");
        setInstruction("");
      } else if (previous) {
        return previous;
      }

      return {
        blockIds,
        text,
        rect: cloneRangeRect(range, page),
        nativeRange,
      };
    });
  }, [isEditing]);

  const restoreNativeSelection = useCallback(() => {
    if (!selection?.nativeRange) return;
    if (selectionMenuMode !== "compact") return;
    if (isEditing) return;

    const page = pageRef.current;
    if (!page) return;

    const nativeSelection = window.getSelection();
    const currentRange =
      nativeSelection && nativeSelection.rangeCount > 0 && !nativeSelection.isCollapsed
        ? serializeRange(page, nativeSelection.getRangeAt(0))
        : null;

    if (isSerializedRangeEqual(currentRange, selection.nativeRange)) {
      return;
    }

    const restoredRange = deserializeRange(page, selection.nativeRange);
    if (!restoredRange) return;

    isRestoringSelectionRef.current = true;
    nativeSelection?.removeAllRanges();
    nativeSelection?.addRange(restoredRange);

    window.requestAnimationFrame(() => {
      isRestoringSelectionRef.current = false;
    });
  }, [isEditing, selection, selectionMenuMode]);

  useEffect(() => {
    documentRef.current = currentDocument;
  }, [currentDocument]);

  useEffect(() => {
    const nextSignature = JSON.stringify(document);
    if (propSignatureRef.current === nextSignature) return;
    propSignatureRef.current = nextSignature;

    historyPastRef.current = [];
    historyFutureRef.current = [];
    documentRef.current = document;
    setCurrentDocument(document);
    resetTransientState(true);
  }, [document, resetTransientState]);

  useEffect(() => {
    const handleSelectionChange = () => {
      if (isPointerSelectingRef.current) return;
      if (isRestoringSelectionRef.current) return;
      if (isClearingSelectionRef.current) return;
      const nativeSelection = window.getSelection();
      const hasNativeSelection = Boolean(
        nativeSelection &&
          nativeSelection.rangeCount > 0 &&
          !nativeSelection.isCollapsed &&
          nativeSelection.toString().trim(),
      );
      if (!hasNativeSelection) {
        restoreNativeSelection();
        return;
      }
      refreshSelectionFromDom();
    };

    const handleScroll = () => {
      if (!selection) return;
      refreshSelectionFromDom();
    };

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (pageRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      clearSelection();
    };

    const handleMouseUp = () => {
      if (!isPointerSelectingRef.current) return;
      isPointerSelectingRef.current = false;
      window.requestAnimationFrame(() => {
        refreshSelectionFromDom();
      });
    };

    globalThis.document.addEventListener("selectionchange", handleSelectionChange);
    globalThis.document.addEventListener("mousedown", handleMouseDown);
    globalThis.document.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      globalThis.document.removeEventListener("selectionchange", handleSelectionChange);
      globalThis.document.removeEventListener("mousedown", handleMouseDown);
      globalThis.document.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [clearSelection, refreshSelectionFromDom, restoreNativeSelection, selection]);

  useEffect(() => {
    if (!selection || selectionMenuMode !== "edit") return;
    instructionRef.current?.focus();
  }, [selection, selectionMenuMode]);

  useLayoutEffect(() => {
    restoreNativeSelection();
  }, [restoreNativeSelection]);

  useEffect(() => {
    return () => {
      clearBanner();
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
      if (bannerTimerRef.current) {
        window.clearTimeout(bannerTimerRef.current);
      }
    };
  }, [clearBanner]);

  const handlePageMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const nativeSelection = window.getSelection();
      hadSelectionOnPointerDownRef.current = Boolean(
        selection ||
          (nativeSelection && !nativeSelection.isCollapsed && nativeSelection.toString().trim()),
      );
      isPointerSelectingRef.current = true;
    },
    [selection],
  );

  const handlePageMouseUp = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      isPointerSelectingRef.current = false;
      window.requestAnimationFrame(() => {
        refreshSelectionFromDom();
      });
    },
    [refreshSelectionFromDom],
  );

  const handlePageClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (isEditing) return;

      const nativeSelection = window.getSelection();
      if (nativeSelection && !nativeSelection.isCollapsed && nativeSelection.toString().trim()) {
        return;
      }

      if (hadSelectionOnPointerDownRef.current && !event.shiftKey) {
        hadSelectionOnPointerDownRef.current = false;
        clearSelection(true);
        return;
      }

      hadSelectionOnPointerDownRef.current = false;

      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (menuRef.current?.contains(target)) return;

      const blockElement = target.closest<HTMLElement>("[data-doc-block-id]");
      if (!blockElement || !pageRef.current?.contains(blockElement)) {
        clearSelection();
        return;
      }

      const blockId = blockElement.dataset.docBlockId?.trim();
      if (!blockId) return;

      if (event.shiftKey && selection?.blockIds.length && pageRef.current) {
        const anchorId = selection.blockIds[0];
        const orderedIds = currentDocument.blocks.map((block) => block.id);
        const anchorIndex = orderedIds.indexOf(anchorId);
        const clickedIndex = orderedIds.indexOf(blockId);

        if (anchorIndex >= 0 && clickedIndex >= 0) {
          const rangeIds = orderedIds.slice(
            Math.min(anchorIndex, clickedIndex),
            Math.max(anchorIndex, clickedIndex) + 1,
          );
          const rangeRect = buildBlockSelectionRect(pageRef.current, rangeIds);

          setSelection({
            blockIds: rangeIds,
            text: buildBlockSelectionPreview(pageRef.current, rangeIds),
            rect: rangeRect ?? selection.rect,
            nativeRange: null,
          });
          return;
        }
      }

      clearSelection();
    },
    [clearSelection, currentDocument, isEditing, refreshSelectionFromDom, selection],
  );

  const selectedBlocks = selection ? getSelectedBlocks(currentDocument, selection.blockIds) : [];
  const selectedChars = selection?.text.replace(/\s+/g, "").length ?? 0;
  const selectionLabel = selection
    ? `已选 ${selection.blockIds.length} 个 block${selectedChars > 0 ? ` · ${selectedChars} 字` : ""}`
    : "";

  const copySource =
    selectedBlocks.length > 0
      ? serializeDocumentToMarkdown({
          ...currentDocument,
          blocks: selectedBlocks,
        })
      : "";

  const handleCopySelection = useCallback(async () => {
    if (!selection || selectedBlocks.length === 0) return;

    try {
      await copyText(selection.text || copySource);
      showBanner({
        kind: "success",
        text: "已复制选中内容。",
      });
    } catch {
      showBanner({
        kind: "error",
        text: "复制失败，请稍后再试。",
      });
    }
  }, [copySource, selectedBlocks.length, selection, showBanner]);

  const handleUndo = useCallback(() => {
    const previous = historyPastRef.current.pop();
    if (!previous) return;

    historyFutureRef.current.push(documentRef.current);
    publishDocument(previous);
    resetTransientState(true);
  }, [publishDocument, resetTransientState]);

  const handleRedo = useCallback(() => {
    const next = historyFutureRef.current.pop();
    if (!next) return;

    historyPastRef.current.push(documentRef.current);
    publishDocument(next);
    resetTransientState(true);
  }, [publishDocument, resetTransientState]);

  const handleApplyEdit = useCallback(async () => {
    if (!selection || isEditing) return;

    const trimmedInstruction = instruction.trim();
    if (!trimmedInstruction) {
      showBanner({
        kind: "error",
        text: "请先输入修改指令。",
      });
      return;
    }

    if (trimmedInstruction.length > MAX_INSTRUCTION_LENGTH) {
      showBanner({
        kind: "error",
        text: `修改指令不能超过 ${MAX_INSTRUCTION_LENGTH} 字。`,
      });
      return;
    }

    if (selectedBlocks.length === 0) {
      showBanner({
        kind: "error",
        text: "当前没有可修改的 block。",
      });
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    setIsEditing(true);
    setEditingIds(selection.blockIds);
    setHighlightIds([]);

    try {
      const response = await fetch("/api/doc/edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          documentId: currentDocument.id,
          selectedBlockIds: selection.blockIds,
          selectedBlocks,
          instruction: trimmedInstruction,
          documentContext: {
            documentType: currentDocument.type,
            title: currentDocument.title,
            meta: currentDocument.meta,
            totalBlockCount: currentDocument.blocks.length,
            surroundingBlocks: getSurroundingBlocks(currentDocument, selection.blockIds),
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(errorText || "文档编辑接口调用失败。");
      }

      const payload = (await response.json()) as {
        modifiedBlocks?: unknown;
        summary?: string;
      };

      if (!Array.isArray(payload.modifiedBlocks)) {
        throw new Error("文档编辑接口返回格式不正确。");
      }

      let invalidBlockCount = 0;
      const normalizedBlocks = payload.modifiedBlocks
        .map((item, index) => {
          const parsed = parseDocumentModel({
            ...currentDocument,
            blocks: [item],
          });
          if (parsed?.blocks[0]) {
            return parsed.blocks[0];
          }

          invalidBlockCount += 1;
          return selectedBlocks[index] ?? null;
        })
        .filter((block): block is DocumentBlock => Boolean(block));

      const nextDocument = replaceBlocksInDocument(currentDocument, selection.blockIds, normalizedBlocks);
      if (!nextDocument) {
        throw new Error("无法定位当前选中的 block，替换已取消。");
      }

      historyPastRef.current.push(currentDocument);
      historyFutureRef.current = [];
      publishDocument(nextDocument);
      setEditingIds([]);
      setHighlightIds(normalizedBlocks.map((block) => block.id));
      scheduleHighlightClear();
      clearSelection(true);
      showBanner({
        kind: "success",
        text: [
          payload.summary?.trim() || "已应用 AI 修改。",
          invalidBlockCount > 0 ? `${invalidBlockCount} 个无效 block 已保留原文。` : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.name === "AbortError"
            ? "文档编辑超时，原内容已保留。"
            : error.message
          : "文档编辑失败，原内容已保留。";
      showBanner({
        kind: "error",
        text: message,
      });
      setEditingIds([]);
      setHighlightIds([]);
    } finally {
      window.clearTimeout(timeoutId);
      setIsEditing(false);
    }
  }, [
    clearSelection,
    currentDocument,
    instruction,
    isEditing,
    publishDocument,
    scheduleHighlightClear,
    selectedBlocks,
    selection,
    showBanner,
  ]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const isUndo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z";
      if (isUndo) {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && selection) {
        event.preventDefault();
        void handleApplyEdit();
      }
    },
    [handleApplyEdit, handleRedo, handleUndo, selection],
  );

  const selectedIdSet = new Set(selection?.blockIds ?? []);
  const editingIdSet = new Set(editingIds);
  const highlightIdSet = new Set(highlightIds);

  return (
    <div className="relative" onKeyDownCapture={handleKeyDown}>
      {banner ? (
        <div
          data-print-hide
          className={cn(
            "absolute right-4 top-4 z-30 inline-flex max-w-[320px] items-center gap-2 rounded-full border px-3 py-2 text-xs shadow-xs",
            banner.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          {banner.kind === "success" ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <XCircle className="h-3.5 w-3.5" />
          )}
          <span>{banner.text}</span>
        </div>
      ) : null}

      <div
        ref={pageRef}
        data-doc-engine-page
        data-doc-columns={currentDocument.layoutConfig.columns}
        onMouseDownCapture={handlePageMouseDown}
        onMouseUp={handlePageMouseUp}
        onClickCapture={handlePageClick}
        className="doc-engine-page relative mx-auto w-full max-w-full overflow-hidden rounded-[32px] border border-[#ddd6c8] bg-white shadow-[0_30px_80px_rgba(65,51,24,0.08)]"
        style={{
          maxWidth: pageMetrics.width,
          minHeight: pageMetrics.minHeight,
        }}
        tabIndex={0}
      >
        <style>{DOCUMENT_ENGINE_CSS}</style>
        <div className="border-b border-[#ebe4d8] px-8 py-4 text-xs text-neutral-500">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                {currentDocument.meta.schoolLogo ? (
                  <img
                    src={currentDocument.meta.schoolLogo}
                    alt="学校 Logo"
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate font-medium text-neutral-700">
                    {currentDocument.layoutConfig.headerText?.trim() ||
                      [currentDocument.meta.courseName, currentDocument.meta.unitName]
                        .filter(Boolean)
                        .join(" · ") ||
                      currentDocument.title}
                  </p>
                  {currentDocument.meta.teacherName ? (
                    <p className="mt-1 truncate text-[11px] text-neutral-400">
                      {currentDocument.meta.teacherName}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            {currentDocument.meta.date ? (
              <span className="shrink-0 text-[11px] text-neutral-400">{currentDocument.meta.date}</span>
            ) : null}
          </div>
        </div>

        <div
          className="doc-engine-body px-8 py-8"
          style={{
            paddingTop: `${currentDocument.layoutConfig.margins.top}mm`,
            paddingRight: `${currentDocument.layoutConfig.margins.right}mm`,
            paddingBottom: `${currentDocument.layoutConfig.margins.bottom}mm`,
            paddingLeft: `${currentDocument.layoutConfig.margins.left}mm`,
            fontFamily: '"Times New Roman", "Noto Serif SC", serif',
          }}
        >
          {currentDocument.blocks.map((block) => (
            <DocumentBlockRenderer
              key={block.id}
              block={block}
              selected={selectedIdSet.has(block.id)}
              editing={editingIdSet.has(block.id)}
              changed={highlightIdSet.has(block.id)}
            />
          ))}
        </div>

        {(currentDocument.layoutConfig.footerText || currentDocument.layoutConfig.showPageNumbers) ? (
          <div className="border-t border-[#ebe4d8] px-8 py-4 text-[11px] text-neutral-400">
            <div className="flex items-center justify-between gap-4">
              <span>{currentDocument.layoutConfig.footerText || " "}</span>
              {currentDocument.layoutConfig.showPageNumbers ? <span>第 1 页</span> : null}
            </div>
          </div>
        ) : null}
      </div>

      {selection ? (
        <>
          <div
            ref={menuRef}
            data-print-hide
            className="doc-engine-selection-menu absolute z-20 -translate-x-1/2 -translate-y-full"
            style={{
              top: selection.rect.top,
              left: selection.rect.left,
            }}
          >
            <div className="inline-flex max-w-[calc(100vw-24px)] items-center gap-1.5 rounded-full border border-neutral-200 bg-white/96 p-1.5 shadow-[0_16px_36px_rgba(15,23,42,0.14)] backdrop-blur-sm">
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-500">
                {selectionLabel}
              </span>
              <button
                type="button"
                onClick={() => setSelectionMenuMode("edit")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                  selectionMenuMode === "edit"
                    ? "bg-neutral-900 text-white"
                    : "bg-white text-neutral-700 hover:bg-neutral-50",
                )}
              >
                <WandSparkles className="h-3.5 w-3.5" />
                AI 修改
              </button>
              <button
                type="button"
                onClick={() => void handleCopySelection()}
                className="inline-flex items-center justify-center rounded-full border border-neutral-200 bg-white p-2 text-neutral-600 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-800"
                aria-label="复制选区"
              >
                <Clipboard className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => clearSelection(true)}
                className="inline-flex items-center justify-center rounded-full border border-transparent bg-white p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="关闭编辑菜单"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {selectionMenuMode === "edit" ? (
            <div
              ref={panelRef}
              data-print-hide
              className="fixed bottom-6 right-6 z-30 w-[320px] max-w-[calc(100vw-24px)] rounded-[24px] border border-neutral-200 bg-white/98 p-3 shadow-[0_20px_48px_rgba(15,23,42,0.18)] backdrop-blur-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                    AI 修改
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">{selectionLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectionMenuMode("compact")}
                  className="rounded-full p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                  aria-label="收起 AI 修改面板"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 max-h-20 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs leading-5 text-neutral-600">
                {selection.text
                  ? selection.text
                  : selectedBlocks.map((block) => block.id).join(" / ")}
              </div>

              <textarea
                ref={instructionRef}
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="例如：把这两题改成关于导数的，整体难度下降一级。"
                className="mt-3 min-h-[72px] w-full resize-none rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-800 outline-hidden transition placeholder:text-neutral-400 focus:border-neutral-300 focus:ring-2 focus:ring-neutral-200"
                maxLength={MAX_INSTRUCTION_LENGTH}
              />

              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[11px] text-neutral-400">
                  {instruction.trim().length}/{MAX_INSTRUCTION_LENGTH}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopySelection()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
                  >
                    <Clipboard className="h-3.5 w-3.5" />
                    复制
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleApplyEdit()}
                    disabled={isEditing || !instruction.trim()}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white transition",
                      isEditing || !instruction.trim()
                        ? "bg-neutral-300"
                        : "bg-neutral-900 hover:bg-neutral-800",
                    )}
                  >
                    {isEditing ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <WandSparkles className="h-3.5 w-3.5" />
                    )}
                    {isEditing ? "编辑中..." : "应用 AI 修改"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
