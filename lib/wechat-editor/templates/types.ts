import type {
  Template,
  TemplateBlockStyle,
  TemplateBlockType,
} from "@/lib/wechat-editor/types";

function blockStyle(
  id: string,
  blockType: TemplateBlockType,
  name: string,
  templateHtml: string,
): TemplateBlockStyle {
  return {
    id,
    blockType,
    name,
    previewHtml: templateHtml,
    templateHtml,
  };
}

export function buildDefaultBlockStyles(prefix: string): TemplateBlockStyle[] {
  return [
    blockStyle(
      `${prefix}-article-title-a`,
      "article-title",
      "文章标题样式 A",
      `<section style="padding:24px 0 12px;text-align:center;"><h1 style="font-size:30px;line-height:1.35;font-weight:700;color:{{color:primary}};margin:0;">{{content}}</h1></section>`,
    ),
    blockStyle(
      `${prefix}-hero-title-a`,
      "hero-title",
      "头图标题样式 A",
      `<section style="padding:36px 20px 16px;background:{{color:primary}};border-radius:12px 12px 0 0;"><h2 style="font-size:26px;line-height:1.4;color:{{color:onPrimary}};margin:0;text-align:center;">{{content}}</h2></section>`,
    ),
    blockStyle(
      `${prefix}-hero-subtitle-a`,
      "hero-subtitle",
      "头图副标题样式 A",
      `<section style="padding:0 20px 24px;background:{{color:primary}};border-radius:0 0 12px 12px;text-align:center;"><p style="font-size:15px;color:{{color:onPrimary}};opacity:0.9;margin:0;">{{content}}</p></section>`,
    ),
    blockStyle(
      `${prefix}-intro-a`,
      "intro",
      "引言样式 A",
      `<section style="margin:16px 0;padding:14px 16px;border-radius:10px;background:{{color:lightBg}};"><p style="font-size:16px;line-height:1.85;color:{{color:text}};margin:0;">{{content}}</p></section>`,
    ),
    blockStyle(
      `${prefix}-section-title-a`,
      "section-title",
      "正文标题样式 A",
      `<section style="margin:22px 0 12px;padding-left:12px;border-left:4px solid {{color:primary}};"><h3 style="margin:0;font-size:20px;line-height:1.4;color:{{color:primary}};font-weight:700;">{{content}}</h3></section>`,
    ),
    blockStyle(
      `${prefix}-section-title-b`,
      "section-title",
      "正文标题样式 B",
      `<section style="margin:22px 0 12px;text-align:center;"><h3 style="display:inline-block;margin:0;padding:6px 14px;border-radius:999px;background:{{color:primary}};color:{{color:onPrimary}};font-size:18px;line-height:1.4;">{{content}}</h3></section>`,
    ),
    blockStyle(
      `${prefix}-section-content-a`,
      "section-content",
      "正文内容样式 A",
      `<section style="margin:10px 0;"><p style="margin:0;font-size:16px;line-height:1.85;color:{{color:text}};text-align:justify;">{{content}}</p></section>`,
    ),
    blockStyle(
      `${prefix}-section-content-b`,
      "section-content",
      "正文内容样式 B",
      `<section style="margin:12px 0;padding:12px 14px;border-radius:10px;border:1px solid {{color:border}};"><p style="margin:0;font-size:16px;line-height:1.8;color:{{color:text}};">{{content}}</p></section>`,
    ),
    blockStyle(
      `${prefix}-image-a`,
      "image",
      "图片样式 A",
      `<section style="margin:16px 0;text-align:center;"><img src="{{imageUrl}}" alt="{{caption}}" style="max-width:100%;height:auto;border-radius:10px;"/>{{captionHtml}}</section>`,
    ),
    blockStyle(
      `${prefix}-divider-a`,
      "divider",
      "分割线样式 A",
      `<section style="margin:22px 0;text-align:center;"><span style="display:inline-block;width:48px;height:3px;border-radius:999px;background:{{color:primary}};"></span></section>`,
    ),
    blockStyle(
      `${prefix}-blockquote-a`,
      "blockquote",
      "引用样式 A",
      `<section style="margin:16px 0;padding:14px 16px;border-left:4px solid {{color:accent}};background:{{color:lightBg}};border-radius:0 8px 8px 0;"><blockquote style="margin:0;font-size:15px;line-height:1.8;color:{{color:text}};font-style:italic;">{{content}}</blockquote></section>`,
    ),
  ];
}

export function createTemplate(
  input: Omit<Template, "blockStyles"> & { blockStyles?: TemplateBlockStyle[] },
): Template {
  return {
    ...input,
    blockStyles: input.blockStyles ?? buildDefaultBlockStyles(input.id),
  };
}
