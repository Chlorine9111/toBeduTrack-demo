import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";

const baseUrl = process.env.BASE_URL || "http://localhost:3011";
const filePath = process.argv[2];

if (!filePath) {
  console.error(
    "用法: node --env-file=.env.local --import tsx scripts/debug-pdf-classification.ts <pdf-path>",
  );
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("缺少 Supabase 环境变量：NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function pollScanStatus(uploadId: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 8 * 60_000) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const response = await fetch(`${baseUrl}/api/pdf/scan-status/${uploadId}`);
    const payload = (await response.json().catch(() => ({}))) as {
      status?: string;
      progress?: number;
    };
    console.log("[debug] scan-status", payload);
    if (payload.status === "completed") return;
    if (payload.status === "failed") {
      throw new Error("文档识别失败");
    }
  }
  throw new Error("等待 scan-status 超时");
}

async function main() {
  const fileBuffer = readFileSync(filePath);
  const fileName = basename(filePath);

  console.log(`[debug] upload ${fileName}`);
  const formData = new FormData();
  formData.set(
    "file",
    new File([fileBuffer], fileName, { type: "application/pdf" }),
  );

  const uploadResponse = await fetch(`${baseUrl}/api/pdf/upload-scan`, {
    method: "POST",
    body: formData,
  });
  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`upload-scan 失败: ${uploadResponse.status} ${text}`);
  }

  const uploadPayload = (await uploadResponse.json()) as { uploadId: string };
  console.log("[debug] upload payload", uploadPayload);

  await pollScanStatus(uploadPayload.uploadId);

  console.log("[debug] process-scan");
  const processResponse = await fetch(`${baseUrl}/api/pdf/process-scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId: uploadPayload.uploadId }),
  });
  if (!processResponse.ok) {
    const text = await processResponse.text();
    throw new Error(`process-scan 失败: ${processResponse.status} ${text}`);
  }

  const processPayload = (await processResponse.json()) as {
    saveResult?: Record<string, unknown> | null;
    questions?: Array<Record<string, unknown>>;
  };
  console.log(
    "[debug] process save result",
    JSON.stringify(processPayload.saveResult ?? null, null, 2),
  );

  const { data: uploadRow, error: uploadError } = await supabase
    .from("pdf_scan_uploads")
    .select("id,file_name,scan_result")
    .eq("id", uploadPayload.uploadId)
    .maybeSingle();
  if (uploadError) {
    throw uploadError;
  }

  const { data: exercises, error: exercisesError } = await supabase
    .from("exercises")
    .select(`
      id,
      question_text,
      course_id,
      unit_id,
      topic_id,
      source_file_name,
      source_upload_id,
      knowledge_cluster,
      knowledge_subskill_key,
      knowledge_subskill_label,
      assessment_style,
      classification_confidence,
      classification_status,
      classification_reasons,
      course:courses(id,name,code),
      unit:units(id,unit_number,title),
      topic:topics(id,topic_number,title)
    `)
    .eq("source_upload_id", uploadPayload.uploadId)
    .order("created_at", { ascending: true });

  if (exercisesError) {
    throw exercisesError;
  }

  const summary = (exercises ?? []).slice(0, 12).map((row) => ({
    id: row.id,
    stem: String(row.question_text ?? "").slice(0, 160),
    course: Array.isArray(row.course) ? row.course[0] : row.course,
    unit: Array.isArray(row.unit) ? row.unit[0] : row.unit,
    topic: Array.isArray(row.topic) ? row.topic[0] : row.topic,
    knowledge_cluster: row.knowledge_cluster,
    knowledge_subskill_key: row.knowledge_subskill_key,
    knowledge_subskill_label: row.knowledge_subskill_label,
    assessment_style: row.assessment_style,
    classification_confidence: row.classification_confidence,
    classification_status: row.classification_status,
    classification_reasons: row.classification_reasons,
  }));

  console.log(
    JSON.stringify(
      {
        uploadId: uploadPayload.uploadId,
        uploadFileName: uploadRow?.file_name,
        saveSummary:
          uploadRow &&
          uploadRow.scan_result &&
          typeof uploadRow.scan_result === "object" &&
          !Array.isArray(uploadRow.scan_result)
            ? (uploadRow.scan_result as Record<string, unknown>).saveSummary ?? null
            : null,
        questionCount: exercises?.length ?? 0,
        sample: summary,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
