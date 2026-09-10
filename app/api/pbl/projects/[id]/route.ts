import { z } from "zod";
import { NextResponse } from "next/server";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import { removePblProjectContentLibraryItem, syncPblProjectContentLibraryItem } from "@/lib/content-library/sync";
import { getPblContext } from "@/lib/pbl/context";
import { deleteProjectPlan, getProjectPlan, updateProjectPlan } from "@/lib/pbl/store";

const updateSchema = z.object({
  status: z.enum(["draft", "confirmed", "archived"]).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  markdownContent: z.string().trim().min(1).optional(),
  drivingQuestion: z.string().trim().min(1).max(400).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contextResult = await getPblContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  const { id } = await params;
  const plan = await getProjectPlan(contextResult.value, id);
  if (!plan) {
    return jsonError("NOT_FOUND", "未找到项目", 404);
  }

  return NextResponse.json({ plan });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contextResult = await getPblContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  let rawBody: unknown;
  try {
    rawBody = await parseJsonBody<unknown>(request);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    return jsonError("INTERNAL_ERROR", "请求解析失败", 500);
  }

  try {
    const patch = updateSchema.parse(rawBody);
    const { id } = await params;
    const updated = await updateProjectPlan(contextResult.value, id, patch);
    if (!updated) {
      return jsonError("NOT_FOUND", "未找到项目", 404);
    }
    if (!contextResult.value.isMock && contextResult.value.supabase) {
      await syncPblProjectContentLibraryItem({
        supabase: contextResult.value.supabase,
        teacherId: contextResult.value.teacherId,
        plan: updated,
      });
    }
    return NextResponse.json({ plan: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "更新参数不合法", 400, error.flatten());
    }
    console.error("更新 PBL 项目失败", error);
    return jsonError("INTERNAL_ERROR", "更新项目失败", 500);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contextResult = await getPblContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  const { id } = await params;
  const deleted = await deleteProjectPlan(contextResult.value, id);
  if (!deleted) {
    return jsonError("NOT_FOUND", "未找到项目", 404);
  }
  if (!contextResult.value.isMock && contextResult.value.supabase) {
    await removePblProjectContentLibraryItem({
      supabase: contextResult.value.supabase,
      teacherId: contextResult.value.teacherId,
      planId: id,
    });
  }

  return NextResponse.json({ id, deleted: true });
}
