import { NextResponse } from "next/server";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { jsonError } from "@/lib/api/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const BUCKET_NAME =
  process.env.DOCUMENT_EDITOR_ASSET_BUCKET?.trim() || "document-editor-assets";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
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

function formatDateSegment(input: Date) {
  const year = String(input.getFullYear());
  const month = String(input.getMonth() + 1).padStart(2, "0");
  const day = String(input.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

async function uploadWithBucketBootstrap(params: {
  storagePath: string;
  fileBuffer: Buffer;
  contentType: string;
}) {
  const admin = createAdminSupabaseClient();

  const attemptUpload = async () =>
    admin.storage.from(BUCKET_NAME).upload(params.storagePath, params.fileBuffer, {
      contentType: params.contentType,
      upsert: false,
    });

  let uploadResult = await attemptUpload();
  if (!uploadResult.error) {
    return { admin, uploadError: null as null | { message: string } };
  }

  const message = uploadResult.error.message.toLowerCase();
  const missingBucket =
    message.includes("bucket not found") ||
    message.includes("not found") ||
    message.includes(BUCKET_NAME.toLowerCase());

  if (missingBucket) {
    await admin.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE,
      allowedMimeTypes: [...ALLOWED_MIME_TYPES],
    });
    uploadResult = await attemptUpload();
  }

  if (uploadResult.error) {
    return { admin, uploadError: { message: uploadResult.error.message } };
  }

  return { admin, uploadError: null as null | { message: string } };
}

export async function POST(request: Request) {
  const { teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("VALIDATION_ERROR", "缺少图片文件", 400);
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return jsonError("VALIDATION_ERROR", "图片大小不能超过 10MB", 400);
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return jsonError("VALIDATION_ERROR", "仅支持 PNG、JPG、WEBP、GIF 图片", 400);
    }

    const extension = MIME_EXTENSION_MAP[file.type];
    const storagePath = `${teacherId}/${formatDateSegment(new Date())}/${crypto.randomUUID()}.${extension}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { admin, uploadError } = await uploadWithBucketBootstrap({
      storagePath,
      fileBuffer,
      contentType: file.type,
    });

    if (uploadError) {
      return jsonError("STORAGE_UPLOAD_FAILED", `图片上传失败: ${uploadError.message}`, 500);
    }

    const { data: urlData } = admin.storage.from(BUCKET_NAME).getPublicUrl(storagePath);

    return NextResponse.json({
      url: urlData.publicUrl,
      storagePath,
      name: file.name,
      type: file.type,
      size: file.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "图片上传失败";
    return jsonError("INTERNAL_ERROR", message, 500);
  }
}
