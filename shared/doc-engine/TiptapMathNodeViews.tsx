"use client";

import { useCallback, useMemo, type MouseEvent } from "react";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import "katex/dist/katex.min.css";
import { renderLatexToHtml } from "@/lib/doc-engine/math-core";
import { cn } from "@/lib/utils";

export type MathNodeEditRequest = {
  pos: number;
  latex: string;
  displayMode: boolean;
  nodeName: "docInlineMath" | "docDisplayMath";
  applyLatex: (nextLatex: string) => void;
  focusEditor: () => void;
};

function MathNodeView(
  props: NodeViewProps & {
    displayMode: boolean;
    onRequestMathEdit?: (request: MathNodeEditRequest) => void;
  },
) {
  const latex = `${props.node.attrs.latex ?? ""}`.trim();
  const rendered = useMemo(
    () => renderLatexToHtml(latex || " ", props.displayMode),
    [latex, props.displayMode],
  );

  const handleDoubleClick = useCallback(() => {
    const position = typeof props.getPos === "function" ? props.getPos() : null;
    if (typeof position !== "number") return;
    props.onRequestMathEdit?.({
      pos: position,
      latex,
      displayMode: props.displayMode,
      nodeName: props.displayMode ? "docDisplayMath" : "docInlineMath",
      applyLatex: (nextLatex: string) => {
        props.updateAttributes({ latex: nextLatex });
      },
      focusEditor: () => {
        props.editor.chain().focus().setNodeSelection(position).run();
      },
    });
  }, [latex, props]);

  if (props.displayMode) {
    return (
      <NodeViewWrapper
        className={cn(
          "my-4 cursor-pointer overflow-x-auto rounded-xl px-2 py-2",
          props.selected ? "ring-2 ring-neutral-300" : "",
        )}
        data-doc-math="display"
        data-latex={latex}
        contentEditable={false}
        onDoubleClick={(event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          handleDoubleClick();
        }}
      >
        <div dangerouslySetInnerHTML={{ __html: rendered }} />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="span"
      className={cn(
        "inline-flex max-w-full cursor-pointer align-middle",
        props.selected ? "rounded-md ring-2 ring-neutral-300" : "",
      )}
      data-doc-math="inline"
      data-latex={latex}
      contentEditable={false}
      onDoubleClick={(event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        handleDoubleClick();
      }}
    >
      <span dangerouslySetInnerHTML={{ __html: rendered }} />
    </NodeViewWrapper>
  );
}

export function InlineMathNodeView(
  props: NodeViewProps & {
    onRequestMathEdit?: (request: MathNodeEditRequest) => void;
  },
) {
  return <MathNodeView {...props} displayMode={false} />;
}

export function DisplayMathNodeView(
  props: NodeViewProps & {
    onRequestMathEdit?: (request: MathNodeEditRequest) => void;
  },
) {
  return <MathNodeView {...props} displayMode={true} />;
}
