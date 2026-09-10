"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@heroui/react"
import { cn } from "@/lib/utils"
import MathText from "@/components/main/chatflow/MathText"
import EditableList from "@/components/main/chatflow/EditableList"
import type { LessonPlanBlock, LessonPlanPreferences } from "@/lib/lesson-plan/types"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Lightbulb,
  Link2,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react"

type EditableOption = {
  id: string
  text: string
}

type Props = {
  block: LessonPlanBlock
  preferences: LessonPlanPreferences
  editingBlockId?: string | null
  onRequestEdit?: (blockId: string | null) => void
  onBlockChange?: (blockId: string, newContent: Record<string, unknown>) => void
}

function contentString(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.map(contentString).filter(Boolean).join("\n")
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(contentString).filter(Boolean).join("\n")
  }
  return ""
}

function wrapLatex(latex: string, displayMode: boolean) {
  const trimmed = latex.trim()
  if (!trimmed) return ""
  if (
    trimmed.startsWith("$$") ||
    trimmed.startsWith("$") ||
    trimmed.startsWith("\\[") ||
    trimmed.startsWith("\\(")
  ) {
    return trimmed
  }
  return displayMode ? `$$${trimmed}$$` : `$${trimmed}$`
}

function calloutStyle(subtype?: string) {
  switch (subtype) {
    case "warning":
      return {
        icon: AlertTriangle,
        border: "border-amber-200",
        bg: "bg-amber-50",
        text: "text-amber-800",
        iconColor: "text-amber-600",
      }
    case "misconception":
      return {
        icon: XCircle,
        border: "border-red-200",
        bg: "bg-red-50",
        text: "text-red-800",
        iconColor: "text-red-600",
      }
    case "connection":
      return {
        icon: Link2,
        border: "border-emerald-200",
        bg: "bg-emerald-50",
        text: "text-emerald-800",
        iconColor: "text-emerald-600",
      }
    default:
      return {
        icon: Lightbulb,
        border: "border-indigo-200",
        bg: "bg-indigo-50",
        text: "text-indigo-800",
        iconColor: "text-indigo-600",
      }
  }
}

function toEditableOptions(raw: unknown): EditableOption[] {
  if (!Array.isArray(raw)) {
    return [
      { id: "A", text: "" },
      { id: "B", text: "" },
    ]
  }
  const options = raw.map((item, index) => {
    if (!item || typeof item !== "object") {
      return {
        id: String.fromCharCode(65 + index),
        text: String(item ?? ""),
      }
    }
    const next = item as { id?: unknown; text?: unknown; label?: unknown; value?: unknown }
    return {
      id: String(next.id ?? next.label ?? String.fromCharCode(65 + index)),
      text: String(next.text ?? next.value ?? ""),
    }
  })
  return options.length > 0 ? options : [{ id: "A", text: "" }]
}

function nextOptionId(options: EditableOption[]) {
  const used = new Set(options.map((item) => item.id.toUpperCase()))
  for (let i = 0; i < 26; i += 1) {
    const candidate = String.fromCharCode(65 + i)
    if (!used.has(candidate)) return candidate
  }
  return `OPT_${options.length + 1}`
}

function sanitizeOptionText(raw: unknown) {
  return String(raw ?? "").trim()
}

function normalizeContentForSave(
  block: LessonPlanBlock,
  draft: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    block.content && typeof block.content === "object" && !Array.isArray(block.content)
      ? { ...block.content }
      : {}
  if (block.type === "heading") {
    return {
      ...base,
      text: String(draft.text ?? "").trim() || "未命名标题",
      level: String(draft.level ?? "h2").toLowerCase() === "h3" ? "h3" : "h2",
    }
  }
  if (block.type === "paragraph") {
    return {
      ...base,
      text: String(draft.text ?? "").trim(),
    }
  }
  if (block.type === "math") {
    return {
      ...base,
      latex: String(draft.latex ?? "").trim(),
      displayMode: Boolean(draft.displayMode ?? true),
    }
  }
  if (block.type === "callout") {
    return {
      ...base,
      title: String(draft.title ?? "").trim(),
      text: String(draft.text ?? "").trim(),
    }
  }
  if (block.type === "definition") {
    return {
      ...base,
      term: String(draft.term ?? "").trim(),
      explanation: String(draft.explanation ?? "").trim(),
    }
  }
  if (block.type === "example") {
    const steps = (Array.isArray(draft.steps) ? draft.steps : [])
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0)
    return {
      ...base,
      prompt: String(draft.prompt ?? "").trim(),
      steps,
    }
  }
  if (block.type === "steps") {
    const items = (Array.isArray(draft.items) ? draft.items : [])
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0)
    return {
      ...base,
      title: String(draft.title ?? "").trim(),
      items,
    }
  }
  if (block.type === "quiz") {
    const options = toEditableOptions(draft.options).map((option, index) => ({
      id: String(option.id).trim() || String.fromCharCode(65 + index),
      text: sanitizeOptionText(option.text),
    }))
    const nonEmptyOptions = options.filter((option) => option.text.length > 0)
    const safeOptions = nonEmptyOptions.length > 0 ? nonEmptyOptions : options.slice(0, 1)
    const draftCorrect = String(draft.correctOptionId ?? "")
    const fallbackCorrect = safeOptions[0]?.id ?? "A"
    const correctOptionId = safeOptions.some((item) => item.id === draftCorrect)
      ? draftCorrect
      : fallbackCorrect
    return {
      ...base,
      question: String(draft.question ?? "").trim(),
      options: safeOptions,
      correctOptionId,
      explanation: String(draft.explanation ?? "").trim(),
    }
  }
  if (block.type === "poll") {
    const options = toEditableOptions(draft.options)
      .map((option, index) => ({
        id: String(option.id).trim() || String.fromCharCode(65 + index),
        text: sanitizeOptionText(option.text),
      }))
      .filter((option) => option.text.length > 0)
    return {
      ...base,
      question: String(draft.question ?? "").trim(),
      options: options.length > 0 ? options : [{ id: "A", text: "" }],
    }
  }
  if (block.type === "image") {
    return {
      ...base,
      url: String(draft.url ?? "").trim(),
      alt: String(draft.alt ?? "").trim(),
      caption: String(draft.caption ?? "").trim(),
    }
  }
  return base
}

function buildDraft(block: LessonPlanBlock): Record<string, unknown> {
  const content =
    block.content && typeof block.content === "object" && !Array.isArray(block.content)
      ? block.content
      : {}
  if (block.type === "heading") {
    return {
      text: String(content.text ?? ""),
      level: String(content.level ?? "h2").toLowerCase() === "h3" ? "h3" : "h2",
    }
  }
  if (block.type === "paragraph") {
    return { text: String(content.text ?? "") }
  }
  if (block.type === "math") {
    return {
      latex: String(content.latex ?? ""),
      displayMode: Boolean(content.displayMode ?? true),
    }
  }
  if (block.type === "callout") {
    return {
      title: String(content.title ?? ""),
      text: String(content.text ?? ""),
    }
  }
  if (block.type === "definition") {
    return {
      term: String(content.term ?? ""),
      explanation: String(content.explanation ?? ""),
    }
  }
  if (block.type === "example") {
    return {
      prompt: String(content.prompt ?? ""),
      steps: Array.isArray(content.steps) ? content.steps.map((item) => String(item ?? "")) : [],
    }
  }
  if (block.type === "steps") {
    return {
      title: String(content.title ?? ""),
      items: Array.isArray(content.items) ? content.items.map((item) => String(item ?? "")) : [],
    }
  }
  if (block.type === "quiz") {
    return {
      question: String(content.question ?? ""),
      options: toEditableOptions(content.options),
      correctOptionId: String(content.correctOptionId ?? ""),
      explanation: String(content.explanation ?? ""),
    }
  }
  if (block.type === "poll") {
    return {
      question: String(content.question ?? ""),
      options: toEditableOptions(content.options),
    }
  }
  if (block.type === "image") {
    return {
      url: String(content.url ?? ""),
      alt: String(content.alt ?? ""),
      caption: String(content.caption ?? ""),
    }
  }
  return { ...content }
}

function BlockMeta({ block, preferences }: { block: LessonPlanBlock; preferences: LessonPlanPreferences }) {
  const showCedCodes = false
  const showTeacherNote = preferences.includeTeacherNotes && Boolean(block.teacherNote?.trim())
  if (!showCedCodes && !showTeacherNote) return null

  return (
    <div className="mt-2 space-y-2">
      {showTeacherNote ? (
        <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            教师备注
          </div>
          <MathText text={String(block.teacherNote ?? "")} className="whitespace-pre-wrap" />
        </div>
      ) : null}
    </div>
  )
}

function OptionEditor({
  options,
  onChange,
  withAnswerPicker = false,
  correctOptionId,
  onCorrectOptionChange,
}: {
  options: EditableOption[]
  onChange: (options: EditableOption[]) => void
  withAnswerPicker?: boolean
  correctOptionId?: string
  onCorrectOptionChange?: (optionId: string) => void
}) {
  const updateOption = (index: number, value: Partial<EditableOption>) => {
    const next = [...options]
    next[index] = {
      ...next[index],
      ...value,
    }
    onChange(next)
  }

  const removeOption = (index: number) => {
    const next = options.filter((_, currentIndex) => currentIndex !== index)
    onChange(next.length > 0 ? next : [{ id: "A", text: "" }])
  }

  const addOption = () => {
    onChange([
      ...options,
      { id: nextOptionId(options), text: "" },
    ])
  }

  return (
    <div className="space-y-2">
      {options.map((option, index) => (
        <div key={`${option.id}-${index}`} className="grid grid-cols-[auto_52px_1fr_auto] items-center gap-2">
          {withAnswerPicker ? (
            <input
              type="radio"
              name="quiz-correct-option"
              checked={correctOptionId === option.id}
              onChange={() => onCorrectOptionChange?.(option.id)}
              className="h-4 w-4 accent-indigo-600"
            />
          ) : (
            <span className="h-4 w-4" />
          )}
          <input
            value={option.id}
            onChange={(event) => updateOption(index, { id: event.target.value })}
            placeholder="ID"
            className="h-9 rounded-md border border-gray-200 px-2 text-xs font-medium uppercase outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
          />
          <input
            value={option.text}
            onChange={(event) => updateOption(index, { text: event.target.value })}
            placeholder="请输入选项内容"
            className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
          />
          <Button isIconOnly variant="ghost" onPress={() => removeOption(index)} className="h-8 w-8 min-w-0">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onPress={addOption}>
        <Plus className="h-3.5 w-3.5" />
        添加选项
      </Button>
    </div>
  )
}

export default function LessonPlanBlockView({
  block,
  preferences,
  editingBlockId,
  onRequestEdit,
  onBlockChange,
}: Props) {
  const isControlled = editingBlockId !== undefined
  const [internalEditing, setInternalEditing] = useState(false)
  const [showAnswer, setShowAnswer] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown>>(() => buildDraft(block))

  const isEditing = isControlled ? editingBlockId === block.id : internalEditing
  const canEdit = block.type !== "divider"

  useEffect(() => {
    if (!isEditing) {
      setDraft(buildDraft(block))
    }
  }, [block, isEditing])

  useEffect(() => {
    if (!isEditing) return
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (isControlled) {
        onRequestEdit?.(null)
      } else {
        setInternalEditing(false)
      }
      setDraft(buildDraft(block))
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [block, isControlled, isEditing, onRequestEdit])

  const requestEdit = () => {
    if (!canEdit) return
    setDraft(buildDraft(block))
    if (isControlled) {
      onRequestEdit?.(block.id)
    } else {
      setInternalEditing(true)
    }
  }

  const cancelEdit = () => {
    setDraft(buildDraft(block))
    if (isControlled) {
      onRequestEdit?.(null)
    } else {
      setInternalEditing(false)
    }
  }

  const saveEdit = () => {
    const nextContent = normalizeContentForSave(block, draft)
    onBlockChange?.(block.id, nextContent)
    if (isControlled) {
      onRequestEdit?.(null)
    } else {
      setInternalEditing(false)
    }
  }

  const body = useMemo(() => {
    if (block.type === "heading") {
      const level = String((block.content.level as string) ?? "h2").toLowerCase() === "h3" ? "h3" : "h2"
      const text = String(block.content.text ?? "")
      return level === "h3" ? (
        <h4 className="text-sm font-semibold text-gray-900">
          <MathText text={text} />
        </h4>
      ) : (
        <h3 className="text-base font-semibold text-gray-900">
          <MathText text={text} />
        </h3>
      )
    }

    if (block.type === "paragraph") {
      const text = String(block.content.text ?? "")
      return (
        <p className="text-xs leading-relaxed text-gray-700 whitespace-pre-wrap">
          <MathText text={text} />
        </p>
      )
    }

    if (block.type === "math") {
      const latex = String(block.content.latex ?? "")
      const displayMode = Boolean(block.content.displayMode ?? true)
      const wrapped = wrapLatex(latex, displayMode)
      return (
        <div className={cn(displayMode ? "flex justify-center py-1" : "text-xs text-gray-800")}>
          <MathText text={wrapped || latex} />
        </div>
      )
    }

    if (block.type === "image") {
      const url = String(block.content.url ?? "")
      const alt = String(block.content.alt ?? "")
      const caption = String(block.content.caption ?? "")
      return (
        <figure className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={alt}
            className="w-full rounded-md border border-slate-200 bg-white object-contain"
            loading="lazy"
          />
          {caption ? (
            <figcaption className="text-[11px] text-slate-500">
              <MathText text={caption} />
            </figcaption>
          ) : null}
        </figure>
      )
    }

    if (block.type === "callout") {
      const title = String(block.content.title ?? "提示")
      const text = String(block.content.text ?? "")
      const style = calloutStyle(block.subtype)
      const Icon = style.icon
      return (
        <div className={cn("rounded-lg border p-3", style.border, style.bg)}>
          <div className={cn("flex items-center gap-2 text-xs font-semibold", style.text)}>
            <Icon className={cn("h-4 w-4", style.iconColor)} />
            <MathText text={title} />
          </div>
          {text ? (
            <div className={cn("mt-1 text-xs leading-relaxed whitespace-pre-wrap", style.text)}>
              <MathText text={text} />
            </div>
          ) : null}
        </div>
      )
    }

    if (block.type === "divider") {
      return <hr className="border-slate-200" />
    }

    if (block.type === "definition") {
      const term = String(block.content.term ?? "")
      const explanation = String(block.content.explanation ?? "")
      return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-900">
            <MathText text={term} />
          </div>
          {explanation ? (
            <div className="mt-1 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
              <MathText text={explanation} />
            </div>
          ) : null}
        </div>
      )
    }

    if (block.type === "example") {
      const prompt = String(block.content.prompt ?? "")
      const steps = Array.isArray(block.content.steps) ? (block.content.steps as unknown[]) : []
      return (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-900">
            <MathText text={prompt} />
          </div>
          {steps.length > 0 ? (
            <ol className="mt-2 ml-4 list-decimal space-y-1 text-xs text-slate-700">
              {steps.map((item, idx) => (
                <li key={idx} className="leading-relaxed whitespace-pre-wrap">
                  <MathText text={String(item ?? "")} />
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      )
    }

    if (block.type === "steps") {
      const title = String(block.content.title ?? "步骤")
      const items = Array.isArray(block.content.items) ? (block.content.items as unknown[]) : []
      return (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-900">
            <MathText text={title} />
          </div>
          {items.length > 0 ? (
            <ol className="mt-2 ml-4 list-decimal space-y-1 text-xs text-slate-700">
              {items.map((item, idx) => (
                <li key={idx} className="leading-relaxed whitespace-pre-wrap">
                  <MathText text={String(item ?? "")} />
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      )
    }

    if (block.type === "quiz") {
      const question = String(block.content.question ?? "")
      const options = Array.isArray(block.content.options) ? (block.content.options as Array<{ id?: unknown; text?: unknown }>) : []
      const correctOptionId = String(block.content.correctOptionId ?? "")
      const explanation = String(block.content.explanation ?? "")
      return (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-900">
            <MathText text={question} />
          </div>
          {options.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-slate-700">
              {options.map((opt, idx) => {
                const id = String(opt.id ?? "")
                const text = String(opt.text ?? "")
                const isCorrect = showAnswer && id && id === correctOptionId
                return (
                  <li
                    key={`${id || "opt"}-${idx}`}
                    className={cn(
                      "rounded-md border px-2 py-1 leading-relaxed",
                      isCorrect ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50",
                    )}
                  >
                    <span className="mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded bg-white text-[11px] font-semibold text-slate-600">
                      {id || String.fromCharCode(65 + idx)}
                    </span>
                    <MathText text={text} />
                  </li>
                )
              })}
            </ul>
          ) : null}
          <div className="mt-2 flex items-center justify-end">
            <button
              type="button"
              onClick={() => setShowAnswer((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800"
              aria-expanded={showAnswer}
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", showAnswer ? "rotate-180" : undefined)}
                aria-hidden="true"
              />
              {showAnswer ? "收起答案" : "显示答案"}
            </button>
          </div>
          {showAnswer && explanation ? (
            <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 whitespace-pre-wrap">
              <div className="mb-1 text-[11px] font-semibold text-slate-600">解析</div>
              <MathText text={explanation} />
            </div>
          ) : null}
        </div>
      )
    }

    if (block.type === "poll") {
      const question = String(block.content.question ?? "")
      const options = Array.isArray(block.content.options) ? (block.content.options as Array<{ id?: unknown; text?: unknown }>) : []
      return (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-900">
            <MathText text={question} />
          </div>
          {options.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-slate-700">
              {options.map((opt, idx) => {
                const id = String(opt.id ?? "")
                const text = String(opt.text ?? "")
                return (
                  <li key={`${id || "opt"}-${idx}`} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 leading-relaxed">
                    <span className="mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded bg-white text-[11px] font-semibold text-slate-600">
                      {id || String.fromCharCode(65 + idx)}
                    </span>
                    <MathText text={text} />
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      )
    }

    return (
      <pre className="whitespace-pre-wrap text-xs text-slate-700">{contentString(block.content) || "（空内容）"}</pre>
    )
  }, [block, showAnswer])

  const renderEditForm = () => {
    if (block.type === "heading") {
      return (
        <div className="space-y-3">
          <input
            value={String(draft.text ?? "")}
            onChange={(event) => setDraft((prev) => ({ ...prev, text: event.target.value }))}
            placeholder="请输入标题"
            className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
          />
          <select
            value={String(draft.level ?? "h2")}
            onChange={(event) => setDraft((prev) => ({ ...prev, level: event.target.value }))}
            className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="h2">h2</option>
            <option value="h3">h3</option>
          </select>
        </div>
      )
    }
    if (block.type === "paragraph") {
      return (
        <textarea
          rows={5}
          value={String(draft.text ?? "")}
          onChange={(event) => setDraft((prev) => ({ ...prev, text: event.target.value }))}
          placeholder="请输入段落内容"
          className="w-full rounded-md border border-gray-200 p-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
        />
      )
    }
    if (block.type === "math") {
      return (
        <textarea
          rows={5}
          value={String(draft.latex ?? "")}
          onChange={(event) => setDraft((prev) => ({ ...prev, latex: event.target.value }))}
          placeholder="请输入 LaTeX 公式"
          className="w-full rounded-md border border-gray-200 p-3 font-mono text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
        />
      )
    }
    if (block.type === "callout") {
      return (
        <div className="space-y-3">
          <input
            value={String(draft.title ?? "")}
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="提示标题"
            className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
          />
          <textarea
            rows={4}
            value={String(draft.text ?? "")}
            onChange={(event) => setDraft((prev) => ({ ...prev, text: event.target.value }))}
            placeholder="提示内容"
            className="w-full rounded-md border border-gray-200 p-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      )
    }
    if (block.type === "definition") {
      return (
        <div className="space-y-3">
          <input
            value={String(draft.term ?? "")}
            onChange={(event) => setDraft((prev) => ({ ...prev, term: event.target.value }))}
            placeholder="术语"
            className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
          />
          <textarea
            rows={4}
            value={String(draft.explanation ?? "")}
            onChange={(event) => setDraft((prev) => ({ ...prev, explanation: event.target.value }))}
            placeholder="解释说明"
            className="w-full rounded-md border border-gray-200 p-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      )
    }
    if (block.type === "example") {
      return (
        <div className="space-y-3">
          <input
            value={String(draft.prompt ?? "")}
            onChange={(event) => setDraft((prev) => ({ ...prev, prompt: event.target.value }))}
            placeholder="例题题干"
            className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
          />
          <EditableList
            items={Array.isArray(draft.steps) ? draft.steps.map((item) => String(item ?? "")) : []}
            onChange={(items) => setDraft((prev) => ({ ...prev, steps: items }))}
            addLabel="+ 添加步骤"
            inputPlaceholder="请输入推导步骤"
          />
        </div>
      )
    }
    if (block.type === "steps") {
      return (
        <div className="space-y-3">
          <input
            value={String(draft.title ?? "")}
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="步骤标题"
            className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
          />
          <EditableList
            items={Array.isArray(draft.items) ? draft.items.map((item) => String(item ?? "")) : []}
            onChange={(items) => setDraft((prev) => ({ ...prev, items }))}
            addLabel="+ 添加条目"
            inputPlaceholder="请输入步骤条目"
          />
        </div>
      )
    }
    if (block.type === "quiz") {
      return (
        <div className="space-y-3">
          <input
            value={String(draft.question ?? "")}
            onChange={(event) => setDraft((prev) => ({ ...prev, question: event.target.value }))}
            placeholder="题干"
            className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
          />
          <OptionEditor
            options={toEditableOptions(draft.options)}
            onChange={(options) => setDraft((prev) => ({ ...prev, options }))}
            withAnswerPicker
            correctOptionId={String(draft.correctOptionId ?? "")}
            onCorrectOptionChange={(optionId) => setDraft((prev) => ({ ...prev, correctOptionId: optionId }))}
          />
          <textarea
            rows={4}
            value={String(draft.explanation ?? "")}
            onChange={(event) => setDraft((prev) => ({ ...prev, explanation: event.target.value }))}
            placeholder="解析"
            className="w-full rounded-md border border-gray-200 p-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      )
    }
    if (block.type === "poll") {
      return (
        <div className="space-y-3">
          <input
            value={String(draft.question ?? "")}
            onChange={(event) => setDraft((prev) => ({ ...prev, question: event.target.value }))}
            placeholder="问题"
            className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
          />
          <OptionEditor
            options={toEditableOptions(draft.options)}
            onChange={(options) => setDraft((prev) => ({ ...prev, options }))}
          />
        </div>
      )
    }
    if (block.type === "image") {
      return (
        <div className="space-y-3">
          <input
            value={String(draft.url ?? "")}
            onChange={(event) => setDraft((prev) => ({ ...prev, url: event.target.value }))}
            placeholder="图片 URL"
            className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
          />
          <input
            value={String(draft.alt ?? "")}
            onChange={(event) => setDraft((prev) => ({ ...prev, alt: event.target.value }))}
            placeholder="图片 alt"
            className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
          />
          <input
            value={String(draft.caption ?? "")}
            onChange={(event) => setDraft((prev) => ({ ...prev, caption: event.target.value }))}
            placeholder="图片说明"
            className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      )
    }
    return (
      <textarea
        rows={5}
        value={contentString(draft)}
        onChange={(event) => setDraft({ text: event.target.value })}
        className="w-full rounded-md border border-gray-200 p-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
      />
    )
  }

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white/70 p-3"
      onDoubleClick={requestEdit}
      role={canEdit ? "button" : undefined}
      tabIndex={canEdit ? 0 : -1}
      onKeyDown={(event) => {
        if (!canEdit || isEditing) return
        if (event.key !== "Enter") return
        requestEdit()
      }}
    >
      {!isEditing ? (
        <>
          {body}
          <BlockMeta block={block} preferences={preferences} />
        </>
      ) : (
        <div className="rounded-xl border border-indigo-200 ring-2 ring-indigo-500/20 bg-white p-3">
          {renderEditForm()}
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onPress={cancelEdit}>
              取消
            </Button>
            <Button variant="primary" size="sm" onPress={saveEdit}>
              保存
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
