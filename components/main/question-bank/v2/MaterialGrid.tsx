"use client"

import { FileText } from "lucide-react"
import { Card, Chip } from "@heroui/react"
import type { MaterialItem } from "./constants"
import { COURSE_UNIT_MAP, COURSE_LABELS } from "./constants"
import QuestionGridSkeleton from "./QuestionCardSkeleton"

type MaterialGridProps = {
  items: MaterialItem[]
  loading: boolean
  error: string
  onSelectMaterial: (item: MaterialItem) => void
  isZh: boolean
  emptyTitle: string
  emptyDescription: string
}

export default function MaterialGrid({
  items,
  loading,
  error,
  onSelectMaterial,
  isZh,
  emptyTitle,
  emptyDescription,
}: MaterialGridProps) {
  if (loading) {
    return <QuestionGridSkeleton count={6} />
  }

  if (error) {
    return (
      <div className="rounded-[6px] border-[0.5px] border-rose-200 bg-rose-50 px-5 py-4 text-[13px] text-rose-700">
        {error}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-[6px] border border-dashed border-[rgba(0,0,0,0.08)] bg-white px-5 py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F7F7F7]">
          <FileText className="h-8 w-8 text-[#9B9DA4]" />
        </div>
        <h3 className="text-[16px] font-medium text-[#1D1D1F]">{emptyTitle}</h3>
        <p className="mt-2 max-w-md text-[13px] leading-6 text-[#6B6F76]">{emptyDescription}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => {
        const courseLabel = isZh
          ? (COURSE_LABELS[item.course] ?? item.course)
          : (COURSE_UNIT_MAP[item.course]?.label ?? item.course)

        return (
          <div
            key={`${item.course}-${item.sourceAssessment}`}
            className="animate-qb-card-enter"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <Card
              className="cursor-pointer border-[0.5px] border-[rgba(0,0,0,0.08)] p-5 transition-all duration-[120ms] hover:border-[rgba(0,0,0,0.16)] hover:shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px"
              variant="default"
              onClick={() => onSelectMaterial(item)}
            >
              <Card.Header className="flex-row flex-wrap gap-2 p-0">
                <Chip size="sm" variant="secondary">{courseLabel}</Chip>
                <Chip size="sm" variant="secondary">{isZh ? `单元 ${item.unit}` : `Unit ${item.unit}`}</Chip>
                <Chip size="sm" variant="secondary">
                  {item.questionCount} {isZh ? "题" : "questions"}
                </Chip>
              </Card.Header>
              <Card.Content className="p-0 pt-3">
                <p className="line-clamp-2 text-[15px] font-medium leading-6 text-[#1D1D1F]">
                  {item.sourceAssessment}
                </p>
              </Card.Content>
            </Card>
          </div>
        )
      })}
    </div>
  )
}
