import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import type { ScannedQuestion } from "@/lib/pdf-scan/types";
import type { ExerciseDifficulty } from "@/types/exercise";

type AppSupabase = SupabaseClient<Database>;

type TempPoolRow = Database["public"]["Tables"]["agent_temp_question_pools"]["Row"];
type TempPoolItemRow = Database["public"]["Tables"]["agent_temp_question_pool_items"]["Row"];
type PdfScanUploadRow = Database["public"]["Tables"]["pdf_scan_uploads"]["Row"];

const PDF_SCAN_UPLOAD_SELECT = [
  "id",
  "teacher_id",
  "file_name",
  "file_url",
  "storage_path",
  "file_size",
  "page_count",
  "status",
  "mathpix_id",
  "question_count",
  "scan_result",
  "error_message",
  "processing_time_ms",
  "created_at",
  "updated_at",
].join(",");

const TEMP_POOL_SELECT = [
  "id",
  "teacher_id",
  "conversation_id",
  "source_kind",
  "label",
  "status",
  "source_file_names",
  "source_upload_ids",
  "question_count",
  "ready_question_count",
  "metadata",
  "expires_at",
  "last_used_at",
  "created_at",
  "updated_at",
].join(",");

const TEMP_POOL_ITEM_SELECT = [
  "id",
  "pool_id",
  "teacher_id",
  "source_upload_id",
  "source_file_name",
  "sort_order",
  "question_number",
  "source_page_number",
  "question_type",
  "difficulty",
  "confidence",
  "question_text",
  "options",
  "sub_questions",
  "linked_figures",
  "knowledge_point",
  "source_type",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

export type TempPoolQuestionOption = {
  key: string;
  content: string;
};

export type TempPoolQuestion = {
  id: string;
  sequence: number;
  questionNumber: number;
  questionType: string;
  normalizedType: "MC" | "FR";
  difficulty: string | null;
  difficultyLevel: ExerciseDifficulty;
  confidence: number;
  stem: string;
  options: TempPoolQuestionOption[];
  subQuestions: Array<{ label: string; content: string }>;
  linkedFigures: string[];
  knowledgePoint: string;
  sourcePageNumber: number | null;
  sourceFileName: string;
  sourceUploadId: string | null;
  sourceType: string;
};

export type TempQuestionPool = {
  id: string;
  teacherId: string;
  conversationId: string;
  label: string;
  status: string;
  sourceKind: string;
  sourceFileNames: string[];
  sourceUploadIds: string[];
  questionCount: number;
  readyQuestionCount: number;
  summaryText: string;
  contextText: string;
  questions: TempPoolQuestion[];
  createdAt: string;
  updatedAt: string;
};

type CreateTempPoolInput = {
  supabase: AppSupabase;
  teacherId: string;
  conversationId: string;
  uploadIds: string[];
  label?: string;
};

type ResolveRecentUploadsInput = {
  supabase: AppSupabase;
  teacherId: string;
  fileNames?: string[];
  limit?: number;
};

function cleanText(value: unknown) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function normalizeFileNames(fileNames: string[] | undefined) {
  return Array.from(
    new Set((fileNames ?? []).map((item) => cleanText(item)).filter(Boolean)),
  ).slice(0, 10);
}

function toQuestionType(value: string) {
  return /choice|mc/i.test(value) ? "MC" : "FR";
}

function toDifficultyLevel(value: string | null | undefined): ExerciseDifficulty {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === "expert" || normalized === "hard") return "hard";
  if (normalized === "medium") return "medium";
  return "easy";
}

function formatQuestionOptions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [] as TempPoolQuestionOption[];
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([key, raw]) => ({
      key: cleanText(key).toUpperCase(),
      content: cleanText(raw),
    }))
    .filter((item) => item.key && item.content);
}

function formatSubQuestions(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{ label: string; content: string }>;
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const label = cleanText((entry as Record<string, unknown>).label);
      const content = cleanText((entry as Record<string, unknown>).content);
      if (!content) return null;
      return {
        label: label || "?",
        content,
      };
    })
    .filter(
      (entry): entry is { label: string; content: string } => Boolean(entry),
    );
}

function formatLinkedFigures(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.map((item) => cleanText(item)).filter(Boolean);
}

function extractScanQuestions(scanResult: Json | null) {
  if (!scanResult || typeof scanResult !== "object" || Array.isArray(scanResult)) {
    return [] as ScannedQuestion[];
  }

  const rawQuestions = (scanResult as Record<string, unknown>).questions;
  if (!Array.isArray(rawQuestions)) {
    return [] as ScannedQuestion[];
  }

  return rawQuestions as ScannedQuestion[];
}

function buildPoolContextText(questions: TempPoolQuestion[]) {
  const raw = questions
    .map((question) => {
      const options = question.options
        .map((option) => `${option.key}. ${option.content}`)
        .join("；");
      const figures = question.linkedFigures.join(", ");
      return [
        `题号 ${question.questionNumber}`,
        `题型: ${question.questionType}`,
        `题干: ${question.stem}`,
        options ? `选项: ${options}` : "",
        question.knowledgePoint ? `知识点: ${question.knowledgePoint}` : "",
        figures ? `图像: ${figures}` : "",
        question.sourcePageNumber ? `页码: ${question.sourcePageNumber}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");

  return raw.length > 8_000 ? `${raw.slice(0, 8_000)}\n...（其余题目已截断）` : raw;
}

function buildPoolSummaryText(params: {
  fileNames: string[];
  questionCount: number;
  readyQuestionCount: number;
}) {
  return [
    `临时题池已准备：共 ${params.fileNames.length} 个文件，${params.questionCount} 道题。`,
    params.readyQuestionCount < params.questionCount
      ? `其中 ${params.readyQuestionCount} 道为高置信题，其余题建议先人工复核。`
      : "当前题目已可直接用于临时筛题、讲解和组卷。",
    params.fileNames.length > 0 ? `来源文件：${params.fileNames.join("、")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function toTempPoolQuestion(row: TempPoolItemRow): TempPoolQuestion {
  const questionType = cleanText(row.question_type) || "未分类";
  const difficulty = cleanText(row.difficulty) || null;
  return {
    id: row.id,
    sequence: row.sort_order + 1,
    questionNumber: row.question_number,
    questionType,
    normalizedType: toQuestionType(questionType),
    difficulty,
    difficultyLevel: toDifficultyLevel(difficulty),
    confidence: Number(row.confidence ?? 0),
    stem: row.question_text,
    options: Array.isArray(row.options)
      ? (row.options as Array<Record<string, unknown>>).map((item) => ({
          key: cleanText(item.key).toUpperCase(),
          content: cleanText(item.content),
        }))
      : [],
    subQuestions: Array.isArray(row.sub_questions)
      ? (row.sub_questions as Array<Record<string, unknown>>).map((item) => ({
          label: cleanText(item.label) || "?",
          content: cleanText(item.content),
        }))
      : [],
    linkedFigures: Array.isArray(row.linked_figures)
      ? (row.linked_figures as string[]).map((item) => cleanText(item)).filter(Boolean)
      : [],
    knowledgePoint: cleanText(row.knowledge_point),
    sourcePageNumber: row.source_page_number,
    sourceFileName: row.source_file_name,
    sourceUploadId: row.source_upload_id,
    sourceType: cleanText(row.source_type),
  };
}

function toTempQuestionPool(params: {
  row: TempPoolRow;
  items: TempPoolItemRow[];
}) {
  const questions = params.items.map(toTempPoolQuestion);
  const metadata =
    params.row.metadata && typeof params.row.metadata === "object" && !Array.isArray(params.row.metadata)
      ? (params.row.metadata as Record<string, unknown>)
      : {};

  return {
    id: params.row.id,
    teacherId: params.row.teacher_id,
    conversationId: params.row.conversation_id,
    label: params.row.label,
    status: params.row.status,
    sourceKind: params.row.source_kind,
    sourceFileNames: params.row.source_file_names ?? [],
    sourceUploadIds: params.row.source_upload_ids ?? [],
    questionCount: params.row.question_count,
    readyQuestionCount: params.row.ready_question_count,
    summaryText: cleanText(metadata.summaryText) || buildPoolSummaryText({
      fileNames: params.row.source_file_names ?? [],
      questionCount: params.row.question_count,
      readyQuestionCount: params.row.ready_question_count,
    }),
    contextText: cleanText(metadata.contextText) || buildPoolContextText(questions),
    questions,
    createdAt: params.row.created_at,
    updatedAt: params.row.updated_at,
  } satisfies TempQuestionPool;
}

async function loadPoolItems(params: {
  supabase: AppSupabase;
  teacherId: string;
  poolId: string;
}) {
  const { data, error } = await params.supabase
    .from("agent_temp_question_pool_items")
    .select(TEMP_POOL_ITEM_SELECT)
    .eq("teacher_id", params.teacherId)
    .eq("pool_id", params.poolId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error("读取临时题池题目失败");
  }

  return (data ?? []) as unknown as TempPoolItemRow[];
}

export async function createTempQuestionPoolFromUploads(
  params: CreateTempPoolInput,
) {
  const uploadIds = Array.from(new Set(params.uploadIds.map((item) => cleanText(item)).filter(Boolean)));
  if (uploadIds.length === 0) {
    throw new Error("缺少可用的扫描上传记录");
  }

  const { data: uploads, error: uploadError } = await params.supabase
    .from("pdf_scan_uploads")
    .select(PDF_SCAN_UPLOAD_SELECT)
    .eq("teacher_id", params.teacherId)
    .in("id", uploadIds)
    .order("created_at", { ascending: true });

  if (uploadError) {
    throw new Error("读取扫描上传记录失败");
  }

  const uploadRows = (uploads ?? []) as unknown as PdfScanUploadRow[];
  if (uploadRows.length === 0) {
    throw new Error("没有找到可用的扫描上传记录");
  }

  const items = uploadRows.flatMap((upload) => {
    const questions = extractScanQuestions(upload.scan_result);
    return questions.map((question, index) => {
      const questionType = cleanText(question.questionType) || "未分类";
      return {
        teacher_id: params.teacherId,
        source_upload_id: upload.id,
        source_file_name: upload.file_name,
        sort_order: index,
        question_number: Number(question.questionNumber ?? index + 1) || index + 1,
        source_page_number:
          typeof question.sourcePageNumber === "number"
            ? question.sourcePageNumber
            : null,
        question_type: questionType,
        difficulty: cleanText(question.difficulty) || null,
        confidence: Number(question.confidence ?? 0) || 0,
        question_text: cleanText(question.content) || "（题干为空）",
        options: formatQuestionOptions(question.options) as unknown as Json,
        sub_questions: formatSubQuestions(question.subQuestions) as unknown as Json,
        linked_figures: formatLinkedFigures(question.linkedFigures) as unknown as Json,
        knowledge_point: cleanText(question.knowledgePoint) || null,
        source_type: cleanText(question.sourceType) || null,
        metadata: {
          rawQuestionNumber: cleanText(question.rawQuestionNumber),
        } as Json,
      };
    });
  });

  if (items.length === 0) {
    throw new Error("当前上传记录里还没有可用的题目结构，无法建立临时题池");
  }

  await params.supabase
    .from("agent_temp_question_pools")
    .update({
      status: "expired",
      expires_at: new Date().toISOString(),
    })
    .eq("teacher_id", params.teacherId)
    .eq("conversation_id", params.conversationId)
    .in("status", ["ready", "ready_with_review"]);

  const sourceFileNames = uploadRows.map((upload) => upload.file_name);
  const readyQuestionCount = items.filter((item) => item.confidence >= 60).length;
  const summaryText = buildPoolSummaryText({
    fileNames: sourceFileNames,
    questionCount: items.length,
    readyQuestionCount,
  });
  const contextText = buildPoolContextText(
    items.map((item, index) => ({
      id: "",
      sequence: index + 1,
      questionNumber: item.question_number,
      questionType: item.question_type,
      normalizedType: toQuestionType(item.question_type),
      difficulty: item.difficulty,
      difficultyLevel: toDifficultyLevel(item.difficulty),
      confidence: item.confidence,
      stem: item.question_text,
      options: item.options as unknown as TempPoolQuestionOption[],
      subQuestions: item.sub_questions as unknown as Array<{ label: string; content: string }>,
      linkedFigures: item.linked_figures as unknown as string[],
      knowledgePoint: item.knowledge_point ?? "",
      sourcePageNumber: item.source_page_number,
      sourceFileName: item.source_file_name,
      sourceUploadId: item.source_upload_id ?? null,
      sourceType: item.source_type ?? "",
    })),
  );
  const label =
    cleanText(params.label) ||
    `${sourceFileNames[0]?.replace(/\.[^.]+$/, "") || "临时题池"} · ${items.length} 题`;

  const { data: poolRow, error: poolError } = await params.supabase
    .from("agent_temp_question_pools")
    .insert({
      teacher_id: params.teacherId,
      conversation_id: params.conversationId,
      source_kind: "pdf_upload",
      label,
      status: readyQuestionCount < items.length ? "ready_with_review" : "ready",
      source_file_names: sourceFileNames,
      source_upload_ids: uploadRows.map((upload) => upload.id),
      question_count: items.length,
      ready_question_count: readyQuestionCount,
      metadata: {
        summaryText,
        contextText,
      } as Json,
    })
    .select(TEMP_POOL_SELECT)
    .single();

  if (poolError || !poolRow) {
    throw new Error("创建临时题池失败");
  }

  const createdPoolRow = poolRow as unknown as TempPoolRow;

  const itemRows = items.map((item) => ({
    ...item,
    pool_id: createdPoolRow.id,
  }));

  const { error: itemError } = await params.supabase
    .from("agent_temp_question_pool_items")
    .insert(itemRows);

  if (itemError) {
    await params.supabase
      .from("agent_temp_question_pools")
      .delete()
      .eq("id", createdPoolRow.id)
      .eq("teacher_id", params.teacherId);
    throw new Error("写入临时题池题目失败");
  }

  const storedItems = await loadPoolItems({
    supabase: params.supabase,
    teacherId: params.teacherId,
    poolId: createdPoolRow.id,
  });

  return toTempQuestionPool({
    row: createdPoolRow,
    items: storedItems,
  });
}

export async function resolveRecentTempPoolUploadIds(
  params: ResolveRecentUploadsInput,
) {
  const fileNames = normalizeFileNames(params.fileNames);
  let query = params.supabase
    .from("pdf_scan_uploads")
    .select("id, file_name, created_at")
    .eq("teacher_id", params.teacherId)
    .eq("status", "completed")
    .not("scan_result", "is", null)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(params.limit ?? 5, 10)));

  if (fileNames.length > 0) {
    query = query.in("file_name", fileNames);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("读取最近扫描上传记录失败");
  }

  const rows = ((data ?? []) as Array<Pick<PdfScanUploadRow, "id" | "file_name">>).filter(
    (row) => cleanText(row.id),
  );

  if (rows.length === 0) {
    return [] as string[];
  }

  if (fileNames.length === 0) {
    return rows.map((row) => row.id);
  }

  const matchedIds = fileNames
    .map((fileName) => rows.find((row) => row.file_name === fileName)?.id ?? "")
    .filter(Boolean);

  return Array.from(new Set(matchedIds));
}

export async function getTempQuestionPool(params: {
  supabase: AppSupabase;
  teacherId: string;
  poolId?: string | null;
  conversationId?: string | null;
}) {
  let query = params.supabase
    .from("agent_temp_question_pools")
    .select(TEMP_POOL_SELECT)
    .eq("teacher_id", params.teacherId)
    .in("status", ["ready", "ready_with_review"]);

  if (params.poolId) {
    query = query.eq("id", params.poolId);
  } else if (params.conversationId) {
    query = query.eq("conversation_id", params.conversationId);
  } else {
    return null;
  }

  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("读取临时题池失败");
  }

  if (!data) {
    return null;
  }

  const poolRow = data as unknown as TempPoolRow;

  const items = await loadPoolItems({
    supabase: params.supabase,
    teacherId: params.teacherId,
    poolId: poolRow.id,
  });

  const pool = toTempQuestionPool({
    row: poolRow,
    items,
  });

  await params.supabase
    .from("agent_temp_question_pools")
    .update({
      last_used_at: new Date().toISOString(),
    })
    .eq("id", pool.id)
    .eq("teacher_id", params.teacherId);

  return pool;
}
