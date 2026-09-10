"use client";

import { Loader2, Plus, Search, Wand2 } from "lucide-react";
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages";
import { cn } from "@/lib/utils";
import type {
  QuestionBankAiSearchResult,
  QuestionBankSplitQuestion,
} from "@/components/main/question-bank/split-editor/types";
import {
  getDifficultyLabel,
  getQuestionTypeLabel,
} from "@/components/main/question-bank/split-editor/utils";

export default function AiSearchPanel({
  query,
  loading,
  errorText,
  statusText,
  activeQuestion,
  results,
  onQueryChange,
  onSearch,
  onReplaceResult,
  onAppendResult,
}: {
  query: string;
  loading: boolean;
  errorText: string;
  statusText: string;
  activeQuestion: QuestionBankSplitQuestion | null;
  results: QuestionBankAiSearchResult[];
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onReplaceResult: (item: QuestionBankAiSearchResult) => void;
  onAppendResult: (item: QuestionBankAiSearchResult) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="space-y-3 border-b border-[rgba(55,53,47,0.08)] px-4 py-4">
        <div className="rounded-xl border border-[rgba(55,53,47,0.08)] bg-[#fafaf8] px-3 py-3">
          <p className="text-xs font-medium text-[#37352F]/72">当前参考题</p>
          <p className="mt-2 text-sm leading-6 text-[#37352F]/68">
            {activeQuestion
              ? activeQuestion.questionText.slice(0, 96)
              : "先在正文里展开一道题，再来检索。"}
          </p>
        </div>

        <label className="flex items-center gap-2 rounded-xl border border-[rgba(55,53,47,0.08)] bg-[#fafaf8] px-3 py-3">
          <Search className="h-4 w-4 text-[#8c7e68]" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="输入条件，检索相关题目"
            className="w-full bg-transparent text-sm text-[#37352F] outline-none placeholder:text-[#8c7e68]"
          />
        </label>

        <button
          type="button"
          onClick={onSearch}
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          AI 检索
        </button>

        {statusText ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {statusText}
          </div>
        ) : null}
        {errorText ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorText}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          {results.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[rgba(55,53,47,0.12)] bg-[#fafaf8] px-4 py-10 text-center text-sm text-[#37352F]/45">
              还没有检索结果。
            </div>
          ) : (
            results.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-[rgba(55,53,47,0.08)] bg-[#fafaf8] p-4"
              >
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-white px-2.5 py-1 font-medium text-[#37352F]/60">
                    {item.subject || "未标注 AP 课程"}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 font-medium text-[#37352F]/60">
                    {getQuestionTypeLabel(item.exerciseType)}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 font-medium text-[#37352F]/60">
                    {getDifficultyLabel(item.difficulty)}
                  </span>
                  {item.gradeLevel ? (
                    <span className="rounded-full bg-white px-2.5 py-1 font-medium text-[#37352F]/60">
                      {item.gradeLevel}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3">
                  <QuestionContentWithImages
                    content={item.questionText}
                    textClassName="text-sm leading-7 font-medium text-[#37352F]"
                    galleryClassName="mt-2 grid gap-2"
                    figureClassName="bg-white"
                    imageClassName="max-h-[180px] w-full object-scale-down"
                  />
                </div>

                {item.knowledgePoints && item.knowledgePoints.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.knowledgePoints.slice(0, 4).map((point) => (
                      <span
                        key={`${item.id}-${point}`}
                        className="rounded-full border border-[rgba(55,53,47,0.08)] bg-white px-2.5 py-1 text-[11px] text-[#37352F]/60"
                      >
                        {point}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    onClick={() => onReplaceResult(item)}
                    className={cn(
                      "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                      activeQuestion
                        ? "bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                        : "cursor-not-allowed bg-slate-200 text-slate-500",
                    )}
                    disabled={!activeQuestion}
                  >
                    <Wand2 className="h-4 w-4" />
                    替换当前题
                  </button>
                  <button
                    type="button"
                    onClick={() => onAppendResult(item)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(55,53,47,0.1)] bg-white px-3 py-2.5 text-sm font-medium text-[#37352F]/70 transition hover:bg-white"
                  >
                    <Plus className="h-4 w-4" />
                    追加到试卷
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
