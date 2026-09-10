import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import {
  createServerTimingRecorder,
  withServerTiming,
} from "@/lib/api/server-timing";
import { getGradingContextOrResponse } from "@/lib/grading/api";
import { createSessionSchema } from "@/lib/validation/grading";
import { createGradingSession, listGradingSessions } from "@/lib/grading/store";

export async function GET() {
  const serverTiming = createServerTimingRecorder();
  const { context, response } = await getGradingContextOrResponse();
  if (!context) return response;

  try {
    const listStartedAt = performance.now();
    const sessions = await listGradingSessions(context);
    serverTiming.measure("sessions_list", listStartedAt);
    return withServerTiming(NextResponse.json({ sessions }), serverTiming);
  } catch (error) {
    console.error("读取判卷任务失败", error);
    return withServerTiming(
      jsonError("INTERNAL_ERROR", "读取判卷任务失败", 500),
      serverTiming,
    );
  }
}

export async function POST(request: Request) {
  const serverTiming = createServerTimingRecorder();
  const { context, response } = await getGradingContextOrResponse();
  if (!context) return response;

  try {
    const bodyParseStartedAt = performance.now();
    const body = createSessionSchema.parse(
      await parseJsonBody<z.infer<typeof createSessionSchema>>(request),
    );
    serverTiming.measure("body_parse", bodyParseStartedAt);

    const createStartedAt = performance.now();
    const session = await createGradingSession(context, body);
    serverTiming.measure("session_create", createStartedAt);
    return withServerTiming(NextResponse.json({ session }, { status: 201 }), serverTiming);
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
    console.error("创建判卷任务失败", error);
    return withServerTiming(
      jsonError("INTERNAL_ERROR", "创建判卷任务失败", 500),
      serverTiming,
    );
  }
}
