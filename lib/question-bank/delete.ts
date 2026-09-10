"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { removeContentLibrarySemanticIndexItems } from "@/lib/content-library/semantic-index";
import { KNOWLEDGE_DOCUMENT_UPLOAD_LINK_PREFIX } from "@/lib/question-bank/knowledge-auto-import";
import { removeExerciseSemanticIndexRows } from "@/lib/question-bank/semantic-index";
import type { Database, Json } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

type QuestionBankDeleteClient = {
  teacherId: string;
  supabase: AppSupabase;
};

type ExerciseDeleteRow = Pick<
  Database["public"]["Tables"]["exercises"]["Row"],
  | "id"
  | "import_batch_id"
  | "source_upload_id"
  | "solution_steps"
>;

type ContentLibraryExerciseRow = Pick<
  Database["public"]["Tables"]["content_library_items"]["Row"],
  "id" | "origin_entity_id"
>;

type ImportBatchRow = Pick<
  Database["public"]["Tables"]["exercise_import_batches"]["Row"],
  "id" | "label"
>;

type PdfScanUploadRow = Pick<
  Database["public"]["Tables"]["pdf_scan_uploads"]["Row"],
  "id" | "scan_result"
>;

type KnowledgeDocumentDeleteRow = Pick<
  Database["public"]["Tables"]["knowledge_documents"]["Row"],
  "id" | "storage_path" | "metadata"
>;

type ExerciseImportBatchDeleteRow = Pick<
  Database["public"]["Tables"]["exercise_import_batches"]["Row"],
  "id" | "label" | "source_kind"
>;

type PdfScanUploadDeleteRow = Pick<
  Database["public"]["Tables"]["pdf_scan_uploads"]["Row"],
  "id" | "storage_path" | "file_url"
>;

type AgentTempQuestionPoolItemDeleteRow = Pick<
  Database["public"]["Tables"]["agent_temp_question_pool_items"]["Row"],
  "id" | "pool_id" | "source_upload_id" | "source_file_name"
>;

export type QuestionBankMaterialDeleteTarget = {
  id: string;
  materialType: "knowledge_document" | "pdf_scan_upload" | "agent_generated_batch";
};

export type DeleteQuestionBankMaterialsResult = {
  deletedMaterialKeys: string[];
  missingMaterialKeys: string[];
  linkedUploadIds: string[];
  deletedExerciseIds: string[];
  deletedExerciseCount: number;
  deletedBatchIds: string[];
  deletedKnowledgeDocumentIds: string[];
  deletedPdfScanUploadIds: string[];
  removedWorksheetLinkCount: number;
  deletedContentLibraryItemIds: string[];
  cleanedTempPoolItemCount: number;
  deletedTempPoolIds: string[];
  updatedTempPoolIds: string[];
  removedStoragePathCount: number;
};

export type DeleteQuestionBankExercisesResult = {
  deletedIds: string[];
  missingIds: string[];
  removedWorksheetLinkCount: number;
  deletedContentLibraryItemIds: string[];
  deletedBatchIds: string[];
  updatedBatchIds: string[];
  updatedUploadIds: string[];
};

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function buildMaterialKey(target: QuestionBankMaterialDeleteTarget) {
  return `${target.materialType}:${target.id}`;
}

function uniqueMaterialTargets(targets: QuestionBankMaterialDeleteTarget[]) {
  const next = new Map<string, QuestionBankMaterialDeleteTarget>();
  targets.forEach((target) => {
    const id = target.id.trim();
    if (!id) return;
    next.set(buildMaterialKey({ ...target, id }), {
      ...target,
      id,
    });
  });
  return Array.from(next.values());
}

function asRecord(value: Json | null | undefined): Record<string, Json> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, Json>;
}

function extractKnowledgeDocumentScanUploadId(metadata: Json | null | undefined) {
  const metadataRecord = asRecord(metadata);
  const questionBankRecord = asRecord(metadataRecord?.questionBank);
  return typeof questionBankRecord?.scanUploadId === "string"
    ? questionBankRecord.scanUploadId
    : null;
}

function asNumberArray(value: Json | undefined) {
  if (!Array.isArray(value)) return [] as number[];
  return value
    .map((item) => (typeof item === "number" ? item : Number.parseInt(`${item ?? ""}`, 10)))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.floor(item));
}

function extractQuestionNumberFromSolution(solutionSteps: string | null | undefined) {
  const match = `${solutionSteps ?? ""}`.match(/题号\s*(\d+)/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function readExercisesByIds(
  client: QuestionBankDeleteClient,
  exerciseIds: string[],
) {
  if (exerciseIds.length === 0) return [] as ExerciseDeleteRow[];
  const { data, error } = await client.supabase
    .from("exercises")
    .select("id,import_batch_id,source_upload_id,solution_steps")
    .eq("teacher_id", client.teacherId)
    .in("id", exerciseIds);

  if (error) {
    throw new Error(`读取题目删除候选失败: ${error.message}`);
  }

  return (data ?? []) as ExerciseDeleteRow[];
}

async function readContentLibraryExerciseItems(
  client: QuestionBankDeleteClient,
  exerciseIds: string[],
) {
  if (exerciseIds.length === 0) return [] as ContentLibraryExerciseRow[];
  const { data, error } = await client.supabase
    .from("content_library_items")
    .select("id,origin_entity_id")
    .eq("teacher_id", client.teacherId)
    .eq("origin_entity_type", "exercise")
    .in("origin_entity_id", exerciseIds);

  if (error) {
    throw new Error(`读取内容库题目索引失败: ${error.message}`);
  }

  return (data ?? []) as ContentLibraryExerciseRow[];
}

async function readKnowledgeDocumentsByIds(
  client: QuestionBankDeleteClient,
  documentIds: string[],
) {
  const uniqueDocumentIds = uniqueIds(documentIds);
  if (uniqueDocumentIds.length === 0) return [] as KnowledgeDocumentDeleteRow[];

  const { data, error } = await client.supabase
    .from("knowledge_documents")
    .select("id,storage_path,metadata")
    .eq("teacher_id", client.teacherId)
    .in("id", uniqueDocumentIds);

  if (error) {
    throw new Error(`读取资料库文档删除候选失败: ${error.message}`);
  }

  return (data ?? []) as KnowledgeDocumentDeleteRow[];
}

async function readPdfScanUploadsByIds(
  client: QuestionBankDeleteClient,
  uploadIds: string[],
) {
  const uniqueUploadIds = uniqueIds(uploadIds);
  if (uniqueUploadIds.length === 0) return [] as PdfScanUploadDeleteRow[];

  const { data, error } = await client.supabase
    .from("pdf_scan_uploads")
    .select("id,storage_path,file_url")
    .eq("teacher_id", client.teacherId)
    .in("id", uniqueUploadIds);

  if (error) {
    throw new Error(`读取 PDF 拆题记录删除候选失败: ${error.message}`);
  }

  return (data ?? []) as PdfScanUploadDeleteRow[];
}

async function readImportBatchesByIds(
  client: QuestionBankDeleteClient,
  batchIds: string[],
) {
  const uniqueBatchIds = uniqueIds(batchIds);
  if (uniqueBatchIds.length === 0) return [] as ExerciseImportBatchDeleteRow[];

  const { data, error } = await client.supabase
    .from("exercise_import_batches")
    .select("id,label,source_kind")
    .eq("teacher_id", client.teacherId)
    .eq("source_kind", "agent_generated")
    .in("id", uniqueBatchIds);

  if (error) {
    throw new Error(`读取 AI 生成资料批次失败: ${error.message}`);
  }

  return (data ?? []) as ExerciseImportBatchDeleteRow[];
}

async function readLinkedPdfScanUploadsForDocuments(
  client: QuestionBankDeleteClient,
  documents: KnowledgeDocumentDeleteRow[],
) {
  if (documents.length === 0) return [] as PdfScanUploadDeleteRow[];

  const linkedUploadIds = uniqueIds(
    documents
      .map((document) => extractKnowledgeDocumentScanUploadId(document.metadata))
      .filter((value): value is string => typeof value === "string"),
  );
  const linkedUploadUrls = documents.map(
    (document) => `${KNOWLEDGE_DOCUMENT_UPLOAD_LINK_PREFIX}${document.id}`,
  );

  const [idRows, urlRows] = await Promise.all([
    linkedUploadIds.length > 0
      ? readPdfScanUploadsByIds(client, linkedUploadIds)
      : Promise.resolve([] as PdfScanUploadDeleteRow[]),
    linkedUploadUrls.length > 0
      ? client.supabase
          .from("pdf_scan_uploads")
          .select("id,storage_path,file_url")
          .eq("teacher_id", client.teacherId)
          .in("file_url", linkedUploadUrls)
          .then(({ data, error }) => {
            if (error) {
              throw new Error(`读取资料关联 PDF 拆题记录失败: ${error.message}`);
            }
            return (data ?? []) as PdfScanUploadDeleteRow[];
          })
      : Promise.resolve([] as PdfScanUploadDeleteRow[]),
  ]);

  const rows = new Map<string, PdfScanUploadDeleteRow>();
  [...idRows, ...urlRows].forEach((row) => rows.set(row.id, row));
  return Array.from(rows.values());
}

async function readExerciseIdsBySourceRefs(
  client: QuestionBankDeleteClient,
  documentIds: string[],
  uploadIds: string[],
  importBatchIds: string[] = [],
) {
  const uniqueDocumentIds = uniqueIds(documentIds);
  const uniqueUploadIds = uniqueIds(uploadIds);
  const uniqueImportBatchIds = uniqueIds(importBatchIds);

  const [documentRows, uploadRows, batchRows] = await Promise.all([
    uniqueDocumentIds.length > 0
      ? client.supabase
          .from("exercises")
          .select("id")
          .eq("teacher_id", client.teacherId)
          .in("source_document_id", uniqueDocumentIds)
      : Promise.resolve({ data: [] as Array<{ id: string }>, error: null }),
    uniqueUploadIds.length > 0
      ? client.supabase
          .from("exercises")
          .select("id")
          .eq("teacher_id", client.teacherId)
          .in("source_upload_id", uniqueUploadIds)
      : Promise.resolve({ data: [] as Array<{ id: string }>, error: null }),
    uniqueImportBatchIds.length > 0
      ? client.supabase
          .from("exercises")
          .select("id")
          .eq("teacher_id", client.teacherId)
          .in("import_batch_id", uniqueImportBatchIds)
      : Promise.resolve({ data: [] as Array<{ id: string }>, error: null }),
  ]);

  if (documentRows.error) {
    throw new Error(`读取资料关联题目失败: ${documentRows.error.message}`);
  }
  if (uploadRows.error) {
    throw new Error(`读取 PDF 拆题关联题目失败: ${uploadRows.error.message}`);
  }
  if (batchRows.error) {
    throw new Error(`读取 AI 生成批次关联题目失败: ${batchRows.error.message}`);
  }

  return uniqueIds([
    ...(documentRows.data ?? []).map((row) => row.id),
    ...(uploadRows.data ?? []).map((row) => row.id),
    ...(batchRows.data ?? []).map((row) => row.id),
  ]);
}

async function deleteImportBatchesBySourceRefs(
  client: QuestionBankDeleteClient,
  documentIds: string[],
  uploadIds: string[],
  explicitBatchIds: string[] = [],
) {
  const uniqueDocumentIds = uniqueIds(documentIds);
  const uniqueUploadIds = uniqueIds(uploadIds);
  const uniqueExplicitBatchIds = uniqueIds(explicitBatchIds);
  const deletedBatchIds = new Set<string>();

  if (uniqueDocumentIds.length > 0) {
    const { data, error } = await client.supabase
      .from("exercise_import_batches")
      .delete()
      .eq("teacher_id", client.teacherId)
      .in("source_document_id", uniqueDocumentIds)
      .select("id");

    if (error) {
      throw new Error(`删除资料关联导入批次失败: ${error.message}`);
    }
    (data ?? []).forEach((row) => deletedBatchIds.add(row.id));
  }

  if (uniqueUploadIds.length > 0) {
    const { data, error } = await client.supabase
      .from("exercise_import_batches")
      .delete()
      .eq("teacher_id", client.teacherId)
      .in("source_upload_id", uniqueUploadIds)
      .select("id");

    if (error) {
      throw new Error(`删除 PDF 拆题关联导入批次失败: ${error.message}`);
    }
    (data ?? []).forEach((row) => deletedBatchIds.add(row.id));
  }

  if (uniqueExplicitBatchIds.length > 0) {
    const { data, error } = await client.supabase
      .from("exercise_import_batches")
      .delete()
      .eq("teacher_id", client.teacherId)
      .in("id", uniqueExplicitBatchIds)
      .select("id");

    if (error) {
      throw new Error(`删除 AI 生成资料批次失败: ${error.message}`);
    }
    (data ?? []).forEach((row) => deletedBatchIds.add(row.id));
  }

  return Array.from(deletedBatchIds);
}

async function cleanupTempQuestionPoolUploads(
  client: QuestionBankDeleteClient,
  uploadIds: string[],
) {
  const uniqueUploadIds = uniqueIds(uploadIds);
  if (uniqueUploadIds.length === 0) {
    return {
      cleanedTempPoolItemCount: 0,
      deletedTempPoolIds: [] as string[],
      updatedTempPoolIds: [] as string[],
    };
  }

  const { data: poolItemRows, error: poolItemError } = await client.supabase
    .from("agent_temp_question_pool_items")
    .select("id,pool_id,source_upload_id,source_file_name")
    .eq("teacher_id", client.teacherId)
    .in("source_upload_id", uniqueUploadIds);

  if (poolItemError) {
    throw new Error(`读取临时题池关联项失败: ${poolItemError.message}`);
  }

  const items = (poolItemRows ?? []) as AgentTempQuestionPoolItemDeleteRow[];
  if (items.length === 0) {
    return {
      cleanedTempPoolItemCount: 0,
      deletedTempPoolIds: [] as string[],
      updatedTempPoolIds: [] as string[],
    };
  }

  const affectedPoolIds = uniqueIds(items.map((item) => item.pool_id));
  const itemIds = items.map((item) => item.id);

  const { error: deleteItemsError } = await client.supabase
    .from("agent_temp_question_pool_items")
    .delete()
    .eq("teacher_id", client.teacherId)
    .in("id", itemIds);

  if (deleteItemsError) {
    throw new Error(`删除临时题池关联项失败: ${deleteItemsError.message}`);
  }

  const { data: remainingRows, error: remainingError } = await client.supabase
    .from("agent_temp_question_pool_items")
    .select("pool_id,source_upload_id,source_file_name")
    .eq("teacher_id", client.teacherId)
    .in("pool_id", affectedPoolIds);

  if (remainingError) {
    throw new Error(`读取临时题池剩余项失败: ${remainingError.message}`);
  }

  const remainingByPool = new Map<
    string,
    Array<Pick<AgentTempQuestionPoolItemDeleteRow, "pool_id" | "source_upload_id" | "source_file_name">>
  >();

  (remainingRows ?? []).forEach((row) => {
    const bucket = remainingByPool.get(row.pool_id) ?? [];
    bucket.push({
      pool_id: row.pool_id,
      source_upload_id: row.source_upload_id,
      source_file_name: row.source_file_name,
    });
    remainingByPool.set(row.pool_id, bucket);
  });

  const deletedTempPoolIds: string[] = [];
  const updatedTempPoolIds: string[] = [];

  for (const poolId of affectedPoolIds) {
    const remainingItems = remainingByPool.get(poolId) ?? [];
    if (remainingItems.length === 0) {
      const { error } = await client.supabase
        .from("agent_temp_question_pools")
        .delete()
        .eq("teacher_id", client.teacherId)
        .eq("id", poolId);

      if (error) {
        throw new Error(`删除空临时题池失败: ${error.message}`);
      }
      deletedTempPoolIds.push(poolId);
      continue;
    }

    const nextUploadIds = uniqueIds(
      remainingItems
        .map((item) => item.source_upload_id)
        .filter((value): value is string => typeof value === "string"),
    );
    const nextFileNames = Array.from(
      new Set(
        remainingItems
          .map((item) => item.source_file_name.trim())
          .filter(Boolean),
      ),
    );

    const { error } = await client.supabase
      .from("agent_temp_question_pools")
      .update({
        source_upload_ids: nextUploadIds,
        source_file_names: nextFileNames,
        question_count: remainingItems.length,
        ready_question_count: remainingItems.length,
      })
      .eq("teacher_id", client.teacherId)
      .eq("id", poolId);

    if (error) {
      throw new Error(`更新临时题池引用失败: ${error.message}`);
    }
    updatedTempPoolIds.push(poolId);
  }

  return {
    cleanedTempPoolItemCount: items.length,
    deletedTempPoolIds,
    updatedTempPoolIds,
  };
}

async function deleteKnowledgeDocumentsByIds(
  client: QuestionBankDeleteClient,
  documentIds: string[],
) {
  const uniqueDocumentIds = uniqueIds(documentIds);
  if (uniqueDocumentIds.length === 0) return [] as string[];

  const { data, error } = await client.supabase
    .from("knowledge_documents")
    .delete()
    .eq("teacher_id", client.teacherId)
    .in("id", uniqueDocumentIds)
    .select("id");

  if (error) {
    throw new Error(`删除资料库文档失败: ${error.message}`);
  }

  return (data ?? []).map((row) => row.id);
}

async function deletePdfScanUploadsByIds(
  client: QuestionBankDeleteClient,
  uploadIds: string[],
) {
  const uniqueUploadIds = uniqueIds(uploadIds);
  if (uniqueUploadIds.length === 0) return [] as string[];

  const { data, error } = await client.supabase
    .from("pdf_scan_uploads")
    .delete()
    .eq("teacher_id", client.teacherId)
    .in("id", uniqueUploadIds)
    .select("id");

  if (error) {
    throw new Error(`删除 PDF 拆题资料失败: ${error.message}`);
  }

  return (data ?? []).map((row) => row.id);
}

async function removePdfStoragePaths(
  client: QuestionBankDeleteClient,
  storagePaths: Array<string | null | undefined>,
) {
  const uniquePaths = Array.from(
    new Set(
      storagePaths
        .map((path) => `${path ?? ""}`.trim())
        .filter(Boolean),
    ),
  );
  if (uniquePaths.length === 0) return 0;

  const { error } = await client.supabase.storage.from("pdfs").remove(uniquePaths);
  if (error) {
    console.error("删除资料源文件失败", error);
    return 0;
  }

  return uniquePaths.length;
}

async function updateImportBatchSummaries(
  client: QuestionBankDeleteClient,
  batchIds: string[],
) {
  const uniqueBatchIds = uniqueIds(batchIds);
  if (uniqueBatchIds.length === 0) {
    return {
      deletedBatchIds: [] as string[],
      updatedBatchIds: [] as string[],
      remainingBatchLabels: new Map<string, string>(),
    };
  }

  const [{ data: batchRows, error: batchError }, { data: remainingRows, error: remainingError }] =
    await Promise.all([
      client.supabase
        .from("exercise_import_batches")
        .select("id,label")
        .eq("teacher_id", client.teacherId)
        .in("id", uniqueBatchIds),
      client.supabase
        .from("exercises")
        .select("id,import_batch_id")
        .eq("teacher_id", client.teacherId)
        .in("import_batch_id", uniqueBatchIds),
    ]);

  if (batchError) {
    throw new Error(`读取导入批次失败: ${batchError.message}`);
  }
  if (remainingError) {
    throw new Error(`读取导入批次题目统计失败: ${remainingError.message}`);
  }

  const counts = new Map<string, number>();
  (remainingRows ?? []).forEach((row) => {
    if (!row.import_batch_id) return;
    counts.set(row.import_batch_id, (counts.get(row.import_batch_id) ?? 0) + 1);
  });

  const deletedBatchIds: string[] = [];
  const updatedBatchIds: string[] = [];
  const remainingBatchLabels = new Map<string, string>();

  for (const batch of (batchRows ?? []) as ImportBatchRow[]) {
    const count = counts.get(batch.id) ?? 0;
    if (count === 0) {
      const { error } = await client.supabase
        .from("exercise_import_batches")
        .delete()
        .eq("id", batch.id)
        .eq("teacher_id", client.teacherId);

      if (error) {
        throw new Error(`删除空导入批次失败: ${error.message}`);
      }
      deletedBatchIds.push(batch.id);
      continue;
    }

    const { error } = await client.supabase
      .from("exercise_import_batches")
      .update({ total_saved: count })
      .eq("id", batch.id)
      .eq("teacher_id", client.teacherId);

    if (error) {
      throw new Error(`更新导入批次统计失败: ${error.message}`);
    }
    updatedBatchIds.push(batch.id);
    remainingBatchLabels.set(batch.id, batch.label);
  }

  return {
    deletedBatchIds,
    updatedBatchIds,
    remainingBatchLabels,
  };
}

async function refreshPdfScanSaveSummaries(
  client: QuestionBankDeleteClient,
  uploadIds: string[],
  batchLabels: Map<string, string>,
) {
  const uniqueUploadIds = uniqueIds(uploadIds);
  if (uniqueUploadIds.length === 0) return [] as string[];

  const [{ data: uploadRows, error: uploadError }, { data: remainingRows, error: remainingError }] =
    await Promise.all([
      client.supabase
        .from("pdf_scan_uploads")
        .select("id,scan_result")
        .eq("teacher_id", client.teacherId)
        .in("id", uniqueUploadIds),
      client.supabase
        .from("exercises")
        .select("id,source_upload_id,import_batch_id,solution_steps")
        .eq("teacher_id", client.teacherId)
        .in("source_upload_id", uniqueUploadIds),
    ]);

  if (uploadError) {
    throw new Error(`读取 PDF 拆题记录失败: ${uploadError.message}`);
  }
  if (remainingError) {
    throw new Error(`读取 PDF 拆题剩余题目失败: ${remainingError.message}`);
  }

  const rowsByUpload = new Map<string, ExerciseDeleteRow[]>();
  (remainingRows ?? []).forEach((row) => {
    if (!row.source_upload_id) return;
    const bucket = rowsByUpload.get(row.source_upload_id) ?? [];
    bucket.push(row as ExerciseDeleteRow);
    rowsByUpload.set(row.source_upload_id, bucket);
  });

  const updatedUploadIds: string[] = [];

  for (const upload of (uploadRows ?? []) as PdfScanUploadRow[]) {
    const existingScanResult = asRecord(upload.scan_result) ?? {};
    const existingSaveSummary = asRecord(existingScanResult.saveSummary ?? null);
    const remainingExercises = rowsByUpload.get(upload.id) ?? [];

    if (!existingSaveSummary && remainingExercises.length === 0) {
      continue;
    }

    const remainingExerciseIds = remainingExercises.map((row) => row.id);
    const remainingQuestionNumbers = Array.from(
      new Set(
        remainingExercises
          .map((row) => extractQuestionNumberFromSolution(row.solution_steps))
          .filter((value): value is number => typeof value === "number"),
      ),
    ).sort((left, right) => left - right);
    const remainingBatchId =
      remainingExercises.find((row) => typeof row.import_batch_id === "string" && row.import_batch_id)?.import_batch_id ??
      null;
    const reviewPendingQuestionNumbers = asNumberArray(
      existingSaveSummary?.reviewPendingQuestionNumbers,
    );

    const nextSaveSummary =
      remainingExerciseIds.length === 0 && reviewPendingQuestionNumbers.length === 0
        ? null
        : {
            ...(existingSaveSummary ?? {}),
            status: "saved",
            savedCount: remainingExerciseIds.length,
            exerciseIds: remainingExerciseIds,
            savedQuestionNumbers: remainingQuestionNumbers,
            reviewPendingQuestionNumbers,
            importBatchId: remainingBatchId,
            importBatchLabel:
              remainingBatchId && batchLabels.has(remainingBatchId)
                ? batchLabels.get(remainingBatchId)
                : null,
            courseId:
              typeof existingSaveSummary?.courseId === "string"
                ? existingSaveSummary.courseId
                : null,
            courseLabel:
              typeof existingSaveSummary?.courseLabel === "string"
                ? existingSaveSummary.courseLabel
                : null,
            unitId:
              typeof existingSaveSummary?.unitId === "string"
                ? existingSaveSummary.unitId
                : null,
            unitLabel:
              typeof existingSaveSummary?.unitLabel === "string"
                ? existingSaveSummary.unitLabel
                : null,
            topicId:
              typeof existingSaveSummary?.topicId === "string"
                ? existingSaveSummary.topicId
                : null,
            savedAt: new Date().toISOString(),
          };

    const { error } = await client.supabase
      .from("pdf_scan_uploads")
      .update({
        scan_result: {
          ...existingScanResult,
          saveSummary: nextSaveSummary,
        } as Json,
      })
      .eq("id", upload.id)
      .eq("teacher_id", client.teacherId);

    if (error) {
      throw new Error(`回写 PDF 拆题保存摘要失败: ${error.message}`);
    }
    updatedUploadIds.push(upload.id);
  }

  return updatedUploadIds;
}

export async function deleteQuestionBankExercises(
  client: QuestionBankDeleteClient,
  exerciseIds: string[],
): Promise<DeleteQuestionBankExercisesResult> {
  const requestedIds = uniqueIds(exerciseIds);
  if (requestedIds.length === 0) {
    return {
      deletedIds: [],
      missingIds: [],
      removedWorksheetLinkCount: 0,
      deletedContentLibraryItemIds: [],
      deletedBatchIds: [],
      updatedBatchIds: [],
      updatedUploadIds: [],
    };
  }

  const existingRows = await readExercisesByIds(client, requestedIds);
  const existingIdSet = new Set(existingRows.map((row) => row.id));
  const missingIds = requestedIds.filter((id) => !existingIdSet.has(id));

  if (existingRows.length === 0) {
    return {
      deletedIds: [],
      missingIds,
      removedWorksheetLinkCount: 0,
      deletedContentLibraryItemIds: [],
      deletedBatchIds: [],
      updatedBatchIds: [],
      updatedUploadIds: [],
    };
  }

  const idsToDelete = existingRows.map((row) => row.id);
  const affectedBatchIds = existingRows
    .map((row) => row.import_batch_id)
    .filter((value): value is string => typeof value === "string");
  const affectedUploadIds = existingRows
    .map((row) => row.source_upload_id)
    .filter((value): value is string => typeof value === "string");
  const contentLibraryRows = await readContentLibraryExerciseItems(client, idsToDelete);
  const contentLibraryIds = contentLibraryRows.map((row) => row.id);

  const { data: removedWorksheetLinks, error: worksheetError } = await client.supabase
    .from("worksheet_exercises")
    .delete()
    .in("exercise_id", idsToDelete)
    .select("exercise_id");

  if (worksheetError) {
    throw new Error(`删除题目关联组卷记录失败: ${worksheetError.message}`);
  }

  const { data: deletedRows, error: deleteError } = await client.supabase
    .from("exercises")
    .delete()
    .eq("teacher_id", client.teacherId)
    .in("id", idsToDelete)
    .select("id");

  if (deleteError) {
    throw new Error(`删除题目失败: ${deleteError.message}`);
  }

  const deletedIds = (deletedRows ?? []).map((row) => row.id);
  if (deletedIds.length === 0) {
    return {
      deletedIds: [],
      missingIds,
      removedWorksheetLinkCount: (removedWorksheetLinks ?? []).length,
      deletedContentLibraryItemIds: [],
      deletedBatchIds: [],
      updatedBatchIds: [],
      updatedUploadIds: [],
    };
  }

  if (contentLibraryIds.length > 0) {
    const { error } = await client.supabase
      .from("content_library_items")
      .delete()
      .eq("teacher_id", client.teacherId)
      .in("id", contentLibraryIds);

    if (error) {
      throw new Error(`删除内容库题目索引失败: ${error.message}`);
    }

    await removeContentLibrarySemanticIndexItems({
      supabase: client.supabase,
      teacherId: client.teacherId,
      itemIds: contentLibraryIds,
    });
  }

  await removeExerciseSemanticIndexRows({
    supabase: client.supabase,
    teacherId: client.teacherId,
    exerciseIds: deletedIds,
  });

  const {
    deletedBatchIds,
    updatedBatchIds,
    remainingBatchLabels,
  } = await updateImportBatchSummaries(client, affectedBatchIds);
  const updatedUploadIds = await refreshPdfScanSaveSummaries(
    client,
    affectedUploadIds,
    remainingBatchLabels,
  );

  return {
    deletedIds,
    missingIds,
    removedWorksheetLinkCount: (removedWorksheetLinks ?? []).length,
    deletedContentLibraryItemIds: contentLibraryIds,
    deletedBatchIds,
    updatedBatchIds,
    updatedUploadIds,
  };
}

export async function deleteQuestionBankMaterials(
  client: QuestionBankDeleteClient,
  targets: QuestionBankMaterialDeleteTarget[],
): Promise<DeleteQuestionBankMaterialsResult> {
  const requestedTargets = uniqueMaterialTargets(targets);
  if (requestedTargets.length === 0) {
    return {
      deletedMaterialKeys: [],
      missingMaterialKeys: [],
      linkedUploadIds: [],
      deletedExerciseIds: [],
      deletedExerciseCount: 0,
      deletedBatchIds: [],
      deletedKnowledgeDocumentIds: [],
      deletedPdfScanUploadIds: [],
      removedWorksheetLinkCount: 0,
      deletedContentLibraryItemIds: [],
      cleanedTempPoolItemCount: 0,
      deletedTempPoolIds: [],
      updatedTempPoolIds: [],
      removedStoragePathCount: 0,
    };
  }

  const requestedDocumentIds = requestedTargets
    .filter((target) => target.materialType === "knowledge_document")
    .map((target) => target.id);
  const requestedUploadIds = requestedTargets
    .filter((target) => target.materialType === "pdf_scan_upload")
    .map((target) => target.id);
  const requestedBatchIds = requestedTargets
    .filter((target) => target.materialType === "agent_generated_batch")
    .map((target) => target.id);

  const [knowledgeDocumentRows, requestedUploadRows, requestedBatchRows] = await Promise.all([
    readKnowledgeDocumentsByIds(client, requestedDocumentIds),
    readPdfScanUploadsByIds(client, requestedUploadIds),
    readImportBatchesByIds(client, requestedBatchIds),
  ]);

  const linkedUploadRows = await readLinkedPdfScanUploadsForDocuments(
    client,
    knowledgeDocumentRows,
  );

  const existingMaterialKeys = new Set<string>();
  knowledgeDocumentRows.forEach((row) => {
    existingMaterialKeys.add(buildMaterialKey({ id: row.id, materialType: "knowledge_document" }));
  });
  requestedUploadRows.forEach((row) => {
    existingMaterialKeys.add(buildMaterialKey({ id: row.id, materialType: "pdf_scan_upload" }));
  });
  requestedBatchRows.forEach((row) => {
    existingMaterialKeys.add(
      buildMaterialKey({ id: row.id, materialType: "agent_generated_batch" }),
    );
  });

  const missingMaterialKeys = requestedTargets
    .map((target) => buildMaterialKey(target))
    .filter((key) => !existingMaterialKeys.has(key));

  const uploadRowsById = new Map<string, PdfScanUploadDeleteRow>();
  [...requestedUploadRows, ...linkedUploadRows].forEach((row) => uploadRowsById.set(row.id, row));

  const allDocumentIds = knowledgeDocumentRows.map((row) => row.id);
  const allUploadIds = Array.from(uploadRowsById.keys());
  const allImportBatchIds = requestedBatchRows.map((row) => row.id);
  const relatedExerciseIds = await readExerciseIdsBySourceRefs(
    client,
    allDocumentIds,
    allUploadIds,
    allImportBatchIds,
  );
  const exerciseDeleteResult = await deleteQuestionBankExercises(client, relatedExerciseIds);
  const deletedBatchIds = await deleteImportBatchesBySourceRefs(
    client,
    allDocumentIds,
    allUploadIds,
    allImportBatchIds,
  );
  const tempPoolCleanupResult = await cleanupTempQuestionPoolUploads(client, allUploadIds);
  const deletedKnowledgeDocumentIds = await deleteKnowledgeDocumentsByIds(client, allDocumentIds);
  const deletedPdfScanUploadIds = await deletePdfScanUploadsByIds(client, allUploadIds);
  const removedStoragePathCount = await removePdfStoragePaths(client, [
    ...knowledgeDocumentRows.map((row) => row.storage_path),
    ...Array.from(uploadRowsById.values()).map((row) => row.storage_path),
  ]);

  return {
    deletedMaterialKeys: requestedTargets
      .map((target) => buildMaterialKey(target))
      .filter((key) => !missingMaterialKeys.includes(key)),
    missingMaterialKeys,
    linkedUploadIds: linkedUploadRows.map((row) => row.id),
    deletedExerciseIds: exerciseDeleteResult.deletedIds,
    deletedExerciseCount: exerciseDeleteResult.deletedIds.length,
    deletedBatchIds: Array.from(
      new Set([...exerciseDeleteResult.deletedBatchIds, ...deletedBatchIds]),
    ),
    deletedKnowledgeDocumentIds,
    deletedPdfScanUploadIds,
    removedWorksheetLinkCount: exerciseDeleteResult.removedWorksheetLinkCount,
    deletedContentLibraryItemIds: exerciseDeleteResult.deletedContentLibraryItemIds,
    cleanedTempPoolItemCount: tempPoolCleanupResult.cleanedTempPoolItemCount,
    deletedTempPoolIds: tempPoolCleanupResult.deletedTempPoolIds,
    updatedTempPoolIds: tempPoolCleanupResult.updatedTempPoolIds,
    removedStoragePathCount,
  };
}
