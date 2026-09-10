import { z } from "zod";
import type { AgentTaskKind } from "@/lib/agent/task-state";
import { buildContextRetrievalQuery, detectContextContinuation, detectContextReset } from "@/lib/context-engineering/core";

export const agentTaskContextSchema = z.object({
  kind: z.enum([
    "lesson_plan",
    "exercise",
    "rubric",
    "pbl",
    "research",
    "summary",
    "organize",
    "general",
  ]),
  action: z.string().trim().min(1).max(80),
  mode: z.enum(["fresh", "continuation", "reset"]),
  normalizedRequest: z.string().trim().min(1).max(2000),
  retrievalQuery: z.string().trim().min(1).max(600),
  sourcePriority: z.array(z.string().trim().min(1).max(80)).max(8),
  curriculum: z.string().trim().max(160).optional().default(""),
  topic: z.string().trim().max(160).optional().default(""),
  scope: z.string().trim().max(120).optional().default(""),
  count: z.string().trim().max(40).optional().default(""),
  duration: z.string().trim().max(40).optional().default(""),
  attachmentsSummary: z.string().trim().max(240).optional().default(""),
  attachmentMode: z
    .enum(["none", "material_reference", "scan_pool", "scan_pool_worksheet"])
    .optional()
    .default("none"),
  attachmentSessionId: z.string().uuid().optional(),
  attachmentUploadIds: z.array(z.string().uuid()).max(20).optional().default([]),
  poolQuestionCount: z.number().int().min(0).max(500).optional(),
  savePreference: z
    .enum(["default", "temp_only", "save_after_confirm"])
    .optional()
    .default("default"),
});

export type AgentTaskContext = z.infer<typeof agentTaskContextSchema>;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toPositiveIntString(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return String(Math.floor(parsed));
}

function toDurationString(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 15 || parsed > 180) return "";
  return String(Math.floor(parsed));
}

export function mapTaskActionToKind(action: string): AgentTaskKind {
  if (action === "lesson_plan" || action === "scan_lesson") return "lesson_plan";
  if (
    action === "generate_exercises" ||
    action === "save_exercises" ||
    action === "create_worksheet" ||
    action === "scan_variant" ||
    action === "retrieve_question_bank"
  ) {
    return "exercise";
  }
  if (action === "generate_rubric") return "rubric";
  if (action === "generate_pbl") return "pbl";
  if (action === "organize_content") return "organize";
  if (action === "research") return "research";
  if (action === "general_summary" || action === "scan_summary") return "summary";
  return "general";
}

function buildNormalizedRequestLines(params: {
  originalMessage: string;
  actionLabel: string;
  kind: AgentTaskKind;
  curriculum?: string;
  topic?: string;
  scope?: string;
  count?: string;
  duration?: string;
  attachmentsSummary?: string;
}) {
  const lines = [
    `任务类型：${
      params.kind === "lesson_plan"
        ? "教案"
        : params.kind === "exercise"
          ? "习题"
          : params.kind === "rubric"
            ? "Rubric"
            : params.kind === "pbl"
              ? "PBL 项目"
              : params.kind === "research"
                ? "检索研究"
                : params.kind === "summary"
                  ? "摘要整理"
                  : params.kind === "organize"
                      ? "内容库整理"
                      : "通用对话"
    }`,
    `任务目标：${params.actionLabel}`,
    params.curriculum ? `课程/单元：${params.curriculum}` : "",
    params.topic ? `主题：${params.topic}` : "",
    params.scope ? `处理范围：${params.scope}` : "",
    params.count ? `数量：${params.count}` : "",
    params.duration ? `时长：${params.duration} 分钟` : "",
    params.attachmentsSummary ? `附件：${params.attachmentsSummary}` : "",
    `教师原话：${normalizeWhitespace(params.originalMessage)}`,
  ].filter(Boolean);

  return lines.join("；");
}

export function buildAgentTaskContext(params: {
  message: string;
  action: string;
  actionLabel: string;
  curriculum?: string;
  topic?: string;
  scope?: string;
  count?: string;
  duration?: string;
  attachmentsSummary?: string;
  attachmentMode?: AgentTaskContext["attachmentMode"];
  attachmentSessionId?: string;
  attachmentUploadIds?: string[];
  poolQuestionCount?: number;
  savePreference?: AgentTaskContext["savePreference"];
  conversationContext: string[];
}) {
  const originalMessage = normalizeWhitespace(params.message);
  const kind = mapTaskActionToKind(params.action);
  const resetMode = detectContextReset(originalMessage);
  const continuationMode = !resetMode && detectContextContinuation(originalMessage);
  const mode: AgentTaskContext["mode"] = resetMode
    ? "reset"
    : continuationMode
      ? "continuation"
      : "fresh";
  const sourcePriority = [
    "当前教师输入",
    params.attachmentsSummary ? "当前上传材料" : "",
    kind === "lesson_plan" || kind === "exercise" || kind === "rubric" || kind === "pbl"
      ? "教师知识库与长期记忆"
      : "",
    kind === "research" ? "联网结果" : "",
    mode === "reset" ? "" : "最近对话上下文",
  ].filter(Boolean);
  const normalizedRequest = buildNormalizedRequestLines({
    originalMessage,
    actionLabel: params.actionLabel,
    kind,
    curriculum: normalizeWhitespace(params.curriculum ?? ""),
    topic: normalizeWhitespace(params.topic ?? ""),
    scope: normalizeWhitespace(params.scope ?? ""),
    count: toPositiveIntString(params.count ?? ""),
    duration: toDurationString(params.duration ?? ""),
    attachmentsSummary: normalizeWhitespace(params.attachmentsSummary ?? ""),
  });
  const retrievalHints =
    mode === "continuation"
      ? [
          params.curriculum ?? "",
          params.topic ?? "",
          params.scope ?? "",
          ...params.conversationContext,
        ]
      : [params.curriculum ?? "", params.topic ?? "", params.scope ?? ""];
  const retrievalQuery = buildContextRetrievalQuery({
    query: normalizedRequest,
    hints: retrievalHints,
    maxLength: 360,
    carryover: mode === "continuation",
  });

  return agentTaskContextSchema.parse({
    kind,
    action: params.action,
    mode,
    normalizedRequest,
    retrievalQuery,
    sourcePriority,
    curriculum: normalizeWhitespace(params.curriculum ?? ""),
    topic: normalizeWhitespace(params.topic ?? ""),
    scope: normalizeWhitespace(params.scope ?? ""),
    count: toPositiveIntString(params.count ?? ""),
    duration: toDurationString(params.duration ?? ""),
    attachmentsSummary: normalizeWhitespace(params.attachmentsSummary ?? ""),
    attachmentMode: params.attachmentMode ?? "none",
    attachmentSessionId: params.attachmentSessionId,
    attachmentUploadIds: Array.from(
      new Set((params.attachmentUploadIds ?? []).map((item) => normalizeWhitespace(item)).filter(Boolean)),
    ).slice(0, 20),
    poolQuestionCount:
      typeof params.poolQuestionCount === "number" && Number.isFinite(params.poolQuestionCount)
        ? Math.max(0, Math.min(500, Math.floor(params.poolQuestionCount)))
        : undefined,
    savePreference: params.savePreference ?? "default",
  });
}
