import { execFileSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type Args = {
  dryRun: boolean;
  limit: number | null;
  batchSize: number;
};

type QuestionRow = {
  id: string;
  course: string | null;
  source_assessment: string | null;
  question_number: number | null;
  stem: string | null;
  stimulus_id: string | null;
  status: string | null;
};

type StimulusRow = {
  id: string;
  image_url: string | null;
  description: string | null;
  status: string | null;
};

type OCRResult = {
  path: string;
  text?: string | null;
  error?: string | null;
};

type MarkerRule = {
  id: string;
  score: number;
  patterns: RegExp[];
  minMatches?: number;
};

type MarkerHit = {
  id: string;
  score: number;
  matches: string[];
};

type AuditResult = {
  flagged: boolean;
  totalScore: number;
  hits: MarkerHit[];
  previewText: string;
};

type FlaggedStimulus = {
  stimulus: StimulusRow;
  audit: AuditResult;
  questions: QuestionRow[];
};

type DownloadResult = {
  stimulus: StimulusRow;
  path: string;
} | {
  stimulus: StimulusRow;
  error: string;
};

const COURSE_TARGETS = ["AP_CALC_AB", "AP_CALC_BC"];
const PAGE_SIZE = 1000;
const OCR_BATCH_SIZE = 20;
const DOWNLOAD_CONCURRENCY = 4;
const REPORT_DIR = path.join(process.cwd(), "tmp", "stimulus-audit");
const DOWNLOAD_DIR = path.join(REPORT_DIR, "images");
const OCR_BINARY = path.join(REPORT_DIR, "ocr-stimulus-text");
const OCR_SOURCE = path.join(process.cwd(), "scripts/question-bank/ocr-stimulus-text.swift");

const MARKER_RULES: MarkerRule[] = [
  {
    id: "name_fields",
    score: 4,
    minMatches: 2,
    patterns: [/chinese name/i, /class number/i],
  },
  {
    id: "ap_calc_title",
    score: 4,
    minMatches: 2,
    patterns: [/ap calculus/i, /midterm examination/i],
  },
  {
    id: "section_header",
    score: 3,
    minMatches: 1,
    patterns: [/section i\b/i, /section ii\b/i],
  },
  {
    id: "mcq_frq_header",
    score: 2,
    minMatches: 1,
    patterns: [/\bmcq\b/i, /\bfrq\b/i],
  },
  {
    id: "question_count",
    score: 2,
    minMatches: 1,
    patterns: [/number of questions/i],
  },
  {
    id: "directions_label",
    score: 2,
    minMatches: 1,
    patterns: [/directions:/i],
  },
  {
    id: "no_calculator",
    score: 3,
    minMatches: 1,
    patterns: [/no calculator/i],
  },
  {
    id: "scratch_work",
    score: 2,
    minMatches: 1,
    patterns: [/scratch work/i, /available space for scratch work/i],
  },
  {
    id: "no_credit",
    score: 3,
    minMatches: 1,
    patterns: [/no credit will be given/i],
  },
  {
    id: "time_warning",
    score: 3,
    minMatches: 1,
    patterns: [/do not spend too much time/i, /decimal approximation/i, /three places after the decimal point/i],
  },
];

function parseArgs(argv: string[]): Args {
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const batchArg = argv.find((arg) => arg.startsWith("--batch-size="));
  const parsedLimit = limitArg ? Number.parseInt(limitArg.slice("--limit=".length), 10) : null;
  const parsedBatch = batchArg ? Number.parseInt(batchArg.slice("--batch-size=".length), 10) : OCR_BATCH_SIZE;

  return {
    dryRun: !argv.includes("--write"),
    limit: Number.isFinite(parsedLimit) ? parsedLimit : null,
    batchSize: Number.isFinite(parsedBatch) && parsedBatch > 0 ? parsedBatch : OCR_BATCH_SIZE,
  };
}

function normalizeText(value: string | null | undefined) {
  return `${value ?? ""}`
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .trim()
    .toLowerCase();
}

function chunk<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function inferExtension(imageUrl: string | null) {
  try {
    const url = new URL(`${imageUrl ?? ""}`);
    const ext = path.extname(url.pathname);
    return ext || ".png";
  } catch {
    return ".png";
  }
}

function extractStorageTarget(imageUrl: string | null) {
  const normalized = `${imageUrl ?? ""}`.trim();
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    const publicMatch = url.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/i);
    if (publicMatch?.[1] && publicMatch?.[2]) {
      return {
        bucket: decodeURIComponent(publicMatch[1]),
        objectPath: decodeURIComponent(publicMatch[2]),
      };
    }

    if (/\/api\/pdf\/scan-image$/i.test(url.pathname)) {
      const objectPath = `${url.searchParams.get("path") ?? ""}`.trim();
      if (objectPath) {
        return {
          bucket: process.env.QUESTION_IMAGE_BUCKET ?? "pdfs",
          objectPath,
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

function ensureReportDirs() {
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

function ensureOcrBinary() {
  ensureReportDirs();
  const sourceStat = statSync(OCR_SOURCE);
  const shouldCompile =
    !existsSync(OCR_BINARY) || statSync(OCR_BINARY).mtimeMs < sourceStat.mtimeMs;

  if (!shouldCompile) {
    return OCR_BINARY;
  }

  execFileSync("swiftc", ["-O", OCR_SOURCE, "-o", OCR_BINARY], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  return OCR_BINARY;
}

async function fetchAllCandidateQuestions(
  db: ReturnType<typeof createAdminSupabaseClient>,
  limit: number | null,
) {
  const rows: QuestionRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await db
      .from("questions")
      .select("id, course, source_assessment, question_number, stem, stimulus_id, status")
      .in("course", COURSE_TARGETS)
      .eq("status", "active")
      .not("stimulus_id", "is", null)
      .range(from, to);

    if (error) {
      throw new Error(`读取 candidate questions 失败: ${error.message}`);
    }

    if (!data?.length) {
      break;
    }

    rows.push(...(data as QuestionRow[]));
    if (limit && rows.length >= limit) {
      return rows.slice(0, limit);
    }

    if (data.length < PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function fetchStimuliByIds(
  db: ReturnType<typeof createAdminSupabaseClient>,
  ids: string[],
) {
  const output = new Map<string, StimulusRow>();

  for (const batch of chunk(ids, 200)) {
    const { data, error } = await db
      .from("stimuli")
      .select("id, image_url, description, status")
      .in("id", batch);

    if (error) {
      throw new Error(`读取 stimuli 失败: ${error.message}`);
    }

    for (const row of (data ?? []) as StimulusRow[]) {
      output.set(row.id, row);
    }
  }

  return output;
}

async function downloadStimulus(stimulus: StimulusRow) {
  if (!stimulus.image_url) {
    throw new Error(`stimulus ${stimulus.id} 缺少 image_url`);
  }

  const ext = inferExtension(stimulus.image_url);
  const targetPath = path.join(DOWNLOAD_DIR, `${stimulus.id}${ext}`);
  if (existsSync(targetPath)) {
    return targetPath;
  }

  const admin = createAdminSupabaseClient();
  const storageTarget = extractStorageTarget(stimulus.image_url);
  if (storageTarget) {
    const { data, error } = await admin.storage
      .from(storageTarget.bucket)
      .download(storageTarget.objectPath);
    if (error || !data) {
      throw new Error(
        `下载 stimulus ${stimulus.id} 失败: storage ${storageTarget.bucket}/${storageTarget.objectPath} ${error?.message ?? "missing_blob"}`,
      );
    }
    writeFileSync(targetPath, Buffer.from(await data.arrayBuffer()));
    return targetPath;
  }

  const response = await fetch(stimulus.image_url);
  if (!response.ok) {
    throw new Error(`下载 stimulus ${stimulus.id} 失败: ${response.status} ${response.statusText}`);
  }

  writeFileSync(targetPath, Buffer.from(await response.arrayBuffer()));
  return targetPath;
}

function auditOcrText(text: string | null | undefined): AuditResult {
  const normalized = normalizeText(text);
  const hits: MarkerHit[] = [];

  for (const rule of MARKER_RULES) {
    const matches = rule.patterns
      .map((pattern) => normalized.match(pattern)?.[0] ?? null)
      .filter((value): value is string => Boolean(value));

    const minMatches = rule.minMatches ?? 1;
    if (matches.length >= minMatches) {
      hits.push({
        id: rule.id,
        score: rule.score,
        matches,
      });
    }
  }

  const totalScore = hits.reduce((sum, hit) => sum + hit.score, 0);
  const hitIds = new Set(hits.map((hit) => hit.id));
  const flagged =
    (hitIds.has("name_fields") && (hitIds.has("section_header") || hitIds.has("ap_calc_title"))) ||
    (hitIds.has("section_header") &&
      hitIds.has("directions_label") &&
      (hitIds.has("question_count") || hitIds.has("scratch_work") || hitIds.has("no_credit"))) ||
    (hitIds.has("section_header") &&
      hitIds.has("mcq_frq_header") &&
      (hitIds.has("question_count") || hitIds.has("directions_label"))) ||
    (totalScore >= 8 && hits.length >= 3);

  return {
    flagged,
    totalScore,
    hits,
    previewText: normalized.slice(0, 240),
  };
}

function runOcrBatch(binary: string, imagePaths: string[]) {
  const raw = execFileSync(binary, imagePaths, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });

  return JSON.parse(raw) as OCRResult[];
}

async function collectFlaggedStimuli(
  questions: QuestionRow[],
  stimuliById: Map<string, StimulusRow>,
  batchSize: number,
) {
  ensureReportDirs();
  const binary = ensureOcrBinary();
  const questionsByStimulusId = new Map<string, QuestionRow[]>();

  for (const question of questions) {
    if (!question.stimulus_id) {
      continue;
    }
    const bucket = questionsByStimulusId.get(question.stimulus_id) ?? [];
    bucket.push(question);
    questionsByStimulusId.set(question.stimulus_id, bucket);
  }

  const stimuli = [...questionsByStimulusId.keys()]
    .map((id) => stimuliById.get(id))
    .filter((row): row is StimulusRow => Boolean(row?.id) && Boolean(row.image_url));

  const downloadResults: DownloadResult[] = [];
  let processedDownloads = 0;
  for (const stimulusBatch of chunk(stimuli, DOWNLOAD_CONCURRENCY)) {
    const batchResults = await Promise.all(
      stimulusBatch.map(async (stimulus) => {
        try {
          return {
            stimulus,
            path: await downloadStimulus(stimulus),
          } satisfies DownloadResult;
        } catch (error) {
          return {
            stimulus,
            error: error instanceof Error ? error.message : "download_failed",
          } satisfies DownloadResult;
        }
      }),
    );
    downloadResults.push(...batchResults);
    processedDownloads += batchResults.length;
    if (processedDownloads % 50 === 0 || processedDownloads === stimuli.length) {
      console.log(`[download-progress] ${processedDownloads}/${stimuli.length}`);
    }
  }

  const downloadPairs = downloadResults.filter(
    (result): result is Extract<DownloadResult, { path: string }> => "path" in result,
  );
  const failedDownloads = downloadResults.filter(
    (result): result is Extract<DownloadResult, { error: string }> => "error" in result,
  );

  for (const failed of failedDownloads.slice(0, 20)) {
    console.warn(
      `[download-skip] stimulus=${failed.stimulus.id} image=${failed.stimulus.image_url} error=${failed.error}`,
    );
  }

  const flagged: FlaggedStimulus[] = [];
  let processedBatches = 0;
  for (const batch of chunk(downloadPairs, batchSize)) {
    const results = runOcrBatch(
      binary,
      batch.map((pair) => pair.path),
    );
    const resultByPath = new Map(results.map((result) => [path.resolve(result.path), result]));

    for (const pair of batch) {
      const result = resultByPath.get(path.resolve(pair.path));
      if (!result || result.error) {
        continue;
      }

      const audit = auditOcrText(result.text);
      if (!audit.flagged) {
        continue;
      }

      flagged.push({
        stimulus: pair.stimulus,
        audit,
        questions: questionsByStimulusId.get(pair.stimulus.id) ?? [],
      });
    }
    processedBatches += batch.length;
    if (processedBatches % 100 === 0 || processedBatches === downloadPairs.length) {
      console.log(`[ocr-progress] ${processedBatches}/${downloadPairs.length}`);
    }
  }

  return flagged.sort((left, right) => right.audit.totalScore - left.audit.totalScore);
}

async function writeDeprecations(
  db: ReturnType<typeof createAdminSupabaseClient>,
  flaggedStimuli: FlaggedStimulus[],
) {
  const touchedQuestions = new Set<string>();
  const touchedStimuli = new Set<string>();

  for (const flagged of flaggedStimuli) {
    for (const question of flagged.questions) {
      if (question.status === "deprecated" || touchedQuestions.has(question.id)) {
        continue;
      }
      const { error } = await db
        .from("questions")
        .update({ status: "deprecated" })
        .eq("id", question.id)
        .eq("status", "active");
      if (error) {
        throw new Error(`更新问题 ${question.id} 失败: ${error.message}`);
      }
      touchedQuestions.add(question.id);
      console.log(`  question deprecated=${question.id}`);
    }

    if (flagged.stimulus.status !== "deprecated" && !touchedStimuli.has(flagged.stimulus.id)) {
      const { error } = await db
        .from("stimuli")
        .update({ status: "deprecated" })
        .eq("id", flagged.stimulus.id)
        .eq("status", "active");
      if (error) {
        throw new Error(`更新 stimulus ${flagged.stimulus.id} 失败: ${error.message}`);
      }
      touchedStimuli.add(flagged.stimulus.id);
      console.log(`  stimulus deprecated=${flagged.stimulus.id}`);
    }
  }

  return {
    deprecatedQuestionCount: touchedQuestions.size,
    deprecatedStimulusCount: touchedStimuli.size,
  };
}

function writeReport(flaggedStimuli: FlaggedStimulus[], questions: QuestionRow[]) {
  ensureReportDirs();
  const reportPath = path.join(REPORT_DIR, "instruction-stimulus-report.json");
  const report = {
    scannedQuestionCount: questions.length,
    flaggedStimulusCount: flaggedStimuli.length,
    generatedAt: new Date().toISOString(),
    flaggedStimuli: flaggedStimuli.map((item) => ({
      stimulusId: item.stimulus.id,
      stimulusStatus: item.stimulus.status,
      imageUrl: item.stimulus.image_url,
      description: item.stimulus.description,
      totalScore: item.audit.totalScore,
      markerIds: item.audit.hits.map((hit) => hit.id),
      previewText: item.audit.previewText,
      questions: item.questions.map((question) => ({
        id: question.id,
        course: question.course,
        sourceAssessment: question.source_assessment,
        questionNumber: question.question_number,
        stemPreview: `${question.stem ?? ""}`.slice(0, 160),
      })),
    })),
  };

  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = createAdminSupabaseClient();

  console.log(
    `[deprecate-instruction-stimuli] mode=${args.dryRun ? "dry-run" : "write"} courses=${COURSE_TARGETS.join(",")} limit=${args.limit ?? "all"}`,
  );

  const questions = await fetchAllCandidateQuestions(db, args.limit);
  const stimulusIds = [...new Set(questions.map((question) => question.stimulus_id).filter((id): id is string => Boolean(id)))];
  const stimuliById = await fetchStimuliByIds(db, stimulusIds);
  const flaggedStimuli = await collectFlaggedStimuli(questions, stimuliById, args.batchSize);
  const reportPath = writeReport(flaggedStimuli, questions);

  console.log(
    `[summary] scanned_questions=${questions.length} unique_stimuli=${stimulusIds.length} flagged_stimuli=${flaggedStimuli.length} report=${reportPath}`,
  );

  for (const flagged of flaggedStimuli.slice(0, 20)) {
    console.log(
      `[flagged] stimulus=${flagged.stimulus.id} score=${flagged.audit.totalScore} markers=${flagged.audit.hits.map((hit) => hit.id).join(",")} image=${flagged.stimulus.image_url}`,
    );
    console.log(`  preview=${flagged.audit.previewText}`);
    for (const question of flagged.questions) {
      console.log(
        `  question=${question.id} course=${question.course} q=${question.question_number} source=${question.source_assessment}`,
      );
    }
  }

  if (args.dryRun) {
    return;
  }

  const result = await writeDeprecations(db, flaggedStimuli);
  console.log(
    `[write-summary] deprecated_questions=${result.deprecatedQuestionCount} deprecated_stimuli=${result.deprecatedStimulusCount}`,
  );
}

main().catch((error) => {
  console.error("[deprecate-instruction-stimuli] failed");
  console.error(error);
  process.exit(1);
});
