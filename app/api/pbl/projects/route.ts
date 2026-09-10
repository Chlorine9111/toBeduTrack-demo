import { z } from "zod";
import { NextResponse } from "next/server";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import { getPblContext } from "@/lib/pbl/context";
import { projectPlanSchema } from "@/lib/pbl/schemas/project-plan";
import { listProjectPlans, saveProjectPlan } from "@/lib/pbl/store";
import { syncPblProjectContentLibraryItem } from "@/lib/content-library/sync";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";

const statusSchema = z.enum(["active", "all", "draft", "confirmed", "archived"]);

export async function GET(request: Request) {
  const contextResult = await getPblContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  try {
    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
    const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
    const statusRaw = url.searchParams.get("status") ?? "active";
    const status = statusSchema.safeParse(statusRaw).success
      ? (statusRaw as z.infer<typeof statusSchema>)
      : "active";

    const result = await listProjectPlans(contextResult.value, {
      status,
      query: url.searchParams.get("q") ?? undefined,
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0,
    });

    return NextResponse.json({
      projects: result.items,
      total: result.total,
      limit,
      offset,
      hasMore: offset + limit < result.total,
    });
  } catch (error) {
    console.error("读取 PBL 项目列表失败", error);
    return jsonError("INTERNAL_ERROR", "读取 PBL 项目列表失败", 500);
  }
}

export async function POST(request: Request) {
  const contextResult = await getPblContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  let rawBody: unknown;
  try {
    rawBody = await parseJsonBody<unknown>(request);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
    }
    return jsonError("INTERNAL_ERROR", "请求解析失败", 500);
  }

  try {
    const plan = projectPlanSchema.parse(rawBody);
    const saved = await saveProjectPlan(contextResult.value, plan);

    scheduleReliableAfterTask({
      taskType: "pbl.project_sync",
      taskKey: saved.id,
      teacherId: contextResult.value.teacherId,
      payload: {
        projectId: saved.id,
      },
      run: async () => {
        if (!contextResult.value.isMock && contextResult.value.supabase) {
          await syncPblProjectContentLibraryItem({
            supabase: contextResult.value.supabase,
            teacherId: contextResult.value.teacherId,
            plan: saved,
          });
        }
      },
    });

    return NextResponse.json({ plan: saved }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "项目结构不合法", 400, error.flatten());
    }
    console.error("创建 PBL 项目失败", error);
    return jsonError("INTERNAL_ERROR", "创建 PBL 项目失败", 500);
  }
}
