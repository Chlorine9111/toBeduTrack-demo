/**
 * Phase 0: 题库质量审查 — 数据导出 + 预检
 *
 * 功能：
 * 1. 从 questions LEFT JOIN stimuli 导出所有 active 题
 * 2. HTTP HEAD 检查每个图片 URL 是否可达
 * 3. FRQ → 直接标记 deprecated
 * 4. 规则预检（结构校验、图片关键词检测）
 *
 * 用法：
 *   pnpm tsx scripts/question-bank/audit-export-questions.ts [--write] [--course AP_CALC_AB] [--skip-http]
 *
 * --write    将 FRQ deprecated 写入数据库（默认 dry-run）
 * --course   只导出指定课程
 * --skip-http 跳过 HTTP 图片检查（加速调试）
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

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
  status: string;
  source_type: string | null;
  source_assessment: string | null;
  difficulty: string | null;
  stimuli: {
    content_type: string | null;
    description: string | null;
    image_url: string | null;
  } | null;
};

type ImageCheck = {
  url: string;
  source: string;
  status: "ok" | "broken" | "timeout" | "error";
  httpCode: number | null;
};

type PrecheckResult = {
  id: string;
  course: string;
  unit: number | null;
  questionNumber: number | null;
  questionType: string | null;
  category: "precheck_fail" | "has_images" | "text_only";
  verdict: string | null;
  issues: string[];
  imageUrls: string[];
  imageChecks: ImageCheck[];
};

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]) {
  const courseIdx = argv.indexOf("--course");
  return {
    write: argv.includes("--write"),
    skipHttp: argv.includes("--skip-http"),
    course: courseIdx >= 0 ? argv[courseIdx + 1] : null,
  };
}

// ---------------------------------------------------------------------------
// Image URL extraction
// ---------------------------------------------------------------------------

const MD_IMAGE_RE = /!\[[^\]]*]\(([^)]+)\)/g;

function extractAllImageUrls(q: RawQuestion): Array<{ url: string; source: string }> {
  const seen = new Set<string>();
  const results: Array<{ url: string; source: string }> = [];

  function add(url: string | null | undefined, source: string) {
    const trimmed = (url ?? "").trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    results.push({ url: trimmed, source });
  }

  // 1. stimulus direct image
  add(q.stimuli?.image_url, "stimulus.image_url");

  // 2. stimulus description markdown images
  const stimDesc = q.stimuli?.description ?? "";
  for (const m of stimDesc.matchAll(MD_IMAGE_RE)) {
    add(m[1], "stimulus.description");
  }

  // 3. stem markdown images
  const stem = q.stem ?? "";
  for (const m of stem.matchAll(MD_IMAGE_RE)) {
    add(m[1], "stem");
  }

  // 4. choices image_url + choices text markdown images
  if (q.choices) {
    for (const [label, choice] of Object.entries(q.choices)) {
      add(choice.image_url, `choices.${label}.image_url`);
      const text = choice.text ?? "";
      for (const m of text.matchAll(MD_IMAGE_RE)) {
        add(m[1], `choices.${label}.text`);
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// HTTP image check
// ---------------------------------------------------------------------------

async function checkImageUrl(url: string, source: string): Promise<ImageCheck> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const resp = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    return {
      url,
      source,
      status: resp.ok ? "ok" : "broken",
      httpCode: resp.status,
    };
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    return {
      url,
      source,
      status: isTimeout ? "timeout" : "error",
      httpCode: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Precheck rules
// ---------------------------------------------------------------------------

const IMAGE_HINT_KEYWORDS = [
  "the figure", "the graph", "the diagram", "the table above",
  "the chart", "shown above", "shown below", "as shown",
  "in the image", "the drawing", "the map", "the picture",
  "illustrated", "depicted", "represented",
  "figure above", "graph above", "table below",
];

const PLACEHOLDER_PATTERNS = [
  /\[figure\]/i, /\[graph\]/i, /\[image\]/i, /\[diagram\]/i,
  /\[图形\]/i, /\[图片\]/i, /\[图表\]/i,
];

function runPrecheck(q: RawQuestion, imageUrls: Array<{ url: string; source: string }>, imageChecks: ImageCheck[]): PrecheckResult {
  const issues: string[] = [];
  let verdict: string | null = null;
  const stemLower = (q.stem ?? "").toLowerCase();
  const choiceKeys = q.choices ? Object.keys(q.choices) : [];

  // Rule 1: FRQ → precheck_fail
  if (q.question_type === "frq") {
    issues.push("FRQ 题型，无有效数据");
    verdict = "precheck_fail";
  }

  // Rule 2: orphan stimulus
  if (!verdict && q.stimulus_dependent && !q.stimulus_id) {
    issues.push("stimulus_dependent=true 但 stimulus_id 为空");
    verdict = "missing_image";
  }

  // Rule 3: broken images
  if (!verdict) {
    const broken = imageChecks.filter((c) => c.status !== "ok");
    if (broken.length > 0) {
      for (const b of broken) {
        issues.push(`图片不可达: ${b.source} → ${b.url} (${b.status} ${b.httpCode ?? ""})`);
      }
      verdict = "broken_image";
    }
  }

  // Rule 4: stem implies image but none found
  if (!verdict && imageUrls.length === 0) {
    const hasHint = IMAGE_HINT_KEYWORDS.some((kw) => stemLower.includes(kw));
    if (hasHint) {
      issues.push("题干暗示需要图片但未找到任何图片 URL");
      verdict = "missing_image";
    }
  }

  // Rule 5: choice placeholder without image
  if (!verdict && q.choices) {
    for (const [label, choice] of Object.entries(q.choices)) {
      const text = choice.text ?? "";
      const hasPlaceholder = PLACEHOLDER_PATTERNS.some((p) => p.test(text));
      if (hasPlaceholder && !choice.image_url) {
        issues.push(`选项 ${label} 含图片占位符但无 image_url`);
        verdict = "missing_image";
      }
    }
  }

  // Rule 6: MCQ structural checks
  if (!verdict && q.question_type !== "frq") {
    if (!q.stem?.trim()) {
      issues.push("题干为空");
      verdict = "precheck_fail";
    }
    if (choiceKeys.length !== 4 && choiceKeys.length !== 5) {
      issues.push(`选项数量异常: ${choiceKeys.length}（期望 4 或 5）`);
      verdict = "precheck_fail";
    }
    if (q.correct_answer && !choiceKeys.includes(q.correct_answer)) {
      issues.push(`correct_answer '${q.correct_answer}' 不在选项中`);
      verdict = "precheck_fail";
    }
  }

  // Categorize
  let category: PrecheckResult["category"];
  if (verdict) {
    category = "precheck_fail";
  } else if (imageUrls.length > 0) {
    category = "has_images";
  } else {
    category = "text_only";
  }

  return {
    id: q.id,
    course: q.course,
    unit: q.unit,
    questionNumber: q.question_number,
    questionType: q.question_type,
    category,
    verdict,
    issues,
    imageUrls: imageUrls.map((i) => i.url),
    imageChecks,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = createAdminSupabaseClient();

  const runDate = new Date().toISOString().slice(0, 10);
  const outDir = join(process.cwd(), "output", `audit-${runDate}`);
  mkdirSync(outDir, { recursive: true });

  console.log(`[audit-export] mode=${args.write ? "write" : "dry-run"} course=${args.course ?? "all"} skipHttp=${args.skipHttp}`);
  console.log(`[audit-export] output → ${outDir}`);

  // --- Fetch all active questions ---
  const PAGE_SIZE = 500;
  const allQuestions: RawQuestion[] = [];
  let from = 0;

  while (true) {
    let query = db
      .from("questions")
      .select(
        "id, course, unit, question_number, question_type, stem, choices, correct_answer, explanation, stimulus_id, stimulus_dependent, standalone_usable, status, source_type, source_assessment, difficulty, stimuli(content_type, description, image_url)",
      )
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (args.course) {
      query = query.eq("course", args.course);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`查询失败 (offset=${from}): ${error.message}`);
    }
    if (!data || data.length === 0) break;

    // supabase returns stimuli as array when using select joins, take first
    for (const row of data) {
      const r = row as Record<string, unknown>;
      if (Array.isArray(r.stimuli)) {
        r.stimuli = r.stimuli[0] ?? null;
      }
    }

    allQuestions.push(...(data as unknown as RawQuestion[]));
    console.log(`  fetched ${allQuestions.length} questions...`);
    from += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }

  console.log(`[audit-export] total active questions: ${allQuestions.length}`);

  // --- Write raw export ---
  writeFileSync(join(outDir, "questions-all.json"), JSON.stringify(allQuestions, null, 2));
  console.log(`[audit-export] wrote questions-all.json`);

  // --- Run precheck ---
  const results: PrecheckResult[] = [];
  let httpChecked = 0;

  for (let i = 0; i < allQuestions.length; i++) {
    const q = allQuestions[i];
    const imageUrls = extractAllImageUrls(q);

    // HTTP check (only for absolute URLs, skip relative /api/ paths in script context)
    let imageChecks: ImageCheck[] = [];
    if (!args.skipHttp && imageUrls.length > 0) {
      const checkableUrls = imageUrls.filter(
        (u) => u.url.startsWith("http://") || u.url.startsWith("https://"),
      );
      if (checkableUrls.length > 0) {
        imageChecks = await Promise.all(
          checkableUrls.map((u) => checkImageUrl(u.url, u.source)),
        );
        httpChecked += checkableUrls.length;
      }
    }

    const result = runPrecheck(q, imageUrls, imageChecks);
    results.push(result);

    if ((i + 1) % 500 === 0) {
      console.log(`  precheck progress: ${i + 1}/${allQuestions.length} (http checks: ${httpChecked})`);
    }
  }

  // --- Write precheck results ---
  writeFileSync(join(outDir, "precheck-results.json"), JSON.stringify(results, null, 2));

  // --- Summary ---
  const summary = {
    runDate,
    totalActive: allQuestions.length,
    byQuestionType: {} as Record<string, number>,
    byCategory: { precheck_fail: 0, has_images: 0, text_only: 0 },
    byVerdict: {} as Record<string, number>,
    byCourse: {} as Record<string, { total: number; precheck_fail: number; has_images: number; text_only: number }>,
    httpChecks: { total: httpChecked, broken: 0 },
    frqCount: 0,
  };

  for (const r of results) {
    // by question type
    const qt = r.questionType ?? "unknown";
    summary.byQuestionType[qt] = (summary.byQuestionType[qt] ?? 0) + 1;

    // by category
    summary.byCategory[r.category]++;

    // by verdict
    if (r.verdict) {
      summary.byVerdict[r.verdict] = (summary.byVerdict[r.verdict] ?? 0) + 1;
    }

    // by course
    if (!summary.byCourse[r.course]) {
      summary.byCourse[r.course] = { total: 0, precheck_fail: 0, has_images: 0, text_only: 0 };
    }
    summary.byCourse[r.course].total++;
    summary.byCourse[r.course][r.category]++;

    // frq count
    if (r.questionType === "frq") summary.frqCount++;

    // broken http
    if (r.imageChecks.some((c) => c.status !== "ok")) summary.httpChecks.broken++;
  }

  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

  // --- Print summary ---
  console.log("\n===== 审查预检摘要 =====");
  console.log(`总 active 题数: ${summary.totalActive}`);
  console.log(`题型分布: ${JSON.stringify(summary.byQuestionType)}`);
  console.log(`分类结果:`);
  console.log(`  precheck_fail: ${summary.byCategory.precheck_fail}`);
  console.log(`  has_images (需 AI 审查): ${summary.byCategory.has_images}`);
  console.log(`  text_only (低风险): ${summary.byCategory.text_only}`);
  console.log(`问题类型:`);
  for (const [v, count] of Object.entries(summary.byVerdict)) {
    console.log(`  ${v}: ${count}`);
  }
  console.log(`HTTP 图片检查: ${summary.httpChecks.total} 个 URL, ${summary.httpChecks.broken} 个不可达`);
  console.log(`FRQ 题数: ${summary.frqCount}`);
  console.log(`\n按课程统计:`);
  for (const [course, stats] of Object.entries(summary.byCourse).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${course}: total=${stats.total} fail=${stats.precheck_fail} images=${stats.has_images} text=${stats.text_only}`);
  }

  // --- FRQ deprecation ---
  const frqIds = results.filter((r) => r.questionType === "frq").map((r) => r.id);
  if (frqIds.length > 0) {
    console.log(`\nFRQ 题目: ${frqIds.length} 道`);
    if (args.write) {
      const BATCH = 200;
      for (let i = 0; i < frqIds.length; i += BATCH) {
        const batch = frqIds.slice(i, i + BATCH);
        const { error } = await db
          .from("questions")
          .update({ status: "deprecated" })
          .in("id", batch);
        if (error) {
          console.error(`FRQ deprecation batch failed: ${error.message}`);
        } else {
          console.log(`  deprecated FRQ batch ${i}-${i + batch.length}`);
        }
      }
    } else {
      console.log("  [dry-run] 未写入数据库，使用 --write 执行");
    }
  }

  // --- Write progress.json for Phase 1 ---
  const needsAiReview = results.filter((r) => r.category === "has_images");
  const BATCH_SIZE = 50;
  const batches = [];
  for (let i = 0; i < needsAiReview.length; i += BATCH_SIZE) {
    batches.push({
      index: batches.length,
      status: "pending",
      questionIds: needsAiReview.slice(i, i + BATCH_SIZE).map((r) => r.id),
    });
  }

  const progress = {
    runDate,
    totalNeedsAiReview: needsAiReview.length,
    completedCount: 0,
    lastBatchIndex: -1,
    batchSize: BATCH_SIZE,
    batches,
  };

  writeFileSync(join(outDir, "progress.json"), JSON.stringify(progress, null, 2));
  console.log(`\n[audit-export] progress.json 已生成: ${batches.length} 个 batch, 每批 ${BATCH_SIZE} 题`);
  console.log(`[audit-export] 完成！输出目录: ${outDir}`);
}

main().catch((err) => {
  console.error("[audit-export] failed");
  console.error(err);
  process.exit(1);
});
