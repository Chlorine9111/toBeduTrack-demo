"use client";

import { Check, AlertCircle } from "lucide-react";
import { ProgressBar } from "@heroui/react";
import type { UploadItem } from "@/hooks/use-content-assets";
import { useAppI18n } from "@/lib/app-i18n/provider";
import type { ProcessingStatus } from "@/lib/content-assets/types";
import { getFileTypeVisual } from "./file-type-utils";
import AssetProcessingStatus from "./AssetProcessingStatus";

type Props = {
  item: UploadItem;
  onRetry?: () => void;
};

function ItemIcon({ item, isZh }: { item: UploadItem; isZh: boolean }) {
  if (item.status === "ready") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
        <Check className="h-4 w-4 text-accent" />
      </div>
    );
  }

  if (item.status === "failed") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger/10">
        <AlertCircle className="h-4 w-4 text-danger" />
      </div>
    );
  }

  const visual = getFileTypeVisual({
    mimeType: item.asset?.mimeType,
    fileType: item.asset?.fileType,
    assetSource: item.asset?.assetSource,
    isZh,
  });
  const Icon = visual.icon;

  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${visual.bgClass}`}>
      <Icon className={`h-4 w-4 ${visual.textClass}`} />
    </div>
  );
}

export default function AssetUploadItem({ item, onRetry }: Props) {
  const { isZh } = useAppI18n();
  const isUploading = item.status === "uploading";
  const isProcessing = item.status === "processing";

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <ItemIcon item={item} isZh={isZh} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-medium text-foreground">
            {item.fileName}
          </span>
          {isUploading && (
            <span className="shrink-0 text-[11px] tabular-nums text-foreground/40">
              {item.progress}%
            </span>
          )}
        </div>

        {isUploading && (
          <ProgressBar
            aria-label={isZh ? "上传进度" : "Upload progress"}
            value={item.progress}
            size="sm"
            color="accent"
            className="mt-1.5"
          >
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
        )}

        {isProcessing && (
          <ProgressBar
            isIndeterminate
            aria-label={isZh ? "处理中" : "Processing"}
            size="sm"
            color="accent"
            className="mt-1.5"
          >
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
        )}

        {!isUploading && !isProcessing && (
          <AssetProcessingStatus
            status={(item.processingStatus ?? item.status) as ProcessingStatus}
            onRetry={onRetry}
          />
        )}
      </div>
    </div>
  );
}
