"use client"

import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "@/lib/utils"
import { Button, Chip, Spinner } from "@heroui/react"
import {
  ChevronDown,
  Pencil,
  Trash2,
  CheckCircle2,
  Circle,
  RefreshCcw,
  GripVertical,
  Save,
  X,
} from "lucide-react"
import type { MockExercise, FlowPhase, AiRewriteContext, CanvasSelection } from "./types"
import { DIFFICULTY_LABELS } from "./mock-data"
import MathText from "./MathText"
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages"
import DiffPreview from "./DiffPreview"

interface ExerciseCardProps {
  exercise: MockExercise
  index: number
  phase: FlowPhase
  isLast: boolean
  onEdit?: (id: string, updatedExercise: MockExercise) => void
  onDelete?: (id: string) => void
  onToggleAnswer?: (id: string) => void
  onRegenerate?: (id: string) => Promise<void>
  isSelected?: boolean
  onSelect?: (selection: CanvasSelection) => void
  rewriteContext?: AiRewriteContext | null
  onAcceptRewrite?: () => void
  onRejectRewrite?: () => void
}

const DIFFICULTY_COLORS: Record<number, string> = {
  1: "bg-green-50 text-green-700 border-green-200",
  2: "bg-amber-50 text-amber-700 border-amber-200",
  3: "bg-orange-50 text-orange-700 border-orange-200",
  4: "bg-red-50 text-red-700 border-red-200",
}

function normalizeOptions(exercise: MockExercise): NonNullable<MockExercise["options"]> {
  const source = Array.isArray(exercise.options) ? exercise.options : []
  const normalized = source
    .slice(0, 4)
    .map((item, index) => ({
      // Normalize to canonical A-D labels to avoid duplicate-key and radio-mapping issues.
      label: String.fromCharCode(65 + index),
      text: String(item.text ?? ""),
      isCorrect: Boolean(item.isCorrect),
    }))

  while (normalized.length < 4) {
    const label = String.fromCharCode(65 + normalized.length)
    normalized.push({ label, text: "", isCorrect: false })
  }

  const hasCorrect = normalized.some((item) => item.isCorrect)
  if (!hasCorrect) {
    const answer = String(exercise.correctAnswer ?? "").trim()
    const answerIndex = normalized.findIndex((item) => item.label === answer)
    normalized[Math.max(0, answerIndex)].isCorrect = true
  }

  return normalized
}

export default function ExerciseCard({
  exercise,
  index,
  phase,
  isLast,
  onEdit,
  onDelete,
  onToggleAnswer,
  onRegenerate,
  isSelected = false,
  onSelect,
  rewriteContext,
  onAcceptRewrite,
  onRejectRewrite,
}: ExerciseCardProps) {
  const [showSolution, setShowSolution] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<MockExercise>(exercise)
  const [regenerateLoading, setRegenerateLoading] = useState(false)
  const [errorText, setErrorText] = useState("")

  useEffect(() => {
    if (!isEditing) {
      setDraft(exercise)
      setErrorText("")
    }
  }, [exercise, isEditing])

  const isGeneratingLast = phase === "generating" && isLast

  const normalizedDraftOptions = useMemo(() => normalizeOptions(draft), [draft])

  const startEdit = () => {
    setDraft({
      ...exercise,
      options: exercise.type === "MC" ? normalizeOptions(exercise) : undefined,
    })
    setErrorText("")
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setDraft(exercise)
    setErrorText("")
    setIsEditing(false)
  }

  const saveEdit = () => {
    const trimmedQuestion = draft.questionText.trim()
    const trimmedSolution = draft.solutionSteps.trim()
    const nextDifficulty = Math.max(1, Math.min(4, Number(draft.difficulty) || 2)) as MockExercise["difficulty"]

    let options: NonNullable<MockExercise["options"]> | undefined
    let correctAnswer = draft.correctAnswer.trim()

    if (draft.type === "MC") {
      const prepared = normalizeOptions(draft).map((item) => ({
        ...item,
        text: item.text.trim(),
      }))
      const selectedLabel = prepared.find((item) => item.label === correctAnswer)?.label
      const fallbackLabel = prepared.find((item) => item.isCorrect)?.label ?? prepared[0]?.label ?? "A"
      correctAnswer = selectedLabel ?? fallbackLabel
      options = prepared.map((item) => ({
        ...item,
        isCorrect: item.label === correctAnswer,
      }))
    } else {
      options = undefined
    }

    const next: MockExercise = {
      ...draft,
      questionText: trimmedQuestion || draft.questionText,
      difficulty: nextDifficulty,
      options,
      correctAnswer: correctAnswer || draft.correctAnswer,
      solutionSteps: trimmedSolution || draft.solutionSteps,
    }

    setDraft(next)
    onEdit?.(exercise.id, next)
    setIsEditing(false)
    setErrorText("")
  }

  const handleRegenerate = async () => {
    if (!onRegenerate) return
    if (regenerateLoading) return
    setRegenerateLoading(true)
    setErrorText("")
    try {
      await onRegenerate(exercise.id)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "重生成失败")
    } finally {
      setRegenerateLoading(false)
    }
  }

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={cn(
        "relative rounded-xl border bg-white shadow-xs overflow-hidden transition-all duration-200",
        "hover:shadow-md",
        isSelected
          ? "border-indigo-400 ring-2 ring-indigo-400/30"
          : "border-gray-200",
        isGeneratingLast && "ring-2 ring-blue-400/50",
      )}
      onClick={(e) => {
        if (isEditing) return
        const target = e.target as HTMLElement
        if (target.closest("button") || target.closest("input") || target.closest("textarea") || target.closest("select")) return
        onSelect?.({ type: "exercise", itemId: exercise.id, label: `习题 #${index + 1}` })
      }}
      style={{ cursor: isEditing ? undefined : "pointer" }}
    >
      {isGeneratingLast && (
        <div className="absolute inset-0 rounded-xl animate-pulse bg-blue-50/30 pointer-events-none" />
      )}

      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700">
          <GripVertical className="h-4 w-4 text-gray-400" />
          #{index + 1}
        </span>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <select
              value={draft.difficulty}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  difficulty: Math.max(1, Math.min(4, Number(event.target.value) || 2)) as MockExercise["difficulty"],
                })
              }
              className="h-7 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value={1}>基础</option>
              <option value={2}>中等</option>
              <option value={3}>较难</option>
              <option value={4}>挑战</option>
            </select>
          ) : (
            <Chip size="sm" className={DIFFICULTY_COLORS[exercise.difficulty] ?? DIFFICULTY_COLORS[2]}>
              {DIFFICULTY_LABELS[exercise.difficulty] ?? "中等"}
            </Chip>
          )}

          <Chip color="accent" size="sm">
            {exercise.type}
          </Chip>
        </div>
      </div>

      <div className="px-5 py-4">
        {isEditing ? (
          <div className="rounded-xl border border-indigo-200 bg-white p-3 ring-2 ring-indigo-500/20">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">题干</label>
              <textarea
                rows={4}
                value={draft.questionText}
                onChange={(event) => setDraft({ ...draft, questionText: event.target.value })}
                className="w-full rounded-md border border-gray-200 p-3 text-sm text-gray-800 outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {draft.type === "MC" ? (
              <div className="mt-3 space-y-2">
                <div className="text-xs font-medium text-gray-600">选项（单选正确项）</div>
                {normalizedDraftOptions.map((option, optionIndex) => (
                  <div key={`${exercise.id}-option-${option.label}-${optionIndex}`} className="grid grid-cols-[26px_1fr_70px] items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500">{option.label})</span>
                    <input
                      value={option.text}
                      onChange={(event) => {
                        const next = normalizeOptions(draft)
                        next[optionIndex] = {
                          ...next[optionIndex],
                          text: event.target.value,
                        }
                        setDraft({
                          ...draft,
                          options: next,
                        })
                      }}
                      className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <label className="inline-flex items-center gap-1 text-xs text-gray-600">
                      <input
                        type="radio"
                        name={`exercise-correct-${exercise.id}`}
                        checked={option.label === draft.correctAnswer}
                        onChange={() => {
                          const next = normalizeOptions(draft).map((item) => ({
                            ...item,
                            isCorrect: item.label === option.label,
                          }))
                          setDraft({
                            ...draft,
                            options: next,
                            correctAnswer: option.label,
                          })
                        }}
                      />
                      正确
                    </label>
                  </div>
                ))}
                <div className="grid grid-cols-[72px_1fr] items-center gap-2">
                  <span className="text-xs font-medium text-gray-600">正确答案</span>
                  <input
                    value={draft.correctAnswer}
                    onChange={(event) => setDraft({ ...draft, correctAnswer: event.target.value })}
                    className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-gray-600">解析步骤</label>
              <textarea
                rows={4}
                value={draft.solutionSteps}
                onChange={(event) => setDraft({ ...draft, solutionSteps: event.target.value })}
                className="w-full rounded-md border border-gray-200 p-3 text-sm text-gray-800 outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="secondary" size="sm" onPress={cancelEdit}>
                <X className="h-3.5 w-3.5" />
                取消编辑
              </Button>
              <Button variant="primary" size="sm" onPress={saveEdit}>
                <Save className="h-3.5 w-3.5" />
                保存修改
              </Button>
            </div>
          </div>
        ) : (
          <>
            <QuestionContentWithImages
              content={exercise.questionText}
              textClassName="text-sm leading-relaxed text-gray-800"
              galleryClassName="mt-2 grid gap-2"
              figureClassName="bg-white"
              imageClassName="max-h-[220px] w-full object-scale-down"
            />

            {exercise.options && exercise.options.length > 0 && (
              <div className="mt-4 space-y-2">
                {exercise.options.map((opt, optIndex) => (
                  <div
                    key={`${exercise.id}-view-option-${opt.label}-${optIndex}`}
                    className={cn(
                      "flex items-start gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                      opt.isCorrect
                        ? "bg-emerald-50 text-emerald-800"
                        : "text-gray-600 hover:bg-gray-50",
                    )}
                  >
                    {opt.isCorrect ? (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 mt-0.5 text-gray-300 shrink-0" />
                    )}
                    <div className="flex-1">
                      <div className="font-medium">{opt.label})</div>
                      <QuestionContentWithImages
                        content={opt.text}
                        className="mt-1"
                        textClassName="text-sm"
                        galleryClassName="mt-1 grid gap-2"
                        figureClassName="bg-white"
                        imageClassName="max-h-[120px] w-full object-scale-down"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => {
                setShowSolution((prev) => !prev)
                onToggleAnswer?.(exercise.id)
              }}
              className="mt-4 flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              <motion.span
                animate={{ rotate: showSolution ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="inline-flex"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </motion.span>
              {showSolution ? "收起解析" : "展开解析"}
            </button>

            <AnimatePresence initial={false}>
              {showSolution && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700 leading-relaxed">
                    <MathText text={exercise.solutionSteps} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {!isEditing && (
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <Button variant="secondary" size="sm" onPress={handleRegenerate} isDisabled={regenerateLoading}>
            {regenerateLoading ? (
              <Spinner size="sm" className="w-3.5 h-3.5" />
            ) : (
              <RefreshCcw className="w-3.5 h-3.5" />
            )}
            {regenerateLoading ? "重新生成中..." : "重新生成"}
          </Button>
          <Button variant="secondary" size="sm" onPress={startEdit}>
            <Pencil className="w-3.5 h-3.5" />
            编辑
          </Button>
          <Button variant="secondary" size="sm" onPress={() => onDelete?.(exercise.id)} className="text-red-600 border-red-200">
            <Trash2 className="w-3.5 h-3.5" />
            删除
          </Button>
        </div>
      )}

      {!isEditing && rewriteContext?.status === "loading" && rewriteContext.result?.selection.itemId === exercise.id && (
        <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-3">
          <Spinner size="sm" />
          <span className="text-xs text-gray-500">AI 正在改写...</span>
        </div>
      )}

      {!isEditing && rewriteContext?.status === "preview" && rewriteContext.result?.selection.itemId === exercise.id && (
        <div className="border-t border-gray-100 px-5 py-3">
          <DiffPreview
            title="AI 改写预览"
            before={rewriteContext.result.beforeText}
            after={rewriteContext.result.afterText}
            onAccept={() => onAcceptRewrite?.()}
            onReject={() => onRejectRewrite?.()}
          />
        </div>
      )}

      {errorText && !isEditing ? (
        <div className="px-5 pb-3 -mt-1">
          <p className="text-xs text-red-600">{errorText}</p>
        </div>
      ) : null}
    </motion.div>
  )
}
