import { NextResponse } from "next/server";
import { jsonErrorFromUnknown } from "@/lib/api/response";
import {
  createServerTimingRecorder,
  withServerTiming,
} from "@/lib/api/server-timing";
import { getGradingContextOrResponse, invalidIdResponse, uuidParamSchema } from "@/lib/grading/api";
import { getGradingJobForTeacher } from "@/lib/grading/jobs";
import { createNotFoundError } from "@/lib/runtime/app-error";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const serverTiming = createServerTimingRecorder();
  const { context: gradingContext, response } = await getGradingContextOrResponse();
  if (!gradingContext) return response;

  const params = await context.params;
  if (!uuidParamSchema.safeParse(params.jobId).success) {
    return withServerTiming(invalidIdResponse("任务 ID"), serverTiming);
  }

  try {
    const lookupStartedAt = performance.now();
    const job = await getGradingJobForTeacher({
      teacherId: gradingContext.teacherId,
      jobId: params.jobId,
    });
    serverTiming.measure("job_lookup", lookupStartedAt);

    if (!job) {
      return withServerTiming(
        jsonErrorFromUnknown(createNotFoundError("未找到后台任务")),
        serverTiming,
      );
    }

    return withServerTiming(NextResponse.json({ job }), serverTiming);
  } catch (error) {
    return withServerTiming(
      jsonErrorFromUnknown(error, "读取后台任务失败", 500),
      serverTiming,
    );
  }
}
