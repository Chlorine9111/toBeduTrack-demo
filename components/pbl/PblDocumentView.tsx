"use client";

import RichMarkdown from "@/components/shared/RichMarkdown";

type PblDocumentViewProps = {
  markdown: string;
};

export function PblDocumentView({ markdown }: PblDocumentViewProps) {
  return (
    <article className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white px-6 py-8 shadow-xs sm:px-10">
      <RichMarkdown
        content={markdown}
        className="prose-headings:scroll-mt-24 prose-table:block prose-table:overflow-x-auto"
      />
    </article>
  );
}
