import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import {
  createServerTimingRecorder,
  withServerTiming,
} from "@/lib/api/server-timing";
import { getGradingContextOrResponse, invalidIdResponse, uuidParamSchema } from "@/lib/grading/api";
import { updateSessionSchema } from "@/lib/validation/grading";
import {
  deleteGradingSession,
  getGradingSession,
  listSessionSubmissions,
  updateGradingSession,
} from "@/lib/grading/store";

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
    return withServerTiming(NextResponse.json({ session, submissions }), serverTiming);
  } catch (error) {
    console.error("读取判卷任务详情失败", error);
    return withServerTiming(
      jsonError("INTERNAL_ERROR", "读取判卷任务详情失败", 500),
      serverTiming,
    );
  }
}

export async function PATCH(
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
    const bodyParseStartedAt = performance.now();
    const body = updateSessionSchema.parse(
      await parseJsonBody<z.infer<typeof updateSessionSchema>>(request),
    );
    serverTiming.measure("body_parse", bodyParseStartedAt);

    const updateStartedAt = performance.now();
    const session = await updateGradingSession(gradingContext, params.sessionId, {
      title: body.title,
      courseId: body.courseId ?? undefined,
      unitId: body.unitId ?? undefined,
      topicId: body.topicId ?? undefined,
      status: body.status,
    });
    serverTiming.measure("session_update", updateStartedAt);

    if (!session) {
      return withServerTiming(jsonError("NOT_FOUND", "未找到判卷任务", 404), serverTiming);
    }

    return withServerTiming(NextResponse.json({ session }), serverTiming);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return withServerTiming(
        jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400),
        serverTiming,
      );
    }
    if (error instanceof z.ZodError) {
      return withServerTiming(
        jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten()),
        serverTiming,
      );
    }
    console.error("更新判卷任务失败", error);
    return withServerTiming(
      jsonError("INTERNAL_ERROR", "更新判卷任务失败", 500),
      serverTiming,
    );
  }
}

export async function DELETE(
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
    const deleteStartedAt = performance.now();
    const deleted = await deleteGradingSession(gradingContext, params.sessionId);
    serverTiming.measure("session_delete", deleteStartedAt);
    if (!deleted) {
      return withServerTiming(jsonError("NOT_FOUND", "未找到判卷任务", 404), serverTiming);
    }
    return withServerTiming(NextResponse.json({ success: true }), serverTiming);
  } catch (error) {
    console.error("删除判卷任务失败", error);
    return withServerTiming(
      jsonError("INTERNAL_ERROR", "删除判卷任务失败", 500),
      serverTiming,
    );
  }
}
