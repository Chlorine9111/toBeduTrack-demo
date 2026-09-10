import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import {
  createServerTimingRecorder,
  withServerTiming,
} from "@/lib/api/server-timing";
import { getGradingContextOrResponse, invalidIdResponse, uuidParamSchema } from "@/lib/grading/api";
import {
  deleteSubmission,
  getGradingSession,
  getSubmission,
  listSubmissionAnswers,
} from "@/lib/grading/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string; submissionId: string }> },
) {
  const serverTiming = createServerTimingRecorder();
  const { context: gradingContext, response } = await getGradingContextOrResponse();
  if (!gradingContext) return response;

  const params = await context.params;
  if (!uuidParamSchema.safeParse(params.sessionId).success) {
    return withServerTiming(invalidIdResponse("任务 ID"), serverTiming);
  }
  if (!uuidParamSchema.safeParse(params.submissionId).success) {
    return withServerTiming(invalidIdResponse("答卷 ID"), serverTiming);
  }

  try {
    const sessionLookupStartedAt = performance.now();
    const session = await getGradingSession(gradingContext, params.sessionId);
    serverTiming.measure("session_lookup", sessionLookupStartedAt);
    if (!session) {
      return withServerTiming(jsonError("NOT_FOUND", "未找到判卷任务", 404), serverTiming);
    }

    const submissionLookupStartedAt = performance.now();
    const submission = await getSubmission(
      gradingContext,
      params.sessionId,
      params.submissionId,
    );
    serverTiming.measure("submission_lookup", submissionLookupStartedAt);
    if (!submission) {
      return withServerTiming(jsonError("NOT_FOUND", "未找到学生答卷", 404), serverTiming);
    }

    const answersStartedAt = performance.now();
    const answers = await listSubmissionAnswers(gradingContext, params.submissionId);
    serverTiming.measure("answers_list", answersStartedAt);
    return withServerTiming(NextResponse.json({ submission, answers }), serverTiming);
  } catch (error) {
    console.error("读取答卷详情失败", error);
    return withServerTiming(
      jsonError("INTERNAL_ERROR", "读取答卷详情失败", 500),
      serverTiming,
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ sessionId: string; submissionId: string }> },
) {
  const serverTiming = createServerTimingRecorder();
  const { context: gradingContext, response } = await getGradingContextOrResponse();
  if (!gradingContext) return response;

  const params = await context.params;
  if (!uuidParamSchema.safeParse(params.sessionId).success) {
    return withServerTiming(invalidIdResponse("任务 ID"), serverTiming);
  }
  if (!uuidParamSchema.safeParse(params.submissionId).success) {
    return withServerTiming(invalidIdResponse("答卷 ID"), serverTiming);
  }

  try {
    const submissionLookupStartedAt = performance.now();
    const submission = await getSubmission(
      gradingContext,
      params.sessionId,
      params.submissionId,
    );
    serverTiming.measure("submission_lookup", submissionLookupStartedAt);
    if (!submission) {
      return withServerTiming(jsonError("NOT_FOUND", "未找到学生答卷", 404), serverTiming);
    }

    const deleteStartedAt = performance.now();
    const deleted = await deleteSubmission(
      gradingContext,
      params.sessionId,
      params.submissionId,
    );
    serverTiming.measure("submission_delete", deleteStartedAt);
    if (!deleted) {
      return withServerTiming(jsonError("NOT_FOUND", "未找到学生答卷", 404), serverTiming);
    }
    return withServerTiming(NextResponse.json({ success: true }), serverTiming);
  } catch (error) {
    console.error("删除答卷失败", error);
    return withServerTiming(
      jsonError("INTERNAL_ERROR", "删除答卷失败", 500),
      serverTiming,
    );
  }
}
