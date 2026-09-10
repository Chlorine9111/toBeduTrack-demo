import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureTeacher, EnsureTeacherError } from "@/lib/teachers/ensure-teacher";
import { isAuthBypassEnabled } from "@/lib/auth/bypass";
import { jsonError } from "@/lib/api/response";

/**
 * GET /api/pdf/upload-queue
 * 返回最近 24 小时的 PDF 上传任务（用于页面恢复上传进度）
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const authBypass = isAuthBypassEnabled();

    if (!user && !authBypass) {
      return jsonError("UNAUTHORIZED", "请先登录", 401);
    }

    const ensured = await ensureTeacher({ supabase, user, authBypass });
    const teacherId = ensured.teacherId;
    const db = ensured.supabase;

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: uploads, error } = await db
      .from("pdf_scan_uploads")
      .select("id, file_name, status, question_count, created_at")
      .eq("teacher_id", teacherId)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return jsonError("INTERNAL_ERROR", "查询上传记录失败", 500);
    }

    return NextResponse.json({ items: uploads ?? [] });
  } catch (err) {
    if (err instanceof EnsureTeacherError) {
      return jsonError("UNAUTHORIZED", err.message, err.status);
    }
    return jsonError("INTERNAL_ERROR", "服务器错误", 500);
  }
}
