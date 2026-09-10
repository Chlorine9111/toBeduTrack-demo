"use client";

import { useMemo, useState } from "react";
import type {
  LessonPlanListStatus,
  LessonPlanSection,
  LessonPlanStatus,
  PublicLessonPlanSummary,
} from "@/lib/lesson-plan/types";
import { Button, Chip, Input, Select, ListBox, Label, Spinner } from "@heroui/react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  FileText,
  GripVertical,
  List,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";

type BulkAction = "archive" | "restore" | "delete";

type StudioSidebarProps = {
  plans: PublicLessonPlanSummary[];
  sections: LessonPlanSection[];
  selectedSectionId: string | null;
  lessonPlanId: string | null;
  onSelectSection: (id: string) => void;
  onOpenPlan: (id: string) => void;
  onAddSection: () => void;
  onMoveSection: (id: string, direction: -1 | 1) => void;
  onNewPlan: () => void;
  isLoading: boolean;
  planQuery: string;
  planStatus: LessonPlanListStatus;
  selectedPlanIds: string[];
  isBulkOperating: boolean;
  onPlanQueryChange: (value: string) => void;
  onPlanStatusChange: (value: LessonPlanListStatus) => void;
  onTogglePlanSelection: (id: string) => void;
  onToggleSelectAllVisible: () => void;
  onClearSelection: () => void;
  onBulkAction: (action: BulkAction) => void;
};

function StatusBadge({ status }: { status: LessonPlanStatus }) {
  if (status === "published") {
    return <Chip size="sm" color="success">已发布</Chip>;
  }
  if (status === "archived") {
    return <Chip size="sm" color="warning">已归档</Chip>;
  }
  return <Chip size="sm">草稿</Chip>;
}

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <Button
        variant="ghost"
        onPress={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-default-500 hover:text-slate-700 dark:text-default-400 dark:hover:text-slate-200"
      >
        <ChevronRight
          className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <Icon className="h-3.5 w-3.5" />
        {title}
      </Button>
      {open && <div>{children}</div>}
    </div>
  );
}

const STATUS_OPTIONS: Array<{ value: LessonPlanListStatus; label: string }> = [
  { value: "active", label: "在用" },
  { value: "draft", label: "草稿" },
  { value: "published", label: "已发布" },
  { value: "archived", label: "已归档" },
  { value: "all", label: "全部" },
];

export default function StudioSidebar({
  plans,
  sections,
  selectedSectionId,
  lessonPlanId,
  onSelectSection,
  onOpenPlan,
  onAddSection,
  onMoveSection,
  onNewPlan,
  isLoading,
  planQuery,
  planStatus,
  selectedPlanIds,
  isBulkOperating,
  onPlanQueryChange,
  onPlanStatusChange,
  onTogglePlanSelection,
  onToggleSelectAllVisible,
  onClearSelection,
  onBulkAction,
}: StudioSidebarProps) {
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
  const sortedSections = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  const selectedSet = useMemo(() => new Set(selectedPlanIds), [selectedPlanIds]);
  const visibleSelectedCount = plans.filter((plan) => selectedSet.has(plan.id)).length;
  const allVisibleSelected =
    plans.length > 0 && visibleSelectedCount > 0 && visibleSelectedCount === plans.length;

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-divider bg-default-100 dark:border-slate-800 dark:bg-slate-950">
      <div className="space-y-2 border-b border-divider p-3 dark:border-slate-800">
        <Button
          size="sm"
          onPress={onNewPlan}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-foreground dark:hover:bg-default-200"
        >
          <Plus className="h-3.5 w-3.5" />
          新建教案
        </Button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-default-400" />
          <Input
            type="text"
            value={planQuery}
            onChange={(event) => onPlanQueryChange(event.target.value)}
            placeholder="搜索标题或内容"
            className="w-full rounded-md border border-divider bg-white py-1.5 pl-7 pr-2 text-xs text-slate-700 outline-hidden transition-colors focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select
            className="flex-1"
            value={planStatus}
            onChange={(value) => onPlanStatusChange(value as LessonPlanListStatus)}
          >
            <Select.Trigger className="w-full rounded-md border border-divider bg-white px-2 py-1.5 text-xs text-slate-700 transition-colors focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-blue-500">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {STATUS_OPTIONS.map((option) => (
                  <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                    {option.label}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Button
            size="sm"
            variant="secondary"
            onPress={onToggleSelectAllVisible}
            isDisabled={plans.length === 0}
            className="rounded-md border border-divider px-2 py-1.5 text-[11px] text-default-500 hover:bg-default-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {allVisibleSelected ? "取消全选" : "全选"}
          </Button>
        </div>

        {selectedPlanIds.length > 0 && (
          <div className="rounded-md border border-divider bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] text-default-500 dark:text-default-400">
                已选 {selectedPlanIds.length} 项
              </span>
              <Button
                size="sm"
                variant="ghost"
                onPress={onClearSelection}
                className="text-[11px] text-default-500 underline underline-offset-2 hover:text-slate-700 dark:text-default-400 dark:hover:text-slate-200"
              >
                清空
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <Button
                size="sm"
                variant="secondary"
                onPress={() => onBulkAction("archive")}
                isDisabled={isBulkOperating}
                className="flex items-center justify-center gap-1 rounded-md border border-divider px-1.5 py-1 text-[11px] text-default-500 hover:bg-default-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Archive className="h-3 w-3" />
                归档
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => onBulkAction("restore")}
                isDisabled={isBulkOperating}
                className="flex items-center justify-center gap-1 rounded-md border border-divider px-1.5 py-1 text-[11px] text-default-500 hover:bg-default-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <RotateCcw className="h-3 w-3" />
                恢复
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => onBulkAction("delete")}
                isDisabled={isBulkOperating}
                className="flex items-center justify-center gap-1 rounded-md border border-red-200 px-1.5 py-1 text-[11px] text-red-600 hover:bg-red-50 dark:border-red-800/50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <Trash2 className="h-3 w-3" />
                删除
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <CollapsibleSection title="我的教案" icon={FileText} defaultOpen={true}>
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Spinner size="sm" />
            </div>
          ) : plans.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-default-400 dark:text-default-500">
              暂无教案
            </p>
          ) : (
            <div className="space-y-0.5 px-2 pb-2">
              {plans.map((plan) => {
                const isActive = plan.id === lessonPlanId;
                const isSelected = selectedSet.has(plan.id);
                return (
                  <div
                    key={plan.id}
                    className={`flex items-start gap-2 rounded-md px-2 py-2 transition-colors ${
                      isActive
                        ? "bg-white shadow-xs ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
                        : "hover:bg-white/60 dark:hover:bg-slate-900/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onTogglePlanSelection(plan.id)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-default-300 text-foreground focus:ring-slate-500 dark:border-slate-600 dark:bg-slate-800"
                    />
                    <Button
                      variant="ghost"
                      onPress={() => onOpenPlan(plan.id)}
                      className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`truncate text-xs font-medium ${
                            isActive
                              ? "text-foreground dark:text-white"
                              : "text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {plan.title || "未命名教案"}
                        </span>
                        <StatusBadge status={plan.status} />
                      </div>
                      <span className="text-[10px] text-default-400 dark:text-default-500">
                        {plan.subjectLabel}
                      </span>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="章节导航" icon={List} defaultOpen={true}>
          {sortedSections.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-default-400 dark:text-default-500">
              暂无章节
            </p>
          ) : (
            <div className="space-y-0.5 px-2 pb-2">
              {sortedSections.map((section, index) => {
                const isSelected = section.id === selectedSectionId;
                const isHovered = section.id === hoveredSectionId;
                return (
                  <div
                    key={section.id}
                    onMouseEnter={() => setHoveredSectionId(section.id)}
                    onMouseLeave={() => setHoveredSectionId(null)}
                    className={`group flex items-center gap-1 rounded-md transition-colors ${
                      isSelected
                        ? "border-l-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-l-2 border-transparent hover:bg-white/60 dark:hover:bg-slate-900/40"
                    }`}
                  >
                    <GripVertical className="ml-1 h-3 w-3 shrink-0 text-slate-300 dark:text-default-500" />

                    <Button
                      variant="ghost"
                      onPress={() => onSelectSection(section.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-1"
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                          isSelected
                            ? "bg-blue-500 text-white"
                            : "bg-slate-200 text-default-500 dark:bg-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span
                        className={`truncate text-xs ${
                          isSelected
                            ? "font-medium text-blue-700 dark:text-blue-300"
                            : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {section.title || "未命名章节"}
                      </span>
                      <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[10px] text-default-400 dark:text-default-500">
                        <Clock className="h-2.5 w-2.5" />
                        {section.durationMinutes}m
                      </span>
                    </Button>

                    {isHovered && (
                      <div className="flex shrink-0 flex-col pr-1">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          onPress={() => onMoveSection(section.id, -1)}
                          isDisabled={index === 0}
                          className="rounded p-0.5 text-default-400 hover:text-default-500 dark:text-default-500 dark:hover:text-slate-300"
                          aria-label="上移"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          onPress={() => onMoveSection(section.id, 1)}
                          isDisabled={index === sortedSections.length - 1}
                          className="rounded p-0.5 text-default-400 hover:text-default-500 dark:text-default-500 dark:hover:text-slate-300"
                          aria-label="下移"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="px-3 pb-3">
            <Button
              variant="ghost"
              onPress={onAddSection}
              className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-default-300 px-2 py-1.5 text-xs text-default-500 hover:border-slate-400 hover:text-slate-700 dark:border-slate-700 dark:text-default-400 dark:hover:border-slate-600 dark:hover:text-slate-300"
            >
              <Plus className="h-3 w-3" />
              新增章节
            </Button>
          </div>
        </CollapsibleSection>
      </div>
    </aside>
  );
}
