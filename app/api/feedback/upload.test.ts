import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRouteActorAnyRole = vi.fn();
const createServerSupabaseClient = vi.fn();
const jsonError = vi.fn((code: string, message: string, status = 400) => {
  return new Response(
    JSON.stringify({
      error: {
        code,
        message,
      },
    }),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );
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

vi.mock("@/lib/auth/require-role", () => ({
  requireRouteActorAnyRole,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));

vi.mock("@/lib/api/response", () => ({
  jsonError,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("feedback upload route teacher guard", () => {
  it("short-circuits upload when teacher role guard denies access", async () => {
    requireRouteActorAnyRole.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    });

    const { POST } = await import("@/app/api/feedback/upload/route");
    const form = new FormData();
    form.set("file", new File(["hello"], "demo.txt", { type: "text/plain" }));
    const response = await POST(
      new Request("https://example.com/api/feedback/upload", {
        method: "POST",
        body: form,
      }),
    );

    expect(requireRouteActorAnyRole).toHaveBeenCalledWith(
      ["subject_teacher", "admin"],
      { nextPath: "/main/feedback" },
    );
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });
});
