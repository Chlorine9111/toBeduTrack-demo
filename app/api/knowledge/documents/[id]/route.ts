import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import {
  deleteKnowledgeDocument,
  getKnowledgeDocument,
  updateKnowledgeDocument,
} from "@/lib/assistant/store";
import { uuidSchema } from "@/lib/validation/api";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import type { Json } from "@/types/database";

const updateSchema = z
  .object({
    subject: z.string().trim().max(120).nullable().optional(),
    unit: z.string().trim().max(120).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    summary: z.string().trim().max(600).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), "至少更新一个字段");

export async function GET(
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
  if (!uuidSchema.safeParse(params.id).success) {
    return jsonError("VALIDATION_ERROR", "文档 ID 不合法", 400);
  }

  try {
    const document = await getKnowledgeDocument(supabase, teacherId, params.id);
    if (!document) {
      return jsonError("NOT_FOUND", "未找到文档", 404);
    }
    return NextResponse.json({ document });
  } catch (error) {
    console.error("获取文档详情失败", error);
    return jsonError("INTERNAL_ERROR", "获取文档详情失败", 500);
  }
}

export async function PATCH(
  request: Request,
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
  if (!uuidSchema.safeParse(params.id).success) {
    return jsonError("VALIDATION_ERROR", "文档 ID 不合法", 400);
  }

  try {
    const body = updateSchema.parse(await parseJsonBody(request));
    const updated = await updateKnowledgeDocument(supabase, teacherId, params.id, {
      subject: body.subject,
      unit: body.unit,
      tags: body.tags,
      summary: body.summary,
      metadata: body.metadata as Json | undefined,
    });

    if (!updated) {
      return jsonError("NOT_FOUND", "未找到文档", 404);
    }

    return NextResponse.json({ document: updated });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }
    console.error("更新文档失败", error);
    return jsonError("INTERNAL_ERROR", "更新文档失败", 500);
  }
}

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
  if (!uuidSchema.safeParse(params.id).success) {
    return jsonError("VALIDATION_ERROR", "文档 ID 不合法", 400);
  }

  try {
    const deleted = await deleteKnowledgeDocument(supabase, teacherId, params.id);
    if (!deleted) {
      return jsonError("NOT_FOUND", "未找到文档", 404);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除文档失败", error);
    return jsonError("INTERNAL_ERROR", "删除文档失败", 500);
  }
}
