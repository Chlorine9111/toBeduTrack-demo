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
    expect(events[0]).toEqual({ type: "step-update", stepId: "analyze-curriculum", status: "running" });
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
      stats: {
        totalQuestions: 10,
        passedCount: 10,
        repairedCount: 0,
        averageQuality: 9,
        topicCoverage: 1,
        totalTimeMs: 5000,
      },
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
