"use client"

import { motion, AnimatePresence } from "motion/react"
import { SearchField, Button } from "@heroui/react"
import { SlidersHorizontal } from "lucide-react"
import { useAppI18n } from "@/lib/app-i18n/provider"
import QuestionBankFilters from "./QuestionBankFilters"
import PersonalQuestionBankFilters from "./PersonalQuestionBankFilters"

type QuestionBankToolbarProps = {
  queryInput: string
  onQueryInput: (value: string) => void
  showFilters: boolean
  onToggleFilters: () => void
  libraryScope: "global" | "personal"
  // Global filter props
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
  // Personal filter props
  personalExerciseType: string
  personalDifficulty: string
  personalSourceKind: string
  onPersonalExerciseTypeChange: (value: string) => void
  onPersonalDifficultyChange: (value: string) => void
  onPersonalSourceKindChange: (value: string) => void
  // Search placeholder
  placeholder: string
  // Whether any filter is active
  hasActiveFilters: boolean
}

export default function QuestionBankToolbar({
  queryInput,
  onQueryInput,
  showFilters,
  onToggleFilters,
  libraryScope,
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
  personalExerciseType,
  personalDifficulty,
  personalSourceKind,
  onPersonalExerciseTypeChange,
  onPersonalDifficultyChange,
  onPersonalSourceKindChange,
  placeholder,
  hasActiveFilters,
}: QuestionBankToolbarProps) {
  const { isZh } = useAppI18n()

  return (
    <section data-tour-id="qbank-filters" className="sticky top-0 z-20 rounded-[6px] border-[0.5px] border-[rgba(0,0,0,0.08)] bg-white/95 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <SearchField
          value={queryInput}
          onChange={onQueryInput}
          onClear={() => onQueryInput("")}
          className="flex-1"
        >
          <SearchField.Group className="rounded-[6px] border-[0.5px] border-[rgba(0,0,0,0.08)] bg-[#F7F7F7]">
            <SearchField.SearchIcon className="text-[#9B9DA4]" />
            <SearchField.Input
              className="text-[13px] text-[#1D1D1F] placeholder:text-[#9B9DA4]"
              placeholder={placeholder}
            />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>

        <Button
          variant="outline"
          size="sm"
          onPress={onToggleFilters}
          className="relative flex items-center gap-1.5 rounded-[4px] border-[0.5px] border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] font-medium text-[#1D1D1F] transition-colors duration-[120ms] hover:bg-[#F7F7F7]"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-[#6B6F76]" />
          {isZh ? "筛选" : "Filters"}
          {hasActiveFilters && (
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#5E6AD2]" />
          )}
        </Button>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-3">
              {libraryScope === "personal" ? (
                <PersonalQuestionBankFilters
                  exerciseType={personalExerciseType}
                  difficulty={personalDifficulty}
                  sourceKind={personalSourceKind}
                  onExerciseTypeChange={onPersonalExerciseTypeChange}
                  onDifficultyChange={onPersonalDifficultyChange}
                  onSourceKindChange={onPersonalSourceKindChange}
                />
              ) : (
                <QuestionBankFilters
                  course={course}
                  unit={unit}
                  difficulty={difficulty}
                  cognitiveTask={cognitiveTask}
                  mode={mode}
                  isSearchMode={isSearchMode}
                  unitOptions={unitOptions}
                  onCourseChange={onCourseChange}
                  onUnitChange={onUnitChange}
                  onDifficultyChange={onDifficultyChange}
                  onCognitiveTaskChange={onCognitiveTaskChange}
                  onModeChange={onModeChange}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
