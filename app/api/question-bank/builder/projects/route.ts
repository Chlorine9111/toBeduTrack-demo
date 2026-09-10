import { z } from "zod";
import { NextResponse } from "next/server";
import type { WorksheetEditorDraft } from "@/components/main/question-bank/worksheet-editor/types";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { saveWorksheetProject } from "@/lib/question-bank/worksheet-project-store";

const questionTypeSchema = z.enum(["MC", "FR", "fill_in", "TF", "experiment", "proof", "drawing"]);

const optionSchema = z.object({
  label: z.string().trim().max(32),
  text: z.string().max(200_000),
  isCorrect: z.boolean().optional(),
});

const stimulusAssetSchema = z.object({
  bucket: z.string().trim().min(1).max(160),
  path: z.string().trim().min(1).max(1_000),
  mimeType: z.string().trim().max(120).nullable().optional(),
  fileName: z.string().trim().max(260).nullable().optional(),
  fileSizeBytes: z.number().int().min(0).max(10 * 1024 * 1024).nullable().optional(),
});

const sectionSchema = z.object({
  id: z.string().trim().min(1).max(160),
  title: z.string().max(400),
  order: z.number().int().min(0).max(10_000),
});

const questionSchema = z.object({
  id: z.string().trim().min(1).max(200),
  exerciseId: z.string().trim().min(1).max(200),
  sectionId: z.string().trim().min(1).max(160),
  order: z.number().int().min(0).max(10_000),
  points: z.number().min(0).max(2_000),
  questionText: z.string().max(300_000),
  options: z.array(optionSchema).nullable(),
  correctAnswer: z.string().max(200_000),
  solutionSteps: z.string().max(400_000),
  knowledgePoints: z.array(z.string().max(300)).max(100),
  difficulty: z.number().int().min(1).max(4),
  questionType: questionTypeSchema,
  tags: z.array(z.string().max(300)).max(100),
  stage: z.string().max(300).nullable().optional(),
  subject: z.string().max(300).nullable().optional(),
  gradeLevel: z.string().max(300).nullable().optional(),
  textbookVersion: z.string().max(300).nullable().optional(),
  sourceKind: z.string().max(300).nullable().optional(),
  isModified: z.boolean(),
  isAiGenerated: z.boolean(),
  showSolution: z.boolean(),
  createdAt: z.string().max(120).nullable().optional(),
  isBlankBlock: z.boolean().optional(),
  blankContent: z.string().max(300_000).optional(),
  blankHeight: z.number().min(0).max(4_000).optional(),
  drawingData: z.string().max(3_000_000).optional(),
  stimulusImageUrl: z.string().max(6_000_000).nullable().optional(),
  stimulusImageScale: z.number().min(0.1).max(4).optional(),
  stimulusImageAsset: stimulusAssetSchema.nullable().optional(),
});

const worksheetDraftSchema = z.object({
  title: z.string().max(5_000),
  description: z.string().max(50_000),
  duration: z.number().min(0).max(24 * 60),
  sections: z.array(sectionSchema).max(200),
  questions: z.array(questionSchema).max(1_000),
});

const bodySchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  draft: worksheetDraftSchema,
  pageCount: z.number().int().min(1).max(500).nullable().optional(),
});

function mapWorksheetProjectError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === "ITEM_NOT_FOUND") {
    return jsonError("NOT_FOUND", "组卷工程不存在", 404);
  }
  return null;
}

export async function POST(request: Request) {
  const access = await requireRouteActorAnyRole(["subject_teacher", "admin"], { nextPath: "/main/agent" });
  if (access.response) {
    return access.response;
  }

  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const body = bodySchema.parse(
      await parseJsonBody<z.infer<typeof bodySchema>>(request),
    );
    const payload = await saveWorksheetProject(
      {
        teacherId,
        supabase,
      },
      {
        projectId: body.projectId ?? null,
        draft: body.draft as WorksheetEditorDraft,
        pageCount: body.pageCount ?? null,
      },
    );

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "组卷工程数据不合法", 400, error.flatten());
    }
    const mapped = mapWorksheetProjectError(error);
    if (mapped) return mapped;
    console.error("保存组卷工程失败", error);
    return jsonError("INTERNAL_ERROR", "保存组卷工程失败", 500);
  }
}
