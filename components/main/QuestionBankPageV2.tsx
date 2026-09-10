"use client"

import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { BookOpen, ChevronLeft, ChevronRight, FileText, Scissors } from "lucide-react"
import { ToggleButton, ToggleButtonGroup } from "@heroui/react"
import { apiGet, apiPost } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { useAppI18n } from "@/lib/app-i18n/provider"
import type { TikuSearchResultRow, TikuSearchResponse, TikuDifficulty, TikuSearchMode } from "@/lib/tiku/types"
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages"
import QuestionBankToolbar from "@/components/main/question-bank/v2/QuestionBankToolbar"
import QuestionGridSkeleton from "@/components/main/question-bank/v2/QuestionCardSkeleton"
import {
  PAGE_SIZE,
  MATERIALS_PAGE_SIZE,
  PERSONAL_PAGE_SIZE,
  DEBOUNCE_MS,
  COURSE_UNIT_MAP,
  COURSE_KEYS,
  type ViewMode,
  type TikuListResponse,
  type MaterialItem,
  type MaterialsResponse,
  type PersonalQuestionItem,
  type PersonalQuestionBankResponse,
  listItemToSearchRow,
  personalDifficultyLabel,
  personalDifficultyColors,
  personalTypeLabel,
} from "@/components/main/question-bank/v2/constants"

const TikuQuestionDetailModal = dynamic(
  () => import("@/components/main/question-bank/tiku/TikuQuestionDetailModal"),
  { loading: () => null },
)

const QuestionGrid = dynamic(
  () => import("@/components/main/question-bank/v2/QuestionGrid"),
  { loading: () => <QuestionGridSkeleton count={6} /> },
)

const MaterialGrid = dynamic(
  () => import("@/components/main/question-bank/v2/MaterialGrid"),
  { loading: () => <QuestionGridSkeleton count={4} /> },
)

const ModuleTour = dynamic(
  () => import("@/components/product-tour").then((m) => m.ModuleTour),
  { loading: () => null },
)

const MaterialDetailDrawer = dynamic(
  () => import("@/components/main/question-bank/v2/MaterialDetailDrawer"),
  { loading: () => null },
)

const PersonalQuestionDetailModal = dynamic(
  () => import("@/components/main/question-bank/v2/PersonalQuestionDetailModal"),
  { loading: () => null },
)

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1]

// ── Pagination ────────────────────────────────────────────────────────────
function PaginationNav({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  const maxVisible = 7
  const [jumpInput, setJumpInput] = useState("")
  const pageNumbers = useMemo(() => {
    if (totalPages <= maxVisible) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages: (number | "ellipsis")[] = [1]
    const start = Math.max(2, page - 1)
    const end = Math.min(totalPages - 1, page + 1)
    if (start > 2) pages.push("ellipsis")
    for (let i = start; i <= end; i++) pages.push(i)
    if (end < totalPages - 1) pages.push("ellipsis")
    if (totalPages > 1) pages.push(totalPages)
    return pages
  }, [page, totalPages])

  const handleJump = () => {
    const num = parseInt(jumpInput, 10)
    if (Number.isNaN(num) || jumpInput.trim() === "") return
    const clamped = Math.max(1, Math.min(num, totalPages))
    onPageChange(clamped)
    setJumpInput("")
  }

  return (
    <div className="flex flex-col items-center gap-2 pb-4 pt-2">
      <nav className="flex items-center justify-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-[#9B9DA4] transition-colors duration-[120ms] hover:bg-[#F7F7F7] disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageNumbers.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`e-${index}`} className="inline-flex h-8 w-8 items-center justify-center text-[13px] text-[#9B9DA4]">...</span>
          ) : (
            <button key={item} type="button" onClick={() => onPageChange(item)} className={cn("inline-flex h-8 min-w-[32px] items-center justify-center rounded-[4px] px-2 text-[13px] font-medium transition-colors duration-[120ms]", item === page ? "bg-[#5E6AD2] text-white" : "text-[#6B6F76] hover:bg-[#F7F7F7]")}>
              {item}
            </button>
          ),
        )}
        <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-[#9B9DA4] transition-colors duration-[120ms] hover:bg-[#F7F7F7] disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
      {totalPages > 1 && (
        <div className="flex items-center gap-2 text-[13px] text-[#6B6F76]">
          <span>跳转到</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleJump() }}
            placeholder={String(page)}
            className="h-8 w-14 rounded-[4px] border border-[rgba(0,0,0,0.08)] bg-white px-2 text-center text-[13px] text-[#1D1D1F] outline-none transition-colors duration-[120ms] placeholder:text-[#9B9DA4] focus:border-[#5E6AD2] focus:placeholder:text-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span>页</span>
          <button
            type="button"
            onClick={handleJump}
            disabled={jumpInput.trim() === ""}
            className="inline-flex h-8 items-center rounded-[4px] bg-[#F7F7F7] px-3 text-[13px] font-medium text-[#6B6F76] transition-colors duration-[120ms] hover:bg-[#EDEDEF] hover:text-[#1D1D1F] disabled:opacity-30"
          >
            Go
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function QuestionBankPageV2() {
  const { isZh } = useAppI18n()

  const router = useRouter()
  const [libraryScope, setLibraryScope] = useState<"global" | "personal">("global")
  const [viewMode, setViewMode] = useState<ViewMode>("questions")
  const [navigatingOut, setNavigatingOut] = useState(false)

  // Search
  const [queryInput, setQueryInput] = useState("")
  const [query, setQuery] = useState("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleQueryInput = useCallback((value: string) => {
    setQueryInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQuery(value), DEBOUNCE_MS)
  }, [])

  // Filters
  const [course, setCourse] = useState("")
  const [unit, setUnit] = useState("")
  const [difficulty, setDifficulty] = useState<"" | TikuDifficulty>("")
  const [cognitiveTask, setCognitiveTask] = useState("")
  const [mode, setMode] = useState<TikuSearchMode>("content")
  const [showFilters, setShowFilters] = useState(false)

  // Personal filters
  const [personalExerciseType, setPersonalExerciseType] = useState("")
  const [personalDifficulty, setPersonalDifficulty] = useState("")
  const [personalSourceKind, setPersonalSourceKind] = useState("")

  // Questions data
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<TikuSearchResultRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [errorText, setErrorText] = useState("")
  const [selectedItem, setSelectedItem] = useState<TikuSearchResultRow | null>(null)

  // Materials data
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [materialsTotal, setMaterialsTotal] = useState(0)
  const [materialsLoading, setMaterialsLoading] = useState(false)
  const [materialsError, setMaterialsError] = useState("")
  const [materialsPage, setMaterialsPage] = useState(1)

  // Personal data
  const [personalItems, setPersonalItems] = useState<PersonalQuestionItem[]>([])
  const [personalTotal, setPersonalTotal] = useState(0)
  const [personalLoading, setPersonalLoading] = useState(false)
  const [personalError, setPersonalError] = useState("")
  const [personalMaterialsTotal, setPersonalMaterialsTotal] = useState<number | null>(null)
  const [selectedPersonalItem, setSelectedPersonalItem] = useState<PersonalQuestionItem | null>(null)

  // Stats
  const [globalQuestionTotal, setGlobalQuestionTotal] = useState<number | null>(null)
  const [globalMaterialsTotal, setGlobalMaterialsTotal] = useState<number | null>(null)

  const [selectedMaterial, setSelectedMaterial] = useState<MaterialItem | null>(null)
  const isSearchMode = query.trim().length > 0
  const hasActiveFilters = libraryScope === "personal"
    ? !!(personalExerciseType || personalDifficulty || personalSourceKind)
    : !!(course || unit || difficulty || cognitiveTask)

  const pagedSearchItems = useMemo(() => {
    if (!isSearchMode) return items
    const start = (page - 1) * PAGE_SIZE
    return items.slice(start, start + PAGE_SIZE)
  }, [items, page, isSearchMode])

  const pagedMaterials = useMemo(() => {
    const start = (materialsPage - 1) * MATERIALS_PAGE_SIZE
    return materials.slice(start, start + MATERIALS_PAGE_SIZE)
  }, [materials, materialsPage])

  const unitOptions = useMemo(() => {
    if (!course) return []
    const info = COURSE_UNIT_MAP[course]
    if (!info) return []
    return Array.from({ length: info.unitEnd - info.unitStart + 1 }, (_, i) => i + info.unitStart)
  }, [course])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const materialsTotalPages = Math.ceil(materialsTotal / MATERIALS_PAGE_SIZE)
  const personalTotalPages = Math.ceil(personalTotal / PERSONAL_PAGE_SIZE)

  // ── Effects ──
  useEffect(() => {
    async function loadStats() {
      try {
        const [questionsRes, materialsRes] = await Promise.all([
          apiGet<TikuListResponse>("/api/tiku/list?page=1&limit=1"),
          apiGet<MaterialsResponse>("/api/tiku/materials"),
        ])
        setGlobalQuestionTotal(questionsRes.total)
        setGlobalMaterialsTotal(materialsRes.total)
      } catch { /* silent */ }
    }
    void loadStats()
  }, [])

  useEffect(() => { setPage(1); setMaterialsPage(1) }, [query, course, unit, difficulty, cognitiveTask, mode, personalExerciseType, personalDifficulty, personalSourceKind])
  useEffect(() => { setUnit("") }, [course])
  useEffect(() => {
    setQueryInput(""); setQuery(""); setCourse(""); setUnit(""); setDifficulty(""); setCognitiveTask(""); setShowFilters(false); setPage(1)
  }, [viewMode])
  useEffect(() => {
    setQueryInput(""); setQuery(""); setCourse(""); setUnit(""); setDifficulty(""); setCognitiveTask(""); setPersonalExerciseType(""); setPersonalDifficulty(""); setPersonalSourceKind(""); setShowFilters(false); setPage(1); setMaterialsPage(1); setViewMode("questions")
  }, [libraryScope])

  // Shift+ArrowLeft/Right 快捷键翻页（加载中时忽略，防止连按卡死）
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.shiftKey) return
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return

      const tag = (event.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      // 当前视图正在加载时忽略翻页
      if (libraryScope === "personal" && personalLoading) return
      if (libraryScope === "global" && viewMode === "questions" && loading) return
      if (libraryScope === "global" && viewMode === "materials" && materialsLoading) return

      event.preventDefault()

      const goLeft = event.key === "ArrowLeft"

      if (libraryScope === "personal") {
        if (goLeft && page > 1) setPage((p) => p - 1)
        else if (!goLeft && page < personalTotalPages) setPage((p) => p + 1)
      } else if (viewMode === "questions") {
        if (goLeft && page > 1) setPage((p) => p - 1)
        else if (!goLeft && page < totalPages) setPage((p) => p + 1)
      } else if (viewMode === "materials") {
        if (goLeft && materialsPage > 1) setMaterialsPage((p) => p - 1)
        else if (!goLeft && materialsPage < materialsTotalPages) setMaterialsPage((p) => p + 1)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [libraryScope, viewMode, page, totalPages, materialsPage, materialsTotalPages, personalTotalPages, loading, materialsLoading, personalLoading])

  // Questions fetch
  useEffect(() => {
    if (libraryScope === "personal" || viewMode !== "questions") return
    const controller = new AbortController()
    async function load() {
      setLoading(true); setErrorText("")
      try {
        if (isSearchMode) {
          const body: Record<string, unknown> = { query: query.trim(), limit: 0, mode }
          if (course) body.course = course
          if (unit) body.unit = parseInt(unit, 10)
          if (difficulty) body.difficulty = difficulty
          if (cognitiveTask) body.cognitive_task = cognitiveTask
          const response = await apiPost<TikuSearchResponse>("/api/tiku/search", body, { signal: controller.signal })
          setItems(response.data); setTotal(response.total)
        } else {
          const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
          if (course) params.set("course", course)
          if (unit) params.set("unit", unit)
          if (difficulty) params.set("difficulty", difficulty)
          if (cognitiveTask) params.set("cognitive_task", cognitiveTask)
          const response = await apiGet<TikuListResponse>(`/api/tiku/list?${params.toString()}`, { signal: controller.signal })
          setItems(response.items.map(listItemToSearchRow)); setTotal(response.total)
        }
      } catch (error) {
        if (controller.signal.aborted) return
        setErrorText(error instanceof Error ? error.message : isZh ? "读取题库失败" : "Failed to load question bank")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [query, course, unit, difficulty, cognitiveTask, mode, page, isSearchMode, viewMode, libraryScope, isZh])

  // Materials fetch
  useEffect(() => {
    if (libraryScope === "personal" || viewMode !== "materials") return
    const controller = new AbortController()
    async function load() {
      setMaterialsLoading(true); setMaterialsError("")
      try {
        const params = new URLSearchParams()
        if (course) params.set("course", course)
        if (unit) params.set("unit", unit)
        if (query.trim()) params.set("q", query.trim())
        const response = await apiGet<MaterialsResponse>(`/api/tiku/materials?${params.toString()}`, { signal: controller.signal })
        setMaterials(response.items); setMaterialsTotal(response.total)
      } catch (error) {
        if (controller.signal.aborted) return
        setMaterialsError(error instanceof Error ? error.message : isZh ? "读取素材失败" : "Failed to load materials")
      } finally {
        if (!controller.signal.aborted) setMaterialsLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [query, course, unit, viewMode, libraryScope, isZh])

  // Personal fetch
  useEffect(() => {
    if (libraryScope !== "personal") return
    const controller = new AbortController()
    async function load() {
      setPersonalLoading(true); setPersonalError("")
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(PERSONAL_PAGE_SIZE) })
        if (query.trim()) params.set("q", query.trim())
        if (personalExerciseType) params.set("exercise_type", personalExerciseType)
        if (personalDifficulty) params.set("difficulty", personalDifficulty)
        if (personalSourceKind) params.set("source_kind", personalSourceKind)
        const response = await apiGet<PersonalQuestionBankResponse>(`/api/partner/exercises/list?${params.toString()}`, { signal: controller.signal })
        setPersonalItems(response.items); setPersonalTotal(response.total)
      } catch (error) {
        if (controller.signal.aborted) return
        setPersonalError(error instanceof Error ? error.message : isZh ? "读取个人题库失败" : "Failed to load personal library")
      } finally {
        if (!controller.signal.aborted) setPersonalLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [libraryScope, query, page, personalExerciseType, personalDifficulty, personalSourceKind, isZh])

  // Personal materials count
  useEffect(() => {
    if (libraryScope !== "personal") return
    const controller = new AbortController()
    apiGet<{ total: number }>("/api/question-bank/materials?limit=1", { signal: controller.signal })
      .then((res) => { if (!controller.signal.aborted) setPersonalMaterialsTotal(res.total) })
      .catch(() => {})
    return () => controller.abort()
  }, [libraryScope])

  // ── Render ──
  return (
    <div className="h-full overflow-y-auto bg-[#F7F7F7]">
      <ModuleTour moduleId="questionBank" />
      <div
        className={cn(
          "flex w-full flex-1 flex-col gap-5 px-4 py-6 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] md:px-8 lg:px-12",
          navigatingOut && "scale-[0.98] opacity-0 blur-[2px]",
        )}
      >

        {/* ── Header ── */}
        <section className="rounded-[6px] border-[0.5px] border-[rgba(0,0,0,0.08)] bg-white p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <ToggleButtonGroup
              selectionMode="single"
              selectedKeys={[libraryScope]}
              onSelectionChange={(keys) => {
                const selected = [...keys][0] as "global" | "personal" | undefined
                if (selected) setLibraryScope(selected)
              }}
              className="rounded-[6px] bg-[#F7F7F7] p-0.5"
            >
              <ToggleButton id="global" className="rounded-[4px] px-4 py-2 text-[13px]">
                {isZh ? "AP 全局" : "AP Global"}
              </ToggleButton>
              <ToggleButton id="personal" className="rounded-[4px] px-4 py-2 text-[13px]">
                {isZh ? "个人题库" : "My Library"}
              </ToggleButton>
            </ToggleButtonGroup>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-tour-id="qbank-split-entry"
                onClick={() => {
                  setNavigatingOut(true)
                  setTimeout(() => router.push("/main/question-bank/split"), 300)
                }}
                className="group inline-flex items-center gap-2 rounded-[4px] border-[0.5px] border-[rgba(0,0,0,0.08)] bg-white px-4 py-2.5 text-[13px] font-medium text-[#1D1D1F] transition-all duration-[120ms] hover:bg-[#F7F7F7] hover:shadow-[0_1px_4px_rgba(0,0,0,0.06)] active:scale-[0.97]"
              >
                <Scissors className="h-3.5 w-3.5 text-[#6B6F76] transition-colors duration-[120ms] group-hover:text-[#5E6AD2]" />
                {isZh ? "拆题" : "Split Questions"}
              </button>
              <button
                type="button"
                data-tour-id="qbank-builder-entry"
                onClick={() => {
                  setNavigatingOut(true)
                  setTimeout(() => router.push("/main/question-bank/builder"), 300)
                }}
                className="group inline-flex items-center gap-2 rounded-[4px] bg-[#5E6AD2] px-4 py-2.5 text-[13px] font-medium text-white transition-all duration-[120ms] hover:bg-[#4F5BC4] hover:shadow-[0_2px_8px_rgba(94,106,210,0.3)] active:scale-[0.97]"
              >
                {isZh ? "打开组卷台" : "Open Builder"}
                <ChevronRight className="h-4 w-4 transition-transform duration-[120ms] group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[12px] font-medium text-[#9B9DA4]">
                {libraryScope === "global"
                  ? (isZh ? "AP 题库" : "AP Question Bank")
                  : (isZh ? "个人题库" : "My Library")}
              </p>
              <h1 className="mt-2 text-[24px] font-medium tracking-[-0.03em] text-[#1D1D1F]">
                {libraryScope === "global"
                  ? (isZh ? "AP 题库" : "AP Question Bank")
                  : (isZh ? "个人题库" : "My Library")}
              </h1>
              <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#6B6F76]">
                {libraryScope === "global"
                  ? (
                    isZh
                      ? `浏览并搜索 ${globalQuestionTotal ?? "..."} 道 AP 选择题，覆盖 ${COURSE_KEYS.length} 门 AP 课程。`
                      : `Browse and search ${globalQuestionTotal ?? "..."} AP MCQ questions across ${COURSE_KEYS.length} AP courses.`
                  )
                  : (isZh ? "查看你上传并解析的题目与文件。" : "View your uploaded questions and files.")}
              </p>
            </div>

            {libraryScope === "global" ? (
              <ToggleButtonGroup
                selectionMode="single"
                selectedKeys={[viewMode]}
                onSelectionChange={(keys) => {
                  const selected = [...keys][0] as ViewMode | undefined
                  if (selected) setViewMode(selected)
                }}
                className="flex gap-3"
              >
                <ToggleButton id="questions" className="rounded-[6px] border-[0.5px] border-[rgba(0,0,0,0.08)] px-5 py-4 text-center">
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-[#9B9DA4]" />
                    <p className="text-[12px] font-medium text-[#9B9DA4]">{isZh ? "题目" : "Questions"}</p>
                  </div>
                  <p className="mt-1 text-[20px] font-medium text-[#1D1D1F]">{globalQuestionTotal ?? "..."}</p>
                </ToggleButton>
                <ToggleButton id="materials" className="rounded-[6px] border-[0.5px] border-[rgba(0,0,0,0.08)] px-5 py-4 text-center">
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-[#9B9DA4]" />
                    <p className="text-[12px] font-medium text-[#9B9DA4]">{isZh ? "素材" : "Materials"}</p>
                  </div>
                  <p className="mt-1 text-[20px] font-medium text-[#1D1D1F]">{globalMaterialsTotal ?? "..."}</p>
                </ToggleButton>
              </ToggleButtonGroup>
            ) : (
              <div className="flex items-center gap-3">
                <div className="rounded-[6px] border-[0.5px] border-[rgba(0,0,0,0.08)] bg-white px-5 py-4 text-center">
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-[#9B9DA4]" />
                    <p className="text-[12px] font-medium text-[#9B9DA4]">{isZh ? "题目" : "Questions"}</p>
                  </div>
                  <p className="mt-1 text-[20px] font-medium text-[#1D1D1F]">{personalLoading ? "..." : personalTotal}</p>
                </div>
                <div className="rounded-[6px] border-[0.5px] border-[rgba(0,0,0,0.08)] bg-white px-5 py-4 text-center">
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-[#9B9DA4]" />
                    <p className="text-[12px] font-medium text-[#9B9DA4]">{isZh ? "素材" : "Materials"}</p>
                  </div>
                  <p className="mt-1 text-[20px] font-medium text-[#1D1D1F]">{personalMaterialsTotal ?? "..."}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Toolbar ── */}
        <QuestionBankToolbar
          queryInput={queryInput}
          onQueryInput={handleQueryInput}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((c) => !c)}
          libraryScope={libraryScope}
          course={course}
          unit={unit}
          difficulty={difficulty}
          cognitiveTask={cognitiveTask}
          mode={mode}
          isSearchMode={isSearchMode}
          unitOptions={unitOptions}
          onCourseChange={setCourse}
          onUnitChange={setUnit}
          onDifficultyChange={(v) => setDifficulty(v as "" | TikuDifficulty)}
          onCognitiveTaskChange={setCognitiveTask}
          onModeChange={(v) => setMode(v as TikuSearchMode)}
          personalExerciseType={personalExerciseType}
          personalDifficulty={personalDifficulty}
          personalSourceKind={personalSourceKind}
          onPersonalExerciseTypeChange={setPersonalExerciseType}
          onPersonalDifficultyChange={setPersonalDifficulty}
          onPersonalSourceKindChange={setPersonalSourceKind}
          placeholder={
            libraryScope === "personal"
              ? (isZh ? "搜索个人题库..." : "Search my library...")
              : viewMode === "materials"
                ? (isZh ? "搜索素材..." : "Search materials...")
                : (isZh ? "搜索 AP 题库..." : "Search AP question bank...")
          }
          hasActiveFilters={hasActiveFilters}
        />

        {/* ── Content with page transition ── */}
        <AnimatePresence mode="wait">
          <motion.section
            key={`${libraryScope}-${viewMode}-${page}-${materialsPage}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
            className="flex min-h-[320px] flex-1 flex-col gap-4"
          >
            {/* Result count */}
            <p className="text-[13px] text-[#9B9DA4]">
              {libraryScope === "personal"
                ? (isZh ? `${personalTotal} 题` : `${personalTotal} questions`)
                : viewMode === "questions"
                  ? (isSearchMode
                    ? (isZh ? `${total} 条结果` : `${total} results`)
                    : (isZh ? `${total} 题` : `${total} questions`))
                  : (isZh ? `${materialsTotal} 份素材` : `${materialsTotal} materials`)}
              {total > PAGE_SIZE && viewMode === "questions" ? (
                <span className="ml-2">{isZh ? `第 ${page}/${totalPages} 页` : `Page ${page}/${totalPages}`}</span>
              ) : null}
            </p>

            {/* Grid */}
            {libraryScope === "personal" ? (
              personalLoading ? <QuestionGridSkeleton count={6} /> :
              personalError ? <div className="rounded-[6px] border-[0.5px] border-rose-200 bg-rose-50 px-5 py-4 text-[13px] text-rose-700">{personalError}</div> :
              personalItems.length === 0 ? (
                <div className="flex min-h-[300px] flex-col items-center justify-center rounded-[6px] border border-dashed border-[rgba(0,0,0,0.08)] bg-white px-5 py-16 text-center">
                  <BookOpen className="mb-4 h-10 w-10 text-[#9B9DA4]" />
                  <h3 className="text-[15px] font-medium text-[#1D1D1F]">{isZh ? "还没有题目" : "No questions yet"}</h3>
                  <p className="mt-2 text-[13px] text-[#6B6F76]">{isZh ? "上传文件后，这里会展示解析出的题目。" : "Upload files to see parsed questions here."}</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {personalItems.map((item, index) => (
                    <div key={item.id} className="animate-qb-card-enter" style={{ animationDelay: `${index * 50}ms` }}>
                      <button
                        type="button"
                        onClick={() => setSelectedPersonalItem(item)}
                        className="flex h-[360px] w-full cursor-pointer flex-col overflow-hidden rounded-[6px] border-[0.5px] border-[rgba(0,0,0,0.08)] bg-white p-5 text-left transition-all duration-[120ms] hover:border-[rgba(0,0,0,0.16)] hover:shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                          <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-700">{personalTypeLabel(item.exercise_type, isZh)}</span>
                          <span className={cn("rounded-full px-2.5 py-1 font-medium", personalDifficultyColors(item.difficulty))}>{personalDifficultyLabel(item.difficulty, isZh)}</span>
                          {item.subject ? <span className="rounded-full bg-[#F7F7F7] px-2.5 py-1 font-medium text-[#6B6F76]">{item.subject}</span> : null}
                        </div>
                        <div className="mt-3 line-clamp-4">
                          <QuestionContentWithImages
                            content={item.question_text}
                            className="space-y-2"
                            textClassName="text-[14px] font-normal leading-7 text-[#1D1D1F]"
                            galleryClassName="grid gap-2"
                            figureClassName="bg-[#F7F7F7]"
                            imageClassName="max-h-[160px] w-full object-scale-down"
                          />
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : viewMode === "questions" ? (
              <QuestionGrid
                items={isSearchMode ? pagedSearchItems : items}
                loading={loading}
                error={errorText}
                isSearchMode={isSearchMode}
                total={total}
                query={query}
                onSelectItem={setSelectedItem}
                emptyTitle={isSearchMode ? (isZh ? "没有匹配的题目" : "No matching questions") : (isZh ? "没有找到题目" : "No questions found")}
                emptyDescription={isSearchMode ? (isZh ? "试试换一组关键词，或者放宽筛选条件。" : "Try different keywords or relax the filters.") : (isZh ? "当前筛选条件下没有匹配题目。" : "No questions match the current filters.")}
              />
            ) : (
              <MaterialGrid
                items={pagedMaterials}
                loading={materialsLoading}
                error={materialsError}
                onSelectMaterial={setSelectedMaterial}
                isZh={isZh}
                emptyTitle={isZh ? "没有找到素材" : "No materials found"}
                emptyDescription={isZh ? "当前筛选条件下没有匹配素材。" : "No materials match the current filters."}
              />
            )}

            {/* Pagination */}
            {libraryScope === "global" && viewMode === "questions" && total > PAGE_SIZE ? (
              <PaginationNav page={page} totalPages={totalPages} onPageChange={setPage} />
            ) : null}
            {libraryScope === "global" && viewMode === "materials" && materialsTotal > MATERIALS_PAGE_SIZE ? (
              <PaginationNav page={materialsPage} totalPages={materialsTotalPages} onPageChange={setMaterialsPage} />
            ) : null}
            {libraryScope === "personal" && personalTotal > PERSONAL_PAGE_SIZE ? (
              <PaginationNav page={page} totalPages={personalTotalPages} onPageChange={setPage} />
            ) : null}
          </motion.section>
        </AnimatePresence>
      </div>

      {/* Overlays */}
      {selectedItem ? <TikuQuestionDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} /> : null}
      {selectedMaterial ? <MaterialDetailDrawer material={selectedMaterial} onClose={() => setSelectedMaterial(null)} /> : null}
      {selectedPersonalItem ? <PersonalQuestionDetailModal item={selectedPersonalItem} onClose={() => setSelectedPersonalItem(null)} /> : null}
    </div>
  )
}
