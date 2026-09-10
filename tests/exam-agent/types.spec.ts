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
