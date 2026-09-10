"use client";

import { FolderOpen } from "lucide-react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import type { ContentAsset } from "@/lib/content-assets/types";
import AssetFileRow from "./AssetFileRow";

type AssetListViewProps = {
  assets: ContentAsset[];
  onOpenViewer: (assetId: string) => void;
  onDelete: (assetId: string) => void;
};

export default function AssetListView({
  assets,
  onOpenViewer,
  onDelete,
}: AssetListViewProps) {
  const { isZh } = useAppI18n();

  if (assets.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
        <FolderOpen className="h-12 w-12 text-foreground/15" strokeWidth={1} />
        <p className="text-[14px] font-medium text-foreground/50">
          {isZh ? "此文件夹为空" : "This folder is empty"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* 表头 */}
      <div className="flex items-center h-9 px-5 bg-surface rounded-t-lg">
        <span className="flex-1 text-[12px] font-medium text-foreground/40">
          {isZh ? "标题" : "Title"}
        </span>
        <span className="w-24 shrink-0 text-[12px] font-medium text-foreground/40">
          {isZh ? "类型" : "Type"}
        </span>
        <span className="hidden w-24 shrink-0 text-[12px] font-medium text-foreground/40 md:block">
          {isZh ? "修改时间" : "Updated"}
        </span>
        <span className="w-16 shrink-0 text-[12px] font-medium text-foreground/40 text-right">
          {isZh ? "操作" : "Actions"}
        </span>
      </div>

      {/* 行 */}
      {assets.map((asset, index) => (
        <AssetFileRow
          key={asset.id}
          asset={asset}
          index={index}
          onOpenViewer={onOpenViewer}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
