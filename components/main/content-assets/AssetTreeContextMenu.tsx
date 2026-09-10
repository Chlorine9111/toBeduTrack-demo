"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FolderPlus, FolderClosed, Pencil, FolderInput, Trash2, ChevronRight, FilePlus, Upload } from "lucide-react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import type {
  ContentAssetSummary,
  ContentFolder,
} from "@/lib/content-assets/types";
import { getContentFolderLabel } from "./i18n";

type ContextMenuTarget =
  | { type: "folder"; folder: ContentFolder }
  | { type: "asset"; asset: ContentAssetSummary }
  | { type: "blank"; parentFolderId: string | null };

type AssetTreeContextMenuProps = {
  target: ContextMenuTarget | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onRename: (id: string, type: "folder" | "asset") => void;
  onCreateSubfolder: (parentId: string) => void;
  onCreateDocument: (folderId?: string | null) => void;
  onCreateFolder: (parentId?: string) => void;
  onUploadFiles: () => void;
  onDelete: (id: string, type: "folder" | "asset") => void;
  folders?: ContentFolder[];
  descendantIdsByFolderId?: Map<string, Set<string>>;
  onMoveTo?: (id: string, type: "folder" | "asset", targetFolderId: string | null) => void;
  batchSelection?: {
    folderIds: string[];
    assetIds: string[];
  } | null;
  batchSelectionCount?: number;
  hasSystemFolderSelected?: boolean;
  batchMoveFolders?: ContentFolder[];
  isBatchMoveTargetDisabled?: (targetFolderId: string | null) => boolean;
  onBatchMoveTo?: (targetFolderId: string | null) => void;
  onBatchDelete?: () => void;
};

export default function AssetTreeContextMenu({
  target,
  position,
  onClose,
  onRename,
  onCreateSubfolder,
  onCreateDocument,
  onCreateFolder,
  onUploadFiles,
  onDelete,
  folders,
  descendantIdsByFolderId,
  onMoveTo,
  batchSelection,
  batchSelectionCount = 0,
  hasSystemFolderSelected = false,
  batchMoveFolders,
  isBatchMoveTargetDisabled,
  onBatchMoveTo,
  onBatchDelete,
}: AssetTreeContextMenuProps) {
  const { isZh } = useAppI18n();
  const isOpen = target !== null && position !== null;
  const isBatchMode = Boolean(batchSelection && batchSelectionCount > 1);
  const isFolder = target?.type === "folder";
  const isAsset = target?.type === "asset";
  const isBlank = target?.type === "blank";
  const isSystem = isFolder ? target.folder.isSystem : false;
  const renameDisabled = isFolder && isSystem;
  const itemId = target?.type === "folder" ? target.folder.id : target?.type === "asset" ? target.asset.id : "";
  const contextParentFolderId = isBlank ? target.parentFolderId : isFolder ? target.folder.id : isAsset ? (target.asset.folderId ?? null) : null;
  const itemDescendants = isFolder && descendantIdsByFolderId ? descendantIdsByFolderId.get(itemId) : undefined;
  const movableFolders = (folders ?? []).filter((folder) =>
    folder.id !== itemId && !itemDescendants?.has(folder.id),
  );
  const canMove = Boolean(folders && onMoveTo && (isAsset || (isFolder && !isSystem)));
  const batchCanMove = Boolean(batchMoveFolders && onBatchMoveTo);
  const batchMoveTargets = batchMoveFolders ?? [];

  const [showSubmenu, setShowSubmenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleRename = useCallback(() => {
    if (!target || target.type === "blank") return;
    onRename(itemId, target.type);
    onClose();
  }, [target, itemId, onRename, onClose]);

  const handleCreateSubfolder = useCallback(() => {
    if (target?.type !== "folder") return;
    onCreateSubfolder(target.folder.id);
    onClose();
  }, [target, onCreateSubfolder, onClose]);

  const handleDelete = useCallback(() => {
    if (!target || target.type === "blank") return;
    onDelete(itemId, target.type);
    onClose();
  }, [target, itemId, onDelete, onClose]);

  const handleBatchDelete = useCallback(() => {
    onBatchDelete?.();
    onClose();
  }, [onBatchDelete, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setShowSubmenu(false);
      return;
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-lg border border-divider bg-white p-1 shadow-lg"
      style={{
        left: position?.x ?? 0,
        top: position?.y ?? 0,
      }}
      role="menu"
    >
      {isBlank ? (
        <>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-foreground outline-none cursor-pointer hover:bg-default-100 transition-colors"
            onMouseDown={() => onCreateDocument(contextParentFolderId)}
          >
            <FilePlus size={14} className="text-default-400" />
            {isZh ? "新建文档" : "New Document"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-foreground outline-none cursor-pointer hover:bg-default-100 transition-colors"
            onMouseDown={() => onCreateFolder(contextParentFolderId ?? undefined)}
          >
            <FolderPlus size={14} className="text-default-400" />
            {isZh ? "新建文件夹" : "New Folder"}
          </button>
          <div className="my-1 h-px bg-default-200" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-foreground outline-none cursor-pointer hover:bg-default-100 transition-colors"
            onMouseDown={onUploadFiles}
          >
            <Upload size={14} className="text-default-400" />
            {isZh ? "上传文件" : "Upload Files"}
          </button>
        </>
      ) : isBatchMode ? (
        <>
          {batchCanMove ? (
            <div
              className="relative"
              onMouseEnter={() => setShowSubmenu(true)}
              onMouseLeave={() => setShowSubmenu(false)}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-foreground outline-none cursor-pointer hover:bg-default-100 transition-colors disabled:cursor-not-allowed disabled:text-default-300"
                disabled={hasSystemFolderSelected}
              >
                <FolderInput size={14} className="text-default-400" />
                {isZh ? "移动所选到…" : "Move selected to..."}
                <ChevronRight size={12} className="ml-auto text-default-400" />
              </button>
              {showSubmenu ? (
                <div
                  className="absolute left-full top-0 z-50 min-w-[160px] max-h-[240px] overflow-y-auto rounded-lg border border-divider bg-white p-1 shadow-lg"
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-foreground outline-none cursor-pointer hover:bg-default-100 transition-colors disabled:cursor-not-allowed disabled:text-default-300"
                    disabled={isBatchMoveTargetDisabled?.(null) ?? false}
                    onMouseDown={() => onBatchMoveTo?.(null)}
                  >
                    <FolderClosed size={14} className="text-default-400" />
                    <span className="truncate font-medium">{isZh ? "全部" : "All"}</span>
                  </button>
                  {batchMoveTargets.length > 0 ? (
                    <>
                      <div className="my-1 h-px bg-default-200" />
                      {batchMoveTargets.map((folder) => (
                        <button
                          key={folder.id}
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-foreground outline-none cursor-pointer hover:bg-default-100 transition-colors disabled:cursor-not-allowed disabled:text-default-300"
                          disabled={isBatchMoveTargetDisabled?.(folder.id) ?? false}
                          onMouseDown={() => onBatchMoveTo?.(folder.id)}
                        >
                          <FolderClosed size={14} className="text-default-400" />
                          <span className="truncate">{getContentFolderLabel(folder, isZh)}</span>
                        </button>
                      ))}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-default-400 outline-none cursor-not-allowed"
              disabled
            >
              <FolderInput size={14} />
              {isZh ? "移动所选到…" : "Move selected to..."}
            </button>
          )}

          <div className="my-1 h-px bg-default-200" />

          <button
            type="button"
            role="menuitem"
            disabled={hasSystemFolderSelected}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] outline-none cursor-pointer hover:bg-default-100 transition-colors text-danger disabled:text-default-300 disabled:cursor-not-allowed"
            onMouseDown={hasSystemFolderSelected ? undefined : handleBatchDelete}
          >
            <Trash2 size={14} />
            {isZh ? "删除所选" : "Delete selected"}
          </button>
        </>
      ) : (
        <>
      {/* 重命名 */}
      <button
        type="button"
        role="menuitem"
        disabled={renameDisabled}
        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-foreground outline-none cursor-pointer hover:bg-default-100 transition-colors disabled:cursor-not-allowed disabled:text-default-300 disabled:hover:bg-transparent"
        onMouseDown={renameDisabled ? undefined : handleRename}
      >
        <Pencil size={14} className="text-default-400" />
        {isZh ? "重命名" : "Rename"}
      </button>

      {/* 新建文档 / 新建子文件夹 */}
      {isFolder ? (
        <>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-foreground outline-none cursor-pointer hover:bg-default-100 transition-colors"
            onMouseDown={() => onCreateDocument(contextParentFolderId)}
          >
            <FilePlus size={14} className="text-default-400" />
            {isZh ? "新建文档" : "New Document"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-foreground outline-none cursor-pointer hover:bg-default-100 transition-colors"
            onMouseDown={handleCreateSubfolder}
          >
            <FolderPlus size={14} className="text-default-400" />
            {isZh ? "新建子文件夹" : "New Subfolder"}
          </button>
        </>
      ) : null}

      {/* 移动到 */}
      {isAsset || (isFolder && !isSystem) ? (
        canMove ? (
          <div
            className="relative"
            onMouseEnter={() => setShowSubmenu(true)}
            onMouseLeave={() => setShowSubmenu(false)}
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-foreground outline-none cursor-pointer hover:bg-default-100 transition-colors"
            >
              <FolderInput size={14} className="text-default-400" />
              {isZh ? "移动到…" : "Move to..."}
              <ChevronRight size={12} className="ml-auto text-default-400" />
            </button>
            {showSubmenu ? (
              <div
                className="absolute left-full top-0 z-50 min-w-[160px] max-h-[240px] overflow-y-auto rounded-lg border border-divider bg-white p-1 shadow-lg"
                role="menu"
              >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-foreground outline-none cursor-pointer hover:bg-default-100 transition-colors"
                    onMouseDown={() => {
                      if (target && onMoveTo) {
                        onMoveTo(itemId, target.type, null);
                      }
                      onClose();
                    }}
                  >
                    <FolderClosed size={14} className="text-default-400" />
                    <span className="truncate font-medium">{isZh ? "全部" : "All"}</span>
                  </button>
                  {movableFolders.length > 0 ? (
                    <>
                      <div className="my-1 h-px bg-default-200" />
                      {movableFolders.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-foreground outline-none cursor-pointer hover:bg-default-100 transition-colors"
                          onMouseDown={() => {
                            if (target && onMoveTo) {
                              onMoveTo(itemId, target.type, f.id);
                            }
                            onClose();
                          }}
                        >
                          <FolderClosed size={14} className="text-default-400" />
                          <span className="truncate">{getContentFolderLabel(f, isZh)}</span>
                        </button>
                      ))}
                    </>
                  ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-default-400 outline-none cursor-not-allowed"
            disabled
          >
            <FolderInput size={14} />
            {isZh ? "移动到…" : "Move to..."}
          </button>
        )
      ) : null}

      <div className="my-1 h-px bg-default-200" />

      {/* 删除 */}
      <button
        type="button"
        role="menuitem"
        disabled={isSystem}
        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] outline-none cursor-pointer hover:bg-default-100 transition-colors text-danger disabled:text-default-300 disabled:cursor-not-allowed"
        onMouseDown={isSystem ? undefined : handleDelete}
      >
        <Trash2 size={14} />
        {isZh ? "删除" : "Delete"}
      </button>
        </>
      )}
    </div>
  );
}
