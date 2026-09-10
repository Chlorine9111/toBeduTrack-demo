"use client"

import { Avatar, Button, Card } from "@heroui/react";
import { Heart, ExternalLink } from "lucide-react"
import { useAppI18n } from "@/lib/app-i18n/provider";

const featuredApps = [
  {
    id: 1,
    name: { zh: "智能写作助手", en: "Writing Copilot" },
    description: { zh: "AI 驱动的文章创作工具", en: "AI-powered long-form writing assistant" },
    gradient: "from-blue-400 to-purple-500",
    avatar: "bg-blue-500",
  },
  {
    id: 2,
    name: { zh: "数据可视化平台", en: "Data Viz Studio" },
    description: { zh: "交互式图表与报表生成", en: "Interactive charts and reporting workspace" },
    gradient: "from-orange-400 to-pink-500",
    avatar: "bg-orange-500",
  },
]

const builderApps = [
  {
    id: 1,
    name: { zh: "代码片段管理器", en: "Snippet Manager" },
    description: { zh: "收藏与分享代码片段", en: "Save and share reusable code snippets" },
    color: "bg-indigo-100",
    avatar: "bg-indigo-500",
    likes: 128,
  },
  {
    id: 2,
    name: { zh: "API 调试工具", en: "API Debugger" },
    description: { zh: "轻量级接口测试平台", en: "Lightweight API testing workspace" },
    color: "bg-emerald-100",
    avatar: "bg-emerald-500",
    likes: 96,
  },
  {
    id: 3,
    name: { zh: "设计系统生成器", en: "Design System Builder" },
    description: { zh: "一键生成组件库", en: "Generate a component library from tokens" },
    color: "bg-rose-100",
    avatar: "bg-rose-500",
    likes: 215,
  },
  {
    id: 4,
    name: { zh: "Markdown 编辑器", en: "Markdown Studio" },
    description: { zh: "所见即所得的写作体验", en: "Distraction-free rich markdown editing" },
    color: "bg-amber-100",
    avatar: "bg-amber-500",
    likes: 184,
  },
]

const communityApps = [
  { id: 1, name: { zh: "番茄时钟", en: "Focus Timer" }, description: { zh: "高效专注力管理工具", en: "Deep-work focus timer" }, color: "bg-red-400", likes: 342 },
  { id: 2, name: { zh: "天气预报", en: "Weather Radar" }, description: { zh: "精准七日天气预测", en: "Accurate 7-day forecast" }, color: "bg-sky-400", likes: 278 },
  { id: 3, name: { zh: "记账本", en: "Budget Book" }, description: { zh: "简洁的个人财务管理", en: "Simple personal finance tracking" }, color: "bg-green-400", likes: 456 },
  { id: 4, name: { zh: "习惯追踪", en: "Habit Tracker" }, description: { zh: "每日打卡养成好习惯", en: "Build routines with daily streaks" }, color: "bg-purple-400", likes: 189 },
  { id: 5, name: { zh: "白噪音", en: "White Noise" }, description: { zh: "专注与放松的声音环境", en: "Calm soundscapes for focus" }, color: "bg-teal-400", likes: 523 },
  { id: 6, name: { zh: "色彩取色器", en: "Color Picker" }, description: { zh: "屏幕取色与调色板生成", en: "Grab colors and build palettes" }, color: "bg-pink-400", likes: 167 },
  { id: 7, name: { zh: "密码生成器", en: "Password Generator" }, description: { zh: "安全随机密码一键生成", en: "Create strong random passwords" }, color: "bg-slate-400", likes: 298 },
  { id: 8, name: { zh: "单位转换器", en: "Unit Converter" }, description: { zh: "支持多种单位快速换算", en: "Convert between common units" }, color: "bg-orange-400", likes: 134 },
  { id: 9, name: { zh: "JSON 格式化", en: "JSON Formatter" }, description: { zh: "在线美化与校验 JSON", en: "Format and validate JSON" }, color: "bg-cyan-400", likes: 412 },
]

export default function DiscoverPage() {
  const { isZh } = useAppI18n();
  const pick = (value: { zh: string; en: string }) => (isZh ? value.zh : value.en);

  return (
    <div className="flex-1 overflow-y-auto bg-white">
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold text-neutral-900">{isZh ? "发现" : "Discover"}</h1>
      <p className="text-neutral-500 mt-1 mb-8">
        {isZh ? "探索优秀创作者构建的应用和工具" : "Explore apps built by talented creators"}
      </p>

      {/* Featured apps */}
      <section>
        <h2 className="text-lg font-semibold mb-4">{isZh ? "精选应用" : "Featured apps"}</h2>
        <div className="grid grid-cols-2 gap-4">
          {featuredApps.map((app) => (
            <Card key={app.id} className="overflow-hidden">
              <div
                className={`aspect-video bg-linear-to-br ${app.gradient}`}
              />
              <Card.Content className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Avatar className={`${app.avatar} text-white`}>
                    <Avatar.Fallback>{pick(app.name).charAt(0)}</Avatar.Fallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-neutral-900">{pick(app.name)}</p>
                    <p className="text-sm text-neutral-500">
                      {pick(app.description)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  className="h-8 px-3 rounded-lg border border-neutral-200 text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-1.5 shrink-0"
                >
                  {isZh ? "查看项目" : "Visit project"}
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </Card.Content>
            </Card>
          ))}
        </div>
      </section>

      {/* Apps for builders */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-4">{isZh ? "创作者常用" : "Apps for builders"}</h2>
        <div className="grid grid-cols-2 gap-4">
          {builderApps.map((app) => (
            <Card key={app.id} className="overflow-hidden">
              <div
                className={`aspect-2/1 ${app.color} flex items-center justify-center`}
              >
                <span className="text-neutral-400 text-sm">
                  {pick(app.name).charAt(0)}
                </span>
              </div>
              <Card.Content className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <Avatar size="sm" className={`${app.avatar} text-white`}>
                    <Avatar.Fallback>{pick(app.name).charAt(0)}</Avatar.Fallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">
                      {pick(app.name)}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {pick(app.description)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-sm text-neutral-400">
                  <Heart className="h-4 w-4" />
                  <span>{app.likes}</span>
                </div>
              </Card.Content>
            </Card>
          ))}
        </div>
      </section>

      {/* Apps loved by the community */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-4">
          {isZh ? "社区高赞应用" : "Apps loved by the community"}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {communityApps.map((app) => (
            <div
              key={app.id}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-neutral-50 cursor-pointer transition-colors"
            >
              <div
                className={`h-10 w-10 rounded-xl ${app.color} flex items-center justify-center text-white text-sm font-medium shrink-0`}
              >
                {pick(app.name).charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-900 truncate">
                  {pick(app.name)}
                </p>
                <p className="text-xs text-neutral-400 truncate">
                  {pick(app.description)}
                </p>
              </div>
              <div className="flex items-center gap-1 text-sm text-neutral-400 ml-auto shrink-0">
                <Heart className="h-3.5 w-3.5" />
                <span className="text-xs">{app.likes}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
    </div>
  )
}
