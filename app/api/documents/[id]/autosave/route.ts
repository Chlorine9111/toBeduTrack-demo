import { NextResponse } from "next/server";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import { createServerTimingRecorder, withServerTiming } from "@/lib/api/server-timing";
import {
  autosaveRequestSchema,
  documentParamsSchema,
  mapDocumentRouteError,
} from "@/lib/documents/api";
import { normalizeDocumentHtml } from "@/lib/doc-engine/editor-html";
import {
  autosaveDocument,
} from "@/lib/documents/store";
import { runDocumentSourceProjectionSyncTask } from "@/lib/documents/background-tasks";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";

async function handleAutosave(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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
    const params = documentParamsSchema.parse(await context.params);
    const body = autosaveRequestSchema.parse(await parseJsonBody(request));
    const normalizedBody = {
      ...body,
      htmlContent: normalizeDocumentHtml(body.htmlContent),
    };
    const autosaveStartedAt = performance.now();
    const result = await autosaveDocument(
      {
        teacherId,
        supabase,
      },
      params.id,
      normalizedBody,
    );
    serverTiming.measure("autosave", autosaveStartedAt, "文档自动保存");

    if (result.changed) {
      scheduleReliableAfterTask({
        taskType: "document_source_projection_sync",
        taskKey: `${params.id}:${result.version}`,
        teacherId,
        payload: {
          documentId: params.id,
        },
        run: async () => {
          await runDocumentSourceProjectionSyncTask(
            {
              teacherId,
              supabase,
            },
            {
              documentId: params.id,
            },
          );
        },
      });
    }

    serverTiming.measure("response_ready", routeStartedAt, "文档保存响应就绪");
    return withServerTiming(NextResponse.json({
      savedAt: result.savedAt,
      version: result.version,
    }), serverTiming);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      serverTiming.measure("response_ready", routeStartedAt, "请求体解析失败");
      return withServerTiming(
        mapDocumentRouteError(error, "自动保存文档失败"),
        serverTiming,
      );
    }
    serverTiming.measure("response_ready", routeStartedAt, "文档保存失败");
    return withServerTiming(
      mapDocumentRouteError(error, "自动保存文档失败"),
      serverTiming,
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleAutosave(request, context);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleAutosave(request, context);
}
