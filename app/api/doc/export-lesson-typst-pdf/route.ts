import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import { renderLessonPlanTypstPdf } from "@/lib/typst/render-lesson-plan";

export const maxDuration = 30;

const lessonPlanBlockSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "heading",
    "paragraph",
    "math",
    "image",
    "callout",
    "divider",
    "definition",
    "example",
    "steps",
    "quiz",
    "poll",
  ]),
  subtype: z.enum(["warning", "think", "misconception", "connection"]).optional(),
  sortOrder: z.number().int(),
  content: z.record(z.string(), z.unknown()),
  cedCodes: z.array(z.string()).default([]),
  teacherNote: z.string().nullable().optional(),
});

const lessonPlanSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().default(""),
  durationMinutes: z.number().int().nonnegative().default(0),
  sortOrder: z.number().int().default(0),
  blocks: z.array(lessonPlanBlockSchema).default([]),
});

const requestSchema = z.object({
  title: z.string().max(200).optional(),
  pageSize: z.enum(["A4", "Letter"]).default("A4"),
  mode: z.enum(["teacher", "student", "classroom"]).default("teacher"),
  templateVariant: z.enum(["standard", "compact"]).default("standard"),
  lessonPlan: z.object({
    title: z.string().min(1).max(200),
    courseName: z.string().nullable().optional(),
    unitName: z.string().nullable().optional(),
    totalMinutes: z.number().int().nonnegative().nullable().optional(),
    level: z.string().nullable().optional(),
    sections: z.array(lessonPlanSectionSchema).min(1),
  }),
});

export async function POST(request: Request) {
  const { teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const body = requestSchema.parse(await parseJsonBody<unknown>(request));
    const pdfBuffer = await renderLessonPlanTypstPdf(
      {
        ...body.lessonPlan,
        title: body.title?.trim() || body.lessonPlan.title,
        pageSize: body.pageSize,
        mode: body.mode,
      },
      {
        pageSize: body.pageSize,
        templateVariant: body.templateVariant,
        mode: body.mode,
      },
    );

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(
          (body.title?.trim() || body.lessonPlan.title || "lesson-plan").replace(/[/\\?%*:|\"<>]/g, "-"),
        )}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是合法 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }
    return jsonError(
      "PDF_RENDER_FAILED",
      error instanceof Error && error.message.trim() ? error.message : "Lesson PDF 导出失败",
      500,
    );
  }
}
