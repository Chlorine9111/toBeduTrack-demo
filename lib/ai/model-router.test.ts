import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

describe("Qwen provider routing", () => {
  it("normalizes legacy Qwen aliases to the current runtime model", async () => {
    const { normalizePrimaryModelId } = await import("@/lib/ai/provider-registry");

    expect(normalizePrimaryModelId("qwen-plus")).toBe("qwen-plus");
    expect(normalizePrimaryModelId("qwen3-plus")).toBe("qwen-plus");
    expect(normalizePrimaryModelId("qwen-3.6-plus")).toBe("qwen-plus");
    expect(normalizePrimaryModelId("QWEN_3_6_PLUS")).toBe("qwen-plus");
  });

  it("resolves qwen-plus through DashScope when configured", async () => {
    process.env.DASHSCOPE_API_KEY = "test-dashscope-key";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.MOONSHOT_API_KEY;

    const { resolveLanguageModel } = await import("@/lib/ai/provider-registry");
    const resolved = resolveLanguageModel("qwen-plus");

    expect(resolved.modelId).toBe("qwen-plus");
    expect(resolved.provider).toBe("qwen");
  });
});
