"use client";

import { useState, useCallback, useEffect } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/api/client";
import type { ExamTask, ExamTaskConfig } from "@/lib/exam-agent/types";

type UseExamTasksReturn = {
  tasks: ExamTask[];
  loading: boolean;
  createTask: (config: ExamTaskConfig) => Promise<{ taskId: string }>;
  deleteTask: (taskId: string) => Promise<void>;
  refresh: () => Promise<void>;
  updateTaskLocally: (taskId: string, updater: (task: ExamTask) => ExamTask) => void;
};

export function useExamTasks(): UseExamTasksReturn {
  const [tasks, setTasks] = useState<ExamTask[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await apiGet<{ tasks: ExamTask[] }>("/api/exam-agent/tasks");
      setTasks(res.tasks);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createTask = useCallback(
    async (config: ExamTaskConfig) => {
      const res = await apiPost<{ taskId: string; status: string }>("/api/exam-agent/tasks", config);
      await refresh();
      return res;
    },
    [refresh],
  );

  const deleteTaskFn = useCallback(async (taskId: string) => {
    await apiDelete(`/api/exam-agent/tasks/${taskId}`);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const updateTaskLocally = useCallback((taskId: string, updater: (task: ExamTask) => ExamTask) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? updater(t) : t)));
  }, []);

  return { tasks, loading, createTask, deleteTask: deleteTaskFn, refresh, updateTaskLocally };
}
