"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"

type NumberCounterProps = {
  value: number
  padLength?: number
  delay?: number
  accentColor: string
  tooltipBg: string
  tooltipText: string
}

const DIGIT_HEIGHT = 1.05 // em — tighter for bold type
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1]

function SingleDigit({
  target,
  started,
  staggerDelay,
}: {
  target: number
  started: boolean
  staggerDelay: number
}) {
  return (
    <span
      className="relative inline-block overflow-hidden"
      style={{ width: "0.64em", height: `${DIGIT_HEIGHT}em` }}
    >
      <motion.span
        className="absolute left-0 top-0 flex flex-col items-center"
        initial={{ y: 0 }}
        animate={started ? { y: `-${target * DIGIT_HEIGHT}em` } : { y: 0 }}
        transition={{
          duration: 0.9,
          delay: staggerDelay,
          ease: EASE_OUT,
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <span
            key={n}
            className="flex items-center justify-center"
            style={{ height: `${DIGIT_HEIGHT}em`, lineHeight: `${DIGIT_HEIGHT}em` }}
          >
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  )
}

export default function NumberCounter({
  value,
  padLength = 4,
  delay = 0,
  accentColor,
  tooltipBg,
  tooltipText,
}: NumberCounterProps) {
  const [started, setStarted] = useState(false)
  const [hovered, setHovered] = useState(false)

  const digits = String(value).padStart(padLength, "0").split("")

  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), delay * 1000)
    return () => clearTimeout(timer)
  }, [delay])

  return (
    <span className="relative inline-block">
      <motion.span
        className="inline-flex cursor-default items-center font-semibold"
        style={{
          color: accentColor,
          fontFamily: "var(--font-mono, 'JetBrains Mono'), ui-monospace, monospace",
          letterSpacing: "0.04em",
          fontFeatureSettings: '"tnum"',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.15 }}
        aria-label={`Number ${value}`}
      >
        <span
          className="mr-[0.02em] inline-flex items-center justify-center overflow-hidden opacity-25"
          style={{ width: "0.62em", height: `${DIGIT_HEIGHT}em`, lineHeight: `${DIGIT_HEIGHT}em` }}
        >
          #
        </span>
        {digits.map((digit, i) => (
          <SingleDigit
            key={i}
            target={parseInt(digit, 10)}
            started={started}
            staggerDelay={i * 0.07}
          />
        ))}
      </motion.span>

      <AnimatePresence>
        {hovered && (
          <motion.span
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-1/2 top-full z-10 mt-3 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 text-[11px] font-medium tracking-normal"
            style={{
              backgroundColor: tooltipBg,
              color: tooltipText,
              pointerEvents: "none",
              fontFamily: "var(--font-body), sans-serif",
            }}
          >
            You&apos;re our {value}th early adopter
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
