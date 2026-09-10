import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { inferKnowledgeChunkStructure } from "@/lib/assistant/chunk-structure";
import { buildKnowledgeContentPreview } from "@/lib/assistant/chunk-preview";
import { chunkMarkdown } from "@/lib/assistant/chunker";
import { normalizeVisionExtractedText } from "@/lib/assistant/ocr-normalize";
import { indexPreparedKnowledgeDocumentChunksForRag } from "@/lib/assistant/knowledge-rag";
import { jsonError } from "@/lib/api/response";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { replaceKnowledgeDocumentChunks, createKnowledgeDocument, updateKnowledgeDocument } from "@/lib/assistant/store";
import { saveDocumentChunks } from "@/lib/assistant/supermemory";
import { selectOcrProvider } from "@/lib/pdf-scan/ocr-router";
import { uploadPDF, waitForCompletion, hasMathpixCredentials } from "@/lib/pdf-scan/mathpix";
import { hasMistralOcrCredentials, ocrPdfWithMistral } from "@/lib/pdf-scan/mistral-ocr";
import {
  autoImportKnowledgeDocumentToQuestionBank,
  planKnowledgeDocumentQuestionImport,
} from "@/lib/question-bank/knowledge-auto-import";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasWechatVisionProvider, sendVisionMessage } from "@/lib/wechat/ai-vision";
import { isSupportedDocument, parseDocument } from "@/lib/wechat/document-parser";
import { scheduleReliableAfterTask } from "@/lib/runtime/background-task";
import type { DocumentChunk } from "@/lib/assistant/chunker";
import type { OcrProvider } from "@/lib/pdf-scan/ocr-router";
import type { MistralOcrPage } from "@/lib/pdf-scan/mistral-ocr";
import type { ParsedDocument } from "@/lib/wechat/document-parser";
import type { Json } from "@/types/database";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_BATCH_COUNT = 10;

const imageMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

const metadataSchema = z.object({
  subject: z.string().trim().min(1).max(120).optional(),
  unit: z.string().trim().min(1).max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  ocrProvider: z.enum(["mathpix", "mistral"]).optional(),
});

type KnowledgeExtractionResult = {
  textContent: string;
  provider: OcrProvider | "document-parser" | "vision-image" | "plain-text";
  parsedDocument?: ParsedDocument | null;
  pages?: MistralOcrPage[];
  routeReason?: string;
};

function sanitizeFileName(name: string) {
  const basename = name.split(/[/\\]/).pop() || "upload";
  return basename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

function parseTagsFromForm(formData: FormData): string[] {
  const directValues = formData
    .getAll("tags")
    .map((item) => `${item}`.trim())
    .filter(Boolean);

  if (directValues.length > 0) {
    return Array.from(new Set(directValues)).slice(0, 20);
  }

  const tagsJson = `${formData.get("tagsJson") ?? ""}`.trim();
  if (!tagsJson) return [];

  try {
    const parsed = JSON.parse(tagsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => `${item}`.trim())
      .filter(Boolean)
      .slice(0, 20);
  } catch {
    return [];
  }
}

function toMetadataRecord(value: Json | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mergeDocumentMetadata(
  currentMetadata: Json | null | undefined,
  patch: Record<string, unknown>,
) {
  return {
    ...toMetadataRecord(currentMetadata),
    ...patch,
  } as Json;
}

async function extractImageText(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  if (!hasWechatVisionProvider()) {
    return `图片资料：${fileName}（OCR 未启用，请配置可用的 OpenRouter / Anthropic Vision 模型）`;
  }

  const base64 = buffer.toString("base64");

  const response = await sendVisionMessage(
    [
      "请提取这张教学图片中的可读文字，并尽量保留原始结构。",
      "输出要求：",
      "1. 标题使用 Markdown 标题格式。",
      "2. 列表保持为 Markdown 列表。",
      "3. 如果内容明显是表格或 Rubric，请输出 Markdown 表格，不要压成一句话。",
      "4. 只输出提取结果，不要解释。",
    ].join("\n"),
    {
      mediaType: mimeType || "image/jpeg",
      data: base64,
    },
    {
      maxTokens: 2800,
      temperature: 0,
    },
  ).catch(() => "");

  const cleaned = response.trim();
  if (!cleaned) {
    return `图片资料：${fileName}（未识别到清晰文字）`;
  }
  return normalizeVisionExtractedText(cleaned);
}

function summarizeExtractedText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "暂无解析摘要";
  return normalized.slice(0, 220);
}

function buildPdfParsedDocument(params: {
  fileName: string;
  content: string;
  pages?: MistralOcrPage[];
}): ParsedDocument {
  const pageTexts = params.pages
    ?.map((page) => page.markdown.trim())
    .filter(Boolean);
  const fullTextContent =
    params.content.trim() ||
    pageTexts?.join("\n\n").trim() ||
    "(未提取到文本内容)";

  return {
    fileName: params.fileName,
    fileType: "pdf",
    textContent: fullTextContent,
    fullTextContent,
    pageTexts: pageTexts?.length ? pageTexts : undefined,
  };
}

async function uploadToStorage(params: {
  teacherId: string;
  file: File;
  fileBuffer: Buffer;
  safeName: string;
}) {
  const admin = createAdminSupabaseClient();
  const storagePath = `knowledge/${params.teacherId}/${Date.now()}-${randomUUID()}-${params.safeName}`;

  const { error } = await admin.storage.from("pdfs").upload(storagePath, params.fileBuffer, {
    contentType: params.file.type || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    throw new Error(`上传原文件失败: ${error.message}`);
  }

  return storagePath;
}

function isPdfFile(file: File, fileName: string) {
  return file.type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
}

function buildKnowledgeChunks(params: {
  textContent: string;
  pages?: MistralOcrPage[];
}): DocumentChunk[] {
  const chunkOptions = {
    maxChunkSize: 800,
    minChunkSize: 100,
    overlap: 100,
  };

  if (params.pages && params.pages.length > 0) {
    const pageChunks: DocumentChunk[] = [];
    let nextIndex = 0;
    let globalOffset = 0;

    for (const page of params.pages) {
      const pageText = page.markdown.trim();
      if (!pageText) continue;

      const chunks = chunkMarkdown(pageText, chunkOptions);
      for (const chunk of chunks) {
        pageChunks.push({
          ...chunk,
          index: nextIndex,
          pageRange: `${page.pageNumber}`,
          pageStart: page.pageNumber,
          pageEnd: page.pageNumber,
          charOffset: globalOffset + chunk.charOffset,
        });
        nextIndex += 1;
      }

      globalOffset += pageText.length + 2;
    }

    if (pageChunks.length > 0) {
      return pageChunks;
    }
  }

  return chunkMarkdown(params.textContent, chunkOptions);
}

async function loadParsedDocumentSafely(
  fileBuffer: Buffer,
  safeName: string,
): Promise<ParsedDocument | null> {
  if (!isSupportedDocument(safeName)) return null;
  try {
    return await parseDocument(fileBuffer, safeName, { truncate: false });
  } catch {
    return null;
  }
}

async function extractKnowledgeContent(params: {
  file: File;
  fileBuffer: Buffer;
  safeName: string;
  subject?: string;
  forceProvider?: OcrProvider;
}): Promise<KnowledgeExtractionResult> {
  if (imageMimeTypes.has(params.file.type)) {
    return {
      textContent: await extractImageText(params.fileBuffer, params.file.type, params.safeName),
      provider: "vision-image",
      parsedDocument: null,
    };
  }

  if (isPdfFile(params.file, params.safeName)) {
    const route = selectOcrProvider({
      fileName: params.safeName,
      subject: params.subject,
      forceProvider: params.forceProvider,
      fileSize: params.fileBuffer.byteLength,
    });

    if (route.provider === "mathpix" && hasMathpixCredentials()) {
      const pdfId = await uploadPDF(params.fileBuffer, params.safeName);
      const result = await waitForCompletion(pdfId);
      const parsedDocument = buildPdfParsedDocument({
        fileName: params.safeName,
        content: result.content,
      });
      return {
        textContent: parsedDocument.fullTextContent,
        provider: "mathpix",
        routeReason: route.reason,
        parsedDocument,
      };
    }

    if (route.provider === "mistral" && hasMistralOcrCredentials()) {
      const result = await ocrPdfWithMistral(params.fileBuffer, params.safeName);
      const parsedDocument = buildPdfParsedDocument({
        fileName: params.safeName,
        content: result.content,
        pages: result.pages,
      });
      return {
        textContent: parsedDocument.fullTextContent,
        provider: "mistral",
        pages: result.pages,
        routeReason: route.reason,
        parsedDocument,
      };
    }

    throw new Error("未配置可用的 Mathpix / Mistral OCR 凭据，无法解析 PDF");
  }

  if (isSupportedDocument(params.safeName)) {
    const parsedDocument = await parseDocument(params.fileBuffer, params.safeName, { truncate: false });
    return {
      textContent: parsedDocument.fullTextContent || parsedDocument.textContent,
      provider: "document-parser",
      parsedDocument,
    };
  }

  const plain = params.fileBuffer.toString("utf-8").trim();
  if (!plain) {
    throw new Error("暂不支持该文件格式，或文件内容为空");
  }

  return {
    textContent: plain,
    provider: "plain-text",
    parsedDocument: null,
  };
}

export async function POST(request: Request) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } = await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  try {
    const formData = await request.formData();

    const files = [
      ...formData.getAll("files").filter((item): item is File => item instanceof File),
      ...((formData.get("file") instanceof File ? [formData.get("file") as File] : []) as File[]),
    ];

    const uniqueFiles = Array.from(new Set(files));
    if (uniqueFiles.length === 0) {
      return jsonError("VALIDATION_ERROR", "请上传至少一个文件", 400);
    }
    if (uniqueFiles.length > MAX_BATCH_COUNT) {
      return jsonError("VALIDATION_ERROR", `单次最多上传 ${MAX_BATCH_COUNT} 个文件`, 400);
    }

    const metadata = metadataSchema.parse({
      subject: `${formData.get("subject") ?? ""}`.trim() || undefined,
      unit: `${formData.get("unit") ?? ""}`.trim() || undefined,
      tags: parseTagsFromForm(formData),
      ocrProvider:
        (`${formData.get("ocrProvider") ?? formData.get("forceProvider") ?? ""}`.trim() || undefined) as
          | OcrProvider
          | undefined,
    });

    const documents = [] as Array<{
      id: string;
      status: string;
      summary: string;
      filename: string;
      chunkCount: number;
      ocrProvider: string | null;
    }>;

    for (const file of uniqueFiles) {
      if (file.size > MAX_FILE_SIZE) {
        return jsonError("VALIDATION_ERROR", `${file.name} 超过 50MB 限制`, 400);
      }

      const safeName = sanitizeFileName(file.name || `upload-${Date.now()}`);
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const storagePath = await uploadToStorage({
        teacherId,
        file,
        fileBuffer,
        safeName,
      });

      const record = await createKnowledgeDocument(supabase, {
        teacherId,
        filename: safeName,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        subject: metadata.subject,
        unit: metadata.unit,
        tags: metadata.tags ?? [],
        storagePath,
        status: "processing",
        summary: "正在解析文档...",
        metadata: {
          parsedLength: 0,
          uploadVia: "knowledge_upload_api",
          questionBank: {
            status: "pending",
            reason: "文档解析中，待生成自动拆题计划。",
          },
          rag: {
            status: "pending",
            strategy: "pending",
            chunkCount: 0,
            embeddedCount: 0,
            embeddingModel: null,
          },
        } as Json,
      });

      let parsedDocument: ParsedDocument | null = null;
      let parsedLength = 0;
      let extractedText = "";
      let extractedProvider: string | null = null;
      let routeReason: string | null = null;
      let chunkCount = 0;

      try {
        const extracted = await extractKnowledgeContent({
          file,
          fileBuffer,
          safeName,
          subject: metadata.subject,
          forceProvider: metadata.ocrProvider,
        });

        extractedText = extracted.textContent.trim();
        extractedProvider = extracted.provider;
        routeReason = extracted.routeReason ?? null;
        parsedDocument =
          extracted.parsedDocument ?? await loadParsedDocumentSafely(fileBuffer, safeName);
        parsedLength = (
          parsedDocument?.fullTextContent ||
          parsedDocument?.textContent ||
          extractedText
        ).length;

        if (!extractedText) {
          throw new Error("未提取到可用文本内容");
        }

        const autoImportPlan = planKnowledgeDocumentQuestionImport({
          fileName: safeName,
          fileType: file.type || "application/octet-stream",
          extractedText,
          parsedDocument,
        });

        const chunks = buildKnowledgeChunks({
          textContent: extractedText,
          pages: extracted.pages,
        });
        chunkCount = chunks.length;

        const uploadedAt = new Date().toISOString();
        const baseChunkMetadata = {
          filename: safeName,
          original_filename: safeName,
          file_type: file.type || "unknown",
          subject: metadata.subject ?? null,
          unit: metadata.unit ?? null,
          tags: metadata.tags ?? [],
          uploaded_at: uploadedAt,
          ocrProvider: extracted.provider,
          routeReason,
          totalChunks: chunks.length,
        };

        let supermemory = {
          memoryIds: chunks.map(() => null) as Array<string | null>,
        };
        let supermemoryError: string | null = null;

        try {
          supermemory = await saveDocumentChunks({
            teacherId,
            documentId: record.id,
            chunks,
            metadata: baseChunkMetadata,
          });
        } catch (error) {
          supermemoryError =
            error instanceof Error ? error.message : "Supermemory 文档镜像失败";
          console.warn(
            "[knowledge-upload] Supermemory 文档块镜像失败，继续写入本地知识块与语义索引",
            error,
          );
        }

        const structureSummary = {
          tableChunks: 0,
          figureChunks: 0,
          imageOcrChunks: 0,
        };

        const preparedRagChunks = chunks.map((chunk, index) => {
          const structure = inferKnowledgeChunkStructure({
            content: chunk.content,
            fileType: file.type || "unknown",
            ocrProvider: extracted.provider,
          });

          if (structure.hasTable) structureSummary.tableChunks += 1;
          if (structure.hasFigure) structureSummary.figureChunks += 1;
          if (structure.contentType === "image_ocr") {
            structureSummary.imageOcrChunks += 1;
          }

          return {
            chunkIndex: chunk.index,
            pageStart: chunk.pageStart ?? null,
            pageEnd: chunk.pageEnd ?? null,
            title: chunk.heading ?? null,
            content: chunk.content,
            contentPreview: buildKnowledgeContentPreview(chunk.content) ?? "",
            tokenCount: chunk.tokenEstimate ?? 0,
            metadata: {
              pageRange: chunk.pageRange ?? null,
              charOffset: chunk.charOffset,
              supermemoryId: supermemory.memoryIds[index] ?? null,
              contentType: structure.contentType,
              hasTable: structure.hasTable,
              hasFigure: structure.hasFigure,
              structureHints: structure.structureHints,
              ...baseChunkMetadata,
            } as Json,
          };
        });

        let ragMetadata: Record<string, unknown>;
        try {
          const rag = await indexPreparedKnowledgeDocumentChunksForRag({
            db: supabase,
            teacherId,
            documentId: record.id,
            chunks: preparedRagChunks,
          });
          ragMetadata = {
            status: "ready",
            strategy: rag.strategy,
            chunkCount: rag.chunkCount,
            embeddedCount: rag.embeddedCount,
            embeddingModel: rag.embeddingModel,
          };
        } catch (error) {
          const ragError = error instanceof Error ? error.message : "RAG 索引失败";
          console.warn("[knowledge-upload] prepared RAG 索引失败，已回退普通知识块写入", error);

          await replaceKnowledgeDocumentChunks(supabase, {
            teacherId,
            documentId: record.id,
            chunks: preparedRagChunks.map((chunk) => ({
              index: chunk.chunkIndex,
              content: chunk.content,
              heading: chunk.title ?? undefined,
              pageStart: chunk.pageStart ?? undefined,
              pageEnd: chunk.pageEnd ?? undefined,
              tokenEstimate: chunk.tokenCount,
              metadata: chunk.metadata,
            })),
          });

          ragMetadata = {
            status: "ready",
            strategy: "keyword",
            chunkCount: preparedRagChunks.length,
            embeddedCount: 0,
            embeddingModel: null,
            error: ragError,
          };
        }

        const supermemoryIds = supermemory.memoryIds.filter((item): item is string => Boolean(item));
        const summary = summarizeExtractedText(extractedText);
        const mergedMetadata = mergeDocumentMetadata(record.metadata, {
          parsedLength,
          uploadVia: "knowledge_upload_api",
          totalChunks: chunks.length,
          ocrProvider: extracted.provider,
          routeReason,
          structureSummary,
          supermemory: {
            status: supermemoryError ? "failed" : "ready",
            error: supermemoryError,
            mirroredCount: supermemory.memoryIds.filter((item): item is string => Boolean(item))
              .length,
          },
          questionBank: autoImportPlan.metadata,
          rag: ragMetadata,
        });

        const updated = await updateKnowledgeDocument(supabase, teacherId, record.id, {
          chunkCount: chunks.length,
          fullTextLength: extractedText.length,
          ocrProvider: extracted.provider,
          subject: metadata.subject ?? null,
          supermemoryId: supermemoryIds[0] ?? null,
          supermemoryIds,
          unit: metadata.unit ?? null,
          tags: metadata.tags ?? [],
          summary,
          status: "completed",
          metadata: mergedMetadata,
        });

        if (autoImportPlan.shouldProcess) {
          const metadataForBackground = updated?.metadata ?? mergedMetadata;
          scheduleReliableAfterTask({
            taskType: "knowledge.auto_import",
            taskKey: record.id,
            teacherId,
            payload: {
              documentId: record.id,
              fileName: safeName,
            },
            run: async () => {
              const admin = createAdminSupabaseClient();
              await autoImportKnowledgeDocumentToQuestionBank({
                db: admin,
                teacherId,
                documentId: record.id,
                fileName: safeName,
                fileType: file.type || "application/octet-stream",
                fileSize: file.size,
                storagePath,
                summary,
                metadata: metadataForBackground,
                fileBuffer,
                parsedDocument,
                extractedText,
                subject: metadata.subject ?? null,
                unit: metadata.unit ?? null,
              });
            },
          });
        }

        documents.push({
          id: updated?.id ?? record.id,
          status: updated?.status ?? "completed",
          summary: updated?.summary ?? summary,
          filename: updated?.filename ?? safeName,
          chunkCount: updated?.chunkCount ?? chunks.length,
          ocrProvider: updated?.ocrProvider ?? extracted.provider,
        });
      } catch (error) {
        const failureMessage = error instanceof Error ? error.message : "解析失败";
        const failed = await updateKnowledgeDocument(supabase, teacherId, record.id, {
          chunkCount: 0,
          fullTextLength: 0,
          ocrProvider: extractedProvider ?? metadata.ocrProvider ?? null,
          subject: metadata.subject ?? null,
          supermemoryId: null,
          supermemoryIds: [],
          unit: metadata.unit ?? null,
          tags: metadata.tags ?? [],
          summary: failureMessage,
          status: "failed",
          metadata: mergeDocumentMetadata(record.metadata, {
            parsedLength,
            uploadVia: "knowledge_upload_api",
            failureMessage,
            ocrProvider: extractedProvider ?? metadata.ocrProvider ?? null,
            routeReason,
            questionBank: {
              status: "failed",
              reason: `${failureMessage}，未进入自动拆题流程。`,
            },
            rag: {
              status: "skipped",
              strategy: "pending",
              chunkCount,
              embeddedCount: 0,
              embeddingModel: null,
              reason: "文档解析失败或知识块写入失败。",
            },
          }),
        });

        documents.push({
          id: failed?.id ?? record.id,
          status: failed?.status ?? "failed",
          summary: failed?.summary ?? failureMessage,
          filename: failed?.filename ?? safeName,
          chunkCount: failed?.chunkCount ?? 0,
          ocrProvider: failed?.ocrProvider ?? extractedProvider ?? metadata.ocrProvider ?? null,
        });
      }
    }

    return NextResponse.json({
      documents,
      total: documents.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("VALIDATION_ERROR", "上传参数不合法", 400, error.flatten());
    }
    console.error("知识库上传失败", error);
    return jsonError("INTERNAL_ERROR", "上传失败，请稍后重试", 500);
  }
}
