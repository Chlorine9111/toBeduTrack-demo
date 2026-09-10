"use client";

import { useCallback } from "react";
import { Chip } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";
import type { ContentAsset } from "@/lib/content-assets/types";
import { getFileTypeVisual } from "./file-type-utils";

type AssetFileCardProps = {
  asset: ContentAsset;
  onOpen: (assetId: string) => void;
};

function formatTime(dateStr: string, isZh: boolean): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) return isZh ? "今天" : "Today";
  if (days === 1) return isZh ? "昨天" : "Yesterday";
  if (days < 7) return isZh ? `${days} 天前` : `${days}d ago`;

  return d.toLocaleDateString(isZh ? "zh-CN" : "en-US", { month: "short", day: "numeric" });
}

export default function AssetFileCard({ asset, onOpen }: AssetFileCardProps) {
  const { isZh } = useAppI18n();
  const visual = getFileTypeVisual({
    mimeType: asset.mimeType,
    fileType: asset.fileType,
    assetSource: asset.assetSource,
    refEntityType: asset.refEntityType,
    isZh,
  });
  const Icon = visual.icon;

  const handleDoubleClick = useCallback(() => {
    onOpen(asset.id);
  }, [asset.id, onOpen]);

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-lg border border-foreground/8 bg-white",
        "cursor-pointer select-none overflow-hidden p-4 transition-all duration-150",
        "hover:shadow-sm hover:-translate-y-px",
      )}
      onDoubleClick={handleDoubleClick}
    >
      {/* 类型 Chip */}
      <Chip
        size="sm"
        variant="soft"
        color={visual.chipColor}
        className="w-fit"
      >
        <Icon className="mr-1 inline h-3 w-3" />
        {visual.label}
      </Chip>

      {/* 标题 */}
      <h4 className="mt-2.5 truncate text-[14px] font-medium text-foreground">
        {asset.title || asset.fileName || (isZh ? "未命名" : "Untitled")}
      </h4>

      {/* 摘要 */}
      {asset.summaryText && (
        <p className="mt-1 line-clamp-2 text-[13px] leading-[1.5] text-foreground/50">
          {asset.summaryText}
        </p>
      )}

      {/* 底部: 时间 */}
      <span className="mt-auto pt-3 text-[11px] text-foreground/30">
        {formatTime(asset.updatedAt, isZh)}
      </span>
    </div>
  );
}
