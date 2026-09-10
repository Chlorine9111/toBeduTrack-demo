"use client";

import { useMemo } from "react";
import { marked } from "marked";

type AssetTextViewerProps = {
  rawText: string;
  fileType?: string | null;
  fileName?: string | null;
};

function isMarkdown(fileType?: string | null, fileName?: string | null) {
  if (fileType && fileType.toLowerCase().includes("markdown")) return true;
  if (fileName && /\.md$/i.test(fileName)) return true;
  return false;
}

export default function AssetTextViewer({
  rawText,
  fileType,
  fileName,
}: AssetTextViewerProps) {
  const html = useMemo(() => {
    if (!isMarkdown(fileType, fileName)) return null;
    return marked.parse(rawText, { async: false }) as string;
  }, [rawText, fileType, fileName]);

  if (html) {
    return (
      <div className="h-full overflow-auto">
        <div
          className="prose prose-sm max-w-none p-4 text-foreground prose-headings:text-foreground prose-a:text-primary"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto whitespace-pre-wrap p-4 text-sm leading-relaxed text-foreground">
      {rawText}
    </div>
  );
}
