import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { createServerTimingRecorder, withServerTiming } from "@/lib/api/server-timing";
import { getTeacherIdentity } from "@/lib/api/teacher-context";
import { getContentAssetsBootstrap } from "@/lib/content-assets/bootstrap";

export async function GET() {
  const serverTiming = createServerTimingRecorder();
  const routeStartedAt = performance.now();
  const { teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherIdentity();

  if (!teacherId) {
    serverTiming.measure("response_ready", routeStartedAt, "鉴权失败");
    return withServerTiming(jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    ), serverTiming);
  }

  try {
    const bootstrapStartedAt = performance.now();
    const data = await getContentAssetsBootstrap(teacherId);
    serverTiming.measure("bootstrap", bootstrapStartedAt, "内容资产引导加载");
    serverTiming.measure("response_ready", routeStartedAt, "内容资产响应就绪");

    return withServerTiming(NextResponse.json(
      data,
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    ), serverTiming);
  } catch (error) {
    console.error("[content-assets/bootstrap] GET 失败", error);
    serverTiming.measure("response_ready", routeStartedAt, "内容资产读取失败");
    return withServerTiming(jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "读取内容资产失败",
      500,
    ), serverTiming);
  }
}
