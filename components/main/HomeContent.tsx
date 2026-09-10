"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useCallback } from "react"
import { Button, Card } from "@heroui/react"
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  BookText,
  Bot,
  ClipboardList,
  FileDown,
  FileText,
  Library,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import ChatInput from "./ChatInput"
import CommunitySection from "./CommunitySection"
import { QUICK_START_CARDS, MOCK_RECENT_WORK } from "./chatflow/mock-data"
import type { RecentWork } from "./chatflow/types"

const WORK_TYPE_ICONS: Record<RecentWork["type"], typeof FileText> = {
  exercises: FileText,
  rubric: BarChart3,
  worksheet: ClipboardList,
  "lesson-plan": BookOpen,
  pdf: FileDown,
}

export default function HomeContent() {
  const router = useRouter()
  const resourcesRef = useRef<HTMLDivElement>(null)
  const [showBottomFade, setShowBottomFade] = useState(true)

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowBottomFade(distanceToBottom > 20)
  }, [])

  const handleCardClick = (card: (typeof QUICK_START_CARDS)[number]) => {
    if (card.id === "qs-6") {
      resourcesRef.current?.scrollIntoView({ behavior: "smooth" })
      return
    }
    router.push(`/main/agent?prompt=${encodeURIComponent(card.prompt)}`)
  }

  const handleRecentClick = (item: RecentWork) => {
    router.push(`/main/agent?prompt=${encodeURIComponent(`继续处理这个任务：${item.title}`)}`)
  }

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[28px]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,91,91,0.08),transparent_24%),radial-gradient(circle_at_80%_10%,rgba(26,26,46,0.08),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.75),rgba(248,250,251,0.92))]" />
      </div>

      <div className="relative z-10 flex-1 overflow-hidden">
        <div
          className="h-full overflow-y-auto overflow-x-hidden px-4 md:px-8"
          onScroll={handleScroll}
        >
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-8 py-8 md:py-10">
            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <article className="overflow-hidden rounded-[32px] bg-linear-to-br from-foreground via-slate-900 to-slate-950 p-6 text-white shadow-2xl md:p-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium tracking-[0.24em] text-white/75">
                  <Sparkles className="h-3.5 w-3.5" />
                  DESKMATE CORE
                </div>
                <h1 className="mt-6 max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">
                  教师工作流不该散落在聊天记录里。
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-8 text-slate-300 md:text-base">
                  这里把自主 Agent、内容库、设置和课程入口收在一个工作台里。你可以直接开始生成内容，也可以回到历史产物继续复用。
                </p>

                <div className="mt-6 w-full max-w-3xl">
                  <ChatInput />
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    variant="primary"
                    onPress={() => router.push("/main/agent")}
                    className="inline-flex items-center gap-2 rounded-2xl bg-foreground px-4 py-3 text-sm font-semibold text-white hover:bg-[#f24d4d]"
                  >
                    <Bot className="h-4 w-4" />
                    进入自主 Agent
                  </Button>
                  <Button
                    variant="ghost"
                    onPress={() => {
                      if (process.env.NODE_ENV === "development") {
                        window.location.assign("/main/content-assets");
                        return;
                      }
                      router.push("/main/content-assets");
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"
                  >
                    <Library className="h-4 w-4" />
                    打开内容资产
                  </Button>
                </div>
              </article>

              <article className="grid gap-4 rounded-[32px] border border-divider bg-white/92 p-6 shadow-panel">
                <div className="rounded-[24px] bg-default-100 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-default-500">核心入口</p>
                  <div className="mt-4 grid gap-3">
                    {[
                      { label: "自主 Agent", desc: "直接发任务，生成教案、Rubric、习题", icon: Bot, href: "/main/agent" },
                      { label: "内容资产", desc: "统一管理文件原件与历史产物", icon: Library, href: "/main/content-assets" },
                      { label: "账户设置", desc: "维护教师资料、学科方向与安全项", icon: BookText, href: "/main/settings" },
                    ].map((item) => (
                      <Card
                        key={item.label}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (item.href === "/main/content-assets" && process.env.NODE_ENV === "development") {
                            window.location.assign(item.href);
                            return;
                          }
                          router.push(item.href);
                        }}
                        className="flex cursor-pointer items-center justify-between rounded-2xl px-4 py-3 text-left hover:border-slate-300 hover:bg-default-100"
                      >
                        <div className="flex items-center gap-3">
                          <div className="rounded-2xl bg-default-200 p-3 text-slate-700">
                            <item.icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{item.label}</p>
                            <p className="mt-1 text-xs text-default-500">{item.desc}</p>
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-default-400" />
                      </Card>
                    ))}
                  </div>
                </div>

                <div className="rounded-[24px] border border-divider bg-[linear-gradient(135deg,rgba(255,91,91,0.08),rgba(255,255,255,1))] p-5">
                  <p className="text-sm font-semibold text-foreground">推荐起步方式</p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    先在 Agent 中说清你的需求，再让内容库自动沉淀结果，这是当前最顺的工作流。
                  </p>
                </div>
              </article>
            </section>

            <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[28px] border border-divider bg-white/92 p-5 shadow-panel">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-default-500">快速开始</p>
                    <h2 className="mt-2 text-xl font-semibold text-foreground">从一条任务开始</h2>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {QUICK_START_CARDS.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => handleCardClick(card)}
                      className={cn(
                        "group flex flex-col items-start gap-3 rounded-[24px] border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                        card.gradient,
                        card.border,
                      )}
                    >
                      <div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl", card.iconBg)}>
                        {card.icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-neutral-800">{card.title}</p>
                        <p className="mt-1 text-xs leading-6 text-neutral-500">{card.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div ref={resourcesRef} className="rounded-[28px] border border-divider bg-white/92 p-5 shadow-panel">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-default-500">最近工作</p>
                    <h2 className="mt-2 text-xl font-semibold text-foreground">继续上一次产出</h2>
                  </div>
                </div>
                <div className="mt-5 flex flex-col gap-2">
                  {MOCK_RECENT_WORK.map((item) => {
                    const Icon = WORK_TYPE_ICONS[item.type]
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleRecentClick(item)}
                        className="group flex items-center gap-3 rounded-[22px] border border-transparent px-4 py-3 text-left transition-colors hover:border-divider hover:bg-default-100"
                      >
                        <div className="rounded-2xl bg-default-200 p-3">
                          <Icon className="h-4 w-4 shrink-0 text-slate-600" />
                        </div>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-sm font-semibold text-neutral-800">
                            {item.title}
                          </span>
                          <span className="mt-1 block truncate text-xs text-neutral-500">
                            {item.detail}
                          </span>
                        </span>
                        <span className="text-xs text-neutral-400 shrink-0">{item.timestamp}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-divider bg-white/92 p-5 shadow-panel">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-default-200 p-3 text-slate-700">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-default-500">教师社区</p>
                  <h2 className="mt-1 text-xl font-semibold text-foreground">看看别人怎么做</h2>
                </div>
              </div>
              <div className="mt-5">
                <CommunitySection
                  onCite={(resource) => {
                    router.push(`/main/agent?prompt=${encodeURIComponent(`引用 ${resource.authorName} 的「${resource.title}」`)}`)
                  }}
                />
              </div>
            </section>
          </div>
        </div>
      </div>
      <div
        className={cn(
          "pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-linear-to-t from-white to-transparent transition-opacity duration-300",
          showBottomFade ? "opacity-100" : "opacity-0"
        )}
      />
    </>
  )
}
