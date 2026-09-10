"use client";

import { useState, useCallback } from "react";
import TaskListPanel from "./TaskListPanel";
import ConfigForm from "./ConfigForm";
import PipelineTimeline from "./PipelineTimeline";
import ExamPreview from "./ExamPreview";
import { useExamTasks } from "@/hooks/use-exam-tasks";
import { useExamPipelineStream } from "@/hooks/use-exam-pipeline-stream";
import type {
  ExamTask,
  ExamTaskConfig,
  PipelineStepId,
  PipelineStepStatus,
  PipelineLogEntry,
  ExamResult,
} from "@/lib/exam-agent/types";

// ─── Types ──────────────────────────────────────────────

type ViewMode = "config" | "pipeline" | "preview";

// ─── Component ─────────────────────────────────────────

export default function ExamAgentPage() {
  const { tasks, loading, createTask, updateTaskLocally } = useExamTasks();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("config");
  const [creating, setCreating] = useState(false);

  const activeTask = tasks.find((t) => t.id === activeTaskId);

  // ─── SSE callbacks ──────────────────────────────────

  const handleStepUpdate = useCallback(
    (stepId: PipelineStepId, status: PipelineStepStatus) => {
      if (!activeTaskId) return;
      updateTaskLocally(activeTaskId, (task) => ({
        ...task,
        pipelineSteps: task.pipelineSteps.map((step) =>
          step.id === stepId ? { ...step, status } : step,
        ),
      }));
    },
    [activeTaskId, updateTaskLocally],
  );

  const handleLog = useCallback(
    (stepId: PipelineStepId, entry: PipelineLogEntry) => {
      if (!activeTaskId) return;
      updateTaskLocally(activeTaskId, (task) => ({
        ...task,
        pipelineSteps: task.pipelineSteps.map((step) =>
          step.id === stepId ? { ...step, logs: [...step.logs, entry] } : step,
        ),
      }));
    },
    [activeTaskId, updateTaskLocally],
  );

  const handleProgress = useCallback(
    (current: number, total: number) => {
      if (!activeTaskId) return;
      updateTaskLocally(activeTaskId, (task) => ({
        ...task,
        progress: { current, total },
      }));
    },
    [activeTaskId, updateTaskLocally],
  );

  const handleCompleted = useCallback(
    (result: ExamResult) => {
      if (!activeTaskId) return;
      updateTaskLocally(activeTaskId, (task) => ({
        ...task,
        status: "completed",
        result,
        completedAt: Date.now(),
      }));
      setViewMode("preview");
    },
    [activeTaskId, updateTaskLocally],
  );

  const handleFailed = useCallback(
    (error: string) => {
      if (!activeTaskId) return;
      updateTaskLocally(activeTaskId, (task) => ({
        ...task,
        status: "failed",
        error,
      }));
    },
    [activeTaskId, updateTaskLocally],
  );

  useExamPipelineStream(activeTaskId, activeTask?.status, {
    onStepUpdate: handleStepUpdate,
    onLog: handleLog,
    onProgress: handleProgress,
    onCompleted: handleCompleted,
    onFailed: handleFailed,
  });

  // ─── Actions ────────────────────────────────────────

  const handleNewTask = useCallback(() => {
    setActiveTaskId(null);
    setViewMode("config");
  }, []);

  const handleSelectTask = useCallback(
    (taskId: string) => {
      setActiveTaskId(taskId);
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      if (task.status === "completed") {
        setViewMode("preview");
      } else if (task.status === "running") {
        setViewMode("pipeline");
      } else {
        setViewMode("config");
      }
    },
    [tasks],
  );

  const handleCreateTask = useCallback(
    async (config: ExamTaskConfig) => {
      setCreating(true);
      try {
        const { taskId } = await createTask(config);
        setActiveTaskId(taskId);
        setViewMode("pipeline");
      } finally {
        setCreating(false);
      }
    },
    [createTask],
  );

  const handleCancel = useCallback(() => {
    // Return to config view — actual cancellation is handled by the API layer
    setViewMode("config");
  }, []);

  const handleShowPipeline = useCallback(() => {
    setViewMode("pipeline");
  }, []);

  // ─── Main panel renderer ────────────────────────────

  function renderMainPanel() {
    if (viewMode === "pipeline" && activeTask) {
      return <PipelineTimeline task={activeTask} onCancel={handleCancel} />;
    }

    if (viewMode === "preview" && activeTask) {
      return <ExamPreview task={activeTask} onShowPipeline={handleShowPipeline} />;
    }

    // Default: config form (new task or configuring state)
    return <ConfigForm onSubmit={handleCreateTask} loading={creating} />;
  }

  // ─── Render ─────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* Left panel: task list */}
      <div className="w-64 shrink-0">
        <TaskListPanel
          tasks={tasks}
          activeTaskId={activeTaskId}
          onSelectTask={handleSelectTask}
          onNewTask={handleNewTask}
          loading={loading}
        />
      </div>

      {/* Right panel: config / pipeline / preview */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {renderMainPanel()}
      </div>
    </div>
  );
}
