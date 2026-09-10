"use client"

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { DragDropProvider } from "@dnd-kit/react"
import { useSortable } from "@dnd-kit/react/sortable"
import { Alert, Button, ButtonGroup, Card, Kbd, Separator, Spinner } from "@heroui/react"
import {
  Download,
  GripVertical,
  Plus,
  SendHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react"
import DiffPreview from "./DiffPreview"
import type {
  AiRewriteContext,
  CanvasSelection,
  MockRubric,
  MockRubricDimension,
} from "./types"

interface RubricTableProps {
  rubric: MockRubric
  isCompleted?: boolean
  pdfExporting?: string | null
  onAction?: (action: string) => void
  onChange?: (rubric: MockRubric) => void
  canvasSelection?: CanvasSelection | null
  onSelectDimension?: (selection: CanvasSelection) => void
  rewriteContext?: AiRewriteContext | null
  onAcceptRewrite?: () => void
  onRejectRewrite?: () => void
}

type LevelKey = keyof MockRubricDimension["levels"]
type ColumnLabelKey =
  | "dimension"
  | "excellent"
  | "good"
  | "passing"
  | "failing"
  | "weight"
  | "actions"

interface InlineRewritePreview {
  dimId: string
  before: MockRubricDimension
  after: MockRubricDimension
}

interface SortableRowProps {
  dim: MockRubricDimension
  rowIndex: number
  sortIndex: number
  columnLabels: Record<ColumnLabelKey, string>
  selected: boolean
  editingCell: { dimId: string; level: LevelKey } | null
  editValue: string
  rewriteLoading: boolean
  inlineRewriteOpen: boolean
  onSelectDimension?: (selection: CanvasSelection) => void
  onChangeDimension: (
    dimId: string,
    patch: Partial<Pick<MockRubricDimension, "name" | "description" | "weight">>,
  ) => void
  onStartCellEdit: (dimId: string, level: LevelKey, value: string) => void
  onEditValueChange: (value: string) => void
  onCommitCell: () => void
  onRemoveDimension: (dimId: string) => void
  onToggleInlineRewrite: (dimId: string) => void
}

const RUBRIC_COLUMN_COUNT = 8

const LEVEL_COLUMNS: Array<{
  key: LevelKey
  bodyColor: string
  headerColor: string
  labelKey: ColumnLabelKey
}> = [
  { key: "excellent", bodyColor: "text-emerald-700", headerColor: "text-emerald-100", labelKey: "excellent" },
  { key: "good", bodyColor: "text-blue-700", headerColor: "text-blue-100", labelKey: "good" },
  { key: "passing", bodyColor: "text-amber-700", headerColor: "text-amber-100", labelKey: "passing" },
  { key: "failing", bodyColor: "text-red-700", headerColor: "text-red-100", labelKey: "failing" },
]

const DEFAULT_COLUMN_LABELS: Record<ColumnLabelKey, string> = {
  dimension: "Dimension",
  excellent: "Excellent",
  good: "Good",
  passing: "Passing",
  failing: "Failing",
  weight: "Weight",
  actions: "Actions",
}

function extractRewriteError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback
  const data = payload as Record<string, unknown>
  if (typeof data.message === "string" && data.message.trim()) {
    return data.message
  }
  if (data.error && typeof data.error === "object") {
    const nested = data.error as Record<string, unknown>
    if (typeof nested.message === "string" && nested.message.trim()) {
      return nested.message
    }
  }
  return fallback
}


function cloneRubric(rubric: MockRubric): MockRubric {
  return {
    ...rubric,
    dimensions: rubric.dimensions.map((item) => ({
      ...item,
      levels: { ...item.levels },
    })),
    columnLabels: rubric.columnLabels ? { ...rubric.columnLabels } : undefined,
  }
}

function readColumnLabel(columnLabels: MockRubric["columnLabels"], key: ColumnLabelKey): string {
  const text = columnLabels?.[key]
  if (typeof text !== "string") return DEFAULT_COLUMN_LABELS[key]
  const normalized = text.trim()
  return normalized || DEFAULT_COLUMN_LABELS[key]
}

function buildColumnLabels(columnLabels: MockRubric["columnLabels"]): Record<ColumnLabelKey, string> {
  return {
    dimension: readColumnLabel(columnLabels, "dimension"),
    excellent: readColumnLabel(columnLabels, "excellent"),
    good: readColumnLabel(columnLabels, "good"),
    passing: readColumnLabel(columnLabels, "passing"),
    failing: readColumnLabel(columnLabels, "failing"),
    weight: readColumnLabel(columnLabels, "weight"),
    actions: readColumnLabel(columnLabels, "actions"),
  }
}

function dimensionToText(
  dimension: MockRubricDimension,
  columnLabels: Record<ColumnLabelKey, string>,
): string {
  return [
    `${columnLabels.dimension}: ${dimension.name}`,
    "Description: " + dimension.description,
    `${columnLabels.weight}: ${dimension.weight}%`,
    `${columnLabels.excellent}: ${dimension.levels.excellent}`,
    `${columnLabels.good}: ${dimension.levels.good}`,
    `${columnLabels.passing}: ${dimension.levels.passing}`,
    `${columnLabels.failing}: ${dimension.levels.failing}`,
  ].join("\n")
}

function normalizeDimension(raw: unknown, fallback: MockRubricDimension): MockRubricDimension {
  if (!raw || typeof raw !== "object") return fallback

  const source = raw as Record<string, unknown>
  const rawLevels = source.levels && typeof source.levels === "object"
    ? (source.levels as Record<string, unknown>)
    : {}

  return {
    id: typeof source.id === "string" ? source.id : fallback.id,
    name: String(source.name ?? fallback.name),
    description: String(source.description ?? fallback.description),
    weight: Math.max(0, Math.min(100, Number(source.weight ?? fallback.weight) || 0)),
    levels: {
      excellent: String(rawLevels.excellent ?? fallback.levels.excellent),
      good: String(rawLevels.good ?? fallback.levels.good),
      passing: String(rawLevels.passing ?? fallback.levels.passing),
      failing: String(rawLevels.failing ?? fallback.levels.failing),
    },
  }
}

function SortableRow({
  dim,
  rowIndex,
  sortIndex,
  columnLabels,
  selected,
  editingCell,
  editValue,
  rewriteLoading,
  inlineRewriteOpen,
  onSelectDimension,
  onChangeDimension,
  onStartCellEdit,
  onEditValueChange,
  onCommitCell,
  onRemoveDimension,
  onToggleInlineRewrite,
}: SortableRowProps) {
  const { ref, handleRef, isDragging } = useSortable({ id: dim.id, index: sortIndex })

  const style: CSSProperties = isDragging
    ? { position: "relative", zIndex: 10, display: "table-row", width: "100%", maxWidth: "100%" }
    : {}

  return (
    <tr
      ref={ref}
      style={style}
      className={cn(
        "border-b border-gray-100 align-top cursor-pointer transition-colors",
        selected
          ? "bg-indigo-50/50 ring-2 ring-inset ring-indigo-400/30"
          : rowIndex % 2 === 0
            ? "bg-white hover:bg-gray-50/50"
            : "bg-gray-50/70 hover:bg-gray-100/50",
        isDragging && "bg-white shadow-lg opacity-90",
      )}
      onClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest("button") || target.closest("input") || target.closest("textarea")) return
        onSelectDimension?.({
          type: "rubric-dimension",
          itemId: dim.id,
          label: `${columnLabels.dimension}: ${dim.name}`,
        })
      }}
    >
      <td className="px-3 py-3 text-gray-400">
        <button
          type="button"
          ref={handleRef}
          onClick={(event) => event.stopPropagation()}
          className="rounded p-0.5 text-gray-400 transition-colors hover:text-gray-600 cursor-grab active:cursor-grabbing"
          aria-label="Drag row"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </td>

      <td className="px-3 py-3">
        <input
          value={dim.name}
          onChange={(event) => onChangeDimension(dim.id, { name: event.target.value })}
          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 outline-hidden focus:border-gray-400"
        />
        <input
          value={dim.description}
          onChange={(event) => onChangeDimension(dim.id, { description: event.target.value })}
          className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 outline-hidden focus:border-gray-400"
        />
      </td>

      {LEVEL_COLUMNS.map((levelColumn) => {
        const isEditing = editingCell?.dimId === dim.id && editingCell.level === levelColumn.key
        const cellText = dim.levels[levelColumn.key]
        return (
          <td key={levelColumn.key} className="px-3 py-3">
            {isEditing ? (
              <textarea
                value={editValue}
                onChange={(event) => onEditValueChange(event.target.value)}
                onBlur={onCommitCell}
                autoFocus
                rows={4}
                className="w-full resize-none rounded-md border border-indigo-300 bg-white p-2 text-xs leading-relaxed outline-hidden focus:ring-2 focus:ring-indigo-300"
              />
            ) : (
              <button
                type="button"
                onDoubleClick={() => onStartCellEdit(dim.id, levelColumn.key, cellText)}
                className="w-full rounded-md p-1 text-left text-xs leading-relaxed text-gray-600 hover:bg-white hover:text-gray-900"
              >
                <span className={cn("mb-1 block text-[11px] font-semibold", levelColumn.bodyColor)}>
                  {columnLabels[levelColumn.labelKey]}
                </span>
                {cellText}
              </button>
            )}
          </td>
        )
      })}

      <td className="px-3 py-3">
        <input
          type="number"
          min={0}
          max={100}
          value={dim.weight}
          onChange={(event) => {
            const nextWeight = Math.max(0, Math.min(100, Number(event.target.value) || 0))
            onChangeDimension(dim.id, { weight: nextWeight })
          }}
          className="h-8 w-full rounded-md border border-gray-200 px-2 text-center text-xs outline-hidden focus:border-gray-400"
        />
      </td>

      <td className="px-3 py-3">
        <div className="flex items-center justify-center gap-1">
          <Button
            isIconOnly
            variant="ghost"
            onPress={() => onToggleInlineRewrite(dim.id)}
            isDisabled={rewriteLoading && !inlineRewriteOpen}
            className={cn(
              "h-8 w-8 min-w-0",
              inlineRewriteOpen
                ? "border-indigo-300 bg-indigo-50 text-indigo-600"
                : "text-indigo-600",
            )}
            aria-label="AI rewrite"
          >
            {rewriteLoading && inlineRewriteOpen ? (
              <Spinner size="sm" className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </Button>
          <Button
            isIconOnly
            variant="ghost"
            onPress={() => onRemoveDimension(dim.id)}
            className="h-8 w-8 min-w-0 text-red-600"
            aria-label="Delete dimension"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  )
}

export default function RubricTable({
  rubric,
  isCompleted = true,
  pdfExporting,
  onAction,
  onChange,
  canvasSelection,
  onSelectDimension,
  rewriteContext,
  onAcceptRewrite,
  onRejectRewrite,
}: RubricTableProps) {
  const [draft, setDraft] = useState<MockRubric>(cloneRubric(rubric))
  const [editingCell, setEditingCell] = useState<{ dimId: string; level: LevelKey } | null>(null)
  const [editValue, setEditValue] = useState("")
  const [editingHeader, setEditingHeader] = useState<ColumnLabelKey | null>(null)
  const [headerEditValue, setHeaderEditValue] = useState("")
  const [rewritingDimId, setRewritingDimId] = useState<string | null>(null)
  const [rewriteInput, setRewriteInput] = useState("")
  const [rewriteLoading, setRewriteLoading] = useState(false)
  const [rewriteError, setRewriteError] = useState("")
  const [rewritePreview, setRewritePreview] = useState<InlineRewritePreview | null>(null)
  const draftRef = useRef(draft)

  useEffect(() => {
    const nextDraft = cloneRubric(rubric)
    draftRef.current = nextDraft
    setDraft(nextDraft)
  }, [rubric])

  const emitChange = useCallback(
    (next: MockRubric) => {
      draftRef.current = next
      setDraft(next)
      onChange?.(next)
    },
    [onChange],
  )

  const columnLabels = useMemo(
    () => buildColumnLabels(draft.columnLabels),
    [draft.columnLabels],
  )

  const totalWeight = useMemo(
    () => draft.dimensions.reduce((sum, item) => sum + item.weight, 0),
    [draft.dimensions],
  )

  const handleDragEnd = useCallback(
    (event: { canceled: boolean; operation: { source: { id: unknown } | null; target: { id: unknown } | null } }) => {
      if (event.canceled) return
      const { source, target } = event.operation
      if (!target || !source || source.id === target.id) return

      const currentDraft = draftRef.current
      const oldIndex = currentDraft.dimensions.findIndex((item) => item.id === source.id)
      const newIndex = currentDraft.dimensions.findIndex((item) => item.id === target.id)
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return

      const next = [...currentDraft.dimensions]
      const [removed] = next.splice(oldIndex, 1)
      next.splice(newIndex, 0, removed)

      emitChange({
        ...currentDraft,
        dimensions: next,
      })
    },
    [emitChange],
  )

  const updateDimension = useCallback(
    (
      dimId: string,
      patch: Partial<Pick<MockRubricDimension, "name" | "description" | "weight">>,
    ) => {
      emitChange({
        ...draft,
        dimensions: draft.dimensions.map((item) => (item.id === dimId ? { ...item, ...patch } : item)),
      })
    },
    [draft, emitChange],
  )

  const commitCell = useCallback(() => {
    if (!editingCell) return

    emitChange({
      ...draft,
      dimensions: draft.dimensions.map((dim) => {
        if (dim.id !== editingCell.dimId) return dim
        return {
          ...dim,
          levels: {
            ...dim.levels,
            [editingCell.level]: editValue,
          },
        }
      }),
    })

    setEditingCell(null)
    setEditValue("")
  }, [draft, editValue, editingCell, emitChange])

  const beginHeaderEdit = useCallback(
    (key: ColumnLabelKey) => {
      setEditingHeader(key)
      setHeaderEditValue(columnLabels[key])
    },
    [columnLabels],
  )

  const cancelHeaderEdit = useCallback(() => {
    setEditingHeader(null)
    setHeaderEditValue("")
  }, [])

  const commitHeaderEdit = useCallback(() => {
    if (!editingHeader) return

    const normalized = headerEditValue.trim()
    const nextColumnLabels: NonNullable<MockRubric["columnLabels"]> = {
      ...(draft.columnLabels ?? {}),
    }

    if (normalized) {
      nextColumnLabels[editingHeader] = normalized
    } else {
      delete nextColumnLabels[editingHeader]
    }

    emitChange({
      ...draft,
      columnLabels: Object.keys(nextColumnLabels).length > 0 ? nextColumnLabels : undefined,
    })

    setEditingHeader(null)
    setHeaderEditValue("")
  }, [draft, editingHeader, emitChange, headerEditValue])

  const addDimension = useCallback(() => {
    const nextDim: MockRubricDimension = {
      id: `dim-${Date.now()}`,
      name: `New Dimension ${draft.dimensions.length + 1}`,
      description: "Describe this dimension",
      weight: Math.max(5, Math.floor(100 / Math.max(draft.dimensions.length + 1, 1))),
      levels: {
        excellent: "Demonstrates excellent performance meeting high standards.",
        good: "Shows good performance meeting basic expectations.",
        passing: "Meets minimum passing requirements.",
        failing: "Does not meet basic requirements.",
      },
    }

    emitChange({
      ...draft,
      dimensions: [...draft.dimensions, nextDim],
    })
  }, [draft, emitChange])

  const removeDimension = useCallback(
    (dimId: string) => {
      if (draft.dimensions.length <= 1) return

      emitChange({
        ...draft,
        dimensions: draft.dimensions.filter((item) => item.id !== dimId),
      })

      if (rewritingDimId === dimId) {
        setRewritingDimId(null)
        setRewriteInput("")
        setRewriteError("")
        setRewriteLoading(false)
      }

      if (rewritePreview?.dimId === dimId) {
        setRewritePreview(null)
      }
    },
    [draft, emitChange, rewritePreview?.dimId, rewritingDimId],
  )

  const toggleInlineRewrite = useCallback(
    (dimId: string) => {
      if (rewriteLoading) return
      if (rewritingDimId === dimId) {
        setRewritingDimId(null)
        setRewriteInput("")
        setRewriteError("")
        setRewritePreview(null)
        return
      }

      setRewritingDimId(dimId)
      setRewriteInput("")
      setRewriteError("")
      setRewritePreview(null)
    },
    [rewriteLoading, rewritingDimId],
  )

  const submitInlineRewrite = useCallback(async () => {
    if (!rewritingDimId || rewriteLoading) return

    const instruction = rewriteInput.trim()
    if (!instruction) {
      setRewriteError("请输入改写建议")
      return
    }

    const currentDimension = draft.dimensions.find((item) => item.id === rewritingDimId)
    if (!currentDimension) {
      setRewriteError("未找到当前维度，请刷新后重试")
      return
    }

    setRewriteLoading(true)
    setRewriteError("")

    try {
      const response = await fetch(
        `/api/rubrics/${encodeURIComponent(draft.id || "rubric-stream")}/rewrite-dimension`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dimensionId: currentDimension.id,
            instruction,
            currentDimension,
          }),
        },
      )

      const payload = (await response.json().catch(() => null)) as
        | { dimension?: unknown; message?: string }
        | null

      if (!response.ok) {
        const message = extractRewriteError(payload, "重写失败，请重试")
        throw new Error(message)
      }

      const rewritten = normalizeDimension(payload?.dimension, currentDimension)
      setRewritePreview({
        dimId: currentDimension.id,
        before: currentDimension,
        after: rewritten,
      })
    } catch (error) {
      setRewriteError(error instanceof Error ? error.message : "重写失败，请重试")
    } finally {
      setRewriteLoading(false)
    }
  }, [draft, rewriteInput, rewriteLoading, rewritingDimId])

  const acceptInlineRewrite = useCallback(() => {
    if (!rewritePreview) return

    emitChange({
      ...draft,
      dimensions: draft.dimensions.map((item) =>
        item.id === rewritePreview.dimId ? rewritePreview.after : item,
      ),
    })

    setRewritePreview(null)
    setRewritingDimId(null)
    setRewriteInput("")
    setRewriteError("")
  }, [draft, emitChange, rewritePreview])

  const rejectInlineRewrite = useCallback(() => {
    setRewritePreview(null)
    setRewriteError("")
  }, [])

  const inlineRewriteExpanded = rewritingDimId !== null

  const renderHeaderCell = (
    key: ColumnLabelKey,
    className: string,
    textClassName?: string,
  ) => {
    const isEditing = editingHeader === key

    return (
      <th
        key={key}
        className={className}
        onDoubleClick={() => {
          if (!isEditing) beginHeaderEdit(key)
        }}
      >
        {isEditing ? (
          <input
            value={headerEditValue}
            onChange={(event) => setHeaderEditValue(event.target.value)}
            onBlur={commitHeaderEdit}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Escape") {
                event.preventDefault()
                cancelHeaderEdit()
                return
              }
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return
              event.preventDefault()
              commitHeaderEdit()
            }}
            autoFocus
            className="h-8 w-full rounded-md border border-indigo-300 px-2 text-sm text-gray-900 outline-hidden focus:ring-2 focus:ring-indigo-400/30"
          />
        ) : (
          <span className={cn("inline-block cursor-text select-none", textClassName)}>
            {columnLabels[key]}
          </span>
        )}
      </th>
    )
  }

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex h-full flex-col px-6 py-6"
    >
      <Card className="flex h-full flex-col">
      <Card.Header>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{draft.title}</h2>
          <p className="mt-1 text-sm text-gray-500">双击单元格可编辑，拖拽行可调整维度顺序。</p>
        </div>
      </Card.Header>
      <Card.Content className="flex flex-1 flex-col overflow-hidden">

      <div className="flex-1 overflow-auto rounded-xl border border-gray-200 shadow-xs">
        <DragDropProvider onDragEnd={handleDragEnd}>
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="w-[44px] px-3 py-3 text-left" />
                {renderHeaderCell("dimension", "w-[180px] px-3 py-3 text-left font-bold")}
                {LEVEL_COLUMNS.map((levelColumn) =>
                  renderHeaderCell(
                    levelColumn.labelKey,
                    "px-3 py-3 text-left font-bold",
                    levelColumn.headerColor,
                  ),
                )}
                {renderHeaderCell("weight", "w-[95px] px-3 py-3 text-center font-bold")}
                {renderHeaderCell("actions", "w-[120px] px-3 py-3 text-center font-bold")}
              </tr>
            </thead>
            <tbody>
                {draft.dimensions.map((dim, rowIndex) => {
                  const selected =
                    canvasSelection?.type === "rubric-dimension" &&
                    canvasSelection.itemId === dim.id
                  const showInlineRewrite = rewritingDimId === dim.id
                  const inlinePreview = rewritePreview?.dimId === dim.id ? rewritePreview : null
                  const showExternalRewrite =
                    !inlineRewriteExpanded &&
                    rewriteContext &&
                    rewriteContext.result?.selection.itemId === dim.id &&
                    (rewriteContext.status === "loading" || rewriteContext.status === "preview")

                  return (
                    <Fragment key={dim.id}>
                      <SortableRow
                        dim={dim}
                        rowIndex={rowIndex}
                        sortIndex={rowIndex}
                        columnLabels={columnLabels}
                        selected={selected}
                        editingCell={editingCell}
                        editValue={editValue}
                        rewriteLoading={rewriteLoading}
                        inlineRewriteOpen={showInlineRewrite}
                        onSelectDimension={onSelectDimension}
                        onChangeDimension={updateDimension}
                        onStartCellEdit={(dimId, level, value) => {
                          setEditingCell({ dimId, level })
                          setEditValue(value)
                        }}
                        onEditValueChange={setEditValue}
                        onCommitCell={commitCell}
                        onRemoveDimension={removeDimension}
                        onToggleInlineRewrite={toggleInlineRewrite}
                      />

                      {showInlineRewrite && (
                        <tr className="border-b border-gray-100 bg-white">
                          <td colSpan={RUBRIC_COLUMN_COUNT} className="px-3 pb-4 pt-1">
                            {inlinePreview ? (
                              <DiffPreview
                                title="AI 维度改写预览"
                                before={dimensionToText(inlinePreview.before, columnLabels)}
                                after={dimensionToText(inlinePreview.after, columnLabels)}
                                onAccept={acceptInlineRewrite}
                                onReject={rejectInlineRewrite}
                              />
                            ) : (
                              <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
                                <div className="flex items-center gap-2">
                                  <Sparkles className="h-4 w-4 text-indigo-600" />
                                  <input
                                    value={rewriteInput}
                                    onChange={(event) => setRewriteInput(event.target.value)}
                                    onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                                      if (event.key !== "Enter" || event.nativeEvent.isComposing) return
                                      event.preventDefault()
                                      void submitInlineRewrite()
                                    }}
                                    disabled={rewriteLoading}
                                    placeholder="告诉 AI 怎么写"
                                    className="h-10 flex-1 rounded-md border border-indigo-200 bg-white px-3 text-sm text-gray-800 outline-hidden transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-gray-100"
                                  />
                                  <Button
                                    isIconOnly
                                    variant="ghost"
                                    onPress={() => void submitInlineRewrite()}
                                    isDisabled={rewriteLoading || !rewriteInput.trim()}
                                    className="h-10 w-10 min-w-0"
                                    aria-label="Send rewrite"
                                  >
                                    {rewriteLoading ? (
                                      <Spinner size="sm" className="h-4 w-4" />
                                    ) : (
                                      <SendHorizontal className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                                {rewriteError ? (
                                  <Alert color="danger" className="mt-2 text-xs">
                                    {rewriteError}
                                  </Alert>
                                ) : (
                                  <p className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                                    {"\u6309"}{" "}
                                    <Kbd><Kbd.Abbr keyValue="enter" /></Kbd>
                                    {" "}{"\u53EF\u53D1\u9001\u6539\u5199\u5EFA\u8BAE"}
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}

                      {showExternalRewrite ? (
                        <tr className="border-b border-gray-100 bg-white">
                          <td colSpan={RUBRIC_COLUMN_COUNT} className="px-3 pb-4 pt-1">
                            {rewriteContext?.status === "loading" && (
                              <div className="flex items-center gap-2 py-2">
                                <Spinner size="sm" />
                                <span className="text-xs text-gray-500">AI 正在改写...</span>
                              </div>
                            )}
                            {rewriteContext?.status === "preview" && rewriteContext.result && (
                              <DiffPreview
                                title="AI 维度改写预览"
                                before={rewriteContext.result.beforeText}
                                after={rewriteContext.result.afterText}
                                onAccept={() => onAcceptRewrite?.()}
                                onReject={() => onRejectRewrite?.()}
                              />
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
            </tbody>
          </table>
        </DragDropProvider>
      </div>

      <Separator className="mt-4" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onPress={addDimension}>
          <Plus className="h-3.5 w-3.5" />
          添加维度
        </Button>
        <span className="text-xs text-gray-500">当前总权重：{totalWeight}%</span>
        <ButtonGroup className="ml-auto">
          {isCompleted ? (
            <Button variant="secondary" size="sm" onPress={() => onAction?.("export_rubric_pdf")} isDisabled={!!pdfExporting}>
              {pdfExporting === "export_rubric_pdf" ? (
                <Spinner size="sm" className="h-3.5 w-3.5" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {pdfExporting === "export_rubric_pdf" ? "正在生成..." : "导出 PDF"}
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onPress={() => onAction?.("save_rubric")}>
            保存 Rubric
          </Button>
        </ButtonGroup>
      </div>
      </Card.Content>
      </Card>
    </motion.div>
  )
}
