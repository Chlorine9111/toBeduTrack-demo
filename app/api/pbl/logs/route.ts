import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { getPblContext } from "@/lib/pbl/context";
import { listGenerationLogs } from "@/lib/pbl/store";

export async function GET(request: Request) {
  const contextResult = await getPblContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  try {
    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    const logs = await listGenerationLogs(contextResult.value, Number.isFinite(limit) ? limit : 50);
    return NextResponse.json({ logs, total: logs.length });
  } catch (error) {
    console.error("读取 PBL 日志失败", error);
    return jsonError("INTERNAL_ERROR", "读取日志失败", 500);
  }
}
