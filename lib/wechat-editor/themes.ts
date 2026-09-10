import type { ColorPalette, EditorConfig, Template, TemplateBlockType, ThemeName } from "@/lib/wechat-editor/types";

const BASE_THEME_CSS = `
#wechat-output {
  max-width: 375px;
  margin: 0 auto;
  padding: 20px 16px;
  background: #fff;
  font-size: var(--wechat-font-size, 16px);
  line-height: 1.75;
  color: #333;
  word-break: break-word;
  overflow-wrap: break-word;
  font-family: var(--wechat-font-family, 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif);
}
#wechat-output * { max-width: 100% !important; box-sizing: border-box; }
#wechat-output .h1,#wechat-output .h2,#wechat-output .h3,#wechat-output .h4,#wechat-output .h5,#wechat-output .h6,
#wechat-output h1,#wechat-output h2,#wechat-output h3,#wechat-output h4,#wechat-output h5,#wechat-output h6 {
  margin: 1.25em 0 0.75em;
  line-height: 1.4;
  font-weight: 700;
}
#wechat-output .h1,#wechat-output h1 { font-size: 1.7em; margin-top: 0.4em; }
#wechat-output .h2,#wechat-output h2 { font-size: 1.35em; }
#wechat-output .h3,#wechat-output h3 { font-size: 1.16em; }
#wechat-output .p,#wechat-output .list-item,
#wechat-output p,#wechat-output li {
  margin: 0.8em 0;
  text-align: var(--wechat-paragraph-align, left);
  text-indent: var(--wechat-paragraph-indent, 0);
}
#wechat-output .blockquote,#wechat-output blockquote {
  margin: 1em 0;
  padding: 0.75em 1em;
  border-left: 4px solid var(--wechat-primary-color, #FF5B5B);
  background: rgba(24, 144, 255, 0.07);
  color: #4a5568;
}
#wechat-output .code-inline,
#wechat-output :not(pre) > code {
  padding: 0.1em 0.4em;
  border-radius: 4px;
  background: #f4f4f4;
  font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
  font-size: 0.9em;
}
#wechat-output .pre,#wechat-output pre {
  margin: 1em 0;
  border-radius: 10px;
  overflow: hidden;
  background: #1f2937;
}
#wechat-output .code,#wechat-output pre code {
  display: block;
  padding: 14px;
  overflow-x: auto;
  color: #f8fafc;
  font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.55;
}
#wechat-output .line-number {
  display: inline-block;
  width: 2.2em;
  margin-right: 0.6em;
  user-select: none;
  color: rgba(248, 250, 252, 0.55);
}
#wechat-output .mac-code-header {
  height: 30px;
  background: #111827;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
}
#wechat-output .mac-dot {
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  display: inline-block;
}
#wechat-output .mac-dot.red { background: #ff5f56; }
#wechat-output .mac-dot.yellow { background: #ffbd2e; }
#wechat-output .mac-dot.green { background: #27c93f; }
#wechat-output .image,#wechat-output img { display: block; width: 100%; height: auto; border-radius: 8px; }
#wechat-output .figure,#wechat-output figure { margin: 1em 0; }
#wechat-output .figcaption,#wechat-output figcaption {
  margin-top: 0.5em;
  text-align: center;
  color: #64748b;
  font-size: 0.88em;
}
#wechat-output .link,#wechat-output a {
  color: var(--wechat-primary-color, #FF5B5B);
  text-decoration: underline;
}
#wechat-output .ul,#wechat-output .ol,
#wechat-output ul,#wechat-output ol { margin: 0.8em 0; padding-left: 1.4em; }
#wechat-output .table-wrap { margin: 1em 0; overflow-x: auto; }
#wechat-output .table,#wechat-output table { width: 100%; border-collapse: collapse; border-spacing: 0; font-size: 0.94em; }
#wechat-output .th,#wechat-output .td,
#wechat-output th,#wechat-output td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
#wechat-output .th,#wechat-output th { background: #f8fafc; font-weight: 600; }
#wechat-output .hr,#wechat-output hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.4em 0; }
#wechat-output .markup-highlight { background: linear-gradient(transparent 60%, rgba(250, 204, 21, 0.45) 0); }
#wechat-output .markup-underline {
  text-decoration: underline;
  text-decoration-color: var(--wechat-primary-color, #FF5B5B);
  text-decoration-thickness: 2px;
}
#wechat-output .citation-sup,#wechat-output .footnote-ref {
  margin-left: 2px;
  color: var(--wechat-primary-color, #FF5B5B);
  font-size: 0.78em;
  vertical-align: super;
}
#wechat-output .reference-title,#wechat-output .footnotes-title {
  margin-top: 1.5em;
  margin-bottom: 0.6em;
  font-weight: 700;
  font-size: 1.04em;
}
#wechat-output .reference-list,#wechat-output .footnotes-list {
  margin: 0;
  padding-left: 1.2em;
  color: #4b5563;
  font-size: 0.92em;
}
`;

const DEFAULT_THEME_CSS = `
#wechat-output .h2,#wechat-output .h3,
#wechat-output h2,#wechat-output h3 { position: relative; padding-left: 0.55em; }
#wechat-output .h2::before,#wechat-output .h3::before,
#wechat-output h2::before,#wechat-output h3::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.22em;
  bottom: 0.22em;
  width: 3px;
  border-radius: 9999px;
  background: var(--wechat-primary-color, #FF5B5B);
}
#wechat-output .blockquote,#wechat-output blockquote { border-radius: 0 8px 8px 0; }
`;

const GRACE_THEME_CSS = `
#wechat-output { color: #2d3748; }
#wechat-output .h1,#wechat-output h1 {
  text-align: center;
  font-size: 1.84em;
  margin-top: 0.6em;
  margin-bottom: 0.9em;
}
#wechat-output .h2,#wechat-output h2 {
  border-bottom: 1px dashed rgba(24, 144, 255, 0.32);
  padding-bottom: 0.35em;
}
#wechat-output .p,#wechat-output p { line-height: 1.85; }
#wechat-output .blockquote,#wechat-output blockquote {
  background: rgba(24, 144, 255, 0.08);
  border-left-width: 3px;
  border-radius: 6px;
}
#wechat-output .figcaption,#wechat-output figcaption { color: #718096; font-style: italic; }
`;

const SIMPLE_THEME_CSS = `
#wechat-output { padding: 16px 14px; color: #1f2937; }
#wechat-output .h1,#wechat-output .h2,#wechat-output .h3,#wechat-output .h4,#wechat-output .h5,#wechat-output .h6,
#wechat-output h1,#wechat-output h2,#wechat-output h3,#wechat-output h4,#wechat-output h5,#wechat-output h6 {
  margin: 1em 0 0.55em;
}
#wechat-output .h2,#wechat-output .h3,
#wechat-output h2,#wechat-output h3 { padding-left: 0; }
#wechat-output .h2::before,#wechat-output .h3::before,
#wechat-output h2::before,#wechat-output h3::before { display: none; }
#wechat-output .blockquote,#wechat-output blockquote { background: #f8fafc; border-left-width: 2px; }
#wechat-output .table .th,#wechat-output .table .td,
#wechat-output table th,#wechat-output table td { padding: 6px 8px; }
`;

export function generateCSSVariables(config: {
  primaryColor: string;
  fontFamily: string;
  fontSize: string;
  isUseIndent: boolean;
  isUseJustify: boolean;
}) {
  const paragraphIndent = config.isUseIndent ? "2em" : "0";
  const paragraphAlign = config.isUseJustify ? "justify" : "left";

  return `
:root {
  --wechat-primary-color: ${config.primaryColor};
  --wechat-font-family: ${config.fontFamily};
  --wechat-font-size: ${config.fontSize};
  --wechat-paragraph-indent: ${paragraphIndent};
  --wechat-paragraph-align: ${paragraphAlign};
}
`;
}

export function getThemeCSS(theme: ThemeName) {
  if (theme === "grace") return GRACE_THEME_CSS;
  if (theme === "simple") return SIMPLE_THEME_CSS;
  return DEFAULT_THEME_CSS;
}

export function buildFullCSS(config: EditorConfig) {
  return [
    generateCSSVariables({
      primaryColor: config.primaryColor,
      fontFamily: config.fontFamily,
      fontSize: config.fontSize,
      isUseIndent: config.isUseIndent,
      isUseJustify: config.isUseJustify,
    }),
    BASE_THEME_CSS,
    getThemeCSS(config.theme),
  ].join("\n");
}

export function buildEditorCSS(config: EditorConfig) {
  const variables = generateCSSVariables({
    primaryColor: config.primaryColor,
    fontFamily: config.fontFamily,
    fontSize: config.fontSize,
    isUseIndent: config.isUseIndent,
    isUseJustify: config.isUseJustify,
  });

  const base = `
.wechat-rendered {
  max-width: 375px;
  margin: 0 auto;
  padding: 20px 16px;
  background: #fff;
  font-size: var(--wechat-font-size, 16px);
  line-height: 1.75;
  color: #333;
  word-break: break-word;
  overflow-wrap: break-word;
  font-family: var(--wechat-font-family, 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif);
}
.wechat-rendered * { max-width: 100%; box-sizing: border-box; }
.wechat-rendered .ProseMirror { min-height: 500px; outline: none; }
.wechat-rendered .ProseMirror p { margin: 0.8em 0; text-align: var(--wechat-paragraph-align, left); text-indent: var(--wechat-paragraph-indent, 0); }
.wechat-rendered .ProseMirror h1,.wechat-rendered .ProseMirror h2,.wechat-rendered .ProseMirror h3,.wechat-rendered .ProseMirror h4,.wechat-rendered .ProseMirror h5,.wechat-rendered .ProseMirror h6 { margin: 1.25em 0 0.75em; line-height: 1.4; font-weight: 700; }
.wechat-rendered .ProseMirror h1 { font-size: 1.7em; margin-top: 0.4em; }
.wechat-rendered .ProseMirror h2 { font-size: 1.35em; }
.wechat-rendered .ProseMirror h3 { font-size: 1.16em; }
.wechat-rendered .ProseMirror blockquote { margin: 1em 0; padding: 0.75em 1em; border-left: 4px solid var(--wechat-primary-color, #FF5B5B); background: rgba(255, 91, 91, 0.08); color: #4a5568; }
.wechat-rendered .ProseMirror code { padding: 0.1em 0.3em; border-radius: 4px; background: #f4f4f4; font-size: 0.92em; }
.wechat-rendered .ProseMirror pre { margin: 1em 0; border-radius: 10px; overflow: auto; background: #1f2937; color: #f8fafc; padding: 14px; }
.wechat-rendered .ProseMirror pre code { padding: 0; background: transparent; color: inherit; }
.wechat-rendered .ProseMirror img { display: block; width: 100%; height: auto; border-radius: 8px; }
.wechat-rendered .ProseMirror a { color: var(--wechat-primary-color, #FF5B5B); text-decoration: underline; }
.wechat-rendered .ProseMirror ul,.wechat-rendered .ProseMirror ol { margin: 0.8em 0; padding-left: 1.4em; }
.wechat-rendered .ProseMirror hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.4em 0; }
.wechat-rendered .ProseMirror p.is-editor-empty:first-child::before { color: #adb5bd; content: attr(data-placeholder); float: left; height: 0; pointer-events: none; text-indent: 0; }
`;

  const theme = config.theme === "grace"
    ? `.wechat-rendered .ProseMirror h1 { text-align: center; font-size: 1.84em; margin-top: 0.6em; margin-bottom: 0.9em; }
.wechat-rendered .ProseMirror h2 { border-bottom: 1px dashed rgba(24, 144, 255, 0.32); padding-bottom: 0.35em; }
.wechat-rendered .ProseMirror p { line-height: 1.85; }
.wechat-rendered .ProseMirror blockquote { border-left-width: 3px; border-radius: 6px; }`
    : config.theme === "simple"
      ? `.wechat-rendered { padding: 16px 14px; color: #1f2937; }
.wechat-rendered .ProseMirror h1,.wechat-rendered .ProseMirror h2,.wechat-rendered .ProseMirror h3 { margin: 1em 0 0.55em; }
.wechat-rendered .ProseMirror blockquote { background: #f8fafc; border-left-width: 2px; }`
      : `.wechat-rendered .ProseMirror h2,.wechat-rendered .ProseMirror h3 { position: relative; padding-left: 0.55em; }
.wechat-rendered .ProseMirror h2::before,.wechat-rendered .ProseMirror h3::before { content: ""; position: absolute; left: 0; top: 0.22em; bottom: 0.22em; width: 3px; border-radius: 9999px; background: var(--wechat-primary-color, #FF5B5B); }
.wechat-rendered .ProseMirror blockquote { border-radius: 0 8px 8px 0; }`;

  return [variables, base, theme].join("\n");
}

export function injectThemeCSS(css: string) {
  if (typeof document === "undefined") return;

  const styleId = "wechat-theme";
  let styleElement = document.getElementById(styleId) as HTMLStyleElement | null;

  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = styleId;
    document.head.appendChild(styleElement);
  }

  styleElement.textContent = css;
}

/* ---------- 模板 CSS 生成 ---------- */

function parseStyleString(style: string): Record<string, string> {
  const result: Record<string, string> = {};
  style.split(";").forEach((pair) => {
    const colonIndex = pair.indexOf(":");
    if (colonIndex === -1) return;
    const key = pair.slice(0, colonIndex).trim();
    const value = pair.slice(colonIndex + 1).trim();
    if (key && value) result[key] = value;
  });
  return result;
}

function stylesToCssString(styles: Record<string, string>): string {
  return Object.entries(styles)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");
}

function extractTemplateBlockStyles(
  templateHtml: string,
  palette: ColorPalette,
): Record<string, string> {
  if (typeof document === "undefined") return {};

  let html = templateHtml;
  Object.entries(palette.colors).forEach(([key, value]) => {
    html = html.replaceAll(`{{color:${key}}}`, value);
  });
  html = html.replace(/\{\{[^}]+\}\}/g, "");

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.querySelector("div");
  const inner = root?.querySelector("h1,h2,h3,h4,h5,h6,p,blockquote");
  if (!inner) return {};

  // 从 inner 向上遍历到 root，收集路径上所有元素的 inline style
  const chain: Element[] = [];
  let current: Element | null = inner;
  while (current && current !== root) {
    chain.unshift(current);
    current = current.parentElement;
  }

  const merged: Record<string, string> = {};
  for (const el of chain) {
    const styles = parseStyleString(el.getAttribute("style") || "");
    Object.entries(styles).forEach(([key, value]) => {
      // 最外层的 margin:0 不覆盖外部 wrapper 的 margin
      if (el === inner && key === "margin" && value === "0") return;
      merged[key] = value;
    });
  }

  return merged;
}

// intro 和 hero-subtitle 都渲染为 <p>，与 section-content 共用选择器。
// Tiptap 的 Paragraph 节点不支持自定义 class，因此无法在 CSS 中区分。
// BLOCK_TYPE_PRIORITY 的顺序确保 section-content（主要正文）的样式最终覆盖 intro/hero-subtitle。
const BLOCK_TYPE_TO_SELECTOR: Partial<Record<TemplateBlockType, string>> = {
  "article-title": "h1",
  "hero-title": "h2",
  "hero-subtitle": "p",
  intro: "p",
  "section-title": "h3",
  "section-content": "p",
  blockquote: "blockquote",
  divider: "hr",
};

const BLOCK_TYPE_PRIORITY: TemplateBlockType[] = [
  "intro",
  "hero-subtitle",
  "section-content",
  "article-title",
  "hero-title",
  "section-title",
  "blockquote",
  "divider",
];

export function buildTemplateCss(
  template: Template,
  palette: ColorPalette,
  prefix: string = ".wechat-rendered .ProseMirror",
): string {
  if (typeof document === "undefined") return "";

  const selectorCss: Record<string, string> = {};

  for (const blockType of BLOCK_TYPE_PRIORITY) {
    const blockStyle = template.blockStyles.find((s) => s.blockType === blockType);
    if (!blockStyle) continue;

    const selector = BLOCK_TYPE_TO_SELECTOR[blockType];
    if (!selector) continue;

    const styles = extractTemplateBlockStyles(blockStyle.templateHtml, palette);
    const css = stylesToCssString(styles);
    if (css) {
      selectorCss[selector] = css;
    }
  }

  const wrapperPrefix =
    prefix === ".wechat-rendered .ProseMirror" ? ".wechat-rendered" : prefix;

  const rules: string[] = [
    `${wrapperPrefix} { background: ${palette.colors.background}; color: ${palette.colors.text}; }`,
  ];

  Object.entries(selectorCss).forEach(([selector, css]) => {
    rules.push(`${prefix} ${selector} { ${css} }`);
  });

  return rules.join("\n");
}
