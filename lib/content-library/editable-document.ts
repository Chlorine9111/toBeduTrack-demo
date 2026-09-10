import {
  buildLessonPlanDocumentFromStructured,
  buildRubricDocumentFromDetail,
} from "@/lib/doc-engine/adapters";
import {
  buildDocumentArticleHtml,
  buildMarkdownArticleHtml,
} from "@/lib/doc-engine/document-article-html";
import { normalizeDocumentHtml } from "@/lib/doc-engine/editor-html";
import type { ContentLibraryDetail } from "@/lib/content-library/types";

function resolveMarkdownDocumentType(item: ContentLibraryDetail) {
  switch (item.contentType) {
    case "lesson_plan":
      return "lesson-plan";
    case "question":
      return "exercises";
    case "rubric":
      return "rubric";
    default:
      return "notes";
  }
}

function resolveMarkdownEyebrow(item: ContentLibraryDetail) {
  switch (item.contentType) {
    case "lesson_plan":
      return "教案文档";
    case "question":
      return "题库文档";
    case "rubric":
      return "评分标准";
    case "pbl":
      return "PBL 项目文档";
    default:
      return "教学文档";
  }
}

export function resolveContentLibraryDocumentKind(item: ContentLibraryDetail) {
  switch (item.contentType) {
    case "lesson_plan":
      return "lesson-plan";
    case "question":
      return "exercises";
    case "rubric":
      return "rubric";
    case "pbl":
      return "pbl";
    default:
      return "notes";
  }
}

export function buildEditableContentLibraryHtml(item: ContentLibraryDetail) {
  const editedHtml =
    typeof item.metadata?.documentHtml === "string" ? item.metadata.documentHtml : "";
  if (editedHtml.trim()) {
    return normalizeDocumentHtml(editedHtml);
  }

  if (item.snapshot.kind === "rubric") {
    return normalizeDocumentHtml(
      buildDocumentArticleHtml(buildRubricDocumentFromDetail(item.snapshot.rubric)) || "",
    );
  }

  if (item.snapshot.kind === "lesson_plan_document") {
    return normalizeDocumentHtml(
      buildDocumentArticleHtml(
        buildLessonPlanDocumentFromStructured(item.snapshot.lessonPlan),
      ) || "",
    );
  }

  if (item.snapshot.kind === "lesson_plan_markdown") {
    return normalizeDocumentHtml(
      buildMarkdownArticleHtml({
        documentType: "lesson-plan",
        markdown: item.snapshot.markdown,
        title: item.displayTitle,
        eyebrow: "教案文档",
      }) || "",
    );
  }

  if (item.snapshot.kind === "markdown") {
    return normalizeDocumentHtml(
      buildMarkdownArticleHtml({
        documentType: resolveMarkdownDocumentType(item),
        markdown: item.snapshot.markdown,
        title: item.displayTitle,
        eyebrow: resolveMarkdownEyebrow(item),
        subtitle: item.note ?? undefined,
      }) || "",
    );
  }

  if (item.snapshot.kind === "html") {
    return normalizeDocumentHtml(item.snapshot.html || "");
  }

  return normalizeDocumentHtml("");
}
