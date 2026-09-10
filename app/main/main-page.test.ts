import { beforeEach, describe, expect, it, vi } from "vitest";

const getActorContext = vi.fn();
const redirect = vi.fn((location: string) => {
  throw new Error(`redirect:${location}`);
});

vi.mock("next/navigation", () => ({
  redirect,
}));

vi.mock("@/lib/auth/actor-context", () => ({
  getActorContext,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("/main landing", () => {
  it("redirects unauthenticated users to login", async () => {
    getActorContext.mockResolvedValue({
      isAuthenticated: false,
      activeRole: null,
    });

    const page = await import("@/app/main/(with-sidebar)/page");

    await expect(page.default()).rejects.toThrow("redirect:/auth/login?next=/main");
  });

  it("redirects teacher users to agent workspace", async () => {
    getActorContext.mockResolvedValue({
      isAuthenticated: true,
      activeRole: "subject_teacher",
    });

    const page = await import("@/app/main/(with-sidebar)/page");

    await expect(page.default()).rejects.toThrow("redirect:/main/agent");
  });

  it("redirects admin users to agent workspace", async () => {
    getActorContext.mockResolvedValue({
      isAuthenticated: true,
      activeRole: "admin",
    });

    const page = await import("@/app/main/(with-sidebar)/page");
    await expect(page.default()).rejects.toThrow("redirect:/main/agent");
  });
});
