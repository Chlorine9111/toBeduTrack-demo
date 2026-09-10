"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useState, useCallback, useEffect, useMemo, useRef, useDeferredValue } from "react";
import { PointerActivationConstraints } from "@dnd-kit/dom";
import { DragDropProvider, KeyboardSensor, PointerSensor } from "@dnd-kit/react";
import { motion, AnimatePresence } from "motion/react";
import { Menu, Sparkles } from "lucide-react";
import { Button } from "@heroui/react";
import {
  useContentAssetsBootstrap,
  useAssetUpload,
} from "@/hooks/use-content-assets";
import { ApiError } from "@/lib/api/client";
import { useAppI18n } from "@/lib/app-i18n/provider";
import * as assetClient from "@/lib/content-assets/client";
import { toContentAssetSummaryFromAsset } from "@/lib/content-assets/summary";
import { useContentChat } from "@/hooks/use-content-chat";
import { useOrganizeAnimation } from "@/hooks/use-organize-animation";
import type { OpenTab } from "./AssetTabBar";
import type {
  ContentAsset,
  ContentAssetSummary,
  ContentAssetsBootstrapData,
} from "@/lib/content-assets/types";

function AssetViewerLoading() {
  const { isZh } = useAppI18n();

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-white">
      <div className="flex items-center gap-2 text-sm text-default-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-default-300 border-t-foreground" />
        <span>{isZh ? "正在加载内容..." : "Loading content..."}</span>
      </div>
    </div>
  );
}

function AssetViewerEmptyState() {
  const { isZh } = useAppI18n();

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center border-t border-divider bg-white px-6 py-12 text-center">
      <div className="max-w-sm space-y-2">
        <p className="text-sm font-medium text-foreground">
          {isZh ? "选择一份内容开始查看" : "Choose content to start viewing"}
        </p>
        <p className="text-sm text-default-400">
          {isZh
            ? "左侧选择文件、文档或资料后，这里才会加载对应的预览器。"
            : "Select a file, document, or material on the left to load its viewer here."}
        </p>
      </div>
    </div>
  );
}

function AssetChatLauncher({ onOpen }: { onOpen: () => void }) {
  const { isZh } = useAppI18n();

  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed right-0 top-1/2 z-30 flex h-[68px] w-[28px] items-center justify-center rounded-l-[10px] border border-r-0 border-divider bg-white/90 text-default-300 backdrop-blur-sm transition-all duration-200 hover:w-[32px] hover:bg-white hover:text-foreground hover:shadow-sm"
      style={{ marginTop: -34 }}
      aria-label={isZh ? "打开整理助手" : "Open organizer assistant"}
      title={isZh ? "打开整理助手" : "Open organizer assistant"}
    >
      <Sparkles size={13} />
    </button>
  );
}

function AssetTreePanelLoading({
  mobile = false,
}: {
  mobile?: boolean;
}) {
  return (
    <div
      className={
        mobile
          ? "flex h-full flex-col border-r border-divider bg-white"
          : "flex h-full min-h-0 w-[280px] flex-col border-r border-divider bg-white"
      }
    >
      <div className="border-b border-divider px-4 py-4">
        <div className="h-10 rounded-xl bg-default-100" />
      </div>
      <div className="space-y-3 px-4 py-4">
        <div className="h-10 rounded-xl bg-default-50" />
        <div className="h-10 rounded-xl bg-default-50" />
        <div className="h-10 rounded-xl bg-default-50" />
        <div className="h-10 rounded-xl bg-default-50" />
      </div>
    </div>
  );
}

const ModuleTour = dynamic(
  () => import("@/components/product-tour").then((mod) => mod.ModuleTour),
  { loading: () => null },
);

const AssetTreePanel = dynamic(() => import("./AssetTreePanel"), {
  loading: () => <AssetTreePanelLoading />,
});

const AssetChatSidebar = dynamic(() => import("./AssetChatSidebar"), {
  ssr: false,
  loading: () => null,
});

const AssetContentViewer = dynamic(() => import("./AssetContentViewer"), {
  loading: () => <AssetViewerLoading />,
});

const AssetUploadProgress = dynamic(() => import("./AssetUploadProgress"), {
  loading: () => null,
});

const AssetTabBar = dynamic(() => import("./AssetTabBar"), {
  loading: () => <div className="shrink-0 border-b border-divider bg-white" />,
});

type ContentAssetsPageProps = {
  initialData?: ContentAssetsBootstrapData | null;
  initialSelectedAssetId?: string | null;
  initialSearchQuery?: string | null;
};

export default function ContentAssetsPage({
  initialData = null,
  initialSelectedAssetId = null,
  initialSearchQuery = null,
}: ContentAssetsPageProps) {
  const { isZh } = useAppI18n();
  const pathname = usePathname();
  const untitledLabel = isZh ? "未命名" : "Untitled";
  const isMountedRef = useRef(true);
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(
    undefined,
  );
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>(
    initialSelectedAssetId ?? undefined,
  );
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery ?? "");
  const [searchResults, setSearchResults] = useState<ContentAssetSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchErrorText, setSearchErrorText] = useState("");
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const pendingCreatedSelectionIdsRef = useRef<Set<string>>(new Set());

  const {
    folders,
    assets,
    loading,
    refresh,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    upsertAssets,
    patchAsset,
    removeAsset,
  } = useContentAssetsBootstrap(initialData);

  const { uploadFiles, uploads } = useAssetUpload({
    onAssetUploaded: upsertAssets,
    onStatusBatch: upsertAssets,
  });

  const {
    messages: chatMessages,
    isStreaming: chatStreaming,
    progresses,
    operationEvents,
    doneEvents,
    pendingPlan,
    canUndo,
    sendMessage: chatSendMessage,
    confirmPlan: chatConfirmPlan,
    cancelPlan: chatCancelPlan,
    abort: chatAbort,
    undo: chatUndo,
  } = useContentChat();

  const {
    displayAssets,
    displayFolders,
    assetAnimStates,
    folderReceiving,
    autoExpandFolderIds,
  } = useOrganizeAnimation(assets, folders, operationEvents, doneEvents, chatStreaming);

  const assetMap = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );
  const toSummaryWithReferenceMeta = useCallback(
    (asset: ContentAsset) => {
      const next = toContentAssetSummaryFromAsset(asset);
      const previous = assetMap.get(asset.id);
      if (!previous || asset.assetSource !== "reference") {
        return next;
      }
      return {
        ...next,
        note: previous.note,
        rendererType: previous.rendererType,
        originEntityType: previous.originEntityType,
        originEntityId: previous.originEntityId,
        sourceConversationId: previous.sourceConversationId,
        sourceConversationTitle: previous.sourceConversationTitle,
        contentLibraryItemId: next.contentLibraryItemId ?? previous.contentLibraryItemId,
      };
    },
    [assetMap],
  );
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());

  const descendantIdsByFolderId = useMemo(() => {
    const childrenByParentId = new Map<string | null, string[]>();

    for (const folder of folders) {
      const bucket = childrenByParentId.get(folder.parentId) ?? [];
      bucket.push(folder.id);
      childrenByParentId.set(folder.parentId, bucket);
    }

    const descendants = new Map<string, Set<string>>();
    const walk = (folderId: string) => {
      if (descendants.has(folderId)) {
        return descendants.get(folderId)!;
      }

      const next = new Set<string>();
      for (const childId of childrenByParentId.get(folderId) ?? []) {
        next.add(childId);
        for (const nestedId of walk(childId)) {
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
  }, [folders]);
  const folderDepthById = useMemo(() => {
    const depthMap = new Map<string, number>();

    const walk = (folderId: string): number => {
      if (depthMap.has(folderId)) {
        return depthMap.get(folderId)!;
      }

      const folder = folders.find((entry) => entry.id === folderId);
      const depth = folder?.parentId ? walk(folder.parentId) + 1 : 0;
      depthMap.set(folderId, depth);
      return depth;
    };

    for (const folder of folders) {
      walk(folder.id);
    }

    return depthMap;
  }, [folders]);

  const sensors = useMemo(
    () => [
      PointerSensor.configure({
        activationConstraints(event) {
          if (event.pointerType === "mouse") {
            return [new PointerActivationConstraints.Distance({ value: 3 })];
          }

          if (event.pointerType === "touch") {
            return [
              new PointerActivationConstraints.Delay({
                value: 180,
                tolerance: 6,
              }),
            ];
          }

          return [
            new PointerActivationConstraints.Distance({ value: 3 }),
            new PointerActivationConstraints.Delay({
              value: 180,
              tolerance: 6,
            }),
          ];
        },
      }),
      KeyboardSensor,
    ],
    [],
  );

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setSearchQuery(initialSearchQuery ?? "");
  }, [initialSearchQuery]);

  const activeAssetId = activeTabId ?? selectedAssetId ?? null;
  const activeAsset = activeAssetId ? assetMap.get(activeAssetId) ?? null : null;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const normalizedQuery = searchQuery.trim();

    if (normalizedQuery) {
      params.set("q", normalizedQuery);
    } else {
      params.delete("q");
    }

    if (activeAssetId) {
      params.set("assetId", activeAssetId);
      params.delete("itemId");
      params.delete("originEntityId");
      params.delete("type");
    } else {
      params.delete("assetId");
    }

    const nextQueryString = params.toString();
    const nextUrl = nextQueryString ? `${pathname}?${nextQueryString}` : pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [activeAssetId, pathname, searchQuery]);

  useEffect(() => {
    const nextQuery = deferredSearchQuery.trim();
    if (!nextQuery) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchErrorText("");
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    setSearchErrorText("");
    setSearchResults([]);

    void assetClient
      .searchAssetSummaries(nextQuery, { limit: 120 })
      .then((result) => {
        if (cancelled || !isMountedRef.current) return;
        setSearchResults(result.items);
        setSearchErrorText("");
      })
      .catch((error) => {
        if (cancelled || !isMountedRef.current) return;
        console.error("搜索内容失败", error);
        setSearchResults([]);
        setSearchErrorText(
          error instanceof Error
            ? error.message
            : isZh
              ? "搜索内容失败"
              : "Failed to search content",
        );
      })
      .finally(() => {
        if (cancelled || !isMountedRef.current) return;
        setSearchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deferredSearchQuery, isZh]);

  const pollAssetStatuses = useCallback(async (
    ids: string[],
    options?: { attempts?: number; intervalMs?: number },
  ) => {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return;

    const maxAttempts = Math.max(1, options?.attempts ?? 6);
    const intervalMs = Math.max(400, options?.intervalMs ?? 1500);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const nextItems = await assetClient.getAssetStatuses(uniqueIds);
        if (!isMountedRef.current) return;
        if (nextItems.length > 0) {
          upsertAssets(nextItems);
        }

        const settledIds = new Set(
          nextItems
            .filter((item) =>
              item.processingStatus === "ready" ||
              item.processingStatus === "failed",
            )
            .map((item) => item.id),
        );

        const allSettled = uniqueIds.every((id) => settledIds.has(id));
        if (allSettled) {
          return;
        }
      } catch (error) {
        console.error("轮询内容状态失败", error);
        return;
      }

      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => {
          globalThis.setTimeout(resolve, intervalMs);
        });
      }
    }
  }, [upsertAssets]);

  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (chatStreaming) {
      wasStreamingRef.current = true;
      return;
    }

    if (wasStreamingRef.current) {
      wasStreamingRef.current = false;
      const pendingIds = assets
        .filter((asset) =>
          asset.processingStatus !== "ready" &&
          asset.processingStatus !== "failed",
        )
        .map((asset) => asset.id);
      if (pendingIds.length > 0) {
        void pollAssetStatuses(pendingIds, { attempts: 8, intervalMs: 1500 });
      }
    }
  }, [assets, chatStreaming, pollAssetStatuses]);

  useEffect(() => {
    for (const assetId of pendingCreatedSelectionIdsRef.current) {
      const asset = assetMap.get(assetId);
      if (!asset) continue;

      pendingCreatedSelectionIdsRef.current.delete(assetId);
      setSelectedAssetId(assetId);
      setActiveTabId(assetId);
      setOpenTabs((prev) => {
        if (prev.some((tab) => tab.assetId === assetId)) {
          return prev;
        }

        return [
          ...prev,
          {
            assetId,
            title: asset.title || asset.fileName || untitledLabel,
            fileType: asset.fileType ?? null,
          },
        ];
      });
    }
  }, [assetMap, untitledLabel]);

  useEffect(() => {
    if (chatStreaming) setChatOpen(true);
  }, [chatStreaming]);

  const shouldRenderChatSidebar =
    chatOpen ||
    chatStreaming ||
    pendingPlan != null ||
    canUndo ||
    chatMessages.length > 0 ||
    progresses.length > 0;
  const syncedInitialAssetIdRef = useRef<string | null>(null);

  const handleOpenViewer = useCallback(
    (assetId: string) => {
      setOpenTabs((prev) => {
        if (prev.some((tab) => tab.assetId === assetId)) return prev;
        const asset = assetMap.get(assetId);
        return [
          ...prev,
          {
            assetId,
            title: asset?.title || asset?.fileName || untitledLabel,
            fileType: asset?.fileType ?? null,
          },
        ];
      });
      setActiveTabId(assetId);
      setSelectedAssetId(assetId);
    },
    [assetMap, untitledLabel],
  );

  useEffect(() => {
    if (!initialSelectedAssetId) return;
    if (syncedInitialAssetIdRef.current === initialSelectedAssetId) return;
    const asset = assetMap.get(initialSelectedAssetId);
    if (!asset) return;

    syncedInitialAssetIdRef.current = initialSelectedAssetId;
    setSelectedAssetId(initialSelectedAssetId);
    setActiveTabId(initialSelectedAssetId);
    setOpenTabs((prev) => {
      if (prev.some((tab) => tab.assetId === initialSelectedAssetId)) {
        return prev;
      }
      return [
        ...prev,
        {
          assetId: initialSelectedAssetId,
          title: asset.title || asset.fileName || untitledLabel,
          fileType: asset.fileType ?? null,
        },
      ];
    });
  }, [assetMap, initialSelectedAssetId, untitledLabel]);

  useEffect(() => {
    setOpenTabs((prev) =>
      prev.map((tab) => {
        const asset = assetMap.get(tab.assetId);
        if (!asset) return tab;

        const nextTitle = asset.title || asset.fileName || untitledLabel;
        const nextFileType = asset.fileType ?? null;
        if (tab.title === nextTitle && tab.fileType === nextFileType) {
          return tab;
        }

        return {
          ...tab,
          title: nextTitle,
          fileType: nextFileType,
        };
      }),
    );
  }, [assetMap, untitledLabel]);

  const handleCloseTab = useCallback(
    (assetId: string) => {
      setOpenTabs((prev) => {
        const next = prev.filter((tab) => tab.assetId !== assetId);
        if (activeTabId === assetId) {
          const idx = prev.findIndex((tab) => tab.assetId === assetId);
          const neighbor = next[Math.min(idx, next.length - 1)];
          const nextId = neighbor?.assetId ?? null;
          setActiveTabId(nextId);
          setSelectedAssetId(nextId ?? undefined);
        }
        return next;
      });
    },
    [activeTabId],
  );

  const handleActivateTab = useCallback((assetId: string) => {
    setActiveTabId(assetId);
    setSelectedAssetId(assetId);
  }, []);

  const pruneUnavailableAsset = useCallback((assetId: string) => {
    pendingCreatedSelectionIdsRef.current.delete(assetId);
    removeAsset(assetId);
    setSearchResults((prev) => prev.filter((asset) => asset.id !== assetId));
    setOpenTabs((prev) => prev.filter((tab) => tab.assetId !== assetId));
    if (selectedAssetId === assetId) {
      setSelectedAssetId(undefined);
    }
    if (activeTabId === assetId) {
      setActiveTabId(null);
    }
    void refresh({ force: true }).catch((error) => {
      console.error("刷新内容库失败", error);
    });
  }, [activeTabId, refresh, removeAsset, selectedAssetId]);

  const handleDeleteAsset = useCallback(
    async (assetId: string) => {
      const previousAsset = assetMap.get(assetId) ?? null;
      const previousSearchResult =
        searchResults.find((asset) => asset.id === assetId) ?? null;
      const previousTab =
        openTabs.find((tab) => tab.assetId === assetId) ??
        (previousAsset
          ? {
              assetId,
              title: previousAsset.title || previousAsset.fileName || untitledLabel,
              fileType: previousAsset.fileType ?? null,
            }
          : null);
      const restoreSelected = selectedAssetId === assetId;
      const restoreActive = activeTabId === assetId;

      try {
        removeAsset(assetId);
        setSearchResults((prev) => prev.filter((asset) => asset.id !== assetId));
        setOpenTabs((prev) => {
          const next = prev.filter((tab) => tab.assetId !== assetId);
          if (activeTabId === assetId) {
            const idx = prev.findIndex((tab) => tab.assetId === assetId);
            const neighbor = next[Math.min(idx, next.length - 1)];
            const nextId = neighbor?.assetId ?? null;
            setActiveTabId(nextId);
            setSelectedAssetId(nextId ?? undefined);
          }
          return next;
        });
        await assetClient.deleteAsset(assetId);
        pruneUnavailableAsset(assetId);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          pruneUnavailableAsset(assetId);
          return;
        }
        if (previousAsset) {
          upsertAssets(previousAsset);
        }
        if (previousSearchResult) {
          setSearchResults((prev) =>
            prev.some((asset) => asset.id === previousSearchResult.id)
              ? prev
              : [previousSearchResult, ...prev],
          );
        }
        if (previousTab) {
          setOpenTabs((prev) =>
            prev.some((tab) => tab.assetId === previousTab.assetId)
              ? prev
              : [...prev, previousTab],
          );
        }
        if (restoreSelected) {
          setSelectedAssetId(assetId);
        }
        if (restoreActive) {
          setActiveTabId(assetId);
        }
        console.error("删除内容失败", error);
      }
    },
    [
      activeTabId,
      assetMap,
      openTabs,
      pruneUnavailableAsset,
      removeAsset,
      searchResults,
      selectedAssetId,
      untitledLabel,
      upsertAssets,
    ],
  );

  const handleMoveAsset = useCallback(
    async (assetId: string, targetFolderId: string | null) => {
      const previousFolderId = assetMap.get(assetId)?.folderId ?? null;
      patchAsset(assetId, { folderId: targetFolderId });
      try {
        const asset = await assetClient.updateAsset(assetId, { folderId: targetFolderId });
        upsertAssets(toSummaryWithReferenceMeta(asset));
      } catch (error) {
        patchAsset(assetId, { folderId: previousFolderId });
        console.error("移动内容失败", error);
        throw error;
      }
    },
    [assetMap, patchAsset, toSummaryWithReferenceMeta, upsertAssets],
  );

  const handleCategorizeAsset = useCallback(
    (assetId: string, category: string) => {
      const previousCategory = assetMap.get(assetId)?.category;
      patchAsset(assetId, {
        category: category as ContentAssetSummary["category"],
      });
      assetClient
        .updateAsset(assetId, { category })
        .then((asset) => upsertAssets(toSummaryWithReferenceMeta(asset)))
        .catch((error) => {
          if (previousCategory) {
            patchAsset(assetId, { category: previousCategory });
        }
        console.error("更新分类失败", error);
      });
    },
    [assetMap, patchAsset, toSummaryWithReferenceMeta, upsertAssets],
  );

  const handleRetry = useCallback(async (assetId: string) => {
    const previousAsset = assetMap.get(assetId) ?? null;
    patchAsset(assetId, {
      processingStatus: "parsing",
      processingError: null,
    });

    try {
      await assetClient.reprocessAsset(assetId);
      void pollAssetStatuses([assetId], { attempts: 12, intervalMs: 1500 });
    } catch (error) {
      if (previousAsset) {
        upsertAssets(previousAsset);
      }
      console.error("重试解析内容失败", error);
    }
  }, [assetMap, patchAsset, pollAssetStatuses, upsertAssets]);

  const handleRenameAsset = useCallback(
    async (assetId: string, name: string) => {
      const previousAsset = assetMap.get(assetId) ?? null;
      patchAsset(assetId, { title: name });
      setOpenTabs((prev) =>
        prev.map((tab) =>
          tab.assetId === assetId
            ? {
                ...tab,
                title: name,
              }
            : tab,
        ),
      );

      try {
        const asset = await assetClient.updateAsset(assetId, { title: name });
        upsertAssets(toSummaryWithReferenceMeta(asset));
      } catch (error) {
        console.error("重命名内容失败", error);
        if (previousAsset) {
          upsertAssets(previousAsset);
        }
        setOpenTabs((prev) =>
          prev.map((tab) =>
            tab.assetId === assetId
              ? {
                  ...tab,
                  title:
                    previousAsset?.title ||
                    previousAsset?.fileName ||
                    untitledLabel,
                }
              : tab,
          ),
        );
      }
    },
    [assetMap, patchAsset, toSummaryWithReferenceMeta, untitledLabel, upsertAssets],
  );

  const handleMoveFolder = useCallback(
    async (folderId: string, targetFolderId: string | null) => {
      try {
        await moveFolder(folderId, targetFolderId);
      } catch (error) {
        console.error("移动文件夹失败", error);
        throw error;
      }
    },
    [moveFolder],
  );

  const resolveTopLevelFolderIds = useCallback((folderIds: string[]) => {
    const uniqueFolderIds = Array.from(new Set(folderIds));
    return uniqueFolderIds.filter((folderId) =>
      !uniqueFolderIds.some(
        (candidateId) =>
          candidateId !== folderId &&
          descendantIdsByFolderId.get(candidateId)?.has(folderId),
      ),
    );
  }, [descendantIdsByFolderId]);

  const resolveFolderDeletePlan = useCallback((folderIds: string[]) => {
    const topLevelFolderIds = resolveTopLevelFolderIds(folderIds);
    const folderIdsToDelete = new Set<string>();

    for (const folderId of topLevelFolderIds) {
      folderIdsToDelete.add(folderId);
      for (const descendantId of descendantIdsByFolderId.get(folderId) ?? []) {
        folderIdsToDelete.add(descendantId);
      }
    }

    const orderedFolderIds = Array.from(folderIdsToDelete).sort(
      (left, right) =>
        (folderDepthById.get(right) ?? 0) - (folderDepthById.get(left) ?? 0),
    );
    const assetIdsToDelete = assets
      .filter((asset) => asset.folderId && folderIdsToDelete.has(asset.folderId))
      .map((asset) => asset.id);

    return {
      topLevelFolderIds,
      orderedFolderIds,
      folderIdsToDelete,
      assetIdsToDelete,
    };
  }, [assets, descendantIdsByFolderId, folderDepthById, resolveTopLevelFolderIds]);

  const handleDeleteFolderTree = useCallback(async (folderId: string) => {
    const plan = resolveFolderDeletePlan([folderId]);
    const assetIds = Array.from(new Set(plan.assetIdsToDelete));

    if (
      selectedFolderId &&
      (plan.folderIdsToDelete.has(selectedFolderId) || selectedFolderId === folderId)
    ) {
      setSelectedFolderId(undefined);
    }

    for (const assetId of assetIds) {
      await handleDeleteAsset(assetId);
    }

    for (const targetFolderId of plan.orderedFolderIds) {
      await deleteFolder(targetFolderId);
    }
  }, [deleteFolder, handleDeleteAsset, resolveFolderDeletePlan, selectedFolderId]);

  const handleBatchDeleteSelection = useCallback(async (
    selection: { folderIds: string[]; assetIds: string[] },
  ) => {
    const folderPlan = resolveFolderDeletePlan(selection.folderIds);
    const assetIds = new Set(selection.assetIds);
    for (const assetId of folderPlan.assetIdsToDelete) {
      assetIds.add(assetId);
    }

    if (
      selectedFolderId &&
      folderPlan.folderIdsToDelete.has(selectedFolderId)
    ) {
      setSelectedFolderId(undefined);
    }

    for (const assetId of assetIds) {
      await handleDeleteAsset(assetId);
    }

    for (const folderId of folderPlan.orderedFolderIds) {
      await deleteFolder(folderId);
    }
  }, [deleteFolder, handleDeleteAsset, resolveFolderDeletePlan, selectedFolderId]);

  const handleBatchMoveSelection = useCallback(async (
    selection: { folderIds: string[]; assetIds: string[] },
    targetFolderId: string | null,
  ) => {
    const topLevelFolderIds = resolveTopLevelFolderIds(selection.folderIds);
    const movedFolderIds = new Set<string>();
    for (const folderId of topLevelFolderIds) {
      movedFolderIds.add(folderId);
      for (const descendantId of descendantIdsByFolderId.get(folderId) ?? []) {
        movedFolderIds.add(descendantId);
      }
    }

    const assetIds = selection.assetIds.filter((assetId) => {
      const sourceFolderId = assetMap.get(assetId)?.folderId ?? null;
      return !(sourceFolderId && movedFolderIds.has(sourceFolderId));
    });

    for (const folderId of topLevelFolderIds) {
      await handleMoveFolder(folderId, targetFolderId);
    }

    await Promise.all(assetIds.map((assetId) => handleMoveAsset(assetId, targetFolderId)));
  }, [
    assetMap,
    descendantIdsByFolderId,
    handleMoveAsset,
    handleMoveFolder,
    resolveTopLevelFolderIds,
  ]);

  const handleCreateDocument = useCallback(async (folderId?: string | null) => {
    const result = await assetClient.createManualDocument({
      folderId: folderId !== undefined ? folderId : (selectedFolderId ?? null),
    });
    const createdAsset = result.asset;
    pendingCreatedSelectionIdsRef.current.add(createdAsset.id);
    try {
      const { primeAssetDetailCache } = await import("./AssetContentViewer");
      primeAssetDetailCache(result.detail);
    } catch {
      // ChunkLoadError in dev mode — cache will be populated on viewer mount
    }
    upsertAssets(createdAsset);
    setOpenTabs((prev) => {
      if (prev.some((tab) => tab.assetId === createdAsset.id)) {
        return prev;
      }
      return [
        ...prev,
        {
          assetId: createdAsset.id,
          title: createdAsset.title || createdAsset.fileName || untitledLabel,
          fileType: createdAsset.fileType ?? null,
        },
      ];
    });
    setActiveTabId(createdAsset.id);
    setSelectedAssetId(createdAsset.id);
    void refresh({ force: true }).catch((error) => {
      console.error("刷新内容库失败", error);
    });
    return createdAsset;
  }, [refresh, selectedFolderId, untitledLabel, upsertAssets]);

  useEffect(() => {
    if (activeAssetId && !assetMap.has(activeAssetId)) {
      if (pendingCreatedSelectionIdsRef.current.has(activeAssetId)) {
        return;
      }
      setActiveTabId(null);
      setSelectedAssetId(undefined);
    }
  }, [activeAssetId, assetMap]);

  const handleDragEnd = useCallback(
    (
      event: Parameters<
        NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragEnd"]>
      >[0],
    ) => {
      if (event.canceled) return;

      const { source, target } = event.operation;
      if (!source || !target) return;

      const sourceData = source.data as
        | { type?: string; assetId?: string; folderId?: string }
        | undefined;
      const targetData = target.data as
        | { type?: string; folderId?: string; category?: string }
        | undefined;

      if (sourceData?.type === "asset" && sourceData.assetId) {
        if (targetData?.type === "category" && targetData.category) {
          handleCategorizeAsset(sourceData.assetId, targetData.category);
          return;
        }

        if (targetData?.type === "folder" && targetData.folderId) {
          void handleMoveAsset(sourceData.assetId, targetData.folderId).catch((error) => {
            console.error("拖拽移动内容失败", error);
          });
        }
        return;
      }

      if (
        sourceData?.type === "folder-move" &&
        sourceData.folderId &&
        targetData?.type === "folder" &&
        targetData.folderId &&
        targetData.folderId !== sourceData.folderId
      ) {
        if (descendantIdsByFolderId.get(sourceData.folderId)?.has(targetData.folderId)) {
          return;
        }
        void handleMoveFolder(sourceData.folderId, targetData.folderId).catch((error) => {
          console.error("拖拽移动文件夹失败", error);
        });
      }
    },
    [
      descendantIdsByFolderId,
      handleCategorizeAsset,
      handleMoveAsset,
      handleMoveFolder,
    ],
  );

  return (
    <div className="flex h-full flex-1 bg-white">
      <ModuleTour moduleId="contentAssets" />
      <DragDropProvider sensors={sensors} onDragEnd={handleDragEnd}>
        <motion.div
          className="hidden md:block"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
        >
          <AssetTreePanel
            folders={displayFolders}
            assets={displayAssets}
            foldersLoading={loading}
            selectedFolderId={selectedFolderId}
            selectedAssetId={selectedAssetId}
            assetAnimStates={assetAnimStates}
            folderReceiving={folderReceiving}
            autoExpandFolderIds={autoExpandFolderIds}
            onSelectFolder={setSelectedFolderId}
            onSelectAsset={handleOpenViewer}
            onCreateDocument={handleCreateDocument}
            onCreateFolder={createFolder}
            onRenameFolder={renameFolder}
            onRenameAsset={handleRenameAsset}
            onDeleteFolder={handleDeleteFolderTree}
            onDeleteAsset={handleDeleteAsset}
            onMoveFolder={handleMoveFolder}
            onMoveAsset={handleMoveAsset}
            onBatchMoveSelection={handleBatchMoveSelection}
            onBatchDeleteSelection={handleBatchDeleteSelection}
            onCategorize={handleCategorizeAsset}
            onFiles={(files) => uploadFiles(files, selectedFolderId)}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            searchResults={searchResults}
            searchLoading={searchLoading}
            searchErrorText={searchErrorText}
          />
        </motion.div>

        <AnimatePresence>
          {mobileTreeOpen && (
            <>
              <motion.div
                key="tree-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/30 md:hidden"
                onClick={() => setMobileTreeOpen(false)}
              />
              <motion.div
                key="tree-drawer"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="fixed inset-y-0 left-0 z-50 w-[280px] md:hidden"
              >
                <AssetTreePanel
                  folders={displayFolders}
                  assets={displayAssets}
                  foldersLoading={loading}
                  selectedFolderId={selectedFolderId}
                  selectedAssetId={selectedAssetId}
                  assetAnimStates={assetAnimStates}
                  folderReceiving={folderReceiving}
                  autoExpandFolderIds={autoExpandFolderIds}
                  onSelectFolder={(id) => {
                    setSelectedFolderId(id);
                    setMobileTreeOpen(false);
                  }}
                  onSelectAsset={(id) => {
                    handleOpenViewer(id);
                    setMobileTreeOpen(false);
                  }}
                  onCreateDocument={async () => {
                    const asset = await handleCreateDocument();
                    setMobileTreeOpen(false);
                    return asset;
                  }}
                  onCreateFolder={createFolder}
                  onRenameFolder={renameFolder}
                  onRenameAsset={handleRenameAsset}
                  onDeleteFolder={handleDeleteFolderTree}
                  onDeleteAsset={handleDeleteAsset}
                  onMoveFolder={handleMoveFolder}
                  onMoveAsset={handleMoveAsset}
                  onBatchMoveSelection={handleBatchMoveSelection}
                  onBatchDeleteSelection={handleBatchDeleteSelection}
                  onCategorize={handleCategorizeAsset}
                  onFiles={(files) => uploadFiles(files, selectedFolderId)}
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                  searchResults={searchResults}
                  searchLoading={searchLoading}
                  searchErrorText={searchErrorText}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </DragDropProvider>

      <motion.div
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
      >
        <div className="flex items-center gap-2 px-4 py-2 md:hidden">
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            className="h-8 w-8 min-w-0 rounded-md text-foreground-400 hover:bg-default-200 hover:text-foreground"
            onPress={() => setMobileTreeOpen(true)}
            aria-label={isZh ? "打开文件夹面板" : "Open folders panel"}
          >
            <Menu size={18} />
          </Button>
          <span className="text-[13px] font-medium text-default-400">
            {isZh ? "文件夹" : "Folders"}
          </span>
        </div>

        {openTabs.length > 0 ? (
          <AssetTabBar
            tabs={openTabs}
            activeTabId={activeTabId}
            onActivate={handleActivateTab}
            onClose={handleCloseTab}
            onReorder={setOpenTabs}
          />
        ) : (
          <div className="shrink-0 border-b border-divider bg-white" />
        )}

        {activeAsset ? (
          <AssetContentViewer
            asset={activeAsset}
            onAssetUnavailable={pruneUnavailableAsset}
          />
        ) : (
          <AssetViewerEmptyState />
        )}

        {uploads.length > 0 ? (
          <div className="shrink-0 border-t border-divider bg-white px-4 py-3">
            <AssetUploadProgress uploads={uploads} onRetry={handleRetry} />
          </div>
        ) : null}
      </motion.div>

      {shouldRenderChatSidebar ? (
        <AssetChatSidebar
          open={chatOpen}
          onOpenChange={setChatOpen}
          messages={chatMessages}
          isStreaming={chatStreaming}
          progresses={progresses}
          canUndo={canUndo}
          hasPendingPlan={pendingPlan != null}
          onSend={chatSendMessage}
          onConfirmPlan={chatConfirmPlan}
          onCancelPlan={chatCancelPlan}
          onAbort={chatAbort}
          onUndo={chatUndo}
        />
      ) : (
        <AssetChatLauncher onOpen={() => setChatOpen(true)} />
      )}
    </div>
  );
}
