# Exam Agent 一键出卷 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous exam generation page where teachers configure subject/unit/count/difficulty, click once, and an AI agent produces a complete exam with answers and explanations — all with real-time pipeline visualization.

**Architecture:** New sidebar page `/main/exam-agent` with Master-Detail layout. Left panel: task list. Right panel switches between config form (new task), pipeline timeline (running), and exam preview (completed). Backend uses SSE for real-time progress. Reuses existing `runApExercisePipeline()` for question generation and `renderExamTypstPdf()` for PDF export.

**Tech Stack:** Next.js 15 App Router, React 19, HeroUI v3, TypeScript, SSE (Server-Sent Events), existing exercise pipeline, Typst PDF rendering.

**Design Spec:** `docs/superpowers/specs/2026-04-07-exam-agent-design.md`

---

## File Structure

### New files

```
lib/exam-agent/
  types.ts                          # ExamTask, ExamResult, PipelineStep types
  store.ts                          # In-memory task store (Map-based, per-teacher)
  blueprint-planner.ts              # CED weight → question allocation
  orchestrator.ts                   # 5-step pipeline orchestrator with SSE callbacks
  assembler.ts                      # Assemble pipeline output into ExamResult

app/main/(with-sidebar)/exam-agent/
  page.tsx                          # Route entry (dynamic import)

app/api/exam-agent/
  tasks/route.ts                    # POST create task, GET list tasks
  tasks/[taskId]/route.ts           # GET task detail, DELETE cancel task
  tasks/[taskId]/stream/route.ts    # GET SSE stream
  tasks/[taskId]/export/route.ts    # POST export PDF

components/main/exam-agent/
  ExamAgentPage.tsx                 # Main page (Master-Detail layout)
  TaskListPanel.tsx                 # Left panel: task list
  TaskCard.tsx                      # Single task card
  ConfigForm.tsx                    # New task config form
  PipelineTimeline.tsx              # Pipeline timeline (running state)
  PipelineStep.tsx                  # Single pipeline step with logs
  ExamPreview.tsx                   # Exam preview (completed state)
  ExamQuestionCard.tsx              # Single question card
  ExamStatsBar.tsx                  # Stats bar with tabs

hooks/
  use-exam-tasks.ts                 # Task list CRUD hook
  use-exam-pipeline-stream.ts       # SSE stream subscription hook
```

### Modified files

```
components/shells/IconSidebar.tsx   # Add exam-agent nav item
```

---

## Task 1: Types — `lib/exam-agent/types.ts`

**Files:**
- Create: `lib/exam-agent/types.ts`
- Test: `tests/exam-agent/types.spec.ts`

- [ ] **Step 1: Write the type definitions**

```typescript
// lib/exam-agent/types.ts
import type { ApExercisePipelineOutput, PipelineExercise } from "@/lib/agent/exercise-pipeline-types";

// ─── Task Config ───────────────────────────────────────

export type ExamTaskStatus = "configuring" | "running" | "completed" | "paused" | "failed";

export type DifficultyPreference = "easy" | "balanced" | "hard";

export type ExamTaskConfig = {
  subject: string;
  subjectName: string;
  units: string[];
  unitNames: string[];
  questionCount: number;
  questionTypes: ("MC" | "FR")[];
  difficultyPreference: DifficultyPreference;
  language: "中文" | "英文";
  examName?: string;
};

// ─── Pipeline ──────────────────────────────────────────

export type PipelineStepId =
  | "analyze-curriculum"
  | "plan-blueprint"
  | "generate-questions"
  | "verify-review"
  | "assemble-exam";

export type PipelineStepStatus = "pending" | "running" | "completed" | "failed";

export type PipelineLogLevel = "info" | "warn" | "error" | "decision";

export type PipelineLogEntry = {
  timestamp: number;
  level: PipelineLogLevel;
  message: string;
};

export type PipelineStep = {
  id: PipelineStepId;
  name: string;
  status: PipelineStepStatus;
  startedAt?: number;
  completedAt?: number;
  logs: PipelineLogEntry[];
};

// ─── Exam Result ───────────────────────────────────────

export type ExamQuestionVerificationStatus = "passed" | "repaired" | "warning";

export type ExamQuestion = {
  index: number;
  exercise: PipelineExercise;
  topicId: string;
  topicName: string;
  bloomLevel: string;
  verificationStatus: ExamQuestionVerificationStatus;
  qualityScore: number;
};

export type ExamSection = {
  title: string;
  questionType: "MC" | "FR";
  pointsPerQuestion: number;
  totalPoints: number;
  questions: ExamQuestion[];
};

export type ExamResultStats = {
  totalQuestions: number;
  passedCount: number;
  repairedCount: number;
  averageQuality: number;
  topicCoverage: number;
  totalTimeMs: number;
};

export type ExamResult = {
  examName: string;
  sections: ExamSection[];
  stats: ExamResultStats;
  pipelineOutput: ApExercisePipelineOutput;
};

// ─── Task ──────────────────────────────────────────────

export type ExamTask = {
  id: string;
  teacherId: string;
  config: ExamTaskConfig;
  status: ExamTaskStatus;
  pipelineSteps: PipelineStep[];
  progress: { current: number; total: number };
  result?: ExamResult;
  error?: string;
  createdAt: number;
  completedAt?: number;
};

// ─── SSE Events ────────────────────────────────────────

export type ExamSseEvent =
  | { type: "step-update"; stepId: PipelineStepId; status: PipelineStepStatus }
  | { type: "log"; stepId: PipelineStepId; entry: PipelineLogEntry }
  | { type: "progress"; current: number; total: number }
  | { type: "completed"; result: ExamResult }
  | { type: "failed"; error: string }
  | { type: "heartbeat" };

// ─── Helpers ───────────────────────────────────────────

export function createInitialPipelineSteps(): PipelineStep[] {
  return [
    { id: "analyze-curriculum", name: "分析课程大纲", status: "pending", logs: [] },
    { id: "plan-blueprint", name: "制定出卷蓝图", status: "pending", logs: [] },
    { id: "generate-questions", name: "生成题目", status: "pending", logs: [] },
    { id: "verify-review", name: "验证与质量审查", status: "pending", logs: [] },
    { id: "assemble-exam", name: "组装试卷", status: "pending", logs: [] },
  ];
}
```

- [ ] **Step 2: Write tests for the helper function**

```typescript
// tests/exam-agent/types.spec.ts
import { describe, it, expect } from "vitest";
import { createInitialPipelineSteps } from "@/lib/exam-agent/types";

describe("createInitialPipelineSteps", () => {
  it("returns 5 steps all pending with empty logs", () => {
    const steps = createInitialPipelineSteps();
    expect(steps).toHaveLength(5);
    for (const step of steps) {
      expect(step.status).toBe("pending");
      expect(step.logs).toEqual([]);
    }
  });

  it("returns steps in correct order", () => {
    const steps = createInitialPipelineSteps();
    expect(steps.map((s) => s.id)).toEqual([
      "analyze-curriculum",
      "plan-blueprint",
      "generate-questions",
      "verify-review",
      "assemble-exam",
    ]);
  });

  it("returns a fresh array each call (no mutation risk)", () => {
    const a = createInitialPipelineSteps();
    const b = createInitialPipelineSteps();
    expect(a).not.toBe(b);
    a[0].status = "running";
    expect(b[0].status).toBe("pending");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/exam-agent/types.spec.ts`
Expected: 3 tests PASS

- [ ] **Step 4: Commit**

```bash
git add lib/exam-agent/types.ts tests/exam-agent/types.spec.ts
git commit -m "feat(exam-agent): add type definitions and initial pipeline steps helper"
```

---

## Task 2: Task Store — `lib/exam-agent/store.ts`

**Files:**
- Create: `lib/exam-agent/store.ts`
- Test: `tests/exam-agent/store.spec.ts`

- [ ] **Step 1: Write the store**

```typescript
// lib/exam-agent/store.ts
import type { ExamTask, ExamTaskConfig, ExamSseEvent, PipelineStepId, PipelineStepStatus, PipelineLogEntry, ExamResult } from "./types";
import { createInitialPipelineSteps } from "./types";

type SseCallback = (event: ExamSseEvent) => void;

const tasks = new Map<string, ExamTask>();
const subscribers = new Map<string, Set<SseCallback>>();

let counter = 0;

function generateId(): string {
  counter += 1;
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
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteTask(taskId: string): boolean {
  subscribers.delete(taskId);
  return tasks.delete(taskId);
}

// ─── Mutations (immutable updates) ─────────────────────

export function updateStepStatus(taskId: string, stepId: PipelineStepId, status: PipelineStepStatus): void {
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

export function appendLog(taskId: string, stepId: PipelineStepId, entry: PipelineLogEntry): void {
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

// ─── SSE Subscription ──────────────────────────────────

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
    try { cb(event); } catch {}
  }
}
```

- [ ] **Step 2: Write tests**

```typescript
// tests/exam-agent/store.spec.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createTask,
  getTask,
  getTasksByTeacher,
  deleteTask,
  updateStepStatus,
  appendLog,
  updateProgress,
  completeTask,
  failTask,
  subscribe,
} from "@/lib/exam-agent/store";
import type { ExamTaskConfig, ExamSseEvent } from "@/lib/exam-agent/types";

const config: ExamTaskConfig = {
  subject: "ap-statistics",
  subjectName: "AP Statistics",
  units: ["unit-4"],
  unitNames: ["Unit 4"],
  questionCount: 10,
  questionTypes: ["MC"],
  difficultyPreference: "balanced",
  language: "英文",
};

describe("exam-agent store", () => {
  it("createTask returns a task with running status and 5 pipeline steps", () => {
    const task = createTask("teacher-1", config);
    expect(task.status).toBe("running");
    expect(task.pipelineSteps).toHaveLength(5);
    expect(task.progress).toEqual({ current: 0, total: 10 });
    expect(task.teacherId).toBe("teacher-1");
  });

  it("getTask retrieves a created task", () => {
    const task = createTask("teacher-1", config);
    expect(getTask(task.id)).toEqual(task);
  });

  it("getTasksByTeacher returns tasks sorted by newest first", () => {
    const t1 = createTask("teacher-2", config);
    const t2 = createTask("teacher-2", config);
    const result = getTasksByTeacher("teacher-2");
    expect(result[0].id).toBe(t2.id);
    expect(result[1].id).toBe(t1.id);
  });

  it("deleteTask removes the task", () => {
    const task = createTask("teacher-3", config);
    expect(deleteTask(task.id)).toBe(true);
    expect(getTask(task.id)).toBeUndefined();
  });

  it("updateStepStatus emits step-update event", () => {
    const task = createTask("teacher-4", config);
    const events: ExamSseEvent[] = [];
    subscribe(task.id, (e) => events.push(e));

    updateStepStatus(task.id, "analyze-curriculum", "running");

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "step-update",
      stepId: "analyze-curriculum",
      status: "running",
    });

    const updated = getTask(task.id)!;
    expect(updated.pipelineSteps[0].status).toBe("running");
    expect(updated.pipelineSteps[0].startedAt).toBeDefined();
  });

  it("appendLog emits log event and appends to step", () => {
    const task = createTask("teacher-5", config);
    const events: ExamSseEvent[] = [];
    subscribe(task.id, (e) => events.push(e));

    const entry = { timestamp: Date.now(), level: "info" as const, message: "test log" };
    appendLog(task.id, "analyze-curriculum", entry);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "log", stepId: "analyze-curriculum" });

    const updated = getTask(task.id)!;
    expect(updated.pipelineSteps[0].logs).toHaveLength(1);
  });

  it("completeTask sets status and emits completed event", () => {
    const task = createTask("teacher-6", config);
    const events: ExamSseEvent[] = [];
    subscribe(task.id, (e) => events.push(e));

    const result = {
      examName: "Test Exam",
      sections: [],
      stats: { totalQuestions: 10, passedCount: 10, repairedCount: 0, averageQuality: 9, topicCoverage: 1, totalTimeMs: 5000 },
      pipelineOutput: {} as any,
    };
    completeTask(task.id, result);

    const updated = getTask(task.id)!;
    expect(updated.status).toBe("completed");
    expect(updated.result).toBeDefined();
    expect(events.some((e) => e.type === "completed")).toBe(true);
  });

  it("unsubscribe stops receiving events", () => {
    const task = createTask("teacher-7", config);
    const events: ExamSseEvent[] = [];
    const unsub = subscribe(task.id, (e) => events.push(e));

    updateProgress(task.id, 1, 10);
    expect(events).toHaveLength(1);

    unsub();
    updateProgress(task.id, 2, 10);
    expect(events).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/exam-agent/store.spec.ts`
Expected: 7 tests PASS

- [ ] **Step 4: Commit**

```bash
git add lib/exam-agent/store.ts tests/exam-agent/store.spec.ts
git commit -m "feat(exam-agent): add in-memory task store with SSE pub/sub"
```

---

## Task 3: Blueprint Planner — `lib/exam-agent/blueprint-planner.ts`

**Files:**
- Create: `lib/exam-agent/blueprint-planner.ts`
- Test: `tests/exam-agent/blueprint-planner.spec.ts`

- [ ] **Step 1: Write the blueprint planner**

```typescript
// lib/exam-agent/blueprint-planner.ts
import type { ExamTaskConfig, DifficultyPreference } from "./types";
import type { ExerciseBlueprint } from "@/lib/agent/exercise-pipeline-types";

type QuestionSlot = {
  type: "MC" | "FR";
  unit: string;
  unitName: string;
  difficultyBand: "基础巩固" | "中等应用" | "高阶分析";
  bloomLevel: "记忆" | "理解" | "应用" | "分析" | "评价" | "创造";
};

const DIFFICULTY_DISTRIBUTIONS: Record<DifficultyPreference, [number, number, number]> = {
  easy: [0.5, 0.35, 0.15],
  balanced: [0.3, 0.45, 0.25],
  hard: [0.15, 0.35, 0.5],
};

const BLOOM_BY_DIFFICULTY: Record<string, ("记忆" | "理解" | "应用" | "分析" | "评价" | "创造")[]> = {
  "基础巩固": ["记忆", "理解"],
  "中等应用": ["应用", "分析"],
  "高阶分析": ["评价", "创造"],
};

export function planQuestionSlots(config: ExamTaskConfig): QuestionSlot[] {
  const { units, unitNames, questionCount, questionTypes, difficultyPreference } = config;
  const [easyPct, medPct, hardPct] = DIFFICULTY_DISTRIBUTIONS[difficultyPreference];
  const slots: QuestionSlot[] = [];

  // Distribute questions evenly across units
  const perUnit = Math.floor(questionCount / units.length);
  const remainder = questionCount % units.length;

  for (let u = 0; u < units.length; u++) {
    const unitCount = perUnit + (u < remainder ? 1 : 0);
    const easyCount = Math.round(unitCount * easyPct);
    const hardCount = Math.round(unitCount * hardPct);
    const medCount = unitCount - easyCount - hardCount;

    const difficulties: Array<{ band: QuestionSlot["difficultyBand"]; count: number }> = [
      { band: "基础巩固", count: easyCount },
      { band: "中等应用", count: medCount },
      { band: "高阶分析", count: hardCount },
    ];

    for (const { band, count } of difficulties) {
      const bloomOptions = BLOOM_BY_DIFFICULTY[band];
      for (let i = 0; i < count; i++) {
        const type = questionTypes.length === 1
          ? questionTypes[0]
          : i % 4 === 0 ? "FR" : "MC";
        slots.push({
          type,
          unit: units[u],
          unitName: unitNames[u],
          difficultyBand: band,
          bloomLevel: bloomOptions[i % bloomOptions.length],
        });
      }
    }
  }

  return slots;
}

export function slotsToBlueprintBatches(
  config: ExamTaskConfig,
  slots: QuestionSlot[],
  batchSize: number = 5,
): ExerciseBlueprint[] {
  const blueprints: ExerciseBlueprint[] = [];

  for (let i = 0; i < slots.length; i += batchSize) {
    const batch = slots.slice(i, i + batchSize);
    const primary = batch[0];
    blueprints.push({
      subject: config.subjectName,
      unit: primary.unitName,
      learningObjective: null,
      exerciseType: primary.type,
      count: batch.length,
      bloomLevel: primary.bloomLevel,
      difficultyBand: primary.difficultyBand,
      needRealWorldContext: true,
      language: config.language === "英文" ? "英文" : "中文",
      teacherIntent: `Generate ${batch.length} ${primary.type} questions for ${config.subjectName} ${primary.unitName} at ${primary.difficultyBand} level`,
    });
  }

  return blueprints;
}
```

- [ ] **Step 2: Write tests**

```typescript
// tests/exam-agent/blueprint-planner.spec.ts
import { describe, it, expect } from "vitest";
import { planQuestionSlots, slotsToBlueprintBatches } from "@/lib/exam-agent/blueprint-planner";
import type { ExamTaskConfig } from "@/lib/exam-agent/types";

const config: ExamTaskConfig = {
  subject: "ap-statistics",
  subjectName: "AP Statistics",
  units: ["unit-4", "unit-5"],
  unitNames: ["Unit 4", "Unit 5"],
  questionCount: 10,
  questionTypes: ["MC", "FR"],
  difficultyPreference: "balanced",
  language: "英文",
};

describe("planQuestionSlots", () => {
  it("returns exactly questionCount slots", () => {
    const slots = planQuestionSlots(config);
    expect(slots).toHaveLength(10);
  });

  it("distributes questions across units", () => {
    const slots = planQuestionSlots(config);
    const unit4Count = slots.filter((s) => s.unit === "unit-4").length;
    const unit5Count = slots.filter((s) => s.unit === "unit-5").length;
    expect(unit4Count).toBe(5);
    expect(unit5Count).toBe(5);
  });

  it("applies difficulty distribution for balanced preference", () => {
    const slots = planQuestionSlots(config);
    const easy = slots.filter((s) => s.difficultyBand === "基础巩固").length;
    const hard = slots.filter((s) => s.difficultyBand === "高阶分析").length;
    // balanced = 30% easy, 25% hard → for 10 questions, ~3 easy, ~3 hard
    expect(easy).toBeGreaterThanOrEqual(2);
    expect(easy).toBeLessThanOrEqual(4);
    expect(hard).toBeGreaterThanOrEqual(2);
    expect(hard).toBeLessThanOrEqual(4);
  });

  it("handles single unit with odd count", () => {
    const singleUnit: ExamTaskConfig = { ...config, units: ["u1"], unitNames: ["U1"], questionCount: 7 };
    const slots = planQuestionSlots(singleUnit);
    expect(slots).toHaveLength(7);
    expect(slots.every((s) => s.unit === "u1")).toBe(true);
  });

  it("handles MC-only type", () => {
    const mcOnly: ExamTaskConfig = { ...config, questionTypes: ["MC"] };
    const slots = planQuestionSlots(mcOnly);
    expect(slots.every((s) => s.type === "MC")).toBe(true);
  });
});

describe("slotsToBlueprintBatches", () => {
  it("creates batches of specified size", () => {
    const slots = planQuestionSlots(config);
    const batches = slotsToBlueprintBatches(config, slots, 5);
    expect(batches).toHaveLength(2);
    expect(batches[0].count).toBe(5);
    expect(batches[1].count).toBe(5);
  });

  it("handles remainder batch", () => {
    const small: ExamTaskConfig = { ...config, questionCount: 7, units: ["u1"], unitNames: ["U1"] };
    const slots = planQuestionSlots(small);
    const batches = slotsToBlueprintBatches(small, slots, 5);
    expect(batches).toHaveLength(2);
    expect(batches[0].count).toBe(5);
    expect(batches[1].count).toBe(2);
  });

  it("sets subject name from config", () => {
    const slots = planQuestionSlots(config);
    const batches = slotsToBlueprintBatches(config, slots, 5);
    expect(batches[0].subject).toBe("AP Statistics");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/exam-agent/blueprint-planner.spec.ts`
Expected: 8 tests PASS

- [ ] **Step 4: Commit**

```bash
git add lib/exam-agent/blueprint-planner.ts tests/exam-agent/blueprint-planner.spec.ts
git commit -m "feat(exam-agent): add blueprint planner for CED-weighted question allocation"
```

---

## Task 4: Assembler — `lib/exam-agent/assembler.ts`

**Files:**
- Create: `lib/exam-agent/assembler.ts`
- Test: `tests/exam-agent/assembler.spec.ts`

- [ ] **Step 1: Write the assembler**

```typescript
// lib/exam-agent/assembler.ts
import type { ApExercisePipelineOutput, PassedExerciseResult } from "@/lib/agent/exercise-pipeline-types";
import type { ExamTaskConfig, ExamResult, ExamSection, ExamQuestion, ExamQuestionVerificationStatus } from "./types";

function mapVerificationStatus(result: PassedExerciseResult): ExamQuestionVerificationStatus {
  if (result.repaired) return "repaired";
  if (result.verificationStatus === "verified") return "passed";
  return "warning";
}

function estimateQualityScore(result: PassedExerciseResult): number {
  const base = result.verificationStatus === "verified" ? 9.0 : 7.5;
  const repairPenalty = result.repaired ? -0.5 : 0;
  const logPenalty = result.logs.some((l) => l.hasAmbiguity) ? -0.3 : 0;
  return Math.max(0, Math.min(10, base + repairPenalty + logPenalty));
}

export function assembleExamResult(
  config: ExamTaskConfig,
  pipelineOutput: ApExercisePipelineOutput,
): ExamResult {
  const mcResults: PassedExerciseResult[] = [];
  const frResults: PassedExerciseResult[] = [];

  for (const result of pipelineOutput.passedResults) {
    if (result.exercise.type === "MC") {
      mcResults.push(result);
    } else {
      frResults.push(result);
    }
  }

  const sections: ExamSection[] = [];
  let questionIndex = 1;

  if (mcResults.length > 0) {
    const mcPointsEach = 3;
    const mcQuestions: ExamQuestion[] = mcResults.map((r) => {
      const q: ExamQuestion = {
        index: questionIndex++,
        exercise: r.exercise,
        topicId: r.exercise.topicId ?? "",
        topicName: pipelineOutput.curriculumContext?.topicName ?? "",
        bloomLevel: pipelineOutput.blueprint.bloomLevel,
        verificationStatus: mapVerificationStatus(r),
        qualityScore: estimateQualityScore(r),
      };
      return q;
    });
    sections.push({
      title: "Section I: Multiple Choice",
      questionType: "MC",
      pointsPerQuestion: mcPointsEach,
      totalPoints: mcResults.length * mcPointsEach,
      questions: mcQuestions,
    });
  }

  if (frResults.length > 0) {
    const frPointsEach = 8;
    const frQuestions: ExamQuestion[] = frResults.map((r) => {
      const q: ExamQuestion = {
        index: questionIndex++,
        exercise: r.exercise,
        topicId: r.exercise.topicId ?? "",
        topicName: pipelineOutput.curriculumContext?.topicName ?? "",
        bloomLevel: pipelineOutput.blueprint.bloomLevel,
        verificationStatus: mapVerificationStatus(r),
        qualityScore: estimateQualityScore(r),
      };
      return q;
    });
    sections.push({
      title: "Section II: Free Response",
      questionType: "FR",
      pointsPerQuestion: frPointsEach,
      totalPoints: frResults.length * frPointsEach,
      questions: frQuestions,
    });
  }

  const allQuestions = sections.flatMap((s) => s.questions);
  const passedCount = allQuestions.filter((q) => q.verificationStatus === "passed").length;
  const repairedCount = allQuestions.filter((q) => q.verificationStatus === "repaired").length;
  const avgQuality = allQuestions.length > 0
    ? allQuestions.reduce((sum, q) => sum + q.qualityScore, 0) / allQuestions.length
    : 0;

  const examName = config.examName ?? `${config.subjectName} ${config.unitNames.join(", ")} Exam`;

  return {
    examName,
    sections,
    stats: {
      totalQuestions: allQuestions.length,
      passedCount,
      repairedCount,
      averageQuality: Math.round(avgQuality * 10) / 10,
      topicCoverage: pipelineOutput.metrics.passed / Math.max(pipelineOutput.metrics.requested, 1),
      totalTimeMs: pipelineOutput.metrics.timings.totalMs,
    },
    pipelineOutput,
  };
}
```

- [ ] **Step 2: Write tests**

```typescript
// tests/exam-agent/assembler.spec.ts
import { describe, it, expect } from "vitest";
import { assembleExamResult } from "@/lib/exam-agent/assembler";
import type { ExamTaskConfig } from "@/lib/exam-agent/types";
import type { ApExercisePipelineOutput, PassedExerciseResult, PipelineExercise } from "@/lib/agent/exercise-pipeline-types";

function makeMcExercise(i: number): PipelineExercise {
  return {
    questionText: `MC Question ${i}`,
    type: "MC",
    difficulty: "medium",
    options: [
      { label: "A", text: "Option A", isCorrect: false },
      { label: "B", text: "Option B", isCorrect: true },
      { label: "C", text: "Option C", isCorrect: false },
      { label: "D", text: "Option D", isCorrect: false },
    ],
    correctAnswer: "B",
    solutionSteps: "Step 1: ...",
    commonMistakes: ["Mistake 1"],
  };
}

function makePassedResult(ex: PipelineExercise, repaired = false): PassedExerciseResult {
  return {
    exercise: ex,
    verificationStatus: "verified",
    qualityNote: "Good",
    logs: [],
    repaired,
  };
}

const config: ExamTaskConfig = {
  subject: "ap-statistics",
  subjectName: "AP Statistics",
  units: ["unit-4"],
  unitNames: ["Unit 4"],
  questionCount: 3,
  questionTypes: ["MC"],
  difficultyPreference: "balanced",
  language: "英文",
};

const pipelineOutput: ApExercisePipelineOutput = {
  summary: "Generated 3 questions",
  fallbackUsed: false,
  fallbackReason: null,
  blueprint: { subject: "AP Statistics", unit: "Unit 4", learningObjective: null, exerciseType: "MC", count: 3, bloomLevel: "应用", difficultyBand: "中等应用", needRealWorldContext: true, language: "英文", teacherIntent: "test" },
  curriculumContext: { courseName: "AP Statistics", unitName: "Unit 4", topicName: "Probability", contextText: "" },
  passedExercises: [makeMcExercise(1), makeMcExercise(2), makeMcExercise(3)],
  passedResults: [
    makePassedResult(makeMcExercise(1)),
    makePassedResult(makeMcExercise(2)),
    makePassedResult(makeMcExercise(3), true),
  ],
  rejectedExercises: [],
  metrics: {
    requested: 3, passed: 3, rejected: 0, totalModelCalls: 2, maxRepairRounds: 2,
    verificationMode: "rule_only",
    verificationStatusCounts: { pending: 0, rule_checked: 3, verified: 3, failed: 0, manual_review: 0 },
    timings: { blueprintMs: 100, curriculumMs: 200, generationMs: 3000, teacherReviewMs: 0, verificationMs: 500, repairMs: 200, totalMs: 4000 },
  },
  teacherOptions: [],
};

describe("assembleExamResult", () => {
  it("creates sections by question type", () => {
    const result = assembleExamResult(config, pipelineOutput);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].questionType).toBe("MC");
    expect(result.sections[0].questions).toHaveLength(3);
  });

  it("assigns sequential indices", () => {
    const result = assembleExamResult(config, pipelineOutput);
    const indices = result.sections[0].questions.map((q) => q.index);
    expect(indices).toEqual([1, 2, 3]);
  });

  it("marks repaired questions correctly", () => {
    const result = assembleExamResult(config, pipelineOutput);
    const statuses = result.sections[0].questions.map((q) => q.verificationStatus);
    expect(statuses).toEqual(["passed", "passed", "repaired"]);
  });

  it("computes stats correctly", () => {
    const result = assembleExamResult(config, pipelineOutput);
    expect(result.stats.totalQuestions).toBe(3);
    expect(result.stats.passedCount).toBe(2);
    expect(result.stats.repairedCount).toBe(1);
    expect(result.stats.topicCoverage).toBe(1);
  });

  it("uses config.examName when provided", () => {
    const withName = { ...config, examName: "Custom Name" };
    const result = assembleExamResult(withName, pipelineOutput);
    expect(result.examName).toBe("Custom Name");
  });

  it("auto-generates exam name when not provided", () => {
    const result = assembleExamResult(config, pipelineOutput);
    expect(result.examName).toBe("AP Statistics Unit 4 Exam");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/exam-agent/assembler.spec.ts`
Expected: 6 tests PASS

- [ ] **Step 4: Commit**

```bash
git add lib/exam-agent/assembler.ts tests/exam-agent/assembler.spec.ts
git commit -m "feat(exam-agent): add exam assembler to structure pipeline output into sections"
```

---

## Task 5: Orchestrator — `lib/exam-agent/orchestrator.ts`

**Files:**
- Create: `lib/exam-agent/orchestrator.ts`
- Test: `tests/exam-agent/orchestrator.spec.ts`

This is the core: it runs the 5-step pipeline, calling store mutations to emit SSE events.

- [ ] **Step 1: Write the orchestrator**

```typescript
// lib/exam-agent/orchestrator.ts
import { runApExercisePipeline } from "@/lib/agent/exercise-pipeline";
import { resolveApExerciseCurriculum } from "@/lib/agent/exercise-curriculum";
import type { ApExercisePipelineOutput } from "@/lib/agent/exercise-pipeline-types";
import type { GatewayModelInput } from "@/lib/ai/gateway";
import { planQuestionSlots, slotsToBlueprintBatches } from "./blueprint-planner";
import { assembleExamResult } from "./assembler";
import * as store from "./store";
import type { ExamTask, ExamResult, PipelineLogEntry } from "./types";

function log(taskId: string, stepId: Parameters<typeof store.appendLog>[1], message: string, level: PipelineLogEntry["level"] = "info"): void {
  store.appendLog(taskId, stepId, { timestamp: Date.now(), level, message });
}

export async function runExamPipeline(task: ExamTask): Promise<void> {
  const { id: taskId, config } = task;
  const model: GatewayModelInput = { provider: "anthropic", model: "claude-haiku-4-5-20251001" };

  try {
    // ─── Step 1: Analyze Curriculum ─────────────────────
    store.updateStepStatus(taskId, "analyze-curriculum", "running");
    log(taskId, "analyze-curriculum", `课程: ${config.subjectName}`);
    log(taskId, "analyze-curriculum", `单元: ${config.unitNames.join(", ")}`);

    const curriculumResult = await resolveApExerciseCurriculum({
      teacherRequest: `Generate exam for ${config.subjectName} ${config.unitNames.join(", ")}`,
      courseId: config.subject,
      unitId: config.units[0],
    });

    log(taskId, "analyze-curriculum", `课程解析完成: ${curriculumResult.courseName ?? config.subjectName}`, "decision");
    if (curriculumResult.unitLabel) {
      log(taskId, "analyze-curriculum", `单元: ${curriculumResult.unitLabel}`);
    }
    store.updateStepStatus(taskId, "analyze-curriculum", "completed");

    // ─── Step 2: Plan Blueprint ─────────────────────────
    store.updateStepStatus(taskId, "plan-blueprint", "running");

    const slots = planQuestionSlots(config);
    const batches = slotsToBlueprintBatches(config, slots);

    const mcCount = slots.filter((s) => s.type === "MC").length;
    const frCount = slots.filter((s) => s.type === "FR").length;
    log(taskId, "plan-blueprint", `题型分配: ${mcCount} MC + ${frCount} FR`, "decision");

    const easyCount = slots.filter((s) => s.difficultyBand === "基础巩固").length;
    const medCount = slots.filter((s) => s.difficultyBand === "中等应用").length;
    const hardCount = slots.filter((s) => s.difficultyBand === "高阶分析").length;
    log(taskId, "plan-blueprint", `难度曲线: ${easyCount} 基础 / ${medCount} 中等 / ${hardCount} 高阶`, "decision");
    log(taskId, "plan-blueprint", `分 ${batches.length} 批生成，每批 ≤5 题`, "info");

    store.updateStepStatus(taskId, "plan-blueprint", "completed");

    // ─── Step 3: Generate Questions ─────────────────────
    store.updateStepStatus(taskId, "generate-questions", "running");

    const allOutputs: ApExercisePipelineOutput[] = [];
    let completedCount = 0;

    for (let i = 0; i < batches.length; i++) {
      const blueprint = batches[i];
      log(taskId, "generate-questions", `批次 ${i + 1}/${batches.length}: 生成 ${blueprint.count} 题 (${blueprint.exerciseType}) — ${blueprint.unit ?? ""}`, "info");

      const output = await runApExercisePipeline({
        model,
        teacherRequest: blueprint.teacherIntent,
        count: blueprint.count,
        exerciseType: blueprint.exerciseType,
        language: config.language,
        blueprintOverride: blueprint,
        curriculumContextOverride: curriculumResult.courseId ? {
          courseName: curriculumResult.courseName,
          unitName: curriculumResult.unitLabel,
          topicName: curriculumResult.topicName,
          contextText: "",
        } : null,
      });

      allOutputs.push(output);
      completedCount += output.metrics.passed;

      log(taskId, "generate-questions", `批次 ${i + 1} 完成: ${output.metrics.passed} 通过, ${output.metrics.rejected} 拒绝`);
      if (output.metrics.rejected > 0) {
        for (const rej of output.rejectedExercises) {
          log(taskId, "generate-questions", `拒绝: ${rej.reason}`, "warn");
        }
      }

      store.updateProgress(taskId, completedCount, config.questionCount);
    }

    store.updateStepStatus(taskId, "generate-questions", "completed");

    // ─── Step 4: Verify & Review ────────────────────────
    store.updateStepStatus(taskId, "verify-review", "running");

    // Merge all outputs into one
    const mergedOutput: ApExercisePipelineOutput = {
      ...allOutputs[0],
      passedExercises: allOutputs.flatMap((o) => o.passedExercises),
      passedResults: allOutputs.flatMap((o) => o.passedResults),
      rejectedExercises: allOutputs.flatMap((o) => o.rejectedExercises),
      metrics: {
        ...allOutputs[0].metrics,
        requested: allOutputs.reduce((s, o) => s + o.metrics.requested, 0),
        passed: allOutputs.reduce((s, o) => s + o.metrics.passed, 0),
        rejected: allOutputs.reduce((s, o) => s + o.metrics.rejected, 0),
        totalModelCalls: allOutputs.reduce((s, o) => s + o.metrics.totalModelCalls, 0),
        timings: {
          blueprintMs: allOutputs.reduce((s, o) => s + o.metrics.timings.blueprintMs, 0),
          curriculumMs: allOutputs.reduce((s, o) => s + o.metrics.timings.curriculumMs, 0),
          generationMs: allOutputs.reduce((s, o) => s + o.metrics.timings.generationMs, 0),
          teacherReviewMs: allOutputs.reduce((s, o) => s + o.metrics.timings.teacherReviewMs, 0),
          verificationMs: allOutputs.reduce((s, o) => s + o.metrics.timings.verificationMs, 0),
          repairMs: allOutputs.reduce((s, o) => s + o.metrics.timings.repairMs, 0),
          totalMs: allOutputs.reduce((s, o) => s + o.metrics.timings.totalMs, 0),
        },
      },
    };

    const repairedCount = mergedOutput.passedResults.filter((r) => r.repaired).length;
    log(taskId, "verify-review", `总计通过: ${mergedOutput.metrics.passed} 题`, "decision");
    log(taskId, "verify-review", `修复后通过: ${repairedCount} 题`);
    log(taskId, "verify-review", `拒绝: ${mergedOutput.metrics.rejected} 题`);

    store.updateStepStatus(taskId, "verify-review", "completed");

    // ─── Step 5: Assemble Exam ──────────────────────────
    store.updateStepStatus(taskId, "assemble-exam", "running");

    const result: ExamResult = assembleExamResult(config, mergedOutput);

    log(taskId, "assemble-exam", `试卷名称: ${result.examName}`);
    for (const section of result.sections) {
      log(taskId, "assemble-exam", `${section.title}: ${section.questions.length} 题, 共 ${section.totalPoints} 分`, "decision");
    }
    log(taskId, "assemble-exam", `平均质量: ${result.stats.averageQuality}/10`);

    store.updateStepStatus(taskId, "assemble-exam", "completed");

    // ─── Done ───────────────────────────────────────────
    store.completeTask(taskId, result);

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    store.failTask(taskId, message);
  }
}
```

- [ ] **Step 2: Write a smoke test**

The orchestrator calls external AI services, so we test structure, not execution. A full integration test would require mocking the pipeline.

```typescript
// tests/exam-agent/orchestrator.spec.ts
import { describe, it, expect, vi } from "vitest";

// Verify the module exports and types compile correctly
describe("orchestrator module", () => {
  it("exports runExamPipeline function", async () => {
    const mod = await import("@/lib/exam-agent/orchestrator");
    expect(typeof mod.runExamPipeline).toBe("function");
  });
});
```

- [ ] **Step 3: Run test**

Run: `npx vitest run tests/exam-agent/orchestrator.spec.ts`
Expected: 1 test PASS

- [ ] **Step 4: Commit**

```bash
git add lib/exam-agent/orchestrator.ts tests/exam-agent/orchestrator.spec.ts
git commit -m "feat(exam-agent): add 5-step pipeline orchestrator with SSE logging"
```

---

## Task 6: API Routes

**Files:**
- Create: `app/api/exam-agent/tasks/route.ts`
- Create: `app/api/exam-agent/tasks/[taskId]/route.ts`
- Create: `app/api/exam-agent/tasks/[taskId]/stream/route.ts`
- Create: `app/api/exam-agent/tasks/[taskId]/export/route.ts`

- [ ] **Step 1: Create POST/GET tasks route**

```typescript
// app/api/exam-agent/tasks/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherContext } from "@/lib/auth/teacher-context";
import { createTask, getTasksByTeacher } from "@/lib/exam-agent/store";
import { runExamPipeline } from "@/lib/exam-agent/orchestrator";
import type { ExamTaskConfig } from "@/lib/exam-agent/types";

const createTaskSchema = z.object({
  subject: z.string().min(1),
  subjectName: z.string().min(1),
  units: z.array(z.string().min(1)).min(1),
  unitNames: z.array(z.string().min(1)).min(1),
  questionCount: z.number().int().min(5).max(50),
  questionTypes: z.array(z.enum(["MC", "FR"])).min(1),
  difficultyPreference: z.enum(["easy", "balanced", "hard"]),
  language: z.enum(["中文", "英文"]),
  examName: z.string().optional(),
});

export async function POST(request: Request) {
  const { teacherId, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return NextResponse.json({ error: errorMessage }, { status: errorStatus ?? 401 });
  }

  let body: ExamTaskConfig;
  try {
    body = createTaskSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const task = createTask(teacherId, body);

  // Fire and forget — pipeline runs in background
  void runExamPipeline(task);

  return NextResponse.json({ taskId: task.id, status: task.status });
}

export async function GET() {
  const { teacherId, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return NextResponse.json({ error: errorMessage }, { status: errorStatus ?? 401 });
  }

  const tasks = getTasksByTeacher(teacherId);
  return NextResponse.json({ tasks });
}
```

- [ ] **Step 2: Create task detail + delete route**

```typescript
// app/api/exam-agent/tasks/[taskId]/route.ts
import { NextResponse } from "next/server";
import { getTeacherContext } from "@/lib/auth/teacher-context";
import { getTask, deleteTask } from "@/lib/exam-agent/store";

type Params = { params: Promise<{ taskId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { teacherId, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return NextResponse.json({ error: errorMessage }, { status: errorStatus ?? 401 });
  }

  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task || task.teacherId !== teacherId) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ task });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { teacherId, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return NextResponse.json({ error: errorMessage }, { status: errorStatus ?? 401 });
  }

  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task || task.teacherId !== teacherId) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  deleteTask(taskId);
  return NextResponse.json({ deleted: true });
}
```

- [ ] **Step 3: Create SSE stream route**

```typescript
// app/api/exam-agent/tasks/[taskId]/stream/route.ts
import { getTeacherContext } from "@/lib/auth/teacher-context";
import { getTask, subscribe } from "@/lib/exam-agent/store";
import type { ExamSseEvent } from "@/lib/exam-agent/types";

type Params = { params: Promise<{ taskId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { teacherId } = await getTeacherContext();
  if (!teacherId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task || task.teacherId !== teacherId) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send current state as initial event
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "init", task })}\n\n`));

      // If task is already done, close immediately
      if (task.status === "completed" || task.status === "failed") {
        controller.close();
        return;
      }

      // Subscribe to future events
      const unsubscribe = subscribe(taskId, (event: ExamSseEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          if (event.type === "completed" || event.type === "failed") {
            unsubscribe();
            controller.close();
          }
        } catch {
          unsubscribe();
        }
      });

      // Heartbeat every 15s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`));
        } catch {
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 15_000);

      // Cleanup on cancel
      _request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 4: Create PDF export route**

```typescript
// app/api/exam-agent/tasks/[taskId]/export/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherContext } from "@/lib/auth/teacher-context";
import { getTask } from "@/lib/exam-agent/store";
import { renderExamTypstPdf } from "@/lib/typst/render-exam";
import type { ExamData } from "@/lib/typst/render-exam";

type Params = { params: Promise<{ taskId: string }> };

const exportSchema = z.object({
  includeAnswerKey: z.boolean().default(true),
  includeRubric: z.boolean().default(true),
});

export async function POST(request: Request, { params }: Params) {
  const { teacherId, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return NextResponse.json({ error: errorMessage }, { status: errorStatus ?? 401 });
  }

  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task || task.teacherId !== teacherId) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status !== "completed" || !task.result) {
    return NextResponse.json({ error: "Task not completed yet" }, { status: 400 });
  }

  let body: z.infer<typeof exportSchema>;
  try {
    body = exportSchema.parse(await request.json());
  } catch {
    body = { includeAnswerKey: true, includeRubric: true };
  }

  const examData: ExamData = {
    title: task.result.examName,
    course: task.config.subjectName,
    subtitle: task.config.unitNames.join(", "),
    sections: task.result.sections.map((section) => ({
      title: section.title,
      directions: section.questionType === "MC"
        ? "Select the best answer for each question."
        : "Show all your work. Justify your answers.",
      questions: section.questions.map((q) => {
        if (q.exercise.type === "MC") {
          return {
            number: q.index,
            stem: q.exercise.questionText,
            options: (q.exercise.options ?? []).map((opt) => ({ label: opt.label, text: opt.text })),
            answer: q.exercise.correctAnswer,
            difficultyLabel: q.exercise.difficulty as string,
            meta: `${q.bloomLevel}`,
          };
        }
        return {
          number: q.index,
          stem: q.exercise.questionText,
          parts: [],
          solution: q.exercise.solutionSteps,
          difficultyLabel: q.exercise.difficulty as string,
          meta: `${q.bloomLevel}`,
        };
      }),
    })),
    includeAnswerKey: body.includeAnswerKey,
    includeRubric: body.includeRubric,
  };

  const pdfBytes = await renderExamTypstPdf(examData, {
    pageSize: "letter",
    templateVariant: "modern",
  });

  return new Response(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${task.result.examName.replace(/[^a-zA-Z0-9 ]/g, "")}.pdf"`,
    },
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add app/api/exam-agent/
git commit -m "feat(exam-agent): add API routes for task CRUD, SSE stream, and PDF export"
```

---

## Task 7: Sidebar Navigation Update

**Files:**
- Modify: `components/shells/IconSidebar.tsx`

- [ ] **Step 1: Add the exam-agent nav item**

In `components/shells/IconSidebar.tsx`, add `FileText` to the lucide-react import and add a new nav item to `MAIN_NAV` between Database and GraduationCap:

```typescript
// Add to imports:
import { ..., FileText, ... } from "lucide-react";

// Add to MAIN_NAV array, after the Database item:
  {
    icon: FileText,
    label: { zh: "出卷", en: "Exam Agent" },
    href: "/main/exam-agent",
    matchPrefix: "/main/exam-agent",
    testId: "sidebar-nav-exam-agent",
  },
```

- [ ] **Step 2: Verify sidebar renders**

Run: `npx next build` (or check dev server at `/main/exam-agent`)
Expected: No build errors, sidebar shows 5 nav items

- [ ] **Step 3: Commit**

```bash
git add components/shells/IconSidebar.tsx
git commit -m "feat(exam-agent): add exam agent to sidebar navigation"
```

---

## Task 8: Hooks — `use-exam-tasks.ts` + `use-exam-pipeline-stream.ts`

**Files:**
- Create: `hooks/use-exam-tasks.ts`
- Create: `hooks/use-exam-pipeline-stream.ts`

- [ ] **Step 1: Write the tasks hook**

```typescript
// hooks/use-exam-tasks.ts
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
      // Silently fail — tasks stay as-is
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createTask = useCallback(async (config: ExamTaskConfig) => {
    const res = await apiPost<{ taskId: string; status: string }>("/api/exam-agent/tasks", config);
    await refresh();
    return res;
  }, [refresh]);

  const deleteTaskFn = useCallback(async (taskId: string) => {
    await apiDelete(`/api/exam-agent/tasks/${taskId}`);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const updateTaskLocally = useCallback((taskId: string, updater: (task: ExamTask) => ExamTask) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? updater(t) : t)));
  }, []);

  return { tasks, loading, createTask, deleteTask: deleteTaskFn, refresh, updateTaskLocally };
}
```

- [ ] **Step 2: Write the SSE stream hook**

```typescript
// hooks/use-exam-pipeline-stream.ts
"use client";

import { useEffect, useRef, useCallback } from "react";
import type { ExamSseEvent, ExamTask, PipelineStepId, PipelineStepStatus, PipelineLogEntry, ExamResult } from "@/lib/exam-agent/types";

type StreamCallbacks = {
  onStepUpdate: (stepId: PipelineStepId, status: PipelineStepStatus) => void;
  onLog: (stepId: PipelineStepId, entry: PipelineLogEntry) => void;
  onProgress: (current: number, total: number) => void;
  onCompleted: (result: ExamResult) => void;
  onFailed: (error: string) => void;
};

export function useExamPipelineStream(
  taskId: string | null,
  taskStatus: ExamTask["status"] | undefined,
  callbacks: StreamCallbacks,
): void {
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    if (!taskId || taskStatus !== "running") return;

    const controller = new AbortController();
    let eventSource: EventSource | null = null;

    async function connect() {
      try {
        const response = await fetch(`/api/exam-agent/tasks/${taskId}/stream`, {
          signal: controller.signal,
        });

        if (!response.ok || !response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const match = line.match(/^data: (.+)$/m);
            if (!match) continue;

            try {
              const event = JSON.parse(match[1]) as ExamSseEvent | { type: "init"; task: ExamTask };

              switch (event.type) {
                case "step-update":
                  cbRef.current.onStepUpdate(event.stepId, event.status);
                  break;
                case "log":
                  cbRef.current.onLog(event.stepId, event.entry);
                  break;
                case "progress":
                  cbRef.current.onProgress(event.current, event.total);
                  break;
                case "completed":
                  cbRef.current.onCompleted(event.result);
                  break;
                case "failed":
                  cbRef.current.onFailed(event.error);
                  break;
              }
            } catch {}
          }
        }
      } catch {
        // Connection closed or aborted
      }
    }

    void connect();

    return () => {
      controller.abort();
    };
  }, [taskId, taskStatus]);
}
```

- [ ] **Step 3: Commit**

```bash
git add hooks/use-exam-tasks.ts hooks/use-exam-pipeline-stream.ts
git commit -m "feat(exam-agent): add hooks for task management and SSE pipeline stream"
```

---

## Task 9: Frontend Components — Config Form + Task List

**Files:**
- Create: `components/main/exam-agent/ConfigForm.tsx`
- Create: `components/main/exam-agent/TaskCard.tsx`
- Create: `components/main/exam-agent/TaskListPanel.tsx`

- [ ] **Step 1: Write ConfigForm**

```typescript
// components/main/exam-agent/ConfigForm.tsx
"use client";

import { useState } from "react";
import { Button, CheckboxGroup, Checkbox, Input, Select, SelectItem, Slider, ButtonGroup } from "@heroui/react";
import { Rocket } from "lucide-react";
import type { ExamTaskConfig, DifficultyPreference } from "@/lib/exam-agent/types";

// Placeholder course data — will be replaced by dynamic data from exercise-curriculum
const AP_COURSES = [
  { id: "ap-statistics", name: "AP Statistics" },
  { id: "ap-calculus-ab", name: "AP Calculus AB" },
  { id: "ap-calculus-bc", name: "AP Calculus BC" },
  { id: "ap-chemistry", name: "AP Chemistry" },
  { id: "ap-physics-1", name: "AP Physics 1" },
  { id: "ap-biology", name: "AP Biology" },
  { id: "ap-csa", name: "AP Computer Science A" },
  { id: "ap-microeconomics", name: "AP Microeconomics" },
  { id: "ap-macroeconomics", name: "AP Macroeconomics" },
  { id: "ap-apes", name: "AP Environmental Science" },
];

// Placeholder units — dynamically loaded per course
const UNITS_BY_COURSE: Record<string, Array<{ id: string; name: string }>> = {
  "ap-statistics": [
    { id: "unit-1", name: "Unit 1: Exploring One-Variable Data" },
    { id: "unit-2", name: "Unit 2: Exploring Two-Variable Data" },
    { id: "unit-3", name: "Unit 3: Collecting Data" },
    { id: "unit-4", name: "Unit 4: Probability, Random Variables" },
    { id: "unit-5", name: "Unit 5: Sampling Distributions" },
    { id: "unit-6", name: "Unit 6: Inference for Categorical Data" },
    { id: "unit-7", name: "Unit 7: Inference for Quantitative Data" },
    { id: "unit-8", name: "Unit 8: Inference for Categorical Data: Chi-Square" },
    { id: "unit-9", name: "Unit 9: Inference for Quantitative Data: Slopes" },
  ],
};

type ConfigFormProps = {
  onSubmit: (config: ExamTaskConfig) => void;
  loading?: boolean;
};

const DIFFICULTY_LABELS: Record<number, string> = {
  0: "基础为主",
  1: "均衡",
  2: "高阶为主",
};

const DIFFICULTY_VALUES: Record<number, DifficultyPreference> = {
  0: "easy",
  1: "balanced",
  2: "hard",
};

export default function ConfigForm({ onSubmit, loading }: ConfigFormProps) {
  const [subject, setSubject] = useState("");
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  const [questionCount, setQuestionCount] = useState(25);
  const [questionTypes, setQuestionTypes] = useState<string[]>(["MC", "FR"]);
  const [difficultySlider, setDifficultySlider] = useState(1);
  const [language, setLanguage] = useState<"中文" | "英文">("英文");
  const [examName, setExamName] = useState("");

  const course = AP_COURSES.find((c) => c.id === subject);
  const units = UNITS_BY_COURSE[subject] ?? [];

  const canSubmit = subject && selectedUnits.size > 0 && questionTypes.length > 0 && !loading;

  function handleSubmit() {
    if (!canSubmit || !course) return;

    const unitIds = [...selectedUnits];
    const unitNames = unitIds.map((id) => units.find((u) => u.id === id)?.name ?? id);

    onSubmit({
      subject: course.id,
      subjectName: course.name,
      units: unitIds,
      unitNames,
      questionCount,
      questionTypes: questionTypes as ("MC" | "FR")[],
      difficultyPreference: DIFFICULTY_VALUES[difficultySlider],
      language,
      examName: examName.trim() || undefined,
    });
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-divider px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-lg">
          📝
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">新建出卷任务</h2>
          <p className="text-xs text-default-500">配置考试参数，Agent 将自动完成出卷</p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-xl flex-1 space-y-6 overflow-y-auto px-8 py-6">
        {/* Subject */}
        <Select
          label="学科"
          placeholder="选择 AP 学科"
          selectedKeys={subject ? [subject] : []}
          onSelectionChange={(keys) => {
            const key = [...keys][0] as string;
            setSubject(key);
            setSelectedUnits(new Set());
          }}
          isRequired
        >
          {AP_COURSES.map((c) => (
            <SelectItem key={c.id}>{c.name}</SelectItem>
          ))}
        </Select>

        {/* Units */}
        <Select
          label="单元"
          placeholder="选择单元（可多选）"
          selectionMode="multiple"
          selectedKeys={selectedUnits}
          onSelectionChange={(keys) => setSelectedUnits(keys as Set<string>)}
          isRequired
          isDisabled={!subject}
        >
          {units.map((u) => (
            <SelectItem key={u.id}>{u.name}</SelectItem>
          ))}
        </Select>

        {/* Question count + types */}
        <div className="flex gap-4">
          <Input
            type="number"
            label="题数"
            min={5}
            max={50}
            value={String(questionCount)}
            onValueChange={(v) => setQuestionCount(Math.min(50, Math.max(5, Number(v) || 5)))}
            className="w-28"
            isRequired
          />
          <CheckboxGroup
            label="题型"
            orientation="horizontal"
            value={questionTypes}
            onValueChange={setQuestionTypes}
            isRequired
          >
            <Checkbox value="MC">MC 选择题</Checkbox>
            <Checkbox value="FR">FR 自由回答</Checkbox>
          </CheckboxGroup>
        </div>

        {/* Difficulty */}
        <Slider
          label="难度偏好"
          step={1}
          minValue={0}
          maxValue={2}
          value={difficultySlider}
          onChange={(v) => setDifficultySlider(v as number)}
          marks={[
            { value: 0, label: "基础为主" },
            { value: 1, label: "均衡" },
            { value: 2, label: "高阶为主" },
          ]}
        />

        {/* Exam name */}
        <Input
          label="试卷名称（可选）"
          placeholder="不填则 Agent 自动命名"
          value={examName}
          onValueChange={setExamName}
        />

        {/* Language */}
        <div>
          <p className="mb-2 text-sm text-default-600">语言</p>
          <ButtonGroup>
            <Button
              variant={language === "中文" ? "solid" : "flat"}
              color={language === "中文" ? "primary" : "default"}
              onPress={() => setLanguage("中文")}
            >
              中文
            </Button>
            <Button
              variant={language === "英文" ? "solid" : "flat"}
              color={language === "英文" ? "primary" : "default"}
              onPress={() => setLanguage("英文")}
            >
              英文
            </Button>
          </ButtonGroup>
        </div>

        {/* Submit */}
        <Button
          color="primary"
          size="lg"
          className="w-full"
          onPress={handleSubmit}
          isDisabled={!canSubmit}
          isLoading={loading}
          startContent={!loading ? <Rocket className="h-4 w-4" /> : undefined}
        >
          开始出卷
        </Button>
        <p className="text-center text-xs text-default-400">预计耗时 3-5 分钟</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write TaskCard**

```typescript
// components/main/exam-agent/TaskCard.tsx
"use client";

import { Card, CardBody, Chip, Progress } from "@heroui/react";
import { cn } from "@/lib/utils";
import type { ExamTask } from "@/lib/exam-agent/types";

const STATUS_CONFIG = {
  running: { label: "运行中", color: "secondary" as const },
  completed: { label: "已完成", color: "success" as const },
  paused: { label: "已暂停", color: "warning" as const },
  failed: { label: "失败", color: "danger" as const },
  configuring: { label: "配置中", color: "default" as const },
};

type TaskCardProps = {
  task: ExamTask;
  isActive: boolean;
  onSelect: (taskId: string) => void;
};

export default function TaskCard({ task, isActive, onSelect }: TaskCardProps) {
  const statusCfg = STATUS_CONFIG[task.status];
  const progressPct = task.progress.total > 0
    ? Math.round((task.progress.current / task.progress.total) * 100)
    : 0;

  const typeSummary = task.config.questionTypes.join("+");
  const summary = `${task.config.questionCount}题 · ${typeSummary}`;

  return (
    <Card
      isPressable
      onPress={() => onSelect(task.id)}
      className={cn(
        "mb-2 border transition-colors",
        isActive ? "border-primary bg-content2" : "border-divider bg-content1",
      )}
    >
      <CardBody className="gap-2 p-3">
        <div className="flex items-center justify-between">
          <span className="truncate text-sm font-medium text-foreground">
            {task.config.subjectName}
          </span>
          <Chip size="sm" color={statusCfg.color} variant="flat">
            {statusCfg.label}
          </Chip>
        </div>
        <p className="text-xs text-default-500">{summary}</p>
        {task.status === "running" && (
          <>
            <Progress
              size="sm"
              value={progressPct}
              color="secondary"
              className="mt-1"
            />
            <p className="text-[10px] text-default-400">
              {task.progress.current}/{task.progress.total} 题已生成
            </p>
          </>
        )}
        {task.status === "completed" && task.result && (
          <p className="text-[10px] text-default-400">
            质量 {task.result.stats.averageQuality}/10
          </p>
        )}
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 3: Write TaskListPanel**

```typescript
// components/main/exam-agent/TaskListPanel.tsx
"use client";

import { Button, ScrollShadow } from "@heroui/react";
import { Plus } from "lucide-react";
import TaskCard from "./TaskCard";
import type { ExamTask } from "@/lib/exam-agent/types";

type TaskListPanelProps = {
  tasks: ExamTask[];
  activeTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onNewTask: () => void;
  loading?: boolean;
};

export default function TaskListPanel({
  tasks,
  activeTaskId,
  onSelectTask,
  onNewTask,
  loading,
}: TaskListPanelProps) {
  return (
    <div className="flex w-[260px] shrink-0 flex-col border-r border-divider bg-content1">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-divider px-4 py-3">
        <span className="text-sm font-semibold text-foreground">出卷任务</span>
        <Button
          size="sm"
          color="primary"
          variant="flat"
          startContent={<Plus className="h-3.5 w-3.5" />}
          onPress={onNewTask}
        >
          新建
        </Button>
      </div>

      {/* Task list */}
      <ScrollShadow className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="py-8 text-center text-xs text-default-400">加载中...</p>
        ) : tasks.length === 0 ? (
          <p className="py-8 text-center text-xs text-default-400">
            还没有出卷任务，点击"新建"开始
          </p>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              isActive={task.id === activeTaskId}
              onSelect={onSelectTask}
            />
          ))
        )}
      </ScrollShadow>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/main/exam-agent/ConfigForm.tsx components/main/exam-agent/TaskCard.tsx components/main/exam-agent/TaskListPanel.tsx
git commit -m "feat(exam-agent): add config form, task card, and task list panel components"
```

---

## Task 10: Frontend Components — Pipeline + Preview

**Files:**
- Create: `components/main/exam-agent/PipelineStep.tsx`
- Create: `components/main/exam-agent/PipelineTimeline.tsx`
- Create: `components/main/exam-agent/ExamQuestionCard.tsx`
- Create: `components/main/exam-agent/ExamStatsBar.tsx`
- Create: `components/main/exam-agent/ExamPreview.tsx`

- [ ] **Step 1: Write PipelineStep**

```typescript
// components/main/exam-agent/PipelineStep.tsx
"use client";

import { Accordion, AccordionItem, Card, CardBody, Chip } from "@heroui/react";
import { Check, Circle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineStep as PipelineStepType } from "@/lib/exam-agent/types";

type PipelineStepProps = {
  step: PipelineStepType;
  isLast: boolean;
};

const STATUS_ICON = {
  pending: <Circle className="h-5 w-5 text-default-400" />,
  running: <Circle className="h-5 w-5 animate-pulse text-secondary" />,
  completed: <Check className="h-5 w-5 text-success" />,
  failed: <AlertTriangle className="h-5 w-5 text-danger" />,
};

const LOG_LEVEL_STYLES = {
  info: "text-default-500",
  warn: "text-warning",
  error: "text-danger",
  decision: "text-secondary",
};

export default function PipelineStepComponent({ step, isLast }: PipelineStepProps) {
  const isPending = step.status === "pending";

  return (
    <div className="flex gap-4">
      {/* Timeline connector */}
      <div className="flex w-8 shrink-0 flex-col items-center">
        <div className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border",
          step.status === "completed" ? "border-success bg-success/10" :
          step.status === "running" ? "border-secondary bg-secondary/10" :
          step.status === "failed" ? "border-danger bg-danger/10" :
          "border-default-300 bg-default-100",
        )}>
          {STATUS_ICON[step.status]}
        </div>
        {!isLast && (
          <div className="mt-1 w-0.5 flex-1 bg-divider" />
        )}
      </div>

      {/* Content */}
      <div className={cn("flex-1 pb-6", isPending && "opacity-50")}>
        <h4 className={cn(
          "text-sm font-medium",
          step.status === "running" ? "text-secondary" : "text-foreground",
        )}>
          {step.name}
        </h4>

        {step.logs.length > 0 && (
          <Card className="mt-2 bg-content2">
            <CardBody className="p-3">
              <div className="max-h-48 space-y-1 overflow-y-auto font-mono text-xs leading-relaxed">
                {step.logs.map((entry, i) => (
                  <div key={i} className={LOG_LEVEL_STYLES[entry.level]}>
                    {entry.level === "decision" ? "→ " : entry.level === "warn" ? "⚡ " : entry.level === "error" ? "✗ " : "✓ "}
                    {entry.message}
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write PipelineTimeline**

```typescript
// components/main/exam-agent/PipelineTimeline.tsx
"use client";

import { Button } from "@heroui/react";
import { X } from "lucide-react";
import PipelineStepComponent from "./PipelineStep";
import type { ExamTask } from "@/lib/exam-agent/types";

type PipelineTimelineProps = {
  task: ExamTask;
  onCancel: () => void;
};

export default function PipelineTimeline({ task, onCancel }: PipelineTimelineProps) {
  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-divider px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {task.config.examName ?? `${task.config.subjectName} ${task.config.unitNames.join(", ")}`}
          </h2>
          <p className="text-xs text-default-500">
            {task.config.questionCount}题 · {task.config.questionTypes.join("+")} · {task.config.difficultyPreference === "balanced" ? "均衡难度" : task.config.difficultyPreference === "easy" ? "基础为主" : "高阶为主"}
          </p>
        </div>
        <Button variant="flat" color="danger" size="sm" startContent={<X className="h-3.5 w-3.5" />} onPress={onCancel}>
          取消
        </Button>
      </div>

      {/* Pipeline */}
      <div className="flex-1 overflow-y-auto p-6">
        {task.pipelineSteps.map((step, i) => (
          <PipelineStepComponent
            key={step.id}
            step={step}
            isLast={i === task.pipelineSteps.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write ExamQuestionCard**

```typescript
// components/main/exam-agent/ExamQuestionCard.tsx
"use client";

import { Card, CardBody, Chip } from "@heroui/react";
import { cn } from "@/lib/utils";
import type { ExamQuestion } from "@/lib/exam-agent/types";

type ExamQuestionCardProps = {
  question: ExamQuestion;
  showAnswer?: boolean;
};

const VERIFICATION_CONFIG = {
  passed: { label: "验证通过", color: "success" as const },
  repaired: { label: "修复后通过", color: "warning" as const },
  warning: { label: "待确认", color: "default" as const },
};

export default function ExamQuestionCard({ question, showAnswer = false }: ExamQuestionCardProps) {
  const { exercise } = question;
  const vConfig = VERIFICATION_CONFIG[question.verificationStatus];

  return (
    <Card className="mb-3 bg-content2">
      <CardBody className="gap-3 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-default-200 px-2 py-0.5 text-xs font-semibold">
              {question.index}
            </span>
            <span className="text-xs text-default-500">
              {question.topicName && `${question.topicName} · `}
              {exercise.difficulty} · {question.bloomLevel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Chip size="sm" color={vConfig.color} variant="flat">
              {vConfig.label}
            </Chip>
            <span className="text-xs text-default-400">
              {question.qualityScore}/10
            </span>
          </div>
        </div>

        {/* Stem */}
        <p className="text-sm leading-relaxed text-foreground">
          {exercise.questionText}
        </p>

        {/* MC Options */}
        {exercise.type === "MC" && exercise.options && (
          <div className="grid grid-cols-2 gap-2">
            {exercise.options.map((opt) => (
              <div
                key={opt.label}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs",
                  showAnswer && opt.isCorrect
                    ? "border-success/50 bg-success/10 text-success"
                    : "border-divider bg-content1 text-foreground",
                )}
              >
                ({opt.label}) {opt.text}
                {showAnswer && opt.isCorrect && " ✓"}
              </div>
            ))}
          </div>
        )}

        {/* Answer / Solution (when showAnswer) */}
        {showAnswer && (
          <div className="mt-2 border-l-2 border-secondary pl-3">
            <p className="text-xs font-medium text-secondary">答案: {exercise.correctAnswer}</p>
            <p className="mt-1 text-xs text-default-500">{exercise.solutionSteps}</p>
            {exercise.commonMistakes.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-warning">常见错误:</p>
                <ul className="ml-4 list-disc text-xs text-default-400">
                  {exercise.commonMistakes.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 4: Write ExamStatsBar**

```typescript
// components/main/exam-agent/ExamStatsBar.tsx
"use client";

import { Chip, Tabs, Tab } from "@heroui/react";
import type { ExamResultStats } from "@/lib/exam-agent/types";

type ExamStatsBarProps = {
  stats: ExamResultStats;
  activeTab: "questions" | "answers";
  onTabChange: (tab: "questions" | "answers") => void;
};

export default function ExamStatsBar({ stats, activeTab, onTabChange }: ExamStatsBarProps) {
  return (
    <div className="flex items-center gap-4 border-b border-divider bg-content1 px-6 py-3">
      <StatItem color="success" label="通过" value={stats.passedCount} />
      <StatItem color="warning" label="修复后通过" value={stats.repairedCount} />
      <StatItem color="default" label="平均质量" value={`${stats.averageQuality}/10`} />
      <StatItem color="default" label="覆盖率" value={`${Math.round(stats.topicCoverage * 100)}%`} />

      <div className="ml-auto">
        <Tabs
          size="sm"
          selectedKey={activeTab}
          onSelectionChange={(key) => onTabChange(key as "questions" | "answers")}
        >
          <Tab key="questions" title="试题" />
          <Tab key="answers" title="答案解析" />
        </Tabs>
      </div>
    </div>
  );
}

function StatItem({ color, label, value }: { color: "success" | "warning" | "default"; label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-2 w-2 rounded-full ${color === "success" ? "bg-success" : color === "warning" ? "bg-warning" : "bg-default-400"}`} />
      <span className="text-xs text-default-500">
        {label}: <strong className="text-foreground">{value}</strong>
      </span>
    </div>
  );
}
```

- [ ] **Step 5: Write ExamPreview**

```typescript
// components/main/exam-agent/ExamPreview.tsx
"use client";

import { useState } from "react";
import { Button, Divider } from "@heroui/react";
import { FileText, Edit3, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import ExamStatsBar from "./ExamStatsBar";
import ExamQuestionCard from "./ExamQuestionCard";
import type { ExamTask } from "@/lib/exam-agent/types";

type ExamPreviewProps = {
  task: ExamTask;
  onShowPipeline: () => void;
};

export default function ExamPreview({ task, onShowPipeline }: ExamPreviewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"questions" | "answers">("questions");
  const [exporting, setExporting] = useState(false);

  const result = task.result;
  if (!result) return null;

  const timeStr = result.stats.totalTimeMs > 60_000
    ? `${Math.round(result.stats.totalTimeMs / 60_000)} 分 ${Math.round((result.stats.totalTimeMs % 60_000) / 1000)} 秒`
    : `${Math.round(result.stats.totalTimeMs / 1000)} 秒`;

  async function handleExport() {
    setExporting(true);
    try {
      const response = await fetch(`/api/exam-agent/tasks/${task.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeAnswerKey: true, includeRubric: true }),
      });
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${result.examName}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // TODO: toast error
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-divider px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{result.examName}</h2>
          <p className="text-xs text-default-500">
            {result.stats.totalQuestions}题 · 用时 {timeStr}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="flat" size="sm" startContent={<FileText className="h-3.5 w-3.5" />} onPress={onShowPipeline}>
            Pipeline 日志
          </Button>
          <Button variant="flat" size="sm" startContent={<Edit3 className="h-3.5 w-3.5" />} onPress={() => { /* TODO: jump to builder */ }}>
            去编辑器微调
          </Button>
          <Button color="primary" size="sm" startContent={<Download className="h-3.5 w-3.5" />} onPress={handleExport} isLoading={exporting}>
            导出 PDF
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <ExamStatsBar stats={result.stats} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Questions */}
      <div className="flex-1 overflow-y-auto p-6">
        {result.sections.map((section) => (
          <div key={section.title} className="mb-8">
            <div className="mb-4 flex items-center gap-3">
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <span className="text-xs text-default-400">
                {section.questions.length} 题 · 每题 {section.pointsPerQuestion} 分 · 共 {section.totalPoints} 分
              </span>
            </div>
            <Divider className="mb-4" />
            {section.questions.map((q) => (
              <ExamQuestionCard key={q.index} question={q} showAnswer={activeTab === "answers"} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add components/main/exam-agent/PipelineStep.tsx components/main/exam-agent/PipelineTimeline.tsx components/main/exam-agent/ExamQuestionCard.tsx components/main/exam-agent/ExamStatsBar.tsx components/main/exam-agent/ExamPreview.tsx
git commit -m "feat(exam-agent): add pipeline timeline, question card, stats bar, and preview components"
```

---

## Task 11: Main Page — `ExamAgentPage.tsx` + Route

**Files:**
- Create: `components/main/exam-agent/ExamAgentPage.tsx`
- Create: `app/main/(with-sidebar)/exam-agent/page.tsx`

- [ ] **Step 1: Write ExamAgentPage**

```typescript
// components/main/exam-agent/ExamAgentPage.tsx
"use client";

import { useState, useCallback } from "react";
import TaskListPanel from "./TaskListPanel";
import ConfigForm from "./ConfigForm";
import PipelineTimeline from "./PipelineTimeline";
import ExamPreview from "./ExamPreview";
import { useExamTasks } from "@/hooks/use-exam-tasks";
import { useExamPipelineStream } from "@/hooks/use-exam-pipeline-stream";
import type { ExamTask, ExamTaskConfig, PipelineStepId, PipelineStepStatus, PipelineLogEntry, ExamResult } from "@/lib/exam-agent/types";

type ViewMode = "config" | "pipeline" | "preview";

export default function ExamAgentPage() {
  const { tasks, loading, createTask, deleteTask, refresh, updateTaskLocally } = useExamTasks();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("config");
  const [creating, setCreating] = useState(false);

  const activeTask = tasks.find((t) => t.id === activeTaskId);

  // ─── SSE stream handlers ─────────────────────────────

  const handleStepUpdate = useCallback((stepId: PipelineStepId, status: PipelineStepStatus) => {
    if (!activeTaskId) return;
    updateTaskLocally(activeTaskId, (task) => ({
      ...task,
      pipelineSteps: task.pipelineSteps.map((s) =>
        s.id === stepId
          ? { ...s, status, ...(status === "running" ? { startedAt: Date.now() } : {}), ...(status === "completed" || status === "failed" ? { completedAt: Date.now() } : {}) }
          : s,
      ),
    }));
  }, [activeTaskId, updateTaskLocally]);

  const handleLog = useCallback((stepId: PipelineStepId, entry: PipelineLogEntry) => {
    if (!activeTaskId) return;
    updateTaskLocally(activeTaskId, (task) => ({
      ...task,
      pipelineSteps: task.pipelineSteps.map((s) =>
        s.id === stepId ? { ...s, logs: [...s.logs, entry] } : s,
      ),
    }));
  }, [activeTaskId, updateTaskLocally]);

  const handleProgress = useCallback((current: number, total: number) => {
    if (!activeTaskId) return;
    updateTaskLocally(activeTaskId, (task) => ({
      ...task,
      progress: { current, total },
    }));
  }, [activeTaskId, updateTaskLocally]);

  const handleCompleted = useCallback((result: ExamResult) => {
    if (!activeTaskId) return;
    updateTaskLocally(activeTaskId, (task) => ({
      ...task,
      status: "completed",
      result,
      completedAt: Date.now(),
    }));
    setViewMode("preview");
  }, [activeTaskId, updateTaskLocally]);

  const handleFailed = useCallback((error: string) => {
    if (!activeTaskId) return;
    updateTaskLocally(activeTaskId, (task) => ({
      ...task,
      status: "failed",
      error,
      completedAt: Date.now(),
    }));
  }, [activeTaskId, updateTaskLocally]);

  useExamPipelineStream(
    activeTaskId,
    activeTask?.status,
    {
      onStepUpdate: handleStepUpdate,
      onLog: handleLog,
      onProgress: handleProgress,
      onCompleted: handleCompleted,
      onFailed: handleFailed,
    },
  );

  // ─── Actions ──────────────────────────────────────────

  async function handleCreateTask(config: ExamTaskConfig) {
    setCreating(true);
    try {
      const { taskId } = await createTask(config);
      setActiveTaskId(taskId);
      setViewMode("pipeline");
    } catch {
      // TODO: toast error
    } finally {
      setCreating(false);
    }
  }

  function handleSelectTask(taskId: string) {
    setActiveTaskId(taskId);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.status === "completed") setViewMode("preview");
    else if (task.status === "running") setViewMode("pipeline");
    else setViewMode("config");
  }

  function handleNewTask() {
    setActiveTaskId(null);
    setViewMode("config");
  }

  async function handleCancel() {
    if (!activeTaskId) return;
    await deleteTask(activeTaskId);
    setActiveTaskId(null);
    setViewMode("config");
  }

  // ─── Render ───────────────────────────────────────────

  function renderMainPanel() {
    if (viewMode === "config" || !activeTask) {
      return <ConfigForm onSubmit={handleCreateTask} loading={creating} />;
    }

    if (viewMode === "pipeline") {
      return <PipelineTimeline task={activeTask} onCancel={handleCancel} />;
    }

    if (viewMode === "preview" && activeTask.result) {
      return (
        <ExamPreview
          task={activeTask}
          onShowPipeline={() => setViewMode("pipeline")}
        />
      );
    }

    return <ConfigForm onSubmit={handleCreateTask} loading={creating} />;
  }

  return (
    <div className="flex h-full">
      <TaskListPanel
        tasks={tasks}
        activeTaskId={activeTaskId}
        onSelectTask={handleSelectTask}
        onNewTask={handleNewTask}
        loading={loading}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        {renderMainPanel()}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the page route**

```typescript
// app/main/(with-sidebar)/exam-agent/page.tsx
import dynamic from "next/dynamic";

const ExamAgentPage = dynamic(
  () => import("@/components/main/exam-agent/ExamAgentPage"),
  { loading: () => <div className="flex h-full items-center justify-center text-sm text-default-400">加载中...</div> },
);

export default function ExamAgentRoute() {
  return <ExamAgentPage />;
}
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add components/main/exam-agent/ExamAgentPage.tsx app/main/\(with-sidebar\)/exam-agent/page.tsx
git commit -m "feat(exam-agent): add main page with master-detail layout and route entry"
```

---

## Task 12: Integration Smoke Test

**Files:**
- Create: `tests/exam-agent/integration.spec.ts`

- [ ] **Step 1: Write integration test for the full flow (store → orchestrator path)**

```typescript
// tests/exam-agent/integration.spec.ts
import { describe, it, expect } from "vitest";
import { createTask, getTask, subscribe } from "@/lib/exam-agent/store";
import { createInitialPipelineSteps } from "@/lib/exam-agent/types";
import type { ExamTaskConfig, ExamSseEvent } from "@/lib/exam-agent/types";

const config: ExamTaskConfig = {
  subject: "ap-statistics",
  subjectName: "AP Statistics",
  units: ["unit-4"],
  unitNames: ["Unit 4"],
  questionCount: 5,
  questionTypes: ["MC"],
  difficultyPreference: "balanced",
  language: "英文",
};

describe("exam-agent integration", () => {
  it("creates task and verifies initial state is correct", () => {
    const task = createTask("teacher-int", config);

    expect(task.status).toBe("running");
    expect(task.config).toEqual(config);
    expect(task.pipelineSteps).toHaveLength(5);
    expect(task.pipelineSteps.every((s) => s.status === "pending")).toBe(true);
    expect(task.progress).toEqual({ current: 0, total: 5 });

    const fetched = getTask(task.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(task.id);
  });

  it("SSE subscription receives events in order", () => {
    const task = createTask("teacher-int2", config);
    const events: ExamSseEvent[] = [];
    const unsub = subscribe(task.id, (e) => events.push(e));

    // Simulate orchestrator behavior
    const { updateStepStatus, appendLog, updateProgress } = require("@/lib/exam-agent/store");

    updateStepStatus(task.id, "analyze-curriculum", "running");
    appendLog(task.id, "analyze-curriculum", { timestamp: 1, level: "info", message: "test" });
    updateStepStatus(task.id, "analyze-curriculum", "completed");
    updateProgress(task.id, 2, 5);

    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({ type: "step-update", stepId: "analyze-curriculum", status: "running" });
    expect(events[1]).toMatchObject({ type: "log", stepId: "analyze-curriculum" });
    expect(events[2]).toMatchObject({ type: "step-update", stepId: "analyze-curriculum", status: "completed" });
    expect(events[3]).toMatchObject({ type: "progress", current: 2, total: 5 });

    unsub();
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run tests/exam-agent/`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/exam-agent/integration.spec.ts
git commit -m "test(exam-agent): add integration smoke tests for store + SSE flow"
```

---

## Task 13: Final Verification

- [ ] **Step 1: Run full build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 2: Run all exam-agent tests**

Run: `npx vitest run tests/exam-agent/`
Expected: All tests PASS

- [ ] **Step 3: Manual smoke test**

1. Start dev server: `npm run dev`
2. Open `http://localhost:3001/main/exam-agent`
3. Verify sidebar shows "出卷" nav item
4. Verify config form renders with HeroUI components
5. Verify left panel shows "还没有出卷任务"

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(exam-agent): complete exam agent v1 — config, pipeline, preview, PDF export"
```
