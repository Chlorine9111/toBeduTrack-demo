"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { Button } from "@heroui/react"
import { Printer, Plus, Trash2, GripVertical } from "lucide-react"
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages"
import type { MockWorksheet, MockExercise } from "./types"

interface WorksheetPreviewProps {
  worksheet: MockWorksheet
  exercises: MockExercise[]
  isCompleted?: boolean
  pdfExporting?: string | null
  onAction?: (action: string) => void
  onChange?: (worksheet: MockWorksheet) => void
}

function findExercise(exerciseId: string, exercisesList: MockExercise[]): MockExercise | undefined {
  return exercisesList.find((ex) => ex.id === exerciseId)
}

function calcTotalPoints(worksheet: MockWorksheet) {
  return worksheet.sections.reduce(
    (sum, section) => sum + section.exerciseIds.length * section.pointsPerQuestion,
    0,
  )
}

export default function WorksheetPreview({
  worksheet,
  exercises,
  isCompleted = true,
  pdfExporting,
  onAction,
  onChange,
}: WorksheetPreviewProps) {
  const [draft, setDraft] = useState<MockWorksheet>(worksheet)
  const draggingQuestionRef = useRef<{ sectionId: string; index: number } | null>(null)

  useEffect(() => {
    setDraft(worksheet)
  }, [worksheet])

  const emitChange = useCallback(
    (next: MockWorksheet) => {
      const normalized = {
        ...next,
        totalPoints: calcTotalPoints(next),
      }
      setDraft(normalized)
      onChange?.(normalized)
    },
    [onChange],
  )

  const allExerciseIds = useMemo(() => exercises.map((item) => item.id), [exercises])

  const addSection = () => {
    const next = {
      ...draft,
      sections: [
        ...draft.sections,
        {
          id: `section-${Date.now()}`,
          title: `Part ${String.fromCharCode(65 + draft.sections.length)}: New Section`,
          instructions: "请补充本节说明。",
          exerciseIds: allExerciseIds.slice(0, 2),
          pointsPerQuestion: 5,
        },
      ],
    }
    emitChange(next)
  }

  const removeSection = (sectionId: string) => {
    if (draft.sections.length <= 1) return
    emitChange({
      ...draft,
      sections: draft.sections.filter((item) => item.id !== sectionId),
    })
  }

  const reorderQuestion = (sectionId: string, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    const next = {
      ...draft,
      sections: draft.sections.map((section) => {
        if (section.id !== sectionId) return section
        const nextIds = [...section.exerciseIds]
        const [moved] = nextIds.splice(fromIndex, 1)
        nextIds.splice(toIndex, 0, moved)
        return { ...section, exerciseIds: nextIds }
      }),
    }
    emitChange(next)
  }

  return (
    <div className="px-6 py-6">
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="mx-auto max-w-3xl rounded-sm border border-gray-200 bg-white shadow-lg"
        data-print-content
      >
        <div className="border-b border-gray-300 px-10 pb-6 pt-8 text-center">
          <p className="mb-1 text-xs uppercase tracking-widest text-gray-400">{draft.courseName}</p>
          <input
            value={draft.title}
            onChange={(e) => emitChange({ ...draft, title: e.target.value })}
            className="mx-auto block w-full max-w-xl border-0 bg-transparent text-center text-lg font-bold tracking-wide text-gray-900 outline-hidden"
          />
          <div className="mt-5 flex justify-between text-sm text-gray-500">
            <span>
              Name: <span className="inline-block w-44 border-b border-gray-400" />
            </span>
            <span>
              Date: <span className="inline-block w-32 border-b border-gray-400" />
            </span>
          </div>
        </div>

        <div className="space-y-6 px-10 py-6">
          {draft.sections.map((section, sectionIdx) => (
            <div key={section.id}>
              {sectionIdx > 0 && <div className="my-5 border-t-2 border-dashed border-gray-300" />}
              <div className="mb-2 flex items-center gap-2">
                <input
                  value={section.title}
                  onChange={(e) => {
                    emitChange({
                      ...draft,
                      sections: draft.sections.map((item) =>
                        item.id === section.id ? { ...item, title: e.target.value } : item,
                      ),
                    })
                  }}
                  className="h-8 flex-1 rounded-md border border-gray-200 px-2 text-sm font-bold text-gray-800 outline-hidden focus:border-gray-400"
                />
                <Button isIconOnly variant="ghost" onPress={() => removeSection(section.id)} className="h-8 w-8 min-w-0 text-red-600" data-print-hide>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <textarea
                value={section.instructions}
                onChange={(e) => {
                  emitChange({
                    ...draft,
                    sections: draft.sections.map((item) =>
                      item.id === section.id ? { ...item, instructions: e.target.value } : item,
                    ),
                  })
                }}
                rows={2}
                className="mb-3 w-full rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 outline-hidden focus:border-gray-400"
              />

              <div className="mb-2 flex items-center gap-2" data-print-hide>
                <span className="text-xs text-gray-500">每题分值</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={section.pointsPerQuestion}
                  onChange={(e) => {
                    const points = Math.max(1, Math.min(20, Number(e.target.value) || 1))
                    emitChange({
                      ...draft,
                      sections: draft.sections.map((item) =>
                        item.id === section.id ? { ...item, pointsPerQuestion: points } : item,
                      ),
                    })
                  }}
                  className="h-7 w-20 rounded-md border border-gray-200 px-2 text-xs outline-hidden focus:border-gray-400"
                />
              </div>

              <div className="space-y-3">
                {section.exerciseIds.map((eid, questionIndex) => {
                  const exercise = findExercise(eid, exercises)
                  if (!exercise) {
                    return (
                      <div key={eid} className="text-xs italic text-gray-300">
                        [题目缺失: {eid}]
                      </div>
                    )
                  }

                  return (
                    <div
                      key={`${section.id}-${eid}`}
                      draggable
                      onDragStart={() => {
                        draggingQuestionRef.current = { sectionId: section.id, index: questionIndex }
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        const dragging = draggingQuestionRef.current
                        draggingQuestionRef.current = null
                        if (!dragging) return
                        if (dragging.sectionId !== section.id) return
                        reorderQuestion(section.id, dragging.index, questionIndex)
                      }}
                      className="rounded-lg border border-gray-200 px-3 py-2"
                    >
                      <div className="mb-1 flex items-center gap-1 text-xs text-gray-400">
                        <GripVertical className="h-3.5 w-3.5 no-print" />
                        题目 {questionIndex + 1}
                      </div>
                      <QuestionContentWithImages
                        content={exercise.questionText}
                        textClassName="text-sm leading-relaxed text-gray-800"
                        galleryClassName="mt-2 grid gap-2"
                        figureClassName="bg-white"
                        imageClassName="max-h-[180px] w-full object-scale-down"
                      />
                      {exercise.type === "MC" && exercise.options && (
                        <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1 text-sm text-gray-600">
                          {exercise.options.map((opt) => (
                            <div key={opt.label}>
                              <span className="font-medium">{opt.label})</span>{" "}
                              <QuestionContentWithImages
                                content={opt.text}
                                className="inline"
                                textClassName="inline text-sm"
                                galleryClassName="mt-1"
                                imageClassName="max-h-[80px] object-scale-down"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      {exercise.type === "FR" && (
                        <div className={cn("mt-2 flex min-h-[90px] items-center justify-center rounded border border-dashed border-gray-300")}>
                          <span className="select-none text-[10px] text-gray-300">Answer Space</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="px-10 pb-8 pt-1">
          <div className="flex items-center justify-between border-t border-gray-300 pt-4">
            <span className="text-sm font-semibold text-gray-700">Total: {draft.totalPoints} points</span>
            <span className="text-xs text-gray-400">{draft.sections.length} sections</span>
          </div>
        </div>
      </motion.div>

      <div className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center gap-3" data-print-hide>
        <Button variant="secondary" onPress={addSection}>
          <Plus className="h-4 w-4" />
          添加分节
        </Button>
        {isCompleted && (
          <Button variant="secondary" size="sm" onPress={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            打印 / 导出 PDF
          </Button>
        )}
        <Button variant="secondary" onPress={() => onAction?.("save_worksheet")}>
          保存试卷
        </Button>
      </div>
    </div>
  )
}
