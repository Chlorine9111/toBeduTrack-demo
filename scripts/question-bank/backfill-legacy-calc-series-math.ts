import type { Database, Json } from "../../types/database";
import type { ApQuestionBankChoice } from "../../lib/question-bank/ap-types";

type QuestionRow = Pick<
  Database["public"]["Tables"]["questions"]["Row"],
  | "id"
  | "status"
  | "course"
  | "unit"
  | "question_number"
  | "stem"
  | "choices"
  | "correct_answer"
  | "explanation"
  | "parts"
>;

type ScriptArgs = {
  dryRun: boolean;
  limit: number | null;
  pageSize: number;
  sampleSize: number;
};

const TARGET_COURSES = new Set(["AP_CALC_BC"]);
const CALC_SERIES_FILTERS = [
  String.raw`stem.ilike.%\\cos($%`,
  String.raw`stem.ilike.%\\sin($%`,
  String.raw`stem.ilike.%\\tan($%`,
  String.raw`stem.ilike.%\\ln($%`,
  String.raw`stem.ilike.%\\log($%`,
  String.raw`explanation.ilike.%\\Sigma%`,
  String.raw`explanation.ilike.%$= \\Sigma%`,
  String.raw`stem.ilike.%$[%`,
  String.raw`stem.ilike.%]\/%`,
].join(",");
const SUSPICIOUS_CALC_MATH_PATTERN =
  /\\(?:cos|sin|tan|log|ln|exp)\(\$|\\(?:frac|dfrac|tfrac|cfrac)\{\s*\$?[^$\n]+?\$?\s*\}\{\s*\$?[^$\n]+?\$?\}|(?:^|[\s(])\$[^$\n]*\\(?:frac|cos|sin|tan|sum|Sigma)[^$\n]*$|\\Sigma\b|(?:^|[\s(])[A-Za-z]\s+\$[=<>][^$\n]+?\$|\$((?:\\)?(?:sin|cos|tan|log|ln|exp)(?:\^\{-1\}|\^\{[^}]+\})?)\$\s+[A-Za-z]|(?:Maclaurin|Taylor|power series|series)/i;

function parseArgs(argv: string[]): ScriptArgs {
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const pageSizeArg = argv.find((arg) => arg.startsWith("--page-size="));
  const sampleSizeArg = argv.find((arg) => arg.startsWith("--sample-size="));

  return {
    dryRun: !argv.includes("--write"),
    limit: limitArg ? Number.parseInt(limitArg.split("=")[1] ?? "", 10) || null : null,
    pageSize: pageSizeArg ? Math.max(1, Number.parseInt(pageSizeArg.split("=")[1] ?? "", 10) || 200) : 200,
    sampleSize: sampleSizeArg ? Math.max(0, Number.parseInt(sampleSizeArg.split("=")[1] ?? "", 10) || 8) : 8,
  };
}

function stableJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeQuestionChoices(
  raw: Record<string, ApQuestionBankChoice> | null | undefined,
  normalizeStoredExerciseText: (value: string) => string,
) {
  if (!raw || typeof raw !== "object") return null;

  const entries = Object.entries(raw).map(([label, choice]) => {
    const nextChoice: ApQuestionBankChoice = {
      ...choice,
      text: normalizeStoredExerciseText(choice?.text ?? ""),
      misconception:
        choice?.misconception == null
          ? null
          : normalizeStoredExerciseText(choice.misconception),
    };
    return [label, nextChoice] as const;
  });

  return Object.fromEntries(entries) as Record<string, ApQuestionBankChoice>;
}

function normalizeQuestionJson(
  value: Json | null,
  normalizeStoredExerciseText: (value: string) => string,
): Json | null {
  if (value == null) return value;
  if (typeof value === "string") {
    return normalizeStoredExerciseText(value) as Json;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeQuestionJson(item as Json, normalizeStoredExerciseText)) as Json;
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeQuestionJson(item as Json, normalizeStoredExerciseText),
      ]),
    ) as Json;
  }
  return value;
}

function looksLikeLegacyCalcSeriesMath(row: QuestionRow) {
  if (!TARGET_COURSES.has(row.course)) {
    return false;
  }

  const combined = [
    row.stem ?? "",
    row.correct_answer ?? "",
    row.explanation ?? "",
    JSON.stringify(row.choices ?? null),
    JSON.stringify(row.parts ?? null),
  ].join("\n");

  return SUSPICIOUS_CALC_MATH_PATTERN.test(combined);
}

async function applyUpdates(updates: Array<Record<string, unknown> & { id: string }>) {
  const supabaseModule = await import("../../lib/supabase/admin.ts");
  const supabaseExports =
    "default" in supabaseModule && supabaseModule.default ? supabaseModule.default : supabaseModule;
  const { createAdminSupabaseClient } = supabaseExports as typeof import("../../lib/supabase/admin");
  const db = createAdminSupabaseClient();

  for (const batch of chunkArray(updates, 4)) {
    const results = await Promise.all(
      batch.map((item) => {
        const { id, ...update } = item;
        return db.from("questions").update(update).eq("id", id);
      }),
    );

    const failed = results.find((result) => result.error);
    if (failed?.error) {
      throw new Error(`批量更新 questions 失败：${failed.error.message}`);
    }
  }
}

async function main() {
  console.error("[backfill-legacy-calc-series-math] boot");
  const contentModule = await import("../../lib/exercises/content.ts");
  const contentExports =
    "default" in contentModule && contentModule.default ? contentModule.default : contentModule;
  const { normalizeStoredExerciseText } = contentExports as typeof import("../../lib/exercises/content");
  const supabaseModule = await import("../../lib/supabase/admin.ts");
  const supabaseExports =
    "default" in supabaseModule && supabaseModule.default ? supabaseModule.default : supabaseModule;
  const { createAdminSupabaseClient } = supabaseExports as typeof import("../../lib/supabase/admin");
  const args = parseArgs(process.argv.slice(2));
  const db = createAdminSupabaseClient();
  console.error("[backfill-legacy-calc-series-math] imports-ready");

  let from = 0;
  let scanned = 0;
  let candidates = 0;
  let changed = 0;
  let updated = 0;
  const samples: Array<Record<string, string | number | null>> = [];

  while (true) {
    console.error(`[backfill-legacy-calc-series-math] query from=${from}`);
    const { data, error } = await db
      .from("questions")
      .select("id,status,course,unit,question_number,stem,choices,correct_answer,explanation,parts")
      .neq("status", "deprecated")
      .in("course", [...TARGET_COURSES])
      .or(CALC_SERIES_FILTERS)
      .order("created_at", { ascending: true })
      .range(from, from + args.pageSize - 1);

    if (error) {
      throw new Error(`读取 questions 失败：${error.message}`);
    }

    const rows = (data ?? []) as QuestionRow[];
    console.error(`[backfill-legacy-calc-series-math] rows=${rows.length}`);
    if (rows.length === 0) {
      break;
    }

    const pendingUpdates: Array<Record<string, unknown> & { id: string }> = [];

    for (const row of rows) {
      if (args.limit != null && scanned >= args.limit) {
        break;
      }

      scanned += 1;
      console.error(
        `[backfill-legacy-calc-series-math] row ${scanned} id=${row.id} unit=${row.unit} q=${row.question_number}`,
      );
      if (!looksLikeLegacyCalcSeriesMath(row)) {
        continue;
      }

      candidates += 1;

      const nextStem = normalizeStoredExerciseText(row.stem ?? "");
      const nextChoices = normalizeQuestionChoices(
        row.choices as Record<string, ApQuestionBankChoice> | null,
        normalizeStoredExerciseText,
      );
      const nextCorrectAnswer =
        row.correct_answer == null ? null : normalizeStoredExerciseText(row.correct_answer);
      const nextExplanation =
        row.explanation == null ? null : normalizeStoredExerciseText(row.explanation);
      const nextParts = normalizeQuestionJson(row.parts, normalizeStoredExerciseText);

      const rowChanged =
        stableJson(row.stem) !== stableJson(nextStem) ||
        stableJson(row.choices) !== stableJson(nextChoices) ||
        stableJson(row.correct_answer) !== stableJson(nextCorrectAnswer) ||
        stableJson(row.explanation) !== stableJson(nextExplanation) ||
        stableJson(row.parts) !== stableJson(nextParts);

      if (!rowChanged) {
        continue;
      }

      changed += 1;
      if (samples.length < args.sampleSize) {
        samples.push({
          id: row.id,
          course: row.course,
          unit: row.unit,
          questionNumber: row.question_number,
          beforeStem: (row.stem ?? "").slice(0, 220),
          afterStem: nextStem.slice(0, 220),
        });
      }

      if (!args.dryRun) {
        pendingUpdates.push({
          id: row.id,
          stem: nextStem,
          choices: nextChoices as unknown as Json,
          correct_answer: nextCorrectAnswer,
          explanation: nextExplanation,
          parts: nextParts,
        });
      }
    }

    if (!args.dryRun && pendingUpdates.length > 0) {
      await applyUpdates(pendingUpdates);
      updated += pendingUpdates.length;
    }

    from += rows.length;
    if (args.limit != null && scanned >= args.limit) {
      break;
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun: args.dryRun,
        scanned,
        candidates,
        changed,
        updated,
        samples,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("[backfill-legacy-calc-series-math] failed");
    console.error(error);
    process.exit(1);
  });
