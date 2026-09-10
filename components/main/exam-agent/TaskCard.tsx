"use client";

import { Card, Chip, Label, ProgressBar } from "@heroui/react";
import { cn } from "@/lib/utils";
import type { ExamTask, ExamTaskStatus } from "@/lib/exam-agent/types";

// ─── 状态配置 ───────────────────────────────────────────

const STATUS_CONFIG: Record<
  ExamTaskStatus,
  { label: string; color: "default" | "accent" | "success" | "warning" | "danger" }
> = {
  configuring: { label: "配置中", color: "default" },
  running: { label: "生成中", color: "accent" },
  completed: { label: "已完成", color: "success" },
  paused: { label: "已暂停", color: "warning" },
  failed: { label: "失败", color: "danger" },
};

// ─── Props ──────────────────────────────────────────────

type TaskCardProps = {
  task: ExamTask;
  isActive: boolean;
  onSelect: (taskId: string) => void;
};

// ─── 辅助函数 ───────────────────────────────────────────

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getProgressPercent(task: ExamTask): number {
  const { current, total } = task.progress;
  if (total === 0) return 0;
  return Math.round((current / total) * 100);
}

// ─── 组件 ───────────────────────────────────────────────

export default function TaskCard({ task, isActive, onSelect }: TaskCardProps) {
  const { config, status, result, progress } = task;
  const statusConf = STATUS_CONFIG[status];
  const isRunning = status === "running";
  const isCompleted = status === "completed";
  const progressPercent = getProgressPercent(task);

  return (
    <button
      type="button"
      className="w-full text-left"
      onClick={() => onSelect(task.id)}
    >
      <Card
        variant={isActive ? "secondary" : "default"}
        className={cn(
          "w-full cursor-pointer transition-all duration-150",
          isActive
            ? "ring-2 ring-accent ring-offset-1"
            : "hover:opacity-90"
        )}
      >
        <Card.Content className="flex flex-col gap-2 p-3">
          {/* 标题行：课程名 + 状态 */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {config.examName || config.subjectName}
              </p>
              {config.examName && (
                <p className="truncate text-xs text-muted">{config.subjectName}</p>
              )}
            </div>
            <Chip color={statusConf.color} size="sm" variant="soft">
              {statusConf.label}
            </Chip>
          </div>

          {/* 概要：题目数 + 语言 */}
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>{config.questionCount} 题</span>
            <span>·</span>
            <span>{config.questionTypes.join(" + ")}</span>
            <span>·</span>
            <span>{config.language}</span>
          </div>

          {/* 进度条（运行中） */}
          {isRunning && (
            <ProgressBar
              aria-label="出卷进度"
              value={progressPercent}
              size="sm"
              className="w-full"
            >
              <div className="mb-1 flex items-center justify-between text-xs text-muted">
                <Label>进度</Label>
                <ProgressBar.Output />
              </div>
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
          )}

          {/* 质量分（已完成） */}
          {isCompleted && result && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">质量分</span>
              <span
                className={cn(
                  "font-semibold",
                  result.stats.averageQuality >= 80
                    ? "text-success"
                    : result.stats.averageQuality >= 60
                      ? "text-warning"
                      : "text-danger"
                )}
              >
                {result.stats.averageQuality.toFixed(0)}
              </span>
            </div>
          )}

          {/* 创建时间 */}
          <p className="text-[11px] text-muted">{formatTime(task.createdAt)}</p>
        </Card.Content>
      </Card>
    </button>
  );
}
