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
