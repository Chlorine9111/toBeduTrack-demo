"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useDeferredValue,
  useMemo,
} from "react";
import type {
  ContentAsset,
  ContentAssetSummary,
  ContentAssetsBootstrapData,
  ContentFolder,
} from "@/lib/content-assets/types";
import * as assetClient from "@/lib/content-assets/client";

type UseAssetUploadOptions = {
  onAssetUploaded?: (asset: ContentAssetSummary) => void;
  onStatusBatch?: (items: ContentAssetSummary[]) => void;
  onComplete?: () => void;
};

const BOOTSTRAP_CACHE_TTL_MS = 10_000;
const MAX_PARALLEL_UPLOADS = 2;

let bootstrapCache: {
  expiresAt: number;
  data: ContentAssetsBootstrapData;
} | null = null;
let bootstrapInflight: Promise<ContentAssetsBootstrapData> | null = null;

function sortFolders(folders: ContentFolder[]) {
  return [...folders].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function sortAssetSummaries(assets: ContentAssetSummary[]) {
  return [...assets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function normalizeBootstrapData(data: ContentAssetsBootstrapData): ContentAssetsBootstrapData {
  return {
    folders: sortFolders(data.folders),
    assets: sortAssetSummaries(data.assets),
  };
}

function mergeAssetSummaries(
  current: ContentAssetSummary[],
  incoming: ContentAssetSummary[],
) {
  const next = new Map(current.map((asset) => [asset.id, asset]));
  for (const asset of incoming) {
    next.set(asset.id, asset);
  }
  return sortAssetSummaries(Array.from(next.values()));
}

function writeBootstrapCache(data: ContentAssetsBootstrapData) {
  const normalized = normalizeBootstrapData(data);
  bootstrapCache = {
    expiresAt: Date.now() + BOOTSTRAP_CACHE_TTL_MS,
    data: normalized,
  };
}

async function readBootstrap(force = false) {
  if (!force && bootstrapCache && bootstrapCache.expiresAt > Date.now()) {
    return bootstrapCache.data;
  }

  if (!force && bootstrapInflight) {
    return bootstrapInflight;
  }

  bootstrapInflight = assetClient
    .fetchContentAssetsBootstrap()
    .then((data) => {
      writeBootstrapCache(data);
      return normalizeBootstrapData(data);
    })
    .finally(() => {
      bootstrapInflight = null;
    });

  return bootstrapInflight;
}

function updateBootstrapCacheWith(nextData: ContentAssetsBootstrapData) {
  writeBootstrapCache(nextData);
}

// ── useContentFolders ────────────────────────────────────────

export function useContentFolders() {
  const [folders, setFolders] = useState<ContentFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await assetClient.listFolders();
      setFolders(data);
    } catch (error) {
      console.error("Failed to load folders:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createFolder = useCallback(
    async (name: string, parentId?: string) => {
      const folder = await assetClient.createFolder({ name, parentId });
      setFolders((prev) => [...prev, folder]);
      return folder;
    },
    [],
  );

  const renameFolder = useCallback(async (id: string, name: string) => {
    const updated = await assetClient.updateFolder(id, { name });
    setFolders((prev) => prev.map((f) => (f.id === id ? updated : f)));
    return updated;
  }, []);

  const moveFolder = useCallback(
    async (id: string, parentId: string | null) => {
      const updated = await assetClient.updateFolder(id, { parentId });
      setFolders((prev) => prev.map((f) => (f.id === id ? updated : f)));
      return updated;
    },
    [],
  );

  const deleteFolder = useCallback(async (id: string) => {
    await assetClient.deleteFolder(id);
    setFolders((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return { folders, loading, createFolder, renameFolder, moveFolder, deleteFolder, refresh };
}

// ── useContentAssets ─────────────────────────────────────────

export function useContentAssets(folderId?: string) {
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [viewMode, setViewMode] = useState<"grid" | "list" | "graph">("list");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await assetClient.listAssets({
        folderId,
        query: deferredQuery || undefined,
      });
      setAssets(result.items);
      setTotal(result.total);
    } catch (error) {
      console.error("Failed to load assets:", error);
    } finally {
      setLoading(false);
    }
  }, [folderId, deferredQuery]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    assets,
    total,
    loading,
    query,
    setQuery,
    viewMode,
    setViewMode,
    refresh,
  };
}

// ── useContentAssetsBootstrap ───────────────────────────────

export function useContentAssetsBootstrap(initialData?: ContentAssetsBootstrapData | null) {
  const normalizedInitialData = useMemo(
    () => (initialData ? normalizeBootstrapData(initialData) : null),
    [initialData],
  );
  const [folders, setFolders] = useState<ContentFolder[]>(
    normalizedInitialData?.folders ?? [],
  );
  const [assets, setAssets] = useState<ContentAssetSummary[]>(
    normalizedInitialData?.assets ?? [],
  );
  const [loading, setLoading] = useState(!normalizedInitialData);
  const dataRef = useRef<ContentAssetsBootstrapData>(
    normalizedInitialData ?? { folders: [], assets: [] },
  );

  const commit = useCallback((nextData: ContentAssetsBootstrapData) => {
    const normalized = normalizeBootstrapData(nextData);
    dataRef.current = normalized;
    setFolders(normalized.folders);
    setAssets(normalized.assets);
    updateBootstrapCacheWith(normalized);
  }, []);

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true);
    try {
      const data = await readBootstrap(Boolean(options?.force));
      commit(data);
    } catch (error) {
      console.error("Failed to bootstrap content assets:", error);
    } finally {
      setLoading(false);
    }
  }, [commit]);

  useEffect(() => {
    if (normalizedInitialData) {
      commit(normalizedInitialData);
      setLoading(false);
      return;
    }

    void refresh();
  }, [commit, normalizedInitialData, refresh]);

  const createFolder = useCallback(
    async (name: string, parentId?: string) => {
      const now = new Date().toISOString();
      const optimisticId = `optimistic-folder-${crypto.randomUUID()}`;
      const optimisticFolder: ContentFolder = {
        id: optimisticId,
        teacherId: dataRef.current.folders[0]?.teacherId ?? "pending",
        parentId: parentId ?? null,
        name,
        slug: "pending",
        sortOrder: 0,
        isSystem: false,
        metadata: { optimistic: true },
        createdAt: now,
        updatedAt: now,
      };

      commit({
        ...dataRef.current,
        folders: [...dataRef.current.folders, optimisticFolder],
      });

      try {
        const folder = await assetClient.createFolder({ name, parentId });
        commit({
          ...dataRef.current,
          folders: dataRef.current.folders.map((currentFolder) =>
            currentFolder.id === optimisticId ? folder : currentFolder,
          ),
        });
        return folder;
      } catch (error) {
        commit({
          ...dataRef.current,
          folders: dataRef.current.folders.filter((folder) => folder.id !== optimisticId),
        });
        throw error;
      }
    },
    [commit],
  );

  const renameFolder = useCallback(async (id: string, name: string) => {
    const updated = await assetClient.updateFolder(id, { name });
    commit({
      ...dataRef.current,
      folders: dataRef.current.folders.map((folder) =>
        folder.id === id ? updated : folder,
      ),
    });
    return updated;
  }, [commit]);

  const moveFolder = useCallback(async (id: string, parentId: string | null) => {
    const updated = await assetClient.updateFolder(id, { parentId });
    commit({
      ...dataRef.current,
      folders: dataRef.current.folders.map((folder) =>
        folder.id === id ? updated : folder,
      ),
    });
    return updated;
  }, [commit]);

  const deleteFolder = useCallback(async (id: string) => {
    await assetClient.deleteFolder(id);
    commit({
      folders: dataRef.current.folders.filter((folder) => folder.id !== id),
      assets: dataRef.current.assets.map((asset) =>
        asset.folderId === id ? { ...asset, folderId: null } : asset,
      ),
    });
  }, [commit]);

  const upsertAssets = useCallback((incoming: ContentAssetSummary | ContentAssetSummary[]) => {
    const nextAssets = mergeAssetSummaries(
      dataRef.current.assets,
      Array.isArray(incoming) ? incoming : [incoming],
    );
    commit({
      ...dataRef.current,
      assets: nextAssets,
    });
  }, [commit]);

  const patchAsset = useCallback((
    assetId: string,
    patch: Partial<ContentAssetSummary>,
  ) => {
    commit({
      ...dataRef.current,
      assets: dataRef.current.assets.map((asset) =>
        asset.id === assetId ? { ...asset, ...patch } : asset,
      ),
    });
  }, [commit]);

  const removeAsset = useCallback((assetId: string) => {
    commit({
      ...dataRef.current,
      assets: dataRef.current.assets.filter((asset) => asset.id !== assetId),
    });
  }, [commit]);

  return {
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
  };
}

// ── useAssetUpload ───────────────────────────────────────────

export type UploadItem = {
  id: string;
  fileName: string;
  progress: number;
  status: "uploading" | "processing" | "ready" | "failed";
  processingStatus?: string;
  asset?: ContentAssetSummary;
};

const POLL_INTERVAL = 3000;

function toUploadStatus(
  processingStatus: ContentAssetSummary["processingStatus"],
): UploadItem["status"] {
  if (processingStatus === "ready") return "ready";
  if (processingStatus === "failed") return "failed";
  return "processing";
}

export function useAssetUpload(options?: UseAssetUploadOptions) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingIdsRef = useRef<Set<string>>(new Set());
  const pollingRef = useRef(false);
  const hadActiveUploadsRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollStatuses = useCallback(async () => {
    const ids = Array.from(processingIdsRef.current);
    if (ids.length === 0 || pollingRef.current) {
      if (ids.length === 0) stopPolling();
      return;
    }

    pollingRef.current = true;
    try {
      const items = await assetClient.getAssetStatuses(ids);
      if (items.length > 0) {
        options?.onStatusBatch?.(items);
      }

      const nextActiveIds = new Set(processingIdsRef.current);
      for (const item of items) {
        if (
          item.processingStatus === "ready" ||
          item.processingStatus === "failed"
        ) {
          nextActiveIds.delete(item.id);
        }
      }
      processingIdsRef.current = nextActiveIds;

      setUploads((prev) =>
        prev.map((upload) => {
          const assetId = upload.asset?.id;
          if (!assetId) return upload;
          const next = items.find((item) => item.id === assetId);
          if (!next) return upload;

          const done =
            next.processingStatus === "ready" ||
            next.processingStatus === "failed";

          return {
            ...upload,
            asset: next,
            status: done ? toUploadStatus(next.processingStatus) : "processing",
            processingStatus: next.processingStatus,
            progress: done ? 100 : upload.progress,
          };
        }),
      );

      if (processingIdsRef.current.size === 0) {
        stopPolling();
      }
    } catch {
      // polling 失败静默忽略，下轮继续
    } finally {
      pollingRef.current = false;
    }
  }, [options, stopPolling]);

  const ensurePolling = useCallback(() => {
    if (pollTimerRef.current || processingIdsRef.current.size === 0) {
      return;
    }
    pollTimerRef.current = setInterval(() => {
      void pollStatuses();
    }, POLL_INTERVAL);
  }, [pollStatuses]);

  useEffect(() => {
    return () => {
      stopPolling();
      processingIdsRef.current.clear();
    };
  }, [stopPolling]);

  useEffect(() => {
    const hasActive = uploads.some(
      (item) => item.status === "uploading" || item.status === "processing",
    );
    if (hadActiveUploadsRef.current && !hasActive) {
      options?.onComplete?.();
    }
    hadActiveUploadsRef.current = hasActive;
  }, [uploads, options]);

  const uploadSingle = useCallback(async (
    file: File,
    item: UploadItem,
    folderId?: string,
  ) => {
    try {
      const asset = await assetClient.uploadFile(file, {
        folderId,
        onProgress: (percent) => {
          setUploads((prev) =>
            prev.map((upload) =>
              upload.id === item.id ? { ...upload, progress: percent } : upload,
            ),
          );
        },
      });

      options?.onAssetUploaded?.(asset);

      const done =
        asset.processingStatus === "ready" ||
        asset.processingStatus === "failed";

      setUploads((prev) =>
        prev.map((upload) =>
          upload.id === item.id
            ? {
                ...upload,
                asset,
                progress: 100,
                status: done ? toUploadStatus(asset.processingStatus) : "processing",
                processingStatus: asset.processingStatus,
              }
            : upload,
        ),
      );

      if (done) {
        options?.onStatusBatch?.([asset]);
        return;
      }

      processingIdsRef.current.add(asset.id);
      ensurePolling();
      void pollStatuses();
    } catch {
      setUploads((prev) =>
        prev.map((upload) =>
          upload.id === item.id
            ? { ...upload, status: "failed", progress: 0 }
            : upload,
        ),
      );
    }
  }, [ensurePolling, options, pollStatuses]);

  const uploadFiles = useCallback(
    async (files: File[], folderId?: string) => {
      const newItems: UploadItem[] = files.map((file) => ({
        id: crypto.randomUUID(),
        fileName: file.name,
        progress: 0,
        status: "uploading",
      }));

      setUploads((prev) => [...prev, ...newItems]);

      let cursor = 0;
      const workers = Array.from(
        { length: Math.min(MAX_PARALLEL_UPLOADS, files.length) },
        async () => {
          while (cursor < files.length) {
            const currentIndex = cursor;
            cursor += 1;
            await uploadSingle(files[currentIndex], newItems[currentIndex], folderId);
          }
        },
      );

      await Promise.all(workers);
    },
    [uploadSingle],
  );

  const isUploading = uploads.some(
    (item) => item.status === "uploading" || item.status === "processing",
  );

  return { uploadFiles, uploads, isUploading };
}
