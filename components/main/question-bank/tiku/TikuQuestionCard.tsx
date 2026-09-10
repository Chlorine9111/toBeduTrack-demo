"use client"

import { memo, useEffect } from "react"
import { Card, Chip } from "@heroui/react"
import QuestionContentWithImages, { preloadQuestionContentRender } from "@/components/shared/QuestionContentWithImages"
import { useAppI18n } from "@/lib/app-i18n/provider"
import { cn } from "@/lib/utils"
import { COURSE_UNIT_MAP, COURSE_LABELS } from "@/components/main/question-bank/v2/constants"
import type { TikuSearchResultRow } from "@/lib/tiku/types"

function tikuDifficultyLabel(difficulty: string, isZh = false) {
  switch (difficulty) {
    case "easy": return isZh ? "简单" : "Easy"
    case "medium": return isZh ? "中等" : "Medium"
    case "hard": return isZh ? "困难" : "Hard"
    default: return difficulty
  }
}

function tikuDifficultyColor(difficulty: string): "success" | "warning" | "danger" | "default" {
  switch (difficulty) {
    case "easy": return "success"
    case "medium": return "warning"
    case "hard": return "danger"
    default: return "default"
  }
}

function tikuCourseLabel(course: string, isZh = false) {
  return isZh
    ? (COURSE_LABELS[course] ?? course)
    : (COURSE_UNIT_MAP[course]?.label ?? course)
}

type TikuQuestionCardProps = {
  item: TikuSearchResultRow
  onSelectItem?: (item: TikuSearchResultRow) => void
}

function TikuQuestionCard({
  item,
  onSelectItem,
}: TikuQuestionCardProps) {
  const { isZh } = useAppI18n()

  useEffect(() => {
    const schedule = (callback: () => void) => {
      if (typeof window.requestIdleCallback === "function") {
        const idleId = window.requestIdleCallback(callback, { timeout: 1200 })
        return () => window.cancelIdleCallback?.(idleId)
      }

      const timeoutId = window.setTimeout(callback, 180)
      return () => window.clearTimeout(timeoutId)
    }

    return schedule(() => {
      preloadQuestionContentRender(item.stimulus_description ?? "")
      preloadQuestionContentRender(item.explanation ?? "")

      Object.values(item.choices ?? {}).forEach((choice) => {
        if (choice?.text) {
          preloadQuestionContentRender(choice.text)
        }
      })
    })
  }, [item])

  const choiceEntries = Object.entries(item.choices ?? {})
    .filter(([, v]) => v != null)
    .sort(([a], [b]) => a.localeCompare(b))

  return (
    <Card
      className="h-[360px] cursor-pointer overflow-hidden border-[0.5px] border-[rgba(0,0,0,0.08)] p-5 transition-all duration-[120ms] hover:border-[rgba(0,0,0,0.16)] hover:shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px"
      variant="default"
      onClick={onSelectItem ? () => onSelectItem(item) : undefined}
    >
      {/* Tags */}
      <Card.Header className="flex-row flex-wrap gap-1.5 p-0">
        <Chip size="sm" variant="soft" color="accent">{isZh ? "AP 全局" : "Global AP"}</Chip>
        <Chip size="sm" variant="soft" color={tikuDifficultyColor(item.difficulty)}>
          {tikuDifficultyLabel(item.difficulty, isZh)}
        </Chip>
        <Chip size="sm" variant="secondary">{tikuCourseLabel(item.course, isZh)}</Chip>
        <Chip size="sm" variant="secondary">{isZh ? `单元 ${item.unit}` : `Unit ${item.unit}`}</Chip>
        {item.topic_code ? (
          <Chip size="sm" variant="secondary">{item.topic_code}</Chip>
        ) : null}
        {item.cognitive_task ? (
          <Chip size="sm" variant="soft" color="accent">{item.cognitive_task}</Chip>
        ) : null}
      </Card.Header>

      {/* Stem */}
      <Card.Content className="flex-1 overflow-hidden p-0 pt-3">
        {item.stimulus_id && !item.stimulus_image_url && item.stimulus_description ? (
          <div className="mb-2 line-clamp-2 rounded-[6px] bg-amber-50 px-3 py-1.5">
            <QuestionContentWithImages
              content={item.stimulus_description}
              className="space-y-1"
              textClassName="text-[13px] leading-5 text-amber-800"
              galleryClassName="grid gap-1"
              figureClassName="bg-white/80"
              imageClassName="max-h-[80px] w-full object-scale-down"
            />
          </div>
        ) : null}
        <div className="line-clamp-4">
          <QuestionContentWithImages
            content={item.stem}
            className="space-y-2"
            textClassName="text-[15px] font-normal leading-7 text-[#1D1D1F]"
            galleryClassName="grid gap-2"
            figureClassName="bg-[#F7F7F7]"
            imageClassName="max-h-[160px] w-full object-scale-down"
          />
        </div>

        {/* Choices */}
        {choiceEntries.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            {choiceEntries.map(([label, choice]) => (
              <div
                key={`${item.id}-${label}`}
                className={cn(
                  "flex items-start gap-2.5 text-[13px] leading-6",
                  label === item.correct_answer
                    ? "text-emerald-700"
                    : "text-[#6B6F76]",
                )}
              >
                <span
                  className={cn(
                    "w-5 shrink-0 font-medium",
                    label === item.correct_answer
                      ? "text-emerald-700"
                      : "text-[#1D1D1F]",
                  )}
                >
                  {label}.
                </span>
                <div className="min-w-0 flex-1">
                  {choice.image_url ? (
                    <img
                      src={choice.image_url}
                      alt={`${isZh ? "选项" : "Choice"} ${label}`}
                      className="h-9 rounded border-[0.5px] border-[rgba(0,0,0,0.08)] bg-white object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <div className="line-clamp-1">
                      <QuestionContentWithImages
                        content={choice.text}
                        className="space-y-0"
                        textClassName="text-[13px] leading-6"
                        galleryClassName="grid gap-1"
                        figureClassName="bg-[#F7F7F7]"
                        imageClassName="max-h-[80px] w-full object-scale-down"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card.Content>

      {/* Footer */}
      <Card.Footer className="mt-auto flex-wrap gap-1.5 p-0 pt-3">
        {item.key_concepts?.slice(0, 3).map((concept) => (
          <Chip key={concept} size="sm" variant="tertiary">{concept}</Chip>
        ))}
        {typeof item.similarity === "number" && item.similarity > 0 ? (
          <span className="text-[12px] text-[#9B9DA4]">
            {(item.similarity * 100).toFixed(0)}% {isZh ? "匹配" : "match"}
          </span>
        ) : null}
      </Card.Footer>
    </Card>
  )
}

export default memo(TikuQuestionCard, (prevProps, nextProps) => (
  prevProps.item === nextProps.item &&
  prevProps.onSelectItem === nextProps.onSelectItem
))

export { tikuDifficultyLabel, tikuDifficultyColor, tikuDifficultyColor as tikuDifficultyColors, tikuCourseLabel }
