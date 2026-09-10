"use client";

import { Loader2, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

type BuilderAiImportDialogProps = {
  open: boolean;
  instruction: string;
  loading?: boolean;
  onInstructionChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => Promise<void> | void;
};

const QUICK_ACTIONS = [
  "补充十道题，延续当前卷子的主题和难度",
  "补 3 道基础选择题，覆盖本单元核心概念",
  "补 2 道难度更高的自由问答题",
  "找几道带图题，加到这套卷子后半部分",
  "补一些和细胞呼吸有关的题，难度 2-3",
];

export default function BuilderAiImportDialog({
  open,
  instruction,
  loading = false,
  onInstructionChange,
  onClose,
  onSubmit,
}: BuilderAiImportDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.2)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Builder AI Import
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">AI 从题库补题</h2>
            <p className="mt-2 text-sm text-slate-500">
              告诉 AI 你还缺什么题。它会先理解数量、题型、难度和当前卷子的主题，再从当前课程范围内的题库挑题并导入。
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

        <div className="px-6 py-5">
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onInstructionChange(item)}
                disabled={loading}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {item}
              </button>
            ))}
          </div>

          <textarea
            value={instruction}
            onChange={(event) => onInstructionChange(event.target.value)}
            rows={8}
            className="mt-4 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 outline-hidden placeholder:text-slate-400"
            placeholder="例如：补充十道题，延续当前卷子的主题；或者补 3 道难度 2 的选择题，主题围绕细胞膜运输，最好包含图表。"
          />
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          <p className="text-xs text-slate-500">
            AI 只会把命中的题目实例导入当前草稿，不会修改题库原题。
          </p>

          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={loading || !instruction.trim()}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition",
              loading || !instruction.trim()
                ? "cursor-not-allowed bg-slate-200 text-slate-500"
                : "bg-slate-900 text-white hover:bg-slate-800",
            )}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            从题库导入
          </button>
        </div>
      </div>
    </div>
  );
}
