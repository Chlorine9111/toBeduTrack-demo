import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import type {
  AutosaveResponse,
  CreateDocumentRequest,
  DocumentEditorKind,
  DocumentListSortField,
  DocumentSourceType,
  EditorDocument,
  EditorDocumentHistoryItem,
  EditorDocumentListItem,
  EditorDocumentProperty,
  EditorDocumentVersion,
  ListDocumentsRequest,
  ListDocumentsResponse,
} from "@/lib/documents/types";

type AppSupabase = SupabaseClient<Database>;
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
type DocumentInsert = Database["public"]["Tables"]["documents"]["Insert"];
type DocumentVersionRow = Database["public"]["Tables"]["document_versions"]["Row"];
type DocumentListRow = Pick<
  DocumentRow,
  | "id"
  | "title"
  | "document_kind"
  | "properties"
  | "starred"
  | "editor_kind"
  | "source_type"
  | "source_id"
  | "version"
  | "created_at"
  | "updated_at"
>;

const DOCUMENT_DETAIL_SELECT = [
  "id",
  "teacher_id",
  "title",
  "html_content",
  "properties",
  "document_kind",
  "editor_kind",
  "source_type",
  "source_id",
  "document_model",
  "metadata",
  "starred",
  "version",
  "created_at",
  "updated_at",
  "deleted_at",
].join(", ");

const DOCUMENT_VERSION_DETAIL_SELECT = [
  "id",
  "document_id",
  "teacher_id",
  "title",
  "html_content",
  "properties",
  "document_kind",
  "editor_kind",
  "document_model",
  "metadata",
  "version",
  "created_at",
].join(", ");

export type DocumentClient = {
  teacherId: string;
  supabase: AppSupabase;
};

type AutosaveRpcRow = {
  saved_at: string;
  version: number;
  changed: boolean;
};

type RestoreRpcRow = {
  saved_at: string;
  version: number;
  changed: boolean;
};

export class DocumentNotFoundError extends Error {
  constructor() {
    super("DOCUMENT_NOT_FOUND");
  }
}

export class DocumentConflictError extends Error {
  constructor() {
    super("DOCUMENT_VERSION_CONFLICT");
  }
}

export class DocumentVersionNotFoundError extends Error {
  constructor() {
    super("DOCUMENT_VERSION_NOT_FOUND");
  }
}

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type DeleteDocumentResult = {
  deletedAt: string;
  alreadyDeleted: boolean;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeJsonRecord(value: Json | null | undefined): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

export function isDocumentMetadataReadOnly(
  metadata: Json | Record<string, unknown> | null | undefined,
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  return metadata.readOnly === true;
}

export function normalizeDocumentProperties(
  value: Json | null | undefined,
): EditorDocumentProperty[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isPlainObject(item)) return [];

    const key = cleanText(item.key);
    const label = cleanText(item.label);
    const rawValue = cleanText(item.value);
    const rawColor = isPlainObject(item.color) ? item.color : null;
    const bg = cleanText(rawColor?.bg);
    const text = cleanText(rawColor?.text);

    if (!key || !label) return [];

    return [
      {
        key,
        label,
        value: rawValue,
        color: bg && text ? { bg, text } : null,
      },
    ];
  });
}

function serializeDocumentProperties(
  properties: EditorDocumentProperty[],
): Json {
  return properties.flatMap((item) => {
    const key = cleanText(item.key);
    const label = cleanText(item.label);
    const value = cleanText(item.value);
    const bg = cleanText(item.color?.bg);
    const text = cleanText(item.color?.text);

    if (!key || !label) return [];

    return [
      bg && text
        ? { key, label, value, color: { bg, text } }
        : { key, label, value },
    ];
  }) as Json;
}

function mapDocumentListItem(row: DocumentListRow): EditorDocumentListItem {
  return {
    id: row.id,
    title: row.title,
    documentKind: row.document_kind,
    properties: normalizeDocumentProperties(row.properties),
    version: row.version,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    starred: row.starred,
  };
}

function mapDocument(row: DocumentRow): EditorDocument {
  return {
    id: row.id,
    title: row.title,
    htmlContent: row.html_content,
    properties: normalizeDocumentProperties(row.properties),
    documentKind: row.document_kind,
    starred: row.starred,
    version: row.version,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    editorKind: row.editor_kind as DocumentEditorKind,
    sourceType: row.source_type as DocumentSourceType,
    sourceId: row.source_id,
    documentModel: (row.document_model as Json | null | undefined) ?? null,
    metadata: normalizeJsonRecord(row.metadata),
    readOnly: isDocumentMetadataReadOnly(row.metadata),
  };
}

function mapDocumentVersion(row: DocumentVersionRow): EditorDocumentVersion {
  return {
    id: row.id,
    documentId: row.document_id,
    title: row.title,
    htmlContent: row.html_content,
    properties: normalizeDocumentProperties(row.properties),
    documentKind: row.document_kind,
    version: row.version,
    createdAt: row.created_at,
    editorKind: row.editor_kind as DocumentEditorKind,
    documentModel: (row.document_model as Json | null | undefined) ?? null,
    metadata: normalizeJsonRecord(row.metadata),
  };
}

function pickRpcRow<T>(value: T[] | T | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapRpcError(error: { message?: string | null } | null): never {
  const message = error?.message ?? "";

  if (message.includes("document_not_found")) {
    throw new DocumentNotFoundError();
  }
  if (message.includes("document_version_conflict")) {
    throw new DocumentConflictError();
  }
  if (message.includes("document_version_not_found")) {
    throw new DocumentVersionNotFoundError();
  }

  throw new Error(message || "DOCUMENT_RPC_FAILED");
}

async function readDocumentRowById(client: DocumentClient, documentId: string) {
  const { data, error } = await client.supabase
    .from("documents")
    .select(DOCUMENT_DETAIL_SELECT)
    .eq("id", documentId)
    .eq("teacher_id", client.teacherId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error("读取文档失败");
  }

  return (data as unknown as DocumentRow | null) ?? null;
}

async function readDocumentRowBySource(
  client: DocumentClient,
  sourceType: DocumentSourceType,
  sourceId: string,
) {
  const { data, error } = await client.supabase
    .from("documents")
    .select(DOCUMENT_DETAIL_SELECT)
    .eq("teacher_id", client.teacherId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error("读取文档失败");
  }

  return (data as unknown as DocumentRow | null) ?? null;
}

async function insertDocumentVersionSnapshot(
  client: DocumentClient,
  row: DocumentRow,
) {
  const payload: Database["public"]["Tables"]["document_versions"]["Insert"] = {
    document_id: row.id,
    teacher_id: row.teacher_id,
    title: row.title,
    html_content: row.html_content,
    properties: row.properties,
    document_kind: row.document_kind,
    editor_kind: row.editor_kind,
    document_model: row.document_model,
    metadata: row.metadata,
    version: row.version,
  };

  const { error } = await client.supabase
    .from("document_versions")
    .insert(payload);

  if (error) {
    throw new Error("写入文档历史失败");
  }
}

async function readOwnedDocumentRowIncludingDeleted(
  client: DocumentClient,
  documentId: string,
) {
  const { data, error } = await client.supabase
    .from("documents")
    .select(DOCUMENT_DETAIL_SELECT)
    .eq("id", documentId)
    .eq("teacher_id", client.teacherId)
    .maybeSingle();

  if (error) {
    throw new Error("读取文档失败");
  }

  return (data as unknown as DocumentRow | null) ?? null;
}

function getDocumentSortColumn(sort: DocumentListSortField | undefined) {
  switch (sort) {
    case "createdAt":
      return "created_at";
    case "title":
      return "title";
    case "updatedAt":
    default:
      return "updated_at";
  }
}

function buildDuplicateTitle(title: string) {
  const base = cleanText(title) || "未命名文档";
  return `${base} (副本)`;
}

function normalizeCreateDocumentInput(
  input: CreateDocumentRequest,
): Omit<DocumentInsert, "teacher_id"> {
  return {
    title: cleanText(input.title),
    html_content: typeof input.htmlContent === "string" ? input.htmlContent : "",
    properties: serializeDocumentProperties(input.properties ?? []),
    document_kind: cleanText(input.documentKind) || "notes",
    editor_kind: input.editorKind ?? "html",
    source_type: input.sourceType ?? "standalone",
    source_id: input.sourceId ?? null,
    document_model: (input.documentModel as Json | null | undefined) ?? null,
    metadata: (input.metadata ?? {}) as Json,
  };
}

export async function getDocumentDetail(
  client: DocumentClient,
  documentId: string,
) {
  const row = await readDocumentRowById(client, documentId);
  return row ? mapDocument(row) : null;
}

export async function listDocuments(
  client: DocumentClient,
  input: ListDocumentsRequest,
): Promise<ListDocumentsResponse> {
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;
  const offset = (page - 1) * limit;
  const sortColumn = getDocumentSortColumn(input.sort);
  const ascending = (input.order ?? "desc") === "asc";

  let query = client.supabase
    .from("documents")
    .select(
      "id,title,document_kind,properties,starred,editor_kind,source_type,source_id,version,created_at,updated_at",
      { count: "exact" },
    )
    .eq("teacher_id", client.teacherId)
    .is("deleted_at", null)
    .order(sortColumn, { ascending })
    .range(offset, offset + limit - 1);

  if (input.query) {
    query = query.ilike("title", `%${input.query}%`);
  }
  if (input.kind) {
    query = query.eq("document_kind", input.kind);
  }
  if (typeof input.starred === "boolean") {
    query = query.eq("starred", input.starred);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error("读取文档列表失败");
  }

  return {
    items: (data ?? []).map(mapDocumentListItem),
    total: count ?? 0,
    page,
    limit,
    hasMore: offset + (data?.length ?? 0) < (count ?? 0),
  };
}

export async function createDocument(
  client: DocumentClient,
  input: CreateDocumentRequest,
) {
  const normalized = normalizeCreateDocumentInput(input);

  if (normalized.source_type !== "standalone" && !normalized.source_id) {
    throw new DocumentValidationError("SOURCE_ID_REQUIRED");
  }

  if (normalized.source_id) {
    const existing = await readDocumentRowBySource(
      client,
      normalized.source_type as DocumentSourceType,
      normalized.source_id,
    );
    if (existing) {
      return mapDocument(existing);
    }
  }

  const payload: DocumentInsert = {
    teacher_id: client.teacherId,
    ...normalized,
  };

  const { data, error } = await client.supabase
    .from("documents")
    .insert(payload)
    .select(DOCUMENT_DETAIL_SELECT)
    .single();

  const insertedRow = (data as unknown as DocumentRow | null);

  if (error) {
    if (error.code === "23505" && payload.source_id) {
      const existing = await readDocumentRowBySource(
        client,
        payload.source_type as DocumentSourceType,
        payload.source_id,
      );
      if (existing) {
        return mapDocument(existing);
      }
    }
    throw new Error("创建文档失败");
  }

  if (!insertedRow) {
    throw new Error("创建文档失败");
  }

  try {
    await insertDocumentVersionSnapshot(client, insertedRow);
  } catch (error) {
    await client.supabase.from("documents").delete().eq("id", insertedRow.id).eq("teacher_id", client.teacherId);
    throw error;
  }

  return mapDocument(insertedRow);
}

export async function deleteDocument(
  client: DocumentClient,
  documentId: string,
) : Promise<DeleteDocumentResult | null> {
  const row = await readOwnedDocumentRowIncludingDeleted(client, documentId);
  if (!row) {
    return null;
  }

  if (row.deleted_at) {
    return {
      deletedAt: row.deleted_at,
      alreadyDeleted: true,
    };
  }

  const deletedAt = new Date().toISOString();
  const { error } = await client.supabase
    .from("documents")
    .update({
      deleted_at: deletedAt,
    })
    .eq("id", documentId)
    .eq("teacher_id", client.teacherId)
    .is("deleted_at", null);

  if (error) {
    throw new Error("删除文档失败");
  }

  return {
    deletedAt,
    alreadyDeleted: false,
  };
}

export async function duplicateDocument(
  client: DocumentClient,
  documentId: string,
  titleOverride?: string,
) {
  const row = await readDocumentRowById(client, documentId);
  if (!row) {
    throw new DocumentNotFoundError();
  }

  return createDocument(client, {
    title: cleanText(titleOverride) || buildDuplicateTitle(row.title),
    htmlContent: row.html_content,
    properties: normalizeDocumentProperties(row.properties),
    documentKind: row.document_kind,
    editorKind: row.editor_kind as DocumentEditorKind,
    sourceType: "standalone",
    sourceId: null,
    documentModel: row.document_model,
    metadata: normalizeJsonRecord(row.metadata),
  });
}

export async function updateDocumentStar(
  client: DocumentClient,
  documentId: string,
  starred: boolean,
) {
  const row = await readDocumentRowById(client, documentId);
  if (!row) {
    throw new DocumentNotFoundError();
  }

  const { data, error } = await client.supabase
    .from("documents")
    .update({ starred })
    .eq("id", documentId)
    .eq("teacher_id", client.teacherId)
    .is("deleted_at", null)
    .select("id, starred")
    .single();

  if (error || !data) {
    throw new Error("更新文档收藏状态失败");
  }

  return {
    id: data.id,
    starred: data.starred,
  };
}

export async function getDocumentProperties(
  client: DocumentClient,
  documentId: string,
) {
  const row = await readDocumentRowById(client, documentId);
  if (!row) {
    throw new DocumentNotFoundError();
  }

  return {
    properties: normalizeDocumentProperties(row.properties),
    version: row.version,
    updatedAt: row.updated_at,
  };
}

export async function autosaveDocument(
  client: DocumentClient,
  documentId: string,
  input: {
    title: string;
    htmlContent: string;
    properties: EditorDocumentProperty[];
    expectedVersion: number;
  },
): Promise<AutosaveResponse & { changed: boolean }> {
  const current = await readDocumentRowById(client, documentId);
  if (!current) {
    throw new DocumentNotFoundError();
  }
  if (isDocumentMetadataReadOnly(current.metadata)) {
    throw new DocumentValidationError("DOCUMENT_READ_ONLY");
  }

  const rpcClient = client.supabase as AppSupabase & {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: AutosaveRpcRow[] | AutosaveRpcRow | null; error: { message?: string | null } | null }>;
  };

  const { data, error } = await rpcClient.rpc("autosave_document", {
    p_document_id: documentId,
    p_teacher_id: client.teacherId,
    p_title: input.title,
    p_html_content: input.htmlContent,
    p_properties: serializeDocumentProperties(input.properties),
    p_expected_version: input.expectedVersion,
  });

  if (error) {
    mapRpcError(error);
  }

  const row = pickRpcRow(data);
  if (!row) {
    throw new Error("DOCUMENT_AUTOSAVE_EMPTY");
  }

  return {
    savedAt: row.saved_at,
    version: row.version,
    changed: row.changed,
  };
}

export async function syncDocumentFromSource(
  client: DocumentClient,
  documentId: string,
  input: {
    title: string;
    htmlContent: string;
    properties?: EditorDocumentProperty[];
    metadata?: Record<string, unknown>;
  },
) {
  const row = await readDocumentRowById(client, documentId);
  if (!row) {
    throw new DocumentNotFoundError();
  }

  const nextTitle = cleanText(input.title) || row.title || "未命名文档";
  const nextHtmlContent = typeof input.htmlContent === "string" ? input.htmlContent : row.html_content;
  const nextProperties = serializeDocumentProperties(
    input.properties ?? normalizeDocumentProperties(row.properties),
  );
  const nextMetadata = {
    ...normalizeJsonRecord(row.metadata),
    ...(input.metadata ?? {}),
  } as Json;

  const propertiesChanged =
    JSON.stringify(row.properties ?? []) !== JSON.stringify(nextProperties);
  const metadataChanged =
    JSON.stringify(normalizeJsonRecord(row.metadata)) !== JSON.stringify(nextMetadata);
  const changed =
    row.title !== nextTitle ||
    row.html_content !== nextHtmlContent ||
    propertiesChanged ||
    metadataChanged;

  if (!changed) {
    return mapDocument(row);
  }

  const { data, error } = await client.supabase
    .from("documents")
    .update({
      title: nextTitle,
      html_content: nextHtmlContent,
      properties: nextProperties,
      metadata: nextMetadata,
      version: row.version + 1,
    })
    .eq("id", documentId)
    .eq("teacher_id", client.teacherId)
    .is("deleted_at", null)
    .select(DOCUMENT_DETAIL_SELECT)
    .single();

  if (error || !data) {
    throw new Error("同步文档副本失败");
  }

  const updatedRow = data as unknown as DocumentRow;
  await insertDocumentVersionSnapshot(client, updatedRow);
  return mapDocument(updatedRow);
}

export async function updateDocumentProperties(
  client: DocumentClient,
  documentId: string,
  input: {
    properties: EditorDocumentProperty[];
    expectedVersion?: number;
  },
) {
  const row = await readDocumentRowById(client, documentId);
  if (!row) {
    throw new DocumentNotFoundError();
  }

  return autosaveDocument(client, documentId, {
    title: row.title,
    htmlContent: row.html_content,
    properties: input.properties,
    expectedVersion: input.expectedVersion ?? row.version,
  });
}

export async function listDocumentHistory(
  client: DocumentClient,
  documentId: string,
) {
  const row = await readDocumentRowById(client, documentId);
  if (!row) {
    throw new DocumentNotFoundError();
  }

  const { data, error } = await client.supabase
    .from("document_versions")
    .select("id, version, title, created_at")
    .eq("document_id", documentId)
    .eq("teacher_id", client.teacherId)
    .order("version", { ascending: false });

  if (error) {
    throw new Error("读取文档历史失败");
  }

  return (data ?? []).map<EditorDocumentHistoryItem>((item) => ({
    id: item.id,
    version: item.version,
    title: item.title,
    createdAt: item.created_at,
  }));
}

export async function getDocumentHistoryVersion(
  client: DocumentClient,
  documentId: string,
  versionId: string,
) {
  const row = await readDocumentRowById(client, documentId);
  if (!row) {
    throw new DocumentNotFoundError();
  }

  const { data, error } = await client.supabase
    .from("document_versions")
    .select(DOCUMENT_VERSION_DETAIL_SELECT)
    .eq("id", versionId)
    .eq("document_id", documentId)
    .eq("teacher_id", client.teacherId)
    .maybeSingle();

  if (error) {
    throw new Error("读取文档历史版本失败");
  }

  if (!data) {
    return null;
  }

  return mapDocumentVersion(data as unknown as DocumentVersionRow);
}

export async function restoreDocumentHistoryVersion(
  client: DocumentClient,
  documentId: string,
  versionId: string,
  expectedVersion?: number,
) {
  const rpcClient = client.supabase as AppSupabase & {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: RestoreRpcRow[] | RestoreRpcRow | null; error: { message?: string | null } | null }>;
  };

  const { data, error } = await rpcClient.rpc("restore_document_version", {
    p_document_id: documentId,
    p_version_id: versionId,
    p_teacher_id: client.teacherId,
    p_expected_version: expectedVersion ?? null,
  });

  if (error) {
    mapRpcError(error);
  }

  const row = pickRpcRow(data);
  if (!row) {
    throw new Error("DOCUMENT_RESTORE_EMPTY");
  }

  return {
    savedAt: row.saved_at,
    version: row.version,
    changed: row.changed,
  };
}
