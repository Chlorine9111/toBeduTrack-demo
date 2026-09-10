"use client"

import { useState, useCallback, useRef, type KeyboardEvent } from "react"
import { motion, AnimatePresence } from "motion/react"
import { DragDropProvider } from "@dnd-kit/react"
import { useSortable } from "@dnd-kit/react/sortable"
import { move } from "@dnd-kit/helpers"
import { GripVertical, ChevronDown, X } from "lucide-react"
import type { RubricPartData, RubricItemData } from "@/lib/landing/mock-data"
import { useLanguage } from "@/lib/landing/i18n"
import { MathSpan } from "./MathSpan"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RubricPanelProps {
  visible: boolean
  loading?: boolean
  onInteracted?: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deepCloneParts(parts: RubricPartData[]): RubricPartData[] {
  return parts.map((part) => ({
    ...part,
    items: part.items.map((item) => ({ ...item })),
  }))
}

function computePartPoints(items: RubricItemData[]): number {
  return items.reduce((sum, item) => sum + item.points, 0)
}

function computeTotalPoints(parts: RubricPartData[]): number {
  return parts.reduce((sum, part) => sum + computePartPoints(part.items), 0)
}

// ---------------------------------------------------------------------------
// SortableItem - single rubric criterion row
// ---------------------------------------------------------------------------

interface SortableItemProps {
  item: RubricItemData
  isLast: boolean
  canDelete: boolean
  onPointsChange: (id: string, points: number) => void
  onDelete: (id: string) => void
  onInteracted?: () => void
}

function SortableItem({
  item,
  index,
  isLast,
  canDelete,
  onPointsChange,
  onDelete,
  onInteracted,
}: SortableItemProps & { index: number }) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(String(item.points))
  const inputRef = useRef<HTMLInputElement>(null)
  const { t } = useLanguage()

  const { ref, handleRef, isDragging } = useSortable({ id: item.id, index })

  const handleStartEdit = useCallback(() => {
    setEditValue(String(item.points))
    setEditing(true)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [item.points])

  const handleCommit = useCallback(() => {
    setEditing(false)
    const parsed = parseInt(editValue, 10)
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 5) {
      onPointsChange(item.id, parsed)
      onInteracted?.()
    } else {
      setEditValue(String(item.points))
    }
  }, [editValue, item.id, item.points, onPointsChange, onInteracted])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleCommit()
      }
    },
    [handleCommit]
  )

  return (
    <div
      ref={ref}
      className={`group flex items-center gap-2 px-4 py-2.5 ${
        isLast ? "" : "border-b border-slate-100"
      } ${isDragging ? "bg-white shadow-md rounded-lg z-50 relative" : ""}`}
    >
      {/* Drag handle */}
      <button
        ref={handleRef}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing transition-all duration-150"
        aria-label="Drag to reorder"
        tabIndex={-1}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* Description */}
      <MathSpan
        text={item.description}
        className="flex-1 text-sm text-slate-700 leading-snug"
      />

      {/* Point pill / edit input */}
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          min={0}
          max={5}
          step={1}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
          className="w-12 h-6 text-xs text-center font-medium border border-amber-300 rounded-full bg-amber-50 text-amber-700 outline-hidden focus:ring-2 focus:ring-amber-300/50"
        />
      ) : (
        <button
          onClick={handleStartEdit}
          className="shrink-0 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 text-xs font-medium hover:bg-amber-100 transition-colors duration-150 cursor-pointer"
        >
          {item.points} {t.rubricPanel.ptUnit}
        </button>
      )}

      {/* Delete button */}
      {canDelete && (
        <button
          onClick={() => {
            onDelete(item.id)
            onInteracted?.()
          }}
          className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-all duration-150"
          aria-label="Delete item"
          tabIndex={-1}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PartCard - a collapsible part with sortable items
// ---------------------------------------------------------------------------

interface PartCardProps {
  part: RubricPartData
  onReorder: (partId: string, oldIndex: number, newIndex: number) => void
  onPointsChange: (partId: string, itemId: string, points: number) => void
  onDeleteItem: (partId: string, itemId: string) => void
  onInteracted?: () => void
}

function PartCard({
  part,
  onReorder,
  onPointsChange,
  onDeleteItem,
  onInteracted,
}: PartCardProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { t } = useLanguage()

  const partPoints = computePartPoints(part.items)
  const canDelete = part.items.length > 1

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => !prev)
  }, [])

  return (
    <div className="border border-slate-200/80 rounded-xl shadow-xs overflow-hidden bg-white">
      {/* Part header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between bg-slate-50/80 px-4 py-3 cursor-pointer select-none hover:bg-slate-100/60 transition-colors duration-150"
      >
        <div className="flex items-center gap-2">
          <motion.span
            animate={{ rotate: collapsed ? -90 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-slate-400"
          >
            <ChevronDown className="w-4 h-4" />
          </motion.span>
          <span className="text-sm font-semibold text-slate-800">
            {part.label}
          </span>
          <span className="text-sm text-slate-500">&mdash;</span>
          <MathSpan
            text={part.title}
            className="text-sm text-slate-600"
          />
        </div>
        <span className="text-xs font-semibold text-slate-500 tabular-nums">
          {partPoints} {t.rubricPanel.pointsUnit}
        </span>
      </button>

      {/* Collapsible body */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <DragDropProvider
              onDragEnd={(event) => {
                if (event.canceled) return
                const { source, target } = event.operation
                if (!target || source?.id === target.id) return
                const oldIndex = part.items.findIndex((i) => i.id === source?.id)
                const newIndex = part.items.findIndex((i) => i.id === target.id)
                if (oldIndex === -1 || newIndex === -1) return
                onReorder(part.id, oldIndex, newIndex)
                onInteracted?.()
              }}
            >
              <AnimatePresence initial={false}>
                {part.items.map((item, idx) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 1, x: 0 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 60 }}
                    transition={{ duration: 0.2 }}
                  >
                    <SortableItem
                      item={item}
                      index={idx}
                      isLast={idx === part.items.length - 1}
                      canDelete={canDelete}
                      onPointsChange={(itemId, pts) =>
                        onPointsChange(part.id, itemId, pts)
                      }
                      onDelete={(itemId) => onDeleteItem(part.id, itemId)}
                      onInteracted={onInteracted}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </DragDropProvider>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function RubricSkeleton({ active = false }: { active?: boolean }) {
  const cls = active ? "skeleton-line--active" : "skeleton-line"
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-slate-200/60 overflow-hidden"
        >
          <div className={`${cls} h-11 rounded-none`} />
          <div className="px-4 py-3 space-y-2">
            <div className={`${cls} h-4 rounded w-full`} />
            <div className={`${cls} h-4 rounded w-4/5`} />
            <div className={`${cls} h-4 rounded w-3/5`} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RubricPanel (main export)
// ---------------------------------------------------------------------------

export default function RubricPanel({ visible, loading, onInteracted }: RubricPanelProps) {
  const { t, rubricData } = useLanguage()
  const [parts, setParts] = useState<RubricPartData[]>(() =>
    deepCloneParts(rubricData)
  )

  const totalPoints = computeTotalPoints(parts)

  // -- Handlers (immutable updates) --

  const handleReorder = useCallback(
    (partId: string, oldIndex: number, newIndex: number) => {
      setParts((prev) =>
        prev.map((part) => {
          if (part.id !== partId) return part
          return {
            ...part,
            items: (() => {
              const next = [...part.items]
              const [removed] = next.splice(oldIndex, 1)
              next.splice(newIndex, 0, removed)
              return next
            })(),
          }
        })
      )
    },
    []
  )

  const handlePointsChange = useCallback(
    (partId: string, itemId: string, points: number) => {
      setParts((prev) =>
        prev.map((part) => {
          if (part.id !== partId) return part
          return {
            ...part,
            items: part.items.map((item) =>
              item.id === itemId ? { ...item, points } : item
            ),
          }
        })
      )
    },
    []
  )

  const handleDeleteItem = useCallback(
    (partId: string, itemId: string) => {
      setParts((prev) =>
        prev.map((part) => {
          if (part.id !== partId) return part
          if (part.items.length <= 1) return part
          return {
            ...part,
            items: part.items.filter((item) => item.id !== itemId),
          }
        })
      )
    },
    []
  )

  return (
    <div className="h-full flex flex-col">
      {/* Skeleton state */}
      {!visible && <RubricSkeleton active={loading} />}

      {/* Content state */}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-4"
          >
            {/* Title bar */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <h3 className="font-display text-lg font-bold text-slate-900">
                {t.rubricPanel.title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.rubricPanel.unitInfo} | {t.rubricPanel.totalLabel}{" "}
                <span className="font-semibold tabular-nums">
                  {totalPoints}
                </span>{" "}
                {t.rubricPanel.pointsUnit}
              </p>
            </motion.div>

            {/* Part cards - staggered entrance */}
            <div className="space-y-3">
              {parts.map((part, index) => (
                <motion.div
                  key={part.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.15 + index * 0.2,
                    duration: 0.4,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                >
                  <PartCard
                    part={part}
                    onReorder={handleReorder}
                    onPointsChange={handlePointsChange}
                    onDeleteItem={handleDeleteItem}
                    onInteracted={onInteracted}
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
