import { z } from "zod";
import { generateStructuredObject } from "@/lib/ai/structured-output";
import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import type { DocumentBlock, DocumentKind } from "@/lib/doc-engine/block-types";
import { documentBlockSchema } from "@/lib/doc-engine/document-schema";

const rawDocumentBlockSchema = z.object({
  id: z.string().min(1).optional(),
  type: z.string().min(1),
  dataJson: z.string().min(2),
});

const docEditResponseSchema = z.object({
  modifiedBlocks: z.array(rawDocumentBlockSchema).max(16),
  summary: z.string().min(1).max(300),
});

type RawEditedBlock = z.infer<typeof rawDocumentBlockSchema>;
type ParsedBlockCandidate = {
  id?: string;
  type: string;
  data: unknown;
};

function resolveEditModelTask(documentType: string) {
  const normalized = `${documentType}`.toLowerCase();
  if (normalized.includes("rubric")) return "rubric_generate" as const;
  if (normalized.includes("lesson")) return "lesson_rewrite" as const;
  return "exercise_generate" as const;
}

function ensureBlockIds(params: {
  originalIds: string[];
  blocks: ParsedBlockCandidate[];
}) {
  const used = new Set<string>();
  return params.blocks.map((block, index) => {
    const preferredId = block.id?.trim() || params.originalIds[index] || `${params.originalIds[0]}-extra-${index + 1}`;
    let nextId = preferredId;
    let suffix = 1;
    while (used.has(nextId)) {
      nextId = `${preferredId}-${suffix}`;
      suffix += 1;
    }
    used.add(nextId);
    return {
      ...block,
      id: nextId,
    };
  });
}

function stableBlockSignature(block: Pick<DocumentBlock, "type" | "data">) {
  return JSON.stringify({
    type: block.type,
    data: block.data,
  });
}

function allowsBlockExpansion(instruction: string) {
  return /新增|增加|添加|插入|补充|扩展|拆成|拆分|多一段|append|insert|add|split|expand/i.test(
    instruction,
  );
}

function collapseUnexpectedExpansion(params: {
  originalBlocks: DocumentBlock[];
  blocks: ParsedBlockCandidate[];
  instruction: string;
}) {
  if (params.blocks.length <= params.originalBlocks.length) {
    return params.blocks;
  }

  if (allowsBlockExpansion(params.instruction)) {
    return params.blocks;
  }

  const originalSignatures = params.originalBlocks.map((block) =>
    stableBlockSignature(block),
  );
  let removableBudget = params.blocks.length - params.originalBlocks.length;

  const trimmed = params.blocks.filter((block) => {
    if (removableBudget <= 0) return true;

    const signature = stableBlockSignature({
      type: block.type as DocumentBlock["type"],
      data: block.data as DocumentBlock["data"],
    });
    if (!originalSignatures.includes(signature)) {
      return true;
    }

    removableBudget -= 1;
    return false;
  });

  if (trimmed.length <= params.originalBlocks.length) {
    return trimmed;
  }

  return trimmed.slice(0, Math.max(1, params.originalBlocks.length));
}

function normalizeEditedBlocks(params: {
  originalIds: string[];
  originalBlocks: DocumentBlock[];
  blocks: RawEditedBlock[];
  instruction: string;
}) {
  const parsedBlocks = params.blocks.map((block) => {
    let data: unknown = null;
    try {
      data = JSON.parse(block.dataJson);
    } catch {
      data = null;
    }

    return {
      id: block.id,
      type: block.type,
      data,
    } satisfies ParsedBlockCandidate;
  });

  const collapsedBlocks = collapseUnexpectedExpansion({
    originalBlocks: params.originalBlocks,
    blocks: parsedBlocks,
    instruction: params.instruction,
  });
  const withIds = ensureBlockIds({ originalIds: params.originalIds, blocks: collapsedBlocks });

  return withIds
    .map((block, index) => {
      const parsed = documentBlockSchema.safeParse(block);
      if (parsed.success) {
        return parsed.data as DocumentBlock;
      }
      return params.originalBlocks[index] ?? null;
    })
    .filter((block): block is DocumentBlock => Boolean(block));
}

export async function editDocumentBlocks(params: {
  documentId: string;
  documentType: DocumentKind | string;
  title: string;
  selectedBlockIds: string[];
  selectedBlocks: DocumentBlock[];
  surroundingBlocks?: DocumentBlock[];
  instruction: string;
  totalBlockCount: number;
  abortSignal?: AbortSignal;
}) {
  const model = getResolvedLanguageModelForTask(resolveEditModelTask(params.documentType));

  const systemPrompt = [
    "你是资深教研文档编辑。",
    "任务：只修改教师选中的 block，返回可直接落库的结构化结果。",
    "硬性要求：",
    "1. 保持 documentType、学科语境、术语风格一致。",
    "2. 默认返回与 selectedBlocks 相同数量的 block，并就地改写；只有当教师明确要求“新增 / 插入 / 拆分 / 增加一段”时，才允许增加 block 数量。",
    "3. 未要求删除时，尽量保留原 block 的 id 和顺序。",
    "4. 如果需要新增 block，只能插入在当前选区附近，并生成唯一 id。",
    "5. 不能改动未选中的 surroundingBlocks，它们只用于上下文理解。",
    "6. 输出必须是 { modifiedBlocks, summary }。",
    "7. modifiedBlocks[*].dataJson 必须是合法 JSON 字符串，内容等价于 block 的 data 对象，不要输出 markdown code fence。",
  ].join("\n");

  const userPrompt = [
    `documentId: ${params.documentId}`,
    `documentType: ${params.documentType}`,
    `title: ${params.title}`,
    `instruction: ${params.instruction}`,
    `totalBlockCount: ${params.totalBlockCount}`,
    "selectedBlocks:",
    JSON.stringify(params.selectedBlocks, null, 2),
    params.surroundingBlocks?.length
      ? ["surroundingBlocks:", JSON.stringify(params.surroundingBlocks, null, 2)].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await generateStructuredObject({
    model,
    schema: docEditResponseSchema,
    systemPrompt,
    userPrompt,
    maxTokens: 3200,
    temperature: 0.2,
    maxRetries: 2,
    abortSignal: params.abortSignal,
  });

  return {
    modifiedBlocks: normalizeEditedBlocks({
      originalIds: params.selectedBlockIds,
      originalBlocks: params.selectedBlocks,
      blocks: response.modifiedBlocks as RawEditedBlock[],
      instruction: params.instruction,
    }),
    summary: response.summary.trim(),
  };
}
