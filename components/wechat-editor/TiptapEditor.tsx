"use client";

import { useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { createTiptapExtensions } from "@/lib/wechat-editor/tiptap-extensions";
import { buildEditorCSS, injectThemeCSS } from "@/lib/wechat-editor/themes";
import type { EditorConfig } from "@/lib/wechat-editor/types";
import { TiptapBubbleMenu } from "@/components/wechat-editor/TiptapBubbleMenu";

interface TiptapEditorProps {
  config: EditorConfig;
  templateCss?: string | null;
  onReady: (editor: Editor | null) => void;
}

export function TiptapEditor({ config, templateCss, onReady }: TiptapEditorProps) {
  const editor = useEditor({
    extensions: createTiptapExtensions(),
    content: "",
    editorProps: {
      attributes: {
        class: "ProseMirror",
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    onReady(editor ?? null);
  }, [editor, onReady]);

  useEffect(() => {
    const baseCss = buildEditorCSS(config);
    injectThemeCSS(templateCss ? `${baseCss}\n${templateCss}` : baseCss);
  }, [config, templateCss]);

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50 p-4">
      <div className="mx-auto w-[375px] rounded-xl border border-neutral-200 bg-white shadow-xs">
        <div className="wechat-rendered">
          {editor ? <TiptapBubbleMenu editor={editor} /> : null}
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
