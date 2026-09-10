import { z } from "zod";
import { InvalidJsonBodyError } from "@/lib/api/request";
import { jsonError } from "@/lib/api/response";
import {
  DocumentConflictError,
  DocumentNotFoundError,
  DocumentValidationError,
  DocumentVersionNotFoundError,
} from "@/lib/documents/store";
import {
  DOCUMENT_EDITOR_KINDS,
  DOCUMENT_LIST_ORDERS,
  DOCUMENT_LIST_SORT_FIELDS,
  DOCUMENT_SOURCE_TYPES,
} from "@/lib/documents/types";
import { uuidSchema } from "@/lib/validation/api";

export const documentParamsSchema = z.object({
  id: uuidSchema,
});

export const documentVersionParamsSchema = z.object({
  id: uuidSchema,
  versionId: uuidSchema,
});

const propertyColorSchema = z.object({
  bg: z.string().trim().min(1).max(64),
  text: z.string().trim().min(1).max(64),
});

export const documentPropertySchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().max(400),
  color: propertyColorSchema.nullable().optional(),
});

export const documentPropertiesSchema = z.array(documentPropertySchema).max(40);

export const createDocumentSchema = z
  .object({
    title: z.string().trim().max(200).optional().default(""),
    htmlContent: z.string().max(600_000).optional().default(""),
    properties: documentPropertiesSchema.optional().default([]),
    documentKind: z.string().trim().max(80).optional().default("notes"),
    editorKind: z.enum(DOCUMENT_EDITOR_KINDS).optional().default("html"),
    sourceType: z.enum(DOCUMENT_SOURCE_TYPES).optional().default("standalone"),
    sourceId: uuidSchema.nullable().optional(),
    documentModel: z.unknown().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .superRefine((value, ctx) => {
    if (value.sourceType !== "standalone" && !value.sourceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceId"],
        message: "非 standalone 文档必须提供 sourceId。",
      });
    }
  });

export const documentListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  kind: z.string().trim().max(80).optional(),
  starred: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  sort: z.enum(DOCUMENT_LIST_SORT_FIELDS).optional(),
  order: z.enum(DOCUMENT_LIST_ORDERS).optional(),
});

export const duplicateDocumentSchema = z.object({
  title: z.string().trim().max(200).optional(),
});

export const updateDocumentStarSchema = z.object({
  starred: z.boolean(),
});

export const autosaveRequestSchema = z.object({
  title: z.string().trim().max(200),
  htmlContent: z.string().max(600_000),
  properties: documentPropertiesSchema,
  expectedVersion: z.number().int().positive(),
});

export const updatePropertiesSchema = z.object({
  properties: documentPropertiesSchema,
  expectedVersion: z.number().int().positive().optional(),
});

export const restoreDocumentVersionSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
});

export function mapDocumentRouteError(error: unknown, fallbackMessage: string) {
  if (error instanceof InvalidJsonBodyError) {
    return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON", 400);
  }
  if (error instanceof z.ZodError) {
    return jsonError("VALIDATION_ERROR", "请求参数不合法", 400, error.flatten());
  }
  if (error instanceof DocumentNotFoundError) {
    return jsonError("NOT_FOUND", "文档不存在", 404);
  }
  if (error instanceof DocumentVersionNotFoundError) {
    return jsonError("NOT_FOUND", "历史版本不存在", 404);
  }
  if (error instanceof DocumentConflictError) {
    return jsonError("CONFLICT", "文档版本已变化，请刷新后重试", 409);
  }
  if (error instanceof DocumentValidationError) {
    if (error.message === "SOURCE_ID_REQUIRED") {
      return jsonError("VALIDATION_ERROR", "非 standalone 文档必须提供 sourceId", 400);
    }
    if (error.message === "DOCUMENT_READ_ONLY") {
      return jsonError("CONFLICT", "该文档是只读副本，不能直接编辑", 409);
    }
    return jsonError("VALIDATION_ERROR", "文档参数不合法", 400);
  }
  console.error(fallbackMessage, error);
  return jsonError("INTERNAL_ERROR", fallbackMessage, 500);
}
