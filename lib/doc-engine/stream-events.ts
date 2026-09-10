import type { DocumentBlock, DocumentKind, DocumentLayoutConfig, DocumentMeta, DocumentModel } from "@/lib/doc-engine/block-types";
import { DEFAULT_DOCUMENT_LAYOUT } from "@/lib/doc-engine/block-types";
import { parseDocumentModel } from "@/lib/doc-engine/document-schema";

export type DocGenerateStreamEvent =
  | {
      type: "meta";
      document: {
        id?: string;
        type?: DocumentKind;
        title?: string;
        meta?: Partial<DocumentMeta>;
        layoutConfig?: Partial<DocumentLayoutConfig>;
      };
    }
  | {
      type: "block";
      block: DocumentBlock;
    }
  | {
      type: "progress";
      blocksGenerated: number;
      estimatedTotal?: number;
    }
  | {
      type: "error";
      message: string;
      partial?: boolean;
    }
  | {
      type: "complete";
      documentId?: string;
    };

function normalizeLayoutConfig(value: Partial<DocumentLayoutConfig> | undefined) {
  return {
    ...DEFAULT_DOCUMENT_LAYOUT,
    ...value,
    margins: {
      ...DEFAULT_DOCUMENT_LAYOUT.margins,
      ...(value?.margins ?? {}),
    },
  } satisfies DocumentLayoutConfig;
}

export function createDraftDocumentFromMeta(params: {
  previous: DocumentModel | null;
  meta: Extract<DocGenerateStreamEvent, { type: "meta" }>["document"];
}) {
  const next = parseDocumentModel({
    id: params.meta.id?.trim() || params.previous?.id || "streaming-document",
    type: params.meta.type ?? params.previous?.type ?? "notes",
    title: params.meta.title?.trim() || params.previous?.title || "未命名文档",
    meta: {
      ...(params.previous?.meta ?? {}),
      ...(params.meta.meta ?? {}),
    },
    blocks: params.previous?.blocks ?? [],
    layoutConfig: normalizeLayoutConfig({
      ...(params.previous?.layoutConfig ?? DEFAULT_DOCUMENT_LAYOUT),
      ...(params.meta.layoutConfig ?? {}),
    }),
  });

  return next ?? params.previous;
}

export function appendDraftBlock(params: {
  previous: DocumentModel | null;
  block: DocumentBlock;
}) {
  if (!params.previous) return null;

  return (
    parseDocumentModel({
      ...params.previous,
      blocks: [...params.previous.blocks, params.block],
    }) ?? params.previous
  );
}
