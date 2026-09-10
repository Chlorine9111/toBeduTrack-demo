import type {
  ExamTask,
  ExamTaskConfig,
  ExamSseEvent,
  PipelineStepId,
  PipelineStepStatus,
  PipelineLogEntry,
  ExamResult,
} from "./types";
import { createInitialPipelineSteps } from "./types";

type SseCallback = (event: ExamSseEvent) => void;

// Use globalThis to survive Next.js HMR in dev mode
const globalStore = globalThis as unknown as {
  __examAgentTasks?: Map<string, ExamTask>;
  __examAgentSubscribers?: Map<string, Set<SseCallback>>;
  __examAgentCounter?: number;
};

const tasks = (globalStore.__examAgentTasks ??= new Map<string, ExamTask>());
const subscribers = (globalStore.__examAgentSubscribers ??= new Map<string, Set<SseCallback>>());

let counter = (globalStore.__examAgentCounter ??= 0);

function generateId(): string {
  globalStore.__examAgentCounter = (globalStore.__examAgentCounter ?? 0) + 1;
  counter = globalStore.__examAgentCounter;
  return `exam-${Date.now()}-${counter}`;
}

export function createTask(teacherId: string, config: ExamTaskConfig): ExamTask {
  const task: ExamTask = {
    id: generateId(),
    teacherId,
    config,
    status: "running",
    pipelineSteps: createInitialPipelineSteps(),
    progress: { current: 0, total: config.questionCount },
    createdAt: Date.now(),
  };
  tasks.set(task.id, task);
  return task;
}

export function getTask(taskId: string): ExamTask | undefined {
  return tasks.get(taskId);
}

export function getTasksByTeacher(teacherId: string): ExamTask[] {
  return [...tasks.values()]
    .filter((t) => t.teacherId === teacherId)
    .sort((a, b) => {
      const timeDiff = b.createdAt - a.createdAt;
      if (timeDiff !== 0) return timeDiff;
      // 同毫秒内按 id 中的 counter 降序排列
      const aCounter = parseInt(a.id.split("-").pop() ?? "0", 10);
      const bCounter = parseInt(b.id.split("-").pop() ?? "0", 10);
      return bCounter - aCounter;
    });
}

export function deleteTask(taskId: string): boolean {
  subscribers.delete(taskId);
  return tasks.delete(taskId);
}

export function updateStepStatus(
  taskId: string,
  stepId: PipelineStepId,
  status: PipelineStepStatus,
): void {
  const task = tasks.get(taskId);
  if (!task) return;
  const updatedSteps = task.pipelineSteps.map((s) =>
    s.id === stepId
      ? {
          ...s,
          status,
          ...(status === "running" && !s.startedAt ? { startedAt: Date.now() } : {}),
          ...(status === "completed" || status === "failed" ? { completedAt: Date.now() } : {}),
        }
      : s,
  );
  const updated: ExamTask = { ...task, pipelineSteps: updatedSteps };
  tasks.set(taskId, updated);
  emit(taskId, { type: "step-update", stepId, status });
}

export function appendLog(
  taskId: string,
  stepId: PipelineStepId,
  entry: PipelineLogEntry,
): void {
  const task = tasks.get(taskId);
  if (!task) return;
  const updatedSteps = task.pipelineSteps.map((s) =>
    s.id === stepId ? { ...s, logs: [...s.logs, entry] } : s,
  );
  const updated: ExamTask = { ...task, pipelineSteps: updatedSteps };
  tasks.set(taskId, updated);
  emit(taskId, { type: "log", stepId, entry });
}

export function updateProgress(taskId: string, current: number, total: number): void {
  const task = tasks.get(taskId);
  if (!task) return;
  const updated: ExamTask = { ...task, progress: { current, total } };
  tasks.set(taskId, updated);
  emit(taskId, { type: "progress", current, total });
}

export function completeTask(taskId: string, result: ExamResult): void {
  const task = tasks.get(taskId);
  if (!task) return;
  const updated: ExamTask = { ...task, status: "completed", result, completedAt: Date.now() };
  tasks.set(taskId, updated);
  emit(taskId, { type: "completed", result });
}

export function failTask(taskId: string, error: string): void {
  const task = tasks.get(taskId);
  if (!task) return;
  const updated: ExamTask = { ...task, status: "failed", error, completedAt: Date.now() };
  tasks.set(taskId, updated);
  emit(taskId, { type: "failed", error });
}

export function subscribe(taskId: string, callback: SseCallback): () => void {
  let set = subscribers.get(taskId);
  if (!set) {
    set = new Set();
    subscribers.set(taskId, set);
  }
  set.add(callback);
  return () => {
    set!.delete(callback);
    if (set!.size === 0) subscribers.delete(taskId);
  };
}

function emit(taskId: string, event: ExamSseEvent): void {
  const set = subscribers.get(taskId);
  if (!set) return;
  for (const cb of set) {
    try {
      cb(event);
    } catch {}
  }
}
