import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getGradingContextOrResponse, invalidIdResponse, uuidParamSchema } from "@/lib/grading/api";
import { gradeSubmissionByAI } from "@/lib/grading/grader";
import { buildSessionStats } from "@/lib/grading/report-builder";
import {
  getGradingSession,
  getSubmission,
  listSessionSubmissions,
  listSubmissionAnswers,
  replaceSubmissionAnswers,
  setSessionStats,
  updateSubmission,
} from "@/lib/grading/store";

export async function POST(
  _request: Request,
  context: { params: Promise<{ sessionId: string; submissionId: string }> },
) {
  const { context: gradingContext, response } = await getGradingContextOrResponse();
  if (!gradingContext) return response;

  const params = await context.params;
  if (!uuidParamSchema.safeParse(params.sessionId).success) {
    return invalidIdResponse("任务 ID");
  }
  if (!uuidParamSchema.safeParse(params.submissionId).success) {
    return invalidIdResponse("答卷 ID");
  }

  try {
    const session = await getGradingSession(gradingContext, params.sessionId);
    if (!session) {
      return jsonError("NOT_FOUND", "未找到判卷任务", 404);
    }
    if (!session.answerKey.length) {
      return jsonError("VALIDATION_ERROR", "请先配置答案键", 400);
    }

    const submission = await getSubmission(gradingContext, params.sessionId, params.submissionId);
    if (!submission) {
      return jsonError("NOT_FOUND", "未找到学生答卷", 404);
    }
    if (!submission.ocrResult) {
      return jsonError("VALIDATION_ERROR", "请先完成 OCR 识别", 400);
    }

    await updateSubmission(gradingContext, params.sessionId, params.submissionId, {
      status: "grading",
    });

    const graded = await gradeSubmissionByAI(session.answerKey, submission.ocrResult);

    const savedAnswers = await replaceSubmissionAnswers(
      gradingContext,
      params.submissionId,
      graded.answers.map((item) => ({
        submissionId: params.submissionId,
        ...item,
      })),
    );

    const updatedSubmission = await updateSubmission(
      gradingContext,
      params.sessionId,
      params.submissionId,
      {
        status: "completed",
        totalScore: graded.totalScore,
        maxScore: graded.maxScore,
        gradedAt: new Date().toISOString(),
      },
    );

    if (!updatedSubmission) {
      return jsonError("NOT_FOUND", "未找到学生答卷", 404);
    }

    const submissions = await listSessionSubmissions(gradingContext, params.sessionId);
    const answersBySubmission = new Map<string, Awaited<ReturnType<typeof listSubmissionAnswers>>>();

    await Promise.all(
      submissions.map(async (item) => {
        const answers = await listSubmissionAnswers(gradingContext, item.id);
        answersBySubmission.set(item.id, answers);
      }),
    );

    const stats = buildSessionStats({
      submissions,
      answersBySubmission,
      answerKey: session.answerKey,
    });

    const sessionAfterStats = await setSessionStats(
      gradingContext,
      params.sessionId,
      stats,
      submissions.filter((item) => item.status === "completed").length,
    );

    return NextResponse.json({
      submission: updatedSubmission,
      answers: savedAnswers,
      session: sessionAfterStats,
      stats,
    });
  } catch (error) {
    console.error("AI 判卷失败", error);
    return jsonError("INTERNAL_ERROR", "AI 判卷失败", 500);
  }
}
