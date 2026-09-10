"use client"

import { BookOpen } from "lucide-react"
import type { TikuSearchResultRow } from "@/lib/tiku/types"
import TikuQuestionCard from "@/components/main/question-bank/tiku/TikuQuestionCard"
import QuestionGridSkeleton from "./QuestionCardSkeleton"

type QuestionGridProps = {
  items: TikuSearchResultRow[]
  loading: boolean
  error: string
  isSearchMode: boolean
  total: number
  query: string
  onSelectItem: (item: TikuSearchResultRow) => void
  emptyTitle: string
  emptyDescription: string
}

export default function QuestionGrid({
  items,
  loading,
  error,
  onSelectItem,
  emptyTitle,
  emptyDescription,
}: QuestionGridProps) {
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
          <BookOpen className="h-8 w-8 text-[#9B9DA4]" />
        </div>
        <h3 className="text-[16px] font-medium text-[#1D1D1F]">
          {emptyTitle}
        </h3>
        <p className="mt-2 max-w-md text-[13px] leading-6 text-[#6B6F76]">
          {emptyDescription}
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => (
        <div
          key={item.id}
          className="animate-qb-card-enter"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <TikuQuestionCard
            item={item}
            onSelectItem={onSelectItem}
          />
        </div>
      ))}
    </div>
  )
}
