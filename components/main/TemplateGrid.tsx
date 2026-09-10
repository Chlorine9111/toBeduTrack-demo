"use client"

import { ArrowRight } from "lucide-react"

const templates = [
  { id: 1, title: "电商网站模板", description: "高端设计的网上商店", color: "bg-amber-100" },
  { id: 2, title: "建筑师作品集", description: "事务所网站与展示", color: "bg-slate-200" },
  { id: 3, title: "个人博客", description: "简约私密的设计", color: "bg-rose-100" },
  { id: 4, title: "时尚博客", description: "极简有趣的设计", color: "bg-violet-100" },
  { id: 5, title: "可视化着陆页", description: "展示你的公司", color: "bg-emerald-100" },
  { id: 6, title: "活动平台", description: "寻找、注册、创建活动", color: "bg-blue-100" },
]

const fadeInKeyframes = `
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
  opacity: 0;
}
`

export default function TemplateGrid() {
  return (
    <>
      <style>{fadeInKeyframes}</style>

      <div className="flex items-center justify-between mb-4 px-4 md:px-0">
        <div className="flex items-center gap-1 border-b border-transparent">
          <button className="text-sm font-medium text-neutral-900 border-b-2 border-neutral-900 pb-2 px-1">
            Templates
          </button>
        </div>

        <a
          href="#"
          className="text-sm text-neutral-400 hover:text-neutral-600 flex items-center gap-1 transition-colors"
        >
          浏览全部
          <ArrowRight className="h-3 w-3" />
        </a>
      </div>

      <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(345px,1fr))] justify-items-center gap-5 pb-8 px-4 md:px-0">
        {templates.map((template, index) => (
          <div
            key={template.id}
            className="w-full max-w-md cursor-pointer group animate-fade-in"
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            <div className="relative mb-2 aspect-video rounded-xl overflow-hidden">
              <div
                className={`w-full h-full ${template.color} flex items-center justify-center transition-opacity group-hover:opacity-80`}
              >
                <span className="text-neutral-400 text-sm">
                  {template.title.charAt(0)}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-0.5">
              <h3 className="text-sm font-medium text-neutral-900 truncate">
                {template.title}
              </h3>
              <p className="text-sm text-neutral-400 truncate">
                {template.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
