"use client";

import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";

interface TiptapBubbleMenuProps {
  editor: Editor;
}

export function TiptapBubbleMenu({ editor }: TiptapBubbleMenuProps) {
  return (
    <BubbleMenu
      editor={editor}
      className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1 shadow-sm"
    >
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className="rounded px-2 py-1 text-xs hover:bg-neutral-100"
      >
        B
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className="rounded px-2 py-1 text-xs italic hover:bg-neutral-100"
      >
        I
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className="rounded px-2 py-1 text-xs underline hover:bg-neutral-100"
      >
        U
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        className="rounded px-2 py-1 text-xs hover:bg-neutral-100"
      >
        高亮
      </button>
    </BubbleMenu>
  );
}
