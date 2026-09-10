"use client";

import { FileText, Loader2, Plus } from "lucide-react";
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages";
import type {
  WorksheetMaterialDetail,
  WorksheetMaterialExercise,
} from "@/components/main/question-bank/worksheet-editor/types";
import {
  getDifficultyLabel,
  getQuestionTypeLabel,
} from "@/components/main/question-bank/worksheet-editor/utils";
import { cn } from "@/lib/utils";

function getDifficultyBadgeClasses(difficulty: number) {
  if (difficulty <= 1) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (difficulty === 2) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (difficulty === 3) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-red-200 bg-red-50 text-red-700";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MaterialPreviewPanel({
  detail,
  loading,
  errorText,
  importedExerciseIds,
  targetSectionTitle,
  onAddExercise,
}: {
  detail: WorksheetMaterialDetail | null;
  loading: boolean;
  errorText: string;
  importedExerciseIds: Set<string>;
  targetSectionTitle: string;
  onAddExercise: (exercise: WorksheetMaterialExercise) => void;
}) {
  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[28px] border border-[rgba(55,53,47,0.08)] bg-white">
      <div className="shrink-0 border-b border-[rgba(55,53,47,0.08)] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#37352F]/34">
              Material Preview
            </p>
            <h2 className="mt-2 truncate text-sm font-semibold text-[#37352F]">
              {detail?.material.label || "选择一份文件"}
            </h2>
            <p className="mt-1 text-xs leading-5 text-[#37352F]/46">
              {detail
                ? `${detail.material.questionCount} 题${detail.material.course ? ` · ${detail.material.course}` : detail.material.subject ? ` · ${detail.material.subject}` : ""}${detail.material.unit ? ` · Unit ${detail.material.unit}` : detail.material.textbookVersion ? ` · ${detail.material.textbookVersion}` : ""}${formatDateTime(detail.material.createdAt) ? ` · ${formatDateTime(detail.material.createdAt)}` : ""}`
                : "Select a material from the left to browse questions."}
            </p>
          </div>
          <div className="shrink-0 rounded-full bg-[#f6f6f2] px-3 py-1 text-[11px] text-[#37352F]/58">
            {targetSectionTitle ? `导入到 ${targetSectionTitle}` : "自动分组"}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-[#fbfbf8] px-4 py-4 [touch-action:pan-y]">
        {loading ? (
          <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-[#37352F]/46">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            正在读取文件内容...
          </div>
        ) : errorText ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorText}
          </div>
        ) : !detail ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[rgba(55,53,47,0.12)] bg-white px-6 text-center text-sm text-[#37352F]/42">
            <FileText className="mb-3 h-5 w-5 text-[#8c7e68]" />
            左侧选择文件后，这里会展示文件里的题目。
          </div>
        ) : ((detail.exercises ?? detail.questions ?? []) as any[]).length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[rgba(55,53,47,0.12)] bg-white px-6 py-12 text-center text-sm text-[#37352F]/42">
            这份文件里还没有可用题目。
          </div>
        ) : (
          <div className="space-y-3">
            {((detail.exercises ?? detail.questions ?? []) as any[]).map((exercise: any, index: number) => {
              const imported = importedExerciseIds.has(exercise.id);
              return (
                <article
                  key={exercise.id}
                  className="rounded-[22px] border border-[rgba(55,53,47,0.08)] bg-white px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.03)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap gap-2 text-[11px]">
                      <span className="rounded-full bg-[#f6efe2] px-2 py-1 font-medium text-[#37352F]/68">
                        {index + 1}. {getQuestionTypeLabel((exercise as any).exerciseType)}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-1 font-medium",
                          getDifficultyBadgeClasses((exercise as any).difficulty),
                        )}
                      >
                        {getDifficultyLabel((exercise as any).difficulty)}
                      </span>
                      {exercise.reviewFlag === "disputed" ? (
                        <span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-700">
                          存疑
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={imported}
                      onClick={() => onAddExercise(exercise)}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition",
                        imported
                          ? "cursor-not-allowed bg-slate-200 text-slate-500"
                          : "bg-[#37352F] text-white hover:bg-[#27241f]",
                      )}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {imported ? "已添加" : "添加"}
                    </button>
                  </div>

                  <div className="mt-3">
                    <QuestionContentWithImages
                      content={exercise.questionText}
                      textClassName="text-sm leading-7 font-medium text-[#37352F]"
                      galleryClassName="mt-2 grid gap-2"
                      figureClassName="bg-[#fafaf8]"
                      imageClassName="max-h-[180px] w-full object-scale-down"
                    />
                  </div>

                  {exercise.options?.length ? (
                    <div className="mt-3 space-y-2">
                      {exercise.options.map((option: any) => (
                        <div
                          key={`${exercise.id}-${option.label}`}
                          className="flex items-start gap-3 text-sm leading-7 text-[#37352F]/82"
                        >
                          <span className="w-5 shrink-0 font-semibold text-[#37352F]">
                            {option.label}.
                          </span>
                          <QuestionContentWithImages
                            content={option.text}
                            textClassName="text-sm leading-7 text-[#37352F]/82"
                            galleryClassName="mt-2 grid gap-2"
                            figureClassName="bg-[#fafaf8]"
                            imageClassName="max-h-[160px] w-full object-scale-down"
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
