"use client"

import { useEffect, useState } from "react"
import { apiGet } from "@/lib/api/client"
import { useAppI18n } from "@/lib/app-i18n/provider"
import QuestionGridSkeleton from "@/components/main/question-bank/v2/QuestionCardSkeleton"
import TikuQuestionDetailModal from "@/components/main/question-bank/tiku/TikuQuestionDetailModal"
import type { TikuSearchResultRow } from "@/lib/tiku/types"
import {
  COURSE_LABELS,
  COURSE_UNIT_MAP,
  type MaterialDetailResponse,
  type MaterialItem,
  materialQuestionToSearchRow,
} from "@/components/main/question-bank/v2/constants"
import { stripMarkdownImages } from "@/components/shared/QuestionContentWithImages"

function plainQuestionPreview(content: string) {
  return stripMarkdownImages(content)
    .replace(/\s+/g, " ")
    .trim()
}

export default function MaterialDetailDrawer({
  material,
  onClose,
}: {
  material: MaterialItem
  onClose: () => void
}) {
  const { isZh } = useAppI18n()
  const [questions, setQuestions] = useState<TikuSearchResultRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorText, setErrorText] = useState("")
  const [selectedItem, setSelectedItem] = useState<TikuSearchResultRow | null>(null)
  const [questionCount, setQuestionCount] = useState(material.questionCount)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setErrorText("")
      try {
        const params = new URLSearchParams({
          course: material.course,
          sourceAssessment: material.sourceAssessment,
        })
        const response = await apiGet<MaterialDetailResponse>(
          `/api/tiku/materials/detail?${params.toString()}`,
          { signal: controller.signal },
        )
        setQuestions(response.questions.map(materialQuestionToSearchRow))
        setQuestionCount(response.material.questionCount)
      } catch (error) {
        if (controller.signal.aborted) return
        setErrorText(
          error instanceof Error
            ? error.message
            : isZh
              ? "读取素材详情失败"
              : "Failed to load material details",
        )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [isZh, material.course, material.sourceAssessment])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (selectedItem) setSelectedItem(null)
        else onClose()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose, selectedItem])

  const courseLabel = isZh
    ? (COURSE_LABELS[material.course] ?? material.course)
    : (COURSE_UNIT_MAP[material.course]?.label ?? material.course)

  return (
    <>
      <div className="fixed inset-y-0 right-0 z-30 flex w-full max-w-xl animate-[slideInRight_0.3s_ease-out_both] border-l border-[rgba(0,0,0,0.08)]">
        <div className="flex w-full flex-col overflow-hidden bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.06)]">
          <div className="flex items-start justify-between border-b border-[rgba(0,0,0,0.08)] px-6 py-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[12px] font-medium text-[#6B6F76]">
                <span className="rounded-[6px] bg-[#F7F7F7] px-2.5 py-1">{courseLabel}</span>
                <span className="rounded-[6px] bg-[#F7F7F7] px-2.5 py-1">{isZh ? `单元 ${material.unit}` : `Unit ${material.unit}`}</span>
                <span className="rounded-[6px] bg-[#F7F7F7] px-2.5 py-1">{questionCount} {isZh ? "题" : "questions"}</span>
              </div>
              <h2 className="mt-2 line-clamp-2 break-all text-[16px] font-medium text-[#1D1D1F]">
                {material.sourceAssessment}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-4 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[#9B9DA4] transition-colors duration-[120ms] hover:bg-[#F7F7F7] hover:text-[#1D1D1F]"
            >
              <span className="text-[16px]">&times;</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loading ? (
              <QuestionGridSkeleton count={3} />
            ) : errorText ? (
              <div className="rounded-[6px] border-[0.5px] border-rose-200 bg-rose-50 px-5 py-4 text-[13px] text-rose-700">
                {errorText}
              </div>
            ) : questions.length === 0 ? (
              <div className="rounded-[6px] border border-dashed border-[rgba(0,0,0,0.08)] bg-[#F7F7F7] px-5 py-10 text-center text-[13px] text-[#6B6F76]">
                {isZh ? "这份素材里还没有题目" : "No questions in this material"}
              </div>
            ) : (
              <div className="space-y-4">
                {questions.map((question, index) => (
                  <div key={question.id} className="animate-qb-card-enter" style={{ animationDelay: `${index * 40}ms` }}>
                    <button
                      type="button"
                      onClick={() => setSelectedItem(question)}
                      className="w-full rounded-[6px] border-[0.5px] border-[rgba(0,0,0,0.08)] bg-white p-4 text-left transition-all duration-[120ms] hover:border-[rgba(0,0,0,0.16)] hover:shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                    >
                      <p className="line-clamp-3 text-[13px] leading-6 text-[#1D1D1F]">
                        {plainQuestionPreview(question.stem)}
                      </p>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedItem ? (
        <div className="z-[60]">
          <TikuQuestionDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
        </div>
      ) : null}
    </>
  )
}
