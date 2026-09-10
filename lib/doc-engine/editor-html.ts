import {
  extractArticleBodyHtml,
  extractArticleDocumentType,
} from "@/lib/doc-engine/document-article-html";
import { normalizeMathHtml } from "@/lib/doc-engine/math-core";
import { sanitizeDocHtml } from "@/lib/doc-engine/sanitize";

const INTERNAL_LESSON_PLAN_PHASE_PARAGRAPH_PATTERN =
  /<p>\s*(?:<strong>\s*)?阶段：(?:\s*<\/strong>)?\s*(?:goals|warm-up|instruction|practice|summary|extension)\s*<\/p>/gi;
const LEGACY_ESCAPED_BLANK_PATTERN = /(?:\\<em>\\<\/em>)+/g;

export function stripInternalLessonPlanPhaseParagraphs(html: string) {
  return html.replace(INTERNAL_LESSON_PLAN_PHASE_PARAGRAPH_PATTERN, "");
}

function repairLegacyMarkdownHtmlArtifacts(html: string) {
  return html
    .replace(LEGACY_ESCAPED_BLANK_PATTERN, (match) => {
      const pairCount = match.match(/\\<em>\\<\/em>/g)?.length ?? 0;
      return "_".repeat(pairCount * 2);
    })
    .replace(/&amp;nbsp;/g, "&nbsp;")
    .replace(/&amp;emsp;/g, " ");
}

export function normalizeDocumentBodyHtml(documentType: string, bodyHtml: string) {
  const repairedBody = repairLegacyMarkdownHtmlArtifacts(bodyHtml);
  const sanitizedBody = sanitizeDocHtml(repairedBody).trim();
  const normalizedLessonPlanBody =
    documentType === "lesson-plan"
      ? stripInternalLessonPlanPhaseParagraphs(sanitizedBody).trim()
      : sanitizedBody;
  const normalizedMathBody = normalizeMathHtml(normalizedLessonPlanBody).trim();

  return documentType === "rubric" && !/data-rubric=/i.test(normalizedMathBody)
    ? normalizedMathBody.replace(/<table\b/i, '<table data-rubric="true"')
    : normalizedMathBody;
}

export function normalizeDocumentHtml(html: string) {
  const trimmed = html.trim();
  if (!trimmed) return "";
  const documentType = extractArticleDocumentType(trimmed);
  const bodyHtml = extractArticleBodyHtml(trimmed);
  const normalizedBody = normalizeDocumentBodyHtml(documentType, bodyHtml);
  return `<article data-doc-type="${documentType}">${normalizedBody}</article>`;
}
