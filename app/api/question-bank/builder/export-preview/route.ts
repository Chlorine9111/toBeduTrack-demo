import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { ensurePdfSizeLimit } from "@/lib/pdf/pdf-service";
import { renderWorksheetTypstPdf } from "@/lib/typst/render-worksheet";

const optionSchema = z.object({
  label: z.string().trim().min(1).max(8),
  text: z.string().trim().min(1).max(4000),
  isCorrect: z.boolean().optional().default(false),
});

const exerciseSchema = z.object({
  type: z.enum(["MC", "FR", "fill_in"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  questionText: z.string().trim().max(20000).optional().default(""),
  options: z.array(optionSchema).max(8).optional(),
  correctAnswer: z.string().trim().max(4000).optional(),
  solutionSteps: z.string().trim().max(20000).optional(),
  totalPoints: z.coerce.number().min(0).max(100).optional(),
  isBlankBlock: z.boolean().optional(),
  blankContent: z.string().max(50000).optional(),
  blankHeight: z.number().optional(),
  drawingData: z.string().max(500000).optional(),
  stimulusImageUrl: z.string().max(10000).optional().nullable(),
  stimulusImageScale: z.number().min(0.1).max(2).optional(),
  sectionTitle: z.string().max(200).optional(),
});

const requestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  duration: z.coerce.number().int().min(0).max(300).optional().default(90),
  includeAnswerKey: z.boolean().optional().default(true),
  includeExplanations: z.boolean().optional().default(true),
  exercises: z.array(exerciseSchema).min(1).max(120),
});

function sanitizeFilename(value: string) {
  return (
    value
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .trim() || "worksheet-preview.pdf"
  );
}

export async function POST(request: Request) {
  const access = await requireRouteActorAnyRole(["subject_teacher", "admin"], { nextPath: "/main/agent" });
  if (access.response) {
    return access.response;
  }

  const { teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const body = requestSchema.parse(await parseJsonBody(request));

    const pdfBuffer = await renderWorksheetTypstPdf(
      {
        title: body.title,
        courseName: "",
        teacherName: "",
        date: body.duration > 0 ? `建议时长：${body.duration} 分钟` : null,
        exercises: body.exercises,
        includeAnswerKey: body.includeAnswerKey,
        includeExplanations: body.includeExplanations,
        rubrics: [],
      },
      {
        pageSize: "A4",
        templateVariant: "friendly",
      },
    );

    ensurePdfSizeLimit(pdfBuffer);

    const fileName = sanitizeFilename(`${body.title}.pdf`);
    const encodedFilename = encodeURIComponent(fileName).replace(
      /['()]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );

    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodedFilename}`,
      },
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "导出请求不是合法 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "导出参数不合法", 400, error.flatten());
    }

    console.error("[question-bank/builder/export-preview] failed", error);
    return jsonError("INTERNAL_ERROR", "导出 PDF 失败", 500);
  }
}
