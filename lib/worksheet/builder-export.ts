import { extractArticleBodyHtml } from "@/lib/doc-engine/document-article-html";

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTags(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, ""));
}

function convertLists(html: string) {
  return html
    .replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_, content: string) => {
      const items = Array.from(content.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)).map(
        (match, index) => `${index + 1}. ${stripTags(match[1]).trim()}`,
      );
      return `\n${items.join("\n")}\n`;
    })
    .replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_, content: string) => {
      const items = Array.from(content.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)).map(
        (match) => `- ${stripTags(match[1]).trim()}`,
      );
      return `\n${items.join("\n")}\n`;
    });
}

function convertImages(html: string) {
  return html.replace(
    /<img\b[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi,
    (_match, src: string, alt: string) => `![${decodeEntities(alt)}](${src})`,
  );
}

function convertTables(html: string) {
  return html.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_, content: string) => {
    const rows = Array.from(content.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map(
      (rowMatch) =>
        Array.from(rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(
          (cellMatch) => stripTags(cellMatch[1]).trim(),
        ),
    );

    if (rows.length === 0) return "";
    const header = rows[0];
    const divider = header.map(() => "---");
    const body = rows.slice(1);

    return `\n| ${header.join(" | ")} |\n| ${divider.join(" | ")} |\n${body
      .map((cells) => `| ${cells.join(" | ")} |`)
      .join("\n")}\n`;
  });
}

export function documentHtmlToMarkdown(html: string) {
  let markdown = extractArticleBodyHtml(html);

  markdown = convertImages(markdown);
  markdown = convertTables(markdown);
  markdown = convertLists(markdown);

  markdown = markdown
    .replace(/<hr\b[^>]*data-page-break="true"[^>]*>/gi, "\n\n---\n\n")
    .replace(/<hr\b[^>]*>/gi, "\n\n---\n\n")
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content: string) => {
      const text = normalizeWhitespace(stripTags(content));
      return text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    })
    .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, (_, content: string) => `# ${stripTags(content).trim()}\n\n`)
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, (_, content: string) => `## ${stripTags(content).trim()}\n\n`)
    .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, (_, content: string) => `### ${stripTags(content).trim()}\n\n`)
    .replace(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi, (_, content: string) => `#### ${stripTags(content).trim()}\n\n`)
    .replace(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi, (_, content: string) => `**${stripTags(content).trim()}**`)
    .replace(/<em\b[^>]*>([\s\S]*?)<\/em>/gi, (_, content: string) => `*${stripTags(content).trim()}*`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<p\b[^>]*>/gi, "")
    .replace(/<\/section>/gi, "\n\n")
    .replace(/<section\b[^>]*>/gi, "")
    .replace(/<\/div>/gi, "\n\n")
    .replace(/<div\b[^>]*>/gi, "")
    .replace(/<article\b[^>]*>/gi, "")
    .replace(/<\/article>/gi, "");

  return normalizeWhitespace(stripTags(markdown));
}
