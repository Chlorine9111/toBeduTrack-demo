"use client";

import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages";
import { cn } from "@/lib/utils";
import type { QuestionBankOutlineSection } from "@/components/main/question-bank/split-editor/types";

export default function OutlineNav({
  sections,
  activeQuestionId,
  onSelectQuestion,
}: {
  sections: QuestionBankOutlineSection[];
  activeQuestionId: string | null;
  onSelectQuestion: (questionId: string) => void;
}) {
  if (sections.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#e9ddc7] bg-[#fcfaf4] px-4 py-6 text-center text-sm text-[#37352F]/45">
        拆题完成后会在这里生成题目大纲。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div
          key={section.id}
          className="rounded-xl border border-[rgba(55,53,47,0.08)] bg-white p-3"
        >
          <p className="px-1 text-xs font-semibold text-[#37352F]/72">
            {section.label}
          </p>
          <div className="mt-2 space-y-1">
            {section.items.map((item) => (
              <button
                key={item.questionId}
                type="button"
                onClick={() => onSelectQuestion(item.questionId)}
                className={cn(
                  "w-full rounded-xl border border-transparent px-2.5 py-2.5 text-left transition-colors",
                  activeQuestionId === item.questionId
                    ? "border-[#37352F] bg-[#37352F] text-white"
                    : "text-[#37352F]/70 hover:border-[rgba(55,53,47,0.08)] hover:bg-[#faf8f3]",
                )}
              >
                <div className="space-y-1.5 overflow-hidden">
                  <p
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-[0.16em]",
                      activeQuestionId === item.questionId
                        ? "text-white/72"
                        : "text-[#8c7e68]",
                    )}
                  >
                    {item.title}
                  </p>
                  <div className="max-h-[112px] overflow-hidden">
                    <QuestionContentWithImages
                      content={item.content}
                      className="space-y-2"
                      textClassName={cn(
                        "text-xs leading-5",
                        activeQuestionId === item.questionId
                          ? "text-white"
                          : "text-[#37352F]/78",
                      )}
                      galleryClassName="grid gap-2 sm:grid-cols-2"
                      figureClassName={cn(
                        activeQuestionId === item.questionId
                          ? "border-white/12 bg-white/8"
                          : "bg-[#fcfcfa]",
                      )}
                      imageClassName="max-h-[68px] w-full object-scale-down"
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
