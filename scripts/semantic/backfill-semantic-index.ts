import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { syncKnowledgeDocumentSemanticIndex } from "@/lib/assistant/knowledge-rag";
import { syncExerciseSemanticIndexRows } from "@/lib/question-bank/semantic-index";
import { syncContentLibrarySemanticIndexItems } from "@/lib/content-library/semantic-index";
import { syncTeacherMemorySemanticCapsules } from "@/lib/teacher-memory/semantic-memory";
import type { TeacherMemoryRecord } from "@/lib/teacher-memory/types";

const BATCH_SIZE = 100;

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const teacherIdArg = argv.find((item) => item.startsWith("--teacher="));
  const kindsArg = argv.find((item) => item.startsWith("--kinds="));
  const teacherId = teacherIdArg ? teacherIdArg.split("=")[1]?.trim() || null : null;
  const kinds = (kindsArg ? kindsArg.split("=")[1] : "knowledge,exercise,content,memory")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    dryRun,
    teacherId,
    kinds: new Set(kinds),
  };
}

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function asArrayObject(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function mapMemoryRow(row: Record<string, unknown>): TeacherMemoryRecord {
  return {
    id: String(row.id),
    profileKey: String(row.profile_key),
    teacherId: typeof row.teacher_id === "string" ? row.teacher_id : null,
    scope: String(row.scope) as TeacherMemoryRecord["scope"],
    preferences: asObject(row.preferences),
    history: asArrayObject(row.history),
    summary: asObject(row.summary),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastActiveAt: String(row.last_active_at),
  };
}

async function listTeacherIds(db: ReturnType<typeof createAdminSupabaseClient>, teacherId: string | null) {
  if (teacherId) return [teacherId];

  const [knowledgeDocs, exercises, contents, memories] = await Promise.all([
    db.from("knowledge_documents").select("teacher_id"),
    db.from("exercises").select("teacher_id"),
    db.from("content_library_items").select("teacher_id"),
    db.from("teacher_usage_memory").select("teacher_id"),
  ]);

  const ids = [
    ...(knowledgeDocs.data ?? []),
    ...(exercises.data ?? []),
    ...(contents.data ?? []),
    ...(memories.data ?? []),
  ]
    .map((row) => (typeof row.teacher_id === "string" ? row.teacher_id : ""))
    .filter(Boolean);

  return Array.from(new Set(ids));
}

async function backfillKnowledge(db: ReturnType<typeof createAdminSupabaseClient>, teacherId: string, dryRun: boolean) {
  const { data, error } = await db
    .from("knowledge_documents")
    .select("id")
    .eq("teacher_id", teacherId);
  if (error) throw new Error(`读取知识库文档失败: ${error.message}`);
  const documentIds = (data ?? []).map((row) => row.id);
  console.log(`[semantic-backfill] teacher=${teacherId} knowledge=${documentIds.length}`);
  if (dryRun || documentIds.length === 0) return;
  for (const batch of chunk(documentIds, BATCH_SIZE)) {
    await syncKnowledgeDocumentSemanticIndex({
      db,
      teacherId,
      documentIds: batch,
    });
  }
}

async function backfillExercises(db: ReturnType<typeof createAdminSupabaseClient>, teacherId: string, dryRun: boolean) {
  const { data, error } = await db.from("exercises").select("id").eq("teacher_id", teacherId);
  if (error) throw new Error(`读取题库失败: ${error.message}`);
  const exerciseIds = (data ?? []).map((row) => row.id);
  console.log(`[semantic-backfill] teacher=${teacherId} exercises=${exerciseIds.length}`);
  if (dryRun || exerciseIds.length === 0) return;
  for (const batch of chunk(exerciseIds, BATCH_SIZE)) {
    await syncExerciseSemanticIndexRows({
      supabase: db,
      teacherId,
      exerciseIds: batch,
    });
  }
}

async function backfillContent(db: ReturnType<typeof createAdminSupabaseClient>, teacherId: string, dryRun: boolean) {
  const { data, error } = await db.from("content_library_items").select("id").eq("teacher_id", teacherId);
  if (error) throw new Error(`读取内容库失败: ${error.message}`);
  const itemIds = (data ?? []).map((row) => row.id);
  console.log(`[semantic-backfill] teacher=${teacherId} content=${itemIds.length}`);
  if (dryRun || itemIds.length === 0) return;
  for (const batch of chunk(itemIds, BATCH_SIZE)) {
    await syncContentLibrarySemanticIndexItems({
      supabase: db,
      teacherId,
      itemIds: batch,
    });
  }
}

async function backfillMemory(db: ReturnType<typeof createAdminSupabaseClient>, teacherId: string, dryRun: boolean) {
  const { data, error } = await db
    .from("teacher_usage_memory")
    .select("*")
    .eq("teacher_id", teacherId);
  if (error) throw new Error(`读取长期记忆失败: ${error.message}`);
  const rows = (data ?? []).map((row) => mapMemoryRow(row as Record<string, unknown>));
  console.log(`[semantic-backfill] teacher=${teacherId} memory=${rows.length}`);
  if (dryRun || rows.length === 0) return;
  for (const memory of rows) {
    await syncTeacherMemorySemanticCapsules({
      supabase: db,
      memory,
    });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = createAdminSupabaseClient();
  const teacherIds = await listTeacherIds(db, args.teacherId);

  for (const teacherId of teacherIds) {
    if (args.kinds.has("knowledge")) {
      await backfillKnowledge(db, teacherId, args.dryRun);
    }
    if (args.kinds.has("exercise")) {
      await backfillExercises(db, teacherId, args.dryRun);
    }
    if (args.kinds.has("content")) {
      await backfillContent(db, teacherId, args.dryRun);
    }
    if (args.kinds.has("memory")) {
      await backfillMemory(db, teacherId, args.dryRun);
    }
  }

  console.log("[semantic-backfill] done");
}

main().catch((error) => {
  console.error("[semantic-backfill] failed", error);
  process.exitCode = 1;
});
