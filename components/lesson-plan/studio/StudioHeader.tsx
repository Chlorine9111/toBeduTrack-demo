"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { LessonPlanDocument } from "@/lib/lesson-plan/types";
import { TEMPLATE_LABELS } from "@/lib/lesson-plan/defaults";
import { Button, Chip, Input, Select, ListBox, Label, Spinner } from "@heroui/react";
import {
  ArrowLeft,
  Settings,
  Eye,
  List,
  Trash2,
  Globe,
  Link,
  Copy,
  Archive,
  RotateCcw,
  Check,
  AlertTriangle,
  Circle,
  Download,
} from "lucide-react";

type SaveState = "idle" | "saving" | "saved" | "error";
export type LessonPlanExportMode = "teacher" | "student" | "classroom";
export type LessonPlanExportTemplateVariant =
  | "lesson-plan-standard"
  | "lesson-plan-compact";
export type LessonPlanExportPageSize = "A4" | "Letter";
export type LessonPlanExportOptions = {
  mode: LessonPlanExportMode;
  templateVariant: LessonPlanExportTemplateVariant;
  pageSize: LessonPlanExportPageSize;
};

type StudioHeaderProps = {
  lessonPlan: LessonPlanDocument | null;
  saveState: SaveState;
  isGenerating: boolean;
  isExportingPdf: boolean;
  embedded?: boolean;
  onPreview: () => void;
  onExportPdf: (options: LessonPlanExportOptions) => void | Promise<void>;
  onCopy: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
  onOpenPlans: () => void;
  onOpenSettings: () => void;
  onTitleChange: (title: string) => void;
};

const SAVE_STATUS_CONFIG: Record<
  SaveState,
  { label: string; className: string }
> = {
  idle: { label: "未保存", className: "text-default-400 dark:text-default-500" },
  saving: { label: "保存中...", className: "text-default-500 dark:text-default-400" },
  saved: { label: "已保存", className: "text-green-600 dark:text-green-400" },
  error: { label: "保存失败", className: "text-red-600 dark:text-red-400" },
};

function SaveStatusIcon({ saveState }: { saveState: SaveState }) {
  switch (saveState) {
    case "idle":
      return <Circle className="h-3 w-3" />;
    case "saving":
      return <Spinner size="sm" />;
    case "saved":
      return <Check className="h-3 w-3" />;
    case "error":
      return <AlertTriangle className="h-3 w-3" />;
  }
}

export default function StudioHeader({
  lessonPlan,
  saveState,
  isGenerating,
  isExportingPdf,
  embedded = false,
  onPreview,
  onExportPdf,
  onCopy,
  onArchive,
  onRestore,
  onPublish,
  onUnpublish,
  onDelete,
  onOpenPlans,
  onOpenSettings,
  onTitleChange,
}: StudioHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(lessonPlan?.title ?? "");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<LessonPlanExportMode>("teacher");
  const [exportTemplateVariant, setExportTemplateVariant] =
    useState<LessonPlanExportTemplateVariant>("lesson-plan-standard");
  const [exportPageSize, setExportPageSize] =
    useState<LessonPlanExportPageSize>("A4");
  const inputRef = useRef<HTMLInputElement>(null);
  const exportPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitleDraft(lessonPlan?.title ?? "");
  }, [lessonPlan?.title]);

  useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!exportOpen) return;
      if (!exportPanelRef.current) return;
      if (!exportPanelRef.current.contains(event.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [exportOpen]);

  const handleExport = useCallback(async () => {
    await onExportPdf({
      mode: exportMode,
      templateVariant: exportTemplateVariant,
      pageSize: exportPageSize,
    });
    setExportOpen(false);
  }, [exportMode, exportPageSize, exportTemplateVariant, onExportPdf]);

  const commitTitle = useCallback(() => {
    setIsEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== lessonPlan?.title) {
      onTitleChange(trimmed);
    } else {
      setTitleDraft(lessonPlan?.title ?? "");
    }
  }, [titleDraft, lessonPlan?.title, onTitleChange]);

  const isPublished = lessonPlan?.status === "published";
  const isArchived = lessonPlan?.status === "archived";
  const statusConfig = SAVE_STATUS_CONFIG[saveState];

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-divider bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
      {/* Left section */}
      <div className="flex min-w-0 items-center gap-3">
        {!embedded && (
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={() => window.history.back()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-default-500 hover:bg-default-200 hover:text-slate-700 dark:text-default-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="返回"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}

        {lessonPlan ? (
          <div className="flex min-w-0 items-center gap-2">
            {isEditingTitle ? (
              <Input
                ref={inputRef}
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                  if (e.key === "Escape") {
                    setTitleDraft(lessonPlan.title);
                    setIsEditingTitle(false);
                  }
                }}
                className="min-w-0 max-w-xs rounded border border-blue-400 bg-white px-2 py-1 text-sm font-medium text-foreground outline-hidden dark:border-blue-500 dark:bg-slate-800 dark:text-white"
              />
            ) : (
              <Button
                variant="ghost"
                onPress={() => setIsEditingTitle(true)}
                className="truncate text-sm font-medium text-foreground hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
              >
                {lessonPlan.title || "未命名教案"}
              </Button>
            )}

            {lessonPlan.subjectLabel && (
              <Chip size="sm" color="accent" className="shrink-0">
                {lessonPlan.subjectLabel}
              </Chip>
            )}

            <Chip size="sm" className="shrink-0">
              {TEMPLATE_LABELS[lessonPlan.preferences.templateKind]}
            </Chip>
          </div>
        ) : (
          <span className="text-sm text-default-400 dark:text-default-500">
            新教案
          </span>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Save status */}
        <div
          className={`flex items-center gap-1 text-xs ${statusConfig.className}`}
        >
          <SaveStatusIcon saveState={saveState} />
          <span>{statusConfig.label}</span>
        </div>

        {/* Published slug */}
        {isPublished && lessonPlan?.publishedSlug && (
          <Chip size="sm" color="success">
            <Link className="h-3 w-3" />
            <Chip.Label>{lessonPlan.publishedSlug}</Chip.Label>
          </Chip>
        )}

        <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        {/* Plans */}
        <Button
          size="sm"
          variant="secondary"
          onPress={onOpenPlans}
          data-testid="open-plans-drawer"
          className="flex h-8 items-center gap-1.5 rounded-md border border-divider px-3 text-xs font-medium text-slate-700 hover:bg-default-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <List className="h-3.5 w-3.5" />
          教案列表
        </Button>

        {/* Settings */}
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          onPress={onOpenSettings}
          className="flex h-8 w-8 items-center justify-center rounded-md text-default-500 hover:bg-default-200 hover:text-slate-700 dark:text-default-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="设置"
        >
          <Settings className="h-4 w-4" />
        </Button>

        {/* Preview */}
        <Button
          size="sm"
          variant="secondary"
          onPress={onPreview}
          className="flex h-8 items-center gap-1.5 rounded-md border border-divider px-3 text-xs font-medium text-slate-700 hover:bg-default-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          isDisabled={!lessonPlan || isGenerating}
        >
          <Eye className="h-3.5 w-3.5" />
          预览
        </Button>

        <div className="relative" ref={exportPanelRef}>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => setExportOpen((current) => !current)}
            className="flex h-8 items-center gap-1.5 rounded-md border border-divider px-3 text-xs font-medium text-slate-700 hover:bg-default-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            isDisabled={!lessonPlan || isGenerating || isExportingPdf}
          >
            {isExportingPdf ? (
              <Spinner size="sm" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            导出 PDF
          </Button>

          {exportOpen && (
            <div className="absolute right-0 top-10 z-20 w-72 rounded-lg border border-divider bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <div className="space-y-3">
                <Select
                  className="w-full"
                  value={exportMode}
                  onChange={(value) =>
                    setExportMode(value as LessonPlanExportMode)
                  }
                >
                  <Label className="text-xs text-default-500 dark:text-default-400">导出模式</Label>
                  <Select.Trigger className="w-full rounded-md border border-divider bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="teacher" textValue="教师版">教师版</ListBox.Item>
                      <ListBox.Item id="student" textValue="学生版">学生版</ListBox.Item>
                      <ListBox.Item id="classroom" textValue="课堂版">课堂版</ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>

                <Select
                  className="w-full"
                  value={exportTemplateVariant}
                  onChange={(value) =>
                    setExportTemplateVariant(
                      value as LessonPlanExportTemplateVariant,
                    )
                  }
                >
                  <Label className="text-xs text-default-500 dark:text-default-400">模板样式</Label>
                  <Select.Trigger className="w-full rounded-md border border-divider bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="lesson-plan-standard" textValue="标准版">标准版</ListBox.Item>
                      <ListBox.Item id="lesson-plan-compact" textValue="紧凑版">紧凑版</ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>

                <Select
                  className="w-full"
                  value={exportPageSize}
                  onChange={(value) =>
                    setExportPageSize(
                      value as LessonPlanExportPageSize,
                    )
                  }
                >
                  <Label className="text-xs text-default-500 dark:text-default-400">纸张尺寸</Label>
                  <Select.Trigger className="w-full rounded-md border border-divider bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="A4" textValue="A4">A4</ListBox.Item>
                      <ListBox.Item id="Letter" textValue="Letter">Letter</ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>

                <Button
                  size="sm"
                  onPress={() => void handleExport()}
                  className="flex h-8 w-full items-center justify-center rounded-md bg-blue-600 text-xs font-medium text-white hover:bg-blue-700"
                  isDisabled={!lessonPlan || isGenerating || isExportingPdf}
                >
                  {isExportingPdf ? (
                    <>
                      <Spinner size="sm" className="mr-1.5" />
                      导出中...
                    </>
                  ) : (
                    "确认导出"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Copy */}
        <Button
          size="sm"
          variant="secondary"
          onPress={onCopy}
          className="flex h-8 items-center gap-1.5 rounded-md border border-divider px-3 text-xs font-medium text-default-500 hover:bg-default-100 dark:border-slate-700 dark:text-default-400 dark:hover:bg-slate-800"
          isDisabled={!lessonPlan || isGenerating}
        >
          <Copy className="h-3.5 w-3.5" />
          复制
        </Button>

        {/* Publish / Unpublish / Restore */}
        {isArchived ? (
          <Button
            size="sm"
            variant="secondary"
            onPress={onRestore}
            className="flex h-8 items-center gap-1.5 rounded-md border border-divider px-3 text-xs font-medium text-default-500 hover:bg-default-100 dark:border-slate-700 dark:text-default-400 dark:hover:bg-slate-800"
            isDisabled={isGenerating}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复草稿
          </Button>
        ) : isPublished ? (
          <Button
            size="sm"
            variant="secondary"
            onPress={onUnpublish}
            className="flex h-8 items-center gap-1.5 rounded-md border border-divider px-3 text-xs font-medium text-default-500 hover:bg-default-100 dark:border-slate-700 dark:text-default-400 dark:hover:bg-slate-800"
            isDisabled={isGenerating}
          >
            <Globe className="h-3.5 w-3.5" />
            取消发布
          </Button>
        ) : (
          <Button
            size="sm"
            onPress={onPublish}
            className="flex h-8 items-center gap-1.5 rounded-md bg-green-600 px-3 text-xs font-medium text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-500"
            isDisabled={!lessonPlan || isGenerating}
          >
            <Globe className="h-3.5 w-3.5" />
            发布
          </Button>
        )}

        {/* Archive */}
        {!isArchived && (
          <Button
            size="sm"
            variant="secondary"
            onPress={onArchive}
            className="flex h-8 items-center gap-1.5 rounded-md border border-divider px-3 text-xs font-medium text-default-500 hover:bg-default-100 dark:border-slate-700 dark:text-default-400 dark:hover:bg-slate-800"
            isDisabled={!lessonPlan || isGenerating}
          >
            <Archive className="h-3.5 w-3.5" />
            归档
          </Button>
        )}

        {/* Delete */}
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          onPress={onDelete}
          className="flex h-8 w-8 items-center justify-center rounded-md text-default-400 hover:bg-red-50 hover:text-red-600 dark:text-default-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          aria-label="删除"
          isDisabled={!lessonPlan}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
