"use client"

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { Paperclip, ArrowUp } from "lucide-react"

const CYCLING_HINTS = [
  "帮我出 5 道 AP Calculus 选择题",
  "生成一份 Rubric 评分表",
  "帮我做一份 45 分钟的教案",
  "把这些题组成练习卷",
  "把 PDF 当资料上传后生成 worksheet",
  "根据资料生成可编辑文档",
]

export default function ChatInput() {
  const [inputValue, setInputValue] = useState("")
  const [isFocused, setIsFocused] = useState(false)
  const [hintIndex, setHintIndex] = useState(0)
  const router = useRouter()

  useEffect(() => {
    const timer = setInterval(() => {
      setHintIndex((prev) => (prev + 1) % CYCLING_HINTS.length)
    }, 3000)
    return () => clearInterval(timer)
  }, [])

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!inputValue.trim()) return
    router.push(`/main/agent?prompt=${encodeURIComponent(inputValue)}`)
  }

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 p-3 w-full rounded-lg border border-white bg-default-100 text-base shadow-sm ring-1 ring-black/8 transition-all focus-within:ring-black/16 hover:ring-black/12"
    >
      <div className="relative flex flex-1 items-center">
        <textarea
          className="flex w-full border-none px-2 py-2 resize-none text-[16px] leading-snug bg-transparent focus:outline-hidden focus:ring-0 placeholder:text-transparent min-h-[80px] max-h-[35vh]"
          placeholder=" "
          rows={3}
          value={inputValue}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        {!inputValue && !isFocused && (
          <AnimatePresence mode="wait">
            <motion.span
              key={hintIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="pointer-events-none absolute left-2 top-2 text-[16px] leading-snug text-neutral-400"
            >
              {CYCLING_HINTS[hintIndex]}
            </motion.span>
          </AnimatePresence>
        )}
      </div>
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => router.push("/main/agent")}
          className="h-8 w-8 rounded-full flex items-center justify-center text-neutral-600 hover:bg-neutral-200/50 transition-colors"
          title="打开 Agent 工作台并上传资料"
        >
          <Paperclip className="h-5 w-5" />
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="submit"
            className="h-8 w-8 rounded-full flex items-center justify-center bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ml-2"
            disabled={!inputValue.trim()}
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </div>
    </form>
  )
}
