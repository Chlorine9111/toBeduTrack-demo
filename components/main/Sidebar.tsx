"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  PanelLeftClose,
  ChevronDown,
  ChevronRight,
  House,
  Search,
  Star,
  Settings,
  FileText,
  BarChart3,
  ClipboardList,
  BookOpen,
  Library,
  Bot,
  CalendarClock,
  FileEdit,
  ClipboardCheck,
  Loader2,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { apiGet } from "@/lib/api/client"
import { buildLoginUrl } from "@/lib/auth/urls"
import { createBrowserSupabaseClient } from "@/lib/supabase/client"
import { getAuthDisplayName, getAuthInitials, getAuthSchoolName } from "@/lib/auth/profile"
import SearchModal from "./SearchModal"
import { MOCK_COURSES, MOCK_RECENT_WORK, DASHBOARD_STATS } from "./chatflow/mock-data"
import type { MockCourse, MockUnit } from "./chatflow/types"

const RESOURCE_ITEMS = [
  { icon: FileText, label: "题库", count: DASHBOARD_STATS.totalExercises, href: "/main/question-bank" },
  { icon: BarChart3, label: "Rubric", count: DASHBOARD_STATS.totalRubrics },
  { icon: ClipboardList, label: "Worksheet", count: DASHBOARD_STATS.totalWorksheets },
  { icon: BookOpen, label: "教案", count: DASHBOARD_STATS.totalLessonPlans },
] as const

type SidebarUser = {
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}

type SidebarAccount = {
  displayName: string
  schoolName: string | null
  email: string | null
  initials: string
}

type AccountProfileResponse = {
  profile: {
    displayName: string
    schoolName: string | null
    email: string | null
    initials: string
  }
}

const CLIENT_AUTH_BYPASS =
  process.env.NEXT_PUBLIC_AUTH_BYPASS === "true" ||
  process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "1" ||
  process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true"

function buildFallbackAccount(user: SidebarUser | null): SidebarAccount {
  if (!user && CLIENT_AUTH_BYPASS) {
    return {
      displayName: "测试账户",
      schoolName: "本地绕过模式",
      email: null,
      initials: "TS",
    }
  }

  const displayName = getAuthDisplayName({
    email: user?.email ?? null,
    metadata: user?.user_metadata,
  })

  return {
    displayName,
    schoolName: getAuthSchoolName(user?.user_metadata) ?? null,
    email: user?.email ?? null,
    initials: getAuthInitials(displayName, user?.email ?? null),
  }
}

export default function Sidebar() {
  const [supabase] = useState(() => createBrowserSupabaseClient())
  const [collapsed, setCollapsed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [recentExpanded, setRecentExpanded] = useState(true)
  const [resourcesExpanded, setResourcesExpanded] = useState(true)
  const [courses, setCourses] = useState<MockCourse[]>(MOCK_COURSES)
  const [account, setAccount] = useState<SidebarAccount>(buildFallbackAccount(null))
  const [accountLoading, setAccountLoading] = useState(true)
  const [isSigningOut, startSignOut] = useTransition()
  const isSigningOutRef = useRef(false)
  const accountRequestRef = useRef<AbortController | null>(null)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    interface CourseRow { id: string; name: string; code: string }
    interface UnitRow { id: string; course_id: string; unit_number: number; title: string }
    interface OptionsResponse { courses: CourseRow[]; units: UnitRow[] }
    const controller = new AbortController()
    let active = true

    apiGet<OptionsResponse>("/api/curriculum/options", {
      signal: controller.signal,
    })
      .then((data) => {
        if (!active || controller.signal.aborted || isSigningOutRef.current) return
        const unitsByCourse = new Map<string, MockUnit[]>()
        for (const u of data.units) {
          const list = unitsByCourse.get(u.course_id) ?? []
          list.push({
            id: u.id,
            unitNumber: String(u.unit_number),
            title: u.title,
            topics: [],
            exerciseCount: 0,
            lastGenerated: "",
          })
          unitsByCourse.set(u.course_id, list)
        }
        const mapped: MockCourse[] = data.courses.map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
          units: unitsByCourse.get(c.id) ?? [],
        }))
        setCourses(mapped)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        // API 失败时保持 MOCK_COURSES，静默处理
      })

    const handleAuthSigningOut = () => {
      controller.abort()
    }

    window.addEventListener("deskmate-auth-signing-out", handleAuthSigningOut)

    return () => {
      active = false
      controller.abort()
      window.removeEventListener("deskmate-auth-signing-out", handleAuthSigningOut)
    }
  }, [])

  useEffect(() => {
    let active = true

    const cancelAccountRequest = () => {
      accountRequestRef.current?.abort()
      accountRequestRef.current = null
    }

    const applyAccount = (nextUser: SidebarUser | null) => {
      setAccount(buildFallbackAccount(nextUser))
      setAccountLoading(false)
    }

    const loadAccount = async (nextUser: SidebarUser | null) => {
      cancelAccountRequest()

      if (isSigningOutRef.current) {
        if (!active) return
        applyAccount(null)
        return
      }

      if (!nextUser && !CLIENT_AUTH_BYPASS) {
        if (!active) return
        applyAccount(null)
        return
      }

      if (!CLIENT_AUTH_BYPASS) {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!active) return
        if (!session?.user) {
          applyAccount(null)
          return
        }
      }

      const controller = new AbortController()

      try {
        accountRequestRef.current = controller
        const data = await apiGet<AccountProfileResponse>("/api/account/profile", {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (!active) return
        setAccount({
          displayName: data.profile.displayName,
          schoolName: data.profile.schoolName,
          email: data.profile.email,
          initials: data.profile.initials,
        })
      } catch {
        if (controller.signal.aborted) return
        if (!active) return
        applyAccount(nextUser)
        return
      } finally {
        if (accountRequestRef.current === controller) {
          accountRequestRef.current = null
        }
      }

      if (!active) return
      setAccountLoading(false)
    }

    supabase.auth.getUser().then(({ data }) => {
      const nextUser = data.user
        ? {
            email: data.user.email,
            user_metadata: data.user.user_metadata,
          }
        : null

      void loadAccount(nextUser)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user
        ? {
            email: session.user.email,
            user_metadata: session.user.user_metadata,
          }
        : null

      void loadAccount(nextUser)
    })

    const handleProfileUpdated = () => {
      if (isSigningOutRef.current) {
        applyAccount(null)
        return
      }

      void supabase.auth.getUser().then(({ data }) => {
        const nextUser = data.user
          ? {
              email: data.user.email,
              user_metadata: data.user.user_metadata,
            }
          : null

        return loadAccount(nextUser)
      })
    }

    const handleAuthSigningOut = () => {
      isSigningOutRef.current = true
      cancelAccountRequest()
      if (!active) return
      applyAccount(null)
    }

    window.addEventListener("deskmate-profile-updated", handleProfileUpdated)
    window.addEventListener("deskmate-auth-signing-out", handleAuthSigningOut)

    return () => {
      active = false
      cancelAccountRequest()
      authListener.subscription.unsubscribe()
      window.removeEventListener("deskmate-profile-updated", handleProfileUpdated)
      window.removeEventListener("deskmate-auth-signing-out", handleAuthSigningOut)
    }
  }, [supabase])

  const isHome = pathname === "/main" || pathname === "/main/"
  const isAgent = pathname.startsWith("/main/agent")
  const isLibrary =
    pathname.startsWith("/main/content-assets") ||
    pathname.startsWith("/main/library")
  const recentItems = MOCK_RECENT_WORK.slice(0, 3)

  const handleLogout = () => {
    startSignOut(async () => {
      isSigningOutRef.current = true
      window.dispatchEvent(new Event("deskmate-auth-signing-out"))
      await supabase.auth.signOut()
      window.location.assign(buildLoginUrl({ notice: "你已安全退出" }))
    })
  }

  const accountSecondaryText = account.schoolName || account.email || "教师工作区"

  if (collapsed) {
    return (
      <aside className="flex h-screen w-16 flex-col items-center gap-3 border-r border-white/80 bg-[rgba(255,255,255,0.55)] py-4 backdrop-blur-sm">
        <button
          onClick={() => setCollapsed(false)}
          className="flex h-9 w-9 items-center justify-center rounded-2xl hover:bg-white"
        >
          <PanelLeftClose className="h-4 w-4 rotate-180 text-neutral-500" />
        </button>

        <Link
          href="/main"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-2xl",
            isHome ? "bg-white text-foreground shadow-xs" : "hover:bg-white"
          )}
        >
          <House className="h-4 w-4 text-neutral-500" />
        </Link>

        <Link
          href="/main/agent"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-2xl",
            isAgent ? "bg-white text-foreground shadow-xs" : "hover:bg-white"
          )}
          title="自主 Agent"
        >
          <Bot className="h-4 w-4 text-neutral-500" />
        </Link>

        <button
          onClick={() => setSearchOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-2xl hover:bg-white"
        >
          <Search className="h-4 w-4 text-neutral-500" />
        </button>

        <div className="my-1 h-px w-8 bg-slate-200" />

        <button
          onClick={() => {
            if (process.env.NODE_ENV === "development") {
              window.location.assign("/main/content-assets");
              return;
            }
            router.push("/main/content-assets");
          }}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-2xl",
            isLibrary ? "bg-white text-foreground shadow-xs" : "hover:bg-white"
          )}
          title="内容库"
        >
          <Library className={cn("h-4 w-4", isLibrary ? "text-neutral-900" : "text-neutral-500")} />
        </button>

        <button
          onClick={() => router.push("/main/wechat-editor")}
          className="flex h-9 w-9 items-center justify-center rounded-2xl hover:bg-white"
          title="公众号"
        >
          <FileEdit className="h-4 w-4 text-neutral-500" />
        </button>

        <Link
          href="/main/scheduler"
          className="flex h-9 w-9 items-center justify-center rounded-2xl hover:bg-white"
          title="智能排课"
        >
          <CalendarClock className="h-4 w-4 text-neutral-500" />
        </Link>

        <button
          onClick={() => router.push("/main/grading")}
          className="flex h-9 w-9 items-center justify-center rounded-2xl hover:bg-white"
          title="AI 判卷"
        >
          <ClipboardCheck className="h-4 w-4 text-neutral-500" />
        </button>

        <Link
          href="/main/starred"
          className="flex h-9 w-9 items-center justify-center rounded-2xl hover:bg-white"
        >
          <Star className="h-4 w-4 text-neutral-500" />
        </Link>

        <Link
          href="/main/settings"
          className="flex h-9 w-9 items-center justify-center rounded-2xl hover:bg-white"
        >
          <Settings className="h-4 w-4 text-neutral-500" />
        </Link>

        <div className="flex-1" />

        <Link
          href="/main/settings"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-white"
          title={account.displayName}
        >
          {accountLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : account.initials}
        </Link>

        <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      </aside>
    )
  }

  return (
    <>
      <aside className="group/sidebar flex h-screen w-[272px] flex-col border-r border-white/75 bg-[rgba(255,255,255,0.58)] p-4 backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <p className="inline-flex items-end text-[17px] font-semibold text-foreground">
                <svg className="mb-[3px] mr-px inline-block h-[1.15em] w-[1.15em]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"><path d="M20 4 L20 20 L4 20 Z" /></svg>eskmate
              </p>
              <p className="text-xs text-default-500">Teacher Workspace</p>
            </div>
          </div>
          <button
            onClick={() => setCollapsed(true)}
            className="flex h-9 w-9 items-center justify-center rounded-2xl hover:bg-white"
          >
            <PanelLeftClose className="h-4 w-4 text-neutral-500" />
          </button>
        </div>


        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          <Link
            href="/main"
            className={cn(
              "flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-sm",
              isHome ? "bg-white text-foreground shadow-xs" : "text-neutral-600 hover:bg-white/80"
            )}
          >
            <House className="h-4 w-4 text-neutral-400" />
            <span className="flex-1">Home</span>
          </Link>

          <Link
            href="/main/agent"
            className={cn(
              "flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-sm",
              isAgent ? "bg-white text-foreground shadow-xs" : "text-neutral-600 hover:bg-white/80"
            )}
          >
            <Bot className="h-4 w-4 text-neutral-400" />
            <span className="flex-1">自主 Agent</span>
          </Link>

          <Link
            href="/main/content-assets"
            className={cn(
              "flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-sm",
              isLibrary ? "bg-white text-foreground shadow-xs" : "text-neutral-600 hover:bg-white/80"
            )}
          >
            <Library className="h-4 w-4 text-neutral-400" />
            <span className="flex-1">内容库</span>
          </Link>

          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-sm text-neutral-600 hover:bg-white/80"
          >
            <Search className="h-4 w-4 text-neutral-400" />
            <span className="flex-1 text-left">Search</span>
            <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-400">
              ⌘K
            </kbd>
          </button>

          <div className="mt-5">
            <button
              onClick={() => setRecentExpanded((prev) => !prev)}
              className="mb-2 flex w-full items-center gap-1 px-2"
            >
              {recentExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
              )}
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">最近生成</span>
            </button>

            {recentExpanded && (
              <div className="flex flex-col gap-0.5">
                {recentItems.map((item) => {
                  const iconMap: Record<string, typeof FileText> = {
                    exercises: FileText,
                    rubric: BarChart3,
                    worksheet: ClipboardList,
                    "lesson-plan": BookOpen,
                    pdf: FileText,
                  }
                  const Icon = iconMap[item.type] ?? FileText
                  return (
                    <button
                      key={item.id}
                      onClick={() =>
                        router.push(`/main/agent?prompt=${encodeURIComponent(`继续处理这个任务：${item.title}`)}`)
                      }
                      className="ml-2 flex h-8 items-center gap-2 rounded-xl px-2 text-left text-sm text-neutral-600 hover:bg-white/80 truncate"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
                      <span className="truncate">{item.title}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mt-5">
            <button
              onClick={() => setResourcesExpanded((prev) => !prev)}
              className="mb-2 flex w-full items-center gap-1 px-2"
            >
              {resourcesExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
              )}
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">资源库</span>
            </button>

            {resourcesExpanded && (
              <div className="flex flex-col gap-0.5">
                {RESOURCE_ITEMS.map((res) => {
                  const href = "href" in res ? res.href : undefined
                  return (
                    <button
                      key={res.label}
                      onClick={() =>
                        router.push(href ?? `/main/agent?prompt=${encodeURIComponent(`帮我整理${res.label}相关资源`)}`)
                      }
                      className={cn(
                        "ml-2 flex h-8 items-center gap-2 rounded-xl px-2 text-left text-sm text-neutral-600 hover:bg-white/80",
                        href && pathname.startsWith(href) && "bg-white/80 font-medium text-foreground",
                      )}
                    >
                      <res.icon className="h-4 w-4 shrink-0 text-neutral-400" />
                      <span className="flex-1 truncate">{res.label}</span>
                      <span className="text-xs text-neutral-400">({res.count})</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-0.5">
            <Link
              href="/main/wechat-editor"
              className={cn(
                "flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-sm",
                pathname.startsWith("/main/wechat-editor")
                  ? "bg-white text-foreground shadow-xs"
                  : "text-neutral-600 hover:bg-white/80"
              )}
            >
              <FileEdit className="h-4 w-4 text-neutral-400" />
              <span className="flex-1">公众号</span>
            </Link>

            <Link
              href="/main/scheduler"
              className={cn(
                "flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-sm",
                pathname.startsWith("/main/scheduler")
                  ? "bg-white text-foreground shadow-xs"
                  : "text-neutral-600 hover:bg-white/80"
              )}
            >
              <CalendarClock className="h-4 w-4 text-neutral-400" />
              <span className="flex-1">智能排课</span>
            </Link>

            <Link
              href="/main/grading"
              className={cn(
                "flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-sm",
                pathname.startsWith("/main/grading")
                  ? "bg-white text-foreground shadow-xs"
                  : "text-neutral-600 hover:bg-white/80"
              )}
            >
              <ClipboardCheck className="h-4 w-4 text-neutral-400" />
              <span className="flex-1">AI 判卷</span>
            </Link>
          </div>

          <div className="mt-5 flex flex-col gap-0.5">
            <Link
              href="/main/starred"
              className={cn(
                "flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-sm",
                pathname.startsWith("/main/starred")
                  ? "bg-white text-foreground shadow-xs"
                  : "text-neutral-600 hover:bg-white/80"
              )}
            >
              <Star className="h-4 w-4 text-neutral-400" />
              <span className="flex-1">收藏</span>
            </Link>

            <Link
              href="/main/settings"
              className={cn(
                "flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-sm",
                pathname.startsWith("/main/settings")
                  ? "bg-white text-foreground shadow-xs"
                  : "text-neutral-600 hover:bg-white/80"
              )}
            >
              <Settings className="h-4 w-4 text-neutral-400" />
              <span className="flex-1">设置</span>
            </Link>
          </div>
        </nav>

        <div className="border-t border-divider pt-4">
          <Link
            href="/main/settings"
            className="flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-white/80"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-white">
              {accountLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : account.initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-neutral-900">{account.displayName}</p>
              <p className="truncate text-xs text-neutral-500">{accountSecondaryText}</p>
            </div>
          </Link>
        </div>
      </aside>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
