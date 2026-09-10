import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { buildPdfStoragePath, type PdfDocumentType } from "@/lib/pdf/pdf-service";

export interface PdfRecordResult {
  recordId: string;
  filePath: string;
  fileSize: number;
}

export interface PdfRecordInput {
  teacherId: string;
  documentType: PdfDocumentType;
  title: string;
  buffer: Uint8Array;
  config: Json;
  worksheetId?: string | null;
  rubricId?: string | null;
  lessonPlanId?: string | null;
}

export async function persistPdfDocument(
  supabase: SupabaseClient<Database>,
  input: PdfRecordInput,
): Promise<PdfRecordResult> {
  const filePath = buildPdfStoragePath(input.teacherId, input.documentType, input.title);
  const fileSize = input.buffer.byteLength;

  const { error: uploadError } = await supabase.storage
    .from("pdfs")
    .upload(filePath, input.buffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    const error = new Error("PDF 上传失败");
    (error as Error & { code?: string }).code = "STORAGE_UPLOAD_FAILED";
    (error as Error & { cause?: unknown }).cause = uploadError;
    throw error;
  }

  const insertPayload: Database["public"]["Tables"]["pdf_documents"]["Insert"] = {
    teacher_id: input.teacherId,
    document_type: input.documentType,
    title: input.title,
    file_path: filePath,
    file_size: fileSize,
    config: input.config,
    worksheet_id: input.worksheetId ?? null,
    rubric_id: input.rubricId ?? null,
  };
  if (input.lessonPlanId) {
    insertPayload.lesson_plan_id = input.lessonPlanId;
  }

  const { data: record, error: insertError } = await supabase
    .from("pdf_documents")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertError || !record) {
    await supabase.storage.from("pdfs").remove([filePath]);
    const error = new Error("PDF 记录写入失败");
    (error as Error & { code?: string }).code = "DB_WRITE_FAILED";
    (error as Error & { cause?: unknown }).cause = insertError;
    throw error;
  }

  if (input.worksheetId) {
    const { error: worksheetError } = await supabase
      .from("worksheets")
      .update({
        status: "published",
        pdf_url: `/api/pdf/download/${record.id}`,
        pdf_path: filePath,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq("id", input.worksheetId);

    if (worksheetError) {
      await rollbackPdfRecord(supabase, record.id, filePath);
      const error = new Error("更新试卷 PDF 信息失败");
      (error as Error & { code?: string }).code = "DB_WRITE_FAILED";
      (error as Error & { cause?: unknown }).cause = worksheetError;
      throw error;
    }
  }

  if (input.rubricId) {
    const { error: rubricError } = await supabase
      .from("rubrics")
      .update({
        pdf_path: filePath,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq("id", input.rubricId);

    if (rubricError) {
      await rollbackPdfRecord(supabase, record.id, filePath);
      const error = new Error("更新评分标准 PDF 信息失败");
      (error as Error & { code?: string }).code = "DB_WRITE_FAILED";
      (error as Error & { cause?: unknown }).cause = rubricError;
      throw error;
    }
  }

  if (input.lessonPlanId) {
    const { error: lessonPlanError } = await supabase
      .from("lesson_plans")
      .update({
        pdf_path: filePath,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq("id", input.lessonPlanId);

    if (lessonPlanError) {
      await rollbackPdfRecord(supabase, record.id, filePath);
      const error = new Error("更新教案 PDF 信息失败");
      (error as Error & { code?: string }).code = "DB_WRITE_FAILED";
      (error as Error & { cause?: unknown }).cause = lessonPlanError;
      throw error;
    }
  }

  return {
    recordId: record.id,
    filePath,
    fileSize,
  };
}

export async function rollbackPdfRecord(
  supabase: SupabaseClient<Database>,
  recordId: string,
  filePath: string,
) {
  await supabase.from("pdf_documents").delete().eq("id", recordId);
  await supabase.storage.from("pdfs").remove([filePath]);
}

export async function deletePdfRecord(
  supabase: SupabaseClient<Database>,
  recordId: string,
  filePath: string,
) {
  const { error: storageError } = await supabase.storage
    .from("pdfs")
    .remove([filePath]);
  if (storageError) {
    const error = new Error("删除 PDF 文件失败");
    (error as Error & { code?: string }).code = "STORAGE_DELETE_FAILED";
    (error as Error & { cause?: unknown }).cause = storageError;
    throw error;
  }

  const { error: deleteError } = await supabase
    .from("pdf_documents")
    .delete()
    .eq("id", recordId);

  if (deleteError) {
    const error = new Error("删除 PDF 记录失败");
    (error as Error & { code?: string }).code = "DB_WRITE_FAILED";
    (error as Error & { cause?: unknown }).cause = deleteError;
    throw error;
  }
}
