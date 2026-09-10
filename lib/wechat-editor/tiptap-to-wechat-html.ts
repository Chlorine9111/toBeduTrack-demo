import type { Editor } from "@tiptap/core";
import type { EditorConfig } from "@/lib/wechat-editor/types";
import { processForWeChat } from "@/lib/wechat-editor/clipboard";
import { buildFullCSS } from "@/lib/wechat-editor/themes";

export function tiptapToWechatHtml(editor: Editor, config: EditorConfig, extraCss?: string) {
  const rawHtml = editor.getHTML();
  const wrappedHtml = `<div class="wechat-rendered">${rawHtml}</div>`;
  const themeCSS = buildFullCSS(config) + (extraCss ? `\n${extraCss}` : "");
  return processForWeChat(wrappedHtml, themeCSS, config.primaryColor);
}
