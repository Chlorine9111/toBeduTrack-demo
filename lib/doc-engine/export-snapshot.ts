import { createHash } from "crypto";
import type {
  DocumentLayoutConfig,
  DocumentModel,
  DocumentPageSize,
} from "@/lib/doc-engine/block-types";
import { DEFAULT_DOCUMENT_LAYOUT } from "@/lib/doc-engine/block-types";
import { normalizeDocumentHtml } from "@/lib/doc-engine/editor-html";
import { buildDocumentArticleHtml } from "@/lib/doc-engine/document-article-html";

export type DocumentExportSnapshot = {
  title: string;
  documentType: DocumentModel["type"];
  html: string;
  layoutConfig: DocumentLayoutConfig;
  sourceKind: string;
  sourceId: string | null;
  snapshotHash: string;
  mathNodeCount: number;
};

function countMathNodes(html: string) {
  return html.match(/<math-(?:inline|display)\b[^>]*data-latex=/gi)?.length ?? 0;
}

export function buildDocumentExportSnapshotFromDocument(params: {
  document: DocumentModel;
  title?: string | null;
  pageSize?: DocumentPageSize;
  layoutConfig?: Partial<DocumentLayoutConfig>;
  sourceKind: string;
  sourceId?: string | null;
}) {
  const title = params.title?.trim() || params.document.title || "document";
  const html = normalizeDocumentHtml(buildDocumentArticleHtml(params.document) || "");
  const layoutConfig: DocumentLayoutConfig = {
    ...DEFAULT_DOCUMENT_LAYOUT,
    ...params.document.layoutConfig,
    ...params.layoutConfig,
    pageSize:
      params.pageSize ||
      params.layoutConfig?.pageSize ||
      params.document.layoutConfig.pageSize ||
      DEFAULT_DOCUMENT_LAYOUT.pageSize,
  };
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        title,
        html,
        layoutConfig,
        sourceKind: params.sourceKind,
        sourceId: params.sourceId ?? params.document.id,
      }),
    )
    .digest("hex");

  return {
    title,
    documentType: params.document.type,
    html,
    layoutConfig,
    sourceKind: params.sourceKind,
    sourceId: params.sourceId ?? params.document.id,
    snapshotHash: hash,
    mathNodeCount: countMathNodes(html),
  } satisfies DocumentExportSnapshot;
}
