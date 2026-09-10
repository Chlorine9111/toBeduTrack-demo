import type { Json } from "@/types/database";

export const DOCUMENT_SOURCE_TYPES = [
  "artifact",
  "content_library",
  "standalone",
] as const;

export const DOCUMENT_EDITOR_KINDS = ["html", "block"] as const;
export const DOCUMENT_LIST_SORT_FIELDS = ["updatedAt", "createdAt", "title"] as const;
export const DOCUMENT_LIST_ORDERS = ["asc", "desc"] as const;

export type DocumentSourceType = (typeof DOCUMENT_SOURCE_TYPES)[number];
export type DocumentEditorKind = (typeof DOCUMENT_EDITOR_KINDS)[number];
export type DocumentListSortField = (typeof DOCUMENT_LIST_SORT_FIELDS)[number];
export type DocumentListOrder = (typeof DOCUMENT_LIST_ORDERS)[number];

export type EditorDocumentPropertyColor = {
  bg: string;
  text: string;
};

export type EditorDocumentProperty = {
  key: string;
  label: string;
  value: string;
  color?: EditorDocumentPropertyColor | null;
};

export type EditorDocument = {
  id: string;
  title: string;
  htmlContent: string;
  properties: EditorDocumentProperty[];
  documentKind: string;
  starred: boolean;
  version: number;
  updatedAt: string;
  createdAt: string;
  editorKind: DocumentEditorKind;
  sourceType: DocumentSourceType;
  sourceId: string | null;
  documentModel: Json | null;
  metadata: Record<string, unknown>;
  readOnly?: boolean;
};

export type EditorDocumentListItem = {
  id: string;
  title: string;
  documentKind: string;
  properties: EditorDocumentProperty[];
  version: number;
  updatedAt: string;
  createdAt: string;
  starred: boolean;
};

export type EditorDocumentHistoryItem = {
  id: string;
  version: number;
  title: string;
  createdAt: string;
};

export type EditorDocumentVersion = {
  id: string;
  documentId: string;
  title: string;
  htmlContent: string;
  properties: EditorDocumentProperty[];
  documentKind: string;
  version: number;
  createdAt: string;
  editorKind: DocumentEditorKind;
  documentModel: Json | null;
  metadata: Record<string, unknown>;
};

export type CreateDocumentRequest = {
  title?: string;
  htmlContent?: string;
  properties?: EditorDocumentProperty[];
  documentKind?: string;
  editorKind?: DocumentEditorKind;
  sourceType?: DocumentSourceType;
  sourceId?: string | null;
  documentModel?: unknown | null;
  metadata?: Record<string, unknown>;
};

export type AutosaveRequest = {
  title: string;
  htmlContent: string;
  properties: EditorDocumentProperty[];
  expectedVersion: number;
};

export type AutosaveResponse = {
  savedAt: string;
  version: number;
};

export type ListDocumentsRequest = {
  query?: string;
  kind?: string;
  starred?: boolean;
  page?: number;
  limit?: number;
  sort?: DocumentListSortField;
  order?: DocumentListOrder;
};

export type ListDocumentsResponse = {
  items: EditorDocumentListItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};
