import type {
  ArticleOutline,
  ColorPalette,
  OutlineBlock,
  Template,
  TemplateBlockStyle,
  TemplateBlockType,
} from "@/lib/wechat-editor/types";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toTemplateBlockType(type: OutlineBlock["type"]): TemplateBlockType {
  if (type === "image-placeholder") return "image";
  return type;
}

function pickStyle(template: Template, block: OutlineBlock): TemplateBlockStyle | null {
  const targetType = toTemplateBlockType(block.type);
  const styles = template.blockStyles.filter((item) => item.blockType === targetType);
  if (styles.length === 0) return null;
  if (block.styleId) {
    return styles.find((item) => item.id === block.styleId) ?? styles[0];
  }
  return styles[0];
}

export function renderTemplateBlock(params: {
  block: OutlineBlock;
  style: TemplateBlockStyle;
  palette: ColorPalette;
}) {
  let html = params.style.templateHtml;
  const content = escapeHtml(params.block.content || "");
  const imageUrl = escapeHtml(params.block.imageUrl || "");
  const captionHtml = content
    ? `<p style=\"font-size:13px;color:${params.palette.colors.secondary};margin-top:8px;\">${content}</p>`
    : "";

  html = html
    .replaceAll("{{content}}", content)
    .replaceAll("{{title}}", content)
    .replaceAll("{{subtitle}}", content)
    .replaceAll("{{imageUrl}}", imageUrl)
    .replaceAll("{{caption}}", content)
    .replaceAll("{{captionHtml}}", captionHtml);

  Object.entries(params.palette.colors).forEach(([key, value]) => {
    html = html.replaceAll(`{{color:${key}}}`, value);
  });

  return html;
}

export function renderOutlineWithTemplate(params: {
  outline: ArticleOutline;
  template: Template;
  palette: ColorPalette;
}) {
  const body = params.outline.blocks
    .map((block) => {
      const style = pickStyle(params.template, block);
      if (!style) {
        if (block.type === "divider") return "<hr/>";
        if (block.type === "image-placeholder" && block.imageUrl) {
          return `<figure style=\"margin:16px 0;text-align:center;\"><img src=\"${escapeHtml(block.imageUrl)}\" style=\"max-width:100%;height:auto;border-radius:8px;\"/></figure>`;
        }
        const tag = block.type.includes("title") ? "h2" : "p";
        return `<${tag}>${escapeHtml(block.content)}</${tag}>`;
      }
      return renderTemplateBlock({ block, style, palette: params.palette });
    })
    .join("\n");

  return `<article style=\"background:${params.palette.colors.background};color:${params.palette.colors.text};padding:8px 0;\">${body}</article>`;
}

export function renderOutlineForTiptap(params: {
  outline: ArticleOutline;
}): string {
  return params.outline.blocks
    .map((block) => {
      const content = escapeHtml(block.content || "");
      switch (block.type) {
        case "article-title":
          return `<h1>${content}</h1>`;
        case "hero-title":
          return `<h2>${content}</h2>`;
        case "hero-subtitle":
          return `<p>${content}</p>`;
        case "intro":
          return `<p>${content}</p>`;
        case "section-title":
          return `<h3>${content}</h3>`;
        case "section-content":
          return `<p>${content}</p>`;
        case "image-placeholder":
          return block.imageUrl
            ? `<img src="${escapeHtml(block.imageUrl)}" alt="${content}"/>`
            : "";
        case "divider":
          return "<hr/>";
        case "blockquote":
          return `<blockquote><p>${content}</p></blockquote>`;
        default:
          return `<p>${content}</p>`;
      }
    })
    .filter(Boolean)
    .join("\n");
}

export function filterTemplates(params: {
  templates: Template[];
  keyword?: string | null;
  category?: string | null;
  colorFamily?: string | null;
  hasHero?: "all" | "yes" | "no";
}) {
  const keyword = (params.keyword || "").trim().toLowerCase();
  const category = (params.category || "").trim();

  return params.templates.filter((template) => {
    if (params.hasHero === "yes" && !template.hasHeroImage) return false;
    if (params.hasHero === "no" && template.hasHeroImage) return false;
    if (params.colorFamily && params.colorFamily !== "all" && template.colorFamily !== params.colorFamily) {
      return false;
    }
    if (category && category !== "全部" && !template.categories.includes(category)) {
      return false;
    }
    if (!keyword) return true;

    const haystack = `${template.name} ${template.categories.join(" ")}`.toLowerCase();
    return haystack.includes(keyword);
  });
}
