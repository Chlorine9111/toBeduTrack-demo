"use client";

import { Button, ScrollShadow } from "@heroui/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import TaskCard from "./TaskCard";
import type { ExamTask } from "@/lib/exam-agent/types";

// ─── Props ──────────────────────────────────────────────

type TaskListPanelProps = {
  tasks: ExamTask[];
  activeTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onNewTask: () => void;
  loading?: boolean;
};

// ─── 组件 ───────────────────────────────────────────────

export default function TaskListPanel({
  tasks,
  activeTaskId,
  onSelectTask,
  onNewTask,
  loading = false,
}: TaskListPanelProps) {
  return (
    <div className="flex h-full w-full flex-col border-r border-divider bg-surface">
      {/* 顶部标题栏 */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">出卷任务</h2>
        <Button
          variant="ghost"
          size="sm"
          onPress={onNewTask}
          isDisabled={loading}
          aria-label="新建出卷任务"
          className="h-8 gap-1.5 px-2 text-xs text-muted hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          新建
        </Button>
      </div>

      {/* 任务列表 */}
      <ScrollShadow className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-4">
        {tasks.length === 0 ? (
          <div
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center",
              "text-sm text-muted"
            )}
          >
            <p>暂无出卷任务</p>
            <Button
              variant="outline"
              size="sm"
              onPress={onNewTask}
              isDisabled={loading}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              新建任务
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2 pt-1">
            {tasks.map((task) => (
              <li key={task.id}>
                <TaskCard
                  task={task}
                  isActive={task.id === activeTaskId}
                  onSelect={onSelectTask}
                />
              </li>
            ))}
          </ul>
        )}
      </ScrollShadow>
    </div>
  );
}
