"use client";

import { Check, Loader2, Plus, Sparkles } from "lucide-react";
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages";
import type {
  WorksheetQuestionBankItem,
} from "@/components/main/question-bank/worksheet-editor/types";
import {
  getDifficultyLabel,
  getQuestionTypeLabel,
} from "@/components/main/question-bank/worksheet-editor/utils";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { cn } from "@/lib/utils";

export default function AiAssemblePanel({
  embedded = false,
  assemblePrompt,
  assembleLoading,
  assembleStatusText,
  assembleErrorText,
  assembleResults,
  selectedIds,
  onAssemblePromptChange,
  onRunAssemble,
  onToggleSelect,
  onImportSelected,
}: {
  assemblePrompt: string;
  assembleLoading: boolean;
  assembleStatusText: string;
  assembleErrorText: string;
  assembleResults: WorksheetQuestionBankItem[];
  selectedIds: Set<string>;
  onAssemblePromptChange: (value: string) => void;
  onRunAssemble: () => void;
  onToggleSelect: (id: string) => void;
  onImportSelected: () => void;
  embedded?: boolean;
}) {
  const { isZh } = useAppI18n();

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-white",
        embedded
          ? "h-full"
          : "rounded-[28px] border border-[rgba(55,53,47,0.08)] shadow-[0_18px_48px_rgba(15,23,42,0.05)]",
      )}
    >
      {embedded ? null : (
        <div className="border-b border-[rgba(55,53,47,0.08)] px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#a6947a]">
            AI Builder
          </p>
          <h2 className="mt-1 text-base font-semibold text-[#37352F]">
            {isZh ? "AI 找题" : "AI Search"}
          </h2>
        </div>
      )}

      {/* 输入区 */}
      <div className="shrink-0 border-b border-[rgba(55,53,47,0.08)] px-4 py-4">
        <textarea
          value={assemblePrompt}
          onChange={(event) => onAssemblePromptChange(event.target.value)}
          rows={4}
          className="w-full rounded-2xl border border-[rgba(55,53,47,0.08)] bg-[#fcfaf4] px-4 py-3 text-sm leading-7 text-[#37352F] outline-none"
          placeholder={
            isZh
              ? "例如：帮我找 10 道关于磁场的选择题，难度中等偏上"
              : "For example: find 10 multiple-choice questions about magnetic fields with medium-to-high difficulty"
          }
        />
        <button
          type="button"
          onClick={onRunAssemble}
          disabled={assembleLoading}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#37352F] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#27241f] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {assembleLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {assembleLoading
            ? isZh
              ? "搜索中..."
              : "Searching..."
            : isZh
              ? "AI 搜索题目"
              : "AI Search Questions"}
        </button>

        {assembleStatusText ? (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {assembleStatusText}
          </div>
        ) : null}
        {assembleErrorText ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {assembleErrorText}
          </div>
        ) : null}
      </div>

      {/* 搜索结果列表 */}
      {assembleResults.length > 0 ? (
        <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-2.5 pb-16">
            {assembleResults.map((item, index) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={() => onToggleSelect(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === " " || event.key === "Enter") {
                      event.preventDefault();
                      onToggleSelect(item.id);
                    }
                  }}
                  className={cn(
                    "cursor-pointer rounded-2xl border px-3.5 py-3 transition",
                    isSelected
                      ? "border-[#37352F] bg-[#37352F]/[0.03] shadow-[0_0_0_1px_#37352F]"
                      : "border-[rgba(55,53,47,0.08)] bg-[#fcfaf4] hover:border-[rgba(55,53,47,0.16)]",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {/* 勾选框 */}
                    <div
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
                        isSelected
                          ? "border-[#37352F] bg-[#37352F] text-white"
                          : "border-[rgba(55,53,47,0.2)] bg-white",
                      )}
                    >
                      {isSelected ? <Check className="h-3 w-3" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* 题号 + 题目文本 */}
                      <div className="flex items-start gap-1.5">
                        <span className="mt-0.5 shrink-0 text-xs font-semibold text-[#37352F]/35">
                          {index + 1}.
                        </span>
                        <div className="min-w-0 flex-1">
                          <QuestionContentWithImages
                            content={item.questionText}
                            className="space-y-2"
                            textClassName="text-sm leading-7 font-medium text-[#37352F]"
                            galleryClassName="grid gap-2"
                            figureClassName="bg-white"
                            imageClassName="max-h-[160px] w-full object-scale-down"
                          />
                        </div>
                      </div>
                      {/* 选项（仅选择题） */}
                      {item.options && item.options.length > 0 ? (
                        <div className="mt-1.5 space-y-0.5 pl-5">
                          {item.options.map((opt) => (
                            <div
                              key={`${item.id}-${opt.label}`}
                              className={cn(
                                "flex items-start gap-2 text-xs leading-5",
                                opt.label === item.correctAnswer
                                  ? "text-emerald-700"
                                  : "text-[#37352F]/60",
                              )}
                            >
                              <span className="w-4 shrink-0 font-medium">{opt.label}.</span>
                              <div className="min-w-0 flex-1">
                                <QuestionContentWithImages
                                  content={opt.text}
                                  className="space-y-0"
                                  textClassName="text-xs leading-5"
                                  galleryClassName="grid gap-1"
                                  figureClassName="bg-white"
                                  imageClassName="max-h-[80px] w-full object-scale-down"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {/* 标签：题型 / 难度 / 分值 */}
                      <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
                        <span className="rounded-full bg-white px-2 py-0.5 text-[#37352F]/50">
                          {getQuestionTypeLabel(item.exerciseType, isZh)}
                        </span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[#37352F]/50">
                          {getDifficultyLabel(item.difficulty, isZh)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 底部固定导入按钮 */}
          {selectedIds.size > 0 ? (
            <div className="sticky bottom-0 left-0 right-0 border-t border-[rgba(55,53,47,0.08)] bg-white/95 px-4 py-3 backdrop-blur-sm">
              <button
                type="button"
                onClick={onImportSelected}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#37352F] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#27241f]"
              >
                <Plus className="h-4 w-4" />
                {isZh
                  ? `导入 ${selectedIds.size} 道选中题`
                  : `Import ${selectedIds.size} selected questions`}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="flex h-full items-center justify-center text-center text-sm text-[#37352F]/35">
            <p>
              {isZh ? (
                <>
                  输入要求后点击按钮，
                  <br />
                  AI 会从题库中搜索匹配的题目。
                </>
              ) : (
                <>
                  Enter your request and click the button.
                  <br />
                  AI will search the question bank for matching questions.
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
