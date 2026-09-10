import type { AnyExtension } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { common, createLowlight } from "lowlight";
import { Markdown } from "tiptap-markdown";
import StarterKit from "@tiptap/starter-kit";

const lowlight = createLowlight(common);

export function createTiptapExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
    }),
    Image.configure({
      inline: false,
      allowBase64: true,
      HTMLAttributes: {
        class: "image",
      },
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: {
        class: "link",
        rel: "noopener noreferrer",
        target: "_blank",
      },
    }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    TextStyle,
    Color.configure({
      types: [TextStyle.name],
    }),
    Highlight.configure({ multicolor: true }),
    Underline,
    FontFamily,
    Placeholder.configure({
      placeholder: "开始编辑你的公众号文章...",
    }),
    CharacterCount,
    CodeBlockLowlight.configure({ lowlight }),
    Markdown,
  ];
}
