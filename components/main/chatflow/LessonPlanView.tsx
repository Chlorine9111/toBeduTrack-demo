"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import EditableList from "./EditableList"
import DiffPreview from "./DiffPreview"
import LessonPlanBlockView from "./lesson-blocks/LessonPlanBlockView"
import { Button, Chip, Spinner } from "@heroui/react"
import {
  Target,
  CheckCircle2,
  Clock,
  BarChart3,
  BookOpen,
  Users,
  GraduationCap,
  Package,
  ClipboardCheck,
  PenLine,
  Printer,
  Share2,
  Pencil,
  ChevronDown,
  Sparkles,
  X,
} from "lucide-react"
import type { MockLessonPlan, LessonStepPhase, MockLessonStep, AiRewriteContext, CanvasSelection } from "./types"
import type { LessonPlanBlock, LessonPlanDocument, LessonPlanSection } from "@/lib/lesson-plan/types"
import MathText from "./MathText"

interface LessonPlanViewProps {
  lessonPlan: MockLessonPlan
  fullDocument?: LessonPlanDocument | null
  fullLoading?: boolean
  fullError?: string
  isCompleted?: boolean
  pdfExporting?: string | null
  onChange?: (lessonPlan: MockLessonPlan) => void
  onStepChange?: (stepId: string, updatedStep: MockLessonStep) => void
  onAction?: (action: string) => void
  canvasSelection?: CanvasSelection | null
  onSelectStep?: (selection: CanvasSelection) => void
  rewriteContext?: AiRewriteContext | null
  onAcceptRewrite?: () => void
  onRejectRewrite?: () => void
}

type EditableSectionKey = "title" | "objectives" | "keyPoints" | "difficulties" | "resources" | "assessment"
type EditableLabelKey = "objectives" | "keyPoints" | "difficulties" | "resources" | "assessment"

type StepRewritePreview = {
  stepId: string
  beforeText: string
  afterText: string
  section: LessonPlanSection
}

const PHASE_CONFIG: Record<
  LessonStepPhase,
  { color: string; bg: string; border: string; label: string }
> = {
  "warm-up": {
    color: "bg-blue-500",
    bg: "bg-blue-50",
    border: "border-blue-200",
    label: "导入",
  },
  instruction: {
    color: "bg-purple-500",
    bg: "bg-purple-50",
    border: "border-purple-200",
    label: "讲授",
  },
  practice: {
    color: "bg-green-500",
    bg: "bg-green-50",
    border: "border-green-200",
    label: "练习",
  },
  summary: {
    color: "bg-amber-500",
    bg: "bg-amber-50",
    border: "border-amber-200",
    label: "小结",
  },
  extension: {
    color: "bg-gray-400",
    bg: "bg-gray-50",
    border: "border-gray-200",
    label: "拓展",
  },
}

const LEVEL_STYLE: Record<string, string> = {
  "基础": "bg-green-50 text-green-700 border-green-200",
  "中等": "bg-amber-50 text-amber-700 border-amber-200",
  "进阶": "bg-red-50 text-red-700 border-red-200",
}

const DEFAULT_PREFERENCES = {
  durationMinutes: 0,
  studentLevel: "medium",
  languagePref: "follow",
  templateKind: "concept",
  quizDensity: "medium",
  explanationDepth: "standard",
  includeExtension: true,
  showCedCodes: false,
  includeTeacherNotes: false,
} as const

const DEFAULT_SECTION_LABELS: Record<EditableLabelKey, string> = {
  objectives: "教学目标",
  keyPoints: "重点",
  difficulties: "难点",
  resources: "教学资源",
  assessment: "评估方式",
}

const SECTION_REWRITE_INSTRUCTION =
  "请整体重写本教学环节的 section blocks，保持学科语境与时长一致，提升课堂动作的具体性与可执行性。"

function normalizeStringList(items: string[]) {
  const next = items.map((item) => item.trim()).filter((item) => item.length > 0)
  return next.length > 0 ? next : [""]
}

function blockTextDigest(block: LessonPlanBlock) {
  const content = block.content ?? {}
  if (block.type === "heading") {
    return `标题：${String(content.text ?? "")}`
  }
  if (block.type === "paragraph") {
    return `段落：${String(content.text ?? "")}`
  }
  if (block.type === "math") {
    return `公式：${String(content.latex ?? "")}`
  }
  if (block.type === "callout") {
    return `提示：${String(content.title ?? "")} ${String(content.text ?? "")}`
  }
  if (block.type === "definition") {
    return `定义：${String(content.term ?? "")} ${String(content.explanation ?? "")}`
  }
  if (block.type === "example") {
    const steps = Array.isArray(content.steps) ? content.steps.map((item) => String(item ?? "")).join("；") : ""
    return `例题：${String(content.prompt ?? "")} ${steps}`
  }
  if (block.type === "steps") {
    const items = Array.isArray(content.items) ? content.items.map((item) => String(item ?? "")).join("；") : ""
    return `步骤：${String(content.title ?? "")} ${items}`
  }
  if (block.type === "quiz") {
    const options = Array.isArray(content.options)
      ? content.options
        .map((option) => {
          if (!option || typeof option !== "object") return String(option ?? "")
          const row = option as { id?: unknown; text?: unknown }
          return `${String(row.id ?? "")}:${String(row.text ?? "")}`
        })
        .join(" | ")
      : ""
    return `测验：${String(content.question ?? "")} ${options} 解析:${String(content.explanation ?? "")}`
  }
  if (block.type === "poll") {
    const options = Array.isArray(content.options)
      ? content.options
        .map((option) => {
          if (!option || typeof option !== "object") return String(option ?? "")
          const row = option as { id?: unknown; text?: unknown }
          return `${String(row.id ?? "")}:${String(row.text ?? "")}`
        })
        .join(" | ")
      : ""
    return `投票：${String(content.question ?? "")} ${options}`
  }
  if (block.type === "image") {
    return `图片：${String(content.caption ?? "")} ${String(content.alt ?? "")}`
  }
  return `${block.type}：${JSON.stringify(content)}`
}

function sectionToDiffText(section: LessonPlanSection) {
  return [
    `标题：${section.title}`,
    `摘要：${section.summary}`,
    `时长：${section.durationMinutes} min`,
    ...section.blocks
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((block, index) => `Block ${index + 1}（${block.type}）：${blockTextDigest(block)}`),
  ].join("\n")
}

export default function LessonPlanView({
  lessonPlan,
  fullDocument,
  fullLoading = false,
  fullError = "",
  isCompleted = true,
  pdfExporting,
  onChange,
  onStepChange,
  onAction,
  canvasSelection,
  onSelectStep,
  rewriteContext,
  onAcceptRewrite,
  onRejectRewrite,
}: LessonPlanViewProps) {
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<MockLessonStep | null>(null)
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})

  const [editingSection, setEditingSection] = useState<EditableSectionKey | null>(null)
  const [sectionDraft, setSectionDraft] = useState<string | string[]>("")
  const [editingLabel, setEditingLabel] = useState<EditableLabelKey | null>(null)
  const [labelDraft, setLabelDraft] = useState("")
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [documentDraft, setDocumentDraft] = useState<LessonPlanDocument | null>(null)
  const [rewritingStepId, setRewritingStepId] = useState<string | null>(null)
  const [stepRewritePreview, setStepRewritePreview] = useState<StepRewritePreview | null>(null)
  const [stepRewriteError, setStepRewriteError] = useState<{ stepId: string; message: string } | null>(null)
  const rewriteErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setEditingStepId(null)
      setEditDraft(null)
      setEditingSection(null)
      setSectionDraft("")
      setEditingLabel(null)
      setLabelDraft("")
      setEditingBlockId(null)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  useEffect(() => {
    // When a new lesson plan arrives, reset per-step UI state.
    setExpandedSteps({})
  }, [lessonPlan.id])

  useEffect(() => {
    if (isCompleted) return
    setExpandedSteps(
      lessonPlan.steps.reduce<Record<string, boolean>>((acc, step) => {
        acc[step.id] = true
        return acc
      }, {}),
    )
  }, [isCompleted, lessonPlan.steps])

  useEffect(() => {
    setDocumentDraft(fullDocument ?? null)
  }, [fullDocument])

  useEffect(() => {
    return () => {
      if (rewriteErrorTimerRef.current) {
        clearTimeout(rewriteErrorTimerRef.current)
      }
    }
  }, [])

  const documentForRender = documentDraft ?? fullDocument ?? null

  const sectionById = useMemo(() => {
    if (!documentForRender) return null
    const map = new Map<string, LessonPlanSection>()
    for (const section of documentForRender.sections ?? []) {
      map.set(section.id, section)
    }
    return map
  }, [documentForRender])

  const totalMinutes = useMemo(() => lessonPlan.steps.reduce((sum, item) => sum + item.duration, 0), [lessonPlan.steps])
  const fullPreferences = {
    ...(documentForRender?.preferences ?? DEFAULT_PREFERENCES),
    showCedCodes: false,
  }

  const sectionLabels = {
    ...DEFAULT_SECTION_LABELS,
    ...(lessonPlan.sectionLabels ?? {}),
  }

  const startStepEdit = (step: MockLessonStep) => {
    setEditingSection(null)
    setSectionDraft("")
    setEditingLabel(null)
    setLabelDraft("")
    setEditingBlockId(null)
    setEditingStepId(step.id)
    setEditDraft({
      ...step,
      teacherActions: [...step.teacherActions],
      studentActions: [...step.studentActions],
    })
  }

  const cancelStepEdit = () => {
    setEditingStepId(null)
    setEditDraft(null)
  }

  const toggleStepExpanded = (stepId: string) => {
    setExpandedSteps((prev) => ({ ...prev, [stepId]: !prev[stepId] }))
  }

  const saveStepEdit = () => {
    if (!editingStepId || !editDraft) return
    const normalizedDraft: MockLessonStep = {
      ...editDraft,
      title: editDraft.title.trim() || "未命名环节",
      duration: Math.max(1, Math.min(120, Number(editDraft.duration) || 1)),
      teacherActions: normalizeStringList(editDraft.teacherActions),
      studentActions: normalizeStringList(editDraft.studentActions),
    }
    const nextSteps = lessonPlan.steps.map((item) => (item.id === editingStepId ? normalizedDraft : item))
    const nextPlan: MockLessonPlan = {
      ...lessonPlan,
      steps: nextSteps,
      totalMinutes: nextSteps.reduce((sum, item) => sum + item.duration, 0),
    }
    onStepChange?.(editingStepId, normalizedDraft)
    onChange?.(nextPlan)
    cancelStepEdit()
  }

  const startSectionEdit = (key: EditableSectionKey) => {
    setEditingStepId(null)
    setEditDraft(null)
    setEditingLabel(null)
    setLabelDraft("")
    setEditingBlockId(null)
    setEditingSection(key)
    if (key === "title") {
      setSectionDraft(lessonPlan.title)
      return
    }
    if (key === "assessment") {
      setSectionDraft(lessonPlan.assessment)
      return
    }
    setSectionDraft([...(lessonPlan[key] as string[])])
  }

  const cancelSectionEdit = () => {
    setEditingSection(null)
    setSectionDraft("")
  }

  const saveSectionEdit = () => {
    if (!editingSection) return
    let nextPlan: MockLessonPlan = lessonPlan
    if (editingSection === "title" || editingSection === "assessment") {
      nextPlan = {
        ...lessonPlan,
        [editingSection]: String(sectionDraft ?? "").trim(),
      }
    } else {
      nextPlan = {
        ...lessonPlan,
        [editingSection]: normalizeStringList(Array.isArray(sectionDraft) ? sectionDraft : []),
      }
    }
    onChange?.(nextPlan)
    cancelSectionEdit()
  }

  const startLabelEdit = (key: EditableLabelKey) => {
    setEditingSection(null)
    setSectionDraft("")
    setEditingStepId(null)
    setEditDraft(null)
    setEditingBlockId(null)
    setEditingLabel(key)
    setLabelDraft(sectionLabels[key])
  }

  const cancelLabelEdit = () => {
    setEditingLabel(null)
    setLabelDraft("")
  }

  const saveLabelEdit = () => {
    if (!editingLabel) return
    const nextValue = labelDraft.trim()
    if (!nextValue) {
      cancelLabelEdit()
      return
    }
    const nextPlan: MockLessonPlan = {
      ...lessonPlan,
      sectionLabels: {
        ...(lessonPlan.sectionLabels ?? {}),
        [editingLabel]: nextValue,
      },
    }
    onChange?.(nextPlan)
    cancelLabelEdit()
  }

  const persistLessonPlanDocument = useCallback(async (document: LessonPlanDocument) => {
    if (!document.id) return
    const response = await fetch(`/api/lesson-plans/${encodeURIComponent(document.id)}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: document.title,
        sourcePrompt: document.sourcePrompt,
        subjectLabel: document.subjectLabel,
        courseId: document.courseId,
        unitId: document.unitId,
        topicIds: document.topicIds,
        learningObjectiveCodes: document.learningObjectiveCodes,
        essentialKnowledge: document.essentialKnowledge,
        preferences: document.preferences,
        sections: document.sections,
      }),
    })
    if (!response.ok) {
      let message = `HTTP ${response.status}`
      try {
        const payload = (await response.json()) as {
          error?: { message?: string }
        }
        if (payload?.error?.message) {
          message = payload.error.message
        }
      } catch {
        // Keep fallback message.
      }
      throw new Error(message)
    }
  }, [])

  const handleBlockChange = useCallback(
    async (sectionId: string, blockId: string, newContent: Record<string, unknown>) => {
      const base = documentForRender
      if (!base) return
      const nextSections = base.sections.map((section) => {
        if (section.id !== sectionId) return section
        return {
          ...section,
          blocks: section.blocks.map((block) =>
            block.id === blockId
              ? {
                  ...block,
                  content: newContent,
                }
              : block,
          ),
        }
      })
      const nextDocument: LessonPlanDocument = {
        ...base,
        sections: nextSections,
      }
      setDocumentDraft(nextDocument)
      setEditingBlockId(null)
      try {
        await persistLessonPlanDocument(nextDocument)
      } catch {
        // 编辑结果先保留在本地，避免打断用户输入流。
      }
    },
    [documentForRender, persistLessonPlanDocument],
  )

  const showStepRewriteError = useCallback((stepId: string, message: string) => {
    setStepRewriteError({ stepId, message })
    if (rewriteErrorTimerRef.current) {
      clearTimeout(rewriteErrorTimerRef.current)
    }
    rewriteErrorTimerRef.current = setTimeout(() => {
      setStepRewriteError((prev) => (prev?.stepId === stepId ? null : prev))
      rewriteErrorTimerRef.current = null
    }, 3000)
  }, [])

  const requestStepRewrite = useCallback(
    async (step: MockLessonStep) => {
      if (rewritingStepId) return
      const base = documentForRender
      if (!base?.id) {
        showStepRewriteError(step.id, "缺少教案 ID，无法执行 AI 重写。")
        return
      }
      const currentSection = sectionById?.get(step.id)
      if (!currentSection) {
        showStepRewriteError(step.id, "未找到对应章节内容，无法执行 AI 重写。")
        return
      }

      setRewritingStepId(step.id)
      setStepRewritePreview(null)
      setStepRewriteError(null)

      try {
        const response = await fetch(
          `/api/lesson-plans/${encodeURIComponent(base.id)}/rewrite-block`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sectionId: step.id,
              instruction: SECTION_REWRITE_INSTRUCTION,
            }),
          },
        )
        const payload = (await response.json()) as {
          section?: LessonPlanSection
          error?: { message?: string }
        }
        if (!response.ok || !payload.section) {
          throw new Error(payload?.error?.message ?? "AI 重写失败")
        }
        setStepRewritePreview({
          stepId: step.id,
          beforeText: sectionToDiffText(currentSection),
          afterText: sectionToDiffText(payload.section),
          section: payload.section,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI 重写失败"
        showStepRewriteError(step.id, message)
      } finally {
        setRewritingStepId(null)
      }
    },
    [documentForRender, rewritingStepId, sectionById, showStepRewriteError],
  )

  const acceptStepRewrite = useCallback(async () => {
    if (!stepRewritePreview) return
    const base = documentForRender
    if (!base) {
      setStepRewritePreview(null)
      return
    }

    const nextSections = base.sections.map((section) =>
      section.id === stepRewritePreview.stepId ? stepRewritePreview.section : section,
    )
    const nextDocument: LessonPlanDocument = {
      ...base,
      sections: nextSections,
    }
    setDocumentDraft(nextDocument)

    const nextSteps = lessonPlan.steps.map((step) =>
      step.id === stepRewritePreview.stepId
        ? {
            ...step,
            title: stepRewritePreview.section.title || step.title,
            duration: Math.max(1, stepRewritePreview.section.durationMinutes || step.duration),
          }
        : step,
    )
    const nextPlan: MockLessonPlan = {
      ...lessonPlan,
      steps: nextSteps,
      totalMinutes: nextSteps.reduce((sum, item) => sum + item.duration, 0),
    }
    onChange?.(nextPlan)
    const target = nextSteps.find((step) => step.id === stepRewritePreview.stepId)
    if (target) {
      onStepChange?.(stepRewritePreview.stepId, target)
    }

    try {
      await persistLessonPlanDocument(nextDocument)
    } catch {
      showStepRewriteError(stepRewritePreview.stepId, "改写已更新到本地，但保存到服务端失败。")
    }

    setStepRewritePreview(null)
  }, [
    documentForRender,
    lessonPlan,
    onChange,
    onStepChange,
    persistLessonPlanDocument,
    showStepRewriteError,
    stepRewritePreview,
  ])

  const rejectStepRewrite = useCallback(() => {
    setStepRewritePreview(null)
  }, [])

  const sectionEditActions = (
    <div className="mt-2 flex items-center gap-2">
      <Button variant="secondary" size="sm" onPress={cancelSectionEdit}>
        取消
      </Button>
      <Button variant="primary" size="sm" onPress={saveSectionEdit}>
        保存
      </Button>
    </div>
  )

  return (
    <div className="h-full flex flex-col px-6 py-6 overflow-y-auto" data-print-content>
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6"
      >
        <p className="text-xs font-medium text-gray-400 tracking-wide">
          {lessonPlan.courseName} &middot; {lessonPlan.unitName}
        </p>

        {editingSection === "title" ? (
          <div className="mt-2 rounded-xl border border-indigo-200 ring-2 ring-indigo-500/20 p-3">
            <input
              value={String(sectionDraft)}
              onChange={(event) => setSectionDraft(event.target.value)}
              className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm font-semibold text-gray-900 outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
            />
            {sectionEditActions}
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900">{lessonPlan.title}</h2>
            <Button isIconOnly variant="ghost" onPress={() => startSectionEdit("title")} aria-label="编辑教案标题" className="h-7 w-7 min-w-0 no-print">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div className="mt-3 flex items-center gap-3">
          <Chip size="sm">
            <Clock className="mr-1 inline w-3.5 h-3.5" />
            {totalMinutes || lessonPlan.totalMinutes} min
          </Chip>
          <Chip size="sm" className={LEVEL_STYLE[lessonPlan.level] ?? LEVEL_STYLE["中等"]}>
            <BarChart3 className="mr-1 inline w-3.5 h-3.5" />
            {lessonPlan.level}
          </Chip>
        </div>
      </motion.div>

      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="mb-6"
      >
        <div className="mb-2.5 flex items-center gap-2">
          {editingLabel === "objectives" ? (
            <div className="flex flex-1 items-center gap-2">
              <Target className="w-4 h-4 text-gray-400" />
              <input
                value={labelDraft}
                autoFocus
                onChange={(event) => setLabelDraft(event.target.value)}
                onBlur={saveLabelEdit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    saveLabelEdit()
                  } else if (event.key === "Escape") {
                    event.preventDefault()
                    cancelLabelEdit()
                  }
                }}
                className="h-8 flex-1 rounded-md border border-indigo-200 px-2 text-sm font-semibold text-gray-700 outline-hidden ring-2 ring-indigo-500/20"
              />
            </div>
          ) : (
            <h3
              className="text-sm font-semibold text-gray-700 flex items-center gap-2 cursor-text"
              onDoubleClick={() => startLabelEdit("objectives")}
            >
              <Target className="w-4 h-4 text-gray-400" />
              {sectionLabels.objectives}
            </h3>
          )}
          <Button isIconOnly variant="ghost" onPress={() => startSectionEdit("objectives")} aria-label="编辑教学目标" className="h-7 w-7 min-w-0 no-print">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>

        {editingSection === "objectives" ? (
          <div className="rounded-xl border border-indigo-200 ring-2 ring-indigo-500/20 p-3">
            <EditableList
              items={Array.isArray(sectionDraft) ? sectionDraft : []}
              onChange={setSectionDraft}
              addLabel="+ 添加教学目标"
              inputPlaceholder="请输入教学目标"
            />
            {sectionEditActions}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {lessonPlan.objectives.map((obj, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0" />
                <span>{obj}</span>
              </li>
            ))}
          </ul>
        )}
      </motion.div>

      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="grid grid-cols-2 gap-4 mb-6"
      >
        <div>
          <div className="mb-2 flex items-center gap-2">
            {editingLabel === "keyPoints" ? (
              <input
                value={labelDraft}
                autoFocus
                onChange={(event) => setLabelDraft(event.target.value)}
                onBlur={saveLabelEdit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    saveLabelEdit()
                  } else if (event.key === "Escape") {
                    event.preventDefault()
                    cancelLabelEdit()
                  }
                }}
                className="h-8 flex-1 rounded-md border border-indigo-200 px-2 text-sm font-semibold text-gray-700 outline-hidden ring-2 ring-indigo-500/20"
              />
            ) : (
              <h3
                className="text-sm font-semibold text-gray-700 cursor-text"
                onDoubleClick={() => startLabelEdit("keyPoints")}
              >
                {sectionLabels.keyPoints}
              </h3>
            )}
            <Button isIconOnly variant="ghost" onPress={() => startSectionEdit("keyPoints")} aria-label="编辑重点" className="h-7 w-7 min-w-0 no-print">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
          {editingSection === "keyPoints" ? (
            <div className="rounded-xl border border-indigo-200 ring-2 ring-indigo-500/20 p-3">
              <EditableList
                items={Array.isArray(sectionDraft) ? sectionDraft : []}
                onChange={setSectionDraft}
                addLabel="+ 添加重点"
              />
              {sectionEditActions}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {lessonPlan.keyPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600 leading-relaxed">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2">
            {editingLabel === "difficulties" ? (
              <input
                value={labelDraft}
                autoFocus
                onChange={(event) => setLabelDraft(event.target.value)}
                onBlur={saveLabelEdit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    saveLabelEdit()
                  } else if (event.key === "Escape") {
                    event.preventDefault()
                    cancelLabelEdit()
                  }
                }}
                className="h-8 flex-1 rounded-md border border-indigo-200 px-2 text-sm font-semibold text-gray-700 outline-hidden ring-2 ring-indigo-500/20"
              />
            ) : (
              <h3
                className="text-sm font-semibold text-gray-700 cursor-text"
                onDoubleClick={() => startLabelEdit("difficulties")}
              >
                {sectionLabels.difficulties}
              </h3>
            )}
            <Button isIconOnly variant="ghost" onPress={() => startSectionEdit("difficulties")} aria-label="编辑难点" className="h-7 w-7 min-w-0 no-print">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
          {editingSection === "difficulties" ? (
            <div className="rounded-xl border border-indigo-200 ring-2 ring-indigo-500/20 p-3">
              <EditableList
                items={Array.isArray(sectionDraft) ? sectionDraft : []}
                onChange={setSectionDraft}
                addLabel="+ 添加难点"
              />
              {sectionEditActions}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {lessonPlan.difficulties.map((diff, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600 leading-relaxed">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                  <span>{diff}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="mb-6"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-gray-400" />
            教学流程
          </h3>
          {fullLoading ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <Spinner size="sm" className="h-3.5 w-3.5" />
              正在加载完整教案...
            </span>
          ) : fullError ? (
            <span className="text-[11px] font-medium text-red-600">完整教案加载失败：{fullError}</span>
          ) : fullDocument ? (
            <span className="text-[11px] font-medium text-emerald-600">已加载完整内容</span>
          ) : null}
        </div>

        <div className="relative pl-6">
          <div className="absolute left-[9px] top-2 bottom-2 w-px bg-gray-200" />

          <div className="space-y-5">
            {lessonPlan.steps.map((step, i) => {
              const phase = PHASE_CONFIG[step.phase]
              const isEditing = editingStepId === step.id && editDraft
              const isExpanded = Boolean(expandedSteps[step.id])
              const section = sectionById?.get(step.id)
              const blocks = section ? [...(section.blocks ?? [])].sort((a, b) => a.sortOrder - b.sortOrder) : []
              const fullTextLen = section ? (section.summary?.length ?? 0) + blocks.reduce((sum, b) => sum + JSON.stringify(b.content ?? {}).length, 0) : 0
              const shouldOfferExpand =
                step.teacherActions.join("\n").length + step.studentActions.join("\n").length >
                  220 ||
                step.teacherActions.length + step.studentActions.length > 4
                || (section ? fullTextLen > 320 || blocks.length > 2 : false)
              return (
                <motion.div
                  key={step.id}
                  initial={false}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: 0.2 + i * 0.08 }}
                  className="relative"
                >
                  <div
                    className={cn(
                      "absolute -left-6 top-1 w-[18px] h-[18px] rounded-full border-2 border-white shadow-xs",
                      phase.color,
                    )}
                  />

                  <div
                    className={cn(
                      "rounded-xl border p-4",
                      phase.bg,
                      canvasSelection?.type === "lesson-step" && canvasSelection.itemId === step.id
                        ? "border-indigo-400 ring-2 ring-indigo-400/30"
                        : phase.border,
                    )}
                    onClick={(e) => {
                      if (editingStepId === step.id) return
                      const target = e.target as HTMLElement
                      if (target.closest("button") || target.closest("input") || target.closest("textarea")) return
                      onSelectStep?.({ type: "lesson-step", itemId: step.id, label: `步骤: ${step.title}` })
                    }}
                    style={{ cursor: editingStepId === step.id ? undefined : "pointer" }}
                  >
                    {!isEditing ? (
                      <>
                        <div className="mb-2.5 flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Chip size="sm" className={cn("text-white", phase.color)}>
                              {step.duration} min
                            </Chip>
                            <span className="text-sm font-semibold text-gray-800">{step.title}</span>
                          </div>
                          <div className="flex items-center gap-1.5 no-print">
                            <Button
                              isIconOnly
                              variant="ghost"
                              onPress={() => requestStepRewrite(step)}
                              aria-label={`AI 重写环节-${step.id}`}
                              isDisabled={Boolean(rewritingStepId && rewritingStepId !== step.id)}
                              className={cn(
                                "h-7 w-7 min-w-0",
                                rewritingStepId === step.id
                                  ? "bg-indigo-50 text-indigo-600"
                                  : "text-gray-500",
                              )}
                            >
                              {rewritingStepId === step.id ? (
                                <Spinner size="sm" className="h-3.5 w-3.5" />
                              ) : (
                                <Sparkles className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              isIconOnly
                              variant="ghost"
                              onPress={() => startStepEdit(step)}
                              aria-label={`编辑环节-${step.id}`}
                              isDisabled={Boolean(rewritingStepId)}
                              className="h-7 w-7 min-w-0 text-gray-500"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        <div
                          className={cn(
                            "relative",
                            !isExpanded && shouldOfferExpand
                              ? "max-h-56 overflow-hidden"
                              : undefined,
                          )}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <GraduationCap className="w-3.5 h-3.5 text-indigo-500" />
                            <span className="text-xs font-medium text-indigo-600">教师活动</span>
                          </div>
                          <ul className="space-y-0.5 ml-5">
                            {step.teacherActions.map((action, j) => (
                              <li
                                key={j}
                                className="text-xs text-gray-600 leading-relaxed list-disc whitespace-pre-wrap"
                              >
                                {action}
                              </li>
                            ))}
                          </ul>
                          <div className="mt-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Users className="w-3.5 h-3.5 text-teal-500" />
                            <span className="text-xs font-medium text-teal-600">学生活动</span>
                          </div>
                          <ul className="space-y-0.5 ml-5">
                            {step.studentActions.map((action, j) => (
                              <li
                                key={j}
                                className="text-xs text-gray-600 leading-relaxed list-disc whitespace-pre-wrap"
                              >
                                {action}
                              </li>
                            ))}
                          </ul>
                          </div>

                          {section && blocks.length > 0 ? (
                            <div className="mt-3 border-t border-white/70 pt-3">
                              <div className="mb-2 flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-xs font-semibold text-gray-800">完整内容</div>
                                  {section.summary ? (
                                    <p className="mt-1 text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
                                      <MathText text={section.summary} />
                                    </p>
                                  ) : null}
                                </div>
                                <span className="shrink-0 text-[11px] font-medium text-gray-500">
                                  {section.durationMinutes} min
                                </span>
                              </div>
                              <div className="space-y-2">
                                {blocks.map((block) => (
                                  <LessonPlanBlockView
                                    key={block.id}
                                    block={block}
                                    preferences={fullPreferences}
                                    editingBlockId={editingBlockId}
                                    onRequestEdit={setEditingBlockId}
                                    onBlockChange={(blockId, newContent) =>
                                      handleBlockChange(section.id, blockId, newContent)
                                    }
                                  />
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {!isExpanded && shouldOfferExpand ? (
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-white/90 to-transparent" />
                          ) : null}
                        </div>

                        {shouldOfferExpand ? (
                          <div className="mt-2 flex justify-end no-print">
                            <button
                              type="button"
                              onClick={() => toggleStepExpanded(step.id)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-white/60 hover:text-gray-800"
                              aria-label={isExpanded ? "收起环节内容" : "展开环节内容"}
                              aria-expanded={isExpanded}
                            >
                              <span className="inline-flex items-center gap-1">
                                <ChevronDown
                                  className={cn(
                                    "h-3.5 w-3.5 transition-transform",
                                    isExpanded ? "rotate-180" : undefined,
                                  )}
                                  aria-hidden="true"
                                />
                                <span>{isExpanded ? "收起" : "展开"}</span>
                              </span>
                            </button>
                          </div>
                        ) : null}

                        {stepRewriteError?.stepId === step.id ? (
                          <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            <span>{stepRewriteError.message}</span>
                            <Button isIconOnly variant="ghost" onPress={() => setStepRewriteError(null)} aria-label="关闭错误提示" className="h-5 w-5 min-w-0">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : null}

                        {rewritingStepId === step.id ? (
                          <div className="flex items-center gap-2 mt-2 px-3 py-2">
                            <Spinner size="sm" />
                            <span className="text-xs text-gray-500">AI 正在重写该环节...</span>
                          </div>
                        ) : null}

                        {stepRewritePreview?.stepId === step.id ? (
                          <div className="mt-2">
                            <DiffPreview
                              title="AI 重写预览"
                              before={stepRewritePreview.beforeText}
                              after={stepRewritePreview.afterText}
                              onAccept={acceptStepRewrite}
                              onReject={rejectStepRewrite}
                            />
                          </div>
                        ) : null}

                        {rewriteContext?.status === "loading" && rewriteContext.result?.selection.itemId === step.id ? (
                          <div className="flex items-center gap-2 mt-2 px-3 py-2">
                            <Spinner size="sm" />
                            <span className="text-xs text-gray-500">AI 正在改写...</span>
                          </div>
                        ) : null}

                        {rewriteContext?.status === "preview" && rewriteContext.result?.selection.itemId === step.id ? (
                          <div className="mt-2">
                            <DiffPreview
                              title="AI 改写预览"
                              before={rewriteContext.result.beforeText}
                              after={rewriteContext.result.afterText}
                              onAccept={() => onAcceptRewrite?.()}
                              onReject={() => onRejectRewrite?.()}
                            />
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="rounded-xl border border-indigo-200 ring-2 ring-indigo-500/20 bg-white p-3">
                        <div className="mb-2 grid grid-cols-[1fr_auto_auto] items-center gap-2">
                          <input
                            value={editDraft.title}
                            onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })}
                            className="h-9 rounded-md border border-gray-200 px-3 text-sm font-medium outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
                          />
                          <input
                            type="number"
                            value={editDraft.duration}
                            min={1}
                            max={120}
                            onChange={(event) =>
                              setEditDraft({
                                ...editDraft,
                                duration: Math.max(1, Math.min(120, Number(event.target.value) || 1)),
                              })
                            }
                            className="h-9 w-24 rounded-md border border-gray-200 px-3 text-sm outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
                          />
                          <span className="text-xs text-gray-500">min</span>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <div className="mb-1 text-xs font-medium text-indigo-600">教师活动</div>
                            <EditableList
                              items={editDraft.teacherActions}
                              onChange={(items) => setEditDraft({ ...editDraft, teacherActions: items })}
                              addLabel="+ 添加教师活动"
                            />
                          </div>
                          <div>
                            <div className="mb-1 text-xs font-medium text-teal-600">学生活动</div>
                            <EditableList
                              items={editDraft.studentActions}
                              onChange={(items) => setEditDraft({ ...editDraft, studentActions: items })}
                              addLabel="+ 添加学生活动"
                            />
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-end gap-2">
                          <Button variant="secondary" size="sm" onPress={cancelStepEdit}>
                            取消
                          </Button>
                          <Button variant="primary" size="sm" onPress={saveStepEdit}>
                            保存
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
            {!isCompleted ? (
              <div className="relative">
                <div className="absolute -left-6 top-1 w-[18px] h-[18px] rounded-full border-2 border-white bg-indigo-300 shadow-xs" />
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-indigo-600">
                    <Spinner size="sm" className="h-3.5 w-3.5" />
                    正在生成下一个教学环节...
                  </div>
                  <div className="mt-2 h-2 w-3/4 animate-pulse rounded bg-indigo-100" />
                  <div className="mt-2 h-2 w-1/2 animate-pulse rounded bg-indigo-100" />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.45 }}
        className="mb-6"
      >
        <div className="mb-2.5 flex items-center gap-2">
          {editingLabel === "resources" ? (
            <div className="flex flex-1 items-center gap-2">
              <Package className="w-4 h-4 text-gray-400" />
              <input
                value={labelDraft}
                autoFocus
                onChange={(event) => setLabelDraft(event.target.value)}
                onBlur={saveLabelEdit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    saveLabelEdit()
                  } else if (event.key === "Escape") {
                    event.preventDefault()
                    cancelLabelEdit()
                  }
                }}
                className="h-8 flex-1 rounded-md border border-indigo-200 px-2 text-sm font-semibold text-gray-700 outline-hidden ring-2 ring-indigo-500/20"
              />
            </div>
          ) : (
            <h3
              className="text-sm font-semibold text-gray-700 flex items-center gap-2 cursor-text"
              onDoubleClick={() => startLabelEdit("resources")}
            >
              <Package className="w-4 h-4 text-gray-400" />
              {sectionLabels.resources}
            </h3>
          )}
          <Button isIconOnly variant="ghost" onPress={() => startSectionEdit("resources")} aria-label="编辑教学资源" className="h-7 w-7 min-w-0 no-print">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
        {editingSection === "resources" ? (
          <div className="rounded-xl border border-indigo-200 ring-2 ring-indigo-500/20 p-3">
            <EditableList
              items={Array.isArray(sectionDraft) ? sectionDraft : []}
              onChange={setSectionDraft}
              addLabel="+ 添加教学资源"
            />
            {sectionEditActions}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {lessonPlan.resources.map((res, i) => (
              <Chip key={i} size="sm">
                {res}
              </Chip>
            ))}
          </div>
        )}
      </motion.div>

      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.5 }}
        className="mb-8"
      >
        <div className="mb-2 flex items-center gap-2">
          {editingLabel === "assessment" ? (
            <div className="flex flex-1 items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-gray-400" />
              <input
                value={labelDraft}
                autoFocus
                onChange={(event) => setLabelDraft(event.target.value)}
                onBlur={saveLabelEdit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    saveLabelEdit()
                  } else if (event.key === "Escape") {
                    event.preventDefault()
                    cancelLabelEdit()
                  }
                }}
                className="h-8 flex-1 rounded-md border border-indigo-200 px-2 text-sm font-semibold text-gray-700 outline-hidden ring-2 ring-indigo-500/20"
              />
            </div>
          ) : (
            <h3
              className="text-sm font-semibold text-gray-700 flex items-center gap-2 cursor-text"
              onDoubleClick={() => startLabelEdit("assessment")}
            >
              <ClipboardCheck className="w-4 h-4 text-gray-400" />
              {sectionLabels.assessment}
            </h3>
          )}
          <Button isIconOnly variant="ghost" onPress={() => startSectionEdit("assessment")} aria-label="编辑评估方式" className="h-7 w-7 min-w-0 no-print">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
        {editingSection === "assessment" ? (
          <div className="rounded-xl border border-indigo-200 ring-2 ring-indigo-500/20 p-3">
            <textarea
              rows={4}
              value={String(sectionDraft)}
              onChange={(event) => setSectionDraft(event.target.value)}
              className="w-full rounded-md border border-gray-200 p-3 text-sm text-gray-700 outline-hidden focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
            />
            {sectionEditActions}
          </div>
        ) : (
          <p className="text-sm text-gray-600 leading-relaxed">{lessonPlan.assessment}</p>
        )}
      </motion.div>

      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.55 }}
        className="flex items-center gap-3 pt-4 border-t border-gray-100"
        data-print-hide
      >
        {isCompleted && (
          <Button variant="secondary" size="sm" onPress={() => window.print()}>
            <Printer className="w-3.5 h-3.5" />
            打印 / 导出 PDF
          </Button>
        )}
        <Button variant="secondary" size="sm" onPress={() => onAction?.("open_lesson_editor")}>
          <PenLine className="w-3.5 h-3.5" />
          打开编辑器
        </Button>
        <Button variant="secondary" size="sm" onPress={() => onAction?.("share_lesson_community")}>
          <Share2 className="w-3.5 h-3.5" />
          分享到社区
        </Button>
      </motion.div>
    </div>
  )
}
