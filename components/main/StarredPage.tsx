"use client"

import { Star } from "lucide-react"
import { useAppI18n } from "@/lib/app-i18n/provider";

export default function StarredPage() {
  const { isZh } = useAppI18n();

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-white">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="h-12 w-12 rounded-lg bg-neutral-200 flex items-center justify-center">
          <Star className="h-6 w-6 text-neutral-400" />
        </div>

        <h2 className="text-xl font-semibold text-neutral-900 mt-6">
          {isZh ? "将项目加入星标后，你可以在任意工作区快速打开它" : "Star projects to access them quickly from any workspace"}
        </h2>

        <button className="mt-4 px-4 h-9 rounded-lg border border-neutral-300 text-sm font-medium hover:bg-neutral-50 transition-colors">
          {isZh ? "浏览项目" : "Browse projects"}
        </button>
      </div>

      <div className="mt-12 relative w-[300px] h-[180px]">
        <div className="absolute inset-0 bg-linear-to-br from-purple-300 to-purple-500 rounded-2xl -rotate-6 shadow-lg blur-[1px]" />
        <div className="absolute inset-0 bg-linear-to-br from-purple-400/80 to-purple-600/60 rounded-2xl rotate-3 shadow-xl" />
      </div>
    </div>
  )
}
