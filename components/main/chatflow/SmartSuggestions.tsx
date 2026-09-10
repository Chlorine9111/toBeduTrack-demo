"use client"

import { Button } from "@heroui/react"
import { cn } from "@/lib/utils"

interface SmartSuggestionsProps {
  suggestions: string[]
  onSuggestionClick: (text: string) => void
}

const SUGGESTION_ICONS: Record<string, string> = {
  "保存": "💾",
  "导出": "📄",
  "Rubric": "📊",
  "rubric": "📊",
  "再来": "🔄",
  "更多": "🔄",
  "修改": "✏️",
  "PDF": "📄",
  "pdf": "📄",
  "教案": "📖",
  "备课": "📖",
  "筛选": "👆",
  "练习卷": "📋",
  "Worksheet": "📋",
  "分享": "🌐",
  "社区": "🌐",
}

function getIcon(text: string): string {
  for (const [keyword, icon] of Object.entries(SUGGESTION_ICONS)) {
    if (text.includes(keyword)) return icon
  }
  return "💡"
}

export default function SmartSuggestions({
  suggestions,
  onSuggestionClick,
}: SmartSuggestionsProps) {
  if (suggestions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 py-2 px-1">
      {suggestions.map((text) => (
        <Button
          key={text}
          variant="secondary"
          onPress={() => onSuggestionClick(text)}
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium"
        >
          <span className="text-base leading-none">{getIcon(text)}</span>
          {text}
        </Button>
      ))}
    </div>
  )
}
