import { randomUUID } from "crypto";
import { z } from "zod";
import { loadCourse, loadExerciseExamples, loadRubricExamples, loadUnitWithTopics } from "@/lib/curriculum/loader";
import { generateExercises } from "@/lib/ai/exercise-generator";
import { generateRubric } from "@/lib/ai/rubric-generator";
import {
  buildExercisesDocument,
  buildLessonPlanDocumentFromStructured,
  buildRubricDocumentFromMock,
} from "@/lib/doc-engine/adapters";
import {
  DEFAULT_DOCUMENT_LAYOUT,
  type DocumentBlock,
  type DocumentKind,
  type DocumentModel,
} from "@/lib/doc-engine/block-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Course, Topic, Unit } from "@/types/curriculum";
import type { MockRubric } from "@/types/chatflow";
import { DEFAULT_LESSON_PLAN_PREFERENCES } from "@/lib/lesson-plan/defaults";
import { generateOutlineWithAi, generateSectionBlocksWithAi } from "@/lib/lesson-plan/ai";
import type { CedTopicMatch, LessonPlanDocument, LessonPlanPreferences } from "@/lib/lesson-plan/types";
import { buildQuickTopic, toCedTopicFromCurriculum } from "@/lib/lesson-plan/prompt-builder";
import type { DocGenerateRequest } from "@/lib/doc-engine/request-schema";
import type { ExerciseDifficulty } from "@/types/exercise";

type AppSupabaseClient = SupabaseClient<Database>;

type CurriculumContext = {
  course: Course;
  unit: Unit | null;
  topics: Topic[];
  selectedTopic: Topic | null;
};

function pickTopicByHint(topics: Topic[], topicHint: string | undefined) {
  const normalized = topicHint?.trim().toLowerCase();
  if (!normalized) return topics[0] ?? null;
  return (
    topics.find((topic) => topic.title.toLowerCase().includes(normalized)) ??
    topics.find((topic) => normalized.includes(topic.title.toLowerCase())) ??
    topics[0] ??
    null
  );
}

function buildGeneralCurriculumContext(topicText: string): CurriculumContext {
  const now = new Date().toISOString();
  const normalizedTopic = topicText.trim() || "自定义主题";
  const course: Course = {
    id: "general-doc-course",
    framework: "AP",
    name: "通用学科",
    code: "GENERAL",
    description: normalizedTopic,
    createdAt: now,
    updatedAt: now,
  };
  const unit: Unit = {
    id: "general-doc-unit",
    courseId: course.id,
    unitNumber: "1",
    title: normalizedTopic,
    description: `${normalizedTopic} 文档生成`,
    createdAt: now,
    updatedAt: now,
  };
  const selectedTopic: Topic = {
    id: "general-doc-topic",
    unitId: unit.id,
    topicNumber: "1.1",
    title: normalizedTopic,
    learningObjectives: [
      {
        code: "GEN-LO1",
        description: `围绕「${normalizedTopic}」提炼可直接落地的课堂目标。`,
      },
    ],
    essentialKnowledge: [
      {
        code: "GEN-EK1",
        description: `围绕「${normalizedTopic}」组织结构化知识点与应用场景。`,
      },
    ],
    mathPractices: [],
    createdAt: now,
    updatedAt: now,
  };

  return {
    course,
    unit,
    topics: [selectedTopic],
    selectedTopic,
  };
}

async function loadCurriculumContext(params: {
  request: DocGenerateRequest;
  supabase: AppSupabaseClient;
}) {
  if (params.request.track === "general") {
    return buildGeneralCurriculumContext(
      params.request.topic || params.request.sourcePrompt,
    );
  }

  if (!params.request.courseId) {
    throw new Error("AP 文档生成必须提供 courseId。");
  }

  const course = await loadCourse(params.request.courseId, params.supabase);
  if (!course) {
    throw new Error("未找到对应课程。");
  }

  if (!params.request.unitId) {
    throw new Error("AP 文档生成必须提供 unitId。");
  }

  const { unit, topics } = await loadUnitWithTopics(params.request.unitId, params.supabase);
  if (!unit) {
    throw new Error("未找到对应单元。");
  }

  return {
    course,
    unit,
    topics,
    selectedTopic: pickTopicByHint(topics, params.request.topic),
  } satisfies CurriculumContext;
}

function withLayoutOverrides(
  document: DocumentModel,
  request: DocGenerateRequest,
): DocumentModel {
  const preferences = request.preferences;
  if (!preferences) return document;

  return {
    ...document,
    layoutConfig: {
      ...document.layoutConfig,
      pageSize: preferences.pageSize ?? document.layoutConfig.pageSize,
      columns: preferences.columns ?? document.layoutConfig.columns,
    },
    meta: {
      ...document.meta,
      duration:
        typeof preferences.duration === "number"
          ? preferences.duration
          : document.meta.duration ?? null,
    },
  };
}

function inferExerciseType(documentType: DocGenerateRequest["documentType"], sourcePrompt: string) {
  if (documentType === "quiz") return "MC" as const;
  if (/选择|单选|多选|choice|option|quiz/i.test(sourcePrompt)) return "MC" as const;
  return "FR" as const;
}

function finalizeExerciseDocument(params: {
  baseDocument: DocumentModel;
  documentType: DocGenerateRequest["documentType"];
  title: string;
  includeAnswerKey: boolean;
}) {
  const headerBlock = params.baseDocument.blocks[0];
  const blocks: DocumentBlock[] =
    params.documentType === "quiz"
      ? params.baseDocument.blocks.filter((block) => block.type !== "answer-space")
      : params.baseDocument.blocks;

  if (headerBlock?.type === "header") {
    const eyebrow =
      params.documentType === "exam"
        ? "Exam"
        : params.documentType === "quiz"
          ? "Quiz"
          : "Worksheet";
    blocks[0] = {
      ...headerBlock,
      data: {
        ...headerBlock.data,
        title: params.title,
        eyebrow,
      },
    };
  }

  return {
    ...params.baseDocument,
    type:
      params.documentType === "exam"
        ? "exam"
        : params.documentType === "quiz"
          ? "quiz"
          : "worksheet",
    title: params.title,
    blocks,
    meta: {
      ...params.baseDocument.meta,
      totalPoints: params.baseDocument.meta.totalPoints ?? null,
    },
    layoutConfig: {
      ...params.baseDocument.layoutConfig,
      showPageNumbers: params.documentType === "exam",
    },
  } satisfies DocumentModel;
}

async function generateExerciseBackedDocument(params: {
  request: DocGenerateRequest;
  curriculum: CurriculumContext;
  supabase: AppSupabaseClient;
}) {
  const questionCount = params.request.preferences?.questionCount ?? 6;
  const difficulty = params.request.preferences?.difficulty ?? "medium";
  const exerciseType = inferExerciseType(params.request.documentType, params.request.sourcePrompt);

  const examples = await loadExerciseExamples(
    params.curriculum.course.id,
    exerciseType,
    difficulty,
    2,
    params.supabase,
    {
      courseName: params.curriculum.course.name,
      subjectCategory: params.request.track === "general" ? "general" : undefined,
    },
  );

  const generated = await generateExercises({
    courseId: params.curriculum.course.id,
    unitId: params.curriculum.unit?.id ?? undefined,
    topicId: params.curriculum.selectedTopic?.id ?? undefined,
    track: params.request.track,
    subjectCategory: params.request.track === "general" ? params.curriculum.course.name : undefined,
    exerciseType,
    difficulty,
    count: questionCount,
    teacherRequest: params.request.sourcePrompt,
    preloaded: params.curriculum.unit
      ? {
          course: params.curriculum.course,
          unit: params.curriculum.unit,
          topics: params.curriculum.topics,
          selectedTopic: params.curriculum.selectedTopic,
          examples,
        }
      : undefined,
  });

  const title =
    params.request.documentType === "exam"
      ? `${params.curriculum.course.name} 测验卷`
      : params.request.documentType === "quiz"
        ? `${params.curriculum.course.name} 随堂测`
        : `${params.curriculum.course.name} 练习单`;

  const baseDocument = buildExercisesDocument({
    title,
    courseName: params.curriculum.course.name,
    unitName: params.curriculum.unit?.title ?? params.curriculum.selectedTopic?.title ?? null,
    questions: generated.exercises.map((exercise, index) => ({
      id: `doc-question-${index + 1}`,
      exerciseType: exercise.type,
      difficulty:
        typeof exercise.difficulty === "string" ? exercise.difficulty : difficulty,
      questionText: exercise.questionText ?? exercise.stem ?? "",
      options:
        Array.isArray(exercise.options) && exercise.options.length > 0
          ? exercise.options
          : undefined,
      correctAnswer: exercise.correctAnswer ?? exercise.correct_answer ?? "",
      solutionSteps: exercise.solutionSteps ?? exercise.solution ?? "",
      sourceLabel: params.curriculum.selectedTopic?.title ?? null,
    })),
  });

  return finalizeExerciseDocument({
    baseDocument,
    documentType: params.request.documentType,
    title,
    includeAnswerKey: Boolean(params.request.preferences?.includeAnswerKey),
  });
}

async function generateRubricDocument(params: {
  request: DocGenerateRequest;
  curriculum: CurriculumContext;
  supabase: AppSupabaseClient;
}) {
  const examples = await loadRubricExamples(
    params.curriculum.course.id,
    params.curriculum.unit?.id ?? undefined,
    2,
    params.supabase,
  );
  const rubric = await generateRubric({
    courseId: params.curriculum.course.id,
    unitId: params.curriculum.unit?.id ?? undefined,
    teacherRequest: params.request.sourcePrompt,
    track: params.request.track,
    subjectCategory: params.request.track === "general" ? params.curriculum.course.name : undefined,
    preloaded: {
      course: params.curriculum.course,
      unit: params.curriculum.unit,
      topics: params.curriculum.topics,
      examples,
    },
  });

  const mockRubric: MockRubric = {
    id: randomUUID(),
    title: rubric.title?.trim() || `${params.curriculum.course.name} Rubric`,
    dimensions: rubric.dimensions.map((dimension, index) => ({
      id: `rubric-dimension-${index + 1}`,
      name: dimension.name,
      description: dimension.description,
      weight: dimension.weight,
      levels: {
        excellent: dimension.levels.excellent,
        good: dimension.levels.good,
        passing: dimension.levels.passing,
        failing: dimension.levels.failing,
      },
    })),
  };

  const document = buildRubricDocumentFromMock(mockRubric);
  return {
    ...document,
    meta: {
      ...document.meta,
      courseName: params.curriculum.course.name,
      unitName: params.curriculum.unit?.title ?? null,
    },
  } satisfies DocumentModel;
}

function buildLessonPreferences(request: DocGenerateRequest): LessonPlanPreferences {
  return {
    ...DEFAULT_LESSON_PLAN_PREFERENCES,
    durationMinutes:
      request.preferences?.duration ?? DEFAULT_LESSON_PLAN_PREFERENCES.durationMinutes,
  };
}

function toLessonTopics(curriculum: CurriculumContext): CedTopicMatch[] {
  if (curriculum.topics.length > 0) {
    return curriculum.topics
      .slice(0, 3)
      .map((topic) => toCedTopicFromCurriculum(topic));
  }

  return [buildQuickTopic(curriculum.unit?.unitNumber ?? "1", curriculum.unit?.id ?? undefined)];
}

async function generateLessonPlanDocumentModel(params: {
  request: DocGenerateRequest;
  curriculum: CurriculumContext;
}) {
  const preferences = buildLessonPreferences(params.request);
  const topics = toLessonTopics(params.curriculum);
  const titleHint = `${params.curriculum.course.name} · ${params.curriculum.unit?.title ?? params.curriculum.selectedTopic?.title ?? "教案"}`;
  const outline = await generateOutlineWithAi({
    sourcePrompt: params.request.sourcePrompt,
    titleHint,
    topics,
    preferences,
    courseName: params.curriculum.course.name,
  });

  const sections = [];
  for (const [index, section] of outline.sections.entries()) {
    const blocks = await generateSectionBlocksWithAi({
      sourcePrompt: params.request.sourcePrompt,
      section,
      topics,
      preferences,
      previousSummary: outline.sections[index - 1]?.summary,
      nextSummary: outline.sections[index + 1]?.summary,
      sectionIndex: index,
      totalSections: outline.sections.length,
      allSections: outline.sections,
      courseName: params.curriculum.course.name,
    });
    sections.push({
      id: section.id,
      title: section.title,
      summary: section.summary,
      durationMinutes: section.durationMinutes,
      sortOrder: index,
      blocks,
    });
  }

  const structuredPlan: LessonPlanDocument = {
    id: randomUUID(),
    title: outline.title.trim() || titleHint,
    sourcePrompt: params.request.sourcePrompt,
    subjectLabel: params.curriculum.course.name,
    courseId: params.curriculum.course.id,
    unitId: params.curriculum.unit?.id ?? null,
    topicIds: topics.map((topic) => topic.id),
    learningObjectiveCodes: topics.flatMap((topic) =>
      topic.learningObjectives.map((item) => item.code),
    ),
    essentialKnowledge: topics.flatMap((topic) => topic.essentialKnowledge),
    preferences,
    status: "draft",
    publishedSlug: null,
    publishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections,
  };

  return buildLessonPlanDocumentFromStructured(structuredPlan);
}

export async function generateDocumentModel(params: {
  request: DocGenerateRequest;
  supabase: AppSupabaseClient;
}) {
  const curriculum = await loadCurriculumContext({
    request: params.request,
    supabase: params.supabase,
  });

  let document: DocumentModel;
  switch (params.request.documentType) {
    case "worksheet":
    case "exam":
    case "quiz":
      document = await generateExerciseBackedDocument({
        request: params.request,
        curriculum,
        supabase: params.supabase,
      });
      break;
    case "rubric":
      document = await generateRubricDocument({
        request: params.request,
        curriculum,
        supabase: params.supabase,
      });
      break;
    case "lesson-plan":
      document = await generateLessonPlanDocumentModel({
        request: params.request,
        curriculum,
      });
      break;
    default:
      throw new Error("暂不支持的文档类型。");
  }

  return withLayoutOverrides(document, params.request);
}
