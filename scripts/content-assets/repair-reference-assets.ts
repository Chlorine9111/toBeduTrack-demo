import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type ReferenceAssetRow = {
  id: string;
  teacher_id: string;
  ref_entity_type: string | null;
  ref_entity_id: string | null;
  content_library_item_id: string | null;
  title: string;
  raw_text: string | null;
  course_id: string | null;
  unit_id: string | null;
  course_label: string | null;
  unit_label: string | null;
  storage_path: string | null;
  storage_bucket: string | null;
  file_name: string | null;
  file_type: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  page_count: number | null;
};

type ContentLibraryItemRow = {
  id: string;
  teacher_id: string;
  origin_entity_type: string;
  origin_entity_id: string | null;
  title: string;
  custom_title: string | null;
  note: string | null;
  summary_text: string | null;
  course_id: string | null;
  unit_id: string | null;
  course_label: string | null;
  unit_label: string | null;
};

type RepairAction =
  | {
      kind: "keep";
      assetId: string;
      reason: string;
    }
  | {
      kind: "update";
      assetId: string;
      reason: string;
      payload: Record<string, unknown>;
    }
  | {
      kind: "delete";
      assetId: string;
      reason: string;
    };

const LEGACY_LIBRARY_REF_TYPES = new Set([
  "rubric",
  "lesson_plan",
  "exercise",
  "pbl_project_plan",
]);

function parseArgs(argv: string[]) {
  const write = argv.includes("--write");
  const teacherArg = argv.find((item) => item.startsWith("--teacher="));
  const teacherId = teacherArg ? teacherArg.split("=")[1]?.trim() || null : null;

  return {
    write,
    dryRun: !write,
    teacherId,
  };
}

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function buildSearchText(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => cleanText(part))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function listReferenceAssets(teacherId: string | null) {
  const db = createAdminSupabaseClient();
  const rows: ReferenceAssetRow[] = [];
  const pageSize = 500;
  let from = 0;

  while (true) {
    let query = db
      .from("content_assets")
      .select([
        "id",
        "teacher_id",
        "ref_entity_type",
        "ref_entity_id",
        "content_library_item_id",
        "title",
        "raw_text",
        "course_id",
        "unit_id",
        "course_label",
        "unit_label",
        "storage_path",
        "storage_bucket",
        "file_name",
        "file_type",
        "mime_type",
        "file_size_bytes",
        "page_count",
      ].join(", "))
      .eq("asset_source", "reference")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (teacherId) {
      query = query.eq("teacher_id", teacherId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`读取 reference assets 失败: ${error.message}`);
    }

    const batch = (data ?? []) as unknown as ReferenceAssetRow[];
    rows.push(...batch);

    if (batch.length < pageSize) {
      break;
    }

    from += batch.length;
  }

  return rows;
}

async function listContentLibraryItems(params: {
  teacherId: string | null;
  contentLibraryItemIds: string[];
  legacyOrigins: Array<{ originEntityType: string; originEntityId: string }>;
}) {
  const db = createAdminSupabaseClient();
  const items: ContentLibraryItemRow[] = [];

  const uniqueIds = Array.from(
    new Set(params.contentLibraryItemIds.map((value) => value.trim()).filter(Boolean)),
  );

  for (const batch of chunk(uniqueIds, 200)) {
    let query = db
      .from("content_library_items")
      .select([
        "id",
        "teacher_id",
        "origin_entity_type",
        "origin_entity_id",
        "title",
        "custom_title",
        "note",
        "summary_text",
        "course_id",
        "unit_id",
        "course_label",
        "unit_label",
      ].join(", "))
      .in("id", batch);

    if (params.teacherId) {
      query = query.eq("teacher_id", params.teacherId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`按内容库 ID 读取内容失败: ${error.message}`);
    }

    items.push(...((data ?? []) as unknown as ContentLibraryItemRow[]));
  }

  const groupedOrigins = new Map<string, string[]>();
  for (const origin of params.legacyOrigins) {
    const bucket = groupedOrigins.get(origin.originEntityType) ?? [];
    bucket.push(origin.originEntityId);
    groupedOrigins.set(origin.originEntityType, bucket);
  }

  for (const [originEntityType, originEntityIds] of groupedOrigins.entries()) {
    for (const batch of chunk(Array.from(new Set(originEntityIds)), 200)) {
      let query = db
        .from("content_library_items")
        .select([
          "id",
          "teacher_id",
          "origin_entity_type",
          "origin_entity_id",
          "title",
          "custom_title",
          "note",
          "summary_text",
          "course_id",
          "unit_id",
          "course_label",
          "unit_label",
        ].join(", "))
        .eq("origin_entity_type", originEntityType)
        .in("origin_entity_id", batch);

      if (params.teacherId) {
        query = query.eq("teacher_id", params.teacherId);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(`按 origin 读取内容失败: ${error.message}`);
      }

      items.push(...((data ?? []) as unknown as ContentLibraryItemRow[]));
    }
  }

  return items;
}

function buildItemById(items: ContentLibraryItemRow[]) {
  return new Map(items.map((item) => [item.id, item]));
}

function buildItemByOrigin(items: ContentLibraryItemRow[]) {
  return new Map(
    items
      .filter((item) => typeof item.origin_entity_id === "string" && item.origin_entity_id.trim())
      .map((item) => [
        `${item.teacher_id}:${item.origin_entity_type}:${item.origin_entity_id!.trim()}`,
        item,
      ]),
  );
}

function resolveLibraryItem(
  row: ReferenceAssetRow,
  itemById: Map<string, ContentLibraryItemRow>,
  itemByOrigin: Map<string, ContentLibraryItemRow>,
) {
  if (row.content_library_item_id?.trim()) {
    const item = itemById.get(row.content_library_item_id.trim());
    if (item && item.teacher_id === row.teacher_id) {
      return item;
    }
  }

  if (row.ref_entity_type === "content_library_item" && row.ref_entity_id?.trim()) {
    const item = itemById.get(row.ref_entity_id.trim());
    if (item && item.teacher_id === row.teacher_id) {
      return item;
    }
  }

  if (
    row.ref_entity_type &&
    LEGACY_LIBRARY_REF_TYPES.has(row.ref_entity_type) &&
    row.ref_entity_id?.trim()
  ) {
    return (
      itemByOrigin.get(
        `${row.teacher_id}:${row.ref_entity_type}:${row.ref_entity_id.trim()}`,
      ) ?? null
    );
  }

  return null;
}

function buildCanonicalUpdatePayload(
  row: ReferenceAssetRow,
  item: ContentLibraryItemRow,
) {
  const title = cleanText(item.custom_title) || cleanText(item.title) || cleanText(row.title) || "未命名引用";

  return {
    ref_entity_type: "content_library_item",
    ref_entity_id: item.id,
    content_library_item_id: item.id,
    title,
    search_text: buildSearchText([
      title,
      item.note,
      item.summary_text,
      item.course_label,
      item.unit_label,
    ]),
    course_id: item.course_id,
    unit_id: item.unit_id,
    course_label: item.course_label,
    unit_label: item.unit_label,
    storage_path: null,
    storage_bucket: null,
    file_name: null,
    file_type: null,
    mime_type: null,
    file_size_bytes: null,
    page_count: null,
  };
}

function needsCanonicalUpdate(
  row: ReferenceAssetRow,
  item: ContentLibraryItemRow,
  payload: Record<string, unknown>,
) {
  return (
    row.ref_entity_type !== "content_library_item" ||
    row.ref_entity_id !== item.id ||
    row.content_library_item_id !== item.id ||
    row.title !== payload.title ||
    row.course_id !== payload.course_id ||
    row.unit_id !== payload.unit_id ||
    row.course_label !== payload.course_label ||
    row.unit_label !== payload.unit_label ||
    row.storage_path !== null ||
    row.storage_bucket !== null ||
    row.file_name !== null ||
    row.file_type !== null ||
    row.mime_type !== null ||
    row.file_size_bytes !== null ||
    row.page_count !== null
  );
}

function planRepairActions(rows: ReferenceAssetRow[], items: ContentLibraryItemRow[]) {
  const itemById = buildItemById(items);
  const itemByOrigin = buildItemByOrigin(items);

  return rows.map((row): RepairAction => {
    if (row.ref_entity_type === "flashcard_set" && row.ref_entity_id?.trim()) {
      const flashcardNeedsCleanup =
        row.storage_path !== null ||
        row.storage_bucket !== null ||
        row.file_name !== null ||
        row.file_type !== null ||
        row.mime_type !== null ||
        row.file_size_bytes !== null ||
        row.page_count !== null;

      if (flashcardNeedsCleanup) {
        return {
          kind: "update",
          assetId: row.id,
          reason: "清理 flashcard_set 引用的伪文件字段",
          payload: {
            storage_path: null,
            storage_bucket: null,
            file_name: null,
            file_type: null,
            mime_type: null,
            file_size_bytes: null,
            page_count: null,
          },
        };
      }

      return {
        kind: "keep",
        assetId: row.id,
        reason: "flashcard_set special case",
      };
    }

    const item = resolveLibraryItem(row, itemById, itemByOrigin);
    if (!item) {
      return {
        kind: "delete",
        assetId: row.id,
        reason: row.ref_entity_type
          ? `无法映射 ${row.ref_entity_type}:${row.ref_entity_id ?? "null"}`
          : "缺少 ref_entity_type/content_library_item_id",
      };
    }

    const payload = buildCanonicalUpdatePayload(row, item);
    if (!needsCanonicalUpdate(row, item, payload)) {
      return {
        kind: "keep",
        assetId: row.id,
        reason: "已是 canonical content_library_item 引用",
      };
    }

    return {
      kind: "update",
      assetId: row.id,
      reason: `修正为 content_library_item:${item.id}`,
      payload,
    };
  });
}

async function applyActions(actions: RepairAction[]) {
  const db = createAdminSupabaseClient();
  const updates = actions.filter((action) => action.kind === "update");
  const deletes = actions.filter((action) => action.kind === "delete");

  for (const action of updates) {
    const { error } = await db
      .from("content_assets")
      .update(action.payload)
      .eq("id", action.assetId);

    if (error) {
      throw new Error(`更新资产 ${action.assetId} 失败: ${error.message}`);
    }
  }

  for (const batch of chunk(deletes.map((action) => action.assetId), 200)) {
    const { error } = await db
      .from("content_assets")
      .delete()
      .in("id", batch);

    if (error) {
      throw new Error(`删除坏资产失败: ${error.message}`);
    }
  }
}

function buildSummary(rows: ReferenceAssetRow[], actions: RepairAction[]) {
  const byKind = {
    keep: actions.filter((action) => action.kind === "keep").length,
    update: actions.filter((action) => action.kind === "update").length,
    delete: actions.filter((action) => action.kind === "delete").length,
  };

  const deleteReasons = actions
    .filter((action): action is Extract<RepairAction, { kind: "delete" }> => action.kind === "delete")
    .reduce<Record<string, number>>((acc, action) => {
      acc[action.reason] = (acc[action.reason] ?? 0) + 1;
      return acc;
    }, {});

  return {
    totalReferenceAssets: rows.length,
    keepCount: byKind.keep,
    updateCount: byKind.update,
    deleteCount: byKind.delete,
    deleteReasons,
    samples: {
      update: actions
        .filter((action): action is Extract<RepairAction, { kind: "update" }> => action.kind === "update")
        .slice(0, 10)
        .map((action) => ({ assetId: action.assetId, reason: action.reason })),
      delete: actions
        .filter((action): action is Extract<RepairAction, { kind: "delete" }> => action.kind === "delete")
        .slice(0, 10)
        .map((action) => ({ assetId: action.assetId, reason: action.reason })),
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = await listReferenceAssets(args.teacherId);
  const contentLibraryItemIds = rows.flatMap((row) => {
    const ids: string[] = [];
    if (row.content_library_item_id?.trim()) ids.push(row.content_library_item_id.trim());
    if (row.ref_entity_type === "content_library_item" && row.ref_entity_id?.trim()) {
      ids.push(row.ref_entity_id.trim());
    }
    return ids;
  });
  const legacyOrigins = rows.flatMap((row) => {
    if (
      row.ref_entity_type &&
      LEGACY_LIBRARY_REF_TYPES.has(row.ref_entity_type) &&
      row.ref_entity_id?.trim()
    ) {
      return [{
        originEntityType: row.ref_entity_type,
        originEntityId: row.ref_entity_id.trim(),
      }];
    }
    return [];
  });

  const items = await listContentLibraryItems({
    teacherId: args.teacherId,
    contentLibraryItemIds,
    legacyOrigins,
  });
  const actions = planRepairActions(rows, items);
  const summary = buildSummary(rows, actions);

  console.log(
    JSON.stringify(
      {
        mode: args.write ? "write" : "dry-run",
        teacherId: args.teacherId,
        ...summary,
      },
      null,
      2,
    ),
  );

  if (!args.write) {
    return;
  }

  await applyActions(actions);

  const nextRows = await listReferenceAssets(args.teacherId);
  const nextItems = await listContentLibraryItems({
    teacherId: args.teacherId,
    contentLibraryItemIds: nextRows.flatMap((row) => {
      const ids: string[] = [];
      if (row.content_library_item_id?.trim()) ids.push(row.content_library_item_id.trim());
      if (row.ref_entity_type === "content_library_item" && row.ref_entity_id?.trim()) {
        ids.push(row.ref_entity_id.trim());
      }
      return ids;
    }),
    legacyOrigins: nextRows.flatMap((row) => {
      if (
        row.ref_entity_type &&
        LEGACY_LIBRARY_REF_TYPES.has(row.ref_entity_type) &&
        row.ref_entity_id?.trim()
      ) {
        return [{
          originEntityType: row.ref_entity_type,
          originEntityId: row.ref_entity_id.trim(),
        }];
      }
      return [];
    }),
  });
  const postActions = planRepairActions(nextRows, nextItems);

  console.log(
    JSON.stringify(
      {
        mode: "post-write-audit",
        teacherId: args.teacherId,
        ...buildSummary(nextRows, postActions),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[repair-reference-assets] failed", error);
  process.exitCode = 1;
});
