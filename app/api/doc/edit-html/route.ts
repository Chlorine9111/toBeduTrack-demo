/**
 * POST /api/doc/edit-html
 *
 * 用户圈选文档中一段 HTML，发送修改指令（如"改成填空题"），
 * 调用 LLM 返回修改后的 HTML 片段，前端直接替换 DOM 选区。
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { InvalidJsonBodyError, parseJsonBody } from "@/lib/api/request";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/response";
import { generateGatewayText } from "@/lib/ai/gateway";
import { checkQuotaAdmissionSafe, finalizeQuotaSpendSafe } from "@/lib/quota/service";
import { buildQuotaHeaders, buildQuotaExhaustedDetails } from "@/lib/quota/headers";

export const maxDuration = 60;

const DOC_EDIT_MODEL_ID =
  process.env.DOC_EDIT_HTML_MODEL?.trim() ||
  "claude-sonnet-4-6";

const editHtmlRequestSchema = z.object({
  editMode: z.enum(["content_edit", "structure_edit"]).default("content_edit"),
  selectedHtml: z.string().trim().min(1).max(300_000),
  instruction: z.string().trim().min(1).max(1000),
  documentType: z.string().trim().min(1).max(80).optional(),
  contextTag: z.string().trim().min(1).max(40).optional(),
  contextHtml: z.string().trim().min(1).max(20_000).optional(),
  targetContainerTag: z.string().trim().min(1).max(40).optional(),
  targetContainerHtml: z.string().trim().min(1).max(300_000).optional(),
  fullDocumentHtml: z.string().trim().min(1).max(300_000).optional(),
  documentMeta: z.record(z.string(), z.string().trim().max(500)).optional(),
});

// ── 系统提示词 ─────────────────────────────────────────
// 设计原则：
// - 角色定位：精确外科手术式编辑，不是重写
// - 语言匹配：输出语言跟随选区原文
// - 粒度匹配：选了短语返回短语，选了段落返回段落
// - 上下文感知：利用完整文档理解术语和结构，但不复述
const SYSTEM_PROMPT = `You are an academic document HTML editor. The user selected a fragment in a rendered HTML document and gave an edit instruction. Return ONLY the modified HTML fragment that will replace the selection in the DOM.

## Output Rules
1. Output the replacement HTML fragment only — no full document, no explanation, no markdown code blocks.
2. Language: match the language of the selected fragment exactly. If the selection is English, respond in English; if Chinese, respond in Chinese.
3. Respect the edit mode:
   - content_edit: return replacement content for the selection only. Preserve the target container shell.
   - structure_edit: return the full replacement for the provided target container. You may change its internal structure, or replace it with another block-level structure, but never return the entire document unless the target itself is the document root.
4. Granularity: match the scope of the active edit mode. A phrase → phrase-level markup. A paragraph → paragraph-level. A table cell → cell content only in content_edit.
5. Preserve surrounding context: maintain list nesting, table alignment, heading hierarchy, emphasis, and content density of the original.

## Allowed HTML
Tags: article, section, div, header, footer, h1, h2, h3, h4, p, span, strong, em, u, sub, sup, br, ol, ul, li, table, thead, tbody, tr, th, td, blockquote, hr, img, figure, figcaption.
Attributes: data-doc-type, data-section, data-answer-space, data-question, data-points, data-difficulty, data-options, data-rubric, data-instance-id, data-source-exercise-id, data-question-type, type, src, alt, colspan, rowspan.
Forbidden: style, class, id, script, onclick, or any attribute not listed above.

## Context Awareness
You will receive the full document HTML and metadata as reference. Use them to:
- Match subject-specific terminology and conventions
- Maintain consistent numbering, heading style, and formatting patterns
- Understand the document type (worksheet, rubric, lesson-plan, etc.)
Do NOT reproduce the full document. Only output the replacement for the selection.

## Special Content
- Math (KaTeX HTML): preserve existing <span class="katex"> markup unchanged unless the instruction specifically asks to modify the formula. For new formulas, use LaTeX notation wrapped in the same KaTeX structure as surrounding content.
- Tables: if the selection is within a cell, return cell-level content only. Do not regenerate the entire table.

## Structural Safety
- In content_edit, do not output article, section, table, tr, td, th, or other outer containers unless the selected fragment already consists exactly of that container's inner content.
- In structure_edit, use the provided target container as the only scope you may replace.
- Never include explanation text, JSON, XML, markdown fences, or comments.
- If the input contains question identity metadata such as data-instance-id, data-source-exercise-id, or data-question-type, preserve them exactly on the corresponding question containers unless the user explicitly asks to delete that question block.

## Conflict Resolution
If the user instruction conflicts with these rules (e.g., "convert to Markdown"), prioritize these rules and fulfill the intent within the allowed HTML constraints.`;

/**
 * 从 LLM 响应中提取纯 HTML 内容。
 * LLM 可能会用 markdown 代码块包裹，需要剥离。
 */
function extractHtmlFromResponse(raw: string): string {
  const trimmed = raw.trim();

  // 匹配 ```html ... ``` 或 ``` ... ``` 代码块
  const codeBlockMatch = trimmed.match(
    /^```(?:html|HTML)?\s*\n?([\s\S]*?)\n?\s*```$/,
  );
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  return trimmed;
}

export async function POST(request: Request) {
  const { supabase, teacherId, authBypass, errorMessage, errorStatus } =
    await getTeacherContext();
  if (!teacherId) {
    return jsonError(
      "UNAUTHORIZED",
      errorMessage ?? (authBypass ? "未找到可用教师账号" : "未授权访问"),
      errorStatus ?? (authBypass ? 400 : 401),
    );
  }

  // ── 配额准入检查 ──────────────────────────────────────
  const quotaAdmission = await checkQuotaAdmissionSafe(supabase, {
    teacherId,
    action: "doc_ai_edit",
  });
  if (quotaAdmission && !quotaAdmission.allowed) {
    return jsonError(
      "QUOTA_EXHAUSTED",
      "当前测试期使用量已达上限，请等待下个周期重置后继续。",
      403,
      buildQuotaExhaustedDetails(quotaAdmission),
      buildQuotaHeaders(quotaAdmission, { snapshot: "admission" }),
    );
  }

  const quotaIdempotencyKey = `doc-edit:${randomUUID()}`;

  try {
    const rawBody = await parseJsonBody<unknown>(request);
    const body = editHtmlRequestSchema.parse(rawBody);

    // 构建结构化 user prompt，用 XML 标签明确分隔各部分
    const parts: string[] = [];

    // 1. 选区 —— 这是 LLM 必须修改的目标
    parts.push(
      `<edit-mode>${body.editMode}</edit-mode>`,
    );

    parts.push(
      `<selection${body.contextTag ? ` container="${body.contextTag}"` : ""}${body.documentType ? ` doc-type="${body.documentType}"` : ""}>`,
      body.selectedHtml,
      "</selection>",
    );

    // 2. 指令 —— 用户要求
    parts.push(`<instruction>${body.instruction}</instruction>`);

    // 3. 容器上下文 —— 选区的直接父级语义容器
    if (body.contextHtml) {
      parts.push(
        "<context-container>",
        body.contextHtml,
        "</context-container>",
      );
    }

    if (body.targetContainerHtml) {
      parts.push(
        `<target-container${body.targetContainerTag ? ` tag="${body.targetContainerTag}"` : ""}>`,
        body.targetContainerHtml,
        "</target-container>",
      );
    }

    // 4. 完整文档 —— 全局语境参考（最大，放最后以利用 Claude 的 recency bias）
    if (body.fullDocumentHtml) {
      parts.push(
        "<full-document>",
        body.fullDocumentHtml,
        "</full-document>",
      );
    }

    // 5. 文档元信息
    if (body.documentMeta && Object.keys(body.documentMeta).length > 0) {
      parts.push(
        "<document-meta>",
        JSON.stringify(body.documentMeta),
        "</document-meta>",
      );
    }

    const userPrompt = parts.join("\n");

    const { text } = await generateGatewayText({
      model: DOC_EDIT_MODEL_ID,
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      temperature: 0.3,
      maxOutputTokens: 8192,
      maxRetries: 2,
      abortSignal: request.signal,
      timeout: 50_000,
    });

    const html = extractHtmlFromResponse(text);

    if (!html) {
      return jsonError(
        "INTERNAL_ERROR",
        "AI 未返回有效的 HTML 内容",
        500,
      );
    }

    // ── 配额扣费（非流式，成功响应前扣费）───────────────
    await finalizeQuotaSpendSafe(supabase, {
      teacherId,
      action: "doc_ai_edit",
      idempotencyKey: quotaIdempotencyKey,
      metadata: { route: "/api/doc/edit-html" },
    });

    return NextResponse.json({ html });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return jsonError("VALIDATION_ERROR", "请求体不是合法 JSON", 400);
    }
    if (error instanceof z.ZodError) {
      return jsonError(
        "VALIDATION_ERROR",
        "请求参数不合法",
        400,
        error.flatten(),
      );
    }
    return jsonErrorFromUnknown(error, "文档编辑失败", 500);
  }
}
