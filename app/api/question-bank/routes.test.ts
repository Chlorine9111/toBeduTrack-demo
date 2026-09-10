import { beforeEach, describe, expect, it, vi } from "vitest";

const getTeacherContext = vi.fn();
const requireRouteActorAnyRole = vi.fn();
const listQuestionBankQuestions = vi.fn();
const saveWorksheetProject = vi.fn();
const parseJsonBody = vi.fn();
const jsonError = vi.fn((code: string, message: string, status = 400, details?: unknown) => {
  return new Response(
    JSON.stringify({
      error: {
        code,
        message,
        details: details ?? null,
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

vi.mock("@/lib/api/teacher-context", () => ({
  getTeacherContext,
}));

vi.mock("@/lib/auth/require-role", () => ({
  requireRouteActorAnyRole,
}));

vi.mock("@/lib/question-bank/store", () => ({
  listQuestionBankQuestions,
}));

vi.mock("@/lib/question-bank/worksheet-project-store", () => ({
  saveWorksheetProject,
}));

vi.mock("@/lib/api/request", () => ({
  parseJsonBody,
  InvalidJsonBodyError: class InvalidJsonBodyError extends Error {},
}));

vi.mock("@/lib/api/response", () => ({
  jsonError,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  requireRouteActorAnyRole.mockResolvedValue({ actor: { roles: ["subject_teacher"] } });
});

describe("question-bank list route", () => {
  it("short-circuits on teacher role guard", async () => {
    requireRouteActorAnyRole.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    });

    const { GET } = await import("@/app/api/question-bank/route");
    const response = await GET(new Request("https://example.com/api/question-bank"));

    expect(requireRouteActorAnyRole).toHaveBeenCalledWith(
      ["subject_teacher", "admin"],
      { nextPath: "/main/agent" },
    );
    expect(getTeacherContext).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });

  it("passes teacher context into question-bank query after guard", async () => {
    getTeacherContext.mockResolvedValue({
      supabase: { marker: "supabase" },
      teacherId: "teacher-1",
      authBypass: false,
      errorMessage: null,
      errorStatus: null,
    });
    listQuestionBankQuestions.mockResolvedValue({
      items: [{ id: "q-1" }],
      total: 1,
    });

    const { GET } = await import("@/app/api/question-bank/route");
    const response = await GET(
      new Request("https://example.com/api/question-bank?limit=20&offset=0"),
    );

    expect(requireRouteActorAnyRole).toHaveBeenCalled();
    expect(listQuestionBankQuestions).toHaveBeenCalledWith(
      {
        teacherId: "teacher-1",
        supabase: { marker: "supabase" },
      },
      expect.objectContaining({
        limit: 20,
        offset: 0,
      }),
    );
    expect(response.status).toBe(200);
  });
});

describe("question-bank builder projects route", () => {
  it("short-circuits writes on teacher role guard", async () => {
    requireRouteActorAnyRole.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    });

    const { POST } = await import("@/app/api/question-bank/builder/projects/route");
    const response = await POST(
      new Request("https://example.com/api/question-bank/builder/projects", {
        method: "POST",
        body: JSON.stringify({ draft: {} }),
      }),
    );

    expect(requireRouteActorAnyRole).toHaveBeenCalledWith(
      ["subject_teacher", "admin"],
      { nextPath: "/main/agent" },
    );
    expect(getTeacherContext).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });

  it("saves worksheet project after guard and teacher context", async () => {
    getTeacherContext.mockResolvedValue({
      supabase: { marker: "supabase" },
      teacherId: "teacher-1",
      authBypass: false,
      errorMessage: null,
      errorStatus: null,
    });
    parseJsonBody.mockResolvedValue({
      projectId: null,
      draft: {
        title: "Draft",
        description: "",
        duration: 45,
        sections: [],
        questions: [],
      },
      pageCount: 2,
    });
    saveWorksheetProject.mockResolvedValue({
      id: "project-1",
      title: "Draft",
    });

    const { POST } = await import("@/app/api/question-bank/builder/projects/route");
    const response = await POST(
      new Request("https://example.com/api/question-bank/builder/projects", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );

    expect(requireRouteActorAnyRole).toHaveBeenCalled();
    expect(saveWorksheetProject).toHaveBeenCalledWith(
      {
        teacherId: "teacher-1",
        supabase: { marker: "supabase" },
      },
      expect.objectContaining({
        pageCount: 2,
      }),
    );
    expect(response.status).toBe(200);
  });
});
