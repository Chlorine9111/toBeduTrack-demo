import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { createServerTimingRecorder, withServerTiming } from "@/lib/api/server-timing";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { listAssets } from "@/lib/content-assets/store";
import type { ProcessingStatus, AssetSource } from "@/lib/content-assets/types";

export async function GET(request: Request) {
  const serverTiming = createServerTimingRecorder();
  const routeStartedAt = performance.now();
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();

  if (!teacherId) {
    serverTiming.measure("response_ready", routeStartedAt, "鉴权失败");
    return withServerTiming(jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    ), serverTiming);
  }

  try {
    const url = new URL(request.url);
    const folderId = url.searchParams.get("folderId") || undefined;
    const status = (url.searchParams.get("status") || undefined) as
      | ProcessingStatus
      | undefined;
    const query = url.searchParams.get("query") || undefined;
    const assetSource = (url.searchParams.get("assetSource") || undefined) as
      | AssetSource
      | undefined;
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const listStartedAt = performance.now();
    const result = await listAssets(
      { teacherId, supabase },
      { folderId, status, query, assetSource, limit, offset },
    );
    serverTiming.measure("list", listStartedAt, "内容资产列表查询");
    serverTiming.measure("response_ready", routeStartedAt, "内容资产列表响应就绪");

    return withServerTiming(NextResponse.json(result), serverTiming);
  } catch (error) {
    console.error("[content-assets] 列表查询失败", error);
    serverTiming.measure("response_ready", routeStartedAt, "内容资产列表失败");
    return withServerTiming(jsonError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "查询失败",
      500,
    ), serverTiming);
  }
}
