"use client";

import { useState, useEffect, useRef } from "react";
import type {
  ContentAssetSummary,
  ContentFolder,
} from "@/lib/content-assets/types";
import type { OperationEvent, DoneEvent } from "@/hooks/use-content-chat";

// ── 动画状态 ──────────────────────────────────────────────────

export type AssetAnimState = "idle" | "highlighting" | "departing" | "arriving";

// ── 从 detail 中解析 move 信息 ──────────────────────────────

function parseMoveDetail(detail: string) {
  const match = detail.match(/^move:([^:]+):(.+?)\u2192(.+)$/);
  if (!match) return null;
  return { assetId: match[1].trim(), destinationFolder: match[3].trim() };
}

// ── Hook ────────────────────────────────────────────────────

export function useOrganizeAnimation(
  serverAssets: ContentAssetSummary[],
  serverFolders: ContentFolder[],
  operationEvents: OperationEvent[],
  doneEvents: DoneEvent[],
  isStreaming: boolean,
): {
  /** 用于渲染文件树的资产列表（实时更新） */
  displayAssets: ContentAssetSummary[];
  /** 用于渲染文件树的文件夹列表（实时更新） */
  displayFolders: ContentFolder[];
  /** 每个文件的动画状态 */
  assetAnimStates: Map<string, AssetAnimState>;
  /** 正在接收文件的文件夹名称 */
  folderReceiving: Set<string>;
  /** 需要自动展开的文件夹 ID */
  autoExpandFolderIds: Set<string>;
} {
  // 乐观更新的本地文件列表
  const [optimisticAssets, setOptimisticAssets] = useState<ContentAssetSummary[]>([]);
  const [optimisticFolders, setOptimisticFolders] = useState<ContentFolder[]>([]);
  const [assetAnimStates, setAssetAnimStates] = useState<Map<string, AssetAnimState>>(new Map());
  const [folderReceiving, setFolderReceiving] = useState<Set<string>>(new Set());
  const [autoExpandFolderIds, setAutoExpandFolderIds] = useState<Set<string>>(new Set());

  const processedOps = useRef(0);
  const processedDones = useRef(0);
  const isActive = useRef(false);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  function schedule(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }

  // ── 流开始：初始化乐观状态 ───────────────────────────────
  useEffect(() => {
    if (isStreaming) {
      setOptimisticAssets(serverAssets);
      setOptimisticFolders(serverFolders);
      setAssetAnimStates(new Map());
      setFolderReceiving(new Set());
      setAutoExpandFolderIds(new Set());
      processedOps.current = 0;
      processedDones.current = 0;
      isActive.current = true;
    }
  }, [isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 流结束：同步回服务器数据 ─────────────────────────────
  useEffect(() => {
    if (!isStreaming && isActive.current) {
      isActive.current = false;
      // 延迟一点再清除动画状态，让 arriving 动画播完
      schedule(() => {
        setAssetAnimStates(new Map());
        setFolderReceiving(new Set());
      }, 800);
    }
  }, [isStreaming]);

  // 服务器数据更新时（refetch），同步到乐观状态
  useEffect(() => {
    if (!isActive.current) {
      setOptimisticAssets(serverAssets);
    }
  }, [serverAssets]);

  useEffect(() => {
    if (!isActive.current) {
      setOptimisticFolders(serverFolders);
    }
  }, [serverFolders]);

  // ── 处理 executing 事件 → 高亮 ──────────────────────────
  useEffect(() => {
    if (!isStreaming) return;

    const newOps = operationEvents.slice(processedOps.current);
    if (newOps.length === 0) return;
    processedOps.current = operationEvents.length;

    for (const event of newOps) {
      const info = parseMoveDetail(event.detail);
      if (!info) continue;

      // 设置 highlighting
      setAssetAnimStates((prev) => {
        const m = new Map(prev);
        m.set(info.assetId, "highlighting");
        return m;
      });
    }
  }, [operationEvents, isStreaming]);

  // ── 处理 done 事件 → 实时移动文件 ────────────────────────
  useEffect(() => {
    if (!isStreaming) return;

    const newDones = doneEvents.slice(processedDones.current);
    if (newDones.length === 0) return;
    processedDones.current = doneEvents.length;

    for (const done of newDones) {
      if (done.kind === "folder-created" && done.folderName) {
        // 在乐观文件夹列表中添加新文件夹（如果还没有）
        setOptimisticFolders((prev) => {
          if (prev.some((f) => f.name === done.folderName)) return prev;
          const newFolder: ContentFolder = {
            id: `optimistic-${done.folderName}`,
            teacherId: "",
            name: done.folderName!,
            slug: done.folderName!.toLowerCase().replace(/\s+/g, "-"),
            parentId: null,
            sortOrder: prev.length,
            isSystem: false,
            metadata: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          return [...prev, newFolder];
        });
      }

      if (done.kind === "move-done" && done.assetId && done.newFolderId) {
        const assetId = done.assetId;
        const newFolderId = done.newFolderId;
        const folderName = done.folderName;

        // 修复乐观文件夹 ID：把 optimistic-xxx 替换为后端返回的真实 ID
        if (folderName) {
          setOptimisticFolders((prev) => {
            // 如果真实 ID 已经存在，不用改
            if (prev.some((f) => f.id === newFolderId)) return prev;
            // 找到同名的乐观文件夹，更新其 ID
            const idx = prev.findIndex(
              (f) => f.name === folderName && f.id.startsWith("optimistic-"),
            );
            if (idx >= 0) {
              return prev.map((f, i) =>
                i === idx ? { ...f, id: newFolderId } : f,
              );
            }
            // 文件夹既不是乐观的也不存在 → 补创建
            return [...prev, {
              id: newFolderId,
              teacherId: "",
              name: folderName,
              slug: folderName.toLowerCase().replace(/\s+/g, "-"),
              parentId: null,
              sortOrder: prev.length,
              isSystem: false,
              metadata: {},
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }];
          });
        }

        // Step 1: 设置 departing（文件淡出）
        setAssetAnimStates((prev) => {
          const m = new Map(prev);
          m.set(assetId, "departing");
          return m;
        });

        // Step 2: 300ms 后实际移动文件 + arriving
        schedule(() => {
          // 更新乐观资产列表 — 文件移到新文件夹
          setOptimisticAssets((prev) =>
            prev.map((a) =>
              a.id === assetId
                ? { ...a, folderId: newFolderId }
                : a,
            ),
          );

          // 自动展开目标文件夹
          setAutoExpandFolderIds((prev) => new Set([...prev, newFolderId]));

          // 文件夹接收效果
          if (done.folderName) {
            setFolderReceiving((prev) => new Set([...prev, done.folderName!]));
            schedule(() => {
              setFolderReceiving((prev) => {
                const s = new Set(prev);
                s.delete(done.folderName!);
                return s;
              });
            }, 600);
          }

          // 设置 arriving（文件在新位置弹入）
          setAssetAnimStates((prev) => {
            const m = new Map(prev);
            m.set(assetId, "arriving");
            return m;
          });

          // 600ms 后清除动画状态
          schedule(() => {
            setAssetAnimStates((prev) => {
              const m = new Map(prev);
              m.delete(assetId);
              return m;
            });
          }, 600);
        }, 300);
      }
    }
  }, [doneEvents, isStreaming]);

  // ── 清理 ─────────────────────────────────────────────────
  useEffect(() => {
    const t = timers.current;
    return () => {
      t.forEach((timer) => clearTimeout(timer));
      t.clear();
    };
  }, []);

  return {
    displayAssets: isActive.current ? optimisticAssets : serverAssets,
    displayFolders: isActive.current ? optimisticFolders : serverFolders,
    assetAnimStates,
    folderReceiving,
    autoExpandFolderIds,
  };
}
