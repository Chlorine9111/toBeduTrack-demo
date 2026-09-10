import { revalidateContentAssets } from "@/lib/content-assets/bootstrap";
import {
  mergeReferenceAssetFromLibraryItem,
  mergeReferenceAssetSummaryFromLibraryItem,
} from "@/lib/content-assets/content-library-bridge";
import { createReferenceAsset } from "@/lib/content-assets/store";
import { toContentAssetSummaryFromAsset } from "@/lib/content-assets/summary";
import { createDocument, deleteDocument } from "@/lib/documents/store";
import type {
  AssetStoreClient,
  ContentAssetDetail,
  ContentAssetSummary,
} from "@/lib/content-assets/types";
import type {
  ContentLibraryDetail,
  ContentLibraryOriginEntity,
  ContentLibraryRenderer,
  ContentLibrarySnapshot,
  ContentLibraryType,
} from "@/lib/content-library/types";
import type { Database, Json } from "@/types/database";

type CreateManualDocumentAssetInput = {
  title?: string | null;
  htmlContent: string;
  folderId?: string | null;
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

type CreateManualDocumentAssetResult = {
  asset: ContentAssetSummary;
  detail: ContentAssetDetail;
};

const MANUAL_DOCUMENT_CONTENT_LIBRARY_SELECT = [
  "id",
  "document_id",
  "content_type",
  "renderer_type",
  "origin_entity_type",
  "origin_entity_id",
  "title",
  "custom_title",
  "note",
  "summary_text",
  "course_id",
  "unit_id",
  "course_label",
  "unit_label",
  "created_at",
  "updated_at",
  "source_conversation_id",
  "source_message_id",
  "source_item_id",
  "metadata",
  "snapshot",
].join(", ");
const MANUAL_DOCUMENT_CONTENT_LIBRARY_SELECT_LEGACY = [
  "id",
  "content_type",
  "renderer_type",
  "origin_entity_type",
  "origin_entity_id",
  "title",
  "custom_title",
  "note",
  "summary_text",
  "course_id",
  "unit_id",
  "course_label",
  "unit_label",
  "created_at",
  "updated_at",
  "source_conversation_id",
  "source_message_id",
  "source_item_id",
  "metadata",
  "snapshot",
].join(", ");
let manualDocumentContentLibraryDocumentIdSupported: boolean | null = null;

type ManualDocumentQueryError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null;

function isMissingContentLibraryDocumentIdColumnError(error: ManualDocumentQueryError) {
  if (!error) return false;
  const combined = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return (
    (error.code === "42703" && /document_id/i.test(combined)) ||
    (/document_id/i.test(combined) && /(column|content_library_items|schema cache)/i.test(combined))
  );
}

async function runManualDocumentQueryWithDocumentIdFallback<
  TResult extends { error: ManualDocumentQueryError },
>(params: {
  run: (select: string) => PromiseLike<TResult>;
}): Promise<TResult> {
  const preferLegacy = manualDocumentContentLibraryDocumentIdSupported === false;
  const primary = await params.run(
    preferLegacy
      ? MANUAL_DOCUMENT_CONTENT_LIBRARY_SELECT_LEGACY
      : MANUAL_DOCUMENT_CONTENT_LIBRARY_SELECT,
  );

  if (!primary.error) {
    if (!preferLegacy) {
      manualDocumentContentLibraryDocumentIdSupported = true;
    }
    return primary;
  }

  if (preferLegacy || !isMissingContentLibraryDocumentIdColumnError(primary.error)) {
    return primary;
  }

  manualDocumentContentLibraryDocumentIdSupported = false;
  return params.run(MANUAL_DOCUMENT_CONTENT_LIBRARY_SELECT_LEGACY);
}

function resolveDocumentId(
  row: Pick<Database["public"]["Tables"]["content_library_items"]["Row"], "document_id" | "metadata">,
) {
  if (typeof row.document_id === "string" && row.document_id.trim()) {
    return row.document_id;
  }

  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;
  const fallbackDocumentId = metadata?.documentId;
  return typeof fallbackDocumentId === "string" && fallbackDocumentId.trim()
    ? fallbackDocumentId
    : null;
}

function buildManualDocumentDetail(
  row: Database["public"]["Tables"]["content_library_items"]["Row"],
): ContentLibraryDetail {
  return {
    id: row.id,
    documentId: resolveDocumentId(row),
    contentType: row.content_type as ContentLibraryType,
    rendererType: row.renderer_type as ContentLibraryRenderer,
    originEntityType: row.origin_entity_type as ContentLibraryOriginEntity,
    originEntityId: row.origin_entity_id,
    title: row.title,
    displayTitle: row.custom_title?.trim() || row.title,
    note: row.note,
    summaryText: row.summary_text,
    courseId: row.course_id,
    unitId: row.unit_id,
    courseName: row.course_label ?? null,
    unitName: row.unit_label ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceConversationId: row.source_conversation_id,
    sourceConversationTitle: null,
    sourceMessageId: row.source_message_id,
    customTitle: row.custom_title,
    sourceItemId: row.source_item_id,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    snapshot: row.snapshot as unknown as ContentLibrarySnapshot,
  };
}

export async function createManualDocumentAsset(
  client: AssetStoreClient,
  input: CreateManualDocumentAssetInput,
): Promise<CreateManualDocumentAssetResult> {
  const title = cleanText(input.title) || "未命名文档";
  const htmlContent = input.htmlContent.trim() || "<p></p>";
  const manualDocumentId = crypto.randomUUID();
  const originKey = `manual-document:${manualDocumentId}`;
  let contentLibraryItemId: string | null = null;
  let documentId: string | null = null;

  try {
    const payload: Database["public"]["Tables"]["content_library_items"]["Insert"] = {
      teacher_id: client.teacherId,
      content_type: "other",
      // 远端仍有旧 check constraint 时，renderer_type 必须落在已放行集合内；
      // 具体正文展示继续由 snapshot.kind/document editor 决定。
      renderer_type: "markdown",
      origin_key: originKey,
      origin_entity_type: "assistant_message",
      origin_entity_id: manualDocumentId,
      title,
      summary_text: null,
      search_text: title.toLowerCase(),
      snapshot: {
        kind: "html",
        html: htmlContent,
      } as unknown as Json,
      metadata: {
        documentHtml: htmlContent,
        createdFrom: "content_assets",
        manualDocumentId,
      } as Json,
    };

    const { data, error } = await runManualDocumentQueryWithDocumentIdFallback({
      run: (select) =>
        client.supabase
          .from("content_library_items")
          .insert(payload)
          .select(select)
          .single(),
    });

    const insertedRow =
      (data as unknown as Database["public"]["Tables"]["content_library_items"]["Row"] | null);

    if (error || !insertedRow?.id) {
      throw error ?? new Error("创建内容库文档失败");
    }

    const insertedContentLibraryItemId = insertedRow.id;
    contentLibraryItemId = insertedContentLibraryItemId;

    const document = await createDocument(
      {
        teacherId: client.teacherId,
        supabase: client.supabase,
      },
      {
        title,
        htmlContent,
        properties: [],
        documentKind: "notes",
        editorKind: "html",
        sourceType: "content_library",
        sourceId: insertedContentLibraryItemId,
        metadata: {
          createdFrom: "content_assets",
          manualDocumentId,
          contentLibraryItemId: insertedContentLibraryItemId,
        },
      },
    );
    documentId = document.id;

    const metadata = ((insertedRow.metadata as Record<string, unknown> | null) ?? {});
    const linkPayload = {
      document_id: document.id,
      metadata: {
        ...metadata,
        documentId: document.id,
        documentHtml: document.htmlContent,
        sourceDocumentVersion: document.version,
      } as Json,
    };
    let linkedRow:
      | Database["public"]["Tables"]["content_library_items"]["Row"]
      | null = null;
    let linkError: ManualDocumentQueryError = null;

    if (manualDocumentContentLibraryDocumentIdSupported === false) {
      const legacyResult = await runManualDocumentQueryWithDocumentIdFallback({
        run: (select) =>
          client.supabase
            .from("content_library_items")
            .update({
              metadata: linkPayload.metadata,
            })
            .eq("id", insertedContentLibraryItemId)
            .eq("teacher_id", client.teacherId)
            .select(select)
            .single(),
      });
      linkedRow =
        (legacyResult.data as unknown as Database["public"]["Tables"]["content_library_items"]["Row"] | null);
      linkError = legacyResult.error;
    } else {
      const primaryResult = await client.supabase
        .from("content_library_items")
        .update(linkPayload)
        .eq("id", insertedContentLibraryItemId)
        .eq("teacher_id", client.teacherId)
        .select(MANUAL_DOCUMENT_CONTENT_LIBRARY_SELECT)
        .single();

      if (primaryResult.error && isMissingContentLibraryDocumentIdColumnError(primaryResult.error)) {
        manualDocumentContentLibraryDocumentIdSupported = false;
        const legacyResult = await runManualDocumentQueryWithDocumentIdFallback({
          run: (select) =>
            client.supabase
              .from("content_library_items")
              .update({
                metadata: linkPayload.metadata,
              })
              .eq("id", insertedContentLibraryItemId)
              .eq("teacher_id", client.teacherId)
              .select(select)
              .single(),
        });
        linkedRow =
          (legacyResult.data as unknown as Database["public"]["Tables"]["content_library_items"]["Row"] | null);
        linkError = legacyResult.error;
      } else {
        linkedRow =
          (primaryResult.data as unknown as Database["public"]["Tables"]["content_library_items"]["Row"] | null);
        linkError = primaryResult.error;
        if (!primaryResult.error) {
          manualDocumentContentLibraryDocumentIdSupported = true;
        }
      }
    }
    if (linkError || !linkedRow) {
      throw linkError ?? new Error("写入内容文档关联失败");
    }

    const contentLibraryItem = buildManualDocumentDetail(
      linkedRow,
    );

    const asset = await createReferenceAsset(client, {
      folderId: input.folderId ?? undefined,
      refEntityType: "content_library_item",
      refEntityId: insertedContentLibraryItemId,
      contentLibraryItemId: insertedContentLibraryItemId,
      title,
      rawText: "",
    });

    revalidateContentAssets(client.teacherId);

    const mergedAsset = mergeReferenceAssetFromLibraryItem(asset, contentLibraryItem);

    return {
      asset: mergeReferenceAssetSummaryFromLibraryItem(
        toContentAssetSummaryFromAsset(asset),
        contentLibraryItem,
      ),
      detail: {
        detailKind: "reference",
        referenceStatus: "resolved",
        asset: mergedAsset,
        contentLibraryItem,
      },
    };
  } catch (error) {
    if (contentLibraryItemId) {
      await client.supabase
        .from("content_library_items")
        .delete()
        .eq("id", contentLibraryItemId)
        .eq("teacher_id", client.teacherId);
    } else {
      await client.supabase
        .from("content_library_items")
        .delete()
        .eq("origin_key", originKey)
        .eq("teacher_id", client.teacherId);
    }
    if (documentId) {
      await deleteDocument(
        {
          teacherId: client.teacherId,
          supabase: client.supabase,
        },
        documentId,
      ).catch(() => null);
    }
    throw error;
  }
}
