"use client";

import { X } from "lucide-react";
import { Button } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import type { ContentAsset } from "@/lib/content-assets/types";

type AssetViewerHeaderProps = {
  asset: ContentAsset;
  onClose: () => void;
};

function formatDateTime(value: string, locale: "zh" | "en") {
  try {
    return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function AssetViewerHeader({
  asset,
  onClose,
}: AssetViewerHeaderProps) {
  const { isZh, locale } = useAppI18n();

  return (
    <div className="shrink-0 border-b border-divider bg-white px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-foreground/40">
            {isZh ? "内容详情" : "Content Details"}
          </p>
          <h2 className="mt-1 truncate text-base font-medium text-foreground">
            {asset.title || asset.fileName || (isZh ? "未命名" : "Untitled")}
          </h2>
        </div>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          onPress={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-default text-foreground-400 hover:bg-default-100 hover:text-foreground"
          aria-label={isZh ? "关闭面板" : "Close panel"}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {asset.summaryText ? (
          <p className="line-clamp-3 text-sm text-default-500">
            {asset.summaryText}
          </p>
        ) : null}

        {asset.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {asset.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-default-50 px-2.5 py-0.5 text-xs text-default-500"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {asset.courseLabel ? (
            <span className="rounded-full bg-default-50 px-2.5 py-0.5 text-xs text-default-400">
              {asset.courseLabel}
            </span>
          ) : null}
          {asset.unitLabel ? (
            <span className="rounded-full bg-default-50 px-2.5 py-0.5 text-xs text-default-400">
              {asset.unitLabel}
            </span>
          ) : null}
          <span className="text-xs text-default-400">
            {formatDateTime(asset.updatedAt, locale)}
          </span>
        </div>
      </div>
    </div>
  );
}
