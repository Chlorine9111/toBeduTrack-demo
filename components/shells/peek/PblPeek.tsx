"use client";

import { Lightbulb, Target, Package, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SearchPeekMeta,
  SearchPeekPblPayload,
} from "@/lib/search/peek-types";

type PblPeekProps = {
  item: SearchPeekMeta;
  preview: SearchPeekPblPayload;
};

const STATUS_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: "草稿", bg: "bg-[#EBECED]/50", text: "text-default-400" },
  published: { label: "已发布", bg: "bg-[#DDEDEA]/50", text: "text-success" },
  archived: { label: "已归档", bg: "bg-[#E9E5E3]/50", text: "text-[#64473A]" },
};

const STAGE_ICON: Record<string, typeof Target> = {
  explore: Lightbulb,
  develop: Target,
  present: Package,
};

export default function PblPeek({ item, preview }: PblPeekProps) {
  const statusInfo = STATUS_STYLE[preview.status] ?? STATUS_STYLE.draft;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Hero meta */}
      <div className="px-10 pt-10 pb-6 space-y-3">
        <div className="flex items-center gap-2">
          <span className="rounded px-2 py-0.5 text-[11px] font-medium bg-[#F4DFEB]/50 text-[#AD1A72]">
            PBL
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
        <div className="flex flex-wrap items-center gap-4 text-sm text-default-500">
          <span>{preview.primarySubject}</span>
          <div className="h-1 w-1 rounded-full bg-default-200" />
          <span>{preview.grade}</span>
          <div className="h-1 w-1 rounded-full bg-default-200" />
          <span>{preview.totalPeriods} 课时</span>
          <div className="h-1 w-1 rounded-full bg-default-200" />
          <span>{preview.stageCount} 个阶段</span>
        </div>
      </div>

      {/* Driving question */}
      {preview.drivingQuestion ? (
        <div className="mx-10 mb-6 rounded-xl border-l-[3px] border-[#AD1A72] bg-default-100/50 px-5 py-4">
          <h3 className="mb-1.5 text-[11px] font-medium text-foreground/40">
            驱动问题
          </h3>
          <p className="text-sm font-medium italic leading-relaxed text-foreground">
            {preview.drivingQuestion}
          </p>
        </div>
      ) : null}

      {/* Overview */}
      {preview.overviewText ? (
        <div className="px-10 pb-6">
          <p className="text-sm leading-relaxed text-default-500">
            {preview.overviewText}
          </p>
        </div>
      ) : null}

      {/* Stages */}
      <div className="px-10 pb-12 space-y-1">
        {preview.stages.map((stage) => {
          const Icon = STAGE_ICON[stage.stageType] ?? Target;
          return (
            <div
              key={stage.stageNumber}
              className="group rounded-xl px-4 py-5 -mx-4 transition-colors hover:bg-default-100"
            >
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F4DFEB]/30 text-[#AD1A72]">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 space-y-1.5 min-w-0">
                  <p className="text-[15px] font-medium text-foreground">
                    第 {stage.stageNumber} 阶段：{stage.name}
                  </p>
                  {stage.objective ? (
                    <p className="text-sm text-default-500">
                      {stage.objective}
                    </p>
                  ) : null}
                  {stage.deliverables.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {stage.deliverables.map((d, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-default-100 px-2 py-0.5 text-[11px] text-default-500"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}

        {preview.stageCount > preview.stages.length ? (
          <div className="px-4 py-3 text-center text-xs text-default-400">
            还有 {preview.stageCount - preview.stages.length} 个阶段
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PblPeekFooter({ onEdit }: { onEdit?: () => void }) {
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
