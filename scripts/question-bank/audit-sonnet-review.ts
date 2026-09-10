/**
 * Phase 1b: 自动化复核 — 对 Gemini Flash 初筛的可疑题进行复核
 *
 * 功能：
 * 1. 读取 progress.json，找到 pending batch
 * 2. 对每个 batch 的题目用 Gemini Pro 做复核（含 vision）
 * 3. 自动处理限流（等待 30 分钟后重试）
 * 4. 到 07:00 自动停止
 * 5. 每 batch 完成后保存结果、更新进度
 *
 * 用法：
 *   pnpm tsx scripts/question-bank/audit-sonnet-review.ts [--concurrency 5] [--stop-hour 7] [--model gemini-3.1-pro-preview]
 *
 * 完全自主运行，放后台即可
 */

import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Load .env.local
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
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
  choices: Record<
    string,
    { text: string; misconception?: string | null; image_url?: string | null }
  > | null;
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

type SonnetReviewResult = {
  id: string;
  verdict: string;
  aiAnswer: string | null;
  correctAnswer: string | null;
  confidence: number | null;
  reasoning: string | null;
  issues: string[];
  modelId: string;
  geminiVerdict: string;
  durationMs: number;
};

type BatchInfo = {
  index: number;
  status: string;
  questionIds: string[];
};

type Progress = {
  totalNeedsAiReview: number;
  geminiScreened: number;
  geminiValid: number;
  batchSize: number;
  batches: BatchInfo[];
  completedBatches?: number;
  completedCount?: number;
};

// ---------------------------------------------------------------------------
// Schema for structured output
// ---------------------------------------------------------------------------

const ReviewSchema = z.object({
  canSolve: z.boolean(),
  chosenAnswer: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  issues: z.array(
    z.enum([
      "none",
      "missing_image",
      "broken_image",
      "image_text_mismatch",
      "unsolvable",
      "ambiguous",
      "wrong_answer_suspected",
    ]),
  ),
});

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]) {
  const get = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : null;
  };
  return {
    concurrency: Number(get("--concurrency") ?? 1),
    stopHour: Number(get("--stop-hour") ?? 7),
    model: get("--model") ?? "gemini-3.1-pro-preview",
    retryWaitMin: Number(get("--retry-wait") ?? 5),
    delayMs: Number(get("--delay") ?? 2000), // 请求间隔 ms
  };
}

// ---------------------------------------------------------------------------
// Time check
// ---------------------------------------------------------------------------

function shouldStop(stopHour: number): boolean {
  const now = new Date();
  const h = now.getHours();
  // 停止条件：过了 stopHour 且在白天（stopHour ~ 21 之间）
  if (h >= stopHour && h < 21) {
    return true;
  }
  return false;
}

function timeStr(): string {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

// ---------------------------------------------------------------------------
// Image fetching
// ---------------------------------------------------------------------------

const MD_IMAGE_RE = /!\[[^\]]*]\(([^)]+)\)/g;

function extractAllImageUrls(q: RawQuestion): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  function add(url: string | null | undefined) {
    const trimmed = (url ?? "").trim();
    if (!trimmed || seen.has(trimmed)) return;
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://"))
      return;
    seen.add(trimmed);
    results.push(trimmed);
  }

  add(q.stimuli?.image_url);
  for (const m of (q.stimuli?.description ?? "").matchAll(MD_IMAGE_RE))
    add(m[1]);
  for (const m of (q.stem ?? "").matchAll(MD_IMAGE_RE)) add(m[1]);
  if (q.choices) {
    for (const choice of Object.values(q.choices)) {
      add(choice.image_url);
      for (const m of (choice.text ?? "").matchAll(MD_IMAGE_RE)) add(m[1]);
    }
  }
  return results;
}

async function fetchImage(
  url: string,
): Promise<{ buffer: Buffer; mediaType: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const resp = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });
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
// Build review prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a senior AP exam question quality reviewer.
Your task: determine if this multiple-choice question can be solved correctly with the provided information (text + images).

This question was flagged by an initial automated screening. You are doing a second, more thorough review.

Rules:
1. Read the stem carefully. If images are provided, examine them closely.
2. The question stem and stimulus description may contain enough text information to solve the question even if the image is wrong. Consider this.
3. If the stem references a figure/graph/table/diagram but no image is provided or the image is clearly unreadable, report "missing_image".
4. If an image is provided but shows completely different content from what the stem describes (wrong graph, wrong table, wrong diagram), report "image_text_mismatch".
5. If the question has insufficient information to determine a unique answer, report "unsolvable".
6. If multiple answers seem equally correct, report "ambiguous".
7. If you can solve it correctly, provide your chosen answer letter (A/B/C/D/E) and your confidence (0-1).
8. If the stored correct answer seems wrong and you are confident in a different answer, report "wrong_answer_suspected".
9. Be specific in your reasoning.

The previous screening found: {geminiVerdict} - "{geminiReasoning}"
The stored correct answer is: {correctAnswer}

Verify or override this assessment.`;

function buildUserContent(
  q: RawQuestion,
  images: Array<{ buffer: Buffer; mediaType: string; label: string }>,
) {
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: Buffer; mimeType: string }
  > = [];

  if (q.stimuli?.description) {
    parts.push({
      type: "text",
      text: `[Stimulus material]\n${q.stimuli.description}`,
    });
  }

  for (const img of images) {
    parts.push({ type: "text", text: `[Image: ${img.label}]` });
    parts.push({ type: "image", image: img.buffer, mimeType: img.mediaType });
  }

  const cleanStem = (q.stem ?? "").replace(MD_IMAGE_RE, "").trim();
  parts.push({ type: "text", text: `\n[Question]\n${cleanStem}` });

  if (q.choices) {
    const choiceLines = Object.entries(q.choices)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([label, c]) =>
          `${label}. ${(c.text ?? "").replace(MD_IMAGE_RE, "").trim()}`,
      )
      .join("\n");
    parts.push({ type: "text", text: `\n[Choices]\n${choiceLines}` });
  }

  parts.push({
    type: "text",
    text: "\nReview this question thoroughly. Determine if it can be solved correctly with the information provided.",
  });

  return parts;
}

// ---------------------------------------------------------------------------
// Review one question
// ---------------------------------------------------------------------------

const MAX_RETRIES_PER_QUESTION = 5;
const RETRY_BASE_WAIT_MS = 60_000; // 首次限流等 1 分钟，指数递增

async function reviewQuestion(
  q: RawQuestion,
  geminiResult: GeminiScreenResult,
  model: string,
): Promise<SonnetReviewResult> {
  const startedAt = Date.now();

  const imageUrls = extractAllImageUrls(q);
  const images: Array<{ buffer: Buffer; mediaType: string; label: string }> =
    [];
  for (const url of imageUrls) {
    const img = await fetchImage(url);
    if (img) {
      images.push({ ...img, label: url.split("/").pop() ?? "image" });
    }
  }

  const systemPrompt = SYSTEM_PROMPT.replace(
    "{geminiVerdict}",
    geminiResult.verdict,
  )
    .replace("{geminiReasoning}", geminiResult.reasoning ?? "N/A")
    .replace("{correctAnswer}", geminiResult.correctAnswer ?? "N/A");

  const userContent = buildUserContent(q, images);

  for (let attempt = 0; attempt <= MAX_RETRIES_PER_QUESTION; attempt++) {
    try {
      const { object } = await generateStructuredObjectWithGateway({
        model,
        schema: ReviewSchema,
        systemPrompt,
        messages: [{ role: "user" as const, content: userContent }],
        maxTokens: 1500,
        temperature: 0,
        timeout: 90_000,
        maxRetries: 1,
      });

      const durationMs = Date.now() - startedAt;
      const correctAnswer = (q.correct_answer ?? "").trim().toUpperCase();
      const aiAnswer = (object.chosenAnswer ?? "").trim().toUpperCase();
      const reportedIssues = object.issues.filter(
        (i: string) => i !== "none",
      );

      let verdict: string;
      if (!object.canSolve || reportedIssues.length > 0) {
        if (reportedIssues.includes("missing_image"))
          verdict = "missing_image";
        else if (reportedIssues.includes("broken_image"))
          verdict = "broken_image";
        else if (reportedIssues.includes("image_text_mismatch"))
          verdict = "image_text_mismatch";
        else if (reportedIssues.includes("ambiguous")) verdict = "ambiguous";
        else if (reportedIssues.includes("unsolvable"))
          verdict = "unsolvable";
        else if (reportedIssues.includes("wrong_answer_suspected"))
          verdict = "wrong_answer";
        else verdict = "unsolvable";
      } else if (
        object.canSolve &&
        object.confidence >= 0.85 &&
        aiAnswer === correctAnswer
      ) {
        verdict = "valid";
      } else if (object.canSolve && aiAnswer !== correctAnswer) {
        verdict = "wrong_answer";
      } else {
        verdict = "valid";
      }

      return {
        id: q.id,
        verdict,
        aiAnswer: aiAnswer || null,
        correctAnswer: correctAnswer || null,
        confidence: object.confidence,
        reasoning: object.reasoning,
        issues: reportedIssues,
        modelId: model,
        geminiVerdict: geminiResult.verdict,
        durationMs,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isRateLimit =
        errMsg.includes("429") ||
        errMsg.includes("rate") ||
        errMsg.includes("quota") ||
        errMsg.includes("Resource has been exhausted") ||
        errMsg.includes("RESOURCE_EXHAUSTED");

      if (isRateLimit && attempt < MAX_RETRIES_PER_QUESTION) {
        const waitMs = RETRY_BASE_WAIT_MS * Math.pow(1.5, attempt);
        console.log(
          `    [限流] ${q.id.slice(0, 8)} 等待 ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES_PER_QUESTION})`,
        );
        await sleep(waitMs);
        continue;
      }

      // 超过重试次数或非限流错误：保留 Gemini verdict
      return {
        id: q.id,
        verdict: geminiResult.verdict,
        aiAnswer: null,
        correctAnswer: (q.correct_answer ?? "").trim().toUpperCase() || null,
        confidence: null,
        reasoning: `Review error (kept Gemini verdict): ${errMsg}`,
        issues: ["review_error"],
        modelId: model,
        geminiVerdict: geminiResult.verdict,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  // fallback (shouldn't reach here)
  return {
    id: q.id,
    verdict: geminiResult.verdict,
    aiAnswer: null,
    correctAnswer: (q.correct_answer ?? "").trim().toUpperCase() || null,
    confidence: null,
    reasoning: "Max retries exceeded",
    issues: ["review_error"],
    modelId: model,
    geminiVerdict: geminiResult.verdict,
    durationMs: Date.now() - startedAt,
  };
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

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Sleep
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Process one batch
// ---------------------------------------------------------------------------

async function processBatch(
  batchIndex: number,
  batch: BatchInfo,
  allQuestions: Map<string, RawQuestion>,
  geminiResultsMap: Map<string, GeminiScreenResult>,
  outDir: string,
  model: string,
  _concurrency: number,
  delayMs: number,
): Promise<SonnetReviewResult[]> {
  const resultPath = join(outDir, `batch-${batchIndex}-sonnet-results.json`);

  // 检查是否已有完整结果（断点恢复）
  if (existsSync(resultPath)) {
    const existing: SonnetReviewResult[] = JSON.parse(
      readFileSync(resultPath, "utf-8"),
    );
    if (existing.length === batch.questionIds.length) {
      console.log(
        `  [batch-${batchIndex}] 已有完整结果 (${existing.length} 题)，跳过`,
      );
      return existing;
    }
  }

  const questions = batch.questionIds
    .map((id) => ({
      question: allQuestions.get(id),
      geminiResult: geminiResultsMap.get(id),
    }))
    .filter(
      (d): d is { question: RawQuestion; geminiResult: GeminiScreenResult } =>
        !!d.question && !!d.geminiResult,
    );

  console.log(
    `  [batch-${batchIndex}] 开始处理 ${questions.length} 题 (${timeStr()})`,
  );

  // 加载已有的部分结果（增量恢复）
  const results: SonnetReviewResult[] = [];
  const doneIds = new Set<string>();
  if (existsSync(resultPath)) {
    const partial: SonnetReviewResult[] = JSON.parse(
      readFileSync(resultPath, "utf-8"),
    );
    results.push(...partial);
    for (const r of partial) doneIds.add(r.id);
    if (partial.length > 0) {
      console.log(
        `  [batch-${batchIndex}] 恢复 ${partial.length} 条已有结果`,
      );
    }
  }

  const remaining = questions.filter((q) => !doneIds.has(q.question.id));

  for (let i = 0; i < remaining.length; i++) {
    const item = remaining[i];
    const result = await reviewQuestion(item.question, item.geminiResult, model);
    results.push(result);

    const total = results.length;
    if (total % 5 === 0 || i === remaining.length - 1) {
      // 每 5 题增量保存
      writeFileSync(resultPath, JSON.stringify(results, null, 2));
      console.log(
        `  [batch-${batchIndex}] ${total}/${questions.length} (${result.verdict} ${result.durationMs}ms) [saved]`,
      );
    }

    // 请求间隔，避免限流
    if (i < remaining.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  // 最终保存
  writeFileSync(resultPath, JSON.stringify(results, null, 2));

  // 统计
  const counts: Record<string, number> = {};
  for (const r of results) {
    counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  }
  console.log(
    `  [batch-${batchIndex}] 完成: ${JSON.stringify(counts)} (${timeStr()})`,
  );

  return results;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[review] 启动 (${timeStr()}) model=${args.model} concurrency=${args.concurrency} stop=${args.stopHour}:00`,
  );

  // 找输出目录
  const auditDir = join(process.cwd(), "output");
  const dirs = require("node:fs")
    .readdirSync(auditDir)
    .filter((d: string) => d.startsWith("audit-"))
    .sort()
    .reverse();

  if (dirs.length === 0) {
    throw new Error("未找到 audit 输出目录");
  }

  const outDir = join(auditDir, dirs[0]);
  console.log(`[review] 输出目录: ${outDir}`);

  // 加载数据
  const allQuestions: RawQuestion[] = JSON.parse(
    readFileSync(join(outDir, "questions-all.json"), "utf-8"),
  );
  const geminiResults: GeminiScreenResult[] = JSON.parse(
    readFileSync(join(outDir, "gemini-screen-results.json"), "utf-8"),
  );

  const qMap = new Map(allQuestions.map((q) => [q.id, q]));
  const gMap = new Map(geminiResults.map((r) => [r.id, r]));

  // 主循环
  while (true) {
    // 时间检查
    if (shouldStop(args.stopHour)) {
      console.log(
        `\n[review] 已过 ${args.stopHour}:00，自动停止 (${timeStr()})`,
      );
      break;
    }

    // 读取最新进度
    const progressPath = join(outDir, "progress.json");
    const progress: Progress = JSON.parse(
      readFileSync(progressPath, "utf-8"),
    );

    // 找下一个 pending batch
    const pendingBatch = progress.batches.find((b) => b.status === "pending");
    if (!pendingBatch) {
      console.log(`\n[review] 所有 batch 已完成！(${timeStr()})`);
      break;
    }

    const batchIndex = pendingBatch.index;
    console.log(
      `\n[review] === Batch ${batchIndex}/${progress.batches.length - 1} === (${timeStr()})`,
    );

    try {
      const results = await processBatch(
        batchIndex,
        pendingBatch,
        qMap,
        gMap,
        outDir,
        args.model,
        args.concurrency,
        args.delayMs,
      );

      // 更新 progress.json
      progress.batches[batchIndex].status = "done";
      const doneCount = progress.batches.filter(
        (b) => b.status === "done",
      ).length;
      progress.completedBatches = doneCount;
      progress.completedCount = doneCount * (progress.batchSize ?? 50);
      writeFileSync(progressPath, JSON.stringify(progress, null, 2));

      console.log(
        `[review] 进度: ${doneCount}/${progress.batches.length} batches (${progress.completedCount} 题)`,
      );

      // 打印累计统计
      printCumulativeStats(outDir, progress);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // 错误时继续下一个 batch（限流已在请求级处理，此处只会是其他异常）
      console.error(`[review] Batch ${batchIndex} 错误: ${errMsg}`);
      console.log(`[review] 跳过此 batch，继续下一个...`);
      // 不标记为 done，下次重试
      continue;
    }
  }

  // 最终统计
  console.log(`\n[review] === 最终统计 === (${timeStr()})`);
  const finalProgress: Progress = JSON.parse(
    readFileSync(join(outDir, "progress.json"), "utf-8"),
  );
  printCumulativeStats(outDir, finalProgress);
  console.log("[review] 脚本结束");
}

// ---------------------------------------------------------------------------
// 累计统计
// ---------------------------------------------------------------------------

function printCumulativeStats(outDir: string, progress: Progress) {
  const allResults: SonnetReviewResult[] = [];

  for (const batch of progress.batches) {
    if (batch.status !== "done") continue;
    const resultPath = join(
      outDir,
      `batch-${batch.index}-sonnet-results.json`,
    );
    if (existsSync(resultPath)) {
      const batchResults: SonnetReviewResult[] = JSON.parse(
        readFileSync(resultPath, "utf-8"),
      );
      allResults.push(...batchResults);
    }
  }

  if (allResults.length === 0) return;

  const counts: Record<string, number> = {};
  for (const r of allResults) {
    counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  }

  // Gemini 修正统计
  let geminiOverrides = 0;
  let geminiConfirmed = 0;
  for (const r of allResults) {
    if (r.verdict === "valid" && r.geminiVerdict !== "valid") geminiOverrides++;
    else if (r.verdict !== "valid" && r.geminiVerdict !== "valid")
      geminiConfirmed++;
  }

  console.log(`  累计审查: ${allResults.length} 题`);
  for (const [v, c] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${v}: ${c}`);
  }
  console.log(
    `  Gemini 判断修正: ${geminiOverrides} 题翻为 valid | ${geminiConfirmed} 题确认有问题`,
  );
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error("[review] 致命错误:", err);
  process.exit(1);
});
