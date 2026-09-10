"use client";

import { useMemo } from "react";
import RichMarkdown from "@/components/shared/RichMarkdown";
import { normalizeArtifactRenderableContent } from "@/lib/agent/artifact-text";
import { cn } from "@/lib/utils";

type ArtifactMarkdownViewProps = {
  content: string;
  className?: string;
};

export default function ArtifactMarkdownView({ content, className }: ArtifactMarkdownViewProps) {
  const normalized = useMemo(
    () => normalizeArtifactRenderableContent(content),
    [content],
  );

  if (!normalized.content) {
    return null;
  }

  if (normalized.renderMode === "plain-text-fallback") {
    return (
      <div
        data-testid="agent-artifact-markdown"
        className={cn("space-y-3 text-sm text-foreground", className)}
      >
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900">
          检测到正文格式异常，已按原始文本显示，避免 Canvas 空白或渲染失败。
        </div>
        <pre
          data-testid="agent-artifact-plain-text-fallback"
          className="overflow-x-auto whitespace-pre-wrap break-words rounded-2xl border border-divider bg-surface-secondary px-4 py-4 font-mono text-sm leading-7 text-foreground"
        >
          {normalized.content}
        </pre>
      </div>
    );
  }

  return (
    <div data-testid="agent-artifact-markdown">
      <RichMarkdown
        content={normalized.content}
        className={cn(
          "max-w-none text-sm leading-7 text-foreground",
          "[&_a]:text-blue-700 [&_a]:underline",
          "[&_blockquote]:rounded-r-2xl [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:bg-surface-secondary [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-foreground",
          "[&_h1]:mt-2 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight",
          "[&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight",
          "[&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold",
          "[&_h4]:mt-5 [&_h4]:text-base [&_h4]:font-semibold",
          "[&_hr]:my-6 [&_hr]:border-divider",
          "[&_img]:rounded-2xl [&_img]:border [&_img]:border-divider",
          className,
        )}
      />
    </div>
  );
}
