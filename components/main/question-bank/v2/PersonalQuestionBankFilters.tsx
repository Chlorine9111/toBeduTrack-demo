"use client"

import { Select, ListBox } from "@heroui/react"
import { useAppI18n } from "@/lib/app-i18n/provider"

export type PersonalFilters = {
  exerciseType: string
  difficulty: string
  sourceKind: string
}

type PersonalQuestionBankFiltersProps = PersonalFilters & {
  onExerciseTypeChange: (value: string) => void
  onDifficultyChange: (value: string) => void
  onSourceKindChange: (value: string) => void
}

const triggerClassName =
  "text-[13px] text-[#1D1D1F] border-[0.5px] border-[rgba(0,0,0,0.08)] bg-white rounded-[6px] h-9 px-3"

const itemClassName = "text-[13px]"

const EXERCISE_TYPE_OPTIONS = [
  { value: "MC", labelZh: "选择题", labelEn: "Multiple Choice" },
  { value: "FR", labelZh: "简答题", labelEn: "Free Response" },
  { value: "fill_in", labelZh: "填空题", labelEn: "Fill-in" },
]

const DIFFICULTY_OPTIONS = [
  { value: "1", labelZh: "简单", labelEn: "Easy" },
  { value: "2", labelZh: "中等", labelEn: "Medium" },
  { value: "3", labelZh: "困难", labelEn: "Hard" },
  { value: "4", labelZh: "专家", labelEn: "Expert" },
]

const SOURCE_KIND_OPTIONS = [
  { value: "pdf_scan", labelZh: "PDF 拆题", labelEn: "PDF Scan" },
  { value: "agent_generated", labelZh: "AI 生成", labelEn: "AI Generated" },
  { value: "knowledge_document", labelZh: "知识文档", labelEn: "Knowledge Doc" },
  { value: "manual", labelZh: "手动创建", labelEn: "Manual" },
]

export default function PersonalQuestionBankFilters({
  exerciseType,
  difficulty,
  sourceKind,
  onExerciseTypeChange,
  onDifficultyChange,
  onSourceKindChange,
}: PersonalQuestionBankFiltersProps) {
  const { isZh } = useAppI18n()

  return (
    <div className="flex flex-wrap gap-3">
      {/* 题型 */}
      <Select
        selectedKey={exerciseType}
        onSelectionChange={(key) => onExerciseTypeChange((key as string) ?? "")}
        aria-label={isZh ? "题型" : "Type"}
        className="min-w-[140px]"
      >
        <Select.Trigger className={triggerClassName}>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="" textValue={isZh ? "全部题型" : "All types"} className={itemClassName}>
              {isZh ? "全部题型" : "All types"}
            </ListBox.Item>
            {EXERCISE_TYPE_OPTIONS.map((opt) => (
              <ListBox.Item key={opt.value} id={opt.value} textValue={isZh ? opt.labelZh : opt.labelEn} className={itemClassName}>
                {isZh ? opt.labelZh : opt.labelEn}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      {/* 难度 */}
      <Select
        selectedKey={difficulty}
        onSelectionChange={(key) => onDifficultyChange((key as string) ?? "")}
        aria-label={isZh ? "难度" : "Difficulty"}
        className="min-w-[120px]"
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
              <ListBox.Item key={opt.value} id={opt.value} textValue={isZh ? opt.labelZh : opt.labelEn} className={itemClassName}>
                {isZh ? opt.labelZh : opt.labelEn}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      {/* 来源 */}
      <Select
        selectedKey={sourceKind}
        onSelectionChange={(key) => onSourceKindChange((key as string) ?? "")}
        aria-label={isZh ? "来源" : "Source"}
        className="min-w-[140px]"
      >
        <Select.Trigger className={triggerClassName}>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="" textValue={isZh ? "全部来源" : "All sources"} className={itemClassName}>
              {isZh ? "全部来源" : "All sources"}
            </ListBox.Item>
            {SOURCE_KIND_OPTIONS.map((opt) => (
              <ListBox.Item key={opt.value} id={opt.value} textValue={isZh ? opt.labelZh : opt.labelEn} className={itemClassName}>
                {isZh ? opt.labelZh : opt.labelEn}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  )
}
