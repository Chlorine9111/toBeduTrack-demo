"use client"

import { useRef, useCallback, useEffect } from "react"
import {
  useMotionValue,
  useTransform,
  useSpring,
  type MotionValue,
} from "motion/react"

const SPRING_CONFIG = { stiffness: 150, damping: 15, mass: 0.5 }
const MAX_TILT = 8 // degrees

type CardTiltReturn = {
  containerRef: React.RefObject<HTMLDivElement | null>
  glossRef: React.RefObject<HTMLDivElement | null>
  rotateX: MotionValue<number>
  rotateY: MotionValue<number>
  onMouseMove: (e: React.MouseEvent) => void
  onMouseLeave: () => void
}

export function useCardTilt(): CardTiltReturn {
  const containerRef = useRef<HTMLDivElement>(null)
  const glossRef = useRef<HTMLDivElement>(null)

  // Raw mouse position relative to card center (-1 to 1)
  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)

  // Mouse position as percentage (0-100) for gloss CSS variable
  const mouseXPct = useMotionValue(50)
  const mouseYPct = useMotionValue(50)

  // Map to rotation with spring physics
  const rotateX = useSpring(
    useTransform(rawY, [-1, 1], [MAX_TILT, -MAX_TILT]),
    SPRING_CONFIG,
  )
  const rotateY = useSpring(
    useTransform(rawX, [-1, 1], [-MAX_TILT, MAX_TILT]),
    SPRING_CONFIG,
  )

  // Update gloss gradient position via CSS variables (no re-renders)
  useEffect(() => {
    const unsubX = mouseXPct.on("change", (v) => {
      glossRef.current?.style.setProperty("--mx", `${v}%`)
    })
    const unsubY = mouseYPct.on("change", (v) => {
      glossRef.current?.style.setProperty("--my", `${v}%`)
    })
    return () => {
      unsubX()
      unsubY()
    }
  }, [mouseXPct, mouseYPct])

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width // 0..1
      const y = (e.clientY - rect.top) / rect.height // 0..1
      rawX.set(x * 2 - 1)
      rawY.set(y * 2 - 1)
      mouseXPct.set(x * 100)
      mouseYPct.set(y * 100)
    },
    [rawX, rawY, mouseXPct, mouseYPct],
  )

  const onMouseLeave = useCallback(() => {
    rawX.set(0)
    rawY.set(0)
    mouseXPct.set(50)
    mouseYPct.set(50)
  }, [rawX, rawY, mouseXPct, mouseYPct])

  return { containerRef, glossRef, rotateX, rotateY, onMouseMove, onMouseLeave }
}
