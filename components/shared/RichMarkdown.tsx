"use client";

import { useMemo } from "react";
import DOMPurify from "dompurify";
import { Marked } from "marked";
import "katex/dist/katex.min.css";
import {
  expandHtmlMathMarkup,
  normalizeMathHtml,
} from "@/lib/doc-engine/html-math";
import { cn } from "@/lib/utils";

type RichMarkdownProps = {
  content: string;
  className?: string;
};

const ALLOWED_TAGS = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
];

const ALLOWED_ATTR = ["alt", "class", "href", "rel", "src", "target", "title"];
const RICH_MARKDOWN_ALLOWED_ATTR = [
  ...ALLOWED_ATTR,
  "align",
  "colspan",
  "rowspan",
  "scope",
];
const markdownRenderer = new Marked({
  gfm: true,
  breaks: true,
});

export function renderRichMarkdown(content: string) {
  if (!content.trim()) return "";

  const rawHtml = markdownRenderer.parse(content) as string;

  const sanitized = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: RICH_MARKDOWN_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });

  return expandHtmlMathMarkup(normalizeMathHtml(sanitized));
}

export default function RichMarkdown(props: RichMarkdownProps) {
  const html = useMemo(() => renderRichMarkdown(props.content), [props.content]);

  if (!html) {
    return null;
  }

  return (
    <div
      className={cn(
        "deskmate-doc-preview prose prose-slate max-w-none text-sm leading-7 prose-headings:tracking-tight prose-p:my-2 prose-pre:rounded-2xl prose-pre:bg-slate-950 prose-pre:p-4 prose-code:rounded prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.9em] prose-code:before:content-none prose-code:after:content-none [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-2xl [&_table]:border [&_table]:border-divider [&_thead]:bg-slate-50 [&_th]:border [&_th]:border-divider [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-divider [&_td]:px-3 [&_td]:py-2",
        props.className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
