"use client";

import type {
  LessonIntentResult,
  LessonPlanPreferences,
  LessonPlanTemplateKind,
  LessonPlanStudentLevel,
  OutlineResult,
} from "@/lib/lesson-plan/types";
import type { Key } from "@heroui/react";
import {
  TEMPLATE_LABELS,
  STUDENT_LEVEL_LABELS,
} from "@/lib/lesson-plan/defaults";
import { Card, Chip, Input, Select, ListBox, Label } from "@heroui/react";
import {
  CheckCircle,
  BookOpen,
  Layers,
  Tag,
  Pencil,
  Layout,
  Clock,
  GraduationCap,
} from "lucide-react";

type IntentConfirmCardProps = {
  intent: LessonIntentResult;
  outline: OutlineResult | null;
  preferences: LessonPlanPreferences;
  onTitleChange: (title: string) => void;
  onPreferencesChange: (prefs: Partial<LessonPlanPreferences>) => void;
};

function Pill({
  icon: Icon,
  label,
  variant = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  variant?: "default" | "blue" | "green";
}) {
  const colorMap: Record<string, "default" | "accent" | "success"> = {
    default: "default",
    blue: "accent",
    green: "success",
  };

  return (
    <Chip size="sm" color={colorMap[variant]}>
      <Icon className="h-3 w-3" />
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  );
}

export default function IntentConfirmCard({
  intent,
  outline,
  preferences,
  onTitleChange,
  onPreferencesChange,
}: IntentConfirmCardProps) {
  // When intent needs clarification, we should not render this card.
  // The parent controls visibility, but handle gracefully.
  if (intent.needsClarification) {
    return null;
  }

  const { confirmation } = intent;

  return (
    <Card className="rounded-xl border border-green-200 bg-white p-4 shadow-xs dark:border-green-800/40 dark:bg-slate-900">
      {/* Header */}
      <Card.Header className="mb-4 flex-row items-center gap-2">
        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
        <Card.Title className="text-sm font-semibold text-foreground dark:text-white">
          确认教案参数
        </Card.Title>
      </Card.Header>

      {/* CED Info */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Pill
            icon={BookOpen}
            label={`${confirmation.subject.code} ${confirmation.subject.name}`}
            variant="blue"
          />
          <Pill
            icon={Layers}
            label={`Unit ${confirmation.unit.unitNumber}: ${confirmation.unit.title}`}
            variant="green"
          />
        </div>

        {confirmation.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {confirmation.topics.map((topic) => (
              <Pill
                key={topic.id}
                icon={Tag}
                label={`${topic.topicNumber} ${topic.title}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="mb-4 border-t border-slate-100 dark:border-slate-800" />

      {/* Adjustable params - 2x2 grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Title */}
        <div>
          <Label className="mb-1 flex items-center gap-1 text-xs font-medium text-default-500 dark:text-default-400">
            <Pencil className="h-3 w-3" />
            标题
          </Label>
          <Input
            type="text"
            value={outline?.title ?? ""}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="教案标题"
            className="w-full rounded-lg border border-divider bg-white px-2.5 py-1.5 text-sm text-foreground outline-hidden transition-colors focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500"
          />
        </div>

        {/* Template */}
        <div>
          <Select
            className="w-full"
            value={preferences.templateKind}
            onChange={(value) =>
              onPreferencesChange({
                templateKind: value as LessonPlanTemplateKind,
              })
            }
          >
            <Label className="mb-1 flex items-center gap-1 text-xs font-medium text-default-500 dark:text-default-400">
              <Layout className="h-3 w-3" />
              模板类型
            </Label>
            <Select.Trigger className="w-full rounded-lg border border-divider bg-white px-2.5 py-1.5 text-sm text-foreground transition-colors focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
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

        {/* Duration */}
        <div>
          <Label className="mb-1 flex items-center gap-1 text-xs font-medium text-default-500 dark:text-default-400">
            <Clock className="h-3 w-3" />
            课时时长
          </Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={5}
              max={180}
              step={5}
              value={String(preferences.durationMinutes)}
              onChange={(e) =>
                onPreferencesChange({
                  durationMinutes: Math.max(
                    5,
                    Math.min(180, Number(e.target.value) || 5)
                  ),
                })
              }
              className="w-full rounded-lg border border-divider bg-white px-2.5 py-1.5 text-sm text-foreground outline-hidden transition-colors focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500"
            />
            <span className="shrink-0 text-xs text-default-400">分钟</span>
          </div>
        </div>

        {/* Student Level */}
        <div>
          <Select
            className="w-full"
            value={preferences.studentLevel}
            onChange={(value) =>
              onPreferencesChange({
                studentLevel: value as LessonPlanStudentLevel,
              })
            }
          >
            <Label className="mb-1 flex items-center gap-1 text-xs font-medium text-default-500 dark:text-default-400">
              <GraduationCap className="h-3 w-3" />
              学生水平
            </Label>
            <Select.Trigger className="w-full rounded-lg border border-divider bg-white px-2.5 py-1.5 text-sm text-foreground transition-colors focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {(
                  Object.entries(STUDENT_LEVEL_LABELS) as [
                    LessonPlanStudentLevel,
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
    </Card>
  );
}
