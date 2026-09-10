"use client"

import { motion } from "motion/react"
import NumberCounter from "./NumberCounter"
import { DeskmateLogo } from "./noise"
import type { WelcomeTheme } from "./themes"

type CardFrontProps = {
  theme: WelcomeTheme
  teacherName: string
  globalRank: number
  schoolRank: number | null
  schoolName: string | null
  animationReady: boolean
}

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1]

function fadeIn(delay: number) {
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay, ease: EASE_OUT },
  }
}

export default function CardFront({
  theme,
  teacherName,
  globalRank,
  schoolRank,
  schoolName,
  animationReady,
}: CardFrontProps) {
  const ordinal = (n: number) => {
    const suffixes = ["th", "st", "nd", "rd"]
    const mod100 = n % 100
    return `${n}${suffixes[(mod100 - 20) % 10] || suffixes[mod100] || suffixes[0]}`
  }

  return (
    <div className="flex h-full w-full">
      {/* ── Left: school identity ── */}
      <div
        className="relative flex w-[32%] flex-col items-center justify-center"
        style={{ backgroundColor: theme.leftBg, isolation: "isolate" }}
      >
        {/* Right edge line */}
        <div
          className="absolute bottom-[10%] right-0 top-[10%] w-px"
          style={{ backgroundColor: theme.divider }}
        />

        <motion.div
          {...(animationReady ? fadeIn(0.5) : { initial: { opacity: 0 } })}
          className="flex flex-col items-center justify-center gap-3 px-4"
        >
          <DeskmateLogo size={44} color={theme.textPrimary} opacity={0.58} />
          <div className="flex flex-col items-center gap-1 text-center">
            <span
              className="text-[9px] font-semibold tracking-[0.15em]"
              style={{ color: theme.textPrimary, opacity: 0.42 }}
            >
              DESKMATE
            </span>
            {schoolName ? (
              <span
                className="max-w-[120px] text-[8px] font-medium uppercase tracking-[0.12em]"
                style={{ color: theme.textMuted }}
              >
                {schoolName}
              </span>
            ) : null}
          </div>
        </motion.div>
      </div>

      {/* ── Right: content ── */}
      <div className="flex w-[68%] flex-col justify-between py-[24px] pl-[28px] pr-[24px]">
        {/* Top tag */}
        <motion.div
          {...(animationReady ? fadeIn(0.7) : { initial: { opacity: 0 } })}
        >
          <span
            className="text-[9px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: theme.textMuted }}
          >
            Welcome to Deskmate
          </span>
        </motion.div>

        {/* Center: teacher identity */}
        <div className="flex flex-col">
          <motion.h2
            {...(animationReady ? fadeIn(0.85) : { initial: { opacity: 0 } })}
            className="text-[24px] font-semibold leading-[1.1] tracking-[-0.02em] md:text-[28px]"
            style={{ color: theme.textPrimary }}
          >
            {teacherName}
          </motion.h2>

          <motion.div
            {...(animationReady ? fadeIn(1.0) : { initial: { opacity: 0 } })}
            className="mt-2 text-[52px] leading-[0.9] md:text-[62px]"
          >
            <NumberCounter
              value={globalRank}
              padLength={4}
              delay={animationReady ? 1.0 : 999}
              accentColor={theme.accent}
              tooltipBg={theme.textPrimary}
              tooltipText={theme.cardBg}
            />
          </motion.div>

          <motion.div
            {...(animationReady ? fadeIn(1.15) : { initial: { opacity: 0 } })}
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium tracking-[0.08em] uppercase"
            style={{ color: theme.textMuted }}
          >
            <span>global_number {String(globalRank).padStart(4, "0")}</span>
            {schoolRank != null ? (
              <span>school_number {String(schoolRank).padStart(3, "0")}</span>
            ) : null}
          </motion.div>

          <motion.p
            {...(animationReady ? fadeIn(1.8) : { initial: { opacity: 0 } })}
            className="mt-3 text-[11px] font-medium tracking-[0.01em]"
            style={{ color: theme.textSecondary }}
          >
            {schoolRank != null
              ? <>Global User #{globalRank} &middot; {ordinal(schoolRank)} from Your School</>
              : <>Global User #{globalRank}</>}
          </motion.p>
        </div>

        {/* Bottom: brand mark — right-aligned */}
        <motion.div
          {...(animationReady ? fadeIn(2.0) : { initial: { opacity: 0 } })}
          className="flex items-center justify-end"
        >
          <div className="flex items-center gap-[5px]">
            <DeskmateLogo size={9} color={theme.textPrimary} opacity={0.55} />
            <span
              className="text-[9px] font-semibold tracking-[0.12em]"
              style={{ color: theme.textPrimary, opacity: 0.55 }}
            >
              DESKMATE
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
