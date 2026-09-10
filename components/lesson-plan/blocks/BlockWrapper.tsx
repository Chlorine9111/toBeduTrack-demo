"use client";

import type { LessonPlanBlock } from "@/lib/lesson-plan/types";
import { BLOCK_TYPE_OPTIONS } from "@/lib/lesson-plan/defaults";
import { Button } from "@heroui/react";
import {
  GripVertical,
  Pencil,
  Eye,
  Sparkles,
  Copy,
  ChevronUp,
  ChevronDown,
  Trash2,
} from "lucide-react";

type Props = {
  block: LessonPlanBlock;
  isEditing: boolean;
  onToggleEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onRewrite: () => void;
  onDuplicate: () => void;
  children: React.ReactNode;
};

function ControlButton({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <Button
      isIconOnly
      size="sm"
      variant="ghost"
      onPress={onClick}
      aria-label={label}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-all duration-200 ${
        danger
          ? "text-slate-400 hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
          : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
      }`}
    >
      {icon}
    </Button>
  );
}

export default function BlockWrapper({
  block,
  isEditing,
  onToggleEdit,
  onMoveUp,
  onMoveDown,
  onDelete,
  onRewrite,
  onDuplicate,
  children,
}: Props) {
  const typeLabel =
    BLOCK_TYPE_OPTIONS.find((o) => o.value === block.type)?.label ?? block.type;

  return (
    <div className="group relative" data-block-id={block.id}>
      {/* 左侧浮动控制条 */}
      <div
        className={`absolute -left-11 top-0 flex flex-col items-center gap-0.5 transition-all duration-200 ${
          isEditing
            ? "translate-x-0 opacity-100"
            : "translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
        }`}
      >
        <div className="cursor-grab text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400">
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="flex flex-col gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 shadow-xs dark:border-slate-700 dark:bg-slate-800">
          <ControlButton
            icon={
              isEditing ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <Pencil className="h-3.5 w-3.5" />
              )
            }
            label={isEditing ? "预览" : "编辑"}
            onClick={onToggleEdit}
          />
          <ControlButton
            icon={<ChevronUp className="h-3.5 w-3.5" />}
            label="上移"
            onClick={onMoveUp}
          />
          <ControlButton
            icon={<ChevronDown className="h-3.5 w-3.5" />}
            label="下移"
            onClick={onMoveDown}
          />
          <ControlButton
            icon={<Copy className="h-3.5 w-3.5" />}
            label="复制"
            onClick={onDuplicate}
          />
          <ControlButton
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="AI 重写"
            onClick={onRewrite}
          />
          <ControlButton
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="删除"
            onClick={onDelete}
            danger
          />
        </div>
      </div>

      {/* 主容器 */}
      <div
        className={`relative rounded-xl border px-4 py-3 transition-all duration-200 ${
          isEditing
            ? "border-indigo-300 bg-indigo-50/30 dark:border-indigo-700 dark:bg-indigo-950/20"
            : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
        }`}
      >
        {/* 区块类型标签 */}
        <span
          className={`absolute right-3 top-2 text-[10px] font-medium uppercase tracking-wider transition-all duration-200 ${
            isEditing
              ? "text-indigo-500 opacity-100 dark:text-indigo-400"
              : "text-slate-400 opacity-0 group-hover:opacity-100 dark:text-slate-500"
          }`}
        >
          {typeLabel}
        </span>

        {/* 区块内容 */}
        <div className={isEditing ? "pr-12" : ""}>{children}</div>
      </div>
    </div>
  );
}
