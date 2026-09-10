"use client";

import { Loader2, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

type BuilderAiComposerProps = {
  open: boolean;
  instruction: string;
  loading?: boolean;
  title?: string;
  description?: string;
  placeholder?: string;
  quickActions?: string[];
  footerNote?: string;
  submitLabel?: string;
  onInstructionChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => Promise<void> | void;
};

const QUICK_ACTIONS = [
  "重新排布题目顺序，让难度从易到难",
  "统一整套卷子的措辞风格，保持简洁清晰",
  "补充每题之间的分组标题和过渡说明",
  "把说明文字改成更正式的考试语气",
];

export default function BuilderAiComposer({
  open,
  instruction,
  loading = false,
  title = "AI 修改当前组卷稿",
  description = "AI 会直接基于当前编辑台的完整内容进行重排、润色或补充说明，但不会修改题库原题。",
  placeholder = "例如：把前 3 道题调整成基础题，把后面题目排成进阶题；保留题目内容不变，但补齐总标题、分组标题和答题说明。",
  quickActions = QUICK_ACTIONS,
  footerNote = "当前整卷 AI 修改会覆盖当前 draft 内容，建议先保存。",
  submitLabel = "应用 AI 修改",
  onInstructionChange,
  onClose,
  onSubmit,
}: BuilderAiComposerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.2)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Builder AI
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm text-slate-500">{description}</p>
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
            {quickActions.map((item) => (
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
            rows={10}
            className="mt-4 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 outline-hidden placeholder:text-slate-400"
            placeholder={placeholder}
          />
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          <p className="text-xs text-slate-500">{footerNote}</p>

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
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
