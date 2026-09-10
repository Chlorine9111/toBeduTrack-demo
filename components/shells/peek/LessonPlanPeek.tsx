"use client";

import { BookOpen, Clock, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SearchPeekMeta,
  SearchPeekLessonPlanPayload,
} from "@/lib/search/peek-types";

type LessonPlanPeekProps = {
  item: SearchPeekMeta;
  preview: SearchPeekLessonPlanPayload;
};

const STATUS_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: "草稿", bg: "bg-[#EBECED]/50", text: "text-default-400" },
  published: { label: "已发布", bg: "bg-[#DDEDEA]/50", text: "text-success" },
  archived: { label: "已归档", bg: "bg-[#E9E5E3]/50", text: "text-[#64473A]" },
};

export default function LessonPlanPeek({ item, preview }: LessonPlanPeekProps) {
  const statusInfo = STATUS_STYLE[preview.status] ?? STATUS_STYLE.draft;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Hero meta */}
      <div className="px-10 pt-10 pb-6 space-y-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-medium",
              "bg-[#EAE4F2]/50 text-[#6940A5]",
            )}
          >
            {preview.subjectLabel}
          </span>
          <span
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-medium",
              statusInfo.bg,
              statusInfo.text,
            )}
          >
            {statusInfo.label}
          </span>
        </div>
        <h1 className="text-[1.75rem] font-semibold tracking-tight leading-tight text-foreground">
          {item.title}
        </h1>
        <div className="flex items-center gap-4 text-sm text-default-500">
          <div className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" />
            <span>{preview.sectionCount} 个章节</span>
          </div>
          <div className="h-1 w-1 rounded-full bg-default-200" />
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            <span>{preview.totalDurationMinutes} 分钟</span>
          </div>
        </div>
      </div>

      {/* Sections list */}
      <div className="px-10 pb-12 space-y-1">
        {preview.sections.map((section, index) => (
          <div
            key={section.id}
            className="group rounded-xl px-4 py-5 -mx-4 transition-colors hover:bg-default-100"
          >
            <div className="flex gap-4">
              <span className="pt-1 text-sm font-medium tabular-nums text-default-500">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="flex-1 space-y-2 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[15px] font-medium text-foreground">
                    {section.title}
                  </p>
                  <span className="shrink-0 text-xs text-default-400">
                    {section.durationMinutes} 分钟
                  </span>
                </div>
                {section.summary ? (
                  <p className="text-sm leading-relaxed text-default-500">
                    {section.summary}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ))}

        {preview.sectionCount > preview.sections.length ? (
          <div className="px-4 py-3 text-center text-xs text-default-400">
            还有 {preview.sectionCount - preview.sections.length} 个章节
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function LessonPlanPeekFooter({ onEdit }: { onEdit?: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-xs transition-all hover:bg-accent/90 active:scale-95"
    >
      <Pencil className="h-4 w-4" />
      <span>打开详情</span>
    </button>
  );
}
