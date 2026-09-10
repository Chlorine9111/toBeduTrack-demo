"use client"

import { useState, useCallback, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  GripVertical,
  Trash2,
  ChevronDown,
  FileText,
  Loader2,
  Check,
  Award,
  Sparkles,
} from "lucide-react"
import { Button } from "@heroui/react"
import { DragDropProvider } from "@dnd-kit/react"
import { useSortable } from "@dnd-kit/react/sortable"
import { move } from "@dnd-kit/helpers"
import type { ExamQuestionData } from "@/lib/landing/mock-data"
import { DIFFICULTY_COLORS } from "@/lib/landing/mock-data"
import { useLanguage } from "@/lib/landing/i18n"
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages"
import { MathSpan } from "./MathSpan"

// --- Types ---

interface ExamPanelProps {
  visible: boolean
  loading?: boolean
  onInteracted?: () => void
  onExportComplete?: () => void
}

// --- Animation Variants ---

const panelVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
}

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const

const blockExitVariants = {
  initial: { opacity: 1, x: 0 },
  exit: {
    opacity: 0,
    x: 80,
    transition: { duration: 0.3, ease: EASE_CURVE },
  },
}

const expandVariants = {
  open: {
    height: "auto",
    opacity: 1,
    transition: { duration: 0.3, ease: EASE_CURVE },
  },
  collapsed: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.25, ease: EASE_CURVE },
  },
}

// --- Helpers ---

function deepCloneQuestions(
  questions: readonly ExamQuestionData[]
): ExamQuestionData[] {
  return questions.map((q) => ({
    ...q,
    options: q.options ? q.options.map((o) => ({ ...o })) : undefined,
    parts: q.parts
      ? q.parts.map((p) => ({ ...p }))
      : undefined,
  }))
}

function computeStats(questions: ExamQuestionData[]) {
  const mcCount = questions.filter((q) => q.type === "MC").length
  const frqCount = questions.filter((q) => q.type === "FRQ").length

  const difficultyCount: Record<string, number> = { Easy: 0, Medium: 0, Hard: 0 }
  for (const q of questions) {
    difficultyCount[q.difficulty] = (difficultyCount[q.difficulty] ?? 0) + 1
  }

  const coverageSet = new Set<string>()
  coverageSet.add("FUN-3.C")
  coverageSet.add("FUN-3.D")
  coverageSet.add("FUN-3.E")

  return { mcCount, frqCount, difficultyCount, coverage: Array.from(coverageSet) }
}

async function generatePdf(
  title: string,
  questions: ExamQuestionData[],
  includeAnswers: boolean,
  includeRubric: boolean
) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "mm", format: "letter" })

  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  let y = margin

  const addPageIfNeeded = (neededHeight: number) => {
    if (y + neededHeight > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage()
      y = margin
    }
  }

  // Title
  doc.setFontSize(18)
  doc.setFont("helvetica", "bold")
  doc.text(title, margin, y)
  y += 8

  doc.setFontSize(11)
  doc.setFont("helvetica", "normal")
  doc.text("Date: Feb 2026", margin, y)
  y += 4

  doc.setDrawColor(200)
  doc.line(margin, y, margin + contentWidth, y)
  y += 8

  // Questions
  questions.forEach((q, index) => {
    addPageIfNeeded(30)

    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")

    if (q.type === "MC") {
      doc.text(`Q${index + 1}. [MC - ${q.difficulty}]`, margin, y)
      y += 6

      doc.setFontSize(10)
      doc.setFont("helvetica", "normal")
      const questionLines = doc.splitTextToSize(q.fullQuestion, contentWidth)
      doc.text(questionLines, margin, y)
      y += questionLines.length * 5

      if (q.options) {
        for (const opt of q.options) {
          addPageIfNeeded(6)
          const prefix =
            includeAnswers && opt.label === q.correctAnswer ? `* ${opt.label})` : `  ${opt.label})`
          doc.text(`${prefix} ${opt.text}`, margin + 4, y)
          y += 5
        }
      }

      if (includeAnswers && q.correctAnswer) {
        addPageIfNeeded(10)
        doc.setFont("helvetica", "bold")
        doc.text(`Answer: ${q.correctAnswer}`, margin + 4, y)
        y += 5
        if (q.explanation) {
          doc.setFont("helvetica", "italic")
          const expLines = doc.splitTextToSize(q.explanation, contentWidth - 8)
          doc.text(expLines, margin + 4, y)
          y += expLines.length * 5
        }
      }
    } else {
      // FRQ
      doc.text(`Q${index + 1}. [FRQ - ${q.difficulty}] (${q.totalPoints} pts)`, margin, y)
      y += 6

      doc.setFontSize(10)
      doc.setFont("helvetica", "normal")
      const questionLines = doc.splitTextToSize(q.fullQuestion, contentWidth)
      doc.text(questionLines, margin, y)
      y += questionLines.length * 5 + 2

      if (q.parts) {
        for (const part of q.parts) {
          addPageIfNeeded(15)
          doc.setFont("helvetica", "bold")
          doc.text(`${part.label} (${part.points} pts)`, margin + 4, y)
          y += 5
          doc.setFont("helvetica", "normal")
          const descLines = doc.splitTextToSize(part.description, contentWidth - 12)
          doc.text(descLines, margin + 8, y)
          y += descLines.length * 5

          if (includeRubric && part.rubric) {
            addPageIfNeeded(10)
            doc.setFont("helvetica", "italic")
            doc.setTextColor(100)
            const rubricLines = doc.splitTextToSize(`Rubric: ${part.rubric}`, contentWidth - 12)
            doc.text(rubricLines, margin + 8, y)
            y += rubricLines.length * 5
            doc.setTextColor(0)
          }

          y += 2
        }
      }
    }

    y += 6
  })

  // Trigger download
  const blob = doc.output("blob")
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${title.replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "_")}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// --- SortableItem ---

interface SortableItemProps {
  question: ExamQuestionData
  index: number
  isExpanded: boolean
  onToggleExpand: () => void
  onDelete: () => void
  canDelete: boolean
  onInteracted?: () => void
}

function SortableItem({
  question,
  index,
  isExpanded,
  onToggleExpand,
  onDelete,
  canDelete,
  onInteracted,
}: SortableItemProps) {
  const { ref, handleRef, isDragging } = useSortable({ id: question.id, index })

  const { t } = useLanguage()

  const isFRQ = question.type === "FRQ"
  const diffColors = DIFFICULTY_COLORS[question.difficulty]

  return (
    <motion.div
      ref={ref}
      layout
      {...blockExitVariants}
      className={`group ${isDragging ? "z-50 relative" : ""}`}
    >
      <div
        className={`
          bg-white border rounded-xl shadow-xs hover:shadow-md transition-all duration-200
          ${isFRQ ? "border-slate-200/80 border-l-[3px] border-l-rose-400" : "border-slate-200/80"}
          ${isDragging ? "shadow-lg ring-2 ring-slate-300/50" : ""}
        `}
      >
        {/* Collapsed header */}
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Drag handle */}
          <button
            ref={handleRef}
            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing transition-opacity shrink-0"
            tabIndex={-1}
            aria-label="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </button>

          {/* Question number */}
          <div className={`w-8 h-8 rounded-lg ${isFRQ ? "bg-rose-50 text-rose-600 ring-1 ring-rose-200" : "bg-slate-100 text-slate-600"} font-bold text-sm flex items-center justify-center shrink-0`}>
            Q{index + 1}
          </div>

          {/* Body - clickable to expand */}
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex-1 flex items-center gap-3 text-left min-w-0"
          >
            <div className="flex-1 min-w-0">
              {isFRQ ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
                      <Award className="w-3 h-3" />
                      {t.examPanel.freeResponse}
                    </span>
                    <MathSpan
                      text={question.preview}
                      className="text-sm text-slate-700 truncate"
                    />
                  </div>
                  {question.parts && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {question.parts.map((part) => (
                        <span
                          key={part.label}
                          className="inline-flex items-center rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 border border-slate-200"
                        >
                          {part.label} {part.points}{t.examPanel.ptUnit}
                        </span>
                      ))}
                      <span className="text-[11px] text-slate-400 ml-1 tabular-nums">
                        {question.totalPoints} {t.examPanel.ptsTotal}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <MathSpan
                  text={question.preview}
                  className="text-sm text-slate-700 truncate block"
                />
              )}
            </div>

            {/* Difficulty badge */}
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border shrink-0 ${diffColors.bg} ${diffColors.text} ${diffColors.border}`}
            >
              {question.difficulty}
            </span>

            {/* Expand chevron */}
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            </motion.div>
          </button>

          {/* Delete button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (canDelete) {
                onDelete()
                onInteracted?.()
              }
            }}
            className={`opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all shrink-0 ${
              !canDelete ? "cursor-not-allowed" : ""
            }`}
            tabIndex={-1}
            aria-label="Delete question"
            disabled={!canDelete}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Expanded content */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              variants={expandVariants}
              initial="collapsed"
              animate="open"
              exit="collapsed"
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-1 border-t border-slate-100">
                {question.type === "MC" ? (
                  <MCExpandedContent question={question} />
                ) : (
                  <FRQExpandedContent question={question} />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// --- MC Expanded Content ---

function MCExpandedContent({ question }: { question: ExamQuestionData }) {
  const { t } = useLanguage()

  return (
    <div className="space-y-3 pt-2">
      <MathSpan
        text={question.fullQuestion}
        className="text-sm text-slate-700 leading-relaxed block"
      />

      {question.options && (
        <div className="space-y-2">
          {question.options.map((opt) => {
            const isCorrect = opt.label === question.correctAnswer
            return (
              <div
                key={opt.label}
                className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm border transition-colors ${
                  isCorrect
                    ? "bg-emerald-50/80 border-emerald-200 text-emerald-800"
                    : "bg-white border-slate-100 text-slate-600 hover:border-slate-200"
                }`}
              >
                <span
                  className={`font-bold shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                    isCorrect
                      ? "bg-emerald-200 text-emerald-800"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {opt.label}
                </span>
                <span className="flex-1 leading-relaxed">
                  <QuestionContentWithImages
                    content={opt.text}
                    className="inline"
                    textClassName="inline text-sm"
                    galleryClassName="mt-1"
                    imageClassName="max-h-[100px] object-scale-down"
                  />
                </span>
                {isCorrect && (
                  <div className="shrink-0 mt-0.5 ml-auto check-bounce">
                    <Check className="w-4 h-4 text-emerald-600" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {question.explanation && (
        <div className="rounded-xl bg-linear-to-br from-blue-50/80 to-indigo-50/40 border border-blue-100 px-3.5 py-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide">{t.examPanel.explanation}</p>
          </div>
          <MathSpan
            text={question.explanation}
            className="text-sm text-blue-800 leading-relaxed block"
          />
        </div>
      )}
    </div>
  )
}

// --- FRQ Expanded Content ---

function FRQExpandedContent({ question }: { question: ExamQuestionData }) {
  const { t } = useLanguage()

  return (
    <div className="space-y-3 pt-2">
      <MathSpan
        text={question.fullQuestion}
        className="text-sm text-slate-700 leading-relaxed block"
      />

      {question.parts && (
        <div className="space-y-3">
          {question.parts.map((part, idx) => (
            <motion.div
              key={part.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08, duration: 0.2 }}
              className="rounded-xl border border-slate-100 bg-slate-50/50 px-3.5 py-3 hover:border-slate-200 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 bg-white rounded-md px-2 py-0.5 border border-slate-200/80 shadow-xs">
                  {part.label}
                </span>
                <span className="text-[10px] font-semibold text-slate-400 bg-white rounded-full px-2 py-0.5 border border-slate-100 tabular-nums">
                  {part.points} {t.examPanel.ptsUnit}
                </span>
              </div>
              <MathSpan
                text={part.description}
                className="text-sm text-slate-600 leading-relaxed block"
              />
              <div className="mt-2.5 rounded-lg bg-linear-to-br from-amber-50/80 to-orange-50/40 border border-amber-100 px-3 py-2.5">
                <div className="flex items-center gap-1 mb-1">
                  <Award className="w-3 h-3 text-amber-600" />
                  <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
                    {t.examPanel.rubricLabel}
                  </p>
                </div>
                <MathSpan
                  text={part.rubric}
                  className="text-xs text-amber-800 leading-relaxed block"
                />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Toggle Checkbox ---

function ToggleCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none group/toggle">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`
          relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0
          ${checked ? "bg-slate-800" : "bg-slate-200"}
        `}
      >
        <span
          className={`
            absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-xs
            transition-transform duration-200
            ${checked ? "translate-x-4" : "translate-x-0"}
          `}
        />
      </button>
      <span className="text-sm text-slate-600 group-hover/toggle:text-slate-800 transition-colors">
        {label}
      </span>
    </label>
  )
}

// --- Main Component ---

export default function ExamPanel({
  visible,
  loading,
  onInteracted,
  onExportComplete,
}: ExamPanelProps) {
  const { t, examQuestions } = useLanguage()

  const [questions, setQuestions] = useState<ExamQuestionData[]>(() =>
    deepCloneQuestions(examQuestions)
  )
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [examTitle, setExamTitle] = useState(
    "AP Calculus AB \u2014 Unit 3 Chain Rule Quiz"
  )
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [includeAnswers, setIncludeAnswers] = useState(false)
  const [includeRubric, setIncludeRubric] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const titleInputRef = useRef<HTMLInputElement>(null)

  const stats = useMemo(() => computeStats(questions), [questions])

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  const handleDelete = useCallback(
    (id: string) => {
      setQuestions((prev) => {
        if (prev.length <= 1) return prev
        return prev.filter((q) => q.id !== id)
      })
      setExpandedId((prev) => (prev === id ? null : prev))
      onInteracted?.()
    },
    [onInteracted]
  )

  const handleTitleClick = useCallback(() => {
    setIsEditingTitle(true)
    setTimeout(() => titleInputRef.current?.focus(), 0)
  }, [])

  const handleTitleBlur = useCallback(() => {
    setIsEditingTitle(false)
    if (!examTitle.trim()) {
      setExamTitle(t.examPanel.defaultTitle)
    }
    onInteracted?.()
  }, [examTitle, onInteracted, t])

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.currentTarget.blur()
      }
    },
    []
  )

  const handleExport = useCallback(async () => {
    if (isExporting) return
    setIsExporting(true)

    // Simulated delay for realistic UX
    await new Promise((resolve) => setTimeout(resolve, 2000))

    try {
      await generatePdf(examTitle, questions, includeAnswers, includeRubric)
      onExportComplete?.()
    } catch {
      // PDF generation failed silently
    } finally {
      setIsExporting(false)
    }
  }, [isExporting, examTitle, questions, includeAnswers, includeRubric, onExportComplete])

  const totalPoints = useMemo(
    () => questions.reduce((sum, q) => sum + q.totalPoints, 0),
    [questions]
  )

  if (!visible) {
    const cls = loading ? "skeleton-line--active" : "skeleton-line"
    return (
      <div className="space-y-3 p-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="rounded-xl overflow-hidden"
          >
            <div
              className={`${cls} rounded-none`}
              style={{ height: i === 6 ? 72 : 52 }}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <motion.div
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col h-full"
    >
      {/* Exam header */}
      <div className="px-4 pt-3 pb-2">
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            value={examTitle}
            onChange={(e) => setExamTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            className="w-full font-display text-base font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-slate-400/40"
          />
        ) : (
          <button
            type="button"
            onClick={handleTitleClick}
            className="text-left w-full group/title"
          >
            <h3 className="font-display text-base font-bold text-slate-900 group-hover/title:text-slate-600 transition-colors">
              {examTitle}
            </h3>
          </button>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          <p className="text-xs text-slate-400">{t.examPanel.dateLabel}</p>
          <span className="text-slate-200">|</span>
          <p className="text-xs font-medium text-slate-500 tabular-nums">
            {totalPoints} {t.examPanel.pointsUnit}
          </p>
        </div>
      </div>

      {/* Scrollable question list */}
      <div className="flex-1 overflow-y-auto landing-scrollbar px-4 py-2 space-y-2.5">
        <DragDropProvider
          onDragEnd={(event) => {
            if (event.canceled) return
            const { source, target } = event.operation
            if (!target || source?.id === target.id) return
            setQuestions((prev) => move(prev, event))
            onInteracted?.()
          }}
        >
          <AnimatePresence mode="popLayout">
            {questions.map((q, index) => (
              <SortableItem
                key={q.id}
                question={q}
                index={index}
                isExpanded={expandedId === q.id}
                onToggleExpand={() => handleToggleExpand(q.id)}
                onDelete={() => handleDelete(q.id)}
                canDelete={questions.length > 1}
                onInteracted={onInteracted}
              />
            ))}
          </AnimatePresence>
        </DragDropProvider>
      </div>

      {/* Bottom stats bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.3 }}
        className="bg-white/80 backdrop-blur-sm border-t border-slate-200 px-4 py-2.5"
      >
        <div className="flex items-center gap-2 text-[11px] text-slate-500 leading-relaxed flex-wrap">
          <span className="font-semibold text-slate-700 bg-slate-50 rounded-md px-2 py-0.5 border border-slate-200/60">
            {stats.mcCount} {t.examPanel.mcLabel} + {stats.frqCount} {t.examPanel.frqLabel}
          </span>
          <span className="text-slate-200">|</span>
          {stats.difficultyCount.Easy > 0 && (
            <span className="text-emerald-600 font-medium">
              {stats.difficultyCount.Easy} {t.examPanel.easyLabel}
            </span>
          )}
          {stats.difficultyCount.Easy > 0 && stats.difficultyCount.Medium > 0 && (
            <span className="text-slate-200">&middot;</span>
          )}
          {stats.difficultyCount.Medium > 0 && (
            <span className="text-amber-600 font-medium">
              {stats.difficultyCount.Medium} {t.examPanel.medLabel}
            </span>
          )}
          {(stats.difficultyCount.Easy > 0 || stats.difficultyCount.Medium > 0) &&
            stats.difficultyCount.Hard > 0 && (
              <span className="text-slate-200">&middot;</span>
            )}
          {stats.difficultyCount.Hard > 0 && (
            <span className="text-rose-600 font-medium">
              {stats.difficultyCount.Hard} {t.examPanel.hardLabel}
            </span>
          )}
          <span className="text-slate-200">|</span>
          <span className="text-slate-400">
            {stats.coverage.join(", ")}
          </span>
        </div>
      </motion.div>

      {/* Export section */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.3 }}
        className="border-t border-slate-200 px-4 py-3 space-y-3"
      >
        <div className="flex items-center gap-6">
          <ToggleCheckbox
            checked={includeAnswers}
            onChange={setIncludeAnswers}
            label={t.examPanel.includeAnswerKey}
          />
          <ToggleCheckbox
            checked={includeRubric}
            onChange={setIncludeRubric}
            label={t.examPanel.includeRubric}
          />
        </div>

        <Button
          onPress={handleExport}
          isDisabled={isExporting}
          className="bg-slate-900 text-white px-6 py-2.5 font-medium text-sm inline-flex items-center gap-2"
        >
          {isExporting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t.examPanel.generating}
            </>
          ) : (
            <>
              <FileText className="w-4 h-4" />
              {t.examPanel.exportPdf}
            </>
          )}
        </Button>
      </motion.div>
    </motion.div>
  )
}
