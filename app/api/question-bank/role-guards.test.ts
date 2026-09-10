import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRouteActorAnyRole = vi.fn();
const listApQuestionBankQuestions = vi.fn();
const searchApQuestionBank = vi.fn();
const listApQuestionBankMaterials = vi.fn();
const getApQuestionBankMaterialDetail = vi.fn();
const createServerSupabaseClient = vi.fn();
const ensureTeacher = vi.fn();
const scanQuestionBankSplitSourceFile = vi.fn();
const commitQuestionBankSplitDocument = vi.fn();
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

vi.mock("@/lib/auth/require-role", () => ({
  requireRouteActorAnyRole,
}));

vi.mock("@/lib/question-bank/ap-question-bank", () => ({
  listApQuestionBankQuestions,
  searchApQuestionBank,
  listApQuestionBankMaterials,
  getApQuestionBankMaterialDetail,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));

vi.mock("@/lib/teachers/ensure-teacher", () => ({
  ensureTeacher,
  EnsureTeacherError: class EnsureTeacherError extends Error {
    status = 401;
  },
}));

vi.mock("@/lib/question-bank/split-service", () => ({
  scanQuestionBankSplitSourceFile,
  commitQuestionBankSplitDocument,
}));

vi.mock("@/lib/api/request", () => ({
  parseJsonBody,
  InvalidJsonBodyError: class InvalidJsonBodyError extends Error {},
}));

vi.mock("@/lib/auth/bypass", () => ({
  isAuthBypassEnabled: vi.fn(() => false),
}));

vi.mock("@/lib/api/response", () => ({
  jsonError,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  requireRouteActorAnyRole.mockResolvedValue({
    response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  });
});

describe("question-bank AP routes", () => {
  it("guards AP list", async () => {
    const { GET } = await import("@/app/api/question-bank/ap/list/route");
    const response = await GET(new Request("https://example.com/api/question-bank/ap/list"));

    expect(requireRouteActorAnyRole).toHaveBeenCalledWith(
      ["subject_teacher", "admin"],
      { nextPath: "/main/agent" },
    );
    expect(listApQuestionBankQuestions).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });

  it("guards AP search", async () => {
    const { POST } = await import("@/app/api/question-bank/ap/search/route");
    const response = await POST(
      new Request("https://example.com/api/question-bank/ap/search", {
        method: "POST",
        body: JSON.stringify({ query: "derivative" }),
      }),
    );

    expect(requireRouteActorAnyRole).toHaveBeenCalledWith(
      ["subject_teacher", "admin"],
      { nextPath: "/main/agent" },
    );
    expect(searchApQuestionBank).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });

  it("guards AP materials list and detail", async () => {
    const materialsRoute = await import("@/app/api/question-bank/ap/materials/route");
    const detailRoute = await import("@/app/api/question-bank/ap/materials/detail/route");

    const materialsResponse = await materialsRoute.GET(
      new Request("https://example.com/api/question-bank/ap/materials"),
    );
    const detailResponse = await detailRoute.GET(
      new Request(
        "https://example.com/api/question-bank/ap/materials/detail?course=ap-calculus-ab&sourceAssessment=progress-test",
      ),
    );

    expect(requireRouteActorAnyRole).toHaveBeenNthCalledWith(
      1,
      ["subject_teacher", "admin"],
      { nextPath: "/main/agent" },
    );
    expect(requireRouteActorAnyRole).toHaveBeenNthCalledWith(
      2,
      ["subject_teacher", "admin"],
      { nextPath: "/main/agent" },
    );
    expect(listApQuestionBankMaterials).not.toHaveBeenCalled();
    expect(getApQuestionBankMaterialDetail).not.toHaveBeenCalled();
    expect(materialsResponse.status).toBe(403);
    expect(detailResponse.status).toBe(403);
  });
});

describe("question-bank split routes", () => {
  it("guards split scan before touching supabase", async () => {
    const { POST } = await import("@/app/api/question-bank/split/scan/route");
    const formData = new FormData();
    formData.set("subject", "math");
    formData.set("file", new File(["content"], "questions.pdf", { type: "application/pdf" }));

    const response = await POST(
      new Request("https://example.com/api/question-bank/split/scan", {
        method: "POST",
        body: formData,
      }),
    );

    expect(requireRouteActorAnyRole).toHaveBeenCalledWith(
      ["subject_teacher", "admin"],
      { nextPath: "/main/agent" },
    );
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(ensureTeacher).not.toHaveBeenCalled();
    expect(scanQuestionBankSplitSourceFile).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });

  it("guards split commit before parsing or touching supabase", async () => {
    parseJsonBody.mockResolvedValue({
      uploadId: "5cb753f5-c212-4d97-a924-c6d3f0a1efaf",
      questions: [
        {
          id: "q-1",
          questionNumber: 1,
          exerciseType: "MC",
          questionText: "1+1=?",
          difficulty: "easy",
          confidence: 99,
          reviewTier: "ready",
          reviewReasons: [],
          isLowConfidence: false,
        },
      ],
    });

    const { POST } = await import("@/app/api/question-bank/split/commit/route");
    const response = await POST(
      new Request("https://example.com/api/question-bank/split/commit", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );

    expect(requireRouteActorAnyRole).toHaveBeenCalledWith(
      ["subject_teacher", "admin"],
      { nextPath: "/main/agent" },
    );
    expect(parseJsonBody).not.toHaveBeenCalled();
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(ensureTeacher).not.toHaveBeenCalled();
    expect(commitQuestionBankSplitDocument).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });
});
