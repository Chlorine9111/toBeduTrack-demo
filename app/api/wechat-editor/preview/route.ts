import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { getLessonPlanContext } from "@/lib/lesson-plan/context";
import { jsonError } from "@/lib/api/response";
import { savePreviewRecord, cleanupPreviewRecords } from "@/lib/wechat-editor/preview-store";

const bodySchema = z.object({
  html: z.string().min(1).max(2_000_000),
});

export async function POST(request: Request) {
  const contextResult = await getLessonPlanContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  try {
    const body = bodySchema.parse(await request.json());
    cleanupPreviewRecords();

    const id = randomUUID();
    const record = savePreviewRecord({
      id,
      html: body.html,
      ttlHours: 24,
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;

    return NextResponse.json({
      previewId: id,
      previewUrl: `${baseUrl}/preview/${id}`,
      expiresAt: record.expiresAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    console.error("创建预览失败", error);
    return jsonError("INTERNAL_ERROR", "创建预览失败", 500);
  }
}
