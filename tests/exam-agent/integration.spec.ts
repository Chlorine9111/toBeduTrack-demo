import { describe, it, expect } from "vitest";
import { createTask, getTask, subscribe, updateStepStatus, appendLog, updateProgress } from "@/lib/exam-agent/store";
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
