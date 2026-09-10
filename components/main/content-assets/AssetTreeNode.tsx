"use client";

import { memo, useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useDraggable, useDroppable } from "@dnd-kit/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";
import type {
  AssetCategory,
  ContentAssetSummary,
  ContentFolder,
  ProcessingStatus,
} from "@/lib/content-assets/types";
import type { AssetAnimState } from "@/hooks/use-organize-animation";
import { getContentFolderLabel } from "./i18n";
import WorksheetProjectIcon from "./WorksheetProjectIcon";

function TreeChevron({ expanded }: { expanded: boolean }) {
  return (
    <motion.svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      className="shrink-0"
      animate={{ rotate: expanded ? 90 : 0 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
    >
      <path
        d="M4 2.5L7.5 6L4 9.5"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </motion.svg>
  );
}

function StatusDot({ status }: { status: ProcessingStatus }) {
  if (status === "ready") return null;
  return (
    <span
      className={cn(
        "ml-1.5 h-[5px] w-[5px] shrink-0 rounded-full",
        status === "failed"
          ? "bg-danger"
          : "bg-default-400 animate-pulse",
      )}
    />
  );
}

const CATEGORY_COLOR: Record<AssetCategory, string | null> = {
  instructional: "var(--heroui-primary)",
  assessment: "#D9730D",
  student_work: "#0F7B6C",
  reference: "var(--heroui-default-400)",
  uncategorized: null,
};

function CategoryDot({ category }: { category: AssetCategory }) {
  const color = CATEGORY_COLOR[category];
  if (!color) return null;
  return (
    <span
      className="ml-1.5 h-[5px] w-[5px] shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

// ── 文件类型幽灵药丸 ─────────────────────────────────────────
// 极淡底色 + 有色文字 + 圆角胶囊，显示扩展名
type FileTypeTagConfig = { label: string; color: string };

const FILE_TYPE_TAG: Record<string, FileTypeTagConfig> = {
  pdf:       { label: "pdf",  color: "var(--heroui-danger)" },
  docx:      { label: "doc",  color: "#2B579A" },
  spreadsheet:{ label: "sheet", color: "#1D6F42" },
  text:      { label: "txt",  color: "var(--heroui-default-500)" },
  image:     { label: "img",  color: "#D9730D" },
  flashcard: { label: "card", color: "#0F7B6C" },
  download:  { label: "file", color: "var(--heroui-default-400)" },
};

function FileTypeTag({ previewKind }: { previewKind: string }) {
  const config = FILE_TYPE_TAG[previewKind];
  if (!config) return null;
  return (
    <span
      className="mr-1.5 inline-flex shrink-0 items-center rounded-[4px] px-[4px] py-[1px] text-[9px] font-medium leading-none tracking-wide"
      style={{
        backgroundColor: `${config.color}0D`,
        color: `${config.color}B3`,
      }}
    >
      {config.label}
    </span>
  );
}

function WorksheetProjectTag() {
  return (
    <span className="mr-1.5 inline-flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px] bg-[#37352F]/8 text-[#37352F]">
      <WorksheetProjectIcon size={10} />
    </span>
  );
}

type AssetTreeNodeProps = {
  folder?: ContentFolder;
  asset?: ContentAssetSummary;
  depth: number;
  isSelected: boolean;
  isBatchSelected?: boolean;
  isNewlyCreated?: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  childFoldersByParentId: Map<string | null, ContentFolder[]>;
  assetsByFolderId: Map<string | null, ContentAssetSummary[]>;
  selectedFolderId?: string;
  selectedAssetId?: string;
  batchSelectedKeys?: Set<string>;
  dragDisabled?: boolean;
  onSelectFolder: (folderId: string) => void;
  onSelectAsset: (assetId: string) => void;
  onFolderContextMenu: (e: React.MouseEvent, folder: ContentFolder) => void;
  onAssetContextMenu: (e: React.MouseEvent, asset: ContentAssetSummary) => void;
  assetAnimStates?: Map<string, AssetAnimState>;
  folderReceiving?: Set<string>;
  autoExpandFolderIds?: Set<string>;
  renamingTarget?: { id: string; type: "folder" | "asset" } | null;
  renameDraft?: string;
  renameSubmitting?: boolean;
  onRenameDraftChange?: (value: string) => void;
  onRenameSubmit?: () => void;
  onRenameCancel?: () => void;
};

const INDENT_PX = 20;
const BASE_PX = 14;
const CHEVRON_OFFSET_PX = 14;
const HOVER_EXPAND_DELAY_MS = 600;
const BATCH_SELECTION_BACKGROUND = "rgba(55,53,47,0.08)";
const ACTIVE_SELECTION_BACKGROUND = "rgba(248,114,80,0.06)";
const collapseTransition = {
  duration: 0.15,
  ease: [0.25, 0.1, 0.25, 1] as const,
};

function InlineRenameField({
  value,
  onChange,
  onSubmit,
  onCancel,
  disabled,
  className,
  placeholder,
}: {
  value: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  disabled?: boolean;
  className?: string;
  placeholder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const stopPropagation = useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit?.();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel?.();
    }
  }, [onCancel, onSubmit]);

  return (
    <input
      ref={inputRef}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => onChange?.(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => onSubmit?.()}
      onClick={stopPropagation}
      onContextMenu={stopPropagation}
      onPointerDown={stopPropagation}
      className={cn(
        "h-7 rounded-md border border-accent/25 bg-white px-2 text-[13px] text-foreground outline-hidden",
        "focus:border-accent focus:ring-2 focus:ring-accent/15",
        "disabled:cursor-wait disabled:opacity-70",
        className,
      )}
    />
  );
}

function AssetTreeNode({
  folder,
  asset,
  depth,
  isBatchSelected = false,
  isNewlyCreated,
  onSelect,
  onContextMenu,
  childFoldersByParentId,
  assetsByFolderId,
  selectedFolderId,
  selectedAssetId,
  batchSelectedKeys,
  dragDisabled = false,
  onSelectFolder,
  onSelectAsset,
  onFolderContextMenu,
  onAssetContextMenu,
  assetAnimStates,
  folderReceiving,
  autoExpandFolderIds,
  renamingTarget,
  renameDraft,
  renameSubmitting,
  onRenameDraftChange,
  onRenameSubmit,
  onRenameCancel,
}: AssetTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (folder && autoExpandFolderIds?.has(folder.id)) {
      setExpanded(true);
    }
  }, [folder, autoExpandFolderIds]);

  const basePadding = depth * INDENT_PX + BASE_PX;

  if (folder) {
    return (
      <FolderNode
        folder={folder}
        depth={depth}
        basePadding={basePadding}
        expanded={expanded}
        isBatchSelected={isBatchSelected}
        isNewlyCreated={isNewlyCreated}
        onToggle={() => {
          setExpanded((prev) => !prev);
          onSelectFolder(folder.id);
        }}
        onContextMenu={(e) => onFolderContextMenu(e, folder)}
        isFolderSelected={selectedFolderId === folder.id}
        isReceiving={folderReceiving?.has(folder.name) ?? false}
        childFoldersByParentId={childFoldersByParentId}
        assetsByFolderId={assetsByFolderId}
        selectedFolderId={selectedFolderId}
        selectedAssetId={selectedAssetId}
        batchSelectedKeys={batchSelectedKeys}
        dragDisabled={dragDisabled}
        onSelectFolder={onSelectFolder}
        onSelectAsset={onSelectAsset}
        onFolderContextMenu={onFolderContextMenu}
        onAssetContextMenu={onAssetContextMenu}
        assetAnimStates={assetAnimStates}
        folderReceiving={folderReceiving}
        autoExpandFolderIds={autoExpandFolderIds}
        renamingTarget={renamingTarget}
        renameDraft={renameDraft}
        renameSubmitting={renameSubmitting}
        onRenameDraftChange={onRenameDraftChange}
        onRenameSubmit={onRenameSubmit}
        onRenameCancel={onRenameCancel}
      />
    );
  }

  if (asset) {
    return (
      <AssetFileNode
        asset={asset}
        depth={depth}
        basePadding={basePadding}
        isAssetSelected={selectedAssetId === asset.id}
        isBatchSelected={isBatchSelected}
        animState={assetAnimStates?.get(asset.id) ?? "idle"}
        dragDisabled={dragDisabled}
        onSelect={onSelect}
        onContextMenu={onContextMenu}
        isRenaming={renamingTarget?.type === "asset" && renamingTarget.id === asset.id}
        renameDraft={renameDraft}
        renameSubmitting={renameSubmitting}
        onRenameDraftChange={onRenameDraftChange}
        onRenameSubmit={onRenameSubmit}
        onRenameCancel={onRenameCancel}
      />
    );
  }

  return null;
}

const MemoizedAssetTreeNode = memo(AssetTreeNode);
export default MemoizedAssetTreeNode;

const FolderNode = memo(function FolderNode({
  folder,
  depth,
  basePadding,
  expanded,
  isBatchSelected,
  isNewlyCreated,
  onToggle,
  onContextMenu,
  isFolderSelected,
  isReceiving,
  childFoldersByParentId,
  assetsByFolderId,
  selectedFolderId,
  selectedAssetId,
  batchSelectedKeys,
  dragDisabled = false,
  onSelectFolder,
  onSelectAsset,
  onFolderContextMenu,
  onAssetContextMenu,
  assetAnimStates,
  folderReceiving,
  autoExpandFolderIds,
  renamingTarget,
  renameDraft = "",
  renameSubmitting = false,
  onRenameDraftChange,
  onRenameSubmit,
  onRenameCancel,
}: {
  folder: ContentFolder;
  depth: number;
  basePadding: number;
  expanded: boolean;
  isBatchSelected: boolean;
  isNewlyCreated?: boolean;
  onToggle: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isFolderSelected: boolean;
  isReceiving: boolean;
  childFoldersByParentId: Map<string | null, ContentFolder[]>;
  assetsByFolderId: Map<string | null, ContentAssetSummary[]>;
  selectedFolderId?: string;
  selectedAssetId?: string;
  batchSelectedKeys?: Set<string>;
  dragDisabled?: boolean;
  onSelectFolder: (id: string) => void;
  onSelectAsset: (id: string) => void;
  onFolderContextMenu: (e: React.MouseEvent, f: ContentFolder) => void;
  onAssetContextMenu: (e: React.MouseEvent, a: ContentAssetSummary) => void;
  assetAnimStates?: Map<string, AssetAnimState>;
  folderReceiving?: Set<string>;
  autoExpandFolderIds?: Set<string>;
  renamingTarget?: { id: string; type: "folder" | "asset" } | null;
  renameDraft?: string;
  renameSubmitting?: boolean;
  onRenameDraftChange?: (value: string) => void;
  onRenameSubmit?: () => void;
  onRenameCancel?: () => void;
}) {
  const { isZh } = useAppI18n();
  const childFolders = childFoldersByParentId.get(folder.id) ?? [];
  const childAssets = assetsByFolderId.get(folder.id) ?? [];
  const isRenaming = renamingTarget?.type === "folder" && renamingTarget.id === folder.id;

  const { ref: dragRef, isDragging } = useDraggable({
    id: `draggable-folder-${folder.id}`,
    data: { type: "folder-move", folderId: folder.id },
    disabled: folder.isSystem || dragDisabled,
  });

  const { ref: dropRef, isDropTarget } = useDroppable({
    id: `folder-${folder.id}`,
    data: { type: "folder", folderId: folder.id },
  });

  const [localExpanded, setLocalExpanded] = useState(expanded);
  useEffect(() => setLocalExpanded(expanded), [expanded]);
  useEffect(() => {
    if (!isDropTarget || localExpanded) return;
    const timer = setTimeout(() => setLocalExpanded(true), HOVER_EXPAND_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isDropTarget, localExpanded]);

  const combinedRef = useCallback(
    (node: HTMLElement | null) => {
      if (typeof dragRef === "function") dragRef(node);
      else if (dragRef && "current" in dragRef) {
        (dragRef as { current: HTMLElement | null }).current = node;
      }

      if (typeof dropRef === "function") dropRef(node);
      else if (dropRef && "current" in dropRef) {
        (dropRef as { current: HTMLElement | null }).current = node;
      }
    },
    [dragRef, dropRef],
  );

  const showExpanded = localExpanded || expanded;
  const restingBackgroundColor = isBatchSelected
    ? BATCH_SELECTION_BACKGROUND
    : (isFolderSelected || isNewlyCreated)
      ? ACTIVE_SELECTION_BACKGROUND
      : "transparent";

  return (
    <motion.div
      className={cn("transition-opacity duration-150", isDragging && "opacity-40")}
      initial={isNewlyCreated ? { opacity: 0, y: -8, scale: 0.97 } : false}
      animate={isNewlyCreated ? { opacity: 1, y: 0, scale: 1 } : undefined}
      transition={isNewlyCreated ? { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] } : undefined}
    >
      <motion.div
        ref={combinedRef}
        role="treeitem"
        aria-expanded={showExpanded}
        data-testid={`content-folder-tree-item-${folder.id}`}
        data-folder-name={folder.name}
        data-tree-selectable={folder.isSystem ? "false" : "true"}
        data-tree-selection-key={`folder:${folder.id}`}
        data-tree-selection-type="folder"
        data-tree-depth={depth}
        className={cn(
          "relative flex h-[38px] cursor-pointer items-center select-none",
          "hover:bg-default-100",
          isFolderSelected && "border-l-2 border-accent",
        )}
        style={{ paddingLeft: basePadding }}
        animate={
          isDropTarget
            ? { backgroundColor: "rgba(45,100,200,0.08)" }
            : isReceiving
              ? {
                  backgroundColor: [
                    "rgba(255,183,77,0.12)",
                    "rgba(255,183,77,0)",
                    "rgba(255,183,77,0.08)",
                    "rgba(255,183,77,0)",
                  ],
                }
              : { backgroundColor: restingBackgroundColor }
        }
        transition={
          isDropTarget
            ? { duration: 0.15 }
            : isReceiving
              ? { duration: 0.8, ease: "easeOut" }
              : { duration: 0.2 }
        }
        onClick={onToggle}
        onContextMenu={onContextMenu}
      >
        <AnimatePresence>
          {isDropTarget && (
            <motion.div
              className="absolute left-0 top-[4px] bottom-[4px] w-[2px] rounded-full bg-primary"
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              exit={{ scaleY: 0, opacity: 0 }}
              transition={{ duration: 0.12 }}
            />
          )}
        </AnimatePresence>

        <span className={cn(
          "text-foreground/40 transition-colors duration-100",
          isDropTarget && "text-primary",
          isFolderSelected && "text-accent",
        )}>
          <TreeChevron expanded={showExpanded || isDropTarget} />
        </span>
        {isRenaming ? (
          <InlineRenameField
            value={renameDraft}
            disabled={renameSubmitting}
            placeholder={getContentFolderLabel(folder, isZh)}
            onChange={onRenameDraftChange}
            onSubmit={onRenameSubmit}
            onCancel={onRenameCancel}
            className="ml-1.5 w-[calc(100%-26px)]"
          />
        ) : (
          <span
            className={cn(
              "ml-1.5 truncate text-[13px] font-medium leading-[38px] transition-colors duration-100",
              isDropTarget ? "text-primary" : "text-foreground",
            )}
          >
            {getContentFolderLabel(folder, isZh)}
          </span>
        )}
      </motion.div>

      <AnimatePresence initial={false}>
        {showExpanded && (
          <motion.div
            key="children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={collapseTransition}
            className="relative overflow-hidden"
          >
            {/* tree guide line — 连接父子节点的细竖线 */}
            <div
              className="absolute top-0 bottom-0 w-px bg-default-200"
              style={{ left: basePadding + 4 }}
            />
            {childFolders.map((child) => (
              <MemoizedAssetTreeNode
                key={child.id}
                folder={child}
                depth={depth + 1}
                isSelected={selectedFolderId === child.id}
                isBatchSelected={Boolean(batchSelectedKeys?.has(`folder:${child.id}`))}
                onSelect={() => onSelectFolder(child.id)}
                onContextMenu={(e) => onFolderContextMenu(e, child)}
                childFoldersByParentId={childFoldersByParentId}
                assetsByFolderId={assetsByFolderId}
                selectedFolderId={selectedFolderId}
                selectedAssetId={selectedAssetId}
                batchSelectedKeys={batchSelectedKeys}
                dragDisabled={dragDisabled}
                onSelectFolder={onSelectFolder}
                onSelectAsset={onSelectAsset}
                onFolderContextMenu={onFolderContextMenu}
                onAssetContextMenu={onAssetContextMenu}
                assetAnimStates={assetAnimStates}
                folderReceiving={folderReceiving}
                autoExpandFolderIds={autoExpandFolderIds}
                renamingTarget={renamingTarget}
                renameDraft={renameDraft}
                renameSubmitting={renameSubmitting}
                onRenameDraftChange={onRenameDraftChange}
                onRenameSubmit={onRenameSubmit}
                onRenameCancel={onRenameCancel}
              />
            ))}

            {childAssets.map((child) => (
              <MemoizedAssetTreeNode
                key={child.id}
                asset={child}
                depth={depth + 1}
                isSelected={selectedAssetId === child.id}
                isBatchSelected={Boolean(batchSelectedKeys?.has(`asset:${child.id}`))}
                onSelect={() => onSelectAsset(child.id)}
                onContextMenu={(e) => onAssetContextMenu(e, child)}
                childFoldersByParentId={childFoldersByParentId}
                assetsByFolderId={assetsByFolderId}
                selectedFolderId={selectedFolderId}
                selectedAssetId={selectedAssetId}
                batchSelectedKeys={batchSelectedKeys}
                dragDisabled={dragDisabled}
                onSelectFolder={onSelectFolder}
                onSelectAsset={onSelectAsset}
                onFolderContextMenu={onFolderContextMenu}
                onAssetContextMenu={onAssetContextMenu}
                assetAnimStates={assetAnimStates}
                folderReceiving={folderReceiving}
                autoExpandFolderIds={autoExpandFolderIds}
                renamingTarget={renamingTarget}
                renameDraft={renameDraft}
                renameSubmitting={renameSubmitting}
                onRenameDraftChange={onRenameDraftChange}
                onRenameSubmit={onRenameSubmit}
                onRenameCancel={onRenameCancel}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

const AssetFileNode = memo(function AssetFileNode({
  asset,
  depth,
  basePadding,
  isAssetSelected,
  isBatchSelected,
  animState,
  dragDisabled = false,
  onSelect,
  onContextMenu,
  isRenaming = false,
  renameDraft = "",
  renameSubmitting = false,
  onRenameDraftChange,
  onRenameSubmit,
  onRenameCancel,
}: {
  asset: ContentAssetSummary;
  depth: number;
  basePadding: number;
  isAssetSelected: boolean;
  isBatchSelected: boolean;
  animState: AssetAnimState | "idle";
  dragDisabled?: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isRenaming?: boolean;
  renameDraft?: string;
  renameSubmitting?: boolean;
  onRenameDraftChange?: (value: string) => void;
  onRenameSubmit?: () => void;
  onRenameCancel?: () => void;
}) {
  const { isZh } = useAppI18n();
  const { ref: dragRef, isDragging } = useDraggable({
    id: `draggable-asset-${asset.id}`,
    data: { type: "asset", assetId: asset.id },
    disabled: dragDisabled,
  });

  const pointerStart = useRef({ x: 0, y: 0 });
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const dx = Math.abs(e.clientX - pointerStart.current.x);
    const dy = Math.abs(e.clientY - pointerStart.current.y);
    if (dx > 5 || dy > 5) return;
    onSelect();
  }, [onSelect]);
  const restingBackgroundColor = isBatchSelected
    ? BATCH_SELECTION_BACKGROUND
    : isAssetSelected
      ? ACTIVE_SELECTION_BACKGROUND
      : "transparent";

  return (
    <motion.div
      ref={dragRef as React.Ref<HTMLDivElement>}
      role="treeitem"
      data-testid={`content-asset-tree-item-${asset.id}`}
      data-asset-id={asset.id}
      data-tree-selectable="true"
      data-tree-selection-key={`asset:${asset.id}`}
      data-tree-selection-type="asset"
      data-tree-depth={depth}
      className={cn(
        "relative flex h-[38px] items-center select-none",
        isDragging ? "cursor-grabbing opacity-40" : "cursor-pointer",
        "hover:bg-default-100",
        isAssetSelected && "border-l-2 border-accent",
      )}
      style={{ paddingLeft: basePadding + CHEVRON_OFFSET_PX }}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onContextMenu={onContextMenu}
      variants={{
        idle: {
          opacity: isDragging ? 0.4 : 1,
          scale: 1,
          backgroundColor: restingBackgroundColor,
          transition: { duration: 0.3 },
        },
        highlighting: {
          opacity: 1,
          scale: 1.02,
          backgroundColor: "rgba(255,183,77,0.25)",
          transition: { duration: 0.2, ease: "easeOut" },
        },
        departing: {
          opacity: 0.25,
          scale: 0.96,
          backgroundColor: "rgba(255,183,77,0.08)",
          transition: { duration: 0.3, ease: "easeIn" },
        },
        arriving: {
          opacity: 1,
          scale: 1,
          y: [-6, 0],
          backgroundColor: ["hsl(var(--heroui-success) / 0.15)", restingBackgroundColor],
          transition: { type: "spring", stiffness: 500, damping: 30 },
        },
      }}
      initial={false}
      animate={animState}
    >
      <AnimatePresence>
        {(animState === "highlighting" || animState === "departing") && (
          <motion.div
            className="absolute left-0 top-[3px] bottom-[3px] w-[3px] rounded-full"
            style={{ backgroundColor: "#F59E0B" }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            exit={{ scaleY: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          />
        )}
      </AnimatePresence>

      {isRenaming ? (
        <InlineRenameField
          value={renameDraft}
          disabled={renameSubmitting}
          placeholder={asset.title || asset.fileName || (isZh ? "未命名" : "Untitled")}
          onChange={onRenameDraftChange}
          onSubmit={onRenameSubmit}
          onCancel={onRenameCancel}
          className="w-[calc(100%-24px)]"
        />
      ) : (
        <span
          className={cn(
            "truncate text-[13px] leading-[38px] transition-colors duration-150",
            animState === "departing"
              ? "text-default-300"
              : "text-foreground/75",
          )}
        >
          {asset.rendererType === "worksheet_project" ||
          asset.originEntityType === "worksheet_project" ? (
            <WorksheetProjectTag />
          ) : (
            <FileTypeTag previewKind={asset.previewKind} />
          )}
          {asset.title || asset.fileName || (isZh ? "未命名" : "Untitled")}
        </span>
      )}
      <StatusDot status={asset.processingStatus} />
      <CategoryDot category={asset.category} />
    </motion.div>
  );
});
