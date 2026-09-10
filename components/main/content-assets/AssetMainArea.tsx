"use client";

import dynamic from "next/dynamic";
import { GitBranch, LayoutGrid, List, Search } from "lucide-react";
import { Button } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";
import type { ContentAsset } from "@/lib/content-assets/types";
import AssetGridView from "./AssetGridView";
import AssetListView from "./AssetListView";

const GraphView = dynamic(() => import("./GraphView"), { ssr: false });

type ViewMode = "grid" | "list" | "graph";

type AssetMainAreaProps = {
  assets: ContentAsset[];
  loading: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenViewer: (assetId: string) => void;
  onDeleteAsset: (assetId: string) => void;
};

export default function AssetMainArea({
  assets,
  loading,
  query,
  onQueryChange,
  viewMode,
  onViewModeChange,
  onOpenViewer,
  onDeleteAsset,
}: AssetMainAreaProps) {
  const { isZh } = useAppI18n();

  return (
    <div className="flex flex-1 flex-col min-w-0">
      {/* ── 工具栏 ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 h-14 shrink-0 border-b border-divider px-4">
        {/* 搜索框 */}
        <div className="relative flex-1 max-w-xs">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-default-400"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={isZh ? "搜索文件…" : "Search files..."}
            className={cn(
              "h-8 w-full rounded-lg pl-8 pr-3 text-[13px] text-foreground",
              "bg-default-100 border border-transparent outline-none transition-all",
              "placeholder:text-default-400",
              "focus:bg-white focus:border-default-300",
            )}
          />
        </div>

        {/* 视图切换 */}
        <div className="flex items-center rounded-md border border-foreground/8 overflow-hidden">
          <Button
            isIconOnly
            size="sm"
            className={cn(
              "h-8 w-8 min-w-0 rounded-none",
              viewMode === "grid"
                ? "bg-accent text-white"
                : "bg-white text-default-400 hover:bg-default-100",
            )}
            onPress={() => onViewModeChange("grid")}
            aria-label={isZh ? "网格视图" : "Grid view"}
          >
            <LayoutGrid size={14} />
          </Button>
          <Button
            isIconOnly
            size="sm"
            className={cn(
              "h-8 w-8 min-w-0 rounded-none",
              viewMode === "list"
                ? "bg-accent text-white"
                : "bg-white text-default-400 hover:bg-default-100",
            )}
            onPress={() => onViewModeChange("list")}
            aria-label={isZh ? "列表视图" : "List view"}
          >
            <List size={14} />
          </Button>
          <Button
            isIconOnly
            size="sm"
            className={cn(
              "h-8 w-8 min-w-0 rounded-none",
              viewMode === "graph"
                ? "bg-accent text-white"
                : "bg-white text-default-400 hover:bg-default-100",
            )}
            onPress={() => onViewModeChange("graph")}
            aria-label={isZh ? "图谱视图" : "Graph view"}
          >
            <GitBranch size={14} />
          </Button>
        </div>
      </div>

      {/* ── 内容区域 ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-default-300 border-t-foreground" />
          </div>
        ) : viewMode === "graph" ? (
          <GraphView onOpenViewer={onOpenViewer} />
        ) : viewMode === "grid" ? (
          <AssetGridView assets={assets} onOpenViewer={onOpenViewer} />
        ) : (
          <AssetListView
            assets={assets}
            onOpenViewer={onOpenViewer}
            onDelete={onDeleteAsset}
          />
        )}
      </div>
    </div>
  );
}
