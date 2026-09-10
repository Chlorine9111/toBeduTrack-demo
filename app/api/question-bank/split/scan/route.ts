import { jsonError } from "@/lib/api/response";
import { requireRouteActorAnyRole } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import { scanQuestionBankSplitSourceFile } from "@/lib/question-bank/split-service";

export async function POST(request: Request) {
  try {
    const access = await requireRouteActorAnyRole(["subject_teacher", "admin"], {
      nextPath: "/main/agent",
    });
    if ("response" in access) {
      return access.response;
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const authBypass = isAuthBypassEnabled();

    if (!user && !authBypass) {
      return jsonError("UNAUTHORIZED", "请先登录", 401);
    }

    const ensured = await ensureTeacher({ supabase, user, authBypass });
    const formData = await request.formData();
    const file = formData.get("file");
    const subject = `${formData.get("subject") ?? ""}`.trim();

    if (!(file instanceof File)) {
      return jsonError("VALIDATION_ERROR", "缺少待拆题文件", 400);
    }

    const result = await scanQuestionBankSplitSourceFile({
      supabase: ensured.supabase,
      teacherId: ensured.teacherId,
      file,
      subject: subject || null,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof EnsureTeacherError) {
      return jsonError("UNAUTHORIZED", error.message, error.status);
    }
    const message = error instanceof Error ? error.message : "拆题失败";
    return jsonError("INTERNAL_ERROR", message, 500);
  }
}
