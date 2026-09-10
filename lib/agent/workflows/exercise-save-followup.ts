import { addConversationMessage } from "@/lib/assistant/store";
import {
  extractEmbeddedArtifactPayload,
  stripEmbeddedArtifactPayload,
} from "@/lib/agent/artifact-payload";
import { buildAgentConversationContext, type AgentMemoryPreview } from "@/lib/agent/context-memory";
import { type AgentStreamLifecycleHooks, createDirectToolResponse } from "@/lib/agent/chat-stream";
import { type StoredConversationMessage } from "@/lib/agent/chat-shared";
import type { AgentTaskContext } from "@/lib/agent/task-context";
import {
  formatUnitLabel,
  rankApCourseCandidates,
  resolveApExerciseCurriculum,
} from "@/lib/agent/exercise-curriculum";
import { enqueueAgentMemoryFormation } from "@/lib/agent/memory-jobs";
import { collectRecentConversationText } from "@/lib/agent/workflows/exercise-direct-helpers";
import { buildExerciseTeacherRequest } from "@/lib/agent/workflows/worksheet-shared";
import {
  inferExplicitDifficultyFromTexts,
  parseIntentFromText,
} from "@/lib/chat/intent";
import { toExerciseDifficulty, fromExerciseDifficulty, type ExerciseDifficulty } from "@/types/exercise";
import { uuidLikeSchema } from "@/lib/api/id-schemas";
import { saveExercises } from "@/lib/exercises/save-service";
import { classifyAndPersistExerciseTaxonomy } from "@/lib/exercises/taxonomy";
import {
  createAgentGeneratedMaterialBatch,
  finalizeAgentGeneratedMaterialBatch,
} from "@/lib/question-bank/agent-generated-material";
import { syncExerciseSemanticIndexRows } from "@/lib/question-bank/semantic-index";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type ConversationStoreClient = Parameters<typeof addConversationMessage>[0];

type ConversationRecord = {
  id: string;
  title: string | null;
};

export type ParsedConversationExercise = {
  type: "MC" | "FR";
  difficulty: ExerciseDifficulty;
  questionText: string;
  options?: Array<{ label: string; text: string; isCorrect: boolean }>;
  correctAnswer: string;
  solutionSteps: string;
  commonMistakes: string[];
};

export type ExerciseArtifactContext = {
  assistantText: string;
  sourcePrompt: string;
  exercises: ParsedConversationExercise[];
  alreadySaved: boolean;
};

const EXERCISE_SECTION_HEADING_PATTERN = /^#{0,3}\s*第\s*(\d+)\s*题\s*$/gm;
const OPTION_LINE_PATTERN = /^([A-D])[\.\)．、:：]\s*(.+)$/;
const ANSWER_LINE_PATTERN = /^答案[:：]\s*(.+)$/;
const SOLUTION_LINE_PATTERN = /^解析[:：]\s*(.*)$/;
const COMMON_MISTAKES_PATTERN = /^常见误区[:：]\s*(.+)$/;
const SAVED_RESULT_PATTERN = /(已真实保存\s*\d+\s*道题到数据库|已先完成并真实保存)/;
const FOLLOW_UP_SAVED_RESULT_PATTERN = /已将上一轮生成的\s*\d+\s*道题真实保存到题库/;
const SAVE_FOLLOW_UP_REFERENCE_PATTERN =
  /(这些题|这批题|这几道题|上一轮|上次|刚才|刚生成|刚出的题|刚刚那批|those questions|these questions|previous questions|save them)/i;
const EXPLICIT_AP_COURSE_UNIT_PATTERN =
  /\b(AP\s+[A-Za-z][A-Za-z&/ +\-]*?)\s+Unit\s*(\d{1,2})\b/i;

function resolvePersistedTopicId(topicId: string | null | undefined, fallback: string | null | undefined) {
  const normalizedTopicId = `${topicId ?? ""}`.trim();
  if (normalizedTopicId && uuidLikeSchema.safeParse(normalizedTopicId).success) {
    return normalizedTopicId;
  }
  const normalizedFallback = `${fallback ?? ""}`.trim();
  return normalizedFallback && uuidLikeSchema.safeParse(normalizedFallback).success
    ? normalizedFallback
    : undefined;
}

function normalizeBlockText(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function normalizeCourseSeedName(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bap\b/i, "AP");
}

function extractExplicitApCourseUnit(texts: string[]) {
  for (const rawText of texts) {
    const text = rawText.trim();
    if (!text) continue;
    const match = text.match(EXPLICIT_AP_COURSE_UNIT_PATTERN);
    if (!match) continue;
    const courseName = normalizeCourseSeedName(match[1] ?? "");
    const unitNumber = `${match[2] ?? ""}`.trim();
    if (!courseName || !unitNumber) continue;
    return {
      courseName,
      unitNumber,
    };
  }
  return null;
}

function deriveCourseCode(courseName: string) {
  const normalized = courseName
    .replace(/^AP\s+/i, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  return normalized ? `AP-${normalized}` : "AP-CUSTOM";
}

async function ensureCourseUnitSeed(params: {
  courseName: string;
  unitNumber: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data: existingCourses, error: courseLookupError } = await admin
    .from("courses")
    .select("id, name, code, framework")
    .ilike("name", params.courseName)
    .limit(1);
  if (courseLookupError) {
    throw new Error("保存 follow-up 时读取课程失败");
  }

  const existingCourse = existingCourses?.[0] ?? null;
  const course =
    existingCourse ??
    (
      await admin
        .from("courses")
        .insert({
          name: params.courseName,
          code: deriveCourseCode(params.courseName),
          framework: "AP",
        })
        .select("id, name, code, framework")
        .single()
    ).data;

  if (!course?.id) {
    throw new Error("保存 follow-up 时创建课程失败");
  }

  const { data: existingUnits, error: unitLookupError } = await admin
    .from("units")
    .select("id, course_id, unit_number, title")
    .eq("course_id", course.id)
    .eq("unit_number", params.unitNumber)
    .limit(1);
  if (unitLookupError) {
    throw new Error("保存 follow-up 时读取单元失败");
  }

  const existingUnit = existingUnits?.[0] ?? null;
  const unit =
    existingUnit ??
    (
      await admin
        .from("units")
        .insert({
          course_id: course.id,
          unit_number: params.unitNumber,
          title: `Unit ${params.unitNumber}`,
        })
        .select("id, course_id, unit_number, title")
        .single()
    ).data;

  if (!unit?.id) {
    throw new Error("保存 follow-up 时创建单元失败");
  }

  return {
    courseId: course.id,
    courseName: course.name,
    unitId: unit.id,
    unitLabel: formatUnitLabel(unit),
  };
}

function inferDifficulty(texts: string[]): ExerciseDifficulty {
  return toExerciseDifficulty(inferExplicitDifficultyFromTexts(texts) ?? 2);
}

function splitExerciseSections(content: string) {
  const normalized = normalizeBlockText(content);
  const matches = Array.from(normalized.matchAll(EXERCISE_SECTION_HEADING_PATTERN));
  if (matches.length === 0) return [];

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const bodyStart = start + match[0].length;
    const end =
      index + 1 < matches.length
        ? (matches[index + 1]?.index ?? normalized.length)
        : normalized.length;
    return normalizeBlockText(normalized.slice(bodyStart, end));
  });
}

function parseExerciseSection(
  section: string,
  difficulty: ExerciseDifficulty,
): ParsedConversationExercise | null {
  const lines = normalizeBlockText(section)
    .split("\n")
    .map((line) => line.trimEnd());

  const questionLines: string[] = [];
  const optionLines: Array<{ label: string; text: string }> = [];
  const solutionLines: string[] = [];
  const commonMistakes: string[] = [];
  let correctAnswer = "";
  let collectingSolution = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line && !collectingSolution) {
      if (questionLines.length > 0 && questionLines[questionLines.length - 1] !== "") {
        questionLines.push("");
      }
      continue;
    }

    const optionMatch = line.match(OPTION_LINE_PATTERN);
    if (!collectingSolution && optionMatch) {
      optionLines.push({
        label: optionMatch[1],
        text: optionMatch[2].trim(),
      });
      continue;
    }

    const answerMatch = line.match(ANSWER_LINE_PATTERN);
    if (answerMatch) {
      collectingSolution = false;
      correctAnswer = answerMatch[1].trim();
      continue;
    }

    const solutionMatch = line.match(SOLUTION_LINE_PATTERN);
    if (solutionMatch) {
      collectingSolution = true;
      solutionLines.push(solutionMatch[1].trim());
      continue;
    }

    const commonMistakesMatch = line.match(COMMON_MISTAKES_PATTERN);
    if (commonMistakesMatch) {
      collectingSolution = false;
      commonMistakes.push(
        ...commonMistakesMatch[1]
          .split(/[；;]+/)
          .map((item) => item.trim())
          .filter(Boolean),
      );
      continue;
    }

    if (collectingSolution) {
      solutionLines.push(line);
      continue;
    }

    questionLines.push(line);
  }

  const questionText = questionLines.join("\n").trim();
  const solutionSteps = solutionLines.join("\n").trim();
  if (!questionText || !correctAnswer || !solutionSteps) {
    return null;
  }

  if (optionLines.length > 0) {
    if (optionLines.length !== 4) {
      return null;
    }
    return {
      type: "MC",
      difficulty,
      questionText,
      options: optionLines.map((option) => ({
        label: option.label,
        text: option.text,
        isCorrect: option.label === correctAnswer,
      })),
      correctAnswer,
      solutionSteps,
      commonMistakes,
    };
  }

  return {
    type: "FR",
    difficulty,
    questionText,
    correctAnswer,
    solutionSteps,
    commonMistakes,
  };
}

export function parseExercisesFromAssistantText(params: {
  assistantText: string;
  sourcePrompt?: string;
  fallbackDifficulty?: ExerciseDifficulty;
}) {
  const normalizedAssistantText = normalizeBlockText(
    stripEmbeddedArtifactPayload(params.assistantText),
  );
  const sections = splitExerciseSections(normalizedAssistantText);
  const difficulty =
    params.fallbackDifficulty ??
    inferDifficulty([params.sourcePrompt ?? "", normalizedAssistantText]);

  return sections
    .map((section) => parseExerciseSection(section, difficulty))
    .filter((item): item is ParsedConversationExercise => Boolean(item));
}

export function findLatestExerciseArtifact(
  previousMessages: StoredConversationMessage[],
): ExerciseArtifactContext | null {
  let seenSaveConfirmation = false;

  for (let index = previousMessages.length - 1; index >= 0; index -= 1) {
    const message = previousMessages[index];
    if (message.role !== "assistant") continue;

    const embeddedArtifact = extractEmbeddedArtifactPayload(message.content);
    const visibleAssistantText = normalizeBlockText(
      stripEmbeddedArtifactPayload(message.content),
    );
    const assistantText = normalizeBlockText(
      embeddedArtifact?.kind === "exercises"
        ? embeddedArtifact.rawContent
        : visibleAssistantText,
    );
    if (!assistantText) continue;
    if (
      FOLLOW_UP_SAVED_RESULT_PATTERN.test(visibleAssistantText) ||
      FOLLOW_UP_SAVED_RESULT_PATTERN.test(assistantText)
    ) {
      seenSaveConfirmation = true;
      continue;
    }

    const sourcePrompt =
      previousMessages
        .slice(0, index)
        .reverse()
        .find((item) => item.role === "user")
        ?.content.trim() ?? "";
    const exercises = parseExercisesFromAssistantText({
      assistantText,
      sourcePrompt,
    });
    if (exercises.length === 0) continue;

    return {
      assistantText,
      sourcePrompt,
      exercises,
      alreadySaved:
        seenSaveConfirmation ||
        SAVED_RESULT_PATTERN.test(visibleAssistantText) ||
        SAVED_RESULT_PATTERN.test(assistantText),
    };
  }

  return null;
}

export function shouldHandleExerciseSaveFollowUp(params: {
  latestUserPrompt: string;
  displayUserPrompt: string;
  previousMessages: StoredConversationMessage[];
  taskAction?: string | null;
}) {
  const currentPrompt = (params.displayUserPrompt || params.latestUserPrompt).trim();
  if (!currentPrompt) return false;

  const mentionsSave = /(保存(?:到|进)?题库|存入题库|写入题库|入库|归档(?:到)?题库)/i.test(
    currentPrompt,
  );
  if (!mentionsSave && params.taskAction !== "save_exercises") {
    return false;
  }

  const latestExerciseArtifact = findLatestExerciseArtifact(params.previousMessages);
  if (params.taskAction === "save_exercises") {
    return true;
  }
  if (!latestExerciseArtifact) {
    return false;
  }

  const looksLikeFollowUp =
    SAVE_FOLLOW_UP_REFERENCE_PATTERN.test(currentPrompt) ||
    !/(生成|出\s*\d+|做\s*\d+|再来几道|再出|重新生成|generate)/i.test(currentPrompt);

  return looksLikeFollowUp;
}

function buildMissingSaveContextMessage(params: {
  courseName: string | null;
  clarificationSummary: string | null;
  clarificationQuestion: string | null;
  placeholder: string | null;
  options?: string[];
}) {
  const summary =
    params.clarificationSummary ||
    (params.courseName
      ? `我已经识别课程是 ${params.courseName}，但还差一个最小必要信息。`
      : "要把上一轮题目真实写入题库，我还需要确定课程归属。");
  const question =
    params.clarificationQuestion ||
    (params.courseName ? "请补充你希望归档到哪个 Unit。" : "请补充 AP 课程和 Unit。");
  const placeholder =
    params.placeholder || (params.courseName ? `${params.courseName} Unit 3` : "例如：AP Calculus BC Unit 3");

  return [
    summary,
    question,
    ...(params.options ?? []).map((option) => `- ${option}`),
    `直接回复示例：${placeholder}`,
    "补全后我会直接保存上一轮已经生成的题目，不会重新出题。",
  ]
    .filter(Boolean)
    .join("\n");
}

async function resolveSaveFollowUpCurriculum(params: {
  supabase: ConversationStoreClient;
  promptText: string;
  recentConversationText: string;
  sourcePrompt: string;
}): Promise<Awaited<ReturnType<typeof resolveApExerciseCurriculum>>> {
  const resolved = await resolveApExerciseCurriculum({
    supabase: params.supabase,
    promptText: params.promptText,
    recentConversationText: params.recentConversationText,
  });
  if (resolved.courseId) {
    return resolved;
  }

  const combinedPrompt = [params.promptText, params.sourcePrompt]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n");
  const parsedIntent = parseIntentFromText(combinedPrompt || params.promptText);
  const hasExplicitCurriculumSignal =
    /ap\s+[a-z]+/i.test(combinedPrompt) || /unit\s*\d{1,2}|第\s*\d{1,2}\s*单元/i.test(combinedPrompt);
  if (!hasExplicitCurriculumSignal) {
    return resolved;
  }

  const { data: courses, error: courseError } = await params.supabase
    .from("courses")
    .select("id, name, code, framework")
    .eq("framework", "AP");
  if (courseError || !Array.isArray(courses) || courses.length === 0) {
    const explicitCurriculum = extractExplicitApCourseUnit([
      params.promptText,
      params.sourcePrompt,
    ]);
    if (!explicitCurriculum) {
      return resolved;
    }
    const seeded = await ensureCourseUnitSeed(explicitCurriculum);
    return {
      ...resolved,
      missing: [],
      clarification: null,
      saveMode: "save_now",
      courseId: seeded.courseId,
      courseName: seeded.courseName,
      unitId: seeded.unitId,
      unitLabel: seeded.unitLabel,
    };
  }

  const courseCandidates = rankApCourseCandidates({
    promptText: combinedPrompt,
    parsedIntent,
    courses,
  });
  const bestCourse = courseCandidates[0]?.item;
  if (!bestCourse) {
    const explicitCurriculum = extractExplicitApCourseUnit([
      params.promptText,
      params.sourcePrompt,
    ]);
    if (!explicitCurriculum) {
      return resolved;
    }
    const seeded = await ensureCourseUnitSeed(explicitCurriculum);
    return {
      ...resolved,
      missing: [],
      clarification: null,
      saveMode: "save_now",
      courseId: seeded.courseId,
      courseName: seeded.courseName,
      unitId: seeded.unitId,
      unitLabel: seeded.unitLabel,
    };
  }

  const { data: units, error: unitError } = await params.supabase
    .from("units")
    .select("id, course_id, unit_number, title")
    .eq("course_id", bestCourse.id);
  if (unitError || !Array.isArray(units)) {
    return {
      ...resolved,
      courseId: bestCourse.id,
      courseName: bestCourse.name,
      missing: ["unit"],
    };
  }

  const matchedUnit =
    units.find((item) => `${item.unit_number}` === `${parsedIntent.unitHint ?? ""}`) ?? null;
  if (!matchedUnit) {
    const explicitCurriculum = extractExplicitApCourseUnit([
      params.promptText,
      params.sourcePrompt,
    ]);
    if (explicitCurriculum && explicitCurriculum.unitNumber) {
      const seeded = await ensureCourseUnitSeed({
        courseName: bestCourse.name,
        unitNumber: explicitCurriculum.unitNumber,
      });
      return {
        ...resolved,
        missing: [],
        clarification: null,
        saveMode: "save_now",
        courseId: seeded.courseId,
        courseName: seeded.courseName,
        unitId: seeded.unitId,
        unitLabel: seeded.unitLabel,
      };
    }
    return {
      ...resolved,
      courseId: bestCourse.id,
      courseName: bestCourse.name,
      missing: ["unit"],
    };
  }

  return {
    ...resolved,
    missing: [],
    clarification: null,
    saveMode: "save_now",
    courseId: bestCourse.id,
    courseName: bestCourse.name,
    unitId: matchedUnit.id,
    unitLabel: formatUnitLabel(matchedUnit),
  };
}

export async function handleExerciseSaveFollowUp(params: {
  supabase: ConversationStoreClient;
  teacherId: string;
  conversation: ConversationRecord;
  previousMessages: StoredConversationMessage[];
  isFirstTurn: boolean;
  displayUserPrompt: string;
  latestUserPrompt: string;
  profileKey: string;
  taskContext?: AgentTaskContext | null;
  memoryPreview?: AgentMemoryPreview;
  streamHooks?: AgentStreamLifecycleHooks;
}) {
  const startedAt = Date.now();
  const artifactContext = findLatestExerciseArtifact(params.previousMessages);

  if (!artifactContext) {
    const assistantText =
      "当前对话里还没有可归档的题目。请先让我生成题目，或者明确说明要保存哪一轮题。";
    const assistantMessage = await addConversationMessage(params.supabase, {
      teacherId: params.teacherId,
      conversationId: params.conversation.id,
      role: "assistant",
      content: assistantText,
    });
    const nextConversationContext = buildAgentConversationContext([
      ...params.previousMessages,
      { role: "user", content: params.displayUserPrompt },
      { role: "assistant", content: assistantText },
    ]);
    await enqueueAgentMemoryFormation({
      teacherId: params.teacherId,
      profileKey: params.profileKey,
      conversationId: params.conversation.id,
      conversationTitle: params.conversation.title,
      assistantMessageId: assistantMessage.id,
      displayUserPrompt: params.displayUserPrompt,
      assistantText,
      toolNames: ["save_exercises"],
      nextConversationContext,
      isFirstTurn: params.isFirstTurn,
    });

    return createDirectToolResponse({
      text: assistantText,
      startedAt,
      totalMs: Math.max(0, Date.now() - startedAt),
      conversationId: params.conversation.id,
      memoryPreview: params.memoryPreview,
      toolName: "save_exercises",
      toolInput: { mode: "save_existing_exercises" },
      toolOutput: { savedCount: 0, reason: "no_exercise_artifact" },
      stepLabel: "保存到题库",
      hooks: params.streamHooks,
    });
  }

  if (artifactContext.alreadySaved) {
    const assistantText = `上一轮生成的 ${artifactContext.exercises.length} 道题已经真实入库，这次不再重复写库。`;
    const assistantMessage = await addConversationMessage(params.supabase, {
      teacherId: params.teacherId,
      conversationId: params.conversation.id,
      role: "assistant",
      content: assistantText,
    });
    const nextConversationContext = buildAgentConversationContext([
      ...params.previousMessages,
      { role: "user", content: params.displayUserPrompt },
      { role: "assistant", content: assistantText },
    ]);
    await enqueueAgentMemoryFormation({
      teacherId: params.teacherId,
      profileKey: params.profileKey,
      conversationId: params.conversation.id,
      conversationTitle: params.conversation.title,
      assistantMessageId: assistantMessage.id,
      displayUserPrompt: params.displayUserPrompt,
      assistantText,
      toolNames: ["save_exercises"],
      nextConversationContext,
      isFirstTurn: params.isFirstTurn,
    });

    return createDirectToolResponse({
      text: assistantText,
      startedAt,
      totalMs: Math.max(0, Date.now() - startedAt),
      conversationId: params.conversation.id,
      memoryPreview: params.memoryPreview,
      toolName: "save_exercises",
      toolInput: {
        mode: "save_existing_exercises",
        requestedCount: artifactContext.exercises.length,
      },
      toolOutput: {
        savedCount: 0,
        alreadySaved: true,
      },
      stepLabel: "保存到题库",
      hooks: params.streamHooks,
    });
  }

  const exerciseRequestText = buildExerciseTeacherRequest(
    params.displayUserPrompt || params.latestUserPrompt,
    params.previousMessages,
    undefined,
    params.taskContext
      ? {
          curriculum: params.taskContext.curriculum,
          topic: params.taskContext.topic,
          count: params.taskContext.count,
          duration: params.taskContext.duration,
          scope: params.taskContext.scope,
        }
      : null,
  );
  const recentConversationText = collectRecentConversationText(params.previousMessages);
  const curriculum = await resolveSaveFollowUpCurriculum({
    supabase: params.supabase,
    promptText: exerciseRequestText,
    recentConversationText,
    sourcePrompt: artifactContext.sourcePrompt,
  });

  if (curriculum.missing.length > 0 || !curriculum.courseId) {
    const clarification = curriculum.clarification;
    const assistantText = buildMissingSaveContextMessage({
      courseName: curriculum.courseName,
      clarificationSummary: clarification?.summary ?? null,
      clarificationQuestion: clarification?.question ?? null,
      placeholder: clarification?.placeholder ?? null,
      options: clarification?.options ?? [],
    });
    const assistantMessage = await addConversationMessage(params.supabase, {
      teacherId: params.teacherId,
      conversationId: params.conversation.id,
      role: "assistant",
      content: assistantText,
    });
    const nextConversationContext = buildAgentConversationContext([
      ...params.previousMessages,
      { role: "user", content: params.displayUserPrompt },
      { role: "assistant", content: assistantText },
    ]);
    await enqueueAgentMemoryFormation({
      teacherId: params.teacherId,
      profileKey: params.profileKey,
      conversationId: params.conversation.id,
      conversationTitle: params.conversation.title,
      assistantMessageId: assistantMessage.id,
      displayUserPrompt: params.displayUserPrompt,
      assistantText,
      toolNames: ["save_exercises"],
      nextConversationContext,
      isFirstTurn: params.isFirstTurn,
    });

    return createDirectToolResponse({
      text: assistantText,
      startedAt,
      totalMs: Math.max(0, Date.now() - startedAt),
      conversationId: params.conversation.id,
      memoryPreview: params.memoryPreview,
      toolName: "save_exercises",
      toolInput: {
        mode: "save_existing_exercises",
        requestedCount: artifactContext.exercises.length,
      },
      toolOutput: {
        missing: curriculum.missing,
        courseName: curriculum.courseName,
      },
      stepLabel: "保存到题库",
      hooks: params.streamHooks,
    });
  }

  const materialBatch = await createAgentGeneratedMaterialBatch({
    supabase: params.supabase,
    teacherId: params.teacherId,
    sourceConversationId: params.conversation.id,
    teacherPrompt: artifactContext.sourcePrompt || params.displayUserPrompt,
    courseId: curriculum.courseId ?? null,
    courseLabel: curriculum.courseName ?? null,
    unitId: curriculum.unitId ?? null,
    unitLabel: curriculum.unitLabel ?? null,
    topicId: curriculum.topicId ?? null,
    topicLabel: curriculum.topicName ?? null,
    exercises: artifactContext.exercises.map((exercise) => ({
      type: exercise.type,
      difficulty: exercise.difficulty,
      questionText: exercise.questionText,
    })),
  });

  let saveResult: Awaited<ReturnType<typeof saveExercises>>;
  try {
    saveResult = await saveExercises({
      supabase: params.supabase,
      teacherId: params.teacherId,
      sourceConversationId: params.conversation.id,
      syncToContentLibrary: true,
      deferPostProcessing: true,
      request: {
        exercises: artifactContext.exercises.map((exercise) => ({
          ...exercise,
          courseId: curriculum.courseId!,
          unitId: curriculum.unitId ?? undefined,
          topicId: resolvePersistedTopicId(
            (exercise as { topicId?: string | null }).topicId,
            curriculum.topicId,
          ),
          verificationStatus: "pending" as const,
          verificationAttempts: 1,
          teacherPrompt: artifactContext.sourcePrompt || params.displayUserPrompt,
          isAiGenerated: true,
          teacherModified: false,
          sourceKind: "agent_generated" as const,
          importBatchId: materialBatch.id,
          sourceFileName: materialBatch.label,
        })),
      },
    });
  } catch (error) {
    await finalizeAgentGeneratedMaterialBatch({
      supabase: params.supabase,
      teacherId: params.teacherId,
      batchId: materialBatch.id,
      base: materialBatch,
      artifactMarkdown: artifactContext.assistantText,
      savedCount: 0,
      status: "failed",
      message:
        error instanceof Error
          ? `toBeduTrack 跟进归档失败：${error.message}`
          : "toBeduTrack 跟进归档失败。",
    }).catch(() => null);
    throw error;
  }

  const assistantText = [
    `已将上一轮生成的 ${saveResult.ids.length} 道题真实保存到题库。`,
    curriculum.courseName ? `课程：${curriculum.courseName}` : "",
    curriculum.unitLabel ? `单元：${curriculum.unitLabel}` : "",
    curriculum.topicName ? `知识点：${curriculum.topicName}` : "",
    "如需下一步，我可以直接基于这批题继续组 worksheet 或从题库调题。",
  ]
    .filter(Boolean)
    .join("\n");

  const assistantMessage = await addConversationMessage(params.supabase, {
    teacherId: params.teacherId,
    conversationId: params.conversation.id,
    role: "assistant",
    content: assistantText,
  });

  await finalizeAgentGeneratedMaterialBatch({
    supabase: params.supabase,
    teacherId: params.teacherId,
    batchId: materialBatch.id,
    base: materialBatch,
    sourceMessageId: assistantMessage.id,
    artifactMarkdown: artifactContext.assistantText,
    savedCount: saveResult.ids.length,
    message: `toBeduTrack 已归档 ${saveResult.ids.length} 道跟进生成题到题库。`,
  });

  const nextConversationContext = buildAgentConversationContext([
    ...params.previousMessages,
    { role: "user", content: params.displayUserPrompt },
    { role: "assistant", content: assistantText },
  ]);

  scheduleReliableAfterTask({
    taskType: "agent.exercise_save_followup_postprocess",
    taskKey: assistantMessage.id,
    teacherId: params.teacherId,
    conversationId: params.conversation.id,
    payload: {
      savedCount: saveResult.ids.length,
      courseName: curriculum.courseName ?? null,
      unitLabel: curriculum.unitLabel ?? null,
    },
    run: async () => {
      const postProcessExercisesTask = classifyAndPersistExerciseTaxonomy({
        supabase: params.supabase,
        teacherId: params.teacherId,
        syncContentLibrary: false,
        exercises: saveResult.ids.map((exerciseId, index) => ({
          exerciseId,
          questionText: artifactContext.exercises[index]?.questionText ?? "",
          correctAnswer: artifactContext.exercises[index]?.correctAnswer ?? "",
          solutionSteps: artifactContext.exercises[index]?.solutionSteps ?? "",
          type: artifactContext.exercises[index]?.type ?? "FR",
          difficulty: fromExerciseDifficulty(artifactContext.exercises[index]?.difficulty ?? "medium"),
          teacherPrompt: artifactContext.sourcePrompt || params.displayUserPrompt,
          courseLabel: curriculum.courseName ?? null,
          unitLabel: curriculum.unitLabel ?? null,
        })),
      })
        .then(async () => {
          await syncExerciseSemanticIndexRows({
            supabase: params.supabase,
            teacherId: params.teacherId,
            exerciseIds: saveResult.ids,
          });
        })
        .catch((error) => {
          console.error("保存 follow-up 的题库 taxonomy/semantic 后台同步失败", error);
        });

      await Promise.all([
        enqueueAgentMemoryFormation({
          teacherId: params.teacherId,
          profileKey: params.profileKey,
          conversationId: params.conversation.id,
          conversationTitle: params.conversation.title,
          assistantMessageId: assistantMessage.id,
          displayUserPrompt: params.displayUserPrompt,
          assistantText,
          toolNames: ["save_exercises"],
          nextConversationContext,
          isFirstTurn: params.isFirstTurn,
          scheduleWithAfter: false,
        }),
        postProcessExercisesTask,
      ]);
    },
  });

  return createDirectToolResponse({
    text: assistantText,
    startedAt,
    totalMs: Math.max(0, Date.now() - startedAt),
    conversationId: params.conversation.id,
    memoryPreview: params.memoryPreview,
    toolName: "save_exercises",
    toolInput: {
      mode: "save_existing_exercises",
      requestedCount: artifactContext.exercises.length,
      courseId: curriculum.courseId,
      unitId: curriculum.unitId ?? null,
      topicId: curriculum.topicId ?? null,
    },
    toolOutput: {
      savedCount: saveResult.ids.length,
      ids: saveResult.ids,
    },
    stepLabel: "保存到题库",
    hooks: params.streamHooks,
  });
}
