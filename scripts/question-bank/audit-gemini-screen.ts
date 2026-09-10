/**
 * Phase 1a: Gemini Flash 初筛 — 让 AI 做题，确认好题 / 筛出可疑题
 *
 * 功能：
 * 1. 读取 Phase 0 的 questions-all.json + precheck-results.json
 * 2. 筛选 has_images 分类的题
 * 3. 下载图片，构建 vision messages，调用 Gemini Flash
 * 4. 答对 + confidence ≥ 0.9 → valid，其余 → needs_sonnet_review
 *
 * 用法：
 *   pnpm tsx scripts/question-bank/audit-gemini-screen.ts [--concurrency 5] [--limit 100] [--course AP_CALC_AB]
 *
 * 不需要 --write，结果只写到 output JSON 文件
 */

import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Load .env.local (no dotenv dep needed)
// ---------------------------------------------------------------------------
function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const hit = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!hit) continue;
    if (process.env[hit[1]] !== undefined) continue;
    let value = hit[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[hit[1]] = value;
  }
}
loadEnvFile(join(process.cwd(), ".env.local"));
loadEnvFile(join(process.cwd(), ".env"));
import { generateStructuredObjectWithGateway } from "@/lib/ai/gateway";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RawQuestion = {
  id: string;
  course: string;
  unit: number | null;
  question_number: number | null;
  question_type: string | null;
  stem: string | null;
  choices: Record<string, { text: string; misconception?: string | null; image_url?: string | null }> | null;
  correct_answer: string | null;
  explanation: string | null;
  stimulus_id: string | null;
  stimulus_dependent: boolean;
  standalone_usable: boolean;
  difficulty: string | null;
  stimuli: {
    content_type: string | null;
    description: string | null;
    image_url: string | null;
  } | null;
};

type PrecheckResult = {
  id: string;
  category: "precheck_fail" | "has_images" | "text_only";
  imageUrls: string[];
};

type GeminiScreenResult = {
  id: string;
  verdict: string;
  aiAnswer: string | null;
  correctAnswer: string | null;
  confidence: number | null;
  reasoning: string | null;
  issues: string[];
  modelId: string;
  durationMs: number;
};

// ---------------------------------------------------------------------------
// Schema for Gemini structured output
// ---------------------------------------------------------------------------

const McqSolveSchema = z.object({
  canSolve: z.boolean(),
  chosenAnswer: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  issues: z.array(z.enum([
    "none",
    "missing_image",
    "broken_image",
    "image_text_mismatch",
    "unsolvable",
    "ambiguous",
    "wrong_answer_suspected",
  ])),
});

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]) {
  const concIdx = argv.indexOf("--concurrency");
  const limIdx = argv.indexOf("--limit");
  const courseIdx = argv.indexOf("--course");
  const offsetIdx = argv.indexOf("--offset");
  return {
    concurrency: concIdx >= 0 ? Number(argv[concIdx + 1]) : 5,
    limit: limIdx >= 0 ? Number(argv[limIdx + 1]) : Infinity,
    course: courseIdx >= 0 ? argv[courseIdx + 1] : null,
    offset: offsetIdx >= 0 ? Number(argv[offsetIdx + 1]) : 0,
  };
}

// ---------------------------------------------------------------------------
// Image fetching (simplified version for scripts)
// ---------------------------------------------------------------------------

const MD_IMAGE_RE = /!\[[^\]]*]\(([^)]+)\)/g;

function extractAllImageUrls(q: RawQuestion): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  function add(url: string | null | undefined) {
    const trimmed = (url ?? "").trim();
    if (!trimmed || seen.has(trimmed)) return;
    // only fetch absolute URLs in script context
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return;
    seen.add(trimmed);
    results.push(trimmed);
  }

  add(q.stimuli?.image_url);
  for (const m of (q.stimuli?.description ?? "").matchAll(MD_IMAGE_RE)) add(m[1]);
  for (const m of (q.stem ?? "").matchAll(MD_IMAGE_RE)) add(m[1]);
  if (q.choices) {
    for (const choice of Object.values(q.choices)) {
      add(choice.image_url);
      for (const m of (choice.text ?? "").matchAll(MD_IMAGE_RE)) add(m[1]);
    }
  }

  return results;
}

async function fetchImage(url: string): Promise<{ buffer: Buffer; mediaType: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const resp = await fetch(url, { signal: controller.signal, redirect: "follow" });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length === 0) return null;
    const ct = (resp.headers.get("content-type") ?? "").toLowerCase();
    let mediaType = "image/jpeg";
    if (ct.startsWith("image/")) mediaType = ct.split(";")[0];
    else if (url.endsWith(".png")) mediaType = "image/png";
    else if (url.endsWith(".webp")) mediaType = "image/webp";
    return { buffer: buf, mediaType };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Build prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an AP exam student taking a multiple-choice question.
Your task: determine if this question is solvable with the provided information, and if so, select the correct answer.

Rules:
1. Read the stem carefully. If images are provided, examine them closely and use their content.
2. If the stem references a figure/graph/table/diagram but no image is provided or the image is unreadable, report "missing_image".
3. If an image is provided but does not match what the stem describes, report "image_text_mismatch".
4. If the question has insufficient information to determine a unique answer, report "unsolvable".
5. If multiple answers seem correct, report "ambiguous".
6. If you can solve it, provide your chosen answer letter (A/B/C/D/E) and your confidence (0-1).
7. Be specific in your reasoning — explain your thought process step by step.
8. If you are confident in an answer that differs from what you think the intended answer might be, note "wrong_answer_suspected".

Always respond with the structured output format requested.`;

function buildUserContent(q: RawQuestion, images: Array<{ buffer: Buffer; mediaType: string; label: string }>) {
  const parts: Array<{ type: "text"; text: string } | { type: "image"; image: Buffer; mimeType: string }> = [];

  // Stimulus description (if any)
  if (q.stimuli?.description) {
    parts.push({ type: "text", text: `[Stimulus material]\n${q.stimuli.description}` });
  }

  // Images
  for (const img of images) {
    parts.push({ type: "text", text: `[Image: ${img.label}]` });
    parts.push({ type: "image", image: img.buffer, mimeType: img.mediaType });
  }

  // Stem
  // Strip markdown image syntax from stem for clarity (images are sent separately)
  const cleanStem = (q.stem ?? "").replace(MD_IMAGE_RE, "").trim();
  parts.push({ type: "text", text: `\n[Question]\n${cleanStem}` });

  // Choices
  if (q.choices) {
    const choiceLines = Object.entries(q.choices)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, c]) => `${label}. ${(c.text ?? "").replace(MD_IMAGE_RE, "").trim()}`)
      .join("\n");
    parts.push({ type: "text", text: `\n[Choices]\n${choiceLines}` });
  }

  parts.push({ type: "text", text: "\nSolve this question. If you cannot solve it due to missing or mismatched images, explain why." });

  return parts;
}

// ---------------------------------------------------------------------------
// Solve one question
// ---------------------------------------------------------------------------

const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";

async function solveQuestion(q: RawQuestion): Promise<GeminiScreenResult> {
  const startedAt = Date.now();

  // Fetch images
  const imageUrls = extractAllImageUrls(q);
  const images: Array<{ buffer: Buffer; mediaType: string; label: string }> = [];
  for (const url of imageUrls) {
    const img = await fetchImage(url);
    if (img) {
      images.push({ ...img, label: url.split("/").pop() ?? "image" });
    }
  }

  // Build messages with vision content
  const userContent = buildUserContent(q, images);

  try {
    const { object } = await generateStructuredObjectWithGateway({
      model: GEMINI_MODEL,
      schema: McqSolveSchema,
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user" as const, content: userContent }],
      maxTokens: 1200,
      temperature: 0,
      timeout: 30_000,
      maxRetries: 2,
    });

    const durationMs = Date.now() - startedAt;
    const correctAnswer = (q.correct_answer ?? "").trim().toUpperCase();
    const aiAnswer = (object.chosenAnswer ?? "").trim().toUpperCase();

    // Determine verdict
    let verdict: string;
    const reportedIssues = object.issues.filter((i: string) => i !== "none");

    if (!object.canSolve || reportedIssues.length > 0) {
      // AI says it can't solve or has issues
      if (reportedIssues.includes("missing_image")) verdict = "missing_image";
      else if (reportedIssues.includes("image_text_mismatch")) verdict = "image_text_mismatch";
      else if (reportedIssues.includes("ambiguous")) verdict = "ambiguous";
      else if (reportedIssues.includes("unsolvable")) verdict = "unsolvable";
      else if (reportedIssues.includes("wrong_answer_suspected")) verdict = "wrong_answer";
      else verdict = "unsolvable";
    } else if (object.canSolve && object.confidence >= 0.9 && aiAnswer === correctAnswer) {
      verdict = "valid";
    } else if (object.canSolve && aiAnswer !== correctAnswer) {
      verdict = "wrong_answer";
    } else {
      // Low confidence or other edge case → needs review
      verdict = "needs_sonnet_review";
    }

    return {
      id: q.id,
      verdict,
      aiAnswer: aiAnswer || null,
      correctAnswer: correctAnswer || null,
      confidence: object.confidence,
      reasoning: object.reasoning,
      issues: reportedIssues,
      modelId: GEMINI_MODEL,
      durationMs,
    };
  } catch (err) {
    return {
      id: q.id,
      verdict: "needs_sonnet_review",
      aiAnswer: null,
      correctAnswer: (q.correct_answer ?? "").trim().toUpperCase() || null,
      confidence: null,
      reasoning: `Gemini error: ${err instanceof Error ? err.message : String(err)}`,
      issues: ["ai_error"],
      modelId: GEMINI_MODEL,
      durationMs: Date.now() - startedAt,
    };
  }
}

// ---------------------------------------------------------------------------
// Concurrency limiter
// ---------------------------------------------------------------------------

async function processConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Find the most recent audit output directory
  const auditDir = join(process.cwd(), "output");
  const dirs = require("node:fs")
    .readdirSync(auditDir)
    .filter((d: string) => d.startsWith("audit-"))
    .sort()
    .reverse();

  if (dirs.length === 0) {
    throw new Error("未找到 audit 输出目录，请先运行 audit-export-questions.ts");
  }

  const outDir = join(auditDir, dirs[0]);
  console.log(`[gemini-screen] 使用输出目录: ${outDir}`);
  console.log(`[gemini-screen] concurrency=${args.concurrency} limit=${args.limit} course=${args.course ?? "all"} offset=${args.offset}`);

  // Load data
  const allQuestions: RawQuestion[] = JSON.parse(readFileSync(join(outDir, "questions-all.json"), "utf-8"));
  const precheckResults: PrecheckResult[] = JSON.parse(readFileSync(join(outDir, "precheck-results.json"), "utf-8"));

  // Filter to has_images only
  const hasImagesIds = new Set(
    precheckResults
      .filter((r) => r.category === "has_images")
      .map((r) => r.id),
  );

  let targets = allQuestions.filter((q) => hasImagesIds.has(q.id));
  if (args.course) {
    targets = targets.filter((q) => q.course === args.course);
  }
  targets = targets.slice(args.offset, args.offset + args.limit);

  console.log(`[gemini-screen] 目标题数: ${targets.length}`);

  // Load existing results (for resume)
  const existingResultsPath = join(outDir, "gemini-screen-results.json");
  let existingResults: GeminiScreenResult[] = [];
  if (existsSync(existingResultsPath)) {
    existingResults = JSON.parse(readFileSync(existingResultsPath, "utf-8"));
    console.log(`[gemini-screen] 已有结果: ${existingResults.length} 道`);
  }
  const doneIds = new Set(existingResults.map((r) => r.id));
  const remaining = targets.filter((q) => !doneIds.has(q.id));
  console.log(`[gemini-screen] 待处理: ${remaining.length} 道`);

  if (remaining.length === 0) {
    console.log("[gemini-screen] 无待处理题目");
    return;
  }

  // Process
  let processed = 0;
  const batchResults: GeminiScreenResult[] = [];

  const results = await processConcurrent(remaining, args.concurrency, async (q, i) => {
    const result = await solveQuestion(q);
    processed++;
    if (processed % 20 === 0 || processed === remaining.length) {
      console.log(`  progress: ${processed}/${remaining.length} (latest: ${result.verdict} ${result.durationMs}ms)`);
    }
    return result;
  });

  // Merge with existing
  const allResults = [...existingResults, ...results];
  writeFileSync(existingResultsPath, JSON.stringify(allResults, null, 2));

  // Summary
  const verdictCounts: Record<string, number> = {};
  for (const r of allResults) {
    verdictCounts[r.verdict] = (verdictCounts[r.verdict] ?? 0) + 1;
  }

  const needsSonnet = allResults.filter((r) => r.verdict !== "valid").length;

  console.log("\n===== Gemini Flash 初筛结果 =====");
  console.log(`总处理: ${allResults.length}`);
  for (const [v, c] of Object.entries(verdictCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v}: ${c}`);
  }
  console.log(`\n需要 Sonnet 复核: ${needsSonnet} 道`);
  console.log(`直接确认 valid: ${verdictCounts["valid"] ?? 0} 道`);

  // Update progress.json
  const progressPath = join(outDir, "progress.json");
  if (existsSync(progressPath)) {
    const progress = JSON.parse(readFileSync(progressPath, "utf-8"));
    const sonnetIds = new Set(allResults.filter((r) => r.verdict !== "valid").map((r) => r.id));
    const BATCH_SIZE = progress.batchSize ?? 50;

    const sonnetQuestions = [...sonnetIds];
    const batches = [];
    for (let i = 0; i < sonnetQuestions.length; i += BATCH_SIZE) {
      batches.push({
        index: batches.length,
        status: "pending",
        questionIds: sonnetQuestions.slice(i, i + BATCH_SIZE),
      });
    }

    progress.totalNeedsAiReview = sonnetIds.size;
    progress.batches = batches;
    progress.geminiScreened = allResults.length;
    progress.geminiValid = verdictCounts["valid"] ?? 0;

    writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    console.log(`\n[gemini-screen] progress.json 已更新: ${batches.length} 个 batch 待 Sonnet 复核`);
  }

  console.log(`[gemini-screen] 完成！结果: ${existingResultsPath}`);
}

main().catch((err) => {
  console.error("[gemini-screen] failed");
  console.error(err);
  process.exit(1);
});
