/**
 * POST /api/content-library/save-artifact
 * 从 Agent Canvas 保存 artifact 到内容库。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { parseJsonBody, InvalidJsonBodyError } from "@/lib/api/request";
import { upsertSynchronizedContentLibraryItem } from "@/lib/content-library/store";
import { syncContentAssetReference } from "@/lib/content-assets/sync-reference";
import type {
  ContentLibraryType,
  ContentLibraryRenderer,
  ContentLibraryOriginEntity,
  ContentLibrarySnapshot,
} from "@/lib/content-library/types";
import { uuidSchema } from "@/lib/validation/api";

const ARTIFACT_KIND_MAP: Record<
  string,
  {
    contentType: ContentLibraryType;
    rendererType: ContentLibraryRenderer;
    originEntityType: ContentLibraryOriginEntity;
  }
> = {
  "lesson-plan": {
    contentType: "lesson_plan",
    rendererType: "lesson_plan_markdown",
    originEntityType: "assistant_message",
  },
  worksheet: {
    contentType: "other",
    rendererType: "markdown",
    originEntityType: "assistant_message",
  },
  exercises: {
    contentType: "question",
    rendererType: "markdown",
    originEntityType: "assistant_message",
  },
  pbl: {
    contentType: "pbl",
    rendererType: "markdown",
    originEntityType: "assistant_message",
  },
  rubric: {
    contentType: "rubric",
    rendererType: "markdown",
    originEntityType: "assistant_message",
  },
  research: {
    contentType: "other",
    rendererType: "markdown",
    originEntityType: "assistant_message",
  },
  notes: {
    contentType: "other",
    rendererType: "markdown",
    originEntityType: "assistant_message",
  },
};

const requestSchema = z.object({
  artifactKind: z.string().min(1),
  title: z.string().min(1).max(200),
  markdown: z.string().min(1).max(200_000),
  /** Skill HTML 文档的原始 HTML（<article data-doc-type="..."> 格式） */
  htmlContent: z.string().max(500_000).optional(),
  sourceMessageId: z.string().optional(),
  conversationId: z.string().optional(),
});

export async function POST(request: Request) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  let body: z.infer<typeof requestSchema>;
  try {
    const raw = await parseJsonBody(request);
    body = requestSchema.parse(raw);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError || error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "请求参数无效", 400);
    }
    throw error;
  }

  const mapping = ARTIFACT_KIND_MAP[body.artifactKind] ?? ARTIFACT_KIND_MAP.notes;
  const originKey = `canvas:${body.sourceMessageId ?? Date.now().toString(36)}`;
  const summaryText = body.markdown.slice(0, 300).replace(/\s+/g, " ").trim();
  const persistedSourceMessageId = uuidSchema.safeParse(body.sourceMessageId ?? "").success
    ? body.sourceMessageId
    : undefined;
  const persistedConversationId = uuidSchema.safeParse(body.conversationId ?? "").success
    ? body.conversationId
    : undefined;

  // 根据 artifact 内容选择 snapshot 类型和 rendererType：
  // 1. lesson_plan_markdown — 教案特殊结构
  // 2. html — Skill HTML 文档（保留完整 HTML 结构化渲染）
  // 3. markdown — 其余产物
  let snapshot: ContentLibrarySnapshot;
  let rendererType = mapping.rendererType;

  if (body.htmlContent) {
    snapshot = { kind: "html" as const, html: body.htmlContent };
    rendererType = "html";
  } else if (mapping.rendererType === "lesson_plan_markdown") {
    snapshot = {
      kind: "lesson_plan_markdown" as const,
      markdown: body.markdown,
      sources: [],
      warnings: [],
      qualityAudit: null,
      revisionRounds: 0,
    };
  } else {
    snapshot = { kind: "markdown" as const, markdown: body.markdown };
  }

  try {
    const contentLibraryItemId = await upsertSynchronizedContentLibraryItem(
      { teacherId, supabase },
      {
        contentType: mapping.contentType,
        rendererType,
        originEntityType: mapping.originEntityType,
        originKey,
        title: body.title,
        summaryText,
        sourceConversationId: persistedConversationId,
        sourceMessageId: persistedSourceMessageId,
        snapshot,
      },
    );

    if (contentLibraryItemId) {
      await syncContentAssetReference({
        supabase,
        teacherId,
        contentLibraryItemId,
        refEntityType: "content_library_item",
        refEntityId: contentLibraryItemId,
        title: body.title,
        rawText: body.markdown,
      });
    }

    return NextResponse.json({ ok: true, originKey });
  } catch (error) {
    console.error("保存到内容库失败", error);
    const message = error instanceof Error ? error.message : "未知错误";
    if (message === "CONTENT_LIBRARY_UNAVAILABLE") {
      return jsonError("SERVICE_UNAVAILABLE", "内容库服务暂不可用", 503);
    }
    return jsonError("INTERNAL_ERROR", "保存失败", 500);
  }
}
