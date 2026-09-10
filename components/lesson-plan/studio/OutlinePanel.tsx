"use client";

import { useCallback } from "react";
import type { OutlineResult, OutlineSection } from "@/lib/lesson-plan/types";
import { Button, Chip, Input, TextArea } from "@heroui/react";
import {
  ListOrdered,
  Clock,
  ChevronUp,
  ChevronDown,
  X,
  Plus,
} from "lucide-react";

type OutlinePanelProps = {
  outline: OutlineResult;
  onOutlineChange: (outline: OutlineResult) => void;
};

function generateId(): string {
  return `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function OutlinePanel({
  outline,
  onOutlineChange,
}: OutlinePanelProps) {
  const totalDuration = outline.sections.reduce(
    (sum, s) => sum + s.durationMinutes,
    0
  );

  const updateTitle = useCallback(
    (title: string) => {
      onOutlineChange({ ...outline, title });
    },
    [outline, onOutlineChange]
  );

  const updateSection = useCallback(
    (id: string, updates: Partial<OutlineSection>) => {
      onOutlineChange({
        ...outline,
        sections: outline.sections.map((s) =>
          s.id === id ? { ...s, ...updates } : s
        ),
      });
    },
    [outline, onOutlineChange]
  );

  const moveSection = useCallback(
    (id: string, direction: -1 | 1) => {
      const idx = outline.sections.findIndex((s) => s.id === id);
      if (idx < 0) return;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= outline.sections.length) return;
      const newSections = [...outline.sections];
      const temp = newSections[idx];
      newSections[idx] = newSections[targetIdx];
      newSections[targetIdx] = temp;
      onOutlineChange({ ...outline, sections: newSections });
    },
    [outline, onOutlineChange]
  );

  const deleteSection = useCallback(
    (id: string) => {
      onOutlineChange({
        ...outline,
        sections: outline.sections.filter((s) => s.id !== id),
      });
    },
    [outline, onOutlineChange]
  );

  const addSection = useCallback(() => {
    const newSection: OutlineSection = {
      id: generateId(),
      title: "",
      summary: "",
      durationMinutes: 10,
      keyPoints: [],
    };
    onOutlineChange({
      ...outline,
      sections: [...outline.sections, newSection],
    });
  }, [outline, onOutlineChange]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-divider px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <ListOrdered className="h-4 w-4 text-default-500 dark:text-default-400" />
          <h2 className="text-sm font-semibold text-foreground dark:text-white">
            教案大纲
          </h2>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-default-500 dark:text-default-400">
          <Clock className="h-3 w-3" />
          <span>总时长 {totalDuration} 分钟</span>
        </div>
      </div>

      {/* Title */}
      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800/50">
        <label className="mb-1 block text-xs font-medium text-default-500 dark:text-default-400">
          教案标题
        </label>
        <Input
          type="text"
          value={outline.title}
          onChange={(e) => updateTitle(e.target.value)}
          placeholder="输入教案标题"
          className="w-full rounded-lg border border-divider bg-white px-3 py-2 text-sm font-medium text-foreground outline-hidden transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/30"
        />
      </div>

      {/* Sections list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {outline.sections.length === 0 ? (
          <p className="py-8 text-center text-sm text-default-400 dark:text-default-500">
            暂无章节，点击下方按钮添加
          </p>
        ) : (
          <div className="space-y-3">
            {outline.sections.map((section, index) => (
              <SectionCard
                key={section.id}
                section={section}
                index={index}
                total={outline.sections.length}
                onUpdate={(updates) => updateSection(section.id, updates)}
                onMove={(dir) => moveSection(section.id, dir)}
                onDelete={() => deleteSection(section.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add section button */}
      <div className="border-t border-divider px-4 py-3 dark:border-slate-800">
        <Button
          variant="ghost"
          onPress={addSection}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-default-300 py-2 text-xs font-medium text-default-500 hover:border-slate-400 hover:text-slate-700 dark:border-slate-700 dark:text-default-400 dark:hover:border-slate-600 dark:hover:text-slate-300"
        >
          <Plus className="h-3.5 w-3.5" />
          添加章节
        </Button>
      </div>
    </div>
  );
}

function SectionCard({
  section,
  index,
  total,
  onUpdate,
  onMove,
  onDelete,
}: {
  section: OutlineSection;
  index: number;
  total: number;
  onUpdate: (updates: Partial<OutlineSection>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <div className="group rounded-xl border border-divider bg-white p-3 transition-shadow hover:shadow-xs dark:border-slate-800 dark:bg-slate-900/50">
      {/* Top row */}
      <div className="mb-2 flex items-start gap-2">
        {/* Number */}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-slate-200 dark:text-foreground">
          {index + 1}
        </span>

        {/* Title input */}
        <Input
          type="text"
          value={section.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="章节标题"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-hidden placeholder-slate-400 dark:text-white dark:placeholder-slate-500"
        />

        {/* Duration */}
        <div className="flex shrink-0 items-center gap-1">
          <Clock className="h-3 w-3 text-default-400" />
          <Input
            type="number"
            min={1}
            max={120}
            value={String(section.durationMinutes)}
            onChange={(e) =>
              onUpdate({
                durationMinutes: Math.max(1, Number(e.target.value) || 1),
              })
            }
            className="w-10 bg-transparent text-right text-xs text-default-500 outline-hidden dark:text-slate-300"
          />
          <span className="text-[10px] text-default-400">min</span>
        </div>

        {/* Actions (visible on hover) */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={() => onMove(-1)}
            isDisabled={index === 0}
            className="rounded p-1 text-default-400 hover:text-default-500 dark:text-default-500 dark:hover:text-slate-300"
            aria-label="上移"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={() => onMove(1)}
            isDisabled={index === total - 1}
            className="rounded p-1 text-default-400 hover:text-default-500 dark:text-default-500 dark:hover:text-slate-300"
            aria-label="下移"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={onDelete}
            className="rounded p-1 text-default-400 hover:text-red-500 dark:text-default-500 dark:hover:text-red-400"
            aria-label="删除"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Summary */}
      <TextArea
        value={section.summary}
        onChange={(e) => onUpdate({ summary: e.target.value })}
        placeholder="章节摘要..."
        rows={2}
        className="mb-2 w-full resize-none rounded-md bg-default-100 px-2.5 py-1.5 text-xs leading-relaxed text-slate-700 outline-hidden placeholder-slate-400 transition-colors focus:bg-default-200 dark:bg-slate-800/50 dark:text-slate-300 dark:placeholder-slate-500 dark:focus:bg-slate-800"
      />

      {/* Key points */}
      {section.keyPoints.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {section.keyPoints.map((point, i) => (
            <Chip
              key={i}
              size="sm"
              color="accent"
              className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
            >
              {point}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
