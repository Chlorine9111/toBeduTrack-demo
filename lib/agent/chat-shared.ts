import { z } from "zod";
import { agentTaskContextSchema, type AgentTaskContext } from "@/lib/agent/task-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import type { AgentConversationContext } from "@/lib/agent/conversation-context";
import { selectConversationMessages } from "@/lib/context-engineering/core";
import { runScanPipeline } from "@/lib/pdf-scan/pipeline";
import { isSupportedDocument, parseDocument } from "@/lib/wechat/document-parser";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(12_000),
});

const requestSchema = z
  .object({
    message: z.string().trim().min(1).max(20_000).optional(),
    displayMessage: z.string().trim().min(1).max(12_000).optional(),
    conversationId: z.string().uuid().optional(),
    contentAssetIds: z.array(z.string().uuid()).max(8).optional().default([]),
    taskContext: agentTaskContextSchema.optional(),
    messages: z.array(messageSchema).min(1).max(40).optional(),
  })
  .refine((value) => Boolean(value.message?.trim() || value.messages?.length), {
    message: "缺少消息内容",
    path: ["message"],
  });

export const LESSON_PLAN_KEYWORD_PATTERN =
  /(教案|备课|教学设计|教学计划|lesson\s*plan|mini\s*lesson|micro\s*lesson|课堂流程|课时安排|教学目标|微课)/i;
export const LESSON_PLAN_REFINE_PATTERN = /(微调|调整|改为|改成|优化|润色|保持总时长|上一版|上一份)/i;
export const RUBRIC_REFINE_PATTERN =
  /(上一版\s*rubric|上一份\s*rubric|上一版评分|上一份评分|上一版量规|上一份量规|严格改成|改成\s*\d+\s*个维度|改为\s*\d+\s*个维度|新增.*维度|删掉.*维度|调整.*维度|优化.*rubric|润色.*rubric|修改.*rubric)/i;

export type UploadedMaterialImage = {
  data: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  pageNumber: number;
};

export type UploadedMaterial = {
  fileName: string;
  fileType: string;
  textContent: string;
  images?: UploadedMaterialImage[];
};

export type UploadedMaterialExtractionOptions = {
  pdfImagePageLimit?: number;
};

export type { AgentTaskContext };

export type AgentChatBody = z.infer<typeof requestSchema>;

export type StoredConversationMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: string;
  sources?: unknown;
};

export function trimText(text: string, maxLength = 100_000) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

export function stripPreflightClarificationBlock(message: string) {
  const normalized = message.replace(/\r/g, "").trim();
  if (!normalized) return "";

  const markerPattern = /\n(?:【前置补充说明】|\[Clarified Requirements\])/;
  const markerMatch = normalized.match(markerPattern);
  if (!markerMatch || markerMatch.index === undefined) {
    return normalized;
  }

  return normalized.slice(0, markerMatch.index).trim();
}

function normalizePromptValue(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function promptIncludesValue(prompt: string, value: string) {
  const normalizedPrompt = normalizePromptValue(prompt).toLowerCase();
  const normalizedValue = normalizePromptValue(value).toLowerCase();
  return Boolean(normalizedValue) && normalizedPrompt.includes(normalizedValue);
}

export function buildTaskContextTeacherPrompt(params: {
  rawPrompt: string;
  taskContext?: Pick<
    AgentTaskContext,
    "curriculum" | "topic" | "duration" | "count" | "scope"
  > | null;
  includeFields?: Array<"curriculum" | "topic" | "duration" | "count" | "scope">;
}) {
  const basePrompt = stripPreflightClarificationBlock(params.rawPrompt);
  const lines = [basePrompt].filter(Boolean);
  const includeFields = new Set(params.includeFields ?? []);
  const taskContext = params.taskContext;

  if (!taskContext) {
    return lines.join("\n").trim();
  }

  const appendLine = (
    field: "curriculum" | "topic" | "duration" | "count" | "scope",
    label: string,
    formatter?: (value: string) => string,
  ) => {
    const rawValue = normalizePromptValue(taskContext[field] ?? "");
    if (!rawValue) return;
    if (promptIncludesValue(basePrompt, rawValue)) return;
    lines.push(`${label}${formatter ? formatter(rawValue) : rawValue}`);
  };

  if (includeFields.has("curriculum")) {
    appendLine("curriculum", "课程 / 单元：");
  }
  if (includeFields.has("topic")) {
    appendLine("topic", "主题范围：");
  }
  if (includeFields.has("duration")) {
    appendLine("duration", "课时时长：", (value) =>
      /\d+\s*(分钟|min|mins|minutes)/i.test(value) ? value : `${value} 分钟`,
    );
  }
  if (includeFields.has("count")) {
    appendLine("count", "输出数量：", (value) =>
      /\d+\s*(道|题|questions?)/i.test(value) ? value : `${value} 道`,
    );
  }
  if (includeFields.has("scope")) {
    appendLine("scope", "处理范围：");
  }

  return lines.join("\n").trim();
}

function sanitizeFileName(name: string) {
  const base = name.split(/[/\\]/).pop() || "upload";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

function hasReadableMaterialText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return Boolean(normalized) && normalized !== "(未提取到文本内容)" && normalized.length >= 40;
}

function buildMaterialTextFromScanResult(scanResult: Awaited<ReturnType<typeof runScanPipeline>>) {
  const questionBlocks = scanResult.questions
    .slice(0, 16)
    .map((question, index) => {
      const stem = String(question.content ?? "").replace(/\s+/g, " ").trim();
      if (!stem) return "";
      return `题目 ${question.questionNumber ?? index + 1}: ${stem}`;
    })
    .filter(Boolean);

  return trimText([scanResult.textPreview, ...questionBlocks].filter(Boolean).join("\n\n"));
}

async function extractMaterialTextPreview(params: {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
}) {
  try {
    const scanResult = await runScanPipeline({
      fileBuffer: params.buffer,
      fileName: params.fileName,
      mimeType: params.mimeType,
      useVision: true,
      allowMathpixUpload: false,
    });
    const previewText = buildMaterialTextFromScanResult(scanResult);
    return hasReadableMaterialText(previewText) ? previewText : "";
  } catch (error) {
    console.warn(`[material] 结构化提取失败，回退其他解析方式: ${params.fileName}`, error);
    return "";
  }
}

async function parseMaterialFileWithOptions(
  file: File,
  options: UploadedMaterialExtractionOptions,
): Promise<UploadedMaterial> {
  const safeName = sanitizeFileName(file.name || `upload-${Date.now()}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  const lowerName = safeName.toLowerCase();
  const isPdf = lowerName.endsWith(".pdf");
  const isImage =
    file.type.startsWith("image/") || /\.(png|jpg|jpeg|webp)$/i.test(lowerName);

  if (isImage) {
    const textContent = await extractMaterialTextPreview({
      buffer,
      fileName: safeName,
      mimeType: file.type || undefined,
    });
    const mediaType = file.type.startsWith("image/jpeg") ? "image/jpeg" as const
      : file.type.startsWith("image/webp") ? "image/webp" as const
      : "image/png" as const;
    return {
      fileName: safeName,
      fileType: file.type || "image",
      textContent,
      images: [{
        data: buffer.toString("base64"),
        mediaType,
        pageNumber: 1,
      }],
    };
  }

  if (isPdf) {
    const textContentFromScan = await extractMaterialTextPreview({
      buffer,
      fileName: safeName,
      mimeType: file.type || "application/pdf",
    });
    const pdfImagePageLimit = Math.max(
      0,
      Math.min(options.pdfImagePageLimit ?? 12, 24),
    );

    try {
      const { renderPdfPages } = await import("@/lib/pdf-scan/pdf-render");
      const pages =
        pdfImagePageLimit > 0
          ? await renderPdfPages(buffer, {
              scale: 1.35,
              maxPages: pdfImagePageLimit,
            })
          : [];
      const images: UploadedMaterialImage[] = pages.map((page) => ({
        data: page.buffer.toString("base64"),
        mediaType: "image/png" as const,
        pageNumber: page.pageNumber,
      }));
      if (images.length > 0) {
        return {
          fileName: safeName,
          fileType: "pdf",
          textContent: textContentFromScan,
          images,
        };
      }
    } catch (error) {
      console.warn(`[material] PDF Vision 渲染失败，回退文本提取: ${safeName}`, error);
    }

    if (hasReadableMaterialText(textContentFromScan)) {
      return {
        fileName: safeName,
        fileType: "pdf",
        textContent: textContentFromScan,
      };
    }

    if (isSupportedDocument(safeName)) {
      const parsed = await parseDocument(buffer, safeName);
      if (hasReadableMaterialText(parsed.textContent)) {
        return {
          fileName: parsed.fileName,
          fileType: parsed.fileType,
          textContent: trimText(parsed.textContent),
        };
      }
    }

    throw new Error(`${safeName} 未提取到可读内容`);
  }

  if (isSupportedDocument(safeName)) {
    const parsed = await parseDocument(buffer, safeName);
    if (!hasReadableMaterialText(parsed.textContent)) {
      throw new Error(`${safeName} 未提取到可读文本`);
    }
    return {
      fileName: parsed.fileName,
      fileType: parsed.fileType,
      textContent: trimText(parsed.textContent),
    };
  }

  const text = trimText(buffer.toString("utf-8").replace(/\u0000/g, " ").trim());
  if (!text) {
    throw new Error(`${safeName} 未提取到可读文本`);
  }

  return {
    fileName: safeName,
    fileType: file.type || "text",
    textContent: text,
  };
}

export async function extractUploadedMaterials(files: File[]) {
  return extractUploadedMaterialsWithOptions(files, {});
}

export async function extractUploadedMaterialsWithOptions(
  files: File[],
  options: UploadedMaterialExtractionOptions,
) {
  const materials: UploadedMaterial[] = [];
  const warnings: string[] = [];

  for (const file of files.slice(0, 2)) {
    try {
      const parsed = await parseMaterialFileWithOptions(file, options);
      materials.push(parsed);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `${file.name} 解析失败`);
    }
  }

  return {
    materials,
    warnings,
  };
}

export function buildUploadedMaterialConversationSources(params: {
  materials: UploadedMaterial[];
  summary: string;
}) {
  if (params.materials.length === 0) return [];

  return [
    {
      kind: "uploaded_materials" as const,
      summary: trimText(params.summary, 4_000),
      files: params.materials.map((item) => ({
        fileName: item.fileName,
        fileType: item.fileType,
        hasText: Boolean(item.textContent.trim()),
        imageCount: item.images?.length ?? 0,
        previewText: trimText(item.textContent, 600),
        // 完整文本内容（截断到 8000 字），供后续轮次恢复材料上下文
        textContent: trimText(item.textContent, 8_000),
      })),
    },
  ];
}

export async function parseAgentChatRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const rawPayload = `${formData.get("payload") ?? ""}`.trim();
    const rawMessages = `${formData.get("messages") ?? ""}`.trim();
    const rawMessage = `${formData.get("message") ?? ""}`.trim();
    const rawDisplayMessage = `${formData.get("displayMessage") ?? ""}`.trim();
    const rawConversationId = `${formData.get("conversationId") ?? ""}`.trim();

    let payloadInput: AgentChatBody;
    if (rawPayload) {
      let parsedPayload: unknown;
      try {
        parsedPayload = JSON.parse(rawPayload);
      } catch {
        throw new InvalidJsonBodyError();
      }
      payloadInput = requestSchema.parse({
        ...(typeof parsedPayload === "object" && parsedPayload ? parsedPayload : {}),
        conversationId: rawConversationId || undefined,
        displayMessage: rawDisplayMessage || undefined,
      });
    } else if (rawMessages) {
      let parsedMessages: unknown;
      try {
        parsedMessages = JSON.parse(rawMessages);
      } catch {
        throw new InvalidJsonBodyError();
      }
      payloadInput = requestSchema.parse({
        ...(typeof parsedMessages === "object" && parsedMessages ? parsedMessages : {}),
        conversationId: rawConversationId || undefined,
        displayMessage: rawDisplayMessage || undefined,
      });
    } else {
      payloadInput = requestSchema.parse({
        message: rawMessage,
        displayMessage: rawDisplayMessage || undefined,
        conversationId: rawConversationId || undefined,
      });
    }

    const files = formData
      .getAll("materials")
      .filter((item): item is File => item instanceof File)
      .slice(0, 2);

    return {
      body: payloadInput,
      files,
    };
  }

  const payload = requestSchema.parse(await parseJsonBody(request));
  return {
    body: payload,
    files: [] as File[],
  };
}

export function getLatestUserMessage(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user" && message.content.trim()) {
      return message.content.trim();
    }
  }
  return "";
}

export function getLatestAssistantMessage(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && message.content.trim()) {
      return message.content.trim();
    }
  }
  return "";
}

export function resolveProfileKey(profileKey: string | undefined, teacherId: string) {
  const normalized = profileKey?.trim();
  if (normalized && normalized.length >= 6) return normalized;
  return `agent_teacher_${teacherId}`;
}

export function trimQueryText(text: string, maxLength = 280) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

export function getSummaryString(summary: unknown, key: string) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return "";
  const value = (summary as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

export function buildConversationMessagesForModel(
  context: AgentConversationContext,
  latestUserPrompt: string,
  selectionQuery?: string,
): Array<{ role: "user" | "assistant"; content: string }> {
  const selectedMessages = selectConversationMessages({
    query: selectionQuery ?? latestUserPrompt,
    messages: context.recentMessages
      .filter((item): item is { role: "user" | "assistant"; content: string } => item.role !== "system")
      .map((item) => ({
        role: item.role,
        content: item.content,
      })),
  });

  return [
    ...selectedMessages,
    {
      role: "user",
      content: latestUserPrompt,
    },
  ];
}

export function uniqueNonEmpty(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}
