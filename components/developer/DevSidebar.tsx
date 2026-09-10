"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Separator } from "@heroui/react"
import { MessageSquare, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [{ icon: MessageSquare, label: "反馈管理", href: "/developer/feedback" }] as const

export default function DevSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-[240px] shrink-0 flex-col border-r border-gray-800 bg-gray-900">
      <div className="flex h-16 items-center gap-3 border-b border-gray-800 px-4">
        <div>
          <p className="inline-flex items-end text-[17px] font-semibold text-white">
            <svg className="mb-[3px] mr-px inline-block h-[1.15em] w-[1.15em]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"><path d="M20 4 L20 20 L4 20 Z" /></svg>eskmate
          </p>
          <p className="text-xs text-gray-400">Developer</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-10 items-center gap-2 rounded-lg px-3 text-sm transition-colors",
                active ? "bg-gray-800 text-white" : "text-gray-300 hover:bg-gray-800/70 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <Separator className="border-gray-800" />
      <div className="px-4 py-3">
        <div className="inline-flex items-center gap-2 text-xs text-gray-300">
          <Wrench className="h-3.5 w-3.5" />
          <span>Deskmate Team</span>
        </div>
      </div>
    </aside>
  )
}
