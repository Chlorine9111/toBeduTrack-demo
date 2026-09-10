"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import { ChevronDown, Eye, EyeOff, Sparkles, BookOpen } from "lucide-react"
import type { WorksheetStepData } from "@/lib/landing/mock-data"
import { useLanguage } from "@/lib/landing/i18n"
import { MathSpan } from "./MathSpan"

// --- Types ---

interface WorksheetPanelProps {
  visible: boolean
  loading?: boolean
  onInteracted?: () => void
}

// --- Constants ---

const STEP_BADGE_COLORS: Record<number, { bg: string; ring: string; icon: string }> = {
  1: { bg: "bg-blue-500", ring: "ring-blue-200", icon: "text-blue-100" },
  2: { bg: "bg-violet-500", ring: "ring-violet-200", icon: "text-violet-100" },
  3: { bg: "bg-amber-500", ring: "ring-amber-200", icon: "text-amber-100" },
  4: { bg: "bg-rose-500", ring: "ring-rose-200", icon: "text-rose-100" },
}

const STEP_ACCENT_BORDERS: Record<number, string> = {
  1: "border-l-blue-400",
  2: "border-l-violet-400",
  3: "border-l-amber-400",
  4: "border-l-rose-400",
}

const CARD_REVEAL_DELAY = 0.5
const CARD_EASE = [0.25, 0.46, 0.45, 0.94] as const

// --- Animation Variants ---

const contentVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
}

const collapseVariants = {
  open: {
    height: "auto" as const,
    opacity: 1,
    transition: { duration: 0.3, ease: CARD_EASE },
  },
  collapsed: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.25, ease: CARD_EASE },
  },
}

// --- Sub-components ---

function SkeletonPlaceholder({ active = false }: { active?: boolean }) {
  const cls = active ? "skeleton-line--active" : "skeleton-line"
  return (
    <div className="space-y-4 p-2">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="rounded-xl overflow-hidden"
        >
          <div
            className={`${cls} rounded-none`}
            style={{ height: i === 1 ? 52 : 48 }}
          />
          <div className="px-4 py-3 space-y-2 bg-white border border-t-0 border-slate-100 rounded-b-xl">
            <div className={`${cls} h-4 rounded w-full`} />
            <div className={`${cls} h-4 rounded w-4/5`} />
            {i <= 2 && <div className={`${cls} h-4 rounded w-3/5`} />}
          </div>
        </div>
      ))}
    </div>
  )
}

function StepBadge({ number }: { number: number }) {
  const colors = STEP_BADGE_COLORS[number] ?? { bg: "bg-slate-500", ring: "ring-slate-200", icon: "text-slate-100" }
  return (
    <div
      className={`${colors.bg} ring-2 ${colors.ring} w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-xs`}
    >
      <span className={`font-bold text-sm ${colors.icon}`}>{number}</span>
    </div>
  )
}

function HintBox({
  hintSteps,
  hintsVisible,
  onToggle,
}: {
  hintSteps: string[]
  hintsVisible: boolean
  onToggle: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="border border-violet-200 bg-linear-to-br from-violet-50/80 to-purple-50/40 rounded-xl p-4 mt-3 shadow-xs">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-500" />
          <span className="text-xs font-semibold text-violet-700 uppercase tracking-wide">{t.worksheetPanel.scaffoldedHints}</span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium text-violet-600 hover:bg-violet-100/80 transition-colors"
          aria-label={hintsVisible ? "Hide hints" : "Show hints"}
        >
          {hintsVisible ? (
            <>
              <Eye className="w-3.5 h-3.5" />
              <span>{t.worksheetPanel.hideButton}</span>
            </>
          ) : (
            <>
              <EyeOff className="w-3.5 h-3.5" />
              <span>{t.worksheetPanel.revealButton}</span>
            </>
          )}
        </button>
      </div>
      <AnimatePresence mode="wait">
        {hintsVisible ? (
          <motion.div
            key="hint-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            {hintSteps.map((step, idx) => (
              <div key={idx} className="flex items-start gap-2 pl-1">
                <span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-600 text-[10px] font-bold flex items-center justify-center mt-0.5">
                  {idx + 1}
                </span>
                <MathSpan text={step} className="text-sm text-violet-700 leading-relaxed" />
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="hint-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2 py-1"
          >
            <div className="flex gap-1">
              {hintSteps.map((_, idx) => (
                <div key={idx} className="w-6 h-1.5 rounded-full bg-violet-200" />
              ))}
            </div>
            <span className="text-xs text-violet-400 italic ml-1">
              {hintSteps.length} {t.worksheetPanel.stepsHidden}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function DifficultyToggle({
  isAdvanced,
  onToggle,
}: {
  isAdvanced: boolean
  onToggle: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="bg-slate-100/80 backdrop-blur-xs rounded-lg p-0.5 flex border border-slate-200/60">
      <button
        type="button"
        onClick={() => {
          if (isAdvanced) onToggle()
        }}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
          !isAdvanced
            ? "bg-white shadow-xs text-slate-800 ring-1 ring-slate-200/60"
            : "text-slate-500 hover:text-slate-600"
        }`}
      >
        {t.worksheetPanel.standardLabel}
      </button>
      <button
        type="button"
        onClick={() => {
          if (!isAdvanced) onToggle()
        }}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1 ${
          isAdvanced
            ? "bg-white shadow-xs text-slate-800 ring-1 ring-slate-200/60"
            : "text-slate-500 hover:text-slate-600"
        }`}
      >
        {t.worksheetPanel.advancedLabel}
        {isAdvanced && <Sparkles className="w-3 h-3 text-amber-500" />}
      </button>
    </div>
  )
}

function StepCard({
  step,
  index,
  isCollapsed,
  onToggleCollapse,
  hintsVisible,
  onToggleHints,
  revealed,
}: {
  step: WorksheetStepData
  index: number
  isCollapsed: boolean
  onToggleCollapse: () => void
  hintsVisible: boolean
  onToggleHints: () => void
  revealed: boolean
}) {
  const isStep2 = step.number === 2
  const showHints = isStep2 && step.hintSteps && step.hintSteps.length > 0
  const accentBorder = STEP_ACCENT_BORDERS[step.number] ?? "border-l-slate-400"

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={
        revealed
          ? {
              opacity: 1,
              y: 0,
              transition: {
                delay: index * CARD_REVEAL_DELAY,
                duration: 0.5,
                ease: CARD_EASE,
              },
            }
          : { opacity: 0, y: 24 }
      }
      className={`bg-white border border-slate-200/80 border-l-[3px] ${accentBorder} rounded-xl shadow-xs hover:shadow-md transition-shadow overflow-hidden`}
    >
      {/* Step Header */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="w-full flex items-center gap-3 p-4 hover:bg-slate-50/60 transition-colors text-left"
      >
        <StepBadge number={step.number} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">{step.title}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{step.subtitle}</p>
        </div>
        <motion.div
          animate={{ rotate: isCollapsed ? 0 : 180 }}
          transition={{ duration: 0.25 }}
        >
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </motion.div>
      </button>

      {/* Collapsible Content */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            key="content"
            variants={collapseVariants}
            initial="collapsed"
            animate="open"
            exit="collapsed"
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2">
              {/* Lines with AnimatePresence for crossfade on difficulty switch */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={step.id}
                  variants={contentVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="space-y-3"
                >
                  {step.lines.map((line) => (
                    <div key={line.id} className="group/line">
                      <MathSpan
                        text={line.text}
                        className="text-sm text-slate-700 leading-relaxed"
                      />
                      {line.subLines && line.subLines.length > 0 && (
                        <div className="ml-6 mt-1.5 space-y-1 border-l-2 border-slate-100 pl-3">
                          {line.subLines.map((sub, subIdx) => (
                            <MathSpan
                              key={subIdx}
                              text={sub}
                              className="text-sm text-slate-400 italic block"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </motion.div>
              </AnimatePresence>

              {/* Hint Box for Step 2 */}
              {showHints && (
                <HintBox
                  hintSteps={step.hintSteps!}
                  hintsVisible={hintsVisible}
                  onToggle={onToggleHints}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// --- Main Component ---

export default function WorksheetPanel({
  visible,
  loading,
  onInteracted,
}: WorksheetPanelProps) {
  const { t, worksheetStandard, worksheetAdvanced } = useLanguage()
  const [isAdvanced, setIsAdvanced] = useState(false)
  const [hintsVisible, setHintsVisible] = useState(true)
  const [collapsedSteps, setCollapsedSteps] = useState<Set<string>>(new Set())
  const [revealed, setRevealed] = useState(false)

  // Trigger reveal once visible becomes true
  useEffect(() => {
    if (visible && !revealed) {
      setRevealed(true)
    }
  }, [visible, revealed])

  // Build the current steps list based on difficulty
  const currentSteps = useMemo<WorksheetStepData[]>(() => {
    const source = isAdvanced ? worksheetAdvanced : worksheetStandard
    return source.map((step) => ({ ...step }))
  }, [isAdvanced, worksheetStandard, worksheetAdvanced])

  const handleDifficultyToggle = useCallback(() => {
    setIsAdvanced((prev) => !prev)
    onInteracted?.()
  }, [onInteracted])

  const handleHintsToggle = useCallback(() => {
    setHintsVisible((prev) => !prev)
    onInteracted?.()
  }, [onInteracted])

  const handleCollapseToggle = useCallback((stepId: string) => {
    setCollapsedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(stepId)) {
        next.delete(stepId)
      } else {
        next.add(stepId)
      }
      return next
    })
  }, [])

  // Show skeleton when not yet visible
  if (!visible) {
    return <SkeletonPlaceholder active={loading} />
  }

  return (
    <div className="h-full overflow-y-auto landing-scrollbar p-4">
      {/* Worksheet Header */}
      <div className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="w-4.5 h-4.5 text-slate-400" />
              <h2 className="font-display text-base font-bold text-slate-800">
                {t.worksheetPanel.title}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1 ml-6">
              {t.worksheetPanel.unitInfo} | {t.worksheetPanel.courseInfo}
            </p>
          </div>
          <DifficultyToggle
            isAdvanced={isAdvanced}
            onToggle={handleDifficultyToggle}
          />
        </div>
        <div className="flex gap-6 mt-3 text-sm text-slate-300 ml-6">
          <span>{t.worksheetPanel.nameField}</span>
          <span>{t.worksheetPanel.dateField}</span>
        </div>
      </div>

      {/* Step Cards */}
      <div className="space-y-3">
        {currentSteps.map((step, index) => (
          <StepCard
            key={step.id}
            step={step}
            index={index}
            isCollapsed={collapsedSteps.has(step.id)}
            onToggleCollapse={() => handleCollapseToggle(step.id)}
            hintsVisible={hintsVisible}
            onToggleHints={handleHintsToggle}
            revealed={revealed}
          />
        ))}
      </div>
    </div>
  )
}
