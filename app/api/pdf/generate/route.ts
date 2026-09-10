/**
 * POST /api/pdf/generate
 * 通用 PDF 生成入口（exam / rubric / worksheet / lesson_plan）。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { pdfGenerateRequestSchema } from "@/lib/validation/api";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/response";
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import {
  sanitizePdfFileName,
  type ExamTemplateVariant,
  type PdfExercise,
} from "@/lib/pdf/templates/exam-template";
import {
  countPdfPages,
  ensurePdfSizeLimit,
  type PdfPageSize,
} from "@/lib/pdf/pdf-service";
import { persistPdfDocument } from "@/lib/pdf/pdf-storage";
import { loadLessonPlanForPdf } from "@/lib/pdf/lesson-plan-loader";
import { getRubricDetail } from "@/lib/rubric/queries";
import {
  type WorksheetTemplateVariant,
} from "@/lib/pdf/templates/worksheet-template";
import { fromExerciseDifficulty, type ExerciseOption } from "@/types/exercise";
import type { Database } from "@/types/database";
import type { Json } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildExamDocumentFromRenderInput,
  buildLessonPlanDocumentFromPdfInput,
  buildRubricDocumentFromDetail,
  buildWorksheetDocumentFromRenderInput,
} from "@/lib/doc-engine/adapters";
import { buildDocumentExportSnapshotFromDocument } from "@/lib/doc-engine/export-snapshot";
import { renderDocumentPdf } from "@/lib/doc-engine/export-pdf";
import type { DocumentModel } from "@/lib/doc-engine/block-types";

type PdfGenerateBody = z.infer<typeof pdfGenerateRequestSchema>;
type WorksheetExerciseInput = NonNullable<PdfGenerateBody["exercises"]>[number] & {
  rubricId?: string | null;
};
type AppSupabaseClient = SupabaseClient<Database>;

async function renderVisibleDocumentPdf(params: {
  document: DocumentModel;
  title?: string | null;
  pageSize?: "A4" | "Letter";
  sourceKind: string;
}) {
  const snapshot = buildDocumentExportSnapshotFromDocument({
    document: params.document,
    title: params.title,
    pageSize: params.pageSize,
    sourceKind: params.sourceKind,
  });
  const pdfBuffer = await renderDocumentPdf({
    html: snapshot.html,
    title: snapshot.title,
    layoutConfig: snapshot.layoutConfig,
  });
  ensurePdfSizeLimit(pdfBuffer);

  return {
    snapshot,
    pdfBuffer,
    pageCount: countPdfPages(pdfBuffer),
  };
}

async function persistVisibleDocumentPdf(params: {
  supabase: AppSupabaseClient;
  teacherId: string;
  documentType: "exam" | "rubric" | "worksheet" | "lesson_plan";
  title: string;
  pdfBuffer: Uint8Array;
  snapshot: ReturnType<typeof buildDocumentExportSnapshotFromDocument>;
  config: Record<string, Json | undefined>;
  worksheetId?: string | null;
  rubricId?: string | null;
  lessonPlanId?: string | null;
}) {
  return persistPdfDocument(params.supabase, {
    teacherId: params.teacherId,
    documentType: params.documentType,
    title: params.title,
    buffer: params.pdfBuffer,
    config: {
      ...params.config,
      renderEngine: "html-chromium",
      sourceKind: params.snapshot.sourceKind,
      sourceId: params.snapshot.sourceId,
      snapshotHash: params.snapshot.snapshotHash,
      mathNodeCount: params.snapshot.mathNodeCount,
    },
    worksheetId: params.worksheetId ?? undefined,
    rubricId: params.rubricId ?? undefined,
    lessonPlanId: params.lessonPlanId ?? undefined,
  });
}

export async function POST(request: Request) {
  type RequestBody = PdfGenerateBody;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authBypass = isAuthBypassEnabled();

  if (!user && !authBypass) {
    return jsonError("UNAUTHORIZED", "未授权访问", 401);
  }

  let teacherId = "";
  let db = supabase;
  try {
    const ensured = await ensureTeacher({ supabase, user, authBypass });
    teacherId = ensured.teacherId;
    db = ensured.supabase;
  } catch (error) {
    if (error instanceof EnsureTeacherError) {
      return jsonError("UNAUTHORIZED", error.message, error.status);
    }
    throw error;
  }

  try {
    const body = pdfGenerateRequestSchema.parse(
      await parseJsonBody<RequestBody>(request),
    );
    const pageSize = body.pageSize ?? "Letter";

    if (body.documentType === "lesson_plan") {
      const lessonPlan = await loadLessonPlanForPdf(
        db,
        body.lessonPlanId!,
        teacherId,
      );

      if (!lessonPlan) {
        return jsonError("NOT_FOUND", "未找到教案", 404);
      }

      const title = lessonPlan.title || "教案";
      const lessonPlanDocument = buildLessonPlanDocumentFromPdfInput({
        id: body.lessonPlanId!,
        lessonPlan,
      });
      const { snapshot, pdfBuffer, pageCount } = await renderVisibleDocumentPdf({
        document: lessonPlanDocument,
        title,
        pageSize: body.pageSize ?? "A4",
        sourceKind: "lesson-plan-visible-export",
      });

      const record = await persistVisibleDocumentPdf({
        supabase: db,
        teacherId,
        documentType: "lesson_plan",
        title,
        pdfBuffer,
        snapshot,
        config: {
          pageSize: body.pageSize ?? "A4",
          mode: body.mode ?? "teacher",
          templateVariant: body.templateVariant ?? "lesson-plan-standard",
          sectionCount: lessonPlan.sections.length,
          pageCount,
        },
        lessonPlanId: body.lessonPlanId,
      });

      return NextResponse.json({
        recordId: record.recordId,
        downloadUrl: `/api/pdf/download/${record.recordId}`,
        filePath: record.filePath,
        fileSize: record.fileSize,
      });
    }

    if (body.documentType === "worksheet") {
      const worksheetPageSize = resolveWorksheetPageSize(body);
      const includeAnswerKey = body.includeAnswerKey ?? false;
      const includeExplanations =
        includeAnswerKey && body.includeExplanations ? body.includeExplanations : false;
      const includeRubric = body.includeRubric ?? false;
      const shouldSave = body.save ?? false;

      let worksheetId: string | null = null;
      let title = body.title ?? "练习题";
      let courseName = body.courseName ?? null;
      let unitName: string | null = null;
      let exercises: WorksheetExerciseInput[] = [];

      if (body.exercises && body.exercises.length > 0) {
        exercises = body.exercises as WorksheetExerciseInput[];
      } else {
        const worksheetData = await loadWorksheetForWorksheetPdf(
          db,
          body.worksheetId!,
          teacherId,
        );
        if (!worksheetData) {
          return jsonError("NOT_FOUND", "未找到试卷", 404);
        }
        worksheetId = worksheetData.id;
        title = body.title ?? worksheetData.title ?? title;
        courseName = body.courseName ?? worksheetData.courseName ?? courseName;
        unitName = null;
        exercises = worksheetData.exercises;
      }

      const worksheetDocument = buildWorksheetDocumentFromRenderInput({
        id: worksheetId ?? `worksheet-export-${Date.now()}`,
        title,
        courseName,
        unitName,
        sections: [],
        exercises: exercises.map((exercise, index) => ({
          id: `worksheet-export-exercise-${index + 1}`,
          exerciseType: exercise.type,
          difficulty: fromExerciseDifficulty(exercise.difficulty),
          questionText: exercise.questionText,
          options: exercise.options,
          correctAnswer: includeAnswerKey ? exercise.correctAnswer : undefined,
          solutionSteps:
            includeAnswerKey && includeExplanations
              ? exercise.solutionSteps
              : undefined,
        })),
      });
      const { snapshot, pdfBuffer, pageCount } = await renderVisibleDocumentPdf({
        document: worksheetDocument,
        title,
        pageSize: worksheetPageSize === "Letter" ? "Letter" : "A4",
        sourceKind: shouldSave
          ? "worksheet-visible-persisted-export"
          : "worksheet-visible-download",
      });

      const pdfBody = Buffer.from(pdfBuffer);
      const filename = `${sanitizePdfFileName(title)}.pdf`;

      if (shouldSave) {
        const record = await persistVisibleDocumentPdf({
          supabase: db,
          teacherId,
          documentType: "worksheet",
          title,
          pdfBuffer: pdfBody,
          snapshot,
          config: {
            paperSize: worksheetPageSize,
            margins: body.margins ?? "standard",
            includeAnswerKey,
            includeExplanations,
            includeRubric,
            exerciseCount: exercises.length,
            pageCount,
            templateVariant: resolveWorksheetTemplateVariant(body.templateVariant),
          },
          worksheetId: worksheetId ?? undefined,
        });

        return NextResponse.json({
          recordId: record.recordId,
          downloadUrl: `/api/pdf/download/${record.recordId}`,
          filePath: record.filePath,
          fileSize: record.fileSize,
        });
      }

      const asciiFilename = filename
        .replace(/[^\x20-\x7E]/g, "_")
        .replace(/["\\]/g, "_")
        .trim() || "download.pdf";
      const encodedFilename = encodeURIComponent(filename)
        .replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
      return new NextResponse(pdfBody, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
        },
      });
    }

    if (body.documentType === "rubric") {
      const rubricDetail = await getRubricDetail(body.rubricId!, db, { teacherId });
      if (!rubricDetail) {
        return jsonError("NOT_FOUND", "未找到评分标准", 404);
      }

      const rubricDocument = buildRubricDocumentFromDetail(rubricDetail);
      const { snapshot, pdfBuffer, pageCount } = await renderVisibleDocumentPdf({
        document: rubricDocument,
        title: rubricDetail.title,
        pageSize,
        sourceKind: "rubric-visible-export",
      });

      const record = await persistVisibleDocumentPdf({
        supabase: db,
        teacherId,
        documentType: "rubric",
        title: rubricDetail.title,
        pdfBuffer,
        snapshot,
        config: {
          pageSize,
          pageCount,
          templateVariant: resolveRubricTemplateVariant(body.templateVariant),
        },
        rubricId: rubricDetail.id,
      });

      return NextResponse.json({
        recordId: record.recordId,
        downloadUrl: `/api/pdf/download/${record.recordId}`,
        filePath: record.filePath,
        fileSize: record.fileSize,
      });
    }

    const worksheet = await loadWorksheetWithExercises(
      db,
      body.worksheetId!,
      teacherId,
    );
    if (!worksheet) {
      return jsonError("NOT_FOUND", "未找到试卷", 404);
    }

    const includeAnswerKey = body.includeAnswerKey ?? true;
    const examDocument = buildExamDocumentFromRenderInput({
      id: worksheet.id,
      title: worksheet.title,
      sections: [],
      exercises: worksheet.exercises.map((exercise, index) => ({
        id: `exam-export-exercise-${index + 1}`,
        exerciseType: exercise.type,
        difficulty: fromExerciseDifficulty(exercise.difficulty),
        questionText: exercise.questionText,
        options: exercise.options,
        correctAnswer: includeAnswerKey ? exercise.correctAnswer : undefined,
        solutionSteps: includeAnswerKey ? exercise.solutionSteps : undefined,
      })),
    });
    const { snapshot, pdfBuffer } = await renderVisibleDocumentPdf({
      document: examDocument,
      title: worksheet.title,
      pageSize,
      sourceKind: "exam-visible-export",
    });

    const record = await persistVisibleDocumentPdf({
      supabase: db,
      teacherId,
      documentType: "exam",
      title: worksheet.title,
      pdfBuffer,
      snapshot,
      config: {
        pageSize,
        includeAnswerKey,
        includeRubric: body.includeRubric ?? false,
        worksheetId: worksheet.id,
        exerciseCount: worksheet.exercises.length,
        templateVariant: resolveExamTemplateVariant(body.templateVariant),
      },
      worksheetId: worksheet.id,
    });

    return NextResponse.json({
      recordId: record.recordId,
      downloadUrl: `/api/pdf/download/${record.recordId}`,
      filePath: record.filePath,
      fileSize: record.fileSize,
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    const errorCode = (error as Error & { code?: string }).code;
    if (errorCode === "PDF_TOO_LARGE") {
      return jsonError("PDF_TOO_LARGE", "PDF 文件超过 20MB 限制", 413);
    }
    if (errorCode === "STORAGE_UPLOAD_FAILED") {
      return jsonError("STORAGE_UPLOAD_FAILED", "PDF 上传失败", 500);
    }
    if (errorCode === "DB_WRITE_FAILED") {
      return jsonError("DB_WRITE_FAILED", "PDF 记录写入失败", 500);
    }
    if (errorCode === "STORAGE_DELETE_FAILED") {
      return jsonError("STORAGE_DELETE_FAILED", "PDF 删除失败", 500);
    }
    if (errorCode === "RUBRIC_NOT_FOUND") {
      return jsonError("NOT_FOUND", "未找到评分标准", 404);
    }

    console.error("PDF 生成失败", error);
    return jsonError("PDF_RENDER_FAILED", "PDF 生成失败", 500);
  }
}

async function loadWorksheetWithExercises(
  supabase: AppSupabaseClient,
  worksheetId: string,
  teacherId: string,
): Promise<{ id: string; title: string; exercises: PdfExercise[] } | null> {
  const { data: worksheet, error } = await supabase
    .from("worksheets")
    .select("id,title")
    .eq("id", worksheetId)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (error || !worksheet) {
    return null;
  }

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from("worksheet_exercises")
    .select(
      "sort_order,exercise:exercises(id,teacher_id,exercise_type,difficulty,question_text,options,correct_answer,solution_steps,common_mistakes)",
    )
    .eq("worksheet_id", worksheetId)
    .order("sort_order", { ascending: true });

  if (exerciseError || !exerciseRows) {
    return null;
  }

  const exercises = exerciseRows
    .map((row) => {
      const exercise = Array.isArray(row.exercise)
        ? row.exercise[0]
        : row.exercise;
      if (!exercise) return null;
      if (exercise.teacher_id !== teacherId) return null;

      const options = Array.isArray(exercise.options)
        ? (exercise.options as ExerciseOption[])
        : undefined;

      const mapped: PdfExercise = {
        type: exercise.exercise_type as PdfExercise["type"],
        difficulty: exercise.difficulty as PdfExercise["difficulty"],
        questionText: exercise.question_text,
        correctAnswer: exercise.correct_answer,
        solutionSteps: exercise.solution_steps,
      };

      if (options) {
        mapped.options = options;
      }

      return mapped;
    })
    .filter((exercise): exercise is PdfExercise => Boolean(exercise));

  return {
    id: worksheet.id,
    title: worksheet.title,
    exercises,
  };
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

function resolveWorksheetPageSize(body: PdfGenerateBody): PdfPageSize {
  return (body.paperSize ?? body.pageSize ?? "A4") as PdfPageSize;
}

function resolveExamTemplateVariant(
  templateVariant?: PdfGenerateBody["templateVariant"],
): ExamTemplateVariant {
  if (templateVariant === "exam-modern") {
    return "modern";
  }
  return "classic";
}

function resolveRubricTemplateVariant(
  templateVariant?: PdfGenerateBody["templateVariant"],
): "table" | "cards" {
  if (templateVariant === "rubric-cards") {
    return "cards";
  }
  return "table";
}

function resolveWorksheetTemplateVariant(
  templateVariant?: PdfGenerateBody["templateVariant"],
): WorksheetTemplateVariant {
  if (templateVariant === "worksheet-friendly") {
    return "friendly";
  }
  return "academic";
}

async function loadWorksheetForWorksheetPdf(
  supabase: AppSupabaseClient,
  worksheetId: string,
  teacherId: string,
): Promise<{
  id: string;
  title: string;
  courseName?: string | null;
  teacherName?: string | null;
  exercises: WorksheetExerciseInput[];
} | null> {
  const { data: worksheet, error } = await supabase
    .from("worksheets")
    .select(
      "id,title,course:courses(name),teacher:teachers(display_name,full_name)",
    )
    .eq("id", worksheetId)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (error || !worksheet) {
    return null;
  }

  const course = pickFirst(worksheet.course);
  const teacher = pickFirst(worksheet.teacher);

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from("worksheet_exercises")
    .select(
      "sort_order,points,exercise:exercises(id,teacher_id,exercise_type,difficulty,question_text,options,correct_answer,solution_steps,rubric_id)",
    )
    .eq("worksheet_id", worksheetId)
    .order("sort_order", { ascending: true });

  if (exerciseError || !exerciseRows) {
    return null;
  }

  const exercises = exerciseRows
    .map((row) => {
      const exercise = Array.isArray(row.exercise)
        ? row.exercise[0]
        : row.exercise;
      if (!exercise) return null;
      if (exercise.teacher_id !== teacherId) return null;

      const options = Array.isArray(exercise.options)
        ? (exercise.options as ExerciseOption[])
        : undefined;

      const mapped: WorksheetExerciseInput = {
        type: exercise.exercise_type as WorksheetExerciseInput["type"],
        difficulty: (exercise.difficulty ?? 1) as WorksheetExerciseInput["difficulty"],
        questionText: exercise.question_text,
        correctAnswer: exercise.correct_answer ?? undefined,
        solutionSteps: exercise.solution_steps ?? undefined,
        totalPoints: row.points ?? undefined,
        rubricId: exercise.rubric_id ?? undefined,
      };

      if (options) {
        mapped.options = options;
      }

      return mapped;
    })
    .filter((exercise): exercise is WorksheetExerciseInput => Boolean(exercise));

  return {
    id: worksheet.id,
    title: worksheet.title,
    courseName: course?.name ?? null,
    teacherName: teacher?.display_name ?? teacher?.full_name ?? null,
    exercises,
  };
}
