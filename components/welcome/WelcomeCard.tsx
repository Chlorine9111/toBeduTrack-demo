"use client"

import { useState, useCallback } from "react"
import { motion } from "motion/react"
import { useCardTilt } from "./use-card-tilt"
import CardFront from "./CardFront"
import CardBack from "./CardBack"
import { NOISE_SVG } from "./noise"
import type { WelcomeTheme } from "./themes"

type WelcomeCardProps = {
  theme: WelcomeTheme
  teacherName: string
  globalRank: number
  schoolRank: number | null
  joinDate: string
  schoolName: string | null
  animationReady: boolean
}

/**
 * 4-layer shadow system simulating physical card depth:
 * 1. Contact shadow — paper touching surface (very tight)
 * 2. Penumbra — close diffused shadow
 * 3. Ambient — mid-range environmental shadow
 * 4. Atmosphere — wide, barely-visible depth cue
 */
function cardShadow(c: string, hovering: boolean) {
  if (hovering) {
    return [
      `0 0.5px 0.5px rgba(${c},0.12)`,
      `0 2px 4px rgba(${c},0.08)`,
      `0 8px 24px rgba(${c},0.07)`,
      `0 32px 64px rgba(${c},0.05)`,
    ].join(", ")
  }
  return [
    `0 0.3px 0.5px rgba(${c},0.1)`,
    `0 1px 2px rgba(${c},0.06)`,
    `0 4px 12px rgba(${c},0.04)`,
    `0 16px 40px rgba(${c},0.03)`,
  ].join(", ")
}

export default function WelcomeCard({
  theme,
  teacherName,
  globalRank,
  schoolRank,
  joinDate,
  schoolName,
  animationReady,
}: WelcomeCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const { containerRef, glossRef, rotateX, rotateY, onMouseMove, onMouseLeave } =
    useCardTilt()

  const toggleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev)
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      onMouseMove(e)
      if (!isHovering) setIsHovering(true)
    },
    [onMouseMove, isHovering],
  )

  const handleMouseLeave = useCallback(() => {
    onMouseLeave()
    setIsHovering(false)
  }, [onMouseLeave])

  const isLightTheme = theme.name !== "dark"

  const faceBase = {
    borderRadius: "8px",
    boxShadow: cardShadow(theme.shadowColor, isHovering),
    transition: "box-shadow 0.4s ease",
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full cursor-pointer select-none"
      style={{ perspective: "1200px" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={toggleFlip}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault()
          toggleFlip()
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={isFlipped ? "Click to see front" : "Click to see back"}
    >
      {/* 3D tilt layer */}
      <motion.div style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}>
        {/* Flip layer */}
        <motion.div
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* ═══════ Front face ═══════ */}
          <div
            className="relative w-full overflow-hidden"
            style={{
              ...faceBase,
              backfaceVisibility: "hidden",
              backgroundColor: theme.cardBg,
              aspectRatio: "16 / 10",
            }}
          >
            {/* Layer 1: Outer border — simulates die-cut edge */}
            <div
              className="pointer-events-none absolute inset-0 rounded-[8px]"
              style={{
                boxShadow: `inset 0 0 0 0.5px ${theme.cardBorder}`,
              }}
            />

            {/* Layer 2: Inner shadow — paper edge catch */}
            <div
              className="pointer-events-none absolute inset-0 rounded-[8px]"
              style={{
                boxShadow: isLightTheme
                  ? `inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 2px rgba(${theme.shadowColor},0.04)`
                  : `inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 2px rgba(0,0,0,0.2)`,
              }}
            />

            {/* Layer 3: Paper grain texture */}
            <div
              className="pointer-events-none absolute inset-0 rounded-[8px]"
              style={{
                backgroundImage: NOISE_SVG,
                backgroundRepeat: "repeat",
                backgroundSize: "180px 180px",
                opacity: isLightTheme ? 0.5 : 0.15,
                mixBlendMode: isLightTheme ? "multiply" : "soft-light",
              }}
            />

            {/* Layer 4: Specular highlight — follows mouse */}
            <div
              ref={glossRef}
              className="pointer-events-none absolute inset-0 rounded-[8px]"
              style={{
                background: `radial-gradient(ellipse 50% 40% at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,${isLightTheme ? 0.15 : 0.06}), transparent 65%)`,
                opacity: isHovering ? 1 : 0,
                transition: "opacity 0.35s ease",
              }}
            />

            {/* Layer 5: Top edge highlight — simulates light hitting card top */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-[8px]"
              style={{
                background: isLightTheme
                  ? "linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.8) 50%, transparent 90%)"
                  : "linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.06) 50%, transparent 90%)",
              }}
            />

            <CardFront
              theme={theme}
              teacherName={teacherName}
              globalRank={globalRank}
              schoolRank={schoolRank}
              schoolName={schoolName}
              animationReady={animationReady}
            />
          </div>

          {/* ═══════ Back face ═══════ */}
          <div
            className="absolute inset-0 w-full overflow-hidden"
            style={{
              ...faceBase,
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              backgroundColor: theme.cardBg,
              aspectRatio: "16 / 10",
            }}
          >
            {/* Same physical layers as front */}
            <div
              className="pointer-events-none absolute inset-0 rounded-[8px]"
              style={{
                boxShadow: `inset 0 0 0 0.5px ${theme.cardBorder}`,
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 rounded-[8px]"
              style={{
                boxShadow: isLightTheme
                  ? `inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 2px rgba(${theme.shadowColor},0.04)`
                  : `inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 2px rgba(0,0,0,0.2)`,
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 rounded-[8px]"
              style={{
                backgroundImage: NOISE_SVG,
                backgroundRepeat: "repeat",
                backgroundSize: "180px 180px",
                opacity: isLightTheme ? 0.5 : 0.15,
                mixBlendMode: isLightTheme ? "multiply" : "soft-light",
              }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-[8px]"
              style={{
                background: isLightTheme
                  ? "linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.8) 50%, transparent 90%)"
                  : "linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.06) 50%, transparent 90%)",
              }}
            />
            <CardBack theme={theme} schoolName={schoolName} joinDate={joinDate} />
          </div>

          {/* ═══════ Card edge — physical thickness ═══════ */}
          <div
            className="pointer-events-none absolute inset-x-[1px] -bottom-[2.5px] h-[2.5px] rounded-b-[7px]"
            style={{
              background: isLightTheme
                ? `linear-gradient(180deg, rgba(${theme.shadowColor},0.06), rgba(${theme.shadowColor},0.12))`
                : `linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))`,
            }}
          />
          {/* Side edge hint on left */}
          <div
            className="pointer-events-none absolute -left-[1px] bottom-[2px] top-[2px] w-[1.5px] rounded-l-[7px]"
            style={{
              background: isLightTheme
                ? `linear-gradient(180deg, transparent, rgba(${theme.shadowColor},0.04), transparent)`
                : `linear-gradient(180deg, transparent, rgba(255,255,255,0.02), transparent)`,
            }}
          />
          {/* Side edge hint on right */}
          <div
            className="pointer-events-none absolute -right-[1px] bottom-[2px] top-[2px] w-[1.5px] rounded-r-[7px]"
            style={{
              background: isLightTheme
                ? `linear-gradient(180deg, transparent, rgba(${theme.shadowColor},0.04), transparent)`
                : `linear-gradient(180deg, transparent, rgba(255,255,255,0.02), transparent)`,
            }}
          />
        </motion.div>
      </motion.div>
    </div>
  )
}
