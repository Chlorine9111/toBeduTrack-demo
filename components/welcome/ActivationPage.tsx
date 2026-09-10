"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { Button, Spinner } from "@heroui/react"
import WelcomeCard from "./WelcomeCard"
import { DeskmateLogo } from "./noise"
import { THEMES, DEFAULT_THEME, type ThemeName } from "./themes"
import { patchTourState } from "@/lib/product-tour/api"

type AccountProfileResponse = {
  profile: {
    id: string | null
    fullName: string | null
    displayName: string | null
    schoolName: string | null
    globalNumber: number | null
    schoolNumber: number | null
    createdAt: string | null
    email: string | null
  }
}

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1]
const EASE_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1]

function formatFallbackName(email: string | null) {
  if (!email) return "Deskmate Teacher"
  const [local] = email.split("@")
  const normalized = local.replace(/[._-]+/g, " ").trim()
  if (!normalized) return "Deskmate Teacher"
  return normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export default function ActivationPage() {
  const router = useRouter()
  const [themeName, setThemeName] = useState<ThemeName>(DEFAULT_THEME)
  const [animationReady, setAnimationReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [entering, setEntering] = useState(false)
  const [teacherName, setTeacherName] = useState("Deskmate Teacher")
  const [schoolName, setSchoolName] = useState<string | null>(null)
  const [joinDate, setJoinDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [globalRank, setGlobalRank] = useState(1)
  const [schoolRank, setSchoolRank] = useState<number | null>(null)

  const theme = THEMES[themeName]

  useEffect(() => {
    const timer = setTimeout(() => setAnimationReady(true), 600)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    let active = true

    async function loadProfile() {
      try {
        const response = await fetch("/api/account/profile", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        })
        const payload = (await response.json().catch(() => ({}))) as AccountProfileResponse
        if (!response.ok || !active) {
          return
        }
        const profile = payload.profile
        const resolvedName =
          profile.fullName?.trim() ||
          profile.displayName?.trim() ||
          formatFallbackName(profile.email ?? null)
        setTeacherName(resolvedName)
        setSchoolName(profile.schoolName?.trim() || null)
        setGlobalRank(profile.globalNumber ?? 1)
        setSchoolRank(profile.schoolNumber ?? null)
        if (profile.createdAt) {
          setJoinDate(profile.createdAt.slice(0, 10))
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      active = false
    }
  }, [])

  const handleEnter = useCallback(async () => {
    if (entering) return
    setEntering(true)
    try {
      await patchTourState({
        welcomeAnimationCompletedAt: new Date().toISOString(),
      })
    } catch {
      // If syncing the welcome state fails, still allow the user to continue.
    } finally {
      router.replace("/main/agent")
    }
  }, [entering, router])

  const eyebrowText = useMemo(
    () => (schoolName ? `${schoolName} · Welcome to Deskmate` : "Welcome to Deskmate"),
    [schoolName],
  )

  return (
    <motion.div
      className="relative flex min-h-screen items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      <motion.div
        className="absolute inset-0"
        animate={{ backgroundColor: theme.pageBg }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
      />

      <motion.div
        className="relative z-10 flex w-full flex-col items-center justify-center overflow-y-auto px-4 py-12"
        style={{ maxHeight: "100dvh" }}
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.05 }}
      >
        <div className="mb-8 flex items-center justify-center gap-2">
          <DeskmateLogo size={14} color={theme.textPrimary} opacity={0.8} />
          <span
            className="text-[11px] font-semibold tracking-[0.2em]"
            style={{ color: theme.textPrimary, opacity: 0.65 }}
          >
            DESKMATE
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.12 }}
          className="mb-8 text-center"
        >
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.24em]"
            style={{ color: theme.textMuted }}
          >
            {eyebrowText}
          </p>
          <h1
            className="mt-4 text-[30px] font-semibold tracking-[-0.03em] md:text-[38px]"
            style={{ color: theme.textPrimary }}
          >
            Your workspace is ready.
          </h1>
          <p
            className="mx-auto mt-3 max-w-[460px] text-[14px] leading-relaxed"
            style={{ color: theme.textSecondary }}
          >
            We removed the activation gate. This card now acts as your final welcome animation
            before you enter the workspace.
          </p>
        </motion.div>

        <div className="w-full max-w-[560px]">
          {loading ? (
            <div className="flex aspect-[16/10] items-center justify-center rounded-[8px] bg-white/75 shadow-2xl">
              <Spinner size="sm" />
            </div>
          ) : (
            <WelcomeCard
              theme={theme}
              teacherName={teacherName}
              globalRank={globalRank}
              schoolRank={schoolRank}
              joinDate={joinDate}
              schoolName={schoolName}
              animationReady={animationReady}
            />
          )}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 1.8 }}
          className="mt-12 flex flex-col items-center gap-4"
        >
          <Button
            className="min-w-[220px] !bg-[#0A0A0A] !text-white hover:!bg-[#222] disabled:!bg-[#0A0A0A]/40"
            size="lg"
            isDisabled={loading || entering}
            onPress={handleEnter}
          >
            {entering ? <Spinner size="sm" color="current" /> : "Enter workspace"}
          </Button>

          <div className="flex items-center gap-2">
            {(Object.keys(THEMES) as ThemeName[]).map((name) => {
              const nextTheme = THEMES[name]
              const isActive = themeName === name
              return (
                <button
                  key={name}
                  type="button"
                  aria-label={`${name} theme`}
                  className="h-[16px] w-[16px] rounded-full transition-all duration-200 hover:scale-110"
                  style={{
                    backgroundColor: nextTheme.cardBg,
                    boxShadow: isActive
                      ? `0 0 0 1.5px ${nextTheme.accent}, 0 0 0 3px rgba(${nextTheme.shadowColor},0.1)`
                      : `0 0 0 1px ${nextTheme.cardBorder}`,
                  }}
                  onClick={() => setThemeName(name)}
                />
              )
            })}
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
