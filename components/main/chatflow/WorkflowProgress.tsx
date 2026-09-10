"use client"

import { ProgressBar } from "@heroui/react"

interface WorkflowProgressProps {
  current: number
  total: number
  label: string
}

export default function WorkflowProgress({
  current,
  total,
  label,
}: WorkflowProgressProps) {
  const percentage = total > 0 ? (current / total) * 100 : 0

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-sm shrink-0">{label}</span>
      <ProgressBar
        aria-label={label}
        value={percentage}
        className="flex-1"
      />
      <span className="text-xs text-gray-500 tabular-nums shrink-0">
        {current}/{total}
      </span>
    </div>
  )
}
