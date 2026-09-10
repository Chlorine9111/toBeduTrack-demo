import type { SupabaseClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildKnowledgeContentPreview } from "@/lib/assistant/chunk-preview";
import type { Database, Json } from "@/types/database";

type DB = SupabaseClient<Database>;

type ConversationRow = Database["public"]["Tables"]["assistant_conversations"]["Row"];
type MessageRow = Database["public"]["Tables"]["assistant_messages"]["Row"];
type DocumentRow = Database["public"]["Tables"]["knowledge_documents"]["Row"];

type ConversationRecord = {
  id: string;
  teacherId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type ConversationMessageRecord = {
  id: string;
  conversationId: string;
  teacherId: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: Json;
  createdAt: string;
};

const fallbackAssistantStore = {
  conversations: new Map<string, ConversationRecord>(),
  messages: new Map<string, ConversationMessageRecord>(),
};

const fallbackAssistantStoreFile = path.join(process.cwd(), "tmp", "assistant-store.json");
let fallbackAssistantStoreLoaded = false;

type FallbackAssistantStoreSnapshot = {
  conversations: ConversationRecord[];
  messages: ConversationMessageRecord[];
};

const ASSISTANT_CONVERSATION_SELECT = [
  "id",
  "teacher_id",
  "title",
  "created_at",
  "updated_at",
].join(", ");

const ASSISTANT_MESSAGE_SELECT = [
  "id",
  "conversation_id",
  "teacher_id",
  "role",
  "content",
  "sources",
  "created_at",
].join(", ");

const KNOWLEDGE_DOCUMENT_SELECT = [
  "id",
  "teacher_id",
  "filename",
  "file_type",
  "file_size",
  "chunk_count",
  "full_text_length",
  "ocr_provider",
  "subject",
  "supermemory_ids",
  "unit",
  "tags",
  "supermemory_id",
  "storage_path",
  "status",
  "summary",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

type AssistantStoreErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function isAssistantStoreUnavailableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as AssistantStoreErrorLike;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const details = typeof candidate.details === "string" ? candidate.details : "";
  const hint = typeof candidate.hint === "string" ? candidate.hint : "";
  const combined = `${message} ${details} ${hint}`.toLowerCase();

  return code === "PGRST205" || (
    combined.includes("schema cache") &&
    (combined.includes("assistant_conversations") || combined.includes("assistant_messages"))
  );
}

function allowAssistantStoreFallback(error?: unknown) {
  if (process.env.E2E_TEST === "1") return true;
  if (!isAssistantStoreUnavailableError(error)) return false;
  console.error(
    "assistant store: 表 assistant_conversations/assistant_messages 不可用，" +
    "会话将无法持久化到数据库。请检查 Supabase schema 是否包含这些表。",
  );
  return false;
}

function logAssistantStoreFallback(operation: string, error: unknown) {
  if (!isAssistantStoreUnavailableError(error)) return;
  const candidate = (error && typeof error === "object" ? error : {}) as AssistantStoreErrorLike;
  console.warn(`assistant store unavailable during ${operation}, fallback to local store`, {
    code: candidate.code ?? null,
    message: candidate.message ?? null,
  });
}

async function hydrateFallbackAssistantStore() {
  if (fallbackAssistantStoreLoaded) return;
  fallbackAssistantStoreLoaded = true;

  try {
    const raw = await readFile(fallbackAssistantStoreFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<FallbackAssistantStoreSnapshot>;
    for (const item of parsed.conversations ?? []) {
      if (!item?.id) continue;
      fallbackAssistantStore.conversations.set(item.id, item);
    }
    for (const item of parsed.messages ?? []) {
      if (!item?.id) continue;
      fallbackAssistantStore.messages.set(item.id, item);
    }
  } catch {
    // Ignore missing or malformed local fallback snapshots.
  }
}

async function persistFallbackAssistantStore() {
  await mkdir(path.dirname(fallbackAssistantStoreFile), { recursive: true });
  const snapshot: FallbackAssistantStoreSnapshot = {
    conversations: Array.from(fallbackAssistantStore.conversations.values()),
    messages: Array.from(fallbackAssistantStore.messages.values()),
  };
  await writeFile(fallbackAssistantStoreFile, JSON.stringify(snapshot, null, 2), "utf8");
}

function createFallbackConversation(teacherId: string, title: string, id?: string): ConversationRecord {
  const now = new Date().toISOString();
  return {
    id: id ?? crypto.randomUUID(),
    teacherId,
    title,
    createdAt: now,
    updatedAt: now,
  };
}

function createFallbackMessage(input: {
  teacherId: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources?: Json;
}): ConversationMessageRecord {
  return {
    id: crypto.randomUUID(),
    conversationId: input.conversationId,
    teacherId: input.teacherId,
    role: input.role,
    content: input.content,
    sources: input.sources ?? ([] as unknown as Json),
    createdAt: new Date().toISOString(),
  };
}

export function summarizeConversationTitle(message: string) {
  const normalized = message
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
    ?.replace(/\s+/g, " ")
    .replace(/（已附\s*\d+\s*个文档进行解析）/g, "")
    .replace(/\bUploaded materials?:.*$/i, "")
    .replace(/【前置补充说明】/g, "")
    .trim() ?? "";
  if (!normalized) return "新对话";
  return normalized.length > 36 ? `${normalized.slice(0, 36)}…` : normalized;
}

function toConversation(row: ConversationRow) {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessage(row: MessageRow) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    teacherId: row.teacher_id,
    role: row.role,
    content: row.content,
    sources: row.sources,
    createdAt: row.created_at,
  };
}

function toDocument(row: DocumentRow) {
  return {
    chunkCount: row.chunk_count,
    id: row.id,
    teacherId: row.teacher_id,
    filename: row.filename,
    fileType: row.file_type,
    fileSize: row.file_size,
    fullTextLength: row.full_text_length,
    ocrProvider: row.ocr_provider,
    subject: row.subject,
    supermemoryIds: row.supermemory_ids,
    unit: row.unit,
    tags: row.tags,
    supermemoryId: row.supermemory_id,
    storagePath: row.storage_path,
    status: row.status,
    summary: row.summary,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asConversationRow(row: unknown): ConversationRow {
  return row as unknown as ConversationRow;
}

function asConversationRows(rows: unknown[] | null | undefined): ConversationRow[] {
  return (rows ?? []) as unknown as ConversationRow[];
}

function asMessageRows(rows: unknown[] | null | undefined): MessageRow[] {
  return (rows ?? []) as unknown as MessageRow[];
}

function asDocumentRow(row: unknown): DocumentRow {
  return row as unknown as DocumentRow;
}

function asDocumentRows(rows: unknown[] | null | undefined): DocumentRow[] {
  return (rows ?? []) as unknown as DocumentRow[];
}

export async function createConversation(db: DB, teacherId: string, title: string) {
  try {
    const { data, error } = await db
      .from("assistant_conversations")
      .insert({
        teacher_id: teacherId,
        title,
      })
      .select(ASSISTANT_CONVERSATION_SELECT)
      .single();

    if (error) throw error;
    if (!data) throw new Error("创建对话失败");
    return toConversation(asConversationRow(data));
  } catch (error) {
    if (!allowAssistantStoreFallback(error)) {
      throw error instanceof Error ? error : new Error("创建对话失败");
    }
    logAssistantStoreFallback("createConversation", error);
    await hydrateFallbackAssistantStore();
    const fallback = createFallbackConversation(teacherId, title);
    fallbackAssistantStore.conversations.set(fallback.id, fallback);
    await persistFallbackAssistantStore();
    return fallback;
  }
}

export async function listConversations(db: DB, teacherId: string) {
  try {
    const { data, error } = await db
      .from("assistant_conversations")
      .select(ASSISTANT_CONVERSATION_SELECT)
      .eq("teacher_id", teacherId)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    const rows = asConversationRows(data);
    return rows.map(toConversation);
  } catch (error) {
    if (!allowAssistantStoreFallback(error)) {
      throw error instanceof Error ? error : new Error("获取对话列表失败");
    }
    logAssistantStoreFallback("listConversations", error);
  }

  await hydrateFallbackAssistantStore();
  return Array.from(fallbackAssistantStore.conversations.values())
    .filter((item) => item.teacherId === teacherId)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 100);
}

export async function getConversation(db: DB, teacherId: string, conversationId: string) {
  try {
    const { data, error } = await db
      .from("assistant_conversations")
      .select(ASSISTANT_CONVERSATION_SELECT)
      .eq("id", conversationId)
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (error) throw error;
    return data ? toConversation(asConversationRow(data)) : null;
  } catch (error) {
    if (!allowAssistantStoreFallback(error)) {
      throw error instanceof Error ? error : new Error("读取对话失败");
    }
    logAssistantStoreFallback("getConversation", error);
  }

  await hydrateFallbackAssistantStore();
  const fallback = fallbackAssistantStore.conversations.get(conversationId);
  return fallback && fallback.teacherId === teacherId ? fallback : null;
}

export async function updateConversationTimestamp(db: DB, teacherId: string, conversationId: string) {
  const now = new Date().toISOString();
  try {
    const { error } = await db
      .from("assistant_conversations")
      .update({ updated_at: now })
      .eq("id", conversationId)
      .eq("teacher_id", teacherId);
    if (error) throw error;
    return;
  } catch (error) {
    if (!allowAssistantStoreFallback(error)) {
      throw error instanceof Error ? error : new Error("更新对话时间失败");
    }
    logAssistantStoreFallback("updateConversationTimestamp", error);
  }

  await hydrateFallbackAssistantStore();
  const fallback = fallbackAssistantStore.conversations.get(conversationId);
  if (fallback && fallback.teacherId === teacherId) {
    fallbackAssistantStore.conversations.set(conversationId, {
      ...fallback,
      updatedAt: now,
    });
    await persistFallbackAssistantStore();
  }
}

export async function updateConversationTitle(
  db: DB,
  teacherId: string,
  conversationId: string,
  title: string,
) {
  const normalized = summarizeConversationTitle(title);

  try {
    const { error } = await db
      .from("assistant_conversations")
      .update({ title: normalized })
      .eq("id", conversationId)
      .eq("teacher_id", teacherId);
    if (error) throw error;
    return normalized;
  } catch (error) {
    if (!allowAssistantStoreFallback()) {
      throw error instanceof Error ? error : new Error("更新对话标题失败");
    }
  }

  await hydrateFallbackAssistantStore();
  const fallback = fallbackAssistantStore.conversations.get(conversationId);
  if (fallback && fallback.teacherId === teacherId) {
    fallbackAssistantStore.conversations.set(conversationId, {
      ...fallback,
      title: normalized,
      updatedAt: new Date().toISOString(),
    });
    await persistFallbackAssistantStore();
  }

  return normalized;
}

export async function addConversationMessage(db: DB, input: {
  teacherId: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources?: Json;
}) {
  try {
    const { data, error } = await db
      .from("assistant_messages")
      .insert({
        teacher_id: input.teacherId,
        conversation_id: input.conversationId,
        role: input.role,
        content: input.content,
        sources: input.sources ?? ([] as unknown as Json),
      })
      .select("id, teacher_id, conversation_id, role, created_at, sources")
      .single();

    if (error) throw error;
    if (!data) throw new Error("写入对话消息失败");

    await updateConversationTimestamp(db, input.teacherId, input.conversationId).catch((updateError) => {
      if (!allowAssistantStoreFallback(updateError)) {
        throw updateError;
      }
    });
    return {
      id: `${data.id}`,
      teacherId: `${data.teacher_id}`,
      conversationId: `${data.conversation_id}`,
      role: data.role as "user" | "assistant" | "system",
      content: input.content,
      sources: (data.sources ?? input.sources ?? ([] as unknown as Json)) as Json,
      createdAt:
        typeof data.created_at === "string"
          ? data.created_at
          : new Date().toISOString(),
    };
  } catch (error) {
    if (!allowAssistantStoreFallback(error)) {
      throw error instanceof Error ? error : new Error("写入对话消息失败");
    }
    logAssistantStoreFallback("addConversationMessage", error);
    await hydrateFallbackAssistantStore();
    const fallbackConversation = fallbackAssistantStore.conversations.get(input.conversationId);
    if (!fallbackConversation) {
      fallbackAssistantStore.conversations.set(
        input.conversationId,
        createFallbackConversation(input.teacherId, "新对话", input.conversationId),
      );
    }

    const message = createFallbackMessage(input);
    fallbackAssistantStore.messages.set(message.id, message);
    await updateConversationTimestamp(db, input.teacherId, input.conversationId);
    await persistFallbackAssistantStore();
    return message;
  }
}

export async function listConversationMessages(
  db: DB,
  teacherId: string,
  conversationId: string,
  options?: {
    limit?: number;
  },
) {
  const normalizedLimit =
    typeof options?.limit === "number" && Number.isFinite(options.limit) && options.limit > 0
      ? Math.floor(options.limit)
      : null;
  try {
    let query = db
      .from("assistant_messages")
      .select(ASSISTANT_MESSAGE_SELECT)
      .eq("teacher_id", teacherId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: normalizedLimit ? false : true });

    if (normalizedLimit) {
      query = query.limit(normalizedLimit);
    }

    const { data, error } = await query;

    if (error) throw error;
    const rows = asMessageRows(data);
    const orderedRows = normalizedLimit ? [...rows].reverse() : rows;
    return orderedRows.map(toMessage);
  } catch (error) {
    if (!allowAssistantStoreFallback(error)) {
      throw error instanceof Error ? error : new Error("读取对话消息失败");
    }
    logAssistantStoreFallback("listConversationMessages", error);
  }

  await hydrateFallbackAssistantStore();
  const rows = Array.from(fallbackAssistantStore.messages.values())
    .filter((item) => item.teacherId === teacherId && item.conversationId === conversationId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return normalizedLimit ? rows.slice(-normalizedLimit) : rows;
}

export async function deleteConversation(db: DB, teacherId: string, conversationId: string) {
  try {
    const { data, error } = await db
      .from("assistant_conversations")
      .delete()
      .eq("teacher_id", teacherId)
      .eq("id", conversationId)
      .select("id");

    if (error) throw error;
    return (data ?? []).length > 0;
  } catch (error) {
    if (!allowAssistantStoreFallback(error)) {
      throw error instanceof Error ? error : new Error("删除对话失败");
    }
    logAssistantStoreFallback("deleteConversation", error);
  }

  await hydrateFallbackAssistantStore();
  const fallback = fallbackAssistantStore.conversations.get(conversationId);
  if (!fallback || fallback.teacherId !== teacherId) return false;
  fallbackAssistantStore.conversations.delete(conversationId);
  for (const [messageId, message] of fallbackAssistantStore.messages.entries()) {
    if (message.teacherId === teacherId && message.conversationId === conversationId) {
      fallbackAssistantStore.messages.delete(messageId);
    }
  }
  await persistFallbackAssistantStore();
  return true;
}

export async function createKnowledgeDocument(db: DB, input: {
  teacherId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  chunkCount?: number;
  fullTextLength?: number;
  ocrProvider?: string | null;
  subject?: string;
  supermemoryIds?: string[];
  unit?: string;
  tags?: string[];
  supermemoryId?: string | null;
  storagePath?: string | null;
  status?: "processing" | "completed" | "failed";
  summary?: string | null;
  metadata?: Json;
}) {
  const { data, error } = await db
    .from("knowledge_documents")
    .insert({
      chunk_count: input.chunkCount ?? 0,
      teacher_id: input.teacherId,
      filename: input.filename,
      file_type: input.fileType,
      file_size: input.fileSize,
      full_text_length: input.fullTextLength ?? 0,
      ocr_provider: input.ocrProvider ?? null,
      subject: input.subject ?? null,
      supermemory_ids: input.supermemoryIds ?? [],
      unit: input.unit ?? null,
      tags: input.tags ?? [],
      supermemory_id: input.supermemoryId ?? null,
      storage_path: input.storagePath ?? null,
      status: input.status ?? "completed",
      summary: input.summary ?? null,
      metadata: input.metadata ?? ({} as unknown as Json),
    })
    .select(KNOWLEDGE_DOCUMENT_SELECT)
    .single();

  if (error || !data) throw new Error("创建文档记录失败");
  return toDocument(asDocumentRow(data));
}

export async function listKnowledgeDocuments(db: DB, params: {
  teacherId: string;
  subject?: string;
  unit?: string;
  tag?: string;
  query?: string;
}) {
  let queryBuilder = db
    .from("knowledge_documents")
    .select(KNOWLEDGE_DOCUMENT_SELECT)
    .eq("teacher_id", params.teacherId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (params.subject) {
    queryBuilder = queryBuilder.eq("subject", params.subject);
  }
  if (params.unit) {
    queryBuilder = queryBuilder.eq("unit", params.unit);
  }
  if (params.tag) {
    queryBuilder = queryBuilder.contains("tags", [params.tag]);
  }
  if (params.query) {
    queryBuilder = queryBuilder.ilike("filename", `%${params.query}%`);
  }

  const { data, error } = await queryBuilder;
  if (error) throw new Error("获取文档列表失败");
  const rows = asDocumentRows(data);
  return rows.map(toDocument);
}

export async function getKnowledgeDocument(db: DB, teacherId: string, documentId: string) {
  const { data, error } = await db
    .from("knowledge_documents")
    .select(KNOWLEDGE_DOCUMENT_SELECT)
    .eq("teacher_id", teacherId)
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw new Error("读取文档失败");
  return data ? toDocument(asDocumentRow(data)) : null;
}

export async function updateKnowledgeDocument(db: DB, teacherId: string, documentId: string, patch: {
  chunkCount?: number;
  fullTextLength?: number;
  ocrProvider?: string | null;
  subject?: string | null;
  supermemoryIds?: string[];
  unit?: string | null;
  tags?: string[];
  supermemoryId?: string | null;
  summary?: string | null;
  status?: string;
  metadata?: Json;
}) {
  const { data, error } = await db
    .from("knowledge_documents")
    .update({
      chunk_count: patch.chunkCount,
      full_text_length: patch.fullTextLength,
      ocr_provider: patch.ocrProvider,
      subject: patch.subject,
      supermemory_ids: patch.supermemoryIds,
      unit: patch.unit,
      tags: patch.tags,
      supermemory_id: patch.supermemoryId,
      summary: patch.summary,
      status: patch.status,
      metadata: patch.metadata,
    })
    .eq("teacher_id", teacherId)
    .eq("id", documentId)
    .select(KNOWLEDGE_DOCUMENT_SELECT)
    .maybeSingle();

  if (error) throw new Error("更新文档失败");
  return data ? toDocument(asDocumentRow(data)) : null;
}

export async function replaceKnowledgeDocumentChunks(db: DB, params: {
  teacherId: string;
  documentId: string;
  chunks: Array<{
    index: number;
    content: string;
    heading?: string;
    pageStart?: number;
    pageEnd?: number;
    tokenEstimate?: number;
    metadata?: Json;
  }>;
}) {
  const { error: deleteError } = await db
    .from("knowledge_document_chunks")
    .delete()
    .eq("teacher_id", params.teacherId)
    .eq("document_id", params.documentId);

  if (deleteError) {
    throw new Error("清理旧知识块失败");
  }

  if (params.chunks.length === 0) {
    return [];
  }

  const { data, error } = await db
    .from("knowledge_document_chunks")
    .insert(
      params.chunks.map((chunk) => ({
        teacher_id: params.teacherId,
        document_id: params.documentId,
        chunk_index: chunk.index,
        title: chunk.heading ?? null,
        page_start: chunk.pageStart ?? null,
        page_end: chunk.pageEnd ?? null,
        content: chunk.content,
        content_preview: buildKnowledgeContentPreview(chunk.content),
        token_count: chunk.tokenEstimate ?? 0,
        metadata: chunk.metadata ?? ({} as Json),
      })),
    )
    .select("id");

  if (error) {
    throw new Error("写入知识块失败");
  }

  return (data ?? []).map((item) => item.id);
}

export async function deleteKnowledgeDocument(db: DB, teacherId: string, documentId: string) {
  const { data, error } = await db
    .from("knowledge_documents")
    .delete()
    .eq("teacher_id", teacherId)
    .eq("id", documentId)
    .select("id");

  if (error) throw new Error("删除文档失败");
  return (data ?? []).length > 0;
}
