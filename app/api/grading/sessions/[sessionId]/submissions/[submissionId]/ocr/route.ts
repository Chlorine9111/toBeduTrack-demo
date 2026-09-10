import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getGradingContextOrResponse, invalidIdResponse, uuidParamSchema } from "@/lib/grading/api";
import { recognizeSubmissionByStoragePath } from "@/lib/grading/ocr";
import { getGradingSession, getSubmission, updateSubmission } from "@/lib/grading/store";

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

    const submission = await getSubmission(gradingContext, params.sessionId, params.submissionId);
    if (!submission) {
      return jsonError("NOT_FOUND", "未找到学生答卷", 404);
    }

    if (!submission.storagePath && !gradingContext.isMock) {
      return jsonError("VALIDATION_ERROR", "答卷未上传原始文件，无法 OCR", 400);
    }

    if (gradingContext.isMock) {
      const updated = await updateSubmission(gradingContext, params.sessionId, params.submissionId, {
        status: "ocr_done",
        ocrResult: {
          pages: [
            {
              pageNumber: 1,
              questions: session.answerKey.map((item) => ({
                questionNumber: item.questionNumber,
                studentAnswer: "",
                confidence: 0.6,
              })),
            },
          ],
        },
        pageCount: 1,
      });
      return NextResponse.json({ submission: updated, provider: "mock" });
    }

    const recognized = await recognizeSubmissionByStoragePath(submission.storagePath!, {
      answerKey: session.answerKey,
      sessionTitle: session.title,
    });
    const updated = await updateSubmission(gradingContext, params.sessionId, params.submissionId, {
      status: "ocr_done",
      ocrResult: recognized.ocrResult,
      pageCount: recognized.pageCount,
    });

    if (!updated) {
      return jsonError("NOT_FOUND", "未找到学生答卷", 404);
    }

    return NextResponse.json({
      submission: updated,
      provider: recognized.provider,
      pages: recognized.ocrResult.pages.length,
    });
  } catch (error) {
    console.error("答卷 OCR 失败", error);
    return jsonError("INTERNAL_ERROR", "答卷 OCR 失败", 500);
  }
}
