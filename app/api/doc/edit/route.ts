import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/response";
import { editDocumentBlocks } from "@/lib/doc-engine/edit";
import { docEditRequestSchema } from "@/lib/doc-engine/request-schema";

export const maxDuration = 30;

export async function POST(request: Request) {
  const { teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const rawBody = await parseJsonBody<unknown>(request);
    const body = docEditRequestSchema.parse(rawBody);
    const edited = await editDocumentBlocks({
      documentId: body.documentId,
      documentType: body.documentContext.documentType,
      title: body.documentContext.title,
      selectedBlockIds: body.selectedBlockIds,
      selectedBlocks: body.selectedBlocks as Parameters<typeof editDocumentBlocks>[0]["selectedBlocks"],
      surroundingBlocks:
        body.documentContext.surroundingBlocks as
          | Parameters<typeof editDocumentBlocks>[0]["surroundingBlocks"]
          | undefined,
      instruction: body.instruction,
      totalBlockCount: body.documentContext.totalBlockCount,
      abortSignal: request.signal,
    });

    return NextResponse.json(edited);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是合法 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
    }

    return jsonErrorFromUnknown(error, "文档修改失败", 500);
  }
}
