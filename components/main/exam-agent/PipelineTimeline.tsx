"use client";

import { Button } from "@heroui/react";
import { X } from "lucide-react";
import PipelineStep from "./PipelineStep";
import type { ExamTask } from "@/lib/exam-agent/types";

// ─── Config summary helper ──────────────────────────────

function configSummary(task: ExamTask): string {
  const { config } = task;
  const parts: string[] = [];
  parts.push(config.subjectName);
  if (config.unitNames.length > 0) {
    parts.push(config.unitNames.join("、"));
  }
  parts.push(`${config.questionCount} 题`);
  parts.push(config.questionTypes.join("/"));
  parts.push(
    config.difficultyPreference === "easy"
      ? "偏易"
      : config.difficultyPreference === "hard"
        ? "偏难"
        : "均衡",
  );
  return parts.join(" · ");
}

// ─── Component ─────────────────────────────────────────

interface PipelineTimelineProps {
  task: ExamTask;
  onCancel: () => void;
}

export default function PipelineTimeline({ task, onCancel }: PipelineTimelineProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-default-200 px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground">
            {task.config.examName ?? "生成试卷中…"}
          </h2>
          <p className="mt-0.5 text-xs text-default-500">{configSummary(task)}</p>
        </div>
        <Button
          size="sm"
          variant="danger-soft"
          onPress={onCancel}
          className="shrink-0 flex items-center gap-1.5"
        >
          <X className="h-3.5 w-3.5" />
          取消
        </Button>
      </div>

      {/* Body: scrollable pipeline steps */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-0">
          {task.pipelineSteps.map((step, idx) => (
            <PipelineStep
              key={step.id}
              step={step}
              isLast={idx === task.pipelineSteps.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
