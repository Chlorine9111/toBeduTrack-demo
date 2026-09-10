"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDroppable } from "@dnd-kit/react";
import { AnimatePresence, motion } from "motion/react";
import { Search, Upload, Check, Loader2 } from "lucide-react";
import { AlertDialog, Button } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";
import { useResizableWidth } from "@/hooks/use-resizable-width";
import type {
  AssetCategory,
  ContentAssetSummary,
  ContentFolder,
} from "@/lib/content-assets/types";
import type { AssetAnimState } from "@/hooks/use-organize-animation";
import {
  getContentCategoryLabel,
} from "./i18n";
import AssetTreeNode from "./AssetTreeNode";
import AssetTreeContextMenu from "./AssetTreeContextMenu";

type AssetTreePanelProps = {
  folders: ContentFolder[];
  assets: ContentAssetSummary[];
  foldersLoading: boolean;
  selectedFolderId?: string;
  selectedAssetId?: string;
  assetAnimStates?: Map<string, AssetAnimState>;
  folderReceiving?: Set<string>;
  autoExpandFolderIds?: Set<string>;
  onSelectFolder: (folderId: string | undefined) => void;
  onSelectAsset: (assetId: string) => void;
  onCreateDocument: (folderId?: string | null) => Promise<ContentAssetSummary>;
  onCreateFolder: (name: string, parentId?: string) => Promise<ContentFolder>;
  onRenameFolder: (id: string, name: string) => Promise<ContentFolder>;
  onRenameAsset: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  onDeleteAsset: (id: string) => Promise<void>;
  onMoveAsset?: (assetId: string, targetFolderId: string | null) => void | Promise<void>;
  onMoveFolder?: (folderId: string, targetFolderId: string | null) => void | Promise<void>;
  onBatchMoveSelection?: (selection: TreeBatchSelection, targetFolderId: string | null) => Promise<void>;
  onBatchDeleteSelection?: (selection: TreeBatchSelection) => Promise<void>;
  onCategorize?: (assetId: string, category: AssetCategory) => void;
  onFiles?: (files: File[]) => void;
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
  searchResults?: ContentAssetSummary[];
  searchLoading?: boolean;
  searchErrorText?: string;
};

type ContextMenuState = {
  target:
    | { type: "folder"; folder: ContentFolder }
    | { type: "asset"; asset: ContentAssetSummary }
    | { type: "blank"; parentFolderId: string | null }
    | null;
  position: { x: number; y: number } | null;
};

type RenameTarget = { id: string; type: "folder" | "asset" } | null;
type TreeBatchSelection = {
  folderIds: string[];
  assetIds: string[];
};
type MarqueeRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
type MarqueeSession = {
  anchorClientX: number;
  anchorClientY: number;
  additive: boolean;
  baseSelectionKeys: Set<string>;
  armTimer: number | null;
  isArmed: boolean;
  started: boolean;
  lockedDepth: number | null;
};

type OperationToast = {
  message: string;
  type: "loading" | "success" | "error";
};

const BASE_PX = 14;
const CHEVRON_OFFSET_PX = 14;
const MARQUEE_ARM_DELAY_MS = 180;
const TOAST_SUCCESS_DURATION_MS = 1500;

function toSelectionKey(type: "folder" | "asset", id: string) {
  return `${type}:${id}`;
}

function intersectsRect(
  a: Pick<DOMRect, "left" | "top" | "right" | "bottom">,
  b: Pick<DOMRect, "left" | "top" | "right" | "bottom">,
) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function isInteractiveSelectionTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      [
        "input",
        "textarea",
        "button",
        "[role='menu']",
        "[role='dialog']",
        "[data-disable-marquee-selection='true']",
      ].join(","),
    ),
  );
}

export default function AssetTreePanel({
  folders,
  assets,
  foldersLoading,
  selectedFolderId,
  selectedAssetId,
  assetAnimStates,
  folderReceiving,
  autoExpandFolderIds,
  onSelectFolder,
  onSelectAsset,
  onCreateDocument,
  onCreateFolder,
  onRenameFolder,
  onRenameAsset,
  onDeleteFolder,
  onDeleteAsset,
  onMoveAsset,
  onMoveFolder,
  onBatchMoveSelection,
  onBatchDeleteSelection,
  onCategorize,
  onFiles,
  searchQuery = "",
  onSearchQueryChange,
  searchResults = [],
  searchLoading = false,
  searchErrorText = "",
}: AssetTreePanelProps) {
  const { isZh } = useAppI18n();
  const { width: panelWidth, isDragging: isResizing, handleProps: resizeHandleProps } = useResizableWidth({
    defaultWidth: 280,
    minWidth: 220,
    maxWidth: 480,
    storageKey: "deskmate-content-library-width",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const treeContentRef = useRef<HTMLDivElement>(null);
  const marqueeSessionRef = useRef<MarqueeSession | null>(null);
  const suppressTreeClickRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    target: null,
    position: null,
  });
  const [creatingDocument, setCreatingDocument] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderId, setNewFolderId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const [batchActionSubmitting, setBatchActionSubmitting] = useState(false);
  const [pendingBatchDelete, setPendingBatchDelete] = useState<TreeBatchSelection | null>(null);
  const [operationToast, setOperationToast] = useState<OperationToast | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const treeDragDisabled = true;

  const childFoldersByParentId = useMemo(() => {
    const next = new Map<string | null, ContentFolder[]>();
    for (const folder of folders) {
      const bucket = next.get(folder.parentId) ?? [];
      bucket.push(folder);
      next.set(folder.parentId, bucket);
    }

    for (const [parentId, bucket] of next.entries()) {
      next.set(
        parentId,
        [...bucket].sort((a, b) => {
          if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
          return a.createdAt.localeCompare(b.createdAt);
        }),
      );
    }

    return next;
  }, [folders]);

  const assetsByFolderId = useMemo(() => {
    const next = new Map<string | null, ContentAssetSummary[]>();
    for (const asset of assets) {
      const bucket = next.get(asset.folderId) ?? [];
      bucket.push(asset);
      next.set(asset.folderId, bucket);
    }

    for (const [folderId, bucket] of next.entries()) {
      next.set(
        folderId,
        [...bucket].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
    }

    return next;
  }, [assets]);

  const rootFolders = childFoldersByParentId.get(null) ?? [];
  const rootAssets = assetsByFolderId.get(null) ?? [];
  const isSearchMode = searchQuery.trim().length > 0;
  const shouldVirtualizeSearchResults = searchResults.length >= 40;
  const searchVirtualizer = useVirtualizer({
    count: searchResults.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 38,
    overscan: 10,
  });
  const descendantIdsByFolderId = useMemo(() => {
    const descendants = new Map<string, Set<string>>();
    const walk = (folderId: string) => {
      if (descendants.has(folderId)) {
        return descendants.get(folderId)!;
      }

      const next = new Set<string>();
      for (const child of childFoldersByParentId.get(folderId) ?? []) {
        next.add(child.id);
        for (const nestedId of walk(child.id)) {
          next.add(nestedId);
        }
      }

      descendants.set(folderId, next);
      return next;
    };

    for (const folder of folders) {
      walk(folder.id);
    }

    return descendants;
  }, [childFoldersByParentId, folders]);
  const selectedFolders = useMemo(
    () => folders.filter((folder) => selectedKeys.has(toSelectionKey("folder", folder.id))),
    [folders, selectedKeys],
  );
  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedKeys.has(toSelectionKey("asset", asset.id))),
    [assets, selectedKeys],
  );
  const batchSelection = useMemo<TreeBatchSelection>(
    () => ({
      folderIds: selectedFolders.map((folder) => folder.id),
      assetIds: selectedAssets.map((asset) => asset.id),
    }),
    [selectedAssets, selectedFolders],
  );
  const selectedCount = selectedFolders.length + selectedAssets.length;
  const hasSystemFolderSelected = selectedFolders.some((folder) => folder.isSystem);
  const batchMoveTargets = useMemo(
    () => folders,
    [folders],
  );

  const showToast = useCallback((toast: OperationToast) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setOperationToast(toast);
    if (toast.type !== "loading") {
      toastTimerRef.current = setTimeout(() => {
        setOperationToast(null);
        toastTimerRef.current = null;
      }, TOAST_SUCCESS_DURATION_MS);
    }
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setOperationToast(null);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedKeys.size === 0) {
      return;
    }

    const validKeys = new Set<string>();
    for (const folder of folders) {
      validKeys.add(toSelectionKey("folder", folder.id));
    }
    for (const asset of assets) {
      validKeys.add(toSelectionKey("asset", asset.id));
    }

    setSelectedKeys((current) => {
      let changed = false;
      const next = new Set<string>();
      for (const key of current) {
        if (validKeys.has(key)) {
          next.add(key);
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [assets, folders, selectedKeys.size]);

  useEffect(() => {
    if (!renameTarget) return;
    const exists =
      renameTarget.type === "folder"
        ? folders.some((folder) => folder.id === renameTarget.id)
        : assets.some((asset) => asset.id === renameTarget.id);
    if (exists) return;
    setRenameTarget(null);
    setRenameDraft("");
    setRenameSubmitting(false);
  }, [assets, folders, renameTarget]);

  const handleFolderContextMenu = useCallback(
    (e: React.MouseEvent, folder: ContentFolder) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        target: { type: "folder", folder },
        position: { x: e.clientX, y: e.clientY },
      });
    },
    [],
  );

  const handleAssetContextMenu = useCallback(
    (e: React.MouseEvent, asset: ContentAssetSummary) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        target: { type: "asset", asset },
        position: { x: e.clientX, y: e.clientY },
      });
    },
    [],
  );

  const handleBlankContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({
        target: { type: "blank", parentFolderId: null },
        position: { x: e.clientX, y: e.clientY },
      });
    },
    [],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu({ target: null, position: null });
  }, []);

  const handleCreateFolderInContext = useCallback(async (parentId?: string) => {
    if (creatingFolder) return;
    try {
      setCreatingFolder(true);
      handleCloseContextMenu();
      showToast({ message: isZh ? "创建文件夹..." : "Creating folder...", type: "loading" });
      const created = await onCreateFolder(isZh ? "新建文件夹" : "New Folder", parentId);
      setNewFolderId(created.id);
      setTimeout(() => setNewFolderId(null), 3000);
      showToast({ message: isZh ? "已创建" : "Created", type: "success" });
    } catch {
      showToast({ message: isZh ? "创建失败" : "Create failed", type: "error" });
    } finally {
      setCreatingFolder(false);
    }
  }, [creatingFolder, handleCloseContextMenu, isZh, onCreateFolder, showToast]);

  const handleCreateDocumentInContext = useCallback(async (folderId?: string | null) => {
    if (creatingDocument) return;
    try {
      setCreatingDocument(true);
      handleCloseContextMenu();
      showToast({ message: isZh ? "创建文档..." : "Creating document...", type: "loading" });
      await onCreateDocument(folderId);
      showToast({ message: isZh ? "已创建" : "Created", type: "success" });
    } catch {
      showToast({ message: isZh ? "创建失败" : "Create failed", type: "error" });
    } finally {
      setCreatingDocument(false);
    }
  }, [creatingDocument, handleCloseContextMenu, isZh, onCreateDocument, showToast]);

  const handleOpenUpload = useCallback(() => {
    handleCloseContextMenu();
    fileInputRef.current?.click();
  }, [handleCloseContextMenu]);

  const handleCreateSubfolder = useCallback(
    async (parentId: string) => {
      try {
        await onCreateFolder(isZh ? "新建子文件夹" : "New Subfolder", parentId);
      } catch {
        // 静默处理
      }
    },
    [isZh, onCreateFolder],
  );

  const handleStartRename = useCallback(
    (id: string, type: "folder" | "asset") => {
      if (type === "folder" && folders.find((folder) => folder.id === id)?.isSystem) {
        return;
      }

      const currentName =
        type === "folder"
          ? folders.find((folder) => folder.id === id)?.name ?? ""
          : assets.find((asset) => asset.id === id)?.title ??
            assets.find((asset) => asset.id === id)?.fileName ??
            "";

      setRenameTarget({ id, type });
      setRenameDraft(currentName);
      setRenameSubmitting(false);
      handleCloseContextMenu();
    },
    [assets, folders, handleCloseContextMenu],
  );

  const handleCancelRename = useCallback(() => {
    setRenameTarget(null);
    setRenameDraft("");
    setRenameSubmitting(false);
  }, []);

  const handleCommitRename = useCallback(async () => {
    if (!renameTarget || renameSubmitting) {
      return;
    }

    const currentName =
      renameTarget.type === "folder"
        ? folders.find((folder) => folder.id === renameTarget.id)?.name ?? ""
        : assets.find((asset) => asset.id === renameTarget.id)?.title ??
          assets.find((asset) => asset.id === renameTarget.id)?.fileName ??
          "";

    const normalizedName = renameDraft.trim();
    if (!normalizedName || normalizedName === currentName.trim()) {
      handleCancelRename();
      return;
    }

    try {
      setRenameSubmitting(true);
      if (renameTarget.type === "folder") {
        await onRenameFolder(renameTarget.id, normalizedName);
      } else {
        await onRenameAsset(renameTarget.id, normalizedName);
      }
      handleCancelRename();
    } catch (error) {
      console.error(
        renameTarget.type === "folder" ? "重命名文件夹失败" : "重命名内容失败",
        error,
      );
      setRenameSubmitting(false);
    }
  }, [
    assets,
    folders,
    handleCancelRename,
    onRenameAsset,
    onRenameFolder,
    renameDraft,
    renameSubmitting,
    renameTarget,
  ]);

  const handleMoveTo = useCallback(
    async (id: string, type: "folder" | "asset", targetFolderId: string | null) => {
      const moveLabel = isZh ? "移动" : "Moving";
      const doneLabel = isZh ? "已移动" : "Moved";
      const failLabel = isZh ? "移动失败" : "Move failed";

      if (type === "asset" && onMoveAsset) {
        showToast({ message: `${moveLabel}...`, type: "loading" });
        try {
          await onMoveAsset(id, targetFolderId);
          showToast({ message: doneLabel, type: "success" });
        } catch {
          showToast({ message: failLabel, type: "error" });
        }
        return;
      }

      if (
        type === "folder" &&
        onMoveFolder &&
        targetFolderId !== id &&
        !(targetFolderId && descendantIdsByFolderId.get(id)?.has(targetFolderId))
      ) {
        showToast({ message: `${moveLabel}...`, type: "loading" });
        try {
          await onMoveFolder(id, targetFolderId);
          showToast({ message: doneLabel, type: "success" });
        } catch {
          showToast({ message: failLabel, type: "error" });
        }
      }
    },
    [descendantIdsByFolderId, isZh, onMoveAsset, onMoveFolder, showToast],
  );

  const handleDelete = useCallback(
    async (id: string, type: "folder" | "asset") => {
      showToast({ message: isZh ? "删除中..." : "Deleting...", type: "loading" });
      try {
        if (type === "folder") {
          await onDeleteFolder(id);
        } else {
          await onDeleteAsset(id);
        }
        showToast({ message: isZh ? "已删除" : "Deleted", type: "success" });
      } catch {
        showToast({ message: isZh ? "删除失败" : "Delete failed", type: "error" });
      }
    },
    [isZh, onDeleteFolder, onDeleteAsset, showToast],
  );

  const clearBatchSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  const handleSelectFolder = useCallback((folderId: string | undefined) => {
    clearBatchSelection();
    onSelectFolder(folderId);
  }, [clearBatchSelection, onSelectFolder]);

  const handleSelectAsset = useCallback((assetId: string) => {
    clearBatchSelection();
    onSelectAsset(assetId);
  }, [clearBatchSelection, onSelectAsset]);

  const collectIntersectingSelectionKeys = useCallback((
    rect: Pick<DOMRect, "left" | "top" | "right" | "bottom">,
    lockedDepth: number | null,
  ): { keys: Set<string>; detectedDepth: number | null } => {
    const container = scrollContainerRef.current;
    if (!container) return { keys: new Set<string>(), detectedDepth: null };

    const nodes = container.querySelectorAll<HTMLElement>("[data-tree-selectable='true']");
    const next = new Set<string>();
    let detectedDepth = lockedDepth;

    nodes.forEach((node) => {
      const key = node.dataset.treeSelectionKey;
      if (!key) return;

      const nodeDepth = Number(node.dataset.treeDepth ?? "0");
      const nodeRect = node.getBoundingClientRect();
      if (!intersectsRect(rect, nodeRect)) return;

      if (detectedDepth === null) {
        detectedDepth = nodeDepth;
      }

      if (nodeDepth === detectedDepth) {
        next.add(key);
      }
    });

    return { keys: next, detectedDepth };
  }, []);

  const handleTreeMouseDownCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    if (isInteractiveSelectionTarget(event.target)) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const targetElement = event.target instanceof Element ? event.target : null;
    const startedOnSelectable = Boolean(targetElement?.closest("[data-tree-selectable='true']"));
    const additive = event.metaKey || event.ctrlKey;

    if (!startedOnSelectable && !additive && selectedKeys.size > 0) {
      setSelectedKeys(new Set());
    }

    const startNode = targetElement?.closest("[data-tree-depth]") as HTMLElement | null;
    const initialDepth = startNode ? Number(startNode.dataset.treeDepth) : null;

    let baseKeys = additive ? new Set(selectedKeys) : new Set<string>();
    if (additive && initialDepth !== null && baseKeys.size > 0) {
      const depthFilteredKeys = new Set<string>();
      const allNodes = container.querySelectorAll<HTMLElement>("[data-tree-selectable='true']");
      allNodes.forEach((node) => {
        const key = node.dataset.treeSelectionKey;
        if (key && baseKeys.has(key) && Number(node.dataset.treeDepth ?? "0") === initialDepth) {
          depthFilteredKeys.add(key);
        }
      });
      baseKeys = depthFilteredKeys;
    }

    const session: MarqueeSession = {
      anchorClientX: event.clientX,
      anchorClientY: event.clientY,
      additive,
      baseSelectionKeys: baseKeys,
      armTimer: null,
      isArmed: false,
      started: false,
      lockedDepth: initialDepth,
    };
    session.armTimer = window.setTimeout(() => {
      if (marqueeSessionRef.current !== session) {
        return;
      }
      session.isArmed = true;
    }, MARQUEE_ARM_DELAY_MS);
    marqueeSessionRef.current = session;

    const finish = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (marqueeSessionRef.current?.armTimer) {
        window.clearTimeout(marqueeSessionRef.current.armTimer);
      }
      const didSelect = marqueeSessionRef.current?.started;
      marqueeSessionRef.current = null;
      setMarqueeRect(null);
      if (didSelect) {
        window.setTimeout(() => {
          suppressTreeClickRef.current = false;
        }, 0);
      }
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentSession = marqueeSessionRef.current;
      if (!currentSession) {
        return;
      }
      if (!currentSession.isArmed) {
        return;
      }

      const deltaX = Math.abs(moveEvent.clientX - currentSession.anchorClientX);
      const deltaY = Math.abs(moveEvent.clientY - currentSession.anchorClientY);
      if (!currentSession.started && deltaX < 4 && deltaY < 4) {
        return;
      }

      if (!currentSession.started) {
        currentSession.started = true;
        suppressTreeClickRef.current = true;
      }

      const containerRect = container.getBoundingClientRect();
      const left = Math.min(currentSession.anchorClientX, moveEvent.clientX);
      const top = Math.min(currentSession.anchorClientY, moveEvent.clientY);
      const right = Math.max(currentSession.anchorClientX, moveEvent.clientX);
      const bottom = Math.max(currentSession.anchorClientY, moveEvent.clientY);

      setMarqueeRect({
        left: left - containerRect.left + container.scrollLeft,
        top: top - containerRect.top + container.scrollTop,
        width: right - left,
        height: bottom - top,
      });

      const { keys: nextSelection, detectedDepth } = collectIntersectingSelectionKeys(
        { left, top, right, bottom },
        currentSession.lockedDepth,
      );
      if (currentSession.lockedDepth === null && detectedDepth !== null) {
        currentSession.lockedDepth = detectedDepth;
      }
      setSelectedKeys(
        currentSession.additive
          ? new Set([...currentSession.baseSelectionKeys, ...nextSelection])
          : nextSelection,
      );
    };

    const handleMouseUp = () => {
      finish();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [collectIntersectingSelectionKeys, selectedKeys]);

  const handleTreeClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressTreeClickRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    suppressTreeClickRef.current = false;
  }, []);

  const isBatchMoveTargetDisabled = useCallback((targetFolderId: string | null) => {
    if (hasSystemFolderSelected) {
      return true;
    }
    if (targetFolderId == null) {
      return false;
    }

    return selectedFolders.some(
      (folder) =>
        folder.id === targetFolderId ||
        descendantIdsByFolderId.get(folder.id)?.has(targetFolderId),
    );
  }, [descendantIdsByFolderId, hasSystemFolderSelected, selectedFolders]);

  const handleBatchMove = useCallback(async (targetFolderId: string | null) => {
    if (
      !onBatchMoveSelection ||
      batchActionSubmitting ||
      selectedCount === 0 ||
      isBatchMoveTargetDisabled(targetFolderId)
    ) {
      return;
    }

    try {
      setBatchActionSubmitting(true);
      showToast({ message: isZh ? "批量移动中..." : "Moving items...", type: "loading" });
      await onBatchMoveSelection(batchSelection, targetFolderId);
      handleCloseContextMenu();
      clearBatchSelection();
      showToast({ message: isZh ? "已移动" : "Moved", type: "success" });
    } catch {
      showToast({ message: isZh ? "移动失败" : "Move failed", type: "error" });
    } finally {
      setBatchActionSubmitting(false);
    }
  }, [
    batchActionSubmitting,
    batchSelection,
    handleCloseContextMenu,
    clearBatchSelection,
    isBatchMoveTargetDisabled,
    isZh,
    onBatchMoveSelection,
    selectedCount,
    showToast,
  ]);

  const handleOpenBatchDelete = useCallback(() => {
    if (
      !onBatchDeleteSelection ||
      batchActionSubmitting ||
      selectedCount === 0 ||
      hasSystemFolderSelected
    ) {
      return;
    }

    setPendingBatchDelete(batchSelection);
    handleCloseContextMenu();
  }, [
    batchActionSubmitting,
    batchSelection,
    handleCloseContextMenu,
    hasSystemFolderSelected,
    onBatchDeleteSelection,
    selectedCount,
  ]);

  const handleConfirmBatchDelete = useCallback(async () => {
    if (!pendingBatchDelete || !onBatchDeleteSelection) {
      return;
    }

    try {
      setBatchActionSubmitting(true);
      await onBatchDeleteSelection(pendingBatchDelete);
      setPendingBatchDelete(null);
      clearBatchSelection();
      showToast({ message: isZh ? "已删除" : "Deleted", type: "success" });
    } catch {
      showToast({ message: isZh ? "删除失败" : "Delete failed", type: "error" });
    } finally {
      setBatchActionSubmitting(false);
    }
  }, [clearBatchSelection, isZh, onBatchDeleteSelection, pendingBatchDelete, showToast]);

  const pendingDeleteCount =
    (pendingBatchDelete?.folderIds.length ?? 0) +
    (pendingBatchDelete?.assetIds.length ?? 0);
  const contextMenuSelection = useMemo(() => {
    if (!contextMenu.target || contextMenu.target.type === "blank" || selectedCount < 2) {
      return null;
    }

    const selectionKey =
      contextMenu.target.type === "folder"
        ? toSelectionKey("folder", contextMenu.target.folder.id)
        : toSelectionKey("asset", contextMenu.target.asset.id);

    return selectedKeys.has(selectionKey) ? batchSelection : null;
  }, [batchSelection, contextMenu.target, selectedCount, selectedKeys]);
  const contextMenuSelectionCount =
    (contextMenuSelection?.folderIds.length ?? 0) +
    (contextMenuSelection?.assetIds.length ?? 0);

  return (
    <div
      className={cn("relative flex h-full shrink-0 flex-col bg-default-100", isResizing && "select-none")}
      style={{ width: panelWidth }}
    >
      <div className="flex items-center px-4 pt-4 pb-2">
        <span className="text-[12px] font-medium text-foreground/50">
          {isZh ? "内容库" : "Library"}
        </span>
      </div>

      <div className="px-4 pb-3">
        <label className="flex items-center gap-2 rounded-lg border border-divider bg-white px-3 py-2">
          <Search className="h-3.5 w-3.5 text-default-400" />
          <input
            data-testid="content-assets-search-input"
            suppressHydrationWarning
            value={searchQuery}
            onChange={(event) => onSearchQueryChange?.(event.target.value)}
            placeholder={isZh ? "搜索内容、课程、来源..." : "Search content, course, source..."}
            className="w-full bg-transparent text-[13px] text-foreground outline-hidden placeholder:text-default-300"
          />
        </label>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        role="tree"
        onMouseDownCapture={handleTreeMouseDownCapture}
        onClickCapture={handleTreeClickCapture}
        onContextMenu={handleBlankContextMenu}
      >
        <div ref={treeContentRef} className="relative min-h-full pb-2">
        {foldersLoading ? (
          <div className="space-y-1 px-3 py-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[38px] animate-pulse rounded bg-default-100"
                style={{ width: `${75 - i * 12}%` }}
              />
            ))}
          </div>
        ) : isSearchMode ? (
          <div className="pb-2">
            <div className="px-4 pb-1.5 text-[12px] font-medium text-foreground/50">
              {isZh ? "搜索结果" : "Search Results"}
            </div>
            {searchLoading ? (
              <div className="flex items-center gap-2 px-4 py-4 text-[13px] text-default-400">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-default-300 border-t-foreground" />
                <span>{isZh ? "正在搜索内容..." : "Searching content..."}</span>
              </div>
            ) : searchErrorText ? (
              <div className="px-4 py-4 text-[13px] text-rose-500">
                {searchErrorText}
              </div>
            ) : searchResults.length > 0 ? (
              shouldVirtualizeSearchResults ? (
                <div
                  style={{
                    height: `${searchVirtualizer.getTotalSize()}px`,
                    position: "relative",
                  }}
                >
                  {searchVirtualizer.getVirtualItems().map((virtualItem) => {
                    const asset = searchResults[virtualItem.index];
                    if (!asset) return null;

                    return (
                      <div
                        key={asset.id}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${virtualItem.size}px`,
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                      >
                        <AssetTreeNode
                          asset={asset}
                          depth={0}
                          isSelected={selectedAssetId === asset.id}
                          isBatchSelected={selectedKeys.has(toSelectionKey("asset", asset.id))}
                          onSelect={() => handleSelectAsset(asset.id)}
                          onContextMenu={(e) => handleAssetContextMenu(e, asset)}
                          childFoldersByParentId={childFoldersByParentId}
                          assetsByFolderId={assetsByFolderId}
                          selectedFolderId={selectedFolderId}
                          selectedAssetId={selectedAssetId}
                          batchSelectedKeys={selectedKeys}
                          dragDisabled={treeDragDisabled}
                          onSelectFolder={onSelectFolder}
                          onSelectAsset={onSelectAsset}
                          onFolderContextMenu={handleFolderContextMenu}
                          onAssetContextMenu={handleAssetContextMenu}
                          assetAnimStates={assetAnimStates}
                          folderReceiving={folderReceiving}
                          autoExpandFolderIds={autoExpandFolderIds}
                          renamingTarget={renameTarget}
                          renameDraft={renameDraft}
                          renameSubmitting={renameSubmitting}
                          onRenameDraftChange={setRenameDraft}
                          onRenameSubmit={() => void handleCommitRename()}
                          onRenameCancel={handleCancelRename}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                searchResults.map((asset) => (
                  <AssetTreeNode
                    key={asset.id}
                    asset={asset}
                    depth={0}
                    isSelected={selectedAssetId === asset.id}
                    isBatchSelected={selectedKeys.has(toSelectionKey("asset", asset.id))}
                    onSelect={() => handleSelectAsset(asset.id)}
                    onContextMenu={(e) => handleAssetContextMenu(e, asset)}
                    childFoldersByParentId={childFoldersByParentId}
                    assetsByFolderId={assetsByFolderId}
                    selectedFolderId={selectedFolderId}
                    selectedAssetId={selectedAssetId}
                    batchSelectedKeys={selectedKeys}
                    dragDisabled={treeDragDisabled}
                    onSelectFolder={onSelectFolder}
                    onSelectAsset={onSelectAsset}
                    onFolderContextMenu={handleFolderContextMenu}
                    onAssetContextMenu={handleAssetContextMenu}
                    assetAnimStates={assetAnimStates}
                    folderReceiving={folderReceiving}
                    autoExpandFolderIds={autoExpandFolderIds}
                    renamingTarget={renameTarget}
                    renameDraft={renameDraft}
                    renameSubmitting={renameSubmitting}
                    onRenameDraftChange={setRenameDraft}
                    onRenameSubmit={() => void handleCommitRename()}
                    onRenameCancel={handleCancelRename}
                  />
                ))
              )
            ) : (
              <div className="px-3 py-8 text-center text-[13px] text-default-400">
                {isZh ? "没有匹配的内容" : "No matching content"}
              </div>
            )}
          </div>
        ) : (
          <>
            <div
              className={cn(
                "flex h-[38px] cursor-pointer items-center select-none transition-colors duration-150",
                "hover:bg-default-100",
                selectedFolderId === undefined && "bg-accent/6 border-l-2 border-accent",
              )}
              style={{ paddingLeft: BASE_PX + CHEVRON_OFFSET_PX }}
              onClick={() => handleSelectFolder(undefined)}
            >
              <span className="text-[13px] font-medium leading-[38px] text-foreground">
                {isZh ? "全部" : "All"}
              </span>
            </div>

            {onCategorize && (
              <div className="mx-3 border-t border-foreground/6 px-1 py-2.5">
                <div className="flex flex-wrap gap-1.5">
                  <CategoryDropTarget category="instructional" label={getContentCategoryLabel("instructional", isZh)} color="var(--heroui-primary)" />
                  <CategoryDropTarget category="assessment" label={getContentCategoryLabel("assessment", isZh)} color="#D9730D" />
                  <CategoryDropTarget category="student_work" label={getContentCategoryLabel("student_work", isZh)} color="#0F7B6C" />
                  <CategoryDropTarget category="reference" label={getContentCategoryLabel("reference", isZh)} color="var(--heroui-default-400)" />
                </div>
              </div>
            )}

            {rootFolders.map((folder) => (
              <AssetTreeNode
                key={folder.id}
                folder={folder}
                depth={0}
                isSelected={selectedFolderId === folder.id}
                isBatchSelected={selectedKeys.has(toSelectionKey("folder", folder.id))}
                isNewlyCreated={folder.id === newFolderId}
                onSelect={() => handleSelectFolder(folder.id)}
                onContextMenu={(e) => handleFolderContextMenu(e, folder)}
                childFoldersByParentId={childFoldersByParentId}
                assetsByFolderId={assetsByFolderId}
                selectedFolderId={selectedFolderId}
                selectedAssetId={selectedAssetId}
                batchSelectedKeys={selectedKeys}
                dragDisabled={treeDragDisabled}
                onSelectFolder={onSelectFolder}
                onSelectAsset={onSelectAsset}
                onFolderContextMenu={handleFolderContextMenu}
                onAssetContextMenu={handleAssetContextMenu}
                assetAnimStates={assetAnimStates}
                folderReceiving={folderReceiving}
                autoExpandFolderIds={autoExpandFolderIds}
                renamingTarget={renameTarget}
                renameDraft={renameDraft}
                renameSubmitting={renameSubmitting}
                onRenameDraftChange={setRenameDraft}
                onRenameSubmit={() => void handleCommitRename()}
                onRenameCancel={handleCancelRename}
              />
            ))}

            {rootAssets.length > 0 && rootFolders.length > 0 ? (
              <div className="mx-3 my-1 h-px bg-foreground/6" />
            ) : null}

            {rootAssets.map((asset) => (
              <AssetTreeNode
                key={asset.id}
                asset={asset}
                depth={0}
                isSelected={selectedAssetId === asset.id}
                isBatchSelected={selectedKeys.has(toSelectionKey("asset", asset.id))}
                onSelect={() => handleSelectAsset(asset.id)}
                onContextMenu={(e) => handleAssetContextMenu(e, asset)}
                childFoldersByParentId={childFoldersByParentId}
                assetsByFolderId={assetsByFolderId}
                selectedFolderId={selectedFolderId}
                selectedAssetId={selectedAssetId}
                batchSelectedKeys={selectedKeys}
                dragDisabled={treeDragDisabled}
                onSelectFolder={onSelectFolder}
                onSelectAsset={onSelectAsset}
                onFolderContextMenu={handleFolderContextMenu}
                onAssetContextMenu={handleAssetContextMenu}
                assetAnimStates={assetAnimStates}
                folderReceiving={folderReceiving}
                autoExpandFolderIds={autoExpandFolderIds}
                renamingTarget={renameTarget}
                renameDraft={renameDraft}
                renameSubmitting={renameSubmitting}
                onRenameDraftChange={setRenameDraft}
                onRenameSubmit={() => void handleCommitRename()}
                onRenameCancel={handleCancelRename}
              />
            ))}
          </>
        )}
        {marqueeRect ? (
          <div
            data-testid="content-assets-marquee"
            className="pointer-events-none absolute z-20 rounded-lg bg-foreground/[0.07]"
            style={{
              left: marqueeRect.left,
              top: marqueeRect.top,
              width: marqueeRect.width,
              height: marqueeRect.height,
            }}
          />
        ) : null}
        </div>
      </div>

      <AnimatePresence>
        {operationToast ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="shrink-0 overflow-hidden"
          >
            <div
              className={cn(
                "flex items-center gap-2 border-t px-4 py-2 text-[12px]",
                operationToast.type === "loading" && "border-foreground/6 bg-default-50 text-foreground-500",
                operationToast.type === "success" && "border-emerald-500/10 bg-emerald-50 text-emerald-700",
                operationToast.type === "error" && "border-rose-500/10 bg-rose-50 text-rose-600",
              )}
            >
              {operationToast.type === "loading" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : operationToast.type === "success" ? (
                <Check size={12} />
              ) : (
                <span className="text-[12px]">!</span>
              )}
              <span>{operationToast.message}</span>
              {operationToast.type !== "loading" ? (
                <button
                  type="button"
                  className="ml-auto text-[11px] opacity-50 hover:opacity-100"
                  onClick={dismissToast}
                >
                  ×
                </button>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="shrink-0 border-t border-foreground/6 px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          data-tour-id="assets-upload"
          className="flex w-full items-center justify-center gap-1.5 rounded py-1.5 text-[12px] text-foreground-400 hover:bg-default-200 hover:text-foreground-600"
          onPress={() => fileInputRef.current?.click()}
        >
          <Upload size={13} />
          {isZh ? "上传文件" : "Upload Files"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.pptx,.xlsx,.txt,.md,.png,.jpg,.jpeg,.webp"
          suppressHydrationWarning
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0 && onFiles) {
              onFiles(Array.from(files));
            }
            e.target.value = "";
          }}
        />
      </div>

      <AssetTreeContextMenu
        target={contextMenu.target}
        position={contextMenu.position}
        onClose={handleCloseContextMenu}
        onRename={handleStartRename}
        onCreateSubfolder={handleCreateSubfolder}
        onCreateDocument={(folderId) => void handleCreateDocumentInContext(folderId)}
        onCreateFolder={(parentId) => void handleCreateFolderInContext(parentId)}
        onUploadFiles={handleOpenUpload}
        onDelete={handleDelete}
        folders={folders}
        onMoveTo={handleMoveTo}
        descendantIdsByFolderId={descendantIdsByFolderId}
        batchSelection={contextMenuSelection}
        batchSelectionCount={contextMenuSelectionCount}
        hasSystemFolderSelected={Boolean(contextMenuSelection) && hasSystemFolderSelected}
        batchMoveFolders={batchMoveTargets}
        isBatchMoveTargetDisabled={isBatchMoveTargetDisabled}
        onBatchMoveTo={(targetFolderId) => void handleBatchMove(targetFolderId)}
        onBatchDelete={handleOpenBatchDelete}
      />

      <AlertDialog.Backdrop
        isOpen={pendingBatchDelete != null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !batchActionSubmitting) {
            setPendingBatchDelete(null);
          }
        }}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>
                {isZh ? "批量删除内容" : "Delete Selected Items"}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                {isZh
                  ? `确定要删除这 ${pendingDeleteCount} 项内容吗？此操作无法撤回。`
                  : `Delete these ${pendingDeleteCount} selected items? This action cannot be undone.`}
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                variant="secondary"
                isDisabled={batchActionSubmitting}
                onPress={() => setPendingBatchDelete(null)}
              >
                {isZh ? "取消" : "Cancel"}
              </Button>
              <Button
                variant="danger"
                isDisabled={batchActionSubmitting}
                onPress={() => void handleConfirmBatchDelete()}
              >
                {batchActionSubmitting
                  ? isZh
                    ? "删除中..."
                    : "Deleting..."
                  : isZh
                    ? "确认删除"
                    : "Delete"}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>

      {/* 右边缘拖拽手柄 */}
      <div
        data-disable-marquee-selection="true"
        {...resizeHandleProps}
      />
    </div>
  );
}

function CategoryDropTarget({
  category,
  label,
  color,
}: {
  category: AssetCategory;
  label: string;
  color: string;
}) {
  const { ref, isDropTarget } = useDroppable({
    id: `category-${category}`,
    data: { type: "category", category },
  });

  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-all duration-150",
        isDropTarget
          ? "scale-105 shadow-sm"
          : "opacity-60 hover:opacity-100",
      )}
      style={{
        backgroundColor: isDropTarget ? `${color}20` : `${color}10`,
        color,
        boxShadow: isDropTarget ? `0 0 0 2px ${color}` : undefined,
      }}
    >
      <span
        className="h-[5px] w-[5px] rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </div>
  );
}
