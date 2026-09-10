import { describe, it, expect } from "vitest";

describe("orchestrator module", () => {
  it("exports runExamPipeline function", async () => {
    const mod = await import("@/lib/exam-agent/orchestrator");
    expect(typeof mod.runExamPipeline).toBe("function");
  });
});
