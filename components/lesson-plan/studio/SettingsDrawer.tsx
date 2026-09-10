"use client";

import { useCallback } from "react";
import type {
  LessonPlanPreferences,
  LessonPlanTemplateKind,
  LessonPlanStudentLevel,
  LessonPlanLanguagePref,
  LessonPlanQuizDensity,
  LessonPlanExplanationDepth,
} from "@/lib/lesson-plan/types";
import {
  TEMPLATE_LABELS,
  STUDENT_LEVEL_LABELS,
  QUIZ_DENSITY_LABELS,
  EXPLANATION_DEPTH_LABELS,
} from "@/lib/lesson-plan/defaults";
import {
  Button,
  Drawer,
  Input,
  Label,
  Select,
  ListBox,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";

type SettingsDrawerProps = {
  open: boolean;
  preferences: LessonPlanPreferences;
  enableWebSearch: boolean;
  onChange: (prefs: LessonPlanPreferences) => void;
  onEnableWebSearchChange: (enabled: boolean) => void;
  onClose: () => void;
};

const LANGUAGE_OPTIONS: { value: LessonPlanLanguagePref; label: string }[] = [
  { value: "follow", label: "跟随系统" },
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
  { value: "bilingual", label: "双语" },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-default-500 dark:text-default-400">
      {children}
    </h3>
  );
}

function FieldLabel({
  label,
  description,
}: {
  label: string;
  description?: string;
}) {
  return (
    <div className="mb-2">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </span>
      {description && (
        <p className="mt-0.5 text-xs text-default-400 dark:text-default-500">
          {description}
        </p>
      )}
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (val: T) => void;
}) {
  return (
    <ToggleButtonGroup
      selectionMode="single"
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const selected = [...keys][0] as T | undefined;
        if (selected) onChange(selected);
      }}
      className="flex rounded-lg bg-default-200 p-0.5 dark:bg-slate-800"
    >
      {options.map((opt) => (
        <ToggleButton
          key={opt.value}
          id={opt.value}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === opt.value
              ? "bg-white text-foreground shadow-xs dark:bg-slate-700 dark:text-white"
              : "text-default-500 hover:text-slate-700 dark:text-default-400 dark:hover:text-slate-200"
          }`}
        >
          {opt.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <Switch size="sm" isSelected={checked} onChange={onChange}>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
    </Switch>
  );
}

export default function SettingsDrawer({
  open,
  preferences,
  enableWebSearch,
  onChange,
  onEnableWebSearchChange,
  onClose,
}: SettingsDrawerProps) {
  const update = useCallback(
    <K extends keyof LessonPlanPreferences>(
      key: K,
      value: LessonPlanPreferences[K]
    ) => {
      onChange({ ...preferences, [key]: value });
    },
    [preferences, onChange]
  );

  const studentLevelOptions = (
    Object.entries(STUDENT_LEVEL_LABELS) as [LessonPlanStudentLevel, string][]
  ).map(([value, label]) => ({ value, label }));

  const quizDensityOptions = (
    Object.entries(QUIZ_DENSITY_LABELS) as [LessonPlanQuizDensity, string][]
  ).map(([value, label]) => ({ value, label }));

  const explanationDepthOptions = (
    Object.entries(EXPLANATION_DEPTH_LABELS) as [LessonPlanExplanationDepth, string][]
  ).map(([value, label]) => ({ value, label }));

  return (
    <Drawer isOpen={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Drawer.Backdrop>
        <Drawer.Content placement="right" className="w-[400px]">
          <Drawer.Dialog>
            <Drawer.Header className="border-b border-divider px-5 py-4 dark:border-slate-800">
              <Drawer.Heading className="text-sm font-semibold text-foreground dark:text-white">
                教学设置
              </Drawer.Heading>
            </Drawer.Header>

            <Drawer.Body className="px-5 py-5">
              {/* Section 1: Basic */}
              <div className="mb-8">
                <SectionTitle>基础参数</SectionTitle>

                {/* Duration */}
                <div className="mb-5">
                  <FieldLabel label="课时时长" description="单位：分钟" />
                  <Input
                    type="number"
                    min={5}
                    max={180}
                    step={5}
                    value={String(preferences.durationMinutes)}
                    onChange={(e) =>
                      update(
                        "durationMinutes",
                        Math.max(5, Math.min(180, Number(e.target.value) || 5))
                      )
                    }
                    className="w-full rounded-lg border border-divider bg-white px-3 py-2 text-sm text-foreground outline-hidden transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/30"
                  />
                </div>

                {/* Student Level */}
                <div className="mb-5">
                  <FieldLabel label="学生水平" description="影响内容难度和示例选择" />
                  <SegmentedControl
                    value={preferences.studentLevel}
                    options={studentLevelOptions}
                    onChange={(v) => update("studentLevel", v)}
                  />
                </div>

                {/* Language */}
                <div className="mb-5">
                  <FieldLabel label="语言偏好" description="教案输出语言" />
                  <Select
                    className="w-full"
                    value={preferences.languagePref}
                    onChange={(value) =>
                      update("languagePref", value as LessonPlanLanguagePref)
                    }
                  >
                    <Select.Trigger className="w-full rounded-lg border border-divider bg-white px-3 py-2 text-sm text-foreground transition-colors focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {LANGUAGE_OPTIONS.map((opt) => (
                          <ListBox.Item key={opt.value} id={opt.value} textValue={opt.label}>
                            {opt.label}
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>

                {/* Template */}
                <div>
                  <FieldLabel label="教案模板" description="决定教案的整体结构风格" />
                  <Select
                    className="w-full"
                    value={preferences.templateKind}
                    onChange={(value) =>
                      update("templateKind", value as LessonPlanTemplateKind)
                    }
                  >
                    <Select.Trigger className="w-full rounded-lg border border-divider bg-white px-3 py-2 text-sm text-foreground transition-colors focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {(
                          Object.entries(TEMPLATE_LABELS) as [
                            LessonPlanTemplateKind,
                            string,
                          ][]
                        ).map(([value, label]) => (
                          <ListBox.Item key={value} id={value} textValue={label}>
                            {label}
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>
              </div>

              {/* Section 2: Teaching style */}
              <div className="mb-8">
                <SectionTitle>教学风格</SectionTitle>

                {/* Quiz Density */}
                <div className="mb-5">
                  <FieldLabel label="Quiz 密度" description="教案中嵌入的测验数量" />
                  <SegmentedControl
                    value={preferences.quizDensity}
                    options={quizDensityOptions}
                    onChange={(v) => update("quizDensity", v)}
                  />
                </div>

                {/* Explanation Depth */}
                <div className="mb-5">
                  <FieldLabel label="讲解深度" description="概念解释的详细程度" />
                  <SegmentedControl
                    value={preferences.explanationDepth}
                    options={explanationDepthOptions}
                    onChange={(v) => update("explanationDepth", v)}
                  />
                </div>

                {/* Include Extension */}
                <div className="flex items-center justify-between">
                  <FieldLabel
                    label="拓展内容"
                    description="在教案末尾附加拓展材料"
                  />
                  <ToggleSwitch
                    checked={preferences.includeExtension}
                    onChange={(v) => update("includeExtension", v)}
                  />
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <FieldLabel
                    label="联网补充"
                    description="仅在需要最新案例或外部来源时开启"
                  />
                  <ToggleSwitch
                    checked={enableWebSearch}
                    onChange={onEnableWebSearchChange}
                  />
                </div>
              </div>

              {/* Section 3: Output preferences */}
              <div>
                <SectionTitle>输出偏好</SectionTitle>

                {/* Show CED Codes */}
                <div className="mb-5 flex items-center justify-between">
                  <FieldLabel
                    label="显示 CED 编码"
                    description="在章节中标注 AP 课程编码"
                  />
                  <ToggleSwitch
                    checked={preferences.showCedCodes}
                    onChange={(v) => update("showCedCodes", v)}
                  />
                </div>

                {/* Include Teacher Notes */}
                <div className="flex items-center justify-between">
                  <FieldLabel
                    label="教师备注"
                    description="在 Block 旁显示教学提示"
                  />
                  <ToggleSwitch
                    checked={preferences.includeTeacherNotes}
                    onChange={(v) => update("includeTeacherNotes", v)}
                  />
                </div>
              </div>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
