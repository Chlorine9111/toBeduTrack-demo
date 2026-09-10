"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import RichMarkdown from "@/components/shared/RichMarkdown";
import { cn } from "@/lib/utils";

type StreamingMarkdownPreviewProps = {
  content: string;
  className?: string;
};

type DraftState = {
  source: string;
  committedBlocks: string[];
  tail: string;
};

const INLINE_DOLLAR_PATTERN = /(?<!\\)\$(?!\$)/g;
const DISPLAY_DOLLAR_PATTERN = /\$\$/g;
const PAREN_OPEN_PATTERN = /\\\(/g;
const PAREN_CLOSE_PATTERN = /\\\)/g;
const BRACKET_OPEN_PATTERN = /\\\[/g;
const BRACKET_CLOSE_PATTERN = /\\\]/g;
const CODE_FENCE_PATTERN = /```/g;
const TABLE_SEPARATOR_PATTERN =
  /^\|?(?:\s*:?-{3,}:?\s*\|)+(?:\s*:?-{3,}:?\s*\|?)$/;

function countMatches(text: string, pattern: RegExp) {
  return Array.from(text.matchAll(pattern)).length;
}

function isBalancedMarkdownBlock(text: string) {
  if (!text.trim()) return true;

  if (countMatches(text, CODE_FENCE_PATTERN) % 2 !== 0) {
    return false;
  }
  if (countMatches(text, DISPLAY_DOLLAR_PATTERN) % 2 !== 0) {
    return false;
  }
  if (countMatches(text, INLINE_DOLLAR_PATTERN) % 2 !== 0) {
    return false;
  }
  if (countMatches(text, PAREN_OPEN_PATTERN) !== countMatches(text, PAREN_CLOSE_PATTERN)) {
    return false;
  }
  if (countMatches(text, BRACKET_OPEN_PATTERN) !== countMatches(text, BRACKET_CLOSE_PATTERN)) {
    return false;
  }

  return true;
}

function isTableSeparatorLine(line: string) {
  return TABLE_SEPARATOR_PATTERN.test(line.trim());
}

function isTableBlockStart(lines: string[], index: number) {
  const current = lines[index]?.trim() ?? "";
  const next = lines[index + 1]?.trim() ?? "";
  if (!current || !next) return false;
  return current.includes("|") && isTableSeparatorLine(next);
}

function looksLikeMarkdownTableBlock(text: string) {
  const lines = text.trim().split("\n");
  return lines.length >= 2 && isTableBlockStart(lines, 0);
}

function consumeClosedBlocks(buffer: string): {
  committedBlocks: string[];
  tail: string;
} {
  if (!buffer.trim()) {
    return { committedBlocks: [], tail: "" };
  }

  const lines = buffer.split("\n");
  const committedBlocks: string[] = [];
  let currentLines: string[] = [];
  let cursor = 0;

  const flushCurrentBlock = () => {
    const block = currentLines.join("\n").trim();
    if (!block) return true;
    if (!isBalancedMarkdownBlock(block)) {
      return false;
    }
    committedBlocks.push(block);
    currentLines = [];
    return true;
  };

  while (cursor < lines.length) {
    if (isTableBlockStart(lines, cursor)) {
      if (!flushCurrentBlock()) {
        return {
          committedBlocks,
          tail: [currentLines.join("\n"), ...lines.slice(cursor)].filter(Boolean).join("\n").trim(),
        };
      }
      currentLines = [];

      const tableLines = [lines[cursor] ?? "", lines[cursor + 1] ?? ""];
      cursor += 2;
      while (cursor < lines.length) {
        const next = lines[cursor] ?? "";
        if (!next.trim() || !next.includes("|")) {
          break;
        }
        tableLines.push(next);
        cursor += 1;
      }

      if (cursor >= lines.length && !buffer.endsWith("\n")) {
        return {
          committedBlocks,
          tail: tableLines.join("\n").trim(),
        };
      }

      committedBlocks.push(tableLines.join("\n").trim());
      while (cursor < lines.length && !(lines[cursor]?.trim())) {
        cursor += 1;
      }
      continue;
    }

    const line = lines[cursor] ?? "";
    if (!line.trim()) {
      if (!flushCurrentBlock()) {
        return {
          committedBlocks,
          tail: [currentLines.join("\n"), ...lines.slice(cursor)].filter(Boolean).join("\n").trim(),
        };
      }
      currentLines = [];
      while (cursor < lines.length && !(lines[cursor]?.trim())) {
        cursor += 1;
      }
      continue;
    }

    currentLines.push(line);
    cursor += 1;
  }

  return {
    committedBlocks,
    tail: currentLines.join("\n").trim(),
  };
}

const MarkdownBlock = memo(function MarkdownBlock(props: {
  content: string;
  className?: string;
}) {
  return (
    <RichMarkdown
      content={props.content}
      className={cn("prose-p:my-1 prose-ul:my-2 prose-ol:my-2 prose-li:my-0", props.className)}
    />
  );
});

export default function StreamingMarkdownPreview(
  props: StreamingMarkdownPreviewProps,
) {
  const [draftState, setDraftState] = useState<DraftState>(() => {
    const initial = consumeClosedBlocks(props.content);
    return {
      source: props.content,
      committedBlocks: initial.committedBlocks,
      tail: initial.tail,
    };
  });
  const previousSourceRef = useRef(props.content);

  useEffect(() => {
    const nextSource = props.content;
    const previousSource = previousSourceRef.current;
    previousSourceRef.current = nextSource;

    setDraftState((prev) => {
      if (!nextSource.trim()) {
        return { source: nextSource, committedBlocks: [], tail: "" };
      }

      if (nextSource.startsWith(previousSource)) {
        const appended = nextSource.slice(previousSource.length);
        const deltaBuffer = `${prev.tail}${appended}`;
        const nextBlocks = consumeClosedBlocks(deltaBuffer);
        return {
          source: nextSource,
          committedBlocks: [...prev.committedBlocks, ...nextBlocks.committedBlocks],
          tail: nextBlocks.tail,
        };
      }

      const rebuilt = consumeClosedBlocks(nextSource);
      return {
        source: nextSource,
        committedBlocks: rebuilt.committedBlocks,
        tail: rebuilt.tail,
      };
    });
  }, [props.content]);

  const tailIsRenderable = useMemo(
    () =>
      Boolean(draftState.tail.trim()) &&
      !looksLikeMarkdownTableBlock(draftState.tail) &&
      isBalancedMarkdownBlock(draftState.tail),
    [draftState.tail],
  );

  if (!props.content.trim()) {
    return null;
  }

  return (
    <div className={cn("space-y-3", props.className)}>
      {draftState.committedBlocks.map((block, index) => (
        <MarkdownBlock
          key={`${index}:${block.slice(0, 24)}`}
          content={block}
        />
      ))}
      {draftState.tail.trim() ? (
        tailIsRenderable ? (
          <MarkdownBlock content={draftState.tail} />
        ) : (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {draftState.tail}
          </div>
        )
      ) : null}
    </div>
  );
}
