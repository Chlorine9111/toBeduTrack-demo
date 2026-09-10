"use client"

import { Select, ListBox } from "@heroui/react"
import { useAppI18n } from "@/lib/app-i18n/provider"
import {
  COURSE_UNIT_MAP,
  COURSE_KEYS,
  COURSE_LABELS,
  COGNITIVE_TASK_OPTIONS,
  DIFFICULTY_OPTIONS,
} from "./constants"

type QuestionBankFiltersProps = {
  course: string
  unit: string
  difficulty: string
  cognitiveTask: string
  mode: string
  isSearchMode: boolean
  unitOptions: number[]
  onCourseChange: (value: string) => void
  onUnitChange: (value: string) => void
  onDifficultyChange: (value: string) => void
  onCognitiveTaskChange: (value: string) => void
  onModeChange: (value: string) => void
}

const triggerClassName =
  "text-[13px] text-[#1D1D1F] border-[0.5px] border-[rgba(0,0,0,0.08)] bg-white rounded-[6px] h-9 px-3"

const itemClassName = "text-[13px]"

function difficultyOptionLabel(value: string, isZh: boolean) {
  switch (value) {
    case "easy":
      return isZh ? "简单" : "Easy"
    case "medium":
      return isZh ? "中等" : "Medium"
    case "hard":
      return isZh ? "困难" : "Hard"
    default:
      return value
  }
}

function cognitiveTaskOptionLabel(value: string, fallbackLabel: string, isZh: boolean) {
  if (!isZh) return fallbackLabel
  switch (value) {
    case "recall":
      return "回忆识记"
    case "diagram_reading":
      return "图表解读"
    case "calculation":
      return "计算"
    case "causal_prediction":
      return "因果预测"
    case "comparison":
      return "比较"
    case "scenario_application":
      return "情境应用"
    case "evidence_evaluation":
      return "证据评估"
    default:
      return fallbackLabel
  }
}

export default function QuestionBankFilters({
  course,
  unit,
  difficulty,
  cognitiveTask,
  mode,
  isSearchMode,
  unitOptions,
  onCourseChange,
  onUnitChange,
  onDifficultyChange,
  onCognitiveTaskChange,
  onModeChange,
}: QuestionBankFiltersProps) {
  const { isZh } = useAppI18n()

  return (
    <div className="flex flex-wrap gap-3">
      {/* Course */}
      <Select
        selectedKey={course}
        onSelectionChange={(key) => onCourseChange((key as string) ?? "")}
        aria-label={isZh ? "课程" : "Course"}
        className="min-w-[180px]"
      >
        <Select.Trigger className={triggerClassName}>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="" textValue={isZh ? "全部课程" : "All courses"} className={itemClassName}>
              {isZh ? "全部课程" : "All courses"}
            </ListBox.Item>
            {COURSE_KEYS.map((key) => {
              const courseLabel = isZh
                ? (COURSE_LABELS[key] ?? COURSE_UNIT_MAP[key].label)
                : COURSE_UNIT_MAP[key].label

              return (
              <ListBox.Item
                key={key}
                id={key}
                textValue={courseLabel}
                className={itemClassName}
              >
                {courseLabel}
              </ListBox.Item>
              )
            })}
          </ListBox>
        </Select.Popover>
      </Select>

      {/* Unit */}
      <Select
        selectedKey={unit}
        onSelectionChange={(key) => onUnitChange((key as string) ?? "")}
        aria-label={isZh ? "单元" : "Unit"}
        className="min-w-[120px]"
        isDisabled={unitOptions.length === 0}
      >
        <Select.Trigger className={triggerClassName}>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="" textValue={isZh ? "全部单元" : "All units"} className={itemClassName}>
              {isZh ? "全部单元" : "All units"}
            </ListBox.Item>
            {unitOptions.map((num) => (
              <ListBox.Item
                key={String(num)}
                id={String(num)}
                textValue={isZh ? `单元 ${num}` : `Unit ${num}`}
                className={itemClassName}
              >
                {isZh ? `单元 ${num}` : `Unit ${num}`}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      {/* Difficulty */}
      <Select
        selectedKey={difficulty}
        onSelectionChange={(key) => onDifficultyChange((key as string) ?? "")}
        aria-label={isZh ? "难度" : "Difficulty"}
        className="min-w-[130px]"
      >
        <Select.Trigger className={triggerClassName}>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="" textValue={isZh ? "全部难度" : "All difficulties"} className={itemClassName}>
              {isZh ? "全部难度" : "All difficulties"}
            </ListBox.Item>
            {DIFFICULTY_OPTIONS.map((opt) => (
              <ListBox.Item
                key={opt.value}
                id={opt.value}
                textValue={difficultyOptionLabel(opt.value, isZh)}
                className={itemClassName}
              >
                {difficultyOptionLabel(opt.value, isZh)}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      {/* Cognitive task */}
      <Select
        selectedKey={cognitiveTask}
        onSelectionChange={(key) => onCognitiveTaskChange((key as string) ?? "")}
        aria-label={isZh ? "认知任务" : "Cognitive task"}
        className="min-w-[170px]"
      >
        <Select.Trigger className={triggerClassName}>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="" textValue={isZh ? "全部任务" : "All tasks"} className={itemClassName}>
              {isZh ? "全部任务" : "All tasks"}
            </ListBox.Item>
            {COGNITIVE_TASK_OPTIONS.map((opt) => (
              <ListBox.Item
                key={opt.value}
                id={opt.value}
                textValue={cognitiveTaskOptionLabel(opt.value, opt.label, isZh)}
                className={itemClassName}
              >
                {cognitiveTaskOptionLabel(opt.value, opt.label, isZh)}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      {/* Search mode (visible only in search mode) */}
      {isSearchMode && (
        <Select
          selectedKey={mode}
          onSelectionChange={(key) => onModeChange((key as string) ?? "")}
          aria-label={isZh ? "搜索模式" : "Search mode"}
          className="min-w-[140px]"
        >
          <Select.Trigger className={triggerClassName}>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="auto" textValue={isZh ? "自动" : "Auto"} className={itemClassName}>
                {isZh ? "自动" : "Auto"}
              </ListBox.Item>
              <ListBox.Item id="content" textValue={isZh ? "内容" : "Content"} className={itemClassName}>
                {isZh ? "内容" : "Content"}
              </ListBox.Item>
              <ListBox.Item id="diagnostic" textValue={isZh ? "诊断" : "Diagnostic"} className={itemClassName}>
                {isZh ? "诊断" : "Diagnostic"}
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
      )}
    </div>
  )
}
