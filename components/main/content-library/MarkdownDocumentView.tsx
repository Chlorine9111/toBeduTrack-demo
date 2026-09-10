"use client";

import RichMarkdown from "@/components/shared/RichMarkdown";
import {
  buildMarkdownArticleHtml,
} from "@/lib/doc-engine/document-article-html";
import { normalizeDocumentHtml } from "@/lib/doc-engine/editor-html";
import { useAppI18n } from "@/lib/app-i18n/provider";
import type { ContentLibraryDetail } from "@/lib/content-library/types";
import { EditableContentLibraryDocument } from "./EditableContentLibraryDocument";

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

function resolveMarkdownEyebrow(item: ContentLibraryDetail, isZh: boolean) {
  switch (item.contentType) {
    case "lesson_plan":
      return isZh ? "教案文档" : "Lesson Plan";
    case "question":
      return isZh ? "题库文档" : "Question Bank";
    case "rubric":
      return isZh ? "评分标准" : "Rubric";
    case "pbl":
      return isZh ? "PBL 项目文档" : "PBL Project";
    default:
      return isZh ? "教学文档" : "Teaching Notes";
  }
}

export function MarkdownDocumentView({
  item,
  onItemChange,
}: {
  item: ContentLibraryDetail;
  onItemChange?: (item: ContentLibraryDetail) => void;
}) {
  const { isZh } = useAppI18n();
  const snapshot = item.snapshot.kind === "markdown" ? item.snapshot : null;
  if (!snapshot) return null;

  const editedHtml =
    typeof item.metadata?.documentHtml === "string" ? item.metadata.documentHtml : "";
  const initialHtml = normalizeDocumentHtml(
    editedHtml ||
      buildMarkdownArticleHtml({
        documentType: resolveMarkdownDocumentType(item),
        markdown: snapshot.markdown,
        title: item.displayTitle,
        eyebrow: resolveMarkdownEyebrow(item, isZh),
        subtitle: item.note ?? undefined,
      }),
  );

  if (!initialHtml) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <RichMarkdown content={snapshot.markdown} />
      </div>
    );
  }

  return (
    <EditableContentLibraryDocument
      item={item}
      html={initialHtml}
      onItemChange={onItemChange}
    />
  );
}
