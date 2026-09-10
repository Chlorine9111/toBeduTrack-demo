import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRouteActorAnyRole = vi.fn();
const createServerSupabaseClient = vi.fn();

vi.mock("server-only", () => ({}));

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

vi.mock("@/lib/auth/require-role", () => ({
  requireRouteActorAnyRole,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("exercises teacher guard", () => {
  it("short-circuits save route when teacher role guard denies access", async () => {
    requireRouteActorAnyRole.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    });

    const { POST } = await import("@/app/api/exercises/save/route");
    const response = await POST(
      new Request("https://example.com/api/exercises/save", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );

    expect(requireRouteActorAnyRole).toHaveBeenCalledWith(
      ["subject_teacher", "admin"],
      { nextPath: "/main/agent" },
    );
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });

  it("short-circuits update route when teacher role guard denies access", async () => {
    requireRouteActorAnyRole.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    });

    const { PUT } = await import("@/app/api/exercises/[id]/route");
    const response = await PUT(
      new Request("https://example.com/api/exercises/ex-1", {
        method: "PUT",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "ex-1" }) },
    );

    expect(requireRouteActorAnyRole).toHaveBeenCalledWith(
      ["subject_teacher", "admin"],
      { nextPath: "/main/agent" },
    );
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });
});
