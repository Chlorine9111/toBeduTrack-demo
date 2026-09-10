import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getConversation,
  listConversationMessages,
} from "@/lib/assistant/store";
import { getContentLibraryItemDetail } from "@/lib/content-library/store";
import type {
  ContentLibraryDetail,
  ContentLibrarySnapshot,
} from "@/lib/content-library/types";
import type {
  LessonPlanBlock,
  LessonPlanDocument,
  LessonPlanSection,
} from "@/lib/lesson-plan/types";
import { getLessonPlanById } from "@/lib/lesson-plan/store";
import { getProjectPlan } from "@/lib/pbl/store";
import type { PblPlan, PblStage } from "@/lib/pbl/types";
import { getQuestionBankQuestionDetail } from "@/lib/question-bank/store";
import type {
  SearchPeekContentBody,
  SearchPeekContentLibraryPayload,
  SearchPeekConversationPayload,
  SearchPeekLessonPlanPayload,
  SearchPeekMeta,
  SearchPeekPblPayload,
  SearchPeekPblStage,
  SearchPeekQuestionOption,
  SearchPeekQuestionPayload,
  SearchPeekResponse,
} from "@/lib/search/peek-types";
import type { GlobalSearchResultType } from "@/lib/search/types";
import { buildContentAssetsRoute } from "@/lib/content-assets/routes";
import type { Database } from "@/types/database";
import type { Exercise } from "@/types/exercise";
import type { RubricDetailPayload } from "@/types/rubric";

type AppSupabase = SupabaseClient<Database>;

type SearchPeekClient = {
  supabase: AppSupabase;
  teacherId: string;
};

const MAX_TEXT_EXCERPT = 1200;
const MAX_QUESTION_TEXT = 4000;
const MAX_OPTION_TEXT = 360;
const MAX_EXPLANATION_TEXT = 1200;
const MAX_SUMMARY_TEXT = 220;
const MAX_CONVERSATION_MESSAGE_PREVIEW = 360;
const MAX_CONVERSATION_MESSAGES = 8;
const MAX_LESSON_SECTIONS = 6;
const MAX_PBL_STAGES = 5;
const MAX_RUBRIC_DIMENSIONS = 4;
const MAX_RUBRIC_LEVELS = 4;
const MAX_STRING_PARTS = 32;

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function stripHtml(value: string | null | undefined) {
  return cleanText(`${value ?? ""}`.replace(/<[^>]+>/g, " "));
}

function stripHtmlPreservingStructure(value: string | null | undefined) {
  return `${value ?? ""}`
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|h[1-6]|ul|ol|table|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function trimText(value: string | null | undefined, limit: number) {
  const normalized = cleanText(value);
  if (!normalized) return "";
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

function trimStructuredText(value: string | null | undefined, limit: number) {
  const normalized = `${value ?? ""}`
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return "";

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

function toTitlePreview(value: string | null | undefined, limit = 48) {
  const normalized = cleanText(value);
  if (!normalized) return "";
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

function buildRoute(type: GlobalSearchResultType, params: { id: string; title?: string | null }) {
  if (type === "content_library_item") {
    return buildContentAssetsRoute({ itemId: params.id });
  }
  if (type === "question") {
    const query = encodeURIComponent(toTitlePreview(params.title));
    const suffix = query ? `&q=${query}` : "";
    return `/main/question-bank?questionId=${encodeURIComponent(params.id)}${suffix}`;
  }
  if (type === "lesson_plan") {
    return `/lesson-plans?planId=${encodeURIComponent(params.id)}`;
  }
  if (type === "pbl_project") {
    return `/main/pbl/${encodeURIComponent(params.id)}`;
  }
  return `/main/agent?conversationId=${encodeURIComponent(params.id)}`;
}

function buildSubtitle(parts: Array<string | null | undefined>) {
  return parts.map((part) => cleanText(part)).filter(Boolean).join(" · ");
}

function collectTextParts(value: unknown, bucket: string[], depth = 0) {
  if (bucket.length >= MAX_STRING_PARTS || depth > 4 || value == null) return;
  if (typeof value === "string") {
    const normalized = stripHtml(value);
    if (normalized) {
      bucket.push(normalized);
    }
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    bucket.push(`${value}`);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextParts(item, bucket, depth + 1);
      if (bucket.length >= MAX_STRING_PARTS) return;
    }
    return;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectTextParts(item, bucket, depth + 1);
      if (bucket.length >= MAX_STRING_PARTS) return;
    }
  }
}

function makeTextExcerpt(values: unknown[], limit = MAX_TEXT_EXCERPT) {
  const bucket: string[] = [];
  for (const value of values) {
    collectTextParts(value, bucket);
    if (bucket.length >= MAX_STRING_PARTS) break;
  }
  return trimText(bucket.join(" "), limit);
}

function readExerciseCorrectAnswer(exercise: Exercise) {
  const legacyAnswer = trimText(exercise.correctAnswer, 240);
  if (legacyAnswer) return legacyAnswer;

  const correctOptions = (exercise.options ?? [])
    .filter((option) => option.isCorrect)
    .map((option) => option.label || option.text)
    .map((value) => cleanText(value))
    .filter(Boolean);

  return correctOptions.length > 0 ? correctOptions.join(", ") : null;
}

function mapQuestionOptions(options: Exercise["options"]) {
  return (options ?? []).map((option) => ({
    label: cleanText(option.label),
    text: trimText(option.text, MAX_OPTION_TEXT),
    isCorrect: Boolean(option.isCorrect),
  })) satisfies SearchPeekQuestionOption[];
}

function buildQuestionPreview(params: {
  title: string;
  updatedAt: string;
  courseName: string | null;
  unitName: string | null;
  detail: Awaited<ReturnType<typeof getQuestionBankQuestionDetail>>;
}) {
  const detail = params.detail;
  if (!detail) return null;

  const item: SearchPeekMeta = {
    id: detail.id,
    type: "question",
    title: params.title,
    subtitle: buildSubtitle([
      "题库",
      detail.sourceFileName,
      params.courseName,
      params.unitName,
    ]),
    updatedAt: params.updatedAt,
    route: buildRoute("question", {
      id: detail.id,
      title: detail.title,
    }),
  };

  const preview: SearchPeekQuestionPayload = {
    kind: "question",
    questionType: detail.exercise.type,
    difficulty: detail.exercise.difficulty,
    verificationStatus: detail.exercise.verificationStatus,
    questionText: trimText(detail.exercise.questionText, MAX_QUESTION_TEXT),
    options: mapQuestionOptions(detail.exercise.options),
    correctAnswer: readExerciseCorrectAnswer(detail.exercise),
    explanation: trimText(detail.exercise.solutionSteps, MAX_EXPLANATION_TEXT) || null,
    sourceFileName: detail.sourceFileName,
    sourcePageLabel: detail.sourcePageLabel,
    knowledgeClusterLabel: detail.knowledgeClusterLabel,
    knowledgeSubskillLabel: detail.knowledgeSubskillLabel ?? null,
    sourcePageImageUrl: detail.sourcePageImageUrl,
    similarItems: detail.similarItems.slice(0, 3),
  };

  return { item, preview } satisfies SearchPeekResponse;
}

function buildLessonSectionPreview(section: LessonPlanSection) {
  const previewText = makeTextExcerpt(
    [
      section.summary,
      ...section.blocks.slice(0, 4).map((block) => readLessonBlockPreviewText(block)),
    ],
    320,
  );

  return {
    id: section.id,
    title: cleanText(section.title) || "未命名章节",
    summary: trimText(section.summary, 200),
    durationMinutes: section.durationMinutes,
    blockCount: section.blocks.length,
    previewText,
  };
}

function readLessonBlockPreviewText(block: LessonPlanBlock) {
  return makeTextExcerpt([block.content, block.teacherNote], 180);
}

function buildLessonPlanPayload(document: LessonPlanDocument): SearchPeekLessonPlanPayload {
  return {
    kind: "lesson_plan",
    subjectLabel: cleanText(document.subjectLabel) || "教案",
    status: document.status,
    totalDurationMinutes: document.sections.reduce(
      (sum, section) => sum + Math.max(0, section.durationMinutes),
      0,
    ),
    sectionCount: document.sections.length,
    sections: document.sections.slice(0, MAX_LESSON_SECTIONS).map(buildLessonSectionPreview),
  };
}

function buildPblStagePreview(stage: PblStage): SearchPeekPblStage {
  return {
    stageNumber: stage.stageNumber,
    name: cleanText(stage.name) || `阶段 ${stage.stageNumber}`,
    stageType: stage.stageType,
    objective: trimText(stage.objective, 240),
    deliverables: stage.deliverables
      .map((item) => trimText(item, 120))
      .filter(Boolean)
      .slice(0, 3),
  };
}

function buildPblPayload(plan: PblPlan): SearchPeekPblPayload {
  return {
    kind: "pbl_project",
    status: plan.status,
    primarySubject: cleanText(plan.primarySubject),
    curriculumSystem: plan.curriculumSystem,
    grade: cleanText(plan.grade),
    totalPeriods: plan.totalPeriods,
    drivingQuestion: trimText(plan.drivingQuestion, 400),
    overviewText: trimText(plan.overviewText, 700),
    finalOutcomeForm: trimText(plan.finalOutcomeForm, 160),
    stageCount: plan.stages.length,
    stages: plan.stages.slice(0, MAX_PBL_STAGES).map(buildPblStagePreview),
  };
}

function buildRubricBody(rubric: RubricDetailPayload): SearchPeekContentBody {
  return {
    kind: "rubric",
    dimensionCount: rubric.dimensions.length,
    dimensions: rubric.dimensions.slice(0, MAX_RUBRIC_DIMENSIONS).map((dimension) => ({
      id: dimension.id,
      name: cleanText(dimension.name) || "未命名维度",
      weight: dimension.weight,
      description: trimText(dimension.description, 240),
      levels: dimension.levels
        .slice()
        .sort((left, right) => right.score - left.score)
        .slice(0, MAX_RUBRIC_LEVELS)
        .map((level) => ({
          id: level.id,
          score: level.score,
          description: trimText(level.description, 200),
        })),
    })),
  };
}

function buildContentBody(detail: ContentLibraryDetail): SearchPeekContentBody {
  const snapshot = detail.snapshot as ContentLibrarySnapshot;

  if (snapshot.kind === "exercise") {
    return {
      kind: "exercise",
      questionText: trimText(snapshot.exercise.questionText, MAX_QUESTION_TEXT),
      options: mapQuestionOptions(snapshot.exercise.options),
      correctAnswer: readExerciseCorrectAnswer(snapshot.exercise),
      explanation: trimText(snapshot.exercise.solutionSteps, MAX_EXPLANATION_TEXT) || null,
    };
  }

  if (snapshot.kind === "lesson_plan_document") {
    const lessonPayload = buildLessonPlanPayload(snapshot.lessonPlan);
    return {
      kind: "lesson_plan",
      sectionCount: lessonPayload.sectionCount,
      sections: lessonPayload.sections,
    };
  }

  if (snapshot.kind === "pbl_project_plan") {
    const pblPayload = buildPblPayload(snapshot.pblPlan);
    return {
      kind: "pbl_project",
      drivingQuestion: pblPayload.drivingQuestion,
      overviewText: pblPayload.overviewText,
      stageCount: pblPayload.stageCount,
      stages: pblPayload.stages,
    };
  }

  if (snapshot.kind === "rubric") {
    return buildRubricBody(snapshot.rubric);
  }

  if (snapshot.kind === "lesson_plan_markdown") {
    return {
      kind: "text",
      excerpt: trimStructuredText(snapshot.markdown, MAX_TEXT_EXCERPT) || "暂无可预览内容",
    };
  }

  if (snapshot.kind === "html") {
    return {
      kind: "text",
      excerpt:
        trimStructuredText(stripHtmlPreservingStructure(snapshot.html), MAX_TEXT_EXCERPT) ||
        "暂无可预览内容",
    };
  }

  if (snapshot.kind === "markdown") {
    return {
      kind: "text",
      excerpt: trimStructuredText(snapshot.markdown, MAX_TEXT_EXCERPT) || "暂无可预览内容",
    };
  }

  return {
    kind: "text",
    excerpt:
      makeTextExcerpt([detail.summaryText, detail.note, detail.metadata, snapshot], MAX_TEXT_EXCERPT) ||
      "暂无可预览内容",
  };
}

function buildContentSummaryText(
  detail: ContentLibraryDetail,
  body: SearchPeekContentBody,
) {
  const summaryText = trimText(detail.summaryText, MAX_SUMMARY_TEXT);
  if (!summaryText) return null;

  if (body.kind === "text") {
    const bodyText = cleanText(body.excerpt);
    const summaryPrefix = cleanText(summaryText).slice(0, 80);
    if (summaryPrefix && bodyText.startsWith(summaryPrefix)) {
      return null;
    }
  }

  return summaryText;
}

async function readContentLibraryPeek(
  client: SearchPeekClient,
  id: string,
): Promise<SearchPeekResponse | null> {
  const detail = await getContentLibraryItemDetail(client, id);
  if (!detail) return null;

  const body = buildContentBody(detail);

  const preview: SearchPeekContentLibraryPayload = {
    kind: "content_library_item",
    contentType: detail.contentType,
    rendererType: detail.rendererType,
    note: detail.note,
    summaryText: buildContentSummaryText(detail, body),
    courseName: detail.courseName,
    unitName: detail.unitName,
    sourceConversationTitle: detail.sourceConversationTitle,
    body,
  };

  return {
    item: {
      id: detail.id,
      type: "content_library_item",
      title: detail.displayTitle,
      subtitle: buildSubtitle([
        "内容库",
        detail.contentType,
        detail.courseName,
        detail.unitName,
      ]),
      updatedAt: detail.updatedAt,
      route: buildRoute("content_library_item", { id: detail.id }),
    },
    preview,
  };
}

async function readQuestionPeek(
  client: SearchPeekClient,
  id: string,
): Promise<SearchPeekResponse | null> {
  const detail = await getQuestionBankQuestionDetail(client, id);
  if (!detail) return null;

  return buildQuestionPreview({
    title: detail.title,
    updatedAt: detail.updatedAt,
    courseName: detail.courseName,
    unitName: detail.unitName,
    detail,
  });
}

async function readLessonPlanPeek(
  client: SearchPeekClient,
  id: string,
): Promise<SearchPeekResponse | null> {
  const document = await getLessonPlanById(
    {
      teacherId: client.teacherId,
      supabase: client.supabase,
      isMock: false,
    },
    id,
  );

  if (!document) return null;

  return {
    item: {
      id: document.id,
      type: "lesson_plan",
      title: cleanText(document.title) || "未命名教案",
      subtitle: buildSubtitle(["教案", document.subjectLabel, document.status]),
      updatedAt: document.updatedAt,
      route: buildRoute("lesson_plan", { id: document.id }),
    },
    preview: buildLessonPlanPayload(document),
  };
}

async function readPblPeek(
  client: SearchPeekClient,
  id: string,
): Promise<SearchPeekResponse | null> {
  const plan = await getProjectPlan(
    {
      teacherId: client.teacherId,
      supabase: client.supabase,
      isMock: false,
    },
    id,
  );

  if (!plan) return null;

  return {
    item: {
      id: plan.id,
      type: "pbl_project",
      title: cleanText(plan.title) || "未命名 PBL 项目",
      subtitle: buildSubtitle(["PBL", plan.status, plan.primarySubject]),
      updatedAt: plan.updatedAt,
      route: buildRoute("pbl_project", { id: plan.id }),
    },
    preview: buildPblPayload(plan),
  };
}

async function readConversationPeek(
  client: SearchPeekClient,
  id: string,
): Promise<SearchPeekResponse | null> {
  const conversation = await getConversation(client.supabase, client.teacherId, id);
  if (!conversation) return null;

  const messages = await listConversationMessages(client.supabase, client.teacherId, id);
  const preview: SearchPeekConversationPayload = {
    kind: "conversation",
    messageCount: messages.length,
    messages: messages.slice(-MAX_CONVERSATION_MESSAGES).map((message) => ({
      id: message.id,
      role:
        message.role === "user" || message.role === "assistant" || message.role === "system"
          ? message.role
          : "assistant",
      contentPreview: trimText(message.content, MAX_CONVERSATION_MESSAGE_PREVIEW),
      createdAt: message.createdAt,
    })),
  };

  return {
    item: {
      id: conversation.id,
      type: "conversation",
      title: cleanText(conversation.title) || "未命名对话",
      subtitle: "最近对话",
      updatedAt: conversation.updatedAt,
      route: buildRoute("conversation", { id: conversation.id }),
    },
    preview,
  };
}

export async function getSearchPeek(
  client: SearchPeekClient,
  params: { type: GlobalSearchResultType; id: string },
) {
  if (params.type === "content_library_item") {
    return readContentLibraryPeek(client, params.id);
  }
  if (params.type === "question") {
    return readQuestionPeek(client, params.id);
  }
  if (params.type === "lesson_plan") {
    return readLessonPlanPeek(client, params.id);
  }
  if (params.type === "pbl_project") {
    return readPblPeek(client, params.id);
  }
  return readConversationPeek(client, params.id);
}
