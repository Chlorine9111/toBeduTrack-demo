import {
  callGoogleEmbeddings,
  DEFAULT_GOOGLE_EMBEDDING_MODEL,
  resolveGoogleEmbeddingModel,
} from "@/lib/ai/google-embeddings";
import {
  buildExerciseContentFromLegacy,
  deriveLegacyExerciseFieldsFromContent,
  normalizeExerciseContent,
  normalizeExerciseContentForStorage,
  normalizeStoredExerciseText,
  readExerciseContent,
} from "@/lib/exercises/content";
import type { ApQuestionBankChoice } from "@/lib/question-bank/ap-types";
import { serializeEmbedding } from "@/lib/semantic-index/store";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";
import type { ExerciseOption, ExerciseType } from "@/types/exercise";
import type { SupabaseClient } from "@supabase/supabase-js";

type ExerciseMathRow = Pick<
  Database["public"]["Tables"]["exercises"]["Row"],
  | "id"
  | "teacher_id"
  | "exercise_type"
  | "content_json"
  | "question_text"
  | "options"
  | "correct_answer"
  | "solution_steps"
>;

type QuestionBankRow = {
  id: string;
  course: string;
  unit: number | null;
  question_number: number | null;
  stem: string | null;
  choices: Record<string, ApQuestionBankChoice> | null;
  correct_answer: string | null;
  explanation: string | null;
  question_type: string | null;
  parts: Json | null;
};

type ScriptArgs = {
  dryRun: boolean;
  teacherId: string | null;
  limit: number | null;
  offset: number;
  pageSize: number;
  sampleSize: number;
  source: "all" | "exercises" | "questions";
  syncQuestionEmbeddings: boolean;
};

type SourceCounters = {
  totalScanned: number;
  totalChanged: number;
  totalUpdated: number;
  recoveredMissingContentJson: number;
  embeddingsUpdated: number;
  samples: Array<Record<string, string | number | null>>;
};

const QUESTION_EMBEDDING_DIMENSION = 1536;
const QUESTION_EMBEDDING_BATCH_SIZE = 8;
const UPDATE_CONCURRENCY = 4;
const QUESTION_MATH_NORMALIZATION_SKIP_COURSES = new Set(["AP_CSA", "AP_CSP"]);

function parseArgs(argv: string[]): ScriptArgs {
  const teacherArg = argv.find((arg) => arg.startsWith("--teacher="));
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const offsetArg = argv.find((arg) => arg.startsWith("--offset="));
  const pageSizeArg = argv.find((arg) => arg.startsWith("--page-size="));
  const sampleSizeArg = argv.find((arg) => arg.startsWith("--sample-size="));
  const sourceArg = argv.find((arg) => arg.startsWith("--source="));

  const sourceValue = (sourceArg?.split("=")[1] ?? "").trim().toLowerCase();
  const source =
    sourceValue === "exercises" || sourceValue === "questions" || sourceValue === "all"
      ? sourceValue
      : "all";

  return {
    dryRun: !argv.includes("--write"),
    teacherId: teacherArg ? teacherArg.split("=")[1]?.trim() || null : null,
    limit: limitArg ? Number.parseInt(limitArg.split("=")[1] ?? "", 10) || null : null,
    offset: offsetArg ? Math.max(0, Number.parseInt(offsetArg.split("=")[1] ?? "", 10) || 0) : 0,
    pageSize: pageSizeArg ? Math.max(1, Number.parseInt(pageSizeArg.split("=")[1] ?? "", 10) || 200) : 200,
    sampleSize: sampleSizeArg ? Math.max(0, Number.parseInt(sampleSizeArg.split("=")[1] ?? "", 10) || 8) : 8,
    source,
    syncQuestionEmbeddings: argv.includes("--sync-question-embeddings"),
  };
}

function createCounters(): SourceCounters {
  return {
    totalScanned: 0,
    totalChanged: 0,
    totalUpdated: 0,
    recoveredMissingContentJson: 0,
    embeddingsUpdated: 0,
    samples: [],
  };
}

function normalizeLegacyOptions(raw: unknown): ExerciseOption[] | null {
  if (!Array.isArray(raw)) return null;

  const options = raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const label = typeof Reflect.get(item, "label") === "string"
        ? String(Reflect.get(item, "label")).trim()
        : "";
      const text = typeof Reflect.get(item, "text") === "string"
        ? String(Reflect.get(item, "text"))
        : "";

      if (!label || !text.trim()) return null;

      return {
        label,
        text,
        isCorrect: Boolean(Reflect.get(item, "isCorrect")),
      } satisfies ExerciseOption;
    })
    .filter((item): item is ExerciseOption => item !== null);

  return options.length > 0 ? options : null;
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

async function applyRowUpdates(params: {
  supabase: SupabaseClient;
  table: "exercises" | "questions";
  updates: Array<Record<string, unknown> & { id: string }>;
  failurePrefix: string;
}) {
  for (const batch of chunkArray(params.updates, UPDATE_CONCURRENCY)) {
    const runBatch = async (items: Array<Record<string, unknown> & { id: string }>) =>
      Promise.all(
        items.map((item) => {
          const { id, ...update } = item;
          return params.supabase
            .from(params.table)
            .update(update)
            .eq("id", id);
        }),
      );

    let results = await runBatch(batch);
    let failed = results.find((result) => result.error);

    if (
      failed?.error &&
      /statement timeout/i.test(failed.error.message) &&
      batch.length > 1
    ) {
      results = [];
      for (const item of batch) {
        const [result] = await runBatch([item]);
        results.push(result);
      }
      failed = results.find((result) => result.error);
    }

    if (failed?.error) {
      throw new Error(`${params.failurePrefix}：${failed.error.message}`);
    }
  }
}

function buildNormalizedExercisePayload(row: ExerciseMathRow) {
  const currentContent = readExerciseContent(row.content_json);
  const baseContent = normalizeExerciseContent(
    currentContent ??
      buildExerciseContentFromLegacy({
        type: row.exercise_type as ExerciseType | "TF",
        questionText: row.question_text ?? "",
        options: normalizeLegacyOptions(row.options),
        correctAnswer: row.correct_answer ?? "",
        solutionSteps: row.solution_steps ?? "",
        commonMistakes: [],
      }),
  );
  const nextContent = normalizeExerciseContentForStorage(baseContent);
  const derived = deriveLegacyExerciseFieldsFromContent(nextContent);
  const nextOptions = row.exercise_type === "MC" ? (derived.options ?? null) : null;

  const changed =
    !currentContent ||
    stableJson(currentContent) !== stableJson(nextContent) ||
    stableJson(row.question_text ?? "") !== stableJson(derived.questionText) ||
    stableJson(row.correct_answer ?? "") !== stableJson(derived.correctAnswer) ||
    stableJson(row.solution_steps ?? "") !== stableJson(derived.solutionSteps) ||
    stableJson(row.options) !== stableJson(nextOptions);

  return {
    changed,
    recoveredMissingContentJson: !currentContent,
    update: {
      content_json: nextContent as unknown as Json,
      question_text: derived.questionText,
      options: nextOptions,
      correct_answer: derived.correctAnswer,
      solution_steps: derived.solutionSteps,
    },
    preview: {
      beforeQuestionText: row.question_text ?? "",
      afterQuestionText: derived.questionText,
    },
  };
}

function normalizeQuestionChoices(
  raw: Record<string, ApQuestionBankChoice> | null | undefined,
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

function normalizeQuestionJson(value: Json | null): Json | null {
  if (value == null) return value;
  if (typeof value === "string") {
    return normalizeStoredExerciseText(value) as Json;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeQuestionJson(item as Json)) as Json;
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeQuestionJson(item as Json)]),
    ) as Json;
  }
  return value;
}

function joinParagraphs(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => `${part ?? ""}`.trim())
    .filter(Boolean)
    .join("\n\n");
}

function formatQuestionChoices(choices: Record<string, ApQuestionBankChoice> | null | undefined) {
  if (!choices) return "";
  return Object.keys(choices)
    .sort((a, b) => a.localeCompare(b))
    .map((label) => {
      const choice = choices[label];
      if (!choice) return "";
      return `${label}. ${choice.text}`.trim();
    })
    .filter(Boolean)
    .join("\n");
}

function formatQuestionMisconceptions(
  choices: Record<string, ApQuestionBankChoice> | null | undefined,
) {
  if (!choices) return "";
  return Object.keys(choices)
    .sort((a, b) => a.localeCompare(b))
    .map((label) => {
      const misconception = choices[label]?.misconception?.trim();
      if (!misconception) return "";
      return `${label}. ${misconception}`;
    })
    .filter(Boolean)
    .join("\n");
}

function formatQuestionParts(value: Json | null | undefined) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  return JSON.stringify(value);
}

function buildQuestionEmbeddingText(params: {
  course: string;
  unit: number | null;
  questionNumber: number | null;
  questionType: string | null;
  stem: string | null;
  choices: Record<string, ApQuestionBankChoice> | null;
  correctAnswer: string | null;
  explanation: string | null;
  parts: Json | null;
  mode: "content" | "diagnostic";
}) {
  const base = [
    `Course: ${params.course}`,
    params.unit != null ? `Unit: ${params.unit}` : null,
    params.questionNumber != null ? `Question: ${params.questionNumber}` : null,
    params.questionType ? `Type: ${params.questionType}` : null,
    params.stem ? `Stem:\n${params.stem}` : null,
    params.choices ? `Choices:\n${formatQuestionChoices(params.choices)}` : null,
    params.correctAnswer ? `Correct answer: ${params.correctAnswer}` : null,
    params.explanation ? `Explanation:\n${params.explanation}` : null,
    params.parts ? `Parts:\n${formatQuestionParts(params.parts)}` : null,
  ];

  if (params.mode === "diagnostic") {
    return joinParagraphs([
      ...base,
      params.choices
        ? `Likely misconceptions:\n${formatQuestionMisconceptions(params.choices)}`
        : null,
    ]);
  }

  return joinParagraphs(base);
}

function buildNormalizedQuestionPayload(row: QuestionBankRow) {
  if (QUESTION_MATH_NORMALIZATION_SKIP_COURSES.has(row.course)) {
    return {
      changed: false,
      update: {
        stem: row.stem ?? "",
        choices: row.choices as unknown as Json,
        correct_answer: row.correct_answer,
        explanation: row.explanation,
        parts: row.parts,
      },
      preview: {
        beforeStem: row.stem ?? "",
        afterStem: row.stem ?? "",
      },
      embeddingInputs: {
        content: "",
        diagnostic: "",
      },
    };
  }

  const nextStem = normalizeStoredExerciseText(row.stem ?? "");
  const nextChoices = normalizeQuestionChoices(row.choices);
  const nextCorrectAnswer =
    row.correct_answer == null ? null : normalizeStoredExerciseText(row.correct_answer);
  const nextExplanation =
    row.explanation == null ? null : normalizeStoredExerciseText(row.explanation);
  const nextParts = normalizeQuestionJson(row.parts);

  const changed =
    stableJson(row.stem) !== stableJson(nextStem) ||
    stableJson(row.choices) !== stableJson(nextChoices) ||
    stableJson(row.correct_answer) !== stableJson(nextCorrectAnswer) ||
    stableJson(row.explanation) !== stableJson(nextExplanation) ||
    stableJson(row.parts) !== stableJson(nextParts);

  const update = {
    stem: nextStem,
    choices: nextChoices as unknown as Json,
    correct_answer: nextCorrectAnswer,
    explanation: nextExplanation,
    parts: nextParts,
  };

  return {
    changed,
    update,
    preview: {
      beforeStem: row.stem ?? "",
      afterStem: nextStem,
    },
    embeddingInputs: {
      content: buildQuestionEmbeddingText({
        course: row.course,
        unit: row.unit,
        questionNumber: row.question_number,
        questionType: row.question_type,
        stem: nextStem,
        choices: nextChoices,
        correctAnswer: nextCorrectAnswer,
        explanation: nextExplanation,
        parts: nextParts,
        mode: "content",
      }),
      diagnostic: buildQuestionEmbeddingText({
        course: row.course,
        unit: row.unit,
        questionNumber: row.question_number,
        questionType: row.question_type,
        stem: nextStem,
        choices: nextChoices,
        correctAnswer: nextCorrectAnswer,
        explanation: nextExplanation,
        parts: nextParts,
        mode: "diagnostic",
      }),
    },
  };
}

async function buildQuestionEmbeddingUpdates(params: Array<{
  id: string;
  contentText: string;
  diagnosticText: string;
}>) {
  if (params.length === 0) {
    return new Map<
      string,
      {
        embedding_content: string;
        embedding_diagnostic: string;
      }
    >();
  }

  const model = resolveGoogleEmbeddingModel(DEFAULT_GOOGLE_EMBEDDING_MODEL);
  if (!model) {
    throw new Error("Google embedding model 未配置，无法同步 questions 向量");
  }

  const updates = new Map<
    string,
    {
      embedding_content: string;
      embedding_diagnostic: string;
    }
  >();

  for (let index = 0; index < params.length; index += QUESTION_EMBEDDING_BATCH_SIZE) {
    const batch = params.slice(index, index + QUESTION_EMBEDDING_BATCH_SIZE);
    const contentResponse = await callGoogleEmbeddings({
      model,
      input: batch.map((item) => item.contentText),
      dimensions: QUESTION_EMBEDDING_DIMENSION,
      taskType: "RETRIEVAL_DOCUMENT",
    });
    const diagnosticResponse = await callGoogleEmbeddings({
      model,
      input: batch.map((item) => item.diagnosticText),
      dimensions: QUESTION_EMBEDDING_DIMENSION,
      taskType: "RETRIEVAL_DOCUMENT",
    });

    batch.forEach((item, batchIndex) => {
      const contentEmbedding = contentResponse.embeddings[batchIndex];
      const diagnosticEmbedding = diagnosticResponse.embeddings[batchIndex];
      if (!contentEmbedding || !diagnosticEmbedding) {
        throw new Error(`题目 ${item.id} embedding 返回为空`);
      }

      updates.set(item.id, {
        embedding_content: serializeEmbedding(contentEmbedding),
        embedding_diagnostic: serializeEmbedding(diagnosticEmbedding),
      });
    });
  }

  return updates;
}

async function processExercises(args: ScriptArgs) {
  const supabase = createAdminSupabaseClient();
  const counters = createCounters();
  let from = args.offset;

  while (true) {
    let query = supabase
      .from("exercises")
      .select(
        "id,teacher_id,exercise_type,content_json,question_text,options,correct_answer,solution_steps",
      )
      .order("created_at", { ascending: true })
      .range(from, from + args.pageSize - 1);

    if (args.teacherId) {
      query = query.eq("teacher_id", args.teacherId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`读取 exercises 失败：${error.message}`);
    }

    const rows = (data ?? []) as ExerciseMathRow[];
    if (rows.length === 0) break;
    const pendingExerciseUpdates: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      if (args.limit != null && counters.totalScanned >= args.limit) {
        break;
      }

      counters.totalScanned += 1;
      const normalized = buildNormalizedExercisePayload(row);
      if (!normalized.changed) {
        continue;
      }

      counters.totalChanged += 1;
      if (normalized.recoveredMissingContentJson) {
        counters.recoveredMissingContentJson += 1;
      }

      if (counters.samples.length < args.sampleSize) {
        counters.samples.push({
          id: row.id,
          teacherId: row.teacher_id,
          beforeQuestionText: normalized.preview.beforeQuestionText.slice(0, 220),
          afterQuestionText: normalized.preview.afterQuestionText.slice(0, 220),
        });
      }

      if (!args.dryRun) {
        pendingExerciseUpdates.push({
          id: row.id,
          ...normalized.update,
        });
      }
    }

    if (!args.dryRun && pendingExerciseUpdates.length > 0) {
      await applyRowUpdates({
        supabase: supabase as unknown as SupabaseClient,
        table: "exercises",
        updates: pendingExerciseUpdates as Array<Record<string, unknown> & { id: string }>,
        failurePrefix: "批量更新 exercises 失败",
      });

      counters.totalUpdated += pendingExerciseUpdates.length;
    }

    if (args.limit != null && counters.totalScanned >= args.limit) {
      break;
    }

    from += rows.length;
  }

  return counters;
}

async function processQuestions(args: ScriptArgs) {
  const supabase = createAdminSupabaseClient();
  const counters = createCounters();
  let from = args.offset;

  while (true) {
    const { data, error } = await supabase
      .from("questions")
      .select("id,course,unit,question_number,stem,choices,correct_answer,explanation,question_type,parts")
      .order("created_at", { ascending: true })
      .range(from, from + args.pageSize - 1);

    if (error) {
      throw new Error(`读取 questions 失败：${error.message}`);
    }

    const rows = (data ?? []) as QuestionBankRow[];
    if (rows.length === 0) break;

    const pendingQuestionUpdates: Array<{
      id: string;
      update: Record<string, unknown>;
      contentText: string;
      diagnosticText: string;
    }> = [];

    for (const row of rows) {
      if (args.limit != null && counters.totalScanned >= args.limit) {
        break;
      }

      counters.totalScanned += 1;
      const normalized = buildNormalizedQuestionPayload(row);
      if (!normalized.changed) {
        continue;
      }

      counters.totalChanged += 1;
      if (counters.samples.length < args.sampleSize) {
        counters.samples.push({
          id: row.id,
          course: row.course,
          unit: row.unit,
          questionNumber: row.question_number,
          beforeStem: normalized.preview.beforeStem.slice(0, 220),
          afterStem: normalized.preview.afterStem.slice(0, 220),
        });
      }

      if (!args.dryRun) {
        pendingQuestionUpdates.push({
          id: row.id,
          update: normalized.update,
          contentText: normalized.embeddingInputs.content,
          diagnosticText: normalized.embeddingInputs.diagnostic,
        });
      }
    }

    if (!args.dryRun && pendingQuestionUpdates.length > 0) {
      const embeddingUpdates = args.syncQuestionEmbeddings
        ? await buildQuestionEmbeddingUpdates(
            pendingQuestionUpdates.map((item) => ({
              id: item.id,
              contentText: item.contentText,
              diagnosticText: item.diagnosticText,
            })),
          )
        : new Map<
            string,
            {
              embedding_content: string;
              embedding_diagnostic: string;
            }
          >();

      const pageUpdates = pendingQuestionUpdates.map((item) => ({
        id: item.id,
        ...item.update,
        ...(embeddingUpdates.get(item.id) ?? {}),
      }));

      await applyRowUpdates({
        supabase: supabase as unknown as SupabaseClient,
        table: "questions",
        updates: pageUpdates as Array<Record<string, unknown> & { id: string }>,
        failurePrefix: "批量更新 AP 题目失败",
      });

      counters.totalUpdated += pageUpdates.length;
      counters.embeddingsUpdated += embeddingUpdates.size;
    }

    if (args.limit != null && counters.totalScanned >= args.limit) {
      break;
    }

    from += rows.length;
  }

  return counters;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const exercises =
    args.source === "all" || args.source === "exercises"
      ? await processExercises(args)
      : null;
  const questions =
    args.source === "all" || args.source === "questions"
      ? await processQuestions(args)
      : null;

  console.log(
    JSON.stringify(
    {
      mode: args.dryRun ? "dry-run" : "write",
      teacherId: args.teacherId,
      limit: args.limit,
      offset: args.offset,
      pageSize: args.pageSize,
      source: args.source,
      syncQuestionEmbeddings: args.syncQuestionEmbeddings,
        exercises,
        questions,
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
