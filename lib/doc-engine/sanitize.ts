import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "a", "article", "section", "div", "header", "footer",
  "h1", "h2", "h3", "h4",
  "p", "span", "strong", "em", "u", "sub", "sup", "br", "del",
  "ol", "ul", "li",
  "pre", "code",
  "table", "thead", "tbody", "tr", "th", "td",
  "blockquote", "hr", "img", "figure", "figcaption",
  "math-inline", "math-display",
];

const ALLOWED_ATTR = [
  "data-doc-type", "data-section",
  "data-answer-space", "data-question", "data-points", "data-difficulty",
  "data-instance-id", "data-source-exercise-id", "data-question-type",
  "data-options", "data-rubric", "data-page-break",
  "data-latex",
  "class", "href", "target", "rel",
  "type",
  "src", "alt",
  "colspan", "rowspan",
];

export function sanitizeDocHtml(dirty: string): string {
  if (typeof window === "undefined") return dirty;
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    KEEP_CONTENT: true,
  });
}

export function extractArticleHtml(raw: string): string {
  const match = raw.match(/<article[\s\S]*<\/article>/i);
  return match ? match[0] : raw;
}

export { ALLOWED_TAGS, ALLOWED_ATTR };
