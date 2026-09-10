"use client";

import { useCallback } from "react";
import { Eye, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/react/sortable";
import { Button, Chip } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { ContentAsset } from "@/lib/content-assets/types";
import { getFileTypeVisual } from "./file-type-utils";

type AssetFileRowProps = {
  asset: ContentAsset;
  index: number;
  onOpenViewer: (assetId: string) => void;
  onDelete: (assetId: string) => void;
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

export default function AssetFileRow({
  asset,
  index,
  onOpenViewer,
  onDelete,
}: AssetFileRowProps) {
  const { isZh } = useAppI18n();
  const isMobile = useIsMobile();
  const { ref, isDragging } = useSortable({
    id: asset.id,
    index,
    disabled: isMobile,
    data: { type: "asset", assetId: asset.id, folderId: asset.folderId },
  });

  const visual = getFileTypeVisual({
    mimeType: asset.mimeType,
    fileType: asset.fileType,
    assetSource: asset.assetSource,
    refEntityType: asset.refEntityType,
    isZh,
  });
  const Icon = visual.icon;

  const handleClick = useCallback(() => {
    onOpenViewer(asset.id);
  }, [asset.id, onOpenViewer]);

  const handleDelete = useCallback(
    () => {
      onDelete(asset.id);
    },
    [asset.id, onDelete],
  );

  return (
    <div
      ref={ref}
      className={cn(
        "group flex items-center h-12 px-5 cursor-pointer select-none transition-colors duration-150",
        "border-b border-foreground/6",
        "hover:bg-surface",
        isDragging && "opacity-40",
      )}
      onClick={handleClick}
    >
      {/* 图标 + 标题 */}
      <div className="flex flex-1 items-center gap-3 min-w-0">
        <Icon size={18} className={visual.textClass} />
        <span className="truncate text-[14px] text-foreground">
          {asset.title || asset.fileName || (isZh ? "未命名" : "Untitled")}
        </span>
      </div>

      {/* 类型标签 */}
      <div className="w-24 shrink-0">
        <Chip size="sm" variant="soft" color={visual.chipColor}>
          {visual.label}
        </Chip>
      </div>

      {/* 修改时间（移动端隐藏） */}
      <div className="hidden w-24 shrink-0 text-[12px] text-foreground/40 md:block">
        {formatTime(asset.updatedAt, isZh)}
      </div>

      {/* 操作（hover 显示） */}
      <div className="flex w-16 shrink-0 items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          className="h-7 w-7 min-w-0 rounded-md text-foreground/40 hover:bg-foreground/4 hover:text-foreground"
          onPress={handleClick}
          aria-label={isZh ? "查看" : "View"}
        >
          <Eye size={14} />
        </Button>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          className="h-7 w-7 min-w-0 rounded-md text-foreground/40 hover:bg-danger/10 hover:text-danger"
          onPress={handleDelete}
          aria-label={isZh ? "删除" : "Delete"}
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
}
