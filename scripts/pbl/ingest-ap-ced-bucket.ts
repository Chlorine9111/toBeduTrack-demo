import { createHash } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { renderPdfPages } from "@/lib/pdf-scan/pdf-render";
import { sendVisionMessage } from "@/lib/pdf-scan/ai-vision";
import { hasMathpixCredentials, uploadPDF, waitForCompletion } from "@/lib/pdf-scan/mathpix";
import { hasMistralOcrCredentials, ocrPdfWithMistral } from "@/lib/pdf-scan/mistral-ocr";

type TagDimension = "A" | "B" | "C" | "D";

type MaterialType = "competition" | "pbl_case" | "driving_question" | "curriculum_map";

type BucketFile = {
  path: string;
  size: number;
  updatedAt: string | null;
};

type ClassifiedMaterial = {
  path: string;
  title: string;
  displayCode: string;
  year: number;
  type: MaterialType;
  difficulty: "advanced_hs";
  source: string;
  url: string;
  tags: Array<{ name: string; dimension: TagDimension }>;
  originalContent: string;
  ocrMode: "pdf_text" | "vision_fallback" | "metadata_only";
  extractedChars: number;
};

type AppSupabase = SupabaseClient<Database>;

type MaterialRow = {
  id: string;
  display_code: string;
};

type TagRow = {
  id: string;
  dimension: TagDimension;
  name: string;
};

type LooseStorageEntry = {
  name: string;
  id?: string;
  metadata?: {
    size?: number;
    mimetype?: string;
  } | null;
  updated_at?: string | null;
};

const SUBJECT_TAG_DIMENSION: TagDimension = "A";
const METHOD_TAG_DIMENSION: TagDimension = "B";
const THEME_TAG_DIMENSION: TagDimension = "C";
const COGNITIVE_TAG_DIMENSION: TagDimension = "D";

const BUCKET = process.env.AP_CED_BUCKET?.trim() || "ap-ced-materials";
const PREFIX = process.env.AP_CED_PREFIX?.trim() || "AP-CED-Sucai";

function getEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function slugToHumanTitle(fileName: string): string {
  const withoutExt = fileName.replace(/\.pdf$/i, "");
  const withPart = withoutExt
    .replace(/-course-and-exam-description$/i, "")
    .replace(/-course-and-exam-description-(part\d+)$/i, "-$1");

  const words = withPart.split("-").filter(Boolean).map((word) => {
    const lower = word.toLowerCase();
    if (lower === "ap") return "AP";
    if (lower === "us") return "U.S.";
    if (lower === "cs") return "CS";
    if (lower === "and") return "and";
    if (lower === "c") return "C";
    if (/^part\d+$/i.test(lower)) {
      return lower.replace(/^part(\d+)$/i, "Part $1");
    }
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });

  return `${words.join(" ")} Course and Exam Description`;
}

function inferSubjectTag(path: string): string {
  const lower = path.toLowerCase();

  if (lower.includes("computer-science")) return "计算机";
  if (lower.includes("statistics") || lower.includes("calculus") || lower.includes("precalculus")) return "数学";
  if (lower.includes("biology")) return "生物";
  if (lower.includes("chemistry")) return "化学";
  if (lower.includes("environmental-science")) return "环境科学";
  if (lower.includes("physics")) return "物理";
  if (lower.includes("english")) return "英语";
  if (lower.includes("government") || lower.includes("politics")) return "政治";
  if (lower.includes("economics")) return "经济";
  if (lower.includes("geography")) return "地理";
  if (lower.includes("psychology")) return "心理学";
  if (lower.includes("history") || lower.includes("african-american-studies")) return "历史";
  if (lower.includes("chinese-language")) return "语文";
  if (lower.includes("language") || lower.includes("literature") || lower.includes("latin")) return "英语";
  if (lower.includes("art") || lower.includes("music")) return "艺术";
  if (lower.includes("research") || lower.includes("seminar")) return "跨学科";

  return "跨学科";
}

function inferMethodTag(subjectTag: string): string {
  if (["物理", "化学", "生物", "环境科学"].includes(subjectTag)) return "实验探究";
  if (["数学", "计算机", "经济", "地理", "心理学"].includes(subjectTag)) return "数据分析";
  if (subjectTag === "跨学科") return "方案设计";
  return "文献研究";
}

function inferThemeTag(subjectTag: string, path: string): string {
  const lower = path.toLowerCase();

  if (subjectTag === "环境科学") return "环境与生态";
  if (subjectTag === "经济") return "经济与商业";
  if (subjectTag === "政治") return "伦理与治理";
  if (subjectTag === "地理") return "城市与社区";
  if (subjectTag === "心理学") return "健康与医学";
  if (subjectTag === "历史" || subjectTag === "语文" || subjectTag === "艺术") return "文化与传承";
  if (subjectTag === "数学" || subjectTag === "计算机" || subjectTag === "物理" || subjectTag === "化学" || subjectTag === "生物") {
    return "科技与创新";
  }
  if (lower.includes("research") || lower.includes("seminar")) return "教育与发展";
  return "教育与发展";
}

function inferCognitiveTag(subjectTag: string, path: string): string {
  const lower = path.toLowerCase();
  if (subjectTag === "艺术") return "创造";
  if (lower.includes("research") || lower.includes("seminar")) return "评价";
  return "分析";
}

function inferYear(text: string): number {
  const patterns = [
    /effective\s+(?:fall\s+)?(20\d{2})/i,
    /copyright\s*©?\s*(20\d{2})/i,
    /\b(20\d{2})\b/g,
  ];

  const direct = text.slice(0, 4000);
  for (const pattern of patterns.slice(0, 2)) {
    const matched = direct.match(pattern);
    if (matched?.[1]) {
      const year = Number(matched[1]);
      if (Number.isFinite(year) && year >= 2018 && year <= 2035) {
        return year;
      }
    }
  }

  const allYears = Array.from(direct.matchAll(patterns[2])).map((m) => Number(m[1]));
  const valid = allYears.filter((year) => Number.isFinite(year) && year >= 2018 && year <= 2035);
  if (valid.length > 0) {
    return Math.max(...valid);
  }

  return new Date().getUTCFullYear();
}

function buildDisplayCode(path: string): string {
  const digest = createHash("sha1").update(path).digest("hex").slice(0, 12).toUpperCase();
  return `APCED-${digest}`;
}

function buildAuthenticatedStorageUrl(baseUrl: string, bucket: string, path: string): string {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl}/storage/v1/object/authenticated/${bucket}/${encodedPath}`;
}

async function listFilesRecursively(
  supabase: AppSupabase,
  bucket: string,
  startPrefix: string,
): Promise<BucketFile[]> {
  const queue: string[] = [startPrefix];
  const files: BucketFile[] = [];

  while (queue.length > 0) {
    const prefix = queue.shift();
    if (prefix === undefined) break;

    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(prefix, {
          limit: 100,
          offset,
          sortBy: { column: "name", order: "asc" },
        });

      if (error) {
        throw new Error(`List failed for ${prefix || "/"}: ${error.message}`);
      }

      const entries = (data ?? []) as LooseStorageEntry[];
      if (entries.length === 0) break;

      for (const item of entries) {
        const fullPath = `${prefix ? `${prefix}/` : ""}${item.name}`;
        if (item.id) {
          files.push({
            path: fullPath,
            size: Number(item.metadata?.size ?? 0),
            updatedAt: item.updated_at ?? null,
          });
        } else {
          queue.push(fullPath);
        }
      }

      if (entries.length < 100) break;
      offset += entries.length;
    }
  }

  return files.filter((file) => file.path.toLowerCase().endsWith(".pdf"));
}

async function extractPdfTextSnippet(
  pdfBuffer: Buffer,
  options: { maxPages?: number; maxChars?: number } = {},
): Promise<{ text: string; pagesRead: number; totalPages: number }> {
  const maxPages = options.maxPages ?? 25;
  const maxChars = options.maxChars ?? 14000;

  if (hasMistralOcrCredentials()) {
    const result = await ocrPdfWithMistral(pdfBuffer, "ap-ced-material.pdf");
    const text = result.pages
      .slice(0, maxPages)
      .map((page) => `[Page ${page.pageNumber}] ${normalizeText(page.markdown)}`)
      .join("\n")
      .slice(0, maxChars);

    return {
      text,
      pagesRead: Math.min(result.pages.length, maxPages),
      totalPages: result.pages.length,
    };
  }

  if (hasMathpixCredentials()) {
    const pdfId = await uploadPDF(pdfBuffer, "ap-ced-material.pdf");
    const result = await waitForCompletion(pdfId);
    return {
      text: normalizeText(result.content).slice(0, maxChars),
      pagesRead: 0,
      totalPages: 0,
    };
  }

  return {
    text: "",
    pagesRead: 0,
    totalPages: 0,
  };
}

async function visionFallbackSnippet(
  pdfBuffer: Buffer,
  maxPages = 3,
  maxChars = 6000,
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return "";
  }

  const rendered = await renderPdfPages(pdfBuffer, 1.5);
  const pages = rendered.slice(0, Math.max(1, maxPages));
  const chunks: string[] = [];

  for (const page of pages) {
    const text = await sendVisionMessage(
      "请进行 OCR 识别，尽量完整输出页面中的正文、标题、列表和关键术语。只输出纯文本，不要加解释。",
      {
        mediaType: "image/png",
        data: page.buffer.toString("base64"),
      },
      {
        maxTokens: 3000,
        temperature: 0,
      },
    );

    const normalized = normalizeText(text);
    if (!normalized) continue;

    chunks.push(`[Page ${page.pageNumber}] ${normalized}`);

    if (chunks.join("\n").length >= maxChars) {
      break;
    }
  }

  return chunks.join("\n").slice(0, maxChars);
}

function composeOriginalContent(input: {
  title: string;
  source: string;
  path: string;
  url: string;
  tags: string[];
  ocrMode: string;
  extractedText: string;
}): string {
  const body = input.extractedText.trim();
  const excerpt = body.length > 4200 ? `${body.slice(0, 4199)}…` : body;

  return [
    `素材标题：${input.title}`,
    `来源机构：${input.source}`,
    `资源分类：AP CED 官方课程标准文档`,
    `桶路径：${input.path}`,
    `原始链接：${input.url}`,
    `标签：${input.tags.join("、")}`,
    `OCR方式：${input.ocrMode}`,
    "OCR内容节选：",
    excerpt || "（未提取到可读正文，已保留元数据等待人工补录）",
    "教学使用建议：",
    "用于 AP 课程项目式教学的课标对齐、单元目标拆解和评估标准设计；可直接映射到知识点、任务要求和课堂活动设计。",
  ].join("\n\n");
}

async function classifyOne(
  file: BucketFile,
  supabase: AppSupabase,
  baseUrl: string,
): Promise<ClassifiedMaterial> {
  const { data, error } = await supabase.storage.from(BUCKET).download(file.path);
  if (error || !data) {
    throw new Error(`Download failed for ${file.path}: ${error?.message ?? "unknown"}`);
  }

  const pdfBuffer = Buffer.from(await data.arrayBuffer());
  const fileName = file.path.split("/").pop() ?? file.path;

  const title = slugToHumanTitle(fileName);
  const displayCode = buildDisplayCode(file.path);
  const source = "College Board AP CED (Supabase ap-ced-materials)";
  const url = buildAuthenticatedStorageUrl(baseUrl, BUCKET, file.path);

  const subjectTag = inferSubjectTag(file.path);
  const methodTag = inferMethodTag(subjectTag);
  const themeTag = inferThemeTag(subjectTag, file.path);
  const cognitiveTag = inferCognitiveTag(subjectTag, file.path);

  const tags = [
    { name: subjectTag, dimension: SUBJECT_TAG_DIMENSION },
    { name: methodTag, dimension: METHOD_TAG_DIMENSION },
    { name: themeTag, dimension: THEME_TAG_DIMENSION },
    { name: cognitiveTag, dimension: COGNITIVE_TAG_DIMENSION },
  ];

  const textResult = await extractPdfTextSnippet(pdfBuffer, { maxPages: 25, maxChars: 14000 });

  let extractedText = textResult.text;
  let ocrMode: ClassifiedMaterial["ocrMode"] = "pdf_text";

  if (normalizeText(extractedText).length < 300) {
    const visionText = await visionFallbackSnippet(pdfBuffer, 3, 6000).catch(() => "");
    if (normalizeText(visionText).length >= 300) {
      extractedText = visionText;
      ocrMode = "vision_fallback";
    } else {
      ocrMode = "metadata_only";
    }
  }

  const year = inferYear(extractedText);

  const originalContent = composeOriginalContent({
    title,
    source,
    path: file.path,
    url,
    tags: tags.map((tag) => tag.name),
    ocrMode,
    extractedText,
  });

  return {
    path: file.path,
    title,
    displayCode,
    year,
    type: "curriculum_map",
    difficulty: "advanced_hs",
    source,
    url,
    tags,
    originalContent,
    ocrMode,
    extractedChars: normalizeText(extractedText).length,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const files = await listFilesRecursively(supabase, BUCKET, PREFIX);
  if (files.length === 0) {
    throw new Error(`No PDF files found under ${BUCKET}/${PREFIX}`);
  }

  console.log(`Found ${files.length} PDF files in ${BUCKET}/${PREFIX}`);

  const materials: ClassifiedMaterial[] = [];
  const failures: Array<{ path: string; reason: string }> = [];

  for (const [index, file] of files.entries()) {
    try {
      const material = await classifyOne(file, supabase, supabaseUrl);
      materials.push(material);
      console.log(
        `[${index + 1}/${files.length}] ✓ ${file.path} -> ${material.displayCode} (${material.ocrMode}, chars=${material.extractedChars})`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push({ path: file.path, reason });
      console.log(`[${index + 1}/${files.length}] ! ${file.path} -> ${reason}`);
    }
  }

  const uniqueTagEntries = Array.from(
    new Map(
      materials
        .flatMap((item) => item.tags)
        .map((tag) => [`${tag.dimension}:${tag.name}`, tag] as const),
    ).values(),
  );

  if (!dryRun && materials.length > 0) {
    const materialPayload = materials.map((item) => ({
      display_code: item.displayCode,
      title: item.title,
      type: item.type,
      source: item.source,
      year: item.year,
      curriculum_scope: "AP",
      difficulty: item.difficulty,
      original_content: item.originalContent,
      driving_question: null,
      downgrade_suggestion: null,
      url: item.url,
      visibility: "public",
      owner_id: null,
      quality_score: 5,
      updated_at: new Date().toISOString(),
    }));

    const { data: materialRows, error: materialError } = await supabase
      .from("pbl_materials")
      .upsert(materialPayload, { onConflict: "display_code", ignoreDuplicates: false })
      .select("id, display_code");

    if (materialError) {
      throw new Error(`Upsert pbl_materials failed: ${materialError.message}`);
    }

    const typedMaterialRows = (materialRows ?? []) as MaterialRow[];
    const materialIdByCode = new Map(typedMaterialRows.map((row) => [row.display_code, row.id]));

    const tagPayload = uniqueTagEntries.map((tag) => ({
      dimension: tag.dimension,
      name: tag.name,
      description: null,
    }));

    const { data: tagRows, error: tagError } = await supabase
      .from("pbl_tags")
      .upsert(tagPayload, { onConflict: "dimension,name", ignoreDuplicates: false })
      .select("id, dimension, name");

    if (tagError) {
      throw new Error(`Upsert pbl_tags failed: ${tagError.message}`);
    }

    const typedTagRows = (tagRows ?? []) as TagRow[];
    const tagIdByKey = new Map(typedTagRows.map((row) => [`${row.dimension}:${row.name}`, row.id]));

    const links = materials.flatMap((material) => {
      const materialId = materialIdByCode.get(material.displayCode);
      if (!materialId) return [];

      return material.tags
        .map((tag) => {
          const tagId = tagIdByKey.get(`${tag.dimension}:${tag.name}`);
          if (!tagId) return null;
          return {
            material_id: materialId,
            tag_id: tagId,
          };
        })
        .filter((item): item is { material_id: string; tag_id: string } => Boolean(item));
    });

    if (links.length > 0) {
      const { error: linkError } = await supabase
        .from("pbl_material_tags")
        .upsert(links, { onConflict: "material_id,tag_id", ignoreDuplicates: false });

      if (linkError) {
        throw new Error(`Upsert pbl_material_tags failed: ${linkError.message}`);
      }
    }
  }

  const byOcrMode = materials.reduce<Record<string, number>>((acc, item) => {
    acc[item.ocrMode] = (acc[item.ocrMode] ?? 0) + 1;
    return acc;
  }, {});

  const bySubject = materials.reduce<Record<string, number>>((acc, item) => {
    const subject = item.tags.find((tag) => tag.dimension === "A")?.name ?? "未分类";
    acc[subject] = (acc[subject] ?? 0) + 1;
    return acc;
  }, {});

  const summary = {
    ok: true,
    bucket: BUCKET,
    prefix: PREFIX,
    totalFiles: files.length,
    processed: materials.length,
    failed: failures.length,
    uniqueTags: uniqueTagEntries.length,
    byOcrMode,
    bySubject,
    failures,
    dryRun,
  };

  mkdirSync(resolve(process.cwd(), "docs", "pbl"), { recursive: true });
  mkdirSync(resolve(process.cwd(), "data", "pbl"), { recursive: true });

  writeFileSync(
    resolve(process.cwd(), "data", "pbl", "ap-ced-ingest-report.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        summary,
        materials: materials.map((item) => ({
          path: item.path,
          displayCode: item.displayCode,
          title: item.title,
          year: item.year,
          tags: item.tags,
          ocrMode: item.ocrMode,
          extractedChars: item.extractedChars,
        })),
      },
      null,
      2,
    ),
  );

  const failureRows =
    failures.length > 0
      ? failures
          .map((item) => `| ${item.path} | ${item.reason.replace(/\|/g, "\\|")} |`)
          .join("\n")
      : "";

  const reportMd = [
    "# AP CED Bucket Ingest Report",
    "",
    `- 时间：${new Date().toISOString()}`,
    `- Bucket：${BUCKET}`,
    `- Prefix：${PREFIX}`,
    `- 文件总数：${summary.totalFiles}`,
    `- 成功处理：${summary.processed}`,
    `- 失败：${summary.failed}`,
    `- OCR 模式分布：${JSON.stringify(summary.byOcrMode)}`,
    `- 学科分布：${JSON.stringify(summary.bySubject)}`,
    "",
    failures.length > 0 ? "## 失败清单" : "## 失败清单\n\n无",
    failures.length > 0 ? "| 文件 | 原因 |\n|---|---|\n" + failureRows : "",
  ].join("\n");

  writeFileSync(resolve(process.cwd(), "docs", "pbl", "ap-ced-ingest-report.md"), reportMd);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
