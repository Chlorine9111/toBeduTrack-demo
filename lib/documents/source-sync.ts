import type { Json } from "@/types/database";
import type { ContentLibraryType } from "@/lib/content-library/types";
import { syncContentLibrarySemanticIndexItems } from "@/lib/content-library/semantic-index";
import { upsertSynchronizedContentLibraryItem } from "@/lib/content-library/store";
import { syncContentAssetReference } from "@/lib/content-assets/sync-reference";
import type { DocumentClient } from "@/lib/documents/store";
import type { EditorDocument } from "@/lib/documents/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ContentLibraryProjectionRow = {
  id: string;
  document_id?: string | null;
  metadata: Json | null;
  custom_title?: string | null;
  note?: string | null;
  course_label?: string | null;
  unit_label?: string | null;
};

type ContentLibraryQueryError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null;

let contentLibraryDocumentIdColumnSupported: boolean | null = null;

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeRecord(
  value: Json | Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function summarizeHtml(html: string) {
  const plainText = cleanText(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " "),
  );

  if (!plainText) return null;
  return plainText.length > 220 ? `${plainText.slice(0, 220)}...` : plainText;
}

function buildSearchText(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => cleanText(part))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function extractPlainTextFromHtml(html: string) {
  return cleanText(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, "\n")
      .replace(/<script[\s\S]*?<\/script>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|ul|ol|h[1-6]|blockquote|pre|table|tr)>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\n{3,}/g, "\n\n"),
  );
}

function buildArtifactLibraryMapping(kind: string) {
  switch (kind) {
    case "lesson-plan":
      return {
        contentType: "lesson_plan" as ContentLibraryType,
        rendererType: "lesson_plan_markdown" as const,
      };
    case "rubric":
      return {
        contentType: "rubric" as ContentLibraryType,
        rendererType: "markdown" as const,
      };
    case "exercises":
      return {
        contentType: "question" as ContentLibraryType,
        rendererType: "markdown" as const,
      };
    case "pbl":
      return {
        contentType: "pbl" as ContentLibraryType,
        rendererType: "markdown" as const,
      };
    default:
      return {
        contentType: "other" as ContentLibraryType,
        rendererType: "markdown" as const,
      };
  }
}

function normalizeMetadata(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isMissingContentLibraryDocumentIdColumnError(error: ContentLibraryQueryError) {
  if (!error) return false;
  const combined = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return (
    (error.code === "42703" && /document_id/i.test(combined)) ||
    (/document_id/i.test(combined) &&
      /(column|content_library_items|schema cache)/i.test(combined))
  );
}

async function readContentLibraryRowsBySourceMessageId(
  client: DocumentClient,
  sourceMessageId: string,
) {
  const { data, error } = await client.supabase
    .from("content_library_items")
    .select("id,metadata,custom_title,note,course_label,unit_label")
    .eq("teacher_id", client.teacherId)
    .eq("source_message_id", sourceMessageId);

  if (error) {
    throw new Error("读取内容库来源映射失败");
  }

  return (data ?? []) as ContentLibraryProjectionRow[];
}

async function updateContentLibraryProjectionRows(
  client: DocumentClient,
  rows: ContentLibraryProjectionRow[],
  document: EditorDocument,
) {
  if (rows.length === 0) return;

  await Promise.all(
    rows.map(async (row) => {
      const metadata = normalizeMetadata(row.metadata);
      const summaryText = summarizeHtml(document.htmlContent);
      const payload = {
        document_id: document.id,
        title: cleanText(document.title) || "未命名文档",
        summary_text: summaryText,
        search_text: buildSearchText([
          cleanText(document.title),
          cleanText(row.custom_title),
          cleanText(row.note),
          summaryText,
          cleanText(row.course_label),
          cleanText(row.unit_label),
          cleanText(document.metadata.artifactSummary),
        ]),
        metadata: {
          ...metadata,
          documentId: document.id,
          documentHtml: document.htmlContent,
          sourceDocumentVersion: document.version,
        } as Json,
      };
      const runUpdate = (
        nextPayload: typeof payload | Omit<typeof payload, "document_id">,
      ) =>
        client.supabase
          .from("content_library_items")
          .update(nextPayload)
          .eq("id", row.id)
          .eq("teacher_id", client.teacherId);

      let result;
      if (contentLibraryDocumentIdColumnSupported === false) {
        result = await runUpdate({
          title: payload.title,
          summary_text: payload.summary_text,
          search_text: payload.search_text,
          metadata: payload.metadata,
        });
      } else {
        result = await runUpdate(payload);
        if (result.error && isMissingContentLibraryDocumentIdColumnError(result.error)) {
          contentLibraryDocumentIdColumnSupported = false;
          result = await runUpdate({
            title: payload.title,
            summary_text: payload.summary_text,
            search_text: payload.search_text,
            metadata: payload.metadata,
          });
        } else if (!result.error) {
          contentLibraryDocumentIdColumnSupported = true;
        }
      }

      if (result.error) {
        console.error("[documents] 更新内容库文档投影失败", result.error);
        throw new Error("更新内容库文档投影失败");
      }
    }),
  );

  await syncContentLibrarySemanticIndexItems({
    supabase: client.supabase,
    teacherId: client.teacherId,
    itemIds: rows.map((row) => row.id),
  });
}

async function syncContentLibraryBackedDocument(
  client: DocumentClient,
  document: EditorDocument,
) {
  if (!isUuid(document.sourceId)) return;
  const sourceItemId = document.sourceId;

  const { data, error } = await client.supabase
    .from("content_library_items")
    .select("id,metadata")
    .eq("teacher_id", client.teacherId)
    .eq("id", sourceItemId)
    .maybeSingle();

  if (error) {
    console.error("[documents] 读取内容库文档来源失败", error);
    throw new Error("读取内容库文档来源失败");
  }

  if (!data) return;

  await updateContentLibraryProjectionRows(
    client,
    [data as ContentLibraryProjectionRow],
    document,
  );
}

async function syncArtifactBackedDocument(
  client: DocumentClient,
  document: EditorDocument,
) {
  if (!isUuid(document.sourceId)) return;
  const sourceMessageId = document.sourceId;

  const existingRows = await readContentLibraryRowsBySourceMessageId(
    client,
    sourceMessageId,
  );

  if (existingRows.length > 0) {
    await updateContentLibraryProjectionRows(client, existingRows, document);
    return;
  }

  const artifactKind =
    cleanText(document.metadata.artifactKind) ||
    cleanText(document.documentKind) ||
    "notes";
  const artifactRawContent =
    cleanText(document.metadata.artifactRawContent) ||
    extractPlainTextFromHtml(document.htmlContent);
  const conversationId = isUuid(cleanText(document.metadata.sourceConversationId))
    ? cleanText(document.metadata.sourceConversationId)
    : null;
  const mapping = buildArtifactLibraryMapping(artifactKind);

  const contentLibraryItemId = await upsertSynchronizedContentLibraryItem(
    {
      teacherId: client.teacherId,
      supabase: client.supabase,
    },
    {
      originKey: `assistant-message:${sourceMessageId}:${artifactKind}`,
      originEntityType: "assistant_message",
      originEntityId: sourceMessageId,
      sourceConversationId: conversationId,
      sourceMessageId,
      contentType: mapping.contentType,
      rendererType: mapping.rendererType,
      title: cleanText(document.title) || "未命名文档",
      summaryText: summarizeHtml(document.htmlContent),
      snapshot:
        mapping.rendererType === "lesson_plan_markdown"
          ? {
              kind: "lesson_plan_markdown",
              markdown: artifactRawContent,
              sources: [],
              warnings: [],
              qualityAudit: null,
              revisionRounds: 0,
            }
          : {
              kind: "markdown",
              markdown: artifactRawContent,
            },
      metadata: {
        documentId: document.id,
        documentHtml: document.htmlContent,
        sourceDocumentVersion: document.version,
        artifactKind,
      },
      extraSearchText: cleanText(document.metadata.artifactSummary),
    },
  );

  if (contentLibraryItemId) {
    await syncContentAssetReference({
      supabase: client.supabase,
      teacherId: client.teacherId,
      contentLibraryItemId,
      refEntityType: "content_library_item",
      refEntityId: contentLibraryItemId,
      title: cleanText(document.title) || "未命名文档",
      rawText: artifactRawContent,
    });
  }
}

export async function syncDocumentSourceProjection(
  client: DocumentClient,
  document: EditorDocument,
) {
  if (document.sourceType === "standalone") return;

  if (document.sourceType === "content_library") {
    await syncContentLibraryBackedDocument(client, document);
    return;
  }

  if (document.sourceType === "artifact") {
    await syncArtifactBackedDocument(client, document);
  }
}
