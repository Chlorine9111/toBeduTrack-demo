import { addConversationMessage } from "@/lib/assistant/store";
import {
  embedArtifactPayload,
  normalizeArtifactContentMode,
  normalizeArtifactRole,
  normalizeArtifactVariant,
  resolveArtifactContentMode,
  type EmbeddedArtifactKind,
} from "@/lib/agent/artifact-payload";
import {
  createCustomAgentStreamResponse,
  writeArtifactTextDeltaChunks,
  type AgentStreamLifecycleHooks,
} from "@/lib/agent/chat-stream";
import type { ToolArtifactDelta, ToolArtifactPayload } from "@/lib/agent/tools/tool-result";
import type { ParsedIntent } from "@/lib/chat/intent";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type DirectDocumentToolName =
  | "generate_answer_key"
  | "generate_exit_ticket"
  | "generate_rubric"
  | "generate_worksheet"
  | "generate_lesson_plan_workflow"
  | "generate_ap_exercises_pipeline"
  | "assemble_worksheet"
  | "generate_pbl_project";

type DirectToolDefinition = {
  execute?: (...args: any[]) => any;
};

type CreateDirectDocumentToolResponseParams = {
  supabase: SupabaseClient<Database>;
  teacherId: string;
  conversationId: string;
  startedAt: number;
  toolName: DirectDocumentToolName;
  initialWorkingNote?: {
    title: string;
    markdown: string;
  };
  tool?: DirectToolDefinition;
  input?: Record<string, unknown>;
  prepare?: () => Promise<{
    tool?: DirectToolDefinition;
    input?: Record<string, unknown>;
    beforePersistAssistant?: Promise<void> | (() => Promise<void> | void);
  }>;
  hooks?: AgentStreamLifecycleHooks;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return Boolean(value) && typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === "function";
}

function readArtifactDelta(value: unknown): ToolArtifactDelta | null {
  if (!isRecord(value) || !isRecord(value.artifactDelta)) return null;
  const artifactDelta = value.artifactDelta as Record<string, unknown>;
  if (typeof artifactDelta.kind !== "string" || typeof artifactDelta.delta !== "string") {
    return null;
  }
  return {
    kind: artifactDelta.kind as EmbeddedArtifactKind,
    artifactKey:
      typeof artifactDelta.artifactKey === "string" ? artifactDelta.artifactKey : undefined,
    artifactRole: normalizeArtifactRole(artifactDelta.artifactRole),
    artifactVariant: normalizeArtifactVariant(artifactDelta.artifactVariant),
    contentMode: normalizeArtifactContentMode(artifactDelta.contentMode),
    delta: artifactDelta.delta,
    title: typeof artifactDelta.title === "string" ? artifactDelta.title : undefined,
    summary: typeof artifactDelta.summary === "string" ? artifactDelta.summary : undefined,
    previewText:
      typeof artifactDelta.previewText === "string" ? artifactDelta.previewText : undefined,
  };
}

function readArtifactPayload(value: unknown): ToolArtifactPayload | null {
  if (!isRecord(value) || !isRecord(value.artifact)) return null;
  const artifact = value.artifact as Record<string, unknown>;
  if (
    typeof artifact.kind !== "string" ||
    typeof artifact.title !== "string" ||
    typeof artifact.summary !== "string" ||
    typeof artifact.rawContent !== "string"
  ) {
    return null;
  }
  return {
    kind: artifact.kind as EmbeddedArtifactKind,
    artifactKey: typeof artifact.artifactKey === "string" ? artifact.artifactKey.trim() : undefined,
    artifactRole: normalizeArtifactRole(artifact.artifactRole) ?? "primary",
    artifactVariant: normalizeArtifactVariant(artifact.artifactVariant) ?? "default",
    contentMode:
      normalizeArtifactContentMode(artifact.contentMode) ??
      resolveArtifactContentMode({
        document: artifact.document as ToolArtifactPayload["document"],
        htmlContent: typeof artifact.htmlContent === "string" ? artifact.htmlContent : undefined,
        rawContent: artifact.rawContent,
      }),
    title: artifact.title,
    summary: artifact.summary,
    rawContent: artifact.rawContent,
    document: artifact.document as ToolArtifactPayload["document"],
    htmlContent: typeof artifact.htmlContent === "string" ? artifact.htmlContent : undefined,
    layoutConfig: isRecord(artifact.layoutConfig)
      ? (artifact.layoutConfig as ToolArtifactPayload["layoutConfig"])
      : undefined,
    renderVersion:
      typeof artifact.renderVersion === "number" ? artifact.renderVersion : undefined,
    sourceStage:
      artifact.sourceStage === "streaming" ||
      artifact.sourceStage === "complete" ||
      artifact.sourceStage === "persisted" ||
      artifact.sourceStage === "legacy"
        ? artifact.sourceStage
        : undefined,
    integrityStatus:
      artifact.integrityStatus === "streaming" ||
      artifact.integrityStatus === "complete" ||
      artifact.integrityStatus === "repaired" ||
      artifact.integrityStatus === "invalid"
        ? artifact.integrityStatus
        : undefined,
    metadata: isRecord(artifact.metadata)
      ? (artifact.metadata as ToolArtifactPayload["metadata"])
      : undefined,
    previewText:
      typeof artifact.previewText === "string" ? artifact.previewText : undefined,
  };
}

function normalizeArtifactPayload(
  artifact: ToolArtifactPayload,
  fallbackArtifactKey: string,
): ToolArtifactPayload {
  return {
    ...artifact,
    artifactKey: artifact.artifactKey?.trim() || fallbackArtifactKey,
    artifactRole: artifact.artifactRole ?? "primary",
    artifactVariant: artifact.artifactVariant ?? "default",
    contentMode:
      artifact.contentMode ??
      resolveArtifactContentMode({
        document: artifact.document,
        htmlContent: artifact.htmlContent,
        rawContent: artifact.rawContent,
      }),
  };
}

function readErrorText(value: unknown) {
  if (!isRecord(value)) return "";
  if (typeof value.error === "string" && value.error.trim()) return value.error.trim();
  if (typeof value.reason === "string" && value.reason.trim()) return value.reason.trim();
  if (typeof value.summary === "string" && value.summary.trim() && value.ok === false) {
    return value.summary.trim();
  }
  return "";
}

function readSummaryText(value: unknown) {
  if (!isRecord(value)) return "";
  if (typeof value.summary === "string" && value.summary.trim()) return value.summary.trim();
  if (typeof value.text === "string" && value.text.trim()) return value.text.trim();
  return "";
}

function resolveArtifactKind(toolName: DirectDocumentToolName): EmbeddedArtifactKind {
  switch (toolName) {
    case "generate_answer_key":
    case "generate_exit_ticket":
      return "worksheet";
    case "generate_rubric":
      return "rubric";
    case "generate_lesson_plan_workflow":
      return "lesson-plan";
    case "generate_worksheet":
    case "assemble_worksheet":
      return "worksheet";
    case "generate_pbl_project":
      return "pbl";
    case "generate_ap_exercises_pipeline":
    default:
      return "exercises";
  }
}

function buildLeadText(toolName: DirectDocumentToolName) {
  switch (toolName) {
    case "generate_answer_key":
      return "已开始生成答案与解析，右侧 Canvas 正在打开。";
    case "generate_exit_ticket":
      return "已开始生成 Exit Ticket，右侧 Canvas 正在打开。";
    case "generate_rubric":
      return "已开始生成 Rubric，右侧 Canvas 正在打开。";
    case "generate_lesson_plan_workflow":
      return "已开始生成教案，右侧 Canvas 正在打开。";
    case "generate_worksheet":
      return "已开始生成 Worksheet，右侧 Canvas 正在打开。";
    case "assemble_worksheet":
      return "已开始组卷，右侧 Canvas 正在打开。";
    case "generate_pbl_project":
      return "已开始生成 PBL 项目，右侧 Canvas 正在打开。";
    case "generate_ap_exercises_pipeline":
    default:
      return "已开始生成试题，右侧 Canvas 正在打开。";
  }
}

function buildPlaceholderTitle(toolName: DirectDocumentToolName) {
  switch (toolName) {
    case "generate_answer_key":
      return "Answer Key（生成中）";
    case "generate_exit_ticket":
      return "Exit Ticket（生成中）";
    case "generate_rubric":
      return "Rubric（生成中）";
    case "generate_lesson_plan_workflow":
      return "教案（生成中）";
    case "generate_worksheet":
      return "Worksheet（生成中）";
    case "assemble_worksheet":
      return "Worksheet（组卷中）";
    case "generate_pbl_project":
      return "PBL 项目（生成中）";
    case "generate_ap_exercises_pipeline":
    default:
      return "试题（生成中）";
  }
}

function buildPlaceholderSummary(toolName: DirectDocumentToolName) {
  switch (toolName) {
    case "generate_answer_key":
      return "右侧 Canvas 会随着答案与解析持续补全。";
    case "generate_exit_ticket":
      return "右侧 Canvas 会随着 Exit Ticket 正文持续补全。";
    case "generate_rubric":
      return "右侧 Canvas 会随着 Rubric 正文持续补全。";
    case "generate_lesson_plan_workflow":
      return "右侧 Canvas 会随着教案正文持续补全。";
    case "generate_worksheet":
      return "右侧 Canvas 会随着 Worksheet 正文持续补全。";
    case "assemble_worksheet":
      return "右侧 Canvas 会随着组卷结果持续补全。";
    case "generate_pbl_project":
      return "右侧 Canvas 会随着 PBL 项目正文持续补全。";
    case "generate_ap_exercises_pipeline":
    default:
      return "右侧 Canvas 会随着试题正文持续补全。";
  }
}

async function runBeforePersistAssistant(
  task?: Promise<void> | (() => Promise<void> | void),
) {
  if (!task) return;
  if (typeof task === "function") {
    await task();
    return;
  }
  await task;
}

async function* toAsyncIterable(value: AsyncIterable<unknown> | Promise<unknown>) {
  if (isAsyncIterable(value)) {
    for await (const item of value) {
      yield item;
    }
    return;
  }
  yield await value;
}

export function buildDirectDocumentToolInput(params: {
  toolName: DirectDocumentToolName;
  visiblePrompt: string;
  latestAssistantPrompt?: string;
  parsedIntent: ParsedIntent;
}) {
  const { toolName, visiblePrompt, latestAssistantPrompt, parsedIntent } = params;
  switch (toolName) {
    case "generate_answer_key":
      return {
        teacherRequest: visiblePrompt,
      };
    case "generate_exit_ticket":
      return {
        teacherRequest: visiblePrompt,
        count: parsedIntent.count || undefined,
      };
    case "generate_rubric":
      return {
        teacherRequest: visiblePrompt,
        track: parsedIntent.track,
        previousRubric:
          /修改|调整|简化|精简|按刚才|基于刚才|上一版|刚才那个/i.test(visiblePrompt) &&
          latestAssistantPrompt?.trim()
            ? latestAssistantPrompt
            : undefined,
      };
    case "generate_lesson_plan_workflow":
      return {
        teacherRequest: visiblePrompt,
        durationMinutes: parsedIntent.duration,
        includeWebSearch: parsedIntent.enableWebSearch,
      };
    case "generate_worksheet":
      return {
        teacherRequest: visiblePrompt,
      };
    case "assemble_worksheet":
      return {
        query: visiblePrompt,
        count: parsedIntent.count || undefined,
        type:
          parsedIntent.exerciseType === "MC" || parsedIntent.exerciseType === "FR"
            ? parsedIntent.exerciseType
            : undefined,
        difficulty: parsedIntent.difficulty || undefined,
      };
    case "generate_pbl_project":
      return {
        teacherRequest: visiblePrompt,
      };
    case "generate_ap_exercises_pipeline":
    default:
      return {
        teacherRequest: visiblePrompt,
        count: parsedIntent.count || undefined,
        exerciseType:
          parsedIntent.exerciseType === "MC" || parsedIntent.exerciseType === "FR"
            ? parsedIntent.exerciseType
            : undefined,
      };
  }
}

export function createDirectDocumentToolResponse(
  params: CreateDirectDocumentToolResponseParams,
) {
  return createCustomAgentStreamResponse({
    startedAt: params.startedAt,
    conversationId: params.conversationId,
    runMode: "document_artifact",
    initialWorkingNote: params.initialWorkingNote,
    hooks: params.hooks,
    execute: async (writer) => {
      const toolCallId = `${params.toolName}:${params.conversationId}:${Date.now()}`;
      let latestArtifactPayload: ToolArtifactPayload | null = null;
      let finalAssistantText = "";
      let tool = params.tool;
      let input = params.input;
      let beforePersistAssistantTask:
        | Promise<void>
        | (() => Promise<void> | void)
        | undefined;

      writer.write({
        type: "step-start",
        stepId: `step:${toolCallId}`,
        label: "Step 1",
        at: Date.now(),
      });
      writer.write({
        type: "tool-call",
        toolCallId,
        toolName: params.toolName,
        input: params.input ?? { status: "preparing" },
        at: Date.now(),
      });
      writer.writeArtifactChunk({
        toolCallId,
        artifactKey: toolCallId,
        artifactKind: resolveArtifactKind(params.toolName),
        chunkType: "meta",
        data: {
          title: buildPlaceholderTitle(params.toolName),
          summary: buildPlaceholderSummary(params.toolName),
          previewText: buildLeadText(params.toolName),
          contentMode: "plain-text-fallback",
        },
      });
      writer.writeWorkingNote({
        id: `${toolCallId}:tool`,
        runId: toolCallId,
        section: "tooling",
        status: "running",
        title: buildLeadText(params.toolName).replace("，右侧 Canvas 正在打开。", ""),
        markdown: `已进入 **${params.toolName}** 执行阶段，右侧 Canvas 会先显示预览壳，再逐步接收真实正文。`,
        importance: "high",
      });
      writer.writeTextChunks(buildLeadText(params.toolName));

      if (params.prepare) {
        const prepared = await params.prepare();
        tool = prepared.tool ?? tool;
        input = prepared.input ?? input;
        beforePersistAssistantTask = prepared.beforePersistAssistant;
        writer.writeWorkingNote({
          id: `${toolCallId}:tool`,
          runId: toolCallId,
          section: "planning",
          status: "done",
          title: "已完成工具准备",
          markdown: "输入、资料与上下文已经准备完毕，开始生成正式正文。",
          importance: "normal",
        });
      }

      if (typeof tool?.execute !== "function") {
        throw new Error(`工具 ${params.toolName} 缺少 execute`);
      }

      try {
        for await (const chunk of toAsyncIterable(tool.execute(input ?? {}))) {
          const artifactDelta = readArtifactDelta(chunk);
          if (artifactDelta) {
            writeArtifactTextDeltaChunks({
              writer,
              toolCallId,
              artifactKey: artifactDelta.artifactKey?.trim() || toolCallId,
              artifactRole: artifactDelta.artifactRole,
              artifactVariant: artifactDelta.artifactVariant,
              artifactKind: artifactDelta.kind,
              delta: artifactDelta.delta,
              title: artifactDelta.title,
              summary: artifactDelta.summary,
              previewText: artifactDelta.previewText,
            });
            continue;
          }

          const rawArtifactPayload = readArtifactPayload(chunk);
          if (rawArtifactPayload) {
            const artifactPayload = normalizeArtifactPayload(rawArtifactPayload, toolCallId);
            latestArtifactPayload = artifactPayload;
            const summaryText =
              readSummaryText(chunk) ||
              artifactPayload.previewText ||
              artifactPayload.summary ||
              artifactPayload.title;
            finalAssistantText = summaryText;
            writer.write({
              type: "tool-result",
              toolCallId,
              toolName: params.toolName,
              output: {
                ok: true,
                title: artifactPayload.title,
                summary: artifactPayload.summary,
              },
              at: Date.now(),
            });
            writer.writeArtifactChunk({
              toolCallId,
              artifactKey: artifactPayload.artifactKey,
              artifactRole: artifactPayload.artifactRole,
              artifactVariant: artifactPayload.artifactVariant,
              artifactKind: artifactPayload.kind,
              chunkType: "complete",
              data: {
                title: artifactPayload.title,
                summary: artifactPayload.summary,
                previewText:
                  artifactPayload.previewText ??
                  `${artifactPayload.title} 已生成，正在同步到右侧 Canvas。`,
                rawContent: artifactPayload.rawContent,
                document: artifactPayload.document,
                htmlContent: artifactPayload.htmlContent,
                layoutConfig: artifactPayload.layoutConfig,
                renderVersion: artifactPayload.renderVersion,
                sourceStage: artifactPayload.sourceStage ?? "complete",
                integrityStatus: artifactPayload.integrityStatus,
                metadata: artifactPayload.metadata,
                contentMode: artifactPayload.contentMode,
              },
            });
            writer.writeWorkingNote({
              id: `${toolCallId}:handoff`,
              runId: toolCallId,
              section: "handoff",
              status: "done",
              title: "正文已交给右侧 Canvas",
              markdown: `已生成 **${artifactPayload.title}**，右侧将继续展示正式内容并允许后续编辑。`,
              importance: "high",
            });
            continue;
          }

          const errorText = readErrorText(chunk);
          if (errorText) {
            finalAssistantText = errorText;
            writer.writeWorkingNote({
              id: `${toolCallId}:tool`,
              runId: toolCallId,
              section: "tooling",
              status: "error",
              title: "工具执行失败",
              markdown: errorText,
              importance: "high",
            });
            writer.write({
              type: "tool-error",
              toolCallId,
              toolName: params.toolName,
              message: errorText,
              at: Date.now(),
            });
            continue;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "工具执行失败";
        finalAssistantText = message;
        writer.write({
          type: "tool-error",
          toolCallId,
          toolName: params.toolName,
          message,
          at: Date.now(),
        });
      }

      writer.write({
        type: "step-finish",
        stepId: `step:${toolCallId}`,
        label: "Step 1",
        at: Date.now(),
        finishReason: latestArtifactPayload || finalAssistantText ? "completed" : "error",
      });

      const persistedAssistantText = latestArtifactPayload
        ? embedArtifactPayload(
            finalAssistantText || latestArtifactPayload.summary || latestArtifactPayload.title,
            {
              kind: latestArtifactPayload.kind,
              artifactKey: latestArtifactPayload.artifactKey,
              artifactRole: latestArtifactPayload.artifactRole,
              artifactVariant: latestArtifactPayload.artifactVariant,
              contentMode: latestArtifactPayload.contentMode,
              title: latestArtifactPayload.title,
              summary: latestArtifactPayload.summary,
              rawContent: latestArtifactPayload.rawContent,
              document: latestArtifactPayload.document,
              htmlContent: latestArtifactPayload.htmlContent,
              layoutConfig: latestArtifactPayload.layoutConfig,
              renderVersion: latestArtifactPayload.renderVersion,
              sourceStage: "persisted",
              integrityStatus: latestArtifactPayload.integrityStatus,
              metadata: latestArtifactPayload.metadata,
            },
          )
        : finalAssistantText || `${buildPlaceholderTitle(params.toolName)} 失败`;

      await runBeforePersistAssistant(beforePersistAssistantTask);
      const persistedAssistantMessage = await addConversationMessage(params.supabase, {
        teacherId: params.teacherId,
        conversationId: params.conversationId,
        role: "assistant",
        content: persistedAssistantText,
      });

      const persistedArtifactKey = latestArtifactPayload?.artifactKey?.trim();
      if (persistedArtifactKey) {
        writer.writeArtifactPersisted({
          artifactKey: persistedArtifactKey,
          artifactRole: latestArtifactPayload?.artifactRole,
          artifactVariant: latestArtifactPayload?.artifactVariant,
          assistantMessageId: persistedAssistantMessage.id,
          conversationId: params.conversationId,
        });
      } else if (finalAssistantText) {
        writer.writeTextChunks(`\n\n${finalAssistantText}`);
      }

      return {
        totalMs: Math.max(0, Date.now() - params.startedAt),
        finishReason: latestArtifactPayload || finalAssistantText ? "stop" : "error",
      };
    },
  });
}
