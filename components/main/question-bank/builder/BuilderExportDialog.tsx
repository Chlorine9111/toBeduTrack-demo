"use client";

import { FileDown, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type BuilderExportFormat = "pdf" | "docx" | "markdown";

type BuilderExportDialogProps = {
  open: boolean;
  format: BuilderExportFormat | null;
  title: string;
  fileName: string;
  description: string;
  loading?: boolean;
  onTitleChange: (value: string) => void;
  onFileNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => Promise<void> | void;
};

function getFormatLabel(format: BuilderExportFormat | null) {
  if (format === "pdf") return "PDF";
  if (format === "docx") return "Word";
  if (format === "markdown") return "Markdown";
  return "文件";
}

export default function BuilderExportDialog({
  open,
  format,
  title,
  fileName,
  description,
  loading = false,
  onTitleChange,
  onFileNameChange,
  onDescriptionChange,
  onClose,
  onSubmit,
}: BuilderExportDialogProps) {
  if (!open || !format) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.2)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Builder Export
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              导出 {getFormatLabel(format)}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              在导出前补充卷子标题、文件名和简短说明。简短说明会保存到这份组卷稿，便于后续查找。
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 px-6 py-5">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">卷子标题</span>
            <input
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              disabled={loading}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-hidden placeholder:text-slate-400"
              placeholder="例如：Unit 3 Quiz"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">导出文件名</span>
            <input
              value={fileName}
              onChange={(event) => onFileNameChange(event.target.value)}
              disabled={loading}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-hidden placeholder:text-slate-400"
              placeholder="例如：unit-3-quiz-v1"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">试卷说明</span>
            <textarea
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              disabled={loading}
              rows={4}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-hidden placeholder:text-slate-400"
              placeholder="例如：AP Chemistry Unit 3 课堂小测，共 10 题，建议用时 20 分钟。"
            />
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          <p className="text-xs text-slate-500">
            试卷说明会保存为当前草稿的简短说明，方便在草稿列表里识别。
          </p>

          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={loading || !title.trim() || !fileName.trim()}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition",
              loading || !title.trim() || !fileName.trim()
                ? "cursor-not-allowed bg-slate-200 text-slate-500"
                : "bg-slate-900 text-white hover:bg-slate-800",
            )}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            开始导出
          </button>
        </div>
      </div>
    </div>
  );
}
