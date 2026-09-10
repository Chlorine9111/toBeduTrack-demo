"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@heroui/react";

type EditorAIBlockProps = {
  suggestion: string;
  onApply?: () => void;
  onDismiss?: () => void;
};

/**
 * Inline AI suggestion card that appears within the document flow.
 * Matches the HTML mockup's gradient card with left blue accent.
 */
export default function EditorAIBlock({
  suggestion,
  onApply,
  onDismiss,
}: EditorAIBlockProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-divider bg-linear-to-br from-default-100 to-default-100/50 p-6">
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 h-full w-1 bg-[#0B6E99]/30" />

      {/* Header */}
      <div className="mb-3 flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold tracking-tight text-foreground">
          AI 助手
        </span>
      </div>

      {/* Suggestion content */}
      <p className="text-sm italic leading-relaxed text-default-500">
        &ldquo;{suggestion}&rdquo;
      </p>

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          onPress={onApply}
          className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-foreground/90"
        >
          采纳建议
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onPress={onDismiss}
          className="rounded-lg border border-divider bg-white px-3 py-1.5 text-xs font-medium text-default-500 transition-colors hover:bg-default-100"
        >
          忽略
        </Button>
      </div>
    </div>
  );
}
