"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  ClipboardCheck,
  FileText,
  BookOpen,
  Download,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { Button, Card, Tabs, Table, Separator, Link as HeroLink } from "@heroui/react"
import { cn } from "@/lib/utils"
import { DEMO_SUBJECTS, type DemoSubjectData } from "@/lib/demo/presets"

// --- Types ---

type TabId = "exercises" | "rubric" | "lesson-plan" | "export"

interface TabDef {
  id: TabId
  label: string
  icon: typeof FileText
}

const TABS: TabDef[] = [
  { id: "exercises", label: "Exercises", icon: FileText },
  { id: "rubric", label: "Rubric", icon: ClipboardCheck },
  { id: "lesson-plan", label: "Lesson Plan", icon: BookOpen },
  { id: "export", label: "Export", icon: Download },
]

// --- Main Component ---

export default function DemoTabs() {
  const [activeTab, setActiveTab] = useState<TabId>("exercises")
  const [subjectIdx, setSubjectIdx] = useState(0)
  const [animKey, setAnimKey] = useState(0)
  const subject = DEMO_SUBJECTS[subjectIdx]

  function switchSubject(idx: number) {
    setSubjectIdx(idx)
    setAnimKey((k) => k + 1)
  }

  function switchTab(id: TabId) {
    setActiveTab(id)
    setAnimKey((k) => k + 1)
  }

  return (
    <section className="mt-32 bg-default-100 py-32">
      <div className="mx-auto max-w-[1100px] px-6">
        <h2 className="text-center text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.01em] text-foreground mb-12">
          See what Deskmate creates for you.
        </h2>

        {/* Tabs */}
        <Tabs selectedKey={activeTab} onSelectionChange={(key) => switchTab(key as TabId)} className="mx-auto mb-12">
          <Tabs.ListContainer>
            <Tabs.List aria-label="Content types" className="mx-auto flex w-fit space-x-1 rounded-xl bg-default-200 p-1">
              {TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <Tabs.Tab key={tab.id} id={tab.id} className="flex items-center gap-1.5 rounded-lg px-5 py-2 text-sm font-medium">
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                )
              })}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>

        {/* Content Grid */}
        <div className="grid gap-8 md:grid-cols-[280px_1fr]">
          {/* Left: Subject Selector */}
          <Card className="h-fit">
            <Card.Content>
              <label className="mb-4 block text-[11px] font-semibold uppercase tracking-widest text-default-400">
                Choose a subject
              </label>
              <div className="space-y-2">
                {DEMO_SUBJECTS.map((s, idx) => (
                  <Button
                    key={s.subject}
                    variant={idx === subjectIdx ? "primary" : "ghost"}
                    onPress={() => switchSubject(idx)}
                    className={cn(
                      "w-full rounded-lg px-4 py-3 text-left h-auto flex flex-col items-start",
                      idx === subjectIdx
                        ? "bg-foreground text-white"
                        : "bg-default-100 text-foreground hover:bg-default-200",
                    )}
                  >
                    <div className="text-sm font-medium">{s.course}</div>
                    <div
                      className={cn(
                        "text-xs mt-0.5",
                        idx === subjectIdx
                          ? "text-white/60"
                          : "text-default-400",
                      )}
                    >
                      {s.unit}
                    </div>
                  </Button>
                ))}
              </div>

              <Separator className="my-4" />

              <div className="rounded-lg border border-dashed border-divider p-3 text-center">
                <span className="text-xs text-default-400">
                  38+ AP subjects available
                </span>
              </div>
            </Card.Content>
          </Card>

          {/* Right: Preview Panel */}
          <Card className="overflow-hidden">
            {/* Window Header */}
            <div className="flex items-center justify-between border-b border-default-100 bg-content1 px-6 py-2.5">
              <div className="flex space-x-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-default-300/40" />
                <div className="h-2.5 w-2.5 rounded-full bg-default-300/40" />
                <div className="h-2.5 w-2.5 rounded-full bg-default-300/40" />
              </div>
              <span className="text-xs font-medium text-default-400">
                {subject.course} — {activeTab === "exercises" ? "Practice Questions" : activeTab === "rubric" ? "Assessment Rubric" : activeTab === "lesson-plan" ? "Lesson Plan" : "Export Preview"}
              </span>
            </div>

            {/* Tab Content */}
            <Card.Content>
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${activeTab}-${animKey}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                >
                  {activeTab === "exercises" && (
                    <ExercisesPreview subject={subject} />
                  )}
                  {activeTab === "rubric" && (
                    <RubricPreview subject={subject} />
                  )}
                  {activeTab === "lesson-plan" && (
                    <LessonPlanPreview subject={subject} />
                  )}
                  {activeTab === "export" && (
                    <ExportPreview subject={subject} />
                  )}
                </motion.div>
              </AnimatePresence>
            </Card.Content>
          </Card>
        </div>
      </div>
    </section>
  )
}

// --- Tab Panels ---

function ExercisesPreview({ subject }: { subject: DemoSubjectData }) {
  return (
    <div className="space-y-6">
      {subject.exercises.map((ex, idx) => (
        <ExerciseCard key={idx} exercise={ex} number={idx + 1} />
      ))}
      <div className="pt-2 text-center">
        <HeroLink
          href="/auth/register"
          className="text-sm font-medium text-default-400 transition-colors hover:text-foreground"
        >
          Sign up to generate unlimited questions →
        </HeroLink>
      </div>
    </div>
  )
}

function ExerciseCard({
  exercise,
  number,
}: {
  exercise: DemoSubjectData["exercises"][0]
  number: number
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [showSolution, setShowSolution] = useState(false)

  const isCorrect = selected === exercise.correctAnswer

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-foreground text-[11px] font-bold text-white">
          {number}
        </span>
        <p className="text-[14px] leading-relaxed text-foreground">
          {exercise.questionText}
        </p>
      </div>

      <div className="ml-9 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {exercise.options.map((opt) => {
          const isThis = selected === opt.label
          const revealed = selected !== null

          return (
            <Button
              key={opt.label}
              onPress={() => {
                if (!selected) setSelected(opt.label)
              }}
              isDisabled={!!selected}
              variant="ghost"
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-all",
                !revealed &&
                  "border-divider hover:border-default-300 hover:bg-default-100",
                revealed && opt.isCorrect &&
                  "border-emerald-300 bg-emerald-50 text-emerald-800",
                revealed && isThis && !opt.isCorrect &&
                  "border-rose-300 bg-rose-50 text-rose-800",
                revealed && !isThis && !opt.isCorrect &&
                  "border-default-100 text-default-200",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                  !revealed && "border-divider text-default-400",
                  revealed && opt.isCorrect && "border-emerald-400 bg-emerald-500 text-white",
                  revealed && isThis && !opt.isCorrect && "border-rose-400 bg-rose-500 text-white",
                  revealed && !isThis && !opt.isCorrect && "border-divider text-default-200",
                )}
              >
                {revealed && opt.isCorrect ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : revealed && isThis && !opt.isCorrect ? (
                  <XCircle className="h-3 w-3" />
                ) : (
                  opt.label
                )}
              </span>
              <span>{opt.text}</span>
            </Button>
          )
        })}
      </div>

      {selected && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="ml-9 overflow-hidden"
        >
          <Button
            variant="ghost"
            size="sm"
            onPress={() => setShowSolution(!showSolution)}
            className="flex items-center gap-1 text-xs font-medium text-default-400 hover:text-foreground"
          >
            {showSolution ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {isCorrect ? "Correct!" : "See solution"}
          </Button>
          {showSolution && (
            <p className="mt-2 rounded-lg bg-default-100 p-3 text-xs leading-relaxed text-default-500">
              {exercise.solutionSteps}
            </p>
          )}
        </motion.div>
      )}
    </div>
  )
}

function RubricPreview({ subject }: { subject: DemoSubjectData }) {
  const { rubric } = subject

  return (
    <div>
      <h3 className="mb-4 text-base font-semibold text-foreground">
        {rubric.title}
      </h3>
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="Assessment Rubric" className="min-w-[500px] text-[13px]">
            <Table.Header>
              <Table.Column isRowHeader>Dimension</Table.Column>
              {rubric.dimensions[0].levels.map((level) => (
                <Table.Column key={level.label}>{level.label}</Table.Column>
              ))}
            </Table.Header>
            <Table.Body>
              {rubric.dimensions.map((dim) => (
                <Table.Row key={dim.name}>
                  <Table.Cell>
                    <div className="font-medium text-foreground">{dim.name}</div>
                    <div className="text-[11px] text-default-400">
                      {dim.weight}
                    </div>
                  </Table.Cell>
                  {dim.levels.map((level) => (
                    <Table.Cell key={level.label}>
                      {level.description}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

      <div className="mt-4 text-center">
        <HeroLink
          href="/auth/register"
          className="text-sm font-medium text-default-400 transition-colors hover:text-foreground"
        >
          Sign up to generate custom rubrics →
        </HeroLink>
      </div>
    </div>
  )
}

function LessonPlanPreview({ subject }: { subject: DemoSubjectData }) {
  const { lessonPlan } = subject
  const [expandedIdx, setExpandedIdx] = useState(0)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {lessonPlan.title}
          </h3>
          <p className="text-xs text-default-400">
            {lessonPlan.totalMinutes} minutes total
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {lessonPlan.sections.map((section, idx) => {
          const isOpen = expandedIdx === idx
          return (
            <div
              key={idx}
              className="rounded-lg border border-divider bg-content1 overflow-hidden"
            >
              <button
                onClick={() => setExpandedIdx(isOpen ? -1 : idx)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-white">
                    {idx + 1}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {section.title}
                    </div>
                    <div className="text-xs text-default-400">
                      {section.duration}
                    </div>
                  </div>
                </div>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-default-200" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-default-200" />
                )}
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-default-100 px-4 py-3 space-y-2">
                      {section.blocks.map((block, bIdx) => (
                        <div key={bIdx} className="flex items-start gap-2">
                          <span
                            className={cn(
                              "mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                              block.type === "activity" &&
                                "bg-blue-50 text-blue-600",
                              block.type === "discussion" &&
                                "bg-amber-50 text-amber-600",
                              block.type === "lecture" &&
                                "bg-violet-50 text-violet-600",
                              block.type === "example" &&
                                "bg-emerald-50 text-emerald-600",
                              block.type === "practice" &&
                                "bg-sky-50 text-sky-600",
                              block.type === "assessment" &&
                                "bg-rose-50 text-rose-600",
                            )}
                          >
                            {block.type}
                          </span>
                          <p className="text-xs leading-relaxed text-default-500">
                            {block.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      <div className="mt-4 text-center">
        <HeroLink
          href="/auth/register"
          className="text-sm font-medium text-default-400 transition-colors hover:text-foreground"
        >
          Sign up to generate lesson plans for any topic →
        </HeroLink>
      </div>
    </div>
  )
}

function ExportPreview({ subject }: { subject: DemoSubjectData }) {
  return (
    <div className="flex flex-col items-center py-8">
      {/* PDF Preview Mockup */}
      <div className="mb-8 w-full max-w-xs">
        <div className="aspect-8.5/11 rounded-lg border border-divider bg-white p-6 shadow-md">
          {/* Header */}
          <div className="mb-4 border-b border-divider pb-3">
            <div className="h-4 w-3/4 rounded bg-foreground/10" />
            <div className="mt-2 h-2.5 w-1/2 rounded bg-foreground/5" />
          </div>
          {/* Content lines */}
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 h-3 w-3 rounded-sm bg-foreground/10" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2 w-full rounded bg-foreground/8" />
                <div className="h-2 w-4/5 rounded bg-foreground/8" />
              </div>
            </div>
            <div className="ml-5 grid grid-cols-2 gap-1.5">
              {["A", "B", "C", "D"].map((l) => (
                <div
                  key={l}
                  className="flex items-center gap-1 rounded border border-default-100 px-1.5 py-1"
                >
                  <div className="h-2 w-2 rounded-full border border-divider" />
                  <div className="h-1.5 flex-1 rounded bg-foreground/5" />
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-0.5 h-3 w-3 rounded-sm bg-foreground/10" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2 w-full rounded bg-foreground/8" />
                <div className="h-2 w-3/5 rounded bg-foreground/8" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Export Options */}
      <div className="grid w-full max-w-sm grid-cols-3 gap-3">
        {[
          { label: "PDF", desc: "Print-ready", available: true },
          { label: "DOCX", desc: "Editable", available: true },
          { label: "Google Docs", desc: "Coming soon", available: false },
        ].map((opt) => (
          <Card
            key={opt.label}
            variant={opt.available ? "default" : "secondary"}
            className={cn(
              "flex flex-col items-center gap-1 p-4 transition-colors",
              opt.available
                ? "hover:shadow-xs cursor-pointer"
                : "border-dashed border-divider",
            )}
          >
            <Download
              className={cn(
                "h-5 w-5",
                opt.available
                  ? "text-foreground"
                  : "text-default-200",
              )}
            />
            <span
              className={cn(
                "text-sm font-medium",
                opt.available
                  ? "text-foreground"
                  : "text-default-200",
              )}
            >
              {opt.label}
            </span>
            <span className="text-[10px] text-default-400">
              {opt.desc}
            </span>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-xs text-default-400">
        Generate content first, then export in your preferred format
      </p>
    </div>
  )
}
