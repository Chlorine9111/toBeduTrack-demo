// 轻量记忆服务：用 Supermemory 替代本地 7 桶 + pgvector + LLM 逐轮提取
// 3 种文档类型：profile / session_summary / knowledge
// 每会话 1 次 LLM 提取 + 2 次 Supermemory API，替代每轮 LLM + 向量化

import { generateStructuredObjectWithGateway } from "@/lib/ai/gateway";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import {
  createMemory,
  isSupermemoryEnabled,
  searchMemories,
  updateMemory,
} from "@/lib/memory/supermemory-client";
import type { MemoryContext, MemorySearchResult, SessionSummaryExtraction } from "@/lib/memory/types";
import { z } from "zod";

// ===== 对话开始时：拉取相关记忆 =====

export async function fetchMemoryContext(params: {
  teacherId: string;
  query: string;
}): Promise<MemoryContext> {
  if (!isSupermemoryEnabled()) {
    return { profile: null, recentSessions: [], knowledge: [] };
  }

  try {
    const results = await searchMemories({
      teacherId: params.teacherId,
      query: params.query,
      limit: 8,
      threshold: 0.4,
    });

    const profile = results.find((r) => r.metadata.type === "profile");
    const sessions = results
      .filter((r) => r.metadata.type === "session_summary")
      .slice(0, 3);
    const knowledge = results
      .filter((r) => r.metadata.type === "knowledge")
      .slice(0, 4);

    return {
      profile: profile?.content ?? null,
      recentSessions: sessions.map((s) => s.content),
      knowledge: knowledge.map((k) => k.content),
    };
  } catch (error) {
    console.warn("Supermemory 记忆检索失败，继续无记忆模式", error);
    return { profile: null, recentSessions: [], knowledge: [] };
  }
}

// ===== 将记忆上下文格式化为 prompt fragment =====

export function formatMemoryPrompt(context: MemoryContext): string {
  const sections: string[] = [];

  if (context.profile) {
    sections.push(`[教师档案]\n${context.profile}`);
  }

  if (context.recentSessions.length > 0) {
    sections.push(
      `[近期会话]\n${context.recentSessions.map((s) => `- ${s}`).join("\n")}`,
    );
  }

  if (context.knowledge.length > 0) {
    sections.push(
      `[相关知识]\n${context.knowledge.map((k) => `- ${k}`).join("\n")}`,
    );
  }

  return sections.length > 0 ? sections.join("\n\n") : "";
}

// ===== 会话结束时：提取摘要并保存 =====

const sessionSummarySchema = z.object({
  summary: z.string().min(1).max(500),
  pendingTasks: z.array(z.string().min(1).max(200)).max(5).default([]),
  profileUpdate: z
    .object({
      subjects: z.array(z.string().max(60)).max(6),
      style: z.string().max(120),
    })
    .nullable()
    .default(null),
});

export async function extractSessionSummary(
  messages: Array<{ role: string; content: string }>,
): Promise<SessionSummaryExtraction> {
  const transcript = messages
    .slice(-12)
    .map((m) => `[${m.role}] ${m.content.slice(0, 400)}`)
    .join("\n");

  const model = getResolvedLanguageModelForTask("question_taxonomy");

  const { object } = await generateStructuredObjectWithGateway({
    capability: "structured",
    model,
    schema: sessionSummarySchema,
    systemPrompt: [
      "你是会话摘要提取器。根据对话记录输出：",
      "1. summary：一段简洁的会话摘要（包含做了什么、讨论了什么、关键决策）",
      "2. pendingTasks：未完成的待办事项（仅限明确提到但未完成的任务）",
      "3. profileUpdate：如果对话中首次透露了教师的学科或风格偏好，输出更新；否则 null",
      "输出 JSON，不解释。",
    ].join("\n"),
    userPrompt: transcript,
    maxTokens: 600,
    temperature: 0,
  });

  return {
    text: object.summary,
    pendingTasks: object.pendingTasks,
    profileUpdate: object.profileUpdate,
  };
}

export async function saveSessionMemory(params: {
  teacherId: string;
  conversationId: string;
  messages: Array<{ role: string; content: string }>;
}): Promise<void> {
  if (!isSupermemoryEnabled()) return;
  if (params.messages.length < 2) return;

  try {
    const extraction = await extractSessionSummary(params.messages);

    // 存 session_summary
    await createMemory({
      teacherId: params.teacherId,
      content: extraction.text,
      type: "session_summary",
      metadata: {
        conversationId: params.conversationId,
        pendingTasks: extraction.pendingTasks,
        date: new Date().toISOString(),
      },
      isStatic: false,
    });

    // 如果有 profile 更新，查找并更新或创建
    if (extraction.profileUpdate) {
      await upsertTeacherProfile(params.teacherId, extraction.profileUpdate);
    }
  } catch (error) {
    console.warn("保存会话记忆失败", error);
  }
}

// ===== Profile 管理 =====

async function upsertTeacherProfile(
  teacherId: string,
  update: { subjects: string[]; style: string },
): Promise<void> {
  const content = [
    update.subjects.length > 0 ? `教授课程：${update.subjects.join("、")}` : "",
    update.style ? `回答风格偏好：${update.style}` : "",
  ]
    .filter(Boolean)
    .join("。");

  if (!content) return;

  // 搜索已有 profile
  const existing = await searchMemories({
    teacherId,
    query: "teacher profile subjects style",
    type: "profile",
    limit: 1,
    threshold: 0.3,
  });

  if (existing.length > 0) {
    await updateMemory({
      memoryId: existing[0].id,
      teacherId,
      content,
      metadata: { type: "profile" },
    });
  } else {
    await createMemory({
      teacherId,
      content,
      type: "profile",
      isStatic: true,
    });
  }
}

// ===== 知识文档存储（复用已有能力）=====

export async function saveKnowledgeMemory(params: {
  teacherId: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  if (!isSupermemoryEnabled()) return null;

  return createMemory({
    teacherId: params.teacherId,
    content: params.content,
    type: "knowledge",
    metadata: params.metadata,
    isStatic: true,
  });
}
