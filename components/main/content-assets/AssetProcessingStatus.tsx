"use client";

import { Check, X, RotateCw } from "lucide-react";
import { Button } from "@heroui/react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import type { ProcessingStatus } from "@/lib/content-assets/types";

const STEPS: ProcessingStatus[] = ["pending", "parsing", "chunking", "embedding", "ready"];

function getStepLabel(status: ProcessingStatus, isZh: boolean) {
  const labels: Record<ProcessingStatus, string> = {
    pending: isZh ? "等待处理" : "Queued",
    parsing: isZh ? "解析中" : "Parsing",
    chunking: isZh ? "分段中" : "Chunking",
    embedding: isZh ? "向量化" : "Embedding",
    summarizing: isZh ? "总结中" : "Summarizing",
    ready: isZh ? "完成" : "Ready",
    failed: isZh ? "失败" : "Failed",
  };

  return labels[status] ?? status;
}

type Props = {
  status: ProcessingStatus;
  onRetry?: () => void;
};

export default function AssetProcessingStatus({ status, onRetry }: Props) {
  const { isZh } = useAppI18n();

  if (status === "failed") {
    return (
      <Button
        variant="ghost"
        size="sm"
        onPress={onRetry}
        className="mt-1 flex items-center gap-1.5 text-xs text-danger hover:underline"
      >
        <X className="h-3 w-3" />
        <span>{isZh ? "处理失败，点击重试" : "Processing failed. Retry"}</span>
        <RotateCw className="h-3 w-3" />
      </Button>
    );
  }

  if (status === "ready") {
    return (
      <div className="mt-1 flex items-center gap-1.5">
        {STEPS.map((step) => (
          <div key={step} className="flex items-center gap-1">
            <div className="flex h-3 w-3 items-center justify-center rounded-full bg-[#0F7B6C]">
              <Check className="h-2 w-2 text-white" strokeWidth={3} />
            </div>
            {step !== "ready" && (
              <div className="h-px w-2 bg-[#0F7B6C]" />
            )}
          </div>
        ))}
      </div>
    );
  }

  const currentIdx = STEPS.indexOf(status as typeof STEPS[number]);

  return (
    <div className="mt-1 space-y-1">
      <div className="flex items-center gap-1.5">
        {STEPS.map((step, idx) => {
          const isDone = idx < currentIdx;
          const isCurrent = idx === currentIdx;

          return (
            <div key={step} className="flex items-center gap-1">
              {isDone ? (
                <div className="flex h-3 w-3 items-center justify-center rounded-full bg-[#0F7B6C]">
                  <Check className="h-2 w-2 text-white" strokeWidth={3} />
                </div>
              ) : (
                <div
                  className={`h-3 w-3 rounded-full border ${
                    isCurrent
                      ? "animate-pulse border-primary bg-primary"
                      : "border-foreground/16 bg-transparent"
                  }`}
                />
              )}
              {step !== "ready" && (
                <div
                  className={`h-px w-2 ${isDone ? "bg-[#0F7B6C]" : "bg-foreground/16"}`}
                />
              )}
            </div>
          );
        })}
      </div>
      {currentIdx >= 0 && (
        <p className="text-xs text-foreground/45">
          {getStepLabel(status, isZh)}
        </p>
      )}
    </div>
  );
}
