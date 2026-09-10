import type { WorksheetEditorDraft, WorksheetProjectStoredAsset } from "@/components/main/question-bank/worksheet-editor/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { WORKSHEET_PROJECT_STORAGE_BUCKET } from "@/lib/question-bank/worksheet-project-types";

const MAX_ASSET_FILE_SIZE = 10 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.trim();
}

function normalizeAssetKey(asset: WorksheetProjectStoredAsset) {
  return `${asset.bucket}:${asset.path}`;
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  const mimeType = cleanText(match?.[1]);
  const payload = match?.[2] ?? "";
  if (!mimeType || !payload) {
    throw new Error("图片数据不合法");
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("仅支持 PNG、JPG、WEBP、GIF 图片");
  }
  const buffer = Buffer.from(payload, "base64");
  if (buffer.byteLength <= 0 || buffer.byteLength > MAX_ASSET_FILE_SIZE) {
    throw new Error("图片大小不能超过 10MB");
  }
  return {
    mimeType,
    buffer,
    extension: MIME_EXTENSION_MAP[mimeType] ?? "bin",
  };
}

async function ensureWorksheetProjectAssetBucket() {
  const admin = createAdminSupabaseClient();
  const { data: existing } = await admin.storage.getBucket(WORKSHEET_PROJECT_STORAGE_BUCKET);
  if (existing) {
    return admin;
  }
  await admin.storage.createBucket(WORKSHEET_PROJECT_STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: MAX_ASSET_FILE_SIZE,
    allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
  });
  return admin;
}

export function extractWorksheetProjectStoredAssets(
  draft: WorksheetEditorDraft | null | undefined,
) {
  if (!draft) return [] as WorksheetProjectStoredAsset[];
  const seen = new Set<string>();
  const assets: WorksheetProjectStoredAsset[] = [];
  for (const question of draft.questions ?? []) {
    const asset = question.stimulusImageAsset;
    if (!asset?.bucket || !asset.path) continue;
    const key = normalizeAssetKey(asset);
    if (seen.has(key)) continue;
    seen.add(key);
    assets.push(asset);
  }
  return assets;
}

export function extractWorksheetProjectStoredAssetsFromSnapshot(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return [] as WorksheetProjectStoredAsset[];
  }
  if (Reflect.get(snapshot, "kind") !== "worksheet_project") {
    return [] as WorksheetProjectStoredAsset[];
  }
  const draft = Reflect.get(snapshot, "draft");
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    return [] as WorksheetProjectStoredAsset[];
  }
  return extractWorksheetProjectStoredAssets(draft as WorksheetEditorDraft);
}

export async function uploadWorksheetProjectDataUrlAsset(params: {
  teacherId: string;
  projectKey: string;
  questionId: string;
  dataUrl: string;
}) {
  const admin = await ensureWorksheetProjectAssetBucket();
  const decoded = parseDataUrl(params.dataUrl);
  const storagePath = [
    params.teacherId,
    params.projectKey,
    params.questionId,
    `${crypto.randomUUID()}.${decoded.extension}`,
  ].join("/");

  const { error } = await admin.storage
    .from(WORKSHEET_PROJECT_STORAGE_BUCKET)
    .upload(storagePath, decoded.buffer, {
      contentType: decoded.mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`图片上传失败: ${error.message}`);
  }

  return {
    bucket: WORKSHEET_PROJECT_STORAGE_BUCKET,
    path: storagePath,
    mimeType: decoded.mimeType,
    fileSizeBytes: decoded.buffer.byteLength,
  } satisfies WorksheetProjectStoredAsset;
}

export async function hydrateWorksheetProjectDraftAssets(
  draft: WorksheetEditorDraft,
) {
  const admin = createAdminSupabaseClient();
  const nextQuestions = await Promise.all(
    draft.questions.map(async (question) => {
      const asset = question.stimulusImageAsset;
      if (!asset?.bucket || !asset.path) {
        return question;
      }
      const { data, error } = await admin.storage
        .from(asset.bucket)
        .createSignedUrl(asset.path, SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) {
        return {
          ...question,
          stimulusImageUrl: null,
        };
      }
      return {
        ...question,
        stimulusImageUrl: data.signedUrl,
      };
    }),
  );

  return {
    ...draft,
    questions: nextQuestions,
  };
}

export async function deleteWorksheetProjectStoredAssets(
  assets: WorksheetProjectStoredAsset[],
) {
  if (assets.length === 0) return;
  const grouped = new Map<string, string[]>();
  for (const asset of assets) {
    if (!asset.bucket || !asset.path) continue;
    const current = grouped.get(asset.bucket) ?? [];
    current.push(asset.path);
    grouped.set(asset.bucket, current);
  }

  if (grouped.size === 0) return;
  const admin = createAdminSupabaseClient();
  await Promise.all(
    Array.from(grouped.entries()).map(async ([bucket, paths]) => {
      const uniquePaths = Array.from(new Set(paths));
      if (uniquePaths.length === 0) return;
      const { error } = await admin.storage.from(bucket).remove(uniquePaths);
      if (error) {
        throw new Error(`删除工程图片失败: ${error.message}`);
      }
    }),
  );
}
