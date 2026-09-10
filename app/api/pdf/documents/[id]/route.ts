/**
 * DELETE /api/pdf/documents/:id
 * 删除用户 PDF 生成记录及存储文件。
 */
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { uuidSchema } from "@/lib/validation/api";
import { deletePdfRecord } from "@/lib/pdf/pdf-storage";
import { getTeacherContext } from "@/lib/api/teacher-context";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  const params = await context.params;
  const idParse = uuidSchema.safeParse(params.id);
  if (!idParse.success) {
    return jsonError("VALIDATION_ERROR", "PDF 记录 ID 不合法", 400);
  }

  const { data: record, error } = await supabase
    .from("pdf_documents")
    .select("id,file_path")
    .eq("id", params.id)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (error) {
    return jsonError("INTERNAL_ERROR", "读取 PDF 记录失败", 500);
  }

  if (!record) {
    return jsonError("NOT_FOUND", "未找到 PDF 记录", 404);
  }

  try {
    await deletePdfRecord(supabase, record.id, record.file_path);
  } catch (err) {
    const errorCode = (err as Error & { code?: string }).code;
    if (errorCode === "STORAGE_DELETE_FAILED") {
      return jsonError("STORAGE_DELETE_FAILED", "PDF 删除失败", 500);
    }
    if (errorCode === "DB_WRITE_FAILED") {
      return jsonError("DB_WRITE_FAILED", "PDF 记录删除失败", 500);
    }
    return jsonError("INTERNAL_ERROR", "删除 PDF 失败", 500);
  }

  return NextResponse.json({ success: true });
}
