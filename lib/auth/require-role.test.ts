import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/lib/auth/actor-context";

const getActorContext = vi.fn();
const redirect = vi.fn((location: string) => {
  throw new Error(`redirect:${location}`);
});

vi.mock("next/server", () => ({
  NextResponse: {
    json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: {
          "content-type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
    },
  },
}));

vi.mock("next/navigation", () => ({
  redirect,
}));

vi.mock("@/lib/auth/actor-context", () => ({
  getActorContext,
}));

function buildActor(overrides?: Partial<ActorContext>): ActorContext {
  return {
    userId: "user-1",
    user: null,
    isAuthenticated: true,
    authBypass: false,
    roles: ["subject_teacher"],
    defaultRole: "subject_teacher",
    activeRole: "subject_teacher",
    displayName: "Teacher One",
    email: "teacher@example.com",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("requireRouteActorAnyRole", () => {
  it("returns 401 with login path when actor is unauthenticated", async () => {
    getActorContext.mockResolvedValue(
      buildActor({
        userId: null,
        user: null,
        isAuthenticated: false,
        roles: [],
        defaultRole: null,
        activeRole: null,
        displayName: null,
        email: null,
      }),
    );

    const { requireRouteActorAnyRole } = await import("@/lib/auth/require-role");
    const result = await requireRouteActorAnyRole(["subject_teacher"], {
      nextPath: "/main/question-bank",
    });

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(401);
      expect(await result.response.json()).toEqual({
        error: "Unauthorized",
        login: "/auth/login?next=%2Fmain%2Fquestion-bank",
      });
    }
  });

  it("returns 403 when actor lacks required role", async () => {
    getActorContext.mockResolvedValue(buildActor({ roles: [], activeRole: null, defaultRole: null }));

    const { requireRouteActorAnyRole } = await import("@/lib/auth/require-role");
    const result = await requireRouteActorAnyRole(["subject_teacher", "admin"], {
      nextPath: "/main/agent",
    });

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toEqual({ error: "Forbidden" });
    }
  });

  it("returns actor when role matches", async () => {
    const actor = buildActor({ roles: ["admin", "subject_teacher"], activeRole: "admin" });
    getActorContext.mockResolvedValue(actor);

    const { requireRouteActorAnyRole } = await import("@/lib/auth/require-role");
    const result = await requireRouteActorAnyRole(["subject_teacher", "admin"], {
      nextPath: "/main/agent",
    });

    expect(result).toEqual({ actor });
  });
});

describe("requireActorAnyRole", () => {
  it("redirects unauthenticated actor to login", async () => {
    getActorContext.mockResolvedValue(
      buildActor({
        userId: null,
        user: null,
        isAuthenticated: false,
        roles: [],
        defaultRole: null,
        activeRole: null,
        displayName: null,
        email: null,
      }),
    );

    const { requireActorAnyRole } = await import("@/lib/auth/require-role");

    await expect(requireActorAnyRole(["subject_teacher"], "/main")).rejects.toThrow(
      "redirect:/auth/login?next=%2Fmain",
    );
  });

  it("redirects authenticated actor without access to main entry", async () => {
    getActorContext.mockResolvedValue(buildActor({ roles: [], activeRole: null, defaultRole: null }));

    const { requireActorAnyRole } = await import("@/lib/auth/require-role");

    await expect(requireActorAnyRole(["subject_teacher"], "/main/agent")).rejects.toThrow(
      "redirect:/main",
    );
  });
});
