import { addConversationMessage } from "@/lib/assistant/store";
import {
  buildAgentConversationContext,
  type AgentMemoryPreview,
} from "@/lib/agent/context-memory";
import { embedArtifactPayload } from "@/lib/agent/artifact-payload";
import { buildArtifactRenderSnapshot } from "@/lib/agent/artifact-render-snapshot";
import {
  createCustomAgentStreamResponse,
  writeArtifactTextDeltaChunks,
  type AgentStreamLifecycleHooks,
} from "@/lib/agent/chat-stream";
import {
  buildTaskContextTeacherPrompt,
  trimText,
  type UploadedMaterial,
  type StoredConversationMessage,
} from "@/lib/agent/chat-shared";
import { buildTaskAwareMaterialContext } from "@/lib/agent/material-context";
import { enqueueAgentMemoryFormation } from "@/lib/agent/memory-jobs";
import type { AgentTaskContext } from "@/lib/agent/task-context";
import { streamGatewayTextToCompletion } from "@/lib/ai/gateway";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";

type ConversationStoreClient = Parameters<typeof addConversationMessage>[0];

type ConversationRecord = {
  id: string;
  title: string | null;
};

type WorksheetDocumentParams = {
  supabase: ConversationStoreClient;
  teacherId: string;
  conversation: ConversationRecord;
  previousMessages: StoredConversationMessage[];
  isFirstTurn: boolean;
  displayUserPrompt: string;
  latestUserPrompt: string;
  uploadedMaterials: UploadedMaterial[];
  uploadedMaterialSummary: string;
  profileKey: string;
  memoryPreview?: AgentMemoryPreview;
  taskContext?: AgentTaskContext | null;
  streamHooks?: AgentStreamLifecycleHooks;
};

function cleanText(value: string | null | undefined) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function extractWorksheetTitle(markdown: string, fallbackPrompt: string) {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1];
  const normalized = cleanText(heading);
  if (normalized) return normalized;
  const promptPreview = cleanText(fallbackPrompt).slice(0, 48);
  return promptPreview ? `${promptPreview} Worksheet` : "课堂 Worksheet";
}

function summarizeWorksheetMarkdown(markdown: string, fallbackTitle: string) {
  const stripped = cleanText(
    markdown
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/^#\s+.+$/gm, " ")
      .replace(/[*#>`-]/g, " "),
  );
  if (!stripped) {
    return `已生成「${fallbackTitle}」的课堂 worksheet。`;
  }
  return stripped.length > 160 ? `${stripped.slice(0, 160)}...` : stripped;
}

export function inferWorksheetDocumentMode(prompt: string) {
  if (/(guided\s*notes?|导学单|填空讲义|引导笔记)/i.test(prompt)) {
    return "guided_notes";
  }
  if (/(活动单|课堂活动|task\s*sheet|activity\s*sheet)/i.test(prompt)) {
    return "activity_sheet";
  }
  if (/(阅读单|reading\s*sheet|close\s*reading)/i.test(prompt)) {
    return "reading_sheet";
  }
  if (/(词汇单|vocabulary|glossary)/i.test(prompt)) {
    return "vocabulary_sheet";
  }
  if (/(study\s*guide|复习提纲|知识框架|summary\s*sheet)/i.test(prompt)) {
    return "study_guide";
  }
  return "student_handout";
}

export const WORKSHEET_TYPE_STRUCTURE_HINTS: Record<string, string> = {
  guided_notes:
    "Guided notes 典型结构：预填的概念框架 + 留白区（让学生补全关键词、公式或图示）+ 边栏提示 + 课尾 quick check。" +
    "要点：保留知识骨架但留足填写空间，让学生跟着课堂节奏完成笔记。",
  activity_sheet:
    "活动单典型结构：活动目标 + 材料/工具清单 + 分步操作指引 + 数据记录区/观察记录表 + 讨论反思区。" +
    "要点：指令要具体到学生能独立或小组执行，每步有明确的可交付物。",
  reading_sheet:
    "阅读单典型结构：阅读文段/来源说明 + 词汇辅助 + 理解检测题 + 分析/讨论提示。" +
    "要点：先呈现文本再提问，问题从理解层递进到分析层；如有原文段落应直接嵌入。",
  vocabulary_sheet:
    "词汇单典型结构：词汇列表（含词性/发音） + 定义/释义 + 例句或语境 + 配对/填空练习。" +
    "要点：每个词条信息完整，练习侧重语境运用而非单纯记忆。",
  study_guide:
    "复习单典型结构：核心概念/术语汇总 + 要点回顾框架 + 自测问题 + 易错点提醒。" +
    "要点：帮学生梳理已学内容全貌，适合考前复习或单元总结。",
  student_handout:
    "课堂讲义典型结构：主题概述 + 核心内容分区（按知识点/话题分节）+ 示例/图表 + 笔记空间 + 可选的 quick check。" +
    "要点：作为课堂伴随材料，平衡信息密度与可读性，适合打印后学生直接使用。",
};

function normalizeWorksheetMarkdown(rawText: string, fallbackPrompt: string) {
  const strippedFences = rawText
    .replace(/^```markdown\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!strippedFences) return "";

  if (/^#\s+/m.test(strippedFences)) {
    return strippedFences;
  }

  const fallbackTitle = extractWorksheetTitle(strippedFences, fallbackPrompt);
  return `# ${fallbackTitle}\n\n${strippedFences}`;
}

function buildWorksheetTeacherRequest(params: {
  displayUserPrompt: string;
  latestUserPrompt: string;
  taskContext?: AgentTaskContext | null;
  uploadedMaterialSummary: string;
}) {
  const rawPrompt = params.displayUserPrompt || params.latestUserPrompt;
  const basePrompt =
    buildTaskContextTeacherPrompt({
      rawPrompt,
      taskContext: params.taskContext,
      includeFields: ["curriculum", "topic", "duration", "scope"],
    }) || rawPrompt;

  return [
    basePrompt,
    params.uploadedMaterialSummary
      ? `已附材料摘要：${trimText(params.uploadedMaterialSummary, 800)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function buildWorksheetDocumentSystemPrompt(mode: string) {
  const structureHint = WORKSHEET_TYPE_STRUCTURE_HINTS[mode] ?? WORKSHEET_TYPE_STRUCTURE_HINTS.student_handout;
  return [
    "你是教师的课堂 worksheet 设计助手。",
    "worksheet 指学生在课堂中直接使用的学习单、讲义、guided notes、活动单、阅读单或复习单，不默认等于题卷。",
    "",
    "设计原则（按重要性排序）：",
    "1. 形态适配：先判断最适合学生使用的材料形态，不同类型的 worksheet 结构应该不同。",
    "2. 学科适配：结构应匹配学科特点——理科侧重公式推导与数据记录，文科侧重文本分析与论证，语言类侧重语境与运用。",
    "3. 可用性：学生拿到就能用，指令清晰、布局可打印、留有书写空间。",
    "4. 认知递进：内容编排应从低阶认知（识记、理解）自然过渡到高阶认知（应用、分析），而非机械罗列。",
    "5. 克制出题：如果老师没有明确要求题量/题型，不要把正文写成整套题；可包含 1-3 个 quick check，但不应退化成刷题卷。",
    "",
    `当前判断的 worksheet 类型为「${mode}」，参考结构：`,
    structureHint,
    "以上仅为参考，应根据学科内容和教师需求灵活调整节数、顺序和各部分比重，不要生搬硬套。",
    "",
    "长度控制：",
    "- 质量优先于数量，但不要人为缩短内容",
    "- 每个 section 按需展开，确保完整覆盖知识点",
    "- 必须输出完整文档，不要在中间截断",
    "",
    "格式要求：",
    "- 输出可直接渲染的 Markdown，第一行必须是一级标题。",
    "- 语气面向学生，内容清晰易读。",
    "- 不要解释设计思路，不要输出代码块围栏。",
    "- 如果给了上传材料，优先复用材料中的概念、结构和术语，不要虚构来源。",
  ].join("\n");
}

function buildWorksheetDocumentAssistantText(params: {
  title: string;
  summary: string;
  mode: string;
}) {
  const modeLabel =
    params.mode === "guided_notes"
      ? "guided notes"
      : params.mode === "activity_sheet"
        ? "课堂活动单"
        : params.mode === "reading_sheet"
          ? "阅读单"
          : params.mode === "vocabulary_sheet"
            ? "词汇单"
            : params.mode === "study_guide"
              ? "复习单"
              : "课堂讲义";

  return [
    "## 已生成一份课堂 Worksheet",
    "",
    `- 标题：${params.title}`,
    `- 形态：${modeLabel}`,
    "- 生成方式：文档型 worksheet（未走题库组卷）",
    "",
    `### 摘要\n${params.summary}`,
    "",
    "如需下一步，我可以继续把它改成更像 guided notes、活动单，或者补一小段课堂练习。",
  ].join("\n");
}

export async function handleWorksheetDocumentRequest(
  params: WorksheetDocumentParams,
) {
  const startedAt = Date.now();
  const teacherRequest = buildWorksheetTeacherRequest({
    displayUserPrompt: params.displayUserPrompt,
    latestUserPrompt: params.latestUserPrompt,
    taskContext: params.taskContext,
    uploadedMaterialSummary: params.uploadedMaterialSummary,
  });

  return createCustomAgentStreamResponse({
    startedAt,
    conversationId: params.conversation.id,
    memoryPreview: params.memoryPreview,
    hooks: params.streamHooks,
    execute: async (writer) => {
      const toolCallId = `worksheet-document:${params.conversation.id}:${Date.now()}`;
      const worksheetMode = inferWorksheetDocumentMode(teacherRequest);
      const materialContext = buildTaskAwareMaterialContext({
        materials: params.uploadedMaterials,
        taskKind: "general",
        query: teacherRequest,
        maxLength: 4_000,
      });
      const prompt = [
        `教师请求：\n${teacherRequest}`,
        materialContext ? `\n${materialContext}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      writer.write({
        type: "tool-call",
        toolCallId,
        toolName: "generate_document_worksheet",
        input: {
          mode: worksheetMode,
          hasUploadedMaterials: params.uploadedMaterials.length > 0,
          uploadedMaterialCount: params.uploadedMaterials.length,
        },
        at: Date.now(),
      });
      writer.writeArtifactChunk({
        toolCallId,
        artifactKind: "worksheet",
        chunkType: "meta",
        data: {
          title: "Worksheet（生成中）",
          summary: "右侧 Canvas 会先显示课堂 worksheet 草稿，再持续补全文档内容。",
          previewText: "正在生成学生课堂 worksheet...",
        },
      });
      writer.writePhase({
        phase: "worksheet_planning",
        label: "判断 worksheet 形态",
        status: "running",
        detail: "正在判断这次更适合课堂讲义、guided notes 还是活动单。",
        at: Date.now(),
      });
      writer.writePhase({
        phase: "worksheet_planning",
        label: "判断 worksheet 形态",
        status: "done",
        detail: `已切到文档型 worksheet，模式为 ${worksheetMode}。`,
        at: Date.now(),
      });
      writer.writePhase({
        phase: "worksheet_writing",
        label: "生成课堂 worksheet",
        status: "running",
        detail: "正在按学生课堂材料的形态生成正文。",
        at: Date.now(),
      });

      let streamedMarkdown = "";
      const completion = await streamGatewayTextToCompletion({
        model: getResolvedLanguageModelForTask("assistant_lesson_plan"),
        system: buildWorksheetDocumentSystemPrompt(worksheetMode),
        prompt,
        maxOutputTokens: 16000,
        temperature: 0.5,
        timeout: 30_000,
        onTextDelta: async (delta) => {
          if (!delta) return;
          streamedMarkdown += delta;
          writeArtifactTextDeltaChunks({
            writer,
            toolCallId,
            artifactKind: "worksheet",
            delta,
            title: "Worksheet（生成中）",
            summary: "正在流式生成课堂 worksheet 正文。",
            previewText: "正在生成学生课堂 worksheet...",
          });
        },
      });

      const normalizedMarkdown = normalizeWorksheetMarkdown(
        completion.text || streamedMarkdown,
        teacherRequest,
      );
      if (!normalizedMarkdown) {
        throw new Error("未生成可用的 worksheet 正文");
      }

      const title = extractWorksheetTitle(normalizedMarkdown, teacherRequest);
      const summary = summarizeWorksheetMarkdown(normalizedMarkdown, title);
      const artifactSnapshot = buildArtifactRenderSnapshot({
        kind: "worksheet",
        title,
        summary,
        rawContent: normalizedMarkdown,
        sourceStage: "complete",
        allowLegacyFallback: true,
      });

      if (artifactSnapshot.integrityStatus === "invalid") {
        writer.write({
          type: "tool-error",
          toolCallId,
          toolName: "generate_document_worksheet",
          message: "Worksheet 正文未完整生成，本次只保留临时预览，请重试。",
          at: Date.now(),
        });
        writer.writePhase({
          phase: "worksheet_writing",
          label: "生成课堂 worksheet",
          status: "error",
          detail: "AI 返回了未完整闭合的正文，本次不会写入正式 Canvas 文档。",
          at: Date.now(),
        });
        return {
          totalMs: Math.max(0, Date.now() - startedAt),
          finishReason: "error" as const,
        };
      }

      writer.write({
        type: "tool-result",
        toolCallId,
        toolName: "generate_document_worksheet",
        output: {
          title,
          mode: worksheetMode,
          sourceMode: "document_handout",
          hasStructuredDocument: Boolean(artifactSnapshot.document),
        },
        at: Date.now(),
      });
      writer.writePhase({
        phase: "worksheet_writing",
        label: "生成课堂 worksheet",
        status: "done",
        detail: "课堂 worksheet 已完成，并同步到右侧 Canvas。",
        at: Date.now(),
      });
      writer.writeArtifactChunk({
        toolCallId,
        artifactKind: "worksheet",
        chunkType: "complete",
        data: {
          title: artifactSnapshot.title,
          summary: artifactSnapshot.summary,
          previewText: "课堂 worksheet 已完成，正在写入当前会话。",
          rawContent: artifactSnapshot.rawContent,
          document: artifactSnapshot.document,
          htmlContent: artifactSnapshot.htmlContent,
          layoutConfig: artifactSnapshot.layoutConfig,
          renderVersion: artifactSnapshot.renderVersion,
          sourceStage: artifactSnapshot.sourceStage,
          integrityStatus: artifactSnapshot.integrityStatus,
        },
      });

      const assistantText = buildWorksheetDocumentAssistantText({
        title,
        summary,
        mode: worksheetMode,
      });
      const assistantArtifactText = embedArtifactPayload(assistantText, {
        kind: "worksheet",
        title: artifactSnapshot.title,
        summary: artifactSnapshot.summary,
        rawContent: artifactSnapshot.rawContent,
        document: artifactSnapshot.document,
        htmlContent: artifactSnapshot.htmlContent,
        layoutConfig: artifactSnapshot.layoutConfig,
        renderVersion: artifactSnapshot.renderVersion,
        sourceStage: "persisted",
        integrityStatus: artifactSnapshot.integrityStatus,
      });
      const assistantMessage = await addConversationMessage(params.supabase, {
        teacherId: params.teacherId,
        conversationId: params.conversation.id,
        role: "assistant",
        content: assistantArtifactText,
      });
      const nextConversationContext = buildAgentConversationContext([
        ...params.previousMessages,
        { role: "user", content: params.displayUserPrompt },
        { role: "assistant", content: assistantArtifactText },
      ]);
      await enqueueAgentMemoryFormation({
        teacherId: params.teacherId,
        profileKey: params.profileKey,
        conversationId: params.conversation.id,
        conversationTitle: params.conversation.title,
        assistantMessageId: assistantMessage.id,
        displayUserPrompt: params.displayUserPrompt,
        assistantText: assistantArtifactText,
        toolNames: ["generate_document_worksheet"],
        nextConversationContext,
        isFirstTurn: params.isFirstTurn,
      });

      writer.writeTextChunks(assistantArtifactText);
      return {
        totalMs: Math.max(0, Date.now() - startedAt),
        finishReason: "stop" as const,
      };
    },
  });
}
