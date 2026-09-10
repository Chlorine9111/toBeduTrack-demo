import { getDocumentDetail, type DocumentClient } from "@/lib/documents/store";
import { syncDocumentSourceProjection } from "@/lib/documents/source-sync";

export type DocumentSourceProjectionSyncPayload = {
  documentId: string;
};

export async function runDocumentSourceProjectionSyncTask(
  client: DocumentClient,
  payload: DocumentSourceProjectionSyncPayload,
) {
  if (!payload.documentId) return;

  const document = await getDocumentDetail(client, payload.documentId);
  if (!document || document.sourceType === "standalone") {
    return;
  }

  await syncDocumentSourceProjection(client, document);
}
