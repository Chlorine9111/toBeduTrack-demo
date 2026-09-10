"use client"

import { useRef, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "@/lib/utils"

export type StepStatus = "pending" | "active" | "completed" | "failed"

export interface TimelineStep {
  id: string
  label: string
  status: StepStatus
  detail?: string
}

interface GenerationTimelineProps {
  steps: TimelineStep[]
  elapsed?: number
  className?: string
}

function AnimatedDots() {
  return (
    <span className="inline-flex w-[18px]">
      <span className="animate-[dotPulse_1.4s_infinite_0s]">.</span>
      <span className="animate-[dotPulse_1.4s_infinite_0.2s]">.</span>
      <span className="animate-[dotPulse_1.4s_infinite_0.4s]">.</span>
    </span>
  )
}

function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}m ${remaining}s`
}

export default function GenerationTimeline({
  steps,
  elapsed,
  className,
}: GenerationTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [steps])

  const visibleSteps = steps.filter((s) => s.status !== "pending")
  const isAllDone = steps.length > 0 && steps.every((s) => s.status === "completed")

  return (
    <div className={cn("space-y-0.5", className)}>
      <div ref={scrollRef} className="max-h-[240px] overflow-y-auto">
        <AnimatePresence initial={false}>
          {visibleSteps.map((step) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <p className="py-[3px] font-mono text-[13px] leading-relaxed text-gray-500">
                {step.label}
                {step.status === "active" && <AnimatedDots />}
                {step.status === "completed" && (
                  <span className="ml-1.5 text-gray-400">&#10003;</span>
                )}
                {step.status === "failed" && (
                  <span className="ml-1.5 text-red-400">&#10007;</span>
                )}
                {step.detail && (
                  <span className="ml-2 text-gray-400">{step.detail}</span>
                )}
              </p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {typeof elapsed === "number" && elapsed > 0 && isAllDone && (
        <p className="font-mono text-[11px] text-gray-400">
          {formatElapsed(elapsed)}
        </p>
      )}
    </div>
  )
}
