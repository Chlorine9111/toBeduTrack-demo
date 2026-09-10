import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildWorksheetStats,
  resequenceQuestions,
  sortSections,
} from "@/components/main/question-bank/worksheet-editor/utils";
import type { WorksheetEditorDraft } from "@/components/main/question-bank/worksheet-editor/types";
import { syncContentAssetReference } from "@/lib/content-assets/sync-reference";
import { invalidateContentLibraryReadCache } from "@/lib/content-library/store";
import { syncContentLibrarySemanticIndexItems } from "@/lib/content-library/semantic-index";
import type { ContentLibraryClient } from "@/lib/content-library/store";
import {
  WORKSHEET_PROJECT_VERSION_HISTORY_LIMIT,
  WORKSHEET_PROJECT_SNAPSHOT_VERSION,
  type WorksheetProjectPayload,
  type WorksheetProjectSnapshot,
  type WorksheetProjectVersionEntry,
} from "@/lib/question-bank/worksheet-project-types";
import {
  deleteWorksheetProjectStoredAssets,
  extractWorksheetProjectStoredAssets,
  hydrateWorksheetProjectDraftAssets,
  uploadWorksheetProjectDataUrlAsset,
} from "@/lib/question-bank/worksheet-project-storage";
import type { Database, Json } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;
type ContentLibraryRow = Database["public"]["Tables"]["content_library_items"]["Row"];

const WORKSHEET_PROJECT_SELECT = [
  "id",
  "teacher_id",
  "renderer_type",
  "origin_key",
  "origin_entity_type",
  "origin_entity_id",
  "title",
  "summary_text",
  "snapshot",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toPositiveInteger(value: unknown) {
  const next = Number(value);
  if (!Number.isFinite(next)) return null;
  const normalized = Math.max(1, Math.round(next));
  return normalized;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}…` : value;
}

function normalizeWorksheetDraft(draft: WorksheetEditorDraft): WorksheetEditorDraft {
  const sections = sortSections(draft.sections).map((section, index) => ({
    ...section,
    order: index,
  }));
  return {
    ...draft,
    title: cleanText(draft.title) || "未命名组卷工程",
    description: `${draft.description ?? ""}`.trim(),
    duration: Number.isFinite(draft.duration) ? Math.max(0, Math.round(draft.duration)) : 0,
    sections,
    questions: resequenceQuestions(draft.questions, sections),
  };
}

function collectQuestionTags(draft: WorksheetEditorDraft) {
  return Array.from(
    new Set(
      draft.questions
        .flatMap((question) => [...(question.tags ?? []), ...(question.knowledgePoints ?? [])])
        .map((item) => cleanText(item))
        .filter(Boolean),
    ),
  ).slice(0, 24);
}

function resolvePrimaryCourse(draft: WorksheetEditorDraft) {
  const fromSubject = draft.questions
    .map((question) => cleanText(question.subject))
    .find(Boolean);
  if (fromSubject) return fromSubject;
  const fromTag = draft.questions
    .flatMap((question) => question.tags ?? [])
    .map((tag) => cleanText(tag))
    .find((tag) => /^ap\b/i.test(tag));
  return fromTag || null;
}

function buildWorksheetProjectSummary(draft: WorksheetEditorDraft) {
  const description = cleanText(draft.description);
  const stats = buildWorksheetStats(draft.questions);
  const tags = collectQuestionTags(draft).slice(0, 5);
  const statsLine = [
    `${stats.questionCount} 题`,
    `总分 ${stats.totalPoints} 分`,
    ...tags,
  ]
    .filter(Boolean)
    .join(" · ");
  return truncate([description, statsLine].filter(Boolean).join(" · "), 300) || null;
}

function buildWorksheetProjectSearchText(
  draft: WorksheetEditorDraft,
  summaryText: string | null,
) {
  const fragments = [
    cleanText(draft.title),
    cleanText(draft.description),
    summaryText,
    ...draft.sections.map((section) => cleanText(section.title)),
    ...draft.questions.slice(0, 18).map((question) => cleanText(question.questionText)),
    ...collectQuestionTags(draft),
  ].filter(Boolean);
  return truncate(fragments.join(" ").toLowerCase(), 8_000);
}

function buildWorksheetProjectMetadata(
  existingMetadata: Json | null,
  draft: WorksheetEditorDraft,
  savedAt: string,
  projectKey: string,
  pageCount: number | null,
  versionState: {
    stableVersionId: string;
    stableVersionNumber: number;
    versionHistory: WorksheetProjectVersionEntry[];
  },
) {
  const base =
    existingMetadata && typeof existingMetadata === "object" && !Array.isArray(existingMetadata)
      ? (existingMetadata as Record<string, unknown>)
      : {};
  const stats = buildWorksheetStats(draft.questions);
  return {
    ...base,
    worksheetProject: {
      snapshotVersion: WORKSHEET_PROJECT_SNAPSHOT_VERSION,
      projectKey,
      savedAt,
      questionCount: stats.questionCount,
      totalPoints: stats.totalPoints,
      sectionCount: draft.sections.length,
      blankBlockCount: draft.questions.filter((question) => question.isBlankBlock).length,
      pageCount,
      primaryCourse: resolvePrimaryCourse(draft),
      questionTags: collectQuestionTags(draft),
      stableVersionId: versionState.stableVersionId,
      stableVersionNumber: versionState.stableVersionNumber,
      versionHistory: versionState.versionHistory,
    },
  } as Json;
}

function buildWorksheetProjectSnapshot(
  draft: WorksheetEditorDraft,
  savedAt: string,
  pageCount: number | null,
): WorksheetProjectSnapshot {
  const stats = buildWorksheetStats(draft.questions);
  return {
    kind: "worksheet_project",
    version: WORKSHEET_PROJECT_SNAPSHOT_VERSION,
    savedAt,
    primaryCourse: resolvePrimaryCourse(draft),
    questionTags: collectQuestionTags(draft),
    stats: {
      questionCount: stats.questionCount,
      totalPoints: stats.totalPoints,
      sectionCount: draft.sections.length,
      blankBlockCount: draft.questions.filter((question) => question.isBlankBlock).length,
      pageCount,
    },
    draft,
  };
}

function parseWorksheetProjectSnapshot(snapshot: Json | null) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  if (Reflect.get(snapshot, "kind") !== "worksheet_project") {
    return null;
  }
  const draft = Reflect.get(snapshot, "draft");
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    return null;
  }
  return snapshot as unknown as WorksheetProjectSnapshot;
}

function parseWorksheetProjectVersionEntry(raw: unknown): WorksheetProjectVersionEntry | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  const snapshot = parseWorksheetProjectSnapshot((raw.snapshot ?? null) as Json | null);
  const versionNumber = toPositiveInteger(raw.versionNumber);
  const id = cleanText(typeof raw.id === "string" ? raw.id : null);
  const title = cleanText(typeof raw.title === "string" ? raw.title : null);
  const savedAt = cleanText(typeof raw.savedAt === "string" ? raw.savedAt : null);
  if (!snapshot || !versionNumber || !id || !title || !savedAt) {
    return null;
  }
  return {
    id,
    versionNumber,
    savedAt,
    title,
    summaryText: cleanText(typeof raw.summaryText === "string" ? raw.summaryText : null) || null,
    snapshot,
  };
}

function normalizeWorksheetProjectVersionHistory(entries: WorksheetProjectVersionEntry[]) {
  const seenIds = new Set<string>();
  const seenNumbers = new Set<number>();
  const next: WorksheetProjectVersionEntry[] = [];

  for (const entry of entries) {
    if (seenIds.has(entry.id) || seenNumbers.has(entry.versionNumber)) {
      continue;
    }
    seenIds.add(entry.id);
    seenNumbers.add(entry.versionNumber);
    next.push(entry);
  }

  return next
    .sort((left, right) => right.versionNumber - left.versionNumber)
    .slice(0, WORKSHEET_PROJECT_VERSION_HISTORY_LIMIT);
}

function buildWorksheetProjectVersionEntry(params: {
  id?: string;
  versionNumber: number;
  savedAt: string;
  title: string;
  summaryText: string | null;
  snapshot: WorksheetProjectSnapshot;
}): WorksheetProjectVersionEntry {
  return {
    id: cleanText(params.id) || crypto.randomUUID(),
    versionNumber: params.versionNumber,
    savedAt: params.savedAt,
    title: params.title,
    summaryText: params.summaryText,
    snapshot: params.snapshot,
  };
}

function readWorksheetProjectVersionState(params: {
  row: Pick<ContentLibraryRow, "id" | "metadata"> | null;
}) {
  const base = isPlainObject(params.row?.metadata)
    ? (params.row!.metadata as Record<string, unknown>)
    : null;
  const worksheetProjectMeta = isPlainObject(base?.worksheetProject)
    ? (base!.worksheetProject as Record<string, unknown>)
    : null;
  const stableVersionId =
    cleanText(typeof worksheetProjectMeta?.stableVersionId === "string"
      ? worksheetProjectMeta.stableVersionId
      : null) || (params.row ? `${params.row.id}:v1` : crypto.randomUUID());
  const stableVersionNumber =
    toPositiveInteger(worksheetProjectMeta?.stableVersionNumber) ?? (params.row ? 1 : 0);
  const versionHistory = normalizeWorksheetProjectVersionHistory(
    Array.isArray(worksheetProjectMeta?.versionHistory)
      ? worksheetProjectMeta.versionHistory
          .map((entry) => parseWorksheetProjectVersionEntry(entry))
          .filter((entry): entry is WorksheetProjectVersionEntry => Boolean(entry))
      : [],
  );

  return {
    stableVersionId,
    stableVersionNumber,
    versionHistory,
  };
}

function collectWorksheetProjectAssetKeysFromHistory(
  entries: WorksheetProjectVersionEntry[],
) {
  const keys = new Set<string>();
  for (const entry of entries) {
    for (const asset of extractWorksheetProjectStoredAssets(entry.snapshot.draft)) {
      keys.add(`${asset.bucket}:${asset.path}`);
    }
  }
  return keys;
}

function isConstraintRetryable(error: { message?: string | null; details?: string | null } | null) {
  if (!error) return false;
  const combined = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return combined.includes("content_library_items_renderer_type_check")
    || combined.includes("content_library_items_origin_entity_type_check");
}

function toPayload(
  row: Pick<ContentLibraryRow, "id" | "title" | "summary_text" | "updated_at" | "metadata">,
  draft: WorksheetEditorDraft,
): WorksheetProjectPayload {
  const versionState = readWorksheetProjectVersionState({ row });
  return {
    projectId: row.id,
    title: row.title,
    savedAt: row.updated_at,
    summaryText: row.summary_text,
    stableVersionNumber: versionState.stableVersionNumber,
    draft,
  };
}

async function readOwnedWorksheetProjectRow(
  client: ContentLibraryClient,
  projectId: string,
) {
  const { data, error } = await client.supabase
    .from("content_library_items")
    .select(WORKSHEET_PROJECT_SELECT)
    .eq("teacher_id", client.teacherId)
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error("读取组卷工程失败");
  }
  return (data as ContentLibraryRow | null) ?? null;
}

async function persistWorksheetProjectAssets(params: {
  draft: WorksheetEditorDraft;
  teacherId: string;
  projectKey: string;
}) {
  const nextDraft = normalizeWorksheetDraft(params.draft);
  const uploadedAssets = [] as NonNullable<
    ReturnType<typeof extractWorksheetProjectStoredAssets>
  >;

  for (const question of nextDraft.questions) {
    const url = cleanText(question.stimulusImageUrl);
    if (!url) {
      question.stimulusImageUrl = null;
      question.stimulusImageAsset = null;
      continue;
    }
    if (url.startsWith("data:")) {
      const asset = await uploadWorksheetProjectDataUrlAsset({
        teacherId: params.teacherId,
        projectKey: params.projectKey,
        questionId: question.id,
        dataUrl: url,
      });
      uploadedAssets.push(asset);
      question.stimulusImageAsset = asset;
      question.stimulusImageUrl = null;
      continue;
    }
    if (question.stimulusImageAsset?.bucket && question.stimulusImageAsset.path) {
      question.stimulusImageUrl = null;
      continue;
    }
    if (!/^https?:\/\//i.test(url)) {
      question.stimulusImageUrl = null;
    }
  }

  return {
    draft: nextDraft,
    uploadedAssets,
  };
}

async function insertWorksheetProjectRow(params: {
  client: ContentLibraryClient;
  projectKey: string;
  title: string;
  summaryText: string | null;
  searchText: string;
  snapshot: WorksheetProjectSnapshot;
  metadata: Json;
}) {
  const candidates = [
    { rendererType: "worksheet_project", originEntityType: "worksheet_project" },
    { rendererType: "worksheet_project", originEntityType: "assistant_message" },
    { rendererType: "markdown", originEntityType: "assistant_message" },
  ] as const;

  let lastError: { message?: string | null; details?: string | null } | null = null;

  for (const candidate of candidates) {
    const payload: Database["public"]["Tables"]["content_library_items"]["Insert"] = {
      teacher_id: params.client.teacherId,
      content_type: "other",
      renderer_type: candidate.rendererType,
      origin_key: `worksheet_project:${params.projectKey}`,
      origin_entity_type: candidate.originEntityType,
      origin_entity_id: params.projectKey,
      title: params.title,
      custom_title: params.title,
      summary_text: params.summaryText,
      search_text: params.searchText,
      snapshot: params.snapshot as unknown as Json,
      metadata: params.metadata,
    };
    const { data, error } = await params.client.supabase
      .from("content_library_items")
      .insert(payload)
      .select(WORKSHEET_PROJECT_SELECT)
      .single();

    if (!error && data) {
      return data as unknown as ContentLibraryRow;
    }
    if (!isConstraintRetryable(error)) {
      throw new Error("保存组卷工程失败");
    }
    lastError = error;
  }

  if (lastError) {
    throw new Error("保存组卷工程失败");
  }
  throw new Error("保存组卷工程失败");
}

async function syncWorksheetProjectSideEffects(params: {
  supabase: AppSupabase;
  teacherId: string;
  itemId: string;
  title: string;
  summaryText: string | null;
}) {
  try {
    await syncContentLibrarySemanticIndexItems({
      supabase: params.supabase,
      teacherId: params.teacherId,
      itemIds: [params.itemId],
    });
  } catch (error) {
    console.error("[worksheet-project] 同步内容库语义索引失败", {
      itemId: params.itemId,
      teacherId: params.teacherId,
      message: error instanceof Error ? error.message : "unknown",
    });
  }

  await syncContentAssetReference({
    supabase: params.supabase,
    teacherId: params.teacherId,
    refEntityType: "content_library_item",
    refEntityId: params.itemId,
    contentLibraryItemId: params.itemId,
    title: params.title,
    fileName: params.title,
    rawText: params.summaryText ?? undefined,
  });
}

export async function getWorksheetProject(
  client: ContentLibraryClient,
  projectId: string,
) {
  const row = await readOwnedWorksheetProjectRow(client, projectId);
  if (!row) {
    throw new Error("ITEM_NOT_FOUND");
  }
  const snapshot = parseWorksheetProjectSnapshot(row.snapshot);
  if (!snapshot) {
    throw new Error("ITEM_NOT_FOUND");
  }
  const draft = await hydrateWorksheetProjectDraftAssets(snapshot.draft);
  return toPayload(row, draft);
}

export async function restoreWorksheetProjectVersion(
  client: ContentLibraryClient,
  input: {
    projectId: string;
    targetVersionNumber: number;
  },
) {
  const row = await readOwnedWorksheetProjectRow(client, input.projectId);
  if (!row) {
    throw new Error("ITEM_NOT_FOUND");
  }

  const currentSnapshot = parseWorksheetProjectSnapshot(row.snapshot);
  if (!currentSnapshot) {
    throw new Error("ITEM_NOT_FOUND");
  }

  const versionState = readWorksheetProjectVersionState({
    row: {
      id: row.id,
      metadata: row.metadata,
    },
  });

  if (input.targetVersionNumber === versionState.stableVersionNumber) {
    const draft = await hydrateWorksheetProjectDraftAssets(currentSnapshot.draft);
    return toPayload(row, draft);
  }

  const targetVersion = versionState.versionHistory.find(
    (entry) => entry.versionNumber === input.targetVersionNumber,
  );
  if (!targetVersion) {
    throw new Error("VERSION_NOT_FOUND");
  }

  const restoredSnapshot = targetVersion.snapshot;
  const restoredDraft = restoredSnapshot.draft;
  const restoredTitle = targetVersion.title;
  const restoredSummaryText =
    targetVersion.summaryText ?? buildWorksheetProjectSummary(restoredDraft);
  const nextVersionState = {
    stableVersionId: crypto.randomUUID(),
    stableVersionNumber: versionState.stableVersionNumber + 1,
    versionHistory: normalizeWorksheetProjectVersionHistory([
      buildWorksheetProjectVersionEntry({
        id: versionState.stableVersionId,
        versionNumber: versionState.stableVersionNumber,
        savedAt: currentSnapshot.savedAt || row.updated_at,
        title: row.title,
        summaryText: row.summary_text,
        snapshot: currentSnapshot,
      }),
      ...versionState.versionHistory,
    ]),
  };
  const restoredPageCount = restoredSnapshot.stats.pageCount ?? null;
  const restoredMetadata = buildWorksheetProjectMetadata(
    row.metadata,
    restoredDraft,
    new Date().toISOString(),
    cleanText(row.origin_entity_id) || cleanText(row.id) || crypto.randomUUID(),
    restoredPageCount,
    nextVersionState,
  );
  const restoredSearchText = buildWorksheetProjectSearchText(
    restoredDraft,
    restoredSummaryText,
  );

  const { data, error } = await client.supabase
    .from("content_library_items")
    .update({
      title: restoredTitle,
      custom_title: restoredTitle,
      summary_text: restoredSummaryText,
      search_text: restoredSearchText,
      snapshot: restoredSnapshot as unknown as Json,
      metadata: restoredMetadata,
    })
    .eq("teacher_id", client.teacherId)
    .eq("id", row.id)
    .select(WORKSHEET_PROJECT_SELECT)
    .single();

  if (error) {
    throw new Error("恢复组卷工程失败");
  }

  invalidateContentLibraryReadCache(client.teacherId);
  await syncWorksheetProjectSideEffects({
    supabase: client.supabase,
    teacherId: client.teacherId,
    itemId: row.id,
    title: restoredTitle,
    summaryText: restoredSummaryText,
  });

  const retainedHistoryKeys = collectWorksheetProjectAssetKeysFromHistory(
    nextVersionState.versionHistory,
  );
  const restoredKeys = new Set(
    extractWorksheetProjectStoredAssets(restoredDraft).map(
      (asset) => `${asset.bucket}:${asset.path}`,
    ),
  );
  const staleAssets = extractWorksheetProjectStoredAssets(currentSnapshot.draft).filter(
    (asset) => {
      const key = `${asset.bucket}:${asset.path}`;
      return !restoredKeys.has(key) && !retainedHistoryKeys.has(key);
    },
  );
  if (staleAssets.length > 0) {
    deleteWorksheetProjectStoredAssets(staleAssets).catch((cleanupError) => {
      console.error("[worksheet-project] 恢复后清理旧图片失败", {
        teacherId: client.teacherId,
        projectId: row.id,
        message:
          cleanupError instanceof Error ? cleanupError.message : "unknown",
      });
    });
  }

  const nextRow = (data as unknown as ContentLibraryRow | null) ?? null;
  if (!nextRow) {
    throw new Error("恢复组卷工程失败");
  }
  const hydratedDraft = await hydrateWorksheetProjectDraftAssets(restoredDraft);
  return toPayload(nextRow, hydratedDraft);
}

export async function saveWorksheetProject(
  client: ContentLibraryClient,
  input: {
    projectId?: string | null;
    draft: WorksheetEditorDraft;
    pageCount?: number | null;
  },
) {
  const existingRow = input.projectId
    ? await readOwnedWorksheetProjectRow(client, input.projectId)
    : null;
  if (input.projectId && !existingRow) {
    throw new Error("ITEM_NOT_FOUND");
  }

  const existingSnapshot = parseWorksheetProjectSnapshot(existingRow?.snapshot ?? null);
  const existingVersionState = readWorksheetProjectVersionState({
    row: existingRow
      ? {
          id: existingRow.id,
          metadata: existingRow.metadata,
        }
      : null,
  });
  const previousDraft = existingSnapshot?.draft ?? null;
  const projectKey =
    cleanText(existingRow?.origin_entity_id) ||
    cleanText(existingRow?.id) ||
    crypto.randomUUID();
  const uploadedAssets = [] as ReturnType<typeof extractWorksheetProjectStoredAssets>;

  try {
    const persistedAssets = await persistWorksheetProjectAssets({
      draft: input.draft,
      teacherId: client.teacherId,
      projectKey,
    });
    uploadedAssets.push(...persistedAssets.uploadedAssets);

    const savedAt = new Date().toISOString();
    const normalizedDraft = persistedAssets.draft;
    const title = truncate(cleanText(normalizedDraft.title) || "未命名组卷工程", 160);
    const summaryText = buildWorksheetProjectSummary(normalizedDraft);
    const searchText = buildWorksheetProjectSearchText(normalizedDraft, summaryText);
    const pageCount =
      typeof input.pageCount === "number" && Number.isFinite(input.pageCount)
        ? Math.max(1, Math.round(input.pageCount))
        : existingSnapshot?.stats.pageCount ?? null;
    const snapshot = buildWorksheetProjectSnapshot(normalizedDraft, savedAt, pageCount);
    const previousStableEntry =
      existingRow && existingSnapshot
        ? buildWorksheetProjectVersionEntry({
            id: existingVersionState.stableVersionId,
            versionNumber: existingVersionState.stableVersionNumber,
            savedAt: existingSnapshot.savedAt || existingRow.updated_at,
            title: existingRow.title,
            summaryText: existingRow.summary_text,
            snapshot: existingSnapshot,
          })
        : null;
    const nextVersionState = {
      stableVersionId: crypto.randomUUID(),
      stableVersionNumber: existingRow
        ? existingVersionState.stableVersionNumber + 1
        : 1,
      versionHistory: normalizeWorksheetProjectVersionHistory(
        previousStableEntry
          ? [previousStableEntry, ...existingVersionState.versionHistory]
          : existingVersionState.versionHistory,
      ),
    };
    const metadata = buildWorksheetProjectMetadata(
      existingRow?.metadata ?? null,
      normalizedDraft,
      savedAt,
      projectKey,
      pageCount,
      nextVersionState,
    );

    let row: ContentLibraryRow | null = null;
    if (existingRow) {
      const updateResult = await client.supabase
        .from("content_library_items")
        .update({
          title,
          custom_title: title,
          summary_text: summaryText,
          search_text: searchText,
          snapshot: snapshot as unknown as Json,
          metadata,
        })
        .eq("teacher_id", client.teacherId)
        .eq("id", existingRow.id)
        .select(WORKSHEET_PROJECT_SELECT)
        .single();
      if (updateResult.error) {
        throw new Error("保存组卷工程失败");
      }
      row = (updateResult.data as unknown as ContentLibraryRow | null) ?? null;
    } else {
      row = await insertWorksheetProjectRow({
        client,
        projectKey,
        title,
        summaryText,
        searchText,
        snapshot,
        metadata,
      });
    }

    if (!row) {
      throw new Error("保存组卷工程失败");
    }

    invalidateContentLibraryReadCache(client.teacherId);
    await syncWorksheetProjectSideEffects({
      supabase: client.supabase,
      teacherId: client.teacherId,
      itemId: row.id,
      title,
      summaryText,
    });

    const currentAssets = extractWorksheetProjectStoredAssets(normalizedDraft);
    const previousAssets = extractWorksheetProjectStoredAssets(previousDraft);
    const currentKeys = new Set(currentAssets.map((asset) => `${asset.bucket}:${asset.path}`));
    const retainedHistoryKeys = collectWorksheetProjectAssetKeysFromHistory(
      nextVersionState.versionHistory,
    );
    const staleAssets = previousAssets.filter(
      (asset) => {
        const key = `${asset.bucket}:${asset.path}`;
        return !currentKeys.has(key) && !retainedHistoryKeys.has(key);
      },
    );
    if (staleAssets.length > 0) {
      deleteWorksheetProjectStoredAssets(staleAssets).catch((error) => {
        console.error("[worksheet-project] 清理旧图片失败", {
          teacherId: client.teacherId,
          projectId: row.id,
          message: error instanceof Error ? error.message : "unknown",
        });
      });
    }

    const hydratedDraft = await hydrateWorksheetProjectDraftAssets(normalizedDraft);
    return toPayload(row, hydratedDraft);
  } catch (error) {
    if (uploadedAssets.length > 0) {
      await deleteWorksheetProjectStoredAssets(uploadedAssets).catch(() => undefined);
    }
    throw error;
  }
}
