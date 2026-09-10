"use client";

import { useCallback, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileUp,
  Loader2,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UploadJob, UploadJobStatus } from "./useUploadQueue";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  jobs: UploadJob[];
  isProcessing: boolean;
  hasJobs: boolean;
  onAddFiles: (files: File[]) => void;
  onRemoveJob: (id: string) => void;
  onClearDone: () => void;
  onViewResults: (fileName: string) => void;
  children: React.ReactNode;
};

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function statusIcon(status: UploadJobStatus) {
  switch (status) {
    case "waiting":
      return <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300" />;
    case "uploading":
    case "ocr":
    case "parsing":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-rose-500" />;
  }
}

function progressColor(status: UploadJobStatus) {
  if (status === "completed") return "bg-emerald-500";
  if (status === "failed") return "bg-rose-400";
  return "bg-blue-500";
}

// ---------------------------------------------------------------------------
// Drop zone overlay
// ---------------------------------------------------------------------------

function DropOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-blue-400 bg-blue-50/80 backdrop-blur-xs">
      <div className="flex flex-col items-center gap-2 text-blue-600">
        <Upload className="h-8 w-8" />
        <p className="text-[14px] font-medium">拖放 PDF 到此处</p>
        <p className="text-[12px] text-blue-500">自动拆解并入库</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload panel component
// ---------------------------------------------------------------------------

export default function UploadPanel({
  jobs,
  isProcessing,
  hasJobs,
  onAddFiles,
  onRemoveJob,
  onClearDone,
  onViewResults,
  children,
}: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag-and-drop handlers for the parent container
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 只在鼠标真正离开 drop zone 边界时关闭高亮
    const rect = e.currentTarget.getBoundingClientRect();
    const { clientX, clientY } = e;
    if (
      clientX <= rect.left ||
      clientX >= rect.right ||
      clientY <= rect.top ||
      clientY >= rect.bottom
    ) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onAddFiles(files);
      }
    },
    [onAddFiles],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) {
        onAddFiles(files);
      }
      // Reset input so the same file can be selected again
      e.target.value = "";
    },
    [onAddFiles],
  );

  const activeCount = jobs.filter(
    (j) =>
      j.status === "waiting" ||
      j.status === "uploading" ||
      j.status === "ocr" ||
      j.status === "parsing",
  ).length;

  const completedCount = jobs.filter((j) => j.status === "completed").length;
  const totalQuestions = jobs.reduce(
    (sum, j) => sum + (j.questionCount ?? 0),
    0,
  );

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Drop zone wrapper - wraps the entire question list area */}
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drop overlay */}
        {isDragOver ? <DropOverlay /> : null}

        {/* Upload button bar */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-white px-3 py-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-2.5 py-1.5 text-[12px] text-slate-500 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600"
          >
            <FileUp className="h-3.5 w-3.5" />
            上传 PDF 拆题
          </button>
          <span className="text-[11px] text-slate-400">
            或直接拖放 PDF 到此区域（单文件上限 50MB）
          </span>
        </div>

        {/* Children (question list) */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>

        {/* Upload queue panel (when has jobs) */}
        {hasJobs ? (
          <div className="border-t border-slate-200 bg-white">
            {/* Queue header */}
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="flex w-full items-center justify-between px-3 py-2 text-left"
            >
              <div className="flex items-center gap-2">
                <FileUp className="h-3.5 w-3.5 text-slate-500" />
                <span className="text-[13px] font-medium text-slate-700">
                  上传队列
                </span>
                {isProcessing ? (
                  <span className="flex items-center gap-1 text-[11px] text-blue-600">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    处理中 ({activeCount})
                  </span>
                ) : null}
                {completedCount > 0 ? (
                  <span className="text-[11px] text-emerald-600">
                    已完成 {completedCount} 个 · {totalQuestions} 道题
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="rounded px-2 py-0.5 text-[11px] text-blue-600 hover:bg-blue-50"
                >
                  + 添加
                </button>
                {completedCount > 0 ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearDone();
                    }}
                    className="rounded px-2 py-0.5 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    清除已完成
                  </button>
                ) : null}
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                )}
              </div>
            </button>

            {/* Queue items */}
            {isExpanded ? (
              <div className="max-h-[200px] overflow-y-auto border-t border-slate-100">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    onClick={
                      job.status === "completed"
                        ? () => onViewResults(job.fileName)
                        : undefined
                    }
                    className={cn(
                      "flex items-center gap-3 border-b border-slate-50 px-3 py-2 last:border-b-0",
                      job.status === "completed" &&
                        "cursor-pointer hover:bg-emerald-50/50",
                    )}
                  >
                    {/* Status icon */}
                    {statusIcon(job.status)}

                    {/* File info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-[12px] font-medium text-slate-700",
                            job.status === "completed" &&
                              "text-emerald-700 underline decoration-emerald-300 underline-offset-2",
                          )}
                        >
                          {job.fileName}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[11px]",
                            job.status === "completed"
                              ? "text-emerald-600"
                              : job.status === "failed"
                                ? "text-rose-500"
                                : "text-slate-500",
                          )}
                        >
                          {job.label}
                        </span>
                      </div>

                      {/* Progress bar */}
                      {job.status !== "waiting" &&
                      job.status !== "completed" &&
                      job.status !== "failed" ? (
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              progressColor(job.status),
                            )}
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                      ) : null}
                    </div>

                    {/* Remove button (for completed/failed) */}
                    {job.status === "completed" || job.status === "failed" ? (
                      <button
                        type="button"
                        onClick={() => onRemoveJob(job.id)}
                        className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
