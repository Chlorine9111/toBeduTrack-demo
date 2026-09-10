"use client";

import type { Editor } from "@tiptap/core";

interface TiptapToolbarProps {
  editor: Editor | null;
}

export function TiptapToolbar({ editor }: TiptapToolbarProps) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-neutral-200 bg-white px-3 py-2">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50">加粗</button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50">斜体</button>
      <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50">下划线</button>
      <button type="button" onClick={() => editor.chain().focus().toggleHighlight().run()} className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50">高亮</button>
      <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50">引用</button>
      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50">列表</button>
      <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50">分隔线</button>
      <select
        className="h-7 rounded border border-neutral-200 px-1 text-xs"
        defaultValue="0"
        onChange={(event) => {
          const level = Number(event.target.value);
          if (level === 0) {
            editor.chain().focus().setParagraph().run();
            return;
          }
          editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run();
        }}
      >
        <option value="0">正文</option>
        <option value="1">H1</option>
        <option value="2">H2</option>
        <option value="3">H3</option>
      </select>
      <input
        type="color"
        className="h-7 w-8 rounded border border-neutral-200"
        onChange={(event) => {
          editor.chain().focus().setColor(event.target.value).run();
        }}
        aria-label="文字颜色"
      />
    </div>
  );
}
