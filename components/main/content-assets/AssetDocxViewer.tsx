"use client";

import { useMemo } from "react";
import { sanitizeDocHtml } from "@/lib/doc-engine/sanitize";

type AssetDocxViewerProps = {
  html: string;
};

export default function AssetDocxViewer({ html }: AssetDocxViewerProps) {
  const sanitizedHtml = useMemo(() => sanitizeDocHtml(html), [html]);

  if (!sanitizedHtml) return null;

  return (
    <div className="flex h-full w-full flex-1 overflow-auto pr-1">
      <div className="mx-auto w-full max-w-[760px] pb-6">
        <div
          className="docx-viewer prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-headings:font-semibold prose-h1:text-[22px] prose-h1:mt-8 prose-h1:mb-4 prose-h2:text-[18px] prose-h2:mt-6 prose-h2:mb-3 prose-h3:text-[15px] prose-h3:mt-5 prose-h3:mb-2 prose-p:text-[14px] prose-p:leading-[1.7] prose-a:text-primary prose-table:text-[13px] prose-img:rounded-lg prose-img:shadow-sm"
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      </div>
    </div>
  );
}
