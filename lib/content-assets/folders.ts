import type { AssetStoreClient, ContentFolder } from "@/lib/content-assets/types";

// ── Row 映射 ──────────────────────────────────────────────

type ContentFolderRow = {
  id: string;
  teacher_id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  sort_order: number;
  is_system: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const CONTENT_FOLDER_SELECT = [
  "id",
  "teacher_id",
  "parent_id",
  "name",
  "slug",
  "sort_order",
  "is_system",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

function mapFolderRow(row: ContentFolderRow): ContentFolder {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    parentId: row.parent_id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sort_order,
    isSystem: row.is_system,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asContentFolderRow(row: unknown): ContentFolderRow {
  return row as unknown as ContentFolderRow;
}

function asContentFolderRows(rows: unknown[] | null | undefined): ContentFolderRow[] {
  return (rows ?? []) as unknown as ContentFolderRow[];
}

// ── 辅助 ──────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── CRUD ──────────────────────────────────────────────────

export async function listFolders(client: AssetStoreClient): Promise<ContentFolder[]> {
  const { data, error } = await client.supabase
    .from("content_folders")
    .select(CONTENT_FOLDER_SELECT)
    .eq("teacher_id", client.teacherId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("读取文件夹列表失败");
  }

  return asContentFolderRows(data).map(mapFolderRow);
}

export async function createFolder(
  client: AssetStoreClient,
  params: { name: string; parentId?: string | null },
): Promise<ContentFolder> {
  const baseName = params.name.trim();
  if (!baseName) {
    throw new Error("文件夹名称不能为空");
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const name = attempt === 0 ? baseName : `${baseName} ${attempt + 1}`;
    const slug = slugify(name) || "folder";

    const { data, error } = await client.supabase
      .from("content_folders")
      .insert({
        teacher_id: client.teacherId,
        parent_id: params.parentId ?? null,
        name,
        slug,
        sort_order: 0,
        is_system: false,
        metadata: {},
      })
      .select(CONTENT_FOLDER_SELECT)
      .single();

    if (!error && data) {
      return mapFolderRow(asContentFolderRow(data));
    }

    if (error?.code === "23505") {
      continue;
    }

    throw new Error("创建文件夹失败");
  }

  throw new Error("文件夹名称冲突，请重试");
}

export async function renameFolder(
  client: AssetStoreClient,
  folderId: string,
  name: string,
): Promise<ContentFolder> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("文件夹名称不能为空");
  }

  const { data: existing, error: readError } = await client.supabase
    .from("content_folders")
    .select("id, is_system")
    .eq("id", folderId)
    .eq("teacher_id", client.teacherId)
    .maybeSingle();

  if (readError) {
    throw new Error("读取文件夹失败");
  }

  if (!existing) {
    throw new Error("FOLDER_NOT_FOUND");
  }

  if ((existing as { is_system: boolean }).is_system) {
    throw new Error("SYSTEM_FOLDER_RENAME_BLOCKED");
  }

  const slug = slugify(trimmed);

  const { data, error } = await client.supabase
    .from("content_folders")
    .update({ name: trimmed, slug: slug || "folder" })
    .eq("id", folderId)
    .eq("teacher_id", client.teacherId)
    .select(CONTENT_FOLDER_SELECT)
    .single();

  if (error) {
    throw new Error("重命名文件夹失败");
  }

  return mapFolderRow(asContentFolderRow(data));
}

export async function deleteFolder(
  client: AssetStoreClient,
  folderId: string,
): Promise<void> {
  const { data: existing, error: readError } = await client.supabase
    .from("content_folders")
    .select("id, is_system")
    .eq("id", folderId)
    .eq("teacher_id", client.teacherId)
    .maybeSingle();

  if (readError) {
    throw new Error("读取文件夹失败");
  }

  if (!existing) {
    throw new Error("FOLDER_NOT_FOUND");
  }

  if ((existing as { is_system: boolean }).is_system) {
    throw new Error("SYSTEM_FOLDER_DELETE_BLOCKED");
  }

  const { error } = await client.supabase
    .from("content_folders")
    .delete()
    .eq("id", folderId)
    .eq("teacher_id", client.teacherId);

  if (error) {
    throw new Error("删除文件夹失败");
  }
}

export async function moveFolder(
  client: AssetStoreClient,
  folderId: string,
  newParentId: string | null,
): Promise<ContentFolder> {
  const { data: existing, error: readError } = await client.supabase
    .from("content_folders")
    .select("id, is_system")
    .eq("id", folderId)
    .eq("teacher_id", client.teacherId)
    .maybeSingle();

  if (readError) {
    throw new Error("读取文件夹失败");
  }

  if (!existing) {
    throw new Error("FOLDER_NOT_FOUND");
  }

  if ((existing as { is_system: boolean }).is_system) {
    throw new Error("SYSTEM_FOLDER_MOVE_BLOCKED");
  }

  const { data, error } = await client.supabase
    .from("content_folders")
    .update({ parent_id: newParentId })
    .eq("id", folderId)
    .eq("teacher_id", client.teacherId)
    .select(CONTENT_FOLDER_SELECT)
    .single();

  if (error) {
    throw new Error("移动文件夹失败");
  }

  return mapFolderRow(asContentFolderRow(data));
}

// ── 默认文件夹（幂等） ───────────────────────────────────

type DefaultFolders = {
  uploadsFolder: ContentFolder;
  generatedFolder: ContentFolder;
};

export async function ensureDefaultFolders(client: AssetStoreClient): Promise<DefaultFolders> {
  const { data: uploadsData, error: uploadsError } = await client.supabase
    .from("content_folders")
    .upsert(
      {
        teacher_id: client.teacherId,
        parent_id: null,
        name: "我的上传",
        slug: "my-uploads",
        sort_order: 0,
        is_system: true,
        metadata: {},
      },
      {
        onConflict: "teacher_id,coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),slug",
        ignoreDuplicates: false,
      },
    )
    .select(CONTENT_FOLDER_SELECT)
    .single();

  if (uploadsError) {
    // upsert 的 onConflict 可能不支持表达式索引，改用 select + insert 兜底
    const fallbackUploads = await findOrCreateSystemFolder(client, "我的上传", "my-uploads", 0);
    const fallbackGenerated = await findOrCreateSystemFolder(client, "最近生成", "recent-generated", 1);
    return {
      uploadsFolder: fallbackUploads,
      generatedFolder: fallbackGenerated,
    };
  }

  const { data: generatedData, error: generatedError } = await client.supabase
    .from("content_folders")
    .upsert(
      {
        teacher_id: client.teacherId,
        parent_id: null,
        name: "最近生成",
        slug: "recent-generated",
        sort_order: 1,
        is_system: true,
        metadata: {},
      },
      {
        onConflict: "teacher_id,coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),slug",
        ignoreDuplicates: false,
      },
    )
    .select(CONTENT_FOLDER_SELECT)
    .single();

  if (generatedError) {
    const fallbackGenerated = await findOrCreateSystemFolder(client, "最近生成", "recent-generated", 1);
    return {
      uploadsFolder: mapFolderRow(asContentFolderRow(uploadsData)),
      generatedFolder: fallbackGenerated,
    };
  }

  return {
    uploadsFolder: mapFolderRow(asContentFolderRow(uploadsData)),
    generatedFolder: mapFolderRow(asContentFolderRow(generatedData)),
  };
}

async function findOrCreateSystemFolder(
  client: AssetStoreClient,
  name: string,
  slug: string,
  sortOrder: number,
): Promise<ContentFolder> {
  const { data: existing } = await client.supabase
    .from("content_folders")
    .select(CONTENT_FOLDER_SELECT)
    .eq("teacher_id", client.teacherId)
    .eq("slug", slug)
    .eq("is_system", true)
    .is("parent_id", null)
    .maybeSingle();

  if (existing) {
    return mapFolderRow(asContentFolderRow(existing));
  }

  const { data: created, error: createError } = await client.supabase
    .from("content_folders")
    .insert({
      teacher_id: client.teacherId,
      parent_id: null,
      name,
      slug,
      sort_order: sortOrder,
      is_system: true,
      metadata: {},
    })
    .select(CONTENT_FOLDER_SELECT)
    .single();

  if (createError) {
    // 并发创建 — 再查一次
    const { data: retry } = await client.supabase
      .from("content_folders")
      .select(CONTENT_FOLDER_SELECT)
      .eq("teacher_id", client.teacherId)
      .eq("slug", slug)
      .eq("is_system", true)
      .is("parent_id", null)
      .single();

    if (!retry) {
      throw new Error("创建系统文件夹失败");
    }

    return mapFolderRow(asContentFolderRow(retry));
  }

  return mapFolderRow(asContentFolderRow(created));
}
