import {
  getConversation,
  getKnowledgeDocument,
  listConversationMessages,
} from "@/lib/assistant/store";
import {
  extractEmbeddedArtifactPayload,
  stripEmbeddedArtifactPayload,
} from "@/lib/agent/artifact-payload";
import { resolveProfileKey } from "@/lib/agent/chat-shared";
import { buildAgentConversationContext } from "@/lib/agent/context-memory";
import { enqueueAgentMemoryFormation } from "@/lib/agent/memory-jobs";
import { buildPblArtifactAssistantText } from "@/lib/agent/pbl-artifact";
import {
  createAgentLessonPlanContentLibraryItem,
  syncPblProjectContentLibraryItem,
} from "@/lib/content-library/sync";
import {
  runContentLibraryOriginCleanupTask,
  runContentLibraryProjectionSyncTask,
} from "@/lib/content-library/background-tasks";
import {
  runContentAssetPdfLibraryCleanupTask,
  runContentAssetPdfLibrarySyncTask,
} from "@/lib/content-assets/pdf-library-sync";
import { runContentAssetCleanupTask } from "@/lib/content-assets/store";
import { runDocumentSourceProjectionSyncTask } from "@/lib/documents/background-tasks";
import { classifyAndPersistExerciseTaxonomy } from "@/lib/exercises/taxonomy";
import { autoImportKnowledgeDocumentToQuestionBank } from "@/lib/question-bank/knowledge-auto-import";
import { syncExerciseSemanticIndexRows } from "@/lib/question-bank/semantic-index";
import {
  appendGenerationLog,
  getProjectPlan,
  saveProjectPlan,
  type PblStoreClient,
} from "@/lib/pbl/store";
import { summarizeMarkdownPlain } from "@/lib/pbl/plan-markdown";
import type { PblPlan, PblCurriculumSystem, WebSearchResult } from "@/lib/pbl/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type BackgroundTaskReplayContext = {
  taskType: string;
  taskKey: string;
  teacherId?: string | null;
  conversationId?: string | null;
  requestId?: string | null;
  payload?: Record<string, unknown> | null;
};

type ReplayTurnContext = {
  teacherId: string;
  conversationId: string;
  conversationTitle: string | null;
  assistantMessageId: string;
  assistantText: string;
  assistantCreatedAt: string;
  displayUserPrompt: string;
  nextConversationContext: ReturnType<typeof buildAgentConversationContext>;
  isFirstTurn: boolean;
};

const TERMINAL_KNOWLEDGE_IMPORT_STATUSES = new Set([
  "saved",
  "requires_review",
  "requires_curriculum",
  "no_questions",
]);

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown) {
  const normalized = asString(value);
  return normalized || null;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asCurriculumSystem(value: unknown): PblCurriculumSystem {
  const normalized = asString(value);
  if (normalized === "AP" || normalized === "IB" || normalized === "CN") {
    return normalized;
  }
  return "CN";
}

function extractTrailingBulletSection(text: string, heading: string) {
  const marker = `${heading}\n`;
  const start = text.lastIndexOf(marker);
  if (start < 0) return [] as string[];

  const sectionLines = text
    .slice(start + marker.length)
    .split(/\r?\n/)
    .map((line) => line.trim());
  const items: string[] = [];

  for (const line of sectionLines) {
    if (!line) {
      if (items.length > 0) break;
      continue;
    }
    if (!line.startsWith("- ")) break;
    items.push(line.slice(2).trim());
  }

  return items;
}

function extractLessonPlanSources(visibleText: string) {
  return extractTrailingBulletSection(visibleText, "参考来源：")
    .map((line) => {
      const match = line.match(/^(.*?)(https?:\/\/\S+)$/);
      if (!match) {
        return {
          title: line,
          url: "",
        };
      }
      return {
        title: match[1].trim(),
        url: match[2].trim(),
      };
    })
    .filter((item) => item.title);
}

function extractLessonPlanWarnings(visibleText: string) {
  return extractTrailingBulletSection(visibleText, "材料处理提醒：");
}

function buildPblStoreClient(teacherId: string): PblStoreClient {
  return {
    teacherId,
    supabase: createAdminSupabaseClient(),
    isMock: false,
  };
}

function buildPblMaterialReferences(searchResults: WebSearchResult[]): PblPlan["materialReferences"] {
  return searchResults.slice(0, 8).map((item, index) => ({
    materialId: `WEB-${index + 1}`,
    title: item.title,
    referenceType: index === 0 ? "driving_question" : "background_info",
  }));
}

function buildRecoveredPblPlan(params: {
  planId: string;
  teacherPrompt: string;
  assistantText: string;
  assistantCreatedAt: string;
}) {
  const artifactPayload = extractEmbeddedArtifactPayload(params.assistantText);
  if (!artifactPayload || artifactPayload.kind !== "pbl") {
    throw new Error("PBL replay 缺少可恢复的 artifact payload");
  }

  const metadata = asObject(artifactPayload.metadata);
  const searchResults = Array.isArray(metadata.searchResults)
    ? metadata.searchResults.filter((item): item is WebSearchResult => Boolean(item) && typeof item === "object")
    : [];
  const title = artifactPayload.title || "未命名 PBL 项目";
  const curriculumSystem = asCurriculumSystem(metadata.curriculumSystem);
  const primarySubject = asString(metadata.primarySubject) || "未知学科";
  const grade = asString(metadata.grade) || "未知";
  const totalPeriods = Math.max(2, asNumber(metadata.totalPeriods, 12));
  const coreChallenge = asString(metadata.coreChallenge) || artifactPayload.summary || title;
  const updatedAt = asString(metadata.updatedAt) || params.assistantCreatedAt;
  const version = Math.max(1, asNumber(metadata.version, 1));

  return {
    id: asString(metadata.planId) || params.planId,
    title,
    originalPrompt: params.teacherPrompt,
    inferredParams: {
      curriculumSystem,
      primarySubject,
      grade,
      totalPeriods,
      difficulty: "advanced" as const,
      topic: title,
      knowledgePoints: [],
    },
    markdownContent: artifactPayload.rawContent,
    drivingQuestion: coreChallenge,
    primarySubject,
    curriculumSystem,
    grade,
    searchResults,
    chatHistory: [
      {
        id: `${params.planId}-user-replay`,
        role: "user" as const,
        content: params.teacherPrompt,
        createdAt: params.assistantCreatedAt,
      },
      {
        id: `${params.planId}-assistant-replay`,
        role: "assistant" as const,
        content: "后台重放已恢复该 PBL 方案的持久化与内容库同步。",
        changeSummary: "后台自动恢复",
        createdAt: params.assistantCreatedAt,
      },
    ],
    status: "draft" as const,
    version,
    createdAt: params.assistantCreatedAt,
    updatedAt,
    overviewText: summarizeMarkdownPlain(artifactPayload.rawContent, 240),
    totalPeriods,
    difficulty: "advanced" as const,
    crossSubjects: [],
    suggestedGroupSize: 4,
    suggestedGroupCount: 8,
    finalOutcomeForm: asString(metadata.finalOutcomeForm) || "项目成果文档 + 展示答辩",
    finalOutcomeRequirements: "",
    projectBrief: {
      realWorldContext: artifactPayload.summary || summarizeMarkdownPlain(artifactPayload.rawContent, 240),
      coreChallenge,
      researchBoundary: "围绕驱动问题界定研究对象、证据边界和任务范围。",
      stakeholders: ["学生", "教师", "真实情境相关方"],
      successCriteria: ["能回应驱动问题", "证据链完整", "成果可展示"],
      recommendedEvidence: ["真实案例", "课程标准", "过程记录"],
    },
    targetAudience: asString(metadata.targetAudience) || grade,
    presentationFormat: "课堂展示 / 答辩",
    stages: [],
    curriculumAlignment: [],
    rubric: [],
    assessments: [],
    materialReferences: buildPblMaterialReferences(searchResults),
    teacherGuidance: {
      commonDifficulties: [],
      differentiation: [],
      timeManagement: [],
      crossDisciplineCollab: [],
    },
    studentVersionMarkdown: artifactPayload.rawContent,
    qualityCheck: [],
  } satisfies PblPlan;
}

async function loadReplayTurnContext(params: {
  teacherId: string;
  conversationId: string;
  assistantMessageId: string;
}): Promise<ReplayTurnContext> {
  const admin = createAdminSupabaseClient();
  const [conversation, messages] = await Promise.all([
    getConversation(admin, params.teacherId, params.conversationId),
    listConversationMessages(admin, params.teacherId, params.conversationId),
  ]);

  if (!conversation) {
    throw new Error("会话不存在，无法重放消息型后台任务");
  }

  const assistantIndex = messages.findIndex(
    (message) => message.id === params.assistantMessageId,
  );
  if (assistantIndex < 0) {
    throw new Error("未找到对应 assistant message，无法重放后台任务");
  }

  const assistantMessage = messages[assistantIndex];
  if (assistantMessage.role !== "assistant") {
    throw new Error("重放目标消息不是 assistant message");
  }

  let latestUserPrompt = "";
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user" && message.content.trim()) {
      latestUserPrompt = message.content.trim();
      break;
    }
  }

  const currentTurnMessages = messages
    .slice(0, assistantIndex + 1)
    .map((message) => ({
      role: message.role as "user" | "assistant" | "system",
      content: message.content,
      createdAt: message.createdAt,
      sources: message.sources,
    }));
  const userTurnCount = currentTurnMessages.filter(
    (message) => message.role === "user",
  ).length;

  return {
    teacherId: params.teacherId,
    conversationId: params.conversationId,
    conversationTitle: conversation.title,
    assistantMessageId: assistantMessage.id,
    assistantText: assistantMessage.content,
    assistantCreatedAt: assistantMessage.createdAt,
    displayUserPrompt: latestUserPrompt || "继续当前任务",
    nextConversationContext: buildAgentConversationContext(currentTurnMessages),
    isFirstTurn: userTurnCount <= 1,
  };
}

async function replayAgentMemoryForTurn(params: {
  teacherId: string;
  conversationId: string;
  assistantMessageId: string;
  toolNames: string[];
  assistantText?: string;
}) {
  const turn = await loadReplayTurnContext({
    teacherId: params.teacherId,
    conversationId: params.conversationId,
    assistantMessageId: params.assistantMessageId,
  });

  await enqueueAgentMemoryFormation({
    teacherId: turn.teacherId,
    profileKey: resolveProfileKey(undefined, turn.teacherId),
    conversationId: turn.conversationId,
    conversationTitle: turn.conversationTitle,
    assistantMessageId: turn.assistantMessageId,
    displayUserPrompt: turn.displayUserPrompt,
    assistantText: params.assistantText ?? turn.assistantText,
    toolNames: params.toolNames,
    nextConversationContext: turn.nextConversationContext,
    isFirstTurn: turn.isFirstTurn,
    scheduleWithAfter: false,
  });

  return turn;
}

async function replayPblProjectSync(context: BackgroundTaskReplayContext) {
  const teacherId = asString(context.teacherId);
  const planId = asString(context.payload?.projectId) || context.taskKey;
  if (!teacherId || !planId) {
    throw new Error("PBL project sync 缺少 teacherId 或 planId");
  }

  const client = buildPblStoreClient(teacherId);
  const plan = await getProjectPlan(client, planId);
  if (!plan) {
    throw new Error("PBL project sync 未找到项目方案");
  }

  await syncPblProjectContentLibraryItem({
    supabase: client.supabase!,
    teacherId,
    plan,
  });
}

async function replayPblGeneratePostprocess(context: BackgroundTaskReplayContext) {
  const teacherId = asString(context.teacherId);
  const planId = asString(context.payload?.planId) || context.taskKey;
  if (!teacherId || !planId) {
    throw new Error("PBL generate postprocess 缺少 teacherId 或 planId");
  }

  const client = buildPblStoreClient(teacherId);
  const plan = await getProjectPlan(client, planId);
  if (!plan) {
    throw new Error("PBL generate postprocess 未找到项目方案");
  }

  const admin = client.supabase!;
  const { data: existingLogs, error } = await admin
    .from("pbl_generation_logs")
    .select("step")
    .eq("teacher_id", teacherId)
    .eq("plan_id", planId)
    .in("step", ["search", "generate", "extract_metadata"]);
  if (error) {
    throw new Error(error.message || "读取 PBL 生成日志失败");
  }

  const existingSteps = new Set(
    (existingLogs ?? []).map((item) => asString(asObject(item).step)),
  );
  const missingLogs: Array<{
    step: "search" | "generate" | "extract_metadata";
    modelUsed: string;
    message: string;
  }> = [];

  if (!existingSteps.has("search")) {
    missingLogs.push({
      step: "search",
      modelUsed: "duckduckgo-html",
      message: `${plan.searchResults.length} sources (replayed)`,
    });
  }
  if (!existingSteps.has("generate")) {
    missingLogs.push({
      step: "generate",
      modelUsed: "pbl_generate_full",
      message: "后台重放补录生成日志",
    });
  }
  if (!existingSteps.has("extract_metadata")) {
    missingLogs.push({
      step: "extract_metadata",
      modelUsed: "pbl_metadata_extract",
      message: plan.title,
    });
  }

  for (const log of missingLogs) {
    await appendGenerationLog(client, {
      planId: plan.id,
      requestId: null,
      step: log.step,
      status: "success",
      modelUsed: log.modelUsed,
      durationMs: 0,
      message: log.message,
    });
  }

  await syncPblProjectContentLibraryItem({
    supabase: admin,
    teacherId,
    plan,
  });
}

async function replayKnowledgeAutoImport(context: BackgroundTaskReplayContext) {
  const teacherId = asString(context.teacherId);
  const documentId = asString(context.payload?.documentId) || context.taskKey;
  if (!teacherId || !documentId) {
    throw new Error("knowledge auto import 缺少 teacherId 或 documentId");
  }

  const admin = createAdminSupabaseClient();
  const document = await getKnowledgeDocument(admin, teacherId, documentId);
  if (!document) {
    throw new Error("知识库文档不存在，无法重放自动拆题");
  }

  const metadata = asObject(document.metadata);
  const questionBank = asObject(metadata.questionBank);
  const questionBankStatus = asString(questionBank.status);
  if (
    TERMINAL_KNOWLEDGE_IMPORT_STATUSES.has(questionBankStatus) &&
    (asNullableString(questionBank.importBatchId) ||
      questionBankStatus === "no_questions")
  ) {
    return;
  }

  await autoImportKnowledgeDocumentToQuestionBank({
    db: admin,
    teacherId,
    documentId: document.id,
    fileName: document.filename || asString(context.payload?.fileName) || "未命名资料",
    fileType: document.fileType,
    fileSize: document.fileSize,
    storagePath: document.storagePath,
    summary: document.summary,
    metadata: document.metadata,
    parsedDocument: null,
    extractedText: "",
    subject: document.subject ?? null,
    unit: document.unit ?? null,
  });
}

async function replayLessonPlanPostprocess(context: BackgroundTaskReplayContext) {
  const teacherId = asString(context.teacherId);
  const conversationId = asString(context.conversationId);
  const assistantMessageId = context.taskKey;
  if (!teacherId || !conversationId || !assistantMessageId) {
    throw new Error("lesson plan postprocess 缺少会话上下文");
  }

  const admin = createAdminSupabaseClient();
  const turn = await loadReplayTurnContext({
    teacherId,
    conversationId,
    assistantMessageId,
  });
  const artifactPayload = extractEmbeddedArtifactPayload(turn.assistantText);
  if (!artifactPayload || artifactPayload.kind !== "lesson-plan") {
    throw new Error("lesson plan replay 缺少可恢复的 artifact payload");
  }

  const visibleText = stripEmbeddedArtifactPayload(turn.assistantText);
  await createAgentLessonPlanContentLibraryItem({
    supabase: admin,
    teacherId,
    conversationId,
    messageId: assistantMessageId,
    teacherRequest: turn.displayUserPrompt,
    markdown: artifactPayload.rawContent,
    sources: extractLessonPlanSources(visibleText),
    warnings: extractLessonPlanWarnings(visibleText),
    qualityAudit: null,
    revisionRounds: 0,
  });

  const replayPayload = asObject(context.payload);
  const toolNames = [
    "generate_lesson_plan_workflow",
    ...(asNumber(replayPayload.sourceCount) > 0 ? ["web_search"] : []),
    ...(asNumber(replayPayload.knowledgeCount) > 0
      ? ["search_teacher_knowledge"]
      : []),
  ];

  await replayAgentMemoryForTurn({
    teacherId,
    conversationId,
    assistantMessageId,
    toolNames,
  });
}

async function replayPblPostprocess(context: BackgroundTaskReplayContext) {
  const teacherId = asString(context.teacherId);
  const conversationId = asString(context.conversationId);
  const assistantMessageId = context.taskKey;
  const planId = asString(context.payload?.projectId);
  if (!teacherId || !conversationId || !assistantMessageId || !planId) {
    throw new Error("PBL postprocess 缺少必要上下文");
  }

  const turn = await loadReplayTurnContext({
    teacherId,
    conversationId,
    assistantMessageId,
  });
  const client = buildPblStoreClient(teacherId);
  const existingPlan = await getProjectPlan(client, planId);
  const plan =
    existingPlan ??
    buildRecoveredPblPlan({
      planId,
      teacherPrompt: turn.displayUserPrompt,
      assistantText: turn.assistantText,
      assistantCreatedAt: turn.assistantCreatedAt,
    });

  await saveProjectPlan(client, plan);
  await syncPblProjectContentLibraryItem({
    supabase: client.supabase!,
    teacherId,
    plan,
  });

  await replayAgentMemoryForTurn({
    teacherId,
    conversationId,
    assistantMessageId,
    assistantText: stripEmbeddedArtifactPayload(
      buildPblArtifactAssistantText(plan, { isContinuation: plan.version > 1 }),
    ),
    toolNames: ["generate_pbl_project"],
  });
}

async function replayConversationExerciseWorksheetPostprocess(
  context: BackgroundTaskReplayContext,
) {
  const teacherId = asString(context.teacherId);
  const conversationId = asString(context.conversationId);
  if (!teacherId || !conversationId) {
    throw new Error("conversation exercise worksheet replay 缺少会话上下文");
  }

  const turn = await loadReplayTurnContext({
    teacherId,
    conversationId,
    assistantMessageId: context.taskKey,
  });
  const artifactPayload = extractEmbeddedArtifactPayload(turn.assistantText);
  const exportToolName =
    artifactPayload?.kind === "exam" ? "export_exam_pdf" : "export_worksheet_pdf";

  await replayAgentMemoryForTurn({
    teacherId,
    conversationId,
    assistantMessageId: context.taskKey,
    toolNames: [exportToolName],
  });
}

async function replayTempPoolWorksheetPostprocess(
  context: BackgroundTaskReplayContext,
) {
  const teacherId = asString(context.teacherId);
  const conversationId = asString(context.conversationId);
  if (!teacherId || !conversationId) {
    throw new Error("temp pool worksheet replay 缺少会话上下文");
  }

  const turn = await loadReplayTurnContext({
    teacherId,
    conversationId,
    assistantMessageId: context.taskKey,
  });
  const artifactPayload = extractEmbeddedArtifactPayload(turn.assistantText);
  const exportToolName =
    artifactPayload?.kind === "exam" ? "export_exam_pdf" : "export_worksheet_pdf";

  await replayAgentMemoryForTurn({
    teacherId,
    conversationId,
    assistantMessageId: context.taskKey,
    toolNames: ["assemble_temp_question_pool_worksheet", exportToolName],
  });
}

async function replayTempPoolMissingNotice(context: BackgroundTaskReplayContext) {
  const teacherId = asString(context.teacherId);
  const conversationId = asString(context.conversationId);
  if (!teacherId || !conversationId) {
    throw new Error("temp pool missing notice replay 缺少会话上下文");
  }

  await replayAgentMemoryForTurn({
    teacherId,
    conversationId,
    assistantMessageId: context.taskKey,
    toolNames: ["assemble_temp_question_pool_worksheet"],
  });
}

async function findAgentGeneratedBatchByMessageId(params: {
  teacherId: string;
  assistantMessageId: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("exercise_import_batches")
    .select("id,metadata,created_at")
    .eq("teacher_id", params.teacherId)
    .eq("source_kind", "agent_generated")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(error.message || "读取 agent_generated 批次失败");
  }

  return (data ?? []).find((row) => {
    const metadata = asObject(row.metadata);
    return asString(metadata.sourceMessageId) === params.assistantMessageId;
  }) ?? null;
}

async function replayExerciseBatchPostprocess(params: {
  context: BackgroundTaskReplayContext;
  toolName: string;
}) {
  const teacherId = asString(params.context.teacherId);
  const conversationId = asString(params.context.conversationId);
  const assistantMessageId = params.context.taskKey;
  const replayPayload = asObject(params.context.payload);
  if (!teacherId || !conversationId || !assistantMessageId) {
    throw new Error("exercise postprocess replay 缺少会话上下文");
  }

  const savedCount = Math.max(0, asNumber(replayPayload.savedCount));
  if (savedCount > 0) {
    const admin = createAdminSupabaseClient();
    const batch = await findAgentGeneratedBatchByMessageId({
      teacherId,
      assistantMessageId,
    });
    if (!batch) {
      throw new Error("未找到与 assistant message 绑定的 agent_generated 批次");
    }

    const { data: exercises, error } = await admin
      .from("exercises")
      .select(
        "id,question_text,correct_answer,solution_steps,exercise_type,difficulty,teacher_prompt",
      )
      .eq("teacher_id", teacherId)
      .eq("import_batch_id", batch.id)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message || "读取题目批次内容失败");
    }

    const normalizedExercises = (exercises ?? []).map((row) => ({
      exerciseId: row.id,
      questionText: row.question_text ?? "",
      correctAnswer: row.correct_answer ?? "",
      solutionSteps: row.solution_steps ?? "",
      type: (row.exercise_type as "MC" | "FR" | "fill_in" | null) ?? "FR",
      difficulty: row.difficulty ?? 2,
      teacherPrompt: row.teacher_prompt ?? null,
      courseLabel: asNullableString(replayPayload.courseName),
      unitLabel: asNullableString(replayPayload.unitLabel),
    }));

    if (normalizedExercises.length === 0) {
      throw new Error("批次存在但未读取到任何已保存题目");
    }

    await classifyAndPersistExerciseTaxonomy({
      supabase: admin,
      teacherId,
      syncContentLibrary: false,
      exercises: normalizedExercises,
    });
    await syncExerciseSemanticIndexRows({
      supabase: admin,
      teacherId,
      exerciseIds: normalizedExercises.map((item) => item.exerciseId),
    });
  }

  await replayAgentMemoryForTurn({
    teacherId,
    conversationId,
    assistantMessageId,
    toolNames: [params.toolName],
  });
}

async function replayContentAssetCleanup(context: BackgroundTaskReplayContext) {
  const teacherId = asString(context.teacherId);
  const assetId = asString(context.payload?.assetId) || asString(context.taskKey);
  if (!teacherId || !assetId) {
    throw new Error("content asset cleanup 缺少 teacherId 或 assetId");
  }

  const admin = createAdminSupabaseClient();
  await runContentAssetCleanupTask({
    client: {
      teacherId,
      supabase: admin,
    },
    assetId,
    storageBucket: asNullableString(context.payload?.storageBucket),
    storagePath: asNullableString(context.payload?.storagePath),
  });
}

async function replayContentLibraryProjectionSync(context: BackgroundTaskReplayContext) {
  const teacherId = asString(context.teacherId);
  if (!teacherId) {
    throw new Error("content library projection sync 缺少 teacherId");
  }

  const itemIds = Array.isArray(context.payload?.itemIds)
    ? context.payload?.itemIds.flatMap((value) => {
        const itemId = asString(value);
        return itemId ? [itemId] : [];
      })
    : asString(context.taskKey)
        .split(",")
        .map((itemId) => itemId.trim())
        .filter(Boolean);

  if (itemIds.length === 0) {
    throw new Error("content library projection sync 缺少 itemIds");
  }

  const admin = createAdminSupabaseClient();
  await runContentLibraryProjectionSyncTask(
    {
      teacherId,
      supabase: admin,
    },
    { itemIds },
  );
}

async function replayContentLibraryOriginCleanup(context: BackgroundTaskReplayContext) {
  const teacherId = asString(context.teacherId);
  if (!teacherId) {
    throw new Error("content library origin cleanup 缺少 teacherId");
  }

  const rawItems = Array.isArray(context.payload?.items) ? context.payload.items : [];
  const items = rawItems.flatMap((value) => {
    const record = asObject(value);
    const itemId = asString(record.itemId);
    const originEntityType = asString(record.originEntityType);
    if (!itemId || !originEntityType) {
      return [];
    }

    return [
      {
        itemId,
        originEntityType: originEntityType as "rubric" | "lesson_plan" | "exercise" | "pbl_project_plan" | "assistant_message" | "content_asset",
        originEntityId: asNullableString(record.originEntityId),
      },
    ];
  });

  if (items.length === 0) {
    throw new Error("content library origin cleanup 缺少 items");
  }

  const admin = createAdminSupabaseClient();
  await runContentLibraryOriginCleanupTask(
    {
      teacherId,
      supabase: admin,
    },
    { items },
  );
}

async function replayDocumentSourceProjectionSync(context: BackgroundTaskReplayContext) {
  const teacherId = asString(context.teacherId);
  const documentId =
    asString(context.payload?.documentId) || asString(context.taskKey).split(":")[0] || "";
  if (!teacherId || !documentId) {
    throw new Error("document source projection sync 缺少 teacherId 或 documentId");
  }

  const admin = createAdminSupabaseClient();
  await runDocumentSourceProjectionSyncTask(
    {
      teacherId,
      supabase: admin,
    },
    { documentId },
  );
}

async function replayContentAssetPdfLibrarySync(context: BackgroundTaskReplayContext) {
  const teacherId = asString(context.teacherId);
  const assetId = asString(context.payload?.assetId) || asString(context.taskKey);
  if (!teacherId || !assetId) {
    throw new Error("content asset pdf library sync 缺少 teacherId 或 assetId");
  }

  const admin = createAdminSupabaseClient();
  await runContentAssetPdfLibrarySyncTask(
    {
      teacherId,
      supabase: admin,
    },
    { assetId },
  );
}

async function replayContentAssetPdfLibraryCleanup(context: BackgroundTaskReplayContext) {
  const teacherId = asString(context.teacherId);
  const assetId = asString(context.payload?.assetId) || asString(context.taskKey);
  if (!teacherId || !assetId) {
    throw new Error("content asset pdf library cleanup 缺少 teacherId 或 assetId");
  }

  const admin = createAdminSupabaseClient();
  await runContentAssetPdfLibraryCleanupTask(
    {
      teacherId,
      supabase: admin,
    },
    {
      assetId,
      contentLibraryItemId: asNullableString(context.payload?.contentLibraryItemId),
    },
  );
}

export const backgroundTaskReplayHandlers = {
  replayPblProjectSync,
  replayPblGeneratePostprocess,
  replayKnowledgeAutoImport,
  replayLessonPlanPostprocess,
  replayPblPostprocess,
  replayConversationExerciseWorksheetPostprocess,
  replayTempPoolWorksheetPostprocess,
  replayTempPoolMissingNotice,
  replayExercisePostprocess: (context: BackgroundTaskReplayContext) =>
    replayExerciseBatchPostprocess({
      context,
      toolName: "generate_ap_exercises_pipeline",
    }),
  replayExerciseSaveFollowupPostprocess: (
    context: BackgroundTaskReplayContext,
  ) =>
    replayExerciseBatchPostprocess({
      context,
      toolName: "save_exercises",
    }),
  replayContentAssetCleanup,
  replayContentLibraryProjectionSync,
  replayContentLibraryOriginCleanup,
  replayDocumentSourceProjectionSync,
  replayContentAssetPdfLibrarySync,
  replayContentAssetPdfLibraryCleanup,
} as const;
