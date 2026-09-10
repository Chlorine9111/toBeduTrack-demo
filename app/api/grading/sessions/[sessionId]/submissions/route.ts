import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import {
  createServerTimingRecorder,
  withServerTiming,
} from "@/lib/api/server-timing";
import { getGradingContextOrResponse, invalidIdResponse, uuidParamSchema } from "@/lib/grading/api";
import { createSubmission, getGradingSession, listSessionSubmissions } from "@/lib/grading/store";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { renderPdfPages } from "@/lib/pdf-scan/pdf-render";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/png", "image/jpeg", "application/pdf"]);

function sanitizeFileName(name: string) {
  const baseName = name.split(/[/\\]/).pop() || "submission";
  return baseName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

async function uploadFile(
  teacherId: string,
  sessionId: string,
  file: File,
): Promise<{ fileUrl: string | null; storagePath: string | null; pageCount: number }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = sanitizeFileName(file.name);
  const storagePath = `grading/${teacherId}/${sessionId}/${Date.now()}-${safeName}`;

  let pageCount = 1;
  if (file.type === "application/pdf") {
    const pages = await renderPdfPages(buffer, 1.4);
    pageCount = pages.length;
  }

  const admin = createAdminSupabaseClient();
  const { error: uploadError } = await admin.storage.from("pdfs").upload(storagePath, buffer, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    throw new Error(`上传答卷失败: ${uploadError.message}`);
  }

  const { data } = admin.storage.from("pdfs").getPublicUrl(storagePath);
  return {
    fileUrl: data.publicUrl ?? null,
    storagePath,
    pageCount,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const serverTiming = createServerTimingRecorder();
  const { context: gradingContext, response } = await getGradingContextOrResponse();
  if (!gradingContext) return response;

  const params = await context.params;
  if (!uuidParamSchema.safeParse(params.sessionId).success) {
    return withServerTiming(invalidIdResponse("任务 ID"), serverTiming);
  }

  try {
    const lookupStartedAt = performance.now();
    const session = await getGradingSession(gradingContext, params.sessionId);
    serverTiming.measure("session_lookup", lookupStartedAt);
    if (!session) {
      return withServerTiming(jsonError("NOT_FOUND", "未找到判卷任务", 404), serverTiming);
    }

    const submissionsStartedAt = performance.now();
    const submissions = await listSessionSubmissions(gradingContext, params.sessionId);
    serverTiming.measure("submissions_list", submissionsStartedAt);
    return withServerTiming(NextResponse.json({ submissions }), serverTiming);
  } catch (error) {
    console.error("读取答卷列表失败", error);
    return withServerTiming(
      jsonError("INTERNAL_ERROR", "读取答卷列表失败", 500),
      serverTiming,
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const serverTiming = createServerTimingRecorder();
  const { context: gradingContext, response } = await getGradingContextOrResponse();
  if (!gradingContext) return response;

  const params = await context.params;
  if (!uuidParamSchema.safeParse(params.sessionId).success) {
    return withServerTiming(invalidIdResponse("任务 ID"), serverTiming);
  }

  try {
    const lookupStartedAt = performance.now();
    const session = await getGradingSession(gradingContext, params.sessionId);
    serverTiming.measure("session_lookup", lookupStartedAt);
    if (!session) {
      return withServerTiming(jsonError("NOT_FOUND", "未找到判卷任务", 404), serverTiming);
    }

    const formParseStartedAt = performance.now();
    const formData = await request.formData();
    serverTiming.measure("form_parse", formParseStartedAt);
    const file = formData.get("file");
    const studentName = `${formData.get("studentName") ?? ""}`.trim();

    if (!(file instanceof File)) {
      return withServerTiming(jsonError("VALIDATION_ERROR", "缺少答卷文件", 400), serverTiming);
    }
    if (!SUPPORTED_TYPES.has(file.type)) {
      return withServerTiming(
        jsonError("VALIDATION_ERROR", "仅支持 PNG/JPG/PDF 文件", 400),
        serverTiming,
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return withServerTiming(
        jsonError("VALIDATION_ERROR", "文件不能超过 20MB", 400),
        serverTiming,
      );
    }

    let uploaded: { fileUrl: string | null; storagePath: string | null; pageCount: number } = {
      fileUrl: null,
      storagePath: null,
      pageCount: 1,
    };
    if (!gradingContext.isMock) {
      const uploadStartedAt = performance.now();
      uploaded = await uploadFile(gradingContext.teacherId, params.sessionId, file);
      serverTiming.measure("upload", uploadStartedAt);
    }

    const createStartedAt = performance.now();
    const submission = await createSubmission(gradingContext, {
        sessionId: params.sessionId,
        studentName,
        fileUrl: uploaded.fileUrl ?? undefined,
        storagePath: uploaded.storagePath ?? undefined,
        pageCount: uploaded.pageCount,
      });
    serverTiming.measure("submission_create", createStartedAt);

    return withServerTiming(NextResponse.json({ submission }, { status: 201 }), serverTiming);
  } catch (error) {
    console.error("上传学生答卷失败", error);
    return withServerTiming(
      jsonError("INTERNAL_ERROR", "上传学生答卷失败", 500),
      serverTiming,
    );
  }
}
