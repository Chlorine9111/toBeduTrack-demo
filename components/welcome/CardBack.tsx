"use client"

import { DeskmateLogo } from "./noise"
import type { WelcomeTheme } from "./themes"

type CardBackProps = {
  theme: WelcomeTheme
  schoolName: string | null
  joinDate: string
}

export default function CardBack({ theme, schoolName, joinDate }: CardBackProps) {
  const formatted = (() => {
    const d = new Date(joinDate + "T00:00:00")
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  })()

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-10 py-10">
      <div className="flex-1" />

      {/* School / org label */}
      <span
        className="text-center text-[18px] font-semibold tracking-[0.08em] md:text-[22px]"
        style={{
          color: theme.accent,
        }}
      >
        {schoolName || "DESKMATE STUDIO"}
      </span>

      {/* Join date */}
      <span
        className="mt-3 text-[11px] font-medium tracking-[0.04em]"
        style={{ color: theme.textSecondary }}
      >
        Joined {formatted}
      </span>

      {/* Divider */}
      <div
        className="my-8 h-px w-10"
        style={{ backgroundColor: theme.textMuted, opacity: 0.35 }}
      />

      {/* Quote */}
      <p
        className="max-w-[280px] text-center text-[11px] font-medium italic leading-[1.8] tracking-[0.01em]"
        style={{ color: theme.textMuted }}
      >
        &ldquo;Education is a craft. Welcome to the studio.&rdquo;
      </p>

      <div className="flex w-full flex-1 items-end justify-center">
        <div className="flex items-center gap-[5px]">
          <DeskmateLogo size={8} color={theme.textPrimary} opacity={0.45} />
          <span
            className="text-[8px] font-semibold tracking-[0.12em]"
            style={{ color: theme.textPrimary, opacity: 0.45 }}
          >
            DESKMATE
          </span>
        </div>
      </div>
    </div>
  )
}
