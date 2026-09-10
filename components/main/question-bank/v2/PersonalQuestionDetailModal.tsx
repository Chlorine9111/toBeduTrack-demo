"use client"

import { useEffect } from "react"
import { cn } from "@/lib/utils"
import { useAppI18n } from "@/lib/app-i18n/provider"
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages"
import {
  personalDifficultyColors,
  personalDifficultyLabel,
  personalTypeLabel,
  type PersonalQuestionItem,
} from "@/components/main/question-bank/v2/constants"

export default function PersonalQuestionDetailModal({
  item,
  onClose,
}: {
  item: PersonalQuestionItem
  onClose: () => void
}) {
  const { isZh } = useAppI18n()

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  const choiceEntries = (item.options ?? []).sort((a, b) => a.label.localeCompare(b.label))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="relative mx-4 max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-[12px] border-[0.5px] border-[rgba(0,0,0,0.08)] bg-white p-6 shadow-[0_32px_80px_rgba(0,0,0,0.12)] md:mx-0 md:p-8">
        <div className="pointer-events-none sticky top-0 z-20 -mx-6 -mt-6 mb-1 flex h-11 items-start justify-end px-6 pt-4 md:-mx-8 md:-mt-8 md:h-12 md:px-8 md:pt-6">
          <button
            type="button"
            onClick={onClose}
            aria-label={isZh ? "关闭题目详情" : "Close question details"}
            className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-white/95 text-[#9B9DA4] shadow-sm transition-colors duration-[120ms] hover:bg-[#F7F7F7] hover:text-[#1D1D1F]"
          >
            <span className="text-[16px]">&times;</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pr-11 text-[12px] md:pr-12">
          <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-700">
            {personalTypeLabel(item.exercise_type, isZh)}
          </span>
          <span className={cn("rounded-full px-2.5 py-1 font-medium", personalDifficultyColors(item.difficulty))}>
            {personalDifficultyLabel(item.difficulty, isZh)}
          </span>
          {item.subject ? <span className="rounded-full bg-[#F7F7F7] px-2.5 py-1 font-medium text-[#6B6F76]">{item.subject}</span> : null}
        </div>

        <div className="mt-6">
          <h3 className="text-[12px] font-medium text-[#9B9DA4]">{isZh ? "题干" : "Stem"}</h3>
          <div className="mt-3">
            <QuestionContentWithImages
              content={item.question_text}
              className="space-y-3"
              textClassName="text-[15px] font-normal leading-7 text-[#1D1D1F]"
              galleryClassName="grid gap-3 sm:grid-cols-2"
              figureClassName="bg-[#F7F7F7]"
              imageClassName="max-h-[300px] w-full object-scale-down"
              enableImagePreview
            />
          </div>
        </div>

        {choiceEntries.length > 0 ? (
          <div className="mt-6">
            <h3 className="text-[12px] font-medium text-[#9B9DA4]">{isZh ? "选项" : "Choices"}</h3>
            <div className="mt-3 space-y-3">
              {choiceEntries.map((choice) => {
                const isCorrect = choice.label === item.correct_answer
                return (
                  <div
                    key={`modal-personal-${item.id}-${choice.label}`}
                    className={cn(
                      "rounded-[6px] border-[0.5px] px-4 py-3 text-[14px] leading-6",
                      isCorrect
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-[rgba(0,0,0,0.08)] bg-[#F7F7F7] text-[#6B6F76]",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className={cn("w-5 shrink-0 font-medium", isCorrect ? "text-emerald-700" : "text-[#1D1D1F]")}>
                        {choice.label}.
                      </span>
                      <QuestionContentWithImages
                        content={choice.text}
                        className="space-y-1"
                        textClassName="text-[14px] leading-6"
                        galleryClassName="grid gap-2"
                        figureClassName="bg-white"
                        imageClassName="max-h-[160px] w-full object-scale-down"
                        enableImagePreview
                      />
                      {isCorrect ? <span className="shrink-0 text-[12px] font-medium text-emerald-600">{isZh ? "正确" : "Correct"}</span> : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          <h3 className="text-[12px] font-medium text-[#9B9DA4]">{isZh ? "正确答案" : "Correct answer"}</h3>
          <div className="mt-3 rounded-[6px] border-[0.5px] border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] font-medium leading-6 text-emerald-800">
            {item.correct_answer}
          </div>
        </div>

        {item.solution_steps ? (
          <div className="mt-6">
            <h3 className="text-[12px] font-medium text-[#9B9DA4]">{isZh ? "解析" : "Explanation"}</h3>
            <div className="mt-3 rounded-[6px] border-[0.5px] border-[rgba(0,0,0,0.08)] bg-[#F7F7F7] px-4 py-3">
              <QuestionContentWithImages
                content={item.solution_steps}
                className="space-y-2"
                textClassName="text-[14px] leading-6 text-[#1D1D1F]"
                galleryClassName="grid gap-2"
                figureClassName="bg-white"
                imageClassName="max-h-[160px] w-full object-scale-down"
                enableImagePreview
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
