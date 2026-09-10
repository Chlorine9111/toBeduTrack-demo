import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_DOCUMENT_LAYOUT,
  type DocumentBlock,
  type DocumentLayoutConfig,
  type QuestionBlock,
} from "@/lib/doc-engine/block-types";
import {
  buildDocumentArticleHtml,
  extractArticleBodyHtml,
  extractArticleDocumentType,
} from "@/lib/doc-engine/document-article-html";
import { DEFAULT_WORKSHEET_LAYOUT_CONFIG } from "@/lib/worksheet/constants";
import {
  type WorksheetBuilderDetail,
  type WorksheetBuilderDraft,
  type WorksheetBuilderQuestionInstance,
  type WorksheetBuilderSummary,
  WORKSHEET_BUILDER_DRAFT_VERSION,
} from "@/lib/worksheet/builder-types";
import {
  buildExerciseContentFromLegacy,
  buildExerciseTitleFromContent,
  deriveLegacyExerciseFieldsFromContent,
  exerciseContentLeavesToMarkdown,
  normalizeExerciseContent,
  readExerciseContent,
} from "@/lib/exercises/content";
import type { Database, Json } from "@/types/database";
import { toExerciseDifficulty, type ExerciseDifficulty, type ExerciseOption, type ExerciseType } from "@/types/exercise";
import type { WorksheetLayoutConfig } from "@/types/worksheet";

type AppSupabase = SupabaseClient<Database>;

type WorksheetCourseRow =
  | { name: string | null }
  | Array<{ name: string | null }>
  | null;

type WorksheetUnitRow =
  | { unit_number: number | string | null; title: string | null }
  | Array<{ unit_number: number | string | null; title: string | null }>
  | null;

type WorksheetBuilderRow = Database["public"]["Tables"]["worksheets"]["Row"] & {
  course?: WorksheetCourseRow;
  unit?: WorksheetUnitRow;
};

type BuilderImportExerciseRow = Pick<
  Database["public"]["Tables"]["exercises"]["Row"],
  | "id"
  | "teacher_id"
  | "exercise_type"
  | "difficulty"
  | "question_text"
  | "options"
  | "correct_answer"
  | "solution_steps"
  | "source_file_name"
  | "source_page_start"
  | "source_page_end"
> & {
  content_json?: Database["public"]["Tables"]["exercises"]["Row"]["content_json"];
};

const BUILDER_IMPORT_EXERCISE_SELECT_BASE =
  "id,teacher_id,exercise_type,difficulty,question_text,options,correct_answer,solution_steps,source_file_name,source_page_start,source_page_end";

const BUILDER_IMPORT_EXERCISE_SELECT =
  "id,teacher_id,exercise_type,difficulty,content_json,question_text,options,correct_answer,solution_steps,source_file_name,source_page_start,source_page_end";

const BUILDER_WORKSHEET_EXERCISE_SELECT_BASE =
  `sort_order,exercise:exercises(${BUILDER_IMPORT_EXERCISE_SELECT_BASE})`;

const BUILDER_WORKSHEET_EXERCISE_SELECT =
  `sort_order,exercise:exercises(${BUILDER_IMPORT_EXERCISE_SELECT})`;

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function isMissingContentJsonColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined,
) {
  return error?.code === "42703" && /content_json/i.test(error.message ?? "");
}

function coerceBuilderImportExerciseRows(data: unknown) {
  return (data ?? []) as unknown as BuilderImportExerciseRow[];
}

function coerceWorksheetExerciseRows(
  data: unknown,
): Array<{ sort_order: number; exercise: BuilderImportExerciseRow | BuilderImportExerciseRow[] | null }> {
  return (data ?? []) as Array<{
    sort_order: number;
    exercise: BuilderImportExerciseRow | BuilderImportExerciseRow[] | null;
  }>;
}

function formatUnitName(unit?: WorksheetUnitRow) {
  const resolved = pickFirst(unit);
  if (!resolved) return null;
  const title = cleanText(resolved.title);
  const number = cleanText(
    resolved.unit_number == null ? "" : String(resolved.unit_number),
  );
  if (!title) return number ? `Unit ${number}` : null;
  return number ? `Unit ${number} · ${title}` : title;
}

function buildQuestionTitle(questionText: string) {
  const normalized = cleanText(questionText);
  if (!normalized) return "未命名题目";
  return normalized.length > 88 ? `${normalized.slice(0, 88)}…` : normalized;
}

function readBuilderExerciseFields(row: BuilderImportExerciseRow) {
  const content = normalizeExerciseContent(
    readExerciseContent(row.content_json) ??
      buildExerciseContentFromLegacy({
        type: row.exercise_type as ExerciseType,
        questionText: row.question_text,
        options: normalizeExerciseOptions(row.options),
        correctAnswer: row.correct_answer,
        solutionSteps: row.solution_steps,
        commonMistakes: [],
      }),
  );
  const derived = deriveLegacyExerciseFieldsFromContent(content);
  return { content, derived };
}

function buildSourceLabel(row: BuilderImportExerciseRow) {
  const fileName = cleanText(row.source_file_name);
  const pageStart = row.source_page_start;
  const pageEnd = row.source_page_end;
  const pageLabel =
    pageStart == null && pageEnd == null
      ? ""
      : pageStart != null && pageEnd != null && pageStart !== pageEnd
        ? `第 ${pageStart}-${pageEnd} 页`
        : `第 ${pageStart ?? pageEnd} 页`;

  if (fileName && pageLabel) return `${fileName} · ${pageLabel}`;
  if (fileName) return fileName;
  return pageLabel || null;
}

function normalizeExerciseOptions(
  options: BuilderImportExerciseRow["options"],
): ExerciseOption[] | null {
  if (!Array.isArray(options)) return null;
  const normalized = options
    .map((option) => {
      if (!isRecord(option)) return null;
      const label = cleanText(typeof option.label === "string" ? option.label : "");
      const text = typeof option.text === "string" ? option.text : "";
      if (!label || !text.trim()) return null;
      return {
        label,
        text,
        isCorrect: Boolean(option.isCorrect),
      } satisfies ExerciseOption;
    })
    .filter((option): option is ExerciseOption => option !== null);

  return normalized.length > 0 ? normalized : null;
}

function buildQuestionBlockFromExerciseRow(
  row: BuilderImportExerciseRow,
  number: number,
  instanceId: string,
): QuestionBlock {
  const type = row.exercise_type as ExerciseType;
  const sourceLabel = buildSourceLabel(row);
  const difficulty = typeof row.difficulty === "string"
    ? row.difficulty
    : typeof row.difficulty === "number"
      ? (row.difficulty <= 1 ? "easy" : row.difficulty >= 3 ? "hard" : "medium")
      : null;
  const { content, derived } = readBuilderExerciseFields(row);

  if (type === "MC") {
    return {
      id: crypto.randomUUID(),
      type: "question",
      data: {
        instanceId,
        sourceExerciseId: row.id,
        number,
        stem: derived.questionText,
        stemBlocks: content.stem,
        questionType: "mc",
        difficulty,
        options:
          (content.options ?? []).map((option) => ({
            label: option.label,
            text: exerciseContentLeavesToMarkdown(option.blocks),
            blocks: option.blocks,
            isCorrect: option.isCorrect,
          })) ?? [],
        correctAnswer: null,
        answerBlocks: null,
        explanation: null,
        explanationBlocks: null,
        sourceLabel,
      },
    };
  }

  if (type === "FR") {
    return {
      id: crypto.randomUUID(),
      type: "question",
      data: {
        instanceId,
        sourceExerciseId: row.id,
        number,
        stem: derived.questionText,
        stemBlocks: content.stem,
        questionType: "frq",
        difficulty,
        answerSpace: "medium",
        sampleAnswer: null,
        sampleAnswerBlocks: null,
        explanation: null,
        explanationBlocks: null,
        sourceLabel,
      },
    };
  }

  return {
    id: crypto.randomUUID(),
    type: "question",
    data: {
      instanceId,
      sourceExerciseId: row.id,
      number,
      stem: derived.questionText,
      stemBlocks: content.stem,
      questionType: "fill",
      difficulty,
      explanation: null,
      explanationBlocks: null,
      sourceLabel,
    },
  };
}

function buildQuestionInstanceFromRow(
  row: BuilderImportExerciseRow,
  number: number,
): WorksheetBuilderQuestionInstance {
  const instanceId = crypto.randomUUID();
  const { content, derived } = readBuilderExerciseFields(row);
  return {
    instanceId,
    originExerciseId: row.id,
    number,
    title: content ? buildExerciseTitleFromContent(content) : buildQuestionTitle(row.question_text),
    type: row.exercise_type as ExerciseType,
    difficulty: toExerciseDifficulty(row.difficulty),
    sourceLabel: buildSourceLabel(row),
    importedAt: new Date().toISOString(),
    originSnapshot: {
      content,
      questionText: derived.questionText,
      options: derived.options,
      correctAnswer: derived.correctAnswer,
      solutionSteps: derived.solutionSteps,
    },
    block: buildQuestionBlockFromExerciseRow(row, number, instanceId),
  };
}

export function buildWorksheetBuilderDocument(params: {
  title: string;
  courseName?: string | null;
  unitName?: string | null;
  blocks: QuestionBlock[];
}) {
  const subtitle = [cleanText(params.courseName), cleanText(params.unitName)]
    .filter(Boolean)
    .join(" · ");

  const introBlocks: DocumentBlock[] = [
    {
      id: crypto.randomUUID(),
      type: "header",
      data: {
        title: params.title,
        subtitle: subtitle || "教师组卷草稿",
        eyebrow: "Worksheet Builder",
      },
    },
    {
      id: crypto.randomUUID(),
      type: "instruction",
      data: {
        text:
          "可从左侧题库继续导入题目，并在当前文档中直接编辑题干、图片、选项和说明。对当前稿件的修改不会影响题库原题。",
      },
    },
    ...params.blocks,
  ];

  return {
    id: crypto.randomUUID(),
    type: "worksheet" as const,
    title: params.title,
    meta: {
      courseName: params.courseName ?? null,
      unitName: params.unitName ?? null,
    },
    blocks: introBlocks,
    layoutConfig: DEFAULT_DOCUMENT_LAYOUT,
  };
}

function buildQuestionBlocksHtmlFragment(blocks: QuestionBlock[]): string {
  return (
    buildDocumentArticleHtml({
      id: crypto.randomUUID(),
      type: "worksheet",
      title: "worksheet-fragment",
      meta: {},
      blocks,
      layoutConfig: DEFAULT_DOCUMENT_LAYOUT,
    }) ?? ""
  );
}

function appendBlocksToHtml(
  html: string,
  blocks: QuestionBlock[],
) {
  const currentBody = extractArticleBodyHtml(html);
  const docType = extractArticleDocumentType(html) || "worksheet";
  const fragmentBody = extractArticleBodyHtml(buildQuestionBlocksHtmlFragment(blocks));

  const joined = [currentBody, fragmentBody].filter(Boolean).join("");
  return `<article data-doc-type="${docType}">${joined}</article>`;
}

export function normalizeWorksheetLayoutConfig(
  rawLayoutConfig: Json | null | undefined,
): WorksheetLayoutConfig {
  if (!isRecord(rawLayoutConfig)) return { ...DEFAULT_WORKSHEET_LAYOUT_CONFIG };

  const columns = rawLayoutConfig.columns === 2 ? 2 : 1;
  const pageSize = rawLayoutConfig.pageSize === "A4" ? "A4" : "Letter";
  const answerSpaceSize =
    rawLayoutConfig.answerSpaceSize === "small" ||
    rawLayoutConfig.answerSpaceSize === "large"
      ? rawLayoutConfig.answerSpaceSize
      : "medium";

  return {
    columns,
    pageSize,
    answerSpaceSize,
    showHeaderFooter:
      typeof rawLayoutConfig.showHeaderFooter === "boolean"
        ? rawLayoutConfig.showHeaderFooter
        : DEFAULT_WORKSHEET_LAYOUT_CONFIG.showHeaderFooter,
    headerText:
      typeof rawLayoutConfig.headerText === "string"
        ? rawLayoutConfig.headerText
        : DEFAULT_WORKSHEET_LAYOUT_CONFIG.headerText,
    footerText:
      typeof rawLayoutConfig.footerText === "string"
        ? rawLayoutConfig.footerText
        : DEFAULT_WORKSHEET_LAYOUT_CONFIG.footerText,
    teacherName:
      typeof rawLayoutConfig.teacherName === "string"
        ? rawLayoutConfig.teacherName
        : DEFAULT_WORKSHEET_LAYOUT_CONFIG.teacherName,
    schoolLogoUrl:
      typeof rawLayoutConfig.schoolLogoUrl === "string"
        ? rawLayoutConfig.schoolLogoUrl
        : DEFAULT_WORKSHEET_LAYOUT_CONFIG.schoolLogoUrl,
    includeAnswerKey:
      typeof rawLayoutConfig.includeAnswerKey === "boolean"
        ? rawLayoutConfig.includeAnswerKey
        : DEFAULT_WORKSHEET_LAYOUT_CONFIG.includeAnswerKey,
  };
}

export function buildDocExportLayoutConfig(
  layoutConfig: WorksheetLayoutConfig,
): DocumentLayoutConfig {
  return {
    pageSize: layoutConfig.pageSize,
    columns: layoutConfig.columns,
    margins: {
      top: 24,
      right: 24,
      bottom: 24,
      left: 24,
    },
    headerText: layoutConfig.headerText ?? null,
    footerText: layoutConfig.footerText ?? null,
    showPageNumbers: false,
  };
}

export function extractWorksheetBuilderDraft(
  rawLayoutConfig: Json | null | undefined,
): WorksheetBuilderDraft | null {
  if (!isRecord(rawLayoutConfig)) return null;
  const draft = rawLayoutConfig.builderDraft;
  if (!isRecord(draft)) return null;
  if (typeof draft.html !== "string" || !draft.html.trim()) return null;
  if (!Array.isArray(draft.questionInstances)) return null;
  if (!isRecord(draft.document)) return null;

  return draft as unknown as WorksheetBuilderDraft;
}

export function mergeWorksheetBuilderDraftIntoLayoutConfig(
  rawLayoutConfig: Json | null | undefined,
  draft: WorksheetBuilderDraft,
): Json {
  const baseLayout = isRecord(rawLayoutConfig) ? { ...rawLayoutConfig } : {};
  return {
    ...baseLayout,
    builderDraft: draft,
  } as Json;
}

export function createEmptyWorksheetBuilderDraft(params: {
  title: string;
  courseName?: string | null;
  unitName?: string | null;
}): WorksheetBuilderDraft {
  const document = buildWorksheetBuilderDocument({
    title: params.title,
    courseName: params.courseName,
    unitName: params.unitName,
    blocks: [],
  });

  return {
    version: WORKSHEET_BUILDER_DRAFT_VERSION,
    html: buildDocumentArticleHtml(document) ?? "",
    document,
    questionInstances: [],
    updatedAt: new Date().toISOString(),
  };
}

export function appendExerciseRowsToDraft(
  draft: WorksheetBuilderDraft,
  rows: BuilderImportExerciseRow[],
) {
  const existingExerciseIds = new Set(
    draft.questionInstances.map((instance) => instance.originExerciseId),
  );
  const skippedIds: string[] = [];
  const importedRows: BuilderImportExerciseRow[] = [];

  for (const row of rows) {
    if (existingExerciseIds.has(row.id)) {
      skippedIds.push(row.id);
      continue;
    }
    importedRows.push(row);
    existingExerciseIds.add(row.id);
  }

  if (importedRows.length === 0) {
    return {
      draft,
      addedIds: [] as string[],
      skippedIds,
    };
  }

  const nextNumberStart =
    draft.questionInstances.reduce((max, instance) => Math.max(max, instance.number), 0) + 1;
  const nextInstances = importedRows.map((row, index) =>
    buildQuestionInstanceFromRow(row, nextNumberStart + index),
  );
  const nextBlocks = nextInstances.map((instance) => instance.block);
  const questionBlocks = draft.document.blocks.filter(
    (block): block is QuestionBlock => block.type === "question",
  );

  const nextDocument = buildWorksheetBuilderDocument({
    title: draft.document.title,
    courseName: draft.document.meta.courseName,
    unitName: draft.document.meta.unitName,
    blocks: [...questionBlocks, ...nextBlocks],
  });

  return {
    draft: {
      ...draft,
      html: appendBlocksToHtml(
        draft.html,
        nextBlocks,
      ),
      document: nextDocument,
      questionInstances: [...draft.questionInstances, ...nextInstances],
      updatedAt: new Date().toISOString(),
    } satisfies WorksheetBuilderDraft,
    addedIds: importedRows.map((row) => row.id),
    skippedIds,
  };
}

export async function loadBuilderImportExerciseRows(params: {
  supabase: AppSupabase;
  teacherId: string;
  exerciseIds: string[];
}) {
  const uniqueIds = Array.from(new Set(params.exerciseIds));
  if (uniqueIds.length === 0) {
    return {
      rows: [] as BuilderImportExerciseRow[],
      invalidIds: [] as string[],
    };
  }

  const runQuery = async (select: string) =>
    params.supabase
      .from("exercises")
      .select(select)
      .in("id", uniqueIds)
      .eq("teacher_id", params.teacherId);

  let { data, error } = await runQuery(BUILDER_IMPORT_EXERCISE_SELECT);
  if (isMissingContentJsonColumnError(error)) {
    ({ data, error } = await runQuery(BUILDER_IMPORT_EXERCISE_SELECT_BASE));
  }

  if (error) {
    throw new Error("读取题目详情失败");
  }

  const rowMap = new Map<string, BuilderImportExerciseRow>();
  for (const row of coerceBuilderImportExerciseRows(data)) {
    rowMap.set(row.id, row);
  }

  return {
    rows: uniqueIds.flatMap((id) => {
      const row = rowMap.get(id);
      return row ? [row] : [];
    }),
    invalidIds: uniqueIds.filter((id) => !rowMap.has(id)),
  };
}

export async function loadWorksheetBuilderDetail(params: {
  supabase: AppSupabase;
  teacherId: string;
  worksheetId: string;
}) {
  const { data, error } = await params.supabase
    .from("worksheets")
    .select(
      "id,teacher_id,course_id,unit_id,title,description,layout_config,status,pdf_url,created_at,updated_at,course:courses(name),unit:units(unit_number,title)",
    )
    .eq("id", params.worksheetId)
    .eq("teacher_id", params.teacherId)
    .maybeSingle();

  if (error) {
    throw new Error("读取组卷稿失败");
  }
  if (!data) return null;

  const row = data as WorksheetBuilderRow;
  let builderDraft = extractWorksheetBuilderDraft(row.layout_config);

  if (!builderDraft) {
    const runExerciseRowsQuery = async (select: string) =>
      params.supabase
        .from("worksheet_exercises")
        .select(select)
        .eq("worksheet_id", params.worksheetId)
        .order("sort_order", { ascending: true });

    let { data: exerciseRows, error: exerciseError } = await runExerciseRowsQuery(
      BUILDER_WORKSHEET_EXERCISE_SELECT,
    );
    if (isMissingContentJsonColumnError(exerciseError)) {
      ({ data: exerciseRows, error: exerciseError } = await runExerciseRowsQuery(
        BUILDER_WORKSHEET_EXERCISE_SELECT_BASE,
      ));
    }

    if (exerciseError) {
      throw new Error("读取组卷题目失败");
    }

    const importedRows = coerceWorksheetExerciseRows(exerciseRows)
      .map((row) => pickFirst(row.exercise))
      .filter(Boolean) as BuilderImportExerciseRow[];

    builderDraft = createEmptyWorksheetBuilderDraft({
      title: row.title,
      courseName: pickFirst(row.course)?.name ?? null,
      unitName: formatUnitName(row.unit),
    });

    if (importedRows.length > 0) {
      builderDraft = appendExerciseRowsToDraft(builderDraft, importedRows).draft;
    }
  }

  const resolvedBuilderDraft = builderDraft ?? createEmptyWorksheetBuilderDraft({
    title: row.title,
    courseName: pickFirst(row.course)?.name ?? null,
    unitName: formatUnitName(row.unit),
  });

  return {
    id: row.id,
    teacherId: row.teacher_id,
    courseId: row.course_id,
    unitId: row.unit_id,
    courseName: pickFirst(row.course)?.name ?? null,
    unitName: formatUnitName(row.unit),
    title: row.title,
    description: row.description,
    layoutConfig: normalizeWorksheetLayoutConfig(row.layout_config),
    status: row.status,
    pdfUrl: row.pdf_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    builderDraft: resolvedBuilderDraft,
  } satisfies WorksheetBuilderDetail;
}

export function toWorksheetBuilderSummary(
  row: WorksheetBuilderRow,
): WorksheetBuilderSummary {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    courseId: row.course_id,
    unitId: row.unit_id,
    courseName: pickFirst(row.course)?.name ?? null,
    unitName: formatUnitName(row.unit),
    title: row.title,
    description: row.description,
    layoutConfig: normalizeWorksheetLayoutConfig(row.layout_config),
    status: row.status,
    pdfUrl: row.pdf_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
