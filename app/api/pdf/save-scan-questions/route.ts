import { z } from "zod";
import { optionalNullableUuidLikeSchema } from "@/lib/api/id-schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import { jsonError } from "@/lib/api/response";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { saveScannedUploadsToLibrary } from "@/lib/pdf-scan/save-to-library";

const uploadSchema = z.object({
  uploadId: z.string().uuid(),
});

const requestSchema = z.object({
  uploads: z.array(uploadSchema).min(1).max(10),
  courseId: optionalNullableUuidLikeSchema,
  unitId: optionalNullableUuidLikeSchema,
  topicId: optionalNullableUuidLikeSchema,
  curriculumHint: z.string().trim().max(400).nullable().optional(),
  includeLowConfidence: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await parseJsonBody(request));

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const authBypass = isAuthBypassEnabled();

    if (!user && !authBypass) {
      return jsonError("UNAUTHORIZED", "请先登录", 401);
    }

    const ensured = await ensureTeacher({ supabase, user, authBypass });
    const result = await saveScannedUploadsToLibrary({
      supabase: ensured.supabase,
      teacherId: ensured.teacherId,
      uploadIds: body.uploads.map((item) => item.uploadId),
      courseId: body.courseId ?? null,
      unitId: body.unitId ?? null,
      topicId: body.topicId ?? null,
      curriculumHint: body.curriculumHint ?? null,
      includeLowConfidence: body.includeLowConfidence ?? false,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof EnsureTeacherError) {
      return jsonError("UNAUTHORIZED", error.message, error.status);
    }
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", error.message, 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "参数格式错误", 400);
    }
    const message = error instanceof Error ? error.message : "保存拆题结果失败";
    return jsonError("INTERNAL_ERROR", message, 500);
  }
}
