import type { Editor } from "@tiptap/core";
import { DEFAULT_GLOBAL_FORMAT, type GlobalFormat } from "@/lib/wechat-editor/types";

export function mergeGlobalFormat(
  current: GlobalFormat,
  patch: Partial<GlobalFormat>,
): GlobalFormat {
  return {
    ...current,
    ...patch,
    heading: {
      ...current.heading,
      ...(patch.heading || {}),
    },
    body: {
      ...current.body,
      ...(patch.body || {}),
    },
    image: {
      ...current.image,
      ...(patch.image || {}),
    },
    background: {
      ...current.background,
      ...(patch.background || {}),
    },
  };
}

export function applyGlobalFormatToEditor(editor: Editor, format: GlobalFormat) {
  const root = editor.view.dom as HTMLElement;
  root.style.setProperty("--wechat-editor-bg", format.background.color);
  root.style.paddingLeft = `${format.background.paddingX}px`;
  root.style.paddingRight = `${format.background.paddingX}px`;
  root.style.paddingTop = `${format.background.paddingY}px`;
  root.style.paddingBottom = `${format.background.paddingY}px`;

  root.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((element) => {
    const node = element as HTMLElement;
    node.style.fontFamily = format.heading.fontFamily;
    node.style.fontSize = `${format.heading.fontSize}px`;
    node.style.color = format.heading.color;
    node.style.lineHeight = `${format.heading.lineHeight}`;
    node.style.letterSpacing = `${format.heading.letterSpacing}px`;
    node.style.marginTop = `${format.heading.marginTop}px`;
    node.style.marginBottom = `${format.heading.marginBottom}px`;
    node.style.paddingLeft = `${format.heading.paddingX}px`;
    node.style.paddingRight = `${format.heading.paddingX}px`;
    node.style.textAlign = format.heading.textAlign;
  });

  root.querySelectorAll("p,li").forEach((element) => {
    const node = element as HTMLElement;
    node.style.fontFamily = format.body.fontFamily;
    node.style.fontSize = `${format.body.fontSize}px`;
    node.style.color = format.body.color;
    node.style.lineHeight = `${format.body.lineHeight}`;
    node.style.letterSpacing = `${format.body.letterSpacing}px`;
    node.style.marginTop = `${format.body.marginTop}px`;
    node.style.marginBottom = `${format.body.marginBottom}px`;
    node.style.paddingLeft = `${format.body.paddingX}px`;
    node.style.paddingRight = `${format.body.paddingX}px`;
    node.style.textAlign = format.body.textAlign;
  });

  root.querySelectorAll("img").forEach((element) => {
    const node = element as HTMLElement;
    node.style.borderRadius = `${format.image.borderRadius}px`;
    node.style.marginTop = `${format.image.margin}px`;
    node.style.marginBottom = `${format.image.margin}px`;
    node.style.marginLeft = format.image.alignment === "left" ? "0" : "auto";
    node.style.marginRight = format.image.alignment === "right" ? "0" : "auto";
    node.style.display = "block";
    node.style.boxShadow = format.image.shadow
      ? "0 6px 18px rgba(0,0,0,0.15)"
      : "none";
  });
}

export function createDefaultGlobalFormat() {
  return JSON.parse(JSON.stringify(DEFAULT_GLOBAL_FORMAT)) as GlobalFormat;
}
