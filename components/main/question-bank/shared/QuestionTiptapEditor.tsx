"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import QuestionContentWithImages from "@/components/shared/QuestionContentWithImages";
import { buildMarkdownContentHtml } from "@/lib/doc-engine/document-article-html";
import { createDocEditorExtensions } from "@/lib/doc-engine/tiptap-extensions";
import { cn } from "@/lib/utils";

type QuestionTiptapEditorProps = {
  content: string;
  editable: boolean;
  onUpdate: (text: string) => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
  onFocus?: () => void;
  className?: string;
  contentClassName?: string;
  placeholderText?: string;
  editingAppearance?: "surface" | "seamless";
};

function normalizeMarkdownishText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeTableCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, "<br>");
}

function serializeTable(element: HTMLTableElement) {
  const rows = Array.from(element.querySelectorAll("tr"))
    .map((row) =>
      Array.from(row.children)
        .filter(
          (cell): cell is HTMLTableCellElement =>
            cell instanceof HTMLTableCellElement,
        )
        .map((cell) =>
          escapeTableCell(
            normalizeMarkdownishText(
              Array.from(cell.childNodes).map(nodeToMarkdownish).join(""),
            ),
          ),
        ),
    )
    .filter((row) => row.length > 0 && row.some((cell) => cell.length > 0));

  if (rows.length === 0) {
    return "";
  }

  const width = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) =>
    Array.from({ length: width }, (_, index) => row[index] ?? ""),
  );
  const header = normalizedRows[0];
  const divider = header.map(() => "---");
  const body = normalizedRows.slice(1);

  return [
    `| ${header.join(" | ")} |`,
    `| ${divider.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function serializeList(element: HTMLElement, ordered: boolean) {
  const items = Array.from(element.querySelectorAll(":scope > li"))
    .map((item) =>
      normalizeMarkdownishText(
        Array.from(item.childNodes).map(nodeToMarkdownish).join(""),
      ),
    )
    .filter(Boolean);

  if (items.length === 0) {
    return "";
  }

  return items
    .map((item, index) => (ordered ? `${index + 1}. ${item}` : `- ${item}`))
    .join("\n");
}

function nodeToMarkdownish(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (!(node instanceof HTMLElement)) {
    return "";
  }

  const tag = node.tagName.toLowerCase();
  const inner = Array.from(node.childNodes).map(nodeToMarkdownish).join("");

  if (tag === "br") return "\n";
  if (tag === "math-inline") {
    const latex = node.getAttribute("data-latex")?.trim() ?? "";
    return latex ? `$${latex}$` : "";
  }
  if (tag === "math-display") {
    const latex = node.getAttribute("data-latex")?.trim() ?? "";
    return latex ? `\n$$${latex}$$\n` : "";
  }
  if (tag === "img") {
    const src = node.getAttribute("src")?.trim() ?? "";
    const alt = node.getAttribute("alt")?.trim() ?? "附图";
    return src ? `![${alt}](${src})` : "";
  }

  switch (tag) {
    case "strong":
    case "b":
      return `**${inner}**`;
    case "em":
    case "i":
      return `*${inner}*`;
    case "code":
      return `\`${inner}\``;
    case "blockquote": {
      const lines = normalizeMarkdownishText(inner).split("\n").filter(Boolean);
      return lines.map((line) => `> ${line}`).join("\n");
    }
    case "ul":
      return `\n${serializeList(node, false)}\n`;
    case "ol":
      return `\n${serializeList(node, true)}\n`;
    case "table":
      return `\n${serializeTable(node as HTMLTableElement)}\n`;
    case "p": {
      const text = normalizeMarkdownishText(inner);
      return text ? `${text}\n\n` : "\n";
    }
    case "div":
    case "section":
    case "article": {
      const text = normalizeMarkdownishText(inner);
      return text ? `${text}\n\n` : "";
    }
    case "li":
      return normalizeMarkdownishText(inner);
    default:
      return inner;
  }
}

function htmlToQuestionMarkdown(html: string) {
  if (!html.trim()) {
    return "";
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const markdown = Array.from(doc.body.childNodes).map(nodeToMarkdownish).join("");
  return normalizeMarkdownishText(markdown);
}

function markdownToQuestionHtml(content: string) {
  const html = buildMarkdownContentHtml(content || "");
  if (!html.trim()) {
    return "<p></p>";
  }
  return html;
}

export default function QuestionTiptapEditor({
  content,
  editable,
  onUpdate,
  onEditStart,
  onEditEnd,
  onFocus,
  className,
  contentClassName,
  placeholderText = "双击编辑内容",
  editingAppearance = "surface",
}: QuestionTiptapEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const syncedContentRef = useRef(content);
  const serializedContent = useMemo(() => markdownToQuestionHtml(content), [content]);

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: createDocEditorExtensions({
      placeholderText,
      documentType: "worksheet",
    }),
    content: serializedContent,
    editorProps: {
      attributes: {
        class:
          "min-h-[72px] whitespace-pre-wrap break-words text-[15px] leading-8 text-[#37352F] outline-none",
      },
    },
  });

  const commitContent = useCallback(() => {
    if (!editor) {
      return;
    }
    const nextContent = htmlToQuestionMarkdown(editor.getHTML());
    syncedContentRef.current = nextContent;
    if (nextContent !== content) {
      onUpdate(nextContent);
    }
  }, [content, editor, onUpdate]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.setEditable(editable);
    if (editable) {
      window.setTimeout(() => {
        editor.commands.focus("end");
      }, 0);
    }
  }, [editable, editor]);

  useEffect(() => {
    if (!editor || editable) {
      return;
    }
    if (content === syncedContentRef.current) {
      return;
    }
    editor.commands.setContent(markdownToQuestionHtml(content), {
      emitUpdate: false,
    });
    syncedContentRef.current = content;
  }, [content, editable, editor]);

  useEffect(() => {
    if (!editable) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        commitContent();
        onEditEnd?.();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      commitContent();
      onEditEnd?.();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [commitContent, editable, onEditEnd]);

  return (
    <div
      ref={containerRef}
      onClick={() => onFocus?.()}
      onDoubleClick={() => {
        onFocus?.();
        if (!editable) {
          onEditStart?.();
        }
      }}
      className={cn(
        "rounded-2xl transition",
        editable &&
          editingAppearance === "surface" &&
          "bg-white ring-1 ring-[#d7d1c5] shadow-[0_10px_24px_rgba(15,23,42,0.05)]",
        className,
      )}
    >
      {editable ? (
        <EditorContent
          editor={editor}
          className={cn(
            "min-h-[72px] cursor-text rounded-2xl px-0 py-0",
            "[&_.ProseMirror]:min-h-[72px] [&_.ProseMirror]:outline-none",
            "[&_.ProseMirror_p]:my-0 [&_.ProseMirror_p+ p]:mt-4",
            "[&_img]:my-3 [&_img]:max-h-[220px] [&_img]:w-full [&_img]:rounded-xl [&_img]:border [&_img]:border-slate-200 [&_img]:bg-white [&_img]:object-contain",
            "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-xl",
            "[&_td]:border [&_td]:border-slate-200 [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-slate-200 [&_th]:px-3 [&_th]:py-2",
            className,
            contentClassName,
          )}
        />
      ) : (
        <div
          className={cn(
            "deskmate-math-text min-h-[72px] cursor-text rounded-2xl px-0 py-0 text-[15px] leading-8 text-[#37352F]",
            "[&_p]:my-0 [&_p+p]:mt-4",
            "[&_img]:my-3 [&_img]:max-h-[220px] [&_img]:w-full [&_img]:rounded-xl [&_img]:border [&_img]:border-slate-200 [&_img]:bg-white [&_img]:object-contain",
            "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-xl",
            "[&_td]:border [&_td]:border-slate-200 [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-slate-200 [&_th]:px-3 [&_th]:py-2",
            className,
            contentClassName,
          )}
        >
          <QuestionContentWithImages
            content={content}
            className="space-y-3"
            textClassName="break-words text-[15px] leading-8 text-[#37352F] [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-200 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_ol]:my-2 [&_ol]:pl-5 [&_p]:my-0 [&_p+p]:mt-4 [&_table]:w-full [&_td]:align-top [&_th]:align-top [&_ul]:my-2 [&_ul]:pl-5"
            figureClassName="rounded-xl border border-slate-200 bg-white"
            imageClassName="my-3 max-h-[220px] w-full rounded-xl border border-slate-200 bg-white object-contain"
          />
        </div>
      )}
    </div>
  );
}
