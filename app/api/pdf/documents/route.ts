/**
 * GET /api/pdf/documents
 * 查询用户 PDF 生成记录（分页）。
 */
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export async function GET(request: Request) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? undefined;
  if (type && !["exam", "rubric", "worksheet"].includes(type)) {
    return jsonError("VALIDATION_ERROR", "文档类型不合法", 400);
  }
  const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const rawPageSize = Number.parseInt(
    url.searchParams.get("pageSize") ?? `${DEFAULT_PAGE_SIZE}`,
    10,
  );

  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, rawPageSize))
    : DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("pdf_documents")
    .select("id,title,document_type,file_path,file_size,created_at", { count: "exact" })
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (type) {
    query = query.eq("document_type", type);
  }

  const { data, error, count } = await query;

  if (error || !data) {
    return jsonError("INTERNAL_ERROR", "查询 PDF 记录失败", 500);
  }

  const records = data.map((row) => ({
    id: row.id,
    title: row.title,
    documentType: row.document_type,
    createdAt: row.created_at,
    fileSize: row.file_size,
    downloadUrl: `/api/pdf/download/${row.id}`,
  }));

  return NextResponse.json({
    records,
    page,
    pageSize,
    total: count ?? records.length,
  });
}
