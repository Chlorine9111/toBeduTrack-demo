"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Button,
  ProgressBar,
  ScrollShadow,
  SearchField,
  Skeleton,
  Spinner,
} from "@heroui/react";
import {
  Upload,
  FileText,
  File,
  Image,
  Check,
  X,
  PanelRightClose,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentAsset } from "@/lib/content-assets/types";
import {
  getAssetStatuses,
  listAssets,
  uploadFile,
} from "@/lib/content-assets/client";
import type { AgentReferenceSelection } from "@/components/main/content-assets/AssetReferencePicker";

type UploadingFile = {
  id: string;
  name: string;
  status: "uploading" | "processing" | "ready" | "failed";
  progress: number;
  assetId?: string;
};

type AgentContextSidebarProps = {
  open: boolean;
  onClose: () => void;
  selectedReferences: AgentReferenceSelection[];
  onReferencesChange: (refs: AgentReferenceSelection[]) => void;
  onUploadStateChange?: (state: {
    pending: boolean;
    count: number;
    names: string[];
  }) => void;
  onAssetReady?: (info: { title: string; summary: string }) => void;
  isZh: boolean;
  autoOpenUploadToken?: number;
};

const MAX_SELECTION = 8;

type FileTypeInfo = {
  label: string;
  icon: React.ElementType;
  bgClass: string;
  textClass: string;
};

const FILE_TYPE_MAP: Record<string, FileTypeInfo> = {
  pdf: { label: "PDF", icon: FileText, bgClass: "bg-danger-50", textClass: "text-danger" },
  doc: { label: "DOC", icon: FileText, bgClass: "bg-accent/10", textClass: "text-accent" },
  text: { label: "TXT", icon: File, bgClass: "bg-surface-tertiary", textClass: "text-muted" },
  image: { label: "IMG", icon: Image, bgClass: "bg-warning-50", textClass: "text-warning" },
  other: { label: "FILE", icon: File, bgClass: "bg-surface-tertiary", textClass: "text-muted" },
};

function inferFileType(asset: ContentAsset): FileTypeInfo {
  const mime = asset.mimeType || asset.fileType || "";
  if (mime.includes("pdf")) return FILE_TYPE_MAP.pdf;
  if (mime.includes("doc") || mime.includes("word")) return FILE_TYPE_MAP.doc;
  if (mime.startsWith("image/")) return FILE_TYPE_MAP.image;
  if (mime.includes("text")) return FILE_TYPE_MAP.text;
  return FILE_TYPE_MAP.other;
}

export default function AgentContextSidebar({
  open,
  onClose,
  selectedReferences,
  onReferencesChange,
  onUploadStateChange,
  onAssetReady,
  isZh,
  autoOpenUploadToken = 0,
}: AgentContextSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastAutoOpenUploadTokenRef = useRef(0);
  const isMountedRef = useRef(true);
  const uploadingFilesRef = useRef<UploadingFile[]>([]);
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadErrorText, setUploadErrorText] = useState("");
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);

  const publishUploadState = useCallback((items: UploadingFile[]) => {
    const pendingFiles = items.filter(
      (file) => file.status === "uploading" || file.status === "processing",
    );
    onUploadStateChange?.({
      pending: pendingFiles.length > 0,
      count: pendingFiles.length,
      names: pendingFiles.map((file) => file.name),
    });
  }, [onUploadStateChange]);

  const commitUploadingFiles = useCallback((next: UploadingFile[]) => {
    uploadingFilesRef.current = next;
    if (isMountedRef.current) {
      setUploadingFiles(next);
    }
    publishUploadState(next);
  }, [publishUploadState]);

  const updateUploadingFiles = useCallback(
    (updater: (current: UploadingFile[]) => UploadingFile[]) => {
      const next = updater(uploadingFilesRef.current);
      commitUploadingFiles(next);
    },
    [commitUploadingFiles],
  );

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true);
    try {
      const result = await listAssets({ status: "ready", limit: 100 });
      setAssets(result.items);
    } catch {
      // ignore
    } finally {
      setAssetsLoading(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadAssets();
  }, [loadAssets, open]);

  useEffect(() => {
    if (!open || !autoOpenUploadToken) return;
    if (lastAutoOpenUploadTokenRef.current === autoOpenUploadToken) return;
    lastAutoOpenUploadTokenRef.current = autoOpenUploadToken;
    const timer = window.setTimeout(() => {
      fileInputRef.current?.click();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [autoOpenUploadToken, open]);

  const selectedIds = new Set(selectedReferences.map((r) => r.id));

  const toggleAsset = useCallback(
    (asset: ContentAsset) => {
      if (selectedIds.has(asset.id)) {
        onReferencesChange(selectedReferences.filter((r) => r.id !== asset.id));
      } else {
        if (selectedReferences.length >= MAX_SELECTION) return;
        onReferencesChange([
          ...selectedReferences,
          {
            id: asset.id,
            title: asset.title || asset.fileName || "未命名",
            fileType: asset.fileType,
            assetSource: asset.assetSource,
          },
        ]);
      }
    },
    [selectedIds, selectedReferences, onReferencesChange],
  );

  const appendSelectedReference = useCallback(
    (asset: {
      id: string;
      title: string;
      fileType: string | null;
      assetSource: ContentAsset["assetSource"];
    }) => {
      if (selectedIds.has(asset.id)) return;
      if (selectedReferences.length >= MAX_SELECTION) {
        setUploadErrorText(
          isZh
            ? `文件已上传，但当前最多只能引用 ${MAX_SELECTION} 项内容。`
            : `Upload completed, but only ${MAX_SELECTION} references can be attached.`,
        );
        return;
      }
      onReferencesChange([
        ...selectedReferences,
        {
          id: asset.id,
          title: asset.title,
          fileType: asset.fileType,
          assetSource: asset.assetSource,
        },
      ]);
    },
    [isZh, onReferencesChange, selectedIds, selectedReferences],
  );

  const waitForAssetReady = useCallback(async (assetId: string) => {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const items = await getAssetStatuses([assetId]);
      const item = items[0];
      if (
        item?.processingStatus === "ready" ||
        item?.processingStatus === "failed"
      ) {
        return item ?? null;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
    return null;
  }, []);

  const handleFilesUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploadErrorText("");

      for (const file of files) {
        const uploadId = crypto.randomUUID();
        updateUploadingFiles((prev) => [
          ...prev,
          { id: uploadId, name: file.name, status: "uploading", progress: 0 },
        ]);

        try {
          const asset = await uploadFile(file, {
            onProgress: (progress) => {
              updateUploadingFiles((prev) =>
                prev.map((item) =>
                  item.id === uploadId ? { ...item, progress } : item,
                ),
              );
            },
          });

          updateUploadingFiles((prev) =>
            prev.map((item) =>
              item.id === uploadId
                ? {
                    ...item,
                    assetId: asset.id,
                    progress: 100,
                    status: asset.processingStatus === "ready" ? "ready" : "processing",
                  }
                : item,
            ),
          );

          const settled =
            asset.processingStatus === "ready" || asset.processingStatus === "failed"
              ? asset
              : await waitForAssetReady(asset.id);

          if (settled?.processingStatus === "ready") {
            updateUploadingFiles((prev) =>
              prev.map((item) =>
                item.id === uploadId ? { ...item, status: "ready" } : item,
              ),
            );
            appendSelectedReference({
              id: settled.id,
              title: settled.title,
              fileType: settled.fileType,
              assetSource: settled.assetSource,
            });
            void loadAssets();
            onAssetReady?.({
              title: settled.title || file.name,
              summary: settled.summaryText || "",
            });
            updateUploadingFiles((prev) =>
              prev.filter((item) => item.id !== uploadId),
            );
          } else {
            updateUploadingFiles((prev) =>
              prev.map((item) =>
                item.id === uploadId ? { ...item, status: "failed" } : item,
              ),
            );
            setUploadErrorText(
              isZh ? `文件处理失败：${file.name}` : `Failed to process file: ${file.name}`,
            );
            updateUploadingFiles((prev) =>
              prev.filter((item) => item.id !== uploadId),
            );
          }
        } catch (error) {
          updateUploadingFiles((prev) =>
            prev.map((item) =>
              item.id === uploadId ? { ...item, status: "failed" } : item,
            ),
          );
          setUploadErrorText(
            error instanceof Error
              ? error.message
              : isZh ? `上传失败：${file.name}` : `Upload failed: ${file.name}`,
          );
          updateUploadingFiles((prev) =>
            prev.filter((item) => item.id !== uploadId),
          );
        }
      }
    },
    [appendSelectedReference, isZh, loadAssets, onAssetReady, updateUploadingFiles, waitForAssetReady],
  );

  const filteredAssets = searchQuery
    ? assets.filter(
        (a) =>
          (a.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          (a.fileName || "").toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : assets;

  const [dragOver, setDragOver] = useState(false);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        void handleFilesUpload(files);
      }
    },
    [handleFilesUpload],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          data-testid="agent-context-sidebar"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 340, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex h-full shrink-0 flex-col overflow-hidden border-l border-divider bg-surface"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4">
            <span className="text-sm font-semibold text-foreground">
              {isZh ? "上下文" : "Context"}
            </span>
            <Button
              isIconOnly
              variant="ghost"
              onPress={onClose}
              className="size-7 min-w-0"
            >
              <PanelRightClose className="size-4" />
            </Button>
          </div>

          {/* Upload zone — compact inline style */}
          <div className="px-4 pb-3">
            <div
              data-testid="agent-context-upload-panel"
              className={cn(
                "group flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3.5 transition-all duration-150",
                dragOver
                  ? "border-accent bg-accent/5"
                  : "border-divider hover:border-muted hover:bg-surface-secondary",
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") fileInputRef.current?.click(); }}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-muted transition-colors group-hover:bg-surface-tertiary">
                <Upload className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground">
                  {isZh ? "上传文件" : "Upload files"}
                </p>
                <p className="text-[11px] text-muted">
                  {isZh ? "拖入或点击浏览" : "Drag & drop or click to browse"}
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.pptx,.xlsx,.txt,.md,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                  void handleFilesUpload(Array.from(files));
                }
                e.target.value = "";
              }}
            />
          </div>

          {/* Upload progress */}
          {(uploadingFiles.length > 0 || uploadErrorText) && (
            <div className="px-4 pb-2 space-y-2.5">
              {uploadErrorText ? (
                <div className="rounded-xl border border-danger/20 bg-danger-50 px-3.5 py-2.5 text-[11px] text-danger">
                  {uploadErrorText}
                </div>
              ) : null}
              {uploadingFiles.map((file) => (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="rounded-xl border border-divider bg-surface p-3.5"
                >
                  <div className="flex items-center gap-3">
                    {/* File icon */}
                    <div className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      file.status === "ready" ? "bg-success-50"
                        : file.status === "failed" ? "bg-danger-50"
                        : "bg-accent/10",
                    )}>
                      {file.status === "ready" ? (
                        <Check className="size-4 text-success" />
                      ) : file.status === "failed" ? (
                        <X className="size-4 text-danger" />
                      ) : (
                        <FileText className="size-4 text-accent" />
                      )}
                    </div>
                    {/* Name + status */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">{file.name}</p>
                      <p className={cn(
                        "text-[11px]",
                        file.status === "ready" ? "text-success"
                          : file.status === "failed" ? "text-danger"
                          : "text-muted",
                      )}>
                        {file.status === "ready"
                          ? (isZh ? "上传成功" : "Upload complete")
                          : file.status === "failed"
                          ? (isZh ? "上传失败" : "Upload failed")
                          : file.status === "processing"
                          ? (isZh ? "处理中..." : "Processing...")
                          : (isZh ? "上传中..." : "Uploading...")}
                      </p>
                    </div>
                  </div>
                  {/* Progress bar */}
                  {(file.status === "uploading" || file.status === "processing") && (
                    <div className="mt-3">
                      {file.status === "processing" ? (
                        <ProgressBar isIndeterminate aria-label="Processing" size="sm" color="accent">
                          <ProgressBar.Track>
                            <ProgressBar.Fill />
                          </ProgressBar.Track>
                        </ProgressBar>
                      ) : (
                        <ProgressBar aria-label="Uploading" size="sm" color="accent" value={file.progress}>
                          <ProgressBar.Track>
                            <ProgressBar.Fill />
                          </ProgressBar.Track>
                        </ProgressBar>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}

          {/* Library section header */}
          <div className="flex items-center justify-between px-5 pb-2 pt-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
              {isZh ? "内容库" : "Library"}
            </span>
            {selectedReferences.length > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                {selectedReferences.length}
              </span>
            )}
          </div>

          {/* Search */}
          <div className="px-4 pb-3">
            <SearchField
              data-testid="agent-context-search-input"
              value={searchQuery}
              onChange={setSearchQuery}
              aria-label={isZh ? "搜索内容库" : "Search library"}
            >
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder={isZh ? "搜索文件..." : "Search files..."} />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          </div>

          {/* Asset list */}
          <ScrollShadow className="flex-1 overflow-y-auto px-4 pb-4">
            {assetsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner size="sm" />
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <p className="text-[12px] text-muted">
                  {isZh ? "暂无内容" : "No items"}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredAssets.map((asset) => {
                  const checked = selectedIds.has(asset.id);
                  const ft = inferFileType(asset);
                  const Icon = ft.icon;
                  const isProcessing = asset.processingStatus !== "ready" && asset.processingStatus !== "failed";
                  const title = asset.title || asset.fileName || "未命名";
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => toggleAsset(asset)}
                      className={cn(
                        "group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all duration-150",
                        checked
                          ? "border-accent/30 bg-accent/5 shadow-sm"
                          : "border-transparent bg-surface-secondary hover:border-divider hover:shadow-sm",
                      )}
                    >
                      {/* File type icon */}
                      <div className="relative shrink-0">
                        <div className={cn("flex size-10 items-center justify-center rounded-lg", ft.bgClass)}>
                          <Icon className={cn("size-5", ft.textClass)} />
                        </div>
                        {checked && (
                          <div className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-accent text-background">
                            <Check className="size-2.5" strokeWidth={3} />
                          </div>
                        )}
                      </div>
                      {/* Content */}
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className={cn(
                          "truncate text-[13px] leading-snug",
                          checked ? "font-medium text-foreground" : "text-foreground",
                        )}>
                          {title}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                          {ft.label}
                        </p>
                        {asset.summaryText ? (
                          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">
                            {asset.summaryText}
                          </p>
                        ) : isProcessing ? (
                          <div className="mt-2 space-y-1.5">
                            <Skeleton className="h-2 w-3/4 rounded-full" />
                            <Skeleton className="h-2 w-1/2 rounded-full" />
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollShadow>

          {/* Bottom attach button */}
          {selectedReferences.length > 0 && (
            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="shrink-0 border-t border-divider bg-surface px-4 py-3"
            >
              <Button
                data-testid="agent-context-attach-button"
                variant="primary"
                onPress={onClose}
                className="w-full"
              >
                {isZh
                  ? `贴入 ${selectedReferences.length} 项`
                  : `Attach ${selectedReferences.length} items`}
              </Button>
            </motion.div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
