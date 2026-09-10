"use client";

import { FileText, X } from "lucide-react";
import { Button } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";

type AssetReferenceItem = {
  id: string;
  title: string;
  fileType?: string | null;
};

type AssetReferenceTagProps = {
  assets: AssetReferenceItem[];
  onRemove: (id: string) => void;
  maxVisible?: number;
};

export default function AssetReferenceTag({
  assets,
  onRemove,
  maxVisible = 3,
}: AssetReferenceTagProps) {
  const { isZh } = useAppI18n();

  if (assets.length === 0) return null;

  const visible = assets.slice(0, maxVisible);
  const overflow = assets.length - maxVisible;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((asset) => (
        <div
          key={asset.id}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700"
        >
          <FileText className="h-3.5 w-3.5 text-amber-500" />
          <span className="max-w-[120px] truncate">{asset.title}</span>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            onPress={() => onRemove(asset.id)}
            className="h-auto min-w-0 rounded-full p-0.5 hover:bg-amber-100"
            aria-label={`${isZh ? "移除引用文件" : "Remove reference"} ${asset.title}`}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      {overflow > 0 ? (
        <span className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-600">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
