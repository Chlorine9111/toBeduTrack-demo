import { NextResponse } from "next/server";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import { createServerTimingRecorder, withServerTiming } from "@/lib/api/server-timing";
import {
  createDocumentSchema,
  documentListQuerySchema,
  mapDocumentRouteError,
} from "@/lib/documents/api";
import { runDocumentSourceProjectionSyncTask } from "@/lib/documents/background-tasks";
import { normalizeDocumentHtml } from "@/lib/doc-engine/editor-html";
import { createDocument, listDocuments } from "@/lib/documents/store";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";

function readOptionalParam(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

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
    const query = documentListQuerySchema.parse({
      q: readOptionalParam(url.searchParams, "q"),
      kind: readOptionalParam(url.searchParams, "kind"),
      starred: readOptionalParam(url.searchParams, "starred"),
      page: readOptionalParam(url.searchParams, "page"),
      limit: readOptionalParam(url.searchParams, "limit"),
      sort: readOptionalParam(url.searchParams, "sort"),
      order: readOptionalParam(url.searchParams, "order"),
    });

    const listStartedAt = performance.now();
    const result = await listDocuments(
      {
        teacherId,
        supabase,
      },
      {
        query: query.q,
        kind: query.kind,
        starred: query.starred,
        page: query.page,
        limit: query.limit,
        sort: query.sort,
        order: query.order,
      },
    );
    serverTiming.measure("list", listStartedAt, "文档列表查询");
    serverTiming.measure("response_ready", routeStartedAt, "文档列表响应就绪");

    return withServerTiming(NextResponse.json({
      items: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
      hasMore: result.hasMore,
    }), serverTiming);
  } catch (error) {
    serverTiming.measure("response_ready", routeStartedAt, "文档列表失败");
    return withServerTiming(
      mapDocumentRouteError(error, "读取文档列表失败"),
      serverTiming,
    );
  }
}

async function parseOptionalCreateBody(request: Request) {
  const raw = await request.text();
  if (!raw.trim()) {
    return createDocumentSchema.parse({});
  }

  try {
    return createDocumentSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new InvalidJsonBodyError();
    }
    throw error;
  }
}

export async function POST(request: Request) {
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
    const body = await parseOptionalCreateBody(request);
    const normalizedBody = {
      ...body,
      htmlContent: body.htmlContent ? normalizeDocumentHtml(body.htmlContent) : body.htmlContent,
    };
    const createStartedAt = performance.now();
    const document = await createDocument(
      {
        teacherId,
        supabase,
      },
      normalizedBody,
    );
    serverTiming.measure("create", createStartedAt, "文档创建");

    if (document.sourceType !== "standalone") {
      scheduleReliableAfterTask({
        taskType: "document_source_projection_sync",
        taskKey: `${document.id}:${document.version}`,
        teacherId,
        payload: {
          documentId: document.id,
        },
        run: async () => {
          await runDocumentSourceProjectionSyncTask(
            {
              teacherId,
              supabase,
            },
            {
              documentId: document.id,
            },
          );
        },
      });
    }

    serverTiming.measure("response_ready", routeStartedAt, "文档创建响应就绪");
    return withServerTiming(NextResponse.json({ document }), serverTiming);
  } catch (error) {
    serverTiming.measure("response_ready", routeStartedAt, "文档创建失败");
    return withServerTiming(
      mapDocumentRouteError(error, "创建文档失败"),
      serverTiming,
    );
  }
}
