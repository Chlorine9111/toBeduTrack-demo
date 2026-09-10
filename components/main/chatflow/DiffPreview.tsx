"use client"

import { useMemo } from "react"
import { Button } from "@heroui/react"
import MathText from "./MathText"

interface DiffPreviewProps {
  before: string
  after: string
  onAccept: () => void
  onReject: () => void
  title?: string
}

interface DiffLine {
  type: "unchanged" | "removed" | "added"
  text: string
}

/** 逐行比较 before/after，生成 diff 行列表 */
function computeLineDiff(before: string, after: string): DiffLine[] {
  const bLines = before.split("\n")
  const aLines = after.split("\n")
  const result: DiffLine[] = []

  const maxLen = Math.max(bLines.length, aLines.length)
  for (let i = 0; i < maxLen; i++) {
    const bLine = i < bLines.length ? bLines[i] : undefined
    const aLine = i < aLines.length ? aLines[i] : undefined

    if (bLine === aLine) {
      result.push({ type: "unchanged", text: bLine! })
    } else {
      if (bLine !== undefined) result.push({ type: "removed", text: bLine })
      if (aLine !== undefined) result.push({ type: "added", text: aLine })
    }
  }

  return result
}

/** 渲染一行带 LaTeX 的文本 */
function MathLine({ text }: { text: string }) {
  if (!text.trim()) return <br />
  return <MathText text={text} />
}

export default function DiffPreview({
  before,
  after,
  onAccept,
  onReject,
  title = "改写预览",
}: DiffPreviewProps) {
  const diffLines = useMemo(() => computeLineDiff(before, after), [before, after])

  const hasChanges = diffLines.some((l) => l.type !== "unchanged")
  const changedCount = diffLines.filter((l) => l.type !== "unchanged").length

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
        <span className="text-xs font-semibold text-gray-700">{title}</span>
        {hasChanges && (
          <span className="text-[11px] text-gray-400">
            {changedCount} 处变更
          </span>
        )}
      </div>

      <div className="space-y-0.5 px-4 py-3">
        {diffLines.map((line, i) => {
          if (line.type === "unchanged") {
            return (
              <div key={i} className="py-0.5 pl-3 text-sm leading-relaxed text-gray-400">
                <MathLine text={line.text} />
              </div>
            )
          }
          if (line.type === "removed") {
            return (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md border border-red-100 bg-red-50/60 px-3 py-1.5"
              >
                <span className="mt-0.5 shrink-0 text-xs font-bold text-red-400">−</span>
                <div className="text-sm leading-relaxed text-red-700 line-through">
                  <MathLine text={line.text} />
                </div>
              </div>
            )
          }
          return (
            <div
              key={i}
              className="flex items-start gap-2 rounded-md border border-green-100 bg-green-50/60 px-3 py-1.5"
            >
              <span className="mt-0.5 shrink-0 text-xs font-bold text-green-500">+</span>
              <div className="text-sm leading-relaxed text-green-800 font-medium">
                <MathLine text={line.text} />
              </div>
            </div>
          )
        })}
      </div>

      {!hasChanges && (
        <div className="px-4 pb-3 text-sm text-gray-400">
          修改前后内容相同，无差异。
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-2">
        <Button variant="secondary" size="sm" onPress={onReject}>
          撤销
        </Button>
        <Button variant="primary" size="sm" onPress={onAccept} className="bg-green-600 hover:bg-green-700">
          采纳改写
        </Button>
      </div>
    </div>
  )
}
